import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const [runtimePath, scriptPath, statePath] = process.argv;
if (runtimePath === undefined || scriptPath === undefined || statePath === undefined) {
  throw new Error("Expected Bun runtime, registry script path, and registry state path");
}

interface RegistryPackage {
  manifest: Record<string, unknown>;
  versions: Record<string, string>;
}

interface RegistryState {
  packages: Record<string, RegistryPackage>;
}

async function readState(): Promise<RegistryState> {
  const value: unknown = JSON.parse(await readFile(statePath, "utf-8"));
  const root = object(value, "Registry state");
  const packageRecord = object(root.packages, "Registry state packages");
  const packages = Object.fromEntries(
    Object.entries(packageRecord).map(([name, entry]) => {
      const packageState = object(entry, `Registry package ${name}`);
      const manifest = object(packageState.manifest, `Registry package ${name} manifest`);
      const rawVersions = object(packageState.versions, `Registry package ${name} versions`);
      const versions = Object.fromEntries(
        Object.entries(rawVersions).map(([version, target]) => {
          if (typeof target !== "string") {
            throw new TypeError(`Registry tarball path for ${name}@${version} must be a string`);
          }
          return [version, target];
        })
      );
      return [name, { manifest, versions } satisfies RegistryPackage];
    })
  );
  return { packages };
}

let origin = "";
const server = Bun.serve({
  async fetch(request) {
    const url = new URL(request.url);
    const state = await readState();
    const packageEntry = Object.entries(state.packages).find(
      ([name]) => url.pathname === `/${name}` || url.pathname === `/${name}/` || url.pathname.startsWith(`/${name}/`)
    );

    if (packageEntry !== undefined) {
      const [name, packageState] = packageEntry;
      if (url.pathname === `/${name}` || url.pathname === `/${name}/`) {
        const versions = Object.fromEntries(
          await Promise.all(
            Object.keys(packageState.versions).map(
              async (version) => [version, await versionManifest(name, packageState, version)] as const
            )
          )
        );
        return Response.json({ "dist-tags": { latest: Object.keys(packageState.versions).at(-1) }, name, versions });
      }

      const tarballPrefix = `/${name}/-/${name}-`;
      if (url.pathname.startsWith(tarballPrefix) && url.pathname.endsWith(".tgz")) {
        const version = url.pathname.slice(tarballPrefix.length, -".tgz".length);
        const tarballPath = packageState.versions[version];
        if (tarballPath === undefined) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(await readFile(tarballPath), { headers: { "content-type": "application/octet-stream" } });
      }

      const versionPrefix = `/${name}/`;
      if (url.pathname.startsWith(versionPrefix)) {
        const version = decodeURIComponent(url.pathname.slice(versionPrefix.length));
        const manifest = await versionManifest(name, packageState, version);
        if (manifest !== null) {
          return Response.json(manifest);
        }
      }
    }

    const upstream = new URL(url.pathname + url.search, "https://registry.npmjs.org");
    return Response.redirect(upstream, 307);
  },
  hostname: "127.0.0.1",
  port: 0,
});
origin = `http://127.0.0.1:${server.port}`;
console.log(origin);

async function versionManifest(name: string, packageState: RegistryPackage, version: string): Promise<Record<string, unknown> | null> {
  const tarballPath = packageState.versions[version];
  if (tarballPath === undefined) {
    return null;
  }
  const tarball = await readFile(tarballPath);
  return {
    ...packageState.manifest,
    dist: {
      integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
      shasum: createHash("sha1").update(tarball).digest("hex"),
      tarball: `${origin}/${name}/-/${name}-${version}.tgz`,
    },
    name,
    version,
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}
