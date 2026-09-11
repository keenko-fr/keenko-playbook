import type { AuthConfig } from "convex/server";

declare const process: { readonly env: { readonly WORKOS_CLIENT_ID?: string } };

const clientId = process.env.WORKOS_CLIENT_ID;

export default {
  providers: [
    {
      algorithm: "RS256",
      applicationID: clientId,
      issuer: "https://api.workos.com/",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      type: "customJwt",
    },
    {
      algorithm: "RS256",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      type: "customJwt",
    },
  ],
} satisfies AuthConfig;
