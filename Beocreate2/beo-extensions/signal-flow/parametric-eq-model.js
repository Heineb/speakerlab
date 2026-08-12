'use strict';

var FORMAT = 'org.speakerlab.parametric-eq';
var VERSION = 1;
var SAMPLE_RATE_HZ = 48000;
var MIN_FREQUENCY_HZ = 10;
var MAX_FREQUENCY_HZ = 20000;
var MIN_GAIN_DB = -12;
var MAX_GAIN_DB = 12;
var MIN_SHAPE = 0.1;
var MAX_Q = 10;
var MAX_SHELF_SHAPE = 1;
var MAX_BANDS_PER_OUTPUT = 12;
var TYPES = {
	'peaking': {name: 'Peaking EQ', shapeName: 'Q', minimumShape: MIN_SHAPE, maximumShape: MAX_Q},
	'low-shelf': {name: 'Low shelf', shapeName: 'Shelf slope (S)', minimumShape: MIN_SHAPE, maximumShape: MAX_SHELF_SHAPE},
	'high-shelf': {name: 'High shelf', shapeName: 'Shelf slope (S)', minimumShape: MIN_SHAPE, maximumShape: MAX_SHELF_SHAPE}
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function issue(level, code, message, path) { return {level: level, code: code, message: message, path: path || null}; }
function round(value, places) {
	var scale = Math.pow(10, places);
	return Math.round(value * scale) / scale;
}

function defaultBand(id, type) {
	return {
		id: id,
		enabled: true,
		type: TYPES[type] ? type : 'peaking',
		frequencyHz: 1000,
		gainDb: 0,
		shape: 0.7071,
		label: ''
	};
}

function defaultConfiguration(outputIds) {
	return {
		format: FORMAT,
		version: VERSION,
		sampleRateHz: SAMPLE_RATE_HZ,
		outputs: outputIds.map(function(outputId) { return {outputId: outputId, bands: []}; })
	};
}

function normalizeBand(band) {
	return {
		id: band.id,
		enabled: band.enabled,
		type: band.type,
		frequencyHz: band.frequencyHz,
		gainDb: band.gainDb,
		shape: band.shape,
		label: typeof band.label === 'string' ? band.label : ''
	};
}

function normalize(configuration, outputIds) {
	var fallback = defaultConfiguration(outputIds);
	if (!configuration) return fallback;
	var byId = {};
	if (Array.isArray(configuration.outputs)) configuration.outputs.forEach(function(output) {
		if (output && output.outputId && !byId[output.outputId]) byId[output.outputId] = output;
	});
	return {
		format: configuration.format,
		version: configuration.version,
		sampleRateHz: configuration.sampleRateHz,
		outputs: outputIds.map(function(outputId) {
			var output = byId[outputId];
			return {
				outputId: outputId,
				bands: output && Array.isArray(output.bands) ? output.bands.map(normalizeBand) : []
			};
		})
	};
}

function capabilities() {
	return {
		format: FORMAT,
		version: VERSION,
		sampleRateHz: SAMPLE_RATE_HZ,
		minFrequencyHz: MIN_FREQUENCY_HZ,
		maxFrequencyHz: MAX_FREQUENCY_HZ,
		nyquistHz: SAMPLE_RATE_HZ / 2,
		minGainDb: MIN_GAIN_DB,
		maxGainDb: MAX_GAIN_DB,
		minShape: MIN_SHAPE,
		maxQ: MAX_Q,
		maxShelfShape: MAX_SHELF_SHAPE,
		maxBandsPerOutput: MAX_BANDS_PER_OUTPUT,
		targetSectionsPerOutput: 16,
		coefficientEncoding: 'signed-5.23-fixed-point',
		types: Object.keys(TYPES).map(function(id) {
			return {
				id: id,
				name: TYPES[id].name,
				shapeName: TYPES[id].shapeName,
				minimumShape: TYPES[id].minimumShape,
				maximumShape: TYPES[id].maximumShape
			};
		}),
		targetMapping: 'strongly-evidenced-not-physically-verified'
	};
}

function normalise(a0, a1, a2, b0, b1, b2) {
	return {b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0};
}

function designBand(band, sampleRateHz) {
	if (!band.enabled || band.gainDb === 0) return {b0: 1, b1: 0, b2: 0, a1: 0, a2: 0};
	var omega = 2 * Math.PI * band.frequencyHz / sampleRateHz;
	var cosine = Math.cos(omega);
	var sine = Math.sin(omega);
	var amplitude = Math.pow(10, band.gainDb / 40);
	var alpha;
	var coefficients;
	if (band.type === 'peaking') {
		alpha = sine / (2 * band.shape);
		coefficients = normalise(
			1 + alpha / amplitude,
			-2 * cosine,
			1 - alpha / amplitude,
			1 + alpha * amplitude,
			-2 * cosine,
			1 - alpha * amplitude
		);
	} else {
		alpha = sine / 2 * Math.sqrt((amplitude + 1 / amplitude) * (1 / band.shape - 1) + 2);
		var root = 2 * Math.sqrt(amplitude) * alpha;
		if (band.type === 'low-shelf') {
			coefficients = normalise(
				(amplitude + 1) + (amplitude - 1) * cosine + root,
				-2 * ((amplitude - 1) + (amplitude + 1) * cosine),
				(amplitude + 1) + (amplitude - 1) * cosine - root,
				amplitude * ((amplitude + 1) - (amplitude - 1) * cosine + root),
				2 * amplitude * ((amplitude - 1) - (amplitude + 1) * cosine),
				amplitude * ((amplitude + 1) - (amplitude - 1) * cosine - root)
			);
		} else if (band.type === 'high-shelf') {
			coefficients = normalise(
				(amplitude + 1) - (amplitude - 1) * cosine + root,
				2 * ((amplitude - 1) - (amplitude + 1) * cosine),
				(amplitude + 1) - (amplitude - 1) * cosine - root,
				amplitude * ((amplitude + 1) + (amplitude - 1) * cosine + root),
				-2 * amplitude * ((amplitude - 1) + (amplitude + 1) * cosine),
				amplitude * ((amplitude + 1) + (amplitude - 1) * cosine - root)
			);
		} else {
			throw new Error('Unsupported parametric EQ filter type.');
		}
	}
	Object.keys(coefficients).forEach(function(key) {
		if (!Number.isFinite(coefficients[key])) throw new Error('Calculated EQ coefficient is not finite.');
	});
	if (!stable(coefficients)) throw new Error('Calculated EQ filter is unstable.');
	return coefficients;
}

function stable(section) {
	var discriminant = section.a1 * section.a1 - 4 * section.a2;
	var radius;
	if (discriminant >= 0) {
		radius = Math.max(Math.abs((-section.a1 + Math.sqrt(discriminant)) / 2),
			Math.abs((-section.a1 - Math.sqrt(discriminant)) / 2));
	} else {
		radius = Math.sqrt(Math.abs(section.a2));
	}
	return Number.isFinite(radius) && radius < 1;
}

function responseAt(sections, frequencyHz, sampleRateHz) {
	var response = {real: 1, imaginary: 0};
	sections.forEach(function(section) {
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
		var next = {real: (nr * dr + ni * di) / denominator, imaginary: (ni * dr - nr * di) / denominator};
		response = {
			real: response.real * next.real - response.imaginary * next.imaginary,
			imaginary: response.real * next.imaginary + response.imaginary * next.real
		};
	});
	return response;
}

function magnitudeDb(response) {
	return 20 * Math.log10(Math.max(1e-9, Math.sqrt(response.real * response.real + response.imaginary * response.imaginary)));
}

function preview(outputEq, crossoverOutput, crossoverModel, channelGainDb, options) {
	options = options || {};
	var count = options.points || 121;
	var minimum = options.minimumHz || MIN_FREQUENCY_HZ;
	var maximum = options.maximumHz || MAX_FREQUENCY_HZ;
	var enabledBands = outputEq.bands.filter(function(band) { return band.enabled; });
	var sections = enabledBands.map(function(band) { return designBand(band, SAMPLE_RATE_HZ); });
	var highPass = crossoverOutput ? crossoverModel.designFilter('high-pass', crossoverOutput.highPass, SAMPLE_RATE_HZ) : [];
	var lowPass = crossoverOutput ? crossoverModel.designFilter('low-pass', crossoverOutput.lowPass, SAMPLE_RATE_HZ) : [];
	var crossoverSections = highPass.concat(lowPass);
	var points = [];
	var maximumEqBoostDb = -Infinity;
	for (var index = 0; index < count; index++) {
		var frequencyHz = minimum * Math.pow(maximum / minimum, index / (count - 1));
		var eqDb = magnitudeDb(responseAt(sections, frequencyHz, SAMPLE_RATE_HZ));
		var crossoverDb = magnitudeDb(responseAt(crossoverSections, frequencyHz, SAMPLE_RATE_HZ));
		var combinedDb = eqDb + crossoverDb;
		maximumEqBoostDb = Math.max(maximumEqBoostDb, eqDb);
		points.push({
			frequencyHz: round(frequencyHz, 3),
			eqMagnitudeDb: round(eqDb, 4),
			crossoverMagnitudeDb: round(Math.max(-120, crossoverDb), 4),
			magnitudeDb: round(Math.max(-120, combinedDb), 4)
		});
	}
	maximumEqBoostDb = Math.max(0, maximumEqBoostDb);
	var potentialBoostDb = maximumEqBoostDb + (Number.isFinite(channelGainDb) ? channelGainDb : 0);
	return {
		sampleRateHz: SAMPLE_RATE_HZ,
		minimumHz: minimum,
		maximumHz: maximum,
		points: points,
		bands: enabledBands.map(function(band) {
			return {id: band.id, type: band.type, frequencyHz: band.frequencyHz, gainDb: band.gainDb, shape: band.shape};
		}),
		enabledBands: enabledBands.length,
		maximumBands: MAX_BANDS_PER_OUTPUT,
		maximumEqBoostDb: round(maximumEqBoostDb, 2),
		channelGainDb: channelGainDb || 0,
		potentialBoostDb: round(potentialBoostDb, 2),
		summary: enabledBands.length + ' enabled EQ band' + (enabledBands.length === 1 ? '' : 's') +
			' · Estimated maximum EQ boost ' + round(maximumEqBoostDb, 2) + ' dB · Potential boost with channel gain ' +
			round(potentialBoostDb, 2) + ' dB. Electrical simulation only; does not include driver, enclosure, room or acoustic summation.'
	};
}

function validate(configuration, outputIds, outputs, connections, crossover, crossoverModel) {
	var errors = [];
	var warnings = [];
	var known = {};
	var seenOutputs = {};
	var seenBandIds = {};
	outputIds.forEach(function(id) { known[id] = true; });
	if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
		return {valid: false, errors: [issue('error', 'INVALID_EQ_CONFIGURATION', 'Parametric EQ configuration must be an object.', 'parametricEQ')], warnings: []};
	}
	if (configuration.format !== FORMAT) errors.push(issue('error', 'INVALID_EQ_FORMAT', 'Parametric EQ format is not supported.', 'parametricEQ.format'));
	if (configuration.version !== VERSION) errors.push(issue('error', 'UNSUPPORTED_EQ_VERSION', 'Parametric EQ version is not supported.', 'parametricEQ.version'));
	if (configuration.sampleRateHz !== SAMPLE_RATE_HZ) errors.push(issue('error', 'INVALID_EQ_SAMPLE_RATE', 'Parametric EQ must use the current Beocreate 48 kHz sample rate.', 'parametricEQ.sampleRateHz'));
	if (!Array.isArray(configuration.outputs)) {
		errors.push(issue('error', 'INVALID_EQ_OUTPUTS', 'Parametric EQ outputs must be an array.', 'parametricEQ.outputs'));
	} else configuration.outputs.forEach(function(output, outputIndex) {
		var outputPath = 'parametricEQ.outputs[' + outputIndex + ']';
		if (!output || typeof output !== 'object' || Array.isArray(output)) {
			errors.push(issue('error', 'INVALID_EQ_OUTPUT', 'Each EQ output must be an object.', outputPath));
			return;
		}
		if (!known[output.outputId]) errors.push(issue('error', 'UNKNOWN_EQ_OUTPUT', 'Parametric EQ refers to an unknown output.', outputPath + '.outputId'));
		if (seenOutputs[output.outputId]) errors.push(issue('error', 'DUPLICATE_EQ_OUTPUT', 'Each output may have one EQ collection.', outputPath + '.outputId'));
		seenOutputs[output.outputId] = true;
		if (!Array.isArray(output.bands)) {
			errors.push(issue('error', 'INVALID_EQ_BANDS', 'EQ bands must be an array.', outputPath + '.bands'));
			return;
		}
		if (output.bands.length > MAX_BANDS_PER_OUTPUT) errors.push(issue('error', 'TOO_MANY_EQ_BANDS', 'An output supports at most ' + MAX_BANDS_PER_OUTPUT + ' EQ bands.', outputPath + '.bands'));
		var enabled = 0;
		output.bands.forEach(function(band, bandIndex) {
			var path = outputPath + '.bands[' + bandIndex + ']';
			if (!band || typeof band !== 'object' || Array.isArray(band)) {
				errors.push(issue('error', 'INVALID_EQ_BAND', 'Each EQ band must be an object.', path));
				return;
			}
			if (typeof band.id !== 'string' || !/^eq-[a-z0-9-]+$/.test(band.id)) errors.push(issue('error', 'INVALID_EQ_BAND_ID', 'EQ band needs a stable identifier using letters, numbers and hyphens.', path + '.id'));
			else if (seenBandIds[band.id]) errors.push(issue('error', 'DUPLICATE_EQ_BAND_ID', 'EQ band identifiers must be unique.', path + '.id'));
			else seenBandIds[band.id] = true;
			if (typeof band.enabled !== 'boolean') errors.push(issue('error', 'INVALID_EQ_ENABLED', 'EQ enabled state must be true or false.', path + '.enabled'));
			if (band.enabled) enabled++;
			if (!TYPES[band.type]) errors.push(issue('error', 'UNSUPPORTED_EQ_FILTER_TYPE', 'Select Peaking EQ, Low shelf or High shelf.', path + '.type'));
			if (typeof band.frequencyHz !== 'number' || !Number.isFinite(band.frequencyHz)) errors.push(issue('error', 'INVALID_EQ_FREQUENCY', 'EQ frequency must be a finite number in hertz.', path + '.frequencyHz'));
			else if (band.frequencyHz < MIN_FREQUENCY_HZ || band.frequencyHz > MAX_FREQUENCY_HZ) errors.push(issue('error', 'EQ_FREQUENCY_OUT_OF_RANGE', 'EQ frequency must be between 10 and 20,000 Hz.', path + '.frequencyHz'));
			else if (band.frequencyHz >= SAMPLE_RATE_HZ / 2) errors.push(issue('error', 'EQ_FREQUENCY_AT_NYQUIST', 'EQ frequency must be below the 24,000 Hz Nyquist frequency.', path + '.frequencyHz'));
			else if (band.frequencyHz > 18000) warnings.push(issue('warning', 'EQ_NEAR_NYQUIST', 'EQ band ' + band.id + ' is close to Nyquist.', path + '.frequencyHz'));
			if (typeof band.gainDb !== 'number' || !Number.isFinite(band.gainDb)) errors.push(issue('error', 'INVALID_EQ_GAIN', 'EQ gain must be a finite number in decibels.', path + '.gainDb'));
			else if (band.gainDb < MIN_GAIN_DB || band.gainDb > MAX_GAIN_DB) errors.push(issue('error', 'EQ_GAIN_OUT_OF_RANGE', 'EQ gain must be between −12 and +12 dB.', path + '.gainDb'));
			else if (band.gainDb > 6) warnings.push(issue('warning', 'LARGE_EQ_BOOST', 'EQ band ' + band.id + ' has a large positive boost and may reduce headroom.', path + '.gainDb'));
			if (typeof band.shape !== 'number' || !Number.isFinite(band.shape)) errors.push(issue('error', 'INVALID_EQ_SHAPE', 'EQ Q or shelf shape must be a finite number.', path + '.shape'));
			else if (TYPES[band.type] && (band.shape < TYPES[band.type].minimumShape || band.shape > TYPES[band.type].maximumShape)) {
				errors.push(issue('error', 'EQ_SHAPE_OUT_OF_RANGE', TYPES[band.type].shapeName + ' must be between ' +
					TYPES[band.type].minimumShape + ' and ' + TYPES[band.type].maximumShape + '.', path + '.shape'));
			}
			else {
				if (band.type === 'peaking' && band.shape > 5) warnings.push(issue('warning', 'VERY_HIGH_EQ_Q', 'EQ band ' + band.id + ' has a very narrow Q.', path + '.shape'));
				if (band.type === 'peaking' && band.shape < 0.3) warnings.push(issue('warning', 'VERY_LOW_EQ_Q', 'EQ band ' + band.id + ' has a very broad Q.', path + '.shape'));
			}
			if (typeof band.label !== 'string') errors.push(issue('error', 'INVALID_EQ_LABEL', 'EQ band label must be text.', path + '.label'));
			if (TYPES[band.type] && Number.isFinite(band.frequencyHz) && Number.isFinite(band.gainDb) && Number.isFinite(band.shape) &&
				band.frequencyHz > 0 && band.frequencyHz < SAMPLE_RATE_HZ / 2 && band.shape > 0) {
				try { designBand(band, SAMPLE_RATE_HZ); }
				catch (error) { errors.push(issue('error', 'UNSTABLE_EQ_COEFFICIENTS', 'EQ band ' + band.id + ' cannot produce stable finite coefficients.', path)); }
			}
		});
		var crossoverOutput = crossover && crossover.outputs && crossover.outputs.find(function(item) { return item.outputId === output.outputId; });
		var crossoverSections = 0;
		if (crossoverOutput && crossoverModel) {
			try {
				crossoverSections += crossoverModel.designFilter('high-pass', crossoverOutput.highPass, SAMPLE_RATE_HZ).length;
				crossoverSections += crossoverModel.designFilter('low-pass', crossoverOutput.lowPass, SAMPLE_RATE_HZ).length;
			} catch (_) {}
		}
		if (enabled + crossoverSections > 16) errors.push(issue('error', 'EQ_TARGET_CAPACITY_EXCEEDED',
			'Enabled crossover and EQ filters exceed the current 16-section target bank.', outputPath + '.bands'));
		var outputModel = (outputs || []).find(function(item) { return item.id === output.outputId; });
		var routed = (connections || []).some(function(connection) { return connection.destination === output.outputId && connection.enabled; });
		if (enabled && outputModel && !outputModel.enabled) warnings.push(issue('warning', 'EQ_ON_DISABLED_OUTPUT', outputModel.label + ' has EQ while disabled.', output.outputId));
		if (enabled && !routed) warnings.push(issue('warning', 'EQ_ON_UNROUTED_OUTPUT', (outputModel ? outputModel.label : output.outputId) + ' has EQ without an input.', output.outputId));
		var positive = output.bands.filter(function(band) { return band.enabled && band.gainDb > 0; });
		if (positive.reduce(function(total, band) { return total + band.gainDb; }, 0) > 12) {
			warnings.push(issue('warning', 'EXCESSIVE_CUMULATIVE_EQ_BOOST',
				output.outputId + ' has more than 12 dB of configured positive EQ gain. This is a conservative estimate, not a clipping or driver-safety guarantee.',
				output.outputId));
		}
		for (var first = 0; first < positive.length; first++) for (var second = first + 1; second < positive.length; second++) {
			if (Math.abs(Math.log(positive[first].frequencyHz / positive[second].frequencyHz) / Math.log(2)) < 1) {
				warnings.push(issue('warning', 'OVERLAPPING_EQ_BOOSTS', output.outputId + ' has overlapping positive EQ boosts.', output.outputId));
				first = positive.length;
				break;
			}
		}
	});
	outputIds.forEach(function(id) {
		if (!seenOutputs[id]) errors.push(issue('error', 'MISSING_EQ_OUTPUT', 'Parametric EQ for ' + id + ' is missing.', 'parametricEQ.outputs'));
	});
	warnings.push(issue('warning', 'EQ_TARGET_MAPPING_UNVERIFIED', 'EQ uses the strongly evidenced current-Beocreate IIR bank, but physical mapping and readback remain unverified.', 'parametricEQ'));
	warnings.push(issue('warning', 'EQ_NOT_DEPLOYED', 'Saved parametric EQ is a simulated electrical design and is not physically deployed.', 'parametricEQ'));
	return {valid: errors.length === 0, errors: errors, warnings: warnings};
}

function nextBandId(configuration, outputId) {
	var used = {};
	configuration.outputs.forEach(function(output) { output.bands.forEach(function(band) { used[band.id] = true; }); });
	var index = 1;
	var id;
	do { id = 'eq-' + outputId.replace(/^output-/, '') + '-' + index++; } while (used[id]);
	return id;
}

function output(configuration, outputId) {
	var result = configuration.outputs.find(function(item) { return item.outputId === outputId; });
	if (!result) throw new Error('Unknown EQ output.');
	return result;
}

function addBand(configuration, outputId, type) {
	var result = clone(configuration);
	var target = output(result, outputId);
	if (target.bands.length >= MAX_BANDS_PER_OUTPUT) throw new Error('EQ band capacity reached.');
	var band = defaultBand(nextBandId(result, outputId), type);
	target.bands.push(band);
	return {configuration: result, bandId: band.id};
}

function duplicateBand(configuration, outputId, bandId) {
	var result = clone(configuration);
	var target = output(result, outputId);
	var source = target.bands.find(function(band) { return band.id === bandId; });
	if (!source) throw new Error('EQ band is unavailable.');
	if (target.bands.length >= MAX_BANDS_PER_OUTPUT) throw new Error('EQ band capacity reached.');
	var copy = clone(source);
	copy.id = nextBandId(result, outputId);
	copy.label = copy.label ? copy.label + ' copy' : '';
	target.bands.splice(target.bands.indexOf(source) + 1, 0, copy);
	return {configuration: result, bandId: copy.id};
}

function removeBand(configuration, outputId, bandId) {
	var result = clone(configuration);
	var target = output(result, outputId);
	var prior = target.bands.length;
	target.bands = target.bands.filter(function(band) { return band.id !== bandId; });
	if (prior === target.bands.length) throw new Error('EQ band is unavailable.');
	return result;
}

function copyEQ(configuration, sourceOutputId, destinationOutputId) {
	var result = clone(configuration);
	var source = output(result, sourceOutputId);
	var destination = output(result, destinationOutputId);
	if (source === destination) throw new Error('Choose two different EQ outputs.');
	destination.bands = source.bands.map(function(band, index) {
		var copy = clone(band);
		copy.id = 'eq-' + destinationOutputId.replace(/^output-/, '') + '-' + (index + 1);
		return copy;
	});
	return result;
}

module.exports = {
	FORMAT: FORMAT,
	VERSION: VERSION,
	SAMPLE_RATE_HZ: SAMPLE_RATE_HZ,
	MIN_FREQUENCY_HZ: MIN_FREQUENCY_HZ,
	MAX_FREQUENCY_HZ: MAX_FREQUENCY_HZ,
	MIN_GAIN_DB: MIN_GAIN_DB,
	MAX_GAIN_DB: MAX_GAIN_DB,
	MIN_SHAPE: MIN_SHAPE,
	MAX_Q: MAX_Q,
	MAX_SHELF_SHAPE: MAX_SHELF_SHAPE,
	MAX_BANDS_PER_OUTPUT: MAX_BANDS_PER_OUTPUT,
	TYPES: TYPES,
	defaultBand: defaultBand,
	defaultConfiguration: defaultConfiguration,
	normalize: normalize,
	capabilities: capabilities,
	designBand: designBand,
	stable: stable,
	responseAt: responseAt,
	preview: preview,
	validate: validate,
	nextBandId: nextBandId,
	addBand: addBand,
	duplicateBand: duplicateBand,
	removeBand: removeBand,
	copyEQ: copyEQ,
	clone: clone
};
