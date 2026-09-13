# Thinking Abacus — phased backlog

Source of intent: `docs/vision/2026-09-12-fran-brain-dump.md`. This file is
the sequence; that file is the meaning. Phases are ordered so each one leaves
something Fran can test by talking to it, and so the semantic field (Phase 2)
is in place before the things that depend on it.

Legend: **[needs Fran]** — blocked on a number, an account, or a decision only
Fran can make.

---

## Phase 0 — Testable from anywhere, tonight

Goal: Fran can open the atlas on his phone, away from the local network, and
talk to Abacus, without the API key being burnable by strangers.

- [x] GPT-Live (`gpt-live-1`) over WebRTC with Responses delegation. Done.
- [ ] Public HTTPS URL for the local server (Cloudflare quick tunnel; no
      account, no interstitial). Keep the Mac awake while it runs.
- [ ] Access key: `/session` refuses to mint a session unless the page was
      opened with the key. Static assets stay public; only money is gated.
- [ ] Per-IP and global session rate limits, so a leaked link has a ceiling.
- [ ] iOS Safari audio: unlock the output element inside the tap gesture and
      mark it `playsinline`, or the guide will be silent on the phone.
- [ ] Prompt: stop narrating the interface (see Phase 1). Cheap enough to do
      tonight, and it is the first thing Fran will notice.

Not tonight: a real deploy to thinkingabacus.com. The tunnel answers the
question; a deploy is a separate decision about hosting a Node process.

---

## Phase 1 — By the way, not by command

Goal: the atlas moves as a side effect of conversation. Nobody says "let me
open that node". Several thoughts can be alive at once.

- [x] **Silent tools.** Voice prompt: the guide never mentions opening,
      selecting, moving, highlighting, or the interface at all; it talks about
      the *idea*. Backend prompt: return facts, never "I opened X". Tool
      results carry no interface vocabulary for the guide to echo. (Prompts
      shipped; whether it holds is judged from traces.)
- [x] **Salience instead of selection.** `web/salience.js`: a per-thought
      value in [0, 1], eased over wall-clock time, targets decaying with a
      22 s half-life unless pinned. `focus` pins; `attend`/`highlight`/
      `connect` raise. The render reads it for growth, stroke, label reveal,
      draw order, and threads between any two alive thoughts. `focusId` still
      exists for the reading sheet until Phase 3 removes the sheet.
- [x] **Multi-selection from the backend.** `attend({ thoughts: [{query,
      weight}] })` warms several thoughts and holds them in view; nothing
      opens. Matching requires a real name hit, not a stray shared word.
- [x] **Context pushing tuned.** The narrator now says what is alive in the
      conversation as well as what is focused and on screen.
- [ ] **Judge it from traces.** After Fran's next sessions: does Abacus still
      name the interface? Does `attend` get chosen when a cluster is in play?
      Tune weights and the 22 s half-life from what the traces show.
- [ ] Remove the detail side panel from the *default* path once Phase 3 lands;
      until then it stays.

Test: talk for two minutes without asking for anything. The atlas should have
drifted to where the conversation went, and Abacus should never have said the
word "open".

---

## Phase 2 — The live wave: a semantic field from the transcript

Goal: what is being said, right now, becomes a field over the territory. Pull
between thoughts is contextual — magnetism, not gravity. This is the
foundation for text fade (2c), ferrofluid (Phase 4), and the embedding half of
multi-selection.

- [ ] **2a. Transcript chunking.** A third thread (Web Worker) consumes
      `session.input_transcript.delta` and `session.output_transcript.delta`,
      groups fragments into phrases using `start_ms`/`end_ms` gaps, and emits
      phrases with timestamps. Both speakers count; the user's words weigh
      more.
- [ ] **2b. Embeddings.** Decide: browser-local (transformers.js / ONNX, small
      model, private, free, ~50–100 ms per phrase) versus API embeddings
      (better, costs, leaves the machine). Start browser-local; it keeps the
      vault private, which the old backlog already required. Pre-embed every
      thought's title + fragment + note + question + tags at boot (or at build)
      and cache.
- [ ] **2c. Physics-based accumulation.** Each thought carries a charge that
      rises with similarity to recent phrases and decays with time — a leaky
      integrator, so a mention lingers, repetition builds, silence lets it
      fade. This charge *is* the salience from Phase 1, once both exist.
- [ ] **2d. Contextual pull.** The force sim reads charge: charged thoughts
      attract each other and the visitor's attention; the field between them
      is what the ferrofluid will later flow along.
- [ ] **2e. Text fade by proximity.** A thought's text reveals in proportion
      to its charge: title always, fragment when warm, note when hot. The
      "don't show all the text at once" idea.
- [ ] **2f. Threshold multi-selection.** Thoughts above a charge threshold are
      attended automatically — the embedding half of "two in tandem" with the
      backend's `attend`.
- [ ] **Semantic proximity engine (from the earlier backlog, kept intact):**
      ingest selected vault notes locally with provenance; embed titles,
      fragments, questions, tags, and bodies separately; combine vector
      neighbours with explicit Obsidian links and curated exclusions; use
      semantic distance for layout, label reveal, search, and the connections
      Abacus may suggest; expose *why* two thoughts are near, never a bare
      score; incremental updates when a note changes; private content stays
      local unless publication is explicit; hand-pinned relationships override
      the embedding topology. Prototype against the curated `LINKS` graph first
      so embeddings replace a proven contract rather than define the product
      by accident.

Test: say "memory" three times in a minute. Watch charge build on the memory
thoughts, their text surface, and the field pull them together; then stop
talking and watch it relax.

---

## Phase 3 — Cookie morphology: general, selected, open

Goal: a thought is one object at three scales. The third scale does not exist
yet and Fran called it "very important".

- [ ] **General** (exists): the zoomed-out tile — title, quiet signals.
- [ ] **Selected** (exists, adjust): grows, takes more screen, as if the
      visitor leaned in. Drive size from salience.
- [ ] **Open** (new): the cookie *is* the canvas of the idea. Fragment, note,
      question, source, related — rendered inside the cell, scrollable within
      it, clipped by its edge. Text being slightly cut is fine and intended.
      The side panel becomes optional and then goes.
- [ ] **Lens physics.** Content inside an open cookie behaves as if seen
      through a lens: refraction at the rim, a lenticular/diffraction shimmer
      when something is present, slight distortion that is part of the
      reading experience rather than a bug. Prototype in 2D canvas with a
      displacement pass; move to WebGL only if the canvas cannot hold 60 fps.
- [ ] Rendering budget: the label sprite cache already exists; open cookies
      need a content sprite cache of their own.

Test: open a thought and read it entirely inside the cell, scrolling inside
the cookie, with the panel hidden.

---

## Phase 4 — Thinking Abacus as a ferrofluid: the distributed mind

Goal: the black guide cell stops being a fixed centre. It becomes a fluid
that is pulled by the semantic field and, when nothing is in context,
collapses back into its own form. This should tickle the senses.

- [ ] Read two or three ferrofluid papers (Rosensweig instability, spike
      formation under a normal field, viscosity vs. magnetisation) and pick
      the two or three parameters that matter for the *illusion*: viscosity,
      self-attraction (surface tension), and field strength.
- [ ] Semantics as magnetism: the Phase 2 charge field is the external field.
      The fluid flows toward charged thoughts, spikes where several are
      nearly equal, and slumps back when the field is quiet.
- [ ] Collapse mode is a parameter: "concentrated" (one cookie, as today) ↔
      "distributed" (spread along the field). Both are valid; Abacus may sit
      as a form when there is nothing in context.
- [ ] Implementation candidates: metaballs over a particle set in 2D canvas
      (cheapest, reads as gooey); marching squares over a scalar field;
      SPH-lite if the particle count stays under a few hundred.
- [ ] Interaction: tapping the fluid still starts/stops the conversation.

Test: mention two thoughts in one sentence and watch the fluid stretch
between them; go quiet and watch it pool.

---

## Phase 5 — Using it is improving it

Goal: a feature request during the conversation becomes a visible artefact in
the territory — a lenticular, slightly blurred memory of a GitHub PR.

- [ ] Tool `propose_change({ title, summary })` — the backend calls it when
      the visitor asks for something the atlas does not do yet.
- [ ] A **PR cookie**: rendered to look like a GitHub pull request (title,
      number, green/purple state, a diff shimmer), through the Phase 3 lens
      but dirtier — blurred, a little disturbed, like a memory. It does not
      need to be a real PR to convince a technical visitor that something
      happened.
- [ ] Persist proposals (a JSON file on the server is enough) so they survive
      a reload and so Fran can read what visitors asked for.
- [ ] Later, optional: open a real draft PR via `gh` from the proposal.

Test: say "I wish it could…" and see a PR cookie grow near the thought you
were on.

---

## Phase 6 — Hire Fran, and call Fran

Goal: the atlas can present Fran as hireable and, at the right moment, bring
him into the conversation live.

- [ ] **Hire-me cookies** [needs Fran]: an hourly rate; the zero-to-one
      package — prototypes that shape complexity and uncertainty into concrete
      solutions that work at scale. Fran supplies the numbers; the cookies
      use the same morphology as any thought.
- [ ] **Hand-off design.** Options, in rough order of effort:
      1. *Phone bridge*: tool `call_fran` → server dials Fran's number (Twilio
         or Telnyx) and bridges the visitor's audio; Abacus steps back.
      2. *Conference*: a LiveKit room the visitor is already in; Fran joins
         from his phone; the agent can stay as a third participant or leave.
      3. *Notify + schedule*: if Fran is not in his window, offer a slot.
      The Live API offers SIP and LiveKit/Twilio/Telnyx partner paths
      (`live-partner-integrations`); evaluate which keeps the voice session
      intact when Fran joins.
- [ ] **Availability window** [needs Fran]: a simple "Fran is reachable
      between X and Y" plus a manual toggle; the tool is only offered inside
      the window.
- [ ] **Qualification.** The backend decides when a visitor is "a little bit
      qualified" (talked about a real project, asked how Fran works) and only
      then surfaces the call. Also allow it at any point on request.
- [ ] Accounts and numbers [needs Fran]: Twilio/Telnyx or LiveKit; the phone
      number; consent copy for the visitor.

Test: from the phone, get qualified, hear the offer, accept, and have Fran's
phone ring.

---

## Cross-cutting

- **Phasing the work itself.** One phase per session where possible; each
  phase ends with a Fran-testable build behind the tunnel. The context window
  is a budget: new sessions start from this file and the vision file.
- **Testing split.** Claude verifies protocol, rendering, and performance in
  the browser. Fran tests the *experience* — pacing, feel, whether it tickles.
  Do not let a model judge the human part.
- **Traces.** Every conversation is a JSONL file under `traces/<day>/` —
  both speakers' words, tool calls, context pushes, presence, taps, errors,
  and `note_to_builder` feedback. `npm run trace` replays one; `--feedback`
  collects what visitors said should change. Fran can steer the build by
  talking to Abacus. (Shipped 2026-09-13.)
  - [ ] Graph a trace: who spoke when, tool latency, and the salience field
        once Phase 2 exists — a timeline picture rather than a text replay.
  - [ ] Backend token usage from nested `response.completed` into the trace,
        next to the voice seconds already recorded at close.
- **Cost.** GPT-Live is billed per second; the backend per token. The trace's
  closing line carries the voice seconds; add backend tokens (above).
- **Deploy.** thinkingabacus.com needs a host for a Node process (Fly, Render,
  Railway, a VPS) — GitHub Pages cannot run `/session`. Decide when the tunnel
  stops being enough.
