module.exports = call;

const   shortid = require('shortid'),
         uuidv4 = require('uuid/v4'),
         bcrypt = require('bcryptjs'),
    levenshtein = require('js-levenshtein'),
             fs = require('fs');
             lo = require('lodash'),
          lowdb = require('lowdb'),
        msgpack = require('what-the-pack').initialize(2 ** 24 /* = 16 MiB */),
          https = require('https'),
  color_convert = require('color-convert'),
       announce = require('./announce.js');

require('object.fromentries').shim();

const ROUND_NO = 8;
const deburr = s => s.normalize('NFD').replace(/\u0131/g, 'i').replace(/[\u0300-\u030f]/g, '').replace(/[^0-9A-Za-z_-]+/g, ' ').toLowerCase();

const BaseAdapter = require('lowdb/adapters/Base');
class OurAdapter extends BaseAdapter {
  read() {
    let buf;
    try {
      buf = fs.readFileSync(this.source);
    } catch(e) {
      process.stderr.write(`\u001b[1;91mNote: setting the default value for ${this.source} because of a file read failure\u001b[0m\n`);
      this.write(this.defaultValue);
      return this.defaultValue;
    }
    let o;
    try {
      o = JSON.parse(buf.toString());
    } catch(e) {
      o = msgpack.decode(buf);
    }
    return o;
  }
  write(data) {
    fs.writeFileSync(this.source, msgpack.encode(data));
  }
}

const db = lowdb(new OurAdapter(    'dict.db', {defaultValue: {entries: {}, count: 0}})),
    pass = lowdb(new OurAdapter('accounts.db', {defaultValue: {hashes: {}, tokens: {}}}));

call.db = db;
call.pass = pass;
call.call = call;
call.replacements = replacements;

let actions = {};

const flip = e => ({success: false, error: e});
const good = d => ({...d, success: true});

function present(entry, id, uname) {
  let e = {...entry, id};
  if(uname) e.vote = e.votes[uname] || 0;
  delete e.votes; delete e._head; delete e._content;
  return e;
}

function guard(logged_in, conds, f) {
  return (i, uname) => {
    if(logged_in && ! uname)
      return flip('must be logged in');
    if(conds) for([k, v] of Object.entries(conds)) {
      let err = v(i[k]);
      if(err !== true)
        return flip(`error for field ${k}: ${err}`);
    }
    return f(i, uname);
  };
}
const checks = {
  present: i => !!i || 'absent',
  shortid: i => i && shortid.isValid(i) || 'not a valid ID',
    limit: lim => i => !i ? 'absent' :
    (i.length <= lim || `too long (max. ${lim} characters)`),
};
checks.nobomb = checks.limit(2048);

function author_color(name) {
  if(name === 'official')
    return 0x333333;
  var n = 0;
  for(var i = 0, l = name.length; i < l; ++i)
    n = (((n << 5) - n) + name.charCodeAt(i)) % 360;
  return Number.parseInt(color_convert.hsl.hex(n, 100, 30), 16);
}

function call(i, admin) {
  let action = actions.hasOwnProperty(i.action) && actions[i.action];
  if(! action) return flip('unknown action');
  let uname = admin || pass.get('tokens').get(i.token).value();
  try {
    let res = action(i, uname);
    return res || good();
  } catch(e) {
    process.stderr.write(e.stack + '\n');
    return flip('internal error');
  }
}

actions.whoami = guard(false, {}, (i, uname) => {
  return good({
    data: uname || '',
    count: db.get('count').value()
  });
});

// not using a dictionary because it would mangle the RegExp objects
// the second returned element of each entry – if it's an array – is
// the heaviness, i.e., how little time it takes to run the function
// on an entry multiplied by how far the function narrows down the
// search
const PATTERNS = [
  [/\|/, (_, __, s) => {
    let handlers = s.split('|').map(parse_term);
    let f = e => handlers.some(h => h(e));
    f.heaviness = handlers.reduce((o, _) => Math.max(_.heaviness, o), -Infinity) + 1;
    return f;
  }],
  [/^!(.*?)$/, (_, s) => {
    let h = parse_term(s);
    let f = e => ! h(e);
    f.heaviness = h.heaviness + 1;
    return f;
  }],
  [/[#@\/]/, (_, __, s) => {
    let handlers = s.split(/(?=[#@\/])/).map(part =>
      part.replace(/^[#@\/]/, s => ({ '#': 'id:', '@': 'user:', '/': 'arity:' }[s])))
      .map(parse_term);
    let f = e => handlers.every(h => h(e));
    f.heaviness = handlers.reduce((o, _) => _.heaviness + o, 1);
    return f;
  }],
  [/^(?:id:)([0-9A-Za-z-_]{6,})$/, (_, id)   => [e => e.id === id, -Infinity]],
  [/^(?:user:)([A-Za-z]{1,16})$/,  (_, user) => [e => e.by === user, 0]],
  [/^(?:arity:)([0-9]+)$/, (_, nstr) => {
    let n = parseInt(nstr, 10);
    let f = e => e.body.split(/[;.]/).map(_ => {
      let matches = _.match(/▯/g);
      return matches ? matches.length : -1;
    }).reduce((a, b) => // this is confusing
      Math.max(a, b), -1) == n;
    f.heaviness = 5;
    return f;
  }],
];

const whatever = e => true;
whatever.heaviness = Infinity;
function parse_term(term) {
  for([pat, fun] of PATTERNS) {
    let m = term.match(pat);
    if(m) {
      let f = fun(...m, m.index, m.input);
      if(f instanceof Array) {
        f[0].heaviness = f[1];
        f = f[0];
      }
      return f;
    }
  }
  let deburred = deburr(term);
  if(! deburred.length) return whatever;
  let deft = e => e._content.indexOf(deburred) !== -1;
  deft.heaviness = 255;
  deft.bare = deburred;
  return deft;
}

let entry_cache;
actions.search = guard(false, {query: checks.present}, (i, uname) => {
  let start = +new Date;
  let query = i.query.toString().split(' ').filter(_ => _);
  // each term of the query gets mapped to a filtering function
  let conds = lo(query.map(parse_term).filter(_ => _ != whatever))
    .sortBy('.heaviness').value();
  let bare_terms = conds.map(_ => _.bare).filter(_ => _);
  let filtered = conds.reduce((sofar, cond) => sofar.filter(cond), entry_cache);
  let sorted = lo(filtered).sortBy([
    e =>
      - 6 * bare_terms.some(_ => e._content.indexOf(` ${_} `) != -1)
      - 6 * bare_terms.some(_ => e._head.indexOf(_) != -1)
      + 1 * bare_terms.reduce((_, term) => _ + 
        (e._head.indexOf(term) != -1) * levenshtein(term, e._head), 0)
      - 8 * (e.by == 'official') // the stigma is real
      - 2 * e.score
      + 4 * (['oldofficial', 'oldexamples', 'oldcountries'].includes(e.by))
      + Math.exp((new Date() - new Date(e.on)) / (-1000 * 3600 * 24 * 7))
  ]);
  let data = sorted.value().map(_ => present(_, _.id, uname));
  process.stderr.write(`\u001b[37mapi.search:\u001b[0m query «\u001b[32m${
    i.query}\u001b[0m» took \u001b[1m${new Date - start}\u001b[0m ms\n`);
  return good({data});
});

actions.info = guard(false, {id: checks.shortid}, (i, uname) => {
  let res = db.get('entries').get(i.id).value();
  if(res) return good({data: present(res, i.id, uname)});
  else return flip('not found');
});

// TODO: messy code
actions.vote = guard(true, {
  id: checks.shortid, vote: _ => [-1, 0, 1].includes(_)
}, (i, uname) => {
  let e = db.get('entries').get(i.id);
  if(!e) return flip('not found');
  let ec = entry_cache.find(_ => _.id == i.id);
  let old_vote = e.get('votes').get(uname).value() || 0;
  e.get('votes').set(uname, i.vote).write();
  ec.votes[uname] = i.vote;
  e.set('score', e.get('score').value() + i.vote - old_vote).write();
  ec.score += i.vote - old_vote;
});

actions.comment = guard(true, {
  id: checks.shortid, content: checks.nobomb
}, (i, uname) => {
  let word = db.get('entries').get(i.id);
  if(word.value() == undefined)
    return flip('word doesn\'t exist');
  let this_comment = {
    on: new Date().toISOString(),
    content: replacements(i.content),
    by: uname
  };
  word.get('comments')
    .push(this_comment)
    .write();
  // Don't do this! The objects are semi-shallow copies! (for some reason)
  // entry_cache.find(_ => _.id == i.id).comments.push(this_comment);
  word = word.value();
  announce({
    color: author_color(uname),
    fields: [{
      name: `(definition by *${word.by}*)`,
      value: word.body
    }],
    title: `*${uname}* commented on **${word.head}**`,
    description: this_comment.content,
    url: `http://uakci.pl/toadua/#%23${i.id}`
  });
  return good();
});

function replacements(s) {
  return s.replace(/___/g, '▯').replace(/[\n\r]+/g, '').normalize('NFC');
}

actions.create = guard(true, {
  head: checks.nobomb, body: checks.nobomb,
}, (i, uname) => {
  let id = shortid.generate();
  let this_entry = {
    on: new Date().toISOString(),
    head: replacements(i.head), body: replacements(i.body),
    by: uname,
    comments: [],
    votes: {},
    score: 0
  };
  db.get('entries').set(id, this_entry).write();
  entry_cache.push({...this_entry, id});
  announce({
    color: author_color(uname),
    title: `*${uname}* created **${i.head}**`,
    description: i.body.replace(/___/g, '\u25af'),
    url: `http://uakci.pl/toadua/#%23${id}`
  });
  db.set('count', Object.entries(db.get('entries').value()).length).write();
  return good({data: id});
});

actions.login = guard(false, {
  name: checks.present, pass: checks.present
}, (i) => {
  let expected = pass.get('hashes').get(i.name).value();
  if(!expected) return flip('user not registered');
  if(bcrypt.compareSync(i.pass, expected)) {
    var token = uuidv4();
    pass.get('tokens')
      .set(token, i.name)
      .write();
    return good({ token: token, name: i.name });
  } else return flip('password doesn\'t match');
});

actions.register = guard(false, {
  name: it => (it.match(/^[a-zA-Z]{1,64}$/) && true) || 'name must be 1-64 Latin characters',
  pass: checks.limit(128)
}, (i) => {
  if(pass.get('hashes').get(i.name).value())
    return flip('already registered');
  pass.get('hashes')
    .set(i.name, bcrypt.hashSync(i.pass, ROUND_NO))
    .write();
  let entry = pass.get('hashes').get(i.name).value();
  if(! entry) return flip('couldn\'t complete registration');
  let token = uuidv4();
  pass.get('tokens')
    .set(token, i.name)
    .write();
  return good({ token, name: i.name });
});

actions.logout = guard(true, {}, (i, uname) => {
  pass.get('tokens')
    .unset(i.token)
    .write();
});

actions.remove = guard(true, {
  id: checks.shortid
}, (i, uname) => {
  let entry = db.get('entries').get(i.id).value();
  if(entry.by != uname)
    return flip('you are not the owner of this entry');
  if(entry.score > 0)
    return flip('this entry has a positive amount of votes');
  db.get('entries').unset(i.id).write();
  entry_cache.splice(entry_cache.findIndex(_ => _.id == i.id), 1);
  announce({
    color: author_color(uname),
    title: `*${uname}* removed **${entry.head}**`,
    description: entry.body.replace(/___/g, '\u25af')
  });
  db.set('count', db.get('count').value() - 1).write();
});

Object.freeze(actions);

entry_cache = Object.entries(db.get('entries').value())
  .map(([id, e]) => ({...e, id, _head: deburr(e.head),
      _content: deburr(` ${e.head} ${e.body} ${
        e.comments.map(_ => _.content).join(' ')} `)}));
