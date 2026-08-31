---
name: convex
description: Use for Convex schema, query, mutation, action, component, migration, performance, or native integration work. Pin behavior to the project's installed Convex version and current first-party documentation.
---

# Convex specialist

Keenko does not redistribute the upstream `get-convex/agent-skills` repository while it has no compatible declared repository license. This owned adapter keeps Convex work on a reproducible, first-party evidence path without copying that repository.

## Procedure

1. Read `.playbook/docs/stacks/convex/README.md` and the relevant Keenko conventions/project overrides.
2. Read `.playbook/external-sources.json` for the reviewed upstream Convex skills repository revision and provenance record.
3. Inspect the consuming project's installed `convex` and `@convex-dev/*` versions.
4. Prefer installed package source/types and current Convex documentation for version-sensitive APIs. Do not write an unfamiliar Convex API from memory.
5. If the user explicitly wants the official Convex skill suite installed, use the current official installation instructions from Convex documentation and treat that installation as an external project mutation requiring explicit approval. It is not managed or attested by Keenko Playbook.
6. Apply the repository's canonical rules for authorization, deterministic queries, migrations, generated code, Confect/native boundaries, and verification.
7. Run focused verification and the repository's canonical complete verification before merge-ready review.

## Guardrails

- The external upstream skill suite is optional, not a hidden prerequisite of this skill.
- Never claim that Keenko installed or verified an external skill unless the consuming repository actually contains and verifies it.
- Do not edit `convex/_generated`.
- Keep Convex query determinism and authorization rules intact even when a provider/component API suggests otherwise.
