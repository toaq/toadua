// modules/housekeep.js
// tamper with the database store

"use strict";
const commons = require('./../core/commons.js')(__filename);
let {store, config} = commons;
module.exports = {state_change};

const search = commons.require('./search.js');
const shared = require('../shared/shared.js');

let first_go = true;
function state_change() {
  if(!first_go) return;
  first_go = false;

  store.db.count = store.db.entries.length;

  let now = +new Date;
  for(let [k, {last}] of Object.entries(store.pass.tokens))
    if(now > last + config().token_expiry)
      delete store.pass.tokens[k];

  let reformed = 0;
  const reform = (e, p) => {
    let normalized = shared.normalize(e[p]);
    let retval = normalized !== e[p];
    e[p] = normalized;
    return retval;
  };
  for(let entry of store.db.entries) {
    let didReform = reform(entry, 'head');
    if(entry.scope === 'toa')
      didReform = reform(entry, 'body') || didReform;
    if(didReform) reformed++;
  }
  if(reformed) console.log(`reformed ${reformed} entries`);

  search.recache();
}
