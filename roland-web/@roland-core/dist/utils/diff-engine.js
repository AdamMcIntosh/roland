/**
 * Diff Engine — generates unified diffs and HTML previews for file changes.
 *
 * No external dependencies: implements LCS-based line diff in pure TypeScript.
 */
// ============================================================================
// LCS — Longest Common Subsequence (line-level)
// ============================================================================
/**
 * Compute LCS of two string arrays.
 * Returns matched index pairs [oldIdx, newIdx].
 * Guards against O(m*n) blowup for very large files (>4000 lines each).
 */
function computeLCS(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0 || n === 0)
        return [];
    // Safety guard: if both sides are huge use a greedy hash approach instead
    if (m * n > 16_000_000) {
        return greedyMatchByHash(a, b);
    }
    // Standard DP table
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    // Backtrack to find matched pairs
    const result = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            result.unshift([i - 1, j - 1]);
            i--;
            j--;
        }
        else if (dp[i - 1][j] >= dp[i][j - 1]) {
            i--;
        }
        else {
            j--;
        }
    }
    return result;
}
/**
 * Greedy hash-based matching for large files.
 * Matches lines that appear in both arrays (in order) by content hash.
 */
function greedyMatchByHash(a, b) {
    // Build index: content → first occurrence in b
    const bIndex = new Map();
    for (let j = b.length - 1; j >= 0; j--) {
        bIndex.set(b[j], j);
    }
    const matches = [];
    let lastJ = -1;
    for (let i = 0; i < a.length; i++) {
        const j = bIndex.get(a[i]);
        if (j !== undefined && j > lastJ) {
            matches.push([i, j]);
            lastJ = j;
        }
    }
    return matches;
}
// ============================================================================
// Diff computation
// ============================================================================
/**
 * Compute a line-level diff between `original` and `modified`.
 */
function computeLineDiff(originalLines, modifiedLines) {
    const matches = computeLCS(originalLines, modifiedLines);
    const result = [];
    let oi = 0; // pointer into originalLines
    let ni = 0; // pointer into modifiedLines
    let matchIdx = 0;
    while (matchIdx < matches.length) {
        const [mo, mn] = matches[matchIdx];
        // Emit removals for skipped original lines
        while (oi < mo) {
            result.push({ type: 'removed', content: originalLines[oi], oldLineNo: oi + 1, newLineNo: null });
            oi++;
        }
        // Emit additions for skipped modified lines
        while (ni < mn) {
            result.push({ type: 'added', content: modifiedLines[ni], oldLineNo: null, newLineNo: ni + 1 });
            ni++;
        }
        // Emit the common line
        result.push({ type: 'context', content: originalLines[oi], oldLineNo: oi + 1, newLineNo: ni + 1 });
        oi++;
        ni++;
        matchIdx++;
    }
    // Trailing removals
    while (oi < originalLines.length) {
        result.push({ type: 'removed', content: originalLines[oi], oldLineNo: oi + 1, newLineNo: null });
        oi++;
    }
    // Trailing additions
    while (ni < modifiedLines.length) {
        result.push({ type: 'added', content: modifiedLines[ni], oldLineNo: null, newLineNo: ni + 1 });
        ni++;
    }
    return result;
}
/**
 * Group flat diff lines into hunks with surrounding context.
 */
function groupIntoHunks(lines, contextLines) {
    if (lines.length === 0)
        return [];
    // Find indices of changed lines
    const changedIndices = new Set();
    lines.forEach((line, idx) => {
        if (line.type !== 'context') {
            for (let k = Math.max(0, idx - contextLines); k <= Math.min(lines.length - 1, idx + contextLines); k++) {
                changedIndices.add(k);
            }
        }
    });
    if (changedIndices.size === 0)
        return [];
    // Build contiguous ranges
    const ranges = [];
    const sorted = Array.from(changedIndices).sort((a, b) => a - b);
    let rangeStart = sorted[0];
    let rangeEnd = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === rangeEnd + 1) {
            rangeEnd = sorted[i];
        }
        else {
            ranges.push([rangeStart, rangeEnd]);
            rangeStart = sorted[i];
            rangeEnd = sorted[i];
        }
    }
    ranges.push([rangeStart, rangeEnd]);
    // Convert ranges to hunks
    return ranges.map(([start, end]) => {
        const hunkLines = lines.slice(start, end + 1);
        const firstOld = hunkLines.find(l => l.oldLineNo !== null)?.oldLineNo ?? 1;
        const firstNew = hunkLines.find(l => l.newLineNo !== null)?.newLineNo ?? 1;
        const oldCount = hunkLines.filter(l => l.type !== 'added').length;
        const newCount = hunkLines.filter(l => l.type !== 'removed').length;
        return {
            oldStart: firstOld,
            oldCount,
            newStart: firstNew,
            newCount,
            lines: hunkLines,
        };
    });
}
// ============================================================================
// Markdown formatter
// ============================================================================
/**
 * Format hunks as a unified diff markdown block.
 */
function toMarkdown(hunks, filename) {
    if (hunks.length === 0) {
        return '```diff\n(no changes)\n```';
    }
    const header = filename
        ? `--- a/${filename}\n+++ b/${filename}\n`
        : `--- original\n+++ modified\n`;
    const body = hunks
        .map(hunk => {
        const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
        const hunkLines = hunk.lines
            .map(line => {
            if (line.type === 'added')
                return `+${line.content}`;
            if (line.type === 'removed')
                return `-${line.content}`;
            return ` ${line.content}`;
        })
            .join('\n');
        return `${hunkHeader}\n${hunkLines}`;
    })
        .join('\n');
    return `\`\`\`diff\n${header}${body}\n\`\`\``;
}
// ============================================================================
// HTML template engine (minimal — replaces {{key}} placeholders)
// ============================================================================
function renderTemplate(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Diff Preview: {{filename}}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace; font-size: 13px; background: #0d1117; color: #e6edf3; }
    .diff-header { padding: 12px 16px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; align-items: center; gap: 12px; }
    .diff-header h2 { font-size: 14px; font-weight: 600; color: #e6edf3; }
    .diff-stats { display: flex; gap: 8px; margin-left: auto; }
    .stat-add { color: #3fb950; font-weight: 600; }
    .stat-del { color: #f85149; font-weight: 600; }
    .diff-table { width: 100%; border-collapse: collapse; }
    .hunk-header { background: #1f2937; color: #6e7681; padding: 4px 8px; font-style: italic; border-top: 1px solid #30363d; border-bottom: 1px solid #30363d; }
    .hunk-header td { padding: 4px 8px; }
    .line-no { width: 1%; min-width: 40px; padding: 1px 10px; text-align: right; color: #6e7681; user-select: none; border-right: 1px solid #30363d; background: inherit; }
    .line-content { padding: 1px 8px; white-space: pre-wrap; word-break: break-all; }
    .line-added { background: #0a3622; }
    .line-added .line-no { background: #0a3622; }
    .line-added .line-content::before { content: '+'; margin-right: 4px; color: #3fb950; }
    .line-removed { background: #3d0f0f; }
    .line-removed .line-no { background: #3d0f0f; }
    .line-removed .line-content::before { content: '-'; margin-right: 4px; color: #f85149; }
    .line-context .line-content::before { content: ' '; margin-right: 4px; }
    .no-changes { padding: 24px; text-align: center; color: #6e7681; }
  </style>
</head>
<body>
  <div class="diff-header">
    <h2>{{filename}}</h2>
    <div class="diff-stats">
      <span class="stat-add">+{{additions}}</span>
      <span class="stat-del">-{{deletions}}</span>
    </div>
  </div>
  <table class="diff-table">
    <tbody>
      {{rows}}
    </tbody>
  </table>
</body>
</html>`;
/**
 * Render hunks as a self-contained HTML preview page.
 */
function toHtml(hunks, filename, additions, deletions) {
    if (hunks.length === 0) {
        const rows = `<tr><td class="no-changes" colspan="3">No changes detected.</td></tr>`;
        return renderTemplate(HTML_TEMPLATE, { filename: escapeHtml(filename), additions: '0', deletions: '0', rows });
    }
    const rows = hunks
        .map(hunk => {
        const hunkHeaderRow = `<tr class="hunk-header"><td class="line-no"></td><td class="line-no"></td><td class="line-content">@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@</td></tr>`;
        const lineRows = hunk.lines
            .map(line => {
            const cssClass = `line-${line.type}`;
            const oldNo = line.oldLineNo !== null ? String(line.oldLineNo) : '';
            const newNo = line.newLineNo !== null ? String(line.newLineNo) : '';
            const content = escapeHtml(line.content);
            return `<tr class="${cssClass}"><td class="line-no">${oldNo}</td><td class="line-no">${newNo}</td><td class="line-content">${content}</td></tr>`;
        })
            .join('\n      ');
        return `${hunkHeaderRow}\n      ${lineRows}`;
    })
        .join('\n      ');
    return renderTemplate(HTML_TEMPLATE, {
        filename: escapeHtml(filename || 'changes'),
        additions: String(additions),
        deletions: String(deletions),
        rows,
    });
}
// ============================================================================
// Public API
// ============================================================================
/**
 * Generate a diff between `original` and `modified` content.
 *
 * @param original - Original file content (string)
 * @param modified - Modified file content (string)
 * @param options  - { filename, contextLines, includeHtml }
 */
export function generateDiff(original, modified, options = {}) {
    const filename = options.filename ?? 'file';
    const contextLines = Math.max(0, options.contextLines ?? 3);
    const includeHtml = options.includeHtml ?? false;
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    const flatDiff = computeLineDiff(originalLines, modifiedLines);
    const hunks = groupIntoHunks(flatDiff, contextLines);
    const additions = flatDiff.filter(l => l.type === 'added').length;
    const deletions = flatDiff.filter(l => l.type === 'removed').length;
    return {
        hunks,
        additions,
        deletions,
        markdownDiff: toMarkdown(hunks, filename),
        htmlPreview: includeHtml ? toHtml(hunks, filename, additions, deletions) : null,
    };
}
//# sourceMappingURL=diff-engine.js.map