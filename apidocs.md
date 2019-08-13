# API Documentation

## Overview

  The API, accessible through the `/api` route, accepts POST requests
containing valid JSON data and responds with JSON. All output from the
API contains a boolean `success` field, set to `false` iff there was
an error in the original query or in the backend, alongside with a
string `error` field. Successful results typically come with a `data`
field.

  Please note that your query may not exceed 16 KiB in size.

### Entry object format

Entries are JSON objects with the following fields:

* `id` string – unique identifier representing the entry
* `on` string – when the entry was created, in ISO format
* `by` string – author of the entry
* `scope` string – the ‘scope’ the entry resides in; currently, this
  signifies what language `body` is supposed to be in
* `head` string – the header, i.e., the Toaq word
* `body` string – the definition
* `notes` array of:
  - `by` string
  - `on` string
  - `content` string
* `score` number – as determined by the votes users cast on the entry
* `vote` number? – your vote on the entry. One of `-1`, `0` or `1`.
  This field will appear iff you send your token with your query

## Actions

  Queries must be JSON objects with a string `action` field,
designating the action to be performed. The semantics of the rest of
the fields in the input object are determined by the chosen action.

  In addition, if an action requires the sender to be logged in – as
marked with `(L)` – a `token` field containing a valid UUID token must
be present in the object.

### `search`

> **Inputs:**
> 
> * `query` string
> 
> **Outputs:**
> 
> * `data` entry array

  Performs a search of the database. The `query` is split at spaces,
each part evaluated separately, then ANDed together. Each sub-query
may contain `|` characters, signifying OR; each of those parts may be
preceded by a `!`, signifying NOT. For example, `!a|b c` will search
for entries which contain ‘c’ and either contain ‘b’ and/or not
contain ‘a.’

  In addition to this, there are a few special keywords you can use to
enhance your query:

* `scope:` + *scope name*
* (`id:` **or** `#`) + *entry id*
* (`user:` **or** `@`) + *username*
* (`arity:` **or** `/`) + *maximal arity*

  Keywords which start with single characters may be chained together,
perhaps following non-keyword tokens – for example, `property/2@uakci`
is equivalent to `property arity:2 user:uakci` (‘search for binary
predicates authored by uakci which contain the word “property”’).

### `info`

> **Inputs:**
> 
> * `id` string
> 
> **Outputs:**
> 
> * `data` entry

  Returns the entry object for the entry with the given `id`.

### `note` (L)

> **Inputs:**
> 
> * `id` string
> * `content` string

  Adds a note to the entry with the given ID. Note that `content` may
not be over 2048 characters long.

### `comment` (L)

Old name of `note`; for compat.

### `create` (L)

> **Inputs:**
> 
> * `head` string
> * `body` string
> * `scope` string? – defaults to `"en"`
> 
> **Outputs:**
> 
> * `id` number – the ID of the freshly created entry

  Creates a new entry with the given Toaq word and definition in the
given scope. Note that the head–body pair must be unique; note also
that there is a restriction of 2048 characters on each of the head and
the body. Don't go crazy.

### `login`

> **Inputs:**
> 
> * `name` string
> * `pass` string
> 
> **Outputs:**
> 
> * `name` string – the same as `name` from the input
> * `token` string – the UUID you will use for further authorising of
  your API calls

  Attempts to log in with the given credentials.

### `logout` (L)

  Invalidates the token passed as input.

### `register`

> **Inputs:**
> 
> * `name` string
> * `pass` string
> 
> **Outputs:**
> 
> * `name` string – the same as `name` from the input
> * `token` string – see ‘login’ above

  Attempts to register with the given credentials. Note that `name`
may only contain letters from the Latin alphabet; there is a
restriction on the length, too.

### `vote` (L)

> **Inputs:**
> 
> * `id` string
> * `vote` number

  Casts a vote on the entry with the given ID. Possible values of
`vote` are `-1`, `0`, and `1`; `0` effectively cancels your previous
vote.

### `whoami`

> **Inputs:**
> 
> * `token` string?
> 
> **Outputs:**
> 
> * `data` – read below
> * `count` – the number of entries in the database

  Use `whoami` to check if your token is valid; `data` will contain
the username the token authorises for, or empty if no token (no valid
token or no token at all) is given. Returns the entry count, too.
