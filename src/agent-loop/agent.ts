import { LLMClientWithTools } from '../orchestrator/llm-client.js';
import { SessionManager } from './session.js';
import { getToolRegistry } from './tool-registry.js';
import { FileTools } from './file-tools.js';
import { TerminalTools } from './terminal-tools.js';
import { SkillTools } from './skill-tools.js';
import { ModeTools } from './mode-tools.js';
import { ConversationCache } from './conversation-cache.js';
import { SessionConfig, Message, ToolCall } from './types.js';
import { logger } from '../utils/logger.js';
import * as readline from 'readline';
import { BudgetManager } from '../utils/budget-manager.js';
import { createMonitoring, PerformanceMonitoring } from '../monitoring/index.js';
import {
  extractFileArtifactsFromOutput,
  writeFileArtifactsToDirectory,
  isPlanOutput,
  generateFilenameFromQuery,
  createPlanArtifact,
} from '../utils/codegen.js';

export interface AgentOptions {
  config: SessionConfig;
  workspaceDirectory: string;
  interactive?: boolean;
  onMessage?: (message: string) => void;
  onConfirmation?: (question: string) => Promise<boolean>;
  codegen?: {
    enforceDirective?: boolean;
    overwrite?: boolean;
    baseDir?: string;
    confirmOverwrite?: (filePath: string) => Promise<boolean>;
  };
}

export class AutonomousAgent {
  private options: AgentOptions;
  private session: SessionManager;
  private fileTools: FileTools;
  private terminalTools: TerminalTools;
  private skillTools: SkillTools;
  private modeTools: ModeTools;
  private registry = getToolRegistry();
  private budget = new BudgetManager();
  private conversationCache: ConversationCache;
  private isRunning = false;
  private rl?: readline.Interface;
  private monitoring: PerformanceMonitoring;
  private codegenConfig?: AgentOptions['codegen'];

  constructor(options: AgentOptions) {
    this.options = options;

    this.codegenConfig = {
      enforceDirective: options.codegen?.enforceDirective !== false,
      overwrite: options.codegen?.overwrite === true,
      baseDir: options.codegen?.baseDir || options.workspaceDirectory,
      confirmOverwrite: options.codegen?.confirmOverwrite,
    };

    // Initialize monitoring
    this.monitoring = createMonitoring();
    this.monitoring.startSession();

    // Initialize session
    this.session = new SessionManager(options.config, options.workspaceDirectory);

    // Initialize tool handlers
    this.fileTools = new FileTools({
      workspaceDirectory: options.workspaceDirectory,
      config: options.config,
      onConfirmation: options.onConfirmation,
    });

    this.terminalTools = new TerminalTools({
      workspaceDirectory: options.workspaceDirectory,
      config: options.config,
      onConfirmation: options.onConfirmation,
      maxCommands: options.config.maxTerminalCommands || 10,
    });

    this.skillTools = new SkillTools({
      config: options.config,
      onConfirmation: options.onConfirmation,
    });

    this.modeTools = new ModeTools({
      config: options.config,
      onConfirmation: options.onConfirmation,
    });

    // Initialize conversation cache
    this.conversationCache = new ConversationCache();

    // Register all tools
    this.registerTools();

    logger.info('Autonomous agent initialized', { sessionId: this.session.getSessionId() });
  }

  /**
   * Append code generation directive to force file-based outputs
   */
  private appendCodeGenerationDirective(query: string): string {
    if (!this.codegenConfig?.enforceDirective) {
      return query;
    }

    const directive =
      '\n\n' +
      'When generating code or project files, output ONLY fenced code blocks for each file, ' +
      'and include the relative file path in the fence info like:\n' +
      '```ts file=src/index.ts\n' +
      '// filepath: src/index.ts\n' +
      '...file contents...\n' +
      '```\n' +
      'Use one fenced block per file. Paths must be relative to the current working directory.';

    if (query.includes('file=') || query.includes('filepath:')) {
      return query;
    }

    return query + directive;
  }

  /**
   * Register all available tools
   */
  private registerTools(): void {
    // File tools
    this.registry.registerTool(
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        category: 'file',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file to read' },
          },
          required: ['filePath'],
        },
      },
      async (input) => {
        const content = await this.fileTools.readFile(input.filePath as string);
        this.session.getAuditLogger().logToolCall('read_file', input);
        this.session.getAuditLogger().logToolResult('read_file', content);
        return content;
      }
    );

    this.registry.registerTool(
      {
        name: 'write_file',
        description: 'Write contents to a file',
        category: 'file',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file to write' },
            contents: { type: 'string', description: 'File contents' },
          },
          required: ['filePath', 'contents'],
        },
      },
      async (input) => {
        await this.fileTools.writeFile(input.filePath as string, input.contents as string);
        this.session.getAuditLogger().logToolCall('write_file', input);
        return `Successfully wrote ${input.filePath}`;
      }
    );

    this.registry.registerTool(
      {
        name: 'edit_file',
        description: 'Edit a file by replacing old content with new content',
        category: 'file',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file to edit' },
            oldContent: { type: 'string', description: 'Content to find and replace' },
            newContent: { type: 'string', description: 'New content to insert' },
          },
          required: ['filePath', 'oldContent', 'newContent'],
        },
      },
      async (input) => {
        const result = await this.fileTools.editFile(
          input.filePath as string,
          input.oldContent as string,
          input.newContent as string
        );
        this.session.getAuditLogger().logToolCall('edit_file', input);
        return result.result;
      }
    );

    this.registry.registerTool(
      {
        name: 'list_files',
        description: 'List files in a directory',
        category: 'file',
        parameters: {
          type: 'object',
          properties: {
            dirPath: { type: 'string', description: 'Path to the directory (optional)' },
          },
          required: [],
        },
      },
      async (input) => {
        const files = await this.fileTools.listFiles(input.dirPath as string | undefined);
        this.session.getAuditLogger().logToolCall('list_files', input);
        return JSON.stringify(files, null, 2);
      }
    );

    this.registry.registerTool(
      {
        name: 'get_file_info',
        description: 'Get information about a file',
        category: 'file',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file' },
          },
          required: ['filePath'],
        },
      },
      async (input) => {
        const info = await this.fileTools.getFileInfo(input.filePath as string);
        this.session.getAuditLogger().logToolCall('get_file_info', input);
        return JSON.stringify(info, null, 2);
      }
    );

    // Terminal tools
    this.registry.registerTool(
      {
        name: 'execute_command',
        description: 'Execute a terminal command',
        category: 'terminal',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to execute' },
          },
          required: ['command'],
        },
      },
      async (input) => {
        const result = await this.terminalTools.executeCommand(input.command as string);
        this.session.getAuditLogger().logToolCall('execute_command', input);
        if (result.exitCode === 0) {
          return result.stdout || 'Command executed successfully';
        } else {
          throw new Error(result.stderr || 'Command failed');
        }
      }
    );

    // Skill tools
    this.registry.registerTool(
      {
        name: 'list_skills',
        description: 'List all available skills',
        category: 'skill',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      async (input) => {
        const skills = await this.skillTools.listSkills();
        this.session.getAuditLogger().logToolCall('list_skills', input);
        return JSON.stringify(skills, null, 2);
      }
    );

    this.registry.registerTool(
      {
        name: 'execute_skill',
        description: 'Execute a skill with parameters',
        category: 'skill',
        parameters: {
          type: 'object',
          properties: {
            skillName: { type: 'string', description: 'Name of the skill to execute' },
            parameters: { type: 'object', description: 'Skill parameters' },
          },
          required: ['skillName'],
        },
      },
      async (input) => {
        const result = await this.skillTools.executeSkill(
          input.skillName as string,
          (input.parameters as Record<string, any>) || {}
        );
        this.session.getAuditLogger().logToolCall('execute_skill', input);
        return JSON.stringify(result, null, 2);
      }
    );

    // Mode tools
    this.registry.registerTool(
      {
        name: 'list_modes',
        description: 'List all available execution modes',
        category: 'mode',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      async (input) => {
        const modes = this.modeTools.listModes();
        this.session.getAuditLogger().logToolCall('list_modes', input);
        return JSON.stringify(modes, null, 2);
      }
    );

    this.registry.registerTool(
      {
        name: 'run_autopilot',
        description: 'Run Autopilot mode',
        category: 'mode',
        parameters: {
          type: 'object',
          properties: {
            task: { type: 'string', description: 'Task to execute' },
            context: { type: 'string', description: 'Additional context (optional)' },
          },
          required: ['task'],
        },
      },
      async (input) => {
        const result = await this.modeTools.requestModeExecution('autopilot', input.task as string, input.context as string);
        this.session.getAuditLogger().logToolCall('run_autopilot', input);
        return result;
      }
    );

    this.registry.registerTool(
      {
        name: 'run_ultrapilot',
        description: 'Run Ultrapilot mode for complex problems',
        category: 'mode',
        parameters: {
          type: 'object',
          properties: {
            task: { type: 'string', description: 'Task to execute' },
            context: { type: 'string', description: 'Additional context (optional)' },
          },
          required: ['task'],
        },
      },
      async (input) => {
        const result = await this.modeTools.requestModeExecution('ultrapilot', input.task as string, input.context as string);
        this.session.getAuditLogger().logToolCall('run_ultrapilot', input);
        return result;
      }
    );

    logger.info('All tools registered', { count: this.registry.getTools().length });
  }

  /**
   * Process user input through the agent loop
   */
  async processInput(userInput: string): Promise<string> {
    try {
      const preparedInput = this.appendCodeGenerationDirective(userInput);

      // Check budget
      // TODO: Budget checking - implement when BudgetManager is fully available
      // if (!this.budget.isWithinBudget()) {
      //   throw new Error('Budget limit exceeded. Cannot process more requests.');
      // }

      // Check conversation cache first
      const conversationLength = this.session.getConversationHistory().length;
      const cachedTurn = await this.conversationCache.getCachedResponse(preparedInput, conversationLength);

      if (cachedTurn) {
        logger.info('Using cached conversation response', { userInput: userInput.substring(0, 50) });
        this.session.addUserMessage(preparedInput);
        this.session.addAssistantMessage(cachedTurn.assistantResponse);

        return cachedTurn.assistantResponse;
      }

      // Add to conversation
      this.session.addUserMessage(preparedInput);
      this.session.getAuditLogger().logToolCall('user_input', { text: preparedInput });

      // Get conversation history
      const history = this.session.getConversationHistory(20); // Last 20 messages

      // Call LLM with tools
      const response = await LLMClientWithTools.callWithTools({
        messages: history.map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'tool_result',
          content: msg.content,
        })),
        tools: this.registry.getTools(),
        model: this.session.getConfig().model || 'claude-opus',
      });

      // Process response
      let finalResponse = '';
      const toolCalls: ToolCall[] = [];
      const toolResults: Array<{ toolName: string; result: string }> = [];

      // Parse content blocks to find tool uses
      for (const block of response.content) {
        if (block.type === 'tool_use' && block.name && block.id && block.input) {
          toolCalls.push({
            tool_name: block.name,
            tool_use_id: block.id,
            tool_input: block.input,
          });
        } else if (block.type === 'text' && block.text) {
          finalResponse += block.text;
        }
      }

      // Process tool calls
      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          // Check tool call limit
          if (!this.session.canExecuteTool()) {
            throw new Error(`Tool call limit reached (max: ${this.session.getContext().maxToolCalls})`);
          }

          this.session.incrementToolCallCount();

          // Execute tool
          const toolResult = await this.registry.executeTool(toolCall);

          // Track tool result for caching
          toolResults.push({
            toolName: toolCall.tool_name,
            result: toolResult.content,
          });

          // Add result to conversation
          this.session.addToolResult(toolCall.tool_name, toolCall.tool_use_id, toolResult.content);

          logger.debug('Tool executed', { tool: toolCall.tool_name, success: !toolResult.is_error });
        }

        // Call LLM again to get final response after tool execution
        const updatedHistory = this.session.getConversationHistory(20);
        const finalResponse_data = await LLMClientWithTools.callWithTools({
          messages: updatedHistory.map((msg) => ({
            role: msg.role as 'user' | 'assistant' | 'tool_result',
            content: msg.content,
          })),
          tools: this.registry.getTools(),
          model: this.session.getConfig().model || 'claude-opus',
        });

        // Parse final response
        finalResponse = '';
        for (const block of finalResponse_data.content) {
          if (block.type === 'text' && block.text) {
            finalResponse += block.text;
          }
        }
      }

      if (!finalResponse) {
        finalResponse = 'Completed.';
      }

      // Add to conversation
      this.session.addAssistantMessage(finalResponse);

      // Cache this conversation turn
      await this.conversationCache.cacheResponse(
        preparedInput,
        conversationLength,
        finalResponse,
        toolResults,
        0 // TODO: Track actual cost
      );

      return finalResponse;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const message = err.message;
      logger.error('Error processing input', message);
      this.session.getAuditLogger().logError(message);
      throw err;
    }
  }

  /**
   * Start interactive session
   */
  async startInteractive(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Agent is already running');
    }

    this.isRunning = true;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('🦆 Samwise Agent Started');
    console.log('Type "exit" to quit, "clear" to clear conversation');
    console.log('');

    const promptUser = () => {
      this.rl!.question('You: ', async (input) => {
        if (input.toLowerCase() === 'exit') {
          console.log('Goodbye!');
          this.rl!.close();
          await this.session.end();
          this.isRunning = false;
          return;
        }

        if (input.toLowerCase() === 'clear') {
          this.session.clearHistory();
          console.log('Conversation cleared.\n');
          promptUser();
          return;
        }

        try {
          const response = await this.processInput(input);
          console.log(`\nAgent: ${response}\n`);

          // Materialize generated code to files if present
          const artifacts = extractFileArtifactsFromOutput(response);
          
          // Also check if this is a plan output and save it as markdown
          if (isPlanOutput(response)) {
            const planFilename = generateFilenameFromQuery(input);
            artifacts.push(createPlanArtifact(response, planFilename));
          }
          
          if (artifacts.length > 0 && this.codegenConfig) {
            const writeSummary = await writeFileArtifactsToDirectory(artifacts, {
              baseDir: this.codegenConfig.baseDir,
              overwrite: this.codegenConfig.overwrite,
              confirmOverwrite: this.codegenConfig.confirmOverwrite,
            });

            if (writeSummary.written.length > 0) {
              console.log(
                `✅ Created ${writeSummary.written.length} file(s) in ${this.codegenConfig.baseDir}`
              );
            }

            if (writeSummary.skipped.length > 0) {
              console.log(
                `ℹ️  Skipped ${writeSummary.skipped.length} file(s): ` +
                  writeSummary.skipped.map((s) => `${s.filePath} (${s.reason})`).join(', ')
              );
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Error: ${message}\n`);
        }

        promptUser();
      });
    };

    promptUser();
  }

  /**
   * Get session summary
   */
  getSessionSummary() {
    return this.session.getSummary();
  }

  /**
   * End session
   */
  async end(): Promise<void> {
    if (this.rl) {
      this.rl.close();
    }
    await this.session.end();
    this.monitoring.endSession();
    this.isRunning = false;
  }
}
