// The physics, declared.
//
// Every number that shapes how the territory moves lives here as a base value
// with a live multiplier, instead of as a constant buried in the module that
// uses it. A knob is a multiplier over the base, so "×3" means the same thing
// on every slider, and a whole tuning is a short JSON of multipliers that can
// be saved, sent in a link, or written into a session trace.

export const SCHEMA = [
  // Ink through the cracks (web/seep.js)
  { key: "inkBudget", group: "Ink", label: "Reach", hint: "cells of ink per unit of field", base: 480, max: 6 },
  { key: "inkDrift", group: "Ink", label: "Flow toward ideas", base: 0.7, max: 4 },
  { key: "inkBase", group: "Ink", label: "Spread (vein fatness)", base: 0.12, max: 4 },
  { key: "inkSubsteps", group: "Ink", label: "Speed (passes per frame)", base: 2, max: 3, integer: true },
  { key: "inkRetreat", group: "Ink", label: "Retreat when quiet", base: 0.35, max: 4 },
  { key: "inkThreshold", group: "Ink", label: "Surface threshold", base: 0.3, min: 0.4, max: 2 },
  { key: "inkShrink", group: "Ink", label: "Channel width (cell shrink)", base: 0.94, min: 0.9, max: 1.05, step: 0.005 },
  { key: "inkReach", group: "Ink", label: "Attraction range", base: 700, min: 0.3, max: 3 },
  // Magnetism between ideas and the guide (web/app.js)
  { key: "magnetPull", group: "Magnetism", label: "Pull between alive ideas", base: 0.00024, max: 6 },
  { key: "magnetCap", group: "Magnetism", label: "Pull cap", base: 0.05, max: 6 },
  { key: "magnetRest", group: "Magnetism", label: "Rest distance", base: 1.2, min: 0.7, max: 1.6, step: 0.02 },
  { key: "guideLean", group: "Magnetism", label: "Cell follows its ink", base: 0.0006, max: 6 },
  // The salience field (web/salience.js)
  { key: "fieldHalfLife", group: "Field", label: "Memory (half-life)", hint: "22 s at ×1", base: 22_000, min: 0.2, max: 4 },
  { key: "fieldEase", group: "Field", label: "Warm-up speed", base: 0.07, max: 4 },
  // The live wave (web/wave/wave.js)
  { key: "waveVisitor", group: "Wave", label: "Your words", base: 0.55, max: 4 },
  { key: "waveAbacus", group: "Wave", label: "Abacus's words", base: 0.3, min: 0, max: 4 },
  { key: "waveFloor", group: "Wave", label: "Similarity floor", base: 0.2, min: 0.5, max: 1.75 },
  // Camera (web/app.js)
  { key: "cameraFollow", group: "Camera", label: "Drift toward the conversation", base: 0.018, min: 0, max: 5 },
];

export const PRESETS = {
  default: {},
  // "About three times stronger": every force-like knob, together.
  forces3: { inkBudget: 3, inkDrift: 2, magnetPull: 3, magnetCap: 3, guideLean: 3, cameraFollow: 2 },
};

const STORAGE_KEY = "abacus-tune";

export function createPhysics({ storage = globalThis.localStorage, search = globalThis.location?.search } = {}) {
  const byKey = new Map(SCHEMA.map((entry) => [entry.key, entry]));
  const multipliers = {};
  const listeners = new Set();

  function apply(patch, { silent = false } = {}) {
    for (const [key, mul] of Object.entries(patch || {})) {
      if (!byKey.has(key) || !Number.isFinite(mul)) continue;
      multipliers[key] = mul;
    }
    if (!silent) notify(Object.keys(patch || {}));
  }

  function notify(keys) {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(multipliers)); } catch {}
    for (const fn of listeners) fn(keys, physics);
  }

  const physics = {
    /** The live value: base × multiplier (rounded when the knob is an integer). */
    value(key) {
      const entry = byKey.get(key);
      if (!entry) throw new Error(`unknown physics knob: ${key}`);
      const v = entry.base * (multipliers[key] ?? 1);
      return entry.integer ? Math.max(1, Math.round(v)) : v;
    },
    mul: (key) => multipliers[key] ?? 1,
    set(key, mul) { apply({ [key]: mul }); },
    preset(name) {
      for (const key of Object.keys(multipliers)) delete multipliers[key];
      apply(PRESETS[name] || {});
    },
    /** Only the knobs that differ from ×1. */
    toJSON: () => Object.fromEntries(Object.entries(multipliers).filter(([, m]) => m !== 1)),
    fromJSON(json) { apply(typeof json === "string" ? JSON.parse(json) : json); },
    /** A link that carries this tuning. */
    link(origin = globalThis.location?.origin || "") {
      return `${origin}/?tune=${encodeURIComponent(JSON.stringify(physics.toJSON()))}`;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    schema: SCHEMA,
  };

  // Restore: a link wins over what this browser remembered.
  try { apply(JSON.parse(storage?.getItem(STORAGE_KEY) || "{}"), { silent: true }); } catch {}
  try {
    const carried = new URLSearchParams(search || "").get("tune");
    if (carried) apply(JSON.parse(carried), { silent: true });
  } catch {}

  return physics;
}
