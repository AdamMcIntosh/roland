#!/usr/bin/env node
/** Warn after npm install if dist/ was not built (non-fatal). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'dist', 'index.js');

if (!fs.existsSync(entry)) {
  console.warn(
    '\n[roland] dist/ is missing — run `npm run build` before using the global `roland` CLI.\n',
  );
}
