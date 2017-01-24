#!/usr/bin/python

## Simple adapter that reads a file with text, and translates each
# line using our MT backend. The script can handle files where each
# line is preceeded by a marker such as an index (using the -m flag)
# 
# <marker> <text>
# <marker> <text>
# 
# The language pair is given using the -l flag. If no input/output
# files are provided, stdin/stdout are assumed respectively.
# 
# Author: Fahim Dalvi

import argparse
import codecs
import os
import requests
import urllib
import sys

BASE_URL = "https://mt.qcri.org/api/v1/"

# Help Strings
PROG_DESCRIPTION = "Translate each line from the input file from arabic to english"
INPUT_HELP = "Path to the input file | Default: stdin"
OUTPUT_HELP = "Path to the output file | Default: stdout"
SERVER_HELP = "Server URL where the MT API is hosted"
API_HELP = "API key to use for the rest services"
MARKER_HELP = "Flag to indicate if each line starts with a marker"
LANG_HELP = "Language pair to use. `en-ar` and `ar-en` supported."
DOMAIN_HELP = "Domain to select appropriate translation model."
VERBOSE_HELP = "Print progress and first few characters every 10 requests"
SKIP_HELP = "Skip the first n lines in the source file"

def parse_args():
    parser = argparse.ArgumentParser(description=PROG_DESCRIPTION)
    parser.add_argument('-i','--input', help=INPUT_HELP)
    parser.add_argument('-o','--output', help=OUTPUT_HELP)
    parser.add_argument('-s','--server', default=BASE_URL, help=SERVER_HELP)
    parser.add_argument('-k','--apikey', required='true', help=API_HELP)
    parser.add_argument('-m','--marker', action='store_true', help=MARKER_HELP)
    parser.add_argument('-l','--lang', default="ar-en", help=LANG_HELP)
    parser.add_argument('-d','--domain', default="general-fast", help=DOMAIN_HELP)
    parser.add_argument('-v','--verbose', action='store_true', help=VERBOSE_HELP)
    parser.add_argument('-n','--skip', default=0, type=int, help=SKIP_HELP)

    return parser.parse_args()

def translate(text, base_url, apikey, langpair, domain):
    apikey = "key=" + apikey
    langpair = "langpair=" + langpair
    domain = "domain=" + domain
    text = "text=" + urllib.quote(unicode(text).encode('utf-8'), safe='~()*!.\'')
    
    url = base_url + "translate?" + apikey \
                    + "&" + langpair \
                    + "&" +  domain \
                    + "&" + text

    res = requests.get(url)

    assert(res.status_code == 200)
    return res.json()["translatedText"]

def main():
    args = parse_args()

    if args.input:
        infile = codecs.open(args.input, encoding='utf-8')
    else:
        infile = codecs.getreader('utf-8')(sys.stdin)

    if args.output:
        outfile = codecs.open(args.output, 'a', encoding='utf-8')
    else:
        outfile = codecs.getwriter('utf-8')(sys.stdout)

    if args.lang != "ar-en" and args.lang != "en-ar":
        print "Illegal language pair"
        sys.exit(1)

    line_idx = 1
    with infile as fp:
        for line in fp:
            if line_idx <= args.skip:
                line_idx += 1
                continue

            if args.verbose:
                if line_idx % 10 == 0:
                    print 'Translating line %d [%s]'%(line_idx, line[:20])

            if args.marker:
                source = line[line.find(' ')+1:].strip()
            else:
                source = line.strip()
            
            target = translate(source, args.server, args.apikey, args.lang, args.domain)

            if args.marker:
                outfile.write(line[:line.find(' ')+1] + target + '\n')
            else:
                outfile.write(target + '\n')
            line_idx += 1

        outfile.close()

if __name__ == '__main__':
    main()
