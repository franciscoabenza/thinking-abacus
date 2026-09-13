#!/usr/bin/env node
// Replay a voice session trace as a readable timeline.
//
//   npm run trace                 latest session
//   npm run trace -- --list       every recorded session
//   npm run trace -- --feedback   only what visitors said should change
//   npm run trace -- <file.jsonl>
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("../traces/", import.meta.url).pathname;
const JOIN_GAP_MS = 1500;

async function traceFiles() {
  const files = [];
  let days = [];
  try { days = await readdir(ROOT); } catch { return files; }
  for (const day of days.sort()) {
    let names = [];
    try { names = await readdir(join(ROOT, day)); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const path = join(ROOT, day, name);
      files.push({ path, day, mtime: (await stat(path)).mtimeMs });
    }
  }
  return files.sort((a, b) => a.mtime - b.mtime);
}

async function readLines(path) {
  const text = await readFile(path, "utf8");
  return text.split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

const clock = (t) => {
  const s = Math.max(0, Math.round(t / 100) / 10);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

function summarize(lines) {
  const words = (who) => lines.filter((l) => l.kind === "transcript" && l.who === who).map((l) => l.text).join("").trim().split(/\s+/).filter(Boolean).length;
  const last = lines.at(-1)?.t ?? 0;
  return {
    duration: last,
    visitorWords: words("visitor"),
    abacusWords: words("abacus"),
    tools: lines.filter((l) => l.kind === "tool.call").length,
    feedback: lines.filter((l) => l.kind === "feedback").length,
    errors: lines.filter((l) => l.kind === "error").length,
    live: lines.find((l) => l.kind === "session.live")?.live ?? lines.find((l) => l.kind === "trace.server")?.live ?? null,
    address: lines.find((l) => l.kind === "trace.server")?.address ?? null,
    device: lines.find((l) => l.kind === "trace.open"),
    end: lines.find((l) => l.kind === "trace.end"),
  };
}

// Consecutive fragments from one speaker, close in time, read as one line.
function timeline(lines) {
  const out = [];
  let open = null;
  const closeSpeech = () => { if (open) { out.push(open); open = null; } };
  for (const line of lines) {
    if (line.kind === "transcript") {
      if (open && open.who === line.who && line.t - open.last < JOIN_GAP_MS) {
        open.text += line.text;
        open.last = line.t;
        continue;
      }
      closeSpeech();
      open = { kind: "speech", t: line.t, last: line.t, who: line.who, text: line.text };
      continue;
    }
    closeSpeech();
    if (line.kind === "trace.server") continue; // no session clock; shown in the header
    out.push(line);
  }
  closeSpeech();
  return out.sort((a, b) => a.t - b.t);
}

function render(entry) {
  const at = clock(entry.t);
  switch (entry.kind) {
    case "speech": return `${at}  ${entry.who === "visitor" ? "VISITOR" : "ABACUS "}  ${entry.text.trim()}`;
    case "tool.call": return `${at}  → ${entry.name} ${JSON.stringify(entry.args)}`;
    case "tool.result": return `${at}  ← ${entry.name} (${entry.ms} ms) ${JSON.stringify(entry.result).slice(0, 160)}`;
    case "context": return `${at}  (context) ${entry.content}`;
    case "feedback": return `${at}  !! FEEDBACK  ${entry.note}`;
    case "presence": return `${at}  ~ ${entry.connection}${entry.hearing ? " hearing" : ""}${entry.speaking ? " speaking" : ""}${entry.working ? " working" : ""}`;
    case "view": return `${at}  [view] ${entry.focus ? `on "${entry.focus.name}"` : "open map"}; ${entry.visible?.length ?? 0} visible`;
    case "error": return `${at}  ✕ ${entry.message}${entry.code ? ` (${entry.code})` : ""}`;
    case "trace.open": return `${at}  open ${entry.phone ? "phone" : "desktop"} ${entry.viewport?.join("×") ?? ""}`;
    case "session.live": return `${at}  live ${entry.live}`;
    case "session.open": return `${at}  connecting`;
    case "trace.end": return `${at}  end ${entry.reason ?? ""}${entry.seconds != null ? ` · ${entry.seconds}s billed` : ""}${entry.confirmed === false ? " · usage unconfirmed" : ""}`;
    default: return `${at}  ${entry.kind} ${JSON.stringify({ ...entry, t: undefined, at: undefined, kind: undefined })}`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const files = await traceFiles();

  if (args.includes("--list")) {
    if (!files.length) return console.log("No traces yet.");
    for (const file of files) {
      const s = summarize(await readLines(file.path));
      console.log(`${file.day}  ${file.path.split("/").pop().padEnd(24)}  ${clock(s.duration)}  ${s.device?.phone ? "phone " : "desk  "}  visitor ${String(s.visitorWords).padStart(4)}w  abacus ${String(s.abacusWords).padStart(4)}w  tools ${s.tools}  feedback ${s.feedback}${s.errors ? `  errors ${s.errors}` : ""}`);
    }
    return;
  }

  if (args.includes("--feedback")) {
    for (const file of files) {
      const lines = await readLines(file.path);
      const notes = lines.filter((l) => l.kind === "feedback");
      const asides = timeline(lines).filter((e) => e.kind === "speech" && e.who === "visitor" && /claude|builder|note for|didn'?t work|should change|i wish/i.test(e.text));
      if (!notes.length && !asides.length) continue;
      console.log(`\n${file.day}  ${file.path.split("/").pop()}`);
      for (const n of notes) console.log(`  ${clock(n.t)}  !! ${n.note}`);
      for (const a of asides) console.log(`  ${clock(a.t)}  "${a.text.trim()}"`);
    }
    return;
  }

  const target = args.find((a) => a.endsWith(".jsonl")) || files.at(-1)?.path;
  if (!target) return console.log("No traces yet. Talk to Abacus once and come back.");
  const lines = await readLines(target);
  const s = summarize(lines);
  console.log(`${target}`);
  console.log(`live ${s.live ?? "?"} · from ${s.address ?? "?"} · ${clock(s.duration)} · ${s.device?.phone ? "phone" : "desktop"} · visitor ${s.visitorWords}w · abacus ${s.abacusWords}w · tools ${s.tools} · feedback ${s.feedback}\n`);
  for (const entry of timeline(lines)) console.log(render(entry));
}

main().catch((error) => { console.error(error); process.exit(1); });
