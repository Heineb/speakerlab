'use strict';

var fs = require('fs');
var path = require('path');
var atomicJSON = require('../../beo-system/atomic-json-file');
var routingModel = require('./routing-model');

var SETTINGS_FILE = 'signal-flow.json';

function routingError(code, message, details) {
	var error = new Error(message);
	error.code = code;
	error.details = details || null;
	return error;
}

function createService(options) {
	options = options || {};
	var fileSystem = options.fileSystem || fs;
	var model = options.model || routingModel;
	var writer = options.atomicWriter || atomicJSON;
	var settingsCoordinator = options.settingsCoordinator || null;
	var target = path.join(options.dataDirectory, SETTINGS_FILE);

	function parseSaved() {
		if (!fileSystem.existsSync(target)) return {exists: false, configuration: null};
		var raw = fileSystem.readFileSync(target, 'utf8');
		var configuration;
		try {
			configuration = JSON.parse(raw);
		} catch (error) {
			throw routingError('MALFORMED_SAVED_CONFIGURATION', 'The saved routing configuration is malformed JSON.');
		}
		var validation = model.validate(configuration);
		if (!validation.valid) {
			throw routingError('INVALID_SAVED_CONFIGURATION', 'The saved routing configuration is not valid.', validation);
		}
		return {exists: true, configuration: model.normalize(configuration)};
	}

	function state(runtime) {
		var saved;
		var loadError = null;
		try {
			saved = parseSaved();
		} catch (error) {
			loadError = publicError(error);
			saved = {exists: true, configuration: null};
		}
		var configuration = saved.configuration || model.defaultConfiguration();
		return {
			capabilities: model.capabilities(true),
			configuration: configuration,
			revision: saved.configuration ? model.revision(configuration) : null,
			hasSavedConfiguration: !!saved.configuration,
			validation: model.validate(configuration),
			loadError: loadError,
			runtime: {
				simulated: !!(runtime && runtime.simulated),
				connected: !!(runtime && runtime.connected),
				deploymentStatus: 'not-deployed',
				statusLabel: runtime && runtime.simulated ? 'Saved design · Simulated · Not deployed to DSP' : 'Saved design · Not deployed to DSP'
			}
		};
	}

	function validate(configuration) {
		return model.validate(configuration);
	}

	function save(configuration, expectedRevision) {
		if (settingsCoordinator && settingsCoordinator.isRestoreInProgress()) {
			throw routingError('RESTORE_IN_PROGRESS', 'Routing cannot be saved while configuration restore is in progress.');
		}
		var validation = model.validate(configuration);
		if (!validation.valid) {
			throw routingError('VALIDATION_FAILED', 'Routing configuration contains errors.', validation);
		}
		var prior;
		try {
			prior = parseSaved();
		} catch (error) {
			throw routingError('INVALID_SAVED_CONFIGURATION', 'Reset the invalid saved routing before saving a draft.', publicError(error));
		}
		var currentRevision = prior.configuration ? model.revision(prior.configuration) : null;
		if (expectedRevision !== currentRevision) {
			throw routingError('REVISION_CONFLICT', 'The saved routing changed while this draft was being edited.', {currentRevision: currentRevision});
		}
		var normalized = model.normalize(configuration);
		try {
			writer.writeJSONAtomic(target, normalized);
			var verified = parseSaved();
			var verifiedValidation = model.validate(verified.configuration);
			if (!verifiedValidation.valid || model.revision(verified.configuration) !== model.revision(normalized)) {
				throw routingError('READBACK_VERIFICATION_FAILED', 'The saved routing could not be verified.');
			}
		} catch (error) {
			if (!matchesPrior(prior)) rollback(prior);
			if (error.code && error.code.indexOf('ROUTING_') === 0) throw error;
			throw routingError(error.code || 'SAVE_FAILED', 'Routing could not be saved: ' + error.message, publicError(error));
		}
		return {
			configuration: normalized,
			revision: model.revision(normalized),
			validation: validation,
			verified: true
		};
	}

	function matchesPrior(prior) {
		try {
			var current = parseSaved();
			if (current.exists !== prior.exists) return false;
			if (!current.exists) return true;
			return model.revision(current.configuration) === model.revision(prior.configuration);
		} catch (error) {
			return false;
		}
	}

	function reset(expectedRevision) {
		try {
			parseSaved();
			return save(model.defaultConfiguration(), expectedRevision);
		} catch (error) {
			if (error.code !== 'MALFORMED_SAVED_CONFIGURATION' && error.code !== 'INVALID_SAVED_CONFIGURATION') throw error;
			if (expectedRevision !== null) {
				throw routingError('REVISION_CONFLICT', 'The saved routing changed while this draft was being edited.', {currentRevision: null});
			}
			var configuration = model.defaultConfiguration();
			writer.writeJSONAtomic(target, configuration);
			var verified = parseSaved();
			return {
				configuration: verified.configuration,
				revision: model.revision(verified.configuration),
				validation: model.validate(verified.configuration),
				verified: true
			};
		}
	}

	function rollback(prior) {
		try {
			if (prior.exists && prior.configuration) {
				writer.writeJSONAtomic(target, prior.configuration);
			} else if (!prior.exists && fileSystem.existsSync(target)) {
				fileSystem.unlinkSync(target);
			}
		} catch (error) {
			var rollbackError = routingError('ROLLBACK_FAILED', 'Routing save failed and the previous configuration could not be restored.', publicError(error));
			throw rollbackError;
		}
	}

	function publicError(error) {
		return {
			code: error.code || 'ROUTING_ERROR',
			message: error.message,
			stage: error.atomicWriteStage || null,
			details: error.details || null
		};
	}

	return {
		target: target,
		state: state,
		validate: validate,
		save: save,
		reset: reset,
		publicError: publicError
	};
}

module.exports = {
	SETTINGS_FILE: SETTINGS_FILE,
	createService: createService
};
