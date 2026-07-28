var hifiberry_system_tools = (function() {

var newVersion = null;
var archiveURL = null;
var configurationState = speakerlabConfigurationUI.initialState();
var configurationAPIBase = "/hifiberry-system-tools/configuration-backup";


$(document).on("hifiberry-system-tools", function(event, data) {
	
	if (data.header == "collecting") {
		$("#diagnostic-collect-button").addClass("disabled");
		$("#diagnostic-collecting").removeClass("hidden");
		$("#diagnostic-archive").addClass("hidden");
	}
	
	if (data.header == "finishedCollecting") {
		$("#diagnostic-collect-button").removeClass("disabled");
		$("#diagnostic-collecting").addClass("hidden");
	}
	
	if (data.header == "archive") {
		if (data.content && data.content.archiveURL) {
			archiveURL = data.content.archiveURL;
			
			$("#diagnostic-collect-button").removeClass("black").addClass("grey");
			$("#diagnostic-archive").removeClass("hidden");
		} else {
			$("#diagnostic-archive").addClass("hidden");
			$("#diagnostic-collect-button").removeClass("grey").addClass("black");
		}
	}
	
	if (data.header == "state") {
		if (data.content.exclusiveAudio) {
			$("#exclusive-audio-status").text("Yes");
			$("#exclusive-audio-on-explanation").removeClass("hidden");
			$("#exclusive-audio-off-explanation").addClass("hidden");
			$("#software-resampling-menu-item").addClass("disabled");
		} else {
			$("#exclusive-audio-status").text("No");
			$("#exclusive-audio-on-explanation").addClass("hidden");
			$("#exclusive-audio-off-explanation").removeClass("hidden");
			$("#software-resampling-menu-item").removeClass("disabled");
			
		}
		
		if (data.content.resamplingRate) {
			$("#resampling-rate").text(data.content.resamplingRate/1000+" kHz");
		} else {
			$("#resampling-rate").text("Unknown");
		}
	}
	
	if (data.header == "sysinfo") {
		updateSystemInfo(data.content)
	}
});

$(document).on("general", function(event, data) {
	if (data.header == "connection" && data.content) {
		configurationState = speakerlabConfigurationUI.reduce(configurationState, {
			type: "CONNECTION",
			connected: data.content.status == "connected"
		});
		renderConfigurationState();
	}
});

$(document).on("change", "#configuration-backup-file", function() {
	if (this.files && this.files[0]) validateBackupFile(this.files[0]);
	this.value = "";
});


function collect() {
	beo.send({target: "hifiberry-system-tools", header: "collect"});
}


function updateSystemInfo(info) {
		block = document.getElementById("hifiberry-debug-sysinfo");
		block.innerHTML = "";
		for (var i = 0; i <info.length; i++) {
			block.innerHTML += beo.createMenuItem({
				label: info[i][0],
				description: info[i][1],
				static: true
			}) + "\n";
			
		}
	
}

function downloadArchive() {
	window.location = archiveURL;
}

function downloadBackup() {
	window.location = configurationAPIBase+"/export";
}

function chooseBackup() {
	if (speakerlabConfigurationUI.viewModel(configurationState).canChooseFile) {
		$("#configuration-backup-file").trigger("click");
	}
}


function validateBackupFile(file) {
	if (file.size > 5*1024*1024) {
		configurationState = speakerlabConfigurationUI.reduce(configurationState, {
			type: "VALIDATION_FAILED",
			error: {message: "The selected backup is larger than 5 MiB."}
		});
		renderConfigurationState();
		return;
	}
	configurationState = speakerlabConfigurationUI.reduce(configurationState, {type: "VALIDATE"});
	renderConfigurationState();
	var reader = new FileReader();
	reader.onload = function() {
		request(configurationAPIBase+"/preview", reader.result).then(function(preview) {
			configurationState = speakerlabConfigurationUI.reduce(configurationState, {type: "PREVIEW", preview: preview});
			renderConfigurationState();
		}).catch(function(error) {
			configurationState = speakerlabConfigurationUI.reduce(configurationState, {type: "VALIDATION_FAILED", error: error});
			renderConfigurationState();
		});
	};
	reader.onerror = function() {
		configurationState = speakerlabConfigurationUI.reduce(configurationState, {
			type: "VALIDATION_FAILED",
			error: {message: "The selected file could not be read."}
		});
		renderConfigurationState();
	};
	reader.readAsText(file);
}

function confirmRestore() {
	var view = speakerlabConfigurationUI.viewModel(configurationState);
	if (!view.canConfirm) return;
	configurationState = speakerlabConfigurationUI.reduce(configurationState, {type: "CONFIRM_RESTORE"});
	renderConfigurationState();
	request(configurationAPIBase+"/restore", JSON.stringify({token: configurationState.preview.token})).then(function(result) {
		if (result.status == "success") {
			configurationState = speakerlabConfigurationUI.reduce(configurationState, {type: "RESTORE_SUCCEEDED"});
		} else {
			configurationState = speakerlabConfigurationUI.reduce(configurationState, {
				type: "RESTORE_FAILED",
				error: result.error,
				rollback: result.rollback
			});
		}
		renderConfigurationState();
	}).catch(function(error) {
		configurationState = speakerlabConfigurationUI.reduce(configurationState, {
			type: "RESTORE_FAILED",
			error: error,
			rollback: error.rollback
		});
		renderConfigurationState();
	});
}

function cancelRestore() {
	configurationState = speakerlabConfigurationUI.reduce(configurationState, {type: "RESET"});
	renderConfigurationState();
}

function request(url, body) {
	return fetch(url, {
		method: "POST",
		credentials: "include",
		headers: {"Content-Type": "application/json"},
		body: body
	}).then(function(response) {
		return response.json().then(function(result) {
			if (!response.ok) {
				var error = result.error || result;
				if (result.rollback) error.rollback = result.rollback;
				throw error;
			}
			return result;
		});
	});
}

function renderConfigurationState() {
	var view = speakerlabConfigurationUI.viewModel(configurationState);
	if (configurationState.status == "idle") {
		$("#configuration-restore-status").addClass("hidden");
	} else {
		$("#configuration-restore-status").removeClass("hidden");
	}
	$("#configuration-restore-title").text(view.title);
	$("#configuration-restore-message").text(view.message);
	$("#configuration-restore-progress").toggleClass("hidden", !view.showProgress);
	$("#restore-button").toggleClass("disabled", !view.canChooseFile);
	$("#configuration-restore-confirm").toggleClass("disabled", !view.canConfirm);
	if (configurationState.status == "preview") {
		var preview = configurationState.preview;
		var changeCount = preview.plan.create.length+preview.plan.replace.length;
		$("#configuration-restore-preview").removeClass("hidden");
		$("#configuration-backup-created").text(new Date(preview.metadata.createdAt).toLocaleString());
		$("#configuration-backup-changes").text(changeCount+" changes");
		$("#configuration-backup-warnings").empty();
		for (var i = 0; i < preview.plan.warnings.length; i++) {
			$("#configuration-backup-warnings").append('<p class="warning"></p>');
			$("#configuration-backup-warnings p:last").text(preview.plan.warnings[i]);
		}
	} else {
		$("#configuration-restore-preview").addClass("hidden");
	}
}


return {
	collect: collect,
	downloadArchive: downloadArchive,
	downloadBackup: downloadBackup,
	chooseBackup: chooseBackup,
	confirmRestore: confirmRestore,
	cancelRestore: cancelRestore
};

})();
