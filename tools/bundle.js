#!/usr/bin/env node
'use strict';
/*
 * Builds a single self-contained HTML file (all scripts inlined) that can be
 * double-clicked, e-mailed or hosted anywhere:
 *
 *   node tools/bundle.js [output.html]        (default: dist/nova-lancer.html)
 *   node tools/bundle.js out.html --fragment  (only <title>, <style> and the body content — for
 *                                              hosts that wrap the page in their own HTML skeleton)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const fragment = argv.includes('--fragment');
const out = path.resolve(argv.find((a) => !a.startsWith('--')) || path.join(root, 'dist', 'nova-lancer.html'));
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

if (fragment) {
  const title = (html.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
  const styles = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/) || [0, html])[1];
  html = `${title}\n${styles}\n${body}\n`;
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`bundled ${count} scripts -> ${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB)`);
