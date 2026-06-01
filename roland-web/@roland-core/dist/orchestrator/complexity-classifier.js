/**
 * Query Complexity Classifier
 *
 * Analyzes queries to determine complexity and required model tier
 * Uses multiple heuristics:
 * - Token count estimation
 * - Keyword analysis (architecture, design, analyze, etc.)
 * - Multi-step task detection
 * - Context size indicators
 * - Domain-specific complexity
 */
import https from 'https';
import { logger } from '../utils/logger.js';
// Module-level cache for semantic classification results
const semanticCache = new Map();
const VALID_TIERS = new Set(['local', 'simple', 'medium', 'complex']);
const SEMANTIC_SYSTEM_PROMPT = `Classify the coding task complexity. Respond with ONLY one word: local, simple, medium, or complex.

local: trivial fix — typo, rename, add/remove import, fix comma, formatting
simple: clear single-file task, obvious approach
medium: multi-file changes, some ambiguity, needs project context
complex: architecture, security, multi-step reasoning, system design`;
/**
 * Make a POST request using Node's built-in https module.
 * Returns the response body as a string, or rejects on error/timeout.
 */
function httpsPost(url, body, headers, timeoutMs) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                ...headers,
            },
        };
        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
            res.on('error', reject);
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
/**
 * Call OpenRouter with a free model to semantically classify query complexity.
 * Returns a ComplexityAnalysis if successful, or null on any failure.
 */
export async function semanticClassify(query, config) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey)
        return null;
    const classifierCfg = config?.classifier;
    const enabled = classifierCfg?.semantic_enabled ?? true;
    if (!enabled)
        return null;
    const freeModel = classifierCfg?.semantic_model ?? 'qwen/qwen3-coder:free';
    const timeoutMs = classifierCfg?.semantic_timeout_ms ?? 3000;
    const cacheTtlMs = classifierCfg?.cache_ttl_ms ?? 300000;
    // Cache lookup — use first 200 chars as key
    const cacheKey = query.slice(0, 200);
    const cached = semanticCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheTtlMs) {
        return cached.result;
    }
    try {
        const postData = JSON.stringify({
            model: freeModel,
            messages: [
                { role: 'system', content: SEMANTIC_SYSTEM_PROMPT },
                { role: 'user', content: query },
            ],
            max_tokens: 10,
            temperature: 0,
        });
        const responseText = await httpsPost('https://openrouter.ai/api/v1/chat/completions', postData, {
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/AdamMcIntosh/roland',
            'X-Title': 'Roland MCP',
        }, timeoutMs);
        const json = JSON.parse(responseText);
        const rawContent = json.choices?.[0]?.message?.content ?? '';
        const tier = rawContent.toLowerCase().trim().split(/\s/)[0];
        if (!VALID_TIERS.has(tier)) {
            logger.info(`[Classifier] semantic returned invalid tier "${tier}", falling back to heuristic`);
            return null;
        }
        const complexity = tier;
        const result = {
            complexity,
            score: 0, // Semantic classifier doesn't produce a numeric score
            factors: [{ name: 'Semantic Classification', weight: 100, detected: true }],
            tokenEstimate: Math.ceil(query.length / 4),
            suggestedModel: ComplexityClassifier['suggestModel'](complexity, 0),
        };
        semanticCache.set(cacheKey, { result, timestamp: Date.now() });
        return result;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.info(`[Classifier] semantic error: ${msg}, falling back to heuristic`);
        return null;
    }
}
/**
 * Async entry point that tries semantic classification first,
 * then falls back to the keyword heuristic.
 */
export async function classifyWithSemantic(query, config) {
    const semantic = await semanticClassify(query, config);
    if (semantic) {
        logger.info(`[Classifier] semantic: ${semantic.complexity}`);
        return semantic;
    }
    const heuristic = ComplexityClassifier.getDetailedAnalysis(query);
    logger.info(`[Classifier] heuristic fallback: ${heuristic.complexity}`);
    return heuristic;
}
export class ComplexityClassifier {
    /**
     * Complexity keywords that suggest higher tier
     */
    static COMPLEX_KEYWORDS = {
        architecture: 15,
        design: 12,
        analyze: 10,
        implement: 8,
        refactor: 7,
        optimize: 8,
        debug: 6,
        'performance': 8,
        'security': 10,
        'scalability': 10,
        'deployment': 8,
        'testing': 7,
        'infrastructure': 12,
        'distributed': 15,
        'machine learning': 15,
        'algorithm': 12,
        'data pipeline': 12,
        'real-time': 10,
        'concurrent': 10,
        'asynchronous': 8,
    };
    /**
     * Trivial task keywords — reduce score toward local tier
     */
    static TRIVIAL_KEYWORDS = [
        'rename',
        'typo',
        'fix import',
        'add comma',
        'remove unused',
        'fix typo',
        'spelling',
        'whitespace',
        'formatting',
        'lint',
    ];
    /**
     * Multi-step task indicators
     */
    static MULTISTEP_KEYWORDS = [
        'first',
        'then',
        'after',
        'next',
        'finally',
        'and then',
        'once',
        'when done',
        'before',
        'step',
        '1.',
        '2.',
        '->',
        '→',
    ];
    /**
     * Analyze query complexity
     * Returns complexity level and detailed score
     */
    static analyzeQuery(query) {
        const factors = [];
        let score = 0;
        // Factor 1: Query length
        const lengthFactor = this.analyzeLengthFactor(query.length);
        factors.push(lengthFactor);
        score += lengthFactor.weight * (lengthFactor.detected ? 1 : 0);
        // Factor 2: Keyword complexity
        const keywordFactor = this.analyzeKeywordComplexity(query);
        factors.push(keywordFactor);
        score += keywordFactor.weight * (keywordFactor.detected ? 1 : 0);
        // Factor 3: Multi-step detection
        const multistepFactor = this.detectMultiStepTasks(query);
        factors.push(multistepFactor);
        score += multistepFactor.weight * (multistepFactor.detected ? 1 : 0);
        // Factor 4: Code complexity indicators
        const codeFactor = this.analyzeCodeComplexity(query);
        factors.push(codeFactor);
        score += codeFactor.weight * (codeFactor.detected ? 1 : 0);
        // Factor 5: Explanation depth
        const explanationFactor = this.analyzeExplanationDepth(query);
        factors.push(explanationFactor);
        score += explanationFactor.weight * (explanationFactor.detected ? 1 : 0);
        // Factor 6: Technical depth
        const technicalFactor = this.analyzeTechnicalDepth(query);
        factors.push(technicalFactor);
        score += technicalFactor.weight * (technicalFactor.detected ? 1 : 0);
        // Factor 7: Trivial task detection (reduces score)
        const trivialFactor = this.analyzeTrivialTask(query);
        factors.push(trivialFactor);
        score += trivialFactor.weight * (trivialFactor.detected ? 1 : 0); // weight is negative
        // Normalize score to 0-100
        const normalizedScore = Math.min(100, Math.max(0, Math.round((score / 100) * 100)));
        // Determine complexity level from score
        const complexity = this.scoreToComplexity(normalizedScore);
        // Estimate token count
        const tokenEstimate = this.estimateTokens(query);
        // Suggest best model for this complexity
        const suggestedModel = this.suggestModel(complexity, normalizedScore);
        return {
            complexity,
            score: normalizedScore,
            factors,
            tokenEstimate,
            suggestedModel,
        };
    }
    /**
     * Analyze query length as complexity indicator
     */
    static analyzeLengthFactor(length) {
        let weight = 0;
        let detected = false;
        if (length > 500) {
            weight = 20;
            detected = true;
        }
        else if (length > 200) {
            weight = 10;
            detected = true;
        }
        else if (length > 100) {
            weight = 5;
            detected = true;
        }
        return {
            name: 'Query Length',
            weight,
            detected,
        };
    }
    /**
     * Analyze keyword complexity
     */
    static analyzeKeywordComplexity(query) {
        const lower = query.toLowerCase();
        let maxWeight = 0;
        for (const [keyword, weight] of Object.entries(this.COMPLEX_KEYWORDS)) {
            if (lower.includes(keyword)) {
                maxWeight = Math.max(maxWeight, weight);
            }
        }
        return {
            name: 'Keyword Complexity',
            weight: maxWeight,
            detected: maxWeight > 0,
        };
    }
    /**
     * Detect if query contains multiple steps
     */
    static detectMultiStepTasks(query) {
        const lower = query.toLowerCase();
        let stepCount = 0;
        for (const keyword of this.MULTISTEP_KEYWORDS) {
            if (lower.includes(keyword)) {
                stepCount++;
            }
        }
        const detected = stepCount >= 2;
        const weight = Math.min(20, stepCount * 5);
        return {
            name: 'Multi-Step Tasks',
            weight,
            detected,
        };
    }
    /**
     * Analyze code complexity indicators
     */
    static analyzeCodeComplexity(query) {
        const codeIndicators = [
            { pattern: /```/g, weight: 5 }, // Code blocks
            { pattern: /\{.*\}/g, weight: 3 }, // Braces
            { pattern: /\[.*\]/g, weight: 2 }, // Brackets
            { pattern: /function|class|interface|type/gi, weight: 8 }, // Code structures
            { pattern: /async|await|promise/gi, weight: 5 }, // Async patterns
            { pattern: /error|exception|try|catch/gi, weight: 6 }, // Error handling
        ];
        let weight = 0;
        let detected = false;
        for (const indicator of codeIndicators) {
            const matches = query.match(indicator.pattern);
            if (matches) {
                weight += indicator.weight;
                detected = true;
            }
        }
        return {
            name: 'Code Complexity',
            weight: Math.min(25, weight),
            detected,
        };
    }
    /**
     * Analyze explanation depth requirements
     */
    static analyzeExplanationDepth(query) {
        const lower = query.toLowerCase();
        const explanationKeywords = [
            'explain',
            'why',
            'how',
            'describe',
            'detail',
            'walkthrough',
            'step by step',
            'elaborate',
        ];
        const found = explanationKeywords.filter((kw) => lower.includes(kw));
        const weight = found.length * 5;
        const detected = weight > 0;
        return {
            name: 'Explanation Depth',
            weight: Math.min(15, weight),
            detected,
        };
    }
    /**
     * Analyze technical depth of the query
     */
    static analyzeTechnicalDepth(query) {
        const technicalTerms = [
            'algorithm',
            'pattern',
            'protocol',
            'framework',
            'architecture',
            'microservices',
            'kubernetes',
            'docker',
            'database',
            'api',
            'rest',
            'graphql',
            'cache',
            'queue',
            'stream',
            'index',
            'transaction',
            'concurrency',
        ];
        let count = 0;
        for (const term of technicalTerms) {
            if (query.toLowerCase().includes(term)) {
                count++;
            }
        }
        const weight = count * 3;
        const detected = count >= 2;
        return {
            name: 'Technical Depth',
            weight: Math.min(20, weight),
            detected,
        };
    }
    /**
     * Detect trivial tasks that can be handled by a local model.
     * Returns a negative weight to push score toward the local tier.
     */
    static analyzeTrivialTask(query) {
        const lower = query.toLowerCase().trim();
        const isTrivialKeyword = this.TRIVIAL_KEYWORDS.some((kw) => lower.includes(kw));
        const isShort = query.length < 80;
        const detected = isTrivialKeyword && isShort;
        return {
            name: 'Trivial Task',
            weight: detected ? -20 : 0,
            detected,
        };
    }
    /**
     * Convert complexity score to level
     */
    static scoreToComplexity(score) {
        if (score < 15)
            return 'local';
        if (score < 30)
            return 'simple';
        if (score < 70)
            return 'medium';
        return 'complex';
    }
    /**
     * Estimate token count from query
     * Rough heuristic: ~4 characters per token
     */
    static estimateTokens(query) {
        return Math.ceil(query.length / 4);
    }
    /**
     * Suggest best IDE model for query complexity
     */
    static suggestModel(complexity, score) {
        // Map to IDE model recommendations (Cursor / VS Code compatible)
        const suggestions = {
            local: [
                'codellama:7b', // Local Ollama model — zero cost
            ],
            simple: [
                'cursor-small', // Fast, cheap — typo fixes, renames
                'gpt-4o-mini', // Good fallback
                'gemini-2.0-flash', // Fast alternative
            ],
            medium: [
                'deepseek-v3', // Best cost/quality balance
                'qwen3-coder-next', // Strong coding alternative
                'gemini-2.5-flash', // Fast fallback
            ],
            complex: [
                'deepseek-v3', // Strong reasoning at low cost
                'minimax-m2.5', // Near-Opus for architecture
                'qwen3-coder-next', // Capable coding fallback
            ],
        };
        return suggestions[complexity]?.[0] || 'cursor-small';
    }
    /**
     * Get complexity tier for routing
     * Useful for selecting from config routing tables
     */
    static getRoutingTier(query) {
        const analysis = this.analyzeQuery(query);
        return analysis.complexity;
    }
    /**
     * Get full analysis with all details
     */
    static getDetailedAnalysis(query) {
        return this.analyzeQuery(query);
    }
}
/**
 * Convenience function for quick complexity check
 */
export function classifyQueryComplexity(query) {
    const tier = ComplexityClassifier.getRoutingTier(query);
    // Map 'explain' to 'complex' for consistency with routing
    return tier === 'explain' ? 'complex' : tier;
}
//# sourceMappingURL=complexity-classifier.js.map