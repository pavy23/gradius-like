#!/usr/bin/env node
'use strict';
/*
 * Boss fight benchmark (needs Playwright + Chromium).
 *
 *   node tools/bossbench.js <stage 1-7> [--power none|mid|full] [--runs 3] [--seed 1] [--diff easy|normal|hard] [--loop 1]
 *                                       [--bot '{"every":6,"horizon":8}'] [--god] [--trace] [--url file-or-url]
 *
 * Starts at the stage's last checkpoint (where the player respawns after dying in front of the boss), optionally
 * hands out power-ups, lets the look-ahead bot of tools/bot.js fight the boss and reports how long the fight took,
 * how often the bot died and what killed it.  Math.random is seeded (--seed, +1 per run) so runs are repeatable.
 *
 *   --power none   no upgrades                          target fight length  35-60 s
 *   --power mid    speed 2, missile, double, 2 options     "        "        ~15-30 s
 *   --power full   speed 5, missile, laser, 4 options, shield  "    "        ~8-20 s
 *   --god          invulnerable bot (damage race only: shows the pure DPS time)
 *   --trace        print the boss health gauge every 2 s (is the damage pace even? are there dead phases?)
 *
 * The bot is an autopilot, not a human: a fight it cannot survive is a hint to read the death log, not proof of a bug
 * (and a fight it clears with zero deaths says little about the nerves of a human player).
 */
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
const power = opt('power', 'none');
const runs = Math.max(1, parseInt(opt('runs', '1'), 10) || 1);
const seed0 = parseInt(opt('seed', '1'), 10) || 1;
const botOpts = JSON.parse(opt('bot', '{"every":6,"horizon":8}'));
const diffKey = opt('diff', '');
const loopNo = Math.max(0, parseInt(opt('loop', '0'), 10) || 0); // 1 = second loop of the game (harder, more HP)
const url = opt('url', 'file://' + path.resolve(__dirname, '..', 'index.html'));

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const results = [];
  const errors = [];
  for (let run = 0; run < runs; run++) {
    const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/favicon/.test(m.text())) errors.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
    await page.addInitScript((seed) => {
      let a = seed >>> 0;
      Math.random = function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }, seed0 + run);
    await page.goto(url + (url.includes('?') ? '&' : '?') + 'manual=1&autostart=1&stage=' + stage + (diffKey ? '&diff=' + diffKey : ''));
    await page.waitForTimeout(300);
    await page.addScriptTag({ path: path.join(__dirname, 'bot.js') });
    const r = await page.evaluate(({ opts, power, god, trace, loopNo }) => {
      for (let i = 0; i < 140; i++) G.step(); // stage intro
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
      G.god = god;
      G.loop = loopNo;
      let fightStart = -1, attempts = 0, prevPhase = null, dyingAt = -1;
      const deaths = [], timeline = [];
      const MAX = 40000;
      let i = 0;
      for (; i < MAX; i++) {
        if (G.mode === 'gameover') Input.setVirtual('start', G.modeT > 100 && G.frame % 4 === 0);
        else if (G.mode === 'play') { Input.setVirtual('start', false); __bot(opts); } else if (G.mode === 'ending' || G.mode === 'intro') break;
        const before = G.player.alive;
        G.step();
        if (before && !G.player.alive) deaths.push({ sec: fightStart >= 0 ? Math.round((i - fightStart) / 6) / 10 : null, phase: G.bossPhase || 'before the boss', hit: G.lastHit ? G.lastHit.kind + ':' + G.lastHit.name : '?' });
        if (G.bossPhase === 'fight' && prevPhase !== 'fight') { fightStart = i; attempts++; }
        prevPhase = G.bossPhase;
        if (trace && G.bossPhase === 'fight' && G.boss && !G.boss.dead && fightStart >= 0 && (i - fightStart) % 120 === 0) {
          timeline.push({ sec: (i - fightStart) / 60, gauge: +(G.boss.def.gauge ? G.boss.def.gauge(G.boss) : 0).toFixed(3), state: String(G.boss.phase || G.boss.st || G.boss.mode || '') });
        }
        if (G.bossPhase === 'dying') { dyingAt = i; break; }
      }
      return { fightSec: dyingAt > 0 ? Math.round(((dyingAt - fightStart) / 60) * 10) / 10 : null, attempts, deaths, timeline, mode: G.mode, bossPhase: G.bossPhase, stageId: G.stage.id, frames: i };
    }, { opts: botOpts, power, god: flag('god'), trace: flag('trace'), loopNo });
    results.push(r);
    const dl = r.deaths.map((d) => `${d.sec === null ? '-' : d.sec + 's'} ${d.hit}`).join('; ');
    console.log(`run ${run + 1}/${runs} seed ${seed0 + run}: ` + (r.fightSec === null ? `boss NOT defeated (mode ${r.mode}, phase ${r.bossPhase}, ${(r.frames / 60).toFixed(0)} s simulated)` : `boss defeated after ${r.fightSec} s of fight (attempt ${r.attempts})`) + `, bot deaths ${r.deaths.length}` + (dl ? ` [${dl}]` : ''));
    if (flag('trace')) for (const t of r.timeline) console.log(`    t=${String(t.sec).padStart(5)}s  health ${(t.gauge * 100).toFixed(0).padStart(3)}%  ${t.state}`);
    await page.close();
  }
  const secs = results.map((r) => r.fightSec).filter((s) => s !== null).sort((a, b) => a - b);
  const tgt = power === 'none' ? '35-60 s' : power === 'full' ? '8-20 s' : '15-30 s';
  console.log(`stage ${stage} boss, power ${power}${flag('god') ? ', god mode' : ''}${diffKey ? ', diff ' + diffKey : ''}${loopNo ? ', loop ' + (loopNo + 1) : ''}: ` + (secs.length ? `fight ${secs[0]}-${secs[secs.length - 1]} s (median ${secs[Math.floor(secs.length / 2)]} s) over ${secs.length}/${runs} runs; target ${tgt}` : 'never defeated'));
  const real = errors.filter((e, i) => errors.indexOf(e) === i);
  if (real.length) console.log('CONSOLE ERRORS:\n  ' + real.join('\n  '));
  await browser.close();
  process.exit(real.length ? 1 : 0);
})();
