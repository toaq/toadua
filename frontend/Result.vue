<script setup lang="ts">
import { Entry } from './shared/index';

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
				>{{ pretty_date(new Date(result.date)) }}</a
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
		<p class="body" v-html="fancy_body"></p>
		<div class="notes">
			<p class="note" v-for="note in fancy_notes">
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
				@keypress.13.prevent="note"
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
					<input
						type="text"
						autofocus
						autocomplete="off"
						placeholder="comment here"
						v-model="input"
						@input="set_input"
					/>
				</p>
			</form>
		</div>
		<ul class="controls" v-if="username">
			<li v-if="!result.uncollapsed">
				<input type="button" value="add note" @click="$emit('uncollapse')" />
				<!-- TODO: for some reason this doesn't work on second, third… try. jfc -->
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
			const target = e.target as HTMLInputElement;
			target.value = this.input = shared.replacements(target.value, true, true);
		},

		note(): void {
			this.$emit('note', this.input);
			this.input = '';
		},
	},
	data() {
		return {
			hesitating: false,
			input: '',
		};
	},
	computed: {
		fancy_body(): string {
			return shared.replacements(this.result.body, false, false);
		},
		fancy_notes(): { user: string; fancy_content: string }[] {
			const result = this.result as Entry;
			return result.notes.map(({ user, content }) => ({
				user,
				fancy_content: shared.replacements(content, false, false),
			}));
		},
	},
});
</script>
