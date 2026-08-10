'use strict';

var crypto = require('crypto');

var ALGORITHM_VERSION = 'speakerlab-assisted-crossover-v1';
var MIN_POINTS = 12;
var GRID_POINTS = 61;
var MAX_SUGGESTIONS = 3;
var MIN_OVERLAP_OCTAVES = 0.5;
var MAX_DELAY_ADJUSTMENT_MS = 0.75;
var ROLE_ORDER = {subwoofer: 0, woofer: 1, midrange: 2, tweeter: 3};
var SUPPORTED_ROLE_PAIRS = {'subwoofer|woofer': true, 'woofer|midrange': true, 'woofer|tweeter': true, 'midrange|tweeter': true};
var TEMPLATES = [
	{family: 'linkwitz-riley', slopeDbPerOctave: 24, complexityPenalty: 0, label: 'Linkwitz-Riley 4th order'},
	{family: 'linkwitz-riley', slopeDbPerOctave: 12, complexityPenalty: 0.18, label: 'Linkwitz-Riley 2nd order'},
	{family: 'butterworth', slopeDbPerOctave: 12, complexityPenalty: 0.32, label: 'Butterworth 2nd order'}
];

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function round(value, places) { var scale = Math.pow(10, places); return Math.round(value * scale) / scale; }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function issue(level, code, message) { return {level: level, code: code, message: message}; }
function median(values) {
	if (!values.length) return null;
	var sorted = values.slice().sort(function(a, b) { return a - b; });
	var middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function rms(values) { return values.length ? Math.sqrt(values.reduce(function(total, value) { return total + value * value; }, 0) / values.length) : 0; }
function hash(points) { return crypto.createHash('sha256').update(JSON.stringify(points)).digest('hex'); }
function multiply(a, b) { return {real: a.real * b.real - a.imaginary * b.imaginary, imaginary: a.real * b.imaginary + a.imaginary * b.real}; }
function polar(magnitude, phaseDegrees) { var radians = phaseDegrees * Math.PI / 180; return {real: magnitude * Math.cos(radians), imaginary: magnitude * Math.sin(radians)}; }
function magnitudeDb(value) { return 20 * Math.log10(Math.max(1e-9, Math.sqrt(value.real * value.real + value.imaginary * value.imaginary))); }
function powerSumDb(aDb, bDb) { return 10 * Math.log10(Math.pow(10, aDb / 10) + Math.pow(10, bDb / 10)); }

function capabilities(crossoverModel, processingModel) {
	return {
		algorithmVersion: ALGORITHM_VERSION,
		minimumPoints: MIN_POINTS,
		maximumSuggestions: MAX_SUGGESTIONS,
		minimumOverlapOctaves: MIN_OVERLAP_OCTAVES,
		families: TEMPLATES.map(function(item) { return {family: item.family, slopeDbPerOctave: item.slopeDbPerOctave, order: item.slopeDbPerOctave / 6}; }),
		delay: {maximumSuggestedAdjustmentMs: MAX_DELAY_ADJUSTMENT_MS, targetCapability: processingModel.capabilities().delay},
		crossoverCapabilities: crossoverModel.capabilities(),
		physicalDeploymentAllowed: false,
		automaticDesignChanges: false
	};
}

function staleMerge(measurement, measurements) {
	if (!measurement || !measurement.mergeRecipe) return false;
	var recipe = measurement.mergeRecipe;
	var low = measurements.find(function(item) { return item.id === recipe.lowSourceId; });
	var high = measurements.find(function(item) { return item.id === recipe.highSourceId; });
	return !low || !high || !low.integrity || !high.integrity || low.integrity.hash !== recipe.lowSourceHash || high.integrity.hash !== recipe.highSourceHash;
}

function validateSource(measurement, measurements, outputIDs, label) {
	var errors = [], warnings = [];
	if (!measurement) return {errors: [issue('error', 'MISSING_CROSSOVER_SOURCE', 'Select both driver measurements.')], warnings: []};
	if (!measurement.integrity || measurement.integrity.hash !== hash(measurement.points || [])) errors.push(issue('error', 'CROSSOVER_SOURCE_INTEGRITY_MISMATCH', label + ' failed its source integrity check.'));
	if (!measurement.assignedOutputId || outputIDs.indexOf(measurement.assignedOutputId) === -1) errors.push(issue('error', 'UNIDENTIFIABLE_CROSSOVER_OUTPUT', label + ' must be assigned to a known output.'));
	if (!Array.isArray(measurement.points) || measurement.points.length < MIN_POINTS) errors.push(issue('error', 'INSUFFICIENT_CROSSOVER_POINTS', label + ' has too few usable points.'));
	if (measurement.validation && measurement.validation.state === 'invalid') errors.push(issue('error', 'INVALID_CROSSOVER_SOURCE', label + ' is invalid.'));
	if (staleMerge(measurement, measurements)) errors.push(issue('error', 'STALE_CROSSOVER_SOURCE', label + ' is stale and must be recomputed.'));
	if (measurement.type === 'unknown') warnings.push(issue('warning', 'UNKNOWN_CROSSOVER_SOURCE_TYPE', label + ' has an unknown measurement type.'));
	if (measurement.type === 'in-room' || measurement.type === 'listening-position') warnings.push(issue('warning', 'ROOM_CROSSOVER_SOURCE', label + ' includes room and placement effects.'));
	if (measurement.sourceFormat === 'derived-merge') warnings.push(issue('warning', 'DERIVED_MAGNITUDE_SOURCE', label + ' is a derived magnitude-only response; phase-aware analysis is unavailable for that source.'));
	return {errors: errors, warnings: warnings};
}

function orderedPair(configuration, first, second) {
	var outputA = configuration.outputs.find(function(item) { return item.id === first.assignedOutputId; });
	var outputB = configuration.outputs.find(function(item) { return item.id === second.assignedOutputId; });
	if (!outputA || !outputB || ROLE_ORDER[outputA.role] === undefined || ROLE_ORDER[outputB.role] === undefined || outputA.role === outputB.role) return null;
	var ordered = ROLE_ORDER[outputA.role] < ROLE_ORDER[outputB.role] ? {low: first, high: second, lowOutput: outputA, highOutput: outputB} : {low: second, high: first, lowOutput: outputB, highOutput: outputA};
	return SUPPORTED_ROLE_PAIRS[ordered.lowOutput.role + '|' + ordered.highOutput.role] ? ordered : null;
}

function timingClassification(low, high, phaseModel) {
	var phaseAvailable = low.units && high.units && low.units.phase === 'degrees' && high.units.phase === 'degrees' &&
		low.sourceFormat !== 'derived-merge' && high.sourceFormat !== 'derived-merge';
	if (!phaseAvailable) return {mode: 'magnitude-only', classification: 'unavailable', confidence: 'reduced', statement: 'Phase or timing information is unavailable; this is a magnitude-based crossover suggestion.', warnings: []};
	var compatibility = phaseModel.referenceCompatibility(low, high);
	if (compatibility.valid) return {mode: 'phase-aware', classification: 'user-declared-compatible', confidence: compatibility.mode === 'relative-phase-derived' ? 'reduced' : 'moderate',
		statement: 'Timing references are user-declared compatible and cannot be acoustically verified by SpeakerLab.', warnings: compatibility.warnings};
	return {mode: 'magnitude-only', classification: 'uncertain', confidence: 'reduced', statement: 'Timing references are uncertain or incompatible; complex acoustic summation, polarity and delay are not claimed.', warnings: compatibility.errors.map(function(item) { return issue('warning', item.code, item.message); })};
}

function candidateRange(configuration, low, high, currentFrequencyHz) {
	var minimum = Math.max(low.points[0].frequencyHz, high.points[0].frequencyHz, 10);
	var maximum = Math.min(low.points[low.points.length - 1].frequencyHz, high.points[high.points.length - 1].frequencyHz, 20000);
	var lowOutput = configuration.outputs.find(function(item) { return item.id === low.assignedOutputId; });
	var highOutput = configuration.outputs.find(function(item) { return item.id === high.assignedOutputId; });
	if (highOutput && highOutput.role === 'tweeter') minimum = Math.max(minimum, 800);
	if (highOutput && highOutput.role === 'midrange') minimum = Math.max(minimum, 120);
	if (lowOutput && (lowOutput.role === 'woofer' || lowOutput.role === 'subwoofer')) maximum = Math.min(maximum, 8000);
	if (lowOutput && lowOutput.role === 'midrange') maximum = Math.min(maximum, 12000);
	var octaves = maximum > minimum ? Math.log(maximum / minimum) / Math.LN2 : 0;
	return {valid: maximum > minimum && octaves >= MIN_OVERLAP_OCTAVES, minimumFrequencyHz: round(minimum, 3), maximumFrequencyHz: round(maximum, 3), overlapOctaves: round(octaves, 3),
		currentCrossoverFrequencyHz: currentFrequencyHz && currentFrequencyHz >= minimum && currentFrequencyHz <= maximum ? round(currentFrequencyHz, 3) : null};
}

function currentCrossoverFrequency(configuration, lowOutputID, highOutputID) {
	var low = configuration.crossover.outputs.find(function(item) { return item.outputId === lowOutputID; });
	var high = configuration.crossover.outputs.find(function(item) { return item.outputId === highOutputID; });
	var values = [];
	if (low && low.lowPass.enabled) values.push(low.lowPass.cutoffHz);
	if (high && high.highPass.enabled) values.push(high.highPass.cutoffHz);
	return values.length ? Math.exp(values.reduce(function(total, value) { return total + Math.log(value); }, 0) / values.length) : null;
}

function eligibility(configuration, first, second, phaseModel) {
	var outputIDs = configuration.outputs.map(function(item) { return item.id; });
	var a = validateSource(first, configuration.measurements.measurements, outputIDs, 'First measurement');
	var b = validateSource(second, configuration.measurements.measurements, outputIDs, 'Second measurement');
	var errors = a.errors.concat(b.errors), warnings = a.warnings.concat(b.warnings);
	if (first && second && first.id === second.id) errors.push(issue('error', 'DUPLICATE_CROSSOVER_SOURCE', 'Choose two different measurements.'));
	if (first && second && first.assignedOutputId === second.assignedOutputId) errors.push(issue('error', 'SAME_CROSSOVER_OUTPUT', 'The measurements must represent two different outputs.'));
	var pair = first && second ? orderedPair(configuration, first, second) : null;
	if (!pair) errors.push(issue('error', 'NON_ADJACENT_DRIVER_PAIR', 'Choose two different low/high driver roles such as woofer and tweeter or adjacent woofer/midrange/tweeter ways.'));
	var timing = pair ? timingClassification(pair.low, pair.high, phaseModel) : null;
	if (timing) warnings = warnings.concat(timing.warnings);
	var current = pair ? currentCrossoverFrequency(configuration, pair.low.assignedOutputId, pair.high.assignedOutputId) : null;
	var range = pair ? candidateRange(configuration, pair.low, pair.high, current) : null;
	if (range && !range.valid) errors.push(issue('error', 'NO_USEFUL_CROSSOVER_OVERLAP', 'The measurements do not have enough reliable overlap for a crossover suggestion.'));
	if (range && range.valid && range.overlapOctaves < 1) warnings.push(issue('warning', 'NARROW_CROSSOVER_OVERLAP', 'The usable crossover overlap is narrow; alternatives are limited.'));
	return {eligible: errors.length === 0, errors: errors, warnings: warnings, pair: pair, timing: timing, candidateRange: range};
}

function logGrid(minimum, maximum, count) {
	var result = [];
	for (var index = 0; index < count; index++) result.push(minimum * Math.pow(maximum / minimum, index / (count - 1)));
	return result;
}

function electricalResponse(configuration, outputID, frequencyHz, models, crossoverOverride, processingOverride) {
	var crossover = crossoverOverride || configuration.crossover.outputs.find(function(item) { return item.outputId === outputID; });
	var eq = configuration.parametricEQ.outputs.find(function(item) { return item.outputId === outputID; });
	var processing = processingOverride || configuration.channelProcessing.outputs.find(function(item) { return item.outputId === outputID; });
	var response = {real: 1, imaginary: 0};
	if (crossover) {
		var sections = models.crossover.designFilter('high-pass', crossover.highPass, models.processing.SAMPLE_RATE_HZ)
			.concat(models.crossover.designFilter('low-pass', crossover.lowPass, models.processing.SAMPLE_RATE_HZ));
		response = multiply(response, models.crossover.filterResponse(sections, frequencyHz, models.processing.SAMPLE_RATE_HZ));
	}
	if (eq) {
		var eqSections = eq.bands.filter(function(band) { return band.enabled; }).map(function(band) { return models.eq.designBand(band, models.processing.SAMPLE_RATE_HZ); });
		response = multiply(response, models.eq.responseAt(eqSections, frequencyHz, models.processing.SAMPLE_RATE_HZ));
	}
	if (processing) response = multiply(response, polar(Math.pow(10, processing.gain.valueDb / 20), -360 * frequencyHz * processing.delay.valueMs / 1000 + (processing.polarity.inverted ? 180 : 0)));
	return response;
}

function sourceValue(measurement, phasePoints, frequencyHz, phaseModel) {
	var magnitude = phaseModel.interpolate(measurement.points, frequencyHz, 'magnitudeDb');
	if (magnitude === null || !Number.isFinite(magnitude)) return null;
	var phase = phasePoints ? phaseModel.interpolate(phasePoints, frequencyHz, 'phaseDegrees') : null;
	return {magnitudeDb: magnitude, phaseDegrees: phase};
}

function suggestedAlignment(configuration, pair, range, timing, models) {
	if (timing.mode !== 'phase-aware') return null;
	var phaseLow = models.phase.unwrapPhase(pair.low.points.map(function(point) { return {frequencyHz: point.frequencyHz, phaseDegrees: point.phaseDegrees}; }));
	var phaseHigh = models.phase.unwrapPhase(pair.high.points.map(function(point) { return {frequencyHz: point.frequencyHz, phaseDegrees: point.phaseDegrees}; }));
	if (!phaseLow.valid || !phaseHigh.valid) return null;
	var relative = logGrid(range.minimumFrequencyHz, range.maximumFrequencyHz, GRID_POINTS).map(function(frequency) {
		var low = sourceValue(pair.low, phaseLow.points, frequency, models.phase), high = sourceValue(pair.high, phaseHigh.points, frequency, models.phase);
		if (!low || !high) return null;
		var lowElectrical = electricalResponse(configuration, pair.low.assignedOutputId, frequency, models, {highPass: {enabled: false}, lowPass: {enabled: false}});
		var highElectrical = electricalResponse(configuration, pair.high.assignedOutputId, frequency, models, {highPass: {enabled: false}, lowPass: {enabled: false}});
		var lowPhase = low.phaseDegrees + Math.atan2(lowElectrical.imaginary, lowElectrical.real) * 180 / Math.PI;
		var highPhase = high.phaseDegrees + Math.atan2(highElectrical.imaginary, highElectrical.real) * 180 / Math.PI;
		return {frequencyHz: frequency, phaseDegrees: highPhase - lowPhase};
	}).filter(Boolean);
	var unwrapped = models.phase.unwrapPhase(relative);
	if (!unwrapped.valid) return null;
	var fit = models.phase.robustLineFit(unwrapped.points);
	if (!fit.valid || fit.quality < 0.55) return {usable: false, quality: fit.valid ? fit.quality : 0, residualPhaseDegrees: fit.valid ? fit.residualDegrees : null, warning: issue('warning', 'CROSSOVER_DELAY_EVIDENCE_WEAK', 'Phase timing is too inconsistent for a responsible delay suggestion.')};
	var adjustment = Math.abs(fit.delayMs);
	if (adjustment > MAX_DELAY_ADJUSTMENT_MS) return {usable: false, quality: fit.quality, residualPhaseDegrees: fit.residualDegrees, warning: issue('warning', 'CROSSOVER_DELAY_TOO_LARGE', 'The inferred delay adjustment is too large for conservative crossover assistance; use the dedicated alignment workflow.')};
	var targetOutputID = fit.delayMs >= 0 ? pair.low.assignedOutputId : pair.high.assignedOutputId;
	var processing = configuration.channelProcessing.outputs.find(function(item) { return item.outputId === targetOutputID; });
	var resulting = processing.delay.valueMs + adjustment;
	if (resulting > models.processing.capabilities().delay.maximumMs) return {usable: false, quality: fit.quality, residualPhaseDegrees: fit.residualDegrees, warning: issue('warning', 'CROSSOVER_DELAY_CAPABILITY', 'The inferred delay would exceed the current output capability.')};
	return {usable: true, outputId: targetOutputID, adjustmentMs: round(adjustment, 6), resultingDelayMs: round(resulting, 6), quality: round(fit.quality, 3), residualPhaseDegrees: round(fit.residualDegrees, 3)};
}

function crossoverFor(configuration, outputID, type, frequencyHz, template) {
	var current = clone(configuration.crossover.outputs.find(function(item) { return item.outputId === outputID; }));
	current[type] = {enabled: true, family: template.family, slopeDbPerOctave: template.slopeDbPerOctave, cutoffHz: round(frequencyHz, 3)};
	return current;
}

function evaluateCandidate(configuration, pair, range, timing, frequencyHz, template, alignment, models) {
	var lowCrossover = crossoverFor(configuration, pair.low.assignedOutputId, 'lowPass', frequencyHz, template);
	var highCrossover = crossoverFor(configuration, pair.high.assignedOutputId, 'highPass', frequencyHz, template);
	var lowPhase = timing.mode === 'phase-aware' ? models.phase.unwrapPhase(pair.low.points.map(function(point) { return {frequencyHz: point.frequencyHz, phaseDegrees: point.phaseDegrees}; })).points : null;
	var highPhase = timing.mode === 'phase-aware' ? models.phase.unwrapPhase(pair.high.points.map(function(point) { return {frequencyHz: point.frequencyHz, phaseDegrees: point.phaseDegrees}; })).points : null;
	var processingLow = clone(configuration.channelProcessing.outputs.find(function(item) { return item.outputId === pair.low.assignedOutputId; }));
	var processingHigh = clone(configuration.channelProcessing.outputs.find(function(item) { return item.outputId === pair.high.assignedOutputId; }));
	var polarityOutputId = alignment && alignment.usable ? alignment.outputId : pair.high.assignedOutputId;
	if (alignment && alignment.usable) {
		var target = alignment.outputId === processingLow.outputId ? processingLow : processingHigh;
		target.delay.valueMs = alignment.resultingDelayMs;
	}
	function prediction(targetInverted) {
		var points = [];
		if (timing.mode === 'phase-aware') {
			var targetProcessing = polarityOutputId === processingLow.outputId ? processingLow : processingHigh;
			targetProcessing.polarity.inverted = targetInverted;
		}
		logGrid(range.minimumFrequencyHz, range.maximumFrequencyHz, GRID_POINTS).forEach(function(frequency) {
			var low = sourceValue(pair.low, lowPhase, frequency, models.phase), high = sourceValue(pair.high, highPhase, frequency, models.phase);
			var lowElectrical = electricalResponse(configuration, pair.low.assignedOutputId, frequency, models, lowCrossover, processingLow);
			var highElectrical = electricalResponse(configuration, pair.high.assignedOutputId, frequency, models, highCrossover, processingHigh);
			var lowDb = low.magnitudeDb + magnitudeDb(lowElectrical), highDb = high.magnitudeDb + magnitudeDb(highElectrical);
			var sumDb;
			if (timing.mode === 'phase-aware') {
				var lowValue = multiply(polar(Math.pow(10, low.magnitudeDb / 20), low.phaseDegrees), lowElectrical);
				var highValue = multiply(polar(Math.pow(10, high.magnitudeDb / 20), high.phaseDegrees), highElectrical);
				sumDb = magnitudeDb({real: lowValue.real + highValue.real, imaginary: lowValue.imaginary + highValue.imaginary});
			} else sumDb = powerSumDb(lowDb, highDb);
			points.push({frequencyHz: round(frequency, 3), lowDriverDb: round(lowDb, 4), highDriverDb: round(highDb, 4), sumDb: round(sumDb, 4)});
		});
		return points;
	}
	var normal = prediction(false), inverted = timing.mode === 'phase-aware' ? prediction(true) : null;
	var normalMean = median(normal.map(function(point) { return point.sumDb; }));
	var invertedMean = inverted ? median(inverted.map(function(point) { return point.sumDb; })) : null;
	var normalVariation = rms(normal.map(function(point) { return point.sumDb - normalMean; }));
	var invertedVariation = inverted ? rms(inverted.map(function(point) { return point.sumDb - invertedMean; })) : null;
	var useInverted = inverted && invertedVariation + 0.05 < normalVariation;
	var chosen = useInverted ? inverted : normal, reference = median(chosen.map(function(point) { return point.sumDb; }));
	var minimumSum = Math.min.apply(null, chosen.map(function(point) { return point.sumDb; }));
	var maximumSum = Math.max.apply(null, chosen.map(function(point) { return point.sumDb; }));
	var cancellation = timing.mode === 'phase-aware' ? Math.max.apply(null, chosen.map(function(point) { return Math.max(point.lowDriverDb, point.highDriverDb) - point.sumDb; })) : 0;
	var levelMismatch = median(chosen.map(function(point) { return Math.abs(point.lowDriverDb - point.highDriverDb); }));
	var components = {
		smoothness: round(rms(chosen.map(function(point) { return point.sumDb - reference; })), 6),
		cancellation: round(Math.max(0, cancellation), 6),
		gap: round(Math.max(0, reference - minimumSum - 3), 6),
		overlap: round(Math.max(0, maximumSum - reference - 3), 6),
		phase: timing.mode === 'phase-aware' && alignment ? round((1 - (alignment.quality || 0)) * 2, 6) : 0,
		delay: alignment && alignment.usable ? round(alignment.adjustmentMs / MAX_DELAY_ADJUSTMENT_MS * 0.3, 6) : 0,
		complexity: template.complexityPenalty,
		levelMismatch: round(Math.max(0, levelMismatch - 3) * 0.08, 6)
	};
	var score = Object.keys(components).reduce(function(total, key) { return total + components[key]; }, 0);
	return {frequencyHz: round(frequencyHz, 3), family: template.family, slopeDbPerOctave: template.slopeDbPerOctave, order: template.slopeDbPerOctave / 6,
		templateLabel: template.label, score: round(score, 6), scoreComponents: components, predictedSummationQuality: score <= 2 ? 'stronger' : score <= 4 ? 'usable' : 'cautious',
		polarityInverted: timing.mode === 'phase-aware' ? !!useInverted : null, prediction: chosen, alternativePrediction: inverted ? (useInverted ? normal : inverted) : null,
		polarityOutputId: timing.mode === 'phase-aware' ? polarityOutputId : null, levelMismatchDb: round(levelMismatch, 3), lowCrossover: lowCrossover, highCrossover: highCrossover};
}

function rankCandidates(candidates) {
	return candidates.slice().sort(function(a, b) { return a.score - b.score || a.frequencyHz - b.frequencyHz || a.slopeDbPerOctave - b.slopeDbPerOctave || a.family.localeCompare(b.family); });
}

function chooseBounded(candidates) {
	var ranked = rankCandidates(candidates), selected = [];
	ranked.forEach(function(candidate) {
		if (selected.length >= MAX_SUGGESTIONS) return;
		if (selected.some(function(item) { return Math.abs(Math.log(item.frequencyHz / candidate.frequencyHz) / Math.LN2) < 0.18; })) return;
		selected.push(candidate);
	});
	return selected;
}

function currentPrediction(configuration, pair, range, timing, models) {
	var lowPhase = timing.mode === 'phase-aware' ? models.phase.unwrapPhase(pair.low.points.map(function(point) { return {frequencyHz: point.frequencyHz, phaseDegrees: point.phaseDegrees}; })).points : null;
	var highPhase = timing.mode === 'phase-aware' ? models.phase.unwrapPhase(pair.high.points.map(function(point) { return {frequencyHz: point.frequencyHz, phaseDegrees: point.phaseDegrees}; })).points : null;
	return logGrid(range.minimumFrequencyHz, range.maximumFrequencyHz, GRID_POINTS).map(function(frequency) {
		var low = sourceValue(pair.low, lowPhase, frequency, models.phase), high = sourceValue(pair.high, highPhase, frequency, models.phase);
		var lowElectrical = electricalResponse(configuration, pair.low.assignedOutputId, frequency, models);
		var highElectrical = electricalResponse(configuration, pair.high.assignedOutputId, frequency, models);
		var lowDb = low.magnitudeDb + magnitudeDb(lowElectrical), highDb = high.magnitudeDb + magnitudeDb(highElectrical), sum;
		if (timing.mode === 'phase-aware') {
			var lv = multiply(polar(Math.pow(10, low.magnitudeDb / 20), low.phaseDegrees), lowElectrical);
			var hv = multiply(polar(Math.pow(10, high.magnitudeDb / 20), high.phaseDegrees), highElectrical);
			sum = magnitudeDb({real: lv.real + hv.real, imaginary: lv.imaginary + hv.imaginary});
		} else sum = powerSumDb(lowDb, highDb);
		return {frequencyHz: round(frequency, 3), lowDriverDb: round(lowDb, 4), highDriverDb: round(highDb, 4), sumDb: round(sum, 4)};
	});
}

function analyse(input, models) {
	var configuration = input.configuration, eligible = eligibility(configuration, input.measurementA, input.measurementB, models.phase);
	if (!eligible.eligible) return {valid: false, errors: eligible.errors, warnings: eligible.warnings};
	var pair = eligible.pair, range = eligible.candidateRange, timing = eligible.timing;
	var frequencies = logGrid(range.minimumFrequencyHz, range.maximumFrequencyHz, 25);
	var bestMatch = frequencies.map(function(frequency) {
		return {frequency: frequency, difference: Math.abs(models.phase.interpolate(pair.low.points, frequency, 'magnitudeDb') - models.phase.interpolate(pair.high.points, frequency, 'magnitudeDb'))};
	}).sort(function(a, b) { return a.difference - b.difference || a.frequency - b.frequency; })[0].frequency;
	var centre = range.currentCrossoverFrequencyHz ? Math.sqrt(bestMatch * range.currentCrossoverFrequencyHz) : bestMatch;
	centre = clamp(centre, range.minimumFrequencyHz, range.maximumFrequencyHz);
	var trialFrequencies = [centre / 1.25, centre, centre * 1.25].map(function(value) { return clamp(value, range.minimumFrequencyHz, range.maximumFrequencyHz); });
	var alignment = suggestedAlignment(configuration, pair, range, timing, models);
	var warnings = eligible.warnings.slice();
	if (alignment && alignment.warning) warnings.push(alignment.warning);
	var candidates = [];
	trialFrequencies.forEach(function(frequency) { TEMPLATES.forEach(function(template) { candidates.push(evaluateCandidate(configuration, pair, range, timing, frequency, template, alignment, models)); }); });
	var selected = chooseBounded(candidates);
	if (!selected.length) return {valid: false, errors: [issue('error', 'NO_RESPONSIBLE_CROSSOVER_CANDIDATE', 'No responsible crossover candidate could be generated.')], warnings: warnings};
	var protection = configuration.driverProtection.outputs.filter(function(item) { return item.outputId === pair.low.assignedOutputId || item.outputId === pair.high.assignedOutputId; });
	if (protection.some(function(item) { return item.limiter.enabled || item.driver.continuousPowerWatts !== null || item.driver.notes; })) warnings.push(issue('warning', 'PROTECTION_CONTEXT_PRESENT', 'Driver Protection contains user-entered assumptions. Crossover attenuation is not guaranteed thermal or excursion protection.'));
	selected.forEach(function(candidate, index) {
		var relation = index === 0 ? 'Recommended' : candidate.frequencyHz < selected[0].frequencyHz ? 'Lower crossover alternative' : 'Higher crossover alternative';
		var identity = [ALGORITHM_VERSION, pair.low.id, pair.low.integrity.hash, pair.high.id, pair.high.integrity.hash, candidate.frequencyHz, candidate.family, candidate.slopeDbPerOctave, candidate.polarityInverted, alignment && alignment.usable ? alignment.resultingDelayMs : 'none'].join('|');
		candidate.id = 'crossover-' + crypto.createHash('sha256').update(identity).digest('hex').slice(0, 12);
		candidate.label = relation;
		candidate.confidence = timing.confidence;
		candidate.reason = index === 0 ? 'Best balance of measured overlap, transition smoothness, cancellation restraint and simple supported filtering.' : relation + ' with a distinct measured-overlap tradeoff.';
		candidate.lowPassOutputId = pair.low.assignedOutputId;
		candidate.highPassOutputId = pair.high.assignedOutputId;
		candidate.polarityRecommendation = candidate.polarityInverted === null ? 'unavailable' : candidate.polarityInverted ? 'inverted' : 'normal';
		candidate.delaySuggestion = alignment && alignment.usable ? {outputId: alignment.outputId, adjustmentMs: alignment.adjustmentMs, resultingDelayMs: alignment.resultingDelayMs, samplesAt48kHz: models.processing.millisecondsToSamples(alignment.adjustmentMs, models.processing.SAMPLE_RATE_HZ)} : null;
		candidate.analysisRange = clone(range);
		candidate.sourceMeasurementIds = [pair.low.id, pair.high.id];
		candidate.sourceIntegrityRevisions = [pair.low.integrity.hash, pair.high.integrity.hash];
		candidate.timingReferenceClassification = timing.classification;
		candidate.algorithmVersion = ALGORITHM_VERSION;
		candidate.warnings = candidate.levelMismatchDb > 6 ? [issue('warning', 'DRIVER_LEVEL_MISMATCH', 'Measured levels differ materially around the crossover; use ordinary gain controls manually if level matching is required.')] : [];
	});
	var current = currentPrediction(configuration, pair, range, timing, models);
	selected.forEach(function(candidate) { candidate.prediction.forEach(function(point, index) { point.currentResultDb = current[index].sumDb; }); });
	return {valid: true, errors: [], warnings: warnings, analysisId: null, algorithmVersion: ALGORITHM_VERSION, mode: timing.mode,
		timingReference: timing, candidateRange: range, sources: [{id: pair.low.id, name: pair.low.name, outputId: pair.low.assignedOutputId, hash: pair.low.integrity.hash, role: pair.lowOutput.role}, {id: pair.high.id, name: pair.high.name, outputId: pair.high.assignedOutputId, hash: pair.high.integrity.hash, role: pair.highOutput.role}],
		currentBaseline: {crossoverFrequencyHz: range.currentCrossoverFrequencyHz, processingIncluded: ['current crossover baseline', 'current Parametric EQ', 'current gain', 'current delay', 'current polarity']},
		suggestions: selected, physicalDeploymentAllowed: false, automaticDesignChanges: false,
		summary: timing.mode === 'phase-aware' ? 'Phase-aware crossover suggestion using a predicted complex acoustic sum from user-declared compatible timing.' : 'Magnitude-based crossover suggestion using measured overlap and electrical attenuation; no complex acoustic sum is claimed.'};
}

function accept(configuration, analysis, suggestionID, processingModel) {
	if (!analysis || !analysis.valid || analysis.algorithmVersion !== ALGORITHM_VERSION) throw new Error('Generate current crossover suggestions before accepting.');
	var suggestion = analysis.suggestions.find(function(item) { return item.id === suggestionID; });
	if (!suggestion) throw new Error('Choose one current crossover suggestion.');
	var result = clone(configuration);
	var low = result.crossover.outputs.find(function(item) { return item.outputId === suggestion.lowPassOutputId; });
	var high = result.crossover.outputs.find(function(item) { return item.outputId === suggestion.highPassOutputId; });
	if (!low || !high) throw new Error('The suggested crossover outputs are unavailable.');
	low.lowPass = {enabled: true, family: suggestion.family, slopeDbPerOctave: suggestion.slopeDbPerOctave, cutoffHz: suggestion.frequencyHz};
	high.highPass = {enabled: true, family: suggestion.family, slopeDbPerOctave: suggestion.slopeDbPerOctave, cutoffHz: suggestion.frequencyHz};
	var changedProcessing = [];
	if (suggestion.polarityOutputId) {
		var polarityProcessing = result.channelProcessing.outputs.find(function(item) { return item.outputId === suggestion.polarityOutputId; });
		if (!polarityProcessing) throw new Error('The suggested polarity output is unavailable.');
		polarityProcessing.polarity.inverted = suggestion.polarityInverted;
		changedProcessing.push(polarityProcessing.outputId);
	}
	if (suggestion.delaySuggestion) {
		var processing = result.channelProcessing.outputs.find(function(item) { return item.outputId === suggestion.delaySuggestion.outputId; });
		if (!processing || suggestion.delaySuggestion.resultingDelayMs > processingModel.capabilities().delay.maximumMs) throw new Error('The suggested delay exceeds the current output capability.');
		processing.delay.valueMs = suggestion.delaySuggestion.resultingDelayMs;
		processing.polarity.inverted = suggestion.polarityInverted;
		if (changedProcessing.indexOf(processing.outputId) === -1) changedProcessing.push(processing.outputId);
	}
	return {configuration: result, suggestionId: suggestion.id, lowPassOutputId: suggestion.lowPassOutputId, highPassOutputId: suggestion.highPassOutputId, changedProcessingOutputIds: changedProcessing};
}

module.exports = {
	ALGORITHM_VERSION: ALGORITHM_VERSION,
	MIN_POINTS: MIN_POINTS,
	GRID_POINTS: GRID_POINTS,
	MAX_SUGGESTIONS: MAX_SUGGESTIONS,
	MIN_OVERLAP_OCTAVES: MIN_OVERLAP_OCTAVES,
	TEMPLATES: clone(TEMPLATES),
	capabilities: capabilities,
	validateSource: validateSource,
	timingClassification: timingClassification,
	candidateRange: candidateRange,
	eligibility: eligibility,
	electricalResponse: electricalResponse,
	rankCandidates: rankCandidates,
	chooseBounded: chooseBounded,
	powerSumDb: powerSumDb,
	analyse: analyse,
	accept: accept,
	clone: clone
};
