'use strict';

var FORMAT = 'org.speakerlab.channel-processing';
var VERSION = 1;
var SAMPLE_RATE_HZ = 48000;
var MAX_DELAY_SAMPLES = 2000;
var MIN_GAIN_DB = -60;
var MAX_GAIN_DB = 6;
var SPEED_OF_SOUND_M_PER_S = 343;

function round(value, places) {
	var factor = Math.pow(10, places);
	return Math.round(value * factor) / factor;
}

function millisecondsToSamples(valueMs, sampleRateHz) {
	return Math.round(valueMs / 1000 * sampleRateHz);
}

function samplesToMilliseconds(samples, sampleRateHz) {
	return round(samples / sampleRateHz * 1000, 6);
}

function millisecondsToDistance(valueMs, unit) {
	var metres = valueMs / 1000 * SPEED_OF_SOUND_M_PER_S;
	return round(unit === 'cm' ? metres * 100 : metres, unit === 'cm' ? 2 : 4);
}

function distanceToMilliseconds(value, unit) {
	var metres = unit === 'cm' ? value / 100 : value;
	return round(metres / SPEED_OF_SOUND_M_PER_S * 1000, 6);
}

function normalizeGain(value) {
	return round(Number(value), 2);
}

function normalizePolarity(value) {
	if (value === true || value === false) return value;
	throw new Error('Polarity inverted state must be true or false.');
}

function defaultOutput(outputId) {
	return {
		outputId: outputId,
		gain: {valueDb: 0},
		delay: {valueMs: 0},
		polarity: {inverted: false}
	};
}

function defaultConfiguration(outputIds) {
	return {
		format: FORMAT,
		version: VERSION,
		sampleRateHz: SAMPLE_RATE_HZ,
		outputs: outputIds.map(defaultOutput)
	};
}

function normalize(configuration, outputIds) {
	var source = configuration && Array.isArray(configuration.outputs) ? configuration.outputs : [];
	return {
		format: FORMAT,
		version: VERSION,
		sampleRateHz: SAMPLE_RATE_HZ,
		outputs: outputIds.map(function(outputId) {
			var item = source.find(function(candidate) { return candidate.outputId === outputId; }) || defaultOutput(outputId);
			return {
				outputId: outputId,
				gain: {valueDb: normalizeGain(item.gain && item.gain.valueDb)},
				delay: {valueMs: round(Number(item.delay && item.delay.valueMs), 6)},
				polarity: {inverted: item.polarity && item.polarity.inverted === true}
			};
		})
	};
}

function issue(level, code, message, path) {
	return {level: level, code: code, message: message, path: path || null};
}

function validate(configuration, outputIds, outputs, connections) {
	var errors = [];
	var warnings = [];
	if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
		return {valid: false, errors: [issue('error', 'INVALID_PROCESSING', 'Channel processing must be an object.', 'channelProcessing')], warnings: []};
	}
	if (configuration.format !== FORMAT) errors.push(issue('error', 'INVALID_PROCESSING_FORMAT', 'Channel processing format is not supported.', 'channelProcessing.format'));
	if (configuration.version !== VERSION) errors.push(issue('error', 'UNSUPPORTED_PROCESSING_VERSION', 'Channel processing version is not supported.', 'channelProcessing.version'));
	if (configuration.sampleRateHz !== SAMPLE_RATE_HZ) errors.push(issue('error', 'INVALID_PROCESSING_SAMPLE_RATE', 'Channel processing sample rate must be 48,000 Hz.', 'channelProcessing.sampleRateHz'));
	if (!Array.isArray(configuration.outputs)) {
		errors.push(issue('error', 'INVALID_PROCESSING_OUTPUTS', 'Channel processing outputs must be an array.', 'channelProcessing.outputs'));
		return {valid: false, errors: errors, warnings: warnings};
	}
	var byId = {};
	configuration.outputs.forEach(function(item, index) {
		var path = 'channelProcessing.outputs[' + index + ']';
		if (!item || typeof item !== 'object' || outputIds.indexOf(item.outputId) === -1 || byId[item.outputId]) {
			errors.push(issue('error', 'UNKNOWN_PROCESSING_OUTPUT', 'Processing must refer to one known output exactly once.', path));
			return;
		}
		byId[item.outputId] = item;
		var gain = item.gain && item.gain.valueDb;
		if (typeof gain !== 'number' || !Number.isFinite(gain)) errors.push(issue('error', 'INVALID_GAIN', 'Gain must be a finite number.', path + '.gain.valueDb'));
		else if (gain < MIN_GAIN_DB || gain > MAX_GAIN_DB) errors.push(issue('error', 'GAIN_OUT_OF_RANGE', 'Gain must be between -60 dB and +6 dB.', path + '.gain.valueDb'));
		else {
			if (gain > 0) warnings.push(issue('warning', 'POSITIVE_GAIN_HEADROOM', item.outputId + ' has positive gain and may reduce available headroom.', item.outputId));
			if (gain <= -50) warnings.push(issue('warning', 'VERY_LOW_GAIN', item.outputId + ' is close to muted at this gain.', item.outputId));
		}
		var delay = item.delay && item.delay.valueMs;
		if (typeof delay !== 'number' || !Number.isFinite(delay)) errors.push(issue('error', 'INVALID_DELAY', 'Delay must be a finite number in milliseconds.', path + '.delay.valueMs'));
		else if (delay < 0) errors.push(issue('error', 'NEGATIVE_DELAY', 'Delay cannot be negative.', path + '.delay.valueMs'));
		else {
			var samples = millisecondsToSamples(delay, SAMPLE_RATE_HZ);
			if (delay > samplesToMilliseconds(MAX_DELAY_SAMPLES, SAMPLE_RATE_HZ)) errors.push(issue('error', 'DELAY_OUT_OF_RANGE', 'Delay exceeds the current Beocreate capability of 2,000 samples.', path + '.delay.valueMs'));
			if (delay > 20) warnings.push(issue('warning', 'LONG_DELAY', item.outputId + ' has an unusually long delay.', item.outputId));
			if (Math.abs(samplesToMilliseconds(samples, SAMPLE_RATE_HZ) - delay) > 0.000001) warnings.push(issue('warning', 'DELAY_ROUNDED_TO_SAMPLE', item.outputId + ' delay is rounded to the nearest sample for diagnostics.', item.outputId));
		}
		if (!item.polarity || typeof item.polarity.inverted !== 'boolean') errors.push(issue('error', 'INVALID_POLARITY', 'Polarity must be Normal or Inverted.', path + '.polarity.inverted'));
		var output = (outputs || []).find(function(candidate) { return candidate.id === item.outputId; });
		var routed = (connections || []).some(function(connection) { return connection.destination === item.outputId && connection.enabled; });
		var activeProcessing = gain !== 0 || delay !== 0 || (item.polarity && item.polarity.inverted);
		if (activeProcessing && output && !output.enabled) warnings.push(issue('warning', 'PROCESSING_ON_DISABLED_OUTPUT', output.label + ' has processing while disabled.', item.outputId));
		if (activeProcessing && !routed) warnings.push(issue('warning', 'PROCESSING_ON_UNROUTED_OUTPUT', (output ? output.label : item.outputId) + ' has processing without an input.', item.outputId));
	});
	outputIds.forEach(function(id) {
		if (!byId[id]) errors.push(issue('error', 'MISSING_PROCESSING_OUTPUT', 'Processing for ' + id + ' is missing.', 'channelProcessing.outputs'));
	});
	var groups = {};
	(outputs || []).forEach(function(output) {
		if (output.side === 'left' || output.side === 'right') {
			var key = output.role;
			groups[key] = groups[key] || {};
			groups[key][output.side] = byId[output.id];
		}
	});
	Object.keys(groups).forEach(function(role) {
		var pair = groups[role];
		if (!pair.left || !pair.right) return;
		if (!pair.left.gain || !pair.right.gain || typeof pair.left.gain.valueDb !== 'number' || typeof pair.right.gain.valueDb !== 'number') return;
		if (!pair.left.delay || !pair.right.delay || typeof pair.left.delay.valueMs !== 'number' || typeof pair.right.delay.valueMs !== 'number') return;
		if (!pair.left.polarity || !pair.right.polarity || typeof pair.left.polarity.inverted !== 'boolean' || typeof pair.right.polarity.inverted !== 'boolean') return;
		if (Math.abs(pair.left.gain.valueDb - pair.right.gain.valueDb) > 0.5) warnings.push(issue('warning', 'STEREO_GAIN_MISMATCH', 'Left and right ' + role + ' gain settings differ.', role));
		if (Math.abs(pair.left.delay.valueMs - pair.right.delay.valueMs) > 0.1) warnings.push(issue('warning', 'STEREO_DELAY_MISMATCH', 'Left and right ' + role + ' delay settings differ.', role));
		if (pair.left.polarity.inverted !== pair.right.polarity.inverted) warnings.push(issue('warning', 'STEREO_POLARITY_MISMATCH', 'Left and right ' + role + ' polarity settings differ.', role));
	});
	warnings.push(issue('warning', 'PROCESSING_NOT_DEPLOYED', 'Saved gain, delay and polarity are simulated design settings and are not deployed to hardware.', 'channelProcessing'));
	return {valid: errors.length === 0, errors: errors, warnings: warnings};
}

function capabilities() {
	return {
		format: FORMAT,
		version: VERSION,
		gain: {minimumDb: MIN_GAIN_DB, maximumDb: MAX_GAIN_DB},
		delay: {
			minimumMs: 0,
			maximumMs: samplesToMilliseconds(MAX_DELAY_SAMPLES, SAMPLE_RATE_HZ),
			maximumSamples: MAX_DELAY_SAMPLES,
			sampleRateHz: SAMPLE_RATE_HZ,
			speedOfSoundMetresPerSecond: SPEED_OF_SOUND_M_PER_S,
			units: ['ms', 'cm', 'm']
		},
		polarity: {states: ['normal', 'inverted']}
	};
}

module.exports = {
	FORMAT: FORMAT,
	VERSION: VERSION,
	SAMPLE_RATE_HZ: SAMPLE_RATE_HZ,
	MAX_DELAY_SAMPLES: MAX_DELAY_SAMPLES,
	MIN_GAIN_DB: MIN_GAIN_DB,
	MAX_GAIN_DB: MAX_GAIN_DB,
	SPEED_OF_SOUND_M_PER_S: SPEED_OF_SOUND_M_PER_S,
	millisecondsToSamples: millisecondsToSamples,
	samplesToMilliseconds: samplesToMilliseconds,
	millisecondsToDistance: millisecondsToDistance,
	distanceToMilliseconds: distanceToMilliseconds,
	normalizeGain: normalizeGain,
	normalizePolarity: normalizePolarity,
	defaultConfiguration: defaultConfiguration,
	normalize: normalize,
	validate: validate,
	capabilities: capabilities
};
