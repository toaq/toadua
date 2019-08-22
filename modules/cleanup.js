// modules/cleanup.js
// remove unwanted entries that satisfy certain criteria

"use strict";
const commons = require('./../core/commons.js')(__filename);
module.exports = {state_change, remove_obsoleted};

const api = commons.require('./api.js');

function remove_obsoleted(_, {score, user, id, head}, voter) {
  if(!options) return;
  let {users, vote_threshold} = options;
  if((users && !users.includes(user))
   || score > vote_threshold
  )// || user == voter)
    return;
  api({action: 'remove', id},
    () => console.log(`-- ${head} weeded out`), user);
}

var options = {};
function state_change() {
  if(options.enabled !== (options = (this || {})).enabled) {
    commons.emitter[options.enabled ? 'on' : 'off']('vote',
                                                    remove_obsoleted);
  }
}
