'use strict';

const assert = require('assert');
const http = require('http');
const LocalCommunication = require('../beocreate_essentials/communication-local');
const testClient = require('./websocket-test-client');

const tests = [];
function test(name, fn) { tests.push({name, fn}); }

async function fixture() {
  const server = http.createServer();
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

test('emits open then close for a clean connection', async function () {
  const app = await fixture();
  try {
    const events = [];
    app.communication.on('open', function (id, protocol) { events.push(['open', id, protocol]); });
    app.communication.on('close', function (id) { events.push(['close', id]); });
    const client = await testClient.connect({port: app.port});
    const serverClosed = new Promise(function (resolve) {
      app.communication.once('close', resolve);
    });
    client.close();
    await Promise.all([client.waitForClose(), serverClosed]);
    assert.deepStrictEqual(events.map(function (item) { return item[0]; }), ['open', 'close']);
    assert.strictEqual(events[0][1], events[1][1]);
    assert.strictEqual(events[0][2], 'beocreate');
  } finally {
    await app.stop();
  }
});

test('removes abruptly disconnected clients', async function () {
  const app = await fixture();
  try {
    const closed = new Promise(function (resolve) { app.communication.once('close', resolve); });
    const client = await testClient.connect({port: app.port});
    client.destroy();
    await closed;
    assert.strictEqual(app.communication.connections.length, 0);
  } finally {
    await app.stop();
  }
});

test('supports reconnect and repeated reconnect with fresh identifiers', async function () {
  const app = await fixture();
  try {
    const identifiers = [];
    app.communication.on('open', function (id) { identifiers.push(id); });
    for (let index = 0; index < 3; index += 1) {
      const client = await testClient.connect({port: app.port});
      const serverClosed = new Promise(function (resolve) {
        app.communication.once('close', resolve);
      });
      client.close();
      await Promise.all([client.waitForClose(), serverClosed]);
    }
    assert.deepStrictEqual(identifiers, [1, 2, 3]);
    assert.strictEqual(app.communication.connections.length, 0);
    assert.strictEqual(app.communication.listenerCount('data'), 0);
  } finally {
    await app.stop();
  }
});

test('broadcasts to all clients and targets one connection', async function () {
  const app = await fixture();
  try {
    const first = await testClient.connect({port: app.port});
    const second = await testClient.connect({port: app.port});
    app.communication.send({target: 'fixture', header: 'broadcast'});
    assert.strictEqual((await first.nextJSON()).header, 'broadcast');
    assert.strictEqual((await second.nextJSON()).header, 'broadcast');

    const firstID = app.communication.connections[0].ID;
    app.communication.send({target: 'fixture', header: 'targeted'}, firstID);
    assert.strictEqual((await first.nextJSON()).header, 'targeted');
    await assert.rejects(second.nextFrame(50), /Timed out/);
    first.close();
    second.close();
    await Promise.all([first.waitForClose(), second.waitForClose()]);
  } finally {
    await app.stop();
  }
});

test('responds to ping and keeps message ordering', async function () {
  const app = await fixture();
  try {
    const client = await testClient.connect({port: app.port});
    client.sendFrame(0x9, 'hello');
    const pong = await client.nextFrame();
    assert.strictEqual(pong.opcode, 0xA);
    assert.strictEqual(pong.payload.toString(), 'hello');
    app.communication.send({target: 'fixture', header: 'first'});
    app.communication.send({target: 'fixture', header: 'second'});
    assert.strictEqual((await client.nextJSON()).header, 'first');
    assert.strictEqual((await client.nextJSON()).header, 'second');
    client.close();
    await client.waitForClose();
  } finally {
    await app.stop();
  }
});

test('shutdown closes all active clients and rejects future upgrades', async function () {
  const app = await fixture();
  const first = await testClient.connect({port: app.port});
  const second = await testClient.connect({port: app.port});
  const stopped = app.stop();
  const frames = await Promise.all([first.nextFrame(), second.nextFrame()]);
  assert.ok(frames.every(function (item) { return item.opcode === 0x8; }));
  await stopped;
  assert.strictEqual(app.communication.connections.length, 0);
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
