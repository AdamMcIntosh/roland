/**
 * RCO tool stubs and dependency-mapper / graph-visualizer skills
 */
import { graphVisualizerDOT } from '../skills.js';
/** Stub: logs search query and returns mock result */
export function stubSearch(query) {
    console.error(`[RCO tool] search("${query}")`);
    return `[mock search result for: ${query}]`;
}
/** Stub: logs code action */
export function stubCode(action, path) {
    console.error(`[RCO tool] code(${action}, ${path ?? 'N/A'})`);
    return `[mock code ${action}${path ? ` @ ${path}` : ''}]`;
}
/** Stub: logs terminal command */
export function stubTerminal(cmd) {
    console.error(`[RCO tool] terminal("${cmd}")`);
    return `[mock terminal: ${cmd}]`;
}
/**
 * Original RCO skill: generates a DOT graph string for agent handoffs.
 * Used for visualizing workflow and dependencies between agents.
 */
export function dependencyMapper(state, recipeSteps) {
    const lines = ['digraph RCO_handoffs {', '  rankdir=LR;', '  node [shape=box];'];
    const seen = new Set();
    for (const step of recipeSteps) {
        const from = step.agent.replace(/\s+/g, '_');
        if (!seen.has(from)) {
            lines.push(`  "${from}" [label="${step.agent}"];`);
            seen.add(from);
        }
        if (step.output_to) {
            const to = step.output_to.replace(/\s+/g, '_');
            if (!seen.has(to)) {
                lines.push(`  "${to}" [label="${step.output_to}"];`);
                seen.add(to);
            }
            lines.push(`  "${from}" -> "${to}";`);
        }
    }
    // Add session/state node
    lines.push('  "state" [shape=ellipse, label="state"];');
    if (recipeSteps.length > 0) {
        const first = recipeSteps[0].agent.replace(/\s+/g, '_');
        lines.push(`  "state" -> "${first}";`);
    }
    lines.push('}');
    return lines.join('\n');
}
const defaultState = () => ({
    sessionId: '',
    recipe: '',
    task: '',
    currentStep: 0,
    loopCount: 0,
    outputs: {},
    agentLogs: [],
    startedAt: 0,
    updatedAt: 0,
});
const TOOL_MAP = {
    search: (q) => stubSearch(q),
    code: (a, _s, _st) => stubCode(a),
    terminal: (c) => stubTerminal(c),
    'dependency-mapper': (_arg, state, steps) => dependencyMapper(state ?? defaultState(), steps ?? []),
    'graph-visualizer': (_arg, state, steps) => graphVisualizerDOT(state ?? defaultState(), steps ?? []),
};
export function runTool(name, arg, state, steps) {
    const fn = TOOL_MAP[name];
    if (!fn) {
        console.error(`[RCO tool] unknown tool: ${name}`);
        return `[unknown tool: ${name}]`;
    }
    return fn(arg, state, steps);
}
//# sourceMappingURL=tools.js.map