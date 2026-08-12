#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const configurationBackup = require('../Beocreate2/beo-system/configuration-backup');
const configurationAPI = require('../Beocreate2/beo-extensions/hifiberry-system-tools/configuration-api');
const tests = [];
const roots = [];

function test(name, run) { tests.push({name, run}); }

function fixture(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-api-' + label + '-'));
  const dataDirectory = path.join(root, 'configuration with spaces');
  roots.push(root);
  fs.mkdirSync(dataDirectory);
  fs.writeFileSync(path.join(dataDirectory, 'system.json'), '{"language":"en"}');
  const service = configurationBackup.createConfigurationService({
    dataDirectory,
    systemVersion: '2.3.0',
    systemConfiguration: {cardType: 'Beocreate 4-Channel Amplifier'},
    clock: function () { return new Date('2026-07-29T12:00:00.000Z'); }
  });
  return {root, dataDirectory, service, api: configurationAPI.createConfigurationAPI(service)};
}

function response() {
  return {
    statusCode: null,
    contentType: null,
    headers: {},
    body: null,
    status: function (value) { this.statusCode = value; return this; },
    type: function (value) { this.contentType = value; return this; },
    set: function (name, value) { this.headers[name] = value; return this; },
    send: function (value) { this.body = value; return this; }
  };
}

function json(responseState) { return JSON.parse(responseState.body); }

test('capabilities reports the stable format, size limit and restore state', function () {
  const current = fixture('capabilities');
  const output = response();
  current.api.capabilities({}, output);
  assert.strictEqual(output.statusCode, 200);
  assert.strictEqual(json(output).format, 'org.speakerlab.configuration-backup');
  assert.strictEqual(json(output).maxBackupBytes, 5 * 1024 * 1024);
});

test('export returns a downloadable validated JSON backup', function () {
  const current = fixture('export');
  const output = response();
  current.api.exportBackup({}, output);
  assert.strictEqual(output.statusCode, 200);
  assert.strictEqual(output.contentType, 'application/json');
  assert.ok(output.headers['Content-Disposition'].indexOf('speakerlab-configuration-backup.json') != -1);
  assert.strictEqual(current.service.parseAndValidate(output.body).backup.schemaVersion, 1);
});

test('preview validates input and returns metadata, plan and confirmation token', function () {
  const current = fixture('preview');
  const output = response();
  current.api.preview({body: current.service.serializeBackup()}, output);
  const body = json(output);
  assert.strictEqual(output.statusCode, 200);
  assert.strictEqual(typeof body.token, 'string');
  assert.ok(body.token.length >= 32);
  assert.strictEqual(body.plan.restartRequired, true);
});

test('confirmed restore requires the preview token and returns verified success', function () {
  const current = fixture('restore');
  const previewOutput = response();
  current.api.preview({body: current.service.serializeBackup()}, previewOutput);
  const restoreOutput = response();
  current.api.restore({body: JSON.stringify({token: json(previewOutput).token})}, restoreOutput);
  assert.strictEqual(restoreOutput.statusCode, 200);
  assert.strictEqual(json(restoreOutput).status, 'success');
});

test('invalid input and unsupported versions return structured client errors', function () {
  const current = fixture('invalid');
  const invalidOutput = response();
  current.api.preview({body: '{'}, invalidOutput);
  assert.strictEqual(invalidOutput.statusCode, 400);
  assert.strictEqual(json(invalidOutput).error.code, 'INVALID_JSON');

  const backup = current.service.collectBackup();
  backup.schemaVersion = 2;
  const versionOutput = response();
  current.api.preview({body: JSON.stringify(backup)}, versionOutput);
  assert.strictEqual(versionOutput.statusCode, 400);
  assert.strictEqual(json(versionOutput).error.code, 'UNSUPPORTED_VERSION');
});

test('oversized input returns 413 and missing confirmation returns 409', function () {
  const current = fixture('limits');
  const oversized = response();
  current.api.preview({body: ' '.repeat(5 * 1024 * 1024 + 1)}, oversized);
  assert.strictEqual(oversized.statusCode, 413);
  assert.strictEqual(json(oversized).error.code, 'BACKUP_TOO_LARGE');
  const missing = response();
  current.api.restore({body: '{}'}, missing);
  assert.strictEqual(missing.statusCode, 409);
  assert.strictEqual(json(missing).error.code, 'INVALID_RESTORE_TOKEN');
});

test('restore failure includes the original error and rollback outcome', function () {
  let calls = 0;
  const current = fixture('rollback-result');
  const failingService = configurationBackup.createConfigurationService({
    dataDirectory: current.dataDirectory,
    atomicWriter: {
      writeJSONAtomic: function (target, value) {
        calls += 1;
        if (calls == 2) throw new Error('injected');
        require('../Beocreate2/beo-system/atomic-json-file').writeJSONAtomic(target, value);
      }
    },
    clock: function () { return new Date('2026-07-29T12:00:00.000Z'); }
  });
  const api = configurationAPI.createConfigurationAPI(failingService);
  const backup = failingService.collectBackup();
  backup.configuration.settings.items[0].data = {language: 'da'};
  backup.configuration.settings.items[0].checksum = configurationBackup.checksum({language: 'da'});
  backup.configuration.settings.checksum = configurationBackup.checksum({
    present: true,
    items: backup.configuration.settings.items
  });
  delete backup.integrity;
  backup.integrity = {algorithm: 'sha256', checksum: configurationBackup.checksum(backup)};
  const previewOutput = response();
  api.preview({body: JSON.stringify(backup)}, previewOutput);
  const restoreOutput = response();
  api.restore({body: JSON.stringify({token: json(previewOutput).token})}, restoreOutput);
  assert.strictEqual(restoreOutput.statusCode, 500);
  assert.strictEqual(json(restoreOutput).status, 'failed');
  assert.strictEqual(json(restoreOutput).rollback.succeeded, true);
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
