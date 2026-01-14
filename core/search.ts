// search.ts
// perform searches of the database

import Heap from 'tinyqueue';
import * as shared from '../frontend/shared/index.js';
import {
	deburr,
	deburrMatch,
	emitter,
	store,
	MatchMode,
	type Entry,
} from './commons.js';

// keep an own cache for entries
let cache: CachedEntry[] = [];

const RE_TRAITS = [
	'id',
	'user',
	'scope',
	'head',
	'body',
	'date',
	'score',
] as const;
type Trait = (typeof RE_TRAITS)[number];

type ReCache = Record<Trait, Record<string, (entry: CachedEntry) => boolean>>;
const empty_re_cache = () =>
	Object.fromEntries(RE_TRAITS.map(trait => [trait, {}])) as ReCache;
let re_cache: ReCache = empty_re_cache();

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
	const deburredHead = deburr(e.head);
	const deburredBody = deburr(e.body);
	const deburredNotes = e.notes.flatMap(({ content }) => deburr(content));
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
for (const k of ['vote', 'note', 'removenote', 'edit', 'move'])
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
	Other = 0,
	Textual = 1,
	Functor = 2,
}

interface Operation {
	type: OperationType;
	check: (args: any[]) => boolean;
	build: (args: any[], uname?: string) => (entry: CachedEntry) => boolean;
}

const operations: Record<string, Operation> = {
	and: {
		type: OperationType.Functor,
		check: all_funcs,
		build: args => entry => {
			for (const a of args) if (!a(entry)) return false;
			return true;
		},
	},
	or: {
		type: OperationType.Functor,
		check: all_funcs,
		build: args => entry => {
			for (const a of args) if (a(entry)) return true;
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
			const deburred = deburr(s);
			const deburredW = deburred.some(x => /vy?|w|y/.test(x))
				? deburred.map(x => x.replace(/vy?|w|y/g, 'ꝡ'))
				: undefined;
			return entry =>
				deburrMatch(deburred, entry.content, MatchMode.Containing) ===
					deburred.length ||
				(deburredW &&
					deburrMatch(deburredW, entry.content, MatchMode.Containing) ===
						deburredW.length);
		},
	},
	myvote: {
		type: OperationType.Other,
		check: args =>
			args.length === 1 &&
			typeof args[0] === 'number' &&
			[-1, 0, 1].includes(args[0]),
		build:
			([vote], uname) =>
			entry =>
				uname ? (entry.$.votes[uname] || 0) === vote : false,
	},
};

search.operations = operations;

for (const trait of RE_TRAITS) {
	operations[trait] = {
		type: OperationType.Other,
		check: one_string,
		build: ([s]) => {
			re_cache[trait][s] ||= make_re(trait, s);
			return re_cache[trait][s];
		},
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

		let source = s
			.replace(/[\[\]{}()+.\\^$|]/g, '\\$&')
			.replace(/\*+/g, '.*')
			.replace(/\?/g, '.')
			.replace(/i/g, '[ıi]');

		if (is_morphological(trait))
			source = source
				.replace(/C/g, "(?:[bcdfghjklmnprstꝡz']|ch|sh|nh)")
				.replace(/V\\\+/g, 'V+')
				.replace(/V/g, '[aeıiouy]');

		const regexp = new RegExp(`^${source}\$`, 'iu');
		return entry => regexp.test(String(entry.$[trait]));
	} catch (_) {
		return entry => s === String(entry.$[trait]);
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
	queryObject: any,
	uname?: string,
): string | false | ((entry: CachedEntry) => boolean) {
	if (!Array.isArray(queryObject)) return 'found non-array branch';
	if (!queryObject.length) return 'found empty array node';
	const query = [...queryObject];
	const op_name = query.shift();
	const op = Object.hasOwn(operations, op_name) && operations[op_name];
	if (!op) return `unknown operation ${op_name}`;
	let args: any[];
	try {
		args = query.map(arg => {
			if (typeof arg !== 'object') return arg;
			const might_be_it = parse_query(arg, uname);
			if (typeof might_be_it === 'string') throw might_be_it;
			return might_be_it;
		});
	} catch (e) {
		return e;
	}
	const check = op.check(args);
	if (check !== true) return check;
	return op.build(args, uname);
}

search.bare_terms = bare_terms;
function bare_terms(o: any[]) {
	// `o` must be instanceof Array.
	const op = operations[o[0]];
	switch (op.type) {
		case OperationType.Textual:
			return [o[1]];
		case OperationType.Functor:
			return o.slice(1).flatMap(bare_terms);
		default:
			return [];
	}
}

type Order = (e: CachedEntry, deburrs: string[], bares: string[]) => any;

const default_ordering: Order = (e, deburrs, bares) => {
	const official = e.$.user === 'official' ? 1 : 0;
	const pos = Math.max(0, e.score);
	const neg = Math.max(0, -e.score);
	const voteMultiplier = Math.sqrt((1 + pos + official) / (1 + neg));

	let points = 0.1;

	// full keyword match
	if (deburrMatch(deburrs, e.notes, MatchMode.Containing) > 0) points += 1;
	// header/body substring/superstring match
	if (deburrMatch(deburrs, e.body, MatchMode.Contained) > 0) points += 3;
	if (deburrMatch(deburrs, e.head, MatchMode.Contained) > 0) points += 6;
	if (deburrMatch(deburrs, e.body, MatchMode.Containing) > 0) points += 10;
	if (deburrMatch(deburrs, e.head, MatchMode.Containing) > 0) points += 15;
	// exact match.
	if (deburrMatch(deburrs, e.body, MatchMode.Exact) > 0) points += 30;
	// the number is very exact too, as you can see
	const exact = deburrMatch(deburrs, e.head, MatchMode.Exact);
	if (exact > 0 && exact === e.head.length) points += 69.4201337;

	// Bonus points for "typographically exact" (no deburring required) matches:
	if (bares.includes(e.$.head)) points += 30;

	return -voteMultiplier * points;
};

const base_orders = new Map<string, Order>([
	['newest', e => -e.date],
	['new', e => -e.date],
	['oldest', e => +e.date],
	['old', e => +e.date],
	['highest', e => -e.score],
	['high', e => -e.score],
	['lowest', e => +e.score],
	['low', e => +e.score],
	['random', Math.random],
	['alpha', e => e.head],
	['alphabetic', e => e.head],
	['alphabetical', e => e.head],
]);

function interpret_ordering(
	ordering: string,
	preferred_scope: string | undefined,
	preferred_scope_bias: number | undefined,
): Order {
	const base_order = base_orders.get(ordering) ?? default_ordering;
	return (e, deburrs, bares) =>
		base_order(e, deburrs, bares) +
		+(e.$.scope === preferred_scope) * (preferred_scope_bias || 0);
}

export function search(i: any, uname?: string): string | PresentedEntry[] {
	let {
		query,
		ordering: requested_ordering,
		limit,
		preferred_scope,
		preferred_scope_bias,
	} = i;
	if (typeof query === 'string') {
		const parsed = shared.parse_query(query);
		query = parsed.query;
		requested_ordering ??= parsed.ordering;
	}
	const filter = parse_query(query, uname);
	if (typeof filter !== 'function') return `malformed query: ${filter}`;
	const bares = bare_terms(query);
	const deburrs = bares.flatMap(deburr);

	const ordering = interpret_ordering(
		requested_ordering,
		preferred_scope,
		preferred_scope_bias,
	);

	let results: [CachedEntry, any][];
	if (limit === undefined) {
		// No limit: in this case it's best to filter everything, then sort
		results = cache
			.filter(filter)
			.map(e => [e, ordering(e, deburrs, bares)] as [CachedEntry, any])
			.sort((e1, e2) => (e1[1] < e2[1] ? -1 : e1[1] > e2[1] ? 1 : 0));
	} else {
		// In case a limit is given, use a heap to extract the first n matching
		// entries rather than sorting what would often be the entire dictionary
		const heap = new Heap(
			cache.map(e => [e, ordering(e, deburrs, bares)] as [CachedEntry, any]),
			(e1, e2) => (e1[1] < e2[1] ? -1 : e1[1] > e2[1] ? 1 : 0),
		);

		results = [];
		while (results.length < limit && heap.peek() !== undefined) {
			const maybe_result = heap.pop();
			if (filter(maybe_result[0])) results.push(maybe_result);
		}
	}

	const presented = results.map(([e, relevance]) =>
		present(e, uname, relevance),
	);
	return presented;
}
