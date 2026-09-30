'use strict';
/* =============================================================
 * STAGE 4 — REVERSE VOLCANO
 * The volcano stage turned upside down: huge crater mountains hang from
 * the ceiling and rain rocks onto forested, burning hills; lava streams
 * and geysers below; an armoured "Iron Maiden" crawls the ceiling.
 * (all names are prefixed s4_ ; everything lives inside one IIFE)
 * ============================================================= */
(function stage4() {
  /* =====================================================================
   * ART
   * ===================================================================== */
  const lerpN = (a, b, t) => a + (b - a) * t;

  /* ---- pine / cedar trees (hand-ruled pixel art, 3 tone shading, dark outline) ---- */
  const PINE_LUSH = { o: '#0a1a14', d: '#0f4c34', m: '#1f8038', l: '#48b446', h: '#a4e052', tl: '#b8804a', tm: '#7c4c2a', td: '#452818', rim: '#e8782c' };
  const PINE_SCORCH = { o: '#140c0c', d: '#2a1c18', m: '#4c3020', l: '#7a4a24', h: '#c8782c', tl: '#6a4a34', tm: '#3e2a1e', td: '#241610', rim: '#ff8a2c' };

  /** tiers: [[halfWidthTop, halfWidthBottom, rows], ...] from the top; trunk below */
  function s4_pine(name, tiers, trunkH, pal, seed, opt) {
    opt = opt || {};
    const maxHw = Math.max(...tiers.map((t) => Math.max(t[0], t[1])));
    const rowsTotal = tiers.reduce((a, t) => a + t[2], 0);
    const w = maxHw * 2 + 3, h = 1 + rowsTotal + trunkH;
    const cx = maxHw + 1;
    Sprites.painted(name, w, h, 1, (d) => {
      const rng = makeRng(seed);
      let y = 1;
      for (const [hw0, hw1, rows] of tiers) {
        for (let j = 0; j < rows; j++, y++) {
          const hw = Math.round(lerpN(hw0, hw1, rows > 1 ? j / (rows - 1) : 1));
          for (let x = cx - hw; x <= cx + hw; x++) {
            const eL = x - (cx - hw), eR = cx + hw - x;
            const last = j === rows - 1;
            let c = 'm';
            if (eR <= Math.floor(hw * 0.42)) c = 'd';
            else if (eL === 0 && hw > 0) c = 'l';
            else if (eL <= Math.floor(hw * 0.3) && rng() < 0.55) c = 'l';
            else if (rng() < 0.1) c = 'd';
            if (last && hw > 1) c = (x + y) & 1 ? 'd' : (eL === 0 ? 'l' : 'm');
            if (j === 0 && hw <= 1 && eL === 0) c = 'h';
            d.px(x, y, pal[c]);
          }
          if (opt.embers && rng() < 0.5) {
            const ex = cx - hw + Math.floor(rng() * (hw * 2 + 1));
            d.px(ex, y, rng() < 0.5 ? pal.rim : pal.h);
          }
        }
      }
      for (let j = 0; j < trunkH; j++, y++) {
        d.px(cx - 1, y, pal.tl);
        d.px(cx, y, pal.tm);
        d.px(cx + 1, y, pal.td);
      }
      d.outline(pal.o);
    });
  }

  /** slim cypress / cedar: spindle shaped, vertical light bands */
  function s4_cedar(name, hwMax, rows, trunkH, pal, seed, opt) {
    opt = opt || {};
    const w = hwMax * 2 + 3, h = 1 + rows + trunkH, cx = hwMax + 1;
    Sprites.painted(name, w, h, 1, (d) => {
      const rng = makeRng(seed);
      for (let j = 0; j < rows; j++) {
        const t = (j + 0.5) / rows;
        const hw = Math.max(0, Math.round(hwMax * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85)));
        for (let x = cx - hw; x <= cx + hw; x++) {
          const eL = x - (cx - hw), eR = cx + hw - x;
          let c = 'm';
          if (eR <= Math.max(0, Math.floor(hw * 0.5))) c = 'd';
          else if (eL <= Math.floor(hw * 0.25)) c = 'l';
          if (((j + x * 2) % 5) === 0 && c === 'm') c = 'd';
          else if (((j * 3 + x) % 7) === 0 && c === 'l') c = 'h';
          if (opt.embers && rng() < 0.16) c = 'rim';
          d.px(x, 1 + j, pal[c]);
        }
      }
      for (let j = 0; j < trunkH; j++) {
        d.px(cx, 1 + rows + j, pal.tm);
        d.px(cx - 1, 1 + rows + j, pal.tl);
      }
      d.outline(pal.o);
    });
  }

  /** round bush */
  function s4_bush(name, rx, ry, pal, seed) {
    const w = rx * 2 + 3, h = ry * 2 + 2;
    Sprites.painted(name, w, h, 1, (d) => {
      const rng = makeRng(seed);
      const cx = rx + 1, cy = ry;
      d.ellipse(cx, cy, rx, ry, pal.d);
      d.ellipse(cx - 0.6, cy - 0.6, rx - 1, ry - 1, pal.m);
      d.ellipse(cx - 1.4, cy - 1.4, rx * 0.55, ry * 0.5, pal.l);
      for (let i = 0; i < 4; i++) d.px(cx - rx + 2 + Math.floor(rng() * rx), cy - ry + 2 + Math.floor(rng() * 2), pal.h);
      d.rect(cx - 1, h - 2, 2, 2, pal.td);
      d.outline(pal.o);
    });
  }

  /** charred dead tree: black trunk, bare limbs, a few embers */
  function s4_snag(name, hgt, seed, lean) {
    const w = 15, h = hgt + 2, cx = 7;
    Sprites.painted(name, w, h, 1, (d) => {
      const rng = makeRng(seed);
      const T = { a: '#5a4038', b: '#33241f', c: '#1c1214', e: '#ff8a2c', f: '#ffd04a' };
      for (let y = 1; y < h; y++) {
        const t = y / h;
        const off = Math.round(lean * (1 - t) * 1.6);
        d.px(cx + off - 1, y, T.a);
        d.px(cx + off, y, T.b);
        d.px(cx + off + 1, y, T.c);
        if (y > h - 5) { d.px(cx + off - 2, y, T.b); d.px(cx + off + 2, y, T.c); }
      }
      const limb = (y0, dir, len) => {
        const off0 = Math.round(lean * (1 - y0 / h) * 1.6);
        for (let i = 1; i <= len; i++) {
          d.px(cx + off0 + dir * (1 + i), y0 - Math.floor(i * 0.7), i < 2 ? T.b : T.c);
        }
        if (rng() < 0.7) d.px(cx + off0 + dir * (len + 1), y0 - Math.floor(len * 0.7) - 1, T.e);
      };
      limb(Math.floor(h * 0.42), -1, 4);
      limb(Math.floor(h * 0.3), 1, 3);
      limb(Math.floor(h * 0.62), 1, 3);
      for (let i = 0; i < 4; i++) d.px(cx - 1 + Math.floor(rng() * 3) + Math.round(lean * 0.5), 3 + Math.floor(rng() * (h - 6)), rng() < 0.5 ? T.e : T.f);
      d.outline('#0c0608');
    });
  }

  // lush pines (healthy forest), scorched pines (burning) and charred snags (burnt out)
  const PINES = [
    ['a', [[0, 2, 4], [1, 4, 4], [2, 5, 4]], 3],
    ['b', [[0, 2, 4], [1, 4, 4], [2, 5, 4], [3, 7, 4]], 4],
    ['c', [[0, 2, 4], [1, 4, 4], [2, 6, 4], [3, 7, 4], [4, 9, 4]], 4],
  ];
  PINES.forEach(([k, tiers, tr], i) => {
    s4_pine('s4_pine_' + k, tiers, tr, PINE_LUSH, 11 + i * 7);
    s4_pine('s4_spine_' + k, tiers, tr, PINE_SCORCH, 31 + i * 5, { embers: true });
  });
  s4_cedar('s4_cedar_a', 4, 22, 3, PINE_LUSH, 71);
  s4_cedar('s4_cedar_b', 3, 15, 3, PINE_LUSH, 73);
  s4_cedar('s4_scedar_a', 4, 22, 3, PINE_SCORCH, 75, { embers: true });
  s4_bush('s4_bush_a', 5, 4, PINE_LUSH, 91);
  s4_bush('s4_bush_b', 3, 3, PINE_LUSH, 93);
  s4_bush('s4_sbush', 4, 3, PINE_SCORCH, 95);
  s4_snag('s4_snag_a', 20, 5, -1);
  s4_snag('s4_snag_b', 15, 6, 1);
  s4_snag('s4_snag_c', 11, 7, 0);

  /* ---- flames (burning trees, eruption jets) ---- */
  function s4_flame(name, w, h, frames, seed) {
    Sprites.painted(name, w, h, frames, (d, f) => {
      const cx = (w - 1) / 2;
      const ph = (f / frames) * TAU;
      const rng = makeRng(seed + f * 19);
      const tongue = (bx, bw, tx, ty, col) => {
        const mid = (h - 1 + ty) / 2;
        const bend = (tx - bx) * 0.35;
        d.poly([[bx - bw / 2, h], [bx - bw * 0.46 + bend, mid + 1], [tx, ty], [bx + bw * 0.46 + bend, mid + 1], [bx + bw / 2, h]], col);
      };
      const s1 = Math.sin(ph) * w * 0.16, s2 = Math.sin(ph + 2.1) * w * 0.2, s3 = Math.sin(ph + 4.2) * w * 0.2;
      // outer red flames
      tongue(cx, w * 0.96, cx + s1, 0 + (f & 1), 'r');
      tongue(cx - w * 0.28, w * 0.5, cx - w * 0.3 + s2, h * 0.34, 'r');
      tongue(cx + w * 0.28, w * 0.5, cx + w * 0.3 + s3, h * 0.38, 'r');
      // orange
      tongue(cx, w * 0.66, cx + s1 * 0.8, h * 0.16 + (f & 1), 'o');
      tongue(cx - w * 0.26, w * 0.34, cx - w * 0.27 + s2 * 0.7, h * 0.5, 'o');
      tongue(cx + w * 0.26, w * 0.34, cx + w * 0.27 + s3 * 0.7, h * 0.52, 'o');
      // yellow core
      tongue(cx, w * 0.4, cx + s1 * 0.5, h * 0.44, 'y');
      d.rect(Math.round(cx - w * 0.1), Math.round(h * 0.72), Math.max(1, Math.round(w * 0.2)), Math.max(1, Math.round(h * 0.2)), 'h');
      // stray sparks
      if (rng() < 0.6) d.px(Math.round(cx + (rng() - 0.5) * w * 0.8), Math.floor(rng() * h * 0.3), 'y');
    });
  }
  s4_flame('s4_flame_s', 9, 13, 4, 3);
  s4_flame('s4_flame_m', 13, 19, 4, 5);
  s4_flame('s4_flame_l', 17, 25, 4, 7);

  /* ---- molten rock: falls from the crater, glowing tail trails behind (above) ---- */
  Sprites.painted('s4_rock', 9, 14, 2, (d, f) => {
    const sw = f ? 0.8 : -0.8;
    d.poly([[1.5, 9], [4 + sw, 0], [6.5, 9]], 'R');
    d.poly([[2.5, 9], [4 + sw * 0.6, 2], [5.5, 9]], 'r');
    d.poly([[3, 9], [4 + sw * 0.3, 4], [5, 9]], 'o');
    d.circle(4, 9, 3.9, 'e');
    d.circle(4, 9, 3.2, 'm');
    d.circle(3.3, 8.2, 1.7, 'M');
    d.px(5, 8, 'o'); d.px(5, 9, 'y'); d.px(6, 10, 'o');
    d.px(3, 11, 'o'); d.px(2, 10, 'y'); d.px(4, 12, 'r');
    if (f) { d.px(4, 8, 'O'); d.px(1, 8, 'O'); } else { d.px(7, 8, 'O'); d.px(6, 12, 'O'); }
    d.outline('k');
  });

  /* ---- crater glow (hangs in the crater bowl) ---- */
  Sprites.painted('s4_vent', 28, 12, 3, (d, f) => {
    const ry = [5, 6, 8][f];
    d.ellipse(14, 1, 13, ry, f === 2 ? 'o' : 'R');
    d.ellipse(14, 1, 11.5, ry - 1.2, f === 2 ? 'y' : 'r');
    d.ellipse(14, 0.5, 8.5, ry - 2.4, f === 2 ? 'h' : 'o');
    d.ellipse(14, 0, 4.6, Math.max(1, ry - 4), f === 2 ? 'w' : 'y');
    d.px(10, ry - 1, 'o'); d.px(18, ry - 2, 'o');
    if (f >= 1) { d.px(9, ry, 'r'); d.px(19, ry - 1, 'r'); }
    d.rect(0, 0, 28, 1, 'k'); // keeps the top edge tucked into the rock
  });

  /* ---- geyser base: fissure on the floor (dim / hot / white-hot) ---- */
  Sprites.painted('s4_gbase', 20, 9, 3, (d, f) => {
    d.ellipse(10, 8, 9, 3.4, '#2a1218');
    d.ellipse(10, 8, 8, 2.6, f === 0 ? 'R' : 'r');
    d.ellipse(10, 8, 6.4, 1.8, f === 0 ? 'O' : 'o');
    d.ellipse(10, 8, 4, 1.1, f === 2 ? 'w' : f === 1 ? 'y' : 'o');
    if (f >= 1) { d.px(5, 5, 'o'); d.px(14, 4, 'y'); d.px(9, 3, 'r'); }
    if (f === 2) { d.px(11, 1, 'y'); d.px(7, 2, 'w'); d.px(15, 2, 'o'); }
  });
  Sprites.painted('s4_gtop', 22, 10, 2, (d, f) => {
    // splash cap on top of the lava column
    d.ellipse(11, 6, 10, 3.6, 'r');
    d.ellipse(11, 6, 8.6, 2.8, 'o');
    d.ellipse(11, 6.4, 6, 1.8, 'y');
    d.px(3, 3 + f, 'o'); d.px(18, 2 + (1 - f), 'y'); d.px(8, 1, 'y'); d.px(14, 0 + f, 'o'); d.px(11, 0, 'w');
  });

  /* ---- wisp: little ghost flame with a wavering tail (facing left) ---- */
  Sprites.painted('s4_wisp', 18, 14, 4, (d, f) => {
    const ph = (f / 4) * TAU;
    // tail tongues
    for (const [k, len, amp] of [[0, 8, 2.2], [1, 6, 2.6], [2, 7, 2.0]]) {
      const oy = 4 + k * 3;
      const s = Math.sin(ph + k * 1.7) * amp;
      d.poly([[8, oy + 1], [8 + len, oy + 1 - s * 0.6 - 1 + (k - 1) * 0.5], [8 + len * 0.55, oy + 2 - s * 0.2], [8, oy + 3]], 'C');
      d.poly([[8, oy + 1.4], [8 + len * 0.7, oy + 1.4 - s * 0.4], [8, oy + 2.6]], 'c');
    }
    // head
    d.circle(6, 7, 5, 'C');
    d.circle(6, 7, 4, 'c');
    d.circle(5.4, 6.4, 2.6, 'w');
    d.circle(5.6, 6.6, 1.6, 'h');
    // flame tufts on the head
    d.poly([[3, 3], [4, 0 - (f & 1)], [6, 3]], 'C');
    d.poly([[6, 3], [8, 1 + (f & 1)], [9, 4]], 'C');
    d.px(4, 2, 'c'); d.px(7, 3, 'c');
    // eyes
    d.rect(2, 6, 2, 3, 'B');
    d.px(2, 6, 'k'); d.px(2, 7, 'k'); d.px(3, 8, 'k');
    d.outline('#0a2250');
  });
  Sprites.recolor('s4_wisp', 's4_wisp_c', { C: 'o', c: 'y', w: 'h', h: 'w', B: 'R', '#0a2250': '#4a0c10' });

  /* ---- ceiling crawler: lava beetle (drawn standing; the engine flips it on the ceiling) ---- */
  Sprites.painted('s4_crawler', 20, 13, 4, (d, f) => {
    const ph = (f / 4) * TAU;
    // legs (behind the shell)
    for (let i = 0; i < 3; i++) {
      const bx = 6 + i * 4;
      const s = Math.sin(ph + i * 2.1);
      const fx = Math.round(bx + s * 2.4 - 1);
      const lift = s > 0.5 ? 1 : 0;
      d.line(bx, 8, bx - 1 + Math.round(s), 10 - lift, 'X');
      d.line(bx - 1 + Math.round(s), 10 - lift, fx, 12 - lift, 'X');
      d.px(fx, 12 - lift, 'g');
    }
    // shell
    d.ellipse(11, 6, 8.6, 5.2, 'e');
    d.ellipse(11, 6, 7.8, 4.6, 'm');
    d.ellipse(10.2, 5.2, 5.6, 2.9, 'M');
    // glowing seams
    for (const x of [8, 12, 16]) { d.vline(x, 4, 8, 'O'); d.px(x, 6, 'y'); d.px(x, 5, 'o'); }
    d.hline(6, 17, 3, 'm');
    // head with a hot eye
    d.ellipse(3, 7, 3, 2.6, 'm');
    d.rect(1, 6, 2, 2, 'y');
    d.px(1, 6, 'w');
    d.px(0, 9, 'g'); d.px(1, 9, 'g'); // mandibles
    d.px(6, 8, 'e');
    d.outline('k');
  });
  Sprites.recolor('s4_crawler', 's4_crawler_c', { m: 'R', M: 'r', e: 'e', O: 'C', o: 'c', y: 'w' });

  /* ---- projectiles of this stage ---- */
  Sprites.def('s4_glob', [
    ['..rr..', '.roor.', 'royyor', 'royyor', '.roor.', '..RR..'],
    ['..RR..', '.rooR.', 'roywor', 'royyor', '.rooR.', '..rr..'],
  ]);
  Sprites.painted('s4_spike', 7, 14, 2, (d, f) => {
    d.poly([[1, 0], [6, 0], [4.5, 8], [3.5, 13], [2.5, 8]], 'g');
    d.poly([[1, 0], [3, 0], [3, 12], [2.5, 8]], 'W');
    d.poly([[5, 0], [6, 0], [4.5, 8], [3.5, 13], [4, 6]], 'G');
    d.rect(1, 0, 5, 2, 'X');
    d.poly([[3, 8], [4, 8], [3.5, 13]], f ? 'y' : 'o');
    d.px(3, 12, 'w');
    d.px(2, 1, 'r'); d.px(4, 1, 'r');
    d.outline('k');
  });
  Sprites.painted('s4_bomb', 11, 11, 2, (d, f) => {
    d.circle(5, 6, 4.6, 'd');
    d.circle(5, 6, 3.8, 'G');
    d.circle(4.2, 5.2, 2.2, 'X');
    d.px(3, 4, 'g');
    d.hline(2, 8, 7, 'r');
    d.hline(3, 7, 8, 'R');
    d.rect(4, 0, 2, 2, 'T');
    d.px(5, 0, f ? 'w' : 'y');
    d.px(6, 0, f ? 'y' : 'o');
    d.px(4, 2, f ? 'r' : 'R');
    d.outline('k');
  });

  /* ---- stalactite trap (ceiling spike that drops when you pass) ---- */
  Sprites.painted('s4_stal', 13, 24, 2, (d, f) => {
    d.poly([[0, 0], [12, 0], [10, 8], [7, 18], [6, 23], [5, 18], [2, 8]], 'e');
    d.poly([[1, 0], [11, 0], [9.5, 8], [6.5, 20], [5.5, 20], [2.5, 8]], 'm');
    d.poly([[1, 0], [5, 0], [4, 8], [5.5, 20], [2.5, 8]], 'M');
    d.poly([[8, 0], [11, 0], [9.5, 8], [6.5, 20]], 'e');
    d.vline(5, 4, 12, 'O'); d.px(5, 8, 'o');
    d.px(8, 6, 'O'); d.px(8, 7, 'o');
    d.rect(5, 19, 2, 4, f ? 'y' : 'o');
    d.px(6, 22, 'w');
    d.px(5, 18, 'r');
    d.outline('k');
  });
})();
