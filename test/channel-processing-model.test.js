'use strict';

const assert = require('assert');
const processing = require('../Beocreate2/beo-extensions/signal-flow/channel-processing-model');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
}
function codes(result) {
  return result.errors.concat(result.warnings).map(function (issue) { return issue.code; });
}

test('uses current Beocreate 48 kHz and 2,000-sample delay capability', function () {
  const caps = processing.capabilities();
  assert.strictEqual(caps.delay.sampleRateHz, 48000);
  assert.strictEqual(caps.delay.maximumSamples, 2000);
  assert.strictEqual(caps.delay.maximumMs, 41.666667);
  assert.deepStrictEqual(caps.gain, {minimumDb: -60, maximumDb: 6});
});

test('converts delay, samples and distance deterministically', function () {
  assert.strictEqual(processing.millisecondsToSamples(1, 48000), 48);
  assert.strictEqual(processing.millisecondsToSamples(0.01, 48000), 0);
  assert.strictEqual(processing.samplesToMilliseconds(2000, 48000), 41.666667);
  assert.strictEqual(processing.millisecondsToDistance(1, 'cm'), 34.3);
  assert.strictEqual(processing.millisecondsToDistance(10, 'm'), 3.43);
  assert.strictEqual(processing.distanceToMilliseconds(34.3, 'cm'), 1);
  assert.strictEqual(processing.distanceToMilliseconds(3.43, 'm'), 10);
  assert.strictEqual(processing.millisecondsToSamples(0, 44100), 0);
});

test('defaults and normalization are human-readable and deterministic', function () {
  const value = processing.defaultConfiguration(routing.OUTPUT_IDS);
  assert.strictEqual(value.format, processing.FORMAT);
  assert.ok(value.outputs.every(function (item) {
    return item.gain.valueDb === 0 && item.delay.valueMs === 0 && item.polarity.inverted === false;
  }));
  assert.deepStrictEqual(processing.normalize(value, routing.OUTPUT_IDS), value);
});

test('rejects gain, delay, polarity, output and future-version errors', function () {
  const configuration = processing.defaultConfiguration(routing.OUTPUT_IDS);
  configuration.version = 2;
  configuration.outputs[0].gain.valueDb = Infinity;
  configuration.outputs[1].gain.valueDb = 7;
  configuration.outputs[2].delay.valueMs = -1;
  configuration.outputs[3].polarity.inverted = 'yes';
  const result = processing.validate(configuration, routing.OUTPUT_IDS, routing.defaultConfiguration().outputs, []);
  assert.strictEqual(result.valid, false);
  ['UNSUPPORTED_PROCESSING_VERSION', 'INVALID_GAIN', 'GAIN_OUT_OF_RANGE', 'NEGATIVE_DELAY', 'INVALID_POLARITY'].forEach(function (code) {
    assert.ok(codes(result).includes(code), code);
  });
});

test('reports absent processing properties without throwing', function () {
  const invalid = processing.defaultConfiguration(routing.OUTPUT_IDS);
  delete invalid.outputs[0].gain;
  delete invalid.outputs[1].delay;
  delete invalid.outputs[2].polarity;
  const result = processing.validate(invalid, routing.OUTPUT_IDS, routing.defaultConfiguration().outputs, []);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function (issue) { return issue.code === 'INVALID_GAIN'; }));
  assert.ok(result.errors.some(function (issue) { return issue.code === 'INVALID_DELAY'; }));
  assert.ok(result.errors.some(function (issue) { return issue.code === 'INVALID_POLARITY'; }));
});

test('rejects delay above the current sample capability', function () {
  const configuration = processing.defaultConfiguration(routing.OUTPUT_IDS);
  configuration.outputs[0].delay.valueMs = 41.68;
  const result = processing.validate(configuration, routing.OUTPUT_IDS, routing.defaultConfiguration().outputs, []);
  assert.ok(codes(result).includes('DELAY_OUT_OF_RANGE'));
});

test('warns for headroom, rounding, disabled and unrouted processing', function () {
  const design = routing.defaultConfiguration();
  const configuration = design.channelProcessing;
  configuration.outputs[0].gain.valueDb = 2;
  configuration.outputs[0].delay.valueMs = 1.01;
  const result = processing.validate(configuration, routing.OUTPUT_IDS, design.outputs, design.connections);
  assert.strictEqual(result.valid, true);
  ['POSITIVE_GAIN_HEADROOM', 'DELAY_ROUNDED_TO_SAMPLE', 'PROCESSING_ON_DISABLED_OUTPUT', 'PROCESSING_ON_UNROUTED_OUTPUT', 'PROCESSING_NOT_DEPLOYED'].forEach(function (code) {
    assert.ok(codes(result).includes(code), code);
  });
});

test('warns when likely stereo pairs have inconsistent processing', function () {
  const design = routing.defaultConfiguration();
  Object.assign(design.outputs[0], {enabled: true, role: 'woofer', side: 'left'});
  Object.assign(design.outputs[1], {enabled: true, role: 'woofer', side: 'right'});
  design.connections = [
    {source: 'left', destination: 'output-a', enabled: true},
    {source: 'right', destination: 'output-b', enabled: true}
  ];
  design.channelProcessing.outputs[0].gain.valueDb = -2;
  design.channelProcessing.outputs[0].delay.valueMs = 1;
  design.channelProcessing.outputs[0].polarity.inverted = true;
  const result = routing.validate(design);
  ['STEREO_GAIN_MISMATCH', 'STEREO_DELAY_MISMATCH', 'STEREO_POLARITY_MISMATCH'].forEach(function (code) {
    assert.ok(codes(result).includes(code), code);
  });
});

test('processing participates in routing serialization and revision', function () {
  const first = routing.defaultConfiguration();
  const second = routing.clone(first);
  second.channelProcessing.outputs[0].gain.valueDb = -2.5;
  second.channelProcessing.outputs[0].delay.valueMs = 0.42;
  second.channelProcessing.outputs[0].polarity.inverted = true;
  assert.notStrictEqual(routing.revision(first), routing.revision(second));
  assert.deepStrictEqual(JSON.parse(routing.serialize(second)).channelProcessing, second.channelProcessing);
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
