# Verification

## Test philosophy

Prefer observable behavior through the same stable interfaces applications use. Tests should survive persistence/provider refactors.

- Direct data-layer tests are exceptional: index/query semantics, patch encoding, persistence-only invariants, serialization, or defects isolated specifically to persistence.
- Use TDD when behavior can be meaningfully exercised: defects, state transitions, algorithms, contracts, and regressions. Do not force red-green-refactor around generated code, formatting, trivial wiring, or declarative configuration where it adds no value.
- A reproducible bug fix should include regression evidence when practical.
- Test outcomes, persisted state, authorization, rendered behavior, provider requests, and observable side effects rather than internal call counts unless the interaction itself is the contract.
- Mock/fake at genuine external/provider seams; keep real application orchestration behind the seam.
- Do not export private helpers or widen production APIs solely for tests.
- Prefer explicit assertions; use snapshots only when the serialized/rendered structure itself is genuinely the reviewable contract.
- Time/randomness/expiry must be controllable. Avoid real sleeps and wall-clock-dependent tests.
- A flaky test is a defect. Do not hide it permanently with retries, sleeps, widened windows, or skips.
- No global coverage percentage is mandated; meaningful behavior, invariants, failure paths, and changed code matter more.

## Authorization and failure matrices

Security-sensitive interfaces should cover representative caller states (unauthenticated, wrong role, right role, owner/non-owner, expired/revoked where relevant) and adversarial cases such as duplicates, reordering, retries, provider outage, partial failure, invalid input, stale state, and idempotent replay.

## During implementation

Each implementation slice runs the smallest focused verification proving its outcome and reports exactly what ran. Typical evidence includes focused tests, relevant package typecheck, a focused build, or explicit manual/provider verification when genuinely necessary.

For TypeScript changes, format/fix the touched scope and run focused lint/type/tests as appropriate. Safe formatter/linter fixes are implementation tools, not verification evidence until their diff has been inspected.

Manual verification is evidence, not a replacement for automatable behavior tests.

## Merge boundary

Focused checks do not replace the repository's canonical complete verification. Keenko TypeScript repositories expose a non-remediating `bun run check`; it is the canonical merge-ready aggregate. Its applicable stages run in this conceptual order:

1. Nx synchronization/drift checks;
2. code generation/drift checks;
3. `format:check`;
4. `lint`;
5. `typecheck`;
6. tests;
7. builds;
8. project-specific delivery/security checks.

`check` must not rewrite tracked source. `nx sync:check` detects registered sync-generator drift without applying it. Generated-code drift verification may regenerate into a disposable workspace and compare output, but a green check proves the submitted tree was already valid.

Generated contract changes require deterministic regeneration verification.

Real-provider staging verification is separate from automated fake/mock integration tests when a provider contract materially matters.

## Reporting and review

Report checks as `passed`, `failed`, `not run`, or `not available`; never infer success from inspection.

After complete verification, use defect-first independent review in a fresh context when practical. Findings must be concrete, introduced by the change, and actionable. Do not manufacture style findings. Human merge approval remains separate.
