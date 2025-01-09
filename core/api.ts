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

type Ret = (response: ApiResponse) => any;

type ActionFunction = (ret: Ret, i: any, uname?: string) => void;
type Action = ActionFunction;

// `sudoUname` is used to override the user – a kind of sudo mode
export function call(i: any, baseRet: Ret, sudoUname?: string) {
	const time = +new Date();
	const action = Object.hasOwn(actions, i.action) && actions[i.action];
	if (!action) {
		console.log(`%% action '${i.action}' unknown`);
		return baseRet(flip('unknown action'));
	}
	let ret: Ret = baseRet;
	let uname: string | undefined = sudoUname;
	if (!uname && 'token' in i && typeof i.token === 'string') {
		const token = store.pass.tokens[i.token];
		if (token) {
			uname = token.name;
			const now = +new Date();
			if (now > token.last + config.token_expiry) {
				delete store.pass.tokens[i.token];
				ret = (old_ret => data => {
					if (data.success === false && data.error === 'must be logged in')
						old_ret(flip('token has expired'));
					else old_ret(data);
				})(ret);
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
		ret = (old_ret => data => {
			console.log(`${i.action} returned in ${Date.now() - time} ms`);
			old_ret(data);
		})(ret);
		action(baseRet, i, uname);
	} catch (e) {
		console.log(`an error occurred: ${e.stack}`);
		ret(flip('internal error'));
	}
}

if (!store.db) store.db = { entries: [] };
if (!store.pass) store.pass = { hashes: {}, tokens: {} };

const actions: Record<string, Action> = {};

const flip = (e: string): ApiError => ({ success: false, error: e });
const good = (d?: ApiBody): ApiResponse => ({ success: true, ...d });

type Check = (x: any) => true | string;

function guard(
	logged_in: boolean,
	conds: Record<string, Check>,
	f: ActionFunction,
): Action {
	const res: Action = (ret, i: object, uname: string | undefined) => {
		if (logged_in && !uname) return ret(flip('must be logged in'));
		if (conds)
			for (const [k, v] of Object.entries(conds)) {
				const err = v(i[k]);
				if (err !== true) return ret(flip(`invalid field '${k}'${`: ${err}`}`));
			}
		f(ret, i, uname);
	};
	return res;
}

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

actions.welcome = guard(false, {}, (ret, i, uname) =>
	ret(good({ name: uname })),
);

actions.search = guard(
	false,
	{
		query: checks.present,
		ordering: checks.optional(checks.nobomb),
		limit: checks.optional(checks.number),
		preferred_scope: checks.optional(checks.scope),
		preferred_scope_bias: checks.optional(checks.number),
	},
	(ret, i, uname) => {
		const data = search.search(i, uname);
		if (typeof data === 'string') ret(flip(data));
		else ret(good({ results: data }));
	},
);

actions.count = guard(false, {}, (ret, i, uname) => {
	ret(good({ count: store.db.entries.length }));
});

actions.vote = guard(
	true,
	{
		id: checks.goodid,
		vote: _ => [-1, 0, 1].includes(_) || 'invalid vote',
	},
	(ret, i, uname) => {
		const e = by_id(i.id);
		const old_vote = e.votes[uname] || 0;
		e.votes[uname] = i.vote;
		e.score += i.vote - old_vote;
		ret(good({ entry: present(e, uname) }));

		const cleanup = config.modules['modules/cleanup.js'];
		if (cleanup.enabled) {
			const culpable = !cleanup.users || cleanup.users.includes(e.user);
			const bad = e.score <= cleanup.vote_threshold;
			if (culpable && bad) {
				call(
					{ action: 'remove', id: e.id },
					() => console.log(`-- ${e.head} weeded out`),
					e.user,
				);
			}
		}

		emitter.emit('vote', e, uname);
	},
);

actions.note = (ret, i, uname) => {
	if (!uname) return ret(flip('must be logged in'));
	const e_id = checks.goodid(i.id);
	if (e_id !== true) return ret(flip(`invalid field 'id': ${e_id}`));
	const e_content = checks.nobomb(i.content);
	if (e_content !== true)
		return ret(flip(`invalid field 'content': ${e_content}`));

	const word = by_id(i.id);
	const this_note = {
		date: new Date().toISOString(),
		user: uname,
		content: replacements(i.content),
	};
	word.notes.push(this_note);
	ret(good({ entry: present(word, uname) }));
	emitter.emit('note', word, this_note);
};

actions.edit = (ret, i, uname) => {
	if (!uname) return ret(flip('must be logged in'));
	const e_id = checks.goodid(i.id);
	if (e_id !== true) return ret(flip(`invalid field 'id': ${e_id}`));
	const e_body = checks.nobomb(i.body);
	if (e_body !== true) return ret(flip(`invalid field 'body': ${e_body}`));
	const e_scope = checks.scope(i.scope);
	if (e_scope !== true) return ret(flip(`invalid field 'scope': ${e_scope}`));

	const word = by_id(i.id);
	if (word.user !== uname) {
		return ret(flip('you are not the owner of this entry'));
	}
	const new_body = replacements(i.body);
	const body_changed = word.body !== new_body;
	const scope_changed = word.scope !== i.scope;
	word.body = new_body;
	word.scope = i.scope;
	ret(good({ entry: present(word, uname) }));
	if (body_changed) {
		emitter.emit('edit', word);
	} else if (scope_changed) {
		emitter.emit('move', word);
	}
};

actions.removenote = (ret, i, uname) => {
	if (!uname) return ret(flip('must be logged in'));
	const e_id = checks.goodid(i.id);
	if (e_id !== true) return ret(flip(`invalid field 'id': ${e_id}`));
	const e_date = checks.present(i.date);
	if (e_date !== true) return ret(flip(`invalid field 'date': ${e_date}`));

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
		return ret(flip('no such note by you'));
	}
	word.notes = keep;
	for (const note of removed_notes) {
		emitter.emit('removenote', word, note);
	}
	ret(good({ entry: present(word, uname) }));
};

export const replacements = (s: string): string =>
	s.replace(/___/g, '▯').replace(/\s+$/g, '').normalize('NFC');

actions.create = (ret, i, uname) => {
	if (!uname) return ret(flip('must be logged in'));
	const e_head = checks.nobomb(i.head);
	if (e_head !== true) return ret(flip(`invalid field 'head': ${e_head}`));
	const e_body = checks.nobomb(i.body);
	if (e_body !== true) return ret(flip(`invalid field 'body': ${e_body}`));
	const e_scope = checks.scope(i.scope);
	if (e_scope !== true) return ret(flip(`invalid field 'scope': ${e_scope}`));

	const id = shortid.generate();
	const this_entry: Entry = {
		id,
		date: new Date().toISOString(),
		head: shared.normalize(i.head),
		body: replacements(i.body),
		user: uname,
		scope: i.scope,
		notes: [],
		votes: {},
		score: 0,
	};
	store.db.entries.push(this_entry);
	ret(good({ entry: present(this_entry, uname) }));
	emitter.emit('create', this_entry);
};

actions.login = (ret, i) => {
	const e_name = checks.present(i.name);
	if (e_name !== true) return ret(flip(`invalid field 'name': ${e_name}`));
	const e_pass = checks.present(i.pass);
	if (e_pass !== true) return ret(flip(`invalid field 'pass': ${e_pass}`));

	const expected = store.pass.hashes[i.name];
	if (!expected) return ret(flip('user not registered'));
	if (bcrypt.compareSync(i.pass, expected)) {
		const token = uuid.v4();
		store.pass.tokens[token] = { name: i.name, last: +new Date() };
		ret(good({ token }));
	} else ret(flip("password doesn't match"));
};

actions.register = (ret: Ret, i: any, uname: string) => {
	if (!i.name.match(/^[a-zA-Z]{1,64}$/)) {
		return ret(flip(`invalid field 'id': name must be 1-64 Latin characters`));
	}
	const e_pass = checks.limit(128)(i.pass);
	if (e_pass !== true) ret(flip(`invalid field 'pass': ${e_pass}`));

	return ret(flip('registrations are temporarily disabled'));
	// if (store.pass.hashes[i.name]) return ret(flip('already registered'));
	// store.pass.hashes[i.name] = bcrypt.hashSync(
	// 	i.pass,
	// 	config.password_rounds,
	// );
	// actions.login(ret, { name: i.name, pass: i.pass });
};

actions.logout = (ret: Ret, i: any, uname: string) => {
	if (!uname) return ret(flip('must be logged in'));
	delete store.pass.tokens[i.token];
	ret(good());
};

actions.remove = (ret: Ret, i: any, uname: string) => {
	if (!uname) return ret(flip('must be logged in'));
	const e_id = checks.goodid(i.id);
	if (e_id !== true) return ret(flip(`invalid field 'id': ${e_id}`));
	const index = index_of(i.id);
	const entry = store.db.entries[index];
	if (entry.user !== uname)
		return ret(flip('you are not the owner of this entry'));
	store.db.entries.splice(index, 1);
	ret(good());
	emitter.emit('remove', entry);
};
