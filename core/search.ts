// search.ts
// perform searches of the database

"use strict";
import {deburr, deburrMatch, emitter, config, store} from "./commons";

// keep an own cache for entries
var cache = [];

const RE_TRAITS = ['id', 'user', 'scope', 'head', 'body', 'date'];
const empty_re_cache = () => Object.fromEntries(RE_TRAITS.map(trait => [trait, {}]));
var re_cache = empty_re_cache();

// compute a few fields for faster processing
export function cacheify(e) {
  let deburredHead = deburr(e.head);
  let deburredBody = deburr(e.body);
  let deburredNotes = e.notes.flatMap(({content}) => deburr(content));
  return {      $: e,
               id: e.id,
             head: deburredHead,
             body: deburredBody,
            notes: deburredNotes,
             date: +new Date(e.date),
            score: e.score,
          content: [].concat(deburredHead, deburredBody, deburredNotes)};
}

function cached_index(id) {
  return cache.findIndex(_ => _.id === id);
}

function cached_by_id(id) {
  return cache[cached_index(id)];
}

export function present(e, uname: string | undefined, relevance) {
  let original = {...e.$, relevance, content: e.content};
  original.vote = uname ? original.votes[uname] || 0 : undefined;
  delete original.votes;
  return original;
}

export function score(entry) {
  const votes: [string, number][] = Object.entries(entry.votes);
  return votes.reduce((a, b) => a + b[1], 0);
}

emitter.on('remove', (_, entry) =>
  cache.splice(cached_index(entry.id), 1));
emitter.on('create', (_, entry) =>
  cache.push(cacheify(entry)));
for(let k of ['vote', 'note'])
  emitter.on(k, (_, entry) =>
    cache.splice(cached_index(entry.id), 1,
      cacheify(entry)));

export function recache() {
  cache = store.db.entries.map(cacheify);
  re_cache = empty_re_cache();
}

let all_funcs = args => args.every(_ => _ instanceof Function),
   one_string = args => args.length === 1 &&
                          typeof args[0] === 'string';
const OTHER = 0, TEXTUAL = 1, FUNCTOR = 2;
let operations = search.operations = {
    and: { type: FUNCTOR,
          check: all_funcs,
          build: args => entry => {
                   for(let a of args)
                     if(!a(entry)) return false;
                   return true;
                 }},
     or: { type: FUNCTOR,
          check: all_funcs,
          build: args => entry => {
                   for(let a of args)
                     if(a(entry)) return true;
                   return false;
                 }},
    not: { type: FUNCTOR,
          check: args => args.length === 1 &&
                           args[0] instanceof Function,
          build: ([f]) => entry => !f(entry)},
  arity: { type: OTHER,
          check: args => args.length === 1 &&
                           typeof args[0] === 'number',
          build: ([n]) => entry =>
                   entry.$.body.split(/[;.]/).map(_ => {
                     let matches = _.match(/▯/g);
                     return matches ? matches.length : -1;
                   }).reduce(Math.max, -1) === n},
   term: { type: TEXTUAL,
          check: one_string,
          build: ([s]) => {
                   let deburred = deburr(s);
                   return entry => deburrMatch(deburred,
                                               entry.content,
                                               deburrMatch.CONTAINING)
                                     == deburred.length;
                 }}
};

for(let trait of RE_TRAITS) {
  operations[trait] = {
    type: OTHER,
    check: one_string,
    build: ([s]) => re_cache[trait][s] || (re_cache[trait][s] = make_re(trait, s)),
  };
  operations[`${trait}_raw`] = {
    type: OTHER,
    check: one_string,
    build: ([s]) => query => s === query.$[trait],
  };
}

const is_morphological = trait => ['head', 'body'].includes(trait);

function make_re(trait, s) {
  try {

    if(!(is_morphological(trait) ? /[?*CV]/
                                 : /[?*]/
        ).test(s)) throw null;

    s = s
      .replace(/[\[\]{}()+.\\^$|]/g, '\\$&')
      .replace(/\*+/g, '.*')
      .replace(/\?/g, '.')
      .replace(/i/g, '[ıi]');

    if(is_morphological(trait)) s = s
      .replace(/C/g, "(?:[bcdfghjklnprstz']|ch|sh|nh)")
      .replace(/V\\\+/g, 'V+').replace(/V/g, '[aeıiouy]');

    let regexp = new RegExp(`^${s}\$`, 'iu');
    return entry => regexp.test(entry.$[trait]);

  } catch(_) {
    return entry => s === entry.$[trait];
  }
}

// parse the query (an embedded array structure like below) into a
// function (entry => bool)
// ["and", ["term", "hi"],
//         ["or", ["not", ["scope", "en"]],
//                ["arity", 3],
//                ["user", "example"]]]
// for anybody asking: yes, this is basically a kind of Lisp
search.parse_query = parse_query;
function parse_query(query) {
  if(!(query instanceof Array))
    return 'found non-array branch';
  if(!query.length) return 'found empty array node';
  query = [...query];
  let op_name = query.shift();
  let op = Object.hasOwnProperty.call(operations, op_name) &&
    operations[op_name];
  if(!op) return `unknown operation ${op_name}`;
  let args;
  try {
    args = query.map(arg => {
      if(typeof arg !== 'object') return arg;
      let might_be_it = parse_query(arg);
      if(typeof might_be_it === 'string')
        throw might_be_it;
      return might_be_it;
    });
  } catch(e) {
    return e;
  }
  let check = op.check(args);
  if(check !== true) return check;
  return op.build(args);
}

search.bare_terms = bare_terms;
function bare_terms(o) {
  // `o` must be instanceof Array.
  let op = operations[o[0]];
  switch(op.type) {
    case TEXTUAL:
      return [o[1]];
    case FUNCTOR:
      return o.slice(1).map(bare_terms).flat();
    default:
      return [];
  }
}

function default_ordering(e, deburrs) {
  const official = e.$.user === 'official' ? 1 : 0;
  return Math.sqrt((1 + Math.max(0, e.score) + official) / (1 + Math.max(0, -e.score))) * (
    // full keyword match
    +  1 * +(deburrMatch(deburrs, e.notes, deburrMatch.CONTAINING) > 0)
    // header/body substring/superstring match
    +  3 * +(deburrMatch(deburrs, e.body, deburrMatch.CONTAINED) > 0)
    +  6 * +(deburrMatch(deburrs, e.head, deburrMatch.CONTAINED) > 0)
    + 10 * +(deburrMatch(deburrs, e.body, deburrMatch.CONTAINING) > 0)
    + 15 * +(deburrMatch(deburrs, e.head, deburrMatch.CONTAINING) > 0)
    // exact match.
    + 30 * +(deburrMatch(deburrs, e.body, deburrMatch.EXACT) > 0)
    // the number is very exact too, as you can see
    + 69.4201337 * +(deburrMatch(deburrs, e.head, deburrMatch.EXACT) == e.head.length)
  );
}

export function search(i, uname?: string) {
  let {query, ordering: requested_ordering,
       preferred_scope, preferred_scope_bias} = i;
  let filter = parse_query(query);
  if(typeof filter === 'string')
    return `malformed query: ${filter}`;
  let bares = bare_terms(query),
    deburrs = bares.map(deburr).flat();
  let filtered = cache.filter(filter);
  let ordering = default_ordering;
  switch(requested_ordering) {
    case 'newest':  ordering = e => +e.date;       break;
    case 'oldest':  ordering = e => -e.date;       break;
    case 'highest': ordering = e => +e.score;      break;
    case 'lowest':  ordering = e => -e.score;      break;
    case 'random':  ordering = e => Math.random(); break;
  }
  let sorted = filtered.map(e => [e, ordering(e, deburrs)
                                     + +(e.$.scope === preferred_scope)
                                       * (preferred_scope_bias || 0)])
                       .sort((e1, e2) => e2[1] - e1[1]);
  let presented = sorted.map(_ => present(_[0], uname, _[1]));
  return presented;
}
