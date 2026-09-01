# Conventions

Canonical reusable conventions that cut across stack modules:

- `backend-architecture.md`: backend layers, schema/package ownership, deep modules, package boundaries;
- `backend-file-topology.md`: canonical backend and Confect file section grammar;
- `schema-types.md`: Effect Schema representation/persistence/transport vocabulary and schema ownership;
- `validation.md`: stable Issue vocabularies and typed Failure conventions;
- `frontend.md`: renderer-neutral component ownership, DISPLAY, accessibility, UI completeness, and project UI decision ownership;
- `frontend-file-topology.md`: canonical React file section order;
- `i18n.md`: Paraglide/Sherlock message ownership and identity;
- `migrations.md`: expand -> migrate -> contract and safe backfills.

Enabled stack modules add library-specific rules. Project-local architecture/overrides outrank these shared defaults according to the standard authority hierarchy.
