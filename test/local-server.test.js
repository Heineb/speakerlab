'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const runtime = require('../scripts/local-development-runtime');
const layout = require('../scripts/prepare-local-beocreate-layout');

const repositoryRoot = path.resolve(__dirname, '..');
const tests = [];
function test(name, fn) { tests.push({name, fn}); }

function temporaryDirectory(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-' + label + '-'));
}

function request(url) {
  return new Promise(function (resolve, reject) {
    http.get(url, function (response) {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', function (chunk) { body += chunk; });
      response.on('end', function () {
        resolve({status: response.statusCode, body: body});
      });
    }).on('error', reject);
  });
}

function startServer(dspState) {
  return new Promise(function (resolve, reject) {
    const root = temporaryDirectory('server with spaces ');
    const child = childProcess.spawn(
      process.execPath,
      [path.join(repositoryRoot, 'scripts', 'start-local-server.js'),
        '--runtime-root', root, '--port', '0', '--dsp-state', dspState],
      {cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe']}
    );
    let output = '';
    let settled = false;
    const timeout = setTimeout(function () {
      child.kill('SIGKILL');
      reject(new Error('Local server did not start.\n' + output));
    }, 10000);
    function collect(chunk) {
      output += chunk.toString();
      const match = output.match(/HTTP server listening at http:\/\/127\.0\.0\.1:(\d+)\//);
      if (!settled && match) {
        settled = true;
        clearTimeout(timeout);
        resolve({child: child, root: root, port: Number(match[1]), output: function () { return output; }});
      }
    }
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('exit', function (code) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error('Local server exited with ' + code + '.\n' + output));
      }
    });
  });
}

function stopServer(server) {
  return new Promise(function (resolve, reject) {
    const timeout = setTimeout(function () {
      server.child.kill('SIGKILL');
      reject(new Error('Local server did not shut down cleanly.\n' + server.output()));
    }, 7000);
    server.child.once('exit', function (code) {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error('Local server exited with ' + code + '.\n' + server.output()));
    });
    server.child.kill('SIGTERM');
  });
}

test('prepares isolated runtime paths with spaces and deterministic environment', function () {
  const root = temporaryDirectory('runtime with spaces ');
  const prepared = runtime.prepareRuntime({
    repositoryRoot: repositoryRoot,
    runtimeRoot: root,
    prepareLayout: layout.prepareLayout
  });
  const environment = runtime.environmentFor(prepared, {port: 0, dspState: 'connected'});
  assert.strictEqual(environment.SPEAKERLAB_BIND_ADDRESS, '127.0.0.1');
  assert.strictEqual(environment.SPEAKERLAB_DSP_TRANSPORT, 'simulated');
  assert.ok(prepared.dataDirectory.startsWith(root));
  assert.ok(fs.statSync(prepared.serverEntry).isFile());
  assert.ok(!prepared.dataDirectory.startsWith('/etc'));
  runtime.prepareRuntime({
    repositoryRoot: repositoryRoot,
    runtimeRoot: root,
    prepareLayout: layout.prepareLayout
  });
});

test('classifies every server extension as enabled or disabled', function () {
  const extensionNames = fs.readdirSync(path.join(repositoryRoot, 'Beocreate2', 'beo-extensions'))
    .filter(function (name) { return name.charAt(0) !== '.'; });
  extensionNames.forEach(function (name) {
    assert.ok(
      runtime.DEFAULT_EXTENSIONS.includes(name) ||
      runtime.DISABLED_EXTENSION_REASONS[name],
      'missing local startup classification for ' + name
    );
  });
});

test('rejects unsafe port and DSP-state input', function () {
  assert.throws(function () {
    runtime.environmentFor({}, {port: 70000, dspState: 'connected'});
  }, /port must be/);
  assert.throws(function () {
    runtime.environmentFor({}, {port: 0, dspState: 'hardware'});
  }, /DSP state/);
});

test('starts existing UI with connected simulator and shuts down cleanly', async function () {
  const server = await startServer('connected');
  try {
    const response = await request('http://127.0.0.1:' + server.port + '/');
    assert.strictEqual(response.status, 200);
    assert.match(response.body, /speakerlab-local/);
    assert.match(response.body, /"dspState":"connected"/);
    assert.match(response.body, /hifiberry-system-tools/);
    assert.doesNotMatch(server.output(), /127\\.0\\.1\\.1:8086|systemctl|dsptoolkit|pigs/);
  } finally {
    await stopServer(server);
    fs.rmSync(server.root, {recursive: true, force: true});
  }
});

test('starts disconnected simulator without contacting hardware', async function () {
  const server = await startServer('disconnected');
  try {
    const response = await request('http://127.0.0.1:' + server.port + '/');
    assert.strictEqual(response.status, 200);
    assert.match(response.body, /"dspState":"disconnected"/);
    assert.doesNotMatch(server.output(), /127\\.0\\.1\\.1:8086/);
  } finally {
    await stopServer(server);
    fs.rmSync(server.root, {recursive: true, force: true});
  }
});

(async function run() {
  let failures = 0;
  for (const item of tests) {
    try {
      await item.fn();
      console.log('ok - ' + item.name);
    } catch (error) {
      failures += 1;
      console.error('not ok - ' + item.name);
      console.error(error.stack);
    }
  }
  console.log('\n' + (tests.length - failures) + ' passed, ' + failures + ' failed');
  if (failures) process.exitCode = 1;
}());
