#!/usr/bin/env node
/**
 * RCO Agent Worker — child process that executes an agent step.
 *
 * Execution priority:
 *   1. CURSOR_API_KEY set → real @cursor/sdk Agent (production path)
 *   2. otherwise          → inline mock string (tests / CI)
 *
 * Generates a structured prompt via buildClaudeToolCallingPrompt, sends it to
 * the chosen backend, and returns a WorkerOutput JSON envelope.
 */
export {};
//# sourceMappingURL=agentWorker.d.ts.map