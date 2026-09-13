// Thinking Abacus as a ferrofluid.
//
// The guide is no longer a fixed cell at the centre of the mind. It is a
// small fluid: particles held together by cohesion, kept apart by volume,
// damped by viscosity, and pulled by a magnetic field whose poles are the
// thoughts the conversation has made alive. Under a strong field it reaches
// out in tendrils and splits between poles; when the field is quiet it
// collapses back into its own form over the cell it came from.
//
// Hidden here: the particle physics, the scalar field that turns particles
// into one gooey surface, and the marching-squares contouring that draws it
// without leaning on canvas filters (iOS Safari's are uneven).

const DEFAULTS = {
  count: 36,
  radius: 10,           // world units; the surface hugs the particle cloud at ~1 radius
  viscosity: 0.84,      // velocity kept per frame
  cohesion: 0.0022,     // pull toward the fluid's own centroid
  volume: 0.06,         // push apart when overlapping
  homeQuiet: 0.014,     // spring to the cell when nothing is alive
  homeExcited: 0.002,   // spring to the cell under a strong field
  magnet: 1.1,          // per-frame pull at a pole of strength 1, point blank
  reach: 420,           // distance at which a pole's pull has halved
  threshold: 0.85,      // a little under 1 so a thin tendril still reads as one body
};

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function createFerrofluid(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const random = rand(7);
  const particles = Array.from({ length: cfg.count }, () => ({ x: 0, y: 0, vx: 0, vy: 0 }));
  let placed = false;
  let excitement = 0; // 0 quiet … 1 fully under field, eased
  const centre = { x: 0, y: 0 };

  function place(home) {
    for (const p of particles) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * cfg.radius * 3.2;
      p.x = home.x + Math.cos(a) * r;
      p.y = home.y + Math.sin(a) * r;
      p.vx = p.vy = 0;
    }
    placed = true;
  }

  /**
   * One physics step.
   * @param {{x:number,y:number}} home           The guide cell's generator.
   * @param {{x:number,y:number,strength:number,radius?:number}[]} poles  Alive thoughts and their cell radii.
   * @param {number} frame                         Frame-time factor (1 = 16.7 ms).
   */
  function step(home, poles, frame = 1) {
    if (!placed) place(home);
    const field = poles.reduce((s, p) => s + p.strength, 0);
    excitement += (Math.min(1, field / 1.2) - excitement) * 0.08 * frame;
    const homeK = cfg.homeQuiet + (cfg.homeExcited - cfg.homeQuiet) * excitement;

    let cx = 0, cy = 0;
    for (const p of particles) { cx += p.x; cy += p.y; }
    cx /= particles.length; cy /= particles.length;
    centre.x = cx; centre.y = cy;

    const minDist = cfg.radius * 1.15;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      // Cohesion and home.
      p.vx += (cx - p.x) * cfg.cohesion + (home.x - p.x) * homeK;
      p.vy += (cy - p.y) * cfg.cohesion + (home.y - p.y) * homeK;
      // Magnetism: every pole pulls, weaker with distance; the nearest
      // particles go first, which is what makes a tendril rather than a march.
      for (const pole of poles) {
        const dx = pole.x - p.x, dy = pole.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const ratio = d / cfg.reach;
        // The pull saturates at the idea's rim and reverses inside it: the
        // fluid presses against a thought, it does not swallow it.
        const rim = (pole.radius ?? 60) * 0.92;
        const approach = Math.max(-1, Math.min(1, (d - rim) / 70));
        const f = ((cfg.magnet * pole.strength) / (1 + ratio * ratio)) * approach;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
      }
      // Volume.
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = q.x - p.x, dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < minDist) {
          const push = ((minDist - d) / d) * cfg.volume;
          p.vx -= dx * push; p.vy -= dy * push;
          q.vx += dx * push; q.vy += dy * push;
        }
      }
    }
    for (const p of particles) {
      p.vx *= cfg.viscosity; p.vy *= cfg.viscosity;
      p.x += p.vx * frame; p.y += p.vy * frame;
    }
  }

  // Scalar field of the metaballs at a world point.
  function fieldAt(x, y, r2) {
    let s = 0;
    for (const p of particles) {
      const dx = x - p.x, dy = y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2 * 9) s += r2 / (d2 + 1);
    }
    return s;
  }

  // Marching squares over the particles' bounding box; returns closed loops
  // of world points. Grid step is chosen in screen pixels so cost follows
  // what is visible, not the world.
  function contours(stepWorld) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of particles) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const pad = cfg.radius * 2.6;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const cols = Math.ceil((maxX - minX) / stepWorld);
    const rows = Math.ceil((maxY - minY) / stepWorld);
    if (cols * rows > 40_000) return [];
    const r2 = cfg.radius * cfg.radius;
    const values = new Float32Array((cols + 1) * (rows + 1));
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        values[j * (cols + 1) + i] = fieldAt(minX + i * stepWorld, minY + j * stepWorld, r2);
      }
    }
    const T = cfg.threshold;
    const at = (i, j) => values[j * (cols + 1) + i];
    const lerp = (x0, y0, v0, x1, y1, v1) => {
      const t = (T - v0) / ((v1 - v0) || 1e-6);
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    };
    const segments = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x0 = minX + i * stepWorld, y0 = minY + j * stepWorld, x1 = x0 + stepWorld, y1 = y0 + stepWorld;
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        const idx = (a >= T ? 8 : 0) | (b >= T ? 4 : 0) | (c >= T ? 2 : 0) | (d >= T ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const top = () => lerp(x0, y0, a, x1, y0, b);
        const right = () => lerp(x1, y0, b, x1, y1, c);
        const bottom = () => lerp(x0, y1, d, x1, y1, c);
        const left = () => lerp(x0, y0, a, x0, y1, d);
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
    // Link segments into loops by endpoint.
    const key = (p) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
    const byStart = new Map();
    for (const seg of segments) {
      for (const [from, to] of [[seg[0], seg[1]], [seg[1], seg[0]]]) {
        const k = key(from);
        if (!byStart.has(k)) byStart.set(k, []);
        byStart.get(k).push({ to, seg });
      }
    }
    const used = new Set();
    const loops = [];
    for (const seg of segments) {
      if (used.has(seg)) continue;
      used.add(seg);
      const loop = [seg[0], seg[1]];
      let cursor = seg[1];
      for (let guard = 0; guard < segments.length; guard++) {
        const next = (byStart.get(key(cursor)) || []).find((e) => !used.has(e.seg));
        if (!next) break;
        used.add(next.seg);
        cursor = next.to;
        if (key(cursor) === key(loop[0])) break;
        loop.push(cursor);
      }
      if (loop.length >= 6) loops.push(loop);
    }
    return loops;
  }

  /**
   * Draw the fluid.
   * @param {CanvasRenderingContext2D} ctx
   * @param {(p:number[]) => number[]} project   World → screen.
   * @param {number} scale                        World units per screen pixel⁻¹.
   * @param {{fill:string, rim:string, stepPx?:number}} style
   */
  function draw(ctx, project, scale, style) {
    if (!placed) return;
    const stepWorld = (style.stepPx ?? 5) / scale;
    const loops = contours(stepWorld);
    if (!loops.length) return;
    ctx.save();
    ctx.beginPath();
    for (const loop of loops) {
      const pts = loop.map(project);
      // Smooth through midpoints so the grid never shows.
      const n = pts.length;
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let m = mid(pts[n - 1], pts[0]);
      ctx.moveTo(m[0], m[1]);
      for (let i = 0; i < n; i++) {
        const next = mid(pts[i], pts[(i + 1) % n]);
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], next[0], next[1]);
      }
      ctx.closePath();
    }
    ctx.fillStyle = style.fill;
    ctx.fill("evenodd");
    // The rim brightens as the fluid reaches out; at rest, inside its own
    // ink cell, it is simply more ink.
    ctx.globalAlpha = 0.15 + 0.85 * excitement;
    ctx.lineWidth = 1.6 + excitement * 1.2;
    ctx.strokeStyle = style.rim;
    ctx.stroke();
    ctx.restore();
  }

  return {
    step,
    draw,
    /** Where the fluid's mass is; the cell's generator follows this. */
    get centre() { return centre; },
    /** Longest axis of the fluid, for knowing whether it has stretched or split. */
    get spread() {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of particles) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
      return Math.max(maxX - minX, maxY - minY);
    },
    get excitement() { return excitement; },
    reset(home) { place(home); excitement = 0; },
  };
}
