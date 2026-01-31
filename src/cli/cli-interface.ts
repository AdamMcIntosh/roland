/**
 * CLI Interface - Command-line interface for Ecomode MVP
 * 
 * Handles user commands, options, and output formatting
 */

import { Command } from 'commander';
import ora, { Ora } from 'ora';
import {
  parseQuery,
  getComplexity,
  ParsedQuery,
  ExecutionMode,
} from './keyword-parser.js';
import {
  formatResult,
  formatError,
  formatSuccess,
  formatInfo,
  formatProcessing,
  formatHelp,
  formatCostSummary,
  formatSkillResult,
} from './output-formatter.js';
import { agentExecutor, ExecutionRequest, ExecutionResult } from '../orchestrator/agent-executor.js';
import { costCalculator } from '../orchestrator/cost-calculator.js';
import { cacheManager } from '../orchestrator/cache-manager.js';
import { PerformanceMonitor } from '../utils/performance-monitor.js';
import { BudgetManager } from '../utils/budget-manager.js';
import { logger } from '../utils/logger.js';

export class CliInterface {
  private program: Command;
  private spinner: Ora;

  constructor() {
    this.program = new Command();
    this.spinner = ora();
    this.setupProgram();
  }

  /**
   * Setup Commander program with commands and options
   */
  private setupProgram(): void {
    this.program
      .name('goose')
      .description('🦢 oh-my-goose - Ecomode AI Assistant')
      .version('0.1.0');

    // Main run command
    this.program
      .command('run <query...>')
      .description('Run a task in Ecomode (cheapest model)')
      .option('--no-cache', 'Disable result caching')
      .option('--verbose', 'Show detailed output')
      .option('--model <name>', 'Force specific model')
      .option('--cost-only', 'Show cost info only')
      .action((query: string[], options) => this.handleRun(query, options));

    // Help command
    this.program
      .command('help')
      .description('Show detailed help')
      .action(() => this.handleHelp());

    // Skills command
    this.program
      .command('skills')
      .description('List available skills')
      .action(() => this.handleSkills());

    // Agents command
    this.program
      .command('agents')
      .description('List loaded agents')
      .action(() => this.handleAgents());

    // Stats command
    this.program
      .command('stats')
      .description('Show session statistics')
      .action(() => this.handleStats());

    // Modes command
    this.program
      .command('modes')
      .description('List available execution modes')
      .action(() => this.handleModes());

    // Performance command
    this.program
      .command('perf')
      .description('Show performance dashboard')
      .action(() => this.handlePerformance());

    // Budget command
    this.program
      .command('budget')
      .description('Manage API cost budget')
      .option('-s, --set <amount>', 'Set budget limit (e.g., 5.00)')
      .option('-r, --reset', 'Reset current spending to zero')
      .option('-e, --enable', 'Enable budget enforcement')
      .option('-d, --disable', 'Disable budget enforcement')
      .action((options) => this.handleBudget(options));

    // Default help
    this.program.on('-h,--help', () => {
      console.log(formatHelp());
    });
  }

  /**
   * Handle run command
   */
  private async handleRun(
    queryParts: string[],
    options: any
  ): Promise<void> {
    const fullQuery = queryParts.join(' ');

    if (!fullQuery.trim()) {
      console.log(formatError('No query provided'));
      this.program.help();
      return;
    }

    try {
      // Parse query for keywords and mode
      const parsed = parseQuery(fullQuery);

      // Show processing message with mode
      const modeDisplay = parsed.mode === 'default' ? 'ECOMODE' : parsed.mode.toUpperCase();
      console.log(formatProcessing(modeDisplay, parsed.query));

      // Start spinner
      this.spinner.start('Processing...');

      // Build execution request - map 'default' to 'ecomode'
      const executionMode = parsed.mode === 'default' ? 'ecomode' : parsed.mode;
      const request: ExecutionRequest = {
        query: parsed.query,
        complexity: getComplexity(parsed.query),
        agentName: parsed.agent || 'default',
        useCache: options.cache !== false,
        mode: executionMode as 'ecomode' | 'autopilot' | 'ultrapilot' | 'swarm' | 'pipeline',
      };

      // Execute
      const result = await agentExecutor.execute(request);

      // Stop spinner
      this.spinner.stop();

      // Format and display result
      if (options.costOnly) {
        const summary = costCalculator.getSessionSummary();
        console.log(
          formatCostSummary(summary.totalCost, 0, summary.entries.length)
        );
      } else {
        const formatted = formatResult(
          result.result,
          result.model,
          result.cost,
          result.cachedHit,
          result.duration
        );
        console.log(formatted.full);
      }

      if (options.verbose) {
        const stats = costCalculator.getSessionSummary();
        console.log(formatCostSummary(stats.totalCost, 0, stats.entries.length));
      }
    } catch (error) {
      this.spinner.stop();
      console.log(formatError((error as Error).message));
      logger.error(`CLI error: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Handle help command
   */
  private handleHelp(): void {
    console.log(formatHelp());
  }

  /**
   * Handle skills command
   */
  private handleSkills(): void {
    const skills = [
      {
        name: 'refactoring',
        description: 'Refactor code for improved quality',
        keywords: 'refactor, improve',
      },
      {
        name: 'documentation',
        description: 'Generate comprehensive documentation',
        keywords: 'document, doc, explain',
      },
      {
        name: 'testing',
        description: 'Generate test cases',
        keywords: 'test, unit test, test cases',
      },
    ];

    console.log(
      '\n' +
        '🛠️  Available Skills:\n' +
        '─'.repeat(60) +
        '\n'
    );

    skills.forEach((skill) => {
      console.log(`  ${skill.name}`);
      console.log(`    ${skill.description}`);
      console.log(`    Keywords: ${skill.keywords}\n`);
    });
  }

  /**
   * Handle agents command
   */
  private handleAgents(): void {
    const agents = [
      'architect',
      'researcher',
      'designer',
      'writer',
      'vision',
      'critic',
      'analyst',
      'executor',
      'planner',
      'qa-tester',
    ];

    console.log(
      '\n' +
        '🤖 Loaded Agents:\n' +
        '─'.repeat(60) +
        '\n'
    );

    agents.forEach((agent, idx) => {
      console.log(`  ${idx + 1}. ${agent}`);
    });

    console.log();
  }

  /**
   * Handle stats command
   */
  private handleStats(): void {
    const costStats = costCalculator.getSessionSummary();
    const cacheStats = cacheManager.getStats();

    console.log(
      '\n' +
        '📊 Session Statistics:\n' +
        '─'.repeat(60) +
        '\n'
    );

    console.log(`  Total Cost: $${costStats.totalCost.toFixed(4)}`);
    console.log(`  API Calls: ${costStats.entries.length}`);
    console.log(
      `  Cache Hit Rate: ${cacheStats.hitRate.toFixed(1)}% (${cacheStats.hits}/${cacheStats.hits + cacheStats.misses})`
    );
    console.log();
  }

  /**
   * Handle modes command
   */
  private handleModes(): void {
    const modes = [
      {
        name: 'ecomode',
        keyword: 'eco:',
        description: 'Single agent (cheapest) - for simple tasks',
      },
      {
        name: 'autopilot',
        keyword: 'autopilot:',
        description: '3-agent sequential - executor + architect + qa-tester',
      },
      {
        name: 'ultrapilot',
        keyword: 'ulw:',
        description: '5 parallel agents - architect, researcher, designer, writer, executor',
      },
      {
        name: 'swarm',
        keyword: 'swarm:',
        description: '8 dynamic agents with shared memory - full agent team coordination',
      },
      {
        name: 'pipeline',
        keyword: 'pipeline:',
        description: '4-step sequential pipeline - planning → execution → review → documentation',
      },
    ];

    console.log(
      '\n' +
        '🚀 Available Execution Modes:\n' +
        '─'.repeat(80) +
        '\n'
    );

    modes.forEach((mode) => {
      console.log(`  ${mode.name.padEnd(12)} (${mode.keyword.padEnd(12)})`);
      console.log(`    ${mode.description}\n`);
    });

    console.log('Example usage:');
    console.log('  > run "eco: refactor this code"');
    console.log('  > run "autopilot: build a todo app"');
    console.log('  > run "ulw: analyze this architecture"\n');
  }

  /**
   * Handle performance command
   */
  private handlePerformance(): void {
    const report = PerformanceMonitor.generateReport();
    console.log(report);
  }

  /**
   * Handle budget command
   */
  private handleBudget(options: any): void {
    // No options - show status
    if (!options.set && !options.reset && !options.enable && !options.disable) {
      console.log('\n💰 API Cost Budget');
      console.log('─'.repeat(50));
      console.log(BudgetManager.formatStatus());
      console.log('\nCommands:');
      console.log('  --set <amount>   Set budget limit');
      console.log('  --reset          Reset spending to $0');
      console.log('  --enable         Enable enforcement');
      console.log('  --disable        Disable enforcement\n');
      return;
    }

    // Set budget
    if (options.set) {
      const amount = parseFloat(options.set);
      if (isNaN(amount) || amount <= 0) {
        console.log(formatError('Invalid budget amount'));
        return;
      }
      BudgetManager.setMaxBudget(amount);
      console.log(formatSuccess(`Budget set to $${amount.toFixed(2)}`));
    }

    // Reset spending
    if (options.reset) {
      BudgetManager.reset();
      console.log(formatSuccess('Budget spending reset to $0.00'));
    }

    // Enable enforcement
    if (options.enable) {
      BudgetManager.enable();
      console.log(formatSuccess('Budget enforcement enabled'));
    }

    // Disable enforcement
    if (options.disable) {
      BudgetManager.disable();
      console.log(formatSuccess('Budget enforcement disabled'));
    }

    // Show updated status
    console.log('\n' + BudgetManager.formatStatus() + '\n');
  }

  /**
   * Parse and execute CLI arguments
   */
  async parseAndExecute(args: string[]): Promise<void> {
    await this.program.parseAsync(args);
  }
}

/**
 * Create and run CLI
 */
export async function runCli(): Promise<void> {
  const cli = new CliInterface();
  await cli.parseAndExecute(process.argv);
}
