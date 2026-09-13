// How alive each thought is, right now.
//
// Selection used to be one integer: the focused cell. Conversation does not
// work like that — a theme warms several thoughts at once, a mention lingers,
// silence lets it fade. This field holds a value in [0, 1] per thought, eases
// it toward a target, and lets targets decay with a half-life unless pinned.
// Everything that draws or narrates reads from here; nothing else decides
// what "selected" means.
//
// Phase 2 will feed this from the transcript itself. The interface stays.

// `ease` is the fraction of the remaining distance covered per 16.7 ms, so a
// slow phone and a fast laptop warm a thought over the same wall-clock time.
const DEFAULTS = { ease: 0.07, halfLifeMs: 22_000, floor: 0.01, unpinnedTo: 0.55 };

export function createSalience(options = {}) {
  let { ease, halfLifeMs, floor, unpinnedTo } = { ...DEFAULTS, ...options };
  /** index -> current eased value */
  const value = new Map();
  /** index -> where the value is heading */
  const target = new Map();
  let pinned = -1;
  let last = null;

  return {
    /** The one thought the visitor is reading. Stays at 1 until replaced. */
    pin(index) {
      if (pinned >= 0 && pinned !== index) target.set(pinned, unpinnedTo);
      pinned = index;
      target.set(index, 1);
    },
    unpin() {
      if (pinned >= 0) target.set(pinned, unpinnedTo);
      pinned = -1;
    },
    /** Warm a thought without making it the subject. Never lowers it. */
    raise(index, amount = 0.7) {
      target.set(index, Math.max(target.get(index) ?? 0, Math.min(1, amount)));
    },
    /**
     * Add charge. Repeated mentions build; the half-life lets them fade.
     * This is the wave's way in — a leaky integrator, not a switch.
     */
    energize(index, amount) {
      if (index === pinned || !(amount > 0)) return;
      target.set(index, Math.min(1, (target.get(index) ?? 0) + amount));
    },
    /** Weighted centre of everything alive, or null when nothing is. */
    centroid(positionOf, min = 0.2) {
      let x = 0, y = 0, w = 0;
      for (const [index, v] of value) {
        if (v < min) continue;
        const p = positionOf(index);
        if (!p) continue;
        x += p[0] * v; y += p[1] * v; w += v;
      }
      return w > 0 ? { x: x / w, y: y / w, weight: w } : null;
    },
    clear() {
      target.clear();
      pinned = -1;
    },
    of(index) {
      return value.get(index) ?? 0;
    },
    get pinned() {
      return pinned;
    },
    /** Most alive first; the pinned thought included. */
    top(n = 6, min = 0.2) {
      return [...value.entries()]
        .filter(([, v]) => v >= min)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([index, v]) => ({ index, value: v }));
    },
    /** Retune the dynamics live. */
    configure(patch = {}) {
      if (Number.isFinite(patch.ease)) ease = patch.ease;
      if (Number.isFinite(patch.halfLifeMs)) halfLifeMs = patch.halfLifeMs;
    },
    /** Call once per frame. Decay is wall-clock, so a paused tab does not freeze it. */
    tick(now = performance.now()) {
      const dt = last === null ? 0 : Math.min(now - last, 250);
      last = now;
      const decay = 0.5 ** (dt / halfLifeMs);
      const k = 1 - (1 - ease) ** (dt / 16.67);
      for (const [index, t] of target) {
        if (index === pinned) continue;
        const next = t * decay;
        if (next < floor) target.delete(index);
        else target.set(index, next);
      }
      for (const index of new Set([...value.keys(), ...target.keys()])) {
        const v = value.get(index) ?? 0;
        const t = target.get(index) ?? 0;
        const next = v + (t - v) * k;
        if (next < floor && t === 0) value.delete(index);
        else value.set(index, next);
      }
    },
  };
}
