'use strict';
/* =============================================================
 * STAGE 1 — VOLCANO
 * open space -> rolling hills -> erupting volcanoes -> canyon ->
 * giant volcano (mid-boss vent) -> ash plain -> MAGMA WYRM
 * (boss "s1_wyrm": a chain of basalt plates that snakes across the sky;
 *  only its head can be hurt)
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

  /* =============================================================
   * MAGMA WYRM — the boss of this stage (ENEMIES.s1_wyrm)
   *   A serpent of cooled lava rock. The body is a chain of armour plates that trail the head along its own
   *   path (a distance-indexed position history, like the option trail in player.js): the plates block shots
   *   and hurt on touch, only the HEAD can be damaged. The head weaves a slow figure-eight, so the body forms
   *   S-curves. It stalks slowly towards the ship (head exposed, lingering at the left tip) and darts away fast
   *   (head hidden behind its own body).
   *     enter    swoops in from the right edge; harmless, and parts arm only once they are clear of the ship
   *     phase 1  aimed fireball (the jaw opens first; never at point-blank range) + ember rain (specks hover at
   *              the top with a dotted drop line for 42+ frames, then fall; gaps >= 44 px)
   *     roar     head below 50%: shockwave, the sky flushes red, then straight into the lunge
   *     lunge    the head is shielded (blazing, spark ring: shots glance off) until the wyrm is back. It coils at
   *              the right edge on the lane the ship was in (warning band + arrow, 100+ frames), dashes straight
   *              along that lane at 4.3 px/frame, leaves at the left edge; embers fall during the quiet beat and
   *              it swoops back in 1.7 s later. This fixed choreography is also what stops a strongly powered
   *              ship from deleting the boss in seconds.
   *     phase 2  x1.4 speed, 3-way fireball fans, rain of 5 and another lunge every ~17 s while the head still
   *              has more than 30% health
   *     death    the head blows up, the limp body slumps, cools and pops plate by plate
   * ============================================================= */
  const S1_CFG = {
    headHp: 186, // head health before difficulty / loop scaling
    v1: 0.9, // head speed on the figure-eight at its fastest (the centre crossing), px/frame, phase 1
    v2: 1.3, // ... phase 2 (x1.4)
    linger: 0.3, // speed factor at the left tip of the figure-eight (1 = constant speed): the wyrm lingers close to the ship
    lingerR: 0.6, // ... at the right tip, far from the ship: no point hanging about there
    bias: 0.65, // > 0: it stalks slowly towards the ship (head exposed) and darts quickly away (head hidden behind its body)
  };
  const S1_FIG = { cx: 163, cy: 106, ax: 72, ay: 55 }; // the head's figure-eight: x = cx + ax sin u, y = cy + ay sin 2u
  const S1_HEAD = { w: 25, h: 20, k: 1.25 }; // head hit box; k = scale of the head art (drawn on a 20 x 16 grid)
  const S1_SEG = [15, 15, 14, 14, 13, 13, 12, 11, 10, 9]; // armour plate sizes, neck -> tail
  const S1_DIST = ((sz) => { // arc length behind the head of every plate (they overlap by 2.5 px); the last entry is the tail tip
    const out = [15];
    for (let i = 1; i < sz.length; i++) out.push(out[i - 1] + (sz[i - 1] + sz[i]) / 2 - 2.5);
    out.push(out[sz.length - 1] + 8.5);
    return out;
  })(S1_SEG);
  const S1_TAIL = S1_SEG.length; // index of the tail tip in S1_DIST / e.pos
  const S1_R = 18; // radius of the coil the wyrm winds up in before the lunge
  const S1_MOUTH = 13; // how far in front of its centre the head's mouth is
  const S1_BAND = 13; // half height of the lunge warning band
  const S1_CHARGE = 30; // frames the jaw stays open (fireball forming in the mouth) before it is spat

  const S1C = {
    b: ['#170c18', '#2e1a28', '#4c2c3e', '#74485a', '#a06c78'], // basalt, darkest -> lightest
    g: ['#8a1c14', '#d8451a', '#ff9024', '#ffe65c'], // glow of the seams, cool -> white-hot
    w: '#fff4b8',
    tooth: '#f2e4c2',
  };

  /** armour plate: dark basalt octagon with a glowing crack (frame 0-3 = glow level, 4 = cooled wreck) */
  function s1BakePlate(k, n) {
    Sprites.painted('s1_seg' + k, n, n, 5, (d, f) => {
      const dim = f === 4;
      const m = n / 2, half = (n - 2) / 2, ch = Math.max(2, Math.round(n * 0.27));
      const inside = (px, py) => {
        const ax = Math.abs(px - m), ay = Math.abs(py - m);
        return ax <= half && ay <= half && ax + ay <= 2 * half - ch + 0.5;
      };
      for (let y = 1; y < n - 1; y++) {
        for (let x = 1; x < n - 1; x++) {
          if (!inside(x + 0.5, y + 0.5)) continue;
          const s = (x + y - 2) / (2 * (n - 3));
          let c = s < 0.3 ? 3 : s < 0.62 ? 2 : s < 0.84 ? 1 : 0;
          if ((y === 1 && x < n - 1 - ch) || (x === 1 && y < n - 1 - ch)) c = 4; // rim light (top / left)
          d.px(x, y, S1C.b[dim ? Math.max(0, c - 1) : c]);
        }
      }
      const gl = dim ? '#5a1810' : S1C.g[f];
      const q = k % 2
        ? [[0.2, 0.3], [0.42, 0.42], [0.38, 0.58], [0.62, 0.68], [0.8, 0.82]]
        : [[0.8, 0.28], [0.58, 0.4], [0.62, 0.56], [0.38, 0.66], [0.2, 0.8]];
      for (let i = 0; i + 1 < q.length; i++) d.line(q[i][0] * n, q[i][1] * n, q[i + 1][0] * n, q[i + 1][1] * n, gl);
      if (!dim && f >= 2) {
        const hx = Math.round(n * (k % 2 ? 0.42 : 0.58)), hy = Math.round(n * (k % 2 ? 0.42 : 0.4));
        d.px(hx, hy, f === 3 ? S1C.w : S1C.g[3]);
        d.px(hx + (k % 2 ? 1 : -1), hy + 1, S1C.g[3]);
      }
      // lava glimmering in the gaps between plates (left / right edge)
      if (!dim) {
        d.px(1, Math.round(m), S1C.g[Math.min(2, f)]);
        d.px(n - 2, Math.round(m), S1C.g[Math.min(2, f)]);
      }
      d.outline('k');
    });
  }

  /** spiked tail tip: 8 directions x 4 glow levels (frame = dir * 4 + glow, dir 0 = pointing right) */
  function s1BakeTail() {
    Sprites.painted('s1_tail', 15, 15, 32, (d, f) => {
      const a = ((f >> 2) * Math.PI) / 4, gl = f & 3;
      const ca = Math.cos(a), sa = Math.sin(a);
      const T = (pts) => pts.map(([x, y]) => [7.5 + x * ca - y * sa, 7.5 + x * sa + y * ca]);
      d.poly(T([[-4, -4], [1, -3.8], [6.2, 0], [1, 3.8], [-4, 4]]), S1C.b[2]);
      d.poly(T([[-3.5, -3.4], [1, -3.2], [5.2, -0.3], [-1, -0.2]]), S1C.b[3]);
      d.poly(T([[1.5, -1.4], [6.6, 0], [1.5, 1.4]]), S1C.g[gl]);
      d.outline('k');
    });
  }

  /** the head, facing left: 3 jaw openings x 7 tilts (frame = jaw * 7 + tilt, tilt -75..+75 degrees, nose up = +) */
  function s1BakeHead(name, C) {
    const K = S1_HEAD.k, SZ = 46, C0 = 23;
    const tilts = [-75, -50, -25, 0, 25, 50, 75].map((a) => (a * Math.PI) / 180);
    Sprites.painted(name, SZ, SZ, 21, (d, f) => {
      const jaw = Math.floor(f / 7), a = tilts[f % 7];
      const ca = Math.cos(a), sa = Math.sin(a);
      const T = (pts) => pts.map(([x, y]) => [C0 + (x * ca - y * sa) * K, C0 + (x * sa + y * ca) * K]);
      const jt = [0, 0.3, 0.6][jaw]; // jaw angle
      const piv = [9, 3];
      const J = (pts) => pts.map(([x, y]) => { // rotate about the hinge: the chin swings down
        const dx = x - piv[0], dy = y - piv[1], c = Math.cos(-jt), s = Math.sin(-jt);
        return [piv[0] + dx * c - dy * s, piv[1] + dx * s + dy * c];
      });
      // lower jaw
      d.poly(T(J([[-10, 2], [-3, 2], [5, 2.5], [11, 2.5], [10, 6.5], [4, 8], [-3, 7], [-9, 4.5]])), C.b[1]);
      d.poly(T(J([[-9, 3], [-3, 3], [5, 3.2], [10, 3.2], [9.5, 4.6], [-2, 5.6], [-8, 4]])), C.b[2]);
      d.poly(T(J([[-4, 6.4], [4, 7], [8, 5.6]])), C.g[1]); // lava under the chin
      // maw: dark red -> orange -> white-hot
      if (jaw > 0) {
        const A = [-10, 2], B = [8, 2.5], Cp = [9, 3], D = J([[-10, 3]])[0];
        const cx = (A[0] + B[0] + Cp[0] + D[0]) / 4, cy = (A[1] + B[1] + Cp[1] + D[1]) / 4;
        const sh = (k) => [A, B, Cp, D].map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
        d.poly(T(sh(1)), '#3a0c10');
        d.poly(T(sh(0.8)), C.g[0]);
        d.poly(T(sh(0.55)), C.g[2]);
        d.poly(T(sh(0.3)), C.w);
      }
      // lower teeth (they move with the jaw)
      for (const x of [-8.5, -5.2]) d.poly(T(J([[x, 2.6], [x + 1.6, 2.6], [x + 0.8, 0.2]])), C.tooth);
      // skull
      d.poly(T([[-11, 1.5], [-10, -1.5], [-7, -3.5], [-5, -6.5], [0, -8], [6, -8], [9.5, -5], [11, -1], [11, 2.5], [5, 2.5], [-4, 2], [-10, 2]]), C.b[2]);
      d.poly(T([[-10, -1.2], [-7, -3.2], [-5, -6.2], [0, -7.6], [6, -7.6], [9, -5], [3, -4.2], [-4, -2.2]]), C.b[3]);
      d.poly(T([[-5, -6.5], [0, -8], [5, -7.8], [1, -6.4]]), C.b[4]);
      d.poly(T([[2, 0.5], [10, 0.5], [11, 2.5], [5, 2.5], [-4, 2], [-8, 1.6]]), C.b[1]);
      // upper fangs
      for (const x of [-9.4, -6, -2.6]) d.poly(T([[x, 1.8], [x + 2, 1.8], [x + 1, 4.8]]), C.tooth);
      // horns: swept back, glowing at the tips
      d.poly(T([[1, -7], [3.5, -11.5], [9, -14], [11, -13.4], [7.5, -10], [5.5, -6.5]]), C.b[3]);
      d.poly(T([[9.2, -13.4], [11, -13.4], [7.8, -10.4]]), C.g[2]);
      d.poly(T([[7, -5.5], [11, -8.5], [14.5, -9], [12.5, -5.6], [10.5, -3.5]]), C.b[2]);
      d.poly(T([[13.2, -8.9], [14.5, -9], [12.8, -6.4]]), C.g[2]);
      // frill at the back of the jaw
      d.poly(T([[8, 3], [13, 4.2], [10.5, 7]]), C.b[2]);
      // eye, nostril, cracks
      d.poly(T([[-6.2, -4.4], [-2.6, -4.9], [-2, -3.2], [-5.6, -2.6]]), C.g[2]);
      d.poly(T([[-5.2, -4], [-3, -4.3], [-2.8, -3.4], [-5, -3.1]]), C.g[3]);
      const e1 = T([[-3.6, -3.8]])[0];
      d.px(Math.round(e1[0]), Math.round(e1[1]), C.w);
      const nz = T([[-9.4, -0.4]])[0];
      d.px(Math.round(nz[0]), Math.round(nz[1]), C.g[2]);
      for (const [p0, p1] of [[[2, -6.5], [4.2, -2.8]], [[4.2, -2.8], [3, 0]], [[7.4, -5.6], [8.4, -1.8]]]) {
        const u = T([p0, p1]);
        d.line(u[0][0], u[0][1], u[1][0], u[1][1], C.g[1]);
      }
      d.outline('k');
    });
  }

  // the same head heated up: shown for a few frames whenever a shot lands (keeps every detail, unlike a white flash)
  const S1C_HIT = {
    b: ['#7a2c28', '#b04a30', '#e07a40', '#ffa860', '#ffd890'],
    g: ['#ffc060', '#ffe080', '#fff4a0', '#ffffff'],
    w: '#ffffff',
    tooth: '#ffffff',
  };

  function s1BakeWyrm() {
    S1_SEG.forEach((n, k) => s1BakePlate(k, n));
    s1BakeTail();
    s1BakeHead('s1_head', S1C);
    s1BakeHead('s1_head_hit', S1C_HIT);
    // falling ember (flame trails up) and the glowing speck it forms from at the top of the screen
    Sprites.def('s1_ember', [
      ['..r..', '.ror.', '.oyo.', 'oyhyo', 'oyhyo', '.oyo.', '.rRr.', '..R..'],
      ['.r...', '.ror.', '.oyo.', 'oyhyo', 'oyhyo', '.oyo.', '.rRr.', '..R..'],
    ]);
    Sprites.painted('s1_emberw', 7, 7, 2, (d, f) => {
      if (f) { d.circle(3, 3, 3, 'R'); d.circle(3, 3, 2.2, 'r'); d.circle(3, 3, 1.4, 'o'); d.px(3, 3, 'y'); }
      else { d.circle(3, 3, 2.4, 'R'); d.circle(3, 3, 1.6, 'o'); d.px(3, 3, 'h'); }
    });
  }
  s1BakeWyrm();

  /* ---------- paths ---------- */
  /** position and unit heading on the head's figure-eight at phase u (m = speed of the phase, px per radian) */
  function s1Fig(u) {
    const f = S1_FIG;
    const dx = f.ax * Math.cos(u), dy = 2 * f.ay * Math.cos(2 * u), m = Math.hypot(dx, dy);
    return { x: f.cx + f.ax * Math.sin(u), y: f.cy + f.ay * Math.sin(2 * u), hx: dx / m, hy: dy / m, m };
  }
  /** polyline with cumulative arc length */
  function s1Path(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts, cum, len: cum[cum.length - 1], hint: 1 };
  }
  function s1PathAt(p, s) {
    const c = p.cum, n = c.length;
    if (s <= 0) return { x: p.pts[0].x, y: p.pts[0].y };
    if (s >= p.len) return { x: p.pts[n - 1].x, y: p.pts[n - 1].y };
    let i = p.hint;
    while (i > 1 && c[i - 1] > s) i--;
    while (i < n - 1 && c[i] < s) i++;
    p.hint = i;
    const t = (s - c[i - 1]) / (c[i] - c[i - 1] || 1);
    return { x: p.pts[i - 1].x + (p.pts[i].x - p.pts[i - 1].x) * t, y: p.pts[i - 1].y + (p.pts[i].y - p.pts[i - 1].y) * t };
  }
  function s1Bezier(a, b, c, d) {
    const pts = [];
    const n = Math.max(12, Math.ceil((Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y) + Math.hypot(d.x - c.x, d.y - c.y)) / 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      pts.push({ x: w0 * a.x + w1 * b.x + w2 * c.x + w3 * d.x, y: w0 * a.y + w1 * b.y + w2 * c.y + w3 * d.y });
    }
    return s1Path(pts);
  }
  /** which of the 8 baked tail directions points along angle a */
  const s1TailDir = (a) => ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  /** pixel disc (rows of fillRect) for glows */
  function s1Disc(c, cx, cy, r) {
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      c.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1);
    }
  }

  ENEMIES.s1_wyrm = {
    w: S1_HEAD.w, h: S1_HEAD.h, hp: 99999, score: 10000, keep: true, expl: 'xl', silentDeath: true,
    init(e) {
      const hh = Math.round(S1_CFG.headHp * G.diff.hp * (1 + 0.25 * G.loop));
      e.hp = e.maxHp = 99999;
      // list order = hit-test order: the head first, so a shot touching head and neck hurts the head
      const parts = [{ name: 'head', ox: 0, oy: 0, w: S1_HEAD.w, h: S1_HEAD.h, hp: hh, max: hh, vuln: true, expl: 'xl', score: 5000 }];
      S1_SEG.forEach((n, i) => parts.push({ name: 'plate' + i, ox: 0, oy: 0, w: n, h: n, hp: 99999, vuln: false }));
      parts.push({ name: 'tail', ox: 0, oy: 0, w: 9, h: 9, hp: 99999, vuln: false });
      e.parts = parts;
      e.pos = S1_DIST.map(() => ({ x: 0, y: 0 })); // plate centres (tail tip last)
      e.age = 0;
      e.pt = 0;
      e.stage2 = false;
      e.entered = false;
      e.roarQ = false;
      e.u = 0;
      e.v = 1.2;
      e.vt = 1.7;
      e.tight = 1; // < 1: the body is drawn up tight (coil)
      e.hx = -1;
      e.hy = 0;
      e.dir = -1; // -1: looks left, 1: looks right
      e.tilt = 0;
      e.jaw = 0;
      e.hot = 0;
      e.spit = null;
      e.spitCd = 9999;
      e.rainCd = 9999;
      e.lungeCd = 9999;
      e.coil = null;
      e.lane = 112;
      e.laneA = 0;
      e.sh = 0;
      e.arming = 0;
      this.startEnter(e);
    },

    /* ---------- motion ---------- */
    /** (re)enter from the right edge: swoops in, joins the figure-eight at its top-right peak, heading left */
    startEnter(e) {
      const uj = 0.75 * Math.PI, J = s1Fig(uj);
      const p0 = { x: W + 52, y: 28 };
      e.path = s1Bezier(p0, { x: p0.x - 70, y: p0.y }, { x: J.x + 70, y: J.y }, J);
      e.ps = 0;
      e.uJoin = uj;
      e.x = p0.x;
      e.y = p0.y;
      e.trail = [];
      for (let d = 0; d <= 150; d += 3) e.trail.push({ x: p0.x + d, y: p0.y }); // the body still lies straight, off screen
      e.hx = -1;
      e.hy = 0;
      e.v = 1.2;
      e.tight = 1;
      e.phase = 'enter';
      e.pt = 0;
      for (const p of e.parts) p.harmless = true; // nothing can hurt the ship while the wyrm swoops in
    },
    finishEnter(e) {
      e.u = e.uJoin;
      e.phase = e.stage2 ? 'p2' : 'p1';
      e.pt = 0;
      e.arming = 120; // parts that overlap the ship right now stay harmless until they are clear of it (see arm)
      if (!e.entered) {
        e.entered = true;
        e.spitCd = 150;
        e.rainCd = 260;
      } else {
        e.spitCd = 70;
        e.rainCd = 150;
        e.lungeCd = G.fireDelay(1000);
      }
    },
    /** after the swoop-in the parts become dangerous one by one, as soon as they are clear of the ship */
    arm(e) {
      const P = G.player;
      const expired = --e.arming <= 0; // after 2 s everything is dangerous, whatever the ship does
      let waiting = 0;
      for (const p of e.parts) {
        if (!p.harmless) continue;
        const near = P.alive && Math.abs(P.x - (e.x + p.ox)) < p.w / 2 + 24 && Math.abs(P.y - (e.y + p.oy)) < p.h / 2 + 16;
        if (near && !expired) waiting++;
        else p.harmless = false;
      }
      if (!waiting) e.arming = 0;
    },
    startRoar(e) {
      e.phase = 'roar';
      e.pt = 0;
      e.spit = null;
      for (const b of G.eb) b.dead = true;
      sfx('tentacle');
      G.shake = Math.max(G.shake, 5);
      G.flash = Math.max(G.flash, 3);
      // the sky flushes red-orange for a moment (a slow fade, not a flash; skipped when flashes are reduced)
      G.fx.push({ k: 'fn', x: e.x, y: e.y, t: 0, life: 44, draw: (c, f) => {
        if (G.reduceFlash) return;
        c.globalAlpha = 0.2 * (1 - f.t / 44);
        c.fillStyle = '#ff5a1e';
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
      } });
      for (const d of [0, 12]) {
        G.later(d, () => {
          // shockwave: a ring of heat expanding from the head
          const fx = { k: 'fn', x: e.x, y: e.y, t: 0, life: 36, draw: (c, f) => {
            const r = 6 + f.t * 1.7, a = 1 - f.t / 36;
            c.globalAlpha = a;
            for (let k = 0; k < 28; k++) {
              const an = (k / 28) * TAU;
              c.fillStyle = k & 1 ? '#fff4b8' : '#ff9024';
              c.fillRect(Math.round(f.x + Math.cos(an) * r), Math.round(f.y + Math.sin(an) * r * 0.85), 2, 2);
            }
            c.globalAlpha = 1;
          } };
          G.fx.push(fx);
        });
      }
    },
    /** wind up for the lunge: lock the lane (where the ship is now), swoop to the right edge and coil there */
    startCoil(e) {
      const P = G.player;
      const lane = clamp(P.alive ? P.y : e.y, 52, 166);
      const eps = lane <= 108 ? 1 : -1; // +1: the coil hangs below the lane (exit at its top), -1: mirror image
      const C = { x: 224, y: lane + eps * S1_R };
      const p0 = { x: e.x, y: e.y };
      const p3 = { x: C.x - S1_R, y: C.y }; // enter the coil at its left point, heading down (eps +1) / up (eps -1)
      const d = Math.hypot(p3.x - p0.x, p3.y - p0.y);
      const L1 = clamp(d * 0.45, 24, 90), L2 = clamp(d * 0.4, 20, 60);
      const p1 = { x: p0.x + e.hx * L1, y: clamp(p0.y + e.hy * L1, 40, 176) };
      const p2 = { x: p3.x, y: clamp(p3.y - eps * L2, 40, 176) };
      e.coil = { lane, eps, C, path: s1Bezier(p0, p1, p2, p3), cp: 0, phi: Math.PI, orbit: 0, extra: false };
      e.ps = 0;
      e.phase = 'coil';
      e.pt = 0;
      e.lane = lane;
      e.spit = null;
      sfx('coreOpen');
    },

    move(e) {
      switch (e.phase) {
        case 'enter': {
          e.vt = 1.7;
          e.v += (e.vt - e.v) * 0.06;
          e.ps += e.v;
          const q = s1PathAt(e.path, e.ps);
          e.x = q.x;
          e.y = q.y;
          if (e.ps >= e.path.len) this.finishEnter(e);
          break;
        }
        case 'p1':
        case 'p2':
        case 'roar': {
          const roar = e.phase === 'roar';
          e.vt = roar ? 0.1 : e.stage2 ? S1_CFG.v2 : S1_CFG.v1;
          e.v += (e.vt - e.v) * (roar ? 0.08 : 0.04);
          const cu = Math.cos(e.u), su = Math.sin(e.u);
          const lg = su < 0 ? S1_CFG.linger : S1_CFG.lingerR; // left half of the figure / right half
          e.u += (e.v * (1 - (1 - lg) * su * su) * (1 + S1_CFG.bias * cu)) / s1Fig(e.u).m;
          const g = s1Fig(e.u);
          e.x = g.x;
          e.y = g.y;
          break;
        }
        case 'coil': {
          const c = e.coil;
          e.vt = c.cp === 0 ? 2.0 : 1.8;
          e.v += (e.vt - e.v) * 0.06;
          e.tight += (0.8 - e.tight) * 0.03;
          if (c.cp === 0) {
            e.ps += e.v;
            const q = s1PathAt(c.path, e.ps);
            e.x = q.x;
            e.y = q.y;
            if (e.ps >= c.path.len) { c.cp = 1; c.phi = Math.PI; c.orbit = 0; }
          } else {
            const da = e.v / S1_R;
            c.orbit += da;
            c.phi -= c.eps * da;
            if (!c.extra && c.orbit >= 1.5 * Math.PI && e.pt < 100) c.extra = true; // keep winding: the warning must last
            if (c.orbit >= (c.extra ? 3.5 : 1.5) * Math.PI) {
              // at the exit point of the coil (top for eps +1, bottom for eps -1), heading left, exactly on the lane
              e.x = c.C.x;
              e.y = c.lane;
              e.phase = 'dash';
              e.pt = 0;
              sfx('warp');
              G.shake = Math.max(G.shake, 3);
            } else {
              e.x = c.C.x + S1_R * Math.cos(c.phi);
              e.y = c.C.y + S1_R * Math.sin(c.phi);
            }
          }
          break;
        }
        case 'dash': {
          e.vt = 4.3;
          e.v = Math.min(e.vt, e.v + 0.11);
          e.tight += (1 - e.tight) * 0.05;
          e.x -= e.v;
          e.y = e.coil.lane;
          if (e.pos[S1_TAIL].x < -18) {
            e.phase = 'away';
            e.pt = 0;
            if (G.player.alive) this.rain(e); // the quiet beat while it is gone is filled by embers shaken loose from the sky
            e.rainCd = G.fireDelay(240);
          }
          break;
        }
        case 'away':
          if (e.pt >= 100) this.startEnter(e);
          break;
        default:
          break;
      }
    },

    /** body = the head's position history, sampled at fixed distances behind the head */
    layout(e) {
      const t = e.trail;
      const dx = e.x - t[0].x, dy = e.y - t[0].y, m = Math.hypot(dx, dy);
      if (m > 0.05) {
        e.hx += (dx / m - e.hx) * 0.2;
        e.hy += (dy / m - e.hy) * 0.2;
        const hm = Math.hypot(e.hx, e.hy) || 1;
        e.hx /= hm;
        e.hy /= hm;
        t.unshift({ x: e.x, y: e.y });
      }
      const maxD = S1_DIST[S1_TAIL] + 12;
      let acc = 0, ax = e.x, ay = e.y, seg = 0, k = 0;
      for (; k < t.length && acc <= maxD; k++) {
        const bx = t[k].x, by = t[k].y;
        const L = Math.hypot(bx - ax, by - ay);
        if (L < 1e-6) continue;
        while (seg <= S1_TAIL && acc + L >= S1_DIST[seg] * e.tight) {
          const f = (S1_DIST[seg] * e.tight - acc) / L;
          e.pos[seg].x = ax + (bx - ax) * f;
          e.pos[seg].y = ay + (by - ay) * f;
          seg++;
        }
        acc += L;
        ax = bx;
        ay = by;
      }
      for (; seg <= S1_TAIL; seg++) {
        e.pos[seg].x = ax;
        e.pos[seg].y = ay;
      }
      if (k < t.length) t.length = k;
      const ps = e.parts;
      ps[0].ox = 0;
      ps[0].oy = 0;
      for (let i = 0; i <= S1_TAIL; i++) {
        ps[i + 1].ox = e.pos[i].x - e.x;
        ps[i + 1].oy = e.pos[i].y - e.y;
      }
    },

    /** where the head looks, how far it tilts, how wide the jaw is open */
    look(e) {
      const P = G.player;
      let dir = e.dir, tilt;
      if (e.spit) {
        dir = e.spit.dir;
        tilt = Math.atan2(e.y - P.y, Math.abs(P.x - e.x) + 10);
      } else {
        if (Math.abs(e.hx) > 0.3) dir = e.hx < 0 ? -1 : 1;
        tilt = Math.atan2(-e.hy, Math.abs(e.hx) + 0.02);
        if (e.phase === 'roar') tilt = 1.0;
      }
      e.dir = dir;
      e.tilt += (clamp(tilt, -1.35, 1.35) - e.tilt) * 0.18;
      if (e.spit) {
        const t = e.spit.t;
        e.jaw = t < 5 ? 1 : t < S1_CHARGE + 4 ? 2 : t < S1_CHARGE + 8 ? 1 : 0;
      } else e.jaw = e.phase === 'roar' || e.phase === 'coil' || e.phase === 'dash' ? 2 : 0;
      e.hot = e.phase === 'roar' ? 0.8 : e.phase === 'coil' ? 0.55 + 0.3 * Math.min(1, e.pt / 90) : e.phase === 'dash' ? 0.5 : 0;
      // the lane marker fades in with the coil and out when the wyrm has passed
      if (e.phase === 'coil') e.laneA = Math.min(1, e.laneA + 0.08);
      else if (e.phase === 'dash') e.laneA = e.x < 60 ? Math.max(0, e.laneA - 0.06) : 1;
      else e.laneA = Math.max(0, e.laneA - 0.08);
    },

    update(e) {
      const P = G.player;
      if (e.sh) { e.y -= e.sh; e.sh = 0; } // take back last frame's anchor shift (see the end of this function)
      e.age++;
      e.pt++;
      this.move(e);
      this.layout(e);
      this.look(e);
      if (e.arming) this.arm(e);
      if (e.phase === 'enter' && e.pt === 26) sfx('tentacle'); // the head comes into view
      e.parts[0].vuln = e.phase === 'p1' || e.phase === 'p2'; // blazing (roar, coil, dash, away, swoop-in): shots glance off
      if (e.phase === 'p1' || e.phase === 'p2') {
        if (e.roarQ && e.phase === 'p1') this.startRoar(e);
        else if (P.alive) this.attacks(e);
      } else if (e.phase === 'roar') {
        if (e.pt === 16) sfx('explodeL');
        if (e.pt === 34) sfx('tentacle');
        if (e.pt >= 10 && e.pt <= 40 && e.pt % 6 === 0) {
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * TAU + e.pt, s = rnd(0.8, 1.9);
            G.fx.push({ k: 'part', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rndi(20, 34), t: 0, col: pick(['#ff9424', '#ffe646', '#ffffff']), big: chance(0.4) });
          }
        }
        if (e.pt >= 66) {
          e.stage2 = true;
          this.startCoil(e); // wounded: it roars, winds up and lunges at once (the head is shielded all the while)
        }
      }
      // embers drifting off the tail, sparks off the plates
      const tail = e.pos[S1_TAIL];
      if (e.age % 3 === 0 && tail.x > -8 && tail.x < W + 8) {
        G.fx.push({ k: 'part', x: tail.x + rnd(-2, 2), y: tail.y + rnd(-2, 2), vx: rnd(-0.25, 0.25), vy: -rnd(0.1, 0.55), life: rndi(18, 36), t: 0, col: pick(['#ff9424', '#ffe646', '#f03a3a', '#ff9424']), big: chance(0.3) });
      }
      if (e.phase === 'dash') { // sparks streaming off the plates: the wyrm is moving fast
        const q = e.pos[rndi(0, S1_TAIL - 1)];
        if (q.x > 0 && q.x < W) G.fx.push({ k: 'part', x: q.x, y: q.y + rnd(-5, 5), vx: rnd(0.8, 1.8), vy: rnd(-0.3, 0.3), life: rndi(8, 16), t: 0, col: pick(['#ffe646', '#ffffff', '#ff9424']), big: false });
      }
      if (e.age % 9 === 0) {
        const q = e.pos[rndi(0, S1_TAIL - 1)];
        if (q.x > 0 && q.x < W) G.fx.push({ k: 'part', x: q.x + rnd(-3, 3), y: q.y + rnd(-3, 3), vx: rnd(-0.2, 0.2), vy: -rnd(0.1, 0.4), life: rndi(14, 26), t: 0, col: pick(['#ff9424', '#ffe646']), big: false });
      }
      // While the head is shielded for the lunge, the entity's anchor (e.x, e.y; what an autopilot aims at when nothing
      // is vulnerable) is parked on the far side of the arena from the lane, so nothing is lured into the dash lane.
      // The hurting parts keep their true world positions (their offsets are compensated) and the head is drawn at its
      // true place (draw() subtracts e.sh).
      if (e.phase === 'coil' || e.phase === 'dash' || e.phase === 'away') {
        e.sh = (e.coil.lane < 112 ? 172 : 52) - e.y;
        e.y += e.sh;
        for (const p of e.parts) p.oy -= e.sh;
      }
    },

    /* ---------- attacks ---------- */
    attacks(e) {
      const P = G.player;
      const onScreen = e.x > 40 && e.x < W - 20 && e.y > 30;
      if (e.spit) {
        const s = e.spit;
        if (++s.t === S1_CHARGE) this.fire(e);
        if (s.t >= S1_CHARGE + 10) e.spit = null;
      } else if (--e.spitCd <= 0) {
        // never spit at point-blank range: a fireball born next to the ship could not be dodged
        const near = Math.hypot(P.x - (e.x + (P.x < e.x ? -S1_MOUTH : S1_MOUTH)), P.y - e.y) < 70;
        if (onScreen && !near && G.canFire(e) && G.eb.length < 14) {
          e.spit = { t: 0, dir: P.x < e.x ? -1 : 1 };
          sfx('tentacle');
        } else e.spitCd = 10;
      }
      if (--e.rainCd <= 0) {
        this.rain(e);
        e.rainCd = G.fireDelay(e.stage2 ? 240 : 300);
      }
      if (e.stage2 && !e.spit && --e.lungeCd <= 0) {
        const um = ((e.u % TAU) + TAU) % TAU;
        const h = e.parts[0];
        if (h.hp < h.max * 0.3) e.lungeCd = 1e9; // nearly dead: no more lunges, the fight ends on fans and embers
        else if (um >= 1.5 * Math.PI || um <= Math.PI / 3) this.startCoil(e); // the head is heading right, left of the coil
        else e.lungeCd = 1;
      }
    },
    fire(e) {
      const s = e.spit, P = G.player;
      const mx = e.x + s.dir * S1_MOUTH, my = e.y + 2;
      const o = { spr: 'ebulletL', w: 6, h: 6, anim: 8 };
      G.spark(mx, my);
      e.spitCd = G.fireDelay(e.stage2 ? 112 : 104);
      if (Math.hypot(P.x - mx, P.y - my) < 50) return; // the ship has closed in during the charge: the fireball fizzles
      if (e.stage2) G.fan(mx, my, 3, 0.62, 1.35, o);
      else {
        const [vx, vy] = G.aim(mx, my, 1.3);
        G.ebullet(mx, my, vx, vy, o);
      }
    },
    /** embers condense at the top edge (harmless, 42+ frames), then fall one after another along evenly spaced lanes */
    rain(e) {
      const n = e.stage2 ? 5 : 4, gap = e.stage2 ? 48 : 52, k = G.bulletMul(); // one row, evenly spaced: every lane between embers is 43+ px
      const x0 = rnd(18, 238 - gap * (n - 1));
      const order = [];
      for (let i = 0; i < n; i++) order.push(i);
      for (let i = n - 1; i > 0; i--) { const j = rndi(0, i), t = order[i]; order[i] = order[j]; order[j] = t; }
      sfx('eruption');
      for (let i = 0; i < n; i++) {
        const x = x0 + gap * i, hold = 42 + order[i] * 8, y0 = 28;
        G.ebullet(x, y0, 0, 0, {
          spr: 's1_emberw', w: 5, h: 7, anim: 6, quiet: true,
          custom: (b) => {
            if (b.t < hold) {
              b.harmless = true;
              b.vy = 0;
              b.ay = 0;
              b.y = y0;
            } else if (b.t === hold) {
              b.harmless = false;
              b.spr = 's1_ember';
              b.anim = 4;
              b.vy = 0.7 * k;
              b.ay = 0.03 * k;
            } else if (b.vy > 1.55 * k) {
              b.vy = 1.55 * k;
              b.ay = 0;
            }
            if (b.y > 184 && !b.splash) {
              b.splash = true;
              G.spark(b.x, 189);
            }
          },
        });
      }
    },

    /* ---------- damage ---------- */
    onPartHurt(e, p) {
      if (p.name === 'head' && !e.stage2 && p.hp <= p.max * 0.5) e.roarQ = true;
    },
    onPartDeath(e, p) {
      if (p.name === 'head') G.kill(e);
    },
    gauge(e) {
      const h = e.parts[0];
      return h.dead ? 0 : Math.max(0, h.hp) / h.max;
    },

    /* ---------- death: the head blows up, the limp body slumps, cools and pops plate by plate ---------- */
    onDeath(e) {
      const floorY = 192;
      const pl = [];
      let sx = 0, sy = 0;
      for (let i = 0; i <= S1_TAIL; i++) {
        const q = e.pos[i], n = i < S1_TAIL ? S1_SEG[i] : 9;
        pl.push({ x: q.x, y: q.y, n, k: i, t0: 4 + i * 2, pop: 16 + i * 7 });
        sx += q.x;
        sy += q.y;
      }
      const fall = (p, t) => Math.min(floorY - p.n / 2 + 1, p.y + 0.5 * 0.05 * Math.pow(Math.max(0, t - p.t0), 2));
      const tp = e.pos[S1_TAIL], pr = e.pos[S1_TAIL - 1];
      const wreck = { pl, fall, tailFrame: s1TailDir(Math.atan2(tp.y - pr.y, tp.x - pr.x)) * 4 };
      G.fx.push({ k: 'fn', x: e.x, y: e.y, t: 0, life: 110, draw: (c, f) => ENEMIES.s1_wyrm.drawWreck(wreck, c, f) });
      pl.forEach((p) => {
        G.later(p.pop, () => {
          const y = fall(p, p.pop);
          G.explode(p.x, y, p.k === S1_TAIL ? 'l' : 'm', { quiet: p.k % 2 === 1 });
          for (let i = 0; i < 5; i++) G.fx.push({ k: 'part', x: p.x, y, vx: rnd(-0.8, 0.8), vy: -rnd(0.6, 2), life: rndi(20, 40), t: 0, col: pick(['#ff9424', '#ffe646', '#f03a3a']), big: chance(0.4) });
        });
      });
      G.shake = Math.max(G.shake, 6);
      // the engine's explosion chain runs over the middle of what is left of the body
      e.x = sx / pl.length;
      e.y = sy / pl.length;
      e.w = 100;
      e.h = 50;
      G.bossDefeated(e);
    },
    drawWreck(w, c, f) {
      for (let i = w.pl.length - 1; i >= 0; i--) {
        const p = w.pl[i];
        if (f.t >= p.pop) continue;
        const jx = f.t > p.pop - 8 ? rndi(-1, 1) : 0;
        const y = w.fall(p, f.t);
        if (i === S1_TAIL) Sprites.draw(c, 's1_tail', p.x + jx, y, { frame: w.tailFrame });
        else Sprites.draw(c, 's1_seg' + i, p.x + jx, y, { frame: 4 });
        if (!G.reduceFlash && f.t > p.pop - 6 && (f.t & 1)) Sprites.draw(c, i === S1_TAIL ? 's1_tail' : 's1_seg' + i, p.x + jx, y, { frame: i === S1_TAIL ? w.tailFrame : 4, flash: true, alpha: 0.6 });
      }
    },

    /* ---------- drawing ---------- */
    drawLane(e, c) {
      const L = Math.round(e.lane), a = e.laneA;
      const pulse = G.reduceFlash ? 0.5 : 0.5 + 0.5 * Math.sin(e.age * 0.3);
      c.globalAlpha = a * (0.1 + 0.08 * pulse);
      c.fillStyle = '#ff3a2a';
      c.fillRect(0, L - S1_BAND, W, S1_BAND * 2 + 1); // everything inside the band hurts: the head is 20 px tall, plus the ship's own height
      c.globalAlpha = a * 0.8;
      c.fillStyle = '#ff8a3a';
      for (let x = -((e.age >> 1) % 8); x < W; x += 8) {
        c.fillRect(x, L - S1_BAND, 4, 1);
        c.fillRect(x, L + S1_BAND, 4, 1);
      }
      c.globalAlpha = a;
      // arrow at the left edge: the wyrm is going to come out here
      const on = G.reduceFlash || (e.age >> 3) % 2 === 0;
      c.fillStyle = '#0c0c18';
      for (let i = 0; i < 9; i++) c.fillRect(2 + i, L - i - 1, 1, 2 * i + 3);
      c.fillStyle = on ? '#ffe646' : '#ff5a3a';
      for (let i = 0; i < 8; i++) c.fillRect(3 + i, L - i, 1, 2 * i + 1);
      c.globalAlpha = 1;
    },
    draw(e, c) {
      if (e.laneA > 0) this.drawLane(e, c);
      // the lane each ember will fall along is marked by a faint dotted line while it is still condensing
      for (const b of G.eb) {
        if (b.dead || b.spr !== 's1_emberw') continue;
        c.globalAlpha = G.reduceFlash ? 0.2 : 0.16 + 0.1 * ((e.age >> 3) & 1);
        c.fillStyle = '#ff9a40';
        for (let y = Math.round(b.y) + 7; y < 190; y += 6) c.fillRect(Math.round(b.x), y, 1, 2);
        c.globalAlpha = 1;
      }
      const head = e.parts[0];
      const hy = e.y - e.sh; // true head position (e.y may be the parked anchor, see update)
      // tail tip, then the plates from the tail towards the neck (the neck overlaps its neighbours)
      const tp = e.pos[S1_TAIL], pr = e.pos[S1_TAIL - 1];
      const ta = Math.atan2(tp.y - pr.y, tp.x - pr.x);
      const glow = (i) => {
        if (e.phase === 'roar') return 3;
        const w = 0.5 + 0.5 * Math.sin(e.age * 0.11 - i * 0.62);
        let g = Math.floor(w * 3) + (e.stage2 ? 1 : 0) + (e.phase === 'coil' || e.phase === 'dash' ? 1 : 0);
        return clamp(g, 0, 3);
      };
      // heat haze: a warm halo behind every plate that is glowing hard, so the body stands out against the dark sky
      c.fillStyle = '#ff7a24';
      for (let i = 0; i < S1_SEG.length; i++) {
        const g = glow(i);
        if (g < 2) continue;
        c.globalAlpha = g === 2 ? 0.13 : 0.22;
        s1Disc(c, e.pos[i].x, e.pos[i].y, Math.round(S1_SEG[i] / 2) + 2);
      }
      c.globalAlpha = 1;
      Sprites.draw(c, 's1_tail', tp.x, tp.y, { frame: s1TailDir(ta) * 4 + glow(S1_TAIL) });
      for (let i = S1_SEG.length - 1; i >= 0; i--) Sprites.draw(c, 's1_seg' + i, e.pos[i].x, e.pos[i].y, { frame: glow(i) });
      // head: glow behind it while it is hot or charging a fireball
      const charge = e.spit ? Math.min(1, e.spit.t / S1_CHARGE) : 0;
      if (e.hot > 0 || charge > 0) {
        c.globalAlpha = 0.22 + 0.2 * Math.max(e.hot, charge);
        c.fillStyle = '#ff7a24';
        s1Disc(c, e.x, hy, 16);
        c.globalAlpha = 0.25 + 0.2 * Math.max(e.hot, charge);
        c.fillStyle = '#ffd24a';
        s1Disc(c, e.x, hy, 11);
        c.globalAlpha = 1;
      }
      if (!head.vuln && !head.dead) {
        // shielded: a ring of sparks spins round the head
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * TAU + e.age * 0.13;
          c.fillStyle = k & 1 ? '#fff4b8' : '#ffb030';
          c.fillRect(Math.round(e.x + Math.cos(a) * 17) - 1, Math.round(hy + Math.sin(a) * 15) - 1, 2, 2);
        }
      }
      const ti = clamp(Math.round((e.tilt * 180) / Math.PI / 25) + 3, 0, 6);
      const fr = e.jaw * 7 + ti;
      Sprites.draw(c, head.flash > 0 ? 's1_head_hit' : 's1_head', e.x, hy, { frame: fr, flipX: e.dir > 0 });
      if (e.hot > 0 && !G.reduceFlash) Sprites.draw(c, 's1_head', e.x, hy, { frame: fr, flipX: e.dir > 0, flash: true, alpha: 0.18 * e.hot * (0.5 + 0.5 * Math.sin(e.age * 0.4)) });
      // fireball forming in the mouth
      if (e.spit && e.spit.t < S1_CHARGE) {
        const mx = e.x + e.spit.dir * S1_MOUTH, my = hy + 2;
        Sprites.draw(c, 'ebulletL', mx, my, { frame: (e.age >> 2) & 1, alpha: 0.3 + 0.7 * charge });
      }
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
      S.boss(BOSS_X, 's1_wyrm', {});
    },
  });
})();
