// Thinking Abacus seeps through the cracks.
//
// The guide's cell is a reservoir of ink. Between the cells of the territory
// there is negative space — grout lines, junctions, the odd wider pool where
// a cell's own radius clips it short. Ink flows through that space: out of the
// reservoir, along channels that lead toward the thoughts the conversation
// has made alive, wrapping their rims, splitting where a channel splits, and
// draining back home when the field goes quiet.
//
// Hidden here: a coarse grid over the world, the per-frame mask of what is
// passable, the flow (downhill toward poles, uphill toward home when quiet,
// a little diffusion so tips are round, a budget so reach follows the field),
// and the marching-squares contour that draws the ink as one surface.

const DEFAULTS = {
  step: 5,            // world units per grid cell
  shrink: 0.94,       // cells are rasterised a little smaller than drawn, so a
                      // crack is 3–4 grid cells wide and the ink licks the rims
  margin: 80,         // world margin around the territory
  threshold: 0.3,     // ink level that counts as surface
  reach: 700,         // distance over which a pole's attraction fades
  baseFlow: 0.12,     // isotropic seep per sub-step: fat veins, round tips
  driftFlow: 0.7,     // extra flow along the attraction gradient
  retreat: 0.35,      // flow toward home when the field is off
  substeps: 2,        // flow passes per frame: the front travels ~2 cells/frame
  budgetPerStrength: 480, // cells of ink per unit of field strength
  budgetFloor: 18,    // cells that always wet the reservoir's own rim
};

function pointInPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function createSeep({ world, ...options }) {
  const cfg = { ...DEFAULTS, ...options };
  const S = cfg.step;
  const X0 = -cfg.margin, Y0 = -cfg.margin;
  const W = Math.ceil((world.w + cfg.margin * 2) / S);
  const H = Math.ceil((world.h + cfg.margin * 2) / S);
  const ink = new Float32Array(W * H);
  const next = new Float32Array(W * H);
  const mask = new Uint8Array(W * H); // 0 blocked, 1 passable, 2 source
  let excitement = 0;
  let box = null; // active grid box {x0,y0,x1,y1}
  const centroid = { x: 0, y: 0, weight: 0 };
  let sourcePoly = null;

  const cx = (gx) => X0 + (gx + 0.5) * S;
  const cy = (gy) => Y0 + (gy + 0.5) * S;
  const clampBox = (b) => ({ x0: Math.max(0, b.x0), y0: Math.max(0, b.y0), x1: Math.min(W - 1, b.x1), y1: Math.min(H - 1, b.y1) });

  function polyBox(poly, pad = 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    return clampBox({
      x0: Math.floor((minX - X0) / S) - pad, y0: Math.floor((minY - Y0) / S) - pad,
      x1: Math.ceil((maxX - X0) / S) + pad, y1: Math.ceil((maxY - Y0) / S) + pad,
    });
  }

  // Passability inside the active box: everything is a crack until a cell
  // polygon says otherwise; the source polygon is the reservoir.
  function rasterize(blockers, source) {
    for (let gy = box.y0; gy <= box.y1; gy++) {
      const row = gy * W;
      for (let gx = box.x0; gx <= box.x1; gx++) mask[row + gx] = 1;
    }
    for (const raw of blockers) {
      if (!raw || raw.length < 3) continue;
      let px = 0, py = 0; for (const [x, y] of raw) { px += x; py += y; } px /= raw.length; py /= raw.length;
      const poly = raw.map(([x, y]) => [px + (x - px) * cfg.shrink, py + (y - py) * cfg.shrink]);
      const b = polyBox(poly);
      if (b.x1 < box.x0 || b.x0 > box.x1 || b.y1 < box.y0 || b.y0 > box.y1) continue;
      for (let gy = Math.max(b.y0, box.y0); gy <= Math.min(b.y1, box.y1); gy++) {
        const y = cy(gy), row = gy * W;
        for (let gx = Math.max(b.x0, box.x0); gx <= Math.min(b.x1, box.x1); gx++) {
          if (pointInPoly(poly, cx(gx), y)) mask[row + gx] = 0;
        }
      }
    }
    const sb = polyBox(source);
    for (let gy = Math.max(sb.y0, box.y0); gy <= Math.min(sb.y1, box.y1); gy++) {
      const y = cy(gy), row = gy * W;
      for (let gx = Math.max(sb.x0, box.x0); gx <= Math.min(sb.x1, box.x1); gx++) {
        if (pointInPoly(source, cx(gx), y)) { mask[row + gx] = 2; ink[row + gx] = 1; }
      }
    }
  }

  // Where the ink currently is, padded, so work follows the fluid.
  function findBox(source) {
    let b = polyBox(source, 3);
    if (box) {
      for (let gy = box.y0; gy <= box.y1; gy++) {
        const row = gy * W;
        for (let gx = box.x0; gx <= box.x1; gx++) {
          if (ink[row + gx] > 0.02 && mask[row + gx] !== 2) {
            b.x0 = Math.min(b.x0, gx - 4); b.x1 = Math.max(b.x1, gx + 4);
            b.y0 = Math.min(b.y0, gy - 4); b.y1 = Math.max(b.y1, gy + 4);
          }
        }
      }
    }
    return clampBox(b);
  }

  /**
   * One tick.
   * @param {object} p
   * @param {number[][][]} p.blockers  Inset cell polygons (world), the guide's included.
   * @param {number[][]} p.source      The guide's polygon: the reservoir.
   * @param {{x:number,y:number,strength:number}[]} p.poles
   * @param {number} [p.frame]         Frame-time factor.
   */
  function update({ blockers, source, poles, frame = 1 }) {
    if (!source || source.length < 3) return;
    sourcePoly = source;
    const field = poles.reduce((s, p) => s + p.strength, 0);
    excitement += (Math.min(1, field / 1.1) - excitement) * 0.08 * frame;

    // Clear ink outside the old box before it moves (it cannot have any), then
    // find the new box and refresh the mask inside it.
    box = findBox(source);
    rasterize(blockers, source);

    let hx = 0, hy = 0; for (const [x, y] of source) { hx += x; hy += y; } hx /= source.length; hy /= source.length;
    const budget = field > 0.12 ? cfg.budgetFloor + cfg.budgetPerStrength * field : cfg.budgetFloor * excitement;

    // Flow. Each wet cell pushes ink to passable neighbours, more along the
    // attraction gradient (toward poles when excited, toward home when not).
    const { x0, y0, x1, y1 } = box;
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) next[gy * W + gx] = ink[gy * W + gx];
    const attract = (x, y) => {
      let a = 0;
      for (const p of poles) {
        const d = Math.hypot(p.x - x, p.y - y);
        a += (p.strength * 1) / (1 + d / cfg.reach) * (-d); // lower is better: closer to poles
      }
      return a;
    };
    const homeAttract = (x, y) => -Math.hypot(hx - x, hy - y);
    const retreating = field <= 0.12;
    for (let pass = 0; pass < cfg.substeps; pass++) {
    if (pass > 0) for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) { const i = gy * W + gx; ink[i] = mask[i] === 2 ? 1 : mask[i] === 0 ? 0 : Math.min(1, next[i]); }
    for (let gy = y0 + 1; gy < y1; gy++) {
      for (let gx = x0 + 1; gx < x1; gx++) {
        const i = gy * W + gx;
        const c = ink[i];
        if (c < 0.01 || mask[i] === 0) continue;
        const x = cx(gx), y = cy(gy);
        const here = retreating ? homeAttract(x, y) : attract(x, y);
        let out = 0;
        const give = [];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = i + dx + dy * W;
          if (mask[j] === 0) continue;
          const nx = cx(gx + dx), ny = cy(gy + dy);
          const there = retreating ? homeAttract(nx, ny) : attract(nx, ny);
          const uphill = Math.max(0, (there - here) / S); // positive when the neighbour is more attractive
          const w = cfg.baseFlow + (retreating ? cfg.retreat : cfg.driftFlow) * Math.min(3, uphill * 8);
          const amount = c * w * frame;
          give.push([j, amount]);
          out += amount;
        }
        if (!out) continue;
        const scale = Math.min(1, (c * 0.7) / out);
        if (mask[i] !== 2) next[i] -= out * scale;
        for (const [j, amount] of give) {
          if (mask[j] === 2) continue; // absorbed by the reservoir
          next[j] += amount * scale;
        }
      }
    }
    }
    // Budget and settle.
    let total = 0, sx = 0, sy = 0;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const i = gy * W + gx;
        let v = mask[i] === 2 ? 1 : mask[i] === 0 ? 0 : Math.min(1, next[i]);
        if (mask[i] === 1) { if (retreating) v *= 0.985 ** frame; total += v; sx += cx(gx) * v; sy += cy(gy) * v; }
        ink[i] = v;
      }
    }
    if (total > budget && total > 0) {
      const k = budget / total;
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) { const i = gy * W + gx; if (mask[i] === 1) ink[i] *= k; }
      total = budget;
    }
    if (total > 0.5) { centroid.x = sx / (total || 1); centroid.y = sy / (total || 1); centroid.weight = total; }
    else { centroid.x = hx; centroid.y = hy; centroid.weight = 0; }
  }

  // Marching squares over the active box; returns loops of world points.
  function contours() {
    if (!box) return [];
    const T = cfg.threshold;
    const { x0, y0, x1, y1 } = box;
    const v = (gx, gy) => ink[gy * W + gx];
    const px = (gx) => cx(gx), py = (gy) => cy(gy);
    const lerp = (ax, ay, a, bx, by, b) => { const t = (T - a) / ((b - a) || 1e-6); return [ax + (bx - ax) * t, ay + (by - ay) * t]; };
    const segments = [];
    for (let gy = y0; gy < y1; gy++) {
      for (let gx = x0; gx < x1; gx++) {
        const a = v(gx, gy), b = v(gx + 1, gy), c = v(gx + 1, gy + 1), d = v(gx, gy + 1);
        const idx = (a >= T ? 8 : 0) | (b >= T ? 4 : 0) | (c >= T ? 2 : 0) | (d >= T ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const ax = px(gx), ay = py(gy), bx = px(gx + 1), by = py(gy + 1);
        const top = () => lerp(ax, ay, a, bx, ay, b), right = () => lerp(bx, ay, b, bx, by, c);
        const bottom = () => lerp(ax, by, d, bx, by, c), left = () => lerp(ax, ay, a, ax, by, d);
        switch (idx) {
          case 1: case 14: segments.push([left(), bottom()]); break;
          case 2: case 13: segments.push([bottom(), right()]); break;
          case 3: case 12: segments.push([left(), right()]); break;
          case 4: case 11: segments.push([top(), right()]); break;
          case 5: segments.push([left(), top()], [bottom(), right()]); break;
          case 6: case 9: segments.push([top(), bottom()]); break;
          case 7: case 8: segments.push([left(), top()]); break;
          case 10: segments.push([top(), right()], [left(), bottom()]); break;
          default:
        }
      }
    }
    const key = (p) => `${Math.round(p[0] * 4)},${Math.round(p[1] * 4)}`;
    const at = new Map();
    for (const seg of segments) for (const [from, to] of [[seg[0], seg[1]], [seg[1], seg[0]]]) {
      const k = key(from); if (!at.has(k)) at.set(k, []); at.get(k).push({ to, seg });
    }
    const used = new Set(), loops = [];
    for (const seg of segments) {
      if (used.has(seg)) continue;
      used.add(seg);
      const loop = [seg[0], seg[1]];
      let cursor = seg[1];
      for (let guard = 0; guard < segments.length; guard++) {
        const n = (at.get(key(cursor)) || []).find((e) => !used.has(e.seg));
        if (!n) break;
        used.add(n.seg); cursor = n.to;
        if (key(cursor) === key(loop[0])) break;
        loop.push(cursor);
      }
      if (loop.length >= 4) loops.push(loop);
    }
    return loops;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {(p:number[]) => number[]} project
   * @param {{fill:string, rim:string}} style
   */
  function draw(ctx, project, style) {
    const loops = contours();
    if (!loops.length) return;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    ctx.save();
    ctx.beginPath();
    for (const loop of loops) {
      const pts = loop.map(project), n = pts.length;
      let m = mid(pts[n - 1], pts[0]);
      ctx.moveTo(m[0], m[1]);
      for (let i = 0; i < n; i++) { const nx = mid(pts[i], pts[(i + 1) % n]); ctx.quadraticCurveTo(pts[i][0], pts[i][1], nx[0], nx[1]); }
      ctx.closePath();
    }
    ctx.fillStyle = style.fill;
    ctx.fill("evenodd");
    // Rim only where the ink has left its own cell.
    ctx.globalAlpha = 0.2 + 0.8 * excitement;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = style.rim;
    ctx.beginPath();
    for (const loop of loops) {
      const n = loop.length;
      for (let i = 0; i < n; i++) {
        const a = loop[i], b = loop[(i + 1) % n];
        if (sourcePoly && pointInPoly(sourcePoly, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
        const pa = project(a), pb = project(b);
        ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  return {
    update,
    draw,
    get centroid() { return centroid; },
    get excitement() { return excitement; },
    /** Ink outside the reservoir, in cells — how far the mind has reached. */
    get volume() { return centroid.weight; },
    get box() { return box; },
    /** Passable / blocked / source cells in the active box; wet = ink above the surface. */
    get stats() {
      if (!box) return null;
      let passable = 0, blocked = 0, source = 0, wet = 0;
      for (let gy = box.y0; gy <= box.y1; gy++) for (let gx = box.x0; gx <= box.x1; gx++) {
        const i = gy * W + gx;
        if (mask[i] === 0) blocked++; else if (mask[i] === 2) source++; else { passable++; if (ink[i] >= cfg.threshold) wet++; }
      }
      return { passable, blocked, source, wet, box };
    },
  };
}
