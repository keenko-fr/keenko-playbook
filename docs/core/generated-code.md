# Generated code

Generated files are never edited manually. Change the source, configuration, schema, template, or generator and regenerate.

Tracking policy is generator-specific:

- source-required generated contracts may be committed when the ecosystem expects them;
- reproducible build artifacts should normally be ignored and regenerated.

Each generator's module/project docs must state which model applies.

Generated, manager-owned, and vendored output is excluded from direct formatter/linter ownership by default. Formatting/linting must not rewrite another tool's bytes merely to satisfy authored-source policy; validate generated output through its generator/materializer/drift contract. A generator may explicitly opt generated source into direct formatting/linting only when that is part of its canonical contract.

Repositories expose a canonical aggregate codegen command rather than relying on developers to remember every generator invocation. When generated contracts change, verify deterministic regeneration, for example by running generation twice and requiring a clean second pass.

Keenko generated guidance is synchronized through the registered Nx sync generator. Use `bun x nx sync` to apply guidance updates and `bun x nx sync:check` to detect guidance drift without rewriting tracked files. Other tracked generated artifacts keep their generator-specific drift checks.

CI should detect drift for tracked generated artifacts. Never claim generation or checks passed unless they actually ran.
