import { createApp } from 'vue';
import App from './App.vue';
import { library } from '@fortawesome/fontawesome-svg-core';
import {
	faTrash,
	faChevronUp,
	faChevronDown,
	faCommentDots,
	faCodeBranch,
	faPenToSquare,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';

library.add(
	faTrash,
	faChevronUp,
	faChevronDown,
	faCommentDots,
	faCodeBranch,
	faPenToSquare,
);

const app: any = createApp(App);

app.component('font-awesome-icon', FontAwesomeIcon);

// Define "v-focus" as focusing elements when they are mounted.
app.directive('focus', {
	mounted(el) {
		el.focus();
	},
});

app.mount('#container');
