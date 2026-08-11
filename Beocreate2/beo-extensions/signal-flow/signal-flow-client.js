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
			showWorkspace: function() {},
			selectOutput: function() {},
			toggleOutputSection: function() {},
			useMeasurementFor: function() {},
			selectEQMeasurement: function() {},
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
	var openProtectionOutputs = {};
	var openEQSuggestionOutputs = {};
	var eqSuggestionDraftOptions = {};
	var openAlignmentOutputs = {};
	var alignmentDraftOptions = {};
	var openCrossoverAssistanceOutputs = {};
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
	var currentWorkspace = 'design';
	var selectedOutputID = null;
	var openOutputSections = {};
	var contextualMeasurementSelections = {eq: {}, alignment: {}, crossover: {}};

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
		if (data.header === 'eligibleEQMeasurements') {
			signalFlowUIState.receiveEQSuggestionEligibility(state, data.content);
			var selectedEQSource = signalFlowUIState.eqSuggestionSource(data.content, contextualMeasurementSelections.eq[data.content.outputId]);
			if (selectedEQSource) contextualMeasurementSelections.eq[data.content.outputId] = selectedEQSource.id;
		}
		if (data.header === 'eqSuggestions') signalFlowUIState.receiveEQSuggestions(state, data.content);
		if (data.header === 'eqSuggestionDraft') {
			signalFlowUIState.receiveEQSuggestionDraft(state, data.content);
			requestPreview(data.content.outputId);
		}
		if (data.header === 'eligibleAlignments') signalFlowUIState.receiveAlignmentEligibility(state, data.content);
		if (data.header === 'eligibleCrossoverMeasurements') signalFlowUIState.receiveCrossoverAssistanceEligibility(state, data.content);
		if (data.header === 'crossoverSuggestions') signalFlowUIState.receiveCrossoverSuggestions(state, data.content);
		if (data.header === 'crossoverSuggestionDraft') {
			signalFlowUIState.receiveCrossoverSuggestionDraft(state, data.content);
			requestPreview(data.content.lowPassOutputId);
			requestPreview(data.content.highPassOutputId);
		}
		if (data.header === 'alignmentAnalysis') signalFlowUIState.receiveAlignmentAnalysis(state, data.content);
		if (data.header === 'alignmentDraft') {
			signalFlowUIState.receiveAlignmentDraft(state, data.content);
			requestPreview(data.content.outputId);
		}
		if (data.header === 'protectionPreview') signalFlowUIState.receiveProtectionPreview(state, data.content);
		if (data.header === 'protectionSimulation') signalFlowUIState.receiveProtectionSimulation(state, data.content);
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

	function showWorkspace(workspace) {
		if (['design', 'measurements', 'review'].indexOf(workspace) === -1) return;
		currentWorkspace = workspace;
		['design', 'measurements', 'review'].forEach(function(item) {
			$('#signal-flow-tab-' + item).attr('aria-selected', item === workspace);
			$('#signal-flow-view-' + item).toggleClass('hidden', item !== workspace);
		});
		if (workspace === 'measurements') renderMeasurements();
		if (workspace === 'review') renderDesignReview();
	}

	function selectOutput(outputID, section) {
		if (!state.draft || !state.draft.outputs.some(function(output) { return output.id === outputID; })) return;
		selectedOutputID = outputID;
		if (section) openOutputSections[outputID] = section;
		currentWorkspace = 'design';
		render('signal-flow-output-select-' + outputID);
	}

	function toggleOutputSection(outputID, section) {
		openOutputSections[outputID] = openOutputSections[outputID] === section ? null : section;
		render('signal-flow-section-' + section + '-' + outputID);
	}

	function useMeasurementFor(action, outputID) {
		var section = action === 'eq' ? 'eq' : action === 'alignment' ? 'crossover' : 'crossover';
		contextualMeasurementSelections[action][outputID] = selectedMeasurementId;
		selectOutput(outputID, section);
		if (action === 'eq') openEQSuggestionOutputs[outputID] = true;
		if (action === 'alignment') openAlignmentOutputs[outputID] = true;
		if (action === 'crossover') openCrossoverAssistanceOutputs[outputID] = true;
		if (action === 'eq') beo.send({target: 'signal-flow', header: 'eligibleEQMeasurements', content: {configuration: state.draft, outputId: outputID}});
		if (action === 'alignment') beo.send({target: 'signal-flow', header: 'eligibleAlignments', content: {configuration: state.draft, outputId: outputID}});
		if (action === 'crossover') beo.send({target: 'signal-flow', header: 'eligibleCrossoverMeasurements', content: {configuration: state.draft, outputId: outputID}});
		render();
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

	function crossoverAssistanceGraph(analysis, suggestion) {
		if (!analysis || !suggestion || !suggestion.prediction || !suggestion.prediction.length) return '';
		var points = suggestion.prediction, width = 560, height = 190, left = 42, top = 12;
		var minimum = Math.log(points[0].frequencyHz), range = Math.log(points[points.length - 1].frequencyHz) - minimum || 1;
		var values = [];
		points.forEach(function(point) { values.push(point.lowDriverDb, point.highDriverDb, point.currentResultDb, point.sumDb); });
		var low = Math.min.apply(null, values) - 1, high = Math.max.apply(null, values) + 1, dbRange = high - low || 1;
		function line(field) { return points.map(function(point) {
			return (left + (Math.log(point.frequencyHz) - minimum) / range * (width - left - 10)).toFixed(1) + ',' +
				(top + (high - point[field]) / dbRange * (height - top - 28)).toFixed(1);
		}).join(' '); }
		var mode = analysis.mode === 'phase-aware' ? 'Phase-aware predicted complex acoustic sum' : 'Magnitude-only power summation; no complex acoustic sum';
		var sourceNames = analysis.sources && analysis.sources.length === 2 ? analysis.sources[0].name + ' and ' + analysis.sources[1].name : 'Low driver and high driver';
		return '<svg class="signal-flow-crossover-assistance-graph" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHTML(mode + '. ' + sourceNames + ', current crossover result and selected suggested result from ' + roundDisplay(analysis.candidateRange.minimumFrequencyHz) + ' to ' + roundDisplay(analysis.candidateRange.maximumFrequencyHz) + ' hertz.') + '">' +
			'<polyline points="' + line('lowDriverDb') + '" class="low-driver"></polyline><polyline points="' + line('highDriverDb') + '" class="high-driver"></polyline>' +
			'<polyline points="' + line('currentResultDb') + '" class="current-result"></polyline><polyline points="' + line('sumDb') + '" class="suggested-result"></polyline></svg>' +
			'<p class="signal-flow-overlay-legend">Low driver · High driver · Current crossover result · Selected suggested result</p>';
	}

	function crossoverAssistanceControls(output) {
		var open = !!openCrossoverAssistanceOutputs[output.id];
		var undo = state.crossoverAssistanceUndo[output.id] ? '<button type="button" class="button pill outline" onclick="signalFlow.undoCrossoverSuggestion(\'' + output.id + '\');">Undo accepted crossover</button>' : '';
		if (!open) return '<div class="signal-flow-crossover-assistance-entry"><button type="button" class="button pill outline" aria-expanded="false" onclick="signalFlow.openCrossoverAssistance(\'' + output.id + '\');">Suggest setup</button>' + undo + '<p>Compare a few measurement-based crossover alternatives before changing the draft.</p></div>';
		var eligibility = state.crossoverAssistanceEligibility[output.id], pairs = eligibility ? eligibility.pairs : [];
		var first = {}, second = {};
		pairs.filter(function(pair) { return pair.eligible; }).forEach(function(pair) { first[pair.measurementAId] = pair.measurementAName; second[pair.measurementBId] = pair.measurementBName + ' · ' + pair.outputBId; });
		var sourceA = Object.keys(first).map(function(id) { return option(id, first[id], contextualMeasurementSelections.crossover[output.id]); }).join('');
		var sourceB = Object.keys(second).map(function(id) { return option(id, second[id], ''); }).join('');
		var unavailable = pairs.filter(function(pair) { return !pair.eligible; }).map(function(pair) { return '<li>' + escapeHTML(pair.measurementAName + ' + ' + pair.measurementBName + ': ' + pair.errors.map(function(item) { return item.message; }).join(' ')) + '</li>'; }).join('');
		var analysis = state.crossoverAssistanceAnalyses[output.id], selectedID = state.selectedCrossoverSuggestions[output.id], selected = analysis && analysis.suggestions.find(function(item) { return item.id === selectedID; });
		var result = '';
		if (analysis && selected) {
			var lowOutput = state.draft.outputs.find(function(item) { return item.id === selected.lowPassOutputId; });
			var highOutput = state.draft.outputs.find(function(item) { return item.id === selected.highPassOutputId; });
			function orderLabel(order) { return order === 2 ? '2nd order' : order === 3 ? '3rd order' : order + 'th order'; }
			function outputLabel(outputID) { var found = state.draft.outputs.find(function(item) { return item.id === outputID; }); return found ? found.label : outputID; }
			var alternatives = analysis.suggestions.map(function(item) {
				return '<label class="signal-flow-crossover-candidate' + (item.id === selectedID ? ' selected' : '') + '"><input type="radio" name="signal-flow-crossover-candidate-' + output.id + '" value="' + item.id + '" ' + (item.id === selectedID ? 'checked ' : '') + 'onchange="signalFlow.selectCrossoverSuggestion(\'' + output.id + '\', this.value);"><span><strong>' + escapeHTML(item.label) + '</strong> · ' + roundDisplay(item.frequencyHz) + ' Hz · ' + orderLabel(item.order) + ' ' + escapeHTML(item.family === 'linkwitz-riley' ? 'Linkwitz-Riley' : 'Butterworth') + '</span></label>';
			}).join('');
			var delay = selected.delaySuggestion ? ' · Delay ' + roundDisplay(selected.delaySuggestion.adjustmentMs) + ' ms on ' + escapeHTML(outputLabel(selected.delaySuggestion.outputId)) : '';
			var warnings = analysis.warnings.concat(selected.warnings || []).map(function(item) { return '<p class="signal-flow-warning">' + escapeHTML(item.message) + '</p>'; }).join('');
			var score = selected.scoreComponents;
			result = '<div class="signal-flow-crossover-assistance-results" role="region" aria-label="Assisted crossover suggestions"><p role="status" aria-live="polite"><strong>' + escapeHTML(analysis.mode === 'phase-aware' ? 'Phase-aware crossover suggestion' : 'Magnitude-based crossover suggestion') + '</strong> · ' + analysis.suggestions.length + ' alternative' + (analysis.suggestions.length === 1 ? '' : 's') + '</p>' +
				'<div class="signal-flow-crossover-candidates" role="radiogroup" aria-label="Crossover alternatives">' + alternatives + '</div>' +
				'<div class="signal-flow-crossover-recommendation"><p><strong>' + roundDisplay(selected.frequencyHz) + ' Hz · ' + orderLabel(selected.order) + ' · ' + (selected.polarityRecommendation === 'unavailable' ? 'polarity unchanged' : escapeHTML(selected.polarityRecommendation) + ' polarity') + '</strong>' + delay + '</p><p>' + escapeHTML(selected.reason) + ' Confidence ' + escapeHTML(selected.confidence) + '.</p></div>' +
				warnings + crossoverAssistanceGraph(analysis, selected) + '<p><strong>' + escapeHTML(analysis.summary) + '</strong></p>' +
				(analysis.currentBaseline.crossoverFrequencyHz ? '<p>Current crossover baseline: ' + roundDisplay(analysis.currentBaseline.crossoverFrequencyHz) + ' Hz.</p>' : '') +
				'<p>' + escapeHTML(analysis.timingReference.statement) + '</p>' +
				'<button type="button" class="button pill black" ' + (state.connected ? '' : 'disabled ') + 'onclick="signalFlow.acceptCrossoverSuggestion(\'' + output.id + '\');">Apply suggestion to ' + escapeHTML(lowOutput ? lowOutput.label : selected.lowPassOutputId) + ' and ' + escapeHTML(highOutput ? highOutput.label : selected.highPassOutputId) + '</button> <button type="button" class="button pill outline" onclick="signalFlow.rejectCrossoverSuggestions(\'' + output.id + '\');">Close suggestions</button>' +
				'<details class="signal-flow-crossover-assistance-advanced" ontoggle="this.querySelector(\'summary\').setAttribute(\'aria-expanded\', this.open ? \'true\' : \'false\');"><summary aria-expanded="false">Advanced analysis</summary><dl><dt>Analysis range</dt><dd>' + roundDisplay(analysis.candidateRange.minimumFrequencyHz) + '–' + roundDisplay(analysis.candidateRange.maximumFrequencyHz) + ' Hz</dd><dt>Timing reference</dt><dd>' + escapeHTML(analysis.timingReference.classification) + '</dd><dt>Objective score</dt><dd>' + selected.score + '</dd><dt>Smoothness</dt><dd>' + score.smoothness + '</dd><dt>Cancellation</dt><dd>' + score.cancellation + '</dd><dt>Gap / overlap</dt><dd>' + score.gap + ' / ' + score.overlap + '</dd><dt>Phase / complexity</dt><dd>' + score.phase + ' / ' + score.complexity + '</dd><dt>Delay samples</dt><dd>' + (selected.delaySuggestion ? selected.delaySuggestion.samplesAt48kHz : 'Not suggested') + '</dd><dt>Included processing</dt><dd>' + escapeHTML(analysis.currentBaseline.processingIncluded.join(', ')) + '</dd></dl></details></div>';
		}
		var context = pairs.find(function(pair) { return pair.eligible; });
		return '<section class="signal-flow-crossover-assistance" aria-label="Assisted crossover design for ' + escapeHTML(output.label) + '"><div class="signal-flow-crossover-assistance-heading"><h4>Suggest setup</h4><button type="button" class="button pill outline" aria-expanded="true" onclick="signalFlow.openCrossoverAssistance(\'' + output.id + '\');">Close</button></div>' +
			'<div class="signal-flow-crossover-assistance-primary"><label for="signal-flow-crossover-source-a-' + output.id + '">First driver measurement</label><select id="signal-flow-crossover-source-a-' + output.id + '">' + sourceA + '</select><label for="signal-flow-crossover-source-b-' + output.id + '">Second driver measurement</label><select id="signal-flow-crossover-source-b-' + output.id + '">' + sourceB + '</select><button type="button" class="button pill black" ' + (pairs.some(function(pair) { return pair.eligible; }) && state.connected ? '' : 'disabled ') + 'onclick="signalFlow.suggestCrossover(\'' + output.id + '\');">Generate suggestions</button></div>' +
			'<p class="signal-flow-crossover-assistance-range" role="status">' + (analysis ? 'Candidate region ' + roundDisplay(analysis.candidateRange.minimumFrequencyHz) + '–' + roundDisplay(analysis.candidateRange.maximumFrequencyHz) + ' Hz.' : context ? 'Candidate region ' + roundDisplay(context.candidateRange.minimumFrequencyHz) + '–' + roundDisplay(context.candidateRange.maximumFrequencyHz) + ' Hz · ' + escapeHTML(context.mode === 'phase-aware' ? 'phase-aware available' : 'magnitude-only') + '.' : 'Choose two suitable measurements for different driver ways.') + '</p>' +
			(!pairs.length ? '<p class="signal-flow-warning">No second driver measurement is available for this output.</p>' : '') + (unavailable ? '<ul class="signal-flow-crossover-assistance-issues">' + unavailable + '</ul>' : '') + result + '</section>';
	}

	function eqSuggestionGraph(analysis) {
		if (!analysis || !analysis.prediction || !analysis.prediction.length) return '';
		var points = analysis.prediction, width = 560, height = 190, left = 42, top = 12;
		var minimum = Math.log(points[0].frequencyHz), range = Math.log(points[points.length - 1].frequencyHz) - minimum || 1;
		var values = [];
		points.forEach(function(point) { values.push(point.measuredDb, point.targetDb, point.currentEstimatedDb, point.predictedWithSuggestionsDb); });
		var low = Math.min.apply(null, values) - 1, high = Math.max.apply(null, values) + 1, dbRange = high - low || 1;
		function line(field) { return points.map(function(point) {
			return (left + (Math.log(point.frequencyHz) - minimum) / range * (width - left - 10)).toFixed(1) + ',' +
				(top + (high - point[field]) / dbRange * (height - top - 28)).toFixed(1);
		}).join(' '); }
		return '<svg class="signal-flow-eq-suggestion-graph" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Assisted EQ prediction. Measured, Target, Current estimated response and Predicted with suggestions from ' +
			roundDisplay(analysis.activeRange.minimumFrequencyHz) + ' to ' + roundDisplay(analysis.activeRange.maximumFrequencyHz) + ' hertz. ' +
			escapeHTML(analysis.summary) + '"><polyline points="' + line('measuredDb') + '" class="measured"></polyline>' +
			'<polyline points="' + line('targetDb') + '" class="target"></polyline><polyline points="' + line('currentEstimatedDb') +
			'" class="current"></polyline><polyline points="' + line('predictedWithSuggestionsDb') + '" class="predicted"></polyline></svg>' +
			'<p class="signal-flow-overlay-legend">Measured · Target · Current estimated response · Predicted with suggestions</p>';
	}

	function alignmentGraph(analysis) {
		if (!analysis || !analysis.prediction || !analysis.prediction.length) return '';
		var points = analysis.prediction, width = 560, height = 190, left = 42, top = 12;
		var minimum = Math.log(points[0].frequencyHz), range = Math.log(points[points.length - 1].frequencyHz) - minimum || 1;
		var values = [];
		points.forEach(function(point) { values.push(point.sourceADb, point.sourceBDb, point.currentSumDb, point.suggestedSumDb); });
		var low = Math.min.apply(null, values) - 1, high = Math.max.apply(null, values) + 1, dbRange = high - low || 1;
		function line(field) { return points.map(function(point) {
			return (left + (Math.log(point.frequencyHz) - minimum) / range * (width - left - 10)).toFixed(1) + ',' +
				(top + (high - point[field]) / dbRange * (height - top - 28)).toFixed(1);
		}).join(' '); }
		return '<svg class="signal-flow-alignment-graph" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Predicted acoustic sum from ' +
			roundDisplay(analysis.activeRange.minimumFrequencyHz) + ' to ' + roundDisplay(analysis.activeRange.maximumFrequencyHz) + ' hertz. Source A, Source B, current sum and sum after suggested alignment. ' + escapeHTML(analysis.summary) + '">' +
			'<polyline points="' + line('sourceADb') + '" class="source-a"></polyline><polyline points="' + line('sourceBDb') + '" class="source-b"></polyline>' +
			'<polyline points="' + line('currentSumDb') + '" class="current-sum"></polyline><polyline points="' + line('suggestedSumDb') + '" class="suggested-sum"></polyline></svg>' +
			'<p class="signal-flow-overlay-legend">Source A · Source B · Current predicted sum · Sum after suggested alignment</p>';
	}

	function alignmentControls(output) {
		var open = !!openAlignmentOutputs[output.id];
		var undo = state.alignmentUndo[output.id] ? '<button type="button" class="button pill outline" onclick="signalFlow.undoAlignment(\'' + output.id + '\');">Undo accepted alignment</button>' : '';
		if (!open) return '<div class="signal-flow-alignment-entry"><button type="button" class="button pill outline" aria-expanded="false" onclick="signalFlow.openAlignment(\'' + output.id + '\');">Align drivers</button>' + undo + '<p>Review relative phase, delay and polarity around the configured crossover.</p></div>';
		var eligibility = state.alignmentEligibility[output.id], pairs = eligibility ? eligibility.pairs : [];
		var first = {}, second = {};
		pairs.forEach(function(pair) {
			first[pair.measurementAId] = pair.measurementAName;
			second[pair.measurementBId] = pair.measurementBName + ' · ' + pair.outputBId + (pair.eligible ? '' : ' · unavailable');
		});
		var firstIDs = Object.keys(first), secondIDs = Object.keys(second);
		var sourceA = firstIDs.map(function(id) { return option(id, first[id], contextualMeasurementSelections.alignment[output.id]); }).join('');
		var sourceB = secondIDs.map(function(id) { return option(id, second[id], ''); }).join('');
		var unavailable = pairs.filter(function(pair) { return !pair.eligible; }).map(function(pair) { return '<li>' + escapeHTML(pair.measurementAName + ' + ' + pair.measurementBName + ': ' + pair.errors.map(function(problem) { return problem.message; }).join(' ')) + '</li>'; }).join('');
		var analysis = state.alignmentAnalyses[output.id], draft = alignmentDraftOptions[output.id] || {minimumFrequencyHz: null, maximumFrequencyHz: null};
		var result = '';
		if (analysis) {
			var suggestionOutput = state.draft.outputs.find(function(item) { return item.id === analysis.suggestion.outputId; });
			result = '<div class="signal-flow-alignment-results" role="region" aria-label="Driver alignment suggestion"><p role="status" aria-live="polite"><strong>Suggested alignment</strong> · Adjust ' + escapeHTML(suggestionOutput ? suggestionOutput.label : analysis.suggestion.outputId) + '</p>' +
				'<p><strong>Delay:</strong> add ' + roundDisplay(analysis.suggestion.delayAdjustmentMs) + ' ms; resulting delay ' + roundDisplay(analysis.suggestion.resultingDelayMs) + ' ms. <strong>Polarity:</strong> ' + (analysis.suggestion.polarityInverted ? 'Inverted' : 'Normal') + '.</p>' +
				'<p>' + escapeHTML(analysis.suggestion.reason) + ' Confidence ' + escapeHTML(analysis.suggestion.confidence) + '. Estimated mean sum change ' + analysis.suggestion.estimatedMeanSumImprovementDb + ' dB.</p>' +
				analysis.warnings.map(function(item) { return '<p class="signal-flow-warning">' + escapeHTML(item.message) + '</p>'; }).join('') + alignmentGraph(analysis) +
				'<p><strong>Predicted acoustic sum</strong> uses compatible complex measurement data and current processing. It is not a new measurement or a driver-safety conclusion.</p>' +
				'<button type="button" class="button pill black" ' + (state.connected ? '' : 'disabled ') + 'onclick="signalFlow.acceptAlignment(\'' + output.id + '\');">Apply suggestion to ' + escapeHTML(suggestionOutput ? suggestionOutput.label : analysis.suggestion.outputId) + '</button> <button type="button" class="button pill outline" onclick="signalFlow.rejectAlignment(\'' + output.id + '\');">Close suggestion</button>' +
				'<details class="signal-flow-alignment-advanced" ontoggle="this.querySelector(\'summary\').setAttribute(\'aria-expanded\', this.open ? \'true\' : \'false\');"><summary aria-expanded="false">Advanced analysis</summary><p>' + escapeHTML(analysis.reference.statement) + '</p><dl><dt>Fit range</dt><dd>' + roundDisplay(analysis.activeRange.minimumFrequencyHz) + '–' + roundDisplay(analysis.activeRange.maximumFrequencyHz) + ' Hz</dd><dt>Relative delay estimate</dt><dd>' + analysis.delayEstimate.relativeDelayMs + ' ms</dd><dt>Quality</dt><dd>' + analysis.delayEstimate.quality + ' · residual phase ' + analysis.delayEstimate.residualPhaseDegrees + '°</dd><dt>Adjustment at 48 kHz</dt><dd>' + analysis.delayEstimate.samplesAt48kHz + ' samples</dd><dt>Alternative polarity</dt><dd>Available in the prediction data; the primary recommendation uses the stronger mean crossover sum.</dd><dt>Included processing</dt><dd>' + escapeHTML(analysis.processingIncluded.join(', ')) + '</dd></dl></details></div>';
		}
		var context = pairs.find(function(pair) { return pair.eligible && pair.crossoverContext; });
		return '<section class="signal-flow-alignment" aria-label="Driver phase and time alignment for ' + escapeHTML(output.label) + '"><div class="signal-flow-alignment-heading"><h4>Align drivers</h4><button type="button" class="button pill outline" aria-expanded="true" onclick="signalFlow.openAlignment(\'' + output.id + '\');">Close</button></div>' +
			'<div class="signal-flow-alignment-primary"><label for="signal-flow-alignment-source-a-' + output.id + '">First driver measurement</label><select id="signal-flow-alignment-source-a-' + output.id + '">' + sourceA + '</select><label for="signal-flow-alignment-source-b-' + output.id + '">Second driver measurement</label><select id="signal-flow-alignment-source-b-' + output.id + '">' + sourceB + '</select><button type="button" class="button pill black" ' + (pairs.some(function(pair) { return pair.eligible; }) && state.connected ? '' : 'disabled ') + 'onclick="signalFlow.analyseAlignment(\'' + output.id + '\');">Analyse alignment</button></div>' +
			'<p class="signal-flow-alignment-range" role="status">' + (analysis ? 'Crossover analysis region ' + roundDisplay(analysis.activeRange.minimumFrequencyHz) + '–' + roundDisplay(analysis.activeRange.maximumFrequencyHz) + ' Hz.' : context ? 'Proposed crossover region ' + roundDisplay(context.crossoverContext.minimumFrequencyHz) + '–' + roundDisplay(context.crossoverContext.maximumFrequencyHz) + ' Hz.' : 'Choose two compatible phase measurements around a configured crossover.') + '</p>' +
			(!pairs.length ? '<p class="signal-flow-warning">No second driver measurement is available for this output.</p>' : '') + (unavailable ? '<ul class="signal-flow-alignment-source-issues">' + unavailable + '</ul>' : '') +
			'<details class="signal-flow-alignment-options" ontoggle="this.querySelector(\'summary\').setAttribute(\'aria-expanded\', this.open ? \'true\' : \'false\');"><summary aria-expanded="false">Advanced</summary><div><label>Minimum analysis frequency (Hz)<input id="signal-flow-alignment-min-' + output.id + '" type="number" placeholder="Automatic crossover region" value="' + escapeHTML(draft.minimumFrequencyHz === null ? '' : draft.minimumFrequencyHz) + '"></label><label>Maximum analysis frequency (Hz)<input id="signal-flow-alignment-max-' + output.id + '" type="number" placeholder="Automatic crossover region" value="' + escapeHTML(draft.maximumFrequencyHz === null ? '' : draft.maximumFrequencyHz) + '"></label><p>Phase unwrap uses shortest continuous ±180° steps. Delay uses a robust multi-point phase-slope fit. Raw source phase remains unchanged.</p></div></details>' + result + '</section>';
	}

	function eqSuggestionControls(output) {
		var open = !!openEQSuggestionOutputs[output.id];
		var undo = state.eqSuggestionUndo[output.id] ? '<button type="button" class="button pill outline" onclick="signalFlow.undoEQSuggestions(\'' + output.id + '\');">Undo accepted suggestion set</button>' : '';
		if (!open) return '<div class="signal-flow-eq-suggestion-entry"><button type="button" class="button pill outline" aria-expanded="false" onclick="signalFlow.openEQSuggestions(\'' + output.id + '\');">Suggest EQ from measurement</button>' + undo + '<p>Human-reviewed, bounded peaking EQ suggestions. No automatic design changes.</p></div>';
		var eligibility = state.eqSuggestionEligibility[output.id];
		var measurements = eligibility ? eligibility.measurements : [];
		var selectedSource = signalFlowUIState.eqSuggestionSource(eligibility, contextualMeasurementSelections.eq[output.id]);
		var selectedSourceID = selectedSource ? selectedSource.id : null;
		var measurementOptions = measurements.map(function(item) {
			var label = item.name + ' · ' + item.type + (item.eligible ? '' : ' · unavailable');
			return '<option value="' + escapeHTML(item.id) + '" ' + (item.id === selectedSourceID ? 'selected ' : '') + '>' + escapeHTML(label) + '</option>';
		}).join('');
		var unavailable = measurements.filter(function(item) { return !item.eligible && item.id !== selectedSourceID; }).map(function(item) { return '<li>' + escapeHTML(item.name + ': ' + item.errors.map(function(problem) { return problem.message; }).join(' ')) + '</li>'; }).join('');
		var selectedSourceIssue = '';
		if (!selectedSource) selectedSourceIssue = '<p class="signal-flow-warning" role="status">Import and assign a reference measurement before using Suggest EQ.</p>';
		else if (!selectedSource.eligible) {
			var stale = selectedSource.errors.some(function(problem) { return problem.code === 'STALE_DERIVED_MEASUREMENT'; });
			selectedSourceIssue = '<p class="signal-flow-warning" role="alert">' + escapeHTML(stale ? 'This merged measurement is out of date. Recompute it before using Suggest EQ.' : selectedSource.errors.map(function(problem) { return problem.message; }).join(' ')) + '</p>';
		}
		var analysis = state.eqSuggestions[output.id];
		var draftOptions = eqSuggestionDraftOptions[output.id] || {target: 'flat', smoothing: '1/6', minimumFrequencyHz: null, maximumFrequencyHz: null, referenceLevelDb: null, tiltDbPerOctave: -1, boostLimitDb: 3, filterLimit: 5, considerExistingEQ: true};
		var selected = state.selectedEQSuggestions[output.id] || [];
		var analysisMarkup = '';
		if (analysis) {
			var suggestionRows = analysis.suggestions.map(function(item) {
				var checked = selected.indexOf(item.id) !== -1;
				return '<li><label><input type="checkbox" ' + (checked ? 'checked ' : '') + 'aria-describedby="' + item.id + '-reason" onchange="signalFlow.toggleEQSuggestion(\'' + output.id + '\', \'' + item.id + '\', this.checked);"> <strong>' +
					(item.gainDb > 0 ? '+' : '') + item.gainDb + ' dB at ' + item.frequencyHz + ' Hz</strong> · ' + escapeHTML(item.gainDb < 0 ? 'broad peak' : 'gentle correction') + '</label><p id="' + item.id + '-reason">' +
					escapeHTML(item.reason) + ' Headroom consequence ' + item.headroomEffectDb + ' dB.</p><details><summary>Suggestion details</summary><p>Q ' + item.q + ' · Expected local improvement ' + item.expectedLocalImprovementDb + ' dB · Confidence ' + escapeHTML(item.confidence) + '</p></details></li>';
			}).join('');
			analysisMarkup = '<div class="signal-flow-eq-suggestion-results" role="region" aria-label="EQ suggestion results"><p role="status" aria-live="polite"><strong>' + analysis.suggestions.length + ' EQ suggestion' + (analysis.suggestions.length === 1 ? '' : 's') + '</strong> · Active range ' +
				roundDisplay(analysis.activeRange.minimumFrequencyHz) + '–' + roundDisplay(analysis.activeRange.maximumFrequencyHz) + ' Hz · ' + escapeHTML(analysis.target.name) + ' target</p>' +
				analysis.warnings.map(function(item) { return '<p class="signal-flow-warning">' + escapeHTML(item.message) + '</p>'; }).join('') +
				eqSuggestionGraph(analysis) + '<p><strong>Predicted with suggestions</strong> is simulated electrical PEQ applied to preserved measurement magnitude. It is not measured and is not guaranteed to improve perceived sound.</p>' +
				'<ul class="signal-flow-eq-suggestion-list">' + suggestionRows + '</ul><div class="signal-flow-eq-suggestion-actions"><button type="button" class="button pill black" ' +
				(selected.length && state.connected ? '' : 'disabled ') + 'onclick="signalFlow.acceptEQSuggestions(\'' + output.id + '\');">Accept selected suggestions</button><button type="button" class="button pill outline" onclick="signalFlow.rejectEQSuggestions(\'' + output.id + '\');">Reject all suggestions</button></div></div>';
		}
		return '<section class="signal-flow-eq-suggestions" aria-label="Assisted EQ suggestions for ' + escapeHTML(output.label) + '"><div class="signal-flow-eq-suggestion-heading"><h4>Suggest EQ</h4><button type="button" class="button pill outline" aria-expanded="true" onclick="signalFlow.openEQSuggestions(\'' + output.id + '\');">Close</button></div>' +
			'<p>Select an assigned reference measurement and a simple target. Suggestions remain drafts until you select and accept them.</p><div class="signal-flow-eq-suggestion-primary"><label for="signal-flow-eq-suggestion-measurement-' + output.id + '">Reference measurement</label><select id="signal-flow-eq-suggestion-measurement-' + output.id + '" onchange="signalFlow.selectEQMeasurement(\'' + output.id + '\', this.value);">' + measurementOptions + '</select>' +
			'<label for="signal-flow-eq-suggestion-target-' + output.id + '">Target</label><select id="signal-flow-eq-suggestion-target-' + output.id + '">' + option('flat', 'Flat', draftOptions.target) + option('gentle-downward-tilt', 'Gentle downward tilt', draftOptions.target) + '</select>' +
			'<button type="button" class="button pill black" ' + (selectedSource && selectedSource.eligible && state.connected ? '' : 'disabled ') + 'onclick="signalFlow.suggestEQ(\'' + output.id + '\');">Suggest EQ</button></div>' + selectedSourceIssue +
			'<p class="signal-flow-eq-range" role="status">' + (analysis ? 'Active optimisation range ' + roundDisplay(analysis.activeRange.minimumFrequencyHz) + '–' + roundDisplay(analysis.activeRange.maximumFrequencyHz) + ' Hz.' : 'The active optimisation range will be derived from measurement coverage, output role and crossover.') + '</p>' +
			'<details class="signal-flow-eq-suggestion-advanced" ontoggle="this.querySelector(\'summary\').setAttribute(\'aria-expanded\', this.open ? \'true\' : \'false\');"><summary aria-expanded="false">Advanced</summary>' + (unavailable ? '<h5>Other measurement eligibility</h5><ul class="signal-flow-eq-source-issues">' + unavailable + '</ul>' : '') + '<div class="signal-flow-eq-suggestion-options"><label>Analysis smoothing<select id="signal-flow-eq-suggestion-smoothing-' + output.id + '">' + option('1/6', 'Normal (1/6 octave)', draftOptions.smoothing) + option('none', 'None', draftOptions.smoothing) + option('1/12', '1/12 octave', draftOptions.smoothing) + option('1/3', '1/3 octave', draftOptions.smoothing) + '</select></label>' +
			'<label>Minimum frequency (Hz)<input id="signal-flow-eq-suggestion-min-' + output.id + '" type="number" min="10" placeholder="Automatic" value="' + escapeHTML(draftOptions.minimumFrequencyHz === null ? '' : draftOptions.minimumFrequencyHz) + '"></label><label>Maximum frequency (Hz)<input id="signal-flow-eq-suggestion-max-' + output.id + '" type="number" max="20000" placeholder="Automatic" value="' + escapeHTML(draftOptions.maximumFrequencyHz === null ? '' : draftOptions.maximumFrequencyHz) + '"></label>' +
			'<label>Target reference level (dB)<input id="signal-flow-eq-suggestion-reference-' + output.id + '" type="number" step="0.1" placeholder="Automatic median" value="' + escapeHTML(draftOptions.referenceLevelDb === null ? '' : draftOptions.referenceLevelDb) + '"></label><label>Target tilt (dB/octave)<input id="signal-flow-eq-suggestion-tilt-' + output.id + '" type="number" step="0.1" min="-3" max="1" value="' + draftOptions.tiltDbPerOctave + '"></label>' +
			'<label>Positive boost limit (dB)<input id="signal-flow-eq-suggestion-boost-' + output.id + '" type="number" min="0" max="6" step="0.5" value="' + draftOptions.boostLimitDb + '"></label><label>Suggestion limit<input id="signal-flow-eq-suggestion-limit-' + output.id + '" type="number" min="1" max="7" value="' + draftOptions.filterLimit + '"></label>' +
			'<label><input id="signal-flow-eq-suggestion-existing-' + output.id + '" type="checkbox" ' + (draftOptions.considerExistingEQ ? 'checked ' : '') + '> Improve current EQ</label></div><p>Algorithm ' + escapeHTML(state.capabilities.assistedEQ.algorithmVersion) + ' · deterministic log grid · bounded peaking filters · mean-square error with filter-count, Q and boost penalties.</p></details>' +
			analysisMarkup + undo + '</section>';
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
		var editor = '<p class="signal-flow-eq-empty">No EQ filters. Add one manually or use Suggest EQ.</p>';
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
			eqSuggestionControls(output) +
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
		return '<section class="signal-flow-processing" aria-label="Level and timing for ' + escapeHTML(output.label) + '">' +
			'<h3>Level & timing</h3><div class="signal-flow-processing-grid">' +
			'<div class="signal-flow-field"><label for="signal-flow-gain-' + output.id + '">Level</label><div class="signal-flow-unit-input">' +
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

	function protectionControls(output) {
		var protection = state.draft.driverProtection.outputs.find(function(item) { return item.outputId === output.id; });
		var preview = state.protectionPreviews[output.id];
		var simulation = state.protectionSimulations[output.id];
		var prefix = 'signal-flow-protection-' + output.id;
		function field(section, property, label, unit, options) {
			options = options || {};
			var value = protection[section][property];
			var type = options.text ? 'text' : 'number';
			return '<div class="signal-flow-field"><label for="' + prefix + '-' + property + '">' + label + '</label><div class="signal-flow-unit-input">' +
				'<input id="' + prefix + '-' + property + '" type="' + type + '" ' + (options.step ? 'step="' + options.step + '" ' : '') +
				(options.min !== undefined ? 'min="' + options.min + '" ' : '') + (options.max !== undefined ? 'max="' + options.max + '" ' : '') +
				'value="' + escapeHTML(value === null ? '' : value) + '" aria-describedby="' + prefix + '-notice signal-flow-validation" onchange="signalFlow.updateProtection(\'' +
				output.id + '\', \'' + section + '\', \'' + property + '\', this.value, ' + (options.text ? 'true' : 'false') + ');">' +
				(unit ? '<span>' + escapeHTML(unit) + '</span>' : '') + '</div></div>';
		}
		var calculation = preview && preview.calculation;
		var calculationHTML = calculation ? '<dl><dt>Power-derived continuous voltage</dt><dd>' +
			(calculation.driverContinuousRmsVoltage === null ? 'Not available' : calculation.driverContinuousRmsVoltage + ' V RMS · ' + calculation.driverContinuousPeakVoltage + ' V peak') +
			'</dd><dt>Raw limiter threshold</dt><dd>' + (calculation.rawThresholdPeakVoltage === null ? 'Not configured' : calculation.rawThresholdPeakVoltage + ' V peak') +
			'</dd><dt>Threshold after visible margin</dt><dd>' + (calculation.effectiveThresholdPeakVoltage === null ? 'Not available' : calculation.effectiveThresholdPeakVoltage + ' V peak · ' + calculation.effectiveThresholdRmsVoltage + ' V RMS') +
			'</dd><dt>Limiting factor</dt><dd>' + escapeHTML(calculation.limitingFactor.replace(/-/g, ' ')) + '</dd>' +
			'<dt>Channel gain</dt><dd>' + calculation.channelGainDb + ' dB</dd><dt>Maximum positive EQ contribution</dt><dd>+' + calculation.maximumEqBoostDb + ' dB</dd>' +
			'<dt>Potential net boost</dt><dd>' + calculation.potentialNetBoostDb + ' dB</dd><dt>Maximum crossover + EQ + gain on grid</dt><dd>' + calculation.maximumElectricalGainDb + ' dB</dd>' +
			'<dt>Configured headroom estimate</dt><dd>' + (calculation.remainingConfiguredHeadroomDb === null ? 'Unresolved without amplifier maximum peak voltage' : calculation.remainingConfiguredHeadroomDb + ' dB') + '</dd></dl>' :
			'<p>Waiting for calculated electrical limits…</p>';
		var warnings = preview ? preview.warnings : [];
		var warningHTML = warnings.length ? '<ul>' + warnings.map(function(item) { return '<li>' + escapeHTML(item.message) + '</li>'; }).join('') + '</ul>' : '<p>No output-specific protection warnings.</p>';
		var simulationHTML = '<p>Run the normalized synthetic sequence to inspect the simplified limiter. No audio is generated.</p>';
		if (simulation) {
			if (!simulation.simulation.supported) simulationHTML += '<p class="signal-flow-warning">' + escapeHTML(simulation.simulation.reason) + '</p>';
			else simulationHTML += '<p><strong>Simulator estimate</strong> · threshold ' + simulation.simulation.thresholdDbfs + ' dBFS · attack ' +
				simulation.simulation.attackMs + ' ms · release ' + simulation.simulation.releaseMs + ' ms</p><ol>' + simulation.simulation.points.map(function(point) {
					return '<li>Input ' + point.inputDbfs + ' dBFS for ' + point.durationMs + ' ms · gain reduction ' + point.gainReductionDb + ' dB · output ' + point.outputDbfs + ' dBFS</li>';
				}).join('') + '</ol>';
		}
		return '<section class="signal-flow-protection" id="' + prefix + '" aria-label="Driver Protection for ' + escapeHTML(output.label) + '">' +
			'<p id="' + prefix + '-notice"><strong>Protection configuration · Simulator first.</strong> These electrical estimates do not guarantee thermal, excursion, acoustic or damage protection.</p>' +
			'<section class="signal-flow-protection-warnings" aria-label="Driver Protection warnings" aria-live="polite"><h4>Warnings</h4>' + warningHTML + '</section>' +
			'<details class="signal-flow-advanced" ' + (openProtectionOutputs[output.id] ? 'open ' : '') + 'ontoggle="this.querySelector(\'summary\').setAttribute(\'aria-expanded\', this.open ? \'true\' : \'false\'); signalFlow.setProtectionOpen(\'' + output.id + '\', this.open);"><summary aria-expanded="' + !!openProtectionOutputs[output.id] + '">Advanced</summary>' +
			'<section aria-label="Driver metadata"><h4>Driver</h4><div class="signal-flow-protection-grid">' +
			field('driver', 'manufacturer', 'Manufacturer (optional)', '', {text: true}) + field('driver', 'model', 'Model (optional)', '', {text: true}) +
			field('driver', 'nominalImpedanceOhms', 'Nominal impedance', 'Ω', {step: '0.1', min: 1, max: 64}) +
			field('driver', 'continuousPowerWatts', 'Continuous power rating', 'W', {step: '0.1', min: 0}) +
			field('driver', 'shortTermPowerWatts', 'Short-term power rating (optional)', 'W', {step: '0.1', min: 0}) +
			field('driver', 'notes', 'Notes', '', {text: true}) + '</div></section>' +
			'<section aria-label="Amplifier assumptions"><h4>Amplifier</h4><div class="signal-flow-protection-grid">' +
			field('amplifier', 'maximumRmsVoltage', 'Maximum output voltage', 'V RMS', {step: '0.1', min: 0}) +
			field('amplifier', 'maximumPeakVoltage', 'Maximum peak or clipping voltage', 'V peak', {step: '0.1', min: 0}) +
			field('amplifier', 'gainDb', 'Amplifier gain (optional)', 'dB', {step: '0.1', min: 0, max: 60}) +
			field('amplifier', 'channelAssignment', 'Channel assignment (optional)', '', {text: true}) + '</div></section>' +
			'<section aria-label="Limiter settings"><h4>Limiter settings</h4><label><input id="' + prefix + '-enabled" type="checkbox" ' + (protection.limiter.enabled ? 'checked ' : '') +
			'onchange="signalFlow.updateProtection(\'' + output.id + '\', \'limiter\', \'enabled\', this.checked, true);"> Enable peak-voltage limiter design</label><div class="signal-flow-protection-grid">' +
			field('limiter', 'thresholdPeakVoltage', 'Raw threshold', 'V peak', {step: '0.1', min: 0}) +
			field('limiter', 'configuredRmsVoltageLimit', 'Configured average limit (optional)', 'V RMS', {step: '0.1', min: 0}) +
			field('limiter', 'safetyMarginDb', 'Safety margin', 'dB', {step: '0.1', min: -12, max: 0}) +
			field('limiter', 'attackMs', 'Attack', 'ms', {step: '0.1', min: 0.1, max: 1000}) +
			field('limiter', 'releaseMs', 'Release', 'ms', {step: '1', min: 10, max: 10000}) + '</div></section>' +
			'<section class="signal-flow-protection-calculated" aria-label="Calculated electrical limits" aria-live="polite"><h4>Calculated limits</h4>' + calculationHTML +
			'<p>Sine-wave conversion only. Music, amplifier impedance interaction and real driver behavior differ.</p></section>' +
			'<section class="signal-flow-protection-simulator" aria-label="Limiter simulator summary" aria-live="polite"><h4>Simulator</h4>' + simulationHTML +
			'<button type="button" class="button pill outline" onclick="signalFlow.simulateProtection(\'' + output.id + '\');">Run synthetic level sequence</button></section>' +
			'<p><strong>Physical mapping:</strong> Unsupported and unverified. No physical Apply action is available.</p></details></section>';
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
		var featureOrder = ['routing', 'crossover', 'parametric-eq', 'gain', 'delay', 'polarity', 'driver-protection'];
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
		var overallStatus = 'Blocked · Preview not prepared';
		if (compilation && compilation.errors.length) overallStatus = 'Blocked · Preview has errors';
		else if (compilation && !stale) overallStatus = 'Simulated · Preview ready';
		if (deployment.comparison && !stale) overallStatus = 'Simulated · Readback ' + deployment.comparison.status;
		if (stale) overallStatus = 'Blocked · Preview is stale';
		if (deployment.simulator.transportStatus) overallStatus = 'Blocked · ' + deployment.simulator.transportStatus;
		if (!deployment.simulator.connected) overallStatus = 'Blocked · Simulator disconnected';
		if (deployment.simulator.identityMismatch) overallStatus = 'Blocked · Program identity changed; preview again';
		$('#signal-flow-deployment-status')
			.attr('class', 'signal-flow-status-' + (deployment.comparison ? deployment.comparison.status : compilation ? compilation.status : 'unknown'))
			.text(overallStatus + ' · Physical deployment unavailable');

		var errors = compilation ? compilation.errors : [];
		var warnings = compilation ? compilation.warnings : [];
		$('#signal-flow-deployment-issues').html(
			'<h3>Preview summary</h3>' +
			(compilation ? '<p>Design revision ' + escapeHTML(compilation.sourceDesignRevision) + ' · ' +
				compilation.operations.length + ' proposed operations · ' + errors.length + ' errors · ' + warnings.length + ' warnings</p>' :
				'<p>Save the design, then compile to inspect a proposed plan.</p>') +
			(errors.length ? '<h4>Errors</h4><ul>' + errors.map(function(item) { return '<li>' + escapeHTML(item.message) + '</li>'; }).join('') + '</ul>' : '') +
			(warnings.length ? '<h4>Warnings</h4><ul>' + warnings.map(function(item) { return '<li>' + escapeHTML(item.message) + '</li>'; }).join('') + '</ul>' : '')
		);
		var comparisonByOperation = {};
		if (deployment.comparison) deployment.comparison.items.forEach(function(item) { comparisonByOperation[item.operationIndex] = item; });
		var detailedOutputs = compilation ? compilation.outputs.map(function(output) {
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
			var protection = operations.find(function(item) { return item.group === 'simulator-protection'; });
			return '<section class="signal-flow-deployment-output" role="group" aria-label="' + escapeHTML(output.label) + ' deployment comparison">' +
				'<h3>' + escapeHTML(output.label) + '</h3><p>' + filters.length + ' configured crossover/EQ sections</p>' +
				(output.protection ? '<p><strong>Driver Protection:</strong> ' + (output.protection.enabled ? 'Configured for simulator' : 'Limiter disabled') +
					' · physical mapping ' + escapeHTML(output.protection.mappingConfidence) + ' · readback ' + escapeHTML(output.protection.readback) + '</p>' : '') +
				'<dl><dt>Field</dt><dd>Requested</dd><dd>Compiled or actual</dd><dd>Verification status</dd>' +
				row('Routing', routing) + row('Gain', gain) + row('Delay', delay) + row('Polarity', polarity) + row('Limiter simulator', protection) + '</dl></section>';
		}).join('') : '';
		$('#signal-flow-deployment-comparison-detail').html(detailedOutputs);
		$('#signal-flow-deployment-outputs').html(compilation ? compilation.outputs.map(function(output) {
			var operations = compilation.operations.filter(function(item) { return item.outputId === output.outputId; });
			var filters = operations.filter(function(item) { return item.group === 'filter-coefficients' && item.logicalField !== 'crossover.flat'; }).length;
			var routing = operations.some(function(item) { return item.group === 'routing'; });
			var levelTiming = operations.filter(function(item) { return ['gain', 'delay', 'polarity'].indexOf(item.group) !== -1; }).length;
			return '<section class="signal-flow-deployment-output-summary"><h3>' + escapeHTML(output.label) + '</h3><p>' + (routing ? 'Routing included' : 'Routing unavailable') + ' · ' + filters + ' crossover/EQ sections · ' + levelTiming + ' level/timing values' + (output.protection && output.protection.enabled ? ' · Protection simulator context included' : '') + '</p></section>';
		}).join('') : '<p>Save the design, then choose Preview deployment to see what would be applied.</p>');
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

	function filterSummary(filter, shortName) {
		if (!filter.enabled) return null;
		var family = filter.family === 'linkwitz-riley' ? 'LR' : 'Butterworth';
		return shortName + ' ' + roundDisplay(filter.cutoffHz) + ' Hz ' + family + (filter.slopeDbPerOctave / 6);
	}

	function outputSummaries(output) {
		var connection = state.draft.connections.find(function(item) { return item.destination === output.id && item.enabled; });
		var crossover = state.draft.crossover.outputs.find(function(item) { return item.outputId === output.id; });
		var filters = [filterSummary(crossover.highPass, 'HP'), filterSummary(crossover.lowPass, 'LP')].filter(Boolean);
		var processing = state.draft.channelProcessing.outputs.find(function(item) { return item.outputId === output.id; });
		var eq = state.draft.parametricEQ.outputs.find(function(item) { return item.outputId === output.id; });
		var eqCount = eq.bands.filter(function(band) { return band.enabled; }).length;
		var protection = state.draft.driverProtection.outputs.find(function(item) { return item.outputId === output.id; });
		var protectionConfigured = protection.limiter.enabled || protection.driver.continuousPowerWatts !== null || protection.amplifier.maximumPeakVoltage !== null;
		return {
			routing: (output.enabled ? roleLabels[output.role] : 'Disabled') + ' · ' + (connection ? state.capabilities.inputs.find(function(input) { return input.id === connection.source; }).name : 'No input'),
			crossover: filters.length ? filters.join(' · ') : 'No crossover set — edit filters or use Suggest setup',
			processing: processing.gain.valueDb + ' dB · ' + processing.delay.valueMs + ' ms · ' + (processing.polarity.inverted ? 'Polarity inverted' : 'Polarity normal'),
			eq: eqCount ? eqCount + ' enabled EQ band' + (eqCount === 1 ? '' : 's') : 'No EQ filters — add one or use Suggest EQ',
			protection: protectionConfigured ? 'Protection assumptions configured' : 'Protection limits are not configured'
		};
	}

	function workflowSection(output, id, title, summary, content) {
		var open = openOutputSections[output.id] === id;
		return '<section class="signal-flow-workflow-section' + (open ? ' open' : '') + '" aria-labelledby="signal-flow-section-' + id + '-' + output.id + '">' +
			'<button type="button" class="signal-flow-workflow-summary" id="signal-flow-section-' + id + '-' + output.id + '" aria-expanded="' + open + '" aria-controls="signal-flow-panel-' + id + '-' + output.id + '" onclick="signalFlow.toggleOutputSection(\'' + output.id + '\', \'' + id + '\');"><span><strong>' + title + '</strong><small>' + escapeHTML(summary) + '</small></span><span aria-hidden="true">' + (open ? '−' : '+') + '</span></button>' +
			'<div class="signal-flow-workflow-panel" id="signal-flow-panel-' + id + '-' + output.id + '" ' + (open ? '' : 'hidden ') + '>' + content + '</div></section>';
	}

	function renderDesignReview() {
		if (!state.draft) return;
		var review = signalFlowUIState.designReview(state);
		function item(title, value, action, label) {
			return '<div class="signal-flow-review-item"><div><strong>' + escapeHTML(title) + '</strong><span>' + escapeHTML(value) + '</span></div>' +
				(action ? '<button type="button" class="button pill outline" onclick="' + action + '">' + escapeHTML(label) + '</button>' : '') + '</div>';
		}
		var statusClass = review.designState === 'Error' ? ' error' : review.designState === 'Unsaved' ? ' warning' : '';
		$('#signal-flow-design-review').html('<p class="signal-flow-review-state' + statusClass + '" role="status"><strong>' + review.designState + '</strong> · ' + review.errors + ' errors · ' + review.warnings + ' warnings · Deployment ' + review.deploymentState + '</p>' +
			item('Outputs', review.configuredOutputs + '/' + review.enabledOutputs + ' configured · ' + review.routedOutputs + ' routed', "signalFlow.showWorkspace('design');", 'Open Design') +
			item('Crossover', review.crossoverOutputs + ' enabled outputs have crossover filters', "signalFlow.selectOutput('" + (selectedOutputID || 'output-a') + "', 'crossover');", 'Open Crossover') +
			item('Level & timing', review.adjustedOutputs + ' enabled outputs use non-default values', "signalFlow.selectOutput('" + (selectedOutputID || 'output-a') + "', 'processing');", 'Open Level & timing') +
			item('Parametric EQ', review.eqBands + ' enabled bands', "signalFlow.selectOutput('" + (selectedOutputID || 'output-a') + "', 'eq');", 'Open Parametric EQ') +
			item('Driver Protection', review.protectedOutputs + '/' + review.enabledOutputs + ' enabled outputs configured', "signalFlow.selectOutput('" + (selectedOutputID || 'output-a') + "', 'protection');", 'Open Driver Protection') +
			item('Measurements', review.measurements + ' available' + (review.staleMeasurements ? ' · ' + review.staleMeasurements + ' stale' : ''), "signalFlow.showWorkspace('measurements');", 'Open Measurements') +
			item('Backup & restore', 'Available in System Tools; backup does not deploy the design', "beo.showExtension('hifiberry-system-tools');", 'Open System Tools'));
	}

	function render(preferredFocusId) {
		var activeControlId = preferredFocusId || (document.activeElement && document.activeElement.id);
		if (state.loading || !state.draft) {
			$('#signal-flow-runtime-status').text('Loading routing design…');
			return;
		}
		var quickReview = signalFlowUIState.designReview(state);
		$('#signal-flow-runtime-status').text('Design: ' + quickReview.designState + ' · Deployment: Blocked · ' + quickReview.simulatorState + (state.connected ? '' : ' · Disconnected'));

		$('#signal-flow-inputs').html(state.capabilities.inputs.map(function(input) {
			return '<div class="signal-flow-input' + (input.available ? '' : ' disabled') + '" title="' + escapeHTML(input.description) + '">' +
				escapeHTML(input.name) + '</div>';
		}).join(''));

		if (!selectedOutputID || !state.draft.outputs.some(function(output) { return output.id === selectedOutputID; })) {
			var initialOutput = state.draft.outputs.find(function(output) { return output.enabled; }) || state.draft.outputs[0];
			selectedOutputID = initialOutput.id;
		}
		if (openOutputSections[selectedOutputID] === undefined) openOutputSections[selectedOutputID] = 'routing';
		$('#signal-flow-output-selector').html(state.draft.outputs.map(function(output) {
			var connection = state.draft.connections.find(function(item) {
				return item.destination === output.id && item.enabled;
			});
			return '<button type="button" role="tab" class="signal-flow-output-choice' + (output.id === selectedOutputID ? ' selected' : '') + '" id="signal-flow-output-select-' + output.id + '" aria-selected="' + (output.id === selectedOutputID) + '" aria-controls="signal-flow-output-editor" onclick="signalFlow.selectOutput(\'' + output.id + '\');"><strong>' + escapeHTML(output.dspChannel.toUpperCase() + ' · ' + output.label) + '</strong><span>' + escapeHTML((output.enabled ? roleLabels[output.role] : 'Disabled') + ' · ' + (connection ? connection.source : 'No input')) + '</span></button>';
		}).join(''));
		var selectedOutput = state.draft.outputs.find(function(output) { return output.id === selectedOutputID; });
		$('#signal-flow-outputs').html([selectedOutput].map(function(output) {
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
			var summaries = outputSummaries(output);
			var routingContent = '<div class="signal-flow-output-grid">' +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-enabled-" + output.id + "\"><input id=\"signal-flow-enabled-" + output.id + "\" type=\"checkbox\" " + (output.enabled ? "checked " : "") + "onchange=\"signalFlow.update('" + output.id + "', 'enabled', this.checked);\"> Output enabled</label></div>" +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-label-" + output.id + "\">Driver label</label><input id=\"signal-flow-label-" + output.id + "\" value=\"" + escapeHTML(output.label) + "\" onchange=\"signalFlow.update('" + output.id + "', 'label', this.value);\"></div>" +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-role-" + output.id + "\">Driver role</label><select id=\"signal-flow-role-" + output.id + "\" onchange=\"signalFlow.update('" + output.id + "', 'role', this.value);\">" + roles + "</select></div>" +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-side-" + output.id + "\">Side</label><select id=\"signal-flow-side-" + output.id + "\" onchange=\"signalFlow.update('" + output.id + "', 'side', this.value);\">" + sides + "</select></div>" +
				"<div class=\"signal-flow-field\"><label for=\"signal-flow-source-" + output.id + "\">Routed input</label><select id=\"signal-flow-source-" + output.id + "\" onchange=\"signalFlow.route('" + output.id + "', this.value);\">" + inputOptions + "</select></div>" +
				'</div>';
			var crossoverContent = '<section class="signal-flow-crossover" aria-label="Crossover for ' + escapeHTML(output.label) + '">' +
				'<h3>Crossover</h3><div class="signal-flow-crossover-grid">' +
				crossoverControls(output, crossover, 'highPass', 'High-pass') +
				crossoverControls(output, crossover, 'lowPass', 'Low-pass') + '</div>' +
				'<div class="signal-flow-crossover-actions"><button type="button" class="button pill outline" ' +
				"onclick=\"signalFlow.resetCrossover('" + output.id + "');\">Reset crossover</button>" +
				'<label for="signal-flow-copy-' + output.id + '">Copy to</label><select id="signal-flow-copy-' + output.id + '">' +
				option('', 'Choose output', '') + copyOptions + '</select><button type="button" class="button pill outline" ' +
				"onclick=\"signalFlow.copyCrossover('" + output.id + "', document.getElementById('signal-flow-copy-" + output.id + "').value);\">Copy</button></div>" +
				crossoverAssistanceControls(output) + alignmentControls(output) + '</section>';
			return '<article class="signal-flow-output" id="signal-flow-output-editor" data-output-id="' + output.id + '" role="tabpanel" aria-labelledby="signal-flow-output-select-' + output.id + '" aria-label="' + escapeHTML(output.label) + ' output channel">' +
				'<div class="signal-flow-output-header"><div><strong>' + escapeHTML(output.dspChannel.toUpperCase()) + ' · ' + escapeHTML(output.label) + '</strong><span>' + escapeHTML(summaries.routing) + '</span></div></div>' +
				workflowSection(output, 'routing', 'Output & routing', summaries.routing, routingContent) +
				workflowSection(output, 'crossover', 'Crossover', summaries.crossover, crossoverContent) +
				workflowSection(output, 'processing', 'Level & timing', summaries.processing, processingControls(output)) +
				workflowSection(output, 'eq', 'Parametric EQ', summaries.eq, parametricEQControls(output)) +
				workflowSection(output, 'protection', 'Driver Protection', summaries.protection, protectionControls(output)) + '</article>';
		}).join(''));

		var issues = state.validation.errors.concat(state.validation.warnings);
		$('#signal-flow-validation').html(issues.length ? '<ul class="signal-flow-issues">' + issues.map(function(issue) {
			return '<li class="signal-flow-' + issue.level + '">' + escapeHTML(issue.message) + '</li>';
		}).join('') + '</ul>' : '<p>No routing-model issues found.</p>');
		renderMeasurements();
		renderMeasurementMerge();
		renderDesignReview();
		showWorkspace(currentWorkspace);

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
		$('#signal-flow-measurement-empty').toggleClass('hidden', measurements.length > 0 || !!measurementPreview);
		if (selectedMeasurementId && !measurements.some(function(item) { return item.id === selectedMeasurementId; })) selectedMeasurementId = null;
		var selected = measurements.find(function(item) { return item.id === selectedMeasurementId; }) || measurements[0];
		if (selected) selectedMeasurementId = selected.id;
		$('#signal-flow-measurement-preview').html(measurementPreview ? '<p><strong>Detected ' + escapeHTML(measurementPreview.detectedFormat) + '</strong> · ' + escapeHTML(measurementPreview.confidence) + ' confidence</p><p>' + measurementPreview.recognizedColumns.map(escapeHTML).join(', ') + ' · ' + measurementPreview.summary.pointCount + ' points · ' + measurementPreview.summary.minimumFrequencyHz + '–' + measurementPreview.summary.maximumFrequencyHz + ' Hz · Phase ' + (measurementPreview.summary.phaseAvailable ? 'available' : 'not available') + '</p>' + measurementPreview.warnings.map(function(item) { return '<p class="signal-flow-warning">' + escapeHTML(item.message) + '</p>'; }).join('') + '<button type="button" class="button pill black" onclick="signalFlow.confirmMeasurementImport();">Confirm import</button>' : '');
		$('#signal-flow-measurement-list').html(measurements.length ? measurements.map(function(item) {
			return '<button type="button" role="option" aria-selected="' + (selected && item.id === selected.id) + '" class="signal-flow-measurement-item' + (selected && item.id === selected.id ? ' selected' : '') + '" onclick="signalFlow.selectMeasurement(\'' + item.id + '\');"><strong>' + escapeHTML(item.name) + '</strong><span>' + (item.sourceFormat === 'derived-merge' ? 'Derived response' : escapeHTML(item.type)) + ' · ' + item.points.length + ' points · ' + item.points[0].frequencyHz + '–' + item.points[item.points.length - 1].frequencyHz + ' Hz · Phase ' + (item.units.phase ? 'available' : 'not available') + '</span></button>';
		}).join('') : '<p>No imported measurements.</p>');
		if (!selected) { $('#signal-flow-measurement-detail').empty(); return; }
		var outputOptions = option('', 'Unassigned', selected.assignedOutputId || '') + state.draft.outputs.map(function(output) { return option(output.id, output.label + ' · ' + roleLabels[output.role], selected.assignedOutputId || ''); }).join('');
		var typeOptions = state.capabilities.measurements.types.map(function(type) { return option(type, type.replace(/-/g, ' '), selected.type); }).join('');
		var graph = measurementGraph(selected);
		var timing = selected.conditions && selected.conditions.timingReference ? selected.conditions.timingReference : {kind: 'unknown', group: null};
		var timingOptions = option('unknown', 'Unknown / unavailable', timing.kind) + option('shared', 'Shared absolute reference', timing.kind) + option('relative', 'Shared relative phase reference', timing.kind) + option('independent', 'Independent reference', timing.kind);
		var staleSources = selected.mergeRecipe ? [{id: selected.mergeRecipe.lowSourceId, hash: selected.mergeRecipe.lowSourceHash, role: 'Nearfield'}, {id: selected.mergeRecipe.highSourceId, hash: selected.mergeRecipe.highSourceHash, role: 'Farfield'}].map(function(reference) { var source = measurements.find(function(item) { return item.id === reference.id; }); return !source || !source.integrity || source.integrity.hash !== reference.hash ? reference.role + ' source ' + (source ? '“' + source.name + '” changed' : 'is missing') : null; }).filter(Boolean) : [];
		var contextualActions = selected.assignedOutputId ? '<div class="signal-flow-measurement-context-actions" aria-label="Use this measurement"><button type="button" class="button pill outline" onclick="signalFlow.useMeasurementFor(\'crossover\', \'' + selected.assignedOutputId + '\');">Use for Crossover</button><button type="button" class="button pill outline" onclick="signalFlow.useMeasurementFor(\'alignment\', \'' + selected.assignedOutputId + '\');">Use for Driver alignment</button><button type="button" class="button pill outline" onclick="signalFlow.useMeasurementFor(\'eq\', \'' + selected.assignedOutputId + '\');">Use for Parametric EQ</button></div>' : '';
		var provenance = '<details class="signal-flow-advanced" ontoggle="this.querySelector(\'summary\').setAttribute(\'aria-expanded\', this.open ? \'true\' : \'false\');"><summary aria-expanded="false">Advanced</summary><div class="signal-flow-measurement-fields"><label>Timing reference<select id="signal-flow-measurement-timing-kind" ' + (selected.sourceFormat === 'derived-merge' ? 'disabled' : '') + '>' + timingOptions + '</select></label><label>Reference group<input id="signal-flow-measurement-timing-group" value="' + escapeHTML(timing.group || '') + '" placeholder="Same capture or clock ID" ' + (selected.sourceFormat === 'derived-merge' ? 'disabled' : '') + '></label></div><p>Use the same explicit reference group only when both phase measurements share that timing basis. Unknown or independent references cannot support predicted complex summation.</p><p>Source: ' + escapeHTML(selected.sourceFilename || (selected.sourceFormat === 'derived-merge' ? 'derived from saved sources' : 'unnamed file')) + ' · ' + escapeHTML(selected.sourceFormat) + ' · Imported/generated ' + escapeHTML(selected.importedAt) + ' · Integrity ' + escapeHTML(selected.integrity.hash.slice(0, 12)) + '</p></details>';
		$('#signal-flow-measurement-detail').html('<h3>' + escapeHTML(selected.name) + '</h3>' + (selected.sourceFormat === 'derived-merge' ? '<p><strong>Derived response</strong> · Magnitude only · Source observations remain unchanged.</p>' : '') + '<div class="signal-flow-measurement-fields"><label>Name<input id="signal-flow-measurement-name" value="' + escapeHTML(selected.name) + '" ' + (selected.sourceFormat === 'derived-merge' ? 'disabled' : '') + '></label><label>Notes<textarea id="signal-flow-measurement-notes" ' + (selected.sourceFormat === 'derived-merge' ? 'disabled' : '') + '>' + escapeHTML(selected.description) + '</textarea></label><label>Measurement type<select id="signal-flow-measurement-type" ' + (selected.sourceFormat === 'derived-merge' ? 'disabled' : '') + '>' + typeOptions + '</select></label><label>Assigned output<select id="signal-flow-measurement-output">' + outputOptions + '</select></label></div>' + (selected.sourceFormat === 'derived-merge' ? '<button type="button" class="button pill black" onclick="signalFlow.editMeasurementMerge(\'' + selected.id + '\');">Edit merge recipe</button><button type="button" class="button pill outline" onclick="signalFlow.updateMeasurement();">Update assignment</button>' : '<button type="button" class="button pill black" onclick="signalFlow.updateMeasurement();">Update measurement</button>') + '<button type="button" class="button pill outline" onclick="signalFlow.confirmRemoveMeasurement();">Remove measurement</button>' + contextualActions + graph + '<p><strong>' + (selected.sourceFormat === 'derived-merge' ? 'Derived response' : 'Measured response') + '</strong> is shown separately from crossover, EQ and combined electrical processing. This is not an acoustic prediction, calibration claim or automatic correction, and it is not an anechoic claim.</p>' + provenance);
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
		beo.send({target: 'signal-flow', header: 'measurementDraft', content: {configuration: state.draft, action: 'update', measurementId: selectedMeasurementId, name: $('#signal-flow-measurement-name').val(), description: $('#signal-flow-measurement-notes').val(), type: $('#signal-flow-measurement-type').val(), outputId: $('#signal-flow-measurement-output').val() || null, timingReferenceKind: $('#signal-flow-measurement-timing-kind').val(), timingReferenceGroup: $('#signal-flow-measurement-timing-group').val(), revision: state.revision}});
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
		beo.send({target: 'signal-flow', header: 'calculateProtection', content: {configuration: state.draft, outputId: outputID}});
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
		beo.send({target: 'signal-flow', header: 'calculateProtection', content: {configuration: state.draft, outputId: outputID}});
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
		beo.send({target: 'signal-flow', header: 'calculateProtection', content: {configuration: state.draft, outputId: outputID}});
	}

	function updateProtection(outputID, section, field, value, textual) {
		var numeric = Number(value);
		var normalized = textual ? value : String(value).trim() === '' ? null : isFinite(numeric) ? numeric : value;
		if (field === 'enabled') normalized = Boolean(value);
		signalFlowUIState.editProtection(state, outputID, section, field, normalized);
		validateDraft();
		beo.send({target: 'signal-flow', header: 'calculateProtection', content: {configuration: state.draft, outputId: outputID}});
		render();
	}

	function simulateProtection(outputID) {
		beo.send({target: 'signal-flow', header: 'simulateProtection', content: {configuration: state.draft, outputId: outputID}});
	}

	function setProtectionOpen(outputID, open) { openProtectionOutputs[outputID] = open; }

	function selectEQBand(outputID, bandID) {
		signalFlowUIState.selectEQBand(state, outputID, bandID);
		render();
	}

	function openEQSuggestions(outputID) {
		openEQSuggestionOutputs[outputID] = !openEQSuggestionOutputs[outputID];
		if (openEQSuggestionOutputs[outputID]) beo.send({target: 'signal-flow', header: 'eligibleEQMeasurements', content: {configuration: state.draft, outputId: outputID}});
		render();
	}

	function selectEQMeasurement(outputID, measurementID) {
		contextualMeasurementSelections.eq[outputID] = measurementID;
		render('signal-flow-eq-suggestion-measurement-' + outputID);
	}

	function optionalNumber(id) {
		var element = document.getElementById(id);
		if (!element || String(element.value).trim() === '') return null;
		return Number(element.value);
	}

	function suggestEQ(outputID) {
		var measurement = document.getElementById('signal-flow-eq-suggestion-measurement-' + outputID);
		var target = document.getElementById('signal-flow-eq-suggestion-target-' + outputID);
		if (!measurement || !measurement.value) return;
		var minimum = optionalNumber('signal-flow-eq-suggestion-min-' + outputID);
		var maximum = optionalNumber('signal-flow-eq-suggestion-max-' + outputID);
		var options = {
			target: target.value,
			tiltDbPerOctave: target.value === 'flat' ? 0 : optionalNumber('signal-flow-eq-suggestion-tilt-' + outputID),
			referenceLevelDb: optionalNumber('signal-flow-eq-suggestion-reference-' + outputID),
			minimumFrequencyHz: minimum,
			maximumFrequencyHz: maximum,
			smoothing: document.getElementById('signal-flow-eq-suggestion-smoothing-' + outputID).value,
			filterLimit: Number(document.getElementById('signal-flow-eq-suggestion-limit-' + outputID).value),
			boostLimitDb: Number(document.getElementById('signal-flow-eq-suggestion-boost-' + outputID).value),
			considerExistingEQ: document.getElementById('signal-flow-eq-suggestion-existing-' + outputID).checked
		};
		eqSuggestionDraftOptions[outputID] = JSON.parse(JSON.stringify(options));
		beo.send({target: 'signal-flow', header: 'suggestEQ', content: {
			configuration: state.draft, outputId: outputID, measurementId: measurement.value,
			options: options
		}});
	}

	function toggleEQSuggestion(outputID, suggestionID, selected) {
		signalFlowUIState.toggleEQSuggestion(state, outputID, suggestionID, selected);
		render();
	}

	function acceptEQSuggestions(outputID) {
		var analysis = state.eqSuggestions[outputID];
		var selected = state.selectedEQSuggestions[outputID] || [];
		if (!analysis || !selected.length || !state.connected) return;
		beo.send({target: 'signal-flow', header: 'acceptEQSuggestions', content: {configuration: state.draft, outputId: outputID,
			analysisId: analysis.analysisId, selectedSuggestionIds: selected, revision: state.revision}});
	}

	function rejectEQSuggestions(outputID) {
		signalFlowUIState.rejectEQSuggestions(state, outputID);
		render();
	}

	function undoEQSuggestions(outputID) {
		signalFlowUIState.undoEQSuggestionAcceptance(state, outputID);
		validateDraft();
		requestPreview(outputID);
		render();
	}

	function openCrossoverAssistance(outputID) {
		openCrossoverAssistanceOutputs[outputID] = !openCrossoverAssistanceOutputs[outputID];
		if (openCrossoverAssistanceOutputs[outputID]) beo.send({target: 'signal-flow', header: 'eligibleCrossoverMeasurements', content: {configuration: state.draft, outputId: outputID}});
		render();
	}

	function suggestCrossover(outputID) {
		var sourceA = document.getElementById('signal-flow-crossover-source-a-' + outputID);
		var sourceB = document.getElementById('signal-flow-crossover-source-b-' + outputID);
		if (!sourceA || !sourceB || !sourceA.value || !sourceB.value) return;
		beo.send({target: 'signal-flow', header: 'suggestCrossover', content: {configuration: state.draft, measurementAId: sourceA.value, measurementBId: sourceB.value}});
	}

	function selectCrossoverSuggestion(outputID, suggestionID) {
		signalFlowUIState.selectCrossoverSuggestion(state, outputID, suggestionID);
		render();
	}

	function acceptCrossoverSuggestion(outputID) {
		var analysis = state.crossoverAssistanceAnalyses[outputID], suggestionID = state.selectedCrossoverSuggestions[outputID];
		if (!analysis || !suggestionID || !state.connected) return;
		beo.send({target: 'signal-flow', header: 'acceptCrossoverSuggestion', content: {configuration: state.draft, analysisId: analysis.analysisId, suggestionId: suggestionID, revision: state.revision}});
	}

	function rejectCrossoverSuggestions(outputID) {
		signalFlowUIState.rejectCrossoverSuggestions(state, outputID);
		render();
	}

	function undoCrossoverSuggestion(outputID) {
		signalFlowUIState.undoCrossoverSuggestion(state, outputID);
		validateDraft();
		state.draft.outputs.forEach(function(item) { requestPreview(item.id); });
		render();
	}

	function openAlignment(outputID) {
		openAlignmentOutputs[outputID] = !openAlignmentOutputs[outputID];
		if (openAlignmentOutputs[outputID]) beo.send({target: 'signal-flow', header: 'eligibleAlignments', content: {configuration: state.draft, outputId: outputID}});
		render();
	}

	function analyseAlignment(outputID) {
		var sourceA = document.getElementById('signal-flow-alignment-source-a-' + outputID);
		var sourceB = document.getElementById('signal-flow-alignment-source-b-' + outputID);
		if (!sourceA || !sourceB || !sourceA.value || !sourceB.value) return;
		var minimum = optionalNumber('signal-flow-alignment-min-' + outputID);
		var maximum = optionalNumber('signal-flow-alignment-max-' + outputID);
		var options = {};
		if (minimum !== null) options.minimumFrequencyHz = minimum;
		if (maximum !== null) options.maximumFrequencyHz = maximum;
		alignmentDraftOptions[outputID] = {minimumFrequencyHz: minimum, maximumFrequencyHz: maximum};
		beo.send({target: 'signal-flow', header: 'analyseAlignment', content: {configuration: state.draft, measurementAId: sourceA.value, measurementBId: sourceB.value, options: options}});
	}

	function acceptAlignment(outputID) {
		var analysis = state.alignmentAnalyses[outputID];
		if (!analysis || !state.connected) return;
		beo.send({target: 'signal-flow', header: 'acceptAlignment', content: {configuration: state.draft, analysisId: analysis.analysisId, revision: state.revision}});
	}

	function rejectAlignment(outputID) {
		signalFlowUIState.rejectAlignment(state, outputID);
		render();
	}

	function undoAlignment(outputID) {
		signalFlowUIState.undoAlignment(state, outputID);
		validateDraft();
		requestPreview(outputID);
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
		updateProtection: updateProtection,
		simulateProtection: simulateProtection,
		setProtectionOpen: setProtectionOpen,
		selectEQBand: selectEQBand,
		openEQSuggestions: openEQSuggestions,
		selectEQMeasurement: selectEQMeasurement,
		suggestEQ: suggestEQ,
		toggleEQSuggestion: toggleEQSuggestion,
		acceptEQSuggestions: acceptEQSuggestions,
		rejectEQSuggestions: rejectEQSuggestions,
		undoEQSuggestions: undoEQSuggestions,
		openCrossoverAssistance: openCrossoverAssistance,
		suggestCrossover: suggestCrossover,
		selectCrossoverSuggestion: selectCrossoverSuggestion,
		acceptCrossoverSuggestion: acceptCrossoverSuggestion,
		rejectCrossoverSuggestions: rejectCrossoverSuggestions,
		undoCrossoverSuggestion: undoCrossoverSuggestion,
		openAlignment: openAlignment,
		analyseAlignment: analyseAlignment,
		acceptAlignment: acceptAlignment,
		rejectAlignment: rejectAlignment,
		undoAlignment: undoAlignment,
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
		showWorkspace: showWorkspace,
		selectOutput: selectOutput,
		toggleOutputSection: toggleOutputSection,
		useMeasurementFor: useMeasurementFor,
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
