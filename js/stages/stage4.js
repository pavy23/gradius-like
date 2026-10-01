'use strict';
/* =============================================================
 * STAGE 4 — REVERSE VOLCANO
 *
 * The volcano stage turned upside down: huge crater mountains hang from
 * the ceiling and rain rocks onto forested, burning hills; lava streams,
 * lava lakes and geysers below; an armoured "Iron Maiden" crawls the
 * ceiling of an iron hall (mid-boss); the ASH PHOENIX (a fast fire-bird that
 * dive-bombs across the arena, wings = armour) waits above a calm lava arena.
 *
 *   0    A  ember gate      lush pines, first hanging tips, volcano #1
 *   650  B  burning forest  tall hills, burning trees, valley geysers
 *   1400 C  hanging volcanoes  vents rain rocks, two tight squeezes
 *   2000 D  lava lake       geysers, lava bubbles, aimed rocks
 *   2420 H  iron hall       IRON MAIDEN (3 armour plates + core), scroll 0.62
 *   3480 E  final approach  lava lake, last vent, capsules, calm run-in
 *   4000    boss arena      flat, 164 px corridor, lava floor: ASH PHOENIX
 *
 * Checkpoints 0 / 820 / 1540 / 2300 / 3520 sit in open air; shooters and
 * squads keep out of the ~5 s that follow each one.
 *
 * Signature enemies (all prefixed s4_): s4_vent + s4_rock (crater rains
 * rocks that splash into embers), s4_geyser (telegraphed lava column, an
 * invulnerable moving obstacle), s4_wisp (ghost fire on sine paths),
 * s4_crawler (ceiling walker), s4_stal (stalactite trap), s4_bubble (lava
 * bubble), s4_maiden + s4_bomb (mid-boss), s4_phoenix (boss), s4_burn /
 * s4_lavafx (living decoration). Generic turret / rocket / diver / spinner
 * are reused.
 *
 * Everything lives inside one IIFE; only STAGES, ENEMIES, Sprites and
 * Terrain.TILES receive (s4_-prefixed) entries.
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
        let hw = Math.max(0, Math.round(hwMax * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85)));
        if (hw >= 2 && j > 2 && j < rows - 2) hw = Math.min(hwMax, Math.max(1, hw + [1, 0, 0, -1][j % 4]));
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
  // smouldering stump / ash mound (burnt-out bush)
  Sprites.painted('s4_sbush', 11, 9, 1, (d) => {
    d.ellipse(5.5, 6.4, 5, 2.6, '#2a1c18');
    d.ellipse(5.2, 6, 4, 1.9, '#4c3428');
    d.hline(2, 8, 5, '#6a4a34');
    d.px(3, 6, '#ff8a2c'); d.px(6, 5, '#ffd04a'); d.px(8, 6, '#ff5a24'); d.px(5, 7, '#ff8a2c');
    d.line(4, 4, 3, 1, '#1c1214'); d.line(7, 4, 8, 2, '#1c1214'); d.px(3, 1, '#ff8a2c'); d.px(8, 2, '#ffd04a');
    d.outline('#0c0608');
  });
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
    const sw = f ? 0.9 : -0.9;
    d.poly([[1.5, 9], [4 + sw, 0], [6.5, 9]], 'r');
    d.poly([[2.2, 9], [4 + sw * 0.7, 1.5], [5.8, 9]], 'o');
    d.poly([[3, 9], [4 + sw * 0.4, 4], [5, 9]], 'y');
    d.circle(4, 9, 3.9, 'R');
    d.circle(4, 9, 3.3, 'o');
    d.circle(3.6, 8.6, 2.3, 'y');
    d.px(3, 8, 'h'); d.px(4, 8, 'h');
    // dark crust plates
    d.px(6, 7, 'e'); d.px(6, 8, 'm'); d.px(6, 9, 'm'); d.px(5, 11, 'e'); d.px(6, 11, 'm'); d.px(2, 11, 'm'); d.px(1, 9, 'e'); d.px(1, 10, 'm');
    if (f) { d.px(4, 12, 'e'); d.px(2, 7, 'm'); } else { d.px(3, 12, 'e'); d.px(5, 12, 'm'); }
    d.outline('#3a0808');
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
    d.vline(3, 5, 6, 'B');
    d.vline(3, 8, 9, 'B');
    d.px(3, 5, 'k'); d.px(3, 9, 'k');
    d.outline('#0a2250');
  });
  Sprites.recolor('s4_wisp', 's4_wisp_c', { C: 'o', c: 'y', w: 'h', h: 'w', B: 'R', '#0a2250': '#4a0c10' });

  /* ---- ceiling crawler: armoured cinder beetle (drawn standing; the engine flips it on the ceiling) ---- */
  Sprites.painted('s4_crawler', 20, 14, 4, (d, f) => {
    const ph = (f / 4) * TAU;
    for (let i = 0; i < 3; i++) {
      const bx = 6 + i * 4;
      const s = Math.sin(ph + i * 2.1);
      const fx = Math.round(bx + s * 2.6 - 1);
      const lift = s > 0.55 ? 1 : 0;
      d.line(bx, 8, bx + Math.round(s * 1.5), 10 - lift, 'g');
      d.line(bx + Math.round(s * 1.5), 10 - lift, fx, 13 - lift, 'g');
      d.line(bx + 1, 8, bx + 1 + Math.round(s * 1.5), 10 - lift, 'G');
      d.px(fx, 13 - lift, 'W'); d.px(fx - 1, 13 - lift, 'W');
    }
    // shell
    d.ellipse(11, 5.2, 8.6, 4.8, 'V');
    d.ellipse(11, 5.2, 7.8, 4.2, 'v');
    d.ellipse(10.2, 4.4, 5.6, 2.7, 'p');
    d.ellipse(9.4, 3.8, 3.2, 1.4, 'W');
    // glowing seams
    for (const x of [8, 12, 16]) { d.vline(x, 3, 8, 'O'); d.px(x, 5, 'y'); d.px(x, 4, 'o'); }
    d.hline(6, 17, 2, 'V');
    // head with a hot eye
    d.ellipse(3, 6.5, 3, 2.6, 'v');
    d.rect(1, 5, 2, 2, 'y');
    d.px(1, 5, 'w');
    d.px(0, 8, 'W'); d.px(1, 8, 'W'); d.px(2, 9, 'W'); // mandibles
    d.px(6, 8, 'V');
    d.outline('#1c0c30');
  });
  Sprites.recolor('s4_crawler', 's4_crawler_c', { V: 'R', v: 'r', p: 'o', W: 'y', '#1c0c30': '#3a0808' });

  /* ---- projectiles of this stage ---- */
  Sprites.painted('s4_glob', 8, 8, 2, (d, f) => {
    d.circle(3.5, 3.5, 2.9, 'r');
    d.circle(3.5, 3.5, 2.1, 'o');
    d.circle(3.4, 3.4, 1.2, f ? 'w' : 'y');
    d.px(2, 6 + f, 'R');
    d.outline('#3a0808', true);
  });
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


  /* ---- lava bubble (rises from the lakes, pops into embers) ---- */
  Sprites.painted('s4_bubble', 11, 11, 3, (d, f) => {
    const r = [3.5, 4.5, 5][f];
    d.circle(5, 5.5, r, 'R');
    d.circle(5, 5.5, r - 1, 'o');
    d.circle(4.4, 4.9, r - 2.2, 'y');
    d.px(3, 3, 'w'); d.px(4, 3, 'h');
    if (f === 2) { d.px(8, 8, 'r'); d.px(2, 8, 'r'); d.px(9, 5, 'y'); }
    d.outline('#4a0a06');
  });

  /* ---- fire light: dithered glow discs drawn behind flames / geysers with low alpha ---- */
  [8, 13, 19].forEach((r, k) => {
    Sprites.painted('s4_glow_' + k, r * 2 + 3, r * 2 + 3, 1, (d) => {
      const c = r + 1;
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const q = Math.sqrt(x * x + y * y);
          if (q > r + 0.3) continue;
          if (q < r * 0.5 || ((x + y) & 1) === 0 || (q < r * 0.78 && ((x * 3 + y) & 3) === 0)) d.px(c + x, c + y, q < r * 0.5 ? '#ffb040' : '#ff7a24');
        }
      }
    });
  });

  /* ---- IRON MAIDEN (mid-boss): armoured tank that crawls along the ceiling ---- */
  // hull 68x36: iron sarcophagus with a spiked cavity in front (the doors are the three plates)
  Sprites.painted('s4_maiden', 68, 36, 1, (d) => {
    const hull = [[13, 0], [59, 0], [65, 5], [67, 12], [67, 25], [64, 31], [58, 35], [13, 35]];
    d.poly(hull, 'd');
    d.poly([[14, 1], [58, 1], [64, 6], [66, 12], [66, 25], [63, 30], [57, 34], [14, 34]], 'X');
    d.poly([[14, 1], [58, 1], [64, 6], [66, 12], [66, 17], [14, 17]], 'x');
    // lit top-left edge
    d.hline(15, 57, 1, 'W');
    d.line(58, 1, 64, 6, 'g');
    d.hline(15, 40, 2, 'g');
    // heavy panel seams + rivets
    for (const x of [26, 40, 52]) { d.vline(x, 3, 33, 'd'); d.vline(x + 1, 3, 33, 'x'); }
    d.hline(15, 66, 17, 'd');
    d.hline(15, 66, 18, 'G');
    for (const x of [17, 22, 30, 35, 44, 48, 56, 61]) { d.px(x, 4, 'W'); d.px(x, 31, 'g'); }
    // rust / hot iron streaks
    for (const [x, y, w] of [[28, 8, 6], [42, 11, 8], [54, 7, 4], [30, 24, 8], [45, 27, 6]]) d.hline(x, x + w, y, 'T');
    // caution band + angry visor slits
    for (let x = 29; x < 56; x++) for (let y = 21; y <= 23; y++) d.px(x, y, ((x + y) >> 1) % 2 ? 'y' : 'd');
    d.hline(29, 55, 20, 'd'); d.hline(29, 55, 24, 'd');
    for (const x0 of [17, 26]) {
      d.rect(x0, 5, 7, 3, 'd');
      d.hline(x0 + 1, x0 + 5, 6, 'r');
      d.hline(x0 + 2, x0 + 4, 6, 'o');
      d.px(x0 + 3, 6, 'y');
      d.px(x0, 5, 'X'); d.px(x0 + 6, 5, 'X');
    }
    // rear reactor with glowing vents
    d.rect(57, 19, 9, 12, 'd');
    for (let i = 0; i < 3; i++) { d.hline(58, 65, 21 + i * 4, 'O'); d.hline(59, 64, 21 + i * 4, 'o'); d.px(61, 21 + i * 4, 'y'); }
    // front frame around the cavity
    d.rect(0, 0, 15, 3, 'X'); d.hline(0, 14, 0, 'g'); d.hline(0, 14, 2, 'd');
    d.rect(0, 32, 15, 3, 'X'); d.hline(0, 14, 32, 'x'); d.hline(0, 14, 34, 'd');
    d.rect(0, 3, 14, 29, '#0e0a16');
    d.vline(13, 3, 31, 'd');
    // spikes lining the cavity (they poke inward from the frame bars)
    for (let x = 1; x < 13; x += 3) {
      d.poly([[x, 3], [x + 2.2, 3], [x + 1.1, 7]], 'W');
      d.poly([[x, 31], [x + 2.2, 31], [x + 1.1, 27]], 'g');
    }
    // belly launcher tubes
    for (const x of [24, 36, 48]) { d.rect(x - 1, 34, 7, 2, 'd'); d.rect(x, 33, 5, 2, 'X'); d.hline(x, x + 4, 33, 'g'); }
    d.outline('k');
  });
  // armour plate (intact / cracked)
  Sprites.painted('s4_maiden_plate', 12, 10, 2, (d, f) => {
    d.rect(0, 0, 12, 10, '#8c5424');
    d.rect(1, 1, 10, 8, '#b06a30');
    d.hline(0, 11, 0, '#f0b464');
    d.vline(0, 0, 9, '#d8964c');
    d.hline(0, 11, 9, '#4a2810');
    d.vline(11, 0, 9, '#4a2810');
    d.rect(3, 4, 6, 2, '#c02818');
    d.hline(3, 8, 4, '#f05838');
    d.px(1, 1, '#ffe0a0'); d.px(10, 1, '#6a3a1c'); d.px(1, 8, '#6a3a1c'); d.px(10, 8, '#4a2810');
    if (f) {
      d.line(2, 1, 6, 5, '#2a1208'); d.line(6, 5, 5, 8, '#2a1208'); d.line(6, 5, 10, 4, '#2a1208');
      d.px(4, 3, '#ff9424'); d.px(6, 6, '#ff9424'); d.px(8, 4, '#ffd04a');
    }
    d.outline('k');
  });
  // the core (0/1 closed & shielded, 2/3 open & vulnerable)
  for (const [n, c] of [['s4_maiden_core_c', ['#3a0810', '#7a1424', '#c03040', '#ff8070']], ['s4_maiden_core_o', ['#c05412', '#ff9424', '#ffe646', '#ffffff']]]) {
    Sprites.painted(n, 10, 30, 2, (d, f) => {
      d.rect(1, 1, 8, 28, c[0]);
      d.rect(2, 2, 6, 26, c[1]);
      const w = f ? 4 : 3;
      d.rect(5 - Math.ceil(w / 2), 4, w, 22, c[2]);
      d.rect(4, 8, 2, 14, c[3]);
      d.poly([[1, 1], [5, 0], [9, 1]], c[1]);
      d.poly([[1, 29], [5, 30], [9, 29]], c[1]);
      d.outline('k');
    });
  }
  // bomb-lobbed shrapnel spark, tiny ember bullet
  Sprites.painted('s4_ember', 6, 6, 2, (d, f) => {
    d.circle(2.5, 2.5, 1.9, f ? 'r' : 'o');
    d.circle(2.5, 2.5, 1.1, f ? 'y' : 'h');
    d.outline('#3a0808');
  });

  /* ---- ASH PHOENIX (boss): art ----
   * The bird faces left. The body sprite (78x64) has its chest centre at (S4_PH_BX, S4_PH_BY); the two wings are fans of
   * feathers baked at 11 poses (0 = folded in front of the chest like a shield, 1 = spread, 2 = swept back for the dive).
   * The wing geometry below also gives the hit boxes of the wing parts, so boxes and pixels always agree. */
  const S4_PH_BX = 30, S4_PH_BY = 36; // body sprite: chest centre
  const S4_PH_HX = 16, S4_PH_HY = 23; // head sprite: head centre (it sits at chest + [-18, -10 + tilt])
  const S4_PH_OUT = '#22081a';
  const S4_PH_RAMP = ['#5a1a3c', '#a81c34', '#e8402c', '#ff8228', '#ffc040', '#fff2b0']; // feather: root -> glowing tip
  const S4_PH_RAMP2 = ['#3c1030', '#7a1830', '#c02c2c', '#f06a24', '#ffa838', '#ffe27c']; // darker neighbour feather
  const S4_PH_WK = [[160, 24, 0.9], [268, 40, 0.94], [0, 7, 0.86]]; // per key pose: [centre angle (deg), half fan (deg), length scale]
  const S4_PH_WL = [33, 38, 42, 41, 37, 31, 25]; // feather lengths, leading edge -> trailing edge
  const S4_PH_WW = 84, S4_PH_WH = 66, S4_PH_WSX = 44, S4_PH_WSY = 52; // wing canvas and the shoulder position inside it
  const S4_PH_SH = [2, -13]; // upper shoulder relative to the chest centre; the lower wing mirrors it to [2, +14]

  /** feather fan of one wing at pose p (0..2): [{th (rad), L}] */
  function s4_wingFeathers(p) {
    const i = p >= 1 ? 1 : 0, f = p - i, a = S4_PH_WK[i], b = S4_PH_WK[i + 1];
    const ac = a[0] + (b[0] - a[0]) * f, half = a[1] + (b[1] - a[1]) * f, k = a[2] + (b[2] - a[2]) * f;
    return S4_PH_WL.map((L, n) => ({ th: ((ac + ((n - 3) / 3) * half) * Math.PI) / 180, L: L * k }));
  }
  /** tight bounding box [x0, y0, x1, y1] of the upper wing relative to its shoulder */
  function s4_wingBox(p) {
    let x0 = 99, y0 = 99, x1 = -99, y1 = -99;
    for (const F of s4_wingFeathers(p)) {
      for (const t of [0.25, 0.9]) {
        const x = Math.cos(F.th) * F.L * t, y = Math.sin(F.th) * F.L * t;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    return [x0 - 2.5, y0 - 2.5, x1 + 2.5, y1 + 2.5];
  }
  /** one tapering feather from (sx, sy) along angle th, painted in colour bands root -> tip */
  function s4_feather(d, sx, sy, th, L, w0, w1, ramp) {
    const ca = Math.cos(th), sa = Math.sin(th), nx = -sa, ny = ca, n = ramp.length;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = Math.min(1, (k + 1) / n + (k < n - 1 ? 0.07 : 0));
      const a0 = w0 + (w1 - w0) * t0, a1 = w0 + (w1 - w0) * t1;
      const x0 = sx + ca * L * t0, y0 = sy + sa * L * t0, x1 = sx + ca * L * t1, y1 = sy + sa * L * t1;
      d.poly([[x0 + nx * a0, y0 + ny * a0], [x1 + nx * a1, y1 + ny * a1], [x1 - nx * a1, y1 - ny * a1], [x0 - nx * a0, y0 - ny * a0]], ramp[k]);
    }
  }

  Sprites.painted('s4_ph_wing', S4_PH_WW, S4_PH_WH, 11, (d, f) => {
    const fe = s4_wingFeathers(f / 5);
    d.circle(S4_PH_WSX + 1, S4_PH_WSY, 3.4, '#3c1030'); // root, mostly hidden under the feathers
    for (let n = fe.length - 1; n >= 0; n--) {
      const F = fe[n];
      s4_feather(d, S4_PH_WSX, S4_PH_WSY, F.th, F.L, 4.6 - n * 0.12, 1.2, n % 2 ? S4_PH_RAMP2 : S4_PH_RAMP);
    }
    d.outline(S4_PH_OUT);
  });

  /** a tapering blob: discs along a line, radius r0 -> r1 (torso, neck) */
  const s4_capsule = (d, x0, y0, r0, x1, y1, r1, col) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) d.circle(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r0 + ((r1 - r0) * i) / n, col);
  };

  // the torso never changes between the body frames: paint it once and stamp it into every frame
  const s4_phTorso = (() => {
    const d = new Sprites.Painter(78, 64, {});
    const cx = S4_PH_BX, cy = S4_PH_BY;
    // a teardrop (round chest, tapering rump), crimson plumage lit from the top left, fiery breast
    s4_capsule(d, cx - 3, cy + 2, 11.6, cx + 11, cy + 7, 5.6, '#5a1430');
    s4_capsule(d, cx - 3.6, cy + 1.4, 10.6, cx + 10, cy + 6.4, 4.6, '#a81c34');
    s4_capsule(d, cx - 4.4, cy + 0.6, 9, cx + 8, cy + 5.4, 3.2, '#d83a2c');
    s4_capsule(d, cx - 5.2, cy - 0.4, 6.4, cx + 3, cy + 2.6, 2, '#ee6a2c');
    d.ellipse(cx - 5, cy + 3.4, 6.4, 7.6, '#ff9a2c'); // fiery breast
    d.ellipse(cx - 5.4, cy + 3.4, 5, 6.2, '#ffc84a');
    // layered back feathers (scallops)
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) {
        const sx = Math.round(cx + 3 + k * 3 + (r & 1) * 1.5), sy = Math.round(cy - 5 + r * 4);
        d.px(sx, sy, '#7a1430'); d.px(sx + 1, sy + 1, '#7a1430'); d.px(sx + 2, sy, '#7a1430');
      }
    }
    // socket of the heart gem (the gem itself is drawn on top, see ENEMIES.s4_phoenix)
    d.circle(cx - 5, cy + 3, 5.6, '#3a0c1c');
    return d.c;
  })();

  Sprites.painted('s4_ph_body', 78, 64, 12, (d, f) => {
    const tilt = Math.floor(f / 4) - 1; // -1 climbing, 0 level, +1 diving (head down, tail up)
    const tf = f % 4; // tail wave
    const cx = S4_PH_BX, cy = S4_PH_BY;
    // tail: five flame feathers streaming back, they wave and lift when diving
    [[6, 46, 3.2], [16, 42, 3.0], [27, 37, 2.8], [38, 31, 2.5], [50, 25, 2.2]].forEach(([deg, L, w0], i) => {
      const th = ((deg - tilt * 18) * Math.PI) / 180 + Math.sin((tf / 4) * TAU + i * 0.9) * 0.07;
      s4_feather(d, cx + 9, cy + 7, th, L, w0, 0.9, i % 2 ? S4_PH_RAMP2 : S4_PH_RAMP);
    });
    // talons tucked under the belly
    for (const [x0, x1] of [[-4, -8], [4, 2]]) {
      d.line(cx + x0, cy + 11, cx + x1, cy + 18, '#d88420');
      d.line(cx + x1, cy + 18, cx + x1 - 3, cy + 20, '#ffc83c');
      d.line(cx + x1, cy + 18, cx + x1 + 2, cy + 20, '#ffc83c');
    }
    // neck (the head is a layer of its own), then the torso over it
    s4_capsule(d, cx - 12, cy - 6 + Math.round(tilt * 2.5), 4.6, cx - 5, cy - 3, 6.4, '#a81c34');
    d.g.drawImage(s4_phTorso, 0, 0);
    d.outline(S4_PH_OUT);
  });

  // head and crest are a layer of their own: they are drawn over the wings in every pose
  Sprites.painted('s4_ph_head', 40, 32, 2, (d, f) => {
    const hx = S4_PH_HX, hy = S4_PH_HY;
    [[-62, 18, 2.4], [-46, 22, 2.6], [-30, 20, 2.4], [-14, 15, 2.1]].forEach(([deg, L, w0], i) => {
      s4_feather(d, hx + 2 + i * 1.6, hy - 3, ((deg + (f ? 5 : -4) * (i % 2 ? 1 : -1)) * Math.PI) / 180, L, w0, 0.8, i % 2 ? S4_PH_RAMP2 : S4_PH_RAMP);
    });
    d.ellipse(hx, hy, 5.6, 5, '#a81c34');
    d.ellipse(hx - 0.6, hy - 0.8, 4.6, 4, '#e8402c');
    d.poly([[hx - 3.5, hy - 2.6], [hx - 13, hy + 0.4], [hx - 11.4, hy + 3.2], [hx - 3.5, hy + 2.2]], '#ffc83c'); // upper beak
    d.px(hx - 13, hy + 1, '#ffc83c'); d.px(hx - 13, hy + 2, '#d88420'); d.px(hx - 12, hy + 3, '#d88420'); // hook
    d.poly([[hx - 3.5, hy + 3.2], [hx - 9.4, hy + 5.6], [hx - 3.5, hy + 5.2]], '#d88420'); // lower beak
    d.hline(hx - 10, hx - 4, hy + 3, '#7a1430'); // gape
    d.line(hx - 3, hy - 1, hx, hy - 2, '#fff2b0'); // eye
    d.px(hx - 2, hy - 1, '#ff2a2a');
    d.line(hx - 5, hy - 1, hx + 1, hy - 4, S4_PH_OUT); // heavy brow
    d.outline(S4_PH_OUT);
  });

  // the heart gem: 0/1 dim and shielded, 2/3 white-hot and exposed
  Sprites.painted('s4_ph_gem', 13, 13, 4, (d, f) => {
    if (f < 2) {
      d.circle(6, 6, 5.4, '#3a0c1c');
      d.circle(6, 6, 4.4, '#7a1430');
      d.circle(6, 6, 3, f ? '#c02c2c' : '#a81c34');
      d.px(6, 6, f ? '#ff7a24' : '#e8402c');
    } else {
      d.circle(6, 6, 6, '#ff8228');
      d.circle(6, 6, 5, '#ffc040');
      d.circle(6, 6, 3.6, '#fff2b0');
      d.circle(6, 6, 2, '#ffffff');
      if (f === 3) { d.px(6, 0, '#ffffff'); d.px(6, 12, '#ffffff'); d.px(0, 6, '#ffffff'); d.px(12, 6, '#ffffff'); }
    }
  });

  // scorch marks: the plumage burns away as the bird takes damage (spots on the body, they appear as the health falls)
  Sprites.painted('s4_ph_burn', 7, 6, 2, (d, f) => {
    d.ellipse(3, 2.6, 3.2, 2.5, '#2a0c18');
    d.ellipse(3, 2.6, 2.2, 1.6, '#12060c');
    d.px(1 + f, 1, '#ff8228'); d.px(5 - f, 4, '#ffc040'); d.px(4, 1 + f * 2, '#e8402c');
  });
  const S4_PH_WOUNDS = [[0.9, 8, -4], [0.8, 4, 9], [0.7, 12, 3], [0.6, -1, -6], [0.5, -11, 8], [0.4, 7, 12], [0.3, -12, -2], [0.2, 1, 12]]; // [health below, x, y] around the chest

  // feather bullets: one sprite per aiming direction (16), two flicker frames; the bright tip leads
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    Sprites.painted('s4_ph_fb' + k, 13, 13, 2, (d, f) => {
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let j = -6; j <= 6; j += 0.5) {
        const t = (j + 6) / 12;
        const col = t > 0.86 ? '#fff6c8' : t > 0.6 ? (f ? '#ffe27c' : '#ffc040') : t > 0.32 ? (f ? '#ff9a2c' : '#ff7a24') : '#c02c2c';
        d.circle(6 + ca * j, 6 + sa * j, t < 0.12 ? 0.6 : 1.5 - t * 0.5, col);
      }
      d.outline('#3a0808');
    });
  }
  // fire-rain cinder (falls head first) and a drifting feather for the death scene
  Sprites.painted('s4_ph_cinder', 7, 15, 2, (d, f) => {
    d.poly([[1.4, 8], [3.5 + (f ? 0.8 : -0.8), 0], [5.6, 8]], 'r');
    d.poly([[2.2, 8], [3.5 + (f ? 0.5 : -0.5), 2], [4.8, 8]], 'o');
    d.circle(3.5, 7.5, 3.2, 'R');
    d.circle(3.5, 7.5, 2.6, 'o');
    d.circle(3.2, 7.1, 1.6, 'y');
    d.px(3, 7, 'w');
    d.outline('#3a0808');
  });
  Sprites.painted('s4_ph_fl', 9, 5, 3, (d, f) => {
    const th = [0.35, 0, -0.35][f];
    s4_feather(d, 1, 2.5, th, 7, 1.7, 0.6, S4_PH_RAMP);
    d.outline(S4_PH_OUT);
  });
  // charred copies of body and head for the death scene
  (function bakeCharred() {
    for (const name of ['s4_ph_body', 's4_ph_head']) {
      const cv = Sprites.store[name].frames.map((fr) => {
        const c = Sprites.makeCanvas(fr.width, fr.height);
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(fr, 0, 0);
        const img = g.getImageData(0, 0, fr.width, fr.height), dd = img.data;
        for (let i = 0; i < dd.length; i += 4) {
          if (!dd[i + 3]) continue;
          const k = Math.min(1, ((dd[i] * 0.3 + dd[i + 1] * 0.5 + dd[i + 2] * 0.2) / 255) * 1.25);
          dd[i] = 26 + k * 74; dd[i + 1] = 18 + k * 50; dd[i + 2] = 30 + k * 56;
        }
        g.putImageData(img, 0, 0);
        return c;
      });
      Sprites.fromCanvases(name + '_c', cv);
    }
  })();

  /* ---- custom terrain tile: charred basalt with faint strata and glowing fissures ---- */
  Terrain.TILES.s4_basalt = (sk, rng) => {
    const w = 96, h = 64;
    const pal = sk.pal.map(Terrain.rgb32);
    const n1 = Terrain.noiseField(w, h, 24, rng), n2 = Terrain.noiseField(w, h, 8, rng), n3 = Terrain.noiseField(w, h, 4, rng);
    const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const data = new Uint32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = 0.5 * n1[i] + 0.32 * n2[i] + 0.18 * n3[i];
        v = (v - 0.5) * (sk.contrast || 1.6) + 0.5 + Math.sin((y + n1[i] * 14) * 0.55) * 0.05;
        v = Math.min(0.999, Math.max(0, v));
        const dith = ((BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) / pal.length * 0.9;
        data[i] = pal[Math.min(pal.length - 1, Math.max(0, Math.floor((v + dith) * pal.length)))];
      }
    }
    const halo = Terrain.rgb32('#4a1410'), mid = Terrain.rgb32('#b02c14'), core = Terrain.rgb32(sk.crackGlow || '#ff6a1c'), hot = Terrain.rgb32('#ffc04a');
    const set = (x, y, c) => { data[(((y % h) + h) % h) * w + (((x % w) + w) % w)] = c; };
    for (let k = 0; k < (sk.cracks || 6); k++) {
      let x = Math.floor(rng() * w), y = Math.floor(rng() * h);
      const len = 14 + Math.floor(rng() * 26);
      let dx = rng() < 0.5 ? -1 : 1;
      for (let i = 0; i < len; i++) {
        const lit = ((i + k * 5) % 9) < 6;
        if (lit) { set(x, y - 1, halo); set(x, y + 1, halo); }
        set(x, y, lit ? core : mid);
        if (lit && rng() < 0.07) set(x, y, hot);
        const r = rng();
        if (r < 0.5) x += dx; else if (r < 0.78) y += 1; else if (r < 0.96) y -= 1;
        if (rng() < 0.12) dx = -dx;
      }
    }
    const ash = Terrain.rgb32('#6a5460'), ember = Terrain.rgb32('#ff8a30');
    for (let i = 0; i < w * h * 0.012; i++) data[Math.floor(rng() * w * h)] = rng() < 0.3 ? ember : ash;
    return { w, h, data };
  };

  /* =====================================================================
   * WORLD LAYOUT (data shared by terrain, decoration and script)
   * ===================================================================== */
  const BOSS_X = 4000;
  const LEN = BOSS_X + W + 120;
  const BASE = 36; // lowest floor (lava lakes / valleys)
  const MIN_CLEAR = 98; // trees are only planted where at least this much air stays above them

  // hanging volcanoes: flat rim with a crater bowl at the tip (the tip points DOWN)
  const VOLCS = [
    { cx: 610, w: 250, rim: 84, cw: 30, cd: 12 },
    { cx: 1520, w: 260, rim: 96, cw: 32, cd: 12 },
    { cx: 1830, w: 250, rim: 88, cw: 32, cd: 12 },
    { cx: 2150, w: 260, rim: 92, cw: 34, cd: 13 },
    { cx: 3730, w: 250, rim: 92, cw: 32, cd: 12 },
  ];
  const volcFeature = (v) => {
    const r = v.w / 2, rimW = v.cw / 2 + 7;
    return {
      type: 'fn', x0: v.cx - r, x1: v.cx + r,
      fn: (x) => {
        const dx = Math.abs(x - v.cx);
        let h;
        if (dx <= rimW) h = v.rim;
        else {
          const t = (dx - rimW) / (r - rimW);
          h = v.rim * Math.pow(1 - t, v.p || 1.6);
          h += (vnoise(x * 0.085, v.cx * 0.013) - 0.5) * 15 * Math.min(1, t * 3) * (1 - t);   // craggy flanks
        }
        if (dx < v.cw / 2) { const u = dx / (v.cw / 2); h -= v.cd * (1 - u * u); }
        return h;
      },
    };
  };

  // lava streams / pools painted on the floor where the ground is low: [x0, x1]
  const LAVA = [
    [858, 942], [1062, 1140], [1256, 1338],
    [1450, 1620], [2030, 2350], [2960, 3090], [3440, 3880], [3990, LEN],
  ];
  // forest zones: burnt state by x
  const forestState = (x) => (x < 690 ? 'lush' : x < 1420 ? 'burn' : 'char');

  // ground enemies / geysers are registered here so the forest keeps clearings around them
  const GROUND = [];
  const ground = (wx, type, o) => { GROUND.push([wx, type, o || {}]); };

  const FLOOR = [
    { type: 'flat', x0: 0, x1: LEN, h: BASE },
    // A: gentle, lush start
    { type: 'hill', x: 270, w: 230, h: 52, shape: 'cos' },
    { type: 'hill', x: 480, w: 170, h: 70, shape: 'cos' },
    // B: tall burning forest hills
    { type: 'hill', x: 790, w: 230, h: 90, shape: 'cos' },
    { type: 'hill', x: 1005, w: 190, h: 100, shape: 'cos' },
    { type: 'hill', x: 1195, w: 200, h: 84, shape: 'cos' },
    { type: 'hill', x: 1385, w: 170, h: 96, shape: 'cos' },
    // C: hills between the hanging volcanoes
    { type: 'hill', x: 1522, w: 150, h: 43, shape: 'cos' },
    { type: 'hill', x: 1690, w: 200, h: 80, shape: 'cos' },
    { type: 'hill', x: 1835, w: 150, h: 46, shape: 'cos' },
    { type: 'hill', x: 2000, w: 150, h: 68, shape: 'cos' },
    // hall (mid-boss) forest
    { type: 'hill', x: 2440, w: 190, h: 50, shape: 'cos' },
    { type: 'hill', x: 2640, w: 200, h: 58, shape: 'cos' },
    { type: 'hill', x: 2830, w: 190, h: 52, shape: 'cos' },
    { type: 'hill', x: 3210, w: 200, h: 64, shape: 'cos' },
    { type: 'hill', x: 3400, w: 150, h: 74, shape: 'cos' },
    // arena floor (flat & calm)
    { type: 'flat', x0: 3990, x1: LEN, h: 38 },
  ];
  // craggy silhouettes: the rounded hills get a little rocky roughness on top (not the two squeeze hills under the volcano tips)
  const HILL_FNS = FLOOR.filter((f) => f.type === 'hill' && f.x !== 1522 && f.x !== 1835).map((f) => Terrain.FEATURES.hill(f));
  FLOOR.push({
    type: 'fn', x0: 300, x1: 3520,
    fn: (x) => {
      let h = 0;
      for (const fn of HILL_FNS) h = Math.max(h, fn(x));
      if (h <= BASE + 4) return 0;
      const k = Math.min(1, (h - BASE - 4) / 12);
      return h + (vnoise(x * 0.09, 3.7) * 0.7 + vnoise(x * 0.31, 9.1) * 0.3) * 5 * k;
    },
  });
  const CEIL = [
    { type: 'hill', x: 196, w: 40, h: 20, shape: 'tri' },
    { type: 'hill', x: 248, w: 46, h: 32, shape: 'tri' },
    { type: 'hill', x: 298, w: 40, h: 24, shape: 'tri' },
    { type: 'noise', x0: 330, x1: 520, base: 30, amp: 10, scale: 46, seed: 21, edge: 90 },
    { type: 'hill', x: 900, w: 190, h: 50, shape: 'mesa', top: 0.45 },
    { type: 'hill', x: 1105, w: 150, h: 44, shape: 'mesa', top: 0.45 },
    { type: 'hill', x: 1298, w: 160, h: 46, shape: 'mesa', top: 0.45 },
    { type: 'noise', x0: 2420, x1: 3480, base: 46, amp: 6, scale: 60, seed: 25, edge: 110 },
    { type: 'slope', x0: 3900, x1: 3990, h0: 0, h1: 22 },
    { type: 'flat', x0: 3990, x1: LEN, h: 22 },
  ].concat(VOLCS.map(volcFeature));

  /* ---- forest planting: decided once per terrain build, used for the solid mask AND the paint ---- */
  let PLAN = { trees: [], burning: [] };
  const TREE_SETS = {
    lush: [['s4_pine_a', 3], ['s4_pine_b', 3], ['s4_pine_c', 2], ['s4_cedar_a', 1.4], ['s4_cedar_b', 1.2], ['s4_bush_a', 1], ['s4_bush_b', 1]],
    burn: [['s4_spine_a', 3], ['s4_spine_b', 3], ['s4_spine_c', 2], ['s4_scedar_a', 1], ['s4_sbush', 1], ['s4_snag_b', 1.2], ['s4_snag_c', 1]],
    char: [['s4_snag_a', 2], ['s4_snag_b', 2.4], ['s4_snag_c', 2.4], ['s4_sbush', 1.6], ['s4_spine_a', 0.8]],
  };
  const TREE_SMALL = {
    lush: [['s4_pine_a', 3], ['s4_bush_a', 1.5], ['s4_bush_b', 1.5]],
    burn: [['s4_spine_a', 3], ['s4_sbush', 2], ['s4_snag_c', 1.5]],
    char: [['s4_snag_c', 2], ['s4_sbush', 2]],
  };
  const inZone = (list, x, pad) => list.some((z) => x >= z[0] - pad && x <= z[1] + pad);

  /* which columns carry lava: 1 = pool (low floor inside a LAVA zone), 2 = stream running down a hill flank */
  let LAVACOL = new Uint8Array(LEN);
  function computeLava(T) {
    LAVACOL = new Uint8Array(LEN);
    for (const [z0, z1] of LAVA) {
      for (let x = Math.max(0, Math.floor(z0)); x <= Math.min(LEN - 1, z1); x++) if (T.floorH[x] <= BASE + 3) LAVACOL[x] = 1;
    }
    for (const [z0, z1] of LAVA) {
      for (const dir of [-1, 1]) {
        let x = dir < 0 ? Math.floor(z0) - 1 : Math.ceil(z1) + 1, prev = BASE, n = 0;
        if (z1 >= LEN - 1 && dir > 0) continue;
        while (x > 0 && x < LEN && n < 44) {
          const fh = T.floorH[x];
          if (fh <= BASE + 3 || fh < prev - 0.5 || fh > BASE + 60 || LAVACOL[x]) break;
          LAVACOL[x] = 2;
          prev = fh; x += dir; n++;
        }
      }
    }
  }

  function plantForest(T) {
    const rng = makeRng(2024);
    const trees = [], burning = [];
    const surf = (x) => H - Math.round(T.floorH[Math.max(0, Math.min(LEN - 1, x))]);
    const ceilB = (x) => Math.round(T.ceilH[Math.max(0, Math.min(LEN - 1, x))]);
    const clear = GROUND.map((g) => [g[0], g[0]]);
    const dens = { lush: 8, burn: 9, char: 17 };
    let x = 60, cluster = 0;
    while (x < 3960) {
      const st = forestState(x);
      if (cluster > 0) { cluster--; x += 4 + rng() * 5; }
      else if (rng() < 0.28) { cluster = 2 + Math.floor(rng() * 4); x += 4 + rng() * 5; }
      else x += dens[st] * (0.6 + rng() * 1.3) + (rng() < 0.12 ? 12 + rng() * 22 : 0);
      const ix = Math.round(x);
      const fh = T.floorH[ix];
      if (fh < 30 || LAVACOL[ix] || LAVACOL[ix - 5] || LAVACOL[ix + 5] || inZone(clear, ix, 15)) continue;
      const slope = (surf(ix + 5) - surf(ix - 5)) / 10;
      if (Math.abs(slope) > 2.3) continue;
      // pick a kind (weighted), then shrink until the air gap under the ceiling is kept; steep flanks only get small growth
      const set = Math.abs(slope) > 1.3 ? TREE_SMALL[st] : TREE_SETS[st];
      let tot = 0;
      for (const k of set) tot += k[1];
      let r = rng() * tot, pick = set[0][0];
      for (const k of set) { r -= k[1]; if (r <= 0) { pick = k[0]; break; } }
      const yb = Math.max(surf(ix - 2), surf(ix - 1), surf(ix), surf(ix + 1), surf(ix + 2)) + 1;
      const order = st === 'lush' ? [pick, 's4_pine_a', 's4_bush_b'] : [pick, 's4_spine_a', 's4_sbush', 's4_snag_c'];
      let use = null;
      for (const nme of order) {
        const sz = Sprites.size(nme);
        let cmax = 0;
        for (let k = ix - (sz.w >> 1); k <= ix + (sz.w >> 1); k++) cmax = Math.max(cmax, ceilB(k));
        if (yb - sz.h - cmax >= MIN_CLEAR) { use = nme; break; }
      }
      if (!use) continue;
      const sz = Sprites.size(use);
      const t = { name: use, x0: ix - (sz.w >> 1), y0: yb - sz.h, cx: ix, yb };
      trees.push(t);
      if (st === 'burn' && /^s4_spine|^s4_scedar/.test(use) && rng() < 0.55) {
        burning.push({ wx: ix, y: t.y0 + Math.round(sz.h * 0.62), size: use === 's4_spine_c' ? 'l' : use === 's4_spine_b' || use === 's4_scedar_a' ? 'm' : 's' });
      }
    }
    trees.sort((a, b) => a.yb - b.yb || a.x0 - b.x0);
    PLAN = { trees, burning };
  }

  /* ---- decoration painters (run once on the finished terrain canvas) ---- */
  const hash2 = (x, y) => {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerpN(lerpN(a, b, u), lerpN(c, d, u), v);
  };
  const px = (g, x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };

  function paintLava(g, T) {
    const rows = ['#ffb03a', '#ffe070', '#ffb038', '#ff8a24', '#e85a1c', '#c03a18', '#8a2418', '#5a1616'];
    for (let x = 0; x < LEN; x++) {
      const kind = LAVACOL[x];
      if (!kind) continue;
      const fh = T.floorH[x];
      const y0 = H - Math.round(fh);
      const depth = kind === 1 ? Math.min(rows.length, fh - 2) : 4;
      for (let k = 0; k < depth; k++) {
        let col = rows[k];
        if (k >= 2) {
          const n = vnoise(x * 0.16 + k * 3.1, k * 0.9) + 0.5 * vnoise(x * 0.4, k * 1.7);
          if (n > 1.0 && k >= 3) col = '#4a1412';            // cooled crust plates
          else if (n > 0.92 && k >= 3) col = '#ff6a1c';       // crust edge glow
          else if (n < 0.28 && k < 5) col = '#ffe070';         // hot flecks
        }
        px(g, x, y0 + k, col);
      }
      // heat glow above the surface
      const gl = kind === 1 ? 9 : 5;
      for (let k = 1; k <= gl; k++) {
        g.fillStyle = 'rgba(255,120,40,' + ((kind === 1 ? 0.2 : 0.16) * (1 - k / (gl + 1))).toFixed(3) + ')';
        g.fillRect(x, y0 - k, 1, 1);
      }
    }
  }

  function paintMoss(g, T) {
    const surf = (x) => H - Math.round(T.floorH[Math.max(0, Math.min(LEN - 1, x))]);
    const PAL = {
      lush: ['#c8ec52', '#6cb83e', '#2f8a3a', '#1c5a30'],
      burn: ['#b8a040', '#7a6a30', '#4a3c26', '#2e2420'],
      char: ['#9a8888', '#66565a', '#40343a', '#2a2026'],
    };
    for (let x = 0; x < LEN; x++) {
      const fh = T.floorH[x];
      if (fh < 30 || LAVACOL[x]) continue;
      if (x > 3990) continue;
      const y0 = surf(x);
      const slope = Math.abs(surf(x + 2) - surf(x - 2)) / 4;
      const th = slope > 1.5 ? 1 : slope > 0.9 ? 2 : 4;
      const pal = PAL[forestState(x)];
      for (let k = 1; k <= th; k++) {
        const c = pal[Math.min(pal.length - 1, k - 1 + (hash2(x, k) < 0.22 && k > 1 ? 1 : 0))];
        px(g, x, y0 + k, c);
      }
      if (th >= 3 && (x & 3) === 0) px(g, x, y0 + th + 1, pal[3]);
      // ember sprinkle on burnt ground
      if (forestState(x) !== 'lush' && hash2(x, 99) < 0.05) px(g, x, y0 + 1 + (hash2(x, 5) < 0.5 ? 1 : 0), hash2(x, 6) < 0.5 ? '#ff8a2c' : '#ffd04a');
    }
  }

  function paintCraters(g, T) {
    for (const v of VOLCS) {
      const bot = (x) => T.ceilBotArr[Math.max(0, Math.min(LEN - 1, x))];
      const r = v.w / 2;
      // lava lining of the bowl (its roof) + hot rim
      for (let dx = -Math.ceil(v.cw / 2) - 2; dx <= Math.ceil(v.cw / 2) + 2; dx++) {
        const x = v.cx + dx;
        const yb = bot(x);
        const inBowl = Math.abs(dx) < v.cw / 2;
        const cols = inBowl ? ['#ffe070', '#ffb038', '#ff8a24', '#e85a1c', '#a82818'] : ['#ff8a24', '#e85a1c', '#a82818'];
        for (let k = 0; k < cols.length; k++) px(g, x, yb - 1 - k, cols[k]);
      }
      // hot glow spilling out of the crater
      for (let dx = -Math.ceil(v.cw / 2) - 14; dx <= Math.ceil(v.cw / 2) + 14; dx++) {
        const x = v.cx + dx, yb = bot(x);
        const f = 1 - Math.abs(dx) / (v.cw / 2 + 15);
        for (let d = 5; d < 15; d++) {
          g.fillStyle = 'rgba(255,110,30,' + (0.34 * f * (1 - (d - 5) / 10)).toFixed(3) + ')';
          g.fillRect(x, yb - 1 - d, 1, 1);
        }
      }
      // glowing ridge lines following the flanks (lava climbs UP the inverted cone)
      for (const side of [-1, 1]) {
        for (const [inset, col, len] of [[4, '#e85a1c', 0.5], [8, '#a82818', 0.42]]) {
          for (let d = v.cw / 2 + 3; d < r * len + v.cw / 2; d++) {
            const x = Math.round(v.cx + side * d);
            const y = bot(x) - inset - Math.floor(vnoise(x * 0.12, inset) * 3);
            if (y < 2) continue;
            px(g, x, y, hash2(x, inset) < 0.15 ? '#ffd04a' : col);
            if (hash2(x, inset + 3) < 0.35) px(g, x, y - 1, col);
          }
        }
      }
    }
  }

  /* the mid-boss hall: riveted iron plating replaces the basalt of the ceiling */
  const HALL = [2450, 3480];
  function paintHall(g, T) {
    const pw = 44;
    for (let x = HALL[0]; x <= HALL[1]; x++) {
      const yb = T.ceilBotArr[x];
      if (yb < 30) continue;
      const pi = Math.floor((x - HALL[0]) / pw), u = (x - HALL[0]) % pw;
      const base = ['#2b2833', '#332e3c', '#3a3444', '#2f2b38'][pi & 3];
      for (let y = 0; y < yb - 3; y++) {
        let col = base;
        if (u === 0) col = '#0e0c14';
        else if (u === 1) col = '#5a4a5c';
        else if (y === yb - 4) col = '#0e0c14';
        else if (y === 0) col = '#5a4a5c';
        else if ((u === 5 || u === pw - 5) && (y === 5 || y === yb - 9)) col = '#a89aa0';
        else if ((u === 6 || u === pw - 4) && (y === 6 || y === yb - 8)) col = '#0e0c14';
        else if (y === Math.round(yb * 0.45)) col = '#16121c';
        else if (y === Math.round(yb * 0.45) + 1) col = '#4e4054';
        else if (hash2(x >> 1, y >> 1) < 0.05) col = '#584860';
        else if (hash2(x, y >> 2) < 0.03) col = '#6a3a24';
        if (pi % 3 === 1 && u >= 14 && u <= 30 && y >= yb - 13 && y <= yb - 10) col = y === yb - 12 || y === yb - 11 ? '#ffb040' : '#8a3a18';
        if (pi % 3 === 1 && u >= 15 && u <= 29 && y === yb - 11) col = '#ffe070';
        px(g, x, y, col);
      }
    }
  }

  /* soft volumetric shading of the ceiling rock: dark toward the underside, lit left flanks */
  function shadeCeiling(g, T) {
    const bot = (x) => T.ceilBotArr[Math.max(0, Math.min(LEN - 1, x))];
    for (let x = 0; x < LEN; x++) {
      const yb = bot(x);
      if (yb <= 5) continue;
      const slope = (bot(x + 3) - bot(x - 3)) / 6;
      for (let d = 1; d <= 14; d++) {
        const y = yb - 1 - d;
        if (y < 0) break;
        const f = 1 - (d - 1) / 14;
        let col;
        if (slope > 0.35) col = 'rgba(255,196,150,' + (0.11 * f).toFixed(3) + ')';
        else col = 'rgba(0,0,0,' + (0.3 * f * f + (slope < -0.35 ? 0.16 * f : 0)).toFixed(3) + ')';
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  }

  function paintTrees(g) {
    for (const t of PLAN.trees) g.drawImage(Sprites.get(t.name, 0), t.x0, t.y0);
  }

  /* =====================================================================
   * BACKGROUND
   * ===================================================================== */
  // far inverted volcanoes hanging from the top of the sky (parallax strip)
  const farHang = (P) => {
    const d = new Sprites.Painter(P, H, {});
    const cones = [[50, 70, 78], [180, 92, 104], [318, 66, 70], [440, 84, 94]];
    for (const [cx, w, dep] of cones) {
      for (let x = cx - w; x <= cx + w; x++) {
        const t = Math.abs(x - cx) / w;
        const bot = Math.round(dep * Math.pow(1 - t, 1.25));
        const X = ((x % P) + P) % P;
        d.rect(X, 0, 1, bot + 1, x < cx ? '#7c2244' : '#5a1634');
        if (bot > 3) d.px(X, bot, x < cx ? '#f0703a' : '#b83a34');
      }
      d.rect(cx - 3, dep - 1, 6, 2, '#ffb050');
      d.rect(cx - 1, dep + 1, 2, 3, '#ffd070');
      for (let k = 0; k < 3; k++) d.vline(cx - 5 + k * 5, dep + 3, dep + 6 + k * 2, '#ff8a3a');
    }
    return d.c;
  };
  // far dark pine forest along the bottom horizon
  const farForest = (P) => {
    const d = new Sprites.Painter(P, H, {});
    const rng = makeRng(17);
    for (let x = 0; x < P; x += 5 + Math.floor(rng() * 4)) {
      const hgt = 20 + Math.floor(rng() * 26), base = H - 26;
      const hw = 5 + Math.floor(rng() * 3);
      for (let j = 0; j < hgt; j++) {
        const t = j / hgt;
        const w = Math.max(0, Math.round(hw * Math.min(1, t * 1.15) * (0.85 + 0.15 * ((j % 6) < 3 ? 1 : 0))));
        for (let dx = -w; dx <= w; dx++) {
          const X = (((x + dx) % P) + P) % P;
          d.px(X, base - hgt + j, dx < -w * 0.35 ? '#50285a' : '#34183e');
        }
      }
      d.rect(x, base, 2, 8, '#2a1234');
    }
    d.rect(0, H - 26, P, 30, '#2a1234');
    return d.c;
  };
  // smoke rising from the burning forest: baked dithered discs, drawn with fading alpha
  [4, 6, 8, 10, 12].forEach((r, k) => {
    Sprites.painted('s4_smoke_' + k, r * 2 + 3, r * 2 + 3, 1, (d) => {
      const c = r + 1;
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const q = Math.sqrt(x * x + y * y);
          if (q > r + 0.3) continue;
          const solid = q < r * 0.45;
          if (solid || ((x + y) & 1) === 0 || (q < r * 0.75 && ((x * 3 + y) & 3) === 0)) d.px(c + x, c + y, solid ? '#8a4262' : '#7a3a5c');
        }
      }
    });
  });
  const SMOKE = (() => {
    const rng = makeRng(31);
    return Array.from({ length: 13 }, () => ({ x: rng() * (W + 80), y: rng() * 160, v: 0.1 + rng() * 0.14, par: 0.3 + rng() * 0.1, ph: rng() * TAU }));
  })();
  const drawSmoke = (ctx, camX, t) => {
    for (const s of SMOKE) {
      const life = ((t * s.v + s.y) % 160) / 160;
      const k = Math.min(4, Math.floor(life * 5));
      const y = 194 - life * 120;
      const x = ((((s.x - camX * s.par + life * 16 + Math.sin(t * 0.02 + s.ph) * 4) % (W + 80)) + W + 80) % (W + 80)) - 40;
      Sprites.draw(ctx, 's4_smoke_' + k, Math.round(x), Math.round(y), { alpha: Math.min(1, (1 - life) * 1.6) * 0.32 });
    }
  };

  // rising embers
  const EMBERS = (() => {
    const rng = makeRng(77);
    return Array.from({ length: 58 }, () => ({ x: rng() * (W + 40), y: rng() * H, v: 0.14 + rng() * 0.5, ph: rng() * TAU, par: 0.06 + rng() * 0.32, sz: rng() < 0.18 ? 2 : 1, c: Math.floor(rng() * 3) }));
  })();
  const drawEmbers = (ctx, camX, t) => {
    const cols = ['#ffd070', '#ff8a30', '#ff5a24'];
    for (const e of EMBERS) {
      const y = ((((e.y - t * e.v) % (H + 12)) + H + 12) % (H + 12)) - 6;
      const x = ((((e.x - camX * e.par + Math.sin(t * 0.03 + e.ph) * 5) % (W + 40)) + W + 40) % (W + 40)) - 20;
      if (Math.sin(t * 0.13 + e.ph * 3) < -0.7) continue;
      ctx.fillStyle = cols[(e.c + (y < H * 0.4 ? 1 : 0)) % 3];
      ctx.fillRect(x | 0, y | 0, e.sz, e.sz);
    }
  };

  /* =====================================================================
   * ENEMIES
   * ===================================================================== */
  const EMBER_COLS = ['#ffe646', '#ff9424', '#f03a3a', '#ffd430', '#ffb040'];

  /** lava splash where a rock (or bomb) hits the ground: flash + spreading embers */
  function s4_splash(x, y, n) {
    G.explode(x, y, 's', { quiet: true, scroll: true });
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.1 + 0.8 * Math.random());
      const sp = 0.6 + Math.random() * 1.7;
      G.fx.push({ k: 'part', x: x + rnd(-3, 3), y: y - 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rndi(20, 42), t: 0, col: pick(EMBER_COLS), big: chance(0.35), scroll: true });
    }
  }

  /* ---- molten rock: falls out of a crater with gravity ---- */
  ENEMIES.s4_rock = {
    w: 7, h: 7, hp: 1, score: 10, fps: 4, expl: 's',
    spr: () => 's4_rock',
    init(e, o) {
      e.hy = 2;
      e.vx = (o.vx !== undefined ? o.vx : rnd(-0.7, 0.7)) - G.camSpeed;
      e.vy = o.vy !== undefined ? o.vy : rnd(0.9, 1.7);
      e.g = o.g !== undefined ? o.g : 0.032;
    },
    update(e) {
      e.vy = Math.min(e.vy + e.g, 3.6);
      if (e.t > 5 && G.terrain.solid(G.camX + e.x, e.y + e.hy + 4)) {
        e.dead = true;
        s4_splash(e.x, e.y + 5, 9);
      }
    },
  };

  /* ---- crater vent in the ceiling: glows, then rains rocks downward ---- */
  ENEMIES.s4_vent = {
    w: 24, h: 8, hp: 1, score: 0, ghost: true, harmless: true, attach: 'ceil', sink: 0,
    init(e, o) {
      e.roofY = G.terrain.ceilBottom(e.wx);
      e.y = e.roofY + 4;
      e.cd = o.first !== undefined ? o.first : 60 + rndi(0, 30);
      e.every = o.every || 150;
      e.burst = o.burst || 3;
      e.warn = 0;
      e.jet = 0;
      e.flipY = false;
    },
    update(e) {
      const seen = e.x > 22 && e.x < W - 10;
      if (e.jet > 0) e.jet--;
      if (e.warn > 0) {
        if (--e.warn === 0) {
          sfx('eruption');
          G.shake = Math.max(G.shake, 1.7);
          e.jet = 18;
          for (let i = 0; i < e.burst; i++) {
            const aimed = e.o.aim && i === e.burst - 1;
            G.later(i * 6, () => {
              if (e.dead) return;
              const o = { x: e.x + rnd(-5, 5), y: e.roofY + 9 };
              if (aimed && G.player.alive && e.x > G.player.x + 50) {
                // one lobbed rock that comes down where you are now
                o.vy = 1.3;
                o.vx = clamp((G.player.x - o.x) / 52, -1.8, 0.6) + G.camSpeed;
              }
              G.spawn('s4_rock', o);
            });
          }
          e.cd = G.fireDelay(e.every) + rndi(0, 40);
        }
      } else if (--e.cd <= 0) {
        if (seen && G.player.alive) e.warn = 40;
        else e.cd = 24;
      }
    },
    draw(e, c) {
      let fr = 0;
      if (e.warn > 0) fr = e.warn > 14 ? ((e.warn >> 2) & 1) : 2;
      else if (e.jet > 0) fr = 2;
      else fr = (e.t >> 5) & 1 ? 1 : 0;
      Sprites.draw(c, 's4_vent', e.x, e.roofY + 6, { frame: fr });
      if (e.jet > 0) Sprites.draw(c, 's4_flame_m', e.x, e.roofY + 18, { frame: (e.t >> 1) & 3, flipY: true, alpha: Math.min(1, e.jet / 8) });
    },
  };

  /* ---- floor geyser: blinks, then a lava column shoots up (invulnerable moving obstacle) ---- */
  const GEY = { warn: 48, up: 11, hold: 46, down: 16 };
  ENEMIES.s4_geyser = {
    w: 9, h: 8, hp: 50, score: 0, attach: 'floor', sink: 0, ghost: true, harmless: true,
    init(e, o) {
      const T = G.terrain;
      e.base = T.floorTop(e.wx);
      e.y = e.base;
      e.colMax = Math.max(26, Math.min(o.h || 74, e.base - T.ceilBottom(e.wx) - 60));
      e.period = o.period || 210;
      e.ph = 'idle';
      e.pt = o.delay !== undefined ? o.delay : 40;
      e.colH = 0;
    },
    update(e) {
      e.pt--;
      const vis = e.x > 10 && e.x < W - 6;
      if (e.ph === 'idle') {
        if (e.pt <= 0) {
          if (vis && G.player.alive) { e.ph = 'warn'; e.pt = GEY.warn; } else e.pt = 12;
        }
      } else if (e.ph === 'warn') {
        if (e.pt <= 0) {
          e.ph = 'up'; e.pt = GEY.up;
          e.ghost = false; e.harmless = false; e.invuln = true;
          sfx('eruption');
          G.shake = Math.max(G.shake, 1.2);
        }
      } else if (e.ph === 'up') {
        e.colH = e.colMax * Math.pow(1 - e.pt / GEY.up, 0.6);
        if (e.pt <= 0) { e.ph = 'hold'; e.pt = GEY.hold; }
      } else if (e.ph === 'hold') {
        e.colH = e.colMax;
        if (((e.t + 3) & 3) === 0) {
          G.fx.push({ k: 'part', x: e.x + rnd(-4, 4), y: e.base - e.colH, vx: rnd(-0.9, 0.9), vy: -rnd(0.3, 1.4), life: rndi(18, 32), t: 0, col: pick(EMBER_COLS), big: chance(0.3), scroll: true });
        }
        if (e.pt <= 0) { e.ph = 'down'; e.pt = GEY.down; }
      } else {
        e.colH = e.colMax * (e.pt / GEY.down);
        if (e.pt <= 0) {
          e.ph = 'idle'; e.colH = 0;
          e.pt = Math.max(30, e.period - GEY.warn - GEY.up - GEY.hold - GEY.down);
          e.ghost = true; e.harmless = true; e.invuln = false;
        }
      }
      const hh = Math.max(4, e.colH);
      e.h = hh;
      e.hy = -hh / 2;
    },
    draw(e, c) {
      let fr = 0;
      if (e.ph === 'warn') fr = e.pt < 18 ? ((e.pt >> 1) & 1 ? 2 : 1) : ((e.pt >> 2) & 1 ? 1 : 0);
      else if (e.ph !== 'idle') fr = 2;
      Sprites.draw(c, 's4_gbase', e.x, e.base - 3.5, { frame: fr });
      if (e.ph === 'warn' && e.pt < GEY.warn - 6) {
        // spurts of lava hopping out of the crack
        for (let i = 0; i < 3; i++) {
          const ph = ((e.t * 0.09 + i * 0.37) % 1);
          c.fillStyle = i === 1 ? '#ffe070' : '#ff8a24';
          c.fillRect(Math.round(e.x - 5 + i * 5), Math.round(e.base - 3 - Math.sin(ph * Math.PI) * (5 + (GEY.warn - e.pt) * 0.1)), 1, 1 + (i & 1));
        }
      }
      if (e.ph === 'warn' && e.pt < 20) {
        const hh = Math.round((20 - e.pt) * 0.02 * e.colMax * 0.9);
        c.fillStyle = (e.t >> 1) & 1 ? '#ffe070' : '#ff8a24';
        c.fillRect(Math.round(e.x) - 1, Math.round(e.base - 3 - hh), 2, hh);
      }
      if (e.colH > 1.5) {
        const cx = Math.round(e.x), top = e.base - e.colH;
        const n = Math.ceil(e.colH);
        Sprites.draw(c, 's4_glow_1', cx, e.base - 4, { alpha: 0.26 });
        Sprites.draw(c, 's4_glow_1', cx, top + 4, { alpha: 0.2 });
        for (let i = 0; i < n; i++) {
          const y = Math.round(e.base - 1 - i);
          const wob = Math.round(Math.sin(i * 0.33 + e.t * 0.35) * 1.0);
          const flare = i < 7 ? 1 + ((7 - i) >> 2) : 0;
          const hw = 4 + flare;
          c.fillStyle = '#6a1006';
          c.fillRect(cx - hw - 1 + wob, y, 1, 1);
          c.fillRect(cx + hw + 1 + wob, y, 1, 1);
          c.fillStyle = '#e0481a';
          c.fillRect(cx + hw - 2 + wob, y, 3, 1);
          c.fillStyle = '#ff8a24';
          c.fillRect(cx - hw + wob, y, hw * 2 - 2, 1);
          c.fillStyle = '#ffc040';
          c.fillRect(cx - hw + 1 + wob, y, hw - 1, 1);
          c.fillStyle = ((i + (e.t >> 1)) % 11) < 5 ? '#fff6c0' : '#ffe070';
          c.fillRect(cx - 2 + wob, y, 3, 1);
        }
        Sprites.draw(c, 's4_gtop', cx, top + 2, { frame: (e.t >> 2) & 1 });
      }
    },
  };

  /* ---- wisp: ghost fire drifting in sine paths ---- */
  ENEMIES.s4_wisp = {
    w: 11, h: 10, hp: 1, score: 100, fps: 4, expl: 's',
    spr: (e) => (e.carry ? 's4_wisp_c' : 's4_wisp'),
    init(e, o) {
      e.hx = -2;
      e.vx = -(o.speed || 1.25);
      e.base = e.y;
      e.amp = o.amp !== undefined ? o.amp : 28;
      e.freq = o.freq || 0.05;
      e.ph = o.phase || 0;
      e.hist = [];
    },
    update(e) {
      e.y = e.base + Math.sin(e.t * e.freq + e.ph) * e.amp + Math.sin(e.t * e.freq * 0.37 + e.ph * 2) * 5;
      if (e.t % 3 === 0) {
        e.hist.unshift(e.x, e.y);
        if (e.hist.length > 12) e.hist.length = 12;
      }
      if (e.o.shoot && e.t % e.o.shoot === e.o.shoot - 1 && G.canFire(e)) {
        const [vx, vy] = G.aim(e.x, e.y, 1.25);
        G.ebullet(e.x, e.y, vx, vy);
      }
    },
    draw(e, c) {
      const col = e.carry ? '#ff8a24' : '#48ecf4';
      for (let i = 0; i < e.hist.length; i += 2) {
        c.globalAlpha = 0.5 - i * 0.04;
        c.fillStyle = col;
        const s = i < 4 ? 2 : 1;
        c.fillRect(Math.round(e.hist[i] + 5 + i), Math.round(e.hist[i + 1] - 1), s, s);
      }
      c.globalAlpha = 1;
      Sprites.draw(c, e.carry ? 's4_wisp_c' : 's4_wisp', e.x, e.y, { frame: (e.t >> 2) & 3, flash: e.flash > 0 });
    },
  };

  /* ---- lava beetle: walks upside-down along the ceiling and spits globs ---- */
  ENEMIES.s4_crawler = {
    w: 16, h: 11, hp: 3, score: 250, fps: 6, attach: 'ceil', expl: 'm', sink: 2,
    spr: (e) => (e.carry ? 's4_crawler_c' : 's4_crawler'),
    init(e, o) {
      e.dir = o.dir !== undefined ? o.dir : -1;
      e.speed = o.speed || 0.3;
      e.turnCd = 0;
      e.cd = 70 + rndi(0, 60);
    },
    update(e) {
      const T = G.terrain;
      e.wx += e.dir * e.speed;
      const here = T.ceilBottom(e.wx), ahead = T.ceilBottom(e.wx + e.dir * 10);
      if (e.turnCd > 0) e.turnCd--;
      else if (Math.abs(ahead - here) > 5) { e.dir = -e.dir; e.turnCd = 50; }
      e.y += (here + e.h / 2 - 2 - e.y) * 0.4;
      e.flipX = e.dir > 0;
      if (--e.cd <= 0) {
        const P = G.player;
        if (G.canFire(e) && e.x > 24 && P.y > e.y + 12) {
          const [vx, vy] = G.aim(e.x, e.y + 5, 1.3);
          G.ebullet(e.x, e.y + 5, vx, Math.max(0.5, vy), { spr: 's4_glob', w: 5, h: 5, ay: 0.012, anim: 8 });
        }
        e.cd = G.fireDelay(e.o.rate || 140) + rndi(0, 40);
      }
    },
  };

  /* ---- stalactite trap: shakes when you pass beneath, then drops ---- */
  ENEMIES.s4_stal = {
    w: 9, h: 21, hp: 2, score: 150, attach: 'ceil', expl: 'm', sink: 0,
    spr: () => 's4_stal',
    init(e, o) {
      e.flipY = false;
      e.st = 0;
      e.arm = o.arm || 70;
      e.shake = 0;
    },
    update(e) {
      const P = G.player;
      if (e.st === 0) {
        e.frame = 0;
        if (P.alive && Math.abs(P.x - e.x) < e.arm && e.x > 24 && e.x < W - 12) { e.st = 1; e.shake = 34; sfx('stomp'); }
      } else if (e.st === 1) {
        e.frame = (e.t >> 2) & 1;
        if (--e.shake <= 0) {
          e.st = 2;
          e.attach = null;
          e.vx = -G.camSpeed;
          e.vy = 0.4;
        } else if ((e.t & 3) === 0) {
          G.fx.push({ k: 'part', x: e.x + rnd(-4, 4), y: e.y - 8, vx: rnd(-0.3, 0.3), vy: rnd(0.2, 0.8), life: rndi(14, 24), t: 0, col: '#6a5460', big: false, scroll: false });
        }
      } else {
        e.frame = 1;
        e.vy = Math.min(e.vy + 0.12, 4.4);
        if (G.terrain.solid(G.camX + e.x, e.y + 11)) {
          e.dead = true;
          s4_splash(e.x, e.y + 10, 6);
        }
      }
    },
    draw(e, c) {
      const jx = e.st === 1 ? ((e.t >> 1) & 1 ? 1 : -1) : 0;
      Sprites.draw(c, 's4_stal', e.x + jx, e.y, { frame: e.frame || 0, flash: e.flash > 0 });
    },
  };


  /* ---- bomb lobbed by the Iron Maiden: lands, splashes, throws an ember fan ---- */
  ENEMIES.s4_bomb = {
    w: 9, h: 9, hp: 2, score: 100, fps: 7, expl: 's',
    spr: () => 's4_bomb',
    init(e, o) {
      e.vx = o.vx !== undefined ? o.vx : -1;
      e.vy = o.vy !== undefined ? o.vy : -1;
      e.g = 0.055;
    },
    update(e) {
      e.vy += e.g;
      if (e.t > 8 && G.terrain.solid(G.camX + e.x, e.y + 6)) {
        e.dead = true;
        s4_splash(e.x, e.y + 5, 9);
        sfx('explodeS');
        if (G.player.alive) {
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI * (0.16 + 0.68 * (i / 4));
            const sp = 1.5 + Math.random() * 0.5;
            G.ebullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, { spr: 's4_ember', w: 4, h: 4, ay: 0.05, life: 70, quiet: i > 0 });
          }
        }
      }
    },
  };

  /* ---- IRON MAIDEN: armoured ceiling tank (mid-boss) ---- */
  const MAIDEN_SEQ = ['volley', 'spikes', 'volley', 'bomb', 'spikes', 'volley'];
  const s4_disc = (c, cx, cy, r, col) => {
    c.fillStyle = col;
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r + r * 0.6 - y * y));
      c.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
    }
  };
  const s4_bar = (c, x0, y0, x1, y1, th, col) => {
    c.fillStyle = col;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) c.fillRect(Math.round(x0 + ((x1 - x0) * i) / n - th / 2), Math.round(y0 + ((y1 - y0) * i) / n - th / 2), th, th);
  };
  function s4_drawTrack(e, c) {
    const x0 = Math.round(e.x - 26), y0 = Math.round(e.y - 22), w = 56, h = 9;
    c.fillStyle = '#0c0c18';
    c.fillRect(x0 - 1, y0, w + 2, h + 1);
    c.fillStyle = '#2a3048';
    c.fillRect(x0, y0, w, h);
    const off = Math.floor(e.walk) % 6;
    for (let x = -6 + (off < 0 ? off + 6 : off); x < w; x += 6) {
      const a = Math.max(0, x), b = Math.min(w, x + 4);
      if (b > a) { c.fillStyle = '#5d6882'; c.fillRect(x0 + a, y0 + 1, b - a, h - 2); c.fillStyle = '#9eaac0'; c.fillRect(x0 + a, y0 + 1, b - a, 1); }
    }
    c.fillStyle = '#2a3048';
    c.fillRect(x0 + 1, y0 + h - 1, w - 2, 1);
    for (let i = 0; i < 5; i++) {
      const cx = x0 + 6 + i * 11, cy = y0 + 4;
      s4_disc(c, cx, cy, 3, '#0c0c18');
      s4_disc(c, cx, cy, 2, '#7a8a9c');
      c.fillStyle = '#dfe8f4';
      const a = e.walk * 0.5 + i;
      c.fillRect(Math.round(cx + Math.cos(a) * 1.3), Math.round(cy + Math.sin(a) * 1.3), 1, 1);
    }
  }
  ENEMIES.s4_maiden = {
    w: 68, h: 44, hp: 99999, score: 0, attach: 'ceil', sink: 0, expl: 'l', silentDeath: true,
    init(e, o) {
      const dm = G.diff.hp * (1 + 0.25 * G.loop);
      const pl = 14 * dm, ch = 34 * dm;
      e.parts = [
        { name: 'p0', ox: -27, oy: -7, w: 12, h: 10, hp: pl, max: pl, vuln: true, expl: 'm', score: 500 },
        { name: 'p1', ox: -27, oy: 3, w: 12, h: 10, hp: pl, max: pl, vuln: true, expl: 'm', score: 500 },
        { name: 'p2', ox: -27, oy: 13, w: 12, h: 10, hp: pl, max: pl, vuln: true, expl: 'm', score: 500 },
        { name: 'core', ox: -27, oy: 3, w: 8, h: 28, hp: ch, max: ch, vuln: false, expl: 'l', score: 5000 },
        { name: 'hull', ox: 6.5, oy: 3, w: 52, h: 33, hp: 99999, vuln: false },
        { name: 'track', ox: 2, oy: -18, w: 56, h: 8, hp: 99999, vuln: false },
      ];
      e.flipY = false;
      e.sx = e.x;
      e.mode = 'enter';
      e.walk = 0;
      e.atk = 100;
      e.pi = 0;
      e.charge = 0;
      e.kind = '';
      e.plates = 3;
      e.rage = false;
      e.ang = Math.PI;
      e.y = G.terrain.ceilBottom(e.wx) + 21;
    },
    update(e) {
      const T = G.terrain, P = G.player;
      // ---- crawl along the ceiling (screen-space control, the ceiling scrolls beneath) ----
      let vsx;
      if (e.mode === 'enter') {
        vsx = -0.95;
        if (e.sx <= 214) { e.mode = 'fight'; e.atk = 80; }
      } else if (e.mode === 'leave') vsx = -1.0;
      else {
        vsx = e.charge > 0 ? 0 : -0.07;
        if (e.t > 1300) { e.mode = 'leave'; e.charge = 0; }   // the hall ends: the maiden withdraws
      }
      e.sx += vsx;
      e.wx = G.camX + e.sx;
      e.walk -= (G.camSpeed + vsx) * (e.rage ? 1.2 : 1);
      let bot = 0;
      for (let k = -26; k <= 26; k += 4) bot = Math.max(bot, T.ceilBottom(e.wx + k));
      e.y += (bot + 21 - e.y) * 0.25;
      if (e.t % 34 === 5 && e.x < W && e.x > 0) sfx('stomp');

      // ---- weapons ----
      const tx = P.x - (e.x - 27), ty = P.y - (e.y + 16);
      const want = Math.max(Math.PI * 0.62, Math.min(Math.PI * 1.34, Math.atan2(ty, tx) + (Math.atan2(ty, tx) < 0 ? Math.PI * 2 : 0)));
      e.ang += Math.max(-0.035, Math.min(0.035, want - e.ang));
      if (e.mode === 'fight' && G.canFire(e)) {
        if (e.charge > 0) {
          if (--e.charge === 0) {
            const gx = e.x - 27 + Math.cos(e.ang) * 14, gy = e.y + 16 + Math.sin(e.ang) * 14;
            if (e.kind === 'volley') {
              const n = e.rage ? 5 : 3;
              G.fan(gx, gy, n, 0.5, 1.5);
              G.later(15, () => { if (!e.dead && G.canFire(e)) G.fan(e.x - 27 + Math.cos(e.ang) * 14, e.y + 16 + Math.sin(e.ang) * 14, n, 0.5, 1.5, { quiet: true }); });
            } else if (e.kind === 'spikes') {
              const n = e.rage ? 5 : 3;
              for (let i = 0; i < n; i++) {
                const bx = e.x + (n === 3 ? -7.5 + i * 12 : -12 + i * 8), by = e.y + 24;
                G.ebullet(bx, by, -0.25 + (i - (n - 1) / 2) * 0.32, 0.5, { spr: 's4_spike', w: 4, h: 11, ay: 0.05, anim: 8, quiet: i > 0 });
              }
            } else {
              const x0 = e.x - 27, y0 = e.y + 14;
              const tl = 78;
              G.spawn('s4_bomb', { x: x0, y: y0, vx: Math.max(-2.1, Math.min(0.4, (P.x - x0) / tl)), vy: -1.2 });
              sfx('missile');
            }
            e.atk = G.fireDelay(e.rage ? 60 : 92);
          }
        } else if (--e.atk <= 0) {
          e.kind = MAIDEN_SEQ[e.pi++ % MAIDEN_SEQ.length];
          e.charge = e.kind === 'spikes' ? 32 : 24;
          sfx('coreOpen');
        }
      }
    },
    onPartDeath(e, p) {
      if (p.name === 'core') { G.kill(e); return; }
      if (p.name[0] === 'p') {
        G.debris(e.x + p.ox, e.y + p.oy, 12);
        if (--e.plates === 0) {
          e.rage = true;
          e.parts[3].vuln = true;
          sfx('coreOpen');
        }
      }
    },
    onDeath(e) {
      const wx = e.wx, y = e.y;
      G.dropCapsule(e.x - 10, y + 16);
      G.debris(e.x, y, 26);
      for (let i = 0; i < 8; i++) {
        G.later(i * 5, () => G.explode(wx - G.camX + rnd(-30, 30), y + rnd(-12, 22), i % 3 === 2 ? 'l' : 'm', { quiet: i % 2 === 1, scroll: true }));
      }
      G.later(44, () => G.explode(wx - G.camX, y + 6, 'xl', { scroll: true }));
      G.fx.push({
        k: 'fn', x: e.x, y, t: 0, life: 44, scroll: true,
        draw: (c, f) => {
          const jx = rndi(-1, 1), jy = rndi(-1, 1), fl = (f.t >> 2) % 3 === 0;
          const ex = { x: f.x + jx, y: f.y + jy, walk: 0 };
          s4_drawTrack(ex, c);
          Sprites.draw(c, 's4_maiden', ex.x, ex.y + 4, { flash: fl });
          Sprites.draw(c, 's4_maiden_core_o', ex.x - 27, ex.y + 3, { frame: (f.t >> 2) & 1 });
        },
      });
    },
    draw(e, c) {
      s4_drawTrack(e, c);
      Sprites.draw(c, 's4_maiden', e.x, e.y + 4);
      const core = e.parts[3];
      const open = e.plates === 0;
      if (!core.dead) Sprites.draw(c, open ? 's4_maiden_core_o' : 's4_maiden_core_c', e.x - 27, e.y + 3, { frame: (e.t >> 3) & 1, flash: core.flash > 0 });
      for (let i = 0; i < 3; i++) {
        const p = e.parts[i];
        if (!p.dead) Sprites.draw(c, 's4_maiden_plate', e.x + p.ox, e.y + p.oy, { frame: p.hp < p.max * 0.5 ? 1 : 0, flash: p.flash > 0 });
      }
      // chin cannon (aims at you)
      const gx = e.x - 27, gy = e.y + 16;
      const ca = Math.cos(e.ang), sa = Math.sin(e.ang);
      s4_bar(c, gx, gy, gx + ca * 13, gy + sa * 13, 4, '#0c0c18');
      s4_bar(c, gx, gy, gx + ca * 13, gy + sa * 13, 2, '#7a8a9c');
      s4_disc(c, gx, gy, 3, '#0c0c18');
      s4_disc(c, gx, gy, 2, '#9eaac0');
      const charging = e.charge > 0;
      if (charging && e.kind !== 'spikes') {
        c.fillStyle = (e.t >> 1) & 1 ? '#ffffff' : '#ff9424';
        c.fillRect(Math.round(gx + ca * 14) - 1, Math.round(gy + sa * 14) - 1, 3, 3);
        if (e.kind === 'bomb') Sprites.draw(c, 's4_bomb', gx + ca * 12, gy + sa * 12, { frame: (e.t >> 2) & 1 });
      }
      // belly tubes glow while a spike volley charges
      if (charging && e.kind === 'spikes' && (e.t >> 1) & 1) {
        for (const bx of [-7.5, 4.5, 16.5]) { c.fillStyle = '#ffe646'; c.fillRect(Math.round(e.x + bx) - 1, Math.round(e.y + 22), 3, 2); c.fillStyle = '#ff9424'; c.fillRect(Math.round(e.x + bx) - 2, Math.round(e.y + 24), 5, 1); }
      }
    },
  };

  /* ---- lava bubble: swells out of the lava when you pass, rises, pops into embers ---- */
  ENEMIES.s4_bubble = {
    w: 8, h: 8, hp: 1, score: 100, expl: 's', attach: 'floor', sink: 0, ghost: true, harmless: true,
    init(e, o) {
      e.base = G.terrain.floorTop(e.wx);
      e.y = e.base;
      e.st = 0;
      e.arm = o.arm || 64;
      e.pt = 0;
      e.n = o.burst || 3;
    },
    update(e) {
      const P = G.player;
      if (e.st === 0) {
        if (P.alive && e.x > 12 && e.x < W - 10 && Math.abs(P.x - e.x) < e.arm) { e.st = 1; e.pt = 30; }
      } else if (e.st === 1) {
        e.y = e.base - 2 - (30 - e.pt) * 0.1;
        if (--e.pt <= 0) {
          e.st = 2; e.pt = 46;
          e.attach = null; e.ghost = false; e.harmless = false;
          e.vx = -G.camSpeed; e.vy = -0.8;
        }
      } else {
        e.vy = Math.max(-1.6, e.vy - 0.03);
        e.vx = -G.camSpeed + Math.sin(e.t * 0.22) * 0.35;
        if (--e.pt <= 0) {
          e.dead = true;
          G.explode(e.x, e.y, 's', { quiet: true });
          sfx('hit');
          if (G.player.alive) G.radial(e.x, e.y, e.n, 0.95, rnd(TAU), { spr: 's4_ember', w: 4, h: 4, life: 90, quiet: true });
        }
      }
    },
    draw(e, c) {
      if (e.st === 0) {
        const near = G.player.alive && e.x > 4 && e.x < W && Math.abs(G.player.x - e.x) < e.arm + 50;
        if (near) {
          c.fillStyle = '#ffb038';
          const r = ((e.t >> 3) % 3) * 2;
          c.fillRect(Math.round(e.x - 3 - r), Math.round(e.base), 6 + r * 2, 1);
        }
        return;
      }
      const fr = e.st === 1 ? (e.pt > 14 ? 0 : 1) : ((e.t >> 3) & 1) + 1;
      Sprites.draw(c, 's4_bubble', e.x, e.y - (e.st === 1 ? 2 : 0), { frame: fr, flash: e.flash > 0 });
    },
  };

  /* ---- decoration: flames on burning trees (no collision) ---- */
  ENEMIES.s4_burn = {
    w: 2, h: 2, hp: 1, score: 0, ghost: true, harmless: true,
    draw(e, c) {
      const nme = 's4_flame_' + (e.o.size || 's');
      const sz = Sprites.size(nme);
      const k = e.o.size === 'l' ? 2 : e.o.size === 'm' ? 1 : 0;
      Sprites.draw(c, 's4_glow_' + k, e.x, e.y - sz.h / 2 + 2, { alpha: 0.2 + 0.06 * Math.sin(e.t * 0.2 + (e.wx | 0)) });
      Sprites.draw(c, nme, e.x, e.y - sz.h / 2 + 2, { frame: ((e.t >> 2) + (e.wx | 0)) & 3 });
    },
  };

  /* ---- decoration: living lava (shimmer, flow highlights) drawn over the baked lava ---- */
  ENEMIES.s4_lavafx = {
    w: 1, h: 1, hp: 1, score: 0, ghost: true, harmless: true, keep: true,
    init(e) { e.keepOnBoss = true; e.x = 0; e.y = 0; },
    draw(e, c) {
      const T = G.terrain, cam = G.camX, t = G.frame;
      for (let i = 0; i < W; i++) {
        const wx = cam + i;
        if (!LAVACOL[wx]) continue;
        const y0 = H - Math.round(T.floorH[wx]);
        const n = Math.sin(wx * 0.31 + t * 0.11) + Math.sin(wx * 0.13 - t * 0.07) + Math.sin(wx * 0.71 + t * 0.2) * 0.5;
        if (n > 1.5) { c.fillStyle = '#fff2a0'; c.fillRect(i, y0 + 1, 1, 1); }
        else if (n < -1.55) { c.fillStyle = '#c03a18'; c.fillRect(i, y0 + 2, 1, 1); }
        if (((wx + (t * 0.7 | 0)) % 26) < 3) { c.fillStyle = '#ffd060'; c.fillRect(i, y0 + 3, 1, 1); }
      }
    },
  };

  /* =====================================================================
   * ASH PHOENIX — the boss of this stage (ENEMIES.s4_phoenix)
   *
   * A fast fire-bird. Unlike the old armoured core it never stands still: it hovers on the right, dive-bombs across the
   * arena and leaves the screen, then flies back in. The wings are the shield (armour parts): folded in front of the
   * chest they absorb every shot; the chest gem is the only weak point and is exposed only when the bird opens up.
   *
   *   HOVER   wings guard the gem. Feather volley: wings spread, gem glows (shoot it!), then a slow fan of feathers
   *   DIVE    telegraph: the bird climbs to its launch point, a dotted lane shows the whole flight path (58 / 50 / 42
   *           frames before the launch in phase 1 / 2 / 3); then it swoops across the arena with folded wings (gem
   *           exposed), sheds a lingering ember trail, leaves the screen, a marker flashes at the entry edge, it flies
   *           back in (harmless) and perches with open wings
   *   phase 1 (100-70%)  feather volley + single dives (strafe along the ship's lane / diagonal slash / rise out of the lava)
   *   phase 2 (70-40%)   + fire rain from the ceiling (columns with gaps), double pass (a second dive right after the
   *                      first, on another lane), 7-feather volleys, the wings smoulder
   *   phase 3 (40-0%)    the wings burn off: no armour (the gem is always exposed), faster passes, shorter pauses
   * The gem cannot drop below the end of the current phase until the next one has started (a strong ship cannot skip
   * the choreography); the move in progress is wrapped up quickly. Nothing hurts while the bird is off screen or
   * still flying in, and the landing zone gently pushes the ship away while the bird comes in.
   * ===================================================================== */
  const S4_PH_HP = 123; // heart hit points before difficulty scaling
  const S4_PH_FLOOR = [0.70, 0.40]; // the heart stays above these fractions until phase 2 / phase 3 has started
  const S4_PH_HOME_X = 192;
  const S4_PH_LAUNCH = [214, 46]; // top-right launch point of the 'slash' dive
  const S4_PH_LAVA = 186; // lava surface of the arena (floor top)
  const S4_PH_CEIL = 22; // ceiling of the arena
  const S4_PH_NEXT = { slash: 'rise', strafe: 'slash', rise: 'strafe' }; // kind of the second pass of a double pass
  const S4_PH_CFG = [
    null,
    { idle: 64, tel: 72, v0: 4.0, v1: 3.0, trail: 6, vol: 5, spread: 1.1, perch: 56 },
    { idle: 52, tel: 64, v0: 4.6, v1: 3.6, trail: 6, vol: 7, spread: 1.7, perch: 40 },
    { idle: 30, tel: 56, v0: 5.0, v1: 4.0, trail: 5, vol: 7, spread: 1.7, perch: 0 },
  ];
  const S4_PH_SEQ = [
    null,
    ['volley', 'dive:strafe', 'volley', 'dive:slash', 'volley', 'dive:rise'],
    ['rain', 'dive:slash', 'volley', 'double', 'rain', 'dive:rise', 'volley', 'double'],
    ['dive:strafe', 'volley', 'double', 'rain', 'dive:rise', 'volley', 'double'],
  ];
  const S4_PH_WBOX = Array.from({ length: 11 }, (_, f) => s4_wingBox(f / 5));
  const s4_ease = (t) => t * t * (3 - 2 * t);

  /** a flight path: gentle arc from p0 to p2 (bow > 0 bends it upwards), sampled into a polyline with arc lengths */
  function s4_phPath(p0, p2, bow) {
    const dx = p2[0] - p0[0], dy = p2[1] - p0[1], l = Math.hypot(dx, dy);
    let nx = dy / l, ny = -dx / l;
    if (ny > 0) { nx = -nx; ny = -ny; } // normal pointing up
    const cx = (p0[0] + p2[0]) / 2 + nx * 2 * bow, cy = (p0[1] + p2[1]) / 2 + ny * 2 * bow;
    const pts = [];
    let s = 0;
    for (let i = 0; i <= 90; i++) {
      const t = i / 90, u = 1 - t;
      const x = u * u * p0[0] + 2 * u * t * cx + t * t * p2[0], y = u * u * p0[1] + 2 * u * t * cy + t * t * p2[1];
      if (i) s += Math.hypot(x - pts[i - 1].x, y - pts[i - 1].y);
      pts.push({ x, y, s });
    }
    const ytab = new Float32Array(W).fill(NaN); // path height per screen column (the paths run right to left)
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      for (let x = Math.max(0, Math.ceil(Math.min(a.x, b.x))); x <= Math.min(W - 1, Math.floor(Math.max(a.x, b.x))); x++) {
        ytab[x] = a.x === b.x ? a.y : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
      }
    }
    return {
      pts, len: s, ytab,
      at(d) {
        d = clamp(d, 0, s);
        let lo = 0, hi = pts.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].s <= d) lo = m; else hi = m; }
        const a = pts[lo], b = pts[hi], k = b.s > a.s ? (d - a.s) / (b.s - a.s) : 0;
        return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k];
      },
    };
  }

  /** small chevron marker; dir: 'l' (points left), 'd' (down), 'u' (up) */
  const s4_chev = (c, x, y, dir, col) => {
    c.fillStyle = col;
    for (let i = 0; i < 5; i++) {
      if (dir === 'l') { c.fillRect(x + i, y - i, 2, 1); c.fillRect(x + i, y + i, 2, 1); }
      else if (dir === 'd') { c.fillRect(x - i, y - i, 1, 2); c.fillRect(x + i, y - i, 1, 2); }
      else { c.fillRect(x - i, y + i, 1, 2); c.fillRect(x + i, y + i, 1, 2); }
    }
  };
  const s4_ringPx = (c, cx, cy, r) => {
    const n = Math.max(12, Math.round(r * 5));
    for (let i = 0; i < n; i++) c.fillRect(Math.round(cx + Math.cos((i * TAU) / n) * r), Math.round(cy + Math.sin((i * TAU) / n) * r), 1, 1);
  };

  ENEMIES.s4_phoenix = {
    w: 74, h: 56, hp: 99999, score: 10000, keep: true, silentDeath: true, keepOnBoss: true,
    init(e) {
      const hh = S4_PH_HP * G.diff.hp * (1 + 0.25 * G.loop);
      e.hp = e.maxHp = 99999;
      e.seg = 1; // phase
      e.st = 'enter';
      e.stT = 0;
      e.x = S4_PH_HOME_X;
      e.y = H + 60;
      e.by = 108;
      e.pose = 0; // wing pose: 0 guarding, 1 spread, 2 swept back
      e.poseT = 0;
      e.tilt = 0; // -1 climbing, 0 level, 1 diving
      e.harmless = true;
      e.phaseQ = false; // the current phase is used up: finish the move, then change phase
      e.pulse = 0;
      e.si = 0;
      e.move = 'volley';
      e.idle = 0;
      e.kind = 'slash';
      e.passes = 0;
      e.second = false;
      e.lane = null;
      e.cols = null;
      e.aim = Math.PI;
      e.entry = 'slash';
      e.quick = false;
      e.hurried = false;
      e.hist = []; // recent positions during a pass (afterimages)
      e.telT = 70;
      e.rt0 = 40;
      e.rdur = 62;
      e.parts = [
        { name: 'wingU', ox: -8, oy: -26, w: 36, h: 26, hp: 99999, vuln: false },
        { name: 'wingL', ox: -8, oy: 26, w: 36, h: 26, hp: 99999, vuln: false },
        { name: 'heart', ox: -8, oy: -2, w: 30, h: 32, hp: hh, max: hh, vuln: false, expl: 'xl', score: 5000 },
      ];
    },
    go(e, st) {
      e.st = st;
      e.stT = 0;
    },
    /** a move is over: change phase if the gem has used up the current one, else pick the next move */
    done(e) {
      if (e.phaseQ) { this.go(e, 'phase'); return; }
      const seq = S4_PH_SEQ[e.seg];
      e.move = seq[e.si++ % seq.length];
      e.idle = Math.round(G.fireDelay(S4_PH_CFG[e.seg].idle));
      this.go(e, 'hover');
    },
    begin(e, mv) {
      if (mv === 'volley' || mv === 'rain') { this.go(e, mv); return; }
      e.kind = mv === 'double' ? (chance(0.5) ? 'slash' : 'strafe') : mv.slice(5);
      e.passes = mv === 'double' ? 2 : 1;
      e.second = false;
      this.go(e, 'climb');
    },
    /** station keeping on the right: follows the player's height loosely and bobs */
    hover(e, P, track, vmax) {
      if (track) e.by += clamp((clamp(0.55 * P.y + 50, 80, 138) - e.by) * 0.035, -vmax, vmax);
      const k = e.seg === 3 ? 1.6 : 1;
      const tx = S4_PH_HOME_X + Math.sin(e.t * 0.027 * k) * 6 * k, ty = e.by + Math.sin(e.t * 0.06 * k) * 2.4;
      e.x += (tx - e.x) * 0.25;
      e.y += (ty - e.y) * 0.25;
    },
    /** lock the lane of a pass on the player and build the path (and its warning preview) */
    lockLane(e, P) {
      const kind = e.kind;
      let p0, p2, bow = 0;
      const qx = clamp(P.alive ? P.x : 60, 40, 120); // the path goes through the ship's position at this moment
      if (kind === 'strafe') {
        const qy = clamp(P.alive ? P.y : 112, 60, 156);
        p0 = [226, qy]; p2 = [-110, qy + 6];
      } else if (kind === 'slash') {
        const qy = clamp(P.alive ? P.y : 112, 72, 128);
        p0 = S4_PH_LAUNCH.slice();
        p2 = [-110, p0[1] + (qy - p0[1]) * ((p0[0] + 110) / (p0[0] - qx))];
        bow = 14;
      } else {
        const qy = clamp(P.alive ? P.y : 112, 96, 150);
        p0 = [232, S4_PH_LAVA - 2];
        p2 = [-110, p0[1] + (qy - p0[1]) * ((p0[0] + 110) / (p0[0] - qx))];
        bow = -14;
      }
      const path = s4_phPath(p0, p2, bow);
      // danger band = what the hurting boxes sweep (+ the ship's half height). On a slanted path the parts behind the
      // heart are lower (descending) or higher (rising) than the path at the same column, so the band is lopsided.
      const slope = (p2[1] - p0[1]) / (p0[0] - p2[0]); // > 0: descends towards the left
      const winged = !e.parts[0].dead;
      const baseTop = 23, baseBot = winged ? 23 : 19, front = 23, back = winged ? 40 : 7; // the heart box sits 2 px above the centre line
      const hTop = Math.round(baseTop + 1 + (slope > 0 ? slope * front : -slope * back));
      const hBot = Math.round(baseBot + 1 + (slope > 0 ? slope * back : -slope * front));
      e.lane = { kind, path, hTop, hBot, half: Math.max(hTop, hBot), t0: e.stT };
      e.start = p0;
    },
    update(e) {
      const P = G.player, cfg = S4_PH_CFG[e.seg];
      if (e.phaseQ && !e.hurried) { e.hurried = true; this.hurryUp(e); }
      e.stT++;
      if (e.pulse > 0) e.pulse--;
      // the bird must never crush the ship while it flies in: the landing zone gently pushes the ship away
      if ((e.st === 'enter' || e.st === 'return' || e.st === 'phase') && P.alive && e.x > 150 && P.x > e.x - 66 && Math.abs(P.y - e.y) < 60) P.x = Math.max(14, P.x - 1.4);
      const T = e.stT;
      switch (e.st) {
        /* ---- bursts out of the lava, spreads its wings ---- */
        case 'enter': {
          e.harmless = true;
          if (T === 1) { sfx('eruption'); G.shake = Math.max(G.shake, 4); }
          if (T < 56 && T % 2 === 0) this.spit(S4_PH_HOME_X + rnd(-16, 16), S4_PH_LAVA, 1);
          if (T >= 22) {
            const u = Math.min(1, (T - 22) / 78);
            e.y = lerp(H + 60, 110, 1 - Math.pow(1 - u, 2.2));
            e.x = S4_PH_HOME_X + Math.sin(T * 0.06) * 3;
            e.tilt = u < 0.85 ? -1 : 0;
            if (Math.abs(e.y + 26 - S4_PH_LAVA) < 10 && T % 2 === 0) this.spit(e.x + rnd(-14, 14), S4_PH_LAVA, 1);
          }
          e.by = 110;
          if (T === 80) { e.poseT = 1; sfx('coreOpen'); }
          if (T === 108) e.poseT = 0;
          if (T >= 128) { e.harmless = false; this.done(e); }
          break;
        }
        /* ---- idle: wings guard the gem ---- */
        case 'hover': {
          e.harmless = false;
          e.poseT = 0;
          e.tilt = 0;
          this.hover(e, P, true, e.seg === 3 ? 0.9 : 0.6);
          if (e.phaseQ) { this.go(e, 'phase'); break; }
          if (P.alive && --e.idle <= 0) this.begin(e, e.move);
          break;
        }
        /* ---- feather volley: wings open (gem exposed), aim locks, fan of slow feathers ---- */
        case 'volley': {
          this.hover(e, P, false, 0);
          if (T === 1) { e.poseT = e.seg === 3 ? 0 : 1; sfx('coreOpen'); }
          if (T === 26) e.aim = Math.atan2(P.y - (e.y - 8), P.x - (e.x - 30));
          if (T === 42 && G.canFire(e)) {
            const n = cfg.vol, ox = e.x - 30, oy = e.y - 8;
            for (let i = 0; i < n; i++) {
              const a = e.aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * cfg.spread);
              const kk = Math.round((((a % TAU) + TAU) % TAU) / (TAU / 16)) & 15;
              G.ebullet(ox, oy, Math.cos(a) * 1.5, Math.sin(a) * 1.5, { spr: 's4_ph_fb' + kk, w: 5, h: 5, anim: 6, quiet: i > 0 });
            }
          }
          if (T === 66) e.poseT = 0;
          if (T >= 88) this.done(e);
          break;
        }
        /* ---- fire rain: wings up, the ceiling glows in columns, embers fall (gaps left) ---- */
        case 'rain': {
          this.hover(e, P, false, 0);
          e.by = clamp(e.by, 80, 136);
          const waves = e.seg === 3 ? 3 : 2;
          if (T === 1) { e.poseT = e.seg === 3 ? 0 : 1; sfx('eruption'); }
          const w = Math.floor((T - 1) / 56), tw = (T - 1) % 56;
          if (w < waves && tw === 0) { this.planRain(e, P); sfx('electric'); }
          if (w < waves && tw === 46 && e.cols) {
            if (P.alive) for (const x of e.cols) G.ebullet(x, S4_PH_CEIL + 4, 0, 1.6, { spr: 's4_ph_cinder', w: 5, h: 7, anim: 8, quiet: true });
            e.cols = null;
          }
          if (T === 56 * waves + 4) e.poseT = 0;
          if (T >= 56 * waves + 28) this.done(e);
          break;
        }
        /* ---- dive telegraph: wings fold, the bird climbs to its launch point, the lane shows where it will fly ---- */
        case 'climb': {
          const tel = e.second ? 56 : cfg.tel;
          e.telT = tel;
          if (T === tel - 16) sfx('electric'); // last cue before the launch: the bird charges
          if (T === 1) {
            sfx(e.second ? 'warp' : 'bossLaser');
            e.poseT = 2;
            e.from = e.second ? (e.kind === 'rise' ? [W + 60, H + 50] : [W + 60, -30]) : [e.x, e.y];
            e.harmless = !!e.second;
            e.tilt = e.kind === 'slash' ? 1 : e.kind === 'rise' ? -1 : 0;
          }
          if (T === (e.second ? 1 : 14)) { this.lockLane(e, P); sfx('ring'); }
          if (e.lane) {
            const u = s4_ease(clamp((T - (e.second ? 1 : 14)) / (e.second ? 34 : 46), 0, 1));
            e.x = lerp(e.from[0], e.start[0], u);
            e.y = lerp(e.from[1], e.start[1], u);
            if (u >= 1 && T < tel) { e.x += rnd(-0.6, 0.6); e.y += rnd(-0.6, 0.6); } // coiled, about to launch
            if (e.kind === 'rise') this.spitNear(e);
          } else { e.x += (e.from[0] - e.x) * 0.1; }
          if (e.second && T === 30) e.harmless = false;
          if (T >= tel) { this.go(e, 'pass'); e.harmless = false; e.pd = 0; }
          break;
        }
        /* ---- the pass: swoop along the locked path, folded wings, ember trail ---- */
        case 'pass': {
          const path = e.lane.path;
          if (T === 1) { sfx('warp'); G.shake = Math.max(G.shake, 2); e.hist.length = 0; }
          const v = lerp(cfg.v0, cfg.v1, e.pd / path.len) * (0.35 + 0.65 * Math.min(1, T / 16)) * Math.sqrt(G.bulletMul()); // eases into the dive; easier / harder levels fly slower / faster
          e.pd += v;
          const pos = path.at(e.pd);
          e.x = pos[0];
          e.y = pos[1];
          e.hist.push([e.x, e.y]);
          if (e.hist.length > 12) e.hist.shift();
          if (e.kind === 'rise') this.spitNear(e);
          if (T % cfg.trail === 0 && P.alive && e.x > 6 && e.x < W - 14) {
            G.ebullet(e.x + 10, e.y + rnd(-3, 3), 0, 0, { spr: 's4_ember', w: 5, h: 5, anim: 5, life: 72, quiet: true, solid: false });
          }
          G.fx.push({ k: 'part', x: e.x + 24 + rnd(-4, 8), y: e.y + rnd(-12, 12), vx: rnd(0, 0.7), vy: rnd(-0.5, 0.2), life: rndi(16, 34), t: 0, col: pick(EMBER_COLS), big: chance(0.35) });
          if (e.pd >= path.len) {
            e.harmless = true;
            e.lane = null;
            e.passes--;
            if (e.passes > 0 && !e.phaseQ) { e.second = true; e.kind = S4_PH_NEXT[e.kind]; this.go(e, 'climb'); } else { e.quick = e.phaseQ; this.go(e, 'away'); }
          }
          break;
        }
        /* ---- off screen: nothing hurts ---- */
        case 'away': {
          e.harmless = true;
          e.x = -200;
          if (T >= 20) this.go(e, 'return');
          break;
        }
        /* ---- marker at the entry edge, then the bird glides in (harmless) and perches ---- */
        case 'return': {
          e.harmless = true;
          if (T === 1) {
            e.entry = e.kind;
            e.by = clamp(0.5 * P.y + 56, 84, 138);
            e.tilt = e.kind === 'slash' ? 1 : e.kind === 'rise' ? -1 : 0;
            e.poseT = e.seg === 3 ? 0 : 1;
            if (e.quick && e.x > -60 && e.x < W + 60) { // aborted dive: glide back from where it is
              e.from = [e.x, e.y]; e.rt0 = 0; e.rdur = 44; e.tilt = 0;
            } else {
              e.from = e.kind === 'slash' ? [W + 50, -40] : e.kind === 'rise' ? [W + 6, H + 64] : [W + 74, e.by - 14];
              e.rt0 = e.quick ? 24 : 40; e.rdur = e.quick ? 48 : 62; // (a shorter marker when the phase is over anyway)
              sfx('ring');
            }
            e.quick = false;
            e.x = e.from[0];
            e.y = e.from[1];
          }
          if (T < e.rt0) { e.x = e.from[0]; e.y = e.from[1]; break; }
          if (T === e.rt0 && e.rt0 > 0) sfx('warp');
          const u = clamp((T - e.rt0) / e.rdur, 0, 1), k = 1 - Math.pow(1 - u, 2.6);
          e.x = lerp(e.from[0], S4_PH_HOME_X, k);
          e.y = lerp(e.from[1], e.by, k);
          if (e.kind === 'rise') this.spitNear(e);
          if (T >= e.rt0 + e.rdur - 6) e.tilt = 0;
          if (T >= e.rt0 + e.rdur + 22) { e.harmless = false; if (e.phaseQ || !cfg.perch) this.done(e); else this.go(e, 'perch'); }
          break;
        }
        /* ---- perched with open wings after the pass: the gem is exposed for a while ---- */
        case 'perch': {
          e.harmless = false;
          this.hover(e, P, true, 0.4);
          if (T === 1) { e.poseT = 1; e.tilt = 0; }
          if (T === cfg.perch) e.poseT = 0;
          if (T >= cfg.perch + 18) this.done(e);
          break;
        }
        /* ---- phase change: the gem is used up, the plumage flares (phase 3: the wings burn off) ---- */
        case 'phase': {
          e.harmless = true;
          e.tilt = 0;
          this.hover(e, P, false, 0);
          e.by += (108 - e.by) * 0.05;
          if (T === 1) {
            for (const b of G.eb) b.dead = true;
            e.poseT = 1;
            sfx('bossLaser');
            G.shake = Math.max(G.shake, 5);
            if (!G.reduceFlash) G.flash = Math.max(G.flash, 3);
            for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU, sp = rnd(0.8, 2.2); G.fx.push({ k: 'part', x: e.x - 5, y: e.y + 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rndi(26, 50), t: 0, col: pick(EMBER_COLS), big: chance(0.4) }); }
          }
          if (T % 5 === 0) this.spit(e.x + rnd(-30, 30), e.y + rnd(-26, 26), 0);
          if (e.seg === 2 && T === 56) this.burnWings(e);
          if (T === 74 && e.seg === 1) sfx('explodeM');
          if (T >= 104) {
            e.seg++;
            e.phaseQ = false;
            e.hurried = false;
            e.harmless = false;
            e.si = 0;
            e.poseT = 0;
            e.pulse = 0;
            this.done(e);
            e.idle = Math.min(e.idle, 40);
          }
          break;
        }
        default: break;
      }
      this.limbs(e);
    },
    /** the gem is used up for this phase: wrap the current move up quickly (nothing can be hurt any more anyway) */
    hurryUp(e) {
      switch (e.st) {
        case 'volley': e.stT = Math.max(e.stT, 62); break; // no feathers if they were not fired yet
        case 'rain': e.cols = null; e.stT = Math.max(e.stT, 56 * (e.seg === 3 ? 3 : 2)); break;
        case 'perch': e.stT = Math.max(e.stT, S4_PH_CFG[e.seg].perch); break;
        case 'climb': e.lane = null; e.quick = true; e.passes = 0; this.go(e, 'return'); break; // glide back instead of diving
        default: break;
      }
    },
    /** wings (pose -> boxes) and the weak point (exposed only when the bird has opened up) */
    limbs(e) {
      const wu = e.parts[0], wl = e.parts[1], heart = e.parts[2];
      e.pose += clamp(e.poseT - e.pose, -0.075, 0.075);
      const wb = S4_PH_WBOX[clamp(Math.round(e.pose * 5), 0, 10)];
      const wy = (wb[1] + wb[3]) / 2;
      wu.ox = wl.ox = S4_PH_SH[0] + (wb[0] + wb[2]) / 2;
      wu.oy = S4_PH_SH[1] + wy;
      wl.oy = 14 - wy;
      wu.w = wl.w = wb[2] - wb[0];
      wu.h = wl.h = wb[3] - wb[1];
      heart.oy = -2 + e.tilt * 1.2;
      let open = false;
      if (!e.phaseQ && !e.harmless && e.st !== 'enter' && e.st !== 'away' && e.st !== 'return' && e.st !== 'phase') {
        open = e.seg === 3 || e.pose > (e.st === 'climb' || e.st === 'pass' ? 1.5 : 0.8);
      }
      heart.vuln = open;
    },
    /** embers spitting out of the lava (entrance / lava launch) or around the bird (phase changes) */
    spit(x, y, up) {
      for (let i = 0; i < 3; i++) {
        G.fx.push({ k: 'part', x: x + rnd(-5, 5), y, vx: rnd(-0.8, 0.8), vy: -(up ? rnd(0.8, 2.4) : rnd(-0.6, 0.6)), life: rndi(20, 44), t: 0, col: pick(EMBER_COLS), big: chance(0.4) });
      }
    },
    spitNear(e) {
      if (Math.abs(e.y + 24 - S4_PH_LAVA) < 12 && e.x > -20 && e.x < W + 20 && (e.t & 1) === 0) this.spit(e.x + rnd(-14, 14), S4_PH_LAVA - 1, 1);
    },
    /** choose the columns of a fire-rain wave: two gaps (one within reach of the ship) */
    planRain(e, P) {
      const g1 = clamp((P.alive ? P.x : 100) + rnd(-36, 36), 46, 206);
      let g2 = rnd(40, 216);
      for (let k = 0; k < 8 && Math.abs(g2 - g1) < 96; k++) g2 = rnd(40, 216);
      const cols = [];
      for (let x = 12; x <= 246; x += 14) if (Math.abs(x - g1) >= 28 && Math.abs(x - g2) >= 28) cols.push(x);
      e.cols = cols;
      e.colsT = e.t;
    },
    burnWings(e) {
      for (const p of [e.parts[0], e.parts[1]]) {
        p.dead = true;
        G.explode(e.x + p.ox, e.y + p.oy, 'm', { quiet: p === e.parts[1] });
        G.debris(e.x + p.ox, e.y + p.oy, 14);
        for (let i = 0; i < 12; i++) G.fx.push({ k: 'part', x: e.x + p.ox + rnd(-16, 16), y: e.y + p.oy + rnd(-12, 12), vx: rnd(-1.2, 1.2), vy: rnd(-1.2, 0.4), life: rndi(24, 56), t: 0, col: pick(EMBER_COLS), big: chance(0.45) });
      }
      sfx('explodeL');
      G.shake = Math.max(G.shake, 7);
      if (!G.reduceFlash) G.flash = Math.max(G.flash, 5);
    },
    onPartHurt(e, p) {
      if (p.name !== 'heart' || e.seg >= 3) return;
      const fl = S4_PH_FLOOR[e.seg - 1] * p.max;
      if (p.hp <= fl) {
        p.hp = fl; // this phase is used up: the gem is shielded until the next phase has begun
        if (!e.phaseQ) {
          e.phaseQ = true;
          e.pulse = 16;
          sfx('shieldHit');
          G.spark(e.x - 8, e.y);
          G.spark(e.x + 2, e.y + 8);
        }
      }
    },
    onPartDeath(e, p) {
      if (p.name === 'heart') G.kill(e);
    },
    gauge(e) {
      const h = e.parts[2];
      return h.dead ? 0 : Math.max(0, h.hp) / h.max;
    },
    onDeath(e) {
      G.fx.push({ k: 'fn', x: e.x, y: e.y, t: 0, life: 136, draw: (c, f) => ENEMIES.s4_phoenix.drawWreck(e, c, f) });
      // the body bursts into drifting embers and feathers
      for (let i = 0; i < 40; i++) {
        G.later(i * 3, () => {
          const a = rnd(TAU), r = rnd(4, 30);
          G.fx.push({ k: 'part', x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r * 0.8, vx: Math.cos(a) * rnd(0.2, 1.4), vy: Math.sin(a) * rnd(0.2, 1.2) - 0.5, life: rndi(34, 70), t: 0, col: pick(EMBER_COLS), big: chance(0.45) });
        });
      }
      for (let i = 0; i < 18; i++) {
        G.later(rndi(50, 130), () => {
          const a = rnd(TAU), r = rnd(4, 26), sx = e.x + Math.cos(a) * r, sy = e.y + Math.sin(a) * r * 0.8;
          const vx = Math.cos(a) * rnd(0.3, 1.1), vy = rnd(-0.9, -0.1), ph = rnd(TAU), fr = rndi(0, 2), life = rndi(150, 250);
          G.fx.push({
            k: 'fn', x: sx, y: sy, t: 0, life,
            draw: (c, f) => {
              const t = f.t;
              const x = sx + vx * t * Math.pow(0.992, t) + Math.sin(t * 0.07 + ph) * 3;
              const y = sy + vy * t + 0.0042 * t * t;
              Sprites.draw(c, 's4_ph_fl', x, y, { frame: fr + ((t >> 4) & 1), alpha: Math.min(1, (life - t) / 30) });
            },
          });
        });
      }
      G.bossDefeated(e);
    },
    drawWreck(e, c, f) {
      const t = f.t, jx = rndi(-1, 1), jy = rndi(-1, 1);
      const fade = t < 100 ? 1 : Math.max(0, 1 - (t - 100) / 34);
      const x = Math.round(f.x + jx), y = Math.round(f.y + jy + Math.min(8, t * 0.07));
      const tf = ((t >> 2) & 3) + (e.tilt + 1) * 4;
      c.globalAlpha = fade;
      const hit = !G.reduceFlash && (t >> 2) % 4 === 0;
      Sprites.drawTL(c, t < 26 ? 's4_ph_body' : 's4_ph_body_c', x - S4_PH_BX, y - S4_PH_BY, { frame: tf, flash: hit });
      Sprites.drawTL(c, t < 26 ? 's4_ph_head' : 's4_ph_head_c', x - 18 - S4_PH_HX, y - 10 + Math.round(e.tilt * 2.5) - S4_PH_HY, { frame: (t >> 3) & 1, flash: hit });
      // the heart burns through
      Sprites.draw(c, 's4_ph_gem', x - 5, y + 3, { frame: 2 + ((t >> 2) & 1) });
      // flames licking over the husk
      for (let i = 0; i < 4; i++) {
        const fx = x - 18 + ((i * 17 + (t >> 3) * 7) % 38), fy = y - 10 + ((i * 11 + (t >> 2) * 5) % 26);
        Sprites.draw(c, 's4_flame_s', fx, fy, { frame: ((t >> 2) + i) & 3, alpha: 0.85 });
      }
      c.globalAlpha = 1;
    },
    /* ---------------------------------------------------------------- drawing */
    /** wings, body, gem and head at (px, py); ghost = a faded afterimage without gem and overlays */
    drawBird(e, c, px, py, ghost) {
      const heart = e.parts[2];
      const frame = (e.tilt + 1) * 4 + ((e.t >> 2) & 3);
      const wf = clamp(Math.round(e.pose * 5), 0, 10);
      const winged = !e.parts[0].dead;
      const wings = () => {
        if (!winged) return;
        Sprites.drawTL(c, 's4_ph_wing', px + S4_PH_SH[0] - S4_PH_WSX, py + S4_PH_SH[1] - S4_PH_WSY, { frame: wf });
        Sprites.drawTL(c, 's4_ph_wing', px + S4_PH_SH[0] - S4_PH_WSX, py + 14 - (S4_PH_WH - 1 - S4_PH_WSY), { frame: wf, flipY: true });
      };
      const wingsBehind = e.pose >= 0.6;
      if (wingsBehind) wings();
      Sprites.drawTL(c, 's4_ph_body', px - S4_PH_BX, py - S4_PH_BY, { frame });
      if (!ghost) {
        const hpk = heart.hp / heart.max;
        for (const [thr, ox, oy] of S4_PH_WOUNDS) if (hpk < thr) Sprites.draw(c, 's4_ph_burn', px + ox, py + oy + Math.round(e.tilt * 0.6), { frame: (e.t >> 4) & 1 });
        // the heart gem: dim and shielded, or white-hot when it can be hurt
        const beat = G.reduceFlash ? 0 : (e.t >> 3) & 1;
        let gf = heart.vuln || e.seg === 3 ? 2 + beat : (e.t >> 4) & 1;
        if (heart.flash > 0) gf = 3;
        if (e.phaseQ && !G.reduceFlash && (e.t >> 2) & 1) gf = 1;
        Sprites.draw(c, 's4_ph_gem', px - 5, py + 3, { frame: gf });
      }
      if (!wingsBehind) wings();
      if (!ghost && winged && e.seg === 2) { // phase 2: the wings smoulder, little flames lick from the feather tips
        const fe = s4_wingFeathers(e.pose);
        for (const n of [1, 3, 5]) {
          const tx = px + S4_PH_SH[0] + Math.cos(fe[n].th) * fe[n].L * 0.93, ty = fe[n].L * 0.93 * Math.sin(fe[n].th);
          const fr = ((e.t >> 2) + n) & 3;
          Sprites.draw(c, 's4_flame_s', tx, py + S4_PH_SH[1] + ty - 4, { frame: fr, alpha: 0.85 });
          Sprites.draw(c, 's4_flame_s', tx, py + 14 - ty + 4, { frame: fr, flipY: true, alpha: 0.85 });
        }
      }
      if (!ghost && !winged) { // the wings are burning stumps of flame
        for (const [fx, fy, up] of [[3, -20, 1], [-7, -16, 1], [3, 21, 0], [-7, 17, 0]]) {
          Sprites.draw(c, 's4_flame_m', px + fx, py + fy, { frame: ((e.t >> 2) + fx) & 3, flipY: !up, alpha: 0.92 });
        }
      }
      Sprites.drawTL(c, 's4_ph_head', px - 18 - S4_PH_HX, py - 10 + Math.round(e.tilt * 2.5) - S4_PH_HY, { frame: (e.t >> 3) & 1 });
    },
    draw(e, c) {
      const heart = e.parts[2];
      const px = Math.round(e.x), py = Math.round(e.y);
      this.drawMarks(e, c);
      if (e.x < -90 || e.x > W + 110 || e.y < -80 || e.y > H + 110) return;
      // while it rises out of / sinks into the lava the part below the surface is hidden
      const clip = e.y + 26 > S4_PH_LAVA;
      if (clip) { c.save(); c.beginPath(); c.rect(0, 0, W, S4_PH_LAVA + 1); c.clip(); }
      const open = heart.vuln;
      const hot = open || e.seg === 3;
      if (e.st === 'enter' && e.stT < 84) { // the lava bursts open where the bird comes out: a fountain of fire
        const T = e.stT, k = Math.min(1, T / 16) * Math.min(1, (84 - T) / 24);
        Sprites.draw(c, 's4_glow_2', S4_PH_HOME_X, S4_PH_LAVA - 2, { alpha: 0.5 * k });
        for (let i = 0; i < 4; i++) {
          const fx = S4_PH_HOME_X + (i - 1.5) * 9 + Math.sin(T * 0.3 + i) * 2;
          const rise = 9 + 14 * Math.min(1, T / 40) + (i & 1) * 6;
          Sprites.draw(c, 's4_flame_l', fx, S4_PH_LAVA - rise, { frame: ((T >> 2) + i) & 3, alpha: 0.85 * k });
        }
      }
      // heat glow behind the bird
      Sprites.draw(c, 's4_glow_2', px - 4, py, { alpha: (hot ? 0.26 : 0.16) + 0.05 * Math.sin(e.t * 0.2) });
      if (e.st === 'phase') { // flare of a phase change: pulsing white-hot glow behind the bird
        const k = Math.sin(Math.min(1, e.stT / 104) * Math.PI);
        Sprites.draw(c, 's4_glow_2', px - 4, py, { alpha: 0.3 + 0.5 * k });
        Sprites.draw(c, 's4_glow_2', px - 4, py, { alpha: 0.25 + 0.4 * k });
      }
      if (e.seg === 3) { // burning plumes streaming behind the wingless bird
        for (let i = 0; i < 3; i++) Sprites.draw(c, 's4_flame_m', px + 24 + i * 9, py + 2 + (i & 1) * 9, { frame: ((e.t >> 2) + i) & 3, alpha: 0.75 });
      }
      // speed: faded afterimages of the bird along its flight path
      if (e.st === 'pass') {
        for (const [k, a] of [[9, 0.12], [5, 0.22]]) {
          const h = e.hist[e.hist.length - 1 - k];
          if (!h) continue;
          c.globalAlpha = a;
          this.drawBird(e, c, Math.round(h[0]), Math.round(h[1]), true);
          c.globalAlpha = 1;
        }
      }
      this.drawBird(e, c, px, py, false);
      if (heart.flash > 0 && !G.reduceFlash) { // a hit lightens the bird a little (no solid white strobing)
        c.globalAlpha = 0.3;
        const frame = (e.tilt + 1) * 4 + ((e.t >> 2) & 3);
        Sprites.drawTL(c, 's4_ph_body', px - S4_PH_BX, py - S4_PH_BY, { frame, flash: true });
        Sprites.drawTL(c, 's4_ph_head', px - 18 - S4_PH_HX, py - 10 + Math.round(e.tilt * 2.5) - S4_PH_HY, { frame: (e.t >> 3) & 1, flash: true });
        c.globalAlpha = 1;
      }
      if (open && !e.harmless) {
        // "shoot here": pulsing halo around the gem
        c.fillStyle = !G.reduceFlash && (e.t >> 3) & 1 ? '#ffe646' : '#ff9424';
        s4_ringPx(c, px - 5, py + 3, 10 + ((e.t >> 4) & 1));
      }
      if (e.st === 'phase') this.drawPhase(e, c, px, py);
      // last frames before a launch: the bird charges (bright glow, sparks converge on the gem)
      if (e.st === 'climb' && e.lane && e.stT >= e.telT - 16) {
        Sprites.draw(c, 's4_glow_2', px - 4, py, { alpha: 0.35 });
        for (let i = 0; i < 4; i++) {
          const a = e.t * 0.45 + i * 1.57, r = 26 - ((e.t * 2 + i * 6) % 24);
          c.fillStyle = i & 1 ? '#fff2b0' : '#ffb83c';
          c.fillRect(Math.round(px - 5 + Math.cos(a) * r), Math.round(py + 3 + Math.sin(a) * r), 2, 2);
        }
      }
      if (e.pulse > 0) { // the gem is armoured again: a ring bursts out of it
        c.fillStyle = '#ffffff';
        s4_ringPx(c, px - 5, py + 3, 6 + (16 - e.pulse) * 1.6);
      }
      if (e.phaseQ && e.st !== 'phase') {
        // armour back up until the next phase: a flickering heat shield around the gem
        c.fillStyle = !G.reduceFlash && (e.t >> 1) & 1 ? '#a8f0ff' : '#48b8f4';
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * TAU + e.t * 0.12;
          c.fillRect(Math.round(px - 5 + Math.cos(a) * 11), Math.round(py + 3 + Math.sin(a) * 11), 1, 1);
        }
      }
      if (clip) c.restore();
    },
    /** the flare of a phase change: flames flaring around the bird and expanding rings of embers */
    drawPhase(e, c, px, py) {
      const T = e.stT, k = Math.sin(Math.min(1, T / 104) * Math.PI);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + T * 0.03;
        Sprites.draw(c, 's4_flame_l', px + Math.cos(a) * 28, py + Math.sin(a) * 24 + 4, { frame: ((T >> 2) + i) & 3, alpha: 0.35 + 0.4 * k });
      }
      for (const t0 of [0, 26, 52]) {
        const r = ((T - t0) * 1.7) | 0;
        if (T < t0 || r > 92) continue;
        c.fillStyle = (T >> 2) & 1 ? '#fff2b0' : '#ff9424';
        s4_ringPx(c, px - 5, py + 3, r);
      }
    },
    drawMarks(e, c) {
      const P = G.player;
      const blink = G.reduceFlash || ((e.t >> 2) & 1) === 0;
      // ---- dive lane: the whole flight path with its danger band ----
      const L = e.lane;
      if (L && (e.st === 'climb' || e.st === 'pass')) {
        const a = Math.min(1, (e.stT - (e.st === 'pass' ? -40 : L.t0)) / 8);
        if (a > 0) {
          const y = L.path.ytab;
          c.fillStyle = 'rgba(255,96,40,' + (a * (blink ? 0.27 : 0.17)).toFixed(3) + ')';
          const xMax = e.st === 'pass' ? Math.min(W, Math.round(e.x) + 10) : W; // the part of the lane the bird has passed fades away
          for (let x = 0; x < xMax; x++) if (y[x] === y[x]) c.fillRect(x, Math.round(y[x] - L.hTop), 1, L.hTop + L.hBot);
          c.fillStyle = blink ? '#ffe646' : '#ff9424';
          for (let x = 0; x < xMax; x += 2) {
            if (y[x] !== y[x]) continue;
            c.fillRect(x, Math.round(y[x] - L.hTop), 1, 1);
            c.fillRect(x, Math.round(y[x] + L.hBot), 1, 1);
          }
          // centre line of the flight, dotted
          let nextS = 0;
          for (const pt of L.path.pts) {
            if (pt.s < nextS) continue;
            nextS += 8;
            c.fillStyle = (nextS / 8 + (e.t >> 3)) & 1 ? '#fff2b0' : '#ff7a24';
            if (pt.x > -2 && pt.x < xMax) c.fillRect(Math.round(pt.x), Math.round(pt.y), 2, 2);
          }
          // arrows on the left edge: it will leave here
          const ey = y[6] === y[6] ? y[6] : y[10];
          if (ey === ey) { s4_chev(c, 5, Math.round(ey), 'l', blink ? '#ffffff' : '#ff9424'); s4_chev(c, 13, Math.round(ey), 'l', blink ? '#ff9424' : '#ffffff'); }
        }
      }
      // ---- the way back in: marker at the entry edge (flashing chevrons + a glowing gate) ----
      if (e.st === 'return' && e.rt0 > 0 && e.stT < e.rt0 + 4) {
        const a = Math.min(1, e.stT / 6), col = blink ? '#ffffff' : '#ff5a24', col2 = blink ? '#ff9424' : '#ffffff';
        c.globalAlpha = a;
        if (e.entry === 'slash') {
          Sprites.draw(c, 's4_glow_2', W - 20, 6, { alpha: 0.5 });
          c.fillStyle = col2; c.fillRect(W - 56, S4_PH_CEIL + 1, 56, 2);
          for (let i = 0; i < 3; i++) s4_chev(c, W - 28, 30 + i * 9, 'd', i & 1 ? col2 : col);
        } else if (e.entry === 'rise') {
          Sprites.draw(c, 's4_glow_2', W - 18, S4_PH_LAVA - 2, { alpha: 0.55 });
          c.fillStyle = col2; c.fillRect(W - 56, S4_PH_LAVA - 3, 56, 2);
          for (let i = 0; i < 3; i++) s4_chev(c, W - 28, S4_PH_LAVA - 14 - i * 9, 'u', i & 1 ? col2 : col);
        } else {
          const gy = Math.round(e.by - 14);
          Sprites.draw(c, 's4_glow_2', W - 4, gy, { alpha: 0.5 });
          c.fillStyle = col2; c.fillRect(W - 3, gy - 24, 3, 48);
          for (let i = 0; i < 3; i++) s4_chev(c, W - 36 + i * 10, gy, 'l', i & 1 ? col2 : col);
        }
        c.globalAlpha = 1;
      }
      // ---- fire rain: the ceiling glows where the embers will drop ----
      if (e.st === 'rain' && e.cols) {
        const k = Math.min(1, (e.t - e.colsT) / 40);
        for (const x of e.cols) {
          Sprites.draw(c, 's4_glow_0', x, S4_PH_CEIL + 6, { alpha: 0.2 + 0.4 * k });
          c.fillStyle = blink ? '#ffe646' : '#ff9424';
          c.fillRect(x - 1, S4_PH_CEIL + 3, 3, 2 + Math.round(k * 3));
          c.fillStyle = '#ff7a24';
          c.fillRect(x, S4_PH_CEIL + 8 + ((e.t + x) % 9), 1, 2);
        }
      }
      // ---- feather volley: the aim is locked, dotted rays show where the feathers will fly ----
      if (e.st === 'volley' && e.stT > 26 && e.stT < 44 && P.alive) {
        const n = S4_PH_CFG[e.seg].vol, ox = e.x - 30, oy = e.y - 8;
        c.fillStyle = blink ? '#fff2b0' : '#ff9424';
        for (let i = 0; i < n; i++) {
          const a = e.aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * S4_PH_CFG[e.seg].spread);
          for (let d = 14; d < 80; d += 11) c.fillRect(Math.round(ox + Math.cos(a) * d), Math.round(oy + Math.sin(a) * d), 1, 1);
        }
      }
      // ---- volley / rain charge: sparks gather at the gem ----
      if ((e.st === 'volley' && e.stT > 8 && e.stT < 42) || (e.st === 'perch' && e.stT < 4)) {
        for (let i = 0; i < 3; i++) {
          const a = e.t * 0.37 + i * 2.1, r = 22 - ((e.t + i * 5) % 14);
          c.fillStyle = i === 1 ? '#fff2b0' : '#ffb83c';
          c.fillRect(Math.round(e.x - 5 + Math.cos(a) * r), Math.round(e.y + 3 + Math.sin(a) * r), 1, 1);
        }
      }
    },
  };

  /* ground-anchored enemies (registered here so the forest leaves clearings around them).
   * Shooters keep away from the 300 px after every checkpoint (respawn = first seconds harmless). */
  ground(384, 'turret');
  ground(668, 'turret');
  ground(772, 'rocket');
  ground(900, 's4_geyser', { delay: 90, h: 74, period: 230 });
  ground(1100, 's4_geyser', { delay: 60, h: 60, period: 230 });
  ground(1190, 'turret', { burst: true });
  ground(1305, 's4_geyser', { delay: 110, h: 64, period: 210 });
  ground(1372, 'rocket');
  ground(1925, 'turret');
  ground(1960, 'turret', { burst: true });
  ground(2000, 'rocket');
  ground(2060, 's4_geyser', { delay: 60, h: 74, period: 220 });
  ground(2085, 's4_bubble', { arm: 58, burst: 3 });
  ground(2118, 's4_geyser', { delay: 150, h: 40, period: 220 });
  ground(2170, 's4_bubble', { arm: 46, burst: 3 });
  ground(2200, 's4_geyser', { delay: 20, h: 60, period: 220 });
  ground(2236, 's4_bubble', { arm: 52, burst: 3 });
  ground(2262, 's4_geyser', { delay: 110, h: 74, period: 220 });
  ground(3300, 'turret');
  ground(3420, 'turret');
  ground(3834, 's4_bubble', { arm: 50, burst: 3 });
  ground(3790, 's4_geyser', { delay: 100, h: 60, period: 240 });
  ground(3842, 's4_geyser', { delay: 40, h: 74, period: 240 });
  ground(3894, 's4_geyser', { delay: 150, h: 60, period: 240 });

  /* =====================================================================
   * THE STAGE
   * ===================================================================== */
  STAGES.push({
    id: 4,
    name: 'REVERSE VOLCANO',
    sub: 'WHERE FIRE RAINS DOWN',
    music: 'stage4',
    bossMusic: 'boss',
    scroll: 0.7,
    scrollMap: [[2380, 0.62], [3330, 0.7]],
    bossX: BOSS_X,
    checkpoints: [0, 820, 1540, 2300, 3520],

    terrain: () => ({
      length: LEN,
      floor: FLOOR,
      ceil: CEIL,
      shapes(g, T) {
        computeLava(T);
        plantForest(T);
        paintTrees(g);
      },
      decorate(g, T) {
        paintHall(g, T);
        shadeCeiling(g, T);
        paintLava(g, T);
        paintMoss(g, T);
        paintCraters(g, T);
        paintTrees(g);
      },
      skin: {
        kind: 's4_basalt',
        pal: ['#130b11', '#1d1219', '#2a1b24', '#3a2630', '#4c3440'],
        outline: '#0a0408', hi: '#f0a05a', hi2: '#b86a4a', lo: '#140a10',
        crackGlow: '#ff6a1c', cracks: 6, contrast: 1.7, seed: 41,
      },
    }),

    background: () =>
      Backgrounds.make([
        { kind: 'gradient', stops: [[0, '#cc4a2a'], [0.16, '#aa2e34'], [0.4, '#78205a'], [0.7, '#42185c'], [1, '#1a0c38']], steps: 22 },
        { kind: 'stars', n: 60, speed: 0.03, drift: 0.02, ymin: 110, ymax: 200, seed: 9 },
        { kind: 'strip', build: farHang, period: 512, speed: 0.08 },
        { kind: 'ridge', top: true, color: '#7a2040', color2: '#5a1636', edge: '#f0703a', hMin: 16, hMax: 46, speed: 0.18, seed: 4, jag: 0.7 },
        { kind: 'ridge', top: true, color: '#5a1836', color2: '#3a0e2c', edge: '#e0602e', hMin: 12, hMax: 36, speed: 0.34, seed: 8, jag: 0.6 },
        { kind: 'ridge', color: '#4a2060', color2: '#2a1240', edge: '#a8404e', hMin: 40, hMax: 90, speed: 0.2, seed: 12, jag: 0.6 },
        { kind: 'custom', draw: drawSmoke },
        { kind: 'strip', build: farForest, period: 512, speed: 0.36 },
        { kind: 'custom', draw: drawEmbers },
      ]),

    onReset() {
      G.spawn('s4_lavafx', { x: 0, y: 0 });
    },

    script(S) {
      for (const [wx, type, o] of GROUND) S.ground(wx, type, o);
      for (const b of PLAN.burning) S.fixed(b.wx, b.y, 's4_burn', { size: b.size });

      /* free-flying squads adapt to the air that is really there (between ceiling and floor) */
      const band = (cam, x0, x1) => {
        const T = G.terrain;
        let top = 0, bot = H;
        for (let x = Math.max(0, cam + x0); x <= Math.min(LEN - 1, cam + x1); x += 3) {
          top = Math.max(top, T.ceilBottom(x));
          bot = Math.min(bot, T.floorTop(x));
        }
        return { top: top + 12, bot: Math.min(bot, H - 16) - 12 };
      };
      const squad = (x, type, o) => {
        const win = type === 'diver' ? [255, 300] : type === 'spinner' ? [200, 340] : [145, 335];
        const b = band(x, win[0], win[1]);
        const arc = type === 'spinner' ? (o.dirY < 0 ? 0.98 : 0.02) : o.at;
        const y = lerpN(b.top, b.bot, arc === undefined ? 0.5 : arc);
        const room = Math.max(3, Math.min(y - b.top, b.bot - y) - 8);
        const opts = Object.assign({}, o, { y, amp: Math.min(o.amp === undefined ? 26 : o.amp, room) });
        if (o.dy) opts.dy = o.dy;
        S.wave(x, type, opts);
      };
      const wisp = (x, o) => squad(x, 's4_wisp', o);
      const helix = (x, o) => {
        wisp(x, Object.assign({}, o, { phase: 0 }));
        wisp(x, Object.assign({}, o, { phase: Math.PI, carry: false }));
      };

      /* ---- A: ember gate (calm start, first hanging volcano) ---- */
      wisp(150, { n: 5, gap: 14, at: 0.2, amp: 20, freq: 0.045, carry: 'last' });
      helix(300, { n: 4, gap: 12, at: 0.7, amp: 26 });
      wisp(420, { n: 6, gap: 12, at: 0.6, amp: 20, carry: 'last' });
      S.ceil(470, 's4_crawler', { dir: -1 });
      squad(205, 'spinner', { n: 4, gap: 12, dirY: 1, turnX: 150 });
      S.ceil(540, 'turret');
      wisp(560, { n: 5, gap: 13, at: 0.4, amp: 26, freq: 0.05 });
      S.ceil(610, 's4_vent', { first: 70, every: 200, burst: 3 });
      squad(640, 'diver', { n: 3, gap: 26, at: 0.15, dy: 14, carry: 'last' });
      S.ceil(690, 'turret');

      /* ---- B: burning forest (checkpoint 820) ---- */
      helix(720, { n: 5, gap: 12, at: 0.25, amp: 22 });
      wisp(970, { n: 6, gap: 12, at: 0.35, amp: 26, carry: 'last' });
      wisp(1040, { n: 5, gap: 13, at: 0.6, amp: 24, freq: 0.055 });
      S.ceil(1125, 's4_crawler', { dir: 1 });
      S.ceil(1092, 's4_stal');
      squad(1085, 'diver', { n: 3, gap: 22, at: 0.2, dy: 14 });
      wisp(1200, { n: 5, gap: 13, at: 0.4, amp: 26, carry: 'last' });
      S.ceil(1272, 's4_stal');
      squad(1290, 'diver', { n: 4, gap: 20, at: 0.15, dy: 12 });
      S.ceil(1305, 's4_crawler', { dir: 1 });

      /* ---- C: hanging volcanoes (checkpoint 1540) ---- */
      S.ceil(1445, 'turret');
      wisp(1440, { n: 6, gap: 12, at: 0.5, amp: 22, carry: 'last' });
      S.ceil(1520, 's4_vent', { first: 60, every: 150, burst: 4 });
      wisp(1700, { n: 5, gap: 13, at: 0.3, amp: 24, shoot: 90 });
      wisp(1750, { n: 6, gap: 12, at: 0.5, amp: 26, carry: 'last' });
      S.ceil(1830, 's4_vent', { first: 70, every: 160, burst: 3 });
      S.ceil(1890, 'turret');
      wisp(1900, { n: 5, gap: 12, at: 0.4, amp: 30 });
      squad(1940, 'diver', { n: 4, gap: 18, at: 0.15, dy: 12 });

      /* ---- D: lava lake with geysers ---- */
      S.ceil(2150, 's4_vent', { first: 50, every: 150, burst: 4, aim: true });
      S.ceil(2075, 'turret');
      wisp(2010, { n: 6, gap: 13, at: 0.5, amp: 24, carry: 'last' });
      wisp(2190, { n: 5, gap: 12, at: 0.4, amp: 30, shoot: 80 });
      squad(2110, 'spinner', { n: 5, gap: 12, dirY: 1, turnX: 140 });

      /* ---- Iron Maiden hall (checkpoint 2300) ---- */
      S.ceil(2700, 's4_maiden');
      // low-flying carriers skim the lava while the Iron Maiden works the ceiling
      wisp(2560, { n: 4, gap: 14, at: 0.88, amp: 6, speed: 1.4, carry: 'last' });
      wisp(2900, { n: 4, gap: 14, at: 0.88, amp: 6, speed: 1.4, carry: 'last' });
      wisp(3200, { n: 5, gap: 13, at: 0.5, amp: 26, carry: 'last' });
      squad(3330, 'diver', { n: 4, gap: 20, at: 0.2, dy: 14 });

      /* ---- E: final approach (checkpoint 3520) ---- */
      wisp(3400, { n: 5, gap: 12, at: 0.5, amp: 24, carry: 'last' });
      wisp(3670, { n: 5, gap: 13, at: 0.5, amp: 26, carry: 'last' });
      S.ceil(3730, 's4_vent', { first: 40, every: 240, burst: 3 });
      squad(3700, 'spinner', { n: 4, gap: 12, dirY: 1, turnX: 140 });
      wisp(3780, { n: 5, gap: 13, at: 0.45, amp: 24, carry: 'last', shoot: 100 });
      wisp(3900, { n: 5, gap: 13, at: 0.5, amp: 20, carry: 'last' });

      // safety net: nothing of the mid-boss may still be around when the boss sequence starts
      S.at(BOSS_X - 150, () => {
        for (const e of G.enemies) if (e.type === 's4_maiden' && !e.dead) e.mode = 'leave';
      });

      S.boss(BOSS_X, 's4_phoenix', {});
    },
  });
})();
