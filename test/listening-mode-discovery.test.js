#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const discovery = require('../Beocreate2/beo-extensions/beosonic/preset-discovery');
const helpers = require('./configuration-read-helpers');
const tests = [];

function test(name, run) { tests.push({name, run}); }
function mode(name, extra) { return Object.assign({beosonic: {presetName: name}}, extra || {}); }
function state(order) {
  const saves = [];
  return {
    fullPresetList: {},
    compactPresetList: {},
    settings: {presetOrder: order || []},
    saves,
    saveSettings: function (extension, settings) {
      saves.push({extension, order: settings.presetOrder.slice()});
    }
  };
}
function discover(workspace, current, debug, logger) {
  return discovery.discoverPresets(workspace.systemDirectory, workspace.userDirectory, current, debug, logger);
}

test('loads valid system and user modes keyed by filename', function (workspace) {
  const current = state();
  helpers.writeJSON(workspace.systemDirectory, 'system.json', mode('System'));
  helpers.writeJSON(workspace.userDirectory, 'user.json', mode('User'));
  discover(workspace, current);
  assert.deepStrictEqual(Object.keys(current.compactPresetList), ['system', 'user']);
  assert.strictEqual(current.compactPresetList.system.readOnly, true);
  assert.strictEqual(current.compactPresetList.user.readOnly, false);
});

test('throws when the system directory is missing', function (workspace) {
  fs.rmSync(workspace.systemDirectory, {recursive: true});
  assert.throws(function () { discover(workspace, state()); }, /ENOENT/);
});

test('throws for a missing user directory after retaining discovered system state', function (workspace) {
  const current = state();
  helpers.writeJSON(workspace.systemDirectory, 'system.json', mode('System'));
  fs.rmSync(workspace.userDirectory, {recursive: true});
  assert.throws(function () { discover(workspace, current); }, /ENOENT/);
  assert.strictEqual(current.compactPresetList.system.presetName, 'System');
});

test('accepts empty directories and removes missing configured order entries', function (workspace) {
  const current = state(['missing']);
  discover(workspace, current);
  assert.deepStrictEqual(current.settings.presetOrder, []);
  assert.strictEqual(current.saves.length, 1);
});

test('skips malformed, empty and whitespace-only resources', function (workspace) {
  const current = state();
  const captured = helpers.captureLogger();
  helpers.writeRaw(workspace.systemDirectory, 'malformed.json', '{');
  helpers.writeRaw(workspace.systemDirectory, 'empty.json', '');
  helpers.writeRaw(workspace.systemDirectory, 'whitespace.json', '  \n');
  discover(workspace, current, true, captured.logger);
  assert.deepStrictEqual(current.compactPresetList, {});
  assert.strictEqual(captured.messages.error.length, 3);
});

test('skips JSON null, arrays and primitive JSON values', function (workspace) {
  const current = state();
  const captured = helpers.captureLogger();
  helpers.writeJSON(workspace.systemDirectory, 'null.json', null);
  helpers.writeJSON(workspace.systemDirectory, 'array.json', []);
  helpers.writeJSON(workspace.systemDirectory, 'boolean.json', true);
  helpers.writeJSON(workspace.systemDirectory, 'string.json', 'mode');
  discover(workspace, current, true, captured.logger);
  assert.deepStrictEqual(current.compactPresetList, {});
  assert.strictEqual(captured.messages.error.length, 1);
  assert.ok(captured.messages.error[0][1] instanceof TypeError);
  assert.strictEqual(captured.messages.log.length, 3);
});

test('requires beosonic.presetName and preserves unknown adjustments and properties', function (workspace) {
  const current = state();
  helpers.writeJSON(workspace.systemDirectory, 'missing.json', {beosonic: {beosonicAngle: 0}});
  helpers.writeJSON(workspace.systemDirectory, 'valid.json', {
    beosonic: {presetName: 'Valid', unknown: true},
    channels: {balance: 0},
    futureAdjustment: {kept: true}
  });
  discover(workspace, current);
  assert.deepStrictEqual(current.compactPresetList.valid.adjustments, ['beosonic', 'channels', 'futureAdjustment']);
  assert.strictEqual(current.fullPresetList.valid.beosonic.unknown, true);
});

test('lets a user mode overwrite a system mode with the same filename identity', function (workspace) {
  const current = state();
  helpers.writeJSON(workspace.systemDirectory, 'duplicate.json', mode('System'));
  helpers.writeJSON(workspace.userDirectory, 'duplicate.json', mode('User'));
  discover(workspace, current);
  assert.strictEqual(current.compactPresetList.duplicate.presetName, 'User');
  assert.strictEqual(current.compactPresetList.duplicate.readOnly, false);
  assert.deepStrictEqual(current.settings.presetOrder, ['duplicate']);
});

test('allows duplicate display names under different filename identities', function (workspace) {
  const current = state();
  helpers.writeJSON(workspace.systemDirectory, 'first.json', mode('Same'));
  helpers.writeJSON(workspace.userDirectory, 'second.json', mode('Same'));
  discover(workspace, current);
  assert.deepStrictEqual(Object.keys(current.compactPresetList), ['first', 'second']);
});

test('uses filesystem enumeration order and appends newly discovered identities to presetOrder', function (workspace) {
  const current = state();
  helpers.writeJSON(workspace.systemDirectory, 'zeta.json', mode('Zeta'));
  helpers.writeJSON(workspace.systemDirectory, 'alpha.json', mode('Alpha'));
  helpers.writeJSON(workspace.userDirectory, 'middle.json', mode('Middle'));
  const expected = fs.readdirSync(workspace.systemDirectory).map(function (file) { return path.basename(file, path.extname(file)); })
    .concat(fs.readdirSync(workspace.userDirectory).map(function (file) { return path.basename(file, path.extname(file)); }));
  discover(workspace, current);
  assert.deepStrictEqual(Object.keys(current.compactPresetList), expected);
  assert.deepStrictEqual(current.settings.presetOrder, expected);
});

test('repeated discovery refreshes existing files but retains removed identities', function (workspace) {
  const current = state();
  const removed = helpers.writeJSON(workspace.systemDirectory, 'removed.json', mode('First'));
  helpers.writeJSON(workspace.systemDirectory, 'updated.json', mode('Before'));
  discover(workspace, current);
  fs.unlinkSync(removed);
  helpers.writeJSON(workspace.systemDirectory, 'updated.json', mode('After'));
  discover(workspace, current);
  assert.strictEqual(current.compactPresetList.removed.presetName, 'First');
  assert.strictEqual(current.compactPresetList.updated.presetName, 'After');
});

test('catches unreadable directory entries without aborting discovery', function (workspace) {
  const current = state();
  const captured = helpers.captureLogger();
  fs.symlinkSync(path.join(workspace.root, 'missing-target'), path.join(workspace.systemDirectory, 'broken.json'));
  helpers.writeJSON(workspace.systemDirectory, 'valid.json', mode('Valid'));
  discover(workspace, current, true, captured.logger);
  assert.strictEqual(current.compactPresetList.valid.presetName, 'Valid');
  assert.strictEqual(captured.messages.error.length, 1);
});

test('supports paths containing spaces without relying on the working directory', function (workspace) {
  const current = state();
  helpers.writeJSON(workspace.userDirectory, 'mode with spaces.json', mode('Spaces'));
  const previous = process.cwd();
  process.chdir(workspace.root);
  try { discover(workspace, current); } finally { process.chdir(previous); }
  assert.strictEqual(current.compactPresetList['mode with spaces'].presetName, 'Spaces');
});

helpers.runTests(tests);
