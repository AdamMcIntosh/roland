/**
 * Phase 3 unit tests: team recipes.
 * Proves the bundled recipes load, and that instantiate() namespaces slugs,
 * rewrites sibling dependsOn links to namespaced task keys, and substitutes
 * the goal into titles/descriptions.
 */

import { describe, it, expect } from 'vitest';
import { TeamRecipes, instantiate, type TeamRecipe } from '../../src/pm/team-recipes.js';

const RECIPE: TeamRecipe = {
  name: 'demo',
  description: 'demo recipe',
  tasks: [
    { slug: 'design', title: 'Design: {{goal}}', description: 'design {{goal}}', assignee: 'architect', dependsOn: [], priority: 'normal' },
    { slug: 'build', title: 'Build', description: 'build it', assignee: 'executor', dependsOn: ['design'], priority: 'normal' },
    { slug: 'test', title: 'Test', description: 'test it', assignee: 'qa-tester', dependsOn: ['task:build'], priority: 'normal' },
  ],
};

describe('instantiate', () => {
  it('namespaces slugs, rewrites deps, and substitutes the goal', () => {
    const seeds = instantiate(RECIPE, 'add login', { namespace: 'ns' });
    expect(seeds.map((s) => s.slug)).toEqual(['ns-design', 'ns-build', 'ns-test']);

    const design = seeds[0];
    expect(design.title).toBe('Design: add login');
    expect(design.description).toBe('design add login');
    expect(design.dependsOn).toEqual([]);

    // sibling slug "design" → "task:ns-design"
    expect(seeds[1].dependsOn).toEqual(['task:ns-design']);
    // "task:build" prefix is normalized too → "task:ns-build"
    expect(seeds[2].dependsOn).toEqual(['task:ns-build']);
  });

  it('derives a unique namespace from the goal when none is given', () => {
    const a = instantiate(RECIPE, 'Add OAuth Login');
    const b = instantiate(RECIPE, 'Add OAuth Login');
    expect(a[0].slug).toMatch(/^add-oauth-login-/);
    expect(a[0].slug).not.toBe(b[0].slug); // unique suffix prevents collisions
  });
});

describe('TeamRecipes loader', () => {
  const recipes = new TeamRecipes();

  it('loads the three bundled team recipes', () => {
    const names = recipes.list().map((r) => r.name);
    expect(names).toContain('full-feature-team');
    expect(names).toContain('bugfix-team');
    expect(names).toContain('refactor-team');
  });

  it('returns a parsed recipe with tasks', () => {
    const r = recipes.get('full-feature-team');
    expect(r).toBeDefined();
    expect(r!.tasks.length).toBeGreaterThan(0);
    expect(r!.tasks.some((t) => t.dependsOn.length > 0)).toBe(true);
  });
});
