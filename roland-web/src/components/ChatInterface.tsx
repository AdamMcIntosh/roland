'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useApiKey } from '@/lib/ApiKeyContext';
import { apiFetch } from '@/lib/api';

interface Props {
  projectId: string;
  /** Called when a Roland run creates a new branch (passes the branch name). */
  onBranchCreated?: (branch: string) => void;
}

interface PollData {
  status: string;
  output: string;
  branch: string;
  prUrl: string | null;
  finishedAt: number | null;
}

/** Strip ANSI escape codes and internal Roland markers before display. */
function sanitizeOutput(text: string): string {
  return text
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/\n?\[ROLAND_DONE\]\n?/g, '')
    .replace(/\n?\[ROLAND_PR\]: https?:\/\/\S+\n?/g, '');
}

export function ChatInterface({ projectId, onBranchCreated }: Props) {
  const { apiKey, pmModel, engineerModel } = useApiKey();
  const [goal, setGoal]       = useState('');
  const [output, setOutput]   = useState('');
  /** Bumped on every output write to force the output node to re-render. */
  const [outputVersion, setOutputVersion] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState('');

  // Branch / PR state
  const [branch, setBranch]   = useState('');
  const [lastGoal, setLastGoal] = useState('');
  const [prUrl, setPrUrl]               = useState('');
  const [prBusy, setPrBusy]             = useState(false);
  const [prError, setPrError]           = useState('');
  const [prIsTransient, setPrIsTransient]     = useState(false);
  const [prNeedsReconnect, setPrNeedsReconnect] = useState(false);

  // Polling refs — not state because changing them must not trigger re-renders
  const runIdRef        = useRef<string>('');
  const lastLenRef      = useRef<number>(0);
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInFlightRef = useRef<boolean>(false);

  const outputScrollRef = useRef<HTMLDivElement>(null);
  const outputPreRef    = useRef<HTMLPreElement>(null);
  /** Canonical accumulated output — ref avoids stale closures in poll callbacks. */
  const outputBufferRef = useRef('');
  const runningRef      = useRef(false);

  const scrollOutputToBottom = useCallback(() => {
    const scrollEl = outputScrollRef.current;
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }, []);

  /** Write text directly to the DOM — bypasses React reconciliation for streaming output. */
  const paintOutputDom = useCallback((text: string) => {
    const pre = outputPreRef.current;
    if (!pre) return;

    if (text.length > 0) {
      pre.textContent = text;
      pre.classList.remove('text-gray-400');
      pre.classList.add('text-gray-700');
    } else {
      pre.textContent = runningRef.current
        ? 'Starting Roland…'
        : 'Output will appear here.';
      pre.classList.remove('text-gray-700');
      pre.classList.add('text-gray-400');
    }

    scrollOutputToBottom();
  }, [scrollOutputToBottom]);

  /**
   * Commit output: ref is source of truth → paint DOM immediately → sync React state.
   * Poll callbacks run outside React events, so imperative paint is the primary path.
   */
  const commitOutput = useCallback((updater: string | ((prev: string) => string)) => {
    const next = typeof updater === 'function'
      ? updater(outputBufferRef.current)
      : updater;

    outputBufferRef.current = next;

    // 1. Imperative paint — always visible even if React batching defers the re-render
    paintOutputDom(next);

    // 2. Sync React state for consistency / devtools
    try {
      flushSync(() => {
        setOutput(next);
        setOutputVersion((v) => v + 1);
      });
    } catch {
      // flushSync throws if called during render — DOM is already correct
    }

    // 3. Fallback after paint: re-apply if React overwrote or skipped the text node
    requestAnimationFrame(() => {
      const pre = outputPreRef.current;
      if (!pre) return;
      const expected = outputBufferRef.current;
      if (expected.length > 0 && pre.textContent !== expected) {
        pre.textContent = expected;
        pre.classList.remove('text-gray-400');
        pre.classList.add('text-gray-700');
      }
      scrollOutputToBottom();
    });
  }, [paintOutputDom, scrollOutputToBottom]);

  // Keep runningRef in sync for placeholder text inside paintOutputDom
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // Safety net: re-paint from buffer whenever React re-renders the output panel
  useLayoutEffect(() => {
    paintOutputDom(outputBufferRef.current);
  }, [output, outputVersion, paintOutputDom]);

  // Clear the polling interval on unmount so we don't leak timers.
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const run = async () => {
    if (!goal.trim() || running) return;
    stopPolling();
    runningRef.current = true;
    setRunning(true);
    commitOutput('');
    setError('');
    setBranch('');
    setPrUrl('');
    setPrError('');
    setPrIsTransient(false);
    setPrNeedsReconnect(false);
    setLastGoal(goal);
    runIdRef.current  = '';
    lastLenRef.current = 0;
    pollInFlightRef.current = false;

    try {
      const res = await apiFetch(`/api/projects/${projectId}/run`, {
        method: 'POST',
        body: JSON.stringify({ goal }),
        headers: {
          'x-pm-model': pmModel,
          'x-engineer-model': engineerModel,
        },
      }, apiKey);

      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setError(d.error ?? 'Run failed');
        setRunning(false);
        return;
      }

      const { runId, branch: branchName } = await res.json() as { runId: string; branch: string };
      runIdRef.current = runId;

      if (branchName) {
        setBranch(branchName);
        onBranchCreated?.(branchName);
      }

      // Poll every 1.5 s for new output and run status.
      const doPoll = async () => {
        if (pollInFlightRef.current) return;
        pollInFlightRef.current = true;

        try {
          const activeRunId = runIdRef.current;
          if (!activeRunId) return;

          const resp = await apiFetch(`/api/projects/runs/${activeRunId}`, {}, apiKey);
          if (!resp.ok) {
            console.warn('[Poll] non-OK status:', resp.status);
            return; // network blip — keep polling
          }
          const data = await resp.json() as PollData;
          const rawOutput = data.output ?? '';
          const totalLen = rawOutput.length;
          console.log('[Poll] response:', data.status, 'totalOutputLen:', totalLen, 'lastLen:', lastLenRef.current, 'prUrl:', data.prUrl);

          // Ignore out-of-order poll responses that would rewind the read pointer.
          if (totalLen < lastLenRef.current) {
            console.warn('[Poll] stale response ignored');
            return;
          }

          const isDone =
            data.status === 'success' ||
            data.status === 'error' ||
            data.finishedAt != null;

          if (data.prUrl) setPrUrl(data.prUrl);

          if (isDone) {
            console.log('[Poll] run finished, status:', data.status);
            const full = sanitizeOutput(rawOutput);
            commitOutput(full);
            lastLenRef.current = totalLen;
            stopPolling();
            runningRef.current = false;
            setRunning(false);
            return;
          }

          // Append only the bytes we haven't shown yet
          const newChunk = rawOutput.slice(lastLenRef.current);
          console.log('[UI] newChunk length:', newChunk.length);

          if (newChunk.length > 0) {
            const display = sanitizeOutput(newChunk);
            console.log('[UI] Appending output length:', display.length);
            commitOutput((prev) => prev + display);
            lastLenRef.current = totalLen;
          }
        } catch (err) {
          // Log but keep polling — transient network errors shouldn't stop the UI
          console.warn('[Poll] error (will retry):', err);
        } finally {
          pollInFlightRef.current = false;
        }
      };

      void doPoll();
      pollRef.current = setInterval(() => void doPoll(), 1500);
    } catch (e: unknown) {
      const raw = (e as Error)?.message ?? '';
      const isNetwork = /fetch|network|failed to fetch|load failed/i.test(raw);
      setError(isNetwork
        ? 'Could not reach the server. Check your connection and try again.'
        : 'Something went wrong. Please try again.');
      setRunning(false);
    }
  };

  const stop = async () => {
    stopPolling();
    runningRef.current = false;
    setRunning(false);
    const runId = runIdRef.current;
    if (runId) {
      // Best-effort cancel — kill the child process server-side
      apiFetch(`/api/projects/runs/${runId}/cancel`, { method: 'POST' }, apiKey).catch(() => {});
    }
  };

  const createPR = async () => {
    if (!branch) return;
    setPrBusy(true);
    setPrError('');
    const res = await apiFetch(`/api/projects/${projectId}/github/pr`, {
      method: 'POST',
      body: JSON.stringify({
        branch,
        title: `Roland: ${lastGoal}`,
        body: `## Roland Run\n\n**Goal:** ${lastGoal}\n\nGenerated automatically by Roland.`,
      }),
    }, apiKey);
    const d = await res.json().catch(() => ({})) as { prUrl?: string; error?: string; isTransient?: boolean; needsReconnect?: boolean };
    if (res.ok && d.prUrl) {
      setPrUrl(d.prUrl);
      setPrError('');
      setPrIsTransient(false);
      setPrNeedsReconnect(false);
    } else {
      setPrError(d.error ?? 'Could not create pull request. Please try again.');
      setPrIsTransient(!!d.isTransient);
      setPrNeedsReconnect(!!d.needsReconnect);
    }
    setPrBusy(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run();
  };

  const showPRBanner = !running && branch && !prUrl;

  return (
    <div className="flex flex-col gap-4 flex-1">

      {/* Input area */}
      <div className="flex gap-3">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={'Describe your goal…\ne.g. "Add input validation to the registration endpoint"'}
          className="flex-1 field resize-none font-sans text-sm"
          rows={3}
          disabled={running}
        />
        <div className="flex flex-col gap-2">
          <button
            onClick={run}
            disabled={running || !goal.trim()}
            className="bg-kelly-600 hover:bg-kelly-700 disabled:opacity-40 text-white rounded-lg px-4 py-2 font-medium transition-colors whitespace-nowrap"
          >
            {running ? 'Running…' : 'Run'}
          </button>
          {running && (
            <button onClick={stop} className="btn-sm text-xs">Stop</button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400">⌘+Enter to run</p>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {/* Active branch badge */}
      {branch && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-1 font-mono">
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.75 2.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zm.75 2.75a2.25 2.25 0 1 1-1.5-2.122V6A2.5 2.5 0 0 1 8.5 8.5H6.25a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V9.5a2.5 2.5 0 0 1 2.5-2.5h2.25A1 1 0 0 0 9.5 6V5.128A2.252 2.252 0 0 1 12.5 2.5 2.25 2.25 0 0 1 12.5 5.25z"/>
            </svg>
            {branch}
          </span>
          {running && <span className="text-gray-400 animate-pulse">Roland is working…</span>}
        </div>
      )}

      {/* Output — imperative textContent via outputPreRef; React state is secondary */}
      <div
        ref={outputScrollRef}
        className="flex-1 min-h-64 bg-white border border-gray-200 rounded-xl overflow-auto shadow-inner"
      >
        <pre
          ref={outputPreRef}
          data-output-panel
          className="p-4 text-sm font-mono whitespace-pre-wrap m-0 text-gray-400"
        />
      </div>

      {/* Push & PR banner — fallback if auto-PR failed or no PAT configured */}
      {showPRBanner && (
        <div className="bg-kelly-50 border border-kelly-200 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-kelly-900">
                Run complete on <code className="font-mono text-xs bg-kelly-100 px-1 rounded">{branch}</code>
              </p>
              <p className="text-xs text-kelly-700 mt-0.5">
                Stage, commit, and open a pull request on GitHub.
              </p>
            </div>
            <button
              onClick={createPR}
              disabled={prBusy}
              className="btn-sm btn-primary shrink-0 disabled:opacity-40"
            >
              {prBusy ? 'Creating PR…' : 'Push & Create PR'}
            </button>
          </div>

          {prError && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <span className="flex-1">{prError}</span>
              {prIsTransient && (
                <button
                  onClick={createPR}
                  disabled={prBusy}
                  className="font-medium underline hover:text-red-900 transition-colors whitespace-nowrap disabled:opacity-40"
                >
                  Retry
                </button>
              )}
              {prNeedsReconnect && (
                <a
                  href="/dashboard"
                  className="font-medium underline hover:text-red-900 transition-colors whitespace-nowrap"
                >
                  Reconnect GitHub
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* PR created confirmation */}
      {prUrl && (
        <div className="bg-kelly-50 border border-kelly-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-kelly-900">Pull request created ✓</p>
            <p className="text-xs text-kelly-700 mt-0.5 font-mono truncate">{prUrl}</p>
          </div>
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-sm btn-primary shrink-0 whitespace-nowrap"
          >
            View PR ↗
          </a>
        </div>
      )}
    </div>
  );
}
