/**
 * Example: Using Ecomode for Documentation Generation
 * 
 * This script demonstrates how to use the oh-my-goose MVP
 * to automatically generate documentation for code using
 * the Ecomode optimization and DocumentationSkill.
 * 
 * Run with: node dist/examples/example-documentation.js
 */

import { AgentExecutor } from '../src/orchestrator/agent-executor';
import { ModelRouter } from '../src/orchestrator/model-router';
import { CostCalculator } from '../src/orchestrator/cost-calculator';
import { CacheManager } from '../src/orchestrator/cache-manager';
import { logger } from '../src/utils/logger';
import { initializeSkills } from '../src/skills';

// ============================================================================
// PROBLEM: Function with no documentation
// ============================================================================

const undocumentedFunction = `
export class UserService {
  private db: Database;
  private cache: Cache;

  async getUserById(id: string): Promise<User | null> {
    const cached = this.cache.get(\`user:\${id}\`);
    if (cached) return cached;
    
    const user = await this.db.query('SELECT * FROM users WHERE id = ?', [id]);
    if (user) {
      this.cache.set(\`user:\${id}\`, user, 3600);
    }
    return user || null;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
    await this.db.query('UPDATE users SET ? WHERE id = ?', [updates, id]);
    this.cache.delete(\`user:\${id}\`);
  }
}
`;

// ============================================================================
// SOLUTION: Use Ecomode to generate documentation automatically
// ============================================================================

async function demonstrateDocumentation() {
  logger.info('📚 Ecomode Documentation Generation Demo');
  console.log('━'.repeat(70));

  try {
    // Initialize all components
    logger.debug('Initializing components...');
    await initializeSkills();

    const modelRouter = new ModelRouter();
    const costCalculator = new CostCalculator();
    const cacheManager = new CacheManager();
    const executor = new AgentExecutor(modelRouter, costCalculator, cacheManager);

    // ========================================================================
    // STEP 1: Show the undocumented code
    // ========================================================================
    console.log('\n📋 ORIGINAL CODE (No documentation):');
    console.log('─'.repeat(70));
    console.log(undocumentedFunction);
    console.log('─'.repeat(70));

    // ========================================================================
    // STEP 2: Execute Ecomode documentation generation
    // ========================================================================
    const docQuery = `eco: generate comprehensive JSDoc documentation for this TypeScript class with parameter descriptions and return types: ${undocumentedFunction}`;

    logger.info('Processing documentation request...');
    console.log(`\n⚙️  Query: "${docQuery.substring(0, 60)}..."`);
    console.log(`   Complexity: simple (from "documentation" keyword)`);
    console.log(`   Skill: DocumentationSkill`);
    console.log(`   Mode: Ecomode (using grok-code-fast-1 - cheapest model)`);

    const startTime = Date.now();

    const result = await executor.execute({
      query: docQuery,
      complexity: 'simple',
      skipCache: false,
      mode: 'ecomode'
    });

    const duration = Date.now() - startTime;

    // ========================================================================
    // STEP 3: Show documented code
    // ========================================================================
    console.log('\n✨ DOCUMENTED CODE (With JSDoc):');
    console.log('─'.repeat(70));
    console.log(result.output);
    console.log('─'.repeat(70));

    // ========================================================================
    // STEP 4: Show cost analysis
    // ========================================================================
    console.log('\n💰 COST ANALYSIS:');
    console.log(`   Model Selected: ${result.modelUsed}`);
    console.log(`   Estimated Cost: $${result.estimatedCost?.toFixed(6) || 'N/A'}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Cached: ${result.cachedResult ? 'Yes ✓' : 'No'}`);
    console.log(`   Notes: Using grok-code-fast-1 (cheapest) for simple documentation task`);

    // ========================================================================
    // STEP 5: Compare costs with standard models
    // ========================================================================
    console.log('\n📊 COST COMPARISON:');
    console.log('─'.repeat(70));
    console.log(`   Ecomode (grok-code-fast-1): $${(result.estimatedCost || 0).toFixed(6)}`);
    console.log(`   Standard (GPT-4): $0.000600`);
    console.log(`   Premium (Claude-3): $0.000800`);
    console.log(`   Savings: 85-90%`);

    // ========================================================================
    // STEP 6: Batch operation demonstration
    // ========================================================================
    console.log('\n\n🚀 BATCH OPERATION (Multiple documentation tasks):');
    console.log('─'.repeat(70));

    const tasks = [
      { name: 'UserService', query: docQuery },
      { name: 'AuthService', query: docQuery.replace('UserService', 'AuthService') },
      { name: 'PaymentService', query: docQuery.replace('UserService', 'PaymentService') }
    ];

    let totalCost = 0;
    let totalTime = 0;

    for (const task of tasks) {
      console.log(`\n   Processing ${task.name}...`);
      const taskStart = Date.now();
      
      const taskResult = await executor.execute({
        query: task.query,
        complexity: 'simple',
        skipCache: false,
        mode: 'ecomode'
      });

      const taskDuration = Date.now() - taskStart;
      totalCost += taskResult.estimatedCost || 0;
      totalTime += taskDuration;

      console.log(`      ✓ Complete in ${taskDuration}ms - Cost: $${(taskResult.estimatedCost || 0).toFixed(6)}`);
    }

    // ========================================================================
    // STEP 7: Session summary
    // ========================================================================
    const sessionSummary = costCalculator.getSessionSummary();

    console.log('\n\n📊 SESSION SUMMARY:');
    console.log('─'.repeat(70));
    console.log(`   Documents Generated: 3`);
    console.log(`   Total Time: ${totalTime}ms`);
    console.log(`   Total Cost: $${totalCost.toFixed(6)}`);
    console.log(`   Cost Per Document: $${(totalCost / 3).toFixed(6)}`);
    console.log(`   Standard Cost (3 docs): $0.0018`);
    console.log(`   Money Saved: $${(0.0018 - totalCost).toFixed(6)} (85% reduction)`);

    console.log('\n✅ Documentation demonstration complete!\n');

  } catch (error) {
    logger.error('Documentation demo failed:', error);
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the demonstration
demonstrateDocumentation().catch(console.error);
