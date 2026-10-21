import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
	plugins: [vue()],
	server: {
		// The backend (`npm run dev` in the repository root) serves the API.
		proxy: { '/api': 'http://localhost:29138' },
	},
});
