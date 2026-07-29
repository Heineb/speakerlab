var signalFlow = (function() {
	'use strict';

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
		}
		if (data.header === 'validation') {
			signalFlowUIState.receiveValidation(state, data.content.validation);
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
			return '<article class="signal-flow-output" data-output-id="' + output.id + '">' +
				'<div class="signal-flow-output-header"><strong>' + escapeHTML(output.dspChannel.toUpperCase()) + ' · ' + escapeHTML(output.label) + '</strong>' +
				"<label><input type=\"checkbox\" " + (output.enabled ? "checked " : "") + "onchange=\"signalFlow.update('" + output.id + "', 'enabled', this.checked);\"> Enabled</label></div>" +
				'<div class="signal-flow-output-grid">' +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-label-" + output.id + "\">Driver label</label><input id=\"signal-flow-label-" + output.id + "\" value=\"" + escapeHTML(output.label) + "\" onchange=\"signalFlow.update('" + output.id + "', 'label', this.value);\"></div>" +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-role-" + output.id + "\">Driver role</label><select id=\"signal-flow-role-" + output.id + "\" onchange=\"signalFlow.update('" + output.id + "', 'role', this.value);\">" + roles + "</select></div>" +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-side-" + output.id + "\">Side</label><select id=\"signal-flow-side-" + output.id + "\" onchange=\"signalFlow.update('" + output.id + "', 'side', this.value);\">" + sides + "</select></div>" +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-source-" + output.id + "\">Input</label><select id=\"signal-flow-source-" + output.id + "\" onchange=\"signalFlow.route('" + output.id + "', this.value);\">" + inputOptions + "</select></div>" +
				'</div></article>';
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
		route: route,
		save: save,
		discard: discard,
		reset: reset,
		render: render,
		getState: function() { return state; }
	};
}());
