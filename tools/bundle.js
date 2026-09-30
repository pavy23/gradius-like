#!/usr/bin/env node
'use strict';
/*
 * Builds a single self-contained HTML file (all scripts inlined) that can be
 * double-clicked, e-mailed or hosted anywhere:
 *
 *   node tools/bundle.js [output.html]        (default: dist/nova-lancer.html)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist', 'nova-lancer.html'));
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let count = 0;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const file = path.join(root, src);
  if (!fs.existsSync(file)) return `<!-- ${src} not found -->`;
  count++;
  // a literal </script> inside a string would end the inline block early
  const js = fs.readFileSync(file, 'utf8').replace(/<\/script>/gi, '<\\/script>');
  return `<script>\n/* ${src} */\n${js}\n</script>`;
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`bundled ${count} scripts -> ${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB)`);
