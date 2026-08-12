'use strict';

var evidence = require('./beocreate-readonly-evidence');
var capability = require('./dsp-target-capability');

var PRIVATE_PATTERNS = [
	/\b(?:\d{1,3}\.){3}\d{1,3}\b/,
	/\b(?:password|passphrase|credential|secret|private[-_ ]?key|wifi|ssid)\b/i,
	/\/(?:Users|home|etc)\//
];

function review(capture) {
	var issues = [];
	var conclusions = [];
	var physical = capture && capture.sourceType === 'compatible-hardware-readonly';
	if (!capture || capture.format !== evidence.FORMAT) issues.push('Unsupported capture format.');
	if (!capture || capture.schemaVersion !== evidence.SCHEMA_VERSION) issues.push('Unsupported capture schema.');
	if (!capture || !capture.integrity || !capture.integrity.observationsSha256) issues.push('Missing integrity hash.');
	if (!capture || !capture.transcript || capture.transcript.writeFramesSent !== 0 || capture.transcript.unknownFramesSent !== 0) {
		issues.push('Capture does not prove zero write and unknown frames.');
	}
	var privacyCheck = JSON.parse(JSON.stringify(capture || {}));
	delete privacyCheck.redaction;
	var serialized = JSON.stringify(privacyCheck);
	PRIVATE_PATTERNS.forEach(function(pattern) {
		if (pattern.test(serialized)) issues.push('Capture contains prohibited private or host-specific data.');
	});
	var checksum = capture && capture.decodedObservations && capture.decodedObservations.filter(function(item) {
		return item.operationId === 'program-checksum';
	})[0];
	var checksumValue = checksum && checksum.decoded && checksum.decoded.checksum;
	if (!checksumValue) issues.push('Program identity is missing.');
	else if (checksumValue !== capability.PROGRAM.checksum) issues.push('Program identity does not match the current-Beocreate mapping.');
	var operationIds = {};
	(capture && capture.outgoingReadFrames || []).forEach(function(frame) {
		if (frame.command !== 'parameter-read' && frame.command !== 'checksum-read') issues.push('Non-read operation is present.');
		operationIds[frame.operationId] = (operationIds[frame.operationId] || 0) + 1;
		if (operationIds[frame.operationId] > 2) issues.push('Operation exceeds the two-read repeat limit: ' + frame.operationId + '.');
	});
	if (physical) Object.keys(operationIds).forEach(function(id) {
		if (operationIds[id] !== 2) issues.push('Physical observation is not repeated exactly twice: ' + id + '.');
	});
	var decodedById = {};
	(capture && capture.decodedObservations || []).forEach(function(item) {
		var value = JSON.stringify(item.decoded);
		if (decodedById[item.operationId] && decodedById[item.operationId] !== value) {
			issues.push('Repeated observations contradict for ' + item.operationId + '.');
		}
		decodedById[item.operationId] = value;
	});
	(capture && capture.rawResponses || []).forEach(function(response) {
		if (evidence.sha256(Buffer.from(response.responseHex || '', 'hex')) !== response.responseSha256) {
			issues.push('Corrupt response integrity hash for ' + response.operationId + '.');
		}
	});
	if (capture && capture.transcript &&
		(capture.transcript.readFramesSent !== capture.transcript.responsesReceived ||
			capture.transcript.responsesReceived !== (capture.rawResponses || []).length ||
			capture.transcript.responsesReceived !== (capture.decodedObservations || []).length)) {
		issues.push('Capture is incomplete or transcript counts do not match observations.');
	}
	if (capture && capture.integrity) {
		var payload = {
			outgoingReadFrames: capture.outgoingReadFrames,
			rawResponses: capture.rawResponses,
			decodedObservations: capture.decodedObservations
		};
		if (evidence.sha256(Buffer.from(JSON.stringify(payload))) !== capture.integrity.observationsSha256) {
			issues.push('Capture observations integrity hash is corrupt.');
		}
	}
	if (!physical) conclusions.push('Repository-backed evidence validates the capture contract but does not physically verify mappings.');
	conclusions.push('GPIO mute/safe-state control remains unverified because no proven read command exists.');
	conclusions.push('Write acknowledgement and rollback remain unverified because this evidence path is read-only.');
	if (physical) conclusions.push('Per-field semantic corroboration, units and tolerances require explicit human review before any mapping promotion.');
	return {
		format: 'org.speakerlab.beocreate-evidence-review',
		version: 1,
		status: issues.length ? 'rejected' : (physical ? 'review-required' : 'accepted-repository-evidence'),
		issues: issues,
		conclusions: conclusions,
		promotions: [],
		physicalApplyReady: false
	};
}

module.exports = {review: review};
