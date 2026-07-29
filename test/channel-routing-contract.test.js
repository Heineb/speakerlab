'use strict';

const assert = require('assert');
const model = require('../Beocreate2/beo-extensions/signal-flow/routing-model');
const controllerModule = require('../Beocreate2/beo-extensions/signal-flow/routing-controller');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name); console.error(error.stack); }
}
function fixture() {
  const sent = [];
  let configuration = model.defaultConfiguration();
  let revision = null;
  const service = {
    state: function (runtime) { return {capabilities: model.capabilities(true), configuration, revision, runtime}; },
    validate: model.validate,
    save: function (draft, expected) {
      const validation = model.validate(draft);
      if (!validation.valid) { const error = new Error('invalid'); error.code = 'VALIDATION_FAILED'; error.details = validation; throw error; }
      if (expected !== revision) { const error = new Error('conflict'); error.code = 'REVISION_CONFLICT'; throw error; }
      configuration = model.normalize(draft);
      revision = model.revision(configuration);
      return {configuration, revision, validation, verified: true};
    },
    reset: function (expected) { return this.save(model.defaultConfiguration(), expected); },
    crossoverPreview: function (draft, outputID) {
      const output = draft.crossover.outputs.find(function (item) { return item.outputId === outputID; });
      return {outputId: outputID, response: model.crossoverModel.preview(output, draft.crossover.sampleRateHz), deploymentStatus: 'not-deployed'};
    },
    copyCrossover: function (draft, sourceID, destinationID) {
      const copied = model.normalize(draft);
      const source = copied.crossover.outputs.find(function (item) { return item.outputId === sourceID; });
      const destination = copied.crossover.outputs.find(function (item) { return item.outputId === destinationID; });
      destination.highPass = model.clone(source.highPass);
      destination.lowPass = model.clone(source.lowPass);
      return {configuration: copied, validation: model.validate(copied)};
    },
    resetCrossover: function (draft, outputID) {
      const reset = model.normalize(draft);
      const output = reset.crossover.outputs.find(function (item) { return item.outputId === outputID; });
      output.highPass = model.crossoverModel.defaultFilter('high-pass');
      output.lowPass = model.crossoverModel.defaultFilter('low-pass');
      return {configuration: reset, validation: model.validate(reset)};
    },
    publicError: function (error) { return {code: error.code, message: error.message, details: error.details}; }
  };
  const controller = controllerModule.createController({
    service,
    send: function (header, content) { sent.push({header, content}); },
    runtime: function () { return {simulated: true, connected: false, deploymentStatus: 'not-deployed'}; }
  });
  return {controller, sent, service};
}

test('requests capabilities and current state through existing message headers', function () {
  const current = fixture();
  assert.strictEqual(current.controller.handle({header: 'getCapabilities'}), true);
  assert.strictEqual(current.sent[0].header, 'capabilities');
  assert.strictEqual(current.sent[0].content.capabilities.outputs.length, 4);
  current.controller.handle({header: 'getState'});
  assert.strictEqual(current.sent[1].header, 'state');
  assert.strictEqual(current.sent[1].content.runtime.connected, false);
});

test('validates a draft without saving it', function () {
  const current = fixture();
  const invalid = model.defaultConfiguration();
  invalid.connections.push({source: 'missing', destination: 'output-a', enabled: true});
  current.controller.handle({header: 'validate', content: {configuration: invalid}});
  assert.strictEqual(current.sent[0].header, 'validation');
  assert.strictEqual(current.sent[0].content.validation.valid, false);
});

test('calculates, copies and resets crossover drafts through existing envelopes', function () {
  const current = fixture();
  const draft = model.defaultConfiguration();
  draft.crossover.outputs[0].lowPass.enabled = true;
  draft.crossover.outputs[0].lowPass.cutoffHz = 1800;
  current.controller.handle({header: 'calculateCrossoverResponse', content: {configuration: draft, outputId: 'output-a'}});
  assert.strictEqual(current.sent[0].header, 'crossoverResponse');
  assert.strictEqual(current.sent[0].content.response.lowPassCutoffHz, 1800);

  current.controller.handle({header: 'copyCrossover', content: {
    configuration: draft, sourceOutputId: 'output-a', destinationOutputId: 'output-b', revision: null
  }});
  assert.strictEqual(current.sent[1].header, 'crossoverDraft');
  assert.strictEqual(current.sent[1].content.configuration.crossover.outputs[1].lowPass.cutoffHz, 1800);

  current.controller.handle({header: 'resetCrossover', content: {
    configuration: current.sent[1].content.configuration, outputId: 'output-b', revision: null
  }});
  assert.strictEqual(current.sent[2].content.configuration.crossover.outputs[1].lowPass.enabled, false);
});

test('saves a valid draft and reports verified not-deployed state', function () {
  const current = fixture();
  const draft = model.defaultConfiguration();
  draft.outputs[0].label = 'Bass';
  current.controller.handle({header: 'save', content: {configuration: draft, revision: null}});
  assert.strictEqual(current.sent[0].header, 'saveResult');
  assert.strictEqual(current.sent[0].content.success, true);
  assert.strictEqual(current.sent[0].content.verified, true);
  assert.strictEqual(current.sent[0].content.deploymentStatus, 'not-deployed');
});

test('reports invalid saves, save failures and revision conflicts', function () {
  const current = fixture();
  const invalid = model.defaultConfiguration();
  invalid.outputs[0].role = 'invalid';
  current.controller.handle({header: 'save', content: {configuration: invalid, revision: null}});
  assert.strictEqual(current.sent[0].content.error.code, 'VALIDATION_FAILED');

  const valid = model.defaultConfiguration();
  current.controller.handle({header: 'save', content: {configuration: valid, revision: null}});
  current.controller.handle({header: 'save', content: {configuration: valid, revision: null}});
  assert.strictEqual(current.sent[2].content.error.code, 'REVISION_CONFLICT');
});

test('resets only with the current revision', function () {
  const current = fixture();
  const draft = model.defaultConfiguration();
  draft.outputs[0].label = 'Custom';
  current.controller.handle({header: 'save', content: {configuration: draft, revision: null}});
  const revision = current.sent[0].content.revision;
  current.controller.handle({header: 'reset', content: {revision}});
  assert.strictEqual(current.sent[1].header, 'resetResult');
  assert.strictEqual(current.sent[1].content.configuration.outputs[0].label, 'Output A');
});

test('ignores unknown messages without emitting a response', function () {
  const current = fixture();
  assert.strictEqual(current.controller.handle({header: 'unknown'}), false);
  assert.deepStrictEqual(current.sent, []);
});

if (failed) process.exitCode = 1;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
