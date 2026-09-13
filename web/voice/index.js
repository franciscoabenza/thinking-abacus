// Wiring, and nothing else.
//
// The session, the panel, and the narrator each hide their own domain; this
// file only says how they are connected to the atlas. It stays small on
// purpose — when it starts growing logic, that logic belongs in one of them.
import { createLiveSession } from "./live.js";
import { createVoicePanel } from "./panel.js";
import { createNarrator } from "./narrator.js";
import { createTrace } from "./trace.js";
import { TOOLS } from "./agent.js";

// Tools that change what is on screen, and so owe the guide a new sentence
// about where the visitor now is.
const MOVES_THE_VIEW = new Set(["focus", "attend", "connect", "spawn_concept", "highlight"]);

function failureLabel(error) {
  const message = error?.message || "";
  if (/OPENAI_API_KEY/i.test(message)) return "Needs API key";
  if (/needs its key/i.test(message)) return "Needs the link's key";
  if (/too many sessions/i.test(message)) return "Too many sessions";
  if (/permission|microphone|denied|notallowed/i.test(message)) return "Mic blocked";
  return "Voice error";
}

// A link can carry the atlas's key (?k=…). It is remembered for this browser
// and scrubbed from the address bar so it is not shared by accident.
function accessKey() {
  try {
    const url = new URL(location.href);
    const offered = url.searchParams.get("k");
    if (offered) {
      localStorage.setItem("abacus-key", offered);
      url.searchParams.delete("k");
      history.replaceState(null, "", url);
    }
    return localStorage.getItem("abacus-key") || "";
  } catch {
    return "";
  }
}

/**
 * @param {object} atlas
 * @param {Record<string, (args: object) => unknown>} atlas.tools  One handler per declared tool.
 * @param {() => object} atlas.read                                Current view, for the narrator.
 * @param {() => void} [atlas.onOpen]                              The map is about to be spoken to.
 */
export function installVoice(atlas, { endpoint = "/session" } = {}) {
  // The schemas the backend is given and the handlers the browser runs are
  // declared in different places; catch a mismatch here rather than as a
  // silent no-op mid-conversation.
  let muted = false;
  let busy = false;
  /** One trace per conversation; null between them. */
  let trace = null;
  const key = accessKey();

  // Tools that belong to the voice layer rather than the atlas.
  const voiceTools = {
    note_to_builder({ note }) {
      trace?.note("feedback", { note });
      return { noted: Boolean(note) };
    },
  };
  const handlers = { ...voiceTools, ...atlas.tools };
  for (const tool of TOOLS) {
    if (typeof handlers[tool.name] !== "function") {
      console.warn(`[voice] no handler for declared tool "${tool.name}"`);
    }
  }

  const panel = createVoicePanel({
    onToggle: () => toggle(),
    onMicToggle: () => setMuted(!muted),
  });

  const narrator = createNarrator({
    read: atlas.read,
    share: (content) => {
      trace?.note("context", { content });
      return session.share(content);
    },
    onError: (error) => console.warn("[voice] context update dropped:", error.message),
  });

  const session = createLiveSession({
    endpoint,
    headers: key ? { "x-abacus-key": key } : {},
    run: async (name, args) => {
      const began = performance.now();
      trace?.note("tool.call", { name, args });
      const handler = handlers[name];
      if (!handler) return { error: `unknown tool: ${name}` };
      const result = await handler(args);
      trace?.note("tool.result", { name, ms: Math.round(performance.now() - began), result });
      if (MOVES_THE_VIEW.has(name)) narrator.nudge();
      return result;
    },
    onPresence: (presence) => {
      trace?.note("presence", presence);
      panel.show(presence);
    },
    onTranscript: ({ who, text, startMs, endMs }) => trace?.note("transcript", { who, text, start_ms: startMs, end_ms: endMs }),
    onAudio: (stream) => panel.play(stream),
    onError: (error) => {
      trace?.note("error", error);
      console.warn("[voice]", error.message);
    },
    onClosed: ({ seconds, reason, confirmed }) => {
      narrator.stop();
      panel.reset();
      muted = false;
      trace?.end({ reason, seconds, confirmed });
      trace = null;
      console.info(`[voice] session ended (${reason})`, confirmed ? `${seconds ?? "?"}s` : "usage unconfirmed");
    },
  });

  async function setMuted(next) {
    muted = next;
    panel.muted(muted);
    try {
      await (muted ? session.mute() : session.unmute());
    } catch (error) {
      // The command was refused; the local microphone gate still applies.
      console.warn("[voice] mute not acknowledged:", error.message);
    }
  }

  async function toggle() {
    if (busy) return;
    busy = true;
    // Before the first await: this must still be inside the tap.
    panel.unlock();
    try {
      if (session.live) {
        panel.say("Wrapping up");
        await session.close();
        return;
      }
      atlas.onOpen?.();
      trace = createTrace({ key, meta: { phone: innerWidth < 640 } });
      trace.note("session.open");
      await session.open();
      trace.live(session.id);
      narrator.start();
    } catch (error) {
      console.error("[voice]", error);
      trace?.end({ reason: "open-failed", error: error?.message });
      trace = null;
      panel.reset(failureLabel(error));
    } finally {
      busy = false;
    }
  }

  return {
    toggle,
    /** The visitor moved the map themselves; tell the guide where they are. */
    viewChanged: () => {
      trace?.note("view", atlas.read());
      narrator.nudge();
    },
  };
}
