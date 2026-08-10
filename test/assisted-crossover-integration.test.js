'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const model = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const serviceModule = require('../Beocreate2/beo-extensions/signal-flow/routing-service');
const controllerModule = require('../Beocreate2/beo-extensions/signal-flow/routing-controller');

let passed = 0, failed = 0;
function test(name, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-crossover-assistance-'));
  try { fn(root); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name + '\n' + error.stack); }
  finally { fs.rmSync(root, {recursive: true, force: true}); }
}
function source(id, outputId, role, noPhase, reference) {
  const points = [];
  for (let index = 0; index < 121; index++) {
    const frequencyHz = 500 * Math.pow(12, index / 120);
    const magnitudeDb = role === 'woofer' ? -Math.max(0, Math.log2(frequencyHz / 2600)) * 8 : -Math.max(0, Math.log2(1500 / frequencyHz)) * 8;
    const point = {frequencyHz, magnitudeDb};
    if (!noPhase) { const raw = 10 - 360 * frequencyHz * (role === 'tweeter' ? 0.2 : 0) / 1000; point.phaseDegrees = ((raw + 180) % 360 + 360) % 360 - 180; }
    points.push(point);
  }
  return {id, name: id, description: '', type: 'gated', sourceFormat: 'frd', sourceFilename: id + '.frd', importedAt: '2026-08-10T00:00:00.000Z',
    units: {frequency: 'Hz', magnitude: 'dB', phase: noPhase ? null : 'degrees'}, points, assignedOutputId: outputId, driverRole: role,
    conditions: {timingReference: reference || {kind: 'shared', group: 'capture-1'}}, validation: {state: 'valid', warnings: []}, provenance: {kind: 'imported'},
    integrity: {algorithm: 'sha256', hash: crypto.createHash('sha256').update(JSON.stringify(points)).digest('hex')}, modelVersion: 1};
}
function design(noPhase) {
  const configuration = model.defaultConfiguration();
  Object.assign(configuration.outputs[0], {enabled: true, role: 'woofer', side: 'left', label: 'Left woofer'});
  Object.assign(configuration.outputs[1], {enabled: true, role: 'tweeter', side: 'left', label: 'Left tweeter'});
  configuration.connections = [{source: 'left', destination: 'output-a', enabled: true}, {source: 'left', destination: 'output-b', enabled: true}];
  configuration.crossover.outputs[0].lowPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2200};
  configuration.crossover.outputs[1].highPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2200};
  configuration.measurements.measurements = [source('woofer-response', 'output-a', 'woofer', noPhase), source('tweeter-response', 'output-b', 'tweeter', noPhase)];
  return configuration;
}

test('capabilities and eligible measurement pairs expose bounded hardware-free crossover assistance', function (root) {
  const service = serviceModule.createService({dataDirectory: root}), configuration = design(false);
  assert.strictEqual(model.capabilities().assistedCrossover.algorithmVersion, 'speakerlab-assisted-crossover-v1');
  const result = service.eligibleCrossoverMeasurements(configuration, 'output-a');
  assert.strictEqual(result.pairs.length, 1); assert.strictEqual(result.pairs[0].eligible, true); assert.strictEqual(result.maximumSuggestions, 3); assert.strictEqual(result.physicalDeploymentAllowed, false);
});

test('analysis returns preview candidates and phase-aware timing classification', function (root) {
  const service = serviceModule.createService({dataDirectory: root}), configuration = design(false);
  const result = service.suggestCrossover(configuration, 'woofer-response', 'tweeter-response');
  assert.strictEqual(result.mode, 'phase-aware'); assert.strictEqual(result.timingReference.classification, 'user-declared-compatible');
  assert.ok(result.suggestions.length > 0 && result.suggestions.length <= 3); assert.ok(result.suggestions[0].prediction.length === 61);
  assert.strictEqual(result.automaticDesignChanges, false); assert.strictEqual(fs.existsSync(path.join(root, 'signal-flow.json')), false);
});

test('magnitude-only analysis remains useful without polarity delay or complex-sum claims', function (root) {
  const service = serviceModule.createService({dataDirectory: root}), configuration = design(true);
  const result = service.suggestCrossover(configuration, 'woofer-response', 'tweeter-response');
  assert.strictEqual(result.mode, 'magnitude-only'); assert.match(result.summary, /no complex acoustic sum/i);
  result.suggestions.forEach(item => { assert.strictEqual(item.delaySuggestion, null); assert.strictEqual(item.polarityRecommendation, 'unavailable'); });
});

test('acceptance changes ordinary draft fields only and remains unpersisted', function (root) {
  const service = serviceModule.createService({dataDirectory: root}), configuration = design(false);
  const eq = JSON.stringify(configuration.parametricEQ), protection = JSON.stringify(configuration.driverProtection), measurements = JSON.stringify(configuration.measurements);
  const analysis = service.suggestCrossover(configuration, 'woofer-response', 'tweeter-response');
  const accepted = service.acceptCrossoverSuggestion(configuration, analysis.analysisId, analysis.suggestions[0].id, null);
  assert.strictEqual(accepted.configuration.crossover.outputs[0].lowPass.cutoffHz, analysis.suggestions[0].frequencyHz);
  assert.strictEqual(JSON.stringify(accepted.configuration.parametricEQ), eq); assert.strictEqual(JSON.stringify(accepted.configuration.driverProtection), protection); assert.strictEqual(JSON.stringify(accepted.configuration.measurements), measurements);
  assert.strictEqual(fs.existsSync(path.join(root, 'signal-flow.json')), false);
});

test('acceptance rejects stale draft, source integrity, selected ID and saved revision conflicts', function (root) {
  const service = serviceModule.createService({dataDirectory: root}), configuration = design(false);
  let analysis = service.suggestCrossover(configuration, 'woofer-response', 'tweeter-response');
  assert.throws(() => service.acceptCrossoverSuggestion(configuration, analysis.analysisId, 'missing', null), error => error.code === 'INVALID_CROSSOVER_SUGGESTION_ACCEPTANCE');
  analysis = service.suggestCrossover(configuration, 'woofer-response', 'tweeter-response');
  const changed = model.clone(configuration); changed.channelProcessing.outputs[0].delay.valueMs = 0.1;
  assert.throws(() => service.acceptCrossoverSuggestion(changed, analysis.analysisId, analysis.suggestions[0].id, null), error => error.code === 'STALE_CROSSOVER_SUGGESTIONS');
  analysis = service.suggestCrossover(configuration, 'woofer-response', 'tweeter-response');
  const corrupt = model.clone(configuration); corrupt.measurements.measurements[0].integrity.hash = 'changed';
  assert.throws(() => service.acceptCrossoverSuggestion(corrupt, analysis.analysisId, analysis.suggestions[0].id, null), error => error.code === 'STALE_CROSSOVER_SUGGESTIONS');
  analysis = service.suggestCrossover(configuration, 'woofer-response', 'tweeter-response'); service.save(configuration, null);
  assert.throws(() => service.acceptCrossoverSuggestion(configuration, analysis.analysisId, analysis.suggestions[0].id, null), error => error.code === 'REVISION_CONFLICT');
});

test('controller exposes eligibility analysis and acceptance with named envelopes', function (root) {
  const service = serviceModule.createService({dataDirectory: root}), sent = [], controller = controllerModule.createController({service, send: (header, content) => sent.push({header, content})});
  const configuration = design(false);
  controller.handle({header: 'eligibleCrossoverMeasurements', content: {configuration, outputId: 'output-a'}});
  controller.handle({header: 'suggestCrossover', content: {configuration, measurementAId: 'woofer-response', measurementBId: 'tweeter-response'}});
  controller.handle({header: 'acceptCrossoverSuggestion', content: {configuration, analysisId: sent[1].content.analysisId, suggestionId: sent[1].content.suggestions[0].id, revision: null}});
  assert.deepStrictEqual(sent.map(item => item.header), ['eligibleCrossoverMeasurements', 'crossoverSuggestions', 'crossoverSuggestionDraft']);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
