# Thinking Abacus — product backlog

## Semantic proximity engine

**Status:** Later — after the interaction language and spatial physics feel right.

Replace the hand-authored concept graph with a privacy-conscious hybrid of
embeddings and human curation. The engine should discover conceptual neighbours
from the Obsidian vault, but never pretend that vector similarity is meaning.

The eventual system should:

- ingest selected vault notes locally and preserve source-note provenance;
- embed titles, fragments, questions, tags, and note bodies separately;
- combine vector neighbours with explicit Obsidian links and curated exclusions;
- use semantic distance to influence layout, label revelation, search, and the
  connections Abacus may suggest;
- expose why two thoughts are near one another instead of showing an opaque
  similarity score;
- support incremental updates when a note changes without rebuilding the
  entire territory;
- keep private-vault content local unless publication is explicitly requested;
- allow hand-pinned relationships to override the embedding topology.

Before implementation, prototype the interaction with the current curated
`LINKS` graph. The embeddings layer should replace a proven semantic contract,
not define the product by accident.
