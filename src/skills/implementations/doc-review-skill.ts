/**
 * Doc-Review Skill - Token-efficient documentation review & generation
 *
 * Strategies (combined to stay within free-tier token budgets):
 *   1. Code chunking     — splits large codebases into manageable chunks
 *   2. File summarisation — extracts sparse structural metadata (5-10× compression)
 *   3. Git-diff targeting — reviews only recently changed files when possible
 *   4. Code compression   — strips comments / whitespace before LLM ingestion
 *
 * The skill does NOT call the LLM directly.  Instead it prepares a
 * comprehensive prompt fragment that the calling agent injects into its
 * conversation loop, keeping API calls to the absolute minimum.
 */

import { Skill } from '../skill-framework.js';
import { SkillMetadata, SkillResult } from '../../utils/types.js';
import { logger } from '../../utils/logger.js';

import { chunkCodebase, compressCode, type CodeChunk } from '../../utils/code-chunker.js';
import {
  summarizeProject,
  summarizeFile,
  summariesToPrompt,
  type FileSummary,
} from '../../utils/file-summarizer.js';
import {
  getChangedFiles,
  readChangedFiles,
  changedFilesPrompt,
  type GitDiffEntry,
} from '../../utils/git-diff-loader.js';

// ============================================================================
// Types
// ============================================================================

export type DocReviewStrategy =
  | 'full'          // Summarise entire project → single prompt
  | 'diff'          // Only review changed files
  | 'chunked'       // Chunk codebase → iterate
  | 'auto';         // Choose best strategy automatically

export interface DocReviewInput {
  projectDir: string;
  strategy?: DocReviewStrategy;
  /** Max tokens per chunk / prompt fragment (default 80 000) */
  maxTokens?: number;
  /** Git diff scope — only used with 'diff' or 'auto' strategy */
  diffScope?: string;
  /** File extensions to include */
  extensions?: string[];
  /** Directories to ignore */
  ignoreDirs?: string[];
  /** Whether to include git diffs in the prompt */
  includeDiffs?: boolean;
}

// ============================================================================
// Skill Implementation
// ============================================================================

export class DocReviewSkill extends Skill {
  metadata: SkillMetadata = {
    name: 'doc-review',
    category: 'documentation',
    description:
      'Token-efficient documentation review and generation. ' +
      'Chunks, summarises, and selectively loads code to stay within ' +
      'free-tier API limits while producing actionable doc improvements.',
    parameters: [
      {
        name: 'projectDir',
        type: 'string',
        required: true,
        description: 'Absolute path to the project root',
      },
      {
        name: 'strategy',
        type: 'string',
        required: false,
        description: 'Review strategy: full | diff | chunked | auto',
        enum: ['full', 'diff', 'chunked', 'auto'],
        default: 'auto',
      },
      {
        name: 'maxTokens',
        type: 'number',
        required: false,
        description: 'Max token budget per prompt fragment (default 80000)',
        default: 80_000,
      },
      {
        name: 'diffScope',
        type: 'string',
        required: false,
        description: 'Git diff scope (staged, unstaged, HEAD~1, etc.)',
        default: 'HEAD~1',
      },
      {
        name: 'extensions',
        type: 'array',
        required: false,
        description: 'File extensions to include',
      },
      {
        name: 'ignoreDirs',
        type: 'array',
        required: false,
        description: 'Directories to ignore',
      },
      {
        name: 'includeDiffs',
        type: 'boolean',
        required: false,
        description: 'Include git diff text in the prompt',
        default: false,
      },
    ],
    returns: {
      type: 'object',
      description:
        'Prompt fragments, summaries, and doc-gap analysis ready for LLM consumption',
    },
  };

  // --------------------------------------------------------------------------
  // execute()
  // --------------------------------------------------------------------------

  async execute(
    input: Record<string, unknown>,
    _context?: Record<string, unknown>,
  ): Promise<SkillResult> {
    if (!this.validateInput(input)) {
      return { success: false, error: 'Missing required parameter: projectDir' };
    }

    const opts = this.parseInput(input);

    try {
      logger.info(
        `[DocReview] Starting review — strategy=${opts.strategy}, ` +
        `maxTokens=${opts.maxTokens}, project=${opts.projectDir}`,
      );

      // Decide strategy if auto
      const strategy = opts.strategy === 'auto'
        ? this.chooseStrategy(opts)
        : opts.strategy;

      logger.info(`[DocReview] Using strategy: ${strategy}`);

      switch (strategy) {
        case 'diff':
          return this.runDiffStrategy(opts);
        case 'chunked':
          return this.runChunkedStrategy(opts);
        case 'full':
        default:
          return this.runFullStrategy(opts);
      }
    } catch (error) {
      logger.error(`[DocReview] Failed: ${error}`);
      return { success: false, error: `Doc review failed: ${error}` };
    }
  }

  // --------------------------------------------------------------------------
  // Strategy selection
  // --------------------------------------------------------------------------

  private chooseStrategy(opts: DocReviewInput): DocReviewStrategy {
    // 1. If there are recent git changes, prefer diff strategy
    const changes = getChangedFiles(opts.projectDir, {
      scope: opts.diffScope,
      extensions: opts.extensions,
    });

    if (changes.length > 0 && changes.length <= 30) {
      logger.debug(`[DocReview] Auto-selected 'diff' (${changes.length} changed files)`);
      return 'diff';
    }

    // 2. Get full project summaries to estimate total size
    const summaries = summarizeProject(opts.projectDir, {
      extensions: opts.extensions,
      ignoreDirs: opts.ignoreDirs,
    });

    const totalTokens = summaries.reduce((s, f) => s + f.estimatedTokens, 0);

    // If the summaries themselves fit within budget, use full strategy
    const summaryText = summariesToPrompt(summaries);
    const summaryTokens = Math.ceil(summaryText.length / 4);

    if (summaryTokens < (opts.maxTokens ?? 80_000)) {
      logger.debug(
        `[DocReview] Auto-selected 'full' (${summaryTokens} summary tokens)`,
      );
      return 'full';
    }

    // Otherwise chunk
    logger.debug(
      `[DocReview] Auto-selected 'chunked' (${totalTokens} total tokens)`,
    );
    return 'chunked';
  }

  // --------------------------------------------------------------------------
  // Full strategy - summarise entire project in one pass
  // --------------------------------------------------------------------------

  private async runFullStrategy(opts: DocReviewInput): Promise<SkillResult> {
    const summaries = summarizeProject(opts.projectDir, {
      extensions: opts.extensions,
      ignoreDirs: opts.ignoreDirs,
    });

    const promptFragment = summariesToPrompt(summaries);
    const docGaps = this.collectDocGaps(summaries);

    const systemInstruction = this.buildSystemInstruction('full');

    return {
      success: true,
      data: {
        strategy: 'full',
        totalFiles: summaries.length,
        totalDocGaps: docGaps.length,
        promptTokenEstimate: Math.ceil(promptFragment.length / 4),
        systemInstruction,
        promptFragment,
        docGaps,
        summaries,
      },
    };
  }

  // --------------------------------------------------------------------------
  // Diff strategy - only review changed files
  // --------------------------------------------------------------------------

  private async runDiffStrategy(opts: DocReviewInput): Promise<SkillResult> {
    const changes = getChangedFiles(opts.projectDir, {
      scope: opts.diffScope,
      extensions: opts.extensions,
      includeDiff: opts.includeDiffs,
    });

    if (changes.length === 0) {
      return {
        success: true,
        data: {
          strategy: 'diff',
          totalFiles: 0,
          message: 'No changes detected — documentation is up-to-date.',
        },
      };
    }

    // Summarise only the changed files
    const summaries: FileSummary[] = [];
    const changedContents = readChangedFiles(opts.projectDir, {
      scope: opts.diffScope,
      extensions: opts.extensions,
    });

    for (const [relPath] of changedContents) {
      const fullPath = `${opts.projectDir}/${relPath}`;
      summaries.push(summarizeFile(fullPath, opts.projectDir));
    }

    const diffPrompt = changedFilesPrompt(changes);
    const summaryPrompt = summariesToPrompt(summaries);
    const docGaps = this.collectDocGaps(summaries);

    const systemInstruction = this.buildSystemInstruction('diff');

    return {
      success: true,
      data: {
        strategy: 'diff',
        totalFiles: changes.length,
        totalDocGaps: docGaps.length,
        promptTokenEstimate: Math.ceil((diffPrompt.length + summaryPrompt.length) / 4),
        systemInstruction,
        promptFragment: `${summaryPrompt}\n\n${diffPrompt}`,
        docGaps,
        changes,
        summaries,
      },
    };
  }

  // --------------------------------------------------------------------------
  // Chunked strategy - process codebase in manageable pieces
  // --------------------------------------------------------------------------

  private async runChunkedStrategy(opts: DocReviewInput): Promise<SkillResult> {
    const chunks = chunkCodebase(opts.projectDir, {
      maxTokensPerChunk: opts.maxTokens,
      extensions: opts.extensions,
      ignoreDirs: opts.ignoreDirs,
      compress: true,
    });

    // Build per-chunk summaries
    const chunkData = chunks.map((chunk, idx) => {
      // Summarise files in this chunk
      const fileSummaries: FileSummary[] = chunk.files.map((f) =>
        summarizeFile(`${opts.projectDir}/${f}`, opts.projectDir),
      );

      const summaryPrompt = summariesToPrompt(fileSummaries);
      const docGaps = this.collectDocGaps(fileSummaries);

      return {
        chunkIndex: idx,
        files: chunk.files,
        estimatedTokens: chunk.estimatedTokens,
        promptFragment: summaryPrompt,
        docGaps,
      };
    });

    const systemInstruction = this.buildSystemInstruction('chunked');
    const totalDocGaps = chunkData.reduce((s, c) => s + c.docGaps.length, 0);

    return {
      success: true,
      data: {
        strategy: 'chunked',
        totalChunks: chunks.length,
        totalFiles: chunks.reduce((s, c) => s + c.files.length, 0),
        totalDocGaps,
        systemInstruction,
        chunks: chunkData,
      },
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private parseInput(input: Record<string, unknown>): DocReviewInput {
    return {
      projectDir: input.projectDir as string,
      strategy: (input.strategy as DocReviewStrategy) || 'auto',
      maxTokens: (input.maxTokens as number) || 80_000,
      diffScope: (input.diffScope as string) || 'HEAD~1',
      extensions: (input.extensions as string[]) || undefined,
      ignoreDirs: (input.ignoreDirs as string[]) || undefined,
      includeDiffs: (input.includeDiffs as boolean) || false,
    };
  }

  private collectDocGaps(summaries: FileSummary[]): string[] {
    const gaps: string[] = [];
    for (const s of summaries) {
      for (const u of s.undocumented) {
        gaps.push(`${s.file}: ${u}`);
      }
    }
    return gaps;
  }

  private buildSystemInstruction(strategy: DocReviewStrategy): string {
    const base =
      'You are a documentation review assistant. Analyse the provided code ' +
      'summaries and identify documentation gaps, inconsistencies, and areas ' +
      'that need improved explanations. For each gap, provide:\n' +
      '1. The file and symbol name\n' +
      '2. What documentation is missing or inadequate\n' +
      '3. A suggested JSDoc / docstring\n\n' +
      'Be concise. Focus on public APIs, exported symbols, and complex logic.\n';

    switch (strategy) {
      case 'diff':
        return (
          base +
          'IMPORTANT: Focus ONLY on the recently changed files listed below. ' +
          'Ensure new or modified code is properly documented before merging.'
        );
      case 'chunked':
        return (
          base +
          'This is chunk {chunkIndex} of {totalChunks}. Review this subset of ' +
          'files and return documentation recommendations. The results will be ' +
          'aggregated across all chunks.'
        );
      case 'full':
      default:
        return (
          base +
          'Review the full project structure below and prioritise the most ' +
          'impactful documentation gaps.'
        );
    }
  }
}
