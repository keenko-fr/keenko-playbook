# ADR 0005: Canonical formatting and linting toolchain

## Status

Accepted for the v1 convention set by KEE-9. Reconciled with KEE-14 before the first stable baseline.

## Context

Playground dogfood under KEE-4 exposed that the Playbook described semantic code style and merge verification but did not define one executable formatting/linting contract. That left consumers and agents free to choose incompatible tools, rule baselines, scripts, generated-file behavior, and CI semantics.

The toolchain decision remains expensive to reverse even though KEE-14 replaced the old installer/materialization product with an Nx distribution.

## Decision

- Oxfmt is the canonical formatter and Oxlint is the canonical linter.
- Ultracite supplies the generic Oxfmt/Oxlint preset baseline. Keenko remains authoritative for semantic conventions, explicit overrides, scripts, CI, architecture, and agent behavior.
- TypeScript 7+ and type-aware Oxlint through `oxlint-tsgolint` are the TypeScript baseline.
- Effect-enabled repositories additionally use `@effect/tsgo` and `oxlint-plugin-effect`; Effect semantic/type-aware diagnostics surface through Oxlint without duplicate language-service diagnostics.
- Formatter output is executable truth for arbitrary formatting choices. Keenko fixes `printWidth` at 140 and keeps only semantic or architectural intent in prose.
- Root Oxc configuration is the monorepo baseline; nested configuration exists only for a real stack/runtime/architecture difference and inherits root policy.
- Generator-, manager-, and vendor-owned output is excluded from direct formatter/linter ownership by default and verified through its owner.
- Canonical TypeScript scripts expose formatting, linting, typecheck, tests, deterministic generated-code verification, and a non-remediating merge-ready `check`; CI consumes those scripts and never fixes or pushes source.
- Tooling versions are exact-pinned and upgrades are reviewed as convention changes. Effect's TypeScript/Oxlint/`oxlint-tsgolint` compatibility is verified from current first-party sources on every upgrade.
- The Keenko Nx preset owns the initial consumer package, root tooling, scripts, and CI contract. Later changes use reviewed Nx migrations that preserve project-owned customizations or fail explicitly on ambiguity.

## Alternatives considered

- Direct Oxfmt/Oxlint configuration without Ultracite would keep fewer dependencies but make Keenko responsible for maintaining a large generic rule catalog.
- Prettier plus ESLint/typescript-eslint is mature but did not provide a clean TypeScript 7 type-aware baseline at the decision point and carries a larger configuration/plugin set.
- Biome would unify formatter/linter configuration, but its documented TypeScript support lagged the required TypeScript 7 baseline at the decision point.
- Full Ultracite workflow ownership was rejected because its agent/editor/hook responsibilities overlap with Keenko authority.

## Consequences

Consumers get one predictable local/CI contract and agents can rely on stable script names. Upstream preset and engine upgrades can change accepted source, so exact pins and reviewed upgrades are intentional maintenance cost. TypeScript repositories must migrate to TypeScript 7+. Effect repositories carry an additional coupled toolchain. Generated defaults are distribution-owned while deliberate project deviations remain project-owned and must be migration-safe.
