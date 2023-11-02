import vuePlugin from 'esbuild-plugin-vue3'
import * as esbuild from 'esbuild'
import fs from 'fs';

esbuild.build({
    entryPoints: ['frontend.ts'],
    bundle: true,
    outfile: 'dist/build.js',
    plugins: [vuePlugin()],
}).then(() => {
    fs.copyFileSync('index.html', 'dist/index.html');
});
