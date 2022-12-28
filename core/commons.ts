// commons.ts
// common utilities

"use strict";

import { readFileSync, watchFile } from 'fs';
import { load as yaml } from 'js-yaml';
import { EventEmitter } from 'events';

const old_log = console.log;

export function log(...args: any[]): void {
  let date = new Date().toISOString()
    .replace(/[:-]/g, '')
    .replace('T', '.')
    .substring(4, 15);
  let message = Array.from(args).join(' ')
                 // padding the message so that it doesn't interfere
                 // with the timestamp column:
                 //                '\nMMDD.hhmmss <message>'
                 .split('\n').join('\n            ');
  old_log(`${date} ${message}`);
};

export function deburr(s: string): string[] {
  return s.normalize('NFD')
          .replace(/\p{M}+/gu, '')
          .replace(/’/gu, '\'')
          .split(/(?:(?!')\P{L})+/gu)
          .map(_ => _.toLowerCase().replace(/ı/g, 'i'))
          .filter(_ => _);
}

export enum MatchMode {
  Containing = 0,
  Contained = 1,
  Exact = 2,
}

export function deburrMatch(what: string[], where: string[], mode: MatchMode): number {
  const predicate = [
    (a: string, b: string) => b.indexOf(a) != -1,
    (a: string, b: string) => a.indexOf(b) != -1,
    (a: string, b: string) => a == b,
  ][mode];
  let count = 0;
  for(let w of what)
    if(where.some(y => predicate(w, y)))
      count++;
  return count;
}

const real_setInterval = global.setInterval;
const real_clearInterval = global.clearInterval;

let interval_cache = [];
export function setInterval(callback: (...args: any[]) => void, ms?: number): NodeJS.Timer {
  let this_one = real_setInterval(callback, ms).unref();
  interval_cache.push(this_one);
  return this_one;
}

export function clearInterval(i: string | number | NodeJS.Timeout): void {
  real_clearInterval(i);
  let index = interval_cache.indexOf(i);
  if(index !== -1) interval_cache.splice(index, 1);
}

export function clearAllIntervals(): void {
  interval_cache.forEach(clearInterval);
  interval_cache.length = 0;
}

var emitter = new EventEmitter;
emitter.setMaxListeners(Infinity);
const _emitter = emitter;
export { _emitter as emitter };
emitter.emit = function(ev, ...args) {
  // add event name as first arg
  return EventEmitter.prototype.emit.call(this, ev, ev, ...args);
};

// for ever-changing configuration files, etc.
const FluidConfig = {
  update(): void {
    let file;
    try {
      file = readFileSync(this.fname)
      this.cache = yaml(file);
    } catch(e) {
      if(e.code == 'ENOENT') {
        log(`fluid_config '${this.fname}' absent from disk ` +
            '– not updating');
        return;
      } else throw e;
    }
    log(`updating fluid_config '${this.fname}' (${file.length}b read)`);
    this.emit('update', this.cache);
  },
  _maxListeners: Infinity
};
Object.setPrototypeOf(FluidConfig, new EventEmitter);
export function fluid_config(fname: string) {
  let f: any = () => {
    return f.cache;
  }
  f.fname = fname;
  Object.setPrototypeOf(f, FluidConfig);
  watchFile(fname, {persistent: false}, () => {
    f.update();
  });
  f.update();
  return f;
}

const MAIN_CONFIG = 'config/config.yml',
   DEFAULT_CONFIG = `${__dirname}/../../config/defaults.yml`;
// initialise the global config file
let  main_config = fluid_config(MAIN_CONFIG),
  default_config = yaml(readFileSync(DEFAULT_CONFIG));

export const config: any = () => ({...default_config, ...main_config()});

Object.setPrototypeOf(config, new EventEmitter);
config.update = () => main_config.update();
main_config.on('update', () => config.emit('update', config()));

export interface Note {
  /// An ISO 8601 date string like `2022-12-28T21:38:31.682Z`.
  date: string;
  /// The user who left the note.
  user: string;
  /// The content of the note.
  content: string;
}

export interface Entry {
  /// An entry ID string like `AbCdEfGhI`.
  id: string;
  /// An ISO 8601 date string like `2022-12-28T21:38:31.682Z`.
  date: string;
  /// The Toaq word this entry is for.
  head: string;
  /// The definition of the word.
  body: string;
  /// The name of the user that added the entry.
  user: string;
  /// The scope (`en`, `toa`...) the entry is in.
  scope: string;
  /// Notes left on this entry.
  notes: Note[];
  /// Map from usernames to individual votes.
  votes: Record<string, -1 | 0 | 1>;
  /// Total score of the entry, aggregated from votes.
  score: number;
}

export interface Token {
  /// Username the token is for.
  name: string;
  /// Timestamp the token was created, in milliseconds since the Unix epoch.
  last: number;
}

export interface Db {
  entries: Entry[];
  count: number;
}

export interface Store {
  db?: Db;
  pass?: {
    // Map from usernames to `bcrypt` hashes of their passwords.
    hashes: Record<string, string>;
    // Map from token GUIDs to token objects.
    tokens: Record<string, Token>;
  };
}

// a store for stuff and things
export var store: Store = {};
