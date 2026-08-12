'use strict';

const assert = require('assert');
const fixture = require('./fixtures/sigmatcp-golden.json');
const protocol = require('../Beocreate2/beo-extensions/signal-flow/sigmatcp-protocol');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}

test('generates source-derived read and write golden requests', function () {
  assert.strictEqual(protocol.encodeReadRequest(781, 4).toString('hex'), fixture.readParameter781Length4.hex);
  assert.strictEqual(protocol.encodeWriteRequest(781, Buffer.from('00800000', 'hex')).toString('hex'), fixture.writeParameter781Half.hex);
});

test('decodes deterministic request fields and synthetic response layout', function () {
  const read = protocol.decodeFrame(Buffer.from(fixture.readParameter781Length4.hex, 'hex'), 'request');
  const write = protocol.decodeFrame(Buffer.from(fixture.writeParameter781Half.hex, 'hex'), 'request');
  const response = protocol.decodeFrame(Buffer.from(fixture.syntheticReadResponse.hex, 'hex'), 'response');
  assert.deepStrictEqual({address: read.address, requestedLength: read.requestedLength}, {address: 781, requestedLength: 4});
  assert.deepStrictEqual({address: write.address, payload: write.payload.toString('hex')}, {address: 781, payload: '00800000'});
  assert.deepStrictEqual({address: response.address, payload: response.payload.toString('hex')}, {address: 781, payload: '00800000'});
});

test('retains split frames and emits one complete frame', function () {
  const raw = Buffer.from(fixture.syntheticReadResponse.hex, 'hex');
  const parser = protocol.createParser({direction: 'response'});
  assert.deepStrictEqual(parser.push(raw.slice(0, 9)), []);
  assert.strictEqual(parser.state().bufferedBytes, 9);
  assert.strictEqual(parser.push(raw.slice(9)).length, 1);
  assert.strictEqual(parser.state().bufferedBytes, 0);
});

test('emits coalesced complete frames in order', function () {
  const raw = Buffer.from(fixture.syntheticReadResponse.hex, 'hex');
  const parser = protocol.createParser({direction: 'response'});
  assert.deepStrictEqual(parser.push(Buffer.concat([raw, raw])).map(function (frame) { return frame.address; }), [781, 781]);
});

test('rejects malformed, oversized and unknown frames deterministically', function () {
  const malformed = Buffer.from(fixture.syntheticReadResponse.hex, 'hex');
  malformed.writeUInt16BE(5, 8);
  assert.throws(function () { protocol.decodeFrame(malformed, 'response'); }, {code: 'INVALID_LENGTH'});
  const oversized = protocol.createParser({direction: 'response', maximumFrameSize: 17});
  assert.throws(function () { oversized.push(Buffer.from(fixture.syntheticReadResponse.hex, 'hex')); }, {code: 'BUFFER_LIMIT_EXCEEDED'});
  const unknown = Buffer.alloc(14); unknown[0] = 0x7f;
  assert.throws(function () { protocol.decodeFrame(unknown, 'response'); }, {code: 'UNKNOWN_COMMAND'});
});

test('enters a deterministic error state and can be explicitly reset', function () {
  const parser = protocol.createParser({direction: 'response'});
  const unknown = Buffer.alloc(14); unknown[0] = 0x7f;
  assert.throws(function () { parser.push(unknown); }, {code: 'UNKNOWN_COMMAND'});
  assert.strictEqual(parser.state().failed, 'UNKNOWN_COMMAND');
  parser.reset();
  assert.deepStrictEqual(parser.state(), {bufferedBytes: 0, failed: null});
});

console.log('\n' + passed + ' passed, 0 failed');
