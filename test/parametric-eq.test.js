'use strict';

const assert = require('assert');
const eq = require('../Beocreate2/beo-extensions/signal-flow/parametric-eq-model');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
}
function codes(result) {
  return result.errors.concat(result.warnings).map(function (item) { return item.code; });
}
function designWithBand(type) {
  const design = routing.defaultConfiguration();
  Object.assign(design.outputs[0], {enabled: true, role: 'full-range'});
  design.connections.push({source: 'left', destination: 'output-a', enabled: true});
  const added = eq.addBand(design.parametricEQ, 'output-a', type || 'peaking');
  design.parametricEQ = added.configuration;
  return {design, band: design.parametricEQ.outputs[0].bands[0]};
}

test('defines a bounded versioned design without authoritative coefficients', function () {
  const design = routing.defaultConfiguration();
  const capability = eq.capabilities();
  assert.strictEqual(design.parametricEQ.format, eq.FORMAT);
  assert.strictEqual(capability.sampleRateHz, 48000);
  assert.strictEqual(capability.maxBandsPerOutput, 12);
  assert.strictEqual(JSON.stringify(design.parametricEQ).includes('"b0"'), false);
});

test('calculates finite stable RBJ peaking and shelf coefficients', function () {
  ['peaking', 'low-shelf', 'high-shelf'].forEach(function (type) {
    [-12, -3, 0, 6, 12].forEach(function (gainDb) {
      const band = eq.defaultBand('eq-a-1', type);
      Object.assign(band, {frequencyHz: type === 'peaking' ? 1000 : 200, gainDb});
      const coefficients = eq.designBand(band, 48000);
      Object.values(coefficients).forEach(function (value) { assert.ok(Number.isFinite(value)); });
      assert.strictEqual(eq.stable(coefficients), true);
    });
  });
});

test('represents bypass and zero gain as identity', function () {
  const band = eq.defaultBand('eq-a-1', 'peaking');
  band.enabled = false;
  assert.deepStrictEqual(eq.designBand(band, 48000), {b0: 1, b1: 0, b2: 0, a1: 0, a2: 0});
  band.enabled = true;
  band.gainDb = 0;
  assert.deepStrictEqual(eq.designBand(band, 48000), {b0: 1, b1: 0, b2: 0, a1: 0, a2: 0});
});

test('uses Q for peaking and separately bounded RBJ shelf slope S', function () {
  let fixture = designWithBand('peaking');
  fixture.band.shape = 10;
  assert.strictEqual(routing.validate(fixture.design).valid, true);
  fixture = designWithBand('low-shelf');
  fixture.band.shape = 1;
  assert.strictEqual(routing.validate(fixture.design).valid, true);
  fixture.band.shape = 1.01;
  assert.ok(codes(routing.validate(fixture.design)).includes('EQ_SHAPE_OUT_OF_RANGE'));
});

test('validates version, type, identifiers, numeric ranges, Nyquist and output', function () {
  const fixture = designWithBand();
  const duplicate = Object.assign({}, fixture.band);
  fixture.design.parametricEQ.version = 2;
  Object.assign(fixture.band, {type: 'all-pass', frequencyHz: 24000, gainDb: 13, shape: 11});
  fixture.design.parametricEQ.outputs[0].bands.push(duplicate);
  fixture.design.parametricEQ.outputs[0].outputId = 'future-output';
  const found = codes(routing.validate(fixture.design));
  ['UNSUPPORTED_EQ_VERSION', 'UNSUPPORTED_EQ_FILTER_TYPE', 'EQ_FREQUENCY_OUT_OF_RANGE',
    'EQ_GAIN_OUT_OF_RANGE', 'DUPLICATE_EQ_BAND_ID', 'UNKNOWN_EQ_OUTPUT'].forEach(function (code) {
    assert.ok(found.includes(code), code);
  });
});

test('uses stable IDs for add, duplicate, remove and distinct-output copy', function () {
  let configuration = eq.defaultConfiguration(routing.OUTPUT_IDS);
  let result = eq.addBand(configuration, 'output-a', 'peaking');
  configuration = result.configuration;
  assert.strictEqual(result.bandId, 'eq-a-1');
  result = eq.duplicateBand(configuration, 'output-a', 'eq-a-1');
  configuration = result.configuration;
  assert.strictEqual(result.bandId, 'eq-a-2');
  configuration = eq.removeBand(configuration, 'output-a', 'eq-a-1');
  configuration = eq.copyEQ(configuration, 'output-a', 'output-b');
  assert.strictEqual(configuration.outputs[1].bands[0].id, 'eq-b-1');
  configuration.outputs[0].bands[0].gainDb = 6;
  assert.notStrictEqual(configuration.outputs[1].bands[0].gainDb, 6);
});

test('warns without blocking for boost, overlap, cumulative risk and deployment status', function () {
  const fixture = designWithBand();
  fixture.band.gainDb = 8;
  let added = eq.addBand(fixture.design.parametricEQ, 'output-a', 'peaking');
  fixture.design.parametricEQ = added.configuration;
  Object.assign(fixture.design.parametricEQ.outputs[0].bands[1], {frequencyHz: 1200, gainDb: 7});
  const result = routing.validate(fixture.design);
  assert.strictEqual(result.valid, true);
  ['LARGE_EQ_BOOST', 'OVERLAPPING_EQ_BOOSTS', 'EXCESSIVE_CUMULATIVE_EQ_BOOST',
    'EQ_TARGET_MAPPING_UNVERIFIED', 'EQ_NOT_DEPLOYED'].forEach(function (code) { assert.ok(codes(result).includes(code), code); });
});

test('enforces the shared crossover and EQ section capacity', function () {
  const fixture = designWithBand();
  Object.assign(fixture.design.crossover.outputs[0].highPass, {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 80});
  Object.assign(fixture.design.crossover.outputs[0].lowPass, {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 4000});
  while (fixture.design.parametricEQ.outputs[0].bands.length < 12) {
    fixture.design.parametricEQ = eq.addBand(fixture.design.parametricEQ, 'output-a', 'peaking').configuration;
  }
  const excess = Object.assign({}, fixture.design.parametricEQ.outputs[0].bands[0], {id: 'eq-a-13'});
  fixture.design.parametricEQ.outputs[0].bands.push(excess);
  assert.ok(codes(routing.validate(fixture.design)).includes('EQ_TARGET_CAPACITY_EXCEEDED'));
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
