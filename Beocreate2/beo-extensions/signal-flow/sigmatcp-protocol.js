'use strict';

var HEADER_SIZE = 14;
var MAX_FRAME_SIZE = 65535;
var COMMANDS = {
	write: 0x09,
	read: 0x0a,
	checksumRequest: 0xf1,
	checksumResponse: 0xf2,
	xmlRequest: 0xf4,
	xmlResponse: 0xf5
};

function protocolError(code, message) {
	var error = new Error(message);
	error.code = code;
	return error;
}

function uint16(buffer, offset) {
	return buffer.readUInt16BE(offset);
}

function encodeReadRequest(address, length) {
	var frame = Buffer.alloc(HEADER_SIZE);
	frame[0] = COMMANDS.read;
	frame.writeUInt16BE(length, 8);
	frame.writeUInt16BE(address, 10);
	return frame;
}

function encodeWriteRequest(address, payload) {
	if (!Buffer.isBuffer(payload)) payload = Buffer.from(payload);
	var frame = Buffer.alloc(HEADER_SIZE + payload.length);
	frame[0] = COMMANDS.write;
	if (frame.length > 255) throw protocolError('FRAME_TOO_LARGE', 'The current Beocreate writer stores total length in header byte 6.');
	frame[6] = frame.length;
	frame.writeUInt16BE(payload.length, 10);
	frame.writeUInt16BE(address, 12);
	payload.copy(frame, HEADER_SIZE);
	return frame;
}

function encodeSyntheticReadResponse(address, payload) {
	if (!Buffer.isBuffer(payload)) payload = Buffer.from(payload);
	var frame = Buffer.alloc(HEADER_SIZE + payload.length);
	frame[0] = COMMANDS.read;
	frame.writeUInt16BE(payload.length, 8);
	frame.writeUInt16BE(address, 10);
	payload.copy(frame, HEADER_SIZE);
	return frame;
}

function decodeFrame(frame, direction) {
	if (!Buffer.isBuffer(frame) || frame.length < HEADER_SIZE) {
		throw protocolError('TRUNCATED_HEADER', 'SigmaTCP frame is shorter than the 14-byte header.');
	}
	var command = frame[0];
	var address;
	var payloadLength;
	if (direction === 'request' && command === COMMANDS.read) {
		if (frame.length !== HEADER_SIZE) throw protocolError('INVALID_LENGTH', 'A read request must contain only its 14-byte header.');
		return {command: command, kind: 'read-request', address: uint16(frame, 10), requestedLength: uint16(frame, 8), payload: Buffer.alloc(0)};
	}
	if (direction === 'request' && command === COMMANDS.write) {
		var declaredLength = frame[6];
		payloadLength = uint16(frame, 10);
		address = uint16(frame, 12);
		if (declaredLength !== frame.length || payloadLength !== frame.length - HEADER_SIZE) {
			throw protocolError('INVALID_LENGTH', 'Write frame length fields do not match the received frame.');
		}
		return {command: command, kind: 'write-request', address: address, payloadLength: payloadLength, payload: frame.slice(HEADER_SIZE)};
	}
	if (direction === 'response' && command === COMMANDS.read) {
		payloadLength = uint16(frame, 8);
		address = uint16(frame, 10);
		if (frame.length !== HEADER_SIZE + payloadLength) throw protocolError('INVALID_LENGTH', 'Read response payload length does not match the received frame.');
		return {command: command, kind: 'read-response', address: address, payloadLength: payloadLength, payload: frame.slice(HEADER_SIZE)};
	}
	throw protocolError('UNKNOWN_COMMAND', 'Unsupported SigmaTCP command 0x' + command.toString(16).padStart(2, '0') + '.');
}

function expectedLength(buffer, direction, maximumFrameSize) {
	if (buffer.length < HEADER_SIZE) return null;
	var command = buffer[0];
	var length;
	if (direction === 'request' && command === COMMANDS.read) length = HEADER_SIZE;
	else if (direction === 'request' && command === COMMANDS.write) length = buffer[6];
	else if (direction === 'response' && command === COMMANDS.read) length = HEADER_SIZE + uint16(buffer, 8);
	else throw protocolError('UNKNOWN_COMMAND', 'Unsupported SigmaTCP command 0x' + command.toString(16).padStart(2, '0') + '.');
	if (length < HEADER_SIZE) throw protocolError('INVALID_LENGTH', 'SigmaTCP frame declares a length shorter than its header.');
	if (length > maximumFrameSize) throw protocolError('FRAME_TOO_LARGE', 'SigmaTCP frame exceeds the configured maximum frame size.');
	return length;
}

function createParser(options) {
	options = options || {};
	var direction = options.direction || 'response';
	var maximumFrameSize = options.maximumFrameSize || MAX_FRAME_SIZE;
	var buffer = Buffer.alloc(0);
	var failed = null;

	function push(chunk) {
		if (failed) throw failed;
		if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk);
		if (buffer.length + chunk.length > maximumFrameSize) {
			failed = protocolError('BUFFER_LIMIT_EXCEEDED', 'SigmaTCP parser buffer exceeded its configured limit.');
			throw failed;
		}
		buffer = Buffer.concat([buffer, chunk]);
		var frames = [];
		try {
			while (buffer.length >= HEADER_SIZE) {
				var length = expectedLength(buffer, direction, maximumFrameSize);
				if (buffer.length < length) break;
				frames.push(decodeFrame(buffer.slice(0, length), direction));
				buffer = buffer.slice(length);
			}
		} catch (error) {
			failed = error;
			throw error;
		}
		return frames;
	}

	return {
		push: push,
		reset: function() { buffer = Buffer.alloc(0); failed = null; },
		state: function() { return {bufferedBytes: buffer.length, failed: failed ? failed.code : null}; }
	};
}

module.exports = {
	HEADER_SIZE: HEADER_SIZE,
	MAX_FRAME_SIZE: MAX_FRAME_SIZE,
	COMMANDS: COMMANDS,
	encodeReadRequest: encodeReadRequest,
	encodeWriteRequest: encodeWriteRequest,
	encodeSyntheticReadResponse: encodeSyntheticReadResponse,
	decodeFrame: decodeFrame,
	createParser: createParser
};
