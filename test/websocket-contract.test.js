'use strict';

const assert = require('assert');
const http = require('http');
const LocalCommunication = require('../beocreate_essentials/communication-local');
const testClient = require('./websocket-test-client');

const tests = [];
function test(name, fn) { tests.push({name, fn}); }

function waitForCommunicationEvent(communication, eventName, predicate, description) {
  return new Promise(function (resolve, reject) {
    const timeout = setTimeout(function () {
      communication.removeListener(eventName, onEvent);
      reject(new Error('Timed out waiting for ' + description + '.'));
    }, 2000);
    function onEvent() {
      const values = Array.from(arguments);
      if (!predicate.apply(null, values)) return;
      clearTimeout(timeout);
      communication.removeListener(eventName, onEvent);
      resolve(values);
    }
    communication.on(eventName, onEvent);
  });
}

function waitForConnectionClose(communication, connectionID) {
  return waitForCommunicationEvent(
    communication,
    'close',
    function (closedID) { return closedID === connectionID; },
    'server-side close of connection ' + connectionID
  );
}

function waitForHeader(communication, header) {
  return waitForCommunicationEvent(
    communication,
    'data',
    function (data) { return data.header === header; },
    'application envelope ' + header
  );
}

function assertCloseFrame(frame, code, reason) {
  assert.strictEqual(frame.opcode, 0x8);
  assert.ok(frame.payload.length >= 2, 'Close frame must include a status code.');
  assert.strictEqual(frame.payload.readUInt16BE(0), code);
  assert.strictEqual(frame.payload.subarray(2).toString('utf8'), reason);
}

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
    const receivedBoth = new Promise(function (resolve, reject) {
      const timeout = setTimeout(function () {
        reject(new Error('Timed out waiting for both characterized envelopes.'));
      }, 2000);
      app.communication.on('data', function (data) {
        received.push(data);
        if (received.length === 2) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    const client = await testClient.connect({port: app.port});
    client.sendJSON({});
    client.sendJSON({target: 42, header: [], content: 'legacy transport preserves values'});
    await receivedBoth;
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
    const receivedHeaders = [];
    const stillAvailable = new Promise(function (resolve, reject) {
      const timeout = setTimeout(function () {
        reject(new Error('Timed out waiting for the post-failure envelope.'));
      }, 2000);
      app.communication.on('data', function (data) {
        receivedHeaders.push(data.header);
        if (data.header === 'stillAvailable') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
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
    await stillAvailable;
    assert.strictEqual(app.communication.connections.length, 1);
    assert.deepStrictEqual(receivedHeaders, ['throw', 'stillAvailable']);
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
    const applicationMessages = [];
    const closedConnections = [];
    app.communication.on('data', function (data, connectionID) {
      applicationMessages.push({data: data, connectionID: connectionID});
    });
    app.communication.on('close', function (connectionID) {
      closedConnections.push(connectionID);
    });

    const observer = await testClient.connect({port: app.port});
    const observerID = app.communication.connections[0].ID;

    const binaryClient = await testClient.connect({port: app.port});
    const binaryID = app.communication.connections[1].ID;
    const binaryServerClose = waitForConnectionClose(app.communication, binaryID);
    binaryClient.sendBinary(Buffer.from([1, 2, 3]));
    const binaryClose = await binaryClient.nextFrame();
    assertCloseFrame(binaryClose, 1003, 'Binary messages are unsupported');
    await Promise.all([binaryClient.waitForClose(), binaryServerClose]);
    assert.deepStrictEqual(
      app.communication.connections.map(function (connection) { return connection.ID; }),
      [observerID]
    );

    const observerAfterBinary = waitForHeader(app.communication, 'observerAfterBinary');
    observer.sendJSON({target: 'fixture', header: 'observerAfterBinary'});
    await observerAfterBinary;

    const oversized = await testClient.connect({port: app.port});
    const oversizedID = app.communication.connections[1].ID;
    const oversizedServerClose = waitForConnectionClose(app.communication, oversizedID);
    oversized.sendText('x'.repeat(1024 * 1024 + 1));
    const sizeClose = await oversized.nextFrame();
    assertCloseFrame(sizeClose, 1009, 'Message too large');
    await Promise.all([oversized.waitForClose(), oversizedServerClose]);
    assert.deepStrictEqual(
      app.communication.connections.map(function (connection) { return connection.ID; }),
      [observerID]
    );

    const observerAfterOversized = waitForHeader(app.communication, 'observerAfterOversized');
    observer.sendJSON({target: 'fixture', header: 'observerAfterOversized'});
    await observerAfterOversized;

    const observerServerClose = waitForConnectionClose(app.communication, observerID);
    observer.close();
    await Promise.all([observer.waitForClose(), observerServerClose]);

    const healthy = await testClient.connect({port: app.port});
    const healthyID = app.communication.connections[0].ID;
    const healthyDispatch = waitForHeader(app.communication, 'healthy');
    healthy.sendJSON({target: 'fixture', header: 'healthy'});
    await healthyDispatch;
    assert.strictEqual(app.communication.connections.length, 1);
    assert.deepStrictEqual(closedConnections, [binaryID, oversizedID, observerID]);
    assert.deepStrictEqual(applicationMessages, [
      {data: {target: 'fixture', header: 'observerAfterBinary'}, connectionID: observerID},
      {data: {target: 'fixture', header: 'observerAfterOversized'}, connectionID: observerID},
      {data: {target: 'fixture', header: 'healthy'}, connectionID: healthyID}
    ]);
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
