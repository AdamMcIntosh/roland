#!/usr/bin/env node
/**
 * ## P2 Polish & Reach
 *
 * Roland CLI bootstrap — SDK limits, env bootstrap, Commander program entry.
 */

import { bootstrapRolandEnv } from './utils/project-root.js';
import { configureSdkProcessLimits } from './utils/sdk-lifecycle.js';
import { logger } from './utils/logger.js';
import { runProgram } from './cli/program.js';

configureSdkProcessLimits();
bootstrapRolandEnv({ binUrl: import.meta.url, cwd: process.cwd() });

runProgram(process.argv.slice(2)).catch((err) => {
  logger.error('❌ Fatal error:', err);
  process.exit(1);
});
