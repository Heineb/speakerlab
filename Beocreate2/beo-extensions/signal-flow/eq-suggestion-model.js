'use strict';

var crypto = require('crypto');

var ALGORITHM_VERSION = 'speakerlab-assisted-eq-v1';
var TARGETS = ['flat', 'gentle-downward-tilt'];
var SMOOTHING = ['none', '1/12', '1/6', '1/3'];
var DEFAULT_FILTER_LIMIT = 5;
var MAX_FILTER_LIMIT = 7;
var DEFAULT_BOOST_LIMIT_DB = 3;
var MAX_BOOST_LIMIT_DB = 6;
var MIN_POINTS = 12;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function round(value, places) { var scale = Math.pow(10, places); return Math.round(value * scale) / scale; }
function issue(level, code, message) { return {level: level, code: code, message: message}; }
function median(values) {
	if (!values.length) return null;
	var sorted = values.slice().sort(function(a, b) { return a - b; });
	var middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function log2(value) { return Math.log(value) / Math.LN2; }

function capabilities() {
	return {
		algorithmVersion: ALGORITHM_VERSION,
		targets: [
			{id: 'flat', name: 'Flat', defaultTiltDbPerOctave: 0},
			{id: 'gentle-downward-tilt', name: 'Gentle downward tilt', defaultTiltDbPerOctave: -1}
		],
		smoothing: SMOOTHING.slice(),
		defaultSmoothing: '1/6',
		filterTypes: ['peaking'],
		filterLimit: {default: DEFAULT_FILTER_LIMIT, maximum: MAX_FILTER_LIMIT},
		boostLimitDb: {default: DEFAULT_BOOST_LIMIT_DB, maximum: MAX_BOOST_LIMIT_DB},
		physicalDeploymentAllowed: false,
		automaticDesignChanges: false
	};
}

function defaults() {
	return {
		target: 'flat',
		tiltDbPerOctave: 0,
		referenceLevelDb: null,
		minimumFrequencyHz: null,
		maximumFrequencyHz: null,
		smoothing: '1/6',
		filterLimit: DEFAULT_FILTER_LIMIT,
		boostLimitDb: DEFAULT_BOOST_LIMIT_DB,
		considerExistingEQ: true
	};
}

function interpolate(points, frequencyHz) {
	if (!points.length || frequencyHz < points[0].frequencyHz || frequencyHz > points[points.length - 1].frequencyHz) return null;
	var exact = points.filter(function(point) { return point.frequencyHz === frequencyHz; });
	if (exact.length) return median(exact.map(function(point) { return point.magnitudeDb; }));
	var upper = 0;
	while (upper < points.length && points[upper].frequencyHz < frequencyHz) upper++;
	if (!upper || upper >= points.length) return null;
	var a = points[upper - 1], b = points[upper];
	var position = (Math.log(frequencyHz) - Math.log(a.frequencyHz)) / (Math.log(b.frequencyHz) - Math.log(a.frequencyHz));
	return a.magnitudeDb + (b.magnitudeDb - a.magnitudeDb) * position;
}

function analysisGrid(points, minimumHz, maximumHz, count) {
	count = count || 121;
	var grid = [];
	for (var index = 0; index < count; index++) {
		var frequencyHz = minimumHz * Math.pow(maximumHz / minimumHz, index / (count - 1));
		var magnitudeDb = interpolate(points, frequencyHz);
		if (magnitudeDb !== null) grid.push({frequencyHz: round(frequencyHz, 3), magnitudeDb: round(magnitudeDb, 6)});
	}
	return grid;
}

function smooth(points, mode) {
	if (SMOOTHING.indexOf(mode) === -1) throw new Error('Unsupported analysis smoothing.');
	if (mode === 'none') return clone(points);
	var fraction = Number(mode.split('/')[1]);
	var radiusOctaves = 0.5 / fraction;
	return points.map(function(point) {
		var weighted = 0, total = 0;
		points.forEach(function(candidate) {
			var distance = Math.abs(log2(candidate.frequencyHz / point.frequencyHz));
			if (distance > radiusOctaves) return;
			var weight = 0.5 + 0.5 * Math.cos(Math.PI * distance / radiusOctaves);
			weighted += candidate.magnitudeDb * weight;
			total += weight;
		});
		return {frequencyHz: point.frequencyHz, magnitudeDb: round(weighted / total, 6)};
	});
}

function crossoverRange(measurement, output, crossoverOutput) {
	var minimum = Math.max(10, measurement.points[0].frequencyHz);
	var maximum = Math.min(20000, measurement.points[measurement.points.length - 1].frequencyHz);
	var role = output ? output.role : measurement.driverRole;
	if (role === 'tweeter') minimum = Math.max(minimum, 800);
	if (role === 'woofer') maximum = Math.min(maximum, 8000);
	if (role === 'subwoofer') maximum = Math.min(maximum, 300);
	if (crossoverOutput && crossoverOutput.highPass && crossoverOutput.highPass.enabled) minimum = Math.max(minimum, crossoverOutput.highPass.cutoffHz * 1.1);
	if (crossoverOutput && crossoverOutput.lowPass && crossoverOutput.lowPass.enabled) maximum = Math.min(maximum, crossoverOutput.lowPass.cutoffHz / 1.1);
	return {minimumHz: round(minimum, 3), maximumHz: round(maximum, 3), source: 'measurement coverage, output role and configured crossover'};
}

function staleMerge(measurement, measurements) {
	if (!measurement.mergeRecipe) return false;
	var recipe = measurement.mergeRecipe;
	var low = measurements.find(function(item) { return item.id === recipe.lowSourceId; });
	var high = measurements.find(function(item) { return item.id === recipe.highSourceId; });
	return !low || !high || !low.integrity || !high.integrity || low.integrity.hash !== recipe.lowSourceHash || high.integrity.hash !== recipe.highSourceHash;
}

function eligibility(measurement, measurements, outputId) {
	var errors = [], warnings = [];
	if (!measurement) errors.push(issue('error', 'NO_MEASUREMENT_SELECTED', 'Select a reference measurement.'));
	if (!measurement) return {eligible: false, errors: errors, warnings: warnings};
	if (!measurement.integrity || !measurement.integrity.hash || !Array.isArray(measurement.points) ||
		(measurement.points && measurement.integrity && measurement.integrity.hash !== crypto.createHash('sha256').update(JSON.stringify(measurement.points)).digest('hex'))) errors.push(issue('error', 'CORRUPT_MEASUREMENT', 'The selected measurement failed its integrity contract.'));
	if (measurement.assignedOutputId !== outputId) errors.push(issue('error', 'UNSUPPORTED_MEASUREMENT_ASSIGNMENT', 'The reference measurement must be assigned to this output.'));
	if (measurement.points.length < MIN_POINTS) errors.push(issue('error', 'INSUFFICIENT_MEASUREMENT_POINTS', 'The reference measurement has too few points for assisted EQ.'));
	if (measurement.sourceFormat === 'derived-merge' && staleMerge(measurement, measurements || [])) errors.push(issue('error', 'STALE_DERIVED_MEASUREMENT', 'Recompute the stale merged response before suggesting EQ.'));
	if (measurement.validation && measurement.validation.state === 'invalid') errors.push(issue('error', 'INVALID_MEASUREMENT', 'The selected measurement is invalid.'));
	if (measurement.type === 'in-room' || measurement.type === 'listening-position') warnings.push(issue('warning', 'IN_ROOM_SOURCE', 'In-room response includes placement and room effects; suggestions are not room correction.'));
	if (measurement.type === 'unknown') warnings.push(issue('warning', 'UNKNOWN_MEASUREMENT_TYPE', 'The measurement type is unknown, so suggestion confidence is reduced.'));
	if (measurement.points.length < 30) warnings.push(issue('warning', 'SPARSE_MEASUREMENT', 'The measurement is sparse; broad corrections only are appropriate.'));
	var octaves = log2(measurement.points[measurement.points.length - 1].frequencyHz / measurement.points[0].frequencyHz);
	if (octaves < 2) warnings.push(issue('warning', 'NARROW_MEASUREMENT_RANGE', 'The usable measurement range is narrow.'));
	if (measurement.sourceFormat === 'derived-merge') warnings.push(issue('warning', 'MERGE_BOUNDARY_RESTRAINT', 'Suggestions avoid the saved nearfield/farfield merge transition.'));
	return {eligible: errors.length === 0, errors: errors, warnings: warnings};
}

function validateOptions(options, derivedRange) {
	var errors = [];
	if (TARGETS.indexOf(options.target) === -1) errors.push(issue('error', 'INVALID_EQ_TARGET', 'Select Flat or Gentle downward tilt.'));
	if (SMOOTHING.indexOf(options.smoothing) === -1) errors.push(issue('error', 'INVALID_SMOOTHING', 'Select a supported analysis smoothing value.'));
	if (!Number.isInteger(options.filterLimit) || options.filterLimit < 1 || options.filterLimit > MAX_FILTER_LIMIT) errors.push(issue('error', 'INVALID_FILTER_LIMIT', 'Suggestion limit must be between 1 and ' + MAX_FILTER_LIMIT + '.'));
	if (!Number.isFinite(options.boostLimitDb) || options.boostLimitDb < 0 || options.boostLimitDb > MAX_BOOST_LIMIT_DB) errors.push(issue('error', 'INVALID_BOOST_LIMIT', 'Positive boost limit must be between 0 and ' + MAX_BOOST_LIMIT_DB + ' dB.'));
	if (!Number.isFinite(options.minimumFrequencyHz) || !Number.isFinite(options.maximumFrequencyHz) || options.minimumFrequencyHz >= options.maximumFrequencyHz) errors.push(issue('error', 'INVALID_OPTIMISATION_RANGE', 'The optimisation range must have finite increasing boundaries.'));
	else if (options.minimumFrequencyHz < derivedRange.minimumHz || options.maximumFrequencyHz > derivedRange.maximumHz) errors.push(issue('error', 'RANGE_OUTSIDE_USABLE_COVERAGE', 'The optimisation range must remain inside the visible usable range.'));
	if (options.referenceLevelDb !== null && !Number.isFinite(options.referenceLevelDb)) errors.push(issue('error', 'INVALID_TARGET_REFERENCE', 'Target reference level must be finite.'));
	if (!Number.isFinite(options.tiltDbPerOctave) || options.tiltDbPerOctave < -3 || options.tiltDbPerOctave > 1) errors.push(issue('error', 'INVALID_TARGET_TILT', 'Target tilt must be between −3 and +1 dB per octave.'));
	return errors;
}

function targetPoints(points, target, tiltDbPerOctave, referenceLevelDb) {
	var reference = referenceLevelDb === null ? median(points.map(function(point) { return point.magnitudeDb; })) : referenceLevelDb;
	var tilt = target === 'gentle-downward-tilt' ? (tiltDbPerOctave === 0 ? -1 : tiltDbPerOctave) : 0;
	return points.map(function(point) {
		return {frequencyHz: point.frequencyHz, magnitudeDb: round(reference + tilt * log2(point.frequencyHz / 1000), 6)};
	});
}

function electricalAt(eqModel, bands, frequencyHz) {
	var sections = bands.filter(function(band) { return band.enabled; }).map(function(band) { return eqModel.designBand(band, eqModel.SAMPLE_RATE_HZ); });
	var response = eqModel.responseAt(sections, frequencyHz, eqModel.SAMPLE_RATE_HZ);
	return 20 * Math.log10(Math.max(1e-9, Math.sqrt(response.real * response.real + response.imaginary * response.imaginary)));
}

function objective(points, target, filters, eqModel) {
	var squared = 0;
	points.forEach(function(point, index) {
		var predicted = point.magnitudeDb + electricalAt(eqModel, filters, point.frequencyHz);
		var error = predicted - target[index].magnitudeDb;
		squared += error * error;
	});
	var qPenalty = filters.reduce(function(total, filter) { return total + Math.max(0, filter.shape - 2) * 0.08; }, 0);
	var boostPenalty = filters.reduce(function(total, filter) { return total + Math.max(0, filter.gainDb) * Math.max(0, filter.gainDb) * 0.35; }, 0);
	return squared / points.length + filters.length * 0.2 + qPenalty + boostPenalty;
}

function blockedByMerge(measurement, frequencyHz) {
	if (!measurement.mergeRecipe) return false;
	var factor = Math.pow(2, measurement.mergeRecipe.transitionWidthOctaves / 2);
	return frequencyHz >= measurement.mergeRecipe.mergeFrequencyHz / factor && frequencyHz <= measurement.mergeRecipe.mergeFrequencyHz * factor;
}

function broadRegions(points, target) {
	var regions = [], active = null;
	points.forEach(function(point, index) {
		var error = point.magnitudeDb - target[index].magnitudeDb;
		var significant = Math.abs(error) >= (error > 0 ? 1.5 : 2);
		if (significant && (!active || Math.sign(active.sign) === Math.sign(error))) {
			if (!active) active = {start: index, end: index, sign: error, peak: index};
			active.end = index;
			if (Math.abs(error) > Math.abs(points[active.peak].magnitudeDb - target[active.peak].magnitudeDb)) active.peak = index;
		} else if (active) { regions.push(active); active = null; }
	});
	if (active) regions.push(active);
	return regions;
}

function analyse(input, eqModel) {
	var measurement = input.measurement;
	var eligible = eligibility(measurement, input.measurements || [], input.output.id);
	if (!eligible.eligible) return {valid: false, errors: eligible.errors, warnings: eligible.warnings, suggestions: []};
	var derivedRange = crossoverRange(measurement, input.output, input.crossoverOutput);
	var options = Object.assign(defaults(), input.options || {});
	if (options.minimumFrequencyHz === null) options.minimumFrequencyHz = derivedRange.minimumHz;
	if (options.maximumFrequencyHz === null) options.maximumFrequencyHz = derivedRange.maximumHz;
	var optionErrors = validateOptions(options, derivedRange);
	var availableBands = eqModel.MAX_BANDS_PER_OUTPUT - input.eqOutput.bands.length;
	if (availableBands < 1) optionErrors.push(issue('error', 'INSUFFICIENT_TARGET_CAPABILITY', 'No standard Parametric EQ band capacity remains for accepted suggestions.'));
	else options.filterLimit = Math.min(options.filterLimit, availableBands);
	if (optionErrors.length || derivedRange.maximumHz <= derivedRange.minimumHz) return {valid: false, errors: optionErrors.length ? optionErrors : [issue('error', 'NO_USABLE_FREQUENCY_OVERLAP', 'No usable frequency range remains after measurement and crossover limits.')], warnings: eligible.warnings, suggestions: []};
	var rawGrid = analysisGrid(measurement.points, options.minimumFrequencyHz, options.maximumFrequencyHz, 121);
	var smoothed = smooth(rawGrid, options.smoothing);
	var existingBands = options.considerExistingEQ ? clone(input.eqOutput.bands.filter(function(band) { return band.enabled; })) : [];
	var current = smoothed.map(function(point) { return {frequencyHz: point.frequencyHz, magnitudeDb: round(point.magnitudeDb + electricalAt(eqModel, existingBands, point.frequencyHz), 6)}; });
	var target = targetPoints(current, options.target, options.tiltDbPerOctave, options.referenceLevelDb);
	var warnings = eligible.warnings.slice();
	if (existingBands.some(function(band) { return band.gainDb > 3; })) warnings.push(issue('warning', 'EXISTING_EQ_BOOST', 'Existing enabled EQ already produces significant positive boost.'));
	var adjacent = [];
	for (var n = 1; n < smoothed.length; n++) adjacent.push(Math.abs(smoothed[n].magnitudeDb - smoothed[n - 1].magnitudeDb));
	if ((median(adjacent) || 0) > 1.5) warnings.push(issue('warning', 'NOISY_MEASUREMENT', 'The response varies rapidly; suggestions are restricted to broad corrections.'));
	var candidates = broadRegions(current, target).map(function(region) {
		var peak = region.peak, error = current[peak].magnitudeDb - target[peak].magnitudeDb;
		var startFrequency = current[region.start].frequencyHz, endFrequency = current[region.end].frequencyHz;
		var widthOctaves = Math.max(0.08, log2(endFrequency / startFrequency));
		var q = clamp(1 / (2 * Math.sinh(Math.LN2 * widthOctaves / 2)), 0.35, 4.5);
		return {frequencyHz: current[peak].frequencyHz, errorDb: error, widthOctaves: widthOctaves, q: q, start: region.start, end: region.end};
	}).sort(function(a, b) {
		if ((a.errorDb < 0) !== (b.errorDb < 0)) return a.errorDb < 0 ? 1 : -1;
		return Math.abs(b.errorDb) - Math.abs(a.errorDb) || a.frequencyHz - b.frequencyHz;
	});
	var accepted = [], baseFilters = existingBands.slice(), currentObjective = objective(smoothed, target, baseFilters, eqModel);
	var skippedNull = false;
	candidates.some(function(candidate) {
		if (accepted.length >= options.filterLimit) return true;
		if (blockedByMerge(measurement, candidate.frequencyHz)) return false;
		if (candidate.errorDb < -6 && candidate.widthOctaves < 0.35) { skippedNull = true; return false; }
		var gain = candidate.errorDb > 0 ? -Math.min(6, candidate.errorDb * 0.75) : Math.min(options.boostLimitDb, -candidate.errorDb * 0.5);
		gain = round(gain, 1);
		if (Math.abs(gain) < 1) return false;
		var band = {id: 'candidate', enabled: true, type: 'peaking', frequencyHz: round(candidate.frequencyHz, 1), gainDb: gain, shape: round(candidate.q, 2), label: ''};
		var trial = baseFilters.concat(accepted.map(function(item) { return item.band; }), [band]);
		var nextObjective = objective(smoothed, target, trial, eqModel);
		var improvement = currentObjective - nextObjective;
		if (improvement < 0.2) return false;
		var identity = [ALGORITHM_VERSION, measurement.id, measurement.integrity.hash, options.target, options.minimumFrequencyHz, options.maximumFrequencyHz, band.frequencyHz, band.gainDb, band.shape].join('|');
		var id = 'suggestion-' + crypto.createHash('sha256').update(identity).digest('hex').slice(0, 12);
		accepted.push({
			id: id,
			band: band,
			filterType: 'peaking',
			frequencyHz: band.frequencyHz,
			gainDb: band.gainDb,
			q: band.shape,
			reason: gain < 0 ? 'Reduces a broad peak relative to the selected target.' : 'Applies a modest broad correction without attempting to fill a deep null.',
			expectedLocalImprovementDb: round(Math.min(Math.abs(candidate.errorDb), Math.abs(gain)), 2),
			confidence: measurement.type === 'unknown' || measurement.points.length < 30 ? 'reduced' : 'moderate',
			headroomEffectDb: gain > 0 ? gain : 0,
			sourceMeasurementId: measurement.id,
			sourceMeasurementHash: measurement.integrity.hash,
			target: {type: options.target, referenceLevelDb: targetPoints(current, options.target, options.tiltDbPerOctave, options.referenceLevelDb)[0] ? round(median(target.map(function(point) { return point.magnitudeDb; })), 3) : null, tiltDbPerOctave: options.target === 'flat' ? 0 : (options.tiltDbPerOctave || -1)},
			optimisationRange: {minimumFrequencyHz: options.minimumFrequencyHz, maximumFrequencyHz: options.maximumFrequencyHz},
			algorithmVersion: ALGORITHM_VERSION,
			objectiveImprovement: round(improvement, 4)
		});
		currentObjective = nextObjective;
		return false;
	});
	if (skippedNull) warnings.push(issue('warning', 'DEEP_NULL_AVOIDED', 'A deep narrow cancellation was left uncorrected; large boost into a likely null is unsafe and usually ineffective.'));
	if (accepted.some(function(item) { return item.gainDb >= 2.5; })) warnings.push(issue('warning', 'LARGE_PROPOSED_BOOST', 'A proposed positive correction approaches the configured boost limit.'));
	if (accepted.some(function(item) { return item.q >= 4; })) warnings.push(issue('warning', 'HIGH_Q_SUGGESTION', 'A relatively narrow suggestion needs careful review.'));
	if (accepted.some(function(item) { return item.gainDb > 0; })) warnings.push(issue('warning', 'HEADROOM_REDUCTION', 'Positive suggestions increase potential voltage demand and reduce estimated headroom; channel gain is not changed automatically.'));
	if (input.protection && input.protection.limiter && input.protection.limiter.enabled && accepted.some(function(item) { return item.gainDb > 0; })) warnings.push(issue('warning', 'PROTECTION_LIMIT_CONCERN', 'Positive suggestions may conflict with the configured electrical protection limit. This model does not guarantee safety.'));
	var suggestedBands = accepted.map(function(item) { return item.band; });
	var predictedFilters = baseFilters.concat(suggestedBands);
	var prediction = smoothed.map(function(point, index) {
		return {
			frequencyHz: point.frequencyHz,
			measuredDb: rawGrid[index].magnitudeDb,
			targetDb: target[index].magnitudeDb,
			currentEstimatedDb: current[index].magnitudeDb,
			predictedWithSuggestionsDb: round(point.magnitudeDb + electricalAt(eqModel, predictedFilters, point.frequencyHz), 4)
		};
	});
	return {
		valid: true,
		errors: [], warnings: warnings,
		measurement: {id: measurement.id, name: measurement.name, hash: measurement.integrity.hash, sourceFormat: measurement.sourceFormat},
		target: {type: options.target, name: options.target === 'flat' ? 'Flat' : 'Gentle downward tilt', tiltDbPerOctave: options.target === 'flat' ? 0 : (options.tiltDbPerOctave || -1)},
		options: options,
		activeRange: {minimumFrequencyHz: options.minimumFrequencyHz, maximumFrequencyHz: options.maximumFrequencyHz, basis: derivedRange.source},
		smoothing: options.smoothing,
		suggestions: accepted.map(function(item) { var result = clone(item); delete result.band; return result; }),
		prediction: prediction,
		objective: {before: round(objective(smoothed, target, baseFilters, eqModel), 4), after: round(objective(smoothed, target, predictedFilters, eqModel), 4), description: 'Mean squared target error plus filter-count, high-Q and positive-boost penalties.'},
		summary: accepted.length + ' bounded peaking EQ suggestion' + (accepted.length === 1 ? '' : 's') + '. Measured data is unchanged; prediction combines magnitude with simulated electrical PEQ only.',
		algorithmVersion: ALGORITHM_VERSION,
		physicalDeploymentAllowed: false,
		automaticDesignChanges: false
	};
}

function accept(configuration, outputId, analysis, selectedIds, eqModel) {
	if (!analysis || !analysis.valid || analysis.algorithmVersion !== ALGORITHM_VERSION) throw new Error('Generate current EQ suggestions before accepting.');
	var selected = analysis.suggestions.filter(function(item) { return selectedIds.indexOf(item.id) !== -1; });
	if (!selected.length) throw new Error('Select at least one EQ suggestion.');
	var result = clone(configuration);
	var output = result.outputs.find(function(item) { return item.outputId === outputId; });
	if (!output) throw new Error('The selected EQ output is unavailable.');
	if (output.bands.length + selected.length > eqModel.MAX_BANDS_PER_OUTPUT) throw new Error('Accepted suggestions exceed the available EQ band count.');
	selected.forEach(function(suggestion) {
		var id = eqModel.nextBandId(result, outputId);
		output.bands.push({id: id, enabled: true, type: 'peaking', frequencyHz: suggestion.frequencyHz, gainDb: suggestion.gainDb, shape: suggestion.q, label: 'Assisted EQ'});
	});
	return {configuration: result, acceptedSuggestionIds: selected.map(function(item) { return item.id; })};
}

module.exports = {
	ALGORITHM_VERSION: ALGORITHM_VERSION,
	TARGETS: TARGETS,
	SMOOTHING: SMOOTHING,
	DEFAULT_FILTER_LIMIT: DEFAULT_FILTER_LIMIT,
	MAX_FILTER_LIMIT: MAX_FILTER_LIMIT,
	DEFAULT_BOOST_LIMIT_DB: DEFAULT_BOOST_LIMIT_DB,
	MAX_BOOST_LIMIT_DB: MAX_BOOST_LIMIT_DB,
	capabilities: capabilities,
	defaults: defaults,
	interpolate: interpolate,
	analysisGrid: analysisGrid,
	smooth: smooth,
	targetPoints: targetPoints,
	crossoverRange: crossoverRange,
	eligibility: eligibility,
	objective: objective,
	analyse: analyse,
	accept: accept,
	clone: clone
};
