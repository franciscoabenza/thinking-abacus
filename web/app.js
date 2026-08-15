import { CONCEPTS, LINKS } from "./concepts.js";

// ---------------------------------------------------------------------------
// Baked design settings — the look Fran dialed in on the playground bench.
// { round:7, pack:0.93, hier:0.59, motion:0.02, palette:"ink", labels:"off", guide:true }
// ---------------------------------------------------------------------------
const CFG = { round: 7, pack: 0.93, hier: 0.59, motion: 0.02, guide: true };
const MODEL = "gpt-realtime-2";

const PAL = {
  bg: "#f1ede3",
  cell: "#fbfaf6",
  cellHover: "#ffffff",
  stroke: "rgba(26,24,20,0.5)",
  text: "#1a1814",
  guide: "#bfff00",
  spawnStroke: "rgba(120,150,0,0.85)",
};

// ---------------------------------------------------------------------------
// World / camera
// ---------------------------------------------------------------------------
const WORLD = { w: 1500, h: 1100 };
const cv = document.getElementById("map");
const ctx = cv.getContext("2d");
let VW = 0, VH = 0;
const dpr = Math.min(window.devicePixelRatio || 1, 2);

function resize() {
  VW = cv.clientWidth;
  VH = cv.clientHeight;
  cv.width = Math.round(VW * dpr);
  cv.height = Math.round(VH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);

const cam = { x: WORLD.w / 2, y: WORLD.h / 2, scale: 0.7, tx: WORLD.w / 2, ty: WORLD.h / 2, ts: 0.7 };
function worldToScreen(p) {
  return [(p[0] - cam.x) * cam.scale + VW / 2, (p[1] - cam.y) * cam.scale + VH / 2];
}
function screenToWorld(sx, sy) {
  return [(sx - VW / 2) / cam.scale + cam.x, (sy - VH / 2) / cam.scale + cam.y];
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------
let nodes = [];
let edges = [];
const MAXN = 14;

function makeNode(c, opts = {}) {
  return {
    id: c.id,
    name: c.name,
    note: c.note || "",
    n: c.n || 5,
    spawned: !!opts.spawned,
    x: opts.x ?? (WORLD.w / 2 + (Math.random() - 0.5) * 360),
    y: opts.y ?? (WORLD.h / 2 + (Math.random() - 0.5) * 280),
    vx: 0, vy: 0,
    phase: Math.random() * 6.28,
    phase2: Math.random() * 6.28,
    sc: opts.spawned ? 0.02 : 1,
    born: opts.spawned ? performance.now() / 1000 : -999,
    highlight: 0,
  };
}

function rebuildEdges() {
  const idx = {};
  nodes.forEach((nd, i) => (idx[nd.id] = i));
  const seen = new Set();
  edges = [];
  for (const [a, b] of LINKS) {
    if (idx[a] == null || idx[b] == null) continue;
    const k = idx[a] < idx[b] ? `${idx[a]}-${idx[b]}` : `${idx[b]}-${idx[a]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push([idx[a], idx[b]]);
  }
}

function initNodes() {
  nodes = CONCEPTS.map((c) => makeNode(c));
  // the guide blob
  const g = makeNode({ id: "abacus", name: "Abacus", note: "Your voice guide.", n: 7 });
  g.guide = true;
  nodes.push(g);
  rebuildEdges();
}

function Rof(nd) {
  const ratio = Math.sqrt(nd.n) / Math.sqrt(MAXN);
  const r = 38 + (10 + 46 * CFG.hier) * ratio;
  return nd.guide ? Math.max(r, 48) : r;
}

// ---------------------------------------------------------------------------
// Geometry: power-Voronoi cell, rounded corners (junction voids)
// ---------------------------------------------------------------------------
const NGON = [];
for (let k = 0; k < 22; k++) {
  const a = (k / 22) * Math.PI * 2;
  NGON.push([Math.cos(a), Math.sin(a)]);
}
const RECT = [[-60, -60], [WORLD.w + 60, -60], [WORLD.w + 60, WORLD.h + 60], [-60, WORLD.h + 60]];

function clipHalf(poly, ax, ay, c) {
  if (poly.length === 0) return poly;
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const A = poly[i], B = poly[(i + 1) % n];
    const dA = ax * A[0] + ay * A[1] - c, dB = ax * B[0] + ay * B[1] - c;
    const inA = dA <= 0;
    if (inA) out.push(A);
    if (inA !== (dB <= 0)) {
      const t = dA / (dA - dB);
      out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]);
    }
  }
  return out;
}

function cellOf(f) {
  let poly = RECT;
  for (let j = 0; j < nodes.length; j++) {
    const t = nodes[j];
    if (t === f) continue;
    const ax = 2 * (t.x - f.x), ay = 2 * (t.y - f.y);
    const c = t.x * t.x + t.y * t.y - f.x * f.x - f.y * f.y - t._w2 + f._w2;
    poly = clipHalf(poly, ax, ay, c);
    if (poly.length === 0) return poly;
  }
  for (let k = 0; k < NGON.length; k++) {
    const nx = NGON[k][0], ny = NGON[k][1];
    poly = clipHalf(poly, nx, ny, f.x * nx + f.y * ny + f._R);
    if (poly.length === 0) return poly;
  }
  return poly;
}

function centroid(p) {
  let x = 0, y = 0;
  for (let i = 0; i < p.length; i++) { x += p[i][0]; y += p[i][1]; }
  return [x / p.length, y / p.length];
}
function pip(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function roundPath(poly, rad) {
  const n = poly.length;
  if (n < 3) return;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const P = poly[(i - 1 + n) % n], V = poly[i], N = poly[(i + 1) % n];
    let v1x = P[0] - V[0], v1y = P[1] - V[1];
    const l1 = Math.hypot(v1x, v1y) || 1;
    let v2x = N[0] - V[0], v2y = N[1] - V[1];
    const l2 = Math.hypot(v2x, v2y) || 1;
    const t = Math.min(rad, l1 * 0.5, l2 * 0.5);
    const ax = V[0] + (v1x / l1) * t, ay = V[1] + (v1y / l1) * t;
    const bx = V[0] + (v2x / l2) * t, by = V[1] + (v2y / l2) * t;
    if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
    ctx.quadraticCurveTo(V[0], V[1], bx, by);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Simulation (world space) — near-still per baked motion = 0.02
// ---------------------------------------------------------------------------
function step(t) {
  nodes.forEach((nd) => {
    nd._R = Rof(nd);
    nd._w2 = (nd._R * 0.72) * (nd._R * 0.72);
    nd.sc += (1 - nd.sc) * 0.08;
    if (nd.highlight > 0) nd.highlight = Math.max(0, nd.highlight - 0.012);
  });
  for (const [i, j] of edges) {
    const A = nodes[i], B = nodes[j];
    let dx = B.x - A.x, dy = B.y - A.y;
    const d = Math.hypot(dx, dy) || 0.01;
    const L = (A._R + B._R) * 1.0;
    const f = ((d - L) * 0.012) / d;
    dx *= f; dy *= f;
    A.vx += dx; A.vy += dy; B.vx -= dx; B.vy -= dy;
  }
  const sepF = 0.62 - 0.2 * CFG.pack;
  for (let i = 0; i < nodes.length; i++) {
    const A = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const B = nodes[j];
      let dx = B.x - A.x, dy = B.y - A.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const sep = (A._R + B._R) * sepF;
      if (d < sep) {
        const f = ((sep - d) / d) * 0.045;
        dx *= f; dy *= f;
        A.vx -= dx; A.vy -= dy; B.vx += dx; B.vy += dy;
      }
    }
  }
  const amp = 0.012 + 0.06 * CFG.motion;
  for (const nd of nodes) {
    nd.vx += (WORLD.w / 2 - nd.x) * 0.0008 + amp * Math.sin(t * 0.6 + nd.phase);
    nd.vy += (WORLD.h / 2 - nd.y) * 0.0008 + amp * Math.cos(t * 0.5 + nd.phase2);
    nd.vx *= 0.86; nd.vy *= 0.86;
    nd.x += nd.vx; nd.y += nd.vy;
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
let hoverId = -1, focusId = -1;
function draw(t) {
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, VW, VH);

  const order = nodes
    .map((nd, i) => i)
    .sort((a, b) => {
      const ra = a === hoverId || a === focusId || nodes[a].guide ? 1 : 0;
      const rb = b === hoverId || b === focusId || nodes[b].guide ? 1 : 0;
      return ra - rb;
    });

  for (const i of order) {
    const f = nodes[i];
    const cell = cellOf(f);
    if (cell.length < 3) { f._poly = null; continue; }
    const c = centroid(cell);
    const inset = 0.72 + 0.22 * CFG.pack;
    const lifted = i === hoverId || i === focusId;
    const grow = f.sc * (lifted ? 1.04 : 1) * (1 + 0.012 * Math.sin(t * 1.1 + f.phase));
    // inset in world, then project to screen
    const screenPoly = cell.map((p) => worldToScreen([
      c[0] + (p[0] - c[0]) * inset * grow,
      c[1] + (p[1] - c[1]) * inset * grow,
    ]));
    f._poly = screenPoly;
    const sc = worldToScreen(c);

    roundPath(screenPoly, CFG.round);
    if (f.guide) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      ctx.fillStyle = PAL.guide;
      ctx.fill();
      ctx.lineWidth = 2 + pulse * 2;
      ctx.strokeStyle = `rgba(120,150,0,${0.3 + pulse * 0.4})`;
      ctx.stroke();
    } else {
      ctx.fillStyle = lifted ? PAL.cellHover : PAL.cell;
      ctx.fill();
      ctx.lineWidth = lifted ? 1.4 : 0.8 + f.highlight * 1.6;
      ctx.strokeStyle = f.spawned ? PAL.spawnStroke : PAL.stroke;
      if (f.highlight > 0) ctx.strokeStyle = PAL.spawnStroke;
      ctx.stroke();
    }

    // Labels are off in the resting state; reveal on hover / focus / guide.
    if (f.guide) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#0a0a0a";
      ctx.font = `italic ${Math.round(20 * cam.scale + 6)}px "Instrument Serif", Georgia, serif`;
      ctx.fillText("Abacus", sc[0], sc[1]);
    } else if (lifted) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = PAL.text;
      const size = Math.max(13, Math.round(16 * cam.scale));
      ctx.font = `${size}px "Instrument Serif", Georgia, serif`;
      const words = f.name.split(" ");
      const lines = [];
      let line = "";
      const maxw = (f._R * cam.scale) * 1.5;
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (ctx.measureText(test).width > maxw && line) { lines.push(line); line = w; } else line = test;
      }
      if (line) lines.push(line);
      const lh = size + 2;
      const start = sc[1] - ((lines.length - 1) * lh) / 2;
      lines.slice(0, 3).forEach((ln, li) => ctx.fillText(ln, sc[0], start + li * lh));
    }
  }
}

// ---------------------------------------------------------------------------
// Camera easing + main loop
// ---------------------------------------------------------------------------
function tickCamera() {
  cam.x += (cam.tx - cam.x) * 0.08;
  cam.y += (cam.ty - cam.y) * 0.08;
  cam.scale += (cam.ts - cam.scale) * 0.08;
}
let last = 0;
function loop(ts) {
  if (!last) last = ts;
  let dt = (ts - last) / 1000;
  if (dt > 0.05) dt = 0.05;
  last = ts;
  const t = ts / 1000;
  step(t);
  tickCamera();
  draw(t);
  requestAnimationFrame(loop);
}

function recenter() {
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const nd of nodes) {
    minx = Math.min(minx, nd.x - nd._R); maxx = Math.max(maxx, nd.x + nd._R);
    miny = Math.min(miny, nd.y - nd._R); maxy = Math.max(maxy, nd.y + nd._R);
  }
  cam.tx = (minx + maxx) / 2;
  cam.ty = (miny + maxy) / 2;
  const pad = 1.12;
  cam.ts = Math.min(VW / ((maxx - minx) * pad), VH / ((maxy - miny) * pad), 1.6);
}

// ---------------------------------------------------------------------------
// Pointer: drag-pan, wheel-zoom, click-focus, hover
// ---------------------------------------------------------------------------
let down = false, moved = false, lastPos = null;
function localPos(e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) * (VW / r.width), (e.clientY - r.top) * (VH / r.height)];
}
function pickAt(sx, sy) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const f = nodes[i];
    if (f._poly && f._poly.length > 2 && pip(f._poly, sx, sy)) return i;
  }
  return -1;
}
cv.addEventListener("pointerdown", (e) => { down = true; moved = false; lastPos = localPos(e); cv.classList.add("dragging"); });
cv.addEventListener("pointermove", (e) => {
  const p = localPos(e);
  if (down) {
    const dx = p[0] - lastPos[0], dy = p[1] - lastPos[1];
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    cam.x -= dx / cam.scale; cam.tx = cam.x;
    cam.y -= dy / cam.scale; cam.ty = cam.y;
    lastPos = p;
  } else {
    hoverId = pickAt(p[0], p[1]);
  }
});
cv.addEventListener("pointerup", (e) => {
  down = false; cv.classList.remove("dragging");
  if (!moved) {
    const p = localPos(e);
    const hit = pickAt(p[0], p[1]);
    if (hit >= 0 && !nodes[hit].guide) focusNode(hit);
  }
});
cv.addEventListener("pointerleave", () => { hoverId = -1; });
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  const p = localPos(e);
  const before = screenToWorld(p[0], p[1]);
  cam.ts = Math.max(0.35, Math.min(2.4, cam.ts * (e.deltaY < 0 ? 1.12 : 0.89)));
  cam.scale = cam.ts;
  const after = screenToWorld(p[0], p[1]);
  cam.x += before[0] - after[0]; cam.tx = cam.x;
  cam.y += before[1] - after[1]; cam.ty = cam.y;
}, { passive: false });

function showDetail(nd) {
  const el = document.getElementById("detail");
  if (!nd) { el.classList.add("hidden"); return; }
  document.getElementById("detail-name").textContent = nd.name;
  document.getElementById("detail-note").textContent = nd.note;
  el.classList.remove("hidden");
}
function focusNode(i) {
  focusId = i;
  const nd = nodes[i];
  cam.tx = nd.x; cam.ty = nd.y; cam.ts = Math.max(cam.ts, 1.15);
  showDetail(nd);
}

document.getElementById("recenter").addEventListener("click", () => { focusId = -1; showDetail(null); recenter(); });

// ---------------------------------------------------------------------------
// Concept lookup + the agent's tools
// ---------------------------------------------------------------------------
function findNode(query) {
  if (!query) return -1;
  const q = query.toLowerCase().trim();
  let best = -1, bestScore = 0;
  nodes.forEach((nd, i) => {
    if (nd.guide) return;
    const hay = (nd.name + " " + nd.note).toLowerCase();
    let score = 0;
    if (nd.name.toLowerCase() === q) score = 100;
    else if (nd.name.toLowerCase().includes(q) || q.includes(nd.name.toLowerCase())) score = 60;
    else {
      for (const tok of q.split(/\s+/)) if (tok.length > 2 && hay.includes(tok)) score += 8;
    }
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return bestScore > 0 ? best : -1;
}

const tools = {
  focus({ query }) {
    const i = findNode(query);
    if (i < 0) return { found: false, query };
    focusNode(i);
    const nd = nodes[i];
    const neighbors = edges
      .filter(([a, b]) => a === i || b === i)
      .map(([a, b]) => nodes[a === i ? b : a].name);
    return { found: true, name: nd.name, note: nd.note, neighbors };
  },
  highlight({ query }) {
    const q = (query || "").toLowerCase();
    const hits = [];
    nodes.forEach((nd) => {
      if (nd.guide) return;
      if ((nd.name + " " + nd.note).toLowerCase().includes(q)) { nd.highlight = 1; hits.push(nd.name); }
    });
    return { highlighted: hits };
  },
  connect({ a, b }) {
    const ia = findNode(a), ib = findNode(b);
    if (ia < 0 || ib < 0) return { ok: false, a, b };
    edges.push([ia, ib]);
    cam.tx = (nodes[ia].x + nodes[ib].x) / 2;
    cam.ty = (nodes[ia].y + nodes[ib].y) / 2;
    cam.ts = 1.0;
    nodes[ia].highlight = 1; nodes[ib].highlight = 1;
    return { ok: true, connected: [nodes[ia].name, nodes[ib].name] };
  },
  spawn_concept({ name, note, near }) {
    if (!name) return { ok: false };
    const id = "spawn-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + nodes.length;
    const anchorIdx = near ? findNode(near) : (focusId >= 0 ? focusId : -1);
    const anchor = anchorIdx >= 0 ? nodes[anchorIdx] : { x: WORLD.w / 2, y: WORLD.h / 2 };
    const ang = Math.random() * Math.PI * 2;
    const node = makeNode(
      { id, name, note: note || "", n: 5 },
      { spawned: true, x: anchor.x + Math.cos(ang) * 90, y: anchor.y + Math.sin(ang) * 90 }
    );
    nodes.push(node);
    if (anchorIdx >= 0) edges.push([anchorIdx, nodes.length - 1]);
    focusNode(nodes.length - 1);
    return { ok: true, name, anchored_to: anchorIdx >= 0 ? anchor.name : null };
  },
  get_view_state() {
    const visible = nodes
      .filter((nd) => !nd.guide && nd._poly && nd._poly.some(([x, y]) => x > 0 && x < VW && y > 0 && y < VH))
      .map((nd) => nd.name);
    return { focused: focusId >= 0 ? nodes[focusId].name : null, visible, total: nodes.length };
  },
};

// ---------------------------------------------------------------------------
// Voice: OpenAI Realtime over WebRTC (stanley-terminal pattern)
// ---------------------------------------------------------------------------
let pc = null, dc = null, localStream = null, micMuted = false;

function instructions() {
  return `You are Abacus, the voice guide to a living map of Fran's thinking — each cell is one of his concepts. Speak in one or two short sentences. ` +
    `When the user mentions or asks about a concept, call focus to move the map to it. ` +
    `Call highlight to emphasize a theme across several cells. ` +
    `Call connect to draw a relationship between two concepts. ` +
    `When the conversation surfaces a genuinely NEW idea that isn't already on the map, call spawn_concept with a short name, a one-line note, and set near to the most related existing concept — you are growing Fran's map as you talk. ` +
    `Never invent what a concept contains; if asked, focus it and read its note. Use get_view_state if you need to know what is on screen.`;
}

const toolSchemas = [
  { type: "function", name: "focus", description: "Pan and zoom the map to a concept by name or description.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { type: "function", name: "highlight", description: "Emphasize all concepts matching a word or theme.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { type: "function", name: "connect", description: "Draw a relationship line between two concepts and frame both.", parameters: { type: "object", properties: { a: { type: "string" }, b: { type: "string" } }, required: ["a", "b"] } },
  { type: "function", name: "spawn_concept", description: "Add a NEW concept cell to the map. Use when a fresh idea comes up.", parameters: { type: "object", properties: { name: { type: "string" }, note: { type: "string", description: "one-line essence" }, near: { type: "string", description: "name of the most related existing concept" } }, required: ["name"] } },
  { type: "function", name: "get_view_state", description: "Return the focused concept and which concepts are currently on screen.", parameters: { type: "object", properties: {} } },
];

function sendEvent(ev) { if (dc && dc.readyState === "open") dc.send(JSON.stringify(ev)); }

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
  const fn = tools[item.name];
  const output = fn ? fn(args) : { error: "unknown tool" };
  sendEvent({
    type: "conversation.item.create",
    item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify(output) },
  });
  sendEvent({ type: "response.create" });
}

function setLabel(text) { document.getElementById("voice-label").textContent = text; }

function handleEvent(ev) {
  if (ev.type === "input_audio_buffer.speech_started") setLabel("Listening");
  if (ev.type === "input_audio_buffer.speech_stopped") setLabel("Thinking");
  if (ev.type === "response.done") {
    for (const item of ev.response?.output || []) {
      if (item.type === "function_call") handleTool(item);
    }
    setLabel("Live");
  }
  if (ev.type === "error") {
    setLabel("Voice error");
    console.error("realtime error", ev.error);
  }
}

async function connectVoice() {
  const button = document.getElementById("voice-button");
  setLabel("Connecting");
  button.disabled = true;

  pc = new RTCPeerConnection();
  dc = pc.createDataChannel("oai-events");
  pc.ontrack = (e) => { document.getElementById("remote-audio").srcObject = e.streams[0]; };
  pc.onconnectionstatechange = () => {
    const s = pc?.connectionState;
    if (s === "connected") { setLabel("Live"); button.classList.add("live"); button.disabled = false; document.getElementById("mic-toggle").hidden = false; }
    if (["failed", "disconnected", "closed"].includes(s)) { setLabel("Talk to Abacus"); button.classList.remove("live"); button.disabled = false; document.getElementById("mic-toggle").hidden = true; }
  };
  dc.addEventListener("open", configureSession);
  dc.addEventListener("message", (e) => handleEvent(JSON.parse(e.data)));

  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(localStream.getAudioTracks()[0], localStream);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const res = await fetch("/session", { method: "POST", body: offer.sdp, headers: { "Content-Type": "application/sdp" } });
  if (!res.ok) throw new Error(await res.text());
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
}

function stopVoice() {
  try { dc?.close(); } catch {}
  try { pc?.close(); } catch {}
  localStream?.getTracks().forEach((t) => t.stop());
  pc = null; dc = null; localStream = null;
  document.getElementById("voice-button").classList.remove("live");
  document.getElementById("mic-toggle").hidden = true;
  setLabel("Talk to Abacus");
}

document.getElementById("voice-button").addEventListener("click", async () => {
  if (pc && ["connected", "connecting"].includes(pc.connectionState)) { stopVoice(); return; }
  try { await connectVoice(); }
  catch (err) {
    console.error(err);
    setLabel(/OPENAI_API_KEY/.test(err.message) ? "Needs key" : /Permission|Microphone|denied/i.test(err.message) ? "Mic blocked" : "Voice error");
    stopVoice();
  }
});
document.getElementById("mic-toggle").addEventListener("click", () => {
  micMuted = !micMuted;
  localStream?.getAudioTracks().forEach((t) => (t.enabled = !micMuted));
  document.getElementById("mic-toggle").textContent = micMuted ? "Unmute" : "Mute";
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
resize();
initNodes();
nodes.forEach((nd) => { nd._R = Rof(nd); nd._w2 = (nd._R * 0.72) * (nd._R * 0.72); });
for (let i = 0; i < 120; i++) step(0.016 * i); // warm up the layout
recenter();
requestAnimationFrame(loop);
