/**
 * DiffStreamServer — WebSocket server for real-time diff streaming to the VS Code extension.
 * Port 8089 by default (separate from dashboard's 8080).
 * Broadcasts DiffEvent messages to all connected extension clients.
 */
export interface DiffEvent {
    type: 'diff:new' | 'diff:chunk' | 'diff:complete' | 'diff:discard';
    id: string;
    file?: string;
    original?: string;
    modified?: string;
    chunk?: string;
    timestamp: number;
}
export declare class DiffStreamServer {
    private wss;
    private clients;
    private readonly port;
    constructor(port?: number);
    start(): void;
    stop(): void;
    broadcastDiff(event: DiffEvent): void;
    getClientCount(): number;
}
export declare function initDiffStreamServer(port?: number): DiffStreamServer;
export declare function getDiffStreamServer(): DiffStreamServer | null;
//# sourceMappingURL=diff-stream.d.ts.map