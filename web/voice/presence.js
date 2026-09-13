// Who is talking, right now.
//
// GPT-Live is full duplex: the guide can listen while it speaks, and there is
// no event marking the end of either. So presence cannot be read off a single
// event — it is inferred from the *arrival* of transcript fragments and decays
// when they stop. That inference, and its timers, is all this module is.
//
// Fragment timestamps (start_ms/end_ms) sit on the session timeline, not the
// wall clock, so they cannot drive the decay; a plain quiet-gap timer can.

const QUIET_GAP_MS = 900;

/**
 * @param {(presence: {connection: string, hearing: boolean, speaking: boolean, working: boolean}) => void} onChange
 *        Called only when the reported state actually differs.
 */
export function createPresence(onChange, { quietGapMs = QUIET_GAP_MS } = {}) {
  let connection = "idle";
  let inFlight = 0;
  let reported = null;
  const quiet = { hearing: null, speaking: null };
  const active = { hearing: false, speaking: false };

  function publish() {
    const next = { connection, hearing: active.hearing, speaking: active.speaking, working: inFlight > 0 };
    if (
      reported &&
      reported.connection === next.connection &&
      reported.hearing === next.hearing &&
      reported.speaking === next.speaking &&
      reported.working === next.working
    ) {
      return;
    }
    reported = next;
    onChange(next);
  }

  function stir(channel) {
    active[channel] = true;
    clearTimeout(quiet[channel]);
    quiet[channel] = setTimeout(() => {
      active[channel] = false;
      publish();
    }, quietGapMs);
    publish();
  }

  return {
    /** "idle" | "connecting" | "live" | "closing" | "error" */
    connection(state) {
      connection = state;
      if (state !== "live") {
        clearTimeout(quiet.hearing);
        clearTimeout(quiet.speaking);
        active.hearing = false;
        active.speaking = false;
        if (state !== "closing") inFlight = 0;
      }
      publish();
    },
    heard() { stir("hearing"); },
    spoke() { stir("speaking"); },
    // Delegated work is counted, not flagged: a correction can start a second
    // task while the first is still running.
    beganWork() { inFlight += 1; publish(); },
    endedWork() { inFlight = Math.max(0, inFlight - 1); publish(); },
    dispose() {
      clearTimeout(quiet.hearing);
      clearTimeout(quiet.speaking);
    },
  };
}
