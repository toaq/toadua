// search.ts
// perform searches of the database

'use strict';
import {
	deburr,
	deburrMatch,
	emitter,
	config,
	store,
	MatchMode,
	Entry,
} from './commons';

// keep an own cache for entries
var cache: CachedEntry[] = [];

const RE_TRAITS = ['id', 'user', 'scope', 'head', 'body', 'date'] as const;
type Trait = typeof RE_TRAITS[number];

type ReCache = Record<Trait, Record<string, (entry: CachedEntry) => boolean>>;
const empty_re_cache = () =>
	Object.fromEntries(RE_TRAITS.map(trait => [trait, {}])) as ReCache;
var re_cache: ReCache = empty_re_cache();

interface CachedEntry {
	$: Entry;
	id: string;
	head: string[];
	body: string[];
	notes: string[];
	date: number;
	score: number;
	content: string[];
}

export interface PresentedEntry extends Omit<Entry, 'votes'> {
	vote: -1 | 0 | 1 | undefined;
	votes?: undefined;
	relevance?: number;
	content?: string[];
}

// compute a few fields for faster processing
export function cacheify(e: Entry): CachedEntry {
	let deburredHead = deburr(e.head);
	let deburredBody = deburr(e.body);
	let deburredNotes = e.notes.flatMap(({ content }) => deburr(content));
	return {
		$: e,
		id: e.id,
		head: deburredHead,
		body: deburredBody,
		notes: deburredNotes,
		date: +new Date(e.date),
		score: e.score,
		content: [].concat(deburredHead, deburredBody, deburredNotes),
	};
}

function cached_index(id: string): number {
	return cache.findIndex(_ => _.id === id);
}

export function present(
	e: CachedEntry,
	uname: string | undefined,
	relevance: number,
): PresentedEntry {
	const { votes, ...rest } = e.$;
	const vote = uname ? votes[uname] || 0 : undefined;
	return { ...rest, relevance, content: e.content, vote };
}

export function score(entry: Entry): number {
	const votes: [string, number][] = Object.entries(entry.votes);
	return votes.reduce((a, b) => a + b[1], 0);
}

emitter.on('remove', (_, entry) => cache.splice(cached_index(entry.id), 1));
emitter.on('create', (_, entry) => cache.push(cacheify(entry)));
for (let k of ['vote', 'note'])
	emitter.on(k, (_, entry) =>
		cache.splice(cached_index(entry.id), 1, cacheify(entry)),
	);

export function recache(): void {
	cache = store.db.entries.map(cacheify);
	re_cache = empty_re_cache();
}

const all_funcs = args => args.every(_ => _ instanceof Function);
const one_string = args => args.length === 1 && typeof args[0] === 'string';

enum OperationType {
	Other,
	Textual,
	Functor,
}

interface Operation {
	type: OperationType;
	check: (args: any[]) => boolean;
	build: (args: any[]) => (entry: CachedEntry) => boolean;
}

let operations: Record<string, Operation> = (search.operations = {
	and: {
		type: OperationType.Functor,
		check: all_funcs,
		build: args => entry => {
			for (let a of args) if (!a(entry)) return false;
			return true;
		},
	},
	or: {
		type: OperationType.Functor,
		check: all_funcs,
		build: args => entry => {
			for (let a of args) if (a(entry)) return true;
			return false;
		},
	},
	not: {
		type: OperationType.Functor,
		check: args => args.length === 1 && args[0] instanceof Function,
		build:
			([f]) =>
			entry =>
				!f(entry),
	},
	arity: {
		type: OperationType.Other,
		check: args => args.length === 1 && typeof args[0] === 'number',
		build:
			([n]) =>
			entry =>
				entry.$.body
					.split(/[;.!?；。]/)
					.map(sentence => sentence.match(/▯/g)?.length ?? 0)
					.reduce((a, b) => Math.max(a, b)) === n,
	},
	term: {
		type: OperationType.Textual,
		check: one_string,
		build: ([s]) => {
			let deburred = deburr(s);
			return entry =>
				deburrMatch(deburred, entry.content, MatchMode.Containing) ==
				deburred.length;
		},
	},
});

for (let trait of RE_TRAITS) {
	operations[trait] = {
		type: OperationType.Other,
		check: one_string,
		build: ([s]) =>
			re_cache[trait][s] || (re_cache[trait][s] = make_re(trait, s)),
	};
	operations[`${trait}_raw`] = {
		type: OperationType.Other,
		check: one_string,
		build:
			([s]) =>
			query =>
				s === query.$[trait],
	};
}

const is_morphological = (trait: Trait): boolean =>
	['head', 'body'].includes(trait);

function make_re(trait: Trait, s: string): (entry: CachedEntry) => boolean {
	try {
		if (!(is_morphological(trait) ? /[?*CV]/ : /[?*]/).test(s)) throw null;

		s = s
			.replace(/[\[\]{}()+.\\^$|]/g, '\\$&')
			.replace(/\*+/g, '.*')
			.replace(/\?/g, '.')
			.replace(/i/g, '[ıi]');

		if (is_morphological(trait))
			s = s
				.replace(/C/g, "(?:[bcdfghjklnprstz']|ch|sh|nh)")
				.replace(/V\\\+/g, 'V+')
				.replace(/V/g, '[aeıiouy]');

		let regexp = new RegExp(`^${s}\$`, 'iu');
		return entry => regexp.test(entry.$[trait]);
	} catch (_) {
		return entry => s === entry.$[trait];
	}
}

// parse the query (an embedded array structure like below) into a
// function (entry => bool)
// ["and", ["term", "hi"],
//         ["or", ["not", ["scope", "en"]],
//                ["arity", 3],
//                ["user", "example"]]]
// for anybody asking: yes, this is basically a kind of Lisp
search.parse_query = parse_query;
function parse_query(
	query,
): string | false | ((entry: CachedEntry) => boolean) {
	if (!(query instanceof Array)) return 'found non-array branch';
	if (!query.length) return 'found empty array node';
	query = [...query];
	let op_name = query.shift();
	let op =
		Object.hasOwnProperty.call(operations, op_name) && operations[op_name];
	if (!op) return `unknown operation ${op_name}`;
	let args;
	try {
		args = query.map(arg => {
			if (typeof arg !== 'object') return arg;
			let might_be_it = parse_query(arg);
			if (typeof might_be_it === 'string') throw might_be_it;
			return might_be_it;
		});
	} catch (e) {
		return e;
	}
	let check = op.check(args);
	if (check !== true) return check;
	return op.build(args);
}

search.bare_terms = bare_terms;
function bare_terms(o: any[]) {
	// `o` must be instanceof Array.
	let op = operations[o[0]];
	switch (op.type) {
		case OperationType.Textual:
			return [o[1]];
		case OperationType.Functor:
			return o.slice(1).map(bare_terms).flat();
		default:
			return [];
	}
}

function default_ordering(e: CachedEntry, deburrs: string[]): number {
	const official = e.$.user === 'official' ? 1 : 0;
	return (
		Math.sqrt(
			(1 + Math.max(0, e.score) + official) / (1 + Math.max(0, -e.score)),
		) *
		// full keyword match
		(+1 * +(deburrMatch(deburrs, e.notes, MatchMode.Containing) > 0) +
			// header/body substring/superstring match
			3 * +(deburrMatch(deburrs, e.body, MatchMode.Contained) > 0) +
			6 * +(deburrMatch(deburrs, e.head, MatchMode.Contained) > 0) +
			10 * +(deburrMatch(deburrs, e.body, MatchMode.Containing) > 0) +
			15 * +(deburrMatch(deburrs, e.head, MatchMode.Containing) > 0) +
			// exact match.
			30 * +(deburrMatch(deburrs, e.body, MatchMode.Exact) > 0) +
			// the number is very exact too, as you can see
			69.4201337 *
				+(deburrMatch(deburrs, e.head, MatchMode.Exact) == e.head.length))
	);
}

export function search(i: any, uname?: string): string | PresentedEntry[] {
	let {
		query,
		ordering: requested_ordering,
		preferred_scope,
		preferred_scope_bias,
	} = i;
	let filter = parse_query(query);
	if (typeof filter !== 'function') return `malformed query: ${filter}`;
	let bares = bare_terms(query),
		deburrs = bares.map(deburr).flat();
	let filtered = cache.filter(filter);
	let ordering = default_ordering;
	switch (requested_ordering) {
		case 'newest':
			ordering = e => +e.date;
			break;
		case 'oldest':
			ordering = e => -e.date;
			break;
		case 'highest':
			ordering = e => +e.score;
			break;
		case 'lowest':
			ordering = e => -e.score;
			break;
		case 'random':
			ordering = e => Math.random();
			break;
	}
	let sorted = filtered
		.map(
			e =>
				[
					e,
					ordering(e, deburrs) +
						+(e.$.scope === preferred_scope) * (preferred_scope_bias || 0),
				] as [CachedEntry, number],
		)
		.sort((e1, e2) => e2[1] - e1[1]);
	let presented = sorted.map(([e, relevance]) => present(e, uname, relevance));
	return presented;
}
