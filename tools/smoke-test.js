#!/usr/bin/env node
'use strict';
/*
 * Headless regression test (needs Playwright + Chromium):
 *
 *   node tools/smoke-test.js               lint every stage and let a bot play the whole game
 *   node tools/smoke-test.js --lint        lint only
 *   node tools/smoke-test.js --god         invulnerable bot (fast full-game flow check)
 *   node tools/smoke-test.js --from 5      start the bot playthrough at stage 5
 *   node tools/smoke-test.js --url <file-or-url>
 *
 * Exit code 1 when a lint issue, a console error, an exception or an unfinished game is found.
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
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'file://' + path.resolve(__dirname, '..', 'index.html'));
const botOpts = JSON.parse(opt('bot', '{"every":6,"horizon":8}'));
const fromStage = Math.max(1, parseInt(opt('from', '1'), 10) || 1);

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
  const errors = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'manual=1' + (flag('god') ? '&god=1' : ''));
  await page.waitForTimeout(300);
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8') });

  let failed = false;

  /* ---- 1. static design lint of every stage ---- */
  const lint = await page.evaluate(() => STAGES.map((_, i) => G.lint(i)));
  for (const r of lint) {
    console.log(`stage ${r.stage}: ${r.info.seconds}s to boss, ${r.info.spawned} spawns, ${r.info.carriers} carriers, narrowest gap ${r.info.narrowestGap.gap}px, arena ${r.info.arenaGap}px`);
    for (const i of r.issues) { console.log('   ISSUE:', i); failed = true; }
  }

  /* ---- 2. bot playthrough ---- */
  if (!flag('lint')) {
    const res = await page.evaluate(({ botOpts, god, fromStage }) => {
      G.startStage = fromStage - 1;
      G.startGame();
      const perStage = {};
      let frames = 0, cleared = false;
      const deaths = [];
      while (frames < 400000) {
        if (G.mode === 'ending') { cleared = true; break; }
        if (G.mode === 'gameover') { Input.setVirtual('start', G.modeT > 100 && G.frame % 4 === 0); }
        else if (G.mode === 'play') { Input.setVirtual('start', false); __bot(botOpts); }
        const before = G.player.alive;
        G.step();
        frames++;
        const id = G.stage ? G.stage.id : 0;
        perStage[id] = (perStage[id] || 0) + 1;
        if (before && !G.player.alive) deaths.push({ stage: id, cam: G.camX, boss: !!G.bossPhase, hit: G.lastHit ? G.lastHit.kind + ':' + G.lastHit.name : '?' });
      }
      return { cleared, frames, perStage, deaths, score: G.score, continues: G.continues };
    }, { botOpts, god: flag('god'), fromStage });
    console.log(`bot ${res.cleared ? 'CLEARED the game' : 'did NOT clear the game'} in ${(res.frames / 3600).toFixed(1)} min of game time, score ${res.score}, continues ${res.continues}`);
    const byStage = {};
    for (const d of res.deaths) byStage[d.stage] = (byStage[d.stage] || 0) + 1;
    console.log('deaths per stage:', JSON.stringify(byStage));
    for (const d of res.deaths.slice(0, 25)) console.log(`   stage ${d.stage} camX ${d.cam}${d.boss ? ' (boss)' : ''} killed by ${d.hit}`);
    if (!res.cleared) failed = true;
  }

  const real = errors.filter((e) => !/favicon/.test(e));
  if (real.length) { console.log('CONSOLE ERRORS:\n  ' + real.join('\n  ')); failed = true; }
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: OK');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
