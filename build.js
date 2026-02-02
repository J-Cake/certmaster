#!/bin/env node

import * as fs from 'node:fs/promises';
import * as urllib from 'node:url';
import * as pathlib from 'node:path';
import * as esbuild from 'esbuild';

const prod = process.env['NODE_ENV'] === 'production' || process.argv.includes('--prod');

await esbuild.build({
	entryPoints: ['app/main.tsx'],
	bundle: true,
	outdir: 'build',
	sourcemap: !prod,
	minify: prod,
	treeShaking: true,//prod, // Disabling tree shaking stops x509 from working for some fucking reason
	plugins: [
		{name: 'scoped-css', setup(build) {
			build.onResolve({ filter: /\.css\?raw$/ }, async args => {
				const path = await fs.realpath(args.path, {
					resolveDir: args.resolveDir,
					followSymlinks: false,
				});

				return ({
					path,
					namespace: 'scoped-css',
				});
			});

			build.onLoad({ filter: /.*/, namespace: 'scoped-css' }, async args => ({
				contents: await fs.readFile(args.path, 'utf8'),
				loader: 'text',
			}))
		}},
		{name: 'svg', setup(build) {
			build.onResolve({ filter: /\.svg$/ }, async args => {
				const path = await fs.realpath(pathlib.join(args.resolveDir, args.path));

				return ({
					path,
					namespace: 'svg',
				});
			});

			build.onLoad({ filter: /.*/, namespace: 'svg' }, async args => ({
				contents: `import xmlString from '${urllib.pathToFileURL(args.path)}?raw';

					const template = document.createElement('template');
					template.innerHTML = xmlString;
					
					export default template.content.firstChild;`,
				loader: 'js'
			}))
		}},
		{name: 'raw', setup(build) {
			build.onResolve({ filter: /\?raw$/ }, async args => {
				return ({
					path: await fs.realpath(urllib.fileURLToPath(args.path.slice(0, -4)), {
						resolveDir: args.resolveDir,
						followSymlinks: false,
					}),
					namespace: 'raw',
				});
			});

			build.onLoad({ filter: /.*/, namespace: 'raw' }, async function (args) {
				return {
					contents: await fs.readFile(args.path, 'utf8'),
					loader: 'text'
				};
			});
		}}
	],
	loader: {
		".png": "file",
	}
});

await Promise.all([
	fs.copyFile('index.html', 'build/index.html'),
	fs.copyFile('logo/logo.svg', 'build/logo.svg'),
	fs.copyFile('manifest.json', 'build/manifest.json'),
]);