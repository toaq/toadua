import vuePlugin from 'esbuild-plugin-vue3';
import * as esbuild from 'esbuild';
import fs from 'node:fs';

esbuild
	.build({
		entryPoints: ['frontend.ts'],
		bundle: true,
		outfile: 'dist/bundle.js',
		plugins: [vuePlugin()],
	})
	.then(() => {
		fs.copyFileSync('index.html', 'dist/index.html');
	});
