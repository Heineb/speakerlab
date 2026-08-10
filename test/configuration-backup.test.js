#!/usr/bin/env node

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const configurationBackup = require('../Beocreate2/beo-system/configuration-backup');
const signalFlowModel = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const tests = [];
const roots = [];
const FIXED_DATE = new Date('2026-07-29T10:00:00.000Z');

function test(name, run) { tests.push({name, run}); }

function fixture(label, options) {
  options = options || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-backup-' + label + '-'));
  const dataDirectory = path.join(root, 'configuration with spaces');
  roots.push(root);
  fs.mkdirSync(dataDirectory);
  writeJSON(path.join(dataDirectory, 'system.json'), {language: 'en', custom: true});
  writeJSON(path.join(dataDirectory, 'ui.json'), {disclosure: {advanced: true}});
  writeJSON(path.join(dataDirectory, 'sound.json'), {volume: 42});
  writeJSON(path.join(dataDirectory, 'network.json'), {password: 'must-not-export'});
  if (!options.withoutResources) {
    fs.mkdirSync(path.join(dataDirectory, 'beo-speaker-presets'));
    fs.mkdirSync(path.join(dataDirectory, 'beo-listening-modes'));
    writeJSON(path.join(dataDirectory, 'beo-speaker-presets', 'speaker one.json'), {
      'speaker-preset': {presetName: 'Speaker One'},
      channels: {role: 'left'}
    });
    writeJSON(path.join(dataDirectory, 'beo-listening-modes', 'mode one.json'), {
      beosonic: {presetName: 'Mode One', beosonicAngle: 0}
    });
  }
  const service = configurationBackup.createConfigurationService({
    dataDirectory,
    systemVersion: '2.3.0',
    systemConfiguration: {cardType: 'Beocreate 4-Channel Amplifier'},
    clock: function () { return new Date(FIXED_DATE.getTime()); }
  });
  return {root, dataDirectory, service};
}

function writeJSON(target, value) {
  fs.writeFileSync(target, JSON.stringify(value));
}

function hashTree(directory) {
  const values = [];
  function visit(current, relative) {
    fs.readdirSync(current).sort().forEach(function (name) {
      const full = path.join(current, name);
      const nextRelative = path.join(relative, name);
      if (fs.statSync(full).isDirectory()) visit(full, nextRelative);
      else values.push(nextRelative + ':' + crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex'));
    });
  }
  visit(directory, '');
  return values;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function reseal(backup) {
  Object.keys(backup.configuration).forEach(function (name) {
    if (['settings', 'speakerPresets', 'listeningModes'].indexOf(name) != -1) {
      backup.configuration[name].checksum = configurationBackup.checksum({
        present: backup.configuration[name].present,
        items: backup.configuration[name].items
      });
    }
  });
  delete backup.integrity;
  backup.integrity = {algorithm: 'sha256', checksum: configurationBackup.checksum(backup)};
  return backup;
}

test('exports a deterministic valid versioned backup with required metadata', function () {
  const current = fixture('deterministic');
  const first = current.service.serializeBackup();
  const second = current.service.serializeBackup();
  assert.strictEqual(first, second);
  const parsed = current.service.parseAndValidate(first).backup;
  assert.strictEqual(parsed.format, 'org.speakerlab.configuration-backup');
  assert.strictEqual(parsed.schemaVersion, 1);
  assert.strictEqual(parsed.createdAt, FIXED_DATE.toISOString());
  assert.strictEqual(parsed.source.platform, 'beocreate');
  assert.deepStrictEqual(parsed.requiredSections, ['settings', 'speakerPresets', 'listeningModes']);
});

test('exports complete safe settings, user speaker presets and listening modes', function () {
  const current = fixture('complete');
  const backup = current.service.collectBackup();
  assert.deepStrictEqual(backup.configuration.settings.items.map(function (item) { return item.name; }), [
    'sound.json', 'system.json', 'ui.json'
  ]);
  assert.deepStrictEqual(backup.configuration.speakerPresets.items.map(function (item) { return item.name; }), ['speaker one.json']);
  assert.deepStrictEqual(backup.configuration.listeningModes.items.map(function (item) { return item.name; }), ['mode one.json']);
});

test('includes the versioned signal-flow settings without changing its format', function () {
  const current = fixture('signal-flow');
  const routing = signalFlowModel.defaultConfiguration();
  Object.assign(routing.outputs[0], {label: 'Bass', role: 'woofer', side: 'left', enabled: true});
  routing.connections.push({source: 'left', destination: 'output-a', enabled: true});
  Object.assign(routing.crossover.outputs[0].lowPass, {
    enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 1800
  });
  Object.assign(routing.channelProcessing.outputs[0], {
    gain: {valueDb: -2.5}, delay: {valueMs: 0.42}, polarity: {inverted: true}
  });
  Object.assign(routing.driverProtection.outputs[0].driver, {manufacturer: 'Example', model: 'Bass 8', nominalImpedanceOhms: 8, continuousPowerWatts: 50});
  Object.assign(routing.driverProtection.outputs[0].amplifier, {maximumPeakVoltage: 35.36});
  Object.assign(routing.driverProtection.outputs[0].limiter, {enabled: true, thresholdPeakVoltage: 28.28, safetyMarginDb: -3, attackMs: 5, releaseMs: 250});
  writeJSON(path.join(current.dataDirectory, 'signal-flow.json'), routing);
  const backup = current.service.collectBackup();
  const item = backup.configuration.settings.items.find(function (entry) { return entry.name === 'signal-flow.json'; });
  assert.deepStrictEqual(item.data, routing);
  assert.strictEqual(item.data.crossover.outputs[0].lowPass.cutoffHz, 1800);
  assert.deepStrictEqual(item.data.channelProcessing.outputs[0], routing.channelProcessing.outputs[0]);
  assert.deepStrictEqual(item.data.driverProtection.outputs[0], routing.driverProtection.outputs[0]);
  assert.strictEqual(item.checksum, configurationBackup.checksum(routing));
});

test('rejects invalid or unsupported signal-flow settings during export and import validation', function () {
  const invalid = fixture('invalid-signal-flow');
  const invalidRouting = signalFlowModel.defaultConfiguration();
  invalidRouting.outputs[0].role = 'invalid';
  writeJSON(path.join(invalid.dataDirectory, 'signal-flow.json'), invalidRouting);
  assert.throws(function () { invalid.service.collectBackup(); }, function (error) {
    return error.code === 'INVALID_SIGNAL_FLOW_CONFIGURATION';
  });

  const unsupported = fixture('unsupported-signal-flow');
  writeJSON(path.join(unsupported.dataDirectory, 'signal-flow.json'), signalFlowModel.defaultConfiguration());
  const backup = unsupported.service.collectBackup();
  const item = backup.configuration.settings.items.find(function (entry) { return entry.name === 'signal-flow.json'; });
  item.data.version = 2;
  item.checksum = configurationBackup.checksum(item.data);
  reseal(backup);
  assert.throws(function () { unsupported.service.parseAndValidate(JSON.stringify(backup)); }, function (error) {
    return error.code === 'UNSUPPORTED_SIGNAL_FLOW_VERSION';
  });

  const unsupportedCrossover = fixture('unsupported-crossover');
  writeJSON(path.join(unsupportedCrossover.dataDirectory, 'signal-flow.json'), signalFlowModel.defaultConfiguration());
  const crossoverBackup = unsupportedCrossover.service.collectBackup();
  const crossoverItem = crossoverBackup.configuration.settings.items.find(function (entry) { return entry.name === 'signal-flow.json'; });
  crossoverItem.data.crossover.version = 2;
  crossoverItem.checksum = configurationBackup.checksum(crossoverItem.data);
  reseal(crossoverBackup);
  assert.throws(function () { unsupportedCrossover.service.parseAndValidate(JSON.stringify(crossoverBackup)); }, function (error) {
    return error.code === 'INVALID_SIGNAL_FLOW_CONFIGURATION';
  });
});

test('represents missing optional resource directories as empty absent sections', function () {
  const current = fixture('missing-resources', {withoutResources: true});
  const backup = current.service.collectBackup();
  assert.deepStrictEqual(backup.configuration.speakerPresets, {
    present: false,
    items: [],
    checksum: configurationBackup.checksum({present: false, items: []})
  });
  assert.strictEqual(current.service.parseAndValidate(JSON.stringify(backup)).warnings.length, 0);
});

test('fails export clearly when an in-scope configuration file is unreadable JSON', function () {
  const current = fixture('unreadable');
  fs.writeFileSync(path.join(current.dataDirectory, 'channels.json'), '{broken');
  assert.throws(function () { current.service.collectBackup(); }, function (error) {
    return error.code == 'UNREADABLE_CONFIGURATION' && /channels.json/.test(error.message);
  });
});

test('excludes named sensitive categories and dynamically detected sensitive files', function () {
  const current = fixture('sensitive');
  writeJSON(path.join(current.dataDirectory, 'custom-extension.json'), {apiToken: 'secret'});
  const backup = current.service.collectBackup();
  const serialized = JSON.stringify(backup);
  assert.strictEqual(serialized.indexOf('must-not-export'), -1);
  assert.strictEqual(serialized.indexOf('"secret"'), -1);
  assert.ok(backup.excludedCategories.some(function (entry) { return entry.id == 'central-settings/network'; }));
  assert.ok(backup.excludedCategories.some(function (entry) { return entry.id == 'central-settings/custom-extension'; }));
});

test('does not mutate active configuration during repeated export', function () {
  const current = fixture('no-mutation');
  const before = hashTree(current.dataDirectory);
  current.service.collectBackup();
  current.service.collectBackup();
  assert.deepStrictEqual(hashTree(current.dataDirectory), before);
});

test('contains no absolute development-machine paths', function () {
  const current = fixture('portable');
  const serialized = current.service.serializeBackup();
  assert.strictEqual(serialized.indexOf(current.root), -1);
  assert.strictEqual(serialized.indexOf('/Users/'), -1);
  assert.ok(serialized.indexOf('speaker one.json') != -1);
});

test('rejects malformed JSON and the wrong format identifier', function () {
  const current = fixture('parse-errors');
  assert.throws(function () { current.service.parseAndValidate('{'); }, function (error) { return error.code == 'INVALID_JSON'; });
  const backup = current.service.collectBackup();
  backup.format = 'other';
  assert.throws(function () { current.service.parseAndValidate(JSON.stringify(backup)); }, function (error) { return error.code == 'WRONG_FORMAT'; });
});

test('rejects unsupported future and older schema versions', function () {
  const current = fixture('versions');
  [2, 0].forEach(function (version) {
    const backup = current.service.collectBackup();
    backup.schemaVersion = version;
    assert.throws(function () { current.service.parseAndValidate(JSON.stringify(backup)); }, function (error) {
      return error.code == 'UNSUPPORTED_VERSION';
    });
  });
});

test('rejects missing required metadata and required sections', function () {
  const current = fixture('required');
  const missingDate = current.service.collectBackup();
  delete missingDate.createdAt;
  assert.throws(function () { current.service.parseAndValidate(JSON.stringify(missingDate)); }, function (error) {
    return error.code == 'INVALID_BACKUP';
  });
  const missingSection = current.service.collectBackup();
  delete missingSection.configuration.settings;
  reseal(missingSection);
  assert.throws(function () { current.service.parseAndValidate(JSON.stringify(missingSection)); }, function (error) {
    return error.code == 'MISSING_REQUIRED_SECTION';
  });
});

test('rejects corrupt item, section and overall checksums', function () {
  const current = fixture('checksums');
  const item = current.service.collectBackup();
  item.configuration.settings.items[0].data.changed = true;
  assert.throws(function () { current.service.parseAndValidate(JSON.stringify(item)); }, function (error) {
    return error.code == 'CORRUPT_BACKUP';
  });
  const overall = current.service.collectBackup();
  overall.integrity.checksum = '0'.repeat(64);
  assert.throws(function () { current.service.parseAndValidate(JSON.stringify(overall)); }, function (error) {
    return error.code == 'CORRUPT_BACKUP';
  });
});

test('warns about unknown optional sections and rejects unknown required sections', function () {
  const current = fixture('unknown-sections');
  const optional = current.service.collectBackup();
  optional.configuration.futureOptional = {data: true};
  reseal(optional);
  const result = current.service.parseAndValidate(JSON.stringify(optional));
  assert.ok(result.warnings[0].indexOf('futureOptional') != -1);
  const required = current.service.collectBackup();
  required.requiredSections.push('futureRequired');
  required.configuration.futureRequired = {data: true};
  reseal(required);
  assert.throws(function () { current.service.parseAndValidate(JSON.stringify(required)); }, function (error) {
    return error.code == 'UNKNOWN_REQUIRED_SECTION';
  });
});

test('warns when source hardware metadata differs without rejecting opaque settings', function () {
  const current = fixture('platform-warning');
  const backup = current.service.collectBackup();
  const otherService = configurationBackup.createConfigurationService({
    dataDirectory: current.dataDirectory,
    systemConfiguration: {cardType: 'Different Beocreate'}
  });
  const result = otherService.parseAndValidate(JSON.stringify(backup));
  assert.ok(result.warnings.some(function (warning) { return warning.indexOf('Different Beocreate') != -1; }));
});

test('rejects oversized input before parsing', function () {
  const current = fixture('oversized');
  const oversized = ' '.repeat(5 * 1024 * 1024 + 1);
  assert.throws(function () { current.service.parseAndValidate(oversized); }, function (error) {
    return error.code == 'BACKUP_TOO_LARGE';
  });
});

test('fails export instead of producing a backup larger than the restore limit', function () {
  const current = fixture('oversized-export');
  writeJSON(path.join(current.dataDirectory, 'large.json'), {value: 'x'.repeat(5 * 1024 * 1024)});
  assert.throws(function () { current.service.serializeBackup(); }, function (error) {
    return error.code == 'BACKUP_TOO_LARGE';
  });
});

test('preview classifies created, replaced, unchanged, absent and unsupported items', function () {
  const current = fixture('preview');
  const backup = current.service.collectBackup();
  backup.configuration.settings.items = backup.configuration.settings.items.filter(function (item) { return item.name != 'ui.json'; });
  const changedSound = backup.configuration.settings.items.find(function (item) { return item.name == 'sound.json'; });
  changedSound.data.volume = 10;
  changedSound.checksum = configurationBackup.checksum(changedSound.data);
  backup.configuration.settings.items.push({
    name: 'channels.json',
    data: {role: 'stereo'},
    checksum: configurationBackup.checksum({role: 'stereo'})
  });
  backup.configuration.future = {data: true};
  reseal(backup);
  const preview = current.service.preview(JSON.stringify(backup));
  assert.ok(preview.plan.create.indexOf('settings/channels.json') != -1);
  assert.ok(preview.plan.replace.indexOf('settings/sound.json') != -1);
  assert.ok(preview.plan.unchanged.indexOf('settings/system.json') != -1);
  assert.ok(preview.plan.absent.indexOf('settings/ui.json') != -1);
  assert.deepStrictEqual(preview.plan.unsupported, ['future']);
  assert.strictEqual(preview.plan.restartRequired, true);
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
