import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const PENDING_DIR = '.omc/pending-changes';
const RECIPE_RUNS_DIR = '.omc/recipe-runs';

/** Tracks which pending file maps to which original file */
interface PendingChange {
  originalPath: string;
  pendingPath: string;
  relativeName: string;
}

let watcher: vscode.FileSystemWatcher | undefined;
let recipeWatcher: vscode.FileSystemWatcher | undefined;
let statusBarItem: vscode.StatusBarItem;
const activeDiffs = new Map<string, PendingChange>();

// ---------------------------------------------------------------------------
// Preview panel state
// ---------------------------------------------------------------------------

let previewPanel: vscode.WebviewPanel | undefined;

/** Convert a limited subset of Markdown to HTML inline — no external deps. */
function markdownToHtml(md: string): string {
  let html = md
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Fenced code blocks (``` ... ```)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
      const cls = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${cls}>${code.trimEnd()}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^###### (.+)$/gm, '<h6>$1</h6>')
    .replace(/^##### (.+)$/gm, '<h5>$1</h5>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered list items
    .replace(/^\s*[-*+] (.+)$/gm, '<li>$1</li>')
    // Ordered list items
    .replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>')
    // Horizontal rules
    .replace(/^---+$/gm, '<hr>')
    // Blank lines -> paragraph breaks
    .replace(/\n{2,}/g, '</p><p>')
    // Remaining single newlines
    .replace(/\n/g, '<br>');

  // Wrap loose list items in <ul>
  html = html.replace(/(<li>.*?<\/li>(\s*<br>)*)+/g, match => {
    const items = match.replace(/<br>/g, '');
    return `<ul>${items}</ul>`;
  });

  return `<p>${html}</p>`;
}

function getWebviewHtml(
  _panel: vscode.WebviewPanel,
  content: string,
  recipeName: string,
  timestamp: string,
): string {
  const htmlContent = markdownToHtml(content);
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Roland Preview</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border, #454545);
      --code-bg: var(--vscode-textCodeBlock-background, #1e1e1e);
      --link: var(--vscode-textLink-foreground, #4daafc);
      --header-bg: var(--vscode-editorGroupHeader-tabsBackground, #252526);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #fff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-editor-font-family, 'Segoe UI', sans-serif);
      font-size: 14px;
      line-height: 1.6;
    }
    header {
      background: var(--header-bg);
      border-bottom: 1px solid var(--border);
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    header h1 {
      font-size: 13px;
      font-weight: 600;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    header .meta {
      font-size: 11px;
      opacity: 0.7;
      white-space: nowrap;
    }
    button {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      border-radius: 2px;
      padding: 4px 10px;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    button:hover { background: var(--btn-hover); }
    main {
      padding: 24px 32px;
      max-width: 900px;
    }
    h1, h2, h3, h4, h5, h6 {
      margin: 1.2em 0 0.4em;
      line-height: 1.3;
    }
    h1 { font-size: 1.8em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    h2 { font-size: 1.4em; border-bottom: 1px solid var(--border); padding-bottom: 0.2em; }
    h3 { font-size: 1.15em; }
    p { margin: 0.6em 0; }
    ul, ol { margin: 0.6em 0 0.6em 1.6em; }
    li { margin: 0.2em 0; }
    pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 12px 16px;
      overflow-x: auto;
      margin: 0.8em 0;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 13px;
      line-height: 1.5;
    }
    code {
      background: var(--code-bg);
      border-radius: 3px;
      padding: 1px 5px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
    }
    pre code { background: none; padding: 0; }
    hr { border: none; border-top: 1px solid var(--border); margin: 1.2em 0; }
    strong { font-weight: 600; }
    em { font-style: italic; }
    a { color: var(--link); }
  </style>
</head>
<body>
  <header>
    <h1>Roland Preview — ${escapeHtml(recipeName)}</h1>
    <span class="meta">${escapeHtml(timestamp)}</span>
    <button onclick="refresh()">&#8635; Refresh</button>
  </header>
  <main>${htmlContent}</main>
  <script>
    const vscode = acquireVsCodeApi();
    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function showPreview(filePath: string, context: vscode.ExtensionContext) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract recipe name and timestamp from path like .omc/recipe-runs/<name>-<ts>/output.md
  const parts = filePath.split(/[\\/]/);
  const runDir = parts[parts.length - 2] ?? 'unknown';
  const dashIdx = runDir.lastIndexOf('-');
  const recipeName = dashIdx > 0 ? runDir.slice(0, dashIdx) : runDir;
  const rawTs = dashIdx > 0 ? runDir.slice(dashIdx + 1) : '';
  const timestamp = rawTs ? new Date(Number(rawTs) || rawTs).toLocaleString() : '';

  if (previewPanel) {
    previewPanel.reveal(vscode.ViewColumn.Beside);
  } else {
    previewPanel = vscode.window.createWebviewPanel(
      'rolandPreview',
      'Roland Preview',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    previewPanel.onDidDispose(() => { previewPanel = undefined; }, null, context.subscriptions);
    previewPanel.webview.onDidReceiveMessage(
      msg => {
        if (msg.command === 'refresh' && previewPanel) {
          const refreshed = fs.readFileSync(filePath, 'utf-8');
          previewPanel.webview.html = getWebviewHtml(previewPanel, refreshed, recipeName, timestamp);
        }
      },
      null,
      context.subscriptions,
    );
  }

  previewPanel.webview.html = getWebviewHtml(previewPanel, content, recipeName, timestamp);
}

export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  const pendingDir = path.join(workspaceRoot, PENDING_DIR);

  // Ensure pending-changes dir exists
  fs.mkdirSync(pendingDir, { recursive: true });

  // Status bar item showing pending change count
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = 'roland.showPending';
  context.subscriptions.push(statusBarItem);
  refreshStatusBar(pendingDir);

  // Watch for new pending changes
  const pattern = new vscode.RelativePattern(workspaceRoot, `${PENDING_DIR}/**`);
  watcher = vscode.workspace.createFileSystemWatcher(pattern);

  watcher.onDidCreate(uri => {
    if (uri.fsPath.endsWith('.json')) {
      onPendingChangeCreated(uri, workspaceRoot);
    }
  });

  watcher.onDidDelete(() => refreshStatusBar(pendingDir));

  context.subscriptions.push(watcher);

  // Watch for new recipe run output files
  const recipePattern = new vscode.RelativePattern(workspaceRoot, `${RECIPE_RUNS_DIR}/*/output.md`);
  recipeWatcher = vscode.workspace.createFileSystemWatcher(recipePattern);
  recipeWatcher.onDidCreate(uri => showPreview(uri.fsPath, context));
  recipeWatcher.onDidChange(uri => {
    if (previewPanel) {
      showPreview(uri.fsPath, context);
    }
  });
  context.subscriptions.push(recipeWatcher);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('roland.applyChange', () => applyCurrentChange(workspaceRoot)),
    vscode.commands.registerCommand('roland.discardChange', () => discardCurrentChange(workspaceRoot)),
    vscode.commands.registerCommand('roland.applyAll', () => applyAllChanges(workspaceRoot)),
    vscode.commands.registerCommand('roland.discardAll', () => discardAllChanges(workspaceRoot)),
    vscode.commands.registerCommand('roland.showPending', () => showPendingPicker(workspaceRoot)),
    vscode.commands.registerCommand('roland.showPreview', () => {
      // Allow manually opening the preview by picking an existing output.md
      const runsDir = path.join(workspaceRoot, RECIPE_RUNS_DIR);
      if (!fs.existsSync(runsDir)) {
        vscode.window.showInformationMessage('No Roland recipe runs found.');
        return;
      }
      const runs = fs.readdirSync(runsDir)
        .map(name => ({ name, full: path.join(runsDir, name, 'output.md') }))
        .filter(r => fs.existsSync(r.full));
      if (runs.length === 0) {
        vscode.window.showInformationMessage('No Roland recipe output files found.');
        return;
      }
      const items = runs.map(r => ({ label: r.name, filePath: r.full }));
      vscode.window.showQuickPick(items, { placeHolder: 'Select a recipe run to preview' }).then(picked => {
        if (picked) { showPreview(picked.filePath, context); }
      });
    }),
  );

  // Load any existing pending changes
  loadExistingPending(pendingDir, workspaceRoot);
}

export function deactivate() {
  watcher?.dispose();
  recipeWatcher?.dispose();
  statusBarItem?.dispose();
  previewPanel?.dispose();
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

interface PendingManifest {
  originalPath: string;
  proposedContent: string;
  description?: string;
  tool?: string;
  timestamp?: string;
}

function onPendingChangeCreated(uri: vscode.Uri, workspaceRoot: string) {
  try {
    const raw = fs.readFileSync(uri.fsPath, 'utf-8');
    const manifest: PendingManifest = JSON.parse(raw);
    const change = registerChange(manifest, uri.fsPath, workspaceRoot);
    openDiffView(change, workspaceRoot, manifest.description);
    refreshStatusBar(path.join(workspaceRoot, PENDING_DIR));
    vscode.window.showInformationMessage(
      `Roland proposes changes to ${change.relativeName}`,
      'View Diff',
      'Apply',
      'Discard',
    ).then(choice => {
      if (choice === 'Apply') applyChange(change, workspaceRoot);
      else if (choice === 'Discard') discardChange(change, workspaceRoot);
    });
  } catch {
    // Not a valid manifest — ignore
  }
}

function registerChange(manifest: PendingManifest, pendingPath: string, workspaceRoot: string): PendingChange {
  const originalPath = path.isAbsolute(manifest.originalPath)
    ? manifest.originalPath
    : path.join(workspaceRoot, manifest.originalPath);
  const relativeName = path.relative(workspaceRoot, originalPath);

  // Write proposed content to a temp file for diff view
  const proposedPath = pendingPath.replace(/\.json$/, '.proposed');
  fs.writeFileSync(proposedPath, manifest.proposedContent, 'utf-8');

  const change: PendingChange = { originalPath, pendingPath, relativeName };
  activeDiffs.set(pendingPath, change);
  return change;
}

function openDiffView(change: PendingChange, _workspaceRoot: string, description?: string) {
  const originalUri = vscode.Uri.file(change.originalPath);
  const proposedUri = vscode.Uri.file(change.pendingPath.replace(/\.json$/, '.proposed'));
  const title = `${change.relativeName} — ${description || 'Roland proposed change'}`;

  vscode.commands.executeCommand('vscode.diff', originalUri, proposedUri, title);
}

function applyChange(change: PendingChange, workspaceRoot: string) {
  try {
    const proposedPath = change.pendingPath.replace(/\.json$/, '.proposed');
    const content = fs.readFileSync(proposedPath, 'utf-8');
    fs.writeFileSync(change.originalPath, content, 'utf-8');

    // Clean up pending files
    cleanupPendingFiles(change.pendingPath);
    activeDiffs.delete(change.pendingPath);
    refreshStatusBar(path.join(workspaceRoot, PENDING_DIR));

    vscode.window.showInformationMessage(`Applied changes to ${change.relativeName}`);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to apply change: ${err}`);
  }
}

function discardChange(change: PendingChange, workspaceRoot: string) {
  cleanupPendingFiles(change.pendingPath);
  activeDiffs.delete(change.pendingPath);
  refreshStatusBar(path.join(workspaceRoot, PENDING_DIR));

  vscode.window.showInformationMessage(`Discarded changes to ${change.relativeName}`);
}

function cleanupPendingFiles(pendingPath: string) {
  try { fs.unlinkSync(pendingPath); } catch { /* ignore */ }
  try { fs.unlinkSync(pendingPath.replace(/\.json$/, '.proposed')); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

function applyAllChanges(workspaceRoot: string) {
  const changes = Array.from(activeDiffs.values());
  if (changes.length === 0) {
    vscode.window.showInformationMessage('No pending Roland changes.');
    return;
  }
  for (const change of changes) {
    applyChange(change, workspaceRoot);
  }
  vscode.window.showInformationMessage(`Applied ${changes.length} pending changes.`);
}

function discardAllChanges(workspaceRoot: string) {
  const changes = Array.from(activeDiffs.values());
  if (changes.length === 0) {
    vscode.window.showInformationMessage('No pending Roland changes.');
    return;
  }
  for (const change of changes) {
    discardChange(change, workspaceRoot);
  }
  vscode.window.showInformationMessage(`Discarded ${changes.length} pending changes.`);
}

// ---------------------------------------------------------------------------
// Picker & status bar
// ---------------------------------------------------------------------------

async function showPendingPicker(workspaceRoot: string) {
  const changes = Array.from(activeDiffs.values());
  if (changes.length === 0) {
    vscode.window.showInformationMessage('No pending Roland changes.');
    return;
  }

  const items = changes.map(c => ({
    label: c.relativeName,
    description: 'Pending change',
    change: c,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a pending change to review',
  });

  if (picked) {
    openDiffView(picked.change, workspaceRoot);
  }
}

function refreshStatusBar(pendingDir: string) {
  const count = activeDiffs.size;
  if (count === 0) {
    statusBarItem.hide();
  } else {
    statusBarItem.text = `$(git-compare) Roland: ${count} pending`;
    statusBarItem.tooltip = `${count} pending change${count === 1 ? '' : 's'} — click to review`;
    statusBarItem.show();
  }
}

function loadExistingPending(pendingDir: string, workspaceRoot: string) {
  if (!fs.existsSync(pendingDir)) return;
  const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const filePath = path.join(pendingDir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const manifest: PendingManifest = JSON.parse(raw);
      registerChange(manifest, filePath, workspaceRoot);
    } catch {
      // Skip invalid files
    }
  }
  refreshStatusBar(pendingDir);
}

// ---------------------------------------------------------------------------
// Current editor helpers
// ---------------------------------------------------------------------------

function findChangeForActiveEditor(): PendingChange | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  const fsPath = editor.document.uri.fsPath;
  // Match by proposed file path or original path
  for (const change of activeDiffs.values()) {
    const proposedPath = change.pendingPath.replace(/\.json$/, '.proposed');
    if (fsPath === proposedPath || fsPath === change.originalPath) {
      return change;
    }
  }
  return undefined;
}

function applyCurrentChange(workspaceRoot: string) {
  const change = findChangeForActiveEditor();
  if (change) {
    applyChange(change, workspaceRoot);
  } else {
    vscode.window.showWarningMessage('No pending Roland change for this file.');
  }
}

function discardCurrentChange(workspaceRoot: string) {
  const change = findChangeForActiveEditor();
  if (change) {
    discardChange(change, workspaceRoot);
  } else {
    vscode.window.showWarningMessage('No pending Roland change for this file.');
  }
}
