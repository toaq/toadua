// modules/announce.js
// send a prepared rich content message to a Discord webhook

import * as commons from '../core/commons.js';

import request from 'request-promise-native';
import { Entry, Note } from '../core/commons.js';
import * as shared from '../frontend/shared/index.js';

type AnnounceEvent = 'create' | 'note' | 'remove';

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
	let action = { create: 'created', note: 'noted on', remove: 'removed' }[ev];
	if (!action) {
		console.log(`!! unexpected action ${action} in announce.entry`);
		return;
	}

	let sköp = entry.scope === 'en' ? '' : ` in scope __${entry.scope}__`;
	let payload: WebhookEmbed = {
		color: shared.color_for((note && note.user) || entry.user).hex,
		title: trim(
			256,
			note
				? `*${note.user}* ${action} **${entry.head}**`
				: `*${entry.user}* ${action} **${entry.head}**${sköp}`,
		),
		fields: note
			? [
					{
						name: trim(256, `(definition by *${entry.user}*${sköp})`),
						value: trim(1024, entry.body),
					},
			  ]
			: undefined,
		description: trim(4096, note ? note.content : entry.body),
		url:
			ev === 'remove'
				? undefined
				: `${commons.config().entry_point}#%23${entry.id}`,
	};
	message(payload);
}

export function message(what: WebhookEmbed) {
	if (!enabled) return;
	const url: string = options.hook;
	if (!url) return;
	let color = what.color || 0,
		epnt = what.url || commons.config().entry_point;
	let req: request.Options = {
		url,
		method: 'POST',
		json: true,
		body: { embeds: [{ color, url: epnt, ...what }] },
	};
	if (queue.push(req) === 1) setTimeout(send_off, 0);
}

function send_off() {
	if (!queue.length) return;
	if (queue.length > 10) {
		queue.splice(0, queue.length);
		message({ title: `${queue.length} events omitted` });
		return;
	}
	let m = queue.shift();
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
	if (enabled !== (options = this || {}).enabled)
		for (let ev of ['create', 'note', 'remove'])
			commons.emitter[options.enabled ? 'on' : 'off'](ev, onAnnounceEvent);
	enabled = options.enabled;
	if (!enabled) queue.splice(0, queue.length);
}
