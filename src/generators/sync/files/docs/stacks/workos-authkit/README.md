# WorkOS AuthKit

## Outcome

Every Keenko project starts with a production-shaped WorkOS AuthKit foundation that uses Hosted UI, Convex-managed development provisioning, Convex JWT authentication, and the official `@convex-dev/workos-authkit` component. Routes remain public by default. Authentication infrastructure does not create an application domain user model or own authorization policy.

## Ownership

- Root `convex.json` owns Convex-managed WorkOS environment provisioning and development redirect/CORS configuration.
- `apps/web/src/start.ts` installs the official AuthKit middleware and preserves TanStack Start CSRF protection.
- `apps/web/src/routes/api/auth/**` owns the Hosted UI sign-in and callback HTTP routes.
- `apps/web/src/routes/mon-espace.tsx` and `apps/web/src/server/auth.ts` demonstrate opt-in protected route and server-function boundaries with the official `getAuth` API.
- `apps/web/src/router.tsx` bridges AuthKit access tokens to Convex through `ConvexProviderWithAuth`.
- `packages/backend/confect/auth.ts` configures the documented WorkOS JWT providers through Confect's official Convex auth-config extension point. It deliberately does not import the component client's `getAuthConfigProviders()` helper: the current component package causes Convex auth-config analysis to require the optional `WORKOS_ACTION_SECRET` even when WorkOS Actions are not configured.
- `packages/backend/confect/workos-client.ts` owns deferred construction of the official component client and exposes its `utils().backfillUsers` internal mutation only after the real deployment webhook secret exists. `packages/backend/confect/workos.spec.ts` and `workos.impl.ts` register that plain first-party Convex mutation through Confect without replacing its behavior. `packages/backend/confect/identity.spec.ts` and `identity.impl.ts` own the ordinary Confect/Effect `identity.findCurrent`, `identity.getCurrent`, and `identity.findSynchronized` queries.
- `packages/backend/confect/http.ts` owns conditional registration of the component webhook endpoint through Confect's official HTTP extension point. The route is registered only after `WORKOS_WEBHOOK_SECRET` exists in the Convex deployment.
- Confect materializes those extension points into `packages/backend/convex/auth.config.ts`, `packages/backend/convex/identity.ts`, and `packages/backend/convex/http.ts`; do not edit the generated files.
- WorkOS owns authentication and synchronized identity metadata. Convex/application code owns authorization, resource ownership, permissions, and business policy.

The component's synchronized WorkOS user is authentication/infrastructure identity. It is not the canonical application `User`, `Profile`, `Member`, `Customer`, or other domain concept. Add a domain model only when the product needs one, with an explicit reference to infrastructure identity.

## Prerequisites

- Node and Bun versions declared by the generated root manifest.
- A Convex account and permission to create or select a development deployment.
- For automatic provisioning, permission to associate a Convex team with a Convex-managed WorkOS team.
- For synchronized users, access to the provisioned WorkOS environment and permission to configure its webhook.
- For the provisioned smoke flow, a human tester with a Google account permitted by the provisioned non-production WorkOS environment.

Production WorkOS environments, credentials, redirect URLs, hosting secrets, and deployment policy are project-owned. Never paste secrets into source, issue descriptions, logs, or tracked `.env` files.

## Development provisioning

1. From the generated workspace root, run `bun run dev`.
2. Follow the Convex prompts to create or select the development deployment and associate the Convex team with a Convex-managed WorkOS team.
3. Convex provisions the non-production WorkOS environment, stores `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, and environment identity in the Convex deployment, configures the development URLs from root `convex.json`, and writes the required local AuthKit values plus a generated cookie password to untracked `.env.local`.
4. Convex completes the first backend push without `WORKOS_WEBHOOK_SECRET`, then starts the generated application.
5. Open `http://localhost:3210` and use the sign-in link. Google OAuth through AuthKit Hosted UI is the canonical Keenko development and dogfood path. The provisioned development environment may use WorkOS-provided staging OAuth configuration; Keenko does not provision or store Google credentials.

Expected result: Hosted UI returns to `/api/auth/callback`, the client obtains a WorkOS access token, and Convex validates the identity. `useConvexAuth()` becomes authenticated before authenticated Convex UI is shown. `identity.findCurrent` is available immediately. Component synchronization is not expected yet: `identity.findSynchronized` returns `null`, and the component webhook route is not registered until the real deployment secret is configured.

If a project already owns a WorkOS team, follow the current official Convex manual-team path instead. That is a project-specific provisioning choice; it does not change the generated architecture.

## Synchronized WorkOS user

Convex-managed AuthKit provisioning does not currently create the webhook required by the official component. Basic authentication and the first backend push already work at this point. For v1, synchronization requires this explicit first-party provisioning step after normal AuthKit provisioning:

1. Find the development deployment HTTP Actions URL in the Convex dashboard.
2. In the corresponding WorkOS non-production environment, create a webhook for `user.created`, `user.updated`, and `user.deleted` at `https://<deployment>.convex.site/workos/webhook`.
3. Copy the webhook secret directly into the Convex deployment environment as `WORKOS_WEBHOOK_SECRET` using the dashboard or `bun x convex env set WORKOS_WEBHOOK_SECRET <secret>`.
4. Restart or let `bun run dev` push the updated environment.
5. If users existed in WorkOS before the webhook became active, run `bun x convex run workos:backfillUsers` once from the workspace root. The official component processes users oldest-first and idempotently skips identities that are already synchronized, so rerun the same command if it is interrupted.

The real webhook secret belongs only in the provisioned Convex deployment. Do not copy it into root `.env.local`. Local Confect codegen and watch processes do not receive or verify incoming WorkOS webhooks; their generated package scripts provide fresh process-scoped UUID sentinels only for static analysis and materialization. In the deployed backend, Keenko defers construction of the official component client: without the real secret, webhook routes are not registered and synchronized identity reports absence. After the secret is set and the backend is pushed again, the official client registers the route and the remote Convex HTTP action verifies real webhook signatures with that deployment secret.

Users created after webhook activation synchronize through normal `user.created`, `user.updated`, and `user.deleted` WorkOS lifecycle webhooks. Users that already existed before webhook activation are reconciled by the official `backfillUsers` utility. Repeat sign-in is not a synchronization mechanism: do not delete and recreate users or depend on an incidental `user.updated` event to fill the component table.

Expected result: after normal webhook delivery or a completed backfill, `identity.findSynchronized` returns the narrow synchronized WorkOS identity for an authenticated caller and `null` for an anonymous or not-yet-synchronized caller. Do not mirror it into an application table unless a product-owned domain concept requires that data.

Webhook configuration and any required backfill are explicit first-party provisioning/reconciliation operations. They are not part of `bun run check`, ordinary development startup, or unattended CI. Do not add Keenko-owned synchronization, cloud provisioning, or a custom `keenko auth setup` lifecycle solely to automate them. If Convex-managed first-party provisioning later gains component-webhook support, remove the manual webhook step in favor of that support.

WorkOS Actions are not part of the Keenko baseline. `WORKOS_ACTION_SECRET` becomes project-owned configuration only if a project deliberately enables Actions. If the official component stops leaking that optional variable into Convex auth-config analysis, prefer its provider helper again when it preserves the same documented JWT configuration.

## Public and protected boundaries

- Public is the default. A route with no auth loader remains public.
- A protected TanStack route calls `getAuth()` in its loader. When no user exists, it redirects to the server-only `/api/auth/sign-in` endpoint with `reloadDocument: true` so the transition leaves SPA navigation and performs a full document request. Preserve the intended return pathname in the redirect search parameters.
- A protected TanStack server function calls `getAuth()` inside its handler and rejects an absent user.
- `identity.findCurrent` is public and nullable at the Convex/JavaScript boundary. Its Effect-owned workflow uses only Confect's `Auth` service, represents absence with `Option`, and returns the narrow `CurrentIdentity` representation.
- `identity.getCurrent` derives the same `CurrentIdentity` representation through Confect's `Auth` service and maps absent identity to the typed `AuthenticationRequired` failure. Never accept a caller-supplied user identifier for authorization.
- `identity.findSynchronized` is a separate public query for the official component's synchronized infrastructure identity. Before the real webhook secret exists in the deployment, it returns `null` without constructing the component client. After configuration, it obtains raw query context from Confect's generated `QueryCtx` service only because the official `getAuthUser(ctx)` method requires it, and represents the nullable component result as `Option<SynchronizedIdentity>` internally.
- Normal Confect queries may access the native Convex query context through Confect's `QueryCtx` Effect service when a first-party integration specifically requires that context. Prefer narrower Confect services such as `Auth`, database services, and runners whenever they already own the capability; do not reach for raw context routinely.
- Use `identity.tokenIdentifier` as the stable authenticated identity key when application data needs an ownership reference. Keep authorization decisions in Convex/application code; do not treat WorkOS roles, permissions, organizations, or entitlements as Keenko's general policy model.

## Deterministic verification

`bun run check` intentionally does not start Convex, contact WorkOS, read production secrets, or run provisioned auth E2E. The official component currently validates `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, and `WORKOS_WEBHOOK_SECRET` eagerly during construction, so the backend codegen and local Confect watch commands create invalid, non-secret UUID sentinels directly in their process environments while Confect analyzes and materializes static generated state. UUIDs lack the WorkOS credential prefixes and are deliberately unusable as real credentials. Those local paths do not invoke WorkOS operations or verify webhooks. No sentinel value is stored in package configuration, `.env` files, generated output, deployment state, or application runtime, and no sentinel is supplied to a Convex deployment. This is narrow upstream compatibility debt, not a pattern to copy into project code.

From a clean generated repository with no `.env.local`, run:

```sh
bun install --frozen-lockfile
bun run check
git status --short
```

Expected result: the check passes and Git remains clean. Failure recovery is ordinary repository recovery: inspect generated drift, correct authored inputs, rerun codegen/check, and review changes. Do not provision cloud resources merely to make the deterministic gate pass.

## Provisioned authentication smoke

The separate headed smoke begins from the public application and navigates to `/mon-espace` while anonymous, exercising the protected-route loader → full-document redirect → AuthKit Hosted UI path. It then pauses for a human to choose Google and complete provider authentication. Keenko does not store Google test credentials or attempt unattended Google login.

1. Complete development provisioning and component webhook setup above.
2. Keep `bun run dev` running.
3. In another terminal at the workspace root, install the Playwright browser once with `bun x playwright install chromium`.
4. Run `AUTH_E2E_BASE_URL=http://localhost:3210 bun run test:auth:e2e`.
5. When Playwright pauses on AuthKit Hosted UI, choose Google and complete authentication yourself. Resume the test in Playwright Inspector only after AuthKit has returned the browser to `/mon-espace`.
6. Observe Playwright automatically verify the return route, authenticated Convex identity, synchronized WorkOS infrastructure identity, and sign-out.

The smoke verifies the Hosted UI full-document transition, authenticated Convex state, synchronized WorkOS component user, and sign-out. Provider interaction is intentionally human-in-the-loop. It is not part of `bun run check` and must not be treated as an unattended CI check.

If the test stops before synchronized-user confirmation, verify the WorkOS webhook URL/events and the deployed Convex environment's `WORKOS_WEBHOOK_SECRET`. If Convex remains unauthenticated, verify the generated callback URL and the provisioned client ID in both local and deployment environment state.

Keenko does not programmatically disable email/password, Magic Auth, passkeys, SSO, MFA, or other WorkOS methods. Projects own their production authentication-method and Google-provider configuration through first-party WorkOS surfaces; Keenko owns no production provider credentials.

## Hosted UI customization and project overrides

Customize Hosted UI branding and copy in WorkOS when the project needs it. A deliberate move to project-owned AuthKit UI is recorded in `docs/project/overrides.md` and implemented with current official AuthKit APIs. It is not a generator option.

## Automation and maintenance

Keenko automates file scaffolding, exact package compatibility, Convex development provisioning configuration, offline verification, and the assertions around the headed smoke's provider interaction. A human can reproduce each action with the generated commands and provider steps above. The human owns Google authentication in Hosted UI; Playwright owns the transition and post-authentication assertions.

Re-verify WorkOS, TanStack Start, Convex, and component source/types before changing pins or integration shapes. Update this guide whenever callback paths, environment names, provisioning behavior, component webhook requirements, token bridging, or the smoke procedure changes.
