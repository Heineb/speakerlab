var signalFlow = (typeof window !== 'undefined' && window.signalFlow) ? window.signalFlow : (function(stateModel) {
	'use strict';

	if (!stateModel) {
		console.error('Signal Flow UI is unavailable because signalFlowUIState was not loaded.');
		return {
			available: false,
			update: function() {},
			updateCrossover: function() {},
			requestPreview: function() {},
			resetCrossover: function() {},
			copyCrossover: function() {},
			prepareForDSP: function() {},
			applyToSimulator: function() {},
			readSimulator: function() {},
			compareSimulator: function() {},
			clearSimulator: function() {},
			route: function() {},
			save: function() {},
			discard: function() {},
			reset: function() {},
			render: function() {},
			getState: function() { return null; }
		};
	}
	var signalFlowUIState = stateModel;
	var state = signalFlowUIState.create();
	var roleLabels = {
		'unassigned': 'Unassigned',
		'full-range': 'Full range',
		'woofer': 'Woofer',
		'midrange': 'Midrange',
		'tweeter': 'Tweeter',
		'subwoofer': 'Subwoofer'
	};
	var sideLabels = {unassigned: 'Unassigned', left: 'Left', right: 'Right', mono: 'Mono'};
	var processingUnits = {};

	$(document).on('general', function(event, data) {
		if (data.header === 'activatedExtension' && data.content.extension === 'signal-flow') {
			beo.send({target: 'signal-flow', header: 'getState'});
		}
		if (data.header === 'connection') {
			signalFlowUIState.connectionChanged(state, data.content.status === 'connected');
			render();
			if (data.content.status === 'connected') beo.send({target: 'signal-flow', header: 'getState'});
		}
	});

	$(document).on('signal-flow', function(event, data) {
		if (data.header === 'state' || data.header === 'capabilities') {
			signalFlowUIState.receiveState(state, data.content);
			if (state.draft) state.draft.outputs.forEach(function(output) { requestPreview(output.id); });
		}
		if (data.header === 'validation') {
			signalFlowUIState.receiveValidation(state, data.content.validation);
		}
		if (data.header === 'crossoverDraft') {
			signalFlowUIState.receiveCrossoverDraft(state, data.content);
			if (state.draft) state.draft.outputs.forEach(function(output) { requestPreview(output.id); });
		}
		if (data.header === 'processingDraft') {
			signalFlowUIState.receiveProcessingDraft(state, data.content);
		}
		if (data.header === 'crossoverResponse') {
			signalFlowUIState.receiveCrossoverResponse(state, data.content);
		}
		if (data.header === 'deploymentResult') {
			signalFlowUIState.receiveDeployment(state, data.content);
		}
		if (data.header === 'error' && data.content && data.content.error) {
			signalFlowUIState.deploymentError(state, data.content.error);
		}
		if (data.header === 'saveResult' || data.header === 'resetResult') {
			if (state.saving) {
				signalFlowUIState.saveResult(state, data.content);
			} else {
				signalFlowUIState.externalSave(state, data.content);
				if (!state.dirty && data.content.success) beo.send({target: 'signal-flow', header: 'getState'});
			}
		}
		render();
	});

	function escapeHTML(value) {
		return $('<div>').text(value == null ? '' : String(value)).html();
	}

	function option(value, label, selected) {
		return '<option value="' + escapeHTML(value) + '"' + (value === selected ? ' selected' : '') + '>' + escapeHTML(label) + '</option>';
	}

	function crossoverControls(output, crossover, filterType, title) {
		var filter = crossover[filterType];
		var families = state.capabilities.crossover.families.map(function(family) {
			return option(family.id, family.name, filter.family);
		}).join('');
		var selectedFamily = state.capabilities.crossover.families.find(function(family) { return family.id === filter.family; });
		var slopes = (selectedFamily ? selectedFamily.slopesDbPerOctave : []).map(function(slope) {
			return option(slope, slope + ' dB/octave', filter.slopeDbPerOctave);
		}).join('');
		var prefix = 'signal-flow-' + filterType + '-' + output.id;
		return '<fieldset class="signal-flow-crossover-filter"><legend>' + title + '</legend>' +
			'<label class="signal-flow-filter-enabled"><input type="checkbox" ' + (filter.enabled ? 'checked ' : '') +
			"onchange=\"signalFlow.updateCrossover('" + output.id + "', '" + filterType + "', 'enabled', this.checked);\"> Enabled</label>" +
			'<div class="signal-flow-crossover-fields">' +
			'<div class="signal-flow-field"><label for="' + prefix + '-family">Filter family</label><select id="' + prefix + '-family" ' +
			"onchange=\"signalFlow.updateCrossover('" + output.id + "', '" + filterType + "', 'family', this.value);\">" + families + '</select></div>' +
			'<div class="signal-flow-field"><label for="' + prefix + '-slope">Slope</label><select id="' + prefix + '-slope" ' +
			"onchange=\"signalFlow.updateCrossover('" + output.id + "', '" + filterType + "', 'slopeDbPerOctave', Number(this.value));\">" + slopes + '</select></div>' +
			'<div class="signal-flow-field"><label for="' + prefix + '-frequency">Cutoff frequency</label><div class="signal-flow-frequency">' +
			'<input id="' + prefix + '-frequency" type="number" inputmode="decimal" min="' + state.capabilities.crossover.minFrequencyHz +
			'" max="' + state.capabilities.crossover.maxFrequencyHz + '" value="' + escapeHTML(filter.cutoffHz) + '" ' +
			"onchange=\"signalFlow.updateCrossover('" + output.id + "', '" + filterType + "', 'cutoffHz', this.value);\"><span>Hz</span></div></div>" +
			'</div></fieldset>';
	}

	function responsePreview(outputID) {
		var response = state.crossoverResponses[outputID];
		if (!response) return '<div class="signal-flow-response pending"><p>Electrical filter response</p><p>Waiting for a valid simulated preview…</p></div>';
		var width = 560;
		var height = 180;
		var left = 42;
		var top = 12;
		var graphWidth = width - left - 10;
		var graphHeight = height - top - 28;
		var minimumLog = Math.log(response.minimumHz);
		var rangeLog = Math.log(response.maximumHz) - minimumLog;
		var points = response.points.map(function(point) {
			var x = left + (Math.log(point.frequencyHz) - minimumLog) / rangeLog * graphWidth;
			var db = Math.max(-60, Math.min(6, point.magnitudeDb));
			var y = top + (6 - db) / 66 * graphHeight;
			return x.toFixed(1) + ',' + y.toFixed(1);
		}).join(' ');
		function marker(frequency, label) {
			if (!frequency) return '';
			var x = left + (Math.log(frequency) - minimumLog) / rangeLog * graphWidth;
			return '<line x1="' + x.toFixed(1) + '" y1="' + top + '" x2="' + x.toFixed(1) + '" y2="' + (top + graphHeight) + '" class="signal-flow-cutoff"></line>' +
				'<text x="' + x.toFixed(1) + '" y="' + (height - 3) + '" text-anchor="middle">' + label + '</text>';
		}
		return '<div class="signal-flow-response"><p><strong>Electrical filter response</strong> · Simulated</p>' +
			'<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHTML(response.summary) + '">' +
			'<line x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + (top + graphHeight) + '" class="signal-flow-axis"></line>' +
			'<line x1="' + left + '" y1="' + (top + graphHeight) + '" x2="' + (left + graphWidth) + '" y2="' + (top + graphHeight) + '" class="signal-flow-axis"></line>' +
			'<text x="4" y="' + (top + 5) + '">+6 dB</text><text x="4" y="' + (top + graphHeight) + '">−60</text>' +
			'<polyline points="' + points + '" class="signal-flow-response-line"></polyline>' +
			marker(response.highPassCutoffHz, 'HP ' + response.highPassCutoffHz + ' Hz') +
			marker(response.lowPassCutoffHz, 'LP ' + response.lowPassCutoffHz + ' Hz') + '</svg>' +
			'<p class="signal-flow-response-summary">' + escapeHTML(response.summary) + '</p>' +
			'<p class="signal-flow-response-summary">Does not include driver or enclosure response.</p></div>';
	}

	function processingControls(output) {
		var processing = state.draft.channelProcessing.outputs.find(function(item) { return item.outputId === output.id; });
		var unit = processingUnits[output.id] || 'ms';
		var speed = state.capabilities.channelProcessing.delay.speedOfSoundMetresPerSecond;
		var displayValue = processing.delay.valueMs;
		if (unit === 'cm') displayValue = Math.round(processing.delay.valueMs / 1000 * speed * 10000) / 100;
		if (unit === 'm') displayValue = Math.round(processing.delay.valueMs / 1000 * speed * 10000) / 10000;
		var samples = Math.round(processing.delay.valueMs / 1000 * state.capabilities.channelProcessing.delay.sampleRateHz);
		return '<section class="signal-flow-processing" aria-label="Level, delay and polarity for ' + escapeHTML(output.label) + '">' +
			'<h3>Channel processing</h3><div class="signal-flow-processing-grid">' +
			'<div class="signal-flow-field"><label for="signal-flow-gain-' + output.id + '">Gain</label><div class="signal-flow-unit-input">' +
			'<input id="signal-flow-gain-' + output.id + '" type="number" step="0.1" min="' + state.capabilities.channelProcessing.gain.minimumDb +
			'" max="' + state.capabilities.channelProcessing.gain.maximumDb + '" value="' + processing.gain.valueDb +
			'" aria-describedby="signal-flow-validation" onkeydown="signalFlow.processingTab(event, \'signal-flow-delay-' + output.id + '\');" onchange="signalFlow.updateProcessing(\'' + output.id + '\', \'gain\', \'valueDb\', this.value, event.relatedTarget && event.relatedTarget.id);"><span>dB</span></div></div>' +
			'<div class="signal-flow-field"><label for="signal-flow-delay-' + output.id + '">Delay</label><div class="signal-flow-unit-input">' +
			'<input id="signal-flow-delay-' + output.id + '" type="number" step="0.01" min="0" value="' + displayValue +
			'" aria-describedby="signal-flow-delay-details-' + output.id + ' signal-flow-validation" onkeydown="signalFlow.processingTab(event, \'signal-flow-delay-unit-' + output.id + '\');" onchange="signalFlow.updateDelay(\'' + output.id + '\', this.value, event.relatedTarget && event.relatedTarget.id);">' +
			'<select id="signal-flow-delay-unit-' + output.id + '" aria-label="Delay unit for ' + escapeHTML(output.label) +
			'" onkeydown="signalFlow.processingTab(event, \'signal-flow-polarity-' + output.id + '\');" onchange="signalFlow.changeDelayUnit(\'' + output.id + '\', this.value, event.relatedTarget && event.relatedTarget.id);">' +
			option('ms', 'ms', unit) + option('cm', 'cm', unit) + option('m', 'm', unit) + '</select></div>' +
			'<p id="signal-flow-delay-details-' + output.id + '" class="signal-flow-processing-detail">Equivalent distance ' +
			(Math.round(processing.delay.valueMs / 1000 * speed * 10000) / 100) + ' cm · ' + samples + ' samples at ' +
			state.capabilities.channelProcessing.delay.sampleRateHz + ' Hz</p></div>' +
			'<div class="signal-flow-field"><label for="signal-flow-polarity-' + output.id + '">Polarity</label><select id="signal-flow-polarity-' + output.id +
			'" aria-describedby="signal-flow-validation" onchange="signalFlow.updateProcessing(\'' + output.id + '\', \'polarity\', \'inverted\', this.value === \'inverted\', event.relatedTarget && event.relatedTarget.id);">' +
			option('normal', 'Normal', processing.polarity.inverted ? 'inverted' : 'normal') +
			option('inverted', 'Inverted', processing.polarity.inverted ? 'inverted' : 'normal') + '</select></div></div>' +
			'<p class="signal-flow-processing-summary">' + processing.gain.valueDb + ' dB · ' + processing.delay.valueMs +
			' ms · ' + (processing.polarity.inverted ? 'Polarity inverted' : 'Polarity normal') + '</p>' +
			'<div class="signal-flow-processing-actions"><button type="button" class="button pill outline" onclick="signalFlow.resetProcessing(\'' + output.id + '\');">Reset processing</button>' +
			'<label for="signal-flow-processing-copy-' + output.id + '">Copy processing to</label><select id="signal-flow-processing-copy-' + output.id + '">' +
			state.draft.outputs.filter(function(item) { return item.id !== output.id; }).map(function(item) { return option(item.id, item.label, ''); }).join('') +
			'</select><button type="button" class="button pill outline" onclick="signalFlow.copyProcessing(\'' + output.id + '\', document.getElementById(\'signal-flow-processing-copy-' + output.id + '\').value);">Copy processing</button></div></section>';
	}

	function formatDeploymentValue(value) {
		if (value === null || value === undefined) return 'Not available';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	function renderDeployment() {
		var deployment = state.deployment;
		if (!deployment) {
			$('#signal-flow-deployment-status').text('Deployment capability is loading.');
			return;
		}
		var target = deployment.target;
		var identity = deployment.identity;
		var readiness = target.physicalReadiness;
		$('#signal-flow-deployment-target').html(
			'<h3>Target</h3><p><strong>Current Beocreate DSP</strong> · ' + escapeHTML(target.identity.name) +
			' v' + target.identity.profileVersion + ' · ' + target.identity.sampleRateHz + ' Hz · ' +
			target.outputCount + ' outputs</p><p>Capability status: ' + escapeHTML(identity.status) + '</p>'
		);
		$('#signal-flow-transport-readiness').html(
			'<h3>Physical transport readiness</h3><p><strong>Physical apply blocked</strong></p>' +
			'<dl><dt>Program identity</dt><dd>' + escapeHTML(identity.status) + '</dd>' +
			'<dt>Framing</dt><dd>' + escapeHTML(readiness.transport.framing.status) + ' · no physical capture</dd>' +
			'<dt>Write transport</dt><dd>Transported only · no DSP acknowledgement</dd>' +
			'<dt>Readback</dt><dd>' + escapeHTML(readiness.transport.readback.status) + '</dd>' +
			'<dt>Mute control</dt><dd>Unverified · state readback unavailable</dd>' +
			'<dt>Recovery</dt><dd>Prerequisites defined; rollback not implemented</dd></dl>' +
			'<h4>Exact blockers</h4><ul>' + readiness.blockers.map(function(blocker) {
				return '<li>' + escapeHTML(blocker) + '</li>';
			}).join('') + '</ul>'
		);
		var featureOrder = ['routing', 'crossover', 'gain', 'delay', 'polarity'];
		$('#signal-flow-mapping-readiness').html(
			'<h3>Mapping confidence</h3><p>Strong evidence remains preview-only until physical readback verifies it.</p>' +
			featureOrder.map(function(field) {
				var rows = readiness.matrix.filter(function(row) { return row.field === field; });
				var confidence = rows.some(function(row) { return row.confidence === 'unknown'; }) ? 'Unknown' :
					rows.every(function(row) { return row.confidence === 'verified'; }) ? 'Verified mapping' : 'Strong evidence · Preview only';
				var readback = rows.some(function(row) { return row.readable === 'unavailable'; }) ?
					'Readback unavailable' : 'Physical readback unverified';
				return '<div class="signal-flow-readiness-item" role="group" aria-label="' + escapeHTML(field) + ' mapping status">' +
					'<strong>' + escapeHTML(field.charAt(0).toUpperCase() + field.slice(1)) + '</strong>' +
					'<span>' + confidence + '</span><span>' + readback + '</span></div>';
			}).join('')
		);
		$('#signal-flow-recovery-readiness').html(
			'<h3>Safety and recovery</h3><p>All future interrupted physical operations must remain muted when state is unknown.</p>' +
			'<ul><li>Mute capability: command exists; physical state cannot be confirmed.</li>' +
			'<li>Readback capability: generic read format exists; operation verification is not physically proven.</li>' +
			'<li>Rollback capability: not implemented and no verified prior physical plan exists.</li>' +
			'<li>Connection loss, restart, mismatch or identity change: do not resume; manual intervention may be required.</li></ul>'
		);
		var compilation = deployment.compilation;
		var stale = !!(deployment.stale || state.dirty);
		var overallStatus = stale ? 'Unknown · compilation is stale' :
			deployment.comparison ? deployment.comparison.status :
			compilation ? compilation.status : 'Not compiled';
		if (deployment.simulator.transportStatus) overallStatus = deployment.simulator.transportStatus;
		if (deployment.simulator.identityMismatch) overallStatus = 'Program identity mismatch · recompile required';
		$('#signal-flow-deployment-status')
			.attr('class', 'signal-flow-status-' + (deployment.comparison ? deployment.comparison.status : compilation ? compilation.status : 'unknown'))
			.text(overallStatus + ' · Prepared only · ' + (deployment.simulator.connected ? 'Simulated' : 'Simulator disconnected') + ' · Not deployed to physical DSP');

		var errors = compilation ? compilation.errors : [];
		var warnings = compilation ? compilation.warnings : [];
		$('#signal-flow-deployment-issues').html(
			'<h3>Compilation summary</h3>' +
			(compilation ? '<p>Design revision ' + escapeHTML(compilation.sourceDesignRevision) + ' · ' +
				compilation.operations.length + ' proposed operations · ' + errors.length + ' errors · ' + warnings.length + ' warnings</p>' :
				'<p>Save the design, then compile to inspect a proposed plan.</p>') +
			(errors.length ? '<h4>Errors</h4><ul>' + errors.map(function(item) { return '<li>' + escapeHTML(item.message) + '</li>'; }).join('') + '</ul>' : '') +
			(warnings.length ? '<h4>Warnings</h4><ul>' + warnings.map(function(item) { return '<li>' + escapeHTML(item.message) + '</li>'; }).join('') + '</ul>' : '')
		);
		var comparisonByOperation = {};
		if (deployment.comparison) deployment.comparison.items.forEach(function(item) { comparisonByOperation[item.operationIndex] = item; });
		$('#signal-flow-deployment-outputs').html(compilation ? compilation.outputs.map(function(output) {
			var operations = compilation.operations.filter(function(item) { return item.outputId === output.outputId; });
			function row(label, operation) {
				if (!operation) return '<dt>' + label + '</dt><dd>Unsupported</dd><dd>Not available</dd><dd>unsupported</dd>';
				var comparison = comparisonByOperation[operation.index];
				var status = comparison ? comparison.status : 'not checked';
				return '<dt>' + label + '</dt><dd><span class="visually-hidden">Requested: </span>' + escapeHTML(formatDeploymentValue(operation.humanValue)) +
					'</dd><dd><span class="visually-hidden">Compiled or actual: </span>' +
					escapeHTML(comparison ? formatDeploymentValue(comparison.actual) : formatDeploymentValue(operation.expectedReadback)) +
					'</dd><dd>' + escapeHTML(status) + '</dd>';
			}
			var routing = operations.find(function(item) { return item.group === 'routing'; });
			var filters = operations.filter(function(item) { return item.group === 'filter-coefficients' && item.logicalField !== 'crossover.flat'; });
			var gain = operations.find(function(item) { return item.group === 'gain'; });
			var delay = operations.find(function(item) { return item.group === 'delay'; });
			var polarity = operations.find(function(item) { return item.group === 'polarity'; });
			return '<section class="signal-flow-deployment-output" role="group" aria-label="' + escapeHTML(output.label) + ' deployment comparison">' +
				'<h3>' + escapeHTML(output.label) + '</h3><p>' + filters.length + ' configured crossover sections</p>' +
				'<dl><dt>Field</dt><dd>Requested</dd><dd>Compiled or actual</dd><dd>Verification status</dd>' +
				row('Routing', routing) + row('Gain', gain) + row('Delay', delay) + row('Polarity', polarity) + '</dl></section>';
		}).join('') : '');
		$('#signal-flow-deployment-operations .signal-flow-operation-list').html(compilation ? compilation.operations.map(function(item) {
			return '<div class="signal-flow-operation"><strong>' + (item.index + 1) + '. ' + escapeHTML(item.group) + '</strong> · ' +
				escapeHTML(item.outputId || 'system') + ' · target ' + escapeHTML(item.target) + ' · ' +
				escapeHTML(item.encoding) + '</div>';
		}).join('') : '<p>No compiled operations.</p>');

		var canCompile = state.connected && !state.dirty && !!state.revision;
		var canApply = canCompile && !!compilation && !stale && compilation.errors.length === 0 && deployment.simulator.connected;
		var hasApplied = deployment.simulator.hasAppliedPlan;
		$('#signal-flow-compile').prop('disabled', !canCompile);
		$('#signal-flow-simulate-apply').prop('disabled', !canApply);
		$('#signal-flow-simulate-read').prop('disabled', !hasApplied || !state.connected);
		$('#signal-flow-simulate-compare').prop('disabled', !deployment.readback || stale);
		$('#signal-flow-simulate-clear').prop('disabled', !hasApplied);
	}

	function render(preferredFocusId) {
		var activeControlId = preferredFocusId || (document.activeElement && document.activeElement.id);
		if (state.loading || !state.draft) {
			$('#signal-flow-runtime-status').text('Loading routing design…');
			return;
		}
		$('#signal-flow-runtime-status').text(state.runtime.statusLabel + (state.connected ? '' : ' · Disconnected'));

		$('#signal-flow-inputs').html(state.capabilities.inputs.map(function(input) {
			return '<div class="signal-flow-input' + (input.available ? '' : ' disabled') + '" title="' + escapeHTML(input.description) + '">' +
				escapeHTML(input.name) + '</div>';
		}).join(''));

		$('#signal-flow-outputs').html(state.draft.outputs.map(function(output) {
			var connection = state.draft.connections.find(function(item) {
				return item.destination === output.id && item.enabled;
			});
			var inputOptions = option('', 'No input', connection ? connection.source : '');
			state.capabilities.inputs.forEach(function(input) {
				inputOptions += option(input.id, input.name, connection ? connection.source : '');
			});
			var roles = Object.keys(roleLabels).map(function(role) {
				return option(role, roleLabels[role], output.role);
			}).join('');
			var sides = Object.keys(sideLabels).map(function(side) {
				return option(side, sideLabels[side], output.side);
			}).join('');
			var crossover = state.draft.crossover.outputs.find(function(item) { return item.outputId === output.id; });
			var copyOptions = state.draft.outputs.filter(function(item) { return item.id !== output.id; }).map(function(item) {
				return option(item.id, item.label, '');
			}).join('');
			return '<article class="signal-flow-output" data-output-id="' + output.id + '" aria-label="' + escapeHTML(output.label) + ' output channel">' +
				'<div class="signal-flow-output-header"><strong>' + escapeHTML(output.dspChannel.toUpperCase()) + ' · ' + escapeHTML(output.label) + '</strong>' +
				"<label><input type=\"checkbox\" " + (output.enabled ? "checked " : "") + "onchange=\"signalFlow.update('" + output.id + "', 'enabled', this.checked);\"> Enabled</label></div>" +
				'<div class="signal-flow-output-grid">' +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-label-" + output.id + "\">Driver label</label><input id=\"signal-flow-label-" + output.id + "\" value=\"" + escapeHTML(output.label) + "\" onchange=\"signalFlow.update('" + output.id + "', 'label', this.value);\"></div>" +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-role-" + output.id + "\">Driver role</label><select id=\"signal-flow-role-" + output.id + "\" onchange=\"signalFlow.update('" + output.id + "', 'role', this.value);\">" + roles + "</select></div>" +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-side-" + output.id + "\">Side</label><select id=\"signal-flow-side-" + output.id + "\" onchange=\"signalFlow.update('" + output.id + "', 'side', this.value);\">" + sides + "</select></div>" +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-source-" + output.id + "\">Input</label><select id=\"signal-flow-source-" + output.id + "\" onchange=\"signalFlow.route('" + output.id + "', this.value);\">" + inputOptions + "</select></div>" +
				'</div><section class="signal-flow-crossover" aria-label="Crossover for ' + escapeHTML(output.label) + '">' +
				'<h3>Crossover</h3><div class="signal-flow-crossover-grid">' +
				crossoverControls(output, crossover, 'highPass', 'High-pass') +
				crossoverControls(output, crossover, 'lowPass', 'Low-pass') + '</div>' +
				responsePreview(output.id) +
				'<div class="signal-flow-crossover-actions"><button type="button" class="button pill outline" ' +
				"onclick=\"signalFlow.resetCrossover('" + output.id + "');\">Reset crossover</button>" +
				'<label for="signal-flow-copy-' + output.id + '">Copy to</label><select id="signal-flow-copy-' + output.id + '">' +
				option('', 'Choose output', '') + copyOptions + '</select><button type="button" class="button pill outline" ' +
				"onclick=\"signalFlow.copyCrossover('" + output.id + "', document.getElementById('signal-flow-copy-" + output.id + "').value);\">Copy</button></div>" +
				'</section>' + processingControls(output) + '</article>';
		}).join(''));

		var issues = state.validation.errors.concat(state.validation.warnings);
		$('#signal-flow-validation').html(issues.length ? '<ul class="signal-flow-issues">' + issues.map(function(issue) {
			return '<li class="signal-flow-' + issue.level + '">' + escapeHTML(issue.message) + '</li>';
		}).join('') + '</ul>' : '<p>No routing-model issues found.</p>');

		var summary = signalFlowUIState.summary(state);
		$('#signal-flow-summary').text(
			summary.outputs + ' outputs available · ' + summary.routed + ' routed · ' +
			summary.unassigned + ' unassigned · ' + summary.errors + ' errors · ' +
			summary.warnings + ' warnings · ' + (summary.dirty ? 'Unsaved changes' : 'Saved design')
		);
		$('#signal-flow-save').toggleClass('disabled', !signalFlowUIState.canSave(state)).prop('disabled', !signalFlowUIState.canSave(state));
		$('#signal-flow-discard').toggleClass('disabled', !state.dirty).prop('disabled', !state.dirty);
		$('#signal-flow-message').toggleClass('hidden', !state.message).text(state.message || '');
		renderDeployment();
		if (activeControlId) {
			var replacement = document.getElementById(activeControlId);
			if (replacement) replacement.focus({preventScroll: true});
		}
	}

	function validateDraft() {
		beo.send({target: 'signal-flow', header: 'validate', content: {configuration: state.draft, revision: state.revision}});
	}

	function update(outputID, field, value) {
		signalFlowUIState.editOutput(state, outputID, field, value);
		validateDraft();
		render();
	}

	function updateCrossover(outputID, filterType, field, value) {
		if (field === 'cutoffHz') {
			var numericValue = Number(value);
			value = value.trim() === '' ? '' : isFinite(numericValue) ? numericValue : value;
		}
		signalFlowUIState.editCrossover(state, outputID, filterType, field, value);
		validateDraft();
		requestPreview(outputID);
		render();
	}

	function updateProcessing(outputID, section, field, value, preferredFocusId) {
		var normalized = section === 'gain' || section === 'delay' ? Number(value) : value;
		signalFlowUIState.editProcessing(state, outputID, section, field, normalized);
		validateDraft();
		render(preferredFocusId);
	}

	function updateDelay(outputID, value, preferredFocusId) {
		var unit = processingUnits[outputID] || 'ms';
		var numeric = Number(value);
		var speed = state.capabilities.channelProcessing.delay.speedOfSoundMetresPerSecond;
		var valueMs = unit === 'ms' ? numeric : (unit === 'cm' ? numeric / 100 : numeric) / speed * 1000;
		updateProcessing(outputID, 'delay', 'valueMs', Math.round(valueMs * 1000000) / 1000000, preferredFocusId);
	}

	function changeDelayUnit(outputID, unit, preferredFocusId) {
		processingUnits[outputID] = unit;
		render(preferredFocusId);
	}

	function processingTab(event, nextControlId) {
		if (event.key !== 'Tab' || event.shiftKey) return;
		event.preventDefault();
		event.currentTarget.blur();
		window.setTimeout(function() {
			var next = document.getElementById(nextControlId);
			if (next) next.focus({preventScroll: true});
		}, 0);
	}

	function copyProcessing(sourceOutputID, destinationOutputID) {
		if (!destinationOutputID) return;
		beo.send({target: 'signal-flow', header: 'copyProcessing', content: {
			configuration: state.draft, sourceOutputId: sourceOutputID, destinationOutputId: destinationOutputID, revision: state.revision
		}});
	}

	function resetProcessing(outputID) {
		beo.send({target: 'signal-flow', header: 'resetProcessing', content: {
			configuration: state.draft, outputId: outputID, revision: state.revision
		}});
	}

	function requestPreview(outputID) {
		beo.send({target: 'signal-flow', header: 'calculateCrossoverResponse', content: {configuration: state.draft, outputId: outputID}});
	}

	function resetCrossover(outputID) {
		beo.send({target: 'signal-flow', header: 'resetCrossover', content: {configuration: state.draft, outputId: outputID, revision: state.revision}});
	}

	function copyCrossover(sourceOutputID, destinationOutputID) {
		if (!destinationOutputID) return;
		beo.send({target: 'signal-flow', header: 'copyCrossover', content: {
			configuration: state.draft,
			sourceOutputId: sourceOutputID,
			destinationOutputId: destinationOutputID,
			revision: state.revision
		}});
	}

	function route(outputID, source) {
		signalFlowUIState.routeOutput(state, outputID, source || null);
		validateDraft();
		render();
	}

	function deploymentRequest(header) {
		beo.send({target: 'signal-flow', header: header, content: {revision: state.revision}});
	}

	function prepareForDSP() { deploymentRequest('prepareForDSP'); }
	function applyToSimulator() { deploymentRequest('applyToSimulator'); }
	function readSimulator() { deploymentRequest('readSimulator'); }
	function compareSimulator() { deploymentRequest('compareSimulator'); }
	function clearSimulator() { deploymentRequest('clearSimulator'); }

	function save() {
		if (!signalFlowUIState.canSave(state)) return;
		signalFlowUIState.beginSave(state);
		render();
		beo.send({target: 'signal-flow', header: 'save', content: {configuration: state.draft, revision: state.revision}});
	}

	function discard() {
		if (!state.dirty) return;
		signalFlowUIState.discard(state);
		validateDraft();
		state.draft.outputs.forEach(function(output) { requestPreview(output.id); });
		render();
	}

	function reset() {
		beo.ask();
		if (!state.connected || state.saving) return;
		state.saving = true;
		render();
		beo.send({target: 'signal-flow', header: 'reset', content: {revision: state.revision}});
	}

	return {
		update: update,
		updateCrossover: updateCrossover,
		updateProcessing: updateProcessing,
		updateDelay: updateDelay,
		changeDelayUnit: changeDelayUnit,
		processingTab: processingTab,
		copyProcessing: copyProcessing,
		resetProcessing: resetProcessing,
		requestPreview: requestPreview,
		resetCrossover: resetCrossover,
		copyCrossover: copyCrossover,
		route: route,
		prepareForDSP: prepareForDSP,
		applyToSimulator: applyToSimulator,
		readSimulator: readSimulator,
		compareSimulator: compareSimulator,
		clearSimulator: clearSimulator,
		save: save,
		discard: discard,
		reset: reset,
		render: render,
		getState: function() { return state; }
	};
}(typeof window !== 'undefined' ? window.signalFlowUIState : null));
