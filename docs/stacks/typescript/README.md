# TypeScript

TypeScript 7+ is the Keenko TypeScript baseline. TypeScript repositories use the canonical Oxfmt/Oxlint/Ultracite toolchain from `docs/core/tooling.md`, including required `oxlint-tsgolint` type-aware linting. Keep compiler verification in the canonical `typecheck` script instead of replacing it with Oxlint type checking.

- Let canonical schemas/runtime contracts drive types when a schema already exists.
- Use explicit type-only imports; the canonical linter enforces the mechanical form.
- Prefer `satisfies` over widening assertions.
- Treat casts/non-null assertions as narrow interop escape hatches; validate/narrow/fix ownership instead where possible.
- Keep types close to their owner and avoid duplicate aliases without semantic value.
- Prefer schema-derived literal unions over enums/enum-like constant objects when no runtime object is needed.
- Use concise contextual naming without cryptic abbreviation.
- Prefer named exports and kebab-case filenames except framework-special files.
- Avoid casual implementation barrels; package public APIs may deliberately expose barrels/exports.

Root `oxfmt.config.ts` and `oxlint.config.ts` own the monorepo baseline. Workspace-specific tooling config is justified only by a real stack/runtime/architecture difference and inherits root policy.
