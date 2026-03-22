/**
 * RCO Dashboard — WebSocket server for monitoring agent status and logs.
 * Port 8080 by default; broadcasts to all connected clients.
 * Collab-mode: clients can send collab_feedback to resume after pause.
 */

import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

/** Pending resolvers for collab-mode: sessionId -> resolve(feedback) */
const pendingCollabResolvers = new Map<string, (value: string) => void>();
const collabTimeouts = new Map<string, NodeJS.Timeout>();

export interface DashboardPayload {
  type: 'log' | 'status' | 'session' | 'graph' | 'collab_pause' | 'collab_resume' | 'metrics';
  agent?: string;
  phase?: string;
  message?: string;
  sessionId?: string;
  step?: number;
  timestamp?: number;
  /** For type 'graph': dependency tree nodes and edges from orchestrator state */
  nodes?: Array<{ id: string; label: string }>;
  edges?: Array<{ from: string; to: string }>;
  /** For type 'collab_pause': prompt shown to user */
  collabPrompt?: string;
  stepIndex?: number;
  /** For type 'metrics': real-time metrics */
  tokensEstimated?: number;
  stepsCount?: number;
  currentStep?: number;
}

export function broadcast(payload: DashboardPayload): void {
  const msg = JSON.stringify({ ...payload, timestamp: payload.timestamp ?? Date.now() });
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

/**
 * Wait for user feedback from dashboard client (collab-mode).
 * Resolves when a client sends { type: 'collab_feedback', sessionId, feedback } or after timeoutMs.
 */
export function waitForCollabFeedback(sessionId: string, timeoutMs: number = 300000): Promise<string> {
  return new Promise((resolve, reject) => {
    const existing = pendingCollabResolvers.get(sessionId);
    if (existing) {
      existing('');
      pendingCollabResolvers.delete(sessionId);
      const t = collabTimeouts.get(sessionId);
      if (t) clearTimeout(t);
      collabTimeouts.delete(sessionId);
    }
    const timeout = setTimeout(() => {
      if (pendingCollabResolvers.delete(sessionId)) {
        reject(new Error('Collab feedback timeout'));
      }
      collabTimeouts.delete(sessionId);
    }, timeoutMs);
    collabTimeouts.set(sessionId, timeout);
    pendingCollabResolvers.set(sessionId, (value: string) => {
      clearTimeout(timeout);
      collabTimeouts.delete(sessionId);
      resolve(value);
    });
  });
}

/** Called when a client sends collab_feedback; resolves the waiter for that sessionId. */
export function receiveCollabFeedback(sessionId: string, feedback: string): void {
  const resolve = pendingCollabResolvers.get(sessionId);
  if (resolve) {
    pendingCollabResolvers.delete(sessionId);
    const t = collabTimeouts.get(sessionId);
    if (t) clearTimeout(t);
    collabTimeouts.delete(sessionId);
    resolve(feedback);
  }
}

export function startDashboard(port: number = 8080): WebSocketServer {
  if (wss) return wss;
  wss = new WebSocketServer({ port });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('message', (raw: Buffer | string) => {
      try {
        const data = JSON.parse(raw.toString()) as { type?: string; sessionId?: string; feedback?: string };
        if (data.type === 'collab_feedback' && data.sessionId) {
          receiveCollabFeedback(data.sessionId, data.feedback ?? '');
        }
      } catch {
        // ignore invalid JSON
      }
    });
    ws.on('close', () => clients.delete(ws));
  });
  return wss;
}

export function stopDashboard(): void {
  if (wss) {
    wss.close();
    wss = null;
  }
  clients.clear();
}

/**
 * Broadcast dependency graph (nodes/edges) for Tauri dashboard Chart.js visualization.
 * Call from orchestrator when state or workflow steps are available.
 */
export function broadcastGraph(
  workflowSteps: Array<{ agent: string; output_to?: string }>,
  sessionId?: string
): void {
  const nodes = workflowSteps.map((s) => ({ id: s.agent.replace(/\s+/g, '_'), label: s.agent }));
  const seen = new Set(nodes.map((n) => n.id));
  const edges: Array<{ from: string; to: string }> = [];
  for (const step of workflowSteps) {
    const from = step.agent.replace(/\s+/g, '_');
    if (step.output_to) {
      const to = step.output_to.replace(/\s+/g, '_');
      if (!seen.has(to)) {
        nodes.push({ id: to, label: step.output_to });
        seen.add(to);
      }
      edges.push({ from, to });
    }
  }
  broadcast({
    type: 'graph',
    sessionId,
    nodes,
    edges,
    timestamp: Date.now(),
  });
}
