# Product acceptance

## Local unpublished package

From the repository root, install the reference Node and Bun toolchain, then run the required packed-product gate:

```sh
bun install --frozen-lockfile
bun run test:product
```

This mode starts the repository's `keenko:local-registry` Nx target with disposable storage, builds and packs Keenko, assigns a unique disposable `<Nx-resolved-RC>-product.<unique-run-id>` version, and publishes the archive under the `latest` tag to the loopback Verdaccio registry at `http://127.0.0.1:4873`. Nx Release resolves the RC through a version-plan dry run. After release has consumed the plans, the harness uses the repository RC version. On a stable repository version without a planned RC, an explicit native `nx release version prerelease --preid rc --dry-run` resolves the next disposable RC label. This keeps the test candidate above all shipped migration boundaries without writing a version plan or changing a repository version. The temporary candidate must include the later corrective migration boundary. The isolated registry preserves the historical platform-node-shared releases during published-source creation, then exposes the exact shared package resolved from the repository's selected platform-node before candidate generation. This changes only the temporary archive's version, never repository release state. A disposable install primes an isolated Bun cache with the pinned `create-nx-workspace` bootstrap through that registry, after which the candidate `bunx create-nx-workspace@23.3.0-beta.9 --preset=keenko` form proves bare-preset resolution selects the unpublished packed artifact. Verdaccio is a local development convenience and is not part of production release acceptance.

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

Four additional consumers start from the unchanged published `1.0.2-rc.0`, `rc.1`, `rc.2`, and `rc.3` archives. Each includes a second application with divergent managed slots and a consumer-owned dependency. Every upgrade completes the native lifecycle, installed-state verification, canonical check, and its own migration rerun. Reinstall and sync stability have the representative owners described below. No dependency directory is deleted.

Fresh and upgraded consumers prove target inference and root test orchestration across backend Node, backend Edge Runtime, web jsdom, UI jsdom, and shared Node. Effect-executing tests use the public `@effect/vitest` API; an ordinary UI test remains plain Vitest. Consumer lint runs with `effect/noEffectRunInTests` enabled. KEE-51 discovery probes retain `configDefaults.exclude`, exclude generated Convex and dependency-owned tests, and execute authored tests exactly once in their intended environment. Fixtures are removed before the canonical check.

The proof is part of the existing `test:product` gate used by CI and the release workflow. It migrates only disposable consumers and never publishes to public npm. `test:published` retains its separate exact-published fresh-consumer proof, and `test:shadcn` remains the separate live-registry smoke.

The divergent fixture reproduces the historical workspace-local Effect prerelease after the first hoisted install. The native linker migration and unconditional second install must eliminate that shadow without deleting dependency directories; installed Effect must agree with the target manifest and lockfile.

Fresh creation uses the canonical isolated linker with the virtual-store phantom-dependency fallback disabled from its first install. The generator's initial codegen and the complete canonical check must pass before any reinstall. A Node probe from the actual Nx TypeScript plugin context must resolve the root direct TypeScript JavaScript API and expose `readConfigFile`. The separately selected `@typescript/native` compiler must remain independently resolvable and executable. The same probes run in every upgrade consumer, after every migration rerun, and after frozen and ordinary reinstalls on the stability owners. Their resolved paths and identities must remain unchanged. The proof also checks that Bun's documented virtual-store fallback directory is absent, without depending on private store package filenames.

KEE-51's backend discovery boundary runs on these actual canonical isolated installations. Backend-local dependency-owned tests must be reachable, while only the authored Node fixture and Edge Runtime integration fixture run, exactly once in their intended projects. Generated Convex and dependency-owned tests remain excluded. This retains the focused backend ownership proof within the complete KEE-50 product gate.

### Vitest 5 review (KEE-54)

Vitest 5 makes `clearMocks` default to `true`, shares the root server with inline projects by default, requires hoisted mocks at the top level, rejects unawaited assertions, removes `sequential`, and moves deprecated deep imports. Nx owns the mechanical source changes; real test runs verify the runtime changes. The backend Node and Edge projects retain their separate include/exclude boundaries under the new inline-project behavior. Existing WorkOS mocks remain top-level. Nx's upstream AI migration instructions stay byte-for-byte native-owned; the rc.4 formatter migration adds only `tools/ai-migrations/**` to its literal ignore array, preserving other project settings.

Repository Effect-aware suites run through official `it.live` facilities under Vitest, while ordinary Bun suites retain their host. The discovery harness uses Vitest's public `standalone` API. Bun-hosted WorkOS, AuthKit, jsdom, and packed-product fixtures still spawn the selected Vitest version explicitly. The repository declares the Vite 8 peer and uses an ESM `vitest.config.mts`; generated applications retain their exact Vite 8.3.2 manifests. Nx's native migration declares the root Vite peer as `^8.0.0`; Bun may preserve an already compatible Vite 8 resolution there. Acceptance requires Vitest's resolved Vite major to remain 8 and proves its runtime compatibility, while managed application slots still resolve exactly to 8.3.2.

### AuthKit isolated-install regression (KEE-53)

The repository regression first installs the unchanged rc.2 dependency roles in a neutral temporary workspace and observes both missing `convex-test` and `vite/client` diagnostics through the real public AuthKit test import. It then applies the focused native migration and proves strict declaration checking with `skipLibCheck=false`, real default/custom component registration, and component queries through Vitest. The upstream runtime source remains byte-for-byte unchanged. Removing the owned mapping and asset followed by ordinary Bun installation restores the original package and diagnostics, proving patch removal needs no dependency-directory cleanup.

Fresh and upgraded packed consumers run that public-entrypoint proof before the canonical check. The stability owners repeat it after frozen and ordinary reinstalls, and the upgrade stability owners repeat it after migration reruns. They also typecheck the fixture through the normal backend configuration. Resolution probes show backend owns `convex-test` and Bun's phantom fallback stays disabled. Fresh consumers keep Vite inaccessible from the AuthKit package path. Upgrades let Nx declare the required Vite peer at the root; Node can then resolve that declared ancestor tool, and the probe requires its exact root identity. The adapter still cannot resolve backend-owned `convex-test`. The corrected declaration does not need those erased source-only imports. The unchanged runtime adapter registers AuthKit, its backfill workflow, workpool, and batch worker.

Nx selects `1.0.2-authkit-test` at `1.0.2-rc.3` after the existing migrations. Artifact checks require its factory, compatibility installer, and patch asset. Migration reruns preserve the patch, manifests and Bun lockfile. See the generated dependency guidance for the exact temporary ownership and future upstream-removal procedure. Local acceptance uses an unpublished packed candidate; it does not establish published rc.3 acceptance.

### Verification ownership (KEE-56)

The historical matrix remains eight independent published-source consumers: `1.0.1` untouched, divergent, renamed, and three-app, plus `1.0.2-rc.0` through `rc.3` with two apps each. All four `1.0.1` consumers still use separate generator invocations. Their original hoisted installs and workspace identities remain intact until customization and native migration. Copying source files would require rebuilding the historical installation; copying dependency directories would require proving link and cache isolation. This suite keeps the existing creation proof instead.

| Property | Authoritative fixtures | Why repetition can or cannot be removed |
| --- | --- | --- |
| Migration discovery, order, native reporter transform, application classification, ownership, manifests, lock slots, actual installed slots | Every historical consumer | Source version selects the plan; customization and topology affect ownership. Both installs, sync, codegen, and canonical `bun run check` remain unconditional. |
| Initial isolated module resolution, peer ranges, Nx/TypeScript identity, native compiler, stale Effect elimination, AuthKit public types/runtime | Fresh and every historical consumer | Installed history and consumer-owned dependencies can affect resolution. Persisted backend configuration can affect typechecking. |
| Backend Node/Edge discovery and Effect/Vitest root orchestration | Fresh and every historical consumer | Backend configuration is persisted; application names and counts affect target inference. |
| Confect API compatibility, registered decoder, cardinality, generated containers | Fresh and `upgrade-divergent` | The probe writes the same authored API fixtures against the target packages and regenerates containers. Installed target slots, codegen, and canonical checks remain verified everywhere. Fresh owns generation; divergent owns the full historical migration path and stale hoisted installation. Repeating the probe on seven other upgrades adds no different API input. |
| Frozen and ordinary reinstall, lock/resolution stability, strict AuthKit proof after reinstall, sync rerun and `sync:check`, installed-slot recheck | Fresh, `upgrade-divergent`, `upgrade-multiple` | Divergent owns stale hoisted slots; multiple owns customized three-app links and target discovery. Other sources establish target slots, isolated resolution, and canonical checks before their own migration rerun. Reinstall and sync consume that reconciled state, not the source version or migration plan. Fresh also owns reinstall after shadcn changes the lock. |
| Migration rerun, byte-stable manifests/configuration/patch/native instructions, unchanged lock and resolution | Every historical consumer | Plans differ by source, so each plan still reruns. Detailed resolution checks remain on every rerun. |
| Strict AuthKit types and component queries after migration rerun | `upgrade-divergent`, `upgrade-multiple` | Every source already ran the strict public helper proof. Each rerun must preserve the patch and all manifests byte-for-byte, the lock, installed adapter declaration/export, and module identities. The two stability owners repeat runtime/typechecking for single-app and multi-app upgrades. |

Historical reinstall and sync repetition is removed from untouched, renamed, and rc.0 through rc.3 only. Their initial installed-slot checks remain, as do their migration rerun lock and resolution assertions. The AuthKit runtime/typechecking probe is separate from the resolution probe so inexpensive path, version, peer, and isolation assertions still run after every historical migration rerun.

The rc.4 baseline fixtures have byte-identical backend `tsconfig.json` files and the same `confect codegen` script across fresh and all eight upgrades. The Confect probe imports only its authored fixtures, target dependency APIs, and regenerated containers. Keenko sync reads the packed guidance assets and routing markers; it does not branch on source version or application topology. These implementation inputs support the representative ownership above. New historical sources with different inputs require another ownership review.

All work remains sequential. CI and release use the same canonical `test:product`; there is no reduced CI mode. CI's 25-minute timeout allows variance above the rc.4 main job's measured 14m50s, which left only 10 seconds below the former 15-minute bound. Phase logs include setup, complete fresh verification, every historical upgrade, compatibility probes, representative reinstall/sync verification, each migration rerun, and total product verification. Timings describe execution and do not impose a performance threshold.

## Context7 provisioning and stable upgrade

Fresh packed creation verifies project `.codex/config.toml` and `.mcp.json` point to the hosted Context7 service with no credentials or subprocess. Both generated harness instructions and canonical agent behavior must contain automatic selective retrieval, clean fallback, and the settled authority order. The installed sync generator is exercised against equivalent entries, absent entries alongside unrelated user configuration, and custom endpoint conflicts for both harnesses. Conflicts must report manual reconciliation and preserve all inspected managed state. Sync rerun checks include both configuration files and both harness routing files.

The matrix also creates an authentic published `keenko@1.0.2` consumer. Native Nx installs the packed target without selecting a new migration factory, both installs run, and Keenko sync provisions Context7. The stable consumer repeats the ownership checks, codegen, canonical `check`, and byte-stable sync rerun. Every historical upgrade also verifies Context7 after its existing migration/install/sync lifecycle. This change is owned by the existing sync generator; historical migration factories and snapshots are unchanged.

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

Every releasable pull request carries an Nx version plan. Pull-request CI fetches the comparison history and supplies the changed paths from the event's exact base/head comparison to `bun x nx release plan:check --stdin`, so a required plan is enforced before merge. Like Nx's native base/head calculation, the comparison starts at their merge base and disables rename detection so both sides of a rename remain visible. The manually triggered release workflow repeats version-plan validation as a final defense.

Git's exact, root-anchored exclusion pathspecs omit only `.github/workflows/ci.yml`, this repository acceptance document, `tests/packed-product.ts`, `tests/release-version.ts`, `tests/wait-for-published.ts`, `tests/wait-for-published.spec.ts`, and the generated root `CHANGELOG.md` from the CI plan-check input. These seven files are absent from the published archive. No persistent Nx ignore rule is added: `nx.json` retains `versionPlans: true` and is not excluded. Changes to `nx.json`, package manifests, source, generators, migrations, and packaged documentation still require a plan. The release workflow and direct `bun x nx release plan:check` retain their strict repository configuration. An infrastructure change that alters published contents or the runtime contract must include those changed package inputs and follow the normal release process.

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

When `PREVIOUS_RC` is empty, stable verification requires `rc` to remain absent. Each readiness stage has its own hard ten-minute deadline. A failed probe is followed by a ten-second delay; probe runtime adds to that spacing. The 61-attempt cap allows 60 delays to span the whole deadline even when failures return immediately. Each individual probe has a five-minute timeout so a stalled process can be interrupted and retried. Effect scope terminates the child process on interruption, with the existing five-second forced-kill grace. Process cleanup can add that grace to the wall-clock deadline.

Temporarily unavailable packages, stale or missing tags, and transient registry or resolver failures retry within those bounds. Failure identifies the install or tag stage, expectations, attempts, whether the deadline or attempt limit ended observation, and the last three distinct probe failures. This preserves transient errors even when later probes repeatedly report a missing version. Metadata visibility alone never satisfies installation readiness; a resolved version whose tarball cannot be downloaded still retries the Bun install stage.

The ten-minute budget allows a five-minute metadata delay followed by time for a cold install. It is an observation policy, not a registry availability guarantee. [Bun's metadata documentation](https://bun.sh/docs/pm/cli/install#npm-registry-metadata) describes a possible five-minute lag when cached responses ignore `Age`. This probe already uses a fresh project, process, and cache on every attempt, so local cache reuse does not explain repeated failures here. A new cache does not make a registry response current.

Bun `1.4.2` requests the abridged npm install metadata representation in its [manifest request implementation](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/src/install/NetworkTask.rs#L379). npm `view` requests full metadata, and [`--prefer-online`](https://docs.npmjs.com/cli/v11/using-npm/config/#prefer-online) forces cache revalidation. These observations can differ even for the same package and registry. Neither proves tarball download and installation. The waiter therefore retains the exact Bun dependency install, installed-manifest equality, and a separate same-observation check of both tags. The two stage deadlines bound full readiness to twenty minutes plus process cleanup.

During the accepted `1.0.2` stable release, [Release run 37340418795](https://github.com/keenko-fr/keenko-playbook/actions/runs/37340418795) reported Nx publication success at `16:39:56 UTC`. Bun `1.4.2` then rejected the exact version on all 25 attempts, ending at `16:43:58 UTC`. The attempt cap exhausted after about four minutes and two seconds, leaving almost a minute of the nominal five-minute observation window unused. The error was version resolution, before tarball installation, and the tag stage never ran. No individual probe stalled. The logs did not record contemporaneous npm metadata responses or HTTP cache headers, so they cannot establish whether registry propagation, a stale registry representation, or Bun resolution caused that visibility delay. The later successful manual checks establish recovery, but not its exact time. The correction removes the premature cutoff and bounds stalled attempts while retaining actual installation and both tag invariants.

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

The final sweep before candidate dogfood rechecks registry candidates, engines, peers and material release notes for every managed package. Coupled families are qualified together. A release-blocking corrective pass may explicitly reopen qualification before publication: record a new cutoff and requalify all candidates available then. Freeze the tuple after the final successful pre-RC qualification. Later publications belong to the next release cycle unless a human explicitly reopens qualification. Actual RC dogfood and accepted-RC stable promotion do not include unrelated dependency refreshes. See [KEE-55 qualification](reports/kee-55.md) for the recorded sweep and exceptions.

The packed contract now checks required peers from each installed dependency's own location under isolated resolution. A temporary authored Confect fixture passes through codegen, backend typechecking and real TestConfect execution in fresh and historical upgraded products. It verifies argument field maps, client-safe core tables, generated container annotations, named runners, direct test layers, registered document decoding, cardinality, stream composition and cursor pagination. The fixture is removed and codegen restores the canonical generated state before the consumer check and idempotence tests.

The final compatibility migration has its own frozen role snapshot after the earlier testing migration. Earlier release snapshots remain immutable. Native Nx still owns its Vitest transformation, and the combined unpublished prerelease plans resolve one RC increment.
