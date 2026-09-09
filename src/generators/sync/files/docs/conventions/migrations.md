# Data migrations

Use expand → migrate → contract for persisted production changes:

1. **expand**: introduce backward-compatible schema/code;
2. **migrate**: transform/backfill existing data safely;
3. **contract**: remove compatibility code/old fields only after migration evidence is complete.

During rollout/rollback overlap, old and new deployed code/data must remain mutually safe.

## Backfills

Production backfills should normally be:

- bounded/batched;
- resumable;
- idempotent/retry-safe;
- observable with completion/failure evidence;
- designed to avoid duplicate external side effects.

Do not create or run a backfill merely because a schema changed. Inspect actual existing data and production assumptions first.

Destructive cleanup is a separate deliberate step. Before deleting/renaming old data or removing compatibility code, require evidence that migration completed and the old representation is no longer read/written.

Migration/reset tooling must be production-safe by construction: default to the safest environment, require explicit production targeting/authorization, and print/verify the target before mutation.
