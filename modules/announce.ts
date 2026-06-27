// modules/announce.js
// send a prepared rich content message to a Discord webhook

import * as commons from '../core/commons.js';

import type { Entry, Note } from '../core/commons.js';
import * as shared from '../frontend/shared/index.js';
import type { EventEmitter } from 'node:stream';

const event_types = [
	'create',
	'note',
	'remove',
	'removenote',
	'edit',
	'move',
] as const;
type AnnounceEvent = (typeof event_types)[number];

interface WebhookEmbed {
	color?: number;
	title?: string;
	fields?: { name: string; value: string }[];
	description?: string;
	url?: string;
}

function trim(max: number, str: string): string {
	if (str.length <= max) return str;
	return `${str.substring(0, max - 1)}…`;
}

function fetch_request(options: any): Promise<any> {
	return fetch(options.url, {
		method: options.method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(options.body),
	}).then(async result => {
		if (!result.ok) {
			let errorData: any = {};
			try {
				errorData = await result.json();
			} catch {}

			const error: any = new Error(`HTTP ${result.status}`);
			error.statusCode = result.status;
			error.stack = error.stack;

			error.error = {
				...errorData,
				// Discord gives retry_after in seconds (why?), but setTimeout needs milliseconds
				retryAfter: (errorData.retry_after ?? 0) * 1000,
			};
			throw error;
		}
		return result;
	});
}

export class AnnounceModule {
	private queue: any[] = [];

	constructor(
		private enabled: boolean,
		private hook: string,
	) {}

	private onAnnounceEvent(ev: AnnounceEvent, entry: Entry, note?: Note) {
		const action = {
			create: 'created',
			note: 'noted on',
			remove: 'removed',
			removenote: 'removed a note on',
			edit: 'edited',
			move: 'moved',
		}[ev];
		if (!action) {
			console.log(`!! unexpected action ${action} in announce.entry`);
			return;
		}

		if (ev === 'note' && note && note.content.match(/^discriminator\s*:/i)) {
			// Avoid spamming #toashuaq with these.
			return;
		}

		const scope =
			ev === 'move'
				? ` to scope __${entry.scope}__`
				: entry.scope !== 'en'
				? ` in scope __${entry.scope}__`
				: '';
		const title = note
			? `*${note.user}* ${action} **${entry.head}**`
			: `*${entry.user}* ${action} **${entry.head}**${scope}`;

		const noteField = () => ({
			name: trim(256, `(definition by *${entry.user}*${scope})`),
			value: trim(1024, entry.body),
		});
		const backlink = `${commons.config.entry_point}#%23${entry.id}`;

		const payload: WebhookEmbed = {
			color: shared.color_for(note?.user ?? entry.user).hex,
			title: trim(256, title),
			fields: note ? [noteField()] : undefined,
			description: trim(4096, note ? note.content : entry.body),
			url: ev !== 'remove' ? backlink : undefined,
		};
		this.message(payload);
	}

	public message(what: WebhookEmbed) {
		if (!this.enabled) return;
		const url: string = this.hook;
		if (!url) return;
		const color = what.color ?? 0;
		const entrypoint = what.url ?? commons.config.entry_point;

		// Retained the same object structure as request.Options
		const req = {
			url,
			method: 'POST',
			json: true,
			body: { embeds: [{ color, url: entrypoint, ...what }] },
		};
		if (this.queue.push(req) === 1) setTimeout(() => this.send_off(), 0);
	}

	private send_off() {
		if (!this.queue.length) return;
		if (this.queue.length > 10) {
			const top = this.queue[0];
			if (top?.body?.embeds?.[0]?.title) {
				const title = trim(200, top.body.embeds[0].title);
				const n = this.queue.length - 1;
				top.body.embeds[0].title = `${title} (+ ${n} other events)`;
				fetch_request(top);
			} else {
				this.message({ title: `${this.queue.length} events omitted` });
			}
			this.queue.splice(0, this.queue.length);
			return;
		}
		const m = this.queue.shift();
		fetch_request(m).then(
			() => {
				console.log(`-> '${m.body.embeds[0].title}' announced`);
				setTimeout(() => this.send_off(), 0);
			},
			err => {
				this.queue.push(m);
				if (err.statusCode === 429)
					setTimeout(() => this.send_off(), err.error.retryAfter);
				else {
					console.log(`-> error when posting message: ${err.stack}`);
					if (err.statusCode !== 400) setTimeout(() => this.send_off(), 0);
				}
			},
		);
	}

	public up(emitter: EventEmitter) {
		for (const et of event_types) {
			emitter.on(et, (e, entry, note) => this.onAnnounceEvent(e, entry, note));
		}
	}
}
