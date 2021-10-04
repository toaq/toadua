// search.js
// perform searches of the database

"use strict";
const {deburr, deburrMatch, emitter, config, store} =
  require('./commons.js')(__filename);

// keep an own cache for entries
var cache = [];

// compute a few fields for faster processing
search.cacheify = cacheify;
function cacheify(e) {
  let deburredHead = deburr(e.head);
  let deburredBody = deburr(e.body);
  let deburredNotes = e.notes.flatMap(({content}) => deburr(content));
  return {      $: e,
               id: e.id,
             head: deburredHead,
             body: deburredBody,
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

search.present = present;
function present(e, uname) {
  let original = {...e.$};
  original.vote = uname ? original.votes[uname] || 0 : undefined;
  delete original.votes;
  return original;
}

search.score = score;
function score(entry) {
  return Object.entries(entry.votes).reduce((a, b) => a + b[1], 0);
}

emitter.on('remove', (_, entry) =>
  cache.splice(cached_index(entry.id), 1));
emitter.on('create', (_, entry) =>
  cache.push(cacheify(entry)));
for(let k of ['vote', 'comment'])
  emitter.on(k, (_, entry) =>
    cache.splice(cached_index(entry.id), 1, 
      cacheify(entry)));

search.recache = recache;
function recache() {
  cache = store.db.entries.map(cacheify);
}

let all_funcs = args => args.every(_ => _ instanceof Function),
   one_string = args => args.length === 1 && 
                          typeof args[0] === 'string';
const OTHER = 0, TEXTUAL = 1, FUNCTOR = 2;
let operations = {
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
search.operations = operations;
for(let trait of ['id', 'user', 'scope', 'head', 'body', 'date'])
  operations[trait] = { type: OTHER,
                       check: one_string,
                       build: ([s]) => entry => entry.$[trait] === s};

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
  let rating = e.score + !!(e.$.user === 'official');
  // we like logistic curves
  let multiplier = 1 / (1 + Math.exp(-rating));
  let relevance =
    (  1
    // partial keyword match
    +  1 * deburrMatch(deburrs, e.content, deburrMatch.CONTAINING)
    // full keyword match
    +  2 * deburrMatch(deburrs, e.content, deburrMatch.EXACT)
    // header substring match
    +  4 * deburrMatch(deburrs, e.body, deburrMatch.CONTAINING)
    +  6 * deburrMatch(deburrs, e.body, deburrMatch.CONTAINED)
    + 10 * deburrMatch(deburrs, e.head, deburrMatch.CONTAINING)
    + 17 * deburrMatch(deburrs, e.head, deburrMatch.CONTAINED)
    // exact match. the number is very exact too, as you can see
    + 69.4201337 * (deburrMatch(deburrs, e.head, deburrMatch.EXACT) == deburrs.length)
  );
  return multiplier * relevance;
}

module.exports = search;
function search(query, requested_ordering, uname) {
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
  let sorted = filtered.map(e => [e, ordering(e, deburrs)])
                       .sort((e1, e2) => e2[1] - e1[1]);
  let presented = sorted.map(_ => present(_[0], uname));
  return presented;
}
