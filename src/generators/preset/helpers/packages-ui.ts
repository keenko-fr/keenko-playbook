import { addDependenciesToPackageJson, generateFiles, readJson, type Tree } from "@nx/devkit";
import { Effect as E, Option as O, Path, Struct } from "effect";

import { TanStackCreateFailure } from "../../errors.js";
import type { PackageJson } from "../../helpers.js";
import { packageVersions } from "../../versions.js";

// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
const dependencies = Struct.pick(packageVersions, [
  "@base-ui/react",
  "@fontsource-variable/inter",
  "class-variance-authority",
  "cn",
  "lucide-react",
  "shadcn",
  "tw-animate-css",
]);

const devDependencies = Struct.pick(packageVersions, ["@testing-library/dom", "@testing-library/react", "jsdom", "tailwindcss"]);

// GENERATE --------------------------------------------------------------------------------------------------------------------------------
export const generateUi = E.fn("keenko.preset.generateUi")(function* (tree: Tree, workspace: string) {
  const path = yield* Path.Path;
  const source = yield* path.fromFileUrl(new URL("../files/ui", import.meta.url)).pipe(E.orDie);

  const webPackageJson = readJson<PackageJson>(tree, "apps/web/package.json");
  const react = O.fromNullishOr(webPackageJson.dependencies?.react);
  const reactDom = O.fromNullishOr(webPackageJson.dependencies?.["react-dom"]);
  if (O.isNone(react) || O.isNone(reactDom)) return yield* new TanStackCreateFailure({ issue: "unexpected_output" });

  generateFiles(tree, source, "packages/ui", { workspace });
  addDependenciesToPackageJson(
    tree,
    { ...dependencies, react: react.value, "react-dom": reactDom.value },
    devDependencies,
    "packages/ui/package.json"
  );
});
