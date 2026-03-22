/**
 * RCO VS Code Extension — commands to import RCO sessions.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('rco.importSession', async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: { JSON: ['json'] },
        title: 'Select RCO session JSON file',
      });
      if (!uri?.[0]) return;
      await importSessionFromFile(uri[0].fsPath);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('rco.importSessionFromClipboard', async () => {
      const text = await vscode.env.clipboard.readText();
      if (!text.trim()) {
        vscode.window.showWarningMessage('Clipboard is empty or not valid JSON.');
        return;
      }
      try {
        const state = JSON.parse(text);
        await applySessionState(state);
      } catch {
        vscode.window.showErrorMessage('Clipboard content is not valid RCO session JSON.');
      }
    })
  );
}

async function importSessionFromFile(filePath: string): Promise<void> {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const state = JSON.parse(raw);
    await applySessionState(state);
  } catch (e) {
    vscode.window.showErrorMessage(`Failed to import session: ${(e as Error).message}`);
  }
}

async function applySessionState(state: { sessionId?: string; recipe?: string; task?: string; outputs?: Record<string, unknown> }): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showWarningMessage('No workspace folder open.');
    return;
  }
  const cursorRulesDir = path.join(workspaceRoot, '.cursor', 'rules');
  if (!fs.existsSync(cursorRulesDir)) {
    fs.mkdirSync(cursorRulesDir, { recursive: true });
  }
  const sessionId = state.sessionId ?? 'imported';
  const rulePath = path.join(cursorRulesDir, `rco-${sessionId}.mdc`);
  const lines = [
    `# RCO Imported Session: ${sessionId}`,
    `# Recipe: ${state.recipe ?? 'unknown'} | Task: ${state.task ?? ''}`,
    '',
    '## Outputs',
    ...Object.entries(state.outputs ?? {}).map(([agent, out]) => `### ${agent}\n${String(out)}`),
  ];
  fs.writeFileSync(rulePath, lines.join('\n'), 'utf-8');
  vscode.window.showInformationMessage(`RCO session imported: ${rulePath}`);
}

export function deactivate(): void {}
