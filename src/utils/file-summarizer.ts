/**
 * File Summarizer - Extracts sparse structural metadata from source files
 *
 * Uses regex-based AST-light extraction to pull out exports, function
 * signatures, class names, interfaces, and doc-gaps without sending full
 * source to the LLM. The resulting summaries are 5-10× smaller than the
 * original files and can be aggregated for hierarchical doc generation.
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

export interface FileSummary {
  /** Relative path from project root */
  file: string;
  /** Detected language */
  language: string;
  /** Number of lines in the original file */
  lines: number;
  /** Approximate token count of the full file */
  estimatedTokens: number;
  /** Exported items (functions, classes, types, variables) */
  exports: ExportEntry[];
  /** Top-level function/method signatures */
  functions: FunctionEntry[];
  /** Class names and their method signatures */
  classes: ClassEntry[];
  /** Interfaces / type aliases */
  types: string[];
  /** Lines that look like they lack JSDoc / docstrings */
  undocumented: string[];
}

export interface ExportEntry {
  name: string;
  kind: 'function' | 'class' | 'type' | 'const' | 'default' | 'interface' | 'variable';
}

export interface FunctionEntry {
  name: string;
  signature: string;
  hasDoc: boolean;
}

export interface ClassEntry {
  name: string;
  methods: FunctionEntry[];
  hasDoc: boolean;
}

// ============================================================================
// Language detection
// ============================================================================

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java', '.kt': 'kotlin',
    '.cs': 'csharp',
    '.yaml': 'yaml', '.yml': 'yaml',
    '.json': 'json',
    '.md': 'markdown', '.mdx': 'markdown',
  };
  return map[ext] || 'unknown';
}

// ============================================================================
// TypeScript / JavaScript extraction
// ============================================================================

function extractTSExports(source: string): ExportEntry[] {
  const entries: ExportEntry[] = [];

  // export function foo(
  for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    entries.push({ name: m[1], kind: 'function' });
  }
  // export class Foo
  for (const m of source.matchAll(/export\s+class\s+(\w+)/g)) {
    entries.push({ name: m[1], kind: 'class' });
  }
  // export interface Foo
  for (const m of source.matchAll(/export\s+interface\s+(\w+)/g)) {
    entries.push({ name: m[1], kind: 'interface' });
  }
  // export type Foo
  for (const m of source.matchAll(/export\s+type\s+(\w+)/g)) {
    entries.push({ name: m[1], kind: 'type' });
  }
  // export const foo
  for (const m of source.matchAll(/export\s+const\s+(\w+)/g)) {
    entries.push({ name: m[1], kind: 'const' });
  }
  // export default
  if (/export\s+default\s/.test(source)) {
    entries.push({ name: 'default', kind: 'default' });
  }

  return entries;
}

function extractTSFunctions(source: string): FunctionEntry[] {
  const fns: FunctionEntry[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match function declarations: function foo(, async function foo(, static async foo(
    const fnMatch = line.match(
      /(?:export\s+)?(?:static\s+)?(?:async\s+)?(?:function\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^\s{]+))?/
    );

    if (fnMatch && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
      // Skip obvious non-functions (if, for, while, etc.)
      if (/^\s*(if|for|while|switch|catch|return)\s*\(/.test(line)) continue;

      const hasDoc = i > 0 && (
        lines[i - 1].trim().startsWith('*/') ||
        lines[i - 1].trim().startsWith('*') ||
        lines[i - 1].trim().startsWith('/**')
      );

      fns.push({
        name: fnMatch[1],
        signature: line.trim().replace(/\{.*$/, '').trim(),
        hasDoc,
      });
    }
  }

  return fns;
}

function extractTSClasses(source: string): ClassEntry[] {
  const classes: ClassEntry[] = [];
  const classRegex = /(?:export\s+)?class\s+(\w+)/g;

  for (const m of source.matchAll(classRegex)) {
    const className = m[1];
    const classStart = m.index!;

    // Find the class body (simplistic brace counting)
    let depth = 0;
    let bodyStart = -1;
    let bodyEnd = -1;

    for (let i = classStart; i < source.length; i++) {
      if (source[i] === '{') {
        if (depth === 0) bodyStart = i;
        depth++;
      } else if (source[i] === '}') {
        depth--;
        if (depth === 0) {
          bodyEnd = i;
          break;
        }
      }
    }

    const methods: FunctionEntry[] = [];
    if (bodyStart >= 0 && bodyEnd >= 0) {
      const body = source.slice(bodyStart, bodyEnd);
      const methodLines = body.split('\n');

      for (let i = 0; i < methodLines.length; i++) {
        const line = methodLines[i];
        const methodMatch = line.match(
          /^\s+(?:private\s+|protected\s+|public\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\(/
        );
        if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'return', 'constructor'].includes(methodMatch[1])) {
          const hasDoc = i > 0 && (
            methodLines[i - 1].trim().startsWith('*/') ||
            methodLines[i - 1].trim().startsWith('*')
          );
          methods.push({
            name: methodMatch[1],
            signature: line.trim().replace(/\{.*$/, '').trim(),
            hasDoc,
          });
        }
      }
    }

    const linesBefore = source.slice(0, classStart).split('\n');
    const prevLine = linesBefore[linesBefore.length - 1]?.trim() || '';
    const hasDoc = prevLine.endsWith('*/') || prevLine.startsWith('/**');

    classes.push({ name: className, methods, hasDoc });
  }

  return classes;
}

function extractTSTypes(source: string): string[] {
  const types: string[] = [];
  for (const m of source.matchAll(/(?:export\s+)?(?:interface|type)\s+(\w+)/g)) {
    types.push(m[1]);
  }
  return [...new Set(types)];
}

// ============================================================================
// Undocumented detection
// ============================================================================

function findUndocumented(fns: FunctionEntry[], classes: ClassEntry[]): string[] {
  const gaps: string[] = [];

  for (const fn of fns) {
    if (!fn.hasDoc) gaps.push(`Function: ${fn.name}`);
  }

  for (const cls of classes) {
    if (!cls.hasDoc) gaps.push(`Class: ${cls.name}`);
    for (const m of cls.methods) {
      if (!m.hasDoc) gaps.push(`Method: ${cls.name}.${m.name}`);
    }
  }

  return gaps;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Produce a sparse structural summary of a single file.
 */
export function summarizeFile(filePath: string, projectRoot: string): FileSummary {
  const absPath = path.resolve(filePath);
  const relPath = path.relative(projectRoot, absPath).replace(/\\/g, '/');
  const language = detectLanguage(absPath);

  let source: string;
  try {
    source = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return {
      file: relPath,
      language,
      lines: 0,
      estimatedTokens: 0,
      exports: [],
      functions: [],
      classes: [],
      types: [],
      undocumented: [],
    };
  }

  const lines = source.split('\n').length;
  const estimatedTokens = Math.ceil(source.length / 4);

  let exports: ExportEntry[] = [];
  let functions: FunctionEntry[] = [];
  let classes: ClassEntry[] = [];
  let types: string[] = [];

  if (['typescript', 'javascript'].includes(language)) {
    exports = extractTSExports(source);
    functions = extractTSFunctions(source);
    classes = extractTSClasses(source);
    types = extractTSTypes(source);
  }

  const undocumented = findUndocumented(functions, classes);

  return {
    file: relPath,
    language,
    lines,
    estimatedTokens,
    exports,
    functions,
    classes,
    types,
    undocumented,
  };
}

/**
 * Summarize all code files in a directory tree.
 * Returns an array of file summaries sorted by path.
 */
export function summarizeProject(
  projectDir: string,
  opts: {
    extensions?: string[];
    ignoreDirs?: string[];
  } = {},
): FileSummary[] {
  const {
    extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py'],
    ignoreDirs = ['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '__pycache__'],
  } = opts;

  const absDir = path.resolve(projectDir);
  const files = collectFilesRecursive(absDir, extensions, ignoreDirs);

  logger.debug(`[FileSummarizer] Summarizing ${files.length} files in ${absDir}`);

  const summaries = files
    .map((f) => summarizeFile(f, absDir))
    .sort((a, b) => a.file.localeCompare(b.file));

  logger.info(
    `[FileSummarizer] Produced ${summaries.length} summaries ` +
    `(${summaries.reduce((s, f) => s + f.undocumented.length, 0)} doc gaps found)`,
  );

  return summaries;
}

/**
 * Convert summaries into a compact text block suitable for an LLM prompt.
 * This is 5-10× smaller than the raw source.
 */
export function summariesToPrompt(summaries: FileSummary[]): string {
  const parts: string[] = ['# Project Structure Summary\n'];

  for (const s of summaries) {
    parts.push(`## ${s.file} (${s.language}, ${s.lines} lines)`);

    if (s.exports.length > 0) {
      parts.push(`Exports: ${s.exports.map((e) => `${e.kind} ${e.name}`).join(', ')}`);
    }
    if (s.classes.length > 0) {
      for (const c of s.classes) {
        const methodList = c.methods.map((m) => m.name).join(', ');
        parts.push(`Class ${c.name}${c.hasDoc ? '' : ' [UNDOCUMENTED]'}: methods(${methodList})`);
      }
    }
    if (s.types.length > 0) {
      parts.push(`Types: ${s.types.join(', ')}`);
    }
    if (s.undocumented.length > 0) {
      parts.push(`Doc gaps: ${s.undocumented.join('; ')}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

// ============================================================================
// Internals
// ============================================================================

function collectFilesRecursive(
  dir: string,
  extensions: string[],
  ignoreDirs: string[],
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
      results.push(...collectFilesRecursive(fullPath, extensions, ignoreDirs));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}
