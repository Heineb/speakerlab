#!/usr/bin/env node

'use strict';

const assert = require('assert');
const configurationUI = require('../Beocreate2/beo-extensions/hifiberry-system-tools/configuration-backup-ui');
const tests = [];

function test(name, run) { tests.push({name, run}); }

function preview() {
  return {
    token: 'confirmation-token',
    plan: {
      create: ['settings/new.json'],
      replace: ['settings/sound.json'],
      unchanged: ['settings/ui.json'],
      absent: [],
      unsupported: [],
      warnings: []
    }
  };
}

test('file selection enters validation without permitting confirmation', function () {
  const state = configurationUI.reduce(configurationUI.initialState(), {type: 'VALIDATE'});
  const view = configurationUI.viewModel(state);
  assert.strictEqual(state.status, 'validating');
  assert.strictEqual(view.showProgress, true);
  assert.strictEqual(view.canConfirm, false);
});

test('preview renders a plain-language summary and enables explicit confirmation', function () {
  let state = configurationUI.reduce(configurationUI.initialState(), {type: 'VALIDATE'});
  state = configurationUI.reduce(state, {type: 'PREVIEW', preview: preview()});
  const view = configurationUI.viewModel(state);
  assert.strictEqual(view.canConfirm, true);
  assert.ok(view.message.indexOf('1 new') != -1);
  assert.ok(view.message.indexOf('1 replaced') != -1);
});

test('validation rejection produces an understandable warning state', function () {
  let state = configurationUI.reduce(configurationUI.initialState(), {type: 'VALIDATE'});
  state = configurationUI.reduce(state, {type: 'VALIDATION_FAILED', error: {message: 'Unsupported backup version.'}});
  const view = configurationUI.viewModel(state);
  assert.strictEqual(state.status, 'invalid');
  assert.strictEqual(view.tone, 'warning');
  assert.strictEqual(view.message, 'Unsupported backup version.');
});

test('restore cannot start without a preview and confirmation', function () {
  const state = configurationUI.reduce(configurationUI.initialState(), {type: 'CONFIRM_RESTORE'});
  assert.strictEqual(state.status, 'idle');
  assert.strictEqual(state.submitting, false);
});

test('double submission is prevented during validation and restore', function () {
  let state = configurationUI.reduce(configurationUI.initialState(), {type: 'VALIDATE'});
  state = configurationUI.reduce(state, {type: 'VALIDATE'});
  assert.strictEqual(state.status, 'validating');
  state = configurationUI.reduce(state, {type: 'PREVIEW', preview: preview()});
  state = configurationUI.reduce(state, {type: 'CONFIRM_RESTORE'});
  const repeated = configurationUI.reduce(state, {type: 'CONFIRM_RESTORE'});
  assert.strictEqual(repeated.status, 'restoring');
  assert.strictEqual(repeated.submitting, true);
});

test('verified success is distinct from in-progress restore', function () {
  let state = configurationUI.reduce(configurationUI.initialState(), {type: 'PREVIEW', preview: preview()});
  state = configurationUI.reduce(state, {type: 'CONFIRM_RESTORE'});
  assert.strictEqual(configurationUI.viewModel(state).showProgress, true);
  state = configurationUI.reduce(state, {type: 'RESTORE_SUCCEEDED'});
  const view = configurationUI.viewModel(state);
  assert.strictEqual(view.tone, 'success');
  assert.ok(view.message.indexOf('Restart') != -1);
});

test('failed restore with successful rollback is a recoverable warning', function () {
  let state = configurationUI.reduce(configurationUI.initialState(), {
    type: 'RESTORE_FAILED',
    error: {message: 'Write failed.'},
    rollback: {succeeded: true}
  });
  const view = configurationUI.viewModel(state);
  assert.strictEqual(state.status, 'rollback-success');
  assert.strictEqual(view.tone, 'warning');
  assert.ok(view.message.indexOf('previous configuration was restored') != -1);
});

test('failed rollback is presented as a critical state', function () {
  const state = configurationUI.reduce(configurationUI.initialState(), {
    type: 'RESTORE_FAILED',
    error: {message: 'Write failed.'},
    rollback: {succeeded: false}
  });
  const view = configurationUI.viewModel(state);
  assert.strictEqual(state.status, 'rollback-failed');
  assert.strictEqual(view.tone, 'critical');
  assert.ok(view.message.indexOf('Do not restart') != -1);
});

test('disconnected state disables file selection and confirmation', function () {
  let state = configurationUI.reduce(configurationUI.initialState(), {type: 'PREVIEW', preview: preview()});
  state = configurationUI.reduce(state, {type: 'CONNECTION', connected: false});
  const view = configurationUI.viewModel(state);
  assert.strictEqual(state.status, 'disconnected');
  assert.strictEqual(view.canChooseFile, false);
  assert.strictEqual(view.canConfirm, false);
});

let failures = 0;
tests.forEach(function (entry) {
  try {
    entry.run();
    console.log('ok - ' + entry.name);
  } catch (error) {
    failures += 1;
    console.error('not ok - ' + entry.name);
    console.error(error.stack || error.message);
  }
});

console.log('\n' + (tests.length - failures) + ' passed, ' + failures + ' failed');
if (failures) process.exitCode = 1;
