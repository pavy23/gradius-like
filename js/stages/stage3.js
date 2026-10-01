'use strict';
/* =============================================================
 * STAGE 3 — MOAI  (isle of stone giants, at dusk)
 *
 * Colossal moai heads are SOLID TERRAIN (silhouettes are stamped into the
 * collision mask in shapes(), shaded in decorate()).  Every head owns a
 * ghost emitter `s3_mouth` that spits shootable ion rings.
 *
 * MAP (camX)   0 shore, gulls, first big statue
 *            340-725 the first ring spitters       830 checkpoint
 *           1095-1305 head field + overhang       1610 checkpoint
 *           1690-2310 quarry cave (statues hang from the ceiling and stand on the floor)
 *           2330 checkpoint   2440-2880 Mother and Child levitating over her ahu
 *           3090-3230 small statue + the colossus   3330 checkpoint (3 capsule carriers follow)
 *           3700 BOSS: TIDE COLOSSUS, a giant moai head bobbing in the surf of a calm beach at twilight
 *                (its weak point, a stone in the throat, is only bare while the tide lifts the mouth out of the sea)
 * ============================================================= */
(function stage3() {
  /* ---------- tiny helpers ---------- */
  const S3_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const s3_rgb32 = (css) => Terrain.rgb32(css);
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
  const S3_HEAD_PAL = {
    stone: { out: '#1e0f0a', c: ['#4a2a1e', '#7a5034', '#a87c4e', '#d4a66a', '#f4d89c'] },
    hat: { out: '#1e0f0a', c: ['#3a1a16', '#64302a', '#8e4a38', '#b8684a', '#dc906a'] },
    terra: { out: '#2a0a0c', c: ['#5a1a1e', '#8c3428', '#c65c3a', '#ec8c56', '#ffc48c'] },
    that: { out: '#1c0a12', c: ['#2c1024', '#4c1c38', '#70304e', '#98485e', '#c47080'] },
  };
  const S3_MOSS = ['#3f5a24', '#5f7f34', '#8fae4a'];

  /** moai silhouette in head-relative units (x: -front..+back, y: 0 = top of head .. 1 = base) */
  function s3_headPoly(kB, kN, kC) {
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
    return [front, back];
  }

  function s3_buildHead(o) {
    const h = o.h;
    const flip = !!o.flip;
    const rng = makeRng(o.seed || 1);
    const hatH = o.hat ? Math.max(6, Math.round(h * 0.15)) : 0;
    const ax = Math.ceil(h * 0.36) + 2;
    const w = ax * 2;
    const hh = hatH + h;
    const N = w * hh;
    const pal = S3_HEAD_PAL[o.pal || 'stone'];
    const hpal = S3_HEAD_PAL[o.hpal || 'hat'];
    const F = (nx) => ax + nx * h;
    const Y = (ny) => hatH + ny * h;
    const A = Math.pow(h / 60, 0.55); // amplitude scale

    /* ---- 1. silhouette (upright, facing left) ---- */
    const sil = new Uint8Array(N);
    const mat = new Uint8Array(N);
    const jit = (a) => 1 + (rng() - 0.5) * a;
    const kB = jit(0.16), kN = jit(0.2), kC = jit(0.16);
    const [front, back] = s3_headPoly(kB, kN, kC);
    const fillPoly = (arr, poly, val) => {
      for (let y = 0; y < hh; y++) {
        const yc = y + 0.5;
        const xs = [];
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length];
          if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) if (x >= 0 && x < w) arr[y * w + x] = val;
      }
    };
    fillPoly(sil, front.concat(back).map(([nx, ny]) => [F(nx), Y(ny)]), 1);
    // weathering: a chipped corner, a broken nose or a knocked-off chin (silhouette variety)
    const chips = {
      top: [[0.02, -0.02], [0.28, -0.02], [0.28, 0.13]],
      nose: [[-0.4, 0.44], [-0.305, 0.44], [-0.32, 0.5], [-0.4, 0.55]],
      chin: [[-0.4, 0.7], [-0.29, 0.7], [-0.27, 0.76], [-0.4, 0.83]],
    };
    if (o.chip && chips[o.chip]) fillPoly(sil, chips[o.chip].map(([nx, ny]) => [F(nx), Y(ny)]), 0);
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
        dot += (S3_BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.08;
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
    const cOut = s3_rgb32(pal.out), cHOut = s3_rgb32(hpal.out);
    const cs = pal.c.map(s3_rgb32), ch = hpal.c.map(s3_rgb32);
    const cCrack = cs[0];
    const cMouth = s3_rgb32(pal.out);
    const cSock = s3_rgb32(pal.out);
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
    const mc = S3_MOSS.map(s3_rgb32);
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
          if (S3_BAYER[(y & 3) * 4 + (x & 3)] >= keep) continue;
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
  /* =============================================================
   * ENEMY / BULLET ART
   * ============================================================= */
  // ion ring: 4-frame pulsing torus, cyan/white with a dark-blue rim (reads on every sky colour)
  Sprites.painted('s3_ring', 11, 11, 4, (d, f) => {
    const rr = [4.6, 5.0, 5.4, 5.0][f];
    const spin = f * (Math.PI / 4);
    for (let y = 0; y < 11; y++)
      for (let x = 0; x < 11; x++) {
        const dx = x - 5, dy = y - 5, r = Math.sqrt(dx * dx + dy * dy);
        if (r > rr || r <= rr - 3) continue;
        let col;
        if (r > rr - 1) col = 'B';
        else if (r > rr - 2) col = 'c';
        else col = 'w';
        const a = Math.atan2(dy, dx);
        if (col !== 'B' && (Math.abs(s3_ad(a, spin)) < 0.5 || Math.abs(s3_ad(a, spin + Math.PI)) < 0.5)) col = col === 'c' ? 'w' : 'c';
        d.px(x, y, col);
      }
  });

  // side-view gull: near wing (light, dark tip) + far wing (shaded), wings up / mid / down / mid
  Sprites.painted('s3_bird', 17, 13, 4, (d, f) => {
    const nearTip = [[13, 0], [15, 3], [13, 12], [15, 9]][f];
    const farTip = [[7, 0], [8, 2], [6, 12], [8, 10]][f];
    const up = f < 2;
    // far wing (darker, behind the body)
    d.poly([[6, 6.5], [farTip[0] - 1.6, farTip[1]], [farTip[0] + 0.6, farTip[1]], [9.5, 6.5]], 'G');
    d.px(farTip[0] - 1, farTip[1], 'd');
    // tail
    d.poly([[12, 6.2], [16, 5.6], [15.2, 7.4], [16, 8.6], [12, 8]], 'g');
    d.px(16, 7, 'd');
    // body + head
    d.ellipse(8.6, 7.2, 4.6, 2.3, 'W');
    d.ellipse(8.3, 6.7, 3.6, 1.4, 'w');
    d.circle(4, 6.3, 2.2, 'w');
    d.px(3, 5, 'r');
    d.rect(1, 6, 2, 1, 'o'); d.px(0, 6, 'y'); d.px(1, 7, 'O');
    // near wing
    const yr = up ? 6 : 7.5;
    d.poly([[7.4, yr], [nearTip[0] - 2.4, nearTip[1]], [nearTip[0] + 1.2, nearTip[1]], [12.5, yr]], 'g');
    d.poly([[7.4, yr], [nearTip[0] - 2.4, nearTip[1]], [nearTip[0] - 0.4, nearTip[1]], [10.4, yr]], 'W');
    d.px(nearTip[0], nearTip[1], 'd'); d.px(nearTip[0] + 1, nearTip[1], 'd');
    d.px(nearTip[0] - 1, nearTip[1] + (up ? 1 : -1), 'd');
    d.outline('k');
  });
  Sprites.recolor('s3_bird', 's3_bird_c', { w: 'h', W: 'y', g: 'o', G: 'O', d: 'R', o: 'r', r: 'R' });

  // stone swooper: carved turquoise bird with striped blue wings and a golden hooked beak
  // (f0 wings up, f1 wings down, f2 dive: nose down, wings swept back)
  Sprites.painted('s3_swoop', 17, 13, 3, (d, f) => {
    if (f < 2) {
      const up = f === 0;
      const nt = up ? [13, 0] : [13, 12], ft = up ? [7, 0] : [6, 12];
      d.poly([[6, 6.5], [ft[0] - 1.8, ft[1]], [ft[0] + 0.8, ft[1]], [9.5, 6.5]], 'B');
      d.poly([[12, 6], [16, 4.6], [16, 8], [12, 7.8]], 'C');
      d.hline(13, 15, 6, 'B');
      d.ellipse(8.8, 7.2, 4.8, 2.6, 'C');
      d.ellipse(8.4, 6.6, 3.8, 1.4, 'c');
      d.circle(4.2, 6.2, 2.4, 'C');
      d.circle(3.9, 5.8, 1.6, 'c');
      d.px(4, 3, 'c'); d.px(5, 3, 'c'); d.px(6, 4, 'C'); // crest
      d.px(3, 5, 'y'); d.px(3, 6, 'w');
      d.rect(1, 6, 2, 1, 'y'); d.px(0, 6, 'y'); d.px(0, 7, 'o'); d.px(1, 7, 'o');
      const yr = up ? 6 : 8;
      d.poly([[7.4, yr], [nt[0] - 3, nt[1]], [nt[0] + 1.6, nt[1]], [12.6, yr]], 'b');
      d.poly([[7.4, yr], [nt[0] - 3, nt[1]], [nt[0] - 1, nt[1]], [10.6, yr]], 'c');
      for (const k of [0.4, 0.7]) d.hline(Math.round(lerp(8.4, nt[0] - 1, k)), Math.round(lerp(11.6, nt[0] + 1, k)), Math.round(lerp(yr, nt[1], k)), 'B');
      d.px(nt[0], nt[1], 'k'); d.px(nt[0] + 1, nt[1], 'k');
    } else {
      // dive: body slants down toward the head, wings folded back
      d.poly([[13, 3.5], [16, 2.5], [16.5, 5], [13, 6.4]], 'C');
      d.poly([[2, 8.5], [5, 5.6], [13, 3.2], [15, 5.5], [8, 10], [3, 11]], 'C');
      d.poly([[5, 6.6], [12.5, 4], [13.5, 5.3], [8, 9], [5, 9]], 'c');
      d.poly([[7, 7], [14.5, 8.5], [15.5, 10.5], [8, 10]], 'b');
      d.poly([[8, 5.5], [15, 1.5], [16, 3], [10, 6.8]], 'B');
      d.rect(1, 9, 2, 2, 'C');
      d.px(3, 8, 'y'); d.px(4, 8, 'w');
      d.rect(0, 10, 2, 1, 'y'); d.px(0, 11, 'o'); d.px(1, 11, 'o');
      d.px(3, 5, 'c'); d.px(4, 5, 'c'); // crest
    }
    d.outline('k');
  });
  Sprites.recolor('s3_swoop', 's3_swoop_c', { C: 'O', c: 'o', B: 'R', b: 'r', y: 'h', w: 'y' });

  // tiki totem turret (3 frames: idle / charging / firing), stands on a stone plinth
  Sprites.painted('s3_tiki', 16, 28, 3, (d, f) => {
    // plinth
    d.rect(1, 22, 14, 6, 'S');
    d.rect(2, 22, 12, 1, 't');
    d.rect(1, 27, 14, 1, 'T');
    d.rect(1, 23, 1, 4, 's');
    d.px(6, 25, 'T'); d.px(10, 24, 'T'); d.px(11, 25, 'T');
    // torso with stub arms
    d.rect(4, 15, 8, 7, 'n');
    d.rect(4, 15, 8, 1, 'l');
    d.rect(4, 15, 1, 7, 'l');
    d.rect(11, 16, 1, 6, 'N');
    d.rect(1, 16, 3, 5, 'N');
    d.rect(12, 16, 3, 5, 'N');
    d.rect(1, 16, 3, 1, 'n');
    d.rect(12, 16, 3, 1, 'n');
    d.hline(5, 10, 19, 'N');
    d.px(7, 17, 'y'); d.px(8, 17, 'y');
    // head block
    d.rect(3, 5, 10, 10, 'n');
    d.rect(3, 5, 10, 1, 'l');
    d.rect(3, 5, 1, 10, 'l');
    d.rect(12, 6, 1, 9, 'N');
    d.rect(3, 14, 10, 1, 'N');
    // brow + eyes
    d.rect(4, 7, 8, 1, 'N');
    const eye = f === 0 ? 'y' : 'w';
    d.rect(4, 8, 3, 3, eye);
    d.rect(9, 8, 3, 3, eye);
    d.px(5, 9, f === 0 ? 'r' : 'o'); d.px(10, 9, f === 0 ? 'r' : 'o');
    d.px(4, 10, f === 0 ? 'o' : 'y'); d.px(11, 10, f === 0 ? 'o' : 'y');
    // nose + mouth
    d.rect(7, 10, 2, 2, 'N');
    if (f === 0) {
      d.rect(5, 12, 6, 2, 'k');
      d.px(6, 12, 'w'); d.px(8, 12, 'w'); d.px(10, 12, 'w');
    } else {
      d.rect(5, 12, 6, 2, f === 1 ? 'o' : 'y');
      d.px(5, 12, 'w'); d.px(7, 12, 'w'); d.px(9, 12, 'w');
      d.hline(6, 10, 13, 'r');
    }
    // feather crest
    d.poly([[3, 5], [2, 0], [5, 4]], 'r');
    d.poly([[6, 5], [8, 0], [10, 5]], 'o');
    d.px(8, 1, 'y'); d.px(8, 2, 'y');
    d.poly([[11, 5], [14, 0], [13, 5]], 'r');
    d.outline('k');
  });
  Sprites.recolor('s3_tiki', 's3_tiki_c', { n: 'o', N: 'O', l: 'y', r: 'R' });

  // hopper: little stone toad (3 frames: sit / crouch / leap), faces left
  const S3_HOP = { a: '#c4b6de', b: '#9482b8', c: '#66568c', e: '#3a2c58' };
  Sprites.painted('s3_hopper', 15, 12, 3, (d, f) => {
    const P = (x, y, k) => d.px(x, y, S3_HOP[k]);
    const R = (x, y, w, h, k) => d.rect(x, y, w, h, S3_HOP[k]);
    const dy = f === 1 ? 1.5 : 0; // crouch: body sinks
    if (f === 2) {
      // leap: stretched body, legs trailing / reaching
      d.ellipse(7.6, 5.6, 6.4, 3.2, S3_HOP.c);
      d.ellipse(7.4, 5.1, 5.9, 2.7, S3_HOP.b);
      d.ellipse(6.4, 4.2, 4.0, 1.4, S3_HOP.a);
      d.line(11, 7, 14, 10, S3_HOP.c); d.line(12, 7, 14, 8, S3_HOP.c);
      d.line(3, 8, 1, 10, S3_HOP.c);
      d.line(5, 8, 3, 10, S3_HOP.c);
      R(1, 10, 2, 1, 'e');
    } else {
      d.ellipse(7.6, 7.4 + dy, 6.6, 3.9 - dy * 0.3, S3_HOP.c);
      d.ellipse(7.4, 6.9 + dy, 6.1, 3.4 - dy * 0.3, S3_HOP.b);
      d.ellipse(6.4, 5.6 + dy, 4.3, 1.9, S3_HOP.a);
      // legs: front foot + folded hind leg
      R(2, 9, 3, 2, 'c'); R(1, 10, 4, 1, 'e');
      d.ellipse(11, 9.4 + dy * 0.3, 2.6, 1.7, S3_HOP.c);
      R(9, 10, 5, 1, 'e');
    }
    // stone pits on the back
    P(9, 5 + dy, 'c'); P(11, 6 + dy, 'c'); P(8, 7 + dy, 'c'); P(12, 8, 'e');
    // wide mouth
    if (f !== 2) d.hline(1, 5, 8 + Math.round(dy), S3_HOP.e);
    // glowing eyes on top
    const ey = f === 2 ? 1 : f === 1 ? 3 : 2;
    d.rect(2, ey, 3, 3, 'o'); d.px(2, ey, 'y'); d.px(3, ey, 'y'); d.px(3, ey + 1, 'e');
    d.rect(6, ey - 1, 3, 3, 'o'); d.px(6, ey - 1, 'y'); d.px(7, ey - 1, 'y'); d.px(7, ey, 'e');
    d.outline('k');
  });
  Sprites.recolor('s3_hopper', 's3_hopper_c', { [S3_HOP.a]: '#ffe646', [S3_HOP.b]: '#ff9424', [S3_HOP.c]: '#c05412', [S3_HOP.e]: '#a01c2c', '#ff9424': '#ff5a3a' });

  // rolling child head: 12x12 terracotta ball-head, 4 frames = 90 degree steps
  {
    const P = { L: '#ec8c56', M: '#c65c3a', D: '#8c3428', X: '#5a1a1e', H: '#ffc48c', K: '#2a0a0c' };
    const base = new Sprites.Painter(12, 12, P);
    const d = base;
    d.circle(5.5, 5.5, 5.4, 'M');
    d.circle(4.6, 4.6, 4.1, 'L');
    d.circle(5.2, 5.2, 3.6, 'M');
    d.circle(4.4, 4.2, 2.2, 'L');
    d.ellipse(8.4, 7.4, 3, 3.4, 'D');
    d.rect(0, 5, 2, 3, 'L');             // nose
    d.px(0, 5, 'H');
    d.rect(2, 3, 6, 1, 'X');             // brow
    d.rect(2, 4, 3, 2, 'X');             // eye socket
    d.px(3, 4, 'c');
    d.hline(2, 6, 9, 'X');               // mouth
    d.rect(8, 4, 2, 4, 'D');             // ear
    d.px(9, 5, 'X');
    d.outline('K');
    const frames = [base.c];
    for (let k = 1; k < 4; k++) {
      const c = Sprites.makeCanvas(12, 12);
      const g = c.getContext('2d');
      g.translate(6, 6);
      g.rotate((k * Math.PI) / 2);
      g.drawImage(base.c, -6, -6);
      frames.push(c);
    }
    Sprites.fromCanvases('s3_child', frames);
  }

  /* =============================================================
   * MOTHER: a giant terracotta moai with a crystal in her forehead.
   * 4 frames = mouth closed / half open / open / wide (glowing maw)
   * ============================================================= */
  function s3_motherArt() {
    const info = s3_buildHead({ h: 50, seed: 21, hat: 1, pal: 'terra', hpal: 'that', gem: 1, cracks: 1, moss: 0, noFade: 1 });
    const { w, h, ax, hatH } = info;
    const src = info.art.getContext('2d').getImageData(0, 0, w, h);
    const DK = '#2a0a0c';
    const my = info.mouth.y, mx0 = info.mouthX0 + 1, mx1 = info.mouthX1 - 2;
    const GEM = ['..B..', '.BcB.', 'BcwcB', 'BcccB', 'BcCcB', '.BCB.', '..B..'];
    const GC = { B: '#1c3078', c: '#48ecf4', w: '#ffffff', C: '#2a96c8' };
    const frames = [];
    for (let f = 0; f < 4; f++) {
      const c = Sprites.makeCanvas(w, h);
      const g = c.getContext('2d');
      g.putImageData(src, 0, 0);
      const R = (x, y, ww, hh, col) => {
        g.fillStyle = col;
        g.fillRect(x, y, ww, hh);
      };
      for (let x = 0; x < w; x++) if (src.data[((h - 1) * w + x) * 4 + 3] > 0) R(x, h - 1, 1, 1, DK); // closing outline
      GEM.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) if (row[i] !== '.') R(info.gem.x - 2 + i, info.gem.y - 3 + j, 1, 1, GC[row[i]]);
      });
      if (f === 1) R(mx0 + 1, my, mx1 - mx0 - 2, 2, DK);
      if (f === 2) {
        R(mx0, my - 1, mx1 - mx0, 4, DK);
        R(mx0 + 2, my + 1, mx1 - mx0 - 4, 1, '#48ecf4');
      }
      if (f === 3) {
        R(mx0 - 1, my - 1, mx1 - mx0 + 2, 5, DK);
        R(mx0 + 1, my, mx1 - mx0 - 2, 1, '#2a96c8');
        R(mx0 + 1, my + 1, mx1 - mx0 - 2, 2, '#48ecf4');
        R(mx0 + 3, my + 2, mx1 - mx0 - 6, 1, '#ffffff');
      }
      frames.push(c);
    }
    Sprites.fromCanvases('s3_mother', frames);
    const cx = w / 2, cy = h / 2;
    const F = (nx) => ax + nx * 50;
    const rp = (x0, y0, x1, y1) => ({ ox: (x0 + x1) / 2 - cx, oy: (y0 + y1) / 2 - cy, w: x1 - x0, h: y1 - y0 });
    return {
      w, h,
      gemc: { ox: info.gem.x + 0.5 - cx, oy: info.gem.y + 0.5 - cy }, // crystal centre (for the glint)
      // weak points reach forward to the silhouette edge at their row, so shots meet them before the skull box
      gem: rp(F(-0.232), info.gem.y - 3.5, info.gem.x + 5, info.gem.y + 5.5),
      mouth: rp(F(-0.268), my - 2, mx1 + 1, my + 4),
      hat: rp(F(-0.225), 0, F(0.235), hatH),
      skull: rp(F(-0.285), hatH, F(0.256), hatH + 0.82 * 50),
      base: rp(F(-0.31), hatH + 0.82 * 50, F(0.31), h),
      spawn: { ox: info.mouth.x - 7 - cx, oy: my + 1 - cy },
    };
  }
  const S3_MOTHER = s3_motherArt();

  /* =============================================================
   * WORLD LAYOUT: where the statues stand
   * k 'f' = stands on the floor, 'c' = hangs from the ceiling; wx = axis (world x);
   * h = statue height above its base; pat = ring pattern(s): aim | twin | fan | fan5 | burst | straight;
   * rate = base frames between volleys (scaled by difficulty), first = frames before the first volley,
   * spd = ring speed, hat = topknot (pukao), chip = weathered silhouette (top | nose | chin).
   * ============================================================= */
  const S3_BOSS_X = 3700;
  const S3_LEN = S3_BOSS_X + W + 120;
  const S3_FL = 30; // floor baseline
  const S3_CL = 30; // cave ceiling
  const S3_HZ = 128; // horizon (screen y)
  const S3_AHU = { x0: 2572, x1: 2892, h: 46 }; // platform of the mid-boss

  const S3_HEADS = [
    // shore: a big lazy statue to get used to the scale, then the first ring spitters
    { k: 'f', wx: 340, h: 60, hat: 1, seed: 3, pat: 'aim', rate: 280, first: 100, spd: 1.0 },
    { k: 'f', wx: 545, h: 46, seed: 7, pat: 'aim', rate: 210, first: 50, spd: 1.1 },
    { k: 'f', wx: 725, h: 58, seed: 12, chip: 'top', pat: ['aim', 'twin'], rate: 190, first: 30, spd: 1.2 },
    // head field with the first overhang
    { k: 'f', wx: 1095, h: 68, hat: 1, seed: 21, pat: ['fan', 'aim'], rate: 240, first: 40 },
    { k: 'c', wx: 1215, h: 48, seed: 24, base: 26, pat: 'burst', rate: 230, first: 60 },
    { k: 'f', wx: 1305, h: 54, seed: 29, chip: 'chin', pat: ['straight', 'aim'], rate: 190, first: 20 },
    // quarry cave
    { k: 'c', wx: 1795, h: 54, seed: 33, pat: ['burst', 'aim'], rate: 210, first: 40 },
    { k: 'f', wx: 1885, h: 54, hat: 1, seed: 35, pat: ['fan', 'straight'], rate: 220, first: 30 },
    { k: 'c', wx: 1980, h: 58, seed: 38, chip: 'nose', pat: 'straight', rate: 160, first: 60 },
    { k: 'f', wx: 2070, h: 52, seed: 41, pat: ['aim', 'twin'], rate: 165, first: 20 },
    { k: 'c', wx: 2160, h: 56, seed: 44, pat: 'burst', rate: 210, first: 50 },
    { k: 'f', wx: 2245, h: 54, hat: 1, seed: 47, pat: ['fan', 'aim'], rate: 220, first: 20 },
    // beyond the mother: a small statue and the colossus
    { k: 'f', wx: 3090, h: 48, seed: 55, chip: 'top', pat: ['aim', 'burst'], rate: 200, first: 20 },
    { k: 'f', wx: 3230, h: 76, hat: 1, seed: 51, pat: ['fan5', 'aim'], rate: 250, first: 40 }, // the colossus
  ];

  let s3_laid = null;
  function s3_layout() {
    if (s3_laid) return s3_laid;
    s3_laid = S3_HEADS.map((hd, i) => {
      const flip = hd.k === 'c';
      const info = s3_buildHead({ h: hd.h, hat: hd.hat ? 1 : 0, seed: hd.seed, flip, chip: hd.chip, cracks: 2, moss: hd.moss === undefined ? 2 : hd.moss });
      const base = hd.base !== undefined ? hd.base : flip ? S3_CL : S3_FL;
      const left = hd.wx - info.ax;
      const top = flip ? base : H - base - info.h;
      Sprites.fromCanvases('s3_head' + i, [info.art]); // (registered so G.gallery('s3_') can show them)
      const mx = left + info.mouth.x - 6, my = top + info.mouth.y;
      return {
        hd, info, left, top, base, mx, my,
        eyes: info.eyes.map((e) => [left + e.x - mx, top + e.y - my]),
        lip: [left + info.mouthX0 - mx, left + info.mouthX1 - mx],
      };
    });
    return s3_laid;
  }

  /** cut-stone masonry (ahu platform): blocks with mortar and bevels, only on solid pixels */
  function s3_paintAhu(g, T, xa, xb, yTop) {
    const rng = makeRng(99);
    const tones = ['#5a3826', '#6c4530', '#7a5136', '#88593a'];
    const ch = 9, cw = 24;
    for (let x = xa; x < xb; x++) {
      for (let y = yTop; y < H - 14; y++) {
        if (!T.solid(x, y)) continue;
        if (!T.solid(x, y - 3) || !T.solid(x - 3, y) || !T.solid(x + 3, y)) continue; // keep the skinned edge bands
        const j = Math.floor((y - (yTop + 2)) / ch);
        if (j < 0) continue;
        const yy = y - (yTop + 2) - j * ch;
        const off = (j & 1) * (cw >> 1);
        const bx = x - xa + off;
        const xx = ((bx % cw) + cw) % cw;
        const bi = Math.floor(bx / cw);
        let col = tones[(bi * 7 + j * 3 + 8) & 3];
        if (yy === 0 || xx === 0) col = '#34200f';
        else if (yy === 1) col = '#a87a50';
        else if (xx === 1) col = '#946640';
        else if (yy === ch - 1 || xx === cw - 1) col = '#452a1a';
        else if (rng() < 0.06) col = '#a07048';
        else if (rng() < 0.05) col = '#4a2e1e';
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  }

  /** sun-bleached sand on the top rows of the floor (dithered into the rock) */
  function s3_paintSand(g, T, x0, x1) {
    for (let x = x0; x < x1; x++) {
      const y0 = T.floorTop(x);
      if (y0 >= H - 20) continue;
      for (let k = 0; k < 5; k++) {
        const y = y0 + 2 + k;
        if (!T.solid(x, y)) continue;
        const t = S3_BAYER[(y & 3) * 4 + (x & 3)];
        if (t < 0.85 - k * 0.19) {
          g.fillStyle = k < 2 ? '#d8a86a' : t < 0.3 ? '#c8905a' : '#b47c4c';
          g.fillRect(x, y, 1, 1);
        }
      }
    }
  }


  /** small boulders embedded just under the floor surface (breaks up the repeating rock tile) */
  function s3_paintPebbles(g, T, x0, x1) {
    const rng = makeRng(321);
    for (let x = x0; x < x1; x += 22 + Math.floor(rng() * 26)) {
      const y0 = T.floorTop(x);
      if (y0 >= H - 24 || !T.solid(x, y0 + 14)) continue;
      const rx = 2 + rng() * 3.4, ry = 1.4 + rng() * 1.6;
      const cy = y0 + 8 + Math.floor(rng() * 8);
      for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++)
        for (let xx = Math.floor(x - rx); xx <= Math.ceil(x + rx); xx++) {
          const a = (xx + 0.5 - x) / rx, b = (yy + 0.5 - cy) / ry, d = a * a + b * b;
          if (d > 1 || !T.solid(xx, yy)) continue;
          g.fillStyle = d > 0.72 ? '#3a2214' : a + b < -0.5 ? '#b48350' : a + b > 0.5 ? '#6a4128' : '#8c5e3a';
          g.fillRect(xx, yy, 1, 1);
        }
    }
  }

  function s3_terrain() {
    const laid = s3_layout();
    const nz = (x0, x1, base, amp, seed) => ({ type: 'noise', x0, x1, base, amp, scale: 58, seed, edge: 45 });
    return {
      length: S3_LEN,
      floor: [
        { type: 'flat', x0: 0, x1: S3_LEN, h: S3_FL },
        // shore dunes and rocks
        nz(70, 300, 33, 7, 31),
        { type: 'hill', x: 240, w: 84, h: 44, shape: 'cos' },
        { type: 'hill', x: 452, w: 74, h: 42, shape: 'cos' },
        { type: 'hill', x: 632, w: 56, h: 40, shape: 'cos' },
        nz(800, 1030, 33, 7, 33),
        { type: 'hill', x: 890, w: 90, h: 46, shape: 'cos' },
        { type: 'hill', x: 1180, w: 60, h: 40, shape: 'cos' },
        { type: 'hill', x: 1420, w: 76, h: 46, shape: 'cos' },
        { type: 'hill', x: 1560, w: 70, h: 40, shape: 'mesa', top: 0.5 },
        nz(1400, 1660, 34, 8, 35),
        // rubble in the quarry
        { type: 'hill', x: 1838, w: 26, h: 40, shape: 'tri' },
        { type: 'hill', x: 2028, w: 26, h: 42, shape: 'tri' },
        { type: 'hill', x: 2150, w: 30, h: 40, shape: 'tri' },
        nz(2330, 2520, 33, 7, 37),
        // the ahu: mother's stepped platform
        { type: 'flat', x0: S3_AHU.x0 - 36, x1: S3_AHU.x0, h: 38 },
        { type: 'flat', x0: S3_AHU.x0, x1: S3_AHU.x1, h: S3_AHU.h },
        { type: 'flat', x0: S3_AHU.x1, x1: S3_AHU.x1 + 36, h: 38 },
        { type: 'hill', x: 2390, w: 80, h: 44, shape: 'cos' },
        { type: 'hill', x: 2990, w: 60, h: 42, shape: 'cos' },
        nz(3250, 3440, 32, 6, 41),
        // calm arena
        { type: 'slope', x0: 3440, x1: 3520, h0: S3_FL, h1: 34 },
        { type: 'flat', x0: 3520, x1: S3_LEN, h: 34 },
      ],
      ceil: [
        // overhang above the first crossed lanes
        { type: 'slope', x0: 1120, x1: 1170, h0: 0, h1: 26 },
        { type: 'flat', x0: 1170, x1: 1320, h: 26 },
        { type: 'slope', x0: 1320, x1: 1372, h0: 26, h1: 0 },
        // the quarry cave
        { type: 'slope', x0: 1690, x1: 1750, h0: 0, h1: S3_CL },
        { type: 'flat', x0: 1750, x1: 2250, h: S3_CL },
        { type: 'slope', x0: 2250, x1: 2310, h0: S3_CL, h1: 0 },
        { type: 'hill', x: 1846, w: 24, h: 46, shape: 'tri' },
        { type: 'hill', x: 2036, w: 24, h: 48, shape: 'tri' },
        { type: 'hill', x: 2118, w: 22, h: 44, shape: 'tri' },
      ],
      shapes(g) {
        for (const L of laid) g.drawImage(L.info.mask, L.left, L.top);
      },
      decorate(g, T) {
        s3_paintPebbles(g, T, 20, S3_LEN - 300);
        s3_paintSand(g, T, 0, 660);
        s3_paintSand(g, T, 3380, S3_LEN);
        s3_paintAhu(g, T, S3_AHU.x0 - 36, S3_AHU.x1 + 36, H - S3_AHU.h);
        for (const L of laid) g.drawImage(L.info.art, L.left, L.top);
      },
      skin: {
        kind: 'rock',
        pal: ['#2c1812', '#432418', '#5e3620', '#7c4c2c', '#9c6a3c'],
        outline: '#170a06', hi: '#e8b070', hi2: '#c08850', lo: '#1e0e08',
        crack: '#170a06', speckle: '#b88452', cracks: 7, contrast: 2.1, seed: 5,
      },
    };
  }

  /* =============================================================
   * BACKGROUND: sunset over the sea, distant statues, drifting streak clouds
   * ============================================================= */
  const s3_hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const s3_mix = (a, b, t) => {
    const A = Sprites.toRgb(a), B = Sprites.toRgb(b);
    return s3_hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  };
  const s3_hash = (n) => {
    n = (n ^ 61) ^ (n >>> 16);
    n = (n + (n << 3)) | 0;
    n ^= n >>> 4;
    n = Math.imul(n, 0x27d4eb2d);
    n ^= n >>> 15;
    return (n >>> 0) / 4294967296;
  };
  const S3_SUN_X = 92;

  /** sun disc + dithered halo (only the upper half is ever visible) */
  function s3_sunSprite() {
    const cw = 128, ch = 64, cx = 64, cy = 63;
    const c = Sprites.makeCanvas(cw, ch);
    const g = c.getContext('2d');
    const img = g.createImageData(cw, ch);
    const d = img.data;
    const put = (i, hex, a) => {
      const q = Sprites.toRgb(hex);
      d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2]; d[i + 3] = a;
    };
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const i = (y * cw + x) * 4;
        if (r <= 17) put(i, r <= 6 ? '#fffcd8' : r <= 12 ? '#ffee9c' : r <= 15.4 ? '#ffc864' : '#ff9e4c', 255);
        else if (r < 62) {
          const t = Math.pow(1 - (r - 17) / 45, 1.5);
          const lvl = t * 5 - S3_BAYER[(y & 3) * 4 + (x & 3)] * 0.9;
          const a = Math.floor(lvl);
          if (a >= 1) put(i, '#ffc078', [0, 30, 48, 68, 88, 110][Math.min(5, a)]);
        }
      }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** tiny black-purple moai silhouettes on a distant islet (rim-lit by the sun on the left) */
  function s3_farStatues(P) {
    const HH = 46;
    const d = new Sprites.Painter(P, HH, {});
    const SIL = '#2c1042', RIM = '#e0784e', ISL = '#241038';
    // islet
    for (let x = 0; x < P; x++) {
      const t = x / P;
      const hgt = 4 + Math.round(2.4 * Math.sin(t * TAU * 3) + 1.6 * Math.sin(t * TAU * 7 + 1));
      d.rect(x, HH - hgt, 1, hgt, ISL);
      d.px(x, HH - hgt, '#6a2c56');
    }
    const [fr, bk] = s3_headPoly(1.7, 1.6, 1.6);
    const statue = (cx, h, hat) => {
      const base = HH - 3;
      const pts = fr.concat(bk).map(([nx, ny]) => [cx + nx * h * 1.3, base - h + ny * h]);
      d.poly(pts.map(([x, y]) => [x - 1, y - 1]), RIM);
      d.poly(pts, SIL);
      if (hat) {
        d.rect(Math.round(cx - 0.24 * h), Math.round(base - h - 0.14 * h), Math.round(0.46 * h), Math.round(0.14 * h) + 1, RIM);
        d.rect(Math.round(cx - 0.23 * h), Math.round(base - h - 0.14 * h) + 1, Math.round(0.46 * h), Math.round(0.14 * h), SIL);
      }
    };
    // (the sun slides through strip x 92..314 during the stage: keep that range free of statues)
    [[52, 18, 1], [80, 24, 0], [108, 17, 1]].forEach(([x, h, hat]) => statue(x, h, hat));
    for (let k = 0; k < 6; k++) statue(340 + k * 14, 13 + (k % 2), k % 3 === 1);
    [[448, 27, 1], [486, 21, 0]].forEach(([x, h, hat]) => statue(x, h, hat));
    return d.c;
  }


  /** a row of dark statues on the closer sea stacks (Ahu Tongariki style), rim-lit from the left */
  function s3_midStatues(P) {
    const HH = 64;
    const d = new Sprites.Painter(P, HH, {});
    const SIL = '#2a0e40', RIM = '#b8583c', DK = '#180a2c';
    const [fr, bk] = s3_headPoly(1.9, 1.8, 1.8);
    const statue = (cx, h, hat) => {
      const base = HH - 6;
      const sx = 1.12;
      const pts = fr.concat(bk).map(([nx, ny]) => [cx + nx * h * sx, base - h + ny * h]);
      d.poly(pts.map(([x, y]) => [x - 1, y - 1]), RIM);
      d.poly(pts, SIL);
      // faint carved features: brow shade, eye socket, mouth
      const top = base - h;
      d.hline(Math.round(cx - 0.2 * h * sx), Math.round(cx + 0.05 * h * sx), Math.round(top + 0.27 * h), DK);
      d.rect(Math.round(cx - 0.12 * h * sx), Math.round(top + 0.31 * h), Math.max(2, Math.round(0.14 * h * sx)), 2, DK);
      d.hline(Math.round(cx - 0.18 * h * sx), Math.round(cx), Math.round(top + 0.6 * h), DK);
      if (hat) {
        d.rect(Math.round(cx - 0.25 * h), Math.round(top - 0.15 * h), Math.round(0.5 * h), Math.round(0.15 * h) + 1, RIM);
        d.rect(Math.round(cx - 0.24 * h), Math.round(top - 0.15 * h) + 1, Math.round(0.5 * h), Math.round(0.15 * h), SIL);
      }
    };
    // the ahu wall they stand on
    for (const [x0, x1] of [[60, 200], [470, 640]]) {
      d.rect(x0, HH - 7, x1 - x0, 7, SIL);
      d.hline(x0, x1, HH - 8, RIM);
    }
    [[84, 34, 1], [112, 38, 0], [140, 33, 1], [168, 36, 0]].forEach(([x, h, hat]) => statue(x, h, hat));
    for (let k = 0; k < 5; k++) statue(500 + k * 28, 26 + (k % 3) * 3, k === 2);
    statue(352, 30, 1);
    statue(720, 40, 1);
    return d.c;
  }

  /** long dusk streak clouds: sunlit underside, magenta body, dark top */
  function s3_cloudStrip(P) {
    const CH = S3_HZ - 4;
    const d = new Sprites.Painter(P, CH, {});
    const rng = makeRng(913);
    for (let k = 0; k < 12; k++) {
      const cx = rng() * P, cy = 10 + rng() * (CH - 44), rx = 30 + rng() * 62, ry = 2.2 + rng() * 3.2;
      const t = cy / CH;
      const under = s3_mix('#a84a96', '#ffb464', t), body = s3_mix('#6a2c88', '#e4646a', t), top = s3_mix('#3c2474', '#b03e84', t);
      for (const ox of [-P, 0, P]) {
        d.ellipse(cx + ox, cy + 1.7, rx, ry * 0.85, under);
        d.ellipse(cx + ox, cy, rx * 0.97, ry * 0.92, body);
        d.ellipse(cx + ox - rx * 0.12, cy - ry * 0.6, rx * 0.72, ry * 0.5, top);
      }
    }
    return d.c;
  }


  /** a few tiny dark birds drifting across the dusk sky (pure ambience, far behind everything) */
  function s3_farBirds() {
    const rng = makeRng(2024);
    const flock = Array.from({ length: 7 }, (_, i) => ({ x0: rng() * (W + 60), y: 38 + rng() * 70, sp: 0.12 + rng() * 0.16, ph: (rng() * 30) | 0, par: 0.02 + rng() * 0.03 }));
    return {
      kind: 'custom',
      draw(ctx, camX, t) {
        ctx.fillStyle = '#2c1446';
        for (const b of flock) {
          const x = Math.round((((b.x0 - t * b.sp - camX * b.par) % (W + 60)) + (W + 60)) % (W + 60)) - 30;
          const y = Math.round(b.y + Math.sin((t + b.ph) * 0.03) * 3);
          if (((t + b.ph) >> 4) & 1) {
            ctx.fillRect(x - 2, y, 5, 1);
            ctx.fillRect(x, y + 1, 1, 1);
          } else {
            ctx.fillRect(x - 3, y - 1, 1, 1);
            ctx.fillRect(x + 3, y - 1, 1, 1);
            ctx.fillRect(x - 2, y, 1, 1);
            ctx.fillRect(x + 2, y, 1, 1);
            ctx.fillRect(x - 1, y + 1, 3, 1);
          }
        }
      },
    };
  }

  /** the shimmering sea band: baked gradient + drifting wave dashes + a flickering sun path */
  function s3_seaLayer() {
    const SH = H - S3_HZ;
    const stops = [[0, '#e8705e'], [S3_HZ / H, '#e8705e'], [0.66, '#b04a7c'], [0.82, '#5c2c82'], [1, '#22185a']];
    const grad = Backgrounds.bakeGradient({ stops, steps: 20 });
    const at = (t) => {
      for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) return s3_mix(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0] || 1));
      return stops[stops.length - 1][1];
    };
    const rng = makeRng(4242);
    const light = [], dark = [];
    for (let r = 0; r < SH; r++) {
      const base = at((S3_HZ + r) / H);
      light.push(s3_mix(base, '#ffc890', 0.34));
      dark.push(s3_mix(base, '#140a3c', 0.34));
    }
    const dashes = [];
    for (let r = 1; r < SH; r += 2) {
      const n = 3 + (r >> 4);
      for (let k = 0; k < n; k++) {
        dashes.push({ r, x0: rng() * W, len: 2 + (r >> 3) + Math.floor(rng() * 3), sp: 0.03 + 0.1 * (r / SH) * (0.5 + rng()), ph: Math.floor(rng() * 4), lt: rng() < 0.55 });
      }
    }
    return {
      kind: 'custom',
      draw(ctx, camX, t) {
        ctx.drawImage(grad, 0, S3_HZ, W, SH, 0, S3_HZ, W, SH);
        ctx.fillStyle = '#ffe2a2';
        ctx.fillRect(0, S3_HZ, W, 1);
        for (const q of dashes) {
          if (q.lt && (((t >> 3) + q.ph) & 3) === 0) continue;
          let x = (q.x0 - camX * (0.02 + 0.2 * (q.r / SH)) - t * q.sp) % W;
          if (x < 0) x += W;
          ctx.fillStyle = q.lt ? light[q.r] : dark[q.r];
          ctx.fillRect(Math.floor(x), S3_HZ + q.r, q.len, 1);
          if (x + q.len > W) ctx.fillRect(0, S3_HZ + q.r, Math.ceil(x + q.len - W), 1);
        }
        // sun path
        const b = t >> 3;
        for (let r = 0; r < SH; r += 2) {
          for (let k = 0; k < 2; k++) {
            const h1 = s3_hash(r * 97 + k * 31 + b * 7919), h2 = s3_hash(r * 13 + k * 71 + b * 5867);
            const hw = 5 + r * 0.42;
            const len = 2 + (r >> 4) + ((h1 * 4) | 0);
            ctx.fillStyle = h1 < 0.33 ? '#fff4b8' : h1 < 0.66 ? '#ffd070' : '#ff9a58';
            ctx.fillRect(Math.round(S3_SUN_X + (h2 - 0.5) * 2 * hw - len / 2), S3_HZ + 1 + r, len, 1);
          }
        }
      },
    };
  }

  function s3_background() {
    const sun = s3_sunSprite();
    return Backgrounds.make([
      { kind: 'gradient', stops: [[0, '#0e1440'], [0.16, '#221c68'], [0.3, '#58288a'], [0.42, '#a4348c'], [0.49, '#e0505c'], [0.54, '#f8803e'], [S3_HZ / H, '#ffc060'], [1, '#ffc060']], steps: 26 },
      { kind: 'stars', n: 34, speed: 0.02, drift: 0.01, ymax: 66, seed: 6 },
      {
        kind: 'custom',
        draw(ctx, camX) {
          const prog = clamp(camX / S3_BOSS_X, 0, 1);
          ctx.drawImage(sun, S3_SUN_X - 64, Math.round(S3_HZ + 1 + prog * 9 - 63));
        },
      },
      { kind: 'strip', build: s3_cloudStrip, period: 512, speed: 0.05, drift: 0.03, y: 4 },
      s3_farBirds(),
      { kind: 'strip', build: s3_farStatues, period: 512, speed: 0.06, y: S3_HZ - 46 },
      s3_seaLayer(),
      { kind: 'strip', build: s3_midStatues, period: 768, speed: 0.38, y: H - 64 - 24 },
      { kind: 'ridge', color: '#3e1c52', color2: '#26103c', edge: '#e0724c', hMin: 16, hMax: 58, speed: 0.3, seed: 5, jag: 0.6, scale: 46 },
      { kind: 'ridge', color: '#2c1240', color2: '#1a0a2c', edge: '#b04a4a', hMin: 10, hMax: 40, speed: 0.5, seed: 8, jag: 0.5, scale: 36 },
      {
        kind: 'custom',
        draw(ctx, camX) {
          const a = 0.3 * clamp(camX / S3_BOSS_X, 0, 1);
          if (a < 0.01) return;
          ctx.globalAlpha = a;
          ctx.fillStyle = '#160a48';
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
        },
      },
    ]);
  }

  /* =============================================================
   * ENEMIES
   * ============================================================= */
  // guaranteed calm after every (re)start at a checkpoint: statues, totems and hoppers stay passive for 215 camera px (~5.5 s)
  let s3_resetCam = 0;
  const s3_graceOver = () => G.camX - s3_resetCam >= 215;

  /**
   * one ion ring: shootable (hp 1), slow, 8x8 hit box for an 11 px sprite.
   * The statues scroll left past the ring, so a steep ring whose own leftward speed is below the scroll
   * speed would climb its own face and die on the nose: simulate the first steps in world space and
   * bend the direction toward horizontal until the path is clear.
   */
  function s3_ring(x, y, ang, spd) {
    const T = G.terrain, k = G.bulletMul();
    // steeper rings are a little faster (<= 1.5), so they still leave the scrolling statue instead of sliding along its face
    spd = Math.min(1.5, Math.max(spd, 1.05 / Math.max(0.45, Math.cos(s3_ad(ang, Math.PI)))));
    for (let n = 0; n < 14; n++) {
      const vx = Math.cos(ang) * spd * k, vy = Math.sin(ang) * spd * k;
      let ok = true;
      for (let st = 2; st <= 18; st += 2) {
        if (T.solid(G.camX + G.camSpeed * st + x + vx * st, y + vy * st)) {
          ok = false;
          break;
        }
      }
      if (ok) break;
      ang += Math.sin(ang) < 0 ? -0.07 : 0.07; // toward pure left
    }
    return G.ebullet(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, { spr: 's3_ring', w: 8, h: 8, hp: 1, anim: 5, quiet: true });
  }
  /** heads always spit "forward" (left): the aim is clamped to +-40 degrees around horizontal */
  function s3_headAim(x, y, lim) {
    const P = G.player;
    return Math.PI + clamp(s3_ad(Math.atan2(P.y - y, P.x - x), Math.PI), -lim, lim);
  }
  function s3_clampCone(a, attach) {
    const m = 0.16;
    if (attach === 'ceil') {
      if (a < 0) return a < -Math.PI / 2 ? Math.PI - m : m;
      return clamp(a, m, Math.PI - m);
    }
    if (a > 0) return a > Math.PI / 2 ? -Math.PI + m : -m;
    return clamp(a, -Math.PI + m, -m);
  }

  function s3_volley(e) {
    const pat = e.pats[e.pi++ % e.pats.length];
    const a = s3_headAim(e.x, e.y, pat === 'fan' || pat === 'fan5' ? 0.5 : 0.7), v = e.spd;
    const later = (n, fn) => G.later(n, () => { if (!e.dead && G.player.alive && e.x > 2) fn(); });
    sfx('ring');
    switch (pat) {
      case 'fan':
        for (const k of [-0.33, 0, 0.33]) s3_ring(e.x, e.y, a + k, v);
        break;
      case 'fan5':
        for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) s3_ring(e.x, e.y, a + k, v * 0.92);
        break;
      case 'burst':
        s3_ring(e.x, e.y, a, v);
        later(12, () => s3_ring(e.x, e.y, a, v));
        later(24, () => s3_ring(e.x, e.y, a, v));
        break;
      case 'straight':
        s3_ring(e.x, e.y, Math.PI, v + 0.1);
        later(16, () => s3_ring(e.x, e.y, Math.PI, v + 0.1));
        break;
      case 'twin':
        s3_ring(e.x, e.y, a - 0.22, v);
        s3_ring(e.x, e.y, a + 0.22, v);
        break;
      default:
        s3_ring(e.x, e.y, a, v);
    }
  }

  /* ---- s3_mouth: invisible emitter anchored to a statue's lips; the statue itself is terrain ---- */
  ENEMIES.s3_mouth = {
    w: 6, h: 6, hp: 1, score: 0, ghost: true, harmless: true,
    init(e, o) {
      e.pats = Array.isArray(o.pat) ? o.pat : [o.pat || 'aim'];
      e.pi = 0;
      e.rate = o.rate || 200;
      e.spd = o.spd || 1.2;
      e.cd = o.first !== undefined ? o.first : 60;
      e.chg = 0;
      e.open = 0;
    },
    update(e) {
      const P = G.player;
      if (e.open > 0) e.open--;
      if (e.chg > 0) {
        if (!P.alive || !G.canFire(e)) {
          e.chg = 0;
          e.cd = 24;
          return;
        }
        if (--e.chg === 0) {
          s3_volley(e);
          e.open = 12;
          e.cd = G.fireDelay(e.rate) + rndi(0, 30);
        }
        return;
      }
      if (--e.cd > 0) return;
      if (s3_graceOver() && G.canFire(e) && P.x < e.x - 26 && e.x - P.x < 210) e.chg = 24;
      else e.cd = 14;
    },
    draw(e, c) {
      const o = e.o, act = e.chg > 0, open = e.open > 0;
      const ex = Math.round(e.x), ey = Math.round(e.y);
      if (o.eyes) {
        // eyes: faint teal glint while idle, bright while charging (tells you this statue is awake)
        c.globalAlpha = act ? 1 : 0.5 + 0.25 * Math.sin(e.t * 0.09 + o.eyes[0][0]);
        c.fillStyle = act ? '#e8ffff' : '#48ecf4';
        for (const [dx, dy] of o.eyes) c.fillRect(ex + Math.round(dx) - (act ? 1 : 0), ey + Math.round(dy), act ? 3 : 2, act ? 2 : 1);
        c.globalAlpha = 1;
      }
      if ((act || open) && o.lip) {
        const x0 = ex + Math.round(o.lip[0]), x1 = ex + Math.round(o.lip[1]);
        c.fillStyle = open ? '#ffffff' : (e.t >> 1) & 1 ? '#48ecf4' : '#a8f8ff';
        c.fillRect(x0, ey, x1 - x0, 1);
        if (open) {
          c.fillStyle = '#48ecf4';
          c.fillRect(x0 + 1, ey + 1, Math.max(1, x1 - x0 - 2), 1);
        }
      }
    },
  };

  /* ---- s3_bird: gulls (sine glide) and stone swoopers (dip toward you, then climb away) ---- */
  ENEMIES.s3_bird = {
    w: 13, h: 9, hp: 1, score: 100,
    init(e, o) {
      e.mode = o.mode || 'glide';
      e.speed = o.speed || (e.mode === 'swoop' ? 1.5 : 1.2);
      e.vx = -e.speed;
      e.base = e.y;
      e.amp = o.amp !== undefined ? o.amp : 22;
      e.freq = o.freq || 0.05;
      e.ph = (o.index || 0) * 0.45 + (o.phase || 0);
      e.st = 0;
      if (e.mode === 'swoop') {
        e.w = 14;
        e.h = 9;
        e.hp = e.maxHp = Math.max(1, Math.round(2 * G.diff.hp * (1 + 0.25 * G.loop)));
        e.score = 150;
      }
    },
    update(e) {
      if (e.mode === 'glide') {
        e.y = e.base + Math.sin(e.t * e.freq + e.ph) * e.amp;
        return;
      }
      const P = G.player;
      if (e.st === 0) {
        e.y = e.base + Math.sin(e.t * 0.08 + e.ph) * 3;
        if (e.x < (e.o.diveX || 205) && P.alive) {
          e.st = 1;
          e.t1 = e.t;
          e.y0 = e.y;
          e.ty = clamp(P.y + rnd(-6, 6), e.y0 + 40, 172);
          e.vx = -(e.speed + 0.55);
          e.dur = clamp((e.x - (P.x + 22)) / -e.vx, 34, 100);
        }
      } else if (e.st === 1) {
        const u = (e.t - e.t1) / e.dur;
        if (u >= 2) {
          e.st = 2;
          e.y = e.y0;
        } else e.y = e.y0 + ((e.ty - e.y0) * (1 - Math.cos(Math.PI * u))) / 2;
        e.dive = u < 1;
      }
    },
    draw(e, c) {
      const sw = e.mode === 'swoop';
      const fr = sw ? (e.st === 1 && e.dive ? 2 : (e.t >> 3) & 1) : (e.t / 5) | 0;
      Sprites.draw(c, s3_cn(e, sw ? 's3_swoop' : 's3_bird'), e.x, e.y, { frame: fr, flash: e.flash > 0 });
    },
  };

  /* ---- s3_tiki: totem turret (floor or ceiling), spits aimed orbs ---- */
  ENEMIES.s3_tiki = {
    w: 12, h: 26, hp: 4, score: 300, attach: 'floor', expl: 'm', sink: 1,
    spr: (e) => s3_cn(e, 's3_tiki'),
    init(e) {
      e.cd = 60 + rndi(0, 50);
      e.chg = 0;
    },
    update(e) {
      if (e.chg > 0) {
        e.frame = e.chg > 10 ? 1 : 2;
        if (--e.chg === 0) {
          const shoot = () => {
            if (e.dead || !G.player.alive) return;
            const mx = e.x - 3, my = e.y + (e.attach === 'ceil' ? 2 : -2);
            const a = s3_clampCone(Math.atan2(G.player.y - my, G.player.x - mx), e.attach);
            G.ebullet(mx, my, Math.cos(a) * 1.4, Math.sin(a) * 1.4);
          };
          shoot();
          if (e.o.burst) {
            G.later(9, shoot);
            G.later(18, shoot);
          }
          e.cd = G.fireDelay(e.o.rate || 130) + rndi(0, 40);
        }
        return;
      }
      e.frame = 0;
      if (--e.cd <= 0) {
        if (s3_graceOver() && G.canFire(e) && e.x > 24) e.chg = 18;
        else e.cd = 12;
      }
    },
  };

  /* ---- s3_hopper: small stone toad that hops along the floor toward you ---- */
  ENEMIES.s3_hopper = {
    w: 12, h: 10, hp: 2, score: 150, attach: 'floor', expl: 's', sink: 1,
    spr: (e) => s3_cn(e, 's3_hopper'),
    init(e, o) {
      e.cd = 50 + rndi(0, 40);
      e.air = false;
      e.jv = 0;
      e.dir = -1;
      e.hop = o.hop || 2.6;
      e.hvx = o.hvx || 0.85;
    },
    update(e) {
      const T = G.terrain, P = G.player;
      const gyAt = (wx) => T.floorTop(wx) - e.h / 2 + 1;
      if (!e.air) {
        e.y += (gyAt(e.wx) - e.y) * 0.5;
        e.frame = e.cd < 14 ? 1 : 0;
        if (--e.cd <= 0) {
          if (s3_graceOver() && e.x < W - 12 && e.x > 10) {
            e.air = true;
            e.jv = -e.hop;
            e.dir = P.alive && P.x > e.x + 20 ? 1 : -1;
          } else e.cd = 10;
        }
      } else {
        e.frame = 2;
        e.jv += 0.11;
        e.y += e.jv;
        const nx = e.wx + e.dir * e.hvx;
        if (T.solid(nx + e.dir * 6, e.y)) e.dir = -e.dir;
        else e.wx = nx;
        const gy = gyAt(e.wx);
        if (e.jv > 0 && e.y >= gy) {
          e.y = gy;
          e.air = false;
          e.cd = 55 + rndi(0, 45);
        }
      }
      e.flipX = e.dir > 0;
    },
  };

  /* ---- s3_child: small terracotta head that rolls and bounces toward you ---- */
  ENEMIES.s3_child = {
    w: 10, h: 10, hp: 1, score: 100, expl: 's',
    spr: () => 's3_child',
    init(e, o) {
      e.vx = o.vx !== undefined ? o.vx : -1.3;
      e.vy = o.vy !== undefined ? o.vy : -2.2;
    },
    update(e) {
      const T = G.terrain, wx = G.camX + e.x;
      e.frame = ((e.t / 5) | 0) & 3;
      e.vy += 0.1;
      const gy = T.floorTop(wx) - 5;
      if (e.vy > 0 && e.y + e.vy >= gy) {
        e.y = gy;
        e.vy = -Math.max(1.5, e.vy * 0.8);
      }
      if (T.solid(wx - 6, e.y) || T.solid(wx, e.y - 6)) {
        e.dead = true;
        G.explode(e.x, e.y, 's', { quiet: true });
      }
    },
  };

  /* ---- s3_mother: mid-boss "Mother and Child".  A levitating giant that holds her screen position over
   *      the ahu (a terrain-anchored one would scroll into the ship), fires ring volleys and lets small
   *      terracotta "children" roll out of her mouth.  The scroll never stops.  Weak points: the forehead
   *      crystal (always) and the mouth (while it is open); the stone body deflects shots. ---- */
  function s3_motherVolley(e, k) {
    if (!G.canFire(e) || !G.player.alive) return;
    const x = e.x + S3_MOTHER.spawn.ox, y = e.y + S3_MOTHER.spawn.oy;
    if (x < G.player.x + 44) return; // too close to dodge: skip this volley
    const a = s3_headAim(x, y, 0.8);
    sfx('ring');
    for (const s of k === 0 ? [-0.36, 0, 0.36] : [-0.52, -0.17, 0.17, 0.52]) s3_ring(x, y, a + s, 1.25);
  }
  function s3_motherChild(e) {
    if (!G.canFire(e) || !G.player.alive) return;
    let n = 0;
    for (const o of G.enemies) if (!o.dead && o.type === 's3_child') n++;
    if (n >= 3) return;
    sfx('stomp');
    G.spawn('s3_child', { x: e.x + S3_MOTHER.spawn.ox - 2, y: e.y + S3_MOTHER.spawn.oy + 2, vx: -1.35 - rnd(0, 0.35), vy: -2.4 });
  }
  ENEMIES.s3_mother = {
    w: S3_MOTHER.w, h: S3_MOTHER.h, hp: 34, score: 4000, expl: 'l',
    init(e) {
      const part = (name, geo, vuln) => Object.assign({ name, hp: 99999, max: 99999, vuln, expl: 'm', score: 0 }, geo);
      // front-most (vulnerable) parts first: the crystal, then the mouth (only while it is open)
      e.parts = [part('gem', S3_MOTHER.gem, true), part('mouth', S3_MOTHER.mouth, false), part('hat', S3_MOTHER.hat, false), part('skull', S3_MOTHER.skull, false), part('base', S3_MOTHER.base, false)];
      e.hx = 190; // hover position (screen): she levitates over her ahu and never scrolls into you
      e.by = 124;
      e.age = 0;
      e.act = false;
      e.leave = false;
      e.ct = 0;
      e.cyc = 300;
      e.mf = 0;
      e.vx = -1.7;
    },
    update(e) {
      e.age++;
      if (e.leave) {
        e.vx = 1.3;
        e.vy = -0.4;
        return;
      }
      if (!e.act) {
        // glide in from the right edge, easing into the hover position
        e.vx = -Math.max(0.3, (e.x - e.hx) * 0.03);
        e.y = e.by + Math.sin(e.age * 0.03) * 4;
        if (e.x <= e.hx + 1 && s3_graceOver()) {
          e.act = true;
          e.ct = 0;
          e.t0 = e.age;
          e.cyc = Math.max(280, Math.round(G.fireDelay(320)));
        }
        return;
      }
      e.vx = 0;
      e.vy = 0;
      e.x = e.hx + Math.sin((e.age - e.t0) * 0.014) * 14;
      e.y = e.by + Math.sin((e.age - e.t0) * 0.022) * 6;
      if (e.age > 780) e.leave = true; // long enough for a basic ship; then she withdraws before the next statues arrive
      const c = ++e.ct;
      e.parts[1].vuln = e.mf >= 2;
      switch (c) {
        case 36: e.mf = 1; break;
        case 44: e.mf = 2; sfx('coreOpen'); break;
        case 56: s3_motherVolley(e, 0); break;
        case 132: s3_motherVolley(e, 1); break;
        case 160: e.mf = 3; break;
        case 172: s3_motherChild(e); break;
        case 214: s3_motherChild(e); break;
        case 246: e.mf = 2; break;
        case 254: e.mf = 1; break;
        case 260: e.mf = 0; sfx('coreClose'); break;
        default: break;
      }
      if (c >= e.cyc) {
        e.ct = 0;
        e.cyc = Math.max(280, Math.round(G.fireDelay(320)));
      }
    },
    onPartHurt(e, p, dmg) {
      // every vulnerable part feeds the same pool
      e.hp -= dmg;
      if (e.hp <= 0) G.kill(e);
    },
    onDeath(e) {
      const x = e.x, y = e.y;
      for (let i = 0; i < 6; i++) G.later(3 + i * 6, () => G.explode(x + rnd(-15, 15), y + rnd(-24, 24), i % 2 ? 'm' : 's', { quiet: i % 2 === 0 }));
      for (const o of G.enemies) {
        if (!o.dead && o.type === 's3_child') {
          o.dead = true;
          G.explode(o.x, o.y, 's', { quiet: true });
        }
      }
    },
    draw(e, c) {
      const g = e.parts[0];
      // levitation glow under the base
      const ex = Math.round(e.x), by = Math.round(e.y + S3_MOTHER.h / 2);
      const pulse = 0.5 + 0.25 * Math.sin(e.t * 0.12);
      for (let k = 0; k < 4; k++) {
        c.globalAlpha = pulse * (0.55 - k * 0.12);
        c.fillStyle = k < 2 ? '#a8f8ff' : '#48ecf4';
        const hw = 15 - k * 3;
        c.fillRect(ex - hw, by + 1 + k, hw * 2, 1);
      }
      c.globalAlpha = 1;
      Sprites.draw(c, 's3_mother', e.x, e.y, { frame: e.mf, flash: g.flash > 0 || e.parts[1].flash > 0 });
      const gx = Math.round(e.x + S3_MOTHER.gemc.ox - 0.5), gy = Math.round(e.y + S3_MOTHER.gemc.oy - 0.5);
      const ph = e.t % 70;
      if (ph < 5) {
        c.fillStyle = ph < 3 ? '#ffffff' : '#a8f8ff';
        c.fillRect(gx - 4, gy, 9, 1);
        c.fillRect(gx, gy - 4, 1, 9);
      }
    },
  };

  /* =============================================================
   * BOSS: TIDE COLOSSUS
   * ============================================================= */
  const S3C = {
    HX: 214, // axis column of the head (screen x)
    FLOOR: H - 34, // top of the beach in the arena (the water is clipped there)
  };

  // weathered grey-green stone (lit from the top left, a little warm: it is dusk)
  S3_HEAD_PAL.tide = { out: '#0d1a1c', c: ['#1f3033', '#34504c', '#567266', '#82a082', '#b6c89a'] };

  function s3_colArt() {
    const PAL = S3_HEAD_PAL.tide;
    const info = s3_buildHead({ h: 100, hat: 0, seed: 77, gem: 0, cracks: 0, moss: 3, noFade: 1, pal: 'tide' });
    const W0 = info.w, H0 = info.h, my = info.mouth.y, ax = info.ax;
    const ay = my + 19; // the entity's anchor row: the middle of the open throat (where the stone hangs)
    const DROP = [0, 10, 36], HF = H0 + 50; // jaw drop per frame; every frame is as tall as the longest one plus a long underwater base
    const img = info.art.getContext('2d').getImageData(0, 0, W0, H0);
    const d = img.data;
    const at = (x, y) => (y * W0 + x) * 4;
    const inside = (x, y) => x >= 0 && x < W0 && y >= 0 && y < H0 && d[at(x, y) + 3] > 0;
    const OUT = Sprites.toRgb(PAL.out);
    const isOut = (x, y) => {
      const i = at(x, y);
      return d[i] === OUT[0] && d[i + 1] === OUT[1] && d[i + 2] === OUT[2];
    };
    /** tint a stone pixel (never the outline, never outside the silhouette) */
    const paint = (x, y, hex, mix) => {
      x = Math.round(x);
      y = Math.round(y);
      if (!inside(x, y) || isOut(x, y)) return false;
      const c = Sprites.toRgb(hex), i = at(x, y), m = mix === undefined ? 1 : mix;
      d[i] = d[i] + (c[0] - d[i]) * m;
      d[i + 1] = d[i + 1] + (c[1] - d[i + 1]) * m;
      d[i + 2] = d[i + 2] + (c[2] - d[i + 2]) * m;
      return true;
    };
    const setpx = (x, y, hex) => {
      if (x < 0 || x >= W0 || y < 0 || y >= H0) return;
      const c = Sprites.toRgb(hex), i = at(x, y);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    };

    /* ---- geometry of the silhouette (hit boxes are built from it) ---- */
    const front = [], back = [];
    for (let y = 0; y < H0; y++) {
      let a = -1, b = -1;
      for (let x = 0; x < W0; x++) {
        if (d[at(x, y) + 3] > 0) {
          if (a < 0) a = x;
          b = x;
        }
      }
      front.push(a);
      back.push(b);
    }
    const bands = (y0, y1) => {
      const out = [];
      let cur = null;
      for (let y = y0; y <= y1; y++) {
        if (front[y] < 0) continue;
        if (cur && (cur.y1 - cur.y0 >= 8 || Math.abs(front[y] - cur.f) > 3 || Math.abs(back[y] - cur.b) > 4)) {
          out.push(cur);
          cur = null;
        }
        if (!cur) cur = { y0: y, y1: y, x0: front[y], x1: back[y] + 1, f: front[y], b: back[y] };
        else {
          cur.y1 = y;
          cur.x0 = Math.min(cur.x0, front[y]);
          cur.x1 = Math.max(cur.x1, back[y] + 1);
        }
      }
      if (cur) out.push(cur);
      return out;
    };
    const box = (b) => ({ ox: (b.x0 + b.x1) / 2 - ax, oy: (b.y0 + b.y1 + 1) / 2 - ay, w: b.x1 - b.x0, h: b.y1 - b.y0 + 1 });

    /* ---- hand-made details on top of the generated stone ---- */
    // three carved tide lines across the forehead (they glow once the Colossus is hurt)
    const glyph = [];
    for (let k = 0; k < 3; k++) {
      for (let x = 27; x <= 48; x++) {
        const y = 6 + k * 4 + Math.round(1.4 * Math.sin((x - 27) * 0.7 + k * 1.2));
        if (paint(x, y, '#10222a')) {
          glyph.push([x, y]);
          paint(x, y + 1, '#9bb8a0', 0.5);
        }
      }
    }
    // barnacles and a green waterline stain on everything that lives in the water
    const rng = makeRng(404);
    for (let tries = 0, n = 0; tries < 500 && n < 22; tries++) {
      const x = 8 + Math.floor(rng() * 56), y = 66 + Math.floor(rng() * 32);
      if (!inside(x, y) || isOut(x, y) || Math.abs(y - my) < 9) continue;
      paint(x, y, '#dde4cc');
      paint(x + 1, y, '#aebba2');
      paint(x, y + 1, '#223a38');
      paint(x + 1, y + 1, '#223a38');
      if (rng() < 0.5) paint(x - 1, y, '#8e9e88');
      n++;
    }
    for (let y = 80; y < H0; y++) {
      for (let x = 0; x < W0; x++) {
        const t = (y - 80) / 20;
        if (S3_BAYER[(y & 3) * 4 + (x & 3)] < t * 0.85) paint(x, y, '#2a5a3c', 0.5);
      }
    }
    // seaweed hanging from the chin
    for (const [sx, sy, len] of [[14, 74, 13], [19, 77, 10], [25, 80, 9]]) {
      for (let k = 0; k < len; k++) {
        const x = sx + Math.round(1.3 * Math.sin(k * 0.9 + sx)), y = sy + k;
        setpx(x, y, k % 4 === 3 ? '#8fae4a' : k % 2 ? '#2f6a3a' : '#1c4a2c');
        if (k % 3 === 1) setpx(x + 1, y, '#1c4a2c');
      }
    }

    /* ---- the head in three jaw states (closed / half / wide open) ---- */
    const cx0 = info.mouth.x, cx1 = info.mouthX1;
    const mix = (a, b, t) => {
      const A = Sprites.toRgb(a), B = Sprites.toRgb(b);
      return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    };
    const frames = [];
    for (let f = 0; f < 3; f++) {
      const dr = DROP[f];
      const out = new ImageData(W0, HF);
      const o = out.data;
      for (let y = 0; y <= my; y++) o.set(d.subarray(at(0, y), at(0, y) + W0 * 4), y * W0 * 4);
      for (let y = my + 1; y < H0; y++) o.set(d.subarray(at(0, y), at(0, y) + W0 * 4), (y + dr) * W0 * 4);
      // the base continues straight down under the water (so the head never ends above the beach)
      for (let y = H0 + dr; y < HF; y++) {
        const k = y === HF - 1 ? 0 : 1 - 0.004 * (y - H0 - dr);
        for (let x = 0; x < W0; x++) {
          const s0 = at(x, H0 - 2), i = (y * W0 + x) * 4;
          if (d[s0 + 3] === 0) continue;
          o[i] = k === 0 ? OUT[0] : d[s0] * k;
          o[i + 1] = k === 0 ? OUT[1] : d[s0 + 1] * k;
          o[i + 2] = k === 0 ? OUT[2] : d[s0 + 2] * k;
          o[i + 3] = 255;
        }
      }
      for (let j = 0; j < dr; j++) {
        const y = my + 1 + j;
        for (let x = 0; x < W0; x++) {
          const i = (y * W0 + x) * 4;
          let c = null;
          if (x >= cx0 && x <= cx1) {
            // the cavity: black under the upper lip, a little water-light toward the lower lip
            const t = dr > 1 ? j / (dr - 1) : 0;
            c = mix('#04101a', '#0e3446', t * t);
            if (x >= cx1 - 2) c = mix('#02080e', '#06202c', t);
            if (j === dr - 1) c = x >= cx1 - 1 ? [2, 8, 14] : mix('#1c6a82', '#3aa8bc', ((x * 7) & 3) / 4);
            if (j === 0) c = [4, 12, 18];
          } else if (x > cx1 && inside(x, my - 2)) {
            // the cheek simply stretches (darker toward the open jaw)
            const s1 = at(x, my - 2), k = 0.8 - 0.32 * Math.min(1, j / 30);
            c = [d[s1] * k, d[s1 + 1] * k, d[s1 + 2] * k];
          }
          if (c) {
            o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; o[i + 3] = 255;
          }
        }
      }
      const cv = Sprites.makeCanvas(W0, HF);
      cv.getContext('2d').putImageData(out, 0, 0);
      frames.push(cv);
    }
    Sprites.fromCanvases('s3_col_head', frames);

    Sprites.painted('s3_col_none', 1, 1, 1, () => {}); // (the invisible bullets of the eye ray are drawn by the boss)

    /* ---- crack overlays (stage 1: a few dark fissures, stage 2: wide open and glowing) ---- */
    for (let lv = 1; lv <= 2; lv++) {
      const cr = makeRng(900 + lv);
      const p = new Sprites.Painter(W0, HF, {});
      const n = lv === 1 ? 3 : 7;
      for (let k = 0; k < n; k++) {
        let x = 24 + Math.floor(cr() * 34), y = Math.floor(cr() * 8);
        const len = 20 + Math.floor(cr() * 26);
        let dx = cr() < 0.5 ? -1 : 1;
        for (let s = 0; s < len; s++) {
          if (y > my - 6) break;
          if (inside(x, y) && !isOut(x, y)) {
            p.px(x, y, '#081012');
            if (lv === 2) {
              p.px(x + 1, y, s % 3 === 0 ? '#a8f8ff' : '#2a96c8');
              if (inside(x, y + 1) && !isOut(x, y + 1) && s % 2 === 0) p.px(x, y + 1, '#1c6a8c');
            }
          }
          if (cr() < 0.62) y++;
          else x += dx;
          if (cr() < 0.2) dx = -dx;
        }
      }
      Sprites.fromCanvases('s3_col_crk' + lv, [p.c]);
    }

    /* ---- the topknot (pukao): red scoria cylinder, 4 states: whole / cracked / chipped / (gone is simply not drawn) ---- */
    const HP = { a: '#3a1a16', b: '#64302a', c: '#8e4a38', d: '#b8684a', e: '#dc906a', k: '#1e0f0a', g: '#4a7a2c', G: '#8fae4a', t: '#48ecf4', T: '#a8f8ff' };
    Sprites.painted('s3_col_hat', 52, 26, 3, (p, f) => {
      // cylinder body with a slightly narrower top, lit from the left
      for (let y = 3; y <= 24; y++) {
        const inset = y < 6 ? 6 - y : 0;
        const x0 = 2 + inset, x1 = 49 - inset;
        for (let x = x0; x <= x1; x++) {
          const u = (x - 2) / 47;
          const th = [0.2, 0.42, 0.7, 0.88], nm = ['e', 'd', 'c', 'b', 'a'];
          let k = 0;
          while (k < 4 && u >= th[k]) k++;
          let col = nm[k];
          if ((x + y) & 1) {
            if (k < 4 && th[k] - u < 0.03) col = nm[k + 1];
            else if (k > 0 && u - th[k - 1] < 0.03) col = nm[k - 1];
          }
          p.px(x, y, col);
        }
      }
      // top face
      p.ellipse(26, 4.5, 21.5, 2.6, 'd');
      p.ellipse(25, 4.2, 18, 1.8, 'e');
      p.hline(8, 44, 3, 'e');
      // fluting + shadow under the overhang
      for (const x of [10, 19, 28, 37, 44]) p.vline(x, 7, 20, x < 20 ? 'c' : 'b');
      p.rect(2, 22, 48, 3, 'a');
      p.hline(2, 49, 22, 'b');
      p.hline(4, 47, 25, 'k');
      // moss tufts on the lit top edge
      for (const [mx, my2] of [[9, 4], [10, 5], [11, 4], [13, 5], [34, 4], [35, 5]]) p.px(mx, my2, (mx + my2) & 1 ? 'g' : 'G');
      if (f >= 1) {
        // a long fissure from the top rim down through the body
        let x = 31;
        for (let y = 3; y <= 23; y++) {
          p.px(x, y, 'k');
          if (f === 2 || y % 2) p.px(x + 1, y, f === 2 ? 't' : 'a');
          if (y % 5 === 2) x += y % 10 === 2 ? 1 : -1;
        }
        p.line(18, 9, 24, 14, 'k');
        p.line(24, 14, 22, 20, 'k');
      }
      if (f === 2) {
        // a chunk is missing at the top right
        for (let y = 2; y <= 12; y++) for (let x = 36 + Math.floor((y - 2) * 0.6); x <= 52; x++) p.erase(x, y);
        p.line(36, 2, 42, 8, 'k');
        p.line(42, 8, 40, 12, 'k');
        p.line(40, 12, 50, 12, 'k');
        for (let x = 42; x < 49; x++) p.px(x, 13, 'b');
        p.px(45, 13, 't');
        p.px(47, 13, 'T');
        p.line(12, 5, 14, 12, 'k');
        p.px(13, 8, 't');
      }
      p.outline('k');
    }, { pal: HP });

    /* ---- the tide stone: a tall gold crystal that fills the throat (4 frames: a glint slides down its left facet) ---- */
    Sprites.painted('s3_col_stone', 15, 34, 4, (p, f) => {
      const hex = (i) => [[7, i], [14 - i, 6 + i], [14 - i, 27 - i], [7, 33 - i], [i, 27 - i], [i, 6 + i]];
      p.poly(hex(0), 'O');
      p.poly(hex(1), 'o');
      p.poly(hex(2.5), 'y');
      p.poly([[7, 3], [7, 30], [3, 25], [3, 9]], 'h'); // lit left facet
      p.poly([[7, 3], [12, 9], [12, 25], [7, 30]], 'o'); // shaded right facet
      p.vline(7, 4, 29, 'w'); // ridge
      for (const y of [8, 14, 21]) p.px(10, y + ((f + y) & 1), 'Y'); // flaws inside
      const gy = 5 + f * 6;
      p.px(4, gy, 'w');
      p.px(4, gy + 1, 'w');
      p.px(5, gy + 1, 'w');
      p.px(5, gy + 2, 'h');
      p.outline('k');
    });

    /* ---- falling rubble from the cracked topknot ---- */
    for (let f = 0; f < 2; f++) {
      Sprites.painted('s3_col_rock' + f, 9, 9, 1, (p) => {
        const pts = f ? [[1, 4], [3, 0], [7, 1], [8, 5], [5, 8], [1, 7]] : [[0, 3], [4, 0], [8, 2], [7, 7], [3, 8], [1, 6]];
        p.poly(pts, 'c');
        p.poly(pts.map(([x, y]) => [x * 0.8 + 1.6, y * 0.8 + 1.6]), 'b');
        p.line(pts[0][0] + 1, pts[0][1] + 1, pts[1][0] + 1, pts[1][1] + 1, 'e');
        p.px(3, 3, 'd');
        p.px(4, 3, 'e');
        p.px(6, 5, 'a');
        p.px(5, 6, 'a');
        p.outline('k');
      }, { pal: { a: '#2a3c3c', b: '#567266', c: '#82a082', d: '#b6c89a', e: '#d8e4b8', k: '#0d1a1c' } });
    }

    /* ---- the surge: a breaking wave with a curling, foaming lip; a see-through dithered body, bright cyan/white (ion water: it hurts, like the rings) ---- */
    Sprites.painted('s3_col_wave', 34, 70, 4, (p, f) => {
      for (let y = 0; y < 70; y++) {
        const u = y / 69;
        const lip = y < 16 ? Math.sin((y / 16) * Math.PI) : 0; // the hook overhangs to the left
        const xl = Math.round(7 - 6.2 * lip - 4 * Math.max(0, u - 0.25));
        const xr = Math.round(15 + 18 * Math.pow(u, 0.9));
        for (let x = Math.max(0, xl); x <= Math.min(33, xr); x++) {
          const depth = (y - 2) / 60 + (x - xl) / 40;
          const edge = x - xl < 3 || xr - x < 2 || y < 13;
          if (!edge && depth > 0.2 && (x + y + f) % (u > 0.6 ? 2 : 3) === 0) continue; // holes: the sea shows through
          let col = depth < 0.1 ? 'w' : depth < 0.3 ? 'c' : depth < 0.6 ? 'C' : 'b';
          if (((x + y + f * 2) & 3) === 0 && depth > 0.15) col = depth < 0.45 ? 'c' : 'C';
          p.px(x, y, col);
        }
        if (y < 16) for (let x = Math.max(0, xl); x <= xl + 2 + ((y + f) & 1); x++) p.px(x, y, 'w'); // the foaming lip
      }
      // spray flying off the crest and foam streaks on the face
      for (let k = 0; k < 6; k++) {
        const sx = 1 + ((k * 4 + f * 3) % 11), sy = 1 + ((k * 3 + f * 2) % 7);
        p.px(sx, sy, k & 1 ? 'w' : 'c');
      }
      for (let k = 0; k < 10; k++) {
        const fx = 4 + ((k * 5 + f * 3) % 18), fy = 14 + ((k * 7 + f * 5) % 54);
        p.px(fx, fy, 'w');
        if (k % 2) p.px(fx + 1, fy, 'c');
      }
      p.outline('B');
    });

    /* geometry used by the entity */
    const upper = bands(0, my), lower = bands(my + 1, H0 - 1);
    return {
      w: W0, h: HF, h0: H0, ax, my, ay, drop: DROP,
      glyph,
      eyeFar: { ox: info.eyes[1].x - ax, oy: info.eyes[1].y - ay },
      eyeNear: { ox: info.eyes[0].x - ax, oy: info.eyes[0].y - ay },
      lip: { x0: cx0, x1: cx1 },
      front, back,
      upper: upper.map(box),
      lower: lower.map(box),
      // cavity back wall / cheek: rows the jaw opens up (height is set from the jaw state)
      cheek: { ox: (cx1 + 1 + back[my] + 1) / 2 - ax, w: back[my] + 1 - (cx1 + 1), top: my + 1 - ay }, // (top: first row below the upper lip)
      stone: { ox: cx1 - 9 - ax, oy: 0 }, // centre of the glowing throat (cavity rows my+1 .. my+36)
      mouthOx: cx0 - 7 - ax, mouthOy: 0,
      hat: { ox: 0, oy: -22 + 13 - ay, w: 48, h: 26 },
    };
  }
  const S3_COLA = s3_colArt();


  /* =============================================================
   * THE TIDE IS THE CLOCK.
   *  The head bobs in the surf on a slow tide (it rises, lingers high, sinks, lingers low).  Where its mouth is relative to
   *  the water line decides everything:
   *    risen  the jaw drops, the sea drains out of the throat and the tide stone in it is bare: the only weak point.
   *           The open mouth spits shootable ion rings.
   *    sunk   the water closes over the mouth and the stone is covered; the eyes burn instead: eye rays and a breaking wave.
   *  Phase 1  slow tide, ring fans, one sweeping eye ray.
   *  Phase 2  (stone below 73 %) the Colossus dives and resurfaces with a cracked topknot: faster tide, eye rays that sweep
   *           there and back, breaking waves, rubble raining from the topknot.
   *  Phase 3  (stone below 46 %) it dives again, the topknot falls off and the tide goes OUT: the head stands high and dry,
   *           the stone stays bare and the mouth rakes the arena with ring spirals (the rays and the rubble return).
   * ============================================================= */
  /**
   * The tide: the head rises (15 % of the cycle), dwells high (50 %), sinks (15 %) and stays low (20 %): +1 risen .. -1 sunk.
   * Phase 3 (the tide is out) only heaves gently.
   */
  function s3_tide(u, ph) {
    if (ph === 3) return Math.sin(u);
    let c = (u / TAU) % 1;
    if (c < 0) c += 1;
    if (c < 0.15) return -1 + 2 * s3_ease(c / 0.15);
    if (c < 0.65) return 1;
    if (c < 0.8) return 1 - 2 * s3_ease((c - 0.65) / 0.15);
    return -1;
  }
  const s3_ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const s3_out = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
  const S3_DEEP = 175; // depth of the hidden head (the whole sprite is below the beach line)
  const S3_PH = [
    null,
    { per: 450, mid: 145, amp: 18, wl: 145, gate: 0.73, gap: 44 },
    { per: 390, mid: 145, amp: 18, wl: 145, gate: 0.46, gap: 36 },
    { per: 330, mid: 140, amp: 6, wl: 162, gate: 0, gap: 28 },
  ];
  // attack programme per phase: each window of the tide takes the next entry that suits it (up: mouth clear of the sea, down: covered)
  const S3_PROG = [
    null,
    [['fan3', 'up'], ['seq3', 'up'], ['sweep', 'down']],
    [['fan5', 'up'], ['rain', 'up'], ['surge', 'down'], ['scan', 'down']],
    [['spiral', 'any'], ['scan', 'any'], ['rain', 'any'], ['seq5', 'any'], ['spiral', 'any'], ['scan', 'any']],
  ];
  const S3_TEL = 44; // beam / rubble telegraph (frames)
  const S3_NB = 21; // lethal boxes along the eye ray

  /** water surface (screen y) at column x */
  function s3_colSurface(v, x) {
    const dx = x - S3C.HX;
    const swell = (5 + 7 * (v.sg || 0)) * Math.exp(-(dx * dx) / 2200) * v.sw;
    const wav = (Math.sin(x * 0.11 - v.t * 0.07) * 1.1 + Math.sin(x * 0.043 + v.t * 0.031) * 0.9) * v.sw;
    return v.wl - swell * (0.7 + 0.3 * Math.sin(v.t * 0.05)) + wav;
  }

  // a few drifting ripple dashes in the pool
  const S3_RIP = (() => {
    const r = makeRng(77);
    return Array.from({ length: 46 }, () => ({ r: 4 + Math.floor(r() * 34), x0: r() * 140, len: 3 + Math.floor(r() * 7), sp: 0.12 + r() * 0.35, lt: r() < 0.6 }));
  })();

  /** the pool of surf around the Colossus: translucent water over the lower head, a wavy skin, ripples, foam */
  function s3_colWater(c, v) {
    const k = v.sw;
    if (k < 0.02) return;
    const A = S3_COLA, FL = S3C.FLOOR, xL = S3C.HX - 124;
    c.save();
    for (let x = xL; x < W; x++) {
      const a = Math.min(1, (x - xL) / 34) * k;
      const top = Math.round(s3_colSurface(v, x));
      c.globalAlpha = a * 0.55;
      c.fillStyle = '#86eef0';
      c.fillRect(x, top, 1, 2);
      c.globalAlpha = a * 0.48;
      c.fillStyle = '#2a9ab8';
      c.fillRect(x, top + 2, 1, 15);
      c.globalAlpha = a * 0.6;
      c.fillStyle = '#143c7a';
      c.fillRect(x, top + 17, 1, Math.max(0, Math.min(16, FL - top - 17)));
      c.globalAlpha = a * 0.8;
      c.fillStyle = '#0c2458';
      c.fillRect(x, top + 33, 1, Math.max(0, FL - top - 33));
    }
    const span = W - xL;
    for (const q of S3_RIP) {
      const x = xL + ((((q.x0 - v.t * q.sp * (q.lt ? 1 : -0.6)) % span) + span) % span);
      const y = Math.round(s3_colSurface(v, x) + q.r);
      if (y > FL - 2) continue;
      c.globalAlpha = Math.min(1, (x - xL) / 34) * k * (q.lt ? 0.55 : 0.5);
      c.fillStyle = q.lt ? '#d8ffff' : '#0a1c58';
      c.fillRect(Math.round(x), y, q.len, 1);
    }
    // foam: a broken white line on the skin
    for (let x = xL; x < W; x++) {
      const h = s3_hash(x * 31 + (v.t >> 3) * 7);
      if (h < 0.55) {
        c.globalAlpha = Math.min(1, (x - xL) / 34) * k * 0.95;
        c.fillStyle = h < 0.2 ? '#ffffff' : '#bff8ff';
        c.fillRect(x, Math.round(s3_colSurface(v, x)) - 1, 1, 1);
      }
    }
    // whitecaps hugging the head where it pierces the surface
    const top = v.y - A.ay;
    if (!v.nocap && top < v.wl - 2 && top + A.front.length > v.wl) {
      const row = clamp(Math.round(v.wl - top), 0, A.front.length - 1);
      for (const [ex, dir] of [[v.x - A.ax + A.front[row], -1], [v.x - A.ax + A.back[row] + 1, 1]]) {
        for (let i = 0; i < 9; i++) {
          const w = 1 + ((i * 3 + (v.t >> 2)) % 4);
          const x = Math.round(ex + dir * (i * 1.4 - 2)) - (dir < 0 ? w : 0);
          const y = Math.round(s3_colSurface(v, ex)) - 1 - (i % 3 === 0 ? 1 : 0);
          c.globalAlpha = k * (0.95 - i * 0.07);
          c.fillStyle = i % 2 ? '#e8ffff' : '#ffffff';
          c.fillRect(x, y, w, 2);
        }
      }
    }
    // expanding ripple rings (the head is diving / surfacing)
    for (const q of v.rip || []) {
      const rx = 5 + q.t * 1.15, ry = rx * 0.2, n = Math.min(44, 12 + Math.floor(rx * 0.8));
      c.fillStyle = '#e8ffff';
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, y = Math.round(s3_colSurface(v, q.x) + 2 + Math.sin(a) * ry), x = Math.round(q.x + Math.cos(a) * rx);
        if (x < xL + 6 || x >= W || (i + (q.t >> 1)) % 3 === 0) continue;
        c.globalAlpha = Math.max(0, 0.9 - q.t / 56) * k;
        c.fillRect(x, y, 2, 1);
      }
    }
    c.restore();
  }

  /** draws the Colossus (alive or as a wreck) from a plain view object */
  function s3_colDraw(c, v) {
    const A = S3_COLA, FL = S3C.FLOOR;
    const hx = Math.round(v.x + (v.jx || 0)), hy = Math.round(v.y + (v.jy || 0));
    const sx = hx - A.ax, sy = hy - A.ay;
    const t = v.t;
    c.save();
    c.beginPath();
    c.rect(0, 0, W, FL);
    c.clip();
    Sprites.drawTL(c, 's3_col_head', sx, sy, { frame: v.jaw });
    if (v.glow > 0) {
      c.globalAlpha = v.glow * (0.55 + 0.3 * Math.sin(t * 0.09));
      c.fillStyle = '#48ecf4';
      for (const [gx, gy] of A.glyph) c.fillRect(sx + gx, sy + gy, 1, 1);
      c.globalAlpha = 1;
    }
    if (v.crack > 0) {
      c.globalAlpha = v.crack === 2 ? 0.8 + 0.2 * Math.sin(t * 0.1) : 1;
      Sprites.drawTL(c, 's3_col_crk' + v.crack, sx, sy);
      c.globalAlpha = 1;
    }
    // eyes: a dim teal slit while calm, white-hot while a beam charges
    const en = A.eyeNear, ef = A.eyeFar, ex = hx + en.ox, ey = hy + en.oy, fx = hx + ef.ox, fy = hy + ef.oy;
    c.fillStyle = '#48ecf4';
    c.globalAlpha = Math.max(0.3 + 0.12 * Math.sin(t * 0.07), v.eye * 0.5);
    c.fillRect(ex - 5, ey - 1, 10, 3);
    c.fillRect(fx - 1, fy - 1, 3, 2);
    if (v.eye > 0.02) {
      c.globalAlpha = v.eye;
      c.fillStyle = '#e8ffff';
      c.fillRect(ex - 4, ey, 8, 1);
      c.fillRect(ex - 2, ey - 1, 4, 3);
      c.fillRect(fx - 1, fy - 1, 3, 2);
      c.globalAlpha = v.eye * 0.35;
      c.fillStyle = '#48ecf4';
      c.fillRect(ex - 9, ey - 4, 18, 9);
      c.fillRect(fx - 4, fy - 3, 9, 6);
    }
    c.globalAlpha = 1;
    // mouth: cyan charge glow at the front of the cavity
    if (v.jaw === 2 && v.mg > 0.02) {
      const gx = sx + A.lip.x0 + 1, gy = sy + A.my + 8;
      c.fillStyle = '#48ecf4';
      c.globalAlpha = 0.2 + 0.5 * v.mg;
      c.fillRect(gx, gy, 6 + Math.round(8 * v.mg), 22);
      c.globalAlpha = 0.5 + 0.5 * v.mg;
      c.fillStyle = '#e8ffff';
      c.fillRect(gx, gy + 8, 2 + Math.round(4 * v.mg), 6);
      c.globalAlpha = 1;
    }
    // the stone (only while the jaw is wide open): the whole throat glows while it can be hurt, and a bracket marks it
    if (v.jaw === 2 && v.stone > 0) {
      const px = Math.round(hx + A.stone.ox), py = Math.round(hy + A.stone.oy);
      if (v.stone === 2) {
        const gt = hy - 16, gh = Math.max(2, Math.round(v.sbh));
        c.fillStyle = '#ff9424';
        c.globalAlpha = 0.3 + 0.1 * Math.sin(t * 0.12);
        c.fillRect(px - 8, gt, 17, gh);
        c.fillStyle = '#ffe646';
        c.globalAlpha = 0.28;
        c.fillRect(px - 5, gt + 2, 11, Math.max(1, gh - 4));
        c.globalAlpha = 1;
        const r = 10 + ((t >> 3) & 1), by0 = gt + gh / 2;
        c.fillStyle = (t >> 4) & 1 || G.reduceFlash ? '#ffe646' : '#ffffff';
        for (const sgx of [-1, 1]) {
          for (const sgy of [-1, 1]) {
            const cx = px + sgx * r, cy = Math.round(by0 + sgy * (gh / 2 + 2 + ((t >> 3) & 1)));
            c.fillRect(sgx > 0 ? cx - 2 : cx, cy, 3, 1);
            c.fillRect(cx, sgy > 0 ? cy - 2 : cy, 1, 3);
          }
        }
      } else c.globalAlpha = 0.55;
      Sprites.draw(c, 's3_col_stone', px, py, { frame: (t >> 3) & 3, flash: v.sflash > 0 });
      c.globalAlpha = 1;
    }
    if (v.hat < 3) Sprites.drawTL(c, 's3_col_hat', hx - 25 + (v.hx || 0), sy - 22, { frame: v.hat });
    c.restore();
    s3_colWater(c, v);
  }

  /** eye-ray and rubble telegraphs / the beams themselves (drawn over the water) */
  function s3_colBeamFx(c, e) {
    const a = e.at, FL = S3C.FLOOR;
    if (!a) return;
    const t = a.t;
    if (a.n === 'rain' && t < S3_TEL) {
      for (const x of a.cols) {
        // cracks of light at the top edge and dust trickling down the column where the rubble will fall
        c.fillStyle = G.reduceFlash || (t >> 3) & 1 ? '#e8f4c8' : '#b6c89a';
        c.fillRect(x - 4, 0, 9, 2);
        c.fillRect(x - 2, 2, 5, 1);
        for (let k = 0; k < 5; k++) {
          const h = s3_hash(x * 7 + k * 13);
          c.fillStyle = k & 1 ? '#82a082' : '#d4e2b8';
          c.fillRect(x - 3 + Math.floor(h * 7), 3 + ((t * (1.2 + h * 0.5) + k * 11) % 34), 1, 2 + (k & 1));
        }
      }
      return;
    }
    if ((a.n !== 'sweep' && a.n !== 'scan') || t >= S3_TEL + a.T * a.legs + 6) return;
    const [ox, oy] = s3_colEye(e);
    const L = ox - 6, ta = Math.tan(s3_colAng(e, a, 0)), tb = Math.tan(s3_colAng(e, a, 1));
    c.save();
    c.beginPath();
    c.rect(0, 0, W, FL);
    c.clip();
    // the danger wedge
    c.globalAlpha = t < S3_TEL ? 0.17 + 0.05 * Math.sin(t * 0.3) : 0.09;
    c.fillStyle = '#48ecf4';
    c.beginPath();
    c.moveTo(ox - 4, oy);
    c.lineTo(0, oy + ta * ox);
    c.lineTo(0, oy + tb * ox);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
    if (t < S3_TEL) {
      // dotted edges: the row the ray starts on is bright and blinks slowly, the row it ends on is dim
      for (const [tn, start] of [[ta, true], [tb, false]]) {
        c.fillStyle = start ? (G.reduceFlash || (t >> 3) & 1 ? '#ffe646' : '#ffffff') : '#a8903a';
        for (let x = L; x > 2; x -= 5) {
          const y = Math.round(oy + tn * (ox - x));
          if (y < FL - 1) c.fillRect(Math.round(x), y, 2, 1);
        }
      }
    } else {
      const ang = s3_colAng(e, a, a.u), tn = Math.tan(ang), th = clamp((t - S3_TEL) / 8, 0, 1), fade = t > S3_TEL + a.T * a.legs ? 0.4 : 1;
      const half = Math.max(1, Math.round(2.4 * th * fade));
      for (let x = Math.round(ox) - 6; x >= 0; x--) {
        const y = Math.round(oy + (ox - x) * tn);
        if (y > FL - 1) break;
        c.fillStyle = '#1a46b4';
        c.fillRect(x, y - half - 1, 1, half * 2 + 3);
        c.fillStyle = '#48ecf4';
        c.fillRect(x, y - half, 1, half * 2 + 1);
        c.fillStyle = (x + t) % 7 < 3 ? '#ffffff' : '#c8ffff';
        c.fillRect(x, y, 1, 1 + (half > 1 ? 1 : 0));
      }
      c.fillStyle = '#ffffff';
      c.fillRect(Math.round(ox) - 7, Math.round(oy) - 2, 4, 5);
    }
    c.restore();
  }

  /* ---------- attacks ---------- */
  function s3_colRing(x, y, ang, spd) {
    return G.ebullet(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, { spr: 's3_ring', w: 8, h: 8, hp: 1, anim: 5, quiet: true });
  }
  const s3_colMouth = (e) => [e.x + S3_COLA.mouthOx, e.y + S3_COLA.mouthOy];
  const s3_colEye = (e) => [e.x + S3_COLA.eyeFar.ox, e.y + S3_COLA.eyeFar.oy];

  /**
   * Angle (radians below horizontal) of the eye ray at progress u (0..legs): the ray is the line from the eye through the point
   * (a.px, y) where y runs from the start row to the end row (and back, for a scan).  Aimed at where the ship was when the
   * telegraph began, so it always sweeps THROUGH the ship's lane.
   */
  function s3_colAng(e, a, u) {
    const [ox, oy] = s3_colEye(e);
    u = clamp(u, 0, a.legs);
    const y = u <= 1 ? a.y0 + (a.y1 - a.y0) * u : a.y1 + (a.y0 - a.y1) * (u - 1);
    return Math.atan2(y - oy, Math.max(20, ox - a.px));
  }

  /**
   * The lethal eye ray: a row of invisible bullets glued to the beam (the picture is drawn separately, smoothly).  Bullets
   * rather than part boxes, because bullets carry a velocity that the shield logic and any look-ahead dodging understand.
   * Angle: radians below horizontal, the ray points left.
   * The beam never turns lethal ON the ship: a bullet that is created or swept onto it, or that sits next to it while a shield
   * has just taken a hit (`e.hold`), stays harmless until the beam has moved on; and a whole crossing costs a shield one hit.
   */
  function s3_colRay(e, on, ang, angNext, th) {
    const [ox, oy] = s3_colEye(e), tn = Math.tan(ang), tn1 = Math.tan(angNext), P = G.player;
    let shieldHits = 0;
    for (let i = 0; i < S3_NB; i++) {
      const x = ox - 9 - i * 10, y = oy + (ox - x) * tn;
      let b = e.rb[i];
      if (!on || x < -2 || y > S3C.FLOOR - 1) {
        if (b) b.dead = true;
        e.rb[i] = null;
        continue;
      }
      if (!b || b.dead) {
        b = e.rb[i] = G.ebullet(x, y, 0, 0, { spr: 's3_col_none', w: 12, h: 7, solid: false, quiet: true, raw: true, life: 99999 });
        if (!b) continue;
        b.harmless = true; // armed below as soon as it is clear of the ship
      }
      const vy = (ox - x) * (tn1 - tn) + (e.y - e.py);
      b.vx = 0;
      b.vy = vy;
      b.x = x;
      b.y = y - vy; // the engine adds vy right after this update: the bullet ends the frame exactly on the ray
      b.h = 3 + 4 * th;
      if (e.hold > 0 && Math.abs(x - P.x) < 40) b.harmless = true;
      else if (b.harmless && !overlap(P.x, P.y, 14, 10, x, y, 12, b.h)) b.harmless = false; // (the ship's hit box plus a margin)
      if (!b.harmless && P.shield > 0 && overlap(P.x + 18, P.y, 9, 25, x, y, 12, b.h) && ++shieldHits > 1) b.harmless = true;
    }
  }

  /** true when the stone will be bare `dt` frames from now */
  function s3_colBareAt(e, dt) {
    const tp = e.tp + (dt * TAU) / S3_PH[e.ph].per;
    return e.mid - s3_tide(tp, e.ph) * e.amp <= e.wl + 4;
  }

  function s3_colBegin(e, n) {
    const P = G.player, a = (e.at = { n, t: 0 });
    if (n === 'sweep' || n === 'scan') {
      // The ray starts on a row well BEHIND the ship (in the direction where there is more room) and sweeps through its lane
      // and a bit beyond: go with the beam, or step out of the dotted wedge during the telegraph.  A scan sweeps there and back.
      a.px = clamp(P.x, 24, 150);
      a.dir = 184 - P.y >= P.y - 14 ? 1 : -1; // +1: the ray comes down from above and herds the ship down
      const back = n === 'scan' ? 46 : 52, past = n === 'scan' ? 24 : 28, spd = n === 'scan' ? 0.95 : 0.85;
      a.y0 = Math.min(186, P.y - a.dir * back);
      a.y1 = P.y + a.dir * past;
      a.legs = n === 'scan' ? 2 : 1;
      a.T = Math.round(Math.abs(a.y1 - a.y0) / spd);
      a.u = 0;
      sfx('electric');
    } else if (n === 'rain') {
      // columns of rubble every 19 px with two gaps: one near the ship (but not on it), one far away
      const g1 = clamp(P.x + rnd(-34, 34), 40, 150);
      let g2 = rnd(28, 160);
      for (let k = 0; k < 8 && Math.abs(g2 - g1) < 80; k++) g2 = rnd(28, 160);
      a.cols = [];
      for (let x = 16; x <= 168; x += 19) if (Math.abs(x - g1) > 25 && Math.abs(x - g2) > 25) a.cols.push(x);
      sfx('stomp');
      e.shk = 40;
    } else if (n === 'surge') {
      sfx('eruption');
    } else if (n === 'spiral') {
      sfx('tentacle');
    }
  }

  /** one frame of the running attack; returns true when it is over */
  function s3_colAtk(e, P) {
    const a = e.at;
    a.t++;
    const t = a.t;
    switch (a.n) {
      case 'fan3':
      case 'fan5':
      case 'seq3':
      case 'seq5': {
        const seq = a.n[0] === 's', cnt = +a.n[3], gap = cnt === 3 ? 15 : 11, T = 34;
        e.mg = Math.min(1, t / T);
        if (t === 4) sfx('electric');
        const k = seq ? (t - T) / gap : 0;
        if (t >= T && (seq ? Number.isInteger(k) && k < cnt : t === T)) {
          const [mx, my] = s3_colMouth(e);
          const a0 = s3_headAim(mx, my, 0.55);
          sfx('ring');
          e.rc = 5;
          if (seq) s3_colRing(mx, my, a0 + rnd(-0.05, 0.05), 1.28);
          else for (let i = 0; i < cnt; i++) s3_colRing(mx, my, a0 + (i - (cnt - 1) / 2) * (cnt === 3 ? 0.37 : 0.27), cnt === 3 ? 1.2 : 1.15);
        }
        if (t >= T + (seq ? cnt * gap : 10)) {
          e.mg = 0;
          return true;
        }
        break;
      }
      case 'sweep':
      case 'scan': {
        e.eye = Math.min(1, t / (S3_TEL - 8));
        a.u = (t - S3_TEL) / a.T;
        if (t === S3_TEL) sfx('bossLaser');
        const on = t >= S3_TEL && t < S3_TEL + a.T * a.legs;
        s3_colRay(e, on, s3_colAng(e, a, a.u), s3_colAng(e, a, a.u + 1 / a.T), clamp((t - S3_TEL) / 8, 0, 1));
        if (t >= S3_TEL + a.T * a.legs + 6) {
          s3_colEnd(e);
          return true;
        }
        break;
      }
      case 'rain': {
        if (t === S3_TEL) {
          sfx('stomp');
          a.cols.forEach((x, i) => G.ebullet(x, -6, 0, 1.5, { spr: 's3_col_rock' + (i & 1), w: 7, h: 7, anim: 0, quiet: true }));
          if (e.ph === 3) {
            G.later(34, () => {
              if (!e.dead && P.alive) a.cols.forEach((x, i) => G.ebullet(x + 10, -6, 0, 1.5, { spr: 's3_col_rock' + ((i + 1) & 1), w: 7, h: 7, anim: 0, quiet: true }));
            });
          }
        }
        if (t >= S3_TEL + 8) return true;
        break;
      }
      case 'surge': {
        const two = e.stone.hp < e.stone.max * 0.5;
        e.sg = Math.min(1, t / 40);
        if (t === 40 || (two && t === 96)) {
          sfx('eruption');
          const y0 = e.wl - 5;
          const b = G.ebullet(S3C.HX - 52, y0, -1.35, 0, { spr: 's3_col_wave', w: 20, h: 56, anim: 5, solid: false, quiet: true });
          if (b) {
            // it never starts on top of the ship: harmless until it has cleared it
            b.harmless = overlap(P.x, P.y, 20, 14, b.x, b.y, 24, 60);
            b.custom = (q) => {
              q.y = y0 + Math.sin(q.t * 0.1) * 1.6;
              if (q.harmless && !overlap(G.player.x, G.player.y, 20, 14, q.x, q.y, 24, 60)) q.harmless = false;
            };
          }
        }
        if (t >= (two ? 104 : 54)) return true;
        break;
      }
      case 'spiral': {
        const T = 40;
        e.mg = Math.min(1, t / T);
        if (t === T) a.base = s3_headAim(...s3_colMouth(e), 0.3);
        const s = t - T;
        if (s >= 0 && s < 108) {
          const [mx, my] = s3_colMouth(e);
          if (s % 9 === 0) {
            s3_colRing(mx, my, a.base + 0.5 * Math.sin((s / 108) * TAU), 1.12);
            if (s % 27 === 0) sfx('ring');
            e.rc = 3;
          }
          if (s % 18 === 9) s3_colRing(mx, my, a.base - 0.5 * Math.sin(((s - 9) / 108) * TAU), 1.12);
        }
        if (s >= 118) {
          e.mg = 0;
          return true;
        }
        break;
      }
      default:
        return true;
    }
    return false;
  }

  /** stop the running attack and switch the ray off */
  function s3_colEnd(e) {
    e.at = null;
    e.eye = 0;
    e.mg = 0;
    for (const b of e.rb) if (b) b.dead = true;
    e.rb.length = 0;
  }


  /* ---------- the entity ---------- */
  const S3_HP = 200; // stone health at normal difficulty (scaled by difficulty and loop like every boss)
  const S3_TP0 = 0.75; // tide phase at the start of every phase: the head has just risen and the jaw has dropped

  /** the head is only solid (shots deflect, touching kills) while it is up and fighting; submerged or surfacing it is a picture */
  const s3_colArm = (e, on) => {
    for (const p of e.parts) p.dead = !on || (p === e.hatP && e.hat === 3);
    e.armed = on;
  };

  /** spray at the places where the head pierces the water, bubbles while it is below the surface */
  function s3_colFx(e) {
    const A = S3_COLA, sp = e.spray;
    const surf = s3_colSurface(e, e.x - 30);
    const hy = e.y + e.sink, top = hy - A.ay;
    if (e.st !== 'under' && top < e.wl - 2 && top + A.front.length > e.wl && e.sw > 0.5) {
      const mv = Math.abs(hy - (e.py + e.psink));
      const n = mv > 0.25 ? 2 : e.t % 7 === 0 ? 1 : 0;
      const row = clamp(Math.round(e.wl - top), 0, A.front.length - 1);
      for (let i = 0; i < n; i++) {
        const dir = i & 1 ? 1 : -1;
        const x = e.x - A.ax + (dir < 0 ? A.front[row] : A.back[row] + 1);
        sp.push({ x, y: s3_colSurface(e, x) - 1, vx: dir * rnd(0.1, 0.7), vy: -rnd(0.6, 1.7), t: 0, life: rndi(16, 32) });
      }
    }
    // ripple rings on the surface while the head dives, hides and surfaces (and while the swell builds at the start)
    const moving = e.st === 'dive' || e.st === 'under' || e.st === 'surf' || (e.st === 'enter' && e.pt > 4 && e.pt < 120);
    if (moving && e.t % 13 === 0) e.rip.push({ x: S3C.HX - 8 + rnd(-6, 6), t: 0 });
    for (let i = e.rip.length - 1; i >= 0; i--) if (++e.rip[i].t > 56) e.rip.splice(i, 1);
    if (e.st === 'under' && e.t % 4 === 0) sp.push({ x: S3C.HX + rnd(-34, 34), y: S3C.FLOOR - 3, vx: 0, vy: -rnd(0.3, 0.8), t: 0, life: 70, b: true });
    for (let i = sp.length - 1; i >= 0; i--) {
      const p = sp[i];
      p.t++;
      p.x += p.vx;
      p.y += p.vy;
      if (!p.b) p.vy += 0.07;
      if (p.t > p.life || (!p.b && p.y > surf + 2) || (p.b && p.y < e.wl - 4)) sp.splice(i, 1);
    }
    if (sp.length > 60) sp.splice(0, sp.length - 60);
  }

  /** phase change while the head is hidden: new tide, new look, clean sea */
  function s3_colTurn(e) {
    e.ph++;
    const ph = S3_PH[e.ph];
    e.mid = ph.mid;
    e.amp = ph.amp;
    e.tp = S3_TP0;
    e.gated = false;
    e.prog = 0;
    e.cd = 0;
    if (e.ph === 2) {
      e.hat = 1;
      e.crack = 1;
      e.glow = 0.5;
    } else {
      e.hat = 3;
      e.hatP.dead = true;
      e.crack = 2;
      e.glow = 1;
    }
    for (const b of G.eb) b.dead = true;
  }

  function s3_colDive(e) {
    e.st = 'dive';
    e.pt = 0;
    e.gated = true;
    e.stone.vuln = false;
    s3_colArm(e, false);
  }

  /** the topknot slides off and tumbles into the sea (a picture only) */
  function s3_colDropHat(e) {
    const x0 = e.x - 25, y0 = e.y - S3_COLA.ay - 22, wl = e.wl;
    G.fx.push({
      k: 'fn', x: e.x, y: e.y, t: 0, life: 90,
      draw: (c, f) => {
        const t = f.t, vy = 0.05 * t;
        const y = Math.min(wl - 8, y0 + 0.5 * 0.1 * t * t), x = x0 - 0.45 * t;
        if (y < wl - 8) {
          Sprites.drawTL(c, 's3_col_hat', Math.round(x), Math.round(y), { frame: 2 });
        } else {
          const s = t - Math.sqrt((wl - 8 - y0) / 0.05);
          c.save();
          c.beginPath();
          c.rect(0, 0, W, wl + 5);
          c.clip();
          Sprites.drawTL(c, 's3_col_hat', Math.round(x), Math.round(wl - 8 + s * 0.7), { frame: 2 });
          c.restore();
          if (s < 22) {
            c.fillStyle = '#ffffff';
            for (let i = -4; i <= 4; i++) {
              const h = (4 - Math.abs(i)) * (1 - s / 24) * 2.4;
              c.fillRect(Math.round(x + 26 + i * (3 + s * 0.4)), Math.round(wl - 2 - h), 2, Math.max(1, Math.round(h)));
            }
          }
        }
        void vy;
      },
    });
  }

  ENEMIES.s3_colossus = {
    w: 58, h: 104, hp: 99999, score: 10000, keep: true, silentDeath: true, keepOnBoss: true, expl: 'xl',
    init(e) {
      const A = S3_COLA;
      const hp = Math.round(S3_HP * G.diff.hp * (1 + 0.25 * G.loop));
      e.hp = e.maxHp = 99999;
      Object.assign(e, {
        x: S3C.HX, st: 'enter', pt: 0, phase: 'enter', ph: 1, tp: S3_TP0, mid: 137, amp: 25, wl: 145,
        sink: S3_DEEP, sw: 0, sg: 0, jaw: 0, hat: 0, crack: 0, glow: 0, eye: 0, mg: 0, rc: 0, shk: 0,
        at: null, cd: 0, prog: 0, armed: false, gated: false, spray: [], rip: [], py: 0, v: {}, rb: [], hold: 0, lastSh: 0,
      });
      e.y = e.mid - s3_tide(e.tp, 1) * e.amp;
      const mk = (name, g, o) => Object.assign({ name, ox: g.ox, oy: g.oy, w: g.w, h: g.h, hp: 99999, vuln: false }, o);
      e.stone = { name: 'stone', ox: A.stone.ox, oy: A.stone.oy, w: 14, h: 32, hp, max: hp, vuln: false, expl: 'xl', score: 5000 };
      e.hatP = mk('hat', A.hat);
      e.lowers = A.lower.map((b) => Object.assign(mk('lo', b), { base: b.oy, bh: b.h }));
      e.cheek = mk('cheek', { ox: A.cheek.ox, oy: A.cheek.top, w: A.cheek.w, h: 1 });
      e.psink = 0;
      // parts are tested in this order: the stone first (a shot that reaches it counts), then the rest of the head (which deflects)
      e.parts = [e.stone, e.hatP, ...A.upper.map((b) => mk('up', b)), ...e.lowers, e.cheek];
      s3_colArm(e, false);
    },

    update(e) {
      const P = G.player, A = S3_COLA;
      const ph = S3_PH[e.ph];
      e.pt++;
      // a shield that has just taken a hit (or an invulnerable ship) makes the eye ray harmless around the ship for a while
      if (P.shield < e.lastSh) e.hold = 50;
      e.lastSh = P.shield;
      if (P.inv > 0 || !P.alive) e.hold = Math.max(e.hold, 2);
      if (e.hold > 0) e.hold--;
      if (e.rc > 0.2) e.rc *= 0.82;
      else e.rc = 0;
      if (e.shk > 0) e.shk--;
      if (e.sg > 0 && !(e.at && e.at.n === 'surge')) e.sg = Math.max(0, e.sg - 0.03);
      if (!e.at) {
        e.eye *= 0.9;
        e.mg *= 0.9;
      }
      e.wl += (ph.wl - e.wl) * 0.03;
      if (e.st === 'fight') {
        e.mid += (ph.mid - e.mid) * 0.02;
        e.amp += (ph.amp - e.amp) * 0.02;
      }

      switch (e.st) {
        case 'enter':
          e.sw = Math.min(1, e.pt / 45);
          if (e.pt === 3) sfx('eruption');
          if (e.pt === 34) G.shake = Math.max(G.shake, 2);
          e.sink = S3_DEEP * (1 - s3_out((e.pt - 30) / 140));
          if (P.alive && P.x > S3C.HX - 56) P.x = S3C.HX - 56; // the surfacing head never lands on the ship
          if (e.pt >= 176) {
            e.st = 'fight';
            e.pt = 0;
            e.cd = 32;
            e.sink = 0;
            s3_colArm(e, true);
          }
          break;

        case 'fight': {
          e.tp += TAU / ph.per;
          if (!P.alive) {
            if (e.at) s3_colEnd(e);
          } else if (e.at) {
            if (s3_colAtk(e, P)) {
              s3_colEnd(e);
              e.cd = Math.round(G.fireDelay(ph.gap));
            }
          } else if (e.cd > 0) e.cd--;
          else {
            // the next attack in the programme that suits the water right now
            const prog = S3_PROG[e.ph], want = e.jaw === 2 && s3_colBareAt(e, 48) ? 'up' : e.jaw === 0 ? 'down' : '';
            for (let k = 0; k < prog.length && want; k++) {
              const i = (e.prog + k) % prog.length;
              if (prog[i][1] === 'any' || prog[i][1] === want) {
                s3_colBegin(e, prog[i][0]);
                e.prog = i + 1;
                break;
              }
            }
          }
          break;
        }

        case 'dive':
          if (e.pt === 1) {
            s3_colEnd(e);
            sfx('explodeM');
            G.shake = Math.max(G.shake, 4);
            if (e.ph === 2) {
              s3_colDropHat(e);
              e.hat = 3; // the picture of it is now tumbling into the sea
            }
          }
          e.sink = S3_DEEP * s3_ease(e.pt / 48);
          if (e.pt >= 48) {
            e.st = 'under';
            e.pt = 0;
            s3_colArm(e, false);
            s3_colTurn(e);
          }
          break;

        case 'under':
          e.sink = S3_DEEP;
          if (e.pt === 12) {
            sfx('stomp');
            G.shake = Math.max(G.shake, 3);
          }
          if (e.pt >= 36) {
            e.st = 'surf';
            e.pt = 0;
            sfx('eruption');
          }
          break;

        case 'surf':
          e.sink = S3_DEEP * (1 - s3_out(e.pt / 80));
          if (P.alive && P.x > S3C.HX - 56) P.x = S3C.HX - 56;
          if (e.pt >= 80) {
            e.st = 'roar';
            e.pt = 0;
          }
          break;

        case 'roar':
          e.sink = 0;
          if (P.alive && P.x > S3C.HX - 56) P.x = S3C.HX - 56;
          if (e.pt === 2) {
            sfx('explodeL');
            G.shake = Math.max(G.shake, 6);
            e.shk = 36;
            for (let i = 0; i < 16; i++) {
              G.fx.push({
                k: 'part', x: e.x + rnd(-24, 24), y: e.y - 77 + rnd(-8, 8), vx: rnd(-1.4, 1.4), vy: rnd(-1.6, -0.2),
                life: rndi(30, 54), t: 0, col: pick(['#82a082', '#567266', '#b6c89a', '#8e4a38']), big: chance(0.5),
              });
            }
          }
          if (e.pt >= 36) {
            e.st = 'fight';
            e.pt = 0;
            e.cd = Math.round(G.fireDelay(40));
            s3_colArm(e, true);
          }
          break;
        default:
          break;
      }

      /* ---- where the head is: the swell, minus any dive ---- */
      const yb = e.mid - s3_tide(e.tp, e.ph) * e.amp;
      e.py = e.y;
      e.psink = e.sink;
      e.y = yb; // (the dive is only a picture offset: the entity stays on the tide, so a dodging bot keeps its lane)
      e.x = S3C.HX + Math.sin(e.t * 0.011) * 1.5 + e.rc;
      // the jaw follows the water: it drops while the mouth is clear of the sea
      const want = yb + e.sink <= e.wl + 4 ? 2 : 0;
      if (e.t % 4 === 0 && e.jaw !== want) {
        e.jaw += e.jaw < want ? 1 : -1;
        if (e.jaw === 1) sfx(want === 2 ? 'coreOpen' : 'coreClose');
        // the window is over and the stone is almost down to the gate: the Colossus gives in rather than make you wait a whole tide
        if (e.jaw === 1 && want === 0 && e.st === 'fight' && !e.gated && ph.gate > 0 && e.stone.hp <= (ph.gate + 0.07) * e.stone.max) {
          e.stone.hp = ph.gate * e.stone.max;
          s3_colDive(e);
        }
      }
      // the stone's box is the part of the glowing throat that is above the water; below 12 px it counts as covered
      const sv = clamp(e.wl - (e.y + e.sink - 16), 0, 32);
      if (e.jaw === 2) {
        e.stone.h = Math.max(1, sv);
        e.stone.oy = -16 + e.stone.h / 2;
      } else {
        e.stone.h = 32;
        e.stone.oy = 0;
      }
      e.stone.vuln = e.st === 'fight' && e.jaw === 2 && sv >= 12 && !e.gated;
      // boxes follow the picture
      const jd = A.drop[e.jaw];
      for (const p of e.lowers) p.oy = p.base + jd;
      const lb = e.lowers[e.lowers.length - 1], ext = A.h - (A.h0 + jd); // the last band reaches down to the end of the base
      lb.h = lb.bh + ext;
      lb.oy = lb.base + jd + ext / 2;
      e.cheek.oy = A.cheek.top + jd / 2;
      e.cheek.h = Math.max(1, jd);
      s3_colFx(e);
      e.phase = 'P' + e.ph + ' ' + (e.st === 'fight' ? (e.at ? e.at.n : e.jaw === 2 ? 'up' : e.jaw === 0 ? 'sunk' : 'tide') : e.st);
    },

    gauge(e) {
      const p = e.stone;
      return Math.max(0, p.hp) / p.max;
    },

    onPartHurt(e, p) {
      if (p !== e.stone) return;
      const gate = S3_PH[e.ph].gate * p.max;
      if (gate > 0 && p.hp <= gate) {
        p.hp = gate; // the next phase cannot be skipped
        s3_colDive(e);
      }
    },

    onPartDeath(e, p) {
      if (p === e.stone) G.kill(e);
    },

    onDeath(e) {
      s3_colEnd(e);
      e.w = 58;
      e.h = 100;
      G.fx.push({ k: 'fn', x: e.x, y: e.y, t: 0, life: 142, draw: (c, f) => ENEMIES.s3_colossus.drawWreck(e, c, f) });
      e.y -= 24; // (the engine scatters its explosion chain around the entity: put that on the middle of the head)
      for (let i = 0; i < 46; i++) {
        G.later(i * 3, () => {
          const x = e.x + rnd(-30, 30), y = e.y - 69 + rnd(-30, 50);
          G.fx.push({
            k: 'part', x, y, vx: rnd(-1.2, 1.2), vy: rnd(-1.5, 0.2), life: rndi(28, 58), t: 0,
            col: pick(['#82a082', '#567266', '#b6c89a', '#34504c', '#e8ffff', '#86eef0']), big: chance(0.45),
          });
        });
      }
      G.bossDefeated(e);
    },

    /** the face crumbles tile by tile into the sea */
    drawWreck(e, c, f) {
      const A = S3_COLA, t = f.t, FL = S3C.FLOOR;
      const cv = Sprites.get('s3_col_head', 2), fl = Sprites.flashOf(cv);
      const sx = Math.round(f.x - A.ax), sy = Math.round(f.y - A.ay);
      const flashOn = !G.reduceFlash && t < 120 && (t >> 2) % 5 === 0;
      const surf = e.wl;
      c.save();
      c.beginPath();
      c.rect(0, 0, W, FL);
      c.clip();
      for (let ty = 0; ty < 14; ty++) {
        for (let tx = 0; tx < 10; tx++) {
          const tf = 14 + ty * 5.6 + s3_hash(tx * 19 + ty * 7) * 36;
          const s = Math.max(0, t - tf);
          let dx = 0, dy = 0;
          if (s > 0) {
            dx = (s3_hash(tx * 5 + ty * 11 + 1) - 0.5) * 0.5 * s;
            dy = 0.022 * s * s;
          } else if (t > 4) dx = (s3_hash(tx + ty * 10 + t * 3) - 0.5) * 1.6;
          const X = Math.round(sx + tx * 8 + dx), Y = Math.round(sy + ty * 8 + dy);
          if (Y > FL) continue;
          c.globalAlpha = s > 0 ? clamp(1 - (Y - surf) / 26, 0, 1) : 1;
          if (c.globalAlpha <= 0) continue;
          c.drawImage(flashOn ? fl : cv, tx * 8, ty * 8, Math.min(8, cv.width - tx * 8), 8, X, Y, Math.min(8, cv.width - tx * 8), 8);
          if (s > 0 && Y + 8 > surf && Y < surf + 9) {
            c.globalAlpha = 0.9;
            c.fillStyle = '#ffffff';
            c.fillRect(X + 2, Math.round(surf) - 2 - ((t + tx) & 3), 2, 2);
          }
        }
      }
      c.restore();
      c.globalAlpha = 1;
      const v = e.v;
      v.x = f.x;
      v.y = f.y;
      v.t = e.t + t;
      v.wl = e.wl;
      v.sw = 1 - s3_ease((t - 100) / 40);
      v.sg = 0;
      v.nocap = true;
      s3_colWater(c, v);
    },

    draw(e, c) {
      const v = e.v, sh = e.shk > 0 ? Math.min(1, e.shk / 10) : 0;
      v.x = e.x;
      v.y = e.y + e.sink;
      v.t = e.t;
      v.jaw = e.jaw;
      v.hat = e.hat;
      v.crack = e.crack;
      v.glow = e.glow;
      v.eye = e.eye;
      v.mg = e.mg;
      v.wl = e.wl;
      v.sw = e.sw;
      v.sg = e.sg;
      v.nocap = false;
      v.rip = e.rip;
      v.stone = e.jaw === 2 ? (e.stone.vuln ? 2 : 1) : 0;
      v.sbh = e.stone.h;
      v.sflash = e.stone.flash;
      v.jx = sh ? Math.round((s3_hash(e.t * 3) - 0.5) * 3 * sh) : 0;
      v.jy = sh ? Math.round((s3_hash(e.t * 5 + 1) - 0.5) * 3 * sh) : 0;
      v.hx = e.shk > 0 && e.at && e.at.n === 'rain' ? Math.round(Math.sin(e.t * 1.9)) : 0;
      s3_colDraw(c, v);
      // spray and bubbles
      for (const p of e.spray) {
        if (p.b) {
          c.globalAlpha = 0.6;
          c.fillStyle = '#bff8ff';
          c.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
          c.fillStyle = '#143c7a';
          c.fillRect(Math.round(p.x) + 1, Math.round(p.y) + 1, 1, 1);
        } else {
          c.globalAlpha = 1 - p.t / (p.life + 4);
          c.fillStyle = p.t & 2 ? '#ffffff' : '#bff8ff';
          c.fillRect(Math.round(p.x), Math.round(p.y), p.vy < -1 ? 1 : 2, p.vy < -1 ? 2 : 1);
        }
      }
      c.globalAlpha = 1;
      s3_colBeamFx(c, e);
    },
  };

  /* =============================================================
   * THE STAGE
   * ============================================================= */
  STAGES.push({
    id: 3,
    name: 'MOAI',
    sub: 'ISLE OF STONE GIANTS',
    music: 'stage3',
    bossMusic: 'boss',
    scroll: 0.65,
    scrollMap: [[2440, 0.48], [2880, 0.65]], // slower around the mother so a basic ship has time to hit her
    bossX: S3_BOSS_X,
    checkpoints: [0, 830, 1610, 2330, 3330],
    terrain: () => s3_terrain(),
    background: () => s3_background(),
    onReset(g) {
      s3_resetCam = g.camX;
    },

    script(S) {
      // every awake statue gets a ring emitter on its lips
      for (const L of s3_layout()) {
        const hd = L.hd;
        if (!hd.pat) continue;
        S.fixed(L.mx, L.my, 's3_mouth', { pat: hd.pat, rate: hd.rate, first: hd.first, spd: hd.spd, eyes: L.eyes, lip: L.lip });
      }

      /* ---- A. the shore: gulls, and one big lazy statue to get used to the scale ---- */
      S.ground(150, 's3_hopper');
      S.wave(70, 's3_bird', { n: 5, gap: 16, y: 72, amp: 22 });
      S.wave(170, 's3_bird', { n: 4, gap: 18, y: 98, amp: 16, carry: 'last' });
      S.wave(280, 'spinner', { n: 5, gap: 12, y: 50, dirY: 1, turnX: 150 });
      S.wave(372, 's3_bird', { n: 3, gap: 34, y: 34, mode: 'swoop' });

      /* ---- B. the first ring spitters ---- */
      S.wave(450, 's3_bird', { n: 5, gap: 14, y: 96, amp: 32, carry: 'last' });
      S.wave(560, 'spinner', { n: 4, gap: 12, y: 148, dirY: -1, turnX: 140 });
      S.wave(630, 's3_bird', { n: 4, gap: 16, y: 66, amp: 26 });
      S.wave(700, 's3_bird', { n: 3, gap: 36, y: 34, mode: 'swoop' });
      S.ground(805, 's3_hopper', { carry: true });

      /* ---- C. head field with an overhang ---- */
      S.wave(930, 's3_bird', { n: 5, gap: 14, y: 86, amp: 26 });
      S.ground(975, 's3_tiki');
      S.wave(1000, 's3_bird', { n: 4, gap: 18, y: 100, amp: 14, carry: 'last' });
      S.wave(1130, 'diver', { n: 3, gap: 22, y: 96, dy: 12 });
      S.wave(1240, 'spinner', { n: 5, gap: 12, y: 120, dirY: 1, turnX: 130 });

      /* ---- D. open ground before the cave ---- */
      S.wave(1400, 's3_bird', { n: 5, gap: 14, y: 90, amp: 30, carry: 'last' });
      S.ground(1590, 's3_hopper');
      S.wave(1450, 'diver', { n: 3, gap: 24, y: 50, dy: 30 });
      S.wave(1435, 'spinner', { n: 4, gap: 12, y: 64, dirY: 1, turnX: 140 });
      S.wave(1540, 's3_bird', { n: 4, gap: 16, y: 120, amp: 22 });
      S.ground(1560, 's3_tiki', { burst: true });

      /* ---- E. the quarry cave ---- */
      S.wave(1730, 's3_bird', { n: 4, gap: 16, y: 110, amp: 18, carry: 'last' });
      S.wave(1790, 's3_bird', { n: 3, gap: 18, y: 106, amp: 10 });
      S.wave(1900, 's3_bird', { n: 4, gap: 16, y: 108, amp: 18 });
      S.wave(1980, 's3_bird', { n: 3, gap: 18, y: 112, amp: 10 });
      S.wave(2050, 's3_bird', { n: 5, gap: 14, y: 108, amp: 16, carry: 'last' });
      S.wave(2150, 's3_bird', { n: 3, gap: 18, y: 106, amp: 12 });

      /* ---- F. approach and Mother & Child ---- */
      S.ground(2520, 's3_tiki');
      S.wave(2440, 's3_bird', { n: 4, gap: 16, y: 84, amp: 26, carry: 'last' });
      S.wave(2405, 'spinner', { n: 4, gap: 12, y: 50, dirY: 1, turnX: 150 });
      S.banner(2450, ['MOTHER AND CHILD']);
      S.at(2440, () => G.spawn('s3_mother', { x: W + 34, y: 124, carry: true }));
      S.wave(2900, 's3_bird', { n: 5, gap: 14, y: 96, amp: 28, carry: 'last' });

      /* ---- G. beyond the mother ---- */
      S.wave(2960, 's3_bird', { n: 4, gap: 16, y: 64, amp: 24 });
      S.wave(3020, 's3_bird', { n: 4, gap: 30, y: 34, mode: 'swoop' });
      S.wave(3100, 'diver', { n: 3, gap: 22, y: 70, dy: 16 });
      S.wave(3160, 'spinner', { n: 5, gap: 12, y: 140, dirY: -1, turnX: 130, carry: 'last' });

      /* ---- H. last checkpoint at 3330: recover power-ups before the Tide Colossus ---- */
      // (gulls here are a bit faster so the last squad has left the screen before the Colossus surfaces)
      S.wave(3440, 's3_bird', { n: 5, gap: 14, y: 80, amp: 22, speed: 1.5, carry: 'last' });
      S.wave(3485, 'spinner', { n: 5, gap: 12, y: 56, dirY: 1, turnX: 130, carry: 'last' });
      S.wave(3525, 's3_bird', { n: 5, gap: 14, y: 136, amp: 20, speed: 1.8, carry: 'last' });

      S.boss(S3_BOSS_X, 's3_colossus', {});
    },
  });
})();
