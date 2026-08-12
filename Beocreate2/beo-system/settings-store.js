/*Copyright 2017-2020 Bang & Olufsen A/S
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
var atomicJSONFile = require('./atomic-json-file');

function getSettings(dataDirectory, extension, debugMode, logger) {
	var file;
	var settings;
	logger = logger || console;

	if (extension) {
		if (fs.existsSync(dataDirectory+"/"+extension+".json")) {
			try {
				file = fs.readFileSync(dataDirectory+"/"+extension+".json", "utf8").trim();
				if (file) {
					settings = JSON.parse(file);
					if (debugMode >= 2) logger.log("Settings loaded for '"+extension+"'.");
				} else {
					if (debugMode >= 2) logger.log("Settings file for '"+extension+"' is empty.");
					settings = null;
				}
			} catch (error) {
				logger.error("Error loading settings for '"+extension+"':", error);
				settings = null;
			}
		} else {
			settings = null;
		}
	} else {
		settings = null;
	}
	return settings;
}

function mergeSettings(defaultSettings, loadedSettings) {
	if (loadedSettings != null) return Object.assign(defaultSettings, loadedSettings);
	return defaultSettings;
}

function createSettingsWriter(dataDirectory, debugMode, logger, timers, persistence) {
	var settingsToBeSaved = {};
	var settingsSaveTimeout = null;
	var restoreInProgress = false;
	logger = logger || console;
	persistence = persistence || atomicJSONFile;
	timers = timers || {
		setTimeout: setTimeout,
		clearTimeout: clearTimeout
	};

	function saveSettings(extension, settings, immediately) {
		if (restoreInProgress) {
			var error = new Error("Settings cannot be saved while a configuration restore is in progress.");
			error.code = "SETTINGS_RESTORE_IN_PROGRESS";
			throw error;
		}
		if (immediately) {
			persistence.writeJSONAtomic(dataDirectory+"/"+extension+".json", settings);
			if (debugMode >= 2) logger.log("Settings saved for '"+extension+"' (immediately).");
		} else {
			settingsToBeSaved[extension] = settings;
			timers.clearTimeout(settingsSaveTimeout);
			settingsSaveTimeout = timers.setTimeout(function() {
				savePendingSettings();
			}, 10000);
		}
	}

	function savePendingSettings() {
		for (var extension in settingsToBeSaved) {
			if (settingsToBeSaved.hasOwnProperty(extension)) {
				persistence.writeJSONAtomic(dataDirectory+"/"+extension+".json", settingsToBeSaved[extension]);
				if (debugMode >= 2) logger.log("Settings saved for '"+extension+"'.");
			}
		}
		settingsToBeSaved = {};
	}

	function beginRestore() {
		if (restoreInProgress) {
			var error = new Error("A configuration restore is already in progress.");
			error.code = "SETTINGS_RESTORE_IN_PROGRESS";
			throw error;
		}
		savePendingSettings();
		timers.clearTimeout(settingsSaveTimeout);
		settingsSaveTimeout = null;
		restoreInProgress = true;
	}

	function endRestore() {
		restoreInProgress = false;
	}

	return {
		saveSettings: saveSettings,
		savePendingSettings: savePendingSettings,
		beginRestore: beginRestore,
		endRestore: endRestore,
		isRestoreInProgress: function() { return restoreInProgress; }
	};
}

module.exports = {
	getSettings: getSettings,
	mergeSettings: mergeSettings,
	createSettingsWriter: createSettingsWriter
};
