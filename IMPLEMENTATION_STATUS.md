# Implementation status

This branch is the pre-1.0 Keenko Playbook release candidate after the explicit convention audit and fresh-context defect review.

## Implemented

- core governance, security, verification, dependency, documentation, and code-style rules;
- audited schema/representation, backend, React/UI, TanStack, Paraglide, testing, migration, and generated-code conventions;
- procedural Keenko-owned Confect and Convex specialist skills;
- `effect-convex-web` preset with executable module dependency/skill requirements;
- transactional TypeScript/Bun installer/updater with strict config/lock validation, managed-block integrity, generated-skill retirement, rollback, and consumer-preservation checks;
- vendor adapters that preserve upstream procedures below Keenko authority while shipping the applicable upstream license and immutable provenance into every canonical/native copy;
- committed Matt Pocock, Effect, and pstack snapshots with pinned provenance and per-file integrity inventories;
- transactional vendor synchronization plus non-mutating pinned-upstream drift verification;
- pinned Bun/TypeScript toolchain, frozen dependency lock, typecheck, consumer integration tests, CI, changesets, and release preparation;
- machine-readable v1 release gate and a review-PR-first release workflow;
- publication-time TOCTOU protection: the release tag is pushed atomically with `HEAD:main` under a lease requiring remote `main` to still equal the reviewed `GITHUB_SHA`.

## Intentionally incomplete before v1

- The reviewed upstream Convex skills repository remains external because it does not declare a compatible redistribution license; the built-in `convex` adapter is the supported v1 discovery path.
- KEE-3 must close every P0-P2 fresh-context review finding and record evidence.
- KEE-4 still requires real Codex and Claude dogfood in Anoula.
- `release/v1-gate.json` intentionally remains pending until those evidence-producing gates pass.
