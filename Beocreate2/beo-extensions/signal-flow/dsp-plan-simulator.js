'use strict';

function createSimulator(options) {
	options = options || {};
	var connected = options.connected !== false;
	var applied = null;
	var values = {};
	var muted = true;
	var mismatch = null;
	var failAt = null;
	var delayAt = null;
	var disconnectAt = null;
	var transportOutcome = null;
	var readinessScenario = null;
	var identityMismatch = false;

	function apply(compilation) {
		if (!connected) return {status: 'unknown', applied: false, error: {code: 'SIMULATOR_DISCONNECTED', message: 'The simulator is disconnected.'}};
		if (!compilation || compilation.status !== 'prepared' || compilation.errors.length) return {status: 'unsupported', applied: false, error: {code: 'COMPILATION_BLOCKED', message: 'Only a valid prepared plan can be applied to the simulator.'}};
		values = {};
		muted = true;
		for (var index = 0; index < compilation.operations.length; index++) {
			var operation = compilation.operations[index];
			if (operation.deferredUntilVerified) continue;
			if (delayAt === index) {
				applied = {compilation: compilation, partial: true, delayedAt: index};
				return {status: 'delayed', applied: false, partial: true, delayedAt: index, muted: true,
					error: {code: 'SIMULATED_OPERATION_DELAYED', message: 'The selected simulated operation is delayed.'}};
			}
			if (disconnectAt === index) {
				connected = false;
				applied = {compilation: compilation, partial: true, disconnectedAt: index};
				return {status: 'unknown', applied: false, partial: true, disconnectedAt: index, muted: true,
					error: {code: 'SIMULATOR_DISCONNECTED', message: 'The simulator disconnected during application.'}};
			}
			if (failAt === index) {
				applied = {compilation: compilation, partial: true, failedAt: index};
				return {status: 'different', applied: false, partial: true, failedAt: index, muted: true};
			}
			if (operation.encodedValue) values[String(index)] = JSON.parse(JSON.stringify(operation.expectedReadback));
		}
		applied = {compilation: compilation, partial: false};
		return {status: 'simulated', applied: true, muted: true, operationCount: compilation.operations.length};
	}

	function readback() {
		if (!connected) return {available: false, status: 'unavailable', values: {}};
		if (!applied) return {available: true, status: 'not-checked', values: {}};
		if (transportOutcome) return {available: false, status: transportOutcome, values: {}, muted: true};
		var result = JSON.parse(JSON.stringify(values));
		if (mismatch && result[String(mismatch.operationIndex)] !== undefined) {
			if (Array.isArray(result[String(mismatch.operationIndex)])) result[String(mismatch.operationIndex)][0] += mismatch.delta;
			else result[String(mismatch.operationIndex)] += mismatch.delta;
		}
		return {available: true, status: applied.partial ? 'partial' : 'read-back', values: result, muted: muted};
	}

	function verify(compilation, currentRevision, compiler) {
		var comparison = compiler.compare(compilation, readback(), currentRevision);
		if (comparison.status === 'matched') muted = false;
		return Object.assign(comparison, {simulated: true, muted: muted});
	}

	return {
		apply: apply,
		readback: readback,
		verify: verify,
		clear: function() { applied = null; values = {}; mismatch = null; failAt = null; delayAt = null; disconnectAt = null;
			transportOutcome = null; readinessScenario = null; identityMismatch = false; muted = true; return {status: 'cleared', muted: true}; },
		setConnected: function(value) { connected = Boolean(value); },
		setScenario: function(scenario) {
			mismatch = scenario && scenario.type === 'mismatch' ? {operationIndex: scenario.operationIndex, delta: scenario.delta || 1} : null;
			failAt = scenario && scenario.type === 'failure' ? scenario.operationIndex : null;
			delayAt = scenario && scenario.type === 'delay' ? scenario.operationIndex : null;
			disconnectAt = scenario && scenario.type === 'disconnect' ? scenario.operationIndex : null;
			transportOutcome = scenario && ['timeout', 'malformed-response', 'stale-response', 'readback-unavailable'].indexOf(scenario.type) !== -1 ? scenario.type : null;
			readinessScenario = scenario && ['unknown-mapping', 'readback-unavailable'].indexOf(scenario.type) !== -1 ? scenario.type : null;
			identityMismatch = !!(scenario && scenario.type === 'identity-mismatch');
		},
		state: function() {
			var result = {connected: connected, hasAppliedPlan: !!applied, partial: !!(applied && applied.partial), muted: muted};
			if (transportOutcome) result.transportStatus = transportOutcome;
			if (readinessScenario) result.readinessScenario = readinessScenario;
			if (identityMismatch) result.identityMismatch = true;
			return result;
		}
	};
}

module.exports = {createSimulator: createSimulator};
