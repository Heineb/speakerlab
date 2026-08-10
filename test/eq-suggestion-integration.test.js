'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const model = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const serviceModule = require('../Beocreate2/beo-extensions/signal-flow/routing-service');
const controllerModule = require('../Beocreate2/beo-extensions/signal-flow/routing-controller');

let passed = 0;
let failed = 0;
function test(name, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-assisted-eq-'));
  try { fn(root); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name + '\n' + error.stack); }
  finally { fs.rmSync(root, {recursive: true, force: true}); }
}
function design() {
  const result = model.defaultConfiguration();
  Object.assign(result.outputs[0], {enabled: true, role: 'woofer', side: 'left', label: 'Reference woofer'});
  result.connections = [{source: 'left', destination: 'output-a', enabled: true}];
  result.crossover.outputs[0].lowPass.enabled = true;
  result.crossover.outputs[0].lowPass.cutoffHz = 5000;
  const points = [];
  for (let index = 0; index < 181; index++) {
    const frequencyHz = 30 * Math.pow(200, index / 180);
    const distance = Math.log(frequencyHz / 1000) / Math.LN2;
    const magnitudeDb = 7 * Math.exp(-(distance * distance) / (2 * 0.45 * 0.45));
    points.push({frequencyHz, magnitudeDb});
  }
  const hash = model.measurementModel.hash(points);
  result.measurements.measurements.push({
    id: 'measurement-reference', name: 'Reference response', description: '', type: 'farfield', sourceFormat: 'frd', sourceFilename: 'reference.frd',
    importedAt: '2026-08-10T00:00:00.000Z', units: {frequency: 'Hz', magnitude: 'dB', phase: null}, points,
    assignedOutputId: 'output-a', driverRole: 'woofer', conditions: {}, validation: {state: 'valid', warnings: []},
    provenance: {detectedFormat: 'frd', confidence: 'high', sourceMetadata: []}, integrity: {algorithm: 'sha256', hash}, modelVersion: 1
  });
  return result;
}

test('capabilities and eligibility expose contextual hardware-free assisted EQ', function (root) {
  const service = serviceModule.createService({dataDirectory: root});
  const draft = design();
  assert.strictEqual(model.capabilities().assistedEQ.filterLimit.default, 5);
  const eligible = service.eligibleEQMeasurements(draft, 'output-a');
  assert.strictEqual(eligible.measurements[0].eligible, true);
  assert.strictEqual(eligible.physicalDeploymentAllowed, false);
  assert.strictEqual(service.eligibleEQMeasurements(draft, 'output-b').measurements[0].eligible, false);
});

test('analysis returns target, range, prediction, reasons and stable bounded suggestions', function (root) {
  const service = serviceModule.createService({dataDirectory: root});
  const draft = design();
  const first = service.suggestEQ(draft, 'output-a', 'measurement-reference', {target: 'flat'});
  const second = service.suggestEQ(draft, 'output-a', 'measurement-reference', {target: 'flat'});
  assert.ok(first.suggestions.length > 0 && first.suggestions.length <= 5);
  assert.deepStrictEqual(first.suggestions, second.suggestions);
  assert.strictEqual(first.target.name, 'Flat');
  assert.ok(first.activeRange.maximumFrequencyHz < 5000);
  assert.strictEqual(first.prediction.length, 121);
  assert.ok(first.prediction[0].measuredDb !== undefined && first.prediction[0].predictedWithSuggestionsDb !== undefined);
  assert.strictEqual(first.automaticDesignChanges, false);
});

test('accepting selected suggestions creates ordinary additive PEQ draft bands only', function (root) {
  const service = serviceModule.createService({dataDirectory: root});
  const draft = design();
  draft.parametricEQ.outputs[0].bands.push({id: 'eq-a-1', enabled: true, type: 'peaking', frequencyHz: 300, gainDb: -1, shape: 1, label: 'Existing'});
  const beforeMeasurement = JSON.stringify(draft.measurements);
  const analysis = service.suggestEQ(draft, 'output-a', 'measurement-reference', {target: 'flat'});
  const accepted = service.acceptEQSuggestions(draft, 'output-a', analysis.analysisId, [analysis.suggestions[0].id], null);
  assert.strictEqual(accepted.configuration.parametricEQ.outputs[0].bands[0].label, 'Existing');
  assert.strictEqual(accepted.configuration.parametricEQ.outputs[0].bands[1].label, 'Assisted EQ');
  assert.strictEqual(accepted.validation.valid, true);
  assert.strictEqual(JSON.stringify(accepted.configuration.measurements), beforeMeasurement);
  assert.strictEqual(fs.existsSync(path.join(root, 'signal-flow.json')), false);
});

test('rejected suggestions make no design change and stale analysis is not accepted twice', function (root) {
  const service = serviceModule.createService({dataDirectory: root});
  const draft = design();
  const snapshot = JSON.stringify(draft);
  const analysis = service.suggestEQ(draft, 'output-a', 'measurement-reference', {});
  assert.strictEqual(JSON.stringify(draft), snapshot);
  const accepted = service.acceptEQSuggestions(draft, 'output-a', analysis.analysisId, [analysis.suggestions[0].id], null);
  assert.throws(function () { service.acceptEQSuggestions(accepted.configuration, 'output-a', analysis.analysisId, [analysis.suggestions[0].id], null); }, function (error) { return error.code === 'STALE_EQ_SUGGESTIONS'; });
});

test('acceptance protects revision conflicts and changed source integrity', function (root) {
  const service = serviceModule.createService({dataDirectory: root});
  const draft = design();
  const analysis = service.suggestEQ(draft, 'output-a', 'measurement-reference', {});
  const saved = service.save(draft, null);
  assert.throws(function () { service.acceptEQSuggestions(draft, 'output-a', analysis.analysisId, [analysis.suggestions[0].id], null); }, function (error) { return error.code === 'REVISION_CONFLICT'; });
  const fresh = service.suggestEQ(saved.configuration, 'output-a', 'measurement-reference', {});
  const changed = model.clone(saved.configuration);
  changed.measurements.measurements[0].integrity.hash = 'changed';
  assert.throws(function () { service.acceptEQSuggestions(changed, 'output-a', fresh.analysisId, [fresh.suggestions[0].id], saved.revision); }, function (error) { return error.code === 'STALE_EQ_SUGGESTIONS'; });
});

test('controller exposes eligibility, analysis and acceptance through named envelopes', function (root) {
  const service = serviceModule.createService({dataDirectory: root});
  const sent = [];
  const controller = controllerModule.createController({service, send: function (header, content) { sent.push({header, content}); }});
  const draft = design();
  controller.handle({header: 'eligibleEQMeasurements', content: {configuration: draft, outputId: 'output-a'}});
  controller.handle({header: 'suggestEQ', content: {configuration: draft, outputId: 'output-a', measurementId: 'measurement-reference', options: {target: 'flat'}}});
  controller.handle({header: 'acceptEQSuggestions', content: {configuration: draft, outputId: 'output-a', analysisId: sent[1].content.analysisId, selectedSuggestionIds: [sent[1].content.suggestions[0].id], revision: null}});
  assert.deepStrictEqual(sent.map(item => item.header), ['eligibleEQMeasurements', 'eqSuggestions', 'eqSuggestionDraft']);
  assert.strictEqual(sent[2].content.configuration.parametricEQ.outputs[0].bands.length, 1);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
