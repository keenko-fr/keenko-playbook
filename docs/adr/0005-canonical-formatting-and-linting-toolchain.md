# ADR 0005: Canonical formatting and linting toolchain

## Status

Accepted for the v1 convention set by KEE-9. Reconciled with KEE-14 before the first stable baseline.

## Context

Playground dogfood under KEE-4 exposed that the Playbook described semantic code style and merge verification but did not define one executable formatting/linting contract. That left consumers and agents free to choose incompatible tools, rule baselines, scripts, generated-file behavior, and CI semantics.

The toolchain decision remains expensive to reverse because it defines the source accepted by the Nx distribution.

## Decision

- Oxfmt is the canonical formatter and Oxlint is the canonical linter.
- Ultracite supplies the generic Oxfmt/Oxlint preset baseline. Keenko remains authoritative for semantic conventions, explicit overrides, scripts, CI, architecture, and agent behavior.
- The `typescript` package supplies the TypeScript 6 JavaScript API required by the current Nx/Oxlint integration. `@typescript/native` supplies the TypeScript 7 compiler/typecheck path. Type-aware Oxlint runs through `oxlint-tsgolint`.
- Effect-enabled repositories additionally use `@effect/tsgo` and `oxlint-plugin-effect`; Effect semantic/type-aware diagnostics surface through Oxlint without duplicate language-service diagnostics.
- Oxfmt is the sole mechanical formatting authority. Ultracite supplies the default Oxfmt policy. Keenko overrides that policy only for explicit distribution requirements, currently printWidth 140 and ownership-based exclusions.
- Root Oxc configuration is the monorepo baseline; nested configuration exists only for a real stack/runtime/architecture difference and inherits root policy.
- Generator-, manager-, and vendor-owned output is excluded from direct formatter/linter ownership by default and verified through its owner.
- Canonical TypeScript scripts expose formatting, linting, typecheck, applicable tests, builds, and deterministic generated-code verification. The merge-ready `check` regenerates code in place and fails on tracked generator-owned drift; CI consumes the same script and never commits or pushes source. Fresh workspaces without a real test concern do not get a root `test` script.
- Tooling versions are exact-pinned and upgrades are reviewed as convention changes. Effect's TypeScript/Oxlint/`oxlint-tsgolint` compatibility is verified from current first-party sources on every upgrade.
- The Keenko Nx preset owns the initial consumer package, root tooling, scripts, and CI contract. Later changes use reviewed Nx migrations that preserve project-owned customizations or fail explicitly on ambiguity.

## Alternatives considered

- Direct Oxfmt/Oxlint configuration without Ultracite would keep fewer dependencies but make Keenko responsible for maintaining a large generic rule catalog.
- Prettier plus ESLint/typescript-eslint is mature but did not provide the selected type-aware integration at the decision point and carries a larger configuration/plugin set.
- Biome would unify formatter/linter configuration, but its documented TypeScript support did not satisfy the selected compiler and tooling roles at the decision point.
- Full Ultracite workflow ownership was rejected because its agent/editor/hook responsibilities overlap with Keenko authority.

## Consequences

Consumers get one predictable local/CI contract and agents can rely on stable script names. Upstream preset and engine upgrades can change accepted source, so exact pins and reviewed upgrades are intentional maintenance cost. The TypeScript JavaScript API package and native compiler remain distinct compatibility roles and must be upgraded as part of the reviewed tooling tuple. Effect repositories carry an additional coupled toolchain. Generated defaults are distribution-owned while deliberate project deviations remain project-owned and must be migration-safe.
