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
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import { getPermissionBlock, readPermissions } from './permission-gate.js';
// ============================================================================
// Model normalisation
// ============================================================================
/**
 * Map a bare model ID (as used in Roland recipe YAMLs) to a Goose
 * provider + model pair that can be set via GOOSE_PROVIDER / GOOSE_MODEL.
 */
export function normaliseGooseModel(modelId) {
    if (modelId.includes('/')) {
        return { provider: 'openrouter', model: modelId };
    }
    const prefixMap = [
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
export function isGooseAvailable() {
    try {
        const cmd = process.platform === 'win32' ? 'where goose' : 'which goose';
        execSync(cmd, { stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
export function getGooseVersion() {
    try {
        return execSync('goose --version', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    }
    catch {
        return null;
    }
}
// ============================================================================
// Session spawner — streaming
// ============================================================================
/**
 * Spawn a headless Goose session for a single task.
 *
 * Streams stdout/stderr in real-time to process.stdout and optionally to the
 * `onChunk` callback. Returns the full buffered output on completion.
 */
export function spawnGooseSession(options) {
    const { task, model = normaliseGooseModel('claude-sonnet-4-5'), projectRoot = process.cwd(), extraEnv = {}, timeoutMs = 300_000, maxTurns = 30, onChunk, sessionName, supervised = false, } = options;
    return new Promise((resolve, reject) => {
        if (!isGooseAvailable()) {
            reject(new Error('Goose CLI not found in PATH. Install it from https://block.github.io/goose/ then re-run.'));
            return;
        }
        // Prepend permission policy block to task (if any restrictions are set)
        const permBlock = getPermissionBlock(projectRoot);
        const effectiveTask = permBlock ? `${permBlock}\n\n${task}` : task;
        const env = {
            ...process.env,
            // In supervised mode we leave GOOSE_MODE unset so Goose prompts for confirmations
            ...(supervised ? {} : { GOOSE_MODE: 'auto' }),
            GOOSE_MAX_TURNS: String(maxTurns),
            GOOSE_CONTEXT_STRATEGY: 'summarize',
            GOOSE_PROVIDER: model.provider,
            GOOSE_MODEL: model.model,
            ROLAND_PROJECT_ROOT: projectRoot,
            ...extraEnv,
        };
        // Named sessions preserve conversation history; anonymous sessions start fresh
        const sessionArgs = sessionName
            ? ['--session', sessionName]
            : ['--no-session'];
        const t0 = Date.now();
        const chunks = [];
        const child = spawn('goose', ['run', ...sessionArgs, '-t', effectiveTask], {
            cwd: projectRoot,
            env,
            // Supervised mode needs a writable stdin so we can respond to confirmations
            stdio: supervised ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
        });
        const handleChunk = (data) => {
            const text = data.toString();
            chunks.push(text);
            process.stdout.write(text);
            onChunk?.(text);
        };
        child.stdout.on('data', handleChunk);
        child.stderr.on('data', handleChunk);
        // Supervised mode — detect Goose tool-call confirmation prompts and
        // auto-approve or auto-deny based on the project permission policy.
        if (supervised && child.stdin) {
            const policy = readPermissions(projectRoot);
            const denyCommands = policy.deny_commands ?? [];
            const denyPaths = policy.deny_paths ?? [];
            // Patterns that indicate Goose is waiting for confirmation
            const confirmPatterns = [/\(y\/n\)/i, /\[y\/N\]/i, /allow\?/i, /approve\?/i, /confirm\?/i];
            let pending = '';
            child.stdout.on('data', (data) => {
                pending += data.toString();
                const isConfirmPrompt = confirmPatterns.some(p => p.test(pending));
                if (!isConfirmPrompt)
                    return;
                // Decide: deny if pending text mentions a denied command or path
                const lower = pending.toLowerCase();
                const denied = (policy.allow_shell === false) ||
                    denyCommands.some(cmd => lower.includes(cmd.toLowerCase())) ||
                    denyPaths.some(p => lower.includes(p.toLowerCase()));
                const response = denied ? 'n\n' : 'y\n';
                const decision = denied ? '🚫 DENY' : '✅ ALLOW';
                process.stdout.write(`\n[Roland supervised] ${decision}\n`);
                child.stdin.write(response);
                pending = '';
            });
        }
        // Enforce timeout
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            // Give it 5s to exit cleanly before SIGKILL
            setTimeout(() => child.kill('SIGKILL'), 5000);
            reject(new Error(`Goose session timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs);
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(new Error(`Goose process error: ${err.message}`));
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({
                output: chunks.join('').trim(),
                exitCode: code ?? 1,
                durationMs: Date.now() - t0,
                modelUsed: model,
            });
        });
    });
}
//# sourceMappingURL=goose-runner.js.map