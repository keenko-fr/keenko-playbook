# Dependencies

## Package/runtime policy

- Bun is the default package manager, workspace runner, and TypeScript tooling runtime for Keenko TypeScript repositories. Use another tool only for a concrete project/tool compatibility reason.
- A repository has one canonical package manager and one corresponding lockfile. Do not mix competing lockfiles.

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
- Tooling upgrades that can change formatting or diagnostics are convention changes: inspect the effective preset/config/rule/output delta rather than accepting a version bump mechanically.
- Regenerate affected artifacts and run focused plus canonical verification.
- For version-sensitive APIs, trust installed source/types first, then current first-party docs; model memory is not a source.
- Temporary compatibility workarounds must be narrow and documented. Do not permanently hide an upstream mismatch behind a generic facade.
