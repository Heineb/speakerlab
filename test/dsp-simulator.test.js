'use strict';

const assert = require('assert');
const simulatorModule = require('../beocreate_essentials/dsp-simulator');

const tests = [];
function test(name, fn) { tests.push({name, fn}); }
function call(fn) {
  return new Promise(function (resolve) {
    fn(function (value, error) { resolve({value, error}); });
  });
}

test('starts connected or disconnected deterministically', async function () {
  const connected = simulatorModule.createSimulator({connected: true});
  const disconnected = simulatorModule.createSimulator({connected: false});
  assert.strictEqual(connected.isConnected(), true);
  assert.strictEqual(disconnected.isConnected(), false);
  assert.strictEqual(disconnected.writeDSP(10, 1), false);
  assert.strictEqual(disconnected.readDSP(10, function () {}), false);
});

test('round trips register and parameter writes through current wrapper shapes', async function () {
  const dsp = simulatorModule.createSimulator({connected: true});
  dsp.writeDSP(100, 0.5);
  const parameter = await call(function (callback) { dsp.readDSP(100, callback); });
  assert.strictEqual(parameter.value.addr, 100);
  assert.strictEqual(parameter.value.dec, 0.5);
  dsp.writeRegister(101, 12);
  const register = await call(function (callback) { dsp.readRegister(101, callback); });
  assert.strictEqual(register.value.length, 2);
});

test('supports multi-read and safeload operations', async function () {
  const dsp = simulatorModule.createSimulator({connected: true});
  dsp.safeloadWrite(200, [0.25, 0.75]);
  const result = await call(function (callback) { dsp.readDSP([200, 201], callback); });
  assert.strictEqual(result.value[200].dec, 0.25);
  assert.strictEqual(result.value[201].dec, 0.75);
  assert.strictEqual(dsp.simulation.snapshot().operations.at(-1).type, 'safeload');
});

test('models checksum, XML and unavailable metadata', async function () {
  const dsp = simulatorModule.createSimulator({connected: true});
  assert.strictEqual((await call(dsp.getChecksum)).value, 'SPEAKERLAB-SIMULATED-DSP');
  assert.match((await call(dsp.getXML)).value, /simulated/);
  dsp.simulation.setMetadataAvailable(false);
  assert.strictEqual((await call(dsp.getChecksum)).value, null);
  assert.strictEqual((await call(dsp.getXML)).value, null);
});

test('models error, timeout and malformed responses', async function () {
  const dsp = simulatorModule.createSimulator({connected: true});
  dsp.simulation.setNextOutcome('error');
  const failure = await call(dsp.checkEEPROM);
  assert.match(failure.error.message, /Simulated DSP operation failed/);

  dsp.simulation.setNextOutcome('malformed');
  const malformed = await call(dsp.getChecksum);
  assert.deepStrictEqual(malformed.value, {malformed: true});

  dsp.simulation.setNextOutcome('timeout');
  let called = false;
  dsp.getXML(function () { called = true; });
  await new Promise(function (resolve) { setTimeout(resolve, 20); });
  assert.strictEqual(called, false);
});

test('models disconnect, reconnect, restart and mute state', async function () {
  const dsp = simulatorModule.createSimulator({connected: true, muted: false});
  await call(dsp.disconnectDSP);
  assert.strictEqual(dsp.isConnected(), false);
  assert.strictEqual((await call(dsp.connectDSP)).value, false);
  dsp.simulation.setConnected(true);
  assert.strictEqual((await call(dsp.connectDSP)).value, true);
  dsp.simulation.setMuted(false);
  assert.strictEqual((await call(dsp.resetDSP)).value, true);
  const state = dsp.simulation.snapshot();
  assert.strictEqual(state.restartCount, 1);
  assert.strictEqual(state.muted, true);
});

test('retains existing DSP coefficient helpers', function () {
  const dsp = simulatorModule.createSimulator();
  assert.strictEqual(dsp.lowPass(48000, 1000, 0).length, 6);
  assert.strictEqual(dsp.convertVolume('dB', 'amplification', 0), 1);
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
