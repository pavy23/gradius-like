'use strict';
/* =============================================================
 * STAGE 5 — TENTACLE
 * Inside a living alien body: a glistening flesh cavern with vein
 * networks, wall-anchored tentacles you can cut apart, polyp pods
 * that burst into spores, blinking eye pods, leech swimmers and
 * sticky membranes. Mid-boss: the Tentacle Mass. Boss: the Maw Leviathan.
 *
 * Layout (camera x): A gullet 0-400 (calm intro) - B tentacle garden
 * 400-820 - C eye chamber 820-1200 - D throat with sticky membranes and
 * squeeze valves 1200-1620 - quiet stretch - E mid-boss chamber 1840-2600
 * (scroll slows to 0.55) - F gauntlet 2600-3240 - G recovery 3240-3510
 * (shoals of gold leeches that all carry a capsule, so a ship restarting at
 * the last checkpoint can rebuild its power) - boss arena.
 * Checkpoints 0 / 820 / 1620 / 2600 / 3240.
 *
 * Enemies (all keys are prefixed s5_; spawn options in brackets):
 *  s5_tentacle  wall-anchored chain of 5-10 segments, one hit box per segment
 *               (recomputed every frame). Cutting a segment severs everything
 *               beyond it. [n, fire (tip gun period), reach (stretches toward
 *               the player), first, trigger, every, carry (tip drops a capsule),
 *               sway, lean, sl, r0, r1]
 *  s5_polyp     wall pod that bursts into slow, shootable spores [burst:
 *               'ring' | 'aim' | 'bugs', n, carry]
 *  s5_eye       floating blinking eye pod (invulnerable while shut) [cycle,
 *               spread, amp, speed, carry]
 *  s5_leech     sine-path swimmer [amp, freq, speed, carry]
 *  s5_web       sticky membrane: harmless, drags the ship, swallows shots [len]
 *  s5_mass      mid-boss: six severable arms + an eye that is exposed while it
 *               spits spores or once every arm is gone [leaveX, homeX, eyeHp]
 *  s5_pulse     invisible controller (wall rim pulse, glints, cilia)
 *  s5_maw       boss: a colossal jawed maw that plugs the end of the cavern. Armoured jaws (a row of fangs each) hinge on a wet
 *               throat; the glowing core deep inside can only be hit through the gap between the teeth. It spits arcing
 *               bile, then telegraphs a LUNGE (ghost of the closed maw + danger line + roar) and SNAPS shut; phase 2 adds
 *               a tongue lash along the floor and spore rings, phase 3 double bites and bile volleys.
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
  // capsule-carrying eye pods wear a red / orange lid ring
  Sprites.recolor('s5_eyelid', 's5_eyelid_c', { '#3a1466': '#7a1020', '#6a34a4': '#d02838', '#8a46c6': '#f04a3a', '#a468d8': '#ff9a5a', '#160a2a': '#2a0810' });

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
      e.vy = clamp(e.mid + e.rel + Math.sin(e.t * 0.035 + e.ph) * e.amp, T.ceilBottom(wx) + 13, T.floorTop(wx) - 13) - e.y; // moved by the engine (vx/vy)
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
      Sprites.draw(c, e.carry ? 's5_eyelid_c' : 's5_eyelid', e.x, e.y, { frame: clamp(Math.round(e.lid * 3), 0, 3), flash: fl });
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
      const wx = G.camX + e.x + e.vx;
      e.mid += (s5_mid(wx) - e.mid) * 0.07;
      const ty = clamp(e.mid + e.rel + Math.sin(e.t * e.freq + e.ph) * e.amp, T.ceilBottom(wx) + 8, T.floorTop(wx) - 8);
      e.vy = ty - e.y; // free fliers move by vx/vy (the engine adds them after update): the swim stays readable to an autopilot
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

  /* =============================================================
   * BOSS: MAW LEVIATHAN
   *
   * A colossal jawed maw plugs the end of the cavern. Two armoured jaws hinge on a wet throat; the glowing core
   * hangs deep inside it and can only be hit through the gap between the teeth. The maw spits arcing bile, lunges
   * and SNAPS (anything inside the mouth or the jaws at that instant dies), and later lashes a tongue along the
   * floor, breathes spore rings and bites twice in a row.
   *
   *   art      jaws are baked at 41 opening angles (distance-field shaded flesh, ivory fangs); cheeks, throat, eye
   *   geometry s5m_pt() maps a point of a jaw (s along the gum curve, v outward) to the screen for any opening
   *            angle; the same function builds the hurting boxes, so what is drawn is what hurts
   *   fight    enter -> open (attacks) -> wind (telegraph) -> lunge -> snap -> recover -> open ...  + roar between phases
   * ============================================================= */
  const S5M = {
    HOME: 232, // x of the hinge line when the maw is at rest
    START: 360, // where it waits behind the cavern wall (the fangs stay off screen)
    P0: 7, // jaw pivot distance from the mouth axis with the jaws shut: the lips are pressed together
    P1: 30, // ... and wide open: the head halves have slid apart to uncover the throat
    L: 86, // jaw length along the gum line
    TIP: 7, // distance between the closed gum line and the mouth axis at the tip (= P0: a shut maw is sealed along its length)
    T0: 30,
    T1: 13, // skin thickness at the hinge / near the tip
    GUM: 5, // thickness of the pink gum lining
    STEP: 1.25, // degrees per baked jaw frame
    NF: 41, // baked frames: 0 .. 50 degrees
    A_IDLE: 34,
    A_WIDE: 45, // (re-solved below from the wanted tip gaps)
  };
  const S5M_SKIN = ['#1a0a38', '#2f1668', '#4c2a98', '#7448c4', '#a37af0', '#dcc4ff'];
  const S5M_OUT = '#10062a';
  const S5M_GUMC = ['#ffb0c8', '#f06a94', '#c8386a', '#7a1c48'];
  const S5M_IV = { hi: '#ffffff', lit: '#f6edc8', mid: '#d8c894', shade: '#9a8858', dark: '#6a5a38' };
  const S5M_RED = ['#12030c', '#2c0618', '#5a0c2a', '#8c1840', '#c42c58', '#ff6a8c'];
  // fangs: [s along the gum curve, half base width, length, forward lean]
  const S5M_FU = [[10, 3.2, 4, 0.4], [22, 3.6, 7, 0.8], [34, 4, 10, 1.2], [46, 4.2, 12, 1.6], [58, 4.4, 14, 2], [70, 4.6, 16, 2.6], [82, 5.2, 19, 5]];
  const S5M_FL = [[16, 3.4, 5, 0.6], [28, 3.8, 8.5, 1], [40, 4.1, 11, 1.4], [52, 4.3, 13, 1.8], [64, 4.5, 15, 2.2], [76, 4.8, 17, 3.2]];

  const s5m_rad = (d) => (d * Math.PI) / 180;
  const s5m_toDeg = (a) => (a * 180) / Math.PI;
  /** pivot distance from the mouth axis for a jaw opened by angle a (radians): the lips part during the first 14 degrees */
  const s5m_P = (a) => S5M.P0 + (S5M.P1 - S5M.P0) * s5_smooth(clamp(s5m_toDeg(a) / 14, 0, 1));
  /** distance from the mouth axis to the cheek lip (half the throat opening) */
  const s5m_lip = (a) => s5m_P(a) - S5M.GUM + 1;
  // the gum curve sinks toward the mouth axis, so the lining of a shut maw lies flat along the axis
  const s5m_D = (s, P) => (s <= 0 ? 0 : (P - S5M.TIP) * Math.pow(s / S5M.L, 1.15));
  const s5m_Dp = (s, P) => (s <= 0 ? 0 : ((P - S5M.TIP) * 1.15 * Math.pow(s / S5M.L, 0.15)) / S5M.L);
  /** outward skin thickness at s: heavy at the hinge, slimmer in the middle, a nose bulb, a blunt rounded snout */
  const s5m_T = (s) => {
    if (s <= 0) return S5M.T0;
    const u = Math.min(1, s / S5M.L);
    let t = S5M.T0 + (S5M.T1 - S5M.T0) * Math.pow(u, 0.7) + 3.2 * Math.exp(-Math.pow((s - 70) / 9, 2));
    const e = s - (S5M.L - 9);
    if (e > 0) t *= Math.sqrt(Math.max(0, 1 - (e / 9) * (e / 9)));
    return t;
  };
  // dorsal spikes on the outer edge: [s, height, lean]
  const S5M_SPIKE = [[12, 6, 4], [27, 7, 4.5], [41, 8, 5], [55, 7, 4.5], [68, 6, 4]];
  const S5M_EYE = [11, 18.5]; // eye on the upper jaw: [s, v] in jaw coordinates
  /**
   * Point of the UPPER jaw: s along the gum curve (0 at the pivot, L at the snout), v outward (up) from it, jaw opened by
   * angle a (radians). Result in axis-centred coordinates relative to the hinge line (x right, y down, mouth axis = 0).
   * The lower jaw is the mirror image (negate y).
   */
  function s5m_pt(s, v, a, out) {
    const P = s5m_P(a), d = s5m_Dp(s, P), n = Math.sqrt(1 + d * d);
    const x0 = -s - (v * d) / n, y0 = s5m_D(s, P) - v / n; // closed pose, relative to the pivot
    const c = Math.cos(a), sn = Math.sin(a);
    out[0] = x0 * c - y0 * sn;
    out[1] = -P + x0 * sn + y0 * c;
    return out;
  }
  /** polygons (upper-jaw convention) of one jaw at opening angle a: skin body, gum stripes, fangs */
  function s5m_shapes(a, lower) {
    const pt = (s, v) => s5m_pt(s, v, a, [0, 0]);
    const out = [], inn = [];
    for (let s = -12; s <= S5M.L + 0.01; s += 3) out.push(pt(s, s5m_T(s)));
    for (let s = S5M.L; s >= -12; s -= 3) inn.push(pt(s, -S5M.GUM));
    const stripe = (va, vb) => {
      const p = [];
      for (let s = -12; s <= S5M.L - 1; s += 3) p.push(pt(s, va));
      for (let s = S5M.L - 1; s >= -12; s -= 3) p.push(pt(s, vb));
      return p;
    };
    const gum = [stripe(0.6, -1.4), stripe(-1.4, -3.4), stripe(-3.4, -S5M.GUM - 0.4)];
    const vb = -S5M.GUM + 0.6;
    const fangs = (lower ? S5M_FL : S5M_FU).map(([s, hw, len, lean]) => {
      const b0 = pt(s - hw, vb), b1 = pt(s + hw, vb), bm = pt(s, vb), tp = pt(s + lean, vb - len);
      return { all: [b0, tp, b1], lit: [bm, b1, tp], shade: [b0, bm, tp], tip: tp };
    });
    const spikes = S5M_SPIKE.map(([sp, h, lean]) => {
      const T = s5m_T(sp), b0 = pt(sp - 3.4, s5m_T(sp - 3.4) - 1.2), b1 = pt(sp + 3.4, s5m_T(sp + 3.4) - 1.2), bm = pt(sp, T - 1.2), tp = pt(sp - lean, T + h);
      return { all: [b0, tp, b1], lit: [bm, b1, tp], shade: [b0, bm, tp] };
    });
    return { body: out.concat(inn), gum, fangs, spikes };
  }
  /** pixel-centre scanline walk over a polygon: row(y, xFrom, xTo) is called for every covered run */
  function s5m_scan(pts, w, h, row) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const xs = [];
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) {
      const yc = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.max(0, Math.round(xs[i])), xb = Math.min(w, Math.round(xs[i + 1]));
        if (xb > xa) row(y, xa, xb);
      }
    }
  }
  const s5m_polyMask = (mask, w, h, pts) => s5m_scan(pts, w, h, (y, xa, xb) => mask.fill(1, y * w + xa, y * w + xb));
  const s5m_polyFill = (buf, w, h, pts, col) => s5m_scan(pts, w, h, (y, xa, xb) => buf.fill(col, y * w + xa, y * w + xb));
  function s5m_lineFill(buf, w, h, x0, y0, x1, y1, col) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 400; n++) {
      if (x0 >= 0 && y0 >= 0 && x0 < w && y0 < h) buf[y0 * w + x0] = col;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** chamfer distance (px) from every mask pixel to the nearest empty pixel */
  function s5m_dist(mask, w, h) {
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 1e4 : 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = d[i];
        if (!v) continue;
        if (x > 0) v = Math.min(v, d[i - 1] + 1);
        if (y > 0) {
          v = Math.min(v, d[i - w] + 1);
          if (x > 0) v = Math.min(v, d[i - w - 1] + 1.4);
          if (x < w - 1) v = Math.min(v, d[i - w + 1] + 1.4);
        }
        d[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        let v = d[i];
        if (!v) continue;
        if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
        if (y < h - 1) {
          v = Math.min(v, d[i + w] + 1);
          if (x < w - 1) v = Math.min(v, d[i + w + 1] + 1.4);
          if (x > 0) v = Math.min(v, d[i + w - 1] + 1.4);
        }
        d[i] = v;
      }
    }
    return d;
  }
  /** css colour -> packed little-endian ABGR (cached) */
  const S5M_C32 = {};
  const s5m_c32 = (css) => {
    let v = S5M_C32[css];
    if (v === undefined) {
      const c = Sprites.toRgb(css);
      v = S5M_C32[css] = ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
    }
    return v;
  };
  /**
   * Shade every masked pixel like an inflated pillow lit from the top left (height = rounded profile of the distance to
   * the silhouette), dithered through a colour ramp. detail(x, y, q, lam) may return a colour override. Written straight
   * into an ImageData buffer (this runs ~85 times while the stage loads, so it has to be cheap); the caller puts it.
   */
  function s5m_shade(d, mask, dist, w, h, ramp, R, detail) {
    const z = new Float32Array(w * h);
    for (let i = 0; i < z.length; i++) {
      if (!mask[i]) continue;
      const u = Math.min(1, Math.max(0, dist[i] - 0.6) / R);
      z[i] = R * Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u)));
    }
    const img = d.g.createImageData(w, h), buf = new Uint32Array(img.data.buffer);
    const rc = ramp.map(s5m_c32), ll = Math.hypot(0.5, 0.62, 0.6), n = ramp.length;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        const zx = (z[i + 1] - z[i - 1]) * 0.5, zy = (z[i + w] - z[i - w]) * 0.5;
        const lam = clamp((0.5 * zx + 0.62 * zy + 0.6) / (Math.sqrt(zx * zx + zy * zy + 1) * ll), 0, 1);
        const q = clamp(Math.floor(lam * n * 1.05 + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.9), 0, n - 1);
        const ov = detail ? detail(x, y, q, lam) : null;
        buf[i] = ov ? s5m_c32(ov) : rc[q];
      }
    }
    return { img, buf };
  }
  const s5m_hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  /** one jaw: 41 frames, the pivot / mouth axis sits at pixel (PX, PY) of every frame */
  const S5M_JAW = {};
  function s5m_bakeJaw(name, lower) {
    const fy = lower ? -1 : 1;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let f = 0; f < S5M.NF; f += 5) {
      const sh = s5m_shapes(s5m_rad(f * S5M.STEP), lower);
      const all = sh.body.concat(...sh.fangs.map((q) => q.all), ...sh.spikes.map((q) => q.all));
      for (const p of all) {
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
        y0 = Math.min(y0, fy * p[1]); y1 = Math.max(y1, fy * p[1]);
      }
    }
    const PX = Math.ceil(-x0) + 4, PY = Math.ceil(-y0) + 4;
    const CW = Math.ceil(x1) + PX + 4, CH = Math.ceil(y1) + PY + 4;
    S5M_JAW[name] = { PX, PY, CW, CH };
    const warts = [[26, 14, 2.2], [48, 11, 1.8], [64, 8, 1.4], [36, 19, 1.7], [4, 8, 2.1], [58, 15, 1.5]];
    Sprites.painted(name, CW, CH, S5M.NF, (d, f) => {
      const a = s5m_rad(f * S5M.STEP), sh = s5m_shapes(a, lower);
      const toPx = (p) => [PX + p[0], PY + fy * p[1]];
      const mask = new Uint8Array(CW * CH);
      s5m_polyMask(mask, CW, CH, sh.body.map(toPx));
      const dist = s5m_dist(mask, CW, CH);
      const c = Math.cos(a), sn = Math.sin(a), Pa = s5m_P(a);
      const detail = (x, y, q, lam) => {
        // back to the closed-pose frame: s (along the jaw) and v (outward) of this pixel
        const rx = x + 0.5 - PX, ry = fy * (y + 0.5 - PY) + Pa;
        const xc = rx * c + ry * sn, yc = -rx * sn + ry * c;
        const s = -xc, v = s5m_D(s, Pa) - yc;
        if (v < -S5M.GUM - 1) return null;
        // plate seams across the jaw (carved: dark line + light lip)
        if (s > 6 && s < S5M.L - 7 && v > 2.5 && v < s5m_T(s) - 1.5) {
          const g = (((s - 9) % 15) + 15) % 15;
          if (g < 0.9) return S5M_SKIN[0];
          if (g < 1.8 && q > 1) return S5M_SKIN[Math.min(5, q + 1)];
        }
        // eye socket (upper jaw only) with a raised brow
        if (!lower) {
          const ex = (s - S5M_EYE[0]) / 9.5, ey = (v - S5M_EYE[1]) / 7.2, rr = Math.sqrt(ex * ex + ey * ey);
          if (rr < 1) return S5M_SKIN[0];
          if (rr < 1.3 && v > S5M_EYE[1]) return S5M_SKIN[Math.min(5, q + 2)];
        }
        // warts
        for (const [ws, wv, wr] of warts) {
          const dd = Math.sqrt((s - ws) * (s - ws) + (v - wv) * (v - wv));
          if (dd < wr) return dd < wr * 0.45 && x + y > 0 && s - ws < 0 && v - wv > 0 ? '#ffd8ec' : dd > wr * 0.8 ? '#6a2a78' : '#d890c8';
        }
        // mottling
        if (s5m_hash(x, y) < 0.07 && q > 0) return S5M_SKIN[q - 1];
        if (lam > 0.93 && s5m_hash(x + 7, y + 3) < 0.35) return '#ffffff';
        return null;
      };
      const { img, buf } = s5m_shade(d, mask, dist, CW, CH, S5M_SKIN, 9, detail);
      sh.gum.forEach((p, i) => s5m_polyFill(buf, CW, CH, p.map(toPx), s5m_c32(S5M_GUMC[i])));
      // ridges along the lining
      const ridge = s5m_c32(S5M_GUMC[3]);
      for (let s = 4; s < S5M.L - 2; s += 4) {
        const A = toPx(s5m_pt(s, -S5M.GUM + 0.7, a, [0, 0])), B = toPx(s5m_pt(s, -2.4, a, [0, 0]));
        s5m_lineFill(buf, CW, CH, A[0], A[1], B[0], B[1], ridge);
      }
      const bone = [s5m_c32('#8a7a5a'), s5m_c32('#d8c894'), s5m_c32('#5e5038')];
      for (const sp of sh.spikes) {
        s5m_polyFill(buf, CW, CH, sp.all.map(toPx), bone[0]);
        s5m_polyFill(buf, CW, CH, sp.lit.map(toPx), bone[1]);
        s5m_polyFill(buf, CW, CH, sp.shade.map(toPx), bone[2]);
      }
      const iv = [s5m_c32(S5M_IV.mid), s5m_c32(S5M_IV.lit), s5m_c32(S5M_IV.shade), s5m_c32(S5M_IV.hi)];
      for (const fg of sh.fangs) {
        s5m_polyFill(buf, CW, CH, fg.all.map(toPx), iv[0]);
        s5m_polyFill(buf, CW, CH, fg.lit.map(toPx), iv[1]);
        s5m_polyFill(buf, CW, CH, fg.shade.map(toPx), iv[2]);
        const T = toPx(fg.tip), tx = Math.round(T[0]), ty = Math.round(T[1]);
        if (tx >= 0 && ty >= 0 && tx < CW && ty < CH) buf[ty * CW + tx] = iv[3];
      }
      d.g.putImageData(img, 0, 0);
      d.outline(S5M_OUT);
    });
  }

  // solve the opening angles for the wanted gaps between the nose fang tips (idle 64 px, wide 100 px; the lining of the
  // jaws is ~100 / ~135 px apart there)
  {
    const gap = (deg) => {
      const u = s5m_shapes(s5m_rad(deg), false).fangs, l = s5m_shapes(s5m_rad(deg), true).fangs;
      return -u[u.length - 1].tip[1] + -l[l.length - 1].tip[1];
    };
    const solve = (want) => {
      let best = 0, bd = 1e9;
      for (let k = 0; k < S5M.NF; k++) {
        const dd = Math.abs(gap(k * S5M.STEP) - want);
        if (dd < bd) { bd = dd; best = k; }
      }
      return best * S5M.STEP;
    };
    S5M.A_IDLE = solve(64);
    S5M.A_WIDE = solve(100);
  }

  /* ---------------- head: cheeks, throat, eye ---------------- */
  const S5M_CHW = 104, S5M_CHH = 128;
  // upper cheek: sprite x 0 = head x -8, the bottom row is the lip (drawn at y - lip); the lower cheek is the mirror image
  function s5m_bakeCheek(name, lower) {
    const W = S5M_CHW, H = S5M_CHH;
    const rng = makeRng(lower ? 41 : 31);
    const boils = Array.from({ length: 14 }, () => [34 + rng() * 66, 10 + rng() * (H - 40), 1.6 + rng() * 2.2]);
    const lip = ['#7a1c48', '#c8386a', '#c8386a', '#f06a94', '#f06a94', '#ffb0c8', '#c8386a'];
    Sprites.painted(name, W, H, 1, (d) => {
      // front face: starts at the lip, bulges slightly, then slopes back toward the cavern wall (a wedge-shaped head)
      const pts = [[66, 0], [W - 2, 0], [W - 2, H - 1], [12, H - 1], [7, H - 8], [7, H - 24], [12, H - 40], [22, H - 58], [34, H - 78], [46, H - 98], [57, H - 116]];
      const mask = new Uint8Array(W * H);
      s5m_polyMask(mask, W, H, pts);
      if (lower) {
        for (let y = 0; y < H >> 1; y++) for (let x = 0; x < W; x++) { const a = y * W + x, b = (H - 1 - y) * W + x, t = mask[a]; mask[a] = mask[b]; mask[b] = t; }
      }
      const dist = s5m_dist(mask, W, H);
      const detail = (x, y, q, lam) => {
        const yu = lower ? H - 1 - y : y;
        if (yu >= H - 7) return lip[yu - (H - 7)];
        // overlapping scales: staggered rows of arcs
        const row = Math.floor(yu / 11), off = row & 1 ? 7 : 0;
        const cx = Math.floor((x + off) / 14) * 14 + 7 - off, cy = row * 11 + 4;
        const dd = Math.sqrt((x + 0.5 - cx) * (x + 0.5 - cx) + (yu + 0.5 - cy) * (yu + 0.5 - cy));
        if (dd > 7.1 && dd < 8.3 && yu + 0.5 > cy - 1) return S5M_SKIN[Math.max(0, q - 2)];
        if (dd > 5.6 && dd < 7.1 && yu + 0.5 > cy && q >= 2) return S5M_SKIN[Math.min(5, q + 1)];
        for (const [bx, by, br] of boils) {
          const d2 = Math.sqrt((x - bx) * (x - bx) + (yu - by) * (yu - by));
          if (d2 < br) return d2 > br * 0.75 ? '#5a2a78' : d2 < br * 0.4 && x < bx && yu < by ? '#ffe0f0' : '#d890c8';
        }
        if (s5m_hash(x, yu) < 0.05 && q > 0) return S5M_SKIN[q - 1];
        if (lam > 0.93 && s5m_hash(x + 7, yu + 3) < 0.3) return '#ffffff';
        return null;
      };
      d.g.putImageData(s5m_shade(d, mask, dist, W, H, S5M_SKIN, 12, detail).img, 0, 0);
      d.outline(S5M_OUT);
    });
  }

  // the throat: a wet crimson tunnel with muscle ribs, lit from the middle (sprite x 0 = head x -8, y 0 = head y -35)
  const S5M_TH = 70;
  const s5m_bakeThroat = () => Sprites.painted('s5_maw_throat', S5M_CHW, S5M_TH, 1, (d) => {
    const W = S5M_CHW, H = S5M_TH, cy = (H - 1) / 2;
    const img = d.g.createImageData(W, H), buf = new Uint32Array(img.data.buffer), rc = S5M_RED.map(s5m_c32);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = Math.abs(y - cy) / (H / 2);
        let b = 1 - t * t;
        b *= 1 - 0.55 * Math.min(1, Math.max(0, x - 6) / 92);
        if (Math.sin(x / 3.6 + 1.2 * Math.sin(y / 5)) > 0.72) b -= 0.28;
        buf[y * W + x] = rc[clamp(Math.floor(b * 6 + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.9), 0, 5)];
      }
    }
    d.g.putImageData(img, 0, 0);
    for (let x = 14; x < W - 8; x += 3) if (s5m_hash(x, 1) < 0.5) { d.px(x, 14 + ((x >> 2) & 1), '#ff9ab8'); d.px(x + 1, H - 15 - ((x >> 2) & 1), '#ff9ab8'); } // wet glints
    d.outline(S5M_OUT);
  });

  // slit-pupil eye: sclera only (the iris and pupil are drawn on top at run time), frames: narrow / open / wide
  Sprites.painted('s5_maw_eye', 18, 11, 3, (d, f) => {
    const open = [0.4, 0.8, 1][f];
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 18; x++) {
        const nx = (x - 8.5) / 8.5, ny = (y - 5) / (5.1 * open);
        if (Math.abs(ny) <= 1 - Math.pow(Math.abs(nx), 1.7)) d.px(x, y, ny < -0.35 ? '#98b82c' : ny > 0.55 ? '#c8dc4c' : '#eaff74');
      }
    }
    d.outline(S5M_OUT);
  });

  let s5m_baked = false;
  /** the big sprites (jaws, cheeks, throat: ~150 ms) are baked when the stage loads (black intro screen), not at page load */
  function s5m_bakeArt() {
    if (s5m_baked) return;
    s5m_baked = true;
    s5m_bakeJaw('s5_maw_jawU', false);
    s5m_bakeJaw('s5_maw_jawL', true);
    s5m_bakeCheek('s5_maw_cheekU', false);
    s5m_bakeCheek('s5_maw_cheekL', true);
    s5m_bakeThroat();
  }

  // the end wall of the cavern as a 32 x 170 strip (entrance bulge): column 0 = outline, 1-2 = the lit rim, then mottled
  // flesh that darkens towards the screen edge, veins fanning out from where the beast pushes, a few wet glints
  Sprites.painted('s5_maw_dome', 32, 170, 1, (d) => {
    const W = 32, H = 170, cy = (H - 1) / 2;
    const img = d.g.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
    const rc = ['#3e0a22', '#620f34', '#8c1e46', '#b53a5a', '#dc6480'].map(s5m_c32);
    for (let y = 0; y < H; y++) {
      const v = (y - cy) / (H / 2);
      for (let x = 0; x < W; x++) {
        let b = 2.9 - x * 0.07 - v * v * 0.7;
        b += (s5m_hash(x >> 1, y >> 1) - 0.5) * 1.5 + Math.sin(y / 4.3 + Math.sin(x / 5) * 1.5) * 0.4;
        buf[y * W + x] = rc[clamp(Math.floor(b + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.9), 0, 4)];
      }
      buf[y * W] = s5m_c32('#220510');
      buf[y * W + 1] = s5m_c32('#ff9fb4');
      buf[y * W + 2] = s5m_c32('#e0708c');
    }
    const vein = s5m_c32('#2a0616'), vein2 = s5m_c32('#8c1e46');
    for (let k = -4; k <= 4; k++) {
      if (!k) continue;
      let px = W - 1, py = cy + k * 3;
      for (let s = 1; s <= 6; s++) {
        const x = W - 1 - s * 4.6, y = cy + k * 3 + (k * 17) * (s / 6) + (s5m_hash(k + 9, s) - 0.5) * 5;
        s5m_lineFill(buf, W, H, px, py - 1, x, y - 1, vein2);
        s5m_lineFill(buf, W, H, px, py, x, y, vein);
        px = x; py = y;
      }
    }
    for (let i = 0; i < 16; i++) buf[Math.floor(s5m_hash(i, 5) * H) * W + 3 + Math.floor(s5m_hash(i, 6) * 8)] = s5m_c32(i & 1 ? '#ffd0dc' : '#ff9fb4');
    d.g.putImageData(img, 0, 0);
  });

  // bile: a heavy lime blob (3 wobble frames) and the flat puddle shots it leaves on the floor
  Sprites.painted('s5_bile', 11, 11, 3, (d, f) => {
    const r = [4.5, 4.1, 4.7][f], sq = [0, 0.6, -0.4][f];
    d.ellipse(5, 5, r + sq * 0.3, r - sq * 0.3, '#2c6a0c');
    d.ellipse(5, 5, r - 1 + sq * 0.3, r - 1 - sq * 0.3, '#7cc41c');
    d.ellipse(4.4, 4.4, r - 2.3, r - 2.3, '#c8f040');
    d.px(3, 3, '#ffffff'); d.px(4, 3, '#f4ffa0'); d.px(3, 4, '#f4ffa0');
    if (f === 1) { d.px(7, 8, '#7cc41c'); d.px(7, 9, '#2c6a0c'); }
    d.outline('#142c06');
  });
  Sprites.painted('s5_puddle', 9, 5, 2, (d, f) => {
    d.ellipse(4, 2.6, 3.6 + f * 0.4, 1.7, '#2c6a0c');
    d.ellipse(4, 2.3, 3 + f * 0.4, 1.2, '#7cc41c');
    d.px(3, 1, '#d8ff60'); d.px(4, 1, '#f4ffa0');
    d.outline('#142c06');
  });

  // death debris: tumbling fangs and chunks of flesh
  Sprites.painted('s5_tooth', 11, 11, 8, (d, f) => {
    const a = (f * Math.PI) / 4, c = Math.cos(a), sn = Math.sin(a);
    const rot = (x, y) => [5 + x * c - y * sn, 5 + x * sn + y * c];
    d.poly([rot(-4, -2.4), rot(4.5, 0), rot(-4, 2.4)], S5M_IV.mid);
    d.poly([rot(-4, -2.4), rot(4.5, 0), rot(-4, 0)], S5M_IV.lit);
    d.poly([rot(-4, 0), rot(4.5, 0), rot(-4, 2.4)], S5M_IV.shade);
    d.outline(S5M_OUT);
  });
  Sprites.painted('s5_chunk', 9, 9, 4, (d, f) => {
    const r = [3.4, 3, 3.6, 3.1][f];
    d.ellipse(4, 4, r, r - 0.4, '#4c2a98');
    d.ellipse(3.6, 3.6, r - 1, r - 1.2, '#a37af0');
    d.px(2, 2, '#dcc4ff');
    if (f & 1) d.px(5, 5, '#f06a94');
    d.outline(S5M_OUT);
  });

  /** filled pixel ellipse (canvas rects, no antialiasing) */
  function s5m_ell(c, cx, cy, rx, ry) {
    cx = Math.round(cx); cy = Math.round(cy);
    const R = Math.floor(ry);
    for (let dy = -R; dy <= R; dy++) {
      const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))) + 0.5);
      c.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
    }
  }
  /**
   * The glowing core (a 14x40 box). hot 0..1 = how exposed / charged it is, green 0..1 = retching bile, flash = hit.
   * Hidden under the lips whenever the maw is shut (the cheeks are drawn over it).
   */
  function s5m_core(c, x, y, o) {
    const pulse = 0.5 + 0.5 * Math.sin(o.t * (o.over > 0.05 ? 0.45 : 0.22));
    const g = o.green || 0;
    const over = o.over > 0.05;
    const pal = g > 0.3
      ? ['#142c06', '#4a9a14', '#a8e83c', '#e8ff74', '#ffffff']
      : over
        ? ['#5a1010', '#ff5a20', '#ffe080', '#ffffff', '#ffffff']
        : o.hot > 0.05
          ? ['#3a0c10', '#b4400e', '#ff8a24', '#ffd040', '#fff6a8']
          : ['#2a0614', '#5a1230', '#8c2048', '#b8365c', '#e0587a'];
    if (o.hot > 0.05 || g > 0.3) {
      const k = Math.max(o.hot, g), bump = over ? 4 : 0;
      c.globalAlpha = (0.16 + 0.2 * k) * (0.7 + 0.3 * pulse);
      c.fillStyle = g > 0.3 ? '#b8ff40' : over ? '#ffe8a0' : '#ffb030';
      s5m_ell(c, x, y, 13 + pulse * 2 + k * 3 + bump, 28 + pulse * 2 + k * 3 + bump);
      c.globalAlpha = (0.22 + 0.2 * k) * (0.7 + 0.3 * pulse);
      s5m_ell(c, x, y, 10 + pulse + bump * 0.6, 24 + pulse + bump * 0.6);
      c.globalAlpha = 1;
    }
    const fl = o.flash;
    c.fillStyle = fl ? '#ffffff' : pal[0]; s5m_ell(c, x, y, 9, 21.5);
    c.fillStyle = fl ? '#ffffff' : pal[1]; s5m_ell(c, x, y, 8, 20.5);
    c.fillStyle = fl ? '#ffffff' : pal[2]; s5m_ell(c, x - 0.5, y - 0.5, 6.6, 18.4);
    c.fillStyle = fl ? '#ffffff' : pal[3]; s5m_ell(c, x - 1, y - 1.5, 4.9, 14.6);
    c.fillStyle = fl ? '#ffffff' : pal[4]; s5m_ell(c, x - 1, y - 2, 3 + pulse * 0.6, 9 + pulse * 1.4);
    if (!fl) {
      c.fillStyle = pal[0];
      for (const [vx, vy, vw, vh] of [[3, -12, 1, 6], [-4, 4, 1, 7], [2, 10, 1, 5], [-2, -4, 1, 3]]) c.fillRect(Math.round(x) + vx, Math.round(y) + vy, vw, vh); // veins
      c.fillStyle = '#ffffff';
      c.fillRect(Math.round(x) - 2, Math.round(y) - 12, 1, 4);
      c.fillRect(Math.round(x) - 1, Math.round(y) - 13, 1, 1);
    }
  }

  // cracks in the head as the maw gets hurt: [level, polyline] in upper-cheek sprite coordinates (mirrored onto the lower cheek)
  const S5M_SCARS = [
    [1, [[24, 118], [30, 108], [27, 100], [35, 90], [33, 80]]],
    [1, [[52, 122], [56, 110], [53, 104], [62, 94]]],
    [2, [[74, 120], [80, 108], [76, 100], [84, 90], [82, 80]]],
    [2, [[40, 72], [46, 62], [44, 54]]],
    [2, [[92, 112], [88, 102], [94, 94]]],
  ];
  function s5m_scars(c, x, y, lip, level) {
    for (const [lv, pts] of S5M_SCARS) {
      if (lv > level) continue;
      for (const side of [-1, 1]) {
        const px = (p) => x - 8 + p[0];
        const py = (p) => (side < 0 ? y - lip - S5M_CHH + p[1] : y + lip + (S5M_CHH - 1 - p[1]));
        for (let i = 1; i < pts.length; i++) {
          c.fillStyle = '#4a0c26';
          s5_pline(c, px(pts[i - 1]), py(pts[i - 1]), px(pts[i]), py(pts[i]));
          c.fillStyle = '#ff8ab0';
          s5_pline(c, px(pts[i - 1]) - 1, py(pts[i - 1]), px(pts[i]) - 1, py(pts[i]));
        }
      }
    }
  }
  /**
   * Draw the whole maw (hinge line at v.x, mouth axis at v.y) in a pose. v: {x, y, ang (deg), core:{hot, green, over, flash, t},
   * eye:{f, lx, ly, col}, scars (0..2), sag (px the lower jaw hangs), flash}
   */
  function s5m_view(c, v) {
    const x = Math.round(v.x), y = Math.round(v.y);
    const fr = clamp(Math.round(v.ang / S5M.STEP), 0, S5M.NF - 1);
    const a = s5m_rad(fr * S5M.STEP), lip = Math.round(s5m_lip(a));
    const sag = Math.round(v.sag || 0);
    const JU = S5M_JAW.s5_maw_jawU, JL = S5M_JAW.s5_maw_jawL;
    const fl = !!v.flash;
    Sprites.drawTL(c, 's5_maw_throat', x - 8, y - 35, { flash: fl });
    if (v.core) s5m_core(c, x + 9, y, v.core);
    Sprites.drawTL(c, 's5_maw_jawL', x - JL.PX, y - JL.PY + sag, { frame: fr, flash: fl });
    Sprites.drawTL(c, 's5_maw_jawU', x - JU.PX, y - JU.PY, { frame: fr, flash: fl });
    // the head halves: the cheeks slide apart with the jaws and cover the core when the maw is shut
    Sprites.drawTL(c, 's5_maw_cheekU', x - 8, y - lip - S5M_CHH, { flash: fl });
    Sprites.drawTL(c, 's5_maw_cheekL', x - 8, y + lip, { flash: fl });
    if (v.scars) s5m_scars(c, x, y, lip, v.scars);
    if (v.eye) {
      const o = s5m_pt(S5M_EYE[0], S5M_EYE[1], s5m_rad(fr * S5M.STEP), [0, 0]);
      const ex = x + Math.round(o[0]), ey = y + Math.round(o[1]), E = v.eye;
      Sprites.draw(c, 's5_maw_eye', ex, ey, { frame: E.f, flash: fl });
      if (!fl && E.f > 0) {
        const hx = Math.round(ex + E.lx), hy = Math.round(ey + E.ly);
        c.fillStyle = E.col || '#ff9424';
        s5m_ell(c, hx, hy, 3.6, E.f === 2 ? 3.8 : 2.8);
        c.fillStyle = '#12030c';
        c.fillRect(hx - 1, hy - (E.f === 2 ? 3 : 2), 2, E.f === 2 ? 7 : 5);
        c.fillStyle = '#ffffff';
        c.fillRect(hx - 3, hy - 2, 1, 1);
      }
    }
  }

  /* ---------------------------------------------------------------
   * hit boxes: 16 vertical strips per jaw that follow the drawn shape, plus stepped boxes for the wedge-shaped cheeks
   * --------------------------------------------------------------- */
  const S5M_NS = 16;
  const S5M_PO = Array.from({ length: 48 }, () => [0, 0]);
  const S5M_PI = Array.from({ length: 48 }, () => [0, 0]);
  function s5m_interp(poly, n, x) {
    if (x <= poly[0][0]) return poly[0][1];
    for (let i = 1; i < n; i++) {
      if (x <= poly[i][0]) {
        const a = poly[i - 1], b = poly[i];
        return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
      }
    }
    return poly[n - 1][1];
  }
  /**
   * boxes [cx, cy, w, h] (hinge-relative) of the UPPER jaw at angle a, nose first; the lower jaw is the mirror image.
   * Every box is inscribed in the drawn jaw (the conservative edge across its width), so nothing hurts where nothing is drawn.
   */
  function s5m_strips(a, out) {
    let n = 0;
    for (let s = S5M.L; s >= 0; s -= 2) {
      s5m_pt(s, s5m_T(s), a, S5M_PO[n]);
      s5m_pt(s, -S5M.GUM - 2.5, a, S5M_PI[n]);
      n++;
    }
    const x0 = Math.max(S5M_PO[0][0], S5M_PI[0][0]), x1 = S5M_PI[n - 1][0]; // boxes start where the skin starts: the bare fang tips do not hurt
    const bw = (x1 - x0) / S5M_NS;
    for (let i = 0; i < S5M_NS; i++) {
      const xa = x0 + i * bw, xb = xa + bw, xc = (xa + xb) / 2;
      // outer edge (smaller y) -> take the lowest of the three samples, inner edge -> the highest
      const top = Math.max(s5m_interp(S5M_PO, n, xa), s5m_interp(S5M_PO, n, xc), s5m_interp(S5M_PO, n, xb));
      const bot = Math.min(s5m_interp(S5M_PI, n, xa), s5m_interp(S5M_PI, n, xc), s5m_interp(S5M_PI, n, xb));
      const q = out[i];
      q[0] = xc; q[1] = (top + bot) / 2; q[2] = bw + 0.6; q[3] = Math.max(3, bot - top);
    }
  }
  // The head's front face (the wedge drawn in s5m_bakeCheek): [distance from the lip, x of the face relative to the hinge].
  // The cheek boxes are steps along it: [y from, y to, x] measured outward from the lip (negative = up); the last step runs up
  // into the cavern wall.
  const S5M_FACE = [[0, 4], [7, -1], [23, -1], [39, 4], [57, 14], [77, 26], [97, 38], [115, 49], [160, 69]];
  const S5M_CHK = (() => {
    const faceAt = (d) => {
      for (let i = 1; i < S5M_FACE.length; i++) {
        if (d <= S5M_FACE[i][0]) {
          const a = S5M_FACE[i - 1], b = S5M_FACE[i];
          return a[1] + ((b[1] - a[1]) * (d - a[0])) / (b[0] - a[0]);
        }
      }
      return S5M_FACE[S5M_FACE.length - 1][1];
    };
    const edges = [0, 8, 17, 27, 38, 49, 60, 72, 84, 96, 108, 160], out = [];
    for (let i = 0; i + 1 < edges.length; i++) {
      let sum = 0, n = 0;
      for (let d = edges[i]; d <= edges[i + 1]; d += 2) { sum += faceAt(d); n++; }
      out.push([-edges[i], -edges[i + 1], sum / n + 0.5]); // mean of the face over the step, a hair inside
    }
    return out;
  })();

  /* ---------------------------------------------------------------
   * fight tuning
   * --------------------------------------------------------------- */
  const S5M_BASE_HP = 300; // core hit points at normal difficulty with an unarmed ship
  const S5M_RANK_K = 0.1; // a better armed ship meets a tougher core: hp *= 1 + K * G.rank
  // per phase: wind = lunge telegraph, reach = how far the head lunges (px), stuck = frames jammed shut, recover = frames
  // to withdraw, gap = pause between two attacks, openMin = shortest open window, bites = bites per lunge
  const S5M_PH = [
    null,
    { wind: 68, reach: 62, stuck: 46, recover: 70, gap: 46, openMin: 150, bites: 1, queue: ['spit', 'spit', 'spit'] },
    { wind: 60, reach: 68, stuck: 42, recover: 64, gap: 40, openMin: 150, bites: 1, queue: ['spit', 'tongue', 'spit', 'spore'] },
    { wind: 52, reach: 66, reach2: 72, stuck: 40, recover: 60, gap: 34, openMin: 190, bites: 2, queue: ['volley', 'tongue', 'spore', 'volley'] },
  ];
  const S5M_STUCK1 = 16; // frames the first jaws of a double bite stay shut before the second wind-up
  const S5M_ANG_CLOSED = 0;
  const s5m_ease = (t) => t * t * (3 - 2 * t);
  const S5M_STRIPS = Array.from({ length: S5M_NS }, () => [0, 0, 0, 0]);
  const S5M_TMP = [0, 0];

  /** shootable acid blob: lobbed on a gravity arc that passes through (tx, ty) after T frames at base speed */
  function s5m_lob(e, tx, ty, T, quiet) {
    const k = G.bulletMul(), g = 0.03;
    const sx = e.x - 38, sy = e.y - 1;
    if (!G.canFire({ x: sx, y: sy })) return;
    const vx = (tx - sx) / T, vy = (ty - sy) / T - 0.5 * g * T;
    const fb = e.fb;
    G.ebullet(sx, sy, vx * k, vy * k, { spr: 's5_bile', w: 7, h: 7, hp: 1, solid: false, raw: true, ay: g * k * k, anim: 6, quiet: !!quiet, custom: (b) => s5m_bileTick(b, fb) });
  }
  function s5m_bileTick(b, fb) {
    if (b.t > 8 && b.vy > 0 && b.y >= fb - 5) {
      b.dead = true;
      sfx('cellPop');
      for (const dir of [-1, 1]) G.ebullet(b.x + dir * 3, fb - 3, dir * 0.8, 0, { spr: 's5_puddle', w: 6, h: 4, anim: 10, life: 80, quiet: true });
      for (let i = 0; i < 6; i++) G.fx.push({ k: 'part', x: b.x, y: fb - 3, vx: rnd(-1, 1), vy: rnd(-1.6, -0.4), life: rndi(14, 26), t: 0, col: pick(['#c8f040', '#7cc41c', '#f4ffa0']), big: chance(0.3) });
    } else if (b.x < 10) b.dead = true;
  }
  /**
   * Burst of slow shootable spores from the mouth: an arc that stays inside the mouth opening, with a lane of two missing
   * spores at bearing `gap` (radians from straight left) so there is always a way through.
   */
  function s5m_spores(e, n, phase, gap) {
    const ox = e.x - 38, oy = e.y;
    if (!G.canFire({ x: ox, y: oy })) return;
    const span = 1.36; // total arc
    for (let i = 0; i < n; i++) {
      const rel = (i / (n - 1) - 0.5) * span + phase;
      if (Math.abs(rel - gap) < span / (n - 1) * 1.15) continue; // the lane
      const a = Math.PI + rel;
      G.ebullet(ox, oy, Math.cos(a) * 0.95, Math.sin(a) * 0.95, { spr: 's5_spore', w: 5, h: 5, hp: 1, quiet: i > 0 });
    }
    G.fx.push({
      k: 'fn', x: 0, y: 0, t: 0, life: 30,
      draw: (c, f) => {
        const r = 6 + f.t * 0.9;
        c.globalAlpha = 0.5 * (1 - f.t / 30);
        c.fillStyle = '#b8ff40';
        s5m_ell(c, ox - f.t * 0.6, oy, r * 0.8, r);
        c.globalAlpha = 1;
      },
    });
  }

  /* ---------------------------------------------------------------
   * drawing helpers: lunge ghost + danger line, the tongue, the entrance wall, shock rings
   * --------------------------------------------------------------- */
  function s5m_ring(c, cx, cy, rx, ry, col) {
    c.fillStyle = col;
    const n = Math.max(12, Math.ceil(Math.max(rx, ry) * 2.2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      c.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1);
    }
  }
  const S5M_TONGUE = { out: '#2a0816', dark: '#8c1c48', mid: '#e0487a', lite: '#ff9ab8', spec: '#ffe8f0', sk: '#ffc8dc', skD: '#a8407a' };
  const S5M_TJ = Array.from({ length: 14 }, () => ({ x: 0, y: 0 }));
  const S5M_TR = Array.from({ length: 14 }, (_, i) => 5.6 - (i / 13) * 1.6);
  function s5m_tongue(c, e) {
    const tg = e.tg;
    if (!tg || (tg.rip <= 0 && tg.ext <= 0)) return;
    const fb = e.fb;
    // telegraph: a glowing band on the floor marks the strike area, flesh ripples run toward the tip point
    if (tg.rip > 0 && tg.ext < 0.05) {
      const x0 = Math.round(tg.tipX), x1 = Math.round(e.x - 4), k = tg.rip;
      const pulse = G.reduceFlash ? 0.5 : 0.5 + 0.5 * Math.sin(e.t * 0.4);
      c.globalAlpha = 0.14 + 0.2 * k * (0.6 + 0.4 * pulse);
      c.fillStyle = '#ff3a60';
      c.fillRect(x0, fb - 12, x1 - x0, 12);
      c.globalAlpha = 1;
      const blink = G.reduceFlash || ((e.t >> 2) & 1);
      for (let x = x0; x < x1; x += 6) {
        c.fillStyle = blink ? '#ffd430' : '#ff5a4a';
        c.fillRect(x, fb - 13, 3, 1);
      }
      // humps of flesh sliding along the floor
      for (let x = x0; x < x1; x++) {
        const ph = ((x - e.t * 1.6) / 17) % 1;
        const hump = ph < 0 ? ph + 1 : ph;
        if (hump < 0.5) {
          const h = Math.round(Math.sin(hump * 2 * Math.PI) * (2 + 4 * k));
          if (h > 0) {
            c.fillStyle = '#e0487a'; c.fillRect(x, fb - h, 1, h);
            c.fillStyle = '#ffb0c8'; c.fillRect(x, fb - h, 1, 1);
          }
        }
      }
      // the point it will reach
      c.fillStyle = blink ? '#ff4040' : '#7a1018';
      c.fillRect(x0 - 3, fb - 14, 4, 14);
      c.fillStyle = '#ffffff';
      c.fillRect(x0 - 2, fb - 12, 2, 7);
      c.fillRect(x0 - 2, fb - 4, 2, 2);
    }
    if (tg.ext > 0.02) {
      const n = 13, x0 = e.x + 4, x1 = lerp(e.x - 10, tg.tipX, s5m_ease(clamp(tg.ext, 0, 1)));
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        S5M_TJ[i].x = lerp(x0, x1, u);
        S5M_TJ[i].y = fb - 6.5 + Math.sin(e.t * 0.35 - u * 7) * 0.9 * u + (1 - tg.ext) * -3 * u;
      }
      s5_tube(c, S5M_TJ, S5M_TR, n, { pal: S5M_TONGUE, flash: null, side: 1, tip: true });
      const tp = S5M_TJ[n];
      // clubbed tip
      c.fillStyle = S5M_TONGUE.out; s5_disc(c, Math.round(tp.x), Math.round(tp.y), 5);
      c.fillStyle = S5M_TONGUE.mid; s5_disc(c, Math.round(tp.x), Math.round(tp.y), 4);
      c.fillStyle = S5M_TONGUE.lite; s5_disc(c, Math.round(tp.x) - 1, Math.round(tp.y) - 1, 2);
      c.fillStyle = '#ffffff'; c.fillRect(Math.round(tp.x) - 2, Math.round(tp.y) - 2, 1, 1);
    }
  }
  /** the cavern's end wall bulging and tearing open (entrance) */
  function s5m_wall(c, e) {
    const T = e.stT, ct = e.ct, fb = e.fb, cy = e.cy;
    if (e.st !== 'enter' || T >= 128) return;
    const grow = clamp(T / 72, 0, 1), tear = clamp((T - 72) / 26, 0, 1), fade = T > 72 ? 1 - clamp((T - 72) / 54, 0, 1) : 1;
    const pulse = 1 + 0.07 * Math.sin(T * 0.45);
    const hwMax = 27 * grow * pulse * fade, tex = Sprites.get('s5_maw_dome');
    const gapY = tear * 98; // the tear is an ellipse growing out of the middle of the bulge
    for (let y = ct; y < fb; y++) {
      const dy = y - cy, u = dy / ((fb - ct) / 2), env = Math.sqrt(Math.max(0, 1 - u * u));
      const hw = Math.round(hwMax * env);
      if (hw < 1) continue;
      c.drawImage(tex, 0, y - ct, hw + 1, 1, W - hw - 1, y, hw + 1, 1);
      if (gapY > 1 && Math.abs(dy) < gapY) {
        const k = Math.sqrt(1 - (dy * dy) / (gapY * gapY));
        const hole = Math.min(hw - 2, Math.round(hw * k + (s5m_hash(y, 3) - 0.5) * 5 * tear * k));
        if (hole < 1) continue;
        c.fillStyle = '#12030c';
        c.fillRect(W - hole, y, hole, 1);
        c.fillStyle = '#ff6a8c';
        c.fillRect(W - hole - 1, y, 1, 1);
        if (hole > 3) { c.fillStyle = '#8c1e46'; c.fillRect(W - hole, y, 1, 1); }
      }
    }
  }

  /* ---------------------------------------------------------------
   * the boss
   * --------------------------------------------------------------- */
  const ENEMY_MAW = (ENEMIES.s5_maw = {
    w: 110, h: 130, hp: 99999, score: 10000, keep: true, silentDeath: true, expl: 'xl',
    init(e) {
      s5m_bakeArt(); // (normally done when the stage loads)
      const T = G.terrain, cam = G.camX;
      e.ct = T.ceilBottom(cam + 200);
      e.fb = T.floorTop(cam + 200);
      e.cy = (e.ct + e.fb) / 2;
      e.hp = e.maxHp = 99999;
      e.x = S5M.START;
      e.y = e.cy;
      e.vx = e.vy = 0;
      e.st = 'enter';
      e.stT = 0;
      e.pn = 1; // phase 1..3
      e.phaseQ = 0;
      e.cyc = 0;
      e.ang = 16;
      e.hx = 0; // head offset from HOME (negative = lunged)
      e.yT = e.cy;
      e.yV = 0.5;
      e.bulge = 0;
      e.atk = null;
      e.qi = 0;
      e.queue = S5M_PH[1].queue.slice();
      e.pause = 100;
      e.retch = 0;
      e.green = 0;
      e.hot = 0.5;
      e.tg = { rip: 0, ext: 0, tipX: 40 };
      e.zoneOn = false;
      e.bite = 0;
      e.lx = -2;
      e.ly = 0;
      e.eyeF = 1;
      e.jit = 0;
      e.phase = 'P1 enter';
      const k = G.diff.hp * (1 + 0.25 * G.loop) * (1 + S5M_RANK_K * G.rank);
      const hp = Math.max(1, Math.round(S5M_BASE_HP * k));
      const box = (name, extra) => Object.assign({ name, ox: 0, oy: 0, w: 4, h: 4, hp: 99999, vuln: false, harmless: true }, extra);
      e.parts = [];
      for (let i = 0; i < S5M_NS; i++) e.parts.push(box('u' + i));
      for (let i = 0; i < S5M_NS; i++) e.parts.push(box('l' + i));
      for (let i = 0; i < S5M_CHK.length; i++) e.parts.push(box('cu' + i));
      for (let i = 0; i < S5M_CHK.length; i++) e.parts.push(box('cl' + i));
      e.parts.push(box('core', { ox: 9, oy: 0, w: 14, h: 40, hp, max: hp, expl: 'xl', score: 5000 }));
      e.parts.push(box('tongue', { solid: false }));
      e.iCheek = 2 * S5M_NS;
      e.core = e.parts[2 * S5M_NS + 2 * S5M_CHK.length];
      e.iTongue = e.parts.length - 1;
      this.sync(e);
    },
    setHarmless(e, v) {
      for (const p of e.parts) if (p.name !== 'tongue') p.harmless = v;
    },
    go(e, st) {
      e.st = st;
      e.stT = 0;
    },
    /** move the hit boxes to where the maw is drawn this frame */
    sync(e) {
      const a = s5m_rad(e.ang);
      s5m_strips(a, S5M_STRIPS);
      for (let i = 0; i < S5M_NS; i++) {
        const q = S5M_STRIPS[i], u = e.parts[i], l = e.parts[S5M_NS + i];
        u.ox = q[0]; u.oy = q[1]; u.w = q[2]; u.h = q[3];
        l.ox = q[0]; l.oy = -q[1]; l.w = q[2]; l.h = q[3];
      }
      const core = e.core;
      core.vuln = e.st !== 'enter' && e.st !== 'roar' && e.st !== 'snap' && !e.phaseQ && e.ang >= 12 && e.pn > 0;
      const lip = s5m_lip(a), topY = e.ct - e.y - 6, botY = e.fb - e.y + 6;
      for (let i = 0; i < S5M_CHK.length; i++) {
        const [y0, y1, xf] = S5M_CHK[i];
        const last = i === S5M_CHK.length - 1;
        const u = e.parts[e.iCheek + i], l = e.parts[e.iCheek + S5M_CHK.length + i];
        // upper half: lip side yb (nearer the axis), outer edge ya, never beyond the cavern ceiling
        const yb = -lip + y0, ya = Math.max(last ? topY : -lip + y1, topY), h = Math.max(0.5, yb - ya);
        u.ox = xf + 50; u.w = 100; u.oy = yb - h / 2; u.h = h;
        // lower half: the mirror image, never beyond the floor
        const yb2 = lip - y0, ya2 = Math.min(last ? botY : lip - y1, botY), h2 = Math.max(0.5, ya2 - yb2);
        l.ox = xf + 50; l.w = 100; l.oy = yb2 + h2 / 2; l.h = h2;
      }
      const tg = e.tg, tp = e.parts[e.iTongue];
      const ext = clamp(tg.ext, 0, 1);
      if (ext > 0.02) {
        const x1 = lerp(e.x - 10, tg.tipX, s5m_ease(ext)), x0 = e.x + 4;
        tp.ox = (x0 + x1) / 2 - e.x; tp.w = x0 - x1 + 8; tp.oy = e.fb - 6 - e.y; tp.h = 11;
        tp.harmless = ext < 0.3 || e.st === 'enter';
      } else tp.harmless = true;
    },
    /** attack scripts of the open window: return true when finished */
    atkSpit(e, t) {
      const P = G.player;
      if (t === 0) sfx('cellPop');
      e.retch = t < 30 ? (t + 1) / 30 : 0;
      if (t === 30 && P.alive) {
        s5m_lob(e, clamp(P.x + rnd(-24, 24), 24, 214), clamp(P.y + rnd(-10, 10), e.ct + 12, e.fb - 16), 100);
      }
      return t >= 40;
    },
    atkVolley(e, t) {
      const P = G.player;
      if (t === 0) sfx('cellPop');
      e.retch = t < 34 ? (t + 1) / 34 : t < 62 ? 0.5 : 0;
      for (let i = 0; i < 3; i++) {
        if (t === 34 + i * 13 && P.alive) {
          s5m_lob(e, clamp(P.x + (i - 1) * 36 + rnd(-8, 8), 24, 214), clamp(P.y + rnd(-10, 10), e.ct + 12, e.fb - 16), 96 + i * 4, i > 0);
        }
      }
      return t >= 72;
    },
    atkTongue(e, t) {
      const tg = e.tg;
      if (t === 0) { sfx('tentacle'); tg.tipX = 34; }
      tg.rip = t < 40 ? 0.25 + 0.75 * (t / 40) : 0;
      if (t === 40) sfx('ring');
      tg.ext = t < 40 ? 0 : t < 54 ? (t - 40) / 14 : t < 84 ? 1 : t < 100 ? 1 - (t - 84) / 16 : 0;
      if (t >= 100) { tg.ext = 0; tg.rip = 0; }
      return t >= 106;
    },
    atkSpore(e, t) {
      const P = G.player;
      e.green = t < 36 ? (t + 1) / 36 : 0;
      if (t === 0) sfx('ring');
      if (t === 0) e.sporeGap = clamp(-Math.atan2(P.y - e.y, e.x - 38 - P.x) + rnd(-0.34, 0.34), -0.5, 0.5); // the lane: near the ship, but not always right on it
      if (t === 36 && P.alive) { s5m_spores(e, 13, 0, e.sporeGap); }
      if (e.pn === 3 && t === 58 && P.alive) { s5m_spores(e, 12, 0.055, e.sporeGap); }
      return t >= (e.pn === 3 ? 92 : 70);
    },
    startWind(e, cfg, second) {
      e.hx0 = e.hx;
      e.windN = second ? 30 : cfg.wind;
      e.reachNow = second ? cfg.reach2 : cfg.reach;
      e.hxWind = second ? e.hx + 14 : 10;
      // the zone the jaws will cover: everything right of the closed snout at the end of the lunge
      const endX = S5M.HOME - e.reachNow;
      e.zoneX = endX - S5M.L - 5;
      e.ghostX = endX;
      e.zoneOn = true;
      e.bite = second ? 2 : 1;
      e.angW0 = e.ang;
      this.go(e, 'wind');
      if (!second) {
        sfx('eruption');
        G.shake = Math.max(G.shake, 4);
      } else sfx('coreOpen');
    },
    update(e) {
      const P = G.player;
      if (G.bossPhase === 'dying') return;
      const cfg = S5M_PH[e.pn];
      e.stT++;
      e.vx = e.vy = 0;
      e.retch = 0;
      e.green = 0;
      let tgtY = e.cy + Math.sin(e.t * 0.013) * 22 + (P.alive ? clamp(P.y - e.cy, -30, 30) * 0.3 : 0);
      let angT = S5M.A_IDLE + Math.sin(e.t * 0.05) * 2;
      let eyeF = 1;
      let hot = 1;
      let yV = 0.5;

      switch (e.st) {
        case 'enter': {
          const T = e.stT;
          eyeF = 0;
          tgtY = e.cy;
          e.zoneOn = false;
          if (T < 72) {
            e.x = S5M.START;
            e.bulge = T / 72;
            if (T % 24 === 8) { sfx('stomp'); G.shake = Math.max(G.shake, 1.5 + 2 * e.bulge); }
            e.hot = 0.3;
          } else if (T === 72) {
            e.x = S5M.START;
            sfx('eruption');
            G.shake = 7;
            G.flash = Math.max(G.flash, 2);
            G.showBanner(['MAW LEVIATHAN'], 84);
            for (let i = 0; i < 34; i++) {
              const sy = e.cy + rnd(-70, 70);
              G.fx.push({ k: 'part', x: W - 6, y: sy, vx: rnd(-2.6, -0.4), vy: rnd(-1, 1), life: rndi(24, 50), t: 0, col: pick(['#ff9fb4', '#b53a5a', '#8c1e46', '#ffd8e4', '#ff6a8c']), big: chance(0.35) });
            }
          } else if (T < 72 + 100) {
            const u = (T - 72) / 100;
            e.x = S5M.HOME + (S5M.START - S5M.HOME) * Math.pow(1 - u, 2.4);
            e.ang = lerp(14, S5M.A_IDLE, s5m_ease(clamp(u * 1.2, 0, 1)));
            angT = e.ang;
            e.hot = u;
            // the arriving maw pushes the ship ahead of it instead of crushing it
            if (P.alive && P.x > e.x - 96 - 12) P.x = Math.max(14, e.x - 96 - 12);
            if (T === 72 + 40) sfx('coreOpen');
          } else {
            e.x = S5M.HOME;
            e.hot = 1;
            this.setHarmless(e, false);
            this.go(e, 'open');
          }
          break;
        }
        case 'open': {
          hot = 1;
          if ((e.t + 37) % 230 < 6) eyeF = 0; // a blink
          if (e.atk) {
            const n = e.atk.n;
            const done = n === 'spit' ? this.atkSpit(e, e.atk.t) : n === 'volley' ? this.atkVolley(e, e.atk.t) : n === 'tongue' ? this.atkTongue(e, e.atk.t) : this.atkSpore(e, e.atk.t);
            e.atk.t++;
            if (done) { e.atk = null; e.pause = G.fireDelay(cfg.gap) + (n === 'spore' ? 40 : 0); } // (after a spore ring: more room before the lunge)
          } else if (P.alive) {
            if (e.pause > 0) e.pause--;
            else if (e.qi < e.queue.length) e.atk = { n: e.queue[e.qi++], t: 0 };
            else if (e.stT >= cfg.openMin) { this.startWind(e, cfg, false); break; }
          }
          if (e.retch > 0 || e.green > 0) angT += 3 * Math.max(e.retch, e.green);
          if (e.phaseQ && !(e.atk && e.atk.n === 'tongue' && e.tg.ext > 0.05)) { this.go(e, 'roar'); e.atk = null; e.tg.ext = 0; e.tg.rip = 0; }
          break;
        }
        case 'wind': {
          const T = e.stT, N = e.windN;
          eyeF = 2;
          hot = 1;
          yV = 0.8;
          tgtY = clamp(P.y, e.cy - 26, e.cy + 26);
          e.hx = lerp(e.hx0, e.hxWind, s5m_ease(clamp(T / (N * 0.8), 0, 1)));
          angT = lerp(e.angW0, S5M.A_WIDE, s5m_ease(clamp(T / (N * 0.7), 0, 1)));
          e.ang = angT;
          if (T < 10 && T % 2 === 0) G.shake = Math.max(G.shake, 3 - T * 0.2); // a jolt as it rears back, then a low rumble
          else if (T % 4 === 0) G.shake = Math.max(G.shake, 0.7);
          e.zoneK = clamp(T / 14, 0, 1);
          if (T >= N) { e.hx1 = e.hx; this.go(e, 'lunge'); }
          break;
        }
        case 'lunge': {
          const T = e.stT, N = 12, u = clamp(T / N, 0, 1);
          eyeF = 2;
          hot = 1;
          yV = 0.2;
          tgtY = e.y;
          if (T === 1) { sfx('ring'); G.shake = Math.max(G.shake, 3); }
          e.hx = lerp(e.hx1, -e.reachNow, u * u);
          const k = clamp((u - 0.25) / 0.75, 0, 1);
          e.ang = lerp(S5M.A_WIDE, S5M_ANG_CLOSED, k * k * (3 - 2 * k));
          angT = e.ang;
          if (T >= N) {
            e.hx = -e.reachNow;
            e.ang = S5M_ANG_CLOSED;
            sfx('stomp');
            sfx('coreClose');
            G.shake = Math.max(G.shake, 7);
            // teeth clack: ivory chips fly off the snout
            for (let i = 0; i < 12; i++) G.fx.push({ k: 'part', x: e.x - 84 + rnd(-3, 3), y: e.y + rnd(-9, 9), vx: rnd(-1.8, 0.4), vy: rnd(-1.2, 1.2), life: rndi(14, 28), t: 0, col: pick(['#f6edc8', '#d8c894', '#ffffff']), big: chance(0.3) });
            this.go(e, 'snap');
          }
          break;
        }
        case 'snap': {
          const T = e.stT;
          eyeF = 0;
          hot = 0;
          yV = 0.1;
          tgtY = e.y;
          const stuck = e.bite < cfg.bites ? S5M_STUCK1 : cfg.stuck;
          e.hx = -e.reachNow + (T < 30 ? 6 * (T / 6) * Math.exp(1 - T / 6) : 0); // the head rebounds a little from the slam
          e.ang = S5M_ANG_CLOSED;
          angT = 0;
          e.jit = T < 24 ? ((T & 1) ? 1 : -1) : 0;
          if (T >= stuck) {
            if (e.bite < cfg.bites) { this.startWind(e, cfg, true); } else {
              e.hx2 = e.hx;
              this.go(e, 'recover');
            }
          }
          break;
        }
        case 'recover': {
          const T = e.stT, N = cfg.recover, u = clamp(T / N, 0, 1);
          eyeF = 1;
          hot = clamp((T - 16) / 30, 0, 1);
          e.zoneOn = false;
          e.jit = 0;
          e.hx = lerp(e.hx2, 0, s5m_ease(u));
          e.ang = T < 14 ? 0 : lerp(0, S5M.A_IDLE, s5m_ease(clamp((T - 14) / (N - 14), 0, 1)));
          angT = e.ang;
          if (T >= N) {
            e.cyc++;
            if (e.phaseQ) this.go(e, 'roar');
            else {
              this.go(e, 'open');
              const q = S5M_PH[e.pn].queue;
              e.queue = q.map((_, i) => q[(i + e.cyc) % q.length]);
              e.qi = 0;
              e.pause = 50;
              e.atk = null;
            }
          }
          break;
        }
        case 'roar': {
          const T = e.stT;
          eyeF = 2;
          hot = 0;
          yV = 0.4;
          tgtY = e.cy;
          e.zoneOn = false;
          e.jit = 0;
          if (T === 1) {
            for (const b of G.eb) b.dead = true; // a fresh start: no bile or spores survive the roar
            e.pn = e.phaseQ;
            e.phaseQ = 0;
            e.cyc = 0;
            sfx('eruption');
            G.shake = 8;
            G.flash = Math.max(G.flash, 3);
            for (let i = 0; i < 26; i++) {
              const a = rnd(TAU), s = rnd(0.6, 2.6);
              G.fx.push({ k: 'part', x: e.x - 20, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rndi(20, 44), t: 0, col: pick(['#ff9fb4', '#ffd8e4', '#c8386a', '#ffffff', '#ffe646']), big: chance(0.35) });
            }
          }
          if (T % 12 === 0 && T < 64) { sfx('stomp'); }
          if (T > 1 && T < 64) G.shake = Math.max(G.shake, 2.2);
          e.hx = lerp(e.hx, T < 66 ? 16 : 0, 0.08);
          angT = T < 66 ? S5M.A_WIDE + 4 : S5M.A_IDLE;
          e.ang += (angT - e.ang) * 0.12;
          if (T >= 84) {
            this.go(e, 'open');
            e.queue = S5M_PH[e.pn].queue.slice();
            e.qi = 0;
            e.pause = 60;
            e.atk = null;
          }
          break;
        }
        default: break;
      }
      // open / enter-state smoothing
      if (e.st === 'open') {
        e.ang += (angT - e.ang) * 0.1;
        e.hx += (0 - e.hx) * 0.2; // drifts back to the rest position
      }
      if (e.st !== 'enter') e.x = S5M.HOME + e.hx + (e.jit || 0);
      // head height
      e.y += clamp(tgtY - e.y, -yV, yV);
      e.y = clamp(e.y, e.cy - 28, e.cy + 28);
      // look at the ship
      const ex = e.x, ey = e.y - 40;
      const dx = P.x - ex, dy = P.y - ey, dl = Math.hypot(dx, dy) || 1;
      e.lx += ((dx / dl) * 2.2 - e.lx) * 0.12;
      e.ly += ((dy / dl) * 1.6 - e.ly) * 0.12;
      e.eyeF = eyeF;
      e.hot += (hot - e.hot) * 0.2;
      // drool drips from the upper fangs
      if ((e.t & 15) === 0 && e.x < W + 20 && (e.st === 'open' || e.st === 'wind' || e.st === 'roar') && chance(0.75)) {
        s5m_pt(rnd(24, 82), -S5M.GUM - 7, s5m_rad(e.ang), S5M_TMP);
        G.fx.push({ k: 'part', x: e.x + S5M_TMP[0], y: e.y + S5M_TMP[1], vx: rnd(-0.05, 0.05), vy: rnd(0.1, 0.4), life: rndi(18, 34), t: 0, col: pick(['#e8f8ff', '#c8e8f0', '#ffffff']), big: false });
      }
      this.sync(e);
      e.phase = 'P' + e.pn + ' ' + e.st + (e.atk ? ':' + e.atk.n : '');
    },
    onPartHurt(e, p) {
      if (p.name !== 'core') return;
      const thr = e.pn === 1 ? 0.65 : e.pn === 2 ? 0.3 : -1;
      if (thr >= 0 && !e.phaseQ && p.hp <= p.max * thr) {
        p.hp = p.max * thr; // the core cannot be brought lower until the maw has roared and changed its ways
        p.vuln = false;
        e.phaseQ = e.pn + 1;
      }
    },
    onPartDeath(e, p) {
      if (p.name === 'core') G.kill(e);
    },
    gauge(e) {
      const c = e.core;
      return c.dead ? 0 : Math.max(0, c.hp) / c.max;
    },
    onDeath(e) {
      const snap = { x: e.x, y: e.y, ang: e.ang, ct: e.ct, fb: e.fb, pn: e.pn };
      G.fx.push({ k: 'fn', x: e.x, y: e.y, t: 0, life: 136, draw: (c, f) => ENEMY_MAW.drawWreck(snap, c, f) });
      // teeth and flesh burst away from the jaws
      const hx = e.x, hy = e.y;
      for (let i = 0; i < 40; i++) {
        G.later(i * 3, () => {
          const s = rnd(0, 80), up = chance(0.5) ? -1 : 1;
          G.fx.push({ k: 'part', x: hx - 8 - s * 0.8, y: hy + up * (22 + s * 0.45), vx: rnd(-1.8, 0.6), vy: up * rnd(0.2, 1.8) - 0.3, life: rndi(30, 62), t: 0, col: pick(['#f6edc8', '#d8c894', '#ffffff', '#a37af0', '#7448c4', '#f06a94']), big: chance(0.45) });
        });
      }
      // chunks of fang and flesh tumble away from the jaws
      for (let i = 0; i < 26; i++) {
        const up = i % 2 ? -1 : 1, s0 = rnd(6, 84);
        const x0 = hx - 6 - s0 * 0.85, y0 = hy + up * (24 + s0 * 0.42), vx = rnd(-1.5, 0.5), vy = up * rnd(0.2, 1.4) - rnd(0.2, 1.2), life = rndi(46, 90), spin = rndi(2, 4), tooth = i % 3 !== 0;
        G.later(rndi(0, 40), () => {
          G.fx.push({
            k: 'fn', x: 0, y: 0, t: 0, life,
            draw: (c, f) => {
              const t = f.t;
              Sprites.draw(c, tooth ? 's5_tooth' : 's5_chunk', x0 + vx * t, y0 + vy * t + 0.035 * t * t, { frame: (t / spin) | 0, alpha: t > life - 10 ? (life - t) / 10 : 1 });
            },
          });
        });
      }
      e.x -= 40; // the explosion chain of bossDefeated is centred on the maw, not on the hinge
      G.bossDefeated(e);
    },
    drawWreck(s, c, f) {
      const jx = rndi(-1, 1), jy = rndi(-1, 1);
      const u = clamp(f.t / 46, 0, 1);
      c.save();
      c.beginPath();
      c.rect(0, s.ct, W, s.fb - s.ct);
      c.clip();
      const flash = !G.reduceFlash && (f.t >> 2) % 5 === 0;
      s5m_view(c, {
        x: f.x + jx + f.t * 0.18, y: f.y + jy, ang: lerp(s.ang, 50, s5m_ease(u)), sag: 10 * s5m_ease(u),
        core: f.t < 14 ? { hot: 1, t: f.t, flash: (f.t >> 1) & 1 } : null,
        eye: { f: 0, lx: 0, ly: 0 }, flash,
      });
      c.restore();
    },
    draw(e, c) {
      c.save();
      c.beginPath();
      c.rect(0, e.ct, W, e.fb - e.ct);
      c.clip();
      s5m_wall(c, e);
      s5m_tongue(c, e);
      // lunge preview: a ghost of the closed maw where the jaws will slam shut + the line it will reach
      if (e.zoneOn && (e.st === 'wind' || e.st === 'lunge' || (e.st === 'snap' && e.bite < S5M_PH[e.pn].bites))) {
        const k = e.st === 'wind' ? e.zoneK || 0 : 1;
        const pulse = G.reduceFlash ? 0.5 : 0.5 + 0.5 * Math.sin(e.t * 0.5);
        c.globalAlpha = (0.16 + 0.14 * pulse) * k;
        s5m_view(c, { x: e.ghostX, y: e.y, ang: 0, core: null });
        c.globalAlpha = 0.1 * k;
        c.fillStyle = '#ff2030';
        c.fillRect(Math.round(e.zoneX), e.ct, W, e.fb - e.ct);
        c.globalAlpha = 1;
        const blink = G.reduceFlash || ((e.t >> 2) & 1);
        const zx = Math.round(e.zoneX);
        for (let y = e.ct + 1; y < e.fb - 2; y += 6) {
          c.fillStyle = blink ? '#ffd430' : '#ff3a2a';
          c.fillRect(zx, y, 2, 3);
        }
        for (const y of [e.ct + 2, e.fb - 6]) {
          c.fillStyle = blink ? '#ff4040' : '#7a1018';
          c.fillRect(zx - 3, y, 8, 4);
        }
      }
      const fl = e.core.flash > 0;
      s5m_view(c, {
        x: e.x, y: e.y, ang: e.ang, sag: e.sag || 0,
        core: { hot: e.st === 'roar' || e.phaseQ ? 0 : e.core.vuln ? e.hot : e.hot * 0.4, green: Math.max(e.retch, e.green), over: e.st === 'wind' || e.st === 'lunge' ? 1 : 0, flash: fl, t: e.t },
        scars: e.pn - 1,
        eye: { f: e.eyeF, lx: e.lx, ly: e.ly, col: e.pn === 1 ? '#ffb030' : e.pn === 2 ? '#ff6a20' : '#ff2a2a' },
      });
      // acid forming in the mouth
      if (e.retch > 0 && e.st === 'open') {
        const r = 1.5 + 4.2 * e.retch, mx = Math.round(e.x - 38), my = Math.round(e.y - 1);
        c.fillStyle = '#142c06'; s5_disc(c, mx, my, r + 1);
        c.fillStyle = '#7cc41c'; s5_disc(c, mx, my, r);
        c.fillStyle = '#c8f040'; s5_disc(c, mx - 1, my - 1, Math.max(0.5, r - 1.8));
      }
      // roar: shock rings
      if (e.st === 'roar' && e.stT > 1 && e.stT < 76) {
        for (let k = 0; k < 3; k++) {
          const r = ((e.stT * 2.4 + k * 26) % 78) + 6;
          c.globalAlpha = 0.85 * (1 - r / 86);
          s5m_ring(c, e.x - 24, e.y, r * 0.8, r, '#ffe8f0');
          s5m_ring(c, e.x - 24, e.y, r * 0.8 + 1, r + 1, '#ff6a8c');
          s5m_ring(c, e.x - 24, e.y, r * 0.8 - 1, r - 1, '#ff6a8c');
        }
        c.globalAlpha = 1;
      }
      c.restore();
    },
  });

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
  const BOSS_X = 3510;
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
    [3360, 40, 36, 4],
    [3460, 28, 26, 0],
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
    [3320, 0, 0, 0, 0],
    [3440, 190, 20, 60, 0.12],
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
    onLoad() {
      s5m_bakeArt(); // the boss's big sprites are baked here, on the black intro screen, instead of at page load
    },
    onReset(g) {
      g.spawn('s5_pulse', { x: -60, y: -60 });
      g.enemies.unshift(g.enemies.pop()); // drawn first: the rim glow and cilia stay behind every enemy
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
      S.wave(470, 's5_leech', { n: 6, gap: 12, y: 100, amp: 28, each: (i) => ({ phase: (i % 2) * Math.PI }) }); // braid
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
      S.wave(1110, 's5_leech', { n: 6, gap: 11, y: 112, amp: 16, freq: 0.09, speed: 1.9 }); // fast wiggle
      cei(1130, 's5_tentacle', { n: 6, fire: 190 });
      S.wave(1150, 's5_eye', { n: 2, gap: 30, y: 70, dy: 80, spread: 0.45 });
      S.wave(1190, 's5_eye', { n: 1, y: 112, carry: true });

      /* ---- D: the throat, sticky membranes ---- */
      cei(1290, 's5_web', { len: 72 });
      S.wave(1270, 's5_leech', { n: 5, gap: 16, y: 74, dy: 12, amp: 6 }); // descending line
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
      S.wave(2820, 's5_leech', { n: 6, gap: 13, y: 112, amp: 26, each: (i) => ({ phase: (i % 2) * Math.PI }) }); // braid
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

      /* ---- G: recovery. Shoals of gold leeches that ALL carry a capsule: a ship that restarts at the last
       *      checkpoint with nothing can rebuild its power (speed, missile, laser...) before the boss ---- */
      S.wave(3340, 's5_leech', { n: 3, gap: 16, y: 100, amp: 16, carry: 'all' });
      S.wave(3384, 's5_leech', { n: 3, gap: 16, y: 136, dy: 6, amp: 10, carry: 'all' });
      S.wave(3428, 's5_leech', { n: 3, gap: 16, y: 88, dy: 8, amp: 12, carry: 'all' });
      S.wave(3468, 's5_leech', { n: 4, gap: 14, y: 116, amp: 20, carry: 'last' });

      S.boss(BOSS_X, 's5_maw', {});
    },
  });
})();
