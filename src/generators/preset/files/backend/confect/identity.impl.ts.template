import { FunctionImpl, GroupImpl } from "@confect/server";
import type { UserIdentity } from "convex/server";
import { Config as CFG, Effect as E, Layer as L, Option as O } from "effect";

import databaseSchema from "./_generated/schema";
import { Auth, QueryCtx } from "./_generated/services";
import spec, { AuthenticationRequired, type CurrentIdentity, type SynchronizedIdentity } from "./identity.spec";
import { makeAuthKit } from "./workos";

// QUERIES ---------------------------------------------------------------------------------------------------------------------------------
const findCurrent = FunctionImpl.make(databaseSchema, spec, "findCurrent", () =>
  E.gen(function* () {
    const auth = yield* Auth;
    return yield* auth.getUserIdentity.pipe(E.map(toCurrentIdentity), E.option);
  })
);

const getCurrent = FunctionImpl.make(databaseSchema, spec, "getCurrent", () =>
  E.gen(function* () {
    const auth = yield* Auth;
    const currentIdentity = yield* auth.getUserIdentity.pipe(E.mapError(() => new AuthenticationRequired()));

    return toCurrentIdentity(currentIdentity);
  })
);

const findSynchronized = FunctionImpl.make(databaseSchema, spec, "findSynchronized", () =>
  E.gen(function* () {
    const webhookSecret = yield* CFG.option(CFG.String("WORKOS_WEBHOOK_SECRET")).pipe(E.orDie);
    if (O.isNone(webhookSecret)) return O.none();

    const clientId = yield* CFG.String("WORKOS_CLIENT_ID").pipe(E.orDie);
    const apiKey = yield* CFG.String("WORKOS_API_KEY").pipe(E.orDie);
    const ctx = yield* QueryCtx;

    const authKit = makeAuthKit({ apiKey, clientId, webhookSecret: webhookSecret.value });

    return yield* E.promise(() => authKit.getAuthUser(ctx)).pipe(
      E.map((workOSUser) =>
        O.map(O.fromNullishOr(workOSUser), (user): SynchronizedIdentity => ({
          email: O.fromNullishOr(user.email),
        }))
      )
    );
  })
);

// INTERNALS --------------------------------------------------------------------------------------------------------------------------------
const toCurrentIdentity = (userIdentity: UserIdentity): CurrentIdentity => ({
  email: O.fromNullishOr(userIdentity.email),
  subject: userIdentity.subject,
  tokenIdentifier: userIdentity.tokenIdentifier,
});

// GROUP -----------------------------------------------------------------------------------------------------------------------------------
export default GroupImpl.make(databaseSchema, spec).pipe(
  L.provide(findCurrent),
  L.provide(getCurrent),
  L.provide(findSynchronized),
  GroupImpl.finalize
);
