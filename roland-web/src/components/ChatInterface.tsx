'use client';

import { useEffect, useRef, useState } from 'react';
import { useApiKey } from '@/lib/ApiKeyContext';
import { apiFetch } from '@/lib/api';

interface Props {
  projectId: string;
  /** Called when a Roland run creates a new branch (passes the branch name). */
  onBranchCreated?: (branch: string) => void;
}

interface RunResult {
  runId: string;
  status: 'success' | 'error';
  output: string;
  branch: string;
  prUrl: string | null;
}

export function ChatInterface({ projectId, onBranchCreated }: Props) {
  const { apiKey, pmModel, engineerModel } = useApiKey();
  const [goal, setGoal]       = useState('');
  const [output, setOutput]   = useState('');
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

  const outputScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = outputScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output, running]);

  const run = async () => {
    if (!goal.trim() || running) return;

    setRunning(true);
    setOutput('');
    setError('');
    setBranch('');
    setPrUrl('');
    setPrError('');
    setPrIsTransient(false);
    setPrNeedsReconnect(false);
    setLastGoal(goal);

    try {
      const res = await apiFetch(`/api/projects/${projectId}/run`, {
        method: 'POST',
        body: JSON.stringify({ goal }),
        headers: {
          'x-pm-model': pmModel,
          'x-engineer-model': engineerModel,
        },
      }, apiKey);

      const data = await res.json().catch(() => ({})) as Partial<RunResult> & { error?: string };

      if (!res.ok) {
        setError(data.error ?? 'Run failed');
        return;
      }

      setOutput(data.output ?? '');

      if (data.branch) {
        setBranch(data.branch);
        onBranchCreated?.(data.branch);
      }

      if (data.prUrl) {
        setPrUrl(data.prUrl);
      }
    } catch (e: unknown) {
      const raw = (e as Error)?.message ?? '';
      const isNetwork = /fetch|network|failed to fetch|load failed/i.test(raw);
      setError(isNetwork
        ? 'Could not reach the server. Check your connection and try again.'
        : 'Something went wrong. Please try again.');
    } finally {
      setRunning(false);
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
  const placeholder = running
    ? 'Running… Roland is working on your goal. This may take several minutes.'
    : 'Output will appear here.';

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

      {/* Output — plain React state, no streaming or polling */}
      <div
        ref={outputScrollRef}
        className="flex-1 min-h-64 bg-white border border-gray-200 rounded-xl overflow-auto shadow-inner"
      >
        <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words m-0 min-h-[12rem] text-gray-700">
          {output || (running ? placeholder : 'Output will appear here.')}
        </pre>
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
