# Product acceptance

## Local unpublished package

From the repository root, install the reference Node and Bun toolchain, then run the required packed-product gate:

```sh
bun install --frozen-lockfile
bun run test:product
```

This mode starts the repository's `keenko:local-registry` Nx target, builds and packs Keenko, assigns a unique disposable `<repository-version>-product.<unique-run-id>` version, and publishes the archive under the `latest` tag to the loopback Verdaccio registry at `http://127.0.0.1:4873`. A disposable install primes an isolated Bun cache with the pinned `create-nx-workspace` bootstrap through that registry, after which the documented `bunx create-nx-workspace@23.2.0 --preset=keenko` form proves bare-preset resolution selects the unpublished packed artifact. Verdaccio is a local development convenience and is not part of production release acceptance.

Before Keenko `1.0.0`, this acceptance path proves only the current fresh generated state. Pre-1.0 projects are disposable dogfood and are recreated when that state changes; there is no `0.x` upgrade fixture or forward-migration gate. `1.0.0` is the first supported project compatibility baseline. Later releases add native Nx migrations only when an existing supported project requires a persisted repository-state transformation.

## Exact published package

After Nx Release has published an exact version to npm, run the release-grade acceptance with that version:

```sh
bun run test:published -- <exact-version>
```

The argument must be one concrete SemVer, including an optional prerelease or build suffix. Missing arguments, caret/tilde ranges, and dist-tags such as `latest` or `next` fail before any workspace or registry process is created. This mode does not pack repository source, rewrite a package version, start Verdaccio, or override registry configuration. It runs the canonical public bootstrap with `bunx create-nx-workspace@23.2.0 --preset=keenko@<exact-version>` and verifies that exact version in the consumer's installed `node_modules/keenko/package.json`.

The disposable consumer verifies the installed Keenko version, representative files that must survive packaging, the absence of pre-1.0 migration metadata, and fidelity of a representative third-party license. It then runs the generated consumer's canonical `bun run check` once. Preset and sync tests own generated shape and managed-state behavior; the consumer check owns its internal codegen, formatting, lint, typecheck, test, and build lifecycle.

Major phases print a concise start line and elapsed time on completion. These diagnostics identify where a slowdown occurred without defining a runtime threshold.

## Live shadcn compatibility

Run the external compatibility smoke explicitly:

```sh
bun run test:shadcn
```

This command uses the same clean local packed-consumer creation path, then invokes the exact generated shadcn CLI version against the live shadcn registry. It verifies that `button` and `input-otp` route into `packages/ui`, that the application does not receive app-local copies, and that the added dependency is usable from the UI package. It is intentionally not invoked by `bun run check`, `bun run test:product`, normal CI, or release verification. A registry outage or upstream CLI failure therefore remains visible without making deterministic packed-distribution acceptance depend on that external service.

Internet access is required for public dependencies; `test:shadcn` additionally requires live shadcn registry access. No publishing credentials or Nx Cloud account are required. Temporary npm registry configuration and caches exist only in local unpublished mode; published mode uses the caller's normal public npm configuration.

The executable procedures live in `tests/packed-product.ts`. Effect scope stops the local-registry child and removes the temporary cache, archive, and consumer on completion or failure. The tests require Node compatible with the package engine, Bun, npm, and Git on `PATH`, plus the repository's installed dependencies. On failure, use the last phase start/completion lines to identify the boundary, correct that cause, and rerun the same command; do not increase the command timeout or add retries or sleeps.

## Release workflow and recovery

The release workflow installs from the lockfile, runs `bun run check` (which includes `pack:check`), validates version plans, and runs `bun run test:product` before invoking `bun x nx release --yes`. Nx remains the sole versioning, changelog, tag, push, and npm publication authority. After Nx succeeds, the workflow reads the version Nx wrote to the root `package.json`; it does not calculate a version independently.

Before published acceptance, `bun run release:wait-for-published -- <exact-version>` creates a fresh temporary package project and isolated Bun cache on each attempt, installs the exact package selector from `https://registry.npmjs.org` through Bun's real install path, and verifies the installed `node_modules/keenko/package.json` version. It retries every 10 seconds, makes at most 25 attempts, and has a hard five-minute timeout. A different installed version does not satisfy the check, and both temporarily unavailable packages and transient resolver failures are retried within the same bound. Once Bun can install the exact version, the workflow passes it unchanged to one `bun run test:published -- <exact-version>` invocation.

If registry propagation exceeds the bound, the workflow fails with the exact selector, attempt count, timeout, and last install failure. Rerun the unchanged `bun run release:wait-for-published -- <exact-version>` command after npm propagation completes, then run `bun run test:published -- <exact-version>` once; do not rerun Nx Release or publication. If published acceptance exposes a product defect, the workflow fails visibly. The npm publication and release tag are immutable release events: do not unpublish, delete the tag, rewrite the release, or force-push history. Diagnose the consumer failure and ship a subsequent corrective release through the same Nx version-plan process.
