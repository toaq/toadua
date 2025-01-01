// modules/disk.js
// load from disk, save to disk, do backups

import * as commons from '../core/commons.js';
const store = commons.store;

import * as http from 'http';
import * as fs from 'fs';
import * as zlib from 'zlib';
import * as stream from 'stream';

export function read(fname, deft) {
	let gzip;
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

function write_(fname, data, guard_override) {
	const gzip = zlib.gzipSync(Buffer.from(JSON.stringify(data)));
	let backup = fname + '~',
		our_size = gzip.length,
		success = false,
		unbackup = true;
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

export var using: any = {};

export function write(fname, data, guard_override?: any) {
	if (using[fname])
		console.log(`warning: '${fname}' is already being written to`);
	using[fname] = true;
	let res;
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

export function backup() {
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
		console.log(`note: backup failed`);
}

export function save() {
	return ((a, b) => a && b)(
		write('data/dict.json.gz', store.db),
		write('data/accounts.json.gz', store.pass),
	);
}

const acts = { save_interval: save, backup_interval: backup };
let first_go = true,
	intervals = {};
export function state_change() {
	for (const k of Object.keys(acts)) {
		if (intervals[k]) commons.clearInterval(intervals[k]);
		if (this && this.enabled && this[k])
			intervals[k] = commons.setInterval(acts[k], this[k]);
	}
	if (first_go) {
		(store.db = read('data/dict.json.gz', { entries: [] })),
			(store.pass = read('data/accounts.json.gz', { hashes: {}, tokens: {} }));
		first_go = false;
	} else if (!this) {
		console.log(`trying to save data...`);
		save();
	}
}
