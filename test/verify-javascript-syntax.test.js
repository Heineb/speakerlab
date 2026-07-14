#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const verifier = require('../scripts/verify-javascript-syntax');
const tests = [];
const temporaryDirectories = [];

function test(name, run) {
  tests.push({name: name, run: run});
}

function makeTemporaryDirectory(label) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-syntax-' + label + '-'));
  temporaryDirectories.push(directory);
  return directory;
}

function cleanTemporaryDirectories() {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), {recursive: true, force: true});
  }
}

function writeFile(root, relativePath, contents) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, contents);
  return file;
}

function captureStream() {
  let output = '';
  return {
    stream: {write: function (chunk) { output += chunk; }},
    read: function () { return output; }
  };
}

test('selects JavaScript files deterministically and excludes generated or dependency directories', function () {
  const root = makeTemporaryDirectory('selection');
  writeFile(root, 'z-last.js', 'const z = true;\n');
  writeFile(root, 'a first.js', 'const a = true;\n');
  writeFile(root, 'nested/middle.js', 'const middle = true;\n');
  writeFile(root, 'nested/readme.txt', 'not JavaScript\n');
  writeFile(root, '.git/invalid.js', 'const = ;\n');
  writeFile(root, 'node_modules/package/invalid.js', 'const = ;\n');
  writeFile(root, '.speakerlab-local/opt/invalid.js', 'const = ;\n');

  const selected = verifier.collectJavaScriptFiles(root).map(function (file) {
    return path.relative(root, file);
  });

  assert.deepStrictEqual(selected, ['a first.js', 'nested/middle.js', 'z-last.js']);
});

test('passes valid JavaScript including paths containing spaces', function () {
  const root = makeTemporaryDirectory('valid');
  writeFile(root, 'directory with spaces/valid file.js', 'function valid() { return true; }\n');
  const stdout = captureStream();
  const stderr = captureStream();

  assert.strictEqual(verifier.verifyJavaScriptSyntax(root, {
    stdout: stdout.stream,
    stderr: stderr.stream
  }), 0);
  assert.match(stdout.read(), /passed for 1 files/);
  assert.strictEqual(stderr.read(), '');
});

test('returns failure and identifies every file with invalid syntax', function () {
  const root = makeTemporaryDirectory('invalid');
  writeFile(root, 'valid.js', 'const valid = true;\n');
  writeFile(root, 'broken file.js', 'const broken = ;\n');
  const stdout = captureStream();
  const stderr = captureStream();

  assert.strictEqual(verifier.verifyJavaScriptSyntax(root, {
    stdout: stdout.stream,
    stderr: stderr.stream
  }), 1);
  assert.match(stderr.read(), /JavaScript syntax check failed: broken file\.js/);
  assert.match(stderr.read(), /1 JavaScript file\(s\) failed syntax checking/);
  assert.strictEqual(stdout.read(), '');
});

test('does not traverse symbolic-link directories', function () {
  const root = makeTemporaryDirectory('symlink');
  const outside = makeTemporaryDirectory('outside');
  writeFile(root, 'inside.js', 'const inside = true;\n');
  writeFile(outside, 'outside.js', 'const outside = true;\n');
  fs.symlinkSync(outside, path.join(root, 'linked-directory'), 'dir');

  const selected = verifier.collectJavaScriptFiles(root).map(function (file) {
    return path.relative(root, file);
  });
  assert.deepStrictEqual(selected, ['inside.js']);
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
