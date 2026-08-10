'use strict';

var FORMAT = 'org.speakerlab.driver-protection';
var VERSION = 1;
var LIMITER_MODE = 'peak-voltage';
var MIN_IMPEDANCE_OHMS = 1;
var MAX_IMPEDANCE_OHMS = 64;
var MAX_POWER_WATTS = 10000;
var MAX_VOLTAGE = 200;
var MIN_ATTACK_MS = 0.1;
var MAX_ATTACK_MS = 1000;
var MIN_RELEASE_MS = 10;
var MAX_RELEASE_MS = 10000;
var MIN_SAFETY_MARGIN_DB = -12;
var MAX_SAFETY_MARGIN_DB = 0;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function round(value, places) {
	var scale = Math.pow(10, places);
	return Math.round(value * scale) / scale;
}
function finitePositive(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
function optionalNumber(value) { return value === undefined || value === null || value === '' ? null : Number(value); }
function issue(level, code, message, path) { return {level: level, code: code, message: message, path: path || null}; }

function rmsVoltageFromPower(powerWatts, impedanceOhms) {
	if (!finitePositive(powerWatts) || !finitePositive(impedanceOhms)) throw new Error('Power and impedance must be finite positive values.');
	return Math.sqrt(powerWatts * impedanceOhms);
}

function powerFromRmsVoltage(voltageRms, impedanceOhms) {
	if (!finitePositive(voltageRms) || !finitePositive(impedanceOhms)) throw new Error('RMS voltage and impedance must be finite positive values.');
	return voltageRms * voltageRms / impedanceOhms;
}

function peakVoltageFromRms(voltageRms) {
	if (!finitePositive(voltageRms)) throw new Error('RMS voltage must be a finite positive value.');
	return voltageRms * Math.sqrt(2);
}

function rmsVoltageFromPeak(voltagePeak) {
	if (!finitePositive(voltagePeak)) throw new Error('Peak voltage must be a finite positive value.');
	return voltagePeak / Math.sqrt(2);
}

function dbToVoltageRatio(valueDb) {
	if (typeof valueDb !== 'number' || !Number.isFinite(valueDb)) throw new Error('Decibels must be finite.');
	return Math.pow(10, valueDb / 20);
}

function voltageRatioToDb(ratio) {
	if (!finitePositive(ratio)) throw new Error('Voltage ratio must be finite and positive.');
	return 20 * Math.log10(ratio);
}

function applySafetyMargin(voltage, marginDb) {
	if (!finitePositive(voltage)) throw new Error('Voltage must be finite and positive.');
	return voltage * dbToVoltageRatio(marginDb);
}

function defaultOutput(outputId) {
	return {
		outputId: outputId,
		driver: {
			manufacturer: '',
			model: '',
			nominalImpedanceOhms: null,
			continuousPowerWatts: null,
			shortTermPowerWatts: null,
			notes: '',
			source: 'user-entered'
		},
		amplifier: {
			maximumRmsVoltage: null,
			maximumPeakVoltage: null,
			gainDb: null,
			channelAssignment: '',
			source: 'user-entered'
		},
		limiter: {
			enabled: false,
			mode: LIMITER_MODE,
			thresholdPeakVoltage: null,
			configuredRmsVoltageLimit: null,
			safetyMarginDb: -3,
			attackMs: 5,
			releaseMs: 250,
			source: 'user-entered'
		}
	};
}

function defaultConfiguration(outputIds) {
	return {format: FORMAT, version: VERSION, outputs: outputIds.map(defaultOutput)};
}

function normalize(configuration, outputIds) {
	var source = configuration && Array.isArray(configuration.outputs) ? configuration.outputs : [];
	return {
		format: configuration && configuration.format === FORMAT ? FORMAT : FORMAT,
		version: configuration && configuration.version === VERSION ? VERSION : VERSION,
		outputs: outputIds.map(function(outputId) {
			var fallback = defaultOutput(outputId);
			var item = source.find(function(candidate) { return candidate && candidate.outputId === outputId; }) || {};
			var driver = item.driver || {};
			var amplifier = item.amplifier || {};
			var limiter = item.limiter || {};
			return {
				outputId: outputId,
				driver: {
					manufacturer: typeof driver.manufacturer === 'string' ? driver.manufacturer.slice(0, 120) : fallback.driver.manufacturer,
					model: typeof driver.model === 'string' ? driver.model.slice(0, 120) : fallback.driver.model,
					nominalImpedanceOhms: optionalNumber(driver.nominalImpedanceOhms),
					continuousPowerWatts: optionalNumber(driver.continuousPowerWatts),
					shortTermPowerWatts: optionalNumber(driver.shortTermPowerWatts),
					notes: typeof driver.notes === 'string' ? driver.notes.slice(0, 1000) : fallback.driver.notes,
					source: typeof driver.source === 'string' ? driver.source.slice(0, 120) : fallback.driver.source
				},
				amplifier: {
					maximumRmsVoltage: optionalNumber(amplifier.maximumRmsVoltage),
					maximumPeakVoltage: optionalNumber(amplifier.maximumPeakVoltage),
					gainDb: optionalNumber(amplifier.gainDb),
					channelAssignment: typeof amplifier.channelAssignment === 'string' ? amplifier.channelAssignment.slice(0, 120) : '',
					source: typeof amplifier.source === 'string' ? amplifier.source.slice(0, 120) : fallback.amplifier.source
				},
				limiter: {
					enabled: limiter.enabled === true,
					mode: limiter.mode || LIMITER_MODE,
					thresholdPeakVoltage: optionalNumber(limiter.thresholdPeakVoltage),
					configuredRmsVoltageLimit: optionalNumber(limiter.configuredRmsVoltageLimit),
					safetyMarginDb: limiter.safetyMarginDb === undefined ? fallback.limiter.safetyMarginDb : Number(limiter.safetyMarginDb),
					attackMs: limiter.attackMs === undefined ? fallback.limiter.attackMs : Number(limiter.attackMs),
					releaseMs: limiter.releaseMs === undefined ? fallback.limiter.releaseMs : Number(limiter.releaseMs),
					source: typeof limiter.source === 'string' ? limiter.source.slice(0, 120) : fallback.limiter.source
				}
			};
		})
	};
}

function validateOptionalPositive(errors, value, maximum, code, label, path) {
	if (value === null || value === undefined) return;
	if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(issue('error', 'INVALID_' + code, label + ' must be a finite number.', path));
	else if (value <= 0 || value > maximum) errors.push(issue('error', code + '_OUT_OF_RANGE', label + ' must be above zero and no more than ' + maximum + '.', path));
}

function calculateOutput(protectionOutput, designContext) {
	var driver = protectionOutput.driver;
	var amplifier = protectionOutput.amplifier;
	var limiter = protectionOutput.limiter;
	var impedance = driver.nominalImpedanceOhms;
	var continuousRms = finitePositive(driver.continuousPowerWatts) && finitePositive(impedance) ? rmsVoltageFromPower(driver.continuousPowerWatts, impedance) : null;
	var shortTermRms = finitePositive(driver.shortTermPowerWatts) && finitePositive(impedance) ? rmsVoltageFromPower(driver.shortTermPowerWatts, impedance) : null;
	var rawPeak = finitePositive(limiter.thresholdPeakVoltage) ? limiter.thresholdPeakVoltage : null;
	var effectivePeak = rawPeak === null ? null : applySafetyMargin(rawPeak, limiter.safetyMarginDb);
	var effectiveRms = effectivePeak === null ? null : rmsVoltageFromPeak(effectivePeak);
	var configuredPower = finitePositive(limiter.configuredRmsVoltageLimit) && finitePositive(impedance) ? powerFromRmsVoltage(limiter.configuredRmsVoltageLimit, impedance) : null;
	var candidates = [];
	if (continuousRms !== null) candidates.push({id: 'driver-continuous-rating', voltsRms: continuousRms});
	if (finitePositive(amplifier.maximumRmsVoltage)) candidates.push({id: 'amplifier-rms-limit', voltsRms: amplifier.maximumRmsVoltage});
	if (finitePositive(amplifier.maximumPeakVoltage)) candidates.push({id: 'amplifier-peak-limit', voltsRms: rmsVoltageFromPeak(amplifier.maximumPeakVoltage)});
	if (finitePositive(limiter.configuredRmsVoltageLimit)) candidates.push({id: 'configured-rms-limit', voltsRms: limiter.configuredRmsVoltageLimit});
	if (effectiveRms !== null) candidates.push({id: 'limiter-after-margin', voltsRms: effectiveRms});
	var limiting = candidates.sort(function(a, b) { return a.voltsRms - b.voltsRms; })[0] || null;
	var headroom = designContext || {};
	var channelGainDb = Number.isFinite(headroom.channelGainDb) ? headroom.channelGainDb : 0;
	var maximumEqBoostDb = Number.isFinite(headroom.maximumEqBoostDb) ? headroom.maximumEqBoostDb : 0;
	var maximumElectricalGainDb = Number.isFinite(headroom.maximumElectricalGainDb) ? headroom.maximumElectricalGainDb : channelGainDb + maximumEqBoostDb;
	var thresholdDbfs = effectivePeak !== null && finitePositive(amplifier.maximumPeakVoltage) ? voltageRatioToDb(effectivePeak / amplifier.maximumPeakVoltage) : null;
	return {
		outputId: protectionOutput.outputId,
		driverContinuousRmsVoltage: continuousRms === null ? null : round(continuousRms, 4),
		driverContinuousPeakVoltage: continuousRms === null ? null : round(peakVoltageFromRms(continuousRms), 4),
		driverShortTermRmsVoltage: shortTermRms === null ? null : round(shortTermRms, 4),
		configuredRmsPowerWatts: configuredPower === null ? null : round(configuredPower, 4),
		rawThresholdPeakVoltage: rawPeak,
		effectiveThresholdPeakVoltage: effectivePeak === null ? null : round(effectivePeak, 4),
		effectiveThresholdRmsVoltage: effectiveRms === null ? null : round(effectiveRms, 4),
		limitingFactor: limiting ? limiting.id : 'unresolved',
		limitingRmsVoltage: limiting ? round(limiting.voltsRms, 4) : null,
		channelGainDb: round(channelGainDb, 2),
		maximumEqBoostDb: round(maximumEqBoostDb, 2),
		potentialNetBoostDb: round(channelGainDb + maximumEqBoostDb, 2),
		maximumElectricalGainDb: round(maximumElectricalGainDb, 2),
		remainingConfiguredHeadroomDb: thresholdDbfs === null ? null : round(thresholdDbfs - Math.max(0, maximumElectricalGainDb), 2),
		simulatorThresholdDbfs: thresholdDbfs === null ? null : round(Math.min(0, thresholdDbfs), 4),
		dspVoltageMappingResolved: false,
		sineWaveAssumption: true,
		acousticPrediction: false
	};
}

function validate(configuration, outputIds, outputs, crossoverConfiguration, contexts) {
	var errors = [];
	var warnings = [];
	if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return {valid: false, errors: [issue('error', 'INVALID_PROTECTION_CONFIGURATION', 'Driver protection must be an object.', 'driverProtection')], warnings: []};
	if (configuration.format !== FORMAT) errors.push(issue('error', 'INVALID_PROTECTION_FORMAT', 'Driver protection format is not supported.', 'driverProtection.format'));
	if (configuration.version !== VERSION) errors.push(issue('error', 'UNSUPPORTED_PROTECTION_VERSION', 'Driver protection version is not supported.', 'driverProtection.version'));
	if (!Array.isArray(configuration.outputs)) return {valid: false, errors: errors.concat([issue('error', 'INVALID_PROTECTION_OUTPUTS', 'Driver protection outputs must be an array.', 'driverProtection.outputs')]), warnings: warnings};
	var seen = {};
	configuration.outputs.forEach(function(item, index) {
		var path = 'driverProtection.outputs[' + index + ']';
		if (!item || typeof item !== 'object' || outputIds.indexOf(item.outputId) === -1 || seen[item.outputId]) {
			errors.push(issue('error', 'UNKNOWN_PROTECTION_OUTPUT', 'Protection must refer to one known output exactly once.', path));
			return;
		}
		seen[item.outputId] = true;
		var driver = item.driver || {};
		var amplifier = item.amplifier || {};
		var limiter = item.limiter || {};
		validateOptionalPositive(errors, driver.nominalImpedanceOhms, MAX_IMPEDANCE_OHMS, 'IMPEDANCE', 'Nominal impedance in ohms', path + '.driver.nominalImpedanceOhms');
		if (driver.nominalImpedanceOhms !== null && driver.nominalImpedanceOhms < MIN_IMPEDANCE_OHMS) errors.push(issue('error', 'IMPEDANCE_OUT_OF_RANGE', 'Nominal impedance must be at least 1 ohm.', path + '.driver.nominalImpedanceOhms'));
		validateOptionalPositive(errors, driver.continuousPowerWatts, MAX_POWER_WATTS, 'CONTINUOUS_POWER', 'Continuous power in watts', path + '.driver.continuousPowerWatts');
		validateOptionalPositive(errors, driver.shortTermPowerWatts, MAX_POWER_WATTS, 'SHORT_TERM_POWER', 'Short-term power in watts', path + '.driver.shortTermPowerWatts');
		validateOptionalPositive(errors, amplifier.maximumRmsVoltage, MAX_VOLTAGE, 'AMPLIFIER_RMS_VOLTAGE', 'Amplifier maximum RMS voltage', path + '.amplifier.maximumRmsVoltage');
		validateOptionalPositive(errors, amplifier.maximumPeakVoltage, MAX_VOLTAGE, 'AMPLIFIER_PEAK_VOLTAGE', 'Amplifier maximum peak voltage', path + '.amplifier.maximumPeakVoltage');
		if (amplifier.gainDb !== null && (typeof amplifier.gainDb !== 'number' || !Number.isFinite(amplifier.gainDb) || amplifier.gainDb < 0 || amplifier.gainDb > 60)) errors.push(issue('error', 'INVALID_AMPLIFIER_GAIN', 'Amplifier gain must be between 0 and 60 dB.', path + '.amplifier.gainDb'));
		if (finitePositive(amplifier.maximumRmsVoltage) && finitePositive(amplifier.maximumPeakVoltage) && amplifier.maximumPeakVoltage < amplifier.maximumRmsVoltage) errors.push(issue('error', 'IMPOSSIBLE_AMPLIFIER_VOLTAGE_RELATIONSHIP', 'Amplifier maximum peak voltage cannot be below its RMS voltage.', path + '.amplifier.maximumPeakVoltage'));
		if (limiter.mode !== LIMITER_MODE) errors.push(issue('error', 'UNSUPPORTED_LIMITER_MODE', 'Version 1 supports only an explicit peak-voltage limiter.', path + '.limiter.mode'));
		if (typeof limiter.enabled !== 'boolean') errors.push(issue('error', 'INVALID_LIMITER_ENABLED', 'Limiter enabled state must be true or false.', path + '.limiter.enabled'));
		validateOptionalPositive(errors, limiter.thresholdPeakVoltage, MAX_VOLTAGE, 'LIMITER_THRESHOLD', 'Limiter threshold in volts peak', path + '.limiter.thresholdPeakVoltage');
		validateOptionalPositive(errors, limiter.configuredRmsVoltageLimit, MAX_VOLTAGE, 'RMS_VOLTAGE_LIMIT', 'Configured RMS voltage limit', path + '.limiter.configuredRmsVoltageLimit');
		if (typeof limiter.attackMs !== 'number' || !Number.isFinite(limiter.attackMs) || limiter.attackMs < MIN_ATTACK_MS || limiter.attackMs > MAX_ATTACK_MS) errors.push(issue('error', 'INVALID_LIMITER_ATTACK', 'Attack must be between 0.1 and 1,000 ms.', path + '.limiter.attackMs'));
		if (typeof limiter.releaseMs !== 'number' || !Number.isFinite(limiter.releaseMs) || limiter.releaseMs < MIN_RELEASE_MS || limiter.releaseMs > MAX_RELEASE_MS) errors.push(issue('error', 'INVALID_LIMITER_RELEASE', 'Release must be between 10 and 10,000 ms.', path + '.limiter.releaseMs'));
		if (typeof limiter.safetyMarginDb !== 'number' || !Number.isFinite(limiter.safetyMarginDb) || limiter.safetyMarginDb < MIN_SAFETY_MARGIN_DB || limiter.safetyMarginDb > MAX_SAFETY_MARGIN_DB) errors.push(issue('error', 'INVALID_SAFETY_MARGIN', 'Safety margin must be between −12 and 0 dB.', path + '.limiter.safetyMarginDb'));
		if (limiter.enabled && !finitePositive(limiter.thresholdPeakVoltage)) errors.push(issue('error', 'MISSING_LIMITER_THRESHOLD', 'An enabled limiter requires a peak-voltage threshold.', path + '.limiter.thresholdPeakVoltage'));
		var calculation = calculateOutput(item, contexts && contexts[item.outputId]);
		if (!limiter.enabled && !driver.nominalImpedanceOhms && !driver.continuousPowerWatts && !amplifier.maximumPeakVoltage && !amplifier.maximumRmsVoltage) warnings.push(issue('warning', 'NO_PROTECTION_CONFIGURED', item.outputId + ' has no protection configuration.', item.outputId));
		if (!finitePositive(amplifier.maximumPeakVoltage) && !finitePositive(amplifier.maximumRmsVoltage)) warnings.push(issue('warning', 'NO_AMPLIFIER_VOLTAGE_LIMIT', item.outputId + ' has no amplifier voltage limit.', item.outputId));
		if (!finitePositive(driver.continuousPowerWatts)) warnings.push(issue('warning', 'NO_DRIVER_RATING', item.outputId + ' has no user-entered continuous-power rating.', item.outputId));
		if (finitePositive(limiter.thresholdPeakVoltage) && finitePositive(amplifier.maximumPeakVoltage) && calculation.effectiveThresholdPeakVoltage > amplifier.maximumPeakVoltage) warnings.push(issue('warning', 'LIMIT_EXCEEDS_AMPLIFIER', item.outputId + ' limiter threshold after margin exceeds the entered amplifier maximum.', item.outputId));
		if (calculation.driverContinuousPeakVoltage && calculation.effectiveThresholdPeakVoltage > calculation.driverContinuousPeakVoltage) warnings.push(issue('warning', 'LIMIT_EXCEEDS_DRIVER_RATING', item.outputId + ' limiter threshold exceeds the sine-derived continuous-power voltage.', item.outputId));
		if (calculation.potentialNetBoostDb > 6) warnings.push(issue('warning', 'LARGE_POTENTIAL_BOOST', item.outputId + ' has more than 6 dB potential gain and EQ boost.', item.outputId));
		var output = (outputs || []).find(function(candidate) { return candidate.id === item.outputId; });
		var crossover = crossoverConfiguration && crossoverConfiguration.outputs && crossoverConfiguration.outputs.find(function(candidate) { return candidate.outputId === item.outputId; });
		if (output && output.role === 'tweeter' && (!crossover || !crossover.highPass.enabled)) warnings.push(issue('warning', 'PROTECTION_TWEETER_WITHOUT_HIGH_PASS', output.label + ' is a tweeter without a high-pass. This is a design-risk indication, not automatic protection.', item.outputId));
		if (output && (output.role === 'woofer' || output.role === 'subwoofer') && (!crossover || !crossover.lowPass.enabled)) warnings.push(issue('warning', 'PROTECTION_WOOFER_WITHOUT_LOW_PASS', output.label + ' has no low-pass where one may be expected.', item.outputId));
		if (limiter.enabled) {
			warnings.push(issue('warning', 'MANUFACTURER_RATING_NOT_GUARANTEE', 'Manufacturer ratings do not establish a universally safe operating limit.', item.outputId));
			warnings.push(issue('warning', 'LIMITER_MAPPING_UNKNOWN', 'No per-output limiter mapping or readback is verified for the current Beocreate DSP.', item.outputId));
			warnings.push(issue('warning', 'WRITE_SIDE_SAFETY_UNVERIFIED', 'Physical limiter writes, readback and rollback remain unavailable.', item.outputId));
			warnings.push(issue('warning', 'PROTECTION_SIMULATOR_ONLY', 'Limiter behavior is a simplified simulator estimate and is not physically deployed.', item.outputId));
		}
	});
	outputIds.forEach(function(id) { if (!seen[id]) errors.push(issue('error', 'MISSING_PROTECTION_OUTPUT', 'Protection for ' + id + ' is missing.', 'driverProtection.outputs')); });
	return {valid: errors.length === 0, errors: errors, warnings: warnings};
}

function simulateLimiter(limiter, thresholdDbfs, sequence) {
	if (!Array.isArray(sequence)) throw new Error('Synthetic level sequence must be an array.');
	if (!limiter.enabled) return {supported: true, enabled: false, thresholdDbfs: thresholdDbfs, points: sequence.map(function(point) { return {inputDbfs: point.levelDbfs, durationMs: point.durationMs, gainReductionDb: 0, outputDbfs: point.levelDbfs}; })};
	if (!Number.isFinite(thresholdDbfs)) return {supported: false, enabled: true, reason: 'Amplifier maximum peak voltage is required to express the voltage threshold as normalized dBFS.', points: []};
	var reduction = 0;
	var points = sequence.map(function(point, index) {
		if (!Number.isFinite(point.levelDbfs) || !finitePositive(point.durationMs)) throw new Error('Synthetic levels and durations must be finite.');
		var required = Math.max(0, point.levelDbfs - thresholdDbfs);
		var timeConstant = required > reduction ? limiter.attackMs : limiter.releaseMs;
		var coefficient = 1 - Math.exp(-point.durationMs / timeConstant);
		reduction += (required - reduction) * coefficient;
		return {index: index, inputDbfs: point.levelDbfs, durationMs: point.durationMs, requiredGainReductionDb: round(required, 4), gainReductionDb: round(reduction, 4), outputDbfs: round(point.levelDbfs - reduction, 4)};
	});
	return {supported: true, enabled: true, thresholdDbfs: round(thresholdDbfs, 4), model: 'first-order-level-envelope', attackMs: limiter.attackMs, releaseMs: limiter.releaseMs, points: points, audioGenerated: false};
}

function capabilities() {
	return {
		format: FORMAT,
		version: VERSION,
		limiterModes: [LIMITER_MODE],
		impedanceOhms: {minimum: MIN_IMPEDANCE_OHMS, maximum: MAX_IMPEDANCE_OHMS},
		powerWatts: {minimumExclusive: 0, maximum: MAX_POWER_WATTS},
		voltage: {minimumExclusive: 0, maximum: MAX_VOLTAGE},
		attackMs: {minimum: MIN_ATTACK_MS, maximum: MAX_ATTACK_MS},
		releaseMs: {minimum: MIN_RELEASE_MS, maximum: MAX_RELEASE_MS},
		safetyMarginDb: {minimum: MIN_SAFETY_MARGIN_DB, maximum: MAX_SAFETY_MARGIN_DB, presets: [0, -1, -3]},
		targetMapping: 'unsupported-unverified',
		targetReadback: 'unavailable',
		simulator: 'first-order-level-envelope'
	};
}

module.exports = {
	FORMAT: FORMAT, VERSION: VERSION, LIMITER_MODE: LIMITER_MODE,
	rmsVoltageFromPower: rmsVoltageFromPower, powerFromRmsVoltage: powerFromRmsVoltage,
	peakVoltageFromRms: peakVoltageFromRms, rmsVoltageFromPeak: rmsVoltageFromPeak,
	dbToVoltageRatio: dbToVoltageRatio, voltageRatioToDb: voltageRatioToDb,
	applySafetyMargin: applySafetyMargin, defaultOutput: defaultOutput,
	defaultConfiguration: defaultConfiguration, normalize: normalize, validate: validate,
	calculateOutput: calculateOutput, simulateLimiter: simulateLimiter, capabilities: capabilities,
	clone: clone
};
