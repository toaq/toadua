# Toadua

_Toadua_ is the/an online collaborative dictionary for the
[Toaq](http://toaq.net) constructed language. It is also currently being
remodelled to suit general usage. You can visit the current instance at
<https://toadua.uakci.pl>.

You can also use the public API exposed at <https://toadua.uakci.pl/api> (read
the [docs](docs/api.md), too).

**Please note:** Currently in the process of cleaning up, removing the
unprofessional bits, and other groundbreaking changes. Please take the
information below with a pinch of salt. Sorry.

## Installing and running

First, set up the config files:

```
cp config/defaults.yml config/config.yml
cp config/sources-example.yml config/sources.yml
# Then edit them both to suit your needs.
```

### With Docker

This maps port 9999 on your computer to port 29138 inside a Docker container
running Toadua:

```
docker build -t toadua .
docker run --mount type=bind,src=./config,dst=/app/config -p 9999:29138 toadua
```

### Locally (good for dev env)

- Install [Node.js](https://nodejs.org/en/) version ≥16 (skip this step if
  you're using `nix` with `direnv`).
- Frontend:
  - Cd into the `frontend` directory and run `npm install` there.
  - `npm run build` will create a webpack build.
- Backend:
  - Run `npm install` in the cloned repository to get the dependencies.
  - Run `npm run build` to compile the TypeScript sources.
  - `npm run start` should now work out of the box. Navigate to
    http://localhost:29138/ in your browser.

### With Nix (good for verifying build correctness)

- Run `nix run . -- -d .` to build the service and run it right away.
- Run `nix build` to do a full build. You may then inspect the contents of
  `result/`.

## HTTP security warning

Please note that the server is set up to run on port 29138 (by default) and
serve HTTP; however, you’re not supposed to expose the HTTP website, but rather
embed it in some other webserver of your choice which supports HTTPS (and
tunnelling). I have rewriting the code for out-of-the-box HTTPS-ness on my to-do
list.
