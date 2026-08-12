'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const script = fs.readFileSync(
  path.join(__dirname, '..', 'Beocreate2', 'beo-system', 'common', 'scripts', 'beo-comms.js'),
  'utf8'
);
const tests = [];
function test(name, fn) { tests.push({name, fn}); }

function createHarness() {
  const sockets = [];
  const events = [];
  const errors = [];
  const classes = new Set(['disconnected']);
  function FakeWebSocket(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.sent = [];
    sockets.push(this);
  }
  FakeWebSocket.prototype.send = function (value) { this.sent.push(value); };
  FakeWebSocket.prototype.close = function () {
    if (this.onclose) this.onclose();
  };
  const documentObject = {
    body: {
      classList: {
        add: function () { Array.from(arguments).forEach(function (item) { classes.add(item); }); },
        remove: function () { Array.from(arguments).forEach(function (item) { classes.delete(item); }); }
      }
    }
  };
  function jquery() {
    return {
      trigger: function (target, data) { events.push({target: target, data: data}); }
    };
  }
  const context = {
    WebSocket: FakeWebSocket,
    window: {
      location: {host: '127.0.0.1:12345', protocol: 'http:', reload: function () {}}
    },
    document: documentObject,
    $: jquery,
    console: {
      log: function () {},
      error: function () { errors.push(Array.from(arguments)); }
    },
    setTimeout: function () { return 1; },
    clearTimeout: function () {},
    product_information: null,
    os: ['Browser', 'browser'],
    debug: 0,
    beo: {notify: function () {}}
  };
  vm.runInNewContext(script, context, {filename: 'beo-comms.js'});
  return {context: context, sockets: sockets, events: events, errors: errors, classes: classes};
}

test('connects to the current HTTP host at the root path with beocreate protocol', function () {
  const harness = createHarness();
  harness.context.beoCom.connectToCurrentProduct();
  assert.strictEqual(harness.sockets.length, 1);
  assert.strictEqual(harness.sockets[0].url, 'ws://127.0.0.1:12345');
  assert.deepStrictEqual(Array.from(harness.sockets[0].protocols), ['beocreate']);
});

test('constructs the existing target/header/content client envelope', function () {
  const harness = createHarness();
  harness.context.beoCom.connectToCurrentProduct();
  const socket = harness.sockets[0];
  socket.onopen();
  harness.context.beoCom.sendToProduct('channels', 'setBalance', {balance: 4});
  assert.deepStrictEqual(
    JSON.parse(socket.sent[0]),
    {target: 'channels', header: 'setBalance', content: {balance: 4}}
  );
});

test('dispatches server envelopes and ignores envelopes without target/header', function () {
  const harness = createHarness();
  harness.context.beoCom.connectToCurrentProduct();
  const socket = harness.sockets[0];
  socket.onopen();
  socket.onmessage({data: JSON.stringify({target: 'channels', header: 'settings', content: {a: 1}})});
  socket.onmessage({data: JSON.stringify({content: {ignored: true}})});
  const routed = harness.events.filter(function (event) { return event.target === 'channels'; });
  assert.strictEqual(routed.length, 1);
  assert.strictEqual(routed[0].data.header, 'settings');
  assert.strictEqual(JSON.stringify(routed[0].data.content), '{"a":1}');
});

test('malformed server JSON is logged without preventing later dispatch', function () {
  const harness = createHarness();
  harness.context.beoCom.connectToCurrentProduct();
  const socket = harness.sockets[0];
  socket.onopen();
  socket.onmessage({data: '{'});
  socket.onmessage({data: JSON.stringify({target: 'general', header: 'afterMalformed'})});
  assert.strictEqual(harness.errors.length, 1);
  assert.ok(harness.events.some(function (event) {
    return event.target === 'general' && event.data.header === 'afterMalformed';
  }));
});

test('connection loss creates one replacement socket and reinitializes connection state', function () {
  const harness = createHarness();
  harness.context.beoCom.connectToCurrentProduct();
  const first = harness.sockets[0];
  first.onopen();
  first.onclose();
  assert.strictEqual(harness.sockets.length, 2);
  harness.sockets[1].onopen();
  assert.strictEqual(harness.classes.has('connected'), true);
  const connectionEvents = harness.events.filter(function (event) {
    return event.target === 'general' && event.data.header === 'connection';
  });
  assert.deepStrictEqual(
    connectionEvents.map(function (event) { return event.data.content.status; }),
    ['connecting', 'connected', 'disconnected', 'connecting', 'connected']
  );
});

(function run() {
  let failures = 0;
  tests.forEach(function (item) {
    try {
      item.fn();
      console.log('ok - ' + item.name);
    } catch (error) {
      failures += 1;
      console.error('not ok - ' + item.name);
      console.error(error.stack);
    }
  });
  console.log('\n' + (tests.length - failures) + ' passed, ' + failures + ' failed');
  if (failures) process.exitCode = 1;
}());
