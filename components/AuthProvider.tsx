
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { UserRole } from '../types';
import { buildNormalizedFullName, normalizeFullName } from '../utils/nameFormat';
import { clearPendingPasswordRecovery, markPendingPasswordRecovery } from '../services/passwordRecoveryService';
import {
    AdminImpersonationSession,
    clearAdminImpersonation,
    loadAdminImpersonation,
    saveAdminImpersonation,
} from '../services/impersonationService';
import {
    clearPasskeySecondFactorState,
    isPasskeySecondFactorPendingForSession,
    isPasskeySecondFactorSatisfied,
    PASSKEY_SECOND_FACTOR_STATE_CHANGED_EVENT,
} from '../services/passkeySecondFactorService';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    signOut: () => Promise<void>;
    userRole: UserRole;
    profileName: string | null;
    effectiveUserRole: UserRole;
    actualUserRole: UserRole;
    effectiveProfileId: string | null;
    effectiveDisplayName: string | null;
    effectiveEmail: string | null;
    impersonation: AdminImpersonationSession | null;
    isImpersonating: boolean;
    startImpersonation: (target: {
        profileId: string;
        email: string;
        role: Extract<UserRole, 'seeker' | 'recruiter'>;
        fullName?: string;
    }) => void;
    stopImpersonation: () => void;
    refreshProfile: () => Promise<UserRole>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    loading: true,
    signOut: async () => { },
    userRole: null,
    profileName: null,
    effectiveUserRole: null,
    actualUserRole: null,
    effectiveProfileId: null,
    effectiveDisplayName: null,
    effectiveEmail: null,
    impersonation: null,
    isImpersonating: false,
    startImpersonation: () => { },
    stopImpersonation: () => { },
    refreshProfile: async () => null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState<UserRole>(null);
    const [profileName, setProfileName] = useState<string | null>(null);
    const [impersonation, setImpersonation] = useState<AdminImpersonationSession | null>(() => loadAdminImpersonation());
    const lastUserIdRef = useRef<string | null>(null);
    const initializedRef = useRef(false);

    const clearPersistedSessionState = () => {
        if (typeof window === 'undefined') return;

        const clearStore = (store: Storage) => {
            const keysToRemove: string[] = [];
            for (let index = 0; index < store.length; index += 1) {
                const key = store.key(index);
                if (!key) continue;
                if (
                    key === 'lastRoute' ||
                    key === 'lastRouteState' ||
                    key.includes('supabase.auth.token') ||
                    (key.startsWith('sb-') && key.endsWith('-auth-token'))
                ) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach((key) => store.removeItem(key));
        };

        clearStore(window.localStorage);
        clearStore(window.sessionStorage);
    };

    const clearAuthState = () => {
        setSession(null);
        setUser(null);
        setUserRole(null);
        setProfileName(null);
        setImpersonation(null);
        clearAdminImpersonation();
        lastUserIdRef.current = null;
    };

    const fetchProfile = async (userId: string): Promise<UserRole> => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('role, full_name')
                .eq('id', userId)
                .single();

            if (data && !error) {
                const nextRole = data.role as UserRole;
                let nextProfileName = normalizeFullName(data.full_name) || null;

                if (nextProfileName && data.full_name !== nextProfileName) {
                    await supabase
                        .from('profiles')
                        .update({ full_name: nextProfileName })
                        .eq('id', userId);
                }

                if (!nextProfileName && nextRole === 'seeker') {
                    // Run both candidate lookups in parallel (one extra request worst case,
                    // but halves the round-trip latency on login).
                    const candidateResults = await Promise.all([
                        supabase.from('candidates').select('content').eq('user_id', userId).maybeSingle(),
                        supabase.from('candidates').select('content').eq('id', userId).maybeSingle(),
                    ]);

                    const hit = candidateResults.find(({ data: d, error: e }) => !e && d?.content);
                    if (hit?.data?.content) {
                        const candidateContent = hit.data.content as { personal_info?: { first_name?: string; last_name?: string; }; };
                        nextProfileName = buildNormalizedFullName(
                            candidateContent.personal_info?.first_name,
                            candidateContent.personal_info?.last_name
                        ) || null;

                        if (nextProfileName && !data.full_name) {
                            await supabase
                                .from('profiles')
                                .update({ full_name: nextProfileName })
                                .eq('id', userId);
                        }
                    }
                }

                setUserRole(nextRole);
                setProfileName(nextProfileName);
                return nextRole;
            }

            setUserRole(null);
            setProfileName(null);
            return null;
        } catch (e) {
            console.error("Error fetching profile:", e);
            setUserRole(null);
            setProfileName(null);
            return null;
        }
    };

    const syncSession = async (nextSession: Session | null) => {
        setSession(nextSession);

        if (nextSession?.user) {
            if (isPasskeySecondFactorPendingForSession(nextSession.user.id)) {
                setUser(null);
                setUserRole(null);
                setProfileName(null);
                setLoading(false);
                return;
            }

            if (!isPasskeySecondFactorSatisfied(nextSession.user.id)) {
                try {
                    const { data: passkeys, error } = await supabase.auth.passkey.list();
                    if (!error && passkeys && passkeys.length > 0) {
                        clearAuthState();
                        await supabase.auth.signOut({ scope: 'local' });
                        setLoading(false);
                        return;
                    }

                    if (error) {
                        console.warn('Unable to check passkey second-factor status. Continuing with the existing session:', error);
                    }
                } catch (error) {
                    console.warn('Unable to check passkey second-factor status. Continuing with the existing session:', error);
                }
            }

            setUser(nextSession.user);
            await fetchProfile(nextSession.user.id);
        } else {
            setUser(null);
            setUserRole(null);
            setProfileName(null);
        }

        setLoading(false);
    };

    useEffect(() => {
        setLoading(true);
        let isMounted = true;

        // onAuthStateChange fires an INITIAL_SESSION event on subscribe, so it
        // covers both the initial load and subsequent changes. We distinguish
        // the first event (full sync) from later events (silent refresh) so a
        // TOKEN_REFRESHED on tab focus does not remount the whole route tree.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
            if (!isMounted) return;
            if (event === 'PASSWORD_RECOVERY') {
                markPendingPasswordRecovery();
            }
            const nextUserId = nextSession?.user?.id ?? null;

            if (!initializedRef.current) {
                initializedRef.current = true;
                lastUserIdRef.current = nextUserId;
                void syncSession(nextSession);
                return;
            }

            if (lastUserIdRef.current === nextUserId) {
                // Same user (TOKEN_REFRESHED / USER_UPDATED / focus-triggered
                // SIGNED_IN): update the session silently without flipping
                // `loading`, which would unmount descendants.
                setSession(nextSession);
                setUser((prev) => (prev?.id === nextSession?.user?.id ? prev : nextSession?.user ?? null));
                return;
            }

            lastUserIdRef.current = nextUserId;
            setLoading(true);
            void syncSession(nextSession);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        const handlePasskeySecondFactorStateChanged = () => {
            void supabase.auth.getSession().then(({ data }) => {
                void syncSession(data.session);
            });
        };

        window.addEventListener(PASSKEY_SECOND_FACTOR_STATE_CHANGED_EVENT, handlePasskeySecondFactorStateChanged);
        return () => {
            window.removeEventListener(PASSKEY_SECOND_FACTOR_STATE_CHANGED_EVENT, handlePasskeySecondFactorStateChanged);
        };
    }, []);

    useEffect(() => {
        if (!user || userRole !== 'admin') {
            if (impersonation) {
                setImpersonation(null);
                clearAdminImpersonation();
            }
            return;
        }

        if (impersonation && impersonation.adminId !== user.id) {
            setImpersonation(null);
            clearAdminImpersonation();
        }
    }, [user, userRole, impersonation]);

    const signOut = async () => {
        clearPersistedSessionState();
        clearAuthState();
        clearPendingPasswordRecovery();
        clearPasskeySecondFactorState();

        try {
            await supabase.auth.signOut({ scope: 'local' });
        } catch (error) {
            console.error('Supabase local sign-out failed, but local auth state was cleared anyway:', error);
        }
    };

    const startImpersonation: AuthContextType['startImpersonation'] = (target) => {
        if (!user || userRole !== 'admin') return;

        const nextSession: AdminImpersonationSession = {
            adminId: user.id,
            adminEmail: user.email || '',
            profileId: target.profileId,
            email: target.email,
            fullName: target.fullName,
            role: target.role,
        };

        setImpersonation(nextSession);
        saveAdminImpersonation(nextSession);
    };

    const stopImpersonation = () => {
        setImpersonation(null);
        clearAdminImpersonation();
    };

    const refreshProfile = async (): Promise<UserRole> => {
        if (user) {
            return fetchProfile(user.id);
        }

        setUserRole(null);
        return null;
    };

    const effectiveUserRole = impersonation?.role || userRole;
    const effectiveProfileId = impersonation?.profileId || user?.id || null;
    const effectiveDisplayName = impersonation?.fullName || profileName || user?.email?.split('@')[0] || null;
    const effectiveEmail = impersonation?.email || user?.email || null;
    const isImpersonating = Boolean(impersonation);

    return (
        <AuthContext.Provider
            value={{
                session,
                user,
                loading,
                signOut,
                userRole,
                profileName,
                effectiveUserRole,
                actualUserRole: userRole,
                effectiveProfileId,
                effectiveDisplayName,
                effectiveEmail,
                impersonation,
                isImpersonating,
                startImpersonation,
                stopImpersonation,
                refreshProfile,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
