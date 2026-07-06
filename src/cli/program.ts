/**
 * ## P2 Polish & Reach
 *
 * Commander-based CLI router — consistent flag parsing, help text, and error messages.
 * Delegates command execution to dispatchCommand in index.ts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import { dispatchCommand, printHelp, KNOWN_CMDS } from './dispatch.js';
import { logger } from '../utils/logger.js';

function readVersion(): string {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return '1.3.0';
  }
}

function normalizeArgv(argv: string[]): { cmd: string | undefined; rest: string[] } {
  let [cmd, ...rest] = argv;

  if (cmd && !cmd.startsWith('-') && !KNOWN_CMDS.has(cmd)) {
    rest = [cmd, ...rest];
    cmd = 'team';
  }

  const globalNotify = process.env.ROLAND_NOTIFY === '1' || process.env.ROLAND_NOTIFY === 'true';
  if (globalNotify && cmd && ['team', 'mission', 'watch', 'pr'].includes(cmd)) {
    if (!rest.includes('--notify') && !rest.includes('-n')) {
      rest = ['--notify', ...rest];
    }
  }

  return { cmd, rest };
}

function buildProgram(): Command {
  const program = new Command();

  program
    .name('roland')
    .description('Roland — Pure ClosedLoop mission harness')
    .version(readVersion(), '-v, --version', 'Print version')
    .helpOption('-h, --help', 'Show help')
    .showHelpAfterError('(run roland --help for usage)');

  program
    .command('team [goal...]', { hidden: false })
    .alias('mission')
    .description('Run a Pure ClosedLoop mission (auto-selects loop template)')
    .option('--loop-template <id>', 'Override auto-selected loop template')
    .option('--background, --detach, -b', 'Run detached in background')
    .option('--state-dir <dir>', 'Persistence directory', '.roland')
    .option('--notify, -n', 'Desktop notification on complete')
    .option('--quiet, -q', 'Suppress progress output')
    .option('--legacy-pm, --use-pm-team', '[DEPRECATED] Legacy PM Team waves')
    .action(async (goalParts: string[], opts, cmdObj) => {
      const rest = [...goalParts, ...collectOptionArgs(cmdObj)];
      await dispatchCommand('team', rest);
    });

  program
    .command('mission-audit [runId]')
    .description('Reconstruct mission timeline from loop history, HITL events, and logs')
    .option('--last', 'Audit the most recent run')
    .option('--format <fmt>', 'Output format: markdown|json|html', 'markdown')
    .option('--open', 'Open HTML/markdown output in browser')
    .option('--state-dir <dir>', 'State directory', '.roland')
    .action(async (runId: string | undefined, opts) => {
      const rest = [
        ...(runId ? [runId] : []),
        ...(opts.last ? ['--last'] : []),
        '--format', opts.format,
        '--state-dir', opts.stateDir,
        ...(opts.open ? ['--open'] : []),
      ];
      await dispatchCommand('mission-audit', rest);
    });

  const monitor = program.command('monitor').description('Mission monitoring commands');
  monitor.command('status').alias('live').description('Use: roland status / roland live');

  return program;
}

/** Collect Commander-parsed options back into legacy argv for team-cli compatibility. */
function collectOptionArgs(cmd: Command): string[] {
  const out: string[] = [];
  const o = cmd.opts() as Record<string, unknown>;
  if (o.stateDir && o.stateDir !== '.roland') out.push('--state-dir', String(o.stateDir));
  if (o.loopTemplate) out.push('--loop-template', String(o.loopTemplate));
  if (o.background) out.push('--background');
  if (o.notify) out.push('--notify');
  if (o.quiet) out.push('--quiet');
  if (o.legacyPm) out.push('--legacy-pm');
  return out;
}

export async function runProgram(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(`roland ${readVersion()}`);
    return;
  }

  if (argv.length === 0 && (process.stdin as NodeJS.ReadStream).isTTY) {
    const { startChat } = await import('../rco/chat-interface.js');
    await startChat();
    return;
  }

  const primary = argv[0];
  const usesCommanderMission =
    primary === 'team' ||
    primary === 'mission' ||
    primary === 'mission-audit';

  if (usesCommanderMission) {
    const program = buildProgram();
    await program.parseAsync(['node', 'roland', ...argv], { from: 'user' });
    return;
  }

  const { cmd, rest } = normalizeArgv(argv);
  await dispatchCommand(cmd, rest);
}
