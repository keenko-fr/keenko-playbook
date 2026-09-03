#!/usr/bin/env bun
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HELPER = "cli/kee14-second-pass.ts";
const WORKFLOW = ".github/workflows/kee-14-second-pass.yml";

if (process.argv.includes("--finalize")) {
  await Promise.all([
    rm(path.join(ROOT, HELPER), { force: true }),
    rm(path.join(ROOT, WORKFLOW), { force: true }),
  ]);
  process.exit(0);
}

await updatePackage();
await updateDocumentationPolicy();
await updateAdrs();
await updateConvexProvenance();
await updateVendorSync();
await updateVersions();
await updateGenerator();
await updateGuidance();
await updateCli();
await updateMigrations();
await updateReleaseFlow();
await updateTests();

async function updatePackage() {
  await updateJson("package.json", (pkg) => {
    const scripts = record(pkg.scripts, "package.json.scripts");
    scripts["test:product"] = "bun test tests/packed-product.test.ts";
    scripts["check:release"] = "bun run check && bun run vendor:check && bun pm pack --dry-run && bun run test:product";
    pkg.scripts = scripts;
  });
}

async function updateDocumentationPolicy() {
  await write(
    "docs/core/documentation.md",
    `# Documentation

## Canonical sources

- \`README.md\` is the repository entrypoint: purpose, setup, high-level structure, canonical commands, and links to deeper docs.
- \`CONTEXT.md\` is concise stable project/domain context and vocabulary, not a project notebook.
- Current architecture belongs in project architecture docs.
- Project-specific visual and interaction decisions belong in \`docs/project/ui.md\` when the enabled stack has a meaningful UI surface. Exact executable values and implementations remain in code/config.
- Expensive-to-reverse or rationale-sensitive decisions belong in ADRs.
- Historical feature specifications remain useful records, but lasting policy/architecture must be extracted into current canonical docs.
- Actionable Keenko work belongs in Linear; GitHub Issues are public intake.
- Operational procedures belong in runbooks.

Do not maintain parallel "for humans" and "for agents" restatements of the same rules. Harness files should route to canonical docs/skills rather than duplicate them.

## \`CONTEXT.md\`

Keep only durable information such as:

- canonical domain terms;
- important current constraints;
- stable product facts;
- links to relevant architecture/ADRs.

Do not use it for transcripts, implementation logs, ticket status, large specifications, temporary research notes, or duplicated conventions.

## ADRs

Use an ADR for expensive-to-reverse architecture/governance choices or rationale likely to be lost. Ordinary implementation decisions do not need one.

Before the first stable supported Keenko baseline, an explicit Linear architecture decision may replace an abandoned pre-v1 model without preserving ADR archaeology for that model. Delete ADRs whose decisions are no longer supported. Keep ADRs that still describe a live expensive-to-reverse decision, and correct stale pre-v1 implementation details in place when the decision itself has not changed.

From the first stable supported baseline onward, preserve an ADR once it materially informs supported implementation. If that decision later changes, add a superseding ADR and link both. Only minor factual or typo corrections rewrite the original. Current architecture docs must always describe the supported state.

## Change discipline

Update affected canonical docs in the same PR as the behavior/architecture/convention they describe. Do not defer routine documentation repair to a later cleanup.

## Human-reproducible operations

A durable operational process cannot exist only as "ask the agent". For deployments, migrations, provider setup, recovery, security operations, and similar workflows, document the applicable:

- outcome;
- prerequisites and permissions;
- required inputs/configuration;
- manual procedure;
- expected results;
- verification;
- recovery/rollback;
- security boundaries;
- automation equivalent;
- maintenance/ownership.

Omit irrelevant sections rather than adding boilerplate.

Keenko core does not require Obsidian or per-session journals.
`
  );
}

async function updateAdrs() {
  await write(
    "docs/adr/0001-one-canonical-layer-two-harness-adapters.md",
    `# ADR 0001: one canonical engineering layer, two harness adapters

## Status

Accepted.

## Decision

Human engineering conventions are canonical. Codex and Claude receive thin harness-specific routing/adaptation rather than separate copies of the engineering rules.

## Consequences

- \`AGENTS.md\` and \`CLAUDE.md\` stay small and preserve project-owned surrounding text.
- Canonical generated Keenko knowledge lives under \`.keenko/docs\` and \`.keenko/skills\` in consuming projects.
- Harness-specific differences are allowed only where capabilities/invocation actually differ.
- A project-local decision can override Keenko defaults explicitly without forking generated Keenko guidance.
`
  );
  await write(
    "docs/adr/0003-generated-native-skill-copies.md",
    `# ADR 0003: generated native skill copies

## Status

Accepted.

## Decision

The canonical generated skill copy lives under \`.keenko/skills/\`. Keenko generates native copies under \`.agents/skills/\` and \`.claude/skills/\`.

Generated native skill directories carry a marker and Keenko may overwrite only directories it generated. Existing human-owned skill directories are never silently replaced.

## Why

Native discovery is reliable across supported harnesses and platforms. Symlinks add portability problems, while independently maintained copies drift.
`
  );
  await write(
    "docs/adr/0004-convex-skill-distribution.md",
    `# ADR 0004: Keenko owns the discoverable Convex specialist

## Status

Accepted. Reconciled under KEE-14 before the first stable baseline.

## Context

Keenko prefers current first-party Convex guidance for version-sensitive behavior. The official \`get-convex/agent-skills\` repository now declares Apache-2.0 licensing, so licensing is no longer the reason Keenko keeps its own specialist.

Keenko still needs project-specific behavior that the upstream suite cannot own: the Confect/native boundary, Keenko generated-code ownership, authorization and determinism rules, project authority, and the requirement to verify installed source/types before writing unfamiliar APIs.

## Decision

- Keep the reviewed upstream Convex revision in \`vendor/sources.json\` as external provenance with its declared Apache-2.0 license.
- Do not automatically install or redistribute the complete upstream suite in the default Keenko project.
- Ship the Keenko-owned \`convex\` specialist in both supported harness trees. It routes agents to installed Convex source/types, current first-party documentation, Keenko backend/Confect rules, and the pinned upstream provenance record when useful.
- A project may install the official Convex suite separately when a human deliberately chooses it. That external installation does not replace Keenko authority.
`
  );
  await write(
    "docs/adr/0005-canonical-formatting-and-linting-toolchain.md",
    `# ADR 0005: Canonical formatting and linting toolchain

## Status

Accepted for the v1 convention set by KEE-9. Reconciled with KEE-14 before the first stable baseline.

## Context

Playground dogfood under KEE-4 exposed that the Playbook described semantic code style and merge verification but did not define one executable formatting/linting contract. That left consumers and agents free to choose incompatible tools, rule baselines, scripts, generated-file behavior, and CI semantics.

The toolchain decision remains expensive to reverse even though KEE-14 replaced the old installer/materialization product with an Nx distribution.

## Decision

- Oxfmt is the canonical formatter and Oxlint is the canonical linter.
- Ultracite supplies the generic Oxfmt/Oxlint preset baseline. Keenko remains authoritative for semantic conventions, explicit overrides, scripts, CI, architecture, and agent behavior.
- TypeScript 7+ and type-aware Oxlint through \`oxlint-tsgolint\` are the TypeScript baseline.
- Effect-enabled repositories additionally use \`@effect/tsgo\` and \`oxlint-plugin-effect\`; Effect semantic/type-aware diagnostics surface through Oxlint without duplicate language-service diagnostics.
- Formatter output is executable truth for arbitrary formatting choices. Keenko fixes \`printWidth\` at 140 and keeps only semantic or architectural intent in prose.
- Root Oxc configuration is the monorepo baseline; nested configuration exists only for a real stack/runtime/architecture difference and inherits root policy.
- Generator-, manager-, and vendor-owned output is excluded from direct formatter/linter ownership by default and verified through its owner.
- Canonical TypeScript scripts expose formatting, linting, typecheck, tests, deterministic generated-code verification, and a non-remediating merge-ready \`check\`; CI consumes those scripts and never fixes or pushes source.
- Tooling versions are exact-pinned and upgrades are reviewed as convention changes. Effect's TypeScript/Oxlint/\`oxlint-tsgolint\` compatibility is verified from current first-party sources on every upgrade.
- The Keenko Nx preset owns the initial consumer package, root tooling, scripts, and CI contract. Later changes use reviewed Nx migrations that preserve project-owned customizations or fail explicitly on ambiguity.

## Alternatives considered

- Direct Oxfmt/Oxlint configuration without Ultracite would keep fewer dependencies but make Keenko responsible for maintaining a large generic rule catalog.
- Prettier plus ESLint/typescript-eslint is mature but did not provide a clean TypeScript 7 type-aware baseline at the decision point and carries a larger configuration/plugin set.
- Biome would unify formatter/linter configuration, but its documented TypeScript support lagged the required TypeScript 7 baseline at the decision point.
- Full Ultracite workflow ownership was rejected because its agent/editor/hook responsibilities overlap with Keenko authority.

## Consequences

Consumers get one predictable local/CI contract and agents can rely on stable script names. Upstream preset and engine upgrades can change accepted source, so exact pins and reviewed upgrades are intentional maintenance cost. TypeScript repositories must migrate to TypeScript 7+. Effect repositories carry an additional coupled toolchain. Generated defaults are distribution-owned while deliberate project deviations remain project-owned and must be migration-safe.
`
  );
}

async function updateConvexProvenance() {
  await updateJson("vendor/sources.json", (manifest) => {
    const sources = array(manifest.sources, "vendor/sources.json.sources");
    const convex = sources.map((entry) => record(entry, "vendor source")).find((entry) => entry.id === "convex");
    if (convex === undefined) throw new Error("Missing Convex vendor source");
    convex.commit = "573efe898c6ebc72db8743b971ce889c4de9beac";
    convex.tree = "ff2c5bcf94a37bb6aed29b7dbccef0fedb188764";
    convex.license = "Apache-2.0";
  });
  await write(
    "skills/convex/SKILL.md",
    `---
name: convex
description: Use for Convex schema, query, mutation, action, component, migration, performance, or native integration work. Pin behavior to the project's installed Convex version and current first-party documentation.
---

# Convex specialist

Keenko keeps this owned specialist because it binds Convex work to Keenko backend, Confect/native, authorization, determinism, migration, and generated-code rules. The official \`get-convex/agent-skills\` repository is Apache-2.0 and remains useful first-party workflow evidence. Keenko does not need to copy the full upstream suite into every project.

## Procedure

1. Read \`.keenko/docs/stacks/convex/README.md\` and the relevant Keenko conventions/project overrides.
2. Inspect this skill's packaged adapter and repository vendor metadata when upstream provenance matters.
3. Inspect the consuming project's installed \`convex\` and \`@convex-dev/*\` versions.
4. Prefer installed package source/types and current Convex documentation for version-sensitive APIs. Do not write an unfamiliar Convex API from memory.
5. If the project separately installs the official Convex skill suite, treat it as upstream guidance below project and Keenko authority rather than a replacement for this specialist.
6. Apply the repository's canonical rules for authorization, deterministic queries, migrations, generated code, Confect/native boundaries, and verification.
7. Run focused verification and the repository's canonical complete verification before merge-ready review.

## Guardrails

- The external upstream skill suite is optional, not a hidden prerequisite of this skill.
- Never claim that Keenko installed or verified an external skill unless the consuming repository actually contains and verifies it.
- Do not edit Confect/Convex generated output. Under the Keenko backend layout, only \`convex/tsconfig.json\` and \`convex/convex.config.ts\` are authored exceptions inside \`convex/\`.
- Keep Convex query determinism and authorization rules intact even when a provider/component API suggests otherwise.
`
  );
  await replace(
    "tests/vendor-policy.test.ts",
    '    expect(convex?.mode).toBe("external");\n    expect(await readFile(`${ROOT}/skills/convex/SKILL.md`, "utf-8")).toContain("name: convex");',
    '    expect(convex?.mode).toBe("external");\n    expect(convex?.license).toBe("Apache-2.0");\n    expect(await readFile(`${ROOT}/skills/convex/SKILL.md`, "utf-8")).toContain("name: convex");'
  );
}

async function updateVendorSync() {
  await replace(
    "cli/vendor-sync.ts",
    'interface GitBlobResponse {\n  encoding: string;\n  content: string;\n}\n',
    ''
  );
  await replace(
    "cli/vendor-sync.ts",
    '      const blob = await apiJson<GitBlobResponse>(`https://api.github.com/repos/${source.repository}/git/blobs/${entry.sha}`);\n      if (blob.encoding !== "base64") {\n        throw new Error(`Unsupported blob encoding for ${source.id}:${entry.path}`);\n      }\n      const filePath = join(target, entry.path);\n      await mkdir(dirname(filePath), { recursive: true });\n      await writeFile(filePath, Buffer.from(blob.content.replaceAll("\\n", ""), "base64"));',
    '      const upstreamPath = [source.rootPath, entry.path].filter(Boolean).join("/");\n      const response = await fetch(`https://raw.githubusercontent.com/${source.repository}/${source.commit}/${upstreamPath}`);\n      if (!response.ok) {\n        throw new Error(`${response.status} ${response.statusText}: ${source.id}:${upstreamPath}`);\n      }\n      const filePath = join(target, entry.path);\n      await mkdir(dirname(filePath), { recursive: true });\n      await writeFile(filePath, Buffer.from(await response.arrayBuffer()));'
  );
  await replace(
    "cli/vendor-sync.ts",
    '  const githubToken = process.env.GITHUB_TOKEN;\n  if (githubToken !== undefined && githubToken.length > 0) {\n    headers.Authorization = `Bearer ${githubToken}`;\n  }',
    '  const githubToken = process.env.GITHUB_TOKEN;\n  if (githubToken !== undefined && githubToken.length > 0 && url.includes("/keenko-fr/keenko-playbook/")) {\n    headers.Authorization = `Bearer ${githubToken}`;\n  }'
  );
}

async function updateVersions() {
  await replace("src/versions.ts", '  keenko: "0.1.0",\n', "");
}

async function updateGenerator() {
  await replace(
    "src/generators/preset/generator.ts",
    'import { format } from "oxfmt";\n',
    'import { format } from "oxfmt";\nimport { readFileSync } from "node:fs";\nimport path from "node:path";\n'
  );
  await replace("src/generators/preset/generator.ts", "        keenko: versions.keenko,", "        keenko: keenkoVersion(),");
  await replace(
    "src/generators/preset/generator.ts",
    '        check: "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run build",\n        codegen: "nx run-many -t codegen",\n        "codegen:check": "keenko check --guidance",\n        dev: "nx run web:dev",',
    '        check: "bun run codegen:check && bun run test && bun run format:check && bun run lint && bun run typecheck && bun run build",\n        codegen: "nx run-many -t codegen",\n        "codegen:check": "keenko check --guidance --codegen",\n        dev: `nx run @${projectName}/web:dev`,\n        test: "bun test --pass-with-no-tests",'
  );
  await replace(
    "src/generators/preset/generator.ts",
    '  ignorePatterns: [...(formatting.ignorePatterns ?? []), ".keenko/**", ".agents/skills/**", ".claude/skills/**", "**/_generated/**", "**/routeTree.gen.ts"],',
    '  ignorePatterns: [...(formatting.ignorePatterns ?? []), ".keenko/**", ".agents/skills/**", ".claude/skills/**", "**/_generated/**", "**/routeTree.gen.ts", "packages/backend/confect/**", "packages/backend/convex/**", "!packages/backend/convex/tsconfig.json", "!packages/backend/convex/convex.config.ts"],'
  );
  await replace(
    "src/generators/preset/generator.ts",
    '  ignorePatterns: [".keenko/**", ".agents/skills/**", ".claude/skills/**", "**/_generated/**", "**/routeTree.gen.ts"],',
    '  ignorePatterns: [".keenko/**", ".agents/skills/**", ".claude/skills/**", "**/_generated/**", "**/routeTree.gen.ts", "packages/backend/confect/**", "packages/backend/convex/**", "!packages/backend/convex/tsconfig.json", "!packages/backend/convex/convex.config.ts"],'
  );
  await replace(
    "src/generators/preset/generator.ts",
    'function json(value: unknown) {\n  return `${JSON.stringify(value, null, 2)}\\n`;\n}',
    `function keenkoVersion() {
  let current = path.resolve(import.meta.dirname);
  for (let depth = 0; depth < 8; depth += 1) {
    const packagePath = path.join(current, "package.json");
    try {
      const pkg = object(JSON.parse(readFileSync(packagePath, "utf-8")), packagePath);
      if (pkg.name === "keenko" && typeof pkg.version === "string") {
        return pkg.version;
      }
    } catch {
      // Keep walking until the packaged Keenko root is found.
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("Could not resolve the running Keenko package version");
}

function json(value: unknown) {
  return \`${JSON.stringify(value, null, 2)}\\n\`;
}`
  );
}

async function updateGuidance() {
  await write(
    "src/guidance.ts",
    `import type { Tree } from "@nx/devkit";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const PACKAGE_ROOT = packageRoot();
const START = "<!-- keenko:start -->";
const END = "<!-- keenko:end -->";
const PROJECT_SCAFFOLD = ["CONTEXT.md", "docs/project/architecture.md", "docs/project/overrides.md", "docs/project/ui.md"] as const;

const VENDORED_SKILLS = {
  "ask-matt": "vendor/matt-pocock/skills/engineering/ask-matt",
  "code-review": "vendor/matt-pocock/skills/engineering/code-review",
  "codebase-design": "vendor/matt-pocock/skills/engineering/codebase-design",
  "diagnosing-bugs": "vendor/matt-pocock/skills/engineering/diagnosing-bugs",
  "domain-modeling": "vendor/matt-pocock/skills/engineering/domain-modeling",
  "effect-ts": "vendor/effect-ts/skills/effect-ts",
  "grill-with-docs": "vendor/matt-pocock/skills/engineering/grill-with-docs",
  grilling: "vendor/matt-pocock/skills/productivity/grilling",
  handoff: "vendor/matt-pocock/skills/productivity/handoff",
  implement: "vendor/matt-pocock/skills/engineering/implement",
  "improve-codebase-architecture": "vendor/matt-pocock/skills/engineering/improve-codebase-architecture",
  prototype: "vendor/matt-pocock/skills/engineering/prototype",
  "resolving-merge-conflicts": "vendor/matt-pocock/skills/engineering/resolving-merge-conflicts",
  tdd: "vendor/matt-pocock/skills/engineering/tdd",
  "to-spec": "vendor/matt-pocock/skills/engineering/to-spec",
  "to-tickets": "vendor/matt-pocock/skills/engineering/to-tickets",
  unslop: "vendor/pstack/skills/unslop",
  wizard: "vendor/matt-pocock/skills/engineering/wizard",
} as const;

const OWNED_SKILLS = ["confect", "convex"] as const;

export function syncGuidance(tree: Tree) {
  deleteGeneratedTree(tree, ".keenko");
  copyDirectory(tree, "docs/core", ".keenko/docs/core");
  copyDirectory(tree, "docs/conventions", ".keenko/docs/conventions");
  copyDirectory(tree, "docs/stacks", ".keenko/docs/stacks");

  for (const name of OWNED_SKILLS) copyDirectory(tree, \`skills/\${name}\`, \`.keenko/skills/\${name}\`);
  for (const [name, source] of Object.entries(VENDORED_SKILLS)) writeVendoredAdapter(tree, name, source);

  const skillNames = [...OWNED_SKILLS, ...Object.keys(VENDORED_SKILLS)].toSorted();
  for (const harness of [".agents", ".claude"]) {
    deleteGeneratedSkills(tree, \`\${harness}/skills\`);
    for (const name of skillNames) {
      copyTreeDirectory(tree, \`.keenko/skills/\${name}\`, \`\${harness}/skills/\${name}\`);
      tree.write(\`\${harness}/skills/\${name}/.keenko-generated\`, "generated by keenko\\n");
    }
  }

  for (const [file, template] of [
    ["AGENTS.md", "templates/AGENTS.managed.md"],
    ["CLAUDE.md", "templates/CLAUDE.managed.md"],
  ] as const) {
    const current = tree.read(file, "utf-8") ?? "";
    tree.write(file, renderManagedBlock(current, readSource(template), file));
  }

  for (const [file, template] of [
    ["CONTEXT.md", "templates/project-context.md"],
    ["docs/project/architecture.md", "templates/project-architecture.md"],
    ["docs/project/overrides.md", "templates/project-overrides.md"],
    ["docs/project/ui.md", "templates/project-ui.md"],
  ] as const) {
    if (!tree.exists(file)) tree.write(file, readSource(template));
  }

  const hashes = hashTreeFiles(tree, [".keenko/docs/", ".keenko/skills/"]);
  tree.write(".keenko/manifest.json", \`\${JSON.stringify({ files: hashes, generatedBy: "keenko", schemaVersion: 1 }, null, 2)}\\n\`);
}

export function verifyGuidance(tree: Tree) {
  const text = tree.read(".keenko/manifest.json", "utf-8");
  if (text === null) throw new Error("Missing generated Keenko guidance. Run 'bunx nx g keenko:sync'.");
  const parsed = object(JSON.parse(text), ".keenko/manifest.json");
  if (parsed.generatedBy !== "keenko" || parsed.schemaVersion !== 1) throw new Error("Invalid .keenko/manifest.json");
  const files = object(parsed.files, ".keenko/manifest.json.files");
  const actual = hashTreeFiles(tree, [".keenko/docs/", ".keenko/skills/"]);
  if (JSON.stringify(actual) !== JSON.stringify(files)) {
    throw new Error("Generated Keenko guidance has drifted. Run 'bunx nx g keenko:sync'.");
  }

  for (const harness of [".agents", ".claude"]) {
    for (const [file, hash] of Object.entries(actual)) {
      if (!file.startsWith(".keenko/skills/") || typeof hash !== "string") continue;
      const native = file.replace(".keenko/skills/", \`\${harness}/skills/\`);
      if (hashContent(tree.read(native) ?? Buffer.from("")) !== hash) {
        throw new Error(\`Generated native skill differs from the canonical snapshot: \${native}\`);
      }
    }
    for (const skill of [...OWNED_SKILLS, ...Object.keys(VENDORED_SKILLS)]) {
      if (tree.read(\`\${harness}/skills/\${skill}/.keenko-generated\`, "utf-8") !== "generated by keenko\\n") {
        throw new Error(\`Missing Keenko generated marker for \${harness}/skills/\${skill}\`);
      }
    }
  }

  for (const [file, template] of [
    ["AGENTS.md", "templates/AGENTS.managed.md"],
    ["CLAUDE.md", "templates/CLAUDE.managed.md"],
  ] as const) {
    verifyManagedBlock(tree.read(file, "utf-8"), readSource(template), file);
  }
  for (const file of PROJECT_SCAFFOLD) {
    if (!tree.exists(file)) throw new Error(\`Missing project-owned Keenko scaffold: \${file}\`);
  }
}

function writeVendoredAdapter(tree: Tree, name: string, source: string) {
  const target = \`.keenko/skills/\${name}\`;
  const upstream = readSource(\`\${source}/SKILL.md\`);
  const frontmatter = /^---\\n[\\s\\S]*?\\n---\\n/u.exec(upstream)?.[0] ?? \`---\\nname: \${name}\\ndescription: Keenko-adapted upstream workflow.\\n---\\n\`;
  tree.write(
    \`\${target}/SKILL.md\`,
    \`\${frontmatter}\\n# Keenko adapter\\n\\nRead \\`references/upstream/SKILL.md\\` and apply it below project and Keenko authority. Do not infer permission to commit, push, merge, deploy, publish, install dependencies, or perform destructive actions. Only invoke skills installed in this snapshot.\\n\`
  );
  copyDirectory(tree, source, \`\${target}/references/upstream\`);
  const vendor = source.split("/").slice(0, 2).join("/");
  tree.write(\`\${target}/UPSTREAM_LICENSE\`, readSource(\`\${vendor}/LICENSE\`));
  tree.write(\`\${target}/UPSTREAM_PROVENANCE.json\`, readSource(\`\${vendor}/VENDORED.json\`));
}

function copyDirectory(tree: Tree, source: string, target: string, include: (file: string) => boolean = () => true) {
  const root = sourcePath(source);
  for (const file of walk(root)) {
    const relative = path.relative(root, file).replaceAll("\\\\", "/");
    if (include(relative)) tree.write(\`\${target}/\${relative}\`, readFileSync(file));
  }
}

function copyTreeDirectory(tree: Tree, source: string, target: string) {
  for (const change of tree.listChanges()) {
    if (change.path.startsWith(\`\${source}/\`) && change.content !== null) tree.write(change.path.replace(source, target), change.content);
  }
}

function deleteGeneratedTree(tree: Tree, root: string) {
  for (const file of listTreeFiles(tree, root)) tree.delete(file);
}

function deleteGeneratedSkills(tree: Tree, root: string) {
  for (const directory of tree.children(root)) {
    if (tree.exists(\`\${root}/\${directory}/.keenko-generated\`)) {
      for (const file of listTreeFiles(tree, \`\${root}/\${directory}\`)) tree.delete(file);
    }
  }
}

function listTreeFiles(tree: Tree, root: string): string[] {
  if (tree.isFile(root)) return [root];
  return tree.children(root).flatMap((child) => listTreeFiles(tree, \`\${root}/\${child}\`));
}

function renderManagedBlock(current: string, template: string, file: string) {
  const block = managedBlock(template);
  const start = current.indexOf(START);
  const end = current.indexOf(END);
  if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) throw new Error(\`Malformed Keenko managed block in \${file}\`);
  if (start === -1) return current.trim().length === 0 ? \`\${block}\\n\` : \`\${current.trimEnd()}\\n\\n\${block}\\n\`;
  return \`\${current.slice(0, start)}\${block}\${current.slice(end + END.length)}\`;
}

function verifyManagedBlock(current: string | null, template: string, file: string) {
  if (current === null) throw new Error(\`Missing \${file}\`);
  const start = current.indexOf(START);
  const end = current.indexOf(END);
  if (start === -1 || end < start) throw new Error(\`Missing or malformed Keenko managed block in \${file}\`);
  const actual = current.slice(start, end + END.length);
  if (actual !== managedBlock(template)) throw new Error(\`Keenko managed block has drifted in \${file}. Run 'bunx nx g keenko:sync'.\`);
}

function managedBlock(template: string) {
  return \`\${START}\\n\\n\${template.trim()}\\n\${END}\`;
}

function hashTreeFiles(tree: Tree, roots: string[]) {
  const files = roots.flatMap((root) => listTreeFiles(tree, root)).toSorted();
  return Object.fromEntries(files.map((file) => [file, hashContent(tree.read(file) ?? Buffer.from(""))]));
}

function hashContent(content: Buffer | string) {
  return createHash("sha256").update(content).digest("hex");
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(\`\${label} must be an object\`);
  return Object.fromEntries(Object.entries(value));
}

function sourcePath(relative: string) {
  const result = path.join(PACKAGE_ROOT, relative);
  if (!existsSync(result)) throw new Error(\`Missing packaged Keenko asset: \${relative}\`);
  return result;
}

function packageRoot() {
  const source = path.resolve(import.meta.dirname, "..");
  return existsSync(path.join(source, "package.json")) ? source : path.resolve(source, "..");
}

function readSource(relative: string) {
  return readFileSync(sourcePath(relative), "utf-8");
}

function walk(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const entry = path.join(root, name);
    return statSync(entry).isDirectory() ? walk(entry) : [entry];
  });
}
`
  );
}

async function updateCli() {
  await write(
    "cli/keenko.ts",
    `#!/usr/bin/env node
import { FsTree } from "@nx/devkit/internal";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import presetGenerator from "../src/generators/preset/generator.ts";
import { verifyGuidance } from "../src/guidance.ts";

const PACKAGE_ROOT = packageRoot();

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (["help", "--help", "-h"].includes(command)) return printHelp();
  if (command === "create") return await create(args);
  if (command === "upgrade") return await upgrade(args);
  if (command === "check") return await check(args);
  throw new Error(\`Unknown command: \${command}\`);
}

async function create(args: string[]) {
  const destination = positional(args, 0, "project");
  rejectUnknownFlags(args, new Set(["--no-install"]));
  preflightRuntime();
  const target = path.resolve(destination);
  await preflightEmptyTarget(target);
  const parent = path.dirname(target);
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(path.join(parent, ".keenko-create-"));
  try {
    const tree = new FsTree(stage, false);
    await presetGenerator(tree, { name: path.basename(target) });
    await applyChanges(stage, tree);
    if (!args.includes("--no-install")) {
      await useLocalPackageWhenUnpublished(stage);
      await run("bun", ["install"], stage);
      await run("bun", ["run", "codegen"], stage);
    }
    await run("git", ["init", "--quiet"], stage);
    await rename(stage, target);
  } catch (error) {
    await rm(stage, { force: true, recursive: true });
    throw error;
  }
  console.log(\`Created Keenko project at \${target}\`);
}

async function upgrade(args: string[]) {
  rejectUnknownFlags(args, new Set(["--dry-run"]));
  preflightRuntime();
  const root = process.cwd();
  const installed = await installedVersion(root);
  const requested = args.find((arg) => !arg.startsWith("--"));
  const target = requested ?? registryVersionForMajor(installed);
  if (isPlainVersion(target)) {
    const comparison = compareVersions(target, installed);
    if (comparison < 0) throw new Error(\`Keenko does not support automated downgrades: \${installed} -> \${target}\`);
    if (comparison === 0) {
      console.log(\`Keenko \${installed} is already installed; no files changed.\`);
      return;
    }
  }
  if (args.includes("--dry-run")) {
    console.log(\`Would ask Nx to migrate keenko \${installed} -> \${target}; no files changed.\`);
    return;
  }
  requireCleanGit(root);
  const spec = target.startsWith("keenko@") ? target : isPlainVersion(target) ? \`keenko@\${target}\` : target;
  await nx(["migrate", spec, \`--from=keenko@\${installed}\`, "--interactive=false", "--no-agentic", "--skip-install"], root);
  await run("bun", ["install"], root);
  await nx(["migrate", "--run-migrations", "--if-exists", "--no-agentic"], root);
  await run("bun", ["install"], root);
  await nx(["generate", "keenko:sync", "--no-interactive"], root);
  await run("bun", ["run", "codegen"], root);
  await rm(path.join(root, "migrations.json"), { force: true });
  console.log(\`Upgraded Keenko to \${target}. Review the Git diff before committing.\`);
}

async function check(args: string[]) {
  rejectUnknownFlags(args, new Set(["--guidance", "--codegen"]));
  preflightRuntime();
  const root = process.cwd();
  const tree = new FsTree(root, false);
  verifyGuidance(tree);
  await verifyTopology(root);
  if (args.includes("--codegen")) await verifyGeneratedCode(root);
  console.log("Keenko generated guidance, generated code, and workspace topology are valid.");
}

function printHelp() {
  console.log("Keenko\\n\\n  keenko create <project> [--no-install]\\n  keenko upgrade [target] [--dry-run]\\n  keenko check [--guidance] [--codegen]");
}

function preflightRuntime() {
  const nodeMajor = Math.trunc(Number(process.versions.node.split(".")[0] ?? "0"));
  if (nodeMajor !== 24) throw new Error(\`Keenko tooling requires Node 24; found \${process.versions.node}\`);
  const bun = execFileSync("bun", ["--version"], { encoding: "utf-8" }).trim();
  const [major = 0, minor = 0] = bun.split(".").map(Number);
  if (major !== 1 || minor < 4) throw new Error(\`Keenko requires Bun >=1.4.0 <2; found \${bun}\`);
}

async function preflightEmptyTarget(target: string) {
  try {
    const info = await stat(target);
    const entries = info.isDirectory() ? await readdir(target) : [];
    if (!info.isDirectory() || entries.length > 0) throw new Error(\`Refusing to create into non-empty target: \${target}\`);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

async function applyChanges(root: string, tree: FsTree) {
  await Promise.all(
    tree.listChanges().map(async (change) => {
      const target = path.join(root, change.path);
      if (change.type === "DELETE") return await rm(target, { force: true, recursive: true });
      if (change.content === null) return;
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, change.content, change.options);
    })
  );
}

async function useLocalPackageWhenUnpublished(root: string) {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as { devDependencies: Record<string, string> };
  const override = process.env.KEENKO_PACKAGE_SPEC;
  if (override !== undefined && override.length > 0) {
    pkg.devDependencies.keenko = override;
    await writeFile(pkgPath, \`\${JSON.stringify(pkg, null, 2)}\\n\`);
    return;
  }
  const current = packageVersion();
  try {
    execFileSync("npm", ["view", \`keenko@\${current}\`, "version"], { stdio: "ignore" });
  } catch {
    pkg.devDependencies.keenko = \`file:\${PACKAGE_ROOT}\`;
    await writeFile(pkgPath, \`\${JSON.stringify(pkg, null, 2)}\\n\`);
  }
}

async function installedVersion(root: string) {
  const pkg = JSON.parse(await readFile(path.join(root, "node_modules/keenko/package.json"), "utf-8")) as { version: string };
  return pkg.version;
}

function registryVersionForMajor(installed: string) {
  const parsedInstalled = parseVersion(installed);
  const raw = execFileSync("npm", ["view", \`keenko@\${parsedInstalled.major}\`, "version", "--json"], { encoding: "utf-8" }).trim();
  const value: unknown = JSON.parse(raw);
  const candidates = (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === "string" && isPlainVersion(item) && !item.includes("-"))
    .filter((item) => parseVersion(item).major === parsedInstalled.major)
    .toSorted(compareVersions);
  const target = candidates.at(-1);
  if (target === undefined) throw new Error(\`No stable Keenko release is available on supported major \${parsedInstalled.major}\`);
  if (compareVersions(target, installed) < 0) throw new Error(\`Registry latest for Keenko major \${parsedInstalled.major} is older than installed \${installed}\`);
  return target;
}

function isPlainVersion(value: string) {
  return /^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value);
}

function parseVersion(value: string) {
  const match = /^(?<major>\\d+)\\.(?<minor>\\d+)\\.(?<patch>\\d+)(?<pre>-[0-9A-Za-z.-]+)?$/u.exec(value);
  if (match?.groups === undefined) throw new Error(\`Expected an exact Keenko version, found \${value}\`);
  return { major: Number(match.groups.major), minor: Number(match.groups.minor), patch: Number(match.groups.patch), pre: match.groups.pre ?? "" };
}

function compareVersions(left: string, right: string) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  if (a.pre === b.pre) return 0;
  if (a.pre.length === 0) return 1;
  if (b.pre.length === 0) return -1;
  return a.pre.localeCompare(b.pre);
}

function requireCleanGit(root: string) {
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf-8" });
  if (status.trim().length > 0) throw new Error("keenko upgrade requires a clean Git working tree");
}

async function verifyTopology(root: string) {
  const expected = ["apps/web", "packages/backend", "packages/shared", "packages/ui"];
  await Promise.all(expected.map(async (directory) => {
    const info = await stat(path.join(root, directory)).catch(() => null);
    if (info?.isDirectory() !== true) throw new Error(\`Missing fixed Keenko workspace: \${directory}\`);
  }));
  const [apps, packages] = await Promise.all([workspaceDirectories(path.join(root, "apps")), workspaceDirectories(path.join(root, "packages"))]);
  const actual = [...apps.map((name) => \`apps/\${name}\`), ...packages.map((name) => \`packages/\${name}\`)].toSorted();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(\`Unexpected Keenko workspace topology: \${actual.join(", ")}\`);
  await verifyPackageDirections(root);
}

async function verifyPackageDirections(root: string) {
  const allowed: Record<string, Set<string>> = { backend: new Set(["shared"]), shared: new Set(), ui: new Set(["shared"]), web: new Set(["backend", "shared", "ui"]) };
  const packages = [["web", "apps/web/package.json"], ["backend", "packages/backend/package.json"], ["ui", "packages/ui/package.json"], ["shared", "packages/shared/package.json"]] as const;
  const names = new Map<string, string>();
  const manifests = new Map<string, Record<string, unknown>>();
  await Promise.all(packages.map(async ([owner, file]) => {
    const manifest = parseObject(await readFile(path.join(root, file), "utf-8"), file);
    if (typeof manifest.name !== "string") throw new TypeError(\`\${file}.name must be a string\`);
    names.set(manifest.name, owner);
    manifests.set(owner, manifest);
  }));
  for (const [owner, manifest] of manifests) {
    const dependencies = objectOrEmpty(manifest.dependencies, \`\${owner}.dependencies\`);
    for (const dependency of Object.keys(dependencies)) {
      const target = names.get(dependency);
      if (target !== undefined && !allowed[owner]?.has(target)) throw new Error(\`Forbidden Keenko workspace dependency: \${owner} -> \${target}\`);
    }
  }
}

async function verifyGeneratedCode(root: string) {
  const tempRoot = await mkdtemp(path.join(path.dirname(root), ".keenko-codegen-check-"));
  const stage = path.join(tempRoot, "project");
  try {
    await cp(root, stage, {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(root, source).replaceAll("\\\\", "/");
        if (relative === "") return true;
        const first = relative.split("/")[0];
        if ([".git", ".nx", "node_modules", "coverage", "dist"].includes(first ?? "")) return false;
        return !isGeneratedOwned(relative);
      },
    });
    await symlink(path.join(root, "node_modules"), path.join(stage, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    await run("bun", ["run", "codegen"], stage);
    const [expected, actual] = await Promise.all([generatedHashes(root), generatedHashes(stage)]);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new Error("Generated source has drifted. Run 'bun run codegen' and review the generated diff.");
    }
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function isGeneratedOwned(relative: string) {
  if (relative === "apps/web/src/routeTree.gen.ts" || relative.startsWith("apps/web/src/paraglide/")) return true;
  if (relative.startsWith("packages/backend/confect/") && relative !== "packages/backend/confect/.gitkeep") return true;
  if (relative.startsWith("packages/backend/convex/")) {
    return !["packages/backend/convex/tsconfig.json", "packages/backend/convex/convex.config.ts"].includes(relative);
  }
  return false;
}

async function generatedHashes(root: string) {
  const roots = ["apps/web/src/paraglide", "apps/web/src/routeTree.gen.ts", "packages/backend/confect", "packages/backend/convex"];
  const entries: Array<readonly [string, string]> = [];
  for (const relative of roots) {
    const target = path.join(root, relative);
    const info = await stat(target).catch(() => null);
    if (info === null) continue;
    const files = info.isDirectory() ? await walkFiles(target) : [target];
    for (const file of files) {
      const rel = path.relative(root, file).replaceAll("\\\\", "/");
      if (!isGeneratedOwned(rel)) continue;
      entries.push([rel, createHash("sha256").update(await readFile(file)).digest("hex")]);
    }
  }
  return Object.fromEntries(entries.toSorted(([left], [right]) => left.localeCompare(right)));
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? await walkFiles(target) : entry.isFile() ? [target] : [];
  }));
  return nested.flat();
}

function parseObject(text: string, label: string) {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(\`\${label} must contain an object\`);
  return Object.fromEntries(Object.entries(value));
}

function objectOrEmpty(value: unknown, label: string) {
  return value === undefined ? {} : parseObject(JSON.stringify(value), label);
}

async function workspaceDirectories(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function nx(args: string[], cwd: string) {
  await run(process.execPath, [path.join(cwd, "node_modules/nx/bin/nx.js"), ...args], cwd);
}

async function run(command: string, args: string[], cwd: string) {
  const child = spawn(command, args, { cwd, stdio: "inherit" });
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (value) => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error(\`\${command} \${args.join(" ")} failed with exit code \${code}\`);
}

function positional(args: string[], index: number, label: string) {
  const value = args.filter((arg) => !arg.startsWith("--"))[index];
  if (value === undefined) throw new Error(\`Missing \${label}\`);
  return value;
}

function rejectUnknownFlags(args: string[], allowed: Set<string>) {
  const unknown = args.find((arg) => arg.startsWith("--") && !allowed.has(arg));
  if (unknown !== undefined) throw new Error(\`Unknown option: \${unknown}\`);
}

function packageVersion() {
  return execFileSync(process.execPath, ["-e", \`console.log(require(\${JSON.stringify(path.join(PACKAGE_ROOT, "package.json"))}).version)\`], { encoding: "utf-8" }).trim();
}

function packageRoot() {
  const source = path.resolve(import.meta.dirname, "..");
  return existsSync(path.join(source, "package.json")) ? source : path.resolve(source, "..");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
`
  );
}

async function updateMigrations() {
  await write(
    "migrations.json",
    `{
  "generators": {
    "0.1.0-reconcile-baseline": {
      "version": "0.1.0",
      "description": "Reconcile supported pre-v1 project scripts and the canonical Oxlint baseline.",
      "factory": "./dist/src/migrations/normalize-check.js"
    }
  }
}
`
  );
  await write(
    "src/migrations/normalize-check.ts",
    `import type { Tree } from "@nx/devkit";

const PREVIOUS_CHECKS = new Set([
  "bun run format:check && bun run lint && bun run typecheck && bun run build",
  "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run build",
]);
const CURRENT_CHECK = "bun run codegen:check && bun run test && bun run format:check && bun run lint && bun run typecheck && bun run build";
const PREVIOUS_CODEGEN_CHECK = "keenko check --guidance";
const CURRENT_CODEGEN_CHECK = "keenko check --guidance --codegen";
const CURRENT_TEST = "bun test --pass-with-no-tests";
const PREVIOUS_OXLINT = "1.80.0";
const CURRENT_OXLINT = "1.81.0";

export default function normalizeCheck(tree: Tree) {
  const source = tree.read("package.json", "utf-8");
  if (source === null) throw new Error("Cannot migrate: package.json is missing");
  const pkg = object(JSON.parse(source), "package.json");
  const scripts = stringRecord(pkg.scripts, "package.json.scripts");
  if (scripts === undefined) throw new Error("Cannot migrate package.json scripts because the Keenko baseline is missing");

  if (scripts.check !== CURRENT_CHECK) {
    if (scripts.check === undefined || !PREVIOUS_CHECKS.has(scripts.check)) {
      throw new Error("Cannot migrate package.json scripts.check because it was customized; reconcile it with the Keenko check pipeline first");
    }
    scripts.check = CURRENT_CHECK;
  }
  if (scripts["codegen:check"] === undefined || scripts["codegen:check"] === PREVIOUS_CODEGEN_CHECK) {
    scripts["codegen:check"] = CURRENT_CODEGEN_CHECK;
  } else if (scripts["codegen:check"] !== CURRENT_CODEGEN_CHECK) {
    throw new Error("Cannot migrate package.json scripts.codegen:check because it was customized; reconcile it with Keenko generated-code verification first");
  }
  scripts.test ??= CURRENT_TEST;

  const devDependencies = stringRecord(pkg.devDependencies, "package.json.devDependencies");
  if (devDependencies === undefined) throw new Error("Cannot migrate package.json devDependencies because the Keenko baseline is missing");
  if (devDependencies.oxlint === PREVIOUS_OXLINT) devDependencies.oxlint = CURRENT_OXLINT;
  else if (devDependencies.oxlint !== CURRENT_OXLINT) {
    throw new Error("Cannot migrate devDependencies.oxlint because it was customized; reconcile it with the Keenko tooling baseline first");
  }

  pkg.scripts = scripts;
  pkg.devDependencies = devDependencies;
  tree.write("package.json", \`\${JSON.stringify(pkg, null, 2)}\\n\`);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(\`\${label} must be an object\`);
  return Object.fromEntries(Object.entries(value));
}

function stringRecord(value: unknown, label: string): Record<string, string> | undefined {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  if (!entries.every(([, entry]) => typeof entry === "string")) throw new TypeError(\`\${label} must contain only strings\`);
  return Object.fromEntries(entries.map(([key, entry]) => [key, String(entry)]));
}
`
  );
  await rm(path.join(ROOT, "src/migrations/refresh-guidance.ts"), { force: true });
}

async function updateReleaseFlow() {
  await write(
    "nx.json",
    `{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "defaultBase": "main",
  "neverConnectToCloud": true,
  "release": {
    "projects": ["keenko"],
    "releaseTag": {
      "pattern": "v{version}"
    },
    "git": {
      "commit": true,
      "tag": true
    },
    "versionPlans": true,
    "version": {
      "preVersionCommand": "bun run check:release"
    }
  },
  "targetDefaults": {
    "check": {
      "cache": true,
      "dependsOn": ["^check"]
    }
  }
}
`
  );
  await write(
    ".github/workflows/release.yml",
    `name: Release

on:
  workflow_dispatch:
    inputs:
      mode:
        description: Prepare a reviewable release commit, or publish an already-reviewed release commit
        required: true
        type: choice
        options: [prepare, publish]
      expected_sha:
        description: Exact main commit reviewed for this release step
        required: true
        type: string

permissions:
  contents: write
  id-token: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
        with:
          fetch-depth: 0
          ref: \${{ inputs.expected_sha }}
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6
        with:
          bun-version: 1.4.0
      - name: Verify exact reviewed main commit
        run: |
          git fetch origin main --tags
          test "$(git rev-parse HEAD)" = "\${{ inputs.expected_sha }}"
          test "$(git rev-parse origin/main)" = "\${{ inputs.expected_sha }}"
      - run: bun install --frozen-lockfile
      - name: Release-grade verification
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: bun run check:release
      - name: Configure release identity
        run: |
          git config user.name github-actions[bot]
          git config user.email 41898282+github-actions[bot]@users.noreply.github.com
      - name: Prepare reviewable Nx release commit
        if: \${{ inputs.mode == 'prepare' }}
        run: |
          first_release=""
          if ! git tag --list 'v*' | grep -q .; then first_release="--first-release"; fi
          bunx nx release --skip-publish --git-tag=false --git-push=false $first_release
          version="$(node -p "require('./package.json').version")"
          branch="release/keenko-v${version}"
          test "$(git rev-parse HEAD)" != "\${{ inputs.expected_sha }}"
          git push origin "HEAD:refs/heads/${branch}"
          echo "Review and merge ${branch} before running publish from its exact main SHA."
      - name: Tag exact reviewed release commit with Nx
        if: \${{ inputs.mode == 'publish' }}
        run: |
          test -z "$(find .nx/version-plans -type f -name '*.md' -print -quit 2>/dev/null)"
          version="$(node -p "require('./package.json').version")"
          first_release=""
          if ! git tag --list 'v*' | grep -q .; then first_release="--first-release"; fi
          bunx nx release changelog "$version" --git-commit=false --git-tag=true --git-push=true $first_release
          git diff --exit-code
          test "$(git rev-list -n 1 "v${version}")" = "\${{ inputs.expected_sha }}"
      - name: Publish exact tagged release
        if: \${{ inputs.mode == 'publish' }}
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: true
        run: |
          first_release=""
          if [ "$(git tag --list 'v*' | wc -l)" -eq 1 ]; then first_release="--first-release"; fi
          bunx nx release publish $first_release
`
  );
}

async function updateTests() {
  await write(
    "tests/migrations.test.ts",
    `import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, test } from "bun:test";

import normalizeCheck from "../src/migrations/normalize-check.ts";

const oldest = "bun run format:check && bun run lint && bun run typecheck && bun run build";
const firstPass = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run build";
const current = "bun run codegen:check && bun run test && bun run format:check && bun run lint && bun run typecheck && bun run build";

describe("Keenko migrations", () => {
  test.each([[oldest, "1.80.0"], [firstPass, "1.81.0"]] as const)("supports a pre-v1 baseline", (check, oxlint) => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write("package.json", JSON.stringify({
      projectNote: "preserve me",
      devDependencies: { oxlint },
      scripts: { check, "codegen:check": check === firstPass ? "keenko check --guidance" : undefined, custom: "keep me" },
    }));
    normalizeCheck(tree);
    const migrated = JSON.parse(tree.read("package.json", "utf-8") ?? "{}") as { devDependencies: Record<string, string>; projectNote: string; scripts: Record<string, string> };
    expect(migrated.scripts.check).toBe(current);
    expect(migrated.scripts["codegen:check"]).toBe("keenko check --guidance --codegen");
    expect(migrated.scripts.test).toBe("bun test --pass-with-no-tests");
    expect(migrated.scripts.custom).toBe("keep me");
    expect(migrated.devDependencies.oxlint).toBe("1.81.0");
    expect(migrated.projectNote).toBe("preserve me");
  });

  test("reports an actionable conflict for an ambiguous customization", () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write("package.json", JSON.stringify({ devDependencies: { oxlint: "1.81.0" }, scripts: { check: "my custom verifier" } }));
    expect(() => normalizeCheck(tree)).toThrow("customized");
  });
});
`
  );
  await write(
    "tests/package-contract.test.ts",
    `import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

describe("public package contract", () => {
  test("publishes one package with compiled CLI, Nx generators, migrations, and assets", async () => {
    const pkg = object(JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf-8")));
    expect(pkg.name).toBe("keenko");
    expect(pkg.private).toBe(false);
    expect(pkg.bin).toEqual({ keenko: "dist/cli/keenko.js" });
    expect(pkg.generators).toBe("./generators.json");
    expect(pkg["nx-migrations"]).toBe("./migrations.json");
    const versions = await readFile(path.join(ROOT, "src/versions.ts"), "utf-8");
    expect(versions).not.toContain("keenko:");
    const generator = await readFile(path.join(ROOT, "src/generators/preset/generator.ts"), "utf-8");
    expect(generator).toContain("keenko: keenkoVersion()");
    expect(await readFile(path.join(ROOT, "generators.json"), "utf-8")).toContain("dist/src/generators/preset/generator.js");
    const migrations = await readFile(path.join(ROOT, "migrations.json"), "utf-8");
    expect(migrations).toContain("dist/src/migrations/normalize-check.js");
    expect(migrations).not.toContain("refresh-guidance");
  });

  test("uses Nx version plans and separates reviewable versioning from tagged publication", async () => {
    const nx = object(JSON.parse(await readFile(path.join(ROOT, "nx.json"), "utf-8")));
    expect(object(nx.release).versionPlans).toBe(true);
    expect(await readFile(path.join(ROOT, ".nx/version-plans/kee-14.md"), "utf-8")).toContain("keenko: minor");
    const release = await readFile(path.join(ROOT, ".github/workflows/release.yml"), "utf-8");
    expect(release).toContain("Prepare reviewable Nx release commit");
    expect(release).toContain("Verify exact reviewed main commit");
    expect(release).toContain("nx release publish");
  });
});

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Expected object");
  return Object.fromEntries(Object.entries(value));
}
`
  );
  await replace(
    "tests/preset.test.ts",
    '    expect(tree.read("package.json", "utf-8")).not.toContain(\'"latest"\');',
    '    expect(tree.read("package.json", "utf-8")).not.toContain(\'"latest"\');\n    expect(tree.read("package.json", "utf-8")).toContain(\'"codegen:check": "keenko check --guidance --codegen"\');\n    expect(tree.read("package.json", "utf-8")).toContain("bun run test");'
  );
  await write(
    "tests/packed-product.test.ts",
    `import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const CURRENT_CHECK = "bun run codegen:check && bun run test && bun run format:check && bun run lint && bun run typecheck && bun run build";
const FIRST_PASS_CHECK = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run build";
const OLDEST_CHECK = "bun run format:check && bun run lint && bun run typecheck && bun run build";

test("packed Keenko creates and upgrades real consumer fixtures", async () => {
  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-packed-"));
  try {
    const packDir = path.join(temp, "pack");
    await mkdir(packDir);
    const tarballName = runOut("npm", ["pack", "--pack-destination", packDir, "--silent"], ROOT).trim().split("\\n").at(-1);
    if (tarballName === undefined) throw new Error("npm pack did not return a tarball name");
    const tarball = path.join(packDir, tarballName);
    const packageJson = json(await readFile(path.join(ROOT, "package.json"), "utf-8"));
    const currentVersion = string(packageJson.version, "package.json.version");

    const runner = path.join(temp, "runner");
    await mkdir(runner);
    await writeFile(path.join(runner, "package.json"), JSON.stringify({ private: true, dependencies: { keenko: \`file:\${tarball}\` } }, null, 2));
    run("bun", ["install"], runner);
    const packedPackage = json(await readFile(path.join(runner, "node_modules/keenko/package.json"), "utf-8"));
    expect(packedPackage.version).toBe(currentVersion);
    const cli = path.join(runner, "node_modules/keenko/dist/cli/keenko.js");

    const identity = path.join(temp, "identity");
    run("node", [cli, "create", identity, "--no-install"], runner);
    const identityPackage = json(await readFile(path.join(identity, "package.json"), "utf-8"));
    expect(record(identityPackage.devDependencies, "identity devDependencies").keenko).toBe(currentVersion);

    const occupied = path.join(temp, "occupied");
    await mkdir(occupied);
    await writeFile(path.join(occupied, "sentinel.txt"), "keep me\\n");
    const refused = spawnSync("node", [cli, "create", occupied], { cwd: runner, encoding: "utf-8" });
    expect(refused.status).not.toBe(0);
    expect(await readFile(path.join(occupied, "sentinel.txt"), "utf-8")).toBe("keep me\\n");
    expect((await import("node:fs/promises")).readdir(occupied).then((entries) => entries.toSorted())).resolves.toEqual(["sentinel.txt"]);

    const project = path.join(temp, "project");
    run("node", [cli, "create", project], runner, { KEENKO_PACKAGE_SPEC: \`file:\${tarball}\` });
    run("bun", ["install", "--frozen-lockfile"], project);

    await writeFile(
      path.join(project, "tests/merge-gate.test.ts"),
      'import { test } from "bun:test";\\nimport { writeFileSync } from "node:fs";\\n\\ntest("merge gate runs tests", () => {\\n  writeFileSync(".merge-gate-test-ran", "yes\\\\n");\\n});\\n'
    );
    run("bun", ["run", "format"], project);
    run("bun", ["run", "check"], project);
    expect(await readFile(path.join(project, ".merge-gate-test-ran"), "utf-8")).toBe("yes\\n");
    await rm(path.join(project, ".merge-gate-test-ran"));

    const agents = await readFile(path.join(project, "AGENTS.md"), "utf-8");
    await writeFile(path.join(project, "AGENTS.md"), agents.replace("<!-- keenko:start -->", "<!-- keenko:broken -->"));
    expect(runFailure("node", [path.join(project, "node_modules/keenko/dist/cli/keenko.js"), "check", "--guidance"], project)).toContain("managed block");
    await writeFile(path.join(project, "AGENTS.md"), agents);

    const routeTree = path.join(project, "apps/web/src/routeTree.gen.ts");
    const routeTreeSource = await readFile(routeTree, "utf-8");
    await writeFile(routeTree, \`\${routeTreeSource}\\n// stale fixture\\n\`);
    expect(runFailure("bun", ["run", "codegen:check"], project)).toContain("Generated source has drifted");
    await writeFile(routeTree, routeTreeSource);

    run("bun", ["run", "ui", "--", "button", "-y"], project);
    expect(await exists(path.join(project, "packages/ui/src/components/button.tsx"))).toBe(true);
    expect(await exists(path.join(project, "apps/web/src/components/button.tsx"))).toBe(false);
    run("bun", ["run", "format"], project);
    run("bun", ["run", "check"], project);

    gitCommitAll(project, "baseline");
    const statusBeforeNoop = runOut("git", ["status", "--porcelain"], project);
    run("node", [path.join(project, "node_modules/keenko/dist/cli/keenko.js"), "upgrade", currentVersion], project);
    expect(runOut("git", ["status", "--porcelain"], project)).toBe(statusBeforeNoop);

    const baselineA = path.join(temp, "baseline-a");
    await makeBaseline(project, baselineA, "0.0.1", OLDEST_CHECK, "1.80.0");
    const lockBefore = await readFile(path.join(baselineA, "bun.lock"));
    run("node", [cli, "upgrade", \`keenko@file:\${tarball}\`], baselineA);
    expect(await readFile(path.join(baselineA, "bun.lock"))).not.toEqual(lockBefore);
    await assertUpgraded(baselineA);

    const baselineB = path.join(temp, "baseline-b");
    await makeBaseline(project, baselineB, "0.0.2", FIRST_PASS_CHECK, "1.81.0");
    run("node", [cli, "upgrade", \`keenko@file:\${tarball}\`], baselineB);
    await assertUpgraded(baselineB);
    gitCommitAll(baselineB, "upgrade to current");

    const guidanceTarget = await versionedTarball(tarball, path.join(temp, "guidance-target.tgz"), nextPatch(currentVersion));
    const targetExtract = path.join(temp, "target-extract");
    await mkdir(targetExtract);
    run("tar", ["-xzf", guidanceTarget, "-C", targetExtract], temp);
    const guidanceFile = path.join(targetExtract, "package/docs/core/verification.md");
    await writeFile(guidanceFile, \`\${await readFile(guidanceFile, "utf-8")}\\nGuidance-only packed fixture marker.\\n\`);
    run("tar", ["-czf", guidanceTarget, "-C", targetExtract, "package"], temp);
    const contextBefore = await readFile(path.join(baselineB, "CONTEXT.md"), "utf-8");
    run("node", [path.join(baselineB, "node_modules/keenko/dist/cli/keenko.js"), "upgrade", \`keenko@file:\${guidanceTarget}\`], baselineB);
    expect(await readFile(path.join(baselineB, ".keenko/docs/core/verification.md"), "utf-8")).toContain("Guidance-only packed fixture marker.");
    expect(await readFile(path.join(baselineB, "CONTEXT.md"), "utf-8")).toBe(contextBefore);
    expect(await exists(path.join(baselineB, "migrations.json"))).toBe(false);
    run("bun", ["install", "--frozen-lockfile"], baselineB);
    run("bun", ["run", "check"], baselineB);
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
}, 240_000);

async function makeBaseline(source: string, target: string, installedVersion: string, check: string, oxlint: string) {
  await cp(source, target, {
    recursive: true,
    filter: (entry) => {
      const relative = path.relative(source, entry).replaceAll("\\\\", "/");
      const first = relative.split("/")[0];
      return ![".git", ".nx", "node_modules"].includes(first ?? "");
    },
  });
  const pkgPath = path.join(target, "package.json");
  const pkg = json(await readFile(pkgPath, "utf-8"));
  const scripts = record(pkg.scripts, "baseline scripts");
  scripts.check = check;
  scripts["codegen:check"] = check === FIRST_PASS_CHECK ? "keenko check --guidance" : undefined;
  deleteUndefined(scripts);
  pkg.scripts = scripts;
  const devDependencies = record(pkg.devDependencies, "baseline devDependencies");
  devDependencies.oxlint = oxlint;
  pkg.devDependencies = devDependencies;
  await writeFile(pkgPath, \`\${JSON.stringify(pkg, null, 2)}\\n\`);
  await writeFile(path.join(target, "CONTEXT.md"), "# Project context\\n\\nPreserve this project-owned baseline customization.\\n");
  run("bun", ["install"], target);
  const installedPath = path.join(target, "node_modules/keenko/package.json");
  const installed = json(await readFile(installedPath, "utf-8"));
  installed.version = installedVersion;
  await writeFile(installedPath, \`\${JSON.stringify(installed, null, 2)}\\n\`);
  gitCommitAll(target, \`fixture \${installedVersion}\`);
}

async function assertUpgraded(project: string) {
  const pkg = json(await readFile(path.join(project, "package.json"), "utf-8"));
  expect(record(pkg.scripts, "upgraded scripts").check).toBe(CURRENT_CHECK);
  expect(record(pkg.devDependencies, "upgraded devDependencies").oxlint).toBe("1.81.0");
  expect(await readFile(path.join(project, "CONTEXT.md"), "utf-8")).toContain("Preserve this project-owned baseline customization.");
  expect(await exists(path.join(project, "packages/ui/src/components/button.tsx"))).toBe(true);
  run("bun", ["install", "--frozen-lockfile"], project);
  run("bun", ["run", "check"], project);
}

async function versionedTarball(source: string, target: string, version: string) {
  const unpack = await mkdtemp(path.join(path.dirname(target), "versioned-"));
  run("tar", ["-xzf", source, "-C", unpack], path.dirname(target));
  const packagePath = path.join(unpack, "package/package.json");
  const pkg = json(await readFile(packagePath, "utf-8"));
  pkg.version = version;
  await writeFile(packagePath, \`\${JSON.stringify(pkg, null, 2)}\\n\`);
  run("tar", ["-czf", target, "-C", unpack, "package"], path.dirname(target));
  await rm(unpack, { force: true, recursive: true });
  return target;
}

function nextPatch(version: string) {
  const match = /^(?<major>\\d+)\\.(?<minor>\\d+)\\.(?<patch>\\d+)$/u.exec(version);
  if (match?.groups === undefined) throw new Error(\`Expected stable package version, found \${version}\`);
  return \`\${match.groups.major}.\${match.groups.minor}.\${Number(match.groups.patch) + 1}\`;
}

function gitCommitAll(cwd: string, message: string) {
  if (!existsSyncSync(path.join(cwd, ".git"))) run("git", ["init", "--quiet"], cwd);
  run("git", ["config", "user.name", "Keenko fixture"], cwd);
  run("git", ["config", "user.email", "fixture@keenko.invalid"], cwd);
  run("git", ["add", "-A"], cwd);
  run("git", ["commit", "--quiet", "-m", message, "--allow-empty"], cwd);
}

function run(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  execFileSync(command, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: "inherit" });
}

function runOut(command: string, args: string[], cwd: string) {
  return execFileSync(command, args, { cwd, encoding: "utf-8" });
}

function runFailure(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: "utf-8" });
  if (result.status === 0) throw new Error(\`Expected \${command} \${args.join(" ")} to fail\`);
  return \`\${result.stdout ?? ""}\\n\${result.stderr ?? ""}\`;
}

async function exists(target: string) {
  return (await stat(target).catch(() => null)) !== null;
}

function existsSyncSync(target: string) {
  try {
    execFileSync("test", ["-e", target]);
    return true;
  } catch {
    return false;
  }
}

function json(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  return record(value, "JSON object");
}

function record(value: unknown, label: string): Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(\`\${label} must be an object\`);
  return value as Record<string, any>;
}

function string(value: unknown, label: string) {
  if (typeof value !== "string") throw new TypeError(\`\${label} must be a string\`);
  return value;
}

function deleteUndefined(value: Record<string, any>) {
  for (const [key, entry] of Object.entries(value)) if (entry === undefined) delete value[key];
}
`
  );
}

async function replace(file: string, oldText: string, newText: string) {
  const current = await read(file);
  const count = current.split(oldText).length - 1;
  if (count !== 1) throw new Error(`Expected one match in ${file}, found ${count}`);
  await write(file, current.replace(oldText, newText));
}

async function updateJson(file: string, mutate: (value: Record<string, any>) => void) {
  const value = record(JSON.parse(await read(file)), file);
  mutate(value);
  await write(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function read(file: string) {
  return await readFile(path.join(ROOT, file), "utf-8");
}

async function write(file: string, content: string) {
  await writeFile(path.join(ROOT, file), content);
}

function record(value: unknown, label: string): Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, any>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}
