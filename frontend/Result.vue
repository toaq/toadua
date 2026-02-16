<script setup lang="ts">
import type { Entry } from './shared/index';

defineProps<{
	result: Entry;
	theme: string;
	username: string | null;
	limit_search: boolean;
}>();
</script>

<template>
	<div class="card" :lang="result.scope">
		<div class="title">
			<h2>
				<a
					:href="'#' + result.head"
					class="name"
					@click="navigate(result.head)"
					>{{ result.head }}</a
				>
			</h2>
			<div class="info">
				<input
					v-if="editing"
					type="text"
					size="5"
					v-model="new_scope"
					class="scope editing"
					autocomplete="language"
					list="common-languages"
					@keypress.enter.exact.prevent="submit_edit"
				/>
				<a
					v-if="!editing && !limit_search"
					:href="'#scope:' + result.scope"
					class="scope"
					@click="navigate('scope:' + result.scope)"
					>{{ result.scope }}</a
				>
				<div style="position: relative">
					<button
						title="Pronominal class"
						:disabled="!username"
						@click.prevent="username && show_picker($event)"
						:style="{ opacity: result.pronominal_class ? 1 : 0.5 }"
					>
						{{
							result.pronominal_class
								? result.pronominal_class.replace('a', 'á').replace('o', 'ó')
								: '—'
						}}
					</button>
					<select
						v-model="result.pronominal_class"
						:disabled="!username"
						@change="
							guess_other_metadata();
							submit_annotation();
						"
					>
						<option value="ho">hó</option>
						<option value="maq">máq</option>
						<option value="hoq">hóq</option>
						<option value="ta">tá</option>
					</select>
				</div>
				<div style="position: relative">
					<button
						title="Frame"
						v-if="any_metadata"
						:disabled="!username"
						@click.prevent="username && show_picker($event)"
						:style="{ opacity: result.frame ? 1 : 0.5 }"
					>
						({{ result.frame ?? '—' }})
					</button>
					<select
						title="Frame"
						v-if="any_metadata"
						v-model="result.frame"
						:disabled="!username"
						@change="submit_annotation"
					>
						<option value="c">(c)</option>
						<option value="c c">(c c)</option>
						<option value="c c c">(c c c)</option>
						<hr />
						<option value="0">(0)</option>
						<option value="c 0">(c 0)</option>
						<option value="c c 0">(c c 0)</option>
						<hr />
						<option value="c 1i">(c 1i)</option>
						<option value="c 1x">(c 1x)</option>
						<option value="c c 1i">(c c 1i)</option>
						<option value="c c 1j">(c c 1j)</option>
						<option value="c c 1x">(c c 1x)</option>
						<hr />
						<option value="c 2ii">(c 2ii)</option>
						<option value="c 2ix">(c 2ix)</option>
						<option value="c 2xi">(c 2xi)</option>
						<option value="c 2xx">(c 2xx)</option>
						<option value="c c 2ij">(c c 2ij)</option>
						<option value="c c 2xx">(c c 2xx)</option>
					</select>
				</div>
				<div style="position: relative">
					<button
						title="Distribution"
						v-if="result.frame"
						:disabled="!username"
						@click.prevent="username && show_picker($event)"
						:style="{ opacity: result.distribution ? 1 : 0.5 }"
					>
						({{ result.distribution ?? '—' }})
					</button>
					<select
						v-if="result.frame"
						v-model="result.distribution"
						:disabled="!username"
						@change="submit_annotation"
					>
						<option v-if="slots === 1" value="d">(d)</option>
						<option v-if="slots === 1 && last_c" value="n">(n)</option>
						<option v-if="slots === 2" value="d d">(d d)</option>
						<option v-if="slots === 2 && last_c" value="d n">(d n)</option>
						<option v-if="slots === 2" value="n d">(n d)</option>
						<option v-if="slots === 2 && last_c" value="n n">(n n)</option>
						<option v-if="slots === 3" value="d d d">(d d d)</option>
						<option v-if="slots === 3 && last_c" value="d d n">(d d n)</option>
						<option v-if="slots === 3" value="d n d">(d n d)</option>
						<option v-if="slots === 3 && last_c" value="d n n">(d n n)</option>
						<option v-if="slots === 3" value="n d d">(n d d)</option>
						<option v-if="slots === 3 && last_c" value="n d n">(n d n)</option>
						<option v-if="slots === 3" value="n n d">(n n d)</option>
						<option v-if="slots === 3 && last_c" value="n n n">(n n n)</option>
					</select>
				</div>
				<div style="position: relative">
					<button
						title="Subject type"
						v-if="result.frame"
						:disabled="!username"
						@click.prevent="username && show_picker($event)"
						:style="{ opacity: result.subject ? 1 : 0.5 }"
					>
						{{ result.subject ? result.subject[0].toUpperCase() : '—' }}
					</button>
					<select
						v-if="result.frame"
						v-model="result.subject"
						:disabled="!username"
						@change="submit_annotation"
					>
						<option value="agent">A</option>
						<option value="" disabled>Subject is a deliberate agent</option>
						<hr />
						<option value="individual">I</option>
						<option value="" disabled>Subject is a non-event</option>
						<hr />
						<option :disabled="tangible" value="event">E</option>
						<option value="" disabled>Subject is an event</option>
						<hr />
						<option :disabled="tangible" value="predicate">P</option>
						<option value="" disabled>Subject is a proposition</option>
						<hr />
						<option :disabled="tangible" value="shape">S</option>
						<option value="" disabled>
							Subject is spatial (thing or event)
						</option>
						<hr />
						<option :disabled="tangible" value="free">F</option>
						<option value="" disabled>Subject is anything</option>
					</select>
				</div>
			</div>
		</div>
		<textarea
			v-if="editing"
			v-focus
			class="body editing"
			rows="1"
			placeholder="Enter a definition using slots (example: _&hairsp;_&hairsp;_ likes _&hairsp;_&hairsp;_)"
			@input="set_new_body"
			:value.sync="new_body"
			@keypress.enter.exact.prevent="submit_edit"
			autocomplete="off"
			autocorrect="on"
			autocapitalize="on"
			spellcheck="true"
		></textarea>
		<p v-else class="body" v-html="fancy_body"></p>

		<div class="meta-row">
			<div class="meta-info">
				<a
					:href="'#@' + result.user"
					:style="{ color: 'inherit' }"
					@click="navigate('@' + result.user)"
					>{{ result.user }}</a
				>
				·
				<a
					class="date"
					:title="full_date(new Date(result.date))"
					:href="'##' + result.id"
					@click="navigate('#' + result.id)"
				>
					<time :datetime="result.date">{{
						pretty_date(new Date(result.date))
					}}</time></a
				>
			</div>
			<div class="meta-actions">
				<div class="vote-buttons">
					<label>
						<input
							type="checkbox"
							:checked="result.vote == +1"
							title="Upvote"
							aria-label="Upvote"
							:disabled="!username"
							@click="username && $emit('vote', result.vote == +1 ? 0 : +1)"
						/>
						<font-awesome-icon icon="chevron-up" />
					</label>
					<span :style="score_color(result.score)">{{
						score_number(result.score)
					}}</span>
					<label>
						<input
							type="checkbox"
							:checked="result.vote == -1"
							title="Downvote"
							aria-label="Downvote"
							:disabled="!username"
							@click="username && $emit('vote', result.vote == -1 ? 0 : -1)"
						/>
						<font-awesome-icon icon="chevron-down" />
					</label>
				</div>
				<div class="other-buttons">
					<div v-if="username">
						<button
							type="button"
							aria-label="Add a comment"
							title="Add a comment"
							:disabled="result.uncollapsed"
							@click="
								$emit('uncollapse');
								focus_note();
							"
						>
							<font-awesome-icon icon="comment-dots" />
						</button>
					</div>
					<div v-if="username && editing">
						<input type="button" value="submit" @click="submit_edit" />
					</div>
					<div v-if="username && editing">
						<input type="button" value="cancel" @click="editing = false" />
					</div>
					<div v-if="!editing && username == result.user && !hesitating">
						<button
							type="button"
							aria-label="Remove"
							title="Remove"
							@click="confirm_removal"
						>
							<font-awesome-icon icon="trash" />
						</button>
					</div>
					<div v-if="!editing && username && hesitating">
						<input type="button" value="sure?" @click="$emit('remove')" />
					</div>
					<div v-if="!editing && username">
						<button
							type="button"
							aria-label="Fork"
							title="Fork"
							@click="$emit('fork')"
						>
							<font-awesome-icon icon="code-branch" />
						</button>
					</div>
					<div v-if="!editing && username == result.user">
						<button
							type="button"
							aria-label="Edit"
							title="Edit"
							@click="start_edit"
						>
							<font-awesome-icon icon="pen-to-square" />
						</button>
					</div>
				</div>
			</div>
		</div>
		<hr v-if="fancy_notes.length > 0 || result.uncollapsed" />
		<div class="notes" v-if="fancy_notes.length > 0 || result.uncollapsed">
			<p class="note" v-for="note in fancy_notes">
				<a
					:href="'#@' + note.user"
					:style="color_for(note.user)"
					class="note-author"
					@click="navigate('@' + note.user)"
					>{{ note.user }}</a
				><span v-html="note.fancy_content"></span>
				<span v-if="username === note.user" class="note-controls">
					<input
						type="button"
						value="remove"
						title="Remove this comment"
						@click="$emit('removenote', note.date)"
					/>
				</span>
			</p>
			<form
				style="display: contents"
				action="javascript:void('note')"
				v-if="result.uncollapsed"
				@keydown.enter.prevent="note"
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
						@click="note"
						:disabled="!input"
					/>
				</div>
				<p class="note new_note">
					<textarea
						rows="1"
						autofocus
						autocomplete="off"
						placeholder="comment here"
						v-model="input"
						@input="set_input"
					/>
				</p>
			</form>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import * as shared from './shared/index';

export default defineComponent({
	methods: {
		score_color(score: number): string {
			return shared.score_color(score, this.theme).css;
		},
		color_for(name: string): string {
			return shared.color_for(name, this.theme).css;
		},

		score_number: shared.score_number,

		pretty_date(date: Date): string {
			return date.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
			});
		},

		full_date(date: Date): string {
			return date.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			});
		},

		navigate(to: string): void {
			this.$emit('navigate', to);
		},

		confirm_removal(): void {
			this.hesitating = true;
			setTimeout(() => (this.hesitating = false), 2000);
		},

		set_input(e: Event): void {
			const target = e.target as HTMLTextAreaElement;
			target.value = this.input = shared.replacements(
				target.value,
				true,
				true,
				this.theme,
			);
			target.style.height = '1px';
			target.style.height = target.scrollHeight + 'px';
			target.style.overflowY = 'hidden';
		},

		note(): void {
			this.$emit('note', this.input);
			this.input = '';
		},

		start_edit(): void {
			this.editing = true;
			this.new_body = this.result.body;
			this.new_scope = this.result.scope;
		},

		set_new_body(event: Event): void {
			const target = event.target as HTMLTextAreaElement;
			target.value = this.new_body = shared.replacements(
				target.value,
				true,
				true,
				this.theme,
			);
		},

		submit_edit(): void {
			this.$emit('edit', this.new_body, this.new_scope);
			this.editing = false;
		},

		guess_other_metadata(): void {
			this.result.frame ??= [
				...this.result.body
					.toLowerCase()
					.replace(/\d/g, '')
					.replace(/▯ (\S+ ){0,2}the case/g, '0')
					.replace(/satisf\w+ (property )?▯/g, '1')
					.replace(/property ▯/g, '1')
					.replace(/relation ▯/g, '2')
					.replace(/[^012▯]/g, '')
					.replace(/▯/g, 'c'),
			].join(' ');
			this.result.distribution ??= this.result.frame.replaceAll(/[c012]/g, 'd');
			this.result.subject ??= this.tangible
				? 'individual'
				: this.result.frame.startsWith('c')
				? 'free'
				: 'predicate';
		},

		submit_annotation(): void {
			this.$emit(
				'annotate',
				this.result.pronominal_class,
				this.result.frame,
				this.result.distribution,
				this.result.subject,
			);
		},

		focus_note(): void {
			window.setTimeout(
				() =>
					(
						document.querySelector('.note textarea') as HTMLTextAreaElement
					)?.focus(),
				0,
			);
		},

		show_picker(e: Event): void {
			e.preventDefault();
			(
				(e.currentTarget as HTMLButtonElement)
					.nextElementSibling as HTMLSelectElement
			)?.showPicker();
		},
	},
	data() {
		return {
			hesitating: false,
			input: '',
			editing: false,
			new_body: '',
			new_scope: '',
		};
	},
	computed: {
		fancy_body(): string {
			return shared.replacements(this.result.body, false, false, this.theme);
		},
		fancy_notes(): { user: string; fancy_content: string; date: string }[] {
			const result = this.result as Entry;
			return result.notes.map(({ user, date, content }) => ({
				user,
				date,
				fancy_content: shared.replacements(content, false, false, this.theme),
			}));
		},
		any_metadata(): boolean {
			return !!(
				this.result.pronominal_class ||
				this.result.frame ||
				this.result.distribution ||
				this.result.subject
			);
		},
		slots(): number {
			return this.result.frame?.split(' ')?.length ?? 0;
		},
		last_c(): boolean {
			return this.result.frame?.endsWith('c');
		},
		tangible(): boolean {
			return (
				this.result.pronominal_class === 'ho' ||
				this.result.pronominal_class === 'maq'
			);
		},
	},
});
</script>
