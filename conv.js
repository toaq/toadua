const api = require('./backend.js');

const plus = /\+1/;
const minus = /[-–—\u2212]1/;

api.db.get('entries')
  .forEach(_ => {
    _.votes = {};
    _.score = 0;
    for(c of _.comments) {
      if(Object.hasOwnProperty.call(_.votes, c.by)) continue;
      var n = 0;
      if(c.content.match(plus))  n =  1;
      if(c.content.match(minus)) n = -1;
      if(n) _.votes[c.by] = n;
      _.score += n;
    }
  }).write();
