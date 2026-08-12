(function(root, factory) {
	if (typeof module == "object" && module.exports) {
		module.exports = factory();
	} else if (!root.speakerlabConfigurationUI) {
		root.speakerlabConfigurationUI = factory();
	}
}(typeof window != "undefined" ? window : this, function() {
	'use strict';

	function initialState() {
		return {
			status: "idle",
			connected: true,
			submitting: false,
			preview: null,
			error: null,
			rollback: null
		};
	}

	function reduce(state, action) {
		state = Object.assign({}, state);
		switch (action.type) {
			case "CONNECTION":
				state.connected = !!action.connected;
				if (!state.connected && state.status != "restoring") state.status = "disconnected";
				if (state.connected && state.status == "disconnected") state.status = "idle";
				break;
			case "VALIDATE":
				if (!state.connected || state.submitting) return state;
				state.status = "validating";
				state.submitting = true;
				state.preview = null;
				state.error = null;
				break;
			case "PREVIEW":
				state.status = "preview";
				state.submitting = false;
				state.preview = action.preview;
				break;
			case "VALIDATION_FAILED":
				state.status = "invalid";
				state.submitting = false;
				state.error = action.error;
				break;
			case "CONFIRM_RESTORE":
				if (!state.connected || state.submitting || !state.preview) return state;
				state.status = "restoring";
				state.submitting = true;
				state.error = null;
				break;
			case "RESTORE_SUCCEEDED":
				state.status = "success";
				state.submitting = false;
				break;
			case "RESTORE_FAILED":
				state.rollback = action.rollback || {succeeded: false};
				state.status = state.rollback.succeeded ? "rollback-success" : "rollback-failed";
				state.submitting = false;
				state.error = action.error;
				break;
			case "RESET":
				return initialState();
		}
		return state;
	}

	function viewModel(state) {
		var view = {
			canChooseFile: state.connected && !state.submitting,
			canConfirm: state.connected && !state.submitting && state.status == "preview",
			showProgress: state.status == "validating" || state.status == "restoring",
			tone: "normal",
			title: "",
			message: ""
		};
		switch (state.status) {
			case "disconnected":
				view.tone = "warning";
				view.title = "Product disconnected";
				view.message = "Reconnect before restoring a configuration.";
				break;
			case "validating":
				view.title = "Checking backup…";
				view.message = "No settings have been changed.";
				break;
			case "preview":
				view.title = "Ready to restore";
				view.message = summary(state.preview.plan);
				break;
			case "invalid":
				view.tone = "warning";
				view.title = "Backup cannot be restored";
				view.message = errorMessage(state.error);
				break;
			case "restoring":
				view.title = "Restoring configuration…";
				view.message = "Keep the product powered on while settings are verified.";
				break;
			case "success":
				view.tone = "success";
				view.title = "Configuration restored";
				view.message = "Restart the product to apply the restored settings.";
				break;
			case "rollback-success":
				view.tone = "warning";
				view.title = "Restore failed";
				view.message = "The previous configuration was restored successfully. "+errorMessage(state.error);
				break;
			case "rollback-failed":
				view.tone = "critical";
				view.title = "Configuration recovery failed";
				view.message = "The previous configuration could not be fully restored. Do not restart the product until the configuration has been checked.";
				break;
		}
		return view;
	}

	function summary(plan) {
		return plan.create.length+" new, "+plan.replace.length+" replaced and "+plan.unchanged.length+" unchanged configuration items.";
	}

	function errorMessage(error) {
		return error && error.message ? error.message : "The server rejected the operation.";
	}

	return {
		initialState: initialState,
		reduce: reduce,
		viewModel: viewModel
	};
}));
