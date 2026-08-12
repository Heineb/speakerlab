'use strict';

const assert = require('assert');
const crypto = require('crypto');
const model = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const assisted = model.assistedCrossoverModel;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name + '\n' + error.stack); }
}
function measurement(id, outputId, role, options) {
  options = options || {};
  const minimum = options.minimum || 400, maximum = options.maximum || 8000, points = [];
  for (let index = 0; index < 121; index++) {
    const frequencyHz = minimum * Math.pow(maximum / minimum, index / 120);
    const rolloff = role === 'woofer' ? -Math.max(0, Math.log2(frequencyHz / 2600)) * 8 : -Math.max(0, Math.log2(1500 / frequencyHz)) * 8;
    const magnitudeDb = rolloff + (options.offsetDb || 0) + Math.sin(index / 11) * (options.ripple || 0.2);
    const point = {frequencyHz, magnitudeDb};
    if (!options.noPhase) {
      const raw = (options.phaseOffset || 10) - 360 * frequencyHz * (options.delayMs || 0) / 1000;
      point.phaseDegrees = ((raw + 180) % 360 + 360) % 360 - 180;
    }
    points.push(point);
  }
  return {id, name: id, description: '', type: options.type || 'gated', sourceFormat: options.sourceFormat || 'frd', sourceFilename: id + '.frd', importedAt: '2026-08-10T00:00:00.000Z',
    units: {frequency: 'Hz', magnitude: 'dB', phase: options.noPhase ? null : 'degrees'}, points, assignedOutputId: outputId, driverRole: role,
    conditions: {timingReference: options.reference || {kind: 'shared', group: 'capture-1'}}, validation: {state: 'valid', warnings: []}, provenance: {kind: 'imported'},
    integrity: {algorithm: 'sha256', hash: crypto.createHash('sha256').update(JSON.stringify(points)).digest('hex')}, modelVersion: 1};
}
function design(options) {
  options = options || {};
  const configuration = model.defaultConfiguration();
  Object.assign(configuration.outputs[0], {enabled: true, role: 'woofer', side: 'left', label: 'Test woofer'});
  Object.assign(configuration.outputs[1], {enabled: true, role: 'tweeter', side: 'left', label: 'Test tweeter'});
  configuration.connections = [{source: 'left', destination: 'output-a', enabled: true}, {source: 'left', destination: 'output-b', enabled: true}];
  if (options.current !== false) {
    configuration.crossover.outputs[0].lowPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2200};
    configuration.crossover.outputs[1].highPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2200};
  }
  const low = measurement('woofer-response', 'output-a', 'woofer', options.low);
  const high = measurement('tweeter-response', 'output-b', 'tweeter', Object.assign({delayMs: 0.2}, options.high || {}));
  configuration.measurements.measurements = [low, high];
  return {configuration, low, high};
}
const models = {crossover: model.crossoverModel, eq: model.eqModel, processing: model.processingModel, phase: model.phaseAlignmentModel};

test('candidate range handles broad, narrow, absent, boundaries and current crossover context', function () {
  let fixture = design();
  let range = assisted.candidateRange(fixture.configuration, fixture.low, fixture.high, 2200);
  assert.strictEqual(range.valid, true); assert.strictEqual(range.currentCrossoverFrequencyHz, 2200); assert.ok(range.overlapOctaves > 2);
  fixture = design({low: {minimum: 1000, maximum: 1800}, high: {minimum: 1400, maximum: 2200}});
  range = assisted.candidateRange(fixture.configuration, fixture.low, fixture.high, 2200);
  assert.strictEqual(range.valid, false); assert.strictEqual(range.minimumFrequencyHz, 1400); assert.strictEqual(range.maximumFrequencyHz, 1800);
  fixture = design({low: {minimum: 100, maximum: 900}, high: {minimum: 1200, maximum: 8000}});
  range = assisted.candidateRange(fixture.configuration, fixture.low, fixture.high, null);
  assert.strictEqual(range.valid, false);
});

test('filter simulation uses only supported families and deterministic complex responses', function () {
  const fixture = design();
  assisted.TEMPLATES.forEach(function (template) {
    const low = {enabled: true, family: template.family, slopeDbPerOctave: template.slopeDbPerOctave, cutoffHz: 2000};
    const response = model.crossoverModel.filterResponse(model.crossoverModel.designFilter('low-pass', low, 48000), 2000, 48000);
    assert.ok(Number.isFinite(response.real)); assert.ok(Number.isFinite(response.imaginary));
    assert.deepStrictEqual(response, model.crossoverModel.filterResponse(model.crossoverModel.designFilter('low-pass', low, 48000), 2000, 48000));
  });
  assert.deepStrictEqual(assisted.TEMPLATES.map(item => item.family), ['linkwitz-riley', 'linkwitz-riley', 'butterworth']);
});

test('magnitude-only fallback returns bounded alternatives without phase polarity or delay claims', function () {
  const fixture = design({low: {noPhase: true}, high: {noPhase: true}});
  const result = assisted.analyse({configuration: fixture.configuration, measurementA: fixture.low, measurementB: fixture.high}, models);
  assert.strictEqual(result.valid, true); assert.strictEqual(result.mode, 'magnitude-only'); assert.ok(result.suggestions.length > 0 && result.suggestions.length <= 3);
  result.suggestions.forEach(function (item) { assert.strictEqual(item.polarityRecommendation, 'unavailable'); assert.strictEqual(item.delaySuggestion, null); });
  assert.match(result.summary, /no complex acoustic sum/i);
});

test('phase-aware summation includes polarity, known delay and user-declared timing limitation', function () {
  const fixture = design({high: {delayMs: 0.2, phaseOffset: 190}});
  const result = assisted.analyse({configuration: fixture.configuration, measurementA: fixture.low, measurementB: fixture.high}, models);
  assert.strictEqual(result.valid, true); assert.strictEqual(result.mode, 'phase-aware'); assert.strictEqual(result.timingReference.classification, 'user-declared-compatible');
  assert.ok(result.suggestions[0].prediction.every(point => Number.isFinite(point.sumDb) && Number.isFinite(point.currentResultDb)));
  assert.ok(result.suggestions[0].alternativePrediction); assert.notStrictEqual(result.suggestions[0].polarityRecommendation, 'unavailable');
  assert.match(result.timingReference.statement, /cannot be acoustically verified/i);
});

test('complex and magnitude-only sums keep their different acoustic meanings', function () {
  const inPhase = model.phaseAlignmentModel.complexSum({magnitudeDb: 0, phaseDegrees: 0}, {magnitudeDb: 0, phaseDegrees: 0}, 1000, 0, false);
  const opposing = model.phaseAlignmentModel.complexSum({magnitudeDb: 0, phaseDegrees: 0}, {magnitudeDb: 0, phaseDegrees: 0}, 1000, 0, true);
  assert.ok(Math.abs(inPhase.magnitudeDb - 6.0206) < 0.001);
  assert.ok(opposing.magnitudeDb < -100);
  assert.ok(Math.abs(assisted.powerSumDb(0, 0) - 3.0103) < 0.001);
});

test('timing confidence falls back safely for incompatible references', function () {
  const fixture = design({high: {reference: {kind: 'shared', group: 'other'}}});
  const result = assisted.analyse({configuration: fixture.configuration, measurementA: fixture.low, measurementB: fixture.high}, models);
  assert.strictEqual(result.valid, true); assert.strictEqual(result.mode, 'magnitude-only'); assert.strictEqual(result.timingReference.classification, 'uncertain');
});

test('ranking is deterministic and penalises complexity gap overlap phase delay and level mismatch', function () {
  const base = {frequencyHz: 2000, family: 'linkwitz-riley', slopeDbPerOctave: 24};
  const candidates = [
    Object.assign({}, base, {score: 3}), Object.assign({}, base, {frequencyHz: 1600, score: 1}), Object.assign({}, base, {frequencyHz: 2500, score: 2}),
    Object.assign({}, base, {frequencyHz: 2020, score: 0.5})
  ];
  assert.deepStrictEqual(assisted.rankCandidates(candidates).map(item => item.score), [0.5, 1, 2, 3]);
  const bounded = assisted.chooseBounded(candidates); assert.ok(bounded.length <= 3); assert.strictEqual(bounded[0].score, 0.5);
  assert.ok(!bounded.some((item, index) => bounded.some((other, otherIndex) => index !== otherIndex && Math.abs(Math.log(item.frequencyHz / other.frequencyHz) / Math.LN2) < 0.18)));
});

test('analysis is deterministic, limits tiny variants and accounts for current EQ processing and protection warnings', function () {
  const fixture = design();
  fixture.configuration.parametricEQ.outputs[0].bands.push({id: 'eq-a-1', enabled: true, type: 'peaking', frequencyHz: 1900, gainDb: -2, shape: 1, label: 'Existing'});
  fixture.configuration.channelProcessing.outputs[0].delay.valueMs = 0.1;
  fixture.configuration.driverProtection.outputs[1].limiter.enabled = true;
  fixture.configuration.driverProtection.outputs[1].limiter.thresholdPeakVoltage = 10;
  const first = assisted.analyse({configuration: fixture.configuration, measurementA: fixture.low, measurementB: fixture.high}, models);
  const second = assisted.analyse({configuration: fixture.configuration, measurementA: fixture.low, measurementB: fixture.high}, models);
  assert.deepStrictEqual(first, second); assert.ok(first.suggestions.length <= assisted.MAX_SUGGESTIONS);
  assert.ok(first.warnings.some(item => item.code === 'PROTECTION_CONTEXT_PRESENT'));
  assert.ok(first.currentBaseline.processingIncluded.includes('current Parametric EQ'));
  first.suggestions.forEach(function (candidate) {
    assert.deepStrictEqual(Object.keys(candidate.scoreComponents).sort(), ['cancellation', 'complexity', 'delay', 'gap', 'levelMismatch', 'overlap', 'phase', 'smoothness'].sort());
    assert.strictEqual(candidate.score, Number(Object.values(candidate.scoreComponents).reduce((sum, value) => sum + value, 0).toFixed(6)));
  });
});

test('eligibility accepts only supported adjacent acoustic way pairs', function () {
  const fixture = design();
  fixture.configuration.outputs[0].role = 'subwoofer';
  fixture.low.driverRole = 'subwoofer';
  let result = assisted.eligibility(fixture.configuration, fixture.low, fixture.high, model.phaseAlignmentModel);
  assert.strictEqual(result.eligible, false);
  assert.ok(result.errors.some(item => item.code === 'NON_ADJACENT_DRIVER_PAIR'));
  fixture.configuration.outputs[1].role = 'woofer';
  fixture.high.driverRole = 'woofer';
  result = assisted.eligibility(fixture.configuration, fixture.low, fixture.high, model.phaseAlignmentModel);
  assert.strictEqual(result.eligible, true);
});

test('eligibility blocks invalid stale integrity and poor overlap sources', function () {
  const fixture = design();
  fixture.high.integrity.hash = 'corrupt';
  let result = assisted.eligibility(fixture.configuration, fixture.low, fixture.high, model.phaseAlignmentModel);
  assert.strictEqual(result.eligible, false); assert.ok(result.errors.some(item => item.code === 'CROSSOVER_SOURCE_INTEGRITY_MISMATCH'));
  const poor = design({low: {minimum: 100, maximum: 900}, high: {minimum: 1200, maximum: 8000}});
  result = assisted.eligibility(poor.configuration, poor.low, poor.high, model.phaseAlignmentModel);
  assert.ok(result.errors.some(item => item.code === 'NO_USEFUL_CROSSOVER_OVERLAP'));
  const stale = design();
  stale.high.sourceFormat = 'derived-merge';
  stale.high.mergeRecipe = {lowSourceId: stale.low.id, highSourceId: 'missing-source', lowSourceHash: stale.low.integrity.hash, highSourceHash: 'missing-hash'};
  result = assisted.eligibility(stale.configuration, stale.low, stale.high, model.phaseAlignmentModel);
  assert.ok(result.errors.some(item => item.code === 'STALE_CROSSOVER_SOURCE'));
});

test('acceptance changes ordinary crossover and only explicitly included processing', function () {
  const fixture = design();
  const beforeEQ = JSON.stringify(fixture.configuration.parametricEQ), beforeProtection = JSON.stringify(fixture.configuration.driverProtection);
  const analysis = assisted.analyse({configuration: fixture.configuration, measurementA: fixture.low, measurementB: fixture.high}, models);
  const accepted = assisted.accept(fixture.configuration, analysis, analysis.suggestions[0].id, model.processingModel);
  assert.strictEqual(accepted.configuration.crossover.outputs[0].lowPass.cutoffHz, analysis.suggestions[0].frequencyHz);
  assert.strictEqual(accepted.configuration.crossover.outputs[1].highPass.cutoffHz, analysis.suggestions[0].frequencyHz);
  assert.strictEqual(JSON.stringify(accepted.configuration.parametricEQ), beforeEQ);
  assert.strictEqual(JSON.stringify(accepted.configuration.driverProtection), beforeProtection);
  assert.notStrictEqual(accepted.configuration, fixture.configuration);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
