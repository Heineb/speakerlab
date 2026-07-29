'use strict';

const assert = require('assert');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const target = require('../Beocreate2/beo-extensions/signal-flow/dsp-target-capability');
const compiler = require('../Beocreate2/beo-extensions/signal-flow/dsp-design-compiler');
const golden = require('./fixtures/current-beocreate-dsp-golden.json');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
}
function identity(overrides) {
  return Object.assign({
    programID: target.PROGRAM.id,
    profileVersion: target.PROGRAM.profileVersion,
    checksum: target.PROGRAM.checksum,
    metadataAvailable: true
  }, overrides);
}
function design() {
  const result = routing.defaultConfiguration();
  const definitions = [
    ['output-a', 'woofer', 'left', 'left'], ['output-b', 'tweeter', 'left', 'left'],
    ['output-c', 'woofer', 'right', 'right'], ['output-d', 'tweeter', 'right', 'right']
  ];
  definitions.forEach(function (item, index) {
    Object.assign(result.outputs[index], {enabled: true, role: item[1], side: item[2], label: item[0]});
    result.connections.push({source: item[3], destination: item[0], enabled: true});
    const crossover = result.crossover.outputs[index];
    if (item[1] === 'woofer') Object.assign(crossover.lowPass, {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2000});
    else Object.assign(crossover.highPass, {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2000});
    Object.assign(result.channelProcessing.outputs[index], {
      gain: {valueDb: -2.5}, delay: {valueMs: 0.42}, polarity: {inverted: index === 1}
    });
  });
  return result;
}
function compile(configuration, overrides) {
  return compiler.compile(configuration, Object.assign({
    sourceRevision: routing.revision(configuration),
    programIdentity: identity()
  }, overrides));
}

test('defines the repository-evidenced current Beocreate capability and identity', function () {
  const capability = target.capability();
  assert.strictEqual(capability.identity.sampleRateHz, golden.identity.sampleRateHz);
  assert.strictEqual(capability.outputs['output-a'].routing, golden.outputA.routing);
  assert.strictEqual(capability.outputs['output-d'].filters, 451);
  assert.deepStrictEqual(capability.crossover.wordOrder, golden.coefficientWordOrder);
  assert.strictEqual(target.identify(identity()).status, 'known-compatible');
  assert.strictEqual(target.identify(identity({checksum: 'OTHER'})).status, 'known-incompatible');
  assert.strictEqual(target.identify({}).status, 'unknown');
  assert.strictEqual(target.identify({metadataAvailable: false}).status, 'metadata-unavailable');
});

test('compiles a representative two-way stereo design deterministically', function () {
  const configuration = design();
  const first = compile(configuration);
  const second = compile(configuration);
  assert.deepStrictEqual(first, second);
  assert.strictEqual(first.status, 'prepared');
  assert.strictEqual(first.errors.length, 0);
  assert.strictEqual(first.sourceDesignRevision, routing.revision(configuration));
  assert.strictEqual(first.operations[0].group, 'enter-safe-state');
  assert.strictEqual(first.operations.at(-1).group, 'leave-safe-state');
  assert.strictEqual(first.operations.at(-1).deferredUntilVerified, true);
  assert.strictEqual(first.operations.filter(function (item) { return item.group === 'routing'; }).length, 4);
  assert.strictEqual(first.operations.filter(function (item) { return item.group === 'filter-coefficients'; }).length, 64);
});

test('matches legacy coefficient order and signed 5.23 golden encoding', function () {
  assert.deepStrictEqual(compiler.filterWords({b0: 1, b1: 0.5, b2: 0, a1: -0.5, a2: 0}).map(function (item) { return item.hex; }),
    ['00000000', '00800000', '01000000', '00000000', '00800000']);
  assert.strictEqual(compiler.fixed(1).hex, golden.encodingExamples.positiveUnity5_23);
  assert.strictEqual(compiler.fixed(-0.5).hex, golden.encodingExamples.negativeHalfLegacy5_23);
});

test('compiles routing, attenuation gain, integer delay and dedicated polarity mappings', function () {
  const result = compile(design());
  const route = result.operations.find(function (item) { return item.outputId === 'output-c' && item.group === 'routing'; });
  const gain = result.operations.find(function (item) { return item.outputId === 'output-a' && item.group === 'gain'; });
  const delay = result.operations.find(function (item) { return item.outputId === 'output-a' && item.group === 'delay'; });
  const polarity = result.operations.find(function (item) { return item.outputId === 'output-b' && item.group === 'polarity'; });
  assert.strictEqual(route.target, 4862);
  assert.strictEqual(route.encodedValue.integer, 1);
  assert.ok(Math.abs(gain.expectedReadback - Math.pow(10, -2.5 / 20)) < 1e-7);
  assert.strictEqual(delay.encodedValue.integer, 20);
  assert.strictEqual(delay.encodedValue.hex, golden.encodingExamples.twentyIntegerSamples);
  assert.notStrictEqual(delay.quantizationDifference, 0);
  assert.strictEqual(polarity.target, 4865);
  assert.strictEqual(polarity.encodedValue.integer, 1);
  assert.strictEqual(polarity.encodedValue.hex, golden.encodingExamples.invertedPolarity);
});

test('blocks stale, unknown and incompatible identities', function () {
  const configuration = design();
  assert.ok(compiler.compile(configuration, {sourceRevision: 'stale', programIdentity: identity()}).errors.some(function (item) { return item.code === 'DESIGN_REVISION_MISMATCH'; }));
  assert.ok(compiler.compile(configuration, {sourceRevision: routing.revision(configuration), programIdentity: {}}).errors.some(function (item) { return item.code === 'UNTRUSTED_DSP_PROGRAM'; }));
  assert.ok(compiler.compile(configuration, {sourceRevision: routing.revision(configuration), programIdentity: identity({programID: 'other'})}).errors.some(function (item) { return item.code === 'UNTRUSTED_DSP_PROGRAM'; }));
});

test('blocks unprotected tweeters, unsupported positive gain and unknown mappings', function () {
  const configuration = design();
  configuration.crossover.outputs[1].highPass.enabled = false;
  configuration.channelProcessing.outputs[0].gain.valueDb = 3;
  const capability = target.capability();
  delete capability.outputs['output-d'];
  const result = compile(configuration, {capability: capability});
  assert.ok(result.errors.some(function (item) { return item.code === 'TWEETER_PROTECTION_REQUIRED'; }));
  assert.ok(result.errors.some(function (item) { return item.code === 'GAIN_ABOVE_VERIFIED_CAPABILITY'; }));
  assert.ok(result.errors.some(function (item) { return item.code === 'UNKNOWN_OUTPUT_MAPPING'; }));
  assert.strictEqual(result.status, 'unsupported');
});

test('disabled outputs compile to zero gain without losing deterministic groups', function () {
  const configuration = design();
  configuration.outputs[0].enabled = false;
  const result = compile(configuration);
  const gain = result.operations.find(function (item) { return item.outputId === 'output-a' && item.group === 'gain'; });
  assert.strictEqual(gain.expectedReadback, 0);
});

test('blocks conflicting target parameters and non-finite values without throwing', function () {
  const configuration = design();
  configuration.channelProcessing.outputs[0].gain.valueDb = NaN;
  const capability = target.capability();
  capability.outputs['output-b'].gain = capability.outputs['output-b'].delay;
  const result = compile(configuration, {capability: capability});
  assert.ok(result.errors.some(function (item) { return item.code === 'NON_FINITE_ENCODED_VALUE'; }));
  assert.ok(result.errors.some(function (item) { return item.code === 'CONFLICTING_PARAMETER_TARGET'; }));
  assert.strictEqual(result.status, 'unsupported');
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
