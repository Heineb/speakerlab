'use strict';

var crypto = require('crypto');

var ALGORITHM_VERSION = 'speakerlab-phase-alignment-v1';
var MIN_POINTS = 12;
var GRID_POINTS = 81;
var DEFAULT_SPAN_OCTAVES = 1.5;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function round(value, places) { var scale = Math.pow(10, places); return Math.round(value * scale) / scale; }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function median(values) {
	if (!values.length) return null;
	var sorted = values.slice().sort(function(a, b) { return a - b; });
	var middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function issue(level, code, message) { return {level: level, code: code, message: message}; }
function multiply(a, b) { return {real: a.real * b.real - a.imaginary * b.imaginary, imaginary: a.real * b.imaginary + a.imaginary * b.real}; }
function polar(magnitude, phaseDegrees) { var radians = phaseDegrees * Math.PI / 180; return {real: magnitude * Math.cos(radians), imaginary: magnitude * Math.sin(radians)}; }
function magnitudeDb(value) { return 20 * Math.log10(Math.max(1e-9, Math.sqrt(value.real * value.real + value.imaginary * value.imaginary))); }
function complexSum(first, second, frequencyHz, delayMs, inverted) {
	var a = polar(Math.pow(10, first.magnitudeDb / 20), first.phaseDegrees);
	var b = polar(Math.pow(10, second.magnitudeDb / 20), second.phaseDegrees - 360 * frequencyHz * (delayMs || 0) / 1000 + (inverted ? 180 : 0));
	return {real: a.real + b.real, imaginary: a.imaginary + b.imaginary, magnitudeDb: magnitudeDb({real: a.real + b.real, imaginary: a.imaginary + b.imaginary})};
}
function hash(points) { return crypto.createHash('sha256').update(JSON.stringify(points)).digest('hex'); }

function capabilities(processingModel) {
	return {
		algorithmVersion: ALGORITHM_VERSION,
		minimumPoints: MIN_POINTS,
		defaultSpanOctaves: DEFAULT_SPAN_OCTAVES,
		delay: processingModel.capabilities().delay,
		timingReferenceKinds: ['shared', 'relative', 'independent', 'unknown'],
		physicalDeploymentAllowed: false,
		automaticDesignChanges: false
	};
}

function unwrapPhase(points) {
	var result = [], offset = 0, previousRaw = null, previousUnwrapped = null, discontinuities = 0;
	for (var index = 0; index < points.length; index++) {
		var point = points[index];
		if (!point || !Number.isFinite(point.frequencyHz) || point.frequencyHz <= 0 || !Number.isFinite(point.phaseDegrees)) {
			return {valid: false, points: [], discontinuities: discontinuities, error: issue('error', 'INVALID_PHASE_VALUE', 'Phase contains an invalid frequency or angle.')};
		}
		if (previousRaw !== null) {
			var rawDelta = point.phaseDegrees - previousRaw;
			while (rawDelta > 180) { offset -= 360; rawDelta -= 360; }
			while (rawDelta <= -180) { offset += 360; rawDelta += 360; }
			if (Math.abs(rawDelta) > 120) discontinuities++;
		}
		var unwrapped = point.phaseDegrees + offset;
		if (previousUnwrapped !== null && Math.abs(unwrapped - previousUnwrapped) > 180) discontinuities++;
		result.push({frequencyHz: point.frequencyHz, phaseDegrees: round(unwrapped, 6)});
		previousRaw = point.phaseDegrees;
		previousUnwrapped = unwrapped;
	}
	return {valid: true, points: result, discontinuities: discontinuities, error: null};
}

function interpolate(points, frequencyHz, field) {
	if (!points.length || frequencyHz < points[0].frequencyHz || frequencyHz > points[points.length - 1].frequencyHz) return null;
	var exact = points.filter(function(point) { return point.frequencyHz === frequencyHz; });
	if (exact.length) return median(exact.map(function(point) { return point[field]; }));
	var upper = 0;
	while (upper < points.length && points[upper].frequencyHz < frequencyHz) upper++;
	if (!upper || upper >= points.length) return null;
	var a = points[upper - 1], b = points[upper];
	var position = (Math.log(frequencyHz) - Math.log(a.frequencyHz)) / (Math.log(b.frequencyHz) - Math.log(a.frequencyHz));
	return a[field] + (b[field] - a[field]) * position;
}

function timingReference(measurement) {
	var value = measurement && measurement.conditions && measurement.conditions.timingReference;
	if (!value || typeof value !== 'object') return {kind: 'unknown', group: null};
	return {kind: value.kind || 'unknown', group: typeof value.group === 'string' && value.group.trim() ? value.group.trim() : null};
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
	if (!measurement) return {errors: [issue('error', 'MISSING_ALIGNMENT_SOURCE', 'Select both driver measurements.')], warnings: []};
	if (!measurement.integrity || measurement.integrity.hash !== hash(measurement.points || [])) errors.push(issue('error', 'ALIGNMENT_INTEGRITY_MISMATCH', label + ' failed its source integrity check.'));
	if (!measurement.assignedOutputId || outputIDs.indexOf(measurement.assignedOutputId) === -1) errors.push(issue('error', 'UNIDENTIFIABLE_ALIGNMENT_OUTPUT', label + ' must be assigned to a known output.'));
	if (!measurement.units || measurement.units.phase !== 'degrees' || !(measurement.points || []).some(function(point) { return Number.isFinite(point.phaseDegrees); })) errors.push(issue('error', 'ALIGNMENT_PHASE_UNAVAILABLE', label + ' has no usable phase data.'));
	if ((measurement.points || []).length < MIN_POINTS) errors.push(issue('error', 'INSUFFICIENT_ALIGNMENT_POINTS', label + ' has too few points for phase/time alignment.'));
	if (measurement.sourceFormat === 'derived-merge') errors.push(issue('error', 'MAGNITUDE_ONLY_DERIVED_SOURCE', 'Merged magnitude-only responses cannot be used for phase/time alignment.'));
	if (staleMerge(measurement, measurements)) errors.push(issue('error', 'STALE_ALIGNMENT_SOURCE', label + ' is stale and must be recomputed.'));
	if (measurement.validation && measurement.validation.state === 'invalid') errors.push(issue('error', 'INVALID_ALIGNMENT_SOURCE', label + ' is invalid.'));
	if (measurement.type === 'unknown') warnings.push(issue('warning', 'UNKNOWN_ALIGNMENT_TYPE', label + ' has an unknown measurement type.'));
	if (measurement.type === 'in-room' || measurement.type === 'listening-position') warnings.push(issue('warning', 'IN_ROOM_ALIGNMENT_SOURCE', label + ' includes room and placement effects.'));
	return {errors: errors, warnings: warnings};
}

function referenceCompatibility(a, b) {
	var first = timingReference(a), second = timingReference(b), errors = [], warnings = [], mode = null;
	if (first.kind === 'independent' || second.kind === 'independent') errors.push(issue('error', 'INCOMPATIBLE_TIMING_REFERENCE', 'The measurements use independent timing references and cannot support complex summation.'));
	else if (first.kind === 'unknown' || second.kind === 'unknown' || !first.group || !second.group) errors.push(issue('error', 'TIMING_REFERENCE_UNAVAILABLE', 'Both measurements need an explicit compatible timing-reference group.'));
	else if (first.group !== second.group || first.kind !== second.kind) errors.push(issue('error', 'INCOMPATIBLE_TIMING_REFERENCE', 'The measurements do not share the same timing-reference kind and group.'));
	else if (first.kind === 'shared') mode = 'absolute-shared-reference';
	else if (first.kind === 'relative') {
		mode = 'relative-phase-derived';
		warnings.push(issue('warning', 'RELATIVE_PHASE_REFERENCE', 'Delay is inferred from a shared relative phase reference; absolute acoustic timing and acoustic-centre distance are not claimed.'));
	} else errors.push(issue('error', 'TIMING_REFERENCE_UNAVAILABLE', 'The timing-reference kind is not usable for alignment.'));
	return {valid: errors.length === 0, errors: errors, warnings: warnings, mode: mode, first: first, second: second};
}

function crossoverContext(configuration, outputA, outputB) {
	var values = [];
	[outputA, outputB].forEach(function(outputID) {
		var item = configuration.crossover.outputs.find(function(candidate) { return candidate.outputId === outputID; });
		if (!item) return;
		if (item.highPass.enabled) values.push(item.highPass.cutoffHz);
		if (item.lowPass.enabled) values.push(item.lowPass.cutoffHz);
	});
	if (!values.length) return null;
	var centre = Math.exp(values.reduce(function(total, value) { return total + Math.log(value); }, 0) / values.length);
	var factor = Math.pow(2, DEFAULT_SPAN_OCTAVES / 2);
	return {centreFrequencyHz: round(centre, 3), minimumFrequencyHz: round(centre / factor, 3), maximumFrequencyHz: round(centre * factor, 3), source: 'configured crossover'};
}

function eligibility(configuration, measurementA, measurementB) {
	var outputIDs = configuration.outputs.map(function(output) { return output.id; });
	var first = validateSource(measurementA, configuration.measurements.measurements, outputIDs, 'First measurement');
	var second = validateSource(measurementB, configuration.measurements.measurements, outputIDs, 'Second measurement');
	var errors = first.errors.concat(second.errors), warnings = first.warnings.concat(second.warnings);
	if (measurementA && measurementB && measurementA.id === measurementB.id) errors.push(issue('error', 'DUPLICATE_ALIGNMENT_SOURCE', 'Choose two different measurements.'));
	if (measurementA && measurementB && measurementA.assignedOutputId === measurementB.assignedOutputId) errors.push(issue('error', 'SAME_ALIGNMENT_OUTPUT', 'The measurements must represent two different outputs.'));
	var reference = measurementA && measurementB ? referenceCompatibility(measurementA, measurementB) : {valid: false, errors: [], warnings: [], mode: null};
	errors = errors.concat(reference.errors); warnings = warnings.concat(reference.warnings);
	var context = measurementA && measurementB ? crossoverContext(configuration, measurementA.assignedOutputId, measurementB.assignedOutputId) : null;
	if (!context) errors.push(issue('error', 'CROSSOVER_CONTEXT_UNAVAILABLE', 'Configure a crossover for the selected driver pair before alignment.'));
	if (measurementA && measurementB && context) {
		var minimum = Math.max(measurementA.points[0].frequencyHz, measurementB.points[0].frequencyHz, context.minimumFrequencyHz);
		var maximum = Math.min(measurementA.points[measurementA.points.length - 1].frequencyHz, measurementB.points[measurementB.points.length - 1].frequencyHz, context.maximumFrequencyHz);
		if (!(maximum > minimum)) errors.push(issue('error', 'NO_ALIGNMENT_OVERLAP', 'The measurements do not overlap across the configured crossover region.'));
		else if (Math.log(maximum / minimum) / Math.LN2 < 0.5) warnings.push(issue('warning', 'NARROW_ALIGNMENT_OVERLAP', 'The useful overlap around the crossover is narrow.'));
	}
	return {eligible: errors.length === 0, errors: errors, warnings: warnings, referenceMode: reference.mode, crossoverContext: context};
}

function robustLineFit(points) {
	if (points.length < MIN_POINTS) return {valid: false, error: issue('error', 'INSUFFICIENT_DELAY_POINTS', 'At least ' + MIN_POINTS + ' phase points are required for delay estimation.')};
	var slopes = [];
	for (var first = 0; first < points.length; first++) for (var second = first + 1; second < points.length; second++) {
		var delta = points[second].frequencyHz - points[first].frequencyHz;
		if (delta) slopes.push((points[second].phaseDegrees - points[first].phaseDegrees) / delta);
	}
	var slope = median(slopes);
	var intercept = median(points.map(function(point) { return point.phaseDegrees - slope * point.frequencyHz; }));
	var residuals = points.map(function(point) { return Math.abs(point.phaseDegrees - (slope * point.frequencyHz + intercept)); });
	var residual = median(residuals);
	return {valid: true, slopeDegreesPerHz: slope, interceptDegrees: intercept, delayMs: -slope / 360 * 1000, residualDegrees: residual, quality: clamp(1 - residual / 45, 0, 1)};
}

function processingResponse(configuration, outputID, frequencyHz, models) {
	var crossover = configuration.crossover.outputs.find(function(item) { return item.outputId === outputID; });
	var eqOutput = configuration.parametricEQ.outputs.find(function(item) { return item.outputId === outputID; });
	var processing = configuration.channelProcessing.outputs.find(function(item) { return item.outputId === outputID; });
	var response = {real: 1, imaginary: 0};
	if (crossover) {
		var hp = models.crossover.designFilter('high-pass', crossover.highPass, models.processing.SAMPLE_RATE_HZ);
		var lp = models.crossover.designFilter('low-pass', crossover.lowPass, models.processing.SAMPLE_RATE_HZ);
		response = multiply(response, models.crossover.filterResponse(hp.concat(lp), frequencyHz, models.processing.SAMPLE_RATE_HZ));
	}
	if (eqOutput) {
		var sections = eqOutput.bands.filter(function(band) { return band.enabled; }).map(function(band) { return models.eq.designBand(band, models.processing.SAMPLE_RATE_HZ); });
		response = multiply(response, models.eq.responseAt(sections, frequencyHz, models.processing.SAMPLE_RATE_HZ));
	}
	if (processing) {
		var gain = Math.pow(10, processing.gain.valueDb / 20);
		var phase = -360 * frequencyHz * processing.delay.valueMs / 1000 + (processing.polarity.inverted ? 180 : 0);
		response = multiply(response, polar(gain, phase));
	}
	return response;
}

function analyse(input, models) {
	var configuration = input.configuration, a = input.measurementA, b = input.measurementB;
	var eligible = eligibility(configuration, a, b);
	if (!eligible.eligible) return {valid: false, errors: eligible.errors, warnings: eligible.warnings};
	var base = eligible.crossoverContext;
	var minimum = input.options && input.options.minimumFrequencyHz !== undefined ? Number(input.options.minimumFrequencyHz) : base.minimumFrequencyHz;
	var maximum = input.options && input.options.maximumFrequencyHz !== undefined ? Number(input.options.maximumFrequencyHz) : base.maximumFrequencyHz;
	minimum = Math.max(minimum, a.points[0].frequencyHz, b.points[0].frequencyHz);
	maximum = Math.min(maximum, a.points[a.points.length - 1].frequencyHz, b.points[b.points.length - 1].frequencyHz);
	if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum || minimum < base.minimumFrequencyHz || maximum > base.maximumFrequencyHz) return {valid: false, errors: [issue('error', 'INVALID_ALIGNMENT_RANGE', 'The analysis range must remain inside the shared crossover region.')], warnings: eligible.warnings};
	var phaseA = unwrapPhase(a.points.map(function(point) { return {frequencyHz: point.frequencyHz, phaseDegrees: point.phaseDegrees}; }));
	var phaseB = unwrapPhase(b.points.map(function(point) { return {frequencyHz: point.frequencyHz, phaseDegrees: point.phaseDegrees}; }));
	if (!phaseA.valid || !phaseB.valid) return {valid: false, errors: [phaseA.error || phaseB.error], warnings: eligible.warnings};
	var outputA = a.assignedOutputId, outputB = b.assignedOutputId, grid = [], fitPoints = [];
	for (var index = 0; index < GRID_POINTS; index++) {
		var frequency = minimum * Math.pow(maximum / minimum, index / (GRID_POINTS - 1));
		var magnitudeA = interpolate(a.points, frequency, 'magnitudeDb'), magnitudeB = interpolate(b.points, frequency, 'magnitudeDb');
		var rawPhaseA = interpolate(phaseA.points, frequency, 'phaseDegrees'), rawPhaseB = interpolate(phaseB.points, frequency, 'phaseDegrees');
		if ([magnitudeA, magnitudeB, rawPhaseA, rawPhaseB].some(function(value) { return value === null || !Number.isFinite(value); })) continue;
		var currentA = multiply(polar(Math.pow(10, magnitudeA / 20), rawPhaseA), processingResponse(configuration, outputA, frequency, models));
		var currentB = multiply(polar(Math.pow(10, magnitudeB / 20), rawPhaseB), processingResponse(configuration, outputB, frequency, models));
		var currentPhaseA = Math.atan2(currentA.imaginary, currentA.real) * 180 / Math.PI;
		var currentPhaseB = Math.atan2(currentB.imaginary, currentB.real) * 180 / Math.PI;
		grid.push({frequencyHz: round(frequency, 3), sourceA: currentA, sourceB: currentB, currentPhaseA: currentPhaseA, currentPhaseB: currentPhaseB});
	}
	var relativeWrapped = grid.map(function(point) { return {frequencyHz: point.frequencyHz, phaseDegrees: point.currentPhaseB - point.currentPhaseA}; });
	var relative = unwrapPhase(relativeWrapped);
	if (!relative.valid) return {valid: false, errors: [relative.error], warnings: eligible.warnings};
	fitPoints = relative.points;
	var fit = robustLineFit(fitPoints);
	if (!fit.valid) return {valid: false, errors: [fit.error], warnings: eligible.warnings};
	if (fit.quality < 0.35) return {valid: false, errors: [issue('error', 'ALIGNMENT_QUALITY_TOO_LOW', 'Phase slope is too inconsistent for a responsible delay suggestion.')], warnings: eligible.warnings};
	var processingA = configuration.channelProcessing.outputs.find(function(item) { return item.outputId === outputA; });
	var processingB = configuration.channelProcessing.outputs.find(function(item) { return item.outputId === outputB; });
	var targetOutput = fit.delayMs >= 0 ? outputA : outputB;
	var adjustmentMs = Math.abs(fit.delayMs);
	var targetProcessing = targetOutput === outputA ? processingA : processingB;
	var resultingDelayMs = targetProcessing.delay.valueMs + adjustmentMs;
	var maximumDelay = models.processing.capabilities().delay.maximumMs;
	var warnings = eligible.warnings.slice();
	if (phaseA.discontinuities || phaseB.discontinuities || fit.residualDegrees > 25) warnings.push(issue('warning', 'NOISY_ALIGNMENT_PHASE', 'Phase continuity is uncertain; treat the inferred delay cautiously.'));
	var relevantBands = configuration.parametricEQ.outputs.filter(function(item) { return item.outputId === outputA || item.outputId === outputB; }).reduce(function(all, item) { return all.concat(item.bands); }, []);
	if (relevantBands.some(function(band) { return band.enabled && band.type === 'peaking' && band.shape > 5 && band.frequencyHz >= minimum && band.frequencyHz <= maximum; })) warnings.push(issue('warning', 'HIGH_Q_EQ_PHASE_CONTEXT', 'High-Q EQ in the crossover region strongly affects local phase.'));
	if (resultingDelayMs > maximumDelay) return {valid: false, errors: [issue('error', 'ALIGNMENT_DELAY_OUT_OF_RANGE', 'The inferred adjustment exceeds the current output delay capability.')], warnings: warnings};
	function preview(targetInverted) {
		var sum = 0, points = [];
		grid.forEach(function(point) {
			var aValue = point.sourceA, bValue = point.sourceB;
			var adjusted = targetOutput === outputA ? aValue : bValue;
			adjusted = multiply(adjusted, polar(1, -360 * point.frequencyHz * adjustmentMs / 1000));
			var currentTarget = targetOutput === outputA ? processingA : processingB;
			if (targetInverted !== currentTarget.polarity.inverted) adjusted = multiply(adjusted, polar(1, 180));
			if (targetOutput === outputA) aValue = adjusted; else bValue = adjusted;
			var combined = {real: aValue.real + bValue.real, imaginary: aValue.imaginary + bValue.imaginary};
			var db = magnitudeDb(combined); sum += db;
			points.push({frequencyHz: point.frequencyHz, sourceADb: round(magnitudeDb(point.sourceA), 4), sourceBDb: round(magnitudeDb(point.sourceB), 4), sumDb: round(db, 4)});
		});
		return {meanSumDb: sum / grid.length, points: points};
	}
	var currentSum = grid.map(function(point) { return round(magnitudeDb({real: point.sourceA.real + point.sourceB.real, imaginary: point.sourceA.imaginary + point.sourceB.imaginary}), 4); });
	var normal = preview(false), inverted = preview(true);
	var suggestedInverted = inverted.meanSumDb > normal.meanSumDb + 0.15;
	var selected = suggestedInverted ? inverted : normal;
	var currentMean = currentSum.reduce(function(total, value) { return total + value; }, 0) / currentSum.length;
	if (Math.abs(inverted.meanSumDb - normal.meanSumDb) <= 0.15) warnings.push(issue('warning', 'AMBIGUOUS_POLARITY_RESULT', 'Normal and inverted polarity predict nearly equal average summation in this region.'));
	var confidence = fit.quality >= 0.8 ? 'high' : fit.quality >= 0.55 ? 'moderate' : 'reduced';
	var identity = [ALGORITHM_VERSION, a.id, a.integrity.hash, b.id, b.integrity.hash, minimum, maximum, targetOutput, resultingDelayMs, suggestedInverted].join('|');
	return {
		valid: true, errors: [], warnings: warnings,
		analysisId: null, algorithmVersion: ALGORITHM_VERSION,
		sources: [{id: a.id, name: a.name, outputId: outputA, hash: a.integrity.hash}, {id: b.id, name: b.name, outputId: outputB, hash: b.integrity.hash}],
		reference: {mode: eligible.referenceMode, statement: eligible.referenceMode === 'absolute-shared-reference' ? 'Shared timing reference; relative timing is comparable.' : 'Relative phase-derived alignment only; absolute timing is not claimed.'},
		activeRange: {minimumFrequencyHz: round(minimum, 3), maximumFrequencyHz: round(maximum, 3), centreFrequencyHz: base.centreFrequencyHz, basis: base.source},
		delayEstimate: {relativeDelayMs: round(fit.delayMs, 6), residualPhaseDegrees: round(fit.residualDegrees, 3), quality: round(fit.quality, 3), confidence: confidence, samplesAt48kHz: models.processing.millisecondsToSamples(adjustmentMs, models.processing.SAMPLE_RATE_HZ)},
		suggestion: {id: 'alignment-' + crypto.createHash('sha256').update(identity).digest('hex').slice(0, 12), outputId: targetOutput, delayAdjustmentMs: round(adjustmentMs, 6), resultingDelayMs: round(resultingDelayMs, 6), polarityInverted: suggestedInverted, confidence: confidence, estimatedMeanSumImprovementDb: round(selected.meanSumDb - currentMean, 3), reason: (suggestedInverted ? 'Inverted' : 'Normal') + ' polarity gives the stronger predicted acoustic sum after the bounded delay adjustment.'},
		prediction: grid.map(function(point, index) { return {frequencyHz: point.frequencyHz, sourceADb: round(magnitudeDb(point.sourceA), 4), sourceBDb: round(magnitudeDb(point.sourceB), 4), currentSumDb: currentSum[index], suggestedSumDb: selected.points[index].sumDb, alternativePolaritySumDb: (suggestedInverted ? normal : inverted).points[index].sumDb}; }),
		processingIncluded: ['current crossover', 'current Parametric EQ', 'current gain', 'current delay', 'current polarity'],
		summary: 'Predicted acoustic sum from compatible complex measurement data and current electrical processing; it is not a new physical measurement.',
		physicalDeploymentAllowed: false,
		automaticDesignChanges: false
	};
}

function accept(configuration, analysis, processingModel) {
	if (!analysis || !analysis.valid || analysis.algorithmVersion !== ALGORITHM_VERSION || !analysis.suggestion) throw new Error('Generate a current alignment suggestion before accepting.');
	var result = clone(configuration);
	var output = result.channelProcessing.outputs.find(function(item) { return item.outputId === analysis.suggestion.outputId; });
	if (!output) throw new Error('The suggested output is unavailable.');
	if (analysis.suggestion.resultingDelayMs < 0 || analysis.suggestion.resultingDelayMs > processingModel.capabilities().delay.maximumMs) throw new Error('The suggested delay exceeds the current target capability.');
	output.delay.valueMs = analysis.suggestion.resultingDelayMs;
	output.polarity.inverted = analysis.suggestion.polarityInverted;
	return {configuration: result, outputId: output.outputId, delayMs: output.delay.valueMs, polarityInverted: output.polarity.inverted};
}

module.exports = {
	ALGORITHM_VERSION: ALGORITHM_VERSION,
	MIN_POINTS: MIN_POINTS,
	GRID_POINTS: GRID_POINTS,
	capabilities: capabilities,
	unwrapPhase: unwrapPhase,
	interpolate: interpolate,
	timingReference: timingReference,
	referenceCompatibility: referenceCompatibility,
	robustLineFit: robustLineFit,
	complexSum: complexSum,
	crossoverContext: crossoverContext,
	eligibility: eligibility,
	analyse: analyse,
	accept: accept,
	clone: clone
};
