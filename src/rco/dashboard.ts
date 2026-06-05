/**
 * RCO WebSocket dashboard — lightweight broadcast hub for workflow monitoring.
 */

import { WebSocketServer, type WebSocket } from 'ws';
import type { Server } from 'http';

let wss: WebSocketServer | undefined;
let httpServer: Server | undefined;

function clients(): WebSocket[] {
  if (!wss) return [];
  return Array.from(wss.clients).filter((c) => c.readyState === c.OPEN);
}

export function broadcast(payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const client of clients()) {
    client.send(data);
  }
}

export function broadcastGraph(
  steps: Array<{ agent: string; output_to?: string }>,
  sessionId: string,
): void {
  broadcast({
    type: 'graph',
    sessionId,
    steps,
    ts: Date.now(),
  });
}

export function startDashboard(port = 8080): WebSocketServer {
  stopDashboard();
  wss = new WebSocketServer({ port });
  return wss;
}

export function stopDashboard(): void {
  for (const client of clients()) {
    try {
      client.close();
    } catch {
      // ignore
    }
  }
  wss?.close();
  httpServer?.close();
  wss = undefined;
  httpServer = undefined;
}
