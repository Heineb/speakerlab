'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const tests = [];
function test(name, run) { tests.push({name, run}); }

function browserSandbox(local) {
  const handlers = {};
  const errors = [];
  const sent = [];
  const notifications = [];
  const popups = [];
  const nodes = {};

  function node(selector) {
    if (!nodes[selector]) nodes[selector] = {text: '', html: '', items: [], classes: new Set()};
    const state = nodes[selector];
    const chain = {
      length: 1,
      addClass: function (name) { state.classes.add(name); return chain; },
      removeClass: function (name) { state.classes.delete(name); return chain; },
      toggleClass: function () { return chain; },
      text: function (value) { if (value !== undefined) state.text = String(value); return chain; },
      html: function (value) { if (value !== undefined) state.html = String(value); return chain; },
      empty: function () { state.items = []; state.text = ''; state.html = ''; return chain; },
      append: function (value) { state.items.push(value); return chain; },
      trigger: function () { return chain; },
      first: function () { return chain; },
      prepend: function (value) { state.items.unshift(value); return chain; },
      attr: function () { return chain; },
      css: function () { return chain; },
      val: function () { return ''; },
      on: function () { return chain; },
      off: function () { return chain; }
    };
    return chain;
  }

  const document = {
    title: '',
    domain: '127.0.0.1',
    body: {classList: {contains: function () { return false; }, add: function () {}, remove: function () {}}},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  function jquery(target) {
    if (target === document) {
      return {
        on: function (eventName, handler) {
          if (!handlers[eventName]) handlers[eventName] = [];
          handlers[eventName].push(handler);
          return this;
        }
      };
    }
    return node(String(target));
  }

  const sandbox = {
    document,
    localDevelopment: {active: !!local},
    extensions: {
      'product-information': {assetPath: '/extensions/product-information', icon: 'create.svg'},
      channels: {assetPath: '/extensions/channels', icon: 'channels.svg'}
    },
    console: {log: function () {}, warn: function () {}, error: function () {
      errors.push(Array.from(arguments).join(' '));
    }},
    $: jquery,
    jQuery: jquery,
    _: {isEqual: function (left, right) { return JSON.stringify(left) === JSON.stringify(right); }},
    beo: {
      send: function (message) { sent.push(message); },
      sendToProductView: function () {},
      translatedString: function (fallback) { return fallback; },
      createCollectionItem: function (options) { return options.label; },
      createMenuItem: function (options) { return options.label; },
      showPopupView: function (name) { popups.push(name); },
      hidePopupView: function () {},
      notify: function (message) { notifications.push(message); },
      ask: function () {},
      functionExists: function (name) {
        return name === 'product_information.generateSettingsPreview' &&
          sandbox.product_information &&
          typeof sandbox.product_information.generateSettingsPreview === 'function';
      },
      executeFunction: function (name, args) {
        return sandbox.product_information.generateSettingsPreview.apply(null, args);
      }
    },
    location: {host: '127.0.0.1', protocol: 'http:'},
    setTimeout: function () { return 1; },
    clearTimeout: function () {},
    FileReader: function () {}
  };
  sandbox.window = sandbox;
  sandbox.window.location = sandbox.location;
  sandbox.handlers = handlers;
  sandbox.errors = errors;
  sandbox.sent = sent;
  sandbox.notifications = notifications;
  sandbox.popups = popups;
  sandbox.nodes = nodes;
  vm.createContext(sandbox);
  return sandbox;
}

function execute(sandbox, relativePath) {
  const filename = path.join(root, relativePath);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, {filename});
}

function dispatch(sandbox, target, data) {
  (sandbox.handlers[target] || []).forEach(function (handler) {
    handler({}, data);
  });
}

function preview(presetName, withIdentity) {
  const content = {};
  if (withIdentity) {
    content['product-information'] = {
      status: 0,
      report: {
        previewProcessor: 'product_information.generateSettingsPreview',
        manufacturer: 'Bang & Olufsen',
        modelName: presetName
      }
    };
  }
  return {
    header: 'presetPreview',
    content: {
      preset: {
        fileName: presetName.toLowerCase().replace(/ /g, '-'),
        presetName: presetName,
        productImage: '/common/beocreate-generic.png',
        bangOlufsenProduct: !!withIdentity,
        content: content
      },
      installDefaultDSP: true
    }
  };
}

test('local product information exists before first use and is idempotent', function () {
  const sandbox = browserSandbox(true);
  execute(sandbox, 'Beocreate2/beo-extensions/product-information/product-information-client.js');
  const productInformation = sandbox.product_information;
  const handlerCount = Object.values(sandbox.handlers).reduce(function (sum, list) { return sum + list.length; }, 0);
  assert.strictEqual(productInformation.systemName(), 'SpeakerLab Local Simulator');
  assert.strictEqual(productInformation.modelID(), 'speakerlab-local-simulator');
  execute(sandbox, 'Beocreate2/beo-extensions/product-information/product-information-client.js');
  assert.strictEqual(sandbox.product_information, productInformation);
  assert.strictEqual(Object.values(sandbox.handlers).reduce(function (sum, list) { return sum + list.length; }, 0), handlerCount);
});

test('server state updates the same object with optional fields absent', function () {
  const sandbox = browserSandbox(false);
  execute(sandbox, 'Beocreate2/beo-extensions/product-information/product-information-client.js');
  const productInformation = sandbox.product_information;
  dispatch(sandbox, 'product-information', {
    header: 'showProductIdentity',
    content: {systemName: 'Known system', modelName: 'Known model', modelID: 'known'}
  });
  assert.strictEqual(sandbox.product_information, productInformation);
  assert.strictEqual(productInformation.systemName(), 'Known system');
  assert.strictEqual(productInformation.modelID(), 'known');
  assert.deepStrictEqual(sandbox.errors, []);
});

test('preset preview before product information uses explicit minimal state without crashing', function () {
  const sandbox = browserSandbox(true);
  execute(sandbox, 'Beocreate2/beo-extensions/speaker-preset/speaker-preset-client.js');
  dispatch(sandbox, 'speaker-preset', preview('Other Speaker', false));
  dispatch(sandbox, 'speaker-preset', preview('Other Speaker', false));
  assert.deepStrictEqual(sandbox.popups, ['speaker-preset-preview-popup', 'speaker-preset-preview-popup']);
  assert.strictEqual(sandbox.errors.filter(function (line) { return line.includes('minimal metadata'); }).length, 1);
});

test('product information before named preset renders complete identity preview', function () {
  const sandbox = browserSandbox(true);
  execute(sandbox, 'Beocreate2/beo-extensions/product-information/product-information-client.js');
  execute(sandbox, 'Beocreate2/beo-extensions/speaker-preset/speaker-preset-client.js');
  dispatch(sandbox, 'speaker-preset', preview('Beovox CX 50', true));
  assert.strictEqual(sandbox.nodes['.speaker-preset-information h1'].text, 'Beovox CX 50');
  assert.strictEqual(sandbox.nodes['.speaker-preset-information p.product'].text, '');
  assert.strictEqual(sandbox.nodes['.speaker-preset-contents'].items.length, 1);
  assert.deepStrictEqual(sandbox.errors, []);
});

test('setup state before both clients and reconnect ordering remain safe', function () {
  const sandbox = browserSandbox(true);
  dispatch(sandbox, 'setup', {header: 'setupStatus', content: {setup: true}});
  execute(sandbox, 'Beocreate2/beo-extensions/product-information/product-information-client.js');
  execute(sandbox, 'Beocreate2/beo-extensions/speaker-preset/speaker-preset-client.js');
  dispatch(sandbox, 'product-information', {header: 'showProductIdentity', content: {systemName: 'Refreshed'}});
  dispatch(sandbox, 'general', {header: 'connection', content: {status: 'disconnected'}});
  dispatch(sandbox, 'speaker-preset', preview('Other Speaker', false));
  dispatch(sandbox, 'general', {header: 'connection', content: {status: 'connected'}});
  dispatch(sandbox, 'product-information', {header: 'basicProductInformation', content: {systemName: 'Refreshed'}});
  assert.strictEqual(sandbox.product_information.systemName(), 'Refreshed');
  assert.ok(sandbox.sent.some(function (message) {
    return message.target === 'product-information' && message.header === 'getBasicProductInformation';
  }));
});

test('malformed product messages are diagnosed once and later state remains usable', function () {
  const sandbox = browserSandbox(true);
  execute(sandbox, 'Beocreate2/beo-extensions/product-information/product-information-client.js');
  dispatch(sandbox, 'product-information', {header: 'showProductIdentity'});
  dispatch(sandbox, 'product-information', {header: 'showProductIdentity'});
  dispatch(sandbox, 'product-information', {header: 'showProductIdentity', content: {systemName: 'Recovered'}});
  assert.strictEqual(sandbox.product_information.systemName(), 'Recovered');
  assert.strictEqual(sandbox.errors.filter(function (line) { return line.includes("header='showProductIdentity'"); }).length, 1);
});

test('selection, confirmation and invalid preview produce visible outcomes', function () {
  const sandbox = browserSandbox(true);
  execute(sandbox, 'Beocreate2/beo-extensions/product-information/product-information-client.js');
  execute(sandbox, 'Beocreate2/beo-extensions/speaker-preset/speaker-preset-client.js');
  sandbox.speaker_preset.selectPreset('other-speaker');
  dispatch(sandbox, 'speaker-preset', preview('Other Speaker', false));
  sandbox.speaker_preset.applyPreset();
  dispatch(sandbox, 'speaker-preset', {header: 'presetPreview', content: {}});
  assert.deepStrictEqual(sandbox.sent.slice(0, 2).map(function (message) { return message.header; }), [
    'selectSpeakerPreset',
    'applySpeakerPreset'
  ]);
  assert.strictEqual(sandbox.notifications[0].title, 'Speaker preset unavailable');
  assert.ok(sandbox.errors.some(function (line) { return line.includes('preset content is missing'); }));
});

let failures = 0;
tests.forEach(function (entry) {
  try {
    entry.run();
    console.log('ok - ' + entry.name);
  } catch (error) {
    failures += 1;
    console.error('not ok - ' + entry.name);
    console.error(error.stack);
  }
});
console.log('\n' + (tests.length - failures) + ' passed, ' + failures + ' failed');
if (failures) process.exitCode = 1;
