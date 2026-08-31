# Generated code

Generated files are never edited manually. Change the source, configuration, schema, template, or generator and regenerate.

Tracking policy is generator-specific:

- source-required generated contracts may be committed when the ecosystem expects them;
- reproducible build artifacts should normally be ignored and regenerated.

Each generator's module/project docs must state which model applies.

Repositories expose a canonical aggregate codegen command rather than relying on developers to remember every generator invocation. When generated contracts change, verify deterministic regeneration (for example, run generation twice and require a clean second pass).

CI should detect drift for tracked generated artifacts. Never claim generation/checks passed unless they actually ran.
