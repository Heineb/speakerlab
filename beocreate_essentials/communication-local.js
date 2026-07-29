'use strict';

const EventEmitter = require('events').EventEmitter;
const util = require('util');
const websocketServer = require('./websocket-server');

function LocalCommunication() {
  if (!(this instanceof LocalCommunication)) return new LocalCommunication();
  EventEmitter.call(this);
  this.connections = [];
  this.connectionID = 0;
  this.invalidMessageLimit = 3;
}

util.inherits(LocalCommunication, EventEmitter);

LocalCommunication.prototype.startSocket = function (options, callback) {
  this.server = options && options.server;
  const self = this;
  this.socket = websocketServer.createWebSocketServer({
    httpServer: this.server,
    acceptedProtocols: options.acceptedProtocols || [],
    onOpen: function (client) {
      self.connectionID += 1;
      client.ID = self.connectionID;
      client.invalidMessages = 0;
      self.connections.push(client);
      self.emit('open', client.ID, client.protocol);
    },
    onText: function (client, text) {
      try {
        const data = JSON.parse(text);
        self.emit('data', data, client.ID);
      } catch (error) {
        client.invalidMessages += 1;
        if (client.invalidMessages <= self.invalidMessageLimit) {
          console.error('Error in processing received data:', error.message);
        } else if (client.invalidMessages === self.invalidMessageLimit + 1) {
          console.error('Further invalid WebSocket messages from this client will not be logged.');
        }
      }
    },
    onBinary: function (client) {
      client.invalidMessages += 1;
      if (client.invalidMessages <= self.invalidMessageLimit) {
        console.error('Unsupported binary WebSocket message.');
      }
    },
    onClose: function (client) {
      const index = self.connections.indexOf(client);
      if (index !== -1) self.connections.splice(index, 1);
      self.emit('close', client.ID);
    }
  });
  if (callback) callback(true);
};

LocalCommunication.prototype.stopSocket = function (callback) {
  if (this.socket) {
    this.socket.stop(function () {
      if (callback) callback(true);
    });
  } else if (callback) {
    callback(true);
  }
};

LocalCommunication.prototype.send = function (jsonObject, restrictBroadcast) {
  const serialized = JSON.stringify(jsonObject);
  this.connections.forEach(function (connection) {
    if (
      !restrictBroadcast ||
      connection.ID === restrictBroadcast ||
      connection.protocol === restrictBroadcast
    ) {
      connection.sendText(serialized);
    }
  });
};
LocalCommunication.prototype.disconnectAll = function () {
  this.connections.slice().forEach(function (connection) {
    connection.close(1001, 'Server disconnected clients');
  });
};
LocalCommunication.prototype.isBonjourStarted = function () { return false; };
LocalCommunication.prototype.startBonjour = function (options, callback) {
  if (callback) callback(false);
};
LocalCommunication.prototype.stopBonjour = function (callback) {
  if (callback) callback(true);
};

module.exports = LocalCommunication;
