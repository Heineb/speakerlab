#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const settingsStore = require('../Beocreate2/beo-system/settings-store');
const tests = [];
const temporaryDirectories = [];

function test(name, run) {
  tests.push({name: name, run: run});
}

function makeTemporaryDirectory(label) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-settings-' + label + '-'));
  temporaryDirectories.push(directory);
  return directory;
}

function cleanTemporaryDirectories() {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), {recursive: true, force: true});
  }
}

function writeSettings(directory, extension, contents) {
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(path.join(directory, extension + '.json'), contents);
}

function captureLogger() {
  const messages = {log: [], error: []};
  return {
    messages: messages,
    logger: {
      log: function () { messages.log.push(Array.prototype.slice.call(arguments)); },
      error: function () { messages.error.push(Array.prototype.slice.call(arguments)); }
    }
  };
}

test('loads valid settings and preserves optional and unknown properties', function () {
  const directory = makeTemporaryDirectory('valid');
  writeSettings(directory, 'sound', JSON.stringify({
    advancedSoundAdjustmentsEnabled: true,
    additionalProperty: {retained: true}
  }));

  assert.deepStrictEqual(settingsStore.getSettings(directory, 'sound'), {
    advancedSoundAdjustmentsEnabled: true,
    additionalProperty: {retained: true}
  });
});

test('returns null when the settings file is missing', function () {
  const directory = makeTemporaryDirectory('missing');
  assert.strictEqual(settingsStore.getSettings(directory, 'sound'), null);
});

test('returns null for empty and whitespace-only settings files', function () {
  const directory = makeTemporaryDirectory('empty');
  const captured = captureLogger();
  writeSettings(directory, 'empty', '');
  writeSettings(directory, 'whitespace', ' \n\t');

  assert.strictEqual(settingsStore.getSettings(directory, 'empty', 2, captured.logger), null);
  assert.strictEqual(settingsStore.getSettings(directory, 'whitespace', 2, captured.logger), null);
  assert.deepStrictEqual(captured.messages.log.map(function (entry) { return entry[0]; }), [
    "Settings file for 'empty' is empty.",
    "Settings file for 'whitespace' is empty."
  ]);
});

test('loads an empty JSON object and leaves defaults unchanged when merged', function () {
  const directory = makeTemporaryDirectory('empty-object');
  const defaults = {port: 80, language: 'en'};
  writeSettings(directory, 'system', '{}');

  const loaded = settingsStore.getSettings(directory, 'system');
  assert.deepStrictEqual(loaded, {});
  assert.strictEqual(settingsStore.mergeSettings(defaults, loaded), defaults);
  assert.deepStrictEqual(defaults, {port: 80, language: 'en'});
});

test('returns null and reports an error for malformed JSON', function () {
  const directory = makeTemporaryDirectory('malformed');
  const captured = captureLogger();
  writeSettings(directory, 'sound', '{"volume":');

  assert.strictEqual(settingsStore.getSettings(directory, 'sound', 0, captured.logger), null);
  assert.strictEqual(captured.messages.error.length, 1);
  assert.strictEqual(captured.messages.error[0][0], "Error loading settings for 'sound':");
  assert.ok(captured.messages.error[0][1] instanceof SyntaxError);
});

test('treats a JSON null value like missing settings during default merging', function () {
  const directory = makeTemporaryDirectory('json-null');
  const defaults = {port: 80, nested: {enabled: true}};
  writeSettings(directory, 'system', 'null');

  const loaded = settingsStore.getSettings(directory, 'system');
  const merged = settingsStore.mergeSettings(defaults, loaded);
  assert.strictEqual(loaded, null);
  assert.strictEqual(merged, defaults);
  assert.deepStrictEqual(merged, {port: 80, nested: {enabled: true}});
});

test('merges loaded settings shallowly and mutates the defaults object', function () {
  const defaults = {port: 80, nested: {enabled: true, retained: true}};
  const loaded = {nested: {enabled: false}, unknown: 'kept'};
  const merged = settingsStore.mergeSettings(defaults, loaded);

  assert.strictEqual(merged, defaults);
  assert.deepStrictEqual(merged, {
    port: 80,
    nested: {enabled: false},
    unknown: 'kept'
  });
  assert.deepStrictEqual(loaded, {nested: {enabled: false}, unknown: 'kept'});
});

test('returns a fresh parsed object on repeated loading', function () {
  const directory = makeTemporaryDirectory('repeated');
  writeSettings(directory, 'ui', '{"disclosure":{"sound":true}}');

  const first = settingsStore.getSettings(directory, 'ui');
  first.disclosure.sound = false;
  const second = settingsStore.getSettings(directory, 'ui');
  assert.notStrictEqual(second, first);
  assert.deepStrictEqual(second, {disclosure: {sound: true}});
});

test('keeps reads isolated to the selected directory', function () {
  const parent = makeTemporaryDirectory('isolated');
  const selected = path.join(parent, 'selected');
  const outside = path.join(parent, 'outside');
  writeSettings(selected, 'system', '{"port":81}');
  writeSettings(outside, 'system', '{"port":9999}');

  assert.deepStrictEqual(settingsStore.getSettings(selected, 'system'), {port: 81});
  assert.strictEqual(fs.readFileSync(path.join(outside, 'system.json'), 'utf8'), '{"port":9999}');
});

test('supports settings directories and extension names containing spaces', function () {
  const parent = makeTemporaryDirectory('spaces');
  const directory = path.join(parent, 'configuration with spaces');
  writeSettings(directory, 'extension with spaces', '{"enabled":true}');

  assert.deepStrictEqual(settingsStore.getSettings(directory, 'extension with spaces'), {enabled: true});
});

test('requires only local filesystem access and no hardware or platform services', function () {
  const directory = makeTemporaryDirectory('offline');
  writeSettings(directory, 'system', '{"port":80}');
  const dependencyNames = Object.keys(require.cache).filter(function (name) {
    return name.indexOf(path.join('Beocreate2', 'beo-system', 'settings-store.js')) !== -1;
  });

  assert.deepStrictEqual(settingsStore.getSettings(directory, 'system'), {port: 80});
  assert.strictEqual(dependencyNames.length, 1);
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
  } finally {
    cleanTemporaryDirectories();
  }
});

console.log('\n' + (tests.length - failures) + ' passed, ' + failures + ' failed');
if (failures > 0) process.exitCode = 1;
