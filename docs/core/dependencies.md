# Dependencies

## Package/runtime policy

- Node 24 is the tooling runtime for Nx and tools that require Node. Bun is the package manager, workspace script entry point, lockfile owner, and application runtime wherever the selected stack supports it.
- The current v1 baseline supports Bun `>=1.4.0 <2`. Bun `1.4.0` is the minimum supported version and the reference verification version. Bun `<1.4.0` is unsupported. Bun 2.x is outside the supported range; supporting a new Bun major requires an explicit compatibility decision and verification.
- A root declaration such as `"packageManager": "bun@1.4.0"` records the repository's reference toolchain version. For the v1 baseline it matches the minimum/reference version, but it does not narrow the supported range or make newer compatible Bun 1.x releases unsupported.
- A repository has one canonical package manager and one corresponding lockfile. Do not mix competing lockfiles.
- Keep the committed Bun lockfile format version 2 canonical. Lockfile format version 2 is separate from the Bun 2.x runtime major. Do not regenerate or downgrade the lockfile to accommodate an unsupported local Bun; update the local Bun runtime instead.
- Do not add mise, asdf, Volta-like machinery, custom bootstrap scripts, or another version-manager requirement solely to enforce this baseline.
- Do not use a `preinstall` script as the Bun compatibility guard. An incompatible Bun can fail while parsing `bun.lock` before repository scripts run.
- Generated workspaces declare Node `>=24 <25` and Bun `>=1.4.0 <2`. Keenko does not add a lifecycle wrapper solely to preflight those ranges before native Nx or Bun commands run.

## Adding dependencies

Add a dependency only for a concrete capability not already provided adequately by the platform, standard library, installed stack, or a small owned implementation. Prefer stack-native/first-party integrations before building a Keenko compatibility facade.

## Versions

- Stable dependencies may use normal semver ranges in the manifest; the committed lockfile is the reproducible resolution.
- The canonical formatting/linting toolchain is an explicit exception: exact-pin the versions listed in `tooling.md` because formatter output, preset rules, and type-aware diagnostics are convention behavior.
- Exact-pin prereleases and other tightly coupled package families when version skew is unsafe.
- Verify peer compatibility for coupled stacks. In particular, treat `@effect/tsgo`, TypeScript, Oxlint, and `oxlint-tsgolint` as a compatibility unit and verify the currently supported tuple from Effect's first-party source before upgrading it.
- Lockfile changes are dependency changes. Unexpected churn must be understood rather than treated as opaque output.

## Upgrades

- Keep unrelated upgrades out of feature work.
- Read release/migration notes and inspect affected source/types before meaningful upgrades.
- Changing the supported Bun range or its minimum/reference version is a runtime/toolchain compatibility change. Verify the new minimum against the committed lockfile format and canonical repository checks, assess contributor and CI impact, and update the reference declaration plus minimum-version CI together. Widening support to a new Bun major requires its own compatibility decision and verification.
- Tooling upgrades that can change formatting or diagnostics are convention changes: inspect the effective preset/config/rule/output delta rather than accepting a version bump mechanically.
- Regenerate affected artifacts and run focused plus canonical verification.
- For version-sensitive APIs, trust installed source/types first, then current first-party docs; model memory is not a source.
- Temporary compatibility workarounds must be narrow and documented. Do not permanently hide an upstream mismatch behind a generic facade.
