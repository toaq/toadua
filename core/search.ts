// search.ts
// perform searches of the database

import Heap from 'tinyqueue';
import * as shared from '../frontend/shared/index.js';
import {
	deburr,
	deburrMatch,
	type Emitter,
	MatchMode,
	type Entry,
	Note,
	type Store,
} from './commons.js';

// keep an own cache for entries
interface CachedEntry {
	$: Entry;
	id: string;
	head: string[];
	body: string[];
	notes: string[];
	date: number;
	score: number;
	pronominal_class: string | undefined;
	frame: string | undefined;
	distribution: string | undefined;
	subject: string | undefined;
	content: string[];
}

export interface PresentedEntry extends Omit<Entry, 'votes'> {
	vote: -1 | 0 | 1 | undefined;
	votes?: undefined;
	relevance?: number;
	content?: string[];
}

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

// Static helper functions for extraction
export function extract_pronominal_class(notes: Note[]): string | undefined {
	for (let i = notes.length - 1; i >= 0; i--) {
		const note = notes[i];
		const match = note.content
			.toLowerCase()
			.match(/(?:pronominal.?)?class\s*:\s*(.*)/);
		if (match) {
			const value = match[1]
				.trim()
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '')
				.replace('i', 'ı');
			if (['ho', 'maq', 'hoq', 'ta', 'raı'].includes(value)) {
				return value;
			}
		}
	}
	return undefined;
}

export function extract_frame(notes: Note[]): string | undefined {
	for (let i = notes.length - 1; i >= 0; i--) {
		const note = notes[i];
		const match = note.content.toLowerCase().match(/frame\s*:\s*(.*)/);
		if (match) {
			const value = [...match[1].matchAll(/[c\d][ijkx]*/g)];
			if (value.length > 0) {
				return value.join(' ');
			}
		}
	}
	return undefined;
}

export function extract_distribution(notes: Note[]): string | undefined {
	for (let i = notes.length - 1; i >= 0; i--) {
		const note = notes[i];
		const match = note.content
			.toLowerCase()
			.match(/distribution\s*:\s*([dn](\s*[dn]){1,2})/);
		if (match) {
			const value = [...match[1].matchAll(/[dn]/g)];
			if (value.length > 0) {
				return value.join(' ');
			}
		}
	}
	return undefined;
}

export function extract_subject(notes: Note[]): string | undefined {
	const validSubjects = [
		'agent',
		'individual',
		'event',
		'predicate',
		'shape',
		'free',
	];
	for (let i = notes.length - 1; i >= 0; i--) {
		const note = notes[i];
		const match = note.content.toLowerCase().match(/subject\s*:\s*(.*)/);
		if (match) {
			const value = match[1].trim();
			if (validSubjects.includes(value)) {
				return value;
			}
		}
	}
	return undefined;
}

export function score(entry: Entry): number {
	const votes: [string, number][] = Object.entries(entry.votes);
	return votes.reduce((a, b) => a + b[1], 0);
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
		pronominal_class: e.pronominal_class ?? extract_pronominal_class(e.notes),
		frame: e.frame ?? extract_frame(e.notes),
		distribution: e.distribution ?? extract_distribution(e.notes),
		subject: e.subject ?? extract_subject(e.notes),
		content: [].concat(deburredHead, deburredBody, deburredNotes),
	};
}

export function present(
	e: CachedEntry,
	uname: string | undefined,
	relevance: number,
): PresentedEntry {
	const { votes, ...rest } = e.$;
	// `cacheify` may have extracted the pronominal class, frame, distribution, and subject from the notes:
	rest.pronominal_class ??= e.pronominal_class;
	rest.frame ??= e.frame;
	rest.distribution ??= e.distribution;
	rest.subject ??= e.subject;
	const vote = uname ? votes[uname] || 0 : undefined;
	return { ...rest, relevance, content: e.content, vote };
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

export class Search {
	private cache: CachedEntry[] = [];
	private re_cache: ReCache = empty_re_cache();
	private store: Store;
	private emitter: Emitter;
	public operations: Record<string, Operation>;

	constructor(store: Store, emitter: Emitter) {
		this.store = store;
		this.emitter = emitter;

		this.operations = {
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
			before: {
				type: OperationType.Other,
				check: one_string,
				build: ([dateStr]) => {
					const timestamp = +new Date(dateStr);
					return entry => entry.date < timestamp;
				},
			},
			after: {
				type: OperationType.Other,
				check: one_string,
				build: ([dateStr]) => {
					const timestamp = +new Date(dateStr);
					return entry => entry.date > timestamp;
				},
			},
		};

		this.operations.until = this.operations.before;
		this.operations.since = this.operations.after;

		for (const trait of RE_TRAITS) {
			this.operations[trait] = {
				type: OperationType.Other,
				check: one_string,
				build: ([s]) => {
					this.re_cache[trait][s] ||= make_re(trait, s);
					return this.re_cache[trait][s];
				},
			};
			this.operations[`${trait}_raw`] = {
				type: OperationType.Other,
				check: one_string,
				build:
					([s]) =>
					query =>
						s === query.$[trait],
			};
		}

		this.emitter.on('remove', (_, entry) =>
			this.cache.splice(this.cached_index(entry.id), 1),
		);
		this.emitter.on('create', (_, entry) => this.cache.push(cacheify(entry)));
		for (const k of ['vote', 'note', 'removenote', 'edit', 'move'])
			this.emitter.on(k, (_, entry) =>
				this.cache.splice(this.cached_index(entry.id), 1, cacheify(entry)),
			);

		this.recache();
	}

	private cached_index(id: string): number {
		return this.cache.findIndex(_ => _.id === id);
	}

	public some(predicate: (entry: CachedEntry) => boolean): boolean {
		return this.cache.some(predicate);
	}

	public recache(): void {
		this.cache = this.store.db.entries.map(cacheify);
		this.re_cache = empty_re_cache();
	}

	// parse the query (an embedded array structure like below) into a
	// function (entry => bool)
	// ["and", ["term", "hi"],
	//         ["or", ["not", ["scope", "en"]],
	//                ["arity", 3],
	//                ["user", "example"]]]
	// for anybody asking: yes, this is basically a kind of Lisp
	public parse_query(
		queryObject: any,
		uname?: string,
	): string | false | ((entry: CachedEntry) => boolean) {
		if (!Array.isArray(queryObject)) return 'found non-array branch';
		if (!queryObject.length) return 'found empty array node';
		const query = [...queryObject];
		const op_name = query.shift();
		const op =
			Object.hasOwn(this.operations, op_name) && this.operations[op_name];
		if (!op) return `unknown operation ${op_name}`;
		let args: any[];
		try {
			args = query.map(arg => {
				if (typeof arg !== 'object') return arg;
				const might_be_it = this.parse_query(arg, uname);
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

	public bare_terms(o: any[]) {
		// `o` must be instanceof Array.
		const op = this.operations[o[0]];
		switch (op.type) {
			case OperationType.Textual:
				return [o[1]];
			case OperationType.Functor:
				return o.slice(1).flatMap(x => this.bare_terms(x));
			default:
				return [];
		}
	}

	public search(i: any, uname?: string): string | PresentedEntry[] {
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
		const filter = this.parse_query(query, uname);
		if (typeof filter !== 'function') return `malformed query: ${filter}`;
		const bares = this.bare_terms(query);
		const deburrs = bares.flatMap(deburr);

		const ordering = interpret_ordering(
			requested_ordering,
			preferred_scope,
			preferred_scope_bias,
		);

		let results: [CachedEntry, any][];
		if (limit === undefined) {
			// No limit: in this case it's best to filter everything, then sort
			results = this.cache
				.filter(filter)
				.map(e => [e, ordering(e, deburrs, bares)] as [CachedEntry, any])
				.sort((e1, e2) => (e1[1] < e2[1] ? -1 : e1[1] > e2[1] ? 1 : 0));
		} else {
			// In case a limit is given, use a heap to extract the first n matching
			// entries rather than sorting what would often be the entire dictionary
			const heap = new Heap(
				this.cache.map(
					e => [e, ordering(e, deburrs, bares)] as [CachedEntry, any],
				),
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
}
