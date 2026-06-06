/**
 * Heuristic goal classification for PM scope calibration and synthesis compaction.
 */

/** True when the goal is a trivial local edit (comment, one-liner, minimal scaffold). */
export function isMinimalGoal(goal: string): boolean {
  const g = goal.toLowerCase().trim();

  if (requestsProductionHardening(goal)) return false;

  const featureWork =
    /\b(implement|build|create|wire|extend)\b.*\b(api|endpoint|service|migration|middleware|repository|handler)\b/.test(g) ||
    /\b(new feature|full stack|crud|rest api|graphql)\b/.test(g) ||
    /\b(auth middleware|authentication (system|service|flow|endpoint))\b/.test(g);
  if (featureWork) return false;

  const minimalSignals = [
    /\b(add|insert|put|write|prepend)\b.*\b(comment|todo|note|line|header)\b/,
    /\b(comment|todo|note)\b.*\b(at the top|to the top|into|in)\b/,
    /\b(at the top of|top of)\b.*\.(js|ts|tsx|jsx|py|md|json|yaml|yml)\b/,
    /\b(simple|minimal|small|quick|trivial|one[- ]line|single)\b.*\b(comment|edit|change|fix)\b/,
    /\b(typo|fix spelling|rename variable|reformat|lint fix)\b/,
    /\bscaffold\b.*\b(basic|minimal|simple|empty|stub)\b/,
  ];
  if (minimalSignals.some((p) => p.test(g))) return true;

  return g.length <= 120 && /\b(comment|todo)\b/.test(g);
}

/** User explicitly asked for production-grade / hardening work. */
export function requestsProductionHardening(goal: string): boolean {
  const g = goal.toLowerCase();
  if (/\b(production[- ]ready|production harden|deploy(?:ment)? readiness|hardening|enterprise|security audit|observability mandate)\b/.test(g)) {
    return true;
  }
  // Structured logging etc. count as hardening only when not the primary deliverable
  if (/\b(add|implement|require|apply)\b.*\b(structured log(?:ging)?|ilogg(?:er)?|rate limit(?:ing)?|problem ?details|cancellation ?token)\b/.test(g)) {
    return !isFocusedFeatureGoal(goal);
  }
  return false;
}

/** Single scoped feature (middleware, endpoint, one module) — not a full greenfield app. */
export function isFocusedFeatureGoal(goal: string): boolean {
  const g = goal.toLowerCase();
  return (
    /\b(add|implement|wire|create)\b.*\b(middleware|endpoint|route|handler|service|module|plugin|adapter)\b/.test(g) ||
    /\busing (pino|winston|express|fastify)\b/.test(g) ||
    /\bto the \w+ (express|fastify|api|server)\b/.test(g)
  );
}

/** Brand-new minimal scaffold — hardening gaps are backlog, not blockers. */
export function isScaffoldGoal(goal: string): boolean {
  const g = goal.toLowerCase();
  if (requestsProductionHardening(goal) || isFocusedFeatureGoal(goal)) return false;
  return (
    /\bscaffold\b.*\b(basic|minimal|simple|empty|stub|new)\b/.test(g) ||
    /\b(create|bootstrap|init)\b.*\b(new|basic|minimal)\b.*\b(express|fastify|api|app|server)\b/.test(g)
  );
}

/** Hardening-themed release blocker bullets that must not block minimal tasks. */
export const HARDENING_BLOCKER_PATTERNS: RegExp[] = [
  /\bstructured log/i,
  /\bilogg(?:er)?\b/i,
  /\brate limit/i,
  /\bcancellation ?token/i,
  /\bef core migration/i,
  /\bproblem ?details/i,
  /\buser[- ]secrets\b/i,
  /\bobservability\b/i,
  /\bmonitoring\b/i,
  /\bdi registration\b/i,
  /\bmiddleware pipeline\b/i,
];
