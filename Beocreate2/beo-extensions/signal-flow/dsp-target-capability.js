'use strict';

var FORMAT = 'org.speakerlab.current-beocreate-dsp-capability';
var VERSION = 1;
var PROGRAM = {
	id: 'beocreate-universal',
	name: 'Beocreate Universal',
	profileVersion: 10,
	checksum: '40FB6C92F57ABB70177CE053C73F54DC',
	modelID: 'beocreate-4ca-mk1',
	sampleRateHz: 48000
};
var OUTPUTS = {
	'output-a': {channel: 'a', routing: 4860, polarity: 4866, filters: 691, gain: 781, delay: 786},
	'output-b': {channel: 'b', routing: 4861, polarity: 4865, filters: 611, gain: 778, delay: 785},
	'output-c': {channel: 'c', routing: 4862, polarity: 4864, filters: 531, gain: 775, delay: 784},
	'output-d': {channel: 'd', routing: 4859, polarity: 4863, filters: 451, gain: 772, delay: 783}
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function capability() {
	return {
		format: FORMAT,
		version: VERSION,
		identity: clone(PROGRAM),
		outputCount: 4,
		outputs: clone(OUTPUTS),
		routing: {sources: {left: 0, right: 1, mono: 2}, encoding: 'unsigned-integer-parameter'},
		crossover: {
			sectionsPerOutput: 16,
			wordsPerSection: 5,
			wordOrder: ['b2', 'b1', 'b0', '-a2', '-a1'],
			encoding: 'signed-5.23-fixed-point',
			readback: 'raw-coefficients'
		},
		gain: {minimumDb: -60, maximumVerifiedDb: 0, encoding: 'signed-5.23-fixed-point'},
		delay: {minimumSamples: 0, maximumSamples: 2000, encoding: 'unsigned-integer-parameter'},
		polarity: {normal: 0, inverted: 1, encoding: 'unsigned-integer-parameter'},
		safeState: {
			mechanism: 'GPIO 27 amplifier mute',
			enterBeforeChange: true,
			leaveOnlyAfterCompleteReadbackMatch: true,
			dspMuteRegisterVerified: false
		}
	};
}

function identify(candidate) {
	candidate = candidate || {};
	if (candidate.metadataAvailable === false) return {status: 'metadata-unavailable', compatible: false, reason: 'DSP metadata is unavailable.'};
	if (!candidate.programID && !candidate.checksum) return {status: 'unknown', compatible: false, reason: 'DSP program identity is unknown.'};
	if (candidate.programID && candidate.programID !== PROGRAM.id) {
		return {status: 'known-incompatible', compatible: false, reason: 'DSP program identifier is not compatible.'};
	}
	if (candidate.checksum && candidate.checksum !== PROGRAM.checksum) {
		return {status: 'known-incompatible', compatible: false, reason: 'DSP program checksum is not compatible.'};
	}
	if (candidate.profileVersion !== undefined && Number(candidate.profileVersion) !== PROGRAM.profileVersion) {
		return {status: 'known-incompatible', compatible: false, reason: 'DSP profile version is not compatible.'};
	}
	return {
		status: 'known-compatible',
		compatible: true,
		reason: 'Program ID, profile version and checksum match the repository-shipped current Beocreate program.',
		program: clone(PROGRAM)
	};
}

module.exports = {
	FORMAT: FORMAT,
	VERSION: VERSION,
	PROGRAM: PROGRAM,
	OUTPUTS: OUTPUTS,
	capability: capability,
	identify: identify
};
