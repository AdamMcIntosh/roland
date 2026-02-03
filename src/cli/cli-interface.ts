/**
 * CLI Interface - Command-line interface for Ecomode MVP
 * 
 * Handles user commands, options, and output formatting
 */

import { Command } from 'commander';
import ora, { Ora } from 'ora';
import { performance } from 'perf_hooks';
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
  formatWelcome,
  formatConnectionStatus,
} from './output-formatter.js';
import { agentExecutor, ExecutionRequest, ExecutionResult } from '../orchestrator/agent-executor.js';
import { costCalculator } from '../orchestrator/cost-calculator.js';
import { cacheManager } from '../orchestrator/cache-manager.js';
import { PerformanceMonitor } from '../utils/performance-monitor.js';
import { BudgetManager } from '../utils/budget-manager.js';
import { logger } from '../utils/logger.js';
import { WorkflowEngine } from '../workflows/engine.js';
import { AutonomousAgent } from '../agent-loop/agent.js';
import { SessionConfig } from '../agent-loop/types.js';
import { AgentManager } from '../agents/agent-manager.js';
import { HudStatusLine } from './hud.js';
import { SkillLearner, SessionAnalysis } from '../skills/skill-learner.js';

export class CliInterface {
  private program: Command;
  private spinner: Ora;
  private workflowEngine: WorkflowEngine;
  private agentManager: AgentManager;
  private skillLearner: SkillLearner;

  constructor() {
    this.program = new Command();
    this.spinner = ora();
    this.workflowEngine = new WorkflowEngine(true); // Enable cache
    this.agentManager = new AgentManager('./agents');
    this.skillLearner = new SkillLearner('./learned-skills');
    this.setupProgram();
    this.initializeSkillLearner();
  }

  /**
   * Initialize skill learner
   */
  private async initializeSkillLearner(): Promise<void> {
    try {
      await this.skillLearner.initialize();
    } catch (error) {
      logger.error('Failed to initialize skill learner', error);
    }
  }

  /**
   * Setup Commander program with commands and options
   */
  private setupProgram(): void {
    this.program
      .name('samwise')
      .description(' samwise - Ecomode AI Assistant')
      .version('0.1.0');

    // Main run command
    this.program
      .command('run <query...>')
      .description('Run a task in Ecomode (cheapest model)')
      .option('--no-cache', 'Disable result caching')
      .option('--verbose', 'Show detailed output')
      .option('--model <name>', 'Force specific model')
      .option('--cost-only', 'Show cost info only')
      .option('--hud', 'Enable HUD status line (default: auto-detect TTY)')
      .option('--no-hud', 'Disable HUD status line')
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

    // Learned skills command
    this.program
      .command('learned')
      .description('Show learned skills from session history')
      .option('-s, --stats', 'Show learning statistics')
      .option('-f, --find <query>', 'Find skills matching query')
      .option('-e, --export <id>', 'Export learned skill to framework')
      .action((options) => this.handleLearnedSkills(options));

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

    // Agent command - Autonomous agent with natural language
    this.program
      .command('agent <query...>')
      .description('Run autonomous agent with natural language query')
      .option('--model <name>', 'Specify LLM model (default: claude-opus)')
      .option('--interactive', 'Start interactive multi-turn session')
      .option('--auto-confirm', 'Auto-approve file/terminal/skill operations')
      .option('--max-tools <number>', 'Max tool calls (default: 20)', '20')
      .option('--max-commands <number>', 'Max terminal commands (default: 10)', '10')
      .option('--hud', 'Enable HUD status line')
      .option('--no-hud', 'Disable HUD status line')
      .action((query: string[], options) => this.handleAgent(query, options));

    // Budget command
    this.program
      .command('budget')
      .description('Manage API cost budget')
      .option('-s, --set <amount>', 'Set budget limit (e.g., 5.00)')
      .option('-r, --reset', 'Reset current spending to zero')
      .option('-e, --enable', 'Enable budget enforcement')
      .option('-d, --disable', 'Disable budget enforcement')
      .action((options) => this.handleBudget(options));

    // Workflows command
    this.program
      .command('workflow <name>')
      .description('Execute a workflow by name')
      .option('-v, --version <version>', 'Workflow version', '1.0.0')
      .option('-i, --input <json>', 'Input parameters as JSON string')
      .option('--no-cache', 'Disable caching for this execution')
      .action((name, options) => this.handleWorkflow(name, options));

    // Recipes command
    this.program
      .command('recipes')
      .description('List available pre-built recipes')
      .action(() => this.handleRecipes());

    // Execute recipe command
    this.program
      .command('recipe <name>')
      .description('Execute a pre-built recipe')
      .option('-i, --input <json>', 'Input parameters as JSON string')
      .action((name, options) => this.handleExecuteRecipe(name, options));

    // Cache command
    this.program
      .command('cache')
      .description('Manage workflow cache')
      .option('-s, --stats', 'Show cache statistics')
      .option('-c, --clear', 'Clear all cache')
      .option('-i, --invalidate <workflow>', 'Invalidate specific workflow cache')
      .action((options) => this.handleCache(options));

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

      // Route planning mode separately
      if (parsed.mode === 'planning') {
        await this.handlePlanningMode(parsed.query, options);
        return;
      }

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
    console.log(formatWelcome());
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
   * Handle learned skills command
   */
  private async handleLearnedSkills(options: any): Promise<void> {
    // Show statistics
    if (options.stats) {
      const stats = this.skillLearner.getStatistics();
      
      console.log('\n📊 Skill Learning Statistics');
      console.log('─'.repeat(60));
      console.log(`Total Learned Skills: ${stats.totalSkills}`);
      console.log(`Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
      console.log(`Total Usage: ${stats.totalUsage} times\n`);
      
      console.log('By Category:');
      Object.entries(stats.byCategory).forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });
      
      console.log('\nBy Difficulty:');
      Object.entries(stats.byDifficulty).forEach(([diff, count]) => {
        console.log(`  ${diff}: ${count}`);
      });
      console.log('');
      return;
    }

    // Find matching skills
    if (options.find) {
      const matches = this.skillLearner.findMatchingSkills(options.find);
      
      console.log(`\n🔍 Skills matching "${options.find}":`);
      console.log('─'.repeat(60));
      
      if (matches.length === 0) {
        console.log('No matching skills found.\n');
        return;
      }

      matches.forEach(skill => {
        console.log(`\n  ${skill.name}`);
        console.log(`    ${skill.description}`);
        console.log(`    Confidence: ${(skill.confidence * 100).toFixed(0)}%`);
        console.log(`    Used: ${skill.usageCount} times`);
        console.log(`    Category: ${skill.metadata.category}`);
        console.log(`    Triggers: ${skill.pattern.triggers?.join(', ') || 'none'}`);
      });
      console.log('');
      return;
    }

    // Export skill
    if (options.export) {
      const outputPath = `./skills/implementations/${options.export}.ts`;
      await this.skillLearner.exportSkillToFramework(options.export, outputPath);
      console.log(formatSuccess(`Exported skill to ${outputPath}`));
      return;
    }

    // List all learned skills
    const skills = this.skillLearner.getLearnedSkills();
    
    console.log('\n🎓 Learned Skills');
    console.log('─'.repeat(60));
    console.log(`Found ${skills.length} learned skills\n`);

    if (skills.length === 0) {
      console.log('No learned skills yet. Skills are automatically extracted from');
      console.log('successful agent sessions and saved for reuse.\n');
      return;
    }

    skills.forEach(skill => {
      console.log(`  ${skill.name}`);
      console.log(`    ${skill.description}`);
      console.log(`    Confidence: ${(skill.confidence * 100).toFixed(0)}% | Used: ${skill.usageCount}x | Success: ${(skill.successRate * 100).toFixed(0)}%`);
      console.log(`    Category: ${skill.metadata.category} | Difficulty: ${skill.metadata.difficulty}`);
      
      if (skill.pattern.triggers && skill.pattern.triggers.length > 0) {
        console.log(`    Triggers: ${skill.pattern.triggers.join(', ')}`);
      }
      
      console.log('');
    });

    console.log('Use --stats for learning statistics');
    console.log('Use --find <query> to search for specific skills');
    console.log('Use --export <id> to export a skill to the framework\n');
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
   * Handle agent command - Autonomous agent with tool calling
   */
  private async handleAgent(query: string[], options: any): Promise<void> {
    try {
      this.spinner.stop();

      const queryText = query.join(' ');
      
      // Initialize HUD
      const hudEnabled = options.hud !== false; // Default true unless --no-hud
      const hud = new HudStatusLine(hudEnabled);

      // Configuration for this session
      const config: SessionConfig = {
        model: options.model || 'claude-opus',
        autoConfirm: {
          files: options.autoConfirm || false,
          terminal: options.autoConfirm || false,
          skills: options.autoConfirm || false,
        },
        maxToolCalls: parseInt(options.maxTools, 10) || 20,
        maxTerminalCommands: parseInt(options.maxCommands, 10) || 10,
        workspaceDirectory: process.cwd(),
        logActions: true,
      };

      console.log(formatWelcome());
      console.log(formatInfo(`Model: ${config.model}`));
      console.log(formatInfo(`Max tool calls: ${config.maxToolCalls}`));
      console.log(formatInfo(`Auto-confirm: ${config.autoConfirm?.files ? 'enabled' : 'disabled'}`));
      console.log('');

      // Confirmation handler for file/terminal operations
      const onConfirmation = async (question: string): Promise<boolean> => {
        if (config.autoConfirm?.files) return true;
        
        // Pause HUD for user interaction
        hud.pause();
        
        // For CLI, use simple prompt (would need to implement proper prompt in real version)
        console.log(`⚠️  ${question}`);
        console.log('    (Auto-confirm disabled in CLI - operation skipped for safety)');
        
        hud.resume();
        return false; // Skip operations requiring confirmation in CLI mode
      };

      // Initialize agent
      const agent = new AutonomousAgent({
        config,
        workspaceDirectory: process.cwd(),
        onConfirmation,
      });

      if (options.interactive) {
        // Start interactive session
        console.log(formatInfo('Type "exit" to quit, "clear" to reset conversation'));
        console.log('');
        await agent.startInteractive();
      } else {
        // Single query mode with HUD
        hud.start('Processing query', config.model);
        
        const startTime = performance.now();
        const response = await agent.processInput(queryText);
        const duration = (performance.now() - startTime) / 1000;

        const summary = agent.getSessionSummary();
        
        // Update HUD with final metrics
        hud.update({
          toolCalls: summary.toolCalls,
          maxToolCalls: config.maxToolCalls,
          cost: summary.totalCost,
        });
        hud.stop('success');

        console.log(formatSuccess('Agent Response:'));
        console.log('─'.repeat(60));
        console.log(response);
        console.log('─'.repeat(60));

        console.log('');
        console.log(formatInfo(`Session Summary:`));
        console.log(`  Duration: ${summary.duration.toFixed(2)}s`);
        console.log(`  Tool Calls: ${summary.toolCalls}/${config.maxToolCalls}`);
        console.log(`  Total Cost: $${summary.totalCost.toFixed(4)}`);
        console.log('');

        // Learn from this session
        await this.learnFromSession(queryText, summary, duration, true);

        await agent.end();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(formatError(`Agent Error: ${message}`));
      logger.error('Agent execution failed', message);
      
      // Don't learn from failed sessions (success = false)
    }
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
   * Handle workflow command
   */
  private async handleWorkflow(name: string, options: any): Promise<void> {
    try {
      console.log(formatProcessing('WORKFLOW', `Executing ${name}...`));
      this.spinner.start('Running workflow...');

      // Parse inputs
      const inputs = options.input ? JSON.parse(options.input) : {};
      const version = options.version || '1.0.0';

      // Execute workflow
      const result = await this.workflowEngine.executeWorkflow(
        name,
        version,
        inputs
      );

      this.spinner.stop();

      // Display results
      console.log(formatSuccess('Workflow completed successfully!\n'));
      console.log('Results:');
      console.log(`  Status: ${result.status}`);
      console.log(`  Duration: ${result.totalDuration}ms`);
      console.log(`  Cost: $${(result.totalCost || 0).toFixed(4)}`);
      console.log(`  Steps Completed: ${result.stepsExecuted}`);
      
      if (result.outputs) {
        console.log('\nOutputs:');
        console.log(JSON.stringify(result.outputs, null, 2));
      }
    } catch (error) {
      this.spinner.stop();
      console.log(formatError((error as Error).message));
      logger.error(`Workflow error: ${error}`);
    }
  }

  /**
   * Handle recipes command
   */
  private async handleRecipes(): Promise<void> {
    try {
      // List recipe files
      const fs = await import('fs');
      const path = await import('path');
      const recipesDir = './recipes';
      
      if (!fs.existsSync(recipesDir)) {
        console.log('\n📚 Available Recipes:\n' + '─'.repeat(80) + '\n');
        console.log('  No recipes directory found.\n');
        return;
      }

      const files = fs.readdirSync(recipesDir).filter(f => f.endsWith('.yaml'));
      
      console.log('\n📚 Available Recipes:\n' + '─'.repeat(80) + '\n');

      if (files.length === 0) {
        console.log('  No recipes found.\n');
        return;
      }

      files.forEach((file) => {
        const name = file.replace('.yaml', '');
        console.log(`  ${name}`);
      });

      console.log('\nNote: Recipe execution via CLI coming soon.\n');
    } catch (error) {
      console.log(formatError((error as Error).message));
    }
  }

  /**
   * Handle execute recipe command
   */
  private async handleExecuteRecipe(name: string, options: any): Promise<void> {
    this.spinner.stop();
    console.log(formatInfo('Recipe execution via CLI is not yet implemented.'));
    console.log('Use workflow command instead: goose workflow <name>\n');
  }

  /**
   * Handle cache command
   */
  private handleCache(options: any): void {
    // Show stats
    if (options.stats || (!options.clear && !options.invalidate)) {
      const stats = this.workflowEngine.getCacheStats();
      console.log('\n💾 Cache Statistics:\n' + '─'.repeat(60) + '\n');
      console.log(`  Entries: ${stats.entryCount}`);
      console.log(`  Size: ${(stats.sizeBytes / 1024).toFixed(2)} KB`);
      console.log(`  Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);
      console.log(`  Hits: ${stats.hits}`);
      console.log(`  Misses: ${stats.misses}`);
      console.log(`  Cost Saved: $${stats.costSaved.toFixed(4)}`);
      console.log(`  Time Saved: ${(stats.timeSaved / 1000).toFixed(2)}s\n`);
      return;
    }

    // Clear cache
    if (options.clear) {
      this.workflowEngine.clearCache();
      console.log(formatSuccess('Cache cleared successfully'));
      return;
    }

    // Invalidate specific workflow
    if (options.invalidate) {
      const count = this.workflowEngine.invalidateCache(options.invalidate);
      console.log(formatSuccess(`Invalidated ${count} cache entries for workflow: ${options.invalidate}`));
      return;
    }
  }

  /**
   *  if (isNaN(amount) || amount <= 0) {
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
   * Planning Mode - Interactive planning with planner agent
   * Uses planner agent to create structured implementation plans
   */
  private async handlePlanningMode(query: string, options: any): Promise<void> {
    try {
      this.spinner.stop();
      
      // Initialize HUD
      const hudEnabled = options.hud !== false;
      const hud = new HudStatusLine(hudEnabled);

      console.log(formatInfo('🎯 Planning Mode'));
      console.log(formatInfo('Using Planner agent for structured planning'));
      console.log('');

      // Configuration for planner session
      const config: SessionConfig = {
        model: 'claude-4-sonnet',
        autoConfirm: {
          files: false,
          terminal: false,
          skills: false,
        },
        maxToolCalls: 15,
        maxTerminalCommands: 0, // Planning doesn't execute commands
        workspaceDirectory: process.cwd(),
        logActions: true,
      };

      const onConfirmation = async (question: string): Promise<boolean> => {
        hud.pause();
        console.log(`⚠️  ${question}`);
        hud.resume();
        return false;
      };

      // Initialize agent with planner configuration
      const agent = new AutonomousAgent({
        config,
        workspaceDirectory: process.cwd(),
        onConfirmation,
      });

      // Enhanced planning prompt
      const planningPrompt = `You are a planning expert. Create a detailed, actionable plan for: ${query}

Please provide:
1. **Goal Analysis** - Break down the objective
2. **Step-by-Step Plan** - Clear, numbered steps
3. **Considerations** - Potential issues and dependencies
4. **Success Criteria** - How to know when done
5. **Estimated Effort** - Time/complexity assessment

Format your response clearly with sections and bullet points.`;

      // Start HUD
      hud.start('Planning', 'claude-4-sonnet');

      const response = await agent.processInput(planningPrompt);

      const summary = agent.getSessionSummary();
      
      // Update and stop HUD
      hud.update({
        toolCalls: summary.toolCalls,
        maxToolCalls: config.maxToolCalls,
        cost: summary.totalCost,
      });
      hud.stop('success');

      console.log(formatSuccess('📋 Implementation Plan:'));
      console.log('─'.repeat(80));
      console.log(response);
      console.log('─'.repeat(80));

      console.log('');
      console.log(formatInfo(`Planning Session:`));
      console.log(`  Duration: ${summary.duration.toFixed(2)}s`);
      console.log(`  Tool Calls: ${summary.toolCalls}`);
      console.log(`  Cost: $${summary.totalCost.toFixed(4)}`);
      console.log('');

      await agent.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(formatError(`Planning Error: ${message}`));
      logger.error('Planning mode failed', message);
      process.exit(1);
    }
  }

  /**
   * Learn from a completed session
   * Extracts patterns and saves them as learned skills
   */
  private async learnFromSession(
    query: string,
    summary: any,
    duration: number,
    success: boolean
  ): Promise<void> {
    try {
      // Create session analysis (would need actual tool call data from agent)
      const sessionAnalysis: SessionAnalysis = {
        sessionId: `session-${Date.now()}`,
        query,
        toolCalls: [], // TODO: Get actual tool calls from agent
        duration,
        cost: summary.totalCost || 0,
        success,
        model: summary.model || 'unknown',
      };

      // Analyze and potentially create learned skills
      const learnedSkills = await this.skillLearner.analyzeSession(sessionAnalysis);

      if (learnedSkills.length > 0) {
        console.log(formatInfo(`🎓 Learned ${learnedSkills.length} new pattern(s) from this session`));
        learnedSkills.forEach(skill => {
          console.log(`   • ${skill.name} (${(skill.confidence * 100).toFixed(0)}% confidence)`);
        });
        console.log('');
      }
    } catch (error) {
      logger.error('Failed to learn from session', error);
      // Don't fail the main operation if learning fails
    }
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
