// api.ts
// implementation for the API

import { deburr, config, store, emitter, type Entry } from './commons.js';
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

// `sudoUname` is used to override the user – a kind of sudo mode
export async function call(i: any, sudoUname?: string): Promise<ApiResponse> {
	const time = +new Date();
	const action = Object.hasOwn(actions, i.action) && actions[i.action];
	if (!action) {
		console.log(`%% action '${i.action}' unknown`);
		return flip('unknown action');
	}
	let uname: string | undefined = sudoUname;
	let tokenExpired = false;
	if (!uname && 'token' in i && typeof i.token === 'string') {
		const token = store.pass.tokens[i.token];
		if (token) {
			uname = token.name;
			const now = +new Date();
			if (now > token.last + config.token_expiry) {
				delete store.pass.tokens[i.token];
				tokenExpired = true;
			} else store.pass.tokens[i.token].last = now;
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

if (!store.db) store.db = { entries: [] };
if (!store.pass) store.pass = { hashes: {}, tokens: {} };

const actions: Record<string, Action> = {};

const flip = (e: string): ApiError => ({ success: false, error: e });
const good = (d?: ApiBody): ApiResponse => ({ success: true, ...d });

const limit = (lim: number) => (i: unknown) =>
	!i || typeof i !== 'string'
		? 'absent'
		: i.length <= lim || `too long (max. ${lim} characters)`;

const checks = {
	present: i => !!i || 'absent',
	scope: i =>
		!(i && typeof i === 'string')
			? 'scope is not string'
			: !!i.match(/^[a-z-]{1,24}$/) || 'scope must match [a-z-]{1,24}',
	number: i => (i && typeof i === 'number') || 'not a valid number',
	uuid: i =>
		/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(i) ||
		'not a valid token UUID',
	shortid: i => (i && shortid.isValid(i)) || 'not a valid ID',
	goodid: i =>
		(checks.shortid(i) && index_of(i) !== -1) || 'not a recognised ID',
	limit,
	nobomb: limit(2048),
	optional:
		<S>(f: (s: S) => true | string) =>
		(s: S) =>
			s === undefined || f(s),
};

export function index_of(id: string): number {
	return store.db.entries.findIndex(_ => _.id === id);
}

export function by_id(id: string): Entry {
	return store.db.entries[index_of(id)];
}

function present(e: Entry, uname: string | undefined): PresentedEntry {
	return {
		...e,
		votes: undefined,
		vote: uname ? e.votes[uname] || 0 : undefined,
	};
}

actions.welcome = async (i, uname) => {
	return good({ name: uname });
};

actions.search = async (i, uname) => {
	const e_query = checks.present(i.query);
	if (e_query !== true) return flip(`invalid field 'query': ${e_query}`);
	const e_ordering = checks.optional(checks.nobomb)(i.ordering);
	if (e_ordering !== true)
		return flip(`invalid field 'ordering': ${e_ordering}`);
	const e_limit = checks.optional(checks.number)(i.limit);
	if (e_limit !== true) return flip(`invalid field 'limit': ${e_limit}`);
	const e_preferred_scope = checks.optional(checks.scope)(i.preferred_scope);
	if (e_preferred_scope !== true)
		return flip(`invalid field 'preferred_scope': ${e_preferred_scope}`);
	const e_preferred_scope_bias = checks.optional(checks.number)(
		i.preferred_scope_bias,
	);
	if (e_preferred_scope_bias !== true)
		return flip(
			`invalid field 'preferred_scope_bias': ${e_preferred_scope_bias}`,
		);
	const data = search.search(i, uname);
	if (typeof data === 'string') return flip(data);
	return good({ results: data });
};

actions.count = async (i, uname) => {
	return good({ count: store.db.entries.length });
};

actions.vote = async (i, uname) => {
	if (!uname) return flip('must be logged in');
	const e_id = checks.goodid(i.id);
	if (e_id !== true) return flip(`invalid field 'id': ${e_id}`);
	const e_vote = [-1, 0, 1].includes(i.vote) || 'invalid vote';
	if (e_vote !== true) return flip(`invalid field 'id': ${e_id}`);

	const e = by_id(i.id);
	const old_vote = e.votes[uname] || 0;
	e.votes[uname] = i.vote;
	e.score += i.vote - old_vote;

	const cleanup = config.modules['modules/cleanup.js'];
	if (cleanup.enabled) {
		const culpable = !cleanup.users || cleanup.users.includes(e.user);
		const bad = e.score <= cleanup.vote_threshold;
		if (culpable && bad) {
			await call({ action: 'remove', id: e.id }, e.user);
			console.log(`-- ${e.head} weeded out`);
		}
	}

	emitter.emit('vote', e, uname);
	return good({ entry: present(e, uname) });
};

actions.note = async (i, uname) => {
	if (!uname) return flip('must be logged in');
	const e_id = checks.goodid(i.id);
	if (e_id !== true) return flip(`invalid field 'id': ${e_id}`);
	const e_content = checks.nobomb(i.content);
	if (e_content !== true) return flip(`invalid field 'content': ${e_content}`);

	const word = by_id(i.id);
	const this_note = {
		date: new Date().toISOString(),
		user: uname,
		content: replacements(i.content),
	};
	word.notes.push(this_note);
	emitter.emit('note', word, this_note);
	return good({ entry: present(word, uname) });
};

actions.edit = async (i, uname) => {
	if (!uname) return flip('must be logged in');
	const e_id = checks.goodid(i.id);
	if (e_id !== true) return flip(`invalid field 'id': ${e_id}`);
	const e_body = checks.nobomb(i.body);
	if (e_body !== true) return flip(`invalid field 'body': ${e_body}`);
	const e_scope = checks.scope(i.scope);
	if (e_scope !== true) return flip(`invalid field 'scope': ${e_scope}`);

	const word = by_id(i.id);
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
	return good({ entry: present(word, uname) });
};

actions.removenote = async (i, uname) => {
	if (!uname) return flip('must be logged in');
	const e_id = checks.goodid(i.id);
	if (e_id !== true) return flip(`invalid field 'id': ${e_id}`);
	const e_date = checks.present(i.date);
	if (e_date !== true) return flip(`invalid field 'date': ${e_date}`);

	const word = by_id(i.id);
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
	return good({ entry: present(word, uname) });
};

export const replacements = (s: string): string =>
	s.replace(/___/g, '▯').replace(/\s+$/g, '').normalize('NFC');

actions.create = async (i, uname) => {
	if (!uname) return flip('must be logged in');
	const e_head = checks.nobomb(i.head);
	if (e_head !== true) return flip(`invalid field 'head': ${e_head}`);
	const e_body = checks.nobomb(i.body);
	if (e_body !== true) return flip(`invalid field 'body': ${e_body}`);
	const e_scope = checks.scope(i.scope);
	if (e_scope !== true) return flip(`invalid field 'scope': ${e_scope}`);

	// Abort if an entry with exactly the same head, body, and scope exists
	const normalizedHead = shared.normalize(i.head);
	const normalizedBody = replacements(i.body);
	const scope = i.scope;
	const exists = store.db.entries.some(
		e =>
			e.head === normalizedHead &&
			e.body === normalizedBody &&
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
	};
	store.db.entries.push(this_entry);
	emitter.emit('create', this_entry);
	return good({ entry: present(this_entry, uname) });
};

actions.login = async i => {
	const e_name = checks.present(i.name);
	if (e_name !== true) return flip(`invalid field 'name': ${e_name}`);
	const e_pass = checks.present(i.pass);
	if (e_pass !== true) return flip(`invalid field 'pass': ${e_pass}`);

	const expected = store.pass.hashes[i.name];
	if (!expected) return flip('user not registered');
	if (bcrypt.compareSync(i.pass, expected)) {
		const token = uuid.v4();
		store.pass.tokens[token] = { name: i.name, last: +new Date() };
		return good({ token });
	}
	return flip("password doesn't match");
};

actions.register = async (i: any, uname: string) => {
	if (!i.name.match(/^[a-zA-Z]{1,64}$/)) {
		return flip(`invalid field 'id': name must be 1-64 Latin characters`);
	}
	const e_pass = checks.limit(128)(i.pass);
	if (e_pass !== true) return flip(`invalid field 'pass': ${e_pass}`);

	if (process.env.NODE_ENV !== 'development')
		return flip('registrations are temporarily disabled');

	if (store.pass.hashes[i.name]) return flip('already registered');
	store.pass.hashes[i.name] = bcrypt.hashSync(i.pass, config.password_rounds);
	return await actions.login({ name: i.name, pass: i.pass });
};

actions.logout = async (i: any, uname: string) => {
	if (!uname) return flip('must be logged in');
	delete store.pass.tokens[i.token];
	return good();
};

actions.remove = async (i: any, uname: string) => {
	if (!uname) return flip('must be logged in');
	const e_id = checks.goodid(i.id);
	if (e_id !== true) return flip(`invalid field 'id': ${e_id}`);
	const index = index_of(i.id);
	const entry = store.db.entries[index];
	if (entry.user !== uname) return flip('you are not the owner of this entry');
	store.db.entries.splice(index, 1);
	emitter.emit('remove', entry);
	return good();
};
