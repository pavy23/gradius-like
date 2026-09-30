'use strict';
/* =============================================================
 * Terrain: solid scenery you die on when you touch it.
 *
 * A terrain is described by
 *   floor / ceil : arrays of height "features" (see FEATURES below)
 *   shapes(g,T)  : optional, draw extra solid shapes on the mask canvas
 *   skin         : how the solid pixels are painted
 *   decorate(g,T): optional, paint decorations after skinning
 * and is baked into one big offscreen canvas (visual) plus a byte mask
 * (collision), so any shape is possible and drawing costs one drawImage.
 *
 *   const T = Terrain.build(def);
 *   T.solid(worldX, y)  T.rect(worldX, y, w, h)
 *   T.floorTop(worldX) -> y of the floor surface (H when there is none)
 *   T.ceilBottom(worldX) -> y of the ceiling surface (0 when there is none)
 * ============================================================= */
const Terrain = (() => {
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

  const rgb32 = (css) => {
    const c = Sprites.toRgb(css);
    return (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]; // little-endian ABGR
  };

  /* ---------------- height features ---------------- */
  // every feature returns a function x -> height (0 outside its range)
  const FEATURES = {
    flat: (f) => (x) => (x >= f.x0 && x <= f.x1 ? f.h : 0),
    slope: (f) => (x) => (x >= f.x0 && x <= f.x1 ? lerp(f.h0, f.h1, (x - f.x0) / (f.x1 - f.x0)) : 0),
    /** shape: 'tri' | 'round' | 'mesa' | 'cos' */
    hill: (f) => {
      const r = f.w / 2;
      return (x) => {
        const t = Math.abs(x - f.x) / r;
        if (t > 1) return 0;
        switch (f.shape || 'round') {
          case 'tri': return f.h * (1 - t);
          case 'mesa': return f.h * clamp((1 - t) / (1 - (f.top === undefined ? 0.4 : f.top)), 0, 1);
          case 'cos': return f.h * (0.5 + 0.5 * Math.cos(Math.PI * t));
          default: return f.h * Math.sqrt(1 - t * t);
        }
      };
    },
    /** cone with a crater notch: {x,w,h,crater:{w,d}} */
    volcano: (f) => {
      const r = f.w / 2;
      const cw = (f.crater && f.crater.w) || f.w * 0.2;
      const cd = (f.crater && f.crater.d) || f.h * 0.14;
      return (x) => {
        const t = Math.abs(x - f.x) / r;
        if (t > 1) return 0;
        let h = f.h * Math.pow(1 - t, f.curve || 1.15);
        const dx = Math.abs(x - f.x);
        if (dx < cw / 2) h -= cd * (1 - dx / (cw / 2)) * (1 - dx / (cw / 2) * 0.2);
        return Math.max(0, h);
      };
    },
    /** fractal rock: {x0,x1,base,amp,scale,seed,edge} */
    noise: (f) => {
      const rng = makeRng(f.seed || 1);
      const sc = f.scale || 24;
      const range = f.x1 - f.x0;
      const mk = (cell) => Array.from({ length: Math.ceil(range / cell) + 3 }, () => rng());
      const l1 = mk(sc), l2 = mk(sc / 2), l3 = mk(sc / 4);
      const sm = (t) => t * t * (3 - 2 * t);
      const oct = (lat, u, cell) => {
        const fx = u / cell;
        const i = Math.floor(fx);
        return lerp(lat[i], lat[i + 1], sm(fx - i));
      };
      return (x) => {
        if (x < f.x0 || x > f.x1) return 0;
        const u = x - f.x0;
        const v = 0.62 * oct(l1, u, sc) + 0.28 * oct(l2, u, sc / 2) + 0.1 * oct(l3, u, sc / 4);
        const h = f.base + (v - 0.5) * 2 * f.amp;
        if (f.edge) return Math.max(0, h * Math.min(1, u / f.edge, (f.x1 - x) / f.edge)); // optional ease in/out
        return Math.max(0, h);
      };
    },
    steps: (f) => (x) => {
      if (x < f.x0 || x > f.x1) return 0;
      return f.h0 + Math.floor((x - f.x0) / f.stepW) * f.dh;
    },
    fn: (f) => (x) => (x >= f.x0 && x <= f.x1 ? f.fn(x) : 0),
    /** vertical column / pillar: {x,w,h} */
    pillar: (f) => (x) => (x >= f.x && x < f.x + f.w ? f.h : 0),
  };

  /* ---------------- noise helpers for textures ---------------- */
  function noiseField(w, h, cell, rng) {
    const gx = Math.max(1, Math.round(w / cell));
    const gy = Math.max(1, Math.round(h / cell));
    const lat = new Float32Array(gx * gy);
    for (let i = 0; i < lat.length; i++) lat[i] = rng();
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * gx, fy = (y / h) * gy;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        let tx = fx - x0, ty = fy - y0;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const a = lat[(y0 % gy) * gx + (x0 % gx)];
        const b = lat[(y0 % gy) * gx + ((x0 + 1) % gx)];
        const c = lat[((y0 + 1) % gy) * gx + (x0 % gx)];
        const d = lat[((y0 + 1) % gy) * gx + ((x0 + 1) % gx)];
        out[y * w + x] = lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
      }
    return out;
  }

  const ramp = (pal, v, x, y, strength = 0.9) => {
    const dith = (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) / pal.length * strength;
    return pal[clamp(Math.floor((v + dith) * pal.length), 0, pal.length - 1)];
  };

  /* ---------------- texture tiles (Uint32 ABGR) ---------------- */
  const TILES = {
    /** fractal rock with cracks (optionally glowing) */
    rock(sk, rng) {
      const w = sk.tw || 64, h = sk.th || 64;
      const pal = sk.pal.map(rgb32);
      const n1 = noiseField(w, h, 16, rng), n2 = noiseField(w, h, 8, rng), n3 = noiseField(w, h, 4, rng);
      const data = new Uint32Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let v = 0.5 * n1[y * w + x] + 0.32 * n2[y * w + x] + 0.18 * n3[y * w + x];
          v = clamp((v - 0.5) * (sk.contrast || 2.2) + 0.5, 0, 0.999);
          data[y * w + x] = ramp(pal, v, x, y);
        }
      const crack = sk.crack ? rgb32(sk.crack) : pal[0];
      const glow = sk.crackGlow ? rgb32(sk.crackGlow) : 0;
      for (let k = 0; k < (sk.cracks === undefined ? 7 : sk.cracks); k++) {
        let x = Math.floor(rng() * w), y = Math.floor(rng() * h);
        const len = 10 + Math.floor(rng() * 22);
        let dx = rng() < 0.5 ? -1 : 1;
        for (let i = 0; i < len; i++) {
          data[(((y % h) + h) % h) * w + (((x % w) + w) % w)] = crack;
          if (glow && rng() < 0.55) data[(((y + 1) % h + h) % h) * w + (((x % w) + w) % w)] = glow;
          const r = rng();
          if (r < 0.45) x += dx;
          else if (r < 0.8) y += 1;
          else y -= 1;
          if (rng() < 0.15) dx = -dx;
        }
      }
      const spk = sk.speckle ? rgb32(sk.speckle) : pal[pal.length - 1];
      for (let i = 0; i < w * h * 0.018; i++) data[Math.floor(rng() * w * h)] = spk;
      return { w, h, data };
    },

    /** masonry blocks with bevels: megaliths / walls */
    brick(sk, rng) {
      const bw = sk.bw || 24, bh = sk.bh || 12;
      const cols = 3, rows = 4;
      const w = bw * cols, h = bh * rows;
      const pal = sk.pal.map(rgb32);
      const nz = noiseField(w, h, 6, rng);
      const data = new Uint32Array(w * h);
      const mortar = sk.mortar ? rgb32(sk.mortar) : pal[0];
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * (bw >> 1);
        for (let c = -1; c <= cols; c++) {
          const x0 = c * bw + off, y0 = r * bh;
          const t = 1 + Math.floor(rng() * (pal.length - 2));
          for (let j = 0; j < bh; j++)
            for (let i = 0; i < bw; i++) {
              const X = (((x0 + i) % w) + w) % w, Y = y0 + j;
              let col;
              if (i === 0 || j === 0) col = mortar;
              else if (j === 1 || i === 1) col = pal[Math.min(pal.length - 1, t + 1)];
              else if (j === bh - 1 || i === bw - 1) col = pal[Math.max(0, t - 1)];
              else {
                const v = clamp((t + (nz[Y * w + X] - 0.5) * 2.4) / pal.length, 0, 0.999);
                col = ramp(pal, v, X, Y, 1.2);
              }
              data[Y * w + X] = col;
            }
        }
      }
      return { w, h, data };
    },

    /** riveted metal plating */
    metal(sk, rng) {
      const pw = sk.bw || 32, ph = sk.bh || 16;
      const cols = 2, rows = 4;
      const w = pw * cols, h = ph * rows;
      const pal = sk.pal.map(rgb32);
      const data = new Uint32Array(w * h);
      const nz = noiseField(w, h, 4, rng);
      const light = sk.light ? rgb32(sk.light) : rgb32('#ff4040');
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const x0 = c * pw, y0 = r * ph;
          const vent = rng() < 0.28;
          const t = 2 + Math.floor(rng() * Math.max(1, pal.length - 4));
          for (let j = 0; j < ph; j++)
            for (let i = 0; i < pw; i++) {
              let col;
              if (i === 0 || j === 0) col = pal[0];
              else if (i === 1 || j === 1) col = pal[Math.min(pal.length - 1, t + 2)];
              else if (i === pw - 1 || j === ph - 1) col = pal[Math.max(0, t - 1)];
              else col = ramp(pal, clamp((t + (nz[(y0 + j) * w + x0 + i] - 0.5) * 1.2) / pal.length, 0, 0.999), i, j, 0.6);
              if (vent && j > 3 && j < ph - 4 && i > 5 && i < pw - 6 && j % 2 === 0) col = pal[0];
              data[(y0 + j) * w + x0 + i] = col;
            }
          // rivets
          for (const [rx, ry] of [[3, 3], [pw - 4, 3], [3, ph - 4], [pw - 4, ph - 4]]) {
            data[(y0 + ry) * w + x0 + rx] = pal[Math.min(pal.length - 1, t + 3)];
            data[(y0 + ry + 1) * w + x0 + rx + 1] = pal[0];
          }
          if (rng() < 0.18) data[(y0 + 6) * w + x0 + pw - 8] = light;
        }
      return { w, h, data };
    },

    /** flesh: pink noise with veins and bumps */
    organic(sk, rng) {
      const w = sk.tw || 64, h = sk.th || 64;
      const pal = sk.pal.map(rgb32);
      const n1 = noiseField(w, h, 16, rng), n2 = noiseField(w, h, 6, rng);
      const data = new Uint32Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const v = clamp((0.6 * n1[y * w + x] + 0.4 * n2[y * w + x] - 0.5) * 2 + 0.5, 0, 0.999);
          data[y * w + x] = ramp(pal, v, x, y, 0.8);
        }
      const vein = sk.vein ? rgb32(sk.vein) : pal[0];
      for (let k = 0; k < 5; k++) {
        let x = Math.floor(rng() * w), y = Math.floor(rng() * h);
        let ang = rng() * TAU;
        for (let i = 0; i < 38; i++) {
          data[((Math.round(y) % h + h) % h) * w + ((Math.round(x) % w + w) % w)] = vein;
          ang += (rng() - 0.5) * 0.9;
          x += Math.cos(ang);
          y += Math.sin(ang);
        }
      }
      const hi = pal[pal.length - 1];
      for (let k = 0; k < 9; k++) {
        const cx = Math.floor(rng() * w), cy = Math.floor(rng() * h);
        data[(cy % h) * w + (cx % w)] = hi;
        data[(cy % h) * w + ((cx + 1) % w)] = hi;
      }
      return { w, h, data };
    },

    /** Worley cells with membranes and nuclei */
    cell(sk, rng) {
      const w = sk.tw || 64, h = sk.th || 64;
      const pal = sk.pal.map(rgb32);
      const n = sk.cells || 9;
      const pts = Array.from({ length: n }, () => [rng() * w, rng() * h]);
      const data = new Uint32Array(w * h);
      const mem = sk.membrane ? rgb32(sk.membrane) : pal[0];
      const nuc = sk.nucleus ? rgb32(sk.nucleus) : pal[1];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let d1 = 1e9, d2 = 1e9;
          for (const p of pts)
            for (let oy = -1; oy <= 1; oy++)
              for (let ox = -1; ox <= 1; ox++) {
                const dx = x - (p[0] + ox * w), dy = y - (p[1] + oy * h);
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
              }
          if (d2 - d1 < 2.2) data[y * w + x] = mem;
          else if (d1 < (sk.nr || 4)) data[y * w + x] = nuc;
          else data[y * w + x] = ramp(pal, clamp(0.25 + (1 - d1 / 22) * 0.75, 0, 0.999), x, y, 0.7);
        }
      return { w, h, data };
    },
  };

  /* ---------------- the terrain object ---------------- */
  class TerrainMap {
    constructor(def) {
      const L = (this.length = def.length);
      this.def = def;
      const sk = (this.skin = def.skin || {});
      const rng = makeRng(sk.seed || 7);

      // 1) height profiles
      this.floorH = new Float32Array(L);
      this.ceilH = new Float32Array(L);
      const applyList = (arr, list) => {
        for (const f of list || []) {
          const fn = (FEATURES[f.type || f.t] || (() => { throw new Error('Unknown terrain feature ' + (f.type || f.t)); }))(f);
          const x0 = Math.max(0, Math.floor(f.x0 !== undefined ? f.x0 : f.x - (f.w || 0) / 2));
          const x1 = Math.min(L - 1, Math.ceil(f.x1 !== undefined ? f.x1 : f.x + (f.w || 0) / 2));
          for (let x = x0; x <= x1; x++) {
            const v = fn(x);
            if (f.mode === 'add') { if (v > 0) arr[x] += v; } else if (v > arr[x]) arr[x] = v;
          }
        }
      };
      applyList(this.floorH, def.floor);
      applyList(this.ceilH, def.ceil);

      // 2) solid bitmap (row-major)
      const solid = new Uint8Array(L * H);
      if (def.shapes) {
        const mc = Sprites.makeCanvas(L, H);
        const g = mc.getContext('2d', { willReadFrequently: true });
        g.fillStyle = '#fff';
        def.shapes(g, this);
        const id = g.getImageData(0, 0, L, H).data;
        for (let i = 0; i < L * H; i++) if (id[i * 4 + 3] > 127) solid[i] = 1;
      }
      for (let x = 0; x < L; x++) {
        const fh = Math.round(this.floorH[x]);
        const ch = Math.round(this.ceilH[x]);
        for (let y = H - fh; y < H; y++) solid[y * L + x] = 1;
        for (let y = 0; y < ch; y++) solid[y * L + x] = 1;
      }
      this._solidRows = solid;

      // 3) collision mask (column-major for fast vertical scans)
      this.mask = new Uint8Array(L * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) if (solid[y * L + x]) this.mask[x * H + y] = 1;

      // 4) floor / ceiling surface tables
      this.floorTopArr = new Int16Array(L);
      this.ceilBotArr = new Int16Array(L);
      for (let x = 0; x < L; x++) {
        let y = H;
        while (y > 0 && this.mask[x * H + y - 1]) y--;
        this.floorTopArr[x] = y;
        let c = 0;
        while (c < H && this.mask[x * H + c]) c++;
        this.ceilBotArr[x] = c;
      }

      // 5) visual skin
      this.canvas = Sprites.makeCanvas(L, H);
      this._paint(solid, sk, rng);
      if (def.decorate) def.decorate(this.canvas.getContext('2d'), this);
      this._solidRows = null; // free
    }

    _paint(solid, sk, rng) {
      const L = this.length;
      const N = L * H;
      const dU = new Uint8Array(N), dD = new Uint8Array(N), dL = new Uint8Array(N), dR = new Uint8Array(N);
      const cap = 255;
      for (let x = 0; x < L; x++) {
        let run = 0;
        for (let y = 0; y < H; y++) {
          const i = y * L + x;
          if (!solid[i]) { run = 0; continue; }
          run = y === 0 ? cap : Math.min(cap, run + 1);
          dU[i] = run;
        }
        run = 0;
        for (let y = H - 1; y >= 0; y--) {
          const i = y * L + x;
          if (!solid[i]) { run = 0; continue; }
          run = y === H - 1 ? cap : Math.min(cap, run + 1);
          dD[i] = run;
        }
      }
      for (let y = 0; y < H; y++) {
        let run = 0;
        for (let x = 0; x < L; x++) {
          const i = y * L + x;
          if (!solid[i]) { run = 0; continue; }
          run = x === 0 ? cap : Math.min(cap, run + 1);
          dL[i] = run;
        }
        run = 0;
        for (let x = L - 1; x >= 0; x--) {
          const i = y * L + x;
          if (!solid[i]) { run = 0; continue; }
          run = x === L - 1 ? cap : Math.min(cap, run + 1);
          dR[i] = run;
        }
      }
      const kind = sk.kind || 'rock';
      const tile = (TILES[kind] || TILES.rock)(sk, rng);
      const tw = tile.w, th = tile.h, td = tile.data;
      const cOut = rgb32(sk.outline || '#100810');
      const cHi = rgb32(sk.hi || '#ffffff');
      const cHi2 = sk.hi2 ? rgb32(sk.hi2) : cHi;
      const cLo = rgb32(sk.lo || '#000000');
      const cBot = sk.bottomOutline ? rgb32(sk.bottomOutline) : cOut;
      // per-block vertical offsets break the visible repetition of the tile
      const shifts = Array.from({ length: Math.ceil(L / tw) + 2 }, () => Math.floor(rng() * th));
      const img = new ImageData(L, H);
      const out = new Uint32Array(img.data.buffer);
      const fade = sk.fade || 0;
      const cFade = sk.fadeColor ? rgb32(sk.fadeColor) : 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < L; x++) {
          const i = y * L + x;
          if (!solid[i]) continue;
          const u = dU[i], d = dD[i], l = dL[i], r = dR[i];
          const e = Math.min(u, d, l, r);
          let c;
          if (e === 1) c = d === 1 ? cBot : cOut;
          else if (e === 2 && u === 2) c = cHi;
          else if (e === 2 && l === 2) c = cHi2;
          else if (e === 2 && (d === 2 || r === 2)) c = cLo;
          else {
            const ty = (y + shifts[(x / tw) | 0]) % th;
            c = td[ty * tw + (x % tw)];
            if (fade && e > fade && cFade && ((x + y) & 1) === 0 && e < fade * 3) c = cFade;
          }
          out[i] = c;
        }
      this.canvas.getContext('2d').putImageData(img, 0, 0);
    }

    solid(wx, y) {
      wx = wx | 0;
      y = y | 0;
      if (wx < 0 || wx >= this.length || y < 0 || y >= H) return false;
      return this.mask[wx * H + y] === 1;
    }
    /** any solid pixel inside the rectangle [wx, wx+w) x [y, y+h) */
    rect(wx, y, w, h) {
      wx = Math.floor(wx);
      y = Math.floor(y);
      const x1 = Math.min(this.length, Math.ceil(wx + w));
      const y1 = Math.min(H, Math.ceil(y + h));
      for (let x = Math.max(0, wx); x < x1; x++) {
        const b = x * H;
        for (let yy = Math.max(0, y); yy < y1; yy++) if (this.mask[b + yy]) return true;
      }
      return false;
    }
    floorTop(wx) {
      wx = clamp(Math.round(wx), 0, this.length - 1);
      return this.floorTopArr[wx];
    }
    ceilBottom(wx) {
      wx = clamp(Math.round(wx), 0, this.length - 1);
      return this.ceilBotArr[wx];
    }
    /** smallest free vertical gap between ceiling and floor over [x0,x1] */
    minGap(x0, x1) {
      let m = H;
      for (let x = Math.max(0, x0); x <= Math.min(this.length - 1, x1); x++) m = Math.min(m, this.floorTopArr[x] - this.ceilBotArr[x]);
      return m;
    }
    draw(ctx, camX) {
      const sx = clamp(camX, 0, Math.max(0, this.length - W));
      ctx.drawImage(this.canvas, sx, 0, W, H, 0, 0, W, H);
    }
  }

  return {
    build: (def) => new TerrainMap(def),
    FEATURES,
    TILES,
    noiseField,
    rgb32,
  };
})();
