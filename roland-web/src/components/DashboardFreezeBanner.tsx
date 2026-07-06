'use client';

/**
 * ## P1 Final Consolidation (v1.4.0)
 *
 * Prominent notice that roland-web dashboard development is frozen.
 * Prefer CLI + `roland mission-audit` for mission visibility.
 */
export function DashboardFreezeBanner() {
  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
    >
      <p className="font-semibold">Dashboard development frozen (v1.4.0)</p>
      <p className="mt-1 text-amber-900/90">
        This web UI is in maintenance-only mode. Use the Roland CLI and{' '}
        <code className="rounded bg-amber-100/80 px-1 font-mono text-xs">roland mission-audit</code>{' '}
        for mission visibility, HITL, and loop status. GitHub clone/import and launcher features are disabled.
      </p>
    </div>
  );
}
