// Test-only module resolver hook.
//
// The pipeline source uses extensionless relative imports (matching the rest of
// the codebase, which the Next bundler resolves). Node's native TypeScript
// type-stripping runs files directly but does not add the .ts extension during
// ESM resolution, so this hook appends it for relative specifiers that point at
// a .ts file. It is loaded only for `npm test` via the Node import hook flag;
// it never ships.
//
// Comments here avoid double dashes, using commas and colons.

import { register } from "node:module";

register("./ts-test-hooks.mjs", import.meta.url);
