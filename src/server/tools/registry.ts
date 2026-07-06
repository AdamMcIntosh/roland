/**
 * ## P0 Security & Context Fixes (v1.4.0)
 *
 * ## P1 Honesty & Consolidation
 *
 * Tool registration helpers and utility tools (health_check, preview_changes, analyze_screenshot).
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { McpToolError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { AdvisoryModelRouter } from '../../orchestrator/advisory-model-router.js';
import { generateDiff } from '../../utils/diff-engine.js';
import { getDiffStreamServer } from '../diff-stream.js';
import { analyzeScreenshot } from '../../utils/screenshot.js';
import { readPackageVersion } from '../../utils/package-version.js';
import fs from 'fs';
import path from 'path';
import type { McpToolContext, McpToolRegistrar, McpToolRegistry } from './types.js';

/** Create a registrar backed by tool maps. */
export function createRegistrar(registry: McpToolRegistry): McpToolRegistrar {
  return {
    registerTool(
      name: string,
      description: string,
      handler: (args: Record<string, unknown>) => Promise<unknown>,
      inputSchema?: Record<string, unknown>,
    ): void {
      registry.tools.set(name, handler);
      registry.toolDefinitions.set(name, {
        name,
        description,
        inputSchema: (inputSchema as Tool['inputSchema']) || {
          type: 'object',
          properties: {},
          required: [],
        },
      });
      logger.debug(`✅ Registered tool: ${name}`);
    },
  };
}

export function registerUtilityTools(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registerHealthCheck(registrar, ctx);
  registerPreviewChanges(registrar);
  registerAnalyzeScreenshot(registrar);
}

function registerHealthCheck(registrar: McpToolRegistrar, ctx: McpToolContext): void {
  registrar.registerTool(
    'health_check',
    'Verify Roland MCP is running. Returns server version, uptime, registered tool count, and optional Ollama/classifier status. Call this first if MCP tools are not responding.',
    async () => {
      const result: Record<string, unknown> = {
        status: 'healthy',
        version: readPackageVersion(import.meta.url),
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        tools: ctx.getTools(),
      };

      if (ctx.config.ollama?.enabled) {
        const ollamaCfg = ctx.config.ollama;
        const health = await AdvisoryModelRouter.checkOllamaHealth(ollamaCfg.base_url);
        result.ollama = {
          enabled: true,
          available: health.available,
          base_url: ollamaCfg.base_url,
          model: ollamaCfg.model,
        };
      }

      const apiKeyAvailable = Boolean(process.env.OPENROUTER_API_KEY);
      const classifierCfg = ctx.config.classifier;
      const semanticEnabled = classifierCfg?.semantic_enabled ?? true;
      result.classifier = {
        mode: apiKeyAvailable && semanticEnabled ? 'semantic' : 'heuristic',
        semantic_model: classifierCfg?.semantic_model ?? 'qwen/qwen3-coder:free',
        api_key_available: apiKeyAvailable,
      };

      return result;
    },
    { type: 'object', properties: {}, required: [] },
  );
}

function registerPreviewChanges(registrar: McpToolRegistrar): void {
  registrar.registerTool(
    'preview_changes',
    'Generate a markdown unified diff and optional HTML preview comparing original vs modified content. Returns diff stats (additions/deletions) alongside formatted output.',
    async (args: Record<string, unknown>) => {
      const original = args.original as string;
      const modified = args.modified as string;

      if (typeof original !== 'string') {
        throw new McpToolError('preview_changes', '"original" must be a string');
      }
      if (typeof modified !== 'string') {
        throw new McpToolError('preview_changes', '"modified" must be a string');
      }

      const filename = typeof args.filename === 'string' ? args.filename : 'file';
      const format = (args.format as string) ?? 'markdown';
      const contextLines = typeof args.context_lines === 'number'
        ? Math.max(0, Math.floor(args.context_lines))
        : 3;

      if (!['markdown', 'html', 'both'].includes(format)) {
        throw new McpToolError('preview_changes', '"format" must be one of: markdown, html, both');
      }

      const includeHtml = format === 'html' || format === 'both';
      const result = generateDiff(original, modified, { filename, contextLines, includeHtml });

      const writePending = args.write_pending !== false;
      let pendingFile: string | undefined;
      if (writePending && filename !== 'file') {
        try {
          const projectRoot = process.env.ROLAND_PROJECT_ROOT || process.cwd();
          const pendingDir = path.join(projectRoot, '.omc', 'pending-changes');
          fs.mkdirSync(pendingDir, { recursive: true });
          const safeName = filename.replace(/[/\\:]/g, '_');
          const ts = Date.now();
          pendingFile = path.join(pendingDir, `${safeName}-${ts}.json`);
          fs.writeFileSync(pendingFile, JSON.stringify({
            originalPath: filename,
            proposedContent: modified,
            description: `${result.additions} additions, ${result.deletions} deletions`,
            tool: 'preview_changes',
            timestamp: new Date().toISOString(),
          }, null, 2), 'utf-8');
        } catch {
          // Non-fatal
        }
      }

      try {
        const diffServer = getDiffStreamServer();
        if (diffServer && diffServer.getClientCount() > 0) {
          const { randomUUID } = await import('crypto');
          diffServer.broadcastDiff({
            type: 'diff:new',
            id: randomUUID(),
            file: filename !== 'file' ? filename : undefined,
            original,
            modified,
            timestamp: Date.now(),
          });
        }
      } catch {
        // Non-fatal
      }

      return {
        filename,
        stats: {
          additions: result.additions,
          deletions: result.deletions,
          hunks: result.hunks.length,
          unchanged: original.split('\n').length - result.deletions,
        },
        markdown_diff: format !== 'html' ? result.markdownDiff : undefined,
        html_preview: includeHtml ? result.htmlPreview : undefined,
        pending_change_file: pendingFile,
      };
    },
    {
      type: 'object',
      properties: {
        original: { type: 'string', description: 'Original file content (before changes)' },
        modified: { type: 'string', description: 'Modified file content (after changes)' },
        filename: { type: 'string', description: 'File name shown in the diff header (default: "file")' },
        format: { type: 'string', enum: ['markdown', 'html', 'both'], description: 'Output format — "markdown" (default), "html", or "both"' },
        context_lines: { type: 'number', description: 'Lines of context around each change (default: 3)' },
        write_pending: { type: 'boolean', description: 'Write a pending change file for VS Code extension consumption (default: true). Set false to skip.' },
      },
      required: ['original', 'modified'],
    },
  );
}

function registerAnalyzeScreenshot(registrar: McpToolRegistrar): void {
  registrar.registerTool(
    'analyze_screenshot',
    'Capture the primary screen (or load an existing image file) and analyse it with a vision-capable model. Returns a text description of what is visible — code, errors, UI, etc. Useful when debugging visual issues or reading screenshots.',
    async (args: Record<string, unknown>) => {
      const filePath = typeof args.file_path === 'string' ? args.file_path : undefined;
      const prompt = typeof args.prompt === 'string' ? args.prompt
        : 'Describe what you see in this image, focusing on any code, error messages, UI elements, or anything relevant to software development.';
      const model = typeof args.model === 'string' ? args.model : 'google/gemini-2.5-flash';

      const result = await analyzeScreenshot({ filePath, prompt, model });
      return {
        analysis: result.analysis,
        model: result.model,
        source: result.capturedNow ? 'screen capture' : result.imagePath,
      };
    },
  );
}
