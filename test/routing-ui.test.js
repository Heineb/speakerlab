'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const model = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const ui = require('../Beocreate2/beo-extensions/signal-flow/routing-ui-state');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
}
function populated() {
  const state = ui.create();
  const configuration = model.defaultConfiguration();
  ui.receiveState(state, {
    capabilities: model.capabilities(true),
    configuration,
    revision: null,
    validation: model.validate(configuration),
    runtime: {simulated: true, connected: true, deploymentStatus: 'not-deployed', statusLabel: 'Saved design · Simulated · Not deployed to DSP'}
  });
  return state;
}

test('moves from loading to a populated four-output list', function () {
  const state = populated();
  assert.strictEqual(state.loading, false);
  assert.strictEqual(state.draft.outputs.length, 4);
  assert.strictEqual(ui.summary(state).outputs, 4);
});

test('creates and removes routing while retaining custom labels and roles', function () {
  const state = populated();
  ui.editOutput(state, 'output-a', 'label', 'Left bass');
  ui.editOutput(state, 'output-a', 'role', 'woofer');
  ui.routeOutput(state, 'output-a', 'left');
  assert.strictEqual(state.dirty, true);
  assert.strictEqual(state.draft.outputs[0].label, 'Left bass');
  assert.strictEqual(state.draft.connections[0].source, 'left');
  ui.routeOutput(state, 'output-a', null);
  assert.deepStrictEqual(state.draft.connections, []);
});

test('errors disable save while warnings permit it', function () {
  const state = populated();
  ui.editOutput(state, 'output-a', 'label', 'Bass');
  ui.receiveValidation(state, {valid: true, errors: [], warnings: [{message: 'warning'}]});
  assert.strictEqual(ui.canSave(state), true);
  ui.receiveValidation(state, {valid: false, errors: [{message: 'error'}], warnings: []});
  assert.strictEqual(ui.canSave(state), false);
});

test('save success clears unsaved state and retains not-deployed language', function () {
  const state = populated();
  ui.editOutput(state, 'output-a', 'label', 'Bass');
  ui.saveResult(state, {
    success: true,
    configuration: state.draft,
    revision: 'new',
    validation: {valid: true, errors: [], warnings: []},
    deploymentStatus: 'not-deployed'
  });
  assert.strictEqual(state.dirty, false);
  assert.strictEqual(state.revision, 'new');
  assert.ok(state.message.indexOf('not been deployed') !== -1);
});

test('save failure preserves draft and revision conflict is explicit', function () {
  const state = populated();
  ui.editOutput(state, 'output-a', 'label', 'Unsaved');
  ui.saveResult(state, {success: false, error: {code: 'REVISION_CONFLICT', message: 'Server changed'}});
  assert.strictEqual(state.draft.outputs[0].label, 'Unsaved');
  assert.strictEqual(state.dirty, true);
  assert.strictEqual(state.conflict, true);
  assert.strictEqual(ui.canSave(state), false);
});

test('discard reloads the saved state', function () {
  const state = populated();
  ui.editOutput(state, 'output-a', 'label', 'Unsaved');
  ui.discard(state);
  assert.strictEqual(state.draft.outputs[0].label, 'Output A');
  assert.strictEqual(state.dirty, false);
});

test('disconnect preserves draft and disables save', function () {
  const state = populated();
  ui.editOutput(state, 'output-a', 'label', 'Offline draft');
  ui.connectionChanged(state, false);
  assert.strictEqual(state.draft.outputs[0].label, 'Offline draft');
  assert.strictEqual(ui.canSave(state), false);
  assert.ok(state.message.indexOf('kept') !== -1);
});

test('reconnect reloads clean state but protects conflicting local draft', function () {
  const clean = populated();
  ui.connectionChanged(clean, false);
  ui.receiveState(clean, {
    capabilities: model.capabilities(true),
    configuration: model.defaultConfiguration(),
    revision: 'server-1',
    validation: model.validate(model.defaultConfiguration()),
    runtime: clean.runtime
  });
  assert.strictEqual(clean.revision, 'server-1');

  const dirty = populated();
  ui.editOutput(dirty, 'output-a', 'label', 'Local draft');
  ui.receiveState(dirty, {
    capabilities: model.capabilities(true),
    configuration: model.defaultConfiguration(),
    revision: 'server-2',
    validation: model.validate(model.defaultConfiguration()),
    runtime: dirty.runtime
  });
  assert.strictEqual(dirty.draft.outputs[0].label, 'Local draft');
  assert.strictEqual(dirty.conflict, true);
});

test('a broadcast save from another client never overwrites a local draft', function () {
  const dirty = populated();
  ui.editOutput(dirty, 'output-a', 'label', 'My draft');
  ui.externalSave(dirty, {success: true, revision: 'other-client'});
  assert.strictEqual(dirty.draft.outputs[0].label, 'My draft');
  assert.strictEqual(dirty.conflict, true);

  const clean = populated();
  ui.externalSave(clean, {success: true, revision: 'other-client'});
  assert.strictEqual(clean.conflict, false);
  assert.ok(clean.message.indexOf('Reloading') !== -1);
});

test('markup uses labelled form controls and responsive cards without a canvas', function () {
  const directory = path.join(__dirname, '..', 'Beocreate2', 'beo-extensions', 'signal-flow');
  const menu = fs.readFileSync(path.join(directory, 'menu.html'), 'utf8');
  const client = fs.readFileSync(path.join(directory, 'signal-flow-client.js'), 'utf8');
  const css = fs.readFileSync(path.join(directory, 'signal-flow.css'), 'utf8');
  assert.ok(menu.indexOf('aria-live') !== -1);
  assert.ok(client.indexOf('<label for=') !== -1);
  assert.ok(css.indexOf('@media (max-width: 620px)') !== -1);
  assert.ok(css.indexOf('grid-template-columns: 1fr') !== -1);
  assert.strictEqual(menu.indexOf('<canvas'), -1);
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
