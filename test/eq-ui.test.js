'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const eq = require('../Beocreate2/beo-extensions/signal-flow/parametric-eq-model');
const ui = require('../Beocreate2/beo-extensions/signal-flow/routing-ui-state');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
}
function fixture() {
  const state = ui.create();
  const configuration = routing.defaultConfiguration();
  configuration.parametricEQ = eq.addBand(configuration.parametricEQ, 'output-a', 'peaking').configuration;
  ui.receiveState(state, {capabilities: routing.capabilities(true), configuration, revision: null,
    validation: routing.validate(configuration), runtime: {connected: true}});
  return state;
}

test('edits, selects, reorders and bypasses bands in the local draft', function () {
  const state = fixture();
  state.draft.parametricEQ = eq.addBand(state.draft.parametricEQ, 'output-a', 'low-shelf').configuration;
  ui.selectEQBand(state, 'output-a', 'eq-a-2');
  ui.editEQBand(state, 'output-a', 'eq-a-2', 'enabled', false);
  ui.reorderEQBand(state, 'output-a', 'eq-a-2', -1);
  assert.strictEqual(state.selectedEQBands['output-a'], 'eq-a-2');
  assert.strictEqual(state.draft.parametricEQ.outputs[0].bands[0].id, 'eq-a-2');
  assert.strictEqual(state.draft.parametricEQ.outputs[0].bands[0].enabled, false);
  assert.strictEqual(state.dirty, true);
});

test('receives authoritative EQ drafts and response without persisting selection', function () {
  const state = fixture();
  ui.receiveEQResponse(state, {outputId: 'output-a', response: {summary: 'Potential boost: 6 dB', points: []}});
  assert.ok(state.eqResponses['output-a'].summary.includes('Potential boost'));
  const result = eq.duplicateBand(state.draft.parametricEQ, 'output-a', 'eq-a-1');
  const configuration = routing.normalize(state.draft);
  configuration.parametricEQ = result.configuration;
  ui.receiveEQDraft(state, {action: 'duplicate', bandId: result.bandId, configuration, validation: routing.validate(configuration)});
  assert.strictEqual(state.selectedEQBands['output-a'], 'eq-a-2');
  assert.strictEqual(JSON.stringify(state.draft).includes('selectedEQBands'), false);
});

test('markup exposes semantic controls, units, confirmations, graph summary and mobile stacking', function () {
  const directory = path.join(__dirname, '..', 'Beocreate2', 'beo-extensions', 'signal-flow');
  const menu = fs.readFileSync(path.join(directory, 'menu.html'), 'utf8');
  const client = fs.readFileSync(path.join(directory, 'signal-flow-client.js'), 'utf8');
  const css = fs.readFileSync(path.join(directory, 'signal-flow.css'), 'utf8');
  ['Parametric EQ', 'Band list', 'Band editor', 'Center or corner frequency (Hz)', 'Gain (dB)',
    'aria-pressed', 'role=\"img\"', 'Does not include driver or enclosure response, room effects or acoustic summation'].forEach(function (text) {
    assert.ok(client.includes(text), text);
  });
  assert.ok(menu.includes('Reset all EQ bands?'));
  assert.ok(css.includes('.signal-flow-eq-layout'));
  assert.ok(css.includes('grid-template-columns: 1fr'));
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
