'use strict';

function createConfigurationAPI(service) {
	function sendJSON(response, status, body) {
		response.status(status);
		response.type("application/json");
		response.send(JSON.stringify(body));
	}

	function errorStatus(error) {
		if (error.code == "BACKUP_TOO_LARGE") return 413;
		if (error.code == "RESTORE_BUSY" || error.code == "INVALID_RESTORE_TOKEN") return 409;
		if (error.code && (
			error.code.indexOf("INVALID") == 0 ||
			error.code.indexOf("WRONG_") == 0 ||
			error.code.indexOf("UNSUPPORTED_") == 0 ||
			error.code.indexOf("UNKNOWN_") == 0 ||
			error.code.indexOf("MISSING_") == 0 ||
			error.code.indexOf("CORRUPT_") == 0 ||
			error.code.indexOf("INCOMPATIBLE_") == 0
		)) return 400;
		return 500;
	}

	function publicError(error) {
		return {error: {code: error.code || "CONFIGURATION_ERROR", message: error.message}};
	}

	function capabilities(request, response) {
		sendJSON(response, 200, service.capabilities());
	}

	function exportBackup(request, response) {
		try {
			var serialized = service.serializeBackup();
			response.status(200);
			response.type("application/json");
			response.set("Content-Disposition", 'attachment; filename="speakerlab-configuration-backup.json"');
			response.send(serialized);
		} catch (error) {
			sendJSON(response, errorStatus(error), publicError(error));
		}
	}

	function preview(request, response) {
		try {
			var input = request.body;
			sendJSON(response, 200, service.preview(input));
		} catch (error) {
			sendJSON(response, errorStatus(error), publicError(error));
		}
	}

	function restore(request, response) {
		try {
			var body = request.body;
			if (typeof body == "string") {
				try {
					body = JSON.parse(body);
				} catch (error) {
					error.code = "INVALID_JSON";
					throw error;
				}
			}
			if (!body || typeof body.token != "string") {
				var tokenError = new Error("Restore confirmation token is required.");
				tokenError.code = "INVALID_RESTORE_TOKEN";
				throw tokenError;
			}
			var result = service.restore(body.token);
			sendJSON(response, result.status == "success" ? 200 : 500, result);
		} catch (error) {
			sendJSON(response, errorStatus(error), publicError(error));
		}
	}

	return {
		capabilities: capabilities,
		exportBackup: exportBackup,
		preview: preview,
		restore: restore
	};
}

function registerConfigurationRoutes(beo, service) {
	var api = createConfigurationAPI(service);
	var base = "/hifiberry-system-tools/configuration-backup";
	var textBody = beo.express.text({
		type: ["application/json", "text/plain", "application/octet-stream"],
		limit: service.constants.maxBackupBytes
	});
	beo.expressServer.get(base+"/capabilities", api.capabilities);
	beo.expressServer.get(base+"/export", api.exportBackup);
	beo.expressServer.post(base+"/preview", textBody, api.preview);
	beo.expressServer.post(base+"/restore", textBody, api.restore);
	return api;
}

module.exports = {
	createConfigurationAPI: createConfigurationAPI,
	registerConfigurationRoutes: registerConfigurationRoutes
};
