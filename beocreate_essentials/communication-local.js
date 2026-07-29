'use strict';

const EventEmitter = require('events').EventEmitter;
const util = require('util');

function LocalCommunication() {
  if (!(this instanceof LocalCommunication)) return new LocalCommunication();
  EventEmitter.call(this);
}

util.inherits(LocalCommunication, EventEmitter);

LocalCommunication.prototype.startSocket = function (options, callback) {
  this.server = options && options.server;
  if (callback) callback(true);
};

LocalCommunication.prototype.stopSocket = function (callback) {
  if (callback) callback(true);
};

LocalCommunication.prototype.send = function () {};
LocalCommunication.prototype.disconnectAll = function () {};
LocalCommunication.prototype.isBonjourStarted = function () { return false; };
LocalCommunication.prototype.startBonjour = function (options, callback) {
  if (callback) callback(false);
};
LocalCommunication.prototype.stopBonjour = function (callback) {
  if (callback) callback(true);
};

module.exports = LocalCommunication;
