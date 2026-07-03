/**
 * RCO WebSocket dashboard — lightweight broadcast hub for workflow monitoring.
 */
import { WebSocketServer } from 'ws';
export declare function broadcast(payload: unknown): void;
export declare function broadcastGraph(steps: Array<{
    agent: string;
    output_to?: string;
}>, sessionId: string): void;
export declare function startDashboard(port?: number): WebSocketServer;
export declare function stopDashboard(): void;
//# sourceMappingURL=dashboard.d.ts.map