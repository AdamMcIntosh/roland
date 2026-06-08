/**
 * Node ESM resolve hook — redirects serve-dashboard.js imports of
 * ./dashboard-github.js to the test double in tests/fixtures/.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const mockModulePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/mock-dashboard-github.mjs',
);

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL ?? '';
  if (parent.includes('serve-dashboard.js') && specifier === './dashboard-github.js') {
    return {
      url: pathToFileURL(mockModulePath).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
