'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var atomicJSON = require('../../beo-system/atomic-json-file');
var routingModel = require('./routing-model');
var targetModel = require('./dsp-target-capability');
var designCompiler = require('./dsp-design-compiler');

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
	var planSimulator = options.planSimulator || null;
	var compiler = options.compiler || designCompiler;
	var clock = options.clock || function() { return new Date(); };
	var pendingMeasurements = {};
	var pendingEQSuggestions = {};
	var pendingAlignments = {};
	var lastCompilation = null;
	var lastReadback = null;
	var lastComparison = null;
	var target = path.join(options.dataDirectory, SETTINGS_FILE);

	function programIdentity(runtime) {
		if (runtime && runtime.programIdentity) return runtime.programIdentity;
		if (runtime && runtime.simulated) {
			return {
				programID: targetModel.PROGRAM.id,
				profileVersion: targetModel.PROGRAM.profileVersion,
				checksum: targetModel.PROGRAM.checksum,
				metadataAvailable: true
			};
		}
		return {metadataAvailable: false};
	}

	function deploymentState(runtime, revision) {
		var simulatorState = planSimulator ? planSimulator.state() : {connected: false, hasAppliedPlan: false, partial: false, muted: true};
		var identityCandidate = programIdentity(runtime);
		if (simulatorState.identityMismatch) identityCandidate = {programID: targetModel.PROGRAM.id, profileVersion: 10, checksum: 'IDENTITY-CHANGED', metadataAvailable: true};
		var identity = targetModel.identify(identityCandidate);
		var stale = !!(lastCompilation && lastCompilation.sourceDesignRevision !== revision);
		if (simulatorState.identityMismatch) stale = true;
		var readinessOverrides = simulatorState.readinessScenario === 'unknown-mapping' ? {unknownField: 'routing'} :
			simulatorState.readinessScenario === 'readback-unavailable' ? {unreadableField: 'gain'} : null;
		return {
			target: targetModel.capability({readinessOverrides: readinessOverrides}),
			identity: identity,
			simulator: simulatorState,
			compilation: lastCompilation,
			readback: lastReadback,
			comparison: lastComparison,
			stale: stale,
			previewOnly: true,
			physicalDeploymentAllowed: false
		};
	}

	function validateDesign(configuration) {
		var validation = model.validate(configuration);
		if (!validation.valid) return validation;
		try {
			configuration.crossover.outputs.forEach(function(output) {
				model.crossoverModel.designFilter('high-pass', output.highPass, configuration.crossover.sampleRateHz);
				model.crossoverModel.designFilter('low-pass', output.lowPass, configuration.crossover.sampleRateHz);
				model.crossoverModel.preview(output, configuration.crossover.sampleRateHz, {points: 9});
			});
			var eqConfiguration = configuration.parametricEQ || model.eqModel.defaultConfiguration(model.OUTPUT_IDS);
			eqConfiguration.outputs.forEach(function(output) {
				output.bands.filter(function(band) { return band.enabled; }).forEach(function(band) {
					model.eqModel.designBand(band, eqConfiguration.sampleRateHz);
				});
			});
		} catch (error) {
			validation.valid = false;
			validation.errors.push({
				level: 'error',
				code: 'INVALID_COEFFICIENT_CALCULATION',
				message: 'Crossover coefficients or response could not be calculated: ' + error.message,
				path: 'crossover'
			});
		}
		return validation;
	}

	function parseSaved() {
		if (!fileSystem.existsSync(target)) return {exists: false, configuration: null};
		var raw = fileSystem.readFileSync(target, 'utf8');
		var configuration;
		try {
			configuration = JSON.parse(raw);
		} catch (error) {
			throw routingError('MALFORMED_SAVED_CONFIGURATION', 'The saved routing configuration is malformed JSON.');
		}
		var validation = validateDesign(configuration);
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
		var revision = saved.configuration ? model.revision(configuration) : null;
		return {
			capabilities: model.capabilities(true),
			configuration: configuration,
			revision: revision,
			hasSavedConfiguration: !!saved.configuration,
			validation: validateDesign(configuration),
			loadError: loadError,
			runtime: {
				simulated: !!(runtime && runtime.simulated),
				connected: !!(runtime && runtime.connected),
				deploymentStatus: 'not-deployed',
				statusLabel: runtime && runtime.simulated ? 'Saved design · Simulated · Not deployed to DSP' : 'Saved design · Not deployed to DSP'
			},
			deployment: deploymentState(runtime, revision)
		};
	}

	function validate(configuration) {
		return validateDesign(configuration);
	}

	function save(configuration, expectedRevision) {
		if (settingsCoordinator && settingsCoordinator.isRestoreInProgress()) {
			throw routingError('RESTORE_IN_PROGRESS', 'Routing cannot be saved while configuration restore is in progress.');
		}
		var validation = validateDesign(configuration);
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
			var verifiedValidation = validateDesign(verified.configuration);
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
				validation: validateDesign(verified.configuration),
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

	function crossoverPreview(configuration, outputID) {
		var validation = validateDesign(configuration);
		if (!validation.valid) throw routingError('VALIDATION_FAILED', 'A crossover preview cannot be calculated while the design contains errors.', validation);
		var output = configuration.crossover.outputs.find(function(item) { return item.outputId === outputID; });
		if (!output) throw routingError('UNKNOWN_CROSSOVER_OUTPUT', 'The selected crossover output is not available.');
		return {
			outputId: outputID,
			response: model.crossoverModel.preview(output, configuration.crossover.sampleRateHz),
			deploymentStatus: 'not-deployed'
		};
	}

	function copyCrossover(configuration, sourceOutputID, destinationOutputID) {
		var normalized = model.normalize(configuration);
		var source = normalized.crossover.outputs.find(function(item) { return item.outputId === sourceOutputID; });
		var destination = normalized.crossover.outputs.find(function(item) { return item.outputId === destinationOutputID; });
		if (!source || !destination || source === destination) {
			throw routingError('INVALID_CROSSOVER_COPY', 'Choose two different available outputs for crossover copy.');
		}
		destination.highPass = model.clone(source.highPass);
		destination.lowPass = model.clone(source.lowPass);
		return {configuration: normalized, validation: validateDesign(normalized)};
	}

	function resetCrossover(configuration, outputID) {
		var normalized = model.normalize(configuration);
		var output = normalized.crossover.outputs.find(function(item) { return item.outputId === outputID; });
		if (!output) throw routingError('UNKNOWN_CROSSOVER_OUTPUT', 'The selected crossover output is not available.');
		output.highPass = model.crossoverModel.defaultFilter('high-pass');
		output.lowPass = model.crossoverModel.defaultFilter('low-pass');
		return {configuration: normalized, validation: validateDesign(normalized)};
	}

	function copyProcessing(configuration, sourceOutputID, destinationOutputID) {
		var normalized = model.normalize(configuration);
		var source = normalized.channelProcessing.outputs.find(function(item) { return item.outputId === sourceOutputID; });
		var destination = normalized.channelProcessing.outputs.find(function(item) { return item.outputId === destinationOutputID; });
		if (!source || !destination || source === destination) {
			throw routingError('INVALID_PROCESSING_COPY', 'Choose two different available outputs for processing copy.');
		}
		destination.gain = model.clone(source.gain);
		destination.delay = model.clone(source.delay);
		destination.polarity = model.clone(source.polarity);
		return {configuration: normalized, validation: validateDesign(normalized)};
	}

	function resetProcessing(configuration, outputID) {
		var normalized = model.normalize(configuration);
		var index = normalized.channelProcessing.outputs.findIndex(function(item) { return item.outputId === outputID; });
		if (index === -1) throw routingError('UNKNOWN_PROCESSING_OUTPUT', 'The selected processing output is not available.');
		normalized.channelProcessing.outputs[index] = model.processingModel.defaultConfiguration([outputID]).outputs[0];
		return {configuration: normalized, validation: validateDesign(normalized)};
	}

	function eqPreview(configuration, outputID) {
		var validation = validateDesign(configuration);
		if (!validation.valid) throw routingError('VALIDATION_FAILED', 'An EQ preview cannot be calculated while the design contains errors.', validation);
		var normalized = model.normalize(configuration);
		var output = normalized.parametricEQ.outputs.find(function(item) { return item.outputId === outputID; });
		var crossover = normalized.crossover.outputs.find(function(item) { return item.outputId === outputID; });
		var processing = normalized.channelProcessing.outputs.find(function(item) { return item.outputId === outputID; });
		if (!output) throw routingError('UNKNOWN_EQ_OUTPUT', 'The selected EQ output is not available.');
		return {
			outputId: outputID,
			response: model.eqModel.preview(output, crossover, model.crossoverModel, processing.gain.valueDb),
			deploymentStatus: 'not-deployed'
		};
	}

	function protectionPreview(configuration, outputID) {
		var normalized = model.normalize(configuration);
		var protection = normalized.driverProtection.outputs.find(function(item) { return item.outputId === outputID; });
		var equaliser = normalized.parametricEQ.outputs.find(function(item) { return item.outputId === outputID; });
		var crossover = normalized.crossover.outputs.find(function(item) { return item.outputId === outputID; });
		var processing = normalized.channelProcessing.outputs.find(function(item) { return item.outputId === outputID; });
		if (!protection || !equaliser || !crossover || !processing) throw routingError('UNKNOWN_PROTECTION_OUTPUT', 'The selected protection output is not available.');
		var response = model.eqModel.preview(equaliser, crossover, model.crossoverModel, processing.gain.valueDb);
		var calculation = model.protectionModel.calculateOutput(protection, {
			channelGainDb: processing.gain.valueDb,
			maximumEqBoostDb: response.maximumEqBoostDb,
			maximumElectricalGainDb: Math.max.apply(null, response.points.map(function(point) {
				return point.magnitudeDb + processing.gain.valueDb;
			}))
		});
		var validation = validateDesign(normalized);
		return {
			outputId: outputID,
			calculation: calculation,
			warnings: validation.warnings.filter(function(item) { return item.path === outputID || (item.path && item.path.indexOf(outputID) !== -1); }),
			errors: validation.errors.filter(function(item) { return item.path && item.path.indexOf('driverProtection.outputs[' + model.OUTPUT_IDS.indexOf(outputID) + ']') !== -1; }),
			target: targetModel.capability().driverProtection,
			physicalDeploymentAllowed: false
		};
	}

	function simulateProtection(configuration, outputID, sequence) {
		var normalized = model.normalize(configuration);
		var preview = protectionPreview(normalized, outputID);
		var protection = normalized.driverProtection.outputs.find(function(item) { return item.outputId === outputID; });
		return {
			outputId: outputID,
			calculation: preview.calculation,
			simulation: model.protectionModel.simulateLimiter(protection.limiter,
				preview.calculation.simulatorThresholdDbfs, sequence || [
					{levelDbfs: -20, durationMs: 50}, {levelDbfs: -6, durationMs: 20},
					{levelDbfs: 0, durationMs: 5}, {levelDbfs: 0, durationMs: 100},
					{levelDbfs: -20, durationMs: 500}
				]),
			physicalDeploymentAllowed: false
		};
	}

	function eqDraft(configuration, action, outputID, bandID, type, destinationOutputID) {
		var normalized = model.normalize(configuration);
		var result;
		try {
			if (action === 'add') result = model.eqModel.addBand(normalized.parametricEQ, outputID, type);
			if (action === 'duplicate') result = model.eqModel.duplicateBand(normalized.parametricEQ, outputID, bandID);
			if (action === 'remove') result = {configuration: model.eqModel.removeBand(normalized.parametricEQ, outputID, bandID)};
			if (action === 'reset') {
				var resetOutput = normalized.parametricEQ.outputs.find(function(item) { return item.outputId === outputID; });
				if (!resetOutput) throw new Error('Unknown EQ output.');
				resetOutput.bands = [];
				result = {configuration: normalized.parametricEQ};
			}
			if (action === 'copy') result = {configuration: model.eqModel.copyEQ(normalized.parametricEQ, outputID, destinationOutputID)};
		} catch (error) {
			throw routingError('INVALID_EQ_DRAFT_OPERATION', error.message);
		}
		if (!result) throw routingError('UNKNOWN_EQ_DRAFT_OPERATION', 'Unknown EQ draft operation.');
		normalized.parametricEQ = result.configuration;
		return {
			action: action,
			configuration: normalized,
			bandId: result.bandId || null,
			validation: validateDesign(normalized)
		};
	}

	function eligibleEQMeasurements(configuration, outputID) {
		var normalized = model.normalize(configuration);
		if (model.OUTPUT_IDS.indexOf(outputID) === -1) throw routingError('UNKNOWN_EQ_OUTPUT', 'The selected EQ output is not available.');
		return {
			outputId: outputID,
			measurements: normalized.measurements.measurements.map(function(measurement) {
				var result = model.eqSuggestionModel.eligibility(measurement, normalized.measurements.measurements, outputID);
				return {id: measurement.id, name: measurement.name, type: measurement.type, sourceFormat: measurement.sourceFormat,
					minimumFrequencyHz: measurement.points[0].frequencyHz, maximumFrequencyHz: measurement.points[measurement.points.length - 1].frequencyHz,
					eligible: result.eligible, errors: result.errors, warnings: result.warnings};
			}),
			physicalDeploymentAllowed: false
		};
	}

	function suggestEQ(configuration, outputID, measurementID, suggestionOptions) {
		var validation = validateDesign(configuration);
		if (!validation.valid) throw routingError('VALIDATION_FAILED', 'EQ suggestions require a valid design draft.', validation);
		var normalized = model.normalize(configuration);
		var output = normalized.outputs.find(function(item) { return item.id === outputID; });
		var measurement = normalized.measurements.measurements.find(function(item) { return item.id === measurementID; });
		var eqOutput = normalized.parametricEQ.outputs.find(function(item) { return item.outputId === outputID; });
		var crossoverOutput = normalized.crossover.outputs.find(function(item) { return item.outputId === outputID; });
		var protection = normalized.driverProtection.outputs.find(function(item) { return item.outputId === outputID; });
		if (!output || !eqOutput || !crossoverOutput || !protection) throw routingError('UNKNOWN_EQ_OUTPUT', 'The selected EQ output is not available.');
		var analysis = model.eqSuggestionModel.analyse({measurement: measurement, measurements: normalized.measurements.measurements,
			output: output, crossoverOutput: crossoverOutput, eqOutput: eqOutput, protection: protection, options: suggestionOptions}, model.eqModel);
		if (!analysis.valid) throw routingError('EQ_SUGGESTION_FAILED', 'EQ suggestions could not be generated.', analysis);
		var analysisId = 'eq-analysis-' + crypto.createHash('sha256').update(JSON.stringify({outputID: outputID, revision: model.revision(normalized), analysis: analysis})).digest('hex').slice(0, 16);
		analysis.analysisId = analysisId;
		analysis.outputId = outputID;
		pendingEQSuggestions[analysisId] = {analysis: model.clone(analysis), outputId: outputID, sourceRevision: model.revision(normalized)};
		return analysis;
	}

	function acceptEQSuggestions(configuration, outputID, analysisID, selectedIDs, expectedRevision) {
		var pending = pendingEQSuggestions[analysisID];
		if (!pending || pending.outputId !== outputID) throw routingError('STALE_EQ_SUGGESTIONS', 'Generate current EQ suggestions before accepting.');
		var prior = parseSaved();
		var currentRevision = prior.configuration ? model.revision(prior.configuration) : null;
		if (expectedRevision !== currentRevision) throw routingError('REVISION_CONFLICT', 'The saved routing changed while these suggestions were being reviewed.', {currentRevision: currentRevision});
		var normalized = model.normalize(configuration);
		if (model.revision(normalized) !== pending.sourceRevision) throw routingError('STALE_EQ_SUGGESTIONS', 'The design draft changed; generate suggestions again before accepting.');
		var source = normalized.measurements.measurements.find(function(item) { return item.id === pending.analysis.measurement.id; });
		if (!source || source.integrity.hash !== pending.analysis.measurement.hash) throw routingError('STALE_EQ_SUGGESTIONS', 'The source measurement changed; generate suggestions again.');
		var accepted;
		try { accepted = model.eqSuggestionModel.accept(normalized.parametricEQ, outputID, pending.analysis, selectedIDs || [], model.eqModel); }
		catch (error) { throw routingError('INVALID_EQ_SUGGESTION_ACCEPTANCE', error.message); }
		normalized.parametricEQ = accepted.configuration;
		var validation = validateDesign(normalized);
		if (!validation.valid) throw routingError('VALIDATION_FAILED', 'Accepted suggestions do not produce a valid EQ draft.', validation);
		delete pendingEQSuggestions[analysisID];
		return {configuration: normalized, outputId: outputID, acceptedSuggestionIds: accepted.acceptedSuggestionIds, validation: validation};
	}

	function eligibleAlignments(configuration, outputID) {
		var normalized = model.normalize(configuration);
		if (model.OUTPUT_IDS.indexOf(outputID) === -1) throw routingError('UNKNOWN_ALIGNMENT_OUTPUT', 'The selected alignment output is not available.');
		var primary = normalized.measurements.measurements.filter(function(item) { return item.assignedOutputId === outputID; });
		var pairs = [];
		primary.forEach(function(first) {
			normalized.measurements.measurements.forEach(function(second) {
				if (second.id === first.id || second.assignedOutputId === outputID) return;
				var result = model.phaseAlignmentModel.eligibility(normalized, first, second);
				pairs.push({measurementAId: first.id, measurementAName: first.name, measurementBId: second.id, measurementBName: second.name,
					outputAId: first.assignedOutputId, outputBId: second.assignedOutputId, eligible: result.eligible,
					errors: result.errors, warnings: result.warnings, referenceMode: result.referenceMode, crossoverContext: result.crossoverContext});
			});
		});
		return {outputId: outputID, pairs: pairs, physicalDeploymentAllowed: false};
	}

	function analyseAlignment(configuration, measurementAID, measurementBID, alignmentOptions) {
		var validation = validateDesign(configuration);
		if (!validation.valid) throw routingError('VALIDATION_FAILED', 'Driver alignment requires a valid design draft.', validation);
		var normalized = model.normalize(configuration);
		var first = normalized.measurements.measurements.find(function(item) { return item.id === measurementAID; });
		var second = normalized.measurements.measurements.find(function(item) { return item.id === measurementBID; });
		var analysis = model.phaseAlignmentModel.analyse({configuration: normalized, measurementA: first, measurementB: second, options: alignmentOptions || {}}, {
			crossover: model.crossoverModel, eq: model.eqModel, processing: model.processingModel
		});
		if (!analysis.valid) throw routingError('ALIGNMENT_ANALYSIS_FAILED', 'Driver phase/time alignment could not be analysed.', analysis);
		var analysisID = 'alignment-analysis-' + crypto.createHash('sha256').update(JSON.stringify({revision: model.revision(normalized), analysis: analysis})).digest('hex').slice(0, 16);
		analysis.analysisId = analysisID;
		pendingAlignments[analysisID] = {analysis: model.clone(analysis), sourceRevision: model.revision(normalized)};
		return analysis;
	}

	function acceptAlignment(configuration, analysisID, expectedRevision) {
		var pending = pendingAlignments[analysisID];
		if (!pending) throw routingError('STALE_ALIGNMENT_ANALYSIS', 'Generate a current alignment suggestion before accepting.');
		var prior = parseSaved();
		var currentRevision = prior.configuration ? model.revision(prior.configuration) : null;
		if (expectedRevision !== currentRevision) throw routingError('REVISION_CONFLICT', 'The saved routing changed while this alignment was being reviewed.', {currentRevision: currentRevision});
		var normalized = model.normalize(configuration);
		if (model.revision(normalized) !== pending.sourceRevision) throw routingError('STALE_ALIGNMENT_ANALYSIS', 'The design draft changed; analyse alignment again before accepting.');
		pending.analysis.sources.forEach(function(reference) {
			var source = normalized.measurements.measurements.find(function(item) { return item.id === reference.id; });
			if (!source || !source.integrity || source.integrity.hash !== reference.hash) throw routingError('STALE_ALIGNMENT_ANALYSIS', 'An alignment source changed; analyse again before accepting.');
		});
		var accepted;
		try { accepted = model.phaseAlignmentModel.accept(normalized, pending.analysis, model.processingModel); }
		catch (error) { throw routingError('INVALID_ALIGNMENT_ACCEPTANCE', error.message); }
		var validation = validateDesign(accepted.configuration);
		if (!validation.valid) throw routingError('VALIDATION_FAILED', 'The accepted alignment does not produce a valid processing draft.', validation);
		delete pendingAlignments[analysisID];
		return {configuration: accepted.configuration, outputId: accepted.outputId, delayMs: accepted.delayMs, polarityInverted: accepted.polarityInverted, validation: validation};
	}

	function measurementPreview(text, filename) {
		var preview = model.measurementModel.parseText(text);
		var token = model.measurementModel.hash(preview.points).slice(0, 24);
		pendingMeasurements = {};
		pendingMeasurements[token] = {preview: preview, filename: String(filename || '').replace(/^.*[\\/]/, '')};
		return {token: token, detectedFormat: preview.format, confidence: preview.confidence, recognizedColumns: preview.recognizedColumns, ignoredColumns: preview.ignoredColumns, warnings: preview.warnings, summary: preview.summary, sourceMetadata: preview.metadata.slice(0, 30)};
	}

	function measurementDraft(configuration, action, content) {
		if (['import', 'update', 'assign', 'remove'].indexOf(action) === -1) throw routingError('UNKNOWN_MEASUREMENT_OPERATION', 'Unknown measurement draft operation.');
		var normalized = model.normalize(configuration);
		var list = normalized.measurements.measurements;
		var measurement;
		if (action === 'import') {
			var pending = pendingMeasurements[content.token];
			if (!pending) throw routingError('INVALID_MEASUREMENT_TOKEN', 'Measurement preview expired; select the file again.');
			measurement = model.measurementModel.create(pending.preview, {filename: pending.filename, name: content.name, type: content.type, importedAt: clock().toISOString(), conditions: {timingReference: {kind: content.timingReferenceKind || 'unknown', group: String(content.timingReferenceGroup || '').trim() || null}}});
			if (list.some(function(item) { return item.id === measurement.id; })) throw routingError('DUPLICATE_MEASUREMENT_ID', 'This exact measurement is already present in the design.');
			list.push(measurement);
			delete pendingMeasurements[content.token];
		} else {
			measurement = list.find(function(item) { return item.id === content.measurementId; });
			if (!measurement) throw routingError('UNKNOWN_MEASUREMENT', 'The selected measurement is not available.');
			if (action === 'update') {
				if (content.name !== undefined) measurement.name = String(content.name).trim().slice(0, 120);
				if (content.description !== undefined) measurement.description = String(content.description).slice(0, 1000);
				if (content.type !== undefined) measurement.type = content.type;
				if (content.timingReferenceKind !== undefined || content.timingReferenceGroup !== undefined) {
					measurement.conditions = measurement.conditions || {};
					measurement.conditions.timingReference = {
						kind: content.timingReferenceKind || 'unknown',
						group: String(content.timingReferenceGroup || '').trim() || null
					};
				}
				if (content.outputId !== undefined) {
					measurement.assignedOutputId = content.outputId || null;
					var updatedOutput = normalized.outputs.find(function(item) { return item.id === measurement.assignedOutputId; });
					measurement.driverRole = updatedOutput ? updatedOutput.role : null;
				}
			}
			if (action === 'assign') {
				measurement.assignedOutputId = content.outputId || null;
				var output = normalized.outputs.find(function(item) { return item.id === measurement.assignedOutputId; });
				measurement.driverRole = output ? output.role : null;
			}
			if (action === 'remove') {
				var dependent = list.find(function(item) { return item.mergeRecipe && (item.mergeRecipe.lowSourceId === measurement.id || item.mergeRecipe.highSourceId === measurement.id); });
				if (dependent) throw routingError('MEASUREMENT_HAS_DEPENDENT_MERGE', 'Remove the dependent merged response before removing this source.', {dependentMeasurementId: dependent.id, dependentName: dependent.name});
				list.splice(list.indexOf(measurement), 1);
			}
		}
		var validation = validateDesign(normalized);
		if (!validation.valid) throw routingError('VALIDATION_FAILED', 'Measurement change is not valid.', validation);
		return {action: action, configuration: normalized, measurementId: measurement ? measurement.id : null, validation: validation};
	}

	function measurementMergePreview(configuration, content) {
		var normalized = model.normalize(configuration);
		var measurements = normalized.measurements.measurements;
		var low = measurements.find(function(item) { return item.id === content.lowSourceId; });
		var high = measurements.find(function(item) { return item.id === content.highSourceId; });
		if (!low || !high) throw routingError('MISSING_MERGE_SOURCE', 'Choose two available source measurements.');
		var alignment = model.measurementMergeModel.alignment(low, high);
		var mergeFrequency = content.mergeFrequencyHz;
		if (mergeFrequency === undefined || mergeFrequency === null || mergeFrequency === '') mergeFrequency = alignment.overlap.available ? Math.sqrt(alignment.overlap.startHz * alignment.overlap.endHz) : 0;
		var recipeID = content.recipeId || content.id, resultMeasurementID = content.resultMeasurementId;
		if (!recipeID && !resultMeasurementID) {
			var baseRecipe = model.measurementMergeModel.recipe({low: low, high: high, mergeFrequencyHz: mergeFrequency, transitionWidthOctaves: content.transitionWidthOctaves === undefined ? 0.5 : content.transitionWidthOctaves, magnitudeOffsetDb: content.magnitudeOffsetDb === undefined ? 0 : content.magnitudeOffsetDb});
			recipeID = baseRecipe.id; resultMeasurementID = baseRecipe.resultMeasurementId;
			var suffix = 2;
			while (measurements.some(function(item) { return item.id === resultMeasurementID; })) { recipeID = baseRecipe.id + '-' + suffix++; resultMeasurementID = recipeID + '-result'; }
		}
		var recipe = model.measurementMergeModel.recipe({id: recipeID, low: low, high: high, resultMeasurementId: resultMeasurementID, mergeFrequencyHz: mergeFrequency, transitionWidthOctaves: content.transitionWidthOctaves === undefined ? 0.5 : content.transitionWidthOctaves, magnitudeOffsetDb: content.magnitudeOffsetDb === undefined ? 0 : content.magnitudeOffsetDb, name: content.name || 'Merged ' + low.name + ' + ' + high.name, notes: content.notes || ''});
		var validation = model.measurementMergeModel.validate(recipe, measurements, content.resultMeasurementId || null);
		var result = null;
		if (validation.valid) result = model.measurementMergeModel.merge(recipe, measurements);
		return {recipe: recipe, validation: validation, suggestedAlignment: alignment, result: result ? {points: result.points, phaseAvailable: false, summary: result.points.length + ' derived magnitude points; phase is unavailable.'} : null, sources: [low, high].map(function(source) { return {id: source.id, name: source.name, type: source.type, hash: source.integrity.hash, assignedOutputId: source.assignedOutputId, minimumFrequencyHz: source.points[0].frequencyHz, maximumFrequencyHz: source.points[source.points.length - 1].frequencyHz, phaseAvailable: Boolean(source.units.phase), warnings: source.validation && source.validation.warnings ? source.validation.warnings : []}; }), sourcePointsUnchanged: true, acousticClaim: false};
	}

	function saveMeasurementMerge(configuration, content) {
		var normalized = model.normalize(configuration);
		var preview = measurementMergePreview(normalized, content);
		if (!preview.validation.valid || !preview.result) throw routingError('INVALID_MERGE_RECIPE', 'The merge cannot be saved until its errors are resolved.', preview.validation);
		var existingIndex = normalized.measurements.measurements.findIndex(function(item) { return item.id === preview.recipe.resultMeasurementId; });
		if (existingIndex !== -1 && (normalized.measurements.measurements[existingIndex].sourceFormat !== 'derived-merge' || normalized.measurements.measurements[existingIndex].mergeRecipe.id !== preview.recipe.id)) throw routingError('DERIVED_MEASUREMENT_ID_COLLISION', 'Derived measurement identifier collides with an existing measurement.');
		var result = {points: preview.result.points, validation: preview.validation};
		var existing = existingIndex === -1 ? null : normalized.measurements.measurements[existingIndex];
		var derived = model.measurementModel.createDerived(preview.recipe, result, {generatedAt: clock().toISOString(), assignedOutputId: existing ? existing.assignedOutputId : null, driverRole: existing ? existing.driverRole : null});
		if (existingIndex === -1) normalized.measurements.measurements.push(derived);
		else normalized.measurements.measurements[existingIndex] = derived;
		var validation = validateDesign(normalized);
		if (!validation.valid) throw routingError('VALIDATION_FAILED', 'Derived measurement could not be validated.', validation);
		return {configuration: normalized, measurementId: derived.id, recipe: preview.recipe, validation: validation};
	}

	function measurementOverlay(configuration, measurementID) {
		var normalized = model.normalize(configuration);
		var measurement = normalized.measurements.measurements.find(function(item) { return item.id === measurementID; });
		if (!measurement) throw routingError('UNKNOWN_MEASUREMENT', 'The selected measurement is not available.');
		var electrical = null;
		if (measurement.assignedOutputId) electrical = eqPreview(normalized, measurement.assignedOutputId).response;
		return {measurementId: measurementID, measured: measurement.points, electrical: electrical, labels: ['Measured response', 'Crossover electrical response', 'EQ electrical response', 'Combined electrical processing response'], acousticPrediction: false};
	}

	function prepareForDSP(expectedRevision, runtime) {
		var current = state(runtime);
		if (!current.hasSavedConfiguration) throw routingError('NO_SAVED_DESIGN', 'Save a valid design before preparing it for DSP.');
		lastCompilation = compiler.compile(current.configuration, {
			sourceRevision: expectedRevision,
			programIdentity: programIdentity(runtime)
		});
		lastReadback = null;
		lastComparison = null;
		return deploymentState(runtime, current.revision);
	}

	function applyToSimulator(expectedRevision, runtime) {
		var current = state(runtime);
		if (!planSimulator || !runtime || !runtime.simulated) throw routingError('SIMULATOR_REQUIRED', 'DSP preparation can only be applied to the local simulator in this slice.');
		if (!lastCompilation) throw routingError('COMPILATION_REQUIRED', 'Compile the saved design before applying it to the simulator.');
		if (lastCompilation.sourceDesignRevision !== expectedRevision || current.revision !== expectedRevision) {
			throw routingError('STALE_COMPILATION', 'The saved design changed. Recompile before simulator application.');
		}
		var result = planSimulator.apply(lastCompilation);
		if (!result.applied) throw routingError(result.error ? result.error.code : 'SIMULATED_APPLY_FAILED', result.error ? result.error.message : 'The simulator could not apply the complete plan.', result);
		lastReadback = null;
		lastComparison = null;
		return Object.assign({application: result}, deploymentState(runtime, current.revision));
	}

	function readSimulator(expectedRevision, runtime) {
		var current = state(runtime);
		if (!planSimulator || !runtime || !runtime.simulated) throw routingError('SIMULATOR_REQUIRED', 'Readback is available only from the local simulator in this slice.');
		if (!lastCompilation || lastCompilation.sourceDesignRevision !== expectedRevision) throw routingError('STALE_COMPILATION', 'Recompile before requesting simulator readback.');
		lastReadback = planSimulator.readback();
		return deploymentState(runtime, current.revision);
	}

	function compareSimulator(expectedRevision, runtime) {
		var current = state(runtime);
		if (!planSimulator || !lastCompilation) throw routingError('COMPILATION_REQUIRED', 'Compile and apply the design before comparison.');
		lastComparison = planSimulator.verify(lastCompilation, expectedRevision || current.revision, compiler);
		return deploymentState(runtime, current.revision);
	}

	function clearSimulator(runtime) {
		if (planSimulator) planSimulator.clear();
		lastReadback = null;
		lastComparison = null;
		return deploymentState(runtime, state(runtime).revision);
	}

	function setSimulationScenario(scenario, runtime) {
		if (!planSimulator || !runtime || !runtime.simulated) throw routingError('SIMULATOR_REQUIRED', 'Simulation scenarios are unavailable outside local development.');
		planSimulator.setScenario(scenario);
		return deploymentState(runtime, state(runtime).revision);
	}

	return {
		target: target,
		state: state,
		validate: validate,
		save: save,
		reset: reset,
		crossoverPreview: crossoverPreview,
		copyCrossover: copyCrossover,
		resetCrossover: resetCrossover,
		copyProcessing: copyProcessing,
		resetProcessing: resetProcessing,
		eqPreview: eqPreview,
		eqDraft: eqDraft,
		eligibleEQMeasurements: eligibleEQMeasurements,
		suggestEQ: suggestEQ,
		acceptEQSuggestions: acceptEQSuggestions,
		eligibleAlignments: eligibleAlignments,
		analyseAlignment: analyseAlignment,
		acceptAlignment: acceptAlignment,
		protectionPreview: protectionPreview,
		simulateProtection: simulateProtection,
		measurementPreview: measurementPreview,
		measurementDraft: measurementDraft,
		measurementOverlay: measurementOverlay,
		measurementMergePreview: measurementMergePreview,
		saveMeasurementMerge: saveMeasurementMerge,
		prepareForDSP: prepareForDSP,
		applyToSimulator: applyToSimulator,
		readSimulator: readSimulator,
		compareSimulator: compareSimulator,
		clearSimulator: clearSimulator,
		setSimulationScenario: setSimulationScenario,
		publicError: publicError
	};
}

module.exports = {
	SETTINGS_FILE: SETTINGS_FILE,
	createService: createService
};
