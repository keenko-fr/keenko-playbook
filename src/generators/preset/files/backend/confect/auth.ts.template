import type { AuthConfig } from "convex/server";
import { Option as O } from "effect";

declare const process: { readonly env: { readonly WORKOS_CLIENT_ID?: string } };

const clientId = process.env.WORKOS_CLIENT_ID;

export default {
  providers: [
    O.fromUndefinedOr(clientId).pipe(
      O.match({
        onNone: () => ({
          algorithm: "RS256",
          issuer: "https://api.workos.com/",
          jwks: `https://api.workos.com/sso/jwks/${clientId}`,
          type: "customJwt",
        }),
        onSome: (applicationID) => ({
          algorithm: "RS256",
          applicationID,
          issuer: "https://api.workos.com/",
          jwks: `https://api.workos.com/sso/jwks/${clientId}`,
          type: "customJwt",
        }),
      })
    ),
    {
      algorithm: "RS256",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      type: "customJwt",
    },
  ],
} satisfies AuthConfig;
