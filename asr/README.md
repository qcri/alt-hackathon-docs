# ASR API

The Arabic ASR is hosted on Azure. It supports both streaming websocket API and a HTTP API.

## Streaming WebSocket API

### URI:
	ws://qcri-alt-asr-ar.northeurope.cloudapp.azure.com:8888/client/ws/speech
	wss://qcri-alt-asr-ar.northeurope.cloudapp.azure.com:8889/client/ws/speech
Chrome and other browser has enforced to use secured connection. You still can use `ws://` in app or scripts. But for websites, you will need to use `wss://`.


### Opening a session:

To open a session, connect to the specified server websocket address. The server assumes by default that incoming audio is sent using 16 kHz, mono, 16bit little-endian format. This can be overriden using the 'content-type' request parameter. The content type has to be specified using GStreamer 1.0 caps format, e.g. to send 44100 Hz mono 16-bit data, use: "audio/x-raw, layout=(string)interleaved, rate=(int)44100, format=(string)S16LE, channels=(int)1". This needs to be url-encoded of course, so the actual request is something like:

URI?content-type=audio/x-raw,+layout=(string)interleaved,+rate=(int)44100,+format=(string)S16LE,+channels=(int)1

### Sending Audio:
Speech should be sent to the server in raw blocks of data, using the encoding specified when session was opened. It is recommended that a new block is sent at least 4 times per second (less frequent blocks would increase the recognition lag). Blocks do not have to be of equal size.

After the last block of speech data, a special 3-byte ANSI-encoded string "EOS" ("end-of-stream") needs to be sent to the server. This tells the server that no more speech is coming and the recognition can be finalized.

After sending "EOS", client has to keep the websocket open to receive recognition results from the server. Server closes the connection itself when all recognition results have been sent to the client. No more audio can be sent via the same websocket after an "EOS" has been sent. In order to process a new audio stream, a new websocket connection has to be created by the client.

### Reading Results:

Server sends recognition results and other information to the client using the JSON format. The response can contain the following fields:

	status -- response status (integer), see codes below
	message -- (optional) status message
	result -- (optional) recognition result, containing the following fields:
	hypotheses - recognized words, a list with each item containing the following:
	transcript -- recognized words
	confidence -- (optional) confidence of the hypothesis (float, 0..1)
	final -- true when the hypothesis is final, i.e., doesn't change any more
The following status codes are currently in use:

	0 -- Success. Usually used when recognition results are sent
	2 -- Aborted. Recognition was aborted for some reason.
	1 -- No speech. Sent when the incoming audio contains a large portion of silence or non-speech.
	9 -- Not available. Used when all recognizer processes are currently in use and recognition cannot be performed.
Websocket is always closed by the server after sending a non-zero status update.

Examples of server responses:

	{"status": 9}
	{"status": 0, "result": {"hypotheses": [{"transcript": "see on"}], "final": false}}
	{"status": 0, "result": {"hypotheses": [{"transcript": "see on teine lause."}], "final": true}}
Server segments incoming audio on the fly. For each segment, many non-final hypotheses, followed by one final hypothesis are sent. Non-final hypotheses are used to present partial recognition hypotheses to the client. A sequence of non-final hypotheses is always followed by a final hypothesis for that segment. After sending a final hypothesis for a segment, server starts decoding the next segment, or closes the connection, if all audio sent by the client has been processed.

### Example:

cmuqhack2017/asr/examples/ws-example.py

## HTTP API

### URI:
 	http://qcri-alt-asr-ar.northeurope.cloudapp.azure.com:8888/client/dynamic/recognize

One can also use the server through a very simple HTTP-based API. This allows to simply send audio via a PUT or POST request to http://server:port/client/dynamic/recognize and read the JSON ouput. Note that the JSON output is differently structured than the output of the websocket-based API. This interface is compatible to the one implemented by http://github.com/alumae/ruby-pocketsphinx-server.

The HTTP API supports chunked transfer encoding which means that server can read and decode an audio stream before it is complete.

Example:

Send audio to server:

	curl  -T test/data/english_test.wav  "http://localhost:8888/client/dynamic/recognize"
Output:

	{"status": 0, "hypotheses": [{"utterance": "one two or three you fall five six seven eight. [noise]."}], "id": "7851281f-e187-4c24-9b58-4f3a5cba3dce"}
Send audio using chunked transfer encoding at an audio byte rate; you can see from the worker logs that decoding starts already when the first chunks have been received:

	curl -v -T test/data/english_test.raw -H "Content-Type: audio/x-raw-int; rate=16000" --header "Transfer-Encoding: chunked" --limit-rate 32000  "http://localhost:8888/client/dynamic/recognize"
Output (like before):

	{"status": 0, "hypotheses": [{"utterance": "one two or three you fall five six seven eight. yeah."}], "id": "4e4594ee-bdb2-401f-8114-41a541d89eb8"}

### Example:

```python
import requests

def main():
  import argparse

  parser = argparse.ArgumentParser('http request example')
  parser.add_argument('-u', '--uri', default='http://qcri-alt-asr-ar.northeurope.cloudapp.azure.com:8888/client/dynamic/recognize', help='server url')
  parser.add_argument('wav', help='wav file')
  args = parser.parse_args()

  f = open(args.wav, 'rb')
  files = {'file': (f.name, f, 'audio/x-wav')}

  r = requests.post(args.uri, files=files)
  print r.json()

if __name__ == '__main__':
  main()
  ```
