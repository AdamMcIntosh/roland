/**
 * RCO (Roland Code Orchestrator) types and schemas
 */
import { z } from 'zod';
export declare const AgentYamlSchema: z.ZodObject<{
    name: z.ZodString;
    role_prompt: z.ZodOptional<z.ZodString>;
    recommended_model: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    provider: z.ZodOptional<z.ZodString>;
    claude_model: z.ZodOptional<z.ZodString>;
    temperature: z.ZodOptional<z.ZodNumber>;
    tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    provider?: string | undefined;
    model?: string | undefined;
    temperature?: number | undefined;
    role_prompt?: string | undefined;
    recommended_model?: string | undefined;
    claude_model?: string | undefined;
    tools?: string[] | undefined;
}, {
    name: string;
    provider?: string | undefined;
    model?: string | undefined;
    temperature?: number | undefined;
    role_prompt?: string | undefined;
    recommended_model?: string | undefined;
    claude_model?: string | undefined;
    tools?: string[] | undefined;
}>;
export type AgentYaml = z.infer<typeof AgentYamlSchema>;
export declare const RcoSubagentSchema: z.ZodObject<{
    name: z.ZodString;
    agentRef: z.ZodString;
    prompt: z.ZodOptional<z.ZodString>;
    claude_model: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    agentRef: string;
    prompt?: string | undefined;
    claude_model?: string | undefined;
}, {
    name: string;
    agentRef: string;
    prompt?: string | undefined;
    claude_model?: string | undefined;
}>;
export declare const RcoWorkflowStepSchema: z.ZodObject<{
    agent: z.ZodString;
    input: z.ZodOptional<z.ZodString>;
    output_to: z.ZodOptional<z.ZodString>;
    loop_if: z.ZodOptional<z.ZodString>;
    final_output: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    agent: string;
    input?: string | undefined;
    output_to?: string | undefined;
    loop_if?: string | undefined;
    final_output?: boolean | undefined;
}, {
    agent: string;
    input?: string | undefined;
    output_to?: string | undefined;
    loop_if?: string | undefined;
    final_output?: boolean | undefined;
}>;
export declare const RcoRecipeSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    execution_mode: z.ZodDefault<z.ZodEnum<["autonomous-loop", "parallel-swarm", "linear", "adaptive-swarm", "collab-mode"]>>;
    max_loops: z.ZodDefault<z.ZodNumber>;
    subagents: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        agentRef: z.ZodString;
        prompt: z.ZodOptional<z.ZodString>;
        claude_model: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        agentRef: string;
        prompt?: string | undefined;
        claude_model?: string | undefined;
    }, {
        name: string;
        agentRef: string;
        prompt?: string | undefined;
        claude_model?: string | undefined;
    }>, "many">>;
    workflow: z.ZodObject<{
        steps: z.ZodArray<z.ZodObject<{
            agent: z.ZodString;
            input: z.ZodOptional<z.ZodString>;
            output_to: z.ZodOptional<z.ZodString>;
            loop_if: z.ZodOptional<z.ZodString>;
            final_output: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            agent: string;
            input?: string | undefined;
            output_to?: string | undefined;
            loop_if?: string | undefined;
            final_output?: boolean | undefined;
        }, {
            agent: string;
            input?: string | undefined;
            output_to?: string | undefined;
            loop_if?: string | undefined;
            final_output?: boolean | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        steps: {
            agent: string;
            input?: string | undefined;
            output_to?: string | undefined;
            loop_if?: string | undefined;
            final_output?: boolean | undefined;
        }[];
    }, {
        steps: {
            agent: string;
            input?: string | undefined;
            output_to?: string | undefined;
            loop_if?: string | undefined;
            final_output?: boolean | undefined;
        }[];
    }>;
    options: z.ZodOptional<z.ZodObject<{
        cache_messages: z.ZodOptional<z.ZodBoolean>;
        eco_mode: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        cache_messages?: boolean | undefined;
        eco_mode?: boolean | undefined;
    }, {
        cache_messages?: boolean | undefined;
        eco_mode?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    execution_mode: "autonomous-loop" | "parallel-swarm" | "linear" | "adaptive-swarm" | "collab-mode";
    max_loops: number;
    workflow: {
        steps: {
            agent: string;
            input?: string | undefined;
            output_to?: string | undefined;
            loop_if?: string | undefined;
            final_output?: boolean | undefined;
        }[];
    };
    options?: {
        cache_messages?: boolean | undefined;
        eco_mode?: boolean | undefined;
    } | undefined;
    description?: string | undefined;
    subagents?: {
        name: string;
        agentRef: string;
        prompt?: string | undefined;
        claude_model?: string | undefined;
    }[] | undefined;
}, {
    name: string;
    workflow: {
        steps: {
            agent: string;
            input?: string | undefined;
            output_to?: string | undefined;
            loop_if?: string | undefined;
            final_output?: boolean | undefined;
        }[];
    };
    options?: {
        cache_messages?: boolean | undefined;
        eco_mode?: boolean | undefined;
    } | undefined;
    description?: string | undefined;
    execution_mode?: "autonomous-loop" | "parallel-swarm" | "linear" | "adaptive-swarm" | "collab-mode" | undefined;
    max_loops?: number | undefined;
    subagents?: {
        name: string;
        agentRef: string;
        prompt?: string | undefined;
        claude_model?: string | undefined;
    }[] | undefined;
}>;
export type RcoSubagent = z.infer<typeof RcoSubagentSchema>;
export type RcoWorkflowStep = z.infer<typeof RcoWorkflowStepSchema>;
export type RcoRecipe = z.infer<typeof RcoRecipeSchema>;
export declare const RcoConfigSchema: z.ZodObject<{
    claude_models: z.ZodOptional<z.ZodObject<{
        complex: z.ZodString;
        medium: z.ZodString;
        simple: z.ZodString;
        explain: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        simple: string;
        medium: string;
        complex: string;
        explain: string;
    }, {
        simple: string;
        medium: string;
        complex: string;
        explain: string;
    }>>;
    eco_mode: z.ZodOptional<z.ZodBoolean>;
    task_routing: z.ZodOptional<z.ZodArray<z.ZodObject<{
        pattern: z.ZodString;
        agents: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        pattern: string;
        agents: string[];
    }, {
        pattern: string;
        agents: string[];
    }>, "many">>;
    dashboard_port: z.ZodOptional<z.ZodNumber>;
    state_file: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    eco_mode?: boolean | undefined;
    claude_models?: {
        simple: string;
        medium: string;
        complex: string;
        explain: string;
    } | undefined;
    task_routing?: {
        pattern: string;
        agents: string[];
    }[] | undefined;
    dashboard_port?: number | undefined;
    state_file?: string | undefined;
}, {
    eco_mode?: boolean | undefined;
    claude_models?: {
        simple: string;
        medium: string;
        complex: string;
        explain: string;
    } | undefined;
    task_routing?: {
        pattern: string;
        agents: string[];
    }[] | undefined;
    dashboard_port?: number | undefined;
    state_file?: string | undefined;
}>;
export type RcoConfig = z.infer<typeof RcoConfigSchema>;
export interface RcoState {
    sessionId: string;
    recipe: string;
    task: string;
    currentStep: number;
    loopCount: number;
    outputs: Record<string, unknown>;
    agentLogs: Array<{
        agent: string;
        phase: string;
        message: string;
        ts: number;
    }>;
    startedAt: number;
    updatedAt: number;
}
export declare const FileBundleEntrySchema: z.ZodObject<{
    path: z.ZodString;
    content: z.ZodString;
    sizeBytes: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    path: string;
    content: string;
    sizeBytes: number;
}, {
    path: string;
    content: string;
    sizeBytes: number;
}>;
export declare const FileBundleSchema: z.ZodObject<{
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        content: z.ZodString;
        sizeBytes: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        path: string;
        content: string;
        sizeBytes: number;
    }, {
        path: string;
        content: string;
        sizeBytes: number;
    }>, "many">;
    totalBytes: z.ZodNumber;
    truncated: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    files: {
        path: string;
        content: string;
        sizeBytes: number;
    }[];
    totalBytes: number;
    truncated: boolean;
}, {
    files: {
        path: string;
        content: string;
        sizeBytes: number;
    }[];
    totalBytes: number;
    truncated: boolean;
}>;
export declare const WorkerInputSchema: z.ZodObject<{
    type: z.ZodLiteral<"run">;
    agentYaml: z.ZodObject<{
        name: z.ZodString;
        role_prompt: z.ZodOptional<z.ZodString>;
        recommended_model: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodString>;
        claude_model: z.ZodOptional<z.ZodString>;
        temperature: z.ZodOptional<z.ZodNumber>;
        tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        provider?: string | undefined;
        model?: string | undefined;
        temperature?: number | undefined;
        role_prompt?: string | undefined;
        recommended_model?: string | undefined;
        claude_model?: string | undefined;
        tools?: string[] | undefined;
    }, {
        name: string;
        provider?: string | undefined;
        model?: string | undefined;
        temperature?: number | undefined;
        role_prompt?: string | undefined;
        recommended_model?: string | undefined;
        claude_model?: string | undefined;
        tools?: string[] | undefined;
    }>;
    state: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    taskContext: z.ZodString;
    stepInput: z.ZodOptional<z.ZodString>;
    tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    workflowSteps: z.ZodOptional<z.ZodArray<z.ZodObject<{
        agent: z.ZodString;
        output_to: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        agent: string;
        output_to?: string | undefined;
    }, {
        agent: string;
        output_to?: string | undefined;
    }>, "many">>;
    fileBundle: z.ZodOptional<z.ZodObject<{
        files: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            content: z.ZodString;
            sizeBytes: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            path: string;
            content: string;
            sizeBytes: number;
        }, {
            path: string;
            content: string;
            sizeBytes: number;
        }>, "many">;
        totalBytes: z.ZodNumber;
        truncated: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        files: {
            path: string;
            content: string;
            sizeBytes: number;
        }[];
        totalBytes: number;
        truncated: boolean;
    }, {
        files: {
            path: string;
            content: string;
            sizeBytes: number;
        }[];
        totalBytes: number;
        truncated: boolean;
    }>>;
}, "strip", z.ZodTypeAny, {
    type: "run";
    agentYaml: {
        name: string;
        provider?: string | undefined;
        model?: string | undefined;
        temperature?: number | undefined;
        role_prompt?: string | undefined;
        recommended_model?: string | undefined;
        claude_model?: string | undefined;
        tools?: string[] | undefined;
    };
    state: Record<string, unknown>;
    taskContext: string;
    tools?: string[] | undefined;
    stepInput?: string | undefined;
    workflowSteps?: {
        agent: string;
        output_to?: string | undefined;
    }[] | undefined;
    fileBundle?: {
        files: {
            path: string;
            content: string;
            sizeBytes: number;
        }[];
        totalBytes: number;
        truncated: boolean;
    } | undefined;
}, {
    type: "run";
    agentYaml: {
        name: string;
        provider?: string | undefined;
        model?: string | undefined;
        temperature?: number | undefined;
        role_prompt?: string | undefined;
        recommended_model?: string | undefined;
        claude_model?: string | undefined;
        tools?: string[] | undefined;
    };
    state: Record<string, unknown>;
    taskContext: string;
    tools?: string[] | undefined;
    stepInput?: string | undefined;
    workflowSteps?: {
        agent: string;
        output_to?: string | undefined;
    }[] | undefined;
    fileBundle?: {
        files: {
            path: string;
            content: string;
            sizeBytes: number;
        }[];
        totalBytes: number;
        truncated: boolean;
    } | undefined;
}>;
export declare const WorkerOutputSchema: z.ZodObject<{
    type: z.ZodLiteral<"result">;
    success: z.ZodBoolean;
    output: z.ZodString;
    dotGraph: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "result";
    output: string;
    success: boolean;
    error?: string | undefined;
    dotGraph?: string | undefined;
}, {
    type: "result";
    output: string;
    success: boolean;
    error?: string | undefined;
    dotGraph?: string | undefined;
}>;
export type WorkerInput = z.infer<typeof WorkerInputSchema>;
export type WorkerOutput = z.infer<typeof WorkerOutputSchema>;
//# sourceMappingURL=types.d.ts.map