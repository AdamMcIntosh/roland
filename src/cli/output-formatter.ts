/**
 * Output Formatter - Rich terminal output with colors and formatting
 * 
 * Uses chalk for colored output, formats results nicely
 */

import chalk from 'chalk';

export interface FormattedOutput {
  header: string;
  body: string;
  footer: string;
  full: string;
}

/**
 * ASCII Samwise Logo
 */
function getSamwiseLogo(): string {
  return chalk.cyan(`
    ╔═══════════════════════════════════════╗
    ║                                       ║
    ║         samwise                       ║
    ║       Workflow Orchestration CLI      ║
    ║                                       ║
    ║        \                              ║
    ║                                       ║
    ╚═══════════════════════════════════════╝
  `);
}

/**
 * ASCII Samwise Character (detailed)
 */
function getSamwiseCharacter(): string {
  return chalk.yellow(`
          ^^^
         (o o)
        /|   |\\
       / | ▼ | \\
      /  |   |  \\
         \\___/
    `);
}

/**
 * Format welcome banner
 */
export function formatWelcome(): string {
  let welcome = '\n';
  welcome += getSamwiseLogo();
  welcome += '\n';
  welcome += chalk.bold.cyan('Welcome to samwise! \n');
  welcome += chalk.gray('═'.repeat(80)) + '\n\n';
  
  welcome += chalk.bold('Quick Start:\n');
  welcome += chalk.green('  • Run a task:') + '        samwise run "eco: your task"\n';
  welcome += chalk.green('  • View help:') + '         samwise help\n';
  welcome += chalk.green('  • List recipes:') + '      samwise recipes\n';
  welcome += chalk.green('  • View cache stats:') + '  samwise cache --stats\n\n';
  
  welcome += chalk.bold('5 Execution Modes:\n');
  welcome += chalk.cyan('  eco:') + '          Single agent (cheapest)\n';
  welcome += chalk.yellow('  autopilot:') + '    3-agent sequential\n';
  welcome += chalk.magenta('  ultrapilot:') + '   5 parallel agents\n';
  welcome += chalk.blue('  swarm:') + '         8 dynamic agents\n';
  welcome += chalk.green('  pipeline:') + '     4-step workflow\n';
  welcome += chalk.white('  plan:') + '         Planning mode (structured plans)\n';
  welcome += chalk.white('  samwise:') + '      Alias for plan: (persistence mode)\n\n';
  
  welcome += chalk.gray('═'.repeat(80)) + '\n';
  welcome += chalk.dim('Type "samwise help" for detailed documentation\n\n');
  
  return welcome;
}

/**
 * Format connection status
 */
export function formatConnectionStatus(connected: boolean, user?: string): string {
  const status = connected 
    ? chalk.green('✓ Connected')
    : chalk.red('✗ Disconnected');
  
  let message = chalk.bold('Connection Status:\n');
  message += `  ${status}`;
  
  if (user) {
    message += ` ${chalk.gray(`(as: ${user})`)}`;
  }
  
  message += '\n';
  return message;
}

/**
 * Format execution result for display
 */
export function formatResult(
  result: string,
  model: string,
  cost: number,
  cached: boolean,
  duration: number
): FormattedOutput {
  const header = formatHeader(model, cached);
  const body = formatBody(result);
  const footer = formatFooter(cost, duration);
  const full = `${header}\n${body}\n${footer}`;

  return { header, body, footer, full };
}

/**
 * Format header with model and status
 */
function formatHeader(model: string, cached: boolean): string {
  const status = cached ? chalk.cyan('💾 CACHED') : chalk.green('✅ READY');
  const modelStr = chalk.bold(`Model: ${model}`);
  return `\n${status} ${modelStr}\n${chalk.gray('='.repeat(60))}`;
}

/**
 * Format result body with indentation
 */
function formatBody(result: string): string {
  const lines = result.split('\n');
  const formatted = lines.map((line) => `  ${line}`).join('\n');
  return formatted;
}

/**
 * Format footer with cost and duration
 */
function formatFooter(cost: number, duration: number): string {
  const durationStr = `${(duration / 1000).toFixed(2)}s`;
  const costStr = cost < 0.01 ? `$${(cost * 1000).toFixed(2)}m` : `$${cost.toFixed(4)}`;
  
  let footer = chalk.gray('='.repeat(60)) + '\n';
  footer += chalk.yellow(`⏱️  ${durationStr}`);
  footer += chalk.cyan(` | 💰 ${costStr}`);

  return footer;
}

/**
 * Format error message
 */
export function formatError(message: string): string {
  return chalk.red(`\n❌ Error: ${message}\n`);
}

/**
 * Format info message
 */
export function formatInfo(message: string): string {
  return chalk.blue(`\nℹ️  ${message}\n`);
}

/**
 * Format success message
 */
export function formatSuccess(message: string): string {
  return chalk.green(`\n✅ ${message}\n`);
}

/**
 * Format warning message
 */
export function formatWarning(message: string): string {
  return chalk.yellow(`\n⚠️  ${message}\n`);
}

/**
 * Format usage help
 */
export function formatHelp(): string {
  let help = '\n';
  help += chalk.bold.cyan(' samwise v1.0.0\n');
  help += chalk.gray('═'.repeat(80)) + '\n\n';

  help += chalk.bold('BASIC USAGE:\n');
  help += '  samwise run <query>                  Execute a task with Ecomode\n';
  help += '  samwise run "eco: your task here"    Explicitly use Ecomode\n';
  help += '  samwise workflow <name>              Execute a workflow\n';
  help += '  samwise recipe <name>                Execute a pre-built recipe\n\n';

  help += chalk.bold('EXECUTION MODES:\n');
  help += '  ' + chalk.green('eco:') + '           Ecomode (cheapest model, single agent)\n';
  help += '  ' + chalk.yellow('autopilot:') + '      Autopilot mode (3-agent sequential)\n';
  help += '  ' + chalk.magenta('ultrapilot:') + '     Ultrapilot mode (5 parallel agents)\n';
  help += '  ' + chalk.cyan('swarm:') + '           Swarm mode (8 dynamic agents)\n';
  help += '  ' + chalk.blue('pipeline:') + '        Pipeline mode (4-step sequential)\n';
  help += '  ' + chalk.white('plan:') + '           Planning mode (structured implementation plans)\n';
  help += '  ' + chalk.white('samwise:') + '        Alias for plan: (persistence planning)\n\n';

  help += chalk.bold('COMMANDS:\n');
  help += '  run <query>                          Execute a task\n';
  help += '  workflow <name>                      Run a specific workflow\n';
  help += '  recipe <name>                        Execute a recipe\n';
  help += '  recipes                              List available recipes\n';
  help += '  skills                               List available skills\n';
  help += '  learned                              Show learned skills (auto-extracted)\n';
  help += '  agents                               List loaded agents\n';
  help += '  modes                                List execution modes\n';
  help += '  stats                                Show session statistics\n';
  help += '  cache                                Manage workflow cache\n';
  help += '  budget                               Manage API cost budget\n';
  help += '  perf                                 Show performance dashboard\n';
  help += '  help                                 Show this help\n\n';

  help += chalk.bold('LEARNED SKILLS OPTIONS:\n');
  help += '  -s, --stats                          Show learning statistics\n';
  help += '  -f, --find <query>                   Find skills matching query\n';
  help += '  -e, --export <id>                    Export skill to framework\n\n';

  help += chalk.bold('WORKFLOW OPTIONS:\n');
  help += '  -v, --version <version>              Workflow version (default: 1.0.0)\n';
  help += '  -i, --input <json>                   Input parameters as JSON\n';
  help += '  --no-cache                           Disable caching\n';
  help += '  --hud                                Enable HUD status line\n';
  help += '  --no-hud                             Disable HUD status line\n\n';

  help += chalk.bold('CACHE OPTIONS:\n');
  help += '  -s, --stats                          Show cache statistics\n';
  help += '  -c, --clear                          Clear all cache\n';
  help += '  -i, --invalidate <workflow>          Invalidate specific workflow\n\n';

  help += chalk.bold('EXAMPLES:\n');
  help += '  samwise run "eco: refactor this function"\n';
  help += '  samwise run "autopilot: build a todo app"\n';
  help += '  samwise run "plan: create REST API for user management" --hud\n';
  help += '  samwise run "samwise: implement authentication system"\n';
  help += '  samwise agent "analyze codebase" --hud\n';
  help += '  samwise workflow CodeRefactoring --input \'{"file": "app.ts"}\'\n';
  help += '  samwise recipe "Plan Execute Review"\n';
  help += '  samwise cache --stats\n';
  help += '  samwise budget --set 10.00\n\n';

  help += chalk.gray('Documentation: https://github.com/yourusername/samwise\n');

  return help;
}

/**
 * Format cache statistics
 */
export function formatCacheStats(hits: number, misses: number, saved: number): string {
  const total = hits + misses;
  const rate = total > 0 ? ((hits / total) * 100).toFixed(1) : '0';

  let stats = chalk.cyan('\n💾 Cache Statistics:\n');
  stats += `  Hit Rate: ${chalk.bold(rate + '%')} (${hits}/${total})\n`;
  stats += `  Saved: ${chalk.yellow(`$${saved.toFixed(4)}`)}\n`;

  return stats;
}

/**
 * Format cost summary
 */
export function formatCostSummary(
  totalCost: number,
  saved: number,
  calls: number
): string {
  let summary = chalk.yellow('\n📊 Cost Summary:\n');
  summary += `  Total: ${chalk.bold(formatCost(totalCost))}\n`;
  summary += `  Saved: ${chalk.green(formatCost(saved))}\n`;
  summary += `  Calls: ${chalk.bold(calls.toString())}\n`;

  return summary;
}

/**
 * Format single cost value
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 1000).toFixed(2)}m`;
  }
  return `$${cost.toFixed(4)}`;
}

/**
 * Format skill result
 */
export function formatSkillResult(
  skillName: string,
  data: any
): string {
  let output = chalk.bold.cyan(`\n✨ ${skillName.toUpperCase()} SKILL\n`);
  output += chalk.gray('═'.repeat(60)) + '\n\n';

  if (skillName === 'refactoring' && data.refactored) {
    output += chalk.bold('Improvements:\n');
    (data.improvements as string[]).forEach((imp) => {
      output += `  • ${imp}\n`;
    });
    output += chalk.gray('\nRefactored Code:\n');
    output += chalk.cyan(`\n${data.refactored}\n`);
  } else if (skillName === 'documentation' && data.documentation) {
    output += data.documentation + '\n';
  } else if (skillName === 'testing' && data.tests) {
    output += chalk.bold(`Test Cases (${data.testCases} tests):\n\n`);
    output += chalk.cyan(data.tests + '\n');
  }

  return output;
}

/**
 * Format loading/processing message with context
 */
export function formatProcessing(mode: string, query: string): string {
  const modeStr = chalk.bold.cyan(mode.toUpperCase());
  const queryStr = chalk.gray(query.substring(0, 50) + (query.length > 50 ? '...' : ''));
  return `\n${modeStr} ${queryStr}\n`;
}
