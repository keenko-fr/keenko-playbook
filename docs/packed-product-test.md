# Product acceptance

## Local unpublished package

Install the reference Node and Bun toolchain, then run the required packed-product gate:

```sh
bun install --frozen-lockfile
bun run test:product
```

The gate proves fresh creation, the stable N-1 upgrade, the explicitly supported published RC upgrade and partial RC migration recovery. For the `1.0.5` release line, `tests/fixtures/upgrade-source.json` names unchanged published `keenko@1.0.4` and `keenko@1.0.5-rc.0` archives. New projects start current. Direct forward support defaults to immediately preceding stable → current stable. Prereleases are not permanent supported origins. Older stable versions fall outside the default direct-support window, with no default guarantee of recovery through sequential historical releases. A release issue can explicitly widen the window.

The harness starts the repository's `keenko:local-registry` Nx target with disposable storage at `http://127.0.0.1:4873`. It downloads both source archives from public npm and serves them unchanged through that registry. It creates an ordinary consumer from each version and a second stable consumer that will reproduce the published RC migration failure. The source Nx cohort is derived from the downloaded manifest's exact `@nx/devkit` dependency rather than another hardcoded version. Fresh candidate creation uses `create-nx-workspace@23.3.0`. Each source and candidate bootstrap has an isolated Bun cache. Other packages use Verdaccio's public npm uplink. The retired RC bootstrap no longer requires a protected `@effect/platform-node-shared` namespace or historical shared-package archives.

Keenko is built and packed, then the temporary archive receives a unique `<Nx-resolved-RC>-product.<unique-run-id>` version and the local `latest` tag. Nx Release resolves the candidate through a version-plan dry run. After plans have been consumed, the harness uses the repository RC version. On a stable repository without a planned RC, native `nx release version prerelease --preid rc --dry-run` resolves the next disposable RC. Only the archive label changes; the root package version, release plans and public npm remain untouched. A disposable install primes the candidate's isolated Bun cache with the pinned bootstrap. Bare `--preset=keenko` must resolve to the packed candidate.

### Supported stable upgrade

The authentic `1.0.4` consumer follows native Nx's lifecycle:

```sh
bun x nx migrate keenko@<packed-candidate-version>
bun install
if [ -f migrations.json ]; then
  bun x nx migrate --run-migrations
fi
bun install
bun x nx sync
bun run codegen
bun run check
```

Run applicable native migrations when Nx produces a plan. The second install is unconditional, including when no migration applies. Bun alone reconciles installed packages and `bun.lock`.

The candidate retains `package.json#nx-migrations: "./migrations.json"`. Installed Nx selects the backend-convention and complementary backend/shared type-policy entries from stable 1.0.4, and only the complementary entry from published 1.0.5-rc.0. It prevalidates compiler/lint configuration, reuses the existing managed-dependency convergence factory, then adds domain/errors includes and the backend/shared type-definition override. It preserves data includes, application source and unrelated configuration text. Customized or ambiguous configuration fails before this migration writes. The existing `1.0.4-managed-dependencies` entry remains discoverable for its historical boundary. The explicitly supported published RC origin and a partial-recovery fixture join stable N-1 for this release; this does not add a permanent historical support guarantee.

Keenko-managed dependency slots remain Keenko-owned after generation. Supported upgrades converge their presence, dependency section and exact target version even when the consumer changes, moves or deletes them. Native Nx package updates operate on the root manifest and preserve existing sections, so they cannot satisfy this contract across nested workspace roles. The focused migration reuses the current target-package preset maps, discovers classified direct applications, validates all required manifests before writes, and changes only managed slots. Dependency convergence needs no frozen historical tuple: each supported N-1 source selects the target package's current tuple throughout this release line.

Authentic installed stable and published-RC consumers own the upgrade proof, with a separate stable-derived partial-recovery consumer. Frozen published compiler/lint assets also seed focused configuration migration tests; current preset output does not stand in for released configuration. Its installed package identity and actual resolution are verified first. The fixture then changes root Oxfmt to `0.71.0`, moves shared Effect into `devDependencies`, deletes backend `@confect/test`, and adds consumer-owned `is-number@7.0.0`. A source Bun install proves the divergent installation and lock state. All other managed slots remain canonical. Native Nx selects the expected entry or entries for each origin, the first install brings in the candidate, and the Keenko factory restores owned manifests without writing the lockfile. Current Nx may invoke Bun automatically after dependency changes. The second unconditional Bun install reconciles every target slot and actual installed version. The recovery fixture adds only the explicitly requested published RC failure path; retired historical origins remain outside this gate.

The upgrade checks all 76 managed slot instances and the migrated compiler/lint scope, absent opposite-section duplicates, unrelated dependency preservation, lock workspace entries and installed target versions. It preserves bootstrap-owned Nx scaffolds outside the tuple, backend Node/Edge discovery, root Effect/Vitest orchestration and the real AuthKit public test export. Context7 remains sync-owned: the source already has its entries, candidate sync preserves them, ownership checks pass, codegen/check pass and sync reruns are byte-stable. Frozen and ordinary reinstalls preserve lockfile and resolution. A native migration rerun preserves all manifests, backend compiler/lint configuration, the authentic source's data or feature helper and `bun.lock` byte-for-byte.

### Fresh product

Fresh creation remains the authority for current generated shape and package behavior. It verifies the first installed candidate before any reinstall, the canonical isolated linker with phantom fallback disabled, and exact managed slots across root, application, backend, UI and shared roles. `tests/fixtures/current-dependencies.json` is test-owned expected data, checked against the fresh preset and `packageVersions`; it is not a shipped migration snapshot. `vitest` and `@effect/vitest` remain root-owned; `@confect/test` and `convex-test` remain backend-owned.

The Node resolution probe runs from Nx's real TypeScript plugin context. It must resolve the root direct JavaScript API and expose `readConfigFile`. The independent `@typescript/native` compiler must resolve and execute. Required peer ranges, Nx packages and installed Effect versions must agree with their manifests. Fresh creation also requires all root Nx specifications to align with its bootstrap cohort. The published stable source can retain bootstrap-owned scaffold slots outside Keenko's managed roles. The focused migration preserves their source specifications instead of applying the retired Nx package-group realignment. Bun's virtual-store phantom fallback directory must be absent. Resolution checks run on the supported upgrade and after frozen and ordinary reinstalls.

Fresh and supported upgraded consumers prove target inference and root orchestration across backend Node, backend Edge Runtime, application jsdom, UI jsdom and shared Node. Effect tests use public `@effect/vitest`; the UI test uses plain Vitest. Consumer lint retains `effect/noEffectRunInTests`. Discovery probes expose dependency-owned tests in the real isolated installation, then require only the authored Node and Edge fixtures to run exactly once. Generated Convex and dependency-owned tests remain excluded. Probes are removed before canonical verification.

Fresh owns the authored Confect compatibility fixture against current APIs and generated containers. Codegen, backend typechecking and real TestConfect execution verify argument field maps, client-safe core tables, named runners, direct test layers, registered decoding, cardinality, stream composition and pagination. Removing the fixture and rerunning codegen restores canonical state. The supported upgrade repeats this fixture, and negative compiler probes prove that previously absent domain/errors owners are actually typechecked.

The fixture also compiles and lints the domain and three error-family examples extracted from the generated canonical guidance, using the backend's scoped type-definition policy in fresh and upgraded consumers. An extracted feature writes directly through DatabaseWriter; a typed Failure after that write proves root mutation rollback. SchemaError, expected Failure and Defect channels remain distinct. The temporary fixtures are removed before ordinary consumer verification.

Packed assertions require exactly the retained managed-dependency and backend-convention factories plus both backend migration metadata entries, absence of all retired migration factories/assets, and presence of fresh preset, guidance, skill/license and AuthKit compatibility assets. The deterministic shadcn fixture and fresh reinstall/sync checks remain intact. CI and release invoke the same sequential gate; there is no reduced CI mode.

### Verification ownership after KEE-60

The former eight `1.0.1`/RC consumers have no supported source path into this release line. They are retired without exceptions. Historical npm artifacts, Git tags, changelogs and release reports remain the record of their original qualification.

| Former property | Current owner or retirement reason |
| --- | --- |
| Untouched upgrade | The published source installation is validated before deriving divergence; the current factory suite proves a byte-identical no-op for canonical manifests. The same supported source owns the full native lifecycle with representative divergence. |
| Divergent managed slots; presence, placement and version convergence | The supported published `1.0.4` fixture exercises changed, moved and deleted slots plus canonical slots and unrelated dependencies. The current focused migration suite covers every role, duplicate removal, canonical byte stability, atomic prevalidation and renamed/multiple apps. Historical implementations retire; dependency ownership remains active. |
| Renamed and multiple applications | `tests/module-boundaries.spec.ts` discovers current `portal` and `admin` with no `apps/web`, proves inferred Vitest targets and continuous dev targets, and rejects sibling application source imports. Preset tests and generated-drift tests retain wildcard application policy. No historical generation or tuple replication is needed. |
| Migration discovery/order and native Nx execution | `tests/migration-support.spec.ts` proves stable/RC selection, the complementary boundary and forced recovery even when the target is already installed. The product CLI verifies each plan, runs the real factories and repeats after convergence. The explicit RC extension is confined to this release window. |
| Nx/Vitest native reporter source transform | Retired `1.0.1`/RC → Vitest 5 behavior. Stable `1.0.4` already owns the current Nx/Vitest tuple. Current product still runs its real targets and official Effect integration. No legacy reporter import or synthetic migration is retained. |
| Consumer-owned dependencies and customization | Supported upgrade preserves all existing slots outside the tuple plus added `is-number@7.0.0`. Focused convergence tests preserve unrelated dependencies and scripts across every role. Sync tests retain project-file, routing and MCP ownership/conflict atomicity. |
| Lockfile ownership and actual installed resolution | Native preparation leaves the Bun-owned lockfile unchanged; factory tests prove Keenko never writes it. Native Nx can invoke Bun after dependency changes, and both explicit installs still run. All managed manifests, lock entries and installed versions converge; bootstrap-owned scaffold specifications remain untouched. Fresh strict Nx alignment, actual compiler/peer/Effect resolution and reinstall stability remain. |
| Stale Effect resolution | The stale hoisted RC reproduction tested the retired linker migration. Current Node/Bun probes still reject installed Effect versions that differ from manifests. No unsupported hoisted source remains. |
| Backend Node/Edge discovery and target inference | Fresh and supported upgrade run real discovery and root orchestration probes. The focused application test owns renamed/multiple topology. |
| Confect compatibility | Existing fresh-product authored API/codegen/runtime probe. Its inputs are the current APIs and generated containers; the native upgrade converges all four Confect packages, and the authored fixture qualifies their installed APIs and registered reader checks. |
| Reinstall stability and sync rerun/idempotence | Fresh and supported stable upgrade each verify frozen/ordinary installs, unchanged lock/resolution, strict AuthKit proof and byte-stable sync with `sync:check`. |
| Migration rerun/idempotence | The current factory has canonical no-op and rerun unit proofs. The supported product reruns its actual native plan and compares every managed manifest and `bun.lock` byte-for-byte. Old factory-specific reruns retire with the old chain. |
| Context7 upgrade behavior | Supported `1.0.4` product proof plus existing sync unit tests. Fresh creation and packed ownership checks are unchanged. |

### Retained AuthKit compatibility

`src/compatibility/authkit-test.ts` and its patch asset are current preset dependencies. Their ownership, preservation, conflict and idempotence tests move from the historical migration wrapper to `src/compatibility/authkit-test.spec.ts`. The repository's real isolated-install regression now uses the current dependency tuple. It first observes missing `convex-test` and `vite/client` diagnostics through the upstream public test import, applies the current installer, and proves strict declarations, default/custom component registration and component queries. Upstream runtime source stays unchanged. Removing only the mapping and asset followed by ordinary Bun installation restores the original diagnostics without dependency-directory cleanup.

Fresh and supported upgraded products retain this public-entrypoint type/runtime proof and repeat it after reinstalls. The retired rc.3 migration wrapper is unnecessary because published stable `1.0.4` already includes the patch. See generated dependency guidance for its current ownership and eventual upstream-fixed removal procedure.

### Context7 provisioning

Fresh packed creation and supported upgrade verify `.codex/config.toml` and `.mcp.json` use hosted Context7 with no credentials or subprocess. Harness instructions and canonical agent guidance retain automatic selective retrieval, fallback and authority order. Installed sync accepts equivalent entries, preserves unrelated configuration, and rejects customized endpoints or sealed inline TOML before any managed writes. Codex insertion preserves original text. Sync rerun includes both configuration files and harness routing files. KEE-60 changes no Context7 behavior.

Phase logs record package/source setup, fresh creation and compatibility, canonical checks, shadcn, reinstall/sync and the supported upgrade. Total timing measures the same complete gate before and after cleanup. Timings describe the run and impose no performance threshold.

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

The disposable consumer verifies the installed Keenko version, representative files that must survive packaging, the expected native migration metadata, and fidelity of a representative third-party license. It runs the first-install canonical `bun run check`, verifies frozen and ordinary reinstall stability from the generated lockfile, and verifies the exact Keenko version again. Preset and sync tests own generated shape and managed-state behavior; the consumer check owns its internal codegen, formatting, lint, typecheck, test, and build lifecycle.

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

The packed contract now checks required peers from each installed dependency's own location under isolated resolution. A temporary authored Confect fixture passes through codegen, backend typechecking and real TestConfect execution in the fresh product. It verifies argument field maps, client-safe core tables, generated container annotations, named runners, direct test layers, registered document decoding, cardinality, stream composition and cursor pagination. The fixture is removed and codegen restores the canonical generated state before the consumer check and idempotence tests.

The current expected dependency roles are test-owned, independent of retired migration snapshots. Native Nx owns future applicable transformations. Active version plans resolve the intended next release line; product acceptance never publishes it.

## Backend/shared policy and partial RC recovery

The source fixture names stable 1.0.4 and published rc.0 once. Both unchanged archives are downloaded from npm, republished only to the isolated registry, and bootstrapped with their own exact Nx dependency. Three consumers cover direct stable upgrade, successful published-RC upgrade and recovery after the published rc.0 migration fails on a common backend/shared type override. The latter proves that planning/install already changed package/lock state while the failed factory left configuration/manifests untouched.

Recovery regenerates the native plan with `--from=keenko@1.0.4`, installs the local new-RC candidate and executes both idempotent entries. Each upgraded consumer repeats the compatibility, build, reinstall and rerun gates. The original data or feature helper is compared byte-for-byte according to its authentic source topology.

Fresh and all upgraded consumers run actual Oxlint on ordinary type declarations in backend, shared, UI and the application. Backend/shared succeed; UI/application retain their type-definition diagnostic. The preset's common type override contains only the one rule. It does not spread backend Effect policy into shared. Focused AST migration tests preserve consumer common/separate Effect overrides and reject conflicting or ambiguous state before any write.
