#!/usr/bin/env npx ts-node
// server.ts
// the server, duh

"use strict";
console.log('-----------');

const   fs = require('fs'),
  argparse = require('argparse');
const argparser = new (argparse.ArgumentParser)({
  description: 'Toaq dictionary',
  add_help: true,
});
argparser.add_argument('-d', '--data-directory', {
  help: 'Directory containing config/ and data/ subdirectories',
  type: 'str',
});
argparser.add_argument('-p', '--port', {
  help: 'Bind port',
  type: 'int',
});
let args = argparser.parse_args();
let dir = args.data_directory ? fs.realpathSync(args.data_directory) : `${__dirname}/..`;
process.chdir(dir);
import * as commons from "./commons";

let config = commons.config;
const VERSION = require('./../package.json').version;

console.log(`starting up v${VERSION}...`);

const http = require('http'),
       api = require('./api.ts');

let fourohfour = static_handler('frontend/404.html',   'text/html', 404),
        routes =
  {'/api'        : api_handler,
   '/'           : static_handler('frontend/index.html',  'text/html'),
   '/style.css'  : static_handler('frontend/style.css',   'text/css'),
   '/frontend.js': static_handler('dist/bundle.js',       'application/javascript'),
   '/favicon.png': static_handler('frontend/favicon.png', 'image/png'),
   '/site.webmanifest':
                   static_handler('frontend/site.webmanifest', 'application/json'),
   '/.well-known/assetlinks.json':
                   static_handler('frontend/assetlinks.json', 'application/json'),
  };

function api_handler(r, s) {
  const flip = (code, message) => {
    s.writeHead(code, {'content-type': 'text/plain; charset=utf-8'})
     .write(message);
    s.end();
  };
  if(r.method === 'POST') {
    let body = '';
    r.on('data', data => {
      body += data;
      if(body.length > config().request_body_size_limit) {
        body = undefined;
        flip(413 /* Payload Too Large */,
             'The request was too large.');
        r.connection.destroy();
      }
    });
    r.on('end', () => {
      let json;
      try {
        json = JSON.parse(body);
      } catch(e) {
        flip(400 /* Bad Request */,
             'The request body could not be parsed as JSON.');
        return;
      }
      try {
        api(json, data => {
          data = {version: VERSION, ...data};
          s.writeHead(200,
            {'content-type': 'application/json; charset=utf-8'});
          s.end(JSON.stringify(data));
        });
      } catch(e) {
        console.log(`unexpected uncaught error: ${e.stack}`);
        flip(500 /* Internal Server Error */,
             'Unexpected error while processing request.');
        return;
      }
    });
  } else {
    flip(405 /* Method Not Allowed */, 'Expecting a POST request.');
  }
}

function static_handler(fn: string, mime: string, code?: number) {
  let fname = `${__dirname}/../${fn}`;
  code = code || 200;
  let f = fs.readFileSync(fname);
  let t = fs.statSync(fname).mtimeMs;
  return function static_handler(r, s) {
    let t_ = fs.statSync(fname).mtimeMs;
    if(t_ > t) {
      console.log(
        `file '${fname}' has been reloaded (${f.length}b; mtime ${t_} > ${t})`);
      f = fs.readFileSync(fname);
    }
    s.writeHead(code, {
      'content-type': `${mime}; charset=utf-8`
    }).write(f);
    s.end();
  };
}

function handler(r, s_) {
  let time = +new Date;
  let url = new URL(r.url, 'https://uakci.pl');
  let handler = routes.hasOwnProperty(url.pathname) ?
    routes[url.pathname] : fourohfour;
  let s = {
    writeHead(code, headers?) {
      if(code !== 200)
        console.log(`responding with code ${code} (${
                     http.STATUS_CODES[code]})`);
      s_.writeHead(code, headers);
      return this;
    },
    write(what) {
      let w = what instanceof Buffer ? what : Buffer.from(what);
      console.log(`sent off ${w.length}b`);
      return s_.write(w);
    },
    end(...args) {
      s_.end(...args);
      if(handler !== api_handler)
        console.log(`request handled in ${Date.now() - time} ms`);
    }
  };
  Object.setPrototypeOf(s, s_);
  let {address, port} = r.socket.address();
  console.log(`${r.url} ${address}:${port} -> ${handler.name}`);
  try {
    handler(r, s, url);
  } catch(e) {
    console.log(`error in ${handler.name}: ${e.stack}`);
    try {
      s.writeHead(500 /* Internal Server Error */).end();
    } catch(e) {
      console.log(`error while handling error. ignore and eat sock: ${e.stack}`);
    }
  }
}

let modules: Record<string, any> = {};
config_update(config());
config.on('update', config_update);

// this function should be idempotent
function config_update(data) {
  Object.entries(data.modules).forEach(([path, opts]) => {
    if(!modules[path]) {
      try {
        modules[path] = require(`./../${path}`);
        modules[path].path = path;
      } catch(e) {
        if(config().exit_on_module_load_error) throw e;
        console.log(`error when loading module '${path}': ${
          e.stack}`);
        delete modules[path];
      }
    }
  });
  for(let path in modules) {
    let new_options = data.modules[path];
    // note that when an entry in the module table is removed,
    // `new_options === undefined`. this is all right
    if(JSON.stringify(new_options) !== JSON.stringify(modules[path].options)) {
      modules[path].options = new_options;
      console.log(`changing state for module '${path}'`);
      try {
        modules[path].state_change.call(new_options);
      } catch(e) {
        console.log(`error for module '${path}': ${e.stack}`);
      }
    }
  }
}

var    server = http.createServer(handler),
  connections = [];

server.on('connection', conn => {
  connections.push(conn);
  conn.on('close', () => {
    connections.splice(connections.indexOf(conn), 0);
  });
});

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'uncaughtException'];
for(let s of SIGNALS) process.once(s, bye);

function bye(error) {
  if(error.stack) console.log(`uncaught exception: ${error.stack}`);
  else            console.log(`caught signal ${error}`);
  console.log(`trying to exit gracefully`);
  config.off('update', config_update);
  commons.clearAllIntervals();
  server.close();
  connections.forEach(_ => _.destroy());
  Object.entries(modules).reverse().forEach(([path, _]) => {
    try {
      _.state_change.call(null);
    } catch(e) {
      console.log(`ignoring state change error for module '${path
                   }': ${e.stack}`);
    }
  });
  process.exitCode = 0;
}

process.on('exit', code => console.log(`exiting with code ${code}`));

server.listen(config().port);
console.log(`server started on :${config().port}!`);
