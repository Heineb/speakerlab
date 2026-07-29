'use strict';

var FORMAT = 'org.speakerlab.crossover';
var VERSION = 1;
var DEFAULT_SAMPLE_RATE_HZ = 48000;
var MIN_FREQUENCY_HZ = 10;
var MAX_FREQUENCY_HZ = 20000;
var FAMILIES = {
	'butterworth': {name: 'Butterworth', slopesDbPerOctave: [6, 12, 18, 24]},
	'linkwitz-riley': {name: 'Linkwitz-Riley', slopesDbPerOctave: [12, 24]}
};

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function defaultFilter(type) {
	return {
		enabled: false,
		family: 'butterworth',
		slopeDbPerOctave: 12,
		cutoffHz: type === 'high-pass' ? 80 : 20000
	};
}

function defaultConfiguration(outputIDs, sampleRateHz) {
	return {
		format: FORMAT,
		version: VERSION,
		sampleRateHz: sampleRateHz || DEFAULT_SAMPLE_RATE_HZ,
		outputs: outputIDs.map(function(outputID) {
			return {
				outputId: outputID,
				highPass: defaultFilter('high-pass'),
				lowPass: defaultFilter('low-pass')
			};
		})
	};
}

function normalizeFilter(filter, type) {
	var fallback = defaultFilter(type);
	filter = filter || {};
	return {
		enabled: filter.enabled === undefined ? fallback.enabled : filter.enabled,
		family: filter.family === undefined ? fallback.family : filter.family,
		slopeDbPerOctave: filter.slopeDbPerOctave === undefined ? fallback.slopeDbPerOctave : filter.slopeDbPerOctave,
		cutoffHz: filter.cutoffHz === undefined ? fallback.cutoffHz : filter.cutoffHz
	};
}

function normalize(configuration, outputIDs, sampleRateHz) {
	var fallback = defaultConfiguration(outputIDs, sampleRateHz);
	if (!configuration) return fallback;
	var byID = {};
	if (Array.isArray(configuration.outputs)) {
		configuration.outputs.forEach(function(output) {
			if (output && output.outputId) byID[output.outputId] = output;
		});
	}
	return {
		format: configuration.format,
		version: configuration.version,
		sampleRateHz: configuration.sampleRateHz,
		outputs: outputIDs.map(function(outputID) {
			var output = byID[outputID] || {};
			return {
				outputId: outputID,
				highPass: normalizeFilter(output.highPass, 'high-pass'),
				lowPass: normalizeFilter(output.lowPass, 'low-pass')
			};
		})
	};
}

function capabilities(sampleRateHz) {
	var rate = sampleRateHz || DEFAULT_SAMPLE_RATE_HZ;
	return {
		format: FORMAT,
		version: VERSION,
		sampleRateHz: rate,
		minFrequencyHz: MIN_FREQUENCY_HZ,
		maxFrequencyHz: Math.min(MAX_FREQUENCY_HZ, rate / 2 - 1),
		families: Object.keys(FAMILIES).map(function(id) {
			return {
				id: id,
				name: FAMILIES[id].name,
				slopesDbPerOctave: FAMILIES[id].slopesDbPerOctave.slice()
			};
		})
	};
}

function issue(level, code, message, path) {
	return {level: level, code: code, message: message, path: path || null};
}

function validateFilter(filter, type, path, sampleRateHz, errors) {
	if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
		errors.push(issue('error', 'INVALID_FILTER', 'Filter settings must be an object.', path));
		return;
	}
	if (typeof filter.enabled !== 'boolean') {
		errors.push(issue('error', 'INVALID_FILTER_ENABLED', 'Filter enabled state must be true or false.', path + '.enabled'));
	}
	if (!FAMILIES[filter.family]) {
		errors.push(issue('error', 'UNSUPPORTED_FILTER_FAMILY', 'Select a supported filter family.', path + '.family'));
	} else if (FAMILIES[filter.family].slopesDbPerOctave.indexOf(filter.slopeDbPerOctave) === -1) {
		errors.push(issue('error', 'UNSUPPORTED_FILTER_SLOPE', FAMILIES[filter.family].name + ' does not support this slope.', path + '.slopeDbPerOctave'));
	}
	if (typeof filter.cutoffHz !== 'number' || !isFinite(filter.cutoffHz)) {
		errors.push(issue('error', 'INVALID_CUTOFF', 'Cutoff frequency must be a finite number in hertz.', path + '.cutoffHz'));
	} else if (filter.cutoffHz < MIN_FREQUENCY_HZ || filter.cutoffHz > MAX_FREQUENCY_HZ) {
		errors.push(issue('error', 'CUTOFF_OUT_OF_RANGE', 'Cutoff frequency must be between ' + MIN_FREQUENCY_HZ + ' and ' + MAX_FREQUENCY_HZ + ' Hz.', path + '.cutoffHz'));
	} else if (filter.cutoffHz >= sampleRateHz / 2) {
		errors.push(issue('error', 'CUTOFF_AT_OR_ABOVE_NYQUIST', 'Cutoff frequency must be below the ' + (sampleRateHz / 2) + ' Hz Nyquist frequency.', path + '.cutoffHz'));
	}
}

function validate(configuration, outputIDs, outputModels) {
	var errors = [];
	var warnings = [];
	var known = {};
	var seen = {};
	outputIDs.forEach(function(id) { known[id] = true; });
	if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
		return {valid: false, errors: [issue('error', 'INVALID_CROSSOVER_CONFIGURATION', 'Crossover configuration must be an object.')], warnings: []};
	}
	if (configuration.format !== FORMAT) errors.push(issue('error', 'INVALID_CROSSOVER_FORMAT', 'Crossover configuration format is not supported.', 'crossover.format'));
	if (configuration.version !== VERSION) errors.push(issue('error', 'UNSUPPORTED_CROSSOVER_VERSION', 'Crossover configuration version is not supported.', 'crossover.version'));
	if (typeof configuration.sampleRateHz !== 'number' || !isFinite(configuration.sampleRateHz) || configuration.sampleRateHz <= 0) {
		errors.push(issue('error', 'INVALID_SAMPLE_RATE', 'Crossover sample rate must be a positive number in hertz.', 'crossover.sampleRateHz'));
	}
	var sampleRateHz = configuration.sampleRateHz;
	if (!Array.isArray(configuration.outputs)) {
		errors.push(issue('error', 'INVALID_CROSSOVER_OUTPUTS', 'Crossover outputs must be an array.', 'crossover.outputs'));
	} else {
		configuration.outputs.forEach(function(output, index) {
			var path = 'crossover.outputs[' + index + ']';
			if (!output || typeof output !== 'object' || Array.isArray(output)) {
				errors.push(issue('error', 'INVALID_CROSSOVER_OUTPUT', 'Each crossover output must be an object.', path));
				return;
			}
			if (typeof output.outputId !== 'string' || !output.outputId) {
				errors.push(issue('error', 'MISSING_CROSSOVER_OUTPUT_ID', 'Each crossover needs an output identifier.', path + '.outputId'));
			} else if (!known[output.outputId]) {
				errors.push(issue('error', 'UNKNOWN_CROSSOVER_OUTPUT', 'Crossover settings refer to an unknown output.', path + '.outputId'));
			} else if (seen[output.outputId]) {
				errors.push(issue('error', 'DUPLICATE_CROSSOVER_OUTPUT', 'Each output may have only one crossover configuration.', path + '.outputId'));
			}
			seen[output.outputId] = true;
			validateFilter(output.highPass, 'high-pass', path + '.highPass', sampleRateHz, errors);
			validateFilter(output.lowPass, 'low-pass', path + '.lowPass', sampleRateHz, errors);
			if (output.highPass && output.lowPass && output.highPass.enabled && output.lowPass.enabled &&
				typeof output.highPass.cutoffHz === 'number' && typeof output.lowPass.cutoffHz === 'number') {
				if (output.highPass.cutoffHz >= output.lowPass.cutoffHz) {
					errors.push(issue('error', 'REVERSED_CROSSOVER', 'High-pass cutoff must be lower than low-pass cutoff.', path));
				} else if (output.lowPass.cutoffHz / output.highPass.cutoffHz < 1.25) {
					warnings.push(issue('warning', 'NARROW_PASSBAND', 'The passband between high-pass and low-pass is very narrow.', output.outputId));
				}
			}
			if ((output.highPass && output.highPass.enabled && output.highPass.cutoffHz > sampleRateHz * 0.4) ||
				(output.lowPass && output.lowPass.enabled && output.lowPass.cutoffHz > sampleRateHz * 0.4)) {
				warnings.push(issue('warning', 'CUTOFF_NEAR_NYQUIST', 'A cutoff is unusually close to Nyquist; the preview may be less useful.', output.outputId));
			}
		});
		outputIDs.forEach(function(outputID) {
			if (!seen[outputID]) errors.push(issue('error', 'MISSING_CROSSOVER_OUTPUT', 'Crossover settings are missing for ' + outputID + '.', 'crossover.outputs'));
		});
	}
	(outputModels || []).forEach(function(output) {
		var crossover = configuration.outputs && configuration.outputs.find(function(item) { return item.outputId === output.id; });
		if (!crossover) return;
		var hp = crossover.highPass && crossover.highPass.enabled;
		var lp = crossover.lowPass && crossover.lowPass.enabled;
		if (output.role === 'tweeter' && output.enabled && !hp) warnings.push(issue('warning', 'TWEETER_WITHOUT_HIGH_PASS', output.label + ' has no high-pass filter.', output.id));
		if ((output.role === 'woofer' || output.role === 'subwoofer') && output.enabled && !lp) warnings.push(issue('warning', 'WOOFER_WITHOUT_LOW_PASS', output.label + ' has no low-pass filter.', output.id));
		if (output.role === 'midrange' && output.enabled && (!hp || !lp)) warnings.push(issue('warning', 'MIDRANGE_INCOMPLETE_BAND', output.label + ' needs both high-pass and low-pass filters for a defined band.', output.id));
		if (!output.enabled && (hp || lp)) warnings.push(issue('warning', 'FILTERS_ON_DISABLED_OUTPUT', output.label + ' is disabled but has configured filters.', output.id));
	});
	return {valid: errors.length === 0, errors: errors, warnings: warnings};
}

function firstOrder(type, frequencyHz, sampleRateHz) {
	var k = Math.tan(Math.PI * frequencyHz / sampleRateHz);
	var denominator = 1 + k;
	if (type === 'low-pass') return {b0: k / denominator, b1: k / denominator, b2: 0, a1: (k - 1) / denominator, a2: 0};
	return {b0: 1 / denominator, b1: -1 / denominator, b2: 0, a1: (k - 1) / denominator, a2: 0};
}

function secondOrder(type, frequencyHz, sampleRateHz, q) {
	var omega = 2 * Math.PI * frequencyHz / sampleRateHz;
	var cosine = Math.cos(omega);
	var alpha = Math.sin(omega) / (2 * q);
	var a0 = 1 + alpha;
	var common = type === 'low-pass' ? (1 - cosine) / 2 : (1 + cosine) / 2;
	return {
		b0: common / a0,
		b1: (type === 'low-pass' ? 2 * common : -2 * common) / a0,
		b2: common / a0,
		a1: (-2 * cosine) / a0,
		a2: (1 - alpha) / a0
	};
}

function designFilter(type, filter, sampleRateHz) {
	if (!filter.enabled) return [];
	var order = filter.slopeDbPerOctave / 6;
	var sections = [];
	if (filter.family === 'linkwitz-riley') {
		var baseOrder = order / 2;
		var baseFilter = {enabled: true, family: 'butterworth', slopeDbPerOctave: baseOrder * 6, cutoffHz: filter.cutoffHz};
		var baseSections = designFilter(type, baseFilter, sampleRateHz);
		return baseSections.concat(baseSections.map(function(section) { return clone(section); }));
	}
	if (order % 2) sections.push(firstOrder(type, filter.cutoffHz, sampleRateHz));
	for (var section = 1; section <= Math.floor(order / 2); section++) {
		var q = 1 / (2 * Math.sin((2 * section - 1) * Math.PI / (2 * order)));
		sections.push(secondOrder(type, filter.cutoffHz, sampleRateHz, q));
	}
	sections.forEach(function(coefficients) {
		Object.keys(coefficients).forEach(function(key) {
			if (!isFinite(coefficients[key])) throw new Error('Calculated filter coefficient is not finite.');
		});
	});
	return sections;
}

function sectionResponse(section, frequencyHz, sampleRateHz) {
	var omega = 2 * Math.PI * frequencyHz / sampleRateHz;
	var c1 = Math.cos(omega);
	var s1 = -Math.sin(omega);
	var c2 = Math.cos(2 * omega);
	var s2 = -Math.sin(2 * omega);
	var nr = section.b0 + section.b1 * c1 + section.b2 * c2;
	var ni = section.b1 * s1 + section.b2 * s2;
	var dr = 1 + section.a1 * c1 + section.a2 * c2;
	var di = section.a1 * s1 + section.a2 * s2;
	var denominator = dr * dr + di * di;
	return {real: (nr * dr + ni * di) / denominator, imaginary: (ni * dr - nr * di) / denominator};
}

function filterResponse(sections, frequencyHz, sampleRateHz) {
	var response = {real: 1, imaginary: 0};
	sections.forEach(function(section) {
		var next = sectionResponse(section, frequencyHz, sampleRateHz);
		response = {
			real: response.real * next.real - response.imaginary * next.imaginary,
			imaginary: response.real * next.imaginary + response.imaginary * next.real
		};
	});
	return response;
}

function preview(outputCrossover, sampleRateHz, options) {
	options = options || {};
	var minimum = options.minimumHz || 10;
	var maximum = options.maximumHz || Math.min(20000, sampleRateHz / 2 - 1);
	var count = options.points || 121;
	var highPassSections = designFilter('high-pass', outputCrossover.highPass, sampleRateHz);
	var lowPassSections = designFilter('low-pass', outputCrossover.lowPass, sampleRateHz);
	var points = [];
	for (var index = 0; index < count; index++) {
		var frequencyHz = minimum * Math.pow(maximum / minimum, index / (count - 1));
		var high = filterResponse(highPassSections, frequencyHz, sampleRateHz);
		var low = filterResponse(lowPassSections, frequencyHz, sampleRateHz);
		var real = high.real * low.real - high.imaginary * low.imaginary;
		var imaginary = high.real * low.imaginary + high.imaginary * low.real;
		var magnitude = Math.sqrt(real * real + imaginary * imaginary);
		var magnitudeDb = Math.max(-120, 20 * Math.log10(Math.max(magnitude, 1e-6)));
		if (!isFinite(magnitudeDb)) throw new Error('Calculated response is not finite.');
		points.push({frequencyHz: Number(frequencyHz.toFixed(3)), magnitudeDb: Number(magnitudeDb.toFixed(4))});
	}
	return {
		sampleRateHz: sampleRateHz,
		minimumHz: minimum,
		maximumHz: maximum,
		points: points,
		highPassCutoffHz: outputCrossover.highPass.enabled ? outputCrossover.highPass.cutoffHz : null,
		lowPassCutoffHz: outputCrossover.lowPass.enabled ? outputCrossover.lowPass.cutoffHz : null,
		summary: (!outputCrossover.highPass.enabled && !outputCrossover.lowPass.enabled) ?
			'No electrical crossover filters enabled; simulated response is flat.' :
			'Simulated electrical response only. Does not include driver or enclosure response.'
	};
}

module.exports = {
	FORMAT: FORMAT,
	VERSION: VERSION,
	DEFAULT_SAMPLE_RATE_HZ: DEFAULT_SAMPLE_RATE_HZ,
	MIN_FREQUENCY_HZ: MIN_FREQUENCY_HZ,
	MAX_FREQUENCY_HZ: MAX_FREQUENCY_HZ,
	FAMILIES: FAMILIES,
	defaultFilter: defaultFilter,
	defaultConfiguration: defaultConfiguration,
	normalize: normalize,
	capabilities: capabilities,
	validate: validate,
	designFilter: designFilter,
	filterResponse: filterResponse,
	preview: preview,
	clone: clone
};
