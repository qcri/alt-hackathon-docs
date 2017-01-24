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
