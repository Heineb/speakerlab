'use strict';

function createController(options) {
	var service = options.service;
	var send = options.send;
	var runtime = options.runtime || function() { return {}; };

	function sendState(header) {
		send(header || 'state', service.state(runtime()));
	}

	function handle(event) {
		var content = event.content || {};
		try {
			switch (event.header) {
				case 'getState':
				case 'getCapabilities':
					sendState(event.header === 'getCapabilities' ? 'capabilities' : 'state');
					break;
				case 'validate':
					send('validation', {
						validation: service.validate(content.configuration),
						revision: content.revision === undefined ? null : content.revision
					});
					break;
				case 'calculateCrossoverResponse':
					send('crossoverResponse', service.crossoverPreview(content.configuration, content.outputId));
					break;
				case 'copyCrossover':
					var copied = service.copyCrossover(content.configuration, content.sourceOutputId, content.destinationOutputId);
					send('crossoverDraft', {
						action: 'copy',
						configuration: copied.configuration,
						validation: copied.validation,
						revision: content.revision === undefined ? null : content.revision
					});
					break;
				case 'resetCrossover':
					var crossoverReset = service.resetCrossover(content.configuration, content.outputId);
					send('crossoverDraft', {
						action: 'reset',
						configuration: crossoverReset.configuration,
						validation: crossoverReset.validation,
						revision: content.revision === undefined ? null : content.revision
					});
					break;
				case 'copyProcessing':
					var processingCopy = service.copyProcessing(content.configuration, content.sourceOutputId, content.destinationOutputId);
					send('processingDraft', {
						action: 'copy',
						configuration: processingCopy.configuration,
						validation: processingCopy.validation,
						revision: content.revision === undefined ? null : content.revision
					});
					break;
				case 'resetProcessing':
					var processingReset = service.resetProcessing(content.configuration, content.outputId);
					send('processingDraft', {
						action: 'reset',
						configuration: processingReset.configuration,
						validation: processingReset.validation,
						revision: content.revision === undefined ? null : content.revision
					});
					break;
				case 'calculateEQResponse':
					send('eqResponse', service.eqPreview(content.configuration, content.outputId));
					break;
				case 'eqDraft':
					var eqDraft = service.eqDraft(content.configuration, content.action, content.outputId,
						content.bandId, content.type, content.destinationOutputId);
					send('eqDraft', {
						action: eqDraft.action,
						configuration: eqDraft.configuration,
						bandId: eqDraft.bandId,
						validation: eqDraft.validation,
						revision: content.revision === undefined ? null : content.revision
					});
					break;
				case 'eligibleEQMeasurements':
					send('eligibleEQMeasurements', service.eligibleEQMeasurements(content.configuration, content.outputId));
					break;
				case 'suggestEQ':
					send('eqSuggestions', service.suggestEQ(content.configuration, content.outputId, content.measurementId, content.options));
					break;
				case 'acceptEQSuggestions':
					var acceptedSuggestions = service.acceptEQSuggestions(content.configuration, content.outputId, content.analysisId,
						content.selectedSuggestionIds, content.revision === undefined ? null : content.revision);
					send('eqSuggestionDraft', {
						configuration: acceptedSuggestions.configuration,
						outputId: acceptedSuggestions.outputId,
						acceptedSuggestionIds: acceptedSuggestions.acceptedSuggestionIds,
						validation: acceptedSuggestions.validation,
						revision: content.revision === undefined ? null : content.revision
					});
					break;
				case 'eligibleAlignments':
					send('eligibleAlignments', service.eligibleAlignments(content.configuration, content.outputId));
					break;
				case 'analyseAlignment':
					send('alignmentAnalysis', service.analyseAlignment(content.configuration, content.measurementAId, content.measurementBId, content.options));
					break;
				case 'acceptAlignment':
					var acceptedAlignment = service.acceptAlignment(content.configuration, content.analysisId, content.revision === undefined ? null : content.revision);
					send('alignmentDraft', {configuration: acceptedAlignment.configuration, outputId: acceptedAlignment.outputId,
						delayMs: acceptedAlignment.delayMs, polarityInverted: acceptedAlignment.polarityInverted,
						validation: acceptedAlignment.validation, revision: content.revision === undefined ? null : content.revision});
					break;
				case 'calculateProtection':
					send('protectionPreview', service.protectionPreview(content.configuration, content.outputId));
					break;
				case 'simulateProtection':
					send('protectionSimulation', service.simulateProtection(content.configuration, content.outputId, content.sequence));
					break;
				case 'previewMeasurement':
					send('measurementPreview', service.measurementPreview(content.text, content.filename));
					break;
				case 'measurementDraft':
					var measurementDraft = service.measurementDraft(content.configuration, content.action, content);
					send('measurementDraft', {action: measurementDraft.action, configuration: measurementDraft.configuration, measurementId: measurementDraft.measurementId, validation: measurementDraft.validation, revision: content.revision === undefined ? null : content.revision});
					break;
				case 'measurementOverlay':
					send('measurementOverlay', service.measurementOverlay(content.configuration, content.measurementId));
					break;
				case 'previewMeasurementMerge':
					send('measurementMergePreview', service.measurementMergePreview(content.configuration, content));
					break;
				case 'saveMeasurementMerge':
					var mergeDraft = service.saveMeasurementMerge(content.configuration, content);
					send('measurementDraft', {action: 'merge', configuration: mergeDraft.configuration, measurementId: mergeDraft.measurementId, recipe: mergeDraft.recipe, validation: mergeDraft.validation, revision: content.revision === undefined ? null : content.revision});
					break;
				case 'prepareForDSP':
					send('deploymentResult', {action: 'compile', deployment: service.prepareForDSP(content.revision, runtime())});
					break;
				case 'applyToSimulator':
					send('deploymentResult', {action: 'apply', deployment: service.applyToSimulator(content.revision, runtime())});
					break;
				case 'readSimulator':
					send('deploymentResult', {action: 'readback', deployment: service.readSimulator(content.revision, runtime())});
					break;
				case 'compareSimulator':
					send('deploymentResult', {action: 'compare', deployment: service.compareSimulator(content.revision, runtime())});
					break;
				case 'clearSimulator':
					send('deploymentResult', {action: 'clear', deployment: service.clearSimulator(runtime())});
					break;
				case 'setSimulationScenario':
					send('deploymentResult', {action: 'scenario', deployment: service.setSimulationScenario(content.scenario, runtime())});
					break;
				case 'save':
					var saved = service.save(content.configuration, content.revision === undefined ? null : content.revision);
					send('saveResult', {
						success: true,
						configuration: saved.configuration,
						revision: saved.revision,
						validation: saved.validation,
						verified: saved.verified,
						deploymentStatus: 'not-deployed'
					});
					break;
				case 'reset':
					var reset = service.reset(content.revision === undefined ? null : content.revision);
					send('resetResult', {
						success: true,
						configuration: reset.configuration,
						revision: reset.revision,
						validation: reset.validation,
						verified: reset.verified,
						deploymentStatus: 'not-deployed'
					});
					break;
				default:
					return false;
			}
		} catch (error) {
			send(event.header === 'save' ? 'saveResult' : event.header === 'reset' ? 'resetResult' : 'error', {
				success: false,
				error: service.publicError(error)
			});
		}
		return true;
	}

	return {handle: handle, sendState: sendState};
}

module.exports = {createController: createController};
