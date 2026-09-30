'use strict';
/* =============================================================
 * Shared pixel art: player ship, shots, capsule, effects and the
 * generic enemy set. Stage-specific art lives in js/stages/*.js
 * ============================================================= */

(function bakeSharedArt() {
  const S = Sprites;

  // placeholder for unknown sprite names (magenta checker)
  S.painted('missing', 8, 8, 1, (d) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) d.px(x, y, (x + y) & 1 ? 'k' : '#ff00ff');
  });

  /* ---------------- player ship "LANCER" (facing right) ---------------- */
  // canvas 27x13, axis row 6. ht/hb = wing height (rows) above / below the fuselage,
  // so frame 1/2 can "bank" the ship when moving up / down.
  const shipBody = (d, ht, hb) => {
    const wing = (up, h) => {
      const yE = up ? 5 : 8; // fuselage edge
      const yT = up ? 5 - h : 8 + h; // tip row edge
      const P = (x, y) => [x, y];
      d.poly([P(3, yT), P(11, yT), P(20, yE), P(6, yE)], 'g');
      // bright leading edge
      d.poly([P(8, yT), P(11, yT), P(20, yE), P(15, yE)], 'W');
      // dark trailing shade
      d.poly([P(3, yT), P(5, yT), P(8, yE), P(6, yE)], 'G');
      // red wing tip
      if (up) d.rect(3, yT, 4, Math.min(2, h), 'r');
      else d.rect(3, yE + h - Math.min(2, h), 4, Math.min(2, h), 'r');
      // blue root stripe
      d.hline(9, 14, up ? yE - 1 : yE, 'b');
    };
    wing(true, ht);
    wing(false, hb);
    // fuselage
    d.rect(2, 5, 21, 3, 'g');
    d.hline(4, 22, 6, 'W');
    d.hline(8, 15, 6, 'b');
    d.rect(23, 6, 2, 1, 'g');
    d.px(25, 6, 'G');
    d.hline(6, 21, 5, 'W');
    d.hline(6, 21, 7, 'G');
    // rear engine block
    d.rect(1, 4, 4, 5, 'G');
    d.rect(1, 4, 4, 1, 'X');
    d.rect(1, 8, 4, 1, 'd');
    d.px(1, 5, 'o');
    d.px(1, 6, 'y');
    d.px(1, 7, 'o');
    d.px(5, 6, 'd');
    // canopy
    d.ellipse(17, 6, 3.7, 2.7, 'B');
    d.ellipse(17, 5.8, 3, 2.1, 'C');
    d.ellipse(16.6, 5.3, 2.2, 1.2, 'c');
    d.px(15, 5, 'w');
    d.px(16, 4, 'w');
    d.outline('k');
  };
  S.painted('ship', 27, 13, 3, (d, f) => shipBody(d, [4, 2, 5][f], [4, 5, 2][f]));

  // engine flame (drawn to the left of the ship)
  S.def('flame', [
    ['...rrooyw', '.rrooyyww', '...rrooyw'],
    ['....rooyw', '..rrooyww', '....rooyw'],
  ]);

  // option (multiple): glowing orb
  S.painted('option', 9, 9, 3, (d, f) => {
    const r = [4, 3.6, 4.3][f];
    d.circle(4, 4, r, 'O');
    d.circle(4, 4, r - 1, 'o');
    d.circle(4, 4, r - 2, 'y');
    d.px(3, 3, 'w');
    d.px(4, 3, 'w');
    d.px(3, 4, 'w');
  });

  // shield (front bracket)
  S.painted('shield', 8, 21, 2, (d, f) => {
    const col = f ? 'w' : 'c';
    for (let y = 0; y < 21; y++) {
      const t = (y - 10) / 10;
      const x = Math.round(5 - Math.sqrt(Math.max(0, 1 - t * t)) * 5);
      d.px(7 - x, y, col);
      d.px(6 - x, y, 'C');
    }
  });

  /* ---------------- player weapons ---------------- */
  S.def('pshot', ['..hhhh.', 'wwwwwww', '..hhhh.']);
  S.def('pdbl', ['....w', '...cw', '..cw.', '.cw..', 'cw...']);
  S.def('missileH', ['.WWWWrr.', 'oyWWWWrr', '.GGGGRR.']);
  S.def('missileD', [
    'oy......',
    'yoWg....',
    '.WWWg...',
    '..WWWg..',
    '...WWWr.',
    '....WWrR',
    '.....rrR',
    '......RR',
  ]);
  // laser is drawn procedurally (stretched), see Game.drawPlayerBullets

  /* ---------------- enemy bullets ---------------- */
  S.def('ebullet', [
    ['.oo.', 'oyyo', 'oyyo', '.oo.'],
    ['.rr.', 'rwwr', 'rwwr', '.rr.'],
  ]);
  S.def('ebullet2', [
    ['..pp..', '.pwwp.', 'pwwwwp', 'pwwwwp', '.pwwp.', '..pp..'],
    ['..PP..', '.PppP.', 'PppwpP', 'PpwwpP', '.PppP.', '..PP..'],
  ]);
  S.def('ebulletL', [
    ['...oo...', '..oyyo..', '.oyhhyo.', 'oyhwwhyo', 'oyhwwhyo', '.oyhhyo.', '..oyyo..', '...oo...'],
    ['...rr...', '..rooR..', '.royyoR.', 'royhhyoR', 'royhhyoR', '.royyoR.', '..rooR..', '...rr...'],
  ]);

  /* ---------------- items ---------------- */
  S.painted('capsule', 12, 9, 4, (d, f) => {
    d.ellipse(5.5, 4, 4.8, 3.4, 'O');
    d.ellipse(5.5, 3.6, 4.4, 2.8, 'o');
    d.rect(3, 1, 6, 1, 'y');
    d.rect(4, 4, 4, 2, 'r');
    d.hline(4, 7, 4, 'R');
    // travelling shine
    const sx = 2 + f * 2;
    d.px(sx, 2, 'w');
    d.px(sx + 1, 2, 'w');
    d.outline('k');
  });

  /* ---------------- effects ---------------- */
  bakeExplosion('expS', 16, 7, 11);
  bakeExplosion('expM', 26, 8, 23);
  bakeExplosion('expL', 42, 9, 37);
  bakeExplosion('expXL', 68, 10, 51);
  S.painted('spark', 7, 7, 3, (d, f) => {
    if (f === 0) { d.hline(0, 6, 3, 'w'); d.vline(3, 0, 6, 'w'); d.px(3, 3, 'y'); }
    else if (f === 1) { d.line(1, 1, 5, 5, 'y'); d.line(1, 5, 5, 1, 'y'); d.px(3, 3, 'w'); }
    else { d.px(3, 1, 'o'); d.px(3, 5, 'o'); d.px(1, 3, 'o'); d.px(5, 3, 'o'); }
  });

  /* ---------------- generic enemies ---------------- */
  // Spinner: steel ring with cyan blades (rotates)
  S.painted('spinner', 13, 13, 4, (d, f) => {
    const a = (f * Math.PI) / 8;
    d.circle(6, 6, 6, 'X');
    d.circle(6, 6, 5, 'x');
    d.circle(6, 6, 3.6, 'd');
    // four fan blades (thin triangles)
    for (let k = 0; k < 4; k++) {
      const ang = a + (k * Math.PI) / 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const px = -sa, py = ca; // perpendicular
      const tip = [6.5 + ca * 5.4, 6.5 + sa * 5.4];
      d.poly([[6.5 + px * 0.6, 6.5 + py * 0.6], [tip[0] + px * 1.5, tip[1] + py * 1.5], [tip[0] - px * 0.4, tip[1] - py * 0.4], [6.5 - px * 0.6, 6.5 - py * 0.6]], 'c');
    }
    d.circle(6, 6, 1.6, 'C');
    d.px(6, 6, 'w');
    d.outline('k');
  });

  // Wave: bird-like flyer (wing flap, 2 frames)
  S.painted('wave', 16, 12, 2, (d, f) => {
    d.ellipse(8, 6, 4.5, 2.6, 'v');
    d.ellipse(8, 5.6, 3.6, 1.6, 'p');
    d.px(4, 5, 'w'); // eye
    d.px(3, 6, 'y'); // beak
    d.px(2, 6, 'y');
    if (f === 0) {
      d.poly([[7, 5], [15, 0], [13, 5]], 'V');
      d.poly([[8, 5], [14, 1], [12, 5]], 'v');
      d.poly([[7, 7], [15, 11], [13, 7]], 'V');
    } else {
      d.poly([[7, 5], [15, 4], [13, 6]], 'V');
      d.poly([[8, 5], [14, 4], [12, 6]], 'v');
      d.poly([[7, 7], [14, 7], [12, 7]], 'V');
    }
    d.px(13, 6, 'P');
    d.outline('k');
  });

  // Diver: sharp dart fighter pointing left
  S.painted('diver', 15, 11, 2, (d, f) => {
    d.poly([[1, 5.5], [11, 2], [13, 2], [13, 9], [11, 9]], 'n');
    d.poly([[2, 5.5], [11, 3.2], [12, 3.2], [12, 5.5]], 'l');
    d.poly([[9, 2], [12, 0], [13, 3]], 'N');
    d.poly([[9, 9], [12, 11], [13, 8]], 'N');
    d.px(5, 5, 'r');
    d.px(6, 5, 'y');
    d.rect(13, 4, 1, 3, f ? 'o' : 'y');
    d.outline('k');
  });

  // Turret: armoured dome (barrel is drawn procedurally)
  S.painted('turret', 18, 11, 2, (d, f) => {
    d.rect(1, 8, 16, 2, 'X');
    d.rect(3, 6, 12, 2, 'G');
    d.ellipse(9, 6, 6, 5, 'x');
    d.ellipse(9, 6.4, 5, 4, 'g');
    d.ellipse(9, 6.6, 3.2, 2.8, 'd');
    d.px(9, 6, f ? 'r' : 'R');
    d.rect(2, 8, 14, 1, 'x');
    d.outline('k');
  });

  // Walker: bipedal mech (4 frames) faces left
  S.painted('walker', 16, 18, 4, (d, f) => {
    const phase = f / 4;
    const s = Math.sin(phase * TAU);
    const c = Math.cos(phase * TAU);
    // legs
    const hip1x = 8, hip2x = 8;
    const foot1 = [8 + Math.round(s * 4), 16];
    const foot2 = [8 - Math.round(s * 4), 16];
    const knee1 = [8 + Math.round(s * 2) - 2, 12 - (c > 0 ? 1 : 0)];
    const knee2 = [8 - Math.round(s * 2) - 2, 12 - (c < 0 ? 1 : 0)];
    d.line(hip1x, 10, knee1[0], knee1[1], 'G');
    d.line(knee1[0], knee1[1], foot1[0], foot1[1], 'G');
    d.line(hip2x, 10, knee2[0], knee2[1], 'X');
    d.line(knee2[0], knee2[1], foot2[0], foot2[1], 'X');
    d.rect(foot1[0] - 1, 16, 3, 1, 'g');
    d.rect(foot2[0] - 1, 16, 3, 1, 'x');
    // body
    d.ellipse(8, 6, 6, 4.4, 'n');
    d.ellipse(8, 5.6, 5, 3.4, 'l');
    d.rect(3, 3, 5, 3, 'd');
    d.px(4, 4, 'r');
    d.px(5, 4, 'y');
    d.rect(0, 7, 5, 2, 'G'); // front cannon (faces left)
    d.rect(0, 7, 4, 1, 'x');
    d.rect(12, 2, 3, 3, 'N'); // back pack
    d.outline('k');
  });

  // Hatch: enemy spawner bunker (closed / open), sits on floor
  S.painted('hatch', 22, 10, 2, (d, f) => {
    d.rect(1, 3, 20, 6, 'X');
    d.rect(2, 2, 18, 1, 'x');
    d.rect(3, 1, 16, 1, 'g');
    d.rect(1, 8, 20, 1, 'd');
    if (f === 0) {
      d.rect(5, 3, 12, 3, 'G');
      d.hline(6, 15, 4, 'X');
      d.px(10, 4, 'r');
    } else {
      d.rect(5, 2, 12, 5, 'R');
      d.rect(6, 3, 10, 3, 'r');
      d.rect(8, 4, 6, 1, 'o');
      d.px(10, 3, 'y');
      d.px(11, 3, 'y');
    }
    d.px(2, 5, 'y');
    d.px(19, 5, 'y');
    d.outline('k');
  });

  // Bug: small homing critter spawned by hatches
  S.painted('bug', 11, 9, 2, (d, f) => {
    d.ellipse(5, 5, 3.4, 2.6, 'p');
    d.ellipse(5, 5.4, 3, 1.8, 'P');
    d.px(3, 4, 'w');
    d.px(3, 5, 'k');
    d.px(6, 4, 'y');
    if (f === 0) {
      d.line(4, 3, 1, 0, 'w');
      d.line(6, 3, 9, 0, 'w');
    } else {
      d.line(4, 3, 1, 2, 'w');
      d.line(6, 3, 9, 2, 'w');
    }
    d.rect(2, 8, 2, 1, 'P');
    d.rect(7, 8, 2, 1, 'P');
    d.outline('k');
  });

  // enemy laser bolt (boss)
  S.def('bolt', [['cccccccccccc', 'wwwwwwwwwwww', 'cccccccccccc'], ['bbbbbbbbbbbb', 'cccccccccccc', 'bbbbbbbbbbbb']]);

  // tiny ship icon for the lives counter
  S.painted('shipMini', 15, 9, 1, (d) => {
    d.poly([[2, 1], [6, 1], [10, 3], [3, 3]], 'W');
    d.poly([[2, 7], [6, 7], [10, 5], [3, 5]], 'W');
    d.rect(1, 3, 12, 3, 'g');
    d.hline(3, 12, 4, 'W');
    d.rect(9, 3, 3, 3, 'C');
    d.px(2, 1, 'r');
    d.px(2, 7, 'r');
    d.px(0, 4, 'o');
    d.outline('k');
  });

  // carrier (capsule-dropping) variants are red/orange
  S.recolor('spinner', 'spinner_c', { x: 'o', X: 'O', c: 'y', C: 'r' });
  S.recolor('wave', 'wave_c', { v: 'r', V: 'R', p: 'o', P: 'O' });
  S.recolor('diver', 'diver_c', { n: 'r', N: 'R', l: 'o' });
  S.recolor('bug', 'bug_c', { p: 'r', P: 'R' });

  // Rocket: ground launched missile (frame 0 idle, 1-2 burning)
  S.painted('rocket', 7, 14, 3, (d, f) => {
    d.rect(2, 2, 3, 8, 'W');
    d.rect(2, 2, 1, 8, 'g');
    d.poly([[2, 2], [3.5, 0], [5, 2]], 'r');
    d.px(3, 1, 'R');
    d.poly([[0, 8], [2, 5], [2, 10]], 'r');
    d.poly([[7, 8], [5, 5], [5, 10]], 'r');
    d.rect(3, 4, 1, 2, 'c');
    d.rect(2, 10, 3, 1, 'G');
    if (f === 1) { d.rect(3, 11, 1, 2, 'o'); d.px(3, 13, 'r'); }
    else if (f === 2) { d.rect(3, 11, 1, 3, 'y'); d.px(3, 13, 'o'); d.px(2, 11, 'o'); d.px(4, 11, 'o'); }
    d.outline('k');
  });
})();
