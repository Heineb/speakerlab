'use strict';

const assert = require('assert');
const readiness = require('../Beocreate2/beo-extensions/signal-flow/dsp-physical-readiness');

const scenarios = readiness.recoveryPrerequisites();
assert.strictEqual(scenarios.length, 10);
assert.strictEqual(scenarios.find(function (item) { return item.stage === 'before-first-write'; }).unknownState, false);
scenarios.filter(function (item) { return item.stage !== 'before-first-write'; }).forEach(function (item) {
  assert.strictEqual(item.remainMuted, true, item.stage);
});
assert.strictEqual(scenarios.find(function (item) { return item.stage === 'connection-loss-or-restart'; }).rollback, 'must not auto-resume');
assert.strictEqual(scenarios.find(function (item) { return item.stage === 'identity-mismatch'; }).manualIntervention, true);
assert.strictEqual(scenarios.find(function (item) { return item.stage === 'rollback-failure'; }).unknownState, true);
console.log('ok - recovery stages propagate unknown state, mute and manual-intervention requirements');
