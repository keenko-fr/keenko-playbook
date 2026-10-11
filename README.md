# Keenko

Keenko is an opinionated Nx-based TypeScript application distribution. It provides a versioned application preset, compatible tooling, project guidance, and synchronization through the native Nx lifecycle.

A new project starts with this topology:

```text
apps/web
packages/backend
packages/ui
packages/shared
```

These are the initial projects, not a permanent maximum.

## Create a project

Current stable release:

```sh
bunx create-nx-workspace@23.3.0 <project> --preset=keenko --packageManager=bun --nxCloud=skip --interactive=false --trustThirdPartyPreset
```

Current release candidate:

```sh
bunx create-nx-workspace@23.3.0 <project> --preset=keenko@rc --packageManager=bun --nxCloud=skip --interactive=false --trustThirdPartyPreset
```

keenko resolves the npm latest dist-tag. keenko@rc resolves the npm rc dist-tag.

From the created project, bun run check is the canonical merge-ready verification command.

## Project compatibility

Default direct forward support is immediately preceding stable → current stable. The next release supports published stable `1.0.5`. This corrective cycle also retains the explicit `1.0.4`, `1.0.5-rc.0` and partial-recovery paths, owned by `tests/fixtures/upgrade-source.json`. New projects start current. Prereleases are not permanent supported origins; older stable releases are outside the default direct-support window. There is no default guarantee of recovery through sequential historical releases. A release may explicitly widen the source window.

Nx remains migration authority and Bun remains lockfile owner. Migration code and assets are retained only while a supported path or current behavior requires them. Add migrations only when persisted project state needs transformation, then follow the native migration and synchronization lifecycle:

```sh
cd <project>
bun x nx migrate keenko@<target>
bun install
if [ -f migrations.json ]; then
  bun x nx migrate --run-migrations
fi
bun install
bun x nx sync
bun run codegen
bun run check
```

Run applicable native migrations when Nx produces a plan. An upgrade with no applicable migration may create no `migrations.json`; do not manufacture a no-op plan. The second `bun install` is unconditional because migrations can change dependency manifests. Bun reconciles installed packages and regenerates `bun.lock`; migrations never text-edit or merge the lockfile.

## Runtime support

Keenko supports Node `>=24.15 <25` and Bun `>=1.4.0 <2`. Current reference runtime versions and exact dependency compatibility pins are owned by the package source and generated canonical state.

## Repository development

```sh
bun install --frozen-lockfile
bun run check
bun run test:product
bun run test:shadcn
bun run test:published -- <exact-version>
bun run deps:update
```

- `check` is the deterministic repository gate.
- `test:product` is the required Verdaccio-backed fresh-creation and supported forward-upgrade acceptance test for the unpublished packed artifact.
- `test:shadcn` is the explicit live-registry compatibility smoke and is not a normal PR or release gate.
- `test:published` is the release-grade fresh-consumer acceptance test for one exact version already published to npm.
- `deps:update` discovers stable candidates for all managed packages. For packages deliberately qualified on a prerelease channel, it also discovers the configured prerelease candidate. Compatibility holds preserve the selected version until the tuple is requalified. Successful installation alone does not qualify a candidate.

## Release

Each Keenko release cycle requires a full dependency compatibility sweep before candidate dogfood. Select the newest compatible versions and qualify coupled packages together. `packageVersions` is the canonical current-version source. If a release-blocking corrective pass explicitly reopens qualification before publication, establish a new qualification cutoff and requalify the candidates available at that cutoff. Freeze the tuple after the final successful pre-RC qualification. Versions published after that cutoff belong to the next release cycle unless a human explicitly reopens qualification again. During actual RC dogfood, corrective RCs receive only changes needed to correct the candidate, with no unrelated dependency refresh. Promote the accepted RC to stable without refreshing dependencies.

User-visible and project-visible changes require an Nx version plan. Releases are manually initiated through the repository's [Release workflow](.github/workflows/release.yml); Nx Release owns versioning, changelog generation, tagging, and npm publication.

npm trusted publishing and the dedicated Keenko Release App must be configured for the workflow.

## License

Keenko is available under the [MIT License](LICENSE). Third-party assets included by Keenko retain their own license notices.
