# Testing

Vitest is the canonical general test runner. Keenko registers `@nx/vitest` so each workspace's `vitest.config.ts` supplies an inferred Nx `test` target, and the root `bun run test` delegates to `nx run-many -t test`. A fresh scaffold may have no authored tests yet; `passWithNoTests` keeps that honest baseline executable without manufacturing ceremonial tests.

- `apps/web` and `packages/ui` use the `jsdom` environment with Testing Library's DOM and React utilities for ordinary component and behavior tests. Browser automation, Playwright, browser downloads, and Vitest Browser Mode are feature-driven additions, not baseline dependencies.
- `packages/shared` uses the ordinary Node Vitest environment without React or browser assumptions.
- `packages/backend` uses the Node environment for ordinary tests colocated with their authored owners. Assembled backend integration tests live under `packages/backend/test/` and use the Edge Runtime environment; author `test/TestConfect.ts` and `test/*.test.ts` when real behavior requires them. For Confect-owned application functions, prefer generated Confect refs through [`@confect/test`](https://confect.dev/guides/testing); it wraps `convex-test` with Effect-native APIs. The generated `convex/` modules are loaded by the test layer and remain generator-owned rather than becoming an authored test location.
- Direct `convex-test` usage remains appropriate when a genuinely Convex-native boundary owns the behavior. A Convex simulation is not the default for the rest of the backend, and real-provider or staging verification remains separate when runtime fidelity materially matters.

- Prefer behavior tests through the highest meaningful stable application interface.
- Direct data-helper tests are reserved for persistence-specific semantics that are not better observed through the feature interface.
- Use TDD for meaningful behavior/defects/contracts, not as ceremony around generated/config/trivial glue.
- Bug fixes include regression evidence when practical.
- Mock external/provider seams, not internal feature/data collaborators merely to shrink a test.
- Prefer real framework integrations such as Convex test infrastructure where practical.
- Cover authorization caller matrices and adversarial/replay/failure cases for sensitive workflows.
- Control clock/randomness/expiry; do not use real sleeps as test design.
- Do not expose implementation internals solely for tests.
- Prefer explicit assertions over broad snapshots.
- Flakiness is a defect, not a reason for permanent retries.
- Focused verification proves each implementation slice; canonical full verification still runs before merge-ready review.
- Real-provider staging verification complements mocked automated tests when provider contracts materially matter.

See `.keenko/docs/core/verification.md`.
