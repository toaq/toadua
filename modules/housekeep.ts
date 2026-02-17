// modules/housekeep.js
// tamper with the database store

import type * as commons from '../core/commons.js';
import type { Token } from '../core/commons.js';
import { Search } from '../core/search.js';
import * as shared from '../frontend/shared/index.js';

export class HousekeepModule {
	constructor(private search: Search) {}

	public up(store: commons.Store, config: commons.ToaduaConfig) {
		console.log(`~~ housekeeping ${store.db.entries.length} entries`);
		this.remove_old_tokens(store, config);
		this.reform_entries(store);
		this.remove_duplicates(store);
		this.search.recache();
	}

	private remove_old_tokens(
		store: commons.Store,
		config: commons.ToaduaConfig,
	) {
		const now = +new Date();
		const entries: [string, Token][] = Object.entries(store.pass.tokens);
		for (const [k, { last }] of entries)
			if (now > last + config.token_expiry) delete store.pass.tokens[k];
	}

	private reform_entries(store: commons.Store) {
		let reformed = 0;
		const reform = (
			e: commons.Entry | commons.Note,
			p: string,
			f: (value: string) => string,
		) => {
			const normalized = f(e[p]);
			const retval = normalized !== e[p];
			e[p] = normalized;
			return retval;
		};
		for (const entry of store.db.entries) {
			// update to modern Toaq
			let didReform = reform(entry, 'head', shared.normalize);
			if (entry.scope === 'toa')
				didReform = reform(entry, 'body', shared.normalize) || didReform;

			const normalizePlaceholders = s =>
				s.replace(/___|◌(?!\p{Diacritic})/gu, '▯');
			didReform = reform(entry, 'body', normalizePlaceholders) || didReform;
			for (const note of entry.notes)
				didReform = reform(note, 'content', normalizePlaceholders) || didReform;

			if (didReform) reformed++;
		}
		if (reformed) console.log(`reformed ${reformed} entries`);
	}

	private remove_duplicates(store: commons.Store) {
		const newest_version = new Map<string, commons.Entry>();
		for (const e of store.db.entries) {
			const key = `${e.user}\0${e.head}\0${e.body}\0${e.scope}`;
			const current = newest_version.get(key);
			if (current && e.date > current.date) {
				newest_version.set(key, e);
				current.scope = '';
			} else if (current && current.date >= e.date) {
				e.scope = '';
			} else {
				newest_version.set(key, e);
			}
		}
		store.db.entries = store.db.entries.filter(e => e.scope);
	}
}
