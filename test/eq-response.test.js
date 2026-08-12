'use strict';

const assert = require('assert');
const eq = require('../Beocreate2/beo-extensions/signal-flow/parametric-eq-model');
const crossover = require('../Beocreate2/beo-extensions/signal-flow/crossover-model');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
}
function db(section, frequency) { return 20 * Math.log10(Math.hypot(...Object.values(eq.responseAt([section], frequency, 48000)))); }

test('peaking response reaches the requested center gain', function () {
  const band = Object.assign(eq.defaultBand('eq-a-1', 'peaking'), {frequencyHz: 1000, gainDb: 6, shape: 1});
  assert.ok(Math.abs(db(eq.designBand(band, 48000), 1000) - 6) < 0.001);
});

test('shelf responses approach their requested passband gain', function () {
  const low = Object.assign(eq.defaultBand('eq-a-1', 'low-shelf'), {frequencyHz: 1000, gainDb: 6, shape: 1});
  const high = Object.assign(eq.defaultBand('eq-a-2', 'high-shelf'), {frequencyHz: 1000, gainDb: -6, shape: 1});
  assert.ok(db(eq.designBand(low, 48000), 10) > 5.9);
  assert.ok(db(eq.designBand(high, 48000), 20000) < -5.8);
});

test('combined response and headroom estimate are deterministic', function () {
  const output = {outputId: 'output-a', bands: [
    Object.assign(eq.defaultBand('eq-a-1', 'peaking'), {gainDb: 6, shape: 1}),
    Object.assign(eq.defaultBand('eq-a-2', 'peaking'), {frequencyHz: 1200, gainDb: 4, shape: 1})
  ]};
  const cross = {outputId: 'output-a', highPass: crossover.defaultFilter('high-pass'), lowPass: crossover.defaultFilter('low-pass')};
  const first = eq.preview(output, cross, crossover, 2, {points: 61});
  const second = eq.preview(output, cross, crossover, 2, {points: 61});
  assert.deepStrictEqual(first, second);
  assert.ok(first.maximumEqBoostDb > 8);
  assert.strictEqual(first.potentialBoostDb, first.maximumEqBoostDb + 2);
  assert.ok(first.summary.includes('Electrical simulation only'));
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
