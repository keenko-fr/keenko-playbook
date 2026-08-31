#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const START = "<!-- keenko-playbook:start -->";
const END = "<!-- keenko-playbook:end -->";
const GENERATED_MARKER = ".keenko-generated";
const CONFIG_SCHEMA_VERSION = 1;
const LOCK_SCHEMA_VERSION = 1;

type JsonObject = Record<string, unknown>;
type Hashes = Record<string, string>;
type ModuleManifest = {
  name: string;
  requires: string[];
  skills: string[];
  incompatibleWith: string[];
};
type ExternalSkill = {
  source: string;
  repository: string;
  commit: string;
  install: string;
  enabled: string[];
};
type Preset = {
  name: string;
  modules: string[];
  ownedSkills: string[];
  vendorSkills: Record<string, string[]>;
  externalSkills: Record<string, ExternalSkill>;
  integrations: Record<string, boolean>;
};
type InstalledConfig = {
  schemaVersion: 1;
  version: string;
  preset: string;
  modules: string[];
  skills: string[];
  externalSkills: Record<string, ExternalSkill>;
  integrations: Record<string, boolean>;
};
type InstalledLock = {
  schemaVersion: 1;
  playbookFiles: Hashes;
  generatedSkills: string[];
  managedBlocks: Record<string, string>;
};
type VendorSource = {
  id: string;
  repository: string;
  upstreamRef: string;
  commit: string | null;
  tree: string;
  rootPath: string;
  mode: "vendor" | "external";
  license: string | null;
  includes: string[];
};
type VendorManifest = { schemaVersion: 1; sources: VendorSource[] };
type VendorProvenance = {
  repository: string;
  commit: string;
  tree: string;
  license: string;
  files: Hashes;
};
type VendoredSkill = { dir: string; source: VendorSource; description: string };
type CliArgs = { command: string; flags: Map<string, string | boolean> };

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h", ""].includes(command)) return printHelp();
  if (command === "install") return install(flags);
  if (command === "update") return update(flags);
  if (command === "check") return check(flags);
  throw new Error(`Unknown command: ${command}`);
}

function parseArgs(args: string[]): CliArgs {
  const [command = "", ...rest] = args;
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i];
    if (!item?.startsWith("--")) throw new Error(`Unexpected argument: ${item}`);
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
  if (typeof value === "string") return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}`);
}

function printHelp() {
  console.log(
    `Keenko Playbook\n\n` +
    `  playbook install [--target .] [--preset effect-convex-web]\n` +
    `  playbook update [--target .] [--apply]\n` +
    `  playbook check [--target .]\n` +
    `  playbook check --source [--release]\n`,
  );
}

async function packageVersion() {
  const pkg = asObject(await readJson(join(SOURCE_ROOT, "package.json")), "package.json");
  return asString(pkg.version, "package.json.version");
}

async function loadPreset(name: string): Promise<Preset> {
  const value = asObject(await readJson(join(SOURCE_ROOT, "presets", `${name}.json`)), `preset ${name}`);
  assertKeys(value, ["name", "modules", "ownedSkills", "vendorSkills", "externalSkills", "integrations"], `preset ${name}`);
  const presetName = asString(value.name, `preset ${name}.name`);
  if (presetName !== name) throw new Error(`Preset name mismatch: expected ${name}, got ${presetName}`);
  return {
    name,
    modules: asStringArray(value.modules, `${name}.modules`),
    ownedSkills: asStringArray(value.ownedSkills, `${name}.ownedSkills`),
    vendorSkills: asStringArrayRecord(value.vendorSkills, `${name}.vendorSkills`),
    externalSkills: parseExternalSkills(value.externalSkills, `${name}.externalSkills`),
    integrations: asBooleanRecord(value.integrations, `${name}.integrations`),
  };
}

async function loadModule(name: string): Promise<ModuleManifest> {
  const path = join(SOURCE_ROOT, "docs", "stacks", name, "module.json");
  const value = asObject(await readJson(path), `module ${name}`);
  assertKeys(value, ["name", "requires", "skills", "incompatibleWith"], `module ${name}`);
  const moduleName = asString(value.name, `module ${name}.name`);
  if (moduleName !== name) throw new Error(`Module manifest name mismatch for ${name}`);
  return {
    name,
    requires: asStringArray(value.requires, `${name}.requires`),
    skills: asStringArray(value.skills, `${name}.skills`),
    incompatibleWith: value.incompatibleWith === undefined ? [] : asStringArray(value.incompatibleWith, `${name}.incompatibleWith`),
  };
}

async function resolveModules(initial: string[]) {
  const ordered: ModuleManifest[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  async function visit(name: string) {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Module dependency cycle at ${name}`);
    visiting.add(name);
    const module = await loadModule(name);
    for (const dep of module.requires) await visit(dep);
    visiting.delete(name);
    visited.add(name);
    ordered.push(module);
  }
  for (const name of unique(initial)) await visit(name);
  const enabled = new Set(ordered.map(({ name }) => name));
  for (const module of ordered) {
    for (const incompatible of module.incompatibleWith) {
      if (enabled.has(incompatible)) throw new Error(`Incompatible modules enabled together: ${module.name} and ${incompatible}`);
    }
  }
  return ordered;
}

async function install(flags: Map<string, string | boolean>) {
  const target = resolve(flagString(flags, "target", process.cwd()));
  const presetName = flagString(flags, "preset", "effect-convex-web");
  const configPath = join(target, ".playbook", "config.json");
  if (await exists(configPath)) throw new Error(`Already installed: ${configPath}`);
  await materialize(target, presetName);
  console.log(`Installed Keenko Playbook ${await packageVersion()} into ${target}`);
}

async function update(flags: Map<string, string | boolean>) {
  const target = resolve(flagString(flags, "target", process.cwd()));
  const config = parseInstalledConfig(await readJson(join(target, ".playbook", "config.json")));
  parseInstalledLock(await readJson(join(target, ".playbook", "lock.json")));
  const nextVersion = await packageVersion();
  const preset = await loadPreset(config.preset);
  const modules = await resolveModules(preset.modules);
  console.log(`Keenko Playbook update preview`);
  console.log(`  version: ${config.version} -> ${nextVersion}`);
  console.log(`  preset:  ${config.preset}`);
  console.log(`  modules: ${modules.map(({ name }) => name).join(", ")}`);
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
  const version = await packageVersion();
  const vendorIndex = await indexVendoredSkills(true);
  const skillNames = resolveSkillNames(preset, modules, vendorIndex);
  const managedBlocks = {
    "AGENTS.md": await readFile(join(SOURCE_ROOT, "templates", "AGENTS.managed.md"), "utf8"),
    "CLAUDE.md": await readFile(join(SOURCE_ROOT, "templates", "CLAUDE.managed.md"), "utf8"),
  };

  // Preflight everything that can fail due to consumer-owned state before writing live files.
  const nextManaged = new Map<string, string>();
  for (const [file, block] of Object.entries(managedBlocks)) {
    const path = join(target, file);
    const current = (await exists(path)) ? await readFile(path, "utf8") : "";
    nextManaged.set(file, renderManagedFile(current, block, path));
  }
  await preflightManagedPaths(target);
  for (const harness of [".agents", ".claude"]) {
    const root = join(target, harness, "skills");
    for (const name of skillNames) {
      const dir = join(root, name);
      if ((await exists(dir)) && !(await exists(join(dir, GENERATED_MARKER)))) {
        throw new Error(`Refusing to overwrite human-owned skill directory: ${dir}`);
      }
    }
  }

  const stageRoot = await mkdtemp(join(target, ".keenko-stage-"));
  try {
    const playbookStage = join(stageRoot, "playbook");
    await mkdir(playbookStage, { recursive: true });
    await cp(join(SOURCE_ROOT, "docs", "core"), join(playbookStage, "docs", "core"), { recursive: true });
    await mkdir(join(playbookStage, "docs", "stacks"), { recursive: true });
    for (const module of modules) {
      await cp(join(SOURCE_ROOT, "docs", "stacks", module.name), join(playbookStage, "docs", "stacks", module.name), { recursive: true });
    }
    await cp(join(SOURCE_ROOT, "docs", "conventions"), join(playbookStage, "docs", "conventions"), { recursive: true });

    for (const name of preset.ownedSkills) {
      await cp(join(SOURCE_ROOT, "skills", name), join(playbookStage, "skills", name), { recursive: true });
    }
    for (const [sourceId, names] of Object.entries(preset.vendorSkills)) {
      for (const name of names) {
        const skill = vendorIndex.get(`${sourceId}:${name}`);
        if (!skill) throw new Error(`Missing vendored skill ${sourceId}:${name}`);
        await materializeVendorSkill(skill, name, skillNames, join(playbookStage, "skills", name));
      }
    }

    const externalSources = (await loadVendorManifest()).sources.filter(({ mode }) => mode === "external");
    await writeJson(join(playbookStage, "external-sources.json"), { schemaVersion: 1, sources: externalSources });

    const config: InstalledConfig = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      version,
      preset: presetName,
      modules: moduleNames,
      skills: [...skillNames].sort(),
      externalSkills: preset.externalSkills,
      integrations: preset.integrations,
    };
    await writeJson(join(playbookStage, "config.json"), config);

    const nativeStage = join(stageRoot, "native");
    for (const harness of [".agents", ".claude"]) {
      for (const name of skillNames) {
        const dst = join(nativeStage, harness, "skills", name);
        await cp(join(playbookStage, "skills", name), dst, { recursive: true });
        await writeFile(join(dst, GENERATED_MARKER), "generated by keenko-playbook\n", "utf8");
      }
    }

    const lock: InstalledLock = {
      schemaVersion: LOCK_SCHEMA_VERSION,
      playbookFiles: await hashTree(playbookStage, new Set(["lock.json"])),
      generatedSkills: [...skillNames].sort(),
      managedBlocks: Object.fromEntries(Object.entries(managedBlocks).map(([file, block]) => [file, hash(block.trim())])),
    };
    await writeJson(join(playbookStage, "lock.json"), lock);

    await applyMaterialization(target, stageRoot, nextManaged, skillNames);
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }
}

function resolveSkillNames(preset: Preset, modules: ModuleManifest[], vendorIndex: Map<string, VendoredSkill>, allowMissingVendor = false) {
  const selected = new Set<string>();
  for (const name of preset.ownedSkills) {
    if (selected.has(name)) throw new Error(`Duplicate selected skill: ${name}`);
    selected.add(name);
  }
  for (const [source, names] of Object.entries(preset.vendorSkills)) {
    for (const name of names) {
      if (selected.has(name)) throw new Error(`Duplicate selected skill name across sources: ${name}`);
      if (!vendorIndex.has(`${source}:${name}`) && !allowMissingVendor) throw new Error(`Missing vendored skill ${source}:${name}. Run 'bun run vendor:sync' before installing/releasing.`);
      selected.add(name);
    }
  }
  const required = unique(modules.flatMap(({ skills }) => skills));
  for (const name of required) {
    if (!selected.has(name)) throw new Error(`Enabled module requires skill '${name}', but the preset does not select it`);
  }
  return [...selected].sort();
}


async function materializeVendorSkill(skill: VendoredSkill, name: string, availableSkills: string[], dst: string) {
  await mkdir(dst, { recursive: true });
  const wrapper = renderVendorSkillAdapter(name, skill.description, availableSkills);
  await writeFile(join(dst, "SKILL.md"), wrapper, "utf8");
  await cp(skill.dir, join(dst, "references", "upstream"), { recursive: true });
  const sourceRoot = join(SOURCE_ROOT, "vendor", skill.source.id);
  await cp(join(sourceRoot, "LICENSE"), join(dst, "UPSTREAM_LICENSE"));
  await cp(join(sourceRoot, "VENDORED.json"), join(dst, "UPSTREAM_PROVENANCE.json"));
}

function renderVendorSkillAdapter(name: string, description: string, availableSkills: string[]) {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description || `Keenko-adapted upstream ${name} workflow.`)}\n---\n\n# Keenko adapter for ${name}\n\nThis skill exposes a pinned upstream workflow through Keenko's authority and safety boundaries.\n\n## Authority guard\n\n1. Current explicit human instruction, project ADR/override, project-local docs, Keenko core, and enabled stack modules outrank the upstream reference.\n2. Do not commit, push, merge, install dependencies/tools, alter package-manager state, or perform external/destructive actions unless the current task explicitly delegates that action.\n3. Bun is the canonical package manager unless the project explicitly documents a compatibility exception. Ignore upstream commands that would introduce a competing lockfile.\n4. Do not edit the Keenko-managed blocks in AGENTS.md or CLAUDE.md directly and do not duplicate canonical conventions into harness files.\n5. Only route to skills that are actually installed. Upstream references to unavailable setup/router skills are advisory, not prerequisites. Use the repository's configured tracker/connectors and canonical docs instead.\n6. If an upstream instruction conflicts with a higher-authority rule, follow the higher-authority rule and continue with the nearest safe equivalent workflow.\n\nInstalled skill set for this snapshot:\n${availableSkills.map((skillName) => `- ${skillName}`).join("\n")}\n\n## Procedure\n\nRead \`references/upstream/SKILL.md\` and apply its procedural guidance subject to the authority guard above. Supporting upstream files are under \`references/upstream/\`. Preserve the upstream notice and provenance files shipped beside this adapter.\n`;
}

async function preflightManagedPaths(target: string) {
  for (const rel of [".playbook", "docs", "docs/project", ".agents", ".agents/skills", ".claude", ".claude/skills"]) {
    const path = join(target, rel);
    if (!(await exists(path))) continue;
    if (!(await stat(path)).isDirectory()) throw new Error(`Managed parent must be a directory: ${path}`);
  }
  for (const rel of ["CONTEXT.md", "docs/project/architecture.md", "docs/project/overrides.md"]) {
    const path = join(target, rel);
    if (!(await exists(path))) continue;
    if (!(await stat(path)).isFile()) throw new Error(`Managed scaffold path must be a file: ${path}`);
  }
}

async function applyMaterialization(target: string, stageRoot: string, managed: Map<string, string>, skillNames: string[]) {
  const rollbackRoot = await mkdtemp(join(target, ".keenko-rollback-"));
  const tracked = [
    ".playbook",
    ".agents/skills",
    ".claude/skills",
    "AGENTS.md",
    "CLAUDE.md",
    "CONTEXT.md",
    "docs/project",
  ];
  const existed = new Map<string, boolean>();
  try {
    for (const rel of tracked) {
      const src = join(target, rel);
      const present = await exists(src);
      existed.set(rel, present);
      if (present) await cp(src, join(rollbackRoot, rel), { recursive: true });
    }

    await rm(join(target, ".playbook"), { recursive: true, force: true });
    await cp(join(stageRoot, "playbook"), join(target, ".playbook"), { recursive: true });

    await ensureProjectScaffold(target);
    for (const [file, text] of managed) await writeFile(join(target, file), text, "utf8");

    for (const harness of [".agents", ".claude"]) {
      const root = join(target, harness, "skills");
      await mkdir(root, { recursive: true });
      for (const name of await generatedSkillNames(root)) await rm(join(root, name), { recursive: true, force: true });
      for (const name of skillNames) {
        await cp(join(stageRoot, "native", harness, "skills", name), join(root, name), { recursive: true });
      }
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const rel of [...tracked].reverse()) {
      try {
        const dst = join(target, rel);
        await rm(dst, { recursive: true, force: true });
        if (existed.get(rel)) await cp(join(rollbackRoot, rel), dst, { recursive: true });
      } catch (rollbackError) {
        rollbackErrors.push(`${rel}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
    if (rollbackErrors.length) console.error(`Rollback encountered cleanup errors: ${rollbackErrors.join("; ")}`);
    throw error;
  } finally {
    await rm(rollbackRoot, { recursive: true, force: true });
  }
}

async function ensureProjectScaffold(target: string) {
  const entries = [
    ["CONTEXT.md", "project-context.md"],
    ["docs/project/architecture.md", "project-architecture.md"],
    ["docs/project/overrides.md", "project-overrides.md"],
  ] as const;
  for (const [destination, template] of entries) {
    const path = join(target, destination);
    if (await exists(path)) continue;
    await mkdir(dirname(path), { recursive: true });
    await cp(join(SOURCE_ROOT, "templates", template), path);
  }
}

function renderManagedFile(current: string, block: string, path: string) {
  const starts = indexesOf(current, START);
  const ends = indexesOf(current, END);
  if (starts.length !== ends.length || starts.length > 1) throw new Error(`Broken or duplicated Keenko managed block in ${path}`);
  const canonical = block.trim();
  if (!starts.length) return current.trimEnd() ? `${current.trimEnd()}\n\n${canonical}\n` : `${canonical}\n`;
  const start = starts[0]!;
  const end = ends[0]!;
  if (end < start) throw new Error(`Broken Keenko managed block in ${path}`);
  const prefix = current.slice(0, start).trimEnd();
  const suffix = current.slice(end + END.length).trimStart();
  return [prefix, canonical, suffix].filter(Boolean).join("\n\n") + "\n";
}

function managedBlock(text: string, path: string) {
  const starts = indexesOf(text, START);
  const ends = indexesOf(text, END);
  if (starts.length !== 1 || ends.length !== 1 || ends[0]! < starts[0]!) throw new Error(`Expected exactly one valid Keenko managed block in ${path}`);
  return text.slice(starts[0], ends[0]! + END.length).trim();
}

function indexesOf(text: string, token: string) {
  const out: number[] = [];
  let offset = 0;
  while (true) {
    const index = text.indexOf(token, offset);
    if (index < 0) return out;
    out.push(index);
    offset = index + token.length;
  }
}

async function generatedSkillNames(root: string) {
  const out: string[] = [];
  if (!(await exists(root))) return out;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && await exists(join(root, entry.name, GENERATED_MARKER))) out.push(entry.name);
  }
  return out.sort();
}

async function indexVendoredSkills(requireValidSnapshots: boolean) {
  const index = new Map<string, VendoredSkill>();
  for (const name of await findOwnedSkills()) index.set(`owned:${name}`, { dir: join(SOURCE_ROOT, "skills", name), source: null as never, description: "" });
  const manifest = await loadVendorManifest();
  for (const source of manifest.sources) {
    if (source.mode !== "vendor") continue;
    if (requireValidSnapshots) await validateVendorSnapshot(source);
    const root = join(SOURCE_ROOT, "vendor", source.id);
    if (!(await exists(root))) continue;
    for (const skillFile of await findFiles(root, "SKILL.md")) {
      const text = await readFile(skillFile, "utf8");
      const name = frontmatterValue(text, "name");
      if (!name) continue;
      index.set(`${source.id}:${name}`, { dir: dirname(skillFile), source, description: frontmatterValue(text, "description") ?? `Upstream ${name} workflow.` });
    }
  }
  return index;
}

async function findOwnedSkills() {
  const out: string[] = [];
  const root = join(SOURCE_ROOT, "skills");
  if (!(await exists(root))) return out;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && await exists(join(root, entry.name, "SKILL.md"))) out.push(entry.name);
  }
  return out;
}

function frontmatterValue(text: string, key: string) {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return null;
  const raw = match[1]!.trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    try { return JSON.parse(raw); } catch { return raw.slice(1, -1); }
  }
  return raw;
}

async function check(flags: Map<string, string | boolean>) {
  if (flags.has("source")) return checkSource(flags.has("release"));
  return checkConsumer(resolve(flagString(flags, "target", process.cwd())));
}

async function checkSource(release: boolean) {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const required of [
    "templates/project-context.md",
    "docs/conventions/backend-architecture.md",
    "docs/conventions/frontend.md",
    "docs/conventions/i18n.md",
    "docs/conventions/migrations.md",
    "docs/conventions/schema-types.md",
    "docs/conventions/validation.md",
  ]) if (!(await exists(join(SOURCE_ROOT, required)))) errors.push(`Missing canonical source file: ${required}`);

  let vendorIndex = new Map<string, VendoredSkill>();
  try { vendorIndex = await indexVendoredSkills(release); } catch (error) { errors.push(String(error)); }

  for (const file of await findFiles(join(SOURCE_ROOT, "presets"), ".json")) {
    try {
      const preset = await loadPreset(basename(file, ".json"));
      const modules = await resolveModules(preset.modules);
      resolveSkillNames(preset, modules, vendorIndex, !release);
      for (const name of preset.ownedSkills) {
        if (!(await exists(join(SOURCE_ROOT, "skills", name, "SKILL.md")))) errors.push(`Missing owned skill ${name}`);
      }
    } catch (error) {
      errors.push(`${relative(SOURCE_ROOT, file)}: ${errorMessage(error)}`);
    }
  }

  for (const skill of await findFiles(join(SOURCE_ROOT, "skills"), "SKILL.md")) {
    const text = await readFile(skill, "utf8");
    if (!frontmatterValue(text, "name")) errors.push(`Invalid skill frontmatter: ${relative(SOURCE_ROOT, skill)}`);
  }

  const manifest = await loadVendorManifest().catch((error) => {
    errors.push(errorMessage(error));
    return null;
  });
  if (manifest) {
    for (const source of manifest.sources) {
      if (source.mode !== "vendor") continue;
      try {
        await validateVendorSnapshot(source);
      } catch (error) {
        const message = errorMessage(error);
        if (release) errors.push(message); else warnings.push(message);
      }
    }
  }

  report(errors, warnings);
}

async function checkConsumer(target: string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const playbookRoot = join(target, ".playbook");
  let config: InstalledConfig;
  let lock: InstalledLock;
  try {
    config = parseInstalledConfig(await readJson(join(playbookRoot, "config.json")));
    lock = parseInstalledLock(await readJson(join(playbookRoot, "lock.json")));
  } catch (error) {
    return report([errorMessage(error)], warnings);
  }

  const currentFiles = await hashTree(playbookRoot, new Set(["lock.json"]));
  if (!same(currentFiles, lock.playbookFiles)) errors.push(`.playbook snapshot differs from lock; do not edit generated playbook files directly`);
  if (!same([...config.skills].sort(), [...lock.generatedSkills].sort())) errors.push(`config.skills differs from lock.generatedSkills`);

  for (const harness of [".agents", ".claude"]) {
    const root = join(target, harness, "skills");
    const actualGenerated = await generatedSkillNames(root);
    if (!same(actualGenerated, [...lock.generatedSkills].sort())) errors.push(`Generated skill set drift: ${harness}/skills`);
    for (const name of lock.generatedSkills) {
      const dir = join(root, name);
      if (!(await exists(join(dir, GENERATED_MARKER)))) {
        errors.push(`Missing generated marker: ${relative(target, dir)}`);
        continue;
      }
      const generated = await hashTree(dir, new Set([GENERATED_MARKER]));
      const canonical = await hashTree(join(playbookRoot, "skills", name), new Set());
      if (!same(generated, canonical)) errors.push(`Generated skill drift: ${harness}/skills/${name}`);
    }
  }

  for (const file of ["AGENTS.md", "CLAUDE.md"]) {
    try {
      const block = managedBlock(await readFile(join(target, file), "utf8"), file);
      if (hash(block) !== lock.managedBlocks[file]) errors.push(`Keenko managed block drift: ${file}`);
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  for (const file of ["CONTEXT.md", "docs/project/architecture.md", "docs/project/overrides.md"]) {
    if (!(await exists(join(target, file)))) errors.push(`Missing project scaffold: ${file}`);
  }

  if (config.integrations.tanstackIntent) warnings.push(`TanStack Intent availability is runtime/package-version dependent; verify it against the consuming project's installed TanStack versions.`);
  for (const [name, external] of Object.entries(config.externalSkills)) {
    warnings.push(`External skill '${name}' is not managed by Keenko; follow its recorded install contract only with explicit user approval: ${external.repository}@${external.commit}`);
  }
  report(errors, warnings);
}

async function validateVendorSnapshot(source: VendorSource) {
  if (!source.commit) throw new Error(`Vendor source ${source.id} has no pinned commit`);
  if (!source.license) throw new Error(`Vendor source ${source.id} has no redistributable license`);
  const root = join(SOURCE_ROOT, "vendor", source.id);
  if (!(await exists(root))) throw new Error(`Missing vendor snapshot ${source.id}; run bun run vendor:sync`);
  if (!(await exists(join(root, "LICENSE")))) throw new Error(`Missing vendor license ${source.id}/LICENSE`);
  const provenance = parseVendorProvenance(await readJson(join(root, "VENDORED.json")), source.id);
  if (provenance.repository !== source.repository || provenance.commit !== source.commit || provenance.tree !== source.tree || provenance.license !== source.license) {
    throw new Error(`Vendor provenance drift for ${source.id}`);
  }
  const actual = await hashTree(root, new Set(["VENDORED.json"]));
  if (!same(actual, provenance.files)) throw new Error(`Vendor file drift for ${source.id}; run bun run vendor:sync and review the diff`);
}

async function loadVendorManifest(): Promise<VendorManifest> {
  const value = asObject(await readJson(join(SOURCE_ROOT, "vendor", "sources.json")), "vendor/sources.json");
  assertKeys(value, ["schemaVersion", "sources"], "vendor/sources.json");
  if (value.schemaVersion !== 1) throw new Error(`Unsupported vendor manifest schemaVersion: ${String(value.schemaVersion)}`);
  if (!Array.isArray(value.sources)) throw new Error(`vendor/sources.json.sources must be an array`);
  return { schemaVersion: 1, sources: value.sources.map(parseVendorSource) };
}

function parseVendorSource(value: unknown, index: number): VendorSource {
  const source = asObject(value, `vendor source ${index}`);
  assertKeys(source, ["id", "repository", "upstreamRef", "commit", "tree", "rootPath", "mode", "license", "includes"], `vendor source ${index}`);
  const mode = asString(source.mode, `vendor source ${index}.mode`);
  if (mode !== "vendor" && mode !== "external") throw new Error(`Invalid vendor mode: ${mode}`);
  return {
    id: asString(source.id, `vendor source ${index}.id`),
    repository: asString(source.repository, `vendor source ${index}.repository`),
    upstreamRef: asString(source.upstreamRef, `vendor source ${index}.upstreamRef`),
    commit: source.commit === null ? null : asString(source.commit, `vendor source ${index}.commit`),
    tree: asString(source.tree, `vendor source ${index}.tree`),
    rootPath: asStringAllowEmpty(source.rootPath, `vendor source ${index}.rootPath`),
    mode,
    license: source.license === null ? null : asString(source.license, `vendor source ${index}.license`),
    includes: asStringArray(source.includes, `vendor source ${index}.includes`),
  };
}

function parseVendorProvenance(value: unknown, id: string): VendorProvenance {
  const item = asObject(value, `${id}/VENDORED.json`);
  assertKeys(item, ["repository", "commit", "tree", "license", "files"], `${id}/VENDORED.json`);
  return {
    repository: asString(item.repository, `${id}.repository`),
    commit: asString(item.commit, `${id}.commit`),
    tree: asString(item.tree, `${id}.tree`),
    license: asString(item.license, `${id}.license`),
    files: asStringRecord(item.files, `${id}.files`),
  };
}

function parseInstalledConfig(value: unknown): InstalledConfig {
  const item = asObject(value, ".playbook/config.json");
  assertKeys(item, ["schemaVersion", "version", "preset", "modules", "skills", "externalSkills", "integrations"], ".playbook/config.json");
  if (item.schemaVersion !== CONFIG_SCHEMA_VERSION) throw new Error(`Unsupported .playbook config schemaVersion: ${String(item.schemaVersion)}`);
  return {
    schemaVersion: 1,
    version: asString(item.version, "config.version"),
    preset: asString(item.preset, "config.preset"),
    modules: asStringArray(item.modules, "config.modules"),
    skills: asStringArray(item.skills, "config.skills"),
    externalSkills: parseExternalSkills(item.externalSkills, "config.externalSkills"),
    integrations: asBooleanRecord(item.integrations, "config.integrations"),
  };
}

function parseInstalledLock(value: unknown): InstalledLock {
  const item = asObject(value, ".playbook/lock.json");
  assertKeys(item, ["schemaVersion", "playbookFiles", "generatedSkills", "managedBlocks"], ".playbook/lock.json");
  if (item.schemaVersion !== LOCK_SCHEMA_VERSION) throw new Error(`Unsupported .playbook lock schemaVersion: ${String(item.schemaVersion)}`);
  return {
    schemaVersion: 1,
    playbookFiles: asStringRecord(item.playbookFiles, "lock.playbookFiles"),
    generatedSkills: asStringArray(item.generatedSkills, "lock.generatedSkills"),
    managedBlocks: asStringRecord(item.managedBlocks, "lock.managedBlocks"),
  };
}

function parseExternalSkills(value: unknown, label: string) {
  const record = asObject(value ?? {}, label);
  const out: Record<string, ExternalSkill> = {};
  for (const [name, raw] of Object.entries(record)) {
    const item = asObject(raw, `${label}.${name}`);
    assertKeys(item, ["source", "repository", "commit", "install", "enabled"], `${label}.${name}`);
    out[name] = {
      source: asString(item.source, `${label}.${name}.source`),
      repository: asString(item.repository, `${label}.${name}.repository`),
      commit: asString(item.commit, `${label}.${name}.commit`),
      install: asString(item.install, `${label}.${name}.install`),
      enabled: asStringArray(item.enabled, `${label}.${name}.enabled`),
    };
  }
  return out;
}

async function hashTree(root: string, ignore: Set<string>) {
  const out: Hashes = {};
  if (!(await exists(root))) return out;
  for (const file of await findAllFiles(root)) {
    const rel = relative(root, file).replaceAll("\\", "/");
    if (ignore.has(rel)) continue;
    out[rel] = hash(await readFile(file));
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function hash(data: string | Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

async function findFiles(root: string, suffix: string) {
  return (await findAllFiles(root)).filter((path) => path.endsWith(suffix));
}

async function findAllFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  if (!(await exists(root))) return out;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...await findAllFiles(path));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

async function exists(path: string) {
  try { await stat(path); return true; } catch { return false; }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function asString(value: unknown, label: string) {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function asStringAllowEmpty(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function asStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) throw new Error(`${label} must be an array of non-empty strings`);
  const out = value as string[];
  if (new Set(out).size !== out.length) throw new Error(`${label} must not contain duplicates`);
  return out;
}

function asStringRecord(value: unknown, label: string) {
  const record = asObject(value, label);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) out[key] = asString(item, `${label}.${key}`);
  return out;
}

function asStringArrayRecord(value: unknown, label: string) {
  const record = asObject(value ?? {}, label);
  const out: Record<string, string[]> = {};
  for (const [key, item] of Object.entries(record)) out[key] = asStringArray(item, `${label}.${key}`);
  return out;
}

function asBooleanRecord(value: unknown, label: string) {
  const record = asObject(value ?? {}, label);
  const out: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== "boolean") throw new Error(`${label}.${key} must be boolean`);
    out[key] = item;
  }
  return out;
}

function assertKeys(value: JsonObject, allowed: string[], label: string) {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length) throw new Error(`${label} has unknown field(s): ${extra.join(", ")}`);
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
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Keenko Playbook check passed${warnings.length ? ` with ${warnings.length} warning(s)` : ""}.`);
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
