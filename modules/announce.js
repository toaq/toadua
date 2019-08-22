// modules/announce.js
// send a prepared rich content message to a Discord webhook

"use strict";
const commons = require('./../core/commons.js')(__filename);
module.exports = {state_change, message, entry};

const   request = require('request-promise-native'),
  color_convert = require('color-convert'),
            api = commons.require('./api.js');

function author_color(name) {
  if(name === 'official')
    return 0x333333;
  var n = 0;
  for(var i = 0, l = name.length; i < l; ++i)
    n = (((n << 5) - n) + name.charCodeAt(i)) % 360;
  return Number.parseInt(color_convert.hsl.hex(n, 100, 30), 16);
}

function entry(ev, entry, note) {
  let action = (() => {
    switch(ev) {
      case 'create':
      case 'remove':
        return `${ev}d`;
      case 'note':
        return 'noted on';
    }
  })();
  message({
          color: author_color((note && note.user) || entry.user),
          title: `*${(note && note.user) || entry.user}* ${action
                  } **${entry.head}**`,
         fields: (note && [{ name: `(definition by *${entry.user}*)`,
                       value: entry.body}]) || undefined,
    description: note ? note.content : entry.body,
            url: ev === 'remove' ? undefined
                 : `${commons.config().entry_point}#%23${entry.id}`
  })
}

function message(what) {
  let url;
  if(!enabled || !(url = options.hook)) return;
  let color = what.color || 0,
       epnt = what.url || commons.config().entry_point;
  let req = {url, method: 'POST', json: true,
             body: {embeds: [{color, url: epnt, ...what}]}};
  if(queue.push(req) === 1)
    setTimeout(send_off, 0);
}

function send_off() {
  if(!queue.length) return;
  let m = queue[0];
  request(m).then(() => {
    console.log(`-> '${m.body.embeds[0].title}' announced`);
    queue.shift();
    setTimeout(send_off, 0);
  }, err => {
    if(err.statusCode === 429)
      setTimeout(send_off, err.error.retryAfter);
    else {
      console.log(`-> error when posting message: ${err.stack}`);
      setTimeout(send_off, 0);
    }
  });
}

var enabled, options, queue = [];
function state_change() {
  if(enabled !== (options = this || {}).enabled)
    for(let ev of ['create', 'note', 'remove'])
      commons.emitter[options.enabled ? 'on' : 'off'](ev, entry);
  enabled = options.enabled;
}
