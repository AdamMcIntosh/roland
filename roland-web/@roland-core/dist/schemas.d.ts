/**
 * RCO Phase 2 — Zod schemas for prompts, states, and outputs.
 * Used for validation in orchestrator and workers. Security audit surface.
 */
import { z } from 'zod';
export declare const ClaudePromptPayloadSchema: z.ZodObject<{
    agentName: z.ZodString;
    stepInput: z.ZodOptional<z.ZodString>;
    taskContext: z.ZodString;
    tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    model: z.ZodOptional<z.ZodString>;
    stateSummary: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    agentName: string;
    taskContext: string;
    model?: string | undefined;
    tools?: string[] | undefined;
    stepInput?: string | undefined;
    stateSummary?: Record<string, unknown> | undefined;
}, {
    agentName: string;
    taskContext: string;
    model?: string | undefined;
    tools?: string[] | undefined;
    stepInput?: string | undefined;
    stateSummary?: Record<string, unknown> | undefined;
}>;
export type ClaudePromptPayload = z.infer<typeof ClaudePromptPayloadSchema>;
export declare const ClaudeResponseOutputSchema: z.ZodObject<{
    output: z.ZodString;
    success: z.ZodOptional<z.ZodBoolean>;
    dotGraph: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    output: string;
    error?: string | undefined;
    success?: boolean | undefined;
    dotGraph?: string | undefined;
}, {
    output: string;
    error?: string | undefined;
    success?: boolean | undefined;
    dotGraph?: string | undefined;
}>;
export type ClaudeResponseOutput = z.infer<typeof ClaudeResponseOutputSchema>;
export declare const PersistedStateSchema: z.ZodObject<{
    sessionId: z.ZodString;
    recipe: z.ZodString;
    task: z.ZodString;
    currentStep: z.ZodNumber;
    loopCount: z.ZodNumber;
    outputs: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    agentLogs: z.ZodArray<z.ZodObject<{
        agent: z.ZodString;
        phase: z.ZodString;
        message: z.ZodString;
        ts: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        message: string;
        agent: string;
        ts: number;
        phase: string;
    }, {
        message: string;
        agent: string;
        ts: number;
        phase: string;
    }>, "many">;
    startedAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    task: string;
    updatedAt: number;
    recipe: string;
    sessionId: string;
    currentStep: number;
    loopCount: number;
    outputs: Record<string, unknown>;
    agentLogs: {
        message: string;
        agent: string;
        ts: number;
        phase: string;
    }[];
    startedAt: number;
}, {
    task: string;
    updatedAt: number;
    recipe: string;
    sessionId: string;
    currentStep: number;
    loopCount: number;
    outputs: Record<string, unknown>;
    agentLogs: {
        message: string;
        agent: string;
        ts: number;
        phase: string;
    }[];
    startedAt: number;
}>;
export type PersistedState = z.infer<typeof PersistedStateSchema>;
export declare const NotepadStorePayloadSchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodUnknown>, z.ZodString]>;
}, "strip", z.ZodTypeAny, {
    value: string | Record<string, unknown>;
    key: string;
}, {
    value: string | Record<string, unknown>;
    key: string;
}>;
export declare const NotepadRetrievePayloadSchema: z.ZodObject<{
    key: z.ZodString;
}, "strip", z.ZodTypeAny, {
    key: string;
}, {
    key: string;
}>;
export declare const PluginRunRecipeArgsSchema: z.ZodObject<{
    recipe: z.ZodString;
    task: z.ZodString;
    options: z.ZodOptional<z.ZodObject<{
        ecoMode: z.ZodOptional<z.ZodBoolean>;
        maxLoops: z.ZodOptional<z.ZodNumber>;
        noExport: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        ecoMode?: boolean | undefined;
        maxLoops?: number | undefined;
        noExport?: boolean | undefined;
    }, {
        ecoMode?: boolean | undefined;
        maxLoops?: number | undefined;
        noExport?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    task: string;
    recipe: string;
    options?: {
        ecoMode?: boolean | undefined;
        maxLoops?: number | undefined;
        noExport?: boolean | undefined;
    } | undefined;
}, {
    task: string;
    recipe: string;
    options?: {
        ecoMode?: boolean | undefined;
        maxLoops?: number | undefined;
        noExport?: boolean | undefined;
    } | undefined;
}>;
export type PluginRunRecipeArgs = z.infer<typeof PluginRunRecipeArgsSchema>;
/**
 * Parse an agent response into a ClaudeResponseOutput.
 *
 * Priority:
 *  1. Prose response (primary path for real Cursor agents) — the full text
 *     becomes `output`. A ```dot ... ``` code block is extracted as `dotGraph`.
 *  2. JSON envelope { "output": "..." } — backward-compat with the mock paths
 *     and any agent that explicitly wraps its reply. Accepted inside a
 *     ```json ... ``` fence or bare in the text.
 *
 * This means real Cursor agents can write natural markdown and the orchestrator
 * will capture it correctly without any special formatting required.
 */
export declare function parseClaudeResponseText(raw: string): ClaudeResponseOutput;
//# sourceMappingURL=schemas.d.ts.map