// modules/disk.js
// load from disk, save to disk, do backups

import * as commons from '../core/commons.js';
import { Search } from '../core/search.js';

import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

export class DiskModule {
	private using: Record<string, true> = {};

	constructor(
		private search: Search,
		private save_interval: number,
		private backup_interval: number,
	) {}

	private read(fname: string, deft: any): any {
		let gzip: any;
		try {
			gzip = fs.readFileSync(fname);
		} catch (e) {
			console.log(
				`Note: setting the default value for '${fname}' because of a file read failure (${e.code})`,
			);
			this.write(fname, deft);
			return deft;
		}
		const buf = zlib.gunzipSync(gzip);
		const o = JSON.parse(buf.toString());
		console.log(`successfully read ${buf.length}b from '${fname}'`);
		return o;
	}

	private write_(fname: string, data: any, guard_override: boolean): boolean {
		const gzip = zlib.gzipSync(Buffer.from(JSON.stringify(data)));
		const backup = `${fname}~`;
		const our_size = gzip.length;
		let success = false;
		let unbackup = true;
		if (!guard_override)
			try {
				const { size: old_size } = fs.statSync(fname);
				if (gzip.length / (old_size || 1) < 0.5) {
					console.log(
						`warning: refusing to destructively write ${our_size}b over ${old_size}b file '${fname}'`,
					);
					console.log(`will write to backup '${backup}' instead`);
					unbackup = false;
				}
			} catch (e) {
				if (e.code !== 'ENOENT') throw e;
			}
		for (let _ = 0; _ < 3; ++_) {
			try {
				fs.writeFileSync(backup, gzip);
			} catch (e) {
				console.log(`error when saving to backup '${backup}': ${e.stack}\n`);
				continue;
			}
			success = true;
			break;
		}
		if (!success) {
			console.log(`giving up write to '${fname}' after 3 failed attempts\n`);
			return false;
		}
		if (unbackup)
			try {
				fs.renameSync(backup, fname);
			} catch (e) {
				console.log(`error when saving to real '${fname}': ${e.stack}`);
				return false;
			}
		else fname = backup;
		console.log(`successfully wrote ${our_size}b to '${fname}'`);
		return true;
	}

	private write(fname: string, data: any, guard_override?: boolean): boolean {
		if (this.using[fname])
			console.log(`warning: '${fname}' is already being written to`);
		this.using[fname] = true;
		let res: boolean;
		try {
			res = this.write_(fname, data, guard_override);
		} catch (e) {
			console.log(
				`unexpected error when handling write to '${fname}: ${e.stack}`,
			);
			res = false;
		}
		delete this.using[fname];
		return res;
	}

	private backup(store: commons.Store): void {
		try {
			fs.mkdirSync('backup');
		} catch (e) {
			if (e.code !== 'EEXIST') throw e;
		}
		if (
			!this.write(
				`backup/${new Date()
					.toISOString()
					.split(':')[0]
					.replace(/T/, '-')}.json.gz`,
				store,
			)
		)
			console.log('note: backup failed');
	}

	private save(store: commons.Store): boolean {
		return ((a, b) => a && b)(
			this.write('data/dict.json.gz', store.db),
			this.write('data/accounts.json.gz', store.pass),
		);
	}

	public up(store: commons.Store): void {
		setInterval(_ => this.save(store), this.save_interval);
		setInterval(_ => this.backup(store), this.backup_interval);
		store.db = this.read('data/dict.json.gz', { entries: [] });
		store.pass = this.read('data/accounts.json.gz', { hashes: {}, tokens: {} });
		this.search.recache();
	}

	public down(store: commons.Store): void {
		console.log('trying to save data...');
		this.save(store);
	}
}
