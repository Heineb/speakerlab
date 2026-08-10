'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const model = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const serviceModule = require('../Beocreate2/beo-extensions/signal-flow/routing-service');
const controllerModule = require('../Beocreate2/beo-extensions/signal-flow/routing-controller');
const compiler = require('../Beocreate2/beo-extensions/signal-flow/dsp-design-compiler');
const target = require('../Beocreate2/beo-extensions/signal-flow/dsp-target-capability');
const simulatorModule = require('../Beocreate2/beo-extensions/signal-flow/dsp-plan-simulator');

let passed = 0;
let failed = 0;
function test(name, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-protection-'));
  try { fn(root); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
  finally { fs.rmSync(root, {recursive: true, force: true}); }
}
function configured() {
  const design = model.defaultConfiguration();
  Object.assign(design.outputs[0], {enabled: true, role: 'woofer', side: 'left', label: 'Protected woofer'});
  design.connections = [{source: 'left', destination: 'output-a', enabled: true}];
  design.crossover.outputs[0].lowPass.enabled = true;
  design.crossover.outputs[0].lowPass.cutoffHz = 2000;
  design.channelProcessing.outputs[0].gain.valueDb = -2;
  design.parametricEQ.outputs[0].bands.push({id: 'eq-a-1', enabled: true, type: 'peaking', frequencyHz: 1000, gainDb: 6, shape: 0.7071, label: 'Headroom test'});
  const protection = design.driverProtection.outputs[0];
  Object.assign(protection.driver, {manufacturer: 'Example', model: 'Woofer 8', nominalImpedanceOhms: 8, continuousPowerWatts: 50, shortTermPowerWatts: 100, notes: 'User-entered rating'});
  Object.assign(protection.amplifier, {maximumRmsVoltage: 25, maximumPeakVoltage: 35.3553, gainDb: 26, channelAssignment: 'A'});
  Object.assign(protection.limiter, {enabled: true, thresholdPeakVoltage: 28.2843, configuredRmsVoltageLimit: 20, safetyMarginDb: -3, attackMs: 5, releaseMs: 250});
  return design;
}
function identity() { return {programID: target.PROGRAM.id, profileVersion: target.PROGRAM.profileVersion, checksum: target.PROGRAM.checksum, metadataAvailable: true}; }

test('persists complete protection atomically and derives an electrical preview', function (root) {
  const service = serviceModule.createService({dataDirectory: root});
  const saved = service.save(configured(), null);
  const persisted = JSON.parse(fs.readFileSync(path.join(root, 'signal-flow.json')));
  assert.deepStrictEqual(persisted.driverProtection, saved.configuration.driverProtection);
  assert.strictEqual(saved.verified, true);
  const preview = service.protectionPreview(saved.configuration, 'output-a');
  assert.strictEqual(preview.calculation.driverContinuousRmsVoltage, 20);
  assert.strictEqual(preview.calculation.potentialNetBoostDb, 4);
  assert.strictEqual(preview.target.perOutputLimiterMapping, 'unknown');
  assert.strictEqual(preview.physicalDeploymentAllowed, false);
});

test('rejects invalid protection without partial persistence', function (root) {
  const service = serviceModule.createService({dataDirectory: root});
  const saved = service.save(configured(), null);
  const invalid = model.clone(saved.configuration);
  invalid.driverProtection.outputs[0].limiter.attackMs = 0;
  assert.throws(function () { service.save(invalid, saved.revision); }, function (error) { return error.code === 'VALIDATION_FAILED'; });
  assert.strictEqual(service.state({}).configuration.driverProtection.outputs[0].limiter.attackMs, 5);
});

test('migrates a previous design by adding conservative protection defaults in memory', function () {
  const previous = model.defaultConfiguration();
  delete previous.driverProtection;
  assert.strictEqual(model.validate(previous).valid, true);
  const normalized = model.normalize(previous);
  assert.strictEqual(normalized.driverProtection.format, model.protectionModel.FORMAT);
  assert.ok(normalized.driverProtection.outputs.every(function (item) { return item.limiter.enabled === false; }));
});

test('exposes preview and synthetic limiting through named WebSocket envelopes', function (root) {
  const service = serviceModule.createService({dataDirectory: root});
  const messages = [];
  const controller = controllerModule.createController({service: service, send: function (header, content) { messages.push({header: header, content: content}); }});
  const design = configured();
  controller.handle({header: 'calculateProtection', content: {configuration: design, outputId: 'output-a'}});
  controller.handle({header: 'simulateProtection', content: {configuration: design, outputId: 'output-a', sequence: [{levelDbfs: -20, durationMs: 20}, {levelDbfs: 0, durationMs: 20}]}});
  assert.strictEqual(messages[0].header, 'protectionPreview');
  assert.strictEqual(messages[1].header, 'protectionSimulation');
  assert.strictEqual(messages[1].content.simulation.audioGenerated, false);
  assert.ok(messages[1].content.simulation.points[1].gainReductionDb > 0);
});

test('compiles simulator-only protection with unknown physical mapping and exact readback', function () {
  const design = configured();
  const revision = model.revision(design);
  const compilation = compiler.compile(design, {sourceRevision: revision, programIdentity: identity()});
  assert.strictEqual(compilation.status, 'prepared');
  const operation = compilation.operations.find(function (item) { return item.group === 'simulator-protection'; });
  assert.ok(operation);
  assert.strictEqual(operation.physicalWriteAllowed, false);
  assert.ok(compilation.unsupportedDesignElements.some(function (item) { return item.field === 'driverProtection'; }));
  const classification = compilation.mappingClassifications.find(function (item) { return item.operationIndex === operation.index; });
  assert.strictEqual(classification.confidence, 'unknown');
  assert.strictEqual(classification.readable, 'unavailable');
  const simulator = simulatorModule.createSimulator({connected: true});
  assert.strictEqual(simulator.apply(compilation).applied, true);
  assert.strictEqual(simulator.verify(compilation, revision, compiler).status, 'matched');
  simulator.setScenario({type: 'mismatch', operationIndex: operation.index, delta: 0.5});
  const mismatch = simulator.verify(compilation, revision, compiler);
  assert.strictEqual(mismatch.status, 'different');
  assert.strictEqual(mismatch.items.find(function (item) { return item.operationIndex === operation.index; }).difference, 0.5);
});

test('keeps physical preparation blockers when amplifier assumptions are missing', function () {
  const design = configured();
  design.driverProtection.outputs[0].amplifier.maximumPeakVoltage = null;
  const revision = model.revision(design);
  const compilation = compiler.compile(design, {sourceRevision: revision, programIdentity: identity()});
  assert.ok(compilation.warnings.some(function (item) { return item.code === 'PROTECTION_THRESHOLD_CONVERSION_UNRESOLVED'; }));
  assert.strictEqual(compilation.outputs[0].protection.simulatorSupported, false);
  assert.strictEqual(compilation.operations.some(function (item) { return item.group === 'simulator-protection'; }), false);
  assert.strictEqual(target.capability().physicalReadiness.physicalApplyReady, false);
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
