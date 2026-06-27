import { test, describe, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdateModule } from './update.js';
import type * as commons from '../core/commons.js';

vi.mock('request-promise-native', () => ({
	default: { get: vi.fn() },
}));

vi.mock('../frontend/shared/index.js', () => ({
	normalize: vi.fn((s: string) => s.toLowerCase()),
}));

import request from 'request-promise-native';
import { Search } from '../core/search.js';
import { Api } from '../core/api.js';
import { EventEmitter } from 'node:events';

describe('UpdateModule', () => {
	let mockStore: commons.Store;
	let api: Api;
	let search: Search;
	let emitter: EventEmitter;

	beforeEach(() => {
		vi.clearAllMocks();

		mockStore = {
			db: { entries: [] },
			pass: { hashes: {}, tokens: {} },
		};

		emitter = new EventEmitter();
		search = new Search(mockStore, emitter);

		api = new Api(
			mockStore,
			{
				entry_point: 'https://example.com',
				request_body_size_limit: 1024 * 1024,
				token_expiry: 1000 * 60 * 60 * 24,
				modules: {},
				production: false,
				port: 0,
				exit_on_module_load_error: false,
				password_rounds: 1,
			},
			search,
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('sync_resources with TSV format', () => {
		test('should parse TSV data and add words to store', async () => {
			const tsvData = [
				'id\th\tb\tx',
				'123\tWORD1\tdefinition for word1\textra1',
				'124\tWORD2\tdefinition for word2\textra2',
				'125\tWORD3\tdefinition for word3\textra3',
			].join('\n');

			(request.get as any).mockResolvedValue(tsvData);

			const sources = {
				tsv_parse_test: {
					source: 'https://example.com/test.tsv',
					user: 'test_user',
					format: 'tsv' as const,
					skip: 1,
					patterns: [
						{
							head: '%(1)',
							body: 'verb: %(2)',
						},
					],
				},
			};

			const updateModule = new UpdateModule(true, api, search, sources, 60000);
			await updateModule.sync_resources(mockStore);

			expect(request.get).toHaveBeenCalledWith('https://example.com/test.tsv');

			expect(mockStore.db.entries).toHaveLength(3);
			expect(mockStore.db.entries[0]).toEqual(
				expect.objectContaining({
					head: 'word1',
					body: 'verb: definition for word1',
					scope: 'en',
					frame: undefined,
					pronominal_class: undefined,
					subject: undefined,
					distribution: undefined,
				}),
			);
			expect(mockStore.db.entries[1]).toEqual(
				expect.objectContaining({
					head: 'word2',
					body: 'verb: definition for word2',
					scope: 'en',
					frame: undefined,
					pronominal_class: undefined,
					subject: undefined,
					distribution: undefined,
				}),
			);
			expect(mockStore.db.entries[2]).toEqual(
				expect.objectContaining({
					head: 'word3',
					body: 'verb: definition for word3',
					scope: 'en',
					frame: undefined,
					pronominal_class: undefined,
					subject: undefined,
					distribution: undefined,
				}),
			);
		});

		describe('sync_resources with JSON format', () => {
			test('should parse JSON data and add words to store', async () => {
				const jsonData = JSON.stringify([
					{
						word: 'Word1',
						gloss: 'gloss1',
						definition: 'definition for word1',
						type: 'type1',
						frame: 'frame1',
						pronominal_class: 'class1',
						subject: 'subj1',
						distribution: 'dist1',
					},
					{
						word: 'Word2',
						gloss: 'gloss2',
						definition: 'definition for word2',
						type: 'type2',
						frame: 'frame2',
						pronominal_class: 'class2',
						subject: 'subj2',
						distribution: 'dist2',
					},
					{ word: 'Word3', definition: 'definition for word3' },
				]);

				(request.get as any).mockResolvedValue(jsonData);

				const sources = {
					json_parse_test: {
						source: 'https://example.com/test.json',
						user: 'json_user',
						format: 'json' as const,
						skip: 0,
						patterns: [
							{
								head: '%(word)',
								gloss: '%(gloss)',
								body: 'verb: %(definition)',
								type: '%(type)',
								frame: 'testy %(frame)',
								pronominal_class: '%(pronominal_class)',
								subject: '%(subject)',
								distribution: '%(distribution)',
							},
						],
					},
				};

				const updateModule = new UpdateModule(
					true,
					api,
					search,
					sources,
					60000,
				);
				await updateModule.sync_resources(mockStore);

				expect(request.get).toHaveBeenCalledWith(
					'https://example.com/test.json',
				);

				expect(mockStore.db.entries).toHaveLength(3);
				expect(mockStore.db.entries[0]).toEqual(
					expect.objectContaining({
						head: 'word1',
						gloss: 'gloss1',
						body: 'verb: definition for word1',
						scope: 'en',
						type: 'type1',
						frame: 'testy frame1',
						pronominal_class: 'class1',
						subject: 'subj1',
						distribution: 'dist1',
					}),
				);
				expect(mockStore.db.entries[1]).toEqual(
					expect.objectContaining({
						head: 'word2',
						gloss: 'gloss2',
						body: 'verb: definition for word2',
						scope: 'en',
						type: 'type2',
						frame: 'testy frame2',
						pronominal_class: 'class2',
						subject: 'subj2',
						distribution: 'dist2',
					}),
				);
				expect(mockStore.db.entries[2]).toEqual(
					expect.objectContaining({
						head: 'word3',
						gloss: undefined,
						body: 'verb: definition for word3',
						scope: 'en',
						type: undefined,
						frame: undefined,
						pronominal_class: undefined,
						subject: undefined,
						distribution: undefined,
					}),
				);
			});
		});
	});

	describe('sync_resources obsoleting', () => {
		test('renames stale annotated official entries to oldofficial and deletes other stale entries', async () => {
			const stale = (
				id: string,
				user: string,
				head: string,
				body: string,
			): commons.Entry => ({
				id,
				date: '2024-01-01T00:00:00.000Z',
				head,
				body,
				user,
				scope: 'en',
				notes: [],
				votes: {},
				score: 0,
				pronominal_class: undefined,
				frame: undefined,
				distribution: undefined,
				subject: undefined,
				gloss: undefined,
				type: undefined,
			});

			mockStore.db.entries.push(
				// Already up-to-date (carries metadata identical to the source).
				// Sits at the front of the db so a buggy "return" in the
				// obsoleting loop would bail out before processing the rest.
				{
					id: 'off0',
					date: '2023-01-01T00:00:00.000Z',
					head: 'choa',
					body: 'to speak',
					user: 'official',
					scope: 'en',
					notes: [],
					votes: {},
					score: 0,
					pronominal_class: 'ta',
					frame: 'c 1',
					distribution: 'd',
					subject: 'agent',
					gloss: 'speak',
					type: 'verb',
				},
				{
					...stale('off2', 'official', 'geo', 'to be old'),
					notes: [
						{
							date: '2024-06-01T00:00:00.000Z',
							user: 'someone',
							content: 'this note keeps the obsoleted entry alive',
						},
					],
				},
				stale('off3', 'official', 'gone', 'to no longer exist'),
				stale('ex1', 'examples', 'phrase1', 'old body 1'),
				stale('ex2', 'examples', 'phrase2', 'old body 2'),
			);
			search.recache();

			const officialJson = JSON.stringify([
				{
					toaq: 'choa',
					type: 'verb',
					gloss: 'speak',
					english: 'to speak',
					pronominal_class: 'ta',
					frame: 'c 1',
					distribution: 'd',
					subject: 'agent',
				},
				{
					toaq: 'geo',
					type: 'verb',
					gloss: 'old',
					english: 'to be old',
					pronominal_class: 'ta',
					frame: 'c',
					distribution: 'd',
					subject: 'individual',
				},
			]);

			const examplesTsv = [
				'header1\theader2',
				'header1\theader2',
				'phrase1\tnew body 1',
				'phrase2\tnew body 2',
			].join('\n');

			(request.get as any).mockImplementation((url: string) => {
				if (url.endsWith('official.json')) return Promise.resolve(officialJson);
				if (url.endsWith('examples.tsv')) return Promise.resolve(examplesTsv);
				return Promise.reject(new Error(`unexpected url ${url}`));
			});

			const sources = {
				official: {
					source: 'https://example.com/official.json',
					user: 'official',
					format: 'json' as const,
					skip: 0,
					patterns: [
						{
							head: '%(toaq)',
							gloss: '%(gloss)',
							body: '%(english)',
							type: '%(type)',
							frame: '%(frame)',
							pronominal_class: '%(pronominal_class)',
							subject: '%(subject)',
							distribution: '%(distribution)',
						},
					],
				},
				examples: {
					source: 'https://example.com/examples.tsv',
					user: 'examples',
					format: 'tsv' as const,
					skip: 2,
					patterns: [
						{
							head: '%(0)',
							body: '%(1)',
							pronominal_class: 'phrase',
						},
					],
				},
			};

			const updateModule = new UpdateModule(true, api, search, sources, 60000);
			await updateModule.sync_resources(mockStore);

			const byId = (id: string) => mockStore.db.entries.find(e => e.id === id);

			// off0 was already up to date and should be left alone.
			expect(byId('off0')?.user).toBe('official');
			// Stale official entry with notes is renamed to oldofficial.
			expect(byId('off2')?.user).toBe('oldofficial');
			// Stale official entry without notes is deleted.
			expect(byId('off3')).toBeUndefined();
			// Stale non-official entries are deleted entirely.
			expect(byId('ex1')).toBeUndefined();
			expect(byId('ex2')).toBeUndefined();

			const fresh = mockStore.db.entries.filter(
				e => e.user === 'official' || e.user === 'examples',
			);
			expect(fresh).toHaveLength(4);
			expect(fresh).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						user: 'official',
						head: 'choa',
						gloss: 'speak',
						body: 'to speak',
						type: 'verb',
						pronominal_class: 'ta',
						frame: 'c 1',
						distribution: 'd',
						subject: 'agent',
					}),
					expect.objectContaining({
						user: 'official',
						head: 'geo',
						gloss: 'old',
						body: 'to be old',
						type: 'verb',
						pronominal_class: 'ta',
						frame: 'c',
						distribution: 'd',
						subject: 'individual',
					}),
					expect.objectContaining({
						user: 'examples',
						head: 'phrase1',
						body: 'new body 1',
						pronominal_class: 'phrase',
					}),
					expect.objectContaining({
						user: 'examples',
						head: 'phrase2',
						body: 'new body 2',
						pronominal_class: 'phrase',
					}),
				]),
			);
		});
	});
});
