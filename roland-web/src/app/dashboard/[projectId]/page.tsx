'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChatInterface } from '@/components/ChatInterface';
import { GitHubConnect } from '@/components/GitHubConnect';
import { useApiKey } from '@/lib/ApiKeyContext';
import { apiFetch } from '@/lib/api';

interface Project {
  id: string;
  name: string;
  path: string;
  github_owner: string | null;
  github_repo: string | null;
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { apiKey } = useApiKey();
  const [project, setProject]       = useState<Project | null>(null);
  const [activeBranch, setActiveBranch] = useState('');

  const load = async () => {
    if (!apiKey) return;
    const res = await apiFetch(`/api/projects/${projectId}`, {}, apiKey);
    if (res.ok) setProject(await res.json());
  };

  useEffect(() => { load(); }, [apiKey, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <span className="text-gray-400">Loading…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/dashboard" className="text-gray-400 hover:text-kelly-600 text-sm shrink-0 transition-colors">
            ← Dashboard
          </Link>
          <div className="min-w-0">
            <h1 className="text-gray-900 font-semibold truncate">{project.name}</h1>
            <p className="text-gray-400 text-xs font-mono truncate">{project.path}</p>
          </div>
        </div>

        {/* GitHub status: shows Pull + Create PR when connected */}
        <GitHubConnect
          project={project}
          activeBranch={activeBranch}
          onUpdate={load}
        />
      </header>

      <main className="flex-1 p-6 flex flex-col max-w-5xl mx-auto w-full">
        {/* ChatInterface notifies us when a branch is created so the header can show PR button */}
        <ChatInterface
          projectId={projectId}
          onBranchCreated={setActiveBranch}
        />
      </main>
    </div>
  );
}
