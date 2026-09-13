// Fragments into phrases.
//
// GPT-Live sends transcript deltas as they are recognised: a word or two at
// a time, per speaker, with session-timeline stamps. A phrase is what the
// embedder can make sense of, so fragments from one speaker are joined until
// a pause, a sentence end, or enough words, and only then handed on.
//
// Timestamps are session-clock, not wall-clock: a gap is measured on that
// clock, and a wall-clock timer flushes what a silence leaves behind.

const GAP_MS = 900;
const MAX_WORDS = 18;
const MIN_WORDS = 2;
const IDLE_FLUSH_MS = 1400;
const SENTENCE_END = /[.!?…]\s*$/;

/**
 * @param {(phrase: {who: string, text: string, startMs: number, endMs: number}) => void} emit
 */
export function createPhrases(emit) {
  /** who -> { text, startMs, endMs } */
  const open = new Map();
  const timers = new Map();

  function flush(who) {
    clearTimeout(timers.get(who));
    timers.delete(who);
    const phrase = open.get(who);
    open.delete(who);
    if (!phrase) return;
    const text = phrase.text.replace(/\s+/g, " ").trim();
    if (text.split(" ").filter(Boolean).length < MIN_WORDS) return;
    emit({ who, text, startMs: phrase.startMs, endMs: phrase.endMs });
  }

  return {
    add({ who, text, startMs, endMs }) {
      if (!text) return;
      const current = open.get(who);
      if (current && startMs - current.endMs > GAP_MS) flush(who);
      const phrase = open.get(who) || { text: "", startMs, endMs };
      phrase.text += text;
      phrase.endMs = Math.max(phrase.endMs, endMs ?? startMs);
      open.set(who, phrase);

      const words = phrase.text.trim().split(/\s+/).length;
      if (words >= MAX_WORDS || (SENTENCE_END.test(phrase.text) && words >= MIN_WORDS + 1)) {
        flush(who);
        return;
      }
      clearTimeout(timers.get(who));
      timers.set(who, setTimeout(() => flush(who), IDLE_FLUSH_MS));
    },
    flushAll() {
      for (const who of [...open.keys()]) flush(who);
    },
  };
}
