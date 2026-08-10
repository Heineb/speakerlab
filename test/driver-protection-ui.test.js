'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const model = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const ui = require('../Beocreate2/beo-extensions/signal-flow/routing-ui-state');
const directory = path.join(__dirname, '..', 'Beocreate2', 'beo-extensions', 'signal-flow');
let passed = 0;
let failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('ok - ' + name); } catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); } }
function state() {
  const value = ui.create();
  ui.receiveState(value, {configuration: model.defaultConfiguration(), revision: null, capabilities: model.capabilities(), validation: model.validate(model.defaultConfiguration()), runtime: {connected: true}, deployment: null});
  return value;
}

test('edits protection draft without mutating saved state and marks compilation stale', function () {
  const value = state();
  value.deployment = {compilation: {status: 'prepared'}, stale: false};
  ui.editProtection(value, 'output-a', 'driver', 'nominalImpedanceOhms', 8);
  ui.editProtection(value, 'output-a', 'limiter', 'enabled', true);
  assert.strictEqual(value.draft.driverProtection.outputs[0].driver.nominalImpedanceOhms, 8);
  assert.strictEqual(value.saved.driverProtection.outputs[0].driver.nominalImpedanceOhms, null);
  assert.strictEqual(value.dirty, true);
  assert.strictEqual(value.deployment.stale, true);
});

test('stores calculated preview and textual simulator result by output', function () {
  const value = state();
  ui.receiveProtectionPreview(value, {outputId: 'output-a', calculation: {driverContinuousRmsVoltage: 20}, warnings: []});
  ui.receiveProtectionSimulation(value, {outputId: 'output-a', simulation: {supported: true, audioGenerated: false, points: []}});
  assert.strictEqual(value.protectionPreviews['output-a'].calculation.driverContinuousRmsVoltage, 20);
  assert.strictEqual(value.protectionSimulations['output-a'].simulation.audioGenerated, false);
  assert.ok(value.message.includes('No audio'));
});

test('retains protection draft while disconnected and detects reconnect conflict', function () {
  const value = state();
  ui.editProtection(value, 'output-a', 'limiter', 'thresholdPeakVoltage', 20);
  ui.connectionChanged(value, false);
  assert.strictEqual(ui.canSave(value), false);
  ui.receiveState(value, {configuration: model.defaultConfiguration(), revision: 'server-change', capabilities: model.capabilities(), validation: {valid: true, errors: [], warnings: []}, runtime: {connected: true}, deployment: null});
  assert.strictEqual(value.conflict, true);
  assert.strictEqual(value.draft.driverProtection.outputs[0].limiter.thresholdPeakVoltage, 20);
});

test('uses labelled native controls, textual units, progressive disclosure and responsive stacking', function () {
  const client = fs.readFileSync(path.join(directory, 'signal-flow-client.js'), 'utf8');
  const menu = fs.readFileSync(path.join(directory, 'menu.html'), 'utf8');
  const css = fs.readFileSync(path.join(directory, 'signal-flow.css'), 'utf8');
  ['Driver Protection', 'Nominal impedance', 'Continuous power rating', 'V RMS', 'V peak', 'Safety margin', 'Attack', 'Release', 'Calculated limits', 'Limiter simulator summary', 'No physical Apply action'].forEach(function (text) { assert.ok(client.includes(text), text); });
  assert.ok(client.includes('<details class="signal-flow-protection"'));
  assert.ok(client.includes('aria-label="Driver Protection for'));
  assert.ok(client.includes('aria-live="polite"'));
  assert.ok(menu.includes('does not deploy to the DSP'));
  assert.ok(css.includes('.signal-flow-protection-grid'));
  assert.ok(css.includes('@media (max-width: 620px)'));
});

test('avoids guaranteed-safety and physical-apply claims', function () {
  const client = fs.readFileSync(path.join(directory, 'signal-flow-client.js'), 'utf8');
  ['Guaranteed safe', 'Driver protected', 'Cannot clip', 'Cannot damage'].forEach(function (claim) { assert.strictEqual(client.includes(claim), false, claim); });
  assert.ok(client.includes('do not guarantee thermal, excursion, acoustic or damage protection'));
  assert.strictEqual(client.includes('Apply to physical'), false);
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
