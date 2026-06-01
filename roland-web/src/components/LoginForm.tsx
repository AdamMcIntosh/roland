'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useApiKey,
  PM_MODELS,
  ENGINEER_MODELS,
  DEFAULT_PM_MODEL,
  DEFAULT_ENGINEER_MODEL,
  type ModelOption,
} from '@/lib/ApiKeyContext';

// ── Accessible radio-card chip group ─────────────────────────────────────────
function ModelChips({
  id,
  models,
  value,
  onChange,
}: {
  id: string;
  models: ModelOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
      {models.map((m) => {
        const selected = value === m.value;
        return (
          <label
            key={m.value}
            /*
             * min-h-[44px]: WCAG 2.5.5 touch target.
             * py-2: ensures the label grows tall enough on its own even without
             * explicit height, and renders consistently across all screen sizes.
             */
            className={[
              'flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg border',
              'text-sm cursor-pointer transition-all select-none',
              'focus-within:ring-2 focus-within:ring-kelly-500 focus-within:ring-offset-1',
              selected
                ? 'border-kelly-500 bg-kelly-50 text-kelly-800 font-medium shadow-sm'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
            ].join(' ')}
          >
            <input
              type="radio"
              name={id}
              value={m.value}
              checked={selected}
              onChange={() => onChange(m.value)}
              className="sr-only"
              aria-label={m.label}
            />
            {m.label}
            {m.badge && (
              <span
                className={[
                  'text-xs px-1.5 py-0.5 rounded-md font-medium',
                  m.tier === 'recommended'
                    ? 'bg-kelly-100 text-kelly-700'
                    : 'bg-gray-100 text-gray-500',
                ].join(' ')}
              >
                {m.badge}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

// ── Model row header (label + description) ────────────────────────────────────
function ModelRowHeader({ id, title, hint }: { id: string; title: string; hint: string }) {
  return (
    /* Stack on mobile, inline on sm+ to avoid wrapping on narrow screens */
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
      <p id={id} className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {title}
      </p>
      <p className="text-xs text-gray-400">{hint}</p>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────
export function LoginForm() {
  const router = useRouter();
  const { setApiKey, setPmModel, setEngineerModel } = useApiKey();

  const [creds, setCreds] = useState({ username: '', password: '', cursorApiKey: '' });
  const [pmModel, setPm]            = useState(DEFAULT_PM_MODEL);
  const [engineerModel, setEng]     = useState(DEFAULT_ENGINEER_MODEL);
  const [modelsOpen, setModelsOpen] = useState(true);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  const setCred = (k: keyof typeof creds) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setCreds((f) => ({ ...f, [k]: e.target.value }));

  const resetModels = () => { setPm(DEFAULT_PM_MODEL); setEng(DEFAULT_ENGINEER_MODEL); };
  const isDefault   = pmModel === DEFAULT_PM_MODEL && engineerModel === DEFAULT_ENGINEER_MODEL;

  const pmLabel  = PM_MODELS.find((m) => m.value === pmModel)?.label       ?? pmModel;
  const engLabel = ENGINEER_MODELS.find((m) => m.value === engineerModel)?.label ?? engineerModel;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: creds.username,
        password: creds.password,
        cursorApiKey: creds.cursorApiKey,
      }),
    });

    if (res.ok) {
      setApiKey(creds.cursorApiKey);
      setPmModel(pmModel);
      setEngineerModel(engineerModel);
      router.push('/dashboard');
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'Login failed');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 sm:gap-5" noValidate>

      {/* Error banner */}
      {error && (
        <div role="alert" className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          {error}
        </div>
      )}

      {/* Credentials */}
      <fieldset className="flex flex-col gap-4">
        <legend className="sr-only">Login credentials</legend>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="username" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={creds.username}
            onChange={setCred('username')}
            className="field"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={creds.password}
            onChange={setCred('password')}
            className="field"
            autoComplete="current-password"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cursorApiKey" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Cursor API Key
          </label>
          <input
            id="cursorApiKey"
            type="password"
            value={creds.cursorApiKey}
            onChange={setCred('cursorApiKey')}
            className="field font-mono"
            placeholder="cursor_…"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            aria-describedby="apikey-hint"
          />
          <p id="apikey-hint" className="text-xs text-gray-400">
            Stored in session only — never saved to the server.
          </p>
        </div>
      </fieldset>

      {/* Model settings — collapsible ───────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">

        {/* Toggle header — min-h-[48px] for comfortable tap on mobile */}
        <button
          type="button"
          aria-expanded={modelsOpen}
          aria-controls="model-settings-panel"
          onClick={() => setModelsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 min-h-[48px] py-3
                     text-sm text-gray-700 hover:bg-gray-100 active:bg-gray-100
                     transition-colors text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* Sliders icon */}
            <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M5 4a1 1 0 0 0-2 0v7.268a2 2 0 0 0 0 3.464V16a1 1 0 1 0 2 0v-1.268a2 2 0 0 0 0-3.464V4zM11 4a1 1 0 1 0-2 0v1.268a2 2 0 0 0 0 3.464V16a1 1 0 1 0 2 0V8.732a2 2 0 0 0 0-3.464V4zM15 3a1 1 0 0 1 1 1v7.268a2 2 0 0 1 0 3.464V16a1 1 0 1 1-2 0v-1.268a2 2 0 0 1 0-3.464V4a1 1 0 0 1 1-1z" />
            </svg>
            <span className="font-medium shrink-0">Model settings</span>
            {/* Collapsed summary — truncated so it never overflows on small screens */}
            {!modelsOpen && (
              <span className="text-gray-400 font-normal truncate min-w-0">
                — {pmLabel} / {engLabel}
              </span>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 shrink-0 ml-2 transition-transform duration-200 ${modelsOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Panel */}
        {modelsOpen && (
          <div
            id="model-settings-panel"
            className="px-4 pb-4 flex flex-col gap-4 sm:gap-5 border-t border-gray-200 pt-4"
          >
            {/* Lead PM */}
            <div className="flex flex-col gap-2">
              <ModelRowHeader id="pmModel-label" title="Lead PM model" hint="Plans tasks · reviews waves" />
              <ModelChips id="pmModel" models={PM_MODELS} value={pmModel} onChange={setPm} />
            </div>

            {/* Engineers */}
            <div className="flex flex-col gap-2">
              <ModelRowHeader id="engineerModel-label" title="Engineer model" hint="Runs all coding tasks" />
              <ModelChips id="engineerModel" models={ENGINEER_MODELS} value={engineerModel} onChange={setEng} />
            </div>

            {/* Reset — only shown when non-default */}
            {!isDefault && (
              <button
                type="button"
                onClick={resetModels}
                className="self-start text-xs text-gray-400 hover:text-gray-600
                           underline underline-offset-2 transition-colors min-h-[44px] flex items-center"
              >
                Reset to defaults
              </button>
            )}
          </div>
        )}
      </div>

      {/* Submit — min-h-[48px] for reliable tap on mobile */}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-kelly-600 hover:bg-kelly-700 active:bg-kelly-800
                   disabled:opacity-40 text-white rounded-lg px-4 py-3 min-h-[48px]
                   font-medium transition-colors"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
