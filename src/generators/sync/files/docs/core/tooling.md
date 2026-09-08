# Formatting and linting tooling

## Authority

Keenko TypeScript repositories use Oxfmt for formatting and Oxlint for linting, with Ultracite as the generic preset layer.

Keenko owns:

- project-specific overrides;
- architectural rules;
- scripts;
- CI contracts;
- agent workflow;
- semantic conventions.

Ultracite is a dependency, not an instruction or workflow authority. Do not let it generate or own Keenko-managed agent instructions, routing blocks, hooks, or project policy.

## Formatting

Oxfmt output is canonical for formatter-owned choices.

Do not restate quotes, semicolons, trailing commas, wrapping behavior, import ordering, indentation, line endings, or other arbitrary formatter output as independent prose rules.

The deliberate Keenko formatting override is `printWidth: 140`.

When inheriting an upstream formatter preset, override or remove fields only when required by an explicit Keenko convention or a demonstrated compatibility constraint.

Generated, managed, and vendored files are excluded from direct formatting when another system owns their canonical representation.

## Linting

Oxlint is correctness-first.

Canonical lint policy is layered:

```text
Ultracite defaults
+ universal Keenko delta
+ selected stack/framework delta
+ genuine repository-local exceptions
```

Ultracite owns the broad generic syntax and quality baseline.

Keep the Keenko delta small and explicit. An override is admissible only when it:

- preserves a settled Keenko convention;
- resolves a demonstrated supported-tool, runtime, or framework conflict;
- removes duplicate diagnostic ownership without removing the concern.

Historical presence, migration convenience, stylistic preference, or making existing code green are not sufficient reasons.

Stack, framework, and runtime overrides must be scoped to the files or workspaces that need them.

When a generic rule conflicts with a more knowledgeable stack or framework rule, the specific rule owns that concern in its scope.

Within one diagnostic surface, one concern has one owner.

Do not keep two rules reporting the same problem merely because both upstream presets enable them.

Exact overlap rule names are compatibility data, not permanent Keenko convention. Re-derive overlaps from the installed presets whenever one of the owning packages changes. Do not duplicate the current overlap list in documentation.

Do not duplicate formatter rules or TypeScript compiler diagnostics merely for ceremony.

## Compatibility ownership

Current tooling package specifications are implementation data.

The canonical package specifications used by generated workspaces live in Keenko's package compatibility map. The map uses actual package names as keys so dependency maps can be derived directly from it.

Current reference runtime versions live in the runtime compatibility configuration.

Do not maintain a second version table in this document.

Tooling that can change accepted source, generated output, type behavior, formatting, or diagnostics is upgraded as a reviewed compatibility or convention change.

Treat tightly coupled tooling as a compatibility unit. In particular, verify the supported relationship between:

- TypeScript;
- `@typescript/native`;
- `@effect/tsgo`;
- Oxlint;
- `oxlint-tsgolint`;
- `oxlint-plugin-effect`.

Before upgrading a member of a compatibility unit, inspect the installed/current first-party compatibility information and move coupled pins together where required.

## TypeScript ownership

Generated workspaces use a direct `typescript` dependency for the TypeScript JavaScript API consumed by Nx and related tooling.

Generated workspaces use `@typescript/native` for the native compiler path.

Do not patch Nx internals to redirect TypeScript package resolution.

Package `build` and `typecheck` scripts should invoke the compiler path selected by the Keenko compatibility configuration.

Effect tooling may integrate with Oxlint but must not replace or rewrite the TypeScript package selected for Nx. The canonical Effect patch command therefore disables TypeScript replacement:

```sh
effect-tsgo patch --no-typescript --oxlint
```

Any future change to this relationship requires verification against the supported Nx, TypeScript, Effect tooling, Bun, and Oxlint combination.

## Root configuration and monorepos

A TypeScript repository owns root `oxfmt.config.ts` and `oxlint.config.ts` files.

Root configuration is the canonical baseline for every workspace.

Add a nested/package configuration or root override only for a genuine stack, runtime, generated-file, or architectural difference. Inherit the root configuration rather than copying it.

`options.typeAware: true` is required in the root Oxlint configuration.

Keep TypeScript type checking as a separate `typecheck` script. Do not use Oxlint's type-aware analysis as a replacement for the compiler verification contract.

Oxfmt owns mechanical import sorting.

Type-import semantics remain a convention in `code-style.md` and the TypeScript stack; the linter enforces the mechanical form.

## Generated, managed, and vendored files

Formatter/linter ownership stops at generator or manager boundaries by default.

Exclude generated or immutable output from direct formatting and linting, then validate it with the owning generator, synchronization, or drift contract instead.

Typical exclusions include:

- `vendor/**`;
- `.keenko/**`;
- Keenko-generated `.agents/skills/**`;
- Keenko-generated `.claude/skills/**`;
- Confect generated output;
- Convex generated output;
- Paraglide generated output;
- generated route trees;
- build output;
- cache output;
- coverage output.

A generator may opt generated source into direct formatting or linting only when its canonical contract explicitly says that generated source is intended to be reviewed that way.

## Script contract

Every Keenko TypeScript repository exposes the canonical scripts required by its actual concerns.

The common tooling surface includes:

- `format`: write Oxfmt output;
- `format:check`: check formatting without rewriting files;
- `lint`: run Oxlint without remediation;
- `lint:fix`: apply safe Oxlint fixes;
- `typecheck`: run compiler/type verification;
- `check`: run the complete merge-ready aggregate.

Expose `build`, `test`, `codegen`, and other concern-specific scripts when those concerns actually exist.

Do not add placeholder scripts merely for uniformity.

Generated Keenko application workspaces expose:

```sh
bun run codegen
```

as the canonical code-generation entry point. The root delegates through Nx rather than knowing individual generator implementations:

```sh
nx run-many -t codegen
```

Keenko registers managed-state synchronization through the native Nx sync lifecycle.

```sh
bun x nx sync
```

synchronizes Keenko-managed state.

```sh
bun x nx sync:check
```

detects managed-state drift without rewriting files.

`bun run check` regenerates compiler-owned output in place, then fails if tracked generator-owned artifacts changed. Regenerated drift remains available for review and commit; unrelated project-owned changes and ignored reproducible output do not count as generated Git drift.

The exact sequence belongs to the generated script rather than this documentation. The conceptual contract is:

```text
managed-state drift
-> generated-code drift when applicable
-> format
-> lint
-> typecheck
-> tests when applicable
-> build when applicable
-> project-specific delivery/security checks when applicable
```

Only applicable stages run.

## Workspace boundaries

Nx owns the workspace project graph and workspace dependency-boundary enforcement.

Keenko defines the initial scope model and configures Nx/Oxlint boundary constraints around it.

A fresh project starts with:

```text
apps/web
packages/backend
packages/ui
packages/shared
```

The preset owns this initial topology. It does not impose a permanent four-workspace maximum.

Additional workspaces are valid when they model a real ownership or reuse boundary and participate in the Nx project graph with the required tags.

The initial scopes are:

```text
scope:web
scope:backend
scope:ui
scope:shared
```

Nx is the sole implementation of package and source dependency-boundary checks.

When the pinned Nx boundary implementation changes materially, verify source and package dependency enforcement against the project graph before changing the Keenko boundary configuration.

## CI

CI consumes canonical package scripts.

CI must not:

- auto-fix tracked project source as remediation;
- persist formatter/linter rewrites;
- create a second verification contract separate from package scripts.

A required merge gate proves the equivalent of:

```sh
bun run check
```

Job topology may split work for performance without changing that command contract.

CI uses the runtime versions selected by repository configuration. Current reference runtime versions are not duplicated in this document.

The supported runtime ranges are owned by `dependencies.md`.

## Agents

During implementation, agents format and fix the touched scope and run focused lint, type, and tests as appropriate.

Safe autofixes are encouraged only when the resulting diff is inspected.

Never manually fight Oxfmt output.

Never autofix generated or vendored sources unless their owning generation process explicitly requires it.

Before review handoff, run the applicable complete:

```sh
bun run check
```

and report exactly what passed, failed, was not run, or was unavailable.

## Generated workspace ownership

The Keenko Nx preset owns the initial:

- package manifests;
- workspace topology;
- root Oxfmt configuration;
- root Oxlint configuration;
- canonical scripts;
- CI contract when generated;
- Nx sync registration;
- Keenko-managed generated guidance.

Keenko-managed guidance and skills are synchronized by `syncManagedState`.

Canonical
