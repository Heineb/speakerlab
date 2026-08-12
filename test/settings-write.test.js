#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const settingsStore = require('../Beocreate2/beo-system/settings-store');
const tests = [];
const temporaryRoots = [];

function test(name, run) { tests.push({name, run}); }

function fakeTimers() {
  let nextID = 1;
  const scheduled = new Map();
  const cleared = [];
  return {
    setTimeout: function (callback, delay) {
      const id = nextID++;
      scheduled.set(id, {callback, delay});
      return id;
    },
    clearTimeout: function (id) {
      cleared.push(id);
      scheduled.delete(id);
    },
    pending: function () { return Array.from(scheduled.entries()); },
    cleared: function () { return cleared.slice(); },
    run: function (id) {
      const timer = scheduled.get(id);
      scheduled.delete(id);
      timer.callback();
    }
  };
}

function captureLogger() {
  const messages = [];
  return {
    messages,
    logger: {log: function () { messages.push(Array.prototype.slice.call(arguments)); }}
  };
}

function fixture(label, createDirectory = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-settings-write-' + label + '-'));
  temporaryRoots.push(root);
  const directory = path.join(root, 'configuration with spaces');
  if (createDirectory) fs.mkdirSync(directory);
  const timers = fakeTimers();
  return {
    root,
    directory,
    timers,
    writer: settingsStore.createSettingsWriter(directory, 0, undefined, timers)
  };
}

function read(fixtureState, extension) {
  return fs.readFileSync(path.join(fixtureState.directory, extension + '.json'), 'utf8');
}

test('immediately creates a compact JSON file for nested objects and arrays', function () {
  const current = fixture('immediate');
  current.writer.saveSettings('sound', {nested: {enabled: true}, values: [1, null, 'three']}, true);
  assert.strictEqual(read(current, 'sound'), '{"nested":{"enabled":true},"values":[1,null,"three"]}');
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('immediately serializes top-level null as literal null', function () {
  const current = fixture('null');
  current.writer.saveSettings('nullable', null, true);
  assert.strictEqual(read(current, 'nullable'), 'null');
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('overwrites and truncates an existing file on repeated immediate writes', function () {
  const current = fixture('overwrite');
  current.writer.saveSettings('system', {longProperty: 'long value'}, true);
  current.writer.saveSettings('system', {a: 1}, true);
  assert.strictEqual(read(current, 'system'), '{"a":1}');
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('supports target paths containing spaces', function () {
  const current = fixture('spaces');
  current.writer.saveSettings('extension with spaces', {enabled: true}, true);
  assert.strictEqual(read(current, 'extension with spaces'), '{"enabled":true}');
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('throws when the target directory is missing and does not create it', function () {
  const current = fixture('missing-directory', false);
  assert.throws(function () { current.writer.saveSettings('system', {port: 80}, true); }, /ENOENT/);
  assert.strictEqual(fs.existsSync(current.directory), false);
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('propagates a controlled filesystem write failure', function () {
  const current = fixture('write-failure');
  fs.mkdirSync(path.join(current.directory, 'blocked.json'));
  assert.throws(function () { current.writer.saveSettings('blocked', {value: true}, true); });
  assert.ok(fs.statSync(path.join(current.directory, 'blocked.json')).isDirectory());
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('uses native JSON.stringify handling for unsupported values', function () {
  const current = fixture('unsupported');
  current.writer.saveSettings('nested', {omitted: undefined, fn: function () {}, array: [undefined, function () {}]}, true);
  assert.strictEqual(read(current, 'nested'), '{"array":[null,null]}');
  assert.throws(function () { current.writer.saveSettings('undefined', undefined, true); }, TypeError);
  assert.throws(function () { current.writer.saveSettings('bigint', {value: BigInt(1)}, true); }, TypeError);
  const circular = {};
  circular.self = circular;
  assert.throws(function () { current.writer.saveSettings('circular', circular, true); }, TypeError);
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('immediate writing snapshots current state and does not mutate the object', function () {
  const current = fixture('immediate-mutation');
  const settings = {nested: {value: 1}};
  current.writer.saveSettings('sound', settings, true);
  settings.nested.value = 2;
  assert.strictEqual(read(current, 'sound'), '{"nested":{"value":1}}');
  assert.deepStrictEqual(settings, {nested: {value: 2}});
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('constructs filenames by direct extension concatenation without validation', function () {
  const current = fixture('filename');
  current.writer.saveSettings('../escaped', {unsafe: true}, true);
  assert.strictEqual(fs.readFileSync(path.join(current.root, 'escaped.json'), 'utf8'), '{"unsafe":true}');
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('logs immediate success only after a successful write at debug level two', function () {
  const current = fixture('logging');
  const captured = captureLogger();
  const writer = settingsStore.createSettingsWriter(current.directory, 2, captured.logger, current.timers);
  writer.saveSettings('system', {port: 80}, true);
  assert.deepStrictEqual(captured.messages, [["Settings saved for 'system' (immediately)."]]);
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('schedules one delayed save for exactly ten seconds', function () {
  const current = fixture('one-delayed');
  current.writer.saveSettings('sound', {volume: 10});
  const pending = current.timers.pending();
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0][1].delay, 10000);
  assert.strictEqual(fs.existsSync(path.join(current.directory, 'sound.json')), false);
  current.timers.run(pending[0][0]);
  assert.strictEqual(read(current, 'sound'), '{"volume":10}');
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('replaces the global timer and keeps only the latest state for one extension', function () {
  const current = fixture('coalesced');
  current.writer.saveSettings('sound', {volume: 10});
  const firstID = current.timers.pending()[0][0];
  current.writer.saveSettings('sound', {volume: 20});
  const pending = current.timers.pending();
  assert.strictEqual(pending.length, 1);
  assert.deepStrictEqual(current.timers.cleared(), [null, firstID]);
  current.timers.run(pending[0][0]);
  assert.strictEqual(read(current, 'sound'), '{"volume":20}');
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('coalesces different extensions behind one timer and writes all pending files', function () {
  const current = fixture('different-extensions');
  current.writer.saveSettings('sound', {volume: 20});
  current.writer.saveSettings('channels', {left: 1});
  assert.strictEqual(current.timers.pending().length, 1);
  current.timers.run(current.timers.pending()[0][0]);
  assert.strictEqual(read(current, 'sound'), '{"volume":20}');
  assert.strictEqual(read(current, 'channels'), '{"left":1}');
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('logs each delayed success after writing at debug level two', function () {
  const current = fixture('delayed-logging');
  const captured = captureLogger();
  const writer = settingsStore.createSettingsWriter(current.directory, 2, captured.logger, current.timers);
  writer.saveSettings('first', {value: 1});
  writer.saveSettings('second', {value: 2});
  current.timers.run(current.timers.pending()[0][0]);
  assert.deepStrictEqual(captured.messages, [
    ["Settings saved for 'first'."],
    ["Settings saved for 'second'."]
  ]);
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('delayed saving retains an object reference and observes later mutation', function () {
  const current = fixture('delayed-mutation');
  const settings = {value: 1};
  current.writer.saveSettings('extension', settings);
  settings.value = 2;
  current.timers.run(current.timers.pending()[0][0]);
  assert.strictEqual(read(current, 'extension'), '{"value":2}');
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('an immediate write does not cancel an earlier queued write for the same extension', function () {
  const current = fixture('immediate-and-delayed');
  current.writer.saveSettings('sound', {value: 'queued'});
  current.writer.saveSettings('sound', {value: 'immediate'}, true);
  assert.strictEqual(read(current, 'sound'), '{"value":"immediate"}');
  current.timers.run(current.timers.pending()[0][0]);
  assert.strictEqual(read(current, 'sound'), '{"value":"queued"}');
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('manual shutdown-style flushing writes synchronously but leaves the scheduled timer pending', function () {
  const current = fixture('flush');
  current.writer.saveSettings('system', {port: 80});
  const timerID = current.timers.pending()[0][0];
  current.writer.savePendingSettings();
  assert.strictEqual(read(current, 'system'), '{"port":80}');
  assert.strictEqual(current.timers.pending().length, 1);
  current.timers.run(timerID);
  current.writer.savePendingSettings();
  assert.strictEqual(read(current, 'system'), '{"port":80}');
  fs.rmSync(current.root, {recursive: true, force: true});
});

test('a flush failure aborts the loop and retains the complete pending queue for retry', function () {
  const current = fixture('flush-failure');
  current.writer.saveSettings('blocked', {value: 1});
  current.writer.saveSettings('later', {value: 2});
  fs.mkdirSync(path.join(current.directory, 'blocked.json'));
  assert.throws(function () { current.writer.savePendingSettings(); });
  assert.strictEqual(fs.existsSync(path.join(current.directory, 'later.json')), false);
  fs.rmSync(path.join(current.directory, 'blocked.json'), {recursive: true});
  current.writer.savePendingSettings();
  assert.strictEqual(read(current, 'blocked'), '{"value":1}');
  assert.strictEqual(read(current, 'later'), '{"value":2}');
  fs.rmSync(current.root, {recursive: true, force: true});
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
    while (temporaryRoots.length > 0) {
      fs.rmSync(temporaryRoots.pop(), {recursive: true, force: true});
    }
  }
});

console.log('\n' + (tests.length - failures) + ' passed, ' + failures + ' failed');
if (failures > 0) process.exitCode = 1;
