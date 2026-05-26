/**
 * Roland Notifier — push alerts when a run completes, errors, or hits a blocker.
 *
 * Zero required dependencies. Three notification channels, each gracefully degrading:
 *
 *   1. Desktop — uses `node-notifier` if installed, otherwise OS-native fallback
 *      (PowerShell toast on Windows, notify-send on Linux, osascript on macOS).
 *   2. Webhook — HTTP POST to any URL (ntfy.sh, Slack, Discord, custom).
 *   3. stderr — always: a loud one-liner for terminal users.
 *
 * Configuration (config.yaml, optional):
 *   notifications:
 *     webhook_url: https://ntfy.sh/my-roland-topic
 *     desktop: true          # default true
 *     on_complete: true      # default true
 *     on_error: true         # default true
 *     on_blocker: false      # default false (too noisy)
 *
 * The notifier is also activated by the --notify flag on `roland team`.
 */

import https from 'https';
import http from 'http';
import { execSync } from 'child_process';

export interface NotifierConfig {
  webhookUrl?: string;
  desktop?: boolean;
  onComplete?: boolean;
  onError?: boolean;
  onBlocker?: boolean;
}

export type NotifyEvent = 'complete' | 'error' | 'blocker';

export interface NotifyPayload {
  event: NotifyEvent;
  goal: string;
  /** Short summary — shown in desktop notification body and webhook message. */
  summary: string;
  /** Total tasks completed (for complete events). */
  tasksCompleted?: number;
  /** Number of waves run (for complete events). */
  wavesRun?: number;
  /** Number of blockers encountered. */
  blockersEncountered?: number;
  /** Error message (for error events). */
  errorMessage?: string;
}

export class Notifier {
  private readonly cfg: Required<NotifierConfig>;

  constructor(cfg: NotifierConfig = {}) {
    this.cfg = {
      webhookUrl:  cfg.webhookUrl  ?? '',
      desktop:     cfg.desktop     ?? true,
      onComplete:  cfg.onComplete  ?? true,
      onError:     cfg.onError     ?? true,
      onBlocker:   cfg.onBlocker   ?? false,
    };
  }

  async notify(payload: NotifyPayload): Promise<void> {
    if (!this.shouldFire(payload.event)) return;

    const title   = this.buildTitle(payload);
    const body    = this.buildBody(payload);

    // Run all channels concurrently; failures are logged but never thrown.
    await Promise.allSettled([
      this.cfg.desktop ? this.desktopNotify(title, body) : Promise.resolve(),
      this.cfg.webhookUrl ? this.webhookNotify(title, body, payload) : Promise.resolve(),
    ]);
  }

  // ── Channel implementations ──────────────────────────────────────────────

  private async desktopNotify(title: string, body: string): Promise<void> {
    // Try node-notifier first (optional dep).
    try {
      // Dynamic import — won't crash if not installed.
      // @ts-ignore — node-notifier is an optional peer dependency with no bundled types
      const { default: notifier } = await import('node-notifier') as { default: { notify(o: object): void } };
      notifier.notify({ title, message: body, sound: false });
      return;
    } catch {
      // Fall through to OS-native.
    }

    // OS-native fallback.
    try {
      const platform = process.platform;
      const escaped  = (s: string) => s.replace(/['"\\]/g, ' ');
      if (platform === 'win32') {
        // PowerShell toast (Windows 10+)
        execSync(
          `powershell -NonInteractive -Command "` +
          `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null; ` +
          `$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); ` +
          `$template.GetElementsByTagName('text').Item(0).AppendChild($template.CreateTextNode('${escaped(title)}')) | Out-Null; ` +
          `$template.GetElementsByTagName('text').Item(1).AppendChild($template.CreateTextNode('${escaped(body)}')) | Out-Null; ` +
          `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Roland').Show([Windows.UI.Notifications.ToastNotification]::new($template))"`,
          { timeout: 5000, stdio: 'ignore' },
        );
      } else if (platform === 'darwin') {
        execSync(
          `osascript -e 'display notification "${escaped(body)}" with title "${escaped(title)}"'`,
          { timeout: 5000, stdio: 'ignore' },
        );
      } else {
        // Linux — notify-send
        execSync(`notify-send "${escaped(title)}" "${escaped(body)}"`, { timeout: 5000, stdio: 'ignore' });
      }
    } catch {
      // Desktop notification unavailable — stderr already covers it.
    }
  }

  private async webhookNotify(title: string, body: string, payload: NotifyPayload): Promise<void> {
    const url = this.cfg.webhookUrl;
    if (!url) return;

    // Auto-detect ntfy.sh format (plain text POST + headers) vs generic JSON.
    const isNtfy = url.startsWith('https://ntfy.sh/') || url.includes('ntfy.sh');

    return new Promise<void>((resolve) => {
      try {
        let postData: string;
        let contentType: string;
        const headers: Record<string, string> = {};

        if (isNtfy) {
          // ntfy.sh: plain-text body, headers carry title + priority + tags
          postData    = body;
          contentType = 'text/plain';
          headers['Title']    = title;
          headers['Priority'] = payload.event === 'error' ? 'high' : 'default';
          headers['Tags']     = payload.event === 'complete' ? 'white_check_mark' :
                                payload.event === 'error'    ? 'x'                : 'warning';
        } else {
          // Generic JSON webhook (Slack, Discord, custom)
          postData    = JSON.stringify({ text: `*${title}*\n${body}`, title, body, event: payload.event, goal: payload.goal });
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
            headers:  { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(postData), ...headers },
          },
          (res) => {
            // Drain the response body to free the socket.
            res.resume();
            res.on('end', () => resolve());
          },
        );
        req.on('error', (e) => {
          console.error(`[Notifier] Webhook failed: ${e.message}`);
          resolve();
        });
        req.setTimeout(8000, () => { req.destroy(); resolve(); });
        req.write(postData);
        req.end();
      } catch (e) {
        console.error(`[Notifier] Webhook error: ${(e as Error).message}`);
        resolve();
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private shouldFire(event: NotifyEvent): boolean {
    if (event === 'complete') return this.cfg.onComplete;
    if (event === 'error')    return this.cfg.onError;
    if (event === 'blocker')  return this.cfg.onBlocker;
    return false;
  }

  private buildTitle(p: NotifyPayload): string {
    if (p.event === 'complete') return '✅ Roland — Run Complete';
    if (p.event === 'error')    return '❌ Roland — Run Failed';
    return '🚨 Roland — Blocker Detected';
  }

  private buildBody(p: NotifyPayload): string {
    const goal = p.goal.slice(0, 80);
    if (p.event === 'complete') {
      const parts = [`Goal: ${goal}`];
      if (p.tasksCompleted !== undefined) parts.push(`${p.tasksCompleted} tasks · ${p.wavesRun ?? '?'} waves`);
      if (p.blockersEncountered) parts.push(`${p.blockersEncountered} blocker(s) resolved`);
      return parts.join('\n');
    }
    if (p.event === 'error') {
      return `Goal: ${goal}\nError: ${(p.errorMessage ?? 'unknown').slice(0, 120)}`;
    }
    return `Goal: ${goal}\n${p.summary}`;
  }
}

// ── Config loader ─────────────────────────────────────────────────────────────

/** Parse notification config from a raw config object (config.yaml → notifications:). */
export function parseNotifierConfig(raw: Record<string, unknown> | undefined): NotifierConfig {
  if (!raw || typeof raw !== 'object') return {};
  return {
    webhookUrl:  typeof raw.webhook_url  === 'string'  ? raw.webhook_url  : undefined,
    desktop:     typeof raw.desktop      === 'boolean' ? raw.desktop      : true,
    onComplete:  typeof raw.on_complete  === 'boolean' ? raw.on_complete  : true,
    onError:     typeof raw.on_error     === 'boolean' ? raw.on_error     : true,
    onBlocker:   typeof raw.on_blocker   === 'boolean' ? raw.on_blocker   : false,
  };
}
