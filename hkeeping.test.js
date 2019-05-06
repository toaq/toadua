const api = require('./backend.js'),
  housekeeping = require('./housekeeping.js');

housekeeping.backup(api);

housekeeping.sync(api);
