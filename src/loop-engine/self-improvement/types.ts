/**
 * Self-improvement loop types — critique output, retry decisions, improvement proposals.
 */

/** How the loop should proceed after critique. */
export type RetryDecision = 'proceed' | 'retry' | 'retry_focused' | 'escalate';

/** Model lane for critique — Grok for high-level, Composer for code-specific. */
export type CritiqueModel = 'grok' | 'composer';

export interface ImprovementProposal {
  id: string;
  title: string;
  description: string;
  /** Target area: test, lint, implementation, architecture */
  category: 'test' | 'lint' | 'implementation' | 'architecture' | 'process';
  /** Priority for operator / future auto-fix */
  priority: 'low' | 'medium' | 'high';
}

export interface CritiqueInput {
  goal: string;
  iteration: number;
  retryCount: number;
  maxRetries: number;
  hadBlockers?: boolean;
  verification?: {
    pass: boolean;
    summary: string;
    strategies?: Array<{
      type: string;
      pass: boolean;
      durationMs: number;
      failures?: string[];
    }>;
  };
  phaseHistory: Array<{
    phase: string;
    success?: boolean;
    summary?: string;
  }>;
}

export interface CritiqueOutput {
  strengths: string[];
  issues: string[];
  suggestions: string[];
  proposals: ImprovementProposal[];
  retryDecision: RetryDecision;
  model: CritiqueModel;
  summary: string;
  at: number;
  iteration: number;
}

/** Snapshot persisted to loop-state / run-state / dashboard. */
export interface LoopCritiqueSnapshot {
  strengths: string[];
  issues: string[];
  suggestions: string[];
  retryDecision: RetryDecision;
  model: CritiqueModel;
  summary: string;
  at: number;
  iteration: number;
  proposalCount?: number;
}

export function critiqueOutputToSnapshot(output: CritiqueOutput): LoopCritiqueSnapshot {
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
