#!/usr/bin/env node
/**
 * scripts/test-mcp-tools.mjs
 *
 * MCP smoke test — spawns the Roland MCP server, speaks the JSON-RPC stdio
 * protocol, and verifies that the core tools respond correctly.
 *
 * Tests:
 *   1. initialize / notifications/initialized handshake
 *   2. health_check   — status: healthy
 *   3. triage (small) — routes to an agent persona, returns complexity
 *   4. triage (large) — returns suggested_depth + optional recipe hint
 *   5. roland_hello   — greeting + project_state shape
 *   6. roland_run_team — rejects empty goal with a clear error
 *   7. list_team       — returns a non-empty engineer roster
 *   8. pm_standup      — returns markdown or structured data without crashing
 *
 * Usage:
 *   node scripts/test-mcp-tools.mjs
 *
 * Exit: 0 = all pass  |  1 = any failure
 */

import { spawn }        from 'child_process';
import { fileURLToPath } from 'url';
import path             from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const ENTRY     = path.join(ROOT, 'dist', 'server', 'mcp-server.js');
const TIMEOUT_MS = 20_000;

// ── Colour helpers ────────────────────────────────────────────────────────────
const g  = (s) => `\x1b[32m${s}\x1b[0m`;
const r  = (s) => `\x1b[31m${s}\x1b[0m`;
const b  = (s) => `\x1b[1m${s}\x1b[0m`;
const d  = (s) => `\x1b[2m${s}\x1b[0m`;

// ── MCP stdio client ──────────────────────────────────────────────────────────

class McpClient {
  #proc;
  #buf     = '';
  #pending = new Map();   // id → { resolve, reject, timer }
  #nextId  = 1;

  constructor(proc) {
    this.#proc = proc;

    proc.stdout.setEncoding('utf-8');
    proc.stdout.on('data', (chunk) => {
      this.#buf += chunk;
      const lines = this.#buf.split('\n');
      this.#buf   = lines.pop();                    // keep incomplete tail
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let msg;
        try { msg = JSON.parse(trimmed); } catch { continue; }
        if (msg.id !== undefined && this.#pending.has(msg.id)) {
          const { resolve, reject, timer } = this.#pending.get(msg.id);
          this.#pending.delete(msg.id);
          clearTimeout(timer);
          if (msg.error) reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
          else           resolve(msg.result);
        }
      }
    });

    proc.stderr.on('data', () => {});               // suppress server stderr
  }

  /** Send a request and return a Promise for the result. */
  request(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`⏱  Timeout (${TIMEOUT_MS} ms) waiting for response to "${method}"`));
      }, TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timer });
      this.#write({ jsonrpc: '2.0', id, method, params });
    });
  }

  /** Send a notification (no response expected). */
  notify(method, params = {}) {
    this.#write({ jsonrpc: '2.0', method, params });
  }

  /** Call an MCP tool and return the parsed result object. */
  async callTool(name, args = {}) {
    const res  = await this.request('tools/call', { name, arguments: args });
    const text = res?.content?.[0]?.text ?? '';
    try   { return { raw: res, data: JSON.parse(text), isError: res?.isError ?? false }; }
    catch { return { raw: res, data: null,             isError: res?.isError ?? false, text }; }
  }

  #write(msg) {
    this.#proc.stdin.write(JSON.stringify(msg) + '\n');
  }

  kill() {
    try { this.#proc.kill('SIGTERM'); } catch { /* ignore */ }
  }
}

// ── Test harness ──────────────────────────────────────────────────────────────

const results = [];

async function test(label, fn) {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    console.log(`${g('✓')} ${label}  ${d(ms + 'ms')}`);
    results.push({ label, ok: true });
  } catch (e) {
    const ms = Date.now() - start;
    console.error(`${r('✗')} ${label}  ${d(ms + 'ms')}`);
    console.error(`    ${r(e.message)}`);
    results.push({ label, ok: false, error: e.message });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${b('Roland MCP Tools — smoke test')}\n`);

  // Spawn the MCP server
  const proc = spawn(process.execPath, [ENTRY], {
    cwd:   ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env:   { ...process.env, ROLAND_QUIET: '1' },
  });

  proc.on('error', (e) => {
    console.error(r(`\nFailed to spawn MCP server: ${e.message}`));
    console.error(`  Make sure you have run ${b('npm run build')} first.`);
    process.exit(1);
  });

  const client = new McpClient(proc);

  try {
    // ── 1. Handshake ────────────────────────────────────────────────────────
    await test('MCP handshake (initialize + initialized)', async () => {
      const res = await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities:    {},
        clientInfo:      { name: 'roland-test', version: '1.0.0' },
      });
      if (!res?.serverInfo && !res?.capabilities) {
        throw new Error('Server did not return capabilities in initialize response');
      }
      client.notify('notifications/initialized', {});
    });

    // ── 2. health_check ─────────────────────────────────────────────────────
    await test('health_check → status: healthy', async () => {
      const { data, isError } = await client.callTool('health_check', {});
      if (isError)             throw new Error('Tool returned isError: true');
      if (data?.status !== 'healthy') throw new Error(`Expected status "healthy", got "${data?.status}"`);
    });

    // ── 3. triage — focused coding task ─────────────────────────────────────
    await test('triage (small task) → agent + complexity', async () => {
      const { data, isError, text } = await client.callTool('triage', {
        message: 'add unit tests for the authentication module',
      });
      if (isError) throw new Error('Tool returned isError: true');
      if (!data)   throw new Error('Could not parse triage response: ' + (text ?? '').slice(0, 200));
      if (!data.agent)
        throw new Error(`No "agent" field in triage response. Keys: ${Object.keys(data).join(', ')}`);
      if (!data.complexity)
        throw new Error(`No "complexity" field. Got agent="${data.agent}"`);
      console.log(`    ${d(`→ agent: ${data.agent}  complexity: ${data.complexity}`)}`);
    });

    // ── 4. triage — complex architectural request ────────────────────────────
    await test('triage (complex goal) → suggested_depth present', async () => {
      const { data, isError } = await client.callTool('triage', {
        message: 'design a complete event-driven microservices architecture with saga pattern for our e-commerce checkout flow',
      });
      if (isError) throw new Error('Tool returned isError: true');
      if (!data?.suggested_mode && !data?.suggested_depth && !data?.depth && !data?.recipe)
        throw new Error(`Expected suggested_mode/suggested_depth/recipe for complex goal. Keys: ${Object.keys(data ?? {}).join(', ')}`);
      const mode = data.suggested_mode ?? data.suggested_depth ?? data.depth ?? '(in recipe)';
      console.log(`    ${d(`→ agent: ${JSON.stringify(data.agent)}  suggested_mode: ${JSON.stringify(mode)}`)}`);;
    });

    // ── 5. roland_hello ──────────────────────────────────────────────────────
    await test('roland_hello → greeting + project_state', async () => {
      const { data, isError } = await client.callTool('roland_hello', {});
      if (isError)          throw new Error('Tool returned isError: true');
      if (!data?.greeting)  throw new Error('No "greeting" field in response');
      if (!data.greeting.includes('Roland'))
        throw new Error('Greeting does not mention Roland');
      if (!data.project_state)
        throw new Error('No "project_state" field in response');
      console.log(`    ${d('→ project_state.board: ' + (data.project_state?.board ?? '(empty)'))}`);
    });

    // ── 6. roland_run_team — empty goal must error ───────────────────────────
    await test('roland_run_team → rejects empty goal', async () => {
      const { raw, isError, text } = await client.callTool('roland_run_team', { goal: '' });
      // Expecting either isError: true OR an error field in the JSON
      const errorText = (text ?? '') + JSON.stringify(raw ?? {});
      const hasError  = isError || errorText.toLowerCase().includes('error') || errorText.includes('required');
      if (!hasError)
        throw new Error('Expected an error for empty goal, but got success: ' + errorText.slice(0, 120));
    });

    // ── 7. list_team ─────────────────────────────────────────────────────────
    await test('list_team → non-empty engineer roster', async () => {
      const { data, isError } = await client.callTool('list_team', {});
      if (isError) throw new Error('Tool returned isError: true');
      if (!Array.isArray(data?.engineers) || data.engineers.length === 0)
        throw new Error(`Expected engineers array, got: ${JSON.stringify(data).slice(0, 120)}`);
      console.log(`    ${d(`→ ${data.engineers.length} engineers available`)}`);
    });

    // ── 8. pm_standup ────────────────────────────────────────────────────────
    await test('pm_standup → returns data without crashing', async () => {
      const { data, text, isError } = await client.callTool('pm_standup', {});
      if (isError) throw new Error('Tool returned isError: true');
      // pm_standup can return markdown string or structured object — either is fine
      const hasContent = data !== null || (typeof text === 'string' && text.length > 0);
      if (!hasContent) throw new Error('pm_standup returned empty response');
      console.log(`    ${d('→ standup response received (' + (text ?? JSON.stringify(data)).slice(0, 60) + '…)')}`);
    });

  } finally {
    client.kill();
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.ok).length;
  const total  = results.length;
  const icon   = passed === total ? g('✓') : r('✗');

  console.log(`\n${icon} ${b(`${passed}/${total} passed`)}\n`);

  if (passed < total) {
    console.log('Failed tests:');
    for (const { label, error } of results.filter(r => !r.ok)) {
      console.log(`  ${r('•')} ${label}`);
      console.log(`    ${d(error)}`);
    }
    console.log('');
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error(r('\nFatal error: ') + e.message);
  process.exit(1);
});
