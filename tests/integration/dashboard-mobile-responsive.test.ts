/**
 * Integration: Dashboard mobile responsiveness (wired HTTP + rendered UI).
 *
 * Spawns scripts/serve-dashboard.js on a free port, loads dashboard-ui/index.html
 * via Puppeteer at iPhone-like viewports, and asserts layout stability:
 *   - no horizontal page scroll (portrait + landscape)
 *   - project/quick action buttons stay within viewport
 *   - New Mission form touch + iOS zoom-safe input sizing
 *   - Loop timeline phase chips visible and tappable in portrait
 *
 * Setup: npm run build (serve-dashboard imports dist/rco/* and dist/loop-engine/*).
 * Isolation: fresh server process + browser page + temp state dir per test.
 *
 * Run: npx vitest run tests/integration/dashboard-mobile-responsive.test.ts
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommandBlackboard } from '../../src/rco/command-blackboard.js';
import { RUN_STATE_FILE, SUPERVISOR_PID_FILE } from '../../src/rco/mission-state.js';
import { LOOP_METRICS_FILE } from '../../src/loop-engine/loop-observability.js';
import { LOOP_STATE_FILE } from '../../src/loop-engine/loop-state.js';
import { Phase } from '../../src/loop-engine/loop-phases.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dashboardScript = path.join(repoRoot, 'scripts', 'serve-dashboard.js');
const distMissionState = path.join(repoRoot, 'dist', 'rco', 'mission-state.js');
const distLoopHealth = path.join(repoRoot, 'dist', 'loop-engine', 'loop-health.js');

const servers: ChildProcess[] = [];
const tmpDirs: string[] = [];

/** Representative iPhone viewports (CSS px) — primary Tailscale Safari targets. */
const MOBILE_VIEWPORTS = [
  { name: 'iPhone 14 portrait', width: 390, height: 844 },
  { name: 'iPhone SE portrait', width: 375, height: 667 },
  { name: 'iPhone 14 landscape', width: 844, height: 390 },
] as const;

interface TestHarness {
  stateDir: string;
  port: number;
  baseUrl: string;
  child: ChildProcess;
}

interface OverflowProbe {
  ok: boolean;
  scrollWidth: number;
  clientWidth: number;
  offender?: string;
}

interface SectionOverflowProbe {
  ok: boolean;
  section?: string;
  tag?: string;
  right?: number;
  viewportWidth?: number;
}

let harness: TestHarness;
let browser: Browser;

function ensureDistBuilt(): void {
  if (fs.existsSync(distMissionState) && fs.existsSync(distLoopHealth)) return;
  execSync('npm run build', { cwd: repoRoot, stdio: 'pipe' });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

function makeStateDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-mobile-dash-'));
  tmpDirs.push(dir);
  return dir;
}

function seedResponsiveDashboardState(stateDir: string): void {
  fs.mkdirSync(stateDir, { recursive: true });

  const now = Date.now();
  const board = new CommandBlackboard(stateDir);
  board.appendBullet('Mission Objectives', '[P2 active] Mobile responsiveness validation mission');
  board.setAgentStatus({ callsign: 'Sparrow', state: 'active', lastUpdated: now });
  board.setAgentStatus({ callsign: 'Vanguard', state: 'complete', lastUpdated: now });

  const runState = {
    runId: 'mobile-layout-run',
    goal: 'Mobile responsiveness validation mission',
    status: 'running',
    startedAt: now,
    updatedAt: now,
    totalTasks: 2,
    completedTasks: 1,
    tasks: [],
    activeTaskIds: ['task-2'],
    loopTemplateId: 'standard-code-loop',
    loopPhase: Phase.Verify,
    loopIteration: 1,
    loopRetryCount: 0,
    loopStatus: 'running',
    lastVerification: {
      pass: true,
      summary: 'All scoped mobile layout checks passed',
      at: now,
      durationMs: 420,
      strategies: [{ type: 'unit', pass: true, durationMs: 420 }],
    },
  };
  fs.writeFileSync(path.join(stateDir, RUN_STATE_FILE), JSON.stringify(runState));

  fs.writeFileSync(
    path.join(stateDir, SUPERVISOR_PID_FILE),
    JSON.stringify({ pid: process.pid, goal: runState.goal, startedAt: now }),
  );

  const loopState = {
    templateId: 'standard-code-loop',
    goal: runState.goal,
    iteration: 1,
    retryCount: 0,
    currentPhase: Phase.Verify,
    phaseHistory: [
      { phase: Phase.Plan, startedAt: now - 4000, completedAt: now - 3000, success: true },
      { phase: Phase.Act, startedAt: now - 3000, completedAt: now - 2000, success: true },
      { phase: Phase.Verify, startedAt: now - 2000, completedAt: now - 1000, success: true },
      { phase: Phase.Critique, startedAt: now - 1000, completedAt: now - 500, success: true },
    ],
    status: 'running',
    startedAt: now - 5000,
    updatedAt: now,
  };
  fs.writeFileSync(path.join(stateDir, LOOP_STATE_FILE), JSON.stringify(loopState));

  const loopMetrics = {
    templateId: 'standard-code-loop',
    goal: runState.goal,
    iteration: 1,
    retryCount: 0,
    status: 'running',
    phasesCompleted: 4,
    phasesSucceeded: 4,
    phasesFailed: 0,
    successRate: 100,
    avgPhaseDurationMs: 900,
    phaseDurations: [
      { phase: Phase.Plan, count: 1, totalMs: 1000, avgMs: 1000, successCount: 1, failureCount: 0 },
      { phase: Phase.Act, count: 1, totalMs: 1500, avgMs: 1500, successCount: 1, failureCount: 0 },
      { phase: Phase.Verify, count: 1, totalMs: 800, avgMs: 800, successCount: 1, failureCount: 0 },
      { phase: Phase.Critique, count: 1, totalMs: 600, avgMs: 600, successCount: 1, failureCount: 0 },
    ],
    failureReasons: [],
    estimatedCompletionPct: 80,
    updatedAt: now,
  };
  fs.writeFileSync(path.join(stateDir, LOOP_METRICS_FILE), JSON.stringify(loopMetrics));
}

function spawnDashboard(stateDir: string, port: number): ChildProcess {
  const child = spawn(
    process.execPath,
    [dashboardScript, '--state-dir', stateDir, '--port', String(port), '--host', '127.0.0.1'],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    },
  );
  servers.push(child);
  return child;
}

async function waitForDashboard(baseUrl: string, timeoutMs = 25_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/run-state`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(100);
  }
  throw new Error(`Dashboard not ready at ${baseUrl}`);
}

async function stopDashboard(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    sleep(2_000).then(() => {
      if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL');
    }),
  ]);
}

async function startHarness(): Promise<TestHarness> {
  const stateDir = makeStateDir();
  seedResponsiveDashboardState(stateDir);
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawnDashboard(stateDir, port);
  await waitForDashboard(baseUrl);
  return { stateDir, port, baseUrl, child };
}

async function openOverviewPage(baseUrl: string, viewport: { width: number; height: number }): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#tab-overview.active, #tab-overview.tab-panel.active', { timeout: 20_000 });
  await page.waitForSelector('#mission-goal', { timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const h = getComputedStyle(document.documentElement).getPropertyValue('--shell-sticky-h').trim();
      return h !== '' && h !== '0px';
    },
    { timeout: 15_000 },
  );
  return page;
}

async function waitForLoopTimeline(page: Page): Promise<void> {
  await page.waitForSelector('.loop-phase-chip', { timeout: 20_000 });
}

async function probeHorizontalOverflow(page: Page): Promise<OverflowProbe> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
    const clientWidth = doc.clientWidth;
    if (scrollWidth <= clientWidth + 1) {
      return { ok: true, scrollWidth, clientWidth };
    }
    const wide = [...document.querySelectorAll('body *')].find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > clientWidth + 1;
    });
    return {
      ok: false,
      scrollWidth,
      clientWidth,
      offender: wide
        ? `${wide.tagName.toLowerCase()}${wide.id ? `#${wide.id}` : ''}${wide.className ? `.${String(wide.className).split(/\s+/)[0]}` : ''}`
        : 'unknown',
    };
  });
}

async function probeSectionOverflow(page: Page, sectionSelector: string): Promise<SectionOverflowProbe> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    const viewportWidth = document.documentElement.clientWidth;
    if (!root) return { ok: false, section: selector };
    const nodes = [root, ...root.querySelectorAll('*')];
    for (const node of nodes) {
      const el = node as HTMLElement;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.right > viewportWidth + 1) {
        return {
          ok: false,
          section: selector,
          tag: el.tagName.toLowerCase(),
          right: Math.round(r.right),
          viewportWidth,
        };
      }
    }
    return { ok: true, viewportWidth };
  }, sectionSelector);
}

async function readMinTouchHeight(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return 0;
    const styles = getComputedStyle(el);
    return Math.max(el.getBoundingClientRect().height, parseFloat(styles.minHeight) || 0);
  }, selector);
}

async function readFontSizePx(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return 0;
    return parseFloat(getComputedStyle(el).fontSize) || 0;
  }, selector);
}

describe('dashboard mobile responsiveness (wired HTTP + Puppeteer)', () => {
  beforeAll(async () => {
    ensureDistBuilt();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }, 120_000);

  beforeEach(async () => {
    harness = await startHarness();
  }, 45_000);

  afterEach(async () => {
    await stopDashboard(harness.child);
    for (const proc of servers.splice(0)) {
      if (proc !== harness.child) await stopDashboard(proc);
    }
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    await browser.close();
  });

  it('serves index.html over HTTP with mobile viewport meta (wired stack entry)', async () => {
    const res = await fetch(`${harness.baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/i);
    const html = await res.text();
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('width=device-width');
    expect(html).toContain('syncShellStickyHeight');
    expect(html).toContain('--shell-sticky-h');
  });

  describe.each(MOBILE_VIEWPORTS)('viewport $name ($width×$height)', ({ width, height }) => {
    it('has no horizontal page scroll', async () => {
      const page = await openOverviewPage(harness.baseUrl, { width, height });
      try {
        await waitForLoopTimeline(page);
        const overflow = await probeHorizontalOverflow(page);
        expect(overflow, overflow.offender ?? 'horizontal overflow detected').toMatchObject({ ok: true });
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      } finally {
        await page.close();
      }
    }, 60_000);

    it('keeps top project and quick action buttons within the viewport', async () => {
      const page = await openOverviewPage(harness.baseUrl, { width, height });
      try {
        const projectActions = await probeSectionOverflow(page, '.project-context-actions');
        expect(projectActions, JSON.stringify(projectActions)).toMatchObject({ ok: true });

        const quickActions = await probeSectionOverflow(page, '.quick-actions');
        expect(quickActions, JSON.stringify(quickActions)).toMatchObject({ ok: true });

        const projectWrap = await page.evaluate(() => {
          const row = document.querySelector('.project-context-row');
          if (!row) return null;
          return getComputedStyle(row).flexWrap;
        });
        expect(projectWrap).toMatch(/wrap/);

        const githubBtn = await page.$('#btn-project-github');
        const newBtn = await page.$('#btn-project-new');
        const switchBtn = await page.$('#btn-project-switch');
        expect(githubBtn).not.toBeNull();
        expect(newBtn).not.toBeNull();
        expect(switchBtn).not.toBeNull();

        for (const sel of ['#btn-project-github', '#btn-project-new', '#btn-project-switch', '#btn-qa-board']) {
          const touchH = await readMinTouchHeight(page, sel);
          expect(touchH).toBeGreaterThanOrEqual(44);
        }
      } finally {
        await page.close();
      }
    }, 60_000);
  });

  it('New Mission form fields are mobile-usable (16px inputs, full-width launch, touch target)', async () => {
    const page = await openOverviewPage(harness.baseUrl, { width: 390, height: 844 });
    try {
      const missionOverflow = await probeSectionOverflow(page, '#mission-section');
      expect(missionOverflow).toMatchObject({ ok: true });

      for (const sel of ['#mission-goal', '#mission-run-name', '#mission-priority', '#mission-pm-model-trigger']) {
        const fontSize = await readFontSizePx(page, sel);
        expect(fontSize, `${sel} font-size`).toBeGreaterThanOrEqual(16);
      }

      const launchLayout = await page.evaluate(() => {
        const btn = document.querySelector('#btn-start-mission') as HTMLElement | null;
        const actions = document.querySelector('.mission-actions') as HTMLElement | null;
        if (!btn || !actions) return null;
        const btnRect = btn.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        return {
          btnWidth: btnRect.width,
          actionsWidth: actionsRect.width,
          btnHeight: btnRect.height,
        };
      });
      expect(launchLayout).not.toBeNull();
      expect(launchLayout!.btnHeight).toBeGreaterThanOrEqual(44);
      expect(launchLayout!.btnWidth).toBeGreaterThanOrEqual(launchLayout!.actionsWidth * 0.95);

      await page.focus('#mission-goal');
      await page.keyboard.type('Tailscale mobile mission check');
      const goalValue = await page.$eval('#mission-goal', (el) => (el as HTMLTextAreaElement).value);
      expect(goalValue).toContain('Tailscale mobile mission check');

      await page.select('#mission-priority', 'P2');
      const priority = await page.$eval('#mission-priority', (el) => (el as HTMLSelectElement).value);
      expect(priority).toBe('P2');
    } finally {
      await page.close();
    }
  }, 60_000);

  it('Loop timeline phase chips are visible and tappable in portrait', async () => {
    const page = await openOverviewPage(harness.baseUrl, { width: 390, height: 844 });
    try {
      await waitForLoopTimeline(page);

      const panel = await page.$('.loop-intel-panel');
      expect(panel).not.toBeNull();

      const chipCount = await page.$$eval('.loop-phase-chip', (chips) => chips.length);
      expect(chipCount).toBeGreaterThanOrEqual(3);

      const firstChipMetrics = await page.evaluate(() => {
        const chip = document.querySelector('.loop-phase-chip') as HTMLElement | null;
        if (!chip) return null;
        const rect = chip.getBoundingClientRect();
        const styles = getComputedStyle(chip);
        return {
          height: rect.height,
          minHeight: parseFloat(styles.minHeight) || 0,
          pointerEvents: styles.pointerEvents,
        };
      });
      expect(firstChipMetrics).not.toBeNull();
      expect(firstChipMetrics!.height).toBeGreaterThanOrEqual(44);
      expect(firstChipMetrics!.pointerEvents).not.toBe('none');

      const detailId = await page.$eval('.loop-phase-chip', (chip) => {
        const onclick = chip.getAttribute('onclick') ?? '';
        const match = onclick.match(/toggleLoopPhaseDetail\('([^']+)'\)/);
        return match?.[1] ?? null;
      });
      expect(detailId).toBeTruthy();

      await page.click('.loop-phase-chip');
      const detailOpen = await page.evaluate((id) => {
        const detail = document.getElementById(id!);
        return detail?.classList.contains('open') ?? false;
      }, detailId);
      expect(detailOpen).toBe(true);

      const timelineOverflow = await probeSectionOverflow(page, '.loop-timeline');
      expect(timelineOverflow).toMatchObject({ ok: true });
    } finally {
      await page.close();
    }
  }, 60_000);

  it('tracks dynamic sticky header height via CSS variable after layout', async () => {
    const page = await openOverviewPage(harness.baseUrl, { width: 390, height: 844 });
    try {
      const portraitSticky = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shell-sticky-h')),
      );
      expect(portraitSticky).toBeGreaterThan(40);

      await page.setViewport({ width: 844, height: 390 });
      await page.evaluate(() => {
        window.dispatchEvent(new Event('resize'));
      });
      await sleep(150);

      const landscapeSticky = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shell-sticky-h')),
      );
      expect(landscapeSticky).toBeGreaterThan(30);

      const landscapeOverflow = await probeHorizontalOverflow(page);
      expect(landscapeOverflow).toMatchObject({ ok: true });
    } finally {
      await page.close();
    }
  }, 60_000);
});
