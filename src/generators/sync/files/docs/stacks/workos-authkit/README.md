# WorkOS AuthKit

## Outcome

Every Keenko project starts with a production-shaped WorkOS AuthKit foundation that uses Hosted UI, Convex-managed development provisioning, Convex JWT authentication, and the official `@convex-dev/workos-authkit` component. Routes remain public by default. Authentication infrastructure does not create an application domain user model or own authorization policy.

## Ownership

- Root `convex.json` owns Convex-managed WorkOS environment provisioning and development redirect/CORS configuration.
- `apps/web/src/start.ts` installs the official AuthKit middleware and preserves TanStack Start CSRF protection.
- `apps/web/src/routes/api/auth/**` owns the Hosted UI sign-in and callback HTTP routes.
- `apps/web/src/routes/protected.tsx` and `apps/web/src/server/auth.ts` demonstrate opt-in protected route and server-function boundaries with the official `getAuth` API.
- `apps/web/src/router.tsx` bridges AuthKit access tokens to Convex through `ConvexProviderWithAuth`.
- `packages/backend/confect/auth.ts` configures the documented WorkOS JWT providers through Confect's official Convex auth-config extension point. It deliberately does not import the component client's `getAuthConfigProviders()` helper: the current component package causes Convex auth-config analysis to require the optional `WORKOS_ACTION_SECRET` even when WorkOS Actions are not configured.
- `packages/backend/confect/workos.ts` owns the official component client. `packages/backend/confect/authentication.ts` owns the thin native boundary for `authentication.findCurrent`, while `packages/backend/confect/authentication.impl.ts` owns the ordinary Confect/Effect `authentication.getCurrent` query.
- `packages/backend/confect/http.ts` owns the component webhook endpoint through Confect's official HTTP extension point.
- Confect materializes those extension points into `packages/backend/convex/auth.config.ts`, `packages/backend/convex/authentication.ts`, and `packages/backend/convex/http.ts`; do not edit the generated files.
- WorkOS owns authentication and synchronized identity metadata. Convex/application code owns authorization, resource ownership, permissions, and business policy.

The component's synchronized WorkOS user is authentication/infrastructure identity. It is not the canonical application `User`, `Profile`, `Member`, `Customer`, or other domain concept. Add a domain model only when the product needs one, with an explicit reference to infrastructure identity.

## Prerequisites

- Node and Bun versions declared by the generated root manifest.
- A Convex account and permission to create or select a development deployment.
- For automatic provisioning, permission to associate a Convex team with a Convex-managed WorkOS team.
- For synchronized users, access to the provisioned WorkOS environment and permission to configure its webhook.
- For the provisioned smoke flow, the development `WORKOS_API_KEY` and `WORKOS_CLIENT_ID` supplied by Convex-managed provisioning plus `AUTH_E2E_EMAIL_DOMAIN`, a project-controlled domain that is not routed to SSO or the WorkOS test IdP.

Production WorkOS environments, credentials, redirect URLs, hosting secrets, and deployment policy are project-owned. Never paste secrets into source, issue descriptions, logs, or tracked `.env` files.

## Development provisioning

1. From the generated workspace root, run `bun run dev`.
2. Follow the Convex prompts to create or select the development deployment and associate the Convex team with a Convex-managed WorkOS team.
3. Convex provisions the non-production WorkOS environment, stores `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, and environment identity in the Convex deployment, configures the development URLs from root `convex.json`, and writes the required local AuthKit values plus a generated cookie password to untracked `.env.local`.
4. Open `http://localhost:3000` and use the sign-in link. AuthKit Hosted UI is the canonical default, and email/password is enabled by default without any WorkOS Dashboard configuration.

Expected result: Hosted UI returns to `/api/auth/callback`, the client obtains a WorkOS access token, and Convex validates the identity. `useConvexAuth()` becomes authenticated before authenticated Convex UI is shown.

If a project already owns a WorkOS team, follow the current official Convex manual-team path instead. That is a project-specific provisioning choice; it does not change the generated architecture.

## Synchronized WorkOS user

Convex-managed AuthKit provisioning does not currently create the webhook required by the official component. For v1, this is an explicit first-party provisioning step in addition to normal AuthKit provisioning:

1. Find the development deployment HTTP Actions URL in the Convex dashboard.
2. In the corresponding WorkOS non-production environment, create a webhook for `user.created`, `user.updated`, and `user.deleted` at `https://<deployment>.convex.site/workos/webhook`.
3. Copy the webhook secret directly into the Convex deployment environment as `WORKOS_WEBHOOK_SECRET` using the dashboard or `bun x convex env set WORKOS_WEBHOOK_SECRET <secret>`.
4. Restart or let `bun run dev` push the updated environment and sign in once through Hosted UI.

The real webhook secret belongs only in the provisioned Convex deployment. Do not copy it into root `.env.local`: local Confect codegen and watch processes construct the component only to analyze and materialize backend modules; they do not receive or verify incoming WorkOS webhooks. Their generated package scripts provide fresh process-scoped UUID sentinels for the component's three eagerly validated values. The remote Convex HTTP action verifies real webhook signatures with the deployment secret.

Expected result: `authKit.getAuthUser(ctx)` returns the synchronized WorkOS identity for the authenticated caller. Do not mirror it into an application table unless a product-owned domain concept requires that data.

This manual step is a current upstream gap. Do not add Keenko-owned cloud provisioning or a custom `keenko auth setup` lifecycle solely to automate it. If Convex-managed first-party provisioning later gains component-webhook support, remove this step in favor of that support.

WorkOS Actions are not part of the Keenko baseline. `WORKOS_ACTION_SECRET` becomes project-owned configuration only if a project deliberately enables Actions. If the official component stops leaking that optional variable into Convex auth-config analysis, prefer its provider helper again when it preserves the same documented JWT configuration.

## Public and protected boundaries

- Public is the default. A route with no auth loader remains public.
- A protected TanStack route calls `getAuth()` in its loader and redirects to `/api/auth/sign-in` when no user exists.
- A protected TanStack server function calls `getAuth()` inside its handler and rejects an absent user.
- `authentication.findCurrent` is public and nullable at the Convex/JavaScript boundary. Its Effect-owned workflow uses Confect's `Auth` service for identity, represents absence with `Option`, and adapts the official component's native-context Promise before encoding absence as `null` for transport.
- `authentication.getCurrent` is an ordinary Confect/Effect query. It derives identity through Confect's `Auth` service and maps absent identity to the typed `AuthenticationRequired` failure. Never accept a caller-supplied user identifier for authorization.
- Use `identity.tokenIdentifier` as the stable authenticated identity key when application data needs an ownership reference. Keep authorization decisions in Convex/application code; do not treat WorkOS roles, permissions, organizations, or entitlements as Keenko's general policy model.

## Deterministic verification

`bun run check` intentionally does not start Convex, contact WorkOS, read production secrets, or run provisioned auth E2E. The official component currently validates `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, and `WORKOS_WEBHOOK_SECRET` eagerly during construction, so the backend codegen and local Confect watch commands create invalid, non-secret UUID sentinels directly in their process environments while Confect analyzes and materializes static generated state. UUIDs lack the WorkOS credential prefixes and are deliberately unusable as real credentials. Those local paths only construct the SDK and register functions; they do not invoke WorkOS operations or webhook verification. No sentinel value is stored in package configuration, `.env` files, generated output, deployment state, or application runtime. This is narrow upstream compatibility debt, not a pattern to copy into project code.

From a clean generated repository with no `.env.local`, run:

```sh
bun install --frozen-lockfile
bun run check
git status --short
```

Expected result: the check passes and Git remains clean. Failure recovery is ordinary repository recovery: inspect generated drift, correct authored inputs, rerun codegen/check, and review changes. Do not provision cloud resources merely to make the deterministic gate pass.

## Provisioned authentication smoke

The separate smoke creates a verified disposable user on the explicitly configured `AUTH_E2E_EMAIL_DOMAIN` through the official server SDK, signs that user in with email/password through Hosted UI, and deletes it in cleanup. Do not use `example.com`: a WorkOS staging environment may route that reserved domain to its test IdP instead of password authentication. The generated password exists only in the Playwright process and is never printed, persisted, or added to configuration. Email verification delivery is not the behavior under test.

1. Complete development provisioning and component webhook setup above.
2. Keep `bun run dev` running.
3. In another terminal at the workspace root, install the Playwright browser once with `bun x playwright install chromium`.
4. Run `AUTH_E2E_BASE_URL=http://localhost:3000 AUTH_E2E_EMAIL_DOMAIN=<project-controlled-domain> bun run test:auth:e2e`.
5. Observe Playwright complete Hosted UI email/password sign-in and its assertions. No manual credentials or inbox access are required.

The smoke verifies the Hosted UI redirect, authenticated Convex state, synchronized WorkOS component user, and sign-out. It also verifies test-user cleanup. It is not part of `bun run check` and must not be enabled in ordinary CI without a separately approved secret/account design.

If the test stops before synchronized-user confirmation, verify the WorkOS webhook URL/events and the deployed Convex environment's `WORKOS_WEBHOOK_SECRET`. If Convex remains unauthenticated, verify the generated callback URL and the provisioned client ID in both local and deployment environment state.

Google, Magic Auth, passkeys, SSO, MFA, and other methods are optional project-level AuthKit configuration, not Keenko defaults. Configure them through first-party WorkOS surfaces only when the product requires them; the generator does not enable Google or own production provider credentials.

## Hosted UI customization and project overrides

Customize Hosted UI branding and copy in WorkOS when the project needs it. A deliberate move to project-owned AuthKit UI is recorded in `docs/project/overrides.md` and implemented with current official AuthKit APIs. It is not a generator option.

## Automation and maintenance

Keenko automates file scaffolding, exact package compatibility, Convex development provisioning configuration, offline verification, and the headed smoke harness. A human can reproduce each action with the generated commands and provider steps above. The smoke's SDK calls are equivalent to creating a verified disposable email/password user in the provisioned WorkOS environment before sign-in and deleting that user after the assertions.

Re-verify WorkOS, TanStack Start, Convex, and component source/types before changing pins or integration shapes. Update this guide whenever callback paths, environment names, provisioning behavior, component webhook requirements, token bridging, or the smoke procedure changes.
