# TypeScript

TypeScript 7+ is the Keenko TypeScript baseline. TypeScript repositories use the canonical Oxfmt/Oxlint/Ultracite toolchain from `docs/core/tooling.md`, including required `oxlint-tsgolint` type-aware linting. Keep compiler verification in the canonical `typecheck` script instead of replacing it with Oxlint type checking.

- Let canonical schemas/runtime contracts drive types when a schema already exists.
- Use top-level `import type` when an import is type-only. For a mixed value/type import, use inline `type` specifiers such as `import { sUser, type User } from "./user"`.
- A leading `_` means an intentionally unused function parameter only. It is not an escape hatch for unused locals, destructured values, or caught errors.
- Named caught errors must be used. If the error value is irrelevant, omit the binding with `catch {}`.
- Prefer `satisfies` over widening assertions.
- Treat casts/non-null assertions as narrow interop escape hatches; validate/narrow/fix ownership instead where possible.
- Keep types close to their owner and avoid duplicate aliases without semantic value.
- Prefer schema-derived literal unions over enums/enum-like constant objects when no runtime object is needed.
- Use concise contextual naming without cryptic abbreviation.
- Prefer named exports and kebab-case filenames except framework-special files.
- Avoid casual implementation barrels; package public APIs may deliberately expose barrels/exports.

## Runtime target

A deployable artifact's ECMAScript target follows the oldest runtime it deliberately supports. Do not establish one ECMAScript year as a universal Keenko floor, and do not use floating `ESNext` as the canonical target.

Examples:

- a modern Bun-only tooling repository may target the modern ECMAScript level supported by its pinned Bun runtime;
- a browser application derives its target from the browser support policy;
- a published library derives its target from the documented consumer runtime contract;
- a legacy WebView or runtime uses a lower target or an explicit polyfill strategy when required.

Root `oxfmt.config.ts` and `oxlint.config.ts` own the monorepo baseline. Workspace-specific tooling config is justified only by a real stack/runtime/architecture difference and inherits root policy.
