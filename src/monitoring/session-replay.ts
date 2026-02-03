/**
 * Session Replay System
 * 
 * Records agent lifecycle events to JSONL for post-session analysis
 */

import fs from 'fs';
import path from 'path';
import { ReplayEvent, ReplayEventType, ReplaySummary, ToolTiming } from './types.js';
import { logger } from '../utils/logger.js';

export class SessionReplay {
  private sessionId: string;
  private sessionStart: number;
  private replayFile: string;
  private stateDir: string;

  constructor(sessionId: string, stateDir: string = './.samwise/state') {
    this.sessionId = sessionId;
    this.sessionStart = Date.now();
    this.stateDir = stateDir;
    this.replayFile = path.join(stateDir, `session-replay-${sessionId}.jsonl`);

    // Ensure state directory exists
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
  }

  /**
   * Record agent start
   */
  recordAgentStart(
    agentId: string,
    agentType: string,
    task?: string,
    parentMode?: string,
    model?: string
  ): void {
    const event: ReplayEvent = {
      t: this.getTimestamp(),
      agent: agentId,
      agent_type: agentType,
      event: 'agent_start',
      task,
      parent_mode: parentMode,
      model,
    };

    this.writeEvent(event);
  }

  /**
   * Record agent stop
   */
  recordAgentStop(
    agentId: string,
    agentType: string,
    success: boolean,
    durationMs?: number
  ): void {
    const event: ReplayEvent = {
      t: this.getTimestamp(),
      agent: agentId,
      agent_type: agentType,
      event: 'agent_stop',
      success,
      duration_ms: durationMs,
    };

    this.writeEvent(event);
  }

  /**
   * Record tool execution
   */
  recordToolStart(agentId: string, toolName: string): void {
    const event: ReplayEvent = {
      t: this.getTimestamp(),
      agent: agentId,
      event: 'tool_start',
      tool: toolName,
    };

    this.writeEvent(event);
  }

  recordToolEnd(
    agentId: string,
    toolName: string,
    durationMs: number,
    success: boolean = true
  ): void {
    const event: ReplayEvent = {
      t: this.getTimestamp(),
      agent: agentId,
      event: 'tool_end',
      tool: toolName,
      duration_ms: durationMs,
      success,
    };

    this.writeEvent(event);
  }

  /**
   * Record file touch
   */
  recordFileTouch(agentId: string, filePath: string): void {
    const event: ReplayEvent = {
      t: this.getTimestamp(),
      agent: agentId,
      event: 'file_touch',
      file: filePath,
    };

    this.writeEvent(event);
  }

  /**
   * Record intervention
   */
  recordIntervention(
    agentId: string,
    interventionType: string,
    reason: string
  ): void {
    const event: ReplayEvent = {
      t: this.getTimestamp(),
      agent: agentId,
      event: 'intervention',
      intervention_type: interventionType,
      reason,
    };

    this.writeEvent(event);
  }

  /**
   * Read all replay events
   */
  readEvents(): ReplayEvent[] {
    if (!fs.existsSync(this.replayFile)) {
      return [];
    }

    const content = fs.readFileSync(this.replayFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);

    return lines.map(line => {
      try {
        return JSON.parse(line) as ReplayEvent;
      } catch (error) {
        logger.warn(`Failed to parse replay event: ${line}`);
        return null;
      }
    }).filter(event => event !== null) as ReplayEvent[];
  }

  /**
   * Get session summary
   */
  getSummary(): ReplaySummary {
    const events = this.readEvents();

    const agentStarts = events.filter(e => e.event === 'agent_start');
    const agentStops = events.filter(e => e.event === 'agent_stop');
    const completed = agentStops.filter(e => e.success).length;
    const failed = agentStops.filter(e => !e.success).length;

    const toolCalls = events.filter(e => e.event === 'tool_end').length;
    const filesTouched = new Set(
      events.filter(e => e.event === 'file_touch').map(e => e.file!)
    );

    // Calculate bottlenecks (tools averaging >1s with 2+ calls)
    const toolTimings = new Map<string, { count: number; total: number }>();
    events.filter(e => e.event === 'tool_end' && e.duration_ms).forEach(e => {
      const timing = toolTimings.get(e.tool!) || { count: 0, total: 0 };
      timing.count++;
      timing.total += e.duration_ms!;
      toolTimings.set(e.tool!, timing);
    });

    const bottlenecks: Array<{ tool: string; avg_duration_ms: number; call_count: number }> = [];
    toolTimings.forEach((timing, tool) => {
      const avg = timing.total / timing.count;
      if (timing.count >= 2 && avg > 1000) {
        bottlenecks.push({
          tool,
          avg_duration_ms: avg,
          call_count: timing.count,
        });
      }
    });

    bottlenecks.sort((a, b) => b.avg_duration_ms - a.avg_duration_ms);

    const lastEvent = events[events.length - 1];
    const duration = lastEvent ? lastEvent.t : 0;

    return {
      session_id: this.sessionId,
      duration_seconds: duration,
      agents_spawned: agentStarts.length,
      agents_completed: completed,
      agents_failed: failed,
      total_tool_calls: toolCalls,
      total_tokens: 0, // Would be populated from analytics
      total_cost: 0, // Would be populated from analytics
      files_touched: Array.from(filesTouched),
      bottlenecks,
    };
  }

  /**
   * Cleanup old replay files
   */
  static cleanupOldReplays(stateDir: string = './.samwise/state', keepLast: number = 10): number {
    if (!fs.existsSync(stateDir)) {
      return 0;
    }

    const files = fs.readdirSync(stateDir)
      .filter(f => f.startsWith('session-replay-') && f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        path: path.join(stateDir, f),
        mtime: fs.statSync(path.join(stateDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime);

    const toDelete = files.slice(keepLast);
    toDelete.forEach(file => {
      try {
        fs.unlinkSync(file.path);
      } catch (error) {
        logger.warn(`Failed to delete replay file ${file.name}: ${error}`);
      }
    });

    return toDelete.length;
  }

  // Private helpers

  private getTimestamp(): number {
    return (Date.now() - this.sessionStart) / 1000;
  }

  private writeEvent(event: ReplayEvent): void {
    try {
      const line = JSON.stringify(event) + '\n';
      fs.appendFileSync(this.replayFile, line);
    } catch (error) {
      logger.error(`Failed to write replay event: ${error}`);
    }
  }
}

// Singleton for current session
let currentReplay: SessionReplay | null = null;

export function getSessionReplay(sessionId?: string): SessionReplay {
  if (!currentReplay || (sessionId && currentReplay['sessionId'] !== sessionId)) {
    currentReplay = new SessionReplay(sessionId || `session_${Date.now()}`);
  }
  return currentReplay;
}

export function resetSessionReplay(): void {
  currentReplay = null;
}
