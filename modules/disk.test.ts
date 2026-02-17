import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

vi.mock('node:fs');

import { DiskModule } from './disk.js';
import { Search } from '../core/search.js';
import { EventEmitter } from 'node:events';
import type * as commons from '../core/commons.js';

const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
const gz = (data: any) => zlib.gzipSync(Buffer.from(JSON.stringify(data)));

describe('DiskModule', () => {
	let store: commons.Store;
	let disk: DiskModule;

	beforeEach(() => {
		vi.clearAllMocks();
		store = { db: { entries: [] }, pass: { hashes: {}, tokens: {} } };
		const emitter = new EventEmitter();
		const search = new Search(store, emitter);
		vi.spyOn(search, 'recache').mockImplementation(() => {});
		disk = new DiskModule(search, 1e9, 1e9);
	});

	describe('up', () => {
		test('populates store from disk', () => {
			const dbData = { entries: [{ head: 'foo', body: 'bar' }] };
			const passData = { hashes: { user: 'hash' }, tokens: {} };
			vi.mocked(fs.readFileSync)
				.mockReturnValueOnce(gz(dbData))
				.mockReturnValueOnce(gz(passData));

			disk.up(store);

			expect(store.db).toEqual(dbData);
			expect(store.pass).toEqual(passData);
		});

		test('uses defaults when files are missing', () => {
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw enoent();
			});
			vi.mocked(fs.statSync).mockImplementation(() => {
				throw enoent();
			});

			disk.up(store);

			expect(store.db).toEqual({ entries: [] });
			expect(store.pass).toEqual({ hashes: {}, tokens: {} });
		});

		test('writes defaults to disk when files are missing', () => {
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw enoent();
			});
			vi.mocked(fs.statSync).mockImplementation(() => {
				throw enoent();
			});

			disk.up(store);

			expect(fs.writeFileSync).toHaveBeenCalledWith(
				'data/dict.json.gz~',
				gz(store.db),
			);
			expect(fs.renameSync).toHaveBeenCalledWith(
				'data/dict.json.gz~',
				'data/dict.json.gz',
			);
			expect(fs.writeFileSync).toHaveBeenCalledWith(
				'data/accounts.json.gz~',
				gz(store.pass),
			);
			expect(fs.renameSync).toHaveBeenCalledWith(
				'data/accounts.json.gz~',
				'data/accounts.json.gz',
			);
		});
	});

	describe('down', () => {
		test('writes gzipped data to disk', () => {
			vi.mocked(fs.statSync).mockImplementation(() => {
				throw enoent();
			});

			disk.down(store);

			expect(fs.writeFileSync).toHaveBeenCalledWith(
				'data/dict.json.gz~',
				gz(store.db),
			);
			expect(fs.renameSync).toHaveBeenCalledWith(
				'data/dict.json.gz~',
				'data/dict.json.gz',
			);
			expect(fs.writeFileSync).toHaveBeenCalledWith(
				'data/accounts.json.gz~',
				gz(store.pass),
			);
			expect(fs.renameSync).toHaveBeenCalledWith(
				'data/accounts.json.gz~',
				'data/accounts.json.gz',
			);
		});

		test('refuses to overwrite when new data is <50% of old file size', () => {
			vi.mocked(fs.statSync)
				.mockReturnValueOnce({ size: 10000 } as fs.Stats) // dict
				.mockImplementation(() => {
					throw enoent();
				}); // accounts

			disk.down(store);
			// should refuse to rename the dict backup:
			expect(fs.writeFileSync).toHaveBeenCalledWith(
				'data/dict.json.gz~',
				gz(store.db),
			);
			expect(fs.renameSync).not.toHaveBeenCalledWith(
				'data/dict.json.gz~',
				'data/dict.json.gz',
			);
			// but should rename the accounts backup:
			expect(fs.writeFileSync).toHaveBeenCalledWith(
				'data/accounts.json.gz~',
				gz(store.pass),
			);
			expect(fs.renameSync).toHaveBeenCalledWith(
				'data/accounts.json.gz~',
				'data/accounts.json.gz',
			);
		});
	});
});
