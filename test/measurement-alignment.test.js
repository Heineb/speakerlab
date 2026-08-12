#!/usr/bin/env node
'use strict';
const assert = require('assert');
const measurementModel = require('../Beocreate2/beo-extensions/signal-flow/measurement-model');
const merge = require('../Beocreate2/beo-extensions/signal-flow/measurement-merge-model');
const tests = [];
function test(name, fn) { tests.push({name, fn}); }
function source(id, type, frequencies, offset, phase) {
  const points = frequencies.map(function(frequency, index) {
    const point = {frequencyHz: frequency, magnitudeDb: 70 + 10 * Math.log10(frequency / 20) + offset + (index === 2 ? 0.2 : 0)};
    if (phase) point.phaseDegrees = phase[index] || 0;
    return point;
  });
  return {id, name: id, type, sourceFormat: 'frd', units: {frequency: 'Hz', magnitude: 'dB', phase: phase ? 'degrees' : null}, points, integrity: {algorithm: 'sha256', hash: measurementModel.hash(points)}, validation: {warnings: []}, modelVersion: 1};
}
const low = source('near', 'nearfield', [20, 40, 80, 160, 320, 640, 1280, 2560], -6);
const high = source('far', 'farfield', [160, 240, 320, 480, 640, 960, 1280, 2560, 5120, 10240], 0);

test('finds full, partial, boundary and missing overlap', function() {
  assert.deepStrictEqual(merge.overlap(low, high).startHz, 160);
  assert.deepStrictEqual(merge.overlap(low, high).endHz, 2560);
  const full = source('full', 'farfield', low.points.map(function(point) { return point.frequencyHz; }), 0);
  assert.deepStrictEqual(merge.overlap(low, full), {available: true, startHz: 20, endHz: 2560, octaves: 7});
  const boundary = source('boundary', 'farfield', [2560, 5120], 0);
  assert.deepStrictEqual(merge.overlap(low, boundary), {available: true, startHz: 2560, endHz: 2560, octaves: 0});
  const missing = source('missing', 'farfield', [3000, 4000, 5000], 0);
  assert.strictEqual(merge.overlap(low, missing).available, false);
});
test('interpolates linearly in log frequency without extrapolation', function() {
  const points = [{frequencyHz: 100, magnitudeDb: 0}, {frequencyHz: 1000, magnitudeDb: 10}];
  assert.strictEqual(merge.interpolate(points, 100, 'magnitudeDb'), 0);
  assert.strictEqual(merge.interpolate(points, 1000, 'magnitudeDb'), 10);
  assert.ok(Math.abs(merge.interpolate(points, Math.sqrt(100000), 'magnitudeDb') - 5) < 1e-9);
  assert.strictEqual(merge.interpolate(points, 10, 'magnitudeDb'), null);
  assert.strictEqual(merge.interpolate([{frequencyHz: 100, magnitudeDb: 0}, {frequencyHz: 100, magnitudeDb: 4}, {frequencyHz: 1000, magnitudeDb: 10}], 100, 'magnitudeDb'), 2);
});
test('uses median differences for deterministic outlier-resistant alignment', function() {
  const result = merge.alignment(low, high);
  assert.strictEqual(result.available, true);
  assert.ok(Math.abs(result.suggestedOffsetDb - 6) < 0.3);
  assert.ok(result.sampleCount >= 3);
  const outlier = JSON.parse(JSON.stringify(high)); outlier.points[3].magnitudeDb += 50;
  const robust = merge.alignment(low, outlier);
  assert.ok(Math.abs(robust.suggestedOffsetDb - 6) < 0.5);
  assert.deepStrictEqual(robust, merge.alignment(low, outlier));
  assert.strictEqual(merge.alignment(source('sparse-low', 'nearfield', [100, 200], 0), source('sparse-high', 'farfield', [200, 300], 2)).available, false);
});
test('raised-cosine weights sum to one and meet boundaries', function() {
  const region = {startHz: 200, endHz: 800};
  assert.deepStrictEqual(merge.weights(200, region), {low: 1, high: 0});
  assert.deepStrictEqual(merge.weights(800, region), {low: 0, high: 1});
  const middle = merge.weights(400, region);
  assert.ok(Math.abs(middle.low + middle.high - 1) < 1e-12);
  assert.ok(Math.abs(middle.low - 0.5) < 1e-12);
  [220, 300, 500, 700].forEach(function(frequency) { const value = merge.weights(frequency, region); assert.ok(Math.abs(value.low + value.high - 1) < 1e-12); });
});
test('summarizes wrapped phase differences without blending phase', function() {
  const phaseLow = source('pl', 'nearfield', [100, 200, 400], 0, [179, -179, 170]);
  const phaseHigh = source('ph', 'farfield', [100, 200, 400], 0, [-179, 179, -170]);
  const summary = merge.phaseCompatibility(phaseLow, phaseHigh);
  assert.strictEqual(summary.available, true);
  assert.strictEqual(summary.medianAbsoluteDifferenceDegrees, 2);
  assert.strictEqual(summary.maximumAbsoluteDifferenceDegrees, 20);
  assert.strictEqual(merge.phaseCompatibility(phaseLow, high).available, false);
  const invalid = JSON.parse(JSON.stringify(phaseHigh)); delete invalid.points[1].phaseDegrees;
  assert.strictEqual(merge.phaseCompatibility(phaseLow, invalid).available, false);
});
test('validates recipe and produces continuous deterministic magnitude-only result', function() {
  const recipe = merge.recipe({low, high, mergeFrequencyHz: 640, transitionWidthOctaves: 1, magnitudeOffsetDb: 6, name: 'Merged'});
  const validation = merge.validate(recipe, [low, high]);
  assert.strictEqual(validation.valid, true);
  assert.ok(validation.warnings.some(function(item) { return item.code === 'MISSING_PHASE'; }));
  const first = merge.merge(recipe, [low, high]);
  const second = merge.merge(recipe, [low, high]);
  assert.deepStrictEqual(first.points, second.points);
  assert.ok(first.points.every(function(point) { return point.phaseDegrees === undefined; }));
  const start = first.points.find(function(point) { return point.frequencyHz === 320; });
  const midpoint = first.points.find(function(point) { return point.frequencyHz === 640; });
  const end = first.points.find(function(point) { return point.frequencyHz === 1280; });
  assert.ok(start && midpoint && end);
  assert.ok(Math.abs(midpoint.magnitudeDb - (merge.interpolate(low.points, 640, 'magnitudeDb') + 6 + merge.interpolate(high.points, 640, 'magnitudeDb')) / 2) < 1e-6);
  const narrowRecipe = merge.recipe({low, high, mergeFrequencyHz: 640, transitionWidthOctaves: 0.5, magnitudeOffsetDb: 6, name: 'Merged'});
  assert.notDeepStrictEqual(merge.transition(narrowRecipe), merge.transition(recipe));
  assert.strictEqual(merge.merge(narrowRecipe, [low, high]).points.length, first.points.length);
});
test('blocks invalid source, stale hash, no overlap and transition outside overlap', function() {
  let recipe = merge.recipe({low, high, mergeFrequencyHz: 640, transitionWidthOctaves: 1, magnitudeOffsetDb: 6});
  recipe.highSourceId = low.id;
  assert.ok(merge.validate(recipe, [low, high]).errors.some(function(item) { return item.code === 'SAME_MERGE_SOURCE'; }));
  recipe = merge.recipe({low, high, mergeFrequencyHz: 200, transitionWidthOctaves: 2, magnitudeOffsetDb: 6});
  assert.ok(merge.validate(recipe, [low, high]).errors.some(function(item) { return item.code === 'TRANSITION_OUTSIDE_OVERLAP'; }));
  recipe = merge.recipe({low, high, mergeFrequencyHz: 640, transitionWidthOctaves: 1, magnitudeOffsetDb: 6});
  recipe.lowSourceHash = '0'.repeat(64);
  const stale = merge.validate(recipe, [low, high]);
  assert.ok(stale.errors.some(function(item) { return item.code === 'STALE_MERGE_SOURCE' && /near/.test(item.message); }));
  const malformed = Object.assign({}, low, {points: [{frequencyHz: 0, magnitudeDb: 1}]});
  recipe = merge.recipe({low: malformed, high, mergeFrequencyHz: 640, transitionWidthOctaves: 1, magnitudeOffsetDb: 6});
  assert.ok(merge.validate(recipe, [malformed, high]).errors.some(function(item) { return item.code === 'MALFORMED_MERGE_SOURCE'; }));
  recipe = merge.recipe({low, high, resultMeasurementId: low.id, mergeFrequencyHz: 640, transitionWidthOctaves: 1, magnitudeOffsetDb: 6});
  assert.ok(merge.validate(recipe, [low, high]).errors.some(function(item) { return item.code === 'DERIVED_MEASUREMENT_ID_COLLISION'; }));
});
test('keeps recipe identifiers and regeneration deterministic', function() {
  const first = merge.recipe({low, high, mergeFrequencyHz: 640, transitionWidthOctaves: 1, magnitudeOffsetDb: 6, name: 'Stable'});
  const second = merge.recipe({low, high, mergeFrequencyHz: 640, transitionWidthOctaves: 1, magnitudeOffsetDb: 6, name: 'Stable'});
  assert.deepStrictEqual(first, second);
  assert.strictEqual(first.phaseHandling, 'magnitude-only');
  assert.strictEqual(first.interpolationPolicy, 'linear-log-frequency-v1');
  assert.strictEqual(first.blendPolicy, 'raised-cosine-log-frequency-v1');
  assert.deepStrictEqual(merge.merge(first, [low, high]).points, merge.merge(second, [low, high]).points);
});
test('warns for types, narrow overlap, large offset and phase policy', function() {
  const narrowLow = source('nl', 'unknown', [100, 200, 300, 400], 0, [170, 179, -179, -170]);
  const narrowHigh = source('nh', 'in-room', [250, 300, 350, 400, 500], 15, [0, 10, 20, 30, 40]);
  const recipe = merge.recipe({low: narrowLow, high: narrowHigh, mergeFrequencyHz: 330, transitionWidthOctaves: 0.2, magnitudeOffsetDb: 15});
  const warnings = merge.validate(recipe, [narrowLow, narrowHigh]).warnings.map(function(item) { return item.code; });
  ['UNKNOWN_SOURCE_TYPE', 'NARROW_OVERLAP', 'LARGE_ALIGNMENT_OFFSET', 'ROOM_HIGH_SOURCE', 'PHASE_NOT_MERGED'].forEach(function(code) { assert.ok(warnings.includes(code), code); });
});

let failed = 0; tests.forEach(function(t) { try { t.fn(); console.log('ok - ' + t.name); } catch (error) { failed++; console.error('not ok - ' + t.name); console.error(error.stack); } });
console.log('\n' + (tests.length - failed) + ' passed, ' + failed + ' failed'); if (failed) process.exitCode = 1;
