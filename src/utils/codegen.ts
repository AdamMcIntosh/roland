import fs from 'fs/promises';
import path from 'path';

export interface CodeArtifact {
  filePath: string;
  content: string;
  language?: string;
}

export interface WriteArtifactsResult {
  written: string[];
  skipped: Array<{ filePath: string; reason: string }>;
}

function cleanFilePath(rawPath: string): string {
  return rawPath.trim().replace(/^['"]|['"]$/g, '');
}

function parseInfoString(info: string): { filePath?: string; language?: string } {
  const trimmed = info.trim();
  if (!trimmed) {
    return {};
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  let filePath: string | undefined;
  let language: string | undefined;

  for (const token of tokens) {
    const lowered = token.toLowerCase();
    if (lowered.startsWith('file=') || lowered.startsWith('filepath=') || lowered.startsWith('path=')) {
      filePath = cleanFilePath(token.split('=')[1] || '');
      continue;
    }

    if (lowered.startsWith('file:') || lowered.startsWith('filepath:') || lowered.startsWith('path:')) {
      filePath = cleanFilePath(token.split(':')[1] || '');
      continue;
    }
  }

  if (!filePath) {
    const pathToken = tokens.find((token) => /[\\/]/.test(token) || /\.[a-z0-9]+$/i.test(token));
    if (pathToken) {
      filePath = cleanFilePath(pathToken);
    }
  }

  if (tokens.length > 0 && !tokens[0].includes('=') && !tokens[0].includes(':')) {
    language = tokens[0];
  }

  return { filePath, language };
}

function extractFilePathFromContent(content: string): { filePath?: string; strippedContent: string } {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) {
    return { strippedContent: content };
  }

  const firstLine = lines[0];
  const match = firstLine.match(/^\s*(?:\/\/|#|<!--|\/\*)\s*file(?:path)?\s*:\s*(.+?)\s*(?:-->|\*\/)?\s*$/i);
  if (match && match[1]) {
    const filePath = cleanFilePath(match[1]);
    return { filePath, strippedContent: lines.slice(1).join('\n') };
  }

  return { strippedContent: content };
}

export function extractFileArtifactsFromOutput(output: string): CodeArtifact[] {
  const artifacts: CodeArtifact[] = [];
  const fenceRegex = /```([^\n]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null = null;

  while ((match = fenceRegex.exec(output)) !== null) {
    const info = match[1] || '';
    const body = match[2] || '';
    const { filePath: infoPath, language } = parseInfoString(info);
    const { filePath: contentPath, strippedContent } = extractFilePathFromContent(body);
    const filePath = infoPath || contentPath;

    if (!filePath) {
      continue;
    }

    const cleaned = strippedContent.replace(/^\n+|\n+$/g, '');
    if (!cleaned) {
      continue;
    }

    artifacts.push({
      filePath,
      content: cleaned,
      language,
    });
  }

  return artifacts;
}

export async function writeFileArtifactsToDirectory(
  artifacts: CodeArtifact[],
  options?: {
    baseDir?: string;
    overwrite?: boolean;
    confirmOverwrite?: (filePath: string) => Promise<boolean>;
  }
): Promise<WriteArtifactsResult> {
  const baseDir = options?.baseDir || process.cwd();
  const overwrite = options?.overwrite === true;
  const confirmOverwrite = options?.confirmOverwrite;
  const written: string[] = [];
  const skipped: Array<{ filePath: string; reason: string }> = [];

  for (const artifact of artifacts) {
    const targetPath = path.resolve(baseDir, artifact.filePath);
    const normalizedBase = path.resolve(baseDir);

    if (!targetPath.startsWith(normalizedBase)) {
      skipped.push({ filePath: artifact.filePath, reason: 'outside base directory' });
      continue;
    }

    try {
      const existing = await fs.stat(targetPath).then(() => true).catch(() => false);
      if (existing) {
        if (!overwrite) {
          skipped.push({ filePath: artifact.filePath, reason: 'file exists' });
          continue;
        }

        if (!confirmOverwrite) {
          skipped.push({ filePath: artifact.filePath, reason: 'overwrite requires confirmation' });
          continue;
        }

        const approved = await confirmOverwrite(artifact.filePath);
        if (!approved) {
          skipped.push({ filePath: artifact.filePath, reason: 'overwrite not approved' });
          continue;
        }
      }

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, artifact.content, 'utf-8');
      written.push(artifact.filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skipped.push({ filePath: artifact.filePath, reason: message });
    }
  }

  return { written, skipped };
}
