/**
 * DiffStreamServer — WebSocket server for real-time diff streaming to the VS Code extension.
 * Port 8089 by default (separate from dashboard's 8080).
 * Broadcasts DiffEvent messages to all connected extension clients.
 */
import { WebSocketServer } from 'ws';
import { logger } from '../utils/logger.js';
// ============================================================================
// DiffStreamServer class
// ============================================================================
export class DiffStreamServer {
    wss = null;
    clients = new Set();
    port;
    constructor(port = 8089) {
        this.port = port;
    }
    start() {
        if (this.wss)
            return;
        this.wss = new WebSocketServer({ port: this.port });
        this.wss.on('connection', (ws) => {
            this.clients.add(ws);
            ws.on('close', () => this.clients.delete(ws));
            ws.on('error', () => this.clients.delete(ws));
        });
        this.wss.on('error', (err) => {
            logger.error(`[DiffStream] Server error: ${err.message}`);
        });
        logger.info(`[DiffStream] Listening on ws://localhost:${this.port}`);
    }
    stop() {
        if (this.wss) {
            for (const client of this.clients) {
                try {
                    client.terminate();
                }
                catch { /* ignore */ }
            }
            this.clients.clear();
            this.wss.close();
            this.wss = null;
        }
    }
    broadcastDiff(event) {
        const msg = JSON.stringify(event);
        for (const client of this.clients) {
            if (client.readyState === 1 /* OPEN */) {
                client.send(msg);
            }
        }
    }
    getClientCount() {
        return this.clients.size;
    }
}
// ============================================================================
// Singleton
// ============================================================================
let instance = null;
export function initDiffStreamServer(port = 8089) {
    if (!instance) {
        instance = new DiffStreamServer(port);
    }
    return instance;
}
export function getDiffStreamServer() {
    return instance;
}
//# sourceMappingURL=diff-stream.js.map