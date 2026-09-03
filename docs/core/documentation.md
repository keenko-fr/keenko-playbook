# Documentation

## Canonical sources

- `README.md` is the repository entrypoint: purpose, setup, high-level structure, canonical commands, and links to deeper docs.
- `CONTEXT.md` is concise stable project/domain context and vocabulary, not a project notebook.
- Current architecture belongs in project architecture docs.
- Project-specific visual and interaction decisions belong in `docs/project/ui.md` when the enabled stack has a meaningful UI surface. Exact executable values and implementations remain in code/config.
- Expensive-to-reverse or rationale-sensitive decisions belong in ADRs.
- Historical feature specifications remain useful records, but lasting policy/architecture must be extracted into current canonical docs.
- Actionable Keenko work belongs in Linear; GitHub Issues are public intake.
- Operational procedures belong in runbooks.

Do not maintain parallel "for humans" and "for agents" restatements of the same rules. Harness files should route to canonical docs/skills rather than duplicate them.

## `CONTEXT.md`

Keep only durable information such as:

- canonical domain terms;
- important current constraints;
- stable product facts;
- links to relevant architecture/ADRs.

Do not use it for transcripts, implementation logs, ticket status, large specifications, temporary research notes, or duplicated conventions.

## ADRs

Use an ADR for expensive-to-reverse architecture/governance choices or rationale likely to be lost. Ordinary implementation decisions do not need one.

Before the first stable supported Keenko baseline, an explicit Linear architecture decision may replace an abandoned pre-v1 model without preserving ADR archaeology for that model. Delete ADRs whose decisions are no longer supported. Keep ADRs that still describe a live expensive-to-reverse decision, and correct stale pre-v1 implementation details in place when the decision itself has not changed.

From the first stable supported baseline onward, preserve an ADR once it materially informs supported implementation. If that decision later changes, add a superseding ADR and link both. Only minor factual or typo corrections rewrite the original. Current architecture docs must always describe the supported state.

## Change discipline

Update affected canonical docs in the same PR as the behavior/architecture/convention they describe. Do not defer routine documentation repair to a later cleanup.

## Human-reproducible operations

A durable operational process cannot exist only as "ask the agent". For deployments, migrations, provider setup, recovery, security operations, and similar workflows, document the applicable:

- outcome;
- prerequisites and permissions;
- required inputs/configuration;
- manual procedure;
- expected results;
- verification;
- recovery/rollback;
- security boundaries;
- automation equivalent;
- maintenance/ownership.

Omit irrelevant sections rather than adding boilerplate.

Keenko core does not require Obsidian or per-session journals.
