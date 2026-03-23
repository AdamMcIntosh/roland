/**
 * Goose Runner — utilities for spawning headless Goose coding sessions.
 *
 * Goose is an AI agent CLI with a built-in Developer extension that provides
 * shell execution and file read/write tools. This module wraps `goose run`
 * for use by the recipe runner and the run_goose_task MCP tool.
 *
 * Requirements:
 *   - `goose` CLI in PATH (https://block.github.io/goose/)
 *   - OPENROUTER_API_KEY (when provider=openrouter, the default routing path)
 *   - Developer extension enabled in ~/.config/goose/config.yaml
 */

import { spawnSync } from 'child_process';
import { execSync } from 'child_process';

// ============================================================================
// Types
// ============================================================================

export interface GooseModel {
  provider: string;
  model: string;
}

export interface GooseSessionResult {
  output: string;
  exitCode: number;
  durationMs: number;
  modelUsed: GooseModel;
}

export interface GooseSessionOptions {
  task: string;
  model?: GooseModel;
  projectRoot?: string;
  extraEnv?: Record<string, string>;
  timeoutMs?: number;
  maxTurns?: number;
}

// ============================================================================
// Model normalisation
// ============================================================================

/**
 * Map a bare model ID (as used in Roland recipe YAMLs) to a Goose
 * provider + model pair that can be set via GOOSE_PROVIDER / GOOSE_MODEL.
 *
 * All models route through OpenRouter by default, which supports the widest
 * range and preserves Roland's budget-enforcement logic.
 * Exceptions: models with an explicit provider prefix are split on '/'.
 */
export function normaliseGooseModel(modelId: string): GooseModel {
  // Already provider-scoped (e.g. "anthropic/claude-sonnet-4-5")
  if (modelId.includes('/')) {
    const slash = modelId.indexOf('/');
    return {
      provider: 'openrouter',
      model: modelId, // OpenRouter accepts full namespaced IDs
    };
    // Suppress unused variable warning by using the split result only when needed
    void slash;
  }

  // Bare model names — normalise to provider/model for OpenRouter
  const prefixMap: Array<[RegExp, string]> = [
    [/^claude-/, 'anthropic/'],
    [/^gpt-/, 'openai/'],
    [/^gemini-/, 'google/'],
    [/^grok-/, 'x-ai/'],
    [/^mistral-/, 'mistralai/'],
    [/^llama-/, 'meta-llama/'],
    [/^deepseek-/, 'deepseek/'],
  ];

  let normalisedModel = modelId;
  for (const [pattern, prefix] of prefixMap) {
    if (pattern.test(modelId)) {
      normalisedModel = `${prefix}${modelId}`;
      break;
    }
  }

  return { provider: 'openrouter', model: normalisedModel };
}

// ============================================================================
// PATH detection
// ============================================================================

/**
 * Returns true if the `goose` CLI is available in PATH.
 */
export function isGooseAvailable(): boolean {
  try {
    const cmd = process.platform === 'win32' ? 'where goose' : 'which goose';
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the goose version string, or null if not available.
 */
export function getGooseVersion(): string | null {
  try {
    const result = execSync('goose --version', { encoding: 'utf-8', stdio: 'pipe' });
    return result.trim();
  } catch {
    return null;
  }
}

// ============================================================================
// Session spawner
// ============================================================================

/**
 * Spawn a headless Goose session for a single task.
 *
 * Goose will have access to all extensions configured in ~/.config/goose/config.yaml
 * (including Developer = file read/write + shell) plus any Roland MCP tools if Roland
 * is configured there.
 *
 * @param options.task        The full task prompt (system + user blended as instructions)
 * @param options.model       Model to use (defaults to claude-sonnet-4-5 via OpenRouter)
 * @param options.projectRoot Working directory for the Goose session (defaults to cwd)
 * @param options.extraEnv    Additional environment variables injected into the process
 * @param options.timeoutMs   Per-session timeout in ms (default: 300,000 = 5 min)
 * @param options.maxTurns    Max LLM turns Goose is allowed (default: 30)
 */
export async function spawnGooseSession(options: GooseSessionOptions): Promise<GooseSessionResult> {
  const {
    task,
    model = normaliseGooseModel('claude-sonnet-4-5'),
    projectRoot = process.cwd(),
    extraEnv = {},
    timeoutMs = 300_000,
    maxTurns = 30,
  } = options;

  if (!isGooseAvailable()) {
    throw new Error(
      'Goose CLI not found in PATH. Install it from https://block.github.io/goose/ then re-run.'
    );
  }

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    // Headless / non-interactive mode
    GOOSE_MODE: 'auto',
    GOOSE_MAX_TURNS: String(maxTurns),
    GOOSE_DISABLE_SESSION_NAMING: 'true',
    GOOSE_CONTEXT_STRATEGY: 'summarize',
    // Model routing
    GOOSE_PROVIDER: model.provider,
    GOOSE_MODEL: model.model,
    // Project root for Roland tools
    ROLAND_PROJECT_ROOT: projectRoot,
    // Caller overrides last
    ...extraEnv,
  };

  // Sanitise task to be safe as a CLI argument: use stdin approach via echo
  // to avoid shell injection from arbitrary task strings.
  const t0 = Date.now();

  const result = spawnSync(
    'goose',
    ['run', '--no-session', '-t', task],
    {
      cwd: projectRoot,
      env,
      timeout: timeoutMs,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    }
  );

  const durationMs = Date.now() - t0;

  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
      throw new Error(`Goose session timed out after ${timeoutMs / 1000}s`);
    }
    throw new Error(`Goose process error: ${result.error.message}`);
  }

  const output = [result.stdout ?? '', result.stderr ?? '']
    .filter(Boolean)
    .join('\n')
    .trim();

  return {
    output,
    exitCode: result.status ?? 1,
    durationMs,
    modelUsed: model,
  };
}
