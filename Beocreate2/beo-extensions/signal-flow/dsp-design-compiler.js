'use strict';

var crypto = require('crypto');
var routingModel = require('./routing-model');
var targetModel = require('./dsp-target-capability');
var readinessModel = require('./dsp-physical-readiness');

var FORMAT = 'org.speakerlab.dsp-compilation';
var VERSION = 1;
var FULL_SCALE = 16777216;
var FLAT = {b0: 1, b1: 0, b2: 0, a1: 0, a2: 0};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function issue(level, code, message, path) { return {level: level, code: code, message: message, path: path || null}; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fixed(value) {
	if (!Number.isFinite(value)) throw new Error('Cannot encode a non-finite DSP value.');
	var encoded = Math.trunc(value * FULL_SCALE + 0.5);
	return {decoded: encoded / FULL_SCALE, integer: encoded, hex: (encoded >>> 0).toString(16).padStart(8, '0').toUpperCase()};
}
function integer(value) {
	if (!Number.isInteger(value) || value < 0) throw new Error('Cannot encode a non-negative integer DSP value.');
	return {decoded: value, integer: value, hex: (value >>> 0).toString(16).padStart(8, '0').toUpperCase()};
}
function operation(group, logicalField, outputId, target, humanValue, encoded, tolerance, safety, extra) {
	return Object.assign({
		index: null,
		group: group,
		logicalField: logicalField,
		outputId: outputId || null,
		target: target,
		humanValue: humanValue,
		encodedValue: encoded,
		encoding: encoded ? encoded.encoding : 'host-safe-state',
		expectedReadback: encoded ? encoded.decoded : humanValue,
		verificationTolerance: tolerance,
		safetyClassification: safety
	}, extra || {});
}
function encodedFixed(value) { var result = fixed(value); result.encoding = 'signed-5.23-fixed-point'; return result; }
function encodedInteger(value) { var result = integer(value); result.encoding = 'unsigned-integer-parameter'; return result; }
function stable(section) {
	var discriminant = section.a1 * section.a1 - 4 * section.a2;
	var root;
	if (discriminant >= 0) {
		root = Math.max(Math.abs((-section.a1 + Math.sqrt(discriminant)) / 2), Math.abs((-section.a1 - Math.sqrt(discriminant)) / 2));
	} else {
		root = Math.sqrt(Math.abs(section.a2));
	}
	return Number.isFinite(root) && root < 1;
}
function filterWords(section) {
	return [
		encodedFixed(section.b2),
		encodedFixed(section.b1),
		encodedFixed(section.b0),
		encodedFixed(-section.a2),
		encodedFixed(-section.a1)
	];
}

function compile(configuration, options) {
	options = options || {};
	var capability = options.capability || targetModel.capability();
	var identity = targetModel.identify(options.programIdentity);
	var designValidation = routingModel.validate(configuration);
	var canonical = routingModel.normalize(configuration);
	var actualRevision = routingModel.revision(canonical);
	var errors = designValidation.errors.slice();
	var warnings = designValidation.warnings.slice();
	var unsupported = [];
	var operations = [];
	var outputs = [];
	if (options.sourceRevision !== actualRevision) errors.push(issue('error', 'DESIGN_REVISION_MISMATCH', 'The saved design revision changed before compilation.', 'revision'));
	if (!identity.compatible) errors.push(issue('error', 'UNTRUSTED_DSP_PROGRAM', identity.reason, 'target.identity'));
	if (canonical.crossover.sampleRateHz !== capability.identity.sampleRateHz) errors.push(issue('error', 'TARGET_SAMPLE_RATE_MISMATCH', 'Design and target sample rates do not match.', 'crossover.sampleRateHz'));

	operations.push(operation('enter-safe-state', 'safeState.muted', null, 'gpio-amplifier-mute', true, null, 0, 'critical'));
	canonical.outputs.forEach(function(output) {
		var mapping = capability.outputs[output.id];
		var connection = canonical.connections.find(function(item) { return item.destination === output.id && item.enabled; });
		var crossover = canonical.crossover.outputs.find(function(item) { return item.outputId === output.id; });
		var processing = canonical.channelProcessing.outputs.find(function(item) { return item.outputId === output.id; });
		var equaliser = canonical.parametricEQ.outputs.find(function(item) { return item.outputId === output.id; });
		var summary = {outputId: output.id, label: output.label, operations: [], status: 'prepared',
			eqBandsEnabled: equaliser.bands.filter(function(band) { return band.enabled; }).length,
			filterCapacity: capability.crossover.sectionsPerOutput};
		if (!mapping) {
			errors.push(issue('error', 'UNKNOWN_OUTPUT_MAPPING', output.id + ' has no verified target mapping.', output.id));
			unsupported.push({outputId: output.id, field: 'output', reason: 'No verified target mapping.'});
			outputs.push(summary);
			return;
		}
		if (output.enabled && !connection) errors.push(issue('error', 'UNSUPPORTED_ROUTING', output.label + ' is enabled without one representable source.', output.id + '.routing'));
		var source = connection ? connection.source : 'left';
		if (capability.routing.sources[source] === undefined) {
			errors.push(issue('error', 'UNSUPPORTED_ROUTING', output.label + ' uses an unsupported source.', output.id + '.routing'));
			unsupported.push({outputId: output.id, field: 'routing', reason: 'Source is not represented by current metadata.'});
		} else {
			summary.operations.push(operations.length);
			operations.push(operation('routing', 'routing.source', output.id, mapping.routing, output.enabled ? source : 'disabled output retains left selector', encodedInteger(capability.routing.sources[source]), 0, 'audio-routing'));
		}
		var sections = [];
		['highPass', 'lowPass'].forEach(function(filterName) {
			var filter = crossover[filterName];
			var type = filterName === 'highPass' ? 'high-pass' : 'low-pass';
			var designed = [];
			try {
				designed = routingModel.crossoverModel.designFilter(type, filter, capability.identity.sampleRateHz);
			} catch (error) {
				errors.push(issue('error', 'NON_FINITE_ENCODED_VALUE', output.label + ' filter could not be encoded: ' + error.message, output.id + '.crossover.' + filterName));
			}
			designed.forEach(function(section) {
				if (!stable(section)) errors.push(issue('error', 'UNSTABLE_COEFFICIENTS', output.label + ' produced an unstable filter section.', output.id + '.crossover.' + filterName));
				sections.push({section: section, field: 'crossover.' + filterName, requested: clone(filter)});
			});
		});
		equaliser.bands.filter(function(band) { return band.enabled; }).forEach(function(band) {
			try {
				var section = routingModel.eqModel.designBand(band, capability.identity.sampleRateHz);
				if (!stable(section)) errors.push(issue('error', 'UNSTABLE_EQ_COEFFICIENTS', output.label + ' EQ band ' + band.id + ' is unstable.', output.id + '.parametricEQ.' + band.id));
				sections.push({section: section, field: 'parametricEQ.' + band.id, requested: clone(band), bandId: band.id});
			} catch (error) {
				errors.push(issue('error', 'NON_FINITE_EQ_COEFFICIENTS', output.label + ' EQ band ' + band.id + ' could not be encoded: ' + error.message, output.id + '.parametricEQ.' + band.id));
				unsupported.push({outputId: output.id, field: 'parametricEQ.' + band.id, reason: error.message});
			}
		});
		if (output.enabled && output.role === 'tweeter' && !crossover.highPass.enabled) {
			errors.push(issue('error', 'TWEETER_PROTECTION_REQUIRED', output.label + ' requires a verified high-pass before preparation.', output.id + '.crossover.highPass'));
		}
		if (sections.length > capability.crossover.sectionsPerOutput) errors.push(issue('error', 'FILTER_CAPACITY_EXCEEDED', output.label + ' exceeds the current 16-section DSP bank.', output.id + '.crossover'));
		for (var sectionIndex = 0; sectionIndex < capability.crossover.sectionsPerOutput; sectionIndex++) {
			var selected = sections[sectionIndex] || {section: FLAT, field: 'crossover.flat', requested: null};
			var words = filterWords(selected.section);
			if (words.some(function(word) { return !Number.isFinite(word.decoded); })) errors.push(issue('error', 'NON_FINITE_ENCODED_VALUE', 'A filter coefficient could not be encoded.', output.id + '.crossover'));
			var quantization = Math.max.apply(null, words.map(function(word, index) {
				var original = [selected.section.b2, selected.section.b1, selected.section.b0, -selected.section.a2, -selected.section.a1][index];
				return Math.abs(word.decoded - original);
			}));
			if (selected.requested && quantization > 0) warnings.push(issue('warning', 'COEFFICIENT_QUANTIZATION', output.label + ' filter coefficients are quantized to signed 5.23.', output.id + '.' + selected.field));
			summary.operations.push(operations.length);
			operations.push(operation('filter-coefficients', selected.field, output.id, mapping.filters + sectionIndex * 5, selected.requested || 'flat', {
				encoding: 'signed-5.23-fixed-point-array',
				integer: words.map(function(word) { return word.integer; }),
				hex: words.map(function(word) { return word.hex; }),
				decoded: words.map(function(word) { return word.decoded; })
			}, 1 / FULL_SCALE, 'audio-filter', {sectionIndex: sectionIndex, bandId: selected.bandId || null, quantizationDifference: quantization}));
		}
		var gainDb = output.enabled ? processing.gain.valueDb : -Infinity;
		if (output.enabled && !Number.isFinite(gainDb)) {
			errors.push(issue('error', 'NON_FINITE_ENCODED_VALUE', output.label + ' gain is not finite.', output.id + '.gain'));
			gainDb = 0;
		}
		if (gainDb > capability.gain.maximumVerifiedDb) {
			errors.push(issue('error', 'GAIN_ABOVE_VERIFIED_CAPABILITY', output.label + ' uses positive gain, which is not proven safe for this target.', output.id + '.gain'));
			unsupported.push({outputId: output.id, field: 'gain', reason: 'Positive gain is not established by the legacy current-Beocreate path.'});
		}
		var linearGain = output.enabled ? Math.pow(10, Math.min(gainDb, 0) / 20) : 0;
		summary.operations.push(operations.length);
		operations.push(operation('gain', 'processing.gain', output.id, mapping.gain, {requestedDb: processing.gain.valueDb, compiledLinear: linearGain}, encodedFixed(linearGain), 1 / FULL_SCALE, 'audio-gain'));
		var requestedDelayMs = processing.delay.valueMs;
		if (!Number.isFinite(requestedDelayMs)) {
			errors.push(issue('error', 'NON_FINITE_ENCODED_VALUE', output.label + ' delay is not finite.', output.id + '.delay'));
			requestedDelayMs = 0;
		}
		var samples = Math.round(requestedDelayMs / 1000 * capability.identity.sampleRateHz);
		var compiledMs = samples / capability.identity.sampleRateHz * 1000;
		if (samples > capability.delay.maximumSamples) errors.push(issue('error', 'DELAY_OUT_OF_TARGET_RANGE', output.label + ' exceeds target delay capacity.', output.id + '.delay'));
		if (Math.abs(compiledMs - requestedDelayMs) > 0.000001) warnings.push(issue('warning', 'DELAY_QUANTIZATION', output.label + ' delay is rounded to ' + samples + ' whole samples.', output.id + '.delay'));
		summary.operations.push(operations.length);
		operations.push(operation('delay', 'processing.delay', output.id, mapping.delay, {requestedMs: requestedDelayMs, compiledMs: compiledMs, samples: samples}, encodedInteger(samples), 0, 'audio-delay', {
			quantizationDifference: compiledMs - requestedDelayMs,
			distanceDifferenceCm: (compiledMs - requestedDelayMs) / 1000 * 34300
		}));
		summary.operations.push(operations.length);
		operations.push(operation('polarity', 'processing.polarity', output.id, mapping.polarity, processing.polarity.inverted ? 'inverted' : 'normal', encodedInteger(processing.polarity.inverted ? 1 : 0), 0, 'audio-polarity'));
		outputs.push(summary);
	});
	operations.push(operation('leave-safe-state', 'safeState.muted', null, 'gpio-amplifier-mute', false, null, 0, 'critical', {deferredUntilVerified: true}));
	operations.forEach(function(item, index) { item.index = index; });
	var targeted = {};
	operations.forEach(function(item) {
		if (!item.encodedValue || typeof item.target !== 'number') return;
		var width = Array.isArray(item.expectedReadback) ? item.expectedReadback.length : 1;
		for (var address = item.target; address < item.target + width; address++) {
			if (targeted[address] !== undefined) {
				errors.push(issue('error', 'CONFLICTING_PARAMETER_TARGET', 'Two compiled operations target parameter ' + address + '.', item.outputId));
			} else {
				targeted[address] = item.index;
			}
		}
	});
	warnings.push(issue('warning', 'NOT_PHYSICALLY_DEPLOYED', 'This plan is prepared for simulation only and is not deployed to physical hardware.', 'deployment'));
	var compilation = {
		format: FORMAT,
		version: VERSION,
		sourceDesignRevision: options.sourceRevision || null,
		sourceDesignHash: hash(canonical),
		targetCapabilityIdentity: capability.format + '@' + capability.version,
		dspProgramIdentity: identity,
		sampleRateHz: capability.identity.sampleRateHz,
		outputMapping: clone(capability.outputs),
		operations: operations,
		expectedReadback: operations.filter(function(item) { return item.encodedValue && !item.deferredUntilVerified; }).map(function(item) {
			return {operationIndex: item.index, target: item.target, expected: clone(item.expectedReadback), tolerance: item.verificationTolerance};
		}),
		outputs: outputs,
		warnings: warnings,
		errors: errors,
		unsupportedDesignElements: unsupported,
		safetyState: {required: 'muted', leaveSafeStateAllowed: false, reason: 'Complete matching readback is required.'},
		status: errors.length ? 'unsupported' : 'prepared'
	};
	compilation.mappingClassifications = readinessModel.classifyOperations(compilation, capability.physicalReadiness);
	return compilation;
}

function compare(compilation, readback, currentRevision) {
	var stale = currentRevision !== compilation.sourceDesignRevision;
	var values = readback && readback.values ? readback.values : {};
	var items = compilation.expectedReadback.map(function(expected) {
		var key = String(expected.operationIndex);
		if (!readback || readback.available === false || values[key] === undefined) return Object.assign({}, expected, {actual: null, status: 'unavailable'});
		var actual = values[key];
		if (Array.isArray(expected.expected)) {
			if (!Array.isArray(actual) || actual.length !== expected.expected.length || actual.some(function(value) { return !Number.isFinite(value); })) {
				return Object.assign({}, expected, {actual: actual, status: 'invalid'});
			}
			var maximumDifference = Math.max.apply(null, actual.map(function(value, index) { return Math.abs(value - expected.expected[index]); }));
			return Object.assign({}, expected, {actual: actual, difference: maximumDifference, status:
				maximumDifference === 0 ? 'matched' : maximumDifference <= expected.tolerance ? 'acceptable-quantization' : 'different'});
		}
		if (!Number.isFinite(actual)) return Object.assign({}, expected, {actual: actual, status: 'invalid'});
		var difference = Math.abs(actual - expected.expected);
		return Object.assign({}, expected, {actual: actual, difference: difference, status:
			difference === 0 ? 'matched' : difference <= expected.tolerance ? 'acceptable-quantization' : 'different'});
	});
	var overall = stale ? 'unknown' : items.some(function(item) { return item.status === 'different' || item.status === 'invalid'; }) ? 'different' :
		items.some(function(item) { return item.status === 'unavailable'; }) ? 'unknown' : 'matched';
	return {status: overall, stale: stale, items: items, physicallyDeployed: false};
}

module.exports = {
	FORMAT: FORMAT,
	VERSION: VERSION,
	FULL_SCALE: FULL_SCALE,
	fixed: fixed,
	filterWords: filterWords,
	compile: compile,
	compare: compare
};
