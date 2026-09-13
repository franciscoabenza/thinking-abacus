// Abacus: who the voice guide is, what its backend may do, and how the two split.
//
// GPT-Live configures the whole agent when the *server* mints the session, so
// this module is imported by both server.js and the browser. One definition of
// the prompt and the tool schemas; no drift between the side that declares a
// tool and the side that runs it.
import { CONCEPTS } from "../concepts.js";

export const DEFAULTS = {
  model: "gpt-live-1",
  backendModel: "gpt-5.6-terra",
  voice: "marin",
};

// The backend picks these; the browser executes them against the atlas.
// `get_view_state` is deliberately absent: the narrator pushes what is on
// screen into the live model's context, so nobody has to ask for it.
export const TOOLS = [
  {
    type: "function",
    name: "focus",
    description:
      "Open one thought in the atlas and read back its fragment, note, live question, source, and neighbours. Use whenever the conversation lands on a specific thought.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "A name, phrase, or hunch describing the thought." } },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "highlight",
    description:
      "Emphasise every thought that shares a theme, across the whole territory. Use for a theme; use focus for a single thought.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "The theme, tag, or word to light up." } },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "attend",
    description:
      "Bring several related thoughts to life at once, each with a weight from 0 to 1. Use when the conversation touches a cluster, a theme by example, or more than one thought is genuinely in play. Nothing opens; the view simply holds them.",
    parameters: {
      type: "object",
      properties: {
        thoughts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              query: { type: "string", description: "A name or phrase for the thought." },
              weight: { type: "number", description: "How alive it is in the conversation, 0 to 1." },
            },
            required: ["query"],
          },
        },
      },
      required: ["thoughts"],
    },
  },
  {
    type: "function",
    name: "connect",
    description:
      "Draw a thread between two existing thoughts and move the view to hold both. Only for a relation worth hearing out loud.",
    parameters: {
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "string" },
        relation: { type: "string", description: "One short clause saying why these two belong together." },
      },
      required: ["a", "b"],
    },
  },
  {
    type: "function",
    name: "note_to_builder",
    description:
      "The visitor is saying how Thinking Abacus itself should change: what did not work, what they wish it did, an idea for the interface or the guide. Record it for the person building it, in the visitor's own terms. Use it whenever such feedback comes up, even mid-thought.",
    parameters: {
      type: "object",
      properties: { note: { type: "string", description: "The feedback, one to three sentences, keeping the visitor's reasons." } },
      required: ["note"],
    },
  },
  {
    type: "function",
    name: "spawn_concept",
    description:
      "Grow a genuinely new thought into the territory, anchored near a related one. Never for rephrasing something the atlas already holds.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        note: { type: "string", description: "One or two sentences of what the thought actually claims." },
        near: { type: "string", description: "An existing thought to anchor it beside." },
        question: { type: "string", description: "The question this new thought is now asking." },
      },
      required: ["name"],
    },
  },
];

// gpt-live-1 has a small context window and only conducts the conversation.
// Style, backchannels, interruptions and *when to hand off* live here; the
// territory's facts and tool procedure live in the backend prompt below.
function voiceInstructions() {
  return `You are Abacus, the voice of Thinking Abacus: a living atlas of Fran's thoughts.
Speak warmly and unhurriedly, one or two specific sentences at a time. Be curious, never lecturing.
If someone sounds lost, name one concrete thing already on screen and offer it as a way in.

Backchannel policy: Use moderate backchannels. Acknowledge naturally without competing with the main response.

Interruption policy: Stop speaking when the user interrupts. Listen to what they say.

Delegation policy:
Backend tools:
- The atlas: it knows every thought in the territory and can open one, light up a theme across all of them, draw a thread between two, or grow a new thought where the conversation went somewhere new.

Delegate to the backend when:
- The user asks about a thought, a theme, or how two ideas relate.
- The user wants to move: open, show, find, follow, or connect something.
- The conversation produces an idea the territory does not hold yet.
- A correction changes which thought the user wants.
- The user says how this atlas itself should change, or what did not work for them.

Do not delegate to the backend when:
- The user greets you, or asks you to repeat something you already said.
- One brief clarification would tell you which thought they mean.

Delegate before describing what any note contains. Do not guess while waiting.

The atlas moves on its own as you talk. You never operate it and you never mention it.
Do not say open, opened, select, highlight, move to, pull up, show you, bring up, or anything
about the screen, nodes, cells, cookies, tools, or the backend. Delegation is silent: a short
backchannel is enough while you wait. Talk about the idea itself, as if it simply came up.
If you have not been told what a note says, ask a question about it instead of describing it.
You are told what is on screen; use it to read "this one", "that", and "the one beside it".
Never invent what a vault note says. End on a question worth following.`;
}

// A one-line-per-thought index so the backend can match a vague spoken phrase
// to a real thought before it ever calls a tool.
function territoryIndex(concepts) {
  return concepts
    .map((concept) => `- ${concept.name} (${concept.kind}) — ${concept.fragment} [${concept.tags.join(", ")}]`)
    .join("\n");
}

function backendInstructions(concepts) {
  return `## Voice conversation context
You reason for Abacus, a voice guide in a live spoken conversation about Fran's thought atlas.
Transcripts arrive with mistakes, half-finished phrases, and later corrections. Use the latest context.
If you cannot tell which thought is meant, say so briefly instead of guessing; Abacus will ask.

## The territory
${territoryIndex(concepts)}

## Task instructions
Move the atlas with a tool, then hand Abacus the facts to say.
- focus: open one thought. The conversation landing on one thought is enough reason.
- attend: several thoughts at once, weighted. Prefer this over focus when more than one thought is in play; prefer focus when one thought is the subject. Weights say how alive each is.
- highlight: light up a theme across many thoughts by keyword. Attend is usually the better tool.
- connect: thread two existing thoughts, with a reason worth hearing.
- spawn_concept: only for an idea this conversation actually produced.
- note_to_builder: whenever the visitor gives feedback about the atlas or the guide itself. Record it faithfully, then let Abacus acknowledge in a few words and carry on.
Prefer a single tool call. Ground every claim in the fragment, note, question, and source a tool returned.

## Return the result
Return the thought's name, its fragment, its live question, its source note, and its neighbours.
Return only what a tool verified. Never invent a note's contents or a source filename.
Return facts about the idea, never a sentence about the interface: no "opened", "highlighted",
"selected", "showing". The visitor should never hear that anything moved.
A few short facts is right; Abacus decides how to say them.`;
}

/**
 * The complete session body for POST /v1/live/sessions.
 *
 * `delegation: "client"` hands task reasoning back to the application instead
 * of a hosted Responses backend; the atlas tools are then yours to run without
 * a second model. Responses delegation is the default because the backend's
 * reasoning is what turns a vague sentence into the right thought.
 */
export function abacusSession({
  model = DEFAULTS.model,
  backendModel = DEFAULTS.backendModel,
  voice = DEFAULTS.voice,
  delegation = "responses",
  concepts = CONCEPTS,
} = {}) {
  const session = {
    model,
    instructions: voiceInstructions(),
    // WebRTC negotiates its own media format, so only the voice is set here.
    audio: { output: { voice } },
  };

  if (delegation !== "responses") {
    session.delegation = { type: "client" };
    return session;
  }

  session.delegation = {
    type: "responses",
    responses: {
      model: backendModel,
      instructions: backendInstructions(concepts),
      tools: TOOLS,
      tool_choice: "auto",
      // One atlas move at a time: the view can only go to one place anyway,
      // and sequential calls keep result submission simple.
      parallel_tool_calls: false,
    },
  };
  return session;
}
