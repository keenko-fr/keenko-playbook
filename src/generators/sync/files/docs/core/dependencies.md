# Dependencies

## Package/runtime policy

- Node 24 is the tooling runtime for Nx and tools that require Node. Bun is the package manager, workspace script entry point, lockfile owner, and application runtime wherever the selected stack supports it.
- Keenko supports Bun `>=1.4.0 <2`. Bun `<1.4.0` is unsupported. Bun 2.x is outside the supported range; supporting a new Bun major requires an explicit compatibility decision and verification.
- Generated workspaces pin Keenko's current reference Bun version in the root `packageManager` field. The reference version may advance independently of the minimum supported version and does not narrow the supported Bun range.
- Current reference runtime versions are implementation data, not documentation. Keep them in the canonical runtime compatibility configuration rather than duplicating them in prose.
- A repository has one canonical package manager and one corresponding lockfile. Do not mix competing lockfiles.
- Keep the committed Bun lockfile format version 2 canonical. Lockfile format version 2 is separate from the Bun 2.x runtime major. Do not regenerate or downgrade the lockfile to accommodate an unsupported local Bun; update the local Bun runtime instead.
- Do not add mise, asdf, Volta-like machinery, custom bootstrap scripts, or another version-manager requirement solely to enforce this baseline.
- Do not use a `preinstall` script as the Bun compatibility guard. An incompatible Bun can fail while parsing `bun.lock` before repository scripts run.
- Generated workspaces declare the supported Node and Bun ranges. Keenko does not add a lifecycle wrapper solely to preflight those ranges before native Nx or Bun commands run.

## Adding dependencies

Add a dependency only for a concrete capability not already provided adequately by the platform, standard library, installed stack, or a small owned implementation.

Prefer stack-native and first-party integrations before building a Keenko compatibility facade.

A package belongs in Keenko's canonical package compatibility map when Keenko deliberately owns the package specification used by generated workspaces. Use the actual npm package name as the key so dependency maps can be derived directly from that authority.

Do not add packages to the compatibility map merely because they happen to exist in the repository. Repository-only implementation dependencies may remain owned by their package manifest.

## Version ownership

Current dependency specifications have one canonical implementation authority.

For generated workspace packages, the canonical package specifications live in Keenko's package compatibility map. Generators derive `dependencies` and `devDependencies` from that map rather than repeating version strings.

Current reference runtime versions live in the runtime compatibility configuration.

Documentation does not duplicate current package or reference-runtime versions.

Documentation may state:

- minimum supported versions;
- supported version ranges;
- supported major versions;
- version-dependent compatibility constraints when the version boundary materially changes behavior.

Documentation should otherwise refer to the package or runtime as:

- the pinned version;
- the current Keenko reference version;
- the supported version;
- the compatibility tuple.

Stable dependencies may use normal semver ranges when Keenko intentionally permits compatible resolution. Exact-pin prereleases, convention-bearing tooling, and other tightly coupled package families when version skew is unsafe.

Treat compatibility-sensitive package families as units rather than independently updating one member. This includes the TypeScript, Effect tooling, Oxlint, and related type-aware lint integration.

The committed lockfile is part of the dependency state. Unexpected lockfile churn must be understood rather than treated as opaque generated output.

## Upgrades

Routine dependency updates should normally require changes only to the canonical package/runtime compatibility configuration, affected package manifests that cannot consume that configuration directly, the lockfile, and tests that validate behavior.

Do not update documentation merely because a current reference version changed.

Update documentation when an upgrade changes:

- a minimum supported version;
- a supported version range or major;
- an architectural constraint;
- a user-facing command or workflow;
- a compatibility rule;
- a version-sensitive API assumption described by the documentation.

Keep unrelated upgrades out of feature work.

Read release and migration notes and inspect affected source and types before meaningful upgrades.

Changing the supported Bun range or minimum version is a runtime compatibility change. Verify it against the committed lockfile format and canonical repository checks, and assess contributor and CI impact. Widening support to a new Bun major requires its own compatibility decision and verification.

Tooling upgrades that can change formatting, linting, type analysis, code generation, or diagnostics are convention changes. Inspect the effective preset, configuration, rule, and output delta rather than accepting the version bump mechanically.

Regenerate affected artifacts and run focused plus canonical verification.

For version-sensitive APIs, trust installed source and types first, then current first-party documentation. Model memory is not a source.

Temporary compatibility workarounds must be narrow and documented. Do not permanently hide an upstream mismatch behind a generic facade.
