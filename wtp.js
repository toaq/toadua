#!/usr/bin/env node
// wtp.js
// write the contents of a MsgPack file to stdout

console.log(JSON.stringify(require('what-the-pack')
  .initialize(2 ** 20)
  .decode(require('fs').readFileSync(process.argv[2]))));
