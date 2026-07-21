// modules/update.js
// download word definitions from remote sources

import * as commons from '../core/commons.js';
import { Search } from '../core/search.js';
import { Api, replacements } from '../core/api.js';
import * as announce from './announce.js';
import * as shared from '../frontend/shared/index.js';
import yaml from 'js-yaml';

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
	format: 'tsv' | 'json' | 'yaml';
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

function formatObjData(
	parsed: any,
	options: Omit<SourceConfig, 'source' | 'user' | 'format'>,
): any {
	return parsed.flatMap(e =>
		options.patterns.flatMap(p => {
			const fieldVariants: Record<string, string[]> = {};

			for (const [k, v] of Object.entries(p)) {
				let any_undefined = false;
				const value = (v as string).replace(/%\((.*?)\)/g, (_, id) => {
					const value = e[id];
					if (value === undefined) {
						any_undefined = true;
						return '';
					}
					return value;
				});

				if (!any_undefined && value !== '') {
					// split on Unix (\n) or Windows (\r\n) newlines
					fieldVariants[k] = value.split(/\r?\n/);
				}
			}

			// make the Cartesian product for all newline-separated values (with each pattern)
			const keys = Object.keys(fieldVariants);
			if (keys.length === 0) return [];

			let combinations: Record<string, string>[] = [{}];

			for (const key of keys) {
				const nextCombinations: Record<string, string>[] = [];
				for (const combination of combinations) {
					for (const variant of fieldVariants[key]) {
						nextCombinations.push({
							...combination,
							[key]: variant,
						});
					}
				}
				combinations = nextCombinations;
			}

			return combinations;
		}),
	);
}

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
	json: (data, options) => formatObjData(JSON.parse(data), options),
	yaml: (data, options) => formatObjData(yaml.load(data), options),
};

type WordList = Map<
	string,
	{
		gloss?: string;
		body: string;
		type?: string;
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
		private api: Api,
		private search: Search,
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
						const response = await fetch(source);
						if (!response.ok) {
							throw new Error(
								`Failed to fetch ${source}: ${response.status} ${response.statusText}`,
							);
						}
						data = await response.text();

						console.log(`updating resource '${name}'`);
						const word_list: WordList = new Map();
						for (const entry of FORMATS[format](data as string, rest)) {
							if (!entry.head || !entry.body) continue;
							word_list.set(shared.normalize(entry.head), {
								gloss:
									entry.gloss !== undefined
										? entry.gloss.normalize('NFC')
										: undefined,
								body: replacements(entry.body),
								type:
									entry.type !== undefined
										? entry.type.normalize('NFC')
										: undefined,
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
				{ gloss, body, type, frame, pronominal_class, subject, distribution },
			] of word_list.entries()) {
				const exists = this.search.some(
					entry =>
						entry.$.scope === 'en' &&
						entry.$.head === head &&
						entry.$.gloss === gloss &&
						entry.$.body === body &&
						entry.$.type === type &&
						entry.$.frame === frame &&
						entry.$.pronominal_class === pronominal_class &&
						entry.$.subject === subject &&
						entry.$.distribution === distribution,
				);
				if (!exists) {
					const res = await this.api.call(
						{
							action: 'create',
							scope: 'en',
							head,
							gloss,
							body,
							type,
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

			const to_delete: Set<string> = new Set();
			for (let e of store.db.entries) {
				if (!unames.has(e.user)) continue;
				const found = fetched.get(e.user)?.get(e.head);

				if (
					found &&
					found.gloss === e.gloss &&
					found.body === e.body &&
					found.type === e.type &&
					found.frame === e.frame &&
					found.pronominal_class === e.pronominal_class &&
					found.subject === e.subject &&
					found.distribution === e.distribution
				) {
					continue;
				}

				const originalUser = e.user;
				console.log(`~~ '${e.head}' obsoleted`);
				messages[originalUser] ||= [];
				messages[originalUser].push({
					title: `definition for **${e.head}** obsoleted`,
					description: e.body,
					url: `${commons.config.entry_point}#%23${e.id}`,
					head: e.head,
				});
				if (originalUser === 'official' && e.notes.length > 0) {
					// Keep oldofficial entries around if they carry notes.
					// we need to re-find the entry because `search` makes
					// copies on output
					e = this.api.by_id(e.id);
					e.user = `old${originalUser}`;
					e.votes[e.user] = -1;
					e.score--;
				} else {
					to_delete.add(e.id);
				}
			}
			if (to_delete.size > 0) {
				store.db.entries = store.db.entries.filter(e => !to_delete.has(e.id));
			}
		}

		this.search.recache();

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
