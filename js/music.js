'use strict';
/* ============================================================================
 *  music.js  --  chiptune / arcade-FM style music for the shooter (WebAudio only)
 *
 *  Classic script (no modules). Defines the global `Music`; needs `Sound` (js/audio.js) for the
 *  AudioContext and the music bus. Music.play() may be called before Sound.init(): the request is
 *  remembered and started by Music._flush(), which Sound.init() calls.
 *
 *  All tracks are original compositions written in the compact text format below.
 *
 *  ---- TRACK FORMAT --------------------------------------------------------------------------------
 *  Music.tracks.NAME = {
 *    name: 'Volcano',           // display name
 *    bpm: 150,                  // quarter notes per minute; one bar = 4/4 = 16 sixteenth-note steps
 *    scale: 'E minor',          // declared key/mode; every note must belong to it (Music.validate checks)
 *    chromatic: ['D#'],         // deliberate out-of-scale pitch classes that are allowed
 *    loop: true,                // false = play once, then call opts.onend   (default true)
 *    loopStart: 0,              // bar index the loop jumps back to (bars before it = intro, played once)
 *    swing: 0,                  // 0..0.5, delays odd sixteenths by this fraction of a step
 *    gain: 1,                   // track mix scalar
 *    tail: 0.3,                 // non-looping: seconds after the last step before onend fires
 *    chords: `Em / D C ...`,    // optional documentation, one line per bar, chords split the bar evenly
 *    pat: { name: `...` },      // optional named blocks of bars, referenced as  @name  or  @name*4
 *    ch: {                      // channels: an instrument + its bars
 *      lead: { w:'pulse25', vol:0.3, ..., bars: `...` },
 *      bass: { ... },
 *      drums:{ w:'drums', vol:0.6, bars: `...` }
 *    }
 *  };
 *
 *  BARS: one bar per line (16 space separated tokens; '|' is ignored, use it to mark the beats).
 *        A line may end in  *N  to repeat that bar N times; a line  @name  or  @name*N  inserts a
 *        block from `pat`. Text after ';' is a comment.
 *  Melodic tokens:  C4 F#3 Bb2  note (letter, optional #/b, octave; A4 = 440 Hz, C4 = middle C)
 *                   -           hold: the previous note keeps sounding (may run across barlines)
 *                   .           rest
 *                   C4+E4+G4    chord: played as a fast arpeggio on one voice (fake polyphony)
 *                   suffix ! = accent, suffix , = soft   (e.g.  E4!  or  G3,)
 *  Drum tokens:     k kick  s snare  g ghost snare  h closed hat  o open hat  t hi tom  m mid tom
 *                   d low tom  c crash  x rim/click;  several letters = simultaneous hits (kh),
 *                   '.' = rest; ! / , suffix as above.
 *
 *  INSTRUMENT keys (all optional): w  'pulse12'|'pulse25'|'pulse50'|'sq'|'tri'|'saw'|'sine'|'fm'|'drums'
 *    vol level; a,d,s,r attack/decay(s)/sustain level/release(s); g gate (fraction of the written length);
 *    vib [Hz, cents, delay_s]; bend semitones scooped into held notes of >= bendMin steps (+ bendT s); port portamento (s);
 *    trem [Hz, depth 0..1]; lp lowpass Hz; pan -1..1; det detune cents; arpHz speed of chord arpeggios;
 *    echo [level, steps, feedback]; fm [ratio, index, decay_s]; mix {k:..,s:..} per-drum multipliers;
 *    range ['C2','C5'] (validation only).
 *
 *  Public API: Music.play(name, opts) / stop(fade) / pause() / resume() / setRate(r) / list() / validate()
 *              Music.current, Music.tracks, Music.info(name); test hook Music._renderOffline().
 * ========================================================================== */
const Music = (function () {

  // ------------------------------------------------------------------ constants
  const STEPS = 16;                    // tokens per bar
  const LOOKAHEAD = 0.12;              // seconds scheduled ahead of the audio clock
  const LOOKAHEAD_HIDDEN = 1.5;        // background tabs get throttled timers: schedule further ahead
  const TICK_MS = 25;
  const MIDI_MIN = 24, MIDI_MAX = 96;  // C1 .. C7

  const M = { tracks: {}, current: null, rate: 1 };

  const warned = {};
  function warnOnce(key, msg, err) {
    if (warned[key]) return;
    warned[key] = 1;
    try { console.warn(msg, err || ''); } catch (e) { /* ignore */ }
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

  // ------------------------------------------------------------------ notes, scales
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NOTE_RE = /^([A-G])([#b]?)(\d)$/;

  function parseNote(s) {                       // 'F#3' -> MIDI number, or -1
    const m = NOTE_RE.exec(s);
    if (!m) return -1;
    return (parseInt(m[3], 10) + 1) * 12 + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function midiName(m) { return PC_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  function parsePc(s) {                         // 'F#' -> 6, or -1
    const m = /^([A-G])([#b]?)$/.exec(String(s));
    if (!m) return -1;
    return (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  }

  const MODES = {
    'major': [0, 2, 4, 5, 7, 9, 11], 'ionian': [0, 2, 4, 5, 7, 9, 11],
    'minor': [0, 2, 3, 5, 7, 8, 10], 'aeolian': [0, 2, 3, 5, 7, 8, 10],
    'dorian': [0, 2, 3, 5, 7, 9, 10], 'phrygian': [0, 1, 3, 5, 7, 8, 10],
    'lydian': [0, 2, 4, 6, 7, 9, 11], 'mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'locrian': [0, 1, 3, 5, 6, 8, 10],
    'harmonic minor': [0, 2, 3, 5, 7, 8, 11], 'melodic minor': [0, 2, 3, 5, 7, 9, 11],
    'pentatonic minor': [0, 3, 5, 7, 10], 'pentatonic major': [0, 2, 4, 7, 9],
    'blues': [0, 3, 5, 6, 7, 10], 'whole tone': [0, 2, 4, 6, 8, 10],
    'chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  };

  function scaleSet(spec) {                     // 'E minor' | ['E','F#',..] -> boolean[12] | null
    const set = [false, false, false, false, false, false, false, false, false, false, false, false];
    if (Array.isArray(spec)) {
      for (let i = 0; i < spec.length; i++) { const pc = parsePc(spec[i]); if (pc < 0) return null; set[pc] = true; }
      return set;
    }
    const m = /^\s*([A-G][#b]?)\s+(.+?)\s*$/.exec(String(spec || ''));
    if (!m || !MODES[m[2].toLowerCase()]) return null;
    const root = parsePc(m[1]), iv = MODES[m[2].toLowerCase()];
    for (let i = 0; i < iv.length; i++) set[(root + iv[i]) % 12] = true;
    return set;
  }

  // ------------------------------------------------------------------ instrument defaults
  const WAVES = { pulse12: 1, pulse25: 1, pulse50: 1, sq: 1, tri: 1, saw: 1, sine: 1, fm: 1, drums: 1 };
  const INST = {
    w: 'pulse25', vol: 0.2, a: 0.004, d: 0.1, s: 0.7, r: 0.04, g: 0.92,
    vib: null, bend: 0, bendT: 0.05, bendMin: 4, port: 0, trem: null, lp: 0, pan: 0, det: 0,
    arpHz: 50, echo: null, fm: null, mix: null, range: null
  };
  const DRUM_BITS = { k: 1, s: 2, g: 4, h: 8, o: 16, t: 32, m: 64, d: 128, c: 256, x: 512 };
  const VEL_ACCENT = 1.3, VEL_SOFT = 0.6;
  const COMBO = [1, 1, 0.8, 0.68, 0.6, 0.55];      // gain when 1,2,3.. drums hit on the same step

  // ------------------------------------------------------------------ compiling track data
  // Expand a multi-line string into [{text, src}] bars, resolving  @name  and  *N .
  function expandLines(src, pat, depth, out, P, where) {
    if (src === undefined || src === null) return;
    const lines = Array.isArray(src) ? src : String(src).split('\n');
    for (let li = 0; li < lines.length; li++) {
      let line = String(lines[li]);
      const c = line.indexOf(';');
      if (c >= 0) line = line.slice(0, c);
      line = line.trim();
      if (!line) continue;
      let rep = 1;
      const m = /\s*\*\s*(\d+)\s*$/.exec(line);
      if (m) { rep = parseInt(m[1], 10); line = line.slice(0, m.index).trim(); }
      let block;
      if (line.charAt(0) === '@') {
        const nm = line.slice(1).trim();
        if (!pat || pat[nm] === undefined) { P(where + ' line ' + (li + 1) + ': unknown pattern "' + nm + '"'); continue; }
        if (depth >= 4) { P(where + ' line ' + (li + 1) + ': patterns nested too deeply'); continue; }
        block = [];
        expandLines(pat[nm], pat, depth + 1, block, P, where + ' @' + nm);
      } else {
        block = [{ text: line, src: li + 1 }];
      }
      for (let r = 0; r < rep; r++) for (let k = 0; k < block.length; k++) out.push(block[k]);
    }
  }

  function compileTrack(name, T) {
    const problems = [];
    const P = function (msg) { problems.push(name + ': ' + msg); };
    const C = { name: name, bpm: 120, bars: 0, steps: 0, loop: true, loopStart: 0, swing: 0, gain: 1, tail: 0.3,
                ch: [], problems: problems, scaleName: '', chroma: {}, chords: null };
    if (!T || typeof T !== 'object') { P('track data missing'); return C; }

    C.bpm = num(T.bpm, 0);
    if (!(C.bpm >= 40 && C.bpm <= 300)) P('bpm ' + T.bpm + ' outside 40..300');
    if (!(C.bpm > 0)) C.bpm = 120;
    C.loop = T.loop !== false;
    C.swing = clamp(num(T.swing, 0), 0, 0.5);
    C.gain = num(T.gain, 1);
    if (!(C.gain > 0 && C.gain <= 2)) { P('gain ' + T.gain + ' outside (0,2]'); C.gain = 1; }
    C.tail = clamp(num(T.tail, 0.3), 0, 5);

    let scale = null;
    if (T.scale === undefined) P('no scale declared');
    else {
      scale = scaleSet(T.scale);
      if (!scale) P('cannot parse scale ' + JSON.stringify(T.scale));
      else C.scaleName = Array.isArray(T.scale) ? T.scale.join(' ') : String(T.scale);
    }
    const chromatic = [];
    if (T.chromatic !== undefined) {
      if (!Array.isArray(T.chromatic)) P('chromatic must be an array of pitch class names');
      else for (let i = 0; i < T.chromatic.length; i++) {
        const pc = parsePc(T.chromatic[i]);
        if (pc < 0) P('bad chromatic pitch class ' + JSON.stringify(T.chromatic[i])); else chromatic[pc] = true;
      }
    }

    if (!T.ch || typeof T.ch !== 'object') { P('no channels'); return C; }
    let bars = -1;
    const names = Object.keys(T.ch);
    for (let ci = 0; ci < names.length; ci++) {
      const key = names[ci];
      const def = T.ch[key];
      const W = key + ' ';
      if (!def || typeof def !== 'object') { P(W + 'channel definition missing'); continue; }
      const inst = {};
      for (const k in INST) inst[k] = INST[k];
      for (const k in def) if (k !== 'bars') inst[k] = def[k];
      if (!WAVES[inst.w]) P(W + 'unknown wave "' + inst.w + '"');
      if (inst.vib) inst.vib = [num(inst.vib[0], 5.5), num(inst.vib[1], 10), num(inst.vib[2], 0.12)];
      if (inst.trem) inst.trem = [num(inst.trem[0], 6), num(inst.trem[1], 0.3)];
      if (inst.echo) inst.echo = [num(inst.echo[0], 0.2), num(inst.echo[1], 3), num(inst.echo[2], 0.3)];
      if (inst.fm) inst.fm = [num(inst.fm[0], 2), num(inst.fm[1], 2), num(inst.fm[2], 0.3)];
      const isDrum = inst.w === 'drums';
      const lines = [];
      expandLines(def.bars, T.pat, 0, lines, P, key);
      if (bars < 0) bars = lines.length;
      else if (lines.length !== bars) P(W + 'has ' + lines.length + ' bars, expected ' + bars);
      const n = lines.length, steps = n * STEPS;
      let lo = 0, hi = 127;
      if (inst.range) {
        lo = parseNote(inst.range[0]); hi = parseNote(inst.range[1]);
        if (lo < 0 || hi < 0) { P(W + 'bad range'); lo = 0; hi = 127; }
      }
      const ch = { name: key, inst: inst, drum: isDrum, steps: steps, ev: new Array(steps), cover: null, dv: null,
                   notes: 0, minMidi: 999, maxMidi: -1 };
      if (isDrum) { ch.ev = new Uint16Array(steps); ch.dv = new Float32Array(steps); }
      else { for (let i = 0; i < steps; i++) ch.ev[i] = null; ch.cover = new Int32Array(steps).fill(-1); }
      const cnt = {};
      let open = null;                              // note currently held (holds may cross barlines)
      for (let b = 0; b < n; b++) {
        const L = lines[b];
        const where = W + 'bar ' + (b + 1) + ' (line ' + L.src + ')';
        const toks = L.text.replace(/\|/g, ' ').trim().split(/\s+/);
        if (toks.length !== STEPS) P(where + ': ' + toks.length + ' tokens, expected ' + STEPS);
        for (let s = 0; s < STEPS && s < toks.length; s++) {
          const gi = b * STEPS + s;
          let tk = toks[s];
          if (tk === '.') { open = null; continue; }
          if (isDrum) {
            let vel = 1;
            const lc = tk.charAt(tk.length - 1);
            if (lc === '!') { vel = VEL_ACCENT; tk = tk.slice(0, -1); } else if (lc === ',') { vel = VEL_SOFT; tk = tk.slice(0, -1); }
            let mask = 0, bad = false;
            for (let q = 0; q < tk.length; q++) {
              const bit = DRUM_BITS[tk.charAt(q)];
              if (!bit) { P(where + ' step ' + (s + 1) + ': unknown drum token "' + toks[s] + '"'); bad = true; break; }
              mask |= bit;
            }
            if (!bad && mask) { ch.ev[gi] = mask; ch.dv[gi] = vel; ch.notes++; }
            continue;
          }
          if (tk === '-') {
            if (!open) { P(where + ' step ' + (s + 1) + ': hold "-" with no note to hold'); continue; }
            open.len++;
            ch.cover[gi] = open.start;
            continue;
          }
          let vel = 1;
          const lc = tk.charAt(tk.length - 1);
          if (lc === '!') { vel = VEL_ACCENT; tk = tk.slice(0, -1); } else if (lc === ',') { vel = VEL_SOFT; tk = tk.slice(0, -1); }
          const parts = tk.split('+');
          const mids = [], freqs = [];
          let bad = false;
          for (let q = 0; q < parts.length; q++) {
            const md = parseNote(parts[q]);
            if (md < 0) { P(where + ' step ' + (s + 1) + ': unknown token "' + toks[s] + '"'); bad = true; break; }
            if (md < MIDI_MIN || md > MIDI_MAX) { P(where + ' step ' + (s + 1) + ': ' + parts[q] + ' outside C1..C7'); bad = true; break; }
            if (md < lo || md > hi) { P(where + ' step ' + (s + 1) + ': ' + parts[q] + ' outside channel range ' + inst.range[0] + '..' + inst.range[1]); }
            const pcn = md % 12;
            if (scale && !scale[pcn]) {
              if (chromatic[pcn]) cnt[PC_NAMES[pcn]] = (cnt[PC_NAMES[pcn]] || 0) + 1;
              else P(where + ' step ' + (s + 1) + ': ' + parts[q] + ' is not in ' + C.scaleName + ' (list ' + PC_NAMES[pcn] + ' in chromatic to allow it)');
            }
            mids.push(md);
            freqs.push(midiHz(md));
            if (md < ch.minMidi) ch.minMidi = md;
            if (md > ch.maxMidi) ch.maxMidi = md;
          }
          if (bad) { open = null; continue; }
          const note = { start: gi, len: 1, vel: vel, mids: mids, freqs: freqs, f: freqs[0] };
          ch.ev[gi] = note;
          ch.cover[gi] = gi;
          ch.notes++;
          open = note;
        }
      }
      C.chroma[key] = cnt;
      C.ch.push(ch);
    }
    C.bars = Math.max(0, bars);
    C.steps = C.bars * STEPS;
    if (C.bars < 1) P('no bars');
    C.loopStart = num(T.loopStart, 0) | 0;
    if (C.loopStart < 0 || C.loopStart >= Math.max(1, C.bars)) { P('loopStart ' + T.loopStart + ' outside 0..' + (C.bars - 1)); C.loopStart = 0; }

    if (T.chords !== undefined) {
      const cl = [];
      expandLines(T.chords, T.pat, 0, cl, P, 'chords');
      if (cl.length !== C.bars) P('chords has ' + cl.length + ' lines, expected ' + C.bars);
      C.chords = cl.map(function (x) { return x.text; });
    }
    return C;
  }

  const cache = new WeakMap();
  function getC(name) {
    const T = M.tracks[name];
    if (!T) return null;
    let c = cache.get(T);
    if (!c) { c = compileTrack(name, T); cache.set(T, c); }
    return c;
  }

  // ------------------------------------------------------------------ WebAudio helpers
  function noiseFor(ctx) {
    if (ctx.__musicNoise) return ctx.__musicNoise;
    const n = Math.floor(ctx.sampleRate * 1.5);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 0x2f6e2b1;                          // xorshift32, deterministic
    for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = ((s >>> 0) / 2147483648) - 1; }
    ctx.__musicNoise = buf;
    return buf;
  }

  const PULSE = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 };
  function pulseWave(ctx, duty) {
    const cache2 = ctx.__musicPulse || (ctx.__musicPulse = {});
    if (cache2[duty]) return cache2[duty];
    const N = 256, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) {
      const k = 2 * Math.PI * n * duty;
      re[n] = Math.sin(k) / (n * Math.PI);
      im[n] = (1 - Math.cos(k)) / (n * Math.PI);
    }
    return (cache2[duty] = ctx.createPeriodicWave(re, im));
  }
  function setWave(osc, ctx, w) {
    if (PULSE[w]) osc.setPeriodicWave(pulseWave(ctx, PULSE[w]));
    else osc.type = w === 'saw' ? 'sawtooth' : w === 'tri' ? 'triangle' : w === 'sq' ? 'square' : 'sine';
  }

  // shared onended handler: disconnect the helper nodes stored on the source (no closure per note)
  function ended() {
    try { this.disconnect(); } catch (e) { /* ignore */ }
    if (this._a) { try { this._a.disconnect(); } catch (e) { /* ignore */ } this._a = null; }
    if (this._b) { try { this._b.disconnect(); } catch (e) { /* ignore */ } this._b = null; }
    if (this._c) { try { this._c.disconnect(); } catch (e) { /* ignore */ } this._c = null; }
  }

  function rampTo(param, target, now, sec) {
    try {
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
      else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
    } catch (e) { param.cancelScheduledValues(now); }
    if (sec <= 0.001) param.setValueAtTime(target, now); else param.linearRampToValueAtTime(target, now + sec);
  }

  // ------------------------------------------------------------------ drum voices
  function dNoise(ctx, out, t, dur, type, f0, f1, q, amp, off) {
    const src = ctx.createBufferSource();
    src.buffer = noiseFor(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(amp * 0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, off);
    src.stop(t + dur + 0.02);
    src._a = f; src._b = g;
    src.onended = ended;
  }
  // Pitched drum body. `slot` (kick/toms) makes the voice monophonic: the previous hit of the same drum is ramped out
  // (4 ms) when the next one starts, so rapid rolls cannot pile up low-frequency energy.
  function dTone(ctx, out, t, type, f0, f1, tf, dur, amp, chan, slot) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + tf);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(amp * 0.001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
    o._a = g;
    o.onended = ended;
    if (chan) {
      const prev = chan.slots[slot];
      if (prev && prev.g.gain.cancelAndHoldAtTime) {
        try {
          prev.g.gain.cancelAndHoldAtTime(t);
          prev.g.gain.linearRampToValueAtTime(0, t + 0.004);
          prev.o.stop(t + 0.006);
        } catch (e) { /* previous voice already gone */ }
      }
      chan.slots[slot] = { o: o, g: g };
    }
  }

  function drumHit(p, chan, mask, t, vel) {
    const ctx = p.ctx, out = chan.in, mx = chan.I.mix;
    const off = ((p.nc++ * 0.377) % 1.2);
    let n = 0;                                                        // simultaneous hits share headroom
    for (let m = mask; m; m &= m - 1) n++;
    vel *= COMBO[n] || 0.5;
    let v;
    if (mask & 1) {                                                   // kick
      v = vel * (mx && mx.k != null ? mx.k : 1);
      dTone(ctx, out, t, 'sine', 175, 46, 0.075, 0.2, 0.72 * v, chan, 0);
      dNoise(ctx, out, t, 0.008, 'highpass', 2500, 0, 0.7, 0.12 * v, off);
    }
    if (mask & 2) {                                                   // snare
      v = vel * (mx && mx.s != null ? mx.s : 1);
      dNoise(ctx, out, t, 0.14, 'highpass', 1300, 0, 0.7, 0.44 * v, off);
      dTone(ctx, out, t, 'triangle', 205, 140, 0.05, 0.1, 0.3 * v);
    }
    if (mask & 4) {                                                   // ghost snare
      v = vel * (mx && mx.g != null ? mx.g : 1);
      dNoise(ctx, out, t, 0.07, 'highpass', 1500, 0, 0.7, 0.2 * v, off);
    }
    if (mask & 8) {                                                   // closed hat
      v = vel * (mx && mx.h != null ? mx.h : 1);
      dNoise(ctx, out, t, 0.04, 'highpass', 7500, 0, 0.7, 0.24 * v, off);
    }
    if (mask & 16) {                                                  // open hat
      v = vel * (mx && mx.o != null ? mx.o : 1);
      dNoise(ctx, out, t, 0.17, 'highpass', 6800, 0, 0.7, 0.21 * v, off);
    }
    if (mask & 32) {                                                  // hi tom
      v = vel * (mx && mx.t != null ? mx.t : 1);
      dTone(ctx, out, t, 'sine', 240, 150, 0.09, 0.2, 0.6 * v, chan, 1);
      dNoise(ctx, out, t, 0.01, 'highpass', 2500, 0, 0.7, 0.08 * v, off);
    }
    if (mask & 64) {                                                  // mid tom
      v = vel * (mx && mx.m != null ? mx.m : 1);
      dTone(ctx, out, t, 'sine', 175, 105, 0.1, 0.24, 0.65 * v, chan, 2);
      dNoise(ctx, out, t, 0.01, 'highpass', 2500, 0, 0.7, 0.08 * v, off);
    }
    if (mask & 128) {                                                 // low tom
      v = vel * (mx && mx.d != null ? mx.d : 1);
      dTone(ctx, out, t, 'sine', 125, 72, 0.12, 0.3, 0.75 * v, chan, 3);
      dNoise(ctx, out, t, 0.01, 'highpass', 2500, 0, 0.7, 0.08 * v, off);
    }
    if (mask & 256) {                                                 // crash
      v = vel * (mx && mx.c != null ? mx.c : 1);
      dNoise(ctx, out, t, 1.0, 'highpass', 5200, 0, 0.7, 0.2 * v, off);
    }
    if (mask & 512) {                                                 // rim / click
      v = vel * (mx && mx.x != null ? mx.x : 1);
      dTone(ctx, out, t, 'square', 1900, 1500, 0.02, 0.035, 0.22 * v);
      dNoise(ctx, out, t, 0.03, 'bandpass', 4000, 0, 1.5, 0.2 * v, off);
    }
  }

  // ------------------------------------------------------------------ players
  function newPlayer(ctx, name, C, o) {
    return {
      ctx: ctx, name: name, C: C, pos: 0, nextTime: 0,
      stepDur: 60 / C.bpm / 4 / M.rate,
      loop: o.loop, level: o.level, fade: o.fade, onend: o.onend || null,
      done: false, dead: false, paused: false, offline: !!o.offline,
      endTime: 0, g: null, carry: false, resumePos: 0,
      rp: new Int32Array(64), rt: new Float64Array(64), rn: 0, nc: 0, log: o.log || null
    };
  }

  // Build the long-lived audio graph of a player: out gain -> dest, one chain per channel.
  function buildGraph(p, dest, o) {
    const ctx = p.ctx, C = p.C;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(dest);
    const g = { out: out, chans: [], nodes: [out] };
    const noFx = !!(o && o.noFx);
    for (let i = 0; i < C.ch.length; i++) {
      const c = C.ch[i], I = c.inst;
      if (o && o.solo && o.solo.indexOf(c.name) < 0) continue;
      if (o && o.mute && o.mute.indexOf(c.name) >= 0) continue;
      const chan = { c: c, I: I, name: c.name, in: null, cg: null, vlfo: null, dl: null, lastF: 0, lastEnd: -1, slots: [null, null, null, null] };
      const cg = ctx.createGain();
      cg.gain.value = I.vol * C.gain;
      let tail = cg;
      g.nodes.push(cg);
      if (!noFx && I.lp) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = I.lp;
        lp.Q.value = 0.7;
        lp.connect(cg);
        chan.in = lp;
        g.nodes.push(lp);
      } else chan.in = cg;
      let dst = out;
      if (I.pan && ctx.createStereoPanner) {
        const pn = ctx.createStereoPanner();
        pn.pan.value = clamp(I.pan, -1, 1);
        pn.connect(out);
        g.nodes.push(pn);
        dst = pn;
      }
      tail.connect(dst);
      if (!noFx && I.echo) {                            // feedback echo: [level, steps, feedback]
        const send = ctx.createGain(); send.gain.value = num(I.echo[0], 0.2);
        const dl = ctx.createDelay(2); dl.delayTime.value = clamp(num(I.echo[1], 3) * p.stepDur, 0.02, 1.9);
        const fb = ctx.createGain(); fb.gain.value = clamp(num(I.echo[2], 0.3), 0, 0.85);
        const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 3200;
        tail.connect(send); send.connect(dl); dl.connect(lp2); lp2.connect(fb); fb.connect(dl); lp2.connect(dst);
        g.nodes.push(send, dl, fb, lp2);
        chan.dl = dl;
      }
      if (!noFx && !c.drum && I.vib) {                  // shared vibrato LFO, tapped per note (see playNote)
        const lfo = ctx.createOscillator();
        lfo.frequency.value = I.vib[0];
        lfo.start();
        chan.vlfo = lfo;
        g.nodes.push(lfo);
      }
      if (!noFx && I.trem) {                            // tremolo: LFO modulates the channel gain
        const depth = clamp(num(I.trem[1], 0.3), 0, 1);
        cg.gain.value = I.vol * C.gain * (1 - depth);
        const tl = ctx.createOscillator();
        tl.frequency.value = I.trem[0];
        const tg = ctx.createGain();
        tg.gain.value = I.vol * C.gain * depth;
        tl.connect(tg); tg.connect(cg.gain);
        tl.start();
        g.nodes.push(tl, tg);
      }
      g.chans.push(chan);
    }
    p.g = g;
    return g;
  }

  function disposeGraph(g, fade, ctx) {
    if (!g) return;
    try {
      const now = ctx.currentTime;
      rampTo(g.out.gain, 0, now, fade);
    } catch (e) { /* ignore */ }
    setTimeout(function () {
      for (let i = 0; i < g.nodes.length; i++) {
        const n = g.nodes[i];
        try { if (n.stop) n.stop(); } catch (e) { /* not started / already stopped */ }
        try { n.disconnect(); } catch (e) { /* ignore */ }
      }
      g.nodes.length = 0;
    }, (fade + 0.15) * 1000);
  }

  function playNote(p, chan, n, t, lenSteps) {
    const ctx = p.ctx, I = chan.I;
    let dur = lenSteps * p.stepDur * I.g;
    if (dur < 0.03) dur = 0.03;
    const tOff = t + dur;
    const pk = n.vel;
    if (p.log) p.log.push([chan.name, t, dur, n.f, n.start, lenSteps]);
    // amplitude envelope: attack -> exponential decay to sustain level -> hold -> linear release
    const env = ctx.createGain();
    const gp = env.gain;
    let a = I.a;
    if (a > dur * 0.5) a = dur * 0.5;
    gp.setValueAtTime(0, t);
    gp.linearRampToValueAtTime(pk, t + a);
    let lvl = pk;
    if (I.s < 0.999 && I.d > 0) {
      const s = I.s < 0.002 ? 0.002 : I.s;
      if (t + a + I.d <= tOff) { lvl = pk * s; gp.exponentialRampToValueAtTime(lvl, t + a + I.d); }
      else { const fr = (tOff - t - a) / I.d; lvl = pk * Math.pow(s, fr > 0 ? fr : 0); gp.exponentialRampToValueAtTime(lvl, tOff); }
    }
    gp.setValueAtTime(lvl, tOff);
    gp.linearRampToValueAtTime(0, tOff + I.r);
    const tEnd = tOff + I.r + 0.02;

    const osc = ctx.createOscillator();
    setWave(osc, ctx, I.w);
    const fp = osc.frequency;
    if (n.freqs.length > 1) {                                        // chord -> fast arpeggio on one voice
      const fs = n.freqs, ai = 1 / I.arpHz;
      let k = 0;
      for (let tt = t; tt < tOff; tt += ai, k++) fp.setValueAtTime(fs[k % fs.length], tt);
    } else {
      const f = n.f;
      if (I.port > 0 && chan.lastF > 0 && t - chan.lastEnd < 0.04 && chan.lastF !== f) {
        fp.setValueAtTime(chan.lastF, t);
        fp.exponentialRampToValueAtTime(f, t + Math.min(I.port, dur * 0.8));
      } else if (I.bend && lenSteps >= I.bendMin) {
        fp.setValueAtTime(f * Math.pow(2, I.bend / 12), t);
        fp.exponentialRampToValueAtTime(f, t + I.bendT);
      } else fp.setValueAtTime(f, t);
      chan.lastF = f;
    }
    chan.lastEnd = tOff;
    if (I.det) osc.detune.value = I.det;
    let vg = null;
    if (chan.vlfo && n.freqs.length === 1 && dur > I.vib[2] + 0.06) {   // vibrato fades in after vib[2] seconds
      vg = ctx.createGain();
      vg.gain.setValueAtTime(0, t);
      vg.gain.setValueAtTime(0, t + I.vib[2]);
      vg.gain.linearRampToValueAtTime(I.vib[1], t + I.vib[2] + 0.12);
      chan.vlfo.connect(vg);
      vg.connect(osc.detune);
    }
    let mg = null;
    if (I.w === 'fm') {                                              // 2-operator FM: sine modulator on carrier frequency
      const fm = I.fm || [2, 2, 0.3];
      const mod = ctx.createOscillator();
      mod.frequency.setValueAtTime(n.f * fm[0], t);
      mg = ctx.createGain();
      const dev = fm[1] * n.f * fm[0];
      mg.gain.setValueAtTime(dev, t);
      mg.gain.exponentialRampToValueAtTime(dev * 0.04, t + fm[2]);
      mod.connect(mg); mg.connect(osc.frequency);
      mod.start(t); mod.stop(tEnd);
      mod._a = mg; mod.onended = ended;
    }
    osc.connect(env);
    env.connect(chan.in);
    osc.start(t);
    osc.stop(tEnd);
    osc._a = env; osc._b = vg;
    osc.onended = ended;
  }

  // Schedule everything that starts on step `pos` at audio time t.
  function stepAt(p, pos, t) {
    const chans = p.g.chans;
    for (let i = 0; i < chans.length; i++) {
      const chan = chans[i], c = chan.c;
      if (c.drum) {
        const mk = c.ev[pos];
        if (mk) drumHit(p, chan, mk, t, c.dv[pos]);
        continue;
      }
      const n = c.ev[pos];
      if (n) playNote(p, chan, n, t, n.len);
      else if (p.carry) {                                           // after resume: re-strike a note that spans this step
        const s = c.cover[pos];
        if (s >= 0 && s < pos) { const cn = c.ev[s]; playNote(p, chan, cn, t, cn.len - (pos - s)); }
      }
    }
    p.carry = false;
  }

  function advance(p) {
    const C = p.C;
    p.pos++;
    if (p.pos >= C.steps) {
      if (p.loop) p.pos = C.loopStart * STEPS;
      else { p.done = true; p.pos = C.steps; p.endTime = p.nextTime + C.tail; }
    }
  }

  // Look-ahead scheduler core; works on any BaseAudioContext (live or offline).
  function pump(p, until, maxSteps) {
    if (!p.g) return;
    const C = p.C;
    if (!p.offline) {
      const now = p.ctx.currentTime;
      if (p.nextTime < now - 0.03) {                                // fell behind (stall / hidden tab): skip, never burst
        let skip = Math.ceil((now - p.nextTime) / p.stepDur);
        p.nextTime += skip * p.stepDur;
        while (skip-- > 0 && !p.done) advance(p);
      }
    }
    let guard = maxSteps || 512;
    while (!p.done && p.nextTime < until && guard-- > 0) {
      const pos = p.pos, t = p.nextTime;
      const k = p.rn & 63;
      p.rp[k] = pos; p.rt[k] = t; p.rn++;
      stepAt(p, pos, (pos & 1) && C.swing ? t + C.swing * p.stepDur : t);
      p.nextTime = t + p.stepDur;
      advance(p);
    }
  }

  // ------------------------------------------------------------------ live playback
  let cur = null;                 // current player
  let pending = null;             // {name, opts} requested before Sound.init()
  let timer = 0;
  const active = [];

  function lookahead() {
    return (typeof document !== 'undefined' && document.hidden) ? LOOKAHEAD_HIDDEN : LOOKAHEAD;
  }

  function startTimer() { if (!timer) timer = setInterval(tick, TICK_MS); }

  // one shared setInterval; it switches itself off when nothing is playing (or everything is paused)
  function tick() {
    try {
      let running = 0;
      for (let i = active.length - 1; i >= 0; i--) {
        const p = active[i];
        if (p.dead) { active.splice(i, 1); continue; }
        if (p.paused) continue;
        running++;
        const now = p.ctx.currentTime;
        if (!p.done) pump(p, now + lookahead());
        if (p.done && now >= p.endTime) finish(p);
      }
      if (!running && timer) { clearInterval(timer); timer = 0; }
    } catch (e) { warnOnce('tick', 'Music: scheduler error', e); }
  }

  function finish(p) {
    p.dead = true;
    if (cur === p) { cur = null; M.current = null; }
    disposeGraph(p.g, 0.05, p.ctx);
    p.g = null;
    const cb = p.onend;
    p.onend = null;
    if (cb) { try { cb(); } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } } }
  }

  function killPlayer(p, fade) {
    p.dead = true;
    if (p.g) { disposeGraph(p.g, fade, p.ctx); p.g = null; }
  }

  function haveAudio() {
    return typeof Sound !== 'undefined' && Sound && Sound.ctx && Sound.musicBus;
  }

  function startTrack(name, opts) {
    const C = getC(name);
    if (!C) return false;
    const ctx = Sound.ctx;
    const now = ctx.currentTime;
    let startAt = now + 0.03;
    if (cur) { const prev = cur; cur = null; killPlayer(prev, 0.15); startAt = now + 0.16; }
    const loop = opts.loop !== undefined ? !!opts.loop : C.loop;
    const p = newPlayer(ctx, name, C, {
      loop: loop, level: clamp(num(opts.volume, 1), 0, 1.5), fade: Math.max(0, num(opts.fade, 0)), onend: opts.onend
    });
    buildGraph(p, Sound.musicBus, null);
    const gp = p.g.out.gain;
    gp.setValueAtTime(0, now);
    if (p.fade > 0.01) { gp.setValueAtTime(0, startAt); gp.linearRampToValueAtTime(p.level, startAt + p.fade); }
    else gp.setValueAtTime(p.level, startAt);
    p.nextTime = startAt;
    cur = p;
    M.current = name;
    active.push(p);
    startTimer();
    pump(p, now + lookahead());
    return true;
  }

  M.play = function (name, opts) {
    try {
      const T = M.tracks[name];
      if (!T) { warnOnce('track:' + name, 'Music.play: unknown track "' + name + '"'); return false; }
      opts = opts || {};
      if (!haveAudio()) { pending = { name: name, opts: opts }; M.current = name; return true; }
      if (cur && !cur.dead && M.current === name && !opts.restart) return true;
      pending = null;
      return startTrack(name, opts);
    } catch (e) {
      warnOnce('play', 'Music.play failed', e);
      return false;
    }
  };

  M.stop = function (fadeSec) {
    try {
      pending = null;
      const p = cur;
      cur = null;
      M.current = null;
      if (p) killPlayer(p, fadeSec === undefined ? 0.3 : Math.max(0, num(fadeSec, 0.3)));
    } catch (e) { /* ignore */ }
  };

  // Pause keeps the song position: the audio graph is dropped (silencing everything already
  // scheduled) and resume() continues on the first step that had not started yet.
  M.pause = function () {
    try {
      const p = cur;
      if (!p || p.paused || p.dead) return;
      const now = p.ctx.currentTime;
      let pos = p.pos, best = Infinity;
      const n = Math.min(p.rn, 64);
      for (let i = 0; i < n; i++) { const t = p.rt[i]; if (t > now + 0.002 && t < best) { best = t; pos = p.rp[i]; } }
      p.resumePos = pos;
      p.paused = true;
      if (p.g) { disposeGraph(p.g, 0.03, p.ctx); p.g = null; }
    } catch (e) { /* ignore */ }
  };

  M.resume = function () {
    try {
      const p = cur;
      if (!p || !p.paused || p.dead || !haveAudio()) return;
      p.paused = false;
      if (p.resumePos >= p.C.steps) { p.done = true; p.endTime = 0; startTimer(); return; }     // paused during the tail of a jingle
      const now = p.ctx.currentTime;
      buildGraph(p, Sound.musicBus, null);
      const gp = p.g.out.gain;
      gp.setValueAtTime(0, now);
      gp.linearRampToValueAtTime(p.level, now + 0.05);
      p.done = false;
      p.pos = p.resumePos;
      p.nextTime = now + 0.04;
      p.carry = true;
      p.rn = 0;
      startTimer();
      pump(p, now + lookahead());
    } catch (e) { warnOnce('resume', 'Music.resume failed', e); }
  };

  M.setRate = function (r) {
    try {
      M.rate = clamp(num(r, 1), 0.25, 3);
      const p = cur;
      if (p) {
        p.stepDur = 60 / p.C.bpm / 4 / M.rate;
        if (p.g) for (let i = 0; i < p.g.chans.length; i++) {
          const ch = p.g.chans[i];
          if (ch.dl) ch.dl.delayTime.setTargetAtTime(clamp(num(ch.I.echo[1], 3) * p.stepDur, 0.02, 1.9), p.ctx.currentTime, 0.05);
        }
      }
    } catch (e) { /* ignore */ }
  };

  M.list = function () { return Object.keys(M.tracks); };
  M._state = function () {                       // test hook
    const p = cur;
    return { current: M.current, pending: pending ? pending.name : null, timer: !!timer, active: active.length,
             paused: !!(p && p.paused), pos: p ? (p.paused ? p.resumePos : p.pos) : -1, done: !!(p && p.done),
             nextTime: p ? p.nextTime : 0, now: p ? p.ctx.currentTime : 0, hasGraph: !!(p && p.g) };
  };
  M.isPlaying = function () { return !!(cur && !cur.dead && !cur.paused); };

  // Called by Sound.init(): start a track that was requested before audio was available.
  M._flush = function () {
    try {
      if (!pending || !haveAudio()) return;
      const pd = pending;
      pending = null;
      M.current = null;
      M.play(pd.name, pd.opts);
    } catch (e) { warnOnce('flush', 'Music._flush failed', e); }
  };

  // ------------------------------------------------------------------ validation / info
  M.validate = function (name) {
    const out = [];
    try {
      const names = name ? [name] : Object.keys(M.tracks);
      for (let i = 0; i < names.length; i++) {
        if (!M.tracks[names[i]]) { out.push(names[i] + ': unknown track'); continue; }
        const c = compileTrack(names[i], M.tracks[names[i]]);     // fresh compile: sees edits made after load
        for (let k = 0; k < c.problems.length; k++) out.push(c.problems[k]);
      }
    } catch (e) { out.push('validate crashed: ' + (e && e.message)); }
    return out;
  };

  M._compile = function (name) { return compileTrack(name, M.tracks[name]); };   // test hook: compiled events

  M.info = function (name) {
    const c = compileTrack(name, M.tracks[name]);
    const stepSec = 60 / c.bpm / 4;
    const info = { name: name, title: (M.tracks[name] || {}).name, bpm: c.bpm, bars: c.bars, loop: c.loop, loopStart: c.loopStart,
                   seconds: c.steps * stepSec, loopSeconds: (c.steps - c.loopStart * STEPS) * stepSec,
                   scale: c.scaleName, chromatic: c.chroma, channels: {}, chords: c.chords };
    for (let i = 0; i < c.ch.length; i++) {
      const ch = c.ch[i];
      info.channels[ch.name] = { notes: ch.notes, min: ch.maxMidi < 0 ? null : midiName(ch.minMidi), max: ch.maxMidi < 0 ? null : midiName(ch.maxMidi), wave: ch.inst.w, vol: ch.inst.vol };
    }
    return info;
  };

  // ------------------------------------------------------------------ offline rendering (tests)
  // Renders a track through the very same scheduler into an OfflineAudioContext (dry by default).
  // opts: {solo:[names], mute:[names], noFx:bool, loop:bool, rate, chain:bool (real master chain at default volumes), sampleRate, log:bool}
  // Resolves to a Float32Array (left channel) carrying .right, .sampleRate, .stepDur, .log (notes scheduled) and .info
  M._renderOffline = function (name, seconds, opts) {
    try {
      const T = M.tracks[name];
      if (!T) return Promise.reject(new Error('unknown track ' + name));
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      opts = opts || {};
      const C = getC(name);
      const sr = opts.sampleRate || 44100;
      const oldRate = M.rate;
      M.rate = opts.rate || 1;
      const loop = opts.loop !== undefined ? !!opts.loop : C.loop;
      if (!seconds) seconds = C.steps * 60 / C.bpm / 4 / M.rate + C.tail + 1;
      const ctx = new OAC(2, Math.ceil(sr * seconds), sr);
      let dest = ctx.destination;
      if (opts.chain && typeof Sound !== 'undefined' && Sound._buildChain) dest = Sound._buildChain(ctx, ctx.destination).musicBus;
      const log = opts.log ? [] : null;
      const p = newPlayer(ctx, name, C, { loop: loop, level: 1, fade: 0, offline: true, log: log });
      M.rate = oldRate;
      buildGraph(p, dest, opts);
      p.g.out.gain.value = 1;
      p.nextTime = 0;
      pump(p, seconds + 0.01, 1e7);
      return ctx.startRendering().then(function (buf) {
        const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
        const o = new Float32Array(l);
        o.right = new Float32Array(r);
        o.sampleRate = sr;
        o.stepDur = p.stepDur;
        o.log = log;
        o.info = { bars: C.bars, steps: C.steps, loopStart: C.loopStart, bpm: C.bpm, loopSeconds: (C.steps - C.loopStart * STEPS) * p.stepDur, seconds: C.steps * p.stepDur };
        return o;
      });
    } catch (e) {
      return Promise.reject(e);
    }
  };

  return M;
})();

// ============================================================================
//  TRACKS  (all original compositions)
// ============================================================================

// TITLE -- D major, 124 BPM, 16 bars: A (heroic dotted theme, harmony enters at bar 5) / B (soaring, lyrical)
Music.tracks.title = {
  name: 'Title', bpm: 124, scale: 'D major', chromatic: [], loop: true, loopStart: 0, gain: 1,
  chords: `
    D
    A
    Bm7
    G
    D
    A
    G
    A
    Bm7
    G
    D
    A
    Bm7
    G6
    A
    A
  `,
  pat: {
    g1: `
      kh . h . | sh . h . | kh . kh . | sh . h .
    `,
    g1c: `
      kch . h . | sh . h . | kh . kh . | sh . h .
    `,
    f4: `
      kh . h . | sh . h . | kh . h . | s s t m
    `,
    f8: `
      kh . h . | sh . h . | k . s . | s t m d
    `,
    gB: `
      kch . o . | s . o . | kh . o k | s . o .
    `,
    gB2: `
      kh . o . | s . o . | kh . o k | s . o .
    `,
    f16: `
      kh . o . | s . o . | k . s . | s s t t
    `,
  },
  ch: {
    lead: { w: 'pulse25', vol: 0.23, a: 0.006, d: 0.3, s: 0.8, r: 0.06, g: 0.94, vib: [5.6, 14, 0.16], bend: -0.3, bendT: 0.045, echo: [0.14, 3, 0.32], pan: 0.05, bars: `
        D5 - - - | - - E5 - | F#5 - - - | - - E5 -
        A5 - - - | - - G5 - | F#5 - E5 - | D5 - C#5 -
        B4 - - - | - - C#5 - | D5 - - - | - - F#5 -
        B5 - - - | - - A5 - | G5 - F#5 - | E5 - D5 -
        F#5 - - - | - - G5 - | A5 - - - | - - G5 -
        C#6 - - - | - - B5 - | A5 - G5 - | F#5 - E5 -
        B5 - - - | A5 - G5 - | D5 - - - | - - - -
        E5 - - - | C#5 - - - | A4 - - - | C#5 - E5 -
        F#5 - - - | B5 - - - | D6 - - - | - - - -
        D6 - - - | B5 - - - | G5 - - - | - - - -
        A5 - - - | D6 - - - | F#6 - - - | - - - -
        E6 - - - | - - D6 - | C#6 - - - | A5 - - -
        D6 - - - | - - C#6 - | B5 - - - | F#5 - - -
        G5 - B5 - | D6 - - - | E6 - - - | - - - -
        E6 - - - | D6 - C#6 - | A5 - - - | - - - -
        A5 - - - | F#5 - E5 - | C#5 - - - | . . . .
      ` },
    harm: { w: 'pulse50', vol: 0.077, a: 0.01, d: 0.2, s: 0.8, r: 0.07, g: 0.96, vib: [5.2, 10, 0.2], det: 6, pan: 0.3, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        D5 - - - | - - - - | - - - - | - - - -
        A5 - - - | - - E5 - | - - - - | C#5 - - -
        G5 - - - | D5 - - - | B4 - - - | - - - -
        C#5 - - - | A4 - - - | E4 - - - | A4 - - -
        D5 - - - | F#5 - - - | - - - - | - - - -
        B5 - - - | G5 - - - | D5 - - - | - - - -
        - - - - | A5 - - - | D6 - - - | - - - -
        C#6 - - - | - - A5 - | - - - - | E5 - - -
        B5 - - - | - - A5 - | F#5 - - - | D5 - - -
        - - G5 - | - - - - | B5 - - - | - - - -
        C#6 - - - | A5 - - - | E5 - - - | - - - -
        - - - - | C#5 - - - | A4 - - - | . . . .
      ` },
    arp: { w: 'pulse12', vol: 0.17, a: 0.002, d: 0.09, s: 0.45, r: 0.03, g: 0.8, pan: -0.3, bars: `
        D4 F#4 A4 D5 | A4 F#4 A4 D5 | D4 F#4 A4 D5 | A4 F#4 A4 D5
        E4 A4 C#5 E5 | C#5 A4 C#5 E5 | E4 A4 C#5 E5 | C#5 A4 C#5 E5
        D4 F#4 B4 D5 | B4 F#4 B4 D5 | D4 F#4 B4 D5 | B4 F#4 B4 D5
        D4 G4 B4 D5 | B4 G4 B4 D5 | D4 G4 B4 D5 | B4 G4 B4 D5
        D4 F#4 A4 D5 | A4 F#4 A4 D5 | D4 F#4 A4 D5 | A4 F#4 A4 D5
        E4 A4 C#5 E5 | C#5 A4 C#5 E5 | E4 A4 C#5 E5 | C#5 A4 C#5 E5
        D4 G4 B4 D5 | B4 G4 B4 D5 | D4 G4 B4 D5 | B4 G4 B4 D5
        E4 A4 C#5 E5 | C#5 A4 C#5 E5 | E4 A4 C#5 E5 | C#5 A4 C#5 E5
        D4 . B4 . | D5 . B4 . | F#4 . B4 . | D5 . B4 .
        D4 . B4 . | D5 . B4 . | G4 . B4 . | D5 . B4 .
        D4 . A4 . | D5 . A4 . | F#4 . A4 . | D5 . A4 .
        E4 . C#5 . | E5 . C#5 . | A4 . C#5 . | E5 . C#5 .
        D4 . B4 . | D5 . B4 . | F#4 . B4 . | D5 . B4 .
        D4 . B4 . | E5 . B4 . | G4 . B4 . | E5 . B4 .
        E4 . C#5 . | E5 . C#5 . | A4 . C#5 . | E5 . C#5 .
        E4 . C#5 . | E5 . C#5 . | A4 . C#5 . | E5 . C#5 .
      ` },
    bass: { w: 'tri', vol: 0.185, a: 0.003, d: 0.06, s: 0.9, r: 0.03, g: 0.92, bars: `
        D2 - D3 - | D2 - D3 - | D2 - D3 - | D2 - D3 -
        A2 - A3 - | A2 - A3 - | A2 - A3 - | A2 - A3 -
        B2 - B3 - | B2 - B3 - | B2 - B3 - | B2 - B3 -
        G2 - G3 - | G2 - G3 - | G2 - G3 - | G2 - E2 -
        D2 - D3 - | D2 - D3 - | D2 - D3 - | D2 - D3 -
        A2 - A3 - | A2 - A3 - | A2 - A3 - | A2 - A3 -
        G2 - G3 - | G2 - G3 - | G2 - G3 - | G2 - G3 -
        A2 - A3 - | A2 - A3 - | A2 - A3 - | E3 - A3 -
        B2 - - - | - - B3 - | B2 - - - | F#3 - B3 -
        G2 - - - | - - G3 - | G2 - - - | D3 - G3 -
        D2 - - - | - - D3 - | D2 - - - | A2 - D3 -
        A2 - - - | - - A3 - | A2 - - - | E3 - A3 -
        B2 - - - | - - B3 - | B2 - - - | F#3 - B3 -
        G2 - - - | - - G3 - | G2 - - - | D3 - G3 -
        A2 - - - | - - A3 - | A2 - - - | E3 - A3 -
        A2 - - - | - - A3 - | A2 - - - | A3 - E3 -
      ` },
    drums: { w: 'drums', vol: 0.5, bars: `
        @g1 *3
        @f4
        @g1c
        @g1 *2
        @f8
        @gB
        @gB2 *6
        @f16
      ` }
  }
};

// STAGE 1 (Volcano) -- E minor, 150 BPM, 24 bars: A (rising-arpeggio hook) / B (3-3-2 chase) / A' (hook + harmony)
Music.tracks.stage1 = {
  name: 'Volcano', bpm: 150, scale: 'E minor', chromatic: ['D#'], loop: true, loopStart: 0, gain: 1,
  chords: `
    Em
    Em
    C
    D
    Em
    Em
    C
    B7
    Am
    Am7
    Em
    Em7
    C
    D
    B7
    B7
    Em
    Em
    C
    D
    Em
    Em
    C
    B7
  `,
  pat: {
    gA: `
      kh . h . | sh . h . | kh . kh . | sh . h k
    `,
    fA: `
      kh . h . | sh . h . | kh . kh . | s s t m
    `,
    fA2: `
      kh . h . | sh . h . | k . s . | s t m d
    `,
    gB: `
      kch h, h h, | sh h, h h, | kh h, kh h, | sh h, h h,
    `,
    gB2: `
      kh h, h h, | sh h, h h, | kh h, kh h, | sh h, h h,
    `,
    fB: `
      kh h, h h, | sh h, h h, | k h, s h, | s s t t
    `,
  },
  ch: {
    lead: { w: 'pulse25', vol: 0.23, a: 0.006, d: 0.3, s: 0.8, r: 0.06, g: 0.94, vib: [6.2, 16, 0.14], bend: -0.3, bendT: 0.045, echo: [0.14, 3, 0.32], pan: 0.05, bars: `
        E5 - - G5 | B5 - - - | A5 - G5 - | F#5 - - -
        E5 - - G5 | B5 - A5 - | G5 - F#5 - | E5 - - -
        C5 - - E5 | G5 - - - | A5 - G5 - | E5 - - -
        D5 - - F#5 | A5 - - - | B5 - A5 - | F#5 - - -
        E5 - - G5 | B5 - - - | A5 - G5 - | F#5 - - -
        E5 - - G5 | B5 - A5 - | G5 - F#5 - | E5 - - -
        C5 - - E5 | G5 - - - | A5 - G5 - | E5 - - -
        D#5 - - F#5 | A5 - - - | B5 - A5 - | F#5 - - -
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        E5 - - G5 | B5 - - - | A5 - G5 - | F#5 - - -
        E5 - - G5 | B5 - A5 - | G5 - F#5 - | E5 - - -
        C5 - - E5 | G5 - - - | A5 - G5 - | E5 - - -
        D5 - - F#5 | A5 - - - | B5 - A5 - | F#5 - - -
        E5 - - G5 | B5 - - - | A5 - G5 - | F#5 - - -
        E5 - - G5 | B5 - A5 - | G5 - F#5 - | E5 - - -
        C5 - - E5 | G5 - - - | A5 - G5 - | E5 - - -
        D#5 - - F#5 | A5 - - - | B5 - A5 - | F#5 - - -
      ` },
    lead2: { w: 'pulse12', vol: 0.3, a: 0.006, d: 0.3, s: 0.8, r: 0.06, g: 0.94, vib: [5.6, 10, 0.2], bend: 0, bendT: 0.045, echo: null, pan: 0.05, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        A5 - - A5 | - - C6 - | E6 - - C6 | - - A5 -
        A5 - - A5 | - - C6 - | E6 - - G6 | - - E6 -
        G5 - - G5 | - - B5 - | E6 - - B5 | - - G5 -
        G5 - - B5 | - - E6 - | D6 - - B5 | - - G5 -
        E5 - - E5 | - - G5 - | C6 - - G5 | - - E5 -
        F#5 - - F#5 | - - A5 - | D6 - - A5 | - - F#5 -
        F#5 - - F#5 | - - A5 - | B5 - - D#6 | - - F#6 -
        B5 - - - | - - A5 - | F#5 - - - | D#5 - - -
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
      ` },
    harm: { w: 'pulse50', vol: 0.077, a: 0.01, d: 0.2, s: 0.8, r: 0.07, g: 0.96, vib: [5.2, 10, 0.2], det: 6, pan: 0.3, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        B4 - - - | G5 - - - | E5 - - - | B4 - - -
        - - - - | G5 - E5 - | - - B4 - | - - - -
        G4 - - C5 | - - - - | E5 - - - | C5 - - -
        B4 - - - | F#5 - - - | - - - - | D#5 - - -
        C5 - - - | - - - - | - - - - | - - - -
        C5 - - - | - - - - | - - - - | - - - -
        B4 - - - | - - - - | - - - - | - - - -
        B4 - - - | - - - - | - - - - | - - - -
        G4 - - - | - - - - | - - - - | - - - -
        F#4 - - - | - - - - | - - - - | - - - -
        D#5 - - - | - - - - | - - - - | - - - -
        D#5 - - - | - - - - | - - - - | - - - -
        B4 - - - | G5 - - - | E5 - - - | B4 - - -
        - - - - | G5 - E5 - | - - B4 - | - - - -
        G4 - - C5 | - - - - | E5 - - - | C5 - - -
        A4 - - D5 | - - - - | F#5 - - - | D5 - - -
        B4 - - - | G5 - - - | E5 - - - | B4 - - -
        - - - - | G5 - E5 - | - - B4 - | - - - -
        G4 - - C5 | - - - - | E5 - - - | C5 - - -
        B4 - - - | F#5 - - - | - - - - | D#5 - - -
      ` },
    arp: { w: 'pulse12', vol: 0.17, a: 0.002, d: 0.09, s: 0.45, r: 0.03, g: 0.8, pan: -0.3, bars: `
        E5 B4 G4 E4 | G4 B4 E5 B4 | E5 B4 G4 E4 | G4 B4 E5 B4
        E5 B4 G4 E4 | G4 B4 E5 B4 | E5 B4 G4 E4 | G4 B4 E5 B4
        E5 C5 G4 E4 | G4 C5 E5 C5 | E5 C5 G4 E4 | G4 C5 E5 C5
        D5 A4 F#4 D4 | F#4 A4 D5 A4 | D5 A4 F#4 D4 | F#4 A4 D5 A4
        E5 B4 G4 E4 | G4 B4 E5 B4 | E5 B4 G4 E4 | G4 B4 E5 B4
        E5 B4 G4 E4 | G4 B4 E5 B4 | E5 B4 G4 E4 | G4 B4 E5 B4
        E5 C5 G4 E4 | G4 C5 E5 C5 | E5 C5 G4 E4 | G4 C5 E5 C5
        B4 A4 F#4 D#4 | F#4 A4 B4 A4 | B4 A4 F#4 D#4 | F#4 A4 B4 A4
        . . A4+C5+E5 . | . . A4+C5+E5 . | . . A4+C5+E5 . | . . A4+C5+E5 .
        . . A4+C5+E5 . | . . A4+C5+E5 . | . . A4+C5+E5 . | . . A4+C5+E5 .
        . . E4+G4+B4 . | . . E4+G4+B4 . | . . E4+G4+B4 . | . . E4+G4+B4 .
        . . E4+G4+B4 . | . . E4+G4+B4 . | . . E4+G4+B4 . | . . E4+G4+B4 .
        . . E4+G4+C5 . | . . E4+G4+C5 . | . . E4+G4+C5 . | . . E4+G4+C5 .
        . . D4+F#4+A4 . | . . D4+F#4+A4 . | . . D4+F#4+A4 . | . . D4+F#4+A4 .
        . . D#4+F#4+A4 . | . . D#4+F#4+A4 . | . . D#4+F#4+A4 . | . . D#4+F#4+A4 .
        . . D#4+F#4+A4 . | . . D#4+F#4+A4 . | . . D#4+F#4+A4 . | . . D#4+F#4+A4 .
        E5 B4 G4 E4 | G4 B4 E5 B4 | E5 B4 G4 E4 | G4 B4 E5 B4
        E5 B4 G4 E4 | G4 B4 E5 B4 | E5 B4 G4 E4 | G4 B4 E5 B4
        E5 C5 G4 E4 | G4 C5 E5 C5 | E5 C5 G4 E4 | G4 C5 E5 C5
        D5 A4 F#4 D4 | F#4 A4 D5 A4 | D5 A4 F#4 D4 | F#4 A4 D5 A4
        E5 B4 G4 E4 | G4 B4 E5 B4 | E5 B4 G4 E4 | G4 B4 E5 B4
        E5 B4 G4 E4 | G4 B4 E5 B4 | E5 B4 G4 E4 | G4 B4 E5 B4
        E5 C5 G4 E4 | G4 C5 E5 C5 | E5 C5 G4 E4 | G4 C5 E5 C5
        B4 A4 F#4 D#4 | F#4 A4 B4 A4 | B4 A4 F#4 D#4 | F#4 A4 B4 A4
      ` },
    bass: { w: 'tri', vol: 0.185, a: 0.003, d: 0.06, s: 0.9, r: 0.03, g: 0.92, bars: `
        E2 - E2 - | E3 - E2 - | E2 - E2 - | E3 - E2 -
        E2 - E2 - | B2 - E2 - | E2 - E2 - | E3 - B2 -
        C3 - C3 - | C4 - C3 - | C3 - C3 - | C4 - C3 -
        D3 - D3 - | D4 - D3 - | D3 - D3 - | D4 - D3 -
        E2 - E2 - | E3 - E2 - | E2 - E2 - | E3 - E2 -
        E2 - E2 - | B2 - E2 - | E2 - E2 - | E3 - B2 -
        C3 - C3 - | C4 - C3 - | C3 - C3 - | C4 - C3 -
        B2 - B2 - | B3 - B2 - | B2 - B3 - | F#3 - E3 -
        A2 - A2 - | A3 - A2 - | A2 - A2 - | A3 - A2 -
        A2 - A2 - | E3 - A2 - | A2 - A2 - | A3 - E3 -
        E2 - E2 - | E3 - E2 - | E2 - E2 - | E3 - E2 -
        E2 - E2 - | B2 - E2 - | E2 - E2 - | E3 - B2 -
        C3 - C3 - | C4 - C3 - | C3 - C3 - | C4 - C3 -
        D3 - D3 - | D4 - D3 - | D3 - D3 - | D4 - D3 -
        B2 - B2 - | F#3 - B2 - | B2 - B2 - | B3 - F#3 -
        B2 - B2 - | B3 - B2 - | B2 - B3 - | F#3 - E3 -
        E2 - E2 - | E3 - E2 - | E2 - E2 - | E3 - E2 -
        E2 - E2 - | B2 - E2 - | E2 - E2 - | E3 - B2 -
        C3 - C3 - | C4 - C3 - | C3 - C3 - | C4 - C3 -
        D3 - D3 - | D4 - D3 - | D3 - D3 - | D4 - D3 -
        E2 - E2 - | E3 - E2 - | E2 - E2 - | E3 - E2 -
        E2 - E2 - | B2 - E2 - | E2 - E2 - | E3 - B2 -
        C3 - C3 - | C4 - C3 - | C3 - C3 - | C4 - C3 -
        B2 - B2 - | B3 - B2 - | B2 - B3 - | F#3 - E3 -
      ` },
    drums: { w: 'drums', vol: 0.5, bars: `
        @gA *3
        @fA
        @gA *3
        @fA2
        @gB
        @gB2 *6
        @fB
        @gA *3
        @fA
        @gA *3
        @fA2
      ` }
  }
};

// STAGE 2 (Stonehenge) -- D Dorian (+ Phrygian Eb cadence), 132 BPM, 24 bars: ostinato intro / organum theme / majestic B / turnaround
Music.tracks.stage2 = {
  name: 'Stonehenge', bpm: 132, scale: 'D dorian', chromatic: ['Eb', 'Bb'], loop: true, loopStart: 0, gain: 1,
  chords: `
    Dmadd9
    Dmadd9
    Cadd9
    Dmadd9
    Dmadd9
    Dmadd9
    Cadd9
    Dmadd9
    Dmadd9
    Fadd9
    Gadd9
    Dmadd9
    Fadd9
    Cadd9
    Gadd9
    Dmadd9
    Fadd9
    Cadd9
    Gadd9
    Amadd9
    Dmadd9
    Dmadd9
    Eb
    Dmadd9
  `,
  pat: {
    dI: `
      dh, . . . | h, . . . | mh, . . . | h, . t .
    `,
    dA: `
      dh, . . . | h, . . t | mh, . . . | h, . t m
    `,
    dA2: `
      dh, . . . | h, . . t | mh, . . . | h, t m d
    `,
    mB: `
      kc . . . | s . . . | k . . k | sh, . t m
    `,
    mB2: `
      k . . . | s . . . | k . . k | s . t m
    `,
    mBf: `
      k . . . | s . . . | k . t . | m . d d
    `,
    dT: `
      d . . . | . . . . | m . . . | . . . .
    `,
  },
  ch: {
    lead: { w: 'fm', fm: [1, 1.6, 1.4], vol: 0.2, a: 0.03, d: 0.5, s: 0.85, r: 0.25, g: 0.97, vib: [5, 11, 0.3], echo: [0.22, 6, 0.4], pan: 0.05, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        D5 - - - | - - - - | A5 - - - | - - - -
        G5 - - - | F5 - - - | E5 - - - | - - - -
        E5 - - - | - - - - | G5 - - - | - - - -
        A5 - - - | - - - - | - - - - | D5 - - -
        A5 - - - | - - - - | D6 - - - | - - - -
        C6 - - - | - - A5 - | F5 - - - | - - - -
        D6 - - - | - - B5 - | G5 - - - | - - - -
        A5 - - - | - - - - | F5 - - - | D5 - - -
        C6 - - - | - - - - | F6 - - - | - - - -
        E6 - - - | - - D6 - | C6 - - - | - - - -
        B5 - - - | - - - - | D6 - - - | - - - -
        A5 - - - | - - - - | - - - - | . . . .
        C6 - - - | - - - - | A5 - - - | F5 - - -
        E5 - - - | - - - - | G5 - - - | C6 - - -
        B5 - - - | D6 - - - | G6 - - - | - - - -
        E6 - - - | - - - - | - - - - | A5 - - -
        D6 - - - | - - - - | A5 - - - | F5 - - -
        D5 - - - | - - - - | - - - - | - - - -
        Eb5 - - - | - - - - | G5 - - - | - - - -
        D5 - - - | - - - - | - - - - | . . . .
      ` },
    harm: { w: 'tri', vol: 0.11, a: 0.05, d: 0.3, s: 0.9, r: 0.25, g: 0.97, vib: [4.8, 8, 0.35], pan: 0.3, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        D5 - - - | - - - - | G5 - - - | - - - -
        F5 - - - | - - D5 - | . . . . | . . . .
        G5 - - - | - - E5 - | C5 - - - | - - - -
        D5 - - - | - - - - | . . . . | G4 - - -
        F5 - - - | - - - - | . . . . | . . . .
        A5 - - - | - - G5 - | F5 - - - | - - - -
        E5 - - - | - - - - | G5 - - - | - - - -
        D5 - - - | - - - - | - - - - | . . . .
        F5 - - - | - - - - | D5 - - - | . . . .
        A4 - - - | - - - - | C5 - - - | F5 - - -
        E5 - - - | G5 - - - | C6 - - - | - - - -
        A5 - - - | - - - - | - - - - | D5 - - -
        G5 - - - | - - - - | D5 - - - | . . . .
        G4 - - - | - - - - | - - - - | - - - -
        C5 - - - | - - - - | C5 - - - | - - - -
        G4 - - - | - - - - | - - - - | . . . .
      ` },
    arp: { w: 'pulse12', vol: 0.15, a: 0.004, d: 0.12, s: 0.35, r: 0.03, g: 0.85, pan: -0.25, echo: [0.15, 3, 0.35], bars: `
        D4 A4 E5 D4 | A4 E5 D4 A4 | E5 D4 A4 E5 | D4 A4 E5 D4
        A4 E5 D4 A4 | E5 D4 A4 E5 | D4 A4 E5 D4 | A4 E5 D4 A4
        D5 C4 G4 D5 | C4 G4 D5 C4 | G4 D5 C4 G4 | D5 C4 G4 D5
        D4 A4 E5 D4 | A4 E5 D4 A4 | E5 D4 A4 E5 | D4 A4 E5 D4
        A4 E5 D4 A4 | E5 D4 A4 E5 | D4 A4 E5 D4 | A4 E5 D4 A4
        E5 D4 A4 E5 | D4 A4 E5 D4 | A4 E5 D4 A4 | E5 D4 A4 E5
        C4 G4 D5 C4 | G4 D5 C4 G4 | D5 C4 G4 D5 | C4 G4 D5 C4
        A4 E5 D4 A4 | E5 D4 A4 E5 | D4 A4 E5 D4 | A4 E5 D4 A4
        E5 D4 A4 E5 | D4 A4 E5 D4 | A4 E5 D4 A4 | E5 D4 A4 E5
        F4 C5 G5 F4 | C5 G5 F4 C5 | G5 F4 C5 G5 | F4 C5 G5 F4
        D5 A5 G4 D5 | A5 G4 D5 A5 | G4 D5 A5 G4 | D5 A5 G4 D5
        E5 D4 A4 E5 | D4 A4 E5 D4 | A4 E5 D4 A4 | E5 D4 A4 E5
        F4 C5 G5 F4 | C5 G5 F4 C5 | G5 F4 C5 G5 | F4 C5 G5 F4
        G4 D5 C4 G4 | D5 C4 G4 D5 | C4 G4 D5 C4 | G4 D5 C4 G4
        A5 G4 D5 A5 | G4 D5 A5 G4 | D5 A5 G4 D5 | A5 G4 D5 A5
        D4 A4 E5 D4 | A4 E5 D4 A4 | E5 D4 A4 E5 | D4 A4 E5 D4
        C5 G5 F4 C5 | G5 F4 C5 G5 | F4 C5 G5 F4 | C5 G5 F4 C5
        D5 C4 G4 D5 | C4 G4 D5 C4 | G4 D5 C4 G4 | D5 C4 G4 D5
        G4 D5 A5 G4 | D5 A5 G4 D5 | A5 G4 D5 A5 | G4 D5 A5 G4
        E5 B5 A4 E5 | B5 A4 E5 B5 | A4 E5 B5 A4 | E5 B5 A4 E5
        E5 D4 A4 E5 | D4 A4 E5 D4 | A4 E5 D4 A4 | E5 D4 A4 E5
        D4 A4 E5 D4 | A4 E5 D4 A4 | E5 D4 A4 E5 | D4 A4 E5 D4
        Bb4 F5 Eb4 Bb4 | F5 Eb4 Bb4 F5 | Eb4 Bb4 F5 Eb4 | Bb4 F5 Eb4 Bb4
        E5 D4 A4 E5 | D4 A4 E5 D4 | A4 E5 D4 A4 | E5 D4 A4 E5
      ` },
    bass: { w: 'tri', vol: 0.185, a: 0.003, d: 0.06, s: 0.9, r: 0.03, g: 0.92, bars: `
        D2 - - - | - - D2 - | A2 - - - | - - A2 -
        D2 - - - | - - D2 - | A2 - - - | - - A2 -
        C2 - - - | - - C2 - | G2 - - - | - - G2 -
        D2 - - - | - - D2 - | A2 - - - | - - A2 -
        D2 - - - | - - D2 - | A2 - - - | - - A2 -
        D2 - - - | - - D2 - | A2 - - - | - - A2 -
        C2 - - - | - - C2 - | G2 - - - | - - G2 -
        D2 - - - | - - D2 - | A2 - - - | - - A2 -
        D2 - - - | - - D2 - | A2 - - - | - - A2 -
        F2 - - - | - - F2 - | C3 - - - | - - C3 -
        G2 - - - | - - G2 - | D3 - - - | - - D3 -
        D2 - - - | - - D2 - | A2 - - - | - - A2 -
        F2 - - F2 | - - F2 - | C3 - - C3 | - - F3 -
        C2 - - C2 | - - C2 - | G2 - - G2 | - - C3 -
        G2 - - G2 | - - G2 - | D3 - - D3 | - - G3 -
        D2 - - D2 | - - D2 - | A2 - - A2 | - - D3 -
        F2 - - F2 | - - F2 - | C3 - - C3 | - - F3 -
        C2 - - C2 | - - C2 - | G2 - - G2 | - - C3 -
        G2 - - G2 | - - G2 - | D3 - - D3 | - - G3 -
        A2 - - A2 | - - A2 - | E3 - - E3 | - - A3 -
        D2 - - - | - - - - | A2 - - - | - - - -
        D2 - - - | - - - - | A2 - - - | - - - -
        D#2 - - - | - - - - | A#2 - - - | - - - -
        D2 - - - | - - - - | A2 - - - | - - - -
      ` },
    drums: { w: 'drums', vol: 0.5, bars: `
        @dI *4
        @dA *3
        @dA2
        @dA *3
        @dA2
        @mB
        @mB2 *2
        @mBf
        @mB
        @mB2 *2
        @mBf
        @dT *2
        @dT
        @dT
      ` }
  }
};

// STAGE 3 (Moai) -- A minor (pentatonic riffs, Eb blue note), 138 BPM, light swing, 24 bars: A riff+hocket / B call-response tune / A'
Music.tracks.stage3 = {
  name: 'Moai', bpm: 138, scale: 'A minor', chromatic: ['Eb'], loop: true, loopStart: 0, swing: 0.1, gain: 1,
  chords: `
    Am7
    Am7
    G7
    G7
    F
    F
    G7
    Am7
    Am7
    Am7
    C6
    C6
    Dm7
    Dm7
    G7
    G7
    Am7
    Am7
    G7
    G7
    F
    F
    G7
    Am7
  `,
  pat: {
    gT: `
      kx . x d | s . x m | k . x d | s . x t
    `,
    gTc: `
      kcx . x d | s . x m | k . x d | s . x t
    `,
    gT2: `
      kx . x d | s . x m | k . kx d | s d x t
    `,
    fT: `
      kx . x d | s . x m | k . x d | t m d d
    `,
    fT2: `
      kx . x d | s . x m | k s x d | t m d d
    `,
    gB: `
      kch . h d | sh . h m | kh . h d | sh . h t
    `,
    gB2: `
      kh . h d | sh . h m | kh . kh d | sh . h t
    `,
    fB: `
      kh . h d | sh . h m | k . s . | t m d d
    `,
  },
  ch: {
    mar: { w: 'pulse50', vol: 0.35, a: 0.002, d: 0.16, s: 0, r: 0.03, g: 1, lp: 3000, echo: [0.2, 3, 0.3], pan: -0.15, bars: `
        A4 - C5 E5 | - - D5 - | A4 - C5 E5 | - - G5 -
        A4 - C5 E5 | - - D5 - | E5 - D5 C5 | - - A4 -
        G4 - B4 D5 | - - C5 - | G4 - B4 D5 | - - F5 -
        G4 - B4 D5 | - - C5 - | D5 - B4 G4 | - - D5 -
        F4 - A4 C5 | - - G4 - | F4 - A4 C5 | - - E5 -
        F4 - A4 C5 | - - G4 - | C5 - A4 F4 | - - A4 -
        G4 - B4 D5 | - - F5 - | G5 - F5 D5 | - - B4 -
        A4 - C5 E5 | - - D5 - | E5 - Eb5 D5 | - - C5 -
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        A4 - C5 E5 | - - D5 - | A4 - C5 E5 | - - G5 -
        A4 - C5 E5 | - - D5 - | E5 - D5 C5 | - - A4 -
        G4 - B4 D5 | - - C5 - | G4 - B4 D5 | - - F5 -
        G4 - B4 D5 | - - C5 - | D5 - B4 G4 | - - D5 -
        F4 - A4 C5 | - - G4 - | F4 - A4 C5 | - - E5 -
        F4 - A4 C5 | - - G4 - | C5 - A4 F4 | - - A4 -
        G4 - B4 D5 | - - F5 - | G5 - F5 D5 | - - B4 -
        A4 - C5 E5 | - - D5 - | E5 - Eb5 D5 | - - C5 -
      ` },
    mar2: { w: 'pulse25', vol: 0.3, a: 0.002, d: 0.1, s: 0, r: 0.02, g: 1, lp: 4200, pan: 0.25, bars: `
        . . . . | E5 - - A5 | . . . . | E5 - - A5
        . . . . | E5 - - A5 | . . . . | E5 - - A5
        . . . . | D5 - - G5 | . . . . | D5 - - G5
        . . . . | D5 - - G5 | . . . . | D5 - - G5
        . . . . | C5 - - F5 | . . . . | C5 - - F5
        . . . . | C5 - - F5 | . . . . | C5 - - F5
        . . . . | D5 - - G5 | . . . . | D5 - - G5
        . . . . | E5 - - A5 | . . . . | E5 - - A5
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | E5 - - A5 | . . . . | E5 - - A5
        . . . . | E5 - - A5 | . . . . | E5 - - A5
        . . . . | D5 - - G5 | . . . . | D5 - - G5
        . . . . | D5 - - G5 | . . . . | D5 - - G5
        . . . . | C5 - - F5 | . . . . | C5 - - F5
        . . . . | C5 - - F5 | . . . . | C5 - - F5
        . . . . | D5 - - G5 | . . . . | D5 - - G5
        . . . . | E5 - - A5 | . . . . | E5 - - A5
      ` },
    tune: { w: 'pulse50', vol: 0.22, a: 0.008, d: 0.3, s: 0.75, r: 0.05, g: 0.92, lp: 3600, vib: [5.8, 12, 0.14], bend: -0.25, echo: [0.15, 3, 0.3], pan: 0.05, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        A5 - - G5 | E5 - - - | . . C5 - | D5 - E5 -
        G5 - - E5 | D5 - - - | . . C5 - | A4 - - -
        C6 - - B5 | G5 - - - | . . E5 - | F5 - G5 -
        A5 - - G5 | E5 - - - | . . C5 - | E5 - - -
        F5 - - E5 | D5 - - - | . . A4 - | C5 - D5 -
        F5 - - A5 | C6 - - - | . . A5 - | F5 - - -
        B5 - - A5 | G5 - - - | . . D5 - | G5 - A5 -
        B5 - - - | A5 - G5 - | D5 - - - | F5 - E5 -
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
      ` },
    harm: { w: 'pulse50', vol: 0.077, a: 0.01, d: 0.2, s: 0.8, r: 0.07, g: 0.96, vib: [5.2, 10, 0.2], det: 6, pan: 0.3, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        E4 - - - | - - - - | - - - - | - - - -
        G4 - - - | - - - - | - - - - | - - - -
        E4 - - - | - - - - | - - - - | - - - -
        G4 - - - | - - - - | - - - - | - - - -
        F4 - - - | - - - - | - - - - | - - - -
        A4 - - - | - - - - | - - - - | - - - -
        D4 - - - | - - - - | - - - - | - - - -
        F4 - - - | - - - - | - - - - | - - - -
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
      ` },
    bass: { w: 'tri', vol: 0.25, a: 0.003, d: 0.06, s: 0.9, r: 0.03, g: 0.85, bars: `
        A2 . . A2 | . . A3 . | A2 . . A2 | . . E3 .
        A2 . . A2 | . . A3 . | A2 . . A2 | . . E3 .
        G2 . . G2 | . . G3 . | G2 . . G2 | . . D3 .
        G2 . . G2 | . . G3 . | G2 . . G2 | . . D3 .
        F2 . . F2 | . . F3 . | F2 . . F2 | . . C3 .
        F2 . . F2 | . . F3 . | F2 . . F2 | . . C3 .
        G2 . . G2 | . . G3 . | G2 . . G2 | . . D3 .
        A2 . . A2 | . . A3 . | A2 . . A2 | . . E3 .
        A2 . . A2 | . . . . | A3 . . A2 | . . E3 .
        A2 . . A2 | . . . . | A3 . . A2 | . . E3 .
        C3 . . C3 | . . . . | C4 . . C3 | . . G3 .
        C3 . . C3 | . . . . | C4 . . C3 | . . G3 .
        D3 . . D3 | . . . . | D4 . . D3 | . . A3 .
        D3 . . D3 | . . . . | D4 . . D3 | . . A3 .
        G2 . . G2 | . . . . | G3 . . G2 | . . D3 .
        G2 . . G2 | . . . . | G3 . . G2 | . . D3 .
        A2 . . A2 | . . A3 . | A2 . . A2 | . . E3 .
        A2 . . A2 | . . A3 . | A2 . . A2 | . . E3 .
        G2 . . G2 | . . G3 . | G2 . . G2 | . . D3 .
        G2 . . G2 | . . G3 . | G2 . . G2 | . . D3 .
        F2 . . F2 | . . F3 . | F2 . . F2 | . . C3 .
        F2 . . F2 | . . F3 . | F2 . . F2 | . . C3 .
        G2 . . G2 | . . G3 . | G2 . . G2 | . . D3 .
        A2 . . A2 | . . A3 . | A2 . . A2 | . . E3 .
      ` },
    drums: { w: 'drums', vol: 0.56, mix: { d: 1.1, m: 1.05, x: 1.1 }, bars: `
        @gTc
        @gT
        @gT2
        @fT
        @gT
        @gT2
        @gT
        @fT2
        @gB
        @gB2 *6
        @fB
        @gTc
        @gT
        @gT2
        @fT
        @gT
        @gT2
        @gT
        @fT2
      ` }
  }
};

// STAGE 4 (Reverse Volcano) -- F# minor + Phrygian b2 (G) + C# dominant (E#), 164 BPM, 24 bars: A gallop riff / B wailing / A' octave-doubled
Music.tracks.stage4 = {
  name: 'Reverse Volcano', bpm: 164, scale: 'F# minor', chromatic: ['G', 'F'], loop: true, loopStart: 0, gain: 1,
  chords: `
    F#m
    F#m
    D
    G
    F#m
    F#m
    D
    C#
    Bm9
    Bm
    F#m
    F#m
    D
    E7
    C#
    C#
    F#m
    F#m
    D
    G
    F#m
    F#m
    D
    C#
  `,
  pat: {
    gA: `
      kh k . k | sh . h . | kh k h k | sh . h .
    `,
    gAc: `
      kch k . k | sh . h . | kh k h k | sh . h .
    `,
    fA: `
      kh k . k | sh . h . | kh k h k | s s t m
    `,
    fA2: `
      kh k . k | sh . h . | k k s s | t t m d
    `,
    gB: `
      kc . o . | ks . o . | k . o . | ks . o .
    `,
    gB2: `
      k . o . | ks . o . | k . o . | ks . o k
    `,
    fB: `
      k . o . | ks . o . | k k s s | t m d d
    `,
  },
  ch: {
    lead: { w: 'saw', vol: 0.22, a: 0.004, d: 0.2, s: 0.7, r: 0.05, g: 0.93, lp: 3400, vib: [6.5, 22, 0.1], bend: -0.5, echo: [0.12, 3, 0.3], pan: 0.05, bars: `
        F#5 F#5 . F#5 | . F#5 G5 F#5 | A5 - F#5 - | G#5 - F#5 -
        F#5 F#5 . F#5 | . F#5 A5 F#5 | C#6 - B5 - | A5 - G#5 -
        D5 D5 . D5 | . D5 E5 D5 | F#5 - D5 - | E5 - D5 -
        G5 G5 . G5 | . G5 A5 G5 | B5 - G5 - | A5 - G5 -
        F#5 F#5 . F#5 | . F#5 G5 F#5 | A5 - F#5 - | G#5 - F#5 -
        F#5 F#5 . F#5 | . F#5 A5 F#5 | C#6 - B5 - | A5 - F#5 -
        D5 D5 . D5 | . D5 E5 D5 | F#5 - A5 - | F#5 - D5 -
        C#5 C#5 . C#5 | . C#5 D5 C#5 | F5 - G#5 - | C#6 - - -
        D6 - - - | - - - - | C#6 - - - | B5 - - -
        D6 - - - | - - E6 - | D6 - - - | B5 - - -
        C#6 - - - | - - - - | A5 - - - | F#5 - - -
        C#6 - - - | - - D6 - | C#6 - - - | A5 - - -
        D6 - - - | - - - - | A5 - - - | F#5 - - -
        B5 - - - | E6 - - - | D6 - - - | B5 - - -
        C#6 - - - | F6 - - - | G#5 - - - | C#6 - - -
        C#6 - - - | - - - - | - - - - | B5 - G#5 -
        F#5 F#5 . F#5 | . F#5 G5 F#5 | A5 - F#5 - | G#5 - F#5 -
        F#5 F#5 . F#5 | . F#5 A5 F#5 | C#6 - B5 - | A5 - G#5 -
        D5 D5 . D5 | . D5 E5 D5 | F#5 - D5 - | E5 - D5 -
        G5 G5 . G5 | . G5 A5 G5 | B5 - G5 - | A5 - G5 -
        F#5 F#5 . F#5 | . F#5 G5 F#5 | A5 - F#5 - | G#5 - F#5 -
        F#5 F#5 . F#5 | . F#5 A5 F#5 | C#6 - B5 - | A5 - F#5 -
        D5 D5 . D5 | . D5 E5 D5 | F#5 - A5 - | F#5 - D5 -
        C#5 C#5 . C#5 | . C#5 D5 C#5 | F5 - G#5 - | C#6 - - -
      ` },
    harm: { w: 'pulse25', vol: 0.11, a: 0.004, d: 0.2, s: 0.7, r: 0.05, g: 0.93, pan: 0.3, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        F#4 F#4 . F#4 | . F#4 G4 F#4 | A4 - F#4 - | G#4 - F#4 -
        F#4 F#4 . F#4 | . F#4 A4 F#4 | C#5 - B4 - | A4 - G#4 -
        D4 D4 . D4 | . D4 E4 D4 | F#4 - D4 - | E4 - D4 -
        G4 G4 . G4 | . G4 A4 G4 | B4 - G4 - | A4 - G4 -
        F#4 F#4 . F#4 | . F#4 G4 F#4 | A4 - F#4 - | G#4 - F#4 -
        F#4 F#4 . F#4 | . F#4 A4 F#4 | C#5 - B4 - | A4 - F#4 -
        D4 D4 . D4 | . D4 E4 D4 | F#4 - A4 - | F#4 - D4 -
        C#4 C#4 . C#4 | . C#4 D4 C#4 | F4 - G#4 - | C#5 - - -
      ` },
    arp: { w: 'pulse12', vol: 0.15, a: 0.002, d: 0.09, s: 0.45, r: 0.03, g: 0.75, pan: -0.3, bars: `
        F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4
        F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4
        D3 A3 D4 A3 | D3 A3 D4 A3 | D3 A3 D4 A3 | D3 A3 D4 A3
        G3 D4 G4 D4 | G3 D4 G4 D4 | G3 D4 G4 D4 | G3 D4 G4 D4
        F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4
        F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4
        D3 A3 D4 A3 | D3 A3 D4 A3 | D3 A3 D4 A3 | D3 A3 D4 A3
        C#3 G#3 C#4 G#3 | C#3 G#3 C#4 G#3 | C#3 G#3 C#4 G#3 | C#3 G#3 C#4 G#3
        B3 F#4 B4 F#4 | B3 F#4 B4 F#4 | B3 F#4 B4 F#4 | B3 F#4 B4 F#4
        B3 F#4 B4 F#4 | B3 F#4 B4 F#4 | B3 F#4 B4 F#4 | B3 F#4 B4 F#4
        F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4
        F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4
        D3 A3 D4 A3 | D3 A3 D4 A3 | D3 A3 D4 A3 | D3 A3 D4 A3
        E3 B3 E4 B3 | E3 B3 E4 B3 | E3 B3 E4 B3 | E3 B3 E4 B3
        C#3 G#3 C#4 G#3 | C#3 G#3 C#4 G#3 | C#3 G#3 C#4 G#3 | C#3 G#3 C#4 G#3
        C#3 G#3 C#4 G#3 | C#3 G#3 C#4 G#3 | C#3 G#3 C#4 G#3 | C#3 G#3 C#4 G#3
        F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4
        F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4
        D3 A3 D4 A3 | D3 A3 D4 A3 | D3 A3 D4 A3 | D3 A3 D4 A3
        G3 D4 G4 D4 | G3 D4 G4 D4 | G3 D4 G4 D4 | G3 D4 G4 D4
        F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4
        F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4 | F#3 C#4 F#4 C#4
        D3 A3 D4 A3 | D3 A3 D4 A3 | D3 A3 D4 A3 | D3 A3 D4 A3
        C#3 G#3 C#4 G#3 | C#3 G#3 C#4 G#3 | C#3 G#3 C#4 G#3 | C#3 G#3 C#4 G#3
      ` },
    bass: { w: 'tri', vol: 0.185, a: 0.003, d: 0.06, s: 0.9, r: 0.03, g: 0.85, bars: `
        F#2 F#2 . F#2 | F#2 . G2 . | F#2 F#2 . F#2 | F#3 . G2 .
        F#2 F#2 . F#2 | F#2 . F#2 F#2 | F#2 F#2 . F#2 | F#3 . C#3 .
        D2 D2 . D2 | D2 . E2 . | D2 D2 . D2 | D3 . E2 .
        G2 G2 . G2 | G2 . G#2 . | G2 G2 . G2 | G3 . G#2 .
        F#2 F#2 . F#2 | F#2 . G2 . | F#2 F#2 . F#2 | F#3 . G2 .
        F#2 F#2 . F#2 | F#2 . F#2 F#2 | F#2 F#2 . F#2 | F#3 . C#3 .
        D2 D2 . D2 | D2 . E2 . | D2 D2 . D2 | D3 . E2 .
        C#2 C#2 . C#2 | C#2 . C#2 C#2 | C#2 C#2 . C#2 | C#2 C#2 C#2 C#2
        B2 . B2 . | B3 . B2 . | B2 . B2 . | B3 . B2 .
        B2 . B2 . | B3 . B2 . | B2 . B2 . | B3 . B2 .
        F#2 . F#2 . | F#3 . F#2 . | F#2 . F#2 . | F#3 . F#2 .
        F#2 . F#2 . | F#3 . F#2 . | F#2 . F#2 . | F#3 . F#2 .
        D2 . D2 . | D3 . D2 . | D2 . D2 . | D3 . D2 .
        E2 . E2 . | E3 . E2 . | E2 . E2 . | E3 . E2 .
        C#2 . C#2 . | C#3 . C#2 . | C#2 . C#2 . | C#3 . C#2 .
        C#2 . C#2 . | C#3 . C#2 . | C#2 . C#2 . | C#3 . C#3 .
        F#2 F#2 . F#2 | F#2 . G2 . | F#2 F#2 . F#2 | F#3 . G2 .
        F#2 F#2 . F#2 | F#2 . F#2 F#2 | F#2 F#2 . F#2 | F#3 . C#3 .
        D2 D2 . D2 | D2 . E2 . | D2 D2 . D2 | D3 . E2 .
        G2 G2 . G2 | G2 . G#2 . | G2 G2 . G2 | G3 . G#2 .
        F#2 F#2 . F#2 | F#2 . G2 . | F#2 F#2 . F#2 | F#3 . G2 .
        F#2 F#2 . F#2 | F#2 . F#2 F#2 | F#2 F#2 . F#2 | F#3 . C#3 .
        D2 D2 . D2 | D2 . E2 . | D2 D2 . D2 | D3 . E2 .
        C#2 C#2 . C#2 | C#2 . C#2 C#2 | C#2 C#2 . C#2 | C#2 C#2 C#2 C#2
      ` },
    drums: { w: 'drums', vol: 0.5, bars: `
        @gAc
        @gA *2
        @fA
        @gA *2
        @gA
        @fA2
        @gB
        @gB2 *6
        @fB
        @gAc
        @gA *2
        @fA
        @gA *2
        @gA
        @fA2
      ` }
  }
};

// STAGE 5 (Tentacle) -- C harmonic minor + chromatic slithers (Db E F# Bb), 112 BPM, 16 bars: A (creeping chromatic scales) / B (rising anguish)
Music.tracks.stage5 = {
  name: 'Tentacle', bpm: 112, scale: 'C harmonic minor', chromatic: ['Db', 'E', 'F#', 'Bb'], loop: true, loopStart: 0, gain: 1,
  chords: `
    Cm
    Cm
    Db
    Db
    Cm
    Cm
    G
    G
    Ab
    Ab
    Fm
    Fm
    Db
    Db
    G
    G
  `,
  pat: {
    s1: `
      d, . . . | . . . . | . . m, . | . . . .
    `,
    s2: `
      . . . . | . . . . | d, . . . | . . x, .
    `,
    s3: `
      d, . . . | . . m, . | d, . . . | . . m, t,
    `,
    s4: `
      d, . . . | . . m, . | d, . m, . | t, . m, d
    `,
  },
  ch: {
    lead: { w: 'pulse25', vol: 0.2, a: 0.02, d: 0.3, s: 0.8, r: 0.08, g: 0.98, lp: 2400, port: 0.06, vib: [4.6, 26, 0.12], trem: [5.2, 0.12], echo: [0.2, 6, 0.4], pan: 0.05, bars: `
        G4 - F#4 - | F4 - E4 - | Eb4 - D4 - | Db4 - C4 -
        C4 - Db4 - | D4 - Eb4 - | E4 - F4 - | F#4 - G4 -
        Ab4 - - - | - - G4 - | F4 - - - | - - - -
        F4 - - - | E4 - - - | F4 - - - | Ab4 - - -
        G4 F#4 G4 Ab4 | G4 - F#4 - | F4 - F#4 - | G4 - - -
        Eb5 - - - | - - - - | D5 - - - | C5 - - -
        D5 - - - | B4 - - - | G4 - - - | B4 - - -
        B4 - - - | - - - - | Bb4 - Ab4 - | G4 - - -
        Ab4 - Bb4 - | B4 - C5 - | Db5 - D5 - | Eb5 - - -
        Eb5 - - - | - - D5 - | Eb5 - - - | C5 - - -
        F5 - E5 - | F5 - Ab5 - | G5 - - - | F5 - - -
        C5 - - - | - - - - | Db5 - C5 - | B4 - C5 -
        Ab5 - - - | - - G5 - | F5 - - - | - - - -
        F5 - - - | E5 - - - | Eb5 - - - | D5 - - -
        D5 - - - | B4 - - - | G4 - - - | B4 - - -
        B4 - - - | - - - - | Bb4 - Ab4 - | G4 - - -
      ` },
    arp: { w: 'pulse25', vol: 0.1, a: 0.05, d: 0.2, s: 0.9, r: 0.1, g: 0.98, arpHz: 22, lp: 1800, trem: [3.1, 0.3], pan: -0.3, bars: `
        G3+F#3 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        F3+E3 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        G3+F#3 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        B3+Bb3 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        Eb4+D4 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        C4+Db4 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        F3+E3 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        B3+Bb3 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
      ` },
    bass: { w: 'tri', vol: 0.2, a: 0.006, d: 0.15, s: 0.8, r: 0.08, g: 0.95, bars: `
        C2 - - . | . . C2 - | . . . . | C#2 - C2 -
        C2 - - . | . . C2 - | . . . . | G2 - C2 -
        C#2 - - . | . . C#2 - | . . . . | D2 - C#2 -
        C#2 - - . | . . C#2 - | . . . . | G#2 - C#2 -
        C2 - - . | . . C2 - | . . . . | C#2 - C2 -
        C2 - - . | . . C2 - | . . . . | G2 - C2 -
        G2 - - . | . . G2 - | . . . . | G#2 - G2 -
        G2 - - . | . . G2 - | . . . . | G2 . . .
        G#2 - - . | . . G#2 - | . . . . | D#3 - G#2 -
        G#2 - - . | . . G#2 - | . . . . | G#2 . . .
        F2 - - . | . . F2 - | . . . . | C3 - F2 -
        F2 - - . | . . F2 - | . . . . | F2 . . .
        C#2 - - . | . . C#2 - | . . . . | D2 - C#2 -
        C#2 - - . | . . C#2 - | . . . . | C#2 . . .
        G2 - - . | . . G2 - | . . . . | G#2 - G2 -
        G2 - - . | . . G2 - | . . . . | G2 . . .
      ` },
    drums: { w: 'drums', vol: 0.5, bars: `
        @s1
        @s2
        @s1
        @s2
        @s1
        @s2
        @s3
        @s4
        @s1
        @s3
        @s1
        @s3
        @s3
        @s2
        @s3
        @s4
      ` }
  }
};

// STAGE 6 (Cell) -- G minor (+F# leading tone), 126 BPM, 16 bars: A (creeping narrow motif) / B (lament: parallel-fifth pad, descending bass G F Eb D)
Music.tracks.stage6 = {
  name: 'Cell', bpm: 126, scale: 'G minor', chromatic: ['F#'], loop: true, loopStart: 0, gain: 1,
  chords: `
    Gm
    Gm
    Eb
    Eb
    Cm
    Cm
    D
    D7
    Gm
    F
    Eb
    D7
    Gm
    F
    Eb
    D7
  `,
  pat: {
    dA: `
      k . h, k | h, . h, . | k . h, . | s . h, .
    `,
    dA2: `
      k . h, k | h, . h, . | k . h, k | s . h, .
    `,
    dF: `
      k . h, k | h, . h, . | k . s . | s g s g
    `,
    dB: `
      k . . k | . . h, . | k . . . | s . . h,
    `,
    dB2: `
      k . . k | . . h, . | k . . k | s . . h,
    `,
  },
  ch: {
    lead: { w: 'pulse25', vol: 0.21, a: 0.012, d: 0.3, s: 0.8, r: 0.07, g: 0.96, lp: 3000, bend: -1, bendT: 0.07, vib: [6.5, 34, 0.1], echo: [0.15, 3, 0.35], pan: 0.05, bars: `
        D5 - - - | - - Eb5 - | D5 - - - | Bb4 - - -
        G4 - - - | - - A4 - | Bb4 - - - | D5 - - -
        Bb4 - - - | - - C5 - | Bb4 - - - | G4 - - -
        Eb5 - - - | - - D5 - | C5 - - - | Bb4 - - -
        C5 - - - | - - D5 - | Eb5 - - - | G5 - - -
        Eb5 - - - | - - D5 - | C5 - - - | D5 - - -
        A4 - - - | - - Bb4 - | A4 - - - | F#4 - - -
        D5 - - - | - - - - | C5 - - - | A4 - - -
        G5 - - - | - - - - | F5 - - - | Eb5 - - -
        F5 - - - | - - - - | Eb5 - - - | D5 - - -
        Eb5 - - - | - - - - | D5 - - - | C5 - - -
        D5 - - - | - - - - | C5 - - - | A4 - - -
        Bb4 - - - | - - A4 - | G4 - - - | - - - -
        A4 - - - | - - G4 - | F4 - - - | - - - -
        G4 - - - | - - F4 - | Eb4 - - - | - - - -
        A4 - - - | - - - - | F#4 - - - | - - G4 -
      ` },
    pad: { w: 'saw', vol: 0.085, a: 0.06, d: 0.3, s: 0.9, r: 0.12, g: 1, lp: 1500, trem: [9.5, 0.55], det: 8, pan: -0.25, bars: `
        D4 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        G4 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        Eb4 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        F#4 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        D4 - - - | - - - - | - - - - | - - - -
        C4 - - - | - - - - | - - - - | - - - -
        Bb3 - - - | - - - - | - - - - | - - - -
        A3 - - - | - - - - | - - - - | - - - -
        D4 - - - | - - - - | - - - - | - - - -
        C4 - - - | - - - - | - - - - | - - - -
        Bb3 - - - | - - - - | - - - - | - - - -
        A3 - - - | - - - - | - - - - | - - - -
      ` },
    bass: { w: 'tri', vol: 0.185, a: 0.004, d: 0.12, s: 0.75, r: 0.05, g: 0.9, bars: `
        G2! - G2, - | G2, - G2, - | G2! - G2, - | G2, - G3, -
        G2! - G2, - | G2, - G2, - | G2! - G2, - | G2, - G3, -
        D#2! - D#2, - | D#2, - D#2, - | D#2! - D#2, - | D#2, - D#3, -
        D#2! - D#2, - | D#2, - D#2, - | D#2! - D#2, - | D#2, - D#3, -
        C2! - C2, - | C2, - C2, - | C2! - C2, - | C2, - C3, -
        C2! - C2, - | C2, - C2, - | C2! - C2, - | C2, - C3, -
        D2! - D2, - | D2, - D2, - | D2! - D2, - | D2, - D3, -
        D2! - D2, - | D2, - D2, - | D2! - D2, - | D3, - D2, -
        G2! - G2, - | G2, - G2, - | G2! - G2, - | G2, - G3, -
        F2! - F2, - | F2, - F2, - | F2! - F2, - | F2, - F3, -
        D#2! - D#2, - | D#2, - D#2, - | D#2! - D#2, - | D#2, - D#3, -
        D2! - D2, - | D2, - D2, - | D2! - D2, - | D3, - D2, -
        G2! - G2, - | G2, - G2, - | G2! - G2, - | G2, - G3, -
        F2! - F2, - | F2, - F2, - | F2! - F2, - | F2, - F3, -
        D#2! - D#2, - | D#2, - D#2, - | D#2! - D#2, - | D#2, - D#3, -
        D2! - D2, - | D2, - D2, - | D2! - D2, - | D3, - D2, -
      ` },
    drums: { w: 'drums', vol: 0.5, bars: `
        @dA *3
        @dA2
        @dA *3
        @dF
        @dB *3
        @dB2
        @dB *3
        @dF
      ` }
  }
};

// STAGE 7 (Fortress) -- B minor + tritone alarms (F, C, A#), 172 BPM, 24 bars: A alarm / B machine (arps) / A' (+ metallic octave)
Music.tracks.stage7 = {
  name: 'Fortress', bpm: 172, scale: 'B minor', chromatic: ['C', 'F', 'A#'], loop: true, loopStart: 0, gain: 1,
  chords: `
    Bm
    Bm
    C
    C
    Bm
    Bm
    G
    F#
    Em
    Em
    Bm
    Bm
    G
    G
    F#
    F#
    Bm
    Bm
    C
    C
    Bm
    Bm
    G
    F#
  `,
  pat: {
    dA: `
      kh h, h h, | sh h, h h, | kh h, h h, | sh h, h h,
    `,
    dAc: `
      kch h, h h, | sh h, h h, | kh h, h h, | sh h, h h,
    `,
    dF: `
      kh h, h h, | sh h, h h, | kh h, h h, | s s s s
    `,
    dB: `
      kx h, x h, | sx h, x h, | kx h, x h, | sx h, x h,
    `,
    dBc: `
      kcx h, x h, | sx h, x h, | kx h, x h, | sx h, x h,
    `,
    dBf: `
      kx h, x h, | sx h, x h, | kx h, x h, | s s s s
    `,
  },
  ch: {
    lead: { w: 'pulse12', vol: 0.4, a: 0.002, d: 0.06, s: 0.6, r: 0.02, g: 0.7, pan: 0.05, bars: `
        B5 . B5 . | B5 . . . | F6 . F6 . | F6 . . .
        B5 - F6 - | B5 - F6 - | B5 - F6 - | B5 - F6 -
        C6 . C6 . | C6 . . . | F#6 . F#6 . | F#6 . . .
        C6 - F#6 - | C6 - F#6 - | C6 - F#6 - | C6 - F#6 -
        B5 . B5 . | B5 . . . | F6 . F6 . | F6 . . .
        B5 - F6 - | B5 - F6 - | B5 - F6 - | B5 - F6 -
        G5 . G5 . | G5 . . . | C#6 . C#6 . | C#6 . . .
        F#5 . F#5 . | F#5 . . . | C6 . C6 . | C6 . . .
        E5 . E5 . | E5 . . . | A#5 . A#5 . | A#5 . . .
        E5 - A#5 - | E5 - A#5 - | E5 - A#5 - | E5 - A#5 -
        B5 . B5 . | B5 . . . | F6 . F6 . | F6 . . .
        B5 - F6 - | B5 - F6 - | B5 - F6 - | B5 - F6 -
        G5 . G5 . | G5 . . . | C#6 . C#6 . | C#6 . . .
        G5 - C#6 - | G5 - C#6 - | G5 - C#6 - | G5 - C#6 -
        F#5 . F#5 . | F#5 . . . | C6 . C6 . | C6 . . .
        F#5 C6 F#5 C6 | F#5 C6 F#5 C6 | F#5 C6 F#5 C6 | F#5 C6 F#5 C6
        B5 . B5 . | B5 . . . | F6 . F6 . | F6 . . .
        B5 - F6 - | B5 - F6 - | B5 - F6 - | B5 - F6 -
        C6 . C6 . | C6 . . . | F#6 . F#6 . | F#6 . . .
        C6 - F#6 - | C6 - F#6 - | C6 - F#6 - | C6 - F#6 -
        B5 . B5 . | B5 . . . | F6 . F6 . | F6 . . .
        B5 - F6 - | B5 - F6 - | B5 - F6 - | B5 - F6 -
        G5 . G5 . | G5 . . . | C#6 . C#6 . | C#6 . . .
        F#5 . F#5 . | F#5 . . . | C6 . C6 . | C6 . . .
      ` },
    harm: { w: 'fm', fm: [3.5, 1.4, 0.25], vol: 0.2, a: 0.002, d: 0.1, s: 0.4, r: 0.03, g: 0.7, pan: 0.3, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        B4 . B4 . | B4 . . . | F5 . F5 . | F5 . . .
        B4 - F5 - | B4 - F5 - | B4 - F5 - | B4 - F5 -
        C5 . C5 . | C5 . . . | F#5 . F#5 . | F#5 . . .
        C5 - F#5 - | C5 - F#5 - | C5 - F#5 - | C5 - F#5 -
        B4 . B4 . | B4 . . . | F5 . F5 . | F5 . . .
        B4 - F5 - | B4 - F5 - | B4 - F5 - | B4 - F5 -
        G4 . G4 . | G4 . . . | C#5 . C#5 . | C#5 . . .
        F#4 . F#4 . | F#4 . . . | C5 . C5 . | C5 . . .
      ` },
    arp: { w: 'pulse25', vol: 0.16, a: 0.002, d: 0.05, s: 0.5, r: 0.02, g: 0.55, pan: -0.3, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        E4 B4 G4 B4 | E4 B4 G4 B4 | E4 B4 G4 B4 | E4 B4 G4 B4
        E4 B4 G4 B4 | E4 B4 G4 B4 | E4 B4 G4 B4 | E4 B4 G4 B4
        B3 F#4 D4 F#4 | B3 F#4 D4 F#4 | B3 F#4 D4 F#4 | B3 F#4 D4 F#4
        B3 F#4 D4 F#4 | B3 F#4 D4 F#4 | B3 F#4 D4 F#4 | B3 F#4 D4 F#4
        G3 D4 B3 D4 | G3 D4 B3 D4 | G3 D4 B3 D4 | G3 D4 B3 D4
        G3 D4 B3 D4 | G3 D4 B3 D4 | G3 D4 B3 D4 | G3 D4 B3 D4
        F#3 C#4 A#3 C#4 | F#3 C#4 A#3 C#4 | F#3 C#4 A#3 C#4 | F#3 C#4 A#3 C#4
        F#3 C#4 A#3 C#4 | F#3 C#4 A#3 C#4 | F#3 C#4 A#3 C#4 | F#3 C#4 A#3 C#4
        B3 F#4 D4 F#4 | B3 F#4 D4 F#4 | B3 F#4 D4 F#4 | B3 F#4 D4 F#4
        B3 F#4 D4 F#4 | B3 F#4 D4 F#4 | B3 F#4 D4 F#4 | B3 F#4 D4 F#4
        C4 G4 E4 G4 | C4 G4 E4 G4 | C4 G4 E4 G4 | C4 G4 E4 G4
        C4 G4 E4 G4 | C4 G4 E4 G4 | C4 G4 E4 G4 | C4 G4 E4 G4
        B3 F#4 D4 F#4 | B3 F#4 D4 F#4 | B3 F#4 D4 F#4 | B3 F#4 D4 F#4
        B3 F#4 D4 F#4 | B3 F#4 D4 F#4 | B3 F#4 D4 F#4 | B3 F#4 D4 F#4
        G3 D4 B3 D4 | G3 D4 B3 D4 | G3 D4 B3 D4 | G3 D4 B3 D4
        F#3 C#4 A#3 C#4 | F#3 C#4 A#3 C#4 | F#3 C#4 A#3 C#4 | F#3 C#4 A#3 C#4
      ` },
    bass: { w: 'pulse50', vol: 0.15, a: 0.002, d: 0.05, s: 0.7, r: 0.02, g: 0.5, lp: 1100, bars: `
        B2! B2, B2, B2, | B3! B2, B2, B2, | B2! B2, B2, B2, | B3! B2, B2, B2,
        B2! B2, B2, B2, | B3! B2, B2, B2, | B2! B2, B2, B2, | B3! B2, B2, B2,
        C3! C3, C3, C3, | C4! C3, C3, C3, | C3! C3, C3, C3, | C4! C3, C3, C3,
        C3! C3, C3, C3, | C4! C3, C3, C3, | C3! C3, C3, C3, | C4! C3, C3, C3,
        B2! B2, B2, B2, | B3! B2, B2, B2, | B2! B2, B2, B2, | B3! B2, B2, B2,
        B2! B2, B2, B2, | B3! B2, B2, B2, | B2! B2, B2, B2, | B3! B2, B2, B2,
        G2! G2, G2, G2, | G3! G2, G2, G2, | G2! G2, G2, G2, | G3! G2, G2, G2,
        F#2! F#2, F#2, F#2, | F#2! F#2, F#2, F#2, | F#2! F#2! F#2! F#2! | F#3! F#3! F#3! F#3!
        E2! E2, E2, E2, | E3! E2, E2, E2, | E2! E2, E2, E2, | E3! E2, E2, E2,
        E2! E2, E2, E2, | E3! E2, E2, E2, | E2! E2, E2, E2, | E3! E2, E2, E2,
        B2! B2, B2, B2, | B3! B2, B2, B2, | B2! B2, B2, B2, | B3! B2, B2, B2,
        B2! B2, B2, B2, | B3! B2, B2, B2, | B2! B2, B2, B2, | B3! B2, B2, B2,
        G2! G2, G2, G2, | G3! G2, G2, G2, | G2! G2, G2, G2, | G3! G2, G2, G2,
        G2! G2, G2, G2, | G3! G2, G2, G2, | G2! G2, G2, G2, | G3! G2, G2, G2,
        F#2! F#2, F#2, F#2, | F#3! F#2, F#2, F#2, | F#2! F#2, F#2, F#2, | F#3! F#2, F#2, F#2,
        F#2! F#2, F#2, F#2, | F#2! F#2, F#2, F#2, | F#2! F#2! F#2! F#2! | F#3! F#3! F#3! F#3!
        B2! B2, B2, B2, | B3! B2, B2, B2, | B2! B2, B2, B2, | B3! B2, B2, B2,
        B2! B2, B2, B2, | B3! B2, B2, B2, | B2! B2, B2, B2, | B3! B2, B2, B2,
        C3! C3, C3, C3, | C4! C3, C3, C3, | C3! C3, C3, C3, | C4! C3, C3, C3,
        C3! C3, C3, C3, | C4! C3, C3, C3, | C3! C3, C3, C3, | C4! C3, C3, C3,
        B2! B2, B2, B2, | B3! B2, B2, B2, | B2! B2, B2, B2, | B3! B2, B2, B2,
        B2! B2, B2, B2, | B3! B2, B2, B2, | B2! B2, B2, B2, | B3! B2, B2, B2,
        G2! G2, G2, G2, | G3! G2, G2, G2, | G2! G2, G2, G2, | G3! G2, G2, G2,
        F#2! F#2, F#2, F#2, | F#2! F#2, F#2, F#2, | F#2! F#2! F#2! F#2! | F#3! F#3! F#3! F#3!
      ` },
    drums: { w: 'drums', vol: 0.5, bars: `
        @dAc
        @dA *6
        @dF
        @dBc
        @dB *6
        @dBf
        @dAc
        @dA *6
        @dF
      ` }
  }
};

// BOSS -- C minor (+B natural leading tone), 168 BPM, 2-bar intro + 16-bar loop: A brass-stab call/response / B soaring arpeggio wails
Music.tracks.boss = {
  name: 'Boss', bpm: 168, scale: 'C minor', chromatic: ['B'], loop: true, loopStart: 2, gain: 1,
  chords: `
    Cm
    G
    Cm
    Cm
    Ab
    Ab
    Bb
    Bb
    G
    G
    Fm
    Fm
    Cm
    Cm
    Ab
    Bb
    G
    G7
  `,
  pat: {
    i1: `
      k . . . | k . . . | k . k . | k k k k
    `,
    i2: `
      k . . . | s . . . | k . s . | s s s s
    `,
    dA: `
      kh h, h h, | sh h, h h, | kh h, kh h, | sh h, h h,
    `,
    dAc: `
      kch h, h h, | sh h, h h, | kh h, kh h, | sh h, h h,
    `,
    dF: `
      kh h, h h, | sh h, h h, | kh h, kh h, | s s t m
    `,
    dB: `
      kh h, o h, | sh h, o h, | kh h, o kh, | sh h, o h,
    `,
    dBc: `
      kch h, o h, | sh h, o h, | kh h, o kh, | sh h, o h,
    `,
    dBf: `
      kh h, o h, | sh h, o h, | k k s s | t t m d
    `,
  },
  ch: {
    lead: { w: 'saw', vol: 0.26, a: 0.012, d: 0.1, s: 0.65, r: 0.04, g: 0.85, lp: 2700, bend: -0.4, bendT: 0.05, vib: [6, 16, 0.18], pan: 0.05, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        C5 C5 . C5 | Eb5 - . . | G5 - - - | . . . .
        F5 F5 . F5 | Eb5 - . . | D5 - C5 - | . . . .
        Ab4 Ab4 . Ab4 | C5 - . . | Eb5 - - - | . . . .
        F5 F5 . F5 | Eb5 - . . | C5 - Ab4 - | . . . .
        Bb4 Bb4 . Bb4 | D5 - . . | F5 - - - | . . . .
        Eb5 Eb5 . Eb5 | D5 - . . | Bb4 - F4 - | . . . .
        G4 G4 . G4 | B4 - . . | D5 - - - | . . . .
        C5 C5 . C5 | B4 - . . | D5 - G4 - | . . . .
        C6 - - - | - - - - | Ab5 - - - | F5 - - -
        F5 - - - | Ab5 - - - | C6 - - - | F6 - - -
        Eb6 - - - | - - - - | D6 - C6 - | B5 - - -
        C6 - - - | - - - - | G5 - - - | Eb5 - - -
        Ab5 - - - | - - - - | C6 - - - | Eb6 - - -
        D6 - - - | - - - - | F6 - - - | D6 - - -
        D6 - - - | - - - - | B5 - - - | G5 - - -
        G5 - - - | B5 - - - | D6 - - - | F6 - - -
      ` },
    harm: { w: 'pulse25', vol: 0.13, a: 0.012, d: 0.1, s: 0.65, r: 0.04, g: 0.85, lp: 2500, pan: 0.3, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        G4 - . G4 | - - . . | D#5 - - - | . . . .
        C5 - . C5 | - - . . | G4 - - - | . . . .
        D#4 - . D#4 | - - . . | C5 - - - | . . . .
        C5 - . C5 | - - . . | G#4 - D#4 - | . . . .
        F4 - . F4 | - - . . | D5 - - - | . . . .
        A#4 - . A#4 | - - . . | F4 - D4 - | . . . .
        D4 - . D4 | - - . . | B4 - - - | . . . .
        G4 - . G4 | - - . . | B4 - D4 - | . . . .
        G#5 - - - | - - - - | F5 - - - | C5 - - -
        - - - - | - - - - | G#5 - - - | - - - -
        C6 - - - | - - - - | G5 - - - | - - - -
        - - - - | - - - - | D#5 - - - | C5 - - -
        - - - - | - - - - | G#5 - - - | - - - -
        A#5 - - - | - - - - | - - - - | - - - -
        B5 - - - | - - - - | G5 - - - | D5 - - -
        - - - - | - - - - | B5 - - - | - - - -
      ` },
    arp: { w: 'pulse12', vol: 0.14, a: 0.002, d: 0.09, s: 0.45, r: 0.03, g: 0.7, pan: -0.3, bars: `
        C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4
        G3 B3 D4 B3 | G3 B3 D4 B3 | G3 B3 D4 B3 | G3 B3 D4 B3
        C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4
        C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4
        Ab3 C4 Eb4 C4 | Ab3 C4 Eb4 C4 | Ab3 C4 Eb4 C4 | Ab3 C4 Eb4 C4
        Ab3 C4 Eb4 C4 | Ab3 C4 Eb4 C4 | Ab3 C4 Eb4 C4 | Ab3 C4 Eb4 C4
        Bb3 D4 F4 D4 | Bb3 D4 F4 D4 | Bb3 D4 F4 D4 | Bb3 D4 F4 D4
        Bb3 D4 F4 D4 | Bb3 D4 F4 D4 | Bb3 D4 F4 D4 | Bb3 D4 F4 D4
        G3 B3 D4 B3 | G3 B3 D4 B3 | G3 B3 D4 B3 | G3 B3 D4 B3
        G3 B3 D4 B3 | G3 B3 D4 B3 | G3 B3 D4 B3 | G3 B3 D4 B3
        F3 Ab3 C4 Ab3 | F3 Ab3 C4 Ab3 | F3 Ab3 C4 Ab3 | F3 Ab3 C4 Ab3
        F3 Ab3 C4 Ab3 | F3 Ab3 C4 Ab3 | F3 Ab3 C4 Ab3 | F3 Ab3 C4 Ab3
        C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4
        C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4 | C4 Eb4 G4 Eb4
        Ab3 C4 Eb4 C4 | Ab3 C4 Eb4 C4 | Ab3 C4 Eb4 C4 | Ab3 C4 Eb4 C4
        Bb3 D4 F4 D4 | Bb3 D4 F4 D4 | Bb3 D4 F4 D4 | Bb3 D4 F4 D4
        G3 B3 D4 B3 | G3 B3 D4 B3 | G3 B3 D4 B3 | G3 B3 D4 B3
        G3 B3 D4 B3 | G3 B3 D4 B3 | G3 B3 D4 B3 | G3 B3 D4 B3
      ` },
    bass: { w: 'tri', vol: 0.185, a: 0.003, d: 0.06, s: 0.9, r: 0.03, g: 0.7, bars: `
        C2! C2, . C2, | C3! . C2, . | C2! C2, . C2, | C3! . G2, .
        G2! G2, . G2, | G3! . G2, . | G2! G2, . G2, | G3! . D3, .
        C2! C2, . C2, | C3! . C2, . | C2! C2, . C2, | C3! . G2, .
        C2! C2, . C2, | C3! . C2, . | C2! C2, . C2, | C3! . G2, .
        G#2! G#2, . G#2, | G#3! . G#2, . | G#2! G#2, . G#2, | G#3! . D#3, .
        G#2! G#2, . G#2, | G#3! . G#2, . | G#2! G#2, . G#2, | G#3! . D#3, .
        A#2! A#2, . A#2, | A#3! . A#2, . | A#2! A#2, . A#2, | A#3! . F3, .
        A#2! A#2, . A#2, | A#3! . A#2, . | A#2! A#2, . A#2, | A#3! . F3, .
        G2! G2, . G2, | G3! . G2, . | G2! G2, . G2, | G3! . D3, .
        G2! G2, . G2, | G3! . G2, . | G2! G2, G2, G2, | G3! G3! G3! G3!
        F2! - F3, - | F2! - F3, - | F2! - F3, - | C3! - F3, -
        F2! - F3, - | F2! - F3, - | F2! - F3, - | C3! - F3, -
        C2! - C3, - | C2! - C3, - | C2! - C3, - | G2! - C3, -
        C2! - C3, - | C2! - C3, - | C2! - C3, - | G2! - C3, -
        G#2! - G#3, - | G#2! - G#3, - | G#2! - G#3, - | D#3! - G#3, -
        A#2! - A#3, - | A#2! - A#3, - | A#2! - A#3, - | F3! - A#3, -
        G2! - G3, - | G2! - G3, - | G2! - G3, - | D3! - G3, -
        G2! G2, . G2, | G3! . G2, . | G2! G2, G2, G2, | G3! G3! G3! G3!
      ` },
    drums: { w: 'drums', vol: 0.5, bars: `
        @i1
        @i2
        @dAc
        @dA *2
        @dF
        @dA *3
        @dF
        @dBc
        @dB *3
        @dB
        @dB
        @dB
        @dBf
      ` }
  }
};

// FINAL BOSS -- D minor (+C# leading tone), 176 BPM, 2-bar intro + 24-bar loop: A climbing sequence (Dm-F-Gm-A) / B lyrical / A' + tremolo strings
Music.tracks.bossFinal = {
  name: 'Final Boss', bpm: 176, scale: 'D minor', chromatic: ['C#'], loop: true, loopStart: 2, gain: 1,
  chords: `
    Dm
    A
    Dm
    Dm
    F
    F
    Gm
    Gm
    A
    A7
    Bb
    C
    Dm
    Dm9
    Bb
    C
    A
    A
    Dm
    Dm
    F
    F
    Gm
    Gm
    A
    A7
  `,
  pat: {
    i1: `
      d d d d | d d d d | m m m m | t t t t
    `,
    i2: `
      k . . . | s . . . | k . s . | s s s s
    `,
    dA: `
      kh h, kh h, | sh h, h k | kh h, kh h, | sh h, k s
    `,
    dAc: `
      kch h, kh h, | sh h, h k | kh h, kh h, | sh h, k s
    `,
    dF: `
      kh h, kh h, | sh h, h k | kh h, kh h, | s s t m
    `,
    dB: `
      kh h, o h, | sh h, o kh, | kh h, o h, | sh h, o kh,
    `,
    dBc: `
      kch h, o h, | sh h, o kh, | kh h, o h, | sh h, o kh,
    `,
    dBf: `
      kh h, o h, | sh h, o kh, | k k s s | t t m d
    `,
  },
  ch: {
    lead: { w: 'saw', vol: 0.24, a: 0.012, d: 0.12, s: 0.65, r: 0.05, g: 0.9, lp: 3000, bend: -0.4, bendT: 0.05, vib: [6.2, 18, 0.16], echo: [0.1, 3, 0.3], pan: 0.05, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        A4 - - D5 | F5 - - - | A5 - - - | - - - -
        G5 - - F5 | E5 - - - | D5 - - - | - - - -
        C5 - - F5 | A5 - - - | C6 - - - | - - - -
        Bb5 - - A5 | G5 - - - | F5 - - - | - - - -
        D5 - - G5 | Bb5 - - - | D6 - - - | - - - -
        C6 - - Bb5 | A5 - - - | G5 - - - | - - - -
        E5 - - A5 | C#6 - - - | E6 - - - | - - - -
        D6 - - C#6 | A5 - - - | E5 - - - | - - - -
        F5 - - - | - - - - | D6 - - - | - - - -
        E6 - - - | - - - - | C6 - - - | - - - -
        A5 - - - | - - F5 - | D6 - - - | - - - -
        E6 - - - | - - - - | D6 - - - | A5 - - -
        D6 - - - | - - C6 - | Bb5 - - - | - - - -
        C6 - - - | - - D6 - | E6 - - - | - - - -
        A5 - - - | C#6 - - - | E6 - - - | - - - -
        D6 - - - | C#6 - - - | A5 - - - | E5 - - -
        A4 - - D5 | F5 - - - | A5 - - - | - - - -
        G5 - - F5 | E5 - - - | D5 - - - | - - - -
        C5 - - F5 | A5 - - - | C6 - - - | - - - -
        Bb5 - - A5 | G5 - - - | F5 - - - | - - - -
        D5 - - G5 | Bb5 - - - | D6 - - - | - - - -
        C6 - - Bb5 | A5 - - - | G5 - - - | - - - -
        E5 - - A5 | C#6 - - - | E6 - - - | - - - -
        D6 - - C#6 | A5 - - - | E5 - - - | - - - -
      ` },
    harm: { w: 'pulse25', vol: 0.12, a: 0.012, d: 0.12, s: 0.65, r: 0.05, g: 0.9, lp: 2600, pan: 0.3, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        D5 - - - | - - - - | A#5 - - - | - - - -
        C6 - - - | - - - - | G5 - - - | - - - -
        F5 - - - | - - D5 - | A5 - - - | - - - -
        - - - - | - - - - | - - - - | F5 - - -
        - - - - | - - - - | - - - - | - - - -
        G5 - - - | - - - - | - - - - | - - - -
        E5 - - - | - - - - | C#6 - - - | - - - -
        A5 - - - | - - - - | E5 - - - | C#5 - - -
        F4 - - - | D5 - - - | - - - - | - - - -
        - - - - | A4 - - - | - - - - | - - - -
        - - - - | F5 - - - | - - - - | - - - -
        - - - - | C5 - - - | - - - - | - - - -
        A#4 - - - | G5 - - - | - - - - | - - - -
        - - - - | D5 - - - | - - - - | - - - -
        C#5 - - - | A5 - - - | - - - - | - - - -
        - - - - | E5 - - - | C#5 - - - | - - - -
      ` },
    trem: { w: 'saw', vol: 0.1, a: 0.05, d: 0.3, s: 0.9, r: 0.1, g: 1, lp: 1700, trem: [11, 0.5], det: 7, pan: -0.3, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        F4 - - - | - - - - | - - - - | - - - -
        G4 - - - | - - - - | - - - - | - - - -
        A4 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        F4 - - - | - - - - | - - - - | - - - -
        G4 - - - | - - - - | - - - - | - - - -
        E4 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        A4 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        C5 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        D5 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        E5 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
      ` },
    arp: { w: 'pulse12', vol: 0.17, a: 0.002, d: 0.09, s: 0.45, r: 0.03, g: 0.7, pan: -0.3, bars: `
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        . . . . | . . . . | . . . . | . . . .
        Bb3 D4 F4 D4 | Bb3 D4 F4 D4 | Bb3 D4 F4 D4 | Bb3 D4 F4 D4
        C4 E4 G4 E4 | C4 E4 G4 E4 | C4 E4 G4 E4 | C4 E4 G4 E4
        D4 F4 A4 F4 | D4 F4 A4 F4 | D4 F4 A4 F4 | D4 F4 A4 F4
        D4 F4 A4 F4 | D4 F4 A4 F4 | D4 F4 A4 F4 | D4 F4 A4 F4
        Bb3 D4 F4 D4 | Bb3 D4 F4 D4 | Bb3 D4 F4 D4 | Bb3 D4 F4 D4
        C4 E4 G4 E4 | C4 E4 G4 E4 | C4 E4 G4 E4 | C4 E4 G4 E4
        A3 C#4 E4 C#4 | A3 C#4 E4 C#4 | A3 C#4 E4 C#4 | A3 C#4 E4 C#4
        A3 C#4 E4 C#4 | A3 C#4 E4 C#4 | A3 C#4 E4 C#4 | A3 C#4 E4 C#4
        D4 F4 A4 F4 | D4 F4 A4 F4 | D4 F4 A4 F4 | D4 F4 A4 F4
        D4 F4 A4 F4 | D4 F4 A4 F4 | D4 F4 A4 F4 | D4 F4 A4 F4
        F4 A4 C5 A4 | F4 A4 C5 A4 | F4 A4 C5 A4 | F4 A4 C5 A4
        F4 A4 C5 A4 | F4 A4 C5 A4 | F4 A4 C5 A4 | F4 A4 C5 A4
        G4 Bb4 D5 Bb4 | G4 Bb4 D5 Bb4 | G4 Bb4 D5 Bb4 | G4 Bb4 D5 Bb4
        G4 Bb4 D5 Bb4 | G4 Bb4 D5 Bb4 | G4 Bb4 D5 Bb4 | G4 Bb4 D5 Bb4
        A3 C#4 E4 C#4 | A3 C#4 E4 C#4 | A3 C#4 E4 C#4 | A3 C#4 E4 C#4
        A3 C#4 E4 C#4 | A3 C#4 E4 C#4 | A3 C#4 E4 C#4 | A3 C#4 E4 C#4
      ` },
    bass: { w: 'tri', vol: 0.185, a: 0.003, d: 0.06, s: 0.9, r: 0.03, g: 0.8, bars: `
        D2! . . D2, | . . D2! . | D2! . . D2, | . . D3! .
        A2! . . A2, | . . A2! . | A2! . . A2, | . . A3! .
        D2! A2, D3, A2, | D2! A2, D3, A2, | D2! A2, D3, A2, | D2! A2, D3, A2,
        D2! A2, D3, A2, | D2! A2, D3, A2, | D2! A2, D3, A2, | D2! A2, D3, A2,
        F2! C3, F3, C3, | F2! C3, F3, C3, | F2! C3, F3, C3, | F2! C3, F3, C3,
        F2! C3, F3, C3, | F2! C3, F3, C3, | F2! C3, F3, C3, | F2! C3, F3, C3,
        G2! D3, G3, D3, | G2! D3, G3, D3, | G2! D3, G3, D3, | G2! D3, G3, D3,
        G2! D3, G3, D3, | G2! D3, G3, D3, | G2! D3, G3, D3, | G2! D3, G3, D3,
        A2! E3, A3, E3, | A2! E3, A3, E3, | A2! E3, A3, E3, | A2! E3, A3, E3,
        A2! E3, A3, E3, | A2! E3, A3, E3, | A2! E3, A3, E3, | A3! A3! A3! A3!
        A#2! F3, A#3, F3, | A#2! F3, A#3, F3, | A#2! F3, A#3, F3, | A#2! F3, A#3, F3,
        C3! G3, C4, G3, | C3! G3, C4, G3, | C3! G3, C4, G3, | C3! G3, C4, G3,
        D2! A2, D3, A2, | D2! A2, D3, A2, | D2! A2, D3, A2, | D2! A2, D3, A2,
        D2! A2, D3, A2, | D2! A2, D3, A2, | D2! A2, D3, A2, | D2! A2, D3, A2,
        A#2! F3, A#3, F3, | A#2! F3, A#3, F3, | A#2! F3, A#3, F3, | A#2! F3, A#3, F3,
        C3! G3, C4, G3, | C3! G3, C4, G3, | C3! G3, C4, G3, | C3! G3, C4, G3,
        A2! E3, A3, E3, | A2! E3, A3, E3, | A2! E3, A3, E3, | A2! E3, A3, E3,
        A2! E3, A3, E3, | A2! E3, A3, E3, | A2! E3, A3, E3, | A3! A3! A3! A3!
        D2! A2, D3, A2, | D2! A2, D3, A2, | D2! A2, D3, A2, | D2! A2, D3, A2,
        D2! A2, D3, A2, | D2! A2, D3, A2, | D2! A2, D3, A2, | D2! A2, D3, A2,
        F2! C3, F3, C3, | F2! C3, F3, C3, | F2! C3, F3, C3, | F2! C3, F3, C3,
        F2! C3, F3, C3, | F2! C3, F3, C3, | F2! C3, F3, C3, | F2! C3, F3, C3,
        G2! D3, G3, D3, | G2! D3, G3, D3, | G2! D3, G3, D3, | G2! D3, G3, D3,
        G2! D3, G3, D3, | G2! D3, G3, D3, | G2! D3, G3, D3, | G2! D3, G3, D3,
        A2! E3, A3, E3, | A2! E3, A3, E3, | A2! E3, A3, E3, | A2! E3, A3, E3,
        A2! E3, A3, E3, | A2! E3, A3, E3, | A2! E3, A3, E3, | A3! A3! A3! A3!
      ` },
    drums: { w: 'drums', vol: 0.5, bars: `
        @i1
        @i2
        @dAc
        @dA *2
        @dF
        @dA *3
        @dF
        @dBc
        @dB *5
        @dB
        @dBf
        @dAc
        @dA *2
        @dF
        @dA *3
        @dF
      ` }
  }
};

// STAGE CLEAR -- C major fanfare, 132 BPM, 3 bars (~5.5 s), plays once
Music.tracks.clear = {
  name: 'Stage Clear', bpm: 132, scale: 'C major', chromatic: [], loop: false, gain: 1, tail: 0.8,
  chords: `
    C
    F G
    C
  `,
  ch: {
    lead: { w: 'pulse25', vol: 0.23, a: 0.006, d: 0.3, s: 0.8, r: 0.06, g: 0.94, vib: [5.6, 14, 0.16], bend: -0.3, bendT: 0.045, echo: [0.15, 3, 0.3], pan: 0.05, bars: `
        G4 C5 E5 G5 | C6 - - - | B5 - A5 - | G5 - - -
        A5 - F5 - | A5 - C6 - | D6 - B5 - | G5 - B5 -
        C6 - - - | - - - - | - - - - | - - - -
      ` },
    harm: { w: 'pulse50', vol: 0.077, a: 0.01, d: 0.2, s: 0.8, r: 0.07, g: 0.96, vib: [5.2, 10, 0.2], det: 6, pan: 0.3, bars: `
        E4 - C5 - | G5 - - - | - - E5 - | - - - -
        F5 - C5 - | - - A5 - | B5 - G5 - | D5 - - -
        G5 - - - | - - - - | - - - - | - - - -
      ` },
    arp: { w: 'pulse12', vol: 0.17, a: 0.002, d: 0.09, s: 0.45, r: 0.03, g: 0.8, pan: -0.3, bars: `
        C4 E4 G4 E4 | C4 E4 G4 E4 | C4 E4 G4 E4 | C4 E4 G4 E4
        F4 A4 C5 A4 | F4 A4 C5 A4 | G4 B4 D5 B4 | G4 B4 D5 B4
        C5+E5+G5 - - - | - - - - | - - - - | - - - -
      ` },
    bass: { w: 'tri', vol: 0.185, a: 0.003, d: 0.06, s: 0.9, r: 0.03, g: 0.92, bars: `
        C3 - G3 - | C3 - G3 - | C3 - G3 - | C3 - G3 -
        F2 - C3 - | F2 - C3 - | G2 - D3 - | G2 - D3 -
        C2 - - - | - - - - | - - - - | - - - -
      ` },
    drums: { w: 'drums', vol: 0.5, bars: `
        kch . h . | sh . h . | kh . h . | sh . s s
        kh . h . | sh . h . | kh . h . | s s s s
        kc . . . | . . . . | . . . . | . . . .
      ` }
  }
};

// GAME OVER -- D minor, 96 BPM, 2 bars (5.0 s), plays once: sighing descent, leading tone C#, low resolved D
Music.tracks.gameover = {
  name: 'Game Over', bpm: 96, scale: 'D minor', chromatic: ['C#'], loop: false, gain: 1, tail: 1,
  chords: `
    Dm Gm
    A Dm
  `,
  ch: {
    lead: { w: 'pulse25', vol: 0.23, a: 0.006, d: 0.3, s: 0.8, r: 0.06, g: 0.94, vib: [4.8, 16, 0.2], bend: 0, bendT: 0.045, echo: [0.2, 3, 0.35], pan: 0.05, bars: `
        A5 - - - | - - G5 - | Bb5 - - - | A5 - G5 -
        E5 - - - | C#5 - - - | D5 - - - | - - - -
      ` },
    arp: { w: 'pulse12', vol: 0.13, a: 0.03, d: 0.3, s: 0.8, r: 0.03, g: 0.98, pan: -0.3, arpHz: 30, lp: 2400, bars: `
        D4+F4+A4 - - - | - - - - | G3+Bb3+D4 - - - | - - - -
        A3+C#4+E4 - - - | - - - - | D4+F4+A4 - - - | - - - -
      ` },
    bass: { w: 'tri', vol: 0.185, a: 0.01, d: 0.3, s: 0.8, r: 0.15, g: 0.98, bars: `
        D2 - - - | - - - - | G2 - - - | - - - -
        A2 - - - | - - - - | D2 - - - | - - - -
      ` },
    drums: { w: 'drums', vol: 0.5, bars: `
        d . . . | . . . . | d, . . . | . . . .
        d . . . | . . . . | d . . . | . . . .
      ` }
  }
};

// ENDING -- F major, 128 BPM, 16 bars (~30 s), plays once: A bright arch motif (bars 1-8) / B calm (9-14) / cadence and held chord (15-16)
Music.tracks.ending = {
  name: 'Ending', bpm: 128, scale: 'F major', chromatic: [], loop: false, gain: 1, tail: 1.6,
  chords: `
    F
    C
    Dm
    Bb
    F
    C
    Bb
    C
    Dm
    Bb
    Gm
    C
    F
    Bbmaj7
    Gm C
    F
  `,
  pat: {
    g1: `
      kh . h . | sh . h . | kh . h . | sh . h .
    `,
    g1c: `
      kch . h . | sh . h . | kh . h . | sh . h .
    `,
    f8: `
      kh . h . | sh . h . | k . s . | s t m d
    `,
    c1: `
      k, . . . | . . . . | k, . . . | . . . .
    `,
    c2: `
      k, . . . | . . . . | h, . . . | . . . .
    `,
  },
  ch: {
    lead: { w: 'pulse25', vol: 0.23, a: 0.006, d: 0.3, s: 0.8, r: 0.06, g: 0.94, vib: [5.6, 14, 0.16], bend: -0.3, bendT: 0.045, echo: [0.16, 3, 0.32], pan: 0.05, bars: `
        A5 - - - | C6 - - - | A5 - G5 - | F5 - - -
        G5 - - - | E5 - - - | G5 - A5 - | G5 - - -
        A5 - - - | D6 - - - | C6 - Bb5 - | A5 - - -
        Bb5 - - - | D6 - - - | C6 - Bb5 - | A5 - - -
        A5 - - - | C6 - - - | D6 - C6 - | A5 - - -
        G5 - - - | E6 - - - | D6 - C6 - | G5 - - -
        D6 - - - | C6 - - - | Bb5 - - - | A5 - - -
        G5 - - - | - - E5 - | G5 - - - | - - - -
        A5 - - - | - - G5 - | F5 - - - | - - - -
        D6 - - - | - - C6 - | Bb5 - - - | - - - -
        Bb5 - - - | - - A5 - | G5 - - - | - - - -
        E5 - - - | - - G5 - | C6 - - - | - - - -
        A5 - - - | - - - - | C6 - - - | - - - -
        D6 - - - | - - C6 - | A5 - - - | - - - -
        Bb5 - - - | G5 - - - | E5 - - - | G5 - - -
        F5 - - - | - - - - | - - - - | - - - -
      ` },
    harm: { w: 'pulse50', vol: 0.077, a: 0.01, d: 0.2, s: 0.8, r: 0.07, g: 0.96, vib: [5.2, 10, 0.2], det: 6, pan: 0.3, bars: `
        F5 - - - | - - - - | - - C5 - | - - - -
        - - - - | - - - - | - - - - | - - - -
        F5 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        E5 - - - | C6 - - - | G5 - - - | E5 - - -
        Bb5 - - - | F5 - - - | - - - - | - - - -
        E5 - - - | - - C5 - | - - - - | - - - -
        F5 - - - | - - D5 - | - - - - | - - - -
        Bb5 - - - | - - F5 - | - - - - | - - - -
        G5 - - - | - - D5 - | - - - - | - - - -
        C5 - - - | - - - - | G5 - - - | - - - -
        F5 - - - | - - - - | - - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
        G5 - - - | D5 - - - | C5 - - - | - - - -
        - - - - | - - - - | - - - - | - - - -
      ` },
    arp: { w: 'pulse12', vol: 0.17, a: 0.002, d: 0.09, s: 0.45, r: 0.03, g: 0.8, pan: -0.3, bars: `
        F4 A4 C5 F5 | C5 A4 C5 F5 | F4 A4 C5 F5 | C5 A4 C5 F5
        E4 G4 C5 E5 | C5 G4 C5 E5 | E4 G4 C5 E5 | C5 G4 C5 E5
        D4 F4 A4 D5 | A4 F4 A4 D5 | D4 F4 A4 D5 | A4 F4 A4 D5
        D4 F4 Bb4 D5 | Bb4 F4 Bb4 D5 | D4 F4 Bb4 D5 | Bb4 F4 Bb4 D5
        F4 A4 C5 F5 | C5 A4 C5 F5 | F4 A4 C5 F5 | C5 A4 C5 F5
        E4 G4 C5 E5 | C5 G4 C5 E5 | E4 G4 C5 E5 | C5 G4 C5 E5
        D4 F4 Bb4 D5 | Bb4 F4 Bb4 D5 | D4 F4 Bb4 D5 | Bb4 F4 Bb4 D5
        E4 G4 C5 E5 | C5 G4 C5 E5 | E4 G4 C5 E5 | C5 G4 C5 E5
        D4 . F4 . | A4 . D5 . | A4 . F4 . | D4 . F4 .
        D4 . F4 . | Bb4 . D5 . | Bb4 . F4 . | D4 . F4 .
        D4 . G4 . | Bb4 . D5 . | Bb4 . G4 . | D4 . G4 .
        E4 . G4 . | C5 . E5 . | C5 . G4 . | E4 . G4 .
        F4 . A4 . | C5 . F5 . | C5 . A4 . | F4 . A4 .
        D4 . F4 . | Bb4 . D5 . | Bb4 . F4 . | D4 . F4 .
        G4+Bb4+D5 - - - | - - - - | E4+G4+C5 - - - | - - - -
        F4+A4+C5 - - - | - - - - | - - - - | - - - -
      ` },
    bass: { w: 'tri', vol: 0.185, a: 0.003, d: 0.06, s: 0.9, r: 0.03, g: 0.92, bars: `
        F2 - C3 - | F2 - C3 - | F2 - C3 - | F2 - C3 -
        C3 - G3 - | C3 - G3 - | C3 - G3 - | C3 - G3 -
        D3 - A3 - | D3 - A3 - | D3 - A3 - | D3 - A3 -
        Bb2 - F3 - | Bb2 - F3 - | Bb2 - F3 - | Bb2 - F3 -
        F2 - C3 - | F2 - C3 - | F2 - C3 - | F2 - C3 -
        C3 - G3 - | C3 - G3 - | C3 - G3 - | C3 - G3 -
        Bb2 - F3 - | Bb2 - F3 - | Bb2 - F3 - | Bb2 - F3 -
        C3 - G3 - | C3 - G3 - | C3 - G3 - | C4 - G3 -
        D3 - - - | - - - - | A3 - - - | - - - -
        Bb2 - - - | - - - - | F3 - - - | - - - -
        G2 - - - | - - - - | D3 - - - | - - - -
        C3 - - - | - - - - | G3 - - - | - - - -
        F2 - - - | - - - - | C3 - - - | - - - -
        Bb2 - - - | - - - - | F3 - - - | - - - -
        G2 - - - | - - - - | C3 - - - | - - - -
        F2 - - - | - - - - | - - - - | - - - -
      ` },
    drums: { w: 'drums', vol: 0.5, bars: `
        @g1c
        @g1 *6
        @f8
        @c1 *4
        @c2 *2
        . . . . | . . . . | . . . . | . . . .
        c, . . . | . . . . | . . . . | . . . .
      ` }
  }
};
