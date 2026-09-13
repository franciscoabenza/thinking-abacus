// The live wave: what is being said becomes a field over the territory.
//
// Each phrase from the conversation is embedded and compared with every
// thought. Thoughts it resembles receive energy, added to their salience —
// so a mention lingers, repetition builds, and silence lets it fade. That
// leaky integrator is the whole "physics"; the salience field is the charge.
//
// Hidden here: turning cosine similarity (mostly noise between 0.05 and 0.3
// for a small model) into a sharp relevance, spreading a phrase's energy over
// only its best few matches, weighting the visitor above the guide, and
// keeping thought vectors current as new thoughts are grown.

import { createEmbedder } from "./embedder.js";
import { createPhrases } from "./phrases.js";

const RELEVANCE = { floor: 0.2, ceil: 0.55, power: 1.6 };
const TOP_K = 4;
const GAIN = { visitor: 0.55, abacus: 0.3 };

function relevanceOf(similarity) {
  const t = (similarity - RELEVANCE.floor) / (RELEVANCE.ceil - RELEVANCE.floor);
  return t <= 0 ? 0 : Math.min(1, t) ** RELEVANCE.power;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * @param {object} options
 * @param {(index: number, amount: number) => void} options.energize  Adds charge to a thought.
 * @param {(index: number) => string} options.textOf                  What a thought is about, for embedding.
 * @param {(index: number) => boolean} [options.skip]                 Thoughts the wave should ignore (the guide).
 * @param {(hit: object) => void} [options.onPhrase]                  Every phrase and where its energy went.
 */
export function createWave({ energize, textOf, skip = () => false, onPhrase }) {
  const embedder = createEmbedder();
  /** index -> unit vector */
  const vectors = new Map();
  let indexing = Promise.resolve();

  const phrases = createPhrases((phrase) => understand(phrase));

  async function index(indices) {
    const todo = indices.filter((i) => !skip(i) && !vectors.has(i));
    if (!todo.length) return;
    const wait = indexing.then(async () => {
      const got = await embedder.embed(todo.map(textOf));
      todo.forEach((i, k) => vectors.set(i, got[k]));
    }).catch(() => {});
    indexing = wait;
    await wait;
  }

  async function understand(phrase) {
    let vector;
    try {
      [vector] = await embedder.embed([phrase.text]);
    } catch {
      return;
    }
    await indexing;
    const scored = [];
    for (const [i, v] of vectors) {
      const similarity = dot(vector, v);
      const relevance = relevanceOf(similarity);
      if (relevance > 0) scored.push({ index: i, similarity, relevance });
    }
    scored.sort((a, b) => b.relevance - a.relevance);
    const hits = scored.slice(0, TOP_K);
    // Energy is shared: the phrase can only say so much, and a chorus of
    // near-matches must not all light up equally.
    const total = hits.reduce((s, h) => s + h.relevance, 0) || 1;
    const gain = GAIN[phrase.who] ?? GAIN.abacus;
    for (const hit of hits) {
      hit.energy = gain * hit.relevance * (0.6 + 0.4 * (hit.relevance / total));
      energize(hit.index, hit.energy);
    }
    onPhrase?.({ ...phrase, hits });
  }

  return {
    ready: embedder.ready,
    get state() { return embedder.state; },
    /** Make thoughts known to the wave; safe to call again with new ones. */
    index,
    /** A transcript fragment from the session. */
    hear(fragment) { phrases.add(fragment); },
    /** Typed or debugging input: a whole phrase at once. */
    say(text, who = "visitor") { understand({ who, text, startMs: 0, endMs: 0 }); },
    quiet() { phrases.flushAll(); },
  };
}
