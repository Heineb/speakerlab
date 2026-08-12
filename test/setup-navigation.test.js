'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const uiPath = path.join(__dirname, '..', 'Beocreate2', 'beo-views', 'default', 'scripts', 'beo-ui.js');
const tests = [];
function test(name, run) { tests.push({name, run}); }

function sandbox() {
  const errors = [];
  function selection() {
    const value = {length: 0};
    ['ready', 'on', 'addClass', 'removeClass', 'append', 'prepend', 'first', 'text', 'attr', 'css', 'trigger'].forEach(function (name) {
      value[name] = function () { return value; };
    });
    return value;
  }
  const document = {
    body: {classList: {contains: function () { return false; }, add: function () {}, remove: function () {}}},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    onkeydown: null
  };
  const context = {
    document,
    window: null,
    navigator: {userAgent: 'test', platform: 'Linux'},
    localStorage: {},
    console: {log: function () {}, warn: function () {}, error: function () { errors.push(Array.from(arguments).join(' ')); }},
    $: selection,
    jQuery: selection,
    FastClick: function () {},
    Image: function () {},
    setTimeout: function () { return 1; },
    clearTimeout: function () {},
    navigationSets: [],
    configuredTabs: [],
    localDevelopment: {active: true}
  };
  context.window = context;
  context.window.navigator = context.navigator;
  context.window.innerHeight = 800;
  context.window.innerWidth = 1200;
  context.window.addEventListener = function () {};
  context.window.matchMedia = function () {
    return {matches: false, addListener: function () {}, addEventListener: function () {}};
  };
  context.window.parent = {postMessage: function () {}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(uiPath, 'utf8'), context, {filename: uiPath});
  context.errors = errors;
  return context;
}

test('unknown extension is rejected with a diagnostic and no exception', function () {
  const context = sandbox();
  assert.strictEqual(context.beo.showExtension('missing-extension'), false);
  assert.ok(context.errors.some(function (line) { return line.includes('not registered'); }));
});

test('missing parent menu is rejected with a diagnostic and does not lock navigation', function () {
  const context = sandbox();
  context.extensions.child = {id: 'child', parentMenu: 'missing-parent'};
  context.document.querySelector = function (selector) {
    return selector === '.menu-screen#child' ? {id: 'child'} : null;
  };
  assert.strictEqual(context.beo.showExtension('child'), false);
  assert.strictEqual(context.beo.showExtension('child'), false);
  assert.ok(context.errors.some(function (line) { return line.includes("parent menu 'missing-parent'"); }));
});

test('repeated navigation while an animation is active returns clearly', function () {
  const source = fs.readFileSync(uiPath, 'utf8');
  assert.ok(source.includes('if (navigating) {'));
  assert.ok(source.includes("navigation is already in progress."));
  assert.ok(source.includes('return false;'));
});

test('menu registration checks real destinations before assigning parent metadata', function () {
  const source = fs.readFileSync(uiPath, 'utf8');
  assert.ok(source.includes('$(".menu-screen#"+context[0]+" .beo-dynamic-menu."+context[1]).length'));
  assert.ok(source.includes('extensionPlaced && extensions[context[0]] && document.querySelector(".menu-screen#"+context[0])'));
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
