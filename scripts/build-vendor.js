'use strict';

// Gera public/vendor a partir de node_modules. Rode `npm run vendor` após atualizar Open Props, Motion ou AutoAnimate.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'vendor');
fs.mkdirSync(out, { recursive: true });

const openProps = ['easings', 'durations', 'animations', 'sizes', 'shadows', 'zindex'];
const css = openProps.map(name => fs.readFileSync(path.join(root, 'node_modules', 'open-props', `${name}.min.css`), 'utf8')).join('\n');
fs.writeFileSync(path.join(out, 'open-props.css'), css);

const entry = "export { animate } from 'motion/mini';";
esbuild.buildSync({
  stdin: { contents: entry, resolveDir: root, loader: 'js' },
  bundle: true, minify: true, format: 'esm', target: 'es2022', outfile: path.join(out, 'motion.js')
});
esbuild.buildSync({
  entryPoints: [path.join(root, 'node_modules', '@formkit', 'auto-animate', 'index.mjs')],
  bundle: true, minify: true, format: 'esm', target: 'es2022', outfile: path.join(out, 'auto-animate.js')
});

for (const file of fs.readdirSync(out)) console.log(file, fs.statSync(path.join(out, file)).size, 'bytes');
