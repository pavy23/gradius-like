'use strict';
/* =============================================================
 * STAGE 5 — TENTACLE
 * Inside a living alien body: a glistening flesh cavern with vein
 * networks, wall-anchored tentacles you can cut apart, polyp pods
 * that burst into spores, blinking eye pods, leech swimmers and
 * sticky membranes. Mid-boss: the Tentacle Mass. Boss: Guardian Core.
 * ============================================================= */
(function stage5() {
  /* ------------------------------------------------------------
   * palette
   * ------------------------------------------------------------ */
  const TC = { out: '#160a2a', dark: '#4a1a80', mid: '#8a46c6', lite: '#c890f0', spec: '#fff0ff', sk: '#ffc8dc', skD: '#a8407a' };

  /* ------------------------------------------------------------
   * small helpers
   * ------------------------------------------------------------ */
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const s5_smooth = (t) => t * t * (3 - 2 * t);
  const s5_angDiff = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  };
  /** keep an aim angle inside the free half plane of a wall-anchored thing (up = -1 grows upward) */
  const s5_clampAim = (a, up) => {
    const m = 0.3;
    if (up < 0) {
      if (a > 0) return a > Math.PI / 2 ? -Math.PI + m : -m;
      return clamp(a, -Math.PI + m, -m);
    }
    if (a < 0) return a < -Math.PI / 2 ? Math.PI - m : m;
    return clamp(a, m, Math.PI - m);
  };
  /** true while the ship is in its respawn grace period: enemies hold their fire (first seconds after a checkpoint stay harmless) */
  const s5_grace = () => G.player.inv > 0 && G.player.inv < 1000;
  /** middle of the free corridor at a world x */
  const s5_mid = (wx) => (G.terrain.ceilBottom(wx) + G.terrain.floorTop(wx)) / 2;

  /** filled pixel disc (canvas rects, no antialiasing) */
  function s5_disc(c, cx, cy, r) {
    const R = Math.floor(r), r2 = r * r + 0.25;
    for (let dy = -R; dy <= R; dy++) {
      const hw = Math.floor(Math.sqrt(r2 - dy * dy));
      c.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
    }
  }
  /** 1px pixel line */
  function s5_pline(c, x0, y0, x1, y1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 64; n++) {
      c.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  const AVOID = [0.22, -0.22, 0.45, -0.45, 0.7, -0.7, 1.0, -1.0, 1.4, -1.4];
  /** end point of a chain segment; bends away from solid terrain so the flesh follows the walls */
  function s5_reach(from, a, len, avoid, out) {
    const T = G.terrain, cam = G.camX;
    let nx = from.x + Math.cos(a) * len, ny = from.y + Math.sin(a) * len;
    if (avoid && (T.solid(cam + nx, ny) || T.solid(cam + (from.x + nx) / 2, (from.y + ny) / 2))) {
      for (const da of AVOID) {
        const x2 = from.x + Math.cos(a + da) * len, y2 = from.y + Math.sin(a + da) * len;
        if (!T.solid(cam + x2, y2) && !T.solid(cam + (from.x + x2) / 2, (from.y + y2) / 2)) { nx = x2; ny = y2; break; }
      }
    }
    out.x = nx; out.y = ny;
  }
  /** hp helper: difficulty / loop scaling for part hit points */
  const s5_hp = (v) => Math.max(1, Math.round(v * G.diff.hp * (1 + 0.25 * G.loop)));
  /** everything beyond part `idx` of a chain is severed: staggered mini explosions + points */
  function s5_sever(e, list, idx) {
    let delay = 3;
    for (let j = idx + 1; j < list.length; j++) {
      const q = list[j];
      if (q.dead) continue;
      q.dead = true;
      const qx = e.x + q.ox, qy = e.y + q.oy;
      G.later(delay, () => G.explode(qx, qy, 's', { scroll: e.attach ? true : false, quiet: (j & 1) === 1 }));
      for (let k = 0; k < 4; k++) {
        G.fx.push({ k: 'part', x: qx, y: qy, vx: rnd(-1.1, 1.1), vy: rnd(-1.6, 0.6), life: rndi(18, 36), t: 0, col: pick(['#c890f0', '#8a46c6', '#ff8ab0', '#ffffff']), big: chance(0.35) });
      }
      G.addScore(q.score || 40);
      delay += 3;
    }
  }

  /**
   * Draw a chain of joints as one smooth 3-tone tube with a single dark outline.
   * J: joints {x,y} (0 = base), R: radius per joint, n: live segment count (joints 0..n)
   * o: {pal, flash:[bool], glow:0..1, side:±1, stump:bool, tip:true}
   */
  function s5_tube(c, J, R, n, o) {
    const P = o.pal;
    const pts = [];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        const t = k / 3;
        pts.push({ x: J[i].x + (J[i + 1].x - J[i].x) * t, y: J[i].y + (J[i + 1].y - J[i].y) * t, r: R[i] + (R[i + 1] - R[i]) * t });
      }
    }
    pts.push({ x: J[n].x, y: J[n].y, r: R[n] });
    const cx = (q) => Math.round(q.x), cy = (q) => Math.round(q.y);
    c.fillStyle = P.out;
    for (const q of pts) s5_disc(c, cx(q), cy(q), q.r + 1);
    c.fillStyle = P.dark;
    for (const q of pts) s5_disc(c, cx(q), cy(q), q.r);
    c.fillStyle = P.mid;
    for (const q of pts) s5_disc(c, cx(q) - 1, cy(q) - 1, Math.max(0.5, q.r - 1.3));
    c.fillStyle = P.lite;
    for (const q of pts) {
      const k = Math.round(q.r * 0.38);
      s5_disc(c, cx(q) - k, cy(q) - k, Math.max(0.5, q.r * 0.42));
    }
    // ring grooves + suckers
    for (let i = 1; i <= n; i++) {
      const a = J[i - 1], b = J[i];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const tx = dx / len, ty = dy / len, nx = -ty, ny = tx;
      const r = R[i];
      if (i < n || !o.tip) {
        const mx = (a.x + b.x) / 2 + tx * 0.5, my = (a.y + b.y) / 2 + ty * 0.5;
        const rr = (R[i - 1] + R[i]) / 2;
        c.fillStyle = P.dark;
        s5_pline(c, mx - nx * rr * 0.75, my - ny * rr * 0.75, mx + nx * rr * 0.75, my + ny * rr * 0.75);
      }
      // sucker: pale dot on one side
      if (r > 2.2 && i < n) {
        const sx = Math.round(b.x + nx * o.side * r * 0.42), sy = Math.round(b.y + ny * o.side * r * 0.42);
        c.fillStyle = P.skD;
        c.fillRect(sx, sy + 1, 2, 1);
        c.fillStyle = P.sk;
        c.fillRect(sx, sy, 2, 1);
      }
      // wet glint
      if (i % 2 === 1) {
        c.fillStyle = P.spec;
        const k = Math.round(r * 0.5);
        c.fillRect(Math.round(b.x) - k, Math.round(b.y) - k, 1, 1);
      }
    }
    // flash silhouettes
    if (o.flash) {
      c.fillStyle = '#ffffff';
      for (let i = 1; i <= n; i++) if (o.flash[i]) s5_disc(c, Math.round(J[i].x), Math.round(J[i].y), R[i]);
    }
  }

  /** glowing stinger / tip bulb (carriers get a red capsule-coloured bulb) */
  function s5_tip(c, x, y, r, glow, t, carrier) {
    x = Math.round(x); y = Math.round(y);
    if (carrier) glow = Math.max(glow, 0.25 + 0.2 * Math.sin(t * 0.15));
    if (glow > 0) {
      c.globalAlpha = 0.28 + 0.3 * glow;
      c.fillStyle = carrier ? '#ff3a3a' : '#ff7a20';
      s5_disc(c, x, y, r + 2 + glow * 4);
      c.globalAlpha = 0.5 + 0.3 * glow;
      c.fillStyle = carrier ? '#ff9a7a' : '#ffc040';
      s5_disc(c, x, y, r + 0.6 + glow * 1.6);
      c.globalAlpha = 1;
    }
    c.fillStyle = '#160a2a';
    s5_disc(c, x, y, r);
    c.fillStyle = carrier ? '#a01c2c' : '#b4400e';
    s5_disc(c, x, y, r - 1);
    c.fillStyle = carrier ? '#f03a3a' : glow > 0.5 ? '#ff9424' : '#e8701c';
    s5_disc(c, x - 1, y - 1, Math.max(0.5, r - 2));
    c.fillStyle = carrier ? '#ffb040' : glow > 0.45 ? '#fff2a8' : '#ffc040';
    s5_disc(c, x - 1, y - 1, Math.max(0.5, r - 3.2));
    c.fillStyle = '#ffffff';
    c.fillRect(x - 2, y - 2, 1, 1);
    if (glow > 0.6) c.fillRect(x - 1, y - 1, 2, 2);
  }

  /* ------------------------------------------------------------
   * sprite art
   * ------------------------------------------------------------ */
  // tentacle root: a flared, folded collar of flesh where the tentacle leaves the wall (floor version, flipped for the ceiling)
  Sprites.painted('s5_root', 26, 12, 1, (d) => {
    const cx = 12.5;
    const hwAt = (y) => (y <= 8 ? 7 + 5.5 * Math.exp(-(8 - y) / 3.2) : 12.5 * Math.sqrt(Math.max(0.04, 1 - Math.pow((y - 8) / 4.5, 2))));
    for (let y = 0; y < 12; y++) {
      const hw = hwAt(y);
      const l = Math.round(cx - hw), r = Math.round(cx + hw);
      d.hline(l, r - 1, y, '#341260');
      d.hline(l + 1, r - 3, y, '#5e2e9c');
      if (y < 9) d.hline(l + 1, l + 2, y, '#9a62d0'); // lit left flank
      if (y < 9) d.px(r - 2, y, '#4a2088');
    }
    // folds running down the flare
    for (const k of [-0.75, -0.42, 0.42, 0.75]) {
      for (let y = 3; y < 10; y++) {
        const hw = hwAt(y);
        d.px(Math.round(cx + hw * k), y, '#3e1a70');
      }
    }
    // wet glints
    d.px(4, 6, '#e4c4fa'); d.px(5, 5, '#e4c4fa'); d.px(21, 7, '#b88af0');
    d.outline('#160a2e');
  });

  // polyp pod (floor version; flipped on the ceiling): frames idle / swollen / about to burst
  const POLYP = { out: '#1c2408', dark: '#56680e', mid: '#a0b82a', lite: '#dcf05c', hi: '#fffff0', spot: '#3c4c0a', spore: '#ff9424', sporeD: '#c05412', glow: '#ffe646', lip: '#ff8ab0', lipD: '#b03256', mouth: '#4a0c20', collar: '#5a1a4a', collarL: '#96406e', feel: '#c8e84c' };
  Sprites.painted('s5_polyp', 22, 22, 3, (d, f) => {
    const sw = [0, 0.8, 1.6][f];
    // fleshy collar around the base
    d.ellipse(11, 20, 9.4, 2.6, POLYP.collar);
    d.ellipse(11, 19.6, 8.6, 1.9, POLYP.collarL);
    d.ellipse(11, 20, 6, 1.0, POLYP.collar);
    // stalk
    d.rect(8, 15, 6, 5, POLYP.dark);
    d.rect(8, 15, 3, 5, POLYP.mid);
    // bulb, widest at the middle
    d.ellipse(11, 11.5, 7.6 + sw, 6.6 + sw * 0.8, POLYP.dark);
    d.ellipse(10.4, 11, 6.7 + sw, 5.8 + sw * 0.8, POLYP.mid);
    d.ellipse(9.2, 9.6, 4.4 + sw * 0.5, 3.4 + sw * 0.4, POLYP.lite);
    d.px(7, 8, POLYP.hi); d.px(8, 7, POLYP.hi); d.px(6, 9, POLYP.hi);
    // speckles and glowing spores seen through the skin
    d.px(14, 13, POLYP.spot); d.px(15, 11, POLYP.spot); d.px(6, 13, POLYP.spot); d.px(12, 15, POLYP.spot);
    const sc = f === 2 ? POLYP.glow : POLYP.spore;
    d.px(11, 12, POLYP.sporeD); d.px(12, 12, sc); d.px(11, 11, sc);
    d.px(14, 9, POLYP.sporeD); d.px(14, 8, sc);
    d.px(8, 13, POLYP.sporeD); d.px(8, 12, sc);
    // crown: lips and feelers around the mouth
    const my = 4.6 - sw * 0.5;
    d.ellipse(11, my + 0.6, 5.2 + sw * 0.6, 2.2 + sw * 0.4, POLYP.lipD);
    d.ellipse(11, my, 4.7 + sw * 0.6, 1.8 + sw * 0.4, POLYP.lip);
    d.ellipse(11, my + 0.2, 3.0 + sw * 0.5, 1.0 + sw * 0.5, POLYP.mouth);
    if (f === 2) d.px(11, my, POLYP.glow);
    const fl = f === 0 ? 0 : f === 1 ? 1 : 2;
    d.line(6, my, 4 - fl, my - 3 - fl, POLYP.feel); d.px(4 - fl, my - 3 - fl, POLYP.hi);
    d.line(8, my - 1, 7 - fl, my - 4 - fl, POLYP.feel); d.px(7 - fl, my - 4 - fl, POLYP.hi);
    d.line(14, my - 1, 15 + fl, my - 4 - fl, POLYP.feel); d.px(15 + fl, my - 4 - fl, POLYP.hi);
    d.line(16, my, 18 + fl, my - 3 - fl, POLYP.feel); d.px(18 + fl, my - 3 - fl, POLYP.hi);
    d.outline(POLYP.out);
  });
  Sprites.recolor('s5_polyp', 's5_polyp_c', {
    '#56680e': '#a01c2c', '#a0b82a': '#f03a3a', '#dcf05c': '#ff9424', '#1c2408': '#2a0810', '#ff9424': '#ffe646', '#c05412': '#ff9424', '#c8e84c': '#ffd040', '#3c4c0a': '#7a1020',
  });

  // eye: sclera (below), lid ring with an opening of 4 sizes (above); the iris is drawn between them
  function s5_bakeEye(ballName, lidName, S, lp) {
    const k = S / 22, c = (S - 1) / 2;
    Sprites.painted(ballName, S, S, 1, (d) => {
      d.ellipse(c, c, 8.6 * k, 7.6 * k, '#b87a86');
      d.ellipse(c - 0.4, c - 0.4, 8.0 * k, 7.0 * k, '#f0d0c8');
      d.ellipse(c - 0.8, c - 0.8, 7.0 * k, 6.0 * k, '#fff4ea');
      d.ellipse(c - 1.6 * k, c - 1.6 * k, 4.6 * k, 3.6 * k, '#ffffff');
      // bloodshot veins
      const v = '#e05a6a';
      d.line(Math.round(4 * k), Math.round(c - 3), Math.round(6.6 * k), Math.round(c - 2), v);
      d.line(Math.round(4 * k), Math.round(c + 2), Math.round(6.6 * k), Math.round(c + 1), v);
      d.line(Math.round(S - 5 * k), Math.round(c - 2), Math.round(S - 7.4 * k), Math.round(c - 1), v);
      d.line(Math.round(S - 5 * k), Math.round(c + 2), Math.round(S - 7.4 * k), Math.round(c + 1), v);
      d.px(Math.round(5 * k), Math.round(c - 0.5), v);
      d.px(Math.round(S - 6 * k), Math.round(c + 0.5), v);
    });
    Sprites.painted(lidName, S, S, 4, (d, f) => {
      const open = [0, 0.38, 0.7, 1][f];
      d.circle(c, c, 10.4 * k, lp.dark);
      d.circle(c - 0.6, c - 0.6, 9.4 * k, lp.mid);
      d.circle(c - 1.4, c - 1.6, 7.6 * k, lp.mid2);
      d.circle(c - 2.2, c - 2.8, 4.2 * k, lp.lite);
      // lumps on the rim
      for (const [x, y] of [[3, 6], [18, 6], [3, 16], [18, 16], [11, 1], [11, 20]]) {
        d.circle(x * k, y * k, 1.6 * k, lp.mid);
        d.px(x * k - 1, y * k - 1, lp.lite);
      }
      if (open > 0) {
        for (let y = 0; y < S; y++)
          for (let x = 0; x < S; x++) {
            const a = (x - c) / (8.4 * k), b = (y - c) / (7.3 * k * open);
            if (a * a + b * b <= 1) d.erase(x, y);
          }
      } else {
        d.hline(Math.round(4 * k), Math.round(S - 5 * k), Math.round(c), '#160a2a');
        d.hline(Math.round(5 * k), Math.round(S - 6 * k), Math.round(c) - 1, lp.lite);
        d.px(Math.round(3 * k), Math.round(c) + 1, '#160a2a');
        d.px(Math.round(S - 4 * k), Math.round(c) + 1, '#160a2a');
      }
      d.outline('#160a2a');
    });
  }
  s5_bakeEye('s5_eyeball', 's5_eyelid', 22, { dark: '#3a1466', mid: '#6a34a4', mid2: '#8a46c6', lite: '#a468d8' });
  s5_bakeEye('s5_meyeball', 's5_meyelid', 26, { dark: '#2a0c48', mid: '#5a2290', mid2: '#7a2ea0', lite: '#a95ad4' });

  // leech: undulating parasite (faces left). 4 frames, carrier variant is red / orange
  const LEECH = { out: '#06202a', dark: '#0e5a6c', mid: '#1ca0a8', lite: '#64e0d0', belly: '#f2e2a0', bellyD: '#c8a860', mouth: '#e03a4a', mouthD: '#801428', tooth: '#ffffff', eye: '#ffe646' };
  Sprites.painted('s5_leech', 24, 13, 4, (d, f) => {
    const ph = (f * Math.PI) / 2;
    const spine = (x) => 6.4 + Math.sin(ph - x * 0.5) * (0.5 + ((x - 6) / 16) * 1.9);
    const rad = (x) => 3.5 - ((x - 5) / 17) * 2.6;
    for (let x = 5; x <= 22; x++) {
      const y = spine(x), r = rad(x);
      d.circle(x, y, r, LEECH.dark);
    }
    for (let x = 5; x <= 22; x++) {
      const y = spine(x), r = rad(x);
      d.circle(x - 0.4, y - 0.6, Math.max(0.6, r - 1.0), LEECH.mid);
    }
    for (let x = 5; x <= 20; x += 1) {
      const y = spine(x), r = rad(x);
      if (r > 1.6) d.circle(x - 0.6, y - r * 0.5, r * 0.32, LEECH.lite);
    }
    // belly stripes + segment grooves
    for (let x = 6; x <= 20; x++) {
      const y = spine(x), r = rad(x);
      if (x % 4 === 0) {
        for (let k = -Math.floor(r); k <= Math.floor(r); k++) d.px(x, Math.round(y + k), LEECH.dark);
      } else if (r > 1.6 && x % 2 === 1) d.px(x, Math.round(y + r * 0.62), LEECH.belly);
    }
    // head with a toothy sucker mouth
    const hy = spine(5);
    d.circle(3.4, hy, 3.6, LEECH.dark);
    d.circle(3.0, hy - 0.6, 3.0, LEECH.mid);
    d.circle(2.6, hy - 1.4, 1.5, LEECH.lite);
    d.circle(1.2, hy + 0.2, 2.6, LEECH.mouthD);
    d.circle(1.0, hy + 0.2, 1.7, LEECH.mouth);
    d.px(0, Math.round(hy) - 1, LEECH.tooth);
    d.px(0, Math.round(hy) + 2, LEECH.tooth);
    d.px(3, Math.round(hy) - 3, LEECH.eye);
    d.px(5, Math.round(hy) - 3, LEECH.eye);
    d.outline(LEECH.out);
  });
  Sprites.recolor('s5_leech', 's5_leech_c', {
    '#0e5a6c': '#a01c2c', '#1ca0a8': '#f03a3a', '#64e0d0': '#ff9424', '#f2e2a0': '#ffe646', '#c8a860': '#b89a20', '#06202a': '#2a0810', '#e03a4a': '#1a0a2a', '#801428': '#3c1444',
  });

  // sticky membrane: a translucent mucus curtain hanging from its anchor (top of the sprite), 4 wobble frames
  Sprites.painted('s5_web', 20, 92, 4, (d, f) => {
    const film = '#f6cfd0', filmL = '#fff0ea', strand = '#ffffff', shade = '#a8586c', glob = '#f2e4a0', globD = '#8a5a2a';
    const ph = (f * Math.PI) / 2;
    const cxAt = (y) => 10 + Math.sin(y * 0.09 + ph) * 1.6 * Math.min(1, y / 20);
    const endY = 78;
    // teardrop curtain: narrow neck, wide belly, tapering tip
    const half = (y) => {
      if (y < 14) return 2.4 + (y / 14) * 4.6;
      const belly = 7.2 + Math.sin(y * 0.2 + ph * 1.3) * 0.5;
      return y > endY - 22 ? belly * Math.max(0.12, (endY - y) / 22) : belly;
    };
    for (let y = 0; y < endY; y++) {
      const c = cxAt(y), hw = half(y);
      const l = c - hw, r = c + hw;
      for (let x = Math.ceil(l) + 1; x < Math.floor(r); x++) {
        const mid = 1 - Math.abs(x - c) / (hw + 0.1);
        // sparse checker dither: the film is see-through
        if (((x + y * 2) % 3 === 0) || (mid > 0.7 && ((x + y) & 1) === 0)) d.px(x, y, (x * 7 + y) % 11 === 0 ? filmL : film);
      }
      d.px(Math.round(l), y, strand);
      d.px(Math.round(l) - 1, y, shade);
      d.px(Math.round(r), y, strand);
      d.px(Math.round(r) + 1, y, shade);
    }
    // bright drapes running down the film
    for (const k of [-0.42, 0.05, 0.46]) {
      for (let y = 8; y < endY - 6; y++) {
        const c = cxAt(y) + half(y) * k * 1.1;
        if ((y + (k > 0 ? 1 : 0)) % 5 !== 4) d.px(Math.round(c), y, strand);
      }
    }
    // bubbles trapped in the goo
    d.circle(cxAt(30) - 2, 30, 1.7, filmL);
    d.px(cxAt(30) - 3, 29, '#ffffff');
    d.circle(cxAt(52) + 2, 52, 1.3, filmL);
    // drip globs on the tip
    for (const [gy, gr] of [[endY + 2, 3.8], [endY - 6, 2.2]]) {
      const gx = cxAt(gy) + (gr > 3 ? 0 : 3);
      d.circle(gx, gy + 2, gr + 0.9, globD);
      d.circle(gx - 0.3, gy + 1.7, gr, glob);
      d.circle(gx - 1.1, gy + 0.6, gr * 0.42, '#fffbe0');
      d.px(gx - 1.4, gy, '#ffffff');
    }
    d.px(cxAt(endY) + 1, endY + 9, glob);
    d.px(cxAt(endY) + 1, endY + 10, globD);
  });

  /** 3D-shaded lumpy blob from a list of spheres: [x, y, r, z, ramp]; light comes from the top-left */
  function s5_shadeBlob(d, w, h, spheres, ramps) {
    const L = [-0.5, -0.62, 0.6];
    const ll = Math.hypot(L[0], L[1], L[2]);
    const hgt = (x, y) => {
      let best = -1, id = -1;
      for (let i = 0; i < spheres.length; i++) {
        const [cx, cy, r, z] = spheres[i];
        const dd = r * r - (x - cx) * (x - cx) - (y - cy) * (y - cy);
        if (dd <= 0) continue;
        const v = (z || 0) + Math.sqrt(dd);
        if (v > best) { best = v; id = i; }
      }
      return [best, id];
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [hh, id] = hgt(x, y);
        if (id < 0) continue;
        const hx = hgt(x + 1, y)[0], hxm = hgt(x - 1, y)[0], hy = hgt(x, y + 1)[0], hym = hgt(x, y - 1)[0];
        const gx = (hx < 0 ? hh - 2 : hx) - (hxm < 0 ? hh - 2 : hxm), gy = (hy < 0 ? hh - 2 : hy) - (hym < 0 ? hh - 2 : hym);
        const nx = -gx * 0.5, ny = -gy * 0.5, nz = 1;
        const nl = Math.hypot(nx, ny, nz);
        let lam = (nx * L[0] + ny * L[1] + nz * L[2]) / (nl * ll);
        lam = clamp(lam, 0, 1);
        const ramp = ramps[spheres[id][4] || 0];
        const q = clamp(Math.floor(lam * ramp.length * 1.05 + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.9), 0, ramp.length - 1);
        d.px(x, y, ramp[q]);
      }
    }
  }

  // the Tentacle Mass: a lumpy magenta body with an eye socket on its left side (the arms are drawn underneath)
  Sprites.painted('s5_mass', 52, 48, 1, (d) => {
    const body = [
      [26, 24, 19.5, 0, 0], [14, 15, 10, 1, 0], [39, 15, 10, 1, 0], [13, 33, 10, 1, 0], [39, 33, 10, 1, 0],
      [26, 9, 9.5, 1, 0], [26, 40, 9.5, 1, 0], [42, 24, 8, 0, 0],
    ];
    const top = (x, y) => {
      let best = 0;
      for (const [cx, cy, r, z] of body) {
        const dd = r * r - (x - cx) * (x - cx) - (y - cy) * (y - cy);
        if (dd > 0) best = Math.max(best, z + Math.sqrt(dd));
      }
      return best;
    };
    const spheres = body.slice();
    for (const [x, y, r] of [[34, 24, 3.4], [30, 31, 2.6], [30, 17, 2.6], [23, 36, 2.2], [23, 12, 2.2], [43, 31, 2.6], [43, 17, 2.6], [37, 38, 2], [37, 10, 2]]) {
      spheres.push([x, y, r, top(x, y) - r * 0.35, 1]);
    }
    s5_shadeBlob(d, 52, 48, spheres, [['#26082e', '#521462', '#8e2a86', '#c85ab0', '#f6b4e4'], ['#4a0c28', '#98285a', '#dc5a7e', '#ff98b8', '#fff0f4']]);
    // recessed eye socket
    d.ellipse(15, 24, 11.6, 12.4, '#160828');
    d.ellipse(15, 24.6, 10.4, 11.2, '#2c0c40');
    d.outline('#12061c');
  });

  // spore bullet (slow, shootable)
  Sprites.painted('s5_spore', 7, 7, 2, (d, f) => {
    d.circle(3, 3, 3.1, f ? '#146034' : '#1c7a3c');
    d.circle(3, 3, 2.4, '#34b04a');
    d.circle(3, 3, 1.6, '#8cf03c');
    d.px(2, 2, '#ffffff');
    d.px(3, 2, f ? '#fff2a8' : '#ffffff');
    d.px(2, 3, '#fff2a8');
  });

  /* ------------------------------------------------------------
   * TENTACLE
   * ------------------------------------------------------------ */
  const s5_tentaclePal = { out: TC.out, dark: TC.dark, mid: TC.mid, lite: TC.lite, spec: TC.spec, sk: TC.sk, skD: TC.skD };
  const TMP = { x: 0, y: 0 };
  ENEMIES.s5_tentacle = {
    w: 14, h: 10, hp: 1, score: 300, attach: 'floor', sink: 3, expl: 'm',
    init(e, o) {
      e.up = e.attach === 'ceil' ? 1 : -1; // screen-y sign of the growth direction (-1 = grows upward)
      e.N = clamp(o.n || 8, 5, 10);
      e.sl = o.sl || 7;
      e.nLive = e.N;
      e.rad = [];
      const r0 = o.r0 || 6, r1 = o.r1 || 3.4;
      for (let i = 0; i <= e.N; i++) e.rad.push(lerp(r0, r1, i / e.N));
      e.rad[e.N] += 1.4; // tip bulb
      e.ph = o.phase !== undefined ? o.phase : rnd(TAU);
      e.lean0 = o.lean !== undefined ? o.lean : rnd(-0.22, 0.22);
      e.swayAmp = o.sway !== undefined ? o.sway : 0.42;
      e.side = chance(0.5) ? 1 : -1;
      e.canReach = !!o.reach;
      e.rs = 0; // reach state: 0 idle, 1 windup, 2 reach, 3 hold, 4 retract
      e.rt = 0;
      e.rcd = o.first !== undefined ? o.first : 110 + rndi(0, 100);
      e.rb = 0;
      e.aim = e.up * (Math.PI / 2);
      e.fireRate = o.fire || 0;
      e.fcd = e.fireRate ? 70 + rndi(0, 90) : 0;
      e.glow = 0;
      e.kick = 0;
      e.J = [];
      for (let i = 0; i <= e.N; i++) e.J.push({ x: e.x, y: e.y });
      e.w = 140; // do not cull the (long) chain while its base is only just off-screen
      const hp = (i) => s5_hp(i === 0 ? 3 : 2);
      e.parts = [];
      for (let i = 0; i < e.N; i++) {
        const sz = Math.round(e.rad[i + 1] * 2) + (i === e.N - 1 ? 1 : 0);
        const h = hp(i);
        e.parts.push({ name: 's' + i, ox: 0, oy: 0, w: sz, h: sz, hp: h, max: h, vuln: true, expl: 's', score: i === e.N - 1 ? 150 : 40 + i * 5 });
      }
      // the puckered root mound is solid too (armoured: shots glance off it)
      e.parts.push({ name: 'root', ox: 0, oy: 0, w: 14, h: 8, hp: 99999, vuln: false });
    },
    update(e) {
      const P = G.player, cam = G.camX;
      const N = e.N, up = e.up;
      const bx = e.wx - cam, by = e.y + up * 3;
      const t = e.t;
      const baseAng = up * (Math.PI / 2);
      const live = e.nLive;

      // ---- reach state machine ----
      if (e.canReach && live === N) {
        if (e.rs === 0) {
          if (--e.rcd <= 0 && P.alive && bx > 50 && bx < (e.o.trigger || 195) && P.x < bx - 24) {
            e.rs = 1; e.rt = 0;
            sfx('tentacle');
          } else if (e.rcd < -60) e.rcd = 30;
        } else {
          e.rt++;
          const dur = [0, 26, 46, 34, 46][e.rs];
          if (e.rt >= dur) {
            e.rs++; e.rt = 0;
            if (e.rs > 4) { e.rs = 0; e.rcd = (e.o.every || 300) + rndi(0, 140); }
          }
        }
      } else if (e.rs !== 0) { e.rs = 4; e.rt = Math.min(e.rt, 40); e.rb = Math.max(0, e.rb - 0.03); if (e.rb <= 0) e.rs = 0; }
      let wind = 0;
      if (e.rs === 1) { wind = s5_smooth(e.rt / 26); e.rb = 0; } else if (e.rs === 2) e.rb = s5_smooth(e.rt / 46); else if (e.rs === 3) e.rb = 1; else if (e.rs === 4) e.rb = 1 - s5_smooth(e.rt / 46); else e.rb = Math.max(0, e.rb - 0.02);
      if (e.rs >= 1 && e.rs <= 3 && P.alive) {
        const ta = s5_clampAim(Math.atan2(P.y - by, P.x - bx), up);
        e.aim += clamp(s5_angDiff(ta, e.aim), e.rs === 3 ? -0.02 : -0.04, e.rs === 3 ? 0.02 : 0.04);
      }
      const rb = e.rb;
      const ext = 1 + 0.34 * rb;
      const coilSign = s5_angDiff(e.aim, baseAng) > 0 ? -1 : 1;

      // ---- joints ----
      const J = e.J;
      J[0].x = bx; J[0].y = by;
      let curl = 0;
      const sway = e.swayAmp * Math.sin(t * 0.022 + e.ph);
      const throb = s5_beat(G.frame); // the whole cavern flexes with the heartbeat
      for (let i = 0; i < N; i++) {
        curl += (0.06 + 0.028 * i) * Math.sin(t * 0.05 - i * 0.6 + e.ph * 1.7);
        const kk = (i + 1) / N;
        let a = baseAng + e.lean0 + sway * (0.4 + 0.6 * kk) + curl;
        a += coilSign * wind * 0.13 * (i + 1) + throb * 0.05 * kk * e.side;
        if (rb > 0) a = a + s5_angDiff(e.aim + 0.06 * Math.sin(t * 0.08 - i), a) * rb * (0.55 + 0.45 * kk);
        let len = e.sl * ext;
        if (i === N - 1 && e.kick > 0) len += e.kick * 0.25;
        s5_reach(J[i], a, len, i > 0, TMP);
        const nx = TMP.x, ny = TMP.y;
        J[i + 1].x = nx; J[i + 1].y = ny;
        const p = e.parts[i];
        p.ox = nx - bx; p.oy = ny - e.y;
      }
      if (e.kick > 0) e.kick--;

      // ---- tip gun ----
      if (e.fireRate && live === N) {
        if (!s5_grace() || e.fcd > 90) e.fcd--;
        const tip = J[N];
        e.glow = e.fcd < 30 && e.fcd > 0 ? (30 - e.fcd) / 30 : 0;
        if (e.fcd <= 0) {
          const pt = { x: tip.x, y: tip.y };
          if (G.canFire(pt) && tip.x > 16) {
            const [vx, vy] = G.aim(tip.x, tip.y, e.o.speed || 1.35);
            G.ebullet(tip.x, tip.y, vx, vy);
            e.kick = 6;
          }
          e.fcd = G.fireDelay(e.fireRate) + rndi(0, 50);
        }
      } else e.glow = 0;
    },
    draw(e, c) {
      const N = e.N, n = e.nLive;
      Sprites.draw(c, 's5_root', e.x, e.y, { flipY: e.up > 0 });
      const flash = [];
      for (let i = 0; i < n; i++) flash[i + 1] = e.parts[i].flash > 0;
      s5_tube(c, e.J, e.rad, n, { pal: s5_tentaclePal, flash, side: e.side, tip: n === N });
      if (n === N) {
        const tip = e.J[N];
        s5_tip(c, tip.x, tip.y, e.rad[N], e.glow, e.t, e.carry);
        if (e.parts[N - 1].flash > 0) { c.fillStyle = '#fff'; s5_disc(c, Math.round(tip.x), Math.round(tip.y), e.rad[N]); }
      } else if (n > 0) {
        // raw stump
        const j = e.J[n];
        c.fillStyle = '#160a2a';
        s5_disc(c, Math.round(j.x), Math.round(j.y), e.rad[n] - 0.6);
        c.fillStyle = '#e83a5a';
        s5_disc(c, Math.round(j.x), Math.round(j.y), e.rad[n] - 1.6);
        c.fillStyle = '#ffb0b8';
        c.fillRect(Math.round(j.x) - 1, Math.round(j.y) - 1, 1, 1);
      }
    },
    onPartDeath(e, p) {
      const i = e.parts.indexOf(p);
      const tip = e.parts[e.N - 1];
      const tipX = e.x + tip.ox, tipY = e.y + tip.oy;
      const hadTip = e.nLive === e.N;
      s5_sever(e, e.parts.slice(0, e.N), i);
      e.nLive = Math.min(e.nLive, i);
      if (e.carry && hadTip) {
        e.carry = false;
        G.dropCapsule(tipX, tipY);
      }
      if (i === 0) G.kill(e);
    },
  };

  /* ------------------------------------------------------------
   * POLYP
   * ------------------------------------------------------------ */
  ENEMIES.s5_polyp = {
    w: 15, h: 15, hp: 3, score: 150, attach: 'floor', sink: 3, expl: 'm',
    spr: (e) => (e.carry ? 's5_polyp_c' : 's5_polyp'),
    init(e, o) {
      e.ph = rndi(0, 60);
      e.frame = 0;
    },
    update(e) {
      const near = Math.abs(e.x - G.player.x) < 70 && e.x > G.player.x;
      e.frame = near ? 1 + ((e.t >> 3) & 1) : s5_beat(G.frame) > 0.45 ? 1 : 0; // swells with the heartbeat, twitches when you come close
    },
    onDeath(e) {
      const up = e.attach === 'ceil' ? 1 : -1;
      sfx('cellPop');
      // gooey droplets
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 * up + rnd(-1.3, 1.3), s = rnd(0.4, 1.8);
        G.fx.push({ k: 'part', x: e.x, y: e.y + up * 2, vx: Math.cos(a) * s - 0.1, vy: up * Math.abs(Math.sin(a)) * s, life: rndi(16, 34), t: 0, col: pick(['#e0f060', '#a6bc2c', '#ff9424', '#ffffff']), big: chance(0.3) });
      }
      if (!G.player.alive) return;
      const mode = e.o.burst || 'ring';
      if (mode === 'ring') {
        const n = e.o.n || 6;
        for (let i = 0; i < n; i++) {
          const a = up < 0 ? -Math.PI + 0.35 + (i / (n - 1)) * (Math.PI - 0.7) : 0.35 + (i / (n - 1)) * (Math.PI - 0.7);
          G.ebullet(e.x, e.y + up * 2, Math.cos(a) * 1.0, Math.sin(a) * 1.0, { spr: 's5_spore', w: 5, h: 5, hp: 1, quiet: i > 0 });
        }
      } else if (mode === 'aim') {
        G.fan(e.x, e.y + up * 2, 3, 0.5, 1.25, { spr: 's5_spore', w: 5, h: 5, hp: 1 });
      } else if (mode === 'bugs') {
        for (let i = 0; i < 3; i++) G.later(i * 6, () => G.spawn('bug', { x: e.x, y: e.y + up * 4, vx: -0.4 + i * 0.3, vy: up * 1.2 }));
      }
    },
  };

  /* ------------------------------------------------------------
   * EYE POD
   * ------------------------------------------------------------ */
  ENEMIES.s5_eye = {
    w: 16, h: 15, hp: 4, score: 300, expl: 'm',
    init(e, o) {
      e.vx = -(o.speed || 1.05);
      const wx = G.camX + e.x;
      e.mid = s5_mid(wx);
      e.rel = e.y - e.mid;
      e.amp = o.amp !== undefined ? o.amp : 8;
      e.ph = o.phase !== undefined ? o.phase : rnd(TAU);
      e.cyc = Math.round(G.fireDelay(o.cycle || 190));
      e.off = o.offset !== undefined ? o.offset : rndi(0, 50);
      e.lid = 0;
      e.charge = 0;
      e.lx = 0; e.ly = 0;
    },
    update(e) {
      const P = G.player, T = G.terrain;
      const wx = G.camX + e.x;
      e.mid += (s5_mid(wx) - e.mid) * 0.06;
      e.y = clamp(e.mid + e.rel + Math.sin(e.t * 0.035 + e.ph) * e.amp, T.ceilBottom(wx) + 13, T.floorTop(wx) - 13);
      const c = (e.t + e.off) % e.cyc;
      const target = c >= 14 && c < e.cyc - 22 ? 1 : 0;
      e.lid += clamp(target - e.lid, -0.34, 0.34);
      e.invuln = e.lid < 0.2;
      const fireAt = Math.round(e.cyc * 0.5);
      e.charge = c > fireAt - 24 && c <= fireAt ? (c - (fireAt - 24)) / 24 : 0;
      if (c === fireAt && e.lid > 0.6 && G.canFire(e) && !s5_grace()) {
        const spread = e.o.spread || 0;
        if (spread) G.fan(e.x, e.y, 3, spread, 1.3, { spr: 'ebullet2', w: 5, h: 5 });
        else {
          const [vx, vy] = G.aim(e.x, e.y, 1.35);
          G.ebullet(e.x, e.y, vx, vy, { spr: 'ebullet2', w: 5, h: 5 });
        }
      }
      // pupil follows the player
      const dx = P.x - e.x, dy = P.y - e.y, dl = Math.hypot(dx, dy) || 1;
      e.lx += (dx / dl * 2.6 - e.lx) * 0.15;
      e.ly += (dy / dl * 2.2 - e.ly) * 0.15;
    },
    draw(e, c) {
      const fl = e.flash > 0;
      Sprites.draw(c, 's5_eyeball', e.x, e.y, { flash: fl });
      if (!fl && e.lid > 0.25) {
        const ix = Math.round(e.x + e.lx), iy = Math.round(e.y + e.ly);
        const ch = e.charge;
        c.fillStyle = '#7a2a10';
        s5_disc(c, ix, iy, 4.2);
        c.fillStyle = ch > 0.5 ? '#ffe646' : '#ff9424';
        s5_disc(c, ix, iy, 3.4);
        c.fillStyle = ch > 0.5 ? '#ffffff' : '#ffd040';
        s5_disc(c, ix - 1, iy - 1, 1.6);
        c.fillStyle = '#1a0a2a';
        c.fillRect(ix - 1 + (ch > 0.5 ? 0 : 0), iy - 2, ch > 0.5 ? 3 : 2, ch > 0.5 ? 5 : 4);
        c.fillStyle = '#ffffff';
        c.fillRect(ix - 2, iy - 2, 1, 1);
      }
      if (e.charge > 0 && !fl) {
        c.globalAlpha = 0.25 + 0.3 * e.charge;
        c.fillStyle = '#ffb030';
        s5_disc(c, Math.round(e.x), Math.round(e.y), 11 + e.charge * 2);
        c.globalAlpha = 1;
      }
      Sprites.draw(c, 's5_eyelid', e.x, e.y, { frame: clamp(Math.round(e.lid * 3), 0, 3), flash: fl });
    },
  };

  /* ------------------------------------------------------------
   * LEECH swimmers
   * ------------------------------------------------------------ */
  ENEMIES.s5_leech = {
    w: 16, h: 8, hp: 1, score: 100, fps: 5,
    spr: (e) => (e.carry ? 's5_leech_c' : 's5_leech'),
    init(e, o) {
      e.vx = -(o.speed || 1.5);
      const wx = G.camX + e.x;
      e.mid = s5_mid(wx);
      e.rel = e.y - e.mid;
      e.amp = o.amp || 24;
      e.freq = o.freq || 0.05;
      e.ph = o.phase || 0;
    },
    update(e) {
      const T = G.terrain;
      const wx = G.camX + e.x;
      e.mid += (s5_mid(wx) - e.mid) * 0.07;
      e.y = clamp(e.mid + e.rel + Math.sin(e.t * e.freq + e.ph) * e.amp, T.ceilBottom(wx) + 8, T.floorTop(wx) - 8);
    },
  };

  /* ------------------------------------------------------------
   * STICKY MEMBRANE: harmless to touch, but it drags the ship back and
   * swallows shots until torn open
   * ------------------------------------------------------------ */
  ENEMIES.s5_web = {
    w: 12, h: 70, hp: 6, score: 80, attach: 'ceil', sink: 5, harmless: true, expl: 's',
    init(e, o) {
      e.len = clamp(o.len || 70, 66, 86);
      e.h = e.len;
      G.snapToTerrain(e); // re-snap now that the real height is known
      e.pp = null;
      e.stuck = 0;
      e.fr = rndi(0, 3);
      e.hp = e.maxHp = s5_hp(o.hp || 6);
    },
    update(e) {
      const P = G.player;
      if (P.alive && e.pp && P.enterT <= 0 && overlap(P.x, P.y, 12, 7, e.x, e.y, e.w + 4, e.h)) {
        P.x += (e.pp.x - P.x) * 0.62 - 0.12; // drag: most of this frame's movement is undone
        P.y += (e.pp.y - P.y) * 0.62;
        if (e.stuck === 0) sfx('cellPop');
        e.stuck = 5;
        const px = P.x, py = P.y, ex = e.x;
        G.fx.push({
          k: 'fn', x: 0, y: 0, t: 0, life: 1,
          draw: (c) => {
            for (const k of [-4, 0, 4]) {
              c.fillStyle = '#f2e4a0';
              s5_pline(c, px + 8, py + k * 0.6, ex + (k > 0 ? 3 : -3), py + k * 1.4);
              c.fillStyle = '#ffffff';
              c.fillRect(Math.round(px + 8), Math.round(py + k * 0.6), 1, 1);
            }
          },
        });
      }
      if (e.stuck > 0) e.stuck--;
      e.pp = { x: P.x, y: P.y };
      e.frame = ((e.t >> 4) + e.fr) & 3;
    },
    draw(e, c) {
      let img = Sprites.get('s5_web', e.frame);
      if (e.flash > 0) img = Sprites.flashOf(img);
      const up = e.attach !== 'ceil'; // floor webs rise from the ground
      const x0 = Math.round(e.x - 10);
      const top = Math.round(e.y - e.h / 2), bot = top + e.h;
      const mid = e.h - 66; // rows of the tileable middle band we need
      const a = 0.5 + 0.5 * (e.hp / e.maxHp);
      c.globalAlpha = a;
      const piece = (sy, sh, dy) => {
        if (sh <= 0) return;
        if (!up) c.drawImage(img, 0, sy, 20, sh, x0, dy, 20, sh);
        else {
          c.save();
          c.translate(x0, bot - (dy - top));
          c.scale(1, -1);
          c.drawImage(img, 0, sy, 20, sh, 0, 0, 20, sh);
          c.restore();
        }
      };
      piece(0, 30, top);
      piece(30, mid, top + 30);
      piece(56, 36, top + 30 + mid);
      c.globalAlpha = 1;
    },
    onDeath(e) {
      sfx('cellPop');
      for (let i = 0; i < 14; i++) {
        G.fx.push({ k: 'part', x: e.x + rnd(-6, 6), y: e.y + rnd(-e.h / 2, e.h / 2), vx: rnd(-0.8, 0.8), vy: rnd(-0.4, 1.4), life: rndi(18, 40), t: 0, col: pick(['#f6cfd0', '#f2e4a0', '#ffffff']), big: chance(0.3) });
      }
    },
  };

  /* ------------------------------------------------------------
   * MID-BOSS: the Tentacle Mass
   * a lumpy blob with six thrashing arms (each cut apart segment by
   * segment) and a central eye that is exposed while it spits spores
   * ------------------------------------------------------------ */
  const MASS_TH = [-2.2, -1.57, -0.92, 0.92, 1.57, 2.2]; // arm anchor angles around the body
  const MASS_SEGS = 5;
  const MASS_RAD = [7, 6.6, 5.8, 5, 4.4, 3.8];
  const massArmPal = { out: '#12061c', dark: '#3c1a78', mid: '#7a44c8', lite: '#b88af0', spec: '#fff0ff', sk: '#ffb8d4', skD: '#a8407a' };
  const s5_blend = (a, b, w) => a + s5_angDiff(b, a) * w;

  ENEMIES.s5_mass = {
    w: 50, h: 46, hp: 1, score: 5000, expl: 'l',
    init(e, o) {
      e.homeX = o.homeX || 172;
      e.leaveX = o.leaveX || 2560; // once the camera passes this the mass gives up and swims away
      e.phase = 'enter';
      e.pt = 0;
      e.cd = 90;
      e.mode = 'idle';
      e.mt = 0;
      e.seq = ['sweep', 'spit', 'lash', 'spit'];
      e.si = 0;
      e.lid = 0;
      e.charge = 0;
      e.lx = 0; e.ly = 0;
      e.wasOpen = false;
      e.leave = false;
      e.arms = [];
      e.parts = [];
      const segHp = [4, 3, 2, 2, 2];
      for (let k = 0; k < MASS_TH.length; k++) {
        const arm = { k, th: MASS_TH[k], live: MASS_SEGS, J: [], rad: MASS_RAD.slice(), ph: rnd(TAU), at: -1, sd: 1, aim: 0, glow: 0, ext: 1, side: k % 2 ? 1 : -1 };
        arm.rad[MASS_SEGS] += 1.2;
        for (let i = 0; i <= MASS_SEGS; i++) arm.J.push({ x: e.x, y: e.y });
        e.arms.push(arm);
        for (let i = 0; i < MASS_SEGS; i++) {
          const sz = Math.round(arm.rad[i + 1] * 2);
          const h = s5_hp(segHp[i]);
          e.parts.push({ name: 'a' + k + '_' + i, ox: 0, oy: 0, w: sz, h: sz, hp: h, max: h, vuln: true, expl: 's', score: 60 + i * 10, arm: k, seg: i });
        }
      }
      const eh = s5_hp((o.eyeHp || 28) * (1 + 0.9 * G.rank)); // a well armed ship meets a tougher eye
      e.parts.push({ name: 'eye', ox: -11, oy: 0, w: 17, h: 19, hp: eh, max: eh, vuln: false, expl: 'l', score: 3000 });
      // the lumpy hide is armoured: a plus-shaped pair of boxes follows its silhouette
      // (kept clear of the eye's left edge so shots reach the open eye first)
      e.parts.push({ name: 'body', ox: 4, oy: 0, w: 44, h: 30, hp: 99999, vuln: false });
      e.parts.push({ name: 'body2', ox: 2, oy: 0, w: 34, h: 44, hp: 99999, vuln: false });
      e.eyePart = e.parts[e.parts.length - 3];
    },
    aliveArms(e) {
      let n = 0;
      for (const a of e.arms) if (a.live > 0) n++;
      return n;
    },
    update(e) {
      const P = G.player, T = G.terrain, cam = G.camX, t = e.t;
      const nArms = ENEMIES.s5_mass.aliveArms(e);
      const exposed = nArms === 0;
      const rage = nArms <= 2;

      /* ---- position ---- */
      if (e.phase === 'enter') {
        e.x += (e.homeX - e.x) * 0.03 - 0.25;
        if (e.x <= e.homeX + 1) { e.phase = 'fight'; e.pt = 0; }
      } else if (e.leave) {
        e.x += 1.6;
        e.y += Math.sin(t * 0.05) * 0.3;
      } else {
        e.pt++;
        e.x = e.homeX + Math.sin(e.pt * 0.011) * 30;
        const wx = cam + e.x;
        const lo = T.ceilBottom(wx) + 36, hi = T.floorTop(wx) - 36;
        const ty = P.alive ? P.y : e.y;
        e.y = clamp(e.y + clamp((ty - e.y) * 0.02, -0.55, 0.55) + Math.sin(e.pt * 0.03) * 0.12, lo, Math.max(lo, hi));
        if (cam > e.leaveX) { e.leave = true; e.mode = 'idle'; }
      }
      const fighting = e.phase === 'fight' && !e.leave && P.alive;

      /* ---- attack scheduler ---- */
      if (fighting) {
        if (e.mode === 'idle') {
          if (--e.cd <= 0) {
            let m = e.seq[e.si++ % e.seq.length];
            if ((m === 'sweep' || m === 'lash') && nArms < 2) m = 'spit';
            if (m === 'lash' && e.arms[0].live === 0 && e.arms[5].live === 0) m = 'spit';
            if (exposed) m = 'spit';
            e.mode = m;
            e.mt = 0;
            if (m === 'sweep') {
              // the two arms that face the player best strike one after the other
              const dirP = Math.atan2(P.y - e.y, P.x - e.x);
              const order = e.arms.filter((a) => a.live > 0).sort((a, b) => Math.abs(s5_angDiff(a.th, dirP)) - Math.abs(s5_angDiff(b.th, dirP)));
              e.strikers = [order[0], order[1] || order[0]];
              for (const a of e.strikers) a.sd = a.th < 0 ? -1 : 1; // upper arms sweep down, lower arms sweep up
              sfx('tentacle');
            } else if (m === 'lash') sfx('tentacle');
          }
        } else {
          e.mt++;
          const dur = e.mode === 'sweep' ? 140 : e.mode === 'lash' ? 110 : rage ? 130 : 170;
          if (e.mt >= dur) {
            e.cd = G.fireDelay(rage ? 28 : e.mode === 'spit' ? 36 : 40);
            e.mode = 'idle';
          }
        }
      } else if (e.mode !== 'idle') e.mode = 'idle';

      /* ---- spore volleys ---- */
      if (fighting && e.mode === 'spit') {
        const m = e.mt;
        e.charge = m >= 22 && m < 46 ? (m - 22) / 24 : 0;
        const volleys = rage ? [46, 76, 106] : [46, 92, 138];
        if (volleys.indexOf(m) >= 0 && e.lid > 0.6 && G.canFire({ x: e.x - 11, y: e.y }) && !s5_grace()) {
          const n = rage ? 5 : 3, sp = rage ? 0.95 : 0.6;
          G.fan(e.x - 12, e.y, n, sp, 1.25, { spr: 's5_spore', w: 5, h: 5, hp: 1 });
        }
      } else e.charge = 0;

      /* ---- eye lid + look ---- */
      const wantOpen = exposed || (fighting && e.mode === 'spit' && e.mt >= 6 && e.mt < (rage ? 126 : 164));
      e.lid += clamp((wantOpen ? 1 : 0) - e.lid, -0.09, 0.09);
      const isOpen = e.lid > 0.55;
      if (isOpen !== e.wasOpen) { e.wasOpen = isOpen; sfx(isOpen ? 'coreOpen' : 'coreClose'); }
      e.eyePart.vuln = isOpen;
      const dx = P.x - (e.x - 11), dy = P.y - e.y, dl = Math.hypot(dx, dy) || 1;
      e.lx += (dx / dl * 3 - e.lx) * 0.12;
      e.ly += (dy / dl * 3 - e.ly) * 0.12;

      /* ---- arms ---- */
      for (const arm of e.arms) {
        const ax = e.x + Math.cos(arm.th) * 16, ay = e.y + Math.sin(arm.th) * 15;
        const J = arm.J;
        J[0].x = ax; J[0].y = ay;
        let base = arm.th + 0.3 * Math.sin(t * 0.05 + arm.ph);
        let ext = 1, stiff = 1, glow = 0;
        // per-arm attack timers
        let u = -1;
        if (fighting && e.mode === 'sweep' && e.strikers) {
          if (arm === e.strikers[0]) u = e.mt;
          else if (arm === e.strikers[1] && e.mt >= 40) u = e.mt - 40;
        }
        if (u >= 0 && u < 100) {
          const aimNow = Math.atan2(P.y - ay, P.x - ax);
          if (u === 26) arm.aim = aimNow;
          if (u < 26) {
            const w = s5_smooth(u / 26);
            base = s5_blend(base, aimNow - arm.sd * 1.0, w);
            glow = u / 26; stiff = 0.5; ext = 1 - 0.1 * w;
          } else if (u < 66) {
            const w = s5_smooth((u - 26) / 40);
            base = arm.aim + arm.sd * (-1.0 + 2.0 * w);
            ext = 1.45; stiff = 0.2; glow = 1 - w * 0.5;
          } else {
            const w = 1 - s5_smooth((u - 66) / 34);
            base = s5_blend(base, arm.aim + arm.sd * 1.0, w);
            ext = 1 + 0.45 * w; stiff = 0.4 + 0.6 * (1 - w);
          }
        } else if (fighting && e.mode === 'lash' && (arm.k === 0 || arm.k === 5)) {
          // the two front arms clap shut toward the middle
          const w = e.mt < 30 ? s5_smooth(e.mt / 30) : e.mt < 70 ? 1 : 1 - s5_smooth((e.mt - 70) / 40);
          const target = arm.k === 0 ? Math.PI - 0.35 : Math.PI + 0.35;
          base = s5_blend(base, target, w);
          ext = 1 + 0.3 * w; stiff = 0.35;
          glow = e.mt > 24 && e.mt < 70 ? 0.7 : 0;
        }
        arm.glow = glow;
        let curl = 0;
        for (let i = 0; i < MASS_SEGS; i++) {
          curl += stiff * 0.2 * Math.sin(t * 0.085 - i * 0.9 + arm.ph);
          const a = base + curl * (0.6 + 0.2 * i);
          s5_reach(J[i], a, 10 * ext, i > 0, TMP);
          J[i + 1].x = TMP.x; J[i + 1].y = TMP.y;
          const p = e.parts[arm.k * MASS_SEGS + i];
          p.ox = TMP.x - e.x; p.oy = TMP.y - e.y;
        }
      }
    },
    draw(e, c) {
      // arms first: their roots tuck under the body
      for (const arm of e.arms) {
        if (arm.live <= 0) continue;
        const flash = [];
        for (let i = 0; i < arm.live; i++) flash[i + 1] = e.parts[arm.k * MASS_SEGS + i].flash > 0;
        s5_tube(c, arm.J, arm.rad, arm.live, { pal: massArmPal, flash, side: arm.side, tip: arm.live === MASS_SEGS });
        const j = arm.J[arm.live];
        if (arm.live === MASS_SEGS) {
          s5_tip(c, j.x, j.y, arm.rad[MASS_SEGS], arm.glow, e.t);
          if (e.parts[arm.k * MASS_SEGS + MASS_SEGS - 1].flash > 0) { c.fillStyle = '#fff'; s5_disc(c, Math.round(j.x), Math.round(j.y), arm.rad[MASS_SEGS]); }
        } else {
          c.fillStyle = '#12061c';
          s5_disc(c, Math.round(j.x), Math.round(j.y), arm.rad[arm.live] - 0.6);
          c.fillStyle = '#e83a5a';
          s5_disc(c, Math.round(j.x), Math.round(j.y), arm.rad[arm.live] - 1.6);
          c.fillStyle = '#ffb0b8';
          c.fillRect(Math.round(j.x) - 1, Math.round(j.y) - 1, 1, 1);
        }
      }
      Sprites.draw(c, 's5_mass', e.x, e.y);
      // the eye
      const ex = e.x - 11, ey = e.y;
      const fl = e.eyePart.flash > 0;
      Sprites.draw(c, 's5_meyeball', ex, ey, { flash: fl });
      if (!fl && e.lid > 0.25) {
        const ix = Math.round(ex + e.lx), iy = Math.round(ey + e.ly), ch = e.charge;
        c.fillStyle = '#7a2a10';
        s5_disc(c, ix, iy, 5);
        c.fillStyle = ch > 0.5 ? '#ffe646' : '#ff9424';
        s5_disc(c, ix, iy, 4.1);
        c.fillStyle = ch > 0.5 ? '#ffffff' : '#ffd040';
        s5_disc(c, ix - 1, iy - 1, 2);
        c.fillStyle = '#1a0a2a';
        c.fillRect(ix - 1, iy - 3, ch > 0.5 ? 3 : 2, ch > 0.5 ? 7 : 6);
        c.fillStyle = '#ffffff';
        c.fillRect(ix - 3, iy - 3, 1, 1);
      }
      if (e.charge > 0 && !fl) {
        c.globalAlpha = 0.25 + 0.3 * e.charge;
        c.fillStyle = '#ffb030';
        s5_disc(c, Math.round(ex), Math.round(ey), 12 + e.charge * 3);
        c.globalAlpha = 1;
      }
      Sprites.draw(c, 's5_meyelid', ex, ey, { frame: clamp(Math.round(e.lid * 3), 0, 3), flash: fl });
    },
    onPartDeath(e, p) {
      if (p.name === 'eye') {
        G.kill(e);
        return;
      }
      if (p.arm === undefined) return;
      const list = e.parts.slice(p.arm * MASS_SEGS, p.arm * MASS_SEGS + MASS_SEGS);
      const arm = e.arms[p.arm];
      const idx = list.indexOf(p);
      if (arm.live === MASS_SEGS) {
        // the stinger goes with the cut
        G.explode(e.x + list[MASS_SEGS - 1].ox, e.y + list[MASS_SEGS - 1].oy, 's', { quiet: true });
      }
      s5_sever(e, list, idx);
      arm.live = Math.min(arm.live, idx);
    },
    onDeath(e) {
      for (const b of G.eb) b.dead = true; // the spores die with the mass
      for (let i = 0; i < 12; i++) {
        G.later(i * 5, () => G.explode(e.x + rnd(-22, 22), e.y + rnd(-20, 20), i % 3 === 2 ? 'l' : 'm', { quiet: i % 2 === 1 }));
      }
      for (let i = 0; i < 20; i++) {
        const a = rnd(TAU), sp = rnd(0.5, 2.6);
        G.fx.push({ k: 'part', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rndi(20, 46), t: 0, col: pick(['#ff98b8', '#c85ab0', '#ffffff', '#ffe646']), big: chance(0.35) });
      }
    },
  };

  /* ------------------------------------------------------------
   * invisible controller: makes the wet wall rims flash with the heartbeat
   * and twinkle (spawned from the stage's onReset hook; ghost + harmless)
   * ------------------------------------------------------------ */
  ENEMIES.s5_pulse = {
    w: 4, h: 4, hp: 1, score: 0, ghost: true, harmless: true, keep: true, keepOnBoss: true,
    init(e) {
      e.gl = [];
      e.x = -60;
      e.y = -60;
    },
    update(e) {
      e.x = -60;
      e.y = -60;
      if (G.frame % 8 === 0 && e.gl.length < 9) {
        e.gl.push({ wx: G.camX + rndi(4, W - 4), floor: chance(0.55), t: 0, life: rndi(14, 26) });
      }
      let j = 0;
      for (const g of e.gl) {
        g.t++;
        const sx = g.wx - G.camX;
        if (g.t < g.life && sx > -4 && sx < W + 4) e.gl[j++] = g;
      }
      e.gl.length = j;
    },
    draw(e, c) {
      const T = G.terrain, cam = G.camX;
      const b = s5_beat(G.frame);
      if (b > 0.06) {
        c.globalAlpha = Math.min(0.66, b * 0.62 * s5_boost());
        c.fillStyle = '#ffc8d8';
        for (let x = 0; x < W; x++) {
          const wx = cam + x;
          const ft = T.floorTop(wx);
          if (ft < H - 4) c.fillRect(x, ft + 1, 1, 1);
          const cb = T.ceilBottom(wx);
          if (cb > 4) c.fillRect(x, cb - 2, 1, 1);
        }
        c.globalAlpha = 1;
      }
      // fine cilia swaying along the wall rims (decoration only: the wall itself is what hurts)
      const t = G.frame;
      for (let x = 0; x < W; x++) {
        const wx = cam + x;
        const hsh = (wx * 2654435761) >>> 0;
        if (hsh % 9 !== 0) continue;
        const len = 3 + (hsh >> 4) % 5;
        const ph = wx * 0.31 + t * 0.06;
        const bend = Math.sin(ph) * (len * 0.35);
        const ft = T.floorTop(wx), cb = T.ceilBottom(wx);
        c.fillStyle = '#e07894';
        if (ft < H - 6) {
          c.fillRect(x, ft - 2, 1, 2);
          c.fillRect(Math.round(x + bend * 0.5), ft - 1 - Math.ceil(len / 2), 1, Math.ceil(len / 2));
          c.fillStyle = '#ffb4c4';
          c.fillRect(Math.round(x + bend), ft - 1 - len, 1, 1);
        }
        c.fillStyle = '#e07894';
        if (cb > 6 && (hsh >> 8) % 2 === 0) {
          c.fillRect(x, cb, 1, 2);
          c.fillRect(Math.round(x + bend * 0.5), cb + 2, 1, Math.ceil(len / 2));
          c.fillStyle = '#ffb4c4';
          c.fillRect(Math.round(x + bend), cb + 2 + len - 1, 1, 1);
        }
      }
      for (const g of e.gl) {
        const k = 1 - Math.abs((g.t / g.life) * 2 - 1);
        const x = Math.round(g.wx - cam);
        const y = g.floor ? T.floorTop(g.wx) + 1 : T.ceilBottom(g.wx) - 2;
        if (y < 6 || y > H - 8) continue;
        c.globalAlpha = 0.35 + 0.65 * k;
        c.fillStyle = '#ffffff';
        c.fillRect(x - 1, y, 3, 1);
        if (k > 0.55) {
          c.fillRect(x, y - 1, 1, 3);
          c.globalAlpha = 0.5 * k;
          c.fillStyle = '#ffd8e4';
          c.fillRect(x - 2, y, 1, 1);
          c.fillRect(x + 2, y, 1, 1);
        }
        c.globalAlpha = 1;
      }
    },
  };

  /* ------------------------------------------------------------
   * terrain profile
   * ------------------------------------------------------------ */
  const BOSS_X = 3450;
  const LEN = BOSS_X + W + 120;

  // [x, floor height, ceiling height, noise amplitude]
  const MACRO = [
    [0, 36, 34, 5],
    [240, 40, 36, 6],
    [400, 50, 44, 7],
    [620, 58, 52, 8],
    [820, 50, 48, 7],
    [900, 38, 36, 5],
    [1160, 40, 38, 5],
    [1230, 54, 52, 4],
    [1320, 58, 56, 3],
    [1420, 54, 50, 4],
    [1520, 46, 44, 5],
    [1720, 42, 38, 5],
    [1840, 34, 32, 3],
    [2600, 36, 34, 3],
    [2700, 56, 54, 6],
    [2800, 60, 56, 4],
    [2900, 54, 58, 8],
    [3000, 58, 52, 8],
    [3200, 52, 46, 7],
    [3300, 40, 36, 4],
    [3400, 28, 26, 0],
    [LEN, 28, 26, 0],
  ];
  const s5_macro = (x) => {
    let i = 1;
    while (i < MACRO.length - 1 && MACRO[i][0] < x) i++;
    const a = MACRO[i - 1], b = MACRO[i];
    const t = s5_smooth(clamp((x - a[0]) / (b[0] - a[0] || 1), 0, 1));
    return { f: lerp(a[1], b[1], t), c: lerp(a[2], b[2], t), a: lerp(a[3], b[3], t) };
  };
  // minimum corridor by zone (a few short squeezes go down to 90)
  const s5_minGap = (x) => {
    if (x > 1228 && x < 1444) return 92;
    if (x > 2740 && x < 2860) return 94;
    return 100;
  };
  function s5_noise(seed, scale) {
    const rng = makeRng(seed);
    const lat = Array.from({ length: Math.ceil(LEN / scale) + 3 }, rng);
    return (x) => {
      const f = x / scale, i = Math.floor(f), t = s5_smooth(f - i);
      return lat[i] + (lat[i + 1] - lat[i]) * t;
    };
  }
  let s5_cache = null;
  function s5_profile() {
    if (s5_cache) return s5_cache;
    const F = new Float32Array(LEN), C = new Float32Array(LEN);
    const nf1 = s5_noise(11, 88), nf2 = s5_noise(12, 33), nc1 = s5_noise(21, 96), nc2 = s5_noise(22, 29);
    for (let x = 0; x < LEN; x++) {
      const m = s5_macro(x);
      F[x] = m.f + m.a * 2 * (0.7 * (nf1(x) - 0.5) + 0.3 * (nf2(x) - 0.5));
      C[x] = m.c + m.a * 2 * (0.7 * (nc1(x) - 0.5) + 0.3 * (nc2(x) - 0.5));
    }
    for (let x = 0; x < LEN; x++) {
      const g = H - F[x] - C[x], need = s5_minGap(x) + 4;
      if (g < need) { const d = (need - g) / 2; F[x] -= d; C[x] -= d; }
    }
    // lumps on both walls, hanging teats and squeeze valves — placed only where the corridor stays open
    const rng = makeRng(77);
    const rr = (a, b) => a + rng() * (b - a);
    const fEff = Float32Array.from(F), cEff = Float32Array.from(C);
    const blobs = [];
    const place = (wall, x, rx, ry, prot) => {
      const base = wall === 'f' ? F : C, eff = wall === 'f' ? fEff : cEff, other = wall === 'f' ? cEff : fEff;
      const xi = Math.round(x);
      const c0 = Math.max(0, Math.floor(x - rx)), c1 = Math.min(LEN - 1, Math.ceil(x + rx));
      // how far the lump violates the minimum corridor (<= 0 means fine)
      const violation = (p) => {
        const hc = base[xi] + p - ry;
        let worst = 0;
        for (let col = c0; col <= c1; col++) {
          const u = (col - x) / rx;
          const h = Math.max(eff[col], Math.abs(u) >= 1 ? 0 : hc + ry * Math.sqrt(1 - u * u));
          worst = Math.max(worst, s5_minGap(col) + 3 - (H - h - other[col]));
        }
        return worst;
      };
      for (let k = 0; k < 8; k++) {
        const w = violation(prot);
        if (w <= 0) break;
        prot -= w + 0.5;
        if (prot < 3) return false;
      }
      if (prot < 3) return false;
      const hc = base[xi] + prot - ry;
      for (let col = c0; col <= c1; col++) {
        const u = (col - x) / rx;
        if (Math.abs(u) < 1) eff[col] = Math.max(eff[col], hc + ry * Math.sqrt(1 - u * u));
      }
      blobs.push({ wall, x, rx, ry, hc });
      return true;
    };
    const ZONES = [
      { x0: 60, x1: 380, sp: [70, 130], rx: [14, 26], ry: [8, 14], prot: [4, 10] },
      { x0: 380, x1: 820, sp: [42, 90], rx: [12, 24], ry: [8, 16], prot: [5, 14] },
      { x0: 820, x1: 1200, sp: [50, 100], rx: [14, 28], ry: [8, 16], prot: [5, 12] },
      { x0: 1200, x1: 1470, sp: [36, 70], rx: [10, 20], ry: [8, 14], prot: [4, 12] },
      { x0: 1470, x1: 1840, sp: [45, 95], rx: [12, 24], ry: [8, 16], prot: [5, 12] },
      { x0: 1840, x1: 2640, sp: [80, 150], rx: [18, 30], ry: [8, 14], prot: [3, 8] },
      { x0: 2640, x1: 3220, sp: [34, 80], rx: [10, 22], ry: [8, 16], prot: [5, 14] },
      { x0: 3220, x1: 3350, sp: [70, 120], rx: [14, 24], ry: [8, 12], prot: [3, 8] },
    ];
    for (const wall of ['f', 'c']) {
      for (const z of ZONES) {
        let x = z.x0 + rr(0, z.sp[1]);
        while (x < z.x1) {
          place(wall, x, rr(z.rx[0], z.rx[1]), rr(z.ry[0], z.ry[1]), rr(z.prot[0], z.prot[1]));
          x += rr(z.sp[0], z.sp[1]);
        }
      }
    }
    // squeeze valves: a lump on each wall almost meeting in the middle
    for (const vx of [1262, 1338, 1412, 2790]) {
      place('f', vx, 28, 18, 20);
      place('c', vx + 8, 28, 18, 20);
    }
    // dripping teats hanging from the ceiling (and a few fangs on the floor)
    const TEATS = [
      { wall: 'c', x0: 430, x1: 820, sp: [80, 150], rx: [5, 8], ry: [14, 26] },
      { wall: 'c', x0: 850, x1: 1190, sp: [44, 84], rx: [4.5, 8], ry: [16, 30] },
      { wall: 'f', x0: 900, x1: 1190, sp: [90, 150], rx: [5, 8], ry: [12, 22] },
      { wall: 'c', x0: 1480, x1: 1830, sp: [70, 120], rx: [5, 8], ry: [14, 24] },
      { wall: 'c', x0: 2650, x1: 3210, sp: [60, 110], rx: [5, 8], ry: [14, 26] },
      { wall: 'f', x0: 2650, x1: 3210, sp: [90, 140], rx: [5, 8], ry: [12, 20] },
    ];
    for (const tz of TEATS) {
      let x = tz.x0 + rr(0, tz.sp[1]);
      while (x < tz.x1) {
        const ry = rr(tz.ry[0], tz.ry[1]);
        place(tz.wall, x, rr(tz.rx[0], tz.rx[1]), ry, ry - rr(3, 5));
        x += rr(tz.sp[0], tz.sp[1]);
      }
    }
    s5_cache = { F, C, blobs };
    return s5_cache;
  }

  /** slow colour drift along the level: [x, r, g, b, amount] */
  const S5_TINTS = [
    [0, 0, 0, 0, 0],
    [380, 255, 96, 64, 0.02],
    [520, 255, 96, 64, 0.11],
    [820, 255, 96, 64, 0.05],
    [930, 200, 40, 170, 0.15],
    [1160, 200, 40, 170, 0.15],
    [1240, 150, 10, 30, 0.24],
    [1520, 150, 10, 30, 0.24],
    [1700, 0, 0, 0, 0],
    [1850, 255, 170, 150, 0.07],
    [2600, 255, 170, 150, 0.07],
    [2760, 90, 30, 170, 0.2],
    [3200, 90, 30, 170, 0.2],
    [3300, 0, 0, 0, 0],
    [3380, 190, 20, 60, 0.12],
    [LEN, 190, 20, 60, 0.12],
  ];
  function s5_tintAt(x) {
    let i = 1;
    while (i < S5_TINTS.length - 1 && S5_TINTS[i][0] < x) i++;
    const a = S5_TINTS[i - 1], b = S5_TINTS[i];
    const t = clamp((x - a[0]) / (b[0] - a[0] || 1), 0, 1);
    return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t), lerp(a[4], b[4], t)];
  }

  /* ------------------------------------------------------------
   * terrain decoration: depth shading, wet sheen, vein networks, boils
   * ------------------------------------------------------------ */
  /** chamfer 3-4 distance (in 1/3 px) from every solid pixel to the nearest empty pixel */
  function s5_distField(T) {
    const N = LEN * H;
    const d = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < LEN; x++) d[y * LEN + x] = T.mask[x * H + y] ? 240 : 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < LEN; x++) {
        const i = y * LEN + x;
        let v = d[i];
        if (!v) continue;
        if (x > 0) v = Math.min(v, d[i - 1] + 3);
        if (y > 0) {
          v = Math.min(v, d[i - LEN] + 3);
          if (x > 0) v = Math.min(v, d[i - LEN - 1] + 4);
          if (x < LEN - 1) v = Math.min(v, d[i - LEN + 1] + 4);
        }
        d[i] = v;
      }
    }
    for (let y = H - 1; y >= 0; y--) {
      for (let x = LEN - 1; x >= 0; x--) {
        const i = y * LEN + x;
        let v = d[i];
        if (!v) continue;
        if (x < LEN - 1) v = Math.min(v, d[i + 1] + 3);
        if (y < H - 1) {
          v = Math.min(v, d[i + LEN] + 3);
          if (x < LEN - 1) v = Math.min(v, d[i + LEN + 1] + 4);
          if (x > 0) v = Math.min(v, d[i + LEN - 1] + 4);
        }
        d[i] = v;
      }
    }
    return d;
  }

  const S5_PAL = ['#3e0a22', '#620f34', '#8c1e46', '#b53a5a', '#dc6480'];
  /** seamless flesh texture (continuous over the whole level, unlike the repeating skin tile) */
  function s5_makeFlesh() {
    const rng = makeRng(555);
    const mk = (cell) => {
      const gw = Math.ceil(LEN / cell) + 3, gh = Math.ceil(H / cell) + 3;
      const lat = new Float32Array(gw * gh);
      for (let i = 0; i < lat.length; i++) lat[i] = rng();
      return { lat, gw, cell };
    };
    const n1 = mk(17), n2 = mk(7), n3 = mk(3.5);
    const samp = (n, x, y) => {
      const fx = x / n.cell, fy = y / n.cell, ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx);
      ty = ty * ty * (3 - 2 * ty);
      const o = iy * n.gw + ix;
      const a = n.lat[o], b = n.lat[o + 1], c = n.lat[o + n.gw], d = n.lat[o + n.gw + 1];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
    // jittered cell grid for the tissue-cell membranes
    const CS = 19;
    const cgw = Math.ceil(LEN / CS) + 3, cgh = Math.ceil(H / CS) + 3;
    const cpx = new Float32Array(cgw * cgh), cpy = new Float32Array(cgw * cgh), ctn = new Float32Array(cgw * cgh);
    for (let cy = 0; cy < cgh; cy++) {
      for (let cx = 0; cx < cgw; cx++) {
        const i = cy * cgw + cx;
        cpx[i] = (cx - 1 + 0.15 + rng() * 0.7) * CS;
        cpy[i] = (cy - 1 + 0.15 + rng() * 0.7) * CS;
        ctn[i] = rng() - 0.5;
      }
    }
    // returns a palette position 0..1 (or -1 on a cell membrane)
    return (x, y) => {
      const wx = Math.max(0, x + 3 * Math.sin(y * 0.12 + x * 0.013)), wy = clamp(y + 3 * Math.sin(x * 0.1), 0, H - 1);
      let v = 0.52 * samp(n1, wx, wy) + 0.3 * samp(n2, wx, wy) + 0.18 * samp(n3, wx, wy);
      const ccx = Math.floor(x / CS) + 1, ccy = Math.floor(y / CS) + 1;
      let d1 = 1e9, d2 = 1e9, tone = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = (ccy + dy) * cgw + (ccx + dx);
          const ex = x - cpx[i], ey = y - cpy[i];
          const dd = ex * ex + ey * ey;
          if (dd < d1) { d2 = d1; d1 = dd; tone = ctn[i]; } else if (dd < d2) d2 = dd;
        }
      }
      if (Math.sqrt(d2) - Math.sqrt(d1) < 1.05) return -1;
      v = clamp((v - 0.5) * 2.1 + 0.5 + tone * 0.16, 0, 0.999);
      return v;
    };
  }

  function s5_decorate(g, T) {
    const rng = makeRng(2024);
    const rr = (a, b) => a + rng() * (b - a);
    const dist = s5_distField(T);
    const depthAt = (x, y) => {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= LEN || y >= H) return 99;
      return dist[y * LEN + x] / 3;
    };

    /* 1) depth shading + wet sheen on downward facing edges */
    const img = g.getImageData(0, 0, LEN, H);
    const px = img.data;
    const deep = [0x1e, 0x03, 0x0d];
    const sheen = [0xd8, 0x58, 0x78];
    const flesh = s5_makeFlesh();
    const pal = S5_PAL.map((c) => Sprites.toRgb(c));
    for (let x = 0; x < LEN; x++) {
      const tt = s5_tintAt(x);
      const amt = tt[3];
      for (let y = 0; y < H; y++) {
        const i = y * LEN + x, o = i * 4;
        const dd = dist[i];
        if (!dd) continue;
        if (dd >= 9) {
          // interior: replace the repeating skin tile with the seamless flesh texture
          const v = flesh(x, y);
          const c = v < 0 ? pal[1] : pal[clamp(Math.floor(v * 5 + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.8), 0, 4)];
          px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
        }
        if (amt > 0.005 && dd > 3) {
          px[o] += (tt[0] - px[o]) * amt;
          px[o + 1] += (tt[1] - px[o + 1]) * amt;
          px[o + 2] += (tt[2] - px[o + 2]) * amt;
        }
        if (dd === 6 && !T.solid(x, y + 2) && T.solid(x, y + 1)) {
          // second row above a downward facing surface: glossy rim light
          px[o] = sheen[0]; px[o + 1] = sheen[1]; px[o + 2] = sheen[2];
          continue;
        }
        if (dd < 9) continue;
        let k = clamp((dd / 3 - 3) / 30, 0, 1);
        k = s5_smooth(k) * 0.72;
        const q = Math.floor(k * 6 + BAYER4[(y & 3) * 4 + (x & 3)]) / 6;
        if (q > 0) {
          px[o] += (deep[0] - px[o]) * q;
          px[o + 1] += (deep[1] - px[o + 1]) * q;
          px[o + 2] += (deep[2] - px[o + 2]) * q;
        }
      }
    }
    g.putImageData(img, 0, 0);

    /* 2) vein networks running under the surface */
    const stack = [];
    const veinDark = '#3c0820', veinMid = '#6e1a3c', veinHi = '#c4486a';
    const seeds = [];
    for (let x = 20; x < LEN - 10; x += rr(46, 96)) seeds.push(x);
    for (const sx of seeds) {
      for (const wall of ['f', 'c']) {
        if (rng() < 0.45) continue;
        const sy = wall === 'f' ? T.floorTop(sx) + rr(9, 22) : T.ceilBottom(sx) - rr(9, 22);
        if (depthAt(sx, sy) < 6) continue;
        stack.push({ x: sx, y: sy, a: rng() < 0.5 ? rr(-0.5, 0.5) : Math.PI + rr(-0.5, 0.5), life: Math.floor(rr(60, 150)), w: 2, pref: rr(9, 20) });
        let guard = 0;
        while (stack.length && guard++ < 60) {
          const v = stack.pop();
          let { x, y, a } = v;
          for (let i = 0; i < v.life; i++) {
            let best = a, bs = 1e9;
            for (const da of [-0.3, 0, 0.3]) {
              const aa = a + da + (rng() - 0.5) * 0.35;
              const d = depthAt(x + Math.cos(aa) * 3, y + Math.sin(aa) * 3);
              const sc = Math.abs(d - v.pref) + (d < 5 ? 60 : 0) + Math.abs(da) * 3;
              if (sc < bs) { bs = sc; best = aa; }
            }
            a = best;
            x += Math.cos(a);
            y += Math.sin(a);
            if (depthAt(x, y) < 5) break;
            const ix = Math.floor(x), iy = Math.floor(y);
            if (v.w >= 2) {
              g.fillStyle = veinDark;
              g.fillRect(ix - 1, iy - 1, 3, 3);
              g.fillStyle = veinMid;
              g.fillRect(ix - 1, iy - 1, 2, 2);
              if (i % 3 !== 2) { g.fillStyle = veinHi; g.fillRect(ix - 1, iy - 1, 1, 1); }
            } else {
              g.fillStyle = veinDark;
              g.fillRect(ix, iy, 1, 1);
              if (i % 4 === 0) { g.fillStyle = veinMid; g.fillRect(ix, iy - 1, 1, 1); }
            }
            if (v.w >= 2 && i > 12 && i % 19 === 0 && rng() < 0.6 && stack.length < 8) {
              stack.push({ x, y, a: a + (rng() < 0.5 ? -1 : 1) * rr(0.6, 1.1), life: Math.floor((v.life - i) * 0.7), w: 1, pref: v.pref + rr(-3, 5) });
            }
          }
        }
      }
    }

    /* 3) boils / pustules just under the surface, and wet glints on the surface */
    const boil = (x, y, r) => {
      x = Math.round(x); y = Math.round(y);
      if (depthAt(x, y) < r + 3) return;
      g.fillStyle = '#4a0a26';
      s5_disc(g, x, y, r + 1);
      g.fillStyle = '#b03256';
      s5_disc(g, x, y, r);
      g.fillStyle = '#e0607e';
      s5_disc(g, x - 1, y - 1, Math.max(0.5, r - 1.2));
      g.fillStyle = '#ffc0d0';
      g.fillRect(x - Math.round(r * 0.5), y - Math.round(r * 0.5), 1, 1);
    };
    for (let x = 30; x < LEN - 10; x += rr(20, 46)) {
      const r = rr(2, 4.4);
      if (rng() < 0.55) boil(x, T.floorTop(x) + rr(7, 15), r);
      if (rng() < 0.55) boil(x + rr(-8, 8), T.ceilBottom(x) - rr(7, 15), r);
    }
    for (let x = 6; x < LEN - 6; x += rr(9, 22)) {
      // glints on top surfaces (floor) and on the glossy underside (ceiling)
      const ft = T.floorTop(x);
      if (ft < H - 8 && depthAt(x, ft + 1) >= 1) {
        g.fillStyle = '#ffe0e8';
        g.fillRect(x, ft + 1, rng() < 0.5 ? 3 : 2, 1);
      }
      const cb = T.ceilBottom(x);
      if (cb > 8) {
        g.fillStyle = '#ffd0dc';
        g.fillRect(x + 3, cb - 3, 2, 1);
      }
    }
  }

  /* ------------------------------------------------------------
   * background: pulsing vein / organ layers, tissue folds, drifting spores
   * ------------------------------------------------------------ */
  const BEAT = 104; // frames per heartbeat
  let s5_bp = 0, s5_lastT = -1;
  /** "lub-dub" brightness pulse 0..1 (the heart races while the boss is being fought) */
  const s5_beat = (t) => {
    if (t !== s5_lastT) {
      s5_lastT = t;
      s5_bp = (s5_bp + 1 / (G.bossPhase === 'fight' ? 74 : BEAT)) % 1;
    }
    const a = (s5_bp - 0.06) / 0.05, b = (s5_bp - 0.24) / 0.06;
    return Math.min(1, Math.exp(-a * a) + 0.62 * Math.exp(-b * b));
  };
  const s5_boost = () => (G.bossPhase ? 1.4 : 1);

  /** soft dithered blob painted straight into a canvas context */
  function s5_haze(g, P, cx, cy, rx, ry, col, strength) {
    g.fillStyle = col;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      if (y < 0 || y >= H) continue;
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x - cx) / rx, v = (y - cy) / ry;
        const t = 1 - Math.sqrt(u * u + v * v);
        if (t <= 0) continue;
        if (t * strength + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.5 > 0.28) g.fillRect(((x % P) + P) % P, y, 1, 1);
      }
    }
  }

  /** a tileable strip with a branching vessel network; returns {base, glow} */
  function s5_bakeVeins(P, seed, o) {
    const rng = makeRng(seed);
    const rr = (a, b) => a + rng() * (b - a);
    const base = Sprites.makeCanvas(P, H), glow = Sprites.makeCanvas(P, H);
    const gb = base.getContext('2d'), gg = glow.getContext('2d');
    // tissue haze
    for (let k = 0; k < o.hazes; k++) {
      const cx = rr(0, P), cy = rr(10, H - 10);
      s5_haze(gb, P, cx, cy, rr(40, 90), rr(26, 60), rng() < 0.55 ? o.hazeDark : o.hazeLite, rr(1.0, 1.7));
    }
    // collect vessel paths, then paint them pass by pass so junctions merge cleanly
    const paths = [];
    const walk = (x, y, a, len, w, depth) => {
      const path = [];
      path.depth = depth;
      paths.push(path);
      for (let i = 0; i < len; i++) {
        a += (rng() - 0.5) * 0.16;
        if (y < 26) a += 0.05;
        if (y > H - 26) a -= 0.05;
        x += Math.cos(a) * 1.6;
        y += Math.sin(a) * 1.6;
        path.push({ x, y, r: w / 2 });
        if (depth < 2 && i > 24 && i % o.branchEvery === 0 && rng() < o.branchP) walk(x, y, a + (rng() < 0.5 ? -1 : 1) * rr(0.45, 0.9), Math.floor(len * rr(0.4, 0.6)), Math.max(2.4, w * 0.58), depth + 1);
        w = Math.max(2, w - 0.006);
      }
    };
    for (let k = 0; k < o.trunks; k++) walk(rr(0, P), rr(30, H - 30), rr(-0.45, 0.45) + (rng() < 0.5 ? 0 : Math.PI), Math.floor(rr(o.len * 0.6, o.len)), o.w, 0);
    // vessels thin out towards their ends (trunks at both ends, branches at the tip)
    for (const path of paths) {
      const n = path.length;
      path.forEach((q, i) => {
        const u = i / Math.max(1, n - 1);
        const tail = clamp((1 - u) / 0.28, 0, 1);
        const head = path.depth === 0 ? clamp(u / 0.22, 0, 1) : 1;
        q.r = Math.max(1.1, q.r * s5_smooth(Math.min(tail, head)));
      });
    }
    const disc = (g, x, y, r, col) => {
      g.fillStyle = col;
      const X = ((Math.round(x) % P) + P) % P;
      s5_disc(g, X, Math.round(y), r);
      if (X + r >= P) s5_disc(g, X - P, Math.round(y), r);
      if (X - r < 0) s5_disc(g, X + P, Math.round(y), r);
    };
    for (const path of paths) for (const q of path) disc(gb, q.x, q.y, q.r + 1, o.dark);
    for (const path of paths) for (const q of path) disc(gb, q.x, q.y, q.r, o.mid);
    for (const path of paths) for (const q of path) if (q.r > 1.5) disc(gb, q.x - q.r * 0.28, q.y - q.r * 0.28, q.r * 0.55, o.hi);
    for (const path of paths) for (const q of path) disc(gg, q.x - q.r * 0.2, q.y - q.r * 0.2, Math.max(0.6, q.r * 0.42), q.r > 2.4 ? o.glow : o.glowThin);
    return { base, glow };
  }

  /** big soft cell walls far behind everything (tissue foam) */
  function s5_cellLayer(P, seed, speed, drift, o) {
    const rng = makeRng(seed);
    const cv = Sprites.makeCanvas(P, H);
    const g = cv.getContext('2d');
    const put = (x, y, col) => {
      if (y < 0 || y >= H) return;
      g.fillStyle = col;
      const X = ((Math.round(x) % P) + P) % P;
      g.fillRect(X, Math.round(y), 1, 1);
    };
    for (let k = 0; k < o.n; k++) {
      const cx = rng() * P, cy = 10 + rng() * (H - 20), r = o.rmin + rng() * (o.rmax - o.rmin);
      s5_haze(g, P, cx, cy, r, r * (0.8 + rng() * 0.3), o.fill, 2.4);
      const steps = Math.ceil(r * TAU);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * TAU;
        const lit = a > Math.PI * 1.02 && a < Math.PI * 1.55;
        put(cx + Math.cos(a) * r, cy + Math.sin(a) * r, lit ? o.rimLit : o.rim);
        if (lit && (i & 1) === 0) put(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), o.rimLit2);
      }
      // nucleus
      const nr = r * 0.22;
      s5_haze(g, P, cx + r * 0.1, cy + r * 0.08, nr, nr, o.nucleus, 2.2);
    }
    return {
      kind: 'custom',
      draw(ctx, camX, t) {
        const off = Math.floor(camX * speed + t * drift) % P;
        ctx.drawImage(cv, -off, 0);
        if (P - off < W) ctx.drawImage(cv, P - off, 0);
      },
    };
  }

  /** slow colour wash that follows the zone tint table */
  const s5_zoneLayer = () => ({
    kind: 'custom',
    draw(ctx, camX) {
      const tt = s5_tintAt(camX + W / 2);
      if (tt[3] < 0.01) return;
      ctx.globalAlpha = Math.min(0.4, tt[3] * 1.2);
      ctx.fillStyle = 'rgb(' + (tt[0] | 0) + ',' + (tt[1] | 0) + ',' + (tt[2] | 0) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    },
  });

  /** parallax vein layer whose highlights throb with the heartbeat */
  function s5_veinLayer(P, seed, speed, drift, o) {
    const v = s5_bakeVeins(P, seed, o);
    return {
      kind: 'custom',
      draw(ctx, camX, t) {
        const off = Math.floor(camX * speed + t * drift) % P;
        if (o.dimInBoss && G.bossPhase) ctx.globalAlpha = 0.5;
        ctx.drawImage(v.base, -off, 0);
        if (P - off < W) ctx.drawImage(v.base, P - off, 0);
        ctx.globalAlpha = 1;
        const b = s5_beat(t);
        if (b > 0.04) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.min(1, b * o.pulse * s5_boost());
          ctx.drawImage(v.glow, -off, 0);
          if (P - off < W) ctx.drawImage(v.glow, P - off, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      },
    };
  }

  /** slow drifting spores / floating plankton */
  function s5_sporeLayer(n, seed, par, spd) {
    const rng = makeRng(seed);
    const cols = ['#ff8a9c', '#ffc0cc', '#ffd8a0', '#ff6a80'];
    const list = Array.from({ length: n }, () => ({ x: rng() * (W + 40), y: rng() * H, s: 0.5 + rng() * 0.9, ph: rng() * TAU, big: rng() < 0.2, c: cols[Math.floor(rng() * cols.length)] }));
    return {
      kind: 'custom',
      draw(ctx, camX, t) {
        for (const p of list) {
          let x = (p.x - camX * par - t * spd * p.s) % (W + 40);
          if (x < 0) x += W + 40;
          x -= 20;
          const y = (((p.y + Math.sin(t * 0.021 * p.s + p.ph) * 7 - t * 0.05 * p.s) % H) + H) % H;
          const a = 0.45 + 0.35 * Math.sin(t * 0.05 + p.ph);
          ctx.globalAlpha = a;
          ctx.fillStyle = p.c;
          if (p.big) {
            ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
            ctx.globalAlpha = a * 0.35;
            ctx.fillRect(Math.round(x) - 1, Math.round(y), 4, 2);
            ctx.fillRect(Math.round(x), Math.round(y) - 1, 2, 4);
          } else ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
        ctx.globalAlpha = 1;
      },
    };
  }

  /** whole-cavern flush on every beat */
  const s5_flushLayer = () => ({
    kind: 'custom',
    draw(ctx, camX, t) {
      const b = s5_beat(t);
      if (b < 0.05) return;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = b * 0.07 * s5_boost();
      ctx.fillStyle = '#ff2a50';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  });

  /* ------------------------------------------------------------
   * the stage
   * ------------------------------------------------------------ */
  STAGES.push({
    id: 5,
    name: 'TENTACLE',
    sub: 'THE LIVING CAVERN',
    music: 'stage5',
    bossMusic: 'boss',
    scroll: 0.6,
    bossX: BOSS_X,
    scrollMap: [[1840, 0.55], [2600, 0.6]],
    checkpoints: [0, 820, 1620, 2600, 3240],
    onReset(g) {
      g.spawn('s5_pulse', { x: -60, y: -60 });
    },

    terrain: () => {
      const PR = s5_profile();
      return {
        length: LEN,
        floor: [{ type: 'fn', x0: 0, x1: LEN - 1, fn: (x) => PR.F[Math.round(x)] }],
        ceil: [{ type: 'fn', x0: 0, x1: LEN - 1, fn: (x) => PR.C[Math.round(x)] }],
        shapes(g) {
          g.fillStyle = '#fff';
          for (const b of PR.blobs) {
            g.beginPath();
            if (b.wall === 'f') {
              g.ellipse(b.x, H - b.hc, b.rx, b.ry, 0, 0, TAU);
              g.fill();
              g.fillRect(b.x - b.rx, H - b.hc, b.rx * 2, b.hc + 1); // root the lump in the wall so no slit or island is left
            } else {
              g.ellipse(b.x, b.hc, b.rx, b.ry, 0, 0, TAU);
              g.fill();
              g.fillRect(b.x - b.rx, 0, b.rx * 2, b.hc);
            }
          }
        },
        decorate: s5_decorate,
        skin: {
          kind: 'organic',
          pal: S5_PAL,
          outline: '#220510', hi: '#ff9fb4', hi2: '#e0708c', lo: '#2e0616', vein: '#380820', seed: 5,
        },
      };
    },

    background: () =>
      Backgrounds.make([
        { kind: 'gradient', stops: [[0, '#14030d'], [0.5, '#26051a'], [1, '#3a0a22']], steps: 18 },
        s5_zoneLayer(),
        s5_cellLayer(768, 3, 0.05, 0.01, { n: 12, rmin: 22, rmax: 52, fill: '#1e0510', rim: '#48102a', rimLit: '#7a2048', rimLit2: '#5a1636', nucleus: '#2e0a1a' }),
        s5_veinLayer(512, 31, 0.10, 0.02, { hazes: 14, hazeDark: '#1a040e', hazeLite: '#38091f', trunks: 4, len: 420, w: 9, branchEvery: 47, branchP: 0.5, dark: '#18030a', mid: '#360a1e', hi: '#4c1226', glow: '#4a1029', glowThin: '#2e0a1a', pulse: 0.7 }),
        { kind: 'ridge', color: '#3a0c22', color2: '#1c0510', edge: '#7a2048', hMin: 40, hMax: 100, speed: 0.2, drift: 0.01, seed: 5, jag: 0.25, scale: 52 },
        { kind: 'ridge', color: '#340a1e', color2: '#1a0410', edge: '#6a1a40', hMin: 30, hMax: 80, speed: 0.2, drift: 0.01, seed: 9, jag: 0.25, scale: 60, top: true },
        s5_veinLayer(512, 47, 0.24, 0.03, { dimInBoss: true, hazes: 0, trunks: 2, len: 300, w: 6, branchEvery: 53, branchP: 0.5, dark: '#1e040e', mid: '#3e0c24', hi: '#561634', glow: '#5c1632', glowThin: '#3e0e24', pulse: 0.7 }),
        s5_sporeLayer(26, 5, 0.32, 0.2),
        s5_flushLayer(),
      ]),

    script(S) {
      const T = G.terrain;
      // find the flattest spot near a world x on the floor ('f') or ceiling ('c')
      const used = { f: [], c: [] };
      const flat = (wx, wall, minWx = -1) => {
        let best = wx, bv = 1e9;
        for (let d = 0; d <= 44; d += 2) {
          for (const cand of d ? [wx - d, wx + d] : [wx]) {
            if (cand < minWx) continue;
            if (used[wall].some((u) => Math.abs(u - cand) < 30)) continue; // keep pods, webs and tentacles apart
            let lo = 999, hi = -999;
            for (let k = -9; k <= 9; k += 3) {
              const v = wall === 'f' ? T.floorTop(cand + k) : T.ceilBottom(cand + k);
              lo = Math.min(lo, v);
              hi = Math.max(hi, v);
            }
            const score = Math.max(0, hi - lo - 2) * 8 + d * 0.5; // up to 2px of unevenness is fine
            if (score < bv) { bv = score; best = cand; }
          }
        }
        used[wall].push(best);
        return best;
      };
      // minWx: never move an anchored enemy nearer to a checkpoint than this (keeps the first seconds after a respawn harmless)
      const gnd = (wx, type, o, minWx) => S.ground(flat(wx, 'f', minWx), type, o);
      const cei = (wx, type, o, minWx) => S.ceil(flat(wx, 'c', minWx), type, o);

      /* ---- A: the gullet (calm) ---- */
      S.wave(110, 's5_leech', { n: 5, gap: 14, y: 96, amp: 22, carry: 'last' });
      S.wave(215, 's5_leech', { n: 5, gap: 14, y: 138, amp: 22 });
      S.wave(290, 's5_leech', { n: 6, gap: 12, y: 112, amp: 34, carry: 'last' });
      gnd(330, 's5_polyp');
      gnd(390, 's5_tentacle', { n: 7 });

      /* ---- B: tentacle garden ---- */
      cei(450, 's5_tentacle', { n: 7, fire: 180 });
      S.wave(470, 's5_leech', { n: 5, gap: 14, y: 92, amp: 20 });
      gnd(510, 's5_tentacle', { n: 8, fire: 190, reach: true });
      cei(560, 's5_polyp');
      S.wave(560, 's5_leech', { n: 6, gap: 13, y: 130, amp: 26, carry: 'last' });
      cei(620, 's5_tentacle', { n: 8, fire: 200, reach: true });
      gnd(650, 's5_polyp', { burst: 'aim' });
      gnd(700, 's5_tentacle', { n: 7, fire: 180, carry: true });

      /* ---- C: eye chamber ---- */
      S.wave(925, 's5_leech', { n: 5, gap: 14, y: 100, amp: 24, carry: 'last' });
      S.wave(940, 's5_eye', { n: 1, y: 112 });
      gnd(1030, 's5_polyp');
      S.wave(1040, 's5_eye', { n: 2, gap: 40, y: 80, dy: 60 });
      S.wave(1110, 's5_leech', { n: 6, gap: 13, y: 112, amp: 36 });
      cei(1130, 's5_tentacle', { n: 6, fire: 190 });
      S.wave(1150, 's5_eye', { n: 2, gap: 30, y: 70, dy: 80, spread: 0.45 });
      S.wave(1190, 's5_eye', { n: 1, y: 112, carry: true });

      /* ---- D: the throat, sticky membranes ---- */
      cei(1290, 's5_web', { len: 72 });
      S.wave(1270, 's5_leech', { n: 5, gap: 14, y: 140, amp: 10 });
      gnd(1335, 's5_tentacle', { n: 6, fire: 190 });
      gnd(1372, 's5_web', { len: 70 });
      cei(1395, 's5_polyp');
      S.wave(1400, 's5_leech', { n: 6, gap: 13, y: 112, amp: 20, carry: 'last' });
      cei(1452, 's5_web', { len: 74 });
      gnd(1470, 's5_tentacle', { n: 7, fire: 180, reach: true });
      S.wave(1500, 's5_eye', { n: 2, gap: 34, y: 78, dy: 60 });
      cei(1525, 's5_web', { len: 74 });
      gnd(1540, 's5_web', { len: 70 });

      /* ---- quiet stretch: rebuild power before the Mass ---- */
      S.wave(1730, 's5_leech', { n: 5, gap: 14, y: 112, amp: 26, carry: 'last' });

      /* ---- E: mid-boss, the Tentacle Mass ---- */
      S.at(1850, () => {
        G.showBanner(['CAUTION', 'TENTACLE MASS'], 120);
        sfx('warning');
        G.spawn('s5_mass', { x: W + 60, y: 112, carry: true, leaveX: 2590 });
      });
      S.wave(2250, 's5_leech', { n: 4, gap: 16, y: 60, amp: 14, carry: 'last' });

      /* ---- F: the gauntlet ---- */
      S.wave(2700, 's5_leech', { n: 5, gap: 14, y: 100, amp: 24, carry: 'last' });
      S.wave(2760, 's5_eye', { n: 2, gap: 40, y: 80, dy: 60 });
      S.wave(2820, 's5_leech', { n: 6, gap: 12, y: 112, amp: 30, speed: 1.7 });
      gnd(2905, 's5_tentacle', { n: 8, fire: 190, reach: true }, 2900);
      cei(2950, 's5_tentacle', { n: 8, fire: 200, reach: true, first: 60 });
      gnd(2990, 's5_polyp', { burst: 'bugs' });
      S.wave(2985, 's5_eye', { n: 2, gap: 30, y: 74, dy: 70, spread: 0.5 });
      cei(3025, 's5_tentacle', { n: 7, fire: 170, reach: true });
      gnd(3062, 's5_tentacle', { n: 8, fire: 180, reach: true, first: 40 });
      cei(3100, 's5_polyp', { burst: 'aim' });
      S.wave(3110, 's5_leech', { n: 6, gap: 13, y: 112, amp: 32, speed: 1.7, carry: 'last' });
      gnd(3140, 's5_tentacle', { n: 6, fire: 220 });
      cei(3140, 's5_tentacle', { n: 6, first: 80 });
      gnd(3180, 's5_polyp');

      /* ---- G: recovery ---- */
      S.wave(3345, 's5_leech', { n: 5, gap: 14, y: 100, amp: 24, carry: 'last' });
      S.wave(3360, 's5_eye', { n: 1, y: 112 });
      S.wave(3375, 's5_leech', { n: 5, gap: 14, y: 140, amp: 24, carry: 'last' });
      S.wave(3400, 's5_leech', { n: 4, gap: 14, y: 90, amp: 20, carry: 'last' });

      S.boss(BOSS_X, 'bigcore', { level: 5 });
    },
  });
})();
