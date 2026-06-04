import { BLANK_CANDIDATE_PROFILE, BLANK_RECRUITER_PROFILE } from '../constants';
import { CandidateProfile, RecruiterProfile } from '../types';
import { normalizeFullName } from '../utils/nameFormat';
import { normalizeEducationEntries } from '../utils/education';
import { logActivity } from './activityLogService';
import { ensureLocalizedCandidateContent } from './dbService';
import { createIsolatedSupabaseClient, isSupabaseConfigured, supabase } from './supabaseClient';

export interface AdminAccount {
    id: string;
    email: string;
    fullName: string;
}

export interface SeekerProvisionInput {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
    currentJobFunction?: string;
    currentSeniorityLevel?: string;
    city?: string;
    country?: string;
    summaryText?: string;
    candidateProfile?: Partial<CandidateProfile>;
}

export interface RecruiterProvisionInput {
    fullName: string;
    email: string;
    password: string;
    recruiterRole?: string;
    companyName?: string;
    sectorText?: string;
    city?: string;
    country?: string;
    address?: string;
}

export interface ProvisionedAccountRecord {
    id: string;
    role: 'seeker' | 'recruiter';
    email: string;
    password: string;
    fullName: string;
    lineOne: string;
    lineTwo: string;
    createdAt: string;
}

export const DEFAULT_DEV_ADMIN_EMAIL = 'admin@admin.admin';
export const DEFAULT_DEV_ADMIN_PASSWORD = 'password123';
export const DEFAULT_TEMP_RECRUITER_PASSWORD = 'password123';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const splitFullName = (fullName?: string) => {
    const normalized = normalizeFullName(fullName);
    const parts = normalized.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || 'New';
    const lastName = parts.slice(1).join(' ') || 'User';
    return {
        fullName: normalized || `${firstName} ${lastName}`,
        firstName,
        lastName,
    };
};

const parseCsvValues = (value?: string) =>
    (value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

const normalizeCountryCode = (value?: string) => (value || '').trim().toLowerCase();
const trimValue = (value?: string) => (value || '').trim();
const ensureStringArray = (value?: string[] | null) =>
    Array.isArray(value) ? value.map((entry) => entry?.trim()).filter(Boolean) as string[] : [];
const ensureArray = <T>(value?: T[] | null) => (Array.isArray(value) ? value : []);

const isAlreadyRegisteredError = (message?: string) =>
    (message || '').toLowerCase().includes('already registered');

const upsertAdminProfile = async (
    client: typeof supabase,
    userId: string,
    email: string,
    fullName?: string
) => {
    const normalizedFullName = normalizeFullName(fullName) || 'System Administrator';
    const { error } = await client.from('profiles').upsert({
        id: userId,
        email: normalizeEmail(email),
        role: 'admin',
        full_name: normalizedFullName,
    });

    if (error) {
        throw error;
    }
};

export const isDefaultDevAdminCredentials = (email: string, password: string) =>
    import.meta.env.DEV &&
    normalizeEmail(email) === DEFAULT_DEV_ADMIN_EMAIL &&
    password === DEFAULT_DEV_ADMIN_PASSWORD;

export const bootstrapDefaultDevAdmin = async (email: string, password: string): Promise<boolean> => {
    if (!isDefaultDevAdminCredentials(email, password)) {
        return false;
    }

    if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured. Check your local environment variables first.');
    }

    const isolatedClient = createIsolatedSupabaseClient();
    const normalizedEmail = normalizeEmail(email);

    const { data: signInData, error: signInError } = await isolatedClient.auth.signInWithPassword({
        email: normalizedEmail,
        password,
    });

    if (!signInError && signInData.user) {
        await upsertAdminProfile(isolatedClient, signInData.user.id, normalizedEmail, 'System Administrator');
        await isolatedClient.auth.signOut();
        return true;
    }

    const { data, error } = await isolatedClient.auth.signUp({
        email: normalizedEmail,
        password,
    });

    if (error && !isAlreadyRegisteredError(error.message)) {
        throw error;
    }

    if (!data.user) {
        if (isAlreadyRegisteredError(error?.message)) {
            if (signInError?.code === 'invalid_credentials') {
                throw new Error(
                    'The default admin account already exists in Supabase Auth, but its password is not "password123". ' +
                    'The app only has the anon key, so it cannot reset an existing auth user automatically. ' +
                    'Reset or delete admin@admin.admin in the Supabase dashboard, then try again.'
                );
            }

            throw new Error(
                'The default admin account already exists, but Supabase did not allow automatic repair from the client. ' +
                'Please repair admin@admin.admin in the Supabase dashboard and try again.'
            );
        }

        throw new Error('Supabase did not return the default admin user during bootstrap.');
    }

    if (!data.session) {
        throw new Error('The default admin account was created, but email confirmation is enabled so the admin profile could not be finalized automatically.');
    }

    await upsertAdminProfile(isolatedClient, data.user.id, normalizedEmail, 'System Administrator');
    await isolatedClient.auth.signOut();
    return true;
};

export const listSystemAdmins = async (): Promise<AdminAccount[]> => {
    if (!isSupabaseConfigured) {
        return [];
    }

    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('role', 'admin')
        .order('email', { ascending: true });

    if (!error && data && data.length > 0) {
        return data.map((admin: any) => ({
            id: admin.id,
            email: admin.email,
            fullName: admin.full_name || 'System Administrator',
        }));
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('get_debug_data');

    if (rpcError) {
        throw error || rpcError;
    }

    return (((rpcData as any)?.users || []) as any[])
        .filter((user) => user.role === 'admin')
        .map((admin) => ({
            id: admin.id,
            email: admin.email,
            fullName: admin.full_name || 'System Administrator',
        }))
        .sort((left, right) => left.email.localeCompare(right.email));
};

export const createSystemAdmin = async (
    email: string,
    password: string,
    fullName?: string
): Promise<AdminAccount> => {
    if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured. Check your local environment variables first.');
    }

    const normalizedEmail = normalizeEmail(email);
    const isolatedClient = createIsolatedSupabaseClient();

    const { data, error } = await isolatedClient.auth.signUp({
        email: normalizedEmail,
        password,
    });

    if (error) {
        if (isAlreadyRegisteredError(error.message)) {
            throw new Error('An account with this email already exists.');
        }
        throw error;
    }

    if (!data.user) {
        throw new Error('Supabase did not return the new admin user.');
    }

    if (!data.session) {
        throw new Error('Admin account created, but email confirmation is enabled so the admin profile could not be finalized automatically.');
    }

    await upsertAdminProfile(isolatedClient, data.user.id, normalizedEmail, fullName);
    await isolatedClient.auth.signOut();

    void logActivity({
        eventType: 'admin_created',
        source: 'adminService',
        purpose: 'admin_account_creation',
        entityType: 'admin',
        entityId: data.user.id,
        entityLabel: normalizedEmail,
        summary: `Created a new system admin for ${normalizedEmail}.`,
        metadata: {
            full_name: normalizeFullName(fullName) || 'System Administrator',
        },
    });

    return {
        id: data.user.id,
        email: normalizedEmail,
        fullName: normalizeFullName(fullName) || 'System Administrator',
    };
};

export const updateSystemAdminProfile = async (
    adminId: string,
    input: {
        email: string;
        fullName?: string;
    }
): Promise<AdminAccount> => {
    if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured. Check your local environment variables first.');
    }

    const normalizedEmail = normalizeEmail(input.email);
    const fullName = normalizeFullName(input.fullName) || 'System Administrator';

    const { data, error } = await supabase
        .from('profiles')
        .update({
            email: normalizedEmail,
            full_name: fullName,
        })
        .eq('id', adminId)
        .eq('role', 'admin')
        .select('id, email, full_name')
        .maybeSingle();

    if (!error && data) {
        return {
            id: data.id,
            email: data.email,
            fullName: data.full_name || fullName,
        };
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('update_debug_entity', {
        p_type: 'user',
        p_id: adminId,
        p_content: {
            id: adminId,
            email: normalizedEmail,
            role: 'admin',
            full_name: fullName,
        },
    });

    if (rpcError) {
        const message = `${rpcError.message || ''} ${rpcError.details || ''}`.trim();
        if (rpcError.code === '42883' || message.includes('update_debug_entity')) {
            throw new Error("RPC Missing. Please run 'debug_rpc.sql' in Supabase SQL Editor.");
        }
        throw rpcError;
    }

    if ((rpcData as any)?.status === 'error') {
        throw new Error((rpcData as any).message || 'Unable to update the admin profile.');
    }

    return {
        id: adminId,
        email: normalizedEmail,
        fullName,
    };
};

export const createSystemSeeker = async (
    input: SeekerProvisionInput
): Promise<ProvisionedAccountRecord> => {
    if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured. Check your local environment variables first.');
    }

    const normalizedEmail = normalizeEmail(input.email);
    const isolatedClient = createIsolatedSupabaseClient();
    const { fullName, firstName, lastName } = splitFullName(input.fullName);

    const { data, error } = await isolatedClient.auth.signUp({
        email: normalizedEmail,
        password: input.password,
    });

    if (error) {
        if (isAlreadyRegisteredError(error.message)) {
            throw new Error('An account with this email already exists.');
        }
        throw error;
    }

    if (!data.user) {
        throw new Error('Supabase did not return the new seeker user.');
    }

    if (!data.session) {
        throw new Error('Seeker account created, but email confirmation is enabled so the profile could not be finalized automatically.');
    }

    const cvProfile = input.candidateProfile;
    const targetJobFunctions = input.currentJobFunction
        ? [input.currentJobFunction.trim()]
        : ensureStringArray(cvProfile?.target_job_functions);
    const fallbackResidence = cvProfile?.residence;
    const fallbackContacts = cvProfile?.contacts;
    const fallbackPreferences = cvProfile?.preferences;

    const candidate: CandidateProfile = {
        ...BLANK_CANDIDATE_PROFILE,
        ...cvProfile,
        id: data.user.id,
        personal_info: {
            ...BLANK_CANDIDATE_PROFILE.personal_info,
            ...cvProfile?.personal_info,
            first_name: firstName,
            last_name: lastName,
        },
        residence: {
            ...BLANK_CANDIDATE_PROFILE.residence,
            ...fallbackResidence,
            country: normalizeCountryCode(input.country || fallbackResidence?.country),
            city: trimValue(input.city || fallbackResidence?.city),
            address: trimValue(fallbackResidence?.address),
        },
        contacts: {
            email: normalizedEmail,
            phone: trimValue(input.phone || fallbackContacts?.phone),
        },
        current_job_function: trimValue(input.currentJobFunction || cvProfile?.current_job_function),
        current_seniority_level: trimValue(input.currentSeniorityLevel || cvProfile?.current_seniority_level) || undefined,
        target_job_functions: targetJobFunctions,
        industry_experience: ensureStringArray(cvProfile?.industry_experience),
        skills: ensureArray(cvProfile?.skills),
        it_skills: ensureArray(cvProfile?.it_skills),
        soft_skills: ensureArray(cvProfile?.soft_skills),
        languages: ensureArray(cvProfile?.languages),
        certifications: ensureArray(cvProfile?.certifications),
        preferences: {
            ...BLANK_CANDIDATE_PROFILE.preferences,
            ...fallbackPreferences,
            preferred_locations: ensureArray(fallbackPreferences?.preferred_locations).map((location) => ({
                country: normalizeCountryCode(location?.country),
                city: trimValue(location?.city),
            })),
            desired_contract_types: ensureStringArray(fallbackPreferences?.desired_contract_types),
            industries: ensureStringArray(fallbackPreferences?.industries),
            work_eligibility_countries: ensureStringArray(fallbackPreferences?.work_eligibility_countries),
        },
        summary_text: trimValue(input.summaryText || cvProfile?.summary_text),
        experiences: ensureArray(cvProfile?.experiences),
        education: normalizeEducationEntries(ensureArray(cvProfile?.education)),
    };
    const localizedCandidate = await ensureLocalizedCandidateContent(candidate);

    const { error: profileError } = await isolatedClient.from('profiles').upsert({
        id: data.user.id,
        email: normalizedEmail,
        role: 'seeker',
        full_name: fullName,
    });

    if (profileError) {
        throw profileError;
    }

    const { error: candidateError } = await isolatedClient.from('candidates').upsert({
        id: localizedCandidate.id,
        user_id: data.user.id,
        content: localizedCandidate,
        embedding: null,
    });

    if (candidateError) {
        throw candidateError;
    }

    await isolatedClient.auth.signOut();

    void logActivity({
        eventType: 'candidate_profile_created',
        source: 'adminService',
        purpose: 'candidate_provisioning',
        entityType: 'candidate',
        entityId: candidate.id,
        entityLabel: fullName,
        summary: `Provisioned seeker profile for ${fullName}.`,
        metadata: {
            email: normalizedEmail,
            current_job_function: candidate.current_job_function || null,
            current_seniority_level: candidate.current_seniority_level || null,
        },
    });

    return {
        id: data.user.id,
        role: 'seeker',
        email: normalizedEmail,
        password: input.password,
        fullName,
        lineOne: candidate.current_job_function || 'Seeker profile created',
        lineTwo: [candidate.residence.city, candidate.residence.country?.toUpperCase()].filter(Boolean).join(', '),
        createdAt: new Date().toISOString(),
    };
};

export const createSystemRecruiter = async (
    input: RecruiterProvisionInput
): Promise<ProvisionedAccountRecord> => {
    if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured. Check your local environment variables first.');
    }

    const normalizedEmail = normalizeEmail(input.email);
    const isolatedClient = createIsolatedSupabaseClient();
    const { fullName, firstName, lastName } = splitFullName(input.fullName);

    const { data, error } = await isolatedClient.auth.signUp({
        email: normalizedEmail,
        password: input.password,
    });

    if (error) {
        if (isAlreadyRegisteredError(error.message)) {
            throw new Error('An account with this email already exists.');
        }
        throw error;
    }

    if (!data.user) {
        throw new Error('Supabase did not return the new recruiter user.');
    }

    if (!data.session) {
        throw new Error('Recruiter account created, but email confirmation is enabled so the profile could not be finalized automatically.');
    }

    const recruiter: RecruiterProfile = {
        id: data.user.id,
        email: normalizedEmail,
        ...BLANK_RECRUITER_PROFILE,
        first_name: firstName,
        last_name: lastName,
        role: (input.recruiterRole || '').trim(),
        company_name: (input.companyName || '').trim(),
        must_change_password: true,
        sector: parseCsvValues(input.sectorText),
        company_location: {
            country: (input.country || '').trim().toLowerCase(),
            city: (input.city || '').trim(),
            address: (input.address || '').trim(),
        },
    };

    const { error: profileError } = await isolatedClient.from('profiles').upsert({
        id: data.user.id,
        email: normalizedEmail,
        role: 'recruiter',
        full_name: fullName,
    });

    if (profileError) {
        throw profileError;
    }

    const { error: recruiterError } = await isolatedClient.from('recruiters').upsert({
        id: recruiter.id,
        content: recruiter,
    });

    if (recruiterError) {
        throw recruiterError;
    }

    await isolatedClient.auth.signOut();

    void logActivity({
        eventType: 'recruiter_created',
        source: 'adminService',
        purpose: 'recruiter_provisioning',
        entityType: 'recruiter',
        entityId: recruiter.id,
        entityLabel: recruiter.company_name || fullName,
        summary: `Provisioned recruiter account for ${fullName}.`,
        metadata: {
            email: normalizedEmail,
            recruiter_role: recruiter.role || null,
            company_name: recruiter.company_name || null,
        },
    });

    return {
        id: data.user.id,
        role: 'recruiter',
        email: normalizedEmail,
        password: input.password,
        fullName,
        lineOne: recruiter.company_name || 'Recruiter profile created',
        lineTwo: [recruiter.role, recruiter.company_location.city, recruiter.company_location.country?.toUpperCase()].filter(Boolean).join(' • '),
        createdAt: new Date().toISOString(),
    };
};

export const resetUserPassword = async (
    userId: string,
    newPassword: string
): Promise<void> => {
    if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured. Check your local environment variables first.');
    }

    const { data, error } = await supabase.rpc('reset_user_password', {
        p_user_id: userId,
        p_new_password: newPassword,
    });

    if (error) {
        const message = `${error.message || ''} ${error.details || ''}`.trim();
        if (error.code === '42883' || message.includes('reset_user_password')) {
            throw new Error("RPC Missing. Please run 'reset_user_password.sql' in Supabase SQL Editor to create this RPC.");
        }
        throw error;
    }

    if ((data as any)?.status === 'error') {
        throw new Error((data as any).message || 'Unable to reset the user password.');
    }

    void logActivity({
        eventType: 'password_reset',
        source: 'adminService',
        purpose: 'admin_password_reset',
        entityType: 'user',
        entityId: userId,
        entityLabel: userId,
        summary: `Admin reset password for user ${userId}.`,
    });
};

export const markUserMustChangePassword = async (
    userId: string,
    userType: 'candidate' | 'recruiter',
    mustChangePassword = true,
): Promise<void> => {
    if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured. Check your local environment variables first.');
    }

    const tableName = userType === 'recruiter' ? 'recruiters' : 'candidates';
    const entityType = userType === 'recruiter' ? 'recruiter' : 'candidate';

    const { data: directData, error: directError } = await supabase
        .from(tableName)
        .select('content')
        .eq('id', userId)
        .maybeSingle();

    let entityContent = (directData?.content as RecruiterProfile | CandidateProfile | undefined) ?? null;

    if (!entityContent || directError) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_debug_data');
        if (rpcError) {
            throw rpcError;
        }

        const collectionKey = userType === 'recruiter' ? 'recruiters' : 'candidates';
        const match = (((rpcData as any)?.[collectionKey] || []) as any[]).find(
            (row) => row?.id === userId || row?.content?.id === userId,
        );

        entityContent = (match?.content as RecruiterProfile | CandidateProfile | undefined) ?? null;
    }

    if (!entityContent) {
        throw new Error(`Unable to find the ${userType} profile to update the password policy.`);
    }

    const nextContent = {
        ...entityContent,
        must_change_password: mustChangePassword,
    };

    const { data, error } = await supabase.rpc('update_debug_entity', {
        p_type: entityType,
        p_id: userId,
        p_content: nextContent,
    });

    if (error) {
        const message = `${error.message || ''} ${error.details || ''}`.trim();
        if (error.code === '42883' || message.includes('update_debug_entity')) {
            throw new Error("RPC Missing. Please run 'debug_rpc.sql' in Supabase SQL Editor.");
        }
        throw error;
    }

    if ((data as any)?.status === 'error') {
        throw new Error((data as any).message || 'Unable to update the password policy for this user.');
    }
};
