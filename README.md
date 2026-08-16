# Thinking Abacus — a field guide to a restless mind

A curiosity-led atlas of Fran's Obsidian vault, rendered as an organic
tessellation and guided **and grown** by a realtime voice agent (Abacus).

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

The voice loop is OpenAI Realtime over WebRTC. The API key never leaves the
server (`/session` proxies the SDP handshake). Abacus has these tools:

- `focus(query)` — open the most relevant thought and its provenance
- `highlight(query)` — emphasize a theme across cells
- `connect(a, b, relation)` — draw and explain a relationship between thoughts
- `spawn_concept(name, note, near, question)` — **grow a new thought as you talk**
- `get_view_state()` — what's focused / on screen

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

- Confirm the current OpenAI Realtime model id (`REALTIME_MODEL`, default `gpt-realtime-2`).
- Layout is a simple force sim + power-Voronoi; swap in embedding-driven positions later.
- Polyphony (a second agent + turn referee) layers on top of this single loop.
