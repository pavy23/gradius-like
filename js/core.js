'use strict';
/* =============================================================
 * NOVA LANCER — core: constants, math helpers, RNG, storage, input
 * (classic script: every top-level const is visible to later scripts)
 * ============================================================= */

const W = 256; // logical screen width  (arcade-like 256x224)
const H = 224; // logical screen height
const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const rndi = (a, b) => Math.floor(rnd(a, b + 1)); // inclusive
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const chance = (p) => Math.random() < p;
/** center-based AABB overlap */
const overlap = (ax, ay, aw, ah, bx, by, bw, bh) =>
  Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;

/** seedable PRNG (mulberry32) – used for terrain / art so builds are deterministic */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** localStorage that never throws (private windows, sandboxed iframes ...) */
const Store = {
  get(key, dflt) {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? dflt : v;
    } catch (e) {
      return dflt;
    }
  },
  set(key, val) {
    try {
      window.localStorage.setItem(key, String(val));
    } catch (e) {
      /* ignore */
    }
  },
};

/* ------------------------------------------------------------------
 * Input: keyboard + gamepad + virtual (touch / test injection)
 *   Input.held.fire   -> true while down
 *   Input.pressed.fire-> true only on the frame it went down
 * Call Input.update() once per simulation step.
 * ------------------------------------------------------------------ */
const Input = (() => {
  const ACTIONS = ['left', 'right', 'up', 'down', 'fire', 'power', 'start', 'pause', 'mute', 'back'];
  const KEYMAP = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    fire: ['KeyZ', 'Space', 'KeyJ'],
    power: ['KeyX', 'ShiftLeft', 'ShiftRight', 'KeyK'],
    start: ['Enter', 'Space', 'KeyZ'],
    pause: ['KeyP', 'Escape'],
    mute: ['KeyM'],
    back: ['Escape', 'Backspace'],
  };
  const PREVENT = new Set([
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter',
    'ShiftLeft', 'ShiftRight', 'Escape', 'Backspace',
  ]);
  const keys = new Set();
  const edge = {}; // pressed between two updates (so very short taps are not lost)
  const virt = {}; // injected by touch controls / tests
  const api = {
    held: {},
    pressed: {},
    anyKey: false, // any key/button pressed this frame (used to unlock audio)
    padActive: false,
    init() {
      window.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (PREVENT.has(e.code)) e.preventDefault();
        if (!keys.has(e.code)) {
          keys.add(e.code);
          for (const a of ACTIONS) if (KEYMAP[a].includes(e.code)) edge[a] = true;
          api.anyKey = true;
        }
      });
      window.addEventListener('keyup', (e) => {
        keys.delete(e.code);
      });
      window.addEventListener('blur', () => keys.clear());
    },
    /** virtual input (touch buttons, automated tests) */
    setVirtual(action, down) {
      if (down && !virt[action]) edge[action] = true;
      virt[action] = !!down;
    },
    clearVirtual() {
      for (const k in virt) virt[k] = false;
    },
    _pad() {
      const out = {};
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p || !p.connected) continue;
        const ax = p.axes[0] || 0;
        const ay = p.axes[1] || 0;
        const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
        if (ax < -0.4 || b(14)) out.left = true;
        if (ax > 0.4 || b(15)) out.right = true;
        if (ay < -0.4 || b(12)) out.up = true;
        if (ay > 0.4 || b(13)) out.down = true;
        if (b(0) || b(2) || b(5) || b(7)) out.fire = true;
        if (b(1) || b(3) || b(4) || b(6)) out.power = true;
        if (b(9) || b(0)) out.start = true;
        if (b(9)) out.pause = true;
        if (b(8)) out.back = true;
      }
      return out;
    },
    update() {
      const pad = api._pad();
      let any = false;
      for (const a of ACTIONS) {
        let h = false;
        for (const c of KEYMAP[a]) {
          if (keys.has(c)) {
            h = true;
            break;
          }
        }
        if (!h) h = !!virt[a] || !!pad[a];
        api.pressed[a] = (h && !api.held[a]) || !!edge[a];
        api.held[a] = h;
        if (api.pressed[a]) any = true;
        edge[a] = false;
      }
      api.anyKey = any || api.anyKey;
    },
    consumeAny() {
      const v = api.anyKey;
      api.anyKey = false;
      return v;
    },
  };
  return api;
})();
