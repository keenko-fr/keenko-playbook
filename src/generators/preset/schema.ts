import { Schema as S } from "effect";
import validatePackageName from "validate-npm-package-name";

// INTERNALS -------------------------------------------------------------------------------------------------------------------------------
const packageNames = (name: string) => [name, `@${name}/web`, `@${name}/backend`, `@${name}/ui`, `@${name}/shared`];

const validateIdentity = (name: string) => {
  if (!/^[A-Za-z]/u.test(name)) return "Workspace identity must start with a letter";

  if (!packageNames(name).every((packageName) => validatePackageName(packageName).validForNewPackages))
    return `"${name}" cannot be represented as a Keenko package identity`;

  return true;
};

// SCHEMAS ---------------------------------------------------------------------------------------------------------------------------------
export const sWorkspaceIdentity = S.String.check(S.makeFilter(validateIdentity));

export const sPresetGeneratorSchema = S.Struct({ name: sWorkspaceIdentity });

// TYPES -----------------------------------------------------------------------------------------------------------------------------------
export type PresetGeneratorSchema = typeof sPresetGeneratorSchema.Type;
