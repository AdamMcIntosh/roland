/**
 * Progress Tracker - Real-time agent execution progress display
 * 
 * Shows which agents are running, completed, or waiting
 * Displays: cost, duration, estimated time remaining
 */

import chalk from 'chalk';
import { performance } from 'perf_hooks';

export interface AgentProgress {
  name: string;
  status: 'waiting' | 'running' | 'completed' | 'error';
  startTime?: number;
  duration?: number;
  cost?: number;
  error?: string;
}

export class ProgressTracker {
  private enabled: boolean;
  private isInteractive: boolean;
  private agents: Map<string, AgentProgress>;
  private startTime: number;
  private totalCost: number;
  private updateInterval?: NodeJS.Timeout;
  private lastRendered: string;
  private modeKeyword: string;
  private originalQuery: string;

  constructor(enabled: boolean = true) {
    this.enabled = enabled && process.stdout.isTTY;
    this.isInteractive = process.stdout.isTTY || false;
    this.agents = new Map();
    this.startTime = performance.now();
    this.totalCost = 0;
    this.lastRendered = '';
    this.modeKeyword = '';
    this.originalQuery = '';
  }

  /**
   * Initialize progress tracker with agent names
   */
  start(modeKeyword: string, agentNames: string[], query: string): void {
    if (!this.enabled) return;

    this.modeKeyword = modeKeyword;
    this.originalQuery = query.substring(0, 50) + (query.length > 50 ? '...' : '');
    this.startTime = performance.now();
    this.totalCost = 0;
    this.agents.clear();

    // Initialize all agents as waiting
    agentNames.forEach((name) => {
      this.agents.set(name, {
        name,
        status: 'waiting'
      });
    });

    // Start rendering
    if (this.isInteractive) {
      this.updateInterval = setInterval(() => {
        this.render();
      }, 250); // Update every 250ms for smooth animation
    }

    this.render();
  }

  /**
   * Update an agent's status
   */
  updateAgent(agentName: string, status: 'waiting' | 'running' | 'completed' | 'error', cost?: number, duration?: number, error?: string): void {
    if (!this.enabled) return;

    const agent = this.agents.get(agentName);
    if (!agent) return;

    agent.status = status;
    if (status === 'running' && !agent.startTime) {
      agent.startTime = performance.now();
    }
    if (cost !== undefined) {
      agent.cost = cost;
      this.totalCost += cost;
    }
    if (duration !== undefined) {
      agent.duration = duration;
    }
    if (error !== undefined) {
      agent.error = error;
    }

    // Update duration if agent is running
    if (status === 'running' && agent.startTime) {
      agent.duration = (performance.now() - agent.startTime) / 1000;
    }

    if (this.isInteractive) {
      this.render();
    }
  }

  /**
   * Mark an agent as completed
   */
  completeAgent(agentName: string, cost: number, duration: number): void {
    this.updateAgent(agentName, 'completed', cost, duration);
  }

  /**
   * Mark an agent as errored
   */
  errorAgent(agentName: string, error: string): void {
    this.updateAgent(agentName, 'error', undefined, undefined, error);
  }

  /**
   * Render the progress display
   */
  private render(): void {
    if (!this.enabled || !this.isInteractive) return;

    const lines: string[] = [];
    const elapsed = (performance.now() - this.startTime) / 1000;

    // Header
    lines.push('');
    lines.push(chalk.cyan(`⚡ ${this.modeKeyword} Mode Running...`));
    lines.push(chalk.gray(`   "${this.originalQuery}"`));
    lines.push('');

    // Agent progress
    let completed = 0;
    let running = 0;
    let waiting = 0;
    let errorCount = 0;

    this.agents.forEach((agent) => {
      let icon = '◯'; // waiting
      let statusColor = chalk.gray;
      let statusText = 'waiting';

      if (agent.status === 'completed') {
        icon = '✓';
        statusColor = chalk.green;
        statusText = 'completed';
        completed++;
      } else if (agent.status === 'running') {
        icon = this.getSpinner();
        statusColor = chalk.yellow;
        statusText = 'running';
        running++;
      } else if (agent.status === 'error') {
        icon = '✗';
        statusColor = chalk.red;
        statusText = 'error';
        errorCount++;
      } else {
        waiting++;
      }

      const agentDisplay = statusColor(`  ${icon} ${this.padRight(agent.name, 20)}`);
      let details = '';

      if (agent.status === 'completed' && agent.duration && agent.cost) {
        details = chalk.dim(`(${agent.duration.toFixed(1)}s, $${agent.cost.toFixed(4)})`);
      } else if (agent.status === 'running' && agent.duration) {
        details = chalk.yellow(`(${agent.duration.toFixed(1)}s elapsed...)`);
      } else if (agent.status === 'error') {
        details = chalk.red(`(${agent.error})`);
      }

      lines.push(`${agentDisplay} ${details}`);
    });

    lines.push('');

    // Progress summary
    const total = this.agents.size;
    const progressBar = this.getProgressBar(completed, total);
    lines.push(progressBar);

    // Statistics
    const stats = `Progress: ${completed}/${total} agents | Cost so far: $${this.totalCost.toFixed(4)} | Elapsed: ${elapsed.toFixed(1)}s`;
    lines.push(chalk.gray(stats));
    lines.push('');

    const output = lines.join('\n');

    // Only render if content changed
    if (output !== this.lastRendered) {
      this.clearLines(lines.length);
      process.stdout.write(output);
      this.lastRendered = output;
    }
  }

  /**
   * Get animated spinner character
   */
  private getSpinner(): string {
    const chars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const index = Math.floor((performance.now() / 100) % chars.length);
    return chars[index];
  }

  /**
   * Get progress bar
   */
  private getProgressBar(completed: number, total: number): string {
    const barLength = 30;
    const filledLength = Math.floor((completed / total) * barLength);
    const emptyLength = barLength - filledLength;
    const percentage = Math.floor((completed / total) * 100);

    const filled = '█'.repeat(filledLength);
    const empty = '░'.repeat(emptyLength);
    const bar = chalk.cyan(filled) + chalk.gray(empty);

    return `  [${bar}] ${percentage}%`;
  }

  /**
   * Pad string to right with spaces
   */
  private padRight(str: string, length: number): string {
    return str + ' '.repeat(Math.max(0, length - str.length));
  }

  /**
   * Clear previous lines from terminal
   */
  private clearLines(count: number): void {
    if (!this.isInteractive) return;
    // Move cursor up and clear
    for (let i = 0; i < count; i++) {
      process.stdout.write('\u001b[A\u001b[2K');
    }
  }

  /**
   * Stop rendering and return final output
   */
  stop(): string {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    const elapsed = (performance.now() - this.startTime) / 1000;
    const lines: string[] = [];

    lines.push('');
    lines.push(chalk.green(`✓ ${this.modeKeyword} Mode Complete`));
    lines.push('');

    // Summary of all agents
    this.agents.forEach((agent) => {
      if (agent.status === 'completed') {
        lines.push(chalk.green(`  ✓ ${this.padRight(agent.name, 20)} (${agent.duration?.toFixed(1)}s, $${agent.cost?.toFixed(4)})`));
      } else if (agent.status === 'error') {
        lines.push(chalk.red(`  ✗ ${this.padRight(agent.name, 20)} (${agent.error})`));
      }
    });

    lines.push('');
    lines.push(chalk.cyan(`  Total Cost: $${this.totalCost.toFixed(4)}`));
    lines.push(chalk.cyan(`  Total Time: ${elapsed.toFixed(1)}s`));
    lines.push('');

    return lines.join('\n');
  }
}
