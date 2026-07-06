#!/usr/bin/env node
/**
 * ## P3 Release & Stabilization
 *
 * Roland CLI bootstrap — SDK limits, env bootstrap, opt-in telemetry, Commander program entry.
 */

import { bootstrapRolandEnv } from './utils/project-root.js';
import { configureSdkProcessLimits } from './utils/sdk-lifecycle.js';
import { logger } from './utils/logger.js';
import { readPackageVersion } from './utils/package-version.js';
import { hasConsent, initTelemetry } from './telemetry.js';
import { runProgram } from './cli/program.js';

configureSdkProcessLimits();
bootstrapRolandEnv({ binUrl: import.meta.url, cwd: process.cwd() });

if (hasConsent()) {
  initTelemetry({
    release: `roland@${readPackageVersion(import.meta.url)}`,
    environment: process.env.NODE_ENV ?? 'production',
  });
}

runProgram(process.argv.slice(2)).catch((err) => {
  logger.error('❌ Fatal error:', err);
  process.exit(1);
});
