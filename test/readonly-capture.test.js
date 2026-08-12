'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const protocol = require('../Beocreate2/beo-extensions/signal-flow/sigmatcp-protocol');
const evidence = require('../Beocreate2/beo-extensions/signal-flow/beocreate-readonly-evidence');
const capability = require('../Beocreate2/beo-extensions/signal-flow/dsp-target-capability');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

class FakeSocket extends EventEmitter {
  constructor(responder) {
    super();
    this.responder = responder;
    this.frames = [];
    this.destroyedByCapture = false;
  }
  write(frame) {
    this.frames.push(Buffer.from(frame));
    const response = this.responder && this.responder(frame);
    if (response) setImmediate(() => this.emit('data', response));
    return true;
  }
  destroy() { this.destroyedByCapture = true; }
}

function response(frame) {
  if (frame[0] === protocol.COMMANDS.checksumRequest) {
    return Buffer.concat([Buffer.from([protocol.COMMANDS.checksumResponse]), Buffer.alloc(13),
      Buffer.from(capability.PROGRAM.checksum, 'hex')]);
  }
  const request = protocol.decodeFrame(frame, 'request');
  return protocol.encodeSyntheticReadResponse(request.address, Buffer.alloc(request.requestedLength));
}

(async function () {
  await test('dry run lists exact allowlisted reads without opening a network connection', function () {
    const result = childProcess.spawnSync(process.execPath, ['scripts/capture-beocreate-readonly.js', '--dry-run'], {
      cwd: require('path').resolve(__dirname, '..'), encoding: 'utf8'
    });
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /program-checksum: checksum-read \(0xf1\)/);
    assert.match(result.stdout, /output-a-gain: parameter-read \(0xa\) address=781 bytes=4/);
    assert.match(result.stdout, /write frames sent=0/);
  });

  await test('refuses live execution without acknowledgement before connecting', async function () {
    await assert.rejects(evidence.runCapture({host: 'example.invalid'}), {code: 'ACKNOWLEDGEMENT_REQUIRED'});
  });

  await test('rejects invalid ports and conflicting output without connecting or overwriting', function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-readonly-conflict-'));
    const marker = path.join(root, 'keep.txt');
    fs.writeFileSync(marker, 'untouched');
    const invalidPort = childProcess.spawnSync(process.execPath, [
      'scripts/capture-beocreate-readonly.js', '--host', 'unused', '--output', path.join(root, 'new'),
      '--port', '0', '--acknowledge-read-only'
    ], {cwd: path.resolve(__dirname, '..'), encoding: 'utf8'});
    assert.strictEqual(invalidPort.status, 1);
    assert.match(invalidPort.stderr, /port must be an integer/);
    const conflict = childProcess.spawnSync(process.execPath, [
      'scripts/capture-beocreate-readonly.js', '--host', 'unused', '--output', root, '--acknowledge-read-only'
    ], {cwd: path.resolve(__dirname, '..'), encoding: 'utf8'});
    assert.strictEqual(conflict.status, 1);
    assert.match(conflict.stderr, /refusing to overwrite/);
    assert.strictEqual(fs.readFileSync(marker, 'utf8'), 'untouched');
    fs.rmSync(root, {recursive: true, force: true});
  });

  await test('serializes only exact read commands and rejects unknown or ambiguous operations', function () {
    evidence.plannedOperations().forEach(function (operation) {
      const frame = evidence.serializeOperation(operation);
      assert.ok([protocol.COMMANDS.read, protocol.COMMANDS.checksumRequest].includes(frame[0]));
      assert.strictEqual(evidence.inspectOutgoingFrame(frame, operation).command, operation.command);
    });
    assert.throws(function () { evidence.operationById('write-gain'); }, {code: 'UNKNOWN_OPERATION'});
    assert.throws(function () { evidence.serializeOperation({command: 'read-or-write'}); }, {code: 'AMBIGUOUS_OPERATION'});
    const write = protocol.encodeWriteRequest(781, Buffer.alloc(4));
    assert.throws(function () {
      evidence.inspectOutgoingFrame(write, evidence.operationById('output-a-gain'));
    }, {code: 'OUTGOING_FRAME_REJECTED'});
  });

  await test('captures repeated reads with zero write or unknown frames and cleans up', async function () {
    const socket = new FakeSocket(response);
    const capture = await evidence.runCapture({
      socket: socket,
      host: 'not-stored',
      acknowledgeReadonly: true,
      operationIds: ['program-checksum', 'output-a-routing', 'output-a-gain'],
      commit: 'test-commit',
      timestamp: '2026-07-29T00:00:00.000Z',
      sourceType: 'compatible-hardware-readonly'
    });
    assert.strictEqual(capture.transcript.readFramesSent, 6);
    assert.strictEqual(capture.transcript.responsesReceived, 6);
    assert.strictEqual(capture.transcript.writeFramesSent, 0);
    assert.strictEqual(capture.transcript.unknownFramesSent, 0);
    assert.ok(socket.frames.every(function (frame) {
      return frame[0] === protocol.COMMANDS.read || frame[0] === protocol.COMMANDS.checksumRequest;
    }));
    assert.strictEqual(socket.destroyedByCapture, true);
    assert.doesNotMatch(JSON.stringify(capture), /not-stored/);
  });

  await test('enforces request, response and timeout limits', async function () {
    await assert.rejects(evidence.runCapture({
      socket: new FakeSocket(response), host: 'unused', acknowledgeReadonly: true,
      operationIds: new Array(33).fill('output-a-gain')
    }), {code: 'REQUEST_LIMIT'});
    const oversized = new FakeSocket(function () { return Buffer.alloc(protocol.HEADER_SIZE + evidence.MAX_RESPONSE_BYTES + 1); });
    await assert.rejects(evidence.runCapture({
      socket: oversized, host: 'unused', acknowledgeReadonly: true,
      operationIds: ['output-a-gain'], repetitions: 1
    }), {code: 'RESPONSE_LIMIT'});
    const silent = new FakeSocket();
    await assert.rejects(evidence.runCapture({
      socket: silent, host: 'unused', acknowledgeReadonly: true,
      operationIds: ['output-a-gain'], repetitions: 1, timeoutMs: 10
    }), {code: 'READ_TIMEOUT'});
    assert.strictEqual(silent.destroyedByCapture, true);
  });

  console.log('\n' + passed + ' passed, 0 failed');
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
