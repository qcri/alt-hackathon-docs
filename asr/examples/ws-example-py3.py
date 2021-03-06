__author__ = 'tanel'

import argparse
from ws4py.client.threadedclient import WebSocketClient
import time
import threading
import sys
import urllib
from queue import Queue
import json
import time
import os

def rate_limited(maxPerSecond):
    minInterval = 1.0 / float(maxPerSecond)
    def decorate(func):
        lastTimeCalled = [0.0]
        def rate_limited_function(*args,**kargs):
            elapsed = time.clock() - lastTimeCalled[0]
            leftToWait = minInterval - elapsed
            if leftToWait>0:
                time.sleep(leftToWait)
            ret = func(*args,**kargs)
            lastTimeCalled[0] = time.clock()
            return ret
        return rate_limited_function
    return decorate


class MyClient(WebSocketClient):

    def __init__(self, filename, url, protocols=None, extensions=None, heartbeat_freq=None, byterate=32000,
                 save_adaptation_state_filename=None, send_adaptation_state_filename=None, print_partial=False):
        super(MyClient, self).__init__(url, protocols, extensions, heartbeat_freq)
        self.final_hyps = []
        self.fn = filename
        self.byterate = byterate
        self.final_hyp_queue = Queue()
        self.save_adaptation_state_filename = save_adaptation_state_filename
        self.send_adaptation_state_filename = send_adaptation_state_filename
        self.print_partial = print_partial

    @rate_limited(4)
    def send_data(self, data):
        self.send(data, binary=True)

    def opened(self):
        #print "Socket opened!"
        def send_data_to_ws():
            f = open(self.fn, "rb")
            if self.send_adaptation_state_filename is not None:
                print("Sending adaptation state from %s" % self.send_adaptation_state_filename, file=sys.stderr)
                try:
                    adaptation_state_props = json.load(open(self.send_adaptation_state_filename, "r"))
                    self.send(json.dumps(dict(adaptation_state=adaptation_state_props)))
                except:
                    e = sys.exc_info()[0]
                    print("Failed to send adaptation state: ",  e, file=sys.stderr)
            for block in iter(lambda: f.read(self.byterate//4), ""):
                self.send_data(block)
            print("Audio sent, now sending EOS", file=sys.stderr)
            self.send("EOS")

        t = threading.Thread(target=send_data_to_ws)
        t.start()


    def received_message(self, m):
        response = json.loads(str(m))
        #print("RESPONSE:", response, file=sys.stderr)
        #print("JSON was:", m, file=sys.stderr)
        if response['status'] == 0:
            if 'result' in response:
                trans = response['result']['hypotheses'][0]['transcript']
                if response['result']['final']:
                    #print(trans,, file=sys.stderr)
                    self.final_hyps.append(trans)
                    print('[FINAL] %s' % trans.replace("\n", "\\n"), file=sys.stderr)
                elif self.print_partial:
                    print_trans = trans.replace("\n", "\\n")
                    if len(print_trans) > 80:
                        print_trans = "... %s" % print_trans[-76:]
                    print('[PARTIAL] %s' % print_trans, file=sys.stderr)
            if 'adaptation_state' in response:
                if self.save_adaptation_state_filename:
                    print("Saving adaptation state to %s" % self.save_adaptation_state_filename, file=sys.stderr)
                    with open(self.save_adaptation_state_filename, "w") as f:
                        f.write(json.dumps(response['adaptation_state']))
        else:
            print("Received error from server (status %d)" % response['status'], file=sys.stderr)
            if 'message' in response:
                print("Error message:",  response['message'], file=sys.stderr)


    def get_full_hyp(self, timeout=60):
        return self.final_hyp_queue.get(timeout)

    def closed(self, code, reason=None):
        #print "Websocket closed() called"
        #print(       self.final_hyp_queue.put(" ".join(self.final_hyps)), file=sys.stderr)
        self.final_hyp_queue.put(" ".join(self.final_hyps))

def main():

    parser = argparse.ArgumentParser(description='Command line client for kaldigstserver')
    parser.add_argument('-u', '--uri', default="ws://qcri-alt-asr-ar.northeurope.cloudapp.azure.com:8888/client/ws/speech", dest="uri", help="Server websocket URI")
    parser.add_argument('-r', '--rate', default=32000, dest="rate", type=int, help="Rate in bytes/sec at which audio should be sent to the server. NB! For raw 16-bit audio it must be 2*samplerate!")
    parser.add_argument('--save-adaptation-state', help="Save adaptation state to file")
    parser.add_argument('--send-adaptation-state', help="Send adaptation state from file")
    parser.add_argument('--content-type', default='', help="Use the specified content type (empty by default, for raw files the default is  audio/x-raw, layout=(string)interleaved, rate=(int)<rate>, format=(string)S16LE, channels=(int)1")
    parser.add_argument('--print-partial', dest='print_partial', action="store_true", help="Print partial outputs")
    parser.add_argument('audiofile', help="Audio file to be sent to the server")
    args = parser.parse_args()

    content_type = args.content_type
    if content_type == '' and (args.audiofile.endswith(".raw") or args.audiofile.endswith(".wav")):
        content_type = "audio/x-raw, layout=(string)interleaved, rate=(int)%d, format=(string)S16LE, channels=(int)1" %(args.rate/2)

    ws = MyClient(args.audiofile, args.uri + '?%s' % (urllib.parse.urlencode([("content-type", content_type)])), byterate=args.rate,
                  save_adaptation_state_filename=args.save_adaptation_state, send_adaptation_state_filename=args.send_adaptation_state, print_partial=args.print_partial)
    ws.connect()
    result = ws.get_full_hyp()
    print(result.encode('utf-8'))

if __name__ == "__main__":
    main()

