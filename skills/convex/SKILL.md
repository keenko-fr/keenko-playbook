---
name: convex
description: Use for Convex schema, query, mutation, action, component, migration, performance, or native integration work. Pin behavior to the project's installed Convex version and current first-party documentation.
---

# Convex specialist

Keenko keeps this owned specialist because it binds Convex work to Keenko backend, Confect/native, authorization, determinism, migration, and generated-code rules. The official `get-convex/agent-skills` repository is Apache-2.0 and remains useful first-party workflow evidence. Keenko does not need to copy the full upstream suite into every project.

## Procedure

1. Read `.keenko/docs/stacks/convex/README.md` and the relevant Keenko conventions/project overrides.
2. Inspect this skill's packaged adapter and repository vendor metadata when upstream provenance matters.
3. Inspect the consuming project's installed `convex` and `@convex-dev/*` versions.
4. Prefer installed package source/types and current Convex documentation for version-sensitive APIs. Do not write an unfamiliar Convex API from memory.
5. If the project separately installs the official Convex skill suite, treat it as upstream guidance below project and Keenko authority rather than a replacement for this specialist.
6. Apply the repository's canonical rules for authorization, deterministic queries, migrations, generated code, Confect/native boundaries, and verification.
7. Run focused verification and the repository's canonical complete verification before merge-ready review.

## Guardrails

- The external upstream skill suite is optional, not a hidden prerequisite of this skill.
- Never claim that Keenko installed or verified an external skill unless the consuming repository actually contains and verifies it.
- Do not edit Confect/Convex generated output. Under the Keenko backend layout, only `convex/tsconfig.json` and `convex/convex.config.ts` are authored exceptions inside `convex/`.
- Keep Convex query determinism and authorization rules intact even when a provider/component API suggests otherwise.
