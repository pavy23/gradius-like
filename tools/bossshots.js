#!/usr/bin/env node
'use strict';
/*
 * Boss fight contact sheet (needs Playwright + Chromium).
 *
 *   node tools/bossshots.js <stage 1-7> [--out sheet.png] [--power none|mid|full] [--every 45] [--n 12] [--cols 3]
 *                                       [--scale 2] [--skip 0] [--mortal] [--bot '{"every":6,"horizon":8}'] [--seed 1]
 *
 * Plays the fight with the look-ahead bot (invulnerable unless --mortal, so the whole fight is seen) and saves ONE
 * png with N frames, one every EVERY simulation steps, starting when the WARNING appears (--skip frames later).
 * Every tile is captioned with the time since the fight began and the boss state.  Look at it: sprites, overlaps with
 * the HUD, attack telegraphs, how the arena looks, what the death sequence looks like.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* try global install */ }
  try {
    const root = cp.execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(root, 'playwright'));
  } catch (e) {
    console.error('Playwright not found. Install it with: npm i -g playwright && npx playwright install chromium');
    process.exit(2);
  }
}

const args = process.argv.slice(2);
const stage = parseInt(args[0], 10) || 1;
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes('--' + n);
const out = path.resolve(opt('out', 'bossshots_stage' + stage + '.png'));
const power = opt('power', 'none');
const every = Math.max(1, parseInt(opt('every', '45'), 10) || 45);
const count = Math.max(1, parseInt(opt('n', '12'), 10) || 12);
const cols = Math.max(1, parseInt(opt('cols', '3'), 10) || 3);
const scale = Math.max(1, parseInt(opt('scale', '2'), 10) || 2);
const skip = Math.max(0, parseInt(opt('skip', '0'), 10) || 0);
const seed = parseInt(opt('seed', '1'), 10) || 1;
const botOpts = JSON.parse(opt('bot', '{"every":6,"horizon":8}'));
const url = opt('url', 'file://' + path.resolve(__dirname, '..', 'index.html'));

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
  const errors = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/favicon/.test(m.text())) errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
  await page.addInitScript((s) => {
    let a = s >>> 0;
    Math.random = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'manual=1&autostart=1&stage=' + stage);
  await page.waitForTimeout(300);
  await page.addScriptTag({ path: path.join(__dirname, 'bot.js') });
  const dataUrl = await page.evaluate(({ opts, power, mortal, every, count, cols, scale, skip }) => {
    for (let i = 0; i < 140; i++) G.step();
    const cps = G.stage.checkpoints;
    G.cpIdx = cps.length - 1;
    G.resetWorld(cps[cps.length - 1]);
    G.player.respawn(false);
    const P = G.player;
    if (power !== 'none') {
      const full = power === 'full';
      P.speedLv = full ? 5 : 2;
      P.missile = true;
      if (full) P.laser = true; else P.dbl = true;
      P.options = full ? 4 : 2;
      if (full) P.shield = 4;
    }
    G.god = !mortal;
    const tiles = [];
    let warnAt = -1, dyingAt = -1, i = 0;
    for (; i < 40000 && tiles.length < count; i++) {
      if (G.mode === 'gameover') Input.setVirtual('start', G.modeT > 100 && G.frame % 4 === 0);
      else if (G.mode === 'play') { Input.setVirtual('start', false); __bot(opts); } else if (G.mode === 'ending' || G.mode === 'intro') break;
      G.step();
      if (warnAt < 0 && G.bossPhase) warnAt = i;
      if (G.bossPhase === 'dying' && dyingAt < 0) dyingAt = i;
      if (warnAt >= 0 && i - warnAt >= skip && (i - warnAt - skip) % every === 0) {
        G.render();
        const c = document.createElement('canvas');
        c.width = 256 * scale;
        c.height = 224 * scale;
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = false;
        x.drawImage(G.cv, 0, 0, c.width, c.height);
        const b = G.boss && !G.boss.dead ? G.boss : null;
        const gauge = b && b.def.gauge ? Math.round(b.def.gauge(b) * 100) + '%' : '';
        tiles.push({ c, cap: `${((i - warnAt) / 60).toFixed(1)}s ${G.bossPhase || ''} ${b ? String(b.phase || b.st || b.mode || '') : ''} ${gauge}`.trim() });
      }
      if (dyingAt >= 0 && i - dyingAt > 200) break;
    }
    const rows = Math.ceil(tiles.length / cols), tw = 256 * scale, th = 224 * scale, strip = 9 * scale;
    const sheet = document.createElement('canvas');
    sheet.width = cols * tw;
    sheet.height = rows * (th + strip);
    const sx = sheet.getContext('2d');
    sx.fillStyle = '#10141c';
    sx.fillRect(0, 0, sheet.width, sheet.height);
    tiles.forEach((t, k) => {
      const ox = (k % cols) * tw, oy = Math.floor(k / cols) * (th + strip);
      sx.drawImage(t.c, ox, oy);
      sx.strokeStyle = '#345';
      sx.strokeRect(ox + 0.5, oy + 0.5, tw - 1, th + strip - 1);
      sx.font = 'bold ' + (6 * scale) + 'px monospace'; // caption strip below the picture: time, engine phase, boss state, health
      sx.fillStyle = '#ffe646';
      sx.fillText(t.cap, ox + 4 * scale, oy + th + 7 * scale);
    });
    return sheet.toDataURL('image/png');
  }, { opts: botOpts, power, mortal: flag('mortal'), every, count, cols, scale, skip });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('saved ' + out);
  const real = errors.filter((e, i) => errors.indexOf(e) === i);
  if (real.length) console.log('CONSOLE ERRORS:\n  ' + real.join('\n  '));
  await browser.close();
  process.exit(real.length ? 1 : 0);
})();
