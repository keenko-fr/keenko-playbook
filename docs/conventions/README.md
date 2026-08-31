# Conventions

Canonical reusable conventions that cut across stack modules:

- `backend-architecture.md`: backend layers, deep modules, package boundaries;
- `schema-types.md`: Effect Schema representation/persistence/transport vocabulary;
- `validation.md`: stable issue codes and typed failure vocabulary;
- `frontend.md`: component ownership, DISPLAY/STYLES, React state/effects, accessibility;
- `frontend-file-topology.md`: canonical React file section order;
- `i18n.md`: Paraglide/Sherlock message ownership and identity;
- `migrations.md`: expand → migrate → contract and safe backfills.

Enabled stack modules add library-specific rules. Project-local architecture/overrides outrank these shared defaults according to the standard authority hierarchy.
