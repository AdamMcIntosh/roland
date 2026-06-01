'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApiKey } from '@/lib/ApiKeyContext';
import { apiFetch } from '@/lib/api';

interface Project {
  id: string;
  name: string;
  path: string;
  github_owner: string | null;
  github_repo: string | null;
  created_at: number;
}

export function ProjectList() {
  const { apiKey } = useApiKey();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', path: '' });
  const [error, setError] = useState('');

  const load = async () => {
    if (!apiKey) return;
    const res = await apiFetch('/api/projects', {}, apiKey);
    if (res.ok) setProjects(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, [apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const addProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify(form),
    }, apiKey);

    if (res.ok) {
      setShowAdd(false);
      setForm({ name: '', path: '' });
      setError('');
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'Failed to add project');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this project? All run history will also be removed.')) return;
    const res = await apiFetch(`/api/projects/${id}`, { method: 'DELETE' }, apiKey);
    if (res.ok) {
      load();
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setError(d.error ?? 'Could not delete project. Please try again.');
    }
  };

  if (loading) return <p className="text-gray-400 text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Projects</h2>
        <button onClick={() => { setShowAdd(!showAdd); setError(''); }} className="btn-sm btn-primary">
          + Add project
        </button>
      </div>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {showAdd && (
        <form onSubmit={addProject} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
          <h3 className="text-sm font-medium text-gray-700">New project</h3>
          <input
            placeholder="Display name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="field text-sm"
            required
          />
          <input
            placeholder="/absolute/path/to/project"
            value={form.path}
            onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
            className="field text-sm font-mono"
            required
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-sm btn-primary">Add</button>
            <button type="button" onClick={() => setShowAdd(false)}
              className="text-gray-400 hover:text-gray-700 text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {projects.length === 0 ? (
        <p className="text-gray-400 text-sm">No projects yet. Add one to get started.</p>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <div key={p.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between group shadow-sm hover:border-kelly-300 transition-colors">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{p.name}</p>
                <p className="text-gray-400 text-sm font-mono truncate">{p.path}</p>
                {p.github_owner && (
                  <p className="text-gray-400 text-xs mt-0.5">
                    github.com/{p.github_owner}/{p.github_repo}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => remove(p.id)}
                  className="text-gray-300 hover:text-red-500 text-sm transition-colors opacity-0 group-hover:opacity-100"
                >
                  Delete
                </button>
                <Link href={`/dashboard/${p.id}`}
                  className="btn-sm whitespace-nowrap">
                  Open →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
