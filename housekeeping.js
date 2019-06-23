module.exports = {
  backup, sync, remove_obsoleted
};

const http = require('http'),
        fs = require('fs'),
        lo = require('lodash'),
  announce = require('./announce.js'),
   request = require('request-promise-native');

// Back the dictionary up (every midnight).
function backup(api) {
  // TODO: apply DRY
  try {
    fs.mkdirSync('backup');
  } catch(e) {
    if(e.code !== 'EEXIST') throw e; 
  }
  try {
    fs.writeFileSync(`backup/${new Date().toISOString().split('T')[0]}.json`,
      JSON.stringify(api.db), {flags: 'wx'});
  } catch(e) {
    if(e.code !== 'EEXIST') throw e; 
  }
}

const URLS = require('./URLS.json');
const PATTERNS = {
         a_examples: e => [[e[1], `(${e[0]}) ${e[2]}`]],
         b_examples: e => [[e[1], `(${e[0]}) ${e[2]}`]],
  official_examples: e => [[e[1], `${ e[0] } ${e[2]}`]],
          countries: e => [[e[1], `___ pertains to the culture of ${e[0]}.`],
                           [e[2], `___ is the country ${e[0]}.`],
                           [e[3], `___ is (one of) the language(s) spoken in ${e[0]}.`]]
}
const USERNAMES = {
         a_examples: 'examples',
         b_examples: 'examples',
  official_examples: 'official',
          countries: 'countries',
         dictionary: 'official'
}

function try_times(n, promise_maker) {
  if(n <= 0) throw new Error("I don't think I can try doing something less than once");
  return new Promise((yes, no) => {
    promise_maker()
      .then((...data) => { yes(...data); })
      .catch((...error) => {
        if(n === 1) no(...error);
        else try_times(n - 1, promise_maker);
      });
  });
}

function remove_obsoleted(api) {
  api.db.get('entries')
    .remove(_ => _.score < -3 &&
      ['oldofficial', 'oldexamples', 'oldcountries', 'spreadsheet'].includes(_.by))
    .write();
}

// Word list cache.
let word_lists = {};

// Add new:
//   - official entries,
//   - spreadsheet example entries and country names
// to the dictionary (every N minutes).
function sync(api) {
  return Promise.all(Object.entries(URLS).map(([resource, url]) => { 
    return try_times(3, () => request.get(url))
      .catch(err => console.log(`note: failed to get resource ${
        resource} because of error: ${err.stack}`))
      .then(data => {
        let word_list;
        if(resource == 'dictionary')
          // parse the HTML page
          word_list = data/*.toString()*/.split(/\r?\n/g)
            .filter(l => ! l.startsWith('<!DOCTYPE html>') && l.length > 3)
            .map(l => {
              let fields = l.replace(/10<sup>(.*?)<\/sup>/g, '10^$1')
                .replace(/<sup>(.*?)<\/sup>/g, ' ($1)')
                .split(/<[a-z<>\/'"=\ ]*?>(?!<)/)
              // .1 (type: .2, gloss: [.3]): definition .3/4
              return [fields[1],
                `${fields[2]}: ${fields[4].length > 3 ? `‘${fields[3]}’; ${fields[4]}` : fields[3]}`];
            });
        else {
          word_list = data/*.toString()*/.split(/\r?\n/g).slice(2)
            .map(_ => PATTERNS[resource](_.split('\t')))
            .filter(_ => _[0][0] /* head of first entry */)
            .flat();
        }
        if(lo.isEqual(new Set(word_list), new Set(word_lists[resource]))) {
          process.stderr.write(`resource ${resource} not changed – skipping\n`);
        } else {
          process.stderr.write(`\n\u001b[1mupdating resource ${resource}\u001b[0m\n`);
          let entries = api.db.get('entries').value();
          word_list.filter(a => ! Object.values(entries).some(
            b => api.replacements(a[0]) == b.head
              && api.replacements(a[1]) == b.body))
            .forEach(([head, body]) => {
              let res = api({ action: 'create', head, body }, USERNAMES[resource]);
              process.stderr.write(head);
              if(! res.success)
                if(res.error == 'this entry already exists')
                  process.stderr.write(' \u001b[90mexists;\u001b[0m ');
                else
                  process.stderr.write(` \u001b[91merror: ${res.error}\u001b;[0m `);
              else
                process.stderr.write(' \u001b[32madded;\u001b[0m ');
              return;
            });
          word_lists[resource] = word_list;
          process.stderr.write(`\n\u001b[1;92mresource ${resource} updated\u001b[0m\n`);
        }
      });
  })).then(_ => {
    process.stderr.write(`\n\u001b[1mobsoleting…\u001b[0m\n`);
    let authors = Object.values(USERNAMES);
    let everything = Object.values(word_lists).flat();
    api.db.get('entries').filter(_ => authors.includes(_.by))
      .forEach(e => {
        if(! everything.some(_ => api.replacements(_[0]) == e.head
                               && api.replacements(_[1]) == e.body)) {
          e.by = `old${e.by}`;
          process.stderr.write(`${e.head} \u001b[32mobsoleted;\u001b[0m `);
          announce({
            color: 0,
            title: `definition for **${e.head}** obsoleted`,
            description: e.body,
            url: `http://uakci.pl/toadua/#${e.id}`
          });
        }
      }).write();
    process.stderr.write(`\n\u001b[1;92mobsoleting finished\u001b[0m\n\n`);
  });
}
