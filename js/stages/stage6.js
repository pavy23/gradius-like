'use strict';
/* =============================================================
 * STAGE 6 - CELL  (inside a giant living cell)
 *
 * Passage   winding intracellular tube (S6_PASS control points + scalloped membrane lobes), 'cell' skin
 *           with a seamless whole-length tissue tile, mitochondria embedded in the walls, cilia fringes
 *           (background plane, harmless), pulsing cytoplasm glow, parallax organelles and vacuoles.
 * Signature CELL WALLS: barriers of destructible s6_cell blobs anchored with S.fixed (see s6Wall()).
 *           Some walls DIVIDE (mitosis): an edge cell blinks and buds for ~1 s, then a daughter is born and
 *           grows for ~1.5 s, narrowing a gap. Fairness rules (s6Mitosis): never near the ship, never below
 *           `minGap` px of free passage, waits while the ship sits at the birth spot.
 * Enemies   s6_virus (spiky homing critter)      s6_amoeba (splits in two smaller ones when shot)
 *           s6_spore (pod that releases s6_mote swarms)      s6_enzyme (floating turret, aimed orb bursts)
 * Boss      s6_nucleus: giant cell, weak point = the nucleus behind a wobbling membrane.
 *             closed   membrane absorbs all shots; slow radial bursts + floating spores from the ceiling
 *             opening  the maw yawns open (telegraph)      open   nucleus vulnerable: rain of drops from the
 *                      ceiling in waves with gaps + aimed fans      <=35% HP: closes, splits off small cells
 *                      that orbit and charge, everything speeds up.
 * Pacing    scroll 0.65 -> ~95 s to the boss, checkpoints [0,860,1640,2360,3360], 16 capsule carriers
 *           (3 after the last checkpoint), calm windows after every checkpoint, dense finale 2660-3350.
 * All art is generated in code (original). Every global name is prefixed s6_ / S6_ / s6.
 * ============================================================= */
(function stage6() {
  const S6_BOSS_X = 3700;
  const S6_LEN = S6_BOSS_X + W + 120;

  /* =============================================================
   * small helpers
   * ============================================================= */
  const s6Bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const s6Smooth = (t) => t * t * (3 - 2 * t);
  const s6Mod = (a, n) => ((a % n) + n) % n;

  /** crisp filled disc (no anti-aliasing) using horizontal spans */
  const s6Spans = {};
  function s6Disc(ctx, cx, cy, r) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    let rows = s6Spans[r];
    if (!rows) {
      rows = [];
      for (let y = -r; y <= r; y++) rows.push(Math.round(Math.sqrt(Math.max(0, r * r + 0.5 - y * y))));
      s6Spans[r] = rows;
    }
    for (let i = 0; i < rows.length; i++) {
      const hw = rows[i];
      if (hw > 0) ctx.fillRect(cx - hw, cy - r + i, hw * 2 + 1, 1);
    }
  }
  /** 1px ring (approximate midpoint circle) */
  function s6Ring(ctx, cx, cy, r) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    let x = r, y = 0, err = 1 - r;
    while (x >= y) {
      for (const [a, b] of [[x, y], [y, x], [-x, y], [-y, x], [x, -y], [y, -x], [-x, -y], [-y, -x]]) ctx.fillRect(cx + a, cy + b, 1, 1);
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
  }

  /* =============================================================
   * PASSAGE PROFILE (shared by terrain, walls and background)
   * ============================================================= */
  // [x, centre y, free gap]
  const S6_PASS = [
    [0, 112, 156], [260, 110, 150], [480, 104, 138], [700, 108, 130], [900, 114, 132], [1100, 112, 134],
    [1260, 100, 126], [1420, 90, 124], [1580, 96, 124], [1720, 114, 128], [1900, 128, 126], [2060, 118, 126],
    [2200, 98, 128], [2300, 106, 152], [2380, 110, 172], [2560, 108, 176], [2700, 112, 146], [2820, 104, 130],
    [2960, 100, 128], [3080, 112, 130], [3220, 126, 128], [3380, 112, 136], [3540, 112, 156], [3640, 112, 164], [S6_LEN, 112, 164],
  ];
  // the passage pinches where a cell wall stands: [world x, extra narrowing]
  const S6_WALL_X = [[720, 6], [1180, 6], [1470, 8], [1980, 10], [2262, 12], [2690, 14], [2742, 14], [2990, 6], [3200, 4], [3312, 10]];
  const s6Waist = (x) => {
    let a = 0, k = 0;
    for (const [wx, amt] of S6_WALL_X) {
      const t = clamp(1 - Math.abs(x - wx) / 80, 0, 1), v = t * t * (3 - 2 * t);
      a = Math.max(a, amt * v);
      k = Math.max(k, v);
    }
    return [a, k];
  };
  const s6Pass = (x) => {
    x = clamp(x, 0, S6_LEN);
    let i = 0;
    while (i < S6_PASS.length - 2 && x >= S6_PASS[i + 1][0]) i++;
    const p0 = S6_PASS[Math.max(0, i - 1)], p1 = S6_PASS[i], p2 = S6_PASS[i + 1], p3 = S6_PASS[Math.min(S6_PASS.length - 1, i + 2)];
    const dx = p2[0] - p1[0];
    const t = (x - p1[0]) / dx;
    const t2 = t * t, t3 = t2 * t;
    const out = [0, 0];
    for (let k = 1; k <= 2; k++) {
      const m1 = (p2[k] - p0[k]) / (p2[0] - p0[0]) * dx;
      const m2 = (p3[k] - p1[k]) / (p3[0] - p1[0]) * dx;
      out[k - 1] = (2 * t3 - 3 * t2 + 1) * p1[k] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[k] + (t3 - t2) * m2;
    }
    return { c: out[0], g: out[1] };
  };
  /** passage with the wall waists applied (used for terrain) */
  const s6PassW = (x) => {
    const p = s6Pass(x), w = s6Waist(x);
    return { c: p.c, g: p.g - w[0], k: w[1] };
  };
  const s6Lobe = (x, ph, lam, amp) => amp * Math.pow(Math.abs(Math.sin((Math.PI * (x + ph)) / lam)), 0.7);
  /** amplitude taper: bumps fade out for the flat boss arena */
  const s6Taper = (x) => clamp((S6_BOSS_X - 40 - x) / 120, 0, 1);
  const s6Hill = (x, x0, w, h) => {
    const t = Math.abs(x - x0) / (w / 2);
    return t >= 1 ? 0 : h * Math.sqrt(1 - t * t);
  };
  // extra rounded lobes that shape the organelle chamber
  const s6FloorBumps = (x) => s6Hill(x, 2450, 110, 40) + s6Hill(x, 2650, 90, 30);
  const s6CeilBumps = (x) => s6Hill(x, 2400, 80, 30) + s6Hill(x, 2560, 110, 36);

  const s6FloorH = (x) => {
    const p = s6PassW(x);
    const tp = s6Taper(x) * (1 - 0.65 * p.k);
    const wob = tp * (s6Lobe(x, 0, 38, 7) + s6Lobe(x, 17, 23, 3));
    return Math.max(28, H - (p.c + p.g / 2) + wob + tp * s6FloorBumps(x));
  };
  const s6CeilH = (x) => {
    const p = s6PassW(x);
    const tp = s6Taper(x) * (1 - 0.65 * p.k);
    const wob = tp * (s6Lobe(x, 11, 44, 7) + s6Lobe(x, 4, 27, 3));
    return Math.max(16, p.c - p.g / 2 + wob + tp * s6CeilBumps(x));
  };
  /** screen y of the floor surface / ceiling surface at world x (same rounding as Terrain) */
  const s6FloorTop = (x) => (G.terrain ? G.terrain.floorTop(x) : H - Math.round(s6FloorH(x)));
  const s6CeilBot = (x) => (G.terrain ? G.terrain.ceilBottom(x) : Math.round(s6CeilH(x)));

  /* =============================================================
   * ART — stage-specific sprites (all original)
   * ============================================================= */
  // ---- cell blobs (barrier cells / carriers / dividing blink / boss minis) ----
  const S6_CELL_PALS = {
    n: { rimHi: '#d8ffff', rim: '#3cc8ec', rimLo: '#1c5cb0', inHi: '#a8f8fc', inMid: '#66dcf0', inLo: '#3aa8dc', nuc: '#ff9424', nucLo: '#c05412', nucHi: '#ffe646' },
    c: { rimHi: '#ffe0d8', rim: '#f0483c', rimLo: '#9c1c2c', inHi: '#ffb0a0', inMid: '#ff7a68', inLo: '#dc4450', nuc: '#ffe646', nucLo: '#ff9424', nucHi: '#ffffff' },
    b: { rimHi: '#ffffff', rim: '#fff2a8', rimLo: '#ffb020', inHi: '#ffffff', inMid: '#fff6c8', inLo: '#ffd860', nuc: '#f03a3a', nucLo: '#a01c2c', nucHi: '#ff9a8a' },
    p: { rimHi: '#ffe0f8', rim: '#f478c8', rimLo: '#8a2a84', inHi: '#ffc0ec', inMid: '#f090d8', inLo: '#c058b0', nuc: '#5a1c7c', nucLo: '#2a0c48', nucHi: '#c078f0' },
  };
  const S6_CELL_SIZES = [4, 6, 8, 10, 12, 14, 16];
  function s6BakeCell(name, D, P) {
    const N = D + 2;
    Sprites.painted(name, N, N, 2, (d, f) => {
      const c = (N - 1) / 2, r = D / 2;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const dx = x - c, dy = y - c, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > r - 0.2) continue;
          const lit = -(dx * 0.62 + dy * 0.78) / r;
          let col;
          if (dist > r - 1.5) col = lit > 0.3 ? P.rimHi : lit < -0.35 ? P.rimLo : P.rim;
          else col = lit > 0.42 ? P.inHi : lit < -0.22 ? P.inLo : P.inMid;
          d.px(x, y, col);
        }
      }
      if (D >= 6) {
        const nr = Math.max(1.3, r * 0.36);
        const nx = c + (f ? 0.6 : -0.4) + 0.5, ny = c + 0.5 + (f ? 0 : 0.4);
        d.circle(nx, ny, nr + 0.35, P.nucLo);
        d.circle(nx, ny, nr - 0.15, P.nuc);
        d.px(Math.round(nx - nr * 0.45), Math.round(ny - nr * 0.45), P.nucHi);
        if (D >= 10) d.px(Math.round(c - r * 0.42 - (f ? 1 : 0)), Math.round(c - r * 0.5), 'w');
      } else {
        d.px(Math.round(c), Math.round(c), P.nuc);
      }
      d.outline('k');
    });
  }
  for (const D of S6_CELL_SIZES) {
    s6BakeCell('s6_cell' + D, D, S6_CELL_PALS.n);
    s6BakeCell('s6_cellc' + D, D, S6_CELL_PALS.c);
    s6BakeCell('s6_cellb' + D, D, S6_CELL_PALS.b);
  }
  s6BakeCell('s6_cellp10', 10, S6_CELL_PALS.p); // the boss's small cells

  // ---- virus: spiky homing critter ----
  function s6BakeVirus(name, P) {
    Sprites.painted(name, 15, 15, 4, (d, f) => {
      const c = 7, a0 = (f * Math.PI) / 16;
      for (let k = 0; k < 8; k++) {
        const a = a0 + (k * Math.PI) / 4, ca = Math.cos(a), sa = Math.sin(a);
        d.line(c + ca * 3.4, c + sa * 3.4, c + ca * 5.5, c + sa * 5.5, P.spike);
        d.px(Math.round(c + ca * 6.4), Math.round(c + sa * 6.4), P.tip);
      }
      d.circle(c, c, 4.3, P.lo);
      d.circle(c - 0.4, c - 0.4, 3.6, P.body);
      d.circle(c - 1.1, c - 1.2, 2.1, P.hi);
      d.circle(c + 0.6, c + 0.6, 1.2, P.core);
      d.px(c - 2, c - 2, 'w');
      d.outline('k');
    });
  }
  s6BakeVirus('s6_virus', { body: '#34b04a', hi: '#8cf03c', lo: '#146034', spike: '#c8f060', tip: '#ffe646', core: '#f03a3a' });
  s6BakeVirus('s6_virus_c', { body: '#f0483c', hi: '#ffa890', lo: '#8a1428', spike: '#ffcf70', tip: '#ffffff', core: '#ffe646' });

  // ---- amoeba: three size classes (L / M / S), 4 wobble frames ----
  function s6BakeAmoeba(name, w, h, R, seed) {
    Sprites.painted(name, w, h, 4, (d, f) => {
      const cx = (w - 1) / 2, cy = (h - 1) / 2;
      const ph = f * (Math.PI / 2);
      const raw = (th) => 1 + 0.16 * Math.sin(2 * th + seed + ph) + 0.15 * Math.sin(3 * th + seed * 2 - ph) + 0.07 * Math.sin(5 * th + seed * 3 + 2 * ph) + 0.05 * Math.sin(7 * th + seed + 3 * ph);
      let mx = 0;
      for (let i = 0; i < 90; i++) mx = Math.max(mx, raw((i / 90) * TAU));
      const rad = (th) => raw(th) / mx; // the widest pseudopod exactly reaches R (the sprite is never clipped)
      const blob = (sc, ox, oy) => {
        const pts = [];
        for (let i = 0; i < 40; i++) {
          const th = (i / 40) * TAU;
          const r = R * sc * rad(th);
          pts.push([cx + ox + Math.cos(th) * r * (w / h > 1.1 ? 1.08 : 1), cy + oy + Math.sin(th) * r * 0.9]);
        }
        return pts;
      };
      d.poly(blob(1, 0, 0), '#a4586a');
      d.poly(blob(0.9, -0.4, -0.5), '#eaa484');
      d.poly(blob(0.66, -R * 0.1, -R * 0.14), '#ffd2ac');
      d.poly(blob(0.36, -R * 0.2, -R * 0.26), '#fff0d4');
      // nucleus
      const nx = cx + R * 0.1, ny = cy + R * 0.08, nr = Math.max(1.6, R * 0.3);
      d.circle(nx, ny, nr, '#5a1c6c');
      if (nr >= 3) d.circle(nx - 0.4, ny - 0.4, nr - 0.9, '#9a3c94');
      d.px(Math.round(nx - nr * 0.4), Math.round(ny - nr * 0.45), '#f0a0e0');
      if (R >= 9) {
        for (const [ox, oy, r] of [[-0.5, 0.35, 0.17], [0.3, -0.5, 0.13], [0.5, 0.42, 0.11]]) {
          d.circle(cx + R * ox, cy + R * oy, Math.max(1, R * r), '#c8745c');
          d.px(Math.round(cx + R * ox - 0.5), Math.round(cy + R * oy - 0.5), '#fff0d4');
        }
      }
      d.outline('k');
    });
  }
  s6BakeAmoeba('s6_amoeba0', 38, 34, 16, 0.3);
  s6BakeAmoeba('s6_amoeba1', 26, 24, 11, 1.7);
  s6BakeAmoeba('s6_amoeba2', 18, 16, 7, 2.9);
  // the capsule-carrying amoeba is red / orange like every other carrier
  Sprites.recolor('s6_amoeba0', 's6_amoeba0_c', {
    '#a4586a': '#8a1428', '#eaa484': '#f0483c', '#ffd2ac': '#ff8a5a', '#fff0d4': '#ffe0a8', '#c8745c': '#b02030',
    '#5a1c6c': '#c05412', '#9a3c94': '#ffe646', '#f0a0e0': '#ffffff',
  });

  // ---- spore pod (sits on floor / ceiling): closed, glowing, open ----
  Sprites.painted('s6_spore', 26, 18, 3, (d, f) => {
    // base collar
    d.ellipse(13, 15, 12, 3, 'N');
    d.ellipse(13, 14.5, 11, 2.4, 'n');
    d.hline(4, 22, 15, 'N');
    // bulb
    d.ellipse(13, 9, 9.5, 8, 'N');
    d.ellipse(12.6, 8.6, 8.6, 7.2, 'n');
    d.ellipse(11.4, 7.4, 6.2, 4.8, 'l');
    d.px(8, 5, 'h');
    d.px(9, 4, 'h');
    for (const x of [8, 13, 18]) d.vline(x, 6, 12, 'N');
    if (f === 0) {
      d.ellipse(13, 3, 4, 2, 'y');
      d.hline(11, 15, 2, 'h');
      d.rect(11, 4, 5, 1, 'Y');
    } else if (f === 1) {
      d.rect(9, 2, 9, 3, 'R');
      d.rect(10, 3, 7, 1, 'r');
      d.ellipse(13, 1.5, 4.5, 1.6, 'y');
      d.hline(11, 15, 1, 'h');
    } else {
      // open: flaps fold out, glowing red throat with spores
      d.poly([[5, 4], [9, 1], [11, 6], [7, 8]], 'y');
      d.poly([[21, 4], [17, 1], [15, 6], [19, 8]], 'y');
      d.line(6, 4, 9, 2, 'h');
      d.line(20, 4, 17, 2, 'h');
      d.ellipse(13, 5, 5, 3.2, 'R');
      d.ellipse(13, 5.2, 3.8, 2.2, 'r');
      d.px(11, 5, 'y');
      d.px(13, 4, 'h');
      d.px(15, 5, 'y');
    }
    d.outline('k');
  });
  Sprites.recolor('s6_spore', 's6_spore_c', { l: 'o', n: 'r', N: 'R', y: 'h', Y: 'y', h: 'w', R: 'e', r: 'P' });

  // ---- mote: small swarm spore released by pods ----
  Sprites.painted('s6_mote', 9, 9, 2, (d, f) => {
    d.circle(4, 4, 3.2, '#146034');
    d.circle(3.8, 3.8, 2.6, '#34b04a');
    d.circle(3.4, 3.4, 1.5, '#8cf03c');
    d.px(3, 3, 'w');
    d.px(6, f ? 6 : 2, '#8cf03c');
    d.px(7, f ? 7 : 1, '#34b04a');
    d.outline('k');
  });

  // ---- enzyme: floating hexagonal molecule turret (0-2 idle, 3-5 charging) ----
  Sprites.painted('s6_enzyme', 24, 24, 6, (d, f) => {
    const c = 11.5, ch = f >= 3, a0 = (f % 3) * (Math.PI / 9);
    const pts = [];
    for (let k = 0; k < 6; k++) pts.push([c + Math.cos(a0 + (k * Math.PI) / 3) * 8, c + Math.sin(a0 + (k * Math.PI) / 3) * 8]);
    for (let k = 0; k < 6; k++) {
      const a = pts[k], b = pts[(k + 1) % 6];
      d.line(a[0], a[1], b[0], b[1], 'X');
      d.line(a[0], a[1], c, c, ch ? 'R' : 'G');
    }
    for (const [x, y] of pts) {
      d.circle(x, y, 3.1, ch ? 'Y' : 'X');
      d.circle(x - 0.3, y - 0.3, 2.5, ch ? 'y' : 'g');
      d.circle(x - 0.7, y - 0.7, 1.4, ch ? 'h' : 'W');
      d.px(Math.round(x - 1), Math.round(y - 1), 'w');
    }
    d.circle(c, c, 3.6, ch ? 'r' : 'R');
    d.circle(c - 0.3, c - 0.3, 2.7, ch ? 'o' : 'r');
    d.circle(c - 0.6, c - 0.6, 1.5, ch ? 'w' : 'y');
    d.outline('k');
  });
  Sprites.recolor('s6_enzyme', 's6_enzyme_c', { X: 'O', g: 'o', W: 'y', G: 'R' });

  // ---- boss projectiles ----
  Sprites.painted('s6_drip', 7, 10, 2, (d, f) => {
    d.poly([[3, 0], [6, 6], [5, 8.5], [3, 9.5], [1, 8.5], [0, 6]], f ? '#ff9424' : '#ff6a3a');
    d.poly([[3, 2], [5, 6], [4.5, 8], [3, 8.6], [1.5, 8], [1, 6]], '#ffd430');
    d.rect(2, 5, 3, 3, '#fff2a8');
    d.px(3, 6, 'w');
    d.outline('k');
  });
  Sprites.painted('s6_dripg', 7, 7, 3, (d, f) => {
    const r = [1.2, 2.2, 3][f];
    d.circle(3, 3, r + 0.6, '#a83a84');
    d.circle(3, 3, r, '#f478c8');
    d.circle(3, 3, Math.max(0.6, r - 1.4), '#ffe0f8');
    d.outline('k');
  });

  // ---- pops (death effects, 4 frames): flash -> splat -> ring -> droplets ----
  function s6BakePop(name, size, cols) {
    Sprites.painted(name, size, size, 4, (d, f) => {
      const c = (size - 1) / 2, mx = size / 2 - 1;
      const r = 3 + f * ((mx - 3) / 3);
      if (f === 0) {
        d.circle(c, c, 4.2, cols[2]);
        d.circle(c, c, 3.2, cols[1]);
        d.circle(c, c, 1.8, cols[0]);
        return;
      }
      if (f === 1) {
        d.ring(c, c, r, 2.2, cols[1]);
        d.circle(c, c, 1.6, cols[0]);
      } else if (f === 2) {
        d.ring(c, c, r, 1.4, cols[0]);
      } else if (f === 3) {
        d.ring(c, c, r, 0.9, cols[2]);
      }
      const n = 9;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + 0.35 + f * 0.05;
        const rr = r + (k % 2 ? 2.2 : 0.6) + (f > 1 ? f - 1 : 0);
        const x = Math.round(c + Math.cos(a) * rr), y = Math.round(c + Math.sin(a) * rr);
        const col = f < 3 ? cols[k % 2 ? 0 : 1] : cols[k % 2 ? 1 : 2];
        d.px(x, y, col);
        if (f < 4) d.px(x + 1, y, col);
        if (f < 3) d.px(x, y + 1, col);
      }
    });
  }
  s6BakePop('s6_pop_n', 20, ['#ffffff', '#6cf0f8', '#2a96c8']);
  s6BakePop('s6_pop_c', 20, ['#ffffff', '#ff9a8a', '#f03a3a']);
  s6BakePop('s6_pop_g', 20, ['#f4ffb0', '#8cf03c', '#34b04a']);
  s6BakePop('s6_pop_a', 30, ['#fff6e0', '#ffb890', '#c8745c']);
  s6BakePop('s6_pop_p', 26, ['#ffffff', '#f478c8', '#a83a84']);
  s6BakePop('s6_pop_w', 26, ['#ffffff', '#c8d4ff', '#7a8a9c']);

  // ---- floating spore (dropped by the boss) ----
  Sprites.painted('s6_drift', 13, 13, 2, (d, f) => {
    const c = 6;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + (f ? Math.PI / 8 : 0);
      d.line(c + Math.cos(a) * 4, c + Math.sin(a) * 4, c + Math.cos(a) * 5.7, c + Math.sin(a) * 5.7, '#fff2a8');
    }
    d.circle(c, c, 4.2, '#b89a20');
    d.circle(c - 0.4, c - 0.4, 3.6, '#ffe646');
    d.circle(c - 1, c - 1, 2.1, '#fff2a8');
    d.circle(c + 0.8, c + 0.8, 1.4, '#ff9424');
    d.px(c - 2, c - 2, 'w');
    d.outline('k');
  });

  /* =============================================================
   * BOSS ART: the NUCLEUS (giant cell with a maw)
   * ============================================================= */
  const S6_BODY_N = 100;
  const S6_BODY_R = 43;
  function s6BakeBossBody() {
    const N = S6_BODY_N, C = (N - 1) / 2, R = S6_BODY_R, NA = 360;
    const rgb = Terrain.rgb32;
    const OL = rgb('#12061e');
    const MEM = ['#7c2a94', '#b84cb8', '#e880d8', '#ffbdf0', '#fff0fc'].map(rgb);
    const CYT = ['#5c2488', '#7a34a4', '#9a48bc', '#bc62d0', '#d884e0', '#efaaf0', '#fbd2f8'].map(rgb);
    const GRA = ['#8a3cb0', '#f4b8f4'].map(rgb);
    // everything that does not depend on the wobble is computed once
    const pr = new Float32Array(N * N), pa = new Int16Array(N * N), pm = new Uint8Array(N * N), pc = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x - C, dy = y - C, r = Math.sqrt(dx * dx + dy * dy), i = y * N + x;
        pr[i] = r;
        pa[i] = Math.min(NA - 1, Math.floor(((Math.atan2(dy, dx) + Math.PI) / TAU) * NA));
        const lit = -((dx / (r || 1)) * 0.62 + (dy / (r || 1)) * 0.78);
        pm[i] = lit > 0.62 ? 4 : lit > 0.28 ? 3 : lit > -0.15 ? 2 : lit > -0.55 ? 1 : 0;
        // cytoplasm glows around the nucleus (the focal point) and darkens towards the membrane
        const dn = Math.hypot(dx + 14, dy) / R;
        const b = 0.3 + 0.62 * Math.pow(Math.max(0, 1 - dn * 1.05), 1.1) + 0.16 * (-(dx * 0.55 + dy * 0.7) / R) - 0.16 * Math.pow(r / R, 3);
        const dith = (s6Bayer[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.14;
        pc[i] = clamp(Math.floor((b + dith) * CYT.length), 0, CYT.length - 1);
      }
    }
    const rng = makeRng(913);
    const grains = [];
    for (let i = 0; i < 70; i++) {
      const a = rng() * TAU, r = 8 + rng() * 30;
      grains.push([Math.round(C + Math.cos(a) * r), Math.round(C + Math.sin(a) * r), rng() < 0.5 ? 0 : 1]);
    }
    const RM = new Float32Array(NA);
    const frames = [];
    for (let f = 0; f < 16; f++) {
      const ph = (f / 16) * TAU;
      for (let k = 0; k < NA; k++) {
        const th = ((k + 0.5) / NA) * TAU - Math.PI;
        RM[k] = R + 1.1 * Math.sin(2 * th + ph) + 0.9 * Math.sin(3 * th - 2 * ph + 1) + 0.6 * Math.sin(5 * th + 3 * ph + 2);
      }
      const cv = Sprites.makeCanvas(N, N);
      const g = cv.getContext('2d');
      const img = g.createImageData(N, N);
      const px = new Uint32Array(img.data.buffer);
      for (let i = 0; i < N * N; i++) {
        const r = pr[i];
        if (r > R + 5) continue;
        const rm = RM[pa[i]];
        if (r > rm) continue;
        const depth = rm - r;
        if (depth < 1.05) px[i] = OL;
        else if (depth < 4.7) px[i] = MEM[depth > 3.5 ? Math.max(0, pm[i] - 1) : pm[i]]; // inner shadow line: membrane thickness
        else px[i] = CYT[pc[i]];
      }
      for (const [gx, gy, k] of grains) {
        const i = gy * N + gx;
        if (Math.hypot(gx - C, gy - C) < R - 8 && px[i] !== 0) px[i] = GRA[k];
      }
      g.putImageData(img, 0, 0);
      frames.push(cv);
    }
    Sprites.fromCanvases('s6_nuc_body', frames);
  }
  s6BakeBossBody();

  // small organelle drifting inside the body
  Sprites.painted('s6_organ', 15, 8, 2, (d, f) => {
    d.ellipse(7, 3.5, 6.6, 3.2, '#5a1878');
    d.ellipse(7, 3.3, 5.8, 2.5, '#a044b8');
    for (const x of [3, 6, 9]) d.vline(x + (f ? 1 : 0), 2, 5, '#5a1878');
    d.hline(4, 9, 2, '#d078dc');
  });

  // wounds that open on the membrane as the nucleus loses health
  Sprites.painted('s6_wound', 11, 12, 1, (d) => {
    d.ellipse(5, 4, 4.6, 3.6, '#c2306a');
    d.ellipse(5, 4.2, 3.6, 2.8, '#6a0c36');
    d.ellipse(4.6, 4.4, 2.2, 1.6, '#34061c');
    d.px(2, 2, '#ff8ab0');
    d.px(3, 1, '#ff8ab0');
    d.vline(5, 7, 9, '#c2306a');
    d.px(5, 10, '#ff8ab0');
    d.px(8, 6, '#c2306a');
    d.outline('k');
  });

  // the nucleus itself: dim (seen through the membrane) / hot (exposed and vulnerable)
  function s6BakeNucleus(name, hot) {
    Sprites.painted(name, 30, 30, 2, (d, f) => {
      const c = 14.5, r = 13.6;
      const tones = hot ? ['#3a0c50', '#7a1c86', '#b03a9c', '#e070b4', '#ffb0d0'] : ['#240a38', '#3c1256', '#56207a', '#7434a0', '#9450bc'];
      for (let y = 0; y < 30; y++) {
        for (let x = 0; x < 30; x++) {
          const dx = x - c, dy = y - c, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > r) continue;
          const nz = Math.sqrt(Math.max(0, 1 - (dist / r) * (dist / r)));
          const lit = -(dx * 0.5 + dy * 0.65) / r * 0.7 + nz * 0.55;
          const dith = (s6Bayer[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.22;
          d.px(x, y, tones[clamp(Math.floor((lit + dith + 0.15) * 4.6), 0, 4)]);
        }
      }
      // chromatin speckles
      for (const [x, y] of [[9, 8], [19, 10], [20, 19], [8, 20], [13, 24], [22, 14]]) d.px(x, y, hot ? '#f4a0dc' : '#6a3494');
      // nucleolus
      const nr = hot ? (f ? 5.6 : 4.8) : 4;
      const cols = hot ? ['#a01c2c', '#f03a3a', '#ff9424', '#ffe646', '#ffffff'] : ['#2a0c30', '#4a1440', '#6a2050', '#8a3060', '#8a3060'];
      d.circle(c - 1, c + 0.5, nr + 0.8, cols[0]);
      d.circle(c - 1, c + 0.5, nr, cols[1]);
      d.circle(c - 1.4, c, nr * 0.68, cols[2]);
      d.circle(c - 1.8, c - 0.4, nr * 0.38, cols[3]);
      if (hot) d.px(c - 2, c - 1, cols[4]);
      d.outline('k');
    });
  }
  s6BakeNucleus('s6_nuc_dim', false);
  s6BakeNucleus('s6_nuc_hot', true);

  // frosted membrane over the nucleus (dither density = how closed the maw still is)
  [0.62, 0.42, 0.22].forEach((dens, i) => {
    Sprites.painted('s6_frost' + i, 30, 30, 1, (d) => {
      for (let y = 0; y < 30; y++) {
        for (let x = 0; x < 30; x++) {
          const dist = Math.hypot(x - 14.5, y - 14.5);
          if (dist > 13.6) continue;
          if (s6Bayer[(y & 3) * 4 + (x & 3)] / 16 < dens) d.px(x, y, (x + y) & 1 && dens > 0.5 ? '#e880d8' : '#b84cb8');
        }
      }
    });
  });

  // the maw: closed seam -> gaping mouth (4 levels), drawn over the body's left side
  [[1.4, 15], [3.4, 16.5], [6.2, 18.5], [8.8, 20.5]].forEach(([rx, ry], lv) => {
    Sprites.painted('s6_maw' + lv, 30, 48, 1, (d) => {
      const cx = 14.5, cy = 23.5;
      for (let y = 0; y < 48; y++) {
        for (let x = 0; x < 30; x++) {
          const nx = (x - cx) / (rx + 2.2), ny = (y - cy) / (ry + 2.2);
          const q = nx * nx + ny * ny;
          if (q > 1) continue;
          const ix = (x - cx) / rx, iy = (y - cy) / ry;
          const qi = ix * ix + iy * iy;
          const lit = -((x - cx) * 0.6 + (y - cy) * 0.75) / (rx + ry * 0.6);
          if (qi <= 1) {
            // cavity: dark, warmer towards the back (right)
            const warm = (x - cx) / rx;
            d.px(x, y, lv === 0 ? '#2a0838' : warm > 0.1 ? ((x + y) & 1 ? '#7a1440' : '#5a1038') : '#2a0838');
          } else {
            d.px(x, y, lit > 0.45 ? '#fff0fc' : lit > 0.05 ? '#ffbdf0' : lit > -0.4 ? '#e880d8' : '#b84cb8');
          }
        }
      }
      if (lv === 0) {
        for (let y = 12; y < 36; y += 4) d.px(14, y, '#ffbdf0'); // stitches
      } else {
        // teeth along the top and bottom lips
        const n = lv + 1;
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const tx = Math.round(cx - rx * 0.7 + t * rx * 1.4);
          for (const [sy, dir] of [[cy - ry * Math.sqrt(Math.max(0, 1 - ((tx - cx) / rx) ** 2)), 1], [cy + ry * Math.sqrt(Math.max(0, 1 - ((tx - cx) / rx) ** 2)), -1]]) {
            const y0 = Math.round(sy);
            d.px(tx, y0 + dir, '#fff0fc');
            d.px(tx, y0 + dir * 2, '#ffbdf0');
            if (lv >= 3) d.px(tx, y0 + dir * 3, '#e880d8');
          }
        }
      }
      d.outline('k');
    });
  });

  /* =============================================================
   * TERRAIN + BACKGROUND definitions
   * ============================================================= */
  const S6_GRAD = [[0, '#1a0838'], [0.45, '#34125e'], [0.8, '#5a1c72'], [1, '#7a2a78']];
  const s6HexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const s6GradAt = (t) => {
    t = clamp(t, 0, 1);
    for (let i = 1; i < S6_GRAD.length; i++) {
      if (t <= S6_GRAD[i][0]) {
        const a = S6_GRAD[i - 1], b = S6_GRAD[i];
        const k = (t - a[0]) / (b[0] - a[0]);
        const ca = s6HexRgb(a[1]), cb = s6HexRgb(b[1]);
        return [lerp(ca[0], cb[0], k), lerp(ca[1], cb[1], k), lerp(ca[2], cb[2], k)];
      }
    }
    return s6HexRgb(S6_GRAD[S6_GRAD.length - 1][1]);
  };
  const s6Css = (c, f = 1) => `rgb(${clamp(Math.round(c[0] * f), 0, 255)},${clamp(Math.round(c[1] * f), 0, 255)},${clamp(Math.round(c[2] * f), 0, 255)})`;

  /* ---- decorations baked into the terrain ---- */
  Sprites.painted('s6_mito', 28, 13, 2, (d, f) => {
    // a mitochondrion embedded in the tissue: dark envelope, folded cristae
    const cx = 13.5, cy = 6, rx = 13, ry = 5.6;
    for (let y = 0; y < 13; y++) {
      for (let x = 0; x < 28; x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry;
        const q = nx * nx + ny * ny;
        if (q > 1) continue;
        let col = q > 0.72 ? '#5e2078' : '#9a3c8a';
        const inner = Math.abs(ny) < 0.62;
        if (q <= 0.72 && inner) {
          const k = ((x + (f ? 2 : 0)) % 5 + 5) % 5;
          if (k === 0 || (k === 1 && ((y + 1) & 1))) col = '#5e2078';
          else if (y < cy - 1) col = '#b85aa0';
        }
        d.px(x, y, col);
      }
    }
  });

  function s6DecorateTerrain(g, T) {
    const L = T.length;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    // depth shading: the tissue gets darker away from the passage
    for (let x = 0; x < L; x++) {
      const ft = T.floorTopArr[x], cb = T.ceilBotArr[x];
      for (const [a, b, al] of [[10, 22, 0.14], [22, 36, 0.26], [36, 80, 0.38]]) {
        g.fillStyle = `rgba(16,2,32,${al})`;
        if (ft < H) g.fillRect(x, ft + a, 1, Math.min(H - (ft + a), b - a + (b === 80 ? 200 : 0)));
        if (cb > 0) g.fillRect(x, Math.max(0, cb - b), 1, Math.min(cb - a, b - a) > 0 ? Math.min(b - a, cb - a) : 0);
      }
    }
    // soft tonal blotches break up the repetition of the tissue tile
    const brng = makeRng(505);
    for (let x = 10; x < L; x += 26 + Math.floor(brng() * 34)) {
      const dark = brng() < 0.6, r = 9 + Math.floor(brng() * 14);
      g.fillStyle = dark ? 'rgba(20,4,40,0.16)' : 'rgba(255,150,230,0.08)';
      const ft = T.floorTopArr[x], cb = T.ceilBotArr[x];
      if (brng() < 0.5 && ft < H - 24) s6Disc(g, x, ft + 12 + Math.floor(brng() * (H - ft - 20)), r);
      else if (cb > 24) s6Disc(g, x, cb - 12 - Math.floor(brng() * (cb - 20)), r);
    }
    // mitochondria and ribosome dots inside the tissue
    const rng = makeRng(77);
    for (let x = 30; x < L - 60; x += 70 + Math.floor(rng() * 90)) {
      if (rng() < 0.85) {
        const ft = T.floorTopArr[x];
        if (H - ft >= 30) Sprites.drawTL(g, 's6_mito', x, ft + 9 + Math.floor(rng() * Math.min(10, H - ft - 26)), { frame: (x >> 3) & 1 });
      }
      const x2 = x + 25 + Math.floor(rng() * 40);
      if (rng() < 0.8) {
        const cb = T.ceilBotArr[x2];
        if (cb >= 30) Sprites.drawTL(g, 's6_mito', x2, cb - 9 - 13 - Math.floor(rng() * Math.min(8, cb - 24)), { frame: (x2 >> 3) & 1 });
      }
    }
    g.restore();
  }

  /**
   * The engine's 'cell' tile repeats every `tw` px with a random vertical shift per block, which shows as
   * vertical seams in the membrane network. This tile covers the WHOLE stage length (jittered-grid Worley
   * cells, periodic in y), so the tissue never repeats. It is only used for skins that carry `s6Seamless`;
   * every other 'cell' skin (other stages) still gets the engine's tile.
   */
  const s6EngineCellTile = Terrain.TILES.cell;
  Terrain.TILES.cell = function (sk, rng) {
    if (!sk.s6Seamless) return s6EngineCellTile(sk, rng);
    const w = sk.tw, h = sk.th, rgb = Terrain.rgb32;
    const pal = sk.pal.map(rgb), mem = rgb(sk.membrane), nucCol = rgb(sk.nucleus), nucHi = rgb(sk.nucleusHi || '#ffb0d0');
    const gy = sk.rows || 7, ch = h / gy, gx = Math.round(w / (ch * 1.05)), cw = w / gx;
    const cells = [];
    for (let j = 0; j < gy; j++) {
      for (let i = 0; i < gx; i++) {
        cells.push({ x: (i + 0.12 + rng() * 0.76) * cw, y: (j + 0.12 + rng() * 0.76) * ch, tone: (rng() - 0.5) * 0.3, nr: (sk.nr || 4) * (0.7 + rng() * 0.7) });
      }
    }
    const data = new Uint32Array(w * h);
    const thick = sk.thick || 2.1;
    for (let y = 0; y < h; y++) {
      const cj = Math.min(gy - 1, Math.floor(y / ch));
      for (let x = 0; x < w; x++) {
        const ci = Math.min(gx - 1, Math.floor(x / cw));
        let d1 = 1e9, d2 = 1e9, best = null;
        for (let dj = -1; dj <= 1; dj++) {
          const nj = cj + dj, wj = (nj + gy) % gy, oy = (nj - wj) * ch;
          for (let di = -1; di <= 1; di++) {
            const ni = ci + di, wi = (ni + gx) % gx, ox = (ni - wi) * cw;
            const c = cells[wj * gx + wi];
            const ex = x - (c.x + ox), ey = y - (c.y + oy);
            const d = ex * ex + ey * ey;
            if (d < d1) { d2 = d1; d1 = d; best = c; } else if (d < d2) d2 = d;
          }
        }
        d1 = Math.sqrt(d1);
        d2 = Math.sqrt(d2);
        let col;
        if (d2 - d1 < thick) col = mem;
        else if (d1 < best.nr) col = d1 < best.nr * 0.42 ? nucHi : nucCol;
        else {
          const v = clamp(0.3 + (1 - d1 / 22) * 0.7 + best.tone, 0, 0.999);
          const dith = ((s6Bayer[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) / pal.length * 0.7;
          col = pal[clamp(Math.floor((v + dith) * pal.length), 0, pal.length - 1)];
        }
        data[y * w + x] = col;
      }
    }
    // sparse lighter granules
    const spk = pal[pal.length - 1];
    for (let i = 0; i < w * h * 0.004; i++) data[Math.floor(rng() * w * h)] = spk;
    return { w, h, data };
  };

  const s6Terrain = () => ({
    length: S6_LEN,
    floor: [{ type: 'fn', x0: 0, x1: S6_LEN - 1, fn: s6FloorH }],
    ceil: [{ type: 'fn', x0: 0, x1: S6_LEN - 1, fn: s6CeilH }],
    decorate: s6DecorateTerrain,
    skin: {
      kind: 'cell', s6Seamless: true, tw: S6_LEN, th: H, cells: 14, nr: 3.6, thick: 2.1, rows: 7,
      pal: ['#2c0e40', '#48186a', '#66268a', '#8438a8', '#a850c0'],
      membrane: '#24093a', nucleus: '#b8407c', nucleusHi: '#e878b4',
      outline: '#14041e', hi: '#ffc8f4', hi2: '#e890e0', lo: '#2a0a40', seed: 61,
    },
  });

  /* ---- background layers ---- */
  /** dithered glow band that pulses (the "cytoplasm heartbeat") */
  function s6BakeGlow() {
    const c = Sprites.makeCanvas(W, H);
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = Math.pow(Math.max(0, 1 - Math.abs(y - 100) / 118), 1.5) * (0.75 + 0.25 * Math.sin(x * 0.045 + y * 0.02));
        if (v > s6Bayer[(y & 3) * 4 + (x & 3)] / 16 + 0.04) {
          const p = (y * W + x) * 4;
          img.data[p] = 214; img.data[p + 1] = 132; img.data[p + 2] = 255; img.data[p + 3] = 255;
        }
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  /** big soft dithered clouds of cytoplasm that drift slowly (tiles horizontally) */
  function s6BakeCyto(P) {
    const c = Sprites.makeCanvas(P, H);
    const g = c.getContext('2d');
    const img = g.createImageData(P, H);
    const rng = makeRng(31);
    const blobs = Array.from({ length: 6 }, (_, i) => ({ x: (i + rng() * 0.6) * (P / 6), y: 30 + rng() * 150, rx: 50 + rng() * 40, ry: 22 + rng() * 22 }));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < P; x++) {
        let v = 0;
        for (const b of blobs) {
          for (const o of [-P, 0, P]) {
            const dx = (x - b.x - o) / b.rx, dy = (y - b.y) / b.ry;
            v = Math.max(v, 1 - Math.sqrt(dx * dx + dy * dy));
          }
        }
        if (v > 0 && v * 0.95 > s6Bayer[(y & 3) * 4 + (x & 3)] / 16 + 0.05) {
          const p = (y * P + x) * 4;
          img.data[p] = 200; img.data[p + 1] = 120; img.data[p + 2] = 240; img.data[p + 3] = 255;
        }
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  /** far organelle silhouettes: mitochondria, vacuoles and Golgi stacks (tiling strip) */
  function s6BakeOrganelles(P, seed, dark, light) {
    const d = new Sprites.Painter(P, H, {});
    const rng = makeRng(seed);
    const n = 6;
    for (let k = 0; k < n; k++) {
      const x = (k + 0.15 + rng() * 0.7) * (P / n), y = 24 + rng() * 170;
      const kind = k % 3, ang = (rng() - 0.5) * 1.1, len = 22 + rng() * 14, rad = 8 + rng() * 5, vac = 12 + rng() * 6;
      const bg = s6GradAt(y / H);
      const fill = s6Css(bg, dark), edge = s6Css(bg, light), fold = s6Css(bg, (dark + light) / 2 + 0.05);
      for (const off of [-P, 0, P]) {
        const cx = x + off;
        if (kind === 0) {
          // mitochondrion: capsule with cristae
          const ca = Math.cos(ang), sa = Math.sin(ang);
          for (let yy = -len - rad; yy <= len + rad; yy++) {
            for (let xx = -len - rad; xx <= len + rad; xx++) {
              const u = xx * ca + yy * sa, v = -xx * sa + yy * ca;
              const dd = Math.hypot(Math.max(0, Math.abs(u) - len * 0.6), v);
              if (dd > rad) continue;
              let col = dd > rad - 1.4 ? edge : fill;
              if (dd < rad - 3 && Math.abs(Math.sin(u * 0.75)) < 0.28 && Math.abs(v) < rad - 3) col = fold;
              d.px(Math.round(cx + xx), Math.round(y + yy), col);
            }
          }
        } else if (kind === 1) {
          const r = vac;
          for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
            const dd = Math.hypot(xx, yy);
            if (dd > r) continue;
            d.px(Math.round(cx + xx), Math.round(y + yy), dd > r - 1.3 ? edge : fill);
          }
          d.px(Math.round(cx - r * 0.5), Math.round(y - r * 0.5), edge);
        } else {
          for (let s = 0; s < 4; s++) {
            for (let xx = -16; xx <= 16; xx++) {
              const yy = Math.round(s * 5 - 7 + (xx * xx) / 60);
              d.px(Math.round(cx + xx), Math.round(y + yy), edge);
              d.px(Math.round(cx + xx), Math.round(y + yy + 1), fill);
              d.px(Math.round(cx + xx), Math.round(y + yy + 2), fill);
            }
          }
        }
      }
    }
    return d.c;
  }
  function s6BubbleLayer(seed, n, depth, rMin, rMax, alpha, riseMin, riseMax) {
    const rng = makeRng(seed), span = 512;
    const list = Array.from({ length: n }, () => ({ x: rng() * span, y: rng() * H, r: rMin + Math.floor(rng() * (rMax - rMin + 1)), ph: rng() * TAU, rise: riseMin + rng() * (riseMax - riseMin) }));
    return {
      kind: 'custom',
      draw(ctx, camX, t) {
        for (const b of list) {
          let x = s6Mod(b.x - camX * depth + Math.sin(t * 0.013 + b.ph) * 4, span);
          if (x > W + b.r) x -= span;
          if (x < -b.r) continue;
          const y = s6Mod(b.y - t * b.rise, H + 2 * b.r + 8) - b.r - 4;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#c890f0';
          s6Disc(ctx, x, y, b.r);
          ctx.globalAlpha = Math.min(1, alpha * 3.2);
          ctx.fillStyle = '#f0c8ff';
          s6Ring(ctx, x, y, b.r);
          if (b.r >= 4) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(Math.round(x - b.r * 0.55), Math.round(y - b.r * 0.55), 2, 1);
            ctx.fillRect(Math.round(x - b.r * 0.55), Math.round(y - b.r * 0.55) + 1, 1, 1);
          }
          ctx.globalAlpha = 1;
        }
      },
    };
  }
  /** cilia fringing the passage (harmless decoration, sways in the background plane) */
  function s6CiliaLayer() {
    return {
      kind: 'custom',
      draw(ctx, camX, t) {
        const T = G.terrain;
        if (!T) return;
        const x0 = Math.floor(camX / 3) * 3;
        for (let wx = x0; wx < camX + W + 6; wx += 3) {
          if (wx > S6_BOSS_X + W || wx < 40) continue;
          const zone = 0.5 + 0.5 * Math.sin(wx * 0.0062 + 1.3) + 0.25 * Math.sin(wx * 0.017);
          if (zone < 0.42) continue;
          const h1 = ((wx * 2654435761) >>> 0) / 4294967296;
          const len = 4 + Math.floor(h1 * 6 * clamp(zone, 0.5, 1.2));
          const sway = Math.sin(t * 0.06 + wx * 0.31) * 1.6;
          const x = wx - camX;
          const yf = T.floorTopArr[wx], yc = T.ceilBotArr[wx];
          // yf = first solid row of the floor, yc = first free row under the ceiling; the hairs grow away from the tissue
          for (const [y0, dir] of [[yf, -1], [yc, 1]]) {
            if (y0 <= 0 || y0 >= H) continue;
            for (let k = 0; k < len; k++) {
              const o = Math.round(sway * ((k + 1) / len) * ((k + 1) / len));
              const y = dir < 0 ? y0 - 1 - k : y0 + k;
              ctx.fillStyle = k >= len - 2 ? 'rgba(255,190,240,0.75)' : 'rgba(224,110,208,0.5)';
              ctx.fillRect(x + o, y, 1, 1);
            }
          }
        }
      },
    };
  }

  const s6Background = () => {
    const glow = s6BakeGlow();
    const cyto = s6BakeCyto(512);
    // the cytoplasm "heartbeat": it quickens while the nucleus fights
    let beat = 0, lastT = 0;
    return Backgrounds.make([
      { kind: 'gradient', stops: S6_GRAD, steps: 20 },
      { kind: 'custom', draw: (ctx, camX, t) => {
        beat += clamp(t - lastT, 0, 4) * (G.boss && G.boss.raged ? 0.075 : G.bossPhase === 'fight' ? 0.045 : 0.03);
        lastT = t;
        ctx.globalAlpha = (G.bossPhase === 'fight' ? 0.11 : 0.09) + 0.07 * (0.5 + 0.5 * Math.sin(beat));
        ctx.drawImage(glow, 0, 0);
        ctx.globalAlpha = 1;
      } },
      { kind: 'custom', draw: (ctx, camX, t) => {
        const off = Math.floor(camX * 0.05 + t * 0.06) % 512;
        ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 0.021 + 1);
        ctx.drawImage(cyto, -off, 0);
        if (512 - off < W) ctx.drawImage(cyto, 512 - off, 0);
        ctx.globalAlpha = 1;
      } },
      { kind: 'strip', build: (P) => s6BakeOrganelles(P, 11, 0.8, 1.35), period: 512, speed: 0.1, drift: 0.05 },
      s6BubbleLayer(21, 6, 0.14, 12, 22, 0.1, 0.05, 0.12),
      { kind: 'strip', build: (P) => s6BakeOrganelles(P, 47, 0.7, 1.55), period: 512, speed: 0.22, drift: 0.09 },
      s6BubbleLayer(22, 9, 0.3, 5, 11, 0.12, 0.1, 0.22),
      s6CiliaLayer(),
      s6BubbleLayer(23, 12, 0.55, 2, 4, 0.16, 0.2, 0.42),
    ]);
  };

  /* =============================================================
   * ENEMIES
   * ============================================================= */
  const s6AngDiff = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  };
  /** death splash (world-anchored when `scroll`) */
  const s6Pop = (x, y, kind, scroll) => G.fx.push({ k: 'anim', spr: 's6_pop_' + kind, x, y, t: 0, spd: 2, scroll: !!scroll });
  const s6Scaled = (hp) => Math.max(1, Math.round(hp * G.diff.hp * (1 + 0.25 * G.loop)));
  /** keep a free flier off the passage walls (soft push) */
  function s6KeepInside(e, margin, push) {
    const wx = G.camX + e.x;
    const top = s6CeilBot(wx) + margin, bot = s6FloorTop(wx) - margin;
    if (e.y < top) e.vy = Math.max(e.vy, push);
    else if (e.y > bot) e.vy = Math.min(e.vy, -push);
  }

  /* ---------------- CELL: destructible barrier blob (+ mitosis) ---------------- */
  const s6CellSize = (d) => clamp(Math.round(d / 2) * 2, 4, 16);

  /** largest free vertical span left in a wall (projected over all its columns) */
  function s6WallGap(wall, wx, extra) {
    const iv = [];
    for (const c of G.enemies) {
      if (c.dead || c.type !== 's6_cell' || c.wall !== wall) continue;
      const half = c.sz / 2;
      iv.push([c.to ? c.to.y - half + 1 : c.by - half + 1, c.to ? c.to.y + half - 1 : c.by + half - 1]);
    }
    if (extra) iv.push(extra);
    iv.sort((a, b) => a[0] - b[0]);
    let best = 0, cur = s6CeilBot(wx);
    for (const [a, b] of iv) {
      if (a > cur) best = Math.max(best, a - cur);
      cur = Math.max(cur, b);
    }
    return Math.max(best, s6FloorTop(wx) - cur);
  }

  ENEMIES.s6_cell = {
    w: 12, h: 12, hp: 3, score: 40, silentDeath: true,
    init(e, o) {
      e.sz = o.size || 12;
      e.by = e.y;
      e.ph = rnd(TAU);
      e.wob = o.wob !== undefined ? o.wob : 0.6;
      e.grow = o.grow !== undefined ? o.grow : 1;
      e.growT = o.growT || 90;
      e.wall = o.wall;
      e.to = o.toWx !== undefined ? { wx: o.toWx, y: o.toY, wx0: e.wx, y0: e.y } : null; // newborn slides to its place
      const d = o.divide;
      e.dv = d ? { left: d.n || 1, dx: d.dx || 0, dy: d.dy || 0, at: d.at !== undefined ? d.at : 205, warn: d.warn || 56, grow: d.grow || 90, minGap: d.minGap || 30, st: 0, t: 0 } : null;
      s6CellFit(e);
    },
    update(e) {
      if (e.grow < 1) {
        e.grow = Math.min(1, e.grow + (1 - 0.34) / e.growT);
        if (e.to) {
          const k = s6Smooth((e.grow - 0.34) / 0.66);
          e.wx = lerp(e.to.wx0, e.to.wx, k);
          e.by = lerp(e.to.y0, e.to.y, k);
        }
        if (e.grow >= 1) e.to = null;
        s6CellFit(e);
      }
      e.y = e.by + Math.sin(e.t * 0.045 + e.ph) * e.wob;
      if (e.dv && e.dv.left > 0) s6Mitosis(e);
    },
    draw(e, c) {
      const dv = e.dv;
      const blinking = dv && dv.st === 1 && ((dv.t >> (dv.t > dv.warn * 0.55 ? 1 : 2)) & 1) === 0;
      const D = s6CellSize(e.sz * e.grow);
      const pre = blinking ? 's6_cellb' : e.carry ? 's6_cellc' : 's6_cell';
      if (dv && dv.st === 1) {
        // the bud that will become the daughter cell
        const k = dv.t / dv.warn;
        const bs = s6CellSize(4 + k * 5);
        const off = e.sz * 0.36 + bs * 0.42 + k * e.sz * 0.16;
        Sprites.draw(c, (e.carry ? 's6_cellc' : 's6_cell') + bs, e.x + dv.dx * off, e.y + dv.dy * off, { frame: (e.t >> 3) & 1 });
      }
      Sprites.draw(c, pre + D, e.x, e.y, { frame: ((e.t >> 4) + (e.ph > 3 ? 1 : 0)) & 1, flash: e.flash > 0 });
    },
    onDeath(e) {
      s6Pop(e.x, e.y, e.carry ? 'c' : 'n', true);
      sfx('cellPop');
    },
  };
  function s6CellFit(e) {
    const D = e.sz * e.grow;
    e.w = e.h = Math.max(3, Math.round(D) - 2); // a little smaller than the sprite: the round blob has no corners
    e.harmless = e.grow < 0.5;
  }
  /**
   * Mitosis: idle -> blink + bud (telegraph) -> the daughter is born and grows for ~1.5 s.
   * Fairness rules: a cell never divides near the ship, never when that would leave the wall with
   * less than `minGap` px of free passage, and waits while the ship sits right next to the birth spot.
   * A chain (n > 1) is passed on to the daughter, so the parent divides only once.
   */
  function s6Mitosis(e) {
    const dv = e.dv, P = G.player;
    const half = e.sz / 2, cy = e.by + dv.dy * e.sz * 0.92;
    if (dv.st === 0) {
      if (e.grow < 1 || e.x > dv.at) return;
      if (P.alive && e.x < P.x + 64) { dv.left = 0; return; }
      if (s6WallGap(e.wall, e.wx, [cy - half + 1, cy + half - 1]) < dv.minGap) { dv.left = 0; return; }
      dv.st = 1;
      dv.t = 0;
      sfx('cellPop');
      return;
    }
    if (++dv.t < dv.warn) return;
    const bx = e.wx + dv.dx * e.sz * 0.55 - G.camX, by = e.by + dv.dy * e.sz * 0.55;
    if (P.alive && Math.abs(bx - P.x) < 50 && Math.abs(by - P.y) < 28) {
      // the ship is right there: keep blinking a little longer, or give up
      dv.t = dv.warn - 8;
      if (e.x < P.x + 44) { dv.st = 0; dv.left = 0; }
      return;
    }
    if (s6WallGap(e.wall, e.wx, [cy - half + 1, cy + half - 1]) < dv.minGap) { dv.st = 0; dv.left = 0; return; }
    const left = dv.left - 1;
    G.spawn('s6_cell', {
      attach: 'free', wx: e.wx + dv.dx * e.sz * 0.5, y: e.by + dv.dy * e.sz * 0.5,
      size: e.sz, hp: e.o.hp, wall: e.wall, wob: e.wob, grow: 0.34, growT: dv.grow,
      toWx: e.wx + dv.dx * e.sz * 0.92, toY: cy,
      divide: left > 0 ? { n: left, dx: dv.dx, dy: dv.dy, at: 9999, warn: dv.warn, grow: dv.grow, minGap: dv.minGap } : null,
    });
    sfx('cellPop');
    dv.left = 0;
    dv.st = 0;
  }

  /* ---------------- VIRUS: spiky homing critter ---------------- */
  ENEMIES.s6_virus = {
    w: 11, h: 11, hp: 1, score: 100, fps: 4, silentDeath: true,
    spr: (e) => (e.carry ? 's6_virus_c' : 's6_virus'),
    init(e, o) {
      e.spd = o.speed || 1.1;
      e.vx = -e.spd;
      e.vy = o.vy0 || 0;
      e.turn = o.turn || 0.03;
      e.homeT = o.homeT !== undefined ? o.homeT : 34;
      e.weave = o.weave || 0;
      e.ph = o.phase || 0;
    },
    update(e) {
      const P = G.player;
      if (e.t < e.homeT) {
        e.vy = e.vy * 0.985 + (e.weave ? Math.cos(e.t * 0.09 + e.ph) * e.weave * 0.09 : 0);
        e.vx = -e.spd;
      } else if (P.alive && e.x > P.x - 22 && e.t < e.homeT + 260) {
        const want = Math.atan2(P.y - e.y, P.x - e.x);
        let cur = Math.atan2(e.vy, e.vx);
        cur += clamp(s6AngDiff(want, cur), -e.turn, e.turn);
        e.vx = Math.cos(cur) * e.spd;
        e.vy = Math.sin(cur) * e.spd;
      }
      s6KeepInside(e, 8, 0.3);
    },
    onDeath(e) {
      s6Pop(e.x, e.y, e.carry ? 'c' : 'g');
      sfx('explodeS');
    },
  };

  /* ---------------- AMOEBA: big slow drifter that splits when shot ---------------- */
  const S6_AMOEBA = [
    { w: 28, h: 24, hp: 6, score: 300 },
    { w: 19, h: 17, hp: 3, score: 150 },
    { w: 12, h: 11, hp: 1, score: 100 },
  ];
  ENEMIES.s6_amoeba = {
    w: 28, h: 24, hp: 6, score: 300, fps: 9, silentDeath: true,
    spr: (e) => (e.carry && e.sz === 0 ? 's6_amoeba0_c' : 's6_amoeba' + e.sz),
    init(e, o) {
      e.sz = o.sz || 0;
      const K = S6_AMOEBA[e.sz];
      e.w = K.w;
      e.h = K.h;
      e.hp = e.maxHp = s6Scaled(K.hp);
      e.baseVx = o.vx !== undefined ? o.vx : -0.5;
      e.vx = e.baseVx;
      e.dvy = o.vy || 0;
      e.ph = rnd(TAU);
      e.bob = o.bob !== undefined ? o.bob : 0.3;
    },
    update(e) {
      e.dvy *= 0.985;
      e.vx += (e.baseVx - e.vx) * 0.04;
      e.vy = e.dvy + Math.cos(e.t * 0.03 + e.ph) * e.bob;
      s6KeepInside(e, e.h / 2 + 4, 0.4);
    },
    onDeath(e) {
      s6Pop(e.x, e.y, e.sz === 0 ? 'a' : 'g', false);
      sfx(e.sz === 0 ? 'explodeM' : 'explodeS');
      if (e.sz < 2 && G.bossPhase !== 'dying') {
        for (const dir of [-1, 1]) {
          G.spawn('s6_amoeba', { x: e.x + dir * 3, y: e.y + dir * 5, sz: e.sz + 1, vx: e.vx - 0.05, vy: dir * 0.9 });
        }
      }
    },
  };

  /* ---------------- SPORE POD + MOTES: hatch that releases swarms ---------------- */
  ENEMIES.s6_spore = {
    w: 20, h: 14, hp: 9, score: 400, attach: 'floor', sink: 3, expl: 'm', silentDeath: true,
    spr: (e) => (e.carry ? 's6_spore_c' : 's6_spore'),
    init(e, o) {
      e.cd = 80 + rndi(0, 50);
      e.st = 0;
      e.stT = 0;
      e.count = o.count || 5;
      e.frame = 0;
    },
    update(e) {
      const P = G.player;
      if (e.st === 0) {
        e.frame = 0;
        if (--e.cd <= 0) {
          if (P.alive && e.x < W - 24 && e.x > 30) { e.st = 1; e.stT = 0; sfx('coreOpen'); } else e.cd = 20;
        }
      } else if (e.st === 1) {
        // charging: the cap glows
        e.frame = (e.stT >> 2) & 1 ? 1 : 0;
        if (++e.stT >= 38) { e.st = 2; e.stT = 0; }
      } else {
        e.frame = 2;
        const k = e.stT;
        if (k % 8 === 2 && k / 8 < e.count) {
          const up = e.attach === 'ceil' ? 1 : -1;
          G.spawn('s6_mote', { x: e.x + rnd(-3, 3), y: e.y + up * 8, vx0: rnd(-1.1, 0.4), vy0: up * rnd(1.0, 1.7) });
        }
        if (++e.stT >= e.count * 8 + 16) { e.st = 0; e.cd = G.fireDelay(e.o.rate || 210) + rndi(0, 40); }
      }
    },
    onDeath(e) {
      s6Pop(e.x, e.y - 3, e.carry ? 'c' : 'g', true);
      G.explode(e.x, e.y - 2, 'm', { scroll: true, quiet: false });
    },
  };
  ENEMIES.s6_mote = {
    w: 7, h: 7, hp: 1, score: 30, fps: 4, silentDeath: true,
    spr: () => 's6_mote',
    init(e, o) {
      e.vx = o.vx0 !== undefined ? o.vx0 : -0.6;
      e.vy = o.vy0 || -1.2;
      e.spd = 1.0 + rnd(0, 0.22);
      e.ph = rnd(TAU);
    },
    update(e) {
      const P = G.player;
      if (e.t > 14 && e.t < 400 && P.alive && e.x > P.x - 26) {
        const want = Math.atan2(P.y - e.y, P.x - e.x) + Math.sin(e.t * 0.17 + e.ph) * 0.6;
        let cur = Math.atan2(e.vy, e.vx);
        cur += clamp(s6AngDiff(want, cur), -0.06, 0.06);
        e.vx = Math.cos(cur) * e.spd;
        e.vy = Math.sin(cur) * e.spd;
      } else if (e.t <= 14) {
        e.vx *= 0.97;
        e.vy *= 0.97;
      }
      s6KeepInside(e, 6, 0.35);
    },
    onDeath(e) {
      s6Pop(e.x, e.y, 'g');
      sfx('cellPop');
    },
  };

  /* ---------------- ENZYME: floating molecule turret ---------------- */
  ENEMIES.s6_enzyme = {
    w: 18, h: 18, hp: 5, score: 300, expl: 'm', silentDeath: true,
    spr: (e) => (e.carry ? 's6_enzyme_c' : 's6_enzyme'),
    init(e, o) {
      e.by = e.y;
      e.ph = rnd(TAU);
      e.cd = 70 + rndi(0, 70);
      e.burst = o.burst || 2;
      e.rate = o.rate || 135;
      e.amp = o.amp !== undefined ? o.amp : 6;
    },
    update(e) {
      e.y = e.by + Math.sin(e.t * 0.035 + e.ph) * e.amp;
      e.frame = e.cd < 36 ? 3 + ((e.t >> 2) % 3) : (e.t >> 3) % 3;
      if (--e.cd <= 0) {
        if (G.canFire(e) && e.x > 24) {
          for (let i = 0; i < e.burst; i++) {
            G.later(i * 10, () => {
              if (e.dead || !G.canFire(e)) return;
              const [vx, vy] = G.aim(e.x, e.y, 1.3);
              G.ebullet(e.x + vx * 7, e.y + vy * 7, vx, vy, { spr: 'ebulletL', w: 5, h: 5, anim: 8 });
            });
          }
        }
        e.cd = G.fireDelay(e.rate) + rndi(0, 40);
      }
    },
    onDeath(e) {
      s6Pop(e.x, e.y, e.carry ? 'c' : 'w', true);
      G.explode(e.x, e.y, 'm', { scroll: true });
    },
  };

  /* =============================================================
   * BOSS: NUCLEUS
   *  closed  membrane absorbs every shot; slow radial bursts + floating spores fall from the ceiling
   *  opening the maw yawns open (telegraph)
   *  open    the nucleus is vulnerable; rain of drops from the ceiling (with gaps) + aimed fans
   *  <=35%   the cell splits: small cells orbit, then charge; everything speeds up
   * ============================================================= */
  const S6_BOSS_HP = 140;
  // [health fraction below which the wound shows, offset x, offset y] on the body's right / top / bottom
  const S6_WOUNDS = [[0.85, 16, -26], [0.7, 26, 12], [0.55, -2, 30], [0.4, 22, -6], [0.28, 6, -32], [0.16, 12, 24]];

  ENEMIES.s6_drift = {
    w: 9, h: 9, hp: 1, score: 60, fps: 8, silentDeath: true,
    spr: () => 's6_drift',
    init(e, o) {
      e.vy = o.vy0 || 0.5;
      e.ph = rnd(TAU);
    },
    update(e) {
      e.vx = Math.sin(e.t * 0.035 + e.ph) * 0.34;
      if (e.y > s6FloorTop(G.camX + e.x) - 7) {
        e.dead = true;
        s6Pop(e.x, e.y, 'g');
      }
    },
    onDeath(e) {
      s6Pop(e.x, e.y, 'g');
      sfx('cellPop');
    },
  };

  /** small cell split off the boss: orbits, blinks, then charges */
  ENEMIES.s6_mini = {
    w: 10, h: 10, hp: 2, score: 150, silentDeath: true,
    init(e, o) {
      e.boss = o.boss;
      e.ang = o.ang || 0;
      e.orbR = 60 + rndi(-3, 3);
      e.mode = 0; // 0 orbit, 1 wind-up, 2 charge
      e.orbT = o.delay || 120;
      e.wt = 0;
    },
    update(e) {
      const B = e.boss, P = G.player;
      if (e.mode === 2) return;
      if (!B || B.dead) { e.mode = 2; e.vx = -1.2; return; }
      e.ang += 0.026 * (B.spd || 1);
      if (e.mode === 1) {
        // hold still for a moment and blink, then dash at where the ship is
        if (--e.wt <= 0) {
          const [vx, vy] = G.aim(e.x, e.y, 2.1);
          e.vx = vx;
          e.vy = vy;
          e.mode = 2;
          sfx('missile');
        }
        return;
      }
      e.x = B.x + Math.cos(e.ang) * e.orbR;
      e.y = clamp(B.y + Math.sin(e.ang) * e.orbR * 0.82, 38, 186);
      if (--e.orbT <= 0 && P.alive && B.chargeGate <= 0 && (B.st === 'closed' || B.st === 'split')) {
        e.mode = 1;
        e.wt = 36;
        B.chargeGate = G.fireDelay(100);
      } else if (e.orbT < 0) e.orbT = 10;
    },
    draw(e, c) {
      const blink = e.mode === 1 && ((e.wt >> 2) & 1) === 0;
      Sprites.draw(c, (blink ? 's6_cellb' : 's6_cellp') + 10, e.x, e.y, { frame: (e.t >> 3) & 1, flash: e.flash > 0 });
    },
    onDeath(e) {
      s6Pop(e.x, e.y, 'p');
      sfx('cellPop');
    },
  };

  ENEMIES.s6_nucleus = {
    w: 88, h: 88, hp: 99999, score: 10000, keep: true, silentDeath: true,
    spr: () => 's6_nuc_body',
    init(e) {
      e.hp = e.maxHp = 99999;
      e.homeX = W - 50;
      e.st = 'enter';
      e.pt = 0;
      e.wob = 0;
      e.spd = 1;
      e.rage = false;
      e.split = false;
      e.open = 0; // 0 closed .. 3 wide open (maw animation)
      e.chargeGate = 60;
      e.burstCd = 70;
      e.charge = 0;
      e.dropCd = 120;
      e.rainCd = 40;
      e.fanCd = 80;
      const nh = Math.round(S6_BOSS_HP * G.diff.hp * (1 + 0.25 * G.loop));
      const R = S6_BODY_R - 1;
      const parts = [
        { name: 'nucleus', ox: -14, oy: 0, w: 28, h: 28, hp: nh, max: nh, vuln: false, expl: 'xl', score: 5000 },
        { name: 'lid', ox: -35, oy: 0, w: 14, h: 28, hp: 99999, vuln: false },
        { name: 'core', ox: 21, oy: 0, w: 42, h: 28, hp: 99999, vuln: false },
      ];
      for (const [y0, y1] of [[14, 25], [25, 35], [35, 43]]) {
        const hw = (Math.sqrt(R * R - y0 * y0) + Math.sqrt(Math.max(0, R * R - y1 * y1))) / 2;
        for (const sg of [-1, 1]) parts.push({ name: 'body', ox: 0, oy: (sg * (y0 + y1)) / 2, w: hw * 2, h: y1 - y0, hp: 99999, vuln: false });
      }
      e.parts = parts;
    },
    setOpen(e, on) {
      const n = e.parts[0], lid = e.parts[1];
      n.vuln = !!on;
      lid.solid = !on;
    },
    update(e) {
      const P = G.player;
      e.pt++;
      e.wob += 0.25 * e.spd;
      if (e.chargeGate > 0) e.chargeGate--;

      /* ---- entrance ---- */
      if (e.st === 'enter') {
        e.x += (e.homeX - e.x) * 0.035 - 0.12;
        if (e.x <= e.homeX + 0.6) {
          e.x = e.homeX;
          e.st = 'closed';
          e.pt = 0;
        }
        return;
      }
      /* ---- movement: slow figure along the right side, faster when enraged ---- */
      const ty = 112 + Math.sin(e.pt * 0.016 * e.spd) * 20 + (P.alive ? clamp(P.y - 112, -40, 40) * 0.25 : 0);
      e.y += clamp((ty - e.y) * 0.04, -0.7 * e.spd, 0.7 * e.spd);
      e.y = clamp(e.y, 80, 144);
      e.x = e.homeX + Math.sin(e.pt * 0.021 * e.spd) * 4;

      /* ---- state machine ---- */
      const closedT = e.rage ? 150 : 215;
      const openT = e.rage ? 300 : 340;
      if (e.st === 'closed') {
        if (e.open > 0) e.open = Math.max(0, e.open - 0.12);
        if (e.pt >= closedT) { e.st = 'opening'; e.pt = 0; sfx('coreOpen'); }
      } else if (e.st === 'opening') {
        e.open = Math.min(3, e.open + 3 / 44);
        if (e.pt >= 44) {
          e.st = 'open';
          e.pt = 0;
          e.open = 3;
          this.setOpen(e, true);
          e.rainCd = 26;
          e.fanCd = 70;
        }
      } else if (e.st === 'open') {
        if (e.pt >= openT || e.split) {
          e.st = 'closing';
          e.pt = 0;
          this.setOpen(e, false);
          sfx('coreClose');
        }
      } else if (e.st === 'closing') {
        e.open = Math.max(0, e.open - 3 / 26);
        if (e.pt >= 26) {
          e.open = 0;
          if (e.split) { e.st = 'split'; e.splitT = 0; e.split = false; } else { e.st = 'closed'; }
          e.pt = 0;
          e.burstCd = 50;
          e.dropCd = 60;
        }
      } else if (e.st === 'split') {
        e.splitT++;
        if ([20, 34, 48, 62].indexOf(e.splitT) >= 0) {
          const k = [20, 34, 48, 62].indexOf(e.splitT);
          G.spawn('s6_mini', { x: e.x, y: e.y, boss: e, ang: (k / 4) * TAU, delay: 110 + k * 70 });
          G.explode(e.x + Math.cos(k * 1.6) * 30, e.y + Math.sin(k * 1.6) * 30, 's', { quiet: k > 0 });
        }
        if (e.splitT >= 100) { e.st = 'closed'; e.pt = 0; }
      }

      /* ---- rage trigger (the nucleus was hurt below ~35%): close up, split off small cells, speed up ---- */
      if (e.rage && !e.raged) {
        e.raged = true;
        e.spd = 1.35;
        e.split = true; // the 'open' state closes at once and continues into 'split'
        sfx('explodeL');
        G.shake = Math.max(G.shake, 6);
      }

      if (!P.alive) return;

      /* ---- attacks ---- */
      if (e.st === 'closed' || e.st === 'split') this.attackClosed(e);
      else if (e.st === 'open') this.attackOpen(e);
      // replace lost mini cells while enraged
      if (e.raged && e.st === 'closed') {
        e.miniCd = (e.miniCd || 220) - 1;
        if (e.miniCd <= 0) {
          let n = 0;
          for (const o of G.enemies) if (!o.dead && o.type === 's6_mini') n++;
          if (n < 3) G.spawn('s6_mini', { x: e.x, y: e.y, boss: e, ang: rnd(TAU), delay: 90 });
          e.miniCd = 260;
        }
      }
    },
    attackClosed(e) {
      // slow radial bursts
      if (e.charge > 0) {
        if (--e.charge === 0) {
          const n = e.rage ? 16 : 12;
          e.ringN = (e.ringN || 0) + 1;
          const ph = e.ringN % 2 ? Math.PI / n : 0;
          for (let i = 0; i < n; i++) {
            const a = ph + (i * TAU) / n;
            G.ebullet(e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, Math.cos(a) * 1.1, Math.sin(a) * 1.1, { spr: 'ebulletL', w: 6, h: 6, anim: 8, quiet: i > 0 });
          }
          if (e.rage) G.later(22, () => { if (!e.dead && G.player.alive) for (let i = 0; i < n; i++) { const a = ph + Math.PI / n + (i * TAU) / n; G.ebullet(e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, Math.cos(a) * 1.2, Math.sin(a) * 1.2, { spr: 'ebulletL', w: 6, h: 6, anim: 8, quiet: i > 0 }); } });
        }
      } else if (e.st === 'closed' && --e.burstCd <= 0) {
        e.charge = 24;
        e.burstCd = G.fireDelay(e.rage ? 92 : 112);
      }
      // floating spores from the ceiling
      if (e.st === 'closed' && --e.dropCd <= 0) {
        let n = 0;
        for (const o of G.enemies) if (!o.dead && o.type === 's6_drift') n++;
        if (n < (e.rage ? 3 : 2)) {
          const x = clamp(G.player.x + rnd(-60, 70), 40, 210);
          G.spawn('s6_drift', { x, y: s6CeilBot(G.camX + x) + 8, vy0: 0.5 });
        }
        e.dropCd = G.fireDelay(e.rage ? 90 : 135);
      }
    },
    attackOpen(e) {
      // rain of drops from the ceiling in waves that leave gaps
      if (--e.rainCd <= 0) {
        this.rain(e);
        e.rainCd = G.fireDelay(e.rage ? 92 : 110);
      }
      // aimed fans from the maw
      if (--e.fanCd <= 0) {
        const n = e.rage ? 5 : 3;
        G.fan(e.x - 36, e.y, n, e.rage ? 0.7 : 0.55, 1.4, { spr: 'ebullet', w: 4, h: 4 });
        e.fanCd = G.fireDelay(e.rage ? 66 : 86);
      }
    },
    rain(e) {
      const P = G.player;
      const step = e.rage ? 18 : 20;
      const half = e.rage ? 23 : 25;
      // one gap is within reach of the ship (but rarely right above it), the other is elsewhere
      const g1 = clamp(P.x + rnd(e.rage ? -40 : -48, e.rage ? 40 : 48), 36, 206);
      let g2 = rnd(30, 226);
      for (let k = 0; k < 6 && Math.abs(g2 - g1) < 90; k++) g2 = rnd(30, 226);
      sfx('ring');
      for (let x = 14; x <= 244; x += step) {
        if (Math.abs(x - g1) < half || Math.abs(x - g2) < half) continue;
        const y0 = s6CeilBot(G.camX + x) + 3;
        G.ebullet(x, y0, 0, 0, {
          spr: 's6_dripg', w: 4, h: 4, anim: 14, quiet: true,
          custom: (b) => {
            if (b.t < 44) {
              b.harmless = true;
              b.vy = 0;
              b.y = y0;
            } else if (b.t === 44) {
              b.harmless = false;
              b.spr = 's6_drip';
              b.w = 5;
              b.h = 7;
              b.anim = 5;
              b.vy = 1.55 * G.bulletMul();
            }
          },
        });
      }
    },
    onPartHurt(e, p) {
      if (p.name !== 'nucleus') return;
      if (!e.rage && p.hp <= p.max * 0.35) {
        e.rage = true;
        p.vuln = false; // it closes up at once: a breather for the player
      }
    },
    onPartDeath(e, p) {
      if (p.name === 'nucleus') G.kill(e);
    },
    gauge(e) {
      const n = e.parts[0];
      return n.dead ? 0 : Math.max(0, n.hp) / n.max;
    },
    onDeath(e) {
      G.fx.push({ k: 'fn', x: e.x, y: e.y, t: 0, life: 136, draw: (c, f) => ENEMIES.s6_nucleus.drawWreck(e, c, f) });
      for (let i = 0; i < 44; i++) {
        G.later(i * 3, () => {
          const a = rnd(TAU), r = rnd(6, 42);
          G.fx.push({ k: 'part', x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, vx: Math.cos(a) * rnd(0.3, 1.6), vy: Math.sin(a) * rnd(0.3, 1.6) - 0.3, life: rndi(30, 60), t: 0, col: pick(['#ffbdf0', '#f478c8', '#e880d8', '#ffffff']), big: chance(0.4) });
        });
      }
      G.bossDefeated(e);
    },
    drawWreck(e, c, f) {
      const jx = rndi(-1, 1), jy = rndi(-1, 1);
      Sprites.draw(c, 's6_nuc_body', f.x + jx, f.y + jy, { frame: (f.t >> 1) & 15, flash: (f.t >> 2) % 5 === 0 });
      Sprites.draw(c, 's6_nuc_dim', f.x - 14 + jx, f.y + jy, { flash: (f.t >> 2) % 3 === 0 });
      Sprites.draw(c, 's6_maw3', f.x - 29 + jx, f.y + jy);
      // the cell slowly deflates into a dark husk
      c.globalAlpha = 0.55 * Math.min(1, f.t / 125);
      c.fillStyle = '#1c0630';
      s6Disc(c, f.x + jx, f.y + jy, 40);
      c.globalAlpha = 1;
    },
    draw(e, c) {
      const f = Math.floor(e.wob) & 15;
      Sprites.draw(c, 's6_nuc_body', e.x, e.y, { frame: f });
      // organelles drifting inside the cytoplasm
      for (let i = 0; i < 5; i++) {
        const a = e.pt * 0.006 * (i % 2 ? -1 : 1) + i * 1.26;
        const r = 24 + (i % 3) * 5;
        Sprites.draw(c, 's6_organ', e.x + 8 + Math.cos(a) * r * 0.85, e.y + Math.sin(a) * r * 0.8, { frame: (e.pt >> 4) & 1 });
      }
      const n = e.parts[0];
      const openAmt = e.open;
      // wounds open up as the nucleus loses health
      const hpk = n.hp / n.max;
      S6_WOUNDS.forEach(([thr, ox, oy]) => {
        if (hpk < thr) Sprites.draw(c, 's6_wound', e.x + ox, e.y + oy);
      });
      if (!n.dead) {
        const hot = e.st === 'open' || (e.st === 'opening' && e.open > 2.2);
        Sprites.draw(c, hot ? 's6_nuc_hot' : 's6_nuc_dim', e.x + n.ox, e.y, { frame: (e.pt >> 3) & 1, flash: n.flash > 0 });
        if (!hot) Sprites.draw(c, 's6_frost' + (openAmt > 1.6 ? 2 : openAmt > 0.6 ? 1 : 0), e.x + n.ox, e.y);
        else if (e.st === 'open') {
          // pulsing halo: "shoot here"
          c.fillStyle = (e.pt >> 3) & 1 ? '#ffe646' : '#ff9424';
          s6Ring(c, e.x + n.ox, e.y, 17 + ((e.pt >> 4) & 1));
        }
      }
      Sprites.draw(c, 's6_maw' + clamp(Math.round(openAmt), 0, 3), e.x - 29, e.y);
      // telegraph for the radial burst: the membrane swells with light
      if (e.charge > 0) {
        c.fillStyle = (e.charge >> 1) & 1 ? '#ffffff' : '#ffbdf0';
        s6Ring(c, e.x, e.y, S6_BODY_R + 2 + ((24 - e.charge) >> 3));
      }
      if (e.st === 'split') {
        c.fillStyle = (e.pt >> 2) & 1 ? '#ffffff' : '#f478c8';
        s6Ring(c, e.x, e.y, S6_BODY_R + 1);
      }
    },
  };

  /* =============================================================
   * SCRIPT HELPERS
   * ============================================================= */
  /** y of the passage centre where a wave that spawns at camX enters, plus an offset */
  const s6Vy = (camX, off) => Math.round(s6Pass(camX + W + 16).c + off);

  /**
   * A CELL WALL made of s6_cell blobs across the passage.
   *   o.cols   number of columns (1-3)           o.size  cell diameter (default 13)
   *   o.gaps   [{y, h}] free gaps (screen y)     (none = closed wall: shoot your way through)
   *   o.div    {n, at, atUp, atDown, warn, grow, minGap, sides:['above','below'], cols:'all'|'front'|'back'}
   *            edge cells next to a gap divide (mitosis) towards the gap
   *   o.carry  {col, row}  capsule carrier cell (row counted from the top of that column)
   */
  function s6Wall(S, wx, o) {
    const size = o.size || 13, cols = o.cols || 2, sp = size * 0.88;
    const id = o.id || 'w' + wx;
    const rng = makeRng(o.seed || wx * 7 + 3);
    const gaps = (o.gaps || []).slice().sort((a, b) => a.y - b.y);
    const div = o.div;
    for (let k = 0; k < cols; k++) {
      const cwx = Math.round(wx + (k - (cols - 1) / 2) * size * 0.82);
      const cb = s6CeilBot(cwx), ft = s6FloorTop(cwx);
      // solid ranges between the gaps
      const ranges = [];
      let a = cb - 1;
      gaps.forEach((g, i) => {
        ranges.push({ a, b: g.y - g.h / 2, edgeB: true, edgeA: i > 0 });
        a = g.y + g.h / 2;
      });
      ranges.push({ a, b: ft + 1, edgeA: gaps.length > 0, edgeB: false });
      const colCells = [];
      for (const r of ranges) {
        const h = r.b - r.a;
        if (h < 4) continue;
        const cells = [];
        const shift = k % 2 ? sp * 0.5 : 0;
        if (r.edgeB && !r.edgeA) {
          // above a gap: build upwards from the gap edge
          for (let y = r.b - size / 2 - shift * (gaps.length ? 1 : 0); ; y -= sp) {
            cells.push({ y, edge: cells.length === 0 ? 'above' : null });
            if (y - size / 2 <= r.a + 2) break;
          }
        } else if (r.edgeA && !r.edgeB) {
          for (let y = r.a + size / 2 + shift * (gaps.length ? 1 : 0); ; y += sp) {
            cells.push({ y, edge: cells.length === 0 ? 'below' : null });
            if (y + size / 2 >= r.b - 2) break;
          }
        } else if (r.edgeA && r.edgeB) {
          // a band between two gaps: fit exactly
          const n = Math.max(1, Math.round(h / sp));
          const sz = n === 1 ? h : size;
          for (let j = 0; j < n; j++) {
            const y = n === 1 ? r.a + h / 2 : r.a + sz / 2 + (j * (h - sz)) / (n - 1);
            cells.push({ y, edge: j === 0 ? 'below' : j === n - 1 ? 'above' : null, sz });
          }
        } else {
          // closed wall: spread evenly from ceiling to floor
          const n = Math.max(2, Math.ceil(h / sp));
          for (let j = 0; j < n; j++) cells.push({ y: r.a + size / 2 - 2 + (j * (h - size + 4)) / (n - 1), edge: null });
        }
        for (const c of cells) colCells.push(c);
      }
      colCells.sort((p, q) => p.y - q.y);
      colCells.forEach((c, row) => {
        const isFront = k === 0;
        const jit = c.edge || c.sz ? 0 : rng() < 0.28 ? -1 : rng() < 0.28 ? 1 : 0;
        const co = {
          size: (c.sz || size) + jit, hp: o.hp ? o.hp[Math.min(k, o.hp.length - 1)] : isFront ? 2 : 3,
          wall: id, wob: 0.45 + rng() * 0.3,
        };
        if (o.carry && o.carry.col === k && o.carry.row === row) co.carry = true;
        if (div && c.edge) {
          const sideOk = !div.sides || div.sides.indexOf(c.edge) >= 0;
          const colOk = !div.cols || div.cols === 'all' || (div.cols === 'front' ? isFront : div.cols === 'back' ? k === cols - 1 : true);
          if (sideOk && colOk) {
            co.divide = {
              n: div.n || 1, dx: 0, dy: c.edge === 'above' ? 1 : -1, warn: div.warn || 56, grow: div.grow || 90, minGap: div.minGap || 30,
              at: (c.edge === 'above' ? div.atUp : div.atDown) || div.at || 205,
            };
          }
        }
        S.fixed(cwx + (c.edge ? 0 : rng() < 0.4 ? 1 : 0), Math.round(c.y), 's6_cell', co);
      });
    }
  }
  const s6Gap = (wx, off, h) => ({ y: Math.round(s6Pass(wx).c + off), h });

  const s6Script = (S) => {
    const V = (camX, n, off, o) => S.wave(camX, 's6_virus', Object.assign({ n, gap: 13, y: s6Vy(camX, off) }, o));
    const A = (camX, off, o) => S.wave(camX, 's6_amoeba', Object.assign({ n: 1, y: s6Vy(camX, off), sz: 0 }, o));
    const E = (wx, off, o) => S.fixed(wx, Math.round(s6Pass(wx).c + off), 's6_enzyme', o || {});
    const cell = (wx, off, o) => S.fixed(wx, Math.round(s6Pass(wx).c + off), 's6_cell', Object.assign({ size: 13, hp: 2, wob: 0.8 }, o));

    /* ---- ACT 1: entry, first membrane ---- */
    V(210, 4, -30);
    V(320, 5, 26, { carry: 'last' });
    V(450, 5, 0, { each: (i) => ({ y: s6Vy(450, -46 + i * 9), vy0: 0.4 }) });
    cell(560, -28);
    cell(590, 22);
    cell(620, -4, { size: 15, hp: 3 });
    V(600, 4, 34, { carry: 'last' });
    s6Wall(S, 720, { id: 'w1', cols: 1, size: 14, gaps: [s6Gap(720, 0, 64)], hp: [2] });
    V(690, 5, -32);
    V(770, 4, 20);

    /* ---- ACT 2: membrane channel ---- */
    V(980, 4, 0, { carry: 'last' });
    V(1040, 5, -34, { weave: 1 });
    A(1090, 0);
    s6Wall(S, 1180, { id: 'w2', cols: 2, size: 13, gaps: [s6Gap(1180, -22, 62)], div: { n: 1, atDown: 216, warn: 64, minGap: 40, sides: ['below'] } }); // first mitosis: gentle, the gap stays wide
    cell(1218, 24, { carry: true, size: 13, hp: 2 });
    V(1250, 5, 30, { carry: 'last' });
    E(1330, -28);
    V(1330, 5, -20);
    s6Wall(S, 1470, { id: 'w3', cols: 2, size: 13, hp: [2, 2], carry: { col: 1, row: 4 } });
    V(1420, 5, 26, { each: (i) => ({ y: s6Vy(1420, 44 - i * 10), vy0: -0.3 }) });
    S.ground(1580, 's6_spore', { count: 5 });
    V(1540, 4, -30, { carry: 'last' });

    /* ---- ACT 3: winding tubule, dividing walls ---- */
    V(1760, 5, -32, { weave: 1, carry: 'last' });
    A(1810, -18);
    V(1850, 5, 30, { carry: 'last' });
    s6Wall(S, 1980, { id: 'w4', cols: 2, size: 14, gaps: [s6Gap(1980, 0, 56)], div: { n: 1, atUp: 214, atDown: 196, warn: 60, minGap: 30 } });
    V(2010, 6, 0, { each: (i) => ({ y: s6Vy(2010, (i % 2 ? 1 : -1) * (26 + i * 4)), vy0: i % 2 ? -0.5 : 0.5 }) });
    E(2090, -30);
    E(2120, 32);
    S.ceil(2170, 's6_spore', { count: 5 });
    S.ground(2210, 's6_spore', { count: 5 });
    V(2130, 5, 0, { carry: 'last' });
    s6Wall(S, 2262, { id: 'w5', cols: 2, size: 13, gaps: [s6Gap(2262, 6, 60)], div: { n: 2, at: 248, warn: 50, grow: 80, minGap: 34, sides: ['above'] }, carry: { col: 1, row: 2 } });

    /* ---- ACT 4: organelle chamber (calm) then the dense finale ---- */
    V(2480, 5, 0, { carry: 'last' });
    A(2530, -30, { carry: true });
    V(2590, 6, 30, { weave: 1 });
    s6Wall(S, 2690, { id: 'w6a', cols: 2, size: 13, gaps: [s6Gap(2690, -24, 54)], div: { n: 1, atUp: 216, atDown: 204, warn: 56, minGap: 30 } });
    s6Wall(S, 2742, { id: 'w6b', cols: 2, size: 13, gaps: [s6Gap(2742, 24, 54)], div: { n: 1, atUp: 214, atDown: 202, warn: 56, minGap: 30 } });
    V(2660, 5, -34);
    E(2800, -30);
    E(2822, 32, { burst: 3 });
    A(2770, 20);
    S.ground(2860, 's6_spore', { count: 6 });
    S.ceil(2900, 's6_spore', { count: 6 });
    V(2880, 5, 0, { carry: 'last' });
    s6Wall(S, 2990, { id: 'w7', cols: 3, size: 13, hp: [2, 2, 2], carry: { col: 2, row: 4 } });
    V(2960, 6, -28, { weave: 1 });
    V(3040, 6, 0, { each: (i) => ({ y: s6Vy(3040, (i % 2 ? 1 : -1) * (24 + i * 4)), vy0: i % 2 ? -0.5 : 0.5 }) });
    E(3090, -28);
    E(3125, 28);
    A(3090, 0);
    s6Wall(S, 3200, { id: 'w8', cols: 3, size: 12, gaps: [s6Gap(3200, -25, 38), s6Gap(3200, 27, 38)], div: { n: 1, atUp: 214, atDown: 202, warn: 56, minGap: 30 } });
    S.ceil(3140, 's6_spore', { count: 5 });
    V(3170, 5, 0, { carry: 'last' });
    S.ground(3255, 's6_spore', { count: 5 });
    A(3235, 12, { sz: 1 });
    s6Wall(S, 3312, { id: 'w9', cols: 2, size: 14, gaps: [s6Gap(3312, 0, 56)], div: { n: 1, atUp: 214, atDown: 206, warn: 56, minGap: 30 } });
    V(3290, 5, -30);

    /* ---- ACT 5: recover before the boss (slow, spread-out squads with carriers) ---- */
    const easy = { speed: 1.0, turn: 0.022, homeT: 70 };
    V(3470, 4, -8, Object.assign({ carry: 'last', gap: 15 }, easy));
    V(3520, 4, 28, Object.assign({ carry: 'last', gap: 15 }, easy));
    V(3565, 4, -30, Object.assign({ carry: 'last', gap: 15 }, easy));

    S.boss(S6_BOSS_X, 's6_nucleus', {});
  };

  STAGES.push({
    id: 6,
    name: 'CELL',
    sub: 'INSIDE THE GIANT CELL',
    music: 'stage6',
    bossMusic: 'boss',
    scroll: 0.65,
    bossX: S6_BOSS_X,
    checkpoints: [0, 860, 1640, 2360, 3360],
    terrain: s6Terrain,
    background: s6Background,
    script: s6Script,
  });
})();
