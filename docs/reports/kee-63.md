# KEE-63 backend convention verification

[KEE-63](https://linear.app/keenko/issue/KEE-63/adopt-the-confect-first-backend-convention-vnext) records the Backend Convention vNext supplied and validated by Anoulà's owner. It was created before repository edits after duplicate searches, and is related to KEE-59, KEE-62 and ANO-16.

The local `kee-63` worktree starts at `9898567`, the published 1.0.4 revision. The original main checkout remains clean.

## Canonical changes

The six requested sources now describe one Confect-first architecture:

- [Backend architecture](../../src/generators/sync/files/docs/conventions/backend-architecture.md) permits direct impl/feature persistence and extracts responsibilities on demand.
- [Backend file topology](../../src/generators/sync/files/docs/conventions/backend-file-topology.md) preserves 140-character separators, puts local details below their operation and retains final Confect GROUP assembly.
- [Schema types](../../src/generators/sync/files/docs/conventions/schema-types.md) makes representations/enrichment optional and preserves meaningful cross-resource and trust-boundary checks.
- [Validation](../../src/generators/sync/files/docs/conventions/validation.md) distinguishes SchemaIssue/native SchemaError, typed Failure and Defect through Effect.die.
- [Code style](../../src/generators/sync/files/docs/core/code-style.md) owns contextual names, CRUD/check verbs, feature/domain namespaces, zero-or-one-argument exports and narrow type ownership.
- [Tooling](../../src/generators/sync/files/docs/core/tooling.md) explains the backend-scoped type-definition override and existing-consumer adoption.

Confect/Effect stack guidance and the generated Confect skill use the same rules. The incompatible KEE-59/KEE-62 prescriptions are explicitly superseded, including in the historical KEE-62 report.

The fresh preset moves technical helpers to `features/confect.ts`, removes its former data asset and includes domain/errors in the backend compiler project. Identity/AuthKit local details follow their owner. Existing interfaces and public contracts retain their behavior.

The generated backend disables only `typescript/consistent-type-definitions` in `packages/backend/**/*.ts`. Other workspaces retain their policy. Root declaration-order options permit hoisted functions/types; the existing backend override remains unchanged.

## Installed behavior

Verification used Node 24.15.0 and Bun 1.4.2. The ordinary shell resolves Node 26, which is outside Keenko's supported range; checks used an explicit local Node 24 PATH.

The consumer installed Effect 4.0.2 and Confect 10.0.0. Codegen and native typechecking accepted the exact canonical domain and error-family examples, including spec-safe error imports. Consumer lint accepted ordinary backend type contracts.

TestConfect proved a direct feature insertion rolls back when a typed Failure escapes the root mutation. Native SchemaError, expected Failure and Defect channels remained distinct. Existing registered-reader field validation and cardinality tests remain intact.

Installed source confirms the plain Struct system-field path uses fieldsAssign and can lose outer checks; other AST paths can preserve them. The guidance distinguishes that path and requires meaningful invariants through the real persistence/operation boundary. The separate checked-schema regression still rejects invalid source intervals and independent owner mismatches.

Additional probes verified the documented system-field API, structural pick/omit/evolve/fieldsAssign operations and optionalKey/optional behavior. Installed Oxlint accepted the canonical hoisted helper under the stricter root options and rejected a later const helper. All backend documentation/template separators measured exactly 140 characters.

## Results

| Check | Result |
| --- | --- |
| Frozen repository install | Passed; manifest/lock unchanged |
| Focused preset/sync tests | 98 passed |
| Complete bun run check | Passed: formatting, lint, native typecheck, 20 Bun tests, 160 Vitest tests, build/pack and release checks |
| Packed product | Passed in 136.292 seconds |
| Canonical/packed/generated equality | All six conventions, two stack guides and Confect skill match in fresh and upgraded consumers |
| Fresh topology | New helper present; former data helper absent from generated tree and packed preset |
| Native upgrade/reinstall/sync | Configured published 1.0.3 origin passes; resolution, frozen/ordinary lock stability and idempotence pass |
| Native Nx plan check | Passed |
| Native Nx version dry run | Resolves 1.0.5-rc.0 from the prepatch plan; manifest unchanged |
| git diff --check | Passed |

Oxlint/Effect tooling emitted 314 nonblocking warnings, mostly unstable-API diagnostics. The live shadcn option and a separate published 1.0.4-origin upgrade were not run; the complete configured product gate used its existing unchanged 1.0.3 source fixture.

## Review and consumer adoption

Changes are prepared on branch `kee-63` for pull-request review. CI and independent Reviewer acceptance remain pending. Public publication, merge, deployment and Anoulà adaptation are separate steps.

After publication, Anoulà must regenerate package-owned guidance, reconcile project/Linear decisions, then adapt its runtime under Coder Anoulà and Reviewer. ANO-16 product decisions and established authorization, allocation, replay and cross-resource invariants remain authoritative.

Sync preserves application-owned files. Older consumers must explicitly adjust their backend lint/compiler configuration when adopting the convention, and move their own data helpers during their runtime adaptation. This change does not automate that source migration.
