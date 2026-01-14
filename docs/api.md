# Public API Documentation

## Overview

The API, accessible through the `/api` route, accepts POST requests containing
valid JSON data and responds with JSON. Please note that your query may not
exceed 16 KiB in size.

### Generic response format

- `version` string – always contains the [semantic version](https://semver.org)
  of the backend; use this to ensure that your appli(ance|cation) is up to date
- `success` bool
- `error` string? – absent if `success === true`

### Entry object format

Entries are JSON objects with the following fields:

- `id` string – unique identifier representing the entry
- `date` string – when the entry was created, in ISO format
- `user` string – author of the entry
- `scope` string – the ‘scope’ the entry resides in; currently, this signifies
  what language `body` is supposed to be in
- `head` string – the header, i.e., the Toaq word
- `body` string – the definition
- `notes` array of:
  - `date` string
  - `user` string
  - `content` string
- `score` number – as determined by the votes users cast on the entry
- `vote` number? – your vote on the entry. One of `-1`, `0` or `1`. This field
  will appear iff you send your token with your query

## Actions

Queries must be JSON objects with a string `action` field, designating the
action to be performed. The semantics of the rest of the fields in the input
object are determined by the chosen action.

In addition, if an action requires the sender to be logged in – as marked with
`(L)` – a `token` field containing a valid UUID token must be present in the
object.

### `search`

> **Inputs:**
>
> - `query` array of
> - `ordering` string?
> - `limit` number?
>
> **Outputs:**
>
> - `results` entry array

Execute a search against the database given a Lisp-like description of the
search. The following paragraphs describe the exact format of this description.

A query is a tree-like array structure which describes constraints in terms of
certain criteria or logical operations on such criteria. The interpretation of
non-initial elements of an array (called _arguments_) is determined by the
initial element, the _operator_. The format – or formal grammar – of the `query`
field can therefore be described thus:

```
query := ["and" | "or", ...query]
       | ["not", query]
       | ["arity", number]
       | ["id" | "user" | "scope" | "term", string]
       | ["myvote", number]
```

Here are listed the semantics of each operator:

- **Functors**:
  - `and`: logical conjunction of constraints (or intersection of the sets of
    results)
  - `or`: logical disjunction of constraints (or sum of the sets of results)
  - `not`: logical negation of constraint (or complement of the result set)
- **Property constraints**:
  - `id`: succeeds if entry has the given ID (without the octothorpe `#`)
  - `user`: succeeds if entry has been created under the given user name
    (without the at sign `@`)
  - `arity` (_Toaq-specific_): succeeds if the highest number of argument places
    in the parts of a definition is equal to the one supplied (must be a number,
    not a string representation thereof)
  - `myvote`: succeeds if someone is logged in and their vote on the entry is the same as the value passed (`-1`, `0`, or `1`).
- **Textual constraints**:
  - `term`: succeeds if the supplied string, after removing special characters,
    appears in either the head, the definition, or the comments of an entry

Alternatively, `query` may be a string like `"hello scope:en user:official"`
which is then interpreted as in the Toadua frontend. See
<https://toaq.me/Toadua#Search> for more information.

`ordering` describes the metric by which entries should be sorted.

- empty/null/undefined or `default`: a nuanced metric based on vote count,
  officiality. Only metric that takes exact matches into account.
- `highest`: by score, descending.
- `lowest`: by score, ascending.
- `newest`: by date, descending.
- `oldest`: by date, ascending.
- `random`: take a guess silly

`limit` describes the maximum number of entries that should be returned.

### `count`

> **Inputs:**
>
> None
>
> **Outputs:**
>
> - `count` number

Returns the total number of entries in Toadua's database.

### `note` (L)

> **Inputs:**
>
> - `id` string
> - `content` string
>
> _Outputs:_
>
> - `entry` entry

Adds a note to the entry with the given ID. Note that `content` may not be over
2048 characters long. Returns the new state of the entry.

### `create` (L)

> **Inputs:**
>
> - `head` string
> - `body` string
> - `scope` string?
>
> **Outputs:**
>
> - `entry` entry

Creates a new entry with the given Toaq word and definition in the given scope
(which defaults to `"en"`). Note that the head–body pair must be unique; note
also that there is a restriction of 2048 characters on each of the head and the
body. Don't go crazy.

### `login`

> **Inputs:**
>
> - `name` string
> - `pass` string
>
> **Outputs:**
>
> - `token` string

Attempts to log in with the given credentials.

### `logout` (L)

Invalidates the token passed as input.

### `register`

> **Inputs:**
>
> - `name` string
> - `pass` string
>
> **Outputs:**
>
> - `token` string

Attempts to register with the given credentials. Note that `name` may only
contain letters from the Latin alphabet; there is a restriction on the length,
too.

### `vote` (L)

> **Inputs:**
>
> - `id` string
> - `vote` number
>
> _Outputs:_
>
> - `entry` entry

Casts a vote on the entry with the given ID. Possible values of `vote` are `-1`,
`0`, and `1`; `0` effectively cancels your previous vote.

### `welcome`

> **Inputs:**
>
> - `token` string?
>
> **Outputs:**
>
> - `user` string | `null`

Make `welcome` the first message you send to the server. If you send a valid
token, you will get your username back in `user`; otherwise, `user` will be
`null` and you will know your token is invalid or has expired.
