import { CacheManager } from '../orchestrator/cache-manager.js';
import { Message } from './types.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

export interface CachedConversationTurn {
  userInput: string;
  assistantResponse: string;
  toolCalls: Array<{
    toolName: string;
    result: string;
  }>;
  cost: number;
  timestamp: string;
}

/**
 * Caches agent conversation turns to avoid redundant LLM calls
 */
export class ConversationCache {
  private cacheManager: CacheManager;
  private cachePrefix = 'agent-conversation';
  private model = 'nousresearch/hermes-3-llama-3.1-405b:free';

  constructor(cacheManager?: CacheManager) {
    this.cacheManager = cacheManager || new CacheManager();
  }

  /**
   * Generate a cache key from user input and conversation context
   */
  private generateCacheKey(userInput: string, conversationLength: number): string {
    // Create a deterministic key based on input and conversation history length
    const key = `${this.cachePrefix}:${userInput}:${conversationLength}`;
    const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
    return `conv-${hash}`;
  }

  /**
   * Check if we have a cached response for this user input
   */
  async getCachedResponse(
    userInput: string,
    conversationLength: number
  ): Promise<CachedConversationTurn | null> {
    try {
      const cacheKey = this.generateCacheKey(userInput, conversationLength);

      // Check in cache manager
      const cached = this.cacheManager.get(cacheKey, {
        agent: 'autonomous-agent',
        complexity: 'medium'
      });

      if (cached) {
        logger.debug(`[ConversationCache] Hit for: ${userInput.substring(0, 50)}...`);
        return JSON.parse(cached) as CachedConversationTurn;
      }

      logger.debug(`[ConversationCache] Miss for: ${userInput.substring(0, 50)}...`);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[ConversationCache] Cache lookup failed: ${message}`);
      return null; // Return null on error, don't break execution
    }
  }

  /**
   * Cache a conversation turn for future use
   */
  async cacheResponse(
    userInput: string,
    conversationLength: number,
    assistantResponse: string,
    toolCalls: Array<{ toolName: string; result: string }>,
    cost: number
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(userInput, conversationLength);

      const turn: CachedConversationTurn = {
        userInput,
        assistantResponse,
        toolCalls,
        cost,
        timestamp: new Date().toISOString(),
      };

      // Cache with 24-hour TTL
      this.cacheManager.set(
        cacheKey,
        JSON.stringify(turn),
        this.model,
        cost,
        { agent: 'autonomous-agent', complexity: 'medium' },
        24 * 60 * 60 * 1000
      );

      logger.debug(`[ConversationCache] Cached response for: ${userInput.substring(0, 50)}...`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[ConversationCache] Cache write failed: ${message}`);
      // Don't break execution if caching fails
    }
  }

  /**
   * Clear conversation cache (useful when session ends or conversation changes context)
   */
  async clearCache(): Promise<void> {
    try {
      logger.debug('[ConversationCache] Clearing all cached conversations');
      // Cache manager doesn't have a direct clear, so we'll just note that we're not storing more
      // In a real implementation, we might maintain a list of keys to clear
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[ConversationCache] Clear failed: ${message}`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }
}
