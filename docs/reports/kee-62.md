# KEE-62 implementation and release preparation

[KEE-62](https://linear.app/keenko/issue/KEE-62/simplify-entity-hydration-ownership-and-eliminate-redundant) is the reusable guidance defect implementing the accepted follow-up to KEE-59 and ANO-16. Equivalent-issue searches found only the completed original guidance issue and adjacent work.

Keenko branch `kee-62` starts at fetched `origin/main`, `1e1646e`, the published 1.0.3 revision. Its isolated worktree preserves the original checkout's editor customization. Anoulà continues on `ano-16` from `3e5c21e`; the six existing uncommitted table-index/data/error edits remain uncommitted and unchanged.

## Ownership and examples

Canonical sources are `src/generators/sync/files/docs/conventions/schema-types.md` and `src/generators/sync/files/docs/conventions/backend-architecture.md`.

- Schemas own Entity representations, types and meaningful schema checks. They have no hydration functions or persistence dependencies.
- Features own `fooFrom(doc)`, required relation reads through data/features, Entity assembly and use-case orchestration.
- Data returns decoded `FooDoc`; domain owns pure business behavior.
- Constructors trust decoded internal values and assemble with `satisfies Foo`. No repeated runtime schema decoding is required for assembly.
- Loading a relation by its persisted ID establishes its identity. Do not add equality predicates, artificial Option results or failure branches for that fact.
- Genuine ownership/business invariants remain enforced. No generic framework or replacement loader is introduced.

The Admin example now directly loads User in `features/admins.ts`. Sync tests verify canonical document replacement and preserve project-owned code and overrides. A schema-derivation regression still verifies the source interval check and meaningful cross-Entity ownership check.

## Anoulà alignment

Moved `adminFrom`, `repFrom`, `establishmentFrom`, `businessMemberFrom`, `repAssignmentFrom`, `pickupRuleFrom`, `pickupItemFrom` and `orderIntentFrom` into their resource feature modules. The corresponding `sFoo` and `Foo` stay in schemas. OrderIntent callers now use its feature constructor directly.

Removed the five trivial actor/link predicates, the trivial ID clauses from the other three predicates, all eight schema-owned constructors and their Option return contracts, and OrderIntent's separate array-length/positional lookup failure path. Removed the four actor/link relationship defects and the Establishment artificial invalid-configuration branch. Valid absent lookups, missing required resources and meaningful configuration failures remain.

PickupRule/CapacityPool Establishment ownership, PickupItem/Offer Establishment ownership and OrderIntent basket Establishment ownership remain shared pure predicates enforced by both Entity schemas and feature construction. The new persisted-read regressions reject each conflict through the real M8 feature path. Source-schema checks remain preserved during Entity derivation, including PickupRule windows and OrderIntent lifecycle/answer/hold consistency. Existing authorization and M8 temporal, snapshot, idempotency, allocation and cancellation tests remain intact. No Anoulà migration, compatibility model or workflow redesign was added.

## Dependency refresh

Bun owns both lockfiles. Exact pins remain exact, existing ranges remain ranges, and both Anoulà patches remain intact. No dependencies were added for hydration. Discovery covered all 64 managed Keenko names including aligned root Nx JS, then repository-only dependencies and every Anoulà workspace.

| Package                   | Before          | Selected  | Repository |
| ------------------------- | --------------- | --------- | ---------- |
| `@cloudflare/vite-plugin` | `1.56.0`        | `1.63.0`  | Anoulà     |
| `@effect/platform-node`   | `4.0.1`         | `4.0.2`   | Keenko     |
| `@effect/tsgo`            | `0.48.1`        | `0.51.1`  | Both       |
| `@effect/vitest`          | `4.0.1`         | `4.0.2`   | Both       |
| `@inlang/paraglide-js`    | `2.25.4`        | `2.26.0`  | Both       |
| `@nx/devkit`              | `23.3.0-beta.9` | `23.3.0`  | Keenko     |
| `@nx/js`                  | `23.3.0-beta.9` | `23.3.0`  | Keenko     |
| `@nx/oxlint`              | `23.3.0-beta.9` | `23.3.0`  | Both       |
| `@nx/vitest`              | `23.3.0-beta.9` | `23.3.0`  | Both       |
| `@nx/workspace`           | `23.3.0-beta.9` | `23.3.0`  | Anoulà     |
| `@playwright/test`        | `1.63.0`        | `1.64.0`  | Both       |
| `@tanstack/intent`        | `0.5.4`         | `0.5.5`   | Both       |
| `convex-helpers`          | `0.1.124`       | `0.1.127` | Anoulà     |
| `effect`                  | `4.0.1`         | `4.0.2`   | Both       |
| `nx`                      | `23.3.0-beta.9` | `23.3.0`  | Both       |
| `oxlint`                  | `1.86.0`        | `1.87.0`  | Both       |
| `shadcn`                  | `4.21.1`        | `4.21.4`  | Both       |
| `smol-toml`               | `1.7.1`         | `1.9.0`   | Keenko     |
| `ultracite`               | `7.12.3`        | `7.12.4`  | Both       |
| `vite`                    | `8.3.2`         | `8.3.3`   | Both       |
| `wrangler`                | `4.136.1`       | `4.148.0` | Anoulà     |

Stable Nx 23.3.0 explicitly supports Vitest 5. The refreshed Effect/tsgo tuple patches Oxlint 1.87.0 successfully in both repositories. Cloudflare Vite plugin 1.63.0 requires Wrangler ^4.148.0, so Anoulà updates them together. Current installed direct versions, Node engines and 157 required peer relationships pass the Anoulà probe. Packed consumers verify required peers and isolated resolution.

TypeScript 6.0.3 retains the JavaScript API needed by Nx; the independent native alias stays `npm:typescript@7.0.2`. Node types stay on supported Node 24. WorkOS Node stays 10.14.0 because the AuthKit integrations exclude SDK 11. Stripe stays 22.6.2 to avoid an unrequested major upgrade. Registry discovery found no remaining same-major candidate drift outside these constraints.

## Release preparation

The native Nx prepatch plan `.nx/version-plans/version-plan-1791424105365.md` resolves 1.0.3 to **1.0.4-rc.0** in a dry run. The root manifest remains 1.0.3 until the release workflow owns the version transition. Nothing was publicly published or deployed.

The established N-1 policy now tests the unchanged published 1.0.3 source. The existing managed-dependency factory is re-anchored at `1.0.4-rc.0`; native Nx migration planning selects it for RC and stable targets. No new migration abstraction or copied historical dependency snapshot is introduced. The test-only expected dependency fixture and product documentation reflect the refreshed tuple. Historical release reports remain unchanged.

## Verification

Verification uses Node 24.21.0 and Bun 1.4.2. The initial shell Node 26 run failed the explicit Node 24 contract; supported-runtime runs supersede it. The renamed migration test is excluded from Bun and remains owned by Vitest.

Anoulà: `nx sync`, `nx sync:check`, codegen, format, lint, typecheck, tests, build and complete `bun run check` pass. The final aggregate uses `NX_SKIP_NX_CACHE=true`. Codegen is byte-stable, with no generated artifact changes. Focused Orders/persistence tests pass, and `git diff --check` passes. Lint reports tsgo unstable-API warnings without errors.

Keenko: complete `bun run check` passes, including 20 Bun tests, 160 Vitest tests, build/pack validation and release progression checks. Native plan verification and version dry run pass. Lint reports tsgo warnings without errors. The complete packed-product gate passes in 158.622 seconds for fresh creation and the unchanged published 1.0.3 forward upgrade. Both consumers prove canonical, packed and generated guidance equality, required peer compatibility, codegen/check, reinstall stability and sync idempotence. The local candidate is `1.0.4-rc.0-product.run-keenko-product-ao1AUA`. Verdaccio prints its existing shutdown message `Failed to start verdaccio: undefined` after completed phases; the gate exits successfully.

## Remaining release boundary

Keenko publication needs review, the established release workflow and explicit publication authorization. No branch was pushed and no PR was created or merged. Anoulà PR #14 stays unmerged and is linked to this thread.

Anoulà still pins published `keenko 1.0.3`. Its generated `.keenko` guidance remains exactly what that package owns, without a local reusable-guidance override. After the corrected package is published, upgrade to that exact version through native Nx/Bun, sync, codegen and complete verification. Anoulà's project architecture references KEE-62 and describes only its concrete Entity graph and ownership invariants. The published dependency upgrade and corrected generated guidance are pending that release.
