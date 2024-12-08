// api.ts
// implementation for the API

import { deburr, config, store, emitter, Entry } from './commons.js';
import * as search from './search.js';
import * as shared from '../frontend/shared/index.js';
import * as shortid from 'shortid';
import * as uuid from 'uuid';
// @ts-ignore the types incorrectly claim bcryptjs to be an ES Module
import bcryptjs from 'bcryptjs';
import type * as bcryptjs_types from 'bcryptjs';
import { PresentedEntry } from './search.js';

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

type ActionFunction = (
	ret: (response: ApiResponse) => any,
	i: any,
	uname?: string,
) => void;
type Action = ActionFunction & { checks: Record<string, Check> };

// `uname` is used to override the user – a kind of sudo mode
export function call(
	i: any,
	ret: (response: ApiResponse) => any,
	uname?: string,
) {
	let time = +new Date();
	let action = actions.hasOwnProperty(i.action) && actions[i.action];
	if (!action) {
		console.log(`%% action '${i.action}' unknown`);
		return ret(flip('unknown action'));
	}
	if (!uname && 'token' in i && typeof i.token === 'string') {
		let token = store.pass.tokens[i.token];
		if (token) {
			uname = token.name;
			let now = +new Date();
			if (now > token.last + config().token_expiry) {
				delete store.pass.tokens[i.token];
				ret = (old_ret => data => {
					if (data.success === false && data.error === 'must be logged in')
						old_ret(flip('token has expired'));
					else old_ret(data);
				})(ret);
			} else store.pass.tokens[i.token].last = now;
		}
	}
	let entries = Object.entries(i)
		.filter(
			([k, v]) =>
				Object.keys({ ...(action.checks || {}), uname: uname }).includes(k) &&
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
		action(ret, i, uname);
	} catch (e) {
		console.log(`an error occurred: ${e.stack}`);
		ret(flip('internal error'));
	}
}

if (!store.db) store.db = { entries: [] };
if (!store.pass) store.pass = { hashes: {}, tokens: {} };

let actions: Record<string, Action> = {};

const flip = (e: string): ApiError => ({ success: false, error: e });
const good = (d?: ApiBody): ApiResponse => ({ success: true, ...d });

type Check = (x: any) => true | string;

function guard(
	logged_in: boolean,
	conds: Record<string, Check>,
	f: ActionFunction,
): Action {
	let res: any = (ret, i: object, uname: string | undefined) => {
		if (logged_in && !uname) return ret(flip('must be logged in'));
		if (conds)
			for (let [k, v] of Object.entries(conds)) {
				let err = v(i[k]);
				if (err !== true) return ret(flip(`invalid field '${k}'${`: ${err}`}`));
			}
		f(ret, i, uname);
	};
	res.checks = conds;
	return res;
}

const limit = (lim: number) => (i: any) =>
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
	return store.db.entries.findIndex(_ => _.id == id);
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
		let data = search.search(i, uname);
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
		let e = by_id(i.id);
		let old_vote = e.votes[uname] || 0;
		e.votes[uname] = i.vote;
		e.score += i.vote - old_vote;
		ret(good({ entry: present(e, uname) }));
		emitter.emit('vote', e, uname);
	},
);

actions.note = guard(
	true,
	{
		id: checks.goodid,
		content: checks.nobomb,
	},
	(ret, i, uname) => {
		let word = by_id(i.id);
		let this_note = {
			date: new Date().toISOString(),
			user: uname,
			content: replacements(i.content),
		};
		word.notes.push(this_note);
		ret(good({ entry: present(word, uname) }));
		emitter.emit('note', word, this_note);
	},
);

actions.edit = guard(
	true,
	{
		id: checks.goodid,
		body: checks.nobomb,
		scope: checks.scope,
	},
	(ret, i, uname) => {
		let word = by_id(i.id);
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
	},
);

actions.removenote = guard(
	true,
	{
		id: checks.goodid,
		date: checks.present,
	},
	(ret, i, uname) => {
		let word = by_id(i.id);
		let keep = [];
		let removed_notes = [];
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
	},
);

export const replacements = (s: string): string =>
	s.replace(/___/g, '▯').replace(/\s+$/g, '').normalize('NFC');

actions.create = guard(
	true,
	{
		head: checks.nobomb,
		body: checks.nobomb,
		scope: checks.scope,
	},
	(ret, i, uname) => {
		let id = shortid.generate();
		let this_entry: Entry = {
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
	},
);

actions.login = guard(
	false,
	{
		name: checks.present,
		pass: checks.present,
	},
	(ret, i) => {
		let expected = store.pass.hashes[i.name];
		if (!expected) return ret(flip('user not registered'));
		if (bcrypt.compareSync(i.pass, expected)) {
			var token = uuid.v4();
			store.pass.tokens[token] = { name: i.name, last: +new Date() };
			ret(good({ token }));
		} else ret(flip("password doesn't match"));
	},
);

actions.register = guard(
	false,
	{
		name: it =>
			(it.match(/^[a-zA-Z]{1,64}$/) && true) ||
			'name must be 1-64 Latin characters',
		pass: checks.limit(128),
	},
	(ret, i) => {
		if (store.pass.hashes[i.name]) return ret(flip('already registered'));
		store.pass.hashes[i.name] = bcrypt.hashSync(
			i.pass,
			config().password_rounds,
		);
		actions.login(ret, { name: i.name, pass: i.pass });
	},
);

actions.logout = guard(true, {}, (ret, i, uname) => {
	delete store.pass.tokens[i.token];
	ret(good());
});

actions.remove = guard(
	true,
	{
		id: checks.goodid,
	},
	(ret, i, uname) => {
		let index = index_of(i.id);
		let entry = store.db.entries[index];
		if (entry.user !== uname)
			return ret(flip('you are not the owner of this entry'));
		store.db.entries.splice(index, 1);
		ret(good());
		emitter.emit('remove', entry);
	},
);
