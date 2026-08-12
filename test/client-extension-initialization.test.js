'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const loader = require('../Beocreate2/beo-system/ui-extension-loader');
const localRuntime = require('../scripts/local-development-runtime');

const root = path.join(__dirname, '..');
const extensionRoot = path.join(root, 'Beocreate2', 'beo-extensions');
const tests = [];
function test(name, run) { tests.push({name, run}); }

function browserSandbox() {
  const handlers = [];
  const errors = [];
  function chain() {
    const value = {length: 0};
    [
      'addClass', 'removeClass', 'toggleClass', 'text', 'html', 'empty', 'append',
      'trigger', 'first', 'prepend', 'attr', 'css', 'val', 'on', 'off'
    ].forEach(function (name) {
      value[name] = function () {
        if (name === 'on') handlers.push(Array.from(arguments));
        return value;
      };
    });
    return value;
  }
  const document = {
    body: {classList: {contains: function () { return false; }, add: function () {}, remove: function () {}}},
    getElementById: function () { return {innerHTML: '', classList: {add: function () {}, remove: function () {}}}; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    onkeydown: null
  };
  const sandbox = {
    document,
    navigator: {userAgent: 'SpeakerLab test', platform: 'Linux'},
    location: {host: '127.0.0.1', protocol: 'http:'},
    console: {log: function () {}, warn: function () {}, error: function () { errors.push(Array.from(arguments).join(' ')); }},
    $: function () { return chain(); },
    jQuery: function () { return chain(); },
    beo: {send: function () {}, ask: function () {}, createMenuItem: function () { return ''; }},
    fetch: function () { return Promise.reject(new Error('not used')); },
    FileReader: function () {},
    setTimeout: function () { return 1; },
    clearTimeout: function () {},
    isFinite,
    Number,
    Date,
    JSON,
    Math
  };
  sandbox.window = sandbox;
  sandbox.window.navigator = sandbox.navigator;
  sandbox.window.location = sandbox.location;
  sandbox.handlers = handlers;
  sandbox.errors = errors;
  vm.createContext(sandbox);
  return sandbox;
}

function execute(sandbox, relativePath) {
  const filename = path.join(root, relativePath);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, {filename});
}

test('menu script declarations preserve configuration and signal-flow dependency order', function () {
  const configurationMarkup = fs.readFileSync(path.join(extensionRoot, 'hifiberry-system-tools', 'menu.html'), 'utf8');
  const signalFlowMarkup = fs.readFileSync(path.join(extensionRoot, 'signal-flow', 'menu.html'), 'utf8');
  assert.deepStrictEqual(loader.declaredClientScripts(configurationMarkup), [
    'configuration-backup-ui.js',
    'hifiberry-system-tools-client.js'
  ]);
  assert.deepStrictEqual(loader.declaredClientScripts(signalFlowMarkup), [
    'routing-ui-state.js',
    'signal-flow-client.js'
  ]);
  assert.ok(loader.stripClientScriptTags(signalFlowMarkup).indexOf('routing-ui-state.js') === -1);
});

test('selected local extensions declare existing scripts and menu screens', function () {
  localRuntime.DEFAULT_EXTENSIONS.forEach(function (extension) {
    const directory = path.join(extensionRoot, extension);
    const markup = fs.readFileSync(path.join(directory, 'menu.html'), 'utf8');
    assert.ok(new RegExp('class="[^"]*menu-screen[^"]*"[^>]*id="' + extension + '"|id="' + extension + '"[^>]*class="[^"]*menu-screen').test(markup), extension);
    loader.declaredClientScripts(markup).forEach(function (script) {
      assert.strictEqual(fs.existsSync(path.join(directory, script)), true, extension + '/' + script);
    });
  });
});

test('configuration state exists before the client and repeated initialization is idempotent', function () {
  const sandbox = browserSandbox();
  execute(sandbox, 'Beocreate2/beo-extensions/hifiberry-system-tools/configuration-backup-ui.js');
  const stateModule = sandbox.speakerlabConfigurationUI;
  assert.strictEqual(typeof stateModule.initialState, 'function');
  execute(sandbox, 'Beocreate2/beo-extensions/hifiberry-system-tools/hifiberry-system-tools-client.js');
  const client = sandbox.hifiberry_system_tools;
  const handlerCount = sandbox.handlers.length;
  execute(sandbox, 'Beocreate2/beo-extensions/hifiberry-system-tools/configuration-backup-ui.js');
  execute(sandbox, 'Beocreate2/beo-extensions/hifiberry-system-tools/hifiberry-system-tools-client.js');
  assert.strictEqual(sandbox.speakerlabConfigurationUI, stateModule);
  assert.strictEqual(sandbox.hifiberry_system_tools, client);
  assert.strictEqual(sandbox.handlers.length, handlerCount);
  assert.deepStrictEqual(sandbox.errors, []);
});

test('signal-flow state exists before the client and repeated initialization is idempotent', function () {
  const sandbox = browserSandbox();
  execute(sandbox, 'Beocreate2/beo-extensions/signal-flow/routing-ui-state.js');
  const stateModule = sandbox.signalFlowUIState;
  assert.strictEqual(typeof stateModule.create, 'function');
  execute(sandbox, 'Beocreate2/beo-extensions/signal-flow/signal-flow-client.js');
  const client = sandbox.signalFlow;
  const handlerCount = sandbox.handlers.length;
  execute(sandbox, 'Beocreate2/beo-extensions/signal-flow/routing-ui-state.js');
  execute(sandbox, 'Beocreate2/beo-extensions/signal-flow/signal-flow-client.js');
  assert.strictEqual(sandbox.signalFlowUIState, stateModule);
  assert.strictEqual(sandbox.signalFlow, client);
  assert.strictEqual(sandbox.handlers.length, handlerCount);
  assert.deepStrictEqual(sandbox.errors, []);
});

test('optional configuration UI absence degrades visibly without throwing', function () {
  const sandbox = browserSandbox();
  execute(sandbox, 'Beocreate2/beo-extensions/hifiberry-system-tools/hifiberry-system-tools-client.js');
  assert.strictEqual(typeof sandbox.hifiberry_system_tools.chooseBackup, 'function');
  assert.ok(sandbox.errors.some(function (line) { return line.includes('speakerlabConfigurationUI was not loaded'); }));
});

test('missing required signal-flow state reports a clear unavailable client without throwing', function () {
  const sandbox = browserSandbox();
  execute(sandbox, 'Beocreate2/beo-extensions/signal-flow/signal-flow-client.js');
  assert.strictEqual(sandbox.signalFlow.available, false);
  assert.ok(sandbox.errors.some(function (line) { return line.includes('signalFlowUIState was not loaded'); }));
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
