/**
 * RCO Dashboard — WebSocket server for monitoring agent status and logs.
 * Port 8080 by default; broadcasts to all connected clients. No UI; endpoint for future React app.
 */

import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export interface DashboardPayload {
  type: 'log' | 'status' | 'session';
  agent?: string;
  phase?: string;
  message?: string;
  sessionId?: string;
  step?: number;
  timestamp?: number;
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
