import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { SessionConfig } from './types.js';

export interface FileToolsConfig {
  workspaceDirectory: string;
  config: SessionConfig;
  onConfirmation?: (action: string) => Promise<boolean>;
}

/**
 * Validates that the file path is within the workspace directory
 */
function validatePath(filePath: string, workspaceDirectory: string): boolean {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceDirectory, filePath);
  const normalized = path.normalize(absolutePath);
  const workspace = path.normalize(workspaceDirectory);
  return normalized.startsWith(workspace);
}

/**
 * Normalizes the file path to be absolute or relative to workspace
 */
function normalizePath(filePath: string, workspaceDirectory: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(workspaceDirectory, filePath);
}

export class FileTools {
  private config: FileToolsConfig;

  constructor(config: FileToolsConfig) {
    this.config = config;
  }

  /**
   * Read file contents
   */
  async readFile(filePath: string): Promise<string> {
    try {
      if (!validatePath(filePath, this.config.workspaceDirectory)) {
        throw new Error(`Access denied: ${filePath} is outside workspace directory`);
      }

      const fullPath = normalizePath(filePath, this.config.workspaceDirectory);
      logger.info(`Reading file: ${fullPath}`);

      const contents = await fs.readFile(fullPath, 'utf-8');
      return contents;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to read file ${filePath}: ${message}`);
      throw error;
    }
  }

  /**
   * Write file contents (with optional confirmation)
   */
  async writeFile(filePath: string, contents: string): Promise<void> {
    try {
      if (!validatePath(filePath, this.config.workspaceDirectory)) {
        throw new Error(`Access denied: ${filePath} is outside workspace directory`);
      }

      const fullPath = normalizePath(filePath, this.config.workspaceDirectory);

      // Check if file exists
      let exists = false;
      try {
        await fs.access(fullPath);
        exists = true;
      } catch {
        exists = false;
      }

      // Request confirmation if configured or file exists
      if ((this.config.config.autoConfirm?.files !== true && exists) || 
          (exists && !this.config.config.autoConfirm?.files)) {
        if (this.config.onConfirmation) {
          const confirmed = await this.config.onConfirmation(
            `Overwrite existing file: ${filePath}?`
          );
          if (!confirmed) {
            throw new Error(`Write cancelled by user: ${filePath}`);
          }
        }
      }

      logger.info(`Writing file: ${fullPath}`);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, contents, 'utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to write file ${filePath}: ${message}`);
      throw error;
    }
  }

  /**
   * Edit file (read, modify, write)
   */
  async editFile(
    filePath: string,
    oldContent: string,
    newContent: string
  ): Promise<{ success: boolean; result: string }> {
    try {
      if (!validatePath(filePath, this.config.workspaceDirectory)) {
        throw new Error(`Access denied: ${filePath} is outside workspace directory`);
      }

      const fullPath = normalizePath(filePath, this.config.workspaceDirectory);

      logger.info(`Editing file: ${fullPath}`);
      const currentContent = await fs.readFile(fullPath, 'utf-8');

      if (!currentContent.includes(oldContent)) {
        throw new Error(`Old content not found in file: ${filePath}`);
      }

      // Request confirmation if configured
      if (this.config.config.autoConfirm?.files !== true) {
        if (this.config.onConfirmation) {
          const confirmed = await this.config.onConfirmation(
            `Edit file: ${filePath}?`
          );
          if (!confirmed) {
            throw new Error(`Edit cancelled by user: ${filePath}`);
          }
        }
      }

      const updatedContent = currentContent.replace(oldContent, newContent);
      await fs.writeFile(fullPath, updatedContent, 'utf-8');

      return {
        success: true,
        result: `Successfully edited ${filePath}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to edit file ${filePath}: ${message}`);
      throw error;
    }
  }

  /**
   * List files in directory
   */
  async listFiles(dirPath: string = ''): Promise<string[]> {
    try {
      const fullPath = normalizePath(dirPath || '.', this.config.workspaceDirectory);

      if (!validatePath(fullPath, this.config.workspaceDirectory)) {
        throw new Error(`Access denied: ${dirPath} is outside workspace directory`);
      }

      logger.info(`Listing files: ${fullPath}`);

      const files = await fs.readdir(fullPath);
      return files.sort();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to list files ${dirPath}: ${message}`);
      throw error;
    }
  }

  /**
   * Get file info (exists, size, type)
   */
  async getFileInfo(filePath: string): Promise<{
    exists: boolean;
    isFile?: boolean;
    isDirectory?: boolean;
    size?: number;
  }> {
    try {
      if (!validatePath(filePath, this.config.workspaceDirectory)) {
        throw new Error(`Access denied: ${filePath} is outside workspace directory`);
      }

      const fullPath = normalizePath(filePath, this.config.workspaceDirectory);

      let exists = false;
      try {
        await fs.access(fullPath);
        exists = true;
      } catch {
        exists = false;
      }

      if (!exists) {
        return { exists: false };
      }

      const stats = await fs.stat(fullPath);

      return {
        exists: true,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get file info ${filePath}: ${message}`);
      throw error;
    }
  }

  /**
   * Delete file (with confirmation)
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      if (!validatePath(filePath, this.config.workspaceDirectory)) {
        throw new Error(`Access denied: ${filePath} is outside workspace directory`);
      }

      const fullPath = normalizePath(filePath, this.config.workspaceDirectory);

      let exists = false;
      try {
        await fs.access(fullPath);
        exists = true;
      } catch {
        exists = false;
      }

      if (!exists) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      // Request confirmation - always ask for delete
      if (this.config.onConfirmation) {
        const confirmed = await this.config.onConfirmation(
          `Delete file: ${filePath}?`
        );
        if (!confirmed) {
          throw new Error(`Delete cancelled by user: ${filePath}`);
        }
      }

      logger.info(`Deleting file: ${fullPath}`);
      await fs.unlink(fullPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to delete file ${filePath}: ${message}`);
      throw error;
    }
  }
}
