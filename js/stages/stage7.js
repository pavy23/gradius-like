'use strict';
/* =============================================================
 * STAGE 7 — FORTRESS  (final stage)
 * outer hull run -> hangar -> reactor corridors (laser gates,
 * crushers, Electronic Cage mid-boss) -> final approach -> the
 * BRAIN in its glass chamber (unique final boss "s7_brain").
 * All art is original and generated in code.
 * ============================================================= */
(function stage7() {
  /* ---------- shared palette (violet guard armour, cold gunmetal hull) ---------- */
  const S7 = {
    a0: '#1c1030', a1: '#3e2470', a2: '#6a44b0', a3: '#9c74e0', a4: '#d2b8ff', // violet armour dark -> light
    h0: '#0a0e16', h1: '#161e2c', h2: '#242f42', h3: '#374761', h4: '#54698a', h5: '#8ea4c4', // gunmetal hull
    hz: '#ffd430', hzk: '#1a1408', // hazard stripes
    lr: '#ff3a3a', lg: '#4cff7a', lo: '#ff9424', lc: '#48ecf4', // status lights
  };
  /** a cheap deterministic hash noise 0..1 */
  const s7hash = (a, b) => {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return (((h ^ (h >>> 16)) >>> 0) % 10007) / 10007;
  };

  /* =============================================================
   * ART — enemies
   * ============================================================= */
  /** 3-tone violet armour ellipse, light from the top-left */
  const s7shade = (d, cx, cy, rx, ry) => {
    d.ellipse(cx, cy, rx, ry, S7.a1);
    d.ellipse(cx - 0.6, cy - 0.6, Math.max(1, rx - 1), Math.max(1, ry - 1), S7.a2);
    d.ellipse(cx - 1.4, cy - 1.5, Math.max(1, rx - 2.6), Math.max(1, ry - 2.5), S7.a3);
    d.px(Math.round(cx - rx * 0.5), Math.round(cy - ry * 0.55), S7.a4);
  };
  /** riveted steel foot plate */
  const s7plate = (d, x, y, w, h) => {
    d.rect(x, y, w, h, 'X');
    d.hline(x, x + w - 1, y, 'g');
    d.hline(x, x + w - 1, y + h - 1, 'd');
    d.px(x + 2, y + 1, 'W');
    d.px(x + w - 3, y + 1, 'W');
  };

  // single turret: armoured dome, lens flares while charging
  Sprites.painted('s7_gun', 20, 12, 2, (d, f) => {
    s7shade(d, 10, 7.5, 6.6, 6);
    s7plate(d, 1, 8, 18, 3);
    d.rect(7, 5, 6, 3, 'd');
    d.rect(8, 6, 4, 1, f ? 'w' : 'y');
    if (f) { d.px(7, 6, 'o'); d.px(12, 6, 'o'); }
    d.outline('k');
  });

  // twin turret: two side cannons on a wide pedestal
  Sprites.painted('s7_twin', 26, 13, 2, (d, f) => {
    s7shade(d, 6.5, 8, 4.6, 4.6);
    s7shade(d, 19.5, 8, 4.6, 4.6);
    d.rect(9, 3, 8, 8, S7.a2);
    d.rect(9, 3, 8, 1, S7.a4);
    d.rect(9, 3, 1, 8, S7.a3);
    d.rect(16, 3, 1, 8, S7.a1);
    d.rect(11, 5, 4, 2, 'd');
    d.px(12, 5, f ? 'w' : 'r');
    d.px(13, 5, f ? 'w' : 'r');
    s7plate(d, 1, 9, 24, 3);
    for (const x of [6, 19]) d.rect(x - 1, 6, 3, 2, 'd'), d.px(x, 6, f ? 'w' : 'y');
    d.outline('k');
  });

  // rapid-fire mount: a squat gatling block, barrel cluster drawn procedurally
  Sprites.painted('s7_rapid', 18, 14, 2, (d, f) => {
    d.rect(4, 3, 10, 7, S7.a2);
    d.rect(4, 3, 10, 1, S7.a4);
    d.rect(4, 3, 1, 7, S7.a3);
    d.rect(13, 3, 1, 7, S7.a1);
    d.rect(4, 9, 10, 1, S7.a1);
    d.rect(6, 5, 6, 3, 'd');
    d.rect(7, 6, 4, 1, f ? 'w' : 'r');
    d.px(5, 4, 'y');
    d.px(12, 4, 'y');
    s7plate(d, 1, 10, 16, 3);
    d.outline('k');
  });

  // hangar bay: hazard-striped doors (closed / half / open)
  Sprites.painted('s7_bay', 30, 12, 3, (d, f) => {
    d.rect(1, 3, 28, 8, 'X');
    d.rect(2, 2, 26, 1, 'g');
    d.rect(3, 1, 24, 1, 'W');
    d.rect(1, 10, 28, 1, 'd');
    const gap = [0, 3, 8][f];
    // door leaves with hazard stripes
    for (let side = 0; side < 2; side++) {
      const x0 = side ? 15 + gap : 4;
      const w = 11 - gap;
      d.rect(x0, 4, w, 5, 'G');
      for (let i = 0; i < w; i++) if (((i + x0) >> 1) % 2 === 0) d.rect(x0 + i, 4, 1, 5, S7.hz);
      d.hline(x0, x0 + w - 1, 4, 'W');
      d.hline(x0, x0 + w - 1, 8, 'k');
    }
    if (f > 0) {
      d.rect(15 - gap, 4, gap * 2 + 1, 5, 'k');
      d.rect(16 - gap, 5, gap * 2 - 1, 3, f === 2 ? 'o' : 'O');
      if (f === 2) d.rect(17 - gap, 6, gap * 2 - 3, 1, 'y');
    }
    d.px(2, 5, S7.lr);
    d.px(27, 5, S7.lr);
    d.outline('k');
  });

  // missile rack: three angled tubes (closed / armed / firing)
  Sprites.painted('s7_rack', 24, 17, 3, (d, f) => {
    s7plate(d, 1, 12, 22, 4);
    d.rect(3, 6, 18, 6, S7.a2);
    d.rect(3, 6, 18, 1, S7.a4);
    d.rect(3, 6, 1, 6, S7.a3);
    d.rect(20, 6, 1, 6, S7.a1);
    d.rect(3, 11, 18, 1, S7.a1);
    for (let i = 0; i < 3; i++) {
      const x = 5 + i * 6;
      d.poly([[x, 6], [x + 1, 1], [x + 4, 1], [x + 5, 6]], 'X');
      d.hline(x + 1, x + 4, 1, 'W');
      d.rect(x + 1, 2, 3, 3, 'k');
      if (f >= 1) { d.rect(x + 1, 3, 3, 2, S7.lr); d.px(x + 2, 3, 'y'); }
      if (f === 2) { d.rect(x + 1, 0, 3, 2, 'y'); d.px(x + 2, 0, 'w'); }
    }
    d.rect(6, 8, 12, 2, 'd');
    d.px(8, 9, f ? S7.lr : S7.lg);
    d.px(15, 9, f ? S7.lr : S7.lg);
    d.outline('k');
  });

  // drone fighter (faces left)
  Sprites.painted('s7_drone', 15, 11, 2, (d, f) => {
    d.poly([[0, 5.5], [5, 2], [12, 1], [14, 3], [14, 8], [12, 10], [5, 9]], S7.a1);
    d.poly([[1, 5.5], [5, 3], [12, 2], [13, 4], [13, 7], [12, 9], [5, 8]], S7.a2);
    d.poly([[2, 5.5], [5, 3.6], [11, 2.6], [11, 5]], S7.a3);
    d.poly([[6, 2], [9, -1], [11, 2]], S7.a1);
    d.poly([[6, 9], [9, 12], [11, 9]], S7.a1);
    d.ellipse(6, 5.4, 2.4, 1.6, 'C');
    d.px(5, 5, 'w');
    d.px(6, 4, 'c');
    d.rect(13, 4, 1, 3, f ? 'o' : 'y');
    d.px(14, 5, f ? 'y' : 'o');
    d.outline('k');
  });
  Sprites.recolor('s7_drone', 's7_drone_c', {
    [S7.a1]: 'O', [S7.a2]: 'o', [S7.a3]: 'y', C: 'R',
  });

  // floating mine: spiked sphere with a blinking core
  Sprites.painted('s7_mine', 15, 15, 2, (d, f) => {
    const c = 7;
    for (let k = 0; k < 8; k++) {
      const a = (k * TAU) / 8 + 0.39;
      const ca = Math.cos(a), sa = Math.sin(a);
      d.line(c + ca * 4, c + sa * 4, c + ca * 6.6, c + sa * 6.6, k % 2 ? 'x' : 'g');
      d.px(Math.round(c + ca * 6.6), Math.round(c + sa * 6.6), 'W');
    }
    d.circle(c, c, 4.6, 'd');
    d.circle(c, c, 3.8, 'X');
    d.circle(c - 0.6, c - 0.6, 2.6, 'x');
    d.px(c - 2, c - 2, 'W');
    d.circle(c + 0.4, c + 0.4, 1.6, f ? 'y' : 'r');
    d.px(c, c, f ? 'w' : 'y');
    d.outline('k');
  });

  // homing missile: 16 headings (0 = pointing right, clockwise)
  Sprites.painted('s7_missile', 13, 13, 16, (d, f) => {
    const a = (f * TAU) / 16, ca = Math.cos(a), sa = Math.sin(a);
    const cx = 6, cy = 6;
    const at = (t, s) => [cx + ca * t - sa * s, cy + sa * t + ca * s];
    const put = (t, s, col) => { const p = at(t, s); d.px(Math.round(p[0]), Math.round(p[1]), col); };
    // exhaust
    for (const [t, col] of [[-4.2, 'o'], [-5, 'y'], [-5.8, 'r']]) put(t, 0, col);
    // fins
    put(-3, 2, S7.a2); put(-3, -2, S7.a2); put(-2, 2, S7.a1); put(-2, -2, S7.a1);
    // body
    for (let t = -3.5; t <= 2.5; t += 0.5) {
      put(t, -1, 'W');
      put(t, 0, 'g');
      put(t, 1, 'G');
    }
    // nose
    for (let t = 2.5; t <= 4; t += 0.5) put(t, 0, S7.lr);
    put(3, 0, 'y');
    d.outline('k');
  });

  // mech guard (faces left, 4 walking frames)
  Sprites.painted('s7_walker', 20, 22, 4, (d, f) => {
    const s = Math.sin((f / 4) * TAU), c = Math.cos((f / 4) * TAU);
    const hip = [10, 13];
    const foot1 = [10 + Math.round(s * 4), 20], foot2 = [10 - Math.round(s * 4), 20];
    const knee1 = [hip[0] + Math.round(s * 2) - 2, 17 - (c > 0 ? 1 : 0)], knee2 = [hip[0] - Math.round(s * 2) - 2, 17 - (c < 0 ? 1 : 0)];
    d.line(hip[0], hip[1], knee2[0], knee2[1], 'G');
    d.line(knee2[0], knee2[1], foot2[0], foot2[1], 'G');
    d.rect(foot2[0] - 2, 20, 5, 1, 'x');
    d.line(hip[0], hip[1], knee1[0], knee1[1], 'x');
    d.line(knee1[0], knee1[1], foot1[0], foot1[1], 'x');
    d.line(hip[0] + 1, hip[1], knee1[0] + 1, knee1[1], 'g');
    d.rect(foot1[0] - 2, 20, 5, 1, 'W');
    // torso
    d.poly([[3, 6], [6, 2], [15, 2], [18, 6], [17, 13], [4, 13]], S7.a1);
    d.poly([[4, 6], [7, 3], [14, 3], [16, 6], [15, 12], [5, 12]], S7.a2);
    d.poly([[5, 6], [7, 4], [12, 4], [12, 8]], S7.a3);
    d.px(7, 4, S7.a4);
    d.rect(4, 6, 6, 3, 'd');
    d.rect(5, 7, 4, 1, 'y');
    d.px(5, 7, 'w');
    // shoulder cannon (front = left)
    d.rect(0, 9, 6, 3, 'G');
    d.rect(0, 9, 6, 1, 'x');
    d.rect(0, 11, 2, 1, 'k');
    // back pack + vents
    d.rect(14, 3, 4, 6, S7.a1);
    for (let y = 4; y < 9; y += 2) d.hline(15, 17, y, 'k');
    d.hline(6, 15, 12, S7.a1);
    d.outline('k');
  });

  // rail carriage: gun carriage that slides along the wall (barrel drawn procedurally)
  Sprites.painted('s7_slider', 20, 12, 2, (d, f) => {
    s7shade(d, 10, 8, 5.4, 5);
    d.rect(3, 8, 14, 4, 'X');
    d.rect(3, 8, 14, 1, 'g');
    d.rect(3, 11, 14, 1, 'd');
    d.circle(4, 10, 1.6, 'G');
    d.circle(15, 10, 1.6, 'G');
    d.px(4, 10, 'W');
    d.px(15, 10, 'W');
    d.rect(8, 6, 4, 2, 'd');
    d.rect(9, 6, 2, 1, f ? 'w' : 'y');
    d.outline('k');
  });

  // status lamps (red / green blink)
  Sprites.painted('s7_lamp', 5, 5, 4, (d, f) => {
    const cols = [[S7.lr, '#ffb0a0'], ['#5a1418', '#a03038'], [S7.lg, '#d8ffe0'], ['#14481e', '#2c8a40']][f];
    d.rect(1, 1, 3, 3, cols[0]);
    d.px(1, 1, cols[1]);
    d.outline('k');
  });

  /* =============================================================
   * ART — laser gate emitters, piston heads, cage pylons
   * ============================================================= */
  // gate emitter (drawn for the ceiling; the floor one is flipped): off / warning / armed
  Sprites.painted('s7_emit', 18, 11, 3, (d, f) => {
    d.rect(1, 0, 16, 6, 'X');
    d.rect(1, 0, 16, 1, 'g');
    d.rect(1, 5, 16, 1, 'd');
    d.rect(1, 0, 1, 6, 'W');
    d.px(3, 2, 'W');
    d.px(14, 2, 'W');
    d.poly([[4, 6], [14, 6], [11, 10], [7, 10]], 'G');
    d.poly([[5, 6], [13, 6], [11, 9], [7, 9]], f === 2 ? '#ffffff' : f === 1 ? 'o' : 'R');
    d.hline(7, 11, 9, f === 2 ? 'r' : 'd');
    d.px(2, 3, f === 0 ? S7.lg : S7.lr);
    d.px(15, 3, f === 0 ? S7.lg : S7.lr);
    d.outline('k');
  });

  // crusher head (ceiling orientation: flat top on the rod, hazard-striped face at the bottom)
  Sprites.painted('s7_phead', 30, 16, 2, (d, f) => {
    d.rect(0, 0, 30, 16, 'X');
    d.rect(0, 0, 30, 2, 'g');
    d.rect(0, 0, 1, 16, 'W');
    d.rect(29, 0, 1, 16, 'd');
    d.rect(1, 14, 28, 2, 'd');
    d.rect(8, 2, 14, 3, 'G');
    d.rect(9, 3, 12, 1, f ? S7.lr : 'd');
    for (let x = 1; x < 29; x++) {
      const on = (((x >> 2) + 0) & 1) === 0;
      d.rect(x, 8, 1, 6, on ? S7.hz : S7.hzk);
    }
    d.hline(1, 28, 7, 'k');
    d.px(3, 4, 'W');
    d.px(26, 4, 'W');
    d.outline('k');
  });

  // cage pylon (ceiling orientation: base on the wall, capacitor tip at the bottom): idle / charging / hit
  Sprites.painted('s7_pylon', 24, 30, 3, (d, f) => {
    d.rect(2, 0, 20, 5, 'X');
    d.rect(2, 0, 20, 1, 'g');
    d.rect(2, 4, 20, 1, 'd');
    d.poly([[5, 5], [19, 5], [17, 18], [7, 18]], S7.a1);
    d.poly([[6, 5], [17, 5], [15, 18], [8, 18]], S7.a2);
    d.poly([[7, 5], [10, 5], [10, 17], [9, 17]], S7.a3);
    for (const y of [8, 12, 16]) d.hline(7, 16, y, 'd');
    d.rect(9, 18, 6, 3, 'G');
    const glow = ['c', 'w', 'C'][f];
    d.circle(11.5, 24.5, 5, 'B');
    d.circle(11.5, 24.5, 4, f === 1 ? 'c' : 'C');
    d.circle(11.5, 24.5, 2.4, glow);
    d.px(10, 23, 'w');
    d.px(11, 23, 'w');
    for (const [x, y] of [[4, 22], [19, 22], [11, 29]]) d.px(x, y, f === 1 ? 'w' : 'c');
    d.outline('k');
  });

  /* =============================================================
   * ART — final boss: the brain, satellite eyes, spores
   * ============================================================= */
  const S7_BRAIN_W = 88, S7_BRAIN_H = 74;

  /** giant brain: 4 vein-pulse frames; pal = flesh tones, veins = 4 glow levels */
  function s7bakeBrain(name, pal, veins) {
    const Wd = S7_BRAIN_W, Hd = S7_BRAIN_H;
    // silhouette = union of ellipses [cx, cy, rx, ry]
    const blobs = [[29, 30, 27, 24], [58, 30, 28, 24], [44, 23, 32, 20], [30, 42, 22, 18], [55, 42, 24, 18], [68, 52, 15, 11], [40, 50, 18, 12]];
    const inside = (x, y, grow = 0) => blobs.some(([cx, cy, rx, ry]) => ((x - cx) / (rx + grow)) ** 2 + ((y - cy) / (ry + grow)) ** 2 <= 1);
    // sulci (fold lines) and vein paths are deterministic
    const rng = makeRng(404);
    const folds = [];
    for (let k = 0; k < 15; k++) {
      let x = 8 + rng() * 72, y = 6 + rng() * 44, a = rng() * TAU;
      const pts = [];
      for (let i = 0; i < 12 + Math.floor(rng() * 10); i++) {
        pts.push([Math.round(x), Math.round(y)]);
        a += (rng() - 0.5) * 1.5;
        x += Math.cos(a) * 1.6;
        y += Math.sin(a) * 1.6;
      }
      folds.push(pts);
    }
    const veinPaths = [
      [[44, 34], [38, 30], [30, 26], [22, 24], [14, 26]],
      [[44, 34], [50, 28], [58, 22], [66, 20], [74, 24]],
      [[44, 34], [40, 42], [34, 48], [26, 50], [20, 46]],
      [[44, 34], [52, 40], [60, 46], [68, 48], [76, 44]],
      [[44, 34], [44, 24], [42, 16], [44, 9]],
      [[30, 26], [28, 18], [32, 12]],
      [[58, 22], [60, 14], [56, 9]],
      [[26, 50], [30, 58], [38, 60]],
      [[60, 46], [58, 56], [52, 60]],
    ];
    Sprites.painted(name, Wd, Hd, 4, (d, f) => {
      // body in 3 tones (light from the top-left)
      for (let y = 0; y < Hd; y++)
        for (let x = 0; x < Wd; x++) {
          if (!inside(x, y)) continue;
          let col = pal[1];
          if (!inside(x + 1, y + 1, -0.5) && !inside(x + 2, y + 2, -0.5)) col = pal[0];
          else if (!inside(x - 2, y - 2)) col = pal[2];
          else if (!inside(x - 4, y - 5)) col = pal[2];
          d.px(x, y, col);
        }
      // sulci: a lit ridge above-left of a dark groove (continuous lines)
      for (const pts of folds) {
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
          if (!inside(x0, y0, -2) || !inside(x1, y1, -2)) continue;
          d.line(x0 - 1, y0 - 1, x1 - 1, y1 - 1, pal[3]);
        }
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
          if (!inside(x0, y0, -2) || !inside(x1, y1, -2)) continue;
          d.line(x0, y0, x1, y1, pal[0]);
        }
      }
      // central fissure
      d.line(44, 6, 44, 30, pal[0]);
      d.line(45, 8, 45, 28, pal[0]);
      // cerebellum ridges and stem
      for (let i = 0; i < 4; i++) d.line(56, 47 + i * 3, 78, 45 + i * 3, pal[0]);
      d.rect(34, 58, 8, 14, pal[1]);
      d.rect(34, 58, 2, 14, pal[2]);
      d.rect(40, 58, 2, 14, pal[0]);
      // veins: glow level f
      const vc = veins[f];
      for (const path of veinPaths) {
        for (let i = 0; i < path.length - 1; i++) {
          d.line(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], vc[0]);
          if (f >= 1) d.line(path[i][0], path[i][1] - 1, path[i + 1][0], path[i + 1][1] - 1, vc[1]);
        }
      }
      d.circle(44, 34, 3 + f * 0.5, vc[0]);
      d.circle(44, 34, 2, vc[1]);
      d.px(44, 34, vc[2]);
      d.outline('k');
    });
  }
  const S7_FLESH = ['#6a2a5c', '#b8508c', '#e88ab8', '#ffd0e4'];
  s7bakeBrain('s7_brain', S7_FLESH, [['#3a2a8c', '#5a4ac8', '#8a8af0'], ['#2848c8', '#48a0f8', '#c8f0ff'], ['#2a96c8', '#48ecf4', '#ffffff'], ['#48ecf4', '#c8ffff', '#ffffff']]);
  s7bakeBrain('s7_brainR', ['#6a1c30', '#c04058', '#f07890', '#ffc8d0'], [['#8c1c1c', '#c83030', '#f06a5a'], ['#c83020', '#ff7a30', '#ffe0a0'], ['#ff9424', '#ffd430', '#ffffff'], ['#ffd430', '#fff2a8', '#ffffff']]);

  // satellite eye: steel housing + violet armour, eyeball (closed / open / charging)
  Sprites.painted('s7_eye', 24, 24, 3, (d, f) => {
    d.circle(11.5, 11.5, 11, 'd');
    d.circle(11.5, 11.5, 10, 'X');
    d.circle(11, 11, 9, 'G');
    d.ring(11.5, 11.5, 9.5, 2, S7.a2);
    d.ring(11.5, 11.5, 9.5, 1, S7.a3);
    for (const [x, y] of [[3, 6], [20, 6], [3, 17], [20, 17]]) d.px(x, y, 'W');
    d.circle(11.5, 11.5, 6.5, '#e8f0ff'); // sclera
    d.circle(11.5, 11.5, 6.5, f === 2 ? '#fff6c8' : '#e8f0ff');
    d.ring(11.5, 11.5, 6.6, 1, '#7a8aa8');
    const iris = f === 2 ? ['#ff9424', '#ffe646', '#ffffff'] : ['#a01c2c', '#f03a3a', '#ffb0a0'];
    d.circle(10.5, 11.5, 4, iris[0]);
    d.circle(10.5, 11.5, 3, iris[1]);
    d.rect(9, 9, 3, 5, 'k');
    d.px(9, 9, iris[2]);
    if (f === 0) { // half-closed lid
      d.rect(4, 4, 16, 6, 'X');
      d.rect(4, 9, 16, 1, 'k');
      d.rect(5, 4, 14, 1, 'g');
    }
    d.outline('k');
  });

  // slow homing spore (shootable enemy bullet)
  Sprites.painted('s7_spore', 9, 9, 2, (d, f) => {
    d.circle(4, 4, 4, 'N');
    d.circle(4, 4, 3.2, 'n');
    d.circle(4, 4, 2, f ? 'l' : 'y');
    d.px(3, 3, 'w');
    for (const [x, y] of [[4, 0], [4, 8], [0, 4], [8, 4]]) d.px(x, y, f ? 'y' : 'l');
    d.outline('k');
  });

  /* =============================================================
   * TERRAIN — the fortress hull, hangar, reactor and approach
   * (rectangular blocks use type 'flat': the shared 'pillar' feature
   *  only fills half of its width, see final report)
   * ============================================================= */
  const BOSS_X = 5040;
  const LEN = BOSS_X + W + 120;

  const F = (x0, x1, h) => ({ type: 'flat', x0, x1, h });
  const SL = (x0, x1, h0, h1) => ({ type: 'slope', x0, x1, h0, h1 });
  /** stepped tower: wide base + narrow cap (centre cx) */
  const tower = (cx, baseH, capH, capW = 22) => [F(cx - 22, cx + 22, baseH), F(cx - capW / 2, cx + capW / 2, capH)];

  const S7_FLOOR = [
    SL(300, 420, 0, 34),
    F(420, 2050, 34), // hull top -> hangar floor
    // outer hull: turret towers and the rack deck
    ...tower(463, 52, 72),
    ...tower(600, 56, 86),
    ...tower(736, 50, 66),
    SL(770, 790, 34, 52), F(790, 900, 52), SL(900, 920, 52, 34),
    { type: 'hill', x: 1010, w: 70, h: 44, shape: 'mesa', top: 0.5 },
    { type: 'hill', x: 1110, w: 50, h: 42, shape: 'round' },
    // hangar: raised bay pads
    { type: 'hill', x: 1290, w: 84, h: 52, shape: 'mesa', top: 0.55 },
    { type: 'hill', x: 1500, w: 84, h: 52, shape: 'mesa', top: 0.55 },
    { type: 'hill', x: 1700, w: 84, h: 52, shape: 'mesa', top: 0.55 },
    // airlock (bulkhead sill), reactor hall, long corridor
    SL(2050, 2110, 34, 44), F(2110, 2180, 44), F(2086, 2116, 56),
    SL(2180, 2250, 44, 30), F(2250, 2950, 30), SL(2950, 3020, 30, 46),
    F(3020, 4930, 46),
    // final approach: pedestals for the turret rows
    ...[4020, 4110, 4200, 4290, 4380, 4470].map((cx) => F(cx - 20, cx + 20, 62)),
    SL(4930, 5000, 46, 30), F(5000, LEN, 30),
  ];

  const S7_CEIL = [
    SL(1090, 1210, 0, 46), F(1210, 2050, 46),
    // hangar gantries (hanging beams / crane blocks)
    F(1330, 1344, 84), F(1414, 1428, 80), F(1580, 1660, 66), F(1760, 1774, 84),
    F(1900, 1914, 84), F(1990, 2040, 62),
    // airlock (bulkhead lintel)
    SL(2050, 2110, 46, 52), F(2110, 2180, 52), F(2086, 2116, 62),
    SL(2180, 2250, 52, 24), F(2250, 2950, 24), SL(2950, 3020, 24, 46),
    F(3020, 4930, 46),
    ...[4065, 4155, 4245, 4335, 4425, 4515].map((cx) => F(cx - 20, cx + 20, 60)),
    SL(4930, 5000, 46, 26), F(5000, LEN, 26),
  ];

  /** paint decorations on the skinned terrain canvas (solid pixels only) */
  function s7decorate(g, T) {
    const L = T.length;
    const img = g.getImageData(0, 0, L, H);
    const px = new Uint32Array(img.data.buffer);
    const c32 = Terrain.rgb32;
    const K = { hz: c32(S7.hz), hzk: c32(S7.hzk), red: c32(S7.lr), grn: c32(S7.lg), org: c32(S7.lo), dk: c32('#05080e'),
      p0: c32('#0c1420'), p1: c32('#1e2c44'), p2: c32('#3b5074'), p3: c32('#6f8db8'), p4: c32('#b4cdea'),
      cbl0: c32('#2a0c14'), cbl1: c32('#5a1c28'), cbl2: c32('#14283e'), cbl3: c32('#28507a'), win0: c32('#301006'), win1: c32('#c85a10'), win2: c32('#ffb030'), win3: c32('#fff0a0') };
    const put = (x, y, col) => {
      if (x < 0 || y < 0 || x >= L || y >= H) return;
      if (T.mask[x * H + y]) px[y * L + x] = col;
    };
    const ft = (x) => T.floorTopArr[Math.max(0, Math.min(L - 1, x))];
    const cb = (x) => T.ceilBotArr[Math.max(0, Math.min(L - 1, x))];

    // hazard stripes along the surfaces near mechanisms
    const hazard = (x0, x1, floor, ceil) => {
      for (let x = x0; x <= x1; x++) {
        for (let k = 0; k < 4; k++) {
          const col = (((x - k) >> 2) & 1) ? K.hz : K.hzk;
          if (floor && ft(x) < H) put(x, ft(x) + 3 + k, col);
          if (ceil && cb(x) > 0) put(x, cb(x) - 4 - k, col);
        }
      }
    };
    hazard(3040, 3660, true, true); // gate / crusher corridor
    hazard(2052, 2180, true, true); // airlock
    hazard(1160, 1240, true, true); // hangar mouth
    hazard(4990, 5070, true, true);
    for (const cx of [1290, 1500, 1700]) hazard(cx - 24, cx + 24, true, false); // bay pads
    hazard(790, 900, true, false); // rack deck

    // conduits (pipes) following the surfaces
    const pipe = (x0, x1, off, ceil, big) => {
      const th = big ? 6 : 4;
      for (let x = x0; x <= x1; x++) {
        const y0 = ceil ? cb(x) - off - th : ft(x) + off;
        if (!ceil && ft(x) >= H) continue;
        if (ceil && cb(x) <= 0) continue;
        const joint = x % 46 < 3;
        for (let k = 0; k < th; k++) {
          let col = k === 0 ? K.p4 : k === 1 ? K.p3 : k >= th - 1 ? K.p0 : k === th - 2 ? K.p1 : K.p2;
          if (joint) col = k === 0 || k === th - 1 ? K.p0 : K.p1;
          put(x, y0 + k, col);
        }
      }
    };
    pipe(430, 1150, 14, false, true);
    pipe(1210, 2048, 12, false, false);
    pipe(1212, 2048, 12, true, false);
    pipe(2112, 2250, 10, false, true);
    pipe(3022, 3940, 10, true, true);
    pipe(3022, 3940, 12, false, false);
    pipe(3945, 4930, 10, false, true);
    pipe(3945, 4930, 12, true, false);

    // sagging cable bundles under the ceiling mass
    const cable = (x0, x1, span, base, cols) => {
      for (let x = x0; x <= x1; x++) {
        const u = ((x - x0) % span) / span;
        const sag = Math.round(Math.sin(u * Math.PI) * 6);
        cols.forEach((col, i) => put(x, cb(x) - 7 - i * 2 - sag + base, col));
      }
    };
    cable(1212, 2048, 60, 0, [K.cbl1, K.cbl0]);
    cable(1230, 2040, 90, 6, [K.cbl3, K.cbl2]);
    cable(3022, 3940, 70, 0, [K.cbl1, K.cbl0]);
    cable(3945, 4928, 80, 2, [K.cbl3, K.cbl2]);

    // hangar gantry: a lattice truss embedded in the ceiling mass
    const lattice = (x0, x1) => {
      for (let x = x0; x <= x1; x++) {
        const c0 = cb(x);
        if (c0 < 40) continue;
        put(x, c0 - 34, K.p3); put(x, c0 - 33, K.p1);
        put(x, c0 - 23, K.p3); put(x, c0 - 22, K.p1);
        const u = x % 24, yy = u < 12 ? u : 24 - u;
        put(x, c0 - 33 + yy, K.dk); put(x, c0 - 33 + yy + 1, K.p2);
        if (u === 0 || u === 12) { put(x, c0 - 34, K.p4); put(x, c0 - 22, K.p4); }
      }
    };
    lattice(1216, 2046);
    lattice(3024, 3936);

    // status lights and vent grilles
    const light = (x, y, col) => {
      for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) put(x + dx, y + dy, K.dk);
      put(x, y, col); put(x + 1, y, col); put(x, y + 1, col); put(x + 1, y + 1, col);
    };
    const vent = (x, y, w, h) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, j % 2 === 0 ? K.dk : K.p1);
      for (let i = 0; i < w; i++) put(x + i, y + h, K.p3);
    };
    for (let x = 440; x < 5000; x += 23 + ((x * 7) % 13)) {
      const r = s7hash(x, 3);
      if (ft(x) < H && ft(x) - 0 > 0 && T.mask[x * H + ft(x) + 8] && ft(x) < 200) {
        if (r < 0.55) light(x, ft(x) + 9 + (r < 0.2 ? 6 : 0), r < 0.3 ? K.red : K.grn);
        else if (r > 0.86 && T.mask[(x + 12) * H + ft(x) + 20]) vent(x, ft(x) + 12, 12, 6);
      }
      if (cb(x) > 12 && (x % 5) === 0 && r > 0.4) light(x, cb(x) - 10, r > 0.7 ? K.grn : K.red);
    }

    // reactor windows: glowing slits in the hall ceiling / floor
    for (const [x0, x1] of [[2270, 2400], [2440, 2570], [2610, 2740], [2780, 2930]]) {
      for (let x = x0; x < x1; x++) {
        const u = x - x0;
        if (u % 34 > 22) continue;
        for (let j = 0; j < 4; j++) {
          const col = j === 0 ? K.win1 : j === 1 || j === 2 ? K.win2 : K.win1;
          put(x, 6 + j, u % 34 === 0 || u % 34 === 22 ? K.win0 : col);
          put(x, H - 16 - j, u % 34 === 0 || u % 34 === 22 ? K.win0 : col);
        }
        if (u % 5 === 1) { put(x, 7, K.win3); put(x, H - 15, K.win3); }
      }
    }
    g.putImageData(img, 0, 0);
  }

  const s7terrain = () => ({
    length: LEN,
    floor: S7_FLOOR,
    ceil: S7_CEIL,
    decorate: s7decorate,
    skin: {
      kind: 'metal',
      pal: ['#0b111c', '#182338', '#28364e', '#3a4c68', '#6a82a6'],
      outline: '#04070d', hi: '#a4bcd8', hi2: '#6a82a4', lo: '#080c15',
      light: '#ff4040', bw: 32, bh: 16, seed: 77,
    },
  });

  /* =============================================================
   * BACKGROUND — space + far skyline outside, dark machinery inside
   * ============================================================= */
  const s7outerA = (camX) => clamp((1240 - camX) / 110, 0, 1); // 1 = open space, 0 = fortress interior

  /** distant fortress skyline seen from the outer hull: bastions, domes, trusses, gun batteries */
  function s7bakeSkyline(P) {
    const d = new Sprites.Painter(P, H, {});
    const rng = makeRng(31);
    const BODY = '#0c1322', RIM = '#22355a', RIM2 = '#162441', AMBER = '#c08030', CYAN = '#2a8aa8';
    const base = H - 34;
    const rect = (x, y, w, h, col) => { for (const o of [0, -P, P]) if (x + o + w > 0 && x + o < P) d.rect(x + o, y, w, h, col); };
    const bastion = (x, w, h) => {
      const tw = Math.round(w * 0.6), off = (w - tw) >> 1, top = base - h;
      for (const o of [0, -P, P]) {
        if (x + o + w < 0 || x + o > P) continue;
        const X = x + o;
        d.poly([[X, base], [X + off, top + 10], [X + off + 3, top], [X + off + tw - 3, top], [X + off + tw, top + 10], [X + w, base]], BODY);
        d.line(X, base, X + off, top + 10, RIM2);
        d.line(X + off, top + 10, X + off + 3, top, RIM);
        d.hline(X + off + 3, X + off + tw - 3, top, RIM);
        d.vline(X + off + tw - 3, top + 1, top + 10, RIM2);
      }
      // amber slit windows in a few rows
      for (let y = top + 16; y < base - 10; y += 8 + Math.floor(rng() * 6)) {
        if (rng() < 0.72) rect(x + (w >> 1) - 8 + Math.floor(rng() * 5), y, 6 + Math.floor(rng() * 8), 1 + (rng() < 0.2 ? 1 : 0), rng() < 0.85 ? AMBER : CYAN);
      }
      if (rng() < 0.7) { // antenna with a red beacon
        const ax = x + (w >> 1);
        rect(ax, top - 12, 1, 12, RIM);
        rect(ax - 1, top - 13, 3, 1, rng() < 0.5 ? '#ff4040' : '#4cff7a');
      }
      if (rng() < 0.4) { // side gun battery
        const gy = top + 18 + Math.floor(rng() * 10);
        for (let i = 0; i < 9; i++) rect(x + w - 2 + i, gy - (i >> 1), 2, 3, BODY);
        rect(x + w + 6, gy - 5, 3, 1, RIM);
      }
    };
    const dome = (cx, r) => {
      for (const o of [0, -P, P]) {
        d.circle(cx + o, base, r, BODY);
        for (let a = Math.PI * 1.1; a < Math.PI * 1.7; a += 0.05) d.px(Math.round(cx + o + Math.cos(a) * r), Math.round(base + Math.sin(a) * r), RIM);
        d.hline(cx + o - r + 2, cx + o + r - 2, base - Math.round(r * 0.45), RIM2);
        d.hline(cx + o - r + 5, cx + o + r - 5, base - Math.round(r * 0.75), RIM2);
      }
      rect(cx - 1, base - r - 5, 2, 5, RIM);
    };
    const truss = (x0, x1, y) => {
      rect(x0, y, x1 - x0, 3, BODY);
      rect(x0, y, x1 - x0, 1, RIM);
      for (let x = x0 + 2; x < x1 - 8; x += 9) for (const o of [0, -P, P]) d.line(x + o, y + 3, x + o + 5, y + 11, BODY);
    };
    let x = 0, last = null;
    while (x < P) {
      const r = rng();
      const w = 22 + Math.floor(rng() * 26);
      if (r < 0.78) {
        const h = 50 + Math.floor(rng() * 92);
        bastion(x, w, h);
        if (last && rng() < 0.5) truss(last.x + last.w - 2, x + 2, base - 36 - Math.floor(rng() * 20));
        last = { x, w };
      } else if (r < 0.88) {
        dome(x + w / 2, 11 + Math.floor(rng() * 8));
        last = null;
      } else {
        rect(x, base - 24, w + 6, 24, BODY);
        rect(x, base - 24, w + 6, 1, RIM);
        last = null;
      }
      x += w + 4 + Math.floor(rng() * 10);
    }
    return d.c;
  }

  /** far interior: colossal gear silhouettes and glowing reactor shafts */
  function s7bakeFar(P) {
    const d = new Sprites.Painter(P, H, {});
    for (let y = 0; y < H; y++) d.rect(0, y, P, 1, y < 60 ? '#080c16' : y < 150 ? '#0b111d' : '#121824');
    const gear = (cx, cy, r, teeth, fill, edge) => {
      d.circle(cx, cy, r, fill);
      for (let k = 0; k < teeth; k++) {
        const a = (k * TAU) / teeth;
        const ca = Math.cos(a), sa = Math.sin(a);
        d.poly([[cx + ca * (r - 1) - sa * 4, cy + sa * (r - 1) + ca * 4], [cx + ca * (r + 6) - sa * 2.5, cy + sa * (r + 6) + ca * 2.5],
          [cx + ca * (r + 6) + sa * 2.5, cy + sa * (r + 6) - ca * 2.5], [cx + ca * (r - 1) + sa * 4, cy + sa * (r - 1) - ca * 4]], fill);
      }
      d.ring(cx, cy, r - 6, 2, edge);
      d.circle(cx, cy, r * 0.28, edge);
      d.circle(cx, cy, r * 0.16, fill);
    };
    gear(84, 116, 60, 16, '#0f1726', '#1b2a44');
    gear(330, 70, 44, 12, '#101828', '#1c2c48');
    gear(452, 168, 50, 14, '#0e1524', '#1a2840');
    // reactor shafts: tall tubes with glowing segments
    for (const x of [200, 250, 420]) {
      d.rect(x, 0, 14, H, '#0d1524');
      d.rect(x, 0, 1, H, '#22355a');
      d.rect(x + 13, 0, 1, H, '#070b13');
      for (let y = 30; y < 190; y += 26) {
        d.rect(x + 3, y, 8, 12, '#2a0c06');
        d.rect(x + 4, y + 1, 6, 10, '#7a2a0c');
        d.rect(x + 5, y + 3, 4, 6, '#c8501a');
        d.rect(x + 6, y + 5, 2, 2, '#ffb050');
      }
    }
    return d.c;
  }

  /** mid interior: girders, braces, hanging pipes, dark windows */
  function s7bakeWall(P) {
    const d = new Sprites.Painter(P, H, {});
    const rng = makeRng(57);
    for (let gx = 0; gx < P; gx += 96) {
      d.rect(gx, 0, 12, H, '#141d2e');
      d.rect(gx, 0, 2, H, '#2a3a58');
      d.rect(gx + 10, 0, 2, H, '#0a101c');
      for (let y = 6; y < H; y += 14) { d.px(gx + 4, y, '#3a4e74'); d.px(gx + 8, y, '#0a101c'); }
      // cross brace to the next girder
      const y0 = 44 + Math.floor(rng() * 40);
      d.rect(gx + 12, y0, 84, 6, '#101828');
      d.rect(gx + 12, y0, 84, 1, '#22324e');
      d.rect(gx + 12, y0 + 5, 84, 1, '#070b13');
      for (let x = gx + 20; x < gx + 92; x += 16) d.line(x, y0 + 5, x + 8, y0 + 44, '#0c1220');
      // hanging pipe with joints
      const px = gx + 30 + Math.floor(rng() * 40);
      d.rect(px, 0, 5, H, '#18233a');
      d.rect(px, 0, 1, H, '#34496e');
      d.rect(px + 4, 0, 1, H, '#0a101c');
      for (let y = 20; y < H; y += 38) { d.rect(px - 1, y, 7, 3, '#22324e'); d.rect(px - 1, y, 7, 1, '#4a6088'); }
      // circuit traces: right-angle runs with glowing nodes
      let cx = gx + 16, cy = 60 + Math.floor(rng() * 110);
      for (let seg = 0; seg < 6; seg++) {
        const len = 6 + Math.floor(rng() * 14);
        d.hline(cx, cx + len, cy, '#0f3040');
        d.px(cx + len, cy, rng() < 0.5 ? '#2a8aa8' : '#3ab86a');
        cx += len;
        if (cx > gx + 90) break;
        const dy = (rng() < 0.5 ? -1 : 1) * (4 + Math.floor(rng() * 10));
        d.vline(cx, Math.min(cy, cy + dy), Math.max(cy, cy + dy), '#0f3040');
        cy = clamp(cy + dy, 50, 190);
      }
      // dark window panel
      const wy = 100 + Math.floor(rng() * 40);
      d.rect(gx + 58, wy, 26, 14, '#090e18');
      d.rect(gx + 58, wy, 26, 1, '#2a3a58');
      for (let i = 0; i < 4; i++) d.rect(gx + 60 + i * 6, wy + 3, 3, 8, rng() < 0.5 ? '#0e2a3a' : '#1a2a1a');
    }
    return d.c;
  }

  /** rotating gear sprite: 8 frames cover one tooth pitch */
  function s7bakeGearFrames(name, r, teeth) {
    const n = 8, S = r * 2 + 16;
    Sprites.painted(name, S, S, n, (d, f) => {
      const c = S / 2 - 0.5;
      const a0 = (f * TAU) / teeth / n;
      d.circle(c, c, r, '#182238');
      for (let k = 0; k < teeth; k++) {
        const a = a0 + (k * TAU) / teeth;
        const ca = Math.cos(a), sa = Math.sin(a);
        d.poly([[c + ca * (r - 1) - sa * 3.6, c + sa * (r - 1) + ca * 3.6], [c + ca * (r + 6) - sa * 2.4, c + sa * (r + 6) + ca * 2.4],
          [c + ca * (r + 6) + sa * 2.4, c + sa * (r + 6) - ca * 2.4], [c + ca * (r - 1) + sa * 3.6, c + sa * (r - 1) - ca * 3.6]], '#182238');
        d.line(c + ca * (r * 0.3), c + sa * (r * 0.3), c + ca * (r - 3), c + sa * (r - 3), '#0d1524');
        d.px(Math.round(c + ca * (r + 5)), Math.round(c + sa * (r + 5)), '#2c4068');
      }
      d.ring(c, c, r - 3, 1, '#2c4068');
      d.circle(c, c, r * 0.3, '#0d1524');
      d.circle(c, c, r * 0.18, '#22324e');
      d.circle(c, c, 2, '#0a101c');
    });
  }
  s7bakeGearFrames('s7_gearA', 26, 12);
  s7bakeGearFrames('s7_gearB', 18, 9);

  /** the reactor core glowing behind the machinery (passes by during the cage hall) */
  Sprites.painted('s7_reactor', 150, 150, 2, (d, f) => {
    const c = 75;
    const cols = ['#160a08', '#26100a', '#421a0e', '#66280f', '#8c3a14', '#b05a1c', '#d88a3c', '#f4c070'];
    const radii = [74, 64, 54, 44, 34, 24, 14, 6];
    radii.forEach((r, i) => d.circle(c - 0.5, c - 0.5, r + (f && i > 3 ? 1 : 0), cols[i]));
    // structural rings and spokes
    d.ring(c - 0.5, c - 0.5, 58, 2, '#0a0e16');
    d.ring(c - 0.5, c - 0.5, 30, 1, '#0a0e16');
    for (let k = 0; k < 12; k++) {
      const a = (k * TAU) / 12 + f * 0.13;
      d.line(c + Math.cos(a) * 32, c + Math.sin(a) * 32, c + Math.cos(a) * 58, c + Math.sin(a) * 58, '#0a0e16');
    }
  });

  const s7strip = (ctx, img, off, y) => {
    const P = img.width;
    const o = ((Math.floor(off) % P) + P) % P;
    ctx.drawImage(img, -o, y);
    if (P - o < W) ctx.drawImage(img, P - o, y);
  };

  const s7background = () => {
    const sky = s7bakeSkyline(512), far = s7bakeFar(512), wall = s7bakeWall(384);
    const rng = makeRng(9);
    const stars = Array.from({ length: 90 }, () => ({ x: rng() * 300, y: rng() * 150, c: pick(['#ffffff', '#a8c8ff', '#ffe0a0']), p: rng() * TAU, big: rng() < 0.1 }));
    const lights = Array.from({ length: 28 }, (_, i) => ({ x: i * 61 + Math.floor(rng() * 40), y: 30 + Math.floor(rng() * 150), p: rng() * TAU, c: rng() < 0.5 ? '#ff4040' : '#4cff7a' }));
    return Backgrounds.make([
      { kind: 'gradient', stops: [[0, '#02030a'], [0.45, '#0a1020'], [0.8, '#1a1626'], [1, '#2a1a24']], steps: 18 },
      { // open space: stars + distant skyline (fades out inside the fortress)
        kind: 'custom',
        draw(ctx, camX, t) {
          const a = s7outerA(camX);
          if (a <= 0) return;
          ctx.globalAlpha = a;
          for (const s of stars) {
            let x = (s.x - camX * 0.06 - t * 0.02) % 300;
            if (x < 0) x += 300;
            if (x >= W || Math.sin(t * 0.07 + s.p) < -0.8) continue;
            ctx.fillStyle = s.c;
            ctx.fillRect(Math.floor(x), Math.floor(s.y), s.big ? 2 : 1, s.big ? 2 : 1);
          }
          s7strip(ctx, sky, camX * 0.16 + t * 0.03, 0);
          ctx.globalAlpha = 1;
        },
      },
      { // inside: far gears + reactor glow shafts, pulsing
        kind: 'custom',
        draw(ctx, camX, t) {
          const a = 1 - s7outerA(camX);
          if (a <= 0) return;
          ctx.globalAlpha = a;
          const off = camX * 0.14 + t * 0.05;
          s7strip(ctx, far, off, 0);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a * (0.10 + 0.06 * Math.sin(t * 0.045));
          ctx.fillStyle = '#ff6a20';
          for (const sx of [207, 257, 427]) {
            let x = (sx - off) % 512;
            if (x < -20) x += 512;
            for (const xx of [x, x - 512]) ctx.fillRect(Math.floor(xx) - 6, 0, 26, H);
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        },
      },
      { // inside: the reactor core far behind the girders
        kind: 'custom',
        draw(ctx, camX, t) {
          const a = 1 - s7outerA(camX);
          const sx = 830 - camX * 0.3;
          if (a <= 0 || sx < -90 || sx > W + 90) return;
          const pulse = 0.5 + 0.5 * Math.sin(t * 0.05);
          ctx.globalAlpha = a * (0.30 + 0.10 * pulse);
          Sprites.draw(ctx, 's7_reactor', Math.round(sx), 108, { frame: (t >> 4) & 1 });
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a * 0.05 * pulse;
          Sprites.draw(ctx, 's7_reactor', Math.round(sx), 108, { frame: (t >> 4) & 1 });
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        },
      },
      { // inside: girders, braces, pipes
        kind: 'custom',
        draw(ctx, camX, t) {
          const a = 1 - s7outerA(camX);
          if (a <= 0) return;
          ctx.globalAlpha = a;
          s7strip(ctx, wall, camX * 0.32 + t * 0.06, 0);
          ctx.globalAlpha = 1;
        },
      },
      { // inside: turning gears + blinking status lights
        kind: 'custom',
        draw(ctx, camX, t) {
          const a = 1 - s7outerA(camX);
          if (a <= 0) return;
          ctx.globalAlpha = a;
          const off = camX * 0.32 + t * 0.06;
          for (const [gx, gy, name, dir] of [[110, 150, 's7_gearA', 1], [330, 78, 's7_gearB', -1], [520, 152, 's7_gearA', -1]]) {
            let x = (gx - off) % 576;
            if (x < -60) x += 576;
            const fr = ((dir * (t >> 2)) % 8 + 8) % 8;
            Sprites.draw(ctx, name, Math.floor(x), gy, { frame: fr });
          }
          for (const l of lights) {
            let x = (l.x - off) % 768;
            if (x < 0) x += 768;
            if (x >= W || Math.sin(t * 0.08 + l.p) < 0.2) continue;
            ctx.fillStyle = l.c;
            ctx.fillRect(Math.floor(x), l.y, 2, 2);
          }
          ctx.globalAlpha = 1;
        },
      },
    ]);
  };

  /* =============================================================
   * ENEMIES (1/2) — turrets, missile rack, hangar bay, drones
   * ============================================================= */
  const s7angDiff = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  };
  /** keep a barrel inside its half plane (floor turrets aim up, ceiling turrets down) */
  const s7clampAim = (ta, attach) => {
    const m = 0.22;
    if (attach === 'ceil') {
      if (ta < 0) return ta < -Math.PI / 2 ? Math.PI - m : m;
      return clamp(ta, m, Math.PI - m);
    }
    if (ta > 0) return ta > Math.PI / 2 ? -Math.PI + m : -m;
    return clamp(ta, -Math.PI + m, -m);
  };
  /** shooter is inside the visible play field */
  const s7on = (e) => e.x > 12 && e.x < W - 8;

  /** pixel-art gun barrel: steel body, tip lights up while charging */
  function s7barrel(c, cx, cy, ang, from, to, hot) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = from; i <= to; i++) {
      const x = Math.round(cx + ca * i), y = Math.round(cy + sa * i);
      c.fillStyle = '#0c0c18';
      c.fillRect(x - 1, y - 1, 3, 3);
      c.fillStyle = i > to - 2 ? (hot ? '#ffe646' : '#3a4460') : '#9eaac0';
      c.fillRect(x, y, 2, 2);
      if (hot && i === to) { c.fillStyle = '#ffffff'; c.fillRect(x, y, 1, 1); }
    }
  }

  /** fortress turret family: 'gun' (single aimed), 'twin' (paired volleys), 'rapid' (locked burst) */
  function s7turretDef(kind) {
    const CFG = {
      gun: { w: 14, h: 9, hp: 3, score: 200, rate: 125, charge: 26, turn: 0.045, spr: 's7_gun' },
      twin: { w: 20, h: 10, hp: 5, score: 320, rate: 175, charge: 30, turn: 0.035, spr: 's7_twin' },
      rapid: { w: 13, h: 12, hp: 5, score: 320, rate: 205, charge: 34, turn: 0.04, spr: 's7_rapid' },
    }[kind];
    const muzzle = (e, side) => {
      const cy = e.y + (e.attach === 'ceil' ? 2 : -2);
      const ca = Math.cos(e.ang), sa = Math.sin(e.ang);
      const ox = kind === 'twin' ? side * 6.5 : 0;
      const len = kind === 'gun' ? 10 : kind === 'twin' ? 9 : 9;
      return [e.x + ox + ca * len, cy + sa * len, ca, sa];
    };
    const shoot = (e, side, spd, spr) => {
      if (e.dead || !G.canFire(e)) return;
      const [mx, my, ca, sa] = muzzle(e, side);
      G.ebullet(mx, my, ca * spd, sa * spd, spr === 2 ? { spr: 'ebullet2', w: 5, h: 5, quiet: side > 0 } : { quiet: side > 0 });
    };
    return {
      w: CFG.w, h: CFG.h, hp: CFG.hp, score: CFG.score, attach: 'floor', expl: 'm', sink: 2,
      spr: () => CFG.spr,
      init(e, o) {
        e.ang = e.attach === 'ceil' ? Math.PI / 2 : -Math.PI / 2;
        e.cd = 40 + rndi(0, 50);
        e.ch = 0; // charge (telegraph) frames left
        e.arm = 70; // frames on screen before the first shot
      },
      update(e) {
        const P = G.player;
        if (s7on(e) && e.arm > 0) e.arm--;
        const cy = e.y + (e.attach === 'ceil' ? 2 : -2);
        const ta = s7clampAim(Math.atan2(P.y - cy, P.x - e.x), e.attach);
        const locked = e.ch > 0 && e.ch < 9; // aim freezes just before the shot: dodge window
        if (!locked) e.ang += clamp(s7angDiff(ta, e.ang), -CFG.turn, CFG.turn);
        if (e.ch > 0) {
          if (--e.ch === 0) {
            if (kind === 'gun') shoot(e, 0, 1.55, 1);
            else if (kind === 'twin') {
              shoot(e, -1, 1.45, 2);
              shoot(e, 1, 1.45, 2);
              G.later(15, () => { shoot(e, -1, 1.45, 2); shoot(e, 1, 1.45, 2); });
            } else for (let i = 0; i < 4; i++) G.later(i * 7, () => shoot(e, 0, 1.8, 1));
          }
        } else if (e.arm <= 0 && --e.cd <= 0) {
          if (G.canFire(e) && e.x > 20) e.ch = CFG.charge;
          e.cd = G.fireDelay(e.o.rate || CFG.rate) + rndi(0, 40);
        }
      },
      draw(e, c) {
        const cy = e.y + (e.attach === 'ceil' ? 2 : -2);
        const hot = e.ch > 0 && ((e.ch >> 2) & 1) === 0;
        if (kind === 'twin') {
          s7barrel(c, e.x - 6.5, cy, e.ang, 2, 8, e.ch > 0);
          s7barrel(c, e.x + 6.5, cy, e.ang, 2, 8, e.ch > 0);
        } else if (kind === 'rapid') {
          const px = -Math.sin(e.ang), py = Math.cos(e.ang);
          s7barrel(c, e.x + px * 1.5, cy + py * 1.5, e.ang, 3, 9, e.ch > 0);
          s7barrel(c, e.x - px * 1.5, cy - py * 1.5, e.ang, 3, 9, e.ch > 0);
        } else s7barrel(c, e.x, cy, e.ang, 3, 10, e.ch > 0);
        Sprites.draw(c, CFG.spr, e.x, e.y, { frame: hot ? 1 : 0, flipY: e.attach === 'ceil', flash: e.flash > 0 });
      },
    };
  }
  ENEMIES.s7_gun = s7turretDef('gun');
  ENEMIES.s7_twin = s7turretDef('twin');
  ENEMIES.s7_rapid = s7turretDef('rapid');

  /** missile rack: opens (warning), then launches homing missiles */
  ENEMIES.s7_rack = {
    w: 22, h: 14, hp: 6, score: 400, attach: 'floor', expl: 'm', sink: 2,
    spr: () => 's7_rack',
    init(e, o) {
      e.cd = 60 + rndi(0, 40);
      e.open = 0;
      e.arm = 80;
      e.salvo = o.salvo || 2;
    },
    update(e) {
      if (s7on(e) && e.arm > 0) e.arm--;
      const ceil = e.attach === 'ceil';
      if (e.open > 0) {
        const t = 78 - e.open;
        e.open--;
        e.frame = t < 34 ? 1 : (t % 12 < 4 ? 2 : 1);
        for (let k = 0; k < e.salvo; k++) {
          if (t === 34 + k * 14 && G.canFire(e)) {
            const tube = -6 + ((k + (e.o.shift || 0)) % 3) * 6;
            if (G.enemies.filter((q) => q.type === 's7_missile' && !q.dead).length < 4) {
              G.spawn('s7_missile', { x: e.x + tube, y: e.y + (ceil ? 8 : -8), ang: ceil ? Math.PI * 0.62 : -Math.PI * 0.62, delay: 16 });
              sfx('missile');
            }
          }
        }
        if (e.open === 0) e.frame = 0;
      } else {
        e.frame = 0;
        if (e.arm <= 0 && --e.cd <= 0) {
          if (G.canFire(e) && e.x > 20) e.open = 78;
          e.cd = G.fireDelay(e.o.rate || 250);
        }
      }
    },
  };

  /** hangar bay: hazard doors open and launch a flight of drones */
  ENEMIES.s7_bay = {
    w: 28, h: 9, hp: 9, score: 500, attach: 'floor', expl: 'm', sink: 1,
    spr: () => 's7_bay',
    init(e, o) {
      e.cd = 50 + rndi(0, 40);
      e.open = 0;
      e.arm = 60;
      e.count = o.count || 3;
    },
    update(e) {
      if (s7on(e) && e.arm > 0) e.arm--;
      const ceil = e.attach === 'ceil';
      if (e.open > 0) {
        const t = 40 + e.count * 14 - e.open;
        e.open--;
        e.frame = t < 10 ? 1 : e.open < 12 ? 1 : 2;
        if (t < 24 && (t >> 2) % 2 === 0) e.frame = 1;
        for (let k = 0; k < e.count; k++) {
          if (t === 24 + k * 14 && s7on(e) && G.player.alive) {
            G.spawn('s7_drone', { x: e.x, y: e.y + (ceil ? 7 : -7), mode: 'hatch', vy: ceil ? 1.6 : -1.6, carry: !!e.o.carry && k === e.count - 1 });
          }
        }
        if (e.open === 0) e.frame = 0;
      } else {
        e.frame = 0;
        if (e.arm <= 0 && --e.cd <= 0) {
          if (s7on(e) && G.player.alive) {
            e.open = 40 + e.count * 14;
            sfx('coreOpen');
          }
          e.cd = G.fireDelay(e.o.rate || 230);
        }
      }
    },
  };

  /** drone fighter: launched from a bay (swings toward you) or flying a sine line */
  ENEMIES.s7_drone = {
    w: 13, h: 8, hp: 1, score: 120, fps: 5, expl: 's',
    spr: (e) => (e.carry ? 's7_drone_c' : 's7_drone'),
    init(e, o) {
      e.mode = o.mode || 'sine';
      e.vx = e.mode === 'hatch' ? -0.4 : -(o.speed || 1.5);
      e.vy = o.vy || 0;
      e.base = e.y;
      e.amp = o.amp || 22;
      e.ph = o.phase || 0;
    },
    update(e) {
      const P = G.player;
      if (e.mode === 'hatch') {
        if (e.t < 26) {
          e.vy *= 0.955;
          e.vx = -0.45;
        } else {
          e.vy = clamp(e.vy + clamp(((P.alive ? P.y : e.y) - e.y) * 0.02, -0.06, 0.06), -1.5, 1.5);
          e.vx = Math.max(e.vx - 0.035, -1.9);
        }
      } else if (e.mode === 'sine') e.y = e.base + Math.sin(e.t * 0.05 + e.ph) * e.amp;
      if (e.o.shoot && e.t === e.o.shoot && G.canFire(e)) {
        const [vx, vy] = G.aim(e.x, e.y, 1.4);
        G.ebullet(e.x - 6, e.y, vx, vy);
      }
    },
  };

  /* =============================================================
   * ENEMIES (2/2) — homing missile, mine, mech guard, rail slider,
   *                 conveyor belt and status lamps (decor)
   * ============================================================= */
  /** homing missile (shootable, hp 1): limited turn rate, burns out after ~4.5 s */
  ENEMIES.s7_missile = {
    w: 8, h: 8, hp: 1, score: 100, expl: 's',
    spr: () => 's7_missile',
    init(e, o) {
      e.ang = o.ang !== undefined ? o.ang : Math.PI;
      e.spd = 0.8;
      e.turn = o.turn || 0.03;
      e.life = o.life || 270;
      e.delay = o.delay || 18;
    },
    update(e) {
      const P = G.player;
      if (e.t > e.delay && P.alive) {
        const want = Math.atan2(P.y - e.y, P.x - e.x);
        e.ang += clamp(s7angDiff(want, e.ang), -e.turn, e.turn);
      }
      e.spd = Math.min(1.7, e.spd + 0.025) * 1;
      const k = 0.9 + 0.1 * G.diff.bullet;
      e.vx = Math.cos(e.ang) * e.spd * k;
      e.vy = Math.sin(e.ang) * e.spd * k;
      e.frame = ((Math.round(e.ang / (TAU / 16)) % 16) + 16) % 16;
      if (e.t % 3 === 0) {
        G.fx.push({ k: 'part', x: e.x - Math.cos(e.ang) * 5, y: e.y - Math.sin(e.ang) * 5, vx: 0, vy: 0, life: 9, t: 0, col: e.t % 6 ? '#ff9424' : '#a07060', big: false });
      }
      if (G.terrain.solid(G.camX + e.x, e.y) || e.t > e.life) {
        e.dead = true;
        G.explode(e.x, e.y, 's', { quiet: true });
      }
    },
  };

  /** drifting mine: slow, bobbing, leans toward your height; blinks faster when you are close */
  ENEMIES.s7_mine = {
    w: 11, h: 11, hp: 2, score: 150, expl: 'm',
    spr: () => 's7_mine',
    init(e, o) {
      e.vx = -(o.speed || 0.5);
      e.by = e.y;
      e.ph = o.phase !== undefined ? o.phase : rnd(TAU);
      e.amp = o.amp || 9;
    },
    update(e) {
      const P = G.player, T = G.terrain, wx = G.camX + e.x;
      if (P.alive) e.by += clamp((P.y - e.by) * 0.004, -0.12, 0.12);
      const lo = Math.max(T.ceilBottom(wx - 8), T.ceilBottom(wx + 8)) + 8 + e.amp;
      const hi = Math.min(T.floorTop(wx - 8), T.floorTop(wx + 8)) - 8 - e.amp;
      if (hi > lo) e.by = clamp(e.by, lo, hi);
      e.y = e.by + Math.sin(e.t * 0.045 + e.ph) * e.amp;
      const near = Math.abs(P.x - e.x) < 64 && Math.abs(P.y - e.y) < 46;
      e.frame = (e.t >> (near ? 2 : 4)) & 1;
    },
  };

  /** mech guard: armoured walker, two-shot bursts with a muzzle warning light */
  ENEMIES.s7_walker = {
    w: 14, h: 20, hp: 6, score: 450, fps: 8, attach: 'floor', expl: 'm', sink: 1,
    spr: () => 's7_walker',
    init(e, o) {
      e.dir = o.dir !== undefined ? o.dir : -1;
      e.speed = o.speed || 0.35;
      e.cd = 60 + rndi(0, 50);
      e.ch = 0;
      e.arm = 60;
    },
    update(e) {
      const T = G.terrain;
      if (s7on(e) && e.arm > 0) e.arm--;
      e.wx += e.dir * e.speed;
      const ahead = e.wx + e.dir * 10;
      const here = T.floorTop(e.wx), fa = T.floorTop(ahead);
      if (fa < here - 6 || fa > here + 7) e.dir = -e.dir;
      e.y += (here - e.h / 2 + 1 - e.y) * 0.4;
      e.flipX = e.dir > 0;
      if (e.ch > 0) {
        e.ch--;
        if (e.ch === 0 && G.canFire(e)) {
          for (let i = 0; i < 2; i++) {
            G.later(i * 13, () => {
              if (e.dead || !G.canFire(e)) return;
              const mx = e.x + (e.flipX ? 9 : -9);
              const [vx, vy] = G.aim(mx, e.y - 1, 1.45);
              G.ebullet(mx, e.y - 1, vx, vy, { quiet: i > 0 });
            });
          }
        }
      } else if (e.arm <= 0 && --e.cd <= 0) {
        if (G.canFire(e) && e.x > 24) e.ch = 24;
        e.cd = G.fireDelay(e.o.rate || 150) + rndi(0, 40);
      }
    },
    draw(e, c) {
      Sprites.draw(c, 's7_walker', e.x, e.y, { frame: (e.t / 8) | 0, flipX: e.flipX, flipY: false, flash: e.flash > 0 });
      if (e.ch > 0 && ((e.ch >> 1) & 1) === 0) {
        const mx = Math.round(e.x + (e.flipX ? 9 : -10));
        c.fillStyle = '#ffffff';
        c.fillRect(mx, Math.round(e.y - 2), 2, 2);
        c.fillStyle = '#ffe646';
        c.fillRect(mx - 1, Math.round(e.y - 3), 4, 1);
      }
    },
  };

  /** rail slider: a gun carriage that runs back and forth along a wall rail */
  ENEMIES.s7_slider = {
    w: 16, h: 10, hp: 4, score: 300, attach: 'floor', expl: 'm', sink: 1,
    spr: () => 's7_slider',
    init(e, o) {
      e.wx0 = e.wx;
      e.R = o.range || 60;
      e.dir = o.dir || -1;
      e.speed = o.speed || 0.75;
      e.cd = 50 + rndi(0, 40);
      e.ch = 0;
      e.arm = 60;
      e.ang = e.attach === 'ceil' ? Math.PI / 2 : -Math.PI / 2;
    },
    update(e) {
      const T = G.terrain;
      if (s7on(e) && e.arm > 0) e.arm--;
      e.wx += e.dir * e.speed;
      if (e.wx < e.wx0 - e.R) e.dir = 1;
      else if (e.wx > e.wx0 + e.R) e.dir = -1;
      const ceil = e.attach === 'ceil';
      const sink = 1;
      if (ceil) e.y = T.ceilBottom(e.wx) + e.h / 2 - sink;
      else e.y = T.floorTop(e.wx) - e.h / 2 + sink;
      const P = G.player;
      const cy = e.y + (ceil ? 1 : -1);
      const ta = s7clampAim(Math.atan2(P.y - cy, P.x - e.x), e.attach);
      if (!(e.ch > 0 && e.ch < 8)) e.ang += clamp(s7angDiff(ta, e.ang), -0.05, 0.05);
      if (e.ch > 0) {
        if (--e.ch === 0 && G.canFire(e)) {
          const bx = e.x + Math.cos(e.ang) * 9, by = cy + Math.sin(e.ang) * 9;
          G.ebullet(bx, by, Math.cos(e.ang) * 1.6, Math.sin(e.ang) * 1.6);
        }
      } else if (e.arm <= 0 && --e.cd <= 0) {
        if (G.canFire(e) && e.x > 20) e.ch = 18;
        e.cd = G.fireDelay(e.o.rate || 110) + rndi(0, 30);
      }
    },
    draw(e, c) {
      const ceil = e.attach === 'ceil';
      const T = G.terrain;
      // the rail: a dashed steel strip embedded in the wall surface
      const x0 = Math.round(e.wx0 - e.R - 12 - G.camX), x1 = Math.round(e.wx0 + e.R + 12 - G.camX);
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        const wx = G.camX + x;
        const y = ceil ? T.ceilBottom(wx) - 3 : T.floorTop(wx) + 2;
        c.fillStyle = (x + (ceil ? 2 : 0)) % 6 < 2 ? '#0a0e16' : '#8ea4c4';
        c.fillRect(x, y, 1, 1);
        c.fillStyle = '#1a2233';
        c.fillRect(x, y + 1, 1, 1);
      }
      const cy = e.y + (ceil ? 1 : -1);
      const hot = e.ch > 0;
      s7barrel(c, e.x, cy, e.ang, 2, 8, hot);
      Sprites.draw(c, 's7_slider', e.x, e.y, { frame: hot && ((e.ch >> 2) & 1) === 0 ? 1 : 0, flipY: ceil, flash: e.flash > 0 });
    },
  };

  /** decorative conveyor belt on the floor (slanted hazard stripes scroll); harmless and untouchable */
  ENEMIES.s7_belt = {
    w: 96, h: 4, hp: 1, score: 0, ghost: true, harmless: true, attach: 'floor', sink: 0, keep: false,
    init(e, o) {
      e.w = o.len || 96;
      e.dir = o.dir || 1;
    },
    draw(e, c) {
      const x0 = Math.round(e.x - e.w / 2), y0 = Math.round(e.y + e.h / 2);
      const off = Math.floor(e.t * 0.5 * e.dir);
      for (let i = 0; i < e.w; i++) {
        const x = x0 + i;
        if (x < 0 || x >= W) continue;
        c.fillStyle = '#0a0e16';
        c.fillRect(x, y0, 1, 1);
        for (let j = 0; j < 4; j++) {
          c.fillStyle = ((((i + off - j) % 10) + 10) % 10) < 5 ? (j === 0 ? '#fff0a0' : '#ffd430') : (j === 0 ? '#3a4c68' : '#1e2838');
          c.fillRect(x, y0 + 1 + j, 1, 1);
        }
        c.fillStyle = '#0a0e16';
        c.fillRect(x, y0 + 5, 1, 1);
      }
      // end rollers
      for (const rx of [x0 - 2, x0 + e.w]) {
        c.fillStyle = '#0a0e16';
        c.fillRect(rx, y0, 2, 6);
        c.fillStyle = '#8ea4c4';
        c.fillRect(rx, y0 + 1, 1, 4);
      }
    },
  };

  /** blinking status lamp anchored to the world (decor) */
  ENEMIES.s7_lamp = {
    w: 4, h: 4, hp: 1, score: 0, ghost: true, harmless: true,
    init(e, o) {
      e.grn = !!o.green;
      e.ph = rndi(0, 40);
    },
    draw(e, c) {
      const on = ((e.t + e.ph) % 50) < 30;
      Sprites.draw(c, 's7_lamp', e.x, e.y, { frame: (e.grn ? 2 : 0) + (on ? 0 : 1) });
    },
  };

  /* =============================================================
   * MECHANISMS — laser gates and crushers (moving terrain)
   * ============================================================= */
  /** jagged energy column between two points on x (vertical) */
  function s7column(c, x, y0, y1, t, cols, wobble) {
    const step = 6;
    for (let y = y0, k = 0; y < y1; y += step, k++) {
      const h = Math.min(step, y1 - y);
      const j = Math.round((s7hash(k, t >> 1) - 0.5) * wobble);
      c.fillStyle = cols[0];
      c.fillRect(x - 3 + j, y, 7, h);
      c.fillStyle = cols[1];
      c.fillRect(x - 2 + j, y, 5, h);
      c.fillStyle = cols[2];
      c.fillRect(x - 1 + j, y, 3, h);
      c.fillStyle = cols[3];
      c.fillRect(x + j, y, 1, h);
    }
  }

  /** laser gate: two emitters + a beam that cycles off -> warning blink -> armed */
  const GATE = { off: 86, warn: 44, on: 70 };
  ENEMIES.s7_gate = {
    w: 20, h: 40, hp: 99999, score: 0, invuln: true, expl: 's', keep: false,
    init(e, o) {
      const T = G.terrain;
      const ct = T.ceilBottom(e.wx), fb = T.floorTop(e.wx);
      e.ct = ct;
      e.fb = fb;
      e.y = (ct + fb) / 2;
      e.phase = o.phase || 0;
      e.state = 0;
      const gh = fb - ct;
      e.parts = [
        { name: 'em0', ox: 0, oy: ct + 5 - e.y, w: 14, h: 10, hp: 99999, vuln: false },
        { name: 'em1', ox: 0, oy: fb - 5 - e.y, w: 14, h: 10, hp: 99999, vuln: false },
        { name: 'beam', ox: 0, oy: 0, w: 5, h: gh - 18, hp: 99999, vuln: false, solid: false, harmless: true },
      ];
    },
    update(e) {
      const P = GATE.off + GATE.warn + GATE.on;
      const t = (e.t + e.phase) % P;
      const st = t < GATE.off ? 0 : t < GATE.off + GATE.warn ? 1 : 2;
      if (st === 2 && e.state !== 2 && e.x > 0 && e.x < W) sfx('bossLaser');
      e.state = st;
      e.parts[2].harmless = st !== 2;
    },
    draw(e, c) {
      const x = Math.round(e.x), y0 = e.ct + 10, y1 = e.fb - 10;
      if (e.state === 2) s7column(c, x, y0, y1, e.t, ['#a01c2c', '#f03a3a', '#ffb0a0', '#ffffff'], 2);
      else if (e.state === 1) {
        const blink = ((e.t >> 2) & 1) === 0;
        for (let y = y0; y < y1; y += 4) {
          c.fillStyle = blink ? '#ffb0a0' : '#a03040';
          c.fillRect(x - 1, y, 2, 2);
        }
      }
      const fr = e.state === 0 ? 0 : e.state === 1 ? (((e.t >> 2) & 1) ? 1 : 0) : 2;
      Sprites.draw(c, 's7_emit', x, e.ct + 5, { frame: fr });
      Sprites.draw(c, 's7_emit', x, e.fb - 5, { frame: fr, flipY: true });
    },
  };

  /** crusher position over one cycle: 0 retracted .. 1 extended (dwell, warning, slam, dwell, retract) */
  function s7pistonPos(t, P) {
    const u = (t % P) / P;
    if (u < 0.4) return { p: 0, warn: false };
    if (u < 0.55) return { p: 0, warn: true };
    if (u < 0.68) { const k = (u - 0.55) / 0.13; return { p: k * k, warn: false }; }
    if (u < 0.85) return { p: 1, warn: false };
    const k = (u - 0.85) / 0.15;
    return { p: 1 - k * (2 - k), warn: false };
  }

  /** piston / crusher block (`dir` 'ceil' or 'floor'); invulnerable moving terrain.
   *  `ext` = distance of the head face from the wall: 8 (retracted) .. 8 + stroke (extended) */
  ENEMIES.s7_piston = {
    w: 30, h: 30, hp: 99999, score: 0, invuln: true, expl: 's', keep: false,
    init(e, o) {
      const T = G.terrain;
      e.up = o.dir === 'floor'; // true: grows up from the floor
      e.base = e.up ? T.floorTop(e.wx) : T.ceilBottom(e.wx);
      e.stroke = o.stroke || 56;
      e.period = o.period || 200;
      e.phase = o.phase || 0;
      e.y = e.base;
      e.pos = 0;
      e.warn = false;
      e.parts = [
        { name: 'head', ox: 0, oy: 0, w: 26, h: 14, hp: 99999, vuln: false },
        { name: 'rod', ox: 0, oy: 0, w: 6, h: 2, hp: 99999, vuln: false },
      ];
    },
    update(e) {
      const st = s7pistonPos(e.t + e.phase, e.period);
      e.pos = st.p;
      e.warn = st.warn;
      const dirY = e.up ? -1 : 1; // from the wall into the corridor
      const ext = 8 + e.stroke * st.p;
      const shake = st.warn ? ((e.t >> 1) & 1) : 0;
      e.parts[0].oy = dirY * (ext - 8) + shake;
      const rodLen = Math.max(2, ext - 16);
      e.parts[1].h = rodLen;
      e.parts[1].oy = dirY * (rodLen / 2);
    },
    draw(e, c) {
      const dirY = e.up ? -1 : 1;
      const x = Math.round(e.x);
      const ext = 8 + e.stroke * e.pos;
      const shake = e.warn ? ((e.t >> 1) & 1) : 0;
      const wallY = e.base;
      // rod from the wall to the head
      const rl = Math.max(0, Math.round(ext - 16));
      if (rl > 0) {
        const rodTop = dirY > 0 ? wallY : wallY - rl;
        c.fillStyle = '#0c0c18';
        c.fillRect(x - 4, rodTop, 8, rl);
        c.fillStyle = '#5d6882';
        c.fillRect(x - 3, rodTop, 6, rl);
        c.fillStyle = '#9eaac0';
        c.fillRect(x - 3, rodTop, 2, rl);
        c.fillStyle = '#2a3048';
        c.fillRect(x + 2, rodTop, 1, rl);
        for (let y = 4; y < rl; y += 8) {
          c.fillStyle = '#0c0c18';
          c.fillRect(x - 3, rodTop + y, 6, 1);
        }
      }
      const hy = wallY + dirY * (ext - 8) + shake;
      Sprites.draw(c, 's7_phead', x, hy, { frame: e.warn && ((e.t >> 2) & 1) ? 1 : 0, flipY: e.up });
    },
  };

  /* =============================================================
   * MID-BOSS — ELECTRONIC CAGE
   * Two rail-mounted emitter pylons (top / bottom of the reactor
   * hall) slide in and hold the right side of the screen for ~8 s.
   * Their lightning bars close a cage around YOUR lane. The lane
   * follows you during the warning (dotted preview) and is locked
   * when the bars arm, so staying put is always safe:
   *   cycle A "scissors": both bars pivot around the pylon tips and
   *                       close on a 56 px lane (a funnel)
   *   cycle B "comb":     a lightning curtain sweeps across the hall
   *                       with a 56 px gap at your height
   * Destroy both pylons to break the cage (drops a capsule). If
   * ignored the cage powers down and slides away by itself. The
   * scroll never stops.
   * ============================================================= */
  const CAGE = { intro: 50, idle: 40, warn: 45, close: 60, hold: 35, open: 50, lock: 500, len: 196, boxes: 17, half: 28 };
  CAGE.cycle = CAGE.idle + CAGE.warn + CAGE.close + CAGE.hold + CAGE.open;

  const s7ease = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));
  /** jagged lightning bar from (x0,y0) to (x1,y1) (pixel steps, re-rolled every 2 frames) */
  function s7bolt(c, x0, y0, x1, y1, t, cols, jit = 4) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1) return;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const nx = -uy, ny = ux;
    for (let pass = 0; pass < 3; pass++) {
      const sz = pass === 0 ? 3 : pass === 1 ? 2 : 1;
      c.fillStyle = cols[pass];
      for (let i = 0; i < len; i += 1) {
        const j = (s7hash(i >> 3, t >> 1) - 0.5) * jit * (pass === 2 ? 0.6 : 1);
        const sm = Math.sin((i + t * 2) * 0.35) * 0.9;
        const x = x0 + ux * i + nx * (j + sm), y = y0 + uy * i + ny * (j + sm);
        c.fillRect(Math.round(x - (sz >> 1)), Math.round(y - (sz >> 1)), sz, sz);
      }
    }
  }
  const CAGE_COLS = ['#1a5a9c', '#48ecf4', '#ffffff'];

  ENEMIES.s7_cage = {
    w: 24, h: 170, hp: 99999, score: 3000, keep: true, expl: 'l', carry: false,
    spr: () => 's7_pylon',
    init(e, o) {
      const T = G.terrain;
      e.homeX = o.homeX || 206;
      e.x = W + 40;
      e.ct = T.ceilBottom(G.camX + e.homeX);
      e.fb = T.floorTop(G.camX + e.homeX);
      e.y = (e.ct + e.fb) / 2;
      const hp = (o.hp || 14) * G.diff.hp * (1 + 0.25 * G.loop);
      e.parts = [
        { name: 'pT', ox: 0, oy: e.ct + 14 - e.y, w: 18, h: 26, hp, max: hp, vuln: true, expl: 'l', score: 800 },
        { name: 'pB', ox: 0, oy: e.fb - 14 - e.y, w: 18, h: 26, hp, max: hp, vuln: true, expl: 'l', score: 800 },
      ];
      // lethal boxes strung along each lightning bar (dead = switched off); real parts, so shots and bots see them
      for (let side = 0; side < 2; side++) {
        for (let i = 0; i < CAGE.boxes; i++) e.parts.push({ name: side ? 'beamB' : 'beamT', ox: 0, oy: 0, w: 6, h: 6, hp: 99999, vuln: false, solid: false, dead: true });
      }
      e.beams = []; // active bars this frame: {x0,y0,x1,y1,side}
      e.armed = false;
      e.preview = null;
      e.leaving = false;
      e.thT = 0; // scissors: final swing angles of the two bars (locked when they arm)
      e.thB = 0;
      e.lane = e.y; // lane centre (follows the player during the warning)
      e.comb = 0; // comb curtain x while sweeping
    },
    update(e) {
      const P = G.player, t = e.t;
      e.beams = [];
      e.armed = false;
      e.preview = null;
      for (let i = 2; i < e.parts.length; i++) e.parts[i].dead = true;
      // intro: slide in along the wall rails; outro: power down and slide away
      if (t < CAGE.intro) e.x += (e.homeX - e.x) * 0.09;
      else if (!e.leaving) e.x = e.homeX;
      if (t >= CAGE.lock && !e.leaving) {
        e.leaving = true;
        sfx('coreClose');
      }
      if (e.leaving) {
        e.x += 2.4;
        if (e.x > W + 60) e.dead = true;
        return;
      }
      if (t < CAGE.intro + 20) return;
      const pT = e.parts[0], pB = e.parts[1];
      const tipT = { x: e.x - 0.5, y: e.ct + 23.5 }, tipB = { x: e.x - 0.5, y: e.fb - 23.5 };
      const u = t - CAGE.intro - 20;
      const cyc = Math.floor(u / CAGE.cycle), ph = u % CAGE.cycle;
      const pat = cyc % 2 === 0 ? 'scissors' : 'comb';
      const aim = (tip, dirY, th) => ({ x0: tip.x, y0: tip.y, x1: tip.x - Math.cos(th) * CAGE.len, y1: tip.y + dirY * Math.sin(th) * CAGE.len });
      // aimed spark orbs while idle
      if (ph === 14 && !pT.dead && G.canFire({ x: e.x, y: tipT.y })) {
        const [vx, vy] = G.aim(tipT.x, tipT.y, 1.2);
        G.ebullet(tipT.x - 4, tipT.y, vx, vy, { spr: 'ebullet2', w: 5, h: 5 });
      }
      if (ph === 28 && !pB.dead && G.canFire({ x: e.x, y: tipB.y })) {
        const [vx, vy] = G.aim(tipB.x, tipB.y, 1.2);
        G.ebullet(tipB.x - 4, tipB.y, vx, vy, { spr: 'ebullet2', w: 5, h: 5 });
      }
      const t0 = CAGE.idle, t1 = t0 + CAGE.warn, t2 = t1 + CAGE.close, t3 = t2 + CAGE.hold;
      if (ph >= t0 && ph < t1) {
        // warning: the lane follows you, then freezes when the bars start to move
        if (ph === t0) e.lane = P.alive ? P.y : e.y;
        e.lane += ((P.alive ? P.y : e.y) - e.lane) * 0.12;
        const lx = clamp(P.alive ? P.x : 60, 30, 140);
        e.lane = clamp(e.lane, e.ct + 46, e.fb - 46);
        e.thT = clamp(Math.atan2(e.lane - CAGE.half - tipT.y, tipT.x - lx), 0.06, 0.5);
        e.thB = clamp(Math.atan2(tipB.y - (e.lane + CAGE.half), tipB.x - lx), 0.06, 0.5);
        e.preview = { pat, lane: e.lane, thT: e.thT, thB: e.thB, top: !pT.dead, bot: !pB.dead, blink: (ph >> 2) & 1 };
        if (ph === t0) sfx('electric');
      } else if (ph >= t1) {
        if (ph === t1) sfx('electric');
        if (pat === 'scissors') {
          const kk = ph < t2 ? s7ease((ph - t1) / CAGE.close) : ph < t3 ? 1 : 1 - s7ease((ph - t3) / CAGE.open);
          e.armed = kk > 0.02 || ph < t3;
          if (e.armed) {
            if (!pT.dead) e.beams.push(Object.assign(aim(tipT, 1, e.thT * kk), { side: 0 }));
            if (!pB.dead) e.beams.push(Object.assign(aim(tipB, -1, e.thB * kk), { side: 1 }));
          }
        } else if (ph < t3) {
          // comb: curtain from the walls to the lane edges, sweeping left across the hall
          e.armed = true;
          e.comb = 200 - 182 * ((ph - t1) / (t3 - t1));
          if (!pT.dead) e.beams.push({ x0: e.comb, y0: e.ct + 4, x1: e.comb, y1: e.lane - CAGE.half, side: 0 });
          if (!pB.dead) e.beams.push({ x0: e.comb, y0: e.lane + CAGE.half, x1: e.comb, y1: e.fb - 4, side: 1 });
        }
        if (e.armed && (ph - t1) % 30 === 15) sfx('electric');
      }
      for (const b of e.beams) {
        const len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
        if (len < 1) continue;
        const ux = (b.x1 - b.x0) / len, uy = (b.y1 - b.y0) / len;
        for (let i = 0; i < CAGE.boxes; i++) {
          const d = 6 + 12 * i;
          if (d > len) break;
          const p = e.parts[2 + b.side * CAGE.boxes + i];
          p.dead = false;
          p.ox = b.x0 + ux * d - e.x;
          p.oy = b.y0 + uy * d - e.y;
        }
      }
      e.tipT = tipT;
      e.tipB = tipB;
    },
    onPartDeath(e, p) {
      if (e.parts[0].dead && e.parts[1].dead) G.kill(e);
    },
    onDeath(e) {
      e.carry = false;
      G.dropCapsule(e.x - 10, e.y);
      G.later(5, () => G.explode(e.x + 4, e.y - 30, 'm'));
      G.later(10, () => G.explode(e.x - 4, e.y + 30, 'm'));
      G.addScore(3000);
    },
    draw(e, c) {
      const pT = e.parts[0], pB = e.parts[1];
      // preview (dotted): where the bars will end up / the lane they will leave open
      if (e.preview && e.tipT) {
        const pv = e.preview;
        if (pv.pat === 'scissors') {
          for (const [on, tip, dirY, thF] of [[pv.top, e.tipT, 1, pv.thT], [pv.bot, e.tipB, -1, pv.thB]]) {
            if (!on) continue;
            for (const th of [0, thF]) {
              const dx = -Math.cos(th), dy = dirY * Math.sin(th);
              for (let d = 6; d < CAGE.len; d += 5) {
                if (th > 0 && !pv.blink) continue;
                c.fillStyle = th === 0 ? '#48ecf4' : '#2a6aa8';
                c.fillRect(Math.round(tip.x + dx * d), Math.round(tip.y + dy * d), 1, 1);
              }
            }
          }
        } else {
          // comb: lane guides and the curtain's start line
          for (let x = 24; x < 204; x += 6) {
            c.fillStyle = pv.blink ? '#48ecf4' : '#2a6aa8';
            c.fillRect(x, Math.round(pv.lane - CAGE.half), 3, 1);
            c.fillRect(x, Math.round(pv.lane + CAGE.half), 3, 1);
          }
          for (let y = e.ct + 4; y < e.fb - 4; y += 5) {
            if (y > pv.lane - CAGE.half && y < pv.lane + CAGE.half) continue;
            c.fillStyle = '#48ecf4';
            c.fillRect(200, y, 1, 2);
          }
        }
      }
      for (const b of e.beams) s7bolt(c, b.x0, b.y0, b.x1, b.y1, e.t, CAGE_COLS);
      const charging = e.preview || e.armed;
      if (!pT.dead) Sprites.draw(c, 's7_pylon', e.x, e.ct + 14, { frame: pT.flash > 0 ? 2 : charging ? 1 : 0, flash: pT.flash > 0 });
      if (!pB.dead) Sprites.draw(c, 's7_pylon', e.x, e.fb - 14, { frame: pB.flash > 0 ? 2 : charging ? 1 : 0, flipY: true, flash: pB.flash > 0 });
      // pylon rails on the walls
      c.fillStyle = '#0a0e16';
      c.fillRect(Math.round(e.x - 30), e.ct, 60, 2);
      c.fillRect(Math.round(e.x - 30), e.fb - 2, 60, 2);
    },
  };

  /* =============================================================
   * FINAL BOSS — THE BRAIN (attack library + chamber drawing)
   *
   *  phase 1  glass chamber shut: three satellite eyes fire aimed
   *           fans and a sweeping laser (wedge preview, dodge it)
   *  phase 2  chamber shattered, brain exposed: spirals, homing
   *           spores, rings; veins pulse with every burst; the brain
   *           goes into a shielded "rest" between patterns
   *  phase 3  enraged (< 30 %): fast spirals, closing crusher walls,
   *           shockwave rings with a telegraphed gap, more spores
   * ============================================================= */
  const BRAIN = { arenaX: 190, wallReach: 136, eyeX: -58 };

  /** slow homing spore: turns gently toward you, can be shot down (hp 2) */
  function s7sporeAI(b) {
    const P = G.player;
    if (!P.alive || b.t < 26) return;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    let a = Math.atan2(b.vy, b.vx);
    a += clamp(s7angDiff(Math.atan2(P.y - b.y, P.x - b.x), a), -0.024, 0.024);
    b.vx = Math.cos(a) * sp;
    b.vy = Math.sin(a) * sp;
  }

  const S7_ORB = { spr: 'ebullet2', w: 5, h: 5 };
  const S7_PATTERNS = {
    2: [
      { n: 'spiral', t: 176, vuln: true },
      { n: 'rest', t: 70, vuln: false },
      { n: 'spores', t: 150, vuln: true },
      { n: 'rest', t: 60, vuln: false },
      { n: 'burst', t: 134, vuln: true },
      { n: 'rest', t: 50, vuln: false },
    ],
    3: [
      { n: 'spiral2', t: 160, vuln: true },
      { n: 'walls', t: 200, vuln: true },
      { n: 'rest', t: 44, vuln: false },
      { n: 'shock', t: 160, vuln: true },
      { n: 'spores2', t: 140, vuln: true },
      { n: 'rest', t: 40, vuln: false },
    ],
  };

  const S7ATK = {
    /** rotating two-arm spiral from the brain; direction flips halfway */
    spiral(e, st, fast) {
      const P = G.player;
      const step = fast ? 4 : G.diff.fire >= 1.3 ? 4 : G.diff.fire <= 0.8 ? 6 : 5;
      if (st === 1) e.dirS = chance(0.5) ? 1 : -1;
      if (st % step === 0 && P.alive) {
        if (st % (fast ? 52 : 88) === 0) e.dirS = -e.dirS;
        e.sa += e.dirS * (fast ? 0.30 : 0.33);
        const sp = fast ? 1.6 : 1.35;
        for (let arm = 0; arm < 2; arm++) {
          const a = e.sa + arm * Math.PI;
          G.ebullet(e.x - 8, e.y, Math.cos(a) * sp, Math.sin(a) * sp, { quiet: arm > 0 || st % (step * 4) !== 0 });
        }
        e.pulse = 7;
      }
      if (st % 46 === 24 && P.alive) {
        const [vx, vy] = G.aim(e.x - 30, e.y, 1.5);
        G.ebullet(e.x - 30, e.y, vx, vy, S7_ORB);
      }
    },
    /** homing spores (shootable) + a few aimed orbs */
    spores(e, st, times) {
      const P = G.player;
      if (!P.alive) return;
      const list = times || [10, 40, 70];
      const k = list.indexOf(st);
      if (k >= 0) {
        const y = e.y + (k % 3 === 0 ? -26 : k % 3 === 1 ? 26 : 0);
        G.ebullet(e.x - 40, y, -0.95, (y - e.y) * 0.012, { spr: 's7_spore', w: 7, h: 7, hp: 2, anim: 10, life: 430, custom: s7sporeAI });
        e.pulse = 14;
      }
      if (st % 40 === 30) {
        const [vx, vy] = G.aim(e.x - 30, e.y, 1.4);
        G.ebullet(e.x - 30, e.y, vx, vy, S7_ORB);
      }
    },
    /** two slow rings and aimed fans */
    burst(e, st) {
      if (!G.player.alive) return;
      if (st === 10 || st === 72) {
        G.radial(e.x - 8, e.y, 14, 1.1, st === 10 ? 0.2 : 0.2 + Math.PI / 14, S7_ORB);
        e.pulse = 16;
      }
      if (st === 42 || st === 104) {
        G.fan(e.x - 20, e.y, 3, 0.46, 1.5, {});
        e.pulse = 10;
      }
    },
    /** closing crusher plates from the ceiling and floor (left part of the arena) */
    walls(e, st) {
      const P = G.player;
      const GAP = 72, t0 = 46, t1 = 96, t2 = 142, t3 = 188;
      const lane = () => clamp(P.alive ? P.y : e.y, e.ct + 34 + GAP / 2, e.fb - 34 - GAP / 2);
      if (st === 1) e.wl = { yc: lane(), k: 0, warn: true, yt: e.ct, yb: e.fb };
      const w = e.wl;
      if (!w) return;
      if (st < t0) w.yc += (lane() - w.yc) * 0.12; // the lane follows you during the warning, then locks
      let k = 0;
      if (st >= t0 && st < t1) k = s7ease((st - t0) / (t1 - t0));
      else if (st >= t1 && st < t2) k = 1;
      else if (st >= t2 && st < t3) k = 1 - s7ease((st - t2) / (t3 - t2));
      w.k = k;
      w.warn = st < t0;
      w.yt = e.ct + (w.yc - GAP / 2 - e.ct) * k;
      w.yb = e.fb - (e.fb - (w.yc + GAP / 2)) * k;
      if (st === t0) { sfx('coreClose'); G.shake = Math.max(G.shake, 2); }
      if (st % 50 === 30 && P.alive) {
        const [vx, vy] = G.aim(e.x - 30, e.y, 1.4);
        G.ebullet(e.x - 30, e.y, vx, vy, S7_ORB);
        e.pulse = 8;
      }
    },
    /** chamber shockwave: expanding ring with a gap (charge first, then release) */
    shock(e, st) {
      const P = G.player;
      if (st === 6 || st === 74) { e.pulse = 34; sfx('coreOpen'); G.shake = Math.max(G.shake, 2); }
      if ((st === 40 || st === 108) && P.alive) {
        const n = 22, gap = 0.95;
        const centre = Math.atan2(P.y - e.y, P.x - e.x) + rnd(-0.3, 0.3);
        for (let i = 0; i < n; i++) {
          const a = centre + gap / 2 + (i * (TAU - gap)) / (n - 1);
          G.ebullet(e.x - 8, e.y, Math.cos(a) * 1.25, Math.sin(a) * 1.25, i ? { quiet: true, spr: 'ebullet2', w: 5, h: 5 } : S7_ORB);
        }
        G.shake = Math.max(G.shake, 3);
        e.pulse = 18;
      }
    },
    spores2(e, st) {
      S7ATK.spores(e, st, [10, 32, 54, 76]);
      if (st % 12 === 0 && st > 20 && st < 110 && G.player.alive) {
        e.sa += 0.6;
        G.ebullet(e.x - 8, e.y, Math.cos(e.sa) * 1.2, Math.sin(e.sa) * 1.2, { quiet: st % 36 !== 0 });
      }
    },
  };

  /** the glass chamber: frame + tinted glass (mode 0 intact, 1 cracking, 2 broken) */
  function s7drawChamber(c, e, mode, crack, front) {
    const cx = Math.round(e.x), xL = cx - 52, xR = cx + 52;
    const y0 = e.ct, y1 = e.fb;
    if (!front) {
      if (mode < 2) {
        c.fillStyle = 'rgba(8,34,64,0.62)';
        c.fillRect(xL + 3, y0 + 6, 98, y1 - y0 - 12);
        c.fillStyle = 'rgba(30,110,150,0.22)';
        c.fillRect(xL + 3, y0 + 6, 98, 44);
        for (let i = 0; i < 9; i++) { // rising bubbles
          const bx = xL + 10 + ((i * 37 + 11) % 82);
          const by = y1 - 12 - ((e.pt * (0.3 + (i % 3) * 0.12) + i * 41) % (y1 - y0 - 24));
          c.fillStyle = 'rgba(190,240,255,0.5)';
          c.fillRect(Math.round(bx), Math.round(by), 2, 2);
        }
      }
      return;
    }
    // frame (always) — caps, struts and rivets
    const cap = (y, up) => {
      c.fillStyle = '#0c0c18';
      c.fillRect(xL - 6, up ? y - 3 : y - 8, 116, 11);
      c.fillStyle = '#374761';
      c.fillRect(xL - 5, up ? y - 2 : y - 7, 114, 9);
      c.fillStyle = '#8ea4c4';
      c.fillRect(xL - 5, up ? y - 2 : y - 7, 114, 1);
      c.fillStyle = '#242f42';
      c.fillRect(xL - 5, up ? y + 5 : y, 114, 2);
      for (let x = xL; x < xR + 4; x += 12) { c.fillStyle = '#b4cdea'; c.fillRect(x, up ? y : y - 5, 1, 1); }
    };
    cap(y0 + 8, true);
    cap(y1 - 0, false);
    for (const sx of [xL - 1, xR - 2]) {
      c.fillStyle = '#0c0c18';
      c.fillRect(sx - 1, y0 + 8, 6, y1 - y0 - 16);
      c.fillStyle = '#374761';
      c.fillRect(sx, y0 + 8, 4, y1 - y0 - 16);
      c.fillStyle = '#8ea4c4';
      c.fillRect(sx, y0 + 8, 1, y1 - y0 - 16);
    }
    if (mode < 2) {
      // glass sheen: two diagonal reflections
      c.fillStyle = 'rgba(200,240,255,0.30)';
      for (let i = 0; i < 70; i++) { c.fillRect(xL + 8 + (i >> 1), y0 + 16 + i, 2, 1); c.fillRect(xL + 18 + (i >> 1), y0 + 30 + i, 1, 1); }
      c.fillStyle = 'rgba(160,220,255,0.10)';
      c.fillRect(xL + 3, y0 + 6, 98, y1 - y0 - 12);
      if (mode === 1) { // cracks radiate from the impact point on the front glass
        const steps = Math.floor(crack * 17);
        const ox = cx - 34, oy = e.y - 6;
        for (let r = 0; r < 8; r++) {
          let x = ox, y = oy, a = r * (TAU / 8) + 0.3;
          for (let i = 0; i < Math.min(steps, 9 + (r % 3) * 4); i++) {
            a += (s7hash(r, i) - 0.5) * 0.9;
            const nx = x + Math.cos(a) * 4, ny = y + Math.sin(a) * 4;
            for (let q = 0; q < 4; q++) {
              const qx = Math.round(x + ((nx - x) * q) / 4), qy = Math.round(y + ((ny - y) * q) / 4);
              if (qx < xL + 5 || qx > xR - 5 || qy < y0 + 10 || qy > y1 - 10) continue;
              c.fillStyle = '#7ab0c8';
              c.fillRect(qx + 1, qy + 1, 1, 1);
              c.fillStyle = '#f0ffff';
              c.fillRect(qx, qy, 1, 1);
            }
            x = nx;
            y = ny;
          }
        }
      }
    } else {
      // broken: jagged glass teeth left in the frame
      c.fillStyle = 'rgba(170,230,255,0.42)';
      for (let i = 0; i < 8; i++) {
        const x = xL + 4 + i * 12;
        const h = 6 + ((i * 7) % 9);
        c.fillRect(x, y0 + 14, 5, h);
        c.fillRect(x + 2, y0 + 14 + h, 2, 3);
        c.fillRect(x + 6, y1 - 8 - h, 5, h);
      }
    }
  }

  /* =============================================================
   * FINAL BOSS — THE BRAIN (entity)
   * ============================================================= */
  const s7eyeOff = (t, i) => ({ ox: BRAIN.eyeX - 4 * Math.cos(t * 0.022 + i * 2.09), oy: 46 * Math.sin(t * 0.022 + i * 2.09) });

  /** phase 1: each eye telegraphs (charge frame) then fires an aimed fan; one eye at a time sweeps a laser wedge */
  function s7brainEyes(e) {
    const P = G.player;
    const eyes = e.parts.slice(0, 3);
    const dead = eyes.filter((p) => p.dead).length;
    eyes.forEach((p, i) => {
      if (p.dead) return;
      if (p.ch > 0) {
        if (--p.ch === 0 && P.alive) {
          const ex = e.x + p.ox - 8, ey = e.y + p.oy;
          if (G.canFire({ x: ex, y: ey })) G.fan(ex, ey, 3, 0.5, 1.4, S7_ORB);
        }
      } else if (--p.cd <= 0) {
        if (P.alive) p.ch = 26;
        p.cd = G.fireDelay(150 - dead * 20) + rndi(0, 36);
      }
    });
    // sweeping laser wedge
    const lz = e.lz;
    if (lz.state === 'idle') {
      if (--lz.cd <= 0 && P.alive) {
        const owner = [1, 0, 2].find((i) => !eyes[i].dead);
        if (owner === undefined) return;
        const ep = eyes[owner];
        lz.state = 'warn';
        lz.t = 0;
        lz.owner = owner;
        lz.a = Math.atan2(P.y - (e.y + ep.oy), P.x - (e.x + ep.ox));
        lz.dir = chance(0.5) ? 1 : -1;
        sfx('coreOpen');
      }
      return;
    }
    const ep = eyes[lz.owner];
    if (ep.dead || !P.alive) {
      lz.state = 'idle';
      lz.cd = 120;
      return;
    }
    lz.t++;
    ep.ch = Math.max(ep.ch, 4);
    if (lz.state === 'warn') {
      if (lz.t >= 44) { lz.state = 'sweep'; lz.t = 0; sfx('bossLaser'); }
    } else {
      const half = 0.3;
      lz.ang = lz.a + lz.dir * (-half + 2 * half * s7ease(lz.t / 80));
      lz.x0 = e.x + ep.ox - 6;
      lz.y0 = e.y + ep.oy;
      lz.x1 = lz.x0 + Math.cos(lz.ang) * 240;
      lz.y1 = lz.y0 + Math.sin(lz.ang) * 240;
      if (lz.t >= 80) {
        lz.state = 'idle';
        lz.cd = G.fireDelay(300 - dead * 45);
        ep.ch = 0;
      }
    }
  }

  /** lethal boxes along the eye laser (part indices 7..27); seg = null switches them all off */
  function s7brainLaserParts(e, seg) {
    for (let i = 0; i < 21; i++) {
      const p = e.parts[7 + i];
      const d = 10 + 12 * i;
      if (!seg || d > 240) { p.dead = true; continue; }
      p.dead = false;
      p.ox = seg.x0 + ((seg.x1 - seg.x0) / 240) * d - e.x;
      p.oy = seg.y0 + ((seg.y1 - seg.y0) / 240) * d - e.y;
    }
  }
  /** crusher plates as solid parts (indices 5, 6) while the walls are out */
  function s7brainWallParts(e) {
    const w = e.wl, R = BRAIN.wallReach;
    const on = !!(w && w.k > 0.02);
    const top = e.parts[5], bot = e.parts[6];
    top.dead = bot.dead = !on;
    if (!on) return;
    top.w = bot.w = R + 4;
    top.ox = bot.ox = R / 2 - e.x;
    top.h = Math.max(1, w.yt - e.ct);
    top.oy = (e.ct + w.yt) / 2 - e.y;
    bot.h = Math.max(1, e.fb - w.yb);
    bot.oy = (w.yb + e.fb) / 2 - e.y;
  }

  ENEMIES.s7_brain = {
    w: 108, h: 164, hp: 99999, score: 20000, keep: true, expl: 'xl', silentDeath: true, keepOnBoss: true,
    spr: () => 's7_brain',
    init(e, o) {
      const T = G.terrain;
      const k = G.diff.hp * (1 + 0.25 * G.loop);
      e.homeX = BRAIN.arenaX;
      e.ct = T.ceilBottom(G.camX + e.homeX);
      e.fb = T.floorTop(G.camX + e.homeX);
      e.y = (e.ct + e.fb) / 2;
      e.hp = e.maxHp = 99999;
      e.phase = 'enter';
      e.pt = 0;
      e.stage = 1; // 1 eyes, 2 exposed, 3 enraged
      e.step = 0;
      e.st = 0;
      e.pulse = 0;
      e.sa = 0;
      e.dirS = 1;
      e.mem = false;
      e.glass = 0;
      e.crack = 0;
      e.lz = { state: 'idle', cd: 230, t: 0 };
      e.wl = null;
      e.enrageQ = false;
      const eh = 16 * k, bh = 200 * k;
      // armour segments: the brain cannot be brought below a floor until a whole pattern step has passed,
      // so strong ships cannot skip the choreography (basic ships are limited by their damage instead)
      e.floors = [0.8, 0.62, 0.46, 0.3, 0.2, 0.1].map((f) => f * bh);
      e.segIdx = 0;
      e.locked = false;
      e.lockStep = 0;
      const eye = (i, cd) => ({ name: 'eye' + i, ox: BRAIN.eyeX, oy: (i - 1) * 46, w: 18, h: 18, hp: eh, max: eh, vuln: true, expl: 'm', score: 800, cd, ch: 0 });
      e.parts = [
        eye(0, 90), eye(1, 140), eye(2, 190),
        { name: 'brain', ox: 0, oy: 0, w: 76, h: 62, hp: bh, max: bh, vuln: false, expl: 'xl', score: 10000 },
        { name: 'glass', ox: 0, oy: 0, w: 102, h: 152, hp: 99999, vuln: false },
        { name: 'wallT', ox: 0, oy: 0, w: 140, h: 4, hp: 99999, vuln: false, dead: true },
        { name: 'wallB', ox: 0, oy: 0, w: 140, h: 4, hp: 99999, vuln: false, dead: true },
      ];
      for (let i = 0; i < 21; i++) e.parts.push({ name: 'laser', ox: 0, oy: 0, w: 6, h: 6, hp: 99999, vuln: false, solid: false, dead: true });
    },
    update(e) {
      const P = G.player;
      const brain = e.parts[3], glass = e.parts[4];
      e.pt++;
      if (e.pulse > 0) e.pulse--;
      e.parts.slice(0, 3).forEach((p, i) => {
        if (p.dead) return;
        const o = s7eyeOff(e.pt, i);
        p.ox = o.ox;
        p.oy = o.oy;
      });
      switch (e.phase) {
        case 'enter':
          e.x += (e.homeX - e.x) * 0.04 - 0.12;
          if (e.x <= e.homeX + 0.4) {
            e.x = e.homeX;
            e.phase = 'p1';
            e.pt = 0;
          }
          break;
        case 'p1':
          s7brainEyes(e);
          break;
        case 'open': { // the glass cracks, shatters, the brain wakes up
          const pt = e.pt;
          if (pt < 60) {
            e.glass = 1;
            e.crack = pt / 60;
            if (pt % 14 === 1) { e.pulse = 10; G.shake = Math.max(G.shake, 1.5); sfx('cellPop'); }
          }
          if (pt === 60) {
            e.glass = 2;
            glass.dead = true;
            sfx('shieldBreak');
            G.debris(e.x - 30, e.y, 26);
            G.explode(e.x - 44, e.y - 34, 'm', { quiet: true });
            G.explode(e.x - 44, e.y + 34, 'm');
            G.shake = 7;
            G.flash = 3;
          }
          if (pt > 60 && pt % 15 === 0) e.pulse = 14;
          if (pt >= 118) {
            e.phase = 'p2';
            e.stage = 2;
            e.pt = 0;
            e.step = 0;
            e.st = 0;
          }
          break;
        }
        case 'enrage': {
          brain.vuln = false;
          e.mem = true;
          e.wl = null;
          if (e.pt === 1) {
            for (const b of G.eb) b.dead = true;
            sfx('warning');
            G.flash = 5;
            G.shake = 8;
            e.stage = 3;
          }
          if (e.pt % 8 === 0) e.pulse = 12;
          if (e.pt % 24 === 0) G.shake = Math.max(G.shake, 2);
          if (e.pt >= 76) {
            e.segIdx = 4;
            e.locked = false;
            e.phase = 'p3';
            e.pt = 0;
            e.step = 0;
            e.st = 0;
          }
          break;
        }
        default: { // p2 / p3: run the pattern list
          if (e.phase === 'p2' && e.enrageQ) {
            e.phase = 'enrage';
            e.pt = 0;
            break;
          }
          const list = S7_PATTERNS[e.stage === 3 ? 3 : 2];
          const cur = list[e.step % list.length];
          if (e.st === 0) {
            if (e.locked && e.step > e.lockStep) {
              e.locked = false;
              e.segIdx++;
            }
            brain.vuln = cur.vuln && !e.locked;
            e.mem = !brain.vuln;
            e.wl = null;
            if (!cur.vuln) e.pulse = 0;
          }
          e.st++;
          if (P.alive || cur.n === 'walls') {
            switch (cur.n) {
              case 'spiral': S7ATK.spiral(e, e.st, false); break;
              case 'spiral2': S7ATK.spiral(e, e.st, true); break;
              case 'spores': S7ATK.spores(e, e.st); break;
              case 'spores2': S7ATK.spores2(e, e.st); break;
              case 'burst': S7ATK.burst(e, e.st); break;
              case 'walls': S7ATK.walls(e, e.st); break;
              case 'shock': S7ATK.shock(e, e.st); break;
              default: break;
            }
          }
          if (e.st >= cur.t) {
            e.st = 0;
            e.step++;
            e.wl = null;
          }
          break;
        }
      }
      s7brainLaserParts(e, e.phase === 'p1' && e.lz.state === 'sweep' ? e.lz : null);
      s7brainWallParts(e);
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
    onPartHurt(e, p) {
      if (p.name !== 'brain') return;
      const fl = e.floors[e.segIdx];
      if (fl !== undefined && p.hp <= fl) { // armour segment exhausted: shield up until the next vulnerable step
        p.hp = fl;
        if (!e.locked) {
          e.locked = true;
          e.lockStep = e.step;
          p.vuln = false;
          e.mem = true;
          e.pulse = 12;
          sfx('shieldHit');
          G.spark(e.x - 20, e.y - 6);
          G.spark(e.x + 6, e.y + 14);
        }
      }
      if (e.stage === 2 && p.hp <= p.max * 0.3 + 0.01) e.enrageQ = true;
    },
    onPartDeath(e, p) {
      if (p.name === 'brain') {
        G.kill(e);
      } else if (p.name[0] === 'e' && e.parts.slice(0, 3).every((q) => q.dead)) {
        // last satellite down: the chamber starts to crack
        e.phase = 'open';
        e.pt = 0;
        e.lz.state = 'idle';
        for (const b of G.eb) b.dead = true;
        sfx('coreOpen');
      }
    },
    onDeath(e) {
      G.fx.push({ k: 'fn', x: e.x, y: e.y, t: 0, life: 136, draw: (c, f) => ENEMIES.s7_brain.drawWreck(e, c, f) });
      G.bossDefeated(e);
    },
    drawWreck(e, c, f) {
      const jx = rndi(-1, 1), jy = rndi(-1, 1);
      const fe = { x: f.x, y: f.y, ct: e.ct, fb: e.fb, pt: f.t };
      s7drawChamber(c, fe, 2, 1, false);
      Sprites.draw(c, 's7_brainR', f.x + jx, f.y + 4 + jy, { frame: (f.t >> 2) & 3 });
      if ((f.t >> 2) % 5 === 0) Sprites.draw(c, 's7_brainR', f.x + jx, f.y + 4 + jy, { frame: (f.t >> 2) & 3, flash: true, alpha: 0.55 });
      s7drawChamber(c, fe, 2, 1, true);
    },
    draw(e, c) {
      const brain = e.parts[3];
      const enraged = e.stage === 3;
      s7drawChamber(c, e, e.glass, e.crack, false);
      // heartbeat + attack pulse decide the vein glow
      const beat = 0.5 + 0.5 * Math.sin(e.pt * (enraged ? 0.14 : 0.07));
      let f = e.pulse > 0 ? (e.pulse > 9 ? 3 : e.pulse > 4 ? 2 : 1) : beat > 0.88 ? 1 : 0;
      if (e.phase === 'enter' || e.phase === 'p1') f = beat > 0.92 ? 1 : 0;
      const bob = Math.round(Math.sin(e.pt * 0.06) * 1.3);
      const bx = Math.round(e.x), by = Math.round(e.y + 4 + bob);
      const bspr = enraged ? 's7_brainR' : 's7_brain';
      Sprites.draw(c, bspr, bx, by, { frame: f });
      if (brain.flash > 0) Sprites.draw(c, bspr, bx, by, { frame: f, flash: true, alpha: 0.42 });
      // protective membrane while the brain cannot be hurt
      if (e.mem && e.phase !== 'p1' && e.phase !== 'enter') {
        const a = 0.55 + 0.35 * Math.sin(e.pt * 0.25);
        c.fillStyle = 'rgba(72,236,244,' + (0.10 * a).toFixed(2) + ')';
        c.fillRect(bx - 34, by - 30, 68, 56);
        for (let k = 0; k < 90; k++) {
          const ang = (k / 90) * TAU;
          if ((k + (e.pt >> 1)) % 4 > 1) continue;
          c.fillStyle = 'rgba(160,250,255,' + a.toFixed(2) + ')';
          c.fillRect(Math.round(bx + Math.cos(ang) * 46), Math.round(by - 4 + Math.sin(ang) * 38), 2, 1);
        }
      }
      s7drawChamber(c, e, e.glass, e.crack, true);
      // satellite eyes
      e.parts.slice(0, 3).forEach((p, i) => {
        if (p.dead) return;
        const blink = (e.pt + i * 47) % 160 < 6;
        const fr = p.ch > 0 && ((p.ch >> 2) & 1) === 0 ? 2 : blink ? 0 : 1;
        Sprites.draw(c, 's7_eye', e.x + p.ox, e.y + p.oy, { frame: fr, flash: p.flash > 0 });
      });
      // laser wedge preview / beam
      const lz = e.lz;
      if (lz.state === 'warn') {
        const ep = e.parts[lz.owner];
        const ox = e.x + ep.ox - 6, oy = e.y + ep.oy;
        const blink = (lz.t >> 2) & 1;
        for (const sgn of [-1, 1]) {
          const a = lz.a + lz.dir * sgn * 0.3;
          for (let d = 12; d < 220; d += 6) {
            if (!blink && sgn === 1) continue;
            c.fillStyle = sgn * lz.dir < 0 ? '#ff8a6a' : '#a03a4a';
            c.fillRect(Math.round(ox + Math.cos(a) * d), Math.round(oy + Math.sin(a) * d), 1, 1);
          }
        }
      } else if (lz.state === 'sweep') s7bolt(c, lz.x0, lz.y0, lz.x1, lz.y1, e.pt, ['#7a1020', '#ff4a3a', '#ffffff'], 1);
      // crusher walls (phase 3): preview edges, then the plates
      const w = e.wl;
      if (w) {
        const R = BRAIN.wallReach;
        if (w.warn) {
          const blink = (e.st >> 2) & 1;
          for (const y of [w.yc - 36, w.yc + 36]) {
            for (let x = 4; x < R; x += 6) {
              c.fillStyle = blink ? '#ffd430' : '#7a5a10';
              c.fillRect(x, Math.round(y), 3, 1);
            }
          }
          for (const y of [e.ct + 3, e.fb - 5]) {
            c.fillStyle = blink ? '#ff4040' : '#601018';
            c.fillRect(2, y, 4, 3);
            c.fillRect(R - 4, y, 4, 3);
          }
        } else if (w.k > 0.005) {
          const shake = w.k < 0.999 ? 0 : (e.st & 1);
          const plate = (y0, y1, top) => {
            const h = Math.round(y1 - y0);
            if (h < 1) return;
            c.fillStyle = '#0c0c18';
            c.fillRect(0, Math.round(y0), R + 2, h);
            c.fillStyle = '#374761';
            c.fillRect(0, Math.round(y0), R, h);
            c.fillStyle = '#54698a';
            c.fillRect(0, Math.round(y0), R, 1);
            for (let x = 22; x < R - 8; x += 34) {
              c.fillStyle = '#242f42';
              c.fillRect(x, Math.round(y0) + 1, 1, Math.max(0, h - 9));
              c.fillStyle = '#8ea4c4';
              c.fillRect(x + 4, Math.round(y0) + 3, 1, 1);
              c.fillRect(x + 4, Math.round(y0) + Math.max(3, h - 12), 1, 1);
            }
            const ey = top ? Math.round(y1) - 7 : Math.round(y0);
            for (let x = 0; x < R; x++) {
              c.fillStyle = ((x >> 3) & 1) ? '#ffd430' : '#1a1408';
              c.fillRect(x, ey + shake, 1, 7);
            }
            c.fillStyle = '#0c0c18';
            c.fillRect(0, top ? Math.round(y1) - 1 : Math.round(y0), R, 1);
          };
          plate(e.ct, w.yt, true);
          plate(w.yb, e.fb, false);
        }
      }
    },
  };

  /* =============================================================
   * THE STAGE
   *   6 checkpoints, 912 px apart. Every checkpoint is followed by a
   *   calm stretch: flying waves start >= 130 px later and anchored
   *   hazards (turrets, bays, gates ...) >= 300 px later, so the
   *   first 5 s after every respawn are harmless.
   *   order: hull -> hangar -> cage hall (mid-boss) -> gates and
   *   crushers -> final approach -> (recovery) -> BRAIN
   * ============================================================= */
  STAGES.push({
    id: 7,
    name: 'FORTRESS',
    sub: 'THE FINAL ASSAULT',
    music: 'stage7',
    bossMusic: 'bossFinal',
    scroll: 0.8,
    bossX: BOSS_X,
    checkpoints: [0, 912, 1824, 2736, 3648, 4560],
    terrain: s7terrain,
    background: s7background,
    script(S) {
      const carry = { carry: 'last' };
      const lamps = (list) => list.forEach(([wx, y, gr]) => S.fixed(wx, y, 's7_lamp', { green: !!gr }));

      /* ---- 1. OUTER HULL (cp0 = 0): turret towers, rack deck ---- */
      S.wave(150, 'spinner', { n: 5, gap: 14, y: 64, dirY: 1, ...carry });
      S.wave(255, 'spinner', { n: 5, gap: 14, y: 150, dirY: -1 });
      S.wave(340, 's7_drone', { n: 4, gap: 18, y: 96, mode: 'sine', amp: 28, ...carry });
      S.ground(463, 's7_gun');
      S.ground(530, 's7_slider', { range: 34 });
      S.wave(430, 'spinner', { n: 6, gap: 12, y: 58, dirY: 1, turnX: 130, ...carry });
      S.ground(600, 's7_twin');
      S.wave(540, 's7_drone', { n: 5, gap: 14, y: 116, mode: 'sine', amp: 34 });
      S.ground(650, 's7_walker', { dir: -1 });
      S.ground(692, 's7_rapid');
      S.ground(736, 's7_gun');
      S.wave(640, 'diver', { n: 3, gap: 26, y: 50, dy: 34, ...carry });
      S.ground(805, 's7_rack');
      S.wave(700, 's7_mine', { n: 3, gap: 44, y: 80, dy: 34, speed: 0.55 });
      S.ground(862, 's7_rack', { shift: 1 });
      lamps([[446, 168], [480, 168, true], [583, 164, true], [617, 164], [719, 170], [753, 170, true]]);

      /* ---- calm (cp1 = 912) ---- */
      S.wave(1060, 'spinner', { n: 5, gap: 12, y: 96, dirY: 1, turnX: 140, ...carry });
      S.wave(1135, 'diver', { n: 4, gap: 22, y: 60, dy: 30 });
      S.banner(1140, ['HANGAR']);

      /* ---- 2. HANGAR: bays, gantry turrets, belts ---- */
      S.wave(1225, 's7_drone', { n: 4, gap: 16, y: 110, mode: 'sine', amp: 24 });
      S.ceil(1245, 's7_gun');
      S.ground(1290, 's7_bay', { count: 3 });
      S.ceil(1337, 's7_gun');
      S.ground(1400, 's7_belt', { len: 108, dir: -1 });
      S.ceil(1421, 's7_twin');
      S.wave(1330, 'spinner', { n: 5, gap: 12, y: 140, dirY: -1, turnX: 120 });
      S.ceil(1470, 's7_gun');
      S.ground(1500, 's7_bay', { count: 4, carry: true });
      S.ground(1600, 's7_walker', { dir: -1 });
      S.ceil(1620, 's7_rapid');
      S.wave(1480, 's7_drone', { n: 5, gap: 14, y: 120, mode: 'sine', amp: 30 });
      S.ground(1700, 's7_bay', { count: 3 });
      S.ceil(1710, 's7_slider', { range: 34 });
      S.ceil(1767, 's7_gun');
      S.wave(1610, 'diver', { n: 3, gap: 24, y: 110, dy: 20 });
      lamps([[1337, 91, true], [1421, 87], [1767, 91], [1907, 91, true]]);

      /* ---- calm (cp2 = 1824): conveyor hall ---- */
      S.ground(1885, 's7_belt', { len: 130, dir: 1 });
      S.ground(2010, 's7_belt', { len: 84, dir: -1 });
      S.wave(1900, 's7_drone', { n: 5, gap: 14, y: 124, mode: 'sine', amp: 22, ...carry });
      S.wave(1990, 's7_mine', { n: 3, gap: 40, y: 110, dy: 20, speed: 0.55 });
      S.wave(2060, 'spinner', { n: 5, gap: 12, y: 100, dirY: 1, turnX: 130 });
      S.banner(2100, ['REACTOR']);
      lamps([[2090, 96], [2112, 96, true], [2090, 132, true], [2112, 132]]);

      /* ---- 3a. REACTOR HALL: mid-boss Electronic Cage ---- */
      S.wave(2150, 's7_drone', { n: 4, gap: 16, y: 120, mode: 'sine', amp: 22, ...carry });
      S.at(2200, () => G.spawn('s7_cage', {}));
      S.wave(2640, 'spinner', { n: 5, gap: 12, y: 90, dirY: 1, turnX: 120, ...carry });

      /* ---- calm (cp3 = 2736) ---- */
      S.wave(2820, 's7_drone', { n: 4, gap: 16, y: 110, mode: 'sine', amp: 26, ...carry });
      S.wave(2930, 'spinner', { n: 5, gap: 12, y: 120, dirY: -1, turnX: 120 });

      /* ---- 3b. LASER GATES AND CRUSHERS ----
       * gates are timed by their own age, i.e. by the screen position (86 off, 44 blinking, 70 armed):
       * phase 10 is armed only far to the right (x = 184..128, a harmless first look), phase 120 while it
       * passes x = 112..56 (do not advance into it) and phase 100 while it passes x = 96..40 (cross it while
       * it is off or blinking; the far left edge is a refuge). pistons: phase 55 = closed at x = 60..30. */
      S.fixed(3090, 112, 's7_gate', { phase: 10 });
      S.wave(3110, 's7_drone', { n: 3, gap: 22, y: 112, mode: 'sine', amp: 16, ...carry });
      S.fixed(3200, 112, 's7_gate', { phase: 120 });
      S.fixed(3320, 112, 's7_piston', { dir: 'ceil', phase: 55, stroke: 38 });
      S.fixed(3320, 112, 's7_piston', { dir: 'floor', phase: 55, stroke: 38 });
      S.wave(3345, 's7_mine', { n: 2, gap: 50, y: 100, dy: 30, speed: 0.5 });
      S.fixed(3430, 112, 's7_piston', { dir: 'ceil', phase: 10, stroke: 56 });
      S.fixed(3430, 112, 's7_piston', { dir: 'floor', phase: 110, stroke: 56 });
      S.fixed(3540, 112, 's7_gate', { phase: 100 });
      S.wave(3500, 's7_drone', { n: 3, gap: 20, y: 112, mode: 'sine', amp: 14, ...carry });

      /* ---- calm (cp4 = 3648) ---- */
      S.wave(3720, 'spinner', { n: 5, gap: 12, y: 100, dirY: 1, turnX: 130, ...carry });
      S.wave(3810, 's7_drone', { n: 4, gap: 16, y: 120, mode: 'sine', amp: 24 });
      S.wave(3890, 'diver', { n: 3, gap: 24, y: 70, dy: 30, ...carry });
      S.banner(3900, ['FINAL APPROACH']);

      /* ---- 4. FINAL APPROACH: dense turret rows, racks, homing missiles ---- */
      const fl = ['s7_gun', 's7_rapid', 's7_twin', 's7_gun', 's7_rapid', 's7_twin'];
      const cl = ['s7_twin', 's7_gun', 's7_rapid', 's7_gun', 's7_twin', 's7_rapid'];
      [4020, 4110, 4200, 4290, 4380, 4470].forEach((x, i) => S.ground(x, fl[i]));
      [4065, 4155, 4245, 4335, 4425, 4515].forEach((x, i) => S.ceil(x, cl[i]));
      S.ground(4155, 's7_rack');
      S.ground(4335, 's7_rack', { shift: 1 });
      S.wave(3990, 's7_mine', { n: 3, gap: 40, y: 100, dy: 22, speed: 0.55 });
      S.wave(4100, 's7_missile', { n: 3, gap: 34, y: 80, dy: 30, delay: 26 });
      S.wave(4180, 'spinner', { n: 5, gap: 12, y: 112, dirY: 1, turnX: 130, ...carry });
      S.wave(4290, 's7_missile', { n: 3, gap: 34, y: 90, dy: 30, delay: 26 });
      S.wave(4360, 's7_drone', { n: 4, gap: 16, y: 112, mode: 'sine', amp: 20, ...carry });
      S.wave(4440, 's7_mine', { n: 3, gap: 40, y: 100, dy: 22, speed: 0.55 });
      lamps([[4020, 152], [4200, 152, true], [4380, 152], [4065, 72], [4245, 72, true], [4425, 72]]);

      /* ---- recovery before the boss (cp5 = 4560): three capsule carriers ---- */
      S.wave(4700, 'spinner', { n: 5, gap: 12, y: 96, dirY: 1, turnX: 130, ...carry });
      S.wave(4830, 's7_drone', { n: 4, gap: 16, y: 120, mode: 'sine', amp: 24, ...carry });
      S.wave(4950, 'spinner', { n: 5, gap: 12, y: 130, dirY: -1, turnX: 130, ...carry });

      /* ---- FINAL BOSS ---- */
      S.boss(BOSS_X, 's7_brain', {});
    },
  });
})();
