'use strict';

const assert = require('assert');
const model = require('../Beocreate2/beo-extensions/signal-flow/routing-model');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
}
function configuredOutput(configuration, id, values) {
  Object.assign(configuration.outputs.find(function (output) { return output.id === id; }), values);
}

test('provides the conservative four-output default', function () {
  const configuration = model.defaultConfiguration();
  assert.strictEqual(configuration.format, model.FORMAT);
  assert.strictEqual(configuration.version, 1);
  assert.deepStrictEqual(configuration.outputs.map(function (output) { return output.dspChannel; }), ['a', 'b', 'c', 'd']);
  assert.ok(configuration.outputs.every(function (output) { return !output.enabled && output.role === 'unassigned'; }));
  assert.deepStrictEqual(configuration.connections, []);
  assert.strictEqual(model.validate(configuration).valid, true);
});

test('accepts representative stereo, two-way and three-way designs', function () {
  const stereo = model.defaultConfiguration();
  ['output-a', 'output-c'].forEach(function (id) { configuredOutput(stereo, id, {enabled: true, role: 'full-range', side: 'left'}); });
  ['output-b', 'output-d'].forEach(function (id) { configuredOutput(stereo, id, {enabled: true, role: 'full-range', side: 'right'}); });
  stereo.connections = [
    {source: 'left', destination: 'output-a', enabled: true},
    {source: 'right', destination: 'output-b', enabled: true},
    {source: 'left', destination: 'output-c', enabled: true},
    {source: 'right', destination: 'output-d', enabled: true}
  ];
  assert.strictEqual(model.validate(stereo).valid, true);

  const twoWay = model.clone(stereo);
  configuredOutput(twoWay, 'output-a', {role: 'woofer', label: 'Left woofer'});
  configuredOutput(twoWay, 'output-b', {role: 'woofer', label: 'Right woofer'});
  configuredOutput(twoWay, 'output-c', {role: 'tweeter', label: 'Left tweeter'});
  configuredOutput(twoWay, 'output-d', {role: 'tweeter', label: 'Right tweeter'});
  assert.strictEqual(model.validate(twoWay).valid, true);

  const threeWay = model.defaultConfiguration();
  configuredOutput(threeWay, 'output-a', {enabled: true, role: 'woofer', side: 'mono'});
  configuredOutput(threeWay, 'output-b', {enabled: true, role: 'midrange', side: 'mono'});
  configuredOutput(threeWay, 'output-c', {enabled: true, role: 'tweeter', side: 'mono'});
  threeWay.connections = ['output-a', 'output-b', 'output-c'].map(function (destination) {
    return {source: 'mono', destination: destination, enabled: true};
  });
  assert.strictEqual(model.validate(threeWay).valid, true);
});

test('preserves custom labels and role assignments deterministically', function () {
  const configuration = model.defaultConfiguration();
  configuredOutput(configuration, 'output-a', {label: 'Left bass driver', role: 'woofer', side: 'left'});
  const first = model.serialize(configuration);
  const second = model.serialize(JSON.parse(first));
  assert.strictEqual(first, second);
  assert.strictEqual(JSON.parse(first).outputs[0].label, 'Left bass driver');
  assert.strictEqual(model.revision(configuration), model.revision(JSON.parse(first)));
});

test('tolerates unknown optional properties without serializing UI state', function () {
  const configuration = model.defaultConfiguration();
  configuration.futureOptional = {note: true};
  configuration.outputs[0].expanded = true;
  assert.strictEqual(model.validate(configuration).valid, true);
  const parsed = JSON.parse(model.serialize(configuration));
  assert.strictEqual(parsed.futureOptional, undefined);
  assert.strictEqual(parsed.outputs[0].expanded, undefined);
});

test('rejects unsupported versions, malformed roles and identifiers', function () {
  const configuration = model.defaultConfiguration();
  configuration.version = 2;
  configuration.outputs[0].role = 'horn';
  configuration.outputs[1].id = 'unknown';
  const result = model.validate(configuration);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function (error) { return error.code === 'UNSUPPORTED_VERSION'; }));
  assert.ok(result.errors.some(function (error) { return error.code === 'INVALID_ROLE'; }));
  assert.ok(result.errors.some(function (error) { return error.code === 'UNKNOWN_OUTPUT'; }));
});

test('rejects duplicate outputs and invalid connections', function () {
  const configuration = model.defaultConfiguration();
  configuration.outputs[1].id = 'output-a';
  configuration.connections = [
    {source: 'unknown', destination: 'output-a', enabled: true},
    {source: 'left', destination: 'missing', enabled: true}
  ];
  const result = model.validate(configuration);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function (error) { return error.code === 'DUPLICATE_OUTPUT'; }));
  assert.ok(result.errors.some(function (error) { return error.code === 'UNKNOWN_INPUT'; }));
  assert.ok(result.errors.some(function (error) { return error.code === 'UNKNOWN_CONNECTION_OUTPUT'; }));
});

test('rejects missing required outputs', function () {
  const configuration = model.defaultConfiguration();
  configuration.outputs.pop();
  const result = model.validate(configuration);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function (error) { return error.code === 'MISSING_OUTPUT'; }));
});

test('enforces one source per output and unavailable capabilities', function () {
  const configuration = model.defaultConfiguration();
  configuration.connections = [
    {source: 'left', destination: 'output-a', enabled: true},
    {source: 'right', destination: 'output-a', enabled: true}
  ];
  const unavailable = model.capabilities(false);
  const result = model.validate(configuration, unavailable);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function (error) { return error.code === 'MULTIPLE_SOURCES'; }));
  assert.ok(result.errors.some(function (error) { return error.code === 'INPUT_UNAVAILABLE'; }));
  assert.ok(result.errors.some(function (error) { return error.code === 'OUTPUT_UNAVAILABLE'; }));
});

test('separates blocking errors from useful warnings', function () {
  const configuration = model.defaultConfiguration();
  configuredOutput(configuration, 'output-a', {enabled: true, role: 'tweeter', side: 'right'});
  configuration.connections = [{source: 'left', destination: 'output-a', enabled: true}];
  const result = model.validate(configuration);
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some(function (warning) { return warning.code === 'SIDE_MISMATCH'; }));
  assert.ok(result.warnings.some(function (warning) { return warning.code === 'TWEETER_UNPROTECTED'; }));
  assert.ok(result.warnings.some(function (warning) { return warning.code === 'UNASSIGNED_ROLE'; }));
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
