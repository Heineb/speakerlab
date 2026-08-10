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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-alignment-'));
  try { fn(root); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name + '\n' + error.stack); }
  finally { fs.rmSync(root, {recursive: true, force: true}); }
}
function source(id, outputId, delayMs, reference) {
  const points = [];
  for (let index = 0; index < 121; index++) {
    const frequencyHz = 500 * Math.pow(8, index / 120);
    const raw = 15 - 360 * frequencyHz * delayMs / 1000;
    const phaseDegrees = ((raw + 180) % 360 + 360) % 360 - 180;
    points.push({frequencyHz, magnitudeDb: -3, phaseDegrees});
  }
  return {id, name: id, description: '', type: 'gated', sourceFormat: 'frd', sourceFilename: id + '.frd', importedAt: '2026-08-10T00:00:00.000Z',
    units: {frequency: 'Hz', magnitude: 'dB', phase: 'degrees'}, points, assignedOutputId: outputId, driverRole: outputId === 'output-a' ? 'woofer' : 'tweeter',
    conditions: {timingReference: reference || {kind: 'shared', group: 'capture-1'}}, validation: {state: 'valid', warnings: []}, provenance: {},
    integrity: {algorithm: 'sha256', hash: crypto.createHash('sha256').update(JSON.stringify(points)).digest('hex')}, modelVersion: 1};
}
function design() {
  const configuration = model.defaultConfiguration();
  Object.assign(configuration.outputs[0], {enabled: true, role: 'woofer', side: 'left', label: 'Left woofer'});
  Object.assign(configuration.outputs[1], {enabled: true, role: 'tweeter', side: 'left', label: 'Left tweeter'});
  configuration.connections = [{source: 'left', destination: 'output-a', enabled: true}, {source: 'left', destination: 'output-b', enabled: true}];
  configuration.crossover.outputs[0].lowPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2000};
  configuration.crossover.outputs[1].highPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2000};
  configuration.measurements.measurements = [source('woofer-phase', 'output-a', 0), source('tweeter-phase', 'output-b', 0.4)];
  return configuration;
}

test('capabilities and pair eligibility expose a hardware-free contextual alignment', function (root) {
  const service = serviceModule.createService({dataDirectory: root}), configuration = design();
  assert.strictEqual(model.capabilities().phaseAlignment.algorithmVersion, 'speakerlab-phase-alignment-v1');
  const result = service.eligibleAlignments(configuration, 'output-a');
  assert.strictEqual(result.pairs.length, 1);
  assert.strictEqual(result.pairs[0].eligible, true);
  assert.strictEqual(result.physicalDeploymentAllowed, false);
});

test('analysis returns explicit references, bounded range, quality, prediction and one suggestion', function (root) {
  const service = serviceModule.createService({dataDirectory: root}), configuration = design();
  const result = service.analyseAlignment(configuration, 'woofer-phase', 'tweeter-phase', {});
  assert.strictEqual(result.reference.mode, 'absolute-shared-reference');
  assert.strictEqual(result.prediction.length, 81);
  assert.ok(result.activeRange.minimumFrequencyHz < 2000 && result.activeRange.maximumFrequencyHz > 2000);
  assert.ok(result.delayEstimate.quality >= 0.35);
  assert.ok(result.suggestion.outputId);
  assert.strictEqual(result.automaticDesignChanges, false);
});

test('acceptance changes only ordinary processing draft and does not persist measurements', function (root) {
  const service = serviceModule.createService({dataDirectory: root}), configuration = design();
  const measurements = JSON.stringify(configuration.measurements);
  const analysis = service.analyseAlignment(configuration, 'woofer-phase', 'tweeter-phase', {});
  const accepted = service.acceptAlignment(configuration, analysis.analysisId, null);
  const output = accepted.configuration.channelProcessing.outputs.find(item => item.outputId === accepted.outputId);
  assert.strictEqual(output.delay.valueMs, analysis.suggestion.resultingDelayMs);
  assert.strictEqual(output.polarity.inverted, analysis.suggestion.polarityInverted);
  assert.strictEqual(JSON.stringify(accepted.configuration.measurements), measurements);
  assert.strictEqual(fs.existsSync(path.join(root, 'signal-flow.json')), false);
});

test('acceptance rejects changed drafts, source hashes and saved revisions', function (root) {
  const service = serviceModule.createService({dataDirectory: root}), configuration = design();
  let analysis = service.analyseAlignment(configuration, 'woofer-phase', 'tweeter-phase', {});
  const changed = model.clone(configuration);
  changed.channelProcessing.outputs[0].delay.valueMs = 0.1;
  assert.throws(() => service.acceptAlignment(changed, analysis.analysisId, null), error => error.code === 'STALE_ALIGNMENT_ANALYSIS');
  analysis = service.analyseAlignment(configuration, 'woofer-phase', 'tweeter-phase', {});
  const corrupt = model.clone(configuration);
  corrupt.measurements.measurements[0].integrity.hash = 'changed';
  assert.throws(() => service.acceptAlignment(corrupt, analysis.analysisId, null), error => error.code === 'STALE_ALIGNMENT_ANALYSIS');
  analysis = service.analyseAlignment(configuration, 'woofer-phase', 'tweeter-phase', {});
  service.save(configuration, null);
  assert.throws(() => service.acceptAlignment(configuration, analysis.analysisId, null), error => error.code === 'REVISION_CONFLICT');
});

test('controller exposes named eligibility, analysis and acceptance envelopes', function (root) {
  const service = serviceModule.createService({dataDirectory: root}), sent = [];
  const controller = controllerModule.createController({service, send: (header, content) => sent.push({header, content})});
  const configuration = design();
  controller.handle({header: 'eligibleAlignments', content: {configuration, outputId: 'output-a'}});
  controller.handle({header: 'analyseAlignment', content: {configuration, measurementAId: 'woofer-phase', measurementBId: 'tweeter-phase', options: {}}});
  controller.handle({header: 'acceptAlignment', content: {configuration, analysisId: sent[1].content.analysisId, revision: null}});
  assert.deepStrictEqual(sent.map(item => item.header), ['eligibleAlignments', 'alignmentAnalysis', 'alignmentDraft']);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
