const normalizeEnvValue = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const getGeminiApiKey = (): string => {
  const viteKey = normalizeEnvValue(import.meta.env.VITE_GEMINI_API_KEY);
  const fallbackKey = normalizeEnvValue((import.meta.env as any).GEMINI_API_KEY);
  const processKey = normalizeEnvValue((process.env as any)?.GEMINI_API_KEY);
  return viteKey || fallbackKey || processKey;
};

export const hasGeminiApiKey = (): boolean => Boolean(getGeminiApiKey());

export const getSupabaseProjectRef = (): string =>
  normalizeEnvValue((import.meta.env as Record<string, unknown>).VITE_SUPABASE_PROJECT_REF);

export const hasSupabaseManagementConfig = (): boolean =>
  Boolean(
    getSupabaseProjectRef() &&
    normalizeEnvValue((import.meta.env as Record<string, unknown>).VITE_SUPABASE_MANAGEMENT_TOKEN)
  );
