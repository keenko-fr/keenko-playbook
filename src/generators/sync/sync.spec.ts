import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Effect as E, FileSystem, Layer as L, Option as O, Path, Schema as S } from "effect";
import { parse } from "smol-toml";
import { describe, expect } from "vitest";

import { presetProgram } from "../preset/preset.js";
import { syncProgram } from "./sync.js";

// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
const platformLayer = L.mergeAll(NodeFileSystem.layer, NodePath.layer);

const aiStart = "<!-- keenko:start -->";
const aiEnd = "<!-- keenko:end -->";

// HELPERS ---------------------------------------------------------------------------------------------------------------------------------
const runSync = (tree: ReturnType<typeof createTreeWithEmptyWorkspace>) => syncProgram(tree).pipe(E.provide(platformLayer));

const readSource = (source: URL) =>
  E.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    return yield* fs.readFileString(yield* path.fromFileUrl(source));
  }).pipe(E.provide(platformLayer));

const expectedRoutingFile = (managed: string) => `${aiStart}\n\n${managed.trimEnd()}\n\n${aiEnd}\n`;

const readSkillNames = () =>
  E.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const root = yield* path.fromFileUrl(new URL("files/skills/", import.meta.url));

    return (yield* fs.readDirectory(root)).toSorted();
  }).pipe(E.provide(platformLayer));

// TESTS -----------------------------------------------------------------------------------------------------------------------------------

describe("keenko sync", () => {
  it.live("provisions credential-free hosted Context7 for both fresh generated harnesses", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();
      yield* presetProgram(tree, { name: "test" });
      expect(tree.read(".codex/config.toml", "utf-8")).toBe('[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\n');
      expect(yield* S.decodeEffect(S.fromJsonString(S.Unknown))(O.getOrThrow(O.fromNullishOr(tree.read(".mcp.json", "utf-8"))))).toEqual({
        mcpServers: { context7: { type: "http", url: "https://mcp.context7.com/mcp" } },
      });
      expect(tree.exists(".claude/settings.json")).toBe(false);
      const guidance = tree.read(".keenko/docs/core/agent-behavior.md", "utf-8");
      expect(guidance).toContain(
        "Use Context7 automatically when current third-party library/API documentation materially affects correctness"
      );
      expect(guidance).toContain("5. model memory.");
      expect(guidance).toContain("If Context7 is unavailable");
      expect(guidance).not.toContain("When the active harness provides Context7");
    }).pipe(E.provide(platformLayer))
  );

  for (const source of [
    '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\n',
    '# User comment\n[mcp_servers."context7"]\nurl = \'https://mcp.context7.com/mcp\'\nauth = "oauth"\ndisabled_tools = []\nenabled = true\nrequired = false\nhttp_headers = {}\nenv_http_headers = {}\nstartup_timeout_sec = 10\ntool_timeout_sec = 60\n',
    'mcp_servers.context7.url = "https://mcp.context7.com/mcp"\n',
    'mcp_servers = { context7 = { url = "https://mcp.context7.com/mcp" }, other = { command = "local" } }\n',
  ])
    it.live(`preserves equivalent Codex TOML byte-for-byte: ${source.split("\n")[0]}`, () =>
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();
        tree.write(".codex/config.toml", source);
        yield* runSync(tree);
        expect(tree.read(".codex/config.toml", "utf-8")).toBe(source);
      })
    );

  it.live("preserves equivalent Claude JSON byte-for-byte including unrelated configuration", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();
      const source =
        '{ "other": true, "mcpServers": { "custom": { "command": "local" }, "context7": { "url": "https://mcp.context7.com/mcp", "headers": {}, "type": "streamable-http" } } }\n';
      tree.write(".mcp.json", source);
      yield* runSync(tree);
      expect(tree.read(".mcp.json", "utf-8")).toBe(source);
    })
  );

  for (const source of [
    '# Keep this comment\nmodel = "custom"\n[mcp_servers.other]\ncommand = "local"\n',
    'model = "custom"\nmcp_servers = { other = { command = "local" } }\n',
    'model = "custom"\nmcp_servers.other.command = "local"\n',
  ])
    it.live(`adds missing entries while preserving unrelated configuration: ${source.split("\n")[0]}`, () =>
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();
        tree.write(".codex/config.toml", source);
        tree.write(".mcp.json", '{ "metadata": "keep", "mcpServers": { "custom": { "command": "local" } } }');
        const settings = '{ "permissions": { "deny": ["mcp__context7__query-docs"] } }';
        tree.write(".claude/settings.json", settings);
        yield* runSync(tree);
        const codex = O.getOrThrow(O.fromNullishOr(tree.read(".codex/config.toml", "utf-8")));
        expect(parse(codex)).toEqual({
          ...parse(source),
          mcp_servers: { context7: { url: "https://mcp.context7.com/mcp" }, other: { command: "local" } },
        });
        if (source.startsWith("#")) expect(codex).toContain(source);
        expect(yield* S.decodeEffect(S.fromJsonString(S.Unknown))(O.getOrThrow(O.fromNullishOr(tree.read(".mcp.json", "utf-8"))))).toEqual({
          mcpServers: { context7: { type: "http", url: "https://mcp.context7.com/mcp" }, custom: { command: "local" } },
          metadata: "keep",
        });
        expect(tree.read(".claude/settings.json", "utf-8")).toBe(settings);
      })
    );

  for (const [path, source] of [
    [".codex/config.toml", '[mcp_servers.context7]\nurl = "https://custom.example/mcp"\n'],
    [".codex/config.toml", '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\nenabled = false\n'],
    [
      ".codex/config.toml",
      '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\nenv_http_headers = { Authorization = "TOKEN" }\n',
    ],
    [".codex/config.toml", '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\ndisabled_tools = ["query-docs"]\n'],
    [".codex/config.toml", '[mcp_servers.context7]\ncommand = "custom"\n'],
    [".codex/config.toml", 'mcp_servers = "invalid"\n'],
    [".codex/config.toml", "malformed = ["],
    [".mcp.json", '{"mcpServers":{"context7":{"type":"http","url":"https://custom.example/mcp"}}}'],
    [".mcp.json", '{"mcpServers":{"context7":{"type":"http","url":"https://mcp.context7.com/mcp","headers":{"Authorization":"private"}}}}'],
    [".mcp.json", '{"mcpServers":{"context7":{"type":"stdio","command":"custom"}}}'],
    [".mcp.json", '{"mcpServers":{"context7":null}}'],
    [".mcp.json", '{"mcpServers":null}'],
    [".mcp.json", "{"],
  ] as const)
    it.live(`rejects conflicting or malformed MCP configuration without any sync writes: ${path} ${source}`, () =>
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();
        tree.write(path, source);
        const before = tree.listChanges();
        const failure = yield* runSync(tree).pipe(E.flip);
        expect(failure).toMatchObject({ _tag: "GuidanceFailure", issue: "context7_conflict", path });
        expect(failure.message).toContain("reconcile it manually");
        expect(tree.listChanges()).toEqual(before);
      })
    );

  it.live("preserves edits to the README seeded during creation", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();
      yield* presetProgram(tree, { name: "test" });
      expect(tree.exists("README.md")).toBe(true);
      const edited = "# Our project\n\nProject-owned setup instructions.\n";
      tree.write("README.md", edited);

      yield* syncProgram(tree);

      expect(tree.read("README.md", "utf-8")).toBe(edited);
    }).pipe(E.provide(platformLayer))
  );

  it.live("does not recreate a README deleted after creation", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();
      yield* presetProgram(tree, { name: "test" });
      expect(tree.exists("README.md")).toBe(true);
      tree.delete("README.md");

      yield* syncProgram(tree);

      expect(tree.exists("README.md")).toBe(false);
    }).pipe(E.provide(platformLayer))
  );

  it.live("leaves a missing project-owned README absent", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();
      tree.delete("README.md");

      yield* runSync(tree);

      expect(tree.exists("README.md")).toBe(false);
    })
  );

  it.live("synchronizes the canonical Keenko documentation", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      yield* runSync(tree);

      expect(tree.read(".keenko/docs/core/tooling.md", "utf-8")).toBe(
        yield* readSource(new URL("files/docs/core/tooling.md", import.meta.url))
      );

      expect(tree.read(".keenko/docs/core/migrations.md", "utf-8")).toBe(
        yield* readSource(new URL("files/docs/core/migrations.md", import.meta.url))
      );
      expect(tree.read(".keenko/docs/core/dependencies.md", "utf-8")).toContain("[Keenko migration contract](migrations.md)");

      expect(tree.read(".keenko/docs/conventions/frontend.md", "utf-8")).toBe(
        yield* readSource(new URL("files/docs/conventions/frontend.md", import.meta.url))
      );

      expect(tree.read(".keenko/docs/conventions/testing.md", "utf-8")).toBe(
        yield* readSource(new URL("files/docs/conventions/testing.md", import.meta.url))
      );

      expect(tree.read(".keenko/docs/conventions/application-authority.md", "utf-8")).toBe(
        yield* readSource(new URL("files/docs/conventions/application-authority.md", import.meta.url))
      );

      expect(tree.read(".keenko/docs/stacks/effect/README.md", "utf-8")).toBe(
        yield* readSource(new URL("files/docs/stacks/effect/README.md", import.meta.url))
      );

      expect(tree.read(".keenko/docs/stacks/workos-authkit/README.md", "utf-8")).toBe(
        yield* readSource(new URL("files/docs/stacks/workos-authkit/README.md", import.meta.url))
      );

      for (const stack of ["confect", "convex", "tanstack-query"])
        expect(tree.read(`.keenko/docs/stacks/${stack}/README.md`, "utf-8")).toBe(
          yield* readSource(new URL(`files/docs/stacks/${stack}/README.md`, import.meta.url))
        );
    })
  );

  it.live("refreshes identity guidance without migrating project-owned identity state", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();
      const workosPath = ".keenko/docs/stacks/workos-authkit/README.md";
      tree.write(
        workosPath,
        "Use `identity.tokenIdentifier` as the stable authenticated identity key when application data needs an ownership reference."
      );
      const projectFiles = {
        "docs/project/overrides.md": "Use our provider-native identity reference.",
        "packages/backend/confect/identity.impl.ts": "export const projectIdentity = 'provider-native';\n",
        "packages/backend/confect/schema.ts": "export const projectSchema = {};\n",
        "packages/backend/data/authorization.ts": "export const projectPolicy = 'application-owned';\n",
      };
      for (const [path, content] of Object.entries(projectFiles)) tree.write(path, content);

      yield* runSync(tree);

      const convex = tree.read(".keenko/docs/stacks/convex/README.md", "utf-8");
      for (const semantics of [
        "Keep `identity.tokenIdentifier` as the default stable authenticated identity reference",
        "when the application does not deliberately need a provider-native identifier",
        "JWT `sub` and `iss` claims",
        "`identity.subject` is the JWT `sub`",
        "intentionally to the native identity of a known provider",
        "`subject` alone is not a provider-independent identity key",
        "`identity.issuer` is the JWT `iss`",
        "identifying the provider that issued the token",
        "Name provider-native references according to their semantic meaning",
        "does not prescribe a field name, identity abstraction, or universal application User/Profile model",
        "../workos-authkit/README.md#provider-native-user-references",
      ])
        expect(convex).toContain(semantics);

      const workos = tree.read(workosPath, "utf-8");
      for (const semantics of [
        "../convex/README.md#authenticated-identity-references",
        "Keep `tokenIdentifier` as the default when the application does not need a provider-native identifier",
        "For normal WorkOS AuthKit user access tokens",
        "Convex `identity.subject` corresponds to the WorkOS User ID",
        "do not assume it applies to every WorkOS token type",
        "correlate directly with WorkOS APIs, synchronized users, or user lifecycle events",
        "`subject` alone is not a provider-independent identity key",
        "Keep authorization, resource ownership, permissions, and business policy in Convex/application code",
        "do not treat WorkOS roles, permissions, organizations, or entitlements as Keenko's general policy model",
        "The application owns its domain representation and field names",
        "does not require every project to persist a WorkOS User ID or introduce an application User/Profile model",
        "propagates through `bun x nx sync`",
        "does not require changes to application schemas, persisted identity references, source code, or authorization state",
        "does not change the AuthKit, synchronization, or webhook architecture",
      ])
        expect(workos).toContain(semantics);
      expect(workos).not.toContain(
        "Use `identity.tokenIdentifier` as the stable authenticated identity key when application data needs an ownership reference."
      );
      for (const [path, content] of Object.entries(projectFiles)) expect(tree.read(path, "utf-8")).toBe(content);
    })
  );

  it.live("publishes corrected Confect compatibility and backend data guidance", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      yield* runSync(tree);

      const confect = tree.read(".keenko/docs/stacks/confect/README.md", "utf-8");
      expect(confect).not.toContain("Known `@confect/test` compatibility defect");
      expect(confect).not.toContain("Ref.Error");
      expect(confect).toContain("canonical codegen");
      expect(confect).toContain("exact-version aligned");
      expect(confect).toContain("Effect peer ranges");
      expect(confect).toContain("The owned `confect` skill");

      const backend = tree.read(".keenko/docs/conventions/backend-architecture.md", "utf-8");
      expect(backend).toContain("`data/confect.ts`");
      expect(backend).toContain("map it to `Option.none` for `find` / `findByX`");
      expect(backend).toContain("Preserve not-found as a typed failure for `get` / `getByX`");
    })
  );

  it.live("refreshes Confect cardinality guidance without changing consumer reads or data-file grammar", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();
      const guidePath = ".keenko/docs/stacks/confect/README.md";
      tree.write(guidePath, "# Stale Confect guidance\n");
      const dataPath = "packages/backend/data/accounts.ts";
      const data = 'export const projectOwnedRead = "indexed-get";\n';
      tree.write(dataPath, data);

      yield* runSync(tree);

      const guide = tree.read(guidePath, "utf-8");
      expect(guide).toBe(yield* readSource(new URL("files/docs/stacks/confect/README.md", import.meta.url)));
      for (const semantics of [
        "Single resource; duplicate matching rows are an invariant/data defect",
        "Explicit `0..1`; the caller needs a typed cardinality-violation outcome",
        "already calls Convex's `unique()` internally",
        "2+ rows → NotUniqueError",
        ".pipe(Stream.runHead, E.map(O.isSome))",
        "Keep `collect` when the operation genuinely needs every matching row",
        "Plain `Stream.filter`, `Stream.map`",
        "once no later step requires QueryStream-specific operations or retained QueryStream metadata/semantics",
        "when a later QueryStream-only operation, such as `QueryStream.unique`, must remain available",
        'QueryStream.filter((account) => account.externalId.startsWith("customer:"))',
        "`QueryStream.filterEffect` also retains the QueryStream for a later `unique`",
        "Do not introduce QueryStream merely for stylistic consistency",
        "QueryStream is experimental in Confect `10.0.0`",
        "belong under the existing `FIND` section",
      ])
        expect(guide).toContain(semantics);
      expect(tree.read(".keenko/docs/conventions/backend-file-topology.md", "utf-8")).toBe(
        yield* readSource(new URL("files/docs/conventions/backend-file-topology.md", import.meta.url))
      );
      expect(tree.read(dataPath, "utf-8")).toBe(data);

      yield* runSync(tree);

      expect(tree.read(guidePath, "utf-8")).toBe(guide);
      expect(tree.read(dataPath, "utf-8")).toBe(data);
    })
  );

  it.live("removes stale files from the Keenko-owned documentation snapshot", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      tree.write(".keenko/docs/stale.md", "stale");
      tree.write(".keenko/project-owned.txt", "keep");

      yield* runSync(tree);

      expect(tree.exists(".keenko/docs/stale.md")).toBe(false);
      expect(tree.read(".keenko/project-owned.txt", "utf-8")).toBe("keep");
    })
  );

  it.live("synchronizes the selected skill set into the canonical Keenko directory", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();
      const names = yield* readSkillNames();

      yield* runSync(tree);

      for (const name of names) {
        const expected = yield* readSource(new URL(`files/skills/${name}/SKILL.md`, import.meta.url));

        expect(tree.read(`.keenko/skills/${name}/SKILL.md`, "utf-8")).toBe(expected);
      }
    })
  );

  it.live("removes stale skills from the canonical Keenko snapshot", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      tree.write(".keenko/skills/retired-skill/SKILL.md", "old");
      tree.write(".agents/skills/retired-skill/SKILL.md", "old");
      tree.write(".claude/skills/retired-skill/SKILL.md", "old");

      yield* runSync(tree);

      expect(tree.exists(".agents/skills/retired-skill/SKILL.md")).toBe(false);
      expect(tree.exists(".claude/skills/retired-skill/SKILL.md")).toBe(false);
    })
  );

  it.live("synchronizes Keenko skills into both harness skill roots", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      const names = yield* readSkillNames();

      yield* runSync(tree);

      for (const name of names) {
        expect(tree.exists(`.agents/skills/${name}/SKILL.md`)).toBe(true);
        expect(tree.exists(`.claude/skills/${name}/SKILL.md`)).toBe(true);
      }
    })
  );

  it.live("mirrors third-party licenses without inventing metadata for Keenko-authored skills", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();
      const license = yield* readSource(new URL("files/skills/grilling/LICENSE", import.meta.url));

      yield* runSync(tree);

      expect(tree.read(".keenko/skills/grilling/LICENSE", "utf-8")).toBe(license);
      expect(tree.read(".agents/skills/grilling/LICENSE", "utf-8")).toBe(license);
      expect(tree.read(".claude/skills/grilling/LICENSE", "utf-8")).toBe(license);
      for (const root of [".keenko/skills", ".agents/skills", ".claude/skills"]) expect(tree.exists(`${root}/confect/LICENSE`)).toBe(false);
    })
  );

  it.live("preserves project-owned sibling skills", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      tree.write(".agents/skills/project-debug/SKILL.md", "# Project debug");
      tree.write(".claude/skills/project-debug/SKILL.md", "# Project debug");

      yield* runSync(tree);

      expect(tree.read(".agents/skills/project-debug/SKILL.md", "utf-8")).toBe("# Project debug");
      expect(tree.read(".claude/skills/project-debug/SKILL.md", "utf-8")).toBe("# Project debug");
    })
  );

  it.live("creates managed routing blocks in fresh root guidance files", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      const agents = yield* readSource(new URL("fragments/AGENTS.md", import.meta.url));
      const claude = yield* readSource(new URL("fragments/CLAUDE.md", import.meta.url));

      yield* runSync(tree);

      expect(tree.read("AGENTS.md", "utf-8")).toBe(expectedRoutingFile(agents));
      expect(tree.read("CLAUDE.md", "utf-8")).toBe(expectedRoutingFile(claude));
      for (const path of ["AGENTS.md", "CLAUDE.md"]) {
        const routing = tree.read(path, "utf-8");
        expect(routing).toContain("bun node_modules/@tanstack/intent/dist/cli.mjs list");
        expect(routing).toContain("Use Context7 automatically");
        expect(routing).toContain("Context7 retrieval; model memory.");
        expect(routing).toContain("If Context7 is unavailable");
      }
    })
  );

  it.live("updates only the managed routing block", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      tree.write(
        "AGENTS.md",
        [
          "# Project instructions",
          "",
          "Keep this before the Keenko block.",
          "",
          aiStart,
          "stale managed guidance",
          aiEnd,
          "",
          "Keep this after the Keenko block.",
          "",
        ].join("\n")
      );

      const managed = yield* readSource(new URL("fragments/AGENTS.md", import.meta.url));

      yield* runSync(tree);

      expect(tree.read("AGENTS.md", "utf-8")).toBe(
        [
          "# Project instructions",
          "",
          "Keep this before the Keenko block.",
          "",
          aiStart,
          "",
          managed.trimEnd(),
          "",
          aiEnd,
          "",
          "Keep this after the Keenko block.",
          "",
        ].join("\n")
      );
    })
  );

  it.live("rejects malformed routing markers before synchronizing managed state", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      tree.write("AGENTS.md", [aiStart, "first", aiStart, "second", aiEnd, ""].join("\n"));

      const failure = yield* runSync(tree).pipe(E.flip);

      expect(failure).toMatchObject({
        _tag: "GuidanceFailure",
        issue: "invalid_routing_markers",
        path: "AGENTS.md",
      });

      expect(tree.exists(".keenko/docs/core/tooling.md")).toBe(false);
      expect(tree.exists(".keenko/skills/confect/SKILL.md")).toBe(false);
    })
  );

  it.live("is idempotent", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      yield* runSync(tree);

      const before = tree.listChanges();

      yield* runSync(tree);

      expect(tree.listChanges()).toEqual(before);
    })
  );

  it.live("returns the Nx out-of-sync diagnostic", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      const result = yield* runSync(tree);

      expect(result).toEqual({
        outOfSyncMessage: "Keenko guidance is out of sync. Run `bun x nx sync`.",
      });
    })
  );

  it.live("preserves project-owned guidance", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      tree.write("CONTEXT.md", "# My project context");
      tree.write("docs/project/architecture.md", "# My architecture");
      tree.write("docs/project/overrides.md", "# My overrides");
      tree.write("docs/project/ui.md", "# My UI");

      yield* runSync(tree);

      expect(tree.read("CONTEXT.md", "utf-8")).toBe("# My project context");

      expect(tree.read("docs/project/architecture.md", "utf-8")).toBe("# My architecture");

      expect(tree.read("docs/project/overrides.md", "utf-8")).toBe("# My overrides");

      expect(tree.read("docs/project/ui.md", "utf-8")).toBe("# My UI");
    })
  );
});
