# Formatting and linting tooling

## Authority and engines

Keenko TypeScript repositories use Oxfmt for formatting and Oxlint for linting, with Ultracite as the generic preset layer. Keenko owns the project-specific overrides, architectural rules, scripts, CI contract, agent workflow, and semantic conventions. Ultracite is a dependency, not an instruction or workflow authority: do not let it generate or own Playbook-managed agent instructions, routing blocks, hooks, or editor policy.

Oxfmt output is canonical for formatter-owned choices. Do not restate quotes, semicolons, trailing commas, wrapping behavior, or other arbitrary formatter output as independent prose rules. The deliberate Keenko formatting override is `printWidth: 140`; `.editorconfig` remains responsible for editor-neutral invariants such as LF, final newline, and indentation. When inheriting an upstream formatter preset, strip any preset fields that overlap those EditorConfig-owned invariants before passing the config to Oxfmt. For the pinned Ultracite baseline, remove `endOfLine`, `tabWidth`, and `useTabs`; their values must come from `.editorconfig` even when the upstream preset currently matches them.

Oxlint is correctness-first. Canonical lint policy is layered:

```text
pinned Ultracite defaults
+ universal Keenko delta
+ selected stack/framework delta
+ genuine repository-local exceptions
```

Ultracite owns the broad generic syntax and quality baseline. Keep the Keenko delta small and explicit. An override is admissible only when it preserves a settled Keenko convention, resolves a demonstrated supported-tool/runtime/framework conflict, or removes duplicate diagnostic ownership without removing the concern. Historical presence, migration convenience, stylistic preference, or making existing code green are not sufficient reasons.

Stack, framework, and runtime overrides must be scoped to the files or workspaces that need them. When a generic rule conflicts with a more knowledgeable stack or framework rule, the specific rule owns that concern in its scope. Within one Oxlint diagnostic surface, one concern has one owner. Do not keep two rules that report the same problem merely because both upstream presets enable them.

Exact overlap rule names are versioned compatibility data, not permanent Keenko convention. Re-derive an overlap list from the installed/current presets and supported package pairing whenever either owning lint package changes. Detailed stack-specific lists belong in their stack module rather than here.

Do not duplicate formatter rules or TypeScript compiler diagnostics merely for ceremony.

## Canonical version set

Tooling that can change accepted source or diagnostics is exact-pinned and upgraded as a reviewed convention change. The v1 baseline is:

| Scope                | Package                | Version/specifier      |
| -------------------- | ---------------------- | ---------------------- |
| Application compiler | `@typescript/native`   | `npm:typescript@7.0.2` |
| Nx compatibility API | `typescript`           | `6.0.2`                |
| Nx API bridge        | `typescript-api`       | `npm:typescript@6.0.2` |
| Nx release actions   | `@nx/js`               | `23.2.0`               |
| Nx boundary bridge   | `@nx/oxlint`           | `23.2.0`               |
| Universal            | `ultracite`            | `7.10.7`               |
| Universal            | `oxfmt`                | `0.65.0`               |
| Universal            | `oxlint`               | `1.81.0`               |
| Universal            | `oxlint-tsgolint`      | `7.0.2001`             |
| Effect module        | `@effect/tsgo`         | `0.39.1`               |
| Effect module        | `oxlint-plugin-effect` | `0.12.0`               |

The Effect tooling is a compatibility unit: before upgrading `@effect/tsgo`, verify its current first-party supported TypeScript, Oxlint, and `oxlint-tsgolint` versions and move the coupled pins together. Re-check `oxlint-plugin-effect` at the same time because its preset and overlap with Effect tsgo are versioned compatibility data.

TypeScript 7 remains the application compiler decision. A generated project carries `@typescript/native = npm:typescript@7.0.2` and a direct `typescript = 6.0.2` dependency at the root and at each workspace package boundary. Package `build` and `typecheck` scripts invoke the native compiler explicitly through `node ../../node_modules/@typescript/native/bin/tsc --noEmit`.

The generated root also carries `typescript-api = npm:typescript@6.0.2` as a non-colliding alias for the same TypeScript 6 programmatic API. This alias exists specifically for the pinned Nx 23.2.0 boundary implementation under Bun 1.4.0. In the supported reference environment, normal Node resolution can load the direct TypeScript 6 dependency while Oxlint's JS-plugin process can still hand Nx an incomplete TypeScript module for its bare `require("typescript")`. The Keenko-owned `tools/keenko-patch-nx-typescript.ts` postinstall step therefore redirects exactly the two pinned Nx programmatic API loads to `typescript-api`. The patch is idempotent and hard-fails when the expected Nx source shape changes so an Nx upgrade cannot silently inherit this workaround.

Do not replace the direct TypeScript 6 dependency with `typescript = npm:@typescript/typescript6@6.0.2` while Bun 1.4.0 remains the minimum/reference package manager. That official compatibility package re-exports a nested `npm:` alias, and Bun 1.4.0 can resolve that nested alias back to the wrapper package. The result is an incomplete TypeScript module and Nx failures such as `tsModule.readConfigFile is not a function`. This is a package-manager compatibility workaround, not the repository language level. Remove the direct TypeScript 6 API dependency and the `typescript-api` Nx bridge only when a verified Bun/Nx/Oxlint pairing can use the official compatibility alias safely or Nx no longer requires this TypeScript programmatic API path.

## Root configuration and monorepos

A TypeScript repository owns root `oxfmt.config.ts` and `oxlint.config.ts` files. Root configuration is the canonical baseline for every workspace. Add a nested/package config or root override only for a genuine stack, runtime, generated-file, or architectural difference, and inherit the root configuration rather than copying it.

`options.typeAware: true` is required in the root Oxlint configuration. Keep TypeScript type checking as a separate `typecheck` script; do not enable Oxlint's experimental type-check mode as a replacement for the compiler contract.

Oxfmt owns mechanical import sorting. Keep external and workspace packages before project-local imports and preserve side-effect import order. Type-import semantics remain a convention in `code-style.md` and the TypeScript stack; the linter enforces the mechanical form.

## Generated, managed, and vendored files

Formatter/linter ownership stops at generator or manager boundaries by default. Exclude generated or immutable output from direct formatting and linting, then validate it with the owning generator/materializer/drift contract instead. Typical exclusions include:

- `vendor/**`;
- `.keenko/**`;
- Playbook-generated `.agents/skills/**` and `.claude/skills/**`;
- `confect/_generated/**` and `convex/_generated/**`;
- Paraglide compiler output;
- build, cache, and coverage output.

A generator may opt generated source into direct formatting/linting only when its canonical contract explicitly says the generated source is intended to be reviewed that way.

## Script contract

Every Keenko TypeScript repository exposes these scripts:

- `format`: write Oxfmt output;
- `format:check`: check formatting without rewriting files;
- `lint`: run Oxlint without remediation;
- `lint:fix`: apply safe Oxlint fixes;
- `typecheck`: run the repository's compiler/type verification;
- `check`: run the complete merge-ready aggregate.

Expose `test`, `build`, `codegen`, and `codegen:check` only when those concerns exist. Do not add fake no-op scripts for uniformity.

Keenko registers generated guidance and package-manifest workspace boundary validation in a global Nx sync generator. `nx sync` applies generated guidance updates after validating workspace manifest edges. `nx sync:check` detects guidance drift and rejects forbidden package-declared workspace dependencies without changing files. The canonical `bun run check` starts with `nx sync:check` before other generated-code drift checks.

`bun run check` is non-remediating. Its conceptual order is:

```text
sync:check -> codegen/drift -> format:check -> lint -> typecheck -> test -> build -> project-specific delivery/security checks
```

Only applicable stages run. A code-generation drift check may regenerate into a disposable workspace and compare output, but `check` must not leave tracked source rewritten.

## CI and agents

CI consumes the canonical package scripts and never auto-fixes, persists rewritten tracked source as remediation, or pushes formatting/lint changes. A required merge gate proves the equivalent of `bun run check`; job topology may split the work for performance without creating a second command contract. Run Bun-backed CI at the minimum/reference version defined in `dependencies.md`; for the current v1 baseline that version is `1.4.0`. Do not add a moving latest-Bun job yet. The supported runtime range remains owned by `dependencies.md`.

During implementation, agents format/fix the touched scope and run focused lint, type, and tests as appropriate. Safe autofixes are encouraged only when their resulting diff is inspected. Never manually fight Oxfmt output and never autofix generated/vendored sources. Before review handoff, run the applicable complete `bun run check` and report exactly what passed, failed, was not run, or was unavailable.

## Generated workspace boundary

The Keenko Nx preset owns the initial package manifests, root Oxc/Ultracite configuration, scripts, CI contract, and generated guidance. Forward changes to those owned surfaces ship as explicit Nx migrations. Migrations must preserve project-owned files and reject ambiguous customized Keenko-owned values with an actionable conflict instead of silently overwriting them.

A fresh project starts with `apps/web`, `packages/backend`, `packages/ui`, and `packages/shared`. The preset owns that initial topology. It does not impose a permanent four-workspace count. Additional workspaces are valid when they model a real ownership or reuse boundary and participate in the Nx project graph with the required tags.

The verified baseline includes `@nx/oxlint` and `@nx/enforce-module-boundaries`. Nx owns project-graph and source module-boundary enforcement. At the pinned Nx 23.2.0 implementation, the Oxlint bridge exposes the Nx ESLint rule and the rule evaluates import, export, and `require` edges against the project graph. It does not separately scan package manifests for declaration-only workspace dependencies. Keenko's global `keenko:sync` generator therefore validates package-declared workspace edges across every `apps/*` and `packages/*` workspace that participates in the Keenko scope model. It requires exactly one Keenko scope tag per workspace package and checks `dependencies`, `devDependencies`, `optionalDependencies`, and `peerDependencies` with the same allowed-scope table as source boundaries. This keeps manifest validation inside the native Nx sync lifecycle rather than restoring a parallel lifecycle CLI. Re-verify both mechanisms when the pinned Nx boundary implementation changes.
