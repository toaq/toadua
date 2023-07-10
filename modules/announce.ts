// modules/announce.js
// send a prepared rich content message to a Discord webhook

import * as commons from '../core/commons.js';

import * as request from 'request-promise-native';
import * as shared from '../frontend/shared/index.js';

function trim(max: number, str: string): string {
	if (str.length <= max) return str;
	return str.substring(0, max - 1) + '…';
}

export function entry(ev: string, entry, note) {
	let action = (() => {
		switch (ev) {
			case 'create':
			case 'remove':
				return `${ev}d`;
			case 'note':
				return 'noted on';
			default:
				return null;
		}
	})();
	if (!action) message(entry);
	let sköp = entry.scope === 'en' ? '' : ` in scope __${entry.scope}__`;
	let payload = {
		color: shared.color_for((note && note.user) || entry.user).hex,
		title: trim(
			256,
			`*${(note && note.user) || entry.user}* ${action} **${entry.head}**${
				ev === 'note' ? '' : sköp
			}`,
		),
		fields:
			(note && [
				{
					name: trim(256, `(definition by *${entry.user}*${sköp})`),
					value: trim(1024, entry.body),
				},
			]) ||
			undefined,
		description: trim(4096, note ? note.content : entry.body),
		url:
			ev === 'remove'
				? undefined
				: `${commons.config().entry_point}#%23${entry.id}`,
	};
	message(payload);
}

export function message(what) {
	if (!enabled) return;
	const url: string = options.hook;
	if (!url) return;
	let color = what.color || 0,
		epnt = what.url || commons.config().entry_point;
	let req = {
		url,
		method: 'POST',
		json: true,
		body: { embeds: [{ color, url: epnt, ...what }] },
	};
	if (queue.push(req) === 1) setTimeout(send_off, 0);
}

function send_off() {
	if (!queue.length) return;
	let m = queue.pop();
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

var enabled,
	options,
	queue = [];
export function state_change() {
	if (enabled !== (options = this || {}).enabled)
		for (let ev of ['create', 'note', 'remove'])
			commons.emitter[options.enabled ? 'on' : 'off'](ev, entry);
	enabled = options.enabled;
	if (!enabled) queue.splice(0, queue.length);
}
