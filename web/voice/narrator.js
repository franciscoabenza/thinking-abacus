// Telling the guide what the visitor is looking at.
//
// The old `get_view_state` tool made Abacus ask before it could refer to
// anything on screen — a round trip through the backend just to learn where
// the visitor already was. GPT-Live lets the application push context instead,
// so the guide simply knows, and "that one" resolves without a tool call.
//
// What is hidden here: deciding when a change is worth a sentence, saying it
// in a way that survives a correction, not repeating itself, and staying well
// under the per-append budget.

const SETTLE_MS = 700;
// The API allows 500 tokens per append; this stays comfortably beneath it.
const MAX_CHARACTERS = 1100;

function sentenceFor(view, previous) {
  const lines = [];

  if (view.focus) {
    const moved = previous?.focus && previous.focus.name !== view.focus.name;
    const opening = moved
      ? `The visitor has moved to "${view.focus.name}"; before that they were on "${previous.focus.name}".`
      : `The visitor is looking at "${view.focus.name}" (${view.focus.kind}), from ${view.focus.source}.`;
    lines.push(opening);
    if (view.focus.question) lines.push(`That thought asks: ${view.focus.question}`);
  } else if (previous?.focus) {
    lines.push("The visitor has closed that thought and is back on the open map.");
  } else {
    lines.push("The visitor is on the open map with nothing opened yet.");
  }

  const alive = (view.alive || []).filter((name) => name !== view.focus?.name);
  if (alive.length) {
    lines.push(`Alive in the conversation right now: ${alive.join(", ")}.`);
  }
  if (view.visible.length) {
    lines.push(`Also on screen: ${view.visible.slice(0, 8).join(", ")}.`);
  }
  if (view.trail.length > 1) {
    lines.push(`Their trail so far: ${view.trail.slice(-5).join(" → ")}.`);
  }

  return lines.join(" ").slice(0, MAX_CHARACTERS);
}

/**
 * @param {object} options
 * @param {() => {focus: object|null, visible: string[], trail: string[], alive?: string[]}} options.read  The atlas, right now.
 * @param {(content: string) => Promise<void>} options.share                             Quiet context channel.
 * @param {(error: Error) => void} [options.onError]
 */
export function createNarrator({ read, share, onError }) {
  let timer = null;
  let running = false;
  let previous = null;
  let lastSent = "";

  async function speakUp() {
    timer = null;
    if (!running) return;
    const view = read();
    const line = sentenceFor(view, previous);
    // Unchanged views are not worth the model's context.
    if (line === lastSent) return;
    previous = view;
    lastSent = line;
    try {
      await share(line);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return {
    /** Sends the opening context straight away, then follows changes. */
    start() {
      running = true;
      previous = null;
      lastSent = "";
      speakUp();
    },
    // Rapid changes — a drag across the field, a burst of search — collapse
    // into one sentence about where things ended up.
    nudge() {
      if (!running) return;
      clearTimeout(timer);
      timer = setTimeout(speakUp, SETTLE_MS);
    },
    stop() {
      running = false;
      clearTimeout(timer);
      timer = null;
    },
  };
}
