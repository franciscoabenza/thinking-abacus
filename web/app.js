import { CONCEPTS, LINKS } from "./concepts.js";

// ---------------------------------------------------------------------------
// A living field, not a folder tree.
// ---------------------------------------------------------------------------
const CFG = { round: 8, pack: 0.9, hier: 0.62, motion: 0.018 };
const MODEL = "gpt-realtime-2";
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const PAL = {
  bg: "#e9e4d8",
  cell: "#f7f3e9",
  cellSoft: "#f1ecdf",
  ink: "#151713",
  inkSoft: "rgba(21,23,19,0.55)",
  stroke: "rgba(21,23,19,0.48)",
  acid: "#c7ff38",
  coral: "#ff6b52",
  blue: "#4c5cff",
  kinds: {
    interface: "#ecebff",
    prototype: "#f5edcf",
    "tiny prototype": "#f5edcf",
    memory: "#f6e3db",
    provocation: "#e7edff",
    question: "#e7edff",
    bridge: "#ece6fa",
    observation: "#e5eee4",
    conviction: "#eef5d8",
  },
};

const WORLD = { w: 1760, h: 1220 };
const cv = document.getElementById("map");
const ctx = cv.getContext("2d");
let VW = 0;
let VH = 0;
let dpr = 1;

function resize() {
  VW = cv.clientWidth;
  VH = cv.clientHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(VW * dpr);
  cv.height = Math.round(VH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);

const cam = {
  x: WORLD.w / 2,
  y: WORLD.h / 2,
  scale: 0.65,
  tx: WORLD.w / 2,
  ty: WORLD.h / 2,
  ts: 0.65,
};

function worldToScreen(p) {
  return [(p[0] - cam.x) * cam.scale + VW / 2, (p[1] - cam.y) * cam.scale + VH / 2];
}

function screenToWorld(sx, sy) {
  return [(sx - VW / 2) / cam.scale + cam.x, (sy - VH / 2) / cam.scale + cam.y];
}

// ---------------------------------------------------------------------------
// Nodes: deterministic loose clusters keep each reload recognisably the same.
// ---------------------------------------------------------------------------
const MAX_N = 14;
let nodes = [];
let edges = [];

const CLUSTERS = {
  reflective: [480, 420],
  embodied: [760, 310],
  interface: [1280, 510],
  system: [720, 900],
  wild: [1130, 900],
};

function clusterFor(kind) {
  if (["interface", "prototype", "tiny prototype"].includes(kind)) return CLUSTERS.interface;
  if (["system", "life system", "mechanism"].includes(kind)) return CLUSTERS.system;
  if (["thesis", "lens", "bridge"].includes(kind)) return CLUSTERS.embodied;
  if (["memory", "metaphor", "observation", "provocation", "conviction"].includes(kind)) return CLUSTERS.wild;
  return CLUSTERS.reflective;
}

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededPosition(concept) {
  const h = hashString(concept.id);
  const anchor = clusterFor(concept.kind);
  const angle = ((h % 997) / 997) * Math.PI * 2;
  const radius = 75 + ((h >>> 9) % 250);
  const vertical = 0.72 + ((h >>> 17) % 20) / 100;
  return [anchor[0] + Math.cos(angle) * radius, anchor[1] + Math.sin(angle) * radius * vertical];
}

function makeNode(concept, opts = {}) {
  const seeded = seededPosition(concept);
  return {
    ...concept,
    id: concept.id,
    name: concept.name,
    note: concept.note || "",
    fragment: concept.fragment || "",
    question: concept.question || "What does this thought make possible?",
    source: concept.source || "A new thought",
    tags: concept.tags || [],
    kind: concept.kind || "thought",
    n: concept.n || 5,
    spawned: Boolean(opts.spawned),
    guide: Boolean(opts.guide),
    x: opts.x ?? seeded[0],
    y: opts.y ?? seeded[1],
    vx: 0,
    vy: 0,
    phase: (hashString(`${concept.id}-phase`) % 628) / 100,
    phase2: (hashString(`${concept.id}-phase-two`) % 628) / 100,
    sc: opts.spawned ? 0.02 : 1,
    highlight: 0,
  };
}

function rebuildEdges() {
  const index = {};
  nodes.forEach((node, i) => { index[node.id] = i; });
  const seen = new Set();
  edges = [];
  for (const [from, to, relation] of LINKS) {
    if (index[from] == null || index[to] == null) continue;
    const key = [index[from], index[to]].sort((a, b) => a - b).join("-");
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ a: index[from], b: index[to], relation: relation || "an unfinished connection" });
  }
}

function initNodes() {
  nodes = CONCEPTS.map((concept) => makeNode(concept));
  const guide = makeNode({
    id: "abacus",
    name: "Ask Abacus",
    kind: "voice guide",
    note: "A voice guide that can focus, connect, and grow the field while you speak.",
    fragment: "Say what you are circling around.",
    question: "What are you trying to understand?",
    source: "live conversation",
    n: 9,
  }, { guide: true, x: WORLD.w / 2 + 70, y: WORLD.h / 2 + 10 });
  nodes.push(guide);
  rebuildEdges();
}

function radiusOf(node) {
  const ratio = Math.sqrt(node.n) / Math.sqrt(MAX_N);
  const radius = 41 + (16 + 48 * CFG.hier) * ratio;
  return node.guide ? Math.max(radius, 66) : radius;
}

// ---------------------------------------------------------------------------
// Geometry: rounded, weighted Voronoi cells with breathing room at junctions.
// ---------------------------------------------------------------------------
const NGON = [];
for (let k = 0; k < 22; k++) {
  const angle = (k / 22) * Math.PI * 2;
  NGON.push([Math.cos(angle), Math.sin(angle)]);
}
const RECT = [[-80, -80], [WORLD.w + 80, -80], [WORLD.w + 80, WORLD.h + 80], [-80, WORLD.h + 80]];

function clipHalf(poly, ax, ay, c) {
  if (poly.length === 0) return poly;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const pointA = poly[i];
    const pointB = poly[(i + 1) % poly.length];
    const distanceA = ax * pointA[0] + ay * pointA[1] - c;
    const distanceB = ax * pointB[0] + ay * pointB[1] - c;
    const insideA = distanceA <= 0;
    if (insideA) out.push(pointA);
    if (insideA !== (distanceB <= 0)) {
      const t = distanceA / (distanceA - distanceB);
      out.push([pointA[0] + t * (pointB[0] - pointA[0]), pointA[1] + t * (pointB[1] - pointA[1])]);
    }
  }
  return out;
}

function cellOf(focus) {
  let poly = RECT;
  for (const other of nodes) {
    if (other === focus) continue;
    const ax = 2 * (other.x - focus.x);
    const ay = 2 * (other.y - focus.y);
    const c = other.x ** 2 + other.y ** 2 - focus.x ** 2 - focus.y ** 2 - other._w2 + focus._w2;
    poly = clipHalf(poly, ax, ay, c);
    if (poly.length === 0) return poly;
  }
  for (const normal of NGON) {
    poly = clipHalf(poly, normal[0], normal[1], focus.x * normal[0] + focus.y * normal[1] + focus._R);
    if (poly.length === 0) return poly;
  }
  return poly;
}

function centroid(poly) {
  let x = 0;
  let y = 0;
  for (const point of poly) {
    x += point[0];
    y += point[1];
  }
  return [x / poly.length, y / poly.length];
}

function pointInPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function roundPath(poly, radius) {
  if (poly.length < 3) return;
  ctx.beginPath();
  for (let i = 0; i < poly.length; i++) {
    const previous = poly[(i - 1 + poly.length) % poly.length];
    const vertex = poly[i];
    const next = poly[(i + 1) % poly.length];
    const v1x = previous[0] - vertex[0];
    const v1y = previous[1] - vertex[1];
    const v2x = next[0] - vertex[0];
    const v2y = next[1] - vertex[1];
    const length1 = Math.hypot(v1x, v1y) || 1;
    const length2 = Math.hypot(v2x, v2y) || 1;
    const turn = Math.min(radius, length1 * 0.48, length2 * 0.48);
    const ax = vertex[0] + (v1x / length1) * turn;
    const ay = vertex[1] + (v1y / length1) * turn;
    const bx = vertex[0] + (v2x / length2) * turn;
    const by = vertex[1] + (v2y / length2) * turn;
    if (i === 0) ctx.moveTo(ax, ay);
    else ctx.lineTo(ax, ay);
    ctx.quadraticCurveTo(vertex[0], vertex[1], bx, by);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Near-still force field.
// ---------------------------------------------------------------------------
function step(time) {
  for (const node of nodes) {
    node._R = radiusOf(node);
    node._w2 = (node._R * 0.72) ** 2;
    node.sc += (1 - node.sc) * 0.08;
    if (node.highlight > 0) node.highlight = Math.max(0, node.highlight - 0.009);
  }

  for (const edge of edges) {
    const first = nodes[edge.a];
    const second = nodes[edge.b];
    let dx = second.x - first.x;
    let dy = second.y - first.y;
    const distance = Math.hypot(dx, dy) || 0.01;
    const target = (first._R + second._R) * 1.12;
    const force = ((distance - target) * 0.011) / distance;
    dx *= force;
    dy *= force;
    first.vx += dx;
    first.vy += dy;
    second.vx -= dx;
    second.vy -= dy;
  }

  const separation = 0.63 - 0.2 * CFG.pack;
  for (let i = 0; i < nodes.length; i++) {
    const first = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const second = nodes[j];
      let dx = second.x - first.x;
      let dy = second.y - first.y;
      const distance = Math.hypot(dx, dy) || 0.01;
      const target = (first._R + second._R) * separation;
      if (distance < target) {
        const force = ((target - distance) / distance) * 0.047;
        dx *= force;
        dy *= force;
        first.vx -= dx;
        first.vy -= dy;
        second.vx += dx;
        second.vy += dy;
      }
    }
  }

  const amplitude = REDUCED_MOTION ? 0 : 0.012 + 0.05 * CFG.motion;
  for (const node of nodes) {
    const anchor = node.guide ? [WORLD.w / 2 + 70, WORLD.h / 2 + 10] : clusterFor(node.kind);
    node.vx += (anchor[0] - node.x) * 0.00018 + amplitude * Math.sin(time * 0.47 + node.phase);
    node.vy += (anchor[1] - node.y) * 0.00018 + amplitude * Math.cos(time * 0.39 + node.phase2);
    node.vx *= 0.86;
    node.vy *= 0.86;
    node.x += node.vx;
    node.y += node.vy;
  }
}

// ---------------------------------------------------------------------------
// Drawing.
// ---------------------------------------------------------------------------
let hoverId = -1;
let focusId = -1;
let previousFocusId = -1;

function drawFieldMarks() {
  ctx.save();
  ctx.fillStyle = "rgba(21,23,19,0.11)";
  for (let x = 80; x < WORLD.w; x += 120) {
    for (let y = 70; y < WORLD.h; y += 120) {
      const screen = worldToScreen([x, y]);
      if (screen[0] < -2 || screen[0] > VW + 2 || screen[1] < -2 || screen[1] > VH + 2) continue;
      ctx.fillRect(screen[0], screen[1], 1, 1);
    }
  }
  ctx.restore();
}

function drawThreads(time) {
  if (focusId < 0) return;
  const visibleEdges = edges.filter((edge) => edge.a === focusId || edge.b === focusId);
  ctx.save();
  ctx.lineCap = "round";
  for (const edge of visibleEdges) {
    const from = worldToScreen([nodes[edge.a].x, nodes[edge.a].y]);
    const to = worldToScreen([nodes[edge.b].x, nodes[edge.b].y]);
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy) || 1;
    const bend = Math.min(42, length * 0.12);
    const mx = (from[0] + to[0]) / 2 - (dy / length) * bend;
    const my = (from[1] + to[1]) / 2 + (dx / length) * bend;
    const isArrival = [edge.a, edge.b].includes(previousFocusId);
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.quadraticCurveTo(mx, my, to[0], to[1]);
    ctx.setLineDash(isArrival ? [4, 6] : [2, 7]);
    ctx.lineDashOffset = REDUCED_MOTION ? 0 : -time * (isArrival ? 10 : 4);
    ctx.lineWidth = isArrival ? 2 : 1;
    ctx.strokeStyle = isArrival ? "rgba(76,92,255,0.78)" : "rgba(21,23,19,0.2)";
    ctx.stroke();
  }
  ctx.restore();
}

// Labels are rasterized once into stable textures. Zoom changes only move those
// textures through the field; reflow happens at three bands with hysteresis,
// so line breaks never chatter while the camera eases between frames.
const labelSprites = new Map();
let fontGeneration = 0;
const LABEL_BANDS = {
  small: { titleSize: 12.5, titleWidth: 62, fragmentSize: 10, fragmentWidth: 78, nominalRadius: 34 },
  medium: { titleSize: 15, titleWidth: 88, fragmentSize: 11, fragmentWidth: 104, nominalRadius: 52 },
  large: { titleSize: 18, titleWidth: 122, fragmentSize: 12.5, fragmentWidth: 140, nominalRadius: 76 },
};

if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    fontGeneration += 1;
    labelSprites.clear();
  });
}

function textLines(measureContext, text, maxWidth, maxLines = 3) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measureContext.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    clipped[maxLines - 1] = `${clipped[maxLines - 1].replace(/[.,;:]$/, "")}…`;
    return clipped;
  }
  return lines;
}

function ensureTextFluid(node) {
  if (node._textFluid) return node._textFluid;
  const seed = hashString(`${node.id}-text-fluid`);
  node._textFluid = {
    band: null,
    visible: node.n >= 9,
    emphasis: 0.74,
    fragmentAlpha: 0,
    anchorX: null,
    anchorY: null,
    anchorVx: 0,
    anchorVy: 0,
    title: {
      ox: (((seed >>> 2) % 100) / 100 - 0.5) * 4,
      oy: (((seed >>> 9) % 100) / 100 - 0.5) * 3,
      vx: 0,
      vy: 0,
    },
    fragment: {
      ox: (((seed >>> 15) % 100) / 100 - 0.5) * 4,
      oy: 12 + (((seed >>> 21) % 100) / 100) * 4,
      vx: 0,
      vy: 0,
    },
  };
  return node._textFluid;
}

function settleTextAnchor(fluid, target) {
  if (fluid.anchorX == null || fluid.anchorY == null || REDUCED_MOTION) {
    fluid.anchorX = target[0];
    fluid.anchorY = target[1];
    fluid.anchorVx = 0;
    fluid.anchorVy = 0;
    return [fluid.anchorX, fluid.anchorY];
  }

  fluid.anchorVx += (target[0] - fluid.anchorX) * 0.018 * textFrameFactor;
  fluid.anchorVy += (target[1] - fluid.anchorY) * 0.018 * textFrameFactor;
  const anchorDrag = Math.pow(0.84, textFrameFactor);
  fluid.anchorVx *= anchorDrag;
  fluid.anchorVy *= anchorDrag;
  fluid.anchorX += fluid.anchorVx * textFrameFactor;
  fluid.anchorY += fluid.anchorVy * textFrameFactor;

  // A topology change can move the polygon centroid abruptly. Preserve the
  // viscous transition, but cap lag so the label can never abandon its cell.
  const dx = fluid.anchorX - target[0];
  const dy = fluid.anchorY - target[1];
  const distance = Math.hypot(dx, dy);
  const maxLag = 22;
  if (distance > maxLag) {
    fluid.anchorX = target[0] + (dx / distance) * maxLag;
    fluid.anchorY = target[1] + (dy / distance) * maxLag;
  }
  return [fluid.anchorX, fluid.anchorY];
}

function chooseLabelBand(fluid, screenRadius) {
  if (!fluid.band) {
    fluid.band = screenRadius < 42 ? "small" : screenRadius < 64 ? "medium" : "large";
    return fluid.band;
  }
  if (fluid.band === "small" && screenRadius > 47) fluid.band = "medium";
  else if (fluid.band === "medium" && screenRadius < 37) fluid.band = "small";
  else if (fluid.band === "medium" && screenRadius > 70) fluid.band = "large";
  else if (fluid.band === "large" && screenRadius < 57) fluid.band = "medium";
  return fluid.band;
}

function makeLabelSprite(node, bandName, variant, role) {
  const key = `${fontGeneration}|${node.id}|${bandName}|${variant}|${role}`;
  if (labelSprites.has(key)) return labelSprites.get(key);

  const band = LABEL_BANDS[bandName];
  const rasterScale = 2;
  const measure = document.createElement("canvas").getContext("2d");
  const isLight = variant === "selected" || variant === "guide";
  const titleColor = isLight ? "#f7f3e9" : PAL.ink;
  const signalColor = variant === "selected" || variant === "guide" ? PAL.acid : PAL.blue;
  let lines;
  let font;
  let lineHeight;
  let showKind = false;
  let maxWidth;

  if (role === "title") {
    font = `${node.guide ? "italic " : ""}400 ${node.guide ? band.titleSize + 1.5 : band.titleSize}px "Instrument Serif", Georgia, serif`;
    lineHeight = band.titleSize * 0.94;
    maxWidth = node.guide ? band.titleWidth + 18 : band.titleWidth;
    measure.font = font;
    lines = textLines(measure, node.name, maxWidth, node.guide ? 2 : 3);
    showKind = bandName !== "small";
  } else {
    font = `italic 400 ${band.fragmentSize}px "Instrument Serif", Georgia, serif`;
    lineHeight = band.fragmentSize * 1.05;
    maxWidth = band.fragmentWidth;
    measure.font = font;
    lines = textLines(measure, node.fragment, maxWidth, 2);
  }

  const measuredWidth = Math.max(...lines.map((line) => measure.measureText(line).width), 1);
  const kindHeight = showKind ? 12 : 0;
  const paddingX = 7;
  const paddingY = 5;
  const width = Math.ceil(Math.min(maxWidth + 4, measuredWidth) + paddingX * 2);
  const height = Math.ceil(lines.length * lineHeight + kindHeight + paddingY * 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * rasterScale);
  canvas.height = Math.ceil(height * rasterScale);
  const spriteContext = canvas.getContext("2d");
  spriteContext.scale(rasterScale, rasterScale);
  spriteContext.textAlign = "center";
  spriteContext.textBaseline = "middle";

  if (showKind) {
    spriteContext.font = `400 6.5px "DM Mono", monospace`;
    spriteContext.fillStyle = signalColor;
    spriteContext.fillText(node.kind.toUpperCase(), width / 2, paddingY + 3.5);
  }

  spriteContext.font = font;
  spriteContext.fillStyle = role === "fragment" ? (isLight ? "rgba(247,243,233,.72)" : "rgba(21,23,19,.66)") : titleColor;
  const textTop = paddingY + kindHeight;
  lines.forEach((line, lineIndex) => {
    spriteContext.fillText(line, width / 2, textTop + lineHeight * (lineIndex + 0.5));
  });

  const sprite = { canvas, width, height };
  labelSprites.set(key, sprite);
  return sprite;
}

function borderRepulsion(poly, x, y, sprite) {
  if (!pointInPoly(poly, x, y)) {
    const center = centroid(poly);
    const dx = center[0] - x;
    const dy = center[1] - y;
    const distance = Math.hypot(dx, dy) || 1;
    return { x: (dx / distance) * 1.2, y: (dy / distance) * 1.2, pressure: 1 };
  }

  let forceX = 0;
  let forceY = 0;
  let pressure = 0;
  for (let i = 0; i < poly.length; i++) {
    const first = poly[i];
    const second = poly[(i + 1) % poly.length];
    const edgeX = second[0] - first[0];
    const edgeY = second[1] - first[1];
    const lengthSquared = edgeX * edgeX + edgeY * edgeY || 1;
    const t = Math.max(0, Math.min(1, ((x - first[0]) * edgeX + (y - first[1]) * edgeY) / lengthSquared));
    const nearestX = first[0] + edgeX * t;
    const nearestY = first[1] + edgeY * t;
    const dx = x - nearestX;
    const dy = y - nearestY;
    const distance = Math.hypot(dx, dy) || 0.001;
    const normalX = dx / distance;
    const normalY = dy / distance;
    const requiredDistance = Math.abs(normalX) * sprite.width * 0.5 + Math.abs(normalY) * sprite.height * 0.5 + 7;
    if (distance >= requiredDistance) continue;
    const amount = (requiredDistance - distance) / Math.max(requiredDistance, 1);
    const eased = amount * amount;
    forceX += normalX * eased;
    forceY += normalY * eased;
    pressure = Math.max(pressure, amount);
  }
  return { x: forceX, y: forceY, pressure };
}

function updateFluidText(body, node, center, poly, sprite, time, targetX, targetY, motionScale = 1) {
  if (REDUCED_MOTION) {
    body.ox += (targetX - body.ox) * 0.2;
    body.oy += (targetY - body.oy) * 0.2;
    body.vx = 0;
    body.vy = 0;
    return { x: center[0] + body.ox, y: center[1] + body.oy, pressure: 0 };
  }

  const flowX = (Math.sin(time * 0.24 + node.phase) + Math.cos(time * 0.11 + node.phase2) * 0.42) * 3.2 * motionScale;
  const flowY = (Math.cos(time * 0.2 + node.phase2) + Math.sin(time * 0.09 + node.phase) * 0.36) * 2.5 * motionScale;
  const desiredX = targetX + flowX;
  const desiredY = targetY + flowY;
  body.vx += (desiredX - body.ox) * 0.0065 * textFrameFactor;
  body.vy += (desiredY - body.oy) * 0.0065 * textFrameFactor;

  const repulsion = borderRepulsion(poly, center[0] + body.ox, center[1] + body.oy, sprite);
  body.vx += repulsion.x * 0.28 * textFrameFactor;
  body.vy += repulsion.y * 0.28 * textFrameFactor;
  const drag = Math.pow(0.91, textFrameFactor);
  body.vx *= drag;
  body.vy *= drag;
  body.ox += body.vx * textFrameFactor;
  body.oy += body.vy * textFrameFactor;

  return { x: center[0] + body.ox, y: center[1] + body.oy, pressure: repulsion.pressure };
}

function drawSprite(sprite, position, alpha) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(
    sprite.canvas,
    position.x - sprite.width / 2,
    position.y - sprite.height / 2,
    sprite.width,
    sprite.height,
  );
}

function drawLabel(node, index, rawCenter, centerWorld, screenRadius, lifted, poly, time) {
  const selected = index === focusId;
  const fluid = ensureTextFluid(node);
  const settledWorld = settleTextAnchor(fluid, centerWorld);
  const center = worldToScreen(settledWorld);
  if (!fluid.visible && (screenRadius > 31 || lifted || (node.n >= 9 && screenRadius > 20))) fluid.visible = true;
  if (fluid.visible && !lifted && (screenRadius < 18 || (screenRadius < 23 && node.n < 9))) fluid.visible = false;
  if (!fluid.visible) {
    node._textPressure = (node._textPressure || 0) * 0.92;
    ctx.beginPath();
    ctx.arc(rawCenter[0], rawCenter[1], 2.2, 0, Math.PI * 2);
    ctx.fillStyle = node.spawned ? PAL.acid : PAL.inkSoft;
    ctx.fill();
    return;
  }

  const bandName = chooseLabelBand(fluid, screenRadius);
  const variant = node.guide ? "guide" : selected ? "selected" : "normal";
  const titleSprite = makeLabelSprite(node, bandName, variant, "title");
  const shouldWhisper = !node.guide && ((lifted && screenRadius > 46) || (bandName === "large" && node.n >= 9));
  const fragmentTarget = shouldWhisper ? (lifted ? 0.82 : 0.38) : 0;
  fluid.fragmentAlpha += (fragmentTarget - fluid.fragmentAlpha) * 0.055;
  fluid.emphasis += ((lifted || node.guide ? 1 : 0.78) - fluid.emphasis) * 0.1;

  let fragmentSprite = null;
  if (fluid.fragmentAlpha > 0.015 || shouldWhisper) {
    fragmentSprite = makeLabelSprite(node, bandName, variant, "fragment");
  }

  const titleTargetY = fragmentSprite ? -Math.min(15, titleSprite.height * 0.32) * fluid.fragmentAlpha : 0;
  const titlePosition = updateFluidText(fluid.title, node, center, poly, titleSprite, time, 0, titleTargetY, lifted ? 1.35 : 1);
  drawSprite(titleSprite, titlePosition, fluid.emphasis);

  let textPressure = titlePosition.pressure;
  if (fragmentSprite) {
    const fragmentTargetY = titleSprite.height * 0.42 + fragmentSprite.height * 0.5 + 5;
    const fragmentPosition = updateFluidText(fluid.fragment, node, center, poly, fragmentSprite, time, 0, fragmentTargetY, 0.76);
    drawSprite(fragmentSprite, fragmentPosition, fluid.fragmentAlpha);
    textPressure = Math.max(textPressure, fragmentPosition.pressure * fluid.fragmentAlpha);
  }
  node._textPressure = (node._textPressure || 0) + (textPressure - (node._textPressure || 0)) * 0.08;

  ctx.globalAlpha = 1;
}

function draw(time) {
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, VW, VH);
  drawFieldMarks();
  drawThreads(time);

  const order = nodes
    .map((node, index) => index)
    .sort((a, b) => {
      const rankA = a === hoverId || a === focusId || nodes[a].guide ? 1 : 0;
      const rankB = b === hoverId || b === focusId || nodes[b].guide ? 1 : 0;
      return rankA - rankB;
    });

  for (const index of order) {
    const node = nodes[index];
    const cell = cellOf(node);
    if (cell.length < 3) {
      node._poly = null;
      continue;
    }
    const centerWorld = centroid(cell);
    const inset = 0.72 + 0.22 * CFG.pack;
    const lifted = index === hoverId || index === focusId;
    const pulse = REDUCED_MOTION ? 1 : 1 + 0.008 * Math.sin(time * 0.8 + node.phase);
    const grow = node.sc * (lifted ? 1.035 : 1) * pulse;
    const screenPoly = cell.map((point) => worldToScreen([
      centerWorld[0] + (point[0] - centerWorld[0]) * inset * grow,
      centerWorld[1] + (point[1] - centerWorld[1]) * inset * grow,
    ]));
    node._poly = screenPoly;
    const center = worldToScreen(centerWorld);
    const screenRadius = node._R * cam.scale;

    roundPath(screenPoly, CFG.round);
    if (node.guide) {
      ctx.fillStyle = PAL.ink;
      ctx.fill();
      ctx.setLineDash([]);
      ctx.lineWidth = 3 + (node._textPressure || 0) * 0.55;
      ctx.strokeStyle = PAL.acid;
      ctx.stroke();
    } else if (index === focusId) {
      ctx.fillStyle = PAL.ink;
      ctx.fill();
      ctx.setLineDash([]);
      ctx.lineWidth = 2.2 + (node._textPressure || 0) * 0.65;
      ctx.strokeStyle = PAL.blue;
      ctx.stroke();
    } else {
      ctx.fillStyle = lifted ? (PAL.kinds[node.kind] || "#ffffff") : (PAL.kinds[node.kind] || PAL.cell);
      ctx.fill();
      ctx.lineWidth = 0.85 + node.highlight * 1.6 + (node._textPressure || 0) * 0.65;
      ctx.strokeStyle = node.spawned || node.highlight > 0 ? PAL.blue : PAL.stroke;
      ctx.setLineDash(node.spawned ? [4, 4] : []);
      ctx.stroke();
    }

    if (!node.guide && ["memory", "provocation", "tiny prototype", "observation"].includes(node.kind)) {
      const marker = screenPoly.reduce((best, point) => point[1] < best[1] ? point : best, screenPoly[0]);
      ctx.beginPath();
      ctx.arc(marker[0], marker[1] + 10, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = node.kind === "memory" ? PAL.coral : PAL.blue;
      ctx.fill();
    }

    drawLabel(node, index, center, centerWorld, screenRadius, lifted, screenPoly, time);
  }
  ctx.setLineDash([]);
}

// ---------------------------------------------------------------------------
// Camera and main loop.
// ---------------------------------------------------------------------------
function updateCoordinates() {
  const longitude = 3.7 + ((cam.x / WORLD.w) - 0.5) * 0.7;
  const latitude = 40.42 + ((cam.y / WORLD.h) - 0.5) * -0.5;
  document.getElementById("coordinates").textContent = `${latitude.toFixed(2)}° N · ${longitude.toFixed(2)}° W`;
}

function tickCamera() {
  const ease = REDUCED_MOTION ? 1 : 0.075;
  cam.x += (cam.tx - cam.x) * ease;
  cam.y += (cam.ty - cam.y) * ease;
  cam.scale += (cam.ts - cam.scale) * ease;
}

let lastFrame = 0;
let coordinateFrame = 0;
let textFrameFactor = 1;
function loop(timestamp) {
  const elapsed = lastFrame ? timestamp - lastFrame : 16.67;
  lastFrame = timestamp;
  textFrameFactor = Math.max(0.35, Math.min(2.2, elapsed / 16.67));
  const time = timestamp / 1000;
  step(time);
  tickCamera();
  draw(time);
  if (coordinateFrame++ % 18 === 0) updateCoordinates();
  requestAnimationFrame(loop);
}

function recenter() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node._R);
    maxX = Math.max(maxX, node.x + node._R);
    minY = Math.min(minY, node.y - node._R);
    maxY = Math.max(maxY, node.y + node._R);
  }
  cam.tx = (minX + maxX) / 2;
  cam.ty = (minY + maxY) / 2;
  const padding = 1.23;
  cam.ts = Math.min(VW / ((maxX - minX) * padding), VH / ((maxY - minY) * padding), 1.45);
  document.getElementById("view-label").textContent = "OVERVIEW";
}

// ---------------------------------------------------------------------------
// Curiosity mechanics: detail, trails, following, surprise, and search.
// ---------------------------------------------------------------------------
const trail = [];
let nextFollow = -1;
let searchMatches = [];
let searchSelection = 0;
let driftCursor = 0;
const CURIOUS_STARTS = [
  "neurons-fireflies",
  "disappearing-buttons",
  "social-mindfulness",
  "cognitive-clutch",
  "literature-alive",
  "ear-plane",
  "fractal-embodiment",
  "context-not-memory",
  "sorrow-solver",
  "metabolic-thinking",
];

function dismissWelcome() {
  document.getElementById("welcome").classList.add("dismissed");
}

function neighborsOf(index) {
  return edges
    .filter((edge) => edge.a === index || edge.b === index)
    .map((edge) => ({
      index: edge.a === index ? edge.b : edge.a,
      relation: edge.relation,
    }))
    .filter((neighbor) => !nodes[neighbor.index].guide);
}

function chooseNext(index) {
  const neighbors = neighborsOf(index);
  if (!neighbors.length) return null;
  const unseen = neighbors.filter((neighbor) => !trail.includes(nodes[neighbor.index].id));
  const pool = unseen.length ? unseen : neighbors;
  const seed = trail.length + hashString(nodes[index].id);
  return pool[seed % pool.length];
}

function updateTrail() {
  const items = document.getElementById("trail-items");
  items.innerHTML = "";
  const visible = trail.slice(-5);
  for (let i = 0; i < 5; i++) {
    const marker = document.createElement("i");
    if (i < visible.length) {
      marker.className = i === visible.length - 1 ? "current" : "visited";
      const node = nodes.find((candidate) => candidate.id === visible[i]);
      if (node) marker.title = node.name;
    }
    items.append(marker);
  }
  const label = document.getElementById("trail-empty");
  label.textContent = trail.length ? `${trail.length} thought${trail.length === 1 ? "" : "s"} followed` : "Nothing followed yet";
}

function showDetail(node) {
  const detail = document.getElementById("detail");
  if (!node) {
    detail.classList.add("hidden");
    return;
  }

  document.getElementById("detail-meta").textContent = `${node.kind} · from the vault`;
  document.getElementById("detail-name").textContent = node.name;
  document.getElementById("detail-fragment").textContent = node.fragment;
  document.getElementById("detail-note").textContent = node.note;
  document.getElementById("detail-question").textContent = node.question;
  document.getElementById("detail-source").textContent = `SOURCE NOTE  /  ${node.source}`;

  const related = document.getElementById("related");
  related.innerHTML = "";
  const connections = neighborsOf(focusId).slice(0, 4);
  for (const connection of connections) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `↗ ${nodes[connection.index].name}`;
    button.title = connection.relation;
    button.addEventListener("click", () => focusNode(connection.index));
    related.append(button);
  }

  const next = chooseNext(focusId);
  nextFollow = next?.index ?? -1;
  const preview = document.getElementById("follow-preview");
  preview.textContent = next ? next.relation : "somewhere less obvious";
  detail.classList.remove("hidden");
  detail.scrollTop = 0;
}

function focusNode(index, options = {}) {
  const node = nodes[index];
  if (!node) return;
  if (node.guide) {
    document.getElementById("voice-button").click();
    return;
  }

  dismissWelcome();
  previousFocusId = focusId;
  focusId = index;
  node.highlight = 1;
  if (options.record !== false && trail.at(-1) !== node.id) {
    trail.push(node.id);
    updateTrail();
  }

  const panelOffset = VW > 820 ? VW * 0.13 / Math.max(cam.scale, 0.65) : 0;
  cam.tx = node.x + panelOffset;
  cam.ty = node.y;
  cam.ts = Math.max(cam.ts, VW > 820 ? 1.13 : 0.96);
  document.getElementById("view-label").textContent = node.name.toUpperCase();
  showDetail(node);
}

function drift() {
  dismissWelcome();
  let id = CURIOUS_STARTS[driftCursor % CURIOUS_STARTS.length];
  driftCursor += 1;
  if (trail.length > 1 && trail.at(-1) === id) {
    id = CURIOUS_STARTS[driftCursor++ % CURIOUS_STARTS.length];
  }
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) focusNode(index);
}

function findNode(query) {
  if (!query) return -1;
  const normalized = query.toLowerCase().trim();
  let bestIndex = -1;
  let bestScore = 0;
  nodes.forEach((node, index) => {
    if (node.guide) return;
    const name = node.name.toLowerCase();
    const haystack = [node.name, node.kind, node.fragment, node.note, node.question, ...node.tags].join(" ").toLowerCase();
    let score = 0;
    if (name === normalized) score += 120;
    if (name.includes(normalized) || normalized.includes(name)) score += 70;
    for (const token of normalized.split(/\s+/)) {
      if (token.length < 2) continue;
      if (name.includes(token)) score += 16;
      else if (haystack.includes(token)) score += 7;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore > 0 ? bestIndex : -1;
}

function rankedSearch(query) {
  const normalized = query.toLowerCase().trim();
  if (!normalized) {
    return CURIOUS_STARTS.slice(0, 7)
      .map((id) => nodes.findIndex((node) => node.id === id))
      .filter((index) => index >= 0);
  }
  return nodes
    .map((node, index) => {
      if (node.guide) return { index, score: -1 };
      const name = node.name.toLowerCase();
      const tags = node.tags.join(" ").toLowerCase();
      const body = `${node.kind} ${node.fragment} ${node.note} ${node.question}`.toLowerCase();
      let score = name.includes(normalized) ? 80 : 0;
      for (const token of normalized.split(/\s+/).filter((part) => part.length > 1)) {
        if (name.includes(token)) score += 20;
        if (tags.includes(token)) score += 12;
        if (body.includes(token)) score += 5;
      }
      return { index, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((result) => result.index);
}

function renderSearchResults() {
  const container = document.getElementById("search-results");
  container.innerHTML = "";
  if (!searchMatches.length) {
    const empty = document.createElement("p");
    empty.className = "search-empty";
    empty.textContent = "No exact island. Try a looser hunch.";
    container.append(empty);
    return;
  }
  searchMatches.forEach((index, position) => {
    const node = nodes[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `search-result${position === searchSelection ? " active" : ""}`;
    button.innerHTML = `<span class="type">${node.kind}</span><span class="name"></span><span class="arrow">↗</span>`;
    button.querySelector(".name").textContent = node.name;
    button.addEventListener("click", () => {
      closeSearch();
      focusNode(index);
    });
    container.append(button);
  });
}

function openSearch() {
  const panel = document.getElementById("search-panel");
  panel.hidden = false;
  searchMatches = rankedSearch("");
  searchSelection = 0;
  renderSearchResults();
  requestAnimationFrame(() => document.getElementById("search-input").focus());
}

function closeSearch() {
  document.getElementById("search-panel").hidden = true;
  document.getElementById("search-input").value = "";
  cv.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Pointer and keyboard controls.
// ---------------------------------------------------------------------------
let pointerDown = false;
let pointerMoved = false;
let lastPosition = null;

function localPosition(event) {
  const rect = cv.getBoundingClientRect();
  return [(event.clientX - rect.left) * (VW / rect.width), (event.clientY - rect.top) * (VH / rect.height)];
}

function pickAt(x, y) {
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index];
    if (node._poly?.length > 2 && pointInPoly(node._poly, x, y)) return index;
  }
  return -1;
}

cv.addEventListener("pointerdown", (event) => {
  pointerDown = true;
  pointerMoved = false;
  lastPosition = localPosition(event);
  cv.setPointerCapture(event.pointerId);
  cv.classList.add("dragging");
});

cv.addEventListener("pointermove", (event) => {
  const position = localPosition(event);
  if (pointerDown) {
    const dx = position[0] - lastPosition[0];
    const dy = position[1] - lastPosition[1];
    if (Math.abs(dx) + Math.abs(dy) > 3) pointerMoved = true;
    cam.x -= dx / cam.scale;
    cam.tx = cam.x;
    cam.y -= dy / cam.scale;
    cam.ty = cam.y;
    lastPosition = position;
  } else {
    hoverId = pickAt(position[0], position[1]);
    cv.style.cursor = hoverId >= 0 ? "pointer" : "grab";
  }
});

cv.addEventListener("pointerup", (event) => {
  pointerDown = false;
  cv.classList.remove("dragging");
  if (!pointerMoved) {
    const position = localPosition(event);
    const hit = pickAt(position[0], position[1]);
    if (hit >= 0) focusNode(hit);
  } else {
    dismissWelcome();
  }
});

cv.addEventListener("pointerleave", () => {
  hoverId = -1;
  if (!pointerDown) cv.style.cursor = "grab";
});

cv.addEventListener("wheel", (event) => {
  event.preventDefault();
  dismissWelcome();
  const position = localPosition(event);
  const before = screenToWorld(position[0], position[1]);
  cam.ts = Math.max(0.34, Math.min(2.35, cam.ts * (event.deltaY < 0 ? 1.11 : 0.9)));
  cam.scale = cam.ts;
  const after = screenToWorld(position[0], position[1]);
  cam.x += before[0] - after[0];
  cam.tx = cam.x;
  cam.y += before[1] - after[1];
  cam.ty = cam.y;
}, { passive: false });

document.getElementById("begin").addEventListener("click", drift);
document.getElementById("drift").addEventListener("click", drift);
document.getElementById("detail-close").addEventListener("click", () => showDetail(null));
document.getElementById("follow-thread").addEventListener("click", () => {
  if (nextFollow >= 0) focusNode(nextFollow);
  else drift();
});
document.getElementById("recenter").addEventListener("click", () => {
  focusId = -1;
  previousFocusId = -1;
  showDetail(null);
  recenter();
});
document.getElementById("brand").addEventListener("click", (event) => {
  event.preventDefault();
  focusId = -1;
  previousFocusId = -1;
  showDetail(null);
  recenter();
});
document.getElementById("search-open").addEventListener("click", openSearch);
document.getElementById("search-close").addEventListener("click", closeSearch);
document.querySelector(".search-backdrop").addEventListener("click", closeSearch);
document.getElementById("search-input").addEventListener("input", (event) => {
  searchMatches = rankedSearch(event.target.value);
  searchSelection = 0;
  renderSearchResults();
});
document.getElementById("search-input").addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    searchSelection = Math.min(searchMatches.length - 1, searchSelection + 1);
    renderSearchResults();
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    searchSelection = Math.max(0, searchSelection - 1);
    renderSearchResults();
  }
  if (event.key === "Enter" && searchMatches[searchSelection] != null) {
    event.preventDefault();
    const selected = searchMatches[searchSelection];
    closeSearch();
    focusNode(selected);
  }
});

document.addEventListener("keydown", (event) => {
  const searchOpen = !document.getElementById("search-panel").hidden;
  if (event.key === "Escape") {
    if (searchOpen) closeSearch();
    else showDetail(null);
    return;
  }
  if (searchOpen) return;
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    openSearch();
  }
  if (event.key.toLowerCase() === "d" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) drift();
  if (event.key === "ArrowRight" && nextFollow >= 0 && !document.getElementById("detail").classList.contains("hidden")) {
    event.preventDefault();
    focusNode(nextFollow);
  }
});

// ---------------------------------------------------------------------------
// Agent tools: the voice guide manipulates the same curiosity mechanics.
// ---------------------------------------------------------------------------
const agentTools = {
  focus({ query }) {
    const index = findNode(query);
    if (index < 0) return { found: false, query };
    focusNode(index);
    const node = nodes[index];
    return {
      found: true,
      name: node.name,
      fragment: node.fragment,
      note: node.note,
      question: node.question,
      source: node.source,
      neighbors: neighborsOf(index).map((neighbor) => nodes[neighbor.index].name),
    };
  },
  highlight({ query }) {
    const normalized = (query || "").toLowerCase();
    const hits = [];
    nodes.forEach((node) => {
      if (node.guide) return;
      const haystack = [node.name, node.kind, node.fragment, node.note, ...node.tags].join(" ").toLowerCase();
      if (haystack.includes(normalized)) {
        node.highlight = 1;
        hits.push(node.name);
      }
    });
    return { highlighted: hits };
  },
  connect({ a, b, relation }) {
    const first = findNode(a);
    const second = findNode(b);
    if (first < 0 || second < 0) return { ok: false, a, b };
    edges.push({ a: first, b: second, relation: relation || "a connection surfaced in conversation" });
    nodes[first].highlight = 1;
    nodes[second].highlight = 1;
    cam.tx = (nodes[first].x + nodes[second].x) / 2;
    cam.ty = (nodes[first].y + nodes[second].y) / 2;
    cam.ts = 0.95;
    return { ok: true, connected: [nodes[first].name, nodes[second].name], relation };
  },
  spawn_concept({ name, note, near, question }) {
    if (!name) return { ok: false };
    const id = `spawn-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${nodes.length}`;
    const anchorIndex = near ? findNode(near) : focusId;
    const anchor = anchorIndex >= 0 ? nodes[anchorIndex] : { x: WORLD.w / 2, y: WORLD.h / 2 };
    const angle = ((hashString(id) % 628) / 100);
    const concept = makeNode({
      id,
      name,
      kind: "new growth",
      fragment: note || "A thought surfaced in conversation.",
      note: note || "A thought surfaced in conversation and has not been developed yet.",
      question: question || "Where could this thought lead?",
      source: "conversation with Abacus",
      tags: [name],
      n: 5,
    }, {
      spawned: true,
      x: anchor.x + Math.cos(angle) * 105,
      y: anchor.y + Math.sin(angle) * 105,
    });
    nodes.push(concept);
    if (anchorIndex >= 0) edges.push({ a: anchorIndex, b: nodes.length - 1, relation: "this thought surfaced nearby" });
    document.getElementById("concept-count").textContent = String(nodes.filter((node) => !node.guide).length);
    document.getElementById("link-count").textContent = String(edges.length);
    focusNode(nodes.length - 1);
    return { ok: true, name, anchored_to: anchorIndex >= 0 ? anchor.name : null };
  },
  get_view_state() {
    const visible = nodes
      .filter((node) => !node.guide && node._poly?.some(([x, y]) => x > 0 && x < VW && y > 0 && y < VH))
      .map((node) => node.name);
    return { focused: focusId >= 0 ? nodes[focusId].name : null, visible, trail: [...trail] };
  },
};

// ---------------------------------------------------------------------------
// Voice: OpenAI Realtime over WebRTC. The server keeps the key private.
// ---------------------------------------------------------------------------
let pc = null;
let dc = null;
let localStream = null;
let micMuted = false;

function instructions() {
  return `You are Abacus, a concise and curious voice guide through Fran's living thought atlas. ` +
    `Speak in one or two warm, specific sentences. Do not lecture. When a concept becomes relevant, call focus so the interface opens it. ` +
    `Use its fragment, note, question, and source as your ground truth; never invent what a vault note contains. ` +
    `Use highlight for a theme, connect when the conversation reveals a meaningful relation, and spawn_concept only for a genuinely new idea. ` +
    `Prefer ending with one good question that makes the user want to follow another thread.`;
}

const toolSchemas = [
  { type: "function", name: "focus", description: "Open the most relevant thought in the atlas.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { type: "function", name: "highlight", description: "Emphasize thoughts matching a theme.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { type: "function", name: "connect", description: "Connect two thoughts with a short explanation.", parameters: { type: "object", properties: { a: { type: "string" }, b: { type: "string" }, relation: { type: "string" } }, required: ["a", "b"] } },
  { type: "function", name: "spawn_concept", description: "Grow one genuinely new thought near a related existing thought.", parameters: { type: "object", properties: { name: { type: "string" }, note: { type: "string" }, near: { type: "string" }, question: { type: "string" } }, required: ["name"] } },
  { type: "function", name: "get_view_state", description: "Return what the visitor is currently seeing and has followed.", parameters: { type: "object", properties: {} } },
];

function sendEvent(event) {
  if (dc?.readyState === "open") dc.send(JSON.stringify(event));
}

function configureSession() {
  sendEvent({
    type: "session.update",
    session: {
      type: "realtime",
      model: MODEL,
      output_modalities: ["audio"],
      instructions: instructions(),
      tools: toolSchemas,
      tool_choice: "auto",
    },
  });
}

async function handleTool(item) {
  let args = {};
  try { args = JSON.parse(item.arguments || "{}"); } catch { args = {}; }
  const fn = agentTools[item.name];
  const output = fn ? fn(args) : { error: "unknown tool" };
  sendEvent({
    type: "conversation.item.create",
    item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify(output) },
  });
  sendEvent({ type: "response.create" });
}

function setVoiceLabel(text) {
  document.getElementById("voice-label").textContent = text;
}

function handleVoiceEvent(event) {
  if (event.type === "input_audio_buffer.speech_started") setVoiceLabel("Listening");
  if (event.type === "input_audio_buffer.speech_stopped") setVoiceLabel("Following the thought");
  if (event.type === "response.done") {
    for (const item of event.response?.output || []) {
      if (item.type === "function_call") handleTool(item);
    }
    setVoiceLabel("Abacus is live");
  }
  if (event.type === "error") {
    setVoiceLabel("Voice error");
    console.error("Realtime error", event.error);
  }
}

async function connectVoice() {
  const button = document.getElementById("voice-button");
  setVoiceLabel("Connecting");
  button.disabled = true;
  dismissWelcome();

  pc = new RTCPeerConnection();
  dc = pc.createDataChannel("oai-events");
  pc.ontrack = (event) => { document.getElementById("remote-audio").srcObject = event.streams[0]; };
  pc.onconnectionstatechange = () => {
    const state = pc?.connectionState;
    if (state === "connected") {
      setVoiceLabel("Abacus is live");
      button.classList.add("live");
      button.disabled = false;
      document.getElementById("mic-toggle").hidden = false;
    }
    if (["failed", "disconnected", "closed"].includes(state)) stopVoice();
  };
  dc.addEventListener("open", configureSession);
  dc.addEventListener("message", (event) => handleVoiceEvent(JSON.parse(event.data)));

  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(localStream.getAudioTracks()[0], localStream);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const response = await fetch("/session", { method: "POST", body: offer.sdp, headers: { "Content-Type": "application/sdp" } });
  if (!response.ok) throw new Error(await response.text());
  await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
}

function stopVoice(label = "Talk to Abacus") {
  try { dc?.close(); } catch {}
  try { pc?.close(); } catch {}
  localStream?.getTracks().forEach((track) => track.stop());
  pc = null;
  dc = null;
  localStream = null;
  const button = document.getElementById("voice-button");
  button.classList.remove("live");
  button.disabled = false;
  document.getElementById("mic-toggle").hidden = true;
  setVoiceLabel(label);
}

document.getElementById("voice-button").addEventListener("click", async () => {
  if (pc && ["connected", "connecting"].includes(pc.connectionState)) {
    stopVoice();
    return;
  }
  try {
    await connectVoice();
  } catch (error) {
    console.error(error);
    const label = /OPENAI_API_KEY/.test(error.message) ? "Needs API key" : /Permission|Microphone|denied/i.test(error.message) ? "Mic blocked" : "Voice error";
    stopVoice(label);
  }
});

document.getElementById("mic-toggle").addEventListener("click", () => {
  micMuted = !micMuted;
  localStream?.getAudioTracks().forEach((track) => { track.enabled = !micMuted; });
  document.getElementById("mic-toggle").textContent = micMuted ? "Unmute" : "Mute";
});

// ---------------------------------------------------------------------------
// Boot.
// ---------------------------------------------------------------------------
resize();
initNodes();
nodes.forEach((node) => {
  node._R = radiusOf(node);
  node._w2 = (node._R * 0.72) ** 2;
});
for (let i = 0; i < 220; i++) step(i * 0.016);
document.getElementById("concept-count").textContent = String(CONCEPTS.length);
document.getElementById("link-count").textContent = String(LINKS.length);
updateTrail();
recenter();
requestAnimationFrame(loop);
