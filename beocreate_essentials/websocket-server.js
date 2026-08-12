'use strict';

const crypto = require('crypto');
const {TextDecoder} = require('util');

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const DEFAULT_MAX_MESSAGE_BYTES = 1024 * 1024;

function frame(opcode, payload) {
  payload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '');
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x80 | opcode, payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, payload]);
}

function closePayload(code, reason) {
  const text = Buffer.from(reason || '');
  const payload = Buffer.alloc(2 + text.length);
  payload.writeUInt16BE(code, 0);
  text.copy(payload, 2);
  return payload;
}

function parseProtocols(value) {
  if (!value) return [];
  return value.split(',').map(function (protocol) { return protocol.trim(); }).filter(Boolean);
}

function createWebSocketServer(options) {
  options = options || {};
  const httpServer = options.httpServer;
  const acceptedProtocols = options.acceptedProtocols || [];
  const maxMessageBytes = options.maxMessageBytes || DEFAULT_MAX_MESSAGE_BYTES;
  const clients = new Set();
  let stopped = false;

  if (!httpServer || typeof httpServer.on !== 'function') {
    throw new Error('An existing HTTP server is required.');
  }

  function reject(socket, status, message) {
    socket.end(
      'HTTP/1.1 ' + status + '\r\n' +
      'Connection: close\r\n' +
      'Content-Type: text/plain\r\n' +
      'Content-Length: ' + Buffer.byteLength(message) + '\r\n\r\n' +
      message
    );
  }

  function closeClient(client, code, reason) {
    if (client.closed) return;
    client.closed = true;
    if (client.socket.writable) client.socket.write(frame(0x8, closePayload(code, reason)));
    client.socket.end();
    const forceClose = setTimeout(function () {
      if (!client.socket.destroyed) client.socket.destroy();
    }, 100);
    forceClose.unref();
  }

  function protocolFailure(client, code, reason) {
    if (options.onProtocolError) options.onProtocolError(client, reason);
    closeClient(client, code, reason);
  }

  function completeMessage(client, opcode, payload) {
    if (payload.length > maxMessageBytes) {
      protocolFailure(client, 1009, 'Message too large');
      return;
    }
    if (opcode === 0x2) {
      if (options.onBinary) options.onBinary(client, payload);
      protocolFailure(client, 1003, 'Binary messages are unsupported');
      return;
    }
    let text;
    try {
      text = new TextDecoder('utf-8', {fatal: true}).decode(payload);
    } catch (error) {
      protocolFailure(client, 1007, 'Invalid UTF-8');
      return;
    }
    if (options.onText) options.onText(client, text);
  }

  function processFrames(client) {
    while (client.buffer.length >= 2 && !client.closed) {
      const first = client.buffer[0];
      const second = client.buffer[1];
      const fin = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;

      if (!masked) {
        protocolFailure(client, 1002, 'Client frames must be masked');
        return;
      }
      if (length === 126) {
        if (client.buffer.length < 4) return;
        length = client.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (client.buffer.length < 10) return;
        const longLength = client.buffer.readBigUInt64BE(2);
        if (longLength > BigInt(maxMessageBytes)) {
          protocolFailure(client, 1009, 'Message too large');
          return;
        }
        length = Number(longLength);
        offset = 10;
      }
      if (opcode >= 0x8 && (!fin || length > 125)) {
        protocolFailure(client, 1002, 'Invalid control frame');
        return;
      }
      if (length > maxMessageBytes) {
        protocolFailure(client, 1009, 'Message too large');
        return;
      }
      if (client.buffer.length < offset + 4 + length) return;

      const mask = client.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(client.buffer.subarray(offset + 4, offset + 4 + length));
      client.buffer = client.buffer.subarray(offset + 4 + length);
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }

      if (opcode === 0x8) {
        closeClient(client, 1000, '');
      } else if (opcode === 0x9) {
        client.socket.write(frame(0xA, payload));
      } else if (opcode === 0xA) {
        // The existing Beocreate contract has no heartbeat state.
      } else if (opcode === 0x0) {
        if (client.fragmentOpcode === null) {
          protocolFailure(client, 1002, 'Unexpected continuation frame');
          return;
        }
        client.fragments.push(payload);
        client.fragmentBytes += payload.length;
        if (client.fragmentBytes > maxMessageBytes) {
          protocolFailure(client, 1009, 'Message too large');
          return;
        }
        if (fin) {
          const messageOpcode = client.fragmentOpcode;
          const message = Buffer.concat(client.fragments, client.fragmentBytes);
          client.fragmentOpcode = null;
          client.fragments = [];
          client.fragmentBytes = 0;
          completeMessage(client, messageOpcode, message);
        }
      } else if (opcode === 0x1 || opcode === 0x2) {
        if (client.fragmentOpcode !== null) {
          protocolFailure(client, 1002, 'Overlapping fragmented messages');
          return;
        }
        if (fin) {
          completeMessage(client, opcode, payload);
        } else {
          client.fragmentOpcode = opcode;
          client.fragments = [payload];
          client.fragmentBytes = payload.length;
        }
      } else {
        protocolFailure(client, 1002, 'Unsupported opcode');
      }
    }
  }

  function removeClient(client) {
    if (!clients.delete(client)) return;
    client.closed = true;
    if (options.onClose) options.onClose(client);
  }

  function onUpgrade(request, socket, head) {
    if (stopped) return reject(socket, '503 Service Unavailable', 'WebSocket server is stopping.');
    const upgrade = String(request.headers.upgrade || '').toLowerCase();
    const connection = String(request.headers.connection || '').toLowerCase();
    const key = request.headers['sec-websocket-key'];
    const version = request.headers['sec-websocket-version'];
    const requestedProtocols = parseProtocols(request.headers['sec-websocket-protocol']);
    const protocol = requestedProtocols.find(function (item) {
      return acceptedProtocols.includes(item);
    });

    if (upgrade !== 'websocket' || !connection.includes('upgrade') || !key || version !== '13') {
      return reject(socket, '400 Bad Request', 'Invalid WebSocket upgrade.');
    }
    if (!protocol) return reject(socket, '400 Bad Request', 'Unsupported WebSocket protocol.');

    const accept = crypto.createHash('sha1').update(key + WEBSOCKET_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept + '\r\n' +
      'Sec-WebSocket-Protocol: ' + protocol + '\r\n\r\n'
    );

    const client = {
      socket: socket,
      protocol: protocol,
      buffer: Buffer.alloc(0),
      fragments: [],
      fragmentBytes: 0,
      fragmentOpcode: null,
      closed: false,
      sendText: function (text) {
        if (!client.closed && socket.writable) socket.write(frame(0x1, text));
      },
      close: function (code, reason) { closeClient(client, code || 1000, reason || ''); }
    };
    clients.add(client);
    socket.setNoDelay(true);
    socket.on('data', function (data) {
      client.buffer = Buffer.concat([client.buffer, data]);
      processFrames(client);
    });
    socket.on('error', function () { removeClient(client); });
    socket.on('end', function () { removeClient(client); });
    socket.on('close', function () { removeClient(client); });
    if (head && head.length) {
      client.buffer = Buffer.concat([client.buffer, head]);
      processFrames(client);
    }
    if (options.onOpen) options.onOpen(client);
  }

  httpServer.on('upgrade', onUpgrade);

  return {
    clients: clients,
    maxMessageBytes: maxMessageBytes,
    stop: function (callback) {
      stopped = true;
      httpServer.removeListener('upgrade', onUpgrade);
      const current = Array.from(clients);
      if (!current.length) {
        if (callback) callback();
        return;
      }
      let remaining = current.length;
      current.forEach(function (client) {
        client.socket.once('close', function () {
          remaining -= 1;
          if (!remaining && callback) callback();
        });
        closeClient(client, 1001, 'Server shutting down');
      });
    }
  };
}

module.exports = {
  DEFAULT_MAX_MESSAGE_BYTES,
  createWebSocketServer,
  frame
};
