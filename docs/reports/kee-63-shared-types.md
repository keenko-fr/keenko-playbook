# KEE-63 backend/shared type scope and RC recovery

The owner explicitly extends the ordinary type preference to `packages/backend/**/*.ts` and `packages/shared/**/*.ts`. This supersedes rc.0's backend-only scope. [KEE-63](https://linear.app/keenko/issue/KEE-63/adopt-the-confect-first-backend-convention-vnext) records this decision. Other backend architecture, file grammar and Effect policies retain their existing scope.

## Implementation

The fresh preset keeps the existing backend Effect override and adds a common override containing only `typescript/consistent-type-definitions: off`. Canonical code-style, tooling and migration guidance describe that scope. UI/applications retain their effective policy.

The native factory prevalidates compiler and every relevant lint override before managed-dependency or configuration writes. It accepts common or separate overrides, preserves their bytes and Effect rules, and adds only missing type-policy coverage. Existing numeric/array/string off severities are preserved. Contradictory severities, dynamic rule sources, excluded policy coverage and unrecognized configuration fail with manual reconciliation instructions. The earlier TypeScript exclusion guard remains intact.

The complementary `1.0.5-backend-shared-types` entry at `1.0.5-rc.1` points to the corrected backend-convention factory. Reusing full idempotent reconciliation repairs both already-migrated rc.0 consumers and cases where planning/install advanced the package but the previous factory failed. No empty wrapper or new migration infrastructure is introduced. Stable 1.0.4 selects both rc.0 and rc.1 entries; published rc.0 selects only the complementary entry. Forced `--from=keenko@1.0.4` planning also works when rc.1 is already installed.

No dependency versions or compatibility pins change. The root package remains rc.0; the native `prerelease` version plan prepares rc.1. No Anoulà source, public registry publication, release dispatch or merge is performed.

## Verification

Use Node 24.15.0 and Bun 1.4.2, within the supported ranges.

- Frozen repository install passes without manifest/lock changes.
- Native Nx planning tests pass: 7 scenarios, including both origins, stable target, forced recovery and an already-installed target.
- Focused migration tests pass: 47 tests, including common/separate overrides, existing off severities, Effect/customization preservation, ambiguous/conflicting shared policies and refusal without writes.
- `bun run check` passes (exit 0): formatting, lint, native typecheck, 25 Bun tests, 207 Vitest tests, package check and release-version guard. Lint has zero errors and 324 non-blocking unstable-API warnings, compared with 321 before this change. The three added diagnostics are existing Effect test/FileSystem/Path APIs used by new coverage; no rules are suppressed.
- `bun run test:product` passes (exit 0), with verification phases completed in 363.628s: fresh creation, direct upgrades from unchanged published 1.0.4 and rc.0 archives, and real partial-migration recovery to the local packed rc.1 candidate. Development reruns corrected temporary probe directory setup/cleanup and narrowed the partial fixture to a common type-policy override, without extending backend Effect policy to shared or changing consumer source.
- Verdaccio emits its existing stopped-registry teardown message after completed product phases; the process exits 0.
- Effective policy probes run actual Oxlint in backend/shared and UI/application scopes. Each upgraded consumer repeats Confect generation, compiler coverage, compatibility, check/build, dependency preservation, reinstall/lock stability and sync/migration idempotence.
- Packaged recovery guidance matches canonical source in the fresh local candidate.
- Native full Nx Release dry run passes: the prerelease plan resolves 1.0.5-rc.1, previews changelog/GitHub release, skips publication and leaves package.json at rc.0. Formatting and `git diff --check` pass. The native `nx release plan:check --stdin` passes for the staged change set. CI results are tracked on the new PR.

## Anoulà recovery after authorized publication

The exact procedure is shipped in [canonical migrations guidance](../../src/generators/sync/files/docs/core/migrations.md#105-rc-scope-and-partial-recovery). It requires no split of Anoulà's common override.

Save the current project state and old migration plan first. Preserve any unrelated pending migrations when reviewing the regenerated plan. After rc.1 is publicly available, run from Anoulà's root:

```sh
bun x nx migrate keenko@1.0.5-rc.1 --from=keenko@1.0.4
bun install
# Review migrations.json: backend-convention rc.0, then backend-shared-types rc.1.
bun x nx migrate --run-migrations
bun install
bun x nx sync
bun run codegen
bun run check
bun install --frozen-lockfile
```

Both factories resolve from the newly installed package. A failed previous factory need not be treated as a completed upgrade solely because package.json or bun.lock already changed during planning/install. Replaying the corrected entries preserves application modules and custom Effect overrides. Explicit contradictions must be reconciled manually before a rerun. Verify a second migration/sync/frozen install leaves manifests, configuration, lockfile and helpers unchanged.

Before publication, npm cannot install the new RC. The local product gate qualifies the same native procedure against its isolated packed candidate. Final independent review and authorized publication remain required.
