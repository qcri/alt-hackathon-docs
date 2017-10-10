# Static Web App with recognition
This simple webapp uses `getUserMedia()` capabilities to record and send audio 
to our ASR servers, and in turn prints the transcriptions as received from the
server. The app is barebones - so it has nothing more implemented than 
absolutely necessary for the recognition to work.

## Notes
- The app uses (a modified version of) Dictate.js to record and send the 
audio to the server
- The `dictate.js` configuration in `index.js` has all the adjustable
parameters like:
	- Callback on partial results
	- Callback on final results
	- Callback on errors
	- Intialization methods for the recorder
- Press `Start Listening` to start the transcription
- Press `Stop Listening` to stop the transcription

## Caveats
- The demo only runs in browsers that support the `StreamAPI`, which is a 
reliable and standardized way to get Audio from the browser. Currently `Google 
Chrome`, `Mozilla Firefox` and the latest version of `Safari` support the API, while `IE` does not.
See [caniuse.com](http://caniuse.com/#search=getUserMedia) for support from 
various browsers.
- For security purposes, all of the browsers supporting the `StreamAPI` no more
allow the developers to transfer microphone data over regular HTTP streams. Only
secure TLS/HTTPS streams are allowed, which require us to have an HTTPS 
certificate for our domain. If you don't want to get an HTTPS certificate, you
can:
	- Run the server on `localhost`. Ideal for development, but not a practical
		choice when in actual use.
	- Create a tunnel from `localhost` to the machine running the server. For 
		instance, if the server is running on `lecturetranslation.alt.qcri.org`,
		we can use the command 
		`ssh -fN -L 8000:localhost:80 user@lecturetranslation.alt.qcri.org` to 
		create a tunnel from your machine, and then point the browser to 
		`localhost:8000` to make the browser think that the server is running on
		the local machine.