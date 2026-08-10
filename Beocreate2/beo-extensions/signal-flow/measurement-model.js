'use strict';

var crypto = require('crypto');

var FORMAT = 'org.speakerlab.measurements';
var VERSION = 1;
var MAX_FILE_BYTES = 2 * 1024 * 1024;
var MAX_ROWS = 20000;
var MAX_MEASUREMENTS = 24;
var MAX_TOTAL_POINTS = 50000;
var TYPES = ['unknown', 'farfield', 'nearfield', 'gated', 'in-room', 'listening-position', 'driver-raw-response', 'system-response'];

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function issue(level, code, message, path) { return {level: level, code: code, message: message, path: path || null}; }
function hash(points) { return crypto.createHash('sha256').update(JSON.stringify(points)).digest('hex'); }

function defaults() { return {format: FORMAT, version: VERSION, measurements: []}; }

function capabilities() {
	return {
		formats: ['rew-text', 'frd'], columns: ['frequency-hz', 'magnitude-db', 'phase-degrees'],
		types: TYPES.slice(), limits: {fileBytes: MAX_FILE_BYTES, rows: MAX_ROWS, measurements: MAX_MEASUREMENTS, totalPoints: MAX_TOTAL_POINTS}
	};
}

function splitLine(line, delimiter) {
	if (delimiter === 'comma') return line.split(',').map(function(value) { return value.trim(); });
	if (delimiter === 'tab') return line.split('\t').map(function(value) { return value.trim(); });
	return line.trim().split(/\s+/);
}

function numeric(value, decimalComma) {
	if (decimalComma) value = value.replace(',', '.');
	if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return null;
	var result = Number(value);
	return isFinite(result) ? result : null;
}

function parseText(text, options) {
	options = options || {};
	if (typeof text !== 'string') throw Object.assign(new Error('Measurement input must be UTF-8 text.'), {code: 'UNSUPPORTED_FORMAT'});
	if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) throw Object.assign(new Error('Measurement file exceeds the 2 MiB safety limit.'), {code: 'FILE_TOO_LARGE'});
	if (text.indexOf('\0') !== -1) throw Object.assign(new Error('Binary measurement files are not supported.'), {code: 'UNSUPPORTED_FORMAT'});
	text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	var lines = text.split('\n');
	if (lines.length > MAX_ROWS + 500) throw Object.assign(new Error('Measurement file contains too many rows.'), {code: 'TOO_MANY_ROWS'});
	var comments = [], dataLines = [], heading = null;
	lines.forEach(function(line) {
		var trimmed = line.trim();
		if (!trimmed) return;
		if (/^(#|;|\*|\/\/)/.test(trimmed)) {
			if (comments.length < 30) comments.push(trimmed.replace(/^(#|;|\*|\/\/)\s*/, '').replace(/(?:[A-Za-z]:\\|\/(?:Users|home|var|tmp)\/)[^\s]+/g, '[path omitted]').slice(0, 500));
			return;
		}
		if (/[A-Za-z]/.test(trimmed) && !/^[+\-\d.,\s\teE]+$/.test(trimmed) && !dataLines.length) { if (!heading) heading = trimmed; return; }
		dataLines.push(trimmed);
	});
	if (!dataLines.length) throw Object.assign(new Error('No valid numerical measurement rows were found.'), {code: 'NO_VALID_ROWS'});
	var rewEvidence = comments.concat(heading ? [heading] : []).join(' ').match(/room eq wizard|\bREW\b|frequency.*spl|sound pressure level/i);
	var tabSeparated = dataLines.some(function(line) { return line.indexOf('\t') !== -1; });
	var whitespaceColumns = dataLines.every(function(line) { return line.trim().split(/\s+/).length >= 2; });
	var commaSeparated = !whitespaceColumns && dataLines.every(function(line) { return line.split(',').length >= 2; });
	var delimiter = tabSeparated ? 'tab' : commaSeparated ? 'comma' : 'space';
	var decimalComma = delimiter !== 'comma' && dataLines.some(function(line) { return /\d,\d/.test(line); });
	if (decimalComma && delimiter === 'space' && dataLines.some(function(line) { return line.split(/\s+/).length < 2; })) {
		throw Object.assign(new Error('Decimal comma and column delimiter are ambiguous.'), {code: 'AMBIGUOUS_COLUMNS'});
	}
	var points = [], malformed = 0, columnCount = null;
	dataLines.forEach(function(line) {
		var fields = splitLine(line, delimiter);
		if (fields.length < 2 || fields.length > 3) { malformed++; return; }
		if (columnCount === null) columnCount = fields.length;
		if (fields.length !== columnCount) { malformed++; return; }
		var frequency = numeric(fields[0], decimalComma), magnitude = numeric(fields[1], decimalComma);
		var phase = fields.length === 3 ? numeric(fields[2], decimalComma) : null;
		if (frequency === null || magnitude === null || (fields.length === 3 && phase === null)) { malformed++; return; }
		if (frequency <= 0) throw Object.assign(new Error('Frequency values must be greater than zero.'), {code: 'INVALID_FREQUENCY'});
		points.push(fields.length === 3 ? {frequencyHz: frequency, magnitudeDb: magnitude, phaseDegrees: phase} : {frequencyHz: frequency, magnitudeDb: magnitude});
	});
	if (!points.length) throw Object.assign(new Error('No valid numerical measurement rows were found.'), {code: 'NO_VALID_ROWS'});
	if (malformed) throw Object.assign(new Error('Malformed or partial numerical rows were found; import was not guessed.'), {code: 'MALFORMED_ROWS', details: {count: malformed}});
	if (points.length > MAX_ROWS) throw Object.assign(new Error('Measurement contains too many sample points.'), {code: 'TOO_MANY_ROWS'});
	var sourceUnsorted = points.some(function(point, index) { return index && point.frequencyHz < points[index - 1].frequencyHz; });
	points.sort(function(a, b) { return a.frequencyHz - b.frequencyHz; });
	points.forEach(function(point) { Object.keys(point).forEach(function(key) { if (Object.is(point[key], -0)) point[key] = 0; }); });
	var duplicateCount = 0;
	for (var i = 1; i < points.length; i++) if (points[i].frequencyHz === points[i - 1].frequencyHz) duplicateCount++;
	var format = rewEvidence ? 'rew-text' : 'frd';
	var confidence = rewEvidence ? 'high' : heading ? 'medium' : 'reduced';
	var warnings = [];
	if (points.length < 10) warnings.push(issue('warning', 'FEW_POINTS', 'The measurement has very few data points.'));
	if (!points.some(function(point) { return point.phaseDegrees !== undefined; })) warnings.push(issue('warning', 'NO_PHASE', 'The source contains no phase information.'));
	if (sourceUnsorted) warnings.push(issue('warning', 'SOURCE_UNSORTED', 'Source rows were sorted into ascending frequency order.'));
	if (duplicateCount) warnings.push(issue('warning', 'DUPLICATE_FREQUENCIES', 'Duplicate frequencies are preserved.', 'points'));
	if (confidence === 'reduced') warnings.push(issue('warning', 'REDUCED_CONFIDENCE', 'Generic FRD columns were detected with reduced confidence.'));
	warnings.push(issue('warning', 'UNCALIBRATED', 'Imported data has not been calibrated or independently verified.'));
	return {
		format: format, confidence: confidence, recognizedColumns: columnCount === 3 ? ['frequency-hz', 'magnitude-db', 'phase-degrees'] : ['frequency-hz', 'magnitude-db'],
		ignoredColumns: [], metadata: comments, points: points, warnings: warnings,
		summary: {pointCount: points.length, minimumFrequencyHz: points[0].frequencyHz, maximumFrequencyHz: points[points.length - 1].frequencyHz, phaseAvailable: columnCount === 3}
	};
}

function create(preview, metadata) {
	metadata = metadata || {};
	var points = clone(preview.points);
	var integrity = hash(points);
	var safeFilename = String(metadata.filename || '').replace(/^.*[\\/]/, '').slice(0, 255);
	return {
		id: metadata.id || ('measurement-' + integrity.slice(0, 16)), name: String(metadata.name || safeFilename || 'Imported measurement').slice(0, 120),
		description: String(metadata.description || '').slice(0, 1000), type: TYPES.indexOf(metadata.type) !== -1 ? metadata.type : 'unknown',
		sourceFormat: preview.format, sourceFilename: safeFilename, importedAt: metadata.importedAt || new Date().toISOString(),
		units: {frequency: 'Hz', magnitude: 'dB', phase: preview.summary.phaseAvailable ? 'degrees' : null}, points: points,
		assignedOutputId: metadata.assignedOutputId || null, driverRole: metadata.driverRole || null, conditions: clone(metadata.conditions || {}),
		validation: {state: preview.warnings.length ? 'warning' : 'valid', warnings: clone(preview.warnings)},
		provenance: {detectedFormat: preview.format, confidence: preview.confidence, sourceMetadata: clone(preview.metadata)}, integrity: {algorithm: 'sha256', hash: integrity}, modelVersion: 1
	};
}

function normalize(configuration) { return clone(configuration || defaults()); }

function validate(configuration, outputIDs) {
	var errors = [], warnings = [], ids = {}, total = 0;
	if (!configuration || configuration.format !== FORMAT) errors.push(issue('error', 'INVALID_MEASUREMENT_FORMAT', 'Measurement configuration format is not supported.', 'measurements'));
	if (!configuration || configuration.version !== VERSION) errors.push(issue('error', 'UNSUPPORTED_MEASUREMENT_VERSION', 'Measurement model version is not supported.', 'measurements.version'));
	if (!configuration || !Array.isArray(configuration.measurements)) return {valid: false, errors: errors.concat([issue('error', 'INVALID_MEASUREMENTS', 'Measurements must be an array.')]), warnings: warnings};
	if (configuration.measurements.length > MAX_MEASUREMENTS) errors.push(issue('error', 'TOO_MANY_MEASUREMENTS', 'The design exceeds the measurement limit.'));
	configuration.measurements.forEach(function(measurement, index) {
		var base = 'measurements.measurements[' + index + ']';
		if (!measurement || typeof measurement !== 'object') { errors.push(issue('error', 'INVALID_MEASUREMENT', 'Measurement must be an object.', base)); return; }
		if (typeof measurement.name !== 'string' || !measurement.name.trim()) errors.push(issue('error', 'INVALID_MEASUREMENT_NAME', 'Measurement needs a name.', base + '.name'));
		if (['rew-text', 'frd'].indexOf(measurement.sourceFormat) === -1) errors.push(issue('error', 'UNSUPPORTED_SOURCE_FORMAT', 'Measurement source format is not supported.', base + '.sourceFormat'));
		if (!measurement.units || measurement.units.frequency !== 'Hz' || measurement.units.magnitude !== 'dB' || (measurement.units.phase !== null && measurement.units.phase !== 'degrees')) errors.push(issue('error', 'IMPOSSIBLE_UNIT_DECLARATION', 'Measurement units are not supported.', base + '.units'));
		if (!measurement.id || ids[measurement.id]) errors.push(issue('error', measurement.id ? 'DUPLICATE_MEASUREMENT_ID' : 'MISSING_MEASUREMENT_ID', 'Measurement identifiers must be present and unique.', base + '.id'));
		ids[measurement.id] = true;
		if (measurement.modelVersion !== 1) errors.push(issue('error', 'UNSUPPORTED_MEASUREMENT_MODEL_VERSION', 'Measurement item version is not supported.', base + '.modelVersion'));
		if (!Array.isArray(measurement.points) || !measurement.points.length) errors.push(issue('error', 'CORRUPTED_NORMALIZED_DATA', 'Measurement contains no normalized points.', base + '.points'));
		else {
			total += measurement.points.length;
			measurement.points.forEach(function(point) { if (!point || !isFinite(point.frequencyHz) || point.frequencyHz <= 0 || !isFinite(point.magnitudeDb) || (point.phaseDegrees !== undefined && !isFinite(point.phaseDegrees))) errors.push(issue('error', 'CORRUPTED_NORMALIZED_DATA', 'Measurement contains invalid normalized data.', base + '.points')); });
			if (!measurement.integrity || measurement.integrity.hash !== hash(measurement.points)) errors.push(issue('error', 'INTEGRITY_MISMATCH', 'Measurement source-data integrity check failed.', base + '.integrity'));
		}
		if (measurement.assignedOutputId && outputIDs.indexOf(measurement.assignedOutputId) === -1) errors.push(issue('error', 'UNKNOWN_MEASUREMENT_OUTPUT', 'Measurement is assigned to an unknown output.', base + '.assignedOutputId'));
		if (TYPES.indexOf(measurement.type) === -1) errors.push(issue('error', 'INVALID_MEASUREMENT_TYPE', 'Measurement type is not supported.', base + '.type'));
		if (measurement.type === 'unknown') warnings.push(issue('warning', 'UNKNOWN_MEASUREMENT_TYPE', 'Measurement type is unknown.', base + '.type'));
		if (!measurement.assignedOutputId) warnings.push(issue('warning', 'UNASSIGNED_MEASUREMENT', 'Measurement is not assigned to an output.', base + '.assignedOutputId'));
	});
	if (total > MAX_TOTAL_POINTS) errors.push(issue('error', 'MEASUREMENT_DATA_TOO_LARGE', 'The design exceeds the total normalized measurement-data limit.'));
	return {valid: errors.length === 0, errors: errors, warnings: warnings};
}

module.exports = {FORMAT: FORMAT, VERSION: VERSION, TYPES: TYPES, MAX_FILE_BYTES: MAX_FILE_BYTES, MAX_ROWS: MAX_ROWS, MAX_MEASUREMENTS: MAX_MEASUREMENTS, MAX_TOTAL_POINTS: MAX_TOTAL_POINTS, defaults: defaults, capabilities: capabilities, parseText: parseText, create: create, normalize: normalize, validate: validate, hash: hash};
