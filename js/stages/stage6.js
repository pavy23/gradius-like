'use strict';
/* =============================================================
 * STAGE 6 — CELL
 * Inside a giant living cell: a winding intracellular passage,
 * cytoplasm background with drifting vacuoles, cilia fringes,
 * destructible CELL WALLS (some divide: mitosis!), viruses,
 * amoebas that split, spore pods, floating enzyme turrets and
 * the boss NUCLEUS (a membrane-wrapped cell with a maw).
 * ============================================================= */
(function stage6() {
  const BOSS_X = 3700;
  const LEN = BOSS_X + W + 120;

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
  const PASS = [
    [0, 112, 156], [260, 110, 150], [480, 104, 138], [700, 108, 130], [900, 114, 132], [1100, 112, 134],
    [1260, 100, 126], [1420, 90, 124], [1580, 96, 124], [1720, 114, 128], [1900, 128, 126], [2060, 118, 126],
    [2200, 98, 128], [2330, 106, 150], [2450, 110, 172], [2650, 108, 176], [2800, 112, 152], [2940, 100, 130],
    [3080, 112, 130], [3220, 126, 128], [3380, 112, 136], [3540, 112, 156], [3640, 112, 164], [LEN, 112, 164],
  ];
  const s6Pass = (x) => {
    x = clamp(x, 0, LEN);
    let i = 0;
    while (i < PASS.length - 2 && x >= PASS[i + 1][0]) i++;
    const p0 = PASS[Math.max(0, i - 1)], p1 = PASS[i], p2 = PASS[i + 1], p3 = PASS[Math.min(PASS.length - 1, i + 2)];
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
  const s6Lobe = (x, ph, lam, amp) => amp * Math.pow(Math.abs(Math.sin((Math.PI * (x + ph)) / lam)), 0.7);
  /** amplitude taper: bumps fade out for the flat boss arena */
  const s6Taper = (x) => clamp((BOSS_X - 40 - x) / 120, 0, 1);
  const s6Hill = (x, x0, w, h) => {
    const t = Math.abs(x - x0) / (w / 2);
    return t >= 1 ? 0 : h * Math.sqrt(1 - t * t);
  };
  // extra rounded lobes that shape the organelle chamber
  const s6FloorBumps = (x) => s6Hill(x, 2590, 120, 44) + s6Hill(x, 2790, 90, 30);
  const s6CeilBumps = (x) => s6Hill(x, 2530, 90, 34) + s6Hill(x, 2700, 110, 40);

  const s6FloorH = (x) => {
    const p = s6Pass(x);
    const tp = s6Taper(x);
    const wob = tp * (s6Lobe(x, 0, 38, 7) + s6Lobe(x, 17, 23, 3));
    return Math.max(28, H - (p.c + p.g / 2) + wob + tp * s6FloorBumps(x));
  };
  const s6CeilH = (x) => {
    const p = s6Pass(x);
    const tp = s6Taper(x);
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
    s6BakeCell('s6_cellp' + D, D, S6_CELL_PALS.p);
  }

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
      const rad = (th) => 1 + 0.13 * Math.sin(2 * th + seed + ph) + 0.1 * Math.sin(3 * th + seed * 2 - ph) + 0.06 * Math.sin(5 * th + seed * 3 + 2 * ph);
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
      d.circle(nx - 0.4, ny - 0.4, nr - 0.9, '#9a3c94');
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
  s6BakeAmoeba('s6_amoeba0', 34, 30, 14, 0.3);
  s6BakeAmoeba('s6_amoeba1', 24, 22, 9.5, 1.7);
  s6BakeAmoeba('s6_amoeba2', 16, 15, 6, 2.9);

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

  // ---- pops (death effects, 5 frames) ----
  function s6BakePop(name, size, cols) {
    Sprites.painted(name, size, size, 5, (d, f) => {
      const c = (size - 1) / 2, mx = size / 2 - 1;
      if (f === 0) {
        d.circle(c, c, 3.2, cols[2]);
        d.circle(c, c, 2.2, cols[1]);
        d.circle(c, c, 1.2, cols[0]);
        return;
      }
      const r = 2 + f * ((mx - 2) / 4);
      if (f <= 2) d.ring(c, c, r, 1.1, f === 1 ? cols[0] : cols[1]);
      const n = 8;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + 0.3;
        const rr = r + (k % 2 ? 1.6 : 0.2) + (f > 2 ? 1 : 0);
        const x = Math.round(c + Math.cos(a) * rr), y = Math.round(c + Math.sin(a) * rr);
        d.px(x, y, f < 3 ? cols[0] : cols[k % 2 ? 1 : 2]);
        if (f < 2) d.px(x + 1, y, cols[1]);
      }
    });
  }
  s6BakePop('s6_pop_n', 20, ['#ffffff', '#6cf0f8', '#2a96c8']);
  s6BakePop('s6_pop_c', 20, ['#ffffff', '#ff9a8a', '#f03a3a']);
  s6BakePop('s6_pop_g', 20, ['#f4ffb0', '#8cf03c', '#34b04a']);
  s6BakePop('s6_pop_a', 30, ['#fff6e0', '#ffb890', '#c8745c']);
  s6BakePop('s6_pop_p', 26, ['#ffffff', '#f478c8', '#a83a84']);
  s6BakePop('s6_pop_w', 26, ['#ffffff', '#c8d4ff', '#7a8a9c']);

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
        let col = q > 0.72 ? '#7a2a6c' : '#c2508c';
        const inner = Math.abs(ny) < 0.62;
        if (q <= 0.72 && inner) {
          const k = ((x + (f ? 2 : 0)) % 5 + 5) % 5;
          if (k === 0 || (k === 1 && ((y + 1) & 1))) col = '#7a2a6c';
          else if (y < cy - 1) col = '#e07ab0';
        }
        d.px(x, y, col);
      }
    }
  });
  Sprites.painted('s6_dot', 5, 5, 1, (d) => {
    d.circle(2, 2, 1.6, '#ff9ad0');
    d.px(2, 2, '#ffe6f6');
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

  const s6Terrain = () => ({
    length: LEN,
    floor: [{ type: 'fn', x0: 0, x1: LEN - 1, fn: s6FloorH }],
    ceil: [{ type: 'fn', x0: 0, x1: LEN - 1, fn: s6CeilH }],
    decorate: s6DecorateTerrain,
    skin: {
      kind: 'cell', tw: 96, th: 96, cells: 11, nr: 3,
      pal: ['#2c0e40', '#48186a', '#66268a', '#8438a8', '#a850c0'],
      membrane: '#24093a', nucleus: '#e8609a',
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
      const kind = k % 3, ang = (rng() - 0.5) * 1.1, len = 22 + rng() * 14, rad = 8 + rng() * 5;
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
          const r = 12 + rng() * 6;
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
          if (wx > BOSS_X + W || wx < 40) continue;
          const zone = 0.5 + 0.5 * Math.sin(wx * 0.0062 + 1.3) + 0.25 * Math.sin(wx * 0.017);
          if (zone < 0.42) continue;
          const h1 = ((wx * 2654435761) >>> 0) / 4294967296;
          const len = 4 + Math.floor(h1 * 6 * clamp(zone, 0.5, 1.2));
          const sway = Math.sin(t * 0.06 + wx * 0.31) * 1.6;
          const x = wx - camX;
          const yf = T.floorTopArr[wx], yc = T.ceilBotArr[wx];
          for (const [y0, dir] of [[yf, -1], [yc, 1]]) {
            if (y0 <= 0 || y0 >= H) continue;
            ctx.fillStyle = 'rgba(232,120,214,0.55)';
            ctx.fillRect(x, y0 + dir * -1 + (dir < 0 ? -1 : 0), 1, 1);
            for (let k = 1; k <= len; k++) {
              const o = Math.round(sway * (k / len) * (k / len));
              ctx.fillStyle = k > len - 2 ? 'rgba(255,190,240,0.75)' : 'rgba(224,110,208,0.5)';
              ctx.fillRect(x + o, y0 + dir * k - (dir < 0 ? 1 : 0), 1, 1);
            }
          }
        }
      },
    };
  }

  const s6Background = () => {
    const glow = s6BakeGlow();
    const cyto = s6BakeCyto(512);
    return Backgrounds.make([
      { kind: 'gradient', stops: S6_GRAD, steps: 20 },
      { kind: 'custom', draw: (ctx, camX, t) => { ctx.globalAlpha = 0.09 + 0.07 * (0.5 + 0.5 * Math.sin(t * 0.03)); ctx.drawImage(glow, 0, 0); ctx.globalAlpha = 1; } },
      { kind: 'custom', draw: (ctx, camX, t) => {
        const off = Math.floor(camX * 0.05 + t * 0.06) % 512;
        ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 0.021 + 1);
        ctx.drawImage(cyto, -off, 0);
        if (512 - off < W) ctx.drawImage(cyto, 512 - off, 0);
        ctx.globalAlpha = 1;
      } },
      { kind: 'strip', build: (P) => s6BakeOrganelles(P, 11, 0.8, 1.35), period: 512, speed: 0.1 },
      s6BubbleLayer(21, 6, 0.14, 12, 22, 0.1, 0.05, 0.12),
      { kind: 'strip', build: (P) => s6BakeOrganelles(P, 47, 0.7, 1.55), period: 512, speed: 0.22 },
      s6BubbleLayer(22, 9, 0.3, 5, 11, 0.12, 0.1, 0.22),
      s6CiliaLayer(),
      s6BubbleLayer(23, 12, 0.55, 2, 4, 0.16, 0.2, 0.42),
    ]);
  };

  STAGES.push({
    id: 6,
    name: 'CELL',
    sub: 'INSIDE THE GIANT CELL',
    music: 'stage6',
    bossMusic: 'boss',
    scroll: 0.65,
    bossX: BOSS_X,
    checkpoints: [0, 880, 1720, 2450, 3380],
    terrain: s6Terrain,
    background: s6Background,
    script(S) {
      S.wave(300, 'wave', { n: 3, y: 100 });
    },
  });
})();
