#!/usr/bin/env node
'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const menu = fs.readFileSync(path.join(__dirname, '../Beocreate2/beo-extensions/signal-flow/menu.html'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '../Beocreate2/beo-extensions/signal-flow/signal-flow-client.js'), 'utf8');
['Merge measurements', 'aria-labelledby="signal-flow-measurement-merge-title"', 'role="status"', 'Sources remain unchanged'].forEach(function(text) { assert.ok(menu.includes(text), text); });
['Nearfield source', 'Farfield source', 'Level alignment', 'Suggested level offset', 'Chosen level offset', 'Reset alignment', 'Merge frequency', 'Transition width', 'Derived merged response', 'Derived phase unavailable', 'Stale derived response', 'Update assignment', 'not an anechoic claim'].forEach(function(text) { assert.ok(client.includes(text), text); });
['previewMeasurementMerge', 'saveMeasurementMerge', 'Use suggested offset', 'Save merged response to draft', 'aria-describedby="signal-flow-merge-frequency-unit', 'signal-flow-merge-center'].forEach(function(text) { assert.ok(client.includes(text), text); });
assert.strictEqual(client.includes('Auto EQ'), false);
console.log('ok - merge UI semantics, warnings, native controls and safety wording');
