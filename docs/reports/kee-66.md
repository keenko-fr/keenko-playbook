# KEE-66: TypeScript conventions and 1.0.6-rc.0 preparation

[Linear KEE-66](https://linear.app/keenko/issue/KEE-66) was created before implementation after searching the complete Playbook issue list and focused TypeScript/1.0.6 queries. It is related to KEE-64 and KEE-65.

## Base and scope

GitHub confirms #61 merged at 2026-10-11 06:04:30 UTC as `4e53552b183f871e624926267e4351babb76209a` and #62 at 06:27:54 UTC as `15ff30dd1fd01d5a27de41fe41e1e6dfd591e76e`. Both commits are ancestors of the fetched main used to create the dedicated `kee-66` worktree. The original worktree's unrelated `.vscode/settings.json` edit is preserved.

Current human instructions outrank project overrides/docs and Keenko guidance. The accepted decisions replace only contradictory prior conventions. KEE-65 optional data, named domain imports, feature/data namespaces, semantic ownership, direct persistence and root transaction atomicity remain. No Anoulà application file changes.

## Canonical guidance

Generator sources under `src/generators/sync/files/docs/` own the synchronized documents:

- `core/code-style.md` prefers zero/one argument, with a clearly targeted resource identifier or small structural instance first and complementary payload/parameters second. Creation and operations without a main resource keep their natural input. Framework/library/technical signatures and private helpers retain their contracts.
- The same document owns alphabetical reading order for independent functions within groups, destructured parameters, object/type/Schema properties and textual vocabularies. Semantic groups, evaluation/initialization dependencies, business sequences, frameworks and formatter constraints take priority. No sorting infrastructure is added.
- `conventions/backend-file-topology.md` prefers public operations, final INTERNALS and final TYPES in ordinary business modules. Function argument types and Schema/vocabulary-derived or strongly owned types remain adjacent. Empty sections are omitted; helpers are not exported for presentation.
- Registered Confect internal functions retain their framework categories. Optional TypeScript INTERNALS/TYPES precede GROUP, which stays last. Hoisted functions, const/Effect.fn initialization and effective no-use-before-define policy remain respected. No presentation wrappers.
- Backend architecture, Schema/type placement, Confect, TypeScript, TanStack and tooling guidance now reference or follow those owners.

Inspection found Ultracite's existing blocking sort-keys rule. Root repository and fresh preset explicitly disable it to honor the nonmandatory preference. Existing consumer-owned lint configurations remain byte-identical through sync and migrations. Tooling guidance explains the explicit downstream root-rule/override reconciliation when an old consumer still enforces sorting. This is not an application-code migration.

## Dependency qualification

The existing updater inspected 64 managed packages, including root-aligned @nx/js. Selection uses stable registry candidates, the configured Nx next channel, exact compatibility holds, TypeScript's JavaScript-API role and the Node-24 type range. It updates canonical versions, matching repository slots and Bun's lockfile. Current-role fixtures are aligned to the selected tuple, preserving historical upgrade origins.

Updated versions:

| Package                  | Previous   | Selected   |
| ------------------------ | ---------- | ---------- |
| `@base-ui/react`         | `1.8.0`    | `1.9.0`    |
| `@confect/cli`           | `10.1.0`   | `10.2.0`   |
| `@confect/core`          | `10.1.0`   | `10.2.0`   |
| `@confect/server`        | `10.1.0`   | `10.2.0`   |
| `@confect/test`          | `10.1.0`   | `10.2.0`   |
| `@inlang/paraglide-js`   | `2.26.0`   | `2.27.0`   |
| `@tanstack/react-router` | `1.170.41` | `1.170.42` |
| `@tanstack/react-start`  | `1.168.60` | `1.168.61` |
| `@tanstack/router-cli`   | `1.167.40` | `1.167.41` |
| `@types/node`            | `24.19.1`  | `24.19.2`  |
| `convex-test`            | `0.0.60`   | `0.0.61`   |
| `lucide-react`           | `1.53.0`   | `1.55.0`   |
| `ultracite`              | `7.12.4`   | `8.0.0`    |
| `bun`                    | `1.4.2`    | `1.4.3`    |

Ultracite 8.0.0 retains byte-identical shipped Oxlint core and Oxfmt presets compared with 7.12.4, and the same imported export paths. Its Node >=22.18 and Oxfmt >=0.71 <1 requirements fit Node 24 and Oxfmt 0.72.0; unrelated Biome/ESLint/Prettier modes are not adopted. Confect's four packages move together to 10.2.0, whose peers accept the selected Convex/Effect baseline. Its canonical exact-version API guidance is updated and the real generated/registered behavior is qualified by the product fixtures.

Bun 1.4.3 is installed in a temporary qualification location and becomes the generated packageManager/reference runtime and the CI/release setup pin. The Bun range remains >=1.4.0 <2. Node 24.21.0 is the newest published Node-24 package observed; the supported >=24.15 <25 range remains. @types/bun 1.4.2 remains the registry's current package candidate.

Retained versions and material constraints:

| Family | Selected | Candidate / reason |
| --- | --- | --- |
| Effect core / platform-node / vitest | 4.0.2 | Integration 4.0.3 peers require effect ^4.0.3; exact npm lookup with online revalidation returns E404. The candidate platform import also fails on missing effect/socket/DatagramSocket. Keep the coherent available tuple. |
| @effect/tsgo | 0.51.1 | Current stable; its installed patch table supports Oxlint 1.87.0 and oxlint-tsgolint 7.0.2001/7.0.2003. |
| oxlint-tsgolint | 7.0.2003 | Candidate 7.0.2004 fails native prepare with UnsupportedTargetPackageVersionError. No patching bypass. |
| oxlint-plugin-effect | 0.27.1 | Candidate 0.28.1 adds blocking preferTaggedConstructors and diagnoses existing native tagged-state/test construction. Adoption would require an unrelated tagging convention/source rewrite; no suppression is added. |
| Nx, @nx/devkit/js/oxlint/vitest | 23.3.0 | Newest stable family; next reports older 23.3.0-rc.1. Preserve the qualified stable family and Vitest-5 support. |
| TypeScript JavaScript API | 6.0.3 | Latest 7.0.2 is the native compiler and lacks the JS compiler API needed by Nx/migrations. The separate native alias already stays on npm:typescript@7.0.2. |
| WorkOS Node SDK | 10.14.0 | SDK 11.0.0 is outside the installed AuthKit integrations' shared SDK-10 contract. |
| Oxlint / Oxfmt / Vitest | 1.87.0 / 0.72.0 / 5.0.3 | Current stable candidates, retained with the qualified compiler/Effect tuple. |

All other managed packages already match the selected registry candidates. The updater-owned manifests/lockfile rolled back after the unsupported native candidate; a frozen install restored the installed tree before retrying with explicit holds. No dependency update is qualified by installation alone.

## Release and migration consequences

The single existing native Nx prepatch plan is extended with KEE-66. Native plan checking passes and the complete Nx release dry run resolves 1.0.6-rc.0, previews the combined changelog/GitHub release and skips publication. The repository package version stays 1.0.5; Nx owns the future 1.0.6-rc.0 version/changelog/tag/publication. No second contradictory plan.

The existing 1.0.6-optional-data-coverage entry already invokes the backend-convention factory, including target managed-dependency convergence. It therefore distributes the qualified tuple for supported 1.0.5 consumers and the explicitly retained 1.0.4, 1.0.5-rc.0 and partial-recovery paths. No additional migration is needed. No code sorting, helper movement, signature or type/property migration is introduced. Instruction sync updates guidance while preserving consumer source and lint policy. Downstream application adaptation remains consumer-owned.

KEE-64 full verification still applies because this is a mixed guidance/preset/dependency/test change. Workflow changes only align the Bun runtime pin. Live ruleset 22343266 still requires GitHub Actions check with strict required statuses; the Release App remains the sole existing bypass. No routing, evidence reuse, protection or publication contract changes.

## Validation

Local qualification uses Node 24.21.0 and Bun 1.4.3, without changing the machine's default runtimes.

- Frozen repository installation passes with no lockfile drift. The 24 focused dependency-updater tests pass.
- `NX_SKIP_NX_CACHE=true bun run check` passes formatting, lint, native typecheck, 35 Bun tests, 233 Vitest tests, uncached build/pack and release-version scenarios.
- `bun x nx release plan:check` passes. `bun x nx release --dry-run --skip-publish --preid rc` resolves 1.0.6-rc.0, retains the combined plan and skips publication.
- `bun run test:product` passes all acceptance phases in 510 seconds using the isolated 1.0.6-rc.0-product candidate: fresh creation, actual generated lint/type configuration, byte-identical canonical/packed/synchronized guidance, codegen, normal/frozen reinstall and sync/migration idempotence. Native migrations pass from current stable 1.0.5 and retained 1.0.4/1.0.5-rc.0, plus partial-recovery rejection without factory writes and successful repair.
- The Confect fixtures compile and execute resource-first two-argument data/feature operations, preserve adjacent argument types/final private helpers, prove a persisted patch, reject unauthorized publication without a write and retain root rollback. Deliberately unordered object/type properties, Schema literal vocabulary and destructured arguments pass the fresh generated lint policy.
- `git diff --check` passes and final scope review preserves the original worktree edit. CI evidence belongs to the dedicated PR and is distinct from these local checks.

Existing Effect unstable-API and typed-Schema-decoder warnings are non-failing. Bun's duplicate TypeScript manifest warning is unchanged. The existing Verdaccio shutdown messages, including “Failed to start verdaccio: undefined”, occur after all acceptance phases; the outer product command exits 0 after cleanup. No suppressions or compatibility bypasses are introduced.

## Delivery boundary

The PR stops at Reviewer. No main merge, public npm publication, release workflow dispatch or Anoulà application acceptance is performed. Exact public 1.0.6-rc.0 installation and dist-tag convergence belong to publication after separate human authorization.
