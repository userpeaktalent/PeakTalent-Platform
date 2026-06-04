const PENDING_KEY = 'peaktalent.passkey_second_factor.pending';
const SATISFIED_KEY = 'peaktalent.passkey_second_factor.satisfied';
const MAX_PENDING_AGE_MS = 10 * 60 * 1000;
const MAX_SATISFIED_AGE_MS = 12 * 60 * 60 * 1000;

export const PASSKEY_SECOND_FACTOR_STATE_CHANGED_EVENT = 'peaktalent:passkey-second-factor-state-changed';

type PendingPasskeySecondFactor = {
  state: 'checking' | 'challenge';
  userId?: string;
  email?: string;
  passkeyCount?: number;
  createdAt: number;
};

type SatisfiedPasskeySecondFactor = {
  userId: string;
  createdAt: number;
};

const emitStateChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PASSKEY_SECOND_FACTOR_STATE_CHANGED_EVENT));
};

const readJson = <T,>(key: string): T | null => {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.sessionStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : null;
  } catch (error) {
    console.warn(`Failed to read ${key}:`, error);
    window.sessionStorage.removeItem(key);
    return null;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(key, JSON.stringify(value));
  emitStateChanged();
};

export const getPendingPasskeySecondFactor = () => {
  const pending = readJson<PendingPasskeySecondFactor>(PENDING_KEY);
  if (!pending) return null;

  if (Date.now() - pending.createdAt > MAX_PENDING_AGE_MS) {
    clearPendingPasskeySecondFactor();
    return null;
  }

  return pending;
};

export const markPasskeySecondFactorChecking = (email?: string) => {
  writeJson(PENDING_KEY, {
    state: 'checking',
    email,
    createdAt: Date.now(),
  } satisfies PendingPasskeySecondFactor);
};

export const markPasskeySecondFactorChallenge = (params: {
  userId: string;
  email?: string;
  passkeyCount: number;
}) => {
  writeJson(PENDING_KEY, {
    state: 'challenge',
    userId: params.userId,
    email: params.email,
    passkeyCount: params.passkeyCount,
    createdAt: Date.now(),
  } satisfies PendingPasskeySecondFactor);
};

export const clearPendingPasskeySecondFactor = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PENDING_KEY);
  emitStateChanged();
};

export const isPasskeySecondFactorPendingForSession = (userId?: string | null) => {
  const pending = getPendingPasskeySecondFactor();
  if (!pending) return false;
  if (pending.state === 'checking') return true;
  return Boolean(userId && pending.userId === userId);
};

export const markPasskeySecondFactorSatisfied = (userId: string) => {
  writeJson(SATISFIED_KEY, {
    userId,
    createdAt: Date.now(),
  } satisfies SatisfiedPasskeySecondFactor);
};

export const isPasskeySecondFactorSatisfied = (userId: string) => {
  const satisfied = readJson<SatisfiedPasskeySecondFactor>(SATISFIED_KEY);
  if (!satisfied) return false;

  if (satisfied.userId !== userId || Date.now() - satisfied.createdAt > MAX_SATISFIED_AGE_MS) {
    clearPasskeySecondFactorSatisfied();
    return false;
  }

  return true;
};

export const clearPasskeySecondFactorSatisfied = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SATISFIED_KEY);
  emitStateChanged();
};

export const clearPasskeySecondFactorState = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PENDING_KEY);
  window.sessionStorage.removeItem(SATISFIED_KEY);
  emitStateChanged();
};
