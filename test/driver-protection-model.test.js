'use strict';

const assert = require('assert');
const model = require('../Beocreate2/beo-extensions/signal-flow/driver-protection-model');
const outputs = ['output-a', 'output-b', 'output-c', 'output-d'];
let passed = 0;
let failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('ok - ' + name); } catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); } }
function configured() {
  const configuration = model.defaultConfiguration(outputs);
  const item = configuration.outputs[0];
  Object.assign(item.driver, {manufacturer: 'Example', model: 'Eight', nominalImpedanceOhms: 8, continuousPowerWatts: 50, shortTermPowerWatts: 100});
  Object.assign(item.amplifier, {maximumRmsVoltage: 25, maximumPeakVoltage: 35.3553, gainDb: 26});
  Object.assign(item.limiter, {enabled: true, thresholdPeakVoltage: 28.2843, configuredRmsVoltageLimit: 20, safetyMarginDb: -3, attackMs: 5, releaseMs: 250});
  return configuration;
}

test('converts electrical units deterministically for 4 and 8 ohm examples', function () {
  assert.ok(Math.abs(model.rmsVoltageFromPower(50, 8) - 20) < 1e-12);
  assert.ok(Math.abs(model.rmsVoltageFromPower(100, 4) - 20) < 1e-12);
  assert.ok(Math.abs(model.powerFromRmsVoltage(20, 8) - 50) < 1e-12);
  assert.ok(Math.abs(model.peakVoltageFromRms(20) - 28.2842712475) < 1e-9);
  assert.ok(Math.abs(model.rmsVoltageFromPeak(model.peakVoltageFromRms(20)) - 20) < 1e-12);
});

test('uses voltage dB relationships and a visible safety margin', function () {
  assert.ok(Math.abs(model.dbToVoltageRatio(6.020599913) - 2) < 1e-9);
  assert.ok(Math.abs(model.voltageRatioToDb(0.5) + 6.020599913) < 1e-9);
  assert.ok(Math.abs(model.applySafetyMargin(20, -3) - 14.1589156877) < 1e-9);
});

test('calculates driver, amplifier, threshold and headroom summaries', function () {
  const item = configured().outputs[0];
  const result = model.calculateOutput(item, {channelGainDb: -2, maximumEqBoostDb: 6, maximumElectricalGainDb: 3.5});
  assert.strictEqual(result.driverContinuousRmsVoltage, 20);
  assert.strictEqual(result.configuredRmsPowerWatts, 50);
  assert.strictEqual(result.potentialNetBoostDb, 4);
  assert.strictEqual(result.maximumElectricalGainDb, 3.5);
  assert.strictEqual(result.limitingFactor, 'limiter-after-margin');
  assert.strictEqual(result.dspVoltageMappingResolved, false);
});

test('validates ranges, modes, relationships and known outputs', function () {
  const configuration = configured();
  assert.strictEqual(model.validate(configuration, outputs, [], {outputs: []}, {}).valid, true);
  configuration.outputs[0].driver.nominalImpedanceOhms = 0;
  configuration.outputs[0].driver.continuousPowerWatts = -1;
  configuration.outputs[0].amplifier.maximumPeakVoltage = 10;
  configuration.outputs[0].amplifier.maximumRmsVoltage = 20;
  configuration.outputs[0].limiter.mode = 'compressor';
  configuration.outputs[0].limiter.attackMs = 0;
  configuration.outputs[0].limiter.releaseMs = Infinity;
  configuration.outputs[0].limiter.safetyMarginDb = 1;
  const result = model.validate(configuration, outputs, [], {outputs: []}, {});
  assert.strictEqual(result.valid, false);
  ['IMPEDANCE_OUT_OF_RANGE', 'CONTINUOUS_POWER_OUT_OF_RANGE', 'IMPOSSIBLE_AMPLIFIER_VOLTAGE_RELATIONSHIP', 'UNSUPPORTED_LIMITER_MODE', 'INVALID_LIMITER_ATTACK', 'INVALID_LIMITER_RELEASE', 'INVALID_SAFETY_MARGIN'].forEach(function (code) {
    assert.ok(result.errors.some(function (error) { return error.code === code; }), code);
  });
});

test('warns without blocking for missing limits, conflicts, boost and crossover risk', function () {
  const configuration = configured();
  const result = model.validate(configuration, outputs,
    [{id: 'output-a', label: 'Tweeter', role: 'tweeter'}],
    {outputs: [{outputId: 'output-a', highPass: {enabled: false}, lowPass: {enabled: false}}]},
    {'output-a': {channelGainDb: 1, maximumEqBoostDb: 7}});
  assert.strictEqual(result.valid, true);
  ['PROTECTION_TWEETER_WITHOUT_HIGH_PASS', 'LARGE_POTENTIAL_BOOST', 'LIMITER_MAPPING_UNKNOWN', 'WRITE_SIDE_SAFETY_UNVERIFIED', 'PROTECTION_SIMULATOR_ONLY', 'MANUFACTURER_RATING_NOT_GUARANTEE'].forEach(function (code) {
    assert.ok(result.warnings.some(function (warning) { return warning.code === code; }), code);
  });
});

test('normalizes defaults, fields and prior designs without protection', function () {
  const defaults = model.defaultConfiguration(outputs);
  const normalized = model.normalize(null, outputs);
  assert.deepStrictEqual(normalized, defaults);
  const custom = configured();
  custom.outputs[0].transientUI = true;
  assert.strictEqual(model.normalize(custom, outputs).outputs[0].transientUI, undefined);
});

test('simulates disabled, attack, sustained limiting, release and repeated transients', function () {
  const limiter = configured().outputs[0].limiter;
  const sequence = [
    {levelDbfs: -20, durationMs: 10},
    {levelDbfs: -2, durationMs: 1},
    {levelDbfs: -2, durationMs: 20},
    {levelDbfs: -20, durationMs: 20},
    {levelDbfs: -2, durationMs: 1}
  ];
  const result = model.simulateLimiter(limiter, -6, sequence);
  assert.strictEqual(result.audioGenerated, false);
  assert.strictEqual(result.points[0].gainReductionDb, 0);
  assert.ok(result.points[1].gainReductionDb > 0 && result.points[1].gainReductionDb < 4);
  assert.ok(result.points[2].gainReductionDb > result.points[1].gainReductionDb);
  assert.ok(result.points[3].gainReductionDb < result.points[2].gainReductionDb);
  assert.ok(result.points[4].gainReductionDb > result.points[3].gainReductionDb);
  limiter.enabled = false;
  assert.ok(model.simulateLimiter(limiter, -6, sequence).points.every(function (point) { return point.gainReductionDb === 0; }));
});

test('requires an explicit amplifier voltage reference for normalized simulation', function () {
  const limiter = configured().outputs[0].limiter;
  const result = model.simulateLimiter(limiter, null, [{levelDbfs: 0, durationMs: 10}]);
  assert.strictEqual(result.supported, false);
  assert.ok(result.reason.includes('Amplifier maximum peak voltage'));
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
