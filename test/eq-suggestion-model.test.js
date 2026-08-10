'use strict';

const assert = require('assert');
const crypto = require('crypto');
const suggestions = require('../Beocreate2/beo-extensions/signal-flow/eq-suggestion-model');
const eq = require('../Beocreate2/beo-extensions/signal-flow/parametric-eq-model');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name + '\n' + error.stack); }
}
function measurement(id, transform, type) {
  const points = [];
  for (let index = 0; index < 241; index++) {
    const frequencyHz = 20 * Math.pow(1000, index / 240);
    points.push({frequencyHz, magnitudeDb: transform ? transform(frequencyHz) : 0});
  }
  return {
    id: id, name: id, type: type || 'farfield', sourceFormat: 'frd', points,
    assignedOutputId: 'output-a', driverRole: 'full-range', validation: {state: 'valid', warnings: []},
    integrity: {algorithm: 'sha256', hash: crypto.createHash('sha256').update(JSON.stringify(points)).digest('hex')}
  };
}
function context(source, options, bands) {
  return {
    measurement: source, measurements: [source],
    output: {id: 'output-a', role: 'full-range'},
    crossoverOutput: {highPass: {enabled: false}, lowPass: {enabled: false}},
    eqOutput: {outputId: 'output-a', bands: bands || []},
    protection: {limiter: {enabled: false}}, options: options || {}
  };
}
function gaussian(frequency, centre, width, gain) {
  const distance = Math.log(frequency / centre) / Math.LN2;
  return gain * Math.exp(-(distance * distance) / (2 * width * width));
}

test('analysis grid interpolates deterministically in log frequency without extrapolation', function () {
  const points = [{frequencyHz: 100, magnitudeDb: 0}, {frequencyHz: 1000, magnitudeDb: 10}];
  assert.strictEqual(suggestions.interpolate(points, Math.sqrt(100000)), 5);
  assert.strictEqual(suggestions.interpolate(points, 50), null);
  assert.deepStrictEqual(suggestions.analysisGrid(points, 100, 1000, 3), suggestions.analysisGrid(points, 100, 1000, 3));
});

test('smoothing supports none and fractional-octave modes without changing raw points', function () {
  const raw = [{frequencyHz: 100, magnitudeDb: 0}, {frequencyHz: 110, magnitudeDb: 10}, {frequencyHz: 121, magnitudeDb: 0}];
  const snapshot = JSON.stringify(raw);
  assert.deepStrictEqual(suggestions.smooth(raw, 'none'), raw);
  ['1/12', '1/6', '1/3'].forEach(function (mode) { assert.strictEqual(suggestions.smooth(raw, mode).length, 3); });
  assert.strictEqual(JSON.stringify(raw), snapshot);
  assert.throws(function () { suggestions.smooth(raw, '1/2'); }, /Unsupported/);
});

test('flat and downward targets use an explicit or derived reference level', function () {
  const points = [{frequencyHz: 500, magnitudeDb: 2}, {frequencyHz: 1000, magnitudeDb: 4}, {frequencyHz: 2000, magnitudeDb: 6}];
  assert.deepStrictEqual(suggestions.targetPoints(points, 'flat', 0, 3).map(p => p.magnitudeDb), [3, 3, 3]);
  assert.deepStrictEqual(suggestions.targetPoints(points, 'gentle-downward-tilt', -1, 4).map(p => p.magnitudeDb), [5, 4, 3]);
});

test('broad peaks produce conservative bounded peaking suggestions', function () {
  const source = measurement('broad-peak', f => gaussian(f, 1200, 0.45, 7));
  const result = suggestions.analyse(context(source), eq);
  assert.strictEqual(result.valid, true);
  assert.ok(result.suggestions.length >= 1 && result.suggestions.length <= 5);
  assert.ok(result.suggestions.every(item => item.filterType === 'peaking' && item.gainDb <= 0 && item.gainDb >= -6 && item.q >= 0.35 && item.q <= 4.5));
  assert.ok(result.objective.after < result.objective.before);
});

test('flat response stops without numerically pointless filters', function () {
  const result = suggestions.analyse(context(measurement('flat')), eq);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.suggestions.length, 0);
  assert.strictEqual(result.objective.after, result.objective.before);
});

test('deep narrow null is not filled and produces a visible warning', function () {
  const source = measurement('null', f => gaussian(f, 900, 0.06, -18));
  const result = suggestions.analyse(context(source, {smoothing: 'none'}), eq);
  assert.ok(result.warnings.some(item => item.code === 'DEEP_NULL_AVOIDED'));
  assert.ok(result.suggestions.every(item => !(item.gainDb > 3 && item.frequencyHz > 700 && item.frequencyHz < 1100)));
});

test('positive corrections obey boost limit and report headroom and protection concern', function () {
  const source = measurement('broad-dip', f => gaussian(f, 300, 0.6, -5));
  const input = context(source, {boostLimitDb: 1.5});
  input.protection.limiter.enabled = true;
  const result = suggestions.analyse(input, eq);
  assert.ok(result.suggestions.some(item => item.gainDb > 0));
  assert.ok(result.suggestions.every(item => item.gainDb <= 1.5));
  assert.ok(result.warnings.some(item => item.code === 'HEADROOM_REDUCTION'));
  assert.ok(result.warnings.some(item => item.code === 'PROTECTION_LIMIT_CONCERN'));
});

test('rapidly varying response is identified as noisy and constrained to broad corrections', function () {
  const source = measurement('noisy', function (frequency) {
    return Math.sin(Math.log(frequency) * 38) * 7;
  });
  const result = suggestions.analyse(context(source, {smoothing: 'none'}), eq);
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some(item => item.code === 'NOISY_MEASUREMENT'));
  assert.ok(result.suggestions.every(item => item.q <= 4.5 && Math.abs(item.gainDb) <= 6));
});

test('invalid targets, unsafe limits and ranges outside usable coverage are rejected', function () {
  const source = measurement('invalid-options');
  const result = suggestions.analyse(context(source, {
    target: 'automatic-room-correction',
    smoothing: '1/2',
    filterLimit: 8,
    boostLimitDb: 7,
    minimumFrequencyHz: 10,
    maximumFrequencyHz: 30000,
    referenceLevelDb: Infinity,
    tiltDbPerOctave: -4
  }), eq);
  assert.strictEqual(result.valid, false);
  ['INVALID_EQ_TARGET', 'INVALID_SMOOTHING', 'INVALID_FILTER_LIMIT', 'INVALID_BOOST_LIMIT',
    'RANGE_OUTSIDE_USABLE_COVERAGE', 'INVALID_TARGET_REFERENCE', 'INVALID_TARGET_TILT'].forEach(function (code) {
    assert.ok(result.errors.some(item => item.code === code), code);
  });
});

test('crossover and output role constrain the visible active range', function () {
  const source = measurement('tweeter', f => gaussian(f, 200, 0.5, 8));
  const input = context(source);
  input.output.role = 'tweeter';
  input.crossoverOutput.highPass = {enabled: true, cutoffHz: 1800};
  const result = suggestions.analyse(input, eq);
  assert.ok(result.activeRange.minimumFrequencyHz >= 1980);
  assert.ok(result.suggestions.every(item => item.frequencyHz >= result.activeRange.minimumFrequencyHz));
});

test('existing EQ is considered but remains unchanged', function () {
  const source = measurement('existing', f => gaussian(f, 1000, 0.4, 7));
  const band = {id: 'eq-a-1', enabled: true, type: 'peaking', frequencyHz: 1000, gainDb: -5, shape: 1, label: 'Existing'};
  const snapshot = JSON.stringify(band);
  const considered = suggestions.analyse(context(source, {}, [band]), eq);
  const ignored = suggestions.analyse(context(source, {considerExistingEQ: false}, [band]), eq);
  assert.ok(considered.objective.before < ignored.objective.before);
  assert.strictEqual(JSON.stringify(band), snapshot);
});

test('identical inputs produce identical stable suggestions', function () {
  const input = context(measurement('deterministic', f => gaussian(f, 1500, 0.5, 7)));
  assert.deepStrictEqual(suggestions.analyse(input, eq), suggestions.analyse(input, eq));
});

test('eligibility blocks assignment and stale derived sources and warns for weak provenance', function () {
  const source = measurement('weak', null, 'unknown');
  source.assignedOutputId = 'output-b';
  let result = suggestions.eligibility(source, [source], 'output-a');
  assert.strictEqual(result.eligible, false);
  assert.ok(result.errors.some(item => item.code === 'UNSUPPORTED_MEASUREMENT_ASSIGNMENT'));
  source.assignedOutputId = 'output-a';
  source.sourceFormat = 'derived-merge';
  source.mergeRecipe = {lowSourceId: 'missing', highSourceId: 'also-missing', lowSourceHash: 'x', highSourceHash: 'y'};
  result = suggestions.eligibility(source, [source], 'output-a');
  assert.ok(result.errors.some(item => item.code === 'STALE_DERIVED_MEASUREMENT'));
  assert.ok(result.warnings.some(item => item.code === 'UNKNOWN_MEASUREMENT_TYPE'));
});

test('accept adds selected standard bands, preserves existing EQ and enforces capacity', function () {
  const source = measurement('accept', f => gaussian(f, 1200, 0.45, 7) + gaussian(f, 3000, 0.35, 5));
  const analysis = suggestions.analyse(context(source), eq);
  const configuration = eq.defaultConfiguration(['output-a']);
  configuration.outputs[0].bands.push({id: 'eq-a-1', enabled: true, type: 'peaking', frequencyHz: 500, gainDb: -1, shape: 1, label: 'Existing'});
  const result = suggestions.accept(configuration, 'output-a', analysis, analysis.suggestions.slice(0, 1).map(item => item.id), eq);
  assert.strictEqual(configuration.outputs[0].bands.length, 1);
  assert.strictEqual(result.configuration.outputs[0].bands[0].label, 'Existing');
  assert.strictEqual(result.configuration.outputs[0].bands[1].type, 'peaking');
  assert.match(result.configuration.outputs[0].bands[1].id, /^eq-a-/);
  const full = eq.defaultConfiguration(['output-a']);
  for (let i = 1; i <= eq.MAX_BANDS_PER_OUTPUT; i++) full.outputs[0].bands.push({id: 'eq-a-' + i});
  assert.throws(function () { suggestions.accept(full, 'output-a', analysis, [analysis.suggestions[0].id], eq); }, /band count/);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
