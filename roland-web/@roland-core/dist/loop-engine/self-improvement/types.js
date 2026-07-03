/**
 * Self-improvement loop types — critique output, retry decisions, improvement proposals.
 */
/** Normalize legacy lane keys (grok/composer) to canonical critique lanes. */
export function normalizeCritiqueLane(lane) {
    const key = lane.toLowerCase().trim();
    if (key === 'grok' || key === 'pm' || key === 'critic' || key === 'high_level' || key === 'high-level') {
        return 'critic';
    }
    return 'coding';
}
export function critiqueOutputToSnapshot(output) {
    return {
        strengths: output.strengths,
        issues: output.issues,
        suggestions: output.suggestions,
        retryDecision: output.retryDecision,
        model: output.model,
        summary: output.summary,
        at: output.at,
        iteration: output.iteration,
        proposalCount: output.proposals.length,
    };
}
//# sourceMappingURL=types.js.map