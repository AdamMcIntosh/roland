import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const PENDING_DIR = '.omc/pending-changes';

/** Tracks which pending file maps to which original file */
interface PendingChange {
  originalPath: string;
  pendingPath: string;
  relativeName: string;
}

let watcher: vscode.FileSystemWatcher | undefined;
let statusBarItem: vscode.StatusBarItem;
const activeDiffs = new Map<string, PendingChange>();

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

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('roland.applyChange', () => applyCurrentChange(workspaceRoot)),
    vscode.commands.registerCommand('roland.discardChange', () => discardCurrentChange(workspaceRoot)),
    vscode.commands.registerCommand('roland.applyAll', () => applyAllChanges(workspaceRoot)),
    vscode.commands.registerCommand('roland.discardAll', () => discardAllChanges(workspaceRoot)),
    vscode.commands.registerCommand('roland.showPending', () => showPendingPicker(workspaceRoot)),
  );

  // Load any existing pending changes
  loadExistingPending(pendingDir, workspaceRoot);
}

export function deactivate() {
  watcher?.dispose();
  statusBarItem?.dispose();
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
