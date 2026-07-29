'use strict';

const assert = require('assert');
const http = require('http');
const LocalCommunication = require('../beocreate_essentials/communication-local');
const testClient = require('./websocket-test-client');

const tests = [];
function test(name, fn) { tests.push({name, fn}); }

async function fixture() {
  const server = http.createServer(function (request, response) {
    response.statusCode = 404;
    response.end();
  });
  const communication = new LocalCommunication();
  communication.startSocket({server: server, acceptedProtocols: ['beocreate']});
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  return {
    server: server,
    communication: communication,
    port: server.address().port,
    stop: function () {
      return new Promise(function (resolve) {
        communication.stopSocket(function () {
          server.close();
          resolve();
        });
      });
    }
  };
}

test('accepts the existing root-path and beocreate subprotocol', async function () {
  const app = await fixture();
  try {
    const client = await testClient.connect({port: app.port, path: '/', protocol: 'beocreate'});
    assert.strictEqual(app.communication.connections.length, 1);
    client.close();
    await client.waitForClose();
  } finally {
    await app.stop();
  }
});

test('routes valid client envelopes with content preserved', async function () {
  const app = await fixture();
  try {
    const received = new Promise(function (resolve) {
      app.communication.once('data', function (data, connectionID) {
        resolve({data: data, connectionID: connectionID});
      });
    });
    const client = await testClient.connect({port: app.port});
    const envelope = {target: 'channels', header: 'setBalance', content: {balance: -7, extra: true}};
    client.sendJSON(envelope);
    const result = await received;
    assert.deepStrictEqual(result.data, envelope);
    assert.strictEqual(typeof result.connectionID, 'number');
    client.close();
    await client.waitForClose();
  } finally {
    await app.stop();
  }
});

test('preserves server envelopes with and without content', async function () {
  const app = await fixture();
  try {
    const client = await testClient.connect({port: app.port});
    app.communication.send({target: 'general', header: 'reload'});
    assert.deepStrictEqual(await client.nextJSON(), {target: 'general', header: 'reload'});
    app.communication.send({target: 'channels', header: 'channelSettings', content: {settings: {balance: 0}}});
    assert.deepStrictEqual(
      await client.nextJSON(),
      {target: 'channels', header: 'channelSettings', content: {settings: {balance: 0}}}
    );
    client.close();
    await client.waitForClose();
  } finally {
    await app.stop();
  }
});

test('characterizes missing and wrong envelope fields without transport rejection', async function () {
  const app = await fixture();
  try {
    const received = [];
    app.communication.on('data', function (data) { received.push(data); });
    const client = await testClient.connect({port: app.port});
    client.sendJSON({});
    client.sendJSON({target: 42, header: [], content: 'legacy transport preserves values'});
    await new Promise(function (resolve) { setTimeout(resolve, 20); });
    assert.deepStrictEqual(received, [
      {},
      {target: 42, header: [], content: 'legacy transport preserves values'}
    ]);
    client.close();
    await client.waitForClose();
  } finally {
    await app.stop();
  }
});

test('survives malformed JSON, repeated invalid input and handler failure', async function () {
  const app = await fixture();
  const originalError = console.error;
  const errors = [];
  console.error = function () { errors.push(Array.from(arguments).join(' ')); };
  try {
    app.communication.on('data', function (data) {
      if (data.header === 'throw') throw new Error('fixture handler failure');
    });
    const client = await testClient.connect({port: app.port});
    client.sendText('{');
    client.sendText('{');
    client.sendText('{');
    client.sendText('{');
    client.sendJSON({target: 'fixture', header: 'throw'});
    client.sendJSON({target: 'fixture', header: 'stillAvailable'});
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.strictEqual(app.communication.connections.length, 1);
    assert.ok(errors.some(function (line) { return line.includes('Further invalid'); }));
    client.close();
    await client.waitForClose();
  } finally {
    console.error = originalError;
    await app.stop();
  }
});

test('rejects unsupported binary input and oversized messages without stopping server', async function () {
  const app = await fixture();
  const originalError = console.error;
  console.error = function () {};
  try {
    const binaryClient = await testClient.connect({port: app.port});
    binaryClient.sendBinary(Buffer.from([1, 2, 3]));
    const binaryClose = await binaryClient.nextFrame();
    assert.strictEqual(binaryClose.opcode, 0x8);
    await binaryClient.waitForClose();

    const oversized = await testClient.connect({port: app.port});
    oversized.sendText('x'.repeat(1024 * 1024 + 1));
    const sizeClose = await oversized.nextFrame();
    assert.strictEqual(sizeClose.opcode, 0x8);
    await oversized.waitForClose();

    const healthy = await testClient.connect({port: app.port});
    healthy.sendJSON({target: 'fixture', header: 'healthy'});
    assert.strictEqual(app.communication.connections.length, 1);
    healthy.close();
    await healthy.waitForClose();
  } finally {
    console.error = originalError;
    await app.stop();
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
