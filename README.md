# Thinking Abacus — a field guide to a restless mind

A curiosity-led atlas of Fran's Obsidian vault, rendered as an organic
tessellation and guided **and grown** by a full-duplex voice agent (Abacus).

The map is deliberately not a folder browser. It mixes theses, prototypes,
memories, provocations, interfaces, and life systems so a visitor can find an
idea by recognition, search by hunch, or follow a surprising connection.

This is a fast iteration prototype, modeled on `stanley-terminal`: vanilla Node +
a `web/` folder, **zero build step**.

## Run

```sh
cp .env.example .env       # then paste your OpenAI API key (the same one stanley-terminal uses works)
npm start
```

`.env` also picks the voice model (`LIVE_MODEL`), the backend it delegates to
(`LIVE_BACKEND_MODEL`), Abacus's voice (`LIVE_VOICE`), and whether that backend
is hosted or yours (`LIVE_DELEGATION`).

Open http://127.0.0.1:5174

- **Drag** to paddle through the field with resistance and momentum. Begin the
  drag on a thought to moor that lily pad while the territory moves beneath it;
  after release, it slowly returns to its semantic home.
- **Scroll** to burrow, and **click** a cell to open its fragment, source note,
  live question, and related thoughts.
- Use **Surprise me** (or press `D`) to enter somewhere unexpected.
- Use **Find a thought** (or press `/`) to search across titles, fragments,
  questions, and themes instead of folder names.
- **Follow this thread** (or press `→`) to move along a meaningful connection;
  the relationship itself is part of the reading experience.
- **Talk to Abacus** to start the voice agent (needs mic permission + an API key).

## What the agent can do

The voice loop is **GPT-Live** (`gpt-live-1`) over WebRTC. The API key never
leaves the server: `/session` posts the browser's SDP offer to
`POST /v1/live/sessions` and hands back only the answer.

GPT-Live splits the job in two. The voice model conducts the conversation — it
listens and speaks at the same time, handles interruptions, and decides when it
needs help. It does not call tools itself; it **delegates** to a backend
(`gpt-5.6-terra`) that reasons about the territory and picks the tool, while the
conversation keeps going. The browser still executes every tool against the
atlas:

- `focus(query)` — open the most relevant thought and its provenance
- `highlight(query)` — emphasize a theme across cells
- `connect(a, b, relation)` — draw and explain a relationship between thoughts
- `spawn_concept(name, note, near, question)` — **grow a new thought as you talk**

- `note_to_builder(note)` — the visitor is saying how the atlas itself should change; it is recorded for Fran

`get_view_state()` is gone on purpose. The application now *pushes* what is on
screen into the model's context whenever the view changes, so Abacus already
knows where you are and "that one" resolves without a round trip.

### The live wave

What is being said becomes a field over the territory. Transcript fragments
are joined into phrases (`web/wave/phrases.js`), embedded in a Web Worker
(`web/wave/embedder.js`, `all-MiniLM-L6-v2` on WASM — private, free, ~5 ms a
phrase), compared with every thought, and the thoughts a phrase resembles are
charged (`web/wave/wave.js` → `salience.energize`). Charge builds with
repetition and fades with a 22 s half-life; the render reads it for growth,
stroke, label and fragment reveal, threads between alive thoughts, a gentle
pull between them, and a camera that drifts toward the conversation.

`?debug` exposes `abacus.wave.say("…")` so the field can be driven from the
console without a voice session.

### The ferrofluid

The black guide cell is a fluid (`web/ferrofluid.js`): particles held by
cohesion and volume, damped by viscosity, homed to the cell, and pulled by
every alive thought. Under a strong field it reaches out and stretches
between ideas; quiet, it collapses back into its form. Alive thoughts also
pull on one another, reshaping the tessellation without ever overlapping.
The surface is marching-squares metaballs, so it needs no canvas filters.

### Traces

Every conversation is written to `traces/<day>/<trace>.jsonl`: both speakers' words with timestamps, tool calls and results, what the guide was told was on screen, presence, errors, and feedback notes. `npm run trace` replays the latest session as a timeline; `npm run trace -- --list` and `-- --feedback` do what they say. The folder is git-ignored.

### How the voice layer is arranged

Each file has a small interface and hides a lot behind it.

| File | Interface | What it hides |
| --- | --- | --- |
| `web/voice/webrtc.js` | `openVoiceChannel()` | mic capture, peer connection, ICE gathering, SDP exchange |
| `web/voice/live.js` | `createLiveSession()` | the whole GPT-Live event protocol: the `session.started` gate, acknowledgement correlation, unwrapping delegated Responses events, collecting a response's tool calls and submitting every result before continuing it, and the close handshake that waits for final usage |
| `web/voice/presence.js` | `createPresence()` | inferring who is talking when nothing marks the end of a turn |
| `web/voice/agent.js` | `abacusSession()` | Abacus's identity — the split between the voice prompt and the backend prompt, and the tool schemas. **Imported by both `server.js` and the browser**, so there is one definition |
| `web/voice/narrator.js` | `createNarrator()` | turning atlas state into concise context updates, debounced and deduped |
| `web/voice/panel.js` | `createVoicePanel()` | every element id, and the words used for each state |
| `web/ferrofluid.js` | `createFerrofluid()` | the guide as a fluid: particle physics, the scalar field, marching-squares contouring |
| `web/salience.js` | `createSalience()` | how alive each thought is: eased, decaying, pinned by reading, energised by the wave |
| `web/wave/wave.js` | `createWave()` | phrases → embeddings → charge; the worker, the queue, the sharpening, the failure mode |
| `web/voice/trace.js` | `createTrace()` | a pure timestamped log of one conversation, batched to the server |
| `web/voice/index.js` | `installVoice(atlas)` | nothing — it is only wiring, and stays that way |

`web/app.js` hands the voice layer four atlas operations and one view reader.
It knows nothing else about voice, and the voice layer knows nothing about how
a cell is drawn.

## The look

The renderer keeps the dense, organic geometry of the original playground
study but now behaves like an editorial object: near-still paper cells, visible
titles, quiet type signals, animated semantic threads, acid and cobalt accents,
and a provenance-rich reading sheet.

## Seed data

`web/concepts.js` holds a curated set of real vault nuggets and explicit reasons
for their connections. The material is distilled by hand rather than exported
wholesale, keeping each encounter short enough to invite the original note.

The next infrastructure step is wiring the **live vault** (embeddings → semantic
layout and safe incremental curation) instead of relying on this hand-seeded set.

## Notes / next

- Set `LIVE_DELEGATION=client` to take the backend back into the browser: the
  atlas's own search becomes the reasoning, with no second model and no token
  cost — at the price of matching a vague spoken sentence far less well.
- The live model can narrate an atlas move before the backend has made one. The
  voice prompt forbids it explicitly; re-check that wording if you change it.
- Layout is a simple force sim + power-Voronoi; swap in embedding-driven positions later.
- Polyphony (a second agent + turn referee) layers on top of this single loop.
