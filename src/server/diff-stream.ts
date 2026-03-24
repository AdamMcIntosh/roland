/**
 * DiffStreamServer — WebSocket server for real-time diff streaming to the VS Code extension.
 * Port 8089 by default (separate from dashboard's 8080).
 * Broadcasts DiffEvent messages to all connected extension clients.
 */

import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface DiffEvent {
  type: 'diff:new' | 'diff:chunk' | 'diff:complete' | 'diff:discard';
  id: string;
  file?: string;
  original?: string;
  modified?: string;
  chunk?: string;
  timestamp: number;
}

// ============================================================================
// DiffStreamServer class
// ============================================================================

export class DiffStreamServer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private readonly port: number;

  constructor(port: number = 8089) {
    this.port = port;
  }

  start(): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ port: this.port });
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
    });
    this.wss.on('error', (err: Error) => {
      logger.error(`[DiffStream] Server error: ${err.message}`);
    });
    logger.info(`[DiffStream] Listening on ws://localhost:${this.port}`);
  }

  stop(): void {
    if (this.wss) {
      for (const client of this.clients) {
        try { client.terminate(); } catch { /* ignore */ }
      }
      this.clients.clear();
      this.wss.close();
      this.wss = null;
    }
  }

  broadcastDiff(event: DiffEvent): void {
    const msg = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === 1 /* OPEN */) {
        client.send(msg);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: DiffStreamServer | null = null;

export function initDiffStreamServer(port: number = 8089): DiffStreamServer {
  if (!instance) {
    instance = new DiffStreamServer(port);
  }
  return instance;
}

export function getDiffStreamServer(): DiffStreamServer | null {
  return instance;
}
