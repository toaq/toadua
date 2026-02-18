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
		this.remove_invalid_entries(store);
		this.remove_unnecessary_oldofficial(store);

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
		for (const entry of store.db.entries) {
			let didReform = false;

			// update to modern Toaq
			const normalizedHead = shared.normalize(entry.head);
			if (normalizedHead !== entry.head) {
				entry.head = normalizedHead;
				didReform = true;
			}

			if (entry.scope === 'toa') {
				const normalizedBody = shared.normalize(entry.body);
				if (normalizedBody !== entry.body) {
					entry.body = normalizedBody;
					didReform = true;
				}
			}

			const placeholderRegex = /___|◌(?!\p{Diacritic})/gu;
			const normalizedBody = entry.body.replace(placeholderRegex, '▯');
			if (normalizedBody !== entry.body) {
				entry.body = normalizedBody;
				didReform = true;
			}

			for (const note of entry.notes) {
				const normalizedContent = note.content.replace(placeholderRegex, '▯');
				if (normalizedContent !== note.content) {
					note.content = normalizedContent;
					didReform = true;
				}
			}

			if (didReform) reformed++;
		}
		if (reformed) console.log(`reformed ${reformed} entries`);
	}

	private remove_duplicates(store: commons.Store) {
		const newest_version = new Map<string, commons.Entry>();
		for (const e of store.db.entries) {
			const key = `${e.user}\0${e.head}\0${e.body}\0${e.scope}`;
			const other = newest_version.get(key);
			if (other && other.date >= e.date) {
				e.scope = '';
			} else {
				if (other) other.scope = '';
				newest_version.set(key, e);
			}
		}
		store.db.entries = store.db.entries.filter(e => e.scope);
	}

	private remove_invalid_entries(store: commons.Store) {
		// A previous bug caused the string "undefined" to show up in this field.
		store.db.entries = store.db.entries.filter(
			e => e.pronominal_class === 'undefined',
		);
	}

	private remove_unnecessary_oldofficial(store: commons.Store) {
		store.db.entries = store.db.entries.filter(
			e => e.user !== 'oldofficial' || e.notes.length > 0,
		);
	}
}
