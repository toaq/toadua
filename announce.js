const request = require('request'),
  fs = require('fs'),
  hook_url = fs.readFileSync('HOOK').toString().replace(/\n/g, '');

module.exports =
function announce(what) {
  if(false) {
    console.log(what);
    return true;
  } else {
    try {
      let req = https.request({ hostname: 'discordapp.com', path: hook_url, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => { return; });
      req.write(JSON.stringify({ embeds: [what] }));
      req.end();
      return true;
    } catch(e) {
      process.stderr.write(e.stack + '\n');
      return false;
    }
  }
}

