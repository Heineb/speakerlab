'use strict';

const assert = require('assert');
const simulatorModule = require('../Beocreate2/beo-extensions/signal-flow/sigmatcp-transport-simulator');
const protocol = require('../Beocreate2/beo-extensions/signal-flow/sigmatcp-protocol');

const tests = [];
function test(name, fn) { tests.push({name, fn}); }
function read(simulator, address, length, timeout) {
  return new Promise(function (resolve) {
    simulator.read(address, length, function (error, result) { resolve({error, result}); }, timeout);
  });
}

test('serializes multiple reads and calls each callback exactly once', async function () {
  const simulator = simulatorModule.createSimulator();
  const results = await Promise.all([read(simulator, 781, 4), read(simulator, 786, 4), read(simulator, 781, 4)]);
  assert.deepStrictEqual(results.map(function (item) { return item.result.address; }), [781, 786, 781]);
  assert.deepStrictEqual(simulator.state().pending, null);
  assert.strictEqual(simulator.state().queued, 0);
});

test('times out one read and continues the queue without accepting a late response', async function () {
  const simulator = simulatorModule.createSimulator();
  simulator.setScenario('timeout');
  const first = read(simulator, 781, 4, 10);
  await new Promise(function (resolve) { setTimeout(resolve, 15); });
  simulator.setScenario(null);
  const second = read(simulator, 786, 4, 50);
  assert.strictEqual((await first).error.code, 'READ_TIMEOUT');
  assert.strictEqual((await second).result.address, 786);
  assert.strictEqual(simulator.receive(protocol.encodeSyntheticReadResponse(781, Buffer.alloc(4)), 1).status, 'stale');
});

test('malformed and wrong-size responses fail one operation and clean the queue', async function () {
  for (const scenario of ['malformed', 'wrong-size']) {
    const simulator = simulatorModule.createSimulator();
    simulator.setScenario(scenario);
    const result = await read(simulator, 781, 4);
    assert.ok(['UNKNOWN_COMMAND', 'WRONG_RESPONSE_SIZE'].includes(result.error.code));
    assert.deepStrictEqual({pending: simulator.state().pending, queued: simulator.state().queued}, {pending: null, queued: 0});
  }
});

test('transport simulator consumes split and coalesced framed responses', async function () {
  const split = simulatorModule.createSimulator();
  split.setScenario('split-response');
  assert.strictEqual((await read(split, 781, 4)).result.address, 781);
  const coalesced = simulatorModule.createSimulator();
  coalesced.setScenario('coalesced-response');
  const results = await Promise.all([read(coalesced, 781, 4), read(coalesced, 786, 4)]);
  assert.deepStrictEqual(results.map(function (item) { return item.result.address; }), [781, 786]);
});

test('delayed framed response is held until explicitly released', async function () {
  const simulator = simulatorModule.createSimulator();
  simulator.setScenario('delayed-response');
  const result = read(simulator, 781, 4, 100);
  await new Promise(function (resolve) { setImmediate(resolve); });
  assert.strictEqual(simulator.state().pending, 1);
  assert.strictEqual(simulator.flushDelayed().status, 'accepted');
  assert.strictEqual((await result).result.address, 781);
});

test('disconnect invalidates pending and queued reads and reconnect starts a new generation', async function () {
  const simulator = simulatorModule.createSimulator();
  simulator.setScenario('timeout');
  const first = read(simulator, 781, 4, 100);
  const second = read(simulator, 786, 4, 100);
  simulator.disconnect();
  assert.deepStrictEqual((await Promise.all([first, second])).map(function (item) { return item.error.code; }), ['CONNECTION_LOST', 'CONNECTION_LOST']);
  const generation = simulator.state().generation;
  simulator.setScenario(null);
  simulator.reconnect({checksum: 'new'});
  assert.ok(simulator.state().generation > generation);
  assert.strictEqual((await read(simulator, 781, 4)).result.address, 781);
});

test('write completion means transported only and has no DSP acknowledgement', async function () {
  const simulator = simulatorModule.createSimulator();
  const result = await new Promise(function (resolve) {
    simulator.write(781, Buffer.from('00800000', 'hex'), function (error, status) { resolve({error, status}); });
  });
  assert.strictEqual(result.error, null);
  assert.deepStrictEqual(result.status, {status: 'transported', applied: false, acknowledged: false});
  assert.strictEqual(simulator.state().writes, 1);
});

test('shutdown invalidates work and leaves no retained queue', async function () {
  const simulator = simulatorModule.createSimulator();
  simulator.setScenario('timeout');
  const result = read(simulator, 781, 4, 100);
  simulator.shutdown();
  assert.strictEqual((await result).error.code, 'CONNECTION_LOST');
  assert.deepStrictEqual({pending: simulator.state().pending, queued: simulator.state().queued}, {pending: null, queued: 0});
});

(async function () {
  let passed = 0;
  for (const item of tests) {
    try { await item.fn(); passed++; console.log('ok - ' + item.name); }
    catch (error) { console.error('not ok - ' + item.name); console.error(error.stack); process.exitCode = 1; }
  }
  console.log('\n' + passed + ' passed, ' + (tests.length - passed) + ' failed');
})();
