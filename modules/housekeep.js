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
  const reform = (e, p, f) => {
    let normalized = f(e[p]);
    let retval = normalized !== e[p];
    e[p] = normalized;
    return retval;
  };
  for(let entry of store.db.entries) {
    // update to modern Toaq
    let didReform = reform(entry, 'head', shared.normalize);
    if(entry.scope === 'toa')
      didReform += reform(entry, 'body', shared.normalize);

    const normalizePlaceholders = s => s.replace(/___|◌/g, '▯');
    didReform += reform(entry, 'body', normalizePlaceholders);
    for(let note of entry.notes)
      didReform += reform(note, 'content', normalizePlaceholders);

    if(didReform) reformed++;
  }
  if(reformed) console.log(`reformed ${reformed} entries`);

  search.recache();
}
