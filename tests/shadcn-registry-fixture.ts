/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNullish -- Bun HTTP is the executable platform boundary for this fixture server. */
import { serve } from "bun";

const fixtures = new Map([
  ["fixture-button", new URL("fixtures/shadcn-registry/button.json", import.meta.url)],
  ["input-otp", new URL("fixtures/shadcn-registry/input-otp.json", import.meta.url)],
  ["neutral", new URL("fixtures/shadcn-registry/neutral.json", import.meta.url)],
]);

serve({
  async fetch(request) {
    const name = new URL(request.url).pathname
      .split("/")
      .at(-1)
      ?.replace(/\.json$/u, "");
    const fixture = name === undefined ? undefined : fixtures.get(name);
    if (fixture === undefined) return new Response("Not found", { status: 404 });
    const fixtureContent = await Bun.file(fixture).text();
    const content = fixtureContent.replace("0.0.0-fixture", process.env.SHADCN_FIXTURE_VERSION ?? "");
    return new Response(content, { headers: { "content-type": "application/json" } });
  },
  hostname: "127.0.0.1",
  port: 4874,
});
