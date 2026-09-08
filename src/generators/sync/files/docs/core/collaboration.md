# Collaboration

Humans remain accountable for work even when Codex or Claude performs implementation. Linear is the canonical store for actionable Keenko work; GitHub Issues are public intake and should be triaged into the canonical workflow when action is accepted.

- Prefer one coherent deliverable or issue per PR where practical.
- Concurrent work uses separate branches; use separate worktrees when multiple branches/agents are active concurrently.
- Avoid overlapping ownership between concurrent tasks unless deliberately coordinated.
- Keep WIP low, but the exact WIP limit is a project/team policy rather than a Keenko universal constant.
- Prefer opposite-harness review for substantial agent work when practical: Claude reviews Codex work and Codex reviews Claude work.
- Agent review is evidence, never merge approval. Human peer approval remains the merge gate.
- Use the human's normal Git identity. Do not require AI co-author trailers.
- Handoffs capture only durable information that the next person/harness cannot reconstruct cheaply.

## Work shaping

For substantial multi-session work, move from clarified intent to a durable spec, then decompose into small tracer-bullet tickets. Prefer vertical outcomes that advance an observable end-to-end path over horizontal phases such as “all schemas” then “all queries” then “all UI”.

Each implementation ticket should define as applicable:

- goal/outcome;
- scope and non-scope;
- blocking relationships;
- acceptance criteria;
- focused verification.

Record dependency edges explicitly in the tracker and work blockers-first.
