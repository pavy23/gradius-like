'use strict';
/* =============================================================
 * Sprite system.
 *
 * Art is authored as text ("pixel maps": one char per pixel, '.' is
 * transparent) or drawn procedurally with the tiny `Painter` API, then
 * baked once into offscreen canvases.  All art in this game is original.
 *
 *   Sprites.def('name', [rows...])                    // one frame
 *   Sprites.def('name', [[rows...], [rows...]])       // animation frames
 *   Sprites.painted('name', w, h, nFrames, (d, f) => {...})   // procedural
 *   Sprites.recolor('src', 'dst', {b:'r', B:'R'})     // palette swap
 *   Sprites.draw(ctx, 'name', cx, cy, {frame, flipX, flipY, flash})
 *   Sprites.get('name', frame) -> canvas ; Sprites.size('name') -> {w,h,n}
 * ============================================================= */

/** shared palette – single-char keys are used inside pixel maps */
const PAL = {
  k: '#0c0c18', // near-black outline
  w: '#ffffff',
  W: '#dfe8f4', // light
  g: '#9eaac0', // mid
  G: '#5d6882', // dark
  d: '#2a3048', // very dark
  r: '#f03a3a', // red
  R: '#a01c2c', // dark red
  o: '#ff9424', // orange
  O: '#c05412', // dark orange
  y: '#ffe646', // yellow
  Y: '#b89a20', // dark yellow
  l: '#8cf03c', // lime
  n: '#34b04a', // green
  N: '#146034', // dark green
  c: '#48ecf4', // cyan
  C: '#2a96c8', // dark cyan
  b: '#4c84f4', // blue
  B: '#2844a8', // dark blue
  v: '#a068e8', // violet
  V: '#583494', // dark violet
  p: '#f478c8', // pink
  P: '#a83a84', // dark pink
  t: '#c88c58', // tan
  T: '#84542e', // brown
  s: '#f4d0a8', // sand / skin
  S: '#a87858', // dark sand
  e: '#3c2440', // deep purple-brown (shadow)
  m: '#6a3a4c', // maroon
  M: '#8e5060', // light maroon
  h: '#fff2a8', // pale yellow highlight
  x: '#7a8a9c', // steel
  X: '#48566a', // dark steel
};

const Sprites = (() => {
  const store = {}; // name -> {frames:[canvas], w, h, rows}
  const flashCache = new WeakMap();
  const rgbCache = {};

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function cssOf(ch, pal) {
    if (ch === undefined || ch === null) return null;
    if (ch.length === 1) return (pal && pal[ch]) || PAL[ch] || null;
    return ch; // full css color string
  }
  function toRgb(css) {
    let v = rgbCache[css];
    if (v) return v;
    const c = makeCanvas(1, 1);
    const g = c.getContext('2d');
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    v = rgbCache[css] = [d[0], d[1], d[2]];
    return v;
  }

  /* ---------- Painter: procedural pixel drawing ---------- */
  class Painter {
    constructor(w, h, pal) {
      this.w = w;
      this.h = h;
      this.pal = pal;
      this.c = makeCanvas(w, h);
      this.g = this.c.getContext('2d', { willReadFrequently: true });
    }
    col(ch) {
      const v = cssOf(ch, this.pal);
      if (!v) console.error('Painter: unknown color', ch);
      return v || '#f0f';
    }
    px(x, y, ch) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
      this.g.fillStyle = this.col(ch);
      this.g.fillRect(x | 0, y | 0, 1, 1);
      return this;
    }
    erase(x, y) {
      this.g.clearRect(x, y, 1, 1);
      return this;
    }
    rect(x, y, w, h, ch) {
      this.g.fillStyle = this.col(ch);
      this.g.fillRect(x, y, w, h);
      return this;
    }
    hline(x0, x1, y, ch) {
      return this.rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, ch);
    }
    vline(x, y0, y1, ch) {
      return this.rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, ch);
    }
    line(x0, y0, x1, y1, ch) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.px(x0, y0, ch);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
      return this;
    }
    /** filled disc, pixel-centre test */
    circle(cx, cy, r, ch) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) this.px(x, y, ch);
      return this;
    }
    ring(cx, cy, r, thick, ch) {
      const r0 = (r - thick) * (r - thick), r1 = r * r;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
          if (d <= r1 && d >= r0) this.px(x, y, ch);
        }
      return this;
    }
    ellipse(cx, cy, rx, ry, ch) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const a = (x - cx) / rx, b = (y - cy) / ry;
          if (a * a + b * b <= 1) this.px(x, y, ch);
        }
      return this;
    }
    /** scan-line polygon fill (pixel centres) */
    poly(pts, ch) {
      let minY = Infinity, maxY = -Infinity;
      for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
      for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
        const yc = y + 0.5;
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
            xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
          }
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.px(x, y, ch);
        }
      }
      return this;
    }
    /** checker / bayer-ish dither between two colours inside a rect */
    dither(x, y, w, h, c1, c2, level = 0.5) {
      const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const t = B[((y + j) & 3) * 4 + ((x + i) & 3)] / 16;
          this.px(x + i, y + j, t < level ? c2 : c1);
        }
      return this;
    }
    /** paste a text pixel map */
    rows(rows, ox = 0, oy = 0) {
      for (let y = 0; y < rows.length; y++)
        for (let x = 0; x < rows[y].length; x++) {
          const ch = rows[y][x];
          if (ch !== '.' && ch !== ' ') this.px(ox + x, oy + y, ch);
        }
      return this;
    }
    /** draw a 1px outline around all opaque pixels (in transparent neighbours) */
    outline(ch, diagonals = false) {
      const { w, h } = this;
      const img = this.g.getImageData(0, 0, w, h);
      const d = img.data;
      const col = toRgb(this.col(ch));
      const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
      const out = [];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (opaque(x, y)) continue;
          if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1) ||
              (diagonals && (opaque(x - 1, y - 1) || opaque(x + 1, y - 1) || opaque(x - 1, y + 1) || opaque(x + 1, y + 1)))) {
            out.push(x, y);
          }
        }
      for (let i = 0; i < out.length; i += 2) {
        const o = (out[i + 1] * w + out[i]) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
      this.g.putImageData(img, 0, 0);
      return this;
    }
    /** mirror the top half onto the bottom (axis row = middle row) */
    mirrorV() {
      const { w, h } = this;
      const src = this.g.getImageData(0, 0, w, Math.ceil(h / 2));
      const tmp = makeCanvas(w, Math.ceil(h / 2));
      tmp.getContext('2d').putImageData(src, 0, 0);
      this.g.save();
      this.g.translate(0, h);
      this.g.scale(1, -1);
      this.g.drawImage(tmp, 0, 0);
      this.g.restore();
      return this;
    }
  }

  /* ---------- baking ---------- */
  function fromRows(rows, name, pal) {
    const h = rows.length;
    const w = rows[0].length;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      if (rows[y].length !== w) console.error(`Sprite '${name}': row ${y} has width ${rows[y].length}, expected ${w}`);
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === '.' || ch === ' ') continue;
        const col = cssOf(ch, pal);
        if (!col) {
          console.error(`Sprite '${name}': unknown colour '${ch}' at ${x},${y}`);
          continue;
        }
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  const api = {
    store,
    Painter,
    makeCanvas,
    toRgb,

    /** define from text pixel maps */
    def(name, frames, opts = {}) {
      const list = typeof frames[0] === 'string' ? [frames] : frames;
      const cv = list.map((rows) => fromRows(rows, name, opts.pal));
      store[name] = { frames: cv, w: cv[0].width, h: cv[0].height, rows: list, pal: opts.pal };
      return store[name];
    },

    /** define procedurally: fn(painter, frameIndex) */
    painted(name, w, h, nFrames, fn, opts = {}) {
      const cv = [];
      for (let f = 0; f < nFrames; f++) {
        const p = new Painter(w, h, opts.pal);
        fn(p, f);
        cv.push(p.c);
      }
      store[name] = { frames: cv, w, h };
      return store[name];
    },

    /** register ready-made canvases */
    fromCanvases(name, canvases) {
      store[name] = { frames: canvases, w: canvases[0].width, h: canvases[0].height };
      return store[name];
    },

    /** palette swap: map keys/values are palette chars or css colours */
    recolor(src, dst, map) {
      const s = store[src];
      if (!s) throw new Error('recolor: unknown sprite ' + src);
      const m = new Map();
      for (const k in map) m.set(toRgb(cssOf(k, s.pal)).join(','), toRgb(cssOf(map[k], s.pal)));
      const cv = s.frames.map((f) => {
        const c = makeCanvas(f.width, f.height);
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(f, 0, 0);
        const img = g.getImageData(0, 0, f.width, f.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          const to = m.get(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
          if (to) { d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2]; }
        }
        g.putImageData(img, 0, 0);
        return c;
      });
      store[dst] = { frames: cv, w: s.w, h: s.h };
      return store[dst];
    },

    has(name) {
      return !!store[name];
    },
    size(name) {
      const s = store[name];
      if (!s) throw new Error('Unknown sprite ' + name);
      return { w: s.w, h: s.h, n: s.frames.length };
    },
    get(name, frame = 0) {
      const s = store[name];
      if (!s) {
        if (!api._warned) api._warned = {};
        if (!api._warned[name]) {
          console.warn('Unknown sprite', name);
          api._warned[name] = true;
        }
        return api.get('missing');
      }
      return s.frames[((frame % s.frames.length) + s.frames.length) % s.frames.length];
    },

    /** white silhouette (hit flash) */
    flashOf(canvas) {
      let f = flashCache.get(canvas);
      if (f) return f;
      f = makeCanvas(canvas.width, canvas.height);
      const g = f.getContext('2d');
      g.drawImage(canvas, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, f.width, f.height);
      flashCache.set(canvas, f);
      return f;
    },

    /**
     * draw centred at (cx, cy).
     * opt: frame, flipX, flipY, flash(bool), alpha
     */
    draw(ctx, name, cx, cy, opt) {
      const s = store[name];
      if (!s) { api.get(name); return; }
      const o = opt || {};
      let img = api.get(name, o.frame || 0);
      if (o.flash) img = api.flashOf(img);
      const x = Math.round(cx - img.width / 2);
      const y = Math.round(cy - img.height / 2);
      const fx = o.flipX, fy = o.flipY;
      if (o.alpha !== undefined && o.alpha < 1) {
        const pa = ctx.globalAlpha;
        ctx.globalAlpha = pa * o.alpha;
        if (fx || fy) drawFlipped(ctx, img, x, y, fx, fy);
        else ctx.drawImage(img, x, y);
        ctx.globalAlpha = pa;
        return;
      }
      if (fx || fy) drawFlipped(ctx, img, x, y, fx, fy);
      else ctx.drawImage(img, x, y);
    },

    /** draw with top-left at (x, y) (no centring) */
    drawTL(ctx, name, x, y, opt) {
      const img = api.get(name, (opt && opt.frame) || 0);
      const im = opt && opt.flash ? api.flashOf(img) : img;
      if (opt && (opt.flipX || opt.flipY)) drawFlipped(ctx, im, Math.round(x), Math.round(y), opt.flipX, opt.flipY);
      else ctx.drawImage(im, Math.round(x), Math.round(y));
    },

    names() {
      return Object.keys(store);
    },
  };

  function drawFlipped(ctx, img, x, y, fx, fy) {
    ctx.save();
    ctx.translate(x + (fx ? img.width : 0), y + (fy ? img.height : 0));
    ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  return api;
})();

/* ------------------------------------------------------------------
 * Procedural explosion frames (hot white core -> orange -> smoke)
 * ------------------------------------------------------------------ */
function bakeExplosion(name, size, frames, seed) {
  const ramp = ['#ffffff', '#fff6a0', '#ffd430', '#ff9424', '#f03a3a', '#a01c2c', '#5a2a40'];
  const rng = makeRng(seed);
  const noise = new Float32Array(size * size * frames);
  for (let i = 0; i < noise.length; i++) noise[i] = rng();
  const list = [];
  for (let f = 0; f < frames; f++) {
    const c = Sprites.makeCanvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const t = f / (frames - 1);
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    const rMax = size / 2;
    const r = rMax * (0.28 + 0.72 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5));
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = x - cx, dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        const nz = noise[(f * size + y) * size + x];
        const edge = r * (0.72 + 0.42 * nz);
        if (d > edge) continue;
        let heat = (d / (edge + 0.001)) * 0.75 + t * 0.95 + (nz - 0.5) * 0.25;
        if (t > 0.55 && d < r * 0.28 * (t - 0.4) * 2) continue; // hollow core late
        if (heat >= 1) continue;
        heat = Math.max(0, heat);
        const col = Sprites.toRgb(ramp[Math.min(ramp.length - 1, Math.floor(heat * ramp.length))]);
        const o = (y * size + x) * 4;
        img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    list.push(c);
  }
  Sprites.fromCanvases(name, list);
}
