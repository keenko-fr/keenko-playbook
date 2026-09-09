# Keenko

Keenko is an opinionated Nx-based TypeScript application distribution. It provides a versioned application preset, compatible tooling, project guidance, synchronization, and forward migrations through native Nx lifecycle commands.

A new project starts with this topology:

```text
apps/web
packages/backend
packages/ui
packages/shared
```

These are the initial projects, not a permanent maximum.

## Create a project

```sh
bunx create-nx-workspace@23.2.0 <project> --preset=keenko --packageManager=bun --nxCloud=skip --interactive=false --trustThirdPartyPreset
```

From the created project, `bun run check` is the canonical merge-ready verification command.

## Upgrade a project

Use the native Nx migration and synchronization lifecycle:

```sh
cd <project>
bun x nx migrate keenko@<target>
bun install
bun x nx migrate --run-migrations
bun x nx sync
bun run codegen
```

Run `bun run check` before merging the result.

## Runtime support

Keenko supports Node 24 and Bun `>=1.4.0 <2`; the current reference Bun version is `1.4.2`. Exact dependency compatibility pins are owned by the package source and migration metadata.

## Repository development

```sh
bun install --frozen-lockfile
bun run check
bun run test:product
bun run test:published -- <exact-version>
bun run deps:update
```

- `check` is the deterministic repository gate.
- `test:product` is the required Verdaccio-backed acceptance test for the unpublished packed artifact.
- `test:published` is the release-grade fresh-consumer acceptance test for one exact version already published to npm.
- `deps:update` updates compatibility pins for maintainer review.

## Release

User-visible and project-visible changes require an Nx version plan. Releases are manually initiated through the repository's [Release workflow](.github/workflows/release.yml); Nx Release owns versioning, changelog generation, tagging, and npm publication.

npm trusted publishing and the dedicated Keenko Release App must be configured for the workflow.

## License

Keenko is available under the [MIT License](LICENSE). Third-party assets included by Keenko retain their own license notices.
