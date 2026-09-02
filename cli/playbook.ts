#!/usr/bin/env bun
/* oxlint-disable eslint/no-await-in-loop -- This CLI intentionally performs dependency traversal, staged filesystem updates, and rollback steps sequentially. */
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_ROOT = path.resolve(import.meta.dirname, "..");
const START = "<!-- keenko-playbook:start -->";
const END = "<!-- keenko-playbook:end -->";
const GENERATED_MARKER = ".keenko-generated";
const CONFIG_SCHEMA_VERSION = 1;
const LOCK_SCHEMA_VERSION = 1;

type JsonObject = Record<string, unknown>;
type Hashes = Record<string, string>;
interface ModuleManifest {
  name: string;
  requires: string[];
  skills: string[];
  incompatibleWith: string[];
  uiSurface: boolean;
}
type ProjectScaffoldEntry = [destination: string, template: string];
interface ExternalSkill {
  source: string;
  repository: string;
  commit: string;
  install: string;
  enabled: string[];
}
interface Preset {
  name: string;
  modules: string[];
  ownedSkills: string[];
  vendorSkills: Record<string, string[]>;
  externalSkills: Record<string, ExternalSkill>;
  integrations: Record<string, boolean>;
}
interface InstalledConfig {
  schemaVersion: 1;
  version: string;
  preset: string;
  modules: string[];
  skills: string[];
  externalSkills: Record<string, ExternalSkill>;
  integrations: Record<string, boolean>;
}
interface InstalledLock {
  schemaVersion: 1;
  playbookFiles: Hashes;
  generatedSkills: string[];
  managedBlocks: Record<string, string>;
}
interface VendorSource {
  id: string;
  repository: string;
  upstreamRef: string;
  commit: string | null;
  tree: string;
  rootPath: string;
  mode: "vendor" | "external";
  license: string | null;
  includes: string[];
}
interface VendorManifest {
  schemaVersion: 1;
  sources: VendorSource[];
}
interface VendorProvenance {
  repository: string;
  commit: string;
  tree: string;
  license: string;
  files: Hashes;
}
interface VendoredSkill {
  dir: string;
  source: VendorSource;
  description: string;
}
interface CliArgs {
  command: string;
  flags: Map<string, string | boolean>;
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h", ""].includes(command)) {
    printHelp();
    return;
  }
  if (command === "install") {
    await install(flags);
    return;
  }
  if (command === "update") {
    await update(flags);
    return;
  }
  if (command === "check") {
    await check(flags);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

function parseArgs(args: string[]): CliArgs {
  const [command = "", ...rest] = args;
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i];
    if (!item?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${item}`);
    }
    const name = item.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(name, next);
      i++;
    } else {
      flags.set(name, true);
    }
  }
  return { command, flags };
}

function flagString(flags: Map<string, string | boolean>, name: string, fallback?: string) {
  const value = flags.get(name);
  if (typeof value === "string") {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing --${name}`);
}

function printHelp() {
  console.log(
    `Keenko Playbook\n\n` +
      `  playbook install [--target .] [--preset effect-convex-web]\n` +
      `  playbook update [--target .] [--apply]\n` +
      `  playbook check [--target .]\n` +
      `  playbook check --source [--release]\n`
  );
}

async function packageVersion() {
  const pkg = asObject(await readJson(path.join(SOURCE_ROOT, "package.json")), "package.json");
  return asString(pkg.version, "package.json.version");
}

async function loadPreset(name: string): Promise<Preset> {
  const value = asObject(await readJson(path.join(SOURCE_ROOT, "presets", `${name}.json`)), `preset ${name}`);
  assertKeys(value, ["name", "modules", "ownedSkills", "vendorSkills", "externalSkills", "integrations"], `preset ${name}`);
  const presetName = asString(value.name, `preset ${name}.name`);
  if (presetName !== name) {
    throw new Error(`Preset name mismatch: expected ${name}, got ${presetName}`);
  }
  return {
    externalSkills: parseExternalSkills(value.externalSkills, `${name}.externalSkills`),
    integrations: asBooleanRecord(value.integrations, `${name}.integrations`),
    modules: asStringArray(value.modules, `${name}.modules`),
    name,
    ownedSkills: asStringArray(value.ownedSkills, `${name}.ownedSkills`),
    vendorSkills: asStringArrayRecord(value.vendorSkills, `${name}.vendorSkills`),
  };
}

async function loadModule(name: string, stacksRoot = path.join(SOURCE_ROOT, "docs", "stacks")): Promise<ModuleManifest> {
  const path = path.join(stacksRoot, name, "module.json");
  const value = asObject(await readJson(path), `module ${name}`);
  assertKeys(value, ["name", "requires", "skills", "incompatibleWith", "uiSurface"], `module ${name}`);
  const moduleName = asString(value.name, `module ${name}.name`);
  if (moduleName !== name) {
    throw new Error(`Module manifest name mismatch for ${name}`);
  }
  if (value.uiSurface !== undefined && typeof value.uiSurface !== "boolean") {
    throw new Error(`${name}.uiSurface must be boolean`);
  }
  return {
    incompatibleWith: value.incompatibleWith === undefined ? [] : asStringArray(value.incompatibleWith, `${name}.incompatibleWith`),
    name,
    requires: asStringArray(value.requires, `${name}.requires`),
    skills: asStringArray(value.skills, `${name}.skills`),
    uiSurface: value.uiSurface ?? false,
  };
}

async function resolveModules(initial: string[]) {
  const ordered: ModuleManifest[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  async function visit(name: string) {
    if (visited.has(name)) {
      return;
    }
    if (visiting.has(name)) {
      throw new Error(`Module dependency cycle at ${name}`);
    }
    visiting.add(name);
    const module = await loadModule(name);
    for (const dep of module.requires) {
      await visit(dep);
    }
    visiting.delete(name);
    visited.add(name);
    ordered.push(module);
  }
  for (const name of unique(initial)) {
    await visit(name);
  }
  const enabled = new Set(ordered.map(({ name }) => name));
  for (const module of ordered) {
    for (const incompatible of module.incompatibleWith) {
      if (enabled.has(incompatible)) {
        throw new Error(`Incompatible modules enabled together: ${module.name} and ${incompatible}`);
      }
    }
  }
  return ordered;
}

function projectScaffoldEntries(modules: ModuleManifest[]): ProjectScaffoldEntry[] {
  const entries: ProjectScaffoldEntry[] = [
    ["CONTEXT.md", "project-context.md"],
    ["docs/project/architecture.md", "project-architecture.md"],
    ["docs/project/overrides.md", "project-overrides.md"],
  ];
  if (modules.some(({ uiSurface }) => uiSurface)) {
    entries.push(["docs/project/ui.md", "project-ui.md"]);
  }
  return entries;
}

async function install(flags: Map<string, string | boolean>) {
  const target = path.resolve(flagString(flags, "target", process.cwd()));
  const presetName = flagString(flags, "preset", "effect-convex-web");
  const configPath = path.join(target, ".playbook", "config.json");
  if (await exists(configPath)) {
    throw new Error(`Already installed: ${configPath}`);
  }
  await materialize(target, presetName);
  console.log(`Installed Keenko Playbook ${await packageVersion()} into ${target}`);
}

async function update(flags: Map<string, string | boolean>) {
  const target = path.resolve(flagString(flags, "target", process.cwd()));
  const config = parseInstalledConfig(await readJson(path.join(target, ".playbook", "config.json")));
  parseInstalledLock(await readJson(path.join(target, ".playbook", "lock.json")));
  const nextVersion = await packageVersion();
  const preset = await loadPreset(config.preset);
  const modules = await resolveModules(preset.modules);
  const nextModules = modules.map(({ name }) => name);
  const previousModuleList = config.modules.path.join(", ");
  const nextModuleList = nextModules.path.join(", ");
  console.log(`Keenko Playbook update preview`);
  console.log(`  version: ${config.version} -> ${nextVersion}`);
  console.log(`  preset:  ${config.preset}`);
  console.log(`  modules: ${previousModuleList === nextModuleList ? nextModuleList : `${previousModuleList} -> ${nextModuleList}`}`);
  if (!flags.has("apply")) {
    console.log(`No files changed. Run again with --apply to materialize this source version.`);
    return;
  }
  await materialize(target, config.preset);
  console.log(`Applied Keenko Playbook ${nextVersion}. Review the Git diff before committing.`);
}

async function materialize(target: string, presetName: string) {
  await mkdir(target, { recursive: true });
  const preset = await loadPreset(presetName);
  const modules = await resolveModules(preset.modules);
  const moduleNames = modules.map(({ name }) => name);
  const projectScaffold = projectScaffoldEntries(modules);
  const version = await packageVersion();
  const vendorIndex = await indexVendoredSkills(true);
  const skillNames = resolveSkillNames(preset, modules, vendorIndex);
  const managedBlocks = {
    "AGENTS.md": await readFile(path.join(SOURCE_ROOT, "templates", "AGENTS.managed.md"), "utf-8"),
    "CLAUDE.md": await readFile(path.join(SOURCE_ROOT, "templates", "CLAUDE.managed.md"), "utf-8"),
  };

  // Preflight everything that can fail due to consumer-owned state before writing live files.
  const nextManaged = new Map<string, string>();
  for (const [file, block] of Object.entries(managedBlocks)) {
    const path = path.join(target, file);
    const current = (await exists(path)) ? await readFile(path, "utf-8") : "";
    nextManaged.set(file, renderManagedFile(current, block, path));
  }
  await preflightManagedPaths(target, projectScaffold);
  for (const harness of [".agents", ".claude"]) {
    const root = path.join(target, harness, "skills");
    for (const name of skillNames) {
      const dir = path.join(root, name);
      if ((await exists(dir)) && !(await exists(path.join(dir, GENERATED_MARKER)))) {
        throw new Error(`Refusing to overwrite human-owned skill directory: ${dir}`);
      }
    }
  }

  const stageRoot = await mkdtemp(path.join(target, ".keenko-stage-"));
  try {
    const playbookStage = path.join(stageRoot, "playbook");
    await mkdir(playbookStage, { recursive: true });
    await cp(path.join(SOURCE_ROOT, "docs", "core"), path.join(playbookStage, "docs", "core"), { recursive: true });
    await mkdir(path.join(playbookStage, "docs", "stacks"), { recursive: true });
    for (const module of modules) {
      await cp(path.join(SOURCE_ROOT, "docs", "stacks", module.name), path.join(playbookStage, "docs", "stacks", module.name), {
        recursive: true,
      });
    }
    await cp(path.join(SOURCE_ROOT, "docs", "conventions"), path.join(playbookStage, "docs", "conventions"), { recursive: true });

    for (const name of preset.ownedSkills) {
      await cp(path.join(SOURCE_ROOT, "skills", name), path.join(playbookStage, "skills", name), { recursive: true });
    }
    for (const [sourceId, names] of Object.entries(preset.vendorSkills)) {
      for (const name of names) {
        const skill = vendorIndex.get(`${sourceId}:${name}`);
        if (!skill) {
          throw new Error(`Missing vendored skill ${sourceId}:${name}`);
        }
        await materializeVendorSkill(skill, name, skillNames, path.join(playbookStage, "skills", name));
      }
    }

    const vendorManifest = await loadVendorManifest();
    const externalSources = vendorManifest.sources.filter(({ mode }) => mode === "external");
    await writeJson(path.join(playbookStage, "external-sources.json"), { schemaVersion: 1, sources: externalSources });

    const config: InstalledConfig = {
      externalSkills: preset.externalSkills,
      integrations: preset.integrations,
      modules: moduleNames,
      preset: presetName,
      schemaVersion: CONFIG_SCHEMA_VERSION,
      skills: [...skillNames].toSorted(),
      version,
    };
    await writeJson(path.join(playbookStage, "config.json"), config);

    const nativeStage = path.join(stageRoot, "native");
    for (const harness of [".agents", ".claude"]) {
      for (const name of skillNames) {
        const dst = path.join(nativeStage, harness, "skills", name);
        await cp(path.join(playbookStage, "skills", name), dst, { recursive: true });
        await writeFile(path.join(dst, GENERATED_MARKER), "generated by keenko-playbook\n", "utf-8");
      }
    }

    const lock: InstalledLock = {
      generatedSkills: [...skillNames].toSorted(),
      managedBlocks: Object.fromEntries(Object.entries(managedBlocks).map(([file, block]) => [file, hash(block.trim())])),
      playbookFiles: await hashTree(playbookStage, new Set(["lock.json"])),
      schemaVersion: LOCK_SCHEMA_VERSION,
    };
    await writeJson(path.join(playbookStage, "lock.json"), lock);

    await applyMaterialization(target, stageRoot, nextManaged, skillNames, projectScaffold);
  } finally {
    await rm(stageRoot, { force: true, recursive: true });
  }
}

function resolveSkillNames(preset: Preset, modules: ModuleManifest[], vendorIndex: Map<string, VendoredSkill>, allowMissingVendor = false) {
  const selected = new Set<string>();
  for (const name of preset.ownedSkills) {
    if (selected.has(name)) {
      throw new Error(`Duplicate selected skill: ${name}`);
    }
    selected.add(name);
  }
  for (const [source, names] of Object.entries(preset.vendorSkills)) {
    for (const name of names) {
      if (selected.has(name)) {
        throw new Error(`Duplicate selected skill name across sources: ${name}`);
      }
      if (!vendorIndex.has(`${source}:${name}`) && !allowMissingVendor) {
        throw new Error(`Missing vendored skill ${source}:${name}. Run 'bun run vendor:sync' before installing/releasing.`);
      }
      selected.add(name);
    }
  }
  const required = unique(modules.flatMap(({ skills }) => skills));
  for (const name of required) {
    if (!selected.has(name)) {
      throw new Error(`Enabled module requires skill '${name}', but the preset does not select it`);
    }
  }
  return [...selected].toSorted();
}

async function materializeVendorSkill(skill: VendoredSkill, name: string, availableSkills: string[], dst: string) {
  await mkdir(dst, { recursive: true });
  const wrapper = renderVendorSkillAdapter(name, skill.description, availableSkills);
  await writeFile(path.join(dst, "SKILL.md"), wrapper, "utf-8");
  await cp(skill.dir, path.join(dst, "references", "upstream"), { recursive: true });
  const sourceRoot = path.join(SOURCE_ROOT, "vendor", skill.source.id);
  await cp(path.join(sourceRoot, "LICENSE"), path.join(dst, "UPSTREAM_LICENSE"));
  await cp(path.join(sourceRoot, "VENDORED.json"), path.join(dst, "UPSTREAM_PROVENANCE.json"));
}

function renderVendorSkillAdapter(name: string, description: string, availableSkills: string[]) {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description.length > 0 ? description : `Keenko-adapted upstream ${name} workflow.`)}\n---\n\n# Keenko adapter for ${name}\n\nThis skill exposes a pinned upstream workflow through Keenko's authority and safety boundaries.\n\n## Authority guard\n\n1. Current explicit human instruction, project ADR/override, project-local docs, Keenko core, and enabled stack modules outrank the upstream reference.\n2. Do not commit, push, merge, install dependencies/tools, alter package-manager state, or perform external/destructive actions unless the current task explicitly delegates that action.\n3. Bun is the canonical package manager unless the project explicitly documents a compatibility exception. Ignore upstream commands that would introduce a competing lockfile.\n4. Do not edit the Keenko-managed blocks in AGENTS.md or CLAUDE.md directly and do not duplicate canonical conventions into harness files.\n5. Only route to skills that are actually installed. Upstream references to unavailable setup/router skills are advisory, not prerequisites. Use the repository's configured tracker/connectors and canonical docs instead.\n6. If an upstream instruction conflicts with a higher-authority rule, follow the higher-authority rule and continue with the nearest safe equivalent workflow.\n\nInstalled skill set for this snapshot:\n${availableSkills.map((skillName) => `- ${skillName}`).path.join("\n")}\n\n## Procedure\n\nRead \`references/upstream/SKILL.md\` and apply its procedural guidance subject to the authority guard above. Supporting upstream files are under \`references/upstream/\`. Preserve the upstream notice and provenance files shipped beside this adapter.\n`;
}

async function preflightManagedPaths(target: string, projectScaffold: ProjectScaffoldEntry[]) {
  for (const rel of [".playbook", "docs", "docs/project", ".agents", ".agents/skills", ".claude", ".claude/skills"]) {
    const path = path.join(target, rel);
    if (!(await exists(path))) {
      continue;
    }
    if (!(await stat(path)).isDirectory()) {
      throw new Error(`Managed parent must be a directory: ${path}`);
    }
  }
  for (const [rel] of projectScaffold) {
    const path = path.join(target, rel);
    if (!(await exists(path))) {
      continue;
    }
    if (!(await stat(path)).isFile()) {
      throw new Error(`Managed scaffold path must be a file: ${path}`);
    }
  }
}

async function applyMaterialization(
  target: string,
  stageRoot: string,
  managed: Map<string, string>,
  skillNames: string[],
  projectScaffold: ProjectScaffoldEntry[]
) {
  const rollbackRoot = await mkdtemp(path.join(target, ".keenko-rollback-"));
  const tracked = [".playbook", ".agents/skills", ".claude/skills", "AGENTS.md", "CLAUDE.md", "CONTEXT.md", "docs/project"];
  const existed = new Map<string, boolean>();
  try {
    for (const rel of tracked) {
      const src = path.join(target, rel);
      const present = await exists(src);
      existed.set(rel, present);
      if (present) {
        await cp(src, path.join(rollbackRoot, rel), { recursive: true });
      }
    }

    await rm(path.join(target, ".playbook"), { force: true, recursive: true });
    await cp(path.join(stageRoot, "playbook"), path.join(target, ".playbook"), { recursive: true });

    await ensureProjectScaffold(target, projectScaffold);
    for (const [file, text] of managed) {
      await writeFile(path.join(target, file), text, "utf-8");
    }

    for (const harness of [".agents", ".claude"]) {
      const root = path.join(target, harness, "skills");
      await mkdir(root, { recursive: true });
      for (const name of await generatedSkillNames(root)) {
        await rm(path.join(root, name), { recursive: true, force: true });
      }
      for (const name of skillNames) {
        await cp(path.join(stageRoot, "native", harness, "skills", name), path.join(root, name), { recursive: true });
      }
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const rel of [...tracked].toReversed()) {
      try {
        const dst = path.join(target, rel);
        await rm(dst, { force: true, recursive: true });
        if (existed.get(rel)) {
          await cp(path.join(rollbackRoot, rel), dst, { recursive: true });
        }
      } catch (rollbackError) {
        rollbackErrors.push(`${rel}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
    if (rollbackErrors.length) {
      console.error(`Rollback encountered cleanup errors: ${rollbackErrors.path.join("; ")}`);
    }
    throw error;
  } finally {
    await rm(rollbackRoot, { force: true, recursive: true });
  }
}

async function ensureProjectScaffold(target: string, entries: ProjectScaffoldEntry[]) {
  for (const [destination, template] of entries) {
    const path = path.join(target, destination);
    if (await exists(path)) {
      continue;
    }
    await mkdir(path.dirname(path), { recursive: true });
    await cp(path.join(SOURCE_ROOT, "templates", template), path);
  }
}

function renderManagedFile(current: string, block: string, path: string) {
  const starts = indexesOf(current, START);
  const ends = indexesOf(current, END);
  if (starts.length !== ends.length || starts.length > 1) {
    throw new Error(`Broken or duplicated Keenko managed block in ${path}`);
  }
  const canonical = block.trim();
  if (!starts.length) {
    return current.trimEnd() ? `${current.trimEnd()}\n\n${canonical}\n` : `${canonical}\n`;
  }
  const start = starts[0];
  const end = ends[0];
  if (end < start) {
    throw new Error(`Broken Keenko managed block in ${path}`);
  }
  const prefix = current.slice(0, start).trimEnd();
  const suffix = current.slice(end + END.length).trimStart();
  return `${[prefix, canonical, suffix].filter(Boolean).path.join("\n\n")}\n`;
}

function managedBlock(text: string, path: string) {
  const starts = indexesOf(text, START);
  const ends = indexesOf(text, END);
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) {
    throw new Error(`Expected exactly one valid Keenko managed block in ${path}`);
  }
  return text.slice(starts[0], ends[0] + END.length).trim();
}

function indexesOf(text: string, token: string) {
  const out: number[] = [];
  let offset = 0;
  while (true) {
    const index = text.indexOf(token, offset);
    if (index === -1) {
      return out;
    }
    out.push(index);
    offset = index + token.length;
  }
}

async function generatedSkillNames(root: string) {
  const out: string[] = [];
  if (!(await exists(root))) {
    return out;
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && (await exists(path.join(root, entry.name, GENERATED_MARKER)))) {
      out.push(entry.name);
    }
  }
  return out.toSorted();
}

async function indexVendoredSkills(requireValidSnapshots: boolean) {
  const index = new Map<string, VendoredSkill>();
  for (const name of await findOwnedSkills()) {
    index.set(`owned:${name}`, { dir: path.join(SOURCE_ROOT, "skills", name), source: null as never, description: "" });
  }
  const manifest = await loadVendorManifest();
  for (const source of manifest.sources) {
    if (source.mode !== "vendor") {
      continue;
    }
    if (requireValidSnapshots) {
      await validateVendorSnapshot(source);
    }
    const root = path.join(SOURCE_ROOT, "vendor", source.id);
    if (!(await exists(root))) {
      continue;
    }
    for (const skillFile of await findFiles(root, "SKILL.md")) {
      const text = await readFile(skillFile, "utf-8");
      const name = frontmatterValue(text, "name");
      if (!name) {
        continue;
      }
      index.set(`${source.id}:${name}`, {
        description: frontmatterValue(text, "description") ?? `Upstream ${name} workflow.`,
        dir: path.dirname(skillFile),
        source,
      });
    }
  }
  return index;
}

async function findOwnedSkills() {
  const out: string[] = [];
  const root = path.join(SOURCE_ROOT, "skills");
  if (!(await exists(root))) {
    return out;
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && (await exists(path.join(root, entry.name, "SKILL.md")))) {
      out.push(entry.name);
    }
  }
  return out;
}

function frontmatterValue(text: string, key: string): string | null {
  const match = new RegExp(`^${key}:\\s*(.+)$`, "mu").exec(text);
  if (!match) {
    return null;
  }
  const [, matched = ""] = match;
  const raw = matched.trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : raw.slice(1, -1);
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

async function check(flags: Map<string, string | boolean>) {
  if (flags.has("source")) {
    await checkSource(flags.has("release"));
    return;
  }
  await checkConsumer(path.resolve(flagString(flags, "target", process.cwd())));
}

async function checkSource(release: boolean) {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const required of [
    "templates/project-context.md",
    "templates/project-ui.md",
    "docs/conventions/backend-architecture.md",
    "docs/conventions/frontend.md",
    "docs/conventions/i18n.md",
    "docs/conventions/migrations.md",
    "docs/conventions/schema-types.md",
    "docs/conventions/validation.md",
  ]) {
    if (!(await exists(path.join(SOURCE_ROOT, required)))) errors.push(`Missing canonical source file: ${required}`);
  }

  let vendorIndex = new Map<string, VendoredSkill>();
  try {
    vendorIndex = await indexVendoredSkills(release);
  } catch (error) {
    errors.push(String(error));
  }

  for (const file of await findFiles(path.join(SOURCE_ROOT, "presets"), ".json")) {
    try {
      const preset = await loadPreset(path.basename(file, ".json"));
      const modules = await resolveModules(preset.modules);
      resolveSkillNames(preset, modules, vendorIndex, !release);
      for (const name of preset.ownedSkills) {
        if (!(await exists(path.join(SOURCE_ROOT, "skills", name, "SKILL.md")))) {
          errors.push(`Missing owned skill ${name}`);
        }
      }
    } catch (error) {
      errors.push(`${path.relative(SOURCE_ROOT, file)}: ${errorMessage(error)}`);
    }
  }

  for (const skill of await findFiles(path.join(SOURCE_ROOT, "skills"), "SKILL.md")) {
    const text = await readFile(skill, "utf-8");
    if (!frontmatterValue(text, "name")) {
      errors.push(`Invalid skill frontmatter: ${path.relative(SOURCE_ROOT, skill)}`);
    }
  }

  let manifest: VendorManifest | null = null;
  try {
    manifest = await loadVendorManifest();
  } catch (error: unknown) {
    errors.push(errorMessage(error));
  }
  if (manifest !== null) {
    for (const source of manifest.sources) {
      if (source.mode !== "vendor") {
        continue;
      }
      try {
        await validateVendorSnapshot(source);
      } catch (error) {
        const message = errorMessage(error);
        if (release) {
          errors.push(message);
        } else {
          warnings.push(message);
        }
      }
    }
  }

  report(errors, warnings);
}

async function checkConsumer(target: string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const playbookRoot = path.join(target, ".playbook");
  let config: InstalledConfig;
  let lock: InstalledLock;
  try {
    config = parseInstalledConfig(await readJson(path.join(playbookRoot, "config.json")));
    lock = parseInstalledLock(await readJson(path.join(playbookRoot, "lock.json")));
  } catch (error) {
    report([errorMessage(error)], warnings);
    return;
  }

  const currentFiles = await hashTree(playbookRoot, new Set(["lock.json"]));
  if (!same(currentFiles, lock.playbookFiles)) {
    errors.push(`.playbook snapshot differs from lock; do not edit generated playbook files directly`);
  }
  if (!same([...config.skills].toSorted(), [...lock.generatedSkills].toSorted())) {
    errors.push(`config.skills differs from lock.generatedSkills`);
  }

  let projectScaffold = projectScaffoldEntries([]);
  try {
    const stacksRoot = path.join(playbookRoot, "docs", "stacks");
    const modules: ModuleManifest[] = [];
    for (const name of config.modules) {
      modules.push(await loadModule(name, stacksRoot));
    }
    projectScaffold = projectScaffoldEntries(modules);
  } catch (error) {
    errors.push(errorMessage(error));
  }

  for (const harness of [".agents", ".claude"]) {
    const root = path.join(target, harness, "skills");
    const actualGenerated = await generatedSkillNames(root);
    if (!same(actualGenerated, [...lock.generatedSkills].toSorted())) {
      errors.push(`Generated skill set drift: ${harness}/skills`);
    }
    for (const name of lock.generatedSkills) {
      const dir = path.join(root, name);
      if (!(await exists(path.join(dir, GENERATED_MARKER)))) {
        errors.push(`Missing generated marker: ${path.relative(target, dir)}`);
        continue;
      }
      const generated = await hashTree(dir, new Set([GENERATED_MARKER]));
      const canonical = await hashTree(path.join(playbookRoot, "skills", name), new Set());
      if (!same(generated, canonical)) {
        errors.push(`Generated skill drift: ${harness}/skills/${name}`);
      }
    }
  }

  for (const file of ["AGENTS.md", "CLAUDE.md"]) {
    try {
      const block = managedBlock(await readFile(path.join(target, file), "utf-8"), file);
      if (hash(block) !== lock.managedBlocks[file]) {
        errors.push(`Keenko managed block drift: ${file}`);
      }
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  for (const [file] of projectScaffold) {
    if (!(await exists(path.join(target, file)))) {
      errors.push(`Missing project scaffold: ${file}`);
    }
  }

  if (config.integrations.tanstackIntent) {
    warnings.push(
      `TanStack Intent availability is runtime/package-version dependent; verify it against the consuming project's installed TanStack versions.`
    );
  }
  for (const [name, external] of Object.entries(config.externalSkills)) {
    warnings.push(
      `External skill '${name}' is not managed by Keenko; follow its recorded install contract only with explicit user approval: ${external.repository}@${external.commit}`
    );
  }
  report(errors, warnings);
}

async function validateVendorSnapshot(source: VendorSource) {
  if (!source.commit) {
    throw new Error(`Vendor source ${source.id} has no pinned commit`);
  }
  if (!source.license) {
    throw new Error(`Vendor source ${source.id} has no redistributable license`);
  }
  const root = path.join(SOURCE_ROOT, "vendor", source.id);
  if (!(await exists(root))) {
    throw new Error(`Missing vendor snapshot ${source.id}; run bun run vendor:sync`);
  }
  if (!(await exists(path.join(root, "LICENSE")))) {
    throw new Error(`Missing vendor license ${source.id}/LICENSE`);
  }
  const provenance = parseVendorProvenance(await readJson(path.join(root, "VENDORED.json")), source.id);
  if (
    provenance.repository !== source.repository ||
    provenance.commit !== source.commit ||
    provenance.tree !== source.tree ||
    provenance.license !== source.license
  ) {
    throw new Error(`Vendor provenance drift for ${source.id}`);
  }
  const actual = await hashTree(root, new Set(["VENDORED.json"]));
  if (!same(actual, provenance.files)) {
    throw new Error(`Vendor file drift for ${source.id}; run bun run vendor:sync and review the diff`);
  }
}

async function loadVendorManifest(): Promise<VendorManifest> {
  const value = asObject(await readJson(path.join(SOURCE_ROOT, "vendor", "sources.json")), "vendor/sources.json");
  assertKeys(value, ["schemaVersion", "sources"], "vendor/sources.json");
  if (value.schemaVersion !== 1) {
    throw new Error(`Unsupported vendor manifest schemaVersion: ${String(value.schemaVersion)}`);
  }
  if (!Array.isArray(value.sources)) {
    throw new Error(`vendor/sources.json.sources must be an array`);
  }
  return { schemaVersion: 1, sources: value.sources.map(parseVendorSource) };
}

function parseVendorSource(value: unknown, index: number): VendorSource {
  const source = asObject(value, `vendor source ${index}`);
  assertKeys(
    source,
    ["id", "repository", "upstreamRef", "commit", "tree", "rootPath", "mode", "license", "includes"],
    `vendor source ${index}`
  );
  const mode = asString(source.mode, `vendor source ${index}.mode`);
  if (mode !== "vendor" && mode !== "external") {
    throw new Error(`Invalid vendor mode: ${mode}`);
  }
  return {
    commit: source.commit === null ? null : asString(source.commit, `vendor source ${index}.commit`),
    id: asString(source.id, `vendor source ${index}.id`),
    includes: asStringArray(source.includes, `vendor source ${index}.includes`),
    license: source.license === null ? null : asString(source.license, `vendor source ${index}.license`),
    mode,
    repository: asString(source.repository, `vendor source ${index}.repository`),
    rootPath: asStringAllowEmpty(source.rootPath, `vendor source ${index}.rootPath`),
    tree: asString(source.tree, `vendor source ${index}.tree`),
    upstreamRef: asString(source.upstreamRef, `vendor source ${index}.upstreamRef`),
  };
}

function parseVendorProvenance(value: unknown, id: string): VendorProvenance {
  const item = asObject(value, `${id}/VENDORED.json`);
  assertKeys(item, ["repository", "commit", "tree", "license", "files"], `${id}/VENDORED.json`);
  return {
    commit: asString(item.commit, `${id}.commit`),
    files: asStringRecord(item.files, `${id}.files`),
    license: asString(item.license, `${id}.license`),
    repository: asString(item.repository, `${id}.repository`),
    tree: asString(item.tree, `${id}.tree`),
  };
}

function parseInstalledConfig(value: unknown): InstalledConfig {
  const item = asObject(value, ".playbook/config.json");
  assertKeys(item, ["schemaVersion", "version", "preset", "modules", "skills", "externalSkills", "integrations"], ".playbook/config.json");
  if (item.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw new Error(`Unsupported .playbook config schemaVersion: ${String(item.schemaVersion)}`);
  }
  return {
    externalSkills: parseExternalSkills(item.externalSkills, "config.externalSkills"),
    integrations: asBooleanRecord(item.integrations, "config.integrations"),
    modules: asStringArray(item.modules, "config.modules"),
    preset: asString(item.preset, "config.preset"),
    schemaVersion: 1,
    skills: asStringArray(item.skills, "config.skills"),
    version: asString(item.version, "config.version"),
  };
}

function parseInstalledLock(value: unknown): InstalledLock {
  const item = asObject(value, ".playbook/lock.json");
  assertKeys(item, ["schemaVersion", "playbookFiles", "generatedSkills", "managedBlocks"], ".playbook/lock.json");
  if (item.schemaVersion !== LOCK_SCHEMA_VERSION) {
    throw new Error(`Unsupported .playbook lock schemaVersion: ${String(item.schemaVersion)}`);
  }
  return {
    generatedSkills: asStringArray(item.generatedSkills, "lock.generatedSkills"),
    managedBlocks: asStringRecord(item.managedBlocks, "lock.managedBlocks"),
    playbookFiles: asStringRecord(item.playbookFiles, "lock.playbookFiles"),
    schemaVersion: 1,
  };
}

function parseExternalSkills(value: unknown, label: string) {
  const record = asObject(value ?? {}, label);
  const out: Record<string, ExternalSkill> = {};
  for (const [name, raw] of Object.entries(record)) {
    const item = asObject(raw, `${label}.${name}`);
    assertKeys(item, ["source", "repository", "commit", "install", "enabled"], `${label}.${name}`);
    out[name] = {
      commit: asString(item.commit, `${label}.${name}.commit`),
      enabled: asStringArray(item.enabled, `${label}.${name}.enabled`),
      install: asString(item.install, `${label}.${name}.install`),
      repository: asString(item.repository, `${label}.${name}.repository`),
      source: asString(item.source, `${label}.${name}.source`),
    };
  }
  return out;
}

async function hashTree(root: string, ignore: Set<string>) {
  const out: Hashes = {};
  if (!(await exists(root))) {
    return out;
  }
  for (const file of await findAllFiles(root)) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    if (ignore.has(rel)) {
      continue;
    }
    out[rel] = hash(await readFile(file));
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function hash(data: string | Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

async function findFiles(root: string, suffix: string) {
  const files = await findAllFiles(root);
  return files.filter((filePath) => filePath.endsWith(suffix));
}

async function findAllFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  if (!(await exists(root))) {
    return out;
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findAllFiles(path)));
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
  return out.toSorted();
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf-8"));
}

async function writeJson(path: string, value: unknown) {
  await mkdir(path.dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function asString(value: unknown, label: string) {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function asStringAllowEmpty(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function asStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  const out = value as string[];
  if (new Set(out).size !== out.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return out;
}

function asStringRecord(value: unknown, label: string) {
  const record = asObject(value, label);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    out[key] = asString(item, `${label}.${key}`);
  }
  return out;
}

function asStringArrayRecord(value: unknown, label: string) {
  const record = asObject(value ?? {}, label);
  const out: Record<string, string[]> = {};
  for (const [key, item] of Object.entries(record)) {
    out[key] = asStringArray(item, `${label}.${key}`);
  }
  return out;
}

function asBooleanRecord(value: unknown, label: string) {
  const record = asObject(value ?? {}, label);
  const out: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== "boolean") {
      throw new TypeError(`${label}.${key} must be boolean`);
    }
    out[key] = item;
  }
  return out;
}

function assertKeys(value: JsonObject, allowed: string[], label: string) {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length) {
    throw new Error(`${label} has unknown field(s): ${extra.path.join(", ")}`);
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function report(errors: string[], warnings: string[]) {
  for (const warning of warnings) {
    console.warn(`WARN: ${warning}`);
  }
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Keenko Playbook check passed${warnings.length > 0 ? ` with ${warnings.length} warning(s)` : ""}.`);
}

try {
  await main();
} catch (error: unknown) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
