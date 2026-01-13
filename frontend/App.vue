<template>
	<nav id="menu">
		<div id="control-row">
			<ul id="top-controls" class="controls">
				<li v-if="username">
					logged in as <span :style="color_for(username)">{{ username }}</span>
				</li>
				<li>
					<label for="limit-search">search scope {{ scope }} only:</label
					>&thinsp;<input
						id="limit-search"
						type="button"
						:value="limit_search ? 'yes' : 'no'"
						class="submit"
						@click="update_limit_search"
					/>
				</li>
				<li v-if="username">
					<input type="button" value="logout" class="submit" @click="logout" />
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
			/>
			<input
				type="button"
				id="cancel"
				value="×"
				title="Clear"
				aria-label="Clear"
				v-show="query"
				@click="
					navigate('');
					focus_search();
				"
			/>
		</div>
	</nav>
	<div id="results">
		<div class="error-line" v-if="error_line">
			{{ error_line }}
		</div>
		<div class="result-count" v-if="result_count">
			{{ result_count.toLocaleString('en-US') }} result{{
				result_count === 1 ? '' : 's'
			}}
		</div>
		<Result
			v-for="result in results"
			:key="result.id"
			:result="result"
			:username="username"
			:theme="theme"
			@note="s => note(result, s)"
			@removenote="date => removenote(result, date)"
			@edit="(body, scope) => edit(result, body, scope)"
			@uncollapse="uncollapseOnly(result)"
			@vote="n => vote(result, n)"
			@navigate="s => navigate(s)"
			@remove="remove(result)"
			@fork="fork(result)"
		/>
	</div>
	<div class="card" v-if="query || results.length">
		<h2 class="end-of-results">{{ what_should_i_say }}</h2>
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
			/>
			<datalist id="common-languages">
				<option value="en" />
				<option value="pl" />
				<option value="toa" />
				<option value="tok" />
				<option value="ja" />
				<option value="jbo" />
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
				/>
			</li>
			<li>
				<input
					type="button"
					value="clear"
					@click="new_head = new_body = ''"
					:disabled="!(new_head || new_body)"
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
			/>
		</div>
		<div id="login_password">
			<input
				id="input_password"
				type="password"
				placeholder="password"
				v-model="login_pass"
				autocomplete="current-password"
			/>
		</div>
		<ul class="controls">
			<li>
				<input
					type="submit"
					value="login"
					@click="account('login')"
					:disabled="!(login_name && login_pass)"
				/>
			</li>
			<li>
				<input
					type="button"
					value="register"
					@click="account('register')"
					:disabled="!(login_name && login_pass)"
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
import Result from './Result.vue';
import package_info from './package.json';
import * as shared from './shared/index';
import type { Entry } from './shared/index';
const version = package_info.version;

function position_cursor(f: () => void, event: Event): void {
	const target = event.target as HTMLTextAreaElement;
	const cursor_index = target.selectionStart;
	const target_length = target.value.length;
	const position_offset = target_length - cursor_index;

	f();

	const position = target.value.length - position_offset;
	target.setSelectionRange(position, position);
}

export default defineComponent({
	methods: {
		color_for(name: string): string {
			return shared.color_for(name, this.theme).css;
		},

		normalize: shared.normalize,

		focus_head(): void {
			setTimeout(() => {
				document.getElementById('create_name')?.focus();
			}, 0);
		},

		focus_body(): void {
			setTimeout(() => {
				document.getElementById('create_body')?.focus();
			}, 0);
		},

		apisend(what, or, and) {
			if (!and) {
				and = or;
				or = e => {
					this.error_line = e;
				};
			}
			this.error_line = '';
			let req = this.queue[what.action];
			if (req) req.abort();
			this.queue[what.action] = req = new XMLHttpRequest();
			req.open('POST', 'api', true);
			if (this && this.token) what.token = this.token;
			req.send(JSON.stringify(what));
			const app = this;
			req.onreadystatechange = function () {
				if (this.readyState === 4 && this.status === 200) {
					try {
						const data = JSON.parse(this.responseText);
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

		set_new_head(event: Event): void {
			position_cursor(() => {
				const target = event.target as HTMLInputElement;
				target.value = this.new_head = shared.normalize(target.value, false);
			}, event);
		},

		set_new_body(event: Event): void {
			position_cursor(() => {
				const target = event.target as HTMLTextAreaElement;
				target.value = this.new_body = shared.replacements(
					target.value,
					true,
					true,
					this.theme,
				);
			}, event);
		},

		navigate(where: string): void {
			this.dismissed = true;
			this.query = where;
			this.perform_search();
		},

		add_to_history(query: string): void {
			if (query) this.query = query;
			if (window.history) window.history.replaceState('', '', `#${this.query}`);
			else window.location.hash = this.query;
		},

		search(): void {
			if (this.current_search_request) this.current_search_request.abort();
			this.current_search_request = undefined;
			this.debounced_perform();
		},

		parse_query(): { query: any; ordering: string | undefined } {
			return shared.parse_query(this.query);
		},

		perform_search(): void {
			this.done_searching = false;
			this.error_line = '';
			if (this.queue.search) this.queue.search.abort();
			this.results = this.result_cache = [];
			if (!this.query) {
				this.add_to_history('');
				this.scroll_up = true;
				return;
			}
			const parsed_query = this.parse_query();
			if (this.limit_search)
				parsed_query.query = ['and', ['scope', this.scope], parsed_query.query];
			parsed_query.action = 'search';
			this.current_search_request = this.apisend(parsed_query, data => {
				this.scroll_up = true;
				this.result_cache = data.results;
				this.results = this.result_cache.splice(0, this.initial_result_count);
				this.add_to_history(this.query);
				this.done_searching = true;
				this.current_search_request = undefined;
			});
		},

		remove(whom: Entry): void {
			this.apisend({ action: 'remove', id: whom.id }, () =>
				this.results.splice(this.results.indexOf(whom), 1),
			);
		},

		vote(whom: Entry, no: number): void {
			this.apisend({ action: 'vote', id: whom.id, vote: no }, data =>
				this.update_entry(whom, data.entry),
			);
		},

		note(whom: Entry, input: string): void {
			this.apisend({ action: 'note', id: whom.id, content: input }, data => {
				whom.uncollapsed = false;
				this.update_entry(whom, data.entry);
			});
		},

		removenote(whom: Entry, date: string): void {
			this.apisend({ action: 'removenote', id: whom.id, date }, data => {
				whom.uncollapsed = false;
				this.update_entry(whom, data.entry);
				(document.activeElement as HTMLElement)?.blur();
			});
		},

		uncollapseOnly(whom: Entry): void {
			for (const r of this.results) r.uncollapsed = false;
			whom.uncollapsed = true;
		},

		edit(whom: Entry, body: string, scope: string): void {
			// Update the entry early to prevent a flash of the old body...
			this.update_entry(whom, { body, scope });
			this.apisend({ action: 'edit', id: whom.id, body, scope }, data => {
				// ...but let the API response have the final word:
				this.update_entry(whom, data.entry);
			});
		},

		create(): void {
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
					this.query = `#${data.entry.id}`;
					this.add_to_history(this.query);
					this.results = [data.entry];
				},
			);
		},

		update_limit_search(): void {
			this.limit_search = !this.limit_search;
			this.store.setItem(
				'limit_search',
				this.limit_search ? 'true' : '' /* death */,
			);
			this.perform_search();
		},

		update_entry(whom: Entry, what_with: Partial<Entry>): void {
			for (const p in what_with)
				if (Object.hasOwn(what_with, p)) whom[p] = what_with[p];
		},

		new_word(): void {
			this.new_head = this.normalize(this.query.replace(/#\S+/g, ''), true);
			this.navigate('');
			this.new_head ? this.focus_body() : this.focus_head();
		},

		fork(whom: Entry): void {
			this.new_head = whom.head;
			this.new_body = whom.body;
			this.navigate('');
			this.focus_body();
		},

		account(func: string): void {
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

		clear_account(): void {
			this.token = this.username = undefined;
			this.store.removeItem('token');
		},

		logout(): void {
			this.apisend(
				{ action: 'logout' },
				this.clear_account,
				this.clear_account,
			);
		},

		welcome(): void {
			this.apisend({ action: 'welcome', token: this.token }, data => {
				this.username = data.name;
				if (!data.name) this.token = null;
				else this.perform_search();
			});
		},

		resize(): void {
			const create = document.getElementById(
				'create_body',
			) as HTMLTextAreaElement;
			if (!create) return;
			const clone = create.cloneNode() as HTMLTextAreaElement;
			create.parentNode?.insertBefore(clone, create);
			clone.style.visibility = 'hidden';
			// clone.style.position = 'absolute';
			clone.style.height = 'auto';
			// clone.style.width = create.scrollWidth + 'px';
			clone.value = create.value;
			let u = clone.scrollTop + clone.scrollHeight;
			if (u > 40) u += 1;
			create.style.height = `${u}px`;
			clone.parentNode?.removeChild(clone);
		},

		focus_search(): void {
			document.getElementById('search')?.focus();
		},

		scrape_cache(): void {
			const screens =
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

		toggle_theme(): void {
			this.update_theme(this.theme === 'light' ? 'dark' : 'light');
		},

		update_theme(theme: 'light' | 'dark'): void {
			this.theme = theme;
			const system_theme = this.dark_system_theme.matches ? 'dark' : 'light';
			try {
				// If the user's theme now matches the system theme, continue following the
				// system theme
				if (this.theme === system_theme) this.store.removeItem('user-theme');
				else this.store.setItem('user-theme', this.theme);
			} catch (e) {}
			document.documentElement.className = this.theme;
		},
	},

	data() {
		if (!window.localStorage) {
			alert(
				"Your browser doesn't support local storage, which is required for the app to function properly. Please consider updating.",
			);
		}
		const dark_system_theme = window.matchMedia('(prefers-color-scheme: dark)');
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
			result_cache: [] as Entry[],
			initial_result_count: 25,
			results: [] as Entry[],
			scope: 'en',
			scroll_up: false,
			store: window.localStorage || null,
			dark_system_theme,
			theme:
				window.localStorage.getItem('user-theme') ??
				(dark_system_theme.matches ? 'dark' : 'light'),
			token: null as string | null,
			username: null as string | null,
			version,
		};
	},
	computed: {
		result_count() {
			return this.results.length + this.result_cache.length;
		},
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
		scope(scope: string) {
			this.store.setItem('scope', scope);
		},
	},
	components: {
		Result,
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
		this.dark_system_theme.addEventListener('change', () => {
			if (this.store.getItem('user-theme') === null)
				this.update_theme(this.dark_system_theme.matches ? 'dark' : 'light');
		});
		document.body.onkeydown = e => {
			const mod = /Mac/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
			if (mod && e.key === 'd') {
				e.preventDefault();
				this.new_word();
			}

			const inputFocused =
				document.activeElement &&
				(document.activeElement.tagName === 'INPUT' ||
					document.activeElement.tagName === 'TEXTAREA');
			if (e.key === '/' && !inputFocused) {
				e.preventDefault();
				this.focus_search();
				(document.getElementById('search') as HTMLInputElement)?.select();
			}

			if (e.key === 'Escape') {
				(document.activeElement as HTMLElement)?.blur();
			}
		};
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
