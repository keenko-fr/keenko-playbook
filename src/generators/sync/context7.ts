import type { Tree } from "@nx/devkit";
import { Effect as E, Option as O, Schema as S } from "effect";
import { parse, stringify } from "smol-toml";

import { GuidanceFailure } from "../errors.js";

const endpoint = "https://mcp.context7.com/mcp";
const codexPath = ".codex/config.toml";
const claudePath = ".mcp.json";
const sObject = S.Record(S.String, S.Unknown);
const sEmptyObject = S.Record(S.String, S.Never);
const sCodexEntry = S.Struct({
  auth: S.optional(S.Literal("oauth")),
  disabled_tools: S.optional(S.Array(S.Never)),
  enabled: S.optional(S.Literal(true)),
  env_http_headers: S.optional(sEmptyObject),
  http_headers: S.optional(sEmptyObject),
  required: S.optional(S.Literal(false)),
  startup_timeout_sec: S.optional(S.Literal(10)),
  tool_timeout_sec: S.optional(S.Literal(60)),
  url: S.Literal(endpoint),
});
const sClaudeEntry = S.Struct({
  headers: S.optional(sEmptyObject),
  type: S.Literals(["http", "streamable-http"]),
  url: S.Literal(endpoint),
});

const conflict = (path: string) =>
  new GuidanceFailure({
    issue: "context7_conflict",
    message: `Context7 configuration in ${path} is customized or invalid. Preserve the customization and reconcile it manually before rerunning bun x nx sync. Keenko owns only the context7 MCP entry.`,
    path,
  });

// Prepare both harness edits before the shared sync owner writes any managed state.
export const prepareContext7 = E.fn("keenko.sync.context7")(function* (tree: Tree) {
  const codexSource = O.getOrElse(O.fromNullishOr(tree.read(codexPath, "utf-8")), () => "");
  const claudeSource = O.getOrElse(O.fromNullishOr(tree.read(claudePath, "utf-8")), () => "{}");
  const codex = yield* E.try({ catch: () => conflict(codexPath), try: () => parse(codexSource) });
  const claude = yield* S.decodeEffect(S.fromJsonString(sObject))(claudeSource).pipe(E.mapError(() => conflict(claudePath)));
  const codexServers = yield* S.decodeUnknownEffect(sObject)(Object.hasOwn(codex, "mcp_servers") ? codex.mcp_servers : {}).pipe(
    E.mapError(() => conflict(codexPath))
  );
  const claudeServers = yield* S.decodeUnknownEffect(sObject)(Object.hasOwn(claude, "mcpServers") ? claude.mcpServers : {}).pipe(
    E.mapError(() => conflict(claudePath))
  );

  if (Object.hasOwn(codexServers, "context7"))
    yield* S.decodeUnknownEffect(sCodexEntry, { onExcessProperty: "error" })(codexServers.context7).pipe(
      E.mapError(() => conflict(codexPath))
    );
  if (Object.hasOwn(claudeServers, "context7"))
    yield* S.decodeUnknownEffect(sClaudeEntry, { onExcessProperty: "error" })(claudeServers.context7).pipe(
      E.mapError(() => conflict(claudePath))
    );

  let codexContent = codexSource;
  if (!Object.hasOwn(codexServers, "context7")) {
    const appended = `${codexSource}${codexSource.length === 0 || codexSource.endsWith("\n") ? "" : "\n"}${codexSource.length === 0 ? "" : "\n"}[mcp_servers.context7]\nurl = "${endpoint}"\n`;
    // Append without rewriting user text where TOML permits extending the table.
    // Inline tables are sealed; serialize that valid custom layout with all values preserved.
    codexContent = yield* E.try({ catch: () => conflict(codexPath), try: () => parse(appended) }).pipe(
      E.as(appended),
      E.catch(() =>
        E.try({
          catch: () => conflict(codexPath),
          try: () => stringify({ ...codex, mcp_servers: { ...codexServers, context7: { url: endpoint } } }),
        })
      )
    );
  }

  const claudeContent = Object.hasOwn(claudeServers, "context7")
    ? claudeSource
    : `${yield* S.encodeEffect(S.fromJsonString(sObject, { space: 2 }))({ ...claude, mcpServers: { ...claudeServers, context7: { type: "http", url: endpoint } } }).pipe(E.mapError(() => conflict(claudePath)))}\n`;
  return [
    { content: codexContent, target: codexPath },
    { content: claudeContent, target: claudePath },
  ];
});
