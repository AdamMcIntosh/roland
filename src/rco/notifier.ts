/**
 * Roland Notifier — push alerts when a run completes, errors, hits a blocker,
 * or crosses other meaningful milestones.
 *
 * Zero required dependencies. Three channels, all gracefully degrading:
 *
 *   1. Desktop  — node-notifier if installed, else OS-native fallback
 *   2. Webhook  — HTTP POST to any URL (ntfy.sh, Slack, Discord, custom)
 *   3. stderr   — always: a one-liner for terminal users
 *
 * Events and when they fire:
 *   complete       — run finished (with or without blockers)
 *   error          — unrecoverable crash / agent exhaustion
 *   blocker        — an agent signalled a BLOCKER (opt-in, off by default)
 *   wave-complete  — a wave finished (opt-in, off by default)
 *   hitl-pause     — run was paused by human operator (always fires when paused)
 *
 * Configuration (config.yaml, notifications: section — all optional):
 *   webhook_url:    https://ntfy.sh/my-topic
 *   desktop:        true
 *   on_complete:    true
 *   on_error:       true
 *   on_blocker:     false
 *   on_wave:        false
 */

import https from 'https';
import http  from 'http';
import { execSync } from 'child_process';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotifierConfig {
  webhookUrl?: string;
  desktop?:    boolean;
  onComplete?: boolean;
  onError?:    boolean;
  onBlocker?:  boolean;
  onWave?:     boolean;
}

export type NotifyEvent = 'complete' | 'error' | 'blocker' | 'wave-complete' | 'hitl-pause';

export interface NotifyPayload {
  event:   NotifyEvent;
  goal:    string;
  /** Short caller-supplied summary. Used as fallback if richer fields are absent. */
  summary: string;

  // ── Complete event ────────────────────────────────────────────────────────
  tasksCompleted?:       number;
  wavesRun?:             number;
  blockersEncountered?:  number;
  /** Total duration of the run in ms. */
  durationMs?:           number;

  // ── Error event ───────────────────────────────────────────────────────────
  errorMessage?: string;

  // ── Blocker event ─────────────────────────────────────────────────────────
  blockerAgent?:        string;   // which agent raised the blocker
  blockerDescription?:  string;   // what it's blocked on
  waveNumber?:          number;

  // ── Wave-complete event ───────────────────────────────────────────────────
  waveTaskTitles?:          string[];  // titles of tasks completed this wave
  tasksCompletedThisWave?:  number;
  remainingTasks?:          number;

  // ── HITL pause event ──────────────────────────────────────────────────────
  pauseReason?: string;

  // ── Generic context ───────────────────────────────────────────────────────
  /** Free-form context line appended to the body. */
  contextLine?: string;
}

// ── Notifier ─────────────────────────────────────────────────────────────────

export class Notifier {
  private readonly cfg: Required<NotifierConfig>;

  constructor(cfg: NotifierConfig = {}) {
    this.cfg = {
      webhookUrl: cfg.webhookUrl ?? '',
      desktop:    cfg.desktop    ?? true,
      onComplete: cfg.onComplete ?? true,
      onError:    cfg.onError    ?? true,
      onBlocker:  cfg.onBlocker  ?? false,
      onWave:     cfg.onWave     ?? false,
    };
  }

  async notify(payload: NotifyPayload): Promise<void> {
    if (!this.shouldFire(payload.event)) return;

    const title = this.buildTitle(payload);
    const body  = this.buildBody(payload);

    // Always write a visible stderr line (terminal users benefit even without desktop/webhook)
    const icon = this.eventIcon(payload.event);
    process.stderr.write(`\n${icon} [Roland] ${title}\n`);
    if (body !== title) {
      for (const line of body.split('\n').slice(0, 4)) {
        if (line.trim()) process.stderr.write(`   ${line}\n`);
      }
    }
    process.stderr.write('\n');

    // Fire configured channels concurrently; failures never throw.
    await Promise.allSettled([
      this.cfg.desktop    ? this.desktopNotify(title, body)               : Promise.resolve(),
      this.cfg.webhookUrl ? this.webhookNotify(title, body, payload) : Promise.resolve(),
    ]);
  }

  // ── Channel implementations ───────────────────────────────────────────────

  private async desktopNotify(title: string, body: string): Promise<void> {
    try {
      // @ts-ignore — optional dep
      const { default: n } = await import('node-notifier') as { default: { notify(o: object): void } };
      n.notify({ title, message: body, sound: false });
      return;
    } catch { /* fall through */ }

    try {
      const p  = process.platform;
      const esc = (s: string) => s.replace(/['"\\]/g, ' ').slice(0, 100);
      if (p === 'win32') {
        execSync(
          `powershell -NonInteractive -Command "` +
          `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null; ` +
          `$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); ` +
          `$template.GetElementsByTagName('text').Item(0).AppendChild($template.CreateTextNode('${esc(title)}')) | Out-Null; ` +
          `$template.GetElementsByTagName('text').Item(1).AppendChild($template.CreateTextNode('${esc(body)}')) | Out-Null; ` +
          `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Roland').Show([Windows.UI.Notifications.ToastNotification]::new($template))"`,
          { timeout: 5000, stdio: 'ignore' },
        );
      } else if (p === 'darwin') {
        execSync(
          `osascript -e 'display notification "${esc(body)}" with title "${esc(title)}"'`,
          { timeout: 5000, stdio: 'ignore' },
        );
      } else {
        execSync(`notify-send "${esc(title)}" "${esc(body)}"`, { timeout: 5000, stdio: 'ignore' });
      }
    } catch { /* notification unavailable */ }
  }

  private async webhookNotify(title: string, body: string, payload: NotifyPayload): Promise<void> {
    const url = this.cfg.webhookUrl;
    if (!url) return;

    const isNtfy = url.includes('ntfy.sh');

    return new Promise<void>((resolve) => {
      try {
        let postData: string;
        let contentType: string;
        const headers: Record<string, string> = {};

        if (isNtfy) {
          postData    = body;
          contentType = 'text/plain';
          headers['Title']    = title;
          headers['Priority'] = this.ntfyPriority(payload.event);
          headers['Tags']     = this.ntfyTags(payload.event);
        } else {
          postData    = JSON.stringify({
            text:  `*${title}*\n${body}`,
            title, body,
            event: payload.event,
            goal:  payload.goal,
          });
          contentType = 'application/json';
        }

        const parsed    = new URL(url);
        const isHttps   = parsed.protocol === 'https:';
        const transport = isHttps ? https : http;

        const req = transport.request(
          {
            hostname: parsed.hostname,
            port:     parsed.port || (isHttps ? 443 : 80),
            path:     parsed.pathname + parsed.search,
            method:   'POST',
            headers:  {
              'Content-Type':   contentType,
              'Content-Length': Buffer.byteLength(postData),
              ...headers,
            },
          },
          (res) => { res.resume(); res.on('end', () => resolve()); },
        );
        req.on('error', (e) => { console.error('[Notifier] Webhook error:', e.message); resolve(); });
        req.setTimeout(8000, () => { req.destroy(); resolve(); });
        req.write(postData);
        req.end();
      } catch (e) {
        console.error('[Notifier] Webhook error:', (e as Error).message);
        resolve();
      }
    });
  }

  // ── Message builders ──────────────────────────────────────────────────────

  private shouldFire(event: NotifyEvent): boolean {
    switch (event) {
      case 'complete':      return this.cfg.onComplete;
      case 'error':         return this.cfg.onError;
      case 'blocker':       return this.cfg.onBlocker;
      case 'wave-complete': return this.cfg.onWave;
      case 'hitl-pause':    return true; // always fire; user explicitly paused
      default:              return false;
    }
  }

  private eventIcon(event: NotifyEvent): string {
    const icons: Record<NotifyEvent, string> = {
      'complete':      '✅',
      'error':         '❌',
      'blocker':       '🚨',
      'wave-complete': '📋',
      'hitl-pause':    '⏸ ',
    };
    return icons[event] ?? '📣';
  }

  private buildTitle(p: NotifyPayload): string {
    const goal = p.goal.slice(0, 50) + (p.goal.length > 50 ? '…' : '');

    switch (p.event) {
      case 'complete': {
        const b = p.blockersEncountered ?? 0;
        const suffix = b > 0 ? ` (${b} blocker${b !== 1 ? 's' : ''} resolved)` : '';
        return `✅ Roland — Complete${suffix}`;
      }
      case 'error':
        return `❌ Roland — Failed`;

      case 'blocker': {
        const agent = p.blockerAgent ? `${p.blockerAgent}` : 'agent';
        return `🚨 Roland — Blocked (${agent})`;
      }
      case 'wave-complete': {
        const w = p.waveNumber ?? '?';
        return `📋 Roland — Wave ${w} Done`;
      }
      case 'hitl-pause':
        return `⏸  Roland — Paused`;

      default:
        return `Roland — ${goal}`;
    }
  }

  private buildBody(p: NotifyPayload): string {
    const goal = p.goal.slice(0, 70) + (p.goal.length > 70 ? '…' : '');
    const lines: string[] = [];

    switch (p.event) {
      case 'complete': {
        lines.push(`"${goal}"`);
        const parts: string[] = [];
        if (p.tasksCompleted !== undefined) parts.push(`${p.tasksCompleted} task${p.tasksCompleted !== 1 ? 's' : ''}`);
        if (p.wavesRun       !== undefined) parts.push(`${p.wavesRun} wave${p.wavesRun !== 1 ? 's' : ''}`);
        if (p.durationMs     !== undefined) parts.push(formatDurationShort(p.durationMs));
        if (parts.length)                   lines.push(parts.join(' · '));
        const b = p.blockersEncountered ?? 0;
        if (b > 0) lines.push(`⚠️  ${b} blocker${b !== 1 ? 's' : ''} were encountered and resolved`);
        break;
      }
      case 'error': {
        lines.push(`"${goal}"`);
        const err = (p.errorMessage ?? p.summary ?? 'Unknown error').slice(0, 150);
        lines.push(`Error: ${err}`);
        break;
      }
      case 'blocker': {
        lines.push(`"${goal}"`);
        if (p.waveNumber)         lines.push(`Wave ${p.waveNumber}`);
        if (p.blockerDescription) lines.push(`Blocked on: ${p.blockerDescription.slice(0, 120)}`);
        else if (p.summary)       lines.push(p.summary.slice(0, 120));
        lines.push(`Run \`roland unblock\` to send guidance, or wait for PM to resolve.`);
        break;
      }
      case 'wave-complete': {
        lines.push(`"${goal}"`);
        const n = p.tasksCompletedThisWave ?? 0;
        lines.push(`${n} task${n !== 1 ? 's' : ''} completed`);
        if (p.waveTaskTitles && p.waveTaskTitles.length > 0) {
          const preview = p.waveTaskTitles.slice(0, 3).join(', ');
          lines.push(preview.slice(0, 120));
        }
        if (p.remainingTasks !== undefined && p.remainingTasks > 0) {
          lines.push(`${p.remainingTasks} task${p.remainingTasks !== 1 ? 's' : ''} remaining`);
        }
        lines.push('Lead PM reviewing…');
        break;
      }
      case 'hitl-pause': {
        lines.push(`"${goal}"`);
        lines.push(p.pauseReason ?? 'Paused by human operator');
        lines.push('Send `roland resume` to continue.');
        break;
      }
    }

    if (p.contextLine) lines.push(p.contextLine);

    return lines.join('\n');
  }

  private ntfyPriority(event: NotifyEvent): string {
    if (event === 'error' || event === 'blocker') return 'high';
    if (event === 'hitl-pause') return 'urgent';
    return 'default';
  }

  private ntfyTags(event: NotifyEvent): string {
    const map: Record<NotifyEvent, string> = {
      'complete':      'white_check_mark',
      'error':         'x',
      'blocker':       'warning',
      'wave-complete': 'clipboard',
      'hitl-pause':    'double_vertical_bar',
    };
    return map[event] ?? 'bell';
  }
}

// ── Config loader ─────────────────────────────────────────────────────────────

export function parseNotifierConfig(raw: Record<string, unknown> | undefined): NotifierConfig {
  if (!raw || typeof raw !== 'object') return {};
  return {
    webhookUrl: typeof raw.webhook_url === 'string'  ? raw.webhook_url : undefined,
    desktop:    typeof raw.desktop     === 'boolean' ? raw.desktop     : true,
    onComplete: typeof raw.on_complete === 'boolean' ? raw.on_complete : true,
    onError:    typeof raw.on_error    === 'boolean' ? raw.on_error    : true,
    onBlocker:  typeof raw.on_blocker  === 'boolean' ? raw.on_blocker  : false,
    onWave:     typeof raw.on_wave     === 'boolean' ? raw.on_wave     : false,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatDurationShort(ms: number): string {
  if (ms < 60_000)       return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000)    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}
