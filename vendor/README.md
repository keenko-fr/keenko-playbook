# Vendored skills

`vendor/` contains committed, generated snapshots from immutable source pins in `sources.json`.

## Normal verification

- `bun run check` validates committed snapshot provenance and file hashes.
- `bun run vendor:check` downloads every pinned redistributable source into staging and compares it with the committed snapshot without mutating the checkout.
- `bun run check:release` requires every selected redistributable skill, license, provenance record, and snapshot hash to be valid.

`GITHUB_TOKEN` is strongly recommended for `vendor:check`, `vendor:sync`, and `vendor:update` to avoid anonymous GitHub API rate limits.

## Updating

- `bun run vendor:sync` re-materializes the existing pins.
- `bun run vendor:update` resolves the configured upstream refs to new commits/trees and stages the new snapshots.
- The scheduled workflow opens a review PR; updates are never auto-merged.

Synchronization is transactional: all redistributable sources are downloaded and validated in staging before the known-good committed snapshots are replaced. A network/API failure must leave the previous snapshots and source pins intact.

Never edit generated upstream files directly. Sources without a compatible declared redistribution license remain `external` and are not copied into this repository.
