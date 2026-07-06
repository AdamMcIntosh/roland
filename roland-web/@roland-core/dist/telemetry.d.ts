/**
 * ## P3 Release & Stabilization
 *
 * Opt-in telemetry via Sentry (errors and sessions).
 * Initialized only when user has consented.
 *
 * Enable via:
 *   - `RCO_TELEMETRY_CONSENT=1` or `RCO_CONSENT=yes`
 *   - Consent file: `~/.rco/telemetry-consent.json` (or project-scoped `.rco/`)
 *   - DSN: `SENTRY_DSN` or `RCO_SENTRY_DSN` (placeholder used if unset)
 *
 * See `config.yaml` telemetry section and docs/guides/model-routing-and-cost.md.
 */
/** Check if user has opted in (file exists and valid, or env RCO_TELEMETRY_CONSENT=1). */
export declare function hasConsent(scope?: 'user' | 'project'): boolean;
/** Persist consent. */
export declare function setConsent(scope?: 'user' | 'project'): void;
/**
 * Initialize Sentry. Safe to call multiple times; only inits once.
 * Call only when hasConsent() is true.
 */
export declare function initTelemetry(options?: {
    release?: string;
    environment?: string;
}): void;
/** Capture an exception. No-op if telemetry not initialized or no consent. */
export declare function captureException(error: Error, context?: Record<string, unknown>): void;
/** Capture a message. No-op if not initialized. */
export declare function captureMessage(message: string, level?: 'info' | 'warning' | 'error'): void;
/** Start a session for session-based reporting. */
export declare function startSession(): void;
/** End current session. */
export declare function endSession(): void;
//# sourceMappingURL=telemetry.d.ts.map