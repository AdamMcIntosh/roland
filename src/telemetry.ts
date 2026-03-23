/**
 * Phase 4: Opt-in telemetry via Sentry (errors and sessions).
 * Initialized only when user has consented (e.g. /rco-consent:yes).
 * DSN is a placeholder; set SENTRY_DSN or RCO_SENTRY_DSN for real reporting.
 */

import * as Sentry from '@sentry/node';
import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_PREFIX = '[RCO telemetry]';

const ConsentSchema = { consent: true as const };
type Consent = typeof ConsentSchema;

/** Default consent file: ~/.rco/telemetry-consent.json (or .rco in cwd for project-scoped). */
function getConsentPath(scope: 'user' | 'project' = 'user'): string {
  const base = scope === 'project' ? process.cwd() : os.homedir();
  const dir = path.join(base, '.rco');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'telemetry-consent.json');
}

/** Check if user has opted in (file exists and valid, or env RCO_TELEMETRY_CONSENT=1). */
export function hasConsent(scope: 'user' | 'project' = 'user'): boolean {
  if (process.env.RCO_TELEMETRY_CONSENT === '1' || process.env.RCO_CONSENT === 'yes') {
    return true;
  }
  try {
    const p = getConsentPath(scope);
    if (!fs.existsSync(p)) return false;
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as unknown;
    return typeof raw === 'object' && raw !== null && 'consent' in raw && (raw as Consent).consent === true;
  } catch {
    return false;
  }
}

/** Persist consent (e.g. after /rco-consent:yes). */
export function setConsent(scope: 'user' | 'project' = 'user'): void {
  const p = getConsentPath(scope);
  fs.writeFileSync(p, JSON.stringify({ consent: true }, null, 2), 'utf-8');
  if (process.env.RCO_VERBOSE !== '0') {
    console.error(`${LOG_PREFIX} Consent saved to ${p}`);
  }
}

const DSN_PLACEHOLDER = 'https://placeholder@o0.ingest.sentry.io/0';
const DSN = process.env.SENTRY_DSN || process.env.RCO_SENTRY_DSN || DSN_PLACEHOLDER;

let initialized = false;

/**
 * Initialize Sentry. Safe to call multiple times; only inits once.
 * Call only when hasConsent() is true.
 */
export function initTelemetry(options?: { release?: string; environment?: string }): void {
  if (initialized) {
    if (process.env.RCO_VERBOSE !== '0') console.error(`${LOG_PREFIX} Already initialized`);
    return;
  }
  if (!hasConsent()) {
    if (process.env.RCO_VERBOSE !== '0') console.error(`${LOG_PREFIX} Skipping init: no consent`);
    return;
  }
  if (DSN === DSN_PLACEHOLDER) {
    if (process.env.RCO_VERBOSE !== '0') console.error(`${LOG_PREFIX} DSN placeholder; set SENTRY_DSN for real reporting`);
  }
  try {
    Sentry.init({
      dsn: DSN,
      release: options?.release ?? undefined,
      environment: options?.environment ?? process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0.1,
      maxBreadcrumbs: 50,
      beforeSend(event) {
        if (process.env.RCO_VERBOSE !== '0') console.error(`${LOG_PREFIX} Sending event: ${event.exception?.values?.[0]?.type ?? 'session'}`);
        return event;
      },
    });
    initialized = true;
    if (process.env.RCO_VERBOSE !== '0') console.error(`${LOG_PREFIX} Initialized (opt-in)`);
  } catch (err) {
    console.error(`${LOG_PREFIX} Init failed:`, (err as Error).message);
  }
}

/** Capture an exception. No-op if telemetry not initialized or no consent. */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (!initialized || !hasConsent()) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext('rco', context);
    Sentry.captureException(error);
  });
}

/** Capture a message. No-op if not initialized. */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!initialized || !hasConsent()) return;
  Sentry.captureMessage(message, level);
}

/** Start a session for session-based reporting. */
export function startSession(): void {
  if (!initialized || !hasConsent()) return;
  try {
    Sentry.startSession();
    if (process.env.RCO_VERBOSE !== '0') console.error(`${LOG_PREFIX} Session started`);
  } catch {
    // ignore
  }
}

/** End current session. */
export function endSession(): void {
  if (!initialized) return;
  try {
    Sentry.endSession();
  } catch {
    // ignore
  }
}
