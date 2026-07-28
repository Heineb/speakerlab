#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const atomicJSONFile = require('../Beocreate2/beo-system/atomic-json-file');
const settingsStore = require('../Beocreate2/beo-system/settings-store');
const tests = [];
const temporaryRoots = [];

function test(name, run) { tests.push({name, run}); }

function fixture(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-atomic-settings-' + label + '-'));
  const directory = path.join(root, 'configuration with spaces');
  const target = path.join(directory, 'system settings.json');
  temporaryRoots.push(root);
  fs.mkdirSync(directory);
  return {root, directory, target};
}

function errorWithCode(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function fileSystemWith(overrides) {
  return Object.assign({}, fs, overrides);
}

function temporaryArtifacts(current) {
  return fs.readdirSync(current.directory).filter(function (name) {
    return name.indexOf('.' + path.basename(current.target) + '.speakerlab-') == 0;
  });
}

function writeInitial(current, content) {
  fs.writeFileSync(current.target, content);
}

function assertPreRenameFailure(current, operation, stage) {
  assert.throws(operation, function (error) {
    assert.strictEqual(error.atomicWriteStage, stage);
    assert.strictEqual(error.atomicWriteTarget, current.target);
    return true;
  });
  assert.strictEqual(fs.readFileSync(current.target, 'utf8'), '{"valid":"previous"}');
  assert.deepStrictEqual(temporaryArtifacts(current), []);
}

test('writes compact JSON through a same-directory temporary file and atomic rename', function () {
  const current = fixture('success');
  const openedPaths = [];
  const renamedPaths = [];
  const fileSystem = fileSystemWith({
    openSync: function (candidate, flags, mode) {
      openedPaths.push({candidate, flags});
      return fs.openSync(candidate, flags, mode);
    },
    renameSync: function (source, target) {
      renamedPaths.push({source, target});
      return fs.renameSync(source, target);
    }
  });

  atomicJSONFile.writeJSONAtomic(current.target, {nested: {enabled: true}}, {fileSystem});

  assert.strictEqual(fs.readFileSync(current.target, 'utf8'), '{"nested":{"enabled":true}}');
  assert.strictEqual(path.dirname(renamedPaths[0].source), current.directory);
  assert.strictEqual(renamedPaths[0].target, current.target);
  assert.ok(openedPaths.some(function (entry) { return entry.flags == 'wx'; }));
  assert.deepStrictEqual(temporaryArtifacts(current), []);
});

test('preserves the mode of an existing target when replacing it', function () {
  const current = fixture('existing-mode');
  writeInitial(current, '{"old":true}');
  fs.chmodSync(current.target, 0o640);

  atomicJSONFile.writeJSONAtomic(current.target, {new: true});

  assert.strictEqual(fs.statSync(current.target).mode & 0o777, 0o640);
});

test('uses 0666 filtered by the process umask for a new target', function () {
  const current = fixture('new-mode');
  const previousUmask = process.umask(0o027);
  try {
    atomicJSONFile.writeJSONAtomic(current.target, {created: true});
  } finally {
    process.umask(previousUmask);
  }
  assert.strictEqual(fs.statSync(current.target).mode & 0o777, 0o640);
});

test('serialization failure occurs before filesystem replacement', function () {
  const current = fixture('serialization');
  writeInitial(current, '{"valid":"previous"}');
  const circular = {};
  circular.self = circular;
  assertPreRenameFailure(current, function () {
    atomicJSONFile.writeJSONAtomic(current.target, circular);
  }, 'validation');
});

test('top-level undefined is rejected before filesystem replacement', function () {
  const current = fixture('undefined');
  writeInitial(current, '{"valid":"previous"}');
  assertPreRenameFailure(current, function () {
    atomicJSONFile.writeJSONAtomic(current.target, undefined);
  }, 'validation');
});

test('temporary-file creation failure preserves the previous target', function () {
  const current = fixture('create-failure');
  writeInitial(current, '{"valid":"previous"}');
  const fileSystem = fileSystemWith({
    openSync: function (candidate, flags, mode) {
      if (flags == 'wx') throw errorWithCode('permission denied', 'EACCES');
      return fs.openSync(candidate, flags, mode);
    }
  });
  assertPreRenameFailure(current, function () {
    atomicJSONFile.writeJSONAtomic(current.target, {new: true}, {fileSystem});
  }, 'temporary-file creation');
});

test('a permission-denied destination reports EACCES without replacing the target', function () {
  const current = fixture('permission-denied');
  writeInitial(current, '{"valid":"previous"}');
  const fileSystem = fileSystemWith({
    openSync: function (candidate, flags, mode) {
      if (flags == 'wx') throw errorWithCode('read-only destination', 'EACCES');
      return fs.openSync(candidate, flags, mode);
    }
  });
  assert.throws(function () {
    atomicJSONFile.writeJSONAtomic(current.target, {new: true}, {fileSystem});
  }, function (error) {
    assert.strictEqual(error.code, 'EACCES');
    assert.strictEqual(error.atomicWriteStage, 'temporary-file creation');
    return true;
  });
  assert.strictEqual(fs.readFileSync(current.target, 'utf8'), '{"valid":"previous"}');
  assert.deepStrictEqual(temporaryArtifacts(current), []);
});

test('write failure preserves the previous target and removes the temporary file', function () {
  const current = fixture('write-failure');
  writeInitial(current, '{"valid":"previous"}');
  const fileSystem = fileSystemWith({
    writeSync: function () { throw errorWithCode('disk full', 'ENOSPC'); }
  });
  assertPreRenameFailure(current, function () {
    atomicJSONFile.writeJSONAtomic(current.target, {new: true}, {fileSystem});
  }, 'write');
});

test('short writes are retried until the complete JSON is written', function () {
  const current = fixture('short-write');
  const lengths = [];
  const fileSystem = fileSystemWith({
    writeSync: function (descriptor, buffer, offset, length, position) {
      const shortenedLength = Math.min(3, length);
      lengths.push(shortenedLength);
      return fs.writeSync(descriptor, buffer, offset, shortenedLength, position);
    }
  });
  atomicJSONFile.writeJSONAtomic(current.target, {complete: 'content'}, {fileSystem});
  assert.ok(lengths.length > 1);
  assert.strictEqual(fs.readFileSync(current.target, 'utf8'), '{"complete":"content"}');
});

test('a zero-length write is reported as incomplete and preserves the target', function () {
  const current = fixture('zero-write');
  writeInitial(current, '{"valid":"previous"}');
  const fileSystem = fileSystemWith({writeSync: function () { return 0; }});
  assertPreRenameFailure(current, function () {
    atomicJSONFile.writeJSONAtomic(current.target, {new: true}, {fileSystem});
  }, 'write');
});

test('permission application failure preserves the previous target', function () {
  const current = fixture('chmod-failure');
  writeInitial(current, '{"valid":"previous"}');
  const fileSystem = fileSystemWith({
    fchmodSync: function () { throw errorWithCode('chmod failed', 'EPERM'); }
  });
  assertPreRenameFailure(current, function () {
    atomicJSONFile.writeJSONAtomic(current.target, {new: true}, {fileSystem});
  }, 'permissions');
});

test('file sync failure preserves the previous target', function () {
  const current = fixture('file-sync-failure');
  writeInitial(current, '{"valid":"previous"}');
  const fileSystem = fileSystemWith({
    fsyncSync: function () { throw errorWithCode('file sync failed', 'EIO'); }
  });
  assertPreRenameFailure(current, function () {
    atomicJSONFile.writeJSONAtomic(current.target, {new: true}, {fileSystem});
  }, 'file sync');
});

test('temporary-file close failure preserves the previous target', function () {
  const current = fixture('close-failure');
  writeInitial(current, '{"valid":"previous"}');
  let closeCalls = 0;
  const fileSystem = fileSystemWith({
    closeSync: function (descriptor) {
      closeCalls += 1;
      if (closeCalls == 1) throw errorWithCode('close failed', 'EIO');
      return fs.closeSync(descriptor);
    }
  });
  assertPreRenameFailure(current, function () {
    atomicJSONFile.writeJSONAtomic(current.target, {new: true}, {fileSystem});
  }, 'close');
});

test('rename failure preserves the previous target and removes the temporary file', function () {
  const current = fixture('rename-failure');
  writeInitial(current, '{"valid":"previous"}');
  const fileSystem = fileSystemWith({
    renameSync: function () { throw errorWithCode('rename failed', 'EIO'); }
  });
  assertPreRenameFailure(current, function () {
    atomicJSONFile.writeJSONAtomic(current.target, {new: true}, {fileSystem});
  }, 'rename');
});

test('directory sync failure is reported after the valid replacement is visible', function () {
  const current = fixture('directory-sync-failure');
  writeInitial(current, '{"valid":"previous"}');
  let syncCalls = 0;
  const fileSystem = fileSystemWith({
    fsyncSync: function (descriptor) {
      syncCalls += 1;
      if (syncCalls == 2) throw errorWithCode('directory sync failed', 'EIO');
      return fs.fsyncSync(descriptor);
    }
  });
  assert.throws(function () {
    atomicJSONFile.writeJSONAtomic(current.target, {valid: 'replacement'}, {fileSystem});
  }, function (error) {
    assert.strictEqual(error.atomicWriteStage, 'directory sync');
    return true;
  });
  assert.strictEqual(fs.readFileSync(current.target, 'utf8'), '{"valid":"replacement"}');
  assert.deepStrictEqual(temporaryArtifacts(current), []);
});

test('known unsupported directory sync errors are tolerated after rename', function () {
  const current = fixture('unsupported-directory-sync');
  let syncCalls = 0;
  const fileSystem = fileSystemWith({
    fsyncSync: function (descriptor) {
      syncCalls += 1;
      if (syncCalls == 2) throw errorWithCode('unsupported', 'EINVAL');
      return fs.fsyncSync(descriptor);
    }
  });
  atomicJSONFile.writeJSONAtomic(current.target, {valid: true}, {fileSystem});
  assert.strictEqual(fs.readFileSync(current.target, 'utf8'), '{"valid":true}');
});

test('cleanup failure is attached to the reported pre-rename error', function () {
  const current = fixture('cleanup-failure');
  writeInitial(current, '{"valid":"previous"}');
  const fileSystem = fileSystemWith({
    writeSync: function () { throw errorWithCode('write failed', 'EIO'); },
    unlinkSync: function () { throw errorWithCode('cleanup failed', 'EACCES'); }
  });
  assert.throws(function () {
    atomicJSONFile.writeJSONAtomic(current.target, {new: true}, {fileSystem});
  }, function (error) {
    assert.strictEqual(error.atomicWriteStage, 'write');
    assert.strictEqual(error.atomicWriteCleanupError.code, 'EACCES');
    return true;
  });
  assert.strictEqual(fs.readFileSync(current.target, 'utf8'), '{"valid":"previous"}');
  assert.strictEqual(temporaryArtifacts(current).length, 1);
});

test('a missing destination directory fails without creating it', function () {
  const current = fixture('missing-directory');
  const missingDirectory = path.join(current.root, 'missing');
  const target = path.join(missingDirectory, 'settings.json');
  assert.throws(function () {
    atomicJSONFile.writeJSONAtomic(target, {new: true});
  }, function (error) {
    assert.strictEqual(error.code, 'ENOENT');
    assert.strictEqual(error.atomicWriteStage, 'validation');
    return true;
  });
  assert.strictEqual(fs.existsSync(missingDirectory), false);
});

test('an existing stale temporary file is ignored and never treated as authoritative', function () {
  const current = fixture('stale');
  writeInitial(current, '{"valid":"previous"}');
  const stale = path.join(current.directory, '.' + path.basename(current.target) + '.speakerlab-old-1.tmp');
  fs.writeFileSync(stale, '{"invalid":"stale"}');
  atomicJSONFile.writeJSONAtomic(current.target, {valid: 'replacement'});
  assert.strictEqual(fs.readFileSync(current.target, 'utf8'), '{"valid":"replacement"}');
  assert.strictEqual(fs.readFileSync(stale, 'utf8'), '{"invalid":"stale"}');
});

test('a failed delayed flush retains queued settings for a later successful retry', function () {
  const current = fixture('flush-retry');
  let fail = true;
  const persistence = {
    writeJSONAtomic: function (target, value) {
      if (fail) throw errorWithCode('injected failure', 'EIO');
      atomicJSONFile.writeJSONAtomic(target, value);
    }
  };
  const timers = {setTimeout: function () { return 1; }, clearTimeout: function () {}};
  const writer = settingsStore.createSettingsWriter(current.directory, 0, undefined, timers, persistence);
  writer.saveSettings('sound', {volume: 20});
  assert.throws(function () { writer.savePendingSettings(); }, /injected failure/);
  fail = false;
  writer.savePendingSettings();
  writer.savePendingSettings();
  assert.strictEqual(fs.readFileSync(path.join(current.directory, 'sound.json'), 'utf8'), '{"volume":20}');
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
