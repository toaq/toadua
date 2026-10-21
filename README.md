# Toadua

_Toadua_ is the/an online collaborative dictionary for the
[Toaq](http://toaq.net) constructed language. It is also currently being
remodelled to suit general usage. You can visit the current instance at
<https://toadua.uakci.space>.

You can also use the public API exposed at <https://toadua.uakci.space/api>
(read the [docs](docs/api.md), too).

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
docker build --build-arg GIT_HASH=$(git rev-parse --short HEAD) --build-arg GIT_DESCRIPTION="$(git log -1 --pretty=%s)" -t toadua .
docker run --mount type=bind,src=./config,dst=/app/config -p 9999:29138 -e NODE_ENV=development toadua
```

### Locally (good for dev env)

- Install [Node.js](https://nodejs.org/en/) version ≥21 (skip this step if
  you're using `nix` with `direnv`).
- Run `npm install` both in the cloned repository and in `frontend/`.
- For development, run `npm run dev` and navigate to http://localhost:5173/.
  This runs the backend on port 29138 (restarting it when its sources change)
  alongside a Vite dev server with hot reloading for the frontend, which
  forwards API requests to the backend.
- For production:
  - Run `npm run build` in `frontend/` to build the frontend into
    `frontend/dist/`.
  - Run `npm run build` in the repository root to compile the backend.
  - `npm run start` serves both on http://localhost:29138/.

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
