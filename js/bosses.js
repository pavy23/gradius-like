'use strict';
/* =============================================================
 * "Guardian Core" — the recurring warship boss of stages 1-5
 * (a modest homage to the classic shooter tradition: armoured
 * barriers in front of a glowing core, blue laser volleys, and a
 * core that closes up if you take too long).
 *
 *  - four barrier plates are also the laser ports; killing a plate
 *    silences that port and uncovers part of the core
 *  - the boss cycles CLOSED (invulnerable) -> OPEN (vulnerable)
 *  - when the open window ends the core turns red and is safe again
 * ============================================================= */

const BC_PALS = [
  { hi: '#dfe8f4', mid: '#8496b6', dark: '#38445e', acc: '#ff9424', acc2: '#c05412' }, // steel / orange
  { hi: '#dcf4d0', mid: '#7cb46c', dark: '#2c5c3c', acc: '#ffe646', acc2: '#b89a20' }, // green
  { hi: '#f4dcc0', mid: '#b47a54', dark: '#5a3424', acc: '#48ecf4', acc2: '#2a96c8' }, // rust
  { hi: '#e6d4f8', mid: '#8a66c0', dark: '#3c2870', acc: '#f478c8', acc2: '#a83a84' }, // violet
  { hi: '#f8d0d0', mid: '#c05a6a', dark: '#661c30', acc: '#ffe646', acc2: '#ff9424' }, // crimson
];

// HP tuned so that a basic ship needs ~35-55 s, a typical mid-power ship ~15 s and a fully powered ship ~7 s.
const BC_CFG = [
  null,
  { plateHp: 14, coreHp: 190, laserEvery: 150, volleys: 1, orbEvery: 0, openT: 360, closedT: 100, speed: 0.55 },
  { plateHp: 16, coreHp: 215, laserEvery: 135, volleys: 2, orbEvery: 110, openT: 360, closedT: 100, speed: 0.6 },
  { plateHp: 18, coreHp: 240, laserEvery: 125, volleys: 2, orbEvery: 90, openT: 350, closedT: 95, speed: 0.65 },
  { plateHp: 20, coreHp: 265, laserEvery: 115, volleys: 3, orbEvery: 80, openT: 350, closedT: 90, speed: 0.7 },
  { plateHp: 22, coreHp: 290, laserEvery: 105, volleys: 3, orbEvery: 70, openT: 340, closedT: 90, speed: 0.8 },
];

function bakeBigCoreArt() {
  const S = Sprites;
  BC_PALS.forEach((P, i) => {
    const key = 'bc' + (i + 1);
    S.painted(key + '_hull', 64, 92, 1, (d) => {
      const body = [[8, 10], [46, 3], [60, 14], [62, 30], [62, 62], [60, 78], [46, 89], [8, 82], [1, 74], [1, 18]];
      d.poly(body, P.dark);
      d.poly([[9, 13], [46, 7], [57, 16], [59, 31], [59, 61], [57, 76], [46, 85], [9, 79], [4, 72], [4, 20]], P.mid);
      d.line(9, 13, 46, 7, P.hi);
      d.line(46, 7, 57, 16, P.hi);
      d.line(4, 20, 9, 13, P.hi);
      d.line(9, 79, 46, 85, P.dark);
      d.line(46, 85, 57, 76, P.dark);
      // bay (recess for plates and core)
      d.rect(1, 18, 30, 56, '#0a0c18');
      d.rect(1, 18, 30, 1, P.dark);
      d.rect(1, 73, 30, 1, P.dark);
      d.rect(30, 18, 1, 56, P.dark);
      for (let y = 22; y < 70; y += 6) d.hline(24, 28, y, '#141a2c');
      // upper / lower caps: accent panels
      d.rect(10, 8, 26, 3, P.acc2);
      d.rect(10, 8, 26, 1, P.acc);
      d.rect(10, 81, 26, 3, P.acc2);
      d.rect(10, 83, 26, 1, P.acc);
      // rear half: seams, rivets and a reactor disc
      for (const y of [30, 62]) d.hline(32, 58, y, P.dark);
      d.vline(41, 22, 30, P.dark);
      d.vline(41, 62, 70, P.dark);
      for (let x = 34; x < 58; x += 6) for (const y of [24, 68]) d.px(x, y, P.hi);
      d.circle(45, 46, 9, P.dark);
      d.circle(45, 46, 7.4, P.acc2);
      d.circle(45, 46, 5.2, P.dark);
      d.circle(45, 46, 3.4, P.acc);
      d.px(44, 45, '#ffffff');
      d.px(45, 45, '#ffffff');
      // engine pods
      d.rect(56, 10, 8, 14, P.dark);
      d.rect(56, 68, 8, 14, P.dark);
      d.rect(56, 10, 8, 2, P.mid);
      d.rect(56, 68, 8, 2, P.mid);
      d.rect(60, 15, 4, 8, '#10131c');
      d.rect(60, 69, 4, 8, '#10131c');
      d.outline('k');
    });
    // barrier plate (2 states: idle, charging)
    for (let f = 0; f < 2; f++) {
      S.painted(key + '_plate' + f, 14, 14, 1, (d) => {
        d.rect(0, 0, 14, 14, P.mid);
        d.rect(0, 0, 14, 2, P.hi);
        d.rect(0, 12, 14, 2, P.dark);
        d.rect(12, 0, 2, 14, P.dark);
        d.rect(0, 2, 1, 10, P.hi);
        d.rect(3, 5, 9, 4, f ? '#ffffff' : '#0a1a44');
        d.rect(3, 6, 9, 2, f ? '#48ecf4' : '#2a96c8');
        d.px(2, 3, P.dark);
        d.px(11, 3, P.dark);
        d.px(2, 10, P.dark);
        d.px(11, 10, P.dark);
        d.outline('k');
      });
    }
  });
  // cores (blue = vulnerable, red = closed)
  for (const [n, cols] of [['bc_core_blue', ['#1c3078', '#2a96c8', '#48ecf4', '#ffffff']], ['bc_core_red', ['#500c1c', '#b02030', '#ff6a5a', '#ffe0d0']]]) {
    S.painted(n, 12, 42, 2, (d, f) => {
      d.rect(1, 1, 10, 40, cols[0]);
      d.rect(2, 2, 8, 38, cols[1]);
      const w = f ? 5 : 4;
      d.rect(6 - Math.ceil(w / 2), 5, w, 32, cols[2]);
      d.rect(5, 9, 2, 24, cols[3]);
      d.px(2, 1, cols[1]);
      d.outline('k');
    });
  }
}
bakeBigCoreArt();

(function registerBigCore() {
  const setVuln = (e, v) => {
    for (const p of e.parts) if (p.name && (p.name[0] === 'b' || p.name === 'core')) p.vuln = v;
  };

  ENEMIES.bigcore = {
    w: 62, h: 90, hp: 99999, score: 10000, keep: true, expl: 'xl', silentDeath: true,
    keepOnBoss: true,
    spr: () => 'bc1_hull',
    init(e, o) {
      const lv = clamp(o.level || 1, 1, 5);
      e.level = lv;
      e.key = 'bc' + lv;
      e.cfg = BC_CFG[lv];
      e.hp = e.maxHp = 99999;
      e.homeX = W - 42;
      e.phase = 'enter';
      e.pt = 0;
      e.atk = 90;
      e.charge = 0;
      e.volleyLeft = 0;
      e.orbCd = 60;
      const ph = e.cfg.plateHp * G.diff.hp * (1 + 0.25 * G.loop);
      const ch = e.cfg.coreHp * G.diff.hp * (1 + 0.25 * G.loop);
      e.parts = [
        { name: 'b0', ox: -23, oy: -21, w: 14, h: 14, hp: ph, max: ph, vuln: false, expl: 'm', score: 300 },
        { name: 'b1', ox: -23, oy: -7, w: 14, h: 14, hp: ph, max: ph, vuln: false, expl: 'm', score: 300 },
        { name: 'b2', ox: -23, oy: 7, w: 14, h: 14, hp: ph, max: ph, vuln: false, expl: 'm', score: 300 },
        { name: 'b3', ox: -23, oy: 21, w: 14, h: 14, hp: ph, max: ph, vuln: false, expl: 'm', score: 300 },
        { name: 'core', ox: -9, oy: 0, w: 10, h: 40, hp: ch, max: ch, vuln: false, expl: 'l', score: 5000 },
        { name: 'hull', ox: 15, oy: 0, w: 32, h: 88, hp: 99999, vuln: false },
        { name: 'capT', ox: 2, oy: -35, w: 52, h: 16, hp: 99999, vuln: false },
        { name: 'capB', ox: 2, oy: 35, w: 52, h: 16, hp: 99999, vuln: false },
      ];
    },
    update(e) {
      const P = G.player;
      e.pt++;
      if (e.phase === 'enter') {
        e.x += (e.homeX - e.x) * 0.035 - 0.05;
        if (e.x <= e.homeX + 0.6) {
          e.x = e.homeX;
          e.phase = 'closed';
          e.pt = 0;
        }
        return;
      }
      if (e.phase === 'closed' && e.pt >= e.cfg.closedT) {
        e.phase = 'open';
        e.pt = 0;
        setVuln(e, true);
        sfx('coreOpen');
      } else if (e.phase === 'open' && e.pt >= e.cfg.openT) {
        e.phase = 'closed';
        e.pt = 0;
        setVuln(e, false);
        sfx('coreClose');
      }
      // follow the player vertically
      const dy = P.alive ? P.y - e.y : 0;
      e.y = clamp(e.y + clamp(dy * 0.025, -e.cfg.speed, e.cfg.speed), 50, H - 46);
      e.x = e.homeX + Math.sin(e.t * 0.021) * 3;

      // laser volleys from the live plates
      if (--e.atk <= 0) {
        e.charge = 24;
        e.volleyLeft = e.cfg.volleys;
        e.atk = G.fireDelay(e.cfg.laserEvery);
      }
      if (e.charge > 0 && --e.charge === 0) {
        let fired = false;
        for (const p of e.parts) {
          if (p.dead || !/^b\d$/.test(p.name)) continue;
          G.ebullet(e.x + p.ox - 9, e.y + p.oy, -3.2, 0, { spr: 'bolt', w: 12, h: 3, anim: 3, quiet: true, raw: false });
          fired = true;
        }
        if (fired) sfx('bossLaser');
        if (--e.volleyLeft > 0) e.charge = 18;
      }
      // aimed orbs while open
      const core = e.parts[4];
      if (e.cfg.orbEvery && e.phase === 'open' && !core.dead && --e.orbCd <= 0) {
        const n = e.level >= 4 ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const [vx, vy] = G.aim(e.x - 16, e.y, 1.5, 0);
          const a = Math.atan2(vy, vx) + (i - (n - 1) / 2) * 0.28;
          G.ebullet(e.x - 16, e.y, Math.cos(a) * 1.5, Math.sin(a) * 1.5, { spr: 'ebullet2', w: 5, h: 5, anim: 6 });
        }
        e.orbCd = G.fireDelay(e.cfg.orbEvery);
      }
    },
    gauge(e) {
      let cur = 0, max = 0;
      for (const p of e.parts) {
        if (p.max) {
          max += p.max;
          if (!p.dead) cur += Math.max(0, p.hp);
        }
      }
      return max ? cur / max : 0;
    },
    onPartDeath(e, p) {
      if (p.name === 'core') G.kill(e);
    },
    onDeath(e) {
      G.fx.push({ k: 'fn', x: e.x, y: e.y, t: 0, life: 136, draw: (c, f) => ENEMIES.bigcore.drawWreck(e, c, f) });
      G.bossDefeated(e);
    },
    drawWreck(e, c, f) {
      const jx = rndi(-1, 1), jy = rndi(-1, 1);
      Sprites.draw(c, e.key + '_hull', f.x + jx, f.y + jy, { flash: (f.t >> 2) % 5 === 0 });
      Sprites.draw(c, 'bc_core_red', f.x + e.parts[4].ox + jx, f.y + jy, { frame: (f.t >> 2) & 1 });
    },
    draw(e, c) {
      const fl = e.flash > 0;
      Sprites.draw(c, e.key + '_hull', e.x, e.y, { flash: false });
      // engine flames
      const fx = e.x + 34;
      const flick = (e.t >> 1) & 1;
      for (const oy of [-33, 33]) {
        c.fillStyle = '#ff9424';
        c.fillRect(Math.round(fx), Math.round(e.y + oy - 3), 4 + flick * 2, 6);
        c.fillStyle = '#ffe646';
        c.fillRect(Math.round(fx), Math.round(e.y + oy - 2), 3 + flick, 4);
        c.fillStyle = '#ffffff';
        c.fillRect(Math.round(fx), Math.round(e.y + oy - 1), 2, 2);
      }
      const core = e.parts[4];
      if (!core.dead) {
        const open = e.phase === 'open';
        Sprites.draw(c, open ? 'bc_core_blue' : 'bc_core_red', e.x + core.ox, e.y, { frame: (e.t >> 3) & 1, flash: core.flash > 0 });
      }
      for (let i = 0; i < 4; i++) {
        const p = e.parts[i];
        if (p.dead) continue;
        const charging = e.charge > 0 && (e.t >> 1) & 1;
        Sprites.draw(c, e.key + '_plate' + (charging ? 1 : 0), e.x + p.ox, e.y + p.oy, { flash: p.flash > 0 });
      }
      void fl;
    },
  };
})();
