#!/usr/bin/env node

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const script = path.join(repositoryRoot, 'scripts', 'prepare-local-beocreate-layout.js');
const tests = [];
const temporaryDirectories = [];

function test(name, run) {
  tests.push({name: name, run: run});
}

function makeTemporaryDirectory(label) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-' + label + '-'));
  temporaryDirectories.push(directory);
  return directory;
}

function cleanTemporaryDirectories() {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), {recursive: true, force: true});
  }
}

function runScript(destination, scriptPath) {
  return childProcess.spawnSync(process.execPath, [scriptPath || script, destination], {encoding: 'utf8'});
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function expectedPaths(destination) {
  const root = path.join(destination, 'opt', 'beocreate');
  return [
    root,
    path.join(root, 'beo-system'),
    path.join(root, 'beo-extensions'),
    path.join(root, 'beo-views'),
    path.join(root, 'beo-dsp-programs'),
    path.join(root, 'beo-listening-modes'),
    path.join(root, 'beo-product-identities'),
    path.join(root, 'beo-product-images'),
    path.join(root, 'beo-speaker-presets'),
    path.join(root, 'beocreate_essentials')
  ];
}

function linkSnapshot(destination) {
  return expectedPaths(destination).slice(1).map(function (link) {
    return {
      path: path.relative(destination, link),
      target: fs.readlinkSync(link),
      realpath: fs.realpathSync(link)
    };
  });
}

function createIncompleteRepository() {
  const fakeRepository = makeTemporaryDirectory('missing-source');
  const fakeScriptDirectory = path.join(fakeRepository, 'scripts');
  fs.mkdirSync(path.join(fakeRepository, 'docs'), {recursive: true});
  fs.mkdirSync(fakeScriptDirectory);
  fs.writeFileSync(path.join(fakeRepository, 'AGENTS.md'), 'test fixture\n');
  fs.writeFileSync(path.join(fakeRepository, 'docs', 'PROJECT_CHARTER.md'), 'test fixture\n');
  fs.copyFileSync(script, path.join(fakeScriptDirectory, path.basename(script)));
  return fakeRepository;
}

test('creates the layout in a fresh temporary directory', function () {
  const parent = makeTemporaryDirectory('fresh');
  const destination = path.join(parent, 'layout');
  const result = runScript(destination);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /Prepared local Beocreate layout at /);
  assert.ok(fs.statSync(path.join(destination, 'opt', 'beocreate')).isDirectory());
  fs.rmSync(parent, {recursive: true, force: true});
});

test('creates all expected deployed paths as symbolic links', function () {
  const parent = makeTemporaryDirectory('paths');
  const destination = path.join(parent, 'layout');
  assert.strictEqual(runScript(destination).status, 0);
  expectedPaths(destination).slice(1).forEach(function (entry) {
    assert.ok(fs.lstatSync(entry).isSymbolicLink(), entry + ' is not a symbolic link');
    assert.ok(fs.statSync(entry).isDirectory(), entry + ' does not resolve to a directory');
  });
  fs.rmSync(parent, {recursive: true, force: true});
});

test('resolves Beocreate Essentials through the server deployed-relative path', function () {
  const parent = makeTemporaryDirectory('resolution');
  const destination = path.join(parent, 'layout');
  assert.strictEqual(runScript(destination).status, 0);
  const serverDirectory = path.join(destination, 'opt', 'beocreate', 'beo-system');
  const expectedImport = path.join(serverDirectory, '..', 'beocreate_essentials', 'communication');
  assert.strictEqual(
    require.resolve(expectedImport),
    path.join(repositoryRoot, 'beocreate_essentials', 'communication.js')
  );
  fs.rmSync(parent, {recursive: true, force: true});
});

test('is deterministic and idempotent', function () {
  const parent = makeTemporaryDirectory('idempotent');
  const destination = path.join(parent, 'layout');
  assert.strictEqual(runScript(destination).status, 0);
  const first = linkSnapshot(destination);
  assert.strictEqual(runScript(destination).status, 0);
  assert.deepStrictEqual(linkSnapshot(destination), first);
  fs.rmSync(parent, {recursive: true, force: true});
});

test('does not modify representative source files or the server lockfile', function () {
  const parent = makeTemporaryDirectory('source');
  const destination = path.join(parent, 'layout');
  const sourceFiles = [
    path.join(repositoryRoot, 'Beocreate2', 'beo-system', 'beo-server.js'),
    path.join(repositoryRoot, 'Beocreate2', 'beo-extensions', 'channels', 'index.js'),
    path.join(repositoryRoot, 'beocreate_essentials', 'communication.js'),
    path.join(repositoryRoot, 'Beocreate2', 'beo-system', 'package-lock.json')
  ];
  const before = sourceFiles.map(hashFile);
  assert.strictEqual(runScript(destination).status, 0);
  assert.deepStrictEqual(sourceFiles.map(hashFile), before);
  fs.rmSync(parent, {recursive: true, force: true});
});

test('keeps output isolated to the provided destination', function () {
  const parent = makeTemporaryDirectory('isolated');
  const destination = path.join(parent, 'chosen destination');
  const sentinel = path.join(parent, 'outside-sentinel.txt');
  fs.writeFileSync(sentinel, 'unchanged');
  assert.strictEqual(runScript(destination).status, 0);
  assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'unchanged');
  assert.deepStrictEqual(fs.readdirSync(parent).sort(), ['chosen destination', 'outside-sentinel.txt']);
  fs.rmSync(parent, {recursive: true, force: true});
});

test('fails clearly when required source content is missing', function () {
  const fakeRepository = createIncompleteRepository();
  const outputParent = makeTemporaryDirectory('missing-output');
  const destination = path.join(outputParent, 'layout');
  const fakeScript = path.join(fakeRepository, 'scripts', path.basename(script));
  const result = runScript(destination, fakeScript);
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Required source directory "Beocreate2\/beo-system" is missing/);
  assert.strictEqual(fs.existsSync(destination), false);
  fs.rmSync(fakeRepository, {recursive: true, force: true});
  fs.rmSync(outputParent, {recursive: true, force: true});
});

test('refuses unexpected conflicting destination content without overwriting it', function () {
  const parent = makeTemporaryDirectory('conflict');
  const destination = path.join(parent, 'layout');
  const conflict = path.join(destination, 'opt', 'beocreate', 'beo-system');
  fs.mkdirSync(path.dirname(conflict), {recursive: true});
  fs.writeFileSync(conflict, 'do not replace');
  const result = runScript(destination);
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Refusing to overwrite unexpected existing path/);
  assert.strictEqual(fs.readFileSync(conflict, 'utf8'), 'do not replace');
  assert.strictEqual(fs.existsSync(path.join(path.dirname(conflict), 'beocreate_essentials')), false);
  fs.rmSync(parent, {recursive: true, force: true});
});

test('supports destination paths containing spaces', function () {
  const parent = makeTemporaryDirectory('spaces');
  const destination = path.join(parent, 'layout with spaces');
  const result = runScript(destination);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(destination, 'opt', 'beocreate', 'beo-system')));
  fs.rmSync(parent, {recursive: true, force: true});
});

test('requires no network, hardware, dependencies, sudo or root-specific destination', function () {
  const parent = makeTemporaryDirectory('offline');
  const destination = path.join(parent, 'unprivileged-layout');
  const result = childProcess.spawnSync(process.execPath, [script, destination], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      HTTP_PROXY: 'http://127.0.0.1:1',
      HTTPS_PROXY: 'http://127.0.0.1:1',
      NO_PROXY: ''
    })
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(destination, 'opt', 'beocreate')));
  fs.rmSync(parent, {recursive: true, force: true});
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
