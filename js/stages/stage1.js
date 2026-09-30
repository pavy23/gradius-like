'use strict';
/* =============================================================
 * STAGE 1 — VOLCANO
 * open space -> rolling hills -> erupting volcanoes -> canyon ->
 * giant volcano (mid-boss vent) -> ash plain -> Guardian Core
 * ============================================================= */
(function stage1() {
  /* ---------- art ---------- */
  Sprites.painted('rock', 9, 9, 2, (d, f) => {
    d.circle(4, 4, 3.6, 'T');
    d.circle(4, 4, 2.8, 'O');
    d.circle(4, 4, 1.6, 'o');
    d.px(3, 3, 'y');
    if (f === 0) { d.px(4, 0, 'r'); d.px(2, 1, 'o'); } else { d.px(5, 0, 'o'); d.px(3, 1, 'r'); }
    d.outline('k');
  });
  Sprites.painted('lavaGlow', 18, 14, 3, (d, f) => {
    const h = [9, 12, 10][f];
    d.poly([[9, 13], [3, 13], [5, 13 - h * 0.6], [7, 13 - h * 0.9], [9, 13 - h], [11, 13 - h * 0.85], [13, 13 - h * 0.55], [15, 13]], 'r');
    d.poly([[9, 13], [5, 13], [7, 13 - h * 0.5], [9, 13 - h * 0.75], [11, 13 - h * 0.45], [13, 13]], 'o');
    d.poly([[9, 13], [7, 13], [9, 13 - h * 0.4], [11, 13]], 'y');
  });
  Sprites.painted('vent', 26, 16, 2, (d, f) => {
    d.ellipse(13, 12, 12, 6, 'R');
    d.ellipse(13, 11, 11, 5, 'r');
    d.ellipse(13, 10, 9, 4, 'o');
    d.ellipse(13, 9.5, 6, 2.6, f ? 'y' : 'h');
    d.rect(4, 10, 3, 2, 'O');
    d.rect(19, 10, 3, 2, 'O');
    d.px(9, 8, 'w');
    d.outline('k');
  });

  // far-away glowing volcano silhouettes (parallax strip)
  const farVolcanoes = (P) => {
    const d = new Sprites.Painter(P, H, {});
    const cones = [[60, 70, 44], [190, 90, 60], [330, 60, 40], [440, 80, 54]];
    for (const [cx, w, h] of cones) {
      for (let x = cx - w; x <= cx + w; x++) {
        const t = Math.abs(x - cx) / w;
        const top = H - Math.round(h * Math.pow(1 - t, 1.2)) - 30;
        const X = ((x % P) + P) % P;
        d.rect(X, top, 1, H - top, t < 0.16 ? '#4a1830' : '#26101e');
        if (t < 0.08) d.px(X, top, '#ff7a30');
      }
      d.rect(cx - 3, H - h - 32, 6, 2, '#ff9a40');
      d.rect(cx - 2, H - h - 34, 4, 2, '#ffd070');
    }
    return d.c;
  };

  /* ---------- enemies specific to this stage ---------- */
  ENEMIES.rock = {
    w: 7, h: 7, hp: 1, score: 0, fps: 4, expl: 's',
    spr: () => 'rock',
    init(e, o) {
      e.vx = (o.vx !== undefined ? o.vx : rnd(-0.9, 0.9)) - G.camSpeed;
      e.vy = o.vy !== undefined ? o.vy : -rnd(2.5, 3.5);
      e.g = o.g !== undefined ? o.g : 0.05;
    },
    update(e) {
      e.vy += e.g;
      if (e.t > 14 && e.vy > 0 && G.terrain.solid(G.camX + e.x, e.y + 3)) {
        e.dead = true;
        G.explode(e.x, e.y, 's', { quiet: true });
      }
    },
  };

  ENEMIES.crater = {
    w: 4, h: 4, hp: 1, score: 0, ghost: true, harmless: true, attach: 'floor', sink: 0,
    init(e, o) {
      e.cd = o.first || 50 + rndi(0, 50);
      e.every = o.every || 140;
      e.burst = o.burst || 4;
      e.glow = 0;
    },
    update(e) {
      if (e.glow > 0) e.glow--;
      if (--e.cd <= 0) {
        if (e.x > 30 && e.x < W - 16) {
          e.glow = 34;
          sfx('eruption');
          for (let i = 0; i < e.burst; i++) {
            G.later(i * 5, () => G.spawn('rock', { x: e.x + rnd(-3, 3), y: e.y - 4 }));
          }
        }
        e.cd = e.every + rndi(0, 50);
      }
    },
    draw(e, c) {
      if (e.glow > 0) Sprites.draw(c, 'lavaGlow', e.x, e.y - 5, { frame: (e.t >> 2) % 3, alpha: Math.min(1, e.glow / 10) });
    },
  };

  // mid-boss: the vent of the giant volcano
  ENEMIES.vent = {
    w: 22, h: 12, hp: 44, score: 3000, attach: 'floor', sink: 3, expl: 'l', keep: false,
    spr: () => 'vent',
    init(e) {
      e.cd = 70;
      e.n = 0;
    },
    update(e) {
      e.frame = (e.t >> 4) & 1;
      if (e.x > W - 4 || e.x < 20) return;
      if (--e.cd <= 0) {
        sfx('eruption');
        e.n++;
        const k = 6;
        for (let i = 0; i < k; i++) {
          G.later(i * 3, () => !e.dead && G.spawn('rock', { x: e.x + rnd(-6, 6), y: e.y - 6, vx: rnd(-1.6, 0.9), vy: -rnd(2.6, 3.8) }));
        }
        if (e.n % 2 === 0 && G.player.alive) {
          const [vx, vy] = G.aim(e.x, e.y - 6, 1.4);
          G.ebullet(e.x, e.y - 6, vx, vy, { spr: 'ebullet2', w: 5, h: 5 });
        }
        e.cd = G.fireDelay(78);
      }
    },
    onDeath(e) {
      e.carry = false;
      G.dropCapsule(e.x, e.y - 8);
      G.later(6, () => G.explode(e.x + 8, e.y - 4, 'm'));
      G.later(12, () => G.explode(e.x - 8, e.y - 2, 'm'));
    },
  };

  /* ---------- the stage ---------- */
  const BOSS_X = 3560;
  STAGES.push({
    id: 1,
    name: 'VOLCANO',
    sub: 'ZONE OF FIRE',
    music: 'stage1',
    bossMusic: 'boss',
    scroll: 0.6,
    bossX: BOSS_X,
    checkpoints: [0, 850, 1650, 2500, 3300],

    terrain: () => ({
      length: BOSS_X + W + 120,
      floor: [
        { type: 'slope', x0: 380, x1: 470, h0: 0, h1: 34 },
        { type: 'flat', x0: 470, x1: 1010, h: 34 },
        { type: 'noise', x0: 420, x1: 1010, base: 34, amp: 20, scale: 60, seed: 11, edge: 60 },
        { type: 'hill', x: 610, w: 120, h: 66, shape: 'round' },
        { type: 'hill', x: 770, w: 80, h: 58, shape: 'tri' },
        { type: 'hill', x: 910, w: 110, h: 68, shape: 'cos' },
        { type: 'volcano', x: 1190, w: 190, h: 106, crater: { w: 34, d: 14 } },
        { type: 'flat', x0: 1010, x1: 1900, h: 30 },
        { type: 'noise', x0: 1010, x1: 1900, base: 32, amp: 14, scale: 80, seed: 14, edge: 60 },
        { type: 'hill', x: 1400, w: 90, h: 58, shape: 'round' },
        { type: 'volcano', x: 1560, w: 150, h: 90, crater: { w: 28, d: 12 } },
        { type: 'volcano', x: 1800, w: 220, h: 118, crater: { w: 40, d: 16 } },
        { type: 'noise', x0: 1900, x1: 2520, base: 42, amp: 18, scale: 50, seed: 12, edge: 50 },
        { type: 'flat', x0: 1900, x1: 2520, h: 32 },
        { type: 'volcano', x: 2780, w: 300, h: 128, crater: { w: 46, d: 18 } },
        { type: 'flat', x0: 2500, x1: 3400, h: 30 },
        { type: 'noise', x0: 3000, x1: 3400, base: 34, amp: 16, scale: 60, seed: 13, edge: 50 },
        { type: 'hill', x: 3130, w: 100, h: 60, shape: 'tri' },
        { type: 'hill', x: 3270, w: 140, h: 52, shape: 'cos' },
        { type: 'slope', x0: 3400, x1: 3480, h0: 30, h1: 32 },
        { type: 'flat', x0: 3480, x1: BOSS_X + W + 120, h: 32 },
      ],
      ceil: [
        { type: 'noise', x0: 1930, x1: 2520, base: 44, amp: 14, scale: 44, seed: 21, edge: 70 },
        { type: 'hill', x: 2010, w: 34, h: 66, shape: 'tri' },
        { type: 'hill', x: 2130, w: 40, h: 74, shape: 'tri' },
        { type: 'hill', x: 2290, w: 30, h: 62, shape: 'tri' },
        { type: 'hill', x: 2400, w: 36, h: 72, shape: 'tri' },
        { type: 'noise', x0: 3020, x1: 3230, base: 20, amp: 12, scale: 40, seed: 31, edge: 60 },
        { type: 'hill', x: 3090, w: 30, h: 50, shape: 'tri' },
        { type: 'hill', x: 3170, w: 26, h: 44, shape: 'tri' },
      ],
      skin: {
        kind: 'rock',
        pal: ['#2c1420', '#40202c', '#5a2c38', '#743a44', '#94505a'],
        outline: '#14080e', hi: '#e09468', hi2: '#b06a58', lo: '#1c0a12',
        crack: '#1a0a12', crackGlow: '#c85a20', cracks: 9, speckle: '#c07860', seed: 3,
      },
    }),

    background: () =>
      Backgrounds.make([
        { kind: 'gradient', stops: [[0, '#04030e'], [0.4, '#160a2a'], [0.7, '#4a1832'], [1, '#c8481f']], steps: 20 },
        { kind: 'stars', n: 70, speed: 0.04, drift: 0.02, ymax: 140, seed: 3 },
        { kind: 'strip', build: farVolcanoes, period: 512, speed: 0.12 },
        { kind: 'ridge', color: '#34122a', color2: '#1a0a14', edge: '#b8442a', hMin: 22, hMax: 60, speed: 0.25, seed: 5, jag: 0.7 },
        { kind: 'ridge', color: '#26101c', color2: '#100610', edge: '#e0682e', hMin: 12, hMax: 40, speed: 0.45, seed: 6, jag: 0.5 },
      ]),

    script(S) {
      // -- open space --
      S.wave(60, 'spinner', { n: 5, gap: 12, y: 64, carry: 'last', dirY: 1 });
      S.wave(190, 'spinner', { n: 5, gap: 12, y: 150, carry: 'last', dirY: -1 });
      S.wave(320, 'wave', { n: 6, gap: 14, y: 106, amp: 36, carry: 'last' });
      S.wave(430, 'spinner', { n: 4, gap: 12, y: 46, dirY: 1, turnX: 130 });
      S.wave(440, 'spinner', { n: 4, gap: 12, y: 178, dirY: -1, turnX: 130 });

      // -- rolling hills --
      S.ground(560, 'turret');
      S.ground(700, 'turret');
      S.wave(560, 'wave', { n: 5, gap: 14, y: 70, amp: 24, carry: 'last' });
      S.ground(760, 'walker', { dir: -1 });
      S.wave(700, 'diver', { n: 3, gap: 26, y: 40, dy: 44, carry: 'last' });
      S.ground(880, 'turret');
      S.ground(930, 'walker', { dir: -1 });
      S.wave(860, 'spinner', { n: 6, gap: 12, y: 60, dirY: 1, carry: 'last' });

      // -- volcanoes --
      S.ground(1190, 'crater', { every: 130, burst: 4 });
      S.wave(1020, 'wave', { n: 6, gap: 13, y: 90, amp: 30, carry: 'last' });
      S.ground(1090, 'turret', { burst: true });
      S.ground(1280, 'turret');
      S.wave(1180, 'diver', { n: 4, gap: 22, y: 40, dy: 34 });
      S.ground(1340, 'rocket');
      S.ground(1362, 'rocket');
      S.wave(1330, 'spinner', { n: 5, gap: 12, y: 150, dirY: -1, carry: 'last' });
      S.ground(1480, 'walker', { dir: -1 });
      S.ground(1400, 'hatch', { spawn: 'bug', count: 3, carry: true });
      S.ground(1560, 'crater', { every: 150, burst: 3 });
      S.ground(1800, 'crater', { every: 115, burst: 5 });
      S.wave(1560, 'wave', { n: 6, gap: 12, y: 96, amp: 34 });
      S.ground(1640, 'turret');
      S.wave(1800, 'diver', { n: 4, gap: 20, y: 60, dy: 30, carry: 'last' });
      S.ground(1860, 'rocket');

      // -- canyon --
      S.ceil(2000, 'turret');
      S.ground(2040, 'turret');
      S.ceil(2090, 'turret');
      S.wave(1980, 'wave', { n: 5, gap: 14, y: 116, amp: 14, carry: 'last' });
      S.ground(2150, 'walker', { dir: -1 });
      S.ceil(2200, 'hatch', { spawn: 'bug', count: 3, carry: true });
      S.ceil(2260, 'turret');
      S.ground(2280, 'turret');
      S.wave(2160, 'spinner', { n: 5, gap: 12, y: 96, dirY: 1, turnX: 120, carry: 'last' });
      S.ground(2350, 'rocket');
      S.ceil(2380, 'turret', { burst: true });
      S.wave(2300, 'diver', { n: 4, gap: 20, y: 80, dy: 18 });
      S.ground(2440, 'turret');

      // -- giant volcano: mid-boss vent --
      S.ground(2780, 'vent');
      S.ground(2780, 'crater', { every: 9999, first: 9999 });
      S.wave(2640, 'spinner', { n: 5, gap: 12, y: 60, dirY: 1, carry: 'last' });
      S.wave(2860, 'wave', { n: 6, gap: 13, y: 60, amp: 22, carry: 'last' });
      S.wave(2960, 'diver', { n: 5, gap: 18, y: 50, dy: 28 });

      // -- ash plain (recover power-ups before the boss) --
      S.ground(3050, 'turret');
      S.ground(3120, 'walker', { dir: -1 });
      S.wave(3100, 'spinner', { n: 5, gap: 12, y: 66, dirY: 1, carry: 'last' });
      S.wave(3210, 'spinner', { n: 5, gap: 12, y: 150, dirY: -1, carry: 'last' });
      S.wave(3320, 'wave', { n: 6, gap: 13, y: 100, amp: 36, carry: 'last' });
      S.wave(3420, 'spinner', { n: 5, gap: 12, y: 70, dirY: 1, carry: 'last' });

      // -- boss --
      S.boss(BOSS_X, 'bigcore', { level: 1 });
    },
  });
})();
