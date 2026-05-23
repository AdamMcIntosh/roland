/**
 * Roster — the team's available engineers, loaded from agents/*.yaml.
 *
 * Reads the same persona files the rest of Roland uses. Each persona already
 * carries its own model (recommended_model / model), so the Roster recommends an
 * engineer *and* the model it should run on with no coupling to the server's
 * private routing tables. The recommendation here is intentionally lightweight
 * (keyword + complexity heuristic); Phase 3 replaces it with the full router.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { ComplexityClassifier } from '../orchestrator/complexity-classifier.js';
import { laneForEngineer, type Lane } from './model-policy.js';

/** Informational only — the actual run model comes from the lane router. */
const DEFAULT_MODEL = 'composer-2.5-standard';
/** Personas that are not assignable engineers. */
const NON_ENGINEERS = new Set(['lead-pm']);

export interface Engineer {
  name: string;
  /** One-line specialty (first line of the persona's role_prompt). */
  specialty: string;
  /**
   * The persona's declared model from its YAML (informational). Routing to a
   * Cursor model is done by lane via TaskRouter — not from this field.
   */
  model: string;
  /** Cursor routing lane derived from the persona (see model-policy.ts). */
  lane: Lane;
  role_prompt: string;
  tools: string[];
}

export interface RosterOptions {
  /** Per-engineer lane overrides (config pm.lane_overrides). */
  laneOverrides?: Record<string, Lane>;
}

export class Roster {
  private engineers: Map<string, Engineer> | null = null;
  private readonly laneOverrides: Record<string, Lane>;

  constructor(
    private readonly agentsDir: string = Roster.resolveAgentsDir(),
    opts: RosterOptions = {}
  ) {
    this.laneOverrides = opts.laneOverrides ?? {};
  }

  /** All assignable engineers. */
  list(): Engineer[] {
    return Array.from(this.load().values());
  }

  get(name: string): Engineer | undefined {
    return this.load().get(name);
  }

  /**
   * Recommend the best engineer for a task. Heuristic: keyword overlap between
   * the task and each persona (name + specialty), nudged by complexity so that
   * harder tasks prefer reasoning-tier personas. Defaults to "executor".
   */
  recommend(taskDescription: string): Engineer {
    const engineers = this.list();
    if (engineers.length === 0) {
      return {
        name: 'executor',
        specialty: 'Implementation engineer',
        model: DEFAULT_MODEL,
        lane: laneForEngineer('executor', this.laneOverrides),
        role_prompt: 'You are the executor. Implement the task cleanly.',
        tools: [],
      };
    }

    const words = new Set(
      taskDescription
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3)
    );
    const complex = ComplexityClassifier.analyzeQuery(taskDescription).score >= 60;

    let best: Engineer | undefined;
    let bestScore = -1;
    for (const eng of engineers) {
      const hay = `${eng.name} ${eng.specialty}`.toLowerCase();
      let score = 0;
      for (const w of words) if (hay.includes(w)) score += 1;
      // Reasoning personas get a small boost on complex tasks.
      if (complex && /architect|planner|critic|review|security|scientist/.test(eng.name)) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = eng;
      }
    }
    return best ?? this.get('executor') ?? engineers[0];
  }

  // -- internals ------------------------------------------------------------

  private load(): Map<string, Engineer> {
    if (this.engineers) return this.engineers;
    const map = new Map<string, Engineer>();
    let files: string[] = [];
    try {
      files = fs.readdirSync(this.agentsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    } catch {
      // No agents dir — empty roster.
    }
    for (const file of files) {
      try {
        const raw = YAML.parse(fs.readFileSync(path.join(this.agentsDir, file), 'utf-8')) ?? {};
        const name: string = raw.name ?? path.basename(file, path.extname(file));
        if (NON_ENGINEERS.has(name)) continue;
        const role_prompt: string = raw.role_prompt ?? '';
        map.set(name, {
          name,
          specialty: (role_prompt.split('\n')[0] || name).trim().slice(0, 200),
          model: raw.recommended_model || raw.model || DEFAULT_MODEL,
          lane: laneForEngineer(name, this.laneOverrides),
          role_prompt: role_prompt || `You are the ${name} agent.`,
          tools: Array.isArray(raw.tools) ? raw.tools : [],
        });
      } catch {
        // Skip malformed persona files.
      }
    }
    this.engineers = map;
    return map;
  }

  /** Mirror of McpServer.resolveRecipesDir, for agents/. */
  static resolveAgentsDir(): string {
    try {
      const thisFile = fileURLToPath(import.meta.url);
      const installDir = path.resolve(path.dirname(thisFile), '..'); // dist/ or src/
      const rootDir = path.resolve(installDir, '..'); // project root
      const distAgents = path.join(installDir, 'agents');
      if (fs.existsSync(distAgents)) return distAgents;
      const srcAgents = path.join(rootDir, 'agents');
      if (fs.existsSync(srcAgents)) return srcAgents;
    } catch {
      // fall through
    }
    return path.join(process.cwd(), 'agents');
  }
}
