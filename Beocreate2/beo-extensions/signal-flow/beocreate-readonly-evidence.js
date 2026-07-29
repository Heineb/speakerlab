'use strict';

var crypto = require('crypto');
var net = require('net');
var protocol = require('./sigmatcp-protocol');
var capability = require('./dsp-target-capability');

var FORMAT = 'org.speakerlab.beocreate-readonly-evidence';
var SCHEMA_VERSION = 1;
var TOOL_VERSION = 1;
var DEFAULT_PORT = 8086;
var DEFAULT_TIMEOUT_MS = 2000;
var MAX_REQUESTS = 64;
var MAX_RESPONSE_BYTES = 1024;
var READ_COMMANDS = {parameter: protocol.COMMANDS.read, checksum: protocol.COMMANDS.checksumRequest};

function evidenceError(code, message) {
	var error = new Error(message);
	error.code = code;
	return error;
}

function sha256(value) {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function plannedOperations() {
	var operations = [{
		id: 'program-checksum',
		kind: 'checksum',
		command: 'checksum-read',
		commandCode: READ_COMMANDS.checksum,
		safety: 'read-only',
		evidence: 'beocreate_essentials/dsp.js getChecksum/createHifiberryRequest'
	}];
	Object.keys(capability.OUTPUTS).forEach(function(outputId) {
		var output = capability.OUTPUTS[outputId];
		[
			['routing', output.routing, 4, 'unsigned-integer'],
			['crossover', output.filters, 320, '16 sections × 5 signed-5.23 words'],
			['gain', output.gain, 4, 'signed-5.23'],
			['delay', output.delay, 4, 'unsigned-integer'],
			['polarity', output.polarity, 4, 'unsigned-integer']
		].forEach(function(item) {
			operations.push({
				id: outputId + '-' + item[0],
				kind: 'parameter',
				command: 'parameter-read',
				commandCode: READ_COMMANDS.parameter,
				outputId: outputId,
				field: item[0],
				address: item[1],
				length: item[2],
				representation: item[3],
				safety: 'read-only',
				evidence: 'CURRENT_BEOCREATE_DSP_MAPPING.md and shipped Beocreate Universal v10 XML'
			});
		});
	});
	return operations;
}

function operationById(id) {
	var operation = plannedOperations().filter(function(item) { return item.id === id; })[0];
	if (!operation) throw evidenceError('UNKNOWN_OPERATION', 'Unknown or non-allowlisted read operation "' + id + '".');
	return operation;
}

function serializeOperation(operation) {
	if (!operation || operation.safety !== 'read-only') {
		throw evidenceError('AMBIGUOUS_OPERATION', 'Only operations proven read-only may be serialized.');
	}
	if (operation.command === 'checksum-read' && operation.commandCode === READ_COMMANDS.checksum) {
		var checksumFrame = Buffer.alloc(protocol.HEADER_SIZE);
		checksumFrame[0] = READ_COMMANDS.checksum;
		return checksumFrame;
	}
	if (operation.command === 'parameter-read' && operation.commandCode === READ_COMMANDS.parameter) {
		if (!Number.isInteger(operation.address) || !Number.isInteger(operation.length) ||
			operation.length < 1 || operation.length > MAX_RESPONSE_BYTES) {
			throw evidenceError('INVALID_READ', 'Allowlisted parameter read has invalid bounds.');
		}
		return protocol.encodeReadRequest(operation.address, operation.length);
	}
	throw evidenceError('NON_READ_COMMAND', 'Operation does not map to an exact allowlisted read command.');
}

function inspectOutgoingFrame(frame, operation) {
	if (!Buffer.isBuffer(frame) || frame.length !== protocol.HEADER_SIZE) {
		throw evidenceError('OUTGOING_FRAME_REJECTED', 'Read-only requests must be exactly one 14-byte header.');
	}
	if (frame[0] !== READ_COMMANDS.parameter && frame[0] !== READ_COMMANDS.checksum) {
		throw evidenceError('OUTGOING_FRAME_REJECTED', 'Non-read or unknown outgoing command rejected.');
	}
	if (frame[0] !== operation.commandCode) {
		throw evidenceError('OUTGOING_FRAME_REJECTED', 'Outgoing command does not match the allowlisted operation.');
	}
	if (frame[0] === READ_COMMANDS.parameter) protocol.decodeFrame(frame, 'request');
	return {
		operationId: operation.id,
		command: operation.command,
		commandCode: frame[0],
		frameHex: frame.toString('hex'),
		frameSha256: sha256(frame)
	};
}

function decodeSigned523(payload) {
	var values = [];
	for (var offset = 0; offset < payload.length; offset += 4) values.push(payload.readInt32BE(offset) / Math.pow(2, 24));
	return values;
}

function decodeObservation(operation, frame) {
	if (!Buffer.isBuffer(frame) || frame.length > protocol.HEADER_SIZE + MAX_RESPONSE_BYTES) {
		throw evidenceError('RESPONSE_LIMIT', 'Response exceeded the strict capture payload limit.');
	}
	if (operation.command === 'checksum-read') {
		if (frame.length !== 30 || frame[0] !== protocol.COMMANDS.checksumResponse) {
			throw evidenceError('UNEXPECTED_RESPONSE', 'Checksum response must be command 0xf2 with a 16-byte checksum.');
		}
		return {rawHex: frame.toString('hex'), decoded: {checksum: frame.slice(14).toString('hex').toUpperCase()}};
	}
	var decoded = protocol.decodeFrame(frame, 'response');
	if (decoded.address !== operation.address || decoded.payloadLength !== operation.length) {
		throw evidenceError('UNEXPECTED_RESPONSE', 'Parameter response does not match the outstanding allowlisted read.');
	}
	var interpreted;
	if (operation.representation.indexOf('signed-5.23') !== -1) interpreted = decodeSigned523(decoded.payload);
	else if (decoded.payload.length === 4) interpreted = [decoded.payload.readInt32BE(0)];
	else interpreted = {payloadHex: decoded.payload.toString('hex')};
	return {
		rawHex: frame.toString('hex'),
		decoded: {address: decoded.address, payloadLength: decoded.payloadLength, values: interpreted}
	};
}

function makeManifest(options, outgoing, observations, warnings) {
	var rawResponses = observations.map(function(item) {
		return {operationId: item.operationId, responseHex: item.rawHex, responseSha256: sha256(Buffer.from(item.rawHex, 'hex')),
			latencyMs: item.latencyMs === undefined ? null : item.latencyMs};
	});
	var decodedObservations = observations.map(function(item) { return {operationId: item.operationId, decoded: item.decoded}; });
	var observedPayload = {outgoingReadFrames: outgoing, rawResponses: rawResponses, decodedObservations: decodedObservations};
	return {
		format: FORMAT,
		schemaVersion: SCHEMA_VERSION,
		toolVersion: TOOL_VERSION,
		speakerLabCommit: options.commit,
		capturedAt: options.timestamp,
		sourceType: options.sourceType || 'compatible-hardware-readonly',
		declaredPlatform: options.declaredPlatform || 'existing Beocreate',
		programIdentity: observations.filter(function(item) { return item.operationId === 'program-checksum'; })[0] || null,
		plannedOperations: options.operations.map(function(item) { return item.id; }),
		outgoingReadFrames: outgoing,
		rawResponses: rawResponses,
		decodedObservations: decodedObservations,
		warnings: warnings || [],
		unexpectedResponses: [],
		evidenceConfidence: options.sourceType === 'compatible-hardware-readonly' ? 'unreviewed-physical-observation' : 'repository-backed',
		redaction: {status: 'redacted', excluded: ['host', 'IP address', 'hostname', 'serial number', 'device ID', 'product name', 'credentials', 'local paths']},
		transcript: {readFramesSent: outgoing.length, responsesReceived: observations.length, writeFramesSent: 0, unknownFramesSent: 0},
		integrity: {algorithm: 'sha256', observationsSha256: sha256(Buffer.from(JSON.stringify(observedPayload)))}
	};
}

function runCapture(options) {
	options = options || {};
	if (!options.acknowledgeReadonly) return Promise.reject(evidenceError('ACKNOWLEDGEMENT_REQUIRED',
		'Refusing capture without --acknowledge-read-only.'));
	if (!options.host) return Promise.reject(evidenceError('HOST_REQUIRED', 'An explicit --host is required; discovery and scanning are forbidden.'));
	var requested = (options.operationIds || plannedOperations().map(function(item) { return item.id; })).map(operationById);
	var repetitions = options.repetitions === undefined ? 2 : options.repetitions;
	if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 2) {
		return Promise.reject(evidenceError('REPETITION_LIMIT', 'Read repetitions must be one or two.'));
	}
	var operations = [];
	for (var repetition = 0; repetition < repetitions; repetition++) operations = operations.concat(requested);
	if (operations.length > MAX_REQUESTS) return Promise.reject(evidenceError('REQUEST_LIMIT', 'Capture request count exceeds ' + MAX_REQUESTS + '.'));
	options.operations = operations;
	var timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
	var intervalMs = options.intervalMs === undefined ? 25 : options.intervalMs;
	if (!Number.isInteger(intervalMs) || intervalMs < 10 || intervalMs > 1000) {
		return Promise.reject(evidenceError('RATE_LIMIT', 'Read interval must be from 10 to 1000 milliseconds.'));
	}
	var outgoing = [];
	var observations = [];
	var socket = options.socket || new net.Socket();
	var buffer = Buffer.alloc(0);
	var requestStartedAt = null;

	return new Promise(function(resolve, reject) {
		var index = 0;
		var timer = null;
		var finished = false;
		function close() {
			if (timer) clearTimeout(timer);
			if (socket && typeof socket.destroy === 'function') socket.destroy();
		}
		function fail(error) {
			if (finished) return;
			finished = true;
			close();
			reject(error);
		}
		function expectedLength(operation) {
			return operation.command === 'checksum-read' ? 30 : protocol.HEADER_SIZE + operation.length;
		}
		function sendNext() {
			if (finished) return;
			if (index >= operations.length) {
				finished = true;
				close();
				resolve(makeManifest(options, outgoing, observations, []));
				return;
			}
			var operation = operations[index];
			var frame;
			try {
				frame = serializeOperation(operation);
				outgoing.push(inspectOutgoingFrame(frame, operation));
			} catch (error) { fail(error); return; }
			timer = setTimeout(function() { fail(evidenceError('READ_TIMEOUT', 'Read operation "' + operation.id + '" timed out.')); }, timeoutMs);
			requestStartedAt = Date.now();
			try { socket.write(frame); }
			catch (error) { fail(error); }
		}
		socket.on('data', function(chunk) {
			if (finished) return;
			buffer = Buffer.concat([buffer, chunk]);
			if (buffer.length > protocol.HEADER_SIZE + MAX_RESPONSE_BYTES) {
				fail(evidenceError('RESPONSE_LIMIT', 'Buffered response exceeded the strict capture limit.'));
				return;
			}
			var operation = operations[index];
			var length = expectedLength(operation);
			if (buffer.length < length) return;
			if (buffer.length > length) {
				fail(evidenceError('UNEXPECTED_RESPONSE', 'Capture received trailing or unsolicited response bytes.'));
				return;
			}
			clearTimeout(timer);
			try {
				var observation = decodeObservation(operation, buffer);
				observation.operationId = operation.id;
				observation.latencyMs = Date.now() - requestStartedAt;
				observations.push(observation);
			} catch (error) { fail(error); return; }
			buffer = Buffer.alloc(0);
			index++;
			setTimeout(sendNext, intervalMs);
		});
		socket.on('error', fail);
		socket.on('close', function() {
			if (!finished) fail(evidenceError('CONNECTION_CLOSED', 'Connection closed before all read-only observations completed.'));
		});
		if (options.socket) sendNext();
		else socket.connect(options.port || DEFAULT_PORT, options.host, sendNext);
	});
}

module.exports = {
	FORMAT: FORMAT,
	SCHEMA_VERSION: SCHEMA_VERSION,
	TOOL_VERSION: TOOL_VERSION,
	MAX_REQUESTS: MAX_REQUESTS,
	MAX_RESPONSE_BYTES: MAX_RESPONSE_BYTES,
	plannedOperations: plannedOperations,
	operationById: operationById,
	serializeOperation: serializeOperation,
	inspectOutgoingFrame: inspectOutgoingFrame,
	decodeObservation: decodeObservation,
	makeManifest: makeManifest,
	runCapture: runCapture,
	sha256: sha256
};
