'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const atomicJSON = require('../Beocreate2/beo-system/atomic-json-file');
const model = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const routingService = require('../Beocreate2/beo-extensions/signal-flow/routing-service');

let passed = 0;
let failed = 0;
function test(name, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-routing-' + name.replace(/\\W/g, '-') + '-'));
  try { fn(root); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
  finally { fs.rmSync(root, {recursive: true, force: true}); }
}
function service(root, options) {
  return routingService.createService(Object.assign({dataDirectory: root}, options));
}
function validDesign() {
  const configuration = model.defaultConfiguration();
  Object.assign(configuration.outputs[0], {enabled: true, role: 'woofer', side: 'left', label: 'Left woofer'});
  configuration.connections.push({source: 'left', destination: 'output-a', enabled: true});
  return configuration;
}

test('first startup returns an unsaved conservative design', function (root) {
  const state = service(root).state({simulated: true, connected: true});
  assert.strictEqual(state.hasSavedConfiguration, false);
  assert.strictEqual(state.revision, null);
  assert.strictEqual(state.runtime.deploymentStatus, 'not-deployed');
  assert.strictEqual(fs.existsSync(path.join(root, 'signal-flow.json')), false);
});

test('saves atomically, reads back and repeats deterministically', function (root) {
  const current = service(root);
  const first = current.save(validDesign(), null);
  assert.strictEqual(first.verified, true);
  assert.strictEqual(current.state({}).revision, first.revision);
  const second = current.save(first.configuration, first.revision);
  assert.strictEqual(second.revision, first.revision);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(current.target)), first.configuration);
});

test('saves routing and crossover together with derived response verification', function (root) {
  const current = service(root);
  const design = validDesign();
  Object.assign(design.crossover.outputs[0].highPass, {
    enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 80
  });
  Object.assign(design.crossover.outputs[0].lowPass, {
    enabled: true, family: 'butterworth', slopeDbPerOctave: 18, cutoffHz: 2500
  });
  const saved = current.save(design, null);
  const persisted = JSON.parse(fs.readFileSync(current.target));
  assert.deepStrictEqual(persisted.crossover, saved.configuration.crossover);
  assert.strictEqual(JSON.stringify(persisted).includes('b0'), false);
  const preview = current.crossoverPreview(saved.configuration, 'output-a');
  assert.strictEqual(preview.response.points.length, 121);
  assert.strictEqual(preview.deploymentStatus, 'not-deployed');
});

test('copies and resets crossover settings in a draft without writing', function (root) {
  const current = service(root);
  const design = validDesign();
  design.crossover.outputs[0].lowPass.enabled = true;
  design.crossover.outputs[0].lowPass.cutoffHz = 1800;
  const copied = current.copyCrossover(design, 'output-a', 'output-b');
  assert.deepStrictEqual(copied.configuration.crossover.outputs[1].lowPass, copied.configuration.crossover.outputs[0].lowPass);
  assert.strictEqual(fs.existsSync(current.target), false);
  const reset = current.resetCrossover(copied.configuration, 'output-b');
  assert.strictEqual(reset.configuration.crossover.outputs[1].lowPass.enabled, false);
  assert.strictEqual(reset.configuration.crossover.outputs[0].lowPass.enabled, true);
});

test('copies, resets and persists channel processing without deploying it', function (root) {
  const current = service(root);
  const design = validDesign();
  Object.assign(design.channelProcessing.outputs[0], {
    gain: {valueDb: -2.5}, delay: {valueMs: 0.42}, polarity: {inverted: true}
  });
  const copied = current.copyProcessing(design, 'output-a', 'output-b');
  assert.deepStrictEqual(copied.configuration.channelProcessing.outputs[1], Object.assign(
    {}, copied.configuration.channelProcessing.outputs[0], {outputId: 'output-b'}
  ));
  assert.strictEqual(fs.existsSync(current.target), false);
  const reset = current.resetProcessing(copied.configuration, 'output-b');
  assert.deepStrictEqual(reset.configuration.channelProcessing.outputs[1], model.processingModel.defaultConfiguration(['output-b']).outputs[0]);
  const saved = current.save(copied.configuration, null);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(current.target)).channelProcessing, saved.configuration.channelProcessing);
  assert.strictEqual(saved.configuration.channelProcessing.outputs[0].delay.valueMs, 0.42);
});

test('supports data paths containing spaces', function (root) {
  const spaced = path.join(root, 'routing state with spaces');
  fs.mkdirSync(spaced);
  const saved = service(spaced).save(validDesign(), null);
  assert.strictEqual(saved.verified, true);
});

test('rejects invalid drafts without modifying saved state', function (root) {
  const current = service(root);
  const saved = current.save(validDesign(), null);
  const invalid = model.clone(saved.configuration);
  invalid.connections[0].source = 'missing';
  assert.throws(function () { current.save(invalid, saved.revision); }, function (error) {
    return error.code === 'VALIDATION_FAILED';
  });
  assert.strictEqual(current.state({}).revision, saved.revision);
});

test('preserves previous state after an atomic write failure', function (root) {
  const current = service(root);
  const saved = current.save(validDesign(), null);
  const failing = service(root, {atomicWriter: {writeJSONAtomic: function () {
    const error = new Error('controlled failure');
    error.code = 'EIO';
    throw error;
  }}});
  const changed = model.clone(saved.configuration);
  changed.outputs[0].label = 'Changed';
  assert.throws(function () { failing.save(changed, saved.revision); });
  assert.strictEqual(current.state({}).configuration.outputs[0].label, 'Left woofer');
});

test('rolls back when readback verification fails', function (root) {
  const current = service(root);
  const saved = current.save(validDesign(), null);
  let writes = 0;
  const corruptingWriter = {
    writeJSONAtomic: function (target, value) {
      writes++;
      atomicJSON.writeJSONAtomic(target, value);
      if (writes === 1) fs.writeFileSync(target, '{bad');
    }
  };
  const changed = model.clone(saved.configuration);
  changed.outputs[0].label = 'Changed';
  assert.throws(function () { service(root, {atomicWriter: corruptingWriter}).save(changed, saved.revision); });
  assert.strictEqual(current.state({}).configuration.outputs[0].label, 'Left woofer');
});

test('reports malformed saved configuration without overwriting it', function (root) {
  fs.writeFileSync(path.join(root, 'signal-flow.json'), '{bad');
  const current = service(root);
  const state = current.state({});
  assert.strictEqual(state.hasSavedConfiguration, false);
  assert.strictEqual(state.loadError.code, 'MALFORMED_SAVED_CONFIGURATION');
  assert.strictEqual(fs.readFileSync(current.target, 'utf8'), '{bad');
});

test('explicit reset recovers a malformed saved configuration', function (root) {
  fs.writeFileSync(path.join(root, 'signal-flow.json'), '{bad');
  const current = service(root);
  const reset = current.reset(null);
  assert.strictEqual(reset.verified, true);
  assert.strictEqual(current.state({}).loadError, null);
  assert.ok(reset.configuration.outputs.every(function (output) { return !output.enabled; }));
});

test('rejects revision conflicts and retains the user draft', function (root) {
  const current = service(root);
  const initial = current.save(validDesign(), null);
  const newer = model.clone(initial.configuration);
  newer.outputs[0].label = 'Newer server value';
  const savedNewer = current.save(newer, initial.revision);
  const stale = model.clone(initial.configuration);
  stale.outputs[0].label = 'Stale browser draft';
  assert.throws(function () { current.save(stale, initial.revision); }, function (error) {
    return error.code === 'REVISION_CONFLICT' && error.details.currentRevision === savedNewer.revision;
  });
  assert.strictEqual(current.state({}).configuration.outputs[0].label, 'Newer server value');
  assert.strictEqual(stale.outputs[0].label, 'Stale browser draft');
});

test('rejects saves while configuration restore owns persistence', function (root) {
  const current = service(root, {
    settingsCoordinator: {isRestoreInProgress: function () { return true; }}
  });
  assert.throws(function () { current.save(validDesign(), null); }, function (error) {
    return error.code === 'RESTORE_IN_PROGRESS';
  });
  assert.strictEqual(fs.existsSync(current.target), false);
});

test('reset persists and verifies the conservative default', function (root) {
  const current = service(root);
  const saved = current.save(validDesign(), null);
  const reset = current.reset(saved.revision);
  assert.strictEqual(reset.verified, true);
  assert.ok(reset.configuration.outputs.every(function (output) { return !output.enabled; }));
  assert.deepStrictEqual(reset.configuration.connections, []);
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
