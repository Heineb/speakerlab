'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const runtime = require('../scripts/local-development-runtime');
const layout = require('../scripts/prepare-local-beocreate-layout');
const websocketClient = require('./websocket-test-client');
const routingModel = require('../Beocreate2/beo-extensions/signal-flow/routing-model');

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

async function waitForMessage(client, predicate) {
  for (let index = 0; index < 20; index += 1) {
    const message = await client.nextJSON();
    if (predicate(message)) return message;
  }
  throw new Error('Expected WebSocket message was not received.');
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
    assert.match(response.body, /signal-flow/);
    assert.doesNotMatch(server.output(), /127\\.0\\.1\\.1:8086|systemctl|dsptoolkit|pigs/);
    const socket = await websocketClient.connect({port: server.port});
    const dspStatus = await waitForMessage(socket, function (message) {
      return message.target === 'dsp-programs' && message.header === 'status';
    });
    assert.deepStrictEqual(dspStatus.content, {dspConnected: true, dspResponding: true});

    socket.sendJSON({target: 'channels', header: 'getSettings'});
    const channels = await waitForMessage(socket, function (message) {
      return message.target === 'channels' && message.header === 'channelSettings';
    });
    assert.strictEqual(channels.content.settings.balance, 0);

    socket.sendJSON({target: 'signal-flow', header: 'getState'});
    const routingState = await waitForMessage(socket, function (message) {
      return message.target === 'signal-flow' && message.header === 'state';
    });
    assert.strictEqual(routingState.content.capabilities.outputs.length, 4);
    assert.strictEqual(routingState.content.runtime.deploymentStatus, 'not-deployed');
    assert.strictEqual(routingState.content.runtime.simulated, true);
    const routingDraft = routingModel.clone(routingState.content.configuration);
    Object.assign(routingDraft.outputs[0], {enabled: true, role: 'woofer', side: 'left', label: 'Left bass'});
    routingDraft.connections.push({source: 'left', destination: 'output-a', enabled: true});
    socket.sendJSON({
      target: 'signal-flow',
      header: 'save',
      content: {configuration: routingDraft, revision: routingState.content.revision}
    });
    const routingSaved = await waitForMessage(socket, function (message) {
      return message.target === 'signal-flow' && message.header === 'saveResult';
    });
    assert.strictEqual(routingSaved.content.success, true);
    assert.strictEqual(routingSaved.content.verified, true);
    assert.strictEqual(routingSaved.content.deploymentStatus, 'not-deployed');
    const routingPath = path.join(server.root, 'state', 'signal-flow.json');
    assert.strictEqual(JSON.parse(fs.readFileSync(routingPath)).outputs[0].label, 'Left bass');
    socket.sendJSON({target: 'signal-flow', header: 'getState'});
    const reloadedRouting = await waitForMessage(socket, function (message) {
      return message.target === 'signal-flow' && message.header === 'state';
    });
    assert.strictEqual(reloadedRouting.content.configuration.outputs[0].label, 'Left bass');
    assert.strictEqual(reloadedRouting.content.revision, routingSaved.content.revision);

    socket.sendJSON({
      target: 'general',
      header: 'activatedExtension',
      content: {extension: 'hifiberry-system-tools', deepMenu: null}
    });
    const capabilities = await waitForMessage(socket, function (message) {
      return message.target === 'hifiberry-system-tools' &&
        message.header === 'configurationBackupCapabilities';
    });
    assert.strictEqual(capabilities.content.format, 'org.speakerlab.configuration-backup');

    socket.sendJSON({target: 'unknown-extension', header: 'unknown-header'});
    socket.sendText('{');
    socket.sendJSON({target: 'channels', header: 'getSettings'});
    await waitForMessage(socket, function (message) {
      return message.target === 'channels' && message.header === 'channelSettings';
    });
    socket.close();
    await socket.waitForClose();
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
    const first = await websocketClient.connect({port: server.port});
    const firstStatus = await waitForMessage(first, function (message) {
      return message.target === 'dsp-programs' && message.header === 'status';
    });
    assert.deepStrictEqual(firstStatus.content, {dspConnected: false, dspResponding: false});
    first.sendJSON({target: 'signal-flow', header: 'getState'});
    const disconnectedRouting = await waitForMessage(first, function (message) {
      return message.target === 'signal-flow' && message.header === 'state';
    });
    assert.strictEqual(disconnectedRouting.content.runtime.connected, false);
    assert.strictEqual(disconnectedRouting.content.runtime.deploymentStatus, 'not-deployed');
    first.destroy();
    await first.waitForClose();

    const second = await websocketClient.connect({port: server.port});
    const secondStatus = await waitForMessage(second, function (message) {
      return message.target === 'dsp-programs' && message.header === 'status';
    });
    assert.deepStrictEqual(secondStatus.content, firstStatus.content);
    const closeFrame = second.nextFrame();
    await stopServer(server);
    assert.strictEqual((await closeFrame).opcode, 0x8);
    server.stopped = true;
  } finally {
    if (!server.stopped) await stopServer(server);
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
