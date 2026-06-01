'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ModelTier = 'recommended' | 'fast' | 'powerful';

export interface ModelOption {
  value: string;
  label: string;
  badge?: string;
  tier: ModelTier;
}

export const PM_MODELS: ModelOption[] = [
  { value: 'gpt-5.4-nano',       label: 'GPT-5.4 Nano',     badge: 'Default',    tier: 'recommended' },
  { value: 'gpt-5-mini',         label: 'GPT-5 Mini',       badge: 'Fast',       tier: 'fast'        },
  { value: 'gemini-2.5-flash',   label: 'Gemini 2.5 Flash', badge: 'Flash',      tier: 'fast'        },
  { value: 'gpt-5.1-codex-mini', label: 'Codex Mini',       badge: 'Lean',       tier: 'fast'        },
];

export const ENGINEER_MODELS: ModelOption[] = [
  { value: 'composer-2.5',       label: 'Composer 2.5',     badge: 'Default',    tier: 'recommended' },
  { value: 'composer-2',         label: 'Composer 2',       badge: 'Lighter',    tier: 'fast'        },
  { value: 'gpt-5-mini',         label: 'GPT-5 Mini',       badge: 'Fast',       tier: 'fast'        },
  { value: 'gemini-2.5-flash',   label: 'Gemini 2.5 Flash', badge: 'Flash',      tier: 'fast'        },
  { value: 'gpt-5.1-codex-mini', label: 'Codex Mini',       badge: 'Lean',       tier: 'fast'        },
];

export const DEFAULT_PM_MODEL       = 'gpt-5.4-nano';
export const DEFAULT_ENGINEER_MODEL = 'composer-2.5';

interface ApiKeyCtx {
  apiKey: string;
  setApiKey: (key: string) => void;
  pmModel: string;
  setPmModel: (m: string) => void;
  engineerModel: string;
  setEngineerModel: (m: string) => void;
}

const Ctx = createContext<ApiKeyCtx>({
  apiKey: '',
  setApiKey: () => {},
  pmModel: DEFAULT_PM_MODEL,
  setPmModel: () => {},
  engineerModel: DEFAULT_ENGINEER_MODEL,
  setEngineerModel: () => {},
});

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState]          = useState('');
  const [pmModel, setPmModelState]        = useState(DEFAULT_PM_MODEL);
  const [engineerModel, setEngModelState] = useState(DEFAULT_ENGINEER_MODEL);

  useEffect(() => {
    setApiKeyState(sessionStorage.getItem('cursor_api_key') ?? '');
    setPmModelState(sessionStorage.getItem('pm_model') ?? DEFAULT_PM_MODEL);
    setEngModelState(sessionStorage.getItem('engineer_model') ?? DEFAULT_ENGINEER_MODEL);
  }, []);

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    sessionStorage.setItem('cursor_api_key', key);
  };

  const setPmModel = (m: string) => {
    setPmModelState(m);
    sessionStorage.setItem('pm_model', m);
  };

  const setEngineerModel = (m: string) => {
    setEngModelState(m);
    sessionStorage.setItem('engineer_model', m);
  };

  return (
    <Ctx.Provider value={{ apiKey, setApiKey, pmModel, setPmModel, engineerModel, setEngineerModel }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApiKey = () => useContext(Ctx);

/** Short display label for a model value (falls back to raw value). */
export function modelLabel(value: string, list: ModelOption[]): string {
  return list.find((m) => m.value === value)?.label ?? value;
}
