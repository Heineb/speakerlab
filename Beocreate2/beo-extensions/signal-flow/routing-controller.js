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
