# Product acceptance

## Local unpublished package

From the repository root, install the reference Node and Bun toolchain, then run the required packed-product gate:

```sh
bun install --frozen-lockfile
bun run test:product
```

This mode starts the repository's `keenko:local-registry` Nx target with disposable storage, builds and packs Keenko, assigns a unique disposable `<Nx-resolved-RC>-product.<unique-run-id>` version, and publishes the archive under the `latest` tag to the loopback Verdaccio registry at `http://127.0.0.1:4873`. Nx Release resolves the RC through a version-plan dry run. After release has consumed the plans, the harness uses the repository RC version. The temporary candidate must include the later corrective migration boundary. This changes only the temporary archive's version, never repository release state. A disposable install primes an isolated Bun cache with the pinned `create-nx-workspace` bootstrap through that registry, after which the candidate `bunx create-nx-workspace@23.3.0-beta.9 --preset=keenko` form proves bare-preset resolution selects the unpublished packed artifact. Verdaccio is a local development convenience and is not part of production release acceptance.

Before Keenko `1.0.0`, this acceptance path proves only the current fresh generated state. Pre-1.0 projects are disposable dogfood and are recreated when that state changes; there is no `0.x` upgrade fixture or forward-migration gate. `1.0.0` is the first supported project compatibility baseline. Later releases add native Nx migrations only when an existing supported project requires a persisted repository-state transformation.

### Controlled 1.0.1 forward upgrade

Local `test:product` creates four consumers through `create-nx-workspace --preset=keenko@1.0.1` using the unchanged released npm archive. They cover untouched dependencies, divergent dependencies, a renamed `apps/portal` application with no `apps/web`, and three application workspaces. The divergent fixtures customize managed versions, move runtime and development slots, delete managed slots, leave canonical slots unchanged, and add unrelated consumer-owned dependencies.

The 1.0.1 release used Effect `4.0.0-rc.115`. Its transitive `@effect/platform-node-shared` range now also admits stable Effect 4, which prevents the historical generator from loading. The disposable registry initially serves only the unchanged `platform-node-shared@4.0.0-rc.115` archive recorded in the v1.0.1 lockfile. It makes stable `4.0.0` available after the historical consumers have been generated. No released archive is patched, and no dependency override is added to a consumer.

Every consumer exercises the packed candidate through native Nx:

```sh
bun x nx migrate keenko@<packed-candidate-version>
bun install
bun x nx migrate --run-migrations
bun install
bun x nx sync
bun run codegen
bun run check
```

The second install is unconditional. Native Nx preparation reads Keenko's rc.4 `packageJsonUpdates`, updates the exact Nx/Vitest tuple, and selects Nx's `migrate-to-vitest-5` at `23.3.0-beta.8`. Acceptance asserts the complete migration plan and execution order. A disposable legacy reporter import proves the native source migration executes. Keenko does not copy Nx's transforms or manually normalize consumer Vitest configurations.

Historical rc.0 through rc.3 entries and their snapshots remain intact. Consumers execute the applicable historical application, discovery, dependency, linker, Effect-policy, and AuthKit migrations before the new rc.4 dependency boundary converges their managed slots. The five frozen ownership roles are root, application, backend, UI, and shared. Sorted direct `apps/*` manifests classified `type:app` receive the application tuple. The count is `16 + 32 × N + 13 + 14 + 1`: 76, 108, and 140 instances for one, two, and three apps. Both manifests and installed resolution must match; unrelated consumer dependencies remain unchanged. Native Nx scaffold packages, including `@nx/workspace`, are checked for Nx version alignment outside the frozen Keenko role slots. `vitest` and `@effect/vitest` are root-owned, while `@confect/test` and `convex-test` remain backend-owned. Bun alone reconciles `bun.lock`.

Four additional consumers start from the unchanged published `1.0.2-rc.0`, `rc.1`, `rc.2`, and `rc.3` archives. Each includes a second application with divergent managed slots and a consumer-owned dependency. Every upgrade completes the same native lifecycle, frozen and ordinary reinstalls, migration rerun, and sync rerun. Reruns preserve managed files, manifests, the isolated linker, patch, lockfile, and module resolution. No dependency directory is deleted.

Fresh and upgraded consumers prove target inference and root test orchestration across backend Node, backend Edge Runtime, web jsdom, UI jsdom, and shared Node. Effect-executing tests use the public `@effect/vitest` API; an ordinary UI test remains plain Vitest. Consumer lint runs with `effect/noEffectRunInTests` enabled. KEE-51 discovery probes retain `configDefaults.exclude`, exclude generated Convex and dependency-owned tests, and execute authored tests exactly once in their intended environment. Fixtures are removed before the canonical check.

The proof is part of the existing `test:product` gate used by CI and the release workflow. It migrates only disposable consumers and never publishes to public npm. `test:published` retains its separate exact-published fresh-consumer proof, and `test:shadcn` remains the separate live-registry smoke.

The divergent fixture reproduces the historical workspace-local Effect prerelease after the first hoisted install. The native linker migration and unconditional second install must eliminate that shadow without deleting dependency directories; installed Effect must agree with the target manifest and lockfile.

Fresh creation uses the canonical isolated linker with the virtual-store phantom-dependency fallback disabled from its first install. The generator's initial codegen and the complete canonical check must pass before any reinstall. A Node probe from the actual Nx TypeScript plugin context must resolve the root direct TypeScript JavaScript API and expose `readConfigFile`. The separately selected `@typescript/native` compiler must remain independently resolvable and executable. The same probes run in every upgrade consumer and after frozen and ordinary reinstalls; their resolved paths and identities must remain unchanged. The proof also checks that Bun's documented virtual-store fallback directory is absent, without depending on private store package filenames.

KEE-51's backend discovery boundary runs on these actual canonical isolated installations. Backend-local dependency-owned tests must be reachable, while only the authored Node fixture and Edge Runtime integration fixture run, exactly once in their intended projects. Generated Convex and dependency-owned tests remain excluded. This retains the focused backend ownership proof within the complete KEE-50 product gate.

### Vitest 5 review (KEE-54)

Vitest 5 makes `clearMocks` default to `true`, shares the root server with inline projects by default, requires hoisted mocks at the top level, rejects unawaited assertions, removes `sequential`, and moves deprecated deep imports. Nx owns the mechanical source changes; real test runs verify the runtime changes. The backend Node and Edge projects retain their separate include/exclude boundaries under the new inline-project behavior. Existing WorkOS mocks remain top-level. Nx's upstream AI migration instructions stay byte-for-byte native-owned; the rc.4 formatter migration adds only `tools/ai-migrations/**` to its literal ignore array, preserving other project settings.

Repository Effect-aware suites run through official `it.live` facilities under Vitest, while ordinary Bun suites retain their host. The discovery harness uses Vitest's public `standalone` API. Bun-hosted WorkOS, AuthKit, jsdom, and packed-product fixtures still spawn the selected Vitest version explicitly. The repository declares the Vite 8 peer and uses an ESM `vitest.config.mts`; generated applications retain their exact Vite 8.3.2 manifests. Nx's native migration declares the root Vite peer as `^8.0.0`; Bun may preserve an already compatible Vite 8 resolution there. Acceptance requires Vitest's resolved Vite major to remain 8 and proves its runtime compatibility, while managed application slots still resolve exactly to 8.3.2.

### AuthKit isolated-install regression (KEE-53)

The repository regression first installs the unchanged rc.2 dependency roles in a neutral temporary workspace and observes both missing `convex-test` and `vite/client` diagnostics through the real public AuthKit test import. It then applies the focused native migration and proves strict declaration checking with `skipLibCheck=false`, real default/custom component registration, and component queries through Vitest. The upstream runtime source remains byte-for-byte unchanged. Removing the owned mapping and asset followed by ordinary Bun installation restores the original package and diagnostics, proving patch removal needs no dependency-directory cleanup.

Fresh and upgraded packed consumers run that public-entrypoint proof before the canonical check and after frozen and ordinary reinstalls. They also typecheck the fixture through the normal backend configuration. Resolution probes show backend owns `convex-test` and Bun's phantom fallback stays disabled. Fresh consumers keep Vite inaccessible from the AuthKit package path. Upgrades let Nx declare the required Vite peer at the root; Node can then resolve that declared ancestor tool, and the probe requires its exact root identity. The adapter still cannot resolve backend-owned `convex-test`. The corrected declaration does not need those erased source-only imports. The unchanged runtime adapter registers AuthKit, its backfill workflow, workpool, and batch worker.

Nx selects `1.0.2-authkit-test` at `1.0.2-rc.3` after the existing migrations. Artifact checks require its factory, compatibility installer, and patch asset. Migration reruns preserve the patch, manifests and Bun lockfile. See the generated dependency guidance for the exact temporary ownership and future upstream-removal procedure. Local acceptance uses an unpublished packed candidate; it does not establish published rc.3 acceptance.

## Exact published package

After both readiness stages in [Release workflow and recovery](#release-workflow-and-recovery) succeed, run the release-grade acceptance with the exact published version and the selector for its release mode:

```sh
bun run test:published -- <exact-version>
bun run test:published -- <exact-version> keenko
bun run test:published -- <exact-version> keenko@rc
```

The public selector contract is:

- `keenko` resolves the npm `latest` dist-tag and therefore the current stable release.
- `keenko@rc` resolves the npm `rc` dist-tag and therefore the current release candidate.
- Exact-version acceptance proves the published artifact itself.
- Selector acceptance proves that npm dist-tags and `create-nx-workspace` resolve that artifact through the supported public CLI form.

The expected version must be one concrete SemVer, including an optional prerelease or build suffix. By default, published acceptance creates the consumer with `--preset=keenko@<exact-version>`. Release acceptance may additionally provide an explicit public preset selector while keeping the exact expected installed version separate. This mode does not pack repository source, rewrite a package version, start Verdaccio, or override registry configuration. It runs the canonical public bootstrap with the selected preset and verifies the expected exact version in the consumer's installed `node_modules/keenko/package.json`.

The disposable consumer verifies the installed Keenko version, representative files that must survive packaging, the absence of pre-1.0 migration metadata, and fidelity of a representative third-party license. It runs the first-install canonical `bun run check`, verifies frozen and ordinary reinstall stability from the generated lockfile, and verifies the exact Keenko version again. Preset and sync tests own generated shape and managed-state behavior; the consumer check owns its internal codegen, formatting, lint, typecheck, test, and build lifecycle.

Local unpublished acceptance also starts a loopback shadcn response fixture and publishes a uniquely versioned test dependency to the disposable Verdaccio registry. The installed exact-pinned shadcn CLI adds two fixture components on the main fresh workspace after the canonical check and before either frozen or ordinary reinstall. No setup reinstall precedes the CLI invocation; subsequent reinstall assertions use the lockfile reconciled by the fixture dependency installation. Acceptance verifies that both files route to `packages/ui`, no app-local UI copies appear, the runtime dependency is added to `packages/ui`, and that package can import it. This deterministic compatibility proof does not contact the live shadcn registry. Published acceptance retains its first-install and frozen-reinstall distribution proof but does not publish or consume the local-only fixture package.

Major phases print a concise start line and elapsed time on completion. These diagnostics identify where a slowdown occurred without defining a runtime threshold.

## Live shadcn compatibility

Run the external compatibility smoke explicitly:

```sh
bun run test:shadcn
```

This command uses the same clean local packed-consumer creation path, then invokes the exact generated shadcn CLI version against the live shadcn registry. It verifies that `button` and `input-otp` route into `packages/ui`, that the application does not receive app-local copies, and that the added dependency is usable from the UI package. The `test:shadcn` script is intentionally not invoked by `bun run check`, `bun run test:product`, normal CI, or release verification. A registry outage or upstream CLI failure therefore remains visible without making deterministic packed-distribution acceptance depend on that external service.

Internet access is required for public dependencies; `test:shadcn` additionally requires live shadcn registry access. No publishing credentials or Nx Cloud account are required. Temporary npm registry configuration and caches exist only in local unpublished mode; published mode uses the caller's normal public npm configuration.

The executable procedures live in `tests/packed-product.ts`. Effect scope stops the local-registry child and removes the temporary cache, archive, and consumer on completion or failure. The tests require Node compatible with the package engine, Bun, npm, and Git on `PATH`, plus the repository's installed dependencies. On failure, use the last phase start/completion lines to identify the boundary, correct that cause, and rerun the same command; do not increase the command timeout or add retries or sleeps.

## Release workflow and recovery

Every releasable pull request carries an Nx version plan. Pull-request CI fetches the comparison history and runs `bun x nx release plan:check` with the event's exact base and head SHAs, so a required plan is enforced before merge. The manually triggered release workflow repeats version-plan validation as a final defense.

The release workflow has one required `mode` choice: `rc` or `stable`. Both modes install from the lockfile, run `bun run check` (which includes `pack:check`), validate version plans, and run `bun run test:product` before invoking the same Nx Release architecture.

RC mode runs `bun x nx release --skip-publish --preid rc` and then publishes the versioned package with `bun x nx release publish --tag rc`. When starting a new RC line from a stable version, active version plans must use `prepatch`, `preminor`, or `premajor`; for example, `1.0.0` plus `prepatch` produces `1.0.1-rc.0`. When the repository is already on an RC version, RC continuation requires active version plans to use `prerelease`. Plain `patch`, `minor`, or `major` plans are rejected in RC mode before release mutation. After Nx computes the version, RC mode also verifies that the resulting package version has an `-rc.N` prerelease before publication. RC publication moves only the npm `rc` dist-tag and must not move `latest`.

Stable mode requires the repository version to have the exact `x.y.z-rc.N` form, with canonical stable SemVer components and a non-negative integer RC number. Stable versions and other prerelease identifiers are rejected before release mutation. After validating that form, it derives `STABLE_TARGET` with `${VERSION%%-*}` and uses npm `latest` from the original pre-publication snapshot as `PREVIOUS_LATEST`. Before versioning, it requires a stable version value, an existing `v<PREVIOUS_LATEST>` tag, and that tag to be an ancestor of the release revision. Stable mode rejects an already-stable repository version. Selecting stable and moving `latest` remain an explicit human decision: no RC automatically promotes, and the workflow remains manual.

Stable promotion runs these phases in order:

1. `bun x nx release version "$STABLE_TARGET"` writes and stages the stable version transition.
2. Nx's native `ReleaseClient` generates the project changelog with `version: STABLE_TARGET` and `from: "v" + PREVIOUS_LATEST`, then owns the release commit, Git tag, push, and GitHub Release creation.
3. `bun x nx release publish --tag latest` publishes the already-versioned package.

Stable release notes cover the full delta since the previous stable release, including changes shipped earlier in the RC line. The stable changelog call overrides `versionPlans: false` because Nx's CLI changelog reads plans currently on disk, even with `--from`; RC releases have already consumed their plans. It also disables the workspace changelog so the project changelog is the single artifact. Nx's own Git reader and commit parser identify unrecognized commit types and `__INVALID__` titles in that same range; the call enables those native changelog categories under "Changes" so this repository's squash commit titles appear. Known conventional commit categories keep Nx's defaults. These overrides apply only to the stable changelog call. RC orchestration, RC changelog boundaries, and repository version-plan enforcement remain unchanged.

Nx remains the sole versioning, changelog, release commit, Git tag, push, GitHub release, and npm publication authority. In RC mode, `--skip-publish` suppresses the top-level command's implicit npm publication. In both modes, the explicit Nx publish phase publishes the already-versioned package and does not perform another version transition or consume another version plan. npm dist-tag behavior is part of the release contract: RC publication moves only `rc`, while stable publication moves only `latest`. After all Nx phases succeed, the workflow reads the version Nx wrote to the root `package.json`; it does not calculate a published version independently.

Before publication, the workflow records npm's `latest` and `rc` versions as `PREVIOUS_LATEST` and `PREVIOUS_RC`. These values are the original pre-publication registry snapshot, shared by stable changelog generation and registry convergence verification. No second snapshot is taken between those responsibilities. If `rc` is absent, `PREVIOUS_RC` is an empty string; the quoted argument below preserves that empty value.

After publication, the workflow invokes the waiter with the Nx-published version, release mode, and original snapshot:

```sh
bun run release:wait-for-published -- \
  "$PUBLISHED_VERSION" \
  "$RELEASE_MODE" \
  "$PREVIOUS_LATEST" \
  "$PREVIOUS_RC"
```

The waiter runs two sequential bounded readiness stages:

1. The exact published version must become Bun-installable from `https://registry.npmjs.org`. Each attempt creates a fresh temporary package project and isolated Bun cache, installs the exact package selector through Bun's real install path, and verifies the installed `node_modules/keenko/package.json` version. A different installed version does not satisfy this proof.
2. npm dist-tags must converge. Both required tags must match their expected values in the same registry observation; exact installation alone does not prove either tag.

The mode invariants are:

```text
RC:
rc     = PUBLISHED_VERSION
latest = PREVIOUS_LATEST

stable:
latest = PUBLISHED_VERSION
rc     = PREVIOUS_RC
```

When `PREVIOUS_RC` is empty, stable verification requires `rc` to remain absent. Each readiness stage retries every 10 seconds, makes at most 25 attempts, and has its own hard five-minute timeout. Temporarily unavailable packages, stale or missing tags, and transient registry or resolver failures retry within those bounds. Failure reports the selectors, expected versions, attempt count, timeout, and last observed mismatch or registry/install error.

Only after both readiness stages succeed does the workflow verify the exact published artifact and then its public selector. RC releases use `keenko@rc`; stable releases use bare `keenko`. Both checks expect the exact version published by Nx:

```sh
bun run test:published -- "$PUBLISHED_VERSION"
if [ "$RELEASE_MODE" = "rc" ]; then
  bun run test:published -- "$PUBLISHED_VERSION" "keenko@rc"
else
  bun run test:published -- "$PUBLISHED_VERSION" "keenko"
fi
```

If publication succeeded but registry convergence exceeded the bound, do not rerun Nx versioning or Nx publication. Preserve the original pre-publication registry snapshot and rerun the four-argument waiter above with the original `PUBLISHED_VERSION`, `RELEASE_MODE`, `PREVIOUS_LATEST`, and `PREVIOUS_RC`, including an empty previous-RC value. Do not reconstruct either previous tag value from the registry after publication: those values describe pre-publication state. Only after both readiness stages succeed should recovery rerun the corresponding published acceptance commands above. The backward-compatible one-argument waiter proves only exact installation and is insufficient for release readiness or recovery.

If published acceptance exposes a product defect, the workflow fails visibly. The npm publication and release tag are immutable release events: do not unpublish, delete the tag, rewrite the release, or force-push history. Diagnose the consumer failure and ship a subsequent corrective release through the same Nx version-plan process.

## Final dependency compatibility qualification

The final sweep before candidate dogfood rechecks registry candidates, engines, peers and material release notes for every managed package. Coupled families are qualified together. See [KEE-55 qualification](reports/kee-55.md) for the recorded sweep and exceptions.

The packed contract now checks required peers from each installed dependency's own location under isolated resolution. A temporary authored Confect fixture passes through codegen, backend typechecking and real TestConfect execution in fresh and historical upgraded products. It verifies argument field maps, client-safe core tables, generated container annotations, named runners, direct test layers, registered document decoding, cardinality, stream composition and cursor pagination. The fixture is removed and codegen restores the canonical generated state before the consumer check and idempotence tests.

The final compatibility migration has its own frozen role snapshot after the earlier testing migration. Earlier release snapshots remain immutable. Native Nx still owns its Vitest transformation, and the combined unpublished prerelease plans resolve one RC increment.
