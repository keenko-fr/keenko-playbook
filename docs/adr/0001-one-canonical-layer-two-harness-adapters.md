# ADR 0001: one canonical engineering layer, two harness adapters

## Status

Accepted.

## Decision

Human engineering conventions are canonical. Codex and Claude receive thin harness-specific routing/adaptation rather than separate copies of the engineering rules.

## Consequences

- `AGENTS.md` and `CLAUDE.md` stay small.
- Canonical knowledge lives under `docs/` and `skills/`.
- Harness-specific differences are allowed only where capabilities/invocation actually differ.
- A project-local decision can override Keenko defaults explicitly without forking the shared playbook.
