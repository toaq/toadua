<script setup lang="ts">
import type { Entry } from './shared/index';

defineProps<{
	result: Entry;
	theme: string;
	username: string | null;
}>();
</script>

<template>
	<div class="card" :lang="result.scope">
		<div class="title">
			<a
				class="date"
				:title="full_date(new Date(result.date))"
				:href="'##' + result.id"
				@click="navigate('#' + result.id)"
			>
				<span style="font-size: 24px">&ZeroWidthSpace;</span
				><time :datetime="result.date">{{
					pretty_date(new Date(result.date))
				}}</time></a
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
					v-if="!editing"
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
		<div class="notes">
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
						title="Remove this note"
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
		<ul class="controls" v-if="username && editing">
			<li>
				<input type="button" value="submit" @click="submit_edit" />
			</li>
			<li>
				<input type="button" value="cancel" @click="editing = false" />
			</li>
		</ul>
		<ul class="controls" v-if="username && !editing">
			<li v-if="!result.uncollapsed">
				<input
					type="button"
					value="add note"
					@click="
						$emit('uncollapse');
						focus_note();
					"
				/>
			</li>
			<li>
				<input
					type="button"
					class="vote-button"
					value="+"
					title="Upvote"
					aria-label="Upvote"
					@click="$emit('vote', +1)"
					:disabled="result.vote == +1"
				/>
			</li>
			<li>
				<input
					type="button"
					class="vote-button"
					value="±"
					title="Retract vote"
					aria-label="Retract vote"
					@click="$emit('vote', 0)"
					:disabled="result.vote == 0"
				/>
			</li>
			<li>
				<input
					type="button"
					class="vote-button"
					value="−"
					title="Downvote"
					aria-label="Downvote"
					@click="$emit('vote', -1)"
					:disabled="result.vote == -1"
				/>
			</li>
			<li v-if="username == result.user && !hesitating">
				<input type="button" value="remove" @click="confirm_removal" />
			</li>
			<li v-if="hesitating">
				<input type="button" value="sure?" @click="$emit('remove')" />
			</li>
			<li>
				<input type="button" value="fork" @click="$emit('fork')" />
			</li>
			<li v-if="username == result.user">
				<input type="button" value="edit" @click="start_edit" />
			</li>
		</ul>
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

		focus_note(): void {
			window.setTimeout(
				() =>
					(
						document.querySelector('.note textarea') as HTMLTextAreaElement
					)?.focus(),
				0,
			);
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
	},
});
</script>
