'use strict';
/* =============================================================
 * Player ship "LANCER": movement, weapons, power-up meter, options.
 *
 * Power meter (fills one slot per capsule, press POWER to cash in):
 *   SPEED UP -> MISSILE -> DOUBLE -> LASER -> OPTION -> ? (shield)
 * Dying costs all upgrades and sends you back to the last checkpoint.
 * ============================================================= */
const SLOT_NAMES = ['SPEED UP', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION', '?'];
const MAX_SPEED_LV = 5;
const MAX_OPTIONS = 4;
const SHIELD_HITS = 4;

class Player {
  constructor() {
    this.resetAll();
  }

  resetAll() {
    this.x = -40;
    this.y = 112;
    this.alive = true;
    this.inv = 0;
    this.auto = null; // {vx,vy} autopilot (stage clear fly-out)
    this.speedLv = 0;
    this.missile = false;
    this.dbl = false;
    this.laser = false;
    this.options = 0;
    this.shield = 0;
    this.meter = -1;
    this.fireCd = 0;
    this.missCd = 0;
    this.trail = [];
    this.bankT = 0;
    this.animT = 0;
    this.deadT = 0;
    this.enterT = 0;
    this.lastX = this.x;
    this.lastY = this.y;
  }

  /** (re)enter the screen from the left; upgrades are lost (that is the Gradius way) */
  respawn(keepUpgrades = false) {
    const keep = keepUpgrades ? { s: this.speedLv, m: this.missile, d: this.dbl, l: this.laser, o: this.options, sh: this.shield } : null;
    this.resetAll();
    if (keep) {
      this.speedLv = keep.s; this.missile = keep.m; this.dbl = keep.d; this.laser = keep.l; this.options = keep.o; this.shield = keep.sh;
    }
    this.x = -30;
    this.y = 112;
    this.enterT = 60;
    this.inv = 150;
    this.trail = [];
    for (let i = 0; i < 60; i++) this.trail.push({ x: this.x, y: this.y });
  }

  speed() {
    return 1.15 + this.speedLv * 0.48;
  }

  /* ---------- power meter ---------- */
  canUse(slot) {
    switch (slot) {
      case 0: return this.speedLv < MAX_SPEED_LV;
      case 1: return !this.missile;
      case 2: return !this.dbl;
      case 3: return !this.laser;
      case 4: return this.options < MAX_OPTIONS;
      case 5: return this.shield <= 0;
      default: return false;
    }
  }
  /** capsule picked up: move the highlight to the next usable slot */
  collectCapsule() {
    G.addScore(500);
    for (let step = 1; step <= 6; step++) {
      const c = (this.meter + step + 6) % 6;
      if (this.canUse(c)) {
        this.meter = c;
        sfx('capsule');
        return;
      }
    }
    this.meter = -1;
    G.addScore(1000); // everything maxed: bonus instead
    sfx('capsule');
  }
  activate() {
    const m = this.meter;
    if (m < 0) return;
    if (!this.canUse(m)) {
      this.meter = -1;
      return;
    }
    switch (m) {
      case 0: this.speedLv++; break;
      case 1: this.missile = true; break;
      case 2: this.dbl = true; this.laser = false; break;
      case 3: this.laser = true; this.dbl = false; break;
      case 4: this.options++; break;
      case 5: this.shield = SHIELD_HITS; break;
      default: break;
    }
    sfx('power', { slot: m });
    this.meter = -1;
  }

  optionPos(i) {
    const p = this.trail[Math.min(this.trail.length - 1, (i + 1) * 9)] || this;
    return p;
  }

  /* ---------- update ---------- */
  update() {
    this.animT++;
    if (!this.alive) {
      this.deadT++;
      return;
    }
    if (this.inv > 0) this.inv--;
    const inp = Input.held;

    let dx = 0, dy = 0;
    if (this.auto) {
      dx = this.auto.vx;
      dy = this.auto.vy;
      this.x += dx;
      this.y += dy;
    } else if (this.enterT > 0) {
      // fly in from the left edge
      this.enterT--;
      this.x += (44 - this.x) * 0.08 + 0.4;
      dx = 1;
    } else {
      const s = this.speed();
      let ix = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      let iy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
      if (ix && iy) {
        ix *= 0.7071;
        iy *= 0.7071;
      }
      this.x = clamp(this.x + ix * s, 14, W - 14);
      this.y = clamp(this.y + iy * s, 9, H - 22);
      dx = ix;
      dy = iy;
    }
    // bank animation: tilt while moving vertically
    const target = dy < -0.1 ? 1 : dy > 0.1 ? -1 : 0;
    this.bankT = clamp(this.bankT + sign(target - this.bankT) * 0.25, -1, 1);

    // record the path for the options
    if (Math.abs(this.x - this.lastX) > 0.01 || Math.abs(this.y - this.lastY) > 0.01) {
      this.trail.unshift({ x: this.x, y: this.y });
      if (this.trail.length > 64) this.trail.pop();
    }
    this.lastX = this.x;
    this.lastY = this.y;

    if (this.auto || this.enterT > 0) return;

    if (Input.pressed.power) this.activate();

    // ---- weapons ----
    if (this.fireCd > 0) this.fireCd--;
    if (this.missCd > 0) this.missCd--;
    if (inp.fire) {
      if (this.fireCd <= 0) {
        this.fireMain();
        this.fireCd = this.laser ? 11 : 7;
      }
      if (this.missile && this.missCd <= 0) {
        this.fireMissiles();
        this.missCd = 26;
      }
    }
  }

  sources() {
    const s = [{ x: this.x + 12, y: this.y }];
    for (let i = 0; i < this.options; i++) {
      const p = this.optionPos(i);
      s.push({ x: p.x + 6, y: p.y });
    }
    return s;
  }

  fireMain() {
    const src = this.sources();
    let n = 0;
    for (const s of src) {
      if (this.laser) {
        if (G.countPB('laser') < 3 * src.length) {
          G.pbullet({ kind: 'laser', x: s.x + 18, y: s.y, vx: 8, w: 30, h: 3, dmg: 1.4, pierce: true });
          n++;
        }
      } else {
        if (G.countPB('shot') < 5 * src.length) {
          G.pbullet({ kind: 'shot', x: s.x, y: s.y, vx: 6, w: 7, h: 3, dmg: 1, spr: 'pshot' });
          n++;
        }
        if (this.dbl && G.countPB('dbl') < 4 * src.length) {
          G.pbullet({ kind: 'dbl', x: s.x - 2, y: s.y - 2, vx: 3.4, vy: -3.4, w: 5, h: 5, dmg: 1, spr: 'pdbl' });
        }
      }
    }
    if (n) sfx(this.laser ? 'laser' : 'shot');
  }

  fireMissiles() {
    const src = this.sources();
    if (G.countPB('missile') >= 2 * src.length + 2) return;
    for (const s of src) {
      G.pbullet({ kind: 'missile', x: s.x - 4, y: s.y + 5, vx: 1.8, vy: 0.8, w: 6, h: 4, dmg: 4, state: 'fall' });
    }
    sfx('missile');
  }

  /* ---------- damage ---------- */
  hit() {
    if (!this.alive || this.inv > 0 || G.god) return;
    this.die();
  }
  absorbShield() {
    this.shield--;
    sfx(this.shield > 0 ? 'shieldHit' : 'shieldBreak');
    G.spark(this.x + 18, this.y);
  }
  die() {
    if (!this.alive) return;
    this.alive = false;
    this.deadT = 0;
    G.explode(this.x, this.y, 'm');
    G.debris(this.x, this.y, 20);
    G.flash = 4;
    G.shake = 6;
    sfx('playerDeath');
    G.onPlayerDeath();
  }

  /* ---------- drawing ---------- */
  draw(ctx) {
    if (!this.alive) return;
    for (let i = 0; i < this.options; i++) {
      const p = this.optionPos(i);
      Sprites.draw(ctx, 'option', p.x, p.y, { frame: (this.animT >> 2) % 3 });
    }
    const blink = this.inv > 0 && ((this.animT >> 2) & 1) === 0 && this.enterT <= 0;
    if (blink) return;
    const fl = this.speedLv >= 3 ? 1 : 0;
    Sprites.draw(ctx, 'flame', this.x - 17 - fl, this.y, { frame: (this.animT >> 1) & 1 });
    const bank = this.bankT > 0.5 ? 1 : this.bankT < -0.5 ? 2 : 0;
    Sprites.draw(ctx, 'ship', this.x, this.y, { frame: bank });
    if (this.shield > 0) {
      const a = this.shield === 1 && ((this.animT >> 2) & 1) ? 0.5 : 1;
      Sprites.draw(ctx, 'shield', this.x + 18, this.y, { frame: (this.animT >> 3) & 1, alpha: a });
    }
  }
}
