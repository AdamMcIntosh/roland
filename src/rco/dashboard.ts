/**
 * RCO Dashboard — WebSocket server for monitoring agent status and logs.
 * Port 8080 by default; broadcasts to all connected clients. No UI; endpoint for future React app.
 */

import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export interface DashboardPayload {
  type: 'log' | 'status' | 'session' | 'graph';
  agent?: string;
  phase?: string;
  message?: string;
  sessionId?: string;
  step?: number;
  timestamp?: number;
  /** For type 'graph': dependency tree nodes and edges from orchestrator state */
  nodes?: Array<{ id: string; label: string }>;
  edges?: Array<{ from: string; to: string }>;
}

export function broadcast(payload: DashboardPayload): void {
  const msg = JSON.stringify({ ...payload, timestamp: payload.timestamp ?? Date.now() });
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

export function startDashboard(port: number = 8080): WebSocketServer {
  if (wss) return wss;
  wss = new WebSocketServer({ port });
  wss.on('connection', (ws) => {
    clients.add(ws);
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
