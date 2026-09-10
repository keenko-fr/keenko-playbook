# ADR 0007: First supported project compatibility baseline

## Status

Accepted. Supersedes every pre-1.0 project upgrade commitment.

## Context

Keenko's `0.x` releases develop and dogfood the generated repository contract. Treating an intermediate `0.x` shape as a supported consumer baseline forces migration machinery and compatibility fixtures to preserve project states that are still intentionally changing before the first stable release.

Production and application-data migrations are a separate operational concern. Their expand, migrate, and contract guidance remains in force.

## Decision

- Keenko `1.0.0` is the first supported project compatibility baseline.
- Every `0.x` release is development and dogfood only. It has no supported forward project-migration contract, including into `1.0.0`.
- Before `1.0.0`, generators define one current canonical project shape. When it changes, update fresh-creation tests and recreate disposable Playground and dogfood projects from the current accepted release candidate. Do not retain executable `0.x` migrations, compatibility aliases, or upgrade fixtures.
- Starting after `1.0.0`, use the native Nx lifecycle when an existing supported project needs persisted repository state transformed. Do not create a migration when a release changes only fresh generator output or otherwise requires no project-state transformation.
- Use the smallest applicable native Nx mechanism: a package or dependency update, a focused configuration migration, or a focused source transformation. Preserve project-owned customization or fail explicitly when safe transformation cannot be proven.
- Do not build a Keenko-specific migration engine or upgrade wrapper. Do not add no-op migrations merely to exercise the mechanism.

## Consequences

Published `0.x` packages and Git history remain immutable historical artifacts, but they carry no compatibility promise. Pre-1.0 dogfood projects may be discarded and regenerated as the canonical baseline evolves.

The `1.0.0` release gate proves clean creation from the exact release candidate, canonical generated-project validity, and correct packaging of the Nx plugin, preset, and generators. It does not prove a `0.x` to `1.0.0` upgrade.

After `1.0.0`, generators continue to define fresh canonical state while native Nx migrations bridge only supported historical state that genuinely requires transformation. Production and data migration guidance is unaffected.
