# Tỏadua

*Tỏadua* is the/an online collaborative dictionary for the
[Toaq](http://toaq.org) constructed language. It is also currently
being remodelled to suit general usage. You can visit the current
instance at <https://uakci.pl/toadua/>.

You can also use the public API exposed at
<https://uakci.pl/toadua/api> (read the [docs](docs/api.md), too).

**Please note:** Currently in the process of cleaning up, removing the
unprofessional bits, and other groundbreaking changes. Please take the
information below with a pinch of salt. Sorry.

## Installing

* Install [Node.js](https://nodejs.org/en/) version ≥11.
* Run `npm install` in the cloned repository to get the dependencies.
* Run `npm run dev` to build the frontend to `dist/`.
* Run `./core/server.js -d .` to start the service up.
* Go to http://localhost:29138/ in your browser.

Please note that the server is set up to run on port 29138 (by
default) and serve HTTP; however, you’re not supposed to expose the
HTTP website, but rather embed it in some other webserver of your
choice which supports HTTPS (and tunnelling). I have rewriting the
code for out-of-the-box HTTPS-ness on my to-do list.
