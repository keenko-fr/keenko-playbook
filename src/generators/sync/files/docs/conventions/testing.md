# Testing

Tests assert the narrowest stable contract owned by their layer. They do not assert incidental source representation. An implementation-preserving refactor should not require test changes.

The same invariant has one primary test owner. Do not repeat an assertion across unit, generator, packed-product, and provisioned end-to-end layers for reassurance.

## Ownership

- Unit tests own observable behavior of focused modules at their public seams.
- Preset and generator tests own generated product shape: required and forbidden files, structured package and configuration data, public generated API names, credential invariants, and canonical generated conventions that cannot be verified mechanically elsewhere.
- A generated consumer's `bun run check` owns Confect codegen, formatting, lint, type correctness, unit tests, and build correctness.
- Packed-product acceptance owns the actual distribution boundary: pack Keenko, install that artifact into a clean consumer, run the generator, run the consumer's canonical lifecycle, and inspect only externally significant artifacts not already owned by generator tests.
- Provisioned authentication end-to-end tests own Hosted UI, authenticated Convex identity, synchronized WorkOS identity, and sign-out behavior against real provisioned infrastructure.

## Stable contracts

Prefer structured decoding for JSON manifests and configuration. Source-string assertions are appropriate only when the literal source representation is itself a canonical product contract and no more direct verification mechanism exists.

Do not assert private function or variable names, import aliases, exact Effect combinator spelling, declaration order, helper placement, or equivalent implementation detail. Do not replace source-string coupling with AST parsing. A refactor that preserves the owned public contract belongs below the test boundary.

When a broader acceptance test already runs a narrower layer's canonical verification command, rely on that command instead of recreating its internal assertions.
