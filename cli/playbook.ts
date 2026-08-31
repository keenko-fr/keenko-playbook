#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const START = "<!-- keenko-playbook:start -->";
const END = "<!-- keenko-playbook:end -->";

type ModuleManifest = { name: string; requires: string[]; skills?: string[] };
type Preset = {
  name: string;
  modules: string[];
  ownedSkills: string[];
  vendorSkills: Record<string, string[]>;
  externalSkills?: Record<string, unknown>;
  integrations?: Record<string, boolean>;
};
type InstalledConfig = {
  schemaVersion: 1;
  version: string;
  preset: string;
  modules: string[];
  skills: string[];
  externalSkills: Preset["externalSkills"];
  integrations: Preset["integrations"];
};

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
    } else flags.set(name, true);
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
  console.log(`Keenko Playbook\n\n` +
    `  playbook install [--target .] [--preset effect-convex-web]\n` +
    `  playbook update [--target .] [--apply]\n` +
    `  playbook check [--target .]\n` +
    `  playbook check --source [--release]\n`);
}

async function packageVersion() {
  const pkg = JSON.parse(await readFile(join(SOURCE_ROOT, "package.json"), "utf8"));
  return String(pkg.version);
}

async function loadPreset(name: string): Promise<Preset> {
  return JSON.parse(await readFile(join(SOURCE_ROOT, "presets", `${name}.json`), "utf8"));
}

async function loadModule(name: string): Promise<ModuleManifest> {
  const manifest = JSON.parse(await readFile(join(SOURCE_ROOT, "docs", "stacks", name, "module.json"), "utf8"));
  if (manifest.name !== name) throw new Error(`Module manifest name mismatch for ${name}`);
  return manifest;
}

async function resolveModules(initial: string[]) {
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  async function visit(name: string) {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Module dependency cycle at ${name}`);
    visiting.add(name);
    const module = await loadModule(name);
    for (const dep of module.requires ?? []) await visit(dep);
    visiting.delete(name);
    visited.add(name);
    ordered.push(name);
  }
  for (const name of initial) await visit(name);
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
  const config = await readJson<InstalledConfig>(join(target, ".playbook", "config.json"));
  const nextVersion = await packageVersion();
  const preset = await loadPreset(config.preset);
  const modules = await resolveModules(preset.modules);
  console.log(`Keenko Playbook update preview`);
  console.log(`  version: ${config.version} -> ${nextVersion}`);
  console.log(`  preset:  ${config.preset}`);
  console.log(`  modules: ${modules.join(", ")}`);
  if (!flags.has("apply")) {
    console.log(`No files changed. Run again with --apply to materialize this source version.`);
    return;
  }
  await materialize(target, config.preset);
  console.log(`Applied Keenko Playbook ${nextVersion}. Review the Git diff before committing.`);
}

async function materialize(target: string, presetName: string) {
  const preset = await loadPreset(presetName);
  const modules = await resolveModules(preset.modules);
  const version = await packageVersion();
  const playbookRoot = join(target, ".playbook");
  await mkdir(playbookRoot, { recursive: true });
  await rm(join(playbookRoot, "docs"), { recursive: true, force: true });
  await rm(join(playbookRoot, "skills"), { recursive: true, force: true });

  await cp(join(SOURCE_ROOT, "docs", "core"), join(playbookRoot, "docs", "core"), { recursive: true });
  await mkdir(join(playbookRoot, "docs", "stacks"), { recursive: true });
  for (const name of modules) {
    await cp(join(SOURCE_ROOT, "docs", "stacks", name), join(playbookRoot, "docs", "stacks", name), { recursive: true });
  }
  await cp(join(SOURCE_ROOT, "docs", "conventions"), join(playbookRoot, "docs", "conventions"), { recursive: true });

  const skillNames: string[] = [];
  for (const name of preset.ownedSkills) {
    const src = join(SOURCE_ROOT, "skills", name);
    const dst = join(playbookRoot, "skills", name);
    await cp(src, dst, { recursive: true });
    skillNames.push(name);
  }

  const vendorIndex = await indexVendoredSkills();
  for (const [source, names] of Object.entries(preset.vendorSkills ?? {})) {
    for (const name of names) {
      const src = vendorIndex.get(`${source}:${name}`);
      if (!src) throw new Error(`Missing vendored skill ${source}:${name}. Run 'bun run vendor:sync' before installing/releasing.`);
      const dst = join(playbookRoot, "skills", name);
      if (await exists(dst)) throw new Error(`Duplicate skill name: ${name}`);
      await cp(src, dst, { recursive: true });
      skillNames.push(name);
    }
  }

  const config: InstalledConfig = {
    schemaVersion: 1,
    version,
    preset: presetName,
    modules,
    skills: skillNames.sort(),
    externalSkills: preset.externalSkills ?? {},
    integrations: preset.integrations ?? {}
  };
  await writeJson(join(playbookRoot, "config.json"), config);

  await ensureProjectScaffold(target);
  await patchManagedFile(join(target, "AGENTS.md"), await readFile(join(SOURCE_ROOT, "templates", "AGENTS.managed.md"), "utf8"));
  await patchManagedFile(join(target, "CLAUDE.md"), await readFile(join(SOURCE_ROOT, "templates", "CLAUDE.managed.md"), "utf8"));
  await generateNativeSkills(target, playbookRoot, skillNames);

  const lock = await buildLock(target, playbookRoot, skillNames);
  await writeJson(join(playbookRoot, "lock.json"), lock);
}

async function ensureProjectScaffold(target: string) {
  const context = join(target, "CONTEXT.md");
  const architecture = join(target, "docs", "project", "architecture.md");
  const overrides = join(target, "docs", "project", "overrides.md");
  if (!(await exists(context))) await cp(join(SOURCE_ROOT, "templates", "project-context.md"), context);
  if (!(await exists(architecture))) {
    await mkdir(dirname(architecture), { recursive: true });
    await cp(join(SOURCE_ROOT, "templates", "project-architecture.md"), architecture);
  }
  if (!(await exists(overrides))) {
    await mkdir(dirname(overrides), { recursive: true });
    await cp(join(SOURCE_ROOT, "templates", "project-overrides.md"), overrides);
  }
}

async function patchManagedFile(path: string, block: string) {
  const current = (await exists(path)) ? await readFile(path, "utf8") : "";
  const start = current.indexOf(START);
  const end = current.indexOf(END);
  let next: string;
  if (start >= 0 || end >= 0) {
    if (start < 0 || end < start) throw new Error(`Broken Keenko managed block in ${path}`);
    next = current.slice(0, start).trimEnd() + "\n\n" + block.trim() + "\n\n" + current.slice(end + END.length).trimStart();
  } else {
    next = current.trim() ? current.trimEnd() + "\n\n" + block.trim() + "\n" : block.trim() + "\n";
  }
  await writeFile(path, next, "utf8");
}

async function generateNativeSkills(target: string, playbookRoot: string, names: string[]) {
  for (const harnessRoot of [join(target, ".agents", "skills"), join(target, ".claude", "skills")]) {
    await mkdir(harnessRoot, { recursive: true });
    for (const name of names) {
      const dst = join(harnessRoot, name);
      if (await exists(dst)) {
        const marker = join(dst, ".keenko-generated");
        if (!(await exists(marker))) throw new Error(`Refusing to overwrite human-owned skill directory: ${dst}`);
        await rm(dst, { recursive: true, force: true });
      }
      await cp(join(playbookRoot, "skills", name), dst, { recursive: true });
      await writeFile(join(dst, ".keenko-generated"), "generated by keenko-playbook\n", "utf8");
    }
  }
}

async function indexVendoredSkills() {
  const index = new Map<string, string>();
  const vendorRoot = join(SOURCE_ROOT, "vendor");
  const sources = JSON.parse(await readFile(join(vendorRoot, "sources.json"), "utf8"));
  for (const source of sources.sources) {
    if (source.mode !== "vendor") continue;
    const root = join(vendorRoot, source.id);
    if (!(await exists(root))) continue;
    for (const skillFile of await findFiles(root, "SKILL.md")) {
      const text = await readFile(skillFile, "utf8");
      const match = text.match(/^---\s*[\s\S]*?^name:\s*["']?([^\n"']+)/m);
      if (!match) continue;
      index.set(`${source.id}:${match[1].trim()}`, dirname(skillFile));
    }
  }
  return index;
}

async function check(flags: Map<string, string | boolean>) {
  if (flags.has("source")) return checkSource(flags.has("release"));
  const target = resolve(flagString(flags, "target", process.cwd()));
  return checkConsumer(target);
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
  const presetFiles = await findFiles(join(SOURCE_ROOT, "presets"), ".json");
  for (const file of presetFiles) {
    try {
      const preset = await readJson<Preset>(file);
      await resolveModules(preset.modules);
      for (const name of preset.ownedSkills) {
        if (!(await exists(join(SOURCE_ROOT, "skills", name, "SKILL.md")))) errors.push(`Missing owned skill ${name}`);
      }
    } catch (error) { errors.push(`${relative(SOURCE_ROOT, file)}: ${String(error)}`); }
  }

  for (const skill of await findFiles(join(SOURCE_ROOT, "skills"), "SKILL.md")) {
    const text = await readFile(skill, "utf8");
    if (!/^---\s*[\s\S]*?^name:\s*\S+/m.test(text)) errors.push(`Invalid skill frontmatter: ${relative(SOURCE_ROOT, skill)}`);
  }

  const sources = JSON.parse(await readFile(join(SOURCE_ROOT, "vendor", "sources.json"), "utf8"));
  for (const source of sources.sources) {
    if (source.mode !== "vendor") continue;
    const snapshot = join(SOURCE_ROOT, "vendor", source.id);
    if (!(await exists(snapshot))) {
      const msg = `Missing vendor snapshot ${source.id}; run bun run vendor:sync`;
      if (release) errors.push(msg); else warnings.push(msg);
    }
  }

  report(errors, warnings);
}

async function checkConsumer(target: string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const playbookRoot = join(target, ".playbook");
  const config = await readJson<InstalledConfig>(join(playbookRoot, "config.json"));
  const lock = await readJson<any>(join(playbookRoot, "lock.json"));
  const currentFiles = await hashTree(playbookRoot, new Set(["lock.json"]));
  if (JSON.stringify(currentFiles) !== JSON.stringify(lock.playbookFiles)) errors.push(`.playbook snapshot differs from lock; do not edit generated playbook files directly`);

  for (const harness of [".agents", ".claude"]) {
    for (const name of config.skills) {
      const dir = join(target, harness, "skills", name);
      if (!(await exists(join(dir, ".keenko-generated")))) errors.push(`Missing generated marker: ${relative(target, dir)}`);
      const generated = await hashTree(dir, new Set([".keenko-generated"]));
      const canonical = await hashTree(join(playbookRoot, "skills", name), new Set());
      if (JSON.stringify(generated) !== JSON.stringify(canonical)) errors.push(`Generated skill drift: ${harness}/skills/${name}`);
    }
  }

  for (const file of ["AGENTS.md", "CLAUDE.md"]) {
    const text = await readFile(join(target, file), "utf8");
    if (!text.includes(START) || !text.includes(END)) errors.push(`Missing Keenko managed block in ${file}`);
  }
  for (const file of ["CONTEXT.md", "docs/project/architecture.md", "docs/project/overrides.md"]) if (!(await exists(join(target, file)))) errors.push(`Missing project scaffold: ${file}`);

  if (config.integrations?.tanstackIntent) warnings.push(`TanStack Intent availability is runtime/package-version dependent; run 'bunx @tanstack/intent@latest list' in the consuming project.`);
  if (config.externalSkills && Object.keys(config.externalSkills).length) warnings.push(`External first-party skills are referenced but not copied; verify their installation/discovery in the consuming harness.`);
  report(errors, warnings);
}

async function buildLock(target: string, playbookRoot: string, skillNames: string[]) {
  return {
    schemaVersion: 1,
    playbookFiles: await hashTree(playbookRoot, new Set(["lock.json"])),
    generatedSkills: skillNames.sort(),
    managedFiles: ["AGENTS.md", "CLAUDE.md"]
  };
}

async function hashTree(root: string, ignore: Set<string>) {
  const out: Record<string, string> = {};
  if (!(await exists(root))) return out;
  for (const file of await findAllFiles(root)) {
    const rel = relative(root, file).replaceAll("\\", "/");
    if (ignore.has(rel)) continue;
    const data = await readFile(file);
    out[rel] = createHash("sha256").update(data).digest("hex");
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
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

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
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
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
