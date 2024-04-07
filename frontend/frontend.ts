import { createApp } from 'vue';
import App from './App.vue';

const app: any = createApp(App);

// Define "v-focus" as focusing elements when they are mounted.
app.directive('focus', {
	mounted(el) {
		el.focus();
	},
});

app.mount('#container');
