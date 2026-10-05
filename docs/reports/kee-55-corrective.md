# KEE-55 corrective qualification

This corrective pass supersedes the original [KEE-55 qualification](kee-55.md). Starting remote `main` is `c77eb49afd2521ad2eff3f9276c4742e077a4b77`, the squash merge of PR #50. Linear KEE-55 and KEE-48 were fetched read-only and both remain in progress.

The deterministic corrective-preflight cutoff is **2026-10-05T12:25:04.087Z**. Public npm returned no matching `keenko@1.0.2-rc.4` before edits. Registry discovery covered all 63 canonical managed names and all six additional repository dependency names. Each full packument was inspected for published versions, publication times, dist-tags, engines, peers, optional peers and runtime dependencies. The native compiler alias resolves the TypeScript packument. Nx stable and deliberately tracked `next` candidates were both inspected. Untracked beta, canary, snapshot and development channels do not become selected candidates merely because they exist.

Versions published after this cutoff belong to the next release cycle unless a human explicitly reopens qualification. This pass does not publish public rc.4, merge, modify Linear or touch Anoulà.

## Discovery and selection

The unchanged `bun run deps:update` was run in a disposable archive of remote `main`. It discovered newer unheld candidates but failed during the native preparation step because effect-tsgo rejects Oxlint 1.87.0. Its transaction restored updater-owned source, manifest and lockfile contents. Independent registry discovery retained all candidate data, including held candidates and repository-only dependencies.

All five newly available stable candidates since the original sweep were considered:

| Package                       | Registry publication UTC   | Decision                                       |
| ----------------------------- | -------------------------- | ---------------------------------------------- |
| `@effect/platform-node@4.0.1` | `2026-10-05T07:46:34.758Z` | Adopt.                                         |
| `@effect/tsgo@0.48.1`         | `2026-10-05T09:43:21.867Z` | Adopt.                                         |
| `@vitejs/plugin-react@6.1.2`  | `2026-10-05T10:08:27.143Z` | Adopt.                                         |
| `oxfmt@0.72.0`                | `2026-10-05T11:03:48.808Z` | Adopt after output review.                     |
| `oxlint@1.87.0`               | `2026-10-05T11:05:35.081Z` | Reject with native patch failure; hold 1.86.0. |

The earlier jsdom candidate is also adopted after correcting the rendering qualification runtime. Every package retained below the newest stable candidate is explained in the complete table below. No additional newer stable or deliberately tracked Nx candidate existed at this cutoff.

| Package | Starting main | Registry candidate at cutoff | Selected | Reason |
| --- | --- | --- | --- | --- |
| `@base-ui/react` | `1.8.0` | `1.8.0` | `1.8.0` | Newest stable. |
| `@confect/cli` | `10.0.0` | `10.0.0` | `10.0.0` | Newest stable. |
| `@confect/core` | `10.0.0` | `10.0.0` | `10.0.0` | Newest stable. |
| `@confect/server` | `10.0.0` | `10.0.0` | `10.0.0` | Newest stable. |
| `@confect/test` | `10.0.0` | `10.0.0` | `10.0.0` | Newest stable. |
| `@convex-dev/react-query` | `0.1.0` | `0.1.0` | `0.1.0` | Newest stable. |
| `@convex-dev/workos-authkit` | `0.2.10` | `0.2.10` | `0.2.10` | Newest stable. |
| `@edge-runtime/vm` | `5.0.0` | `5.0.0` | `5.0.0` | Newest stable. |
| `@effect/platform-node` | `4.0.0` | `4.0.1` | `4.0.1` | Newest stable. |
| `@effect/tsgo` | `0.48.0` | `0.48.1` | `0.48.1` | Newest stable. |
| `@effect/vitest` | `4.0.1` | `4.0.1` | `4.0.1` | Newest stable. |
| `@fontsource-variable/inter` | `5.3.0` | `5.3.0` | `5.3.0` | Newest stable. |
| `@inlang/paraglide-js` | `2.25.4` | `2.25.4` | `2.25.4` | Newest stable. |
| `@nx/devkit` | `23.3.0-beta.9` | `23.2.1 / next 23.3.0-beta.9` | `23.3.0-beta.9` | Stable Nx excludes Vitest 5; next beta.9 remains the newest required aligned family. |
| `@nx/js` | `23.3.0-beta.9` | `23.2.1 / next 23.3.0-beta.9` | `23.3.0-beta.9` | Stable Nx excludes Vitest 5; next beta.9 remains the newest required aligned family. |
| `@nx/oxlint` | `23.3.0-beta.9` | `23.2.1 / next 23.3.0-beta.9` | `23.3.0-beta.9` | Stable Nx excludes Vitest 5; next beta.9 remains the newest required aligned family. |
| `@nx/vitest` | `23.3.0-beta.9` | `23.2.1 / next 23.3.0-beta.9` | `23.3.0-beta.9` | Stable Nx excludes Vitest 5; next beta.9 remains the newest required aligned family. |
| `@playwright/test` | `1.63.0` | `1.63.0` | `1.63.0` | Newest stable. |
| `@tailwindcss/vite` | `4.3.3` | `4.3.3` | `4.3.3` | Newest stable. |
| `@tanstack/create` | `0.70.1` | `0.70.1` | `0.70.1` | Newest stable. |
| `@tanstack/devtools-vite` | `0.8.5` | `0.8.5` | `0.8.5` | Newest stable. |
| `@tanstack/intent` | `0.5.4` | `0.5.4` | `0.5.4` | Newest stable. |
| `@tanstack/react-devtools` | `0.10.13` | `0.10.13` | `0.10.13` | Newest stable. |
| `@tanstack/react-form` | `1.33.5` | `1.33.5` | `1.33.5` | Newest stable. |
| `@tanstack/react-query` | `5.104.1` | `5.104.1` | `5.104.1` | Newest stable. |
| `@tanstack/react-query-devtools` | `5.104.1` | `5.104.1` | `5.104.1` | Newest stable. |
| `@tanstack/react-router` | `1.170.41` | `1.170.41` | `1.170.41` | Newest stable. |
| `@tanstack/react-router-devtools` | `1.167.2` | `1.167.2` | `1.167.2` | Newest stable. |
| `@tanstack/react-router-ssr-query` | `1.167.3` | `1.167.3` | `1.167.3` | Newest stable. |
| `@tanstack/react-start` | `1.168.60` | `1.168.60` | `1.168.60` | Newest stable. |
| `@tanstack/react-table` | `9.2.6` | `9.2.6` | `9.2.6` | Newest stable. |
| `@tanstack/router-cli` | `1.167.40` | `1.167.40` | `1.167.40` | Newest stable. |
| `@testing-library/dom` | `10.4.2` | `10.4.2` | `10.4.2` | Newest stable. |
| `@testing-library/react` | `16.3.3` | `16.3.3` | `16.3.3` | Newest stable. |
| `@types/bun` | `1.4.2` | `1.4.2` | `1.4.2` | Newest stable. |
| `@types/node` | `24.19.1` | `26.6.4` | `24.19.1` | Newest Node 24 types for the supported tooling runtime; latest is Node 26. |
| `@types/react` | `19.3.0` | `19.3.0` | `19.3.0` | Newest stable. |
| `@types/react-dom` | `19.3.0` | `19.3.0` | `19.3.0` | Newest stable. |
| `@types/validate-npm-package-name` | `4.0.2` | `4.0.2` | `4.0.2` | Newest stable. |
| `@typescript/native` | `npm:typescript@7.0.2` | `npm:typescript@7.0.2` | `npm:typescript@7.0.2` | Newest stable. |
| `@vitejs/plugin-react` | `6.1.1` | `6.1.2` | `6.1.2` | Newest stable. |
| `@workos-inc/authkit-react` | `0.16.3` | `0.16.3` | `0.16.3` | Newest stable. |
| `@workos-inc/node` | `10.14.0` | `11.0.0` | `10.14.0` | Both current AuthKit integrations require SDK 10 and exclude SDK 11. |
| `@workos/authkit-tanstack-react-start` | `0.11.1` | `0.11.1` | `0.11.1` | Newest stable. |
| `class-variance-authority` | `0.7.1` | `0.7.1` | `0.7.1` | Newest stable. |
| `cn` | `0.4.0` | `0.4.0` | `0.4.0` | Newest stable. |
| `convex` | `1.46.0` | `1.46.0` | `1.46.0` | Newest stable. |
| `convex-test` | `0.0.60` | `0.0.60` | `0.0.60` | Newest stable. |
| `effect` | `4.0.1` | `4.0.1` | `4.0.1` | Newest stable. |
| `jsdom` | `30.0.1` | `30.1.2` | `30.1.2` | Newest stable. |
| `lucide-react` | `1.52.0` | `1.52.0` | `1.52.0` | Newest stable. |
| `minimatch` | `10.2.6` | `10.2.6` | `10.2.6` | Newest stable. |
| `nx` | `23.3.0-beta.9` | `23.2.1 / next 23.3.0-beta.9` | `23.3.0-beta.9` | Stable Nx excludes Vitest 5; next beta.9 remains the newest required aligned family. |
| `oxfmt` | `0.71.0` | `0.72.0` | `0.72.0` | Newest stable. |
| `oxlint` | `1.86.0` | `1.87.0` | `1.86.0` | Native effect-tsgo 0.48.1 patch rejects 1.87.0; newest supported binding is 1.86.0. |
| `oxlint-plugin-effect` | `0.27.1` | `0.27.1` | `0.27.1` | Newest stable. |
| `oxlint-tsgolint` | `7.0.2003` | `7.0.2003` | `7.0.2003` | Newest stable. |
| `react` | `19.3.0` | `19.3.0` | `19.3.0` | Newest stable. |
| `react-dom` | `19.3.0` | `19.3.0` | `19.3.0` | Newest stable. |
| `shadcn` | `4.21.1` | `4.21.1` | `4.21.1` | Newest stable. |
| `tailwindcss` | `4.3.3` | `4.3.3` | `4.3.3` | Newest stable. |
| `tslib` | `2.8.1` | `2.8.1` | `2.8.1` | Newest stable. |
| `tw-animate-css` | `1.4.0` | `1.4.0` | `1.4.0` | Newest stable. |
| `typescript` | `6.0.3` | `7.0.2` | `6.0.3` | Nx and migrations require the JS compiler API absent from native TypeScript 7. |
| `ultracite` | `7.12.3` | `7.12.3` | `7.12.3` | Newest stable. |
| `validate-npm-package-name` | `8.0.0` | `8.0.0` | `8.0.0` | Newest stable. |
| `verdaccio` | `6.10.5` | `6.10.5` | `6.10.5` | Newest stable. |
| `vite` | `8.3.2` | `8.3.2` | `8.3.2` | Newest stable. |
| `vitest` | `5.0.3` | `5.0.3` | `5.0.3` | Newest stable. |

The lockfile also moves the required platform-node-shared runtime from 4.0.0 to 4.0.1, published `2026-10-04T21:52:34.960Z`, with Effect peer `^4.0.1`. Oxfmt and effect-tsgo native artifacts follow their selected parent versions, including the new upstream Linux ARM tsgo artifact. jsdom's declared DOM/CSS dependencies move with 30.1.2; obsolete symbol-tree and nested older URL dependencies disappear. These are installer-owned consequences of the five selected direct/canonical changes, with no additional managed slot.

## Coupled contracts and release review

- Nx remains aligned at `23.3.0-beta.9` for `nx`, `@nx/devkit`, `@nx/js`, `@nx/oxlint` and `@nx/vitest`. Registry stable is `23.2.1`; its Vitest peer excludes 5. The selected beta supports Vitest 5. The Oxlint peer remains `^1.43.0`. No new native Nx migration is required.
- Effect and official `@effect/vitest` remain `4.0.1`; selected platform-node is `4.0.1`, platform-node-shared resolves to `4.0.1`, and tsgo is `0.48.1`. Platform-node requires Effect `^4.0.1`, shared-node `^4.0.1`, Undici `^8.11.2`, and Redis `>=5 <7`. [Platform-node release notes](https://github.com/Effect-TS/effect/releases/tag/%40effect%2Fplatform-node%404.0.1) describe socket cancellation/EOF handling, lazy file streams and refused WebSocket upgrades. Its public Node services and child-process paths participate in repository and packed-product execution.
- [effect-tsgo 0.48.1 notes](https://github.com/Effect-TS/tsgo/releases/tag/%40effect%2Ftsgo%400.48.1) fix diagnostic names for overloaded unstable/experimental exports. Its published README and patch manifest support native TypeScript `7.0.2`, Oxlint through `1.86.0`, and tsgolint `7.0.2003`. A clean isolated probe with Oxlint `1.87.0` fails with `UnsupportedTargetPackageVersionError`; the selected 1.86.0 tuple patches successfully. No lint rule or Effect testing policy is weakened.
- Vitest `5.0.3` and Vite `8.3.2` remain the newest stable pair. Official Effect/Vitest requires Effect `^4.0.1` and Vitest `>=5 <6`; Vitest accepts Vite 8. Root and generated `effect/noEffectRunInTests` policy remains enabled.
- TypeScript JS API remains `6.0.3`, the newest stable major-6 API; the native compiler alias remains `npm:typescript@7.0.2`. The native v7 package does not expose the JS compiler API used by Nx/migrations. Installed compiler separation is part of the product proof.
- Confect CLI/core/server/test remain stable `10.0.0`. Node >=24, Effect ^4 and the selected Convex `1.46.0` satisfy their peers. The server also accepts platform-node ^4. No new Confect prerelease policy or syntax adaptation is needed; authored registered-reader/cardinality/codegen fixtures are rerun.
- Oxc's selected tuple is Oxfmt `0.72.0`, Oxlint `1.86.0`, tsgolint `7.0.2003`, Effect plugin `0.27.1`, effect-tsgo `0.48.1` and aligned `@nx/oxlint`. [Oxlint 1.87 notes](https://github.com/oxc-project/oxc/releases/tag/oxlint_v1.87.0) add suggestions and fix lint/parser behavior, but native Effect patch support is the limiting contract. Installed preset and real diagnostic-ownership tests verify the selected configuration.
- [Oxfmt 0.72 notes](https://github.com/oxc-project/oxc/releases/tag/oxfmt_v0.72.0) replace Markdown formatting and adjust embedded-language formatting. The actual repository delta is two embedded examples: sorted TypeScript imports in code-style guidance and sorted Tailwind classes in the architecture report example. Both retain meaning. Source assets change through their existing sync ownership; no new formatter exclusion or alternate generation path is added. Fresh/upgrade formatting, managed-state sync and codegen drift gates qualify the generated output.
- [React plugin 6.1.2 notes](https://github.com/vitejs/vite-plugin-react/releases/tag/plugin-react%406.1.2) fix compound-component HMR and compiler diagnostics/refresh handling. Required Vite peer remains ^8; optional React compiler peer becomes `oxc-transform-react ^0.152.0`. Generated config does not enable that optional compiler. React/React DOM `19.3.0` and the existing TanStack tuple remain newest stable; their registry peers remain satisfied and are rechecked from installed package locations in product fixtures.
- Current WorkOS AuthKit TanStack requires SDK `^10.7.0`; Convex AuthKit permits SDK 7 through 10. SDK `11.0.0` is still excluded. `10.14.0` is the newest stable SDK 10. The existing AuthKit test-entrypoint patch remains necessary and is exercised under isolated installation.

## jsdom hold correction

[jsdom 30.1.2 release notes](https://github.com/jsdom/jsdom/releases/tag/v30.1.2) describe DOM/CSS fixes without a Vitest-specific compatibility change. Its Node engine accepts the supported Node 24 range. The newest candidate `30.1.2` passes all seven real generated navigation/identity rendering tests under Node `24.21.0` with Vitest `5.0.3`. The previous EventTarget failure reproduces when that test adapter forces Vitest to run under Bun `1.4.2`. The adapter now launches `node` for Vitest, matching the supported tooling contract. Bun continues to host the adapter and own package scripts. No jsdom shim, DOM workaround or weakened assertion is introduced. Generated Node/Vitest jsdom tests are also requalified through the product lifecycle.

Removed obsolete holds for jsdom, Effect, official Effect/Vitest, Vite and Vitest. Their newest current candidates satisfy the selected coupled contracts. Retained holds for the aligned Nx family, TypeScript JS API and WorkOS SDK. Added the demonstrated Oxlint hold. The existing Nx `next` channel remains; Confect and all other untracked prerelease channels remain absent. Updater tests exercise current holds, candidate reporting, removed Effect hold adoption, aliases, Node-major selection, and rollback. The focused Oxlint test exposes 1.87.0 while retaining 1.86.0.

## Root identity defect

Commit `e4624d2`, the KEE-14 reconstruction, wrote package name `keenko` while replacing root lockfile metadata with `@keenko-from-scratch/source`. Subsequent Bun installs preserved that workspace name despite the manifest rename, matching [Bun workspace-rename issue #28411](https://github.com/oven-sh/bun/issues/28411). This is stale lockfile identity, not a dependency version or consumer policy issue. The correction sets `bun.lock.workspaces[""].name` to `keenko`.

`tests/repository-lockfile.spec.ts` reads this repository's actual root manifest and Bun JSONC lockfile and requires their root names to agree. The existing `bun run check` test stage runs it. The focused negative run temporarily restored the original stale name and failed; the corrected name passed. This invariant is not shipped as generated guidance or added to consumer verification.

## Migration and release policy

Only `src/migrations/files/compatibility-baseline-1-0-2.json`, the existing unpublished KEE-55 rc.4 boundary, is updated. It now records tsgo 0.48.1 and Oxfmt 0.72.0 at root, React Vite plugin 6.1.2 in applications, and jsdom 30.1.2 in applications/UI. Platform-node is the plugin's runtime dependency, so it needs no new direct consumer slot. No migration factory or published rc.0 through rc.3 snapshot is rewritten. The earlier KEE-54 rc.4 preparation remains intact.

Reusable release policy in README, canonical dependency guidance and packed-product documentation now permits an explicit corrective prepublication cutoff and full requalification. The tuple freezes after final successful pre-RC qualification. There is no unrelated refresh during actual RC dogfood or between accepted RC and stable. Prose does not duplicate selected package versions.

Both native prerelease plans remain unchanged. Native Nx resolves exactly `1.0.2-rc.3 → 1.0.2-rc.4`; no additional version plan is needed and no rc.5 is created. Repository package release version and release history remain unchanged.

Managed-slot names and ownership are unchanged. Fresh manifest derivation remains root 16 + backend 13 + UI 14 + shared 1 + application 32, or `44 + 32 × application count`: **76 / 108 / 140** for one/two/three applications.

## Qualification results

Repository qualification passed on Node 24.21.0 / Bun 1.4.2:

| Gate | Result |
| --- | --- |
| Focused updater/rc.4 migrations | 44 Vitest tests passed. |
| Focused published migration/rendering/lint-policy tests | 287 Bun tests passed. |
| Root identity negative/positive regression | Original stale identity fails; corrected identity passes. |
| Native Oxlint candidate probe | 1.87.0 rejected by effect-tsgo 0.48.1; selected 1.86.0 patches successfully. |
| Newest jsdom Node 24 rendering | All seven rendering tests passed; forced-Bun failure isolated. |
| `bun run check` | Passed, including 294 Bun tests, 138 Vitest tests, formatting, lint, native typecheck, build/packing and release-version checks. |
| `bun x nx release plan:check` | Passed, including `--base=origin/main`. |
| Native Nx release dry run | Exactly 1.0.2-rc.3 → 1.0.2-rc.4. |
| Root frozen and ordinary reinstalls | Passed; ordinary reinstall leaves bun.lock byte-for-byte unchanged. |
| Scope verification | Exactly five canonical pins changed; canonical keys/role ownership unchanged. All other migration files, registry, runtime policy and version plans are byte-for-byte unchanged. |

The first packed run reached fresh generation after recreating all published sources, then exposed a local-registry setup defect: its protected platform-node-shared namespace contained only historical 4.0.0, while selected platform-node requires ^4.0.1. Registry preparation now resolves the exact installed shared version from platform-node's own package location and exposes that published archive after historical source creation. No consumer manifest or lockfile is manually repaired. The complete gate was rerun with this registry correction and exited **0**. Its disposable candidate was `1.0.2-rc.4-product.run-keenko-product-CaggaO`, published only to loopback Verdaccio.

| Product contract | Result |
| --- | --- |
| Fresh isolated generation | Passed creation, real AuthKit/Effect/Confect fixtures, Node/Edge Runtime/web/UI jsdom discovery, codegen, formatting, canonical consumer check and deterministic shadcn proof. |
| Actual published 1.0.1 upgrades | Untouched, divergent, renamed-application and three-application fixtures passed the entire native lifecycle. |
| Actual published 1.0.2-rc.0 upgrade | Two-application fixture passed. |
| Actual published 1.0.2-rc.1 upgrade | Two-application fixture passed. |
| Actual published 1.0.2-rc.2 upgrade | Two-application fixture passed. |
| Actual published 1.0.2-rc.3 upgrade | Two-application fixture passed. |
| Isolated resolution and peers | `linker = "isolated"`, `hoist = false`, required direct ownership, required installed peers, native/JS compiler separation and final declared/installed/lockfile versions passed. |
| Managed slots | Actual manifests and installed slots verified 76 / 108 / 140 for one/two/three applications. |
| Idempotence | Frozen reinstall, ordinary reinstall, migration rerun, sync rerun and codegen rerun remained stable. Sync preserved 266 managed files and the Bun lockfile. |

Every historical fixture uses the actual published npm archive, then `nx migrate keenko@<candidate>`, install, migration execution, unconditional second install, sync, codegen and check. Source creation preserves released state. No manual consumer normalization or managed-version workaround is used. The final successful repository check also exited 0 after the rendering adapter and registry preparation changes.

## Remaining release risks

The selected tuple is now frozen at this corrective cutoff. Stable Nx still excludes Vitest 5, so the aligned beta remains necessary. Oxlint 1.87.0 remains rejected by the latest cutoff tsgo; native patch support must be requalified in a future cycle. Vitest/jsdom rendering is qualified on supported Node 24; explicitly forcing Vitest to use Bun still reproduces the EventTarget incompatibility.

Existing AuthKit test-entrypoint patch and WorkOS SDK peer limit remain. Confect QueryStream is experimental and its documented outer-refinement derivation limitation remains covered by the registered-reader fixture. Optional React compiler capabilities are not enabled by the generated config.

Non-failing repository Effect diagnostics and the existing duplicate TypeScript manifest warning remain. The successful product command printed the existing Nx/Verdaccio shutdown messages, including `Failed to start verdaccio: undefined`, after every acceptance phase completed; the outer command exited 0 after cleanup. A transient npm connection reset during source setup recovered without changing the tuple.

Merge and public rc.4 publication remain outside this task. Exact published-product verification must pass after publication before ANO-27 begins.
