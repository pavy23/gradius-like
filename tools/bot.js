/*
 * Look-ahead autopilot used by tools/smoke-test.js (runs inside the game page).
 * Every frame it tries the 9 possible stick moves, projects terrain / enemy bullets / enemy bodies
 * a few frames ahead, penalises collisions and prefers to stay lined up with the nearest target
 * (capsule > boss weak point > nearest enemy).  `opts.every` makes it react only every N frames and
 * `opts.horizon` shortens the look-ahead — together they approximate a less perfect human.
 */


window.__bot = function (opts) {
  opts = opts || {};
  const P = G.player;
  const set = (a, v) => Input.setVirtual(a, v);
  if (G.mode !== 'play' || !P.alive) { set('left', false); set('right', false); set('up', false); set('down', false); return; }
  if (opts.every && G.frame % opts.every !== 0) { Input.setVirtual('fire', true); return; }
  const T = G.terrain, camX = G.camX, spd = P.speed(), cs = G.camSpeed;
  const H_ = 224, W_ = 256;
  const ov = (ax, ay, aw, ah, bx, by, bw, bh) => Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;

  // observed enemy velocity (screen px/frame) — many enemies move by writing e.x directly
  const prev = (window.__botPrev = window.__botPrev || new WeakMap());
  const vel = (e) => {
    const p = prev.get(e);
    if (p && p.f === G.frame - 1) return { vx: e.x - p.x, vy: e.y - p.y };
    return { vx: e.attach ? -G.camSpeed : e.vx || 0, vy: e.attach ? 0 : e.vy || 0 };
  };
  const vels = new Map();
  for (const e of G.enemies) { if (!e.dead) vels.set(e, vel(e)); }
  for (const e of G.enemies) prev.set(e, { x: e.x, y: e.y, f: G.frame });

  // ---- choose a target ----
  let tx = 48, ty = P.y, prio = 0;
  const alive = G.enemies.filter(e => !e.dead && !e.harmless && !e.ghost);
  let cap = null;
  for (const it of G.items) if (!it.dead && it.x > P.x - 10 && it.x < W_ - 8) { if (!cap || it.x < cap.x) cap = it; }
  if (cap) { tx = clamp(cap.x, 30, 200); ty = cap.y; prio = 2; }
  else if (G.boss && !G.boss.dead) {
    const b = G.boss;
    ty = b.y;
    if (b.parts) {
      // aim at a vulnerable part if any, else the boss centre
      const vp = b.parts.filter(p => !p.dead && p.vuln !== false && p.max);
      if (vp.length) { const p = vp.reduce((a, c) => (Math.abs(b.y + c.oy - P.y) < Math.abs(b.y + a.oy - P.y) ? c : a)); ty = b.y + p.oy; }
    }
    tx = 60;
  } else {
    let best = null, bd = 1e9;
    for (const e of alive) {
      if (e.x < P.x + 8 || e.x > W_ + 10) continue;
      const d = (e.x - P.x) + Math.abs(e.y - P.y) * 0.7;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { ty = best.y; }
    else ty = 112;
  }
  // stay inside the free corridor of the next ~110 px (probe several columns so tall thin pillars are seen)
  let top = 0, bot = H_;
  for (let dx = 0; dx <= 110; dx += 5) {
    const cx = camX + Math.min(W_ - 1, P.x + dx);
    top = Math.max(top, T.ceilBottom(cx) + 14);
    bot = Math.min(bot, T.floorTop(cx) - 14);
  }
  ty = bot > top ? clamp(ty, top, bot) : (top + bot) / 2;

  // ---- long-range lane planning: if the lane we want will be hit within ~1 s, pick a safer lane early ----
  const laneRisk = (yy) => {
    const k0 = Math.max(1, Math.ceil(Math.abs(yy - P.y) / spd));
    let r = 0;
    for (let k = k0; k <= k0 + 45; k += 3) {
      const cam = camX + cs * k;
      if (T.rect(cam + P.x - 10, yy - 6, 20, 12)) r += 50;
      for (const b of G.eb) {
        if (b.dead || b.harmless) continue;
        if (ov(P.x, yy, 14, 10, b.x + b.vx * k, b.y + b.vy * k, b.w, b.h)) r += 30;
      }
      for (const e of G.enemies) {
        if (e.dead || e.harmless) continue;
        const v = vels.get(e) || { vx: 0, vy: 0 };
        const ex = e.x + v.vx * k, ey = e.y + v.vy * k;
        if (e.parts) { for (const q of e.parts) { if (q.dead || q.harmless) continue; if (ov(P.x, yy, 16, 11, ex + q.ox, ey + q.oy, q.w, q.h)) r += 40; } }
        else if (ov(P.x, yy, 16, 11, ex + (e.hx || 0), ey + (e.hy || 0), e.w, e.h)) r += 40;
      }
    }
    return r;
  };
  if (laneRisk(ty) > 0) {
    let bestY = ty, bestR = laneRisk(ty) + 1e-3;
    const lo = Math.max(12, top), hi = Math.min(H_ - 24, bot > top ? bot : H_ - 24);
    for (let yy = lo; yy <= hi; yy += 6) {
      const r = laneRisk(yy) + Math.abs(yy - ty) * 0.04;
      if (r < bestR) { bestR = r; bestY = yy; }
    }
    ty = bestY;
    prio = Math.max(prio, 1);
  }

  // ---- evaluate 9 moves ----
  const HZ = opts.horizon || 14;
  let bestMove = [0, 0], bestCost = 1e12;
  for (const mx of [0, -1, 1]) for (const my of [0, -1, 1]) {
    const n = mx && my ? 0.7071 : 1;
    let x = P.x, y = P.y, cost = 0;
    for (let k = 1; k <= HZ; k++) {
      x = clamp(x + mx * n * spd, 14, W_ - 14);
      y = clamp(y + my * n * spd, 9, H_ - 22);
      const w = 1 / (0.6 + k * 0.25);
      const cam = camX + cs * k;
      if (T.rect(cam + x - 10, y - 6, 20, 12)) cost += 900 * w;
      for (const b of G.eb) {
        if (b.dead || b.harmless) continue;
        const bx = b.x + (b.vx + b.ax * k / 2) * k, by = b.y + (b.vy + b.ay * k / 2) * k;
        if (ov(x, y, 14, 10, bx, by, b.w, b.h)) cost += 700 * w;
      }
      for (const e of G.enemies) {
        if (e.dead || e.harmless) continue;
        const v = vels.get(e) || { vx: 0, vy: 0 };
        const ex = e.x + v.vx * k;
        const ey = e.y + v.vy * k;
        if (e.parts) {
          for (const p of e.parts) { if (p.dead || p.harmless) continue; if (ov(x, y, 16, 11, ex + p.ox, ey + p.oy, p.w, p.h)) cost += 500 * w; }
        } else if (ov(x, y, 16, 11, ex + (e.hx || 0), ey + (e.hy || 0), e.w, e.h)) cost += 500 * w;
      }
    }
    cost += Math.abs(y - ty) * (prio ? 0.5 : 0.25) + Math.abs(x - tx) * (prio ? 0.4 : 0.08);
    if (mx === 0 && my === 0) cost -= 0.5;
    if (cost < bestCost) { bestCost = cost; bestMove = [mx, my]; }
  }
  set('left', bestMove[0] < 0); set('right', bestMove[0] > 0);
  set('up', bestMove[1] < 0); set('down', bestMove[1] > 0);
  set('fire', true);
  // power-ups: skip extra speed-ups, take everything else
  const lit = P.meter;
  set('power', lit >= 0 && !(lit === 0 && P.speedLv >= 3) && G.frame % 4 === 0);
};
