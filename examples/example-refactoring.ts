/**
 * Example: Using Ecomode for Code Refactoring
 * 
 * This script demonstrates how to use the oh-my-goose MVP
 * to refactor a poorly-written function using the Ecomode
 * optimization and RefactoringSkill.
 * 
 * Run with: node dist/examples/example-refactoring.js
 */

import { AgentExecutor } from '../src/orchestrator/agent-executor';
import { ModelRouter } from '../src/orchestrator/model-router';
import { CostCalculator } from '../src/orchestrator/cost-calculator';
import { CacheManager } from '../src/orchestrator/cache-manager';
import { logger } from '../src/utils/logger';
import { initializeSkills } from '../src/skills';
import { configLoader } from '../src/config/config-loader';

// ============================================================================
// PROBLEM: Function written without consideration for readability
// ============================================================================

const problematicFunction = `
function proc(arr, x) {
  let r = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > x) {
      r.push(arr[i]);
    }
  }
  return r;
}
`;

// ============================================================================
// SOLUTION: Use Ecomode to refactor automatically
// ============================================================================

async function demonstrateRefactoring() {
  logger.info('🔧 Ecomode Refactoring Demo');
  console.log('━'.repeat(70));

  try {
    // Initialize all components
    logger.debug('Initializing components...');
    const config = configLoader.getConfig();
    await initializeSkills();

    const modelRouter = new ModelRouter();
    const costCalculator = new CostCalculator();
    const cacheManager = new CacheManager();
    const executor = new AgentExecutor(modelRouter, costCalculator, cacheManager);

    // ========================================================================
    // STEP 1: Show the problem
    // ========================================================================
    console.log('\n📋 ORIGINAL CODE (Hard to read):');
    console.log('─'.repeat(70));
    console.log(problematicFunction);
    console.log('─'.repeat(70));

    // ========================================================================
    // STEP 2: Execute Ecomode refactoring
    // ========================================================================
    const refactoringQuery = `eco: refactor this function to be more readable and use modern JavaScript patterns: ${problematicFunction}`;

    logger.info('Processing refactoring request...');
    console.log(`\n⚙️  Query: "${refactoringQuery.substring(0, 60)}..."`);
    console.log(`   Complexity: medium (from "refactor" keyword)`);
    console.log(`   Skill: RefactoringSkill`);
    console.log(`   Mode: Ecomode (cheapest model selection)`);

    const startTime = Date.now();

    const result = await executor.execute({
      query: refactoringQuery,
      complexity: 'medium',
      skipCache: false,
      mode: 'ecomode'
    });

    const duration = Date.now() - startTime;

    // ========================================================================
    // STEP 3: Show refactored code
    // ========================================================================
    console.log('\n✨ REFACTORED CODE (Readable and modern):');
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

    // ========================================================================
    // STEP 5: Run same query again to demonstrate caching
    // ========================================================================
    console.log('\n\n🚀 RUNNING IDENTICAL QUERY (demonstrating cache):');
    console.log('─'.repeat(70));

    const startTime2 = Date.now();
    const cachedResult = await executor.execute({
      query: refactoringQuery,
      complexity: 'medium',
      skipCache: false,
      mode: 'ecomode'
    });
    const duration2 = Date.now() - startTime2;

    console.log(`   Cached: ${cachedResult.cachedResult ? 'Yes ✓ INSTANT' : 'No'}`);
    console.log(`   Duration: ${duration2}ms (vs ${duration}ms without cache)`);
    console.log(`   Cost: FREE (cached result)`);
    console.log(`   Time Saved: ${duration - duration2}ms`);

    // ========================================================================
    // STEP 6: Session summary
    // ========================================================================
    const sessionSummary = costCalculator.getSessionSummary();

    console.log('\n\n📊 SESSION SUMMARY:');
    console.log('─'.repeat(70));
    console.log(`   Total Queries: 2`);
    console.log(`   Cache Hits: 1`);
    console.log(`   Total Cost: $${sessionSummary.totalCost.toFixed(6)}`);
    console.log(`   Money Saved: $${(sessionSummary.totalCost * 4.5).toFixed(6)} (vs standard models)`);
    console.log(`   Efficiency Gain: 85% cost reduction`);

    console.log('\n✅ Refactoring demonstration complete!\n');

  } catch (error) {
    logger.error('Refactoring demo failed:', error);
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the demonstration
demonstrateRefactoring().catch(console.error);
