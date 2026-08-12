'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function createWorkspace(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-configuration-read-' + label + '-'));
  const systemDirectory = path.join(root, 'system resources');
  const userDirectory = path.join(root, 'user resources');
  fs.mkdirSync(systemDirectory);
  fs.mkdirSync(userDirectory);
  return {root, systemDirectory, userDirectory};
}

function writeRaw(directory, filename, contents) {
  const target = path.join(directory, filename);
  fs.writeFileSync(target, contents);
  return target;
}

function writeJSON(directory, filename, value) {
  return writeRaw(directory, filename, JSON.stringify(value));
}

function captureLogger() {
  const messages = {log: [], error: []};
  return {
    messages,
    logger: {
      log: function () { messages.log.push(Array.prototype.slice.call(arguments)); },
      error: function () { messages.error.push(Array.prototype.slice.call(arguments)); }
    }
  };
}

function runTests(tests) {
  let failures = 0;
  tests.forEach(function (entry) {
    let workspace;
    try {
      workspace = createWorkspace(entry.label || 'test');
      entry.run(workspace);
      console.log('ok - ' + entry.name);
    } catch (error) {
      failures += 1;
      console.error('not ok - ' + entry.name);
      console.error(error.stack || error.message);
    } finally {
      if (workspace) fs.rmSync(workspace.root, {recursive: true, force: true});
    }
  });
  console.log('\n' + (tests.length - failures) + ' passed, ' + failures + ' failed');
  if (failures > 0) process.exitCode = 1;
}

module.exports = {
  captureLogger,
  runTests,
  writeJSON,
  writeRaw
};
