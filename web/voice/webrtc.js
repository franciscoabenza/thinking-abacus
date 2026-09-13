// The browser half of a GPT-Live WebRTC call.
//
// Everything fiddly about getting audio flowing lives here: microphone
// capture, the peer connection, creating the event channel *before* the offer,
// waiting out ICE gathering, and trading SDP. Callers hand in an `exchange`
// function and get back something that can send JSON, mute a microphone, and
// hang up.

const ICE_TIMEOUT_MS = 10_000;

// A local SDP offer is only complete once candidates stop arriving. Sending it
// early produces a call that negotiates but never carries audio.
function whenIceGathered(peer) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", check);
      reject(new Error("Timed out gathering ICE candidates"));
    }, ICE_TIMEOUT_MS);
    function check() {
      if (peer.iceGatheringState !== "complete") return;
      clearTimeout(timer);
      peer.removeEventListener("icegatheringstatechange", check);
      resolve();
    }
    peer.addEventListener("icegatheringstatechange", check);
    check();
  });
}

/**
 * Open a voice channel.
 *
 * @param {object} options
 * @param {(offerSdp: string) => Promise<string>} options.exchange  Offer in, answer out.
 * @param {(event: object) => void} options.onMessage               One parsed JSON event from the channel.
 * @param {(reason: string) => void} options.onClose                The transport went away; fires at most once.
 * @param {(stream: MediaStream) => void} options.onRemoteStream    Generated speech to play.
 * @param {string} [options.label]                                  Data channel label.
 * @returns {Promise<{ send(event: object): boolean, setMicEnabled(on: boolean): void, stop(): void }>}
 */
export async function openVoiceChannel({ exchange, onMessage, onClose, onRemoteStream, label = "oai-events" }) {
  const peer = new RTCPeerConnection();
  let microphone = null;
  let closed = false;

  const teardown = (reason) => {
    if (closed) return;
    closed = true;
    microphone?.getTracks().forEach((track) => track.stop());
    try { channel.close(); } catch {}
    try { peer.close(); } catch {}
    onClose?.(reason);
  };

  // The channel must exist before the offer, or it is not in the negotiation.
  const channel = peer.createDataChannel(label);
  channel.addEventListener("message", ({ data }) => {
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    onMessage(event);
  });
  channel.addEventListener("close", () => teardown("channel-closed"));

  peer.addEventListener("track", (event) => {
    onRemoteStream?.(new MediaStream([event.track]));
  });
  peer.addEventListener("connectionstatechange", () => {
    if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
      teardown(peer.connectionState);
    }
  });

  try {
    microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of microphone.getAudioTracks()) peer.addTrack(track, microphone);

    await peer.setLocalDescription(await peer.createOffer());
    await whenIceGathered(peer);
    const offerSdp = peer.localDescription?.sdp;
    if (!offerSdp) throw new Error("Missing local SDP offer");

    const answerSdp = await exchange(offerSdp);
    await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
  } catch (error) {
    teardown("failed-to-open");
    throw error;
  }

  return {
    // Returns false when the channel is not open, so callers can decide
    // whether a dropped command matters.
    send(event) {
      if (channel.readyState !== "open") return false;
      channel.send(JSON.stringify(event));
      return true;
    },
    // Local gate on capture. The session-level mute is a separate command:
    // this one also stops the audio ever leaving the machine.
    setMicEnabled(on) {
      microphone?.getAudioTracks().forEach((track) => { track.enabled = on; });
    },
    stop() {
      teardown("stopped");
    },
  };
}
