# Product acceptance

## Local unpublished package

From the repository root, install the reference Node and Bun toolchain, then run the required packed-product gate:

```sh
bun install --frozen-lockfile
bun run test:product
```

This mode starts the repository's `keenko:local-registry` Nx target with disposable storage, builds and packs Keenko, assigns a unique disposable `<Nx-resolved-RC>-product.<unique-run-id>` version, and publishes the archive under the `latest` tag to the loopback Verdaccio registry at `http://127.0.0.1:4873`. Nx Release resolves the RC through a version-plan dry run. After release has consumed the plans, the harness uses the repository RC version. The temporary candidate must include the later corrective migration boundary. This changes only the temporary archive's version, never repository release state. A disposable install primes an isolated Bun cache with the pinned `create-nx-workspace` bootstrap through that registry, after which the documented `bunx create-nx-workspace@23.2.1 --preset=keenko` form proves bare-preset resolution selects the unpublished packed artifact. Verdaccio is a local development convenience and is not part of production release acceptance.

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

The second install is unconditional. Acceptance verifies that Nx discovers and runs the separate application-workspaces, backend Vitest exclusions, dependency-baseline, and Bun linker migrations in order and that their executable factories and assets survive packaging. Migration tests verify that the dependency generator never changes `bun.lock`. Nx may itself invoke Bun when manifests change; the explicit second install still always runs. The frozen dependency data has five ownership roles: root, application, backend, UI, and shared. One application-role tuple is replicated across sorted direct `apps/*` manifests classified `type:app` by KEE-45. The managed slot count is `15 + 32 × N + 13 + 14 + 1`, where `N` is the application count. Fresh one-app generation has 75 slot instances; the three-app upgrade has 139. Every instance must agree with its role baseline, while consumer-owned dependencies remain unchanged. The target includes UI's required `@types/react` development dependency; the dependency migration restores that slot in historical consumers. The focused backend Vitest migration preserves native default exclusions and changes only the recognized Keenko-owned Node configuration. The linker migration recognizes the historical generated hoisted configuration and adopts isolated installation with `hoist = false`, preserving safely recognized unrelated settings and rejecting ambiguous owned state. A canonical migration rerun must leave the Bun configuration, backend Vitest configuration, manifests, and lockfile unchanged. After the second install, frozen and ordinary reinstalls must leave the lockfile and module resolution unchanged, and installed package state must match the target. All consumers complete sync, codegen, and canonical checks. Backend ownership fixtures prove ordinary authored tests run in Node, authored integration tests run once in Edge Runtime, generated Convex tests are excluded, and dependency-owned tests are not collected. The fixtures are removed before the canonical check.

A fifth consumer is generated from the unchanged published `keenko@1.0.2-rc.0` npm archive. It adds a generic `type:app` workspace with divergent managed slots and a consumer-owned dependency. Native Nx selects only `1.0.2-application-dependency-baseline` at `1.0.2-rc.1` for this path. The correction converges the additional application, leaves the canonical initial application byte-for-byte unchanged, completes the same lifecycle, and remains idempotent. Direct `1.0.1` upgrades select the original four rc.0 entries in order, followed by this corrective entry. The original dependency entry uses the corrected role implementation, so renamed applications never encounter the published literal `apps/web` requirement. Both dependency entries use the same packed factory and immutable role data.

The proof is part of the existing `test:product` gate used by CI and the release workflow. It migrates only disposable consumers and never publishes to public npm. `test:published` retains its separate exact-published fresh-consumer proof, and `test:shadcn` remains the separate live-registry smoke.

The divergent fixture reproduces the historical workspace-local Effect prerelease after the first hoisted install. The native linker migration and unconditional second install must eliminate that shadow without deleting dependency directories; installed Effect must agree with the target manifest and lockfile.

Fresh creation uses the canonical isolated linker with the virtual-store phantom-dependency fallback disabled from its first install. The generator's initial codegen and the complete canonical check must pass before any reinstall. A Node probe from the actual Nx TypeScript plugin context must resolve the root direct TypeScript JavaScript API and expose `readConfigFile`. The separately selected `@typescript/native` compiler must remain independently resolvable and executable. The same probes run in every upgrade consumer and after frozen and ordinary reinstalls; their resolved paths and identities must remain unchanged. The proof also checks that Bun's documented virtual-store fallback directory is absent, without depending on private store package filenames.

KEE-51's backend discovery boundary runs on these actual canonical isolated installations. Backend-local dependency-owned tests must be reachable, while only the authored Node fixture and Edge Runtime integration fixture run, exactly once in their intended projects. Generated Convex and dependency-owned tests remain excluded. This retains the focused backend ownership proof within the complete KEE-50 product gate.

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

Stable mode requires the repository to already be on an RC version. It derives the stable target by removing the prerelease suffix from the current version, then runs `bun x nx release "$STABLE_TARGET" --skip-publish` and publishes through `bun x nx release publish --tag latest`. For example, `1.0.1-rc.3` promotes to `1.0.1`. Stable mode rejects an already-stable repository version. Selecting stable and moving `latest` remain an explicit human decision: no RC automatically promotes, and the workflow remains manual.

Nx remains the sole versioning, changelog, Git tag, push, GitHub release, and npm publication authority. `--skip-publish` suppresses only the top-level command's implicit npm publication; the explicit Nx publish phase publishes the already-versioned package and does not perform another version transition or consume another version plan. npm dist-tag behavior is part of the release contract: RC publication moves only `rc`, while stable publication moves only `latest`. After both Nx phases succeed, the workflow reads the version Nx wrote to the root `package.json`; it does not calculate a published version independently.

Before publication, the workflow records npm's `latest` and `rc` versions as `PREVIOUS_LATEST` and `PREVIOUS_RC`. These values are the original pre-publication registry snapshot. If `rc` is absent, `PREVIOUS_RC` is an empty string; the quoted argument below preserves that empty value.

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
