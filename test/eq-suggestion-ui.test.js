'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const stateModel = require('../Beocreate2/beo-extensions/signal-flow/routing-ui-state');
const routingModel = require('../Beocreate2/beo-extensions/signal-flow/routing-model');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name + '\n' + error.stack); }
}
function ready() {
  const state = stateModel.create();
  const configuration = routingModel.defaultConfiguration();
  stateModel.receiveState(state, {configuration, revision: null, capabilities: routingModel.capabilities(), validation: routingModel.validate(configuration), runtime: {connected: true}, deployment: null});
  return state;
}

test('suggestions remain transient review state and do not dirty the design', function () {
  const state = ready();
  const snapshot = JSON.stringify(state.draft);
  stateModel.receiveEQSuggestions(state, {outputId: 'output-a', suggestions: [{id: 'suggestion-1'}, {id: 'suggestion-2'}]});
  assert.strictEqual(state.dirty, false);
  assert.strictEqual(JSON.stringify(state.draft), snapshot);
  assert.deepStrictEqual(state.selectedEQSuggestions['output-a'], []);
  stateModel.toggleEQSuggestion(state, 'output-a', 'suggestion-1', true);
  assert.deepStrictEqual(state.selectedEQSuggestions['output-a'], ['suggestion-1']);
});

test('rejecting suggestions leaves design and measurement unchanged', function () {
  const state = ready();
  const snapshot = JSON.stringify(state.draft);
  stateModel.receiveEQSuggestions(state, {outputId: 'output-a', suggestions: [{id: 'suggestion-1'}]});
  stateModel.rejectEQSuggestions(state, 'output-a');
  assert.strictEqual(JSON.stringify(state.draft), snapshot);
  assert.strictEqual(state.eqSuggestions['output-a'], undefined);
  assert.match(state.message, /unchanged/);
});

test('accepted draft is ordinary EQ and can be undone before save', function () {
  const state = ready();
  const accepted = routingModel.clone(state.draft);
  accepted.parametricEQ.outputs[0].bands.push({id: 'eq-a-1', enabled: true, type: 'peaking', frequencyHz: 1000, gainDb: -3, shape: 1, label: 'Assisted EQ'});
  stateModel.receiveEQSuggestionDraft(state, {outputId: 'output-a', configuration: accepted, validation: routingModel.validate(accepted), acceptedSuggestionIds: ['suggestion-1']});
  assert.strictEqual(state.dirty, true);
  assert.strictEqual(state.draft.parametricEQ.outputs[0].bands.length, 1);
  stateModel.undoEQSuggestionAcceptance(state, 'output-a');
  assert.strictEqual(state.draft.parametricEQ.outputs[0].bands.length, 0);
  assert.strictEqual(state.dirty, false);
});

test('disconnect retains suggestion review but normal save and acceptance can be disabled', function () {
  const state = ready();
  stateModel.receiveEQSuggestions(state, {outputId: 'output-a', suggestions: [{id: 'suggestion-1'}]});
  stateModel.connectionChanged(state, false);
  assert.strictEqual(state.eqSuggestions['output-a'].suggestions.length, 1);
  assert.strictEqual(stateModel.canSave(state), false);
  assert.match(state.message, /Disconnected/);
});

test('selected measurement eligibility is stable by ID and ignores unrelated source errors', function () {
  const sparse = {id: 'sparse', eligible: false, errors: [{code: 'INSUFFICIENT_MEASUREMENT_POINTS', message: 'Too few points.'}]};
  const derived = {id: 'derived', eligible: false, errors: [{code: 'STALE_DERIVED_MEASUREMENT', message: 'Recompute.'}]};
  const valid = {id: 'valid', eligible: true, errors: []};
  const eligibility = {measurements: [sparse, derived, valid]};
  assert.strictEqual(stateModel.eqSuggestionSource(eligibility, 'derived'), derived);
  eligibility.measurements.reverse();
  assert.strictEqual(stateModel.eqSuggestionSource(eligibility, 'derived'), derived);
  assert.deepStrictEqual(stateModel.eqSuggestionSource(eligibility, 'derived').errors.map(item => item.code), ['STALE_DERIVED_MEASUREMENT']);
  assert.strictEqual(stateModel.eqSuggestionSource(eligibility, 'missing'), valid);
});

test('default UI stays contextual and hides numerical optimisation controls under Advanced', function () {
  const root = path.join(__dirname, '..', 'Beocreate2', 'beo-extensions', 'signal-flow');
  const client = fs.readFileSync(path.join(root, 'signal-flow-client.js'), 'utf8');
  const menu = fs.readFileSync(path.join(root, 'menu.html'), 'utf8');
  assert.ok(client.includes('Suggest EQ from measurement'));
  assert.ok(client.includes('class="signal-flow-eq-suggestion-advanced"'));
  assert.ok(client.includes('selectEQMeasurement'));
  assert.ok(client.includes('This merged measurement is out of date. Recompute it before using Suggest EQ.'));
  assert.ok(client.includes('<summary aria-expanded="false">Advanced</summary>'));
  const advancedSummary = client.indexOf('<summary aria-expanded="false">Advanced</summary>');
  assert.ok(client.indexOf('Analysis smoothing') > advancedSummary);
  assert.ok(client.indexOf('Suggestion limit') > advancedSummary);
  assert.ok(!menu.includes('EQ Optimisation'));
  assert.ok(!menu.includes('Assisted EQ Dashboard'));
  assert.strictEqual((menu.match(/data-menu-title=/g) || []).length, 1);
});

test('semantic labels, textual prediction and responsive stacking are explicit', function () {
  const root = path.join(__dirname, '..', 'Beocreate2', 'beo-extensions', 'signal-flow');
  const client = fs.readFileSync(path.join(root, 'signal-flow-client.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'signal-flow.css'), 'utf8');
  ['Reference measurement', 'Target', 'Predicted with suggestions', 'Headroom consequence', 'aria-expanded'].forEach(function (text) { assert.ok(client.includes(text), text); });
  assert.ok(css.includes('.signal-flow-eq-suggestion-primary { align-items: stretch; flex-direction: column; }'));
  assert.ok(client.includes('not guaranteed to improve perceived sound'));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
