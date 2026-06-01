/**
 * Configuration loader for roland
 * Handles loading, parsing, and validating configuration from YAML and environment variables
 */
import { AppConfig } from '../utils/types.js';
export declare class ConfigLoader {
    private static readonly DEFAULT_CONFIG_PATH;
    private static readonly ENV_PREFIX;
    /**
     * Load and validate configuration from YAML file and environment variables
     * Searches in multiple locations:
     * 1. Provided path or current directory (config.yaml)
     * 2. Roland installation directory
     * 3. User home directory (~/.roland/config.yaml)
     */
    static loadConfig(configPath?: string): Promise<AppConfig>;
    /**
     * Get alternative config paths to search
     */
    private static getAlternativeConfigPaths;
    /**
     * Load YAML configuration file
     */
    private static loadYamlFile;
    /**
     * Merge environment variables into configuration
     * Currently a no-op — Roland relies on IDE-provided models, no API keys needed.
     * Reserved for future provider integrations.
     */
    private static mergeEnvironmentVariables;
    /**
     * Validate configuration against schema
     */
    private static validateConfig;
    /**
     * Get a specific model from routing configuration
     */
    static getModel(config: AppConfig, complexity: 'local' | 'simple' | 'medium' | 'complex' | 'explain'): string;
    /**
     * Get all available models for a complexity level
     */
    static getModels(config: AppConfig, complexity: 'local' | 'simple' | 'medium' | 'complex' | 'explain'): string[];
    /**
     * Check if an environment variable is set for a given key name
     */
    static hasEnvKey(name: string): boolean;
}
/**
 * Load configuration (cached on first call)
 */
export declare function loadConfig(configPath?: string): Promise<AppConfig>;
/**
 * Clear cached configuration
 */
export declare function clearConfigCache(): void;
/**
 * Get the cached configuration (returns null if not loaded)
 */
export declare function getConfig(): AppConfig | null;
//# sourceMappingURL=config-loader.d.ts.map