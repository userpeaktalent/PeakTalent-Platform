import { UserRole } from '../types';

export type ImpersonationRole = Extract<UserRole, 'seeker' | 'recruiter'>;
const IMPERSONATION_STORAGE_KEY = 'peaktalent:admin-impersonation';

export interface AdminImpersonationSession {
    adminId: string;
    adminEmail: string;
    profileId: string;
    email: string;
    fullName?: string;
    role: ImpersonationRole;
}

let _session: AdminImpersonationSession | null = null;

const canUseSessionStorage = () =>
    typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

const isValidImpersonationSession = (session: any): session is AdminImpersonationSession => {
    return Boolean(
        session?.adminId &&
        session?.profileId &&
        session?.email &&
        session?.role &&
        (session.role === 'seeker' || session.role === 'recruiter')
    );
};

const persistAdminImpersonation = (session: AdminImpersonationSession | null) => {
    if (!canUseSessionStorage()) return;

    if (!session) {
        window.sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
        return;
    }

    window.sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(session));
};

export const loadAdminImpersonation = (): AdminImpersonationSession | null => {
    if (_session) return _session;
    if (!canUseSessionStorage()) return null;

    const raw = window.sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        if (!isValidImpersonationSession(parsed)) {
            window.sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
            return null;
        }

        _session = parsed;
        return _session;
    } catch (error) {
        console.warn('[Impersonation] Failed to parse persisted session; clearing it.', error);
        window.sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
        return null;
    }
};

export const saveAdminImpersonation = (session: AdminImpersonationSession) => {
    if (!isValidImpersonationSession(session)) {
        console.warn('[Impersonation] Attempted to save invalid session; ignoring.');
        return;
    }

    _session = session;
    persistAdminImpersonation(session);
};

export const clearAdminImpersonation = () => {
    _session = null;
    persistAdminImpersonation(null);
};

export const getEffectiveProfileId = (fallbackProfileId?: string | null) =>
    _session?.profileId || fallbackProfileId || null;

export const getEffectiveUserEmail = (fallbackEmail?: string | null) =>
    _session?.email || fallbackEmail || null;
