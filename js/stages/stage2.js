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

  /** the five rune glyphs (5x7) used on megaliths */
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
   * ART (placeholder)
   * =============================================================== */

  /* ===============================================================
   * TERRAIN — a rolling stone plateau, menhirs, trilithons, dolmens,
   * a hanging arcade.  Height profiles are plain engine features; the
   * megaliths are polygons drawn into the collision mask (shapes) and
   * then re-shaded by hand (decorate) so they read as huge chiselled
   * monoliths instead of masonry.
   * =============================================================== */
  const ARC_P0 = 2750, ARC_SP = 120, ARC_N = 6; // hanging arcade: first pier, spacing, count
  const ARC_SPRING = 68, ARC_PIER = 90, ARC_PW = 11;

  /** ceiling height of the hanging arcade: piers with round arches between them */
  function s2_arcadeH(x) {
    if (x < ARC_P0 - 60 || x > ARC_P0 + (ARC_N - 1) * ARC_SP + 60) return 0;
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

  const S2_FLOOR = [
    { type: 'flat', x0: 0, x1: LEN, h: 34 },
    { type: 'noise', x0: 0, x1: 1250, base: 9, amp: 9, scale: 100, seed: 41, edge: 120, mode: 'add' },
    { type: 'hill', x: 300, w: 400, h: 58, shape: 'cos' },
    { type: 'hill', x: 780, w: 300, h: 54, shape: 'cos' },
    { type: 'hill', x: 1150, w: 250, h: 48, shape: 'cos' },
    { type: 'noise', x0: 3380, x1: 3720, base: 6, amp: 6, scale: 90, seed: 43, edge: 80, mode: 'add' },
    { type: 'hill', x: 3520, w: 260, h: 50, shape: 'cos' },
  ];
  const S2_CEIL = [
    { type: 'noise', x0: 900, x1: 1080, base: 40, amp: 12, scale: 36, seed: 51, edge: 48 },
    { type: 'fn', x0: ARC_P0 - 60, x1: ARC_P0 + (ARC_N - 1) * ARC_SP + 60, fn: s2_arcadeH },
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
    const lay = { stones, gates: [], pillars: {}, dolmens: [], floorAt };
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
      const top = gy(cx) - h;
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
      const legTop = fy - legH;
      const a = pillar(null, cx - off, legW, legH, 'flat', { lean: 0, moss: 0.35, rune: o.runeL });
      const b = pillar(null, cx + off, legW, legH, 'flat', { lean: 0, moss: 0.35, rune: o.runeR });
      const lw = gap + legW * 2 + 10;
      const lTop = legTop + 2 - lintelH;
      const l = push('lintel', s2_lintelPoly(rng, cx, lw, lTop, lintelH), { cx, w: lw, h: lintelH, top: lTop, moss: 0.3, rune: o.runeT });
      const gate = { cx, legW, gap, legH, floorY: fy, openL: cx - gap / 2, openR: cx + gap / 2, top: lTop, bottom: legTop + 2, legTop, legs: [a, b], lintel: l };
      lay.gates.push(gate);
      return gate;
    };
    const dolmen = (cx, span, legH, capW, capT, o = {}) => {
      const fy = gy(cx);
      const a = pillar(null, cx - span / 2, 13, legH, 'flat', { lean: 0, moss: 0.4 });
      const b = pillar(null, cx + span / 2, 13, legH, 'flat', { lean: 0, moss: 0.4 });
      const ang = o.ang || 0.05;
      const cap = slab(cx, capW, capT, ang, { moss: 0.5, rune: o.rune, cy: fy - legH - capT / 2 + 2 });
      lay.dolmens.push({ cx, span, legH, top: fy - legH - capT, floorY: fy });
      return cap;
    };

    /* ---- S0: moonrise plateau: just pebbles and the first two menhirs ---- */
    boulder(150, 5); boulder(226, 7); boulder(392, 6); boulder(438, 4);
    pillar('p0', 505, 18, 46, 'slantL', { moss: 0.6 });
    pillar('p1', 566, 20, 66, 'notch', { rune: { g: 0 } });

    /* ---- S1: the outer ring of menhirs ---- */
    pillar('p2', 646, 20, 50, 'chip');
    pillar('p3', 722, 24, 90, 'slantR', { rune: { g: 4 }, moss: 0.7 });
    slab(790, 48, 13, -0.11);
    pillar('p4', 850, 26, 106, 'peak', { rune: { g: 2 } });
    pillar('p5', 930, 20, 38, 'flat');
    pillar('p6', 992, 22, 42, 'notch');
    dolmen(1050, 44, 30, 78, 12, { rune: { g: 5 } });
    pillar('p7', 1156, 26, 110, 'slantL', { rune: { g: 6 } });
    pillar('p8', 1228, 20, 62, 'chip');

    /* ---- S2: three trilithon gates ---- */
    trilithon(1436, 24, 68, 100, 20, { runeT: { g: 3 }, runeL: { g: 7 } });
    pillar('p9', 1552, 20, 56, 'chip');
    trilithon(1670, 26, 62, 104, 21, { runeT: { g: 1 }, runeR: { g: 0 } });
    pillar('p10', 1786, 20, 48, 'flat');
    trilithon(1902, 24, 70, 100, 20, { runeT: { g: 5 }, runeL: { g: 4 } });

    /* ---- S3: swarm rush field (kept open) ---- */
    boulder(2120, 6); slab(2330, 40, 12, 0.08); boulder(2508, 5); pillar('p11', 2624, 20, 40, 'chip');

    /* ---- S4: hanging arcade, with low menhirs in the bays ---- */
    const bays = [2810, 2930, 3050, 3170, 3290];
    const bh = [58, 50, 64, 54, 60];
    bays.forEach((bx, i) => pillar('a' + i, bx, 22, bh[i], ['flat', 'notch', 'chip', 'slantR', 'peak'][i], { rune: i % 2 ? null : { g: (i + 2) % 8 } }));

    /* ---- S5: dolmen field ---- */
    dolmen(3400, 54, 34, 88, 13, { rune: { g: 2 }, ang: -0.04 });
    boulder(3470, 6); slab(3540, 46, 13, 0.1);
    dolmen(3620, 46, 30, 76, 12, { ang: 0.05 });

    // scatter of pebbles along the plateau for texture
    const pr = makeRng(77);
    for (let x = 40; x < LEN - 60; x += 26 + pr() * 40) {
      if (x > 2000 && x < 2700 && pr() < 0.6) continue;
      if (x > BOSS_X - 30) break;
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

  function s2_decorateTerrain(g, T) {
    const lay = s2_layout();
    const img = g.getImageData(0, 0, LEN, H);
    const P = new Uint32Array(img.data.buffer);
    s2_paintGround(P, T);
    s2_paintStones(P, T, lay);
    for (const st of lay.stones) {
      if (!st.rune) continue;
      let rx, ry;
      if (st.t === 'pillar') { rx = Math.round(st.cx + (st.rune.dx || 0)); ry = Math.round(st.top + Math.min(st.h * 0.42, 40)); }
      else if (st.t === 'lintel') { rx = Math.round(st.cx + (st.rune.dx || 0)); ry = Math.round(st.top + st.h * 0.55); }
      else { rx = Math.round(st.cx); ry = Math.round(st.cy !== undefined ? st.cy : (st.y0 + st.y1) / 2); }
      st.rune.px = rx; st.rune.py = ry;
      s2_stampRune(P, T, rx, ry, st.rune.g);
    }
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
    const pil = (x, w, h, tilt = 0) => {
      const base = H - hgt[((x % Pw) + Pw) % Pw] + 3;
      const top = base - h;
      fillPoly([[x - w / 2 - 1, base], [x - w / 2 + tilt, top + 2], [x - w / 2 + tilt + 2, top], [x + w / 2 + tilt - 1, top + 1], [x + w / 2 + tilt, top + 3], [x + w / 2 + 1, base]], false);
    };
    const tri = (x, w, h, gap) => {
      const base = H - hgt[((x % Pw) + Pw) % Pw] + 3;
      const top = base - h;
      const off = gap / 2 + w / 2;
      pil(x - off, w, h);
      pil(x + off, w, h);
      fillPoly([[x - off - w / 2 - 2, top + 1], [x + off + w / 2 + 2, top + 1], [x + off + w / 2 + 2, top - 5], [x - off - w / 2 - 2, top - 5]], false);
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
      { kind: 'custom', draw(ctx, camX) { ctx.drawImage(moon, Math.round(MOON_X - camX * MOON_SPEED - half), Math.round(MOON_Y - half)); } },
      { kind: 'strip', build: (P) => s2_bakeClouds(P, { seed: 5, n: 5, y0: 40, y1: 100, wMin: 90, wMax: 190, tMin: 8, tMax: 15, rim: '#7fa6dc', body: '#243a72', low: '#16224e' }), period: 640, speed: 0.045 },
      { kind: 'strip', build: (P) => s2_bakeStoneRidge(P, { seed: 7, scale: 110, hMin: 56, hMax: 96, top: '#0f3552', base: '#0a2540', rim: '#3fa0b4', stone: '#0a2238', stoneDark: '#081c30', stoneRim: '#3c94ac', stones: farStones }), period: 768, speed: 0.08 },
      { kind: 'strip', build: (P) => s2_bakeMist(P, 128, 196, '#54d2c4', 0.34, 21), period: 512, speed: 0.13 },
      { kind: 'strip', build: (P) => s2_bakeClouds(P, { seed: 11, n: 4, y0: 24, y1: 70, wMin: 60, wMax: 130, tMin: 5, tMax: 9, rim: '#9ab8e8', body: '#3a5290', low: '#233468' }), period: 512, speed: 0.11 },
      { kind: 'strip', build: (P) => s2_bakeStoneRidge(P, { seed: 13, scale: 80, hMin: 46, hMax: 72, top: '#0a2438', base: '#08192b', rim: '#2a7890', stone: '#071a2c', stoneDark: '#061525', stoneRim: '#2e86a0', stones: nearStones }), period: 640, speed: 0.22 },
    ]);
  }

  /* ===============================================================
   * ENEMIES (placeholder)
   * =============================================================== */

  /* ===============================================================
   * THE STAGE
   * =============================================================== */
  STAGES.push({
    id: 2,
    name: 'STONEHENGE',
    sub: 'RING OF THE MOON STONES',
    music: 'stage2',
    bossMusic: 'boss',
    scroll: SCROLL,
    bossX: BOSS_X,
    checkpoints: [0, 850, 1700, 2500, 3250],
    terrain: s2_terrain,
    background: s2_background,
    script(S) {
      s2_layout();
      S.boss(BOSS_X, 'bigcore', { level: 2 });
    },
  });
})();
