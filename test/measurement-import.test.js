#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const model = require('../Beocreate2/beo-extensions/signal-flow/measurement-model');
const tests = [];
function test(name, fn) { tests.push({name, fn}); }
function fixture(name) { return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'); }
test('detects REW magnitude and phase', function() {
  const result = model.parseText(fixture('measurement-rew.txt'));
  assert.strictEqual(result.format, 'rew-text'); assert.strictEqual(result.confidence, 'high');
  assert.deepStrictEqual(result.recognizedColumns, ['frequency-hz', 'magnitude-db', 'phase-degrees']);
  assert.deepStrictEqual(result.summary, {pointCount: 10, minimumFrequencyHz: 20, maximumFrequencyHz: 20000, phaseAvailable: true});
});
test('detects FRD and warns about absent phase', function() {
  const result = model.parseText(fixture('measurement-magnitude.frd'));
  assert.strictEqual(result.format, 'frd'); assert.ok(result.warnings.some(function(i) { return i.code === 'NO_PHASE'; }));
});
test('handles BOM, CRLF, tabs and scientific notation', function() {
  const result = model.parseText('\uFEFF# REW\r\nFrequency\tSPL\tPhase\r\n2e1\t7e1\t-1e1\r\n1e2\t8e1\t-2e1');
  assert.deepStrictEqual(result.points[1], {frequencyHz: 100, magnitudeDb: 80, phaseDegrees: -20});
});
test('handles comma columns and unambiguous decimal comma deterministically', function() {
  assert.deepStrictEqual(model.parseText('20,70,-10\n100,80,-20').points[1], {frequencyHz: 100, magnitudeDb: 80, phaseDegrees: -20});
  assert.deepStrictEqual(model.parseText('20,5 70,25\n100,5 80,25').points[0], {frequencyHz: 20.5, magnitudeDb: 70.25});
});
test('sorts descending input and preserves duplicates', function() {
  const result = model.parseText('1000 80 10\n100 70 20\n100 71 21');
  assert.strictEqual(result.points[0].frequencyHz, 100); assert.strictEqual(result.points.length, 3);
  assert.ok(result.warnings.some(function(i) { return i.code === 'SOURCE_UNSORTED'; }));
  assert.ok(result.warnings.some(function(i) { return i.code === 'DUPLICATE_FREQUENCIES'; }));
});
test('rejects empty, binary, invalid frequency and malformed rows', function() {
  assert.throws(function() { model.parseText(''); }, function(e) { return e.code === 'NO_VALID_ROWS'; });
  assert.throws(function() { model.parseText('10 20\0'); }, function(e) { return e.code === 'UNSUPPORTED_FORMAT'; });
  assert.throws(function() { model.parseText('0 20'); }, function(e) { return e.code === 'INVALID_FREQUENCY'; });
  assert.throws(function() { model.parseText('10 20\n20 broken'); }, function(e) { return e.code === 'MALFORMED_ROWS'; });
});
test('creates path-safe integrity-protected model', function() {
  const measurement = model.create(model.parseText(fixture('measurement-rew.txt')), {filename: '/Users/example/My Woofer.txt', importedAt: '2026-08-10T10:00:00.000Z'});
  assert.strictEqual(measurement.sourceFilename, 'My Woofer.txt'); assert.strictEqual(JSON.stringify(measurement).includes('/Users/'), false);
  assert.strictEqual(measurement.integrity.hash, model.hash(measurement.points));
});
test('bounds provenance comments and removes absolute paths', function() {
  const preview = model.parseText('# Source /Users/example/private/woofer.txt\n20 70\n100 80');
  assert.strictEqual(JSON.stringify(preview.metadata).includes('/Users/'), false);
});
test('validates integrity and assignments', function() {
  const measurement = model.create(model.parseText(fixture('measurement-rew.txt')), {filename: 'woofer.txt', importedAt: '2026-08-10T10:00:00.000Z'});
  const configuration = model.defaults(); configuration.measurements.push(measurement);
  assert.strictEqual(model.validate(configuration, ['output-a']).valid, true);
  measurement.assignedOutputId = 'missing'; assert.ok(model.validate(configuration, ['output-a']).errors.some(function(i) { return i.code === 'UNKNOWN_MEASUREMENT_OUTPUT'; }));
  measurement.assignedOutputId = null; measurement.points[0].magnitudeDb++;
  assert.ok(model.validate(configuration, ['output-a']).errors.some(function(i) { return i.code === 'INTEGRITY_MISMATCH'; }));
});
let failed = 0;
tests.forEach(function(t) { try { t.fn(); console.log('ok - ' + t.name); } catch (e) { failed++; console.error('not ok - ' + t.name); console.error(e.stack); } });
console.log('\n' + (tests.length - failed) + ' passed, ' + failed + ' failed'); if (failed) process.exitCode = 1;
