import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const CLI = join(ROOT, "cli", "playbook.ts");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (path) => {
      await rm(path, { recursive: true, force: true });
    })
  );
});

async function fixture() {
  const path = await mkdtemp(join(tmpdir(), "keenko-playbook-test-"));
  tempRoots.push(path);
  await writeFile(join(path, "AGENTS.md"), "# Human AGENTS\n\nKeep me.\n");
  await writeFile(join(path, "CLAUDE.md"), "# Human CLAUDE\n\nKeep me too.\n");
  await writeFile(join(path, "CONTEXT.md"), "# Existing context\n\nKeep this context.\n");
  return path;
}

async function run(...args: string[]) {
  const proc = Bun.spawn([process.execPath, CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, code };
}

describe("consumer materialization", () => {
  test("install and same-source update are byte-idempotent and preserve human content", async () => {
    const target = await fixture();
    expect((await run("install", "--target", target)).code).toBe(0);
    const installed = await hashTree(target);
    expect(await readFile(join(target, "AGENTS.md"), "utf-8")).toContain("Keep me.");
    expect(await readFile(join(target, "CLAUDE.md"), "utf-8")).toContain("Keep me too.");
    expect(await readFile(join(target, "CONTEXT.md"), "utf-8")).toContain("Keep this context.");
    expect(await exists(join(target, "docs", "project", "ui.md"))).toBe(true);
    const config = JSON.parse(await readFile(join(target, ".playbook", "config.json"), "utf-8")) as { modules: string[] };
    expect(config.modules).toContain("react-ui");
    expect(config.modules).not.toContain("ui");

    expect((await run("install", "--target", target)).code).not.toBe(0);
    expect(await hashTree(target)).toEqual(installed);
    expect((await run("update", "--target", target)).code).toBe(0);
    expect(await hashTree(target)).toEqual(installed);
    expect((await run("update", "--target", target, "--apply")).code).toBe(0);
    expect(await hashTree(target)).toEqual(installed);
    expect((await run("check", "--target", target)).code).toBe(0);
  });

  test("preserves a project-owned UI specification on install and update", async () => {
    const target = await fixture();
    const uiPath = join(target, "docs", "project", "ui.md");
    const projectUi = "# Project UI\n\nKeep this product decision.\n";
    await mkdir(join(target, "docs", "project"), { recursive: true });
    await writeFile(uiPath, projectUi);

    expect((await run("install", "--target", target)).code).toBe(0);
    expect(await readFile(uiPath, "utf-8")).toBe(projectUi);
    expect((await run("update", "--target", target, "--apply")).code).toBe(0);
    expect(await readFile(uiPath, "utf-8")).toBe(projectUi);
    expect((await run("check", "--target", target)).code).toBe(0);
  });

  test("requires the UI project scaffold when the installed modules declare a UI surface", async () => {
    const target = await fixture();
    expect((await run("install", "--target", target)).code).toBe(0);
    await rm(join(target, "docs", "project", "ui.md"));

    const result = await run("check", "--target", target);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Missing project scaffold: docs/project/ui.md");
  });

  test("updates persisted ui module installs to react-ui without a compatibility alias", async () => {
    const target = await fixture();
    expect((await run("install", "--target", target)).code).toBe(0);

    const playbookRoot = join(target, ".playbook");
    const configPath = join(playbookRoot, "config.json");
    const config = JSON.parse(await readFile(configPath, "utf-8")) as { modules: string[] };
    config.modules = config.modules.map((name) => (name === "react-ui" ? "ui" : name));
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
    await rm(join(playbookRoot, "docs", "stacks", "react-ui"), { recursive: true, force: true });
    await mkdir(join(playbookRoot, "docs", "stacks", "ui"), { recursive: true });
    await writeFile(
      join(playbookRoot, "docs", "stacks", "ui", "module.json"),
      JSON.stringify({ name: "ui", requires: ["react"], skills: [], incompatibleWith: [] }, null, 2) + "\n"
    );
    await writeFile(join(playbookRoot, "docs", "stacks", "ui", "README.md"), "# UI\n");
    await rm(join(target, "docs", "project", "ui.md"));

    const preview = await run("update", "--target", target);
    expect(preview.code).toBe(0);
    expect(preview.stdout).toContain("ui");
    expect(preview.stdout).toContain("react-ui");
    expect(preview.stdout).toContain(" -> ");
    expect(await exists(join(playbookRoot, "docs", "stacks", "ui"))).toBe(true);

    expect((await run("update", "--target", target, "--apply")).code).toBe(0);
    const updated = JSON.parse(await readFile(configPath, "utf-8")) as { modules: string[] };
    expect(updated.modules).toContain("react-ui");
    expect(updated.modules).not.toContain("ui");
    expect(await exists(join(playbookRoot, "docs", "stacks", "ui"))).toBe(false);
    expect(await exists(join(playbookRoot, "docs", "stacks", "react-ui"))).toBe(true);
    expect(await exists(join(target, "docs", "project", "ui.md"))).toBe(true);
    expect((await run("check", "--target", target)).code).toBe(0);
  });

  test("preflights human-owned skill collisions without partial writes", async () => {
    const target = await fixture();
    await mkdir(join(target, ".claude", "skills", "confect"), { recursive: true });
    await writeFile(join(target, ".claude", "skills", "confect", "SKILL.md"), "human owned\n");
    const before = await hashTree(target);
    const result = await run("install", "--target", target);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("human-owned skill directory");
    expect(await hashTree(target)).toEqual(before);
    expect(await exists(join(target, ".playbook", "config.json"))).toBe(false);
  });

  test("preflights scaffold parent collisions without partial writes and remains retryable", async () => {
    const target = await fixture();
    await mkdir(join(target, "docs"), { recursive: true });
    await writeFile(join(target, "docs", "project"), "human-owned project path\n");
    const before = await hashTree(target);

    const failed = await run("install", "--target", target);
    expect(failed.code).not.toBe(0);
    expect(failed.stderr).toContain("Managed parent must be a directory");
    expect(await hashTree(target)).toEqual(before);
    expect(await exists(join(target, ".playbook", "config.json"))).toBe(false);

    await rm(join(target, "docs", "project"));
    expect((await run("install", "--target", target)).code).toBe(0);
    expect((await run("check", "--target", target)).code).toBe(0);
  });

  test("preflights project UI scaffold collisions without partial writes", async () => {
    const target = await fixture();
    await mkdir(join(target, "docs", "project", "ui.md"), { recursive: true });
    const before = await hashTree(target);

    const result = await run("install", "--target", target);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Managed scaffold path must be a file");
    expect(await hashTree(target)).toEqual(before);
    expect(await exists(join(target, ".playbook", "config.json"))).toBe(false);
  });

  test("detects managed-block tampering and retired generated skills", async () => {
    const target = await fixture();
    expect((await run("install", "--target", target)).code).toBe(0);
    const agents = await readFile(join(target, "AGENTS.md"), "utf-8");
    await writeFile(join(target, "AGENTS.md"), agents.replace("Instruction precedence:", "Instruction precedence: REVERSED "));
    expect((await run("check", "--target", target)).code).not.toBe(0);

    expect((await run("update", "--target", target, "--apply")).code).toBe(0);
    const stale = join(target, ".agents", "skills", "retired-skill");
    await mkdir(stale, { recursive: true });
    await writeFile(join(stale, ".keenko-generated"), "generated by keenko-playbook\n");
    await writeFile(join(stale, "SKILL.md"), "stale\n");
    expect((await run("check", "--target", target)).code).not.toBe(0);
  });

  test("rejects unknown config schema versions before update", async () => {
    const target = await fixture();
    expect((await run("install", "--target", target)).code).toBe(0);
    const path = join(target, ".playbook", "config.json");
    const config = JSON.parse(await readFile(path, "utf-8")) as { schemaVersion: number };
    config.schemaVersion = 999;
    await writeFile(path, JSON.stringify(config, null, 2) + "\n");
    const result = await run("update", "--target", target);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Unsupported .playbook config schemaVersion");
  });

  test("vendor adapters carry notices, provenance, and a closed authority guard into both harnesses", async () => {
    const target = await fixture();
    expect((await run("install", "--target", target)).code).toBe(0);
    for (const root of [".playbook/skills", ".agents/skills", ".claude/skills"]) {
      const dir = join(target, root, "grilling");
      expect(await exists(join(dir, "UPSTREAM_LICENSE"))).toBe(true);
      expect(await exists(join(dir, "UPSTREAM_PROVENANCE.json"))).toBe(true);
      const skill = await readFile(join(dir, "SKILL.md"), "utf-8");
      expect(skill).toContain("Only route to skills that are actually installed");
      expect(skill).toContain("Do not commit, push, merge");
    }
  });
});

async function hashTree(root: string) {
  const out: Record<string, string> = {};
  for (const file of await findAllFiles(root)) {
    const rel = relative(root, file).replaceAll("\\", "/");
    out[rel] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  }
  return out;
}

async function findAllFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  if (!(await exists(root))) return out;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await findAllFiles(path)));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
