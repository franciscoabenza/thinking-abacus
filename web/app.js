import { CONCEPTS, LINKS } from "./concepts.js";
import { installVoice } from "./voice/index.js";
import { createSalience } from "./salience.js";
import { createWave } from "./wave/wave.js";
import { createSeep } from "./seep.js";

// ---------------------------------------------------------------------------
// A living field, not a folder tree.
// ---------------------------------------------------------------------------
const CFG = { round: 8, pack: 0.9, hier: 0.62, motion: 0.018 };
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
window.addEventListener("resize", () => {
  const wasPhone = VW < PHONE_WIDTH;
  resize();
  if (nodes.length && wasPhone !== VW < PHONE_WIDTH && focusId < 0) recenter();
});

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
const salience = createSalience();
const seep = createSeep({ world: WORLD });
// What a thought is *about*, for the embedder. Name first: it carries the most.
const thoughtText = (index) => {
  const node = nodes[index];
  return `${node.name}. ${node.fragment} ${node.note} ${node.question} ${node.tags.join(", ")}`;
};
const wave = createWave({
  energize: (index, amount) => salience.energize(index, amount),
  textOf: thoughtText,
  skip: (index) => Boolean(nodes[index]?.guide),
  onPhrase: (phrase) => voice?.trace("wave", {
    who: phrase.who,
    text: phrase.text,
    hits: phrase.hits.map((hit) => [nodes[hit.index].name, +hit.similarity.toFixed(3), +hit.energy.toFixed(3)]),
  }),
});

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
  }
  salience.tick();

  for (const edge of edges) {
    const first = nodes[edge.a];
    const second = nodes[edge.b];
    let dx = second.x - first.x;
    let dy = second.y - first.y;
    const distance = Math.hypot(dx, dy) || 0.01;
    const target = (first._R + second._R) * 1.12;
    const displaced = first._claw || second._claw || first._semanticReturn || second._semanticReturn;
    const semanticElasticity = displaced ? 0.035 : 1;
    const force = (((distance - target) * 0.011) / distance) * semanticElasticity;
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
        if (!first._claw) {
          first.vx -= dx;
          first.vy -= dy;
        }
        if (!second._claw) {
          second.vx += dx;
          second.vy += dy;
        }
      }
    }
  }

  // Contextual pull: thoughts the conversation has warmed lean toward one
  // another — magnetism keyed to what is being said, not to the folder they
  // came from. Bounded so the territory never collapses into a knot.
  const alive = salience.top(8, 0.3).filter(({ index }) => !nodes[index].guide && !nodes[index]._claw);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const first = nodes[alive[i].index];
      const second = nodes[alive[j].index];
      let dx = second.x - first.x;
      let dy = second.y - first.y;
      const distance = Math.hypot(dx, dy) || 0.01;
      const rest = (first._R + second._R) * 1.2;
      if (distance <= rest) continue;
      // Strong enough to visibly reshape the tessellation; the separation
      // pass below still refuses to let two cells overlap.
      const pull = Math.min(0.05, (distance - rest) * 0.00024) * alive[i].value * alive[j].value;
      dx *= pull / distance;
      dy *= pull / distance;
      first.vx += dx * 8;
      first.vy += dy * 8;
      second.vx -= dx * 8;
      second.vy -= dy * 8;
    }
  }

  // The ink in the cracks: cells block, the guide's cell is the reservoir,
  // alive thoughts are the poles it seeps toward.
  const guideNode = nodes.find((node) => node.guide);
  if (guideNode?._insetWorld) {
    const [gx, gy] = guideNode._insetWorld.reduce(([x, y], p) => [x + p[0], y + p[1]], [0, 0]).map((v) => v / guideNode._insetWorld.length);
    seep.update({
      blockers: nodes.filter((node) => !node.guide && node._insetWorld).map((node) => node._insetWorld),
      source: guideNode._insetWorld.map(([x, y]) => [gx + (x - gx) * 0.88, gy + (y - gy) * 0.88]),
      poles: alive.map(({ index, value }) => ({ x: nodes[index].x, y: nodes[index].y, strength: value })),
      frame: textFrameFactor,
    });
    // The cell leans after its own ink, slowly, so the reservoir migrates
    // toward a sustained conversation without breaking the tessellation.
    const lean = Math.min(1, seep.volume / 160) * 0.0006;
    guideNode.vx += (seep.centroid.x - guideNode.x) * lean;
    guideNode.vy += (seep.centroid.y - guideNode.y) * lean;
  }

  const amplitude = REDUCED_MOTION ? 0 : 0.012 + 0.05 * CFG.motion;
  for (const node of nodes) {
    if (node._claw) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }

    if (node._semanticReturn) {
      const dx = node._semanticReturn.x - node.x;
      const dy = node._semanticReturn.y - node.y;
      const distance = Math.hypot(dx, dy);
      node.vx += dx * 0.00006 + amplitude * 0.18 * Math.sin(time * 0.31 + node.phase);
      node.vy += dy * 0.00006 + amplitude * 0.18 * Math.cos(time * 0.27 + node.phase2);
      node.vx *= 0.94;
      node.vy *= 0.94;
      node.x += node.vx;
      node.y += node.vy;
      if (distance < 5 && Math.hypot(node.vx, node.vy) < 0.18) node._semanticReturn = null;
      continue;
    }

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
let pointerScreen = null;

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
  const visibleEdges = edges.filter((edge) =>
    edge.a === focusId || edge.b === focusId ||
    (Math.min(salience.of(edge.a), salience.of(edge.b)) > 0.28 && !nodes[edge.a].guide && !nodes[edge.b].guide));
  if (!visibleEdges.length) return;
  ctx.save();
  ctx.lineCap = "round";
  for (const edge of visibleEdges) {
    const onFocus = edge.a === focusId || edge.b === focusId;
    const alive = Math.min(salience.of(edge.a), salience.of(edge.b));
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
    if (onFocus) {
      ctx.lineWidth = isArrival ? 2 : 1;
      ctx.strokeStyle = isArrival ? "rgba(76,92,255,0.78)" : "rgba(21,23,19,0.2)";
    } else {
      // A thread between two thoughts the conversation has warmed.
      ctx.lineWidth = 0.8 + alive * 1.2;
      ctx.strokeStyle = `rgba(76,92,255,${(0.15 + alive * 0.55).toFixed(3)})`;
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawSemanticTethers(time) {
  ctx.save();
  ctx.lineCap = "round";
  for (const node of nodes) {
    if (!node._semanticReturn) continue;
    const from = worldToScreen([node.x, node.y]);
    const to = worldToScreen([node._semanticReturn.x, node._semanticReturn.y]);
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (distance < 8) continue;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.setLineDash([1.5, 8]);
    ctx.lineDashOffset = REDUCED_MOTION ? 0 : -time * 2.5;
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(76,92,255,${Math.min(0.28, 0.08 + distance / 900)})`;
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
    revealAlpha: node.guide ? 1 : node.n >= 11 ? 0.42 : node.n >= 9 ? 0.16 : 0.02,
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

function graphNeighborOf(index, activeIndex) {
  if (activeIndex < 0 || index === activeIndex) return index === activeIndex;
  return edges.some((edge) =>
    (edge.a === index && edge.b === activeIndex) ||
    (edge.b === index && edge.a === activeIndex));
}

function labelRevealTarget(node, index, center, lifted) {
  if (node.guide || lifted) return 1;

  // A few major ideas remain as quiet navigational beacons. The rest surface
  // through physical proximity or an explicit semantic relationship.
  let target = node.n >= 11 ? 0.42 : node.n >= 9 ? 0.15 : 0.018;
  if (cam.scale > 1.2) target = Math.max(target, 0.22);
  else if (cam.scale > 0.9) target = Math.max(target, 0.09);

  if (pointerScreen) {
    const distance = Math.hypot(center[0] - pointerScreen[0], center[1] - pointerScreen[1]);
    const proximity = Math.max(0, Math.min(1, (285 - distance) / 225));
    target = Math.max(target, proximity * proximity * 0.92);
  }

  if (graphNeighborOf(index, focusId)) target = Math.max(target, 0.72);
  if (graphNeighborOf(index, hoverId)) target = Math.max(target, 0.58);
  target = Math.max(target, salience.of(index) * 0.95);
  return target;
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
  // One-way coupling: the blob boundary influences the text, never the reverse.
  if (!pointInPoly(poly, x, y)) {
    const center = centroid(poly);
    const dx = center[0] - x;
    const dy = center[1] - y;
    const distance = Math.hypot(dx, dy) || 1;
    return { x: (dx / distance) * 1.2, y: (dy / distance) * 1.2 };
  }

  let forceX = 0;
  let forceY = 0;
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
  }
  return { x: forceX, y: forceY };
}

function updateFluidText(body, node, center, poly, sprite, time, targetX, targetY, motionScale = 1) {
  if (REDUCED_MOTION) {
    body.ox += (targetX - body.ox) * 0.2;
    body.oy += (targetY - body.oy) * 0.2;
    body.vx = 0;
    body.vy = 0;
    return { x: center[0] + body.ox, y: center[1] + body.oy };
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

  return { x: center[0] + body.ox, y: center[1] + body.oy };
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
  let center;
  if (node._claw && conceptClaw.index === index && conceptClaw.labelScreen) {
    center = [
      conceptClaw.labelScreen[0] + conceptClaw.labelOffsetX,
      conceptClaw.labelScreen[1] + conceptClaw.labelOffsetY,
    ];
    const fixedWorld = screenToWorld(center[0], center[1]);
    fluid.anchorX = fixedWorld[0];
    fluid.anchorY = fixedWorld[1];
    fluid.anchorVx = 0;
    fluid.anchorVy = 0;
  } else {
    const settledWorld = settleTextAnchor(fluid, centerWorld);
    center = worldToScreen(settledWorld);
  }
  const revealTarget = labelRevealTarget(node, index, center, lifted);
  const revealEase = 1 - Math.pow(0.91, textFrameFactor);
  fluid.revealAlpha += (revealTarget - fluid.revealAlpha) * revealEase;
  if (!fluid.visible && (screenRadius > 31 || lifted || (node.n >= 9 && screenRadius > 20))) fluid.visible = true;
  if (fluid.visible && !lifted && (screenRadius < 18 || (screenRadius < 23 && node.n < 9))) fluid.visible = false;
  if (!fluid.visible) {
    ctx.beginPath();
    ctx.arc(rawCenter[0], rawCenter[1], 2.2, 0, Math.PI * 2);
    ctx.fillStyle = node.spawned ? PAL.acid : PAL.inkSoft;
    ctx.fill();
    return;
  }

  const bandName = chooseLabelBand(fluid, screenRadius);
  const variant = node.guide ? "guide" : selected ? "selected" : "normal";
  const titleSprite = makeLabelSprite(node, bandName, variant, "title");
  const warmth = node.guide ? 0 : salience.of(index);
  const shouldWhisper = !node.guide && ((lifted && screenRadius > 46) || (bandName === "large" && node.n >= 9) || (warmth > 0.4 && screenRadius > 38));
  const fragmentTarget = shouldWhisper ? Math.max(lifted ? 0.82 : 0.38, warmth * 0.85) : 0;
  fluid.fragmentAlpha += (fragmentTarget - fluid.fragmentAlpha) * 0.055;
  fluid.emphasis += ((lifted || node.guide ? 1 : 0.78) - fluid.emphasis) * 0.1;

  let fragmentSprite = null;
  if (fluid.fragmentAlpha > 0.015 || shouldWhisper) {
    fragmentSprite = makeLabelSprite(node, bandName, variant, "fragment");
  }

  const titleTargetY = fragmentSprite ? -Math.min(15, titleSprite.height * 0.32) * fluid.fragmentAlpha : 0;
  const titlePosition = updateFluidText(fluid.title, node, center, poly, titleSprite, time, 0, titleTargetY, lifted ? 1.35 : 1);
  drawSprite(titleSprite, titlePosition, fluid.emphasis * fluid.revealAlpha);

  if (fragmentSprite) {
    const fragmentTargetY = titleSprite.height * 0.42 + fragmentSprite.height * 0.5 + 5;
    const fragmentPosition = updateFluidText(fluid.fragment, node, center, poly, fragmentSprite, time, 0, fragmentTargetY, 0.76);
    drawSprite(fragmentSprite, fragmentPosition, fluid.fragmentAlpha * fluid.revealAlpha);
  }

  ctx.globalAlpha = 1;
}

function draw(time) {
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, VW, VH);
  drawFieldMarks();
  drawThreads(time);
  drawSemanticTethers(time);

  const order = nodes
    .map((node, index) => index)
    .sort((a, b) => {
      const rank = (i) => (nodes[i].guide ? 3 : i === hoverId || i === focusId ? 2 : salience.of(i));
      return rank(a) - rank(b);
    });

  const labels = [];
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
    const alive = node.guide ? 0 : salience.of(index);
    const pulse = REDUCED_MOTION ? 1 : 1 + 0.008 * Math.sin(time * 0.8 + node.phase);
    // A thought the conversation has warmed leans in a little.
    const grow = node.sc * (lifted ? 1.035 : 1 + 0.05 * alive) * pulse;
    const screenPoly = cell.map((point) => worldToScreen([
      centerWorld[0] + (point[0] - centerWorld[0]) * inset * grow,
      centerWorld[1] + (point[1] - centerWorld[1]) * inset * grow,
    ]));
    node._poly = screenPoly;
    node._insetWorld = cell.map((point) => [
      centerWorld[0] + (point[0] - centerWorld[0]) * inset * grow,
      centerWorld[1] + (point[1] - centerWorld[1]) * inset * grow,
    ]);
    const center = worldToScreen(centerWorld);
    const screenRadius = node._R * cam.scale;

    roundPath(screenPoly, CFG.round);
    if (node.guide) {
      ctx.fillStyle = PAL.ink;
      ctx.fill();
      ctx.setLineDash([]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = PAL.acid;
      ctx.stroke();
    } else if (index === focusId) {
      ctx.fillStyle = PAL.ink;
      ctx.fill();
      ctx.setLineDash([]);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = PAL.blue;
      ctx.stroke();
    } else {
      ctx.fillStyle = lifted ? (PAL.kinds[node.kind] || "#ffffff") : (PAL.kinds[node.kind] || PAL.cell);
      ctx.fill();
      // A whisper of blue; the physics carries the signal now.
      ctx.lineWidth = 0.85 + alive * 0.6;
      ctx.strokeStyle = node.spawned ? PAL.blue : alive > 0.1 ? `rgba(76,92,255,${Math.min(0.5, 0.12 + alive * 0.4).toFixed(3)})` : PAL.stroke;
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

    labels.push([node, index, center, centerWorld, screenRadius, lifted, screenPoly]);
  }
  ctx.setLineDash([]);

  // Ink over the cracks, under the words.
  seep.draw(ctx, worldToScreen, { fill: "rgba(21,23,19,0.95)", rim: PAL.acid });
  for (const args of labels) drawLabel(...args, time);
}

// ---------------------------------------------------------------------------
// Camera and main loop.
// ---------------------------------------------------------------------------
function updateCoordinates() {
  const longitude = 3.7 + ((cam.x / WORLD.w) - 0.5) * 0.7;
  const latitude = 40.42 + ((cam.y / WORLD.h) - 0.5) * -0.5;
  document.getElementById("coordinates").textContent = `${latitude.toFixed(2)}° N · ${longitude.toFixed(2)}° W`;
}

const cameraMomentum = { x: 0, y: 0 };
let cameraIsDragging = false;

function cancelCameraMomentum() {
  cameraMomentum.x = 0;
  cameraMomentum.y = 0;
}

// When nobody is reading or dragging, the view drifts toward where the
// conversation is. Slowly: it should feel like the pond turning, not a cut.
function followConversation() {
  if (focusId >= 0 || cameraIsDragging || pointerDown) return;
  const centre = salience.centroid((index) => (nodes[index].guide ? null : [nodes[index].x, nodes[index].y]), 0.3);
  if (!centre || centre.weight < 0.5) return;
  const strength = Math.min(1, centre.weight / 1.6) * 0.018;
  cam.tx += (centre.x - cam.tx) * strength;
  cam.ty += (centre.y - cam.ty) * strength;
}

function tickCamera() {
  const ease = REDUCED_MOTION ? 1 : 0.075;
  followConversation();
  const momentumSpeed = Math.hypot(cameraMomentum.x, cameraMomentum.y);
  if (!cameraIsDragging && !REDUCED_MOTION && momentumSpeed > 0.012) {
    cam.x += cameraMomentum.x * textFrameFactor;
    cam.y += cameraMomentum.y * textFrameFactor;
    cam.tx = cam.x;
    cam.ty = cam.y;
    const waterDrag = Math.pow(0.94, textFrameFactor);
    cameraMomentum.x *= waterDrag;
    cameraMomentum.y *= waterDrag;
  } else {
    if (momentumSpeed <= 0.012 || REDUCED_MOTION) cancelCameraMomentum();
    cam.x += (cam.tx - cam.x) * ease;
    cam.y += (cam.ty - cam.y) * ease;
  }
  cam.scale += (cam.ts - cam.scale) * ease;
}

const conceptClaw = {
  index: -1,
  engaged: false,
  screen: null,
  labelScreen: null,
  labelOffsetX: 0,
  labelOffsetY: 0,
  labelVx: 0,
  labelVy: 0,
  home: null,
};

function stirClawedText(dx, dy) {
  if (!conceptClaw.engaged) return;
  const distance = Math.hypot(dx, dy) || 1;
  const capped = Math.min(1, 18 / distance);
  conceptClaw.labelVx += dx * 0.065 * capped;
  conceptClaw.labelVy += dy * 0.065 * capped;
}

function dampClawedText() {
  if (!conceptClaw.engaged) return;
  if (REDUCED_MOTION) {
    conceptClaw.labelOffsetX = 0;
    conceptClaw.labelOffsetY = 0;
    conceptClaw.labelVx = 0;
    conceptClaw.labelVy = 0;
    return;
  }
  const spring = 0.018 * textFrameFactor;
  conceptClaw.labelVx -= conceptClaw.labelOffsetX * spring;
  conceptClaw.labelVy -= conceptClaw.labelOffsetY * spring;
  const damping = Math.pow(0.84, textFrameFactor);
  conceptClaw.labelVx *= damping;
  conceptClaw.labelVy *= damping;
  conceptClaw.labelOffsetX += conceptClaw.labelVx * textFrameFactor;
  conceptClaw.labelOffsetY += conceptClaw.labelVy * textFrameFactor;

  const distance = Math.hypot(conceptClaw.labelOffsetX, conceptClaw.labelOffsetY);
  const limit = 20;
  if (distance > limit) {
    conceptClaw.labelOffsetX = (conceptClaw.labelOffsetX / distance) * limit;
    conceptClaw.labelOffsetY = (conceptClaw.labelOffsetY / distance) * limit;
  }
}

function applyConceptClaw() {
  if (!conceptClaw.engaged || conceptClaw.index < 0 || !conceptClaw.screen) return;
  const node = nodes[conceptClaw.index];
  if (!node) return;
  const pinnedWorld = screenToWorld(conceptClaw.screen[0], conceptClaw.screen[1]);
  node.x = pinnedWorld[0];
  node.y = pinnedWorld[1];
  node.vx = 0;
  node.vy = 0;
  dampClawedText();
}

function releaseConceptClaw() {
  if (conceptClaw.index >= 0) {
    const node = nodes[conceptClaw.index];
    if (node) {
      if (conceptClaw.labelScreen) {
        const fluid = ensureTextFluid(node);
        const releasedWorld = screenToWorld(
          conceptClaw.labelScreen[0] + conceptClaw.labelOffsetX,
          conceptClaw.labelScreen[1] + conceptClaw.labelOffsetY,
        );
        fluid.anchorX = releasedWorld[0];
        fluid.anchorY = releasedWorld[1];
        fluid.anchorVx = 0;
        fluid.anchorVy = 0;
      }
      node._claw = false;
      if (conceptClaw.engaged && conceptClaw.home) {
        node._semanticReturn = { x: conceptClaw.home[0], y: conceptClaw.home[1] };
      }
    }
  }
  conceptClaw.index = -1;
  conceptClaw.engaged = false;
  conceptClaw.screen = null;
  conceptClaw.labelScreen = null;
  conceptClaw.labelOffsetX = 0;
  conceptClaw.labelOffsetY = 0;
  conceptClaw.labelVx = 0;
  conceptClaw.labelVy = 0;
  conceptClaw.home = null;
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
  applyConceptClaw();
  draw(time);
  if (coordinateFrame++ % 18 === 0) updateCoordinates();
  requestAnimationFrame(loop);
}

// Below this width, fingers replace a cursor: cells must be big enough to tap
// and the first view must not be the whole territory squeezed into a palm.
const PHONE_WIDTH = 640;
const isPhone = () => VW < PHONE_WIDTH;

function recenter() {
  cancelCameraMomentum();
  document.getElementById("view-label").textContent = "OVERVIEW";
  if (isPhone()) {
    // About 560 world units across the screen: a typical cell spans roughly a
    // third of the width, comfortably tappable, labels legible.
    const guide = nodes.find((node) => node.guide) || { x: WORLD.w / 2, y: WORLD.h / 2 };
    cam.tx = guide.x;
    cam.ty = guide.y;
    cam.ts = Math.max(0.55, Math.min(1.1, VW / 560));
    voice?.viewChanged();
    return;
  }
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
  voice?.viewChanged();
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
    voice?.viewChanged();
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
  voice?.viewChanged();
}

function focusNode(index, options = {}) {
  const node = nodes[index];
  if (!node) return;
  if (node.guide) {
    voice?.toggle();
    return;
  }

  dismissWelcome();
  cancelCameraMomentum();
  previousFocusId = focusId;
  focusId = index;
  salience.pin(index);
  if (options.record !== false && trail.at(-1) !== node.id) {
    trail.push(node.id);
    updateTrail();
  }

  const panelOffset = VW > 820 ? VW * 0.13 / Math.max(cam.scale, 0.65) : 0;
  cam.ts = Math.max(cam.ts, VW > 820 ? 1.13 : 0.96);
  cam.tx = node.x + panelOffset;
  cam.ty = isPhone() ? node.y + (VH * 0.26) / cam.ts : node.y;
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

// `minScore` guards callers that must not land on a stray token match: a
// name hit scores 70+, a single shared word only 7–16.
function findNode(query, minScore = 1) {
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
  return bestScore >= minScore ? bestIndex : -1;
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
let pointerOrigin = null;
let lastPointerTime = 0;

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

// Two fingers: zoom about their midpoint and pan with it. A pinch is never a
// tap and never a moor; the moment a second finger lands, any claw lets go.
const pinch = { pointers: new Map(), active: false, startDistance: 1, startScale: 1, anchor: null };

function pinchGeometry() {
  const [a, b] = [...pinch.pointers.values()];
  return { distance: Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), 1), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
}

function beginPinch() {
  releaseConceptClaw();
  cancelCameraMomentum();
  dismissWelcome();
  cameraIsDragging = false;
  pointerMoved = true;
  const { distance, mid } = pinchGeometry();
  pinch.active = true;
  pinch.startDistance = distance;
  pinch.startScale = cam.scale;
  pinch.anchor = screenToWorld(mid[0], mid[1]);
}

function movePinch() {
  const { distance, mid } = pinchGeometry();
  const scale = Math.max(0.34, Math.min(2.35, pinch.startScale * (distance / pinch.startDistance)));
  cam.scale = cam.ts = scale;
  // The world point that was between the fingers stays between the fingers.
  cam.x = cam.tx = pinch.anchor[0] - (mid[0] - VW / 2) / scale;
  cam.y = cam.ty = pinch.anchor[1] - (mid[1] - VH / 2) / scale;
}

cv.addEventListener("pointerdown", (event) => {
  pinch.pointers.set(event.pointerId, localPosition(event));
  if (pinch.pointers.size >= 2) {
    cv.setPointerCapture(event.pointerId);
    beginPinch();
    return;
  }
  pointerDown = true;
  pointerMoved = false;
  lastPosition = localPosition(event);
  pointerOrigin = [...lastPosition];
  pointerScreen = lastPosition;
  lastPointerTime = event.timeStamp;
  cameraIsDragging = true;
  cancelCameraMomentum();

  const hit = pickAt(lastPosition[0], lastPosition[1]);
  if (hit >= 0 && !nodes[hit].guide) {
    const node = nodes[hit];
    conceptClaw.index = hit;
    // Moor the concept where it already is, not at the exact contact point.
    // Otherwise pressing near a cell edge would teleport its generator before
    // the first drag frame and visibly disturb both geometry and text.
    conceptClaw.screen = worldToScreen([node.x, node.y]);
    conceptClaw.home = node._semanticReturn
      ? [node._semanticReturn.x, node._semanticReturn.y]
      : [node.x, node.y];
    node._semanticReturn = null;
  } else {
    releaseConceptClaw();
  }

  cv.setPointerCapture(event.pointerId);
  cv.classList.add("dragging");
});

cv.addEventListener("pointermove", (event) => {
  if (pinch.pointers.has(event.pointerId)) pinch.pointers.set(event.pointerId, localPosition(event));
  if (pinch.active) {
    if (pinch.pointers.size >= 2) movePinch();
    return;
  }
  const position = localPosition(event);
  pointerScreen = position;
  if (pointerDown) {
    const dx = position[0] - lastPosition[0];
    const dy = position[1] - lastPosition[1];
    const gestureDistance = Math.hypot(dx, dy);
    const totalGestureDistance = pointerOrigin ? Math.hypot(position[0] - pointerOrigin[0], position[1] - pointerOrigin[1]) : gestureDistance;
    if (totalGestureDistance > 5 && !pointerMoved) {
      pointerMoved = true;
      if (conceptClaw.index >= 0) {
        conceptClaw.engaged = true;
        const node = nodes[conceptClaw.index];
        const fluid = ensureTextFluid(node);
        conceptClaw.labelScreen = fluid.anchorX == null
          ? worldToScreen([node.x, node.y])
          : worldToScreen([fluid.anchorX, fluid.anchorY]);
        conceptClaw.labelOffsetX = 0;
        conceptClaw.labelOffsetY = 0;
        conceptClaw.labelVx = 0;
        conceptClaw.labelVy = 0;
        node._claw = true;
      }
    }

    const resistance = 0.56 + Math.min(0.12, (gestureDistance / 24) * 0.12);
    const panX = -(dx / cam.scale) * resistance;
    const panY = -(dy / cam.scale) * resistance;
    stirClawedText(dx * resistance, dy * resistance);
    cam.x += panX;
    cam.tx = cam.x;
    cam.y += panY;
    cam.ty = cam.y;

    const elapsed = Math.max(6, Math.min(42, event.timeStamp - lastPointerTime || 16.67));
    const frameVelocityX = panX * (16.67 / elapsed);
    const frameVelocityY = panY * (16.67 / elapsed);
    cameraMomentum.x = cameraMomentum.x * 0.48 + frameVelocityX * 0.52;
    cameraMomentum.y = cameraMomentum.y * 0.48 + frameVelocityY * 0.52;
    const momentumSpeed = Math.hypot(cameraMomentum.x, cameraMomentum.y);
    const maxMomentum = 24 / Math.max(cam.scale, 0.35);
    if (momentumSpeed > maxMomentum) {
      cameraMomentum.x = (cameraMomentum.x / momentumSpeed) * maxMomentum;
      cameraMomentum.y = (cameraMomentum.y / momentumSpeed) * maxMomentum;
    }

    lastPosition = position;
    lastPointerTime = event.timeStamp;
  } else {
    hoverId = pickAt(position[0], position[1]);
    cv.style.cursor = hoverId >= 0 ? "pointer" : "grab";
  }
});

function finishPointer(event, cancelled = false) {
  pinch.pointers.delete(event.pointerId);
  if (pinch.active) {
    pointerMoved = true;
    if (pinch.pointers.size >= 1) {
      // One finger left: carry on as a plain drag from where it is now.
      lastPosition = [...pinch.pointers.values()][0];
      pointerOrigin = [...lastPosition];
      lastPointerTime = event.timeStamp;
      cameraIsDragging = true;
      return;
    }
    pinch.active = false;
  }
  const position = localPosition(event);
  pointerScreen = position;
  if (conceptClaw.engaged) applyConceptClaw();
  pointerDown = false;
  cameraIsDragging = false;
  pointerOrigin = null;
  if (!pointerMoved || cancelled) cancelCameraMomentum();
  cv.classList.remove("dragging");
  if (!pointerMoved && !cancelled) {
    const hit = pickAt(position[0], position[1]);
    releaseConceptClaw();
    if (hit >= 0) focusNode(hit);
    else dismissWelcome();
  } else {
    releaseConceptClaw();
    dismissWelcome();
  }
}

cv.addEventListener("pointerup", (event) => finishPointer(event));
cv.addEventListener("pointercancel", (event) => finishPointer(event, true));

cv.addEventListener("pointerleave", () => {
  hoverId = -1;
  if (!pointerDown) {
    pointerScreen = null;
    cv.style.cursor = "grab";
  }
});

cv.addEventListener("wheel", (event) => {
  event.preventDefault();
  dismissWelcome();
  cancelCameraMomentum();
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
function leaveFocus() {
  focusId = -1;
  previousFocusId = -1;
  salience.unpin();
  showDetail(null);
  recenter();
}
document.getElementById("recenter").addEventListener("click", leaveFocus);
document.getElementById("brand").addEventListener("click", (event) => {
  event.preventDefault();
  leaveFocus();
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
// The atlas, as the voice guide sees it.
//
// Four moves and one view. Everything under web/voice/ depends on this object
// and on nothing else in this file, so the renderer never learns that a voice
// exists and the voice layer never learns how a cell is drawn.
// ---------------------------------------------------------------------------
let voice = null;

function describeNode(index) {
  const node = nodes[index];
  return {
    name: node.name,
    kind: node.kind,
    fragment: node.fragment,
    note: node.note,
    question: node.question,
    source: node.source,
    neighbors: neighborsOf(index).map((neighbor) => ({
      name: nodes[neighbor.index].name,
      relation: neighbor.relation,
    })),
  };
}

// Move the camera so a set of thoughts is comfortably on screen together,
// without ever zooming out to the whole territory on a phone.
function holdInView(indices) {
  cancelCameraMomentum();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const index of indices) {
    const node = nodes[index];
    minX = Math.min(minX, node.x - node._R);
    maxX = Math.max(maxX, node.x + node._R);
    minY = Math.min(minY, node.y - node._R);
    maxY = Math.max(maxY, node.y + node._R);
  }
  cam.tx = (minX + maxX) / 2;
  cam.ty = (minY + maxY) / 2;
  const fit = Math.min(VW / ((maxX - minX) * 1.35), VH / ((maxY - minY) * 1.45));
  cam.ts = Math.max(isPhone() ? 0.6 : 0.5, Math.min(fit, 1.15));
}

const atlasTools = {
  focus({ query }) {
    const index = findNode(query);
    if (index < 0) return { found: false, query };
    focusNode(index);
    return { found: true, ...describeNode(index) };
  },

  highlight({ query }) {
    const normalized = (query || "").toLowerCase();
    const hits = [];
    nodes.forEach((node, index) => {
      if (node.guide) return;
      const haystack = [node.name, node.kind, node.fragment, node.note, ...node.tags].join(" ").toLowerCase();
      if (haystack.includes(normalized)) {
        salience.raise(index, 0.6);
        hits.push(node.name);
      }
    });
    return { theme: query, thoughts: hits, count: hits.length };
  },

  // Several thoughts at once, each as alive as the backend says. The view
  // holds the set; nothing opens, nothing is announced.
  attend({ thoughts }) {
    const attended = [];
    const missing = [];
    const seen = new Set();
    for (const item of Array.isArray(thoughts) ? thoughts : []) {
      const query = typeof item === "string" ? item : item?.query;
      const weight = typeof item === "object" && Number.isFinite(item?.weight) ? item.weight : 0.75;
      const index = findNode(query, 24);
      if (index < 0) { missing.push(query); continue; }
      salience.raise(index, Math.max(0.2, Math.min(1, weight)));
      if (seen.has(index)) continue;
      seen.add(index);
      attended.push({ name: nodes[index].name, weight, index });
    }
    if (attended.length) holdInView(attended.map((entry) => entry.index));
    return { attended: attended.map(({ name, weight }) => ({ name, weight })), missing };
  },

  connect({ a, b, relation }) {
    const first = findNode(a);
    const second = findNode(b);
    if (first < 0 || second < 0) {
      return { ok: false, missing: first < 0 ? a : b };
    }
    edges.push({ a: first, b: second, relation: relation || "a connection surfaced in conversation" });
    salience.raise(first, 0.85);
    salience.raise(second, 0.85);
    holdInView([first, second]);
    document.getElementById("link-count").textContent = String(edges.length);
    return { ok: true, pair: [nodes[first].name, nodes[second].name], relation };
  },

  spawn_concept({ name, note, near, question }) {
    if (!name) return { ok: false, reason: "a new thought needs a name" };
    const id = `spawn-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${nodes.length}`;
    const anchorIndex = near ? findNode(near) : focusId;
    const anchor = anchorIndex >= 0 ? nodes[anchorIndex] : { x: WORLD.w / 2, y: WORLD.h / 2 };
    const angle = (hashString(id) % 628) / 100;
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
    wave.index([nodes.length - 1]);
    if (anchorIndex >= 0) edges.push({ a: anchorIndex, b: nodes.length - 1, relation: "this thought surfaced nearby" });
    document.getElementById("concept-count").textContent = String(nodes.filter((node) => !node.guide).length);
    document.getElementById("link-count").textContent = String(edges.length);
    focusNode(nodes.length - 1);
    return { ok: true, name, near: anchorIndex >= 0 ? anchor.name : null };
  },
};

// What the guide is told the visitor can see. Pushed as context rather than
// fetched by a tool, so "that one" resolves without a round trip.
function readView() {
  const focused = focusId >= 0 && !nodes[focusId]?.guide ? nodes[focusId] : null;
  return {
    focus: focused
      ? { name: focused.name, kind: focused.kind, source: focused.source, question: focused.question }
      : null,
    visible: nodes
      .filter((node) => !node.guide && node._poly?.some(([x, y]) => x > 0 && x < VW && y > 0 && y < VH))
      .map((node) => node.name),
    trail: trail.map((id) => nodes.find((node) => node.id === id)?.name).filter(Boolean),
    alive: salience.top(6, 0.25).map(({ index }) => nodes[index].name),
  };
}

voice = installVoice({
  tools: atlasTools,
  read: readView,
  onOpen: dismissWelcome,
  hear: (fragment) => wave.hear(fragment),
  onClose: () => wave.quiet(),
});
// ?debug exposes the same port the voice layer uses, so a tool can be tried
// from the console without spending a voice session on it.
if (new URLSearchParams(location.search).has("debug")) window.abacus = { tools: atlasTools, read: readView, salience, wave, seep, get nodes() { return nodes; } };

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
wave.index(nodes.map((_, index) => index));
wave.ready.then((state) => console.info(state.ok ? `[wave] ${state.model} ready in ${state.ms} ms` : `[wave] off: ${state.message}`));
updateTrail();
recenter();
requestAnimationFrame(loop);
