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
const deburr = s => s.normalize('NFD').replace(/\u0131/g, 'i').replace(/[^0-9a-zA-Z.?! \n]/g, '').toLowerCase();

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

const db = lowdb(new OurAdapter('dict.db',     {defaultValue: {entries: {}, count: 0}})),
    pass = lowdb(new OurAdapter('accounts.db', {defaultValue: {hashes: {}, tokens: {}}}));

call.db = db;
call.pass = pass;
call.call = call;
call.replacements = replacements;

let actions = {};

const flip = e => ({success: false, error: e});
const good = d => ({...d, success: true});

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

const plus = /\+1/;
const minus = /[-–—\u2212]1/;
function score(comments) {
  let p = comments.filter(c => c.content.match(plus)).length,
      m = comments.filter(c => c.content.match(minus)).length;
  return p - m;
}

// not using a dictionary because it would mangle the RegExp objects
// the second returned element of each entry is the heaviness, i.e.,
// how little time it takes to run the function on an entry multiplied by
// how far the function narrows down the search
const PATTERNS = [
  [/\|/, (_, __, s) => {
    let handlers = s.split('|').map(_ => parse_term(_));
    let f = e => handlers.some(h => h(e));
    f.heaviness = handlers.reduce((o, _) => _.heaviness + o, 1);
    return f;
  }],
  [/^!(.*?)$/, (_, s) => {
    let h = parse_term(s);
    let f = e => ! h(e);
    f.heaviness = h.heaviness + 1;
    return f;
  }],
  [/^(?:#|id:)([0-9A-Za-z-_]{6,})$/, (_, id)   => [e => e.id === id,   0]],
  [/^(?:@|user:)([A-Za-z]{1,16})$/,  (_, user) => [e => e.by === user, 0]]
];

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
  let deft = e => deburr(e.head).indexOf(deburred) !== -1 || deburr(
      ['', e.head, e.body, ...e.comments.map(_ => _.content), ''].join(' ')).indexOf(` ${deburred} `) !== -1;
  deft.heaviness = 255;
  deft.bare = deburred;
  return deft;
}

let entry_cache;
let entry_cache_clean = false;
actions.search = guard(false, {query: checks.present}, (i, uname) => {
  let start = +new Date;
  let query = i.query.toString().split(' ').filter(_ => _);
  if(! entry_cache_clean) {
    entry_cache = Object.entries(db.get('entries').value())
      .map(([id, e]) => ({ ...e, id, score: score(e.comments) }));
    entry_cache_clean = true;
  }
  // each term of the query gets mapped to a filtering function
  let conds = lo(query.map(parse_term)).sortBy('.heaviness').value();
  let bare_terms = conds.map(_ => _.bare).filter(_ => _);
  let filtered = conds.reduce((sofar, cond) => sofar.filter(cond), entry_cache);
  let sorted = lo(filtered).sortBy([
    e =>
      + bare_terms.reduce((_, term) => _ + levenshtein(term, deburr(e.head)), 0)
      - 8 * (e.by == 'official') // the stigma is real
      - 2 * (e.score || 0)
      + 4 * (['oldofficial', 'oldexamples', 'oldcountries'].includes(e.by))
      + Math.exp((new Date() - new Date(e.on)) / (-1000 * 3600 * 24 * 7))
  ]);
  let data = sorted.value();
  process.stderr.write(`\u001b[37mapi.search:\u001b[0m query «\u001b[32m${
    i.query}\u001b[0m» took \u001b[1m${new Date - start}\u001b[0m ms\n`);
  return good({data});
});

actions.info = guard(false, {id: checks.shortid}, (i) => {
  let res = db.get('entries').get(i.id).value();
  if(res) return good({data: {...res, id: i.id}});
  else return flip('not found');
});

/* TODO?
actions.vote = guard(true, {id: checks.shortid}, (i) => {
  db.get('entries')
    .find({ id: i.id })
    .get('votes')
    .push(uname)
    .write();
});
*/

actions.comment = guard(true, {
  id: checks.shortid, content: checks.nobomb
}, (i, uname) => {
  let word = db.get('entries').get(i.id);
  let this_comment = {
    on: new Date().toISOString(),
    content: replacements(i.content),
    by: uname
  };
  word.get('comments')
    .push(this_comment)
    .write();
  entry_cache_clean = false;
  word = word.value();
  announce({
    color: author_color(uname),
    fields: [{
      name: `(definition by *${word.by}*)`,
      value: word.body
    }],
    title: `*${uname}* commented on **${word.head}**`,
    description: this_comment.content,
    url: `http://uakci.pl/toadua/#${i.id}`
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
    comments: []
  };
  db.get('entries').set(id, this_entry).write();
  entry_cache_clean = false;
  announce({
    color: author_color(uname),
    title: `*${uname}* created **${i.head}**`,
    description: i.body.replace(/___/g, '\u25af'),
    url: `http://uakci.pl/toadua/#${id}`
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
  entry.score = score(entry.comments);
  if(entry.score > 0)
    return flip('this entry has a positive amount of votes');
  db.get('entries').unset(i.id).write();
  entry_cache_clean = false;
  announce({
    color: author_color(uname),
    title: `*${uname}* removed **${entry.head}**`,
    description: entry.body.replace(/___/g, '\u25af')
  });
  db.set('count', db.get('count').value() - 1).write();
});

Object.freeze(actions);
