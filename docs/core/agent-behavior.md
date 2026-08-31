# Agent behavior

## Authority

When instructions conflict, use this order:

1. explicit current human instruction;
2. project ADR or explicit project override;
3. project-local conventions and architecture;
4. Keenko core conventions;
5. enabled Keenko stack modules;
6. Keenko-owned skills;
7. vendored or first-party upstream skills;
8. generic agent or library defaults.

`AGENTS.md` and `CLAUDE.md` route the harness into this hierarchy; they do not outrank it.

## Before substantial work

Read the repository before editing:

- the applicable `AGENTS.md` or `CLAUDE.md` instructions;
- root `CONTEXT.md`;
- project architecture and overrides;
- relevant ADRs;
- the existing implementation and tests around the change;
- exact installed dependency versions when behavior is version-sensitive;
- generated/native APIs and installed package source/types when they define the real boundary.

Facts are the agent's job to investigate. Genuine product, architecture, legal, and business choices remain human decisions. Do not silently convert uncertainty into a new policy.

## Implementation discipline

- Prefer deletion and the smallest change that solves the actual problem.
- Keep behavior local to its owner until a real reuse, boundary, or seam exists.
- Prefer deep modules: small stable interfaces that hide meaningful complexity.
- Do not add wrappers, services, packages, state, schemas, configuration, or abstractions for hypothetical reuse.
- Abstract shared semantics and change axes, not structural similarity alone.
- Derive cheap deterministic values from canonical state instead of synchronizing duplicate copies.
- Make data flow, ownership, trust boundaries, and failure paths visible.
- Use short contextual names without cryptic abbreviation.
- Preserve established domain vocabulary; do not invent synonyms casually.
- Optimize after ownership/data flow are correct and a credible bottleneck exists.
- Verify behavior instead of asserting that code is correct.

These are Keenko's always-on concise implementation principles. Vendored skills may provide procedural detail but do not replace these rules.

## Version-sensitive claims

For fast-moving libraries such as Effect, Confect, Convex, TanStack, Paraglide, and provider SDKs, inspect the installed version and current primary source/types/docs before making a behavior-dependent change. Model memory is a hypothesis, not evidence.

## Knowledge

Hidden model/session state is never canonical project knowledge. Durable information belongs in the appropriate source:

- code/config for executable truth;
- `CONTEXT.md` for concise stable project/domain context;
- architecture docs for the current architecture;
- ADRs for significant historical rationale;
- Linear for canonical actionable work;
- PRs for change-specific rationale and verification;
- runbooks for durable operations.

Do not require session journals or Obsidian in Keenko core.

## Consequential actions

Implementation authorization does not silently authorize external or destructive actions. Commit, push, PR, production deploy, migration, secret mutation, deletion, refund/billing action, force push, merge, and similar operations require the scope delegated by the current task. Merge remains explicitly human-owned.
