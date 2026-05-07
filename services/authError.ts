import { isSupabaseConfigured } from './supabaseClient';

type TextFn = (english: string, italian: string) => string;

export const getFriendlyAuthError = (
  err: unknown,
  text: TextFn,
  fallback: string
): string => {
  const rawMessage =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message?: unknown }).message || '').trim()
      : '';

  const normalizedMessage = rawMessage.toLowerCase();

  if (!isSupabaseConfigured) {
    return text(
      'Supabase is not configured on this machine. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local and restart the dev server.',
      'Supabase non è configurato su questa macchina. Aggiungi VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY a .env.local e riavvia il dev server.'
    );
  }

  if (
    normalizedMessage === 'load failed' ||
    normalizedMessage === 'fetch failed' ||
    normalizedMessage === 'failed to fetch' ||
    normalizedMessage.includes('network request failed') ||
    normalizedMessage.includes('networkerror')
  ) {
    return text(
      'This machine could not reach Supabase. Check internet access, firewall/VPN, browser privacy extensions, and that the Supabase URL is reachable.',
      'Questa macchina non riesce a raggiungere Supabase. Controlla connessione internet, firewall/VPN, estensioni privacy del browser e che l’URL di Supabase sia raggiungibile.'
    );
  }

  return rawMessage || fallback;
};
