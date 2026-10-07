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

The passing candidate was `1.0.3-rc.0-product.run-keenko-product-Vcjucm`. Only its temporary archive version differs from the ordinary repository pack. This is a local test artifact, not a published release.

## Migration surface audit

Installed Nx `23.3.0-beta.9` selects generator boundaries strictly above the installed source and at or below the target. Its native Migrator produces only the Keenko package update and an empty migration list for both `1.0.2 → 1.0.3-rc.0` and `1.0.2 → 1.0.3`. The real packed CLI also reports no migrations and creates no consumer migration plan. [Nx's documented lifecycle](https://nx.dev/docs/features/automate-updating-dependencies) allows this result. Both Bun installs, sync, codegen and check still execute.

All nine former entries and the rc.4 `packageJsonUpdates` group have boundaries below stable `1.0.2`. They cannot apply on the supported path. `migrations.json` now contains `{ "generators": {} }`; no no-op migration or synthetic consumer plan replaces them.

The complete `src/migrations/` tree is retired: seven factories, their seven test files and nine migration-only assets. The factories are:

- `application-workspaces-1-0-2`
- `backend-vitest-exclusions-1-0-2`
- `dependency-baseline-1-0-2` (also used by application-dependency and Effect-policy entries)
- `bun-linker-1-0-2`
- `authkit-test-1-0-2` (historical wrapper only)
- `effect-testing-baseline-1-0-2`
- `compatibility-baseline-1-0-2`

The nine assets are the three dependency/effect-testing/compatibility JSON snapshots, two frozen application AuthKit tests, one frozen backend Vitest config, two frozen Oxlint configs and one drift-check fixture. Import/call-site tracing found no current preset, sync or runtime caller of the deleted factories or frozen assets. The current AuthKit installer and patch are separate and remain unchanged.

Generic native migration plumbing remains: `package.json#nx-migrations`, packaged `migrations.json`, Nx dependencies, TypeScript compilation and generic asset copying. Empty metadata is accepted by current native Nx and remains the extension point for future required transformations. Package metadata and build configuration are unchanged.

## Current verification owners

The detailed per-invariant audit is in [Product acceptance ownership](../packed-product-test.md#verification-ownership-after-kee-60). Coverage is retained or retired according to the behavior's current owner:

- The real stable source owns untouched upgrade, consumer dependency preservation, lock ownership, installed resolution, backend discovery, root target orchestration, reinstall stability, sync idempotence and KEE-58 Context7 adoption.
- Fresh generation remains authoritative for current generated shape, exact dependency roles, strict Nx bootstrap alignment, isolated installation, Confect compatibility, deterministic shadcn, packed assets and first-install verification.
- The existing module-boundary fixture now uses renamed `portal` plus sibling `admin`, with no `apps/web`. It checks actual project roots, native inferred Vitest targets, continuous dev and sibling source-import rejection.
- Eight current AuthKit ownership/conflict/idempotence tests move to `src/compatibility/authkit-test.spec.ts`. The existing real isolated-install regression uses the current tuple and installer. Patch removal still restores the upstream diagnostics; current patch/runtime bytes do not change.
- `tests/fixtures/current-dependencies.json` is test-only expected role data. Fresh preset tests compare it with current generation and `packageVersions`; it is not shipped. The former frozen final migration snapshot is removed.
- Divergent-slot repair, old hoisted stale-Effect reproduction, Vitest reporter source transformation, historical factory discovery/order/execution and migration reruns were proofs of retired transformations. Current resolution and native targets still run. Future applicable transformations require native selection/execution and ownership tests.

The first post-change run exposed an overbroad inherited assertion: it expected package-group realignment of bootstrap-owned Nx scaffolds even though no dependency migration applies. The published source uses `@nx/workspace@23.2.1` outside the managed tuple. The supported proof now preserves its manifest and installed identity. Fresh retains strict cohort alignment, while both products validate manifest-satisfying actual Nx resolution and required peers. No dependency transformation was invented to satisfy the historical assertion.

Context7 semantics remain unchanged: the published source has no entry, the candidate installs through native Nx without a plan, sync provisions hosted entries, ownership/conflict checks pass, codegen/check pass and the rerun is byte-stable.

## Packed artifact inspection

The baseline pack contains 254 files and is 174,472 bytes; the changed ordinary pack contains 224 files and is 159,070 bytes. Exactly 30 file members disappear: the seven compiled migration factories, each with its declaration and declaration map, plus the nine frozen assets. No new file is added to the package.

Only four surviving package members change: root README, `migrations.json`, and generated core `migrations.md` and `dependencies.md`. All surviving preset, compatibility and Context7 implementation members are byte-identical. The actual relabeled candidate has the same 224 canonical file members; its only content delta from the ordinary pack is `package.json#version`. Existing macOS tar resource metadata is excluded from this canonical file comparison.

Packed assertions check retired `dist/migrations` is absent and current preset, sync guidance, AuthKit compatibility, skills and license assets remain present. `package.json#nx-migrations` still resolves the shipped empty metadata. Test-only expected dependency roles remain outside the archive.

## Canonical guidance and release plan

The reusable generated contract is `src/generators/sync/files/docs/core/migrations.md`, installed as `.keenko/docs/core/migrations.md`. It states N-1 support, prerelease and older-stable exclusions, no default multi-hop recovery, explicit window widening and retention only for supported/current behavior. Existing trust, field ownership and conflict atomicity rules remain intact. Native lifecycle guidance conditionally executes an actual plan and always performs the second install.

Root README and `docs/packed-product-test.md` describe the current window and proof. Generated core dependency guidance now names the current AuthKit installer without promising the retired rc.3 wrapper. No historical release record was rewritten. The existing active prepatch plan was extended with KEE-60, leaving root version and intended `1.0.3` line unchanged.

## Measured before and after

Both successful runs used `bun run test:product` under `/usr/bin/time -p` on the same macOS machine, Node `24.21.0` and Bun `1.4.2`, with disposable registry storage and isolated consumer caches. Baseline began `2026-10-07T10:47:31Z`; the passing changed run began `2026-10-07T11:14:13Z`. No concurrent test suite ran during either measurement. These single-run observations are not a performance guarantee.

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

## Verification

- Focused current AuthKit ownership, real compatibility, Effect policy and native N-1 planning tests passed.
- Focused preset, sync and current renamed/multiple application boundary tests passed.
- `bun run check`: passed full format, lint, typecheck, 20 Bun tests, 158 Vitest tests, pack and release-version checks. The first complete check rebuilt without cache; the final repeat reused the unchanged packaged-source build.
- `bun run test:product`: fresh and supported stable source passed, with both install phases and no synthetic migration plan.
- `bun x nx release plan:check`: existing prepatch plan accepted.
- `git diff --check`: clean.
- Actual ordinary and relabeled packed artifacts inspected for removals, retained current assets and internally consistent metadata.

Local raw logs, phase extracts and archive inventories were retained under `/tmp/kee-60-evidence`; the tables above are the durable review record. Existing unstable Effect API warnings are unrelated to this change.
