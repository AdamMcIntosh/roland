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
  help += chalk.bold.cyan('🦢 oh-my-goose MVP\n');
  help += chalk.gray('═'.repeat(60)) + '\n\n';

  help += chalk.bold('Usage:\n');
  help += '  goose run <query>\n';
  help += '  goose run "eco: your task here"\n\n';

  help += chalk.bold('Modes:\n');
  help += '  ' + chalk.green('eco:') + '           Ecomode (cheapest model)\n';
  help += '  ' + chalk.yellow('autopilot:') + '      Autopilot mode (advanced)\n';
  help += '  ' + chalk.cyan('swarm:') + '           Swarm mode (multiple agents)\n\n';

  help += chalk.bold('Examples:\n');
  help += '  goose run "eco: refactor this function"\n';
  help += '  goose run "eco: write tests for this code"\n';
  help += '  goose run "eco: document this API"\n\n';

  help += chalk.bold('Skills:\n');
  help += '  • ' + chalk.cyan('refactoring') + ' - Improve code quality\n';
  help += '  • ' + chalk.cyan('documentation') + ' - Auto-generate docs\n';
  help += '  • ' + chalk.cyan('testing') + ' - Generate test cases\n\n';

  help += chalk.bold('Options:\n');
  help += '  --help              Show this help\n';
  help += '  --no-cache          Disable caching\n';
  help += '  --verbose           Show detailed output\n';
  help += '  --model <name>      Force specific model\n\n';

  help += chalk.gray('Documentation: https://github.com/oh-my-goose\n');

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
