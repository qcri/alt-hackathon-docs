# Qatar Computing Research Institute
## Machine Translation API
QCRI's machine translation API allows translation from **Arabic to English** and **English to Arabic** using a _REST API_.

### Using the API

A simple call will enable you to get translations. The format of the API call (GET request) is as follows:

`https://mt.qcri.org/api/v1/translate?params`

`params` is defined as a combination of the following options:

- `langpair`: This is `ar-en` or `en-ar` depending on the direction of translation
- `domain`: Use `general-fast` for generic translations. For other models, see `Models` section below.
- `key`: This is the API key that you will need to use for translation. We have created an account for your already, use the following value for this parameter: `73878214d6fafe7fdcdff7408749ae21`
- `text`: The text you need to translate. All of the text **must** be [URI Encoded](http://www.w3schools.com/tags/ref_urlencode.asp). See examples section for further explanation.

Once the API call has been made, you will get back one of the following two responses:
```
{
    "success": true,
    "translatedText": "<translation>"
}
```

or

```
{
    "success": false,
    "error": "<error-message>"
}
```

Always check the `success` parameter of the result first to ensure the translation was successful.



### Examples
Here are some examples (feel free to click on the links to see the result for yourself)

- [Example 1: Arabic to English translation](https://mt.qcri.org/api/v1/translate?langpair=ar-en&domain=general-fast&key=73878214d6fafe7fdcdff7408749ae21&text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7)
	- ``` https://mt.qcri.org/api/v1/translate?langpair=ar-en&domain=general-fast&key=73878214d6fafe7fdcdff7408749ae21&text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7```
    - Here we translate `مرحبا` from Arabic to English
    - Note how the text is URI encoded, i.e. `مرحبا` → `%D9%85%D8%B1%D8%AD%D8%A8%D8%A7`

- [Example 2: English to Arabic translation](https://mt.qcri.org/api/v1/translate?langpair=en-ar&domain=general-fast&key=73878214d6fafe7fdcdff7408749ae21&text=Welcome%20team%21)
	- ``` https://mt.qcri.org/api/v1/translate?langpair=en-ar&domain=general-fast&key=73878214d6fafe7fdcdff7408749ae21&text=Welcome+team%21```
	- Here we translate `Welcome team!` from English to Arabic
	- Note that the text is URI encoded here, the english letters remain the same since the encoding of an English letter is the letter itself. However, the space and the exclamation mark have been encoded differently.
- Erroneous Examples
	- [Missing text](https://mt.qcri.org/api/v1/translate?langpair=en-ar&domain=general-fast&key=73878214d6fafe7fdcdff7408749ae21): `https://mt.qcri.org/api/v1/translate?langpair=en-ar&domain=general-fast&key=73878214d6fafe7fdcdff7408749ae21`
	- [Missing key](https://mt.qcri.org/api/v1/translate?langpair=en-ar&domain=general-fast): `https://mt.qcri.org/api/v1/translate?langpair=en-ar&domain=general-fast`
	- [Invalid Model](https://mt.qcri.org/api/v1/translate?langpair=en-ar&domain=test-model&key=73878214d6fafe7fdcdff7408749ae21&text=Welcome+team%21): `https://mt.qcri.org/api/v1/translate?langpair=en-ar&domain=test-model&key=73878214d6fafe7fdcdff7408749ae21&text=Welcome+team%21`

### Models
In the above examples, we have selected the `domain` to be `general-fast`. However, our API allows you to use various other models that may trade speed for quality. Below is a summary of all the models supported by our API.

| Translation Direction        | Domain           |  Speed <sup>1</sup> |  Notes |
| :--------------------------: |:---------------: | :---------:  | :---------|
| Arabic → English             | `general-fast`   |  24 tokens/s | This model has been pruned to give faster performance in real-time scenarios. The quality of the translation is lower as a tradeoff. Words unknown to the model are transliterated in the output. |
| Arabic → English             | `general-neural` |  10 tokens/s | This model is built using a deep neural network framework. It is currently in beta phase, but gives very fluent outputs. If the model does not know the meaning of certain words, it will try to guess or implictly ignore the word to make the output fluent. |
| Arabic → English             | `general`        |  10 tokens/s | This model is a heavy traditional model - and its quality is higher than the `general-fast` model. Words unknown to the model are transliterated in the output. |
| English → Arabic          | `general-fast`        |  15 tokens/s | This is a also a general model. It is also currently in beta phase. |

<sup>1</sup> These are average translation speeds, which will vary depending on the server load, network conditions etc. Use these numbers as a ballpark when selecting a model for translation.

### Notes and Advice
- If you are translating something that is static (e.g text labels for an app), its better to translate everything once instead of calling the API every time.
- Limit your sentence length to less than 50 words - the translation quality starts to deteriorate quickly since the sentences are not natural anymore
- If you have multiple sentences, send them as separate requests instead of combining them as one paragraph. This will give you a faster turn around time.
- Newlines are stripped before translation. It is also generally better to translate each line separately as mentioned earlier.
- Readymade code is available below in the `Code snippets` section, as well as in this repository under `mt/code/`. The `README` in the same folder describes what each file does.

### Code snippets
Here are some ready made functions that you can plugin to your code for translation:

#### Python
```python
from urllib import quote # Python 2
# Use `from urllib.parse import quote` for Python 3
import requests

def translate(text, apikey, langpair, domain, base_url='https://mt.qcri.org/api/v1/'):
    apikey = "key=" + apikey
    langpair = "langpair=" + langpair
    domain = "domain=" + domain
    
    # URI Encode text (text is assumed to be in unicode)
    text = "text=" + quote(text.encode('utf-8'), safe='~()*!.\'')
    
    # Construct URL
    url = base_url + "translate?" + apikey \
                    + "&" + langpair \
                    + "&" +  domain \
                    + "&" + text

	# Place the API call
    res = requests.get(url)

    assert(res.status_code == 200)
    assert(res.json()["success"] == True)
    return res.json()["translatedText"]
```

#### Javascript
```javascript
// callback is a function that takes two arguments (error, data)
// If the translation was successful, error will be null
var translate = function(text, apikey, langpair, domain, callback) {
	// URI Encode text
    var encoded_text = encodeURIComponent(text)
    
    // Construct URL
	var translate_url = "https://mt.qcri.org/api/v1/translate?text=" 
		+ encoded_text
		+ "&key=" + apikey
		+ "&domain=" + domain
		+ "&langpair=" + langpair;

	// Place the API call
	var oReq = new XMLHttpRequest();
    oReq.open("GET", translate_url, true);

	oReq.onload = function(oEvent) {
    	var response = JSON.parse(oReq.response);
    	if (response['success'] == false) {
        	return callback(response['error'], null);
        }
		return callback(null, response['translatedText']);
	};

	oReq.onerror = function(evt) {
		return callback(evt, null);
	};

	oReq.send();
}
```
