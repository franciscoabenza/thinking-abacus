// A pure log of one voice session.
//
// Nothing here interprets anything. Every fragment of speech, every tool call,
// every context push and change of presence is stamped with the wall clock
// and the milliseconds since the session opened, buffered briefly, and sent
// to the server as JSON lines. Later, the file can be replayed, graphed, or
// mined for the moments where the visitor said how this should change.

const FLUSH_MS = 2500;
const MAX_BATCH = 200;

/**
 * @param {object} options
 * @param {string} [options.endpoint]  Server route that appends lines.
 * @param {string} [options.key]       Access key, carried in the body so a beacon can send it too.
 * @param {object} [options.meta]      Anything worth knowing about this device or page.
 */
export function createTrace({ endpoint = "/trace", key = "", meta = {} } = {}) {
  const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const openedAt = Date.now();
  let lines = [];
  let timer = null;
  let closed = false;
  let live = null;

  const stamp = (kind, data) => ({ t: Date.now() - openedAt, at: new Date().toISOString(), kind, ...data });

  async function flush({ beacon = false } = {}) {
    if (!lines.length) return;
    const body = JSON.stringify({ key, trace: id, live, lines });
    lines = [];
    clearTimeout(timer);
    timer = null;
    // A page going away gets one last shot with a beacon; nothing else does.
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      return;
    }
    try {
      await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    } catch {
      // A lost batch is a gap in the record, not a reason to disturb the conversation.
    }
  }

  const onPageHide = () => flush({ beacon: true });
  addEventListener("pagehide", onPageHide);

  function note(kind, data = {}) {
    if (closed) return;
    lines.push(stamp(kind, data));
    if (lines.length >= MAX_BATCH) flush();
    else if (!timer) timer = setTimeout(flush, FLUSH_MS);
  }

  note("trace.open", {
    ua: navigator.userAgent,
    viewport: typeof innerWidth === "number" ? [innerWidth, innerHeight] : null,
    ...meta,
  });

  return {
    id,
    note,
    /** The GPT-Live session id, once known; recorded and attached to every later batch. */
    live(sessionId) {
      live = sessionId;
      note("session.live", { live: sessionId });
    },
    flush,
    async end(data = {}) {
      note("trace.end", data);
      closed = true;
      removeEventListener("pagehide", onPageHide);
      await flush();
    },
  };
}
