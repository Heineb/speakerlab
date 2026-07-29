'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const ui = require('../Beocreate2/beo-extensions/signal-flow/routing-ui-state');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
}
function stateFixture() {
  const state = ui.create();
  const configuration = routing.defaultConfiguration();
  ui.receiveState(state, {
    capabilities: routing.capabilities(true),
    configuration,
    revision: null,
    validation: routing.validate(configuration),
    runtime: {simulated: true, connected: true, deploymentStatus: 'not-deployed', statusLabel: 'Saved design · Simulated · Not deployed to DSP'}
  });
  return state;
}

test('edits both filters and keeps invalid numeric input in the draft', function () {
  const state = stateFixture();
  ui.editCrossover(state, 'output-a', 'highPass', 'enabled', true);
  ui.editCrossover(state, 'output-a', 'highPass', 'family', 'linkwitz-riley');
  ui.editCrossover(state, 'output-a', 'highPass', 'slopeDbPerOctave', 24);
  ui.editCrossover(state, 'output-a', 'highPass', 'cutoffHz', 'not-a-number');
  assert.strictEqual(state.draft.crossover.outputs[0].highPass.enabled, true);
  assert.strictEqual(state.draft.crossover.outputs[0].highPass.family, 'linkwitz-riley');
  assert.strictEqual(state.draft.crossover.outputs[0].highPass.cutoffHz, 'not-a-number');
  assert.strictEqual(state.dirty, true);
});

test('receives server-authoritative response and copied/reset drafts', function () {
  const state = stateFixture();
  ui.receiveCrossoverResponse(state, {outputId: 'output-a', response: {summary: 'Electrical response', points: []}});
  assert.strictEqual(state.crossoverResponses['output-a'].summary, 'Electrical response');

  const copied = routing.defaultConfiguration();
  copied.crossover.outputs[1].lowPass.enabled = true;
  ui.receiveCrossoverDraft(state, {action: 'copy', configuration: copied, validation: routing.validate(copied)});
  assert.strictEqual(state.draft.crossover.outputs[1].lowPass.enabled, true);
  assert.ok(state.message.includes('copied'));

  ui.receiveCrossoverDraft(state, {action: 'reset', configuration: routing.defaultConfiguration(), validation: routing.validate(routing.defaultConfiguration())});
  assert.ok(state.message.includes('reset'));
});

test('save, conflict, discard and disconnect preserve crossover drafts consistently', function () {
  const state = stateFixture();
  ui.editCrossover(state, 'output-a', 'lowPass', 'enabled', true);
  ui.connectionChanged(state, false);
  assert.strictEqual(state.draft.crossover.outputs[0].lowPass.enabled, true);
  assert.strictEqual(ui.canSave(state), false);
  ui.connectionChanged(state, true);
  ui.receiveValidation(state, {valid: true, errors: [], warnings: [{code: 'DESIGN_NOT_DEPLOYED'}]});
  assert.strictEqual(ui.canSave(state), true);
  ui.saveResult(state, {success: false, error: {code: 'REVISION_CONFLICT', message: 'Changed elsewhere'}});
  assert.strictEqual(state.draft.crossover.outputs[0].lowPass.enabled, true);
  ui.discard(state);
  assert.strictEqual(state.draft.crossover.outputs[0].lowPass.enabled, false);
});

test('markup provides labelled controls, simulated electrical SVG and narrow stacking', function () {
  const directory = path.join(__dirname, '..', 'Beocreate2', 'beo-extensions', 'signal-flow');
  const menu = fs.readFileSync(path.join(directory, 'menu.html'), 'utf8');
  const client = fs.readFileSync(path.join(directory, 'signal-flow-client.js'), 'utf8');
  const css = fs.readFileSync(path.join(directory, 'signal-flow.css'), 'utf8');
  assert.ok(client.includes('Electrical filter response'));
  assert.ok(client.includes('Does not include driver or enclosure response'));
  assert.ok(client.includes('type="number"'));
  assert.ok(client.includes('role="img"'));
  assert.ok(client.includes('<svg'));
  assert.ok(menu.includes('does not deploy to the DSP'));
  assert.ok(css.includes('.signal-flow-crossover-grid'));
  assert.ok(css.includes('grid-template-columns: 1fr'));
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
