'use strict';
/* =============================================================
 * Developer tools (not used by normal play).
 *
 *   G.lint(stageIndex)   dry-runs a stage's script up to the boss and
 *                        reports design problems: enemies spawning inside
 *                        terrain, anchored enemies without a surface,
 *                        too-narrow corridors, unsafe checkpoints, few
 *                        capsule carriers, unknown enemy types ...
 *   G.gallery(pattern)   draw every sprite whose name starts with pattern
 *
 * Open the game with ?debug=1 to show entity counters.
 * ============================================================= */
Object.assign(G, {
  lint(idx) {
    const out = { stage: idx + 1, issues: [], info: {} };
    const warn = (msg) => out.issues.push(msg);
    const saved = { god: this.god, spawn: this.spawn, mode: this.mode };
    try {
      this.player.resetAll();
      this.loadStage(idx);
      const st = this.stage;
      const T = this.terrain;
      this.resetWorld(0);
      this.player.respawn(false);
      this.player.enterT = 0;
      this.player.x = 44;
      this.player.y = 112;
      this.god = true;

      /* --- terrain corridor --- */
      const endX = st.bossX + W;
      let worst = { gap: H, x: 0 };
      for (let x = 0; x < endX; x += 2) {
        const g = T.floorTop(x) - T.ceilBottom(x);
        if (g < worst.gap) worst = { gap: g, x };
      }
      out.info.narrowestGap = worst;
      if (worst.gap < 84) warn(`corridor only ${worst.gap}px tall at world x=${worst.x} (want >= 84)`);
      const arena = T.minGap(st.bossX - 20, st.bossX + W);
      out.info.arenaGap = arena;
      if (arena < 130) warn(`boss arena corridor only ${arena}px tall (want >= 130)`);
      if (T.length < st.bossX + W + 8) warn(`terrain length ${T.length} shorter than bossX+W=${st.bossX + W}`);

      /* --- checkpoints must not start inside scenery --- */
      st.checkpoints.forEach((cp, i) => {
        if (T.rect(cp + 26, 92, 40, 40)) warn(`checkpoint ${i} (x=${cp}) starts inside terrain near the respawn point`);
        if (i > 0 && cp <= st.checkpoints[i - 1]) warn(`checkpoint ${i} is not after the previous one`);
      });

      /* --- dry run: record spawns --- */
      const log = [];
      const orig = this.spawn;
      this.spawn = (type, o) => {
        const e = orig.call(this, type, o);
        // snapshot at spawn time (entities move afterwards)
        log.push({ type, o: o || {}, e, cam: this.camX, snap: e ? { x: e.x, y: e.y, wx: e.wx, attach: e.attach, carry: e.carry, def: e.def } : null });
        return e;
      };
      let frames = 0;
      while (this.camX < st.bossX + 4 && frames < 40000) {
        this.player.inv = 999;
        this.stepWorld();
        frames++;
      }
      this.spawn = orig;
      out.info.frames = frames;
      out.info.seconds = Math.round(frames / 60);
      out.info.spawned = log.length;

      const byType = {};
      let carriers = 0;
      const carrierX = [];
      for (const s of log) {
        byType[s.type] = (byType[s.type] || 0) + 1;
        if (!s.e) {
          warn(`unknown enemy type '${s.type}' spawned at camX=${s.cam}`);
          continue;
        }
        const e = s.snap;
        if (e.carry) {
          carriers++;
          carrierX.push(s.cam);
        }
        if (e.def.hatchCarry) carriers++;
        const wx = e.attach ? e.wx : s.cam + e.x;
        if (e.attach === 'floor' && T.floorTop(wx) >= H) warn(`'${s.type}' anchored to the floor at world x=${Math.round(wx)} but there is no floor`);
        else if (e.attach === 'ceil' && T.ceilBottom(wx) <= 0) warn(`'${s.type}' anchored to the ceiling at world x=${Math.round(wx)} but there is no ceiling`);
        else if (!e.attach && !s.o.boss && !e.def.ghost && T.solid(s.cam + e.x, e.y) && e.x > W - 2) {
          warn(`'${s.type}' spawns inside terrain (camX=${s.cam}, y=${Math.round(e.y)})`);
        }
        if (!e.attach && (e.y < 4 || e.y > H - 14) && !s.o.boss) warn(`'${s.type}' spawns at odd y=${Math.round(e.y)} (camX=${s.cam})`);
        if (typeof e.def.spr === 'string' && !Sprites.has(e.def.spr)) warn(`enemy '${s.type}' uses missing sprite '${e.def.spr}'`);
      }
      out.info.byType = byType;
      out.info.carriers = carriers;
      if (carriers < 6) warn(`only ${carriers} capsule carriers in the stage (want >= 6)`);
      let maxGap = 0;
      for (let i = 1; i < carrierX.length; i++) maxGap = Math.max(maxGap, carrierX[i] - carrierX[i - 1]);
      out.info.maxCarrierGap = maxGap;
      if (maxGap > 800) warn(`longest stretch without a capsule carrier: ${maxGap}px`);
      const last = carrierX.length ? carrierX[carrierX.length - 1] : 0;
      if (st.bossX - last > 450) warn(`no capsule carrier in the last ${st.bossX - last}px before the boss`);

      /* --- boss --- */
      const bossEv = this.events.filter((ev) => ev.boss);
      if (bossEv.length !== 1) warn(`expected exactly one boss event, found ${bossEv.length}`);
      if (st.checkpoints[st.checkpoints.length - 1] < st.bossX - 500) warn('last checkpoint is more than 500px before the boss');
      if (!Sprites.has('ship')) warn('ship sprite missing');
    } catch (err) {
      warn('EXCEPTION: ' + (err && err.stack ? err.stack : err));
    }
    this.spawn = saved.spawn;
    this.god = saved.god;
    return out;
  },

  /** draw a sprite sheet of all sprites whose name starts with `prefix` (or all) */
  gallery(prefix = '') {
    const c = this.ctx;
    c.fillStyle = '#3d4d70';
    c.fillRect(0, 0, W, H);
    let x = 4, y = 4, rowH = 0;
    for (const n of Sprites.names()) {
      if (prefix && !n.startsWith(prefix)) continue;
      const s = Sprites.size(n);
      const w = s.w * s.n + (s.n - 1) * 2;
      if (x + w > W - 4) {
        x = 4;
        y += rowH + 4;
        rowH = 0;
      }
      for (let f = 0; f < s.n; f++) Sprites.drawTL(c, n, x + f * (s.w + 2), y, { frame: f });
      x += w + 6;
      rowH = Math.max(rowH, s.h);
    }
  },
});
