# Testing

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
