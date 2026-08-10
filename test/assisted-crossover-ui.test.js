'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const stateModel = require('../Beocreate2/beo-extensions/signal-flow/routing-ui-state');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('ok - ' + name); } catch (error) { failed++; console.error('not ok - ' + name + '\n' + error.stack); } }
function state() {
  const result = stateModel.create(), configuration = routing.defaultConfiguration();
  Object.assign(configuration.outputs[0], {enabled: true, role: 'woofer', label: 'Left woofer'});
  Object.assign(configuration.outputs[1], {enabled: true, role: 'tweeter', label: 'Left tweeter'});
  result.loading = false; result.saved = stateModel.clone(configuration); result.draft = stateModel.clone(configuration); result.revision = 'saved-1'; result.validation = {valid: true, errors: [], warnings: []};
  return result;
}
function analysis() {
  return {analysisId: 'analysis-1', mode: 'phase-aware', sources: [{id: 'low', outputId: 'output-a'}, {id: 'high', outputId: 'output-b'}],
    suggestions: [{id: 'candidate-1', frequencyHz: 2000}, {id: 'candidate-2', frequencyHz: 2500}]};
}

test('eligibility and suggestions remain transient and reject leaves the design clean', function () {
  const s = state(), before = JSON.stringify(s.draft);
  stateModel.receiveCrossoverAssistanceEligibility(s, {outputId: 'output-a', pairs: [{eligible: true}]});
  stateModel.receiveCrossoverSuggestions(s, analysis());
  assert.strictEqual(s.dirty, false); assert.strictEqual(s.selectedCrossoverSuggestions['output-a'], 'candidate-1');
  stateModel.rejectCrossoverSuggestions(s, 'output-a');
  assert.strictEqual(JSON.stringify(s.draft), before); assert.strictEqual(s.crossoverAssistanceAnalyses['output-a'], undefined); assert.match(s.message, /unchanged/);
});

test('alternative selection changes review state without mutating the draft', function () {
  const s = state(), before = JSON.stringify(s.draft); stateModel.receiveCrossoverSuggestions(s, analysis());
  stateModel.selectCrossoverSuggestion(s, 'output-a', 'candidate-2');
  assert.strictEqual(s.selectedCrossoverSuggestions['output-a'], 'candidate-2'); assert.strictEqual(s.selectedCrossoverSuggestions['output-b'], 'candidate-2');
  assert.strictEqual(JSON.stringify(s.draft), before); assert.strictEqual(s.dirty, false);
});

test('accepted suggestion becomes an ordinary editable draft, invalidates temporary analyses and supports undo', function () {
  const s = state(), prior = stateModel.clone(s.draft); stateModel.receiveCrossoverSuggestions(s, analysis());
  const changed = stateModel.clone(s.draft);
  changed.crossover.outputs[0].lowPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2000};
  changed.crossover.outputs[1].highPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2000};
  stateModel.receiveCrossoverSuggestionDraft(s, {configuration: changed, lowPassOutputId: 'output-a', highPassOutputId: 'output-b', changedProcessingOutputIds: ['output-b'], validation: {valid: true, errors: [], warnings: []}});
  assert.strictEqual(s.dirty, true); assert.strictEqual(s.draft.crossover.outputs[0].lowPass.cutoffHz, 2000); assert.deepStrictEqual(s.eqSuggestions, {}); assert.deepStrictEqual(s.alignmentAnalyses, {});
  stateModel.editCrossover(s, 'output-a', 'lowPass', 'cutoffHz', 2100); assert.strictEqual(s.draft.crossover.outputs[0].lowPass.cutoffHz, 2100);
  stateModel.undoCrossoverSuggestion(s, 'output-a'); assert.deepStrictEqual(s.draft, prior); assert.strictEqual(s.dirty, false);
});

test('ordinary design edits stale suggestions while disconnect retains an unchanged review', function () {
  const s = state(); stateModel.receiveCrossoverSuggestions(s, analysis()); stateModel.connectionChanged(s, false);
  assert.ok(s.crossoverAssistanceAnalyses['output-a']); assert.strictEqual(s.connected, false); assert.strictEqual(stateModel.canSave(s), false);
  stateModel.connectionChanged(s, true); stateModel.editProcessing(s, 'output-a', 'delay', 'valueMs', 0.2);
  assert.deepStrictEqual(s.crossoverAssistanceAnalyses, {}); assert.deepStrictEqual(s.selectedCrossoverSuggestions, {});
});

test('discard clears every transient crossover-assistance and undo state', function () {
  const s = state(); s.dirty = true; stateModel.receiveCrossoverSuggestions(s, analysis()); s.crossoverAssistanceUndo['output-a'] = stateModel.clone(s.saved);
  stateModel.discard(s); assert.deepStrictEqual(s.crossoverAssistanceEligibility, {}); assert.deepStrictEqual(s.crossoverAssistanceAnalyses, {}); assert.deepStrictEqual(s.selectedCrossoverSuggestions, {}); assert.deepStrictEqual(s.crossoverAssistanceUndo, {});
});

test('primary UI stays inside Crossover, limits alternatives and hides diagnostics behind Advanced', function () {
  const client = fs.readFileSync(path.join(__dirname, '../Beocreate2/beo-extensions/signal-flow/signal-flow-client.js'), 'utf8');
  assert.match(client, /<h3>Crossover<\/h3>[\s\S]*crossoverAssistanceControls\(output\)/);
  assert.match(client, />Suggest setup</); assert.match(client, /maximumSuggestions|suggestions\.length/);
  assert.match(client, /<details class=\"signal-flow-crossover-assistance-advanced\"/); assert.match(client, /aria-expanded=\"false\"/);
  assert.doesNotMatch(client, /Crossover Optimisation Dashboard|top-level crossover optimisation/);
});

test('semantics, timing confidence, graph summary and responsive stacking are explicit', function () {
  const client = fs.readFileSync(path.join(__dirname, '../Beocreate2/beo-extensions/signal-flow/signal-flow-client.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../Beocreate2/beo-extensions/signal-flow/signal-flow.css'), 'utf8');
  assert.match(client, /aria-label=\"Assisted crossover design/); assert.match(client, /First driver measurement/); assert.match(client, /Second driver measurement/);
  assert.match(client, /user-declared|timingReference\.statement/); assert.match(client, /role=\"img\"/); assert.match(client, /Apply suggestion to/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*signal-flow-crossover-assistance-primary[\s\S]*flex-direction: column/);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
