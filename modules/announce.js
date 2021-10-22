// modules/announce.js
// send a prepared rich content message to a Discord webhook

"use strict";
const commons = require('./../core/commons.js')(__filename);
module.exports = {state_change, message, entry};

const request = require('request-promise-native'),
       shared = require('./../shared/shared.js'),
          api = commons.require('./api.js');

function entry(ev, entry, note) {
  let action = (() => {
    switch(ev) {
      case 'create':
      case 'remove':
        return `${ev}d`;
      case 'note':
        return 'noted on';
      default:
        return null;
    }
  })();
  if(!action) message(entry);
  message({
          color: shared.color_for((note && note.user) || entry.user).hex,
          title: `*${(note && note.user) || entry.user}* ${action} **${entry.head}**${
            ev == 'note' || entry.scope === 'en' ? '' : `in scope ${entry.scope}`}`,
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
  let m = queue.pop();
  request(m).then(() => {
    console.log(`-> '${m.body.embeds[0].title}' announced`);
    setTimeout(send_off, 0);
  }, err => {
    queue.push(m);
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
  if(!enabled) queue.splice(0, queue.length);
}
