'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const stateModel = require('../Beocreate2/beo-extensions/signal-flow/routing-ui-state');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('ok - ' + name); } catch (error) { failed++; console.error('not ok - ' + name + '\n' + error.stack); } }
function ready() {
  const state = stateModel.create(), configuration = routing.defaultConfiguration();
  stateModel.receiveState(state, {configuration, revision: null, capabilities: routing.capabilities(), validation: routing.validate(configuration), runtime: {connected: true}, deployment: null});
  return state;
}

test('analysis remains transient and rejection does not dirty or alter the design', function () {
  const state = ready(), snapshot = JSON.stringify(state.draft);
  stateModel.receiveAlignmentAnalysis(state, {sources: [{outputId: 'output-a'}], suggestion: {}});
  assert.strictEqual(state.dirty, false);
  stateModel.rejectAlignment(state, 'output-a');
  assert.strictEqual(JSON.stringify(state.draft), snapshot);
});

test('accepted alignment is ordinary processing, stales EQ preview and supports undo', function () {
  const state = ready(), accepted = routing.clone(state.draft);
  accepted.channelProcessing.outputs[0].delay.valueMs = 0.4;
  accepted.channelProcessing.outputs[0].polarity.inverted = true;
  state.eqSuggestions['output-a'] = {analysisId: 'old-eq'};
  stateModel.receiveAlignmentDraft(state, {outputId: 'output-a', configuration: accepted, validation: routing.validate(accepted), delayMs: 0.4, polarityInverted: true});
  assert.strictEqual(state.dirty, true);
  assert.strictEqual(state.eqSuggestions['output-a'], undefined);
  stateModel.undoAlignment(state, 'output-a');
  assert.strictEqual(state.draft.channelProcessing.outputs[0].delay.valueMs, 0);
  assert.strictEqual(state.dirty, false);
});

test('disconnect retains analysis while normal save remains disabled', function () {
  const state = ready();
  stateModel.receiveAlignmentAnalysis(state, {sources: [{outputId: 'output-a'}], suggestion: {}});
  stateModel.connectionChanged(state, false);
  assert.ok(state.alignmentAnalyses['output-a']);
  assert.strictEqual(stateModel.canSave(state), false);
});

test('primary alignment UI stays contextual and diagnostics start behind Advanced', function () {
  const root = path.join(__dirname, '..', 'Beocreate2', 'beo-extensions', 'signal-flow');
  const client = fs.readFileSync(path.join(root, 'signal-flow-client.js'), 'utf8');
  const menu = fs.readFileSync(path.join(root, 'menu.html'), 'utf8');
  assert.ok(client.includes('>Align drivers</button>'));
  assert.ok(client.includes('First driver measurement'));
  assert.ok(client.includes('Second driver measurement'));
  const primary = client.indexOf('signal-flow-alignment-primary');
  const advanced = client.indexOf('Minimum analysis frequency');
  assert.ok(primary > -1 && advanced > primary);
  assert.ok(!menu.includes('Phase Laboratory'));
  assert.strictEqual((menu.match(/data-menu-title=/g) || []).length, 1);
});

test('semantics, milliseconds, polarity text, prediction and responsive stacking are explicit', function () {
  const root = path.join(__dirname, '..', 'Beocreate2', 'beo-extensions', 'signal-flow');
  const client = fs.readFileSync(path.join(root, 'signal-flow-client.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'signal-flow.css'), 'utf8');
  ['Driver phase and time alignment', 'resulting delay', 'Polarity:', 'Predicted acoustic sum', 'Confidence', 'aria-expanded'].forEach(text => assert.ok(client.includes(text), text));
  assert.ok(css.includes('.signal-flow-alignment-primary { align-items: stretch; flex-direction: column; }'));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
