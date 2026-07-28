'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var atomicJSONFile = require('./atomic-json-file');

var FORMAT = "org.speakerlab.configuration-backup";
var SCHEMA_VERSION = 1;
var MAX_BACKUP_BYTES = 5 * 1024 * 1024;
var REQUIRED_SECTIONS = ["settings", "speakerPresets", "listeningModes"];
var LAST_KNOWN_GOOD_FILE = ".speakerlab-last-known-good.json";
var EXCLUDED_SETTINGS = {
	"alsaloop": "Operating-system audio service state",
	"dsp-programs": "DSP program selection and deployment state",
	"hifiberry-audiocontrol": "May reference service credentials and machine state",
	"last-fm": "Authentication state",
	"mpd": "Music-library, share and cache state",
	"network": "Network and device-specific connectivity state",
	"product-information": "Device-specific product identity",
	"setup": "Transient first-run state",
	"shairport-sync": "Service state that may be associated with a password",
	"software-update": "Transient update state",
	"spotify": "Authentication state",
	"squeezelite": "External service state",
	"ssh": "Authentication and operating-system service state"
};
var SENSITIVE_KEY = /(password|passphrase|credential|secret|token|private.?key|api.?key)/i;

function configurationError(code, message, details) {
	var error = new Error(message);
	error.code = code;
	if (details !== undefined) error.details = details;
	return error;
}

function canonicalize(value) {
	var output;
	var keys;
	if (Array.isArray(value)) {
		return value.map(canonicalize);
	}
	if (value && typeof value == "object") {
		output = Object.create(null);
		keys = Object.keys(value).sort();
		for (var i = 0; i < keys.length; i++) {
			output[keys[i]] = canonicalize(value[keys[i]]);
		}
		return output;
	}
	return value;
}

function canonicalJSON(value) {
	return JSON.stringify(canonicalize(value));
}

function checksum(value) {
	return crypto.createHash("sha256").update(canonicalJSON(value), "utf8").digest("hex");
}

function containsSensitiveKey(value, trail) {
	trail = trail || [];
	if (!value || typeof value != "object") return null;
	var keys = Object.keys(value);
	for (var i = 0; i < keys.length; i++) {
		var currentTrail = trail.concat(keys[i]);
		if (SENSITIVE_KEY.test(keys[i])) return currentTrail.join(".");
		var nested = containsSensitiveKey(value[keys[i]], currentTrail);
		if (nested) return nested;
	}
	return null;
}

function isPlainObject(value) {
	if (!value || Object.prototype.toString.call(value) != "[object Object]") return false;
	var prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function safeResourceName(name) {
	return typeof name == "string" &&
		name.length > 0 &&
		name.length <= 255 &&
		name != "." &&
		name != ".." &&
		path.basename(name) == name &&
		name.indexOf("\0") == -1;
}

function createConfigurationService(options) {
	var activePreview = null;
	var restoring = false;
	var fileSystem;
	var atomicWriter;
	var clock;
	var dataDirectory;
	var settingsCoordinator;
	var systemVersion;
	var systemConfiguration;
	var hooks;

	options = options || {};
	dataDirectory = options.dataDirectory;
	fileSystem = options.fileSystem || fs;
	atomicWriter = options.atomicWriter || atomicJSONFile;
	clock = options.clock || function() { return new Date(); };
	settingsCoordinator = options.settingsCoordinator || null;
	systemVersion = options.systemVersion || "unknown";
	systemConfiguration = options.systemConfiguration || {};
	hooks = options.hooks || {};

	if (typeof dataDirectory != "string" || dataDirectory.length == 0) {
		throw new TypeError("Configuration service requires a data directory.");
	}

	function collectBackup() {
		var excluded = standardExclusions();
		var backup = {
			format: FORMAT,
			schemaVersion: SCHEMA_VERSION,
			createdAt: clock().toISOString(),
			source: {
				platform: "beocreate",
				systemVersion: String(systemVersion),
				cardType: systemConfiguration.cardType || "unknown"
			},
			requiredSections: REQUIRED_SECTIONS.slice(),
			includedCategories: [
				"central-settings",
				"user-speaker-presets",
				"user-listening-modes"
			],
			excludedCategories: excluded,
			configuration: {
				settings: collectSettings(excluded),
				speakerPresets: collectDirectory("beo-speaker-presets", excluded, "user-speaker-presets"),
				listeningModes: collectDirectory("beo-listening-modes", excluded, "user-listening-modes")
			}
		};

		addSectionChecksums(backup.configuration);
		backup.integrity = {
			algorithm: "sha256",
			checksum: checksum(backup)
		};
		validateBackup(backup);
		return backup;
	}

	function standardExclusions() {
		return [
			{id: "credentials-and-secrets", reason: "Passwords, tokens, private keys and credential-bearing files are excluded."},
			{id: "network-and-device-identity", reason: "Wi-Fi credentials, network identity and product identity are excluded."},
			{id: "dsp-programs", reason: "DSP program binaries, selection and deployment state are excluded."},
			{id: "operating-system-state", reason: "Packages, services, systemd, GPIO and HiFiBerryOS state are excluded."},
			{id: "transient-data", reason: "Logs, caches, uploads and temporary files are excluded."}
		];
	}

	function collectSettings(excluded) {
		var entries = fileSystem.readdirSync(dataDirectory).slice().sort();
		var items = [];
		for (var i = 0; i < entries.length; i++) {
			var name = entries[i];
			if (!name.endsWith(".json") || name.charAt(0) == ".") continue;
			var extension = name.substring(0, name.length-5);
			var fullPath = path.join(dataDirectory, name);
			var stat = fileSystem.lstatSync(fullPath);
			if (!stat.isFile()) continue;
			if (EXCLUDED_SETTINGS[extension]) {
				excluded.push({id: "central-settings/"+extension, reason: EXCLUDED_SETTINGS[extension]});
				continue;
			}
			var data = parseLiveJSON(fullPath);
			if (extension == "system" && data && typeof data == "object" && data.runAtStart !== undefined) {
				excluded.push({
					id: "central-settings/system",
					reason: "Excluded because runAtStart can execute a machine-specific command."
				});
				continue;
			}
			var sensitivePath = containsSensitiveKey(data);
			if (sensitivePath) {
				excluded.push({
					id: "central-settings/"+extension,
					reason: "Excluded because a sensitive key was found: "+sensitivePath
				});
				continue;
			}
			items.push(makeItem(name, data));
		}
		return {present: true, items: items};
	}

	function collectDirectory(directoryName, excluded, category) {
		var directory = path.join(dataDirectory, directoryName);
		var items = [];
		if (!fileSystem.existsSync(directory)) return {present: false, items: items};
		if (!fileSystem.lstatSync(directory).isDirectory()) {
			throw configurationError("UNREADABLE_CONFIGURATION", "Configuration resource path is not a directory: "+directoryName);
		}
		var entries = fileSystem.readdirSync(directory).slice().sort();
		for (var i = 0; i < entries.length; i++) {
			var name = entries[i];
			var fullPath = path.join(directory, name);
			if (!safeResourceName(name) || name.charAt(0) == "." || !name.endsWith(".json")) continue;
			var stat = fileSystem.lstatSync(fullPath);
			if (!stat.isFile()) continue;
			var data = parseLiveJSON(fullPath);
			var sensitivePath = containsSensitiveKey(data);
			if (sensitivePath) {
				excluded.push({
					id: category+"/"+name,
					reason: "Excluded because a sensitive key was found: "+sensitivePath
				});
				continue;
			}
			items.push(makeItem(name, data));
		}
		return {present: true, items: items};
	}

	function parseLiveJSON(filePath) {
		var raw = fileSystem.readFileSync(filePath, "utf8");
		if (!raw.trim()) throw configurationError("UNREADABLE_CONFIGURATION", "Configuration file is empty: "+path.basename(filePath));
		try {
			return JSON.parse(raw);
		} catch (error) {
			throw configurationError("UNREADABLE_CONFIGURATION", "Configuration file is not valid JSON: "+path.basename(filePath));
		}
	}

	function makeItem(name, data) {
		return {name: name, data: data, checksum: checksum(data)};
	}

	function addSectionChecksums(configuration) {
		var sections = Object.keys(configuration);
		for (var i = 0; i < sections.length; i++) {
			configuration[sections[i]].checksum = checksum({
				present: configuration[sections[i]].present,
				items: configuration[sections[i]].items
			});
		}
	}

	function serializeBackup(backup) {
		backup = backup || collectBackup();
		var serialized = JSON.stringify(backup, null, 2)+"\n";
		if (Buffer.byteLength(serialized, "utf8") > MAX_BACKUP_BYTES) {
			throw configurationError("BACKUP_TOO_LARGE", "Complete backup exceeds the 5 MiB portable-format limit.");
		}
		return serialized;
	}

	function parseAndValidate(input) {
		var size;
		var backup;
		if (Buffer.isBuffer(input)) {
			size = input.length;
			input = input.toString("utf8");
		} else if (typeof input == "string") {
			size = Buffer.byteLength(input, "utf8");
		} else {
			try {
				input = JSON.stringify(input);
				size = Buffer.byteLength(input, "utf8");
			} catch (error) {
				throw configurationError("INVALID_BACKUP", "Backup content is not valid JSON.");
			}
		}
		if (size > MAX_BACKUP_BYTES) {
			throw configurationError("BACKUP_TOO_LARGE", "Backup exceeds the 5 MiB input limit.");
		}
		try {
			backup = JSON.parse(input);
		} catch (error) {
			throw configurationError("INVALID_JSON", "Backup is not valid JSON.");
		}
		return validateBackup(backup);
	}

	function validateBackup(backup) {
		var warnings = [];
		if (!isPlainObject(backup)) throw configurationError("INVALID_BACKUP", "Backup must be a JSON object.");
		if (backup.format != FORMAT) throw configurationError("WRONG_FORMAT", "This is not a SpeakerLab configuration backup.");
		if (!Number.isInteger(backup.schemaVersion)) throw configurationError("INVALID_BACKUP", "Backup schema version is missing.");
		if (backup.schemaVersion > SCHEMA_VERSION) throw configurationError("UNSUPPORTED_VERSION", "This backup was created by a newer unsupported format.");
		if (backup.schemaVersion < SCHEMA_VERSION) throw configurationError("UNSUPPORTED_VERSION", "This backup format version is not supported.");
		if (typeof backup.createdAt != "string" || isNaN(Date.parse(backup.createdAt))) {
			throw configurationError("INVALID_BACKUP", "Backup creation time is missing or invalid.");
		}
		if (!isPlainObject(backup.source) || backup.source.platform != "beocreate" || typeof backup.source.systemVersion != "string") {
			throw configurationError("INCOMPATIBLE_PLATFORM", "Backup source platform metadata is missing or incompatible.");
		}
		if (!Array.isArray(backup.requiredSections) || !isPlainObject(backup.configuration)) {
			throw configurationError("INVALID_BACKUP", "Backup section metadata is missing.");
		}
		if (!Array.isArray(backup.includedCategories) || !Array.isArray(backup.excludedCategories)) {
			throw configurationError("INVALID_BACKUP", "Backup inclusion and exclusion metadata is missing.");
		}
		for (var e = 0; e < backup.excludedCategories.length; e++) {
			if (!isPlainObject(backup.excludedCategories[e]) ||
				typeof backup.excludedCategories[e].id != "string" ||
				typeof backup.excludedCategories[e].reason != "string") {
				throw configurationError("INVALID_BACKUP", "Backup exclusion metadata is invalid.");
			}
		}
		for (var r = 0; r < REQUIRED_SECTIONS.length; r++) {
			if (backup.requiredSections.indexOf(REQUIRED_SECTIONS[r]) == -1 || !backup.configuration[REQUIRED_SECTIONS[r]]) {
				throw configurationError("MISSING_REQUIRED_SECTION", "Required section is missing: "+REQUIRED_SECTIONS[r]);
			}
		}
		for (var q = 0; q < backup.requiredSections.length; q++) {
			if (REQUIRED_SECTIONS.indexOf(backup.requiredSections[q]) == -1) {
				throw configurationError("UNKNOWN_REQUIRED_SECTION", "Backup requires an unsupported section: "+backup.requiredSections[q]);
			}
		}
		var sectionNames = Object.keys(backup.configuration);
		for (var s = 0; s < sectionNames.length; s++) {
			if (REQUIRED_SECTIONS.indexOf(sectionNames[s]) == -1) {
				warnings.push("Unsupported optional section will be ignored: "+sectionNames[s]);
				continue;
			}
			validateSection(sectionNames[s], backup.configuration[sectionNames[s]]);
		}
		if (!isPlainObject(backup.integrity) || backup.integrity.algorithm != "sha256" || typeof backup.integrity.checksum != "string") {
			throw configurationError("INVALID_BACKUP", "Backup integrity metadata is missing.");
		}
		var withoutIntegrity = Object.assign({}, backup);
		delete withoutIntegrity.integrity;
		if (checksum(withoutIntegrity) != backup.integrity.checksum) {
			throw configurationError("CORRUPT_BACKUP", "Backup integrity checksum does not match.");
		}
		if (backup.source.cardType && systemConfiguration.cardType && backup.source.cardType != systemConfiguration.cardType) {
			warnings.push("Backup was created for "+backup.source.cardType+"; this product reports "+systemConfiguration.cardType+".");
		}
		return {backup: backup, warnings: warnings};
	}

	function validateSection(name, section) {
		if (!isPlainObject(section) || typeof section.present != "boolean" || !Array.isArray(section.items) || typeof section.checksum != "string") {
			throw configurationError("INVALID_SECTION", "Backup section is invalid: "+name);
		}
		var seen = {};
		for (var i = 0; i < section.items.length; i++) {
			var item = section.items[i];
			if (!isPlainObject(item) || !safeResourceName(item.name) || !item.name.endsWith(".json") || typeof item.checksum != "string" || !item.hasOwnProperty("data")) {
				throw configurationError("INVALID_SECTION", "Backup item is invalid in section: "+name);
			}
			if (seen[item.name]) throw configurationError("INVALID_SECTION", "Backup contains a duplicate item: "+item.name);
			seen[item.name] = true;
			if (checksum(item.data) != item.checksum) throw configurationError("CORRUPT_BACKUP", "Item checksum does not match: "+item.name);
		}
		if (checksum({present: section.present, items: section.items}) != section.checksum) {
			throw configurationError("CORRUPT_BACKUP", "Section checksum does not match: "+name);
		}
	}

	function preview(input) {
		if (restoring) throw configurationError("RESTORE_BUSY", "A configuration restore is already running.");
		var validated = parseAndValidate(input);
		var current = collectBackup();
		var plan = buildPlan(validated.backup, current, validated.warnings);
		var token = crypto.randomBytes(24).toString("hex");
		activePreview = {token: token, backup: validated.backup, plan: plan};
		return {
			token: token,
			metadata: {
				createdAt: validated.backup.createdAt,
				source: validated.backup.source,
				schemaVersion: validated.backup.schemaVersion
			},
			plan: plan
		};
	}

	function buildPlan(backup, current, warnings) {
		var plan = {
			create: [],
			replace: [],
			unchanged: [],
			absent: [],
			unsupported: [],
			warnings: warnings.slice(),
			restartRequired: true,
			irreversibleEffects: []
		};
		var sections = Object.keys(backup.configuration);
		for (var i = 0; i < sections.length; i++) {
			var sectionName = sections[i];
			if (REQUIRED_SECTIONS.indexOf(sectionName) == -1) {
				plan.unsupported.push(sectionName);
				continue;
			}
			var currentItems = indexItems(current.configuration[sectionName].items);
			var incomingItems = backup.configuration[sectionName].items;
			var incomingNames = {};
			for (var j = 0; j < incomingItems.length; j++) {
				var identity = sectionName+"/"+incomingItems[j].name;
				incomingNames[incomingItems[j].name] = true;
				if (!currentItems[incomingItems[j].name]) {
					plan.create.push(identity);
				} else if (currentItems[incomingItems[j].name].checksum == incomingItems[j].checksum) {
					plan.unchanged.push(identity);
				} else {
					plan.replace.push(identity);
				}
			}
			var existingNames = Object.keys(currentItems).sort();
			for (var k = 0; k < existingNames.length; k++) {
				if (!incomingNames[existingNames[k]]) plan.absent.push(sectionName+"/"+existingNames[k]);
			}
		}
		if (plan.absent.length) {
			plan.warnings.push("Configuration not present in the backup will be left unchanged.");
		}
		return plan;
	}

	function indexItems(items) {
		var indexed = {};
		for (var i = 0; i < items.length; i++) indexed[items[i].name] = items[i];
		return indexed;
	}

	function restore(token) {
		if (restoring) throw configurationError("RESTORE_BUSY", "A configuration restore is already running.");
		if (!activePreview || token !== activePreview.token) throw configurationError("INVALID_RESTORE_TOKEN", "Restore confirmation is missing or expired.");
		restoring = true;
		var selected = activePreview;
		activePreview = null;
		var coordinatorStarted = false;
		var current;
		var operations = [];
		var attempted = [];
		try {
			if (settingsCoordinator) {
				settingsCoordinator.beginRestore();
				coordinatorStarted = true;
			}
			current = collectBackup();
			validateBackup(current);
			atomicWriter.writeJSONAtomic(path.join(dataDirectory, LAST_KNOWN_GOOD_FILE), current);
			var readback = parseAndValidate(fileSystem.readFileSync(path.join(dataDirectory, LAST_KNOWN_GOOD_FILE)));
			if (readback.backup.integrity.checksum != current.integrity.checksum) {
				throw configurationError("LAST_KNOWN_GOOD_FAILED", "Last-known-good snapshot verification failed.");
			}
			operations = buildOperations(selected.backup, current);
			if (hooks.beforeApply) hooks.beforeApply(operations);
			for (var i = 0; i < operations.length; i++) {
				attempted.push(operations[i]);
				ensureParentDirectory(operations[i]);
				atomicWriter.writeJSONAtomic(operations[i].target, operations[i].incoming.data);
				verifyOperation(operations[i]);
				if (hooks.afterReplacement) hooks.afterReplacement(i, operations[i], restore);
			}
			return {
				status: "success",
				applied: operations.length,
				restartRequired: true,
				lastKnownGood: LAST_KNOWN_GOOD_FILE
			};
		} catch (restoreError) {
			var rollback = rollbackOperations(attempted);
			return {
				status: "failed",
				error: publicError(restoreError),
				rollback: rollback,
				restartRequired: rollback.succeeded ? false : true
			};
		} finally {
			if (coordinatorStarted) settingsCoordinator.endRestore();
			restoring = false;
		}
	}

	function buildOperations(backup, current) {
		var operations = [];
		var sections = REQUIRED_SECTIONS;
		for (var i = 0; i < sections.length; i++) {
			var currentItems = indexItems(current.configuration[sections[i]].items);
			var incoming = backup.configuration[sections[i]].items;
			for (var j = 0; j < incoming.length; j++) {
				if (currentItems[incoming[j].name] && currentItems[incoming[j].name].checksum == incoming[j].checksum) continue;
				operations.push({
					section: sections[i],
					name: incoming[j].name,
					target: itemPath(sections[i], incoming[j].name),
					incoming: incoming[j],
					previous: currentItems[incoming[j].name] || null,
					createdDirectory: false
				});
			}
		}
		if (hooks.afterStaging) hooks.afterStaging(operations);
		return operations;
	}

	function itemPath(section, name) {
		if (!safeResourceName(name)) throw configurationError("INVALID_SECTION", "Unsafe configuration filename.");
		if (section == "settings") return path.join(dataDirectory, name);
		if (section == "speakerPresets") return path.join(dataDirectory, "beo-speaker-presets", name);
		if (section == "listeningModes") return path.join(dataDirectory, "beo-listening-modes", name);
		throw configurationError("UNKNOWN_REQUIRED_SECTION", "Unsupported restore section: "+section);
	}

	function ensureParentDirectory(operation) {
		var directory = path.dirname(operation.target);
		if (!fileSystem.existsSync(directory)) {
			fileSystem.mkdirSync(directory);
			operation.createdDirectory = true;
		}
	}

	function verifyOperation(operation) {
		var actual = parseLiveJSON(operation.target);
		if (checksum(actual) != operation.incoming.checksum) {
			throw configurationError("RESTORE_VERIFICATION_FAILED", "Restored configuration did not verify: "+operation.name);
		}
	}

	function rollbackOperations(attempted) {
		var errors = [];
		for (var i = attempted.length-1; i >= 0; i--) {
			var operation = attempted[i];
			try {
				if (hooks.beforeRollback) hooks.beforeRollback(i, operation);
				if (operation.previous) {
					atomicWriter.writeJSONAtomic(operation.target, operation.previous.data);
					var restored = parseLiveJSON(operation.target);
					if (checksum(restored) != operation.previous.checksum) {
						throw configurationError("ROLLBACK_VERIFICATION_FAILED", "Rollback verification failed: "+operation.name);
					}
				} else if (fileSystem.existsSync(operation.target)) {
					fileSystem.unlinkSync(operation.target);
					if (fileSystem.existsSync(operation.target)) {
						throw configurationError("ROLLBACK_VERIFICATION_FAILED", "New file remained after rollback: "+operation.name);
					}
				}
				if (operation.createdDirectory) {
					try { fileSystem.rmdirSync(path.dirname(operation.target)); } catch (error) {}
				}
			} catch (error) {
				errors.push(publicError(error));
			}
		}
		return {attempted: attempted.length > 0, succeeded: errors.length == 0, errors: errors};
	}

	function publicError(error) {
		return {
			code: error.code || "RESTORE_FAILED",
			message: error.message,
			stage: error.atomicWriteStage || null
		};
	}

	function capabilities() {
		return {
			format: FORMAT,
			schemaVersion: SCHEMA_VERSION,
			maxBackupBytes: MAX_BACKUP_BYTES,
			sections: REQUIRED_SECTIONS.slice(),
			restoreInProgress: restoring,
			previewPending: !!activePreview
		};
	}

	return {
		capabilities: capabilities,
		collectBackup: collectBackup,
		serializeBackup: serializeBackup,
		parseAndValidate: parseAndValidate,
		preview: preview,
		restore: restore,
		buildPlan: buildPlan,
		constants: {
			format: FORMAT,
			schemaVersion: SCHEMA_VERSION,
			maxBackupBytes: MAX_BACKUP_BYTES,
			lastKnownGoodFile: LAST_KNOWN_GOOD_FILE
		}
	};
}

module.exports = {
	createConfigurationService: createConfigurationService,
	canonicalJSON: canonicalJSON,
	checksum: checksum
};
