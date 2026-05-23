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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { z } from 'zod';
import { PrioritySchema } from './types.js';

export const TeamRecipeTaskSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  assignee: z.string().optional(),
  /** Sibling task slugs (with or without a "task:" prefix) this depends on. */
  dependsOn: z.array(z.string()).default([]),
  priority: PrioritySchema.default('normal'),
  acceptanceCriteria: z.string().optional(),
});
export type TeamRecipeTask = z.infer<typeof TeamRecipeTaskSchema>;

export const TeamRecipeSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  tasks: z.array(TeamRecipeTaskSchema).min(1),
});
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

function shortId(): string {
  return Math.random().toString(36).slice(2, 6);
}

function slugify(text: string, max = 24): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max) || 'goal'
  );
}

/**
 * Expand a recipe into concrete task seeds for a goal.
 * `namespace` prefixes every slug; if omitted it is derived from the goal plus a
 * short random suffix so repeat runs of the same recipe never collide.
 */
export function instantiate(
  recipe: TeamRecipe,
  goal: string,
  opts: { namespace?: string } = {}
): TaskSeed[] {
  const ns = opts.namespace ?? `${slugify(goal)}-${shortId()}`;
  const sub = (s: string) => s.replace(/\{\{\s*goal\s*\}\}/g, goal);
  const nsKey = (dep: string) => `task:${ns}-${dep.replace(/^task:/, '')}`;

  return recipe.tasks.map((t) => ({
    slug: `${ns}-${t.slug}`,
    title: sub(t.title),
    description: sub(t.description),
    assignee: t.assignee,
    dependsOn: t.dependsOn.map(nsKey),
    priority: t.priority,
    acceptanceCriteria: t.acceptanceCriteria ? sub(t.acceptanceCriteria) : undefined,
  }));
}

export class TeamRecipes {
  private cache: Map<string, TeamRecipe> | null = null;

  constructor(private readonly dir: string = TeamRecipes.resolveTeamsDir()) {}

  list(): Array<{ name: string; description: string; taskCount: number }> {
    return Array.from(this.load().values()).map((r) => ({
      name: r.name,
      description: r.description,
      taskCount: r.tasks.length,
    }));
  }

  get(name: string): TeamRecipe | undefined {
    return this.load().get(name);
  }

  // -- internals ------------------------------------------------------------

  private load(): Map<string, TeamRecipe> {
    if (this.cache) return this.cache;
    const map = new Map<string, TeamRecipe>();
    let files: string[] = [];
    try {
      files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    } catch {
      // No teams dir — empty set.
    }
    for (const file of files) {
      try {
        const raw = YAML.parse(fs.readFileSync(path.join(this.dir, file), 'utf-8'));
        const recipe = TeamRecipeSchema.parse(raw);
        map.set(recipe.name, recipe);
      } catch {
        // Skip malformed recipe files.
      }
    }
    this.cache = map;
    return map;
  }

  /** dist/recipes/teams → <root>/recipes/teams → cwd/recipes/teams. */
  static resolveTeamsDir(): string {
    try {
      const thisFile = fileURLToPath(import.meta.url);
      const installDir = path.resolve(path.dirname(thisFile), '..'); // dist/ or src/
      const rootDir = path.resolve(installDir, '..'); // project root
      const distTeams = path.join(installDir, 'recipes', 'teams');
      if (fs.existsSync(distTeams)) return distTeams;
      const srcTeams = path.join(rootDir, 'recipes', 'teams');
      if (fs.existsSync(srcTeams)) return srcTeams;
    } catch {
      // fall through
    }
    return path.join(process.cwd(), 'recipes', 'teams');
  }
}
