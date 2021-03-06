(function(window){

	// Defaults
	var SERVER = "ws://bark.phon.ioc.ee:82/dev/duplex-speech-api/ws/speech";
	var SERVER_STATUS = "ws://bark.phon.ioc.ee:82/dev/duplex-speech-api/ws/status";
	var REFERENCE_HANDLER = "http://bark.phon.ioc.ee:82/dev/duplex-speech-api/dynamic/reference";
	var CONTENT_TYPE = "content-type=audio/x-raw,+layout=(string)interleaved,+rate=(int)44100,+format=(string)S16LE,+channels=(int)1";
	// Send blocks 4 x per second as recommended in the server doc.
	var INTERVAL = 250;
	var TAG_END_OF_SENTENCE = "EOS";
	var RECORDER_WORKER_PATH = 'recorderWorker.js';

	// Error codes (mostly following Android error names and codes)
	var ERR_NETWORK = 2;
	var ERR_AUDIO = 3;
	var ERR_SERVER = 4;
	var ERR_CLIENT = 5;

	// Event codes
	var MSG_WAITING_MICROPHONE = 1;
	var MSG_MEDIA_STREAM_CREATED = 2;
	var MSG_INIT_RECORDER = 3;
	var MSG_RECORDING = 4;
	var MSG_SEND = 5;
	var MSG_SEND_EMPTY = 6;
	var MSG_SEND_EOS = 7;
	var MSG_WEB_SOCKET = 8;
	var MSG_WEB_SOCKET_OPEN = 9;
	var MSG_WEB_SOCKET_CLOSE = 10;
	var MSG_STOP = 11;
	var MSG_SERVER_CHANGED = 12;
	var MSG_SILENCE_AUDIO = 13;

	// Server status codes
	// from https://github.com/alumae/kaldi-gstreamer-server
	var SERVER_STATUS_CODE = {
		0: 'Success', // Usually used when recognition results are sent
		1: 'No speech', // Incoming audio contained a large portion of silence or non-speech
		2: 'Aborted', // Recognition was aborted for some reason
		9: 'No available recognizers', // recognizer processes are currently in use and recognition cannot be performed
	};

	// Initialized by init()
	var audioContext;
	var recorder;
	// Initialized by startListening()
	var ws;
	var intervalKey;
	// Initialized during construction
	var wsServerStatus;

	var audioLength;
	var recordTime;

	var Dictate = function(cfg) {
		var config = cfg || {};
		config.server = config.server || SERVER;
		config.serverStatus = config.serverStatus || SERVER_STATUS;
		config.referenceHandler = config.referenceHandler || REFERENCE_HANDLER;
		config.contentType = config.contentType || CONTENT_TYPE;
		config.interval = config.interval || INTERVAL;
		config.recorderWorkerPath = config.recorderWorkerPath || RECORDER_WORKER_PATH;
		config.onReadyForSpeech = config.onReadyForSpeech || function() {};
		config.onEndOfSpeech = config.onEndOfSpeech || function() {};
		config.onPartialResults = config.onPartialResults || function(data, segmentid) {};
		config.onResults = config.onResults || function(data, segmentid) {};
		config.onEndOfSession = config.onEndOfSession || function() {};
		config.onEvent = config.onEvent || function(e, data) {};
		config.onError = config.onError || function(e, data) {};
		config.onCancel = config.onCancel || function() {};
		config.onServerStatus = config.onServerStatus || {};
		config.rafCallback = config.rafCallback || function(time) {};
		config.audioProcessor = config.audioProcessor || function() {};
		if (config.onServerStatus) {
			monitorServerStatus();
		}

		// Returns the configuration
		this.getConfig = function() {
			return config;
		}

		// Set up the recorder (incl. asking permission)
		// Initializes audioContext
		// Can be called multiple times.
		// TODO: call something on success (MSG_INIT_RECORDER is currently called)
		this.init = async function() {
			config.onEvent(MSG_WAITING_MICROPHONE, "Waiting for approval to access your microphone ...");
			try {
				window.AudioContext = window.AudioContext || window.webkitAudioContext;
				navigator.getUserMedia = navigator.mediaDevices.getUserMedia
				window.URL = window.URL || window.webkitURL;
				audioContext = new AudioContext();
			} catch (e) {
				// Firefox 24: TypeError: AudioContext is not a constructor
				// Set media.webaudio.enabled = true (in about:config) to fix this.
				config.onError(ERR_CLIENT, "Error initializing Web Audio browser: " + e, 0);
				console.log(e)
			}

			if (navigator.getUserMedia) {
				navigator.mediaDevices.getUserMedia({audio: true}).then(startUserMedia).catch(function(e) {
					if (e.message.indexOf("Only secure origins") == -1) {
						config.onError(ERR_CLIENT, "No live audio input in this browser: " + e.message, 0);
					} else {
						config.onError(ERR_CLIENT, "HTML5 audio cannot be transmitted over an http connection! Please set up port forwarding or a tunnel.", 0);
					}
				});
			} else {
				config.onError(ERR_CLIENT, "No support for HTML5 audio in your browser! Please see supported browsers at http://caniuse.com/stream", 0);
			}
		}

		// Start recording and transcribing
		this.startListening = function() {
			var that = this;
			audioLength = 0.0;
			if (! recorder) {
				config.onError(ERR_AUDIO, "Recorder undefined");
				return;
			}

			if (ws) {
				// If a previous socket still exists, it means that its not done
				// transcribing yet. Do not start a new session.

				config.onError(ERR_CLIENT, "Previous trancription is still in progress!");
				return;
				// that.cancel();
			}

			try {
				ws = createWebSocket();
			} catch (e) {
				config.onError(ERR_CLIENT, "No web socket support in this browser!", 0);
			}
			var d = new Date();
			recordTime = d.getTime();
		}

		// Stop listening, i.e. recording and sending of new input.
		this.stopListening = function() {
			var d = new Date();
			var recordDuration = (d.getTime() - recordTime) / 1000;
			console.log("[DEBUG] record duration: " + recordDuration);


			// Stop the regular sending of audio
			clearInterval(intervalKey);
			// Stop recording
			if (recorder) {
				recorder.stop();
				config.onEvent(MSG_STOP, 'Stopped recording');
				// Push the remaining audio to the server
				recorder.export16kMono(function(blob) {
					socketSend(blob);
					audioLength = audioLength + blob.size / 32000.0;
					socketSend(TAG_END_OF_SENTENCE);
					recorder.clear();
					console.log("[DEBUG]sent audio length:" + audioLength);
				}, 'audio/x-raw');
				config.onEndOfSpeech();
			} else {
				config.onError(ERR_AUDIO, "Recorder undefined");
			}
		}

		// Cancel everything without waiting on the server
		this.cancel = function() {
			// Stop the regular sending of audio (if present)
			clearInterval(intervalKey);
			if (recorder) {
				recorder.stop();
				recorder.clear();
				config.onEvent(MSG_STOP, 'Stopped recording');
			}
			if (ws) {
				ws.close();
				ws = null;
			}
			config.onCancel();
		}

		// Sets the URL of the speech server
		this.setServer = function(server) {
			config.server = server;
			config.onEvent(MSG_SERVER_CHANGED, 'Server changed: ' + server);
		}

		// Sets the URL of the speech server status server
		this.setServerStatus = function(serverStatus) {
			config.serverStatus = serverStatus;

			if (config.onServerStatus) {
				monitorServerStatus();
			}

			config.onEvent(MSG_SERVER_CHANGED, 'Server status server changed: ' + serverStatus);
		}

		// Sends reference text to speech server
		this.submitReference = function submitReference(text, successCallback, errorCallback) {
			var headers = {}
			if (config["user_id"]) {
				headers["User-Id"] = config["user_id"]
			}
			if (config["content_id"]) {
				headers["Content-Id"] = config["content_id"]
			}
			$.ajax({
				url: config.referenceHandler,
				type: "POST",
				headers: headers,
				data: text,
				dataType: "text",
				success: successCallback,
				error: errorCallback,
			});
		}

		// Private methods
		function startUserMedia(stream) {
			var input = audioContext.createMediaStreamSource(stream);
			config.onEvent(MSG_MEDIA_STREAM_CREATED, 'Media stream created');

			// make the analyser available in window context
			window.userSpeechAnalyser = audioContext.createAnalyser();
			window.userSpeechAnalyser.fftSize = 32;
			window.userSpeechAnalyser.minDecibels = -100;
			window.userSpeechAnalyser.maxDecibels = -10;
			window.userSpeechAnalyser.smoothingTimeConstant = 0.3;
			input.connect(window.userSpeechAnalyser);

			config.rafCallback();
			CONTENT_TYPE = "content-type=audio/x-raw,+layout=(string)interleaved,+rate=(int)" + input.context.sampleRate + ",+format=(string)S16LE,+channels=(int)1";
			console.log("[PARAMS] " + CONTENT_TYPE);
			recorder = new Recorder(input, { workerPath : config.recorderWorkerPath, audioProcessor: config.audioProcessor});
			config.onEvent(MSG_INIT_RECORDER, 'Recorder initialized');
		}

		function socketSend(item) {
			if (ws) {
				var state = ws.readyState;
				if (state == 1) {
					// If item is an audio blob
					if (item instanceof Blob) {
						if (item.size > 0) {
							ws.send(item);
							config.onEvent(MSG_SEND, 'Send: blob: ' + item.type + ', ' + item.size);
						} else {
							config.onEvent(MSG_SEND_EMPTY, 'Send: blob: ' + item.type + ', EMPTY');
						}
					// Otherwise it's the EOS tag (string)
					} else {
						ws.send(item);
						config.onEvent(MSG_SEND_EOS, 'Send tag: ' + item);
					}
				} else {
					config.onError(ERR_NETWORK, 'WebSocket: readyState!=1: ' + state + ": failed to send: " + item);
				}
			} else {
				config.onError(ERR_CLIENT, 'No web socket connection: failed to send: ' + item);
			}
		}


		function createWebSocket() {
			// TODO: do we need to use a protocol?
			//var ws = new WebSocket("ws://127.0.0.1:8081", "echo-protocol");
			var url = config.server + '?' + config.contentType;
			if (config["user_id"]) {
				url += '&user-id=' + config["user_id"]
			}
			if (config["content_id"]) {
				url += '&content-id=' + config["content_id"]
			}
			var ws = new WebSocket(url);

			ws.onmessage = function(e) {
				var data = e.data;
				config.onEvent(MSG_WEB_SOCKET, data);
				if (data instanceof Object && ! (data instanceof Blob)) {
					config.onError(ERR_SERVER, 'WebSocket: onEvent: got Object that is not a Blob');
				} else if (data instanceof Blob) {
					config.onError(ERR_SERVER, 'WebSocket: got Blob');
				} else {
					var res = JSON.parse(data);
					if (res.status == 0 && 'result' in res) {
						if (res.result.final) {
							config.onResults(res.result.hypotheses, res.segment);
						} else {
							config.onPartialResults(res.result.hypotheses, res.segment);
						}
					} else {
						config.onError(ERR_SERVER, 'Server error: ' + res.status + ': ' + getDescription(res.status), res.status);
					}
				}
			}

			// Start recording only if the socket becomes open
			ws.onopen = function(e) {
				intervalKey = setInterval(function() {
					recorder.export16kMono(function(blob) {
						// console.log("[DEBUG] " + blob.size);
						socketSend(blob);
						audioLength = audioLength + blob.size / 32000;
						// recorder.clear();
					}, 'audio/x-raw');
				}, config.interval);
				// Start recording
				recorder.record();
				config.onReadyForSpeech();
				config.onEvent(MSG_WEB_SOCKET_OPEN, e);
			};

			// This can happen if the blob was too big
			// E.g. "Frame size of 65580 bytes exceeds maximum accepted frame size"
			// Status codes
			// http://tools.ietf.org/html/rfc6455#section-7.4.1
			// 1005:
			// 1006:
			ws.onclose = function(e) {
				var code = e.code;
				var reason = e.reason;
				var wasClean = e.wasClean;
				// The server closes the connection (only?)
				// when its endpointer triggers.
				config.onEndOfSession();
				config.onEvent(MSG_WEB_SOCKET_CLOSE, e.code + "/" + e.reason + "/" + e.wasClean);
			};

			ws.onerror = function(e) {
				var data = e.data;
				config.onError(ERR_NETWORK, data);
			}

			return ws;
		}


		function monitorServerStatus() {
			if (wsServerStatus) {
				wsServerStatus.close();
			}
			wsServerStatus = new WebSocket(config.serverStatus);
			wsServerStatus.onmessage = function(evt) {
				config.onServerStatus(JSON.parse(evt.data));
			};
		}


		function getDescription(code) {
			if (code in SERVER_STATUS_CODE) {
				return SERVER_STATUS_CODE[code];
			}
			return "Unknown error";
		}
	};

	// Simple class for persisting the transcription.
	// If isFinal==true then a new line is started in the transcription list
	// (which only keeps the final transcriptions).
	var Transcription = function(cfg) {
		var index = 0;
		var list = [];

		this.add = function(text, isFinal) {
			list[index] = text;
			if (isFinal) {
				index++;
			}
		}

		this.toString = function() {
			return list.join('. ');
		}
	}

	window.Dictate = Dictate;
	window.Transcription = Transcription;

})(window);
