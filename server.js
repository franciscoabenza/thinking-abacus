import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const PORT = Number(process.env.PORT) || 5174;
const HOST = process.env.HOST || "127.0.0.1";
const MODEL = process.env.REALTIME_MODEL || "gpt-realtime-2";
const PUBLIC_DIR = new URL("./web/", import.meta.url);

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

// Minimal realtime session config. The browser sends the authoritative
// session.update (instructions + tools) once the data channel opens; this
// just needs to be enough to start the call.
const sessionConfig = JSON.stringify({
  type: "realtime",
  model: MODEL,
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Mint a WebRTC realtime call. The OPENAI_API_KEY stays on the server and is
// never exposed to the browser. Mirrors the stanley-terminal pattern.
async function createRealtimeCall(sdp) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set for the local server.");
  }

  const formData = new FormData();
  formData.set("sdp", sdp);
  formData.set("session", sessionConfig);

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  const answerSdp = await response.text();

  if (!response.ok) {
    throw new Error(`OpenAI Realtime call failed (${response.status}): ${answerSdp}`);
  }
  return answerSdp;
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
      const sdp = await readBody(req);
      const answerSdp = await createRealtimeCall(sdp);
      res.writeHead(200, { "Content-Type": "application/sdp" });
      res.end(answerSdp);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    console.error(`[server] ${req.method} ${req.url}: ${error.message}`);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Thinking Abacus toy running at http://${HOST}:${PORT}`);
});
