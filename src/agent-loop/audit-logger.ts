import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger.js';

export interface AuditEntry {
  timestamp: string;
  type: 'tool_call' | 'user_confirmation' | 'error' | 'mode_executed' | 'session_start' | 'session_end';
  toolName?: string;
  toolInput?: Record<string, any>;
  toolOutput?: any;
  userDecision?: 'approved' | 'rejected';
  errorMessage?: string;
  mode?: string;
  cost?: number;
  duration?: number;
}

export class AuditLogger {
  private logFile: string;
  private entries: AuditEntry[] = [];

  constructor(workspaceDirectory: string) {
    this.logFile = path.join(workspaceDirectory, '.omg-agent-log.json');
  }

  /**
   * Add an entry to the audit log
   */
  addEntry(entry: AuditEntry): void {
    const fullEntry = {
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    };

    this.entries.push(fullEntry);

    logger.debug('Audit entry added', fullEntry);
  }

  /**
   * Log a tool call
   */
  logToolCall(toolName: string, input: Record<string, any>): void {
    this.addEntry({
      type: 'tool_call',
      toolName,
      toolInput: input,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log tool result
   */
  logToolResult(toolName: string, output: any): void {
    // Update the last tool call entry with output
    if (this.entries.length > 0) {
      const lastEntry = this.entries[this.entries.length - 1];
      if (lastEntry.type === 'tool_call' && lastEntry.toolName === toolName) {
        lastEntry.toolOutput = output;
      }
    }
  }

  /**
   * Log user confirmation decision
   */
  logUserDecision(decision: 'approved' | 'rejected', context: string): void {
    this.addEntry({
      type: 'user_confirmation',
      userDecision: decision,
      toolInput: { context },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log an error
   */
  logError(errorMessage: string, context?: string): void {
    this.addEntry({
      type: 'error',
      errorMessage,
      toolInput: context ? { context } : undefined,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log mode execution
   */
  logModeExecution(mode: string, duration: number, cost?: number): void {
    this.addEntry({
      type: 'mode_executed',
      mode,
      duration,
      cost,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log session start
   */
  logSessionStart(): void {
    this.addEntry({
      type: 'session_start',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log session end
   */
  logSessionEnd(): void {
    this.addEntry({
      type: 'session_end',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get all entries
   */
  getEntries(): AuditEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries by type
   */
  getEntriesByType(type: AuditEntry['type']): AuditEntry[] {
    return this.entries.filter((entry) => entry.type === type);
  }

  /**
   * Get entries for a specific tool
   */
  getEntriesByTool(toolName: string): AuditEntry[] {
    return this.entries.filter((entry) => entry.toolName === toolName);
  }

  /**
   * Save audit log to file
   */
  async save(): Promise<void> {
    try {
      await fs.writeFile(this.logFile, JSON.stringify(this.entries, null, 2), 'utf-8');
      logger.info(`Audit log saved to ${this.logFile}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to save audit log: ${message}`);
      throw error;
    }
  }

  /**
   * Load audit log from file
   */
  async load(): Promise<void> {
    try {
      let exists = false;
      try {
        await fs.access(this.logFile);
        exists = true;
      } catch {
        exists = false;
      }

      if (exists) {
        const data = await fs.readFile(this.logFile, 'utf-8');
        this.entries = JSON.parse(data);
        logger.info(`Audit log loaded from ${this.logFile}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to load audit log: ${message}`);
      // Don't throw - start with empty log
      this.entries = [];
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalEntries: number;
    toolCalls: number;
    userApprovals: number;
    userRejections: number;
    errors: number;
    modesExecuted: number;
    totalCost: number;
    totalDuration: number;
  } {
    const toolCalls = this.entries.filter((e) => e.type === 'tool_call').length;
    const approvals = this.entries.filter((e) => e.type === 'user_confirmation' && e.userDecision === 'approved').length;
    const rejections = this.entries.filter((e) => e.type === 'user_confirmation' && e.userDecision === 'rejected').length;
    const errors = this.entries.filter((e) => e.type === 'error').length;
    const modes = this.entries.filter((e) => e.type === 'mode_executed');

    const totalCost = modes.reduce((sum, e) => sum + (e.cost || 0), 0);
    const totalDuration = modes.reduce((sum, e) => sum + (e.duration || 0), 0);

    return {
      totalEntries: this.entries.length,
      toolCalls,
      userApprovals: approvals,
      userRejections: rejections,
      errors,
      modesExecuted: modes.length,
      totalCost,
      totalDuration,
    };
  }
}
