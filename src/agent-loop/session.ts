import { Message, SessionConfig, ConversationContext, ContentBlock } from './types.js';
import { AuditLogger } from './audit-logger.js';
import { logger } from '../utils/logger.js';

export class SessionManager {
  private config: SessionConfig;
  private conversationHistory: Message[] = [];
  private context: ConversationContext;
  private auditLogger: AuditLogger;
  private sessionId: string;
  private startTime: Date;
  private toolCallCount: number = 0;

  constructor(config: SessionConfig, workspaceDirectory: string) {
    this.config = config;
    this.sessionId = `session-${Date.now()}`;
    this.startTime = new Date();
    this.auditLogger = new AuditLogger(workspaceDirectory);

    this.context = {
      conversationHistory: this.conversationHistory,
      totalCost: 0,
      toolCallCount: 0,
      sessionId: this.sessionId,
      startTime: this.startTime,
      model: config.model || 'nousresearch/hermes-3-llama-3.1-405b:free',
      maxToolCalls: config.maxToolCalls || 20,
    };

    logger.info('Session started', { sessionId: this.sessionId });
    this.auditLogger.logSessionStart();
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get session configuration
   */
  getConfig(): SessionConfig {
    return this.config;
  }

  /**
   * Get conversation context
   */
  getContext(): ConversationContext {
    return this.context;
  }

  /**
   * Add user message to conversation
   */
  addUserMessage(content: string): Message {
    const message: Message = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    this.conversationHistory.push(message);
    logger.debug('User message added to conversation', { sessionId: this.sessionId, length: this.conversationHistory.length });

    return message;
  }

  /**
   * Add assistant message to conversation
   */
  addAssistantMessage(content: string | ContentBlock[]): Message {
    const message: Message = {
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
    };

    this.conversationHistory.push(message);
    logger.debug('Assistant message added to conversation', { sessionId: this.sessionId });

    return message;
  }

  /**
   * Add tool result to conversation
   */
  addToolResult(toolName: string, toolUseId: string, content: string): Message {
    const message: Message = {
      role: 'tool_result',
      content,
      toolName,
      toolUseId,
      timestamp: new Date().toISOString(),
    };

    this.conversationHistory.push(message);
    logger.debug('Tool result added to conversation', { sessionId: this.sessionId, toolName });

    return message;
  }

  /**
   * Get last assistant message
   */
  getLastAssistantMessage(): Message | null {
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      if (this.conversationHistory[i].role === 'assistant') {
        return this.conversationHistory[i];
      }
    }
    return null;
  }

  /**
   * Get last user message
   */
  getLastUserMessage(): Message | null {
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      if (this.conversationHistory[i].role === 'user') {
        return this.conversationHistory[i];
      }
    }
    return null;
  }

  /**
   * Get conversation history (limit last N messages)
   */
  getConversationHistory(limit?: number): Message[] {
    if (limit) {
      return this.conversationHistory.slice(-limit);
    }
    return [...this.conversationHistory];
  }

  /**
   * Check if max tool calls reached
   */
  canExecuteTool(): boolean {
    const maxToolCalls = this.config.maxToolCalls || 20;
    return this.toolCallCount < maxToolCalls;
  }

  /**
   * Increment tool call count
   */
  incrementToolCallCount(): void {
    this.toolCallCount++;
    this.context.toolCallCount = this.toolCallCount;

    if (this.toolCallCount > (this.config.maxToolCalls || 20)) {
      logger.warn('Tool call limit exceeded', { sessionId: this.sessionId, count: this.toolCallCount });
    }
  }

  /**
   * Get tool call count
   */
  getToolCallCount(): number {
    return this.toolCallCount;
  }

  /**
   * Update total cost
   */
  addCost(cost: number): void {
    this.context.totalCost += cost;
    logger.debug('Cost added to session', { sessionId: this.sessionId, cost, totalCost: this.context.totalCost });
  }

  /**
   * Get total cost so far
   */
  getTotalCost(): number {
    return this.context.totalCost;
  }

  /**
   * Get session duration in seconds
   */
  getDuration(): number {
    return (Date.now() - this.startTime.getTime()) / 1000;
  }

  /**
   * Get audit logger
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /**
   * Get session summary
   */
  getSummary(): {
    sessionId: string;
    duration: number;
    conversationLength: number;
    toolCalls: number;
    totalCost: number;
    model: string;
  } {
    return {
      sessionId: this.sessionId,
      duration: this.getDuration(),
      conversationLength: this.conversationHistory.length,
      toolCalls: this.toolCallCount,
      totalCost: this.context.totalCost,
      model: this.context.model,
    };
  }

  /**
   * End session and save audit log
   */
  async end(): Promise<void> {
    this.auditLogger.logSessionEnd();
    await this.auditLogger.save();

    const summary = this.getSummary();
    logger.info('Session ended', summary);
  }

  /**
   * Clear conversation history (start fresh)
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.context.conversationHistory = this.conversationHistory;
    this.toolCallCount = 0;
    this.context.toolCallCount = 0;
    logger.info('Conversation history cleared', { sessionId: this.sessionId });
  }
}
