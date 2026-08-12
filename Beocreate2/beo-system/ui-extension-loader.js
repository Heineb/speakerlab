'use strict';

var path = require('path');

var ACTIVE_EXTENSION_SCRIPT = /<script\b[^>]*\bsrc=(["'])€\/([^"'<>]+\.js)\1[^>]*>\s*<\/script>/gi;
var EXTENSION_SCRIPT_LINE = /^\s*<script\b[^>]*\bsrc=(["'])€\/[^"'<>]+\1[^>]*>\s*<\/script>\s*$/gmi;

function declaredClientScripts(markup) {
	var withoutComments = markup.replace(/<!--[\s\S]*?-->/g, '');
	var scripts = [];
	var match;
	while ((match = ACTIVE_EXTENSION_SCRIPT.exec(withoutComments))) {
		var relative = match[2].replace(/\\/g, '/');
		var normalized = path.posix.normalize(relative);
		if (normalized !== relative || normalized.charAt(0) === '/' || normalized.indexOf('../') === 0) {
			throw new Error('Unsafe extension client script path: ' + relative);
		}
		if (scripts.indexOf(normalized) === -1) scripts.push(normalized);
	}
	ACTIVE_EXTENSION_SCRIPT.lastIndex = 0;
	return scripts;
}

function stripClientScriptTags(markup) {
	return markup.replace(EXTENSION_SCRIPT_LINE, '');
}

function clientScriptURLs(extensionName, declaredScripts) {
	return declaredScripts.map(function(script) {
		return '/extensions/' + extensionName + '/' + script;
	});
}

module.exports = {
	declaredClientScripts: declaredClientScripts,
	stripClientScriptTags: stripClientScriptTags,
	clientScriptURLs: clientScriptURLs
};
