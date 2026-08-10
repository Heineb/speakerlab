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
			deploymentTab: function() {},
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
	var pendingEQResetOutput = null;
	var pendingDeploymentFocusId = null;
	var pendingDeploymentFocusSourceId = null;
	var measurementPreview = null;
	var selectedMeasurementId = null;
	var pendingMeasurementRemove = null;
	var measurementOverlay = null;
	var mergePreview = null;
	var mergeEditingRecipe = null;
	var mergeDraftValues = null;
	var mergeOpen = false;

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
		if (data.header === 'eqDraft') {
			signalFlowUIState.receiveEQDraft(state, data.content);
			if (state.draft) state.draft.outputs.forEach(function(output) { requestPreview(output.id); });
		}
		if (data.header === 'eqResponse') {
			signalFlowUIState.receiveEQResponse(state, data.content);
		}
		if (data.header === 'measurementPreview') measurementPreview = data.content;
		if (data.header === 'measurementDraft') {
			signalFlowUIState.receiveMeasurementDraft(state, data.content);
			selectedMeasurementId = data.content.measurementId;
			measurementPreview = null;
			if (selectedMeasurementId) requestMeasurementOverlay(selectedMeasurementId);
		}
		if (data.header === 'measurementOverlay') measurementOverlay = data.content;
		if (data.header === 'measurementMergePreview') {
			mergePreview = data.content;
			mergeDraftValues = JSON.parse(JSON.stringify(data.content.recipe));
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
		var response = state.eqResponses[outputID] || state.crossoverResponses[outputID];
		if (!response) return '<div class="signal-flow-response pending"><p>Electrical filter response</p><p>Waiting for a valid simulated preview…</p></div>';
		var width = 560;
		var height = 180;
		var left = 42;
		var top = 12;
		var graphWidth = width - left - 10;
		var graphHeight = height - top - 28;
		var minimumLog = Math.log(response.minimumHz);
		var rangeLog = Math.log(response.maximumHz) - minimumLog;
		function graphPoints(field) { return response.points.map(function(point) {
			var x = left + (Math.log(point.frequencyHz) - minimumLog) / rangeLog * graphWidth;
			var db = Math.max(-60, Math.min(18, point[field]));
			var y = top + (18 - db) / 78 * graphHeight;
			return x.toFixed(1) + ',' + y.toFixed(1);
		}).join(' '); }
		var points = graphPoints('magnitudeDb');
		var eqPoints = response.points[0].eqMagnitudeDb === undefined ? '' : graphPoints('eqMagnitudeDb');
		function marker(frequency, label) {
			if (!frequency) return '';
			var x = left + (Math.log(frequency) - minimumLog) / rangeLog * graphWidth;
			return '<line x1="' + x.toFixed(1) + '" y1="' + top + '" x2="' + x.toFixed(1) + '" y2="' + (top + graphHeight) + '" class="signal-flow-cutoff"></line>' +
				'<text x="' + x.toFixed(1) + '" y="' + (height - 3) + '" text-anchor="middle">' + label + '</text>';
		}
		return '<div class="signal-flow-response"><p><strong>Electrical filter response</strong> · Simulated</p>' +
			'<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Electrical response graph. See the textual headroom estimate below.">' +
			'<line x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + (top + graphHeight) + '" class="signal-flow-axis"></line>' +
			'<line x1="' + left + '" y1="' + (top + graphHeight) + '" x2="' + (left + graphWidth) + '" y2="' + (top + graphHeight) + '" class="signal-flow-axis"></line>' +
			'<text x="4" y="' + (top + 5) + '">+18 dB</text><text x="4" y="' + (top + graphHeight) + '">−60</text>' +
			(eqPoints ? '<polyline points="' + eqPoints + '" class="signal-flow-eq-response-line"></polyline>' : '') +
			'<polyline points="' + points + '" class="signal-flow-response-line"></polyline>' +
			marker(response.highPassCutoffHz, 'HP ' + response.highPassCutoffHz + ' Hz') +
			marker(response.lowPassCutoffHz, 'LP ' + response.lowPassCutoffHz + ' Hz') + '</svg>' +
			'<p class="signal-flow-response-summary">' + escapeHTML(response.summary) + '</p>' +
			'<p class="signal-flow-response-summary">Combined crossover + EQ is solid; EQ contribution is dashed. Does not include driver or enclosure response, room effects or acoustic summation.</p></div>';
	}

	function parametricEQControls(output) {
		var eqOutput = state.draft.parametricEQ.outputs.find(function(item) { return item.outputId === output.id; });
		var bands = eqOutput.bands;
		var selectedID = state.selectedEQBands[output.id];
		var selected = bands.find(function(band) { return band.id === selectedID; }) || bands[0];
		if (selected) state.selectedEQBands[output.id] = selected.id;
		var rows = bands.map(function(band, index) {
			var type = state.capabilities.parametricEQ.types.find(function(item) { return item.id === band.type; });
			var name = (band.label ? band.label + ', ' : '') + type.name + ', ' + band.frequencyHz + ' hertz, ' +
				band.gainDb + ' decibels, ' + type.shapeName + ' ' + band.shape + ', ' + (band.enabled ? 'enabled' : 'bypassed');
			return '<li><button type="button" class="signal-flow-eq-band' + (selected && selected.id === band.id ? ' selected' : '') +
				'" aria-pressed="' + (selected && selected.id === band.id) + '" aria-label="' + escapeHTML(name) +
				'" onclick="signalFlow.selectEQBand(\'' + output.id + '\', \'' + band.id + '\');"><span>' +
				escapeHTML(band.label || type.name) + '</span><span>' + band.frequencyHz + ' Hz · ' + band.gainDb + ' dB · ' +
				escapeHTML(type.shapeName) + ' ' + band.shape + '</span><span>' + (band.enabled ? 'Enabled' : 'Bypassed') +
				'</span></button><button type="button" aria-label="Move ' + escapeHTML(name) + ' up" ' + (index ? '' : 'disabled ') +
				'onclick="signalFlow.moveEQBand(\'' + output.id + '\', \'' + band.id + '\', -1);">↑</button>' +
				'<button type="button" aria-label="Move ' + escapeHTML(name) + ' down" ' + (index < bands.length - 1 ? '' : 'disabled ') +
				'onclick="signalFlow.moveEQBand(\'' + output.id + '\', \'' + band.id + '\', 1);">↓</button></li>';
		}).join('');
		var editor = '<p class="signal-flow-eq-empty">Add a band to begin equalisation.</p>';
		if (selected) {
			var selectedType = state.capabilities.parametricEQ.types.find(function(item) { return item.id === selected.type; });
			var prefix = 'signal-flow-eq-' + output.id + '-' + selected.id;
			editor = '<fieldset class="signal-flow-eq-editor"><legend>Edit ' + escapeHTML(selected.label || selectedType.name) + '</legend>' +
				'<label><input id="' + prefix + '-enabled" type="checkbox" ' + (selected.enabled ? 'checked ' : '') +
				'onchange="signalFlow.updateEQ(\'' + output.id + '\', \'' + selected.id + '\', \'enabled\', this.checked);"> Enabled (clear to bypass)</label>' +
				'<div class="signal-flow-eq-fields"><div class="signal-flow-field"><label for="' + prefix + '-label">Optional band label</label>' +
				'<input id="' + prefix + '-label" value="' + escapeHTML(selected.label) + '" onchange="signalFlow.updateEQ(\'' + output.id + '\', \'' + selected.id + '\', \'label\', this.value);"></div>' +
				'<div class="signal-flow-field"><label for="' + prefix + '-type">Filter type</label><select id="' + prefix + '-type" ' +
				'onchange="signalFlow.updateEQ(\'' + output.id + '\', \'' + selected.id + '\', \'type\', this.value);">' +
				state.capabilities.parametricEQ.types.map(function(type) { return option(type.id, type.name, selected.type); }).join('') + '</select></div>' +
				'<div class="signal-flow-field"><label for="' + prefix + '-frequency">Center or corner frequency (Hz)</label>' +
				'<input id="' + prefix + '-frequency" type="number" min="' + state.capabilities.parametricEQ.minFrequencyHz + '" max="' +
				state.capabilities.parametricEQ.maxFrequencyHz + '" value="' + selected.frequencyHz + '" aria-describedby="signal-flow-validation" ' +
				'onchange="signalFlow.updateEQ(\'' + output.id + '\', \'' + selected.id + '\', \'frequencyHz\', this.value);"></div>' +
				'<div class="signal-flow-field"><label for="' + prefix + '-gain">Gain (dB)</label><input id="' + prefix +
				'-gain" type="number" step="0.1" min="' + state.capabilities.parametricEQ.minGainDb + '" max="' +
				state.capabilities.parametricEQ.maxGainDb + '" value="' + selected.gainDb + '" aria-describedby="signal-flow-validation" ' +
				'onchange="signalFlow.updateEQ(\'' + output.id + '\', \'' + selected.id + '\', \'gainDb\', this.value);"></div>' +
				'<div class="signal-flow-field"><label for="' + prefix + '-shape">' + escapeHTML(selectedType.shapeName) + '</label><input id="' +
				prefix + '-shape" type="number" step="0.01" min="' + selectedType.minimumShape + '" max="' + selectedType.maximumShape +
				'" value="' + selected.shape + '" aria-describedby="' + prefix + '-shape-help signal-flow-validation" onchange="signalFlow.updateEQ(\'' +
				output.id + '\', \'' + selected.id + '\', \'shape\', this.value);"><p id="' + prefix +
				'-shape-help" class="signal-flow-processing-detail">' + (selected.type === 'peaking' ?
					'Q controls peaking bandwidth.' : 'RBJ shelf slope S; 1 is the steepest supported shelf transition.') + '</p></div></div>' +
				'<div class="signal-flow-eq-actions"><button type="button" class="button pill outline" onclick="signalFlow.resetEQBand(\'' +
				output.id + '\', \'' + selected.id + '\');">Reset band</button><button type="button" class="button pill outline" aria-label="Duplicate ' +
				escapeHTML(selected.label || selectedType.name) + '" onclick="signalFlow.eqDraft(\'duplicate\', \'' + output.id + '\', \'' +
				selected.id + '\');">Duplicate band</button><button type="button" class="button pill red" aria-label="Remove ' +
				escapeHTML(selected.label || selectedType.name) + '" onclick="signalFlow.eqDraft(\'remove\', \'' + output.id + '\', \'' +
				selected.id + '\');">Remove band</button></div></fieldset>';
		}
		return '<section class="signal-flow-eq" aria-label="Parametric EQ for ' + escapeHTML(output.label) + '"><h3>Parametric EQ</h3>' +
			'<p>Peaking EQ and shelves · electrical simulation · ' + bands.filter(function(band) { return band.enabled; }).length + '/' +
			state.capabilities.parametricEQ.maxBandsPerOutput + ' enabled bands</p><div class="signal-flow-eq-layout"><div><h4 id="signal-flow-eq-list-' +
			output.id + '">Band list</h4><ul class="signal-flow-eq-list" aria-labelledby="signal-flow-eq-list-' + output.id + '">' + rows +
			'</ul><button type="button" class="button pill black" onclick="signalFlow.eqDraft(\'add\', \'' + output.id +
			'\');">Add EQ band</button></div><div aria-label="Band editor">' + editor + '</div></div>' + responsePreview(output.id) +
			'<div class="signal-flow-eq-actions"><label for="signal-flow-eq-copy-' + output.id + '">Copy EQ to</label><select id="signal-flow-eq-copy-' +
			output.id + '">' + option('', 'Choose output', '') + state.draft.outputs.filter(function(item) { return item.id !== output.id; }).map(function(item) {
				return option(item.id, item.label, '');
			}).join('') + '</select><button type="button" class="button pill outline" onclick="signalFlow.copyEQ(\'' + output.id +
			'\', document.getElementById(\'signal-flow-eq-copy-' + output.id + '\').value);">Copy EQ</button><button type="button" class="button pill outline" ' +
			'onclick="signalFlow.confirmResetEQ(\'' + output.id + '\');">Reset all EQ</button></div></section>';
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
		var evidenceReview = readiness.evidenceReview;
		$('#signal-flow-evidence-readiness').html(
			'<h3>Evidence provenance</h3><dl>' +
			'<dt>Review status</dt><dd>' + escapeHTML(evidenceReview.status) + '</dd>' +
			'<dt>Source</dt><dd>Repository-backed; no physical capture performed</dd>' +
			'<dt>Capture schema</dt><dd>' + escapeHTML(evidenceReview.captureFormat) + '</dd>' +
			'<dt>Fixture</dt><dd>' + escapeHTML(evidenceReview.fixtureRevision) + '</dd>' +
			'<dt>Program identity</dt><dd>' + escapeHTML(evidenceReview.programIdentity) + '</dd>' +
			'<dt>Readback</dt><dd>' + escapeHTML(evidenceReview.readback) + '</dd>' +
			'<dt>Write side</dt><dd>' + escapeHTML(evidenceReview.writeSide) + '</dd></dl>' +
			'<p>No hostname, network address, serial number, device identifier or user-defined product name is included.</p>'
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
				'<div class="signal-flow-crossover-actions"><button type="button" class="button pill outline" ' +
				"onclick=\"signalFlow.resetCrossover('" + output.id + "');\">Reset crossover</button>" +
				'<label for="signal-flow-copy-' + output.id + '">Copy to</label><select id="signal-flow-copy-' + output.id + '">' +
				option('', 'Choose output', '') + copyOptions + '</select><button type="button" class="button pill outline" ' +
				"onclick=\"signalFlow.copyCrossover('" + output.id + "', document.getElementById('signal-flow-copy-" + output.id + "').value);\">Copy</button></div>" +
				'</section>' + parametricEQControls(output) + processingControls(output) + '</article>';
		}).join(''));

		var issues = state.validation.errors.concat(state.validation.warnings);
		$('#signal-flow-validation').html(issues.length ? '<ul class="signal-flow-issues">' + issues.map(function(issue) {
			return '<li class="signal-flow-' + issue.level + '">' + escapeHTML(issue.message) + '</li>';
		}).join('') + '</ul>' : '<p>No routing-model issues found.</p>');
		renderMeasurements();
		renderMeasurementMerge();

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
		var pendingDeploymentFocus = pendingDeploymentFocusId && document.getElementById(pendingDeploymentFocusId);
		if (pendingDeploymentFocusSourceId && activeControlId !== pendingDeploymentFocusSourceId) {
			pendingDeploymentFocusId = null;
			pendingDeploymentFocusSourceId = null;
		} else if (pendingDeploymentFocus && !pendingDeploymentFocus.disabled) {
			pendingDeploymentFocus.focus({preventScroll: true});
			pendingDeploymentFocusId = null;
			pendingDeploymentFocusSourceId = null;
		} else if (!pendingDeploymentFocusId && activeControlId) {
			var replacement = document.getElementById(activeControlId);
			if (replacement) replacement.focus({preventScroll: true});
		}
	}

	function renderMeasurements() {
		var measurements = state.draft.measurements ? state.draft.measurements.measurements : [];
		if (selectedMeasurementId && !measurements.some(function(item) { return item.id === selectedMeasurementId; })) selectedMeasurementId = null;
		var selected = measurements.find(function(item) { return item.id === selectedMeasurementId; }) || measurements[0];
		if (selected) selectedMeasurementId = selected.id;
		$('#signal-flow-measurement-preview').html(measurementPreview ? '<p><strong>Detected ' + escapeHTML(measurementPreview.detectedFormat) + '</strong> · ' + escapeHTML(measurementPreview.confidence) + ' confidence</p><p>' + measurementPreview.recognizedColumns.map(escapeHTML).join(', ') + ' · ' + measurementPreview.summary.pointCount + ' points · ' + measurementPreview.summary.minimumFrequencyHz + '–' + measurementPreview.summary.maximumFrequencyHz + ' Hz · Phase ' + (measurementPreview.summary.phaseAvailable ? 'available' : 'not available') + '</p>' + measurementPreview.warnings.map(function(item) { return '<p class="signal-flow-warning">' + escapeHTML(item.message) + '</p>'; }).join('') + '<button type="button" class="button pill black" onclick="signalFlow.confirmMeasurementImport();">Confirm import</button>' : '');
		$('#signal-flow-measurement-list').html(measurements.length ? measurements.map(function(item) {
			return '<button type="button" role="option" aria-selected="' + (selected && item.id === selected.id) + '" class="signal-flow-measurement-item' + (selected && item.id === selected.id ? ' selected' : '') + '" onclick="signalFlow.selectMeasurement(\'' + item.id + '\');"><strong>' + escapeHTML(item.name) + '</strong><span>' + (item.sourceFormat === 'derived-merge' ? 'Derived merged response' : escapeHTML(item.type)) + ' · ' + item.points.length + ' points · ' + item.points[0].frequencyHz + '–' + item.points[item.points.length - 1].frequencyHz + ' Hz · Phase ' + (item.units.phase ? 'available' : 'not available') + '</span></button>';
		}).join('') : '<p>No imported measurements.</p>');
		if (!selected) { $('#signal-flow-measurement-detail').empty(); return; }
		var outputOptions = option('', 'Unassigned', selected.assignedOutputId || '') + state.draft.outputs.map(function(output) { return option(output.id, output.label + ' · ' + roleLabels[output.role], selected.assignedOutputId || ''); }).join('');
		var typeOptions = state.capabilities.measurements.types.map(function(type) { return option(type, type.replace(/-/g, ' '), selected.type); }).join('');
		var graph = measurementGraph(selected);
		var staleSources = selected.mergeRecipe ? [{id: selected.mergeRecipe.lowSourceId, hash: selected.mergeRecipe.lowSourceHash, role: 'Nearfield'}, {id: selected.mergeRecipe.highSourceId, hash: selected.mergeRecipe.highSourceHash, role: 'Farfield'}].map(function(reference) { var source = measurements.find(function(item) { return item.id === reference.id; }); return !source || !source.integrity || source.integrity.hash !== reference.hash ? reference.role + ' source ' + (source ? '“' + source.name + '” changed' : 'is missing') : null; }).filter(Boolean) : [];
		$('#signal-flow-measurement-detail').html('<h3>' + escapeHTML(selected.name) + '</h3>' + (selected.sourceFormat === 'derived-merge' ? '<p><strong>Derived merged response</strong> · Magnitude only · Source observations remain unchanged.</p>' : '') + '<div class="signal-flow-measurement-fields"><label>Name<input id="signal-flow-measurement-name" value="' + escapeHTML(selected.name) + '" ' + (selected.sourceFormat === 'derived-merge' ? 'disabled' : '') + '></label><label>Notes<textarea id="signal-flow-measurement-notes" ' + (selected.sourceFormat === 'derived-merge' ? 'disabled' : '') + '>' + escapeHTML(selected.description) + '</textarea></label><label>Measurement type<select id="signal-flow-measurement-type" ' + (selected.sourceFormat === 'derived-merge' ? 'disabled' : '') + '>' + typeOptions + '</select></label><label>Assigned output<select id="signal-flow-measurement-output">' + outputOptions + '</select></label></div>' + (selected.sourceFormat === 'derived-merge' ? '<button type="button" class="button pill black" onclick="signalFlow.editMeasurementMerge(\'' + selected.id + '\');">Edit merge recipe</button><button type="button" class="button pill outline" onclick="signalFlow.updateMeasurement();">Update assignment</button>' : '<button type="button" class="button pill black" onclick="signalFlow.updateMeasurement();">Update measurement</button>') + '<button type="button" class="button pill outline" onclick="signalFlow.confirmRemoveMeasurement();">Remove</button><p>Source: ' + escapeHTML(selected.sourceFilename || (selected.sourceFormat === 'derived-merge' ? 'derived from saved sources' : 'unnamed file')) + ' · ' + escapeHTML(selected.sourceFormat) + ' · Imported/generated ' + escapeHTML(selected.importedAt) + ' · Integrity ' + escapeHTML(selected.integrity.hash.slice(0, 12)) + '</p>' + graph + '<p><strong>' + (selected.sourceFormat === 'derived-merge' ? 'Derived response' : 'Measured response') + '</strong> is shown separately from crossover, EQ and combined electrical processing. This is not an acoustic prediction, calibration claim or automatic correction, and it is not an anechoic claim.</p>');
		if (selected.sourceFormat === 'derived-merge') $('#signal-flow-measurement-detail h3').after(staleSources.length ? '<p class="signal-flow-error" role="alert">Stale derived response: ' + escapeHTML(staleSources.join('; ')) + '. Recompute the merge before treating it as current.</p>' : '<p class="signal-flow-status-matched" role="status">Derived response is current for its saved source hashes.</p>');
	}

	function renderMeasurementMerge() {
		var region = $('#signal-flow-measurement-merge');
		region.toggleClass('hidden', !mergeOpen);
		if (!mergeOpen || !state.draft) return;
		var sources = state.draft.measurements.measurements.filter(function(item) { return item.sourceFormat !== 'derived-merge'; });
		var recipe = mergeDraftValues || mergeEditingRecipe || (mergePreview ? mergePreview.recipe : {});
		function sourceOptionLabel(item) { var output = state.draft.outputs.find(function(candidate) { return candidate.id === item.assignedOutputId; }); return item.name + ' · ' + item.type + ' · ' + (output ? 'assigned to ' + output.label : 'unassigned') + ' · ' + item.points[0].frequencyHz + '–' + item.points[item.points.length - 1].frequencyHz + ' Hz · phase ' + (item.units.phase ? 'available' : 'unavailable'); }
		var lowOptions = option('', 'Choose nearfield source', recipe.lowSourceId || '') + sources.map(function(item) { return option(item.id, sourceOptionLabel(item), recipe.lowSourceId || ''); }).join('');
		var highOptions = option('', 'Choose farfield or gated source', recipe.highSourceId || '') + sources.map(function(item) { return option(item.id, sourceOptionLabel(item), recipe.highSourceId || ''); }).join('');
		$('#signal-flow-measurement-merge-form').html('<div class="signal-flow-measurement-fields"><label for="signal-flow-merge-low">Nearfield source</label><select id="signal-flow-merge-low" aria-describedby="signal-flow-measurement-merge-preview" onchange="signalFlow.captureMeasurementMergeDraft();">' + lowOptions + '</select><label for="signal-flow-merge-high">Farfield source</label><select id="signal-flow-merge-high" aria-describedby="signal-flow-measurement-merge-preview" onchange="signalFlow.captureMeasurementMergeDraft();">' + highOptions + '</select><label for="signal-flow-merge-offset">Level alignment</label><div><input id="signal-flow-merge-offset" type="number" min="-30" max="30" step="0.1" aria-describedby="signal-flow-merge-offset-unit signal-flow-measurement-merge-preview" value="' + escapeHTML(recipe.magnitudeOffsetDb === undefined ? 0 : recipe.magnitudeOffsetDb) + '" oninput="signalFlow.captureMeasurementMergeDraft();"> <span id="signal-flow-merge-offset-unit">dB</span> <button type="button" id="signal-flow-merge-use-suggestion" class="button pill outline" onclick="signalFlow.useSuggestedMergeOffset();" ' + (!(mergePreview && mergePreview.suggestedAlignment.available) ? 'disabled' : '') + '>Use suggested offset</button> <button type="button" class="button pill outline" onclick="signalFlow.resetMeasurementMergeOffset();">Reset alignment</button></div><label for="signal-flow-merge-frequency">Merge frequency</label><div><input id="signal-flow-merge-frequency" type="number" min="1" step="1" aria-describedby="signal-flow-merge-frequency-unit signal-flow-measurement-merge-preview" value="' + escapeHTML(recipe.mergeFrequencyHz || '') + '" oninput="signalFlow.captureMeasurementMergeDraft();"> <span id="signal-flow-merge-frequency-unit">Hz</span></div><label for="signal-flow-merge-width">Transition width</label><div><input id="signal-flow-merge-width" type="number" min="0.1" max="2" step="0.1" aria-describedby="signal-flow-merge-width-unit signal-flow-measurement-merge-preview" value="' + escapeHTML(recipe.transitionWidthOctaves === undefined ? 0.5 : recipe.transitionWidthOctaves) + '" oninput="signalFlow.captureMeasurementMergeDraft();"> <span id="signal-flow-merge-width-unit">octaves</span></div><label for="signal-flow-merge-name">Merged response name</label><input id="signal-flow-merge-name" value="' + escapeHTML(recipe.name || 'Merged response') + '" oninput="signalFlow.captureMeasurementMergeDraft();"><label for="signal-flow-merge-notes">Notes</label><textarea id="signal-flow-merge-notes" oninput="signalFlow.captureMeasurementMergeDraft();">' + escapeHTML(recipe.notes || '') + '</textarea></div><div class="signal-flow-merge-actions"><button type="button" class="button pill outline" onclick="signalFlow.previewMeasurementMerge();">Preview merge</button><button type="button" class="button pill black" onclick="signalFlow.saveMeasurementMerge();" ' + (!(mergePreview && mergePreview.validation.valid) ? 'disabled' : '') + '>Save merged response to draft</button><button type="button" class="button pill outline" onclick="signalFlow.closeMeasurementMerge();">Cancel</button></div>');
		var previewElement = $('#signal-flow-measurement-merge-preview');
		if (!mergePreview) { previewElement.html('<p>Select two sources, then preview the merge.</p>'); return; }
		var validation = mergePreview.validation;
		var issues = validation.errors.concat(validation.warnings).map(function(item) { return '<li class="signal-flow-' + item.level + '">' + escapeHTML(item.message) + '</li>'; }).join('');
		var stats = mergePreview.suggestedAlignment;
		var result = mergePreview.result;
		var phase = validation.phaseCompatibility;
		previewElement.html('<h4>Merge review</h4><p><strong>Selected sources</strong>: ' + mergePreview.sources.map(function(source) { return escapeHTML(source.name + ' · ' + source.type + ' · ' + source.minimumFrequencyHz + '–' + source.maximumFrequencyHz + ' Hz · phase ' + (source.phaseAvailable ? 'available' : 'unavailable')); }).join('; ') + '</p><p>Overlap ' + (stats.overlap.available ? roundDisplay(stats.overlap.startHz) + '–' + roundDisplay(stats.overlap.endHz) + ' Hz · ' + roundDisplay(stats.overlap.octaves) + ' octaves' : 'not available') + '</p><p><strong>Chosen level offset</strong>: ' + recipe.magnitudeOffsetDb + ' dB · <strong>Suggested level offset</strong>: ' + (stats.available ? stats.suggestedOffsetDb + ' dB' : 'unavailable') + ' · Median variation ' + (stats.variationDb === null ? 'unavailable' : stats.variationDb + ' dB') + ' · ' + stats.sampleCount + ' usable comparison points</p><p>Merge frequency ' + recipe.mergeFrequencyHz + ' Hz · Transition ' + (validation.transition ? roundDisplay(validation.transition.startHz) + '–' + roundDisplay(validation.transition.endHz) + ' Hz' : 'unavailable') + ' · Derived phase unavailable; wrapped phase is never averaged.</p><p>Phase compatibility: ' + (phase && phase.available ? 'median absolute difference ' + phase.medianAbsoluteDifferenceDegrees + '°, maximum ' + phase.maximumAbsoluteDifferenceDegrees + '° across ' + phase.sampleCount + ' common points' : 'insufficient compatible common phase points') + '.</p>' + (issues ? '<ul class="signal-flow-issues">' + issues + '</ul>' : '') + (result ? mergeResultGraph(result.points, recipe, validation) : '<p>No merged preview is available until errors are resolved.</p>') + '<p>Preview distinguishes source observations, level-adjusted low-frequency source and derived merged magnitude. It does not correct baffle step, geometry, phase/time or room response.</p>');
	}

	function roundDisplay(value) { return Math.round(value * 100) / 100; }
	function mergeResultGraph(points, recipe, validation) {
		var width = 560, height = 180, left = 42, top = 12, minimum = Math.log(points[0].frequencyHz), range = Math.log(points[points.length - 1].frequencyHz) - minimum || 1;
		var lowSource = state.draft.measurements.measurements.find(function(item) { return item.id === recipe.lowSourceId; });
		var highSource = state.draft.measurements.measurements.find(function(item) { return item.id === recipe.highSourceId; });
		var values = points.map(function(point) { return point.magnitudeDb; }).concat(lowSource ? lowSource.points.map(function(point) { return point.magnitudeDb + recipe.magnitudeOffsetDb; }) : [], highSource ? highSource.points.map(function(point) { return point.magnitudeDb; }) : []), low = Math.min.apply(null, values), high = Math.max.apply(null, values), dbRange = high - low || 1;
		function polyline(sourcePoints, adjustment) { return (sourcePoints || []).filter(function(point) { return point.frequencyHz >= points[0].frequencyHz && point.frequencyHz <= points[points.length - 1].frequencyHz; }).map(function(point) { var magnitude = point.magnitudeDb + (adjustment || 0); return (left + (Math.log(point.frequencyHz) - minimum) / range * (width - left - 10)).toFixed(1) + ',' + (top + (high - magnitude) / dbRange * (height - top - 28)).toFixed(1); }).join(' '); }
		function marker(frequency) { return left + (Math.log(frequency) - minimum) / range * (width - left - 10); }
		return '<svg class="signal-flow-measurement-graph" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Nearfield source, level-adjusted nearfield preview, farfield source and merged magnitude preview with ' + points.length + ' derived points. Merge frequency ' + recipe.mergeFrequencyHz + ' hertz. Transition from ' + roundDisplay(validation.transition.startHz) + ' to ' + roundDisplay(validation.transition.endHz) + ' hertz. Derived phase unavailable."><rect x="' + marker(validation.transition.startHz).toFixed(1) + '" y="0" width="' + (marker(validation.transition.endHz) - marker(validation.transition.startHz)).toFixed(1) + '" height="' + height + '" class="signal-flow-merge-transition"></rect><line x1="' + marker(recipe.mergeFrequencyHz).toFixed(1) + '" y1="0" x2="' + marker(recipe.mergeFrequencyHz).toFixed(1) + '" y2="' + height + '" class="signal-flow-merge-center"></line><polyline points="' + polyline(lowSource && lowSource.points, 0) + '" class="signal-flow-merge-source low"></polyline><polyline points="' + polyline(lowSource && lowSource.points, recipe.magnitudeOffsetDb) + '" class="signal-flow-merge-adjusted"></polyline><polyline points="' + polyline(highSource && highSource.points, 0) + '" class="signal-flow-merge-source high"></polyline><polyline points="' + polyline(points, 0) + '" class="signal-flow-merged-response-line"></polyline></svg><p class="signal-flow-overlay-legend">Nearfield source · Level-aligned nearfield preview · Farfield source · Derived merged response · Merge centre</p>';
	}

	function measurementGraph(measurement) {
		var points = measurement.points, width = 560, height = 180, left = 42, top = 12, min = Math.log(points[0].frequencyHz), range = Math.log(points[points.length - 1].frequencyHz) - min || 1;
		var magnitudes = points.map(function(point) { return point.magnitudeDb; }), low = Math.min.apply(null, magnitudes), high = Math.max.apply(null, magnitudes), dbRange = high - low || 1;
		var polyline = points.map(function(point) { return (left + (Math.log(point.frequencyHz) - min) / range * (width - left - 10)).toFixed(1) + ',' + (top + (high - point.magnitudeDb) / dbRange * (height - top - 28)).toFixed(1); }).join(' ');
		var electrical = measurementOverlay && measurementOverlay.measurementId === measurement.id ? measurementOverlay.electrical : null;
		function electricalLine(field, cssClass) {
			if (!electrical || !electrical.points || electrical.points[0][field] === undefined) return '';
			var value = electrical.points.map(function(point) { var db = Math.max(-60, Math.min(18, point[field])); return (left + (Math.log(point.frequencyHz) - min) / range * (width - left - 10)).toFixed(1) + ',' + (top + (18 - db) / 78 * (height - top - 28)).toFixed(1); }).join(' ');
			return '<polyline points="' + value + '" class="' + cssClass + '"></polyline>';
		}
		return '<div class="signal-flow-measurement-overlay-controls" aria-label="Response overlay controls"><label><input type="checkbox" checked onchange="document.querySelector(\'.signal-flow-measured-response-line\').style.display=this.checked?\'\':\'none\'"> Measured response</label><label><input type="checkbox" checked onchange="document.querySelectorAll(\'.signal-flow-electrical-response-line\').forEach(function(line){line.style.display=this.checked?\'\':\'none\'}.bind(this))"> Electrical filters</label></div><svg class="signal-flow-measurement-graph" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Measured magnitude response from ' + points[0].frequencyHz + ' to ' + points[points.length - 1].frequencyHz + ' hertz; ' + points.length + ' source points. Phase ' + (measurement.units.phase ? 'is available' : 'is not available') + '. Electrical curves use a separate relative decibel scale and are not an acoustic sum."><polyline points="' + polyline + '" class="signal-flow-measured-response-line"></polyline>' + electricalLine('crossoverMagnitudeDb', 'signal-flow-electrical-response-line crossover') + electricalLine('eqMagnitudeDb', 'signal-flow-electrical-response-line eq') + electricalLine('magnitudeDb', 'signal-flow-electrical-response-line combined') + '</svg><p class="signal-flow-overlay-legend">Measured response · Crossover electrical response · EQ electrical response · Combined electrical processing response</p>';
	}

	function selectMeasurementFile(input) {
		var file = input.files && input.files[0];
		if (!file) return;
		if (file.size > state.capabilities.measurements.limits.fileBytes) { $('#signal-flow-measurement-preview').text('File exceeds the 2 MiB safety limit.'); return; }
		var reader = new FileReader();
		reader.onload = function() { beo.send({target: 'signal-flow', header: 'previewMeasurement', content: {filename: file.name, text: reader.result}}); };
		reader.onerror = function() { $('#signal-flow-measurement-preview').text('The selected file could not be read.'); };
		reader.readAsText(file, 'UTF-8');
	}

	function confirmMeasurementImport() { if (measurementPreview) beo.send({target: 'signal-flow', header: 'measurementDraft', content: {configuration: state.draft, action: 'import', token: measurementPreview.token, revision: state.revision}}); }
	function selectMeasurement(id) { selectedMeasurementId = id; requestMeasurementOverlay(id); render(); }
	function requestMeasurementOverlay(id) { beo.send({target: 'signal-flow', header: 'measurementOverlay', content: {configuration: state.draft, measurementId: id}}); }
	function updateMeasurement() {
		beo.send({target: 'signal-flow', header: 'measurementDraft', content: {configuration: state.draft, action: 'update', measurementId: selectedMeasurementId, name: $('#signal-flow-measurement-name').val(), description: $('#signal-flow-measurement-notes').val(), type: $('#signal-flow-measurement-type').val(), outputId: $('#signal-flow-measurement-output').val() || null, revision: state.revision}});
	}
	function confirmRemoveMeasurement() { pendingMeasurementRemove = selectedMeasurementId; beo.ask('signal-flow-measurement-remove'); }
	function removeMeasurement() { beo.ask(); if (pendingMeasurementRemove) beo.send({target: 'signal-flow', header: 'measurementDraft', content: {configuration: state.draft, action: 'remove', measurementId: pendingMeasurementRemove, revision: state.revision}}); pendingMeasurementRemove = null; }
	function startMeasurementMerge() { mergeOpen = true; mergePreview = null; mergeEditingRecipe = null; mergeDraftValues = null; render(); }
	function editMeasurementMerge(measurementID) {
		var measurement = state.draft.measurements.measurements.find(function(item) { return item.id === measurementID; });
		if (!measurement || !measurement.mergeRecipe) return;
		mergeOpen = true; mergePreview = null; mergeEditingRecipe = JSON.parse(JSON.stringify(measurement.mergeRecipe)); mergeDraftValues = JSON.parse(JSON.stringify(measurement.mergeRecipe)); render();
	}
	function mergeFormContent() {
		return {lowSourceId: $('#signal-flow-merge-low').val(), highSourceId: $('#signal-flow-merge-high').val(), magnitudeOffsetDb: Number($('#signal-flow-merge-offset').val()), mergeFrequencyHz: $('#signal-flow-merge-frequency').val() === '' ? null : Number($('#signal-flow-merge-frequency').val()), transitionWidthOctaves: Number($('#signal-flow-merge-width').val()), name: $('#signal-flow-merge-name').val(), notes: $('#signal-flow-merge-notes').val(), recipeId: mergeEditingRecipe ? mergeEditingRecipe.id : mergePreview && mergePreview.recipe.id, resultMeasurementId: mergeEditingRecipe ? mergeEditingRecipe.resultMeasurementId : mergePreview && mergePreview.recipe.resultMeasurementId};
	}
	function captureMeasurementMergeDraft() { if ($('#signal-flow-merge-low').length) mergeDraftValues = mergeFormContent(); }
	function previewMeasurementMerge() { var content = mergeFormContent(); mergeDraftValues = JSON.parse(JSON.stringify(content)); content.configuration = state.draft; beo.send({target: 'signal-flow', header: 'previewMeasurementMerge', content: content}); }
	function useSuggestedMergeOffset() { if (!mergePreview || !mergePreview.suggestedAlignment.available) return; $('#signal-flow-merge-offset').val(mergePreview.suggestedAlignment.suggestedOffsetDb); captureMeasurementMergeDraft(); previewMeasurementMerge(); }
	function resetMeasurementMergeOffset() { $('#signal-flow-merge-offset').val(0); captureMeasurementMergeDraft(); if (mergePreview) previewMeasurementMerge(); }
	function saveMeasurementMerge() { if (!mergePreview || !mergePreview.validation.valid) return; var content = mergeFormContent(); content.configuration = state.draft; content.revision = state.revision; beo.send({target: 'signal-flow', header: 'saveMeasurementMerge', content: content}); mergeOpen = false; }
	function closeMeasurementMerge() { mergeOpen = false; mergePreview = null; mergeEditingRecipe = null; mergeDraftValues = null; render(); }

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

	function deploymentTab(event, nextControlId) {
		if (event.key !== 'Tab' || event.shiftKey) return;
		var next = document.getElementById(nextControlId);
		if (next && next.disabled) {
			event.preventDefault();
			pendingDeploymentFocusId = nextControlId;
			pendingDeploymentFocusSourceId = event.currentTarget.id;
			return;
		}
		processingTab(event, nextControlId);
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
		beo.send({target: 'signal-flow', header: 'calculateEQResponse', content: {configuration: state.draft, outputId: outputID}});
	}

	function selectEQBand(outputID, bandID) {
		signalFlowUIState.selectEQBand(state, outputID, bandID);
		render();
	}

	function updateEQ(outputID, bandID, field, value) {
		if (field === 'frequencyHz' || field === 'gainDb' || field === 'shape') {
			var numeric = Number(value);
			value = String(value).trim() === '' ? '' : isFinite(numeric) ? numeric : value;
		}
		signalFlowUIState.editEQBand(state, outputID, bandID, field, value);
		validateDraft();
		requestPreview(outputID);
		render();
	}

	function moveEQBand(outputID, bandID, direction) {
		signalFlowUIState.reorderEQBand(state, outputID, bandID, direction);
		validateDraft();
		requestPreview(outputID);
		render();
	}

	function eqDraft(action, outputID, bandID, type, destinationOutputID) {
		beo.send({target: 'signal-flow', header: 'eqDraft', content: {
			configuration: state.draft,
			action: action,
			outputId: outputID,
			bandId: bandID || null,
			type: type || null,
			destinationOutputId: destinationOutputID || null,
			revision: state.revision
		}});
	}

	function resetEQBand(outputID, bandID) {
		var output = state.draft.parametricEQ.outputs.find(function(item) { return item.outputId === outputID; });
		var band = output.bands.find(function(item) { return item.id === bandID; });
		var reset = {enabled: true, type: band.type, frequencyHz: 1000, gainDb: 0, shape: 0.7071, label: ''};
		Object.keys(reset).forEach(function(field) { signalFlowUIState.editEQBand(state, outputID, bandID, field, reset[field]); });
		validateDraft();
		requestPreview(outputID);
		render();
	}

	function copyEQ(sourceOutputID, destinationOutputID) {
		if (destinationOutputID) eqDraft('copy', sourceOutputID, null, null, destinationOutputID);
	}

	function confirmResetEQ(outputID) {
		var output = state.draft.parametricEQ.outputs.find(function(item) { return item.outputId === outputID; });
		if (!output || !output.bands.length) return;
		pendingEQResetOutput = outputID;
		beo.ask('signal-flow-eq-reset');
	}

	function resetAllEQ() {
		beo.ask();
		if (pendingEQResetOutput) eqDraft('reset', pendingEQResetOutput);
		pendingEQResetOutput = null;
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
		updateEQ: updateEQ,
		selectEQBand: selectEQBand,
		moveEQBand: moveEQBand,
		eqDraft: eqDraft,
		resetEQBand: resetEQBand,
		copyEQ: copyEQ,
		confirmResetEQ: confirmResetEQ,
		resetAllEQ: resetAllEQ,
		selectMeasurementFile: selectMeasurementFile,
		confirmMeasurementImport: confirmMeasurementImport,
		selectMeasurement: selectMeasurement,
		updateMeasurement: updateMeasurement,
		confirmRemoveMeasurement: confirmRemoveMeasurement,
		removeMeasurement: removeMeasurement,
		startMeasurementMerge: startMeasurementMerge,
		editMeasurementMerge: editMeasurementMerge,
		captureMeasurementMergeDraft: captureMeasurementMergeDraft,
		previewMeasurementMerge: previewMeasurementMerge,
		useSuggestedMergeOffset: useSuggestedMergeOffset,
		resetMeasurementMergeOffset: resetMeasurementMergeOffset,
		saveMeasurementMerge: saveMeasurementMerge,
		closeMeasurementMerge: closeMeasurementMerge,
		updateDelay: updateDelay,
		changeDelayUnit: changeDelayUnit,
		processingTab: processingTab,
		deploymentTab: deploymentTab,
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
