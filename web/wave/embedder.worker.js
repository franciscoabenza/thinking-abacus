// Runs the embedding model off the main thread, so the atlas keeps drawing
// at full rate while a phrase is being understood.
//
// Messages in:  { id, texts: string[] }          -> { id, vectors: Float32Array[], dim }
//               { id, texts } before ready       -> queued until the model loads
// Messages out: { type: "ready", model, ms } | { type: "failed", message } | { id, vectors, dim } | { id, error }

const MODEL = "Xenova/all-MiniLM-L6-v2";
const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2";

let embed = null;
const queue = [];

async function load() {
  const began = performance.now();
  const { pipeline, env } = await import(LIB);
  env.allowLocalModels = false;
  embed = await pipeline("feature-extraction", MODEL, { device: "wasm", dtype: "q8" });
  postMessage({ type: "ready", model: MODEL, ms: Math.round(performance.now() - began) });
  for (const job of queue.splice(0)) run(job);
}

async function run({ id, texts }) {
  try {
    const output = await embed(texts, { pooling: "mean", normalize: true });
    const dim = output.dims.at(-1);
    const flat = output.data;
    const vectors = texts.map((_, i) => flat.slice(i * dim, (i + 1) * dim));
    postMessage({ id, vectors, dim }, vectors.map((v) => v.buffer));
  } catch (error) {
    postMessage({ id, error: error?.message || String(error) });
  }
}

onmessage = ({ data }) => {
  if (!data?.texts) return;
  if (embed) run(data);
  else queue.push(data);
};

load().catch((error) => postMessage({ type: "failed", message: error?.message || String(error) }));
