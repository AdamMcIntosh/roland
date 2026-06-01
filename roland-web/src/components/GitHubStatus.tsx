'use client';

import { useEffect, useState } from 'react';
import { useApiKey } from '@/lib/ApiKeyContext';
import { apiFetch } from '@/lib/api';
import { RepoBrowser } from './RepoBrowser';

interface GitHubState {
  connected: boolean;
  login?: string;
  avatarUrl?: string;
  needsReconnect?: boolean;
}

/**
 * Dashboard-level GitHub connection widget.
 *
 * Disconnected  → "Connect GitHub" form (PAT entry)
 * Connected     → username badge + "Import repo" button + disconnect
 */
export function GitHubStatus() {
  const { apiKey } = useApiKey();
  const [gh, setGh]               = useState<GitHubState>({ connected: false });
  const [showForm, setShowForm]   = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [pat, setPat]             = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');

  const load = async () => {
    const res = await apiFetch('/api/github/status', {}, apiKey || undefined);
    if (res.ok) setGh(await res.json());
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pat.trim()) return;
    setBusy(true);
    setError('');
    const res = await apiFetch('/api/github/connect', {
      method: 'POST',
      body: JSON.stringify({ pat: pat.trim() }),
    }, apiKey);
    const d = await res.json().catch(() => ({})) as { ok?: boolean; login?: string; avatarUrl?: string; error?: string };
    if (res.ok) {
      setGh({ connected: true, login: d.login, avatarUrl: d.avatarUrl });
      setShowForm(false);
      setPat('');
    } else {
      setError(d.error ?? 'Could not connect. Please check your token and try again.');
    }
    setBusy(false);
  };

  const disconnect = async () => {
    if (!confirm('Disconnect GitHub? Cloned projects will remain but new clones will require reconnecting.')) return;
    await apiFetch('/api/github/disconnect', { method: 'DELETE' }, apiKey);
    setGh({ connected: false });
  };

  const reconnect = async () => {
    // Clear the stale/corrupted PAT before showing the connect form
    await apiFetch('/api/github/disconnect', { method: 'DELETE' }, apiKey);
    setGh({ connected: false, needsReconnect: false });
    setShowForm(true);
  };

  if (!gh.connected) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {gh.needsReconnect && !showForm && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800 w-full">
            <svg className="w-4 h-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <span className="flex-1">Your GitHub connection has expired or is no longer valid.</span>
            <button
              onClick={reconnect}
              className="shrink-0 font-medium text-amber-900 underline hover:text-amber-700 transition-colors"
            >
              Reconnect
            </button>
          </div>
        )}
        {showForm ? (
          <form onSubmit={connect} className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-col gap-1">
              <input
                type="password"
                placeholder="GitHub Personal Access Token"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                className="field text-sm w-72"
                required
                autoFocus
              />
              {error && <p className="text-red-600 text-xs">{error}</p>}
              <p className="text-gray-400 text-xs">
                Needs <code className="font-mono bg-gray-100 px-1 rounded">repo</code> and <code className="font-mono bg-gray-100 px-1 rounded">read:user</code> scopes.
                {' '}<a
                  href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=Roland+Web"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-kelly-600 hover:underline"
                >
                  Create token ↗
                </a>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy || !pat.trim()} className="btn-sm btn-primary">
                {busy ? 'Connecting…' : 'Connect'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setPat(''); setError(''); }}
                className="text-gray-400 hover:text-gray-700 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg px-3 py-1.5 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Connect GitHub
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        {/* User badge */}
        <div className="flex items-center gap-2">
          {gh.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={gh.avatarUrl}
              alt={gh.login}
              className="w-5 h-5 rounded-full border border-gray-200"
            />
          )}
          <span className="text-sm text-gray-600 font-medium">@{gh.login}</span>
        </div>

        <button
          onClick={() => setShowBrowser(true)}
          className="btn-sm btn-primary"
        >
          + Import repo
        </button>

        <button
          onClick={disconnect}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          Disconnect
        </button>
      </div>

      {showBrowser && <RepoBrowser onClose={() => setShowBrowser(false)} />}
    </>
  );
}
