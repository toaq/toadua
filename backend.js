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
    let buf = fs.readFileSync(this.source);
    let o;
    try {
      o = JSON.parse(buf.toString());
    } catch(e) {
      try {
        o = msgpack.decode(buf);
      } catch(e) {
        process.stderr.write(`\u001b[1;91mNote: setting the default value for ${this.source} because of a reading/parsing failure\u001b[0m\n`);
        o = this.defaultValue;
      }
    } 
    return o;
  }
  write(data) {
    fs.writeFileSync(this.source, msgpack.encode(data));
  }
}

const db = lowdb(new OurAdapter('dict.db'),     {defaultValue: {entries: {}, count: 0}}),
    pass = lowdb(new OurAdapter('accounts.db'), {defaultValue: {hashes: {}, tokens: {}});

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
const PATTERNS = [
  [/^(?:#|id:)([0-9A-Za-z-_]{6,})$/, (_, id)   => e => e.id === id],
  [/^(?:@|user:)([A-Za-z]{1,16})$/,  (_, user) => e => e.by === user]
];

actions.search = guard(false, {query: checks.present}, (i, uname) => {
  let query = i.query.toString().split(' ').filter(_ => _);
  // TODO: this is another performance bottleneck, since it loads the whole database
  // …*on every search*. oh no
  let entries = Object.entries(db.get('entries').value())
    .map(_ => ({ ..._[1], id: _[0], score: score(_[1].comments) }));
  // each term of the query gets mapped to a filtering function
  let conds = query.map(term => {
    for([pat, fun] of PATTERNS) {
      let m = term.match(pat);
      if(m) return fun(...m);
    }
    return e =>
      // TODO: this might be a *huge* performance bottleneck
      // if run for 6000-odd entries…
      ['', e.head, e.body, ...e.comments.map(_ => _.content), ''].join(' ')
        .indexOf(` ${term} `) !== -1; // naïve search; might fail
          // on the other hand, live regex construction isn't great either
          // maybe a state machine? TODO
  });
  let filtered = conds.reduce((sofar, cond) => sofar.filter(cond), entries);
  let sorted = lo(filtered).sortBy([
    e =>
      + levenshtein(curry, deburr(e.head))
      - 6 * (e.by == 'official')
      - 2 * (e.score || 0)
      + Math.exp((new Date() - new Date(e.on)) / (-1000 * 3600 * 24 * 7))
  ]);
  return good({data: sorted.value()});
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
  announce({
    color: author_color(uname),
    title: `*${uname}* removed **${entry.head}**`,
    description: entry.body.replace(/___/g, '\u25af')
  });
  db.set('count', db.get('count').value() - 1).write();
});

Object.freeze(actions);
