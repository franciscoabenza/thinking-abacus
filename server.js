import { createServer } from "node:http";
import { readFile, appendFile, mkdir, stat } from "node:fs/promises";
import { extname } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { abacusSession } from "./web/voice/agent.js";

const PORT = Number(process.env.PORT) || 5174;
// 0.0.0.0 so a host container (Railway, Fly, Docker, …) can route to this
// process; still reachable at 127.0.0.1 for local use. Override with HOST if
// you specifically need to bind to one interface only.
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = new URL("./web/", import.meta.url);
const MAX_OFFER_BYTES = 64 * 1024;
// Session traces: JSON lines per conversation, one folder per day.
const TRACE_DIR = new URL("./traces/", import.meta.url);
const MAX_TRACE_BATCH_BYTES = 256 * 1024;
const MAX_TRACE_FILE_BYTES = 8 * 1024 * 1024;

// When the atlas is reachable from the internet, only a visitor holding the
// key may mint a billable session. Unset locally, nothing is gated.
const ACCESS_KEY = process.env.VOICE_ACCESS_KEY || "";
// Ceilings on how much money a leaked link can spend.
const LIMITS = { perIp: 8, perIpWindowMs: 10 * 60_000, global: 40, globalWindowMs: 60 * 60_000 };

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

// GPT-Live fixes instructions, voice, and the delegated backend when the
// session is minted, so the whole agent is declared here rather than pushed
// from the browser after connecting. web/voice/agent.js is the one definition
// of it, shared with the code that runs the tools.
const SESSION = abacusSession({
  model: process.env.LIVE_MODEL,
  backendModel: process.env.LIVE_BACKEND_MODEL,
  voice: process.env.LIVE_VOICE,
  delegation: process.env.LIVE_DELEGATION || "responses",
});

function keyMatches(offered) {
  if (!ACCESS_KEY) return true;
  offered = String(offered || "");
  return offered.length === ACCESS_KEY.length && timingSafeEqual(Buffer.from(offered), Buffer.from(ACCESS_KEY));
}

const holdsAccessKey = (req) => keyMatches(req.headers["x-abacus-key"]);

// Append a batch of trace lines. The browser names the trace; the server only
// checks the name is a plain token and the file has not grown absurd.
async function appendTrace(batch, address) {
  if (!/^t_[a-z0-9_]{6,40}$/i.test(batch.trace) || !Array.isArray(batch.lines)) {
    throw Object.assign(new Error("Malformed trace batch"), { status: 400 });
  }
  const day = new Date().toISOString().slice(0, 10);
  const dir = new URL(`./${day}/`, TRACE_DIR);
  await mkdir(dir, { recursive: true });
  const file = new URL(`./${batch.trace}.jsonl`, dir);
  let size = 0;
  try { size = (await stat(file)).size; } catch {}
  if (size === 0) {
    await appendFile(file, JSON.stringify({ kind: "trace.server", at: new Date().toISOString(), address, live: batch.live ?? null }) + "\n");
  }
  if (size > MAX_TRACE_FILE_BYTES) return;
  const text = batch.lines
    .filter((line) => line && typeof line === "object")
    .map((line) => JSON.stringify(batch.live && !line.live ? { ...line, live: batch.live } : line))
    .join("\n");
  if (text) await appendFile(file, text + "\n");
}

// Tunnels and proxies put the visitor's address in a header; fall back to
// the socket for direct local use.
function clientAddress(req) {
  return (
    String(req.headers["cf-connecting-ip"] || "").trim() ||
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

const mintLog = { global: [], byAddress: new Map() };

function withinLimits(address) {
  const now = Date.now();
  mintLog.global = mintLog.global.filter((t) => now - t < LIMITS.globalWindowMs);
  const mine = (mintLog.byAddress.get(address) || []).filter((t) => now - t < LIMITS.perIpWindowMs);
  mintLog.byAddress.set(address, mine);
  if (mintLog.global.length >= LIMITS.global || mine.length >= LIMITS.perIp) return false;
  mintLog.global.push(now);
  mine.push(now);
  return true;
}

function readBody(req, limit = MAX_OFFER_BYTES) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Mint a GPT-Live call. The OPENAI_API_KEY stays on the server and is never
// exposed to the browser; the browser only ever sees its own SDP answer back.
async function mintLiveSession(offerSdp) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set for the local server.");
  }

  const response = await fetch("https://api.openai.com/v1/live/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: SESSION,
      transport: { type: "webrtc", sdp: offerSdp },
    }),
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`GPT-Live session failed (${response.status}): ${body}`);
  }
  return body;
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const fileUrl = new URL(`.${requestedPath}`, PUBLIC_DIR);

  // Block path traversal outside the web/ root.
  if (!fileUrl.href.startsWith(PUBLIC_DIR.href)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(fileUrl);
    const extension = extname(fileUrl.pathname);
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    if (extension === ".html") {
      const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
      const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
      const protocol = /^https?$/.test(forwardedProto) ? forwardedProto : "http";
      const requestedHost = forwardedHost || req.headers.host || `${HOST}:${PORT}`;
      const host = /^[a-z0-9.:[\]-]+$/i.test(requestedHost) ? requestedHost : `${HOST}:${PORT}`;
      res.end(file.toString("utf8").replaceAll("__SITE_ORIGIN__", `${protocol}://${host}`));
      return;
    }
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/session") {
      if (!holdsAccessKey(req)) {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "This atlas needs its key. Open it from the link that carries one." }));
        return;
      }
      const address = clientAddress(req);
      if (!withinLimits(address)) {
        console.warn(`[server] session limit reached for ${address}`);
        res.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Too many sessions for now. Try again in a few minutes." }));
        return;
      }
      let offer = {};
      try {
        offer = JSON.parse((await readBody(req)) || "{}");
      } catch {
        offer = {};
      }
      if (typeof offer.sdp !== "string" || !offer.sdp.trim()) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "An SDP offer is required" }));
        return;
      }
      // Mint first: writing the success header before the call means a
      // failure can no longer be reported.
      const minted = await mintLiveSession(offer.sdp);
      console.info(`[server] session minted for ${address}`);
      // Hand back the session id and SDP answer exactly as the API shaped them.
      res.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
      res.end(minted);
      return;
    }
    if (req.method === "POST" && req.url === "/trace") {
      let batch = {};
      try {
        batch = JSON.parse((await readBody(req, MAX_TRACE_BATCH_BYTES)) || "{}");
      } catch {
        batch = {};
      }
      if (!keyMatches(batch.key)) {
        res.writeHead(401);
        res.end();
        return;
      }
      try {
        await appendTrace(batch, clientAddress(req));
      } catch (error) {
        res.writeHead(error.status || 500);
        res.end();
        return;
      }
      res.writeHead(204);
      res.end();
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    console.error(`[server] ${req.method} ${req.url}: ${error.message}`);
    if (res.headersSent) {
      res.end();
      return;
    }
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Thinking Abacus toy running at http://${HOST}:${PORT}`);
});
