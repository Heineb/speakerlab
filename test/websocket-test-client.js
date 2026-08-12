'use strict';

const crypto = require('crypto');
const net = require('net');

function maskedFrame(opcode, payload, options) {
  options = options || {};
  payload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '');
  const mask = options.mask || Buffer.from([1, 2, 3, 4]);
  const fin = options.fin === false ? 0 : 0x80;
  let header;
  if (payload.length < 126) {
    header = Buffer.from([fin | opcode, 0x80 | payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = fin | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = fin | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const masked = Buffer.from(payload);
  for (let index = 0; index < masked.length; index += 1) masked[index] ^= mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

function parseServerFrames(state) {
  while (state.buffer.length >= 2) {
    const first = state.buffer[0];
    const second = state.buffer[1];
    let length = second & 0x7f;
    let offset = 2;
    if (second & 0x80) throw new Error('Server frames must not be masked.');
    if (length === 126) {
      if (state.buffer.length < 4) return;
      length = state.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (state.buffer.length < 10) return;
      length = Number(state.buffer.readBigUInt64BE(2));
      offset = 10;
    }
    if (state.buffer.length < offset + length) return;
    const frame = {
      fin: Boolean(first & 0x80),
      opcode: first & 0x0f,
      payload: state.buffer.subarray(offset, offset + length)
    };
    state.buffer = state.buffer.subarray(offset + length);
    const waiter = state.waiters.shift();
    if (waiter) waiter.resolve(frame);
    else state.frames.push(frame);
    if (frame.opcode === 0x8) state.socket.end();
  }
}

function connect(options) {
  return new Promise(function (resolve, reject) {
    const key = crypto.randomBytes(16).toString('base64');
    const socket = net.connect({host: options.host || '127.0.0.1', port: options.port});
    let headers = Buffer.alloc(0);
    let upgraded = false;
    const state = {socket: socket, buffer: Buffer.alloc(0), frames: [], waiters: []};
    const timeout = setTimeout(function () {
      socket.destroy();
      reject(new Error('WebSocket handshake timed out.'));
    }, 3000);

    socket.on('connect', function () {
      socket.write(
        'GET ' + (options.path || '/') + ' HTTP/1.1\r\n' +
        'Host: 127.0.0.1:' + options.port + '\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Key: ' + key + '\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Protocol: ' + (options.protocol || 'beocreate') + '\r\n\r\n'
      );
    });
    socket.on('data', function (data) {
      if (!upgraded) {
        headers = Buffer.concat([headers, data]);
        const boundary = headers.indexOf('\r\n\r\n');
        if (boundary === -1) return;
        const headerText = headers.subarray(0, boundary).toString('utf8');
        if (!headerText.startsWith('HTTP/1.1 101')) {
          clearTimeout(timeout);
          socket.destroy();
          reject(new Error('WebSocket upgrade rejected: ' + headerText.split('\r\n')[0]));
          return;
        }
        upgraded = true;
        clearTimeout(timeout);
        state.buffer = headers.subarray(boundary + 4);
        parseServerFrames(state);
        resolve(createClient(state));
      } else {
        state.buffer = Buffer.concat([state.buffer, data]);
        parseServerFrames(state);
      }
    });
    socket.on('error', function (error) {
      clearTimeout(timeout);
      if (!upgraded) reject(error);
    });
  });
}

function createClient(state) {
  return {
    socket: state.socket,
    sendText: function (text) { state.socket.write(maskedFrame(0x1, text)); },
    sendJSON: function (value) { this.sendText(JSON.stringify(value)); },
    sendBinary: function (value) { state.socket.write(maskedFrame(0x2, value)); },
    sendFrame: function (opcode, payload, options) {
      state.socket.write(maskedFrame(opcode, payload, options));
    },
    nextFrame: function (timeoutMilliseconds) {
      if (state.frames.length) return Promise.resolve(state.frames.shift());
      return new Promise(function (resolve, reject) {
        const waiter = {resolve: resolve, reject: reject};
        state.waiters.push(waiter);
        setTimeout(function () {
          const index = state.waiters.indexOf(waiter);
          if (index !== -1) state.waiters.splice(index, 1);
          reject(new Error('Timed out waiting for WebSocket frame.'));
        }, timeoutMilliseconds || 2000);
      });
    },
    nextJSON: async function () {
      const next = await this.nextFrame();
      if (next.opcode !== 0x1) throw new Error('Expected text frame, got opcode ' + next.opcode + '.');
      return JSON.parse(next.payload.toString('utf8'));
    },
    close: function () { state.socket.write(maskedFrame(0x8, Buffer.from([0x03, 0xe8]))); },
    destroy: function () { state.socket.destroy(); },
    waitForClose: function () {
      return new Promise(function (resolve) {
        if (state.socket.destroyed) resolve();
        else state.socket.once('close', resolve);
      });
    }
  };
}

module.exports = {connect, maskedFrame};
