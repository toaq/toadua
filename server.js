#!/usr/bin/env node
const fs = require('fs'),
    http = require('http'),
      lo = require('lodash'),
     api = require('./backend.js'),
      hk = require('./housekeeping.js');
require('object.fromentries').shim();

const REQUEST_BODY_SIZE_LIMIT = 1024;

const fourohfour = static('404.html', 'text/html'),
  routes = {
  '/':          static('index.html',  'text/html'),
  '/style.css': static('style.css',   'text/css'),
  '/main.js':   static('frontend.js', 'application/javascript'),
  '/vue.js':    static('vue-production.js', 'application/javascript'),
  '/api':       api_handler
};

function api_handler(r, s, u) {
  let flip = (code, message) => {
    s.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
    s.write(message);
    s.end();
  };
  if(r.method === 'POST') {
    let body = '';
    r.on('data', data => {
      body += data;
      if(body.length > REQUEST_BODY_SIZE_LIMIT) {
        body = undefined;
        flip(413 /* Payload Too Large */, 'The request was too large.');
        r.connection.destroy();
      }
    });
    r.on('end', () => {
      let json;
      try {
        json = JSON.parse(body);
      } catch(e) {
        flip(400 /* Bad Request */, 'The request body could not be parsed as JSON.');
      }
      let resp = api(json);
      s.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      s.write(JSON.stringify(resp));
      s.end();
    });
  } else {
    flip(s, 405 /* Method Not Allowed */, 'Expecting a POST request.');
  }
}

function static(fname, mime) {
  // // This line implies that the files Toadua uses are stored (cached)
  // // in the memory. Which is great.
  // let f = fs.readFileSync(fname);
  return (r, s) => {
    let f = fs.readFileSync(fname);
    s.writeHead(200, {
      'content-type': `${mime}; charset=utf-8`
    });
    s.write(f);
    s.end();
  };
}

function handler(r, s) {
  let url = new URL(r.url, 'https://uakci.pl');
  let handler = routes.hasOwnProperty(url.pathname) ?
    routes[url.pathname] : fourohfour;
  handler(r, s, url);
}

let server = http.createServer(handler);
server.listen(59138);
process.stderr.write('Server started!\n');
let sync_int;
hk.sync(api).then(() => {
  sync_int = setInterval(() => hk.sync(api), 3 * 60 * 1000);
});
let backup_int    = setInterval(() => hk.backup(api),            1 * 60 * 1000);
let obsoleted_int = setInterval(() => hk.remove_obsoleted(api), 10 * 60 * 1000);

function bye() {
  process.stderr.write('Trying to exit gracefully\n')
  clearInterval(sync_int); clearInterval(backup_int); clearInterval(obsoleted_int);
  server.close();
  api.db.write();
  api.pass.write();
  process.exitCode = 0;
}
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
