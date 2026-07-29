'use strict';

var EVIDENCE = {
	metadata: 'Beocreate2/beo-dsp-programs/beocreate-universal-10.xml',
	channels: 'Beocreate2/beo-extensions/channels/index.js',
	equaliser: 'Beocreate2/beo-extensions/equaliser/index.js',
	transport: 'beocreate_essentials/dsp.js',
	mute: 'Beocreate2/beo-extensions/dsp-programs/index.js'
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function matrix(outputs) {
	var rows = [];
	Object.keys(outputs).forEach(function(outputId) {
		var mapping = outputs[outputId];
		[
			['routing', mapping.routing, 'unsigned integer selector', EVIDENCE.metadata + '; ' + EVIDENCE.channels, 'audio-routing'],
			['crossover', mapping.filters + '/80 words', '16 × [b2,b1,b0,-a2,-a1], signed 5.23', EVIDENCE.metadata + '; ' + EVIDENCE.equaliser, 'driver-protection'],
			['gain', mapping.gain, 'linear signed 5.23, verified legacy range 0..1', EVIDENCE.metadata + '; ' + EVIDENCE.channels, 'audio-gain'],
			['delay', mapping.delay, 'whole samples, 0..2000 at 48 kHz', EVIDENCE.metadata + '; ' + EVIDENCE.channels, 'audio-delay'],
			['polarity', mapping.polarity, 'integer 0 normal / 1 inverted', EVIDENCE.metadata + '; ' + EVIDENCE.channels, 'audio-polarity']
		].forEach(function(item) {
			rows.push({
				outputId: outputId,
				field: item[0],
				target: item[1],
				representation: item[2],
				evidence: item[3],
				confidence: 'strongly-evidenced',
				writable: 'current-code-generates-write',
				readable: 'generic-read-api-only',
				verifiable: false,
				safetyClassification: item[4],
				blocker: 'No physical capture or hardware readback proves target application and verification.'
			});
		});
	});
	rows.push({
		outputId: 'system',
		field: 'safe-state',
		target: 'GPIO 27 amplifier mute',
		representation: 'pigs command; no state readback',
		evidence: EVIDENCE.mute,
		confidence: 'strongly-evidenced',
		writable: 'current-code-executes-command',
		readable: 'unknown',
		verifiable: false,
		safetyClassification: 'critical',
		blocker: 'Mute command success and physical amplifier state cannot be confirmed.'
	});
	return rows;
}

function recoveryPrerequisites() {
	return [
		{stage: 'before-first-write', unknownState: false, rollback: 'not-needed', remainMuted: true, manualIntervention: false},
		{stage: 'after-safe-state', unknownState: true, rollback: 'requires verified prior plan', remainMuted: true, manualIntervention: true},
		{stage: 'routing', unknownState: true, rollback: 'not currently possible', remainMuted: true, manualIntervention: true},
		{stage: 'filters', unknownState: true, rollback: 'not currently possible', remainMuted: true, manualIntervention: true},
		{stage: 'gain-delay-polarity', unknownState: true, rollback: 'not currently possible', remainMuted: true, manualIntervention: true},
		{stage: 'readback-mismatch', unknownState: true, rollback: 'requires verified prior plan', remainMuted: true, manualIntervention: true},
		{stage: 'connection-loss-or-restart', unknownState: true, rollback: 'must not auto-resume', remainMuted: true, manualIntervention: true},
		{stage: 'identity-mismatch', unknownState: true, rollback: 'prohibited until identity trusted', remainMuted: true, manualIntervention: true},
		{stage: 'mute-unconfirmed', unknownState: true, rollback: 'physical writes prohibited', remainMuted: true, manualIntervention: true},
		{stage: 'rollback-failure', unknownState: true, rollback: 'failed', remainMuted: true, manualIntervention: true}
	];
}

function report(outputs, overrides) {
	overrides = overrides || {};
	var rows = matrix(outputs);
	if (overrides.unknownField) {
		rows.filter(function(row) { return row.field === overrides.unknownField; }).forEach(function(row) {
			row.confidence = 'unknown';
			row.verifiable = false;
			row.blocker = 'Mapping evidence is unavailable.';
		});
	}
	if (overrides.unreadableField) {
		rows.filter(function(row) { return row.field === overrides.unreadableField; }).forEach(function(row) {
			row.readable = 'unavailable';
			row.verifiable = false;
			row.blocker = 'Readback unavailable for this field.';
		});
	}
	var blockers = [
		'Physical DSP application/readback has not been captured.',
		'GPIO 27 mute state cannot be read back or confirmed.',
		'Legacy parameter reads have no timeout and ambiguous late-response handling.',
		'Legacy writes have no DSP acknowledgement.',
		'Reconnect does not invalidate pending reads or recheck identity for deployment.',
		'No verified last-known-good physical plan or rollback exists.'
	];
	rows.filter(function(row) { return row.confidence === 'unknown' || row.readable === 'unavailable'; }).forEach(function(row) {
		blockers.push(row.outputId + ' ' + row.field + ': ' + row.blocker);
	});
	return {
		format: 'org.speakerlab.current-beocreate-physical-readiness',
		version: 1,
		physicalApplyReady: false,
		status: 'physical-apply-blocked',
		matrix: rows,
		transport: {
			framing: {status: 'verified-current-code', physicalEvidence: false},
			write: {status: 'transport-only', acknowledgement: 'none', applied: false},
			readback: {status: overrides.unreadableField ? 'partly-unavailable' : 'strongly-evidenced-only', verified: false},
			correlation: {status: 'positional-single-outstanding', requestIDs: false},
			timeout: {parameterReadMs: null, frameCompletionMs: null, xmlMs: 10000, checksumOwnerMs: 5000},
			reconnect: {delayMs: 2000, maximumAttempts: 10, backoff: false, pendingInvalidation: false, identityRecheckForDeployment: false}
		},
		safeState: {
			status: 'unverified',
			mechanism: 'GPIO 27 amplifier mute',
			commandEvidence: 'strongly-evidenced',
			readback: 'unavailable',
			restorePriorState: 'unknown'
		},
		recovery: {
			status: 'prerequisites-defined-not-implemented',
			automaticRollback: false,
			unknownStateRequiresMute: true,
			manualInterventionMayBeRequired: true,
			scenarios: recoveryPrerequisites()
		},
		blockers: blockers
	};
}

function classifyOperations(compilation, readiness) {
	var byField = {};
	readiness.matrix.forEach(function(row) { byField[row.outputId + ':' + row.field] = row; });
	return compilation.operations.map(function(operation) {
		var field = operation.group === 'filter-coefficients' ? 'crossover' : operation.group;
		if (operation.group === 'enter-safe-state' || operation.group === 'leave-safe-state') field = 'safe-state';
		var row = byField[(operation.outputId || 'system') + ':' + field];
		return {
			operationIndex: operation.index,
			outputId: operation.outputId,
			field: field,
			confidence: row ? row.confidence : 'unknown',
			writable: row ? row.writable : 'unknown',
			readable: row ? row.readable : 'unknown',
			verifiable: !!(row && row.verifiable),
			blocker: row ? row.blocker : 'No mapping classification exists.'
		};
	});
}

module.exports = {
	EVIDENCE: clone(EVIDENCE),
	matrix: matrix,
	recoveryPrerequisites: recoveryPrerequisites,
	report: report,
	classifyOperations: classifyOperations
};
