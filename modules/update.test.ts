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
						definition: 'definition for word1',
						frame: 'frame1',
						pronominal_class: 'class1',
						subject: 'subj1',
						distribution: 'dist1',
					},
					{
						word: 'Word2',
						definition: 'definition for word2',
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
								body: 'verb: %(definition)',
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
						body: 'verb: definition for word1',
						scope: 'en',
						frame: 'testy frame1',
						pronominal_class: 'class1',
						subject: 'subj1',
						distribution: 'dist1',
					}),
				);
				expect(mockStore.db.entries[1]).toEqual(
					expect.objectContaining({
						head: 'word2',
						body: 'verb: definition for word2',
						scope: 'en',
						frame: 'testy frame2',
						pronominal_class: 'class2',
						subject: 'subj2',
						distribution: 'dist2',
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
		});
	});
});
