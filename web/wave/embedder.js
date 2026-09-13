// Text in, unit vectors out; the worker, the queue, and the failure mode hidden.
//
// If the model cannot load (no WASM, offline, a blocked CDN) `ready` resolves
// false and `embed` rejects; the wave then simply never rises, and everything
// else about the atlas is untouched.

export function createEmbedder() {
  const worker = new Worker(new URL("./embedder.worker.js", import.meta.url), { type: "module" });
  const pending = new Map();
  let nextId = 1;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  let state = "loading";

  worker.onmessage = ({ data }) => {
    if (data.type === "ready") {
      state = "ready";
      resolveReady({ ok: true, model: data.model, ms: data.ms });
      return;
    }
    if (data.type === "failed") {
      state = "failed";
      resolveReady({ ok: false, message: data.message });
      for (const job of pending.values()) job.reject(new Error(data.message));
      pending.clear();
      return;
    }
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    if (data.error) job.reject(new Error(data.error));
    else job.resolve(data.vectors);
  };
  worker.onerror = (event) => {
    if (state === "loading") {
      state = "failed";
      resolveReady({ ok: false, message: event.message || "embedding worker failed" });
    }
  };

  return {
    /** Resolves { ok, model, ms } or { ok: false, message }. Never rejects. */
    ready,
    get state() { return state; },
    /** @returns {Promise<Float32Array[]>} unit vectors, one per text */
    embed(texts) {
      if (state === "failed") return Promise.reject(new Error("embedder unavailable"));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, texts });
      });
    },
  };
}
