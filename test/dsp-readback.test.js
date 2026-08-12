'use strict';

const assert = require('assert');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const target = require('../Beocreate2/beo-extensions/signal-flow/dsp-target-capability');
const compiler = require('../Beocreate2/beo-extensions/signal-flow/dsp-design-compiler');
const simulatorModule = require('../Beocreate2/beo-extensions/signal-flow/dsp-plan-simulator');

const tests = [];
function test(name, fn) { tests.push({name, fn}); }
function design() {
  const result = routing.defaultConfiguration();
  result.outputs.forEach(function (output, index) {
    Object.assign(output, {enabled: true, role: index % 2 ? 'tweeter' : 'woofer', side: index < 2 ? 'left' : 'right'});
    result.connections.push({source: index < 2 ? 'left' : 'right', destination: output.id, enabled: true});
    const crossover = result.crossover.outputs[index];
    Object.assign(index % 2 ? crossover.highPass : crossover.lowPass, {
      enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2000
    });
  });
  return result;
}
function plan(configuration) {
  return compiler.compile(configuration, {
    sourceRevision: routing.revision(configuration),
    programIdentity: {programID: target.PROGRAM.id, profileVersion: 10, checksum: target.PROGRAM.checksum}
  });
}

test('applies a complete plan muted, reads back and unmutes only after a match', function () {
  const configuration = design();
  const compilation = plan(configuration);
  const simulator = simulatorModule.createSimulator();
  assert.strictEqual(simulator.apply(compilation).muted, true);
  assert.strictEqual(simulator.readback().status, 'read-back');
  const comparison = simulator.verify(compilation, routing.revision(configuration), compiler);
  assert.strictEqual(comparison.status, 'matched');
  assert.strictEqual(comparison.muted, false);
});

test('reports a specific mismatch and remains muted', function () {
  const configuration = design();
  const compilation = plan(configuration);
  const simulator = simulatorModule.createSimulator();
  simulator.apply(compilation);
  const gain = compilation.operations.find(function (item) { return item.group === 'gain'; });
  simulator.setScenario({type: 'mismatch', operationIndex: gain.index, delta: 0.1});
  const comparison = simulator.verify(compilation, routing.revision(configuration), compiler);
  assert.strictEqual(comparison.status, 'different');
  assert.strictEqual(comparison.muted, true);
  assert.strictEqual(comparison.items.find(function (item) { return item.operationIndex === gain.index; }).status, 'different');
});

test('distinguishes acceptable readback quantization from a mismatch', function () {
  const configuration = design();
  const compilation = plan(configuration);
  const values = {};
  compilation.expectedReadback.forEach(function (item) { values[String(item.operationIndex)] = JSON.parse(JSON.stringify(item.expected)); });
  const coefficient = compilation.expectedReadback.find(function (item) { return Array.isArray(item.expected); });
  values[String(coefficient.operationIndex)][0] += coefficient.tolerance / 2;
  const comparison = compiler.compare(compilation, {available: true, values: values}, routing.revision(configuration));
  assert.strictEqual(comparison.status, 'matched');
  assert.strictEqual(comparison.items.find(function (item) { return item.operationIndex === coefficient.operationIndex; }).status, 'acceptable-quantization');
});

test('distinguishes unavailable readback and disconnected apply', function () {
  const configuration = design();
  const compilation = plan(configuration);
  const simulator = simulatorModule.createSimulator({connected: false});
  assert.strictEqual(simulator.apply(compilation).status, 'unknown');
  assert.strictEqual(simulator.verify(compilation, routing.revision(configuration), compiler).status, 'unknown');
});

test('reports partial application and never unmutes', function () {
  const configuration = design();
  const compilation = plan(configuration);
  const simulator = simulatorModule.createSimulator();
  simulator.setScenario({type: 'failure', operationIndex: 3});
  const result = simulator.apply(compilation);
  assert.strictEqual(result.partial, true);
  const comparison = simulator.verify(compilation, routing.revision(configuration), compiler);
  assert.notStrictEqual(comparison.status, 'matched');
  assert.strictEqual(comparison.muted, true);
});

test('models selected-operation delay and connection loss while remaining muted', function () {
  const configuration = design();
  const compilation = plan(configuration);
  const delayed = simulatorModule.createSimulator();
  delayed.setScenario({type: 'delay', operationIndex: 2});
  assert.strictEqual(delayed.apply(compilation).status, 'delayed');
  assert.strictEqual(delayed.state().muted, true);
  const disconnected = simulatorModule.createSimulator();
  disconnected.setScenario({type: 'disconnect', operationIndex: 2});
  assert.strictEqual(disconnected.apply(compilation).status, 'unknown');
  assert.strictEqual(disconnected.readback().status, 'unavailable');
  assert.strictEqual(disconnected.state().muted, true);
});

test('marks comparison stale when the design revision changed', function () {
  const configuration = design();
  const compilation = plan(configuration);
  const simulator = simulatorModule.createSimulator();
  simulator.apply(compilation);
  const comparison = simulator.verify(compilation, 'new-revision', compiler);
  assert.strictEqual(comparison.status, 'unknown');
  assert.strictEqual(comparison.stale, true);
  assert.strictEqual(comparison.muted, true);
});

test('clear and restart policy removes process-local applied state and remains muted', function () {
  const configuration = design();
  const simulator = simulatorModule.createSimulator();
  simulator.apply(plan(configuration));
  assert.strictEqual(simulator.clear().status, 'cleared');
  assert.deepStrictEqual(simulator.state(), {connected: true, hasAppliedPlan: false, partial: false, muted: true});
  assert.strictEqual(simulatorModule.createSimulator().state().hasAppliedPlan, false);
});

test('models timeout, malformed, stale and unavailable transport readback without a false match', function () {
  ['timeout', 'malformed-response', 'stale-response', 'readback-unavailable'].forEach(function (scenario) {
    const simulator = simulatorModule.createSimulator({connected: true});
    const prepared = plan(design());
    simulator.apply(prepared);
    simulator.setScenario({type: scenario});
    const readback = simulator.readback();
    const comparison = simulator.verify(prepared, prepared.sourceDesignRevision, compiler);
    assert.strictEqual(readback.status, scenario);
    assert.strictEqual(comparison.status, 'unknown');
    assert.strictEqual(comparison.muted, true);
  });
});

(async function run() {
  let failures = 0;
  for (const item of tests) {
    try { await item.fn(); console.log('ok - ' + item.name); }
    catch (error) { failures++; console.error('not ok - ' + item.name); console.error(error.stack); }
  }
  console.log('\n' + (tests.length - failures) + ' passed, ' + failures + ' failed');
  if (failures) process.exitCode = 1;
}());
