'use strict';

var fs = require('fs');
var path = require('path');

var nextTemporaryID = 0;
var unsupportedDirectorySyncErrors = {
	EBADF: true,
	EINVAL: true,
	EISDIR: true,
	ENOTSUP: true
};

function writeJSONAtomic(targetPath, value, options) {
	var directory;
	var directoryDescriptor = null;
	var fileSystem;
	var serialized;
	var stage = "validation";
	var targetMode;
	var temporaryDescriptor = null;
	var temporaryPath = null;
	var renamed = false;
	var writeBuffer;
	var writeOffset = 0;

	options = options || {};
	fileSystem = options.fileSystem || fs;

	try {
		if (typeof targetPath != "string" || targetPath.length == 0) {
			throw new TypeError("Atomic JSON target path must be a non-empty string.");
		}

		serialized = JSON.stringify(value);
		if (serialized === undefined) {
			throw new TypeError("Atomic JSON content must serialize to a string.");
		}

		directory = path.dirname(targetPath);
		if (!fileSystem.statSync(directory).isDirectory()) {
			throw new Error("Atomic JSON target directory is not a directory: "+directory);
		}

		try {
			targetMode = fileSystem.statSync(targetPath).mode & 0o7777;
		} catch (error) {
			if (error.code != "ENOENT") throw error;
			targetMode = 0o666 & ~process.umask();
		}

		stage = "temporary-file creation";
		temporaryPath = createTemporaryFile(fileSystem, directory, path.basename(targetPath), options);
		temporaryDescriptor = temporaryPath.descriptor;
		temporaryPath = temporaryPath.path;

		stage = "write";
		writeBuffer = Buffer.from(serialized, "utf8");
		while (writeOffset < writeBuffer.length) {
			var bytesWritten = fileSystem.writeSync(
				temporaryDescriptor,
				writeBuffer,
				writeOffset,
				writeBuffer.length-writeOffset,
				null
			);
			if (!Number.isInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > writeBuffer.length-writeOffset) {
				throw new Error("Atomic JSON write did not make valid forward progress.");
			}
			writeOffset += bytesWritten;
		}

		stage = "permissions";
		fileSystem.fchmodSync(temporaryDescriptor, targetMode);

		stage = "file sync";
		fileSystem.fsyncSync(temporaryDescriptor);

		stage = "close";
		fileSystem.closeSync(temporaryDescriptor);
		temporaryDescriptor = null;

		stage = "rename";
		fileSystem.renameSync(temporaryPath, targetPath);
		renamed = true;

		stage = "directory sync";
		var directorySyncError = null;
		try {
			directoryDescriptor = fileSystem.openSync(directory, "r");
			fileSystem.fsyncSync(directoryDescriptor);
		} catch (error) {
			if (!unsupportedDirectorySyncErrors[error.code]) directorySyncError = error;
		}
		if (directoryDescriptor !== null) {
			try {
				fileSystem.closeSync(directoryDescriptor);
			} catch (directoryCloseError) {
				if (directorySyncError) {
					directorySyncError.atomicWriteCleanupError = directoryCloseError;
				} else {
				stage = "directory close";
					throw directoryCloseError;
				}
			}
			directoryDescriptor = null;
		}
		if (directorySyncError) throw directorySyncError;
	} catch (error) {
		error.atomicWriteStage = stage;
		error.atomicWriteTarget = targetPath;

		if (temporaryDescriptor !== null) {
			try {
				fileSystem.closeSync(temporaryDescriptor);
			} catch (closeError) {
				error.atomicWriteCleanupError = closeError;
			}
		}

		if (!renamed && temporaryPath !== null) {
			try {
				fileSystem.unlinkSync(temporaryPath);
			} catch (cleanupError) {
				if (cleanupError.code != "ENOENT" && !error.atomicWriteCleanupError) {
					error.atomicWriteCleanupError = cleanupError;
				}
			}
		}
		throw error;
	}
}

function createTemporaryFile(fileSystem, directory, targetName, options) {
	var attempts = 0;
	var descriptor;
	var temporaryPath;
	var processID = options.processID === undefined ? process.pid : options.processID;

	while (attempts < 100) {
		nextTemporaryID += 1;
		temporaryPath = path.join(
			directory,
			"."+targetName+".speakerlab-"+processID+"-"+nextTemporaryID+".tmp"
		);
		try {
			descriptor = fileSystem.openSync(temporaryPath, "wx", 0o666);
			return {descriptor: descriptor, path: temporaryPath};
		} catch (error) {
			if (error.code != "EEXIST") throw error;
		}
		attempts += 1;
	}

	throw new Error("Could not create a unique atomic JSON temporary file for "+targetName+".");
}

module.exports = {
	writeJSONAtomic: writeJSONAtomic
};
