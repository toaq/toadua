# Tỏadūa

*Tỏadūa* is the/an online collaborative dictionary for the [Toaq](http://toaq.org) constructed language. You can visit the current instance at <https://uakci.pl/toadua/>.

## Installing
This repository uses `npm`’s magic setting up powers for installing dependencies. Simply clone this repository, run `npm install` to get the dependencies, and then `npm start` to start the service up. But before you do that, make sure you have all of the following:
- a fairly modern version of Node (perhaps 11.x or higher);
- a Discord webhook for posting updates in filename `HOOK` (tweak the code in `announce.js` if you don't want the updates);
- the `URLS.json` for retrieving foreign dictionary data (change the code in `housekeeping.js` or disable calls to `.sync()` entirely if you want only some services or no services, respectively – please let me (ciuak/uakci) know if you run into any trouble while doing this. I'll be happy to share the file to fellow Toaqists).

## Security
The server is set up to run on port 59138 and serve HTTP; however, you’re not supposed to expose the HTTP website, but embed it in some other webserver of your choice which supports HTTPS (and tunneling), or rewrite the code to support HTTPS (you’re welcome to!). Never **ever** expose the HTTP service unless you want literally everybody to intercept your dictionary’s users’ passwords.
