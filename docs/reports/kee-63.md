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

## Installed behavior at efd135b

Verification used Node 24.15.0 and Bun 1.4.2. The ordinary shell resolves Node 26, which is outside Keenko's supported range; checks used an explicit local Node 24 PATH.

The consumer installed Effect 4.0.2 and Confect 10.0.0. Codegen and native typechecking accepted the exact canonical domain and error-family examples, including spec-safe error imports. Consumer lint accepted ordinary backend type contracts.

TestConfect proved a direct feature insertion rolls back when a typed Failure escapes the root mutation. Native SchemaError, expected Failure and Defect channels remained distinct. Existing registered-reader field validation and cardinality tests remain intact.

Installed source confirms the plain Struct system-field path uses fieldsAssign and can lose outer checks; other AST paths can preserve them. The guidance distinguishes that path and requires meaningful invariants through the real persistence/operation boundary. The separate checked-schema regression still rejects invalid source intervals and independent owner mismatches.

Additional probes verified the documented system-field API, structural pick/omit/evolve/fieldsAssign operations and optionalKey/optional behavior. Installed Oxlint accepted the canonical hoisted helper under the stricter root options and rejected a later const helper. All backend documentation/template separators measured exactly 140 characters.

## Initial convention verification at efd135b

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

## Release preparation for 1.0.5-rc.0

The owner reported independent APPROVE for the initial change; GitHub CI on `efd135b` is green. The changes below require a new review. Commit `879d51b` replaces obsolete test-guide vocabulary with ownership by Confect, features, pure domain behavior and justified direct persistence tests.

### Dependency qualification

`bun run deps:update` completed on 2026-10-09 and discovered 64 managed packages, including the aligned root Nx package. The selected updates retain exact pins:

| Packages | Previous → selected | Qualification |
| --- | --- | --- |
| @confect/cli, core, server, test | 10.0.0 → 10.1.0 | Qualify the family together. CLI/server require Effect ^4.0.1, satisfied by 4.0.2; core accepts Convex ^1.32.0, satisfied by 1.46.0. Installed reader, codegen, specs, runners and rollback are checked in both consumers. |
| @tanstack/react-table | 9.2.6 → 9.2.8 | Patch updates table-core/tree shaking and types; React >=18 and Node >=20 accept the existing tuple. |
| lucide-react | 1.52.0 → 1.53.0 | Icon additions/fixes; React 19 remains supported. |
| vite | 8.3.3 → 8.3.4 | Build/HMR fixes; Node 24 and Vitest 5 peers remain supported. Root manifest/lock and generated application baseline agree. |

The Nx family remains 23.3.0; the next-channel candidate is not adopted. TypeScript remains 6.0.3 because native compiler 7 does not replace the JavaScript compiler API needed by Nx and migrations. `@typescript/native` stays `npm:typescript@7.0.2`. Oxlint 1.87.0 retains its qualified Effect-tsgo native patching tuple. WorkOS SDK 11 remains excluded by both AuthKit integrations; SDK 10.14.0 and the existing AuthKit test-entrypoint patch remain. Effect 4.0.2, tsgo 0.51.1, Convex 1.46.0 and the remaining TanStack/AuthKit packages are unchanged. Bun alone refreshed `bun.lock`, including Vite's PostCSS transitives.

Primary release evidence: [Confect CLI](https://github.com/rjdellecese/confect/releases/tag/%40confect%2Fcli%4010.1.0), [Table](https://github.com/TanStack/table/releases/tag/%40tanstack%2Freact-table%409.2.8), [Lucide](https://github.com/lucide-icons/lucide/releases/tag/1.53.0), [Vite](https://github.com/vitejs/vite/releases/tag/v8.3.4). Exact registry manifests and shipped Confect source were inspected as well.

Confect 10.1.0's shipped `SystemFields` uses `mapFields`/`mapMembers` with `unsafePreserveChecks: true`. The canonical guide and registered-reader regression now reflect preservation of outer checks, replacing the obsolete 10.0.0 plain-Struct caveat. Independent business and cross-resource checks remain required.

### Native migration and N-1 proof

`1.0.5-backend-convention` at `1.0.5-rc.0` prevalidates compiler/lint configuration before reusing `1.0.4-managed-dependencies`. It adds domain/errors compiler includes and the backend-only type-definition override through targeted text edits. It preserves existing data includes, custom options/comments, unrelated workspaces/dependencies, lock ownership and all application source. Customized rules, computed/duplicate overrides, excluded owners or malformed configuration fail with manual reconciliation instructions before this migration writes. Reruns are byte-stable. The old metadata/factory remains for its real dependency responsibility and historical boundary.

The sole full supported upgrade originates from the unchanged published stable package named by `tests/fixtures/upgrade-source.json`, currently 1.0.4. Bootstrap Nx derives from that archive's exact devkit dependency. Native planning selects only the new entry for RC and stable targets. Historical 1.0.3 → 1.0.4 planning tests remain, without widening the supported product window.

Frozen published compiler/lint fixtures seed focused migration tests. Vitest's stale 1.0.3 test path is corrected, and Bun excludes the new Vitest suite. The product gate checks all 76 managed dependency slots and ten canonical/packed/generated guidance files. The upgraded consumer repeats Confect compatibility; negative domain/errors compiler probes prove coverage. Reinstall, sync and actual migration reruns compare configuration and the original data helper as well as manifests and lock state.

### Release checks

- Frozen install and full `bun run check` pass on Node 24.15.0 / Bun 1.4.2: 22 Bun tests and 174 Vitest tests, including 14 focused migration tests.
- Native plan checking passes. Full `nx release --dry-run --skip-publish --preid rc` resolves 1.0.5-rc.0, renders the plan's changelog/GitHub release and makes no writes or publication. Root package version remains 1.0.4.
- Existing release verification passes for RC/stable versioning, changelog ownership, `rc`/`latest` dist-tags, the publication waiter and exact/tag-selected published-product commands. Release workflow remains manual; stable promotion derives the version from the accepted RC and refreshes no dependencies.
- Full `bun run test:product` passes in 267.709 seconds, including published 1.0.4 → local `1.0.5-rc.0-product.<run-id>`, native migration, Confect generation/registered checks, compilation, lint, tests, build, foreign dependency preservation, frozen/ordinary reinstall and byte-stable sync/migration reruns. The new factory is present in the packed package and selected by Nx.
- Final formatting and `git diff --check` pass. Product teardown emits the existing Verdaccio shutdown diagnostic after all phases complete; the gate exits 0.

Lint reports 321 warnings versus the initial 314. Five new unstable-API diagnostics belong to the migration test suite and two to the product compiler probes; the migration implementation introduces none. No warning policy was suppressed to hide the difference.

## Second-review correction: TypeScript exclusions

The owner reported one Major finding against `edc0518`: recursive exclusions such as `["**/domain/**", "**/errors/**"]` escaped prevalidation. Adding includes while keeping those exclusions could leave the new modules unchecked.

The migration now uses the existing minimatch dependency to detect possible overlap with domain/errors directories or their descendants. It normalizes relative paths and Windows separators, reproduces TypeScript's implicit recursive directory globs (including `.` and `..`), and treats unsupported glob syntax as literal. Case-insensitive matching covers portable consumer configuration; absolute paths and possible descendant exclusions require explicit manual reconciliation. The error identifies the offending exclusion. No exclusion is removed.

Compiler/lint prevalidation still finishes before dependency or configuration writes. Regression snapshots compare the complete Tree, including every configuration/manifest, the Bun lockfile, application modules and custom compiler/dependency state. The reported pair, wildcard directory names, broad/file-specific globs, ancestor paths, separators, case and absolute ambiguity are covered. Unrelated exclusions remain byte-identical, and the standard migration/rerun scenarios remain covered. Installed TypeScript's exclusion matcher independently confirms the recursive and ancestor cases.

Verification uses Node 24.15.0 / Bun 1.4.2:

- Both focused migration suites pass: 36 tests.
- Final `bun run check` passes, exit 0: formatting, lint, native typecheck, 22 Bun tests, 196 Vitest tests, build/pack and release verification. An earlier run failed on a temporary-directory ENOENT in a release fixture; the isolated rerun completed all gates.
- Final `bun run test:product` passes in 152.401 seconds, exit 0: real published 1.0.4 → locally packed 1.0.5-rc.0 candidate, native Nx migration, managed dependency/customization checks, guidance sync, Confect generation, compilation, lint, tests, build, lock/reinstall stability and second sync/migration idempotence. Existing Verdaccio shutdown noise follows all completed phases.
- Lint remains at 321 warnings. No dependency, compatibility pin, migration catalog, runtime business module or convention decision changes.

The final targeted review is required before the human merge and authorized release. CI evidence is attached to PR #58's current head; public candidate acceptance remains a post-publication step.

## Review and consumer adoption

Changes are prepared on branch `kee-63` for renewed review of PR #58. CI and approval history are recorded on PR #58. The second review's corrective commit requires final targeted Reviewer acceptance; PR checks track its final-head CI. Public publication, merge, deployment and Anoulà adaptation are separate steps. The live shadcn smoke and public 1.0.5-rc.0 acceptance are not run before publication.

After publication, Anoulà must regenerate package-owned guidance, reconcile project/Linear decisions, then adapt its runtime under Coder Anoulà and Reviewer. ANO-16 product decisions and established authorization, allocation, replay and cross-resource invariants remain authoritative.

Sync preserves application-owned files. Native Nx now handles recognized lint/compiler configuration; customized configurations require reconciliation. Consumers move their own data helpers during their runtime adaptation. This change does not automate that source migration.
