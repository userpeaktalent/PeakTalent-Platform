import { supabase } from './supabaseClient';

type SupabasePlan = 'free' | 'pro' | 'team' | 'enterprise';

export interface SupabaseUsageSnapshot {
  databaseUsedBytes: number | null;
  databaseLimitBytes: number | null;
  storageUsedBytes: number | null;
  storageLimitBytes: number | null;
  apiRequestsUsed: number | null;
  apiRequestsLimit: number | null;
  measuredAt: string | null;
  apiRequestsAvailable: boolean;
  usageRpcAvailable: boolean;
  notes: string[];
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

const normalizeEnvValue = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const parseNumericEnv = (value: unknown): number | null => {
  const normalized = normalizeEnvValue(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const getConfiguredPlan = (): SupabasePlan => {
  const rawPlan = normalizeEnvValue((import.meta.env as Record<string, unknown>).VITE_SUPABASE_PLAN).toLowerCase();
  if (rawPlan === 'free' || rawPlan === 'pro' || rawPlan === 'team' || rawPlan === 'enterprise') {
    return rawPlan;
  }
  return 'free';
};

const getPlanDefaults = (plan: SupabasePlan) => {
  switch (plan) {
    case 'pro':
    case 'team':
      return {
        databaseLimitBytes: 8 * GB,
        storageLimitBytes: 100 * GB,
      };
    case 'enterprise':
      return {
        databaseLimitBytes: null,
        storageLimitBytes: null,
      };
    case 'free':
    default:
      return {
        databaseLimitBytes: 500 * MB,
        storageLimitBytes: 1 * GB,
      };
  }
};

const getDatabaseLimitBytes = (): number | null => {
  const explicitLimit = parseNumericEnv((import.meta.env as Record<string, unknown>).VITE_SUPABASE_DB_LIMIT_BYTES);
  if (explicitLimit !== null) return explicitLimit;
  return getPlanDefaults(getConfiguredPlan()).databaseLimitBytes;
};

const getStorageLimitBytes = (): number | null => {
  const explicitLimit = parseNumericEnv((import.meta.env as Record<string, unknown>).VITE_SUPABASE_STORAGE_LIMIT_BYTES);
  if (explicitLimit !== null) return explicitLimit;
  return getPlanDefaults(getConfiguredPlan()).storageLimitBytes;
};

const getApiRequestLimit = (): number | null =>
  parseNumericEnv((import.meta.env as Record<string, unknown>).VITE_SUPABASE_API_REQUEST_LIMIT);

const getManagementProjectRef = (): string =>
  normalizeEnvValue((import.meta.env as Record<string, unknown>).VITE_SUPABASE_PROJECT_REF);

const getManagementToken = (): string =>
  normalizeEnvValue((import.meta.env as Record<string, unknown>).VITE_SUPABASE_MANAGEMENT_TOKEN);

type UsageRpcPayload = {
  database_size_bytes?: number | string | null;
  storage_size_bytes?: number | string | null;
  measured_at?: string | null;
};

const normalizeBytes = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const fetchManagementJson = async <T>(path: string): Promise<T> => {
  const projectRef = getManagementProjectRef();
  const token = getManagementToken();

  if (!projectRef || !token) {
    throw new Error('Supabase management API is not configured.');
  }

  const response = await fetch(`https://api.supabase.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase management API error (${response.status}): ${detail || response.statusText}`);
  }

  return response.json() as Promise<T>;
};

const normalizeEdgeFunctionError = async (error: unknown): Promise<string> => {
  const response = (error as any)?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const cloned = response.clone();
      const contentType = cloned.headers?.get?.('content-type') || '';

      if (contentType.includes('application/json')) {
        const payload = await cloned.json();
        if (payload?.error) return String(payload.error);
        if (payload?.message) return String(payload.message);
      }

      const text = await cloned.text();
      if (text?.trim()) return text.trim();
    } catch {
      // Fall back to the generic error below.
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error || 'Unknown edge function error.');
};

type AdminManagementUsagePayload = {
  databaseLimitBytes?: number | null;
  apiRequestsUsed?: number | null;
  apiRequestsAvailable?: boolean;
  error?: string;
};

export const getSupabaseUsageSnapshot = async (): Promise<SupabaseUsageSnapshot> => {
  const notes: string[] = [];
  const snapshot: SupabaseUsageSnapshot = {
    databaseUsedBytes: null,
    databaseLimitBytes: getDatabaseLimitBytes(),
    storageUsedBytes: null,
    storageLimitBytes: getStorageLimitBytes(),
    apiRequestsUsed: null,
    apiRequestsLimit: getApiRequestLimit(),
    measuredAt: null,
    apiRequestsAvailable: false,
    usageRpcAvailable: false,
    notes,
  };

  try {
    const { data, error } = await supabase.rpc('get_admin_supabase_usage');
    if (error) {
      if (error.message?.toLowerCase().includes('could not find')) {
        notes.push('Run supabase/admin_supabase_usage.sql in Supabase SQL Editor to enable live DB and storage usage.');
      } else {
        notes.push('Supabase DB/storage usage could not be loaded from the admin RPC.');
      }
    } else if (data) {
      const payload = data as UsageRpcPayload;
      snapshot.databaseUsedBytes = normalizeBytes(payload.database_size_bytes);
      snapshot.storageUsedBytes = normalizeBytes(payload.storage_size_bytes);
      snapshot.measuredAt = payload.measured_at ?? null;
      snapshot.usageRpcAvailable = true;
    }
  } catch {
    notes.push('Supabase DB/storage usage could not be loaded from the admin RPC.');
  }

  try {
    const { data, error } = await supabase.functions.invoke<AdminManagementUsagePayload>('admin-supabase-usage', {
      body: {},
    });

    if (error) {
      throw error;
    }

    if (!data) {
      notes.push('Supabase management API metrics are currently unavailable on this environment.');
    } else {
      if (typeof data.databaseLimitBytes === 'number' && Number.isFinite(data.databaseLimitBytes) && data.databaseLimitBytes > 0) {
        snapshot.databaseLimitBytes = data.databaseLimitBytes;
      }

      if (typeof data.apiRequestsUsed === 'number' && Number.isFinite(data.apiRequestsUsed) && data.apiRequestsUsed >= 0) {
        snapshot.apiRequestsUsed = data.apiRequestsUsed;
      }

      if (data.apiRequestsAvailable) {
        snapshot.apiRequestsAvailable = true;
      } else {
        notes.push('Supabase management API did not return a tracked API request count.');
      }
    }

    if (snapshot.apiRequestsLimit === null) {
      notes.push('Set VITE_SUPABASE_API_REQUEST_LIMIT to display remaining API request budget.');
    }
  } catch (error) {
    const detail = await normalizeEdgeFunctionError(error);
    if (detail) {
      notes.push(`Supabase management API error: ${detail}`);
    } else {
      notes.push('Supabase management API metrics are currently unavailable on this environment.');
    }
  }

  return snapshot;
};
