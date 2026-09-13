// A GPT-Live session, reduced to the handful of things an application wants.
//
// Everything the protocol demands is hidden here: the HTTP handshake that
// starts the session, the wait for `session.started` before any command is
// legal, correlating acknowledgements back to the command that caused them,
// unwrapping delegated Responses events out of their envelope, collecting a
// response's function calls and submitting every result before continuing it,
// and the close handshake that has to stay connected long enough to hear the
// final usage.
//
// Callers see: open, close, mute, unmute, and three ways to put words in front
// of the model.
import { openVoiceChannel } from "./webrtc.js";
import { createPresence } from "./presence.js";

const START_TIMEOUT_MS = 15_000;
const ACK_TIMEOUT_MS = 10_000;
const CLOSE_TIMEOUT_MS = 15_000;

// Nested Responses lifecycle events that mean "this backend turn is over".
const RESPONSE_TERMINAL = new Set(["response.completed", "response.incomplete", "response.failed"]);

let counter = 0;
const nextEventId = (prefix) => `${prefix}_${(counter += 1)}_${Date.now().toString(36)}`;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * @param {object} options
 * @param {string} options.endpoint    Application route that mints the session.
 * @param {Record<string, string>} [options.headers]  Extra headers for that request (an access key, say).
 * @param {(name: string, args: object) => unknown | Promise<unknown>} options.run
 *        Executes one delegated tool call. Its return value is sent back verbatim as JSON.
 * @param {(presence: object) => void} [options.onPresence]
 * @param {(line: {who: "visitor"|"abacus", text: string, startMs: number, endMs: number}) => void} [options.onTranscript]
 * @param {(stream: MediaStream) => void} [options.onAudio]
 * @param {(error: {message: string, code?: string|null}) => void} [options.onError]
 * @param {(summary: {seconds: number|null, reason: string, confirmed: boolean}) => void} [options.onClosed]
 */
export function createLiveSession({ endpoint, headers = {}, run, onPresence, onTranscript, onAudio, onError, onClosed }) {
  const presence = createPresence((state) => onPresence?.(state));

  let channel = null;
  let sessionId = null;
  let started = null;
  let closing = null;
  let finished = false;
  let usageSeconds = null;

  /** event_id -> deferred, for commands waiting on an acknowledgement. */
  const awaitingAck = new Map();
  /** delegation_id -> { calls: Map<call_id, Promise<void>> } */
  const delegations = new Map();

  // -- sending -------------------------------------------------------------

  function send(event) {
    return channel?.send(event) ?? false;
  }

  // Commands are acknowledged asynchronously and can be rejected by an `error`
  // carrying the same client_event_id, so every one gets a correlation id.
  function command(event) {
    const eventId = nextEventId(event.type.replaceAll(".", "_"));
    const slot = deferred();
    const timer = setTimeout(() => {
      awaitingAck.delete(eventId);
      slot.reject(new Error(`${event.type} was never acknowledged`));
    }, ACK_TIMEOUT_MS);
    awaitingAck.set(eventId, {
      settle: (error) => {
        clearTimeout(timer);
        awaitingAck.delete(eventId);
        if (error) slot.reject(error);
        else slot.resolve();
      },
    });
    if (!send({ ...event, event_id: eventId })) {
      awaitingAck.get(eventId)?.settle(new Error(`${event.type} could not be sent`));
    }
    return slot.promise;
  }

  const appendContext = (type, content) => command({ type, delegation_id: null, content });

  // -- delegated work ------------------------------------------------------

  function delegationState(id) {
    let state = delegations.get(id);
    if (!state) {
      state = { calls: new Map() };
      delegations.set(id, state);
      presence.beganWork();
    }
    return state;
  }

  // A completed function call carries everything needed to act: an
  // arguments-done event on its own does not. Run it immediately so the atlas
  // moves while the guide is still talking, then submit its result.
  function executeCall(delegationId, item) {
    const state = delegationState(delegationId);
    if (state.calls.has(item.call_id)) return;

    const work = (async () => {
      let output;
      try {
        let args = {};
        try { args = JSON.parse(item.arguments || "{}"); } catch { args = {}; }
        output = await run(item.name, args);
      } catch (error) {
        output = { error: error instanceof Error ? error.message : String(error) };
      }
      send({
        type: "response.item.create",
        event_id: nextEventId("tool_result"),
        item: {
          type: "function_call_output",
          call_id: item.call_id,
          output: JSON.stringify(output ?? { ok: true }),
        },
      });
    })();

    state.calls.set(item.call_id, work);
  }

  // A terminal snapshot deliberately reports an empty output list, so the
  // pending calls collected above are the only record of what must be
  // answered before the backend may continue.
  async function finishDelegatedResponse(delegationId) {
    const state = delegations.get(delegationId);
    if (!state) return;

    if (state.calls.size === 0) {
      delegations.delete(delegationId);
      presence.endedWork();
      return;
    }

    const pending = [...state.calls.values()];
    state.calls.clear();
    await Promise.allSettled(pending);
    // Submitting results does not restart the backend; it has to be asked.
    send({ type: "response.create", event_id: nextEventId("continue") });
  }

  function unwrapDelegated(envelope) {
    const delegationId = envelope.delegation_id;
    const inner = envelope.event;
    if (!delegationId || !inner?.type) return;

    if (inner.type === "response.output_item.done" && inner.item?.type === "function_call") {
      executeCall(delegationId, inner.item);
      return;
    }
    if (RESPONSE_TERMINAL.has(inner.type)) {
      finishDelegatedResponse(delegationId);
    }
  }

  // -- receiving -----------------------------------------------------------

  function route(event) {
    if (event.client_event_id && awaitingAck.has(event.client_event_id) && event.type !== "error") {
      awaitingAck.get(event.client_event_id).settle(null);
    }

    switch (event.type) {
      case "session.started":
        sessionId = event.session?.id ?? null;
        presence.connection("live");
        started?.resolve();
        return;

      case "session.input_transcript.delta":
        presence.heard();
        onTranscript?.({ who: "visitor", text: event.delta, startMs: event.start_ms, endMs: event.end_ms });
        return;

      case "session.output_transcript.delta":
        presence.spoke();
        onTranscript?.({ who: "abacus", text: event.delta, startMs: event.start_ms, endMs: event.end_ms });
        return;

      case "session.delegation.created":
        if (event.delegation?.id) delegationState(event.delegation.id);
        return;

      case "response.event":
        unwrapDelegated(event);
        return;

      case "session.usage.updated":
        // Snapshots of cumulative seconds, not increments to add up.
        usageSeconds = event.usage?.seconds ?? usageSeconds;
        return;

      case "error": {
        const error = event.error || {};
        const waiting = error.client_event_id && awaitingAck.get(error.client_event_id);
        if (waiting) waiting.settle(new Error(error.message || "Command rejected"));
        // Moderation can cut off speech without ending the session, so an
        // error is reported but never assumed fatal.
        onError?.({ message: error.message || "Live session error", code: error.code ?? null });
        return;
      }

      case "session.closed":
        usageSeconds = event.usage?.seconds ?? usageSeconds;
        settle({ reason: event.reason || "closed", confirmed: true });
        return;

      default:
    }
  }

  // -- lifecycle -----------------------------------------------------------

  function settle(summary) {
    if (finished) return;
    finished = true;
    for (const slot of awaitingAck.values()) slot.settle(new Error("Session ended"));
    awaitingAck.clear();
    delegations.clear();
    presence.connection("idle");
    presence.dispose();
    channel?.stop();
    channel = null;
    const waiting = closing;
    closing = null;
    waiting?.resolve(summary);
    onClosed?.({ seconds: usageSeconds, ...summary });
  }

  async function exchange(offerSdp) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ sdp: offerSdp }),
    });
    const body = await response.text();
    if (!response.ok) {
      let message = body;
      try { message = JSON.parse(body).error || body; } catch {}
      throw new Error(message || `Session creation failed (${response.status})`);
    }
    const result = JSON.parse(body);
    const answer = result?.transport?.sdp;
    if (!answer) throw new Error("Session response carried no SDP answer");
    return answer;
  }

  return {
    get id() { return sessionId; },
    get live() { return Boolean(channel) && !finished; },

    async open() {
      if (channel) return;
      finished = false;
      usageSeconds = null;
      presence.connection("connecting");
      started = deferred();

      try {
        channel = await openVoiceChannel({
          exchange,
          onMessage: route,
          onRemoteStream: (stream) => onAudio?.(stream),
          // The transport dying before session.closed leaves final usage
          // unconfirmed; say so rather than reporting a clean finish.
          onClose: (reason) => settle({ reason, confirmed: false }),
        });

        await Promise.race([
          started.promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("The session never reported it had started")), START_TIMEOUT_MS)),
        ]);
      } catch (error) {
        presence.connection("error");
        channel?.stop();
        channel = null;
        throw error;
      }
    },

    /** Resolves once final usage arrives, or once waiting for it stops being worth it. */
    async close() {
      if (!channel || finished) {
        settle({ reason: "not-started", confirmed: false });
        return;
      }
      presence.connection("closing");
      closing = deferred();
      // Stay connected: hanging up here loses the final event.
      send({ type: "session.close", event_id: nextEventId("close") });
      const finalized = closing.promise;
      const timer = setTimeout(() => settle({ reason: "finalization-timeout", confirmed: false }), CLOSE_TIMEOUT_MS);
      await finalized;
      clearTimeout(timer);
    },

    // Stops capture locally *and* tells the session, so nothing is sent and
    // nothing is inferred from what was already in flight.
    async mute() {
      channel?.setMicEnabled(false);
      await command({ type: "session.input_audio.mute" });
    },
    async unmute() {
      channel?.setMicEnabled(true);
      await command({ type: "session.input_audio.unmute" });
    },

    /** Facts the guide may use but should not read out. */
    share: (content) => appendContext("session.thinking.append", content),
    /** Something the guide should say, in its own words. */
    announce: (content) => appendContext("session.commentary.append", content),
    /** Application-authored direction for how the guide should behave. */
    instruct: (content) => appendContext("session.instructions.append", content),
  };
}
