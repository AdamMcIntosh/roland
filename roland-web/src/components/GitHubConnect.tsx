'use client';

import { useState } from 'react';
import { useApiKey } from '@/lib/ApiKeyContext';
import { apiFetch } from '@/lib/api';

interface Project {
  id: string;
  github_owner: string | null;
  github_repo: string | null;
}

interface GitHubError {
  message: string;
  isTransient?: boolean;
  needsReconnect?: boolean;
}

interface Props {
  project: Project;
  /** Active branch on this project (e.g. "roland/add-validation"). */
  activeBranch?: string;
  onUpdate: () => void;
}

/**
 * Project-page GitHub widget.
 *
 * Connected     → owner/repo label + Pull button + Create PR button
 * Not connected → link to dashboard to import via GitHub, or manual connect form
 */
export function GitHubConnect({ project, activeBranch, onUpdate }: Props) {
  const { apiKey } = useApiKey();
  const [ghError, setGhError]       = useState<GitHubError | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [prUrl, setPrUrl]           = useState('');
  const [busy, setBusy]             = useState(false);
  const [lastAction, setLastAction] = useState<(() => void) | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [form, setForm]             = useState({ owner: '', repo: '', pat: '' });

  const connected = !!project.github_owner;

  const clearFeedback = () => { setGhError(null); setSuccessMsg(''); };

  // ── Pull ──────────────────────────────────────────────────────────────────
  const pull = async () => {
    setBusy(true);
    clearFeedback();
    setLastAction(() => pull);
    const res = await apiFetch(`/api/projects/${project.id}/github/pull`, { method: 'POST' }, apiKey);
    const d = await res.json().catch(() => ({})) as { error?: string; isTransient?: boolean; needsReconnect?: boolean };
    if (res.ok) {
      setSuccessMsg('Pulled successfully');
      onUpdate();
    } else {
      setGhError({ message: d.error ?? 'Pull failed. Please try again.', isTransient: d.isTransient, needsReconnect: d.needsReconnect });
    }
    setBusy(false);
  };

  // ── Create PR ─────────────────────────────────────────────────────────────
  const createPR = async (branch: string) => {
    const title = `Roland: work on ${project.github_owner}/${project.github_repo}`;
    setBusy(true);
    clearFeedback();
    setLastAction(() => () => createPR(branch));
    const res = await apiFetch(`/api/projects/${project.id}/github/pr`, {
      method: 'POST',
      body: JSON.stringify({ branch, title }),
    }, apiKey);
    const d = await res.json().catch(() => ({})) as { prUrl?: string; error?: string; isTransient?: boolean; needsReconnect?: boolean };
    if (res.ok && d.prUrl) {
      setPrUrl(d.prUrl);
    } else {
      setGhError({ message: d.error ?? 'Could not create pull request. Please try again.', isTransient: d.isTransient, needsReconnect: d.needsReconnect });
    }
    setBusy(false);
  };

  // ── Manual connect (fallback for non-cloned projects) ────────────────────
  const connectManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await apiFetch(`/api/projects/${project.id}/github/connect`, {
      method: 'POST',
      body: JSON.stringify(form),
    }, apiKey);
    if (res.ok) {
      setShowManual(false);
      setForm({ owner: '', repo: '', pat: '' });
      clearFeedback();
      onUpdate();
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setGhError({ message: d.error ?? 'Could not connect. Check the owner, repo name, and token scopes.' });
    }
    setBusy(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-end gap-2">
      {/* Main action row */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {successMsg && (
          <span className="text-xs text-kelly-600 font-medium">{successMsg}</span>
        )}

        {connected ? (
          <>
            <a
              href={`https://github.com/${project.github_owner}/${project.github_repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {project.github_owner}/{project.github_repo} ↗
            </a>

            <button onClick={pull} disabled={busy} className="btn-sm">
              {busy ? '…' : 'Pull'}
            </button>

            {prUrl ? (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-sm btn-primary whitespace-nowrap"
              >
                View PR ↗
              </a>
            ) : activeBranch ? (
              <button
                onClick={() => createPR(activeBranch)}
                disabled={busy}
                className="btn-sm btn-primary whitespace-nowrap"
              >
                {busy ? 'Creating…' : 'Create PR'}
              </button>
            ) : null}
          </>
        ) : showManual ? (
          <form onSubmit={connectManual} className="flex items-center gap-2 flex-wrap">
            <input placeholder="owner" value={form.owner}
              onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
              className="input-sm" required />
            <input placeholder="repo" value={form.repo}
              onChange={(e) => setForm((f) => ({ ...f, repo: e.target.value }))}
              className="input-sm" required />
            <input type="password" placeholder="PAT" value={form.pat}
              onChange={(e) => setForm((f) => ({ ...f, pat: e.target.value }))}
              className="input-sm" required />
            <button type="submit" disabled={busy} className="btn-sm btn-primary">Connect</button>
            <button type="button" onClick={() => setShowManual(false)}
              className="text-gray-400 hover:text-gray-700 text-sm transition-colors">
              Cancel
            </button>
          </form>
        ) : (
          <button onClick={() => setShowManual(true)} className="btn-sm">
            Link GitHub repo
          </button>
        )}
      </div>

      {/* Error callout */}
      {ghError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 max-w-sm w-full">
          <span className="flex-1">{ghError.message}</span>
          <div className="flex items-center gap-2 shrink-0">
            {ghError.isTransient && lastAction && (
              <button
                onClick={() => { clearFeedback(); lastAction(); }}
                className="font-medium underline hover:text-red-900 transition-colors whitespace-nowrap"
              >
                Retry
              </button>
            )}
            {ghError.needsReconnect && (
              <button
                onClick={() => { clearFeedback(); setShowManual(true); }}
                className="font-medium underline hover:text-red-900 transition-colors whitespace-nowrap"
              >
                Reconnect
              </button>
            )}
            <button
              onClick={clearFeedback}
              className="text-red-400 hover:text-red-700 transition-colors"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
