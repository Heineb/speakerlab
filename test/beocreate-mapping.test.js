'use strict';

const assert = require('assert');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const capability = require('../Beocreate2/beo-extensions/signal-flow/dsp-target-capability');
const compiler = require('../Beocreate2/beo-extensions/signal-flow/dsp-design-compiler');
const readinessModel = require('../Beocreate2/beo-extensions/signal-flow/dsp-physical-readiness');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}
function design() {
  const value = routing.defaultConfiguration();
  value.outputs.forEach(function (output, index) {
    Object.assign(output, {enabled: true, role: index % 2 ? 'tweeter' : 'woofer'});
    value.connections.push({source: index < 2 ? 'left' : 'right', destination: output.id, enabled: true});
    if (index % 2) value.crossover.outputs[index].highPass.enabled = true;
  });
  return value;
}

test('classifies every current compiled operation and cites evidence', function () {
  const source = design();
  const revision = routing.revision(source);
  const result = compiler.compile(source, {sourceRevision: revision, programIdentity: {
    programID: capability.PROGRAM.id, profileVersion: capability.PROGRAM.profileVersion,
    checksum: capability.PROGRAM.checksum, metadataAvailable: true
  }});
  assert.strictEqual(result.mappingClassifications.length, result.operations.length);
  result.mappingClassifications.forEach(function (item) {
    assert.ok(['strongly-evidenced', 'unknown'].includes(item.confidence));
    assert.notStrictEqual(item.blocker, undefined);
  });
});

test('does not label parameter mappings verified without physical evidence', function () {
  const readiness = capability.capability().physicalReadiness;
  assert.ok(readiness.matrix.every(function (row) { return row.confidence !== 'verified'; }));
  assert.ok(readiness.matrix.every(function (row) { return row.evidence; }));
  assert.strictEqual(readiness.physicalApplyReady, false);
});

test('unknown and unreadable mappings deterministically block readiness', function () {
  const outputs = capability.capability().outputs;
  const readiness = readinessModel.report(outputs, {unknownField: 'routing', unreadableField: 'gain'});
  assert.strictEqual(readiness.status, 'physical-apply-blocked');
  assert.ok(readiness.matrix.some(function (row) { return row.field === 'routing' && row.confidence === 'unknown'; }));
  assert.ok(readiness.matrix.some(function (row) { return row.field === 'gain' && row.readable === 'unavailable'; }));
  assert.ok(readiness.blockers.some(function (blocker) { return /Readback unavailable/.test(blocker); }));
});

test('safe-state classification is safety-critical and not verifiable', function () {
  const safeState = capability.capability().physicalReadiness.matrix.find(function (row) { return row.field === 'safe-state'; });
  assert.strictEqual(safeState.safetyClassification, 'critical');
  assert.strictEqual(safeState.verifiable, false);
  assert.strictEqual(safeState.readable, 'unknown');
});

test('matrix output is deterministic', function () {
  const outputs = capability.capability().outputs;
  assert.deepStrictEqual(readinessModel.report(outputs), readinessModel.report(outputs));
});

console.log('\n' + passed + ' passed, 0 failed');
