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
		if (data.header === 'crossoverResponse') {
			signalFlowUIState.receiveCrossoverResponse(state, data.content);
		}
		if (data.header === 'error' && data.content && data.content.error) {
			state.message = data.content.error.message;
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

	function render() {
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
			return '<article class="signal-flow-output" data-output-id="' + output.id + '">' +
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
				'</section></article>';
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
		$('#signal-flow-save').toggleClass('disabled', !signalFlowUIState.canSave(state));
		$('#signal-flow-discard').toggleClass('disabled', !state.dirty);
		$('#signal-flow-message').toggleClass('hidden', !state.message).text(state.message || '');
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
		requestPreview: requestPreview,
		resetCrossover: resetCrossover,
		copyCrossover: copyCrossover,
		route: route,
		save: save,
		discard: discard,
		reset: reset,
		render: render,
		getState: function() { return state; }
	};
}(typeof window !== 'undefined' ? window.signalFlowUIState : null));
