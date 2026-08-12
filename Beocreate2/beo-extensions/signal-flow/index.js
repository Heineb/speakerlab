/*Copyright 2018 Bang & Olufsen A/S
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

'use strict';

var localSimulation = !!(beo.localDevelopment && beo.localDevelopment.dspTransport === 'simulated');
var activeProgramIdentity = null;
var planSimulator = localSimulation ? require('./dsp-plan-simulator').createSimulator({
	connected: beo.localDevelopment.dspState === 'connected'
}) : null;
var routingService = require('./routing-service').createService({
	dataDirectory: beo.dataDirectory,
	settingsCoordinator: beo.settingsCoordinator,
	planSimulator: planSimulator
});
var controller = require('./routing-controller').createController({
	service: routingService,
	send: function(header, content) {
		beo.sendToUI('signal-flow', {header: header, content: content});
	},
	runtime: function() {
		return {
			simulated: localSimulation,
			connected: localSimulation ? beo.localDevelopment.dspState === 'connected' :
				!!(activeProgramIdentity && activeProgramIdentity.metadataAvailable !== false),
			programIdentity: activeProgramIdentity
		};
	}
});

function metadataValue(metadata, key) {
	return metadata && metadata[key] && metadata[key].value ? metadata[key].value[0] : undefined;
}

beo.bus.on('dsp', function(event) {
	if (event.header === 'metadata') {
		if (event.content && event.content.metadata) {
			activeProgramIdentity = {
				programID: metadataValue(event.content.metadata, 'programID'),
				profileVersion: metadataValue(event.content.metadata, 'profileVersion'),
				checksum: metadataValue(event.content.metadata, 'checksum'),
				metadataAvailable: true
			};
		} else {
			activeProgramIdentity = {metadataAvailable: false};
		}
	}
});

beo.bus.on('general', function(event) {
	if (event.header === 'activatedExtension' && event.content.extension === 'signal-flow') {
		controller.sendState();
	}
});

beo.bus.on('signal-flow', function(event) {
	controller.handle(event);
});

module.exports = {
	version: require('./package.json').version,
	getRoutingState: function() { return routingService.state({simulated: false, connected: false}); }
};
