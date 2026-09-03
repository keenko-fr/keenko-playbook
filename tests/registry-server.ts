import { readFile } from "node:fs/promises";

const statePath = process.argv[2];
if (statePath === undefined) {
  throw new Error("Expected registry state path");
}

type RegistryState = {
  manifest: Record<string, unknown>;
  packages: Record<string, string>;
};

async function readState(): Promise<RegistryState> {
  const value: unknown = JSON.parse(await readFile(statePath, "utf-8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Registry state must be an object");
  }
  const record = Object.fromEntries(Object.entries(value));
  if (record.manifest === null || typeof record.manifest !== "object" || Array.isArray(record.manifest)) {
    throw new TypeError("Registry state manifest must be an object");
  }
  if (record.packages === null || typeof record.packages !== "object" || Array.isArray(record.packages)) {
    throw new TypeError("Registry state packages must be an object");
  }
  const packages = Object.fromEntries(Object.entries(record.packages).map(([version, target]) => {
    if (typeof target !== "string") {
      throw new TypeError(`Registry tarball path for ${version} must be a string`);
    }
    return [version, target];
  }));
  return { manifest: Object.fromEntries(Object.entries(record.manifest)), packages };
}

let origin = "";
const server = Bun.serve({
  async fetch(request) {
    const url = new URL(request.url);
    const state = await readState();

    if (url.pathname === "/keenko" || url.pathname === "/keenko/") {
      const versions = Object.fromEntries(Object.keys(state.packages).map((version) => [version, versionManifest(state, version)]));
      return Response.json({ "dist-tags": { latest: Object.keys(state.packages).at(-1) }, name: "keenko", versions });
    }

    const tarballMatch = /^\/keenko\/-\/keenko-(?<version>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.tgz$/u.exec(url.pathname);
    if (tarballMatch?.groups?.version !== undefined) {
      const packageTarball = state.packages[tarballMatch.groups.version];
      if (packageTarball === undefined) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(await readFile(packageTarball), { headers: { "content-type": "application/octet-stream" } });
    }

    if (url.pathname.startsWith("/keenko/")) {
      const version = decodeURIComponent(url.pathname.slice("/keenko/".length));
      const entry = versionManifest(state, version);
      if (entry !== null) {
        return Response.json(entry);
      }
    }

    const upstream = new URL(url.pathname + url.search, "https://registry.npmjs.org");
    const headers = new Headers();
    const accept = request.headers.get("accept");
    if (accept !== null) {
      headers.set("accept", accept);
    }
    const response = await fetch(upstream, { headers, method: request.method });
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    const body = request.method === "HEAD" ? null : await response.arrayBuffer();
    return new Response(body, { headers: responseHeaders, status: response.status, statusText: response.statusText });
  },
  hostname: "127.0.0.1",
  port: 0,
});
origin = `http://127.0.0.1:${server.port}`;
console.log(origin);

function versionManifest(state: RegistryState, version: string): Record<string, unknown> | null {
  if (state.packages[version] === undefined) {
    return null;
  }
  return {
    ...state.manifest,
    dist: { tarball: `${origin}/keenko/-/keenko-${version}.tgz` },
    name: "keenko",
    version,
  };
}
