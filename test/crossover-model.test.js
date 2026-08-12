'use strict';

const assert = require('assert');
const crossover = require('../Beocreate2/beo-extensions/signal-flow/crossover-model');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
}
function configured() {
  const design = routing.defaultConfiguration();
  design.outputs[0].enabled = true;
  design.outputs[0].role = 'midrange';
  design.connections = [{source: 'left', destination: 'output-a', enabled: true}];
  return design;
}
function codes(result) {
  return result.errors.concat(result.warnings).map(function(issue) { return issue.code; });
}

test('defines a versioned human-readable crossover for every output', function () {
  const design = routing.defaultConfiguration();
  assert.strictEqual(design.crossover.format, crossover.FORMAT);
  assert.strictEqual(design.crossover.version, 1);
  assert.strictEqual(design.crossover.sampleRateHz, 48000);
  assert.deepStrictEqual(design.crossover.outputs.map(function(output) { return output.outputId; }), routing.OUTPUT_IDS);
  assert.strictEqual(JSON.stringify(design).includes('b0'), false);
});

test('accepts Butterworth 6, 12, 18 and 24 dB slopes', function () {
  [6, 12, 18, 24].forEach(function(slope) {
    const design = configured();
    Object.assign(design.crossover.outputs[0].highPass, {enabled: true, family: 'butterworth', slopeDbPerOctave: slope, cutoffHz: 80});
    assert.strictEqual(routing.validate(design).valid, true);
  });
});

test('accepts only valid even-order Linkwitz-Riley slopes', function () {
  [12, 24].forEach(function(slope) {
    const design = configured();
    Object.assign(design.crossover.outputs[0].lowPass, {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: slope, cutoffHz: 2000});
    assert.strictEqual(routing.validate(design).valid, true);
  });
  const invalid = configured();
  Object.assign(invalid.crossover.outputs[0].lowPass, {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 18, cutoffHz: 2000});
  assert.ok(codes(routing.validate(invalid)).includes('UNSUPPORTED_FILTER_SLOPE'));
});

test('rejects invalid families, values, Nyquist and reversed cutoffs', function () {
  const design = configured();
  Object.assign(design.crossover.outputs[0].highPass, {enabled: true, family: 'chebyshev', cutoffHz: '80'});
  Object.assign(design.crossover.outputs[0].lowPass, {enabled: true, cutoffHz: 24000});
  let result = routing.validate(design);
  assert.ok(codes(result).includes('UNSUPPORTED_FILTER_FAMILY'));
  assert.ok(codes(result).includes('INVALID_CUTOFF'));
  assert.ok(codes(result).includes('CUTOFF_OUT_OF_RANGE') || codes(result).includes('CUTOFF_AT_OR_ABOVE_NYQUIST'));

  const reversed = configured();
  Object.assign(reversed.crossover.outputs[0].highPass, {enabled: true, cutoffHz: 3000});
  Object.assign(reversed.crossover.outputs[0].lowPass, {enabled: true, cutoffHz: 2000});
  result = routing.validate(reversed);
  assert.ok(codes(result).includes('REVERSED_CROSSOVER'));
});

test('rejects unsupported crossover versions and unknown output attachments', function () {
  const design = configured();
  design.crossover.version = 2;
  design.crossover.outputs[0].outputId = 'future-output';
  const result = routing.validate(design);
  assert.ok(codes(result).includes('UNSUPPORTED_CROSSOVER_VERSION'));
  assert.ok(codes(result).includes('UNKNOWN_CROSSOVER_OUTPUT'));
});

test('emits role, narrow-band and disabled-output warnings without blocking save', function () {
  const design = configured();
  design.outputs[0].role = 'tweeter';
  let result = routing.validate(design);
  assert.strictEqual(result.valid, true);
  assert.ok(codes(result).includes('TWEETER_WITHOUT_HIGH_PASS'));

  design.outputs[0].role = 'woofer';
  result = routing.validate(design);
  assert.ok(codes(result).includes('WOOFER_WITHOUT_LOW_PASS'));

  design.outputs[0].role = 'midrange';
  Object.assign(design.crossover.outputs[0].highPass, {enabled: true, cutoffHz: 1000});
  Object.assign(design.crossover.outputs[0].lowPass, {enabled: true, cutoffHz: 1100});
  result = routing.validate(design);
  assert.ok(codes(result).includes('NARROW_PASSBAND'));

  design.outputs[0].enabled = false;
  result = routing.validate(design);
  assert.ok(codes(result).includes('FILTERS_ON_DISABLED_OUTPUT'));
  assert.strictEqual(result.valid, true);
});

test('normalization is deterministic and adds defaults to legacy routing v1', function () {
  const legacy = routing.defaultConfiguration();
  delete legacy.crossover;
  assert.strictEqual(routing.validate(legacy).valid, true);
  const normalized = routing.normalize(legacy);
  assert.strictEqual(normalized.crossover.version, 1);
  assert.strictEqual(routing.serialize(normalized), routing.serialize(JSON.parse(routing.serialize(normalized))));
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
