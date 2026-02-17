import { describe, test, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type * as commons from '../core/commons.js';

import { HousekeepModule } from './housekeep.js';
import { Search } from '../core/search.js';

const makeEntry = (overrides: Partial<commons.Entry> = {}): commons.Entry => ({
	id: 'testid',
	date: '2024-01-01T00:00:00.000Z',
	head: 'head',
	body: 'body',
	user: 'user',
	scope: 'en',
	notes: [],
	votes: {},
	score: 0,
	pronominal_class: undefined,
	frame: undefined,
	distribution: undefined,
	subject: undefined,
	...overrides,
});

const makeConfig = (
	overrides: Partial<commons.ToaduaConfig> = {},
): commons.ToaduaConfig => ({
	production: false,
	entry_point: 'http://localhost/',
	port: 0,
	request_body_size_limit: 16384,
	token_expiry: 604_800_000,
	exit_on_module_load_error: false,
	password_rounds: 1,
	modules: {},
	...overrides,
});

describe('HousekeepModule', () => {
	let store: commons.Store;
	let housekeep: HousekeepModule;
	let search: Search;

	beforeEach(() => {
		vi.clearAllMocks();
		store = { db: { entries: [] }, pass: { hashes: {}, tokens: {} } };
		const emitter = new EventEmitter();
		search = new Search(store, emitter);
		vi.spyOn(search, 'recache').mockImplementation(() => {});
		housekeep = new HousekeepModule(search);
	});

	describe('token expiry', () => {
		test('deletes expired tokens while keeping fresh ones', () => {
			const now = Date.now();
			store.pass.tokens['expired1'] = { name: 'alice', last: now - 2_000_000 };
			store.pass.tokens['expired2'] = { name: 'bob', last: now - 1_000_001 };
			store.pass.tokens['fresh'] = { name: 'carol', last: now - 1000 };
			housekeep.up(store, makeConfig({ token_expiry: 1_000_000 }));
			expect(store.pass.tokens).not.toHaveProperty('expired1');
			expect(store.pass.tokens).not.toHaveProperty('expired2');
			expect(store.pass.tokens).toHaveProperty('fresh');
		});
	});

	describe('entry normalization', () => {
		test('normalizes entries', () => {
			store.db.entries = [
				makeEntry({ head: 'veva', body: '___ is veva', scope: 'en' }),
				makeEntry({ head: 'katoliq', body: 'giri ___', scope: 'toa' }),
			];
			housekeep.up(store, makeConfig());
			expect(store.db.entries).toEqual([
				makeEntry({ head: 'ꝡeꝡa', body: '▯ is veva', scope: 'en' }),
				makeEntry({ head: 'katolıq', body: 'gırı ▯', scope: 'toa' }),
			]);
		});
	});

	describe('duplicate entry removal', () => {
		test('removes duplicate entries', () => {
			store.db.entries = [
				makeEntry({
					head: 'bao',
					body: '___ is off-white',
					user: 'bob',
					scope: 'en',
					date: '2024-01-01T00:00:00.000Z',
				}),
				makeEntry({
					head: 'bao',
					body: '___ is white',
					user: 'alice',
					scope: 'en',
					date: '2024-01-01T00:00:00.000Z',
				}),
				makeEntry({
					head: 'bao',
					body: '___ is white',
					user: 'alice',
					scope: 'en',
					date: '2024-01-02T00:00:00.000Z',
				}),
			];
			housekeep.up(store, makeConfig());
			expect(store.db.entries).toEqual([
				makeEntry({
					head: 'bao',
					body: '▯ is off-white',
					user: 'bob',
					scope: 'en',
					date: '2024-01-01T00:00:00.000Z',
				}),
				makeEntry({
					head: 'bao',
					body: '▯ is white',
					user: 'alice',
					scope: 'en',
					date: '2024-01-02T00:00:00.000Z',
				}),
			]);
		});
	});
});
