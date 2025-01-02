// modules/cleanup.js
// remove unwanted entries that satisfy certain criteria

import * as commons from '../core/commons.js';
import * as api from '../core/api.js';

let options: any = {};

export function remove_obsoleted(_, { score, user, id, head }, voter) {
	if (!options) return;
	const { users, vote_threshold } = options;
	if ((users && !users.includes(user)) || score > vote_threshold)
		// || user == voter)
		return;
	api.call(
		{ action: 'remove', id },
		() => console.log(`-- ${head} weeded out`),
		user,
	);
}

export function state_change() {
	// biome-ignore lint/suspicious/noAssignInExpressions: this trick is too cute to change
	if (options.enabled !== (options = this || {}).enabled) {
		commons.emitter[options.enabled ? 'on' : 'off']('vote', remove_obsoleted);
	}
}
