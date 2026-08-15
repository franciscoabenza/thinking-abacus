# Thinking Abacus — territory toy

A navigable territory of Fran's concepts, rendered as an organic tessellation,
guided **and grown** by a realtime voice agent (Abacus).

This is a fast iteration prototype, modeled on `stanley-terminal`: vanilla Node +
a `web/` folder, **zero build step**.

## Run

```sh
cp .env.example .env       # then paste your OpenAI API key (the same one stanley-terminal uses works)
npm start
```

Open http://127.0.0.1:5174

- **Drag** to pan, **scroll** to zoom, **click** a cell to focus it (its name + note appears).
- **Talk to Abacus** to start the voice agent (needs mic permission + an API key).

## What the agent can do

The voice loop is OpenAI Realtime over WebRTC. The API key never leaves the
server (`/session` proxies the SDP handshake). Abacus has these tools:

- `focus(query)` — pan/zoom the map to a concept
- `highlight(query)` — emphasize a theme across cells
- `connect(a, b)` — draw a relationship line between two concepts
- `spawn_concept(name, note, near)` — **add a new concept to the map as you talk**
- `get_view_state()` — what's focused / on screen

## The look

The renderer is baked to the design Fran dialed in on the playground bench:
`{ round: 7, pack: 0.93, hier: 0.59, motion: 0.02, palette: "ink", labels: "off", guide: true }`
— tight angular tessellation, ink on light, near-still, labels hidden until you
hover/focus, with the lime guide cell.

## Seed data

`web/concepts.js` holds ~24 real concepts mined from the Obsidian vault. The next
step is wiring the **live vault** (embeddings → semantic layout) instead of this
hand-seeded set — see the project plan.

## Notes / next

- Confirm the current OpenAI Realtime model id (`REALTIME_MODEL`, default `gpt-realtime-2`).
- Layout is a simple force sim + power-Voronoi; swap in embedding-driven positions later.
- Polyphony (a second agent + turn referee) layers on top of this single loop.
