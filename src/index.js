const http2 = require('http2');
const http = require('http');
const https = require('https');
const fs = require('fs');

const {
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_CONTENT_LENGTH
} = http2.constants;


const PORT = process.env.PORT || 5000
const SERVICE_NAME = process.env.SERVICE_NAME || 'http2poc'
const CALL_HTTP1_SERVICE = process.env.CALL_HTTP1_SERVICE || false
const CALL_HTTP2_SERVICE = process.env.CALL_HTTP2_SERVICE || false
const HTTP1_SERVICE_URL = process.env.HTTP1_SERVICE_URL || `http://localhost:${PORT}`
const HTTP2_SERVICE_URL = process.env.HTTP2_SERVICE_URL || `http://localhost:${PORT}`
const LISTEN_HTTP2 = (process.env.LISTEN_HTTP2 == 'true')
const HTTPS_ENABLED = process.env.HTTPS_ENABLED == 'true'

const httpsOptions = {
  key: fs.readFileSync('data/key.pem'),
  cert: fs.readFileSync('data/cert.pem')
};

function t(){
  return (new Date()).toISOString()
}
function log(...msg){
  console.log(t(), ...msg)
}

const server = LISTEN_HTTP2 ? listenHttp2() : listenHttp1()

if(CALL_HTTP1_SERVICE){
  log('[HTTP1 CLIENT]', `calling http1 service in interval: ${HTTP1_SERVICE_URL}`)
  setInterval(() => {
    log('[HTTP1 CLIENT]', 'calling http1 service', HTTP1_SERVICE_URL)
    callHttp1Service()
      .then(data => log('[HTTP1 CLIENT]', 'got http1 response', data))
      .catch(err => {
        log('[HTTP1 CLIENT]', 'error calling http1 service');
        console.error(err)
      })
  }, 7000)
}
if(CALL_HTTP2_SERVICE){
  log('[HTTP2 CLIENT]', `calling http2 service in interval: ${HTTP2_SERVICE_URL}`)
  setInterval(() => {
    log('[HTTP2 CLIENT]', 'calling http2 service', HTTP2_SERVICE_URL)
    callHttp2Service()
      .then(data => log('[HTTP2 CLIENT]', 'got http2 response', data))
      .catch(err => {
        log('[HTTP2 CLIENT]', 'error calling http2 service');
        console.error(err)
      })
  }, 5000)
}

function listenHttp1(){
  const handler = (req, res) => {

    log('[HTTP1 SERVER]', 'Recieved request')
    log('[HTTP1 SERVER]', JSON.stringify({
      headers: req.headers,
      method: req.method,
      url: req.url,
    },null, 2))
    res.writeHead(200,{ 'content-type' : 'application/json' })

    const end = () => { res.end(JSON.stringify({ datetime: (new Date()).toISOString()})) }
    if (req.method == 'POST') {
      var body = ''
      req.on('data', (data) => {
        body += data
      })
      req.on('end', () => {
        log('[HTTP1 SERVER]', 'POST request body', body)
        end()
      })
    } else { end() }


  };

  const server = HTTPS_ENABLED? https.createServer(httpsOptions, handler) : http.createServer(handler);
  server.on('error', err => log('[HTTP1 SERVER]', err))
  server.listen(PORT);

  log('[HTTP1 SERVER]', `HTTP1 (${HTTPS_ENABLED?'https':'non-https'}) Server listening on port ${PORT}`)
}

function listenHttp2(){
  const server = http2.createServer()
  server.on('error', (err) => console.error(err));

  server.on('stream', (stream, headers) => {
    log('[HTTP2 SERVER]', 'Recieved request', headers)
    // stream is a Duplex
    stream.respond({
      [HTTP2_HEADER_STATUS]: 200,
      [HTTP2_HEADER_CONTENT_TYPE]: 'application/json charset=utf-8'
    });
    const end = () => { stream.end(JSON.stringify({ datetime: (new Date()).toISOString()})) }

    const contentLength = headers[HTTP2_HEADER_CONTENT_LENGTH]
    if(contentLength){
      let data = ''
      stream.on('data', chunk => {
        data += chunk
        if(data >= contentLength){
          log('[HTTP2 SERVER]', 'Request body', data)
          end()
        }
      })
    } else {
      end()
    }
  });
  server.listen(PORT);

  log('[HTTP2 SERVER]', `HTTP2 Server listening on port ${PORT}`)
}

async function callHttp1Service(){

  const httpLib = HTTP1_SERVICE_URL.startsWith('https') ? https : http

  return new Promise((resolve, reject) => {

    const req = httpLib.get(HTTP1_SERVICE_URL, (res) => {
      log('[HTTP1 CLIENT]', `http1 response statusCode: ${res.statusCode}`)

      res.on('data', d => resolve(d.toString()))
    })

    req.on('error', (error) => {
      reject(error)
    })
  })
}

async function callHttp2Service(){
  return new Promise((resolve, reject) => {
    let client
    try {
      client = http2.connect(HTTP2_SERVICE_URL);
    } catch(e){
      return reject(e)
    }

    const buffer = Buffer.from(JSON.stringify({
      serviceName: SERVICE_NAME,
      datetime: (new Date()).toISOString()
    }));

    const req = client.request({
      // [http2.constants.HTTP2_HEADER_SCHEME]: "https",
      [http2.constants.HTTP2_HEADER_SCHEME]: "http",
      [http2.constants.HTTP2_HEADER_METHOD]: http2.constants.HTTP2_METHOD_POST,
      [http2.constants.HTTP2_HEADER_PATH]: `/`,
      "Content-Type": "application/json",
      "Content-Length": buffer.length,
    });

    req.setEncoding('utf8');
    let data = [];
    req.on('data', (chunk) => {
      data.push(chunk);
    });
    req.write(buffer);
    req.end();
    req.on('end', () => {
      resolve(data.join());
    });
    req.on('error', reject)
  })
}
