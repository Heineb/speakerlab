#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const atomicJSONFile = require('../Beocreate2/beo-system/atomic-json-file');
const configurationBackup = require('../Beocreate2/beo-system/configuration-backup');
const settingsStore = require('../Beocreate2/beo-system/settings-store');
const signalFlowModel = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const tests = [];
const roots = [];
const FIXED_DATE = new Date('2026-07-29T11:00:00.000Z');

function test(name, run) { tests.push({name, run}); }

function writeJSON(target, value) { fs.writeFileSync(target, JSON.stringify(value)); }
function readJSON(target) { return JSON.parse(fs.readFileSync(target, 'utf8')); }

function fixture(label, serviceOptions) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-restore-' + label + '-'));
  const dataDirectory = path.join(root, 'configuration with spaces');
  roots.push(root);
  fs.mkdirSync(dataDirectory);
  fs.mkdirSync(path.join(dataDirectory, 'beo-speaker-presets'));
  fs.mkdirSync(path.join(dataDirectory, 'beo-listening-modes'));
  writeJSON(path.join(dataDirectory, 'system.json'), {language: 'en'});
  writeJSON(path.join(dataDirectory, 'sound.json'), {volume: 20});
  writeJSON(path.join(dataDirectory, 'beo-speaker-presets', 'speaker.json'), {'speaker-preset': {presetName: 'Original'}});
  writeJSON(path.join(dataDirectory, 'beo-listening-modes', 'mode.json'), {beosonic: {presetName: 'Original'}});
  const baseOptions = {
    dataDirectory,
    systemVersion: '2.3.0',
    systemConfiguration: {cardType: 'Beocreate 4-Channel Amplifier'},
    clock: function () { return new Date(FIXED_DATE.getTime()); }
  };
  const service = configurationBackup.createConfigurationService(Object.assign(baseOptions, serviceOptions || {}));
  return {root, dataDirectory, service, baseOptions};
}

function desiredBackup(current) {
  const backup = current.service.collectBackup();
  const settings = backup.configuration.settings.items;
  settings.find(function (item) { return item.name == 'sound.json'; }).data = {volume: 55};
  settings.find(function (item) { return item.name == 'sound.json'; }).checksum = configurationBackup.checksum({volume: 55});
  settings.push({name: 'channels.json', data: {role: 'left'}, checksum: configurationBackup.checksum({role: 'left'})});
  backup.configuration.speakerPresets.items[0].data = {'speaker-preset': {presetName: 'Restored'}};
  backup.configuration.speakerPresets.items[0].checksum = configurationBackup.checksum(backup.configuration.speakerPresets.items[0].data);
  ['settings', 'speakerPresets', 'listeningModes'].forEach(function (name) {
    const section = backup.configuration[name];
    section.checksum = configurationBackup.checksum({present: section.present, items: section.items});
  });
  delete backup.integrity;
  backup.integrity = {algorithm: 'sha256', checksum: configurationBackup.checksum(backup)};
  return backup;
}

function previewAndRestore(current, backup) {
  const preview = current.service.preview(JSON.stringify(backup));
  return current.service.restore(preview.token);
}

test('successfully restores multiple files, overwrites existing files and creates missing files', function () {
  const current = fixture('success');
  const result = previewAndRestore(current, desiredBackup(current));
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.applied, 3);
  assert.deepStrictEqual(readJSON(path.join(current.dataDirectory, 'sound.json')), {volume: 55});
  assert.deepStrictEqual(readJSON(path.join(current.dataDirectory, 'channels.json')), {role: 'left'});
  assert.strictEqual(readJSON(path.join(current.dataDirectory, 'beo-speaker-presets', 'speaker.json'))['speaker-preset'].presetName, 'Restored');
  assert.strictEqual(result.restartRequired, true);
});

test('restores and rolls back signal-flow settings as central configuration', function () {
  const current = fixture('signal-flow');
  const routingPath = path.join(current.dataDirectory, 'signal-flow.json');
  const original = signalFlowModel.defaultConfiguration();
  Object.assign(original.outputs[0], {label: 'Original', role: 'woofer', side: 'left', enabled: true});
  original.connections.push({source: 'left', destination: 'output-a', enabled: true});
  Object.assign(original.crossover.outputs[0].lowPass, {
    enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 1800
  });
  Object.assign(original.channelProcessing.outputs[0], {
    gain: {valueDb: -2.5}, delay: {valueMs: 0.42}, polarity: {inverted: true}
  });
  Object.assign(original.driverProtection.outputs[0].driver, {manufacturer: 'Example', model: 'Bass 8', nominalImpedanceOhms: 8, continuousPowerWatts: 50});
  Object.assign(original.driverProtection.outputs[0].amplifier, {maximumPeakVoltage: 35.36});
  Object.assign(original.driverProtection.outputs[0].limiter, {enabled: true, thresholdPeakVoltage: 28.28, safetyMarginDb: -3, attackMs: 5, releaseMs: 250});
  writeJSON(routingPath, original);
  const backup = current.service.collectBackup();
  const changed = JSON.parse(JSON.stringify(original));
  changed.outputs[0].label = 'Changed';
  changed.crossover.outputs[0].lowPass.cutoffHz = 2400;
  changed.channelProcessing.outputs[0].gain.valueDb = -6;
  changed.channelProcessing.outputs[0].delay.valueMs = 1.25;
  changed.channelProcessing.outputs[0].polarity.inverted = false;
  changed.driverProtection.outputs[0].driver.continuousPowerWatts = 80;
  changed.driverProtection.outputs[0].limiter.thresholdPeakVoltage = 32;
  writeJSON(routingPath, changed);
  const result = previewAndRestore(current, backup);
  assert.strictEqual(result.status, 'success');
  assert.deepStrictEqual(readJSON(routingPath), original);
  const snapshot = current.service.parseAndValidate(fs.readFileSync(path.join(current.dataDirectory, '.speakerlab-last-known-good.json'))).backup;
  const previous = snapshot.configuration.settings.items.find(function (item) { return item.name === 'signal-flow.json'; });
  assert.strictEqual(previous.data.outputs[0].label, 'Changed');
  assert.strictEqual(previous.data.crossover.outputs[0].lowPass.cutoffHz, 2400);
  assert.strictEqual(previous.data.channelProcessing.outputs[0].gain.valueDb, -6);
  assert.strictEqual(previous.data.channelProcessing.outputs[0].delay.valueMs, 1.25);
  assert.strictEqual(previous.data.channelProcessing.outputs[0].polarity.inverted, false);
  assert.strictEqual(previous.data.driverProtection.outputs[0].driver.continuousPowerWatts, 80);
  assert.strictEqual(previous.data.driverProtection.outputs[0].limiter.thresholdPeakVoltage, 32);
});

test('creates and verifies a separate immediate pre-restore last-known-good snapshot', function () {
  const current = fixture('lkg');
  const result = previewAndRestore(current, desiredBackup(current));
  assert.strictEqual(result.status, 'success');
  const snapshotPath = path.join(current.dataDirectory, '.speakerlab-last-known-good.json');
  const snapshot = current.service.parseAndValidate(fs.readFileSync(snapshotPath)).backup;
  const oldSound = snapshot.configuration.settings.items.find(function (item) { return item.name == 'sound.json'; });
  assert.deepStrictEqual(oldSound.data, {volume: 20});
});

test('validation failure occurs before any active or last-known-good write', function () {
  const current = fixture('validation-before-write');
  const backup = desiredBackup(current);
  backup.integrity.checksum = 'bad';
  assert.throws(function () { current.service.preview(JSON.stringify(backup)); }, function (error) {
    return error.code == 'CORRUPT_BACKUP';
  });
  assert.strictEqual(fs.existsSync(path.join(current.dataDirectory, '.speakerlab-last-known-good.json')), false);
  assert.deepStrictEqual(readJSON(path.join(current.dataDirectory, 'sound.json')), {volume: 20});
});

test('failure during staging applies no selected-backup files', function () {
  const current = fixture('staging');
  const service = configurationBackup.createConfigurationService(Object.assign({}, current.baseOptions, {
    hooks: {afterStaging: function () { throw new Error('staging failed'); }}
  }));
  const preview = service.preview(JSON.stringify(desiredBackup(current)));
  const result = service.restore(preview.token);
  assert.strictEqual(result.status, 'failed');
  assert.strictEqual(result.rollback.attempted, false);
  assert.deepStrictEqual(readJSON(path.join(current.dataDirectory, 'sound.json')), {volume: 20});
});

test('failure on the first replacement preserves all previous active files', function () {
  let calls = 0;
  const writer = {
    writeJSONAtomic: function (target, value) {
      calls += 1;
      if (calls == 2) throw new Error('first replacement failed');
      atomicJSONFile.writeJSONAtomic(target, value);
    }
  };
  const current = fixture('first-failure', {atomicWriter: writer});
  const result = previewAndRestore(current, desiredBackup(current));
  assert.strictEqual(result.status, 'failed');
  assert.strictEqual(result.rollback.succeeded, true);
  assert.deepStrictEqual(readJSON(path.join(current.dataDirectory, 'sound.json')), {volume: 20});
  assert.strictEqual(fs.existsSync(path.join(current.dataDirectory, 'channels.json')), false);
});

test('failure after replacements automatically rolls every attempted file back', function () {
  let calls = 0;
  const writer = {
    writeJSONAtomic: function (target, value) {
      calls += 1;
      if (calls == 4) throw new Error('later replacement failed');
      atomicJSONFile.writeJSONAtomic(target, value);
    }
  };
  const current = fixture('later-failure', {atomicWriter: writer});
  const result = previewAndRestore(current, desiredBackup(current));
  assert.strictEqual(result.status, 'failed');
  assert.strictEqual(result.rollback.succeeded, true);
  assert.deepStrictEqual(readJSON(path.join(current.dataDirectory, 'sound.json')), {volume: 20});
  assert.strictEqual(fs.existsSync(path.join(current.dataDirectory, 'channels.json')), false);
  assert.strictEqual(readJSON(path.join(current.dataDirectory, 'beo-speaker-presets', 'speaker.json'))['speaker-preset'].presetName, 'Original');
});

test('readback verification failure triggers successful rollback', function () {
  let corrupted = false;
  const current = fixture('verification');
  const writer = {
    writeJSONAtomic: function (target, value) {
      atomicJSONFile.writeJSONAtomic(target, value);
      if (!corrupted && path.basename(target) == 'sound.json' && value.volume == 55) {
        corrupted = true;
        writeJSON(target, {volume: 999});
      }
    }
  };
  const service = configurationBackup.createConfigurationService(Object.assign({}, current.baseOptions, {atomicWriter: writer}));
  const preview = service.preview(JSON.stringify(desiredBackup(current)));
  const result = service.restore(preview.token);
  assert.strictEqual(result.status, 'failed');
  assert.strictEqual(result.error.code, 'RESTORE_VERIFICATION_FAILED');
  assert.strictEqual(result.rollback.succeeded, true);
  assert.deepStrictEqual(readJSON(path.join(current.dataDirectory, 'sound.json')), {volume: 20});
});

test('rollback failure is reported as a critical incomplete recovery', function () {
  let calls = 0;
  const writer = {
    writeJSONAtomic: function (target, value) {
      calls += 1;
      if (calls == 4 || calls >= 5) throw new Error('injected write failure');
      atomicJSONFile.writeJSONAtomic(target, value);
    }
  };
  const current = fixture('rollback-failure', {atomicWriter: writer});
  const result = previewAndRestore(current, desiredBackup(current));
  assert.strictEqual(result.status, 'failed');
  assert.strictEqual(result.rollback.succeeded, false);
  assert.ok(result.rollback.errors.length > 0);
  assert.strictEqual(result.restartRequired, true);
});

test('pending delayed writes are flushed and cancelled before restore', function () {
  const scheduled = new Map();
  const cleared = [];
  let next = 1;
  const timers = {
    setTimeout: function (callback) { const id = next++; scheduled.set(id, callback); return id; },
    clearTimeout: function (id) { cleared.push(id); scheduled.delete(id); }
  };
  const current = fixture('pending');
  const writer = settingsStore.createSettingsWriter(current.dataDirectory, 0, undefined, timers);
  const backup = desiredBackup(current);
  writer.saveSettings('sound', {volume: 30});
  const service = configurationBackup.createConfigurationService(Object.assign({}, current.baseOptions, {
    settingsCoordinator: writer
  }));
  const result = previewAndRestore({service}, backup);
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(scheduled.size, 0);
  assert.ok(cleared.length >= 2);
  assert.deepStrictEqual(readJSON(path.join(current.dataDirectory, 'sound.json')), {volume: 55});
});

test('ordinary writes are rejected during restore and resume afterwards', function () {
  const current = fixture('write-lock');
  const timers = {setTimeout: function () { return 1; }, clearTimeout: function () {}};
  const writer = settingsStore.createSettingsWriter(current.dataDirectory, 0, undefined, timers);
  let rejectedCode = null;
  const service = configurationBackup.createConfigurationService(Object.assign({}, current.baseOptions, {
    settingsCoordinator: writer,
    hooks: {
      afterReplacement: function () {
        try { writer.saveSettings('sound', {volume: 1}, true); }
        catch (error) { rejectedCode = error.code; }
      }
    }
  }));
  const preview = service.preview(JSON.stringify(desiredBackup(current)));
  const result = service.restore(preview.token);
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(rejectedCode, 'SETTINGS_RESTORE_IN_PROGRESS');
  writer.saveSettings('sound', {volume: 60}, true);
  assert.deepStrictEqual(readJSON(path.join(current.dataDirectory, 'sound.json')), {volume: 60});
});

test('a concurrent restore attempt is rejected deterministically', function () {
  const current = fixture('concurrent');
  let concurrentCode = null;
  let token;
  const service = configurationBackup.createConfigurationService(Object.assign({}, current.baseOptions, {
    hooks: {
      afterReplacement: function (index, operation, restore) {
        if (!concurrentCode) {
          try { restore(token); } catch (error) { concurrentCode = error.code; }
        }
      }
    }
  }));
  token = service.preview(JSON.stringify(desiredBackup(current))).token;
  const result = service.restore(token);
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(concurrentCode, 'RESTORE_BUSY');
});

test('a confirmation token cannot be reused after restore', function () {
  const current = fixture('repeated');
  const token = current.service.preview(JSON.stringify(desiredBackup(current))).token;
  assert.strictEqual(current.service.restore(token).status, 'success');
  assert.throws(function () { current.service.restore(token); }, function (error) {
    return error.code == 'INVALID_RESTORE_TOKEN';
  });
});

test('round trip restores semantic equivalence across every in-scope section', function () {
  const current = fixture('round-trip');
  const exported = current.service.collectBackup();
  writeJSON(path.join(current.dataDirectory, 'system.json'), {language: 'da'});
  writeJSON(path.join(current.dataDirectory, 'sound.json'), {volume: 1});
  writeJSON(path.join(current.dataDirectory, 'beo-speaker-presets', 'speaker.json'), {'speaker-preset': {presetName: 'Changed'}});
  writeJSON(path.join(current.dataDirectory, 'beo-listening-modes', 'mode.json'), {beosonic: {presetName: 'Changed'}});
  const result = previewAndRestore(current, exported);
  assert.strictEqual(result.status, 'success');
  const restored = current.service.collectBackup();
  ['settings', 'speakerPresets', 'listeningModes'].forEach(function (section) {
    assert.deepStrictEqual(restored.configuration[section].items, exported.configuration[section].items);
  });
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
    while (roots.length) fs.rmSync(roots.pop(), {recursive: true, force: true});
  }
});

console.log('\n' + (tests.length - failures) + ' passed, ' + failures + ' failed');
if (failures) process.exitCode = 1;
