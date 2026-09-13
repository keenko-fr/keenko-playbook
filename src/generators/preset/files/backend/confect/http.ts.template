import { ConvexConfigProvider } from "@confect/server";
import { httpRouter } from "convex/server";
import { Config as CFG, Effect as E, Option as O } from "effect";

import { makeAuthKit } from "./workos";

const configProvider = ConvexConfigProvider.make();
const webhookSecretOpt = E.runSync(CFG.option(CFG.String("WORKOS_WEBHOOK_SECRET")).parse(configProvider));

const http = httpRouter();

if (O.isSome(webhookSecretOpt)) {
  const { apiKey, clientId } = E.runSync(
    CFG.all({ apiKey: CFG.String("WORKOS_API_KEY"), clientId: CFG.String("WORKOS_CLIENT_ID") }).parse(configProvider)
  );
  makeAuthKit({ apiKey, clientId, webhookSecret: webhookSecretOpt.value }).registerRoutes(http);
}

export default http;
