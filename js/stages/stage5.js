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
  const DEEP = '#20040e';

  /* ------------------------------------------------------------
   * small helpers
   * ------------------------------------------------------------ */
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

  /** glowing stinger / tip bulb */
  function s5_tip(c, x, y, r, glow, t) {
    x = Math.round(x); y = Math.round(y);
    if (glow > 0) {
      const a = 0.25 + 0.35 * glow;
      c.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * 0.7));
      c.fillStyle = '#ff9424';
      s5_disc(c, x, y, r + 2 + glow * 3);
      c.globalAlpha = 1;
    }
    c.fillStyle = '#160a2a';
    s5_disc(c, x, y, r);
    c.fillStyle = '#c05412';
    s5_disc(c, x, y, r - 1);
    c.fillStyle = glow > 0.5 ? '#ffe646' : '#ff9424';
    s5_disc(c, x - 1, y - 1, Math.max(0.5, r - 2.2));
    c.fillStyle = glow > 0.3 ? '#ffffff' : '#fff2a8';
    c.fillRect(x - 1, y - 1, 1, 1);
    if (glow > 0.6) c.fillRect(x, y - 1, 1, 1);
  }

  /* ------------------------------------------------------------
   * sprite art
   * ------------------------------------------------------------ */
  // tentacle root: a puckered mound of flesh around the wall opening (floor version, flipped for the ceiling)
  Sprites.painted('s5_root', 20, 11, 1, (d) => {
    d.ellipse(10, 9, 9.2, 4.6, '#3a1466');
    d.ellipse(10, 8.4, 8.4, 3.9, '#6a34a4');
    d.ellipse(9, 7.4, 6.6, 2.7, '#9a5cd0');
    d.ellipse(10, 5.2, 4.2, 2.0, '#1a0a2e');
    d.ellipse(10, 5.6, 3.4, 1.4, '#3a1466');
    d.px(4, 6, '#d8b0f4');
    d.px(5, 5, '#d8b0f4');
    d.px(15, 6, '#5a2a90');
    d.px(3, 8, '#8a46c6');
    d.px(16, 8, '#4a1a80');
    d.outline('#160a2a');
  });

  // polyp pod (floor version; flipped on the ceiling): frames idle / swollen / about to burst
  const POLYP = { out: '#1c2408', dark: '#5a6c12', mid: '#a6bc2c', lite: '#e0f060', hi: '#fffff0', spore: '#ff9424', sporeD: '#c05412', mouth: '#701428', lip: '#ffd0a0', collar: '#5a1a4a', collarL: '#96406e' };
  Sprites.painted('s5_polyp', 20, 17, 3, (d, f) => {
    const sw = [0, 0.7, 1.4][f];
    // collar
    d.ellipse(10, 15, 8.4, 2.6, POLYP.collar);
    d.ellipse(10, 14.6, 7.6, 1.9, POLYP.collarL);
    d.ellipse(10, 14.9, 5.2, 1.0, POLYP.collar);
    // sac
    d.ellipse(10, 8.6, 6.6 + sw, 6.8 + sw * 0.8, POLYP.dark);
    d.ellipse(9.4, 8.0, 5.7 + sw, 5.9 + sw * 0.8, POLYP.mid);
    d.ellipse(8.4, 6.8, 3.6 + sw * 0.5, 3.6 + sw * 0.4, POLYP.lite);
    d.px(7, 5, POLYP.hi);
    d.px(8, 4, POLYP.hi);
    d.px(6, 6, POLYP.hi);
    // spores seen through the skin
    const sc = f === 2 ? POLYP.lite : POLYP.spore;
    d.px(9, 10, POLYP.sporeD); d.px(10, 10, sc); d.px(9, 9, sc);
    d.px(13, 8, POLYP.sporeD); d.px(13, 7, sc); d.px(12, 7, sc);
    d.px(7, 11, POLYP.sporeD); d.px(7, 10, sc);
    d.px(12, 12, POLYP.sporeD); d.px(11, 12, sc);
    // mouth
    d.ellipse(10, 2.6 - sw * 0.4, 2.6 + sw * 0.4, 1.2 + sw * 0.4, POLYP.lip);
    d.ellipse(10, 2.8 - sw * 0.4, 1.7 + sw * 0.3, 0.7 + sw * 0.4, POLYP.mouth);
    d.outline(POLYP.out);
  });
  Sprites.recolor('s5_polyp', 's5_polyp_c', {
    '#5a6c12': '#a01c2c', '#a6bc2c': '#f03a3a', '#e0f060': '#ff9424', '#1c2408': '#2a0810', '#ff9424': '#ffe646', '#c05412': '#ff9424',
  });

  // eye pod: sclera (below), lid ring with an opening of 4 sizes (above); the iris is drawn between them
  Sprites.painted('s5_eyeball', 22, 22, 1, (d) => {
    d.ellipse(11, 11, 8.6, 7.6, '#b87a86');
    d.ellipse(10.6, 10.6, 8.0, 7.0, '#f0d0c8');
    d.ellipse(10.2, 10.2, 7.0, 6.0, '#fff4ea');
    d.ellipse(9.4, 9.4, 4.6, 3.6, '#ffffff');
    // bloodshot veins
    d.line(4, 8, 6, 9, '#e05a6a');
    d.line(4, 13, 6, 12, '#e05a6a');
    d.line(17, 9, 15, 10, '#e05a6a');
    d.line(17, 13, 15, 12, '#e05a6a');
    d.px(5, 10, '#e05a6a');
    d.px(16, 11, '#e05a6a');
  });
  Sprites.painted('s5_eyelid', 22, 22, 4, (d, f) => {
    const open = [0, 0.38, 0.7, 1][f];
    d.circle(11, 11, 10.4, '#3a1466');
    d.circle(10.4, 10.4, 9.4, '#6a34a4');
    d.circle(9.6, 9.4, 7.6, '#8a46c6');
    d.circle(8.8, 8.2, 4.2, '#a468d8');
    // lumps on the rim
    for (const [x, y] of [[3, 6], [18, 6], [3, 16], [18, 16], [11, 1], [11, 20]]) {
      d.circle(x, y, 1.6, '#6a34a4');
      d.px(x - 1, y - 1, '#c890f0');
    }
    if (open > 0) {
      for (let y = 0; y < 22; y++)
        for (let x = 0; x < 22; x++) {
          const a = (x - 11) / 8.4, b = (y - 11) / (7.3 * open);
          if (a * a + b * b <= 1) d.erase(x, y);
        }
    } else {
      d.hline(4, 17, 11, '#160a2a');
      d.hline(5, 16, 10, '#c890f0');
      d.px(3, 12, '#160a2a'); d.px(18, 12, '#160a2a');
    }
    d.outline('#160a2a');
  });

  // leech: undulating parasite (faces left). 4 frames, carrier variant is red / orange
  const LEECH = { out: '#06202a', dark: '#0e5a6c', mid: '#1ca0a8', lite: '#64e0d0', belly: '#f2e2a0', bellyD: '#c8a860', mouth: '#e03a4a', mouthD: '#801428', tooth: '#ffffff', eye: '#ffe646' };
  Sprites.painted('s5_leech', 22, 12, 4, (d, f) => {
    const ph = (f * Math.PI) / 2;
    for (let x = 5; x < 21; x++) {
      const t = (x - 5) / 15;
      const yc = 5.5 + Math.sin(ph - x * 0.55) * (0.5 + t * 1.8);
      const th = 3.6 - t * 2.3;
      for (let y = Math.floor(yc - th); y <= Math.ceil(yc + th); y++) {
        const k = (y - yc) / th;
        let col = k < -0.5 ? LEECH.lite : k > 0.45 ? LEECH.dark : LEECH.mid;
        if (k > 0.05 && k < 0.7 && x % 4 !== 0) col = k > 0.4 ? LEECH.bellyD : LEECH.belly;
        if (x % 4 === 0) col = k < 0 ? LEECH.mid : LEECH.dark;
        d.px(x, y, col);
      }
    }
    // head with sucker mouth
    const hy = 5.5 + Math.sin(ph - 5 * 0.55) * 0.5;
    d.circle(4, hy, 3.6, LEECH.dark);
    d.circle(4, hy - 0.5, 3.1, LEECH.mid);
    d.circle(3.4, hy - 1.2, 1.6, LEECH.lite);
    d.circle(1.6, hy, 2.5, LEECH.mouthD);
    d.circle(1.4, hy, 1.7, LEECH.mouth);
    d.px(0, Math.round(hy) - 1, LEECH.tooth);
    d.px(0, Math.round(hy) + 1, LEECH.tooth);
    d.px(4, Math.round(hy) - 3, LEECH.eye);
    d.px(6, Math.round(hy) - 3, LEECH.eye);
    d.outline(LEECH.out);
  });
  Sprites.recolor('s5_leech', 's5_leech_c', {
    '#0e5a6c': '#a01c2c', '#1ca0a8': '#f03a3a', '#64e0d0': '#ff9424', '#f2e2a0': '#ffe646', '#c8a860': '#b89a20', '#06202a': '#2a0810', '#e03a4a': '#1a0a2a', '#801428': '#3c1444',
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
  const AVOID = [0.22, -0.22, 0.45, -0.45, 0.7, -0.7, 1.0, -1.0, 1.4, -1.4];

  ENEMIES.s5_tentacle = {
    w: 14, h: 10, hp: 1, score: 300, attach: 'floor', sink: 3, expl: 'm',
    init(e, o) {
      e.up = e.attach === 'ceil' ? 1 : -1; // screen-y sign of the growth direction (-1 = grows upward)
      e.N = clamp(o.n || 8, 5, 10);
      e.sl = o.sl || 7;
      e.nLive = e.N;
      e.rad = [];
      const r0 = o.r0 || 5, r1 = o.r1 || 3;
      for (let i = 0; i <= e.N; i++) e.rad.push(lerp(r0, r1, i / e.N));
      e.rad[e.N] += 0.8; // tip bulb
      e.ph = o.phase !== undefined ? o.phase : rnd(TAU);
      e.lean0 = o.lean !== undefined ? o.lean : rnd(-0.22, 0.22);
      e.swayAmp = o.sway !== undefined ? o.sway : 0.3;
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
      const hp = (i) => Math.max(1, Math.round((i === 0 ? 3 : i === e.N - 1 ? 2 : 2) * G.diff.hp * (1 + 0.25 * G.loop)));
      e.parts = [];
      for (let i = 0; i < e.N; i++) {
        const sz = Math.round(e.rad[i + 1] * 2) + (i === e.N - 1 ? 1 : 0);
        const h = hp(i);
        e.parts.push({ name: 's' + i, ox: 0, oy: 0, w: sz, h: sz, hp: h, max: h, vuln: true, expl: 's', score: i === e.N - 1 ? 150 : 40 + i * 5 });
      }
    },
    update(e) {
      const P = G.player, T = G.terrain, cam = G.camX;
      const N = e.N, up = e.up;
      const bx = e.wx - cam, by = e.y + up * 3;
      const t = e.t;
      const baseAng = up * (Math.PI / 2);
      const live = e.nLive;

      // ---- reach state machine ----
      if (e.canReach && live === N) {
        if (e.rs === 0) {
          if (--e.rcd <= 0 && P.alive && bx > 30 && bx < W - 12 && P.x < bx + 10) {
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
      const ext = 1 + 0.3 * rb;
      const coilSign = s5_angDiff(e.aim, baseAng) > 0 ? -1 : 1;

      // ---- joints ----
      const J = e.J;
      J[0].x = bx; J[0].y = by;
      let curl = 0;
      const sway = e.swayAmp * Math.sin(t * 0.019 + e.ph);
      for (let i = 0; i < N; i++) {
        curl += (0.04 + 0.018 * i) * Math.sin(t * 0.045 - i * 0.62 + e.ph * 1.7);
        const kk = (i + 1) / N;
        let a = baseAng + e.lean0 + sway * (0.4 + 0.6 * kk) + curl;
        a += coilSign * wind * 0.13 * (i + 1);
        if (rb > 0) a = a + s5_angDiff(e.aim + 0.06 * Math.sin(t * 0.08 - i), a) * rb * (0.55 + 0.45 * kk);
        let len = e.sl * ext;
        if (i === N - 1 && e.kick > 0) len += e.kick * 0.25;
        let nx = J[i].x + Math.cos(a) * len, ny = J[i].y + Math.sin(a) * len;
        if (i > 0 && T.solid(cam + nx, ny)) {
          for (const da of AVOID) {
            const x2 = J[i].x + Math.cos(a + da) * len, y2 = J[i].y + Math.sin(a + da) * len;
            if (!T.solid(cam + x2, y2)) { nx = x2; ny = y2; break; }
          }
        }
        J[i + 1].x = nx; J[i + 1].y = ny;
        const p = e.parts[i];
        p.ox = nx - bx; p.oy = ny - e.y;
      }
      if (e.kick > 0) e.kick--;

      // ---- tip gun ----
      if (e.fireRate && live === N) {
        e.fcd--;
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
        s5_tip(c, tip.x, tip.y, e.rad[N], e.glow, e.t);
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
      let delay = 3;
      let tipX = 0, tipY = 0;
      if (e.nLive === e.N) { tipX = e.x + e.parts[e.N - 1].ox; tipY = e.y + e.parts[e.N - 1].oy; }
      for (let j = i + 1; j < e.parts.length; j++) {
        const q = e.parts[j];
        if (q.dead) continue;
        q.dead = true;
        const qx = e.x + q.ox, qy = e.y + q.oy;
        G.later(delay, () => G.explode(qx, qy, 's', { scroll: true, quiet: (j & 1) === 1 }));
        G.addScore(q.score || 40);
        delay += 3;
      }
      e.nLive = Math.min(e.nLive, i);
      if (e.carry && tipX) {
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
    w: 14, h: 14, hp: 3, score: 150, attach: 'floor', sink: 3, expl: 'm',
    spr: (e) => (e.carry ? 's5_polyp_c' : 's5_polyp'),
    init(e, o) {
      e.ph = rndi(0, 60);
      e.frame = 0;
    },
    update(e) {
      const near = Math.abs(e.x - G.player.x) < 70 && e.x > G.player.x;
      e.frame = near ? 1 + ((e.t >> 3) & 1) : ((e.t + e.ph) >> 5) & 1;
    },
    onDeath(e) {
      const up = e.attach === 'ceil' ? 1 : -1;
      sfx('cellPop');
      // gooey droplets
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 * up + rnd(-1.3, 1.3), s = rnd(0.4, 1.8);
        G.fx.push({ k: 'part', x: e.x, y: e.y + up * 2, vx: Math.cos(a) * s - 0.1, vy: -Math.abs(Math.sin(a)) * s * -up * -1 * (up < 0 ? 1 : -1), life: rndi(16, 34), t: 0, col: pick(['#e0f060', '#a6bc2c', '#ff9424', '#ffffff']), big: chance(0.3) });
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
      e.vx = -(o.speed || 0.85);
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
      if (c === fireAt && e.lid > 0.6 && G.canFire(e)) {
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
   * terrain profile
   * ------------------------------------------------------------ */
  const BOSS_X = 3400;
  const LEN = BOSS_X + W + 120;

  // [x, floor height, ceiling height, noise amplitude]
  const MACRO = [
    [0, 36, 34, 5],
    [280, 38, 36, 6],
    [430, 48, 42, 7],
    [660, 56, 52, 8],
    [880, 50, 48, 8],
    [1010, 42, 40, 6],
    [1260, 44, 42, 6],
    [1340, 60, 58, 5],
    [1440, 68, 62, 4],
    [1540, 54, 50, 6],
    [1720, 46, 44, 6],
    [1860, 40, 38, 5],
    [1960, 36, 34, 3],
    [2540, 38, 36, 3],
    [2640, 56, 54, 6],
    [2780, 64, 62, 6],
    [2920, 52, 58, 8],
    [3050, 58, 50, 8],
    [3200, 44, 42, 6],
    [3330, 34, 34, 2],
    [3400, 34, 34, 0],
    [LEN, 34, 34, 0],
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
    if (x > 1380 && x < 1500) return 92;
    if (x > 2730 && x < 2830) return 94;
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
    // blobs (irregular lumps on both walls) — placed only where the corridor stays open
    const rng = makeRng(77);
    const rr = (a, b) => a + rng() * (b - a);
    const fEff = Float32Array.from(F), cEff = Float32Array.from(C);
    const blobs = [];
    const ZONES = [
      { x0: 60, x1: 400, sp: [70, 130], rx: [14, 26], ry: [8, 14], prot: [4, 10] },
      { x0: 400, x1: 900, sp: [42, 90], rx: [12, 24], ry: [8, 16], prot: [5, 14] },
      { x0: 900, x1: 1300, sp: [50, 100], rx: [14, 28], ry: [8, 16], prot: [5, 12] },
      { x0: 1300, x1: 1520, sp: [36, 70], rx: [10, 20], ry: [8, 14], prot: [4, 12] },
      { x0: 1520, x1: 1900, sp: [45, 95], rx: [12, 24], ry: [8, 16], prot: [5, 12] },
      { x0: 1900, x1: 2600, sp: [70, 140], rx: [18, 30], ry: [8, 14], prot: [3, 8] },
      { x0: 2600, x1: 3120, sp: [34, 80], rx: [10, 22], ry: [8, 16], prot: [5, 14] },
      { x0: 3120, x1: 3330, sp: [70, 120], rx: [14, 24], ry: [8, 12], prot: [3, 8] },
    ];
    for (const wall of ['f', 'c']) {
      const base = wall === 'f' ? F : C, eff = wall === 'f' ? fEff : cEff, other = wall === 'f' ? cEff : fEff;
      for (const z of ZONES) {
        let x = z.x0 + rr(0, z.sp[1]);
        while (x < z.x1) {
          const rx = rr(z.rx[0], z.rx[1]), ry = rr(z.ry[0], z.ry[1]);
          let prot = rr(z.prot[0], z.prot[1]);
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
            if (prot < 3) break;
          }
          if (prot >= 3) {
            const hc = base[xi] + prot - ry;
            for (let col = c0; col <= c1; col++) {
              const u = (col - x) / rx;
              if (Math.abs(u) < 1) eff[col] = Math.max(eff[col], hc + ry * Math.sqrt(1 - u * u));
            }
            blobs.push({ wall, x, rx, ry, hc });
          }
          x += rr(z.sp[0], z.sp[1]);
        }
      }
    }
    s5_cache = { F, C, blobs };
    return s5_cache;
  }

  /* ------------------------------------------------------------
   * terrain decoration: depth shading, wet sheen, vein networks, boils
   * ------------------------------------------------------------ */
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

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
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < LEN; x++) {
        const i = y * LEN + x, o = i * 4;
        const dd = dist[i];
        if (!dd) continue;
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
    checkpoints: [0, 850, 1700, 2600, 3050],

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
            if (b.wall === 'f') g.ellipse(b.x, H - b.hc, b.rx, b.ry, 0, 0, TAU);
            else g.ellipse(b.x, b.hc, b.rx, b.ry, 0, 0, TAU);
            g.fill();
          }
        },
        decorate: s5_decorate,
        skin: {
          kind: 'organic',
          pal: ['#3e0a22', '#620f34', '#8c1e46', '#b53a5a', '#dc6480'],
          outline: '#220510', hi: '#ff9fb4', hi2: '#e0708c', lo: '#2e0616', vein: '#380820', seed: 5,
        },
      };
    },

    background: () =>
      Backgrounds.make([
        { kind: 'gradient', stops: [[0, '#14030d'], [0.5, '#26051a'], [1, '#3a0a22']], steps: 18 },
        { kind: 'ridge', color: '#3a0c22', color2: '#1c0510', edge: '#7a2048', hMin: 40, hMax: 100, speed: 0.22, seed: 5, jag: 0.25, scale: 52 },
        { kind: 'ridge', color: '#340a1e', color2: '#1a0410', edge: '#6a1a40', hMin: 30, hMax: 80, speed: 0.22, seed: 9, jag: 0.25, scale: 60, top: true },
      ]),

    script(S) {
      S.wave(70, 's5_leech', { n: 5, gap: 14, y: 90, amp: 22, carry: 'last' });
      S.wave(200, 's5_leech', { n: 5, gap: 14, y: 140, amp: 24 });
      S.ground(330, 's5_polyp');
      S.ground(470, 's5_tentacle', { n: 7 });
      S.ceil(560, 's5_tentacle', { n: 8, fire: 190, reach: true });
      S.ground(650, 's5_polyp', { carry: true });
      S.at(760, () => G.spawn('s5_eye', { y: 100 }));
      S.boss(BOSS_X, 'bigcore', { level: 5 });
    },
  });
})();
