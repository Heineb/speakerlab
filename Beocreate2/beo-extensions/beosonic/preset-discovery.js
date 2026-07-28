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

var fs = require('fs');
var path = require('path');

function readPresetFromFile(presetPath, systemPreset, state, debug, logger) {
	var presetFileName = path.basename(presetPath, path.extname(presetPath));
	var preset;
	var presetName;
	var readOnly;
	var adjustments;
	var adjustment;
	logger = logger || console;

	try {
		preset = JSON.parse(fs.readFileSync(presetPath, "utf8"));

		presetName = null;
		if (preset['beosonic'] != undefined && preset['beosonic'].presetName) {
			presetName = preset['beosonic'].presetName;
		}

		readOnly = (systemPreset) ? true : false;

		if (presetName != null) {
			adjustments = [];
			for (adjustment in preset) {
				adjustments.push(adjustment);
			}
			state.compactPresetList[presetFileName] = {presetName: presetName, readOnly: readOnly, adjustments: adjustments};
			state.fullPresetList[presetFileName] = preset;
			if (state.settings.presetOrder.indexOf(presetFileName) == -1) {
				state.settings.presetOrder.push(presetFileName);
				state.saveSettings("beosonic", state.settings);
			}
			return presetFileName;
		} else {
			if (debug) logger.log("Beosonic: preset '"+presetFileName+"' did not include a preset name. Skipping.");
			return null;
		}
	} catch (error) {
		if (debug) logger.error("Beosonic: error loading preset '"+presetFileName+"' from '"+presetPath+"':", error);
		return null;
	}
}

function discoverPresets(systemPresetDirectory, presetDirectory, state, debug, logger) {
	var presetFiles;
	var presetRemoved = false;
	var i;
	var o;

	presetFiles = fs.readdirSync(systemPresetDirectory);
	for (i = 0; i < presetFiles.length; i++) {
		readPresetFromFile(systemPresetDirectory+"/"+presetFiles[i], true, state, debug, logger);
	}

	presetFiles = fs.readdirSync(presetDirectory);
	for (i = 0; i < presetFiles.length; i++) {
		readPresetFromFile(presetDirectory+"/"+presetFiles[i], false, state, debug, logger);
	}

	for (o in state.settings.presetOrder) {
		if (!state.compactPresetList[state.settings.presetOrder[o]]) {
			delete state.settings.presetOrder[o];
			presetRemoved = true;
		}
	}
	if (presetRemoved) {
		state.settings.presetOrder = state.settings.presetOrder.filter(function (el) {
			return el != null;
		});
		state.saveSettings("beosonic", state.settings);
	}

	return state;
}

module.exports = {
	readPresetFromFile: readPresetFromFile,
	discoverPresets: discoverPresets
};
