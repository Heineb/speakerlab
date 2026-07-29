(function(root, factory) {
	if (typeof module === 'object' && module.exports) module.exports = factory();
	else if (!root.signalFlowUIState) root.signalFlowUIState = factory();
}(typeof window !== 'undefined' ? window : this, function() {
	'use strict';

	function clone(value) {
		return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
	}

	function create() {
		return {
			loading: true,
			connected: true,
			capabilities: {inputs: [], outputs: []},
			saved: null,
			draft: null,
			revision: null,
			validation: {valid: true, errors: [], warnings: []},
			dirty: false,
			saving: false,
			conflict: false,
			message: null,
			crossoverResponses: {},
			deployment: null,
			runtime: {deploymentStatus: 'not-deployed', statusLabel: 'Saved design · Not deployed to DSP'}
		};
	}

	function receiveState(state, payload) {
		state.loading = false;
		state.connected = !(payload.runtime && payload.runtime.connected === false);
		state.capabilities = clone(payload.capabilities);
		state.runtime = clone(payload.runtime);
		state.deployment = clone(payload.deployment);
		state.validation = clone(payload.validation);
		state.message = payload.loadError ? payload.loadError.message : null;
		if (state.dirty) {
			if (state.revision !== payload.revision) {
				state.conflict = true;
				state.message = 'The server routing changed while you were editing. Your draft has been kept.';
			}
			return state;
		}
		state.saved = clone(payload.configuration);
		state.draft = clone(payload.configuration);
		state.revision = payload.revision;
		state.conflict = false;
		return state;
	}

	function editOutput(state, outputID, field, value) {
		if (!state.draft) return state;
		var output = state.draft.outputs.find(function(item) { return item.id === outputID; });
		if (output) output[field] = value;
		state.dirty = true;
		state.message = null;
		if (state.deployment && state.deployment.compilation) state.deployment.stale = true;
		return state;
	}

	function routeOutput(state, outputID, source) {
		if (!state.draft) return state;
		state.draft.connections = state.draft.connections.filter(function(connection) {
			return connection.destination !== outputID;
		});
		if (source) state.draft.connections.push({source: source, destination: outputID, enabled: true});
		state.dirty = true;
		state.message = null;
		if (state.deployment && state.deployment.compilation) state.deployment.stale = true;
		return state;
	}

	function editCrossover(state, outputID, filterType, field, value) {
		if (!state.draft || !state.draft.crossover) return state;
		var output = state.draft.crossover.outputs.find(function(item) { return item.outputId === outputID; });
		if (output && output[filterType]) output[filterType][field] = value;
		state.dirty = true;
		state.message = null;
		delete state.crossoverResponses[outputID];
		if (state.deployment && state.deployment.compilation) state.deployment.stale = true;
		return state;
	}

	function receiveCrossoverDraft(state, payload) {
		state.draft = clone(payload.configuration);
		state.validation = clone(payload.validation);
		state.dirty = true;
		state.message = payload.action === 'copy' ? 'Crossover copied to the selected output. Save the design to keep it.' : 'Crossover reset in this draft. Save the design to keep it.';
		state.crossoverResponses = {};
		return state;
	}

	function editProcessing(state, outputID, section, field, value) {
		if (!state.draft || !state.draft.channelProcessing) return state;
		var output = state.draft.channelProcessing.outputs.find(function(item) { return item.outputId === outputID; });
		if (output && output[section]) output[section][field] = value;
		state.dirty = true;
		state.message = null;
		if (state.deployment && state.deployment.compilation) state.deployment.stale = true;
		return state;
	}

	function receiveProcessingDraft(state, payload) {
		state.draft = clone(payload.configuration);
		state.validation = clone(payload.validation);
		state.dirty = true;
		state.message = payload.action === 'copy' ? 'Channel processing copied. Save the design to keep it.' : 'Channel processing reset in this draft. Save the design to keep it.';
		return state;
	}

	function receiveCrossoverResponse(state, payload) {
		state.crossoverResponses[payload.outputId] = clone(payload.response);
		return state;
	}

	function receiveDeployment(state, payload) {
		state.deployment = clone(payload.deployment);
		var messages = {
			compile: 'Deployment preview compiled. Prepared only; not deployed to physical hardware.',
			apply: 'Compiled plan applied to the simulator while muted.',
			readback: 'Simulator readback received.',
			compare: payload.deployment.comparison && payload.deployment.comparison.status === 'matched' ?
				'Verified in simulator. Not deployed to physical hardware.' : 'Simulator comparison did not fully match.',
			clear: 'Simulated applied state cleared.'
		};
		state.message = messages[payload.action] || state.message;
		return state;
	}

	function deploymentError(state, error) {
		state.message = error.message;
		return state;
	}

	function receiveValidation(state, validation) {
		state.validation = clone(validation);
		return state;
	}

	function beginSave(state) {
		if (canSave(state)) state.saving = true;
		return state;
	}

	function saveResult(state, result) {
		state.saving = false;
		if (!result.success) {
			state.message = result.error.message;
			if (result.error.code === 'REVISION_CONFLICT') state.conflict = true;
			return state;
		}
		state.saved = clone(result.configuration);
		state.draft = clone(result.configuration);
		state.revision = result.revision;
		state.validation = clone(result.validation);
		state.dirty = false;
		state.conflict = false;
		state.message = 'Routing design saved and verified. It has not been deployed to the DSP.';
		return state;
	}

	function externalSave(state, result) {
		if (!result.success || result.revision === state.revision) return state;
		if (state.dirty) {
			state.conflict = true;
			state.message = 'The server routing changed while you were editing. Your draft has been kept.';
		} else {
			state.message = 'The server routing changed. Reloading the saved design…';
		}
		return state;
	}

	function discard(state) {
		state.draft = clone(state.saved);
		state.dirty = false;
		state.conflict = false;
		state.message = null;
		state.crossoverResponses = {};
		return state;
	}

	function connectionChanged(state, connected) {
		state.connected = connected;
		if (!connected) state.message = 'Disconnected. Your unsaved draft is kept in this browser session.';
		return state;
	}

	function canSave(state) {
		return !!(state.connected && state.dirty && !state.saving && !state.conflict && state.validation && state.validation.errors.length === 0);
	}

	function summary(state) {
		var outputs = state.draft ? state.draft.outputs : [];
		var routed = state.draft ? state.draft.connections.filter(function(connection) { return connection.enabled; }).length : 0;
		return {
			outputs: outputs.length,
			routed: routed,
			unassigned: outputs.filter(function(output) { return output.role === 'unassigned'; }).length,
			errors: state.validation.errors.length,
			warnings: state.validation.warnings.length,
			dirty: state.dirty
		};
	}

	return {
		create: create,
		receiveState: receiveState,
		editOutput: editOutput,
		routeOutput: routeOutput,
		editCrossover: editCrossover,
		editProcessing: editProcessing,
		receiveCrossoverDraft: receiveCrossoverDraft,
		receiveProcessingDraft: receiveProcessingDraft,
		receiveCrossoverResponse: receiveCrossoverResponse,
		receiveDeployment: receiveDeployment,
		deploymentError: deploymentError,
		receiveValidation: receiveValidation,
		beginSave: beginSave,
		saveResult: saveResult,
		externalSave: externalSave,
		discard: discard,
		connectionChanged: connectionChanged,
		canSave: canSave,
		summary: summary,
		clone: clone
	};
}));
