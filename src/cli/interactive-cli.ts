/**
 * Interactive CLI - GitHub Copilot-style REPL interface
 * 
 * Provides an interactive command-line experience similar to GitHub Copilot CLI
 */

import * as readline from 'readline';
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

      // Execute using actual agent executor
      const normalizedMode = parsed.mode === 'planning' ? 'ecomode' : 
                            parsed.mode === 'default' ? 'ecomode' :
                            parsed.mode;
      
      // For ecomode, always use 'simple' complexity to get cheapest model
      const complexity = normalizedMode === 'ecomode' 
        ? 'simple' 
        : this.inferComplexity(parsed.query);
      
      const executionResult = await agentExecutor.execute({
        query: parsed.query,
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
        const writeSummary = await writeFileArtifactsToDirectory(artifacts, {
          baseDir: process.cwd(),
          overwrite: true, // Auto-approve in interactive mode
          confirmOverwrite: undefined,
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
   * Start the interactive CLI
   */
  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.showWelcome();
    this.showPrompt();
  }
}

/**
 * Main entry point for interactive CLI
 */
export async function runInteractiveCLI(): Promise<void> {
  const cli = new InteractiveCLI();
  cli.start();
}
