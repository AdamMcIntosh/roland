/**
 * Notification defaults from config.yaml `notifications:` section.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface NotificationsYaml {
  desktop?: boolean;
  auto_notify_long_missions?: boolean;
  long_mission_threshold_minutes?: number;
  on_complete?: boolean;
  on_error?: boolean;
  on_blocker?: boolean;
  on_wave?: boolean;
  webhook_url?: string;
}

function findConfigYaml(): string | null {
  const candidates = [
    path.join(process.cwd(), 'config.yaml'),
    path.resolve(import.meta.dirname, '..', '..', 'config.yaml'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function loadNotificationsYaml(): NotificationsYaml {
  const configPath = findConfigYaml();
  if (!configPath) {
    return {
      desktop: true,
      auto_notify_long_missions: true,
      long_mission_threshold_minutes: 3,
      on_complete: true,
      on_error: true,
    };
  }
  try {
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    const n = raw?.notifications;
    if (!n || typeof n !== 'object') {
      return {
        desktop: true,
        auto_notify_long_missions: true,
        long_mission_threshold_minutes: 3,
        on_complete: true,
        on_error: true,
      };
    }
    return n as NotificationsYaml;
  } catch {
    return { desktop: true, auto_notify_long_missions: true, long_mission_threshold_minutes: 3 };
  }
}

/** Heuristic: enable desktop notify when mission likely exceeds threshold minutes. */
export function shouldAutoNotifyForTemplate(
  templateId: string | undefined,
  maxIterations?: number,
): boolean {
  const cfg = loadNotificationsYaml();
  if (cfg.auto_notify_long_missions === false) return false;
  const threshold = cfg.long_mission_threshold_minutes ?? 3;
  const estMinutesPerIter = 2.5;
  const iters = maxIterations ?? (templateId?.includes('small-fix') ? 3 : 5);
  const estMinutes = iters * estMinutesPerIter;
  return estMinutes >= threshold;
}
