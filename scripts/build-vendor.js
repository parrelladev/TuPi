'use strict';

// Gera public/vendor a partir de node_modules. Rode `npm run vendor` após atualizar Open Props, Motion, AutoAnimate ou Phosphor,
// ou depois de usar um ícone novo (o CSS do Phosphor contém só os ícones que aparecem em public/).
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const out = path.join(publicDir, 'vendor');
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

// Phosphor Icons: só os ícones usados, nos pesos regular e fill, com fonte woff2.
function sourceFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!['vendor', 'avatars'].includes(entry.name)) files.push(...sourceFiles(full)); }
    else if (/\.(html|js|css)$/.test(entry.name)) files.push(full);
  }
  return files;
}
const used = new Set();
for (const file of sourceFiles(publicDir)) {
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/\bph-([a-z0-9]+(?:-[a-z0-9]+)*)\b/g)) if (match[1] !== 'fill') used.add(match[1]);
}
const weights = [
  { dir: 'regular', cls: '.ph', family: 'Phosphor', file: 'Phosphor.woff2' },
  { dir: 'fill', cls: '.ph-fill', family: 'Phosphor-Fill', file: 'Phosphor-Fill.woff2' }
];
const phosphorDir = path.join(out, 'phosphor');
fs.mkdirSync(phosphorDir, { recursive: true });
let phosphorCss = '/* Phosphor Icons (MIT) — gerado por scripts/build-vendor.js */\n';
const missing = new Set();
for (const weight of weights) {
  const srcDir = path.join(root, 'node_modules', '@phosphor-icons', 'web', 'src', weight.dir);
  const source = fs.readFileSync(path.join(srcDir, 'style.css'), 'utf8');
  fs.copyFileSync(path.join(srcDir, weight.file), path.join(phosphorDir, weight.file));
  phosphorCss += `@font-face{font-family:"${weight.family}";src:url("./${weight.file}") format("woff2");font-weight:normal;font-style:normal;font-display:block}\n`;
  const base = source.match(new RegExp(`^\\${weight.cls} \\{[\\s\\S]*?^\\}`, 'm'));
  if (!base) throw new Error(`Regra base ${weight.cls} não encontrada.`);
  phosphorCss += base[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n/g, '\n') + '\n';
  for (const name of [...used].sort()) {
    const rule = source.match(new RegExp(`\\${weight.cls}\\.ph-${name}:before \\{\\s*content: "([^"]+)";\\s*\\}`));
    if (rule) phosphorCss += `${weight.cls}.ph-${name}:before{content:"${rule[1]}"}\n`;
    else if (weight.dir === 'regular') missing.add(name);
  }
}
if (missing.size) { console.error('Ícones inexistentes no Phosphor:', [...missing].join(', ')); process.exit(1); }
fs.writeFileSync(path.join(phosphorDir, 'phosphor.css'), phosphorCss);
console.log(`Phosphor: ${used.size} ícones`);

function listing(dir, prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) listing(path.join(dir, entry.name), `${prefix}${entry.name}/`);
    else console.log(prefix + entry.name, fs.statSync(path.join(dir, entry.name)).size, 'bytes');
  }
}
listing(out);
