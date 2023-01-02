// modules/housekeep.js
// tamper with the database store

'use strict';
import * as commons from '../core/commons';
import { Token } from '../core/commons';
import * as search from '../core/search';
import * as shared from '../frontend/shared';
let { store, config } = commons;

let first_go = true;
export function state_change() {
	if (!first_go) return;
	first_go = false;

	store.db.count = store.db.entries.length;

	let now = +new Date();
	const entries: [string, Token][] = Object.entries(store.pass.tokens);
	for (let [k, { last }] of entries)
		if (now > last + config().token_expiry) delete store.pass.tokens[k];

	let reformed = 0;
	const reform = (e, p, f) => {
		let normalized = f(e[p]);
		let retval = normalized !== e[p];
		e[p] = normalized;
		return retval;
	};
	for (let entry of store.db.entries) {
		// update to modern Toaq
		let didReform = reform(entry, 'head', shared.normalize);
		if (entry.scope === 'toa')
			didReform ||= reform(entry, 'body', shared.normalize);

		const normalizePlaceholders = s => s.replace(/___|◌/g, '▯');
		didReform ||= reform(entry, 'body', normalizePlaceholders);
		for (let note of entry.notes)
			didReform ||= reform(note, 'content', normalizePlaceholders);

		if (didReform) reformed++;
	}
	if (reformed) console.log(`reformed ${reformed} entries`);

	search.recache();
}
