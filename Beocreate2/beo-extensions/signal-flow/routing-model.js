'use strict';

var crypto = require('crypto');
var crossoverModel = require('./crossover-model');
var processingModel = require('./channel-processing-model');

var FORMAT = 'org.speakerlab.signal-flow';
var VERSION = 1;
var INPUTS = [
	{id: 'left', name: 'Left input', role: 'left', description: 'Left channel from the current Beocreate stereo source.', available: true},
	{id: 'right', name: 'Right input', role: 'right', description: 'Right channel from the current Beocreate stereo source.', available: true},
	{id: 'mono', name: 'Mono input', role: 'mono', description: 'The existing Beocreate mono channel role.', available: true}
];
var OUTPUT_IDS = ['output-a', 'output-b', 'output-c', 'output-d'];
var CHANNEL_IDS = ['a', 'b', 'c', 'd'];
var ROLES = ['unassigned', 'full-range', 'woofer', 'midrange', 'tweeter', 'subwoofer'];
var SIDES = ['unassigned', 'left', 'right', 'mono'];

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function capabilities(available) {
	var isAvailable = available !== false;
	return {
		inputs: INPUTS.map(function(input) {
			var result = clone(input);
			result.available = isAvailable;
			return result;
		}),
		outputs: OUTPUT_IDS.map(function(id, index) {
			return {
				id: id,
				dspChannel: CHANNEL_IDS[index],
				name: 'Output ' + CHANNEL_IDS[index].toUpperCase(),
				available: isAvailable
			};
		}),
		crossover: crossoverModel.capabilities(crossoverModel.DEFAULT_SAMPLE_RATE_HZ),
		channelProcessing: processingModel.capabilities()
	};
}

function defaultConfiguration() {
	return {
		format: FORMAT,
		version: VERSION,
		outputs: OUTPUT_IDS.map(function(id, index) {
			return {
				id: id,
				dspChannel: CHANNEL_IDS[index],
				label: 'Output ' + CHANNEL_IDS[index].toUpperCase(),
				role: 'unassigned',
				side: 'unassigned',
				enabled: false
			};
		}),
		connections: [],
		crossover: crossoverModel.defaultConfiguration(OUTPUT_IDS, crossoverModel.DEFAULT_SAMPLE_RATE_HZ),
		channelProcessing: processingModel.defaultConfiguration(OUTPUT_IDS)
	};
}

function normalize(configuration) {
	var crossover = crossoverModel.normalize(configuration.crossover, OUTPUT_IDS, crossoverModel.DEFAULT_SAMPLE_RATE_HZ);
	return {
		format: configuration.format,
		version: configuration.version,
		outputs: configuration.outputs.map(function(output) {
			return {
				id: output.id,
				dspChannel: output.dspChannel,
				label: output.label,
				role: output.role,
				side: output.side,
				enabled: output.enabled
			};
		}),
		connections: configuration.connections.map(function(connection) {
			return {
				source: connection.source,
				destination: connection.destination,
				enabled: connection.enabled
			};
		}),
		crossover: crossover,
		channelProcessing: processingModel.normalize(configuration.channelProcessing, OUTPUT_IDS)
	};
}

function serialize(configuration) {
	return JSON.stringify(normalize(configuration));
}

function revision(configuration) {
	return crypto.createHash('sha256').update(serialize(configuration)).digest('hex');
}

function issue(level, code, message, path) {
	return {level: level, code: code, message: message, path: path || null};
}

function validate(configuration, availableCapabilities) {
	var errors = [];
	var warnings = [];
	var caps = availableCapabilities || capabilities(true);
	var inputById = {};
	var outputCapabilityById = {};
	var outputById = {};
	var connectionByOutput = {};

	caps.inputs.forEach(function(input) { inputById[input.id] = input; });
	caps.outputs.forEach(function(output) { outputCapabilityById[output.id] = output; });

	if (!configuration || typeof configuration != 'object' || Array.isArray(configuration)) {
		errors.push(issue('error', 'INVALID_CONFIGURATION', 'Routing configuration must be an object.'));
		return {valid: false, errors: errors, warnings: warnings};
	}
	if (configuration.format !== FORMAT) {
		errors.push(issue('error', 'INVALID_FORMAT', 'Routing configuration format is not supported.', 'format'));
	}
	if (configuration.version !== VERSION) {
		errors.push(issue('error', 'UNSUPPORTED_VERSION', 'Routing configuration version is not supported.', 'version'));
	}
	if (!Array.isArray(configuration.outputs)) {
		errors.push(issue('error', 'INVALID_OUTPUTS', 'Outputs must be an array.', 'outputs'));
	} else {
		configuration.outputs.forEach(function(output, index) {
			var path = 'outputs[' + index + ']';
			if (!output || typeof output != 'object' || Array.isArray(output)) {
				errors.push(issue('error', 'INVALID_OUTPUT', 'Each output must be an object.', path));
				return;
			}
			if (typeof output.id != 'string' || !output.id) {
				errors.push(issue('error', 'MISSING_OUTPUT_ID', 'Each output needs a stable identifier.', path + '.id'));
			} else if (outputById[output.id]) {
				errors.push(issue('error', 'DUPLICATE_OUTPUT', 'Output identifiers must be unique.', path + '.id'));
			} else {
				outputById[output.id] = output;
			}
			if (!outputCapabilityById[output.id] || outputCapabilityById[output.id].dspChannel !== output.dspChannel) {
				errors.push(issue('error', 'UNKNOWN_OUTPUT', 'The output is not available on this Beocreate system.', path));
			} else if (!outputCapabilityById[output.id].available) {
				errors.push(issue('error', 'OUTPUT_UNAVAILABLE', 'The output is currently unavailable.', path));
			}
			if (typeof output.label != 'string' || !output.label.trim()) {
				errors.push(issue('error', 'INVALID_LABEL', 'Each output needs a label.', path + '.label'));
			}
			if (ROLES.indexOf(output.role) == -1) {
				errors.push(issue('error', 'INVALID_ROLE', 'Select a supported speaker-driver role.', path + '.role'));
			}
			if (SIDES.indexOf(output.side) == -1) {
				errors.push(issue('error', 'INVALID_SIDE', 'Select a supported side or position.', path + '.side'));
			}
			if (typeof output.enabled != 'boolean') {
				errors.push(issue('error', 'INVALID_ENABLED', 'Output enabled state must be true or false.', path + '.enabled'));
			}
		});
		caps.outputs.forEach(function(output) {
			if (!outputById[output.id]) {
				errors.push(issue('error', 'MISSING_OUTPUT', output.name + ' is missing from the routing configuration.', 'outputs'));
			}
		});
	}

	if (!Array.isArray(configuration.connections)) {
		errors.push(issue('error', 'INVALID_CONNECTIONS', 'Connections must be an array.', 'connections'));
	} else {
		configuration.connections.forEach(function(connection, index) {
			var path = 'connections[' + index + ']';
			if (!connection || typeof connection != 'object' || Array.isArray(connection)) {
				errors.push(issue('error', 'INVALID_CONNECTION', 'Each connection must be an object.', path));
				return;
			}
			if (!inputById[connection.source]) {
				errors.push(issue('error', 'UNKNOWN_INPUT', 'The selected input is not available.', path + '.source'));
			} else if (!inputById[connection.source].available) {
				errors.push(issue('error', 'INPUT_UNAVAILABLE', 'The selected input is currently unavailable.', path + '.source'));
			}
			if (!outputById[connection.destination]) {
				errors.push(issue('error', 'UNKNOWN_CONNECTION_OUTPUT', 'The connection destination is not a configured output.', path + '.destination'));
			}
			if (typeof connection.enabled != 'boolean') {
				errors.push(issue('error', 'INVALID_CONNECTION_ENABLED', 'Connection enabled state must be true or false.', path + '.enabled'));
			}
			if (connectionByOutput[connection.destination]) {
				errors.push(issue('error', 'MULTIPLE_SOURCES', 'Version 1 allows only one input per output.', path + '.destination'));
			} else {
				connectionByOutput[connection.destination] = connection;
			}
		});
	}

	if (Array.isArray(configuration.outputs)) {
		var enabledCount = 0;
		var roleCounts = {};
		configuration.outputs.forEach(function(output) {
			if (!output || typeof output != 'object') return;
			if (output.enabled === true) enabledCount++;
			if (output.role === 'unassigned') {
				warnings.push(issue('warning', 'UNASSIGNED_ROLE', output.label + ' has no driver role.', output.id));
			} else if (ROLES.indexOf(output.role) != -1) {
				roleCounts[output.role] = (roleCounts[output.role] || 0) + 1;
			}
			var connection = connectionByOutput[output.id];
			if (output.enabled === true && (!connection || connection.enabled !== true)) {
				warnings.push(issue('warning', 'UNROUTED_OUTPUT', output.label + ' is enabled but has no input.', output.id));
			}
			if (connection && connection.enabled && output.side === 'left' && connection.source === 'right') {
				warnings.push(issue('warning', 'SIDE_MISMATCH', output.label + ' is labelled Left but uses the Right input.', output.id));
			}
			if (connection && connection.enabled && output.side === 'right' && connection.source === 'left') {
				warnings.push(issue('warning', 'SIDE_MISMATCH', output.label + ' is labelled Right but uses the Left input.', output.id));
			}
		});
		if (enabledCount === 0) warnings.push(issue('warning', 'ALL_OUTPUTS_DISABLED', 'All outputs are disabled.'));
		Object.keys(roleCounts).forEach(function(role) {
			if (roleCounts[role] > 1) warnings.push(issue('warning', 'DUPLICATE_ROLE', 'Multiple outputs use the ' + role.replace('-', ' ') + ' role.', role));
		});
	}

	var crossoverConfiguration = configuration.crossover || crossoverModel.defaultConfiguration(OUTPUT_IDS, crossoverModel.DEFAULT_SAMPLE_RATE_HZ);
	var crossoverValidation = crossoverModel.validate(crossoverConfiguration, OUTPUT_IDS, Array.isArray(configuration.outputs) ? configuration.outputs : []);
	errors = errors.concat(crossoverValidation.errors);
	warnings = warnings.concat(crossoverValidation.warnings);
	var processingConfiguration = configuration.channelProcessing || processingModel.defaultConfiguration(OUTPUT_IDS);
	var processingValidation = processingModel.validate(processingConfiguration, OUTPUT_IDS, Array.isArray(configuration.outputs) ? configuration.outputs : [], Array.isArray(configuration.connections) ? configuration.connections : []);
	errors = errors.concat(processingValidation.errors);
	warnings = warnings.concat(processingValidation.warnings);
	warnings.push(issue('warning', 'DESIGN_NOT_DEPLOYED', 'Saved crossover settings are a simulated design and are not deployed to hardware.', 'crossover'));

	return {valid: errors.length === 0, errors: errors, warnings: warnings};
}

module.exports = {
	FORMAT: FORMAT,
	VERSION: VERSION,
	ROLES: ROLES,
	SIDES: SIDES,
	OUTPUT_IDS: OUTPUT_IDS,
	crossoverModel: crossoverModel,
	processingModel: processingModel,
	capabilities: capabilities,
	defaultConfiguration: defaultConfiguration,
	normalize: normalize,
	serialize: serialize,
	revision: revision,
	validate: validate,
	clone: clone
};
