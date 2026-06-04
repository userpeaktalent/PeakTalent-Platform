import { supabase } from './supabaseClient';

export type SeekerOAuthProvider = 'google' | 'apple';
export type SeekerOAuthMode = 'login' | 'signup';

const SEEKER_OAUTH_INTENT_KEY = 'peaktalent.seeker_oauth_intent';

export interface SeekerOAuthIntent {
  provider: SeekerOAuthProvider;
  mode: SeekerOAuthMode;
  jobId?: string;
  inviteOnly?: boolean;
  termsAccepted?: boolean;
  aiMatchingAccepted?: boolean;
  createdAt: number;
}

const MAX_INTENT_AGE_MS = 15 * 60 * 1000;

const getCurrentOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return import.meta.env.VITE_PUBLIC_SITE_URL || '';
};

export const saveSeekerOAuthIntent = (intent: Omit<SeekerOAuthIntent, 'createdAt'>) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SEEKER_OAUTH_INTENT_KEY, JSON.stringify({
    ...intent,
    createdAt: Date.now(),
  }));
};

export const loadSeekerOAuthIntent = (): SeekerOAuthIntent | null => {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.sessionStorage.getItem(SEEKER_OAUTH_INTENT_KEY);
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue) as SeekerOAuthIntent;
    if (!parsed.provider || !parsed.mode || Date.now() - parsed.createdAt > MAX_INTENT_AGE_MS) {
      window.sessionStorage.removeItem(SEEKER_OAUTH_INTENT_KEY);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to read seeker OAuth intent:', error);
    window.sessionStorage.removeItem(SEEKER_OAUTH_INTENT_KEY);
    return null;
  }
};

export const clearSeekerOAuthIntent = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SEEKER_OAUTH_INTENT_KEY);
};

export const startSeekerOAuth = async (intent: Omit<SeekerOAuthIntent, 'createdAt'>) => {
  saveSeekerOAuthIntent(intent);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: intent.provider,
    options: {
      redirectTo: `${getCurrentOrigin()}/auth`,
      scopes: intent.provider === 'apple' ? 'name email' : 'openid email profile',
      queryParams: intent.provider === 'google'
        ? {
            prompt: 'select_account',
          }
        : undefined,
    },
  });

  return { data, error };
};
