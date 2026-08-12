'use strict';

var protocol = require('./sigmatcp-protocol');

function transportError(code, message) {
	var error = new Error(message);
	error.code = code;
	return error;
}

function createSimulator(options) {
	options = options || {};
	var connected = options.connected !== false;
	var generation = 1;
	var nextID = 1;
	var pending = null;
	var queue = [];
	var writes = [];
	var identity = options.identity || null;
	var scenario = null;
	var responseParser = protocol.createParser({direction: 'response'});
	var delayedFrame = null;

	function finish(item, error, result) {
		if (!item || item.done) return;
		item.done = true;
		if (item.timer) clearTimeout(item.timer);
		item.callback(error, result);
	}

	function pump() {
		if (!connected || pending || !queue.length) return;
		pending = queue.shift();
		pending.generation = generation;
		if (scenario === 'timeout') return;
		var payload = Buffer.alloc(pending.length);
		if (pending.length >= 4) payload.writeInt32BE(0);
		var frame = protocol.encodeSyntheticReadResponse(pending.address, payload);
		if (scenario === 'malformed') frame[0] = 0x7f;
		if (scenario === 'wrong-size') frame = protocol.encodeSyntheticReadResponse(pending.address, Buffer.alloc(Math.max(0, pending.length - 1)));
		if (scenario === 'delayed-response') {
			delayedFrame = {frame: frame, generation: pending.generation};
		} else if (scenario === 'split-response') {
			setImmediate(function() {
				receive(frame.slice(0, 8), pending.generation);
				receive(frame.slice(8), pending.generation);
			});
		} else if (scenario === 'coalesced-response' && queue.length) {
			var next = queue[0];
			var nextPayload = Buffer.alloc(next.length);
			setImmediate(function() {
				receive(Buffer.concat([frame, protocol.encodeSyntheticReadResponse(next.address, nextPayload)]), pending.generation);
			});
		} else {
			setImmediate(function() { receive(frame, pending.generation); });
		}
	}

	function read(address, length, callback, timeoutMs) {
		var item = {id: nextID++, address: address, length: length, callback: callback, done: false, timer: null};
		item.timer = setTimeout(function() {
			if (pending === item) pending = null;
			else queue = queue.filter(function(queued) { return queued !== item; });
			finish(item, transportError('READ_TIMEOUT', 'SigmaTCP parameter read timed out.'));
			pump();
		}, timeoutMs || 50);
		queue.push(item);
		pump();
		return item.id;
	}

	function accept(decoded, socketGeneration) {
		if (!pending || socketGeneration !== generation || pending.generation !== generation) return {status: 'stale'};
		var item = pending;
		try {
			if (decoded.address !== item.address) throw transportError('UNEXPECTED_RESPONSE', 'SigmaTCP response address does not match the positional outstanding read.');
			if (decoded.payloadLength !== item.length) throw transportError('WRONG_RESPONSE_SIZE', 'SigmaTCP response size does not match the outstanding read.');
		} catch (error) {
			pending = null;
			finish(item, error);
			pump();
			return {status: 'rejected', error: error.code};
		}
		pending = null;
		finish(item, null, decoded);
		pump();
		return {status: 'accepted'};
	}

	function receive(frame, socketGeneration) {
		if (socketGeneration !== generation) return {status: 'stale'};
		var frames;
		try {
			frames = responseParser.push(frame);
		} catch (error) {
			var item = pending;
			pending = null;
			responseParser.reset();
			finish(item, error);
			pump();
			return {status: 'rejected', error: error.code};
		}
		var results = frames.map(function(decoded) { return accept(decoded, socketGeneration); });
		return results.length ? results[results.length - 1] : {status: 'incomplete'};
	}

	function disconnect() {
		connected = false;
		generation++;
		if (pending) finish(pending, transportError('CONNECTION_LOST', 'SigmaTCP connection closed with a read pending.'));
		pending = null;
		delayedFrame = null;
		responseParser.reset();
		queue.splice(0).forEach(function(item) {
			finish(item, transportError('CONNECTION_LOST', 'SigmaTCP queued read was invalidated by disconnect.'));
		});
	}

	return {
		read: read,
		receive: receive,
		flushDelayed: function() {
			if (!delayedFrame) return {status: 'none'};
			var held = delayedFrame;
			delayedFrame = null;
			return receive(held.frame, held.generation);
		},
		write: function(address, payload, callback) {
			if (!connected) {
				if (callback) callback(transportError('NOT_CONNECTED', 'SigmaTCP socket is not connected.'));
				return false;
			}
			var frame = protocol.encodeWriteRequest(address, payload);
			writes.push(frame);
			if (callback) setImmediate(function() {
				callback(null, {status: 'transported', applied: false, acknowledged: false});
			});
			return true;
		},
		disconnect: disconnect,
		reconnect: function(newIdentity) { connected = true; generation++; if (newIdentity !== undefined) identity = newIdentity; pump(); },
		shutdown: disconnect,
		setScenario: function(value) { scenario = value; },
		state: function() {
			return {connected: connected, generation: generation, pending: pending ? pending.id : null, queued: queue.length,
				writes: writes.length, identity: identity};
		}
	};
}

module.exports = {createSimulator: createSimulator};
