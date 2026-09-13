// Knobs for the physics.
//
// A small panel of sliders over web/physics.js: one per declared knob, grouped,
// each a multiplier of its base value. Presets, reset, and a link that carries
// the tuning so the numbers that felt right can be sent on. Shown only when the
// page is opened with ?tune or ?debug.

const GROUP_ORDER = ["Ink", "Magnetism", "Field", "Wave", "Camera"];

function fmt(v) {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1000) return String(Math.round(v));
  if (a >= 10) return v.toFixed(1);
  if (a >= 0.1) return v.toFixed(2);
  return v.toPrecision(2);
}

export function createTunePanel(physics, { onChange } = {}) {
  const root = document.createElement("aside");
  root.id = "tune";
  root.innerHTML = `
    <button type="button" class="tune-toggle" aria-expanded="false">⚙ tune</button>
    <div class="tune-body" hidden>
      <div class="tune-head">
        <span class="kicker">PHYSICS · MULTIPLIERS</span>
        <div class="tune-actions">
          <button type="button" data-preset="forces3">×3 forces</button>
          <button type="button" data-preset="default">reset</button>
          <button type="button" data-copy>copy link</button>
        </div>
      </div>
      <div class="tune-groups"></div>
      <input class="tune-link" readonly aria-label="Link carrying this tuning" />
    </div>`;
  const body = root.querySelector(".tune-body");
  const groups = root.querySelector(".tune-groups");
  const link = root.querySelector(".tune-link");
  const rows = new Map();

  for (const group of GROUP_ORDER) {
    const entries = physics.schema.filter((e) => e.group === group);
    if (!entries.length) continue;
    const section = document.createElement("section");
    section.innerHTML = `<h3>${group}</h3>`;
    for (const entry of entries) {
      const row = document.createElement("label");
      row.className = "tune-row";
      row.innerHTML = `
        <span class="tune-label">${entry.label}${entry.hint ? ` <i>${entry.hint}</i>` : ""}</span>
        <input type="range" min="${entry.min ?? 0}" max="${entry.max ?? 4}" step="${entry.step ?? 0.05}" />
        <output></output>`;
      const range = row.querySelector("input");
      const out = row.querySelector("output");
      range.addEventListener("input", () => physics.set(entry.key, Number(range.value)));
      rows.set(entry.key, { range, out, entry });
      section.append(row);
    }
    groups.append(section);
  }

  function render() {
    for (const [key, { range, out }] of rows) {
      const mul = physics.mul(key);
      range.value = String(mul);
      out.textContent = `×${mul.toFixed(2)} → ${fmt(physics.value(key))}`;
    }
    link.value = physics.link();
  }

  physics.onChange((keys) => {
    render();
    for (const key of keys) onChange?.({ key, mul: physics.mul(key), value: physics.value(key) });
  });

  root.querySelector(".tune-toggle").addEventListener("click", (event) => {
    body.hidden = !body.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!body.hidden));
  });
  for (const button of root.querySelectorAll("[data-preset]")) {
    button.addEventListener("click", () => physics.preset(button.dataset.preset));
  }
  root.querySelector("[data-copy]").addEventListener("click", async (event) => {
    const url = physics.link();
    try { await navigator.clipboard.writeText(url); event.currentTarget.textContent = "copied"; }
    catch { link.select(); event.currentTarget.textContent = "select & copy"; }
    setTimeout(() => { event.currentTarget.textContent = "copy link"; }, 1600);
  });

  render();
  document.body.append(root);
  return { root, render };
}
