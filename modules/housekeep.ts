// modules/housekeep.js
// tamper with the database store

import type * as commons from '../core/commons.js';
import type { Token } from '../core/commons.js';
import * as search from '../core/search.js';
import * as shared from '../frontend/shared/index.js';

export class HousekeepModule {
	public up(store: commons.Store, config: commons.ToaduaConfig) {
		console.log(`~~ housekeeping ${store.db.entries.length} entries`);
		const now = +new Date();
		const entries: [string, Token][] = Object.entries(store.pass.tokens);
		for (const [k, { last }] of entries)
			if (now > last + config.token_expiry) delete store.pass.tokens[k];

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
				didReform ||= reform(entry, 'body', shared.normalize);

			const normalizePlaceholders = s =>
				s.replace(/___|◌(?!\p{Diacritic})/gu, '▯');
			didReform ||= reform(entry, 'body', normalizePlaceholders);
			for (const note of entry.notes)
				didReform ||= reform(note, 'content', normalizePlaceholders);

			if (didReform) reformed++;
		}
		if (reformed) console.log(`reformed ${reformed} entries`);

		search.recache(store);
	}
}
