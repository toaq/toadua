// modules/update.js
// download word definitions from remote sources

import * as commons from '../core/commons.js';
import * as search from '../core/search.js';
import * as api from '../core/api.js';
import * as announce from './announce.js';
import * as shared from '../frontend/shared/index.js';

import request from 'request-promise-native';

export interface SourceConfig {
	/**
	 * The URL of the source file.
	 */
	source: string;
	/**
	 * The username under which the words will be published.
	 */
	user: string;
	/**
	 * The format of the source file.
	 */
	format: 'tsv' | 'json';
	/**
	 * The number of rows to skip before processing the file.
	 */
	skip: number;
	/**
	 * The patterns to use to shape the definitions of words based on the
	 * values of the columns found in the source file.
	 */
	patterns: Record<string, string>[];
}

type UpdateFormat = (
	data: string,
	options: Omit<SourceConfig, 'source' | 'user' | 'format'>,
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

type WordList = Map<
	string,
	{
		body: string;
		frame?: string;
		pronominal_class?: string;
		subject?: string;
		distribution?: string;
	}
>;

export class UpdateModule {
	// Word list cache.
	private word_lists: Map<string, WordList> = new Map();

	constructor(
		private enabled: boolean,
		private sources: Record<string, SourceConfig>,
		private update_interval: number,
		private announce?: announce.AnnounceModule,
	) {}

	// poll for new entries at remote TSV spreadsheets and add them to the
	// dictionary every now and then
	public async sync_resources(store: commons.Store) {
		const time = Date.now();
		const cf = this.sources;
		let changed = false;
		await Promise.all(
			Object.entries(cf).map(
				async ([name, { source, user, format, ...rest }]) => {
					let data: unknown;
					try {
						data = await request.get(source);
						console.log(`updating resource '${name}'`);
						const word_list: WordList = new Map();
						for (const entry of FORMATS[format](data as string, rest)) {
							if (!entry.head || !entry.body) continue;
							word_list.set(shared.normalize(entry.head), {
								body: api.replacements(entry.body),
								frame: entry.frame,
								pronominal_class: entry.pronominal_class,
								subject: entry.subject,
								distribution: entry.distribution,
							});
						}
						console.log(
							`'${name}': entry count was ${
								this.word_lists.get(name)?.size ?? 0
							}, is ${word_list.size}`,
						);
						const prevList = this.word_lists.get(name);
						if (
							!prevList ||
							prevList.size !== word_list.size ||
							JSON.stringify([...prevList]) !== JSON.stringify([...word_list])
						)
							changed = true;
						this.word_lists.set(name, word_list);
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
		for (const [name, word_list] of this.word_lists.entries()) {
			const user = cf[name].user;
			for (const [
				head,
				{ body, frame, pronominal_class, subject, distribution },
			] of word_list.entries()) {
				const exists = search.some(
					entry =>
						entry.$.scope === 'en' &&
						entry.$.head === head &&
						entry.$.body === body &&
						entry.$.frame === frame &&
						entry.$.pronominal_class === pronominal_class &&
						entry.$.subject === subject &&
						entry.$.distribution === distribution,
				);
				if (!exists) {
					const res = await api.call(
						{
							action: 'create',
							head,
							body,
							scope: 'en',
							frame,
							pronominal_class,
							subject,
							distribution,
						},
						user,
					);
					if (res.success === false)
						console.log(`!! '${head}' caused error: ${res.error}`);
					else console.log(`++ '${head}' added`);
				}
			}
		}

		const messages: Record<string, any> = {};
		if (this.word_lists.size === Object.keys(cf).length) {
			console.log('obsoleting...');
			const unames: Set<string> = new Set(
				Object.values(cf).map(cfg => cfg.user),
			);

			// Word lists merged and grouped by username.
			const fetched: Map<string, WordList> = new Map();
			for (const uname of unames) {
				const merged: WordList = new Map();
				for (const name of Object.keys(cf)) {
					if (cf[name].user === uname) {
						const entries = this.word_lists.get(name)?.entries() ?? [];
						for (const [head, value] of entries) {
							merged.set(head, value);
						}
					}
				}
				fetched.set(uname, merged);
			}

			for (let e of store.db.entries) {
				if (!unames.has(e.user)) continue;
				const found = fetched.get(e.user)?.get(e.head);
				if (
					found &&
					found.body === e.body &&
					found.frame === e.frame &&
					found.pronominal_class === e.pronominal_class &&
					found.subject === e.subject &&
					found.distribution === e.distribution
				)
					return;
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
