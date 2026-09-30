'use strict';
/* =============================================================
 * STAGE 2 — STONEHENGE
 *
 * A megalith circle under a huge moon.  Signature enemy: dense SWARMS of
 * tiny drones that weave in braids, lattices, loops and rotating wheels.
 *
 *   plateau -> outer ring (menhirs) -> trilithon gates -> SWARM RUSH
 *   (mid-boss: the Hive Queen) -> hanging arcade -> dolmen field ->
 *   Guardian Core (level 2, green)
 *
 * Everything (art, layout, patterns) is original and generated in code.
 * All names are prefixed with s2_ .
 * ============================================================= */
(function stage2() {
  const BOSS_X = 3720;
  const LEN = BOSS_X + W + 120;
  const SCROLL = 0.65;

  /* ---------------------------------------------------------------
   * small utilities (hash noise, colours, polygon scan-conversion)
   * --------------------------------------------------------------- */
  const s2_smooth = (t) => t * t * (3 - 2 * t);

  function s2_hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1013, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  /** bilinear value noise on an integer lattice */
  function s2_vnoise(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = s2_smooth(x - ix), fy = s2_smooth(y - iy);
    const a = s2_hash(ix, iy, s), b = s2_hash(ix + 1, iy, s), c = s2_hash(ix, iy + 1, s), d = s2_hash(ix + 1, iy + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  const S2_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const s2_bayer = (x, y) => S2_BAYER[(y & 3) * 4 + (x & 3)];

  // 32-bit ABGR colour helpers (Uint32Array views of ImageData)
  const s2_c32 = (css) => Terrain.rgb32(css);
  function s2_mix32(a, b, t) {
    const ar = a & 255, ag = (a >>> 8) & 255, ab = (a >>> 16) & 255;
    const br = b & 255, bg = (b >>> 8) & 255, bb = (b >>> 16) & 255;
    const r = (ar + (br - ar) * t) | 0, g = (ag + (bg - ag) * t) | 0, bl = (ab + (bb - ab) * t) | 0;
    return ((255 << 24) | (bl << 16) | (g << 8) | r) >>> 0;
  }

  /** scan-convert a polygon into integer spans: rows[k] = [[xa, xb), ...] for y = y0 + k */
  function s2_scan(pts) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
    y0 = Math.floor(y0);
    y1 = Math.min(H - 1, Math.ceil(y1));
    const rows = [];
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      const sp = [];
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1]);
        if (xb > xa) sp.push([xa, xb]);
      }
      rows.push(sp);
    }
    return { y0, rows };
  }

  /** the eight rune glyphs (5x7) carved into megaliths, lintels and the arena floor */
  const S2_GLYPHS = [
    '#.#.#/.###./..#../..#../..#../..#../..#..',
    '.#.../.##../.#.#./.##../.#.../.#.../.#...',
    '..#../.#.#./#...#/.#.#./.#.#./#...#/.....',
    '.#.../.##../.#.#./.##../.#.#./.#.../.#...',
    '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
    '#...#/.#.#./..#../.#.#./#...#/..#../..#..',
    '.###./#...#/#.#.#/#...#/.###./..#../..#..',
    '..#../.##../..#../.##../..#../.##../..#..',
  ].map((s) => s.split('/'));

  /* ===============================================================
   * ART — swarm drones, stone eye, rune-seal orbs, hive queen
   * (all drawn with the Painter, light from the top-left, 1px outline)
   * =============================================================== */

  // --- swarm drone: a glowing "rune gnat" (lime shell, amber lantern, pale wings) ---
  Sprites.painted('s2_swarm', 11, 9, 3, (d, f) => {
    const wy = [0, 1, 3][f];
    d.ellipse(5.5, 5.2, 4.2, 2.6, 'N');
    d.ellipse(5.2, 4.9, 3.6, 2.1, 'n');
    d.ellipse(4.6, 4.5, 2.2, 1.2, 'l');
    d.px(2, 5, 'y'); d.px(1, 5, 'y');
    d.ellipse(8.4, 5.2, 1.4, 1.2, 'y');
    d.px(8, 5, 'h');
    d.poly([[4, 4], [3 + (f === 1 ? 1 : 0), 1 + wy], [6, 1 + wy], [7, 4]], 'W');
    d.poly([[5, 4], [7, 2 + wy], [9, 3 + wy], [8, 4]], 'g');
    d.outline('k');
  });
  Sprites.recolor('s2_swarm', 's2_swarm_c', { l: 'o', n: 'r', N: 'R', W: 'y', g: 'o', y: 'w', h: 'w' });

  // --- sentinel: a floating stone eye, carved from one block (closed / half / open) ---
  Sprites.painted('s2_sentinel', 22, 22, 3, (d, f) => {
    const oct = [[6, 1], [15, 1], [20, 6], [20, 15], [15, 20], [6, 20], [1, 15], [1, 6]];
    d.poly(oct, 'G');
    d.poly([[6, 2], [15, 2], [19, 6], [19, 15], [15, 19], [6, 19], [2, 15], [2, 6]], 'g');
    // bevels: light top/left, dark bottom/right
    d.poly([[6, 2], [15, 2], [13, 4], [7, 4], [4, 7], [4, 14], [2, 15], [2, 6]], 'W');
    d.poly([[19, 6], [19, 15], [15, 19], [6, 19], [8, 17], [14, 17], [17, 14], [17, 7]], 'G');
    // inner carved panel
    d.poly([[7, 4], [14, 4], [17, 7], [17, 14], [14, 17], [7, 17], [4, 14], [4, 7]], 'x');
    d.poly([[7, 4], [14, 4], [16, 6], [8, 6], [5, 9], [4, 7]], 'g');
    // chiselled ticks
    d.px(2, 10, 'X'); d.px(2, 11, 'X'); d.px(19, 10, 'X'); d.px(19, 11, 'X');
    d.px(10, 2, 'X'); d.px(11, 2, 'X'); d.px(10, 19, 'd'); d.px(11, 19, 'd');
    // eye socket
    const open = [1, 3, 5][f];
    d.ellipse(10.5, 10.5, 6.6, open + 0.7, 'd');
    if (f > 0) {
      d.ellipse(10.5, 10.5, 5.6, open - 0.2, 'O');
      d.ellipse(10.5, 10.5, 4.5, Math.max(0.8, open - 1.1), 'o');
      d.ellipse(10.5, 10.5, 2.8, Math.max(0.6, open - 1.9), 'y');
      d.vline(10, 10.5 - open + 1, 10.5 + open - 1, 'k');
      d.vline(11, 10.5 - open + 1, 10.5 + open - 1, 'k');
      d.px(8, 9, 'w');
    } else {
      d.hline(5, 16, 10, 'O');
      d.hline(5, 16, 11, 'o');
      d.hline(9, 12, 10, 'y');
    }
    d.hline(4, 17, 10 - open - 1, 'X');
    d.hline(4, 17, 11 + open + 1, 'X');
    d.outline('k');
  });

  // --- rune seal (the stone anchor of an orbiter) and its orbs ---
  Sprites.painted('s2_seal', 15, 15, 2, (d, f) => {
    d.circle(7, 7, 7, 'G');
    d.circle(6.6, 6.6, 6.2, 'g');
    d.circle(6.4, 6.4, 5, 'X');
    d.circle(7, 7, 3.6, 'd');
    d.ring(7, 7, 3.6, 1, f ? 'y' : 'o');
    d.px(7, 7, f ? 'w' : 'y');
    d.px(7, 5, 'o'); d.px(7, 9, 'o'); d.px(5, 7, 'o'); d.px(9, 7, 'o');
    d.poly([[2, 5], [4, 2], [7, 1], [5, 3], [3, 6]], 'W');
    d.outline('k');
  });
  Sprites.recolor('s2_seal', 's2_seal_c', { o: 'r', y: 'w', O: 'R' });
  // orb: violet crystal with a hot core; frame = spinning glint
  Sprites.painted('s2_orb', 11, 11, 4, (d, f) => {
    d.circle(5, 5, 4.8, 'V');
    d.circle(4.7, 4.7, 4.1, 'v');
    d.circle(4.3, 4.3, 2.9, 'p');
    d.circle(4.5, 4.5, 1.7, 'w');
    const a = (f * Math.PI) / 2;
    for (let i = 0; i < 4; i++) {
      const ang = a + (i * Math.PI) / 2;
      d.px(Math.round(5 + Math.cos(ang) * 4.6), Math.round(5 + Math.sin(ang) * 4.6), i % 2 ? 'W' : 'w');
    }
    d.px(3, 3, 'w');
    d.outline('k');
  });
  Sprites.recolor('s2_orb', 's2_orb_c', { V: 'R', v: 'r', p: 'o', W: 'y' });

  // --- hive queen (mid-boss): armoured wasp matron with a golden crown, faces left ---
  const s2_queenFrame = (d, f) => {
    // wings behind the body
    const up = f === 0;
    const w1 = up ? [[30, 16], [34, 3], [50, 0], [56, 6], [44, 14]] : [[30, 17], [40, 8], [56, 8], [58, 14], [44, 19]];
    d.poly(w1, 'g');
    d.poly(up ? [[31, 15], [35, 5], [49, 2], [53, 7], [43, 13]] : [[31, 16], [40, 10], [54, 10], [55, 14], [44, 18]], 'W');
    d.line(33, 15, 50, 4, 'w'); d.line(35, 15, 52, 8, 'g');
    if (up) d.line(38, 13, 48, 9, 'g');
    const w2 = up ? [[36, 28], [50, 36], [58, 43], [46, 42]] : [[36, 28], [52, 34], [62, 38], [50, 40]];
    d.poly(w2, 'G');
    // abdomen: hangs lower, amber warning bands, glowing sting
    d.poly([[40, 23], [52, 21], [62, 27], [64, 32], [58, 38], [46, 39], [38, 34]], 'N');
    d.poly([[41, 24], [52, 22], [60, 27], [58, 30], [42, 32]], 'n');
    for (const x of [46, 52, 58]) { d.vline(x, 23, 37, 'O'); d.vline(x + 1, 24, 36, 'o'); }
    d.rect(44, 36, 14, 2, 'd');
    d.poly([[62, 29], [68, 33], [62, 35]], 'y');
    d.px(64, 33, 'w');
    d.px(44, 25, 'l'); d.px(45, 25, 'l');
    // legs
    for (const [x0, x1] of [[26, 22], [31, 31], [36, 40]]) d.line(x0, 31, x1, 43, 'X');
    // thorax
    d.ellipse(28, 24, 10, 9, 'N');
    d.ellipse(27.6, 23.4, 9, 8, 'n');
    d.ellipse(26.6, 22, 6.8, 5.8, 'l');
    d.poly([[21, 17], [26, 14], [33, 16], [28, 18]], 'h');
    d.ellipse(28, 26, 6, 4, 'n');
    d.circle(28, 25, 3.4, 'O');
    d.circle(28, 25, 2.5, 'y');
    d.px(27, 24, 'w'); d.px(28, 24, 'w');
    // head + eyes + mandibles + antennae + crown
    d.ellipse(13, 24, 8, 7.4, 'N');
    d.ellipse(12.6, 23.6, 7.2, 6.6, 'n');
    d.ellipse(11.5, 22, 5, 4, 'l');
    d.ellipse(8, 23, 3.2, 3.4, 'O');
    d.ellipse(8, 23, 2.3, 2.6, 'o');
    d.px(7, 22, 'w'); d.px(8, 23, 'k');
    d.ellipse(15, 21, 2.2, 2.4, 'O'); d.px(15, 21, 'y');
    d.poly([[3, 27], [8, 27], [9, 31], [5, 34], [4, 30]], 'G');
    d.poly([[4, 28], [7, 28], [8, 31], [5, 32]], 'X');
    d.poly([[7, 17], [8, 13], [10, 16], [12, 12], [14, 16], [16, 13], [17, 17]], 'Y');
    d.poly([[8, 17], [9, 14], [10, 17], [12, 13], [14, 17], [15, 14], [16, 17]], 'y');
    d.px(12, 13, 'w');
    d.line(12, 15, 5, 8, 'X'); d.line(16, 15, 15, 5, 'X');
    d.px(5, 7, 'y'); d.px(4, 7, 'o'); d.px(15, 4, 'y'); d.px(15, 3, 'o');
    d.outline('k');
  };
  Sprites.painted('s2_queen', 70, 46, 2, s2_queenFrame);

  // --- rune cannon: a stone dome with an amber gem (barrel is drawn in code) ---
  Sprites.painted('s2_cannon', 18, 11, 2, (d, f) => {
    d.rect(1, 8, 16, 2, 'G');
    d.rect(2, 7, 14, 1, 'x');
    d.ellipse(9, 6, 6.4, 4.8, 'G');
    d.ellipse(8.6, 5.7, 5.6, 4, 'x');
    d.ellipse(8.2, 5.2, 4.4, 3, 'g');
    d.poly([[4, 4], [6, 2], [10, 1], [7, 3], [5, 5]], 'W');
    d.circle(9.5, 6, 2.3, 'd');
    d.circle(9.5, 6, 1.6, f ? 'y' : 'O');
    d.px(9, 5, f ? 'w' : 'o');
    d.px(3, 8, '#3c8058'); d.px(4, 8, '#3c8058'); d.px(13, 8, '#24594a');
    d.rect(2, 9, 14, 1, 'd');
    d.outline('k');
  });

  // --- boulder crawler: a stone-shelled beetle with a glowing rune on its back (faces left) ---
  Sprites.painted('s2_crawler', 15, 11, 4, (d, f) => {
    for (const [bx, ph] of [[4, 0], [7, 2.1], [10, 4.2]]) {
      const off = Math.round(Math.sin((f * Math.PI) / 2 + ph) * 1.7);
      d.line(bx, 7, bx + off, 10, 'X');
    }
    d.ellipse(8, 4.5, 6.4, 3.9, 'G');
    d.ellipse(7.6, 4.1, 5.6, 3.3, 'x');
    d.ellipse(7, 3.4, 4.2, 2.1, 'g');
    d.poly([[3, 3], [5, 1], [10, 1], [7, 2], [5, 3]], 'W');
    d.hline(6, 11, 5, 'O');
    d.hline(7, 10, 5, f & 1 ? 'y' : 'o');
    d.ellipse(2.2, 5.6, 2.1, 1.8, 'g');
    d.px(1, 5, 'r'); d.px(2, 5, 'R');
    d.outline('k');
  });

  // --- loose keystone: a stalactite of chiselled stone hanging from an arch (tip points down) ---
  Sprites.painted('s2_drop', 12, 19, 2, (d, f) => {
    d.poly([[1, 0], [10, 0], [9, 5], [8, 11], [7, 16], [6, 18], [5, 16], [4, 11], [2, 5]], 'G');
    d.poly([[2, 0], [8, 0], [8, 5], [7, 11], [6, 16], [5, 17], [4, 11], [3, 5]], 'x');
    d.poly([[2, 0], [5, 0], [4, 5], [4, 11], [5, 16], [4, 11], [3, 5]], 'W');
    d.px(7, 3, 'X'); d.px(6, 7, 'X'); d.px(6, 8, 'X'); d.px(5, 12, 'X');
    d.hline(2, 5, 1, '#3c8058'); d.px(3, 2, '#24594a'); d.px(8, 1, '#3c8058'); d.px(2, 2, '#24594a');
    if (f === 1) { d.px(0, 4, 'w'); d.px(10, 8, 'w'); d.px(6, 10, 'w'); }
    d.outline('k');
  });

  // --- ambient rune glow overlays ---
  for (let gi = 0; gi < S2_GLYPHS.length; gi++) {
    Sprites.painted('s2_glyph' + gi, 9, 11, 1, (d) => {
      const gl = S2_GLYPHS[gi];
      for (let j = 0; j < 7; j++)
        for (let i = 0; i < 5; i++) {
          if (gl[j][i] !== '#') continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) d.px(2 + i + dx, 2 + j + dy, '#1f8f98');
        }
      for (let j = 0; j < 7; j++)
        for (let i = 0; i < 5; i++) if (gl[j][i] === '#') d.px(2 + i, 2 + j, '#c8fff6');
    });
  }

  /* ===============================================================
   * TERRAIN — a rolling stone plateau, menhirs, trilithons, dolmens,
   * a hanging arcade.  Height profiles are plain engine features; the
   * megaliths are polygons drawn into the collision mask (shapes) and
   * then re-shaded by hand (decorate) so they read as huge chiselled
   * monoliths instead of masonry.
   * =============================================================== */
  const ARC_P0 = 2960, ARC_SP = 110, ARC_N = 4; // hanging arcade: first pier, spacing, count
  const ARC_SPRING = 68, ARC_PIER = 90, ARC_PW = 11;

  /** ceiling height of the hanging arcade: piers with round arches between them */
  function s2_arcadeH(x) {
    if (x < ARC_P0 - 60 || x > ARC_P0 + (ARC_N - 1) * ARC_SP + ARC_PW) return 0;
    const k = Math.round((x - ARC_P0) / ARC_SP);
    const c = ARC_P0 + k * ARC_SP;
    const dx = Math.abs(x - c);
    const inRange = k >= 0 && k < ARC_N;
    if (inRange && dx <= ARC_PW) return ARC_PIER - Math.max(0, dx - (ARC_PW - 4)); // chamfered pier end
    // bay centre on the side we are on
    const mid = c + (x >= c ? ARC_SP / 2 : -ARC_SP / 2);
    const R = ARC_SP / 2 - ARC_PW;
    const ax = x - mid;
    if (Math.abs(ax) > R) return ARC_SPRING;
    let h = ARC_SPRING - Math.sqrt(R * R - ax * ax) * 0.93;
    if (Math.abs(ax) < 5) h += 3; // keystone
    return h;
  }

  const S2_MAXTOP = 96; // free-standing stones never rise above this y (keeps >= 96 px of sky above them)
  const S2_FLOOR = [
    { type: 'flat', x0: 0, x1: LEN, h: 34 },
    { type: 'noise', x0: 0, x1: 1290, base: 9, amp: 9, scale: 100, seed: 41, edge: 120, mode: 'add' },
    { type: 'hill', x: 300, w: 400, h: 58, shape: 'cos' },
    { type: 'hill', x: 780, w: 300, h: 54, shape: 'cos' },
    { type: 'hill', x: 1120, w: 280, h: 46, shape: 'cos' },
    { type: 'noise', x0: 3440, x1: 3730, base: 6, amp: 6, scale: 90, seed: 43, edge: 80, mode: 'add' },
    { type: 'hill', x: 3560, w: 260, h: 48, shape: 'cos' },
  ];
  const GATE_X0 = 1340, GATE_X1 = 2010;
  const S2_CEIL = [
    { type: 'flat', x0: GATE_X0, x1: GATE_X1, h: 27 },
    { type: 'noise', x0: GATE_X0, x1: GATE_X1, base: 4, amp: 4, scale: 26, seed: 53, mode: 'add' },
    { type: 'fn', x0: ARC_P0 - 60, x1: ARC_P0 + (ARC_N - 1) * ARC_SP + ARC_PW, fn: s2_arcadeH },
  ];

  /** evaluate a feature list at one x exactly like the engine does (used to place stones) */
  function s2_profile(list) {
    const fns = list.map((f) => {
      const fn = Terrain.FEATURES[f.type](f);
      const x0 = Math.max(0, Math.floor(f.x0 !== undefined ? f.x0 : f.x - (f.w || 0) / 2));
      const x1 = Math.min(LEN - 1, Math.ceil(f.x1 !== undefined ? f.x1 : f.x + (f.w || 0) / 2));
      return { f, fn, x0, x1 };
    });
    return (x) => {
      x = Math.round(x);
      let a = 0;
      for (const { f, fn, x0, x1 } of fns) {
        if (x < x0 || x > x1) continue;
        const v = fn(x);
        if (f.mode === 'add') {
          if (v > 0) a += v;
        } else if (v > a) a = v;
      }
      return a;
    };
  }

  /* ---------------- stone polygons ---------------- */
  const S2_TOPS = {
    flat: [[0, 3], [0.12, 1], [0.35, 0], [0.7, 1], [0.9, 0], [1, 3]],
    slantL: [[0, 11], [0.35, 5], [0.62, 0], [1, 2]],
    slantR: [[0, 2], [0.4, 0], [0.7, 4], [1, 13]],
    notch: [[0, 4], [0.18, 0], [0.4, 1], [0.47, 8], [0.6, 7], [0.68, 2], [0.86, 0], [1, 5]],
    peak: [[0, 10], [0.3, 4], [0.52, 0], [0.75, 5], [1, 11]],
    chip: [[0, 3], [0.22, 0], [0.5, 3], [0.62, 1], [0.8, 6], [1, 10]],
    round: [[0, 8], [0.15, 3], [0.35, 1], [0.6, 0], [0.85, 3], [1, 9]],
  };

  function s2_pillarPoly(rng, cx, w, top, style, lean) {
    const hw = w / 2, xl = cx - hw, xr = cx + hw;
    const prof = S2_TOPS[style] || S2_TOPS.flat;
    const pts = [[xl - 3, H + 4]];
    const nS = 4;
    for (let i = 1; i <= nS; i++) {
      const t = i / (nS + 1);
      pts.push([xl - 2.5 * (1 - t) + lean * t + (rng() - 0.5) * 1.6, H - (H - top) * t]);
    }
    for (const [fx, dy] of prof) pts.push([xl + lean + fx * w, top + dy]);
    for (let i = nS; i >= 1; i--) {
      const t = i / (nS + 1);
      pts.push([xr + 2.5 * (1 - t) + lean * t + (rng() - 0.5) * 1.6, H - (H - top) * t]);
    }
    pts.push([xr + 3, H + 4]);
    return pts;
  }
  /** stone leg hanging from the ceiling: a pillar polygon flipped upside down, ending at y = bottom */
  function s2_pendantPoly(rng, cx, w, bottom, style, lean) {
    return s2_pillarPoly(rng, cx, w, H - bottom, style, lean).map(([x, y]) => [x, H - y]);
  }
  function s2_lintelPoly(rng, cx, w, top, th) {
    const xl = cx - w / 2, xr = cx + w / 2;
    return [
      [xl, top + 5], [xl + 3, top + 1], [xl + w * 0.28, top], [xl + w * 0.5, top + 1.5], [xl + w * 0.78, top],
      [xr - 3, top + 1], [xr, top + 5], [xr + 1, top + th - 3], [xr - 3, top + th], [xl + 3, top + th], [xl - 1, top + th - 3],
    ];
  }
  function s2_rockPoly(rng, cx, cy, rx, ry, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const j = 0.88 + rng() * 0.24;
      pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
    }
    return pts;
  }
  function s2_slabPoly(cx, cy, w, th, ang) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const c = [[-w / 2, -th / 2], [w / 2 - 2, -th / 2], [w / 2, -th / 2 + 3], [w / 2, th / 2], [-w / 2 + 3, th / 2], [-w / 2, th / 2 - 3]];
    return c.map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]);
  }

  /** the whole megalith layout (deterministic); also exposes anchor points for the script */
  let S2_LAY = null;
  function s2_layout() {
    if (S2_LAY) return S2_LAY;
    const rng = makeRng(2222);
    const floorAt = s2_profile(S2_FLOOR);
    const stones = [];
    const lay = { stones, gates: [], hgates: [], pillars: {}, dolmens: [], floorAt, floorRunes: [] };
    const gy = (x) => H - Math.round(floorAt(x));

    const push = (t, pts, o = {}) => {
      const sc = s2_scan(pts);
      let x0 = Infinity, x1 = -Infinity;
      for (const r of sc.rows) for (const [a, b] of r) { if (a < x0) x0 = a; if (b > x1) x1 = b; }
      const st = Object.assign({ t, pts, sc, x0, x1, y0: sc.y0, y1: sc.y0 + sc.rows.length, seed: 1 + ((rng() * 9999) | 0), moss: 0.5, rune: null }, o);
      stones.push(st);
      return st;
    };
    /** upright monolith: h = height above the local ground */
    const pillar = (id, cx, w, h, style, o = {}) => {
      const top = Math.max(S2_MAXTOP, o.topY !== undefined ? o.topY : gy(cx) - h);
      const lean = o.lean !== undefined ? o.lean : Math.round((rng() - 0.5) * 3);
      const st = push('pillar', s2_pillarPoly(rng, cx, w, top, style, lean), Object.assign({ cx, w, h, top }, o));
      if (id) lay.pillars[id] = st;
      return st;
    };
    const boulder = (cx, r, o = {}) => {
      const cy = gy(cx) - r * 0.35;
      return push('rock', s2_rockPoly(rng, cx, cy, r * 1.25, r * 0.95, 11), Object.assign({ cx, r, moss: 0.25 }, o));
    };
    const slab = (cx, w, th, ang, o = {}) => {
      const cy = o.cy !== undefined ? o.cy : gy(cx) - th * 0.5 - Math.abs(Math.sin(ang)) * w * 0.5 + 3;
      return push('slab', s2_slabPoly(cx, cy, w, th, ang), Object.assign({ cx, w, h: th, top: cy - th / 2, cy }, o));
    };
    const trilithon = (cx, legW, gap, legH, lintelH, o = {}) => {
      const fy = gy(cx);
      const off = gap / 2 + legW / 2;
      const legTop = Math.max(fy - legH, S2_MAXTOP + lintelH - 2);
      const a = pillar(null, cx - off, legW, legH, 'flat', { lean: 0, moss: 0.35, rune: o.runeL, topY: legTop });
      const b = pillar(null, cx + off, legW, legH, 'flat', { lean: 0, moss: 0.35, rune: o.runeR, topY: legTop });
      const lw = gap + legW * 2 + 10;
      const lTop = legTop + 2 - lintelH;
      const l = push('lintel', s2_lintelPoly(rng, cx, lw, lTop, lintelH), { cx, w: lw, h: lintelH, top: lTop, moss: 0.3, rune: o.runeT });
      const gate = { cx, legW, gap, legH, floorY: fy, openL: cx - gap / 2, openR: cx + gap / 2, top: lTop, bottom: legTop + 2, legTop, legs: [a, b], lintel: l };
      lay.gates.push(gate);
      return gate;
    };
    const dolmen = (cx, span, legH, capW, capT, o = {}) => {
      const fy = gy(cx);
      const a = pillar(null, cx - span / 2, 13, legH, 'flat', { lean: 0, moss: 0.4, topY: fy - legH });
      const b = pillar(null, cx + span / 2, 13, legH, 'flat', { lean: 0, moss: 0.4, topY: fy - legH });
      const ang = o.ang || 0.05;
      const cap = slab(cx, capW, capT, ang, { moss: 0.5, rune: o.rune, cy: fy - legH - capT / 2 + 2 });
      lay.dolmens.push({ cx, span, legH, top: fy - legH - capT, floorY: fy });
      return cap;
    };

    /** stepped altar: a buried plinth block and two slabs on top (rune on the middle tier) */
    const altar = (cx, o = {}) => {
      pillar(null, cx, 58, 10, 'flat', { lean: 0, moss: 0.3 });
      let yb = gy(cx) - 9;
      [[44, 9], [30, 8]].forEach(([w, th], i) => {
        const cy = yb - th / 2;
        push('slab', s2_slabPoly(cx, cy, w, th, 0), { cx, w, h: th, top: cy - th / 2, cy, moss: 0.3, rune: i === 0 ? o.rune : null });
        yb -= th - 1;
      });
    };

    /** stone leg hanging from the ceiling ending at y = bottom */
    const pendant = (cx, w, bottom, style, o = {}) => {
      const lean = o.lean !== undefined ? o.lean : Math.round((rng() - 0.5) * 3);
      return push('pillar', s2_pendantPoly(rng, cx, w, bottom, style, lean), Object.assign({ cx, w, h: bottom, top: 0, hang: true, moss: 0.1 }, o));
    };
    /** inverted trilithon: two legs hang from the architrave, a lintel joins their ends; fly UNDER it */
    const hangGate = (cx, legW, gap, lintelH, bottom, o = {}) => {
      const off = gap / 2 + legW / 2;
      const a = pendant(cx - off, legW, bottom, 'flat', { lean: 0, rune: o.runeL && Object.assign({ y: 46 }, o.runeL) });
      const b = pendant(cx + off, legW, bottom, 'flat', { lean: 0, rune: o.runeR && Object.assign({ y: 46 }, o.runeR) });
      const lw = gap + legW * 2 + 10;
      const lTop = bottom - lintelH;
      const l = push('lintel', s2_lintelPoly(rng, cx, lw, lTop, lintelH), { cx, w: lw, h: lintelH, top: lTop, moss: 0.15, hang: true, rune: o.runeT });
      lay.hgates.push({ cx, legW, gap, bottom, lTop, openL: cx - gap / 2, openR: cx + gap / 2, lintel: l, legs: [a, b] });
    };

    /* ---- S0: moonrise plateau: a low dolmen and the first two menhirs ---- */
    dolmen(410, 44, 28, 78, 12, { rune: { g: 5 } });
    boulder(150, 5); boulder(226, 7); boulder(330, 6); boulder(474, 4);
    pillar('p0', 525, 18, 46, 'slantL', { moss: 0.6 });
    pillar('p1', 590, 20, 66, 'notch', { rune: { g: 0 } });

    /* ---- S1: the outer ring of menhirs (a skyline to fly over) ---- */
    pillar('p2', 660, 20, 50, 'chip');
    pillar('p3', 736, 24, 90, 'slantR', { rune: { g: 4 }, moss: 0.7 });
    slab(806, 48, 13, -0.11);
    pillar('p4', 1062, 26, 106, 'peak', { rune: { g: 2 } });
    pillar('p5', 1128, 20, 44, 'flat');
    trilithon(1226, 24, 64, 82, 20, { runeT: { g: 3 }, runeL: { g: 7 } });   // standing gate: fly over it

    /* ---- S2: hanging gates under an architrave (fly through them) ---- */
    hangGate(1470, 24, 62, 20, 92, { runeT: { g: 3 }, runeL: { g: 1 } });
    hangGate(1698, 26, 58, 20, 92, { runeT: { g: 0 }, runeR: { g: 5 } });
    hangGate(1926, 24, 62, 20, 92, { runeT: { g: 6 }, runeL: { g: 2 } });
    pendant(1584, 18, 66, 'chip'); pendant(1812, 18, 62, 'notch');
    pillar('p10', 1614, 20, 44, 'flat'); pillar('p10b', 1848, 20, 48, 'chip'); pillar('p10c', 1998, 18, 40, 'flat');

    /* ---- S3: swarm rush field (kept open) ---- */
    boulder(2120, 6); slab(2330, 40, 12, 0.08); boulder(2508, 5); pillar('p11', 2640, 20, 40, 'chip');

    /* ---- S4: hanging arcade, low menhirs in the bays ---- */
    const bays = [3015, 3125, 3235];
    const bh = [58, 64, 54];
    bays.forEach((bx, i) => pillar('a' + i, bx, 22, bh[i], ['flat', 'notch', 'chip'][i], { rune: i % 2 ? null : { g: (i + 2) % 8 } }));

    /* ---- S5: dolmen field ---- */
    dolmen(3480, 54, 34, 88, 13, { rune: { g: 2 }, ang: -0.04 });
    altar(3575, { rune: { g: 4 } });
    dolmen(3655, 46, 30, 76, 12, { ang: 0.05 });

    // runes carved into the face of the plateau along the boss arena (a ritual ring)
    for (let x = 3702, i = 0; x < LEN - 90; x += 29, i++) lay.floorRunes.push({ x, y: 200, g: (i * 3 + 1) % 8 });

    // scatter of pebbles along the plateau for texture
    const pr = makeRng(77);
    for (let x = 40; x < LEN - 60; x += 26 + pr() * 40) {
      if (x > 2000 && x < 2700 && pr() < 0.6) continue;
      if (x > BOSS_X - 30) break;
      if ((x > GATE_X0 - 15 && x < GATE_X1 + 15) || (x > ARC_P0 - 70 && x < ARC_P0 + (ARC_N - 1) * ARC_SP + 30)) continue; // keep ceiling corridors clean
      const near = stones.some((s) => s.t !== 'rock' && x > s.x0 - 8 && x < s.x1 + 8);
      if (near) continue;
      boulder(Math.round(x), 2 + pr() * 2.2, { moss: 0.1 });
    }
    S2_LAY = lay;
    return lay;
  }

  /* ---------------- painting the megaliths ---------------- */
  const S2_STONE = ['#0d1322', '#1b2540', '#2c3a5c', '#3f5178', '#57698f', '#7388ad', '#9db4d4', '#c4d8ee'].map(s2_c32);
  const S2_MOSS = ['#0f2a2c', '#1b4a40', '#2c6a4c', '#4a8e5c', '#7ab86c'].map(s2_c32);
  const S2_RUNE = { halo: s2_c32('#0f5a66'), mid: s2_c32('#2fbfb6'), core: s2_c32('#8afbe8') };

  function s2_paintStones(P, T, lay) {
    const solidAt = (x, y) => x < 0 || y < 0 || x >= LEN || y >= H || T.mask[x * H + y] === 1;
    const inRim = (x, y) => {
      for (let d = 1; d <= 2; d++) if (!solidAt(x - d, y) || !solidAt(x + d, y) || !solidAt(x, y - d) || !solidAt(x, y + d)) return true;
      return false;
    };
    const gyAt = (x) => H - Math.round(T.floorH[x]);
    const tone2col = (tone, x, y) => S2_STONE[Math.max(0, Math.min(7, Math.floor(tone + s2_bayer(x, y))))];

    for (const st of lay.stones) {
      const seed = st.seed;
      const isLintel = st.t === 'lintel' || st.t === 'slab';
      const rowsN = st.sc.rows.length;
      // crack seeds (dark hairlines)
      const cracks = new Set();
      const nC = st.t === 'rock' ? 0 : 1 + ((st.h || 20) / 42) | 0;
      const cr = makeRng(seed * 7 + 3);
      for (let k = 0; k < nC; k++) {
        const r0 = st.sc.rows[(cr() * rowsN * 0.6) | 0];
        if (!r0 || !r0.length) continue;
        let x = r0[0][0] + 3 + ((r0[0][1] - r0[0][0] - 6) * cr()) | 0, y = st.y0 + ((cr() * rowsN * 0.6) | 0);
        const len = 8 + ((cr() * 22) | 0);
        for (let i = 0; i < len; i++) {
          cracks.add(x + y * LEN);
          const q = cr();
          if (isLintel) { x += cr() < 0.7 ? 1 : 0; y += q < 0.3 ? 1 : q < 0.5 ? -1 : 0; } else { y += 1; x += q < 0.3 ? 1 : q < 0.6 ? -1 : 0; }
        }
      }
      for (let k = 0; k < rowsN; k++) {
        const y = st.y0 + k;
        if (y < 0 || y >= H) continue;
        for (const [xa, xb] of st.sc.rows[k]) {
          const wSpan = xb - xa;
          for (let x = xa; x < xb; x++) {
            if (x < 0 || x >= LEN) continue;
            const gy = gyAt(x);
            if (y >= gy) continue; // below the ground line: bedrock keeps its own skin
            if (!T.mask[x * H + y]) continue;
            if (inRim(x, y)) continue; // engine outline / highlight
            const u = (x - xa + 0.5) / wSpan;
            const yt = y - st.y0;
            let tone;
            if (st.t === 'rock') {
              const cx = (xa + xb) / 2, ry = (rowsN) / 2;
              const dxn = (x - cx) / (wSpan / 2 + 1), dyn = (yt - ry) / (ry + 1);
              tone = 4.3 - 1.9 * (dxn * 0.7 + dyn * 0.8) + (s2_hash(x, y, seed) - 0.5) * 0.9;
            } else if (isLintel) {
              const v = yt / Math.max(1, rowsN - 1);
              tone = v < 0.22 ? 5.0 : v < 0.7 ? 3.7 : 2.4;
              tone += (s2_vnoise(x * 0.11, y * 0.7, seed) - 0.5) * 1.9 - u * 0.5 + 0.25;
            } else {
              const f1 = 0.3 + 0.07 * Math.sin(y * 0.045 + seed), f2 = 0.66 + 0.06 * Math.sin(y * 0.031 + seed * 2);
              tone = u < f1 ? 4.7 - u * 1.2 : u < f2 ? 3.4 - (u - f1) * 0.9 : 2.1 - (u - f2) * 0.8;
              tone += (s2_vnoise(x * 0.6, y * 0.065, seed) - 0.5) * 1.7;
              if (yt < 7) tone += 0.55 - yt * 0.07;
              const db = gy - y;
              if (db < 12) tone -= (12 - db) * 0.06;
            }
            tone += (s2_hash(x, y, seed + 9) - 0.5) * 0.35;
            let col = tone2col(tone, x, y);
            // moss creeping up from the base and along ledges
            if (st.moss > 0 && st.t !== 'rock') {
              const w = Math.max(0, 1 - (gy - y) / (10 + 30 * st.moss));
              const m = s2_vnoise(x * 0.33, y * 0.3, seed + 5) * 0.62 + w * 0.5 + (yt < 3 && u > 0.2 ? 0.14 : 0) * st.moss;
              if (m > 0.82) {
                const mi = Math.max(0, Math.min(4, Math.floor(tone - 1.6 + s2_bayer(x, y))));
                col = S2_MOSS[mi];
              }
            }
            if (cracks.has(x + y * LEN)) col = S2_STONE[0];
            else if (cracks.has(x - 1 + (y - 1) * LEN)) col = S2_STONE[Math.min(7, Math.floor(tone + 1.3))];
            P[y * LEN + x] = col;
          }
        }
      }
      // contact shadow where the stone meets the ground
      if (st.t === 'pillar' || st.t === 'rock') {
        for (let k = 0; k < rowsN; k++) {
          const y = st.y0 + k;
          if (y < 0 || y >= H) continue;
          for (const [xa, xb] of st.sc.rows[k]) {
            for (let x = Math.max(0, xa); x < Math.min(LEN, xb); x++) {
              const gy = gyAt(x);
              if (y >= gy - 2 && y <= gy + 1 && T.mask[x * H + y]) {
                if (y < gy) P[y * LEN + x] = S2_STONE[y === gy - 1 ? 0 : 1];
              }
            }
          }
        }
      }
    }
  }

  /** glowing rune glyph stamped onto a stone face */
  function s2_stampRune(P, T, cx, cy, gi) {
    const gl = S2_GLYPHS[gi % S2_GLYPHS.length];
    const solidAt = (x, y) => x >= 0 && y >= 0 && x < LEN && y < H && T.mask[x * H + y] === 1;
    const halo = [];
    for (let j = 0; j < 7; j++)
      for (let i = 0; i < 5; i++) {
        if (gl[j][i] !== '#') continue;
        const x = cx - 2 + i, y = cy - 3 + j;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) halo.push([x + dx, y + dy]);
      }
    for (const [x, y] of halo) if (solidAt(x, y)) P[y * LEN + x] = s2_mix32(P[y * LEN + x], S2_RUNE.halo, 0.6);
    for (let j = 0; j < 7; j++)
      for (let i = 0; i < 5; i++) {
        if (gl[j][i] !== '#') continue;
        const x = cx - 2 + i, y = cy - 3 + j;
        if (solidAt(x, y)) P[y * LEN + x] = (i + j) % 3 === 0 ? S2_RUNE.core : S2_RUNE.mid;
      }
  }

  /** bedrock: depth shading, moss on the surface, cracks */
  function s2_paintGround(P, T) {
    const deep = s2_c32('#0b1020');
    const mossC = S2_MOSS;
    for (let x = 0; x < LEN; x++) {
      const gy = H - Math.round(T.floorH[x]);
      for (let y = gy; y < H; y++) {
        const d = y - gy;
        const i = y * LEN + x;
        if (d > 3) {
          const t = Math.min(0.72, (d - 3) / 46);
          if (s2_bayer(x, y) < t) P[i] = s2_mix32(P[i], deep, 0.7);
        } else if (d >= 2 && d <= 4) {
          const m = s2_vnoise(x * 0.16, d * 0.9, 31);
          if (m > 0.66 && T.mask[x * H + y]) P[i] = mossC[d === 2 ? 3 : 2];
        }
      }
    }
  }

  /** moss curtains and a few hanging roots under the architrave and the arches (harmless dressing) */
  function s2_paintVines(P, T) {
    const cols = [s2_c32('#16382f'), s2_c32('#24594a'), s2_c32('#3c8058'), s2_c32('#63a86a')];
    for (let x = GATE_X0; x < ARC_P0 + (ARC_N - 1) * ARC_SP + ARC_PW; x++) {
      if (x > GATE_X1 + 4 && x < ARC_P0 - 60) continue;
      const cb = T.ceilBottom(x);
      if (cb <= 0 || cb > 62) continue;
      const h = s2_hash(x, 7, 88);
      if (h > 0.16) continue;
      const len = 2 + Math.floor(s2_hash(x, 9, 88) * 6);
      for (let k = 0; k < len; k++) {
        const y = cb + k;
        if (y >= H || T.mask[x * H + y]) break;
        P[y * LEN + x] = cols[Math.min(3, (k * 4 / len) | 0)];
        if (k === len - 1 && x + 1 < LEN && !T.mask[(x + 1) * H + y]) P[y * LEN + x + 1] = cols[3];
      }
    }
  }

  function s2_decorateTerrain(g, T) {
    const lay = s2_layout();
    const img = g.getImageData(0, 0, LEN, H);
    const P = new Uint32Array(img.data.buffer);
    s2_paintGround(P, T);
    s2_paintStones(P, T, lay);
    s2_paintVines(P, T);
    for (const st of lay.stones) {
      if (!st.rune) continue;
      let rx, ry;
      if (st.t === 'pillar') { rx = Math.round(st.cx + (st.rune.dx || 0)); ry = Math.round(st.top + Math.min(st.h * 0.42, 40)); }
      else if (st.t === 'lintel') { rx = Math.round(st.cx + (st.rune.dx || 0)); ry = Math.round(st.top + st.h * 0.55); }
      else { rx = Math.round(st.cx); ry = Math.round(st.cy !== undefined ? st.cy : (st.y0 + st.y1) / 2); }
      if (st.rune.y !== undefined) ry = st.rune.y;
      st.rune.px = rx; st.rune.py = ry;
      s2_stampRune(P, T, rx, ry, st.rune.g);
    }
    for (const r of lay.floorRunes) s2_stampRune(P, T, r.x, r.y, r.g);
    g.putImageData(img, 0, 0);
  }

  function s2_terrain() {
    const lay = s2_layout();
    return {
      length: LEN,
      floor: S2_FLOOR,
      ceil: S2_CEIL,
      shapes(g) {
        g.fillStyle = '#fff';
        for (const st of lay.stones) {
          for (let k = 0; k < st.sc.rows.length; k++) {
            const y = st.y0 + k;
            if (y < 0 || y >= H) continue;
            for (const [xa, xb] of st.sc.rows[k]) g.fillRect(xa, y, xb - xa, 1);
          }
        }
      },
      decorate: s2_decorateTerrain,
      skin: {
        kind: 'brick',
        bw: 30, bh: 15,
        pal: ['#1b2338', '#2a3554', '#3b4a6c', '#4f6286', '#6a7fa4'],
        mortar: '#141b2e',
        outline: '#080c18', hi: '#b7cbe6', hi2: '#8ea6c8', lo: '#101729',
        seed: 9,
      },
    };
  }

  /* ===============================================================
   * BACKGROUND — night sky, a huge cratered moon, wispy clouds,
   * ridges of distant standing stones, low teal mist.
   * =============================================================== */
  const MOON_X = 112, MOON_Y = 84, MOON_R = 33, MOON_G = 22, MOON_SPEED = 0.02;

  function s2_bakeMoon() {
    const R = MOON_R, G_ = MOON_G, S = (R + G_) * 2 + 1;
    const c = Sprites.makeCanvas(S, S);
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const P = new Uint32Array(img.data.buffer);
    const C = R + G_;
    const col = (s) => s2_c32(s);
    const cLight = col('#f1f4fa'), cMid = col('#d6deec'), cShade = col('#b4c2da'), cMaria = col('#c3cee4'), cMaria2 = col('#aebbd6');
    const cCr = col('#a5b4d0'), cCrD = col('#7d8dae'), cCrL = col('#fbfdff'), cLimb = col('#9eaecb');
    const craters = [
      [-11, -13, 7.5], [9, -18, 4.5], [15, 1, 9], [-18, 5, 5.5], [-3, 15, 6.5], [9, 21, 3.5], [-22, -6, 3.5],
      [20, -11, 3], [-6, -1, 3], [23, 15, 3.5], [-13, 21, 3], [2, -4, 2.2], [-1, -24, 3],
    ];
    const glowC = col('#a9c8ff');
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = x - C, dy = y - C, d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) {
          // dithered halo
          const lvl = 1 - (d - R) / G_;
          if (lvl > 0) {
            const t = lvl * lvl;
            if (t * 0.9 > s2_bayer(x, y) * 0.55 + 0.02) P[y * S + x] = (s2_mix32(glowC, glowC, 0) & 0x00ffffff) | (Math.round(70 + 90 * t) << 24);
          }
          continue;
        }
        // body shading: light from the upper left, dithered
        let t = (dx * 0.55 + dy * 0.83) / R * 0.5 + 0.5; // 0 lit .. 1 shade
        const mar = s2_vnoise(dx / 8 + 5, dy / 8 + 9, 3) * 0.65 + s2_vnoise(dx / 3.3, dy / 3.3, 4) * 0.35;
        let base;
        const tone = t * 1.1 + (mar > 0.6 ? 0.55 : 0) + (d / R > 0.9 ? 0.6 : 0);
        if (tone < 0.55) base = cLight;
        else if (tone < 0.95) base = s2_bayer(x, y) < (tone - 0.55) / 0.4 ? cMid : cLight;
        else if (tone < 1.35) base = s2_bayer(x, y) < (tone - 0.95) / 0.4 ? cShade : cMid;
        else base = s2_bayer(x, y) < Math.min(1, (tone - 1.35) / 0.5) ? cMaria2 : cShade;
        if (mar > 0.66 && tone < 1.35) base = s2_bayer(x, y) < 0.6 ? cMaria : base;
        if (d / R > 0.955) base = cLimb;
        // craters
        for (const [cxr, cyr, r] of craters) {
          const ex = dx - cxr, ey = dy - cyr, dc = Math.sqrt(ex * ex + ey * ey);
          if (dc < r + 0.6 && dc >= r - 0.4 && ex * 0.6 + ey * 0.8 > 0) base = cCrL; // lit far wall rim (lower right)
          if (dc < r) {
            const lit = ex * 0.6 + ey * 0.8; // <0: upper-left inner wall (in shadow)
            if (dc > r - 1.5 && lit < 0) base = cCrD;
            else if (dc > r - 1.5 && lit > 0) base = cCrL;
            else base = dc < r * 0.55 && lit > -1 ? cCr : s2_bayer(x, y) < 0.5 ? cCr : cMaria2;
          }
        }
        P[y * S + x] = base;
      }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** periodic value noise (period P px) for wrap-around strips */
  function s2_pnoise(x, P, cell, seed) {
    const n = Math.max(1, Math.round(P / cell));
    const f = (x / P) * n;
    const i = Math.floor(f);
    const t = s2_smooth(f - i);
    return s2_hash(((i % n) + n) % n, 0, seed) * (1 - t) + s2_hash((((i + 1) % n) + n) % n, 0, seed) * t;
  }

  /** ridge of low hills with standing stones on it (silhouettes, moon-lit on the left / top edges) */
  function s2_bakeStoneRidge(Pw, o) {
    const c = Sprites.makeCanvas(Pw, H);
    const g = c.getContext('2d');
    const img = g.createImageData(Pw, H);
    const P = new Uint32Array(img.data.buffer);
    const cTop = s2_c32(o.top), cBase = s2_c32(o.base), cRim = s2_c32(o.rim), cSt = s2_c32(o.stone), cStD = s2_c32(o.stoneDark), cStRim = s2_c32(o.stoneRim);
    const hgt = new Int16Array(Pw);
    for (let x = 0; x < Pw; x++) {
      const v = s2_pnoise(x, Pw, o.scale || 90, o.seed) * 0.68 + s2_pnoise(x, Pw, (o.scale || 90) / 2.7, o.seed + 1) * 0.32;
      hgt[x] = Math.round(o.hMin + (o.hMax - o.hMin) * v);
    }
    const put = (x, y, cc) => {
      x = ((x % Pw) + Pw) % Pw;
      if (y >= 0 && y < H) P[y * Pw + x] = cc;
    };
    for (let x = 0; x < Pw; x++) {
      for (let k = 0; k < hgt[x]; k++) {
        const y = H - 1 - k;
        const t = k / hgt[x];
        put(x, y, s2_bayer(x, y) < t * 0.9 ? cTop : cBase);
      }
      put(x, H - hgt[x], cRim);
    }
    // stones: {x, w, h, kind}
    const solid = new Uint8Array(Pw * H);
    const fillPoly = (pts, dark) => {
      const sc = s2_scan(pts);
      sc.rows.forEach((sp, k) => {
        const y = sc.y0 + k;
        for (const [xa, xb] of sp)
          for (let x = xa; x < xb; x++) {
            const X = ((x % Pw) + Pw) % Pw;
            if (y >= 0 && y < H) {
              solid[y * Pw + X] = 1;
              P[y * Pw + X] = dark ? cStD : cSt;
            }
          }
      });
    };
    const groundY = (x) => H - hgt[((Math.round(x) % Pw) + Pw) % Pw] + 3;
    const pilTop = (x, w, top, tilt = 0) => {
      const base = groundY(x);
      fillPoly([[x - w / 2 - 1, base], [x - w / 2 + tilt, top + 2], [x - w / 2 + tilt + 2, top], [x + w / 2 + tilt - 1, top + 1], [x + w / 2 + tilt, top + 3], [x + w / 2 + 1, base]], false);
    };
    const pil = (x, w, h, tilt = 0) => pilTop(x, w, groundY(x) - h, tilt);
    const tri = (x, w, h, gap) => {
      const off = gap / 2 + w / 2;
      const top = Math.min(groundY(x - off), groundY(x + off)) - h;
      pilTop(x - off, w, top);
      pilTop(x + off, w, top);
      fillPoly([[x - off - w / 2 - 2, top + 2], [x + off + w / 2 + 2, top + 2], [x + off + w / 2 + 2, top - 4], [x - off - w / 2 - 2, top - 4]], false);
    };
    for (const s of o.stones) {
      if (s.k === 'tri') tri(s.x, s.w, s.h, s.gap);
      else pil(s.x, s.w, s.h, s.tilt || 0);
    }
    // moon-lit rim: left and top edges of the silhouettes
    for (let y = 1; y < H; y++)
      for (let x = 0; x < Pw; x++) {
        if (!solid[y * Pw + x]) continue;
        const l = solid[y * Pw + ((x + Pw - 1) % Pw)], u = solid[(y - 1) * Pw + x];
        if (!u || !l) P[y * Pw + x] = cStRim;
      }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** wispy moon-lit cloud bands */
  function s2_bakeClouds(Pw, o) {
    const c = Sprites.makeCanvas(Pw, H);
    const g = c.getContext('2d');
    const img = g.createImageData(Pw, H);
    const P = new Uint32Array(img.data.buffer);
    const rng = makeRng(o.seed);
    const cRim = s2_c32(o.rim), cBody = s2_c32(o.body), cLow = s2_c32(o.low);
    const mask = new Uint8Array(Pw * H);
    for (let k = 0; k < o.n; k++) {
      const cx = (k + rng() * 0.8) * (Pw / o.n);
      const cy = o.y0 + rng() * (o.y1 - o.y0);
      const len = o.wMin + rng() * (o.wMax - o.wMin);
      const th = o.tMin + rng() * (o.tMax - o.tMin);
      const blobs = 5 + ((rng() * 4) | 0);
      for (let b = 0; b < blobs; b++) {
        const bx = cx + ((b + rng() * 0.6) / blobs - 0.5) * len;
        const by = cy + (rng() - 0.5) * th * 0.5;
        const rx = len / blobs * (0.9 + rng() * 0.9), ry = th * (0.4 + rng() * 0.5);
        for (let y = Math.floor(by - ry); y <= by + ry; y++)
          for (let x = Math.floor(bx - rx); x <= bx + rx; x++) {
            const a = (x - bx) / rx, bb = (y - by) / ry;
            if (a * a + bb * bb <= 1 && y >= 0 && y < H) mask[y * Pw + (((x % Pw) + Pw) % Pw)] = 1;
          }
      }
    }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < Pw; x++) {
        if (!mask[y * Pw + x]) continue;
        const up = y > 0 ? mask[(y - 1) * Pw + x] : 0;
        const up2 = y > 1 ? mask[(y - 2) * Pw + x] : 0;
        const dn = y < H - 1 ? mask[(y + 1) * Pw + x] : 0;
        let col = cBody;
        if (!up) col = cRim;
        else if (!up2) col = s2_bayer(x, y) < 0.5 ? cRim : cBody;
        else if (!dn) col = cLow;
        else if (s2_bayer(x, y) < 0.22 + 0.5 * (s2_hash(x >> 3, y >> 1, o.seed) - 0.5)) col = cLow;
        P[y * Pw + x] = col;
      }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** low teal mist band (dithered, tiles horizontally) */
  function s2_bakeMist(Pw, y0, y1, colCss, amax, seed) {
    const c = Sprites.makeCanvas(Pw, H);
    const g = c.getContext('2d');
    const img = g.createImageData(Pw, H);
    const P = new Uint32Array(img.data.buffer);
    const cc = s2_c32(colCss) & 0x00ffffff;
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / (y1 - y0);
      const prof = Math.sin(t * Math.PI);
      for (let x = 0; x < Pw; x++) {
        const n = s2_pnoise(x, Pw, 48, seed) * 0.7 + s2_pnoise(x + 17, Pw, 17, seed + 3) * 0.3;
        const a = prof * (0.35 + 0.8 * n);
        if (a * 1.2 > s2_bayer(x, y) + 0.15) P[y * Pw + x] = cc | (Math.round(255 * amax) << 24);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** an occasional shooting star (deterministic, driven by the frame counter) */
  function s2_shootingStars(ctx, camX, t) {
    for (let k = 0; k < 3; k++) {
      const cyc = 760 + k * 277;
      const ph = (t + k * 431) % cyc;
      if (ph > 26) continue;
      const u = ph / 26;
      const x0 = 150 + ((k * 97 + Math.floor((t + k * 431) / cyc) * 53) % 90), y0 = 12 + ((k * 31 + Math.floor((t + k * 431) / cyc) * 19) % 40);
      const x = x0 - u * 70, y = y0 + u * 30;
      for (let i = 0; i < 9; i++) {
        const a = 1 - i / 9;
        ctx.globalAlpha = a * (1 - u * 0.4);
        ctx.fillStyle = i < 2 ? '#ffffff' : i < 5 ? '#cfe4ff' : '#7fa6dc';
        ctx.fillRect(Math.round(x + i * 2.3), Math.round(y - i * 0.98), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  function s2_background() {
    const moon = s2_bakeMoon();
    const half = (moon.width - 1) / 2;
    const farStones = [
      { x: 96, k: 'tri', w: 6, h: 30, gap: 24 },
      { x: 30, w: 6, h: 22, tilt: 1 }, { x: 160, w: 7, h: 26 }, { x: 205, w: 5, h: 18, tilt: -1 },
      { x: 250, w: 7, h: 32 }, { x: 300, k: 'tri', w: 6, h: 26, gap: 20 }, { x: 352, w: 6, h: 20 },
      { x: 392, w: 8, h: 34, tilt: 1 }, { x: 430, w: 5, h: 16 }, { x: 474, k: 'tri', w: 7, h: 32, gap: 26 },
      { x: 536, w: 6, h: 24 }, { x: 572, w: 7, h: 30, tilt: -1 }, { x: 606, w: 5, h: 18 }, { x: 640, k: 'tri', w: 7, h: 36, gap: 28 },
      { x: 700, w: 6, h: 22 }, { x: 736, w: 7, h: 27 },
    ];
    const nearStones = [
      { x: 60, w: 11, h: 44, tilt: 2 }, { x: 150, k: 'tri', w: 10, h: 40, gap: 34 }, { x: 262, w: 12, h: 52 }, { x: 330, w: 9, h: 34, tilt: -2 },
      { x: 420, w: 11, h: 46 }, { x: 500, k: 'tri', w: 10, h: 44, gap: 30 }, { x: 590, w: 9, h: 30 },
    ];
    return Backgrounds.make([
      { kind: 'gradient', stops: [[0, '#03051a'], [0.32, '#0a1238'], [0.58, '#0f2a52'], [0.78, '#14607a'], [0.9, '#2aa4a0'], [1, '#1e7c84']], steps: 22 },
      { kind: 'stars', n: 70, speed: 0.012, drift: 0.004, ymax: 150, seed: 12 },
      { kind: 'stars', n: 12, speed: 0.02, drift: 0.006, ymax: 120, seed: 31, big: 1, colors: ['#ffffff', '#cfe4ff', '#ffe9b0'] },
      { kind: 'custom', draw(ctx, camX, t) { s2_shootingStars(ctx, camX, t); ctx.drawImage(moon, Math.round(MOON_X - camX * MOON_SPEED - half), Math.round(MOON_Y - half)); } },
      { kind: 'strip', build: (P) => s2_bakeClouds(P, { seed: 5, n: 4, y0: 14, y1: 44, wMin: 80, wMax: 170, tMin: 4, tMax: 8, rim: '#5f82be', body: '#1c2d60', low: '#121e4a' }), period: 640, speed: 0.045 },
      { kind: 'strip', build: (P) => s2_bakeStoneRidge(P, { seed: 7, scale: 110, hMin: 56, hMax: 96, top: '#0f3552', base: '#0a2540', rim: '#3fa0b4', stone: '#0a2238', stoneDark: '#081c30', stoneRim: '#3c94ac', stones: farStones }), period: 768, speed: 0.08 },
      { kind: 'strip', build: (P) => s2_bakeMist(P, 128, 196, '#54d2c4', 0.34, 21), period: 512, speed: 0.13 },
      { kind: 'strip', build: (P) => s2_bakeClouds(P, { seed: 11, n: 3, y0: 108, y1: 138, wMin: 70, wMax: 150, tMin: 3, tMax: 6, rim: '#6fa6c8', body: '#24507a', low: '#173a62' }), period: 512, speed: 0.11 },
      { kind: 'strip', build: (P) => s2_bakeStoneRidge(P, { seed: 13, scale: 80, hMin: 46, hMax: 72, top: '#0a2438', base: '#08192b', rim: '#2a7890', stone: '#071a2c', stoneDark: '#061525', stoneRim: '#2e86a0', stones: nearStones }), period: 640, speed: 0.22 },
    ]);
  }

  /* ===============================================================
   * ENEMIES
   *   s2_swarm     tiny 1-HP drones flying scripted formations
   *   s2_sentinel  floating stone eye, slow 3-way spread when aligned
   *   s2_orbiter   rune seal with orbs circling it (stone-anchored)
   *   s2_queen     mid-boss "Hive Queen" (multi-part)
   *   s2_rune      ambient pulsing glyph (harmless, decorative)
   * =============================================================== */
  const s2_dt = () => 1 + (G.bulletMul() - 1) * 0.5; // mild difficulty scaling for drone speed

  /* ---- swarm formation library: path(e, tt) -> [x, y] in screen space ---- */
  const S2_PATHS = {
    // one sine strand
    sine: (e, tt) => [e.sx - e.dist(tt), e.sy + e.amp * Math.sin(e.w * tt + e.ph)],
    // strands crossing each other (DNA braid)
    braid: (e, tt) => [e.sx - e.dist(tt), e.sy + e.amp * Math.sin(e.w * tt + e.ph + (TAU * (e.i % e.strands)) / e.strands)],
    // fishnet: rows x columns, rows ripple in step
    lattice: (e, tt) => {
      const r = e.i % e.rows;
      return [e.sx - e.dist(tt), e.sy + (r - (e.rows - 1) / 2) * e.rowGap + e.amp * Math.sin(e.w * tt + e.ph + r * e.skew)];
    },
    // chain of loop-the-loops (prolate cycloid)
    loop: (e, tt) => {
      const a = e.w * tt + e.ph + (TAU * (e.i % e.strands)) / e.strands;
      const a0 = e.ph + (TAU * (e.i % e.strands)) / e.strands;
      return [e.sx - e.dist(tt) + e.amp * (Math.cos(a) - Math.cos(a0)), e.sy + e.dir * e.amp * (Math.sin(a) - Math.sin(a0))];
    },
    // U-shaped dive from the top (or bottom) edge of the screen
    swoop: (e, tt) => [e.sx - e.dist(tt), e.y0 + (e.y1 - e.y0) * (1 - Math.cos(e.w * tt)) * 0.5],
    // rain: straight down, bursts on the ground
    column: (e, tt) => [e.sx, e.y0 + e.dist(tt)],
    // glide to another lane (crossing formations)
    converge: (e, tt) => [e.sx - e.dist(tt), e.sy + (e.ty - e.sy) * s2_smooth(Math.min(1, tt / e.T))],
    // sharp zig-zag
    zig: (e, tt) => {
      const u = (e.w * tt + e.ph) / TAU, f = u - Math.floor(u);
      return [e.sx - e.dist(tt), e.sy + e.amp * (f < 0.5 ? f * 4 - 1 : 3 - f * 4)];
    },
    // rotating ring that drifts left ("wheel"); radius blooms over `grow` frames
    wheel: (e, tt) => {
      const a = (TAU * e.i) / e.n + e.spin * tt;
      const R = e.amp * Math.min(1, (tt + 1) / e.grow) * (1 + 0.1 * Math.sin(tt * 0.07));
      return [e.sx - e.dist(tt) + R * Math.cos(a), e.sy + R * Math.sin(a)];
    },
  };

  // long streams die in a burst: throttle the pop sound so it stays crisp instead of turning into noise
  let s2_lastPop = -99;
  // stream bonus: shoot down every member of a formation and it pays out
  const S2_GROUPS = new Map();
  function s2_popup(x, y, text) {
    G.fx.push({
      k: 'fn', x, y, t: 0, life: 56,
      draw(c, f) {
        const yy = Math.round(f.y - f.t * 0.35);
        PixFont.text(c, text, clamp(Math.round(f.x), 16, W - 16), clamp(yy, 12, H - 24), { font: '3x5', color: (f.t >> 2) & 1 ? '#ffffff' : '#ffe646', align: 'center', shadow: '#000' });
      },
    });
  }
  ENEMIES.s2_swarm = {
    w: 8, h: 7, hp: 1, score: 60, expl: 's', silentDeath: true,
    onDeath(e) {
      const loud = G.frame - s2_lastPop >= 3;
      if (loud) s2_lastPop = G.frame;
      G.explode(e.x, e.y, 's', { quiet: !loud });
      const g = e.gk !== undefined && S2_GROUPS.get(e.gk);
      if (g && ++g.kills >= g.n && g.n >= 8) {
        S2_GROUPS.delete(e.gk);
        const bonus = Math.round((g.n * 50) / 100) * 100;
        G.addScore(bonus);
        s2_popup(e.x, e.y - 10, '+' + bonus);
        sfx('capsule');
      }
    },
    init(e, o) {
      e.pat = o.pat || 'sine';
      e.i = o.index || 0;
      e.n = o.count || 1;
      // stream bonus bookkeeping: `gid` names one formation (the first member resets its tally)
      e.gk = o.gid;
      if (e.gk !== undefined && (e.i === 0 || !S2_GROUPS.has(e.gk))) S2_GROUPS.set(e.gk, { n: e.n, kills: 0 });
      e.sx = e.x;
      e.sy = e.y;
      const spd = (o.speed || 1.6) * s2_dt();
      const acc = o.acc || 0;
      e.dist = (tt) => spd * tt + 0.5 * acc * tt * tt;
      e.amp = o.amp !== undefined ? o.amp : 26;
      e.w = TAU / (o.per || 100);
      e.ph = o.phase || 0;
      e.strands = o.strands || 2;
      e.rows = o.rows || 3;
      e.rowGap = o.rowGap || 22;
      e.skew = o.skew || 0;
      e.dir = o.dir || 1;
      e.ty = o.ty !== undefined ? o.ty : 112;
      e.T = o.T || 90;
      e.y0 = o.y0 !== undefined ? o.y0 : -14;
      e.y1 = o.y1 !== undefined ? o.y1 : 120;
      e.spin = (o.spin !== undefined ? o.spin : 0.05);
      e.grow = o.grow || 1;
      e.crash = o.crash !== undefined ? o.crash : e.pat === 'column';
      e.delay = o.delay || 0;
      if (e.pat === 'lattice') e.delay += Math.floor(e.i / e.rows) * (o.colGap || 9);
      if (e.pat === 'wheel') {
        const p = S2_PATHS.wheel(e, 0);
        e.x = p[0];
        e.y = p[1];
      }
    },
    update(e) {
      const tt = e.t - 1 - e.delay;
      if (tt < 0) {
        // waiting for its turn (delay): park off-screen
        e.vx = W + 40 - e.x;
        e.vy = -30 - e.y;
        return;
      }
      const p = S2_PATHS[e.pat](e, tt);
      e.vx = p[0] - e.x;
      e.vy = p[1] - e.y;
      if (e.crash && tt > 4 && G.terrain.solid(G.camX + p[0], p[1] + 3)) {
        e.dead = true;
        G.explode(p[0], p[1], 's', { quiet: true, scroll: true });
      }
    },
    /** where this drone will be `dt` frames from now (used by test bots / look-ahead) */
    predict(e, dt) {
      const tt = e.t - 1 - e.delay + dt;
      return tt < 0 ? [e.x, e.y] : S2_PATHS[e.pat](e, tt);
    },
    draw(e, c) {
      if (e.x > W + 12) return;
      // soft glow around the lantern (additive), then the sprite
      const gx = Math.round(e.x + 2), gy = Math.round(e.y + 1);
      const oc = c.globalCompositeOperation, oa = c.globalAlpha;
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.2;
      c.fillStyle = e.carry ? '#ff7a30' : '#d8ff60';
      c.fillRect(gx - 1, gy - 3, 3, 1);
      c.fillRect(gx - 2, gy - 2, 5, 5);
      c.fillRect(gx - 1, gy + 3, 3, 1);
      c.globalCompositeOperation = oc;
      c.globalAlpha = oa;
      Sprites.draw(c, e.carry ? 's2_swarm_c' : 's2_swarm', e.x, e.y, { frame: ((e.t + e.i * 2) / 3) | 0, flash: e.flash > 0 });
    },
  };

  /* ---- sentinel: stone eye that opens when you line up with it ---- */
  ENEMIES.s2_sentinel = {
    w: 17, h: 17, hp: 6, score: 400, expl: 'm',
    init(e, o) {
      e.yc = e.y;
      e.yMin = e.y - (o.reach !== undefined ? o.reach : 24);
      e.yMax = e.y + (o.reach !== undefined ? o.reach : 24);
      e.ph = rnd(TAU);
      e.bob = o.bob !== undefined ? o.bob : 3;
      e.st = 0;
      e.stT = 0;
      e.cd = 60 + rndi(0, 40);
      e.rate = o.rate || 150;
    },
    update(e) {
      const P = G.player;
      if (P.alive && e.x < W + 30 && e.x > 40 && P.x < e.x) e.yc = clamp(e.yc + clamp(P.y - e.yc, -0.3, 0.3), e.yMin, e.yMax);
      e.y = e.yc + Math.sin(e.t * 0.035 + e.ph) * e.bob;
      e.stT++;
      if (e.st === 0) {
        e.frame = 0;
        if (--e.cd <= 0 && G.canFire(e) && P.x < e.x - 22 && Math.abs(P.y - e.y) < 22) {
          e.st = 1;
          e.stT = 0;
          sfx('coreOpen');
        } else if (e.cd < 0) e.cd = 0;
      } else if (e.st === 1) {
        e.frame = e.stT < 12 ? 1 : 2;
        if (e.stT >= 34) {
          if (G.canFire(e)) G.fan(e.x - 9, e.y, 3, 0.62, 1.1, { spr: 'ebullet2', w: 5, h: 5 });
          e.st = 2;
          e.stT = 0;
        }
      } else {
        e.frame = e.stT < 22 ? 1 : 0;
        if (e.stT >= 30) {
          e.st = 0;
          e.cd = G.fireDelay(e.rate) + rndi(0, 30);
        }
      }
    },
    draw(e, c) {
      Sprites.draw(c, 's2_sentinel', e.x, e.y, { frame: e.frame, flash: e.flash > 0 });
    },
  };

  /* ---- orbiter: rune seal with orbs circling it ---- */
  function s2_orbPlace(e) {
    const live = e.parts.filter((p) => !p.dead).length;
    const R = e.R * (1 + 0.08 * Math.sin(e.t * 0.05));
    e.parts.forEach((p, i) => {
      const a = e.a + (TAU * i) / e.parts.length;
      p.ox = Math.cos(a) * R;
      p.oy = Math.sin(a) * R;
      p.ang = a;
    });
    return live;
  }
  ENEMIES.s2_orbiter = {
    w: 50, h: 50, hp: 1, score: 0, expl: 'm',
    init(e, o) {
      const n = o.orbs || 3;
      const hp = Math.max(1, Math.round((o.orbHp || 2) * G.diff.hp * (1 + 0.25 * G.loop)));
      e.R = o.r || 19;
      e.spin = (o.spin || 0.04) * (o.dir || 1);
      e.a = o.a0 !== undefined ? o.a0 : rnd(TAU);
      e.cd = 40 + rndi(0, 30);
      e.parts = [];
      for (let i = 0; i < n; i++) e.parts.push({ name: 'orb' + i, ox: 0, oy: 0, w: 9, h: 9, hp, max: hp, vuln: true, expl: 's', score: 150 });
      s2_orbPlace(e);
    },
    update(e) {
      const live = e.parts.filter((p) => !p.dead).length;
      e.a += e.spin * (live === 1 ? 1.6 : 1); // the last orb spins up
      s2_orbPlace(e);
      const P = G.player;
      if (--e.cd <= 0) {
        if (G.canFire(e) && e.x > 64) {
          // the orb that currently points closest to the player fires
          const want = Math.atan2(P.y - e.y, P.x - e.x);
          let best = null, bd = 9;
          for (const p of e.parts) {
            if (p.dead) continue;
            const d = Math.abs(angDiff(want, p.ang));
            if (d < bd) { bd = d; best = p; }
          }
          if (best && bd < 1.1) {
            const bx = e.x + best.ox, by = e.y + best.oy;
            const [vx, vy] = G.aim(bx, by, 1.25);
            G.ebullet(bx, by, vx, vy, { spr: 'ebullet' });
            e.cd = G.fireDelay((e.o && e.o.rate) || 70);
          } else e.cd = 4;
        } else e.cd = 10;
      }
    },
    onPartDeath(e) {
      if (e.parts.every((p) => p.dead)) G.kill(e);
    },
    draw(e, c) {
      const seal = e.carry ? 's2_seal_c' : 's2_seal';
      const orb = e.carry ? 's2_orb_c' : 's2_orb';
      // tethers
      c.fillStyle = e.carry ? '#a04a3a' : '#6a4a9c';
      for (const p of e.parts) {
        if (p.dead) continue;
        const n = Math.round(Math.hypot(p.ox, p.oy) / 3);
        for (let k = 2; k < n; k++) c.fillRect(Math.round(e.x + (p.ox * k) / n), Math.round(e.y + (p.oy * k) / n), 1, 1);
      }
      Sprites.draw(c, seal, e.x, e.y, { frame: (e.t >> 4) & 1 });
      e.parts.forEach((p, i) => {
        if (p.dead) return;
        Sprites.draw(c, orb, e.x + p.ox, e.y + p.oy, { frame: ((e.t >> 2) + i) & 3, flash: p.flash > 0 });
      });
    },
  };

  /* ---- loose keystone: a stalactite that trembles, drops, bursts on the floor and grows back.
   * A rhythm hazard: watch the tremor, then cross under it while it is not falling. ---- */
  ENEMIES.s2_drop = {
    w: 9, h: 15, hp: 3, score: 100, expl: 'm', attach: 'ceil', sink: 3,
    init(e, o) {
      e.st = 0; // 0 hanging, 1 trembling, 2 falling, 3 regrowing
      e.tm = o.off !== undefined ? o.off : rndi(20, 110);
      e.y0 = e.y;
      e.jit = 0;
    },
    update(e) {
      e.tm--;
      if (e.st === 0) {
        e.y = e.y0;
        if (e.tm <= 0 && e.x < W - 10 && e.x > 20) { e.st = 1; e.tm = 34; sfx('stomp'); }
      } else if (e.st === 1) {
        e.jit = e.tm & 2 ? 1 : -1;
        // grit trickles down while it works loose
        if ((e.tm & 3) === 0) G.fx.push({ k: 'part', x: e.x + rnd(-3, 3), y: e.y + 6, vx: -G.camSpeed * 0.5, vy: 0.3, life: 22, t: 0, col: chance(0.5) ? '#9eaac0' : '#5d6882', big: false });
        if (e.tm <= 0) { e.st = 2; e.vy = 0.4; e.jit = 0; }
      } else if (e.st === 2) {
        e.vy = Math.min(3.2, e.vy + 0.1);
        e.y += e.vy;
        if (G.terrain.solid(G.camX + e.x, e.y + e.h / 2) || e.y > H - 26) {
          G.explode(e.x, e.y + 4, 's', { scroll: true });
          G.debris(e.x, e.y + 5, 8);
          e.st = 3;
          e.tm = 70;
          e.harmless = true;
          e.ghost = true;
        }
      } else if (e.tm <= 0) {
        e.st = 0;
        e.tm = 90;
        e.y = e.y0;
        e.harmless = false;
        e.ghost = false;
      }
    },
    /** look-ahead hook (test bots): position `dt` frames from now */
    predict(e, dt) {
      let st = e.st, tm = e.tm, y = e.y, vy = e.vy || 0;
      for (let i = 0; i < dt; i++) {
        tm--;
        if (st === 0) { y = e.y0; if (tm <= 0) { st = 1; tm = 34; } }
        else if (st === 1) { if (tm <= 0) { st = 2; vy = 0.4; } }
        else if (st === 2) { vy = Math.min(3.2, vy + 0.1); y += vy; if (y > H - 34) { st = 3; tm = 70; } }
        else if (tm <= 0) { st = 0; tm = 90; y = e.y0; }
      }
      return [e.x - G.camSpeed * dt, st === 3 ? -100 : y];
    },
    draw(e, c) {
      if (e.st === 3) return;
      Sprites.draw(c, 's2_drop', e.x + (e.st === 1 ? e.jit : 0), e.y, { frame: e.st === 2 ? 1 : 0, flash: e.flash > 0 });
    },
  };

  /* ---- stone-styled variants of the generic turret and walker (same behaviour, own art) ---- */
  function s2_barrel(c, cx, cy, ang, from, to, flash) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = from; i <= to; i++) {
      const x = Math.round(cx + ca * i), y = Math.round(cy + sa * i);
      c.fillStyle = '#2a1a10';
      c.fillRect(x - 1, y - 1, 3, 3);
      c.fillStyle = i > to - 2 ? (flash ? '#ff5a3a' : '#5a3a20') : '#c88c58';
      c.fillRect(x, y, 2, 2);
    }
  }
  ENEMIES.s2_cannon = Object.assign({}, ENEMIES.turret, {
    draw(e, c) {
      const cy = e.y + (e.attach === 'ceil' ? 2 : -2);
      s2_barrel(c, e.x, cy, e.ang, 3, 10, e.cd < 10);
      Sprites.draw(c, 's2_cannon', e.x, e.y, { frame: e.cd < 10 ? 1 : 0, flipY: e.attach === 'ceil', flash: e.flash > 0 });
    },
  });
  ENEMIES.s2_crawler = Object.assign({}, ENEMIES.walker, { spr: () => 's2_crawler', w: 12, h: 10, sink: 0 });

  /* ---- rune glow: decorative pulse over a glyph carved in the terrain ---- */
  ENEMIES.s2_rune = {
    w: 5, h: 7, hp: 1, score: 0, ghost: true, harmless: true, silentDeath: true,
    init(e, o) {
      e.gi = o.g || 0;
      e.ph = o.ph !== undefined ? o.ph : rnd(TAU);
    },
    draw(e, c) {
      const a = 0.12 + 0.5 * (0.5 + 0.5 * Math.sin(e.t * 0.045 + e.ph));
      const oc = c.globalCompositeOperation;
      c.globalCompositeOperation = 'lighter';
      Sprites.draw(c, 's2_glyph' + e.gi, e.x, e.y, { alpha: a });
      c.globalCompositeOperation = oc;
    },
  };

  /** a sprite frame tinted towards a colour (cached; keeps the silhouette) */
  const s2_tintCache = {};
  function s2_tinted(name, frame, col) {
    const key = name + '|' + frame + '|' + col;
    let c = s2_tintCache[key];
    if (!c) {
      const src = Sprites.get(name, frame);
      c = Sprites.makeCanvas(src.width, src.height);
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.6;
      g.fillStyle = col;
      g.fillRect(0, 0, c.width, c.height);
      s2_tintCache[key] = c;
    }
    return c;
  }

  /* ---- mid-boss: the Hive Queen ----
   * head (stinger fan)  core (thorax, kills her)  abdomen (brood ring)
   * Once her head is gone she goes berserk and charges across the screen.
   * She rides the screen, so the scroll never stops; she leaves after `stay` frames. */
  ENEMIES.s2_queen = {
    w: 62, h: 40, hp: 1, score: 8000, expl: 'l',
    init(e, o) {
      const k = G.diff.hp * (1 + 0.25 * G.loop);
      const part = (name, ox, oy, w, h, hp, expl, score) => ({ name, ox, oy, w, h, hp: hp * k, max: hp * k, vuln: true, expl, score });
      e.parts = [
        part('head', -23, 1, 18, 16, 20, 'm', 500),
        part('core', -7, 1, 19, 18, 48, 'l', 2000),
        part('abd', 16, 7, 26, 18, 32, 'm', 800),
      ];
      e.phase = 'enter';
      e.mode = 'hover'; // hover -> windup -> dash -> return
      e.homeX = o.homeX || 186;
      e.by = e.y;
      e.age = 0;
      e.cdFan = 100;
      e.cdBrood = 70;
      e.cdDash = 260;
      e.leaveAt = o.stay || 960;
    },
    update(e) {
      const P = G.player;
      const head = e.parts[0], abd = e.parts[2];
      if (e.phase === 'enter') {
        e.x += (e.homeX - e.x) * 0.035 - 0.25;
        if (e.x <= e.homeX + 1) e.phase = 'fight';
        return;
      }
      if (e.phase === 'leave') {
        e.x += 1.4;
        e.y -= 0.35;
        return;
      }
      e.age++;
      const rage = head.dead ? 1.4 : 1;
      // smoke and sparks from wrecked parts
      for (const p of e.parts) if (p.dead && (e.t & 7) === 0) G.fx.push({ k: 'part', x: e.x + p.ox + rnd(-5, 5), y: e.y + p.oy + rnd(-4, 4), vx: rnd(-0.3, 0.3), vy: -rnd(0.2, 0.7), life: 26, t: 0, col: chance(0.5) ? '#ff9424' : '#6a7a90', big: chance(0.4) });

      /* charge: wind-up (she locks onto your row), dash across the screen, come back from the right */
      if (e.mode === 'windup') {
        e.wt--;
        e.y += clamp((P.alive ? P.y : e.y) - e.y, -0.7, 0.7);
        e.x = e.homeX + (e.wt & 2 ? 2 : -2) + Math.min(0, (e.wt - 30) * 0.35);
        if (e.wt <= 0) { e.mode = 'dash'; sfx('bossLaser'); }
        return;
      }
      if (e.mode === 'dash') {
        e.x -= 3.6;
        if (e.x < -70) { e.mode = 'return'; e.x = W + 80; }
        return;
      }
      if (e.mode === 'return') {
        e.x += (e.homeX - e.x) * 0.045 - 0.3;
        if (e.x <= e.homeX + 1) { e.mode = 'hover'; e.cdDash = G.fireDelay(420); }
        return;
      }

      e.by = clamp(e.by + clamp((P.alive ? P.y : 112) - e.by, -0.3 * rage, 0.3 * rage), 62, 158);
      e.x = e.homeX + Math.sin(e.age * 0.02 * rage) * 9;
      e.y = e.by + Math.sin(e.age * 0.032 * rage) * 15;
      // stinger volleys from the head
      if (!head.dead && --e.cdFan <= 0) {
        if (G.canFire(e)) G.fan(e.x - 30, e.y + 3, 3, 0.7, 1.2, { spr: 'ebullet2', w: 5, h: 5 });
        e.cdFan = G.fireDelay(120);
      }
      // brood: a ring of drones blooms out of the abdomen (faster once the head is gone)
      if (!abd.dead && --e.cdBrood <= 0) {
        if (G.canFire(e)) {
          sfx('coreOpen');
          e.ring = (e.ring || 0) + 1;
          const n = head.dead ? 10 : 8;
          for (let i = 0; i < n; i++) {
            G.spawn('s2_swarm', { x: e.x + 24, y: e.y + 8, pat: 'wheel', index: i, count: n, gid: 'q' + e.ring, amp: 21, spin: (e.age & 64 ? 1 : -1) * 0.055, speed: 1.05, grow: 26 });
          }
        }
        e.cdBrood = G.fireDelay(head.dead ? 170 : 240);
      }
      // berserk charge (only after the head is destroyed)
      if (head.dead && --e.cdDash <= 0 && P.alive) {
        e.mode = 'windup';
        e.wt = 44;
        sfx('coreOpen');
      }
      if (e.age > e.leaveAt) e.phase = 'leave';
    },
    /** look-ahead hook (test bots): body centre `dt` frames from now, from the moment the charge is telegraphed */
    predict(e, dt) {
      let x = e.x, mode = e.mode, wt = e.wt || 0;
      if (e.phase === 'leave') return [x + 1.4 * dt, e.y - 0.35 * dt];
      for (let i = 0; i < dt; i++) {
        if (mode === 'windup') { if (--wt <= 0) mode = 'dash'; }
        else if (mode === 'dash') { x -= 3.6; if (x < -70) { mode = 'return'; x = W + 80; } }
        else if (mode === 'return') { x += (e.homeX - x) * 0.045 - 0.3; if (x <= e.homeX + 1) mode = 'hover'; }
      }
      return [x, e.y];
    },
    onPartDeath(e, p) {
      if (p.name === 'core') G.kill(e);
      else sfx('explodeM');
    },
    onDeath(e) {
      for (let i = 0; i < 6; i++) G.later(4 + i * 5, () => G.explode(e.x + rnd(-26, 26), e.y + rnd(-14, 14), i % 2 ? 's' : 'm', { quiet: i % 2 === 1 }));
    },
    draw(e, c) {
      const fr = (e.t >> 2) & 1;
      // the wind-up blinks red so the charge is unmistakable
      if (e.mode === 'windup' && (e.wt >> 2) & 1) {
        const img = s2_tinted('s2_queen', fr, '#ff2a3a');
        c.drawImage(img, Math.round(e.x - img.width / 2), Math.round(e.y - img.height / 2));
      } else Sprites.draw(c, 's2_queen', e.x, e.y, { frame: fr });
      // hit flash only over the part that was hit
      for (const p of e.parts) {
        if (p.dead || !(p.flash > 0)) continue;
        c.save();
        c.beginPath();
        c.rect(Math.round(e.x + p.ox - p.w / 2), Math.round(e.y + p.oy - p.h / 2), p.w, p.h);
        c.clip();
        Sprites.draw(c, 's2_queen', e.x, e.y, { frame: fr, flash: true });
        c.restore();
      }
    },
  };

  /* ===============================================================
   * THE STAGE
   *
   *   0-560     moonrise plateau: the swarm is introduced (sine, braid, fishnet, loops)
   *   560-1300  outer ring: menhir skyline, a standing trilithon, first stone eye
   *   1300-2000 hanging gates: fly UNDER the lintels; orbiters and swarm streams
   *   2000-2900 SWARM RUSH: 100 drones in patterns, then the Hive Queen (mid-boss)
   *   2900-3300 hanging arcade: round arches, stone eyes and turrets in the bays
   *   3300-3720 dolmen field: calm, three capsule carriers
   *   3720+     Guardian Core arena (flat)
   *
   * Pacing rules used below: after every checkpoint the first swarm stream
   * is triggered >= 160 px later and the first stone-anchored enemy sits
   * >= 380 px later, so the first ~5 s after a respawn are harmless.
   * =============================================================== */
  STAGES.push({
    id: 2,
    name: 'STONEHENGE',
    sub: 'RING OF THE MOON STONES',
    music: 'stage2',
    bossMusic: 'boss',
    scroll: SCROLL,
    bossX: BOSS_X,
    checkpoints: [0, 800, 1530, 2400, 3330],
    terrain: s2_terrain,
    background: s2_background,

    script(S) {
      const lay = s2_layout();
      const SAME = 0.01; // S.wave treats gap 0 as 10 frames; a tiny gap spawns the whole formation in one frame
      let gid = 0; // every formation gets an id (stream bonus for shooting down all of it)
      const sw = (x, o) => S.wave(x, 's2_swarm', Object.assign({ gid: 'w' + ++gid }, o));

      /* ---- ambient glyph glow on the carved runes (menhirs, lintels and the arena floor) ---- */
      for (const r of lay.floorRunes) S.fixed(r.x, r.y, 's2_rune', { g: r.g, ph: r.x * 0.37 });
      for (const st of lay.stones) {
        if (st.rune && st.rune.px !== undefined) S.fixed(st.rune.px, st.rune.py, 's2_rune', { g: st.rune.g, ph: (st.seed % 63) / 10 });
      }

      /* ---- moonrise plateau: the swarm is introduced ---- */
      sw(90, { pat: 'sine', n: 12, gap: 6, y: 112, amp: 32, per: 150, speed: 1.35 });
      sw(236, { pat: 'braid', n: 16, gap: 4, y: 92, amp: 24, per: 96, speed: 1.6, carry: 'last' });
      sw(350, { pat: 'lattice', n: 15, gap: SAME, y: 118, rows: 3, rowGap: 26, amp: 8, per: 130, speed: 1.5, colGap: 10 });
      sw(440, { pat: 'loop', n: 10, gap: 6, y: 66, amp: 15, per: 58, speed: 1.5, strands: 1, carry: 'last' });

      /* ---- outer ring ---- */
      S.fixed(698, 112, 's2_sentinel', { reach: 22 });
      S.ground(625, 's2_crawler', { dir: -1 });
      S.ground(557, 's2_cannon');
      sw(560, { pat: 'swoop', n: 12, gap: 5, y: 20, y0: -14, y1: 120, per: 170, speed: 1.6 });
      sw(650, { pat: 'braid', n: 16, gap: 4, y: 48, amp: 14, per: 90, speed: 1.7, strands: 3, carry: 'last' });
      sw(980, { pat: 'converge', n: 10, gap: 6, y: 38, ty: 150, T: 100, speed: 1.7 });
      sw(1050, { pat: 'converge', n: 10, gap: 6, y: 172, ty: 60, T: 100, speed: 1.7, carry: 'last' });
      sw(1080, { pat: 'lattice', n: 18, gap: SAME, y: 42, rows: 3, rowGap: 14, amp: 6, per: 120, speed: 1.6, colGap: 9 });

      S.fixed(1226, lay.gates[0].top - 5, 's2_cannon');   // on the trilithon's lintel
      /* ---- hanging gates ---- */
      S.fixed(1385, 118, 's2_orbiter', { orbs: 3, r: 19 });
      sw(1300, { pat: 'loop', n: 12, gap: 5, y: 142, amp: 16, per: 60, speed: 1.6, strands: 1, carry: 'last' });
      sw(1400, { pat: 'braid', n: 14, gap: 4, y: 144, amp: 26, per: 100, speed: 1.7 });
      sw(1700, { pat: 'braid', n: 18, gap: 4, y: 142, amp: 30, per: 100, speed: 1.6, carry: 'last' });
      sw(1790, { pat: 'sine', n: 14, gap: 5, y: 142, amp: 34, per: 120, speed: 1.7 });
      sw(1880, { pat: 'lattice', n: 15, gap: SAME, y: 142, rows: 3, rowGap: 24, amp: 6, per: 120, speed: 1.6, colGap: 10, carry: 'last' });

      /* ---- SWARM RUSH: 100+ drones in patterns, then the Hive Queen ---- */
      S.banner(2050, ['SWARM RUSH']);
      sw(2070, { pat: 'wheel', n: 12, gap: SAME, y: 112, amp: 26, speed: 1.0, spin: 0.05, grow: 30 });
      sw(2150, { pat: 'braid', n: 20, gap: 3, y: 58, amp: 20, per: 90, speed: 1.9 });
      sw(2150, { pat: 'lattice', n: 18, gap: SAME, y: 150, rows: 3, rowGap: 24, amp: 10, per: 120, speed: 1.6, colGap: 9, carry: 'last' });
      sw(2230, { pat: 'swoop', n: 14, gap: 4, y: 20, y0: -14, y1: 140, per: 180, speed: 1.7 });
      sw(2230, { pat: 'swoop', n: 14, gap: 4, y: 176, y0: 238, y1: 84, per: 180, speed: 1.7 });
      sw(2310, { pat: 'loop', n: 10, gap: 5, y: 70, amp: 16, per: 60, speed: 1.6, strands: 1, dir: 1 });
      sw(2310, { pat: 'loop', n: 10, gap: 5, y: 154, amp: 16, per: 60, speed: 1.6, strands: 1, dir: -1 });
      // rain of drones that burst on the plateau
      const rainPerm = [3, 11, 6, 14, 0, 9, 16, 2, 12, 5, 15, 8, 1, 10, 17, 4, 13, 7];
      sw(2372, { pat: 'column', n: 18, gap: 3, y: 8, speed: 2.3, each: (i) => ({ x: 98 + rainPerm[i] * 8.6, delay: (i % 2) * 14 }) });
      sw(2500, { pat: 'sine', n: 10, gap: 6, y: 112, amp: 30, per: 130, speed: 1.4, carry: 'last' });
      S.banner(2545, ['HIVE QUEEN']);
      S.at(2560, () => G.spawn('s2_queen', { x: W + 50, y: 100, carry: true }));

      /* ---- hanging arcade ---- */
      sw(2900, { pat: 'braid', n: 16, gap: 4, y: 142, amp: 30, per: 110, speed: 1.6 });
      sw(3060, { pat: 'sine', n: 10, gap: 6, y: 112, amp: 18, per: 120, speed: 1.5, carry: 'last' });
      S.ceil(3125, 's2_cannon');   // under the keystone of the middle arch
      S.fixed(3235, 100, 's2_sentinel', { reach: 18 });
      S.ceil(3032, 's2_drop'); S.ceil(3162, 's2_drop'); S.ceil(3262, 's2_drop');

      /* ---- dolmen field: recover power-ups before the boss ---- */
      sw(3490, { pat: 'sine', n: 10, gap: 6, y: 120, amp: 30, per: 130, speed: 1.4, carry: 'last' });
      sw(3560, { pat: 'loop', n: 10, gap: 6, y: 100, amp: 14, per: 58, speed: 1.4, strands: 1, carry: 'last' });
      sw(3630, { pat: 'braid', n: 14, gap: 5, y: 130, amp: 26, per: 100, speed: 1.4, carry: 'last' });

      /* ---- boss ---- */
      S.boss(BOSS_X, 'bigcore', { level: 2 });
    },
  });
})();
