#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const discovery = require('../Beocreate2/beo-extensions/speaker-preset/preset-discovery');
const helpers = require('./configuration-read-helpers');
const tests = [];

function test(name, run) { tests.push({name, run}); }
function lists() { return {full: {}, compact: {}}; }
function preset(name, extra) {
  return Object.assign({'speaker-preset': {presetName: name}}, extra || {});
}
function discover(workspace, state, debug, logger) {
  return discovery.discoverPresets(workspace.systemDirectory, workspace.userDirectory, state.full, state.compact, debug, logger);
}

test('loads valid system and user presets keyed by filename', function (workspace) {
  const state = lists();
  helpers.writeJSON(workspace.systemDirectory, 'system.json', preset('System'));
  helpers.writeJSON(workspace.userDirectory, 'user.json', preset('User'));
  discover(workspace, state);
  assert.deepStrictEqual(Object.keys(state.compact), ['system', 'user']);
  assert.strictEqual(state.compact.system.readOnly, true);
  assert.strictEqual(state.compact.user.readOnly, false);
});

test('throws when the system directory is missing', function (workspace) {
  fs.rmSync(workspace.systemDirectory, {recursive: true});
  assert.throws(function () { discover(workspace, lists()); }, /ENOENT/);
});

test('throws for a missing user directory after retaining discovered system state', function (workspace) {
  const state = lists();
  helpers.writeJSON(workspace.systemDirectory, 'system.json', preset('System'));
  fs.rmSync(workspace.userDirectory, {recursive: true});
  assert.throws(function () { discover(workspace, state); }, /ENOENT/);
  assert.strictEqual(state.compact.system.presetName, 'System');
});

test('accepts empty system and user directories', function (workspace) {
  const state = lists();
  discover(workspace, state);
  assert.deepStrictEqual(state, lists());
});

test('skips malformed, empty and whitespace-only files and reports errors only in debug mode', function (workspace) {
  const state = lists();
  const captured = helpers.captureLogger();
  helpers.writeRaw(workspace.systemDirectory, 'malformed.json', '{');
  helpers.writeRaw(workspace.systemDirectory, 'empty.json', '');
  helpers.writeRaw(workspace.systemDirectory, 'whitespace.json', '  \n');
  discover(workspace, state, true, captured.logger);
  assert.deepStrictEqual(state, lists());
  assert.strictEqual(captured.messages.error.length, 3);
});

test('skips JSON null with a caught TypeError and skips arrays and primitives without qualification', function (workspace) {
  const state = lists();
  const captured = helpers.captureLogger();
  helpers.writeJSON(workspace.systemDirectory, 'null.json', null);
  helpers.writeJSON(workspace.systemDirectory, 'array.json', []);
  helpers.writeJSON(workspace.systemDirectory, 'number.json', 7);
  helpers.writeJSON(workspace.systemDirectory, 'string.json', 'preset');
  discover(workspace, state, true, captured.logger);
  assert.deepStrictEqual(state, lists());
  assert.strictEqual(captured.messages.error.length, 1);
  assert.ok(captured.messages.error[0][1] instanceof TypeError);
  assert.strictEqual(captured.messages.log.length, 3);
});

test('requires a speaker-preset object and a display name from either supported location', function (workspace) {
  const state = lists();
  helpers.writeJSON(workspace.systemDirectory, 'missing.json', {'speaker-preset': {}});
  helpers.writeJSON(workspace.systemDirectory, 'product-name.json', {
    'speaker-preset': {},
    'product-information': {modelName: 'Product name'}
  });
  helpers.writeJSON(workspace.systemDirectory, 'override.json', {
    'speaker-preset': {presetName: 'Preset name'},
    'product-information': {modelName: 'Product name'}
  });
  discover(workspace, state);
  assert.deepStrictEqual(Object.keys(state.compact), ['override', 'product-name']);
  assert.strictEqual(state.compact['product-name'].presetName, 'Product name');
  assert.strictEqual(state.compact.override.presetName, 'Preset name');
});

test('preserves unknown properties in the full preset', function (workspace) {
  const state = lists();
  helpers.writeJSON(workspace.systemDirectory, 'unknown.json', preset('Unknown', {futureData: {kept: true}}));
  discover(workspace, state);
  assert.deepStrictEqual(state.full.unknown.futureData, {kept: true});
});

test('keeps the system preset when system and user filenames have the same identity', function (workspace) {
  const state = lists();
  helpers.writeJSON(workspace.systemDirectory, 'duplicate.json', preset('System'));
  helpers.writeJSON(workspace.userDirectory, 'duplicate.json', preset('User'));
  discover(workspace, state);
  assert.strictEqual(state.compact.duplicate.presetName, 'System');
  assert.strictEqual(state.compact.duplicate.readOnly, true);
});

test('allows duplicate display names when filenames differ', function (workspace) {
  const state = lists();
  helpers.writeJSON(workspace.systemDirectory, 'first.json', preset('Same'));
  helpers.writeJSON(workspace.userDirectory, 'second.json', preset('Same'));
  discover(workspace, state);
  assert.deepStrictEqual(Object.keys(state.compact), ['first', 'second']);
});

test('follows filesystem enumeration order with system entries before new user entries', function (workspace) {
  const state = lists();
  helpers.writeJSON(workspace.systemDirectory, 'zeta.json', preset('Zeta'));
  helpers.writeJSON(workspace.systemDirectory, 'alpha.json', preset('Alpha'));
  helpers.writeJSON(workspace.userDirectory, 'middle.json', preset('Middle'));
  const expected = fs.readdirSync(workspace.systemDirectory).map(function (file) { return path.basename(file, path.extname(file)); })
    .concat(fs.readdirSync(workspace.userDirectory).map(function (file) { return path.basename(file, path.extname(file)); }));
  discover(workspace, state);
  assert.deepStrictEqual(Object.keys(state.compact), expected);
});

test('repeated discovery keeps the first loaded value and retains files later removed', function (workspace) {
  const state = lists();
  const removed = helpers.writeJSON(workspace.systemDirectory, 'removed.json', preset('Removed'));
  helpers.writeJSON(workspace.systemDirectory, 'persistent.json', preset('First'));
  discover(workspace, state);
  helpers.writeJSON(workspace.systemDirectory, 'persistent.json', preset('Changed'));
  fs.unlinkSync(removed);
  discover(workspace, state);
  assert.strictEqual(state.compact.persistent.presetName, 'First');
  assert.strictEqual(state.compact.removed.presetName, 'Removed');
});

test('catches unreadable directory entries without aborting discovery', function (workspace) {
  const state = lists();
  const captured = helpers.captureLogger();
  fs.symlinkSync(path.join(workspace.root, 'missing-target'), path.join(workspace.systemDirectory, 'broken.json'));
  helpers.writeJSON(workspace.systemDirectory, 'valid.json', preset('Valid'));
  discover(workspace, state, true, captured.logger);
  assert.strictEqual(state.compact.valid.presetName, 'Valid');
  assert.strictEqual(captured.messages.error.length, 1);
});

test('supports system and user paths containing spaces without using the working directory', function (workspace) {
  const state = lists();
  helpers.writeJSON(workspace.userDirectory, 'preset with spaces.json', preset('Spaces'));
  const previous = process.cwd();
  process.chdir(workspace.root);
  try { discover(workspace, state); } finally { process.chdir(previous); }
  assert.strictEqual(state.compact['preset with spaces'].presetName, 'Spaces');
});

helpers.runTests(tests);
