from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


replace(
    "cli/playbook.ts",
    '''  for (const harness of [".agents", ".claude"]) {
    const root = join(target, harness, "skills");
    for (const name of skillNames) {
      const dir = join(root, name);
      if ((await exists(dir)) && !(await exists(join(dir, GENERATED_MARKER)))) {
        throw new Error(`Refusing to overwrite human-owned skill directory: ${dir}`);
      }
    }
  }

  const stageRoot = await mkdtemp(join(target, ".keenko-stage-"));''',
    '''  await preflightManagedPaths(target);
  for (const harness of [".agents", ".claude"]) {
    const root = join(target, harness, "skills");
    for (const name of skillNames) {
      const dir = join(root, name);
      if ((await exists(dir)) && !(await exists(join(dir, GENERATED_MARKER)))) {
        throw new Error(`Refusing to overwrite human-owned skill directory: ${dir}`);
      }
    }
  }

  const stageRoot = await mkdtemp(join(target, ".keenko-stage-"));''',
)

replace(
    "cli/playbook.ts",
    '''async function applyMaterialization(target: string, stageRoot: string, managed: Map<string, string>, skillNames: string[]) {''',
    '''async function preflightManagedPaths(target: string) {
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

async function applyMaterialization(target: string, stageRoot: string, managed: Map<string, string>, skillNames: string[]) {''',
)

replace(
    "cli/playbook.ts",
    '''    "CONTEXT.md",
    "docs/project/architecture.md",
    "docs/project/overrides.md",
  ];''',
    '''    "CONTEXT.md",
    "docs/project",
  ];''',
)

replace(
    "cli/playbook.ts",
    '''  } catch (error) {
    for (const rel of tracked.reverse()) {
      const dst = join(target, rel);
      await rm(dst, { recursive: true, force: true });
      if (existed.get(rel)) await cp(join(rollbackRoot, rel), dst, { recursive: true });
    }
    throw error;
  } finally {''',
    '''  } catch (error) {
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
    if (rollbackErrors.length) console.error(`Rollback encountered cleanup errors:\n${rollbackErrors.join("\n")}`);
    throw error;
  } finally {''',
)

replace(
    "tests/consumer.test.ts",
    '''  test("detects managed-block tampering and retired generated skills", async () => {''',
    '''  test("preflights scaffold parent collisions without partial writes and remains retryable", async () => {
    const target = await fixture();
    await mkdir(join(target, "docs"), { recursive: true });
    await writeFile(join(target, "docs", "project"), "human-owned project path\\n");
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

  test("detects managed-block tampering and retired generated skills", async () => {''',
)

replace(
    "package.json",
    '"check:release": "bun run typecheck && bun cli/playbook.ts check --source --release && bun test",',
    '"check:release": "bun run typecheck && bun cli/playbook.ts check --source --release && bun test && bun run vendor:check",',
)

check = Path(".github/workflows/check.yml")
text = check.read_text()
old = '''      - name: Verify committed vendor snapshots against pinned upstream
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: bun run vendor:check
      - name: Release-grade check
        run: bun run check:release
'''
new = '''      - name: Release-grade check
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: bun run check:release
'''
if old not in text:
    raise SystemExit("missing check workflow vendor/release block")
check.write_text(text.replace(old, new, 1))

release = Path(".github/workflows/release.yml")
text = release.read_text()
text = text.replace(
    '      - run: bun run check:release\n',
    '      - name: Release-grade verification\n        env:\n          GITHUB_TOKEN: ${{ github.token }}\n        run: bun run check:release\n',
)
anchor = '''      - run: bun install --frozen-lockfile
      - name: Release-grade verification
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: bun run check:release
      - run: bun run release:verify-gate
'''
replacement = '''      - run: bun install --frozen-lockfile
      - name: Assert exact reviewed main commit
        run: |
          test "$GITHUB_REF" = "refs/heads/main"
          git fetch origin main
          test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
      - name: Release-grade verification
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: bun run check:release
      - run: bun run release:verify-gate
'''
if anchor not in text:
    raise SystemExit("missing publish release anchor")
release.write_text(text.replace(anchor, replacement, 1))

runbook = Path("docs/release-v1.md")
text = runbook.read_text()
line = "\nPublication must be dispatched from `main`, assert `HEAD` equals the exact current `origin/main`, and pass immutable pinned-upstream vendor verification before tagging.\n"
if "assert `HEAD` equals the exact current `origin/main`" not in text:
    runbook.write_text(text.rstrip() + line)

Path(".github/workflows/fix-second-review.yml").unlink()
Path(".github/scripts/fix-second-review.py").unlink()
