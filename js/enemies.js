'use strict';
/* =============================================================
 * Generic enemies (reused in several stages).
 *
 * An enemy type is a plain object registered in ENEMIES:
 *   w,h        hit-box size            hp, score
 *   spr        sprite name or (e)=>name   fps: frames per anim step
 *   attach     'floor' | 'ceil'  (terrain-anchored, e.wx = world x)
 *   init(e,o)  called on spawn         update(e) every frame
 *   draw(e,c)  optional custom drawing onDeath(e), onHurt(e,dmg)
 *   expl       's'|'m'|'l'|'xl'        keep: never culled off-screen
 *   invuln / harmless / ghost flags
 * Free fliers move by e.vx / e.vy (engine adds them after update()).
 * Terrain-anchored ones must move by changing e.wx.
 * ============================================================= */

const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};
const carrierName = (e, n) => (e.carry ? n + '_c' : n);

/** keep a turret barrel inside its half plane */
function clampAim(ta, attach) {
  const m = 0.22;
  if (attach === 'ceil') {
    if (ta < 0) return ta < -Math.PI / 2 ? Math.PI - m : m;
    return clamp(ta, m, Math.PI - m);
  }
  if (ta > 0) return ta > Math.PI / 2 ? -Math.PI + m : -m;
  return clamp(ta, -Math.PI + m, -m);
}

/** draw a pixel-art gun barrel from (cx,cy) along angle */
function drawBarrel(c, cx, cy, ang, from, to, flash) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let i = from; i <= to; i++) {
    const x = Math.round(cx + ca * i), y = Math.round(cy + sa * i);
    c.fillStyle = '#48566a';
    c.fillRect(x - 1, y - 1, 3, 3);
    c.fillStyle = i > to - 2 ? (flash ? '#ff5a3a' : '#2a3048') : '#9eaac0';
    c.fillRect(x, y, 2, 2);
  }
}

Object.assign(ENEMIES, {
  /* ---- Spinner: comes in formation, then makes a U-turn ---- */
  spinner: {
    w: 11, h: 11, hp: 1, score: 100, fps: 4,
    spr: (e) => carrierName(e, 'spinner'),
    init(e, o) {
      e.speed = o.speed || 1.6;
      e.dirY = o.dirY || (e.y < 112 ? 1 : -1);
      e.turnX = o.turnX !== undefined ? o.turnX : 150;
      e.phi = 0;
      e.vx = -e.speed;
      e.path = o.path || 'arc';
    },
    update(e) {
      if (e.path === 'arc') {
        if (e.x < e.turnX && e.phi < Math.PI) {
          e.phi = Math.min(Math.PI, e.phi + 0.048);
          const th = Math.PI - e.dirY * e.phi;
          e.vx = Math.cos(th) * e.speed;
          e.vy = Math.sin(th) * e.speed;
        }
      }
      if (e.o.shoot && e.t === e.o.shoot && G.canFire(e)) {
        const [vx, vy] = G.aim(e.x, e.y, 1.3);
        G.ebullet(e.x, e.y, vx, vy);
      }
    },
  },

  /* ---- Wave: sine-wave flyer ---- */
  wave: {
    w: 13, h: 9, hp: 1, score: 100, fps: 6,
    spr: (e) => carrierName(e, 'wave'),
    init(e, o) {
      e.vx = -(o.speed || 1.3);
      e.base = e.y;
      e.amp = o.amp || 26;
      e.freq = o.freq || 0.045;
      e.ph = o.phase || 0;
    },
    update(e) {
      e.y = e.base + Math.sin(e.t * e.freq + e.ph) * e.amp;
      if (e.o.shoot && e.t % e.o.shoot === e.o.shoot - 1 && G.canFire(e)) {
        const [vx, vy] = G.aim(e.x, e.y, 1.3);
        G.ebullet(e.x, e.y, vx, vy);
      }
    },
  },

  /* ---- Diver: locks on to where you are and dashes ---- */
  diver: {
    w: 12, h: 8, hp: 2, score: 150, fps: 4,
    spr: (e) => carrierName(e, 'diver'),
    init(e, o) {
      e.speed = o.speed || 2;
      e.state = 0;
      e.vx = -1.1;
      e.lockX = o.lockX || 190;
    },
    update(e) {
      if (e.state === 0 && e.x < e.lockX) {
        const [vx, vy] = G.aim(e.x, e.y, e.speed);
        e.vx = vx;
        e.vy = vy;
        e.state = 1;
      }
      e.flipX = e.vx > 0.2;
    },
  },

  /* ---- Bug: small homing critter ---- */
  bug: {
    w: 8, h: 6, hp: 1, score: 50, fps: 3,
    spr: (e) => carrierName(e, 'bug'),
    init(e, o) {
      e.vx = o.vx !== undefined ? o.vx : -0.6;
      e.vy = o.vy !== undefined ? o.vy : -1.4;
      e.spd = o.speed || 1.35;
      e.homeT = o.homeT || 26;
    },
    update(e) {
      if (e.t > e.homeT) {
        const P = G.player;
        const want = Math.atan2(P.y - e.y, P.x - e.x);
        let cur = Math.atan2(e.vy, e.vx);
        cur += clamp(angDiff(want, cur), -0.045, 0.045);
        e.vx = Math.cos(cur) * e.spd;
        e.vy = Math.sin(cur) * e.spd;
      } else {
        e.vy *= 0.97;
        e.vx *= 0.99;
      }
      e.flipX = e.vx > 0;
    },
  },

  /* ---- Turret: dome cannon on floor or ceiling ---- */
  turret: {
    w: 14, h: 9, hp: 3, score: 200, attach: 'floor', expl: 'm', sink: 2,
    init(e) {
      e.ang = e.attach === 'ceil' ? Math.PI / 2 : -Math.PI / 2;
      e.cd = 50 + rndi(0, 60);
    },
    update(e) {
      const P = G.player;
      const cy = e.y + (e.attach === 'ceil' ? 2 : -2);
      const ta = clampAim(Math.atan2(P.y - cy, P.x - e.x), e.attach);
      e.ang += clamp(angDiff(ta, e.ang), -0.05, 0.05);
      if (--e.cd <= 0) {
        if (G.canFire(e) && e.x > 20) {
          const bx = e.x + Math.cos(e.ang) * 10, by = cy + Math.sin(e.ang) * 10;
          G.ebullet(bx, by, Math.cos(e.ang) * 1.5, Math.sin(e.ang) * 1.5);
          if (e.o.burst) {
            G.later(8, () => !e.dead && G.ebullet(e.x + Math.cos(e.ang) * 10, cy + Math.sin(e.ang) * 10, Math.cos(e.ang) * 1.5, Math.sin(e.ang) * 1.5));
            G.later(16, () => !e.dead && G.ebullet(e.x + Math.cos(e.ang) * 10, cy + Math.sin(e.ang) * 10, Math.cos(e.ang) * 1.5, Math.sin(e.ang) * 1.5));
          }
        }
        e.cd = G.fireDelay(e.o.rate || 120) + rndi(0, 40);
      }
    },
    draw(e, c) {
      const cy = e.y + (e.attach === 'ceil' ? 2 : -2);
      drawBarrel(c, e.x, cy, e.ang, 3, 10, e.cd < 10);
      Sprites.draw(c, 'turret', e.x, e.y, { frame: e.cd < 10 ? 1 : 0, flipY: e.attach === 'ceil', flash: e.flash > 0 });
    },
  },

  /* ---- Walker: bipedal mech patrolling the floor ---- */
  walker: {
    w: 12, h: 16, hp: 3, score: 300, fps: 7, attach: 'floor', expl: 'm', sink: 1,
    spr: () => 'walker',
    init(e, o) {
      e.dir = o.dir !== undefined ? o.dir : -1;
      e.speed = o.speed || 0.4;
      e.cd = 70 + rndi(0, 60);
    },
    update(e) {
      const T = G.terrain;
      e.wx += e.dir * e.speed;
      const ahead = e.wx + e.dir * 9;
      const here = T.floorTop(e.wx), fa = T.floorTop(ahead);
      if (fa < here - 6 || fa > here + 7) e.dir = -e.dir;
      e.y += (here - e.h / 2 + 1 - e.y) * 0.4;
      e.flipX = e.dir > 0;
      if (--e.cd <= 0) {
        if (G.canFire(e)) {
          const [vx, vy] = G.aim(e.x - 6, e.y + 2, 1.4);
          G.ebullet(e.x - 6, e.y + 2, vx, vy);
        }
        e.cd = G.fireDelay(e.o.rate || 110) + rndi(0, 40);
      }
    },
  },

  /* ---- Hatch: spawner bunker ---- */
  hatch: {
    w: 20, h: 8, hp: 10, score: 500, attach: 'floor', expl: 'm', sink: 1,
    spr: () => 'hatch',
    init(e, o) {
      e.cd = 60 + rndi(0, 50);
      e.open = 0;
      e.spawnKind = o.spawn || 'bug';
      e.count = o.count || 3;
    },
    update(e) {
      e.frame = e.open > 0 ? 1 : 0;
      if (e.open > 0) {
        e.open--;
        const k = e.count;
        for (let i = 0; i < k; i++) {
          if (e.open === 40 - i * 9) {
            G.spawn(e.spawnKind, { x: e.x, y: e.y + (e.attach === 'ceil' ? 6 : -6), vy: e.attach === 'ceil' ? 1.4 : -1.4, carry: e.o.carry && i === k - 1 });
          }
        }
      } else if (--e.cd <= 0) {
        if (e.x < W - 10 && e.x > 10 && G.player.alive) {
          e.open = 46;
          sfx('coreOpen');
        }
        e.cd = G.fireDelay(e.o.rate || 190);
      }
    },
  },

  /* ---- Rocket: silo missile that launches when you fly over ---- */
  rocket: {
    w: 6, h: 12, hp: 1, score: 150, attach: 'floor', expl: 's', sink: 1,
    spr: () => 'rocket',
    init(e, o) {
      e.state = 0;
      e.arm = o.range || 64;
    },
    update(e) {
      const P = G.player;
      if (e.state === 0) {
        if (P.alive && Math.abs(P.x - e.x) < e.arm && e.x < W - 12) {
          e.state = 1;
          e.attach = null; // becomes a free flier
          e.vx = -G.camSpeed;
          e.vy = 0;
          sfx('missile');
        }
      } else {
        e.vy += e.flipY ? 0.075 : -0.075;
        e.vy = clamp(e.vy, -3.2, 3.2);
        e.frame = 1 + ((e.t >> 1) & 1);
      }
    },
  },
});
