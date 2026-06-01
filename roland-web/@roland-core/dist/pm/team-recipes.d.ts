/**
 * Team recipes (Phase 3) — pre-decomposed task graphs the PM can drop onto the
 * board in one call (start_team_recipe).
 *
 * A recipe is a YAML file under recipes/teams/. Each lists a small set of tasks
 * with sibling-slug `dependsOn` links and a suggested `assignee`. Instantiating
 * a recipe namespaces every slug (so two runs don't collide), rewrites the
 * dependency links to the namespaced task keys, and substitutes the goal text
 * into titles/descriptions via {{goal}}.
 */
import { z } from 'zod';
export declare const TeamRecipeTaskSchema: z.ZodObject<{
    slug: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    assignee: z.ZodOptional<z.ZodString>;
    /** Sibling task slugs (with or without a "task:" prefix) this depends on. */
    dependsOn: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    priority: z.ZodDefault<z.ZodEnum<["low", "normal", "high"]>>;
    acceptanceCriteria: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    title: string;
    dependsOn: string[];
    priority: "low" | "normal" | "high";
    slug: string;
    assignee?: string | undefined;
    acceptanceCriteria?: string | undefined;
}, {
    description: string;
    title: string;
    slug: string;
    assignee?: string | undefined;
    dependsOn?: string[] | undefined;
    priority?: "low" | "normal" | "high" | undefined;
    acceptanceCriteria?: string | undefined;
}>;
export type TeamRecipeTask = z.infer<typeof TeamRecipeTaskSchema>;
export declare const TeamRecipeSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    tasks: z.ZodArray<z.ZodObject<{
        slug: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        assignee: z.ZodOptional<z.ZodString>;
        /** Sibling task slugs (with or without a "task:" prefix) this depends on. */
        dependsOn: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodDefault<z.ZodEnum<["low", "normal", "high"]>>;
        acceptanceCriteria: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        title: string;
        dependsOn: string[];
        priority: "low" | "normal" | "high";
        slug: string;
        assignee?: string | undefined;
        acceptanceCriteria?: string | undefined;
    }, {
        description: string;
        title: string;
        slug: string;
        assignee?: string | undefined;
        dependsOn?: string[] | undefined;
        priority?: "low" | "normal" | "high" | undefined;
        acceptanceCriteria?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    tasks: {
        description: string;
        title: string;
        dependsOn: string[];
        priority: "low" | "normal" | "high";
        slug: string;
        assignee?: string | undefined;
        acceptanceCriteria?: string | undefined;
    }[];
}, {
    name: string;
    tasks: {
        description: string;
        title: string;
        slug: string;
        assignee?: string | undefined;
        dependsOn?: string[] | undefined;
        priority?: "low" | "normal" | "high" | undefined;
        acceptanceCriteria?: string | undefined;
    }[];
    description?: string | undefined;
}>;
export type TeamRecipe = z.infer<typeof TeamRecipeSchema>;
/** A ready-to-create task (post-instantiation), shaped for TaskBoard.createTask. */
export interface TaskSeed {
    slug: string;
    title: string;
    description: string;
    assignee?: string;
    dependsOn: string[];
    priority: TeamRecipeTask['priority'];
    acceptanceCriteria?: string;
}
/**
 * Expand a recipe into concrete task seeds for a goal.
 * `namespace` prefixes every slug; if omitted it is derived from the goal plus a
 * short random suffix so repeat runs of the same recipe never collide.
 */
export declare function instantiate(recipe: TeamRecipe, goal: string, opts?: {
    namespace?: string;
}): TaskSeed[];
export declare class TeamRecipes {
    private readonly dir;
    private cache;
    constructor(dir?: string);
    list(): Array<{
        name: string;
        description: string;
        taskCount: number;
    }>;
    get(name: string): TeamRecipe | undefined;
    private load;
    /** dist/recipes/teams → <root>/recipes/teams → cwd/recipes/teams. */
    static resolveTeamsDir(): string;
}
//# sourceMappingURL=team-recipes.d.ts.map