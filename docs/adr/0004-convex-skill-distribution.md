# ADR 0004: Keenko owns the discoverable Convex specialist

## Status

Accepted. Reconciled under KEE-14 before the first stable baseline.

## Context

Keenko prefers current first-party Convex guidance for version-sensitive behavior. The official `get-convex/agent-skills` repository now declares Apache-2.0 licensing, so licensing is no longer the reason Keenko keeps its own specialist.

Keenko still needs project-specific behavior that the upstream suite cannot own: the Confect/native boundary, Keenko generated-code ownership, authorization and determinism rules, project authority, and the requirement to verify installed source/types before writing unfamiliar APIs.

## Decision

- Keep the reviewed upstream Convex revision in `vendor/sources.json` as external provenance with its declared Apache-2.0 license.
- Do not automatically install or redistribute the complete upstream suite in the default Keenko project.
- Ship the Keenko-owned `convex` specialist in both supported harness trees. It routes agents to installed Convex source/types, current first-party documentation, Keenko backend/Confect rules, and the pinned upstream provenance record when useful.
- A project may install the official Convex suite separately when a human deliberately chooses it. That external installation does not replace Keenko authority.
