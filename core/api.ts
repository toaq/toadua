// api.ts
// implementation for the API

import { config, emitter } from './commons.js';
import type { Entry, Store, ToaduaConfig } from './commons.js';
import * as search from './search.js';
import * as shared from '../frontend/shared/index.js';
import * as shortid from 'shortid';
import * as uuid from 'uuid';
// @ts-ignore the types incorrectly claim bcryptjs to be an ES Module
import bcryptjs from 'bcryptjs';
import type * as bcryptjs_types from 'bcryptjs';
import type { PresentedEntry } from './search.js';

// Workaround for bcryptjs' broken types
const bcrypt = bcryptjs as typeof bcryptjs_types;

const PRONOMINAL_CLASSES = ['ho', 'maq', 'hoq', 'ta', 'raı'];

const FRAMES = [
	'c',
	'c c',
	'c c c',
	'0',
	'c 0',
	'c 1i',
	'c 1x',
	'c 2ii',
	'c 2ix',
	'c 2xi',
	'c 2xx',
	'c c 0',
	'c c 1i',
	'c c 1j',
	'c c 1x',
	'c c 2ij',
	'c c 2xx',
];

const DISTRIBUTIONS = [
	'd',
	'n',
	'd d',
	'd n',
	'n d',
	'n n',
	'd d d',
	'd d n',
	'd n d',
	'd n n',
	'n d d',
	'n d n',
	'n n d',
	'n n n',
];

const SUBJECTS = ['agent', 'individual', 'event', 'predicate', 'shape', 'free'];

export type ApiBody =
	| { name: string }
	| { entry: PresentedEntry }
	| { results: PresentedEntry[] }
	| { token: string }
	| { count: number };

export type ApiError = { success: false; error: string };
export type ApiSuccess = { success: true } & ApiBody;
export type ApiResponse = ApiError | ApiSuccess;

type ActionFunction = (i: any, uname?: string) => Promise<ApiResponse>;
type Action = ActionFunction;

const flip = (e: string): ApiError => ({ success: false, error: e });
const good = (d?: ApiBody): ApiResponse => ({ success: true, ...d });

const limit = (lim: number) => (i: unknown) =>
	!i || typeof i !== 'string'
		? 'absent'
		: i.length <= lim || `too long (max. ${lim} characters)`;

function optional<S>(f: (s: S) => true | string): (s: S) => true | string {
	return (s: S) => s === undefined || f(s);
}

export const replacements = (s: string): string =>
	s.replace(/___/g, '▯').replace(/\s+$/g, '').normalize('NFC');

export class Api {
	private readonly store: Store;
	private readonly config: ToaduaConfig;
	private readonly actions: Record<string, Action>;

	public index_of(id: string): number {
		return this.store.db.entries.findIndex(_ => _.id === id);
	}

	public by_id(id: string): Entry {
		return this.store.db.entries[this.index_of(id)];
	}

	private present(e: Entry, uname: string | undefined): PresentedEntry {
		return {
			...e,
			votes: undefined,
			vote: uname ? e.votes[uname] || 0 : undefined,
		};
	}

	private is_present(i: unknown): true | string {
		return !!i || 'absent';
	}

	private is_scope(i: unknown): true | string {
		return !(i && typeof i === 'string')
			? 'scope is not string'
			: !!i.match(/^[a-z-]{1,24}$/) || 'scope must match [a-z-]{1,24}';
	}

	private is_number(i: unknown): true | string {
		return (i && typeof i === 'number') || 'not a valid number';
	}

	private is_shortid(i: unknown): true | string {
		return (i && shortid.isValid(i)) || 'not a valid ID';
	}

	private is_goodid(i: unknown): true | string {
		return (
			(typeof i === 'string' &&
				this.is_shortid(i) &&
				this.index_of(i) !== -1) ||
			'not a recognised ID'
		);
	}

	private is_nobomb(i: unknown): true | string {
		return limit(2048)(i);
	}

	public async welcome(i: any, uname: string): Promise<ApiResponse> {
		return good({ name: uname });
	}

	public async search(i: any, uname: string): Promise<ApiResponse> {
		const e_query = this.is_present(i.query);
		if (e_query !== true) return flip(`invalid field 'query': ${e_query}`);
		const e_ordering = optional(this.is_nobomb)(i.ordering);
		if (e_ordering !== true)
			return flip(`invalid field 'ordering': ${e_ordering}`);
		const e_limit = optional(this.is_number)(i.limit);
		if (e_limit !== true) return flip(`invalid field 'limit': ${e_limit}`);
		const e_preferred_scope = optional(this.is_scope)(i.preferred_scope);
		if (e_preferred_scope !== true)
			return flip(`invalid field 'preferred_scope': ${e_preferred_scope}`);
		const e_preferred_scope_bias = optional(this.is_number)(
			i.preferred_scope_bias,
		);
		if (e_preferred_scope_bias !== true)
			return flip(
				`invalid field 'preferred_scope_bias': ${e_preferred_scope_bias}`,
			);
		const data = search.search(i, uname);
		if (typeof data === 'string') return flip(data);
		return good({ results: data });
	}

	public async count(i: any, uname: string): Promise<ApiResponse> {
		return good({ count: this.store.db.entries.length });
	}

	public async vote(i: any, uname: string): Promise<ApiResponse> {
		if (!uname) return flip('must be logged in');
		const e_id = this.is_goodid(i.id);
		if (e_id !== true) return flip(`invalid field 'id': ${e_id}`);
		const e_vote = [-1, 0, 1].includes(i.vote) || 'invalid vote';
		if (e_vote !== true) return flip(`invalid field 'id': ${e_id}`);

		const e = this.by_id(i.id);
		const old_vote = e.votes[uname] || 0;
		e.votes[uname] = i.vote;
		e.score += i.vote - old_vote;

		const cleanup = this.config.modules['modules/cleanup.js'];
		if (cleanup?.enabled) {
			const culpable = !cleanup.users || cleanup.users.includes(e.user);
			const bad = e.score <= cleanup.vote_threshold;
			if (culpable && bad) {
				await this.call({ action: 'remove', id: e.id }, e.user);
				console.log(`-- ${e.head} weeded out`);
			}
		}

		emitter.emit('vote', e, uname);
		return good({ entry: this.present(e, uname) });
	}

	public async note(i: any, uname: string): Promise<ApiResponse> {
		if (!uname) return flip('must be logged in');
		const e_id = this.is_goodid(i.id);
		if (e_id !== true) return flip(`invalid field 'id': ${e_id}`);
		const e_content = this.is_nobomb(i.content);
		if (e_content !== true)
			return flip(`invalid field 'content': ${e_content}`);

		const word = this.by_id(i.id);
		const this_note = {
			date: new Date().toISOString(),
			user: uname,
			content: replacements(i.content),
		};
		word.notes.push(this_note);
		emitter.emit('note', word, this_note);
		return good({ entry: this.present(word, uname) });
	}

	public async edit(i: any, uname: string): Promise<ApiResponse> {
		if (!uname) return flip('must be logged in');
		const e_id = this.is_goodid(i.id);
		if (e_id !== true) return flip(`invalid field 'id': ${e_id}`);
		const e_body = this.is_nobomb(i.body);
		if (e_body !== true) return flip(`invalid field 'body': ${e_body}`);
		const e_scope = this.is_scope(i.scope);
		if (e_scope !== true) return flip(`invalid field 'scope': ${e_scope}`);

		const word = this.by_id(i.id);
		if (word.user !== uname) {
			return flip('you are not the owner of this entry');
		}
		const new_body = replacements(i.body);
		const body_changed = word.body !== new_body;
		const scope_changed = word.scope !== i.scope;
		word.body = new_body;
		word.scope = i.scope;
		if (body_changed) {
			emitter.emit('edit', word);
		} else if (scope_changed) {
			emitter.emit('move', word);
		}
		return good({ entry: this.present(word, uname) });
	}

	// Edit metadata (pronominal class, frame, distribution, subject) on a word.
	// These can be edited by anyone, not just the owner.
	public async annotate(i: any, uname: string): Promise<ApiResponse> {
		if (!uname) return flip('must be logged in');
		const e_id = this.is_goodid(i.id);
		if (e_id !== true) return flip(`invalid field 'id': ${e_id}`);
		if (
			i.pronominal_class &&
			!PRONOMINAL_CLASSES.includes(i.pronominal_class)
		) {
			return flip(`invalid field 'pronominal_class': ${i.pronominal_class}`);
		}
		if (i.frame && !FRAMES.includes(i.frame)) {
			return flip(`invalid field 'frame': ${i.frame}`);
		}
		if (i.distribution && !DISTRIBUTIONS.includes(i.distribution)) {
			return flip(`invalid field 'distribution': ${i.distribution}`);
		}
		if (i.subject && !SUBJECTS.includes(i.subject)) {
			return flip(`invalid field 'subject': ${i.subject}`);
		}
		const word = this.by_id(i.id);
		if (!word) return flip('no such word');
		word.pronominal_class = i.pronominal_class;
		word.frame = i.frame;
		word.distribution = i.distribution;
		word.subject = i.subject;
		emitter.emit('annotate', word);
		return good({ entry: this.present(word, uname) });
	}

	public async removenote(i: any, uname: string): Promise<ApiResponse> {
		if (!uname) return flip('must be logged in');
		const e_id = this.is_goodid(i.id);
		if (e_id !== true) return flip(`invalid field 'id': ${e_id}`);
		const e_date = this.is_present(i.date);
		if (e_date !== true) return flip(`invalid field 'date': ${e_date}`);

		const word = this.by_id(i.id);
		const keep = [];
		const removed_notes = [];
		for (const note of word.notes) {
			if (note.user === uname && note.date === i.date) {
				removed_notes.push(note);
			} else {
				keep.push(note);
			}
		}
		if (keep.length === word.notes.length) {
			return flip('no such note by you');
		}
		word.notes = keep;
		for (const note of removed_notes) {
			emitter.emit('removenote', word, note);
		}
		return good({ entry: this.present(word, uname) });
	}

	public async create(i: any, uname: string): Promise<ApiResponse> {
		if (!uname) return flip('must be logged in');
		const e_head = this.is_nobomb(i.head);
		if (e_head !== true) return flip(`invalid field 'head': ${e_head}`);
		const e_body = this.is_nobomb(i.body);
		if (e_body !== true) return flip(`invalid field 'body': ${e_body}`);
		const e_scope = this.is_scope(i.scope);
		if (e_scope !== true) return flip(`invalid field 'scope': ${e_scope}`);

		// Abort if an entry with exactly the same head, body, and scope exists
		const normalizedHead = shared.normalize(i.head);
		const normalizedBody = replacements(i.body);
		const scope = i.scope;
		const exists = this.store.db.entries.some(
			e =>
				e.head === normalizedHead &&
				e.body === normalizedBody &&
				e.frame === i.frame &&
				e.pronominal_class === i.pronominal_class &&
				e.subject === i.subject &&
				e.distribution === i.distribution &&
				e.user === uname &&
				e.scope === scope,
		);
		if (exists) return flip('entry already exists');

		const id = shortid.generate();
		const this_entry: Entry = {
			id,
			date: new Date().toISOString(),
			head: normalizedHead,
			body: normalizedBody,
			user: uname,
			scope: i.scope,
			notes: [],
			votes: {},
			score: 0,
			pronominal_class: i.pronominal_class,
			frame: i.frame,
			distribution: i.distribution,
			subject: i.subject,
		};
		this.store.db.entries.push(this_entry);
		emitter.emit('create', this_entry);
		return good({ entry: this.present(this_entry, uname) });
	}

	public async login(i: any): Promise<ApiResponse> {
		const e_name = this.is_present(i.name);
		if (e_name !== true) return flip(`invalid field 'name': ${e_name}`);
		const e_pass = this.is_present(i.pass);
		if (e_pass !== true) return flip(`invalid field 'pass': ${e_pass}`);

		const expected = this.store.pass.hashes[i.name];
		if (!expected) return flip('user not registered');
		if (bcrypt.compareSync(i.pass, expected)) {
			const token = uuid.v4();
			this.store.pass.tokens[token] = { name: i.name, last: +new Date() };
			return good({ token });
		}
		return flip("password doesn't match");
	}

	public async register(i: any, uname: string): Promise<ApiResponse> {
		if (!i.name.match(/^[a-zA-Z]{1,64}$/)) {
			return flip(`invalid field 'id': name must be 1-64 Latin characters`);
		}
		const e_pass = limit(128)(i.pass);
		if (e_pass !== true) return flip(`invalid field 'pass': ${e_pass}`);

		if (process.env.NODE_ENV !== 'development')
			return flip('registrations are temporarily disabled');

		if (this.store.pass.hashes[i.name]) return flip('already registered');
		this.store.pass.hashes[i.name] = bcrypt.hashSync(
			i.pass,
			this.config.password_rounds,
		);
		return await this.login({ name: i.name, pass: i.pass });
	}

	public async logout(i: any, uname: string): Promise<ApiResponse> {
		if (!uname) return flip('must be logged in');
		delete this.store.pass.tokens[i.token];
		return good();
	}

	public async remove(i: any, uname: string): Promise<ApiResponse> {
		if (!uname) return flip('must be logged in');
		const e_id = this.is_goodid(i.id);
		if (e_id !== true) return flip(`invalid field 'id': ${e_id}`);
		const index = this.index_of(i.id);
		const entry = this.store.db.entries[index];
		if (entry.user !== uname)
			return flip('you are not the owner of this entry');
		this.store.db.entries.splice(index, 1);
		emitter.emit('remove', entry);
		return good();
	}

	// `sudoUname` is used to override the user – a kind of sudo mode
	public async call(i: any, sudoUname?: string): Promise<ApiResponse> {
		const time = +new Date();
		const action =
			Object.hasOwn(this.actions, i.action) && this.actions[i.action];
		if (!action) {
			console.log(`%% action '${i.action}' unknown`);
			return flip('unknown action');
		}
		let uname: string | undefined = sudoUname;
		let tokenExpired = false;
		if (!uname && 'token' in i && typeof i.token === 'string') {
			const token = this.store.pass.tokens[i.token];
			if (token) {
				uname = token.name;
				const now = +new Date();
				if (now > token.last + this.config.token_expiry) {
					delete this.store.pass.tokens[i.token];
					tokenExpired = true;
				} else this.store.pass.tokens[i.token].last = now;
			}
		}
		const entries = Object.entries(i)
			.filter(
				([k, v]) =>
					// Object.keys({ ...(action.checks || {}), uname: uname }).includes(k) &&
					k !== 'pass',
			)
			.map(([k, v]) => `${k}=${JSON.stringify(v)}`)
			.join(', ');
		console.log(`%% ${i.action}(${entries})`);
		try {
			const result = await action(i, uname);
			console.log(`${i.action} returned in ${Date.now() - time} ms`);
			if (
				result.success === false &&
				result.error === 'must be logged in' &&
				tokenExpired
			) {
				result.error = 'token has expired';
			}
			return result;
		} catch (e) {
			console.log(`an error occurred: ${e.stack}`);
			return flip('internal error');
		}
	}

	constructor(store: Store, config: ToaduaConfig) {
		this.store = store;
		this.config = config;
		this.actions = {
			welcome: this.welcome.bind(this),
			create: this.create.bind(this),
			search: this.search.bind(this),
			count: this.count.bind(this),
			vote: this.vote.bind(this),
			note: this.note.bind(this),
			edit: this.edit.bind(this),
			annotate: this.annotate.bind(this),
			removenote: this.removenote.bind(this),
			remove: this.remove.bind(this),
			logout: this.logout.bind(this),
			register: this.register.bind(this),
			login: this.login.bind(this),
		};
	}
}
