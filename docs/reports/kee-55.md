# KEE-55 compatibility qualification

Preflight on 2026-10-05. Starting remote `main`: `59f90e5be23e16f0955a3ad013aaf0822a5e7da1`. Public npm ends at `1.0.2-rc.3`; rc.4 is unpublished. Linear KEE-55 was read without mutation.

The table covers all 63 canonical pins and six additional repository dependency names. Registry candidates are the newest published stable versions, independent of updater holds. The discovery column records the unchanged updater run before policy edits.

| Package | Before | Registry stable candidate | Updater discovery | Selected | Constraint |
| --- | --- | --- | --- | --- | --- |
| `@base-ui/react` | `1.8.0` | `1.8.0` | `1.8.0` | `1.8.0` | Newest stable; no current contract requires an older version. |
| `@confect/cli` | `10.0.0-next.25` | `10.0.0` | `10.0.0-next.27` | `10.0.0` | Stable family replaces obsolete next policy; current engines and peers match Effect 4 and Convex. |
| `@confect/core` | `10.0.0-next.25` | `10.0.0` | `10.0.0-next.27` | `10.0.0` | Stable family replaces obsolete next policy; current engines and peers match Effect 4 and Convex. |
| `@confect/server` | `10.0.0-next.25` | `10.0.0` | `10.0.0-next.27` | `10.0.0` | Stable family replaces obsolete next policy; current engines and peers match Effect 4 and Convex. |
| `@confect/test` | `10.0.0-next.25` | `10.0.0` | `10.0.0-next.27` | `10.0.0` | Stable family replaces obsolete next policy; current engines and peers match Effect 4 and Convex. |
| `@convex-dev/react-query` | `0.1.0` | `0.1.0` | `0.1.0` | `0.1.0` | Newest stable; no current contract requires an older version. |
| `@convex-dev/workos-authkit` | `0.2.10` | `0.2.10` | `0.2.10` | `0.2.10` | Newest stable; no current contract requires an older version. |
| `@edge-runtime/vm` | `5.0.0` | `5.0.0` | `5.0.0` | `5.0.0` | Newest stable; no current contract requires an older version. |
| `@effect/platform-node` | `4.0.0` | `4.0.0` | `4.0.0` | `4.0.0` | Newest stable; no current contract requires an older version. |
| `@effect/tsgo` | `0.48.0` | `0.48.0` | `0.48.0` | `0.48.0` | Newest stable; no current contract requires an older version. |
| `@effect/vitest` | `4.0.1` | `4.0.1` | `4.0.1` | `4.0.1` | Newest stable; no current contract requires an older version. |
| `@fontsource-variable/inter` | `5.3.0` | `5.3.0` | `5.3.0` | `5.3.0` | Newest stable; no current contract requires an older version. |
| `@inlang/paraglide-js` | `2.25.4` | `2.25.4` | `2.25.4` | `2.25.4` | Newest stable; no current contract requires an older version. |
| `@nx/devkit` | `23.3.0-beta.9` | `23.2.1` | `23.3.0-beta.9` | `23.3.0-beta.9` | Stable Nx 23.2.1 excludes Vitest 5; next beta.9 supports it and aligns the whole family. |
| `@nx/oxlint` | `23.3.0-beta.9` | `23.2.1` | `23.3.0-beta.9` | `23.3.0-beta.9` | Stable Nx 23.2.1 excludes Vitest 5; next beta.9 supports it and aligns the whole family. |
| `@nx/vitest` | `23.3.0-beta.9` | `23.2.1` | `23.3.0-beta.9` | `23.3.0-beta.9` | Stable Nx 23.2.1 excludes Vitest 5; next beta.9 supports it and aligns the whole family. |
| `@playwright/test` | `1.63.0` | `1.63.0` | `1.63.0` | `1.63.0` | Newest stable; no current contract requires an older version. |
| `@tailwindcss/vite` | `4.3.3` | `4.3.3` | `4.3.3` | `4.3.3` | Newest stable; no current contract requires an older version. |
| `@tanstack/create` | `0.70.1` | `0.70.1` | `0.70.1` | `0.70.1` | Newest stable; no current contract requires an older version. |
| `@tanstack/devtools-vite` | `0.8.5` | `0.8.5` | `0.8.5` | `0.8.5` | Newest stable; no current contract requires an older version. |
| `@tanstack/intent` | `0.5.0` | `0.5.4` | `0.5.4` | `0.5.4` | Newest stable; no current contract requires an older version. |
| `@tanstack/react-devtools` | `0.10.13` | `0.10.13` | `0.10.13` | `0.10.13` | Newest stable; no current contract requires an older version. |
| `@tanstack/react-form` | `1.33.5` | `1.33.5` | `1.33.5` | `1.33.5` | Newest stable; no current contract requires an older version. |
| `@tanstack/react-query` | `5.104.1` | `5.104.1` | `5.104.1` | `5.104.1` | Newest stable; no current contract requires an older version. |
| `@tanstack/react-query-devtools` | `5.104.1` | `5.104.1` | `5.104.1` | `5.104.1` | Newest stable; no current contract requires an older version. |
| `@tanstack/react-router` | `1.170.41` | `1.170.41` | `1.170.41` | `1.170.41` | Newest stable; no current contract requires an older version. |
| `@tanstack/react-router-devtools` | `1.167.2` | `1.167.2` | `1.167.2` | `1.167.2` | Newest stable; no current contract requires an older version. |
| `@tanstack/react-router-ssr-query` | `1.167.3` | `1.167.3` | `1.167.3` | `1.167.3` | Newest stable; no current contract requires an older version. |
| `@tanstack/react-start` | `1.168.60` | `1.168.60` | `1.168.60` | `1.168.60` | Newest stable; no current contract requires an older version. |
| `@tanstack/react-table` | `9.2.4` | `9.2.6` | `9.2.6` | `9.2.6` | Newest stable; no current contract requires an older version. |
| `@tanstack/router-cli` | `1.167.40` | `1.167.40` | `1.167.40` | `1.167.40` | Newest stable; no current contract requires an older version. |
| `@testing-library/dom` | `10.4.2` | `10.4.2` | `10.4.2` | `10.4.2` | Newest stable; no current contract requires an older version. |
| `@testing-library/react` | `16.3.3` | `16.3.3` | `16.3.3` | `16.3.3` | Newest stable; no current contract requires an older version. |
| `@types/bun` | `1.4.2` | `1.4.2` | `1.4.2` | `1.4.2` | Newest stable; no current contract requires an older version. |
| `@types/node` | `24.19.1` | `26.6.4` | `24.19.1` | `24.19.1` | Supported Node 24 runtime; newest matching types. |
| `@types/react` | `19.3.0` | `19.3.0` | `19.3.0` | `19.3.0` | Newest stable; no current contract requires an older version. |
| `@types/react-dom` | `19.3.0` | `19.3.0` | `19.3.0` | `19.3.0` | Newest stable; no current contract requires an older version. |
| `@typescript/native` | `npm:typescript@7.0.2` | `7.0.2` | `npm:typescript@7.0.2` | `npm:typescript@7.0.2` | Exact alias selects the native compiler; the separate JS API slot remains on TypeScript 6. |
| `@vitejs/plugin-react` | `6.1.1` | `6.1.1` | `6.1.1` | `6.1.1` | Newest stable; no current contract requires an older version. |
| `@workos-inc/authkit-react` | `0.16.3` | `0.16.3` | `0.16.3` | `0.16.3` | Newest stable; no current contract requires an older version. |
| `@workos-inc/node` | `11.0.0` | `11.0.0` | `11.0.0` | `10.14.0` | Both installed AuthKit integrations exclude SDK 11; newest shared SDK 10 is 10.14.0. |
| `@workos/authkit-tanstack-react-start` | `0.11.1` | `0.11.1` | `0.11.1` | `0.11.1` | Newest stable; no current contract requires an older version. |
| `class-variance-authority` | `0.7.1` | `0.7.1` | `0.7.1` | `0.7.1` | Newest stable; no current contract requires an older version. |
| `cn` | `0.4.0` | `0.4.0` | `0.4.0` | `0.4.0` | Newest stable; no current contract requires an older version. |
| `convex` | `1.46.0` | `1.46.0` | `1.46.0` | `1.46.0` | Newest stable; no current contract requires an older version. |
| `convex-test` | `0.0.60` | `0.0.60` | `0.0.60` | `0.0.60` | Newest stable; no current contract requires an older version. |
| `effect` | `4.0.1` | `4.0.1` | `4.0.1` | `4.0.1` | Newest stable; no current contract requires an older version. |
| `jsdom` | `30.0.1` | `30.1.2` | `30.0.1` | `30.0.1` | Every 30.1.x release fails real Vitest 5 environment setup on Node 24; 30.0.1 passes. |
| `lucide-react` | `1.50.0` | `1.52.0` | `1.52.0` | `1.52.0` | Newest stable; no current contract requires an older version. |
| `nx` | `23.3.0-beta.9` | `23.2.1` | `23.3.0-beta.9` | `23.3.0-beta.9` | Stable Nx 23.2.1 excludes Vitest 5; next beta.9 supports it and aligns the whole family. |
| `oxfmt` | `0.71.0` | `0.71.0` | `0.71.0` | `0.71.0` | Newest stable; no current contract requires an older version. |
| `oxlint` | `1.86.0` | `1.86.0` | `1.86.0` | `1.86.0` | Newest stable; no current contract requires an older version. |
| `oxlint-plugin-effect` | `0.27.0` | `0.27.1` | `0.27.0` | `0.27.1` | Newest stable; no current contract requires an older version. |
| `oxlint-tsgolint` | `7.0.2003` | `7.0.2003` | `7.0.2003` | `7.0.2003` | Newest stable; no current contract requires an older version. |
| `react` | `19.3.0` | `19.3.0` | `19.3.0` | `19.3.0` | Newest stable; no current contract requires an older version. |
| `react-dom` | `19.3.0` | `19.3.0` | `19.3.0` | `19.3.0` | Newest stable; no current contract requires an older version. |
| `shadcn` | `4.21.1` | `4.21.1` | `4.21.1` | `4.21.1` | Newest stable; no current contract requires an older version. |
| `tailwindcss` | `4.3.3` | `4.3.3` | `4.3.3` | `4.3.3` | Newest stable; no current contract requires an older version. |
| `tw-animate-css` | `1.4.0` | `1.4.0` | `1.4.0` | `1.4.0` | Newest stable; no current contract requires an older version. |
| `typescript` | `6.0.2` | `7.0.2` | `6.0.2` | `6.0.3` | TypeScript 7 omits the JavaScript compiler API used by Nx and migrations; newest JS API release is 6.0.3. |
| `ultracite` | `7.12.2` | `7.12.3` | `7.12.3` | `7.12.3` | Newest stable; no current contract requires an older version. |
| `vite` | `8.3.2` | `8.3.2` | `8.3.2` | `8.3.2` | Newest stable; no current contract requires an older version. |
| `vitest` | `5.0.3` | `5.0.3` | `5.0.3` | `5.0.3` | Newest stable; no current contract requires an older version. |
| `minimatch` | `10.2.5` | `10.2.6` | `10.2.5` | `10.2.6` | Newest stable; no current contract requires an older version. |
| `tslib` | `2.8.1` | `2.8.1` | `2.8.1` | `2.8.1` | Newest stable; no current contract requires an older version. |
| `validate-npm-package-name` | `8.0.0` | `8.0.0` | `8.0.0` | `8.0.0` | Newest stable; no current contract requires an older version. |
| `@nx/js` | `23.3.0-beta.9` | `23.2.1` | `23.3.0-beta.9` | `23.3.0-beta.9` | Stable Nx 23.2.1 excludes Vitest 5; next beta.9 supports it and aligns the whole family. |
| `@types/validate-npm-package-name` | `4.0.2` | `4.0.2` | `4.0.2` | `4.0.2` | Newest stable; no current contract requires an older version. |
| `verdaccio` | `6.10.3` | `6.10.5` | `6.10.3` | `6.10.5` | Newest stable; no current contract requires an older version. |

## Current upstream contracts

Every candidate manifest was read from the public npm registry, including engines, peer dependencies, peer optionality, runtime dependencies, dist-tags and all published versions. Exact target manifests were also inspected for held packages. Unchanged candidates introduce no version delta from the starting main; they still participate in fresh and historical product qualification.

| Package | Candidate Node engine | Candidate peers |
| --- | --- | --- |
| `@base-ui/react` | `>=14.0.0` | `react ^17 \|\| ^18 \|\| ^19`; `date-fns ^4.0.0`; `react-dom ^17 \|\| ^18 \|\| ^19`; `@date-fns/tz ^1.2.0`; `@types/react ^17 \|\| ^18 \|\| ^19` |
| `@confect/cli` | `>=24` | `effect ^4.0.0`; `@confect/core ^10.0.0`; `@confect/server ^10.0.0` |
| `@confect/core` | `>=24` | `convex ^1.32.0`; `effect ^4.0.0` |
| `@confect/server` | `>=24` | `convex ^1.45.0`; `effect ^4.0.0`; `@confect/core ^10.0.0`; `@effect/platform-node ^4.0.0` |
| `@confect/test` | `>=24` | `convex ^1.32.0`; `effect ^4.0.0`; `convex-test >=0.0.50 <0.1.0`; `@confect/core ^10.0.0`; `@confect/server ^10.0.0` |
| `@convex-dev/react-query` | `No Node engine declared` | `convex ^1.29.3`; `@tanstack/react-query ^5.0.0` |
| `@convex-dev/workos-authkit` | `No Node engine declared` | `react ^18.3.1 \|\| ^19.0.0`; `convex ^1.29.3`; `@workos-inc/node ^7.75.1 \|\| ^8.0.0 \|\| ^9.0.0 \|\| ^10.0.0`; `@workos-inc/authkit-react ^0.13.0 \|\| ^0.16.0` |
| `@edge-runtime/vm` | `>=18` | None declared |
| `@effect/platform-node` | `>=18.0.0` | `redis >=5.0.0 <7.0.0`; `effect ^4.0.0` |
| `@effect/tsgo` | `No Node engine declared` | None declared |
| `@effect/vitest` | `No Node engine declared` | `effect ^4.0.1`; `vitest >=5.0.0 <6.0.0` |
| `@fontsource-variable/inter` | `No Node engine declared` | None declared |
| `@inlang/paraglide-js` | `No Node engine declared` | `vite >=5.0.0`; `typescript >=5.6` |
| `@nx/devkit` | `No Node engine declared` | `nx >= 22 <= 24 \|\| ^23.0.0-0` |
| `@nx/oxlint` | `^20.19.0 \|\| >=22.12.0` | `oxlint ^1.43.0` |
| `@nx/vitest` | `No Node engine declared` | `vite ^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0`; `vitest ^3.0.0 \|\| ^4.0.0`; `@nx/eslint 23.2.1` |
| `@playwright/test` | `>=20` | None declared |
| `@tailwindcss/vite` | `No Node engine declared` | `vite ^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8` |
| `@tanstack/create` | `>=20` | None declared |
| `@tanstack/devtools-vite` | `>=18` | `vite ^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0` |
| `@tanstack/intent` | `>=20.12.0` | None declared |
| `@tanstack/react-devtools` | `>=18` | `react >=16.8`; `react-dom >=16.8`; `@types/react >=16.8`; `@types/react-dom >=16.8` |
| `@tanstack/react-form` | `No Node engine declared` | `react ^17.0.0 \|\| ^18.0.0 \|\| ^19.0.0` |
| `@tanstack/react-query` | `No Node engine declared` | `react ^18 \|\| ^19` |
| `@tanstack/react-query-devtools` | `No Node engine declared` | `react ^18 \|\| ^19`; `@types/react ^18 \|\| ^19`; `@tanstack/react-query ^5.104.1` |
| `@tanstack/react-router` | `>=20.19` | `react >=18.0.0 \|\| >=19.0.0`; `react-dom >=18.0.0 \|\| >=19.0.0` |
| `@tanstack/react-router-devtools` | `>=20.19` | `react >=18.0.0 \|\| >=19.0.0`; `react-dom >=18.0.0 \|\| >=19.0.0`; `@tanstack/router-core ^1.171.30`; `@tanstack/react-router ^1.170.36` |
| `@tanstack/react-router-ssr-query` | `>=20.19` | `react >=18.0.0 \|\| >=19.0.0`; `react-dom >=18.0.0 \|\| >=19.0.0`; `@tanstack/query-core >=5.102.0`; `@tanstack/react-query >=5.102.0`; `@tanstack/react-router >=1.170.33` |
| `@tanstack/react-start` | `>=22.12.0` | `vite >=7.0.0`; `react >=18.0.0 \|\| >=19.0.0`; `react-dom >=18.0.0 \|\| >=19.0.0`; `@rsbuild/core ^2.0.0` |
| `@tanstack/react-table` | `>=20` | `react >=18` |
| `@tanstack/router-cli` | `>=20.19` | None declared |
| `@testing-library/dom` | `>=18` | None declared |
| `@testing-library/react` | `>=18` | `react ^18.0.0 \|\| ^19.0.0`; `react-dom ^18.0.0 \|\| ^19.0.0`; `@types/react ^18.0.0 \|\| ^19.0.0`; `@types/react-dom ^18.0.0 \|\| ^19.0.0`; `@testing-library/dom ^10.0.0` |
| `@types/bun` | `No Node engine declared` | None declared |
| `@types/node` | `No Node engine declared` | None declared |
| `@types/react` | `No Node engine declared` | None declared |
| `@types/react-dom` | `No Node engine declared` | `@types/react ^19.3.0` |
| `@typescript/native` | `>=16.20.0` | None declared |
| `@vitejs/plugin-react` | `^20.19.0 \|\| >=22.12.0` | `vite ^8.0.0`; `oxc-transform-react ^0.145.0`; `@rolldown/plugin-babel ^0.1.7 \|\| ^0.2.0`; `babel-plugin-react-compiler ^1.0.0` |
| `@workos-inc/authkit-react` | `No Node engine declared` | `react >=17` |
| `@workos-inc/node` | `>=22.11.0` | None declared |
| `@workos/authkit-tanstack-react-start` | `>=22.11.0` | `react ^18.0 \|\| ^19.0`; `react-dom ^18.0 \|\| ^19.0`; `@workos-inc/node ^10.7.0`; `@tanstack/react-start >=1.168.25`; `@tanstack/react-router >=1.0.0` |
| `class-variance-authority` | `No Node engine declared` | None declared |
| `cn` | `>=20` | None declared |
| `convex` | `>=20.0.0` | `react ^18.0.0 \|\| ^19.0.0-0 \|\| ^19.0.0`; `@clerk/react ^6.4.3`; `@auth0/auth0-react ^2.0.1`; `@clerk/clerk-react ^4.12.8 \|\| ^5.0.0` |
| `convex-test` | `No Node engine declared` | `convex ^1.43.0` |
| `effect` | `No Node engine declared` | None declared |
| `jsdom` | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` | `canvas ^3.2.3` |
| `lucide-react` | `No Node engine declared` | `react ^16.5.1 \|\| ^17.0.0 \|\| ^18.0.0 \|\| ^19.0.0`; `@types/react *` |
| `nx` | `No Node engine declared` | `@swc/core ^1.15.8`; `@swc-node/register ^1.11.1` |
| `oxfmt` | `^20.19.0 \|\| >=22.12.0` | `svelte ^5.0.0`; `vite-plus *` |
| `oxlint` | `^20.19.0 \|\| >=22.12.0` | `vite-plus *`; `oxlint-tsgolint >=7.0.2003` |
| `oxlint-plugin-effect` | `No Node engine declared` | `effect >=4.0.0 <5` |
| `oxlint-tsgolint` | `No Node engine declared` | None declared |
| `react` | `>=0.10.0` | None declared |
| `react-dom` | `No Node engine declared` | `react ^19.3.0` |
| `shadcn` | `>=20.18.1` | None declared |
| `tailwindcss` | `No Node engine declared` | None declared |
| `tw-animate-css` | `No Node engine declared` | None declared |
| `typescript` | `>=16.20.0` | None declared |
| `ultracite` | `No Node engine declared` | `oxfmt >=0.59.0`; `eslint ^10.9.0`; `oxlint ^1.86.0`; `prettier ^3.0.0`; `stylelint ^17.0.0`; `@biomejs/biome ^2.5.0` |
| `vite` | `^20.19.0 \|\| >=22.12.0` | `tsx ^4.8.1`; `jiti >=1.21.0`; `less ^4.0.0`; `sass ^1.70.0`; `yaml ^2.4.2`; `stylus >=0.54.8`; `terser ^5.16.0`; `esbuild ^0.27.0 \|\| ^0.28.0`; `sugarss ^5.0.0`; `@types/node ^20.19.0 \|\| >=22.12.0`; `sass-embedded ^1.70.0`; `@vitejs/devtools ^0.7.1` |
| `vitest` | `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` | `vite ^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0`; `jsdom *`; `happy-dom *`; `@vitest/ui 5.0.3`; `@types/node ^22.0.0 \|\| >=24.0.0`; `@edge-runtime/vm *`; `@opentelemetry/api ^1.9.0`; `@vitest/coverage-v8 5.0.3`; `@vitest/browser-preview 5.0.3`; `@vitest/coverage-istanbul 5.0.3`; `@vitest/browser-playwright 5.0.3`; `@vitest/browser-webdriverio ^5.0.0-beta.5 \|\| >=5.0.0` |
| `minimatch` | `18 \|\| 20 \|\| >=22` | None declared |
| `tslib` | `No Node engine declared` | None declared |
| `validate-npm-package-name` | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` | None declared |
| `@nx/js` | `No Node engine declared` | `@swc/cli >=0.6.0 <0.9.0`; `verdaccio ^6.0.5` |
| `@types/validate-npm-package-name` | `No Node engine declared` | None declared |
| `verdaccio` | `>=22` | None declared |

## Release and API review

- Nx: stable `@nx/vitest` supports Vitest 3/4; beta.9 adds Vitest 5. No Nx family version changes from KEE-54, so its native `migrate-to-vitest-5` lifecycle remains authoritative. No hand-written copy of the native transform.
- Effect: `effect` and `@effect/vitest` 4.0.1, platform-node 4.0.0 and tsgo 0.48.0 are the latest stable members. The integration requires Effect ^4.0.1 and Vitest >=5 <6. Installed tsgo documents native TypeScript 7.0.2, Oxlint 1.86.0 and tsgolint 7.0.2003 support.
- Vitest/Vite: 5.0.3 and 8.3.2 remain latest stable and satisfy both Nx and Effect integration contracts. `effect/noEffectRunInTests` remains enabled, with official Effect/Vitest tests.
- Confect: all four stable 10.0.0 packages are mutually compatible. [Stable release notes](https://github.com/rjdellecese/confect/releases/tag/%40confect%2Fserver%4010.0.0) require Node 24, stable Effect 4, and server Convex ^1.45.0. Reviewed field-map args, core Table imports, serializable codecs, SchemaError, named runners, upload Effect, direct TestConfect layer, record-keyed generated containers, HTTP route layers, QueryStream, codegen, config and clock behavior. Next.26 introduces named runners and unified Storage; next.27 adopts stable Effect peers.
- KEE-52: stable indexed get still calls native uniqueness and reports typed absence; QueryStream.unique returns Option and typed NotUniqueError. Stream.runHead handles existence, collect handles all rows, and QueryStream combinators retain keyed composition and pagination. These semantics remain unchanged. Stable SystemFields source matches next.25; the real registered-reader fixture checks field validation and the documented loss of outer refinement checks.
- [jsdom release notes](https://github.com/jsdom/jsdom/releases/tag/v30.1.2): DOM/CSS correctness and performance fixes do not resolve the Vitest EventTarget receiver failure. Current installed rendering reproduction rejects 30.1.0, 30.1.1 and 30.1.2 on Node 24; 30.0.1 passes.
- [Effect lint plugin 0.27.1](https://github.com/cevr/effect-oxlint/releases/tag/v0.27.1): literal/static template member keys gain noNodeBuiltinImport coverage. Installed preset and diagnostic-ownership tests qualify the patch without policy weakening.
- [TanStack Table 9.2.6](https://github.com/TanStack/table/releases/tag/%40tanstack%2Freact-table%409.2.6): reorganizes shipped Intent skills; 9.2.5 refreshes Store patches. [Intent 0.5.4](https://github.com/TanStack/intent/releases/tag/v0.5.4) changes skill discovery, validation, and hooks. Product Intent initialization, discovery and rerun checks qualify their integration.
- [Ultracite 7.12.3](https://github.com/haydenbleasel/ultracite/releases/tag/ultracite%407.12.3): adds a type-aware Oxlint rule requiring 1.86.0 and fixes config typing; relevant presets are tested by repository and generated checks. ESLint/Biome changes do not alter the selected Oxlint architecture.
- [Lucide 1.52.0](https://github.com/lucide-icons/lucide/releases/tag/1.52.0): icon fixes and additions; React peers include 19.3.
- [Minimatch 10.2.6](https://github.com/isaacs/minimatch/compare/v10.2.5...v10.2.6): path-drive/UNC regression tests and dependency refresh; owning generator tests qualify existing matching behavior. Verdaccio 6.10.5 archive changelog reviews search validation, token/publication handling and package/version validation. The local product registry exercises candidate publication and archive consumption.
- WorkOS: SDK [11.0.0](https://github.com/workos/workos-node/releases/tag/v11.0.0) changes Pipes APIs, but the decisive constraint is both AuthKit peer ranges. Backend AuthKit allows SDK ^7.75.1 through ^10; TanStack AuthKit requires ^10.7.0. 10.14.0 is the latest shared stable. Real AuthKit registration, component queries, frontend builds and lifecycle tests qualify the supported tuple.
- React, types and DOM remain aligned at latest stable. TanStack Query/Router/Start, Convex, Tailwind/plugin, testing-library and remaining packages retain latest stable candidates after current engine/peer inspection; required peers are checked from installed package locations in the product resolution probe. Optional capabilities do not create unrelated dependencies.

## Policy and migrations

Removed all four obsolete Confect `next` channels. A single Nx-family policy discovers its deliberately qualified `next` candidate alongside stable discovery. Retained exact holds for the Nx family, Effect/test integration, Vitest/Vite, jsdom and the TypeScript JavaScript API. Updated the JS API hold to 6.0.3 and added the WorkOS SDK 10.14.0 peer constraint. Removed the obsolete Effect lint-plugin hold. Regression tests pass a deliberately incompatible latest resolver over every hold: each candidate is discovered and exposed while the held selection is preserved. Stable Confect resolves through latest.

Added `1.0.2-compatibility-baseline` at rc.4, after KEE-54 and before native Nx migrations. It prevalidates manifest ownership, converges the new frozen role snapshot and preserves consumer-owned slots and Bun lockfile ownership. Earlier factories and snapshots remain unchanged. The original generated functions have no affected runner calls or argument declarations; codegen regenerates stable container/service bindings. No generic rewrite of authored application code is introduced.

Release/dependency guidance now requires a full newest-compatible sweep before dogfood, qualification of coupled tuples, and a frozen tuple throughout corrective RCs and accepted-RC stable promotion. Versions remain owned by packageVersions. Confect guidance updates syntax without changing cardinality or authority rules.

Nx natively combines the two prerelease plans into one bump. The dry run resolves exactly `1.0.2-rc.3 → 1.0.2-rc.4`. No release history, package release version, or published state is rewritten.

## Qualification results

Qualification ran on supported Node 24.21.0 and Bun 1.4.2. The complete packed product run exited successfully. Its disposable candidate was published only to the local Verdaccio registry; public rc.4 remains unpublished.

| Contract | Result |
| --- | --- |
| Focused updater and migration tests | Passed, including hold drift, stable Confect policy, slot derivation, atomic ambiguity rejection and migration replay. |
| `bun run check` | Passed: 293 Bun tests and 129 Vitest tests, lint, formatting, typecheck, vendored-asset checks, build, packed artifact checks and release-version checks. |
| `bun x nx release plan:check` | Passed with both unpublished prerelease plans. |
| `git diff --check` | Passed. |
| Fresh isolated product | Passed generation, codegen, canonical check, real AuthKit/Effect/Confect tests and deterministic shadcn proof. |
| Published 1.0.1 upgrades | Passed untouched, divergent, renamed-application and three-application fixtures. |
| Published 1.0.2-rc.0 upgrade | Passed the two-application fixture. |
| Published 1.0.2-rc.1 upgrade | Passed the two-application fixture. |
| Published 1.0.2-rc.2 upgrade | Passed the two-application fixture. |
| Published 1.0.2-rc.3 upgrade | Passed the two-application fixture. |
| Isolated dependency resolution | Passed with `linker = "isolated"`, `hoist = false`, required direct ownership, installed required peer ranges and native/JavaScript compiler separation. |
| Idempotence | Frozen reinstall, ordinary reinstall, migration rerun, sync rerun and codegen rerun stayed stable. |
| Native release dry run | Exactly `1.0.2-rc.3 → 1.0.2-rc.4`; the two plans produce one bump. |

Historical fixtures use actual published npm archives and the canonical lifecycle: `nx migrate keenko@<candidate>`, install, native migration execution, unconditional second install, sync, codegen and check. No manual consumer normalization was used. Native Nx owns the Vitest reporter transform. Each fresh/upgraded fixture also qualifies the stable Confect authored fixture through codegen, backend typecheck and two real official Effect/Vitest tests.

Managed slots were re-derived from fresh manifests and the final frozen snapshot: root 16 + backend 13 + UI 14 + shared 1 + application 32 per app. The formula remains `44 + 32 × application count`: **76 / 108 / 140** for one / two / three applications. These are managed dependency slots, excluding Keenko itself and Nx scaffold-owned slots. The packed products verify declared, installed and lockfile versions for every managed slot.

Repository checks retain non-failing Effect tsgo diagnostics for unstable process APIs and typed decoder recommendations. No qualification failures remain. Current limitations are the required Nx beta, the rejected jsdom 30.1.x line, the existing AuthKit test-entrypoint patch, and Confect's experimental QueryStream and documented outer-refinement derivation behavior. Optional peer capabilities are not installed merely to satisfy optional features. Published-product verification of the exact public rc.4 is still required after merge and publication before ANO-27 can begin. This change does not merge, publish rc.4, modify Linear or touch Anoulà.

## Updater discovery correction

The initial updater discovery column above records the unchanged preflight command. At that point, holds bypassed registry lookup; the independent full-registry inspection supplied those candidates for qualification. The correction makes discovery explicit for every managed package, including held packages.

`updateDependencySources` and `updateDependencies` return a record keyed by managed package name. Each entry contains `selector`, `stableCandidate`, `selected` and `held`, plus `prereleaseCandidate` and `prereleaseChannel` when that family deliberately tracks a prerelease. Alias entries retain their exact `npm:` representation, while registry lookup uses the aliased package name. Node types retain the supported runtime-major selector. Only selected versions are written. A failed candidate lookup fails the sweep before writes and lockfile refresh, including when a hold exists.

CLI output shows stable and configured prerelease candidates alongside selected versions whenever either candidate differs from selected state, and for changed selections. Unchanged unheld pins remain quiet. Compatibility rationale stays in the existing hold comments and qualification report; the updater does not solve peers or change holds automatically.

The selected tuple, frozen migration snapshots, package manifests and lockfile remain byte-for-byte unchanged by this correction. Managed counts and the two existing version plans remain unchanged. The previous complete fresh/historical packed-product proof therefore remains applicable; the correction changes maintainer discovery and reporting, not the selected generated package state.

Correction verification passed: 24 focused updater tests; `bun run check` with 293 Bun and 138 Vitest tests; native version-plan check; `git diff --check`; and an unchanged `1.0.2-rc.3 → 1.0.2-rc.4` native release dry run. Coverage includes all current holds, held drift and equal candidates, ordinary adoption, alias preservation, runtime-major selectors, failed held discovery before mutation/installation, and existing install rollback.

## Nx prerelease candidate discovery

One repository-maintenance policy, `prereleaseChannels.nx`, applies to `nx` and managed `@nx/*` packages. All five owned members receive mandatory stable and configured channel lookups. The aligned root-only `@nx/js` declaration is included in discovery without becoming a new canonical packageVersions slot; its selected version continues to follow the Nx hold. Confect retains stable-only lookup. Ordinary packages and supported-runtime Node-type selectors retain their existing stable discovery behavior.

A live registry recheck confirmed every owned Nx member (`nx`, `@nx/devkit`, `@nx/js`, `@nx/oxlint`, `@nx/vitest`) has `latest = 23.2.1` and `next = 23.3.0-beta.9`. The qualified selection remains beta.9. Tests also cover a newer beta, stable catching up, and the same prerelease; no candidate is automatically preferred or adopted. Failure of either required lookup aborts before source/manifest writes and lockfile refresh.

Selected pins, manifests, lockfile, migration snapshots and version plans remain byte-for-byte unchanged. The prior full product proof still applies, and no new version plan or product qualification run is needed for this discovery-only correction.
