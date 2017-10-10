var ASR_SERVER = "qcri-alt-asr-ar.northeurope.cloudapp.azure.com:7778";

function __serverStatus(msg) {
	console.log("[STATUS]");
	console.log(msg);
}

// Private methods (called from the callbacks)
function __message(code, data) {
	console.log("[msg]: " + code + ": " + (data || ''));
}

function __error(code, data) {
	console.log("[err]: " + code + ": " + (data || ''));
}

function __status(msg) {
	console.log("[status]: " + msg);
}

var dictate = new Dictate({
	server : "wss://" + ASR_SERVER + "/client/ws/speech",
	serverStatus : "wss://" + ASR_SERVER + "/client/ws/status",
	recorderWorkerPath : 'recorderWorker.js',
	onReadyForSpeech : function() {
		__message("READY FOR SPEECH");
		__status("Kuulan ja transkribeerin...");
	},
	onEndOfSpeech : function() {
		__message("END OF SPEECH");
		__status("Transkribeerin...");
	},
	onEndOfSession : function() {
		__message("END OF SESSION");
		__status("");
	},
	onServerStatus : function(json) {
		__serverStatus(json.num_workers_available + ':' + json.num_requests_processed);
	},
	onPartialResults : function(hypos, segmentid) {
		console.log("[PARTIAL] "  + hypos[0]['transcript']);
		document.getElementById("transcripts").innerHTML = document.getElementById("transcripts").innerHTML + "<br/> " + "[PARTIAL] "  + hypos[0]['transcript'];
	},
	onResults : function(hypos, segmentid) {
		console.log("[FINAL] "  + hypos[0]['transcript']);
		document.getElementById("transcripts").innerHTML = document.getElementById("transcripts").innerHTML + "<br/> " + "[FINAL] "  + hypos[0]['transcript'];
	},
	onError : function(code, data) {
		console.log("ERROR " + code + " " + data);
		dictate.cancel();
	},
	onEvent : function(code, data) {
		__message(code, data);
	}
});

window.onload = function() {
	document.getElementById("transcripts").innerHTML = document.getElementById("transcripts").innerHTML + "Ready";

	dictate.init();
};

function start_listening() {
	dictate.startListening();
}

function stop_listening() {
	dictate.stopListening();
}
