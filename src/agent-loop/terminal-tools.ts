import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { logger } from '../utils/logger';
import { SessionConfig } from './types';

const execAsync = promisify(exec);

// Commands that are too risky and should be blocked
const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'dd if=',
  'format',
  'fdisk',
  'mkfs',
  ':(){:|:&};:',
  'fork bomb',
  'rm -rf',
];

// Commands that require explicit confirmation
const RISKY_COMMANDS = [
  'rm',
  'delete',
  'rmdir',
  'uninstall',
  'kill',
  'pkill',
  'systemctl stop',
  'service stop',
  'npm uninstall',
  'pip uninstall',
  'apt-get remove',
];

// Safe commands that don't need confirmation
const SAFE_COMMANDS = [
  'ls',
  'dir',
  'pwd',
  'cat',
  'grep',
  'echo',
  'git',
  'npm run',
  'npm test',
  'npm build',
  'python',
  'node',
  'tsc',
  'eslint',
  'prettier',
  'yarn',
];

export interface TerminalToolsConfig {
  workspaceDirectory: string;
  config: SessionConfig;
  onConfirmation?: (action: string) => Promise<boolean>;
  maxCommands?: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
}

/**
 * Checks if a command is dangerous
 */
function isDangerousCommand(command: string): boolean {
  const normalized = command.toLowerCase().trim();
  return DANGEROUS_COMMANDS.some((dangerous) => normalized.includes(dangerous));
}

/**
 * Checks if a command requires confirmation
 */
function requiresConfirmation(command: string): boolean {
  const normalized = command.toLowerCase().trim();

  // Dangerous commands always require confirmation
  if (isDangerousCommand(command)) {
    return true;
  }

  // Check if it's a risky command
  const isRisky = RISKY_COMMANDS.some((risky) => normalized.startsWith(risky));
  if (isRisky) {
    return true;
  }

  // Check if it's a known safe command
  const isSafe = SAFE_COMMANDS.some((safe) => normalized.startsWith(safe));
  if (isSafe) {
    return false;
  }

  // Unknown commands require confirmation
  return true;
}

export class TerminalTools {
  private config: TerminalToolsConfig;
  private commandCount: number = 0;

  constructor(config: TerminalToolsConfig) {
    this.config = config;
  }

  /**
   * Get the number of commands executed in this session
   */
  getCommandCount(): number {
    return this.commandCount;
  }

  /**
   * Reset command counter
   */
  resetCommandCount(): void {
    this.commandCount = 0;
  }

  /**
   * Execute a terminal command with safety checks
   */
  async executeCommand(command: string): Promise<CommandResult> {
    try {
      // Check max commands limit
      const maxCommands = this.config.maxCommands || 10;
      if (this.commandCount >= maxCommands) {
        throw new Error(
          `Command limit reached (${maxCommands} max). Current: ${this.commandCount}`
        );
      }

      // Check for dangerous commands
      if (isDangerousCommand(command)) {
        throw new Error(`Dangerous command blocked: ${command}`);
      }

      // Check for confirmation requirement
      const needsConfirmation = requiresConfirmation(command);

      if (needsConfirmation && this.config.config.autoConfirm?.terminal !== true) {
        if (this.config.onConfirmation) {
          const confirmed = await this.config.onConfirmation(`Execute command: ${command}?`);
          if (!confirmed) {
            throw new Error(`Command cancelled by user: ${command}`);
          }
        }
      }

      logger.info(`Executing command: ${command}`);

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.config.workspaceDirectory,
        timeout: 30000, // 30 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      this.commandCount++;

      const result: CommandResult = {
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };

      logger.info(`Command executed successfully: ${command}`);
      return result;
    } catch (error) {
      this.commandCount++;

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Command failed: ${command} - ${errorMessage}`);

      if (error instanceof Error && 'code' in error) {
        return {
          command,
          stdout: (error as any).stdout?.trim() || '',
          stderr: (error as any).stderr?.trim() || errorMessage,
          exitCode: (error as any).code || 1,
        };
      }

      throw error;
    }
  }

  /**
   * Execute command and return just stdout
   */
  async run(command: string): Promise<string> {
    const result = await this.executeCommand(command);
    if (result.exitCode !== 0) {
      throw new Error(`Command failed with exit code ${result.exitCode}: ${result.stderr}`);
    }
    return result.stdout;
  }

  /**
   * Get current working directory
   */
  async getPwd(): Promise<string> {
    return this.run('pwd');
  }

  /**
   * List directory contents
   */
  async ls(dirPath?: string): Promise<string> {
    const cmd = dirPath ? `ls -la "${dirPath}"` : 'ls -la';
    return this.run(cmd);
  }

  /**
   * Get file contents
   */
  async cat(filePath: string): Promise<string> {
    return this.run(`cat "${filePath}"`);
  }

  /**
   * Search for text in files
   */
  async grep(pattern: string, dirPath?: string): Promise<string> {
    const dir = dirPath ? `"${dirPath}"` : '.';
    return this.run(`grep -r "${pattern}" ${dir}`);
  }

  /**
   * Run npm command
   */
  async npm(args: string[]): Promise<string> {
    return this.run(`npm ${args.join(' ')}`);
  }

  /**
   * Run git command
   */
  async git(args: string[]): Promise<string> {
    return this.run(`git ${args.join(' ')}`);
  }

  /**
   * Check command safety without executing
   */
  checkCommandSafety(command: string): {
    safe: boolean;
    requiresConfirmation: boolean;
    reason?: string;
  } {
    if (isDangerousCommand(command)) {
      return {
        safe: false,
        requiresConfirmation: true,
        reason: 'Command is dangerous and will be blocked',
      };
    }

    const needsConfirmation = requiresConfirmation(command);

    return {
      safe: true,
      requiresConfirmation: needsConfirmation,
      reason: needsConfirmation ? 'Command requires user confirmation' : undefined,
    };
  }
}
