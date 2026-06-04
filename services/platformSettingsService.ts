import { supabase } from './supabaseClient';

const SETTINGS_TABLE = 'platform_feature_flags';
const EMAIL_SETTING_KEY = 'email';
const RECRUITER_ALL_CANDIDATES_KEY = 'recruiter_all_candidates';
const CANDIDATE_PROFILE_VISIBILITY_SETTING_KEY = 'candidate_profile_visibility_setting';
const SEEKER_OAUTH_SETTING_KEY = 'seeker_oauth';
const EMAIL_SETTING_CACHE_TTL_MS = 30_000;

export const PLATFORM_EMAIL_SETTING_CHANGED_EVENT = 'platform-email-setting-changed';
export const PLATFORM_RECRUITER_ALL_CANDIDATES_CHANGED_EVENT = 'platform-recruiter-all-candidates-changed';
export const PLATFORM_CANDIDATE_PROFILE_VISIBILITY_SETTING_CHANGED_EVENT = 'platform-candidate-profile-visibility-setting-changed';
export const PLATFORM_SEEKER_OAUTH_CHANGED_EVENT = 'platform-seeker-oauth-changed';
export const EMAIL_SENDING_PAUSED_MESSAGE = 'Email sending is currently paused by admin.';

let cachedEmailEnabled: boolean | null = null;
let cachedEmailEnabledAt = 0;
let cachedRecruiterAllCandidatesEnabled: boolean | null = null;
let cachedRecruiterAllCandidatesEnabledAt = 0;
let cachedCandidateProfileVisibilitySettingEnabled: boolean | null = null;
let cachedCandidateProfileVisibilitySettingEnabledAt = 0;
let cachedSeekerOAuthEnabled: boolean | null = null;
let cachedSeekerOAuthEnabledAt = 0;

const updateEmailSettingCache = (enabled: boolean) => {
  cachedEmailEnabled = enabled;
  cachedEmailEnabledAt = Date.now();
};

const updateRecruiterAllCandidatesCache = (enabled: boolean) => {
  cachedRecruiterAllCandidatesEnabled = enabled;
  cachedRecruiterAllCandidatesEnabledAt = Date.now();
};

const updateCandidateProfileVisibilitySettingCache = (enabled: boolean) => {
  cachedCandidateProfileVisibilitySettingEnabled = enabled;
  cachedCandidateProfileVisibilitySettingEnabledAt = Date.now();
};

const updateSeekerOAuthSettingCache = (enabled: boolean) => {
  cachedSeekerOAuthEnabled = enabled;
  cachedSeekerOAuthEnabledAt = Date.now();
};

const dispatchEmailSettingChanged = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PLATFORM_EMAIL_SETTING_CHANGED_EVENT, { detail: { enabled } }));
};

const dispatchRecruiterAllCandidatesChanged = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PLATFORM_RECRUITER_ALL_CANDIDATES_CHANGED_EVENT, { detail: { enabled } }));
};

const dispatchCandidateProfileVisibilitySettingChanged = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PLATFORM_CANDIDATE_PROFILE_VISIBILITY_SETTING_CHANGED_EVENT, { detail: { enabled } }));
};

const dispatchSeekerOAuthSettingChanged = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PLATFORM_SEEKER_OAUTH_CHANGED_EVENT, { detail: { enabled } }));
};

const isMissingSettingsTableError = (error: unknown): boolean => {
  const code = String((error as any)?.code || '').trim();
  const message = String((error as any)?.message || '').toLowerCase();

  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    (message.includes('platform_feature_flags') && message.includes('not found')) ||
    (message.includes('relation') && message.includes('platform_feature_flags'))
  );
};

export const clearPlatformEmailSettingCache = () => {
  cachedEmailEnabled = null;
  cachedEmailEnabledAt = 0;
};

export const clearRecruiterAllCandidatesSettingCache = () => {
  cachedRecruiterAllCandidatesEnabled = null;
  cachedRecruiterAllCandidatesEnabledAt = 0;
};

export const clearCandidateProfileVisibilitySettingCache = () => {
  cachedCandidateProfileVisibilitySettingEnabled = null;
  cachedCandidateProfileVisibilitySettingEnabledAt = 0;
};

export const clearSeekerOAuthSettingCache = () => {
  cachedSeekerOAuthEnabled = null;
  cachedSeekerOAuthEnabledAt = 0;
};

export const getEmailSendingEnabled = async (options?: { force?: boolean }): Promise<boolean> => {
  if (
    !options?.force &&
    cachedEmailEnabled !== null &&
    Date.now() - cachedEmailEnabledAt < EMAIL_SETTING_CACHE_TTL_MS
  ) {
    return cachedEmailEnabled;
  }

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('enabled')
    .eq('key', EMAIL_SETTING_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingSettingsTableError(error)) {
      updateEmailSettingCache(false);
      return false;
    }
    throw new Error(error.message || 'Unable to load platform email setting.');
  }

  const enabled = Boolean(data?.enabled);
  updateEmailSettingCache(enabled);
  return enabled;
};

export const getRecruiterAllCandidatesEnabled = async (options?: { force?: boolean }): Promise<boolean> => {
  if (
    !options?.force &&
    cachedRecruiterAllCandidatesEnabled !== null &&
    Date.now() - cachedRecruiterAllCandidatesEnabledAt < EMAIL_SETTING_CACHE_TTL_MS
  ) {
    return cachedRecruiterAllCandidatesEnabled;
  }

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('enabled')
    .eq('key', RECRUITER_ALL_CANDIDATES_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingSettingsTableError(error)) {
      updateRecruiterAllCandidatesCache(false);
      return false;
    }
    throw new Error(error.message || 'Unable to load recruiter candidate visibility setting.');
  }

  const enabled = Boolean(data?.enabled);
  updateRecruiterAllCandidatesCache(enabled);
  return enabled;
};

export const getCandidateProfileVisibilitySettingEnabled = async (options?: { force?: boolean }): Promise<boolean> => {
  if (
    !options?.force &&
    cachedCandidateProfileVisibilitySettingEnabled !== null &&
    Date.now() - cachedCandidateProfileVisibilitySettingEnabledAt < EMAIL_SETTING_CACHE_TTL_MS
  ) {
    return cachedCandidateProfileVisibilitySettingEnabled;
  }

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('enabled')
    .eq('key', CANDIDATE_PROFILE_VISIBILITY_SETTING_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingSettingsTableError(error)) {
      updateCandidateProfileVisibilitySettingCache(false);
      return false;
    }
    throw new Error(error.message || 'Unable to load candidate profile visibility setting.');
  }

  const enabled = Boolean(data?.enabled);
  updateCandidateProfileVisibilitySettingCache(enabled);
  return enabled;
};

export const getSeekerOAuthEnabled = async (options?: { force?: boolean }): Promise<boolean> => {
  if (
    !options?.force &&
    cachedSeekerOAuthEnabled !== null &&
    Date.now() - cachedSeekerOAuthEnabledAt < EMAIL_SETTING_CACHE_TTL_MS
  ) {
    return cachedSeekerOAuthEnabled;
  }

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('enabled')
    .eq('key', SEEKER_OAUTH_SETTING_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingSettingsTableError(error)) {
      updateSeekerOAuthSettingCache(false);
      return false;
    }
    throw new Error(error.message || 'Unable to load seeker OAuth setting.');
  }

  const enabled = Boolean(data?.enabled);
  updateSeekerOAuthSettingCache(enabled);
  return enabled;
};

export const setEmailSendingEnabled = async (enabled: boolean): Promise<boolean> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from(SETTINGS_TABLE).upsert(
    {
      key: EMAIL_SETTING_KEY,
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    },
    { onConflict: 'key' }
  );

  if (error) {
    if (isMissingSettingsTableError(error)) {
      throw new Error('Email settings are not configured yet. Run supabase/platform_feature_flags.sql first.');
    }
    throw new Error(error.message || 'Unable to save platform email setting.');
  }

  updateEmailSettingCache(enabled);
  dispatchEmailSettingChanged(enabled);
  return enabled;
};

export const setRecruiterAllCandidatesEnabled = async (enabled: boolean): Promise<boolean> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from(SETTINGS_TABLE).upsert(
    {
      key: RECRUITER_ALL_CANDIDATES_KEY,
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    },
    { onConflict: 'key' }
  );

  if (error) {
    if (isMissingSettingsTableError(error)) {
      throw new Error('Recruiter candidate visibility settings are not configured yet. Run supabase/platform_feature_flags.sql first.');
    }
    throw new Error(error.message || 'Unable to save recruiter candidate visibility setting.');
  }

  updateRecruiterAllCandidatesCache(enabled);
  dispatchRecruiterAllCandidatesChanged(enabled);
  return enabled;
};

export const setCandidateProfileVisibilitySettingEnabled = async (enabled: boolean): Promise<boolean> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from(SETTINGS_TABLE).upsert(
    {
      key: CANDIDATE_PROFILE_VISIBILITY_SETTING_KEY,
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    },
    { onConflict: 'key' }
  );

  if (error) {
    if (isMissingSettingsTableError(error)) {
      throw new Error('Candidate profile visibility settings are not configured yet. Run supabase/platform_feature_flags.sql first.');
    }
    throw new Error(error.message || 'Unable to save candidate profile visibility setting.');
  }

  updateCandidateProfileVisibilitySettingCache(enabled);
  dispatchCandidateProfileVisibilitySettingChanged(enabled);
  return enabled;
};

export const setSeekerOAuthEnabled = async (enabled: boolean): Promise<boolean> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from(SETTINGS_TABLE).upsert(
    {
      key: SEEKER_OAUTH_SETTING_KEY,
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    },
    { onConflict: 'key' }
  );

  if (error) {
    if (isMissingSettingsTableError(error)) {
      throw new Error('Seeker OAuth settings are not configured yet. Run supabase/platform_feature_flags.sql first.');
    }
    throw new Error(error.message || 'Unable to save seeker OAuth setting.');
  }

  updateSeekerOAuthSettingCache(enabled);
  dispatchSeekerOAuthSettingChanged(enabled);
  return enabled;
};
