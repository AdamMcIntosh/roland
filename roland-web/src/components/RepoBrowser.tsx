'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApiKey } from '@/lib/ApiKeyContext';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface Repo {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  language: string | null;
  updatedAt: string;
  isPrivate: boolean;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12)  return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', Ruby: '#701516',
  'C#': '#178600', 'C++': '#f34b7d', PHP: '#4F5D95', Swift: '#F05138',
};

export function RepoBrowser({ onClose }: { onClose: () => void }) {
  const { apiKey } = useApiKey();
  const router = useRouter();

  const [repos, setRepos]         = useState<Repo[]>([]);
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(false);
  const [query, setQuery]         = useState('');
  const [loading, setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cloning, setCloning]     = useState<string | null>(null);
  const [error, setError]         = useState('');

  const fetchPage = useCallback(async (p: number, append: boolean) => {
    const params = new URLSearchParams({ page: String(p), per_page: '50' });
    if (query) params.set('q', query);
    const res = await apiFetch(`/api/github/repos?${params}`, {}, apiKey);
    if (!res.ok) { setError('Failed to load repositories'); return; }
    const data = await res.json() as { repos: Repo[]; hasMore: boolean };
    setRepos((prev) => append ? [...prev, ...data.repos] : data.repos);
    setHasMore(data.hasMore);
  }, [apiKey, query]);

  // Re-fetch when query changes (debounced)
  useEffect(() => {
    setPage(1);
    setLoading(true);
    const t = setTimeout(() => {
      fetchPage(1, false).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, fetchPage]);

  const loadMore = async () => {
    const next = page + 1;
    setPage(next);
    setLoadingMore(true);
    await fetchPage(next, true);
    setLoadingMore(false);
  };

  const clone = async (repo: Repo) => {
    setCloning(repo.fullName);
    setError('');
    const res = await apiFetch('/api/github/clone', {
      method: 'POST',
      body: JSON.stringify({ owner: repo.owner, repo: repo.name }),
    }, apiKey);
    const data = await res.json().catch(() => ({})) as { projectId?: string; error?: string; alreadyExists?: boolean };
    if (!res.ok) {
      setError(data.error ?? 'Clone failed');
      setCloning(null);
      return;
    }
    // Navigate to the new (or existing) project
    router.push(`/dashboard/${data.projectId}`);
  };

  // Filter displayed repos by query (client-side, server already filtered by q)
  const displayed = repos;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Import from GitHub</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100">
          <input
            type="search"
            placeholder="Search repositories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="field text-sm"
            autoFocus
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <p className="text-red-600 text-sm px-6 py-4">{error}</p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-gray-400 text-sm">Loading repositories…</span>
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-gray-400 text-sm">No repositories found.</span>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {displayed.map((repo) => (
                <li
                  key={repo.id}
                  className="flex items-start justify-between gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 text-sm truncate">
                        {repo.fullName}
                      </span>
                      {repo.isPrivate && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
                          private
                        </span>
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{repo.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                      {repo.language && (
                        <span className="flex items-center gap-1">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: LANG_COLORS[repo.language] ?? '#888' }}
                          />
                          {repo.language}
                        </span>
                      )}
                      <span>Updated {relativeTime(repo.updatedAt)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => clone(repo)}
                    disabled={cloning !== null}
                    className="btn-sm btn-primary shrink-0 disabled:opacity-40"
                  >
                    {cloning === repo.fullName ? 'Cloning…' : 'Clone'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {hasMore && !loading && (
            <div className="px-6 py-4 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn-sm disabled:opacity-40"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
