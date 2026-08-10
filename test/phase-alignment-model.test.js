'use strict';

const assert = require('assert');
const crypto = require('crypto');
const alignment = require('../Beocreate2/beo-extensions/signal-flow/phase-alignment-model');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name + '\n' + error.stack); }
}
function phasePoints(delayMs, offset, noise) {
  const points = [];
  for (let index = 0; index < 81; index++) {
    const frequencyHz = 400 * Math.pow(10, index / 80);
    const unwrapped = (offset || 0) - 360 * frequencyHz * delayMs / 1000 + (noise ? Math.sin(index * 1.7) * noise : 0);
    let wrapped = ((unwrapped + 180) % 360 + 360) % 360 - 180;
    points.push({frequencyHz, magnitudeDb: -3, phaseDegrees: wrapped});
  }
  return points;
}
function measurement(id, outputId, delayMs, reference) {
  const points = phasePoints(delayMs, 20, 0);
  return {id, name: id, type: 'gated', sourceFormat: 'frd', sourceFilename: id + '.frd', importedAt: '2026-08-10T00:00:00.000Z',
    units: {frequency: 'Hz', magnitude: 'dB', phase: 'degrees'}, points, assignedOutputId: outputId, driverRole: outputId === 'output-a' ? 'woofer' : 'tweeter',
    conditions: {timingReference: reference || {kind: 'shared', group: 'capture-1'}}, validation: {state: 'valid', warnings: []}, provenance: {},
    integrity: {algorithm: 'sha256', hash: crypto.createHash('sha256').update(JSON.stringify(points)).digest('hex')}, modelVersion: 1};
}
function design(first, second) {
  const configuration = routing.defaultConfiguration();
  Object.assign(configuration.outputs[0], {enabled: true, role: 'woofer', side: 'left'});
  Object.assign(configuration.outputs[1], {enabled: true, role: 'tweeter', side: 'left'});
  configuration.connections = [{source: 'left', destination: 'output-a', enabled: true}, {source: 'left', destination: 'output-b', enabled: true}];
  configuration.crossover.outputs[0].lowPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2000};
  configuration.crossover.outputs[1].highPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2000};
  configuration.measurements.measurements = [first, second];
  return configuration;
}
function rehash(source) {
  source.integrity.hash = crypto.createHash('sha256').update(JSON.stringify(source.points)).digest('hex');
  return source;
}

test('phase unwrap handles smooth data, ±180 crossings and multiple wraps', function () {
  const source = phasePoints(1.25, 30, 0);
  const result = alignment.unwrapPhase(source);
  assert.strictEqual(result.valid, true);
  for (let index = 1; index < result.points.length; index++) assert.ok(Math.abs(result.points[index].phaseDegrees - result.points[index - 1].phaseDegrees) < 180);
  assert.ok(result.points[result.points.length - 1].phaseDegrees < result.points[0].phaseDegrees - 1000);
});

test('phase unwrap is deterministic with noise and rejects invalid discontinuous values', function () {
  const noisy = phasePoints(0.4, 0, 8);
  assert.deepStrictEqual(alignment.unwrapPhase(noisy), alignment.unwrapPhase(noisy));
  assert.strictEqual(alignment.unwrapPhase([{frequencyHz: 1000, phaseDegrees: NaN}]).valid, false);
});

test('robust phase-slope fit estimates positive, negative and zero delay', function () {
  [0.75, -0.5, 0].forEach(function (delay) {
    const points = phasePoints(delay, 35, 2);
    const unwrapped = alignment.unwrapPhase(points);
    const result = alignment.robustLineFit(unwrapped.points);
    assert.ok(Math.abs(result.delayMs - delay) < 0.01, delay + ' versus ' + result.delayMs);
    assert.ok(result.quality > 0.8);
  });
});

test('delay estimation respects a restricted range and requires enough points', function () {
  const points = alignment.unwrapPhase(phasePoints(1, 0, 0)).points.filter(point => point.frequencyHz >= 1000 && point.frequencyHz <= 2500);
  assert.ok(Math.abs(alignment.robustLineFit(points).delayMs - 1) < 0.001);
  assert.strictEqual(alignment.robustLineFit(points.slice(0, 5)).valid, false);
});

test('complex summation handles in-phase, opposite polarity, delay and cancellation', function () {
  const inPhase = alignment.complexSum({magnitudeDb: 0, phaseDegrees: 0}, {magnitudeDb: 0, phaseDegrees: 0}, 1000, 0, false);
  const inverted = alignment.complexSum({magnitudeDb: 0, phaseDegrees: 0}, {magnitudeDb: 0, phaseDegrees: 0}, 1000, 0, true);
  const delayed = alignment.complexSum({magnitudeDb: 0, phaseDegrees: 0}, {magnitudeDb: 0, phaseDegrees: 0}, 1000, 0.5, false);
  assert.ok(Math.abs(inPhase.magnitudeDb - 6.0206) < 0.001);
  assert.ok(inverted.magnitudeDb < -100);
  assert.ok(delayed.magnitudeDb < inPhase.magnitudeDb);
  assert.deepStrictEqual(inPhase, alignment.complexSum({magnitudeDb: 0, phaseDegrees: 0}, {magnitudeDb: 0, phaseDegrees: 0}, 1000, 0, false));
});

test('compatibility blocks missing phase, stale derived and incompatible timing references', function () {
  const first = measurement('woofer', 'output-a', 0);
  const second = measurement('tweeter', 'output-b', 0, {kind: 'shared', group: 'other'});
  let result = alignment.eligibility(design(first, second), first, second);
  assert.strictEqual(result.eligible, false);
  assert.ok(result.errors.some(item => item.code === 'INCOMPATIBLE_TIMING_REFERENCE'));
  second.conditions.timingReference = {kind: 'shared', group: 'capture-1'};
  second.units.phase = null;
  second.points = second.points.map(point => ({frequencyHz: point.frequencyHz, magnitudeDb: point.magnitudeDb}));
  second.integrity.hash = crypto.createHash('sha256').update(JSON.stringify(second.points)).digest('hex');
  result = alignment.eligibility(design(first, second), first, second);
  assert.ok(result.errors.some(item => item.code === 'ALIGNMENT_PHASE_UNAVAILABLE'));
});

test('analysis is deterministic, includes current processing and returns one bounded suggestion', function () {
  const first = measurement('woofer', 'output-a', 0);
  const second = measurement('tweeter', 'output-b', 0.35);
  const configuration = design(first, second);
  configuration.channelProcessing.outputs[0].delay.valueMs = 0.2;
  const models = {crossover: routing.crossoverModel, eq: routing.eqModel, processing: routing.processingModel};
  const result = alignment.analyse({configuration, measurementA: first, measurementB: second}, models);
  assert.strictEqual(result.valid, true);
  assert.ok(result.suggestion.delayAdjustmentMs >= 0);
  assert.ok(result.suggestion.resultingDelayMs <= routing.processingModel.capabilities().delay.maximumMs);
  assert.strictEqual(result.prediction.length, 81);
  assert.ok(result.processingIncluded.includes('current delay'));
  assert.deepStrictEqual(result, alignment.analyse({configuration, measurementA: first, measurementB: second}, models));
});

test('analysis compares polarity explicitly and discloses an ambiguous alternative', function () {
  const first = measurement('woofer', 'output-a', 0);
  const invertedSource = measurement('tweeter', 'output-b', 0.35);
  invertedSource.points.forEach(point => { point.phaseDegrees = ((point.phaseDegrees + 360) % 360) - 180; });
  rehash(invertedSource);
  const models = {crossover: routing.crossoverModel, eq: routing.eqModel, processing: routing.processingModel};
  const inverted = alignment.analyse({configuration: design(first, invertedSource), measurementA: first, measurementB: invertedSource}, models);
  assert.strictEqual(inverted.valid, true);
  assert.strictEqual(inverted.suggestion.polarityInverted, true);
  assert.ok(inverted.prediction.every(point => Number.isFinite(point.alternativePolaritySumDb)));

  const quiet = measurement('quiet-tweeter', 'output-b', 0.35);
  quiet.points.forEach(point => { point.magnitudeDb = -100; });
  rehash(quiet);
  const ambiguous = alignment.analyse({configuration: design(first, quiet), measurementA: first, measurementB: quiet}, models);
  assert.strictEqual(ambiguous.valid, true);
  assert.ok(ambiguous.warnings.some(item => item.code === 'AMBIGUOUS_POLARITY_RESULT'));
});

test('analysis blocks inconsistent phase fits and resulting delay beyond target capability', function () {
  const first = measurement('woofer', 'output-a', 0);
  const inconsistent = measurement('tweeter-noisy', 'output-b', 0.35);
  inconsistent.points.forEach((point, index) => { point.phaseDegrees = ((index * index * 79 + 180) % 360) - 180; });
  rehash(inconsistent);
  const models = {crossover: routing.crossoverModel, eq: routing.eqModel, processing: routing.processingModel};
  const poor = alignment.analyse({configuration: design(first, inconsistent), measurementA: first, measurementB: inconsistent}, models);
  assert.strictEqual(poor.valid, false);
  assert.ok(poor.errors.some(item => item.code === 'ALIGNMENT_QUALITY_TOO_LOW'));

  const delayed = measurement('tweeter-delayed', 'output-b', 0.35);
  const configuration = design(first, delayed);
  configuration.channelProcessing.outputs[0].delay.valueMs = routing.processingModel.capabilities().delay.maximumMs;
  configuration.channelProcessing.outputs[1].delay.valueMs = routing.processingModel.capabilities().delay.maximumMs;
  const excessive = alignment.analyse({configuration, measurementA: first, measurementB: delayed}, models);
  assert.strictEqual(excessive.valid, false);
  assert.ok(excessive.errors.some(item => item.code === 'ALIGNMENT_DELAY_OUT_OF_RANGE'));
});

test('accepted alignment becomes ordinary editable delay and polarity without mutating source', function () {
  const first = measurement('woofer', 'output-a', 0);
  const second = measurement('tweeter', 'output-b', 0.35);
  const configuration = design(first, second);
  const snapshot = JSON.stringify(configuration);
  const analysis = alignment.analyse({configuration, measurementA: first, measurementB: second}, {crossover: routing.crossoverModel, eq: routing.eqModel, processing: routing.processingModel});
  const accepted = alignment.accept(configuration, analysis, routing.processingModel);
  assert.strictEqual(JSON.stringify(configuration), snapshot);
  const output = accepted.configuration.channelProcessing.outputs.find(item => item.outputId === analysis.suggestion.outputId);
  assert.strictEqual(output.delay.valueMs, analysis.suggestion.resultingDelayMs);
  assert.strictEqual(output.polarity.inverted, analysis.suggestion.polarityInverted);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
