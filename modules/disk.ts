// modules/disk.js
// load from disk, save to disk, do backups

import * as commons from '../core/commons.js';
import * as search from '../core/search.js';

import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

function read(fname, deft) {
	let gzip: any;
	try {
		gzip = fs.readFileSync(fname);
	} catch (e) {
		console.log(
			`Note: setting the default value for '${fname}' because of a file read failure (${e.code})`,
		);
		write(fname, deft);
		return deft;
	}
	const buf = zlib.gunzipSync(gzip);
	const o = JSON.parse(buf.toString());
	console.log(`successfully read ${buf.length}b from '${fname}'`);
	return o;
}

function write_(fname: string, data: any, guard_override: boolean) {
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

const using: Record<string, true> = {};

function write(fname: string, data, guard_override?: boolean) {
	if (using[fname])
		console.log(`warning: '${fname}' is already being written to`);
	using[fname] = true;
	let res: boolean;
	try {
		res = write_(fname, data, guard_override);
	} catch (e) {
		console.log(
			`unexpected error when handling write to '${fname}: ${e.stack}`,
		);
		res = false;
	}
	delete using[fname];
	return res;
}

function backup(store: commons.Store) {
	try {
		fs.mkdirSync('backup');
	} catch (e) {
		if (e.code !== 'EEXIST') throw e;
	}
	if (
		!write(
			`backup/${new Date()
				.toISOString()
				.split(':')[0]
				.replace(/T/, '-')}.json.gz`,
			store,
		)
	)
		console.log('note: backup failed');
}

function save(store: commons.Store) {
	return ((a, b) => a && b)(
		write('data/dict.json.gz', store.db),
		write('data/accounts.json.gz', store.pass),
	);
}

export class DiskModule {
	constructor(
		private save_interval: number,
		private backup_interval: number,
	) {}

	public up(store: commons.Store): void {
		setInterval(_ => save(store), this.save_interval);
		setInterval(_ => backup(store), this.backup_interval);
		store.db = read('data/dict.json.gz', { entries: [] });
		store.pass = read('data/accounts.json.gz', { hashes: {}, tokens: {} });
		search.recache(store);
	}
	public down(store: commons.Store): void {
		console.log('trying to save data...');
		save(store);
	}
}
