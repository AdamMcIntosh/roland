/**
 * Interactive CLI - GitHub Copilot-style REPL interface
 * 
 * Provides an interactive command-line experience similar to GitHub Copilot CLI
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { parseQuery, ExecutionMode } from './keyword-parser.js';
import { agentExecutor } from '../orchestrator/agent-executor.js';
import { BudgetManager } from '../utils/budget-manager.js';
import { cacheManager } from '../orchestrator/cache-manager.js';
import { skillRegistry } from '../skills/skill-framework.js';
import { getAgentManager } from '../agents/agent-manager.js';
import { logger } from '../utils/logger.js';
import {
  extractFileArtifactsFromOutput,
  writeFileArtifactsToDirectory,
  isPlanOutput,
  isDesignDocument,
  generateFilenameFromQuery,
  createPlanArtifact,
} from '../utils/codegen.js';

interface SessionInfo {
  user: string;
  connected: boolean;
  currentBranch?: string;
  workingDir: string;
}

export class InteractiveCLI {
  private rl: readline.Interface;
  private session: SessionInfo;
  private commandHistory: string[] = [];
  private isRunning = false;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '',
      terminal: true,
    });

    this.session = {
      user: process.env.USER || process.env.USERNAME || 'user',
      connected: false,
      currentBranch: 'main',
      workingDir: process.cwd(),
    };

    this.setupHandlers();
  }

  /**
   * Setup readline event handlers
   */
  private setupHandlers(): void {
    this.rl.on('line', async (line: string) => {
      const input = line.trim();

      if (!input) {
        this.showPrompt();
        return;
      }

      this.commandHistory.push(input);

      // Handle special commands
      if (input === 'exit' || input === 'quit') {
        this.exit();
        return;
      }

      if (input === 'clear' || input === 'cls') {
        this.clearScreen();
        this.showPrompt();
        return;
      }

      if (input === 'help' || input === '?') {
        this.showHelp();
        this.showPrompt();
        return;
      }

      if (input === 'status') {
        this.showStatus();
        this.showPrompt();
        return;
      }

      if (input === 'budget' || input.startsWith('budget ')) {
        this.handleBudget(input);
        this.showPrompt();
        return;
      }

      if (input === 'apikeys' || input === 'keys' || input.startsWith('apikeys ')) {
        await this.handleApiKeys(input);
        this.showPrompt();
        return;
      }

      if (input.startsWith('/')) {
        await this.handleSlashCommand(input);
        this.showPrompt();
        return;
      }

      // Execute as samwise query
      await this.executeQuery(input);
      this.showPrompt();
    });

    this.rl.on('close', () => {
      this.exit();
    });

    // Handle Ctrl+C
    this.rl.on('SIGINT', () => {
      console.log(chalk.yellow('\n\nUse "exit" or Ctrl+D to quit'));
      this.showPrompt();
    });
  }

  /**
   * Show welcome banner
   */
  private showWelcome(): void {
    console.clear();
    
    // ASCII Art Banner
   console.log(`
          ____    _    __  ____        _____ ____  _____ 
        / ___|  / \  |  \/  \ \      / /_ _/ ___|| ____|
        \___ \ / _ \ | |\/| |\ \ /\ / / | |\___ \|  _|  
        ___) / ___ \| |  | | \ V  V /  | | ___) | |___ 
        |____/_/   \_\_|  |_|  \_/\_/  |___|____/|_____|

        S A M W I S E    CLI
         Version 1.o.o
`);

    console.log(chalk.gray('    Samwise can write, test and debug code right from your terminal.'));
    console.log(chalk.gray('    Describe a task to get started or enter ? for help.\n'));

    // Connection status
    this.session.connected = true; // Initialize connection
    console.log(chalk.blue('    ● ') + chalk.white('Connected to samwise'));
    console.log(chalk.blue('    ● ') + chalk.white(`Logged in as user: ${chalk.cyan(this.session.user)}`));
    
    // Budget status
    const budgetStatus = BudgetManager.getStatus();
    if (budgetStatus.enabled && budgetStatus.maxBudget > 0) {
      const remaining = budgetStatus.maxBudget - budgetStatus.currentSpending;
      const color = remaining > budgetStatus.maxBudget * 0.5 ? chalk.green : 
                    remaining > budgetStatus.maxBudget * 0.2 ? chalk.yellow : chalk.red;
      console.log(chalk.blue('    ● ') + chalk.white(`Budget: ${color(`$${remaining.toFixed(2)}`)} / $${budgetStatus.maxBudget.toFixed(2)}`));
    } else {
      console.log(chalk.blue('    ● ') + chalk.gray(`Budget: Not set (use "budget set $10")`));
    }

    console.log();
    
    // Working directory
    const shortDir = this.getShortPath(this.session.workingDir);
    const branch = this.session.currentBranch ? chalk.gray(` [${this.session.currentBranch}]`) : '';
    console.log(chalk.gray(`    ~/${shortDir}${branch}\n`));

    // Helpful hints
    console.log(chalk.dim('    ' + '─'.repeat(65)));
    console.log(chalk.cyan('    Quick Tips:'));
    console.log(chalk.white('      • ') + 'Use @ to mention files: ' + chalk.gray('@file.ts'));
    console.log(chalk.white('      • ') + 'Use / for commands: ' + chalk.gray('/help, /status, /budget'));
    console.log(chalk.white('      • ') + 'Prefix with mode: ' + chalk.gray('eco: your task'));
    console.log(chalk.dim('    ' + '─'.repeat(65)));
    console.log();
  }

  /**
   * Show command prompt
   */
  private showPrompt(): void {
    const promptSymbol = chalk.cyan('>');
    const cursor = chalk.dim('█');
    this.rl.setPrompt(`    ${promptSymbol} ${cursor}`);
    this.rl.prompt();
  }

  /**
   * Execute samwise query
   */
  private async executeQuery(query: string): Promise<void> {
    try {
      console.log(chalk.dim('\n    Processing...'));

      const parsed = parseQuery(query);
      
      // Show what mode was detected
      const modeColor = this.getModeColor(parsed.mode);
      console.log(chalk.white('    Mode: ') + modeColor(parsed.mode));
      
      if (parsed.skill) {
        console.log(chalk.white('    Skill: ') + chalk.cyan(parsed.skill));
      }

      console.log();

      // Check budget before execution
      try {
        const estimatedCost = 0.01; // Conservative estimate
        BudgetManager.checkBudget(estimatedCost);
      } catch (budgetError) {
        console.log(chalk.red('    ✗ ') + chalk.white('Budget Exceeded'));
        console.log(chalk.gray('    ' + '━'.repeat(65)));
        console.log(chalk.red(`    ${budgetError instanceof Error ? budgetError.message : String(budgetError)}`));
        console.log(chalk.gray('    ' + '━'.repeat(65)));
        console.log(chalk.yellow('\n    Use "budget" to check your remaining funds'));
        console.log();
        return;
      }

      // Append code generation directive to enforce file-based outputs
      const enhancedQuery = this.appendCodeGenerationDirective(parsed.query);

      // Execute using actual agent executor
      const normalizedMode = parsed.mode === 'planning' ? 'ecomode' : 
                            parsed.mode === 'default' ? 'ecomode' :
                            parsed.mode;
      
      // For ecomode, always use 'simple' complexity to get cheapest model
      const complexity = normalizedMode === 'ecomode' 
        ? 'simple' 
        : this.inferComplexity(parsed.query);
      
      const executionResult = await agentExecutor.execute({
        query: enhancedQuery,
        mode: normalizedMode as 'ecomode' | 'autopilot' | 'ultrapilot' | 'swarm' | 'pipeline',
        complexity: complexity,
        useCache: true,
      });

      // Record spending
      BudgetManager.recordSpending(executionResult.cost);

      // Display result
      console.log(chalk.green('    ✓ ') + chalk.white('Result'));
      console.log(chalk.gray('    ' + '━'.repeat(65)));
      
      // Format and display result
      const lines = executionResult.result.split('\n');
      lines.forEach(line => {
        console.log('    ' + line);
      });

      console.log(chalk.gray('    ' + '━'.repeat(65)));
      
      // Format cost
      const costStr = executionResult.cost < 0.01 
        ? `$${(executionResult.cost * 1000).toFixed(2)}m` 
        : `$${executionResult.cost.toFixed(4)}`;
      
      const cacheStr = executionResult.cachedHit ? chalk.cyan('Yes') : chalk.gray('No');
      const durationStr = `${(executionResult.duration / 1000).toFixed(1)}s`;
      const modelStr = executionResult.cachedHit ? 'cached' : executionResult.model;
      
      console.log(
        chalk.dim(`    Cost: ${costStr} | `) +
        chalk.dim(`Model: ${modelStr} | `) +
        chalk.dim(`Cached: ${cacheStr} | `) +
        chalk.dim(`Duration: ${durationStr}`)
      );
      console.log();

      // Materialize generated code to files if present
      const artifacts = extractFileArtifactsFromOutput(executionResult.result);
      
      // Also check if this is a plan/design output and save it as markdown
      const isPlan = isPlanOutput(executionResult.result);
      
      if (isPlan) {
        const isDesign = isDesignDocument(executionResult.result);
        const planFilename = generateFilenameFromQuery(query, isDesign);
        artifacts.push(createPlanArtifact(executionResult.result, planFilename));
      }
      
      if (artifacts.length > 0) {
        const confirmOverwrite = (filePath: string): Promise<boolean> => {
          return new Promise((resolve) => {
            this.rl.question(
              chalk.yellow(`    ? File exists: ${filePath}. Overwrite? (y/n) `),
              (answer) => {
                resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
              }
            );
          });
        };

        const writeSummary = await writeFileArtifactsToDirectory(artifacts, {
          baseDir: process.cwd(),
          overwrite: true,
          confirmOverwrite,
        });

        if (writeSummary.written.length > 0) {
          console.log(chalk.green(`    ✓ Created ${writeSummary.written.length} file(s) in ${process.cwd()}`));
          console.log();
        }

        if (writeSummary.skipped.length > 0) {
          console.log(chalk.yellow(`    ⚠ Skipped ${writeSummary.skipped.length} file(s)`));
          writeSummary.skipped.forEach(s => {
            console.log(chalk.dim(`      ${s.filePath}: ${s.reason}`));
          });
          console.log();
        }
      }

    } catch (error) {
      console.log(chalk.red('    ✗ ') + chalk.white('Error'));
      console.log(chalk.gray('    ' + '━'.repeat(65)));
      console.log(chalk.red(`    ${error instanceof Error ? error.message : String(error)}`));
      console.log(chalk.gray('    ' + '━'.repeat(65)));
      console.log();
    }
  }

  /**
   * Append code generation directive to force file-based outputs
   */
  private appendCodeGenerationDirective(query: string): string {
    const directive = '\n\nIMPORTANT: When generating code, plans, or design documents, format each file using markdown code blocks with the file path. Use this exact format:\n\n```language file=path/to/file.ext\n<file contents>\n```\n\nFor plans or designs without specific code files, output the full content as structured markdown with clear headings and sections.';
    return query + directive;
  }

  /**
   * Infer complexity from query length and content
   */
  private inferComplexity(query: string): 'simple' | 'medium' | 'complex' {
    const len = query.length;
    
    // Check for complex keywords
    const complexKeywords = ['architect', 'design', 'analyze', 'comprehensive', 'detailed'];
    const hasComplexKeyword = complexKeywords.some(kw => query.toLowerCase().includes(kw));
    
    if (hasComplexKeyword || len > 500) {
      return 'complex';
    } else if (len > 200) {
      return 'medium';
    } else {
      return 'simple';
    }
  }

  /**
   * Handle slash commands
   */
  private async handleSlashCommand(command: string): Promise<void> {
    const cmd = command.toLowerCase();

    if (cmd === '/help' || cmd === '/?') {
      this.showHelp();
    } else if (cmd === '/status') {
      this.showStatus();
    } else if (cmd === '/budget') {
      this.showBudget();
    } else if (cmd === '/clear' || cmd === '/cls') {
      this.clearScreen();
    } else if (cmd === '/skills') {
      this.showSkills();
    } else if (cmd === '/agents') {
      this.showAgents();
    } else if (cmd === '/cache') {
      this.showCache();
    } else {
      console.log(chalk.red(`\n    Unknown command: ${command}`));
      console.log(chalk.gray('    Type /help to see available commands\n'));
    }
  }

  /**
   * Show help
   */
  private showHelp(): void {
    console.log(chalk.cyan.bold('\n    Help'));
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    console.log();
    console.log(chalk.white('    Execution Modes:'));
    console.log(chalk.cyan('      eco:          ') + 'Single agent (cheapest)');
    console.log(chalk.cyan('      ask:          ') + 'Conversational Q&A');
    console.log(chalk.yellow('      autopilot:    ') + '3-agent sequential');
    console.log(chalk.magenta('      ultrapilot:   ') + '5 parallel agents');
    console.log(chalk.blue('      swarm:        ') + '8 dynamic agents');
    console.log(chalk.green('      pipeline:     ') + '4-step workflow');
    console.log();
    console.log(chalk.white('    Slash Commands:'));
    console.log(chalk.gray('      /help         ') + 'Show this help');
    console.log(chalk.gray('      /status       ') + 'Show connection status');
    console.log(chalk.gray('      /budget       ') + 'Show budget information');
    console.log(chalk.gray('      /skills       ') + 'List available skills');
    console.log(chalk.gray('      /agents       ') + 'List available agents');
    console.log(chalk.gray('      /cache        ') + 'Show cache statistics');
    console.log(chalk.gray('      /clear        ') + 'Clear screen');
    console.log();
    console.log(chalk.white('    Budget Commands:'));
    console.log(chalk.gray('      budget set $10') + ' Set budget limit');
    console.log(chalk.gray('      budget reset  ') + ' Reset spending to $0');
    console.log(chalk.gray('      budget        ') + ' Show budget status');
    console.log();
    console.log(chalk.white('    API Keys:'));
    console.log(chalk.gray('      apikeys       ') + ' Show API key status');
    console.log(chalk.gray('      apikeys set   ') + ' Set/update API keys');
    console.log(chalk.gray('      apikeys clear ') + ' Clear all API keys');
    console.log();
    console.log(chalk.white('    Special:'));
    console.log(chalk.gray('      @file.ts      ') + 'Mention a file in context');
    console.log(chalk.gray('      exit/quit     ') + 'Exit the CLI');
    console.log(chalk.gray('      Ctrl+C        ') + 'Interrupt current operation');
    console.log(chalk.gray('      Ctrl+D        ') + 'Exit the CLI');
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    console.log();
  }

  /**
   * Show status
   */
  private showStatus(): void {
    console.log(chalk.cyan.bold('\n    Status'));
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    console.log(chalk.white('      Connection:   ') + (this.session.connected ? chalk.green('Connected') : chalk.red('Disconnected')));
    console.log(chalk.white('      User:         ') + chalk.cyan(this.session.user));
    console.log(chalk.white('      Directory:    ') + chalk.gray(this.getShortPath(this.session.workingDir)));
    if (this.session.currentBranch) {
      console.log(chalk.white('      Branch:       ') + chalk.gray(this.session.currentBranch));
    }
    console.log(chalk.white('      Commands:     ') + chalk.gray(this.commandHistory.length.toString()));
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    console.log();
  }

  /**
   * Handle budget commands
   */
  private handleBudget(input: string): void {
    const parts = input.split(' ');
    
    if (parts.length === 1) {
      // Just "budget" - show status
      this.showBudget();
      return;
    }

    const command = parts[1];
    
    if (command === 'set' && parts.length === 3) {
      // budget set $10
      const amount = parseFloat(parts[2].replace('$', ''));
      if (isNaN(amount) || amount <= 0) {
        console.log(chalk.red('\n    Invalid amount. Use: budget set $10\n'));
        return;
      }
      BudgetManager.setMaxBudget(amount);
      console.log(chalk.green(`\n    ✓ Budget set to $${amount.toFixed(2)}\n`));
    } else if (command === 'reset') {
      // budget reset
      BudgetManager.reset();
      console.log(chalk.green('\n    ✓ Budget spending reset to $0.00\n'));
    } else if (command === 'disable') {
      // budget disable
      BudgetManager.disable();
      console.log(chalk.yellow('\n    Budget tracking disabled\n'));
    } else {
      console.log(chalk.red('\n    Unknown budget command\n'));
      console.log(chalk.gray('    Available commands:'));
      console.log(chalk.white('      budget          ') + chalk.gray('Show budget status'));
      console.log(chalk.white('      budget set $10  ') + chalk.gray('Set budget limit'));
      console.log(chalk.white('      budget reset    ') + chalk.gray('Reset spending to $0'));
      console.log(chalk.white('      budget disable  ') + chalk.gray('Disable budget tracking'));
      console.log();
    }
  }

  /**
   * Show budget
   */
  private showBudget(): void {
    const status = BudgetManager.getStatus();
    
    console.log(chalk.cyan.bold('\n    Budget Status'));
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    
    if (!status.enabled || status.maxBudget === 0) {
      console.log(chalk.yellow('      Budget tracking is not enabled'));
      console.log(chalk.gray('      Set a budget with: ') + chalk.white('budget set $10'));
    } else {
      const remaining = status.maxBudget - status.currentSpending;
      const percentUsed = (status.currentSpending / status.maxBudget) * 100;
      
      console.log(chalk.white('      Maximum:      ') + chalk.cyan(`$${status.maxBudget.toFixed(2)}`));
      console.log(chalk.white('      Spent:        ') + chalk.yellow(`$${status.currentSpending.toFixed(4)}`));
      console.log(chalk.white('      Remaining:    ') + this.getColoredRemaining(remaining, status.maxBudget));
      console.log(chalk.white('      Usage:        ') + this.getUsageBar(percentUsed));
    }
    
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    console.log();
  }

  /**
   * Show skills
   */
  private showSkills(): void {
    console.log(chalk.cyan.bold('\n    Available Skills'));
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    
    const skills = ['Refactoring', 'Documentation', 'Testing', 'Debugging', 'Code Review'];
    skills.forEach(skill => {
      console.log(chalk.white('      • ') + skill);
    });
    
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    console.log();
  }

  /**
   * Show agents
   */
  private showAgents(): void {
    console.log(chalk.cyan.bold('\n    Available Agents'));
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    
    const agents = ['planner', 'executor', 'reviewer', 'architect', 'analyst'];
    agents.forEach(agent => {
      console.log(chalk.white('      • ') + chalk.cyan(agent));
    });
    
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    console.log();
  }

  /**
   * Show cache stats
   */
  private showCache(): void {
    console.log(chalk.cyan.bold('\n    Cache Statistics'));
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    console.log(chalk.white('      Entries:      ') + chalk.cyan('0'));
    console.log(chalk.white('      Hit Rate:     ') + chalk.green('0%'));
    console.log(chalk.white('      Size:         ') + chalk.gray('0 KB'));
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    console.log();
  }

  /**
   * Clear screen
   */
  private clearScreen(): void {
    console.clear();
    this.showWelcome();
  }

  /**
   * Exit CLI
   */
  private exit(): void {
    console.log(chalk.cyan('\n    Goodbye! 👋\n'));
    this.rl.close();
    process.exit(0);
  }

  /**
   * Get short path for display
   */
  private getShortPath(fullPath: string): string {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (fullPath.startsWith(home)) {
      return fullPath.substring(home.length + 1);
    }
    return fullPath;
  }

  /**
   * Get mode color
   */
  private getModeColor(mode: ExecutionMode): typeof chalk {
    switch (mode) {
      case 'ecomode':
        return chalk.cyan;
      case 'autopilot':
        return chalk.yellow;
      case 'ultrapilot':
        return chalk.magenta;
      case 'swarm':
        return chalk.blue;
      case 'pipeline':
        return chalk.green;
      default:
        return chalk.white;
    }
  }

  /**
   * Get colored remaining budget
   */
  private getColoredRemaining(remaining: number, max: number): string {
    const percent = (remaining / max) * 100;
    const color = percent > 50 ? chalk.green : percent > 20 ? chalk.yellow : chalk.red;
    return color(`$${remaining.toFixed(2)}`);
  }

  /**
   * Get usage bar
   */
  private getUsageBar(percent: number): string {
    const barLength = 20;
    const filled = Math.round((percent / 100) * barLength);
    const empty = barLength - filled;
    
    const color = percent < 50 ? chalk.green : percent < 80 ? chalk.yellow : chalk.red;
    const bar = color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    
    return `${bar} ${percent.toFixed(1)}%`;
  }

  /**
   * Handle API key commands
   */
  private async handleApiKeys(input: string): Promise<void> {
    const availableKeys = [
      { env: 'SAMWISE_API_KEYS_XAI', name: 'xAI (Grok)', url: 'https://console.x.ai' },
      { env: 'SAMWISE_API_KEYS_ANTHROPIC', name: 'Anthropic (Claude)', url: 'https://console.anthropic.com' },
      { env: 'SAMWISE_API_KEYS_OPENAI', name: 'OpenAI (GPT)', url: 'https://platform.openai.com/api-keys' },
      { env: 'SAMWISE_API_KEYS_GOOGLE', name: 'Google (Gemini)', url: 'https://ai.google.dev' },
    ];

    const parts = input.split(' ');
    
    if (parts.length === 1) {
      // Just "apikeys" - show status
      this.showApiKeys(availableKeys);
      return;
    }

    const command = parts[1];
    
    if (command === 'set') {
      // Set API keys interactively
      await this.setApiKeys(availableKeys);
    } else if (command === 'clear') {
      // Clear all API keys
      this.clearApiKeys(availableKeys);
    } else {
      console.log(chalk.red('\n    Unknown apikeys command\n'));
      console.log(chalk.gray('    Available commands:'));
      console.log(chalk.white('      apikeys         ') + chalk.gray('Show API key status'));
      console.log(chalk.white('      apikeys set     ') + chalk.gray('Set/update API keys'));
      console.log(chalk.white('      apikeys clear   ') + chalk.gray('Clear all API keys'));
      console.log();
    }
  }

  /**
   * Show API keys status
   */
  private showApiKeys(availableKeys: Array<{ env: string; name: string; url: string }>): void {
    console.log(chalk.cyan.bold('\n    API Keys Status'));
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    
    availableKeys.forEach(key => {
      const isSet = !!process.env[key.env];
      const status = isSet ? chalk.green('✓ Configured') : chalk.gray('○ Not set');
      const masked = isSet ? this.maskApiKey(process.env[key.env]!) : chalk.gray('—');
      console.log(chalk.white(`      ${key.name.padEnd(22)}`), status, chalk.gray(masked));
    });
    
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    console.log(chalk.gray('    Use ') + chalk.white('apikeys set') + chalk.gray(' to configure keys'));
    console.log();
  }

  /**
   * Set API keys interactively
   */
  private async setApiKeys(availableKeys: Array<{ env: string; name: string; url: string }>): Promise<void> {
    console.log(chalk.cyan.bold('\n    Configure API Keys'));
    console.log(chalk.gray('    ' + '─'.repeat(65)));
    console.log(chalk.gray('    Enter new values or press Enter to skip\n'));

    const question = (prompt: string): Promise<string> => {
      return new Promise(resolve => {
        this.rl.question(prompt, resolve);
      });
    };

    const updates: Record<string, string> = {};

    for (const key of availableKeys) {
      const current = process.env[key.env];
      const currentDisplay = current ? chalk.gray(this.maskApiKey(current)) : chalk.gray('(not set)');
      
      console.log(chalk.white(`\n    ${key.name}`) + ' ' + currentDisplay);
      console.log(chalk.gray(`    Get yours at: ${key.url}`));
      const newValue = await question(chalk.gray('    New value (or Enter to skip): '));
      
      if (newValue.trim()) {
        updates[key.env] = newValue.trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      console.log(chalk.yellow('\n    No changes made\n'));
      return;
    }

    // Update environment variables
    for (const [key, value] of Object.entries(updates)) {
      process.env[key] = value;
    }

    // Save to home directory .env file
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const envPath = path.join(homeDir, '.env');

    try {
      let envContent = '';
      const envVars: Record<string, string> = {};

      // Read existing .env if it exists
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
        const lines = envContent.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          
          const [key, ...valueParts] = trimmed.split('=');
          if (key) {
            envVars[key] = valueParts.join('=');
          }
        }
      }

      // Update with new values
      for (const [key, value] of Object.entries(updates)) {
        envVars[key] = value;
      }

      // Write back
      const newContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n';

      fs.writeFileSync(envPath, newContent, 'utf-8');
      console.log(chalk.green(`\n    ✓ API keys saved to ${envPath}`));
      console.log(chalk.gray(`    Updated ${Object.keys(updates).length} key(s)\n`));
    } catch (error) {
      console.log(chalk.red(`\n    ⚠️  Could not save to ${envPath}: ${error}`));
      console.log(chalk.gray('    Keys are set for this session only\n'));
    }
  }

  /**
   * Clear API keys
   */
  private clearApiKeys(availableKeys: Array<{ env: string; name: string; url: string }>): void {
    availableKeys.forEach(key => {
      delete process.env[key.env];
    });
    
    console.log(chalk.yellow('\n    ⚠️  All API keys cleared from current session'));
    console.log(chalk.gray('    Note: Keys in .env file are not deleted\n'));
  }

  /**
   * Mask API key for display
   */
  private maskApiKey(key: string): string {
    if (key.length <= 8) {
      return '***';
    }
    return key.substring(0, 4) + '...' + key.substring(key.length - 4);
  }

  /**
   * Ensure a budget is set before starting
   */
  private async ensureBudgetSet(): Promise<void> {
    const budgetStatus = BudgetManager.getStatus();

    // If budget is already set, we're good
    if (budgetStatus.enabled && budgetStatus.maxBudget > 0) {
      return;
    }

    console.log(chalk.yellow('\n⚠️  No budget limit configured\n'));
    console.log(chalk.white('Setting a budget helps prevent unexpected costs.'));
    console.log(chalk.gray('You can always change it later with the "budget" command.\n'));

    const question = (prompt: string): Promise<string> => {
      return new Promise(resolve => {
        this.rl.question(prompt, resolve);
      });
    };

    let budgetAmount: number | null = null;

    while (budgetAmount === null || budgetAmount <= 0) {
      const input = await question(chalk.cyan('Set a budget limit (e.g., $10): '));
      const parsed = parseFloat(input.replace(/[$,]/g, ''));

      if (!isNaN(parsed) && parsed > 0) {
        budgetAmount = parsed;
      } else {
        console.log(chalk.red('Invalid amount. Please enter a positive number.\n'));
      }
    }

    BudgetManager.setMaxBudget(budgetAmount);
    console.log(chalk.green(`✓ Budget set to $${budgetAmount.toFixed(2)}\n`));
  }

  /**
   * Start the interactive CLI
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.showWelcome();
    await this.ensureBudgetSet();
    this.showPrompt();
  }
}

/**
 * Main entry point for interactive CLI
 */
export async function runInteractiveCLI(): Promise<void> {
  const cli = new InteractiveCLI();
  await cli.start();
}
