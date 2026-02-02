/**
 * Agent Loop Type Definitions
 * Types for autonomous agent with tool calling capabilities
 */

// ============================================================================
// Tool Definitions
// ============================================================================

export type ToolParameter =
  | { type: 'string'; description: string; }
  | { type: 'number'; description: string; }
  | { type: 'boolean'; description: string; }
  | { type: 'array'; description: string; items?: ToolParameter; }
  | { type: 'object'; description?: string; properties?: Record<string, ToolParameter>; required?: string[]; };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type?: 'object' | string;
    properties?: Record<string, any>;
    required?: string[];
  };
  category: 'skill' | 'file' | 'terminal' | 'workflow' | 'mode';
}

export interface ToolCall {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

// ============================================================================
// LLM Messages & Responses
// ============================================================================

export interface Message {
  role: 'user' | 'assistant' | 'tool_result';
  content: string | ContentBlock[];
  timestamp?: string;
  toolName?: string;
  toolUseId?: string;
}

export interface ContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface LLMToolResponse {
  stop_reason: 'tool_use' | 'end_turn' | 'max_tokens';
  content: ContentBlock[];
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ============================================================================
// Agent Session Configuration
// ============================================================================

export interface SessionConfig {
  model?: string; // Configurable per session
  autoConfirm?: {
    files?: boolean;
    terminal?: boolean;
    skills?: boolean;
  };
  maxToolCalls?: number; // Default: 20
  maxTerminalCommands?: number; // Default: 10
  workspaceDirectory?: string; // Default: current dir
  logActions?: boolean; // Default: true
}

// ============================================================================
// Conversation History
// ============================================================================

export interface ConversationEntry {
  userMessage: string;
  assistantResponse: string;
  toolsUsed: string[];
  timestamp: Date;
  cost: number;
}

export interface ConversationContext {
  conversationHistory?: Message[];
  entries?: ConversationEntry[];
  totalCost: number;
  toolCallCount: number;
  terminalCommandCount?: number;
  sessionId: string;
  startTime: Date;
  model: string;
  maxToolCalls?: number;
}

// ============================================================================
// Audit Logging
// ============================================================================

export interface AuditLog {
  timestamp: Date;
  action: 'tool_call' | 'file_read' | 'file_write' | 'terminal_cmd' | 'user_confirm' | 'error';
  toolName?: string;
  input?: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'approved' | 'denied' | 'completed' | 'failed';
  userApproved?: boolean;
  error?: string;
}

export interface AuditLogFile {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  model: string;
  logs: AuditLog[];
}

// ============================================================================
// Execution Results
// ============================================================================

export interface ExecutionResult {
  success: boolean;
  output: string;
  cost: number;
  toolsUsed: string[];
  filesModified: string[];
  commandsExecuted: string[];
}

// ============================================================================
// Agent State
// ============================================================================

export interface AgentState {
  sessionId: string;
  sessionConfig: SessionConfig;
  conversationContext: ConversationContext;
  auditLogs: AuditLog[];
  currentRequest?: string;
  status: 'idle' | 'processing' | 'waiting_for_confirmation' | 'error';
}
