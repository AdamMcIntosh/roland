/**
 * File Gatherer — Smart context gathering for complex execution strategies.
 *
 * Identifies and bundles relevant file contents so subagents receive full
 * codebase context instead of having to re-explore from scratch.
 *
 * Pipeline: listProjectFiles → extractTaskKeywords → scoreFileRelevance
 *           → askLlmForRelevantFiles (optional) → bundleFileContents
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

export interface FileBundle {
  files: Array<{ path: string; content: string; sizeBytes: number }>;
  totalBytes: number;
  truncated: boolean;
}

export interface ContextGatheringConfig {
  enabled: boolean;
  max_files: number;
  max_bytes: number;
  llm_model: string;
  llm_timeout_ms: number;
  exclude_patterns: string[];
}

export const DEFAULT_CONTEXT_GATHERING_CONFIG: ContextGatheringConfig = {
  enabled: true,
  max_files: 15,
  max_bytes: 204800, // 200KB
  llm_model: 'qwen/qwen3-coder:free',
  llm_timeout_ms: 5000,
  exclude_patterns: ['*.lock', '*.min.js', '*.min.css', 'dist/**', 'node_modules/**', '*.map'],
};

// Binary/non-text extensions to always exclude
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.zip', '.tar', '.gz', '.bz2', '.7z',
  '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.wav', '.avi', '.mov',
  '.sqlite', '.db',
]);

// Stopwords for keyword extraction
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'that', 'this', 'are', 'was',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'not', 'no', 'so', 'if', 'then', 'than',
  'too', 'very', 'just', 'about', 'up', 'out', 'all', 'also', 'how', 'what',
  'when', 'where', 'which', 'who', 'why', 'add', 'use', 'make', 'like',
  'need', 'want', 'get', 'set', 'new', 'each', 'into', 'some', 'any',
  'code', 'file', 'files', 'change', 'update', 'create', 'implement',
  'following', 'existing', 'pattern', 'feature', 'explore', 'codebase',
]);

// ============================================================================
// Pipeline Functions
// ============================================================================

/**
 * List all tracked project files using git ls-files, filtering out binaries
 * and excluded patterns.
 */
export function listProjectFiles(excludePatterns: string[] = []): string[] {
  try {
    const output = execSync('git ls-files', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large repos
      timeout: 10000,
    });

    const files = output.trim().split('\n').filter(Boolean);

    return files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) return false;

      for (const pattern of excludePatterns) {
        if (matchGlob(file, pattern)) return false;
      }

      return true;
    });
  } catch (err) {
    logger.warn(`[FileGatherer] git ls-files failed: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Extract likely file/module name keywords from a task description.
 */
export function extractTaskKeywords(task: string): string[] {
  // Split on common delimiters
  const tokens = task
    .replace(/[^a-zA-Z0-9_\-./\\]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());

  const keywords: string[] = [];
  for (const token of tokens) {
    if (STOPWORDS.has(token)) continue;
    if (token.length < 2) continue;

    keywords.push(token);

    // Also add camelCase/PascalCase splits
    const camelParts = token.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
    if (camelParts.length > 1) {
      for (const part of camelParts) {
        if (part.length >= 2 && !STOPWORDS.has(part.toLowerCase())) {
          keywords.push(part.toLowerCase());
        }
      }
    }

    // Add hyphenated parts
    if (token.includes('-')) {
      for (const part of token.split('-')) {
        if (part.length >= 2 && !STOPWORDS.has(part)) {
          keywords.push(part);
        }
      }
    }
  }

  return [...new Set(keywords)];
}

/**
 * Score a file's relevance to the task based on keyword matching.
 */
export function scoreFileRelevance(filePath: string, keywords: string[]): number {
  const lowerPath = filePath.toLowerCase();
  const fileName = path.basename(lowerPath, path.extname(lowerPath));
  const dirParts = path.dirname(lowerPath).split(/[/\\]/).filter(Boolean);

  let score = 0;
  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();

    // Exact filename match (strongest signal)
    if (fileName === kw || fileName.includes(kw)) {
      score += 10;
    }

    // Directory match
    if (dirParts.some((d) => d === kw || d.includes(kw))) {
      score += 3;
    }

    // Path contains keyword anywhere
    if (lowerPath.includes(kw) && score === 0) {
      score += 1;
    }
  }

  // Boost source files over configs/docs
  const ext = path.extname(lowerPath);
  if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go'].includes(ext)) {
    score += 1;
  }

  // Boost test files when task mentions testing
  const hasTestKeyword = keywords.some((k) => ['test', 'spec', 'testing', 'qa'].includes(k));
  if (hasTestKeyword && (lowerPath.includes('test') || lowerPath.includes('spec'))) {
    score += 3;
  }

  return score;
}

/**
 * Call a free LLM via OpenRouter to refine file selection.
 * Returns the LLM-selected file paths, or null on failure.
 */
export async function askLlmForRelevantFiles(
  task: string,
  candidates: string[],
  config: ContextGatheringConfig
): Promise<string[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const candidateList = candidates.map((f, i) => `${i + 1}. ${f}`).join('\n');

  const prompt = `Given this coding task, select the 5-15 most relevant files that a developer would need to read to understand the codebase context and implement the task. Return ONLY a JSON array of file paths, nothing else.

Task: ${task}

Available files:
${candidateList}

Respond with ONLY a JSON array like: ["path/to/file1.ts", "path/to/file2.ts"]`;

  try {
    const body = JSON.stringify({
      model: config.llm_model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 1000,
    });

    const response = await httpsPost(
      'https://openrouter.ai/api/v1/chat/completions',
      body,
      {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/roland-mcp',
        'X-Title': 'Roland File Gatherer',
      },
      config.llm_timeout_ms
    );

    const parsed = JSON.parse(response);
    const content = parsed?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const selectedFiles: unknown = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(selectedFiles)) return null;

    // Validate that returned files are in our candidate list
    const candidateSet = new Set(candidates);
    const valid = selectedFiles.filter(
      (f): f is string => typeof f === 'string' && candidateSet.has(f)
    );

    logger.info(`[FileGatherer] LLM selected ${valid.length} files from ${candidates.length} candidates`);
    return valid.length > 0 ? valid : null;
  } catch (err) {
    logger.warn(`[FileGatherer] LLM file selection failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Main entry: select relevant files for a task using heuristic scoring
 * with optional LLM refinement.
 */
export async function selectRelevantFiles(
  task: string,
  config: ContextGatheringConfig = DEFAULT_CONTEXT_GATHERING_CONFIG
): Promise<string[]> {
  const allFiles = listProjectFiles(config.exclude_patterns);
  if (allFiles.length === 0) return [];

  const keywords = extractTaskKeywords(task);
  if (keywords.length === 0) return [];

  // Score all files
  const scored = allFiles
    .map((file) => ({ file, score: scoreFileRelevance(file, keywords) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  // Take top 30 candidates for LLM refinement
  const topCandidates = scored.slice(0, 30).map(({ file }) => file);
  if (topCandidates.length === 0) return [];

  // Try LLM refinement
  const llmSelected = await askLlmForRelevantFiles(task, topCandidates, config);
  if (llmSelected && llmSelected.length > 0) {
    return llmSelected.slice(0, config.max_files);
  }

  // Fallback: use heuristic top N
  logger.info(`[FileGatherer] Using heuristic selection (${topCandidates.length} candidates)`);
  return topCandidates.slice(0, config.max_files);
}

/**
 * Read selected files from disk and bundle their contents,
 * respecting the byte limit.
 */
export function bundleFileContents(
  files: string[],
  maxBytes: number = DEFAULT_CONTEXT_GATHERING_CONFIG.max_bytes
): FileBundle {
  const bundle: FileBundle = {
    files: [],
    totalBytes: 0,
    truncated: false,
  };

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const sizeBytes = Buffer.byteLength(content, 'utf-8');

      if (bundle.totalBytes + sizeBytes > maxBytes) {
        bundle.truncated = true;
        // Try to fit partial — skip if already over 80%
        if (bundle.totalBytes > maxBytes * 0.8) break;
        continue;
      }

      bundle.files.push({ path: filePath, content, sizeBytes });
      bundle.totalBytes += sizeBytes;
    } catch {
      // Skip unreadable files
      continue;
    }
  }

  logger.info(
    `[FileGatherer] Bundled ${bundle.files.length} files (${(bundle.totalBytes / 1024).toFixed(1)}KB)` +
    (bundle.truncated ? ' [truncated]' : '')
  );

  return bundle;
}

/**
 * Format a FileBundle as markdown for inclusion in prompts.
 */
export function formatBundleAsMarkdown(bundle: FileBundle): string {
  if (bundle.files.length === 0) return '';

  const sections = bundle.files.map(({ path: filePath, content }) => {
    const ext = path.extname(filePath).slice(1) || 'text';
    return `### ${filePath}\n\`\`\`${ext}\n${content}\n\`\`\``;
  });

  return `## Codebase Context (${bundle.files.length} files, ${(bundle.totalBytes / 1024).toFixed(1)}KB)\n\n${sections.join('\n\n')}`;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Simple glob matching (supports * and ** patterns).
 */
function matchGlob(filePath: string, pattern: string): boolean {
  // Normalize to forward slashes
  const normalized = filePath.replace(/\\/g, '/');

  // Convert glob to regex
  const regexStr = pattern
    .replace(/\\/g, '/')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
    .replace(/\./g, '\\.')
    .replace(/\?/g, '.');

  return new RegExp(`^${regexStr}$`).test(normalized) ||
         new RegExp(`(^|/)${regexStr}$`).test(normalized);
}

/**
 * Make a POST request using Node's built-in https module.
 * Mirrors the pattern from complexity-classifier.ts.
 */
function httpsPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<string> {
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
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
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
