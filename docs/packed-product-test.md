# Product acceptance

## Local unpublished package

Install the reference Node and Bun toolchain, then run the required packed-product gate:

```sh
bun install --frozen-lockfile
bun run test:product
```

The gate proves fresh candidate creation and one direct upgrade from published stable `keenko@1.0.6`. `tests/fixtures/upgrade-source.json` owns that source. Direct support defaults to immediately preceding stable → current stable. Prereleases and older stable releases are outside this window; sequential historical recovery has no default guarantee. A wider window requires an explicit product decision. A temporary corrective exception additionally qualifies published `1.0.7-rc.0` for `1.0.7-rc.1`; it is not a permanent supported origin.

The harness starts the repository's `keenko:local-registry` Nx target with disposable storage at `http://127.0.0.1:4873`. It downloads the source archive from public npm, serves it unchanged through that registry and creates an authentic stable source consumer and controlled copies for the current corrective RC cases. Its Nx bootstrap cohort comes from the published manifest's exact `@nx/devkit` dependency. Fresh candidate creation uses `create-nx-workspace@23.3.0`. Source and candidate bootstraps have isolated Bun caches. To reproduce the supported source runtime, the registry serves the unchanged `@effect/platform-node-shared@4.0.2` archive recorded in the `v1.0.6` lockfile, excluding later shared versions that require a newer Effect core. The fixture owns this source runtime pin. After all source/recovery preparations, the registry also receives the candidate shared runtime 4.0.5. Other packages use the public npm uplink. Neither published archive is modified, and no dependency override is added.

Keenko is built and packed. Before candidate relabeling, a separate cold isolated install of that archive resolves dependencies directly from public npm with a new Bun cache. It imports the real plugin and checks that the Node adapter resolves Keenko's exact shared runtime and a compatible Effect peer. This check bypasses the source registry restrictions, so those restrictions cannot hide a candidate resolution defect.

The temporary archive receives a unique `<Nx-resolved-RC>-product.<unique-run-id>` version and the local `latest` tag. Nx Release resolves the candidate through a version-plan dry run. After plans have been consumed, the harness uses the repository RC version. On a stable repository without a planned RC, native `nx release version prerelease --preid rc --dry-run` resolves the next disposable RC. Only the archive label changes; the root package version, release plans and public npm remain untouched. A disposable install primes the candidate's isolated Bun cache with the pinned bootstrap. Bare `--preset=keenko` must resolve to the packed candidate.

### Supported stable upgrade

The authentic `1.0.6` consumer follows native Nx's lifecycle:

```sh
bun x nx migrate keenko@<packed-candidate-version>
bun install
bun x nx migrate --run-migrations
bun install
bun x nx sync
bun run codegen
bun run check
```

This transition must produce its current dependency migration; an absent or empty plan fails acceptance. Other releases may have no applicable persisted-state transformation. The second install is unconditional. Bun alone reconciles installed packages and `bun.lock`.

The candidate publishes a new managed tuple and one native `1.0.7-managed-dependencies` migration. The source identity, original manifests and actual installed versions are checked before upgrade. Consumer-owned `is-number@7.0.0` is added; a shared Effect slot is moved and a backend test slot removed. Native Nx must discover exactly the current dependency migration. After both Bun installations, every target slot, opposite-section absence, lock workspace entry and installed version is verified. The run prints each changed slot as an explicit before/after version pair.

The migration preserves consumer helper, compiler and lint configuration bytes. Sync installs canonical guidance, followed by codegen and the complete consumer check. Backend discovery, orchestration and AuthKit run on the upgraded installation. Frozen/ordinary reinstalls, sync and migration reruns prove byte stability. The completed current plan is archived only after final verification.

### Corrective RC and residual plans

The same genuine stable consumer seeds three published rc.0 cases: clean plan, previously executed `1.0.6-optional-data-coverage` plan retained, and unapplied plan with missing data compiler coverage. The exact residual entry is test-owned in `tests/fixtures/residual-1.0.6-migrations.json`. It is never shipped.

Both residual cases reproduce rc.0's native `ERR_INVALID_ARG_TYPE` / `readMigrationCollection` failure and assert no mutation. The unapplied case must fail postcondition review and keep its plan. It restores the published `1.0.6` owner, executes the original factory through Nx and verifies the compiler/lint postconditions before archiving. The applied case verifies the same postconditions before archiving its retained plan. Neither recovery manufactures an empty plan. All three then upgrade from installed rc.0 to the packed candidate using the same dependency convergence and complete consumer checks as N-1. This tests the documented explicit recovery; no recovery engine is shipped.

### Fresh product

Fresh creation owns the current generated shape and package behavior. It verifies the first installed candidate before any reinstall, the isolated linker with phantom fallback disabled, and exact managed slots across root, application, backend, UI and shared roles. `tests/fixtures/current-dependencies.json` is test-owned expected data, checked against the preset and `packageVersions`. It is not a shipped migration snapshot.

The Node resolution probe runs from Nx's real TypeScript plugin context. It must resolve the root direct JavaScript API and expose `readConfigFile`. The independent `@typescript/native` compiler must resolve and execute. Required peers, Nx packages and installed Effect versions must agree with manifests. Fresh root Nx specifications align with the bootstrap cohort. The supported source may retain bootstrap-owned scaffolds outside the managed tuple; upgrades preserve those specifications.

Fresh and upgraded consumers run real backend Node/Edge, application jsdom, UI jsdom and shared Node targets. Discovery probes require authored fixtures to run once and dependency-owned/generated Convex tests to remain excluded. Probes are removed before canonical verification.

Fresh owns the Confect API/codegen/runtime fixture, compiler coverage probes for `data/`, `domain/` and `errors/`, and actual backend/shared type-policy probes. The Confect fixture verifies current generated containers, decoding, cardinality, streams, pagination, canonical domain/error examples, direct persistence and root rollback. Removing it and rerunning codegen restores canonical state. The upgrade runs the complete consumer check without duplicating these current-API fixtures.

Packed assertions require the single current migration entry, `nx-migrations` metadata and its compiled factory, and reject historical factories. They also require current preset, guidance, skills, licenses and AuthKit assets. Test-only fixtures are not shipped. Deterministic shadcn acceptance, reinstall and synchronization remain in the fresh gate. CI and release invoke the same full gate for product changes.

### Verification ownership

Historical packages, tags, changelogs and release reports remain the record of past qualification. Executable compatibility is retained only for the supported path or current behavior.

| Guarantee | Verification owner |
| --- | --- |
| Managed dependency baseline | Preset tests compare every role with current expected slots. Fresh and published-source products verify manifests, dependency sections, lock entries and installed versions. The focused migration tests cover changed, moved, deleted and duplicate slots, all roles and classified sibling applications. Installed upgrades verify convergence to the changed tuple. |
| Consumer customization and atomic conflicts | Sync and AuthKit tests own routing, MCP, project files and patch preservation/conflicts. Packed fresh acceptance exercises installed Context7 ownership. The supported upgrade checks consumer helper/configuration bytes and foreign dependency specifications. |
| Bun lockfile ownership | Product planning and sync preserve lockfile bytes; real Bun installs reconcile it. Repository lockfile tests protect installation stability. The dependency factory preserves lock bytes; only Bun installs update them. |
| Installation and resolution | A cold public-registry archive install verifies the plugin runtime independently of the source registry. Fresh and N-1 products check manifests, lock entries, actual versions, TypeScript APIs, peers, Effect and the isolated linker, then frozen/ordinary reinstalls. |
| Generation, sync and idempotence | Preset/sync tests own field and file policy. Packed fresh generation and supported upgrade both run codegen/check, canonical guidance checks and byte-stable sync. |
| Compilation and product tests | Fresh owns compiler/type-policy and current Confect probes. Both products run complete consumer checks, discovery, target orchestration and AuthKit compatibility. |
| Renamed/multiple applications and boundaries | `tests/module-boundaries.spec.ts` and preset/generated-drift tests; no additional published-source bootstrap. |
| Migration planning | Real installed Nx in the supported product. Focused native selection checks cover 1.0.6 and this corrective rc.0 origin. Installed products cover the real plan and residual recovery. No historical 1.0.4/1.0.5 matrix returns. |

### Retained compatibility assets

The AuthKit installer and native Bun patch remain current preset dependencies. Focused ownership tests cover preservation, conflicts, repairs and idempotence. The isolated-install regression and packed products verify the public test entrypoint's strict types and real component queries. Upstream runtime source stays unchanged. See generated dependency guidance for removal when upstream fixes the defect.

Context7 provisioning remains sync-owned. Focused sync tests and fresh packed ownership checks cover equivalent entries, unrelated configuration and atomic conflicts. Both fresh and upgraded consumers verify hosted entries and synchronized guidance. No credentials or subprocess are generated.

Phase logs record source/package preparation, the cold public-registry runtime check, fresh acceptance and the stable plus targeted corrective RC upgrades. Timings describe the run and impose no threshold.

## Repository CI boundaries

This is Keenko repository policy, not generated consumer guidance. The required GitHub Actions `check` runs on every configured PR verification event, including drafts and edits, with no workflow path filters or job-level skip. Main pushes run no CI. PR edits rerun verification so retargeting cannot keep a lightweight check computed against another base. GitHub also sends this event for title/body edits; those metadata edits currently rerun CI to keep the required check unconditional. Main ruleset `22343266` requires PRs and GitHub Actions `check` from integration `15368`, with `strict_required_status_checks_policy: true`. When main advances, a previously green PR must incorporate current main and pass verification again before merging. Update the PR branch and rerun its applicable checks; do not restore main-push CI. Only the Release App bypasses review/status requirements, and no actor bypasses the separate history protection ruleset.

`tests/ci-verification.ts` classifies the tested merge tree against the PR common ancestor using a NUL-separated Git diff with rename detection disabled. This includes deletions, both rename paths and concurrent base-side changes. Only explicit canonical Markdown locations (`src/generators/sync/files/docs`, `files/skills`, the two harness fragments and packaged root README) count as guidance. Repository `docs/**/*.md` and version plans are documentation. Every other path, an empty comparison, or any mixed product change selects full verification. Markdown elsewhere has no exemption.

- Repository documentation runs formatting and native release-plan validation. The existing minimum-Node build/typecheck remains.
- Canonical guidance runs `bun run check` and `bun run test:product -- --guidance`. This uses the same packed artifact and complete fresh acceptance as full product verification, including all canonical Markdown byte equality, consumer checks, reinstall and synchronization/idempotence. Published source setup and the upgrade matrix are omitted because generator, migration, dependency and verification implementation are unchanged. Focused preset/sync regression checks remain in the repository gate.
- Product, build, dependencies, compatibility, release machinery and verification infrastructure run the full repository and product gates, including the direct N-1 upgrade.

Failures propagate through the required `check`; classification failures never succeed as a skipped job. Removing main CI does not assert that a squash commit SHA was tested. Release preparation independently proves tree equivalence or checks the selected revision again. Anoulà's actual consumer qualification remains a separate release requirement.

## Exact published package

After both readiness stages in [Release workflow and recovery](#release-workflow-and-recovery) succeed, run one complete acceptance of the exact published version, then a lightweight public selector installation for its release mode:

```sh
bun run test:published -- <exact-version>
bun run tests/wait-for-published.ts --selector <exact-stable-version> latest
bun run tests/wait-for-published.ts --selector <exact-rc-version> rc
```

The public selector contract is:

- `keenko` resolves the npm `latest` dist-tag and therefore the current stable release.
- `keenko@rc` resolves the npm `rc` dist-tag and therefore the current release candidate.
- Exact-version acceptance proves the published artifact itself.
- Selector acceptance installs the npm distribution tag in a fresh project with an isolated Bun cache and verifies the installed package version. Fresh preset generation is owned by the exact-version full acceptance. The selector does not repeat generation or consumer checks.

The expected version must be one concrete SemVer, including an optional prerelease or build suffix. By default, published acceptance creates the consumer with `--preset=keenko@<exact-version>`. The full test CLI still accepts an explicit preset selector for diagnosis, but release CI uses it only once with the exact version. This mode does not pack repository source, rewrite a package version, start Verdaccio, or override registry configuration. It runs the canonical public bootstrap with the selected preset and verifies the expected exact version in the consumer's installed `node_modules/keenko/package.json`.

The disposable consumer verifies the installed Keenko version, representative files that must survive packaging and fidelity of a representative third-party license. It runs the first-install canonical `bun run check`, verifies frozen and ordinary reinstall stability from the generated lockfile, and verifies the exact Keenko version again. Preset and sync tests own generated shape and managed-state behavior; the consumer check owns its internal codegen, formatting, lint, typecheck, test, and build lifecycle.

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

Git's exact, root-anchored exclusion pathspecs omit only `.github/workflows/ci.yml`, repository Markdown under `docs/`, `tests/packed-product.ts`, `tests/release-version.ts`, `tests/wait-for-published.ts`, `tests/wait-for-published.spec.ts`, and the generated root `CHANGELOG.md` from the CI plan-check input. The release workflow and the two `tests/ci-verification` files are also excluded as unpackaged repository infrastructure. These exclusions never select lightweight PR verification: infrastructure changes still receive full checks. All excluded files are absent from the published archive. No persistent Nx ignore rule is added: `nx.json` retains `versionPlans: true` and is not excluded. Changes to `nx.json`, package manifests, source, generators, migrations, and packaged documentation still require a plan. Direct `bun x nx release plan:check` retains its strict repository configuration. An infrastructure change that alters published contents or the runtime contract must include those changed package inputs and follow the normal release process.

The release workflow has one required `mode` choice: `rc` or `stable`. Both modes install from the frozen lockfile and always validate version plans. Before publication, a bounded lookup examines the latest 50 successful PR runs of this repository's exact CI workflow. GitHub-owned job metadata must prove successful repository and release-plan steps plus full product or focused guidance acceptance, the exact recorded tested Git tree/revision/release-tag and actual Node/Bun versions, and successful minimum-Node verification in that run attempt. Fork runs, docs-only success, missing or skipped required steps, different workflow IDs/paths and different trees are rejected. The CI workflow bytes at the run head must also equal the release workflow's current CI file. This uses GitHub's jobs API and requires only `actions: read` on the ordinary workflow token, not broader Release App permissions.

A full match replaces repeated `bun run check` and `bun run test:product`. A guidance match replaces only `bun run check`, since focused guidance CI also runs that complete repository gate. Release still runs full supported-upgrade acceptance. Actual Node/Bun version equality rejects toolchain drift without changing pins. Exact full-tree equality includes dependency pins/lockfile, generators, migration fixtures, packaging/release scripts, plans and workflows. The recorded tree comes from the actual checked-out PR merge revision, not the run's PR head SHA; a squash commit can reuse it only if its complete tree matches, its parent is the tested merge base, and the tested merge has the recorded PR head as its second parent. The tested and selected revisions must have the same nearest release tag recorded during CI, preserving native Nx history/tag inputs. No comparison is made by branch name. Before evidence can be recorded, CI also rejects tracked repository drift.

Missing, failed, expired or mismatched evidence falls back to both full checks. A release-generated version/changelog/plan-consumption commit has a different tree and therefore retains full verification. Stable promotion commonly takes this fallback. Guidance-only releases retain supported-upgrade verification because focused evidence alone cannot prove full product acceptance. Normalizing release commits or propagating older product evidence would need proof of native Nx candidate selection, metadata and supported-source equivalence; this implementation intentionally keeps that exact blocker rather than relaxing equality.

The workflow validates the exact dispatched current-main SHA at entry and again immediately before Nx mutation. Main advancing during verification aborts release. Nx still owns a fast-forward push, so a race after the second check cannot rewrite main. Release App identity, contents-only App permission, OIDC publication, separate no-bypass history protection, manual mode selection and human publication authorization remain unchanged.

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

Only after both readiness stages succeed does the workflow verify the exact published artifact once and then install its public selector with the same bounded readiness policy. RC releases use `keenko@rc`; stable releases use bare `keenko`. Both checks expect the exact version published by Nx:

```sh
bun run test:published -- "$PUBLISHED_VERSION"
if [ "$RELEASE_MODE" = "rc" ]; then
  bun run tests/wait-for-published.ts --selector "$PUBLISHED_VERSION" rc
else
  bun run tests/wait-for-published.ts --selector "$PUBLISHED_VERSION" latest
fi
```

If publication succeeded but registry convergence exceeded the bound, do not rerun Nx versioning or Nx publication. Preserve the original pre-publication registry snapshot and rerun the four-argument waiter above with the original `PUBLISHED_VERSION`, `RELEASE_MODE`, `PREVIOUS_LATEST`, and `PREVIOUS_RC`, including an empty previous-RC value. Do not reconstruct either previous tag value from the registry after publication: those values describe pre-publication state. Only after both readiness stages succeed should recovery rerun the corresponding published acceptance commands above. The backward-compatible one-argument waiter proves only exact installation and is insufficient for release readiness or recovery.

If published acceptance exposes a product defect, the workflow fails visibly. The npm publication and release tag are immutable release events: do not unpublish, delete the tag, rewrite the release, or force-push history. Diagnose the consumer failure and ship a subsequent corrective release through the same Nx version-plan process.

## Final dependency compatibility qualification

The final sweep before candidate dogfood rechecks registry candidates, engines, peers and material release notes for every managed package. Coupled families are qualified together. A release-blocking corrective pass may explicitly reopen qualification before publication: record a new cutoff and requalify all candidates available then. Freeze the tuple after the final successful pre-RC qualification. Later publications belong to the next release cycle unless a human explicitly reopens qualification. Actual RC dogfood and accepted-RC stable promotion do not include unrelated dependency refreshes. See [KEE-55 qualification](reports/kee-55.md) for the recorded sweep and exceptions.

The packed contract now checks required peers from each installed dependency's own location under isolated resolution. A temporary authored Confect fixture passes through codegen, backend typechecking and real TestConfect execution in the fresh product. It verifies argument field maps, client-safe core tables, generated container annotations, named runners, direct test layers, registered document decoding, cardinality, stream composition and cursor pagination. The fixture is removed and codegen restores the canonical generated state before the consumer check and idempotence tests.

The current expected dependency roles are test-owned, independent of retired migration snapshots. Native Nx owns future applicable transformations. Active version plans resolve the intended next release line; product acceptance never publishes it.
