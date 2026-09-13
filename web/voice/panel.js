// The voice controls, and the vocabulary they speak in.
//
// Element ids, the audio sink, and the words used for each state live here and
// nowhere else. The rest of the voice layer talks in presence, not in DOM.

const RESTING_LABEL = "Talk to Abacus";
// A zero-sample WAV: enough for a tap to count as "the user started playback".
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

// Full duplex makes "both at once" a real state rather than an impossible one,
// so the label admits it instead of picking a winner.
function labelFor(presence) {
  switch (presence.connection) {
    case "connecting": return "Connecting";
    case "closing": return "Wrapping up";
    case "error": return "Voice error";
    case "live": break;
    default: return RESTING_LABEL;
  }
  if (presence.hearing && presence.speaking) return "Talking over each other";
  if (presence.hearing) return "Listening";
  if (presence.speaking) return "Abacus is speaking";
  if (presence.working) return "Following the thought";
  return "Abacus is live";
}

export function createVoicePanel({ onToggle, onMicToggle }) {
  const button = document.getElementById("voice-button");
  const label = document.getElementById("voice-label");
  const mic = document.getElementById("mic-toggle");
  const sink = document.getElementById("remote-audio");

  button.addEventListener("click", () => onToggle());
  mic.addEventListener("click", () => onMicToggle());

  function write(text) {
    label.textContent = text;
  }

  return {
    show(presence) {
      const live = presence.connection === "live";
      button.classList.toggle("live", live);
      button.disabled = presence.connection === "connecting";
      mic.hidden = !live;
      // Presentation hooks for the two things that can now happen at once.
      button.dataset.hearing = String(Boolean(presence.hearing));
      button.dataset.speaking = String(Boolean(presence.speaking));
      button.dataset.working = String(Boolean(presence.working));
      write(labelFor(presence));
    },

    /**
     * iOS only lets an element play if playback began inside a tap. The
     * remote stream arrives later, asynchronously, so start *something* now
     * and let the stream take over the same element when it lands.
     */
    unlock() {
      if (sink.srcObject) return;
      sink.src = SILENCE;
      sink.play?.().catch(() => {});
    },

    /** Overrides the presence label until the next state change. */
    say(text) {
      write(text);
    },

    muted(isMuted) {
      mic.textContent = isMuted ? "Unmute" : "Mute";
      mic.classList.toggle("muted", isMuted);
    },

    play(stream) {
      sink.srcObject = stream;
      sink.play?.().catch(() => write("Tap play to hear Abacus"));
    },

    reset(text = RESTING_LABEL) {
      button.classList.remove("live");
      button.disabled = false;
      delete button.dataset.hearing;
      delete button.dataset.speaking;
      delete button.dataset.working;
      mic.hidden = true;
      mic.textContent = "Mute";
      mic.classList.remove("muted");
      sink.srcObject = null;
      write(text);
    },
  };
}
