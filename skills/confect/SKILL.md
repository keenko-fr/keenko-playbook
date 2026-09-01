---
name: confect
description: Use when changing Confect specs, implementations, refs, codegen, or boundaries between Confect, Effect, Convex, and TanStack. Inspect installed versions and apply the canonical Keenko docs rather than relying on remembered APIs.
---

# Confect specialist

Use this workflow for `@confect/*`, Confect specs/implementations/refs/codegen, or Confect/native Convex/client boundaries.

## Procedure

1. Read the repository authority chain and project context first.
2. Read the canonical rules that own this work:
   - `.playbook/docs/stacks/confect/README.md`
   - `.playbook/docs/stacks/effect/README.md`
   - `.playbook/docs/stacks/convex/README.md`
   - `.playbook/docs/conventions/backend-architecture.md`
   - `.playbook/docs/conventions/backend-file-topology.md`
   - `.playbook/docs/conventions/schema-types.md`
   - `.playbook/docs/conventions/validation.md`
3. Read project architecture/overrides and relevant ADRs.
4. Inspect the exact installed Confect, Effect, and Convex versions.
5. For version-sensitive behavior, inspect installed package source/types and current first-party documentation before choosing an API.
6. Identify the owning boundary (`confect`, `schemas`, `features`, `data`, `infra`, browser Form, serverFn, or native Convex integration) before editing.
7. Implement the narrowest change that satisfies that boundary while preserving the canonical rules above.
8. Run focused verification for the changed contract, codegen when contracts changed, then the repository's complete verification before merge-ready review.

## Guardrails

- Do not restate or invent Confect architecture inside this skill; the canonical docs above are authoritative.
- Do not wrap generated Confect or native Convex APIs merely to rename them.
- Do not guess prerelease APIs from memory.
- Do not edit generated code.
- Do not claim verification that was not run.
