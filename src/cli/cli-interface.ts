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
import { skillRegistry } from '../skills/skill-framework.js';
import { PerformanceMonitor } from '../utils/performance-monitor.js';
import { BudgetManager } from '../utils/budget-manager.js';
import { logger } from '../utils/logger.js';
import {
  extractFileArtifactsFromOutput,
  writeFileArtifactsToDirectory,
  isPlanOutput,
  isDesignDocument,
  generateFilenameFromQuery,
  createPlanArtifact,
} from '../utils/codegen.js';
import { WorkflowEngine } from '../workflows/engine.js';
import { RecipeLoader } from '../workflows/recipe-loader.js';
import { AutonomousAgent } from '../agent-loop/agent.js';
import { SessionConfig } from '../agent-loop/types.js';
import { getAgentManager } from '../agents/agent-manager.js';
import { HudStatusLine } from './hud.js';
import { SkillLearner, SessionAnalysis } from '../skills/skill-learner.js';
import * as readline from 'readline';

export class CliInterface {
  private program: Command;
  private spinner: Ora;
  private workflowEngine: WorkflowEngine;
  private recipeLoader: RecipeLoader;
  private recipesLoaded = false;
  private agentManager = getAgentManager();
  private skillLearner: SkillLearner;

  constructor() {
    this.program = new Command();
    this.spinner = ora();
    this.workflowEngine = new WorkflowEngine(true); // Enable cache
    this.recipeLoader = new RecipeLoader(this.workflowEngine, './recipes');
    this.skillLearner = new SkillLearner('./learned-skills');
    this.setupProgram();
    this.initializeSkillLearner();
  }

  private async ensureRecipesLoaded(): Promise<void> {
    if (this.recipesLoaded) return;
    await this.recipeLoader.loadAllRecipes();
    this.recipesLoaded = true;
  }

  /**
   * Append code generation directive to force file-based outputs
   */
  private appendCodeGenerationDirective(query: string): string {
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
   * Prompt user for confirmation
   */
  private async promptConfirmation(question: string): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(`${question} (y/N): `, (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === 'y' || normalized === 'yes');
      });
    });
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
      .option('--overwrite', 'Allow generated files to overwrite existing files')
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

    // Modes command
    this.program
      .command('modes')
      .description('List available execution modes')
      .action(() => this.handleModes());

    // Agent command - Autonomous agent with natural language
    this.program
      .command('agent <query...>')
      .description('Run autonomous agent with natural language query')
      .option('--model <name>', 'Specify LLM model (default: nousresearch/hermes-3-llama-3.1-405b:free)')
      .option('--interactive', 'Start interactive multi-turn session')
      .option('--auto-confirm', 'Auto-approve file/terminal/skill operations')
      .option('--max-tools <number>', 'Max tool calls (default: 20)', '20')
      .option('--max-commands <number>', 'Max terminal commands (default: 10)', '10')
      .option('--overwrite', 'Allow generated files to overwrite existing files')
      .option('--hud', 'Enable HUD status line')
      .option('--no-hud', 'Disable HUD status line')
      .action((query: string[], options) => this.handleAgent(query, options));

    // Chat command - Interactive session with auto file materialization
    this.program
      .command('chat [query...]')
      .description('Start interactive chat session (Copilot-style)')
      .option('--model <name>', 'Specify LLM model (default: nousresearch/hermes-3-llama-3.1-405b:free)')
      .option('--auto-confirm', 'Auto-approve file/terminal/skill operations')
      .option('--max-tools <number>', 'Max tool calls (default: 20)', '20')
      .option('--max-commands <number>', 'Max terminal commands (default: 10)', '10')
      .option('--overwrite', 'Allow generated files to overwrite existing files')
      .option('--hud', 'Enable HUD status line')
      .option('--no-hud', 'Disable HUD status line')
      .action((query: string[], options) => this.handleChat(query, options));

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

    // Performance monitoring commands
    this.program
      .command('stats')
      .description('Show performance statistics')
      .option('-d, --daily <days>', 'Show daily costs (default: 7)', '7')
      .option('-w, --weekly', 'Show weekly costs')
      .option('-m, --monthly', 'Show monthly costs')
      .option('-s, --session', 'Show current session stats')
      .option('-a, --agents', 'Show agent breakdown')
      .action((options) => this.handleMonitoringStats(options));

    this.program
      .command('sessions')
      .description('List session replay history')
      .option('-l, --list', 'List all sessions')
      .option('-v, --view <id>', 'View specific session details')
      .option('--cleanup', 'Delete old session replays')
      .action((options) => this.handleSessions(options));

    this.program
      .command('export')
      .description('Export analytics data')
      .option('-o, --output <file>', 'Output CSV file', 'analytics.csv')
      .option('-d, --days <number>', 'Days to include (default: 30)', '30')
      .action((options) => this.handleExport(options));

    this.program
      .command('observatory')
      .description('Show real-time agent observatory')
      .option('--check', 'Check for interventions')
      .action((options) => this.handleObservatory(options));

    // Documentation refactoring command
    this.program
      .command('docs <filePath>')
      .description('Refactor and improve documentation')
      .option('-t, --type <type>', 'Documentation type (README, API, UserGuide, etc)', 'General')
      .option('-a, --audience <audience>', 'Target audience for documentation', 'Developers')
      .option('-m, --model <model>', 'Model to use', 'nousresearch/hermes-3-llama-3.1-405b:free')
      .option('--hud', 'Show HUD status line', true)
      .option('--no-hud', 'Disable HUD status line')
      .action((filePath, options) => this.handleDocumentationRefactor(filePath, options));

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

      const codegenQuery = this.appendCodeGenerationDirective(parsed.query);

      // Show processing message with mode
      const modeDisplay = parsed.mode === 'default' ? 'ECOMODE' : parsed.mode.toUpperCase();
      console.log(formatProcessing(modeDisplay, parsed.query));

      // Start spinner
      this.spinner.start('Processing...');

      // Build execution request - map 'default' to 'ecomode'
      const executionMode = parsed.mode === 'default' ? 'ecomode' : parsed.mode;
      const request: ExecutionRequest = {
        query: codegenQuery,
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

      // Materialize generated code to files if present
      const artifacts = extractFileArtifactsFromOutput(result.result);
      
      // Also check if this is a plan/design output and save it as markdown
      if (isPlanOutput(result.result)) {
        const isDesign = isDesignDocument(result.result);
        const planFilename = generateFilenameFromQuery(fullQuery, isDesign);
        artifacts.push(createPlanArtifact(result.result, planFilename));
      }
      
      if (artifacts.length > 0) {
        const writeSummary = await writeFileArtifactsToDirectory(artifacts, {
          baseDir: process.cwd(),
          overwrite: options.overwrite === true,
          confirmOverwrite: (filePath) =>
            this.promptConfirmation(`Overwrite existing file: ${filePath}?`),
        });

        if (writeSummary.written.length > 0) {
          console.log(
            formatSuccess(
              `Created ${writeSummary.written.length} file(s) in ${process.cwd()}`
            )
          );
        }

        if (writeSummary.skipped.length > 0) {
          console.log(
            formatInfo(
              `Skipped ${writeSummary.skipped.length} file(s): ` +
                writeSummary.skipped.map((s) => `${s.filePath} (${s.reason})`).join(', ')
            )
          );
        }
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
    const skillsMap = skillRegistry.getAllSkills();
    const allSkills = Array.from(skillsMap.values());

    console.log(
      '\n' +
        '🛠️  Available Skills:\n' +
        '─'.repeat(60) +
        '\n'
    );

    if (allSkills.length === 0) {
      console.log('  No skills registered yet.\n');
      return;
    }

    // Group by category
    const categories = new Map<string, typeof allSkills>();
    allSkills.forEach((skill) => {
      const category = skill.metadata.category;
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(skill);
    });

    // Display skills grouped by category
    categories.forEach((skills, category) => {
      console.log(`\n📁 ${category.toUpperCase()}`);
      skills.forEach((skill) => {
        const metadata = skill.metadata;
        console.log(`  ${metadata.name}`);
        console.log(`    ${metadata.description}\n`);
      });
    });

    console.log(`Total: ${allSkills.length} skills\n`);
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
    const allAgents = this.agentManager.getAllAgents();

    console.log(
      '\n' +
        '🤖 Loaded Agents:\n' +
        '─'.repeat(60) +
        '\n'
    );

    if (allAgents.length === 0) {
      console.log('  No agents loaded yet.\n');
      return;
    }

    // Group agents by domain
    const domains = new Map<string, typeof allAgents>();
    
    // Domain mapping based on agent name patterns
    const getDomain = (name: string): string => {
      if (name.startsWith('architect')) return 'Architecture';
      if (name.startsWith('executor')) return 'Execution';
      if (name.startsWith('explore')) return 'Search';
      if (name.startsWith('researcher')) return 'Research';
      if (name.startsWith('designer')) return 'Frontend';
      if (name.startsWith('writer')) return 'Documentation';
      if (name.startsWith('vision')) return 'Visual';
      if (name.startsWith('planner')) return 'Planning';
      if (name.startsWith('critic')) return 'Critique';
      if (name.startsWith('analyst')) return 'Analysis';
      if (name.startsWith('qa-tester')) return 'Testing';
      if (name.startsWith('security')) return 'Security';
      if (name.startsWith('build-fixer')) return 'Build';
      if (name.startsWith('tdd-guide')) return 'TDD';
      if (name.startsWith('code-reviewer')) return 'Code Review';
      if (name.startsWith('scientist')) return 'Data Science';
      return 'Other';
    };

    allAgents.forEach((agent) => {
      const domain = getDomain(agent.name);
      if (!domains.has(domain)) {
        domains.set(domain, []);
      }
      domains.get(domain)!.push(agent);
    });

    // Sort domains and display
    const sortedDomains = Array.from(domains.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    sortedDomains.forEach(([domain, agents]) => {
      console.log(`\n📁 ${domain.toUpperCase()}`);
      agents
        .sort((a, b) => {
          // Sort by tier: base, low, medium, high
          const getTier = (name: string) => {
            if (name.endsWith('-low')) return 0;
            if (name.endsWith('-medium')) return 2;
            if (name.endsWith('-high')) return 3;
            return 1; // base tier
          };
          return getTier(a.name) - getTier(b.name);
        })
        .forEach((agent) => {
          const model = agent.model || 'default';
          console.log(`  ${agent.name.padEnd(25)} → ${model}`);
        });
    });

    console.log(`\nTotal: ${allAgents.length} agents\n`);
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

      const queryText = this.appendCodeGenerationDirective(query.join(' '));
      
      // Initialize HUD
      const hudEnabled = options.hud !== false; // Default true unless --no-hud
      const hud = new HudStatusLine(hudEnabled);

      // Configuration for this session
      const config: SessionConfig = {
        model: options.model || 'nousresearch/hermes-3-llama-3.1-405b:free',
        autoConfirm: {
          files: false,
          terminal: false,
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
      console.log(formatInfo(`Auto-confirm (skills): ${config.autoConfirm?.skills ? 'enabled' : 'disabled'}`));
      console.log('');

      // Confirmation handler for file/terminal operations
      const onConfirmation = async (question: string): Promise<boolean> => {
        hud.pause();
        const confirmed = await this.promptConfirmation(question);
        hud.resume();
        return confirmed;
      };

      // Initialize agent
      const agent = new AutonomousAgent({
        config,
        workspaceDirectory: process.cwd(),
        onConfirmation,
        codegen: {
          enforceDirective: true,
          overwrite: options.overwrite === true,
          baseDir: process.cwd(),
          confirmOverwrite: (filePath) =>
            this.promptConfirmation(`Overwrite existing file: ${filePath}?`),
        },
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

        // Materialize generated code to files if present
        const artifacts = extractFileArtifactsFromOutput(response);
        
        // Also check if this is a plan/design output and save it as markdown
        if (isPlanOutput(response)) {
          const isDesign = isDesignDocument(response);
          const planFilename = generateFilenameFromQuery(query.join(' '), isDesign);
          artifacts.push(createPlanArtifact(response, planFilename));
        }
        
        if (artifacts.length > 0) {
          const writeSummary = await writeFileArtifactsToDirectory(artifacts, {
            baseDir: process.cwd(),
            overwrite: options.overwrite === true,
            confirmOverwrite: (filePath) =>
              this.promptConfirmation(`Overwrite existing file: ${filePath}?`),
          });

          if (writeSummary.written.length > 0) {
            console.log(
              formatSuccess(
                `Created ${writeSummary.written.length} file(s) in ${process.cwd()}`
              )
            );
          }

          if (writeSummary.skipped.length > 0) {
            console.log(
              formatInfo(
                `Skipped ${writeSummary.skipped.length} file(s): ` +
                  writeSummary.skipped.map((s) => `${s.filePath} (${s.reason})`).join(', ')
              )
            );
          }
        }

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
   * Handle chat command - Interactive session with auto file materialization
   */
  private async handleChat(query: string[], options: any): Promise<void> {
    try {
      this.spinner.stop();

      const queryText = query.join(' ');

      // Initialize HUD
      const hudEnabled = options.hud !== false;
      const hud = new HudStatusLine(hudEnabled);

      // Configuration for this session
      const config: SessionConfig = {
        model: options.model || 'nousresearch/hermes-3-llama-3.1-405b:free',
        autoConfirm: {
          files: false,
          terminal: false,
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
      console.log(formatInfo(`Auto-confirm (skills): ${config.autoConfirm?.skills ? 'enabled' : 'disabled'}`));
      console.log('');

      // Confirmation handler for file/terminal operations
      const onConfirmation = async (question: string): Promise<boolean> => {
        hud.pause();
        const confirmed = await this.promptConfirmation(question);
        hud.resume();
        return confirmed;
      };

      // Initialize agent
      const agent = new AutonomousAgent({
        config,
        workspaceDirectory: process.cwd(),
        onConfirmation,
        codegen: {
          enforceDirective: true,
          overwrite: options.overwrite === true,
          baseDir: process.cwd(),
          confirmOverwrite: (filePath) =>
            this.promptConfirmation(`Overwrite existing file: ${filePath}?`),
        },
      });

      if (queryText.trim()) {
        hud.start('Processing query', config.model);
        const response = await agent.processInput(queryText);
        hud.stop('success');

        console.log(formatSuccess('Agent Response:'));
        console.log('─'.repeat(60));
        console.log(response);
        console.log('─'.repeat(60));

        const artifacts = extractFileArtifactsFromOutput(response);
        
        // Also check if this is a plan/design output and save it as markdown
        if (isPlanOutput(response)) {
          const isDesign = isDesignDocument(response);
          const planFilename = generateFilenameFromQuery(queryText, isDesign);
          artifacts.push(createPlanArtifact(response, planFilename));
        }
        
        if (artifacts.length > 0) {
          const writeSummary = await writeFileArtifactsToDirectory(artifacts, {
            baseDir: process.cwd(),
            overwrite: options.overwrite === true,
            confirmOverwrite: (filePath) =>
              this.promptConfirmation(`Overwrite existing file: ${filePath}?`),
          });

          if (writeSummary.written.length > 0) {
            console.log(
              formatSuccess(
                `Created ${writeSummary.written.length} file(s) in ${process.cwd()}`
              )
            );
          }

          if (writeSummary.skipped.length > 0) {
            console.log(
              formatInfo(
                `Skipped ${writeSummary.skipped.length} file(s): ` +
                  writeSummary.skipped.map((s) => `${s.filePath} (${s.reason})`).join(', ')
              )
            );
          }
        }

        console.log('');
      }

      await agent.startInteractive();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(formatError(`Chat Error: ${message}`));
      logger.error('Chat execution failed', message);
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

      await this.ensureRecipesLoaded();

      // Parse inputs
      const inputs = options.input ? JSON.parse(options.input) : {};
      const version = options.version || '1.0.0';

      // Execute workflow
      const useCache = options.cache !== false;
      const result = await this.workflowEngine.executeWorkflow(name, inputs, version, useCache);

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
      await this.ensureRecipesLoaded();
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
    console.log('Use workflow command instead: samwise workflow <name>\n');
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
        model: 'nousresearch/hermes-3-llama-3.1-405b:free',
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
      hud.start('Planning', 'nousresearch/hermes-3-llama-3.1-405b:free');

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
   * Handle monitoring stats command
   */
  private async handleMonitoringStats(options: any): Promise<void> {
    const { getAnalytics, getSummaryCache } = await import('../monitoring/index.js');
    const analytics = getAnalytics();

    if (options.session) {
      // Current session stats
      const session = analytics.getCurrentSession();
      if (!session) {
        console.log(formatInfo('No active session'));
        return;
      }

      console.log(formatSuccess('📊 Current Session Statistics'));
      console.log('─'.repeat(80));
      console.log(`Session ID: ${session.session_id}`);
      console.log(`Mode: ${session.mode || 'unknown'}`);
      console.log(`Duration: ${((Date.now() - session.start_time) / 1000).toFixed(1)}s`);
      console.log(`Total Tokens: ${session.total_tokens.toLocaleString()}`);
      console.log(`Total Cost: ~$${session.total_cost.toFixed(4)}`);
      console.log(`Tool Calls: ${session.tool_calls}`);
      console.log(`Cache Hits: ${session.cache_hits} / ${session.cache_hits + session.cache_misses} (${session.cache_hits > 0 ? ((session.cache_hits / (session.cache_hits + session.cache_misses)) * 100).toFixed(1) : 0}%)`); 
      
      if (session.agent_usage && Object.keys(session.agent_usage).length > 0) {
        console.log('\nAgent Usage:');
        Object.entries(session.agent_usage).forEach(([agentType, usage]) => {
          console.log(`  ${agentType}: ${usage.tokens.toLocaleString()} tokens, ~$${usage.cost.toFixed(4)}`);
        });
      }
      return;
    }

    if (options.agents) {
      // Agent breakdown across all sessions
      console.log(formatSuccess('📊 Agent Cost Breakdown'));
      console.log('─'.repeat(80));
      
      const allSessions = analytics.getAllSessions();
      const agentTotals = new Map<string, { tokens: number; cost: number; sessions: number }>();
      
      allSessions.forEach(session => {
        if (session.agent_usage) {
          Object.entries(session.agent_usage).forEach(([agentType, usage]) => {
            const existing = agentTotals.get(agentType) || { tokens: 0, cost: 0, sessions: 0 };
            existing.tokens += usage.tokens;
            existing.cost += usage.cost;
            existing.sessions++;
            agentTotals.set(agentType, existing);
          });
        }
      });

      // Sort by cost (descending)
      const sorted = Array.from(agentTotals.entries())
        .sort((a, b) => b[1].cost - a[1].cost);

      if (sorted.length === 0) {
        console.log(formatInfo('No agent usage data available'));
        return;
      }

      sorted.forEach(([agentType, totals]) => {
        const avgCost = totals.cost / totals.sessions;
        console.log(`${agentType}:`);
        console.log(`  Total Cost: ~$${totals.cost.toFixed(4)}`);
        console.log(`  Total Tokens: ${totals.tokens.toLocaleString()}`);
        console.log(`  Sessions: ${totals.sessions}`);
        console.log(`  Avg Cost/Session: ~$${avgCost.toFixed(4)}`);
        console.log('');
      });
      
      return;
    }

    // Cost reports
    if (options.weekly) {
      const costs = analytics.getWeeklyCosts();
      console.log(formatSuccess('📊 Weekly Costs'));
      console.log('─'.repeat(80));
      costs.forEach((summary) => {
        const date = new Date(summary.date).toLocaleDateString();
        console.log(`Week ${date}:`);
        console.log(`  Sessions: ${summary.sessions}`);
        console.log(`  Total Cost: ~$${summary.total_cost.toFixed(4)}`);
        console.log(`  Total Tokens: ${summary.total_tokens.toLocaleString()}`);
        console.log('');
      });
      return;
    }

    if (options.monthly) {
      const costs = analytics.getMonthlyCosts();
      console.log(formatSuccess('📊 Monthly Costs'));
      console.log('─'.repeat(80));
      costs.forEach((summary) => {
        const date = new Date(summary.date).toLocaleDateString();
        console.log(`Month ${date}:`);
        console.log(`  Sessions: ${summary.sessions}`);
        console.log(`  Total Cost: ~$${summary.total_cost.toFixed(4)}`);
        console.log(`  Total Tokens: ${summary.total_tokens.toLocaleString()}`);
        console.log('');
      });
      return;
    }

    // Daily costs (default)
    const days = parseInt(options.daily || '7', 10);
    const costs = analytics.getDailyCosts(days);
    console.log(formatSuccess(`📊 Daily Costs (Last ${days} days)`));
    console.log('─'.repeat(80));
    
    if (costs.length === 0) {
      console.log(formatInfo('No cost data available yet'));
      console.log('Run some sessions to start tracking costs!');
      return;
    }
    
    costs.forEach((summary) => {
      const date = new Date(summary.date).toLocaleDateString();
      console.log(`${date}:`);
      console.log(`  Sessions: ${summary.sessions}`);
      console.log(`  Total Cost: ~$${summary.total_cost.toFixed(4)}`);
      console.log(`  Total Tokens: ${summary.total_tokens.toLocaleString()}`);
      console.log('');
    });
  }

  /**
   * Handle sessions command
   */
  private async handleSessions(options: any): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const stateDir = '.samwise/state';
    
    try {
      await fs.mkdir(stateDir, { recursive: true });
      
      if (options.cleanup) {
        const { SessionReplay } = await import('../monitoring/index.js');
        await SessionReplay.cleanupOldReplays();
        console.log(formatSuccess('✅ Cleaned up old session replays'));
        return;
      }

      const files = await fs.readdir(stateDir);
      const replayFiles = files.filter(f => f.startsWith('session-replay-'));

      if (replayFiles.length === 0) {
        console.log(formatInfo('No session replays found'));
        return;
      }

      if (options.view) {
        // View specific session
        const sessionFile = `session-replay-${options.view}.jsonl`;
        const sessionPath = path.join(stateDir, sessionFile);
        
        try {
          const content = await fs.readFile(sessionPath, 'utf-8');
          const events = content.trim().split('\n').map(line => JSON.parse(line));

          console.log(formatSuccess(`📹 Session Replay: ${options.view}`));
          console.log('─'.repeat(80));

          // Calculate summary
          const agents = new Map();
          const tools = new Map();
          let startTime = Infinity;
          let endTime = 0;

          events.forEach(event => {
            if (event.timestamp < startTime) startTime = event.timestamp;
            if (event.timestamp > endTime) endTime = event.timestamp;

            if (event.type === 'agent_start') {
              agents.set(event.agentId, { type: event.agentType, start: event.timestamp });
            } else if (event.type === 'tool_end') {
              const toolKey = `${event.agentId}:${event.toolName}`;
              const calls = tools.get(toolKey) || { name: event.toolName, count: 0, totalDuration: 0 };
              calls.count++;
              calls.totalDuration += event.durationMs || 0;
              tools.set(toolKey, calls);
            }
          });

          const duration = (endTime - startTime) / 1000;
          console.log(`Duration: ${duration.toFixed(2)}s`);
          console.log(`Agents: ${agents.size}`);
          console.log(`Events: ${events.length}`);
          console.log('');

          console.log('Agent Activity:');
          agents.forEach((agent, agentId) => {
            console.log(`  ${agentId} (${agent.type})`);
          });

          if (tools.size > 0) {
            console.log('\nTool Usage:');
            tools.forEach((tool, key) => {
              const avgDuration = tool.totalDuration / tool.count;
              console.log(`  ${tool.name}: ${tool.count} calls, avg ${avgDuration.toFixed(0)}ms`);
            });
          }

          console.log('\n─'.repeat(80));
          console.log(`Total Events: ${events.length}`);

        } catch (error) {
          console.log(formatError(`Session not found: ${options.view}`));
        }
        return;
      }

      // List all sessions
      console.log(formatSuccess('📹 Session Replays'));
      console.log('─'.repeat(80));
      
      for (const file of replayFiles.slice(0, 20)) {
        const sessionId = file.replace('session-replay-', '').replace('.jsonl', '');
        const filePath = path.join(stateDir, file);
        const stats = await fs.stat(filePath);
        const date = stats.mtime.toLocaleString();
        
        console.log(`${sessionId}`);
        console.log(`  Date: ${date}`);
        console.log(`  Size: ${(stats.size / 1024).toFixed(1)} KB`);
        console.log('');
      }

      if (replayFiles.length > 20) {
        console.log(formatInfo(`... and ${replayFiles.length - 20} more`));
      }

    } catch (error) {
      console.log(formatError(`Failed to list sessions: ${error}`));
    }
  }

  /**
   * Handle export command
   */
  private async handleExport(options: any): Promise<void> {
    const { getAnalytics } = await import('../monitoring/index.js');
    const analytics = getAnalytics();

    try {
      const outputFile = options.output || 'analytics.csv';
      const days = parseInt(options.days || '30', 10);
      
      await analytics.exportToCSV(outputFile);
      
      console.log(formatSuccess(`✅ Exported analytics to ${outputFile}`));
      console.log(formatInfo(`  Last ${days} days of data`));
    } catch (error) {
      console.log(formatError(`Export failed: ${error}`));
    }
  }

  /**
   * Handle observatory command
   */
  private async handleObservatory(options: any): Promise<void> {
    const { getObservatory, getInterventionSystem } = await import('../monitoring/index.js');
    
    const observatory = getObservatory();
    const display = observatory.getDisplay();

    console.log(formatSuccess('🔭 Agent Observatory'));
    console.log('─'.repeat(80));
    console.log(display.header);
    console.log('');
    display.lines.forEach(line => console.log(line));
    console.log('');
    console.log(display.summary);

    if (options.check) {
      console.log('');
      console.log('🚨 Checking for interventions...');
      const intervention = getInterventionSystem();
      const interventions = intervention.suggestInterventions(observatory);
      
      if (interventions.length === 0) {
        console.log(formatSuccess('✅ No interventions needed'));
      } else {
        const formatted = intervention.formatInterventions(interventions);
        formatted.forEach(line => console.log(line));
      }
    }
  }

  /**
   * Handle documentation refactoring command
   */
  private async handleDocumentationRefactor(filePath: string, options: any): Promise<void> {
    try {
      this.spinner.stop();

      // Check if file exists
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const resolvedPath = path.resolve(process.cwd(), filePath);
      let documentation: string;

      try {
        documentation = await fs.readFile(resolvedPath, 'utf-8');
      } catch (error) {
        console.log(
          formatError(
            `Documentation file not found: ${filePath}\nMake sure the file exists and the path is correct.`
          )
        );
        return;
      }

      const docType = options.type || 'General';
      const audience = options.audience || 'Developers';

      console.log(formatWelcome());
      console.log(formatInfo(`📚 Documentation Refactoring`));
      console.log(formatInfo(`File: ${filePath}`));
      console.log(formatInfo(`Type: ${docType}`));
      console.log(formatInfo(`Audience: ${audience}`));
      console.log('');

      // Initialize HUD
      const hudEnabled = options.hud !== false;
      const hud = new HudStatusLine(hudEnabled);

      // Configuration for this session
      const config: SessionConfig = {
        model: options.model || 'nousresearch/hermes-3-llama-3.1-405b:free',
        autoConfirm: {
          files: false,
          terminal: false,
          skills: false,
        },
        maxToolCalls: 50, // More calls needed for multi-agent workflow
        maxTerminalCommands: 0,
        workspaceDirectory: process.cwd(),
        logActions: true,
      };

      // Confirmation handler
      const onConfirmation = async (question: string): Promise<boolean> => {
        hud.pause();
        const confirmed = await this.promptConfirmation(question);
        hud.resume();
        return confirmed;
      };

      // Initialize agent
      const agent = new AutonomousAgent({
        config,
        workspaceDirectory: process.cwd(),
        onConfirmation,
        codegen: {
          enforceDirective: true,
          overwrite: options.overwrite === true,
          baseDir: process.cwd(),
          confirmOverwrite: (refactoredFile) =>
            this.promptConfirmation(`Overwrite ${path.basename(refactoredFile)}?`),
        },
      });

      // Build the prompt with documentation content
      const refactorQuery = `You are a documentation expert. Analyze and refactor this ${docType} documentation for ${audience}. 

DOCUMENTATION TO REFACTOR:
\`\`\`
${documentation}
\`\`\`

Please:
1. Analyze the current documentation for clarity, completeness, and organization
2. Identify what's working well and what needs improvement
3. Rewrite and improve the documentation for better clarity and completeness
4. Ensure it's appropriate for ${audience}
5. Add any missing sections or examples
6. Provide the complete refactored documentation

Output the final refactored documentation in the same format as the input.`;

      hud.start('Refactoring documentation', config.model);
      const startTime = performance.now();
      const response = await agent.processInput(refactorQuery);
      const duration = (performance.now() - startTime) / 1000;

      const summary = agent.getSessionSummary();
      hud.update({
        toolCalls: summary.toolCalls,
        maxToolCalls: config.maxToolCalls,
        cost: summary.totalCost,
      });
      hud.stop('success');

      console.log(formatSuccess('✨ Documentation Refactoring Complete'));
      console.log('─'.repeat(60));
      console.log(response);
      console.log('─'.repeat(60));

      // Check for refactored documentation in output
      const artifacts = extractFileArtifactsFromOutput(response);
      
      // If output looks like a plan/summary, save it as markdown
      if (isPlanOutput(response)) {
        const summaryFilename = `${path.basename(filePath, path.extname(filePath))}-refactoring-summary.md`;
        artifacts.push(createPlanArtifact(response, summaryFilename));
      }

      if (artifacts.length > 0) {
        const writeSummary = await writeFileArtifactsToDirectory(artifacts, {
          baseDir: process.cwd(),
          overwrite: options.overwrite === true,
          confirmOverwrite: (targetFile) =>
            this.promptConfirmation(`Overwrite existing file: ${path.basename(targetFile)}?`),
        });

        if (writeSummary.written.length > 0) {
          console.log(
            formatSuccess(
              `Created ${writeSummary.written.length} file(s)`
            )
          );
        }

        if (writeSummary.skipped.length > 0) {
          console.log(
            formatInfo(
              `Skipped ${writeSummary.skipped.length} file(s): ` +
                writeSummary.skipped.map((s) => `${s.filePath} (${s.reason})`).join(', ')
            )
          );
        }
      }

      console.log('');
      console.log(formatInfo(`Session Summary:`));
      console.log(`  Duration: ${summary.duration.toFixed(2)}s`);
      console.log(`  Tool Calls: ${summary.toolCalls}/${config.maxToolCalls}`);
      console.log(`  Total Cost: $${summary.totalCost.toFixed(4)}`);
      console.log('');

      await agent.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(formatError(`Documentation Refactoring Error: ${message}`));
      logger.error('Documentation refactoring failed', message);
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
