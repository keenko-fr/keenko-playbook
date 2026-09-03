import { readFile, rm, writeFile } from "node:fs/promises";

const generatorPath = "src/generators/preset/generator.ts";
const packagePath = "package.json";

let generator = await readFile(generatorPath, "utf-8");
const before = String.raw`const codegen = Bun.spawnSync(["bun", "run", "codegen"], options);\nif (codegen.exitCode !== 0) {\n  throw new Error("Keenko codegen failed after shadcn updated dependencies");\n}`;
const after = String.raw`const install = Bun.spawnSync(["bun", "install"], options);\nif (install.exitCode !== 0) {\n  throw new Error("bun install failed after shadcn updated workspace dependencies");\n}\n\nconst codegen = Bun.spawnSync(["bun", "run", "codegen"], options);\nif (codegen.exitCode !== 0) {\n  throw new Error("Keenko codegen failed after shadcn updated dependencies");\n}\n\nconst format = Bun.spawnSync(["bun", "run", "format"], options);\nif (format.exitCode !== 0) {\n  throw new Error("Keenko format failed after shadcn generated components");\n}\n\nconst lintFix = Bun.spawnSync(["bun", "run", "lint:fix"], options);\nif (lintFix.exitCode !== 0) {\n  throw new Error("Keenko lint fixes failed after shadcn generated components");\n}\n\nconst reformat = Bun.spawnSync(["bun", "run", "format"], options);\nif (reformat.exitCode !== 0) {\n  throw new Error("Keenko format failed after lint fixes");\n}`;

if (!generator.includes(before)) {
  throw new Error("Expected generated UI wrapper block was not found");
}
generator = generator.replace(before, after);

const uiDependencyNeedle = '        "@base-ui/react": versions.baseUi,\n';
if (!generator.includes(uiDependencyNeedle)) {
  throw new Error("Expected UI dependency insertion point was not found");
}
generator = generator.replace(uiDependencyNeedle, `${uiDependencyNeedle}        "class-variance-authority": "0.7.1",\n`);

const backendOverrideNeedle = String.raw`    {\n      files: ["packages/backend/**/*.ts"],`;
const uiOverride = String.raw`    {\n      files: ["packages/ui/**/*"],\n      rules: { "eslint/sort-keys": "off" },\n    },\n`;
if (!generator.includes(backendOverrideNeedle)) {
  throw new Error("Expected lint override insertion point was not found");
}
generator = generator.replace(backendOverrideNeedle, `${uiOverride}${backendOverrideNeedle}`);

const uiTsconfigNeedle = '  tree.write("packages/ui/tsconfig.json", packageTsconfig("src/**/*.ts", "src/**/*.tsx"));';
const uiTsconfigReplacement =
  '  tree.write("packages/ui/tsconfig.json", json({ compilerOptions: { composite: false, jsx: "react-jsx" }, extends: "../../tsconfig.json", include: ["src/**/*.ts", "src/**/*.tsx"] }));';
if (!generator.includes(uiTsconfigNeedle)) {
  throw new Error("Expected UI tsconfig insertion point was not found");
}
generator = generator.replace(uiTsconfigNeedle, uiTsconfigReplacement);
await writeFile(generatorPath, generator);

const migrationPath = "src/migrations/normalize-check.ts";
let migration = await readFile(migrationPath, "utf-8");
const migrationConstants = 'const PREVIOUS_OXLINT = "1.80.0";\nconst CURRENT_OXLINT = "1.81.0";';
const migrationConstantsReplacement = `${migrationConstants}\nconst PREVIOUS_EFFECT_TSGO = "0.38.0";\nconst CURRENT_EFFECT_TSGO = "0.39.1";\nconst PREVIOUS_EFFECT_PLUGIN = "0.11.0";\nconst CURRENT_EFFECT_PLUGIN = "0.12.0";`;
if (!migration.includes(migrationConstants)) {
  throw new Error("Expected migration tooling constants were not found");
}
migration = migration.replace(migrationConstants, migrationConstantsReplacement);
const oxlintMigration = `  if (devDependencies.oxlint === PREVIOUS_OXLINT) devDependencies.oxlint = CURRENT_OXLINT;\n  else if (devDependencies.oxlint !== CURRENT_OXLINT) {\n    throw new Error("Cannot migrate devDependencies.oxlint because it was customized; reconcile it with the Keenko tooling baseline first");\n  }`;
const coupledMigration = `${oxlintMigration}\n  migrateTool(devDependencies, "@effect/tsgo", PREVIOUS_EFFECT_TSGO, CURRENT_EFFECT_TSGO);\n  migrateTool(devDependencies, "oxlint-plugin-effect", PREVIOUS_EFFECT_PLUGIN, CURRENT_EFFECT_PLUGIN);`;
if (!migration.includes(oxlintMigration)) {
  throw new Error("Expected Oxlint migration block was not found");
}
migration = migration.replace(oxlintMigration, coupledMigration);
const migrationHelperNeedle = 'function object(value: unknown, label: string): Record<string, unknown> {';
const migrationHelper = `function migrateTool(devDependencies: Record<string, string>, name: string, previous: string, current: string) {\n  if (devDependencies[name] === previous) {\n    devDependencies[name] = current;\n    return;\n  }\n  if (devDependencies[name] !== current) {\n    throw new Error(\`Cannot migrate devDependencies.\${name} because it was customized; reconcile it with the Keenko tooling baseline first\`);\n  }\n}\n\n${migrationHelperNeedle}`;
if (!migration.includes(migrationHelperNeedle)) {
  throw new Error("Expected migration helper insertion point was not found");
}
migration = migration.replace(migrationHelperNeedle, migrationHelper);
await writeFile(migrationPath, migration);

const migrationTestPath = "tests/migrations.test.ts";
let migrationTest = await readFile(migrationTestPath, "utf-8");
const migrationCases = 'test.each([[oldest, "1.80.0"], [firstPass, "1.81.0"]] as const)("supports a pre-v1 baseline", (check, oxlint) => {';
const migrationCasesReplacement =
  'test.each([[oldest, "1.80.0", "0.38.0", "0.11.0"], [firstPass, "1.81.0", "0.39.1", "0.12.0"]] as const)("supports a pre-v1 baseline", (check, oxlint, effectTsgo, effectPlugin) => {';
if (!migrationTest.includes(migrationCases)) {
  throw new Error("Expected migration test cases were not found");
}
migrationTest = migrationTest.replace(migrationCases, migrationCasesReplacement);
const migrationDeps = 'devDependencies: { oxlint },';
const migrationDepsReplacement = 'devDependencies: { "@effect/tsgo": effectTsgo, oxlint, "oxlint-plugin-effect": effectPlugin },';
if (!migrationTest.includes(migrationDeps)) {
  throw new Error("Expected migration test dependency fixture was not found");
}
migrationTest = migrationTest.replace(migrationDeps, migrationDepsReplacement);
const migrationAssertion = '    expect(migrated).toContain(\'"oxlint": "1.81.0"\');';
const migrationAssertionReplacement = `${migrationAssertion}\n    expect(migrated).toContain('"@effect/tsgo": "0.39.1"');\n    expect(migrated).toContain('"oxlint-plugin-effect": "0.12.0"');`;
if (!migrationTest.includes(migrationAssertion)) {
  throw new Error("Expected migration assertion was not found");
}
migrationTest = migrationTest.replace(migrationAssertion, migrationAssertionReplacement);
await writeFile(migrationTestPath, migrationTest);

const productTestPath = "tests/packed-product.test.ts";
let productTest = await readFile(productTestPath, "utf-8");
const baselineDeps = '  const devDependencies = record(pkg.devDependencies, "baseline devDependencies");\n  devDependencies.oxlint = oxlint;\n  pkg.devDependencies = devDependencies;';
const baselineDepsReplacement = `${baselineDeps}\n  if (oxlint === "1.80.0") {\n    devDependencies["@effect/tsgo"] = "0.38.0";\n    devDependencies["oxlint-plugin-effect"] = "0.11.0";\n  }`;
if (!productTest.includes(baselineDeps)) {
  throw new Error("Expected packed baseline dependency block was not found");
}
productTest = productTest.replace(baselineDeps, baselineDepsReplacement);
const upgradedAssertion = '  expect(record(pkg.devDependencies, "upgraded devDependencies").oxlint).toBe("1.81.0");';
const upgradedAssertionReplacement = `  const devDependencies = record(pkg.devDependencies, "upgraded devDependencies");\n  expect(devDependencies.oxlint).toBe("1.81.0");\n  expect(devDependencies["@effect/tsgo"]).toBe("0.39.1");\n  expect(devDependencies["oxlint-plugin-effect"]).toBe("0.12.0");`;
if (!productTest.includes(upgradedAssertion)) {
  throw new Error("Expected packed upgrade dependency assertion was not found");
}
productTest = productTest.replace(upgradedAssertion, upgradedAssertionReplacement);

const tempNeedle = '  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-packed-"));\n  try {';
const tempReplacement = '  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-packed-"));\n  let registry: TestRegistry | undefined;\n  try {';
if (!productTest.includes(tempNeedle)) {
  throw new Error("Expected packed test temp setup was not found");
}
productTest = productTest.replace(tempNeedle, tempReplacement);
const versionNeedle = '    const currentVersion = string(packageJson.version, "package.json.version");';
const versionReplacement = `${versionNeedle}\n    registry = startRegistry(currentVersion, tarball, packageJson);`;
if (!productTest.includes(versionNeedle)) {
  throw new Error("Expected packed test current version setup was not found");
}
productTest = productTest.replace(versionNeedle, versionReplacement);
productTest = productTest.replace('run("node", [cli, "upgrade", `keenko@file:${tarball}`], baselineA);', 'run("node", [cli, "upgrade", currentVersion], baselineA, registry.env);');
productTest = productTest.replace('await assertUpgraded(baselineA);', 'await assertUpgraded(baselineA, registry.env);');
productTest = productTest.replace('run("node", [cli, "upgrade", `keenko@file:${tarball}`], baselineB);', 'run("node", [cli, "upgrade", currentVersion], baselineB, registry.env);');
productTest = productTest.replace('await assertUpgraded(baselineB);', 'await assertUpgraded(baselineB, registry.env);');
const guidanceNeedle = '    const guidanceTarget = await versionedTarball(tarball, path.join(temp, "guidance-target.tgz"), nextPatch(currentVersion));';
const guidanceReplacement = '    const guidanceVersion = nextPatch(currentVersion);\n    const guidanceTarget = await versionedTarball(tarball, path.join(temp, "guidance-target.tgz"), guidanceVersion);';
if (!productTest.includes(guidanceNeedle)) {
  throw new Error("Expected guidance tarball setup was not found");
}
productTest = productTest.replace(guidanceNeedle, guidanceReplacement);
const guidanceUpgradeNeedle = '    run("node", [path.join(baselineB, "node_modules/keenko/dist/cli/keenko.js"), "upgrade", `keenko@file:${guidanceTarget}`], baselineB);';
const guidanceUpgradeReplacement = '    registry.add(guidanceVersion, guidanceTarget);\n    run("node", [path.join(baselineB, "node_modules/keenko/dist/cli/keenko.js"), "upgrade", guidanceVersion], baselineB, registry.env);';
if (!productTest.includes(guidanceUpgradeNeedle)) {
  throw new Error("Expected guidance upgrade invocation was not found");
}
productTest = productTest.replace(guidanceUpgradeNeedle, guidanceUpgradeReplacement);
const finalInstallNeedle = '    run("bun", ["install", "--frozen-lockfile"], baselineB);\n    run("bun", ["run", "check"], baselineB);';
const finalInstallReplacement = '    run("bun", ["install", "--frozen-lockfile"], baselineB, registry.env);\n    run("bun", ["run", "check"], baselineB);';
if (!productTest.includes(finalInstallNeedle)) {
  throw new Error("Expected final packed install was not found");
}
productTest = productTest.replace(finalInstallNeedle, finalInstallReplacement);
const finallyNeedle = '  } finally {\n    await rm(temp, { force: true, recursive: true });';
const finallyReplacement = '  } finally {\n    registry?.stop();\n    await rm(temp, { force: true, recursive: true });';
if (!productTest.includes(finallyNeedle)) {
  throw new Error("Expected packed test cleanup was not found");
}
productTest = productTest.replace(finallyNeedle, finallyReplacement);
const assertSignature = 'async function assertUpgraded(project: string) {';
if (!productTest.includes(assertSignature)) {
  throw new Error("Expected assertUpgraded helper was not found");
}
productTest = productTest.replace(assertSignature, 'async function assertUpgraded(project: string, registryEnv: Record<string, string>) {');
const assertInstallNeedle = '  run("bun", ["install", "--frozen-lockfile"], project);\n  run("bun", ["run", "check"], project);';
const assertInstallReplacement = '  run("bun", ["install", "--frozen-lockfile"], project, registryEnv);\n  run("bun", ["run", "check"], project);';
if (!productTest.includes(assertInstallNeedle)) {
  throw new Error("Expected assertUpgraded install was not found");
}
productTest = productTest.replace(assertInstallNeedle, assertInstallReplacement);

const registryInsertionNeedle = 'function nextPatch(version: string) {';
const registryHelper = `type TestRegistry = {\n  add: (version: string, tarball: string) => void;\n  env: Record<string, string>;\n  stop: () => void;\n};\n\nfunction startRegistry(version: string, tarball: string, manifest: Record<string, unknown>): TestRegistry {\n  const packages = new Map<string, string>([[version, tarball]]);\n  let origin = "";\n  const server = Bun.serve({\n    hostname: "127.0.0.1",\n    port: 0,\n    async fetch(request) {\n      const url = new URL(request.url);\n      if (url.pathname === "/keenko" || url.pathname === "/keenko/") {\n        return Response.json(packument());\n      }\n\n      const tarballMatch = /^\\/keenko\\/-\\/keenko-(?<version>\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)\\.tgz$/u.exec(url.pathname);\n      if (tarballMatch?.groups?.version !== undefined) {\n        const packageTarball = packages.get(tarballMatch.groups.version);\n        return packageTarball === undefined\n          ? new Response("Not found", { status: 404 })\n          : new Response(await readFile(packageTarball), { headers: { "content-type": "application/octet-stream" } });\n      }\n\n      if (url.pathname.startsWith("/keenko/")) {\n        const requestedVersion = decodeURIComponent(url.pathname.slice("/keenko/".length));\n        const versionEntry = versionManifest(requestedVersion);\n        if (versionEntry !== undefined) {\n          return Response.json(versionEntry);\n        }\n      }\n\n      const upstream = new URL(\`\\${url.pathname}\\${url.search}\`, "https://registry.npmjs.org");\n      const headers = new Headers();\n      const accept = request.headers.get("accept");\n      if (accept !== null) {\n        headers.set("accept", accept);\n      }\n      const response = await fetch(upstream, { headers, method: request.method });\n      const responseHeaders = new Headers(response.headers);\n      responseHeaders.delete("content-encoding");\n      responseHeaders.delete("content-length");\n      const body = request.method === "HEAD" ? null : await response.arrayBuffer();\n      return new Response(body, { headers: responseHeaders, status: response.status, statusText: response.statusText });\n    },\n  });\n  origin = \`http://127.0.0.1:\\${server.port}\`;\n\n  function versionManifest(packageVersion: string) {\n    if (!packages.has(packageVersion)) {\n      return undefined;\n    }\n    return {\n      ...manifest,\n      dist: { tarball: \`\\${origin}/keenko/-/keenko-\\${packageVersion}.tgz\` },\n      name: "keenko",\n      version: packageVersion,\n    };\n  }\n\n  function packument() {\n    const versions = Object.fromEntries(\n      [...packages.keys()].map((packageVersion) => [packageVersion, versionManifest(packageVersion)])\n    );\n    return {\n      "dist-tags": { latest: [...packages.keys()].at(-1) },\n      name: "keenko",\n      versions,\n    };\n  }\n\n  return {\n    add(packageVersion, packageTarball) {\n      packages.set(packageVersion, packageTarball);\n    },\n    env: { BUN_CONFIG_REGISTRY: origin, NPM_CONFIG_REGISTRY: origin },\n    stop() {\n      void server.stop(true);\n    },\n  };\n}\n\n${registryInsertionNeedle}`;
if (!productTest.includes(registryInsertionNeedle)) {
  throw new Error("Expected packed registry helper insertion point was not found");
}
productTest = productTest.replace(registryInsertionNeedle, registryHelper);
await writeFile(productTestPath, productTest);

const cliPath = "cli/keenko.ts";
let cli = await readFile(cliPath, "utf-8");
const pathImport = 'import path from "node:path";';
if (!cli.includes(pathImport)) {
  throw new Error("Expected CLI path import was not found");
}
cli = cli.replace(pathImport, 'import { createRequire } from "node:module";\nimport path from "node:path";');
const nxRunner = 'async function nx(args: string[], cwd: string) {\n  await run(process.execPath, [path.join(cwd, "node_modules/nx/bin/nx.js"), ...args], cwd);\n}';
const nxRunnerReplacement = 'async function nx(args: string[], cwd: string) {\n  const requireFromProject = createRequire(path.join(cwd, "package.json"));\n  const nxCli = requireFromProject.resolve("nx");\n  await run(process.execPath, [nxCli, ...args], cwd);\n}';
if (!cli.includes(nxRunner)) {
  throw new Error("Expected CLI Nx runner was not found");
}
cli = cli.replace(nxRunner, nxRunnerReplacement);
await writeFile(cliPath, cli);

const pkg = JSON.parse(await readFile(packagePath, "utf-8")) as { scripts: Record<string, string> };
pkg.scripts.format = "oxfmt .";
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
await rm(import.meta.filename);
