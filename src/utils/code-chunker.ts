/**
 * Code Chunker - Splits codebases into token-budget-friendly chunks
 *
 * Traverses a project directory, groups files into chunks that fit
 * within a configurable token budget, and returns sparse representations
 * suitable for sending to an LLM without blowing context windows.
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

export interface ChunkOptions {
  /** Max approximate tokens per chunk (default 80 000) */
  maxTokensPerChunk?: number;
  /** Glob-style extensions to include (default: common code exts) */
  extensions?: string[];
  /** Directories to skip */
  ignoreDirs?: string[];
  /** Whether to strip comments & collapse whitespace before chunking */
  compress?: boolean;
}

export interface CodeChunk {
  /** 0-based index */
  index: number;
  /** Files included in this chunk */
  files: string[];
  /** Combined content */
  content: string;
  /** Estimated token count */
  estimatedTokens: number;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.kt', '.cs',
  '.yaml', '.yml', '.json', '.toml',
  '.md', '.mdx',
];

const DEFAULT_IGNORE_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'out',
  '.next', '.nuxt', 'coverage', '__pycache__',
  '.vscode', '.idea', 'vendor',
];

// ============================================================================
// Helpers
// ============================================================================

/** Rough token estimate: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Recursively collect files matching the given extensions
 */
function collectFiles(
  dir: string,
  extensions: string[],
  ignoreDirs: string[],
  root: string,
): string[] {
  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (ignoreDirs.includes(entry.name)) continue;
      results.push(...collectFiles(fullPath, extensions, ignoreDirs, root));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(path.relative(root, fullPath).replace(/\\/g, '/'));
      }
    }
  }

  return results;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Chunk a project directory into token-budget-friendly pieces.
 *
 * Each chunk concatenates file contents with a `// File: <path>` header
 * and stays within `maxTokensPerChunk`.
 */
export function chunkCodebase(projectDir: string, opts: ChunkOptions = {}): CodeChunk[] {
  const {
    maxTokensPerChunk = 80_000,
    extensions = DEFAULT_EXTENSIONS,
    ignoreDirs = DEFAULT_IGNORE_DIRS,
    compress = false,
  } = opts;

  const absDir = path.resolve(projectDir);
  const files = collectFiles(absDir, extensions, ignoreDirs, absDir);

  logger.debug(`[CodeChunker] Found ${files.length} files in ${absDir}`);

  const chunks: CodeChunk[] = [];
  let currentContent = '';
  let currentFiles: string[] = [];
  let currentTokens = 0;

  for (const relPath of files) {
    const fullPath = path.join(absDir, relPath);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      logger.warn(`[CodeChunker] Skipping unreadable file: ${relPath}`);
      continue;
    }

    if (compress) {
      content = compressCode(content);
    }

    const header = `// File: ${relPath}\n`;
    const block = `${header}${content}\n`;
    const blockTokens = estimateTokens(block);

    // If single file exceeds budget, push it as its own chunk
    if (blockTokens > maxTokensPerChunk) {
      // Flush current accumulator first
      if (currentFiles.length > 0) {
        chunks.push({
          index: chunks.length,
          files: currentFiles,
          content: currentContent,
          estimatedTokens: currentTokens,
        });
        currentContent = '';
        currentFiles = [];
        currentTokens = 0;
      }

      chunks.push({
        index: chunks.length,
        files: [relPath],
        content: block,
        estimatedTokens: blockTokens,
      });
      continue;
    }

    // Would adding this file exceed the budget?
    if (currentTokens + blockTokens > maxTokensPerChunk && currentFiles.length > 0) {
      chunks.push({
        index: chunks.length,
        files: currentFiles,
        content: currentContent,
        estimatedTokens: currentTokens,
      });
      currentContent = '';
      currentFiles = [];
      currentTokens = 0;
    }

    currentContent += block + '\n';
    currentFiles.push(relPath);
    currentTokens += blockTokens;
  }

  // Flush remaining
  if (currentFiles.length > 0) {
    chunks.push({
      index: chunks.length,
      files: currentFiles,
      content: currentContent,
      estimatedTokens: currentTokens,
    });
  }

  logger.info(`[CodeChunker] Split ${files.length} files into ${chunks.length} chunks`);
  return chunks;
}

/**
 * Strip comments and collapse whitespace to reduce token count.
 * Handles single-line (//, #) and multi-line block comments.
 */
export function compressCode(source: string): string {
  let out = source;

  // Remove multi-line block comments  /* ... */
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove single-line comments  // ...
  out = out.replace(/\/\/.*$/gm, '');

  // Remove Python/YAML-style comments  # ...  (only at start of line or after whitespace)
  out = out.replace(/(?<=^|\s)#.*$/gm, '');

  // Collapse multiple blank lines into one
  out = out.replace(/\n{3,}/g, '\n\n');

  // Trim trailing whitespace per line
  out = out.replace(/[ \t]+$/gm, '');

  return out.trim();
}
