// modules/announce.js
// send a prepared rich content message to a Discord webhook

import * as commons from '../core/commons.js';

import request from 'request-promise-native';
import { Entry, Note } from '../core/commons.js';
import * as shared from '../frontend/shared/index.js';

const event_types = ['create', 'note', 'remove', 'removenote', 'edit'] as const;
type AnnounceEvent = (typeof event_types)[any];

interface WebhookEmbed {
	color?: number;
	title?: string;
	fields?: { name: string; value: string }[];
	description?: string;
	url?: string;
}

function trim(max: number, str: string): string {
	if (str.length <= max) return str;
	return str.substring(0, max - 1) + '…';
}

export function onAnnounceEvent(ev: AnnounceEvent, entry: Entry, note?: Note) {
	const action = {
		create: 'created',
		note: 'noted on',
		remove: 'removed',
		removenote: 'removed a note on',
	}[ev];
	if (!action) {
		console.log(`!! unexpected action ${action} in announce.entry`);
		return;
	}

	const scope = entry.scope !== 'en' ? ` in scope __${entry.scope}__` : '';
	const title = note
		? `*${note.user}* ${action} **${entry.head}**`
		: `*${entry.user}* ${action} **${entry.head}**${scope}`;

	const noteField = () => ({
		name: trim(256, `(definition by *${entry.user}*${scope})`),
		value: trim(1024, entry.body),
	});
	const backlink = `${commons.config().entry_point}#%23${entry.id}`;

	const payload: WebhookEmbed = {
		color: shared.color_for(note?.user ?? entry.user).hex,
		title: trim(256, title),
		fields: note ? [noteField()] : undefined,
		description: trim(4096, note ? note.content : entry.body),
		url: ev !== 'remove' ? backlink : undefined,
	};
	message(payload);
}

export function message(what: WebhookEmbed) {
	if (!enabled) return;
	const url: string = options.hook;
	if (!url) return;
	const color = what.color ?? 0;
	const entrypoint = what.url ?? commons.config().entry_point;
	const req: request.Options = {
		url,
		method: 'POST',
		json: true,
		body: { embeds: [{ color, url: entrypoint, ...what }] },
	};
	if (queue.push(req) === 1) setTimeout(send_off, 0);
}

function send_off() {
	if (!queue.length) return;
	if (queue.length > 10) {
		let top = queue[0];
		if (top?.body?.embeds?.[0]?.title) {
			top.body.embeds[0].title =
				trim(200, top.body.embeds[0].title) +
				` (+ ${queue.length - 1} other events)`;
			request(top);
		} else {
			message({ title: `${queue.length} events omitted` });
		}
		queue.splice(0, queue.length);
		return;
	}
	const m = queue.shift();
	request(m).then(
		() => {
			console.log(`-> '${m.body.embeds[0].title}' announced`);
			setTimeout(send_off, 0);
		},
		err => {
			queue.push(m);
			if (err.statusCode === 429) setTimeout(send_off, err.error.retryAfter);
			else {
				console.log(`-> error when posting message: ${err.stack}`);
				if (err.statusCode !== 400) setTimeout(send_off, 0);
			}
		},
	);
}

var enabled: boolean;
var options: { enabled: boolean; hook: string };
var queue: request.Options[] = [];
export function state_change() {
	if (enabled !== (options = this ?? {}).enabled)
		for (const ev of event_types)
			commons.emitter[options.enabled ? 'on' : 'off'](ev, onAnnounceEvent);
	enabled = options.enabled;
	if (!enabled) queue.splice(0, queue.length);
}
