'use strict';

var crypto = require('crypto');
var FORMAT = 'org.speakerlab.measurement-merge';
var VERSION = 1;
var MIN_TRANSITION_OCTAVES = 0.1;
var MAX_TRANSITION_OCTAVES = 2;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function issue(level, code, message, path) { return {level: level, code: code, message: message, path: path || null}; }
function median(values) {
	if (!values.length) return null;
	var sorted = values.slice().sort(function(a, b) { return a - b; });
	var middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function round(value, digits) { var factor = Math.pow(10, digits || 6); return Math.round(value * factor) / factor; }

function overlap(low, high) {
	var start = Math.max(low.points[0].frequencyHz, high.points[0].frequencyHz);
	var end = Math.min(low.points[low.points.length - 1].frequencyHz, high.points[high.points.length - 1].frequencyHz);
	return {available: end >= start, startHz: start, endHz: end, octaves: end > start ? Math.log(end / start) / Math.LN2 : 0};
}

function interpolate(points, frequencyHz, field) {
	if (!points.length || frequencyHz < points[0].frequencyHz || frequencyHz > points[points.length - 1].frequencyHz) return null;
	var exact = points.filter(function(point) { return point.frequencyHz === frequencyHz && isFinite(point[field]); });
	if (exact.length) return median(exact.map(function(point) { return point[field]; }));
	var upper = 0;
	while (upper < points.length && points[upper].frequencyHz < frequencyHz) upper++;
	if (!upper || upper >= points.length) return null;
	var a = points[upper - 1], b = points[upper];
	if (!isFinite(a[field]) || !isFinite(b[field]) || a.frequencyHz === b.frequencyHz) return null;
	var ratio = (Math.log(frequencyHz) - Math.log(a.frequencyHz)) / (Math.log(b.frequencyHz) - Math.log(a.frequencyHz));
	return a[field] + (b[field] - a[field]) * ratio;
}

function sampleFrequencies(low, high, range) {
	var values = {};
	low.points.concat(high.points).forEach(function(point) {
		if (point.frequencyHz >= range.startHz && point.frequencyHz <= range.endHz) values[point.frequencyHz] = true;
	});
	return Object.keys(values).map(Number).sort(function(a, b) { return a - b; });
}

function alignment(low, high) {
	var range = overlap(low, high);
	if (!range.available) return {available: false, overlap: range, sampleCount: 0, suggestedOffsetDb: null, variationDb: null};
	var differences = sampleFrequencies(low, high, range).map(function(frequency) {
		var lowValue = interpolate(low.points, frequency, 'magnitudeDb');
		var highValue = interpolate(high.points, frequency, 'magnitudeDb');
		return lowValue === null || highValue === null ? null : highValue - lowValue;
	}).filter(function(value) { return value !== null && isFinite(value); });
	var suggested = median(differences);
	var deviations = suggested === null ? [] : differences.map(function(value) { return Math.abs(value - suggested); });
	return {available: differences.length >= 3, overlap: range, sampleCount: differences.length, suggestedOffsetDb: suggested === null ? null : round(suggested, 3), variationDb: deviations.length ? round(median(deviations), 3) : null};
}

function phaseCompatibility(low, high) {
	if (!low.units.phase || !high.units.phase) return {available: false, sampleCount: 0, medianAbsoluteDifferenceDegrees: null, maximumAbsoluteDifferenceDegrees: null};
	var highFrequencies = {};
	high.points.forEach(function(point) { if (isFinite(point.phaseDegrees)) highFrequencies[point.frequencyHz] = point.phaseDegrees; });
	var differences = low.points.map(function(point) {
		if (!isFinite(point.phaseDegrees) || highFrequencies[point.frequencyHz] === undefined) return null;
		var difference = point.phaseDegrees - highFrequencies[point.frequencyHz];
		while (difference > 180) difference -= 360;
		while (difference < -180) difference += 360;
		return Math.abs(difference);
	}).filter(function(value) { return value !== null; });
	return {available: differences.length >= 3, sampleCount: differences.length, medianAbsoluteDifferenceDegrees: differences.length ? round(median(differences), 3) : null, maximumAbsoluteDifferenceDegrees: differences.length ? round(Math.max.apply(null, differences), 3) : null};
}

function transition(recipe) {
	var factor = Math.pow(2, recipe.transitionWidthOctaves / 2);
	return {startHz: recipe.mergeFrequencyHz / factor, endHz: recipe.mergeFrequencyHz * factor};
}

function weights(frequencyHz, region) {
	if (frequencyHz <= region.startHz) return {low: 1, high: 0};
	if (frequencyHz >= region.endHz) return {low: 0, high: 1};
	var position = (Math.log(frequencyHz) - Math.log(region.startHz)) / (Math.log(region.endHz) - Math.log(region.startHz));
	var high = 0.5 - 0.5 * Math.cos(Math.PI * position);
	return {low: 1 - high, high: high};
}

function validate(recipe, measurements, resultID) {
	var errors = [], warnings = [], byID = {};
	measurements.forEach(function(item) { byID[item.id] = item; });
	if (!recipe || recipe.format !== FORMAT || recipe.version !== VERSION) errors.push(issue('error', 'UNSUPPORTED_MERGE_MODEL_VERSION', 'Merge recipe version is not supported.', 'recipe'));
	if (!recipe) return {valid: false, errors: errors, warnings: warnings};
	var low = byID[recipe.lowSourceId], high = byID[recipe.highSourceId];
	if (!low || !high) errors.push(issue('error', 'MISSING_MERGE_SOURCE', 'Both merge sources must be available.', 'sources'));
	if (recipe.lowSourceId === recipe.highSourceId) errors.push(issue('error', 'SAME_MERGE_SOURCE', 'Choose two different source measurements.', 'sources'));
	if (!low || !high || low === high) return {valid: false, errors: errors, warnings: warnings};
	function usableSource(source) { return source && Array.isArray(source.points) && source.points.length >= 2 && source.points.every(function(point) { return point && isFinite(point.frequencyHz) && point.frequencyHz > 0 && isFinite(point.magnitudeDb); }); }
	if (!usableSource(low) || !usableSource(high)) {
		errors.push(issue('error', 'MALFORMED_MERGE_SOURCE', 'Both merge sources need valid frequency and magnitude points.', 'sources'));
		return {valid: false, errors: errors, warnings: warnings};
	}
	if (low.sourceFormat === 'derived-merge' || high.sourceFormat === 'derived-merge') errors.push(issue('error', 'UNSUPPORTED_MERGE_SOURCE_TYPE', 'Version 1 merge sources must be imported observations, not derived merges.', 'sources'));
	if (!low.integrity || low.integrity.hash !== recipe.lowSourceHash) errors.push(issue('error', 'STALE_MERGE_SOURCE', 'Nearfield source "' + low.name + '" changed; recompute the merge before using it.', 'lowSourceId'));
	if (!high.integrity || high.integrity.hash !== recipe.highSourceHash) errors.push(issue('error', 'STALE_MERGE_SOURCE', 'Farfield source "' + high.name + '" changed; recompute the merge before using it.', 'highSourceId'));
	if (!low.units || !high.units || low.units.frequency !== high.units.frequency || low.units.magnitude !== high.units.magnitude || low.units.frequency !== 'Hz' || low.units.magnitude !== 'dB') errors.push(issue('error', 'INCOMPATIBLE_MERGE_UNITS', 'Merge sources need compatible Hz and dB units.', 'sources'));
	var range = overlap(low, high);
	if (!range.available || range.startHz === range.endHz) errors.push(issue('error', 'NO_USABLE_OVERLAP', 'Sources have no usable overlapping frequency region.', 'sources'));
	if (!isFinite(recipe.mergeFrequencyHz) || recipe.mergeFrequencyHz < range.startHz || recipe.mergeFrequencyHz > range.endHz) errors.push(issue('error', 'MERGE_FREQUENCY_OUTSIDE_OVERLAP', 'Merge frequency must be inside source overlap.', 'mergeFrequencyHz'));
	if (!isFinite(recipe.transitionWidthOctaves) || recipe.transitionWidthOctaves < MIN_TRANSITION_OCTAVES || recipe.transitionWidthOctaves > MAX_TRANSITION_OCTAVES) errors.push(issue('error', 'INVALID_TRANSITION_WIDTH', 'Transition width must be 0.1 to 2 octaves.', 'transitionWidthOctaves'));
	if (!isFinite(recipe.magnitudeOffsetDb) || recipe.magnitudeOffsetDb < -30 || recipe.magnitudeOffsetDb > 30) errors.push(issue('error', 'INVALID_ALIGNMENT_OFFSET', 'Level alignment must be between −30 and +30 dB.', 'magnitudeOffsetDb'));
	var region = transition(recipe);
	if (region.startHz < range.startHz || region.endHz > range.endHz) errors.push(issue('error', 'TRANSITION_OUTSIDE_OVERLAP', 'The complete transition region must remain inside source overlap.', 'transitionWidthOctaves'));
	var sourceSamples = sampleFrequencies(low, high, {startHz: Math.max(region.startHz, range.startHz), endHz: Math.min(region.endHz, range.endHz)});
	var samples = sourceSamples.concat([region.startHz, recipe.mergeFrequencyHz, region.endHz]).filter(function(frequency, index, all) { return all.indexOf(frequency) === index && interpolate(low.points, frequency, 'magnitudeDb') !== null && interpolate(high.points, frequency, 'magnitudeDb') !== null; });
	if (samples.length < 3) errors.push(issue('error', 'INSUFFICIENT_TRANSITION_POINTS', 'At least three usable interpolated frequencies are required around the transition.', 'mergeFrequencyHz'));
	if (measurements.some(function(item) { return item.id === recipe.resultMeasurementId && item.id !== resultID && !(item.sourceFormat === 'derived-merge' && item.mergeRecipe && item.mergeRecipe.id === recipe.id); })) errors.push(issue('error', 'DERIVED_MEASUREMENT_ID_COLLISION', 'Derived measurement identifier collides with an existing measurement.', 'resultMeasurementId'));
	if (low.type === 'unknown' || high.type === 'unknown') warnings.push(issue('warning', 'UNKNOWN_SOURCE_TYPE', 'One or both source measurement types are unknown.', 'sources'));
	if (low.type !== 'nearfield') warnings.push(issue('warning', 'LOW_SOURCE_NOT_NEARFIELD', 'Low-frequency source is not labelled nearfield.', 'lowSourceId'));
	if (['farfield', 'gated'].indexOf(high.type) === -1) warnings.push(issue('warning', 'HIGH_SOURCE_NOT_FARFIELD', 'High-frequency source is not labelled farfield or gated.', 'highSourceId'));
	if (['in-room', 'listening-position'].indexOf(high.type) !== -1) warnings.push(issue('warning', 'ROOM_HIGH_SOURCE', 'A room measurement is used as the high-frequency source.', 'highSourceId'));
	if (range.octaves < 1) warnings.push(issue('warning', 'NARROW_OVERLAP', 'Source overlap is narrower than one octave.', 'sources'));
	if (Math.abs(recipe.magnitudeOffsetDb) > 10) warnings.push(issue('warning', 'LARGE_ALIGNMENT_OFFSET', 'The chosen level alignment exceeds 10 dB.', 'magnitudeOffsetDb'));
	var alignmentInfo = alignment(low, high);
	if (alignmentInfo.suggestedOffsetDb !== null && Math.abs(alignmentInfo.suggestedOffsetDb) > 10) warnings.push(issue('warning', 'LARGE_SUGGESTED_OFFSET', 'Suggested level alignment exceeds 10 dB and requires careful review.', 'magnitudeOffsetDb'));
	if (alignmentInfo.variationDb !== null && alignmentInfo.variationDb > 3) warnings.push(issue('warning', 'IRREGULAR_OVERLAP', 'Level difference varies substantially through the overlap.', 'sources'));
	var phaseInfo = phaseCompatibility(low, high);
	if (!low.units.phase || !high.units.phase) warnings.push(issue('warning', 'MISSING_PHASE', 'Derived phase is unavailable because both sources do not provide phase.', 'phaseHandling'));
	else {
		warnings.push(issue('warning', 'PHASE_NOT_MERGED', 'Source phase is shown for compatibility only; wrapped phase is not blended in v1.', 'phaseHandling'));
		if (phaseInfo.available && (phaseInfo.medianAbsoluteDifferenceDegrees > 60 || phaseInfo.maximumAbsoluteDifferenceDegrees > 120)) warnings.push(issue('warning', 'INCONSISTENT_PHASE', 'Source phase differs substantially at common frequencies.', 'phaseHandling'));
	}
	if (sourceSamples.length < 6) warnings.push(issue('warning', 'SPARSE_TRANSITION', 'Few source points are available in the transition region.', 'mergeFrequencyHz'));
	if (range.available && (Math.log(region.startHz / range.startHz) / Math.log(range.endHz / range.startHz) < 0.1 || Math.log(range.endHz / region.endHz) / Math.log(range.endHz / range.startHz) < 0.1)) warnings.push(issue('warning', 'TRANSITION_NEAR_BOUNDARY', 'Transition region is close to a source-overlap boundary.', 'mergeFrequencyHz'));
	if ((low.validation && low.validation.warnings && low.validation.warnings.length) || (high.validation && high.validation.warnings && high.validation.warnings.length)) warnings.push(issue('warning', 'SOURCE_HAS_WARNINGS', 'One or both source measurements contain import warnings.', 'sources'));
	return {valid: errors.length === 0, errors: errors, warnings: warnings, overlap: range, alignment: alignmentInfo, transition: region, phaseAvailable: false, phaseCompatibility: phaseInfo};
}

function merge(recipe, measurements) {
	var validation = validate(recipe, measurements);
	if (!validation.valid) { var error = new Error('Merge recipe is not valid.'); error.code = 'INVALID_MERGE_RECIPE'; error.details = validation; throw error; }
	var low = measurements.find(function(item) { return item.id === recipe.lowSourceId; });
	var high = measurements.find(function(item) { return item.id === recipe.highSourceId; });
	var minimum = low.points[0].frequencyHz;
	var maximum = high.points[high.points.length - 1].frequencyHz;
	var grid = {};
	low.points.concat(high.points).forEach(function(point) { if (point.frequencyHz >= minimum && point.frequencyHz <= maximum) grid[point.frequencyHz] = true; });
	var points = Object.keys(grid).map(Number).sort(function(a, b) { return a - b; }).map(function(frequency) {
		var lowValue = interpolate(low.points, frequency, 'magnitudeDb');
		var highValue = interpolate(high.points, frequency, 'magnitudeDb');
		var value;
		if (frequency <= validation.transition.startHz) value = lowValue === null ? null : lowValue + recipe.magnitudeOffsetDb;
		else if (frequency >= validation.transition.endHz) value = highValue;
		else {
			if (lowValue === null || highValue === null) return null;
			var blend = weights(frequency, validation.transition);
			value = blend.low * (lowValue + recipe.magnitudeOffsetDb) + blend.high * highValue;
		}
		return value === null ? null : {frequencyHz: frequency, magnitudeDb: round(value, 6)};
	}).filter(Boolean);
	return {points: points, validation: validation};
}

function recipe(options) {
	var stable = options.id || 'merge-' + crypto.createHash('sha256').update([options.low.id, options.high.id, options.resultMeasurementId || ''].join(':')).digest('hex').slice(0, 16);
	return {format: FORMAT, version: VERSION, id: stable, lowSourceId: options.low.id, highSourceId: options.high.id, lowSourceHash: options.low.integrity.hash, highSourceHash: options.high.integrity.hash, mergeFrequencyHz: Number(options.mergeFrequencyHz), transitionWidthOctaves: Number(options.transitionWidthOctaves), magnitudeOffsetDb: Number(options.magnitudeOffsetDb), phaseHandling: 'magnitude-only', interpolationPolicy: 'linear-log-frequency-v1', blendPolicy: 'raised-cosine-log-frequency-v1', resultMeasurementId: options.resultMeasurementId || stable + '-result', name: String(options.name || 'Merged response').slice(0, 120), notes: String(options.notes || '').slice(0, 1000)};
}

module.exports = {FORMAT: FORMAT, VERSION: VERSION, MIN_TRANSITION_OCTAVES: MIN_TRANSITION_OCTAVES, MAX_TRANSITION_OCTAVES: MAX_TRANSITION_OCTAVES, overlap: overlap, interpolate: interpolate, alignment: alignment, phaseCompatibility: phaseCompatibility, transition: transition, weights: weights, validate: validate, merge: merge, recipe: recipe, median: median, clone: clone};
