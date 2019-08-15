// transaction.js
// Perform a load/save transaction on the disk.

const  fs = require('fs'),
  msgpack = require('what-the-pack').initialize(2 ** 24); // 16 MiB

function read(fname, deft) {
  let buf;
  try {
    buf = fs.readFileSync(fname);
  } catch(e) {
    process.stderr.write('\u001b[1;91mNote: setting the default ' +
      `value for ${this.source} because of a file read failure` +
      '\u001b[0m\n');
    write(fname, deft);
    return deft;
  }
  let o;
  try {
    o = JSON.parse(buf.toString());
  } catch(e) {
    o = msgpack.decode(buf);
  }
  return o;
}

function write_(fname, data) {
  let backup = fname + '~',
      encoded = msgpack.encode(data),
      success = false,
      size;
  for(let _ = 0; _ < 3; ++_) {
    try {
      fs.writeFileSync(backup, encoded);
      size = fs.statSync(backup).size;
    } catch(e) {
      process.stderr.write(
        `error when saving to backup ${backup}: ${e.stack}\n`);
      continue;
    }
    let expected = encoded.length;
    if(size != expected) {
      process.stderr.write(
        `${backup} got ${size}b while content has ${expected}\n`);
      continue;
    }
    success = true;
    break;
  }
  if(!success) {
    process.stderr.write(
      `giving up write to ${fname} after 3 failed attempts\n`);
    return false;
  }
  try {
    fs.renameSync(backup, fname);
  } catch(e) {
    process.stderr.write(
      `error when saving to real ${fname}: ${e.stack}\n`);
    return false;
  }
  process.stderr.write(`successfully wrote ${size}b to ${fname}\n`);
  return true;
}

let using = {};

function write(fname, data) {
  if(using[fname]) process.stderr.write(
    `warning: something is already writing to ${fname}`);
  using[fname] = true;
  let res;
  try {
    res = write_(fname, data);
  } catch(e) {
    process.stderr.write(
      `unexpected error when handling write: ${e.stack}\n`);
    res = false;
  }
  delete using[fname];
  return res;
}

module.exports = {read, write, using};
