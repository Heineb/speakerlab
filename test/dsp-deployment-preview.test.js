'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const serviceModule = require('../Beocreate2/beo-extensions/signal-flow/routing-service');
const controllerModule = require('../Beocreate2/beo-extensions/signal-flow/routing-controller');
const simulatorModule = require('../Beocreate2/beo-extensions/signal-flow/dsp-plan-simulator');

let passed = 0;
let failed = 0;
function test(name, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-deployment-preview-'));
  try { fn(root); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
  finally { fs.rmSync(root, {recursive: true, force: true}); }
}
function design() {
  const result = routing.defaultConfiguration();
  result.outputs.forEach(function (output, index) {
    Object.assign(output, {enabled: true, role: index % 2 ? 'tweeter' : 'woofer', side: index < 2 ? 'left' : 'right'});
    result.connections.push({source: index < 2 ? 'left' : 'right', destination: output.id, enabled: true});
    Object.assign(index % 2 ? result.crossover.outputs[index].highPass : result.crossover.outputs[index].lowPass, {
      enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2000
    });
  });
  return result;
}
function fixture(root, simulated) {
  const simulator = simulatorModule.createSimulator({connected: true});
  const service = serviceModule.createService({dataDirectory: root, planSimulator: simulator});
  const runtime = {simulated: simulated !== false, connected: true};
  const saved = service.save(design(), null);
  return {service, simulator, runtime, saved};
}

test('service compiles, applies, reads and compares without physical transport', function (root) {
  const current = fixture(root);
  const prepared = current.service.prepareForDSP(current.saved.revision, current.runtime);
  assert.strictEqual(prepared.compilation.status, 'prepared');
  assert.strictEqual(prepared.physicalDeploymentAllowed, false);
  assert.strictEqual(current.service.applyToSimulator(current.saved.revision, current.runtime).application.applied, true);
  assert.strictEqual(current.service.readSimulator(current.saved.revision, current.runtime).readback.status, 'read-back');
  assert.strictEqual(current.service.compareSimulator(current.saved.revision, current.runtime).comparison.status, 'matched');
  assert.strictEqual(current.service.clearSimulator(current.runtime).simulator.hasAppliedPlan, false);
});

test('production-like runtime remains preview-only and blocks preparation identity', function (root) {
  const current = fixture(root, false);
  const prepared = current.service.prepareForDSP(current.saved.revision, current.runtime);
  assert.strictEqual(prepared.identity.status, 'metadata-unavailable');
  assert.strictEqual(prepared.compilation.status, 'unsupported');
  assert.throws(function () { current.service.applyToSimulator(current.saved.revision, current.runtime); }, function (error) {
    return error.code === 'SIMULATOR_REQUIRED';
  });
});

test('compatible physical target identity can be previewed but never simulator-applied', function (root) {
  const current = fixture(root, false);
  current.runtime.programIdentity = {
    programID: 'beocreate-universal',
    profileVersion: 10,
    checksum: '40FB6C92F57ABB70177CE053C73F54DC',
    metadataAvailable: true
  };
  const prepared = current.service.prepareForDSP(current.saved.revision, current.runtime);
  assert.strictEqual(prepared.identity.status, 'known-compatible');
  assert.strictEqual(prepared.compilation.status, 'prepared');
  assert.strictEqual(prepared.previewOnly, true);
  assert.strictEqual(prepared.physicalDeploymentAllowed, false);
  assert.throws(function () { current.service.applyToSimulator(current.saved.revision, current.runtime); }, function (error) {
    return error.code === 'SIMULATOR_REQUIRED';
  });
});

test('saved design changes make an earlier compilation stale and block application', function (root) {
  const current = fixture(root);
  current.service.prepareForDSP(current.saved.revision, current.runtime);
  const changed = design();
  changed.channelProcessing.outputs[0].gain.valueDb = -3;
  const newer = current.service.save(changed, current.saved.revision);
  assert.strictEqual(current.service.state(current.runtime).deployment.stale, true);
  assert.throws(function () { current.service.applyToSimulator(current.saved.revision, current.runtime); }, function (error) {
    return error.code === 'STALE_COMPILATION';
  });
  assert.notStrictEqual(newer.revision, current.saved.revision);
});

test('WebSocket-style controller exposes named deployment actions and no raw write', function (root) {
  const current = fixture(root);
  const sent = [];
  const controller = controllerModule.createController({
    service: current.service,
    runtime: function () { return current.runtime; },
    send: function (header, content) { sent.push({header, content}); }
  });
  controller.handle({header: 'prepareForDSP', content: {revision: current.saved.revision}});
  controller.handle({header: 'applyToSimulator', content: {revision: current.saved.revision}});
  controller.handle({header: 'readSimulator', content: {revision: current.saved.revision}});
  controller.handle({header: 'compareSimulator', content: {revision: current.saved.revision}});
  controller.handle({header: 'clearSimulator', content: {revision: current.saved.revision}});
  assert.deepStrictEqual(sent.map(function (item) { return item.content.action; }), ['compile', 'apply', 'readback', 'compare', 'clear']);
  assert.ok(sent.every(function (item) { return item.header === 'deploymentResult'; }));
  assert.strictEqual(controller.handle({header: 'writeDSP', content: {address: 1, value: 1}}), false);
});

test('simulated mismatch scenario remains constrained to a compiled operation', function (root) {
  const current = fixture(root);
  const prepared = current.service.prepareForDSP(current.saved.revision, current.runtime);
  current.service.applyToSimulator(current.saved.revision, current.runtime);
  const gain = prepared.compilation.operations.find(function (item) { return item.group === 'gain'; });
  current.service.setSimulationScenario({type: 'mismatch', operationIndex: gain.index, delta: 0.1}, current.runtime);
  current.service.readSimulator(current.saved.revision, current.runtime);
  const compared = current.service.compareSimulator(current.saved.revision, current.runtime);
  assert.strictEqual(compared.comparison.status, 'different');
  assert.strictEqual(compared.comparison.muted, true);
});

test('readiness and identity scenarios remain blocked and explicitly classified', function (root) {
  const current = fixture(root);
  current.service.prepareForDSP(current.saved.revision, current.runtime);
  current.service.setSimulationScenario({type: 'unknown-mapping'}, current.runtime);
  let state = current.service.state(current.runtime).deployment;
  assert.strictEqual(state.target.physicalReadiness.physicalApplyReady, false);
  assert.ok(state.target.physicalReadiness.matrix.some(function (row) { return row.confidence === 'unknown'; }));
  current.service.setSimulationScenario({type: 'readback-unavailable'}, current.runtime);
  state = current.service.state(current.runtime).deployment;
  assert.ok(state.target.physicalReadiness.matrix.some(function (row) { return row.readable === 'unavailable'; }));
  current.service.setSimulationScenario({type: 'identity-mismatch'}, current.runtime);
  state = current.service.state(current.runtime).deployment;
  assert.strictEqual(state.identity.status, 'known-incompatible');
  assert.strictEqual(state.stale, true);
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
