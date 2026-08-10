#!/usr/bin/env node
'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const menu = fs.readFileSync(path.join(__dirname, '../Beocreate2/beo-extensions/signal-flow/menu.html'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '../Beocreate2/beo-extensions/signal-flow/signal-flow-client.js'), 'utf8');
[
  'aria-labelledby="signal-flow-measurements-title"', 'label for="signal-flow-measurement-file"', 'role="listbox"',
  'aria-live="polite"', 'Source data is preserved', 'not used for automatic correction'
].forEach(function(text) { assert.ok(menu.includes(text), 'missing semantic UI contract: ' + text); });
[
  'previewMeasurement', 'measurementDraft', 'measurementOverlay', 'Measured response', 'Combined electrical processing response',
  'This is not an acoustic prediction, calibration claim or automatic correction', 'FileReader', 'file.size'
].forEach(function(text) { assert.ok(client.includes(text), 'missing client behavior: ' + text); });
assert.strictEqual(client.includes('Auto EQ'), false);
console.log('ok - measurement UI semantics, safety labels and bounded file flow');
