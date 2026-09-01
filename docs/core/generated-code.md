# Generated code

Generated files are never edited manually. Change the source, configuration, schema, template, or generator and regenerate.

Tracking policy is generator-specific:

- source-required generated contracts may be committed when the ecosystem expects them;
- reproducible build artifacts should normally be ignored and regenerated.

Each generator's module/project docs must state which model applies.

Generated, manager-owned, and vendored output is excluded from direct formatter/linter ownership by default. Formatting/linting must not rewrite another tool's bytes merely to satisfy authored-source policy; validate generated output through its generator/materializer/drift contract. A generator may explicitly opt generated source into direct formatting/linting only when that is part of its canonical contract.

Repositories expose a canonical aggregate codegen command rather than relying on developers to remember every generator invocation. When generated contracts change, verify deterministic regeneration (for example, run generation twice and require a clean second pass).

CI should detect drift for tracked generated artifacts. Never claim generation/checks passed unless they actually ran.
