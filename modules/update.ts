// modules/update.js
// download word definitions from remote sources

import * as commons from '../core/commons.js';
import * as search from '../core/search.js';
import * as api from '../core/api.js';
import * as announce from './announce.js';
import * as shared from '../frontend/shared/index.js';
import * as yaml from 'js-yaml';
import { readFileSync } from 'node:fs';

import request from 'request-promise-native';
const config = yaml.load(
	readFileSync(commons.getToaduaPath() + '/config/sources.yml'),
);

interface UpdateFormatOptions {
	skip: number;
	patterns: Record<string, string>[];
}

type UpdateFormat = (
	data: string,
	options: UpdateFormatOptions,
) => Record<string, string>[];

const FORMATS: Record<string, UpdateFormat> = {
	tsv: (data, options) =>
		data
			.split(/\r?\n/g)
			.slice(options.skip)
			.map(line => line.split(/\t/))
			.flatMap(cols =>
				options.patterns.map(p =>
					Object.fromEntries(
						Object.entries(p).map(([k, v]) => [
							k,
							(v as string).replace(/%\(([0-9]+)\)/g, (_, n) => cols[n]),
						]),
					),
				),
			),
	json: (data, options) =>
		JSON.parse(data).flatMap(e =>
			options.patterns.map(p =>
				Object.fromEntries(
					Object.entries(p).map(([k, v]) => [
						k,
						(v as string).replace(/%\((.*?)\)/g, (_, id) => e[id]),
					]),
				),
			),
		),
};

// Word list cache.
const word_lists = {};

export class UpdateModule {
	constructor(
		private enabled: boolean,
		private update_interval: number,
		private announce?: announce.AnnounceModule,
	) {}

	// poll for new entries at remote TSV spreadsheets and add them to the
	// dictionary every now and then
	private async sync_resources(store: commons.Store) {
		const time = Date.now();
		const cf: Record<string, any> = config;
		let changed = false;
		await Promise.all(
			Object.entries(cf).map(
				async ([name, { source, user, format, ...rest }]) => {
					let data: unknown;
					try {
						data = await request.get(source);
						console.log(`updating resource '${name}'`);
						const word_list = Object.fromEntries(
							FORMATS[format](data as string, rest)
								.filter(_ => _.head && _.body)
								.map(_ => [shared.normalize(_.head), api.replacements(_.body)]),
						);
						console.log(
							`'${name}': entry count was ${
								word_lists[name] ? Object.keys(word_lists[name]).length : 0
							}, is ${Object.keys(word_list).length}`,
						);
						if (JSON.stringify(word_lists[name]) !== JSON.stringify(word_list))
							changed = true;
						word_lists[name] = word_list;
					} catch (err) {
						console.log(`on resource '${name}': ${err.stack}`);
					}
				},
			),
		);

		if (!changed) {
			console.log(`nothing to update (${Date.now() - time} ms)`);
			return;
		}
		console.log('adding...');
		for (const [name, words] of Object.entries(word_lists)) {
			const user = cf[name].user;
			for (const [head, body] of Object.entries(words)) {
				const s = search.search({
					query: [
						'and',
						['user_raw', user],
						['head_raw', head],
						['body_raw', body],
					],
				});
				if (typeof s === 'string') {
					console.log(`!! malformed query: ${s}`);
				} else if (!s.length) {
					const res = await api.call(
						{ action: 'create', head, body, scope: 'en' },
						user,
					);
					if (res.success === false)
						console.log(`!! '${head}' caused error: ${res.error}`);
					else console.log(`++ '${head}' added`);
				}
			}
		}

		const messages: Record<string, any> = {};
		if (Object.keys(word_lists).length === Object.keys(cf).length) {
			console.log('obsoleting...');
			const unames = new Set(Object.values(cf).map(_ => _.user));
			// ...I do have the right to write messy code, don't I?
			const fetched = Object.fromEntries(
				[...unames].map(uname => [
					uname,
					Object.fromEntries(
						Object.entries(cf)
							.filter(_ => _[1].user === uname)
							.flatMap(_ => Object.entries(word_lists[_[0]])),
					),
				]),
			);

			for (let e of store.db.entries) {
				if (!unames.has(e.user)) continue;
				const found = fetched[e.user][e.head];
				if (found && found === e.body) return;
				// we need to re-find the entry because `search` makes
				// copies on output
				e = api.by_id(e.id);
				e.user = `old${e.user}`;
				e.votes[e.user] = -1;
				e.score--;
				console.log(`~~ '${e.head}' obsoleted`);
				messages[e.user] ||= [];
				messages[e.user].push({
					title: `definition for **${e.head}** obsoleted`,
					description: e.body,
					url: `${commons.config.entry_point}#%23${e.id}`,
					head: e.head,
				});
			}
		}

		search.recache();

		for (const [user, msgs] of Object.entries(messages)) {
			if (msgs.length > 5)
				this.announce?.message({
					title: `${msgs.length} definitions obsoleted for user *${user}*`,
					description:
						msgs
							.map(_ => _.head)
							.slice(0, 50)
							.join(', ') +
						(msgs.length > 50 ? `, and ${msgs.length - 50} more` : ''),
				});
			else
				for (const { title, description, url } of msgs)
					this.announce?.message({ title, description, url });
		}

		console.log(`updating done (${Date.now() - time} ms)`);
	}

	public up(store: commons.Store) {
		if (this.enabled) {
			this.sync_resources(store);
			setInterval(() => this.sync_resources(store), this.update_interval);
		}
	}
}
