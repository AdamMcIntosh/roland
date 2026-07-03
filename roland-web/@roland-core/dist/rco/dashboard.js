/**
 * RCO WebSocket dashboard — lightweight broadcast hub for workflow monitoring.
 */
import { WebSocketServer } from 'ws';
let wss;
let httpServer;
function clients() {
    if (!wss)
        return [];
    return Array.from(wss.clients).filter((c) => c.readyState === c.OPEN);
}
export function broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const client of clients()) {
        client.send(data);
    }
}
export function broadcastGraph(steps, sessionId) {
    broadcast({
        type: 'graph',
        sessionId,
        steps,
        ts: Date.now(),
    });
}
export function startDashboard(port = 8080) {
    stopDashboard();
    wss = new WebSocketServer({ port });
    return wss;
}
export function stopDashboard() {
    for (const client of clients()) {
        try {
            client.close();
        }
        catch {
            // ignore
        }
    }
    wss?.close();
    httpServer?.close();
    wss = undefined;
    httpServer = undefined;
}
//# sourceMappingURL=dashboard.js.map