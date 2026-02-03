/**
 * HUD (Heads-Up Display) - Real-time status line for terminal
 * 
 * Shows live progress metrics during agent execution:
 * - Current operation
 * - Duration
 * - Tool calls
 * - Cost
 * - Model
 */

import chalk from 'chalk';
import { performance } from 'perf_hooks';

export interface HudMetrics {
  operation: string;
  model?: string;
  toolCalls?: number;
  maxToolCalls?: number;
  cost?: number;
  duration?: number;
  status?: 'running' | 'success' | 'error' | 'waiting';
  details?: string;
}

export class HudStatusLine {
  private enabled: boolean;
  private startTime: number;
  private lastLine: string;
  private updateInterval?: NodeJS.Timeout;
  private metrics: HudMetrics;
  private isInteractive: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled && process.stdout.isTTY;
    this.startTime = performance.now();
    this.lastLine = '';
    this.metrics = { operation: 'Initializing' };
    this.isInteractive = process.stdout.isTTY || false;
  }

  /**
   * Start the HUD with initial metrics
   */
  start(operation: string, model?: string): void {
    if (!this.enabled) return;

    this.startTime = performance.now();
    this.metrics = {
      operation,
      model,
      status: 'running',
      toolCalls: 0,
      cost: 0,
    };

    // Start auto-updating the display
    this.updateInterval = setInterval(() => {
      this.render();
    }, 100); // Update every 100ms

    this.render();
  }

  /**
   * Update metrics without re-rendering
   */
  update(updates: Partial<HudMetrics>): void {
    if (!this.enabled) return;
    this.metrics = { ...this.metrics, ...updates };
  }

  /**
   * Render the current status line
   */
  private render(): void {
    if (!this.enabled || !this.isInteractive) return;

    const duration = (performance.now() - this.startTime) / 1000;
    this.metrics.duration = duration;

    const line = this.formatStatusLine(this.metrics);

    // Clear previous line and write new one
    if (this.lastLine) {
      process.stdout.write('\r' + ' '.repeat(this.lastLine.length) + '\r');
    }
    process.stdout.write(line);
    this.lastLine = line;
  }

  /**
   * Format metrics into a single status line
   */
  private formatStatusLine(metrics: HudMetrics): string {
    const parts: string[] = [];

    // Status indicator
    const statusIcon = this.getStatusIcon(metrics.status || 'running');
    parts.push(statusIcon);

    // Operation
    parts.push(chalk.bold(metrics.operation));

    // Duration
    if (metrics.duration !== undefined) {
      const durationStr = metrics.duration.toFixed(1) + 's';
      parts.push(chalk.gray(`[${durationStr}]`));
    }

    // Model
    if (metrics.model) {
      parts.push(chalk.cyan(`${this.getModelShortName(metrics.model)}`));
    }

    // Tool calls
    if (metrics.toolCalls !== undefined) {
      const toolsStr = metrics.maxToolCalls
        ? `${metrics.toolCalls}/${metrics.maxToolCalls}`
        : `${metrics.toolCalls}`;
      parts.push(chalk.yellow(`🔧 ${toolsStr}`));
    }

    // Cost (with ~ prefix for estimates)
    if (metrics.cost !== undefined && metrics.cost > 0) {
      const costStr = `~$${metrics.cost.toFixed(4)}`;
      
      // Budget warnings
      if (metrics.cost > 5.0) {
        parts.push(chalk.red(`⚠️ ${costStr}`)); // Critical: >$5
      } else if (metrics.cost > 2.0) {
        parts.push(chalk.yellow(`⚠️ ${costStr}`)); // Warning: >$2
      } else {
        parts.push(chalk.green(costStr));
      }
    }

    // Additional details
    if (metrics.details) {
      parts.push(chalk.dim(metrics.details));
    }

    return parts.join(' ');
  }

  /**
   * Get status icon based on current status
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'running':
        return this.getSpinner();
      case 'success':
        return chalk.green('✓');
      case 'error':
        return chalk.red('✗');
      case 'waiting':
        return chalk.yellow('⏸');
      default:
        return '●';
    }
  }

  /**
   * Simple spinning animation
   */
  private getSpinner(): string {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const frameIndex = Math.floor(Date.now() / 80) % frames.length;
    return chalk.cyan(frames[frameIndex]);
  }

  /**
   * Shorten model names for display
   */
  private getModelShortName(model: string): string {
    const shortNames: Record<string, string> = {
      'claude-4-sonnet': 'Claude-S',
      'claude-opus': 'Claude-O',
      'gpt-4o': 'GPT-4o',
      'gpt-4-turbo': 'GPT-4T',
      'gemini-2.0-flash': 'Gemini-F',
      'grok-2': 'Grok-2',
    };
    return shortNames[model] || model;
  }

  /**
   * Stop the HUD and clear the line
   */
  stop(finalStatus?: 'success' | 'error'): void {
    if (!this.enabled) return;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }

    // Update to final status and render once more
    if (finalStatus) {
      this.metrics.status = finalStatus;
      this.render();
    }

    // Move to new line
    if (this.isInteractive && this.lastLine) {
      process.stdout.write('\n');
    }

    this.lastLine = '';
  }

  /**
   * Clear the current status line
   */
  clear(): void {
    if (!this.enabled || !this.isInteractive) return;

    if (this.lastLine) {
      process.stdout.write('\r' + ' '.repeat(this.lastLine.length) + '\r');
      this.lastLine = '';
    }
  }

  /**
   * Pause HUD updates (useful when outputting other content)
   */
  pause(): void {
    if (!this.enabled) return;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
  }

  /**
   * Resume HUD updates
   */
  resume(): void {
    if (!this.enabled) return;
    if (!this.updateInterval) {
      this.updateInterval = setInterval(() => {
        this.render();
      }, 100);
    }
  }

  /**
   * Check if HUD is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
