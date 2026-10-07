# KEE-60 N-1 migration support qualification

## Authority and release scope

[KEE-60](https://linear.app/keenko/issue/KEE-60/define-n-1-migration-support-and-retire-unsupported-historical-upgrade) defines the default direct-support window as immediately preceding stable → current stable. Prereleases are not permanent origins. Older stable versions are outside that window; sequential historical recovery has no default guarantee. A release may explicitly widen the window. New projects start current. Native Nx owns migrations, Bun owns the lockfile, and migration code exists only for persisted-state transformations.

Implementation began on a fresh `kee-60` branch from fetched `main` at `a5ff3ca3c8c908376a87912389cbaa1306594f23`, after reading the accepted issue and measuring that unchanged tree. KEE-58 was already merged. The root remains `1.0.2`; the existing `.nx/version-plans/kee-58.md` prepatch plan also owns this change and resolves the next `1.0.3` RC line. No duplicate plan, publication or merge is required by this implementation.

## Product origin matrix

| Product source | Before consumers | After consumers | Current direct support |
| --- | --: | --: | --- |
| Published `1.0.1`: untouched, divergent, renamed, multiple apps | 4 | 0 | Outside the window |
| Published `1.0.2-rc.0` through `rc.3` | 4 | 0 | No permanent prerelease origin |
| Published stable `1.0.2` | 1 | 1 | Supported source for the `1.0.3` line |
| Fresh packed candidate | 1 | 1 | Current generation authority |

Upgrade consumers fall from nine to one, and historical Keenko source versions from six to one. No unsupported-origin fixture remains as an exception. Historical releases, changelogs, reports and tags remain unchanged.

The supported source is the public npm artifact, served unchanged through the disposable registry. Its SHA-512 matches npm's published integrity and the local registry tarball:

```text
sha512-AM+KN2Ia9q/70pYVE9Ya4dJjKZqTwkLcQKW6anRu70MIbWlCQgIOaf4nnGZfVhLMkp92U2UNmDs/G13ien6tHw==
```

The initial canonical-only passing candidate was `1.0.3-rc.0-product.run-keenko-product-Vcjucm`. Only its temporary archive version differs from the ordinary repository pack. This is a local test artifact, not a published release.

## Migration surface audit

Installed Nx `23.3.0-beta.9` selects generator boundaries strictly above the installed source and at or below the target. The native Migrator now selects `1.0.3-managed-dependencies` at `1.0.3-rc.0` for both RC and stable targets from `1.0.2`. Root-only packageJsonUpdates cannot restore nested slots or relocate existing slots. A focused current migration is therefore required by KEE-14's accepted managed-dependency ownership contract, even though untouched source manifests already match the tuple.

All nine former entries and the rc.4 packageJsonUpdates group remain removed. Metadata contains only the new current entry, pointing to `./dist/migrations/managed-dependencies-1-0-3`. No historical RC chain, synthetic plan or compatibility alias returns. The factory reads the current target package's preset maps and packageVersions. N-1 sources select this boundary throughout the target line, so no immutable historical tuple is required. It validates all manifests/classifications before mutation, stages changed manifests through native Nx formatting and leaves the lockfile to Bun.

The historical `src/migrations/` contents are retired: seven factories, their seven test files and nine migration-only assets. The factories are:

- `application-workspaces-1-0-2`
- `backend-vitest-exclusions-1-0-2`
- `dependency-baseline-1-0-2` (also used by application-dependency and Effect-policy entries)
- `bun-linker-1-0-2`
- `authkit-test-1-0-2` (historical wrapper only)
- `effect-testing-baseline-1-0-2`
- `compatibility-baseline-1-0-2`

The nine assets are the three dependency/effect-testing/compatibility JSON snapshots, two frozen application AuthKit tests, one frozen backend Vitest config, two frozen Oxlint configs and one drift-check fixture. Import/call-site tracing found no current preset, sync or runtime caller of the deleted factories or frozen assets. The current AuthKit installer and patch are separate and remain unchanged.

Generic native migration plumbing remains: `package.json#nx-migrations`, packaged `migrations.json`, Nx dependencies, TypeScript compilation and generic asset copying. Metadata exposes the focused current factory required for supported convergence. Package metadata and build configuration are unchanged.

## Current verification owners

The detailed per-invariant audit is in [Product acceptance ownership](../packed-product-test.md#verification-ownership-after-kee-60). Coverage is retained or retired according to the behavior's current owner:

- The real stable source owns the supported native lifecycle, consumer dependency preservation, lock ownership, installed resolution, backend discovery, root target orchestration, reinstall stability, sync idempotence and KEE-58 Context7 adoption.
- Fresh generation remains authoritative for current generated shape, exact dependency roles, strict Nx bootstrap alignment, isolated installation, Confect compatibility, deterministic shadcn, packed assets and first-install verification.
- The existing module-boundary fixture now uses renamed `portal` plus sibling `admin`, with no `apps/web`. It checks actual project roots, native inferred Vitest targets, continuous dev and sibling source-import rejection.
- Eight current AuthKit ownership/conflict/idempotence tests move to `src/compatibility/authkit-test.spec.ts`. The existing real isolated-install regression uses the current tuple and installer. Patch removal still restores the upstream diagnostics; current patch/runtime bytes do not change.
- `tests/fixtures/current-dependencies.json` is test-only expected role data. Fresh preset tests compare it with current generation and `packageVersions`; it is not shipped. The former frozen final migration snapshot is removed.
- Managed-slot repair remains active. The supported source and current factory suite own changed/moved/deleted/duplicate slots, canonical no-ops, unrelated dependencies, atomic validation and reruns. Only old hoisted stale-Effect reproduction, Vitest reporter source transforms and old chain-specific ordering/execution retire.

The first post-change run exposed an overbroad inherited assertion: it expected package-group realignment of bootstrap-owned Nx scaffolds for dependencies outside the managed tuple. The published source uses `@nx/workspace@23.2.1` outside the managed tuple. The supported proof now preserves its manifest and installed identity. Fresh retains strict cohort alignment, while both products validate manifest-satisfying actual Nx resolution and required peers. The current managed-slot migration leaves these non-owned scaffolds untouched.

Context7 semantics remain unchanged: the published source has no entry, the candidate installs through native Nx and runs the focused dependency migration, sync provisions hosted entries, ownership/conflict checks pass, codegen/check pass and the rerun is byte-stable.

## Packed artifact inspection

The original current-main pack had 254 canonical files. The first KEE-60 commit had 224 after removing 30 historical migration members. The correction adds only the current migration JS, declaration and declaration map; no frozen migration asset returns. The corrected ordinary archive has 227 canonical files and is 160,848 bytes. Against the initial KEE-60 pack, its only additions are the three current factory members. The three preset helper modules change only to export existing maps (JS/declarations/maps); current migration metadata and generated core migration guidance also change. No retired factory or asset returns. The relabeled archive differs only in package.json version.

Packed assertions require exactly that current factory and metadata, alongside current preset, sync guidance, AuthKit, Context7, skills and license assets. Test-only expected role data remains outside the archive. Context7 implementation and the AuthKit installer/patch are unchanged.

## Canonical guidance and release plan

The reusable generated contract is `src/generators/sync/files/docs/core/migrations.md`, installed as `.keenko/docs/core/migrations.md`. It states N-1 support, prerelease and older-stable exclusions, no default multi-hop recovery, explicit window widening and retention only for supported/current behavior. Existing trust, field ownership and conflict atomicity rules remain intact. Native lifecycle guidance conditionally executes an actual plan and always performs the second install.

Root README and `docs/packed-product-test.md` describe the current window and proof. Generated core dependency guidance now names the current AuthKit installer without promising the retired rc.3 wrapper. No historical release record was rewritten. The existing active prepatch plan was extended with KEE-60, leaving root version and intended `1.0.3` line unchanged.

## Measured before and after

The original two successful measurements used `bun run test:product` under `/usr/bin/time -p` on the same macOS machine, Node `24.21.0` and Bun `1.4.2`, with disposable registry storage and isolated consumer caches. Baseline began `2026-10-07T10:47:31Z`; the passing changed run began `2026-10-07T11:14:13Z`. No concurrent test suite ran during either measurement. These single-run observations are not a performance guarantee.

| Phase                                         | Current-main baseline (seconds) | KEE-60 (seconds) |
| --------------------------------------------- | ------------------------------: | ---------------: |
| Entire command, including scoped teardown     |                         843.670 |          219.810 |
| Harness total product verification            |                         745.611 |          202.092 |
| Package preparation and source/registry setup |                         253.341 |           74.139 |
| Unsupported source creation, within setup     |                         214.371 |          Removed |
| Published `1.0.2` source setup                |          Not separately emitted |           65.756 |
| Fresh product total                           |                          68.748 |           77.801 |
| Fresh creation                                |                          25.154 |           25.963 |
| Fresh compatibility                           |                          14.032 |           17.736 |
| Distribution assertions                       |                           8.214 |            7.825 |
| First canonical verification                  |                          12.870 |           15.956 |
| Deterministic shadcn                          |                           1.913 |            2.067 |
| Fresh reinstall/sync                          |                           6.565 |            8.252 |
| Supported stable upgrade total                |          Not separately emitted |           50.144 |
| Supported stable compatibility                |          Not separately emitted |            7.011 |
| Supported stable reinstall/sync               |          Not separately emitted |            6.462 |

Whole-command time decreases by 623.860 seconds (73.9%); harness time by 543.519 seconds (72.9%). Setup decreases by 179.202 seconds. The baseline has no isolated stable setup/upgrade phase, so no artificial stable-only baseline is inferred. The eight retired upgrade lifecycles account for 386.834 seconds before teardown. Fresh is still fully verified and was slower in this changed run.

The original measurements above precede the managed-slot correction. They remain timing evidence, not sufficient ownership qualification. The corrected supported proof and new measurement are recorded below.

The baseline already emitted these retired fixture phases (seconds):

| Fixture           |           Source creation | Upgrade total | Compatibility |         Reinstall/sync | Migration rerun |
| ----------------- | ------------------------: | ------------: | ------------: | ---------------------: | --------------: |
| `1.0.1` untouched | Four-source group: 99.946 |        44.818 |         6.445 | Not separately emitted |           3.838 |
| `1.0.1` divergent |            Included above |        61.518 |        13.766 |                  6.646 |           5.225 |
| `1.0.1` renamed   |            Included above |        43.598 |         6.406 | Not separately emitted |           4.541 |
| `1.0.1` multiple  |            Included above |        56.218 |         6.825 |                  6.575 |           4.853 |
| `1.0.2-rc.0`      |                    34.384 |        44.465 |         7.120 | Not separately emitted |           3.870 |
| `1.0.2-rc.1`      |                    27.070 |        45.734 |         7.209 | Not separately emitted |           3.484 |
| `1.0.2-rc.2`      |                    26.760 |        45.063 |         6.985 | Not separately emitted |           3.784 |
| `1.0.2-rc.3`      |                    26.211 |        45.420 |         7.052 | Not separately emitted |           3.661 |

Both complete successful commands exited zero. The local-registry shutdown emitted the existing `Failed to start verdaccio: undefined` / stopped-task diagnostic after all product phases passed. Shell totals include that scoped shutdown and temporary-directory cleanup; harness totals end before teardown.

## Initial KEE-60 verification

- Focused current AuthKit ownership, real compatibility, Effect policy and native N-1 planning tests passed.
- Focused preset, sync and current renamed/multiple application boundary tests passed.
- `bun run check`: passed full format, lint, typecheck, 20 Bun tests, 158 Vitest tests, pack and release-version checks. The first complete check rebuilt without cache; the final repeat reused the unchanged packaged-source build.
- `bun run test:product`: fresh and supported stable source passed, with both install phases and an actual selected managed-dependency plan.
- `bun x nx release plan:check`: existing prepatch plan accepted.
- `git diff --check`: clean.
- Actual ordinary and relabeled packed artifacts inspected for removals, retained current assets and internally consistent metadata.

Local raw logs, phase extracts and archive inventories were retained under `/tmp/kee-60-evidence`; the tables above are the durable review record. Existing unstable Effect API warnings are unrelated to this change.

## Managed dependency ownership correction

The initial qualification incorrectly classified divergent managed-slot repair as retired historical behavior. KEE-14 and KEE-60 retain that ownership contract. The correction adds only `src/migrations/managed-dependencies-1-0-3.ts` and its focused suite. It exports existing backend/UI/shared preset maps for reuse; root/application maps were already exported. No preset behavior, historical snapshot, migration engine or ownership model is added.

The sole historical source remains the unchanged published stable `1.0.2` archive, with the same npm integrity recorded above. The product gate verifies its canonical slots and installed resolutions before deriving divergence in that workspace. It changes root Oxfmt from `0.72.0` to `0.71.0`, moves shared Effect `4.0.1` from dependencies to devDependencies, deletes backend `@confect/test`, and adds unrelated root `is-number@7.0.0`. A source Bun install establishes real divergent installation/lock state before native migration preparation. This adds no copied consumer and no second bootstrap.

The selected current factory repairs all managed roles, removes opposite-section duplicates and preserves every unrelated dependency specification. The product verifies all 76 target slots, lock workspace sections and actual installed versions, including restoration of the deleted slot. Canonical application/UI slots remain unchanged. Focused tests additionally cover changed/moved/deleted/duplicate slots across all roles, canonical byte-identical no-op, validation before writes, classified renamed/multiple applications and rerun idempotence. They preserve unrelated dependencies/scripts and `bun.lock`.

The supported product retains Context7 ownership/adoption, backend discovery, real target orchestration, AuthKit, canonical check, frozen/ordinary reinstalls and sync idempotence. It reruns the real native plan and compares all five manifests plus lockfile byte-for-byte. Both explicit Bun installs remain unconditional.

A first corrected product run exposed a verification assumption, not a factory lockfile write: current Nx automatically invokes Bun when migrations change dependencies. Installed `ChangedDepInstaller` confirms that native behavior. The factory unit suite proves no direct lockfile mutation; the product verifies resulting Bun convergence while retaining normal Nx invocation and the explicit second install. No skip-install policy was introduced.

The correction changes these files relative to `c74664ea687d6cf26fd89db5403b7f04c2e4fbaf`:

- New factory and suite: `src/migrations/managed-dependencies-1-0-3.ts`, `src/migrations/managed-dependencies-1-0-3.spec.ts`.
- Existing preset-map exports: `src/generators/preset/helpers/packages-backend.ts`, `packages-shared.ts`, `packages-ui.ts`.
- Native metadata and proof: `migrations.json`, `tests/migration-support.spec.ts`, `tests/packed-product.ts`.
- Test routing/policy: `bunfig.toml`, `vitest.config.mts`, `tests/effect-policy.spec.ts`.
- Guidance and release record: `src/generators/sync/files/docs/core/migrations.md`, `docs/packed-product-test.md`, this report and `.nx/version-plans/kee-58.md`.

The metadata contains exactly one generator: `1.0.3-managed-dependencies`, version `1.0.3-rc.0`, factory `./dist/migrations/managed-dependencies-1-0-3`. There is no packageJsonUpdates group. The packed migration directory contains exactly its JS, declaration and declaration map. Current preset, AuthKit, Context7 and generated guidance assets remain present; AuthKit installer/patch and Context7 implementation remain byte-identical.

### Corrected product measurement and verification

The passing correction run used `1.0.3-rc.0-product.run-keenko-product-qtnzmY` with unchanged published `1.0.2`, the same Node/Bun machine and `/usr/bin/time -p bun run test:product`. No concurrent test suite ran during the measurement.

| Phase                                    | Corrected seconds |
| ---------------------------------------- | ----------------: |
| Entire command including teardown        |           210.720 |
| Harness total                            |           194.045 |
| Package/source/registry setup            |            79.837 |
| Published source setup                   |            69.691 |
| Fresh total                              |            66.205 |
| Fresh creation                           |            25.628 |
| Fresh compatibility                      |            13.906 |
| Distribution assertions                  |             6.805 |
| First canonical check                    |            12.075 |
| Deterministic shadcn                     |             1.590 |
| Fresh reinstall/sync                     |             6.200 |
| Supported divergent upgrade total        |            47.995 |
| Supported compatibility                  |             6.048 |
| Supported reinstall/sync/migration rerun |             8.793 |

Wall time is 3m30.72s versus initial KEE-60's canonical-only 3m39.81s and unchanged main's 14m03.67s. The corrected gate retains a 75.0% reduction against main. Differences between the two KEE-60 runs are ordinary single-run variation, not a claimed optimization. One supported source consumer and one fresh consumer remain; no retired origin returns.

Focused commands passed:

```sh
bun test tests/migration-support.spec.ts
bun x vitest run src/migrations/managed-dependencies-1-0-3.spec.ts
```

Native selection has two passing tests for RC and stable targets; managed-slot convergence has four passing focused tests. The complete corrected product command exited zero. The final `bun run check` passed format, lint, typecheck, 20 Bun tests, 162 Vitest tests, uncached build/pack checks and release-version validation. `bun x nx release plan:check` accepted the existing prepatch plan; `git diff --check` was clean. Actual corrected pack inspection confirms 227 files, 160,848 bytes, one current factory, no retired assets, consistent metadata and retained current product assets.
