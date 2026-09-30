'use strict';
/* =============================================================
 * Parallax backgrounds, composed from layers:
 *
 *   const bg = Backgrounds.make([
 *     {kind:'gradient', stops:[[0,'#000010'],[1,'#401030']]},
 *     {kind:'stars', n:70, speed:0.08, drift:0.05},
 *     {kind:'ridge', color:'#301040', color2:'#180820', edge:'#602060', hMin:20, hMax:70, speed:0.3},
 *     {kind:'clouds', ...}, {kind:'strip', build:(period)=>canvas, speed:0.4, y:120},
 *     {kind:'custom', draw(ctx, camX, t){...}},
 *   ]);
 *   bg.draw(ctx, camX, frame);
 * ============================================================= */
const Backgrounds = (() => {
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const smooth = (t) => t * t * (3 - 2 * t);
  const rgb = (css) => Sprites.toRgb(css);
  const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  function sampleStops(stops, t) {
    if (t <= stops[0][0]) return rgb(stops[0][1]);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i];
        return mixRgb(rgb(a[1]), rgb(b[1]), (t - a[0]) / (b[0] - a[0] || 1));
      }
    }
    return rgb(stops[stops.length - 1][1]);
  }

  /* --- gradient (dithered, retro banding) --- */
  function bakeGradient(o) {
    const c = Sprites.makeCanvas(W, H);
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    const steps = o.steps || 14;
    const levels = [];
    for (let i = 0; i < steps; i++) levels.push(sampleStops(o.stops, i / (steps - 1)));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const f = (y / (H - 1)) * (steps - 1);
        const idx = clamp(Math.floor(f + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.95 + 0.5), 0, steps - 1);
        const col = levels[idx];
        const p = (y * W + x) * 4;
        img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* --- ridge / mountain silhouette strip --- */
  function bakeRidge(o) {
    const P = o.period || 512;
    const rng = makeRng(o.seed || 1);
    const scale = o.scale || 40;
    const n = Math.ceil(P / scale);
    const lat1 = Array.from({ length: n }, rng);
    const lat2 = Array.from({ length: n * 2 }, rng);
    const c = Sprites.makeCanvas(P, H);
    const g = c.getContext('2d');
    const img = g.createImageData(P, H);
    const c1 = rgb(o.color || '#301040');
    const c2 = rgb(o.color2 || o.color || '#180820');
    const ce = o.edge ? rgb(o.edge) : null;
    for (let x = 0; x < P; x++) {
      const t1 = x / scale, i1 = Math.floor(t1);
      const v1 = lerp(lat1[i1 % n], lat1[(i1 + 1) % n], smooth(t1 - i1));
      const t2 = (x * 2) / scale, i2 = Math.floor(t2);
      const v2 = lerp(lat2[i2 % (n * 2)], lat2[(i2 + 1) % (n * 2)], smooth(t2 - i2));
      let v = 0.7 * v1 + 0.3 * v2;
      if (o.jag) v = lerp(v, 1 - Math.abs(2 * v - 1), o.jag); // ridged: pointy peaks
      const hgt = Math.round(lerp(o.hMin || 20, o.hMax || 60, clamp(v, 0, 1)));
      for (let k = 0; k < hgt; k++) {
        const y = o.top ? k : H - 1 - k;
        const depth = k / Math.max(1, hgt - 1);
        // depth 1 = at the surface edge, 0 = base; shade darker toward the base
        const surf = o.top ? 1 - (k / Math.max(1, hgt - 1)) : k / Math.max(1, hgt - 1);
        void depth;
        let col = mixRgb(c2, c1, clamp(surf * 1.2, 0, 1));
        const edgeRow = k === hgt - 1;
        if (edgeRow && ce) col = ce;
        else if (ce && k === hgt - 2 && ((x & 1) === 0)) col = mixRgb(col, ce, 0.5);
        const p = (y * P + x) * 4;
        img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* --- clouds strip --- */
  function bakeClouds(o) {
    const P = o.period || 512;
    const rng = makeRng(o.seed || 3);
    const y0 = o.y0 === undefined ? 20 : o.y0, y1 = o.y1 === undefined ? 120 : o.y1;
    const d = new Sprites.Painter(P, H, {});
    const cols = o.colors || ['#ffffff', '#c8d0e8', '#8890b8'];
    const nC = o.n || 8;
    for (let k = 0; k < nC; k++) {
      const cx = (k + rng() * 0.8) * (P / nC);
      const cy = y0 + rng() * (y1 - y0);
      const blobs = 3 + Math.floor(rng() * 4);
      const base = cy + 6;
      const parts = [];
      for (let b = 0; b < blobs; b++) {
        const r = 5 + rng() * 8;
        parts.push({ x: cx + (b - blobs / 2) * 9 * (o.spread || 1), y: base - r * 0.7 - rng() * 4, r });
      }
      for (const [dx, dy, col] of [[0, 3, cols[2]], [0, 1, cols[1]], [-1, -1, cols[0]]]) {
        for (const p of parts) {
          for (let yy = Math.floor(p.y - p.r); yy <= p.y + p.r; yy++)
            for (let xx = Math.floor(p.x - p.r * 1.3); xx <= p.x + p.r * 1.3; xx++) {
              const a = (xx - p.x) / (p.r * 1.3), b = (yy - p.y) / p.r;
              if (a * a + b * b <= 1 && yy + dy <= base + (col === cols[2] ? 2 : 0)) {
                const X = (((xx + dx) % P) + P) % P;
                d.px(X, yy + dy, col);
              }
            }
        }
      }
    }
    return d.c;
  }

  /* --- star field --- */
  function makeStars(o) {
    const rng = makeRng(o.seed || 5);
    const span = W + 32;
    const stars = [];
    const cols = o.colors || ['#ffffff', '#a8c8ff', '#ffe0a0'];
    for (let i = 0; i < (o.n || 60); i++) {
      stars.push({
        x: rng() * span,
        y: (o.ymin || 0) + rng() * ((o.ymax || H) - (o.ymin || 0)),
        c: cols[Math.floor(rng() * cols.length)],
        p: rng() * TAU,
        big: rng() < (o.big || 0.12),
      });
    }
    return { stars, span };
  }

  function make(layers) {
    const L = layers.map((o) => {
      const layer = { o };
      switch (o.kind) {
        case 'gradient':
          layer.img = bakeGradient(o);
          break;
        case 'ridge':
          layer.img = bakeRidge(o);
          break;
        case 'clouds':
          layer.img = bakeClouds(o);
          break;
        case 'strip':
          layer.img = o.build(o.period || 512);
          break;
        case 'stars':
          Object.assign(layer, makeStars(o));
          break;
        default:
          break;
      }
      return layer;
    });

    return {
      layers: L,
      draw(ctx, camX, t) {
        for (const l of L) {
          const o = l.o;
          switch (o.kind) {
            case 'gradient':
              ctx.drawImage(l.img, 0, 0);
              break;
            case 'ridge':
            case 'clouds':
            case 'strip': {
              const P = l.img.width;
              const off = Math.floor(camX * (o.speed || 0.3) + t * (o.drift || 0)) % P;
              const y = o.y || 0;
              ctx.drawImage(l.img, -off, y);
              if (P - off < W) ctx.drawImage(l.img, P - off, y);
              break;
            }
            case 'stars': {
              const shift = camX * (o.speed || 0.1) + t * (o.drift || 0);
              for (const s of l.stars) {
                let x = (s.x - shift) % l.span;
                if (x < 0) x += l.span;
                if (x >= W) continue;
                const tw = o.twinkle === false ? 1 : Math.sin(t * 0.07 + s.p);
                if (tw < -0.75) continue;
                ctx.fillStyle = s.c;
                if (s.big) {
                  ctx.fillRect(Math.floor(x) - 1, Math.floor(s.y), 3, 1);
                  ctx.fillRect(Math.floor(x), Math.floor(s.y) - 1, 1, 3);
                } else {
                  ctx.fillRect(Math.floor(x), Math.floor(s.y), 1, 1);
                }
              }
              break;
            }
            case 'custom':
              o.draw(ctx, camX, t);
              break;
            default:
              break;
          }
        }
      },
    };
  }

  return { make, bakeGradient, bakeRidge, bakeClouds };
})();
