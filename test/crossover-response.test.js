'use strict';

const assert = require('assert');
const crossover = require('../Beocreate2/beo-extensions/signal-flow/crossover-model');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
}
function magnitudeDb(response) {
  return 20 * Math.log10(Math.sqrt(response.real * response.real + response.imaginary * response.imaginary));
}
function filter(family, slope, cutoff) {
  return {enabled: true, family, slopeDbPerOctave: slope, cutoffHz: cutoff};
}
function close(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, (message || 'value') + ': expected ' + expected + ', got ' + actual);
}

test('Butterworth high-pass and low-pass orders are finite and -3.0103 dB at cutoff', function () {
  [6, 12, 18, 24].forEach(function(slope) {
    ['high-pass', 'low-pass'].forEach(function(type) {
      const sections = crossover.designFilter(type, filter('butterworth', slope, 2000), 48000);
      assert.strictEqual(sections.length, Math.ceil((slope / 6) / 2));
      sections.forEach(function(section) {
        Object.keys(section).forEach(function(key) { assert.ok(Number.isFinite(section[key])); });
      });
      close(magnitudeDb(crossover.filterResponse(sections, 2000, 48000)), -3.0102999566, 1e-8, type + ' ' + slope);
    });
  });
});

test('Linkwitz-Riley responses are -6.0206 dB at cutoff', function () {
  [12, 24].forEach(function(slope) {
    ['high-pass', 'low-pass'].forEach(function(type) {
      const sections = crossover.designFilter(type, filter('linkwitz-riley', slope, 2000), 48000);
      close(magnitudeDb(crossover.filterResponse(sections, 2000, 48000)), -6.0205999133, 1e-8, type + ' ' + slope);
    });
  });
});

test('matching Linkwitz-Riley high-pass and low-pass have the expected phase relationship', function () {
  const lr2Low = crossover.filterResponse(crossover.designFilter('low-pass', filter('linkwitz-riley', 12, 2000), 48000), 2000, 48000);
  const lr2High = crossover.filterResponse(crossover.designFilter('high-pass', filter('linkwitz-riley', 12, 2000), 48000), 2000, 48000);
  close(Math.abs(Math.atan2(lr2Low.imaginary, lr2Low.real) - Math.atan2(lr2High.imaginary, lr2High.real)), Math.PI, 1e-8, 'LR2 phase difference');

  const lr4Low = crossover.filterResponse(crossover.designFilter('low-pass', filter('linkwitz-riley', 24, 2000), 48000), 2000, 48000);
  const lr4High = crossover.filterResponse(crossover.designFilter('high-pass', filter('linkwitz-riley', 24, 2000), 48000), 2000, 48000);
  close(Math.abs(lr4Low.real - lr4High.real), 0, 1e-8, 'LR4 real parity');
  close(Math.abs(lr4Low.imaginary - lr4High.imaginary), 0, 1e-8, 'LR4 imaginary parity');
});

test('disabled filters are flat and combined band-pass response is finite', function () {
  const output = {
    outputId: 'output-a',
    highPass: filter('butterworth', 12, 200),
    lowPass: filter('linkwitz-riley', 24, 3000)
  };
  const preview = crossover.preview(output, 48000);
  assert.strictEqual(preview.points.length, 121);
  assert.ok(preview.points.every(function(point) { return Number.isFinite(point.magnitudeDb); }));
  assert.ok(preview.points[0].magnitudeDb < -20);
  assert.ok(preview.points[preview.points.length - 1].magnitudeDb < -40);

  output.highPass.enabled = false;
  output.lowPass.enabled = false;
  const flat = crossover.preview(output, 48000);
  assert.ok(flat.points.every(function(point) { return point.magnitudeDb === 0; }));
});

test('response generation is deterministic and bounded below Nyquist', function () {
  const output = {
    outputId: 'output-a',
    highPass: filter('butterworth', 18, 80),
    lowPass: filter('butterworth', 24, 4000)
  };
  const first = crossover.preview(output, 48000);
  const second = crossover.preview(output, 48000);
  assert.deepStrictEqual(first, second);
  assert.ok(first.maximumHz < 24000);
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
