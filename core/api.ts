// api.ts
// implementation for the API

"use strict";
import {deburr, config, store, emitter} from "./commons";
import * as search from "./search";
import * as shared from "../frontend/shared";
import * as shortid from "shortid";
import * as uuid from "uuid";
import * as bcrypt from "bcryptjs";

// `uname` is used to override the user – a kind of sudo mode
export function call(i, ret, uname?: string) {
  let time = +new Date;
  ret = ret instanceof Function ? ret : (() => {});
  let action = actions.hasOwnProperty(i.action) && actions[i.action];
  if(!action) {
    console.log(`%% action '${i.action}' unknown`);
    return ret(flip('unknown action'));
  }
  if(!uname && i.token) {
    let token = store.pass.tokens[i.token];
    if(token) {
      uname = token.name;
      let now = +new Date;
      if(now > token.last + config().token_expiry) {
        delete store.pass.tokens[i.token];
        ret = (old_ret => data => {
          if(data && !data.success &&
             data.error === 'must be logged in')
            old_ret(flip('token has expired'));
          else old_ret(data);
        })(ret);
      } else store.pass.tokens[i.token].last = now;
    }
  }
  let entries = Object.entries(i).filter(([k, v]) =>
      Object.keys({...(action.checks || {}), uname: uname})
        .includes(k) && k !== 'pass')
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
  console.log(`%% ${i.action}(${entries})`);
  try {
    ret = (old_ret => data => {
      console.log(`${i.action} returned in ${Date.now() - time} ms`);
      old_ret(data);
    })(ret);
    action(ret, i, uname);
  } catch(e) {
    console.log(`an error occurred: ${e.stack}`);
    ret(flip('internal error'));
  }
}

if(!store.db)   store.db   = {entries: [], count: 0};
if(!store.pass) store.pass = { hashes: {}, tokens: {}};

let actions: any = {};

const flip = (e: string) => ({success: false, error: e});
const good = (d?: any) => ({success: true,  ...d});

function guard(logged_in, conds: Record<string, (x: any) => any>, f) {
  let res: any = (ret, i, uname) => {
    if(logged_in && ! uname)
      return ret(flip('must be logged in'));
    if(conds) for(let [k, v] of Object.entries(conds)) {
      let err = v(i[k]);
      if(err !== true)
        return ret(flip(`invalid field '${k}'${
          err === false ? '' : `: ${err}`}`));
    }
    f(ret, i, uname);
  };
  res.checks = conds;
  return res;
}

const checks: Record<string, (i: any) => any> = {
  present: i => !!i || 'absent',
    scope: i => !(i && typeof i === 'string')
                  ? 'scope is not string'
                  : !!i.match(/^[a-z-]{1,24}$/)
                    || 'scope must match [a-z-]{1,24}',
   number: i => (i && typeof i === 'number') || 'not a valid number',
     uuid: i => /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/
                  .test(i) || 'not a valid token UUID',
  shortid: i => (i && shortid.isValid(i)) || 'not a valid ID',
   goodid: i => (checks.shortid(i) && (index_of(i) !== -1)) ||
                  'not a recognised ID',
    limit: lim => i => (!i || typeof i !== 'string') ? 'absent' :
                         (i.length <= lim ||
                          `too long (max. ${lim} characters)`),
};
checks.nobomb = checks.limit(2048);
checks.optional = f => s => !s || f(s);

export function index_of(id) {
  return store.db.entries.findIndex(_ => _.id == id);
}

export function by_id(id) {
  return store.db.entries[index_of(id)];
}

function present(e, uname) {
  return {...e, votes: undefined, vote: uname ? e.votes[uname] || 0
                                              : undefined};
}

actions.welcome = guard(false, {},
  (ret, i, uname) => ret(good({name: uname})));

actions.search = guard(false, {
  query: checks.present,
  ordering: checks.optional(checks.nobomb),
  preferred_scope: checks.optional(checks.scope),
  preferred_scope_bias: checks.optional(checks.number),
},
(ret, i, uname) => {
  let data = search.search(i, uname);
  if(typeof data === 'string') ret(flip(data));
  else                         ret(good({results: data}));
});

actions.vote = guard(true, {
  id: checks.goodid, vote: _ => [-1, 0, 1].includes(_)
}, (ret, i, uname) => {
  let e = by_id(i.id);
  let old_vote = e.votes[uname] || 0;
  e.votes[uname] = i.vote;
  e.score += i.vote - old_vote;
  ret(good({entry: present(e, uname)}));
  emitter.emit('vote', e, uname);
});

actions.note = guard(true, {
  id: checks.goodid, content: checks.nobomb
}, (ret, i, uname) => {
  let word = by_id(i.id);
  let this_note = {
    date: new Date().toISOString(),
    user: uname,
    content: replacements(i.content)
  };
  word.notes.push(this_note);
  ret(good({entry: present(word, uname)}));
  emitter.emit('note', word, this_note);
});

export const replacements =
  s => s.replace(/___/g, '▯')
    .replace(/\s+$/g, '')
    .normalize('NFC');

actions.create = guard(true, {
  head: checks.nobomb, body: checks.nobomb, scope: checks.scope
}, (ret, i, uname) => {
  let id = shortid.generate();
  let this_entry = {
    id,
    date: new Date().toISOString(),
    head: shared.normalize(i.head),
    body: replacements(i.body),
    user: uname,
    scope: i.scope,
    notes: [],
    votes: {},
    score: 0
  };
  store.db.entries.push(this_entry);
  store.db.count++;
  ret(good({entry: present(this_entry, uname)}));
  emitter.emit('create', this_entry);
});

actions.login = guard(false, {
  name: checks.present, pass: checks.present
}, (ret, i) => {
  let expected = store.pass.hashes[i.name];
  if(!expected) return ret(flip('user not registered'));
  if(bcrypt.compareSync(i.pass, expected)) {
    var token = uuid.v4();
    store.pass.tokens[token] = {name: i.name, last: +new Date};
    ret(good({token}));
  } else ret(flip('password doesn\'t match'));
});

actions.register = guard(false, {
  name: it => (it.match(/^[a-zA-Z]{1,64}$/) && true)
              || 'name must be 1-64 Latin characters',
  pass: checks.limit(128)
}, (ret, i) => {
  if(store.pass.hashes[i.name])
    return ret(flip('already registered'));
  store.pass.hashes[i.name] = bcrypt.hashSync(i.pass,
                                config().password_rounds);
  actions.login(ret, {name: i.name, pass: i.pass});
});

actions.logout = guard(true, {}, (ret, i, uname) => {
  delete store.pass.tokens[i.token];
  ret(good());
});

actions.remove = guard(true, {
  id: checks.goodid
}, (ret, i, uname) => {
  let index = index_of(i.id);
  let entry = store.db.entries[index];
  if(entry.user !== uname)
    return ret(flip('you are not the owner of this entry'));
  store.db.entries.splice(index, 1);
  ret(good());
  store.db.count--;
  emitter.emit('remove', entry);
});
