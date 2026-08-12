'use strict';

const realDSP = require('./dsp');

function createSimulator(options) {
  options = options || {};
  let connected = options.connected !== false;
  let muted = options.muted !== false;
  let checksum = options.checksum === undefined ? 'SPEAKERLAB-SIMULATED-DSP' : options.checksum;
  let xml = options.xml === undefined ? '<beocreate-dsp simulated="true" />' : options.xml;
  let nextOutcome = null;
  let restartCount = 0;
  const registers = new Map();
  const operations = [];

  function defer(callback, value, error) {
    if (!callback) return;
    if (nextOutcome === 'timeout') {
      nextOutcome = null;
      return;
    }
    const malformed = nextOutcome === 'malformed';
    const failure = nextOutcome === 'error';
    nextOutcome = null;
    setImmediate(function () {
      if (failure) callback(null, new Error('Simulated DSP operation failed.'));
      else if (malformed) callback({malformed: true});
      else callback(value, error);
    });
  }

  function response(address, length) {
    const value = registers.has(address) ? registers.get(address) : 0;
    const bytes = Buffer.alloc(length);
    if (length === 2) bytes.writeInt16BE(value & 0xffff);
    else bytes.writeInt32BE(Math.round(value * 16777216));
    return {
      addr: address,
      length: length,
      raw: bytes,
      hex: bytes.toString('hex'),
      int: length === 2 ? bytes.readInt16BE(0) : bytes.readInt32BE(0),
      dec: length === 2 ? bytes.readInt16BE(0) / 16777216 : bytes.readInt32BE(0) / 16777216
    };
  }

  function write(address, value, forceDecimal, length) {
    if (!connected) return false;
    registers.set(address, value);
    operations.push({type: 'write', address: address, value: value, length: length});
    return undefined;
  }

  const simulator = {
    connectDSP: function (callback) {
      operations.push({type: 'connect'});
      defer(callback, connected);
    },
    disconnectDSP: function (callback) {
      connected = false;
      operations.push({type: 'disconnect'});
      defer(callback);
    },
    isConnected: function () { return connected; },
    getChecksum: function (callback) { defer(callback, checksum); },
    getXML: function (callback) { defer(callback, xml); },
    checkEEPROM: function (callback) { defer(callback, true); },
    resetDSP: function (callback) {
      restartCount += 1;
      registers.clear();
      muted = true;
      defer(callback, true);
    },
    flashEEPROM: function (filePath, callback) {
      operations.push({type: 'install-profile', path: filePath});
      defer(callback, true);
    },
    storeAdjustments: function (callback) { defer(callback, true); },
    writeDSP: function (address, value, forceDecimal) {
      return write(address, value, forceDecimal, 4);
    },
    readDSP: function (address, callback, length) {
      if (!connected) return false;
      const size = length || 4;
      if (Array.isArray(address)) {
        const responses = {};
        address.forEach(function (item) { responses[item] = response(item, size); });
        defer(callback, responses);
      } else {
        defer(callback, response(address, size));
      }
      return undefined;
    },
    writeRegister: function (address, value, forceDecimal) {
      return write(address, value, forceDecimal, 2);
    },
    readRegister: function (address, callback) {
      return simulator.readDSP(address, callback, 2);
    },
    safeloadWrite: function (address, values, forceDecimal) {
      if (!connected) return false;
      values.forEach(function (value, index) {
        write(address + index, value, forceDecimal, 4);
      });
      operations.push({type: 'safeload', address: address, values: values.slice()});
      return undefined;
    },
    lowPass: realDSP.lowPass,
    highPass: realDSP.highPass,
    peak: realDSP.peak,
    lowShelf: realDSP.lowShelf,
    highShelf: realDSP.highShelf,
    convertVolume: realDSP.convertVolume,
    simulation: {
      setConnected: function (value) { connected = Boolean(value); },
      setNextOutcome: function (outcome) { nextOutcome = outcome; },
      setMetadataAvailable: function (value) {
        checksum = value ? 'SPEAKERLAB-SIMULATED-DSP' : null;
        xml = value ? '<beocreate-dsp simulated="true" />' : null;
      },
      setMuted: function (value) { muted = Boolean(value); },
      snapshot: function () {
        return {
          connected: connected,
          muted: muted,
          checksum: checksum,
          xml: xml,
          restartCount: restartCount,
          registers: Array.from(registers.entries()),
          operations: operations.slice()
        };
      }
    }
  };
  return simulator;
}

const singleton = createSimulator({
  connected: process.env.SPEAKERLAB_DSP_STATE !== 'disconnected'
});

module.exports = singleton;
module.exports.createSimulator = createSimulator;
