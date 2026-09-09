# TanStack Table

Use TanStack Table as the headless model for operational structured data when sorting, filtering, search, pagination, selection, column behavior, or alternate responsive rendering is meaningful. Use semantic lists/cards for tiny static or primarily visual collections.

## State ownership

```text
shareable search/sort/page/filter
→ Router search

remote records
→ Query

row selection / temporary column visibility / local interaction
→ Table/local state
```

When the backend owns pagination/filtering/sorting, configure the corresponding manual/server-controlled Table modes and flow Router state → Query args → backend result. Do not fetch one page then pretend client-side transformations cover the full dataset.

Domain-aware column definitions live with the feature/table component. Shared UI owns generic table primitives/rendering, not feature-specific columns.

When desktop table and compact/mobile cards represent the same operational dataset, reuse one Table/data/state model where practical rather than maintaining two independent filter/sort/pagination pipelines.

Use TanStack Intent/current package guidance for exact APIs.
