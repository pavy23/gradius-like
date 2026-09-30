'use strict';
/* ============================================================================
 *  audio.js  --  audio core + procedural sound effects (WebAudio only, no assets)
 *
 *  Classic script (no modules). Defines the global `Sound`.
 *  Nothing touches WebAudio until Sound.init() is called from a user gesture.
 *  Every public function is a silent no-op before init and never throws.
 *
 *  Graph:   sfxBus ----\
 *                       +--> master --> compressor --> destination
 *           musicBus --/
 *
 *  API
 *    Sound.init()                  create the context + chain (idempotent, returns true if audio is available);
 *                                  also starts a track requested earlier through Music.play()
 *    Sound.resume() / suspend()    ctx.resume()/suspend() (tab hidden/visible, game pause); suspend() waits ~230 ms
 *                                  after a 'pause' beep; while suspended sound effects are dropped, except 'unpause'.
 *                                  'unpause', Music.play() and Music.resume() call Sound.wake(), which resumes a context that
 *                                  suspend() froze unless the page is hidden (a missed Sound.resume() cannot leave the game mute).
 *    Sound.isSuspended() / wake()
 *    Sound.setMuted(b) / toggleMute() / muted     30 ms ramp; persisted in localStorage 'lancer.muted'
 *    Sound.setVolume(v01)  (master, default 0.6) / setMusicVolume(v01) (default 0.5)
 *    Sound.sfx(name, {slot, pan:-1..1, vol:0..1, pitch:ratio})   play a named effect; returns true if it started
 *    Sound.tone({type, f0, f1, dur, vol, attack, delay, pan, vibrato:{rate,depth}, shape, lp, seq, step})
 *    Sound.noise({dur, vol, filter, f0, f1, q, attack, delay, pan, shape})
 *    Sound.names()  Sound.voiceCount()  Sound.maxVoices (24)  Sound.stats  Sound.ctx/master/comp/sfxBus/musicBus
 *
 *  SFX names: shot laser missile hit deflect explodeS explodeM explodeL explodeXL playerDeath capsule
 *    power (params.slot 0 SPEED UP, 1 MISSILE, 2 DOUBLE, 3 LASER, 4 OPTION, 5 SHIELD) shieldHit shieldBreak
 *    enemyShot ring eruption warning coreOpen coreClose bossLaser select start extend pause unpause
 *    tentacle cellPop electric stomp warp
 *
 *  Engineering notes
 *    - SFX are built on demand from oscillators / filtered noise / gain envelopes and routed through one
 *      per-sound voice gain, so a sound can be stolen; every node is disconnected when its sources end.
 *    - At most 24 sounds are alive at once (new sounds steal the oldest lowest-priority voice, or are dropped
 *      when everything alive outranks them); every effect also has a re-trigger gap (shot: 45 ms).
 *    - The builders only need a "voice" {ctx, out, t0, noise, rnd, pitch}, so the same code renders into an
 *      OfflineAudioContext (Sound._renderOffline, used by the tests).
 *    - Web Audio quirks handled: fresh GainNodes start at 0 (default 1.0 leaks a sample before the envelope),
 *      and AudioParams get their start value assigned before events (a mid-quantum start otherwise runs the first
 *      samples at the param default).
 * ========================================================================== */
const Sound = (function () {

  // ------------------------------------------------------------------ config
  const MAX_VOICES = 24;            // hard cap of simultaneously sounding effects
  const LS_MUTED = 'lancer.muted';  // localStorage key
  const NOISE_SECS = 2;             // length of the shared noise buffer
  const START_LEAD = 0.004;         // seconds between "now" and the start of a new sound
  const EMPTY = {};

  // ------------------------------------------------------------------ state
  const S = {
    ctx: null,
    master: null,
    comp: null,
    sfxBus: null,
    musicBus: null,
    muted: false,
    volume: 1.0,
    musicVolume: 0.8,
    maxVoices: MAX_VOICES,
    stats: { played: 0, throttled: 0, dropped: 0, stolen: 0, peakVoices: 0, errors: 0 }
  };

  let noiseBuf = null;
  let initFailed = false;
  let userSuspended = false;
  let suspendTimer = 0;
  let holdSuspendUntil = 0;         // performance.now() before which a suspend is deferred (pause beep)
  const warned = {};
  const lastAt = {};                // effect name -> performance.now() of last trigger
  const voices = [];                // currently sounding voices (<= MAX_VOICES)
  const pool = [];                  // recycled voice records

  // ------------------------------------------------------------------ small utils
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function warnOnce(key, msg, err) {
    if (warned[key]) return;
    warned[key] = 1;
    try { console.warn(msg, err || ''); } catch (e) { /* ignore */ }
  }
  // xorshift32: deterministic RNG used for the noise buffer and for offline renders
  function makeRng(seed) {
    let s = (seed | 0) || 0x2545f491;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  function loadMuted() {
    try { const v = window.localStorage.getItem(LS_MUTED); return v === '1' || v === 'true'; } catch (e) { return false; }
  }
  function saveMuted(b) {
    try { window.localStorage.setItem(LS_MUTED, b ? '1' : '0'); } catch (e) { /* storage may throw */ }
  }
  S.muted = loadMuted();

  // ------------------------------------------------------------------ buffers / waves
  function makeNoise(ctx) {
    const n = Math.max(1, Math.floor(ctx.sampleRate * NOISE_SECS));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = makeRng(0x1badf00d);
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    return buf;
  }

  // Band-limited pulse wave with the given duty cycle as a PeriodicWave (cached per context).
  const PULSE = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 };
  function pulseWave(ctx, duty) {
    const cache = ctx.__pulseWaves || (ctx.__pulseWaves = {});
    let w = cache[duty];
    if (w) return w;
    const N = 256;
    const re = new Float32Array(N + 1), im = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) {
      const k = 2 * Math.PI * n * duty;
      re[n] = Math.sin(k) / (n * Math.PI);
      im[n] = (1 - Math.cos(k)) / (n * Math.PI);
    }
    w = ctx.createPeriodicWave(re, im);
    cache[duty] = w;
    return w;
  }
  function setWave(osc, ctx, type) {
    const d = PULSE[type];
    if (d) { osc.setPeriodicWave(pulseWave(ctx, d)); return; }
    osc.type = type === 'saw' ? 'sawtooth' : type === 'tri' ? 'triangle' : type === 'sq' ? 'square' : (type || 'square');
  }

  // ------------------------------------------------------------------ master chain
  // Builds masterGain -> compressor -> dest plus the two busses. Shared by init() and offline tests.
  function buildChain(ctx, dest, vol, musicVol) {
    const master = ctx.createGain();
    master.gain.value = vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    // final safety limiter: with a hot mix the compressor alone can still let peaks through
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    const sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    const musicBus = ctx.createGain();
    musicBus.gain.value = musicVol;
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(comp);
    comp.connect(limiter);
    limiter.connect(dest);
    return { master: master, comp: comp, limiter: limiter, sfxBus: sfxBus, musicBus: musicBus };
  }

  function applyMaster() {
    if (!S.master || !S.ctx) return;
    const g = S.master.gain, t = S.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(S.muted ? 0 : S.volume, t, 0.01);      // ~30 ms to settle
  }
  function applyMusicVol() {
    if (!S.musicBus || !S.ctx) return;
    const g = S.musicBus.gain, t = S.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(S.musicVolume, t, 0.015);
  }

  // ------------------------------------------------------------------ voices
  function newVoice() {
    return { ctx: null, out: null, panNode: null, t0: 0, end: 0, live: 0, prio: 0, name: '',
             stolen: false, inList: false, noise: null, rnd: Math.random, pitch: 1,
             srcs: [], nodes: [] };
  }

  function disconnectAll(V) {
    const nodes = V.nodes;
    for (let i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) { /* already gone */ } }
    try { if (V.out) V.out.disconnect(); } catch (e) { /* ignore */ }
    try { if (V.panNode) V.panNode.disconnect(); } catch (e) { /* ignore */ }
  }

  function unlist(V) {
    if (!V.inList) return;
    const i = voices.indexOf(V);
    if (i >= 0) voices.splice(i, 1);
    V.inList = false;
  }

  function releaseVoice(V) {
    unlist(V);
    disconnectAll(V);
    V.srcs.length = 0;
    V.nodes.length = 0;
    V.out = null;
    V.panNode = null;
    V.ctx = null;
    V.noise = null;
    if (pool.length < 48) pool.push(V);
  }

  // onended handler shared by all sources (no closure per note)
  function srcEnded() {
    const V = this._v;
    this._v = null;
    if (!V) return;
    if (--V.live <= 0) releaseVoice(V);
  }

  function purge(now) {
    for (let i = voices.length - 1; i >= 0; i--) {
      const V = voices[i];
      if (V.end <= now) { voices.splice(i, 1); V.inList = false; }
    }
  }

  function steal(V) {
    const ctx = V.ctx;
    unlist(V);
    V.stolen = true;
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      V.out.gain.cancelScheduledValues(t);
      V.out.gain.setTargetAtTime(0, t, 0.004);
      for (let i = 0; i < V.srcs.length; i++) { try { V.srcs[i].stop(t + 0.03); } catch (e) { /* ignore */ } }
    } catch (e) { /* ignore */ }
  }

  // Start a voice on the live context. Returns null when the sound is dropped by the polyphony cap.
  function begin(name, prio, params, gain) {
    const ctx = S.ctx;
    purge(ctx.currentTime);
    if (voices.length >= MAX_VOICES) {
      let vi = -1;
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        if (vi < 0 || v.prio < voices[vi].prio || (v.prio === voices[vi].prio && v.t0 < voices[vi].t0)) vi = i;
      }
      if (vi < 0 || voices[vi].prio > prio) { S.stats.dropped++; return null; }
      steal(voices[vi]);
      S.stats.stolen++;
    }
    const V = pool.pop() || newVoice();
    V.ctx = ctx;
    V.name = name;
    V.prio = prio;
    V.t0 = ctx.currentTime + START_LEAD;
    V.end = V.t0;
    V.live = 0;
    V.stolen = false;
    V.noise = noiseBuf;
    V.rnd = Math.random;
    const p = params || EMPTY;
    V.pitch = clamp(num(p.pitch, 1), 0.25, 4);
    const out = ctx.createGain();
    out.gain.value = clamp(num(p.vol, 1), 0, 4) * (gain || 1);
    V.out = out;
    const pan = clamp(num(p.pan, 0), -1, 1);
    if (pan !== 0 && ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      out.connect(pn);
      pn.connect(S.sfxBus);
      V.panNode = pn;
    } else {
      out.connect(S.sfxBus);
      V.panNode = null;
    }
    voices.push(V);
    V.inList = true;
    if (voices.length > S.stats.peakVoices) S.stats.peakVoices = voices.length;
    return V;
  }

  function seal(V) { if (V.live <= 0) releaseVoice(V); }

  // ------------------------------------------------------------------ low-level synth
  // Amplitude envelope on a GainNode's gain param.
  // shape: 'exp' (default: fast attack, exponential decay [optional flat `hold`]),
  //        'flat' (sustain then short release), 'lin' (linear decay), 'swell' (linear up to `peak`*dur, linear down)
  function envelope(gp, t, dur, vol, o) {
    const shape = o.shape || 'exp';
    const end = t + dur;
    gp.setValueAtTime(0, t);
    if (shape === 'swell') {
      const pk = clamp(num(o.peak, 0.5), 0.05, 0.95);
      gp.linearRampToValueAtTime(vol, t + dur * pk);
      gp.linearRampToValueAtTime(0, end);
      return;
    }
    let a = num(o.attack, 0.002);
    if (a > dur * 0.6) a = dur * 0.6;
    gp.linearRampToValueAtTime(vol, t + a);
    if (shape === 'flat') {
      const r = Math.min(num(o.release, 0.015), dur * 0.5);
      gp.setValueAtTime(vol, end - r);
      gp.linearRampToValueAtTime(0, end);
    } else if (shape === 'lin') {
      gp.linearRampToValueAtTime(0, end);
    } else {
      const hold = Math.min(num(o.hold, 0), Math.max(0, dur - a - 0.005));
      if (hold > 0) gp.setValueAtTime(vol, t + a + hold);
      gp.exponentialRampToValueAtTime(vol * 0.002, end);
      gp.linearRampToValueAtTime(0, end + 0.004);
    }
  }

  function connectOut(V, g, o) {
    if (o.pan && V.ctx.createStereoPanner) {
      const pn = V.ctx.createStereoPanner();
      pn.pan.value = clamp(o.pan, -1, 1);
      g.connect(pn);
      pn.connect(V.out);
      V.nodes.push(pn);
    } else {
      g.connect(V.out);
    }
  }

  function addSource(V, src, end) {
    src._v = V;
    src.onended = srcEnded;
    V.live++;
    V.srcs.push(src);
    V.nodes.push(src);
    if (end > V.end) V.end = end;
  }

  // o: {type:'square'|'triangle'|'sawtooth'|'sine'|'pulse12'|'pulse25'|'pulse50', f0, f1, dur, vol, attack, delay, pan,
  //     vibrato:{rate,depth(cents)}, shape, hold, release, lin, lp, lp1, lpq, seq:[Hz..], step, peak}
  function tone(V, o) {
    const ctx = V.ctx;
    const vol = num(o.vol, 0.2);
    if (vol <= 0.0002) return;
    const t = V.t0 + num(o.delay, 0);
    const dur = Math.max(0.012, num(o.dur, 0.1));
    const end = t + dur;
    const pm = V.pitch;
    const osc = ctx.createOscillator();
    setWave(osc, ctx, o.type);
    const hasSeq = !!(o.seq && o.seq.length);
    const f0 = Math.max(1, (hasSeq ? o.seq[0] : num(o.f0, 440)) * pm);
    const fp = osc.frequency;
    fp.value = f0;                            // initial value first (see note in music.js: mid-quantum start + param default)
    fp.setValueAtTime(f0, t);
    if (hasSeq) {
      const st = num(o.step, 0.03);
      for (let i = 1; i < o.seq.length; i++) fp.setValueAtTime(Math.max(1, o.seq[i] * pm), t + i * st);
    } else if (o.f1 != null && o.f1 !== o.f0) {
      const f1 = Math.max(1, o.f1 * pm);
      if (o.lin) fp.linearRampToValueAtTime(f1, end); else fp.exponentialRampToValueAtTime(f1, end);
    }
    if (o.vibrato && o.vibrato.depth > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = num(o.vibrato.rate, 6);
      const lg = ctx.createGain();
      lg.gain.value = o.vibrato.depth;
      lfo.connect(lg);
      lg.connect(osc.detune);
      lfo.start(t);
      lfo.stop(end + 0.03);
      V.nodes.push(lg);
      addSource(V, lfo, end + 0.03);
    }
    let node = osc;
    if (o.lp) {
      const bq = ctx.createBiquadFilter();
      bq.type = 'lowpass';
      bq.frequency.value = o.lp;
      bq.frequency.setValueAtTime(o.lp, t);
      if (o.lp1) bq.frequency.exponentialRampToValueAtTime(Math.max(20, o.lp1), end);
      bq.Q.value = num(o.lpq, 0.7);
      osc.connect(bq);
      V.nodes.push(bq);
      node = bq;
    }
    const g = ctx.createGain();
    g.gain.value = 0;                       // a fresh GainNode defaults to 1.0: keep it silent until the envelope starts
    envelope(g.gain, t, dur, vol, o);
    node.connect(g);
    V.nodes.push(g);
    connectOut(V, g, o);
    osc.start(t);
    osc.stop(end + 0.03);
    addSource(V, osc, end + 0.05);
  }

  // o: {dur, vol, filter:'lowpass'|'highpass'|'bandpass'|'none', f0, f1, q, attack, delay, pan, shape, hold, release, peak}
  function noise(V, o) {
    const ctx = V.ctx;
    const vol = num(o.vol, 0.2);
    if (vol <= 0.0002 || !V.noise) return;
    const t = V.t0 + num(o.delay, 0);
    const dur = Math.max(0.01, num(o.dur, 0.1));
    const end = t + dur;
    const pm = V.pitch;
    const src = ctx.createBufferSource();
    src.buffer = V.noise;
    src.loop = true;
    let node = src;
    const ft = o.filter || 'lowpass';
    if (ft !== 'none') {
      const f = ctx.createBiquadFilter();
      f.type = ft;
      const f0 = Math.max(20, num(o.f0, 1000) * pm);
      f.frequency.value = f0;
      f.frequency.setValueAtTime(f0, t);
      if (o.f1 != null && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 * pm), end);
      f.Q.value = num(o.q, 0.7);
      src.connect(f);
      V.nodes.push(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.value = 0;
    envelope(g.gain, t, dur, vol, o);
    node.connect(g);
    V.nodes.push(g);
    connectOut(V, g, o);
    src.start(t, V.rnd() * (NOISE_SECS - 0.1));
    src.stop(end + 0.03);
    addSource(V, src, end + 0.05);
  }

  // ------------------------------------------------------------------ the sound effects
  // Each entry: prio (0 = first to be dropped/stolen), gap (min ms between triggers), fn(V, params).
  // Levels are raw (unity busses): frequent sounds are deliberately tiny, explosions/warning loudest.
  const SLOT_GAIN = [1.24, 0.67, 1.86, 1.64, 2.27, 1.23];
  const SFX = {

    // ---------------------------------------------------------------- player weapons
    shot: { prio: 0, gap: 45, g: 1.0, fn: function (V) {
      const r = 1 + (V.rnd() - 0.5) * 0.1;
      tone(V, { type: 'pulse25', f0: 1900 * r, f1: 700 * r, dur: 0.045, vol: 0.07, attack: 0.001 });
    } },

    laser: { prio: 1, gap: 60, g: 1.36, fn: function (V) {
      tone(V, { type: 'sawtooth', f0: 3300, f1: 480, dur: 0.12, vol: 0.07, attack: 0.001 });
      tone(V, { type: 'pulse12', f0: 1650, f1: 240, dur: 0.12, vol: 0.06, attack: 0.001 });
    } },

    missile: { prio: 1, gap: 90, g: 1.3, fn: function (V) {
      noise(V, { filter: 'bandpass', f0: 450, f1: 2600, q: 1.1, dur: 0.16, vol: 0.30, shape: 'swell', peak: 0.3 });
      tone(V, { type: 'triangle', f0: 130, f1: 320, dur: 0.15, vol: 0.10, attack: 0.006 });
    } },

    // bullet damages an enemy without killing it: soft tick
    hit: { prio: 0, gap: 30, g: 0.68, fn: function (V) {
      tone(V, { type: 'square', f0: 1250, f1: 800, dur: 0.03, vol: 0.04, attack: 0.001 });
      noise(V, { filter: 'highpass', f0: 3500, dur: 0.02, vol: 0.06, attack: 0.001 });
    } },

    // shot bounces off armor: metallic ping (inharmonic bar partials)
    deflect: { prio: 1, gap: 45, g: 0.77, fn: function (V) {
      const b = 1100 * (1 + (V.rnd() - 0.5) * 0.06);
      tone(V, { type: 'sine', f0: b, dur: 0.11, vol: 0.10, attack: 0.001 });
      tone(V, { type: 'sine', f0: b * 2.76, dur: 0.07, vol: 0.06, attack: 0.001 });
      tone(V, { type: 'sine', f0: b * 5.4, dur: 0.04, vol: 0.035, attack: 0.001 });
      noise(V, { filter: 'highpass', f0: 6000, dur: 0.012, vol: 0.05, attack: 0.0005 });
    } },

    // ---------------------------------------------------------------- explosions
    explodeS: { prio: 1, gap: 35, g: 0.76, fn: function (V) {
      noise(V, { filter: 'lowpass', f0: 3200, f1: 300, q: 0.8, dur: 0.18, vol: 0.5, attack: 0.001 });
      tone(V, { type: 'sine', f0: 150, f1: 45, dur: 0.14, vol: 0.28, attack: 0.001 });
    } },

    explodeM: { prio: 2, gap: 50, g: 0.79, fn: function (V) {
      noise(V, { filter: 'lowpass', f0: 2800, f1: 160, q: 0.8, dur: 0.35, vol: 0.6, attack: 0.001 });
      tone(V, { type: 'sine', f0: 120, f1: 35, dur: 0.32, vol: 0.40, attack: 0.001 });
      noise(V, { filter: 'bandpass', f0: 900, f1: 500, q: 1.2, dur: 0.2, vol: 0.30, delay: 0.06, attack: 0.004 });
    } },

    explodeL: { prio: 2, gap: 80, g: 0.82, fn: function (V) {
      noise(V, { filter: 'lowpass', f0: 2400, f1: 90, q: 0.9, dur: 0.7, vol: 0.75, attack: 0.001 });
      tone(V, { type: 'sine', f0: 95, f1: 28, dur: 0.66, vol: 0.5, attack: 0.001 });
      noise(V, { filter: 'bandpass', f0: 1500, f1: 400, q: 1.3, dur: 0.3, vol: 0.32, delay: 0.09, attack: 0.004 });
      noise(V, { filter: 'lowpass', f0: 900, f1: 120, q: 1, dur: 0.4, vol: 0.4, delay: 0.2, attack: 0.01 });
      tone(V, { type: 'sine', f0: 80, f1: 30, dur: 0.3, vol: 0.28, delay: 0.2, attack: 0.004 });
    } },

    // boss destruction: ~2.2 s rumble, crackles, pitch-falling noise
    explodeXL: { prio: 3, gap: 400, g: 0.7, fn: function (V) {
      noise(V, { filter: 'lowpass', f0: 5000, f1: 220, q: 0.9, dur: 0.9, vol: 0.75, attack: 0.002 });
      tone(V, { type: 'sine', f0: 110, f1: 26, dur: 1.1, vol: 0.5, attack: 0.002 });
      noise(V, { filter: 'lowpass', f0: 1400, f1: 70, q: 1.5, dur: 2.2, vol: 0.6, shape: 'swell', peak: 0.12, delay: 0.05 });
      noise(V, { filter: 'bandpass', f0: 3200, f1: 180, q: 4, dur: 2.0, vol: 0.5, shape: 'lin', delay: 0.1 });
      tone(V, { type: 'sawtooth', f0: 58, f1: 30, dur: 2.1, vol: 0.14, lp: 260, vibrato: { rate: 19, depth: 500 }, shape: 'lin', delay: 0.1 });
      for (let i = 0; i < 18; i++) {
        const d = 0.08 + 1.95 * Math.pow(V.rnd(), 1.6);
        noise(V, { filter: 'bandpass', f0: 900 + V.rnd() * 3500, q: 1.5, dur: 0.03 + V.rnd() * 0.07,
                   vol: 0.25 + V.rnd() * 0.3, delay: d, attack: 0.001 });
        if (i % 4 === 0) tone(V, { type: 'sine', f0: 90 + V.rnd() * 50, f1: 35, dur: 0.18, vol: 0.3, delay: d });
      }
    } },

    // player ship destroyed: ~1.1 s descending square sweep + noise burst
    playerDeath: { prio: 3, gap: 300, g: 0.69, fn: function (V) {
      noise(V, { filter: 'lowpass', f0: 5200, f1: 300, q: 0.8, dur: 0.55, vol: 0.7, attack: 0.001 });
      tone(V, { type: 'pulse25', f0: 900, f1: 55, dur: 1.05, vol: 0.2, shape: 'flat', release: 0.3,
                vibrato: { rate: 12, depth: 90 } });
      tone(V, { type: 'sawtooth', f0: 450, f1: 38, dur: 0.95, vol: 0.09, lp: 1800, shape: 'flat', release: 0.3, delay: 0.03 });
      tone(V, { type: 'sine', f0: 120, f1: 28, dur: 0.6, vol: 0.4, attack: 0.001 });
      for (let i = 0; i < 7; i++) {
        noise(V, { filter: 'bandpass', f0: 800 + V.rnd() * 2600, q: 1.4, dur: 0.04 + V.rnd() * 0.05,
                   vol: 0.22 * (1 - i / 9), delay: 0.25 + i * 0.09 + V.rnd() * 0.05, attack: 0.001 });
      }
    } },

    // ---------------------------------------------------------------- pickups / power meter
    capsule: { prio: 2, gap: 60, g: 1.53, fn: function (V) {
      tone(V, { type: 'pulse25', f0: 988, dur: 0.07, vol: 0.10, shape: 'flat', release: 0.02, attack: 0.002 });
      tone(V, { type: 'pulse25', f0: 1480, dur: 0.17, vol: 0.10, delay: 0.07, attack: 0.002 });
      tone(V, { type: 'sine', f0: 1976, dur: 0.07, vol: 0.05 });
      tone(V, { type: 'sine', f0: 2960, dur: 0.17, vol: 0.05, delay: 0.07 });
    } },

    // params.slot: 0 SPEED UP, 1 MISSILE, 2 DOUBLE, 3 LASER, 4 OPTION, 5 SHIELD
    power: { prio: 2, gap: 60, fn: function (V, p) {
      const slot = clamp(Math.floor(num(p.slot, 0)), 0, 5);
      V.out.gain.value *= SLOT_GAIN[slot];      // calibration: equal loudness for the six slot sounds
      switch (slot) {
        case 0:   // SPEED UP: rising sweep
          tone(V, { type: 'pulse25', f0: 300, f1: 1400, dur: 0.22, vol: 0.12, shape: 'flat', release: 0.05, attack: 0.004 });
          tone(V, { type: 'pulse50', f0: 302, f1: 1410, dur: 0.22, vol: 0.06, shape: 'flat', release: 0.05, attack: 0.004, delay: 0.012 });
          break;
        case 1:   // MISSILE: low thunk that rises
          tone(V, { type: 'sine', f0: 130, f1: 48, dur: 0.09, vol: 0.4, attack: 0.001 });
          tone(V, { type: 'triangle', f0: 90, f1: 340, dur: 0.24, vol: 0.13, delay: 0.05, attack: 0.01, shape: 'flat', release: 0.06 });
          noise(V, { filter: 'bandpass', f0: 300, f1: 1500, q: 1.2, dur: 0.2, vol: 0.18, delay: 0.06, shape: 'swell', peak: 0.5 });
          break;
        case 2:   // DOUBLE: two quick blips
          tone(V, { type: 'pulse25', f0: 784, dur: 0.055, vol: 0.12, shape: 'flat', release: 0.015, attack: 0.002 });
          tone(V, { type: 'pulse25', f0: 1175, dur: 0.09, vol: 0.12, delay: 0.075, shape: 'flat', release: 0.03, attack: 0.002 });
          break;
        case 3:   // LASER: zap
          tone(V, { type: 'sawtooth', f0: 2600, f1: 380, dur: 0.17, vol: 0.09, attack: 0.002 });
          tone(V, { type: 'pulse12', f0: 1300, f1: 190, dur: 0.17, vol: 0.09, attack: 0.002 });
          tone(V, { type: 'sine', f0: 3900, f1: 600, dur: 0.06, vol: 0.05, attack: 0.001 });
          break;
        case 4:   // OPTION: shimmering arpeggio
          tone(V, { type: 'pulse12', seq: [523, 659, 784, 1047, 1319, 1568, 2093], step: 0.034, dur: 0.3, vol: 0.09, shape: 'exp', attack: 0.002,
                    vibrato: { rate: 24, depth: 35 } });
          tone(V, { type: 'triangle', seq: [1047, 1319, 1568, 2093, 2637, 3136, 4186], step: 0.034, dur: 0.3, vol: 0.05, shape: 'exp', attack: 0.002, delay: 0.017 });
          break;
        default:  // SHIELD: swelling hum
          tone(V, { type: 'sawtooth', f0: 110, f1: 165, dur: 0.3, vol: 0.12, shape: 'swell', peak: 0.7, lp: 500, lp1: 1800, vibrato: { rate: 7, depth: 25 } });
          tone(V, { type: 'triangle', f0: 221, f1: 331, dur: 0.3, vol: 0.10, shape: 'swell', peak: 0.7, vibrato: { rate: 7, depth: 25 } });
          noise(V, { filter: 'bandpass', f0: 1800, f1: 3400, q: 4, dur: 0.3, vol: 0.06, shape: 'swell', peak: 0.7 });
      }
    } },

    // ---------------------------------------------------------------- shield
    shieldHit: { prio: 1, gap: 60, g: 1.22, fn: function (V) {
      tone(V, { type: 'pulse12', f0: 1900, f1: 1500, dur: 0.075, vol: 0.10, attack: 0.001 });
      tone(V, { type: 'sine', f0: 3800, f1: 3000, dur: 0.07, vol: 0.06, attack: 0.001 });
    } },

    // glassy crash: hiss burst + shattering shards
    shieldBreak: { prio: 2, gap: 100, g: 0.61, fn: function (V) {
      noise(V, { filter: 'highpass', f0: 3800, f1: 9000, q: 0.7, dur: 0.5, vol: 0.5, attack: 0.001 });
      noise(V, { filter: 'bandpass', f0: 1200, q: 1, dur: 0.1, vol: 0.4, attack: 0.001 });
      tone(V, { type: 'triangle', f0: 2600, f1: 300, dur: 0.35, vol: 0.09, attack: 0.002 });
      for (let i = 0; i < 10; i++) {
        tone(V, { type: i % 2 ? 'sine' : 'pulse12', f0: 1800 + V.rnd() * 4700, dur: 0.06 + V.rnd() * 0.2,
                  vol: 0.05 + V.rnd() * 0.03, delay: V.rnd() * 0.24, attack: 0.001 });
      }
    } },

    // ---------------------------------------------------------------- enemy fire
    enemyShot: { prio: 0, gap: 55, g: 1.07, fn: function (V) {
      tone(V, { type: 'triangle', f0: 520, f1: 300, dur: 0.05, vol: 0.09, attack: 0.002 });
    } },

    bossLaser: { prio: 2, gap: 100, g: 1.29, fn: function (V) {
      tone(V, { type: 'sawtooth', f0: 1800, f1: 300, dur: 0.3, vol: 0.10, shape: 'flat', release: 0.12, attack: 0.008,
                vibrato: { rate: 30, depth: 100 } });
      tone(V, { type: 'sawtooth', f0: 1815, f1: 306, dur: 0.3, vol: 0.08, shape: 'flat', release: 0.12, attack: 0.008 });
      noise(V, { filter: 'bandpass', f0: 2500, f1: 900, q: 1, dur: 0.3, vol: 0.14, shape: 'flat', release: 0.12, attack: 0.008 });
    } },

    // ---------------------------------------------------------------- stage gimmicks
    // moai ring: hollow whooshing sweep (high-Q band-pass rising then falling)
    ring: { prio: 1, gap: 100, g: 1.0, fn: function (V) {
      noise(V, { filter: 'bandpass', f0: 500, f1: 1500, q: 9, dur: 0.22, vol: 1.1, shape: 'swell', peak: 0.7 });
      noise(V, { filter: 'bandpass', f0: 1500, f1: 650, q: 9, dur: 0.22, vol: 1.1, shape: 'swell', peak: 0.3, delay: 0.2 });
      tone(V, { type: 'sine', f0: 420, f1: 840, dur: 0.22, vol: 0.04, shape: 'swell', peak: 0.7 });
    } },

    // volcano launch: deep rumble + pop
    eruption: { prio: 2, gap: 120, g: 0.77, fn: function (V) {
      noise(V, { filter: 'lowpass', f0: 320, f1: 110, q: 1.2, dur: 0.5, vol: 0.8, shape: 'swell', peak: 0.25 });
      tone(V, { type: 'sine', f0: 72, f1: 38, dur: 0.5, vol: 0.4, shape: 'swell', peak: 0.2 });
      noise(V, { filter: 'bandpass', f0: 900, f1: 500, q: 1, dur: 0.06, vol: 0.4, attack: 0.001 });
      tone(V, { type: 'sine', f0: 230, f1: 80, dur: 0.09, vol: 0.3, attack: 0.001 });
    } },

    // boss warning siren: 8 alternating tones, 2.4 s
    warning: { prio: 3, gap: 500, g: 1.0, fn: function (V) {
      for (let i = 0; i < 8; i++) {
        const hi = (i & 1) === 1;
        const f = hi ? 587.3 : 440;
        const d = i * 0.3;
        tone(V, { type: 'triangle', f0: f, dur: 0.29, vol: 0.20, delay: d, shape: 'flat', attack: 0.008, release: 0.05,
                  vibrato: { rate: 6, depth: 12 } });
        tone(V, { type: 'pulse25', f0: f, dur: 0.29, vol: 0.10, delay: d, shape: 'flat', attack: 0.008, release: 0.05 });
        tone(V, { type: 'sine', f0: f / 2, dur: 0.29, vol: 0.10, delay: d, shape: 'flat', attack: 0.008, release: 0.05 });
        tone(V, { type: 'sine', f0: 120, f1: 70, dur: 0.1, vol: 0.14, delay: d, attack: 0.002 });
      }
    } },

    coreOpen: { prio: 1, gap: 100, g: 1.97, fn: function (V) {
      noise(V, { filter: 'bandpass', f0: 900, q: 4, dur: 0.04, vol: 0.5, attack: 0.001 });
      tone(V, { type: 'square', f0: 180, f1: 120, dur: 0.05, vol: 0.07, attack: 0.001 });
      noise(V, { filter: 'bandpass', f0: 400, f1: 1200, q: 2, dur: 0.17, vol: 0.30, delay: 0.04, shape: 'lin', attack: 0.01 });
      tone(V, { type: 'sawtooth', f0: 70, f1: 115, dur: 0.17, vol: 0.06, lp: 500, delay: 0.04, shape: 'lin', attack: 0.01 });
      noise(V, { filter: 'bandpass', f0: 1300, q: 5, dur: 0.04, vol: 0.5, delay: 0.205, attack: 0.001 });
      tone(V, { type: 'square', f0: 1300, f1: 1000, dur: 0.05, vol: 0.05, delay: 0.205, attack: 0.001 });
    } },

    coreClose: { prio: 1, gap: 100, g: 0.68, fn: function (V) {
      noise(V, { filter: 'bandpass', f0: 1200, f1: 400, q: 2, dur: 0.13, vol: 0.30, shape: 'lin', attack: 0.01 });
      tone(V, { type: 'sawtooth', f0: 115, f1: 70, dur: 0.13, vol: 0.06, lp: 500, shape: 'lin', attack: 0.01 });
      noise(V, { filter: 'bandpass', f0: 700, q: 3, dur: 0.06, vol: 0.7, delay: 0.13, attack: 0.001 });
      tone(V, { type: 'sine', f0: 140, f1: 65, dur: 0.09, vol: 0.4, delay: 0.13, attack: 0.001 });
      tone(V, { type: 'sine', f0: 1900, dur: 0.07, vol: 0.05, delay: 0.13, attack: 0.001 });
      tone(V, { type: 'sine', f0: 2870, dur: 0.05, vol: 0.03, delay: 0.13, attack: 0.001 });
    } },

    tentacle: { prio: 1, gap: 60, g: 1.22, fn: function (V) {
      tone(V, { type: 'sawtooth', f0: 260, f1: 90, dur: 0.15, vol: 0.10, lp: 1200, lp1: 260, lpq: 8, attack: 0.005,
                vibrato: { rate: 34, depth: 600 } });
      noise(V, { filter: 'bandpass', f0: 700, f1: 250, q: 5, dur: 0.15, vol: 0.5, attack: 0.004 });
    } },

    cellPop: { prio: 0, gap: 45, g: 1.17, fn: function (V) {
      tone(V, { type: 'sine', f0: 320, f1: 1100, dur: 0.055, vol: 0.14, attack: 0.002 });
      tone(V, { type: 'sine', f0: 220, f1: 800, dur: 0.065, vol: 0.10, delay: 0.05, attack: 0.002 });
      noise(V, { filter: 'bandpass', f0: 2500, q: 2, dur: 0.02, vol: 0.10, delay: 0.005, attack: 0.001 });
    } },

    electric: { prio: 1, gap: 70, g: 0.6, fn: function (V) {
      for (let i = 0; i < 12; i++) {
        noise(V, { filter: 'highpass', f0: 1500 + V.rnd() * 3000, q: 1, dur: 0.008 + V.rnd() * 0.014,
                   vol: 0.2 + V.rnd() * 0.2, delay: V.rnd() * 0.24, attack: 0.0005 });
      }
      tone(V, { type: 'sawtooth', f0: 90, dur: 0.25, vol: 0.07, lp: 1500, shape: 'lin', vibrato: { rate: 45, depth: 900 } });
      tone(V, { type: 'square', f0: 2800, f1: 900, dur: 0.25, vol: 0.04, shape: 'lin', vibrato: { rate: 55, depth: 500 } });
    } },

    stomp: { prio: 1, gap: 80, g: 0.54, fn: function (V) {
      tone(V, { type: 'sine', f0: 105, f1: 38, dur: 0.13, vol: 0.55, attack: 0.001 });
      noise(V, { filter: 'lowpass', f0: 500, f1: 120, q: 0.8, dur: 0.07, vol: 0.5, attack: 0.001 });
      tone(V, { type: 'triangle', f0: 62, f1: 40, dur: 0.12, vol: 0.2, attack: 0.001 });
    } },

    warp: { prio: 2, gap: 200, g: 1.2, fn: function (V) {
      noise(V, { filter: 'bandpass', f0: 180, f1: 4200, q: 2.2, dur: 0.6, vol: 0.9, shape: 'swell', peak: 0.75 });
      tone(V, { type: 'sawtooth', f0: 70, f1: 1100, dur: 0.55, vol: 0.05, shape: 'swell', peak: 0.75, lp: 3000 });
      tone(V, { type: 'sine', f0: 400, f1: 2400, dur: 0.5, vol: 0.04, shape: 'swell', peak: 0.75 });
      tone(V, { type: 'pulse12', f0: 2600, f1: 3400, dur: 0.08, vol: 0.05, delay: 0.5 });
    } },

    // ---------------------------------------------------------------- UI / jingles
    select: { prio: 1, gap: 30, g: 1.15, fn: function (V) {
      tone(V, { type: 'pulse12', f0: 1500, dur: 0.03, vol: 0.09, shape: 'flat', release: 0.01, attack: 0.001 });
    } },

    start: { prio: 2, gap: 200, g: 1.32, fn: function (V) {
      tone(V, { type: 'pulse25', seq: [523, 784, 1047, 1319, 1568], step: 0.065, dur: 0.44, vol: 0.12, shape: 'exp', hold: 0.32, attack: 0.002 });
      tone(V, { type: 'triangle', seq: [262, 392, 523, 659, 784], step: 0.065, dur: 0.44, vol: 0.12, shape: 'exp', hold: 0.32, attack: 0.002 });
    } },

    // 1UP: cheerful 4-note jingle
    extend: { prio: 2, gap: 200, g: 1.32, fn: function (V) {
      const n = [784, 988, 1175, 1568], st = [0, 0.075, 0.15, 0.225], du = [0.07, 0.07, 0.07, 0.28];
      for (let i = 0; i < 4; i++) {
        const last = i === 3;
        tone(V, { type: 'pulse25', f0: n[i], dur: du[i], vol: 0.11, delay: st[i], shape: last ? 'exp' : 'flat', release: 0.015, attack: 0.002,
                  vibrato: last ? { rate: 6, depth: 18 } : null });
        tone(V, { type: 'triangle', f0: n[i] / 2, dur: du[i], vol: 0.09, delay: st[i], shape: last ? 'exp' : 'flat', release: 0.015, attack: 0.002 });
      }
      tone(V, { type: 'sine', f0: 3136, dur: 0.22, vol: 0.04, delay: 0.25 });
    } },

    pause: { prio: 2, gap: 100, g: 1.68, fn: function (V) {
      holdSuspendUntil = performance.now() + 230;
      tone(V, { type: 'square', f0: 330, dur: 0.1, vol: 0.12, shape: 'flat', release: 0.02, attack: 0.002 });
    } },

    unpause: { prio: 2, gap: 100, g: 1.68, wake: true, fn: function (V) {
      tone(V, { type: 'square', f0: 660, dur: 0.1, vol: 0.12, shape: 'flat', release: 0.02, attack: 0.002 });
    } }
  };

  // ------------------------------------------------------------------ loudness trims
  // Effect gains were originally balanced in isolation; measured through the real master chain the very frequent
  // ones (shot, enemyShot, hit ...) came out 40+ dB below the music and were inaudible in play. These trims (dB) bring
  // every effect to an audible level while the big explosions stay where they were (the limiter protects the peaks).
  const TRIM_DB = { shot: 22, laser: 18, hit: 20, deflect: 16, explodeS: 8, explodeM: 4, power: 12, shieldHit: 17,
                    enemyShot: 17, tentacle: 6, cellPop: 3, stomp: 8, select: 13 };
  Object.keys(TRIM_DB).forEach(function (k) { if (SFX[k]) SFX[k].g = (SFX[k].g || 1) * Math.pow(10, TRIM_DB[k] / 20); });

  // ------------------------------------------------------------------ public API
  S.init = function () {
    try {
      if (S.ctx) {
        if (!userSuspended && S.ctx.state !== 'running') safeResume(S.ctx);
        flushMusic();
        return true;
      }
      if (initFailed) return false;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { initFailed = true; return false; }
      let ctx;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      const ch = buildChain(ctx, ctx.destination, S.muted ? 0 : S.volume, S.musicVolume);
      noiseBuf = makeNoise(ctx);
      S.ctx = ctx;
      S.master = ch.master;
      S.comp = ch.comp;
      S.limiter = ch.limiter;
      S.sfxBus = ch.sfxBus;
      S.musicBus = ch.musicBus;
      if (ctx.state === 'suspended') safeResume(ctx);
      flushMusic();
      return true;
    } catch (e) {
      S.ctx = S.master = S.comp = S.limiter = S.sfxBus = S.musicBus = null;      // allow a retry on a later gesture
      warnOnce('init', 'Sound.init failed', e);
      return false;
    }
  };

  // ctx.resume() returns a promise in modern browsers, undefined in some old ones
  function safeResume(ctx) {
    try { const r = ctx.resume(); if (r && r.catch) r.catch(function () {}); } catch (e) { /* ignore */ }
  }

  function flushMusic() {
    try {
      if (typeof Music !== 'undefined' && Music && typeof Music._flush === 'function') Music._flush();
    } catch (e) { warnOnce('flush', 'Music._flush failed', e); }
  }

  S.resume = function () {
    try {
      userSuspended = false;
      clearTimeout(suspendTimer);
      if (S.ctx && S.ctx.state !== 'running') safeResume(S.ctx);
    } catch (e) { /* ignore */ }
  };

  S.suspend = function () {
    try {
      if (!S.ctx) return;
      userSuspended = true;
      clearTimeout(suspendTimer);
      const wait = holdSuspendUntil - performance.now();
      const doIt = function () {
        try { if (userSuspended && S.ctx && S.ctx.state === 'running') { const r = S.ctx.suspend(); if (r && r.catch) r.catch(function () {}); } } catch (e) { /* ignore */ }
      };
      // let a just-triggered pause beep finish before the context is frozen
      if (wait > 5) suspendTimer = setTimeout(doIt, wait); else doIt();
    } catch (e) { /* ignore */ }
  };

  // True while Sound.suspend() is in force.
  S.isSuspended = function () { return userSuspended; };

  // Resume audio that suspend() froze, unless the page is hidden. Called implicitly when the game is clearly running again
  // ('unpause' effect, Music.play(), Music.resume()) so a missed Sound.resume() (e.g. tab hidden while paused) cannot leave
  // the game silent.
  S.wake = function () {
    try {
      if (userSuspended && !(typeof document !== 'undefined' && document.hidden)) S.resume();
    } catch (e) { /* ignore */ }
  };

  S.setMuted = function (b) {
    try {
      S.muted = !!b;
      saveMuted(S.muted);
      applyMaster();
    } catch (e) { /* ignore */ }
  };

  S.toggleMute = function () {
    S.setMuted(!S.muted);
    return S.muted;
  };

  S.setVolume = function (v) {
    try {
      S.volume = clamp(num(v, S.volume), 0, 1);
      applyMaster();
    } catch (e) { /* ignore */ }
  };

  S.setMusicVolume = function (v) {
    try {
      S.musicVolume = clamp(num(v, S.musicVolume), 0, 1);
      applyMusicVol();
    } catch (e) { /* ignore */ }
  };

  S.sfx = function (name, params) {
    try {
      const ctx = S.ctx;
      if (!ctx) return false;
      const def = SFX[name];
      if (!def) { warnOnce('sfx:' + name, 'Sound.sfx: unknown effect "' + name + '"'); return false; }
      if (userSuspended) {
        if (!def.wake) return false;               // paused/hidden: drop everything except 'unpause'
        S.wake();                                  // 'unpause': the game is running again (queued if the page is still hidden)
      }
      const nowMs = performance.now();
      const last = lastAt[name];
      if (last !== undefined && nowMs - last < def.gap) { S.stats.throttled++; return false; }
      if (typeof params === 'number') params = { slot: params };
      const V = begin(name, def.prio, params, def.g);
      if (!V) return false;
      lastAt[name] = nowMs;
      try {
        def.fn(V, params || EMPTY);
      } catch (e) {
        S.stats.errors++;
        warnOnce('fn:' + name, 'Sound.sfx: effect "' + name + '" failed', e);
      }
      seal(V);
      S.stats.played++;
      return true;
    } catch (e) {
      S.stats.errors++;
      return false;
    }
  };

  function custom(fn, o) {
    try {
      if (!S.ctx || userSuspended) return false;
      const V = begin('custom', 1, o);
      if (!V) return false;
      try { fn(V, o || EMPTY); } catch (e) { S.stats.errors++; warnOnce('custom', 'Sound: custom sound failed', e); }
      seal(V);
      S.stats.played++;
      return true;
    } catch (e) {
      S.stats.errors++;
      return false;
    }
  }
  // One-off custom sounds for other authors (see tone()/noise() above for the option lists).
  S.tone = function (o) { return custom(tone, o || {}); };
  S.noise = function (o) { return custom(noise, o || {}); };

  // Number of SFX voices currently sounding (never above S.maxVoices).
  S.voiceCount = function () {
    try {
      if (!S.ctx) return 0;
      purge(S.ctx.currentTime);
      return voices.length;
    } catch (e) { return 0; }
  };

  S.names = function () { return Object.keys(SFX); };

  // Test hook: builds the same master chain as init() on any context (used by Music._renderOffline({chain:true})).
  S._buildChain = function (ctx, dest) { return buildChain(ctx, dest, S.volume, S.musicVolume); };

  // ------------------------------------------------------------------ offline rendering (tests)
  // Renders one SFX into an OfflineAudioContext through a unity-gain dry path (or, with opts.chain, through the
  // real master chain at default volumes). Resolves to a Float32Array (left channel) with extra props
  // .right, .sampleRate, .endTime. Deterministic: randomness comes from a seeded RNG.
  S._renderOffline = function (name, params, opts) {
    try {
      const def = SFX[name];
      if (!def) return Promise.reject(new Error('unknown sfx ' + name));
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OAC) return Promise.reject(new Error('no OfflineAudioContext'));
      opts = opts || {};
      params = params || {};
      const sr = opts.sampleRate || 44100;
      const run = function (ctx) {
        const V = newVoice();
        V.ctx = ctx;
        V.noise = makeNoise(ctx);
        V.rnd = makeRng(0x5eed + name.length * 977);
        V.pitch = clamp(num(params.pitch, 1), 0.25, 4);
        V.t0 = 0;
        V.end = 0;
        const out = ctx.createGain();
        out.gain.value = clamp(num(params.vol, 1), 0, 4) * (def.g || 1);
        V.out = out;
        if (opts.chain) {
          const ch = buildChain(ctx, ctx.destination, S.volume, S.musicVolume);
          out.connect(ch.sfxBus);
        } else {
          out.connect(ctx.destination);
        }
        def.fn(V, params);
        return V.end;
      };
      const dry = new OAC(2, 1, sr);            // dry run: only measures the length of the effect
      const len = Math.min(8, Math.max(0.1, run(dry) + 0.1));
      const ctx = new OAC(2, Math.ceil(sr * len), sr);
      const endTime = run(ctx);
      return ctx.startRendering().then(function (buf) {
        const l = buf.getChannelData(0);
        const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
        const out = new Float32Array(l);
        out.right = new Float32Array(r);
        out.sampleRate = sr;
        out.endTime = endTime;
        return out;
      });
    } catch (e) {
      return Promise.reject(e);
    }
  };

  return S;
})();
