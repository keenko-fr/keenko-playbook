# Product acceptance

## Local unpublished package

From the repository root, install the reference Node and Bun toolchain, then run the required packed-product gate:

```sh
bun install --frozen-lockfile
bun run test:product
```

This mode starts the repository's `keenko:local-registry` Nx target, builds and packs Keenko, assigns a unique disposable `<repository-version>-product.<unique-run-id>` version, and publishes the archive under the `latest` tag to the loopback Verdaccio registry at `http://127.0.0.1:4873`. A disposable install primes an isolated Bun cache with the pinned `create-nx-workspace` bootstrap through that registry, after which the documented `bunx create-nx-workspace@23.2.0 --preset=keenko` form proves bare-preset resolution selects the unpublished packed artifact. Verdaccio is a local development convenience and is not part of production release acceptance.

## Exact published package

After Nx Release has published an exact version to npm, run the release-grade acceptance with that version:

```sh
bun run test:published -- <exact-version>
```

The argument must be one concrete SemVer, including an optional prerelease or build suffix. Missing arguments, caret/tilde ranges, and dist-tags such as `latest` or `next` fail before any workspace or registry process is created. This mode does not pack repository source, rewrite a package version, start Verdaccio, or override registry configuration. It runs the canonical public bootstrap with `bunx create-nx-workspace@23.2.0 --preset=keenko@<exact-version>` and verifies that exact version in the consumer's installed `node_modules/keenko/package.json`.

The disposable consumer verifies representative package and shipped-file state, initial generated state from creation, canonical codegen/test/build/check behavior, fail-closed Git inspection, modified and newly created tracked-intent generated drift, authored Confect isolation, ignored generated output, unrelated dirty project files, one sync drift-and-repair cycle, first-party shadcn routing and dependency installation, Nx/Oxlint boundary enforcement, discovery of an additional workspace package, and a frozen reinstall. It injects a meaningful failing Vitest test to prove `bun run check` executes the inferred Nx test targets, then removes it. Narrow assertions call their owning command; the complete `bun run check` runs at meaningful generated-state, regression, and complete-consumer milestones.

Both paths use the Git repository initialized by `create-nx-workspace`. Acceptance verifies unborn `main`, runs `bun run check` successfully before the first commit, then creates disposable commits only for later drift baselines. The final phase removes installed `node_modules` directories and runs:

```sh
bun install --frozen-lockfile
bun run check
git status --porcelain
```

The final status must be empty. Git commits occur only in the disposable consumer, not this repository.

Internet access is required for public dependencies and shadcn registry content. No publishing credentials or Nx Cloud account are required. Temporary npm registry configuration and caches exist only in local unpublished mode; published mode uses the caller's normal public npm configuration.

The executable procedure lives in `tests/packed-product.ts`. Effect scope stops the local-registry child and removes the temporary cache, archive, and consumer on completion or failure. The test requires Node compatible with the package engine, Bun, npm, and Git on `PATH`, plus the repository's installed dependencies.

## Release workflow and recovery

The release workflow installs from the lockfile, runs `bun run check` (which includes `pack:check`), validates version plans, and runs `bun run test:product` before invoking `bun x nx release --yes`. Nx remains the sole versioning, changelog, tag, push, and npm publication authority. After Nx succeeds, the workflow reads the version Nx wrote to the root `package.json`; it does not calculate a version independently.

Before published acceptance, `bun run release:wait-for-published -- <exact-version>` creates a fresh temporary package project and isolated Bun cache on each attempt, installs the exact package selector from `https://registry.npmjs.org` through Bun's real install path, and verifies the installed `node_modules/keenko/package.json` version. It retries every 10 seconds, makes at most 25 attempts, and has a hard five-minute timeout. A different installed version does not satisfy the check, and both temporarily unavailable packages and transient resolver failures are retried within the same bound. Once Bun can install the exact version, the workflow passes it unchanged to one `bun run test:published -- <exact-version>` invocation.

If registry propagation exceeds the bound, the workflow fails with the exact selector, attempt count, timeout, and last install failure. Rerun the unchanged `bun run release:wait-for-published -- <exact-version>` command after npm propagation completes, then run `bun run test:published -- <exact-version>` once; do not rerun Nx Release or publication. If published acceptance exposes a product defect, the workflow fails visibly. The npm publication and release tag are immutable release events: do not unpublish, delete the tag, rewrite the release, or force-push history. Diagnose the consumer failure and ship a subsequent corrective release through the same Nx version-plan process.
