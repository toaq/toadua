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

			expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
			expect(fs.renameSync).toHaveBeenCalledTimes(2);
		});
	});

	describe('down', () => {
		test('writes gzipped data to disk', () => {
			vi.mocked(fs.statSync).mockImplementation(() => {
				throw enoent();
			});

			disk.down(store);

			expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
			expect(fs.renameSync).toHaveBeenCalledTimes(2);
		});

		test('refuses to overwrite when new data is <50% of old file size', () => {
			vi.mocked(fs.statSync)
				.mockReturnValueOnce({ size: 10000 } as fs.Stats) // dict: large, guard triggers
				.mockImplementation(() => {
					throw enoent();
				}); // accounts: new file

			disk.down(store);

			// dict backup is written but not renamed; accounts backup is written and renamed
			expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
			expect(fs.renameSync).toHaveBeenCalledTimes(1);
		});

		test('retries writeFileSync up to 3 times', () => {
			vi.mocked(fs.statSync).mockImplementation(() => {
				throw enoent();
			});
			const diskErr = new Error('disk full');
			vi.mocked(fs.writeFileSync)
				.mockImplementationOnce(() => {
					throw diskErr;
				})
				.mockImplementationOnce(() => {
					throw diskErr;
				})
				.mockImplementation(() => {}); // succeeds on 3rd try for dict

			disk.down(store);

			// dict: 2 failures + 1 success; accounts: 1 success
			expect(fs.writeFileSync).toHaveBeenCalledTimes(4);
			expect(fs.renameSync).toHaveBeenCalledTimes(2);
		});

		test('gives up after 3 failed writeFileSync attempts', () => {
			vi.mocked(fs.statSync).mockImplementation(() => {
				throw enoent();
			});
			vi.mocked(fs.writeFileSync).mockImplementation(() => {
				throw new Error('disk full');
			});

			disk.down(store);

			// 3 attempts each for dict and accounts
			expect(fs.writeFileSync).toHaveBeenCalledTimes(6);
			expect(fs.renameSync).not.toHaveBeenCalled();
		});

		test('handles renameSync failure gracefully', () => {
			vi.mocked(fs.statSync).mockImplementation(() => {
				throw enoent();
			});
			vi.mocked(fs.writeFileSync).mockImplementation(() => {});
			vi.mocked(fs.renameSync).mockImplementation(() => {
				throw new Error('permission denied');
			});

			expect(() => disk.down(store)).not.toThrow();
			expect(fs.renameSync).toHaveBeenCalled();
		});
	});
});
