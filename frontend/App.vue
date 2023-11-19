<template>
	<nav id="menu">
		<div id="control-row">
			<ul id="top-controls" class="controls">
				<li v-if="username">
					logged in as <span :style="color_for(username)">{{ username }}</span>
				</li>
				<li>
					<label for="limit-search"
						>search scope ‘<span class="scope-name">{{ scope }}</span
						>’ only:</label
					>&thinsp;<input
						id="limit-search"
						type="button"
						:value="limit_search ? 'yes' : 'no'"
						class="submit"
						@click="update_limit_search"
						tabindex="8"
					/>
				</li>
				<li v-if="username">
					<input
						type="button"
						value="logout"
						class="submit"
						@click="logout"
						tabindex="9"
					/>
				</li>
			</ul>
		</div>
		<div id="search-row">
			<input
				type="text"
				id="search"
				placeholder="search!"
				v-model="query"
				@input.lazy="search"
				autocomplete="off"
				spellcheck="false"
				tabindex="1"
			/>
			<input
				type="button"
				id="cancel"
				value="×"
				v-show="query"
				@click="
					navigate('');
					focus_search();
				"
				tabindex="2"
			/>
		</div>
	</nav>
	<div id="results">
		<div class="error-line" v-if="error_line">
			{{ error_line }}
		</div>
		<div class="card" v-for="result in results" :lang="result.scope">
			<div class="title">
				<a
					class="date"
					:title="full_date(new Date(result.date))"
					:href="'##' + result.id"
					@click="navigate('#' + result.id)"
				>
					<span style="font-size: 24px">&ZeroWidthSpace;</span>
					{{ pretty_date(new Date(result.date)) }}</a
				>
				<h2>
					<a
						:href="'#' + result.head"
						class="name"
						@click="navigate(result.head)"
						>{{ result.head }}</a
					>
				</h2>
				<span class="info">
					<a
						:href="'#scope:' + result.scope"
						class="scope"
						@click="navigate('scope:' + result.scope)"
						>{{ result.scope }}</a
					>
					<a
						:href="'#@' + result.user"
						:style="color_for(result.user)"
						@click="navigate('@' + result.user)"
						>{{ result.user }}</a
					>
					<span :style="score_color(result.score)">{{
						score_number(result.score)
					}}</span>
				</span>
			</div>
			<p class="body" v-html="result.fancy_body"></p>
			<div class="notes">
				<p class="note" v-for="note in result.notes">
					<span
						:style="color_for(note.user)"
						class="note-author"
						@click="navigate('@' + note.user)"
						>{{ note.user }}</span
					><span v-html="note.fancy_content"></span>
				</p>
				<form
					style="display: contents"
					action="javascript:void('note')"
					v-if="result.uncollapsed"
					@keypress.13.prevent="note(result)"
					autocomplete="off"
				>
					<div class="note">
						<span :style="color_for(username ?? '')" class="note-author">{{
							username
						}}</span>
						<input
							type="submit"
							value="submit"
							class="note-submit"
							@click="note(result)"
							:disabled="!result.input"
						/>
					</div>
					<p class="note new_note">
						<input
							type="text"
							autofocus
							autocomplete="off"
							placeholder="comment here"
							v-model="result.input"
							@input="event => set_result_input(result, event)"
						/>
					</p>
				</form>
			</div>
			<ul class="controls" v-if="username">
				<li v-if="!result.uncollapsed">
					<input
						type="button"
						value="add note"
						@click="
							results.forEach(r => (r.uncollapsed = false));
							result.uncollapsed = true;
						"
					/>
					<!-- TODO: for some reason this doesn't work on second, third… try. jfc -->
				</li>
				<li>
					<input
						type="button"
						value="+"
						@click="vote(result, +1)"
						:disabled="result.vote == +1"
					/>
				</li>
				<li>
					<input
						type="button"
						value="±"
						@click="vote(result, 0)"
						:disabled="result.vote == 0"
					/>
				</li>
				<li>
					<input
						type="button"
						value="−"
						@click="vote(result, -1)"
						:disabled="result.vote == -1"
					/>
				</li>
				<li v-if="username == result.user && !result.hesitating">
					<input
						type="button"
						value="remove"
						@click="confirm_removal(result)"
					/>
				</li>
				<li v-if="result.hesitating">
					<input type="button" value="sure?" @click="remove(result)" />
				</li>
				<li>
					<input type="button" value="fork" @click="fork(result)" />
				</li>
			</ul>
		</div>
	</div>
	<div class="card" v-if="query || results.length">
		<h2 class="name">{{ what_should_i_say }}</h2>
		<ul
			class="controls"
			v-if="done_searching && username && !query.startsWith('#')"
		>
			<li>
				<input
					type="button"
					:value="'create ‘' + query + '’?'"
					@click="new_word"
				/>
			</li>
		</ul>
	</div>
	<form
		class="card"
		id="create"
		action="javascript:void('create')"
		v-show="username && (done_searching || !query) && !results.length"
		autocomplete="off"
	>
		<div class="title">
			<input
				type="text"
				id="create_name"
				class="name"
				placeholder="Enter a new Toaq word"
				@input="set_new_head"
				:value.sync="new_head"
				autocomplete="off"
				autocorrect="off"
				autocapitalize="off"
				spellcheck="false"
				tabindex="3"
			/>
		</div>
		<textarea
			class="body"
			id="create_body"
			rows="1"
			placeholder="Enter a definition using slots (example: _&hairsp;_&hairsp;_ likes _&hairsp;_&hairsp;_)"
			@input="set_new_body"
			@keypress.enter.exact.prevent="create"
			:value.sync="new_body"
			autocomplete="off"
			autocorrect="on"
			autocapitalize="on"
			spellcheck="true"
			tabindex="4"
		></textarea>
		<span class="controls-left" id="scope-editor">
			<label for="scope">scope:</label>&thinsp;
			<input
				type="text"
				size="5"
				v-model="scope"
				id="scope"
				autocomplete="language"
				list="common-languages"
				tabindex="7"
			/>
			<datalist id="common-languages">
				<option value="en" />
				<option value="toa" />
				<option value="ja" />
				<option value="jbo" />
				<option value="fr" />
			</datalist>
		</span>
		<ul class="controls">
			<li>
				<input
					type="submit"
					value="submit"
					class="submit"
					@click="create"
					:disabled="!(new_head && new_body)"
					tabindex="4"
				/>
			</li>
			<li>
				<input
					type="button"
					value="clear"
					@click="new_head = new_body = ''"
					:disabled="!(new_head || new_body)"
					tabindex="5"
				/>
			</li>
		</ul>
	</form>
	<form
		class="card"
		id="login"
		v-show="!(username || query)"
		action="javascript:void('login')"
		autocomplete="on"
	>
		<h2>Shadı! / Welcome!</h2>
		<p>
			Toadua is a collaborative dictionary for the conlang
			<a href="https://toaq.net">Toaq</a>.
		</p>
		<p>
			You can browse the dictionary using the search bar above. If you make an
			account, you can add new words and vote on existing definitions.
			<a href="https://toaq.me/Toadua">More info</a>
		</p>
		<div id="login_username">
			<input
				id="input_username"
				type="text"
				placeholder="username"
				v-model="login_name"
				autocomplete="username"
				tabindex="3"
			/>
		</div>
		<div id="login_password">
			<input
				id="input_password"
				type="password"
				placeholder="password"
				v-model="login_pass"
				autocomplete="current-password"
				tabindex="4"
			/>
		</div>
		<ul class="controls">
			<li>
				<input
					type="submit"
					value="login"
					@click="account('login')"
					:disabled="!(login_name && login_pass)"
					tabindex="5"
				/>
			</li>
			<li>
				<input
					type="button"
					value="register"
					@click="account('register')"
					:disabled="!(login_name && login_pass)"
					tabindex="6"
				/>
			</li>
		</ul>
	</form>
	<footer>
		<ul class="controls">
			<li><a href="https://toaq.me/Toadua">help</a></li>
			<li><a href="https://github.com/uakci/toadua">github</a></li>
			<li><a href="javascript:void(0)" @click="toggle_theme()">theme</a></li>
		</ul>
	</footer>
</template>

<script lang="ts">
import { debounce } from 'lodash';
import { defineComponent } from 'vue';
import package_info from './package.json';
import {
	color_for as compute_color_for,
	score_color as compute_score_color,
	normalize,
	score_number,
} from './shared/index';
const version = package_info.version;

const character_operators = {
	'/': 'arity',
	'@': 'user',
	'#': 'id',
	'=': 'head',
};

export default defineComponent({
	methods: {
		score_color(score: number) {
			return compute_score_color(score, this.theme).css;
		},
		color_for(name: string) {
			return compute_color_for(name, this.theme).css;
		},

		score_number,
		normalize,

		pretty_date(date: Date) {
			return date.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
			});
		},

		full_date(date: Date) {
			return date.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			});
		},

		focus_body() {
			setTimeout(() => {
				let body = document.getElementById('create_body')!;
				body.focus();
			}, 0);
		},

		apisend(what, or, and) {
			if (!and) {
				and = or;
				or = e => (this.error_line = e);
			}
			this.error_line = '';
			let req = this.queue[what.action];
			if (req) req.abort();
			this.queue[what.action] = req = new XMLHttpRequest();
			req.open('POST', 'api', true);
			if (this && this.token) what.token = this.token;
			req.send(JSON.stringify(what));
			let app = this;
			req.onreadystatechange = function () {
				if (this.readyState === 4 && this.status === 200) {
					try {
						let data = JSON.parse(this.responseText);
						if (data.success) {
							setTimeout(() => and(data), 0);
						} else {
							if (data.error === 'token has expired') app.clear_account();
							setTimeout(() => or(data.error), 0);
						}
					} catch (e) {
						or('mystically bad error');
						console.warn(e);
					}
				}
			};
			return req;
		},

		escape(s) {
			let el = document.createElement('p');
			el.innerText = s;
			return el.innerHTML;
		},

		make_link(href, text) {
			let el = document.createElement('a');
			el.innerText = text;
			el.setAttribute('href', href);
			return el.outerHTML;
		},

		replacements(content, still_editing, plain_text) {
			content = plain_text ? content : this.escape(content);
			content = content.replace(/___/g, '▯');
			let i = 0;
			let accum: string[] = [];
			const STARTERS = [
				plain_text ? /(<)(.*?)(>)/g : /(&lt;)(.*?)(&gt;)/g,
				still_editing && /([*]{2})(?!.*?[*]{2})(.*)()/g,
				/([*]{2})(.*?)([*]{2})/g,
				/()(@[a-zA-Z]+)()/g,
				/()(#[0-9a-zA-Z_-]+)()/g,
				/(https?:\/\/)(\S+)()/g,
			].filter(_ => _);
			let matches = STARTERS.flatMap(starter => [
				...content.matchAll(starter),
			]).sort((a, b) => a.index - b.index);
			while (i < content.length && matches.length) {
				let nearestMatch = matches[0];
				let [all, start, cont, end] = nearestMatch;
				accum.push(content.substring(i, nearestMatch.index));
				i = nearestMatch.index + all.length;
				let replacement;
				if (start == '**' && still_editing) {
					replacement = start + this.normalize(cont, !!end) + end;
				} else if (start.startsWith('http') && !still_editing) {
					replacement = this.make_link(all, cont.replace(/^www\.|\/$/g, ''));
				} else if (!plain_text && !still_editing) {
					let href = '#' + encodeURIComponent(cont);
					let style = cont.startsWith('@')
						? `style="${this.color_for(cont.substring(1))}"`
						: '';
					replacement = `<a href="${href}" ${style}>${cont}</a>`;
				} else {
					replacement = all;
				}
				accum.push(replacement);
				let catchUp;
				while ((catchUp = matches.shift())) {
					if (catchUp.index >= i) {
						matches.unshift(catchUp);
						break;
					}
				}
			}
			if (i < content.length) accum.push(content.substring(i));
			if (!plain_text && !still_editing)
				return accum.join('').replace(/\\(.)/g, '$1');
			else return accum.join('');
		},

		set_result_input(result, event) {
			event.target.value = result.input = this.replacements(
				event.target.value,
				true,
				true,
			);
		},

		set_new_head(event) {
			event.target.value = this.new_head = normalize(event.target.value, false);
		},

		set_new_body(event) {
			event.target.value = this.new_body = this.replacements(
				event.target.value,
				true,
				true,
			);
		},

		navigate(where) {
			this.dismissed = true;
			this.query = where;
			this.perform_search();
		},

		process_entry(e) {
			if (e.uncollapsed === undefined) e.uncollapsed = false;
			e.hesitating = false;
			e.fancy_body = this.replacements(e.body, false, false);
			e.notes.forEach(
				_ => (_.fancy_content = this.replacements(_.content, false, false)),
			);
			return e;
		},

		add_to_history(query) {
			if (query) this.query = query;
			if (window.history) window.history.replaceState('', '', '#' + this.query);
			else window.location.hash = this.query;
		},

		search() {
			if (this.current_search_request) this.current_search_request.abort();
			this.current_search_request = undefined;
			this.debounced_perform();
		},

		parse_query() {
			let ordering;
			let parts = this.query.split(/ /).map(a => {
				let parts = a.split(/\|/).map(b => {
					let negative, what;
					if ((negative = b[0] === '!')) b = b.substring(1);
					let parts = b.split(':');
					if (parts.length === 2) {
						if (parts[0] == 'order') {
							ordering = parts[1];
							return ['and'];
						} else
							what = [
								parts[0],
								parts[0] === 'arity' ? parseInt(parts[1], 10) || 0 : parts[1],
							];
					} else {
						parts = b.split(/(?=[\/@#=])/);
						let operations: [string, string | number][] = [];
						if (!parts[0].match(/^[\/@#=]/))
							operations.push(['term', parts.shift()]);
						for (let i = 0; i < parts.length; ++i) {
							let rest = parts[i].substring(1);
							operations.push([
								character_operators[parts[i][0]],
								parts[i][0] === '/' ? parseInt(rest, 10) || 0 : rest,
							]);
						}
						what =
							operations.length > 1 ? ['and', ...operations] : operations[0];
					}
					return negative ? ['not', what] : what;
				});
				if (parts.length > 1) return ['or'].concat(parts);
				else return parts[0];
			});
			let query;
			if (parts.length > 1) query = ['and'].concat(parts);
			else query = parts[0];
			return { query, ordering };
		},

		perform_search() {
			this.done_searching = false;
			this.error_line = '';
			if (this.queue.search) this.queue.search.abort();
			this.results = this.result_cache = [];
			if (!this.query) {
				this.add_to_history('');
				this.scroll_up = true;
				return;
			}
			let parsed_query = this.parse_query();
			if (this.limit_search)
				parsed_query.query = ['and', ['scope', this.scope], parsed_query.query];
			parsed_query.action = 'search';
			this.current_search_request = this.apisend(parsed_query, data => {
				this.scroll_up = true;
				this.result_cache = data.results.map(this.process_entry);
				this.results = this.result_cache.splice(0, this.initial_result_count);
				this.add_to_history(this.query);
				this.done_searching = true;
				this.current_search_request = undefined;
			});
		},

		remove(whom) {
			this.apisend({ action: 'remove', id: whom.id }, () =>
				this.results.splice(this.results.indexOf(whom), 1),
			);
		},

		confirm_removal(whom) {
			whom.hesitating = true;
			setTimeout(() => (whom.hesitating = false), 2000);
		},

		vote(whom, no) {
			this.apisend({ action: 'vote', id: whom.id, vote: no }, data =>
				this.update_entry(whom, data.entry),
			);
		},

		note(whom) {
			this.apisend(
				{ action: 'note', id: whom.id, content: whom.input },
				data => {
					whom.uncollapsed = false;
					whom.input = '';
					this.update_entry(whom, data.entry);
				},
			);
		},

		create() {
			this.apisend(
				{
					action: 'create',
					head: this.new_head,
					body: this.new_body,
					scope: this.scope,
				},
				data => {
					this.new_head = this.new_body = '';
					(
						document.querySelector('#create_body') as HTMLTextAreaElement
					).style.height = '24';
					this.done_searching = this.dismissed = true;
					this.add_to_history((this.query = '#' + data.entry.id));
					this.results = [this.process_entry(data.entry)];
				},
			);
		},

		update_limit_search() {
			this.limit_search = !this.limit_search;
			this.store.setItem(
				'limit_search',
				this.limit_search ? 'true' : '' /* death */,
			);
			this.perform_search();
		},

		update_entry(whom, what_with) {
			for (let p in what_with)
				if (Object.hasOwnProperty.call(what_with, p)) whom[p] = what_with[p];
			this.process_entry(whom);
		},

		new_word() {
			this.new_head = this.normalize(this.query, true);
			this.navigate('');
			this.focus_body();
		},

		fork(whom) {
			this.new_head = whom.head;
			this.new_body = whom.body;
			this.navigate('');
			this.focus_body();
		},

		account(func) {
			this.apisend(
				{ action: func, name: this.login_name, pass: this.login_pass },
				data => {
					this.token = data.token;
					this.store.setItem('token', this.token);
					this.username = this.login_name;
					this.login_name = this.login_pass = '';
				},
			);
		},

		clear_account() {
			this.token = this.username = undefined;
			this.store.removeItem('token');
		},

		logout() {
			this.apisend(
				{ action: 'logout' },
				this.clear_account,
				this.clear_account,
			);
		},

		welcome() {
			this.apisend({ action: 'welcome', token: this.token }, data => {
				this.username = data.name;
				if (!data.name) this.token = null;
				else this.perform_search();
			});
		},

		resize() {
			let create = document.getElementById(
				'create_body',
			) as HTMLTextAreaElement;
			if (!create) return;
			let clone = create.cloneNode() as HTMLTextAreaElement;
			create.parentNode!.insertBefore(clone, create);
			clone.style.visibility = 'hidden';
			// clone.style.position = 'absolute';
			clone.style.height = 'auto';
			// clone.style.width = create.scrollWidth + 'px';
			clone.value = create.value;
			let u = clone.scrollTop + clone.scrollHeight;
			if (u > 40) u += 1;
			create.style.height = u + 'px';
			clone.parentNode!.removeChild(clone);
		},

		focus_search() {
			document.getElementById('search')?.focus();
		},

		scrape_cache() {
			let screens =
				(document.body.scrollHeight -
					window.scrollY +
					document.body.scrollTop) /
					window.innerHeight -
				1;
			if (screens > 5) return;
			this.results = this.results.concat(
				this.result_cache.splice(0, this.results.length),
			);
		},

		toggle_theme() {
			this.theme = this.theme === 'light' ? 'dark' : 'light';
			try {
				window.localStorage.setItem('user-theme', this.theme);
			} catch (e) {}
			document.documentElement.className = this.theme;
		},
	},

	data() {
		return {
			dismissed: false,
			done_searching: false,
			error_line: '',
			limit_search: false,
			login_name: '',
			login_pass: '',
			new_head: '',
			new_body: '',
			query: decodeURIComponent(window.location.hash.replace(/^#/, '')),
			queue: {},
			result_cache: [] as any[],
			initial_result_count: 25,
			results: [] as any[],
			scope: 'en',
			scroll_up: false,
			store:
				window.localStorage ||
				(alert(
					"Your browser doesn't support local storage, " +
						'which is required for the app to function properly. ' +
						'Please consider updating.',
				),
				null),
			theme:
				window.localStorage.getItem('user-theme') ??
				(window.matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light'),
			token: null,
			username: null,
			version,
		};
	},
	computed: {
		what_should_i_say() {
			return this.done_searching
				? this.results.length
					? this.result_cache.length
						? 'Loading more…'
						: 'No more results'
					: 'No results'
				: 'Loading…';
		},
	},
	watch: {
		scope(scope) {
			this.store.setItem('scope', scope);
		},
	},
	created() {
		this.debounced_perform = debounce(() => this.perform_search(), 250, {
			maxWait: 500,
		});
		this.perform_search();
		this.token = this.store.getItem('token') || this.token;
		this.limit_search = this.store.getItem('limit_search') || this.limit_search;
		this.scope = this.store.getItem('scope') || this.scope;
		this.welcome(this.token);
	},
	mounted() {
		this.focus_search();
		globalThis.app = this;
		window.addEventListener('hashchange', () =>
			this.navigate(decodeURIComponent(window.location.hash.substring(1))),
		);
		document.body.onscroll = () => this.scrape_cache();
	},
	updated() {
		if (this.scroll_up) {
			this.scroll_up = false;
			document.body.scrollTop = 0;
		}
		// This one has to be called dynamically because of Vue hiding it
		// every now and then
		this.resize();
	},
});
</script>
