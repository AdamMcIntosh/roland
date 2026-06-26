#!/usr/bin/env npx tsx
/**
 * Loop Engineering readiness gate — run before heavy template work.
 *
 * Usage: npm run loop:ready-check
 */

import {
  runLoopReadinessCheck,
  formatLoopReadinessReport,
} from '../src/loop-engine/loop-readiness.js';

const report = runLoopReadinessCheck();
console.log(formatLoopReadinessReport(report));
process.exit(report.ready ? 0 : 1);
