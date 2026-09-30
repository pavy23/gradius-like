'use strict';
/* =============================================================
 * NOVA LANCER — game core: loop, state machine, entities, stage flow, HUD
 * ============================================================= */

/* safe audio wrappers (audio.js / music.js are optional at load time) */
const sfx = (name, params) => {
  try {
    if (typeof Sound !== 'undefined') Sound.sfx(name, params);
  } catch (e) { /* audio must never break the game */ }
};
const bgm = {
  play(name, opts) { try { if (typeof Music !== 'undefined') Music.play(name, opts); } catch (e) { /* ignore */ } },
  stop(f) { try { if (typeof Music !== 'undefined') Music.stop(f); } catch (e) { /* ignore */ } },
  pause() { try { if (typeof Music !== 'undefined') Music.pause(); } catch (e) { /* ignore */ } },
  resume() { try { if (typeof Music !== 'undefined') Music.resume(); } catch (e) { /* ignore */ } },
};

const ENEMIES = {}; // enemy type registry (js/enemies.js, js/stages/*.js)
const STAGES = []; // stage registry (js/stages/*.js)

const DIFFS = {
  easy: { name: 'EASY', bullet: 0.8, fire: 0.75, spare: 4, hp: 0.9 },
  normal: { name: 'NORMAL', bullet: 1.0, fire: 1.0, spare: 2, hp: 1.0 },
  hard: { name: 'HARD', bullet: 1.25, fire: 1.35, spare: 1, hp: 1.2 },
};
const DIFF_ORDER = ['easy', 'normal', 'hard'];

/* ------------------------------------------------------------------
 * Stage script builder: stages describe themselves as a list of events
 * keyed by camera x (world pixels scrolled so far).
 * ------------------------------------------------------------------ */
class StageBuilder {
  constructor() {
    this.events = [];
  }
  _add(at, run, extra) {
    this.events.push(Object.assign({ at, run }, extra));
    return this;
  }
  /** run any function when the camera reaches x */
  at(x, fn) {
    return this._add(x, fn);
  }
  /**
   * a squad of `n` flying enemies entering from the right.
   * o: {n, gap(frames), y, dy, x, carry:'last'|'first'|'all'|index, each:(i)=>extraOpts, ...enemy opts}
   */
  wave(x, type, o = {}) {
    const n = o.n || 1;
    const gap = o.gap === undefined ? 10 : o.gap;
    return this._add(x, () => {
      for (let i = 0; i < n; i++) {
        let carry = o.carry === 'last' ? i === n - 1 : o.carry === 'first' ? i === 0 : o.carry === 'all' ? true : o.carry === i;
        const extra = o.each ? o.each(i) || {} : {};
        if (extra.carry !== undefined) carry = !!extra.carry; // each(i) may decide per member
        const opt = Object.assign({}, o, extra, {
          y: extra.y !== undefined ? extra.y : (o.y === undefined ? 100 : o.y) + i * (o.dy || 0),
          carry,
          index: i,
          count: n,
        });
        if (i === 0) G.spawn(type, opt);
        else G.later(i * gap, () => G.spawn(type, opt));
      }
    });
  }
  /** enemy standing on the floor at world x */
  ground(wx, type, o = {}) {
    return this._add(wx - W - 24, () => G.spawn(type, Object.assign({}, o, { attach: 'floor', wx })), { wx });
  }
  /** enemy hanging from the ceiling at world x */
  ceil(wx, type, o = {}) {
    return this._add(wx - W - 24, () => G.spawn(type, Object.assign({}, o, { attach: 'ceil', wx })), { wx });
  }
  /** free-standing scenery-anchored enemy (no snapping): world x, screen y */
  fixed(wx, y, type, o = {}) {
    return this._add(wx - W - 24, () => G.spawn(type, Object.assign({}, o, { attach: 'free', wx, y })), { wx });
  }
  boss(x, type, o = {}) {
    return this._add(x, () => G.beginBoss(type, o), { boss: true });
  }
  banner(x, lines) {
    return this._add(x, () => G.showBanner(lines));
  }
  finish() {
    this.events.sort((a, b) => a.at - b.at);
    return this.events;
  }
}

/* ------------------------------------------------------------------
 * The game object
 * ------------------------------------------------------------------ */
const G = {
  mode: 'boot',
  modeT: 0,
  frame: 0,
  cv: null,
  ctx: null,
  diffKey: 'normal',
  diff: DIFFS.normal,
  loop: 0,
  god: false,
  debug: false,
  paused: false,

  // world
  stageIdx: 0,
  stage: null,
  terrain: null,
  bg: null,
  camX: 0,
  camAcc: 0,
  camSpeed: 0,
  camTarget: 0,
  camDX: 0,
  events: [],
  evIdx: 0,
  queue: [],
  cpIdx: 0,
  player: null,
  enemies: [],
  pb: [],
  eb: [],
  items: [],
  fx: [],
  boss: null,
  bossPhase: null,
  bossT: 0,
  clearT: 0,
  banner: null,
  toastMsg: '',
  toastT: 0,
  reduceFlash: false,
  shake: 0,
  flash: 0,
  rank: 0,

  // meta
  score: 0,
  hi: 0,
  spare: 2,
  extendAt: 20000,
  continues: 0,
  pendingStage: 0,
  startStage: 0,
  menuSel: 1,

  /* ================= boot / loop ================= */
  init(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.hi = parseInt(Store.get('nova.hi', '0'), 10) || 0;
    this.diffKey = Store.get('nova.diff', 'normal');
    if (!DIFFS[this.diffKey]) this.diffKey = 'normal';
    this.diff = DIFFS[this.diffKey];
    this.player = new Player();
    STAGES.sort((a, b) => a.id - b.id);
    Input.init();
    this.reduceFlash = Store.get('nova.noflash', '0') === '1';

    const q = new URLSearchParams(location.search);
    if (q.get('god') === '1') this.god = true;
    if (q.get('debug') === '1') this.debug = true;
    if (q.get('diff') && DIFFS[q.get('diff')]) {
      this.diffKey = q.get('diff');
      this.diff = DIFFS[this.diffKey];
    }
    if (q.get('stage')) this.startStage = clamp((parseInt(q.get('stage'), 10) || 1) - 1, 0, STAGES.length - 1);
    this.q = q;

    const unlock = () => {
      try { if (typeof Sound !== 'undefined') Sound.init(); } catch (e) { /* ignore */ }
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    // auto-pause when the window loses focus (real play only, not in scripted tests)
    window.addEventListener('blur', () => {
      if (!(q.get('manual') === '1') && this.mode === 'play') this.setMode('paused');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.mode === 'play') this.setMode('paused');
        try { if (typeof Sound !== 'undefined') Sound.suspend(); } catch (e) { /* ignore */ }
      } else {
        try { if (typeof Sound !== 'undefined' && this.mode !== 'paused') Sound.resume(); } catch (e) { /* ignore */ }
      }
    });
    this.resize();
    window.addEventListener('resize', () => this.resize());

    if (q.get('autostart') === '1') this.startGame();
    else this.setMode('title');
  },

  resize() {
    const wrap = this.cv.parentElement;
    const aw = window.innerWidth, ah = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    let s = Math.min(aw / W, ah / H);
    // prefer integer device-pixel scaling for crisp pixels
    const sd = Math.floor(s * dpr);
    if (sd >= 2) s = sd / dpr;
    this.cv.style.width = Math.floor(W * s) + 'px';
    this.cv.style.height = Math.floor(H * s) + 'px';
    if (wrap) wrap.style.width = this.cv.style.width;
  },

  run() {
    let last = performance.now();
    let acc = 0;
    const STEP = 1000 / 60;
    const tick = (now) => {
      requestAnimationFrame(tick);
      let dt = now - last;
      last = now;
      if (dt > 200) dt = 200;
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 4) {
        this.step();
        acc -= STEP;
        n++;
      }
      if (n === 4) acc = 0;
      this.render();
    };
    requestAnimationFrame(tick);
  },

  setMode(m, arg) {
    this.mode = m;
    this.modeT = 0;
    const md = MODES[m];
    if (md.enter) md.enter.call(this, arg);
  },

  step() {
    Input.update();
    if (Input.pressed.mute) {
      try {
        if (typeof Sound !== 'undefined') this.toast(Sound.toggleMute() ? 'SOUND OFF' : 'SOUND ON');
      } catch (e) { /* ignore */ }
    }
    if (Input.pressed.flash) {
      this.reduceFlash = !this.reduceFlash;
      Store.set('nova.noflash', this.reduceFlash ? '1' : '0');
      this.toast(this.reduceFlash ? 'FLASH EFFECTS OFF' : 'FLASH EFFECTS ON');
    }
    if (this.toastT > 0) this.toastT--;
    this.frame++;
    this.modeT++;
    MODES[this.mode].update.call(this);
  },

  render() {
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    MODES[this.mode].draw.call(this, c);
    if (this.toastT > 0) {
      c.globalAlpha = Math.min(1, this.toastT / 20);
      PixFont.text(c, this.toastMsg, W - 6, 14, { align: 'right', color: '#ffffff', shadow: '#000' });
      c.globalAlpha = 1;
    }
  },

  toast(msg) {
    this.toastMsg = msg;
    this.toastT = 90;
  },

  /* ================= helpers for stages / enemies ================= */
  later(delay, fn) {
    this.queue.push({ t: delay, fn });
  },

  bulletMul() {
    return this.diff.bullet * (1 + 0.1 * this.loop) * (0.94 + 0.14 * this.rank);
  },
  /** enemy fire interval scaling: pass a base delay in frames */
  fireDelay(base) {
    return Math.max(8, base / (this.diff.fire * (1 + 0.22 * this.rank) * (1 + 0.12 * this.loop)));
  },
  canFire(e) {
    return this.player.alive && e.x > 6 && e.x < W - 4 && e.y > -4 && e.y < H + 4;
  },
  /** velocity toward the player from (x,y); spread in radians */
  aim(x, y, speed, spread = 0) {
    const P = this.player;
    const a = Math.atan2(P.y - y, P.x - x) + (spread ? rnd(-spread, spread) : 0);
    return [Math.cos(a) * speed, Math.sin(a) * speed];
  },

  addScore(n) {
    this.score += n;
    if (this.score >= this.extendAt) {
      this.spare++;
      this.extendAt += this.extendAt === 20000 ? 30000 : 50000;
      sfx('extend');
      this.showBanner(['1UP!'], 70);
    }
    if (this.score > this.hi) this.hi = this.score;
  },

  showBanner(lines, dur = 150) {
    this.banner = { lines, t: 0, dur };
  },

  /* ---------- spawning ---------- */
  spawn(type, o = {}) {
    const def = ENEMIES[type];
    if (!def) {
      console.error('Unknown enemy type', type);
      return null;
    }
    const e = {
      type, def, o,
      t: 0, dead: false, flash: 0,
      x: o.x !== undefined ? o.x : W + 16,
      y: o.y !== undefined ? o.y : 100,
      vx: 0, vy: 0,
      w: def.w, h: def.h, hx: 0, hy: 0,
      hp: Math.max(1, Math.round((o.hp || def.hp) * this.diff.hp * (1 + 0.25 * this.loop))),
      carry: !!o.carry,
      attach: null,
      flipX: false, flipY: false,
      invuln: !!def.invuln, harmless: !!def.harmless, ghost: !!def.ghost, keep: !!def.keep,
    };
    e.maxHp = e.hp;
    const at = o.attach || def.attach;
    if (at && o.wx !== undefined) {
      e.attach = at;
      e.wx = o.wx;
      e.x = e.wx - this.camX;
      if (at !== 'free') this.snapToTerrain(e);
      else e.y = o.y;
    }
    if (def.init) def.init(e, o);
    this.enemies.push(e);
    return e;
  },

  snapToTerrain(e) {
    const T = this.terrain;
    const sink = e.def.sink === undefined ? 1 : e.def.sink;
    const r = Math.max(2, Math.floor(e.w / 3));
    if (e.attach === 'floor') {
      const top = Math.min(T.floorTop(e.wx - r), T.floorTop(e.wx), T.floorTop(e.wx + r));
      e.y = top - e.h / 2 + sink;
      e.flipY = false;
    } else if (e.attach === 'ceil') {
      const bot = Math.max(T.ceilBottom(e.wx - r), T.ceilBottom(e.wx), T.ceilBottom(e.wx + r));
      e.y = bot + e.h / 2 - sink;
      e.flipY = true;
    }
  },

  pbullet(b) {
    b.t = 0;
    b.dead = false;
    if (b.pierce) b.log = new Map();
    this.pb.push(b);
    return b;
  },
  countPB(kind) {
    let n = 0;
    for (const b of this.pb) if (b.kind === kind) n++;
    return n;
  },

  /** enemy bullet. o: {spr,w,h,hp,ax,ay,solid,anim,raw,life} */
  ebullet(x, y, vx, vy, o = {}) {
    if (this.eb.length > 90) return null; // safety cap: keeps the screen readable and the frame time bounded
    const k = o.raw ? 1 : this.bulletMul();
    const b = {
      x, y, vx: vx * k, vy: vy * k, ax: (o.ax || 0) * k, ay: (o.ay || 0) * k,
      spr: o.spr || 'ebullet', w: o.w || 3, h: o.h || 3, hp: o.hp || 0,
      t: 0, life: o.life || 99999, solid: o.solid !== false, anim: o.anim === undefined ? 6 : o.anim,
      dead: false, custom: o.custom || null, harmless: false, flipX: false,
    };
    this.eb.push(b);
    if (!o.quiet) sfx('enemyShot');
    return b;
  },

  /** aimed fan of n bullets spread over `spread` radians */
  fan(x, y, n, spread, speed, o = {}) {
    const [vx, vy] = this.aim(x, y, speed);
    const a0 = Math.atan2(vy, vx);
    for (let i = 0; i < n; i++) {
      const a = a0 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
      this.ebullet(x, y, Math.cos(a) * speed, Math.sin(a) * speed, i ? Object.assign({}, o, { quiet: true }) : o);
    }
  },
  /** ring of n bullets */
  radial(x, y, n, speed, phase = 0, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = phase + (i * TAU) / n;
      this.ebullet(x, y, Math.cos(a) * speed, Math.sin(a) * speed, i ? Object.assign({}, o, { quiet: true }) : o);
    }
  },

  dropCapsule(x, y) {
    this.items.push({ type: 'capsule', x, y, vx: -0.45, t: 0, dead: false });
  },

  /* ---------- effects ---------- */
  explode(x, y, size = 's', o = {}) {
    const S = { s: ['expS', 3, 4, 'explodeS'], m: ['expM', 3, 8, 'explodeM'], l: ['expL', 3, 14, 'explodeL'], xl: ['expXL', 4, 30, 'explodeXL'] }[size] || ['expS', 3, 4, 'explodeS'];
    this.fx.push({ k: 'anim', spr: S[0], x, y, t: 0, spd: S[1], scroll: !!o.scroll });
    if (size !== 's') this.debris(x, y, S[2]);
    if (!o.quiet) sfx(S[3]);
    if (size === 'l') this.shake = Math.max(this.shake, 3);
    if (size === 'xl') this.shake = Math.max(this.shake, 10);
  },
  spark(x, y) {
    this.fx.push({ k: 'anim', spr: 'spark', x, y, t: 0, spd: 2 });
  },
  debris(x, y, n) {
    const cols = ['#ffe646', '#ff9424', '#f03a3a', '#ffffff', '#ffd430'];
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU), s = rnd(0.5, 2.6);
      this.fx.push({ k: 'part', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rndi(16, 40), t: 0, col: pick(cols), big: chance(0.25) });
    }
  },
  deflect(b) {
    this.spark(b.x + (b.w >> 1), b.y);
    sfx('deflect');
  },

  /* ---------- damage ---------- */
  hurt(e, dmg, src) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 3;
    if (e.def.onHurt) e.def.onHurt(e, dmg, src);
    if (e.hp <= 0) this.kill(e);
    else sfx('hit');
  },
  hurtPart(e, p, dmg, src) {
    p.hp -= dmg;
    p.flash = 3;
    if (e.def.onPartHurt) e.def.onPartHurt(e, p, dmg, src);
    if (p.hp <= 0) {
      p.dead = true;
      this.explode(e.x + p.ox, e.y + p.oy, p.expl || 'm', { scroll: !!e.attach });
      this.addScore(p.score || 100);
      if (e.def.onPartDeath) e.def.onPartDeath(e, p);
    } else sfx('hit');
  },
  kill(e) {
    if (e.dead) return;
    e.dead = true;
    this.addScore(e.def.score || 0);
    if (!e.def.silentDeath) this.explode(e.x, e.y, e.def.expl || 's', { scroll: !!e.attach });
    if (e.carry) this.dropCapsule(e.x, e.y);
    if (e.def.onDeath) e.def.onDeath(e);
  },
  /** area damage (missile explosions) */
  blast(x, y, r, dmg) {
    this.fx.push({ k: 'anim', spr: 'expS', x, y, t: 0, spd: 2 });
    sfx('explodeS');
    for (const e of this.enemies) {
      if (e.dead || e.ghost) continue;
      if (e.parts) {
        for (const p of e.parts) {
          if (p.dead) continue;
          if (overlap(x, y, r * 2, r * 2, e.x + p.ox, e.y + p.oy, p.w, p.h) && p.vuln !== false && !e.invuln) this.hurtPart(e, p, dmg, null);
        }
      } else if (!e.invuln && overlap(x, y, r * 2, r * 2, e.x + e.hx, e.y + e.hy, e.w, e.h)) this.hurt(e, dmg, null);
    }
  },

  onPlayerDeath() {
    this.rank = 0;
  },

  /* ================= stage loading / flow ================= */
  loadStage(idx) {
    const st = STAGES[idx];
    this.stage = st;
    this.stageIdx = idx;
    this.terrain = null;
    const tdef = typeof st.terrain === 'function' ? st.terrain() : st.terrain;
    this.terrain = Terrain.build(tdef);
    this.bg = st.background();
    const S = new StageBuilder();
    st.script(S);
    this.events = S.finish();
    this.cpIdx = 0;
    if (st.onLoad) st.onLoad(this);
  },

  resetWorld(camX) {
    this.camX = camX;
    this.camAcc = 0;
    this.camTarget = this.stage.scroll;
    this.camSpeed = this.stage.scroll;
    this.camDX = 0;
    this.enemies.length = 0;
    this.pb.length = 0;
    this.eb.length = 0;
    this.items.length = 0;
    this.fx.length = 0;
    this.queue.length = 0;
    this.bossPhase = null;
    this.boss = null;
    this.clearT = 0;
    this.banner = null;
    let i = this.events.findIndex((ev) => ev.at >= camX);
    if (i < 0) i = this.events.length;
    this.evIdx = i;
    // terrain-anchored enemies that are already on screen at this checkpoint
    for (let k = 0; k < i; k++) {
      const ev = this.events[k];
      if (ev.wx !== undefined && ev.wx > camX - 30) ev.run();
    }
    if (this.stage.onReset) this.stage.onReset(this);
  },

  respawnAtCheckpoint() {
    const cp = this.stage.checkpoints[this.cpIdx] || 0;
    const wasBoss = this.bossPhase;
    this.resetWorld(cp);
    this.player.respawn(false);
    if (wasBoss) bgm.play(this.stage.music, { restart: true });
  },

  /* boss sequence: warn -> fight -> dying -> clear */
  beginBoss(type, o = {}) {
    if (this.bossPhase) return;
    this.bossPhase = 'warn';
    this.bossT = 0;
    this.bossSpec = { type, o };
    this.camTarget = 0;
    bgm.stop(0.6);
    sfx('warning');
  },
  bossDefeated(e) {
    this.bossPhase = 'dying';
    this.bossT = 0;
    this.eb.length = 0;
    this.player.inv = 99999;
    bgm.stop(0.2);
    for (const o of this.enemies) if (!o.dead && o !== e && !o.keepOnBoss) this.kill(o);
    // chain of explosions
    for (let i = 0; i < 26; i++) {
      this.later(i * 5, () => this.explode(e.x + rnd(-e.w / 2, e.w / 2), e.y + rnd(-e.h / 2, e.h / 2), i % 4 === 3 ? 'l' : 'm', { quiet: i % 2 === 1 }));
    }
    this.later(135, () => {
      this.explode(e.x, e.y, 'xl');
      this.flash = 8;
    });
    this.later(190, () => {
      this.bossPhase = 'clear';
      this.clearT = 0;
      bgm.play('clear', { loop: false });
      this.player.auto = { vx: 0, vy: 0 };
    });
  },
  nextStage() {
    if (this.stageIdx + 1 < STAGES.length) this.setMode('intro', this.stageIdx + 1);
    else this.setMode('ending');
  },

  startGame() {
    this.score = 0;
    this.extendAt = 20000;
    this.spare = this.diff.spare;
    this.continues = 0;
    this.loop = 0;
    this.player.resetAll();
    this.keepUpgrades = false;
    Store.set('nova.diff', this.diffKey);
    this.setMode('intro', this.startStage || 0);
  },

  saveHi() {
    if (this.score >= this.hi) {
      this.hi = this.score;
      Store.set('nova.hi', this.hi);
    }
  },

  /* ================= per-frame world update ================= */
  updateCamera() {
    this.camSpeed += (this.camTarget - this.camSpeed) * 0.05;
    if (Math.abs(this.camTarget - this.camSpeed) < 0.004) this.camSpeed = this.camTarget;
    this.camAcc += this.camSpeed;
    let d = Math.floor(this.camAcc);
    this.camAcc -= d;
    const maxX = this.terrain.length - W;
    if (this.camX + d > maxX) d = Math.max(0, maxX - this.camX);
    this.camX += d;
    this.camDX = d;
  },

  runScript() {
    const ev = this.events;
    while (this.evIdx < ev.length && ev[this.evIdx].at <= this.camX) {
      ev[this.evIdx].run();
      this.evIdx++;
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (--q.t <= 0) {
        this.queue.splice(i, 1);
        q.fn();
      }
    }
    const cps = this.stage.checkpoints;
    while (this.cpIdx + 1 < cps.length && this.camX >= cps[this.cpIdx + 1]) this.cpIdx++;
    // optional per-section scroll speed: stage.scrollMap = [[camX, pxPerFrame], ...]
    const sm = this.stage.scrollMap;
    if (sm && !this.bossPhase) {
      let v = this.stage.scroll;
      for (const [x, sp] of sm) if (this.camX >= x) v = sp;
      this.camTarget = v;
    }
  },

  updateBossFlow() {
    if (!this.bossPhase) return;
    this.bossT++;
    if (this.bossPhase === 'warn' && this.bossT === 150) {
      const s = this.bossSpec;
      this.boss = this.spawn(s.type, Object.assign({ x: W + 60, y: 112, boss: true }, s.o));
      this.bossPhase = 'fight';
      this.bossT = 0;
      bgm.play(s.o.music || this.stage.bossMusic || 'boss');
    }
    if (this.bossPhase === 'clear') {
      this.clearT++;
      if (this.clearT === 60) this.player.auto = { vx: 0.2, vy: 0 };
      if (this.clearT > 60 && this.clearT < 200) this.player.auto.vx = Math.min(5, this.player.auto.vx + 0.07);
      if (this.clearT === 40) this.saveHi();
      if (this.clearT > 330) this.nextStage();
    }
  },

  updateEnemies() {
    const camX = this.camX;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t++;
      if (e.flash > 0) e.flash--;
      if (e.parts) for (const p of e.parts) if (p.flash > 0) p.flash--;
      if (e.def.update) e.def.update(e);
      if (e.attach) e.x = e.wx - camX;
      else {
        e.x += e.vx;
        e.y += e.vy;
      }
      if (!e.keep && !e.dead) {
        if (e.attach) {
          if (e.x < -e.w - 40) e.dead = true;
        } else if (e.x < -e.w - 60 || e.x > W + 160 || e.y < -80 || e.y > H + 80) e.dead = true;
      }
    }
  },

  updateMissile(b) {
    const T = this.terrain, camX = this.camX;
    if (b.state === 'fall') {
      b.vy = Math.min(b.vy + 0.14, 2.8);
      b.vx = Math.min(b.vx + 0.02, 2.4);
      b.x += b.vx;
      b.y += b.vy;
      if (T.solid(camX + b.x + 2, b.y + 3) || T.solid(camX + b.x, b.y + 4)) {
        b.state = 'crawl';
        b.vy = 0;
      }
    } else {
      b.x += 2.6;
      const wx = camX + b.x;
      let guard = 0;
      while (T.solid(wx + 3, b.y + 1) && guard < 5) {
        b.y -= 1;
        guard++;
      }
      if (guard >= 5) {
        b.dead = true;
        this.blast(b.x, b.y, 8, 3);
        return;
      }
      if (!T.solid(wx, b.y + 4) && !T.solid(wx + 2, b.y + 4)) {
        b.state = 'fall';
        b.vy = 0.6;
      }
    }
  },

  laserReady(b, key) {
    const last = b.log.get(key);
    if (last !== undefined && this.frame - last < 4) return false;
    b.log.set(key, this.frame);
    return true;
  },

  bulletHitsEnemy(b, e) {
    if (e.parts) {
      for (const p of e.parts) {
        if (p.dead) continue;
        if (!overlap(b.x, b.y, b.w, b.h, e.x + p.ox, e.y + p.oy, p.w, p.h)) continue;
        if (p.vuln === false || e.invuln || p.invuln) {
          if (p.solid === false) continue;
          this.deflect(b);
          b.dead = true;
          return true;
        }
        if (b.pierce && !this.laserReady(b, p)) return false;
        this.hurtPart(e, p, b.dmg, b);
        return true;
      }
      return false;
    }
    if (!overlap(b.x, b.y, b.w, b.h, e.x + e.hx, e.y + e.hy, e.w, e.h)) return false;
    if (e.invuln) {
      this.deflect(b);
      b.dead = true;
      return true;
    }
    if (b.pierce && !this.laserReady(b, e)) return false;
    this.hurt(e, b.dmg, b);
    return true;
  },

  updatePlayerBullets() {
    const T = this.terrain, camX = this.camX;
    for (const b of this.pb) {
      if (b.dead) continue;
      b.t++;
      if (b.kind === 'missile') this.updateMissile(b);
      else {
        b.x += b.vx;
        b.y += b.vy || 0;
      }
      if (b.dead) continue;
      if (b.x < -40 || b.x > W + 50 || b.y < -30 || b.y > H + 30) {
        b.dead = true;
        continue;
      }
      const lead = b.kind === 'laser' ? b.x + b.w / 2 : b.x + (b.vx > 0 ? b.w / 2 : 0);
      if (b.kind !== 'missile' && T.solid(camX + lead, b.y)) {
        b.dead = true;
        this.fx.push({ k: 'anim', spr: 'spark', x: lead, y: b.y, t: 0, spd: 2, scroll: true });
        continue;
      }
      for (const e of this.enemies) {
        if (e.dead || e.ghost) continue;
        if (this.bulletHitsEnemy(b, e)) {
          if (b.kind === 'missile') {
            b.dead = true;
            this.blast(b.x, b.y, 7, 2);
          } else if (!b.pierce) b.dead = true;
        }
        if (b.dead) break;
      }
      if (!b.dead) {
        for (const eb of this.eb) {
          if (eb.hp > 0 && !eb.dead && overlap(b.x, b.y, b.w, b.h, eb.x, eb.y, eb.w + 2, eb.h + 2)) {
            eb.hp -= b.dmg;
            if (eb.hp <= 0) {
              eb.dead = true;
              this.explode(eb.x, eb.y, 's');
              this.addScore(50);
            } else sfx('hit');
            if (!b.pierce) b.dead = true;
            if (b.dead) break;
          }
        }
      }
    }
  },

  updateEnemyBullets() {
    const T = this.terrain, camX = this.camX;
    for (const b of this.eb) {
      if (b.dead) continue;
      b.t++;
      if (b.custom) b.custom(b);
      b.vx += b.ax;
      b.vy += b.ay;
      b.x += b.vx;
      b.y += b.vy;
      if (b.t > b.life || b.x < -14 || b.x > W + 14 || b.y < -14 || b.y > H + 14) {
        b.dead = true;
        continue;
      }
      if (b.solid && T.solid(camX + b.x, b.y)) b.dead = true;
    }
  },

  updateItems() {
    const P = this.player;
    for (const it of this.items) {
      it.t++;
      it.x += it.vx;
      it.y += Math.sin(it.t * 0.09) * 0.25;
      if (it.x < -12) it.dead = true;
      if (P.alive && !it.dead && overlap(P.x, P.y, 20, 12, it.x, it.y, 10, 8)) {
        it.dead = true;
        P.collectCapsule();
      }
    }
  },

  updateFx() {
    for (const f of this.fx) {
      f.t++;
      if (f.scroll) f.x -= this.camDX;
      if (f.k === 'anim') {
        const n = Sprites.size(f.spr).n;
        if (f.t >= n * f.spd) f.dead = true;
      } else if (f.k === 'part') {
        f.x += f.vx;
        f.y += f.vy;
        f.vy += 0.04;
        if (f.t > f.life) f.dead = true;
      } else if (f.k === 'fn') {
        if (f.t > f.life) f.dead = true;
      }
    }
  },

  collidePlayer() {
    const P = this.player;
    if (!P.alive) return;
    const T = this.terrain, camX = this.camX;
    if (!this.god && P.enterT <= 0 && T.rect(camX + P.x - 7, P.y - 3, 14, 6)) {
      this.lastHit = { kind: 'terrain', name: 'terrain', camX };
      P.die();
      return;
    }
    // enemy bullets
    const shieldOn = P.shield > 0;
    for (const b of this.eb) {
      if (b.dead || b.harmless) continue;
      if (shieldOn && P.shield > 0 && overlap(P.x + 18, P.y, 9, 25, b.x, b.y, b.w, b.h)) {
        b.dead = true;
        P.absorbShield();
        continue;
      }
      if (overlap(P.x, P.y, 8, 4, b.x, b.y, b.w, b.h)) {
        b.dead = true;
        this.lastHit = { kind: 'bullet', name: b.spr, camX: this.camX };
        P.hit();
        if (!P.alive) return;
      }
    }
    // enemy bodies
    for (const e of this.enemies) {
      if (e.dead || e.harmless) continue;
      if (e.parts) {
        for (const p of e.parts) {
          if (p.dead || p.harmless) continue;
          // a live shield absorbs one contact with a part and grants a short grace period to back off
          if (shieldOn && P.shield > 0 && P.inv <= 0 && overlap(P.x + 18, P.y, 9, 25, e.x + p.ox, e.y + p.oy, p.w, p.h)) {
            P.absorbShield();
            P.inv = Math.max(P.inv, 45);
            break;
          }
          if (overlap(P.x, P.y, 9, 5, e.x + p.ox, e.y + p.oy, p.w, p.h)) {
            this.lastHit = { kind: 'enemy', name: e.type + '.' + (p.name || ''), camX: this.camX };
            P.hit();
            if (!P.alive) return;
          }
        }
      } else {
        if (shieldOn && P.shield > 0 && !e.invuln && overlap(P.x + 18, P.y, 9, 25, e.x + e.hx, e.y + e.hy, e.w, e.h)) {
          P.absorbShield();
          this.hurt(e, 3, null);
          continue;
        }
        if (overlap(P.x, P.y, 9, 5, e.x + e.hx, e.y + e.hy, e.w, e.h)) {
          this.lastHit = { kind: 'enemy', name: e.type, camX: this.camX };
          P.hit();
          if (!P.alive) return;
        }
      }
    }
  },

  cleanup() {
    const compact = (arr) => {
      let j = 0;
      for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
      arr.length = j;
    };
    compact(this.enemies);
    compact(this.pb);
    compact(this.eb);
    compact(this.items);
    compact(this.fx);
  },

  updateRank() {
    const P = this.player;
    if (!P.alive) return;
    const v = (P.speedLv / 5 + P.options / 4 + (P.missile ? 1 : 0) + (P.laser || P.dbl ? 1 : 0)) / 4;
    this.rank += (v - this.rank) * 0.01;
  },

  /** one simulation step of the world (used by play mode and by tests) */
  stepWorld() {
    const P = this.player;
    this.updateCamera();
    this.runScript();
    this.updateBossFlow();
    P.update();
    this.updateEnemies();
    this.updatePlayerBullets();
    this.updateEnemyBullets();
    this.updateItems();
    this.updateFx();
    this.collidePlayer();
    this.cleanup();
    this.updateRank();
    if (this.shake > 0) this.shake -= 0.5;
    if (this.flash > 0) this.flash--;
    if (this.banner && ++this.banner.t > this.banner.dur) this.banner = null;
    if (!P.alive && P.deadT >= 110) {
      if (this.spare > 0) {
        this.spare--;
        this.respawnAtCheckpoint();
      } else {
        this.saveHi();
        this.setMode('gameover');
      }
    }
  },

  /* ================= drawing ================= */
  drawWorld(c) {
    c.save();
    if (this.shake > 0.5) c.translate(rndi(-1, 1) * Math.min(3, this.shake), rndi(-1, 1) * Math.min(3, this.shake));
    this.bg.draw(c, this.camX, this.frame);
    this.terrain.draw(c, this.camX);
    for (const it of this.items) Sprites.draw(c, 'capsule', it.x, it.y, { frame: (it.t >> 3) & 3 });
    for (const e of this.enemies) this.drawEnemy(c, e);
    this.player.draw(c);
    this.drawPlayerBullets(c);
    for (const b of this.eb) {
      const fr = b.anim ? (b.t / b.anim) | 0 : 0;
      Sprites.draw(c, b.spr, b.x, b.y, { frame: fr, flipX: b.flipX });
    }
    for (const f of this.fx) {
      if (f.k === 'anim') Sprites.draw(c, f.spr, f.x, f.y, { frame: (f.t / f.spd) | 0 });
      else if (f.k === 'fn') f.draw(c, f);
      else {
        c.fillStyle = f.col;
        const s = f.big ? 2 : 1;
        c.globalAlpha = f.t > f.life - 8 ? (f.life - f.t) / 8 : 1;
        c.fillRect(Math.round(f.x), Math.round(f.y), s, s);
        c.globalAlpha = 1;
      }
    }
    c.restore();
    if (this.flash > 0 && !this.reduceFlash) {
      c.globalAlpha = Math.min(1, this.flash / 6);
      c.fillStyle = '#fff';
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  },

  drawEnemy(c, e) {
    const d = e.def;
    if (d.draw) {
      d.draw(e, c);
      return;
    }
    const name = typeof d.spr === 'function' ? d.spr(e) : d.spr;
    const fr = d.fps ? (e.t / d.fps) | 0 : e.frame || 0;
    Sprites.draw(c, name, e.x, e.y, { frame: fr, flipX: e.flipX, flipY: e.flipY, flash: e.flash > 0 });
  },

  drawPlayerBullets(c) {
    for (const b of this.pb) {
      if (b.kind === 'laser') {
        const x = Math.round(b.x - b.w / 2), y = Math.round(b.y);
        c.fillStyle = '#48ecf4';
        c.fillRect(x, y - 1, b.w, 3);
        c.fillStyle = '#ffffff';
        c.fillRect(x + 1, y, b.w - 2, 1);
        c.fillStyle = '#2a96c8';
        c.fillRect(x - 1, y, 1, 1);
      } else if (b.kind === 'missile') {
        if (b.state === 'fall') Sprites.draw(c, 'missileD', b.x, b.y);
        else Sprites.draw(c, 'missileH', b.x, b.y);
      } else Sprites.draw(c, b.spr, b.x, b.y);
    }
  },

  pad(n, w) {
    let s = String(Math.max(0, Math.floor(n)));
    while (s.length < w) s = '0' + s;
    return s;
  },

  drawHud(c) {
    const P = this.player;
    PixFont.text(c, '1UP', 8, 3, { color: '#ffe646', shadow: '#000' });
    PixFont.text(c, this.pad(this.score, 7), 30, 3, { color: '#ffffff', shadow: '#000' });
    PixFont.text(c, 'HI', 112, 3, { color: '#ff6a6a', shadow: '#000' });
    PixFont.text(c, this.pad(this.hi, 7), 128, 3, { color: '#ffffff', shadow: '#000' });
    if (this.stage) PixFont.text(c, 'ST ' + this.stage.id + (this.loop ? '-' + (this.loop + 1) : ''), W - 8, 3, { color: '#9eb4ff', shadow: '#000', align: 'right' });

    // boss gauge
    if (this.bossPhase === 'fight' && this.boss && !this.boss.dead && this.boss.def.gauge) {
      const f = clamp(this.boss.def.gauge(this.boss), 0, 1);
      c.fillStyle = '#000';
      c.fillRect(78, 15, 100, 4);
      c.fillStyle = '#7a1c2c';
      c.fillRect(79, 16, 98, 2);
      c.fillStyle = f > 0.3 ? '#ff5a3a' : '#ffe646';
      c.fillRect(79, 16, Math.round(98 * f), 2);
    }

    // bottom bar: lives + power meter
    const y0 = H - 13;
    c.fillStyle = 'rgba(8,10,24,0.72)';
    c.fillRect(0, y0 - 1, W, 14);
    Sprites.draw(c, 'shipMini', 14, y0 + 6);
    PixFont.text(c, String(this.spare), 24, y0 + 3, { color: '#ffffff' });
    for (let i = 0; i < 6; i++) {
      const x = 38 + i * 36;
      const lit = P.meter === i;
      const usable = P.canUse(i);
      c.fillStyle = lit ? '#ffb020' : '#0e1430';
      c.fillRect(x, y0, 34, 11);
      c.fillStyle = lit ? '#fff2a8' : usable ? '#4a5aa8' : '#2a3050';
      c.fillRect(x, y0, 34, 1);
      c.fillRect(x, y0 + 10, 34, 1);
      c.fillRect(x, y0, 1, 11);
      c.fillRect(x + 33, y0, 1, 11);
      const label = SLOT_NAMES[i];
      PixFont.text(c, label, x + 17, y0 + 3, { font: '3x5', color: lit ? '#3a1800' : usable ? '#c8d4ff' : '#4a5278', align: 'center' });
      // level pips
      const lvl = i === 0 ? P.speedLv : i === 4 ? P.options : i === 1 ? +P.missile : i === 2 ? +P.dbl : i === 3 ? +P.laser : P.shield > 0 ? 1 : 0;
      const max = i === 0 ? MAX_SPEED_LV : i === 4 ? MAX_OPTIONS : 1;
      if (lvl > 0) {
        for (let k = 0; k < Math.min(lvl, max); k++) {
          c.fillStyle = lit ? '#3a1800' : '#6cf0ff';
          c.fillRect(x + 2 + k * (max > 1 ? 3 : 0), y0 + 1, max > 1 ? 2 : 3, 1);
        }
      }
    }

    // banner
    if (this.banner) {
      const b = this.banner;
      const a = b.t < 12 ? b.t / 12 : b.t > b.dur - 20 ? (b.dur - b.t) / 20 : 1;
      c.globalAlpha = clamp(a, 0, 1);
      b.lines.forEach((ln, i) => {
        PixFont.text(c, ln, W / 2, 70 + i * 16, { align: 'center', scale: i === 0 ? 2 : 1, color: i === 0 ? '#ffffff' : '#ffe646', outline: '#000' });
      });
      c.globalAlpha = 1;
    }

    // WARNING
    if (this.bossPhase === 'warn') {
      const on = this.reduceFlash || ((this.bossT / 12) | 0) % 2 === 0;
      const y = 92;
      c.fillStyle = 'rgba(120,0,0,0.55)';
      c.fillRect(0, y - 6, W, 34);
      c.fillStyle = on ? '#ff3030' : '#801010';
      for (let x = -((this.bossT * 2) % 16); x < W; x += 16) c.fillRect(x, y - 6, 8, 3), c.fillRect(x + 8, y + 25, 8, 3);
      if (on) PixFont.text(c, 'WARNING', W / 2, y + 4, { align: 'center', scale: 3, color: '#ffffff', outline: '#a00000' });
    }
    if (this.bossPhase === 'clear' && this.clearT > 20) {
      PixFont.text(c, 'STAGE ' + this.stage.id + ' CLEAR', W / 2, 88, { align: 'center', scale: 2, color: '#ffffff', outline: '#003060' });
      PixFont.text(c, this.stage.name, W / 2, 110, { align: 'center', color: '#ffe646', shadow: '#000' });
    }

    if (this.debug) {
      PixFont.text(c, `E${this.enemies.length} B${this.pb.length}/${this.eb.length} X${this.camX} R${this.rank.toFixed(2)}`, 4, 22, { font: '3x5', color: '#0f0' });
    }
  },
};

/* ------------------------------------------------------------------
 * Modes
 * ------------------------------------------------------------------ */
const MODES = {
  /* ---------- title ---------- */
  title: {
    enter() {
      this.titleBg = Backgrounds.make([
        { kind: 'gradient', stops: [[0, '#02030c'], [0.55, '#0c0c30'], [1, '#3a1450']], steps: 16 },
        { kind: 'stars', n: 44, speed: 0, drift: 0.12, seed: 2 },
        { kind: 'stars', n: 30, speed: 0, drift: 0.3, seed: 8, colors: ['#a8c8ff', '#ffffff'] },
        { kind: 'stars', n: 16, speed: 0, drift: 0.7, seed: 4, big: 0.4 },
        { kind: 'ridge', color: '#3a1c5c', color2: '#1a0c30', edge: '#8a48b0', hMin: 14, hMax: 44, speed: 0, drift: 0.25, seed: 9, jag: 0.5 },
      ]);
      this.player.resetAll();
      this.player.x = 60;
      this.player.y = 150;
      bgm.play('title');
      if (this.q && this.q.get('title') === 'nomusic') bgm.stop(0);
    },
    update() {
      if (Input.pressed.left) {
        this.diffKey = DIFF_ORDER[(DIFF_ORDER.indexOf(this.diffKey) + 2) % 3];
        this.diff = DIFFS[this.diffKey];
        sfx('select');
      }
      if (Input.pressed.right) {
        this.diffKey = DIFF_ORDER[(DIFF_ORDER.indexOf(this.diffKey) + 1) % 3];
        this.diff = DIFFS[this.diffKey];
        sfx('select');
      }
      if (STAGES.length > 1) {
        if (Input.pressed.up) {
          this.startStage = (this.startStage + STAGES.length - 1) % STAGES.length;
          sfx('select');
        }
        if (Input.pressed.down) {
          this.startStage = (this.startStage + 1) % STAGES.length;
          sfx('select');
        }
      }
      if (Input.pressed.start && this.modeT > 10) {
        sfx('start');
        this.startGame();
      }
      this.player.animT++;
    },
    draw(c) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, W, H);
      this.titleBg.draw(c, 0, this.frame);
      const t = this.frame;
      // ship cruising
      const sx = 128 + Math.sin(t * 0.02) * 100, sy = 13 + Math.sin(t * 0.035) * 3;
      Sprites.draw(c, 'flame', sx - 17, sy, { frame: (t >> 1) & 1 });
      Sprites.draw(c, 'ship', sx, sy, { frame: 0 });
      // logo
      const rows = ['#ffffff', '#dff4ff', '#8cd8ff', '#48a8f0', '#3070d8', '#2848a8', '#1c2c78'];
      PixFont.text(c, 'NOVA', W / 2, 30, { align: 'center', scale: 5, rows, outline: '#0a0a30', spacing: 2 });
      PixFont.text(c, 'LANCER', W / 2, 72, { align: 'center', scale: 5, rows: ['#fff6c8', '#ffe270', '#ffb030', '#ff7820', '#d84018', '#a02010', '#601010'], outline: '#2a0808', spacing: 2 });
      PixFont.text(c, 'HORIZONTAL SHOOTER', W / 2, 112, { align: 'center', color: '#9eb4ff', shadow: '#000' });
      if (((t / 30) | 0) % 2 === 0) PixFont.text(c, 'PRESS START', W / 2, 130, { align: 'center', scale: 2, color: '#ffffff', outline: '#000' });
      PixFont.text(c, '< ' + this.diff.name + ' >', W / 2, 154, { align: 'center', color: '#ffe646', shadow: '#000' });
      if (STAGES.length > 1) {
        const st = STAGES[this.startStage] || STAGES[0];
        PixFont.text(c, 'STAGE ' + st.id + '  ' + st.name, W / 2, 166, { align: 'center', color: '#8cd8ff', shadow: '#000' });
        PixFont.text(c, 'UP/DOWN: STAGE   LEFT/RIGHT: LEVEL', W / 2, 176, { align: 'center', font: '3x5', color: '#8090c8' });
      }
      PixFont.text(c, 'HI ' + this.pad(this.hi, 7), W / 2, 188, { align: 'center', color: '#ffffff', shadow: '#000' });
      PixFont.text(c, 'ARROWS/WASD:MOVE  Z/SPACE:SHOT  X/SHIFT:POWER UP', W / 2, 203, { align: 'center', font: '3x5', color: '#8090c8' });
      PixFont.text(c, 'P:PAUSE  M:MUTE  F:FULLSCREEN  V:FLASH  ENTER/CLICK:START', W / 2, 211, { align: 'center', font: '3x5', color: '#8090c8' });
    },
  },

  /* ---------- stage intro (black screen + name; the stage is built here) ---------- */
  intro: {
    enter(idx) {
      this.pendingStage = idx;
      this.built = false;
      bgm.stop(0.3);
    },
    update() {
      if (this.modeT === 3 && !this.built) {
        this.loadStage(this.pendingStage);
        this.resetWorld(this.stage.checkpoints[0]);
        this.player.respawn(this.keepUpgrades);
        this.keepUpgrades = true;
        this.built = true;
      }
      if (this.modeT >= 130) this.setMode('play');
    },
    draw(c) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, W, H);
      const st = STAGES[this.pendingStage];
      const a = clamp(this.modeT / 20, 0, 1) * clamp((130 - this.modeT) / 20, 0, 1);
      c.globalAlpha = a;
      PixFont.text(c, 'STAGE ' + st.id, W / 2, 92, { align: 'center', scale: 3, color: '#ffffff', outline: '#102060' });
      PixFont.text(c, st.name, W / 2, 122, { align: 'center', scale: 2, color: '#ffe646', outline: '#402000' });
      if (st.sub) PixFont.text(c, st.sub, W / 2, 144, { align: 'center', color: '#9eb4ff', shadow: '#000' });
      if (this.loop) PixFont.text(c, 'LOOP ' + (this.loop + 1), W / 2, 160, { align: 'center', color: '#ff8080', shadow: '#000' });
      c.globalAlpha = 1;
    },
  },

  /* ---------- play ---------- */
  play: {
    enter() {
      bgm.play(this.stage.music, { restart: true });
      if (this.modeT === 0 && this.camX === this.stage.checkpoints[0]) this.showBanner(['STAGE ' + this.stage.id, this.stage.name], 110);
    },
    update() {
      if (Input.pressed.pause) {
        this.setMode('paused');
        return;
      }
      this.stepWorld();
    },
    draw(c) {
      this.drawWorld(c);
      this.drawHud(c);
    },
  },

  paused: {
    enter() {
      sfx('pause');
      bgm.pause();
    },
    update() {
      if (Input.pressed.pause || Input.pressed.start) {
        sfx('unpause');
        bgm.resume();
        this.mode = 'play';
        this.modeT = 0;
      }
      if (Input.pressed.quit) this.setMode('title');
    },
    draw(c) {
      this.drawWorld(c);
      this.drawHud(c);
      c.fillStyle = 'rgba(0,0,20,0.55)';
      c.fillRect(0, 0, W, H);
      PixFont.text(c, 'PAUSE', W / 2, 92, { align: 'center', scale: 3, color: '#ffffff', outline: '#102060' });
      PixFont.text(c, 'P / ENTER : RESUME', W / 2, 124, { align: 'center', color: '#ffe646', shadow: '#000' });
      PixFont.text(c, 'Q : QUIT TO TITLE', W / 2, 138, { align: 'center', color: '#9eb4ff', shadow: '#000' });
    },
  },

  gameover: {
    enter() {
      bgm.play('gameover', { loop: false });
      this.saveHi();
    },
    update() {
      if (this.modeT > 90 && Input.pressed.start) {
        // continue from the last checkpoint of this stage
        this.continues++;
        this.spare = this.diff.spare;
        this.player.resetAll();
        this.resetWorld(this.stage.checkpoints[this.cpIdx] || 0);
        this.player.respawn(false);
        this.mode = 'play';
        this.modeT = 0;
        bgm.play(this.stage.music, { restart: true });
        sfx('start');
      }
      if (this.modeT > 90 && Input.pressed.back) this.setMode('title');
    },
    draw(c) {
      this.drawWorld(c);
      c.fillStyle = 'rgba(0,0,0,' + clamp(this.modeT / 90, 0, 0.7) + ')';
      c.fillRect(0, 0, W, H);
      PixFont.text(c, 'GAME OVER', W / 2, 84, { align: 'center', scale: 3, color: '#ff5a5a', outline: '#300000' });
      PixFont.text(c, 'SCORE ' + this.pad(this.score, 7), W / 2, 116, { align: 'center', color: '#ffffff', shadow: '#000' });
      if (this.modeT > 90) {
        if (((this.modeT / 30) | 0) % 2 === 0) PixFont.text(c, 'ENTER : CONTINUE', W / 2, 140, { align: 'center', color: '#ffe646', shadow: '#000' });
        PixFont.text(c, 'ESC : TITLE', W / 2, 154, { align: 'center', color: '#9eb4ff', shadow: '#000' });
      }
    },
  },

  ending: {
    enter() {
      bgm.play('ending', { loop: false });
      this.saveHi();
      this.endBg = Backgrounds.make([
        { kind: 'gradient', stops: [[0, '#000010'], [1, '#0c1c50']], steps: 14 },
        { kind: 'stars', n: 70, speed: 0, drift: 0.4, seed: 21 },
        { kind: 'stars', n: 30, speed: 0, drift: 0.9, seed: 22, big: 0.3 },
      ]);
    },
    update() {
      if (this.modeT > 60 && Input.pressed.back) {
        this.setMode('title');
        return;
      }
      if (this.modeT > 300 && Input.pressed.start) {
        // second loop: harder
        this.loop++;
        this.keepUpgrades = true;
        this.setMode('intro', 0);
      }
    },
    draw(c) {
      this.endBg.draw(c, 0, this.frame);
      const y = 40 - Math.min(0, 0);
      PixFont.text(c, 'CONGRATULATIONS!', W / 2, y, { align: 'center', scale: 2, color: '#ffe646', outline: '#402000' });
      PixFont.text(c, 'THE FORTRESS HAS FALLEN.', W / 2, y + 30, { align: 'center', color: '#ffffff', shadow: '#000' });
      PixFont.text(c, 'PEACE RETURNS TO THE GALAXY.', W / 2, y + 44, { align: 'center', color: '#ffffff', shadow: '#000' });
      PixFont.text(c, 'SCORE ' + this.pad(this.score, 7), W / 2, y + 74, { align: 'center', color: '#8cd8ff', shadow: '#000' });
      PixFont.text(c, 'DIFFICULTY ' + this.diff.name, W / 2, y + 88, { align: 'center', color: '#9eb4ff', shadow: '#000' });
      if (this.continues) PixFont.text(c, 'CONTINUES ' + this.continues, W / 2, y + 100, { align: 'center', color: '#ff8080', shadow: '#000' });
      Sprites.draw(c, 'flame', 100 + ((this.frame * 0.6) % 180) - 17, 170, { frame: (this.frame >> 1) & 1 });
      Sprites.draw(c, 'ship', 100 + ((this.frame * 0.6) % 180), 170, { frame: 0 });
      if (this.modeT > 300 && ((this.modeT / 30) | 0) % 2 === 0) PixFont.text(c, 'PRESS START : NEXT LOOP', W / 2, 198, { align: 'center', color: '#ffffff', shadow: '#000' });
      if (this.modeT > 300) PixFont.text(c, 'ESC : TITLE', W / 2, 210, { align: 'center', font: '3x5', color: '#8090c8' });
    },
  },
};
