// modules/housekeep.js
// tamper with the database store

"use strict";
const commons = require('./../core/commons.js')(__filename);
let {store, config} = commons;
module.exports = {state_change};

const search = commons.require('./search.js');

let first_go = true;
function state_change() {
  if(!first_go) return;
  first_go = false;

  // moving away from an earlier, indexed format
  if(!(store.db.entries instanceof Array))
    store.db.entries = Object.entries(store.db.entries)
      .map(([id, e]) => ({id, ...e}));

  store.db.entries.forEach(_ => {
    _.score = search.score(_);
    if(_.by) {
      _.user = _.by;
      delete _.by;
    }
    if(_.on) {
      _.date = _.on;
      delete _.on;
    }
    _.notes.forEach(n => {
      if(n.on) {
        n.date = n.on;
        delete n.on;
      }
      if(n.by) {
        n.user = n.by;
        delete n.by;
      }
    });
  });

  store.db.count = store.db.entries.length;

  let now = +new Date;
  // this is to fix a nasty bug from earlier (sorry!)
  if(store.pass.tokens instanceof Array)
    store.pass.tokens = Object.fromEntries(store.pass.tokens);

  for(let [k, {last}] of Object.entries(store.pass.tokens))
    if(now > last + config().token_expiry)
      delete store.pass.tokens[k];

  search.recache();
}
