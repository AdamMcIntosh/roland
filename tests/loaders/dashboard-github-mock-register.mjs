/**
 * Entry for --import: registers dashboard-github-mock-hook.mjs before serve-dashboard.js loads.
 */

import { register } from 'node:module';

register('./dashboard-github-mock-hook.mjs', import.meta.url);
