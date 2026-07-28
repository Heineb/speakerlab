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

function readPresetFromFile(presetPath, systemPreset, debug, logger) {
	var presetFileName = path.basename(presetPath, path.extname(presetPath));
	var preset;
	var presetName;
	var readOnly;
	var presetCompact;
	logger = logger || console;

	try {
		preset = JSON.parse(fs.readFileSync(presetPath, "utf8"));

		presetName = null;
		if (preset['product-information'] != undefined && preset['product-information'].modelName) {
			presetName = preset['product-information'].modelName;
		}
		if (preset['speaker-preset'] != undefined && preset['speaker-preset'].presetName) {
			presetName = preset['speaker-preset'].presetName;
		}

		readOnly = (systemPreset) ? true : false;

		if (presetName != null && preset["speaker-preset"]) {
			presetCompact = {presetName: presetName, fileName: presetFileName, productImage: "/common/beocreate-generic.png", bangOlufsenProduct: false, identityChecked: false, readOnly: readOnly};
			return {presetFull: preset, presetCompact: presetCompact, presetName: presetFileName, error: null};
		} else {
			if (debug) logger.log("Speaker preset '"+presetFileName+"' did not include a preset name or product model name. Skipping.");
			return {presetName: null, error: null};
		}
	} catch (error) {
		if (debug) logger.error("Error loading preset '"+presetFileName+"' from '"+presetPath+"':", error);
		return {presetName: null, error: error};
	}
}

function discoverPresets(systemPresetDirectory, presetDirectory, fullPresetList, compactPresetList, debug, logger) {
	var presetFiles;
	var preset;
	var i;

	presetFiles = fs.readdirSync(systemPresetDirectory);
	for (i = 0; i < presetFiles.length; i++) {
		preset = readPresetFromFile(systemPresetDirectory+"/"+presetFiles[i], true, debug, logger);
		if (preset.presetName && !compactPresetList[preset.presetName]) {
			compactPresetList[preset.presetName] = preset.presetCompact;
			fullPresetList[preset.presetName] = preset.presetFull;
		}
	}

	presetFiles = fs.readdirSync(presetDirectory);
	for (i = 0; i < presetFiles.length; i++) {
		preset = readPresetFromFile(presetDirectory+"/"+presetFiles[i], false, debug, logger);
		if (preset.presetName && !compactPresetList[preset.presetName]) {
			compactPresetList[preset.presetName] = preset.presetCompact;
			fullPresetList[preset.presetName] = preset.presetFull;
		}
	}

	return {fullPresetList: fullPresetList, compactPresetList: compactPresetList};
}

module.exports = {
	readPresetFromFile: readPresetFromFile,
	discoverPresets: discoverPresets
};
