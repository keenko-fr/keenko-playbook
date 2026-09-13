import { ConvexConfigProvider } from "@confect/server";
import { AuthKit } from "@convex-dev/workos-authkit";
import { internalMutationGeneric, type GenericDataModel } from "convex/server";
import { ConvexError, v } from "convex/values";
import { Config as CFG, Effect as E, Option as O } from "effect";

import { components } from "./_generated/components";

// AUTHKIT ---------------------------------------------------------------------------------------------------------------------------------
// The synchronized WorkOS user is authentication infrastructure identity. It is not the application's canonical domain user.
export const makeAuthKit = (config: WorkOSConfig) => new AuthKit<GenericDataModel>(components.workOSAuthKit, config);

// RECONCILIATION --------------------------------------------------------------------------------------------------------------------------
const configProvider = ConvexConfigProvider.make();
const webhookSecretOpt = E.runSync(CFG.option(CFG.String("WORKOS_WEBHOOK_SECRET")).parse(configProvider));

const unavailableBackfillUsers = internalMutationGeneric({
  args: {},
  handler: () => {
    /* oxlint-disable effect/noNewError, effect/noThrowStatement -- This is a native Convex compatibility boundary. Confect requires a registered function during offline analysis, while the official component mutation cannot be obtained before webhook configuration. */
    throw new ConvexError("Configure WORKOS_WEBHOOK_SECRET before running the WorkOS user backfill.");
    /* oxlint-enable effect/noNewError, effect/noThrowStatement */
  },
  returns: v.null(),
});

export const backfillUsers = O.match(webhookSecretOpt, {
  onNone: () => unavailableBackfillUsers,
  onSome: (webhookSecret) => {
    const { apiKey, clientId } = E.runSync(
      CFG.all({ apiKey: CFG.String("WORKOS_API_KEY"), clientId: CFG.String("WORKOS_CLIENT_ID") }).parse(configProvider)
    );
    return makeAuthKit({ apiKey, clientId, webhookSecret }).utils().backfillUsers;
  },
});

// TYPES -----------------------------------------------------------------------------------------------------------------------------------
export interface WorkOSConfig {
  readonly apiKey: string;
  readonly clientId: string;
  readonly webhookSecret: string;
}
