import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const CLI = path.join(ROOT, "cli", "playbook.ts");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { force: true, recursive: true });
    })
  );
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "keenko-playbook-test-"));
  tempRoots.push(root);
  await Promise.all([
    writeFile(path.join(root, "AGENTS.md"), "# Human AGENTS\n\nKeep me.\n"),
    writeFile(path.join(root, "CLAUDE.md"), "# Human CLAUDE\n\nKeep me too.\n"),
    writeFile(path.join(root, "CONTEXT.md"), "# Existing context\n\nKeep this context.\n"),
  ]);
  return root;
}

async function run(...args: string[]) {
  const proc = Bun.spawn([process.execPath, CLI, ...args], { stderr: "pipe", stdout: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, stderr, stdout };
}

async function expectRunSuccess(...args: string[]) {
  const result = await run(...args);
  expect(result.code).toBe(0);
  return result;
}

async function expectRunFailure(...args: string[]) {
  const result = await run(...args);
  expect(result.code).not.toBe(0);
  return result;
}

describe("consumer materialization", () => {
  test("install and same-source update are byte-idempotent and preserve human content", async () => {
    const target = await fixture();
    await expectRunSuccess("install", "--target", target);
    const installed = await hashTree(target);
    expect(await readFile(path.join(target, "AGENTS.md"), "utf-8")).toContain("Keep me.");
    expect(await readFile(path.join(target, "CLAUDE.md"), "utf-8")).toContain("Keep me too.");
    expect(await readFile(path.join(target, "CONTEXT.md"), "utf-8")).toContain("Keep this context.");
    expect(await exists(path.join(target, "docs", "project", "ui.md"))).toBe(true);
    const config = await readJsonObject(path.join(target, ".playbook", "config.json"));
    const modules = asStringArray(config.modules, "config.modules");
    expect(modules).toContain("react-ui");
    expect(modules).not.toContain("ui");

    await expectRunFailure("install", "--target", target);
    expect(await hashTree(target)).toEqual(installed);
    await expectRunSuccess("update", "--target", target);
    expect(await hashTree(target)).toEqual(installed);
    await expectRunSuccess("update", "--target", target, "--apply");
    expect(await hashTree(target)).toEqual(installed);
    await expectRunSuccess("check", "--target", target);
  });

  test("preserves a project-owned UI specification on install and update", async () => {
    const target = await fixture();
    const uiPath = path.join(target, "docs", "project", "ui.md");
    const projectUi = "# Project UI\n\nKeep this product decision.\n";
    await mkdir(path.join(target, "docs", "project"), { recursive: true });
    await writeFile(uiPath, projectUi);

    await expectRunSuccess("install", "--target", target);
    expect(await readFile(uiPath, "utf-8")).toBe(projectUi);
    await expectRunSuccess("update", "--target", target, "--apply");
    expect(await readFile(uiPath, "utf-8")).toBe(projectUi);
    await expectRunSuccess("check", "--target", target);
  });

  test("requires the UI project scaffold when the installed modules declare a UI surface", async () => {
    const target = await fixture();
    await expectRunSuccess("install", "--target", target);
    await rm(path.join(target, "docs", "project", "ui.md"));

    const result = await expectRunFailure("check", "--target", target);
    expect(result.stderr).toContain("Missing project scaffold: docs/project/ui.md");
  });

  test("updates persisted ui module installs to react-ui without a compatibility alias", async () => {
    const target = await fixture();
    await expectRunSuccess("install", "--target", target);

    const playbookRoot = path.join(target, ".playbook");
    const configPath = path.join(playbookRoot, "config.json");
    const config = await readJsonObject(configPath);
    const modules = asStringArray(config.modules, "config.modules");
    config.modules = modules.map((name) => (name === "react-ui" ? "ui" : name));
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    await rm(path.join(playbookRoot, "docs", "stacks", "react-ui"), { force: true, recursive: true });
    await mkdir(path.join(playbookRoot, "docs", "stacks", "ui"), { recursive: true });
    await writeFile(
      path.join(playbookRoot, "docs", "stacks", "ui", "module.json"),
      `${JSON.stringify({ incompatibleWith: [], name: "ui", requires: ["react"], skills: [] }, null, 2)}\n`
    );
    await writeFile(path.join(playbookRoot, "docs", "stacks", "ui", "README.md"), "# UI\n");
    await rm(path.join(target, "docs", "project", "ui.md"));

    const preview = await expectRunSuccess("update", "--target", target);
    expect(preview.stdout).toContain("ui");
    expect(preview.stdout).toContain("react-ui");
    expect(preview.stdout).toContain(" -> ");
    expect(await exists(path.join(playbookRoot, "docs", "stacks", "ui"))).toBe(true);

    await expectRunSuccess("update", "--target", target, "--apply");
    const updated = await readJsonObject(configPath);
    const updatedModules = asStringArray(updated.modules, "config.modules");
    expect(updatedModules).toContain("react-ui");
    expect(updatedModules).not.toContain("ui");
    expect(await exists(path.join(playbookRoot, "docs", "stacks", "ui"))).toBe(false);
    expect(await exists(path.join(playbookRoot, "docs", "stacks", "react-ui"))).toBe(true);
    expect(await exists(path.join(target, "docs", "project", "ui.md"))).toBe(true);
    await expectRunSuccess("check", "--target", target);
  });

  test("preflights human-owned skill collisions without partial writes", async () => {
    const target = await fixture();
    await mkdir(path.join(target, ".claude", "skills", "confect"), { recursive: true });
    await writeFile(path.join(target, ".claude", "skills", "confect", "SKILL.md"), "human owned\n");
    const before = await hashTree(target);
    const result = await expectRunFailure("install", "--target", target);
    expect(result.stderr).toContain("human-owned skill directory");
    expect(await hashTree(target)).toEqual(before);
    expect(await exists(path.join(target, ".playbook", "config.json"))).toBe(false);
  });

  test("preflights scaffold parent collisions without partial writes and remains retryable", async () => {
    const target = await fixture();
    await mkdir(path.join(target, "docs"), { recursive: true });
    await writeFile(path.join(target, "docs", "project"), "human-owned project path\n");
    const before = await hashTree(target);

    const failed = await expectRunFailure("install", "--target", target);
    expect(failed.stderr).toContain("Managed parent must be a directory");
    expect(await hashTree(target)).toEqual(before);
    expect(await exists(path.join(target, ".playbook", "config.json"))).toBe(false);

    await rm(path.join(target, "docs", "project"));
    await expectRunSuccess("install", "--target", target);
    await expectRunSuccess("check", "--target", target);
  });

  test("preflights project UI scaffold collisions without partial writes", async () => {
    const target = await fixture();
    await mkdir(path.join(target, "docs", "project", "ui.md"), { recursive: true });
    const before = await hashTree(target);

    const result = await expectRunFailure("install", "--target", target);
    expect(result.stderr).toContain("Managed scaffold path must be a file");
    expect(await hashTree(target)).toEqual(before);
    expect(await exists(path.join(target, ".playbook", "config.json"))).toBe(false);
  });

  test("detects managed-block tampering and retired generated skills", async () => {
    const target = await fixture();
    await expectRunSuccess("install", "--target", target);
    const agents = await readFile(path.join(target, "AGENTS.md"), "utf-8");
    await writeFile(path.join(target, "AGENTS.md"), agents.replace("Instruction precedence:", "Instruction precedence: REVERSED "));
    await expectRunFailure("check", "--target", target);

    await expectRunSuccess("update", "--target", target, "--apply");
    const stale = path.join(target, ".agents", "skills", "retired-skill");
    await mkdir(stale, { recursive: true });
    await Promise.all([
      writeFile(path.join(stale, ".keenko-generated"), "generated by keenko-playbook\n"),
      writeFile(path.join(stale, "SKILL.md"), "stale\n"),
    ]);
    await expectRunFailure("check", "--target", target);
  });

  test("rejects unknown config schema versions before update", async () => {
    const target = await fixture();
    await expectRunSuccess("install", "--target", target);
    const configPath = path.join(target, ".playbook", "config.json");
    const config = await readJsonObject(configPath);
    config.schemaVersion = 999;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const result = await expectRunFailure("update", "--target", target);
    expect(result.stderr).toContain("Unsupported .playbook config schemaVersion");
  });

  test("vendor adapters carry notices, provenance, and a closed authority guard into both harnesses", async () => {
    const target = await fixture();
    await expectRunSuccess("install", "--target", target);
    await Promise.all(
      [".playbook/skills", ".agents/skills", ".claude/skills"].map(async (root) => {
        const dir = path.join(target, root, "grilling");
        expect(await exists(path.join(dir, "UPSTREAM_LICENSE"))).toBe(true);
        expect(await exists(path.join(dir, "UPSTREAM_PROVENANCE.json"))).toBe(true);
        const skill = await readFile(path.join(dir, "SKILL.md"), "utf-8");
        expect(skill).toContain("Only route to skills that are actually installed");
        expect(skill).toContain("Do not commit, push, merge");
      })
    );
  });
});

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(filePath, "utf-8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected JSON object at ${filePath}`);
  }
  return Object.fromEntries(Object.entries(value));
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected array at ${label}`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new TypeError(`Expected string at ${label}[${index}]`);
    }
    return item;
  });
}

async function hashTree(root: string) {
  const files = await findAllFiles(root);
  const hashes = await Promise.all(
    files.map(async (file) => {
      const relativePath = path.relative(root, file).replaceAll("\\", "/");
      const content = await readFile(file);
      return { hash: createHash("sha256").update(content).digest("hex"), relativePath };
    })
  );
  const out: Record<string, string> = {};
  for (const { hash, relativePath } of hashes) {
    out[relativePath] = hash;
  }
  return out;
}

async function findAllFiles(root: string): Promise<string[]> {
  if (!(await exists(root))) {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return await findAllFiles(entryPath);
      }
      if (entry.isFile()) {
        return [entryPath];
      }
      return [];
    })
  );
  return paths.flat().toSorted();
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
