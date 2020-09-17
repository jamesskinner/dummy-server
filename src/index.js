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


const DUM_SERVER_PORT = process.env.DUM_SERVER_PORT || 5000
const DUM_SERVER_NAME = process.env.DUM_SERVER_NAME || 'dummy-server'
const DUM_SERVER_HTTP_VERSION = process.env.DUM_SERVER_HTTP_VERSION || '1'
const DUM_SERVER_HTTPS = process.env.DUM_SERVER_HTTPS == 'true'
const DUM_EXT_HTTP1 = process.env.DUM_EXT_HTTP1 || ''
const DUM_EXT_HTTP2 = process.env.DUM_EXT_HTTP2 || ''

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

const server = DUM_SERVER_HTTP_VERSION == '2' ? listenHttp2() : listenHttp1()

if(DUM_EXT_HTTP1){
  log('[HTTP1 CLIENT]', `calling http1 service in interval: ${DUM_EXT_HTTP1}`)
  setInterval(() => {
    log('[HTTP1 CLIENT]', 'calling http1 service', DUM_EXT_HTTP1)
    callHttp1Service()
      .then(data => log('[HTTP1 CLIENT]', 'got http1 response', data))
      .catch(err => {
        log('[HTTP1 CLIENT]', 'error calling http1 service');
        console.error(err)
      })
  }, 7000)
}
if(DUM_EXT_HTTP2){
  log('[HTTP2 CLIENT]', `calling http2 service in interval: ${DUM_EXT_HTTP2}`)
  setInterval(() => {
    log('[HTTP2 CLIENT]', 'calling http2 service', DUM_EXT_HTTP2)
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

  const server = DUM_SERVER_HTTPS? https.createServer(httpsOptions, handler) : http.createServer(handler);
  server.on('error', err => log('[HTTP1 SERVER]', err))
  server.listen(DUM_SERVER_PORT);

  log('[HTTP1 SERVER]', `HTTP1 (${DUM_SERVER_HTTPS?'https':'non-https'}) Server listening on port ${DUM_SERVER_PORT}`)
}

function listenHttp2(){
  const server = DUM_SERVER_HTTPS? http2.createSecureServer(httpsOptions): http2.createServer()

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
  server.listen(DUM_SERVER_PORT);

  log('[HTTP2 SERVER]', `HTTP2 (${DUM_SERVER_HTTPS?'https':'non-https'}) Server listening on port ${DUM_SERVER_PORT}`)
}

async function callHttp1Service(){

  const httpLib = DUM_EXT_HTTP1.startsWith('https') ? https : http

  return new Promise((resolve, reject) => {

    const req = httpLib.get(DUM_EXT_HTTP1, (res) => {
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
      client = http2.connect(DUM_EXT_HTTP2);
    } catch(e){
      return reject(e)
    }

    const buffer = Buffer.from(JSON.stringify({
      serviceName: DUM_SERVER_NAME,
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
