import { Phase } from '../loop-phases.js';
export class ObservePhaseHandler {
    phase = Phase.Observe;
    async execute(ctx) {
        const transitions = ctx.state.phaseHistory.length;
        const summary = `Observation: ${transitions} phase transition(s) in iteration ${ctx.iteration}`;
        ctx.commandBoard?.appendBullet('Artifacts', `[LOOP] ${ctx.state.templateId} — ${summary}`);
        ctx.blackboard.post({
            type: 'artifact',
            title: `Loop: Observe phase (iteration ${ctx.iteration})`,
            content: summary,
            status: 'done',
            author: 'loop-engine',
            priority: 'low',
            tags: ['loop', 'observe'],
            relatedIds: [],
        });
        return { success: true, summary };
    }
}
//# sourceMappingURL=observe.js.map