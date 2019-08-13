# Tỏadūa

*Tỏadūa* is the/an online collaborative dictionary for the
[Toaq](http://toaq.org) constructed language. You can visit the
current instance at <https://uakci.pl/toadua/>.

You can also use the public API exposed at
<https://uakci.pl/toadua/api> ([docs](apidocs.md)).

**Please note:** Currently in the process of cleaning up, removing the
unprofessional bits, and other groundbreaking changes. Please take
everything down here with a pinch of salt. Sorry.

## Installing

Run `npm install` in the cloned repository to get the dependencies,
and then `npm start` to start the service up. You will need a modern
version of node (v11.x). There are, though, a few unprofessional
caveats, soon to be fixed for the gener(al|ic) user:

- You will need Vue.js under `vue-production.js`. At the moment, you
  can also link to a CDN in `index.html`;
- For posting updates, a Discord webhook is needed under `HOOK`.
  (Tweak the code in `announce.js` if you don’t need this feature);
- `URLS.json` is used for retrieving foreign dictionary data. (You can
  try disabling calls to `.sync()` entirely.)
- The server is set up to run on port 59138 and serve HTTP; however,
  you’re not supposed to expose the HTTP website, but embed it in some
  other webserver of your choice which supports HTTPS (and
  tunnelling). I plan to rewrite the code for out-of-the-box
  HTTPS-ness.
