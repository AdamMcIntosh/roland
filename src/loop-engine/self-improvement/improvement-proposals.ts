/**
 * Improvement proposal generation — skeleton for future autonomous editing.
 * Produces structured proposals from critique issues; does not apply changes.
 */

import { randomUUID } from 'crypto';
import type { CritiqueInput, ImprovementProposal } from './types.js';

/** Generate improvement proposals from verification failures and blockers. */
export function generateImprovementProposals(input: CritiqueInput): ImprovementProposal[] {
  const proposals: ImprovementProposal[] = [];

  if (input.hadBlockers) {
    proposals.push({
      id: randomUUID().slice(0, 8),
      title: 'Resolve wave blockers',
      description: 'Address agent-reported blockers before the next iteration.',
      category: 'process',
      priority: 'high',
    });
  }

  const strategies = input.verification?.strategies ?? [];
  for (const strategy of strategies) {
    if (strategy.pass) continue;
    const category = mapStrategyCategory(strategy.type);
    const failureHint = strategy.failures?.[0]?.slice(0, 120) ?? 'See verification output';
    proposals.push({
      id: randomUUID().slice(0, 8),
      title: `Fix ${strategy.type} failures`,
      description: failureHint,
      category,
      priority: strategy.type === 'unit' || strategy.type === 'typecheck' ? 'high' : 'medium',
    });
  }

  if (proposals.length === 0 && input.verification && !input.verification.pass) {
    proposals.push({
      id: randomUUID().slice(0, 8),
      title: 'Investigate verification failure',
      description: input.verification.summary,
      category: 'implementation',
      priority: 'medium',
    });
  }

  return proposals;
}

function mapStrategyCategory(
  type: string,
): ImprovementProposal['category'] {
  if (type === 'lint') return 'lint';
  if (type === 'unit' || type === 'integration' || type === 'e2e' || type === 'smoke') return 'test';
  if (type === 'typecheck') return 'implementation';
  return 'implementation';
}
