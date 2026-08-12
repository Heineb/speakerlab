'use strict';

const assert = require('assert');
const simulatorModule = require('../Beocreate2/beo-extensions/signal-flow/sigmatcp-transport-simulator');
const readiness = require('../Beocreate2/beo-extensions/signal-flow/dsp-target-capability').capability().physicalReadiness;

const simulator = simulatorModule.createSimulator({identity: {checksum: 'first'}});
const initialGeneration = simulator.state().generation;
simulator.disconnect();
assert.strictEqual(simulator.state().connected, false);
simulator.reconnect({checksum: 'second'});
assert.strictEqual(simulator.state().connected, true);
assert.ok(simulator.state().generation > initialGeneration);
assert.deepStrictEqual(simulator.state().identity, {checksum: 'second'});
assert.deepStrictEqual(readiness.transport.reconnect, {
  delayMs: 2000,
  maximumAttempts: 10,
  backoff: false,
  pendingInvalidation: false,
  identityRecheckForDeployment: false
});
console.log('ok - normalized simulator invalidates socket generation while legacy reconnect limitations remain explicit');
