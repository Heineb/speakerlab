'use strict';

const assert = require('assert');
const fixture = require('./fixtures/current-beocreate-readonly-repository.json');
const evidence = require('../Beocreate2/beo-extensions/signal-flow/beocreate-readonly-evidence');
const reviewModel = require('../Beocreate2/beo-extensions/signal-flow/beocreate-evidence-review');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

function repositoryCapture() {
  const outgoing = [];
  const observations = fixture.observations.map(function (item) {
    const operation = evidence.operationById(item.operationId);
    outgoing.push(evidence.inspectOutgoingFrame(evidence.serializeOperation(operation), operation));
    const observation = evidence.decodeObservation(operation, Buffer.from(item.responseHex, 'hex'));
    observation.operationId = item.operationId;
    return observation;
  });
  return evidence.makeManifest({
    operations: fixture.observations.map(function (item) { return evidence.operationById(item.operationId); }),
    commit: 'repository-fixture',
    timestamp: '2026-07-29T00:00:00.000Z',
    sourceType: fixture.sourceType,
    declaredPlatform: 'current Beocreate repository evidence'
  }, outgoing, observations, ['Synthetic response values are repository-backed, not physical observations.']);
}

test('parses a valid versioned sanitized repository capture deterministically', function () {
  const capture = repositoryCapture();
  assert.strictEqual(capture.format, evidence.FORMAT);
  assert.strictEqual(capture.schemaVersion, 1);
  assert.strictEqual(capture.transcript.writeFramesSent, 0);
  assert.strictEqual(capture.redaction.status, 'redacted');
  assert.deepStrictEqual(capture, repositoryCapture());
});

test('rejects unsupported schema, corrupt hashes, missing identity and private data', function () {
  let capture = repositoryCapture();
  capture.schemaVersion = 99;
  assert.strictEqual(reviewModel.review(capture).status, 'rejected');
  capture = repositoryCapture();
  capture.rawResponses[0].responseSha256 = '0'.repeat(64);
  assert.match(reviewModel.review(capture).issues.join(' '), /Corrupt response/);
  capture = repositoryCapture();
  capture.decodedObservations = capture.decodedObservations.filter(function (item) {
    return item.operationId !== 'program-checksum';
  });
  assert.match(reviewModel.review(capture).issues.join(' '), /identity is missing/);
  capture = repositoryCapture();
  capture.declaredPlatform = 'device 192.168.1.23';
  assert.match(reviewModel.review(capture).issues.join(' '), /private or host-specific/);
  capture = repositoryCapture();
  capture.rawResponses.pop();
  assert.match(reviewModel.review(capture).issues.join(' '), /incomplete/);
});

test('accepts repository evidence without promoting physical mapping confidence', function () {
  const review = reviewModel.review(repositoryCapture());
  assert.strictEqual(review.status, 'accepted-repository-evidence');
  assert.deepStrictEqual(review.promotions, []);
  assert.strictEqual(review.physicalApplyReady, false);
  assert.match(review.conclusions.join(' '), /does not physically verify mappings/);
});

test('rejects contradictory repeated physical observations and unknown identity', function () {
  const capture = repositoryCapture();
  capture.sourceType = 'compatible-hardware-readonly';
  capture.outgoingReadFrames = capture.outgoingReadFrames.concat(JSON.parse(JSON.stringify(capture.outgoingReadFrames)));
  capture.rawResponses = capture.rawResponses.concat(JSON.parse(JSON.stringify(capture.rawResponses)));
  capture.decodedObservations = capture.decodedObservations.concat(JSON.parse(JSON.stringify(capture.decodedObservations)));
  capture.decodedObservations[capture.decodedObservations.length - 1].decoded.values = [1];
  const review = reviewModel.review(capture);
  assert.strictEqual(review.status, 'rejected');
  assert.match(review.issues.join(' '), /contradict/);
  const mismatch = repositoryCapture();
  mismatch.decodedObservations[0].decoded.checksum = '0'.repeat(32);
  assert.match(reviewModel.review(mismatch).issues.join(' '), /does not match/);
});

test('safe-state readback and write-side claims cannot be promoted by this format', function () {
  const capture = repositoryCapture();
  capture.decodedObservations.push({operationId: 'safe-state', decoded: {muted: true}});
  const review = reviewModel.review(capture);
  assert.deepStrictEqual(review.promotions, []);
  assert.match(review.conclusions.join(' '), /safe-state control remains unverified/);
  assert.match(review.conclusions.join(' '), /Write acknowledgement and rollback remain unverified/);
});

console.log('\n' + passed + ' passed, 0 failed');
