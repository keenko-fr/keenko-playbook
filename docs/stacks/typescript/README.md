# TypeScript

- Let canonical schemas/runtime contracts drive types when a schema already exists.
- Use explicit type-only imports.
- Prefer `satisfies` over widening assertions.
- Treat casts/non-null assertions as narrow interop escape hatches; validate/narrow/fix ownership instead where possible.
- Keep types close to their owner and avoid duplicate aliases without semantic value.
- Prefer schema-derived literal unions over enums/enum-like constant objects when no runtime object is needed.
- Use concise contextual naming without cryptic abbreviation.
- Prefer named exports and kebab-case filenames except framework-special files.
- Avoid casual implementation barrels; package public APIs may deliberately expose barrels/exports.
