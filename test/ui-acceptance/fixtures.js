'use strict';

const base = require('@playwright/test');
const childProcess = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..', '..');

function allocateLoopbackPort() {
  return new Promise(function (resolve, reject) {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', function () {
      const port = server.address().port;
      server.close(function (error) {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function waitForExit(child, timeoutMs) {
  return new Promise(function (resolve, reject) {
    if (child.exitCode !== null) return resolve(child.exitCode);
    const timer = setTimeout(function () {
      reject(new Error('Local server did not stop within ' + timeoutMs + ' ms.'));
    }, timeoutMs);
    child.once('exit', function (code) {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function createServerController(testInfo) {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-ui-acceptance-'));
  const port = await allocateLoopbackPort();
  const logs = [];
  let child = null;
  let stopping = false;
  let unexpectedExit = null;
  let expectedConnectionInterruptionUntil = 0;

  function statePath(name) {
    return path.join(runtimeRoot, 'state', name);
  }

  function writeState(name, value) {
    fs.mkdirSync(path.dirname(statePath(name)), {recursive: true});
    fs.writeFileSync(statePath(name), JSON.stringify(value));
  }

  function start(dspState) {
    if (child) throw new Error('Local server is already running.');
    stopping = false;
    unexpectedExit = null;
    return new Promise(function (resolve, reject) {
      child = childProcess.spawn(process.execPath, [
        path.join(repositoryRoot, 'scripts', 'start-local-server.js'),
        '--runtime-root', runtimeRoot,
        '--port', String(port),
        '--dsp-state', dspState || 'connected'
      ], {
        cwd: repositoryRoot,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let ready = false;
      const timeout = setTimeout(function () {
        reject(new Error('Local server readiness timed out.\n' + logs.join('')));
      }, 12000);
      function collect(chunk) {
        const text = chunk.toString();
        logs.push(text);
        if (!ready && text.includes('HTTP server listening at http://127.0.0.1:' + port + '/')) {
          ready = true;
          clearTimeout(timeout);
          resolve();
        }
      }
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.once('exit', function (code, signal) {
        clearTimeout(timeout);
        if (!stopping) unexpectedExit = {code: code, signal: signal};
        child = null;
        if (!ready) reject(new Error('Local server exited before readiness.\n' + logs.join('')));
      });
    });
  }

  async function stop() {
    if (!child) return;
    expectedConnectionInterruptionUntil = Date.now() + 15000;
    const processToStop = child;
    stopping = true;
    processToStop.kill('SIGTERM');
    try {
      await waitForExit(processToStop, 7000);
    } catch (error) {
      processToStop.kill('SIGKILL');
      await waitForExit(processToStop, 3000).catch(function () {});
      throw error;
    } finally {
      child = null;
    }
  }

  await start('connected');
  return {
    url: 'http://127.0.0.1:' + port + '/',
    runtimeRoot: runtimeRoot,
    statePath: statePath,
    writeState: writeState,
    start: start,
    stop: stop,
    restart: async function (dspState) {
      await stop();
      await start(dspState || 'connected');
    },
    assertHealthy: function () {
      if (unexpectedExit) {
        throw new Error('Local server terminated unexpectedly: ' + JSON.stringify(unexpectedExit));
      }
    },
    expectsConnectionInterruption: function () {
      return Date.now() <= expectedConnectionInterruptionUntil;
    },
    dispose: async function () {
      await stop();
      await testInfo.attach('speakerlab-local-server.log', {
        body: Buffer.from(logs.join('')),
        contentType: 'text/plain'
      });
      fs.rmSync(runtimeRoot, {recursive: true, force: true});
    }
  };
}

const test = base.test.extend({
  speakerlab: async function ({}, use, testInfo) {
    const controller = await createServerController(testInfo);
    try {
      await use(controller);
      controller.assertHealthy();
    } finally {
      await controller.dispose();
    }
  },
  monitoredPage: async function ({page, speakerlab}, use, testInfo) {
    const failures = [];
    const allowedConsole = [
      /^Download the Vue Devtools extension/,
      /^You are running Vue in development mode/
    ];
    page.on('pageerror', function (error) {
      failures.push('pageerror: ' + error.stack);
    });
    page.on('console', function (message) {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (speakerlab.expectsConnectionInterruption() &&
        (/^WebSocket connection to .* failed:/.test(text) ||
         /^Failed to load resource: net::ERR_CONNECTION_REFUSED$/.test(text))) return;
      if (!allowedConsole.some(function (pattern) { return pattern.test(text); })) {
        failures.push('console.error: ' + text);
      }
    });
    page.on('requestfailed', function (request) {
      if (speakerlab.expectsConnectionInterruption() && /^ws:/.test(request.url())) return;
      if (speakerlab.expectsConnectionInterruption() &&
        /\/common\/create-wait-animate\.svg$/.test(request.url()) &&
        request.failure() && request.failure().errorText === 'net::ERR_CONNECTION_REFUSED') return;
      if (/\/hifiberry-system-tools\/configuration-backup\/export$/.test(request.url()) &&
        request.failure() && request.failure().errorText === 'net::ERR_ABORTED') return;
      failures.push('requestfailed: ' + request.method() + ' ' + request.url() + ' ' +
        (request.failure() ? request.failure().errorText : 'unknown'));
    });
    page.on('response', function (response) {
      if (response.status() >= 500) {
        failures.push('HTTP ' + response.status() + ': ' + response.url());
      }
      if (response.status() === 404 && !/\/favicon\.ico(?:\?|$)/.test(response.url())) {
        failures.push('unexpected HTTP 404: ' + response.url());
      }
    });
    await use(page);
    if (failures.length) {
      await testInfo.attach('browser-failures.txt', {
        body: Buffer.from(failures.join('\n\n')),
        contentType: 'text/plain'
      });
    }
    base.expect(failures, 'unexpected browser failures').toEqual([]);
    speakerlab.assertHealthy();
  }
});

module.exports = {
  test: test,
  expect: base.expect
};
