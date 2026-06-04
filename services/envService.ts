const normalizeEnvValue = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

/**
 * AI calls now go through the `gemini-proxy` Supabase Edge Function, so the
 * Gemini API key is never read in the browser. This helper exists for the
 * legacy DebugView UI gate — it now reports whether the AI proxy is reachable
 * (i.e. Supabase is configured and the user is presumed authenticated).
 */
export const isAiAvailable = (): boolean =>
  Boolean(normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL));

/** @deprecated Use `isAiAvailable()` — kept for compatibility with DebugView. */
export const hasGeminiApiKey = (): boolean => isAiAvailable();

export const getSupabaseProjectRef = (): string =>
  normalizeEnvValue((import.meta.env as Record<string, unknown>).VITE_SUPABASE_PROJECT_REF);

export const hasSupabaseManagementConfig = (): boolean =>
  Boolean(
    getSupabaseProjectRef() &&
    normalizeEnvValue((import.meta.env as Record<string, unknown>).VITE_SUPABASE_MANAGEMENT_TOKEN)
  );
