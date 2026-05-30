// Resolve hook: append .ts (or /index.ts) to extensionless relative imports so
// Node's type-stripping can load the pipeline source under `npm test`.
//
// Comments here avoid double dashes, using commas and colons.

import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExt = /\.[cm]?[jt]sx?$/i.test(specifier);
  if (relative && !hasExt && context.parentURL?.startsWith("file:")) {
    const base = dirname(fileURLToPath(context.parentURL));
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      const full = resolvePath(base, candidate);
      if (existsSync(full)) {
        return nextResolve(pathToFileURL(full).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
