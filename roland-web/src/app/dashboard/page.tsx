'use client';

import { ProjectList } from '@/components/ProjectList';
import { GitHubStatus } from '@/components/GitHubStatus';
import { useApiKey, PM_MODELS, ENGINEER_MODELS, modelLabel } from '@/lib/ApiKeyContext';

function ModelBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-white border border-gray-200 rounded-md px-2 py-1 font-mono">
      <span className="text-gray-400 font-sans not-italic">{label}</span>
      {value}
    </span>
  );
}

export default function DashboardPage() {
  const { pmModel, engineerModel } = useApiKey();

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    sessionStorage.removeItem('cursor_api_key');
    sessionStorage.removeItem('pm_model');
    sessionStorage.removeItem('engineer_model');
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        {/* Top bar */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Roland</h1>
            <p className="text-gray-500 text-sm">AI Orchestration Platform</p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {/* Model badges */}
            <div className="flex items-center gap-1.5" aria-label="Active models">
              <ModelBadge label="PM · " value={modelLabel(pmModel, PM_MODELS)} />
              <ModelBadge label="Eng · " value={modelLabel(engineerModel, ENGINEER_MODELS)} />
            </div>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-gray-700 text-sm transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* GitHub connection bar */}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-4 shadow-sm">
          <span className="text-sm text-gray-500 font-medium">GitHub</span>
          <GitHubStatus />
        </div>

        <ProjectList />
      </div>
    </div>
  );
}
