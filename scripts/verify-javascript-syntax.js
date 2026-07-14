#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.speakerlab-local',
  'node_modules'
]);

function collectJavaScriptFiles(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const files = [];

  function visit(directory) {
    const entries = fs.readdirSync(directory, {withFileTypes: true})
      .sort(function (left, right) {
        if (left.name < right.name) return -1;
        if (left.name > right.name) return 1;
        return 0;
      });

    entries.forEach(function (entry) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) visit(entryPath);
      } else if (entry.isFile() && path.extname(entry.name) === '.js') {
        files.push(entryPath);
      }
    });
  }

  visit(root);
  return files;
}

function checkJavaScriptFile(file, nodeExecutable) {
  return childProcess.spawnSync(
    nodeExecutable || process.execPath,
    ['--check', file],
    {encoding: 'utf8'}
  );
}

function verifyJavaScriptSyntax(rootDirectory, options) {
  const settings = options || {};
  const stdout = settings.stdout || process.stdout;
  const stderr = settings.stderr || process.stderr;
  const nodeExecutable = settings.nodeExecutable || process.execPath;
  const root = path.resolve(rootDirectory);
  const files = collectJavaScriptFiles(root);
  let failures = 0;

  files.forEach(function (file) {
    const result = checkJavaScriptFile(file, nodeExecutable);
    if (result.status !== 0) {
      failures += 1;
      stderr.write('JavaScript syntax check failed: ' + path.relative(root, file) + '\n');
      if (result.stderr) stderr.write(result.stderr);
      if (result.stdout) stderr.write(result.stdout);
      if (result.error) stderr.write(result.error.message + '\n');
    }
  });

  if (failures === 0) {
    stdout.write('JavaScript syntax check passed for ' + files.length + ' files.\n');
    return 0;
  }

  stderr.write(failures + ' JavaScript file(s) failed syntax checking.\n');
  return 1;
}

function main(argv) {
  if (argv.length > 1 || argv[0] === '--help' || argv[0] === '-h') {
    if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
      console.log('Usage: node scripts/verify-javascript-syntax.js [repository-root]');
      return 0;
    }
    console.error('Usage: node scripts/verify-javascript-syntax.js [repository-root]');
    return 2;
  }

  const repositoryRoot = argv[0] ? path.resolve(argv[0]) : path.resolve(__dirname, '..');
  try {
    return verifyJavaScriptSyntax(repositoryRoot);
  } catch (error) {
    console.error('Unable to verify JavaScript syntax: ' + error.message);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = {
  EXCLUDED_DIRECTORIES: EXCLUDED_DIRECTORIES,
  checkJavaScriptFile: checkJavaScriptFile,
  collectJavaScriptFiles: collectJavaScriptFiles,
  verifyJavaScriptSyntax: verifyJavaScriptSyntax
};
