#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var evidence = require('../Beocreate2/beo-extensions/signal-flow/beocreate-readonly-evidence');

function fail(message) {
	console.error('Read-only capture refused: ' + message);
	process.exitCode = 1;
}

function parse(argv) {
	var options = {dryRun: false, acknowledgeReadonly: false, timeoutMs: 2000};
	for (var index = 0; index < argv.length; index++) {
		var argument = argv[index];
		if (argument === '--dry-run') options.dryRun = true;
		else if (argument === '--acknowledge-read-only') options.acknowledgeReadonly = true;
		else if (argument === '--host') options.host = argv[++index];
		else if (argument === '--port') options.port = Number(argv[++index]);
		else if (argument === '--output') options.output = argv[++index];
		else if (argument === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
		else throw new Error('Unknown argument "' + argument + '".');
	}
	return options;
}

function planText() {
	var operations = evidence.plannedOperations();
	return [
		'SpeakerLab current-Beocreate read-only capture plan',
		'No discovery, writes, mute commands, service control, DSP reset, EEPROM or flash access.',
		'Planned read operations (' + operations.length + ', each repeated twice at a conservative sequential rate):'
	].concat(operations.map(function(operation) {
		var target = operation.kind === 'parameter' ? ' address=' + operation.address + ' bytes=' + operation.length : '';
		return '- ' + operation.id + ': ' + operation.command + ' (0x' + operation.commandCode.toString(16) + ')' + target;
	})).concat([
		'Expected transcript: read frames sent=' + (operations.length * 2) + '; write frames sent=0; unknown frames sent=0.'
	]).join('\n');
}

async function main() {
	var options;
	try { options = parse(process.argv.slice(2)); }
	catch (error) { fail(error.message); return; }
	console.log(planText());
	if (options.dryRun) return;
	if (!options.acknowledgeReadonly) { fail('pass --acknowledge-read-only after reviewing the dry-run plan.'); return; }
	if (!options.host) { fail('an explicit --host is required; network discovery is not supported.'); return; }
	if (!options.output) { fail('an explicit --output directory is required.'); return; }
	var port = options.port === undefined ? 8086 : options.port;
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		fail('port must be an integer from 1 to 65535.'); return;
	}
	if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 10000) {
		fail('timeout must be from 100 to 10000 milliseconds.'); return;
	}
	var output = path.resolve(options.output);
	var outputExisted = fs.existsSync(output);
	if (outputExisted) {
		if (!fs.statSync(output).isDirectory()) { fail('output path exists and is not a directory.'); return; }
		if (fs.readdirSync(output).length) {
			fail('output directory already contains files; refusing to overwrite unexpected content.'); return;
		}
	}
	fs.mkdirSync(output, {recursive: true});
	var commit = childProcess.execFileSync('git', ['rev-parse', 'HEAD'], {
		cwd: path.resolve(__dirname, '..'), encoding: 'utf8'
	}).trim();
	try {
		var capture = await evidence.runCapture({
			host: options.host,
			port: port,
			timeoutMs: options.timeoutMs,
			acknowledgeReadonly: true,
			operations: evidence.plannedOperations(),
			commit: commit,
			timestamp: new Date().toISOString(),
			sourceType: 'compatible-hardware-readonly',
			declaredPlatform: 'existing Beocreate'
		});
		fs.writeFileSync(path.join(output, 'capture.json'), JSON.stringify(capture, null, 2) + '\n', {flag: 'wx', mode: 0o600});
		console.log('Capture complete: read frames sent=' + capture.transcript.readFramesSent +
			'; responses received=' + capture.transcript.responsesReceived +
			'; write frames sent=0; unknown frames sent=0.');
	} catch (error) {
		try { if (!outputExisted && !fs.readdirSync(output).length) fs.rmdirSync(output); } catch (_) {}
		fail((error.code ? error.code + ': ' : '') + error.message);
	}
}

main();
