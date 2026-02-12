/**
 * Configuration loader for roland
 * Handles loading, parsing, and validating configuration from YAML and environment variables
 */

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { z } from 'zod';
import { AppConfig, RoutingConfig, SessionConfig } from '../utils/types.js';
import {
  ConfigError,
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Zod Schemas for Configuration Validation
// ============================================================================

const RoutingConfigSchema = z.object({
  simple: z.array(z.string()).min(1),
  medium: z.array(z.string()).min(1),
  complex: z.array(z.string()).min(1),
  explain: z.array(z.string()).min(1),
});

const SessionDefaultsSchema = z.object({
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().min(1).default(2000),
});

const SessionConfigSchema = z.object({
  mcp_defaults: SessionDefaultsSchema,
});

const AppConfigSchema = z.object({
  routing: RoutingConfigSchema,
  roland: SessionConfigSchema,
});

// ============================================================================
// Configuration Loader
// ============================================================================

export class ConfigLoader {
  private static readonly DEFAULT_CONFIG_PATH = 'config.yaml';
  private static readonly ENV_PREFIX = 'ROLAND_';

  /**
   * Load and validate configuration from YAML file and environment variables
   * Searches in multiple locations:
   * 1. Provided path or current directory (config.yaml)
   * 2. Roland installation directory
   * 3. User home directory (~/.roland/config.yaml)
   */
  static async loadConfig(configPath?: string): Promise<AppConfig> {
    try {
      let resolvedPath = configPath || this.DEFAULT_CONFIG_PATH;
      
      logger.debug(`[ConfigLoader] Searching for config at: ${resolvedPath}`);
      
      // If default path doesn't exist, try other locations
      if (!fs.existsSync(resolvedPath)) {
        logger.debug(`[ConfigLoader] Config not found at ${resolvedPath}, searching alternatives...`);
        const alternativePaths = this.getAlternativeConfigPaths();
        logger.debug(`[ConfigLoader] Searching paths: ${alternativePaths.join(', ')}`);
        
        for (const altPath of alternativePaths) {
          logger.debug(`[ConfigLoader] Trying: ${altPath}`);
          if (fs.existsSync(altPath)) {
            resolvedPath = altPath;
            logger.debug(`[ConfigLoader] Found config at: ${altPath}`);
            break;
          }
        }
      }

      logger.debug(`Loading configuration from: ${resolvedPath}`);

      // Read YAML file
      const config = this.loadYamlFile(resolvedPath);

      // Merge environment variables
      this.mergeEnvironmentVariables(config);

      // Validate configuration
      const validatedConfig = this.validateConfig(config);

      // Add config path for reference
      validatedConfig.configPath = resolvedPath;

      logger.debug('✅ Configuration loaded and validated');
      return validatedConfig;
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      throw new ConfigError(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get alternative config paths to search
   */
  private static getAlternativeConfigPaths(): string[] {
    const paths: string[] = [];

    // Try roland package installation directory
    // When installed globally, config will be in node_modules/roland/dist/
    try {
      const currentFile = new URL(import.meta.url).pathname;
      // Handle Windows paths that start with /C:/...
      const normalizedPath = currentFile.startsWith('/') && currentFile[2] === ':' 
        ? currentFile.slice(1) 
        : currentFile;
      
      const currentDir = path.dirname(normalizedPath);
      paths.push(path.join(currentDir, 'config.yaml'));
      paths.push(path.join(currentDir, '..', 'config.yaml'));
      
      // Also try the dist directory specifically
      const distDir = path.join(currentDir, '..');
      paths.push(path.join(distDir, 'config.yaml'));
    } catch (e) {
      // Fallback if URL parsing fails
    }

    // Try user home directory
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (homeDir) {
      paths.push(path.join(homeDir, '.roland', 'config.yaml'));
      paths.push(path.join(homeDir, '.config', 'roland', 'config.yaml'));
    }

    return paths;
  }

  /**
   * Load YAML configuration file
   */
  private static loadYamlFile(filePath: string): Record<string, unknown> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new ConfigNotFoundError(filePath);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const config = YAML.parse(content);

      if (!config || typeof config !== 'object') {
        throw new ConfigParseError('Configuration file is empty or invalid YAML');
      }

      return config as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new ConfigParseError(error.message, { filePath });
      }
      throw new ConfigParseError('Unknown error reading configuration file', { filePath });
    }
  }

  /**
   * Merge environment variables into configuration
   * Currently a no-op — Roland relies on IDE-provided models, no API keys needed.
   * Reserved for future provider integrations.
   */
  private static mergeEnvironmentVariables(_config: Record<string, unknown>): void {
    // No API keys needed — routing is advisory and the IDE handles model access.
  }

  /**
   * Validate configuration against schema
   */
  private static validateConfig(config: Record<string, unknown>): AppConfig {
    try {
      const result = AppConfigSchema.parse(config);
      return result as AppConfig;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(
          (e) => `${e.path.join('.')}: ${e.message}`
        );
        throw new ConfigValidationError(errors);
      }
      throw new ConfigValidationError(['Unknown validation error']);
    }
  }

  /**
   * Get a specific model from routing configuration
   */
  static getModel(config: AppConfig, complexity: 'simple' | 'medium' | 'complex' | 'explain'): string {
    const models = config.routing[complexity];
    if (!models || models.length === 0) {
      throw new ConfigError(`No models configured for complexity: ${complexity}`);
    }
    return models[0]; // Return first (cheapest) model
  }

  /**
   * Get all available models for a complexity level
   */
  static getModels(config: AppConfig, complexity: 'simple' | 'medium' | 'complex' | 'explain'): string[] {
    const models = config.routing[complexity];
    if (!models) {
      return [];
    }
    return models;
  }

  /**
   * Check if an environment variable is set for a given key name
   */
  static hasEnvKey(name: string): boolean {
    const value = process.env[`${this.ENV_PREFIX}${name.toUpperCase()}`];
    return Boolean(value && value.trim());
  }
}

// ============================================================================
// Singleton instance and export function
// ============================================================================

let cachedConfig: AppConfig | null = null;

/**
 * Load configuration (cached on first call)
 */
export async function loadConfig(configPath?: string): Promise<AppConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = await ConfigLoader.loadConfig(configPath);
  return cachedConfig;
}

/**
 * Clear cached configuration
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Get the cached configuration (returns null if not loaded)
 */
export function getConfig(): AppConfig | null {
  return cachedConfig;
}
