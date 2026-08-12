'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const routing = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const ui = require('../Beocreate2/beo-extensions/signal-flow/routing-ui-state');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
}

function populated() {
  const state = ui.create();
  const configuration = routing.defaultConfiguration();
  ui.receiveState(state, {
    capabilities: routing.capabilities(true),
    configuration,
    revision: 'saved',
    validation: routing.validate(configuration),
    runtime: {connected: true, simulated: true, deploymentStatus: 'not-deployed'}
  });
  return state;
}

test('design review derives concise saved, simulated and blocked states', function () {
  const state = populated();
  const review = ui.designReview(state);
  assert.strictEqual(review.designState, 'Saved');
  assert.strictEqual(review.deploymentState, 'Blocked');
  assert.strictEqual(review.simulatorState, 'Simulated');
  assert.strictEqual(review.enabledOutputs, 0);
  assert.strictEqual(review.measurements, 0);
  assert.strictEqual(review.errors, 0);
});

test('design review follows the ordinary draft without creating separate state', function () {
  const state = populated();
  ui.editOutput(state, 'output-a', 'enabled', true);
  ui.editOutput(state, 'output-a', 'role', 'woofer');
  ui.routeOutput(state, 'output-a', 'left');
  ui.editCrossover(state, 'output-a', 'lowPass', 'enabled', true);
  ui.editProcessing(state, 'output-a', 'delay', 'valueMs', 0.25);
  ui.editProtection(state, 'output-a', 'limiter', 'enabled', true);
  state.draft.parametricEQ.outputs[0].bands.push({id: 'eq-a-1', enabled: true});
  state.validation = {valid: true, errors: [], warnings: [{message: 'Review this setting.'}]};
  const review = ui.designReview(state);
  assert.strictEqual(review.designState, 'Unsaved');
  assert.strictEqual(review.configuredOutputs, 1);
  assert.strictEqual(review.routedOutputs, 1);
  assert.strictEqual(review.crossoverOutputs, 1);
  assert.strictEqual(review.adjustedOutputs, 1);
  assert.strictEqual(review.eqBands, 1);
  assert.strictEqual(review.protectedOutputs, 1);
  assert.strictEqual(review.warnings, 1);
});

test('workspace markup exposes one calm workflow and one Advanced pattern', function () {
  const directory = path.join(__dirname, '..', 'Beocreate2', 'beo-extensions', 'signal-flow');
  const menu = fs.readFileSync(path.join(directory, 'menu.html'), 'utf8');
  const client = fs.readFileSync(path.join(directory, 'signal-flow-client.js'), 'utf8');
  const css = fs.readFileSync(path.join(directory, 'signal-flow.css'), 'utf8');
  for (const tab of ['Design', 'Measurements', 'Review']) assert.ok(menu.includes('>' + tab + '</button>'));
  for (const section of ['Output & routing', 'Crossover', 'Level & timing', 'Parametric EQ', 'Driver Protection']) {
    assert.ok(client.includes("'" + section + "'"));
  }
  assert.ok(menu.includes('Physical deployment blocked'));
  assert.ok(menu.includes('not deployed to the physical DSP'));
  assert.ok(client.includes('aria-expanded'));
  assert.ok(client.includes('speakerlabSignalFlowWorkspaceContextV1'));
  assert.ok(client.includes('sessionStorage'));
  assert.ok(client.includes('No design issues found.'));
  assert.ok(css.includes('.signal-flow-advanced'));
  assert.ok(css.includes('.signal-flow-workflow-section'));
  assert.strictEqual(menu.includes('Physical Apply'), false);
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
