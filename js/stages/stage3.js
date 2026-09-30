'use strict';
/* =============================================================
 * STAGE 3 — MOAI  (isle of stone giants, at dusk)
 *
 * Colossal moai heads are SOLID TERRAIN (silhouettes are stamped into the
 * collision mask in shapes(), shaded in decorate()).  Every active head owns a
 * ghost emitter `s3_mouth` that spits shootable ion rings.
 * ============================================================= */
(function stage3() {
  /* ---------- tiny helpers ---------- */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const rgb32 = (css) => Terrain.rgb32(css);
  const s3_ad = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  };
  const s3_cn = (e, n) => (e.carry ? n + '_c' : n);

  /* =============================================================
   * MOAI HEAD GENERATOR
   * A head is modelled as a silhouette (facing left) + a small height field
   * (brow, nose, lips, sockets, ear ...).  The height field is lit from the top
   * left and quantised to a few stone tones, so heads that hang upside-down
   * from the ceiling are re-lit correctly instead of just mirrored.
   * ============================================================= */
  const HEAD_PAL = {
    stone: { out: '#1e0f0a', c: ['#4a2a1e', '#7a5034', '#a87c4e', '#d4a66a', '#f4d89c'] },
    hat: { out: '#1e0f0a', c: ['#3a1a16', '#64302a', '#8e4a38', '#b8684a', '#dc906a'] },
    terra: { out: '#2a0a0c', c: ['#5a1a1e', '#8c3428', '#c65c3a', '#ec8c56', '#ffc48c'] },
    that: { out: '#1c0a12', c: ['#2c1024', '#4c1c38', '#70304e', '#98485e', '#c47080'] },
  };
  const MOSS = ['#3f5a24', '#5f7f34', '#8fae4a'];

  function s3_buildHead(o) {
    const h = o.h;
    const flip = !!o.flip;
    const rng = makeRng(o.seed || 1);
    const hatH = o.hat ? Math.max(6, Math.round(h * 0.15)) : 0;
    const ax = Math.ceil(h * 0.36) + 2;
    const w = ax * 2;
    const hh = hatH + h;
    const N = w * hh;
    const pal = HEAD_PAL[o.pal || 'stone'];
    const hpal = HEAD_PAL[o.hpal || 'hat'];
    const F = (nx) => ax + nx * h;
    const Y = (ny) => hatH + ny * h;
    const A = Math.pow(h / 60, 0.55); // amplitude scale

    /* ---- 1. silhouette (upright, facing left) ---- */
    const sil = new Uint8Array(N);
    const mat = new Uint8Array(N);
    const jit = (a) => 1 + (rng() - 0.5) * a;
    const kB = jit(0.16), kN = jit(0.2), kC = jit(0.16);
    const front = [
      [-0.2, 0.0], [-0.226, 0.035], [-0.236, 0.14],
      [-0.236 - 0.052 * kB, 0.19], [-0.236 - 0.06 * kB, 0.25], [-0.226, 0.285],
      [-0.24, 0.36], [-0.245 - 0.085 * kN, 0.485], [-0.245 - 0.075 * kN, 0.525], [-0.25, 0.548],
      [-0.272, 0.575], [-0.242, 0.605], [-0.268, 0.635], [-0.242, 0.685],
      [-0.242 - 0.062 * kC, 0.735], [-0.238 - 0.052 * kC, 0.795], [-0.205, 0.822], [-0.198, 0.86],
      [-0.255, 0.93], [-0.31, 1.0],
    ];
    const back = [
      [0.31, 1.0], [0.27, 0.93], [0.222, 0.86], [0.226, 0.8], [0.24, 0.7], [0.256, 0.45], [0.256, 0.1], [0.24, 0.03], [0.212, 0.0],
    ];
    const pts = front.concat(back).map(([nx, ny]) => [F(nx), Y(ny)]);
    for (let y = 0; y < hh; y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) if (x >= 0 && x < w) sil[y * w + x] = 1;
    }
    if (hatH) {
      // pukao (topknot): a short cylinder that overhangs the head a little
      const x0 = Math.round(F(-0.225)), x1 = Math.round(F(0.235));
      for (let y = 0; y < hatH; y++) {
        for (let x = x0; x < x1; x++) {
          if (y === 0 && (x < x0 + 2 || x >= x1 - 2)) continue;
          if (y === 1 && (x < x0 + 1 || x >= x1 - 1)) continue;
          sil[y * w + x] = 1;
          mat[y * w + x] = 1;
        }
      }
    }

    /* ---- 2. height field features (upright frame) ---- */
    const Ef = new Float32Array(N);
    const dome = (nx, ny, nrx, nry, amp, pw = 0.6) => {
      const cx = F(nx), cy = Y(ny), rx = Math.max(1.3, nrx * h), ry = Math.max(1.1, nry * h);
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        if (y < 0 || y >= hh) continue;
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          if (x < 0 || x >= w) continue;
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          const q = 1 - dx * dx - dy * dy;
          if (q > 0) Ef[y * w + x] += amp * A * Math.pow(q, pw);
        }
      }
    };
    const cap = (nx0, ny0, nx1, ny1, nr, amp, pw = 0.7) => {
      const x0 = F(nx0), y0 = Y(ny0), x1 = F(nx1), y1 = Y(ny1), r = Math.max(1.0, nr * h);
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
      const xa = Math.floor(Math.min(x0, x1) - r), xb = Math.ceil(Math.max(x0, x1) + r);
      const ya = Math.floor(Math.min(y0, y1) - r), yb = Math.ceil(Math.max(y0, y1) + r);
      for (let y = ya; y <= yb; y++) {
        if (y < 0 || y >= hh) continue;
        for (let x = xa; x <= xb; x++) {
          if (x < 0 || x >= w) continue;
          const px = x + 0.5, py = y + 0.5;
          let t = ((px - x0) * dx + (py - y0) * dy) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t);
          const q = 1 - (ex * ex + ey * ey) / (r * r);
          if (q > 0) Ef[y * w + x] += amp * A * Math.pow(q, pw);
        }
      }
    };
    // forehead / cheeks
    dome(0.0, 0.12, 0.2, 0.1, 0.7, 1);
    dome(-0.05, 0.47, 0.115, 0.06, 1.7, 0.8);
    // heavy brow
    cap(-0.29, 0.235, 0.1, 0.235, 0.05, 3.6);
    // eye sockets (near / far)
    dome(-0.045, 0.325, 0.095, 0.042, -5.2, 0.5);
    dome(-0.215, 0.322, 0.038, 0.034, -4.2, 0.5);
    // long nose + tip + nostril
    cap(-0.19, 0.29, -0.29, 0.49, 0.05, 3.4);
    dome(-0.3, 0.495, 0.05, 0.045, 2.0, 0.6);
    dome(-0.255, 0.532, 0.026, 0.02, -2.4, 0.6);
    // thin lips + mouth groove
    cap(-0.27, 0.576, -0.03, 0.576, 0.022, 1.9);
    cap(-0.245, 0.607, 0.03, 0.607, 0.012, -2.8, 0.6);
    cap(-0.265, 0.641, -0.06, 0.641, 0.024, 1.9);
    // jutting chin
    dome(-0.225, 0.745, 0.09, 0.06, 2.3, 0.6);
    // ear (raised slab with an inner groove)
    cap(0.135, 0.3, 0.135, 0.585, 0.048, 3.0, 0.6);
    cap(0.14, 0.34, 0.14, 0.54, 0.018, -1.7, 0.6);
    // jaw line and neck grooves
    cap(0.115, 0.6, -0.08, 0.77, 0.014, -1.1);
    cap(-0.17, 0.878, 0.2, 0.878, 0.012, -1.5);
    cap(-0.2, 0.938, 0.24, 0.938, 0.012, -1.5);
    if (hatH) {
      // cylinder shading + groove where the knot meets the head
      for (let y = 0; y < hatH; y++)
        for (let x = 0; x < w; x++) {
          if (!mat[y * w + x]) continue;
          const u = (x + 0.5 - F(0.005)) / (h * 0.24);
          Ef[y * w + x] += 3.2 * (1 - u * u) - (y >= hatH - 2 ? 1.6 : 0);
        }
    }
    let gemPos = null;
    if (o.gem) {
      dome(-0.075, 0.135, 0.06, 0.05, 2.4, 0.6);
      gemPos = { x: F(-0.075), y: Y(0.135) };
    }

    /* ---- 3. details (upright): mouth line, nostril, cracks ---- */
    const det = new Uint8Array(N); // 1 dark line, 2 mouth glow slot, 3 crack, 4 socket core
    const setDet = (x, y, v) => {
      x = Math.round(x); y = Math.round(y);
      if (x >= 0 && x < w && y >= 0 && y < hh && sil[y * w + x]) det[y * w + x] = v;
    };
    const mY = Y(0.606);
    for (let x = Math.round(F(-0.24)); x <= Math.round(F(0.02)); x++) {
      const t = (x - F(-0.24)) / (F(0.02) - F(-0.24));
      setDet(x, mY + (t > 0.86 ? 1 : 0), 1); // corners turn down
    }
    setDet(F(-0.262), Y(0.532), 1);
    setDet(F(-0.24), Y(0.538), 1);
    // eye socket cores
    const eyeN = { x: F(-0.045), y: Y(0.327) }, eyeF = { x: F(-0.215), y: Y(0.322) };
    for (const [e, rx, ry] of [[eyeN, 0.07 * h, 0.028 * h], [eyeF, 0.026 * h, 0.022 * h]]) {
      for (let y = Math.floor(e.y - ry - 1); y <= Math.ceil(e.y + ry + 1); y++)
        for (let x = Math.floor(e.x - rx - 1); x <= Math.ceil(e.x + rx + 1); x++) {
          const dx = (x + 0.5 - e.x) / Math.max(1, rx), dy = (y + 0.5 - e.y) / Math.max(0.8, ry);
          if (dx * dx + dy * dy <= 1) setDet(x, y, 4);
        }
    }
    const nCracks = o.cracks === undefined ? 2 : o.cracks;
    for (let k = 0; k < nCracks; k++) {
      let cx = F(-0.16 + rng() * 0.36), cy = Y(0.0 + rng() * 0.05);
      const len = Math.round(h * (0.16 + rng() * 0.2));
      let dx = rng() < 0.5 ? -1 : 1;
      for (let i = 0; i < len; i++) {
        if (cy > Y(0.3) && cy < Y(0.62) && Math.abs(cx - F(0.0)) < h * 0.15) break; // do not scar the face
        setDet(cx, cy, 3);
        const r = rng();
        if (r < 0.62) cy += 1;
        else cx += dx;
        if (rng() < 0.18) dx = -dx;
      }
    }

    /* ---- 4. flip for hanging heads (geometry only; lighting is redone) ---- */
    const flipArr = (arr, T) => {
      const out = new T(N);
      for (let y = 0; y < hh; y++) out.set(arr.subarray((hh - 1 - y) * w, (hh - y) * w), y * w);
      return out;
    };
    let S = sil, M = mat, Ff = Ef, D = det;
    if (flip) {
      S = flipArr(sil, Uint8Array);
      M = flipArr(mat, Uint8Array);
      Ff = flipArr(Ef, Float32Array);
      D = flipArr(det, Uint8Array);
    }
    const base = flip ? 't' : 'b';
    const inside = (x, y) => {
      if (x < 0 || x >= w) return false;
      if (y < 0) return base === 't';
      if (y >= hh) return base === 'b';
      return S[y * w + x] === 1;
    };

    /* ---- 5. distance to the silhouette edge -> bevel ---- */
    const R = 5;
    const dist = new Float32Array(N);
    for (let y = 0; y < hh; y++)
      for (let x = 0; x < w; x++) {
        if (!S[y * w + x]) continue;
        let best = R + 1;
        for (let dy = -R; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            if (!inside(x + dx, y + dy)) {
              const d = Math.sqrt(dx * dx + dy * dy);
              if (d < best) best = d;
            }
          }
        dist[y * w + x] = best;
      }
    const E = new Float32Array(N);
    for (let i = 0; i < N; i++) if (S[i]) E[i] = Math.min(Math.max(dist[i] - 1, 0), R - 1) * 0.95 + Ff[i];
    // light blur (inside only) so the shading is not noisy
    const E2 = new Float32Array(N);
    for (let y = 0; y < hh; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!S[i]) continue;
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || xx >= w || yy < 0 || yy >= hh) { s += E[i]; n++; continue; }
            const j = yy * w + xx;
            s += S[j] ? E[j] : 0;
            n++;
          }
        E2[i] = E[i] * 0.5 + (s / n) * 0.5;
      }

    /* ---- 6. lighting -> tones ---- */
    const Lx = -0.62, Ly = -0.55, Lz = 0.56;
    const tone = new Int8Array(N).fill(-1);
    const Eat = (x, y) => (x < 0 || x >= w || y < 0 || y >= hh ? 0 : E2[y * w + x]);
    for (let y = 0; y < hh; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!S[i]) continue;
        const gx = (Eat(x + 1, y) - Eat(x - 1, y)) * 0.5, gy = (Eat(x, y + 1) - Eat(x, y - 1)) * 0.5;
        const nz = 1 / Math.sqrt(1 + gx * gx + gy * gy);
        let dot = nz * (-gx * Lx - gy * Ly + Lz);
        dot += (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.08;
        let t = dot < 0.2 ? 0 : dot < 0.42 ? 1 : dot < 0.68 ? 2 : dot < 0.87 ? 3 : 4;
        const f = Ff[i] / A;
        if (f < -2.3) t--;
        if (f < -3.9) t--;
        tone[i] = Math.max(0, t);
      }
    // mode filter: kill isolated specks
    const tone2 = tone.slice();
    for (let y = 1; y < hh - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!S[i]) continue;
        let same = 0;
        const cnt = [0, 0, 0, 0, 0];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const j = i + dy * w + dx;
            if (!S[j]) continue;
            cnt[tone[j]]++;
            if (tone[j] === tone[i]) same++;
          }
        if (same <= 1) {
          let bi = tone[i], bc = 0;
          for (let k = 0; k < 5; k++) if (cnt[k] > bc) { bc = cnt[k]; bi = k; }
          if (bc >= 4) tone2[i] = bi;
        }
      }

    /* ---- 7. colours ---- */
    const img = new ImageData(w, hh);
    const out = new Uint32Array(img.data.buffer);
    const msk = new ImageData(w, hh);
    const mo = new Uint32Array(msk.data.buffer);
    const cOut = rgb32(pal.out), cHOut = rgb32(hpal.out);
    const cs = pal.c.map(rgb32), ch = hpal.c.map(rgb32);
    const cCrack = cs[0];
    const cMouth = rgb32(pal.out);
    const cSock = rgb32(pal.out);
    for (let y = 0; y < hh; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!S[i]) continue;
        mo[i] = 0xffffffff;
        const isHat = M[i] === 1;
        let c;
        if (dist[i] <= 1.01) c = isHat ? cHOut : cOut;
        else if (D[i] === 1) c = cMouth;
        else if (D[i] === 4) c = cSock;
        else if (D[i] === 3) c = cCrack;
        else c = (isHat ? ch : cs)[tone2[i]];
        out[i] = c;
      }
    // hat / head seam: dark line under the knot
    for (let y = 0; y < hh; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!S[i] || M[i] !== 1) continue;
        const below = flip ? i - w : i + w;
        if (below >= 0 && below < N && S[below] && M[below] === 0 && dist[i] > 1.01) out[i] = cHOut;
      }
    // moss: a few olive clusters on the lit surfaces / in the crevices
    const mossN = o.moss === undefined ? 2 : o.moss;
    const mc = MOSS.map(rgb32);
    for (let k = 0; k < mossN; k++) {
      for (let tries = 0; tries < 40; tries++) {
        const x = Math.floor(rng() * w), yUp = Math.floor(hatH + rng() * h * 0.62);
        const y = flip ? hh - 1 - yUp : yUp;
        const i = y * w + x;
        if (!S[i] || M[i] || dist[i] < 2 || D[i]) continue;
        if (tone2[i] < 2) continue;
        const n = 5 + Math.floor(rng() * 8);
        let cx = x, cy = y;
        for (let m = 0; m < n; m++) {
          const j = cy * w + cx;
          if (cx > 0 && cx < w - 1 && cy > 0 && cy < hh - 1 && S[j] && !M[j] && !D[j] && dist[j] > 1.5) out[j] = mc[1 + ((cx + cy + m) % 3 === 0 ? 1 : 0)];
          const r = rng();
          if (r < 0.4) cx += 1;
          else if (r < 0.7) cx -= 1;
          else cy += rng() < 0.5 ? 1 : -1;
        }
        out[i] = mc[2];
        break;
      }
    }
    // base contact: dither the last rows away so the terrain texture flows into the statue
    if (!o.noFade) {
      for (let k = 0; k < 3; k++) {
        const y = flip ? k : hh - 1 - k;
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!S[i]) continue;
          const keep = [0.0, 0.34, 0.68][k];
          if (BAYER[(y & 3) * 4 + (x & 3)] >= keep) continue;
          out[i] = 0;
        }
      }
    }
    const art = Sprites.makeCanvas(w, hh);
    art.getContext('2d').putImageData(img, 0, 0);
    const mask = Sprites.makeCanvas(w, hh);
    mask.getContext('2d').putImageData(msk, 0, 0);

    /* ---- 8. anchors (in final sprite coordinates) ---- */
    const fy = (y) => (flip ? hh - 1 - Math.round(y) : Math.round(y));
    const rowFront = (y) => {
      for (let x = 0; x < w; x++) if (S[y * w + x]) return x;
      return ax;
    };
    const mouthRow = fy(mY);
    const info = {
      art, mask, w, h: hh, ax, hatH, flip,
      mouth: { x: rowFront(mouthRow), y: mouthRow },
      eyes: [{ x: Math.round(eyeN.x), y: fy(eyeN.y) }, { x: Math.round(eyeF.x), y: fy(eyeF.y) }],
      gem: gemPos ? { x: Math.round(gemPos.x), y: fy(gemPos.y) } : null,
      // face rows/columns (final coords) used by the mother's mouth animation
      mouthX0: Math.round(F(-0.245)), mouthX1: Math.round(F(0.02)),
    };
    return info;
  }
  window.s3_buildHead = s3_buildHead; // (debug hook for the preview tools)

  // preview registrations so the gallery tool can show the heads
  const previews = [[44, 1, 0], [60, 2, 1], [76, 3, 0]];
  previews.forEach(([h, seed, hat]) => {
    const a = s3_buildHead({ h, seed, hat, cracks: 2, moss: 2 });
    Sprites.fromCanvases('s3_pv_head' + h, [a.art]);
    const b = s3_buildHead({ h, seed: seed + 5, hat: 0, flip: true, cracks: 2, moss: 2 });
    Sprites.fromCanvases('s3_pv_hang' + h, [b.art]);
  });
  const mo = s3_buildHead({ h: 50, seed: 4, hat: 1, pal: 'terra', hpal: 'that', gem: 1, cracks: 0, moss: 0, noFade: 1 });
  Sprites.fromCanvases('s3_pv_mother', [mo.art]);

  STAGES.push({
    id: 3, name: 'MOAI', sub: 'ISLE OF STONE GIANTS', music: 'stage3', bossMusic: 'boss', scroll: 0.65, bossX: 3700,
    checkpoints: [0, 800, 1600, 2300, 3300],
    terrain: () => ({ length: 4100, floor: [{ type: 'flat', x0: 0, x1: 4100, h: 30 }], skin: { kind: 'rock', pal: ['#2e1a14', '#48281c', '#643a26', '#84502f', '#a66d3f'] } }),
    background: () => Backgrounds.make([{ kind: 'gradient', stops: [[0, '#0e1440'], [1, '#ffc060']], steps: 20 }]),
    script(S) { S.boss(3700, 'bigcore', { level: 3 }); },
  });
})();
