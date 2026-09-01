# Formatting and linting tooling

## Authority and engines

Keenko TypeScript repositories use Oxfmt for formatting and Oxlint for linting, with Ultracite as the generic preset layer. Keenko owns the project-specific overrides, architectural rules, scripts, CI contract, agent workflow, and semantic conventions. Ultracite is a dependency, not an instruction or workflow authority: do not let it generate or own Playbook-managed agent instructions, routing blocks, hooks, or editor policy.

Oxfmt output is canonical for formatter-owned choices. Do not restate quotes, semicolons, trailing commas, wrapping behavior, or other arbitrary formatter output as independent prose rules. The deliberate Keenko formatting override is `printWidth: 140`; `.editorconfig` remains responsible for editor-neutral invariants such as LF, final newline, and indentation.

Oxlint is correctness-first. Ultracite supplies the broad generic quality baseline; Keenko adds only high-signal mechanically enforceable semantic or architectural rules and explicit compatibility exceptions. Do not duplicate formatter rules or TypeScript compiler diagnostics merely for ceremony.

## Canonical version set

Tooling that can change accepted source or diagnostics is exact-pinned and upgraded as a reviewed convention change. The v1 baseline is:

| Scope | Package | Version |
| --- | --- | --- |
| TypeScript | `typescript` | `7.0.2` |
| Universal | `ultracite` | `7.10.7` |
| Universal | `oxfmt` | `0.65.0` |
| Universal | `oxlint` | `1.80.0` |
| Universal | `oxlint-tsgolint` | `7.0.2001` |
| Effect module | `@effect/tsgo` | `0.38.0` |
| Effect module | `oxlint-plugin-effect` | `0.11.0` |

The Effect tooling is a compatibility unit: before upgrading `@effect/tsgo`, verify its current first-party supported TypeScript, Oxlint, and `oxlint-tsgolint` versions and move the coupled pins together. Do not infer compatibility from semver or model memory.

## Root configuration and monorepos

A TypeScript repository owns root `oxfmt.config.ts` and `oxlint.config.ts` files. Root configuration is the canonical baseline for every workspace. Add a nested/package config only for a genuine stack, runtime, generated-file, or architectural difference, and inherit the root configuration rather than copying it.

`options.typeAware: true` is required in the root Oxlint configuration. Keep TypeScript type checking as a separate `typecheck` script; do not enable Oxlint's experimental type-check mode as a replacement for the compiler contract.

Oxfmt owns mechanical import sorting. Keep external and workspace packages before project-local imports and preserve side-effect import order. `import type` remains a semantic convention in `code-style.md`; the linter enforces the mechanical form.

## Generated, managed, and vendored files

Formatter/linter ownership stops at generator or manager boundaries by default. Exclude generated or immutable output from direct formatting and linting, then validate it with the owning generator/materializer/drift contract instead. Typical exclusions include:

- `vendor/**`;
- `.playbook/**`;
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

`bun run check` is non-remediating. Its conceptual order is:

```text
codegen/drift -> format:check -> lint -> typecheck -> test -> build -> project-specific delivery/security checks
```

Only applicable stages run. A drift check may regenerate into a disposable workspace and compare output, but `check` must not leave tracked source rewritten.

## CI and agents

CI consumes the canonical package scripts and never auto-fixes, persists rewritten tracked source as remediation, or pushes formatting/lint changes. A required merge gate proves the equivalent of `bun run check`; job topology may split the work for performance without creating a second command contract.

During implementation, agents format/fix the touched scope and run focused lint, type, and tests as appropriate. Safe autofixes are encouraged only when their resulting diff is inspected. Never manually fight Oxfmt output and never autofix generated/vendored sources. Before review handoff, run the applicable complete `bun run check` and report exactly what passed, failed, was not run, or was unavailable.

## Consumer boundary

The Playbook defines this dependency/config/script/CI shape, but `playbook install` and `playbook update` do not manage a consumer's `package.json`, root Oxc/Ultracite configs, hooks, or editor settings. Consumer repositories own those project files. Extending materialization to manage them is a separate architecture decision.
