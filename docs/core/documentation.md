# Documentation

Documentation exists to preserve durable knowledge and make important processes reproducible by humans and agents.

## Sources of truth

- `README.md`: project entrypoint, setup, high-level structure, canonical commands, links to deeper docs.
- `CONTEXT.md`: concise stable domain/product vocabulary and durable facts.
- `docs/project/architecture.md`: current project-specific architecture.
- `docs/project/overrides.md`: deliberate project deviations from Keenko defaults.
- ADRs: significant historical decisions, rationale, and consequences.
- feature/spec docs: durable design/implementation inputs; lasting architecture/conventions must be promoted to canonical docs/ADRs rather than relying on an old spec forever.
- Linear: canonical actionable work.
- runbooks: repeatable operational processes.

Do not maintain a separate “for agents” restatement of human rules. Harness files route to the same canonical sources.

## ADRs

Use ADRs only for expensive-to-reverse governance/architecture decisions or rationale likely to be lost. Ordinary implementation choices do not need ADRs.

Once an ADR has materially informed implementation, preserve it as history. If the decision changes, add a superseding ADR and update the current architecture docs rather than rewriting the old decision as if it never existed. Typo/factual corrections are fine.

## Context

`CONTEXT.md` should remain small. Record canonical terms, important stable constraints/facts, and links to relevant architecture/ADRs. Do not turn it into a session transcript, implementation log, ticket board, scratchpad, or duplicate convention manual.

## Operational runbooks

Durable operational processes such as deployment, migrations, provider setup, recovery, and security procedures must be human-reproducible rather than existing only as “ask the agent”. Include applicable sections such as:

- outcome;
- prerequisites/permissions;
- required configuration/inputs;
- manual procedure;
- expected results;
- verification;
- failure recovery/rollback;
- security boundaries;
- automation equivalent;
- ownership/maintenance.

Omit irrelevant sections rather than adding boilerplate.

## Change discipline

When a PR changes documented architecture, conventions, public contracts, migrations, or operational procedures, update the relevant durable documentation in the same PR.
