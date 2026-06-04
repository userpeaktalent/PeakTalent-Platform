
import { CandidateProfile, JobProfile, User, RecruiterProfile, Notification, TechnicalTest, MatchingPillarWeights, PrestigeListOverride } from '../types';
import { logActivity } from './activityLogService';
import { attachEmbeddingMetadata } from './embeddingService';
import {
    buildNormalizedFullName,
    formatCandidateName,
    normalizeCandidateProfileNames,
    normalizeFullName,
    normalizeRecruiterProfileNames,
} from '../utils/nameFormat';
import { createIsolatedSupabaseClient, supabase } from './supabaseClient';
import { generateTechnicalTestForJob, translateCandidateText, translateProfessionalSummary } from './geminiService';
import {
    getEffectiveProfileId,
    getEffectiveUserEmail,
    loadAdminImpersonation,
} from './impersonationService';
import { buildSeekerJobUrl, EMAIL_SENDING_PAUSED_MESSAGE, sendRecruiterInviteEmail } from './recruiterEmailService';
import { getCurrentQuizResult, isJobQuizEnabled, normalizeJobQuestionnaireState } from '../utils/questionnaire';

const normalizeRecruiterProfile = (recruiter: RecruiterProfile): RecruiterProfile => ({
    ...normalizeRecruiterProfileNames(recruiter),
    company_visibility: recruiter.company_visibility ?? true,
});

const ensureLocalizedCandidateSummary = async (candidate: CandidateProfile): Promise<CandidateProfile> => {
    const summaryText = candidate.summary_text?.trim();
    if (!summaryText) {
        return candidate;
    }

    const localizedCandidate: CandidateProfile = {
        ...candidate,
        summary_text: summaryText,
    };

    const needsItalian = !localizedCandidate.summary_text_it?.trim();
    const needsEnglish = !localizedCandidate.summary_text_en?.trim();

    if (!needsItalian && !needsEnglish) {
        return localizedCandidate;
    }

    try {
        const [translatedItalian, translatedEnglish] = await Promise.all([
            needsItalian ? translateProfessionalSummary(summaryText, 'it') : Promise.resolve(localizedCandidate.summary_text_it || ''),
            needsEnglish ? translateProfessionalSummary(summaryText, 'en') : Promise.resolve(localizedCandidate.summary_text_en || ''),
        ]);

        if (needsItalian && translatedItalian.trim()) {
            localizedCandidate.summary_text_it = translatedItalian.trim();
        }

        if (needsEnglish && translatedEnglish.trim()) {
            localizedCandidate.summary_text_en = translatedEnglish.trim();
        }
    } catch (error) {
        console.warn('Unable to localize candidate summary during save:', error);
    }

    return localizedCandidate;
};

const localizeCandidateTextFields = async (
    value: string | undefined,
    currentItalian: string | undefined,
    currentEnglish: string | undefined,
    context: 'work experience description' | 'education description',
) => {
    const sourceText = value?.trim();
    if (!sourceText) {
        return { it: currentItalian, en: currentEnglish };
    }

    const needsItalian = !currentItalian?.trim();
    const needsEnglish = !currentEnglish?.trim();

    if (!needsItalian && !needsEnglish) {
        return { it: currentItalian, en: currentEnglish };
    }

    try {
        const [translatedItalian, translatedEnglish] = await Promise.all([
            needsItalian ? translateCandidateText(sourceText, 'it', context) : Promise.resolve(currentItalian || ''),
            needsEnglish ? translateCandidateText(sourceText, 'en', context) : Promise.resolve(currentEnglish || ''),
        ]);

        return {
            it: needsItalian && translatedItalian.trim() ? translatedItalian.trim() : currentItalian,
            en: needsEnglish && translatedEnglish.trim() ? translatedEnglish.trim() : currentEnglish,
        };
    } catch (error) {
        console.warn(`Unable to localize candidate ${context}:`, error);
        return { it: currentItalian, en: currentEnglish };
    }
};

export const ensureLocalizedCandidateContent = async (candidate: CandidateProfile): Promise<CandidateProfile> => {
    const localizedCandidate = await ensureLocalizedCandidateSummary(candidate);

    const localizedExperiences = await Promise.all((localizedCandidate.experiences || []).map(async (experience) => {
        const localized = await localizeCandidateTextFields(
            experience.description,
            experience.description_it,
            experience.description_en,
            'work experience description',
        );

        return {
            ...experience,
            description_it: localized.it,
            description_en: localized.en,
        };
    }));

    const localizedEducation = await Promise.all((localizedCandidate.education || []).map(async (education) => {
        const localized = await localizeCandidateTextFields(
            education.description,
            education.description_it,
            education.description_en,
            'education description',
        );

        return {
            ...education,
            description_it: localized.it,
            description_en: localized.en,
        };
    }));

    return {
        ...localizedCandidate,
        experiences: localizedExperiences,
        education: localizedEducation,
    };
};

const isJobVisibleToSeekers = (job: JobProfile): boolean => job.visible_to_seekers !== false && job.is_archived !== true;

const resolveEffectiveViewerRole = async (): Promise<'seeker' | 'recruiter' | 'admin' | null> => {
    const impersonation = loadAdminImpersonation();
    if (impersonation?.role) {
        return impersonation.role;
    }

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user?.id) {
        return null;
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle();

    return (profile?.role as 'seeker' | 'recruiter' | 'admin' | null) ?? null;
};

const filterJobsForCurrentViewer = async (jobs: JobProfile[]): Promise<JobProfile[]> => {
    const viewerRole = await resolveEffectiveViewerRole();
    if (viewerRole !== 'seeker') {
        return jobs;
    }

    return jobs.filter(isJobVisibleToSeekers);
};

/**
 * Reads the native pgvector 'embedding' column returned by Supabase/PostgREST
 * (as a "[v1,v2,...]" string or number[]) and assigns it to profile.embedding_vector
 * if the content JSONB did not already include it.
 * This ensures calculateMatchScore always has the vector even when the JSONB
 * was saved before embedding generation succeeded.
 */
export function hydrateEmbedding<T extends { embedding_vector?: number[] }>(profile: T, embeddingCol: any): T {
    if (!profile.embedding_vector && embeddingCol) {
        try {
            const vec: number[] = typeof embeddingCol === 'string'
                ? JSON.parse(embeddingCol)
                : embeddingCol;
            if (Array.isArray(vec) && vec.length > 0) {
                profile.embedding_vector = vec;
            }
        } catch { /* ignore malformed values */ }
    }
    return profile;
}

const resolveEffectiveActor = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const fallbackEmail = getEffectiveUserEmail(authData.user?.email);
    const profileId = getEffectiveProfileId(authData.user?.id);
    let fullName: string | null = null;

    if (profileId) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', profileId)
            .maybeSingle();

        fullName = profile?.full_name?.trim() || null;
    }

    return {
        profileId,
        email: fallbackEmail,
        fullName,
        isImpersonating: Boolean(loadAdminImpersonation()),
    };
};

const getLocalImpersonationPassword = (): string => {
    const pwd = import.meta.env.VITE_LOCAL_IMPERSONATION_PASSWORD;

    if (typeof pwd === 'string' && pwd.trim()) {
        return pwd.trim();
    }

    throw new Error(
        'VITE_LOCAL_IMPERSONATION_PASSWORD env var is not set. ' +
        'This value is only required for local admin impersonation fallbacks.'
    );
};
const LOCAL_UNAPPLY_STORAGE_KEY = 'peaktalent_locally_unapplied_jobs';
const LOCAL_APPLIED_STORAGE_KEY = 'peaktalent_locally_applied_jobs';

/**
 * Opens an isolated Supabase session authenticated as the impersonated user,
 * runs `fn` with that client, then always signs out — even on error.
 * Throws if the session cannot be opened.
 */
async function withImpersonatedSession<T>(
    impersonation: { email: string },
    fn: (client: ReturnType<typeof createIsolatedSupabaseClient>) => Promise<T>
): Promise<T> {
    const localImpersonationPassword = getLocalImpersonationPassword();
    const isolatedClient = createIsolatedSupabaseClient();
    const { data: signInData, error: signInError } = await isolatedClient.auth.signInWithPassword({
        email: impersonation.email,
        password: localImpersonationPassword,
    });
    if (signInError || !signInData.user) {
        throw new Error(
            `Impersonated session could not be opened for ${impersonation.email}: ` +
            (signInError?.message || 'unknown error')
        );
    }
    try {
        return await fn(isolatedClient);
    } finally {
        await isolatedClient.auth.signOut();
    }
}

interface AdminJobApplicantRpcRow {
    candidate_id: string;
    status: string | null;
    candidate_user_id: string;
    candidate_content: CandidateProfile;
    candidate_embedding: string | number[] | null;
}

interface AdminCandidateJobRpcRow {
    job_id: string;
    recruiter_id: string | null;
    job_content: JobProfile;
    job_embedding: string | number[] | null;
}

interface CandidateJobStatusRpcRow {
    job_id: string;
    recruiter_id: string | null;
    application_status: string | null;
    job_content: JobProfile;
    job_embedding: string | number[] | null;
}

type CandidateAssessmentRequestResult = {
    updatedJob: JobProfile;
    candidateProfileId: string;
    assessmentStatus: 'requested' | 'already_completed';
    emailDeliveryError?: string | null;
};

type CandidateAiRefinementRequestResult = {
    emailDeliveryError?: string | null;
};

const saveRecruiterViaAdminConsoleRpc = async (recruiterId: string, recruiter: RecruiterProfile): Promise<boolean> => {
    const impersonation = loadAdminImpersonation();

    if (!impersonation || impersonation.role !== 'recruiter' || impersonation.profileId !== recruiterId) {
        return false;
    }

    const normalizedRecruiter = normalizeRecruiterProfile(recruiter);
    const recruiterFullName = buildNormalizedFullName(normalizedRecruiter.first_name, normalizedRecruiter.last_name);

    const { error: profileError } = await supabase.from('profiles').upsert({
        id: recruiterId,
        email: normalizedRecruiter.email,
        role: 'recruiter',
        full_name: recruiterFullName || null,
    });

    if (profileError) {
        console.warn('Admin recruiter save could not update profiles directly, continuing with recruiter content save:', profileError);
    }

    const { data, error } = await supabase.rpc('update_debug_entity', {
        p_type: 'recruiter',
        p_id: recruiterId,
        p_content: normalizedRecruiter,
    });

    if (error) {
        const message = `${error.message || ''} ${error.details || ''}`.trim();
        const isMissingFunction = error.code === '42883' || message.includes('update_debug_entity');

        if (isMissingFunction) {
            console.warn('Admin recruiter save RPC is missing. Run debug_rpc.sql in Supabase SQL Editor to enable direct admin saves.');
            return false;
        }

        throw error;
    }

    if ((data as any)?.status === 'error') {
        throw new Error((data as any).message || 'Admin recruiter save failed inside update_debug_entity.');
    }

    const { error: profileSyncError } = await supabase.rpc('update_debug_entity', {
        p_type: 'user',
        p_id: recruiterId,
        p_content: {
            id: recruiterId,
            email: normalizedRecruiter.email,
            role: 'recruiter',
            full_name: recruiterFullName || null,
        }
    });

    if (profileSyncError) {
        console.warn('Recruiter profile content updated via admin RPC, but linked auth profile could not be fully synchronized:', profileSyncError);
    }

    return true;
};

const canUseLocalJobMemory = () =>
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const loadLocalUnapplyMap = (): Record<string, string[]> => {
    if (!canUseLocalJobMemory()) return {};

    try {
        const raw = window.localStorage.getItem(LOCAL_UNAPPLY_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        console.warn('Failed to read local unapply memory:', error);
        return {};
    }
};

const saveLocalUnapplyMap = (next: Record<string, string[]>) => {
    if (!canUseLocalJobMemory()) return;
    window.localStorage.setItem(LOCAL_UNAPPLY_STORAGE_KEY, JSON.stringify(next));
};

const loadLocalAppliedMap = (): Record<string, string[]> => {
    if (!canUseLocalJobMemory()) return {};

    try {
        const raw = window.localStorage.getItem(LOCAL_APPLIED_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        console.warn('Failed to read local applied jobs memory:', error);
        return {};
    }
};

const saveLocalAppliedMap = (next: Record<string, string[]>) => {
    if (!canUseLocalJobMemory()) return;
    window.localStorage.setItem(LOCAL_APPLIED_STORAGE_KEY, JSON.stringify(next));
};

const normalizeLocalJobMemoryKeys = (candidateIds: (string | null | undefined)[], email?: string | null) =>
    Array.from(new Set([
        ...candidateIds.filter(Boolean).map((value) => String(value).trim()),
        email?.trim().toLowerCase(),
    ].filter(Boolean) as string[]));

const rememberLocallyUnappliedJob = (candidateIds: (string | null | undefined)[], jobId: string, email?: string | null) => {
    const keys = normalizeLocalJobMemoryKeys(candidateIds, email);
    if (keys.length === 0 || !jobId) return;

    const memory = loadLocalUnapplyMap();
    keys.forEach((key) => {
        memory[key] = Array.from(new Set([...(memory[key] || []), jobId]));
    });
    saveLocalUnapplyMap(memory);
};

const clearLocallyUnappliedJob = (candidateIds: (string | null | undefined)[], jobId: string, email?: string | null) => {
    const keys = normalizeLocalJobMemoryKeys(candidateIds, email);
    if (keys.length === 0 || !jobId) return;

    const memory = loadLocalUnapplyMap();
    keys.forEach((key) => {
        if (!memory[key]) return;
        memory[key] = memory[key].filter((storedJobId) => storedJobId !== jobId);
        if (memory[key].length === 0) {
            delete memory[key];
        }
    });
    saveLocalUnapplyMap(memory);
};

const rememberLocallyAppliedJob = (candidateIds: (string | null | undefined)[], jobId: string, email?: string | null) => {
    const keys = normalizeLocalJobMemoryKeys(candidateIds, email);
    if (keys.length === 0 || !jobId) return;

    const memory = loadLocalAppliedMap();
    keys.forEach((key) => {
        memory[key] = Array.from(new Set([...(memory[key] || []), jobId]));
    });
    saveLocalAppliedMap(memory);
};

const clearLocallyAppliedJob = (candidateIds: (string | null | undefined)[], jobId: string, email?: string | null) => {
    const keys = normalizeLocalJobMemoryKeys(candidateIds, email);
    if (keys.length === 0 || !jobId) return;

    const memory = loadLocalAppliedMap();
    keys.forEach((key) => {
        if (!memory[key]) return;
        memory[key] = memory[key].filter((storedJobId) => storedJobId !== jobId);
        if (memory[key].length === 0) {
            delete memory[key];
        }
    });
    saveLocalAppliedMap(memory);
};

const getLocallyAppliedJobIds = (
    candidateIds: (string | null | undefined)[],
    email?: string | null
): string[] => {
    const keys = normalizeLocalJobMemoryKeys(candidateIds, email);
    if (keys.length === 0) return [];

    const memory = loadLocalAppliedMap();
    return Array.from(new Set(
        keys.flatMap((key) => memory[key] || []).filter(Boolean)
    ));
};

const filterLocallyUnappliedJobs = (
    jobs: JobProfile[],
    candidateIds: (string | null | undefined)[],
    email?: string | null
) => {
    const keys = normalizeLocalJobMemoryKeys(candidateIds, email);
    if (keys.length === 0 || jobs.length === 0) return jobs;

    const memory = loadLocalUnapplyMap();
    const locallyHiddenJobIds = new Set(
        keys.flatMap((key) => memory[key] || [])
    );

    if (locallyHiddenJobIds.size === 0) return jobs;
    return jobs.filter((job) => !locallyHiddenJobIds.has(job.id));
};

const resolveCandidateApplicationIds = async (candidateId: string): Promise<string[]> => {
    const candidateIds = new Set<string>();
    if (candidateId) candidateIds.add(candidateId);

    const candidateQueries = [
        supabase.from('candidates').select('id, user_id').eq('id', candidateId).maybeSingle(),
        supabase.from('candidates').select('id, user_id').eq('user_id', candidateId).maybeSingle(),
    ];

    for (const query of candidateQueries) {
        const { data, error } = await query;
        if (error) {
            console.warn('Could not resolve candidate application ids:', error);
            continue;
        }

        if (data?.id) candidateIds.add(data.id);
        if (data?.user_id) candidateIds.add(data.user_id);
    }

    return Array.from(candidateIds);
};

const resolveCandidateApplicationProfileId = async (email: string, candidateReferenceId?: string | null): Promise<string | null> => {
    const normalizedEmail = email.trim().toLowerCase();

    if (candidateReferenceId) {
        const { data: candidateRow, error: candidateLookupError } = await supabase
            .from('candidates')
            .select('user_id')
            .eq('id', candidateReferenceId)
            .maybeSingle();

        if (candidateLookupError) {
            console.warn('Could not resolve candidate profile id from candidate record:', candidateLookupError);
        }

        if (candidateRow?.user_id) {
            return candidateRow.user_id;
        }

        return candidateReferenceId;
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();

    if (profileError) {
        console.error("Error resolving candidate profile by email:", profileError);
        return null;
    }

    return profile?.id || null;
};

const ensureJobTechnicalTest = async (job: JobProfile): Promise<JobProfile> => {
    if (job.requires_quiz === false) {
        throw new Error('The questionnaire is currently disabled for this role.');
    }

    if (job.technical_test?.questions?.length) {
        return normalizeJobQuestionnaireState({ ...job, requires_quiz: true });
    }

    const generatedTest = await generateTechnicalTestForJob(job);
    const nextJob: JobProfile = normalizeJobQuestionnaireState({
        ...job,
        requires_quiz: true,
        technical_test: generatedTest,
    });

    const impersonation = loadAdminImpersonation();

    if (impersonation?.role === 'recruiter') {
        const { data, error } = await supabase.rpc('update_debug_entity', {
            p_type: 'job',
            p_id: nextJob.id,
            p_content: nextJob,
        });

        if (error) {
            const message = `${error.message || ''} ${error.details || ''}`.trim();
            const isMissingFunction = error.code === '42883' || message.includes('update_debug_entity');

            if (isMissingFunction) {
                throw new Error('Admin recruiter job updates require the update_debug_entity RPC. Run debug_rpc.sql in Supabase SQL Editor.');
            }

            throw error;
        }

        if ((data as any)?.status === 'error') {
            throw new Error((data as any).message || 'Admin recruiter job update failed inside update_debug_entity.');
        }

        return nextJob;
    }

    const { error } = await supabase
        .from('jobs')
        .update({
            content: nextJob,
            embedding: nextJob.embedding_vector || null,
        })
        .eq('id', nextJob.id);

    if (error) {
        throw error;
    }

    return nextJob;
};

export const updateApplicationStatus = async (
    candidateProfileId: string,
    jobId: string,
    status: string
): Promise<void> => {
    const candidateIds = await resolveCandidateApplicationIds(candidateProfileId);
    if (!candidateIds.includes(candidateProfileId)) {
        candidateIds.push(candidateProfileId);
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('set_job_application_status', {
        p_candidate_id: candidateProfileId,
        p_job_id: jobId,
        p_status: status,
    });

    if (!rpcError) {
        if (rpcData === false) {
            throw new Error('The application status update was rejected by the database policy.');
        }
        return;
    }

    const rpcMessage = `${rpcError.message || ''} ${rpcError.details || ''}`.trim();
    const isMissingRpc = rpcError.code === '42883' || rpcMessage.includes('set_job_application_status');

    if (!isMissingRpc) {
        throw rpcError;
    }

    const { data: existing, error: existingError } = await supabase
        .from('applications')
        .select('id')
        .in('candidate_id', candidateIds)
        .eq('job_id', jobId)
        .limit(1);

    if (existingError) {
        throw existingError;
    }

    if (existing && existing.length > 0) {
        const { error: updateError } = await supabase
            .from('applications')
            .update({ status })
            .in('candidate_id', candidateIds)
            .eq('job_id', jobId);

        if (updateError) {
            throw updateError;
        }

        return;
    }

    const { error: insertError } = await supabase.from('applications').insert({
        candidate_id: candidateProfileId,
        job_id: jobId,
        status,
    });

    if (insertError) {
        const insertMessage = `${insertError.message || ''} ${insertError.details || ''}`.trim().toLowerCase();
        if (insertMessage.includes('row-level security')) {
            throw new Error('Updating recruiter assessments now requires the set_job_application_status RPC. Run supabase/set_job_application_status.sql in Supabase SQL Editor.');
        }
        throw insertError;
    }
};

const getJobsForCandidateViaAdminRpc = async (candidateId: string, candidateEmail: string): Promise<JobProfile[] | null> => {
    const impersonation = loadAdminImpersonation();

    if (!impersonation || impersonation.role !== 'seeker' || impersonation.profileId !== candidateId) {
        return null;
    }

    const { data, error } = await supabase.rpc('get_admin_candidate_jobs', { p_candidate_id: candidateId });

    if (error) {
        const message = `${error.message || ''} ${error.details || ''}`.trim();
        const isMissingFunction = error.code === '42883' || message.includes('get_admin_candidate_jobs');

        if (isMissingFunction) {
            console.warn('Admin seeker jobs RPC is missing. Run supabase/get_admin_candidate_jobs.sql in Supabase SQL Editor.');
        } else {
            console.error('Admin seeker jobs RPC failed:', error);
        }
        return null;
    }

    return (((data as AdminCandidateJobRpcRow[]) || []).map((row) => {
        const job = normalizeJobQuestionnaireState(hydrateEmbedding(row.job_content as JobProfile, row.job_embedding));
        return {
            ...job,
            applicant_emails: Array.from(new Set([...(job.applicant_emails || []), candidateEmail])),
        };
    }));
};

const getCandidateJobsWithStatusViaRpc = async (
    candidateId: string,
    candidateEmail: string
): Promise<{ jobs: JobProfile[]; statuses: Record<string, string> } | null> => {
    const { data, error } = await supabase.rpc('get_candidate_jobs_with_status', { p_candidate_id: candidateId });

    if (error) {
        const message = `${error.message || ''} ${error.details || ''}`.trim();
        const isMissingFunction = error.code === '42883' || message.includes('get_candidate_jobs_with_status');

        if (isMissingFunction) {
            console.warn('Candidate jobs RPC is missing. Run supabase/get_candidate_jobs_with_status.sql in Supabase SQL Editor.');
        } else {
            console.warn('Candidate jobs RPC failed, falling back to direct reads:', error);
        }
        return null;
    }

    const rows = (data as CandidateJobStatusRpcRow[]) || [];
    const statuses = rows.reduce<Record<string, string>>((acc, row) => {
        if (row.job_id && row.application_status) {
            acc[row.job_id] = row.application_status;
        }
        return acc;
    }, {});

    const jobs = rows.map((row) => {
        const job = normalizeJobQuestionnaireState(hydrateEmbedding(row.job_content as JobProfile, row.job_embedding));
        return {
            ...job,
            applicant_emails: Array.from(new Set([...(job.applicant_emails || []), candidateEmail])),
        };
    });

    return { jobs, statuses };
};

const getApplicantsForJobViaAdminRpc = async (jobId: string): Promise<{ candidate: CandidateProfile; status: string }[] | null> => {
    const impersonation = loadAdminImpersonation();

    if (!impersonation || impersonation.role !== 'recruiter') {
        return null;
    }

    const { data, error } = await supabase.rpc('get_admin_job_applicants', { p_job_id: jobId });

    if (error) {
        const message = `${error.message || ''} ${error.details || ''}`.trim();
        const isMissingFunction = error.code === '42883' || message.includes('get_admin_job_applicants');

        if (isMissingFunction) {
            console.warn('Admin recruiter applicants RPC is missing. Run supabase/get_admin_job_applicants.sql in Supabase SQL Editor.');
        } else {
            console.error('Admin recruiter applicants RPC failed:', error);
        }
        return null;
    }

    return (((data as AdminJobApplicantRpcRow[]) || []).map((row) => ({
        candidate: hydrateEmbedding(row.candidate_content as CandidateProfile, row.candidate_embedding),
        status: row.status || 'pending',
    })));
};

const getJobsForCandidateViaImpersonatedSession = async (candidateId: string): Promise<JobProfile[] | null> => {
    const impersonation = loadAdminImpersonation();

    if (!impersonation || impersonation.role !== 'seeker' || impersonation.profileId !== candidateId) {
        return null;
    }

    return withImpersonatedSession(impersonation, async (client) => {
        const { data: applications, error: applicationsError } = await client
            .from('applications')
            .select('job_id')
            .eq('candidate_id', candidateId);

        if (applicationsError) throw applicationsError;
        if (!applications || applications.length === 0) return [];

        const jobIds = Array.from(new Set(applications.map((a) => a.job_id).filter(Boolean)));
        if (jobIds.length === 0) return [];

        const { data: jobs, error: jobsError } = await client.from('jobs').select('*').in('id', jobIds);
        if (jobsError) throw jobsError;

        return (jobs || []).map((row) => {
            const job = normalizeJobQuestionnaireState(hydrateEmbedding(row.content as JobProfile, row.embedding));
            return { ...job, applicant_emails: Array.from(new Set([...(job.applicant_emails || []), impersonation.email])) };
        });
    }).catch((err) => {
        console.warn('Could not open an isolated seeker session to read applied jobs:', err);
        return null;
    });
};

const getApplicantsForJobFromDebugData = async (
    jobId: string,
    candidateIds: string[] = [],
    applicantEmails: string[] = [],
    statusByCandidateId: Map<string, string> = new Map(),
): Promise<{ candidate: CandidateProfile; status: string }[] | null> => {
    const impersonation = loadAdminImpersonation();

    if (!impersonation || impersonation.role !== 'recruiter') {
        return null;
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('get_debug_data');
    if (rpcError) {
        console.error('Could not read debug data fallback for recruiter applicants:', rpcError);
        return null;
    }

    const debugUsers = (((rpcData as any)?.users || []) as any[]);
    const debugCandidates = (((rpcData as any)?.candidates || []) as any[]);
    const debugJobs = (((rpcData as any)?.jobs || []) as any[]);

    const jobRow = debugJobs.find((row) => row?.content?.id === jobId);
    const emailSet = new Set(
        [...applicantEmails, ...(((jobRow?.content?.applicant_emails || []) as string[]))]
            .filter(Boolean)
            .map((email) => email.toLowerCase().trim())
    );
    const profileIdSet = new Set(candidateIds.filter(Boolean));

    debugUsers.forEach((user) => {
        const email = user?.email?.toLowerCase?.().trim?.();
        if (email && emailSet.has(email)) {
            profileIdSet.add(user.id);
        }
    });

    const seen = new Set<string>();
    return debugCandidates.flatMap((row) => {
        const candidate = hydrateEmbedding(row.content as CandidateProfile, row.embedding);
        const profileId = row?.user_id as string | undefined;
        const email = candidate?.contacts?.email?.toLowerCase?.().trim?.();
        const matchesById = Boolean(profileId && profileIdSet.has(profileId));
        const matchesByEmail = Boolean(email && emailSet.has(email));

        if (!matchesById && !matchesByEmail) {
            return [];
        }

        const key = profileId || email || row?.id;
        if (!key || seen.has(key)) {
            return [];
        }

        seen.add(key);
        return [{
            candidate,
            status: (profileId && statusByCandidateId.get(profileId)) || 'pending',
        }];
    });
};

async function getRecruiterCandidateIdsFromNotifications(recruiterProfileId: string, jobId: string): Promise<string[]> {
    const notifications = await getNotifications(recruiterProfileId);

    return Array.from(new Set(
        notifications
            .filter((notification) =>
                notification.type === 'application_received' &&
                notification.metadata?.job_id === jobId &&
                Boolean(notification.metadata?.candidate_id)
            )
            .map((notification) => notification.metadata?.candidate_id as string)
    ));
}

const applyToJobViaAdminRpc = async (candidateId: string, jobId: string): Promise<boolean | null> => {
    const impersonation = loadAdminImpersonation();

    if (!impersonation || impersonation.role !== 'seeker' || impersonation.profileId !== candidateId) {
        return null;
    }

    const { data, error } = await supabase.rpc('admin_apply_to_job', {
        p_candidate_id: candidateId,
        p_job_id: jobId,
    });

    if (error) {
        const message = `${error.message || ''} ${error.details || ''}`.trim();
        const isMissingFunction = error.code === '42883' || message.includes('admin_apply_to_job');

        if (isMissingFunction) {
            console.warn('Admin seeker apply RPC is missing. Run supabase/admin_apply_to_job.sql in Supabase SQL Editor.');
        } else {
            console.error('Admin seeker apply RPC failed:', error);
        }
        return null;
    }

    return Boolean(data);
};

const unapplyFromJobViaAdminRpc = async (candidateId: string, jobId: string): Promise<boolean | null> => {
    const impersonation = loadAdminImpersonation();

    if (!impersonation || impersonation.role !== 'seeker' || impersonation.profileId !== candidateId) {
        return null;
    }

    const { data, error } = await supabase.rpc('admin_unapply_from_job', {
        p_candidate_id: candidateId,
        p_job_id: jobId,
    });

    if (error) {
        const message = `${error.message || ''} ${error.details || ''}`.trim();
        const isMissingFunction = error.code === '42883' || message.includes('admin_unapply_from_job');

        if (isMissingFunction) {
            console.warn('Admin seeker unapply RPC is missing. Run supabase/admin_unapply_from_job.sql in Supabase SQL Editor.');
        } else {
            console.error('Admin seeker unapply RPC failed:', error);
        }
        return null;
    }

    return Boolean(data);
};

const applyToJobViaImpersonatedSession = async (candidateId: string, jobId: string): Promise<boolean> => {
    const impersonation = loadAdminImpersonation();

    if (!impersonation || impersonation.role !== 'seeker' || impersonation.profileId !== candidateId) {
        return false;
    }

    return withImpersonatedSession(impersonation, async (client) => {
        const { data: existing, error: existingError } = await client
            .from('applications')
            .select('id')
            .eq('candidate_id', candidateId)
            .eq('job_id', jobId)
            .maybeSingle();

        if (existingError) throw existingError;

        if (!existing) {
            const { error: insertError } = await client.from('applications').insert({
                job_id: jobId,
                candidate_id: candidateId,
                status: 'pending',
            });
            if (insertError) throw insertError;
        }

        return true;
    });
};

const unapplyFromJobViaImpersonatedSession = async (candidateId: string, jobId: string): Promise<boolean> => {
    const impersonation = loadAdminImpersonation();

    if (!impersonation || impersonation.role !== 'seeker' || impersonation.profileId !== candidateId) {
        return false;
    }

    return withImpersonatedSession(impersonation, async (client) => {
        const candidateIds = await resolveCandidateApplicationIds(candidateId);
        const { error } = await client
            .from('applications')
            .delete()
            .in('candidate_id', candidateIds)
            .eq('job_id', jobId);
        if (error) throw error;
        return true;
    });
};

const saveCandidateViaAdminConsoleRpc = async (candidate: CandidateProfile): Promise<boolean> => {
    const impersonation = loadAdminImpersonation();

    if (!impersonation || impersonation.role !== 'seeker') {
        return false;
    }

    const normalizedCandidate = normalizeCandidateProfileNames(candidate);
    const fullName = buildNormalizedFullName(
        normalizedCandidate.personal_info?.first_name,
        normalizedCandidate.personal_info?.last_name
    );

    const { error: profileError } = await supabase.from('profiles').upsert({
        id: impersonation.profileId,
        email: normalizedCandidate.contacts.email,
        role: 'seeker',
        full_name: fullName || null,
    });

    if (profileError) {
        console.warn('Admin seeker save could not update profiles directly, continuing with candidate content save:', profileError);
    }

    const { data, error } = await supabase.rpc('update_debug_entity', {
        p_type: 'candidate',
        p_id: normalizedCandidate.id,
        p_content: normalizedCandidate,
    });

    if (error) {
        const message = `${error.message || ''} ${error.details || ''}`.trim();
        const isMissingFunction = error.code === '42883' || message.includes('update_debug_entity');

        if (isMissingFunction) {
            console.warn('Admin seeker save RPC is missing. Run debug_rpc.sql in Supabase SQL Editor to enable direct admin saves.');
            return false;
        }

        throw error;
    }

    if ((data as any)?.status === 'error') {
        throw new Error((data as any).message || 'Admin seeker save failed inside update_debug_entity.');
    }

    return true;
};

const saveCandidateViaImpersonatedSession = async (candidate: CandidateProfile): Promise<boolean> => {
    const impersonation = loadAdminImpersonation();

    if (!impersonation || impersonation.role !== 'seeker') {
        return false;
    }

    return withImpersonatedSession(impersonation, async (client) => {
        const normalizedCandidate = normalizeCandidateProfileNames(candidate);
        const fullName = buildNormalizedFullName(
            normalizedCandidate.personal_info?.first_name,
            normalizedCandidate.personal_info?.last_name
        );

        const { error: profileError } = await client.from('profiles').upsert({
            id: impersonation.profileId,
            email: normalizedCandidate.contacts.email,
            role: 'seeker',
            full_name: fullName || null,
        });
        if (profileError) throw profileError;

        const { error } = await client.from('candidates').upsert({
            id: normalizedCandidate.id,
            user_id: impersonation.profileId,
            content: normalizedCandidate,
            embedding: normalizedCandidate.embedding_vector,
        });
        if (error) throw error;

        return true;
    });
};

// --- Users (Auth) ---
const generateUUID = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// Note: Most user management is handled by Supabase Auth (supabase.auth).
// These wrappers are kept for compatibility but should be used carefully.

export const initDB = async (): Promise<any> => {
    // No-op for Supabase, but kept for signature compatibility if needed
    return Promise.resolve();
};

// Deprecated: User management is now handled by Supabase Auth.
// Using this to mock the old behavior locally is not recommended.
export const addUser = async (user: User): Promise<any> => {
    console.warn("addUser is deprecated. Use supabase.auth.signUp instead.");
    return Promise.resolve();
};

export const getUser = async (email: string): Promise<User | undefined> => {
    // This function was used to check existence/password.
    // In Supabase, we can't query users table directly from client safely for this.
    // We'll return undefined to force using the proper auth flow.
    // Or we can check public.profiles
    const { data } = await supabase.from('profiles').select('*').eq('email', email).single();
    if (data) {
        // Return a mock User object compatible with types
        return {
            email: data.email,
            password: '', // Cannot retrieve
            role: data.role as User['role'],
            profileId: data.id,
            fullName: data.full_name || undefined,
        };
    }
    return undefined;
};

export const getAllUsers = async (): Promise<User[]> => {
    const { data } = await supabase.from('profiles').select('*');
    return data?.map(p => ({
        email: p.email,
        role: p.role as any,
        profileId: p.id,
        fullName: p.full_name || undefined,
        password: '' // Not accessible
    })) || [];
};

export const deleteUser = async (email: string): Promise<void> => {
    // Client cannot delete users from auth.users easily without admin function.
    // We can delete the profile, which cascades.
    // First find profile
    const { data } = await supabase.from('profiles').select('id').eq('email', email).single();
    if (data) {
        await supabase.from('profiles').delete().eq('id', data.id);
        // Note: This leaves the auth user orphan if cascading isn't set up heavily, 
        // but typically we rely on Supabase Admin for user deletion.
    }
};

// --- Candidates ---

export const addCandidate = async (candidate: CandidateProfile): Promise<CandidateProfile> => {
    const normalizedCandidate = normalizeCandidateProfileNames(candidate);
    const localizedCandidate = await ensureLocalizedCandidateContent(normalizedCandidate);
    const enriched = await attachEmbeddingMetadata({
        ...localizedCandidate,
        terms_and_conditions_accepted: localizedCandidate.terms_and_conditions_accepted ?? true,
    }, 'candidate');
    const actor = await resolveEffectiveActor();
    const normalizedEnriched = normalizeCandidateProfileNames(enriched);
    const fullName = buildNormalizedFullName(
        normalizedEnriched.personal_info?.first_name,
        normalizedEnriched.personal_info?.last_name
    );

    const savedViaAdminConsole = await saveCandidateViaAdminConsoleRpc(normalizedEnriched);
    if (savedViaAdminConsole) {
        return normalizedEnriched;
    }

    const savedViaImpersonation = await saveCandidateViaImpersonatedSession(normalizedEnriched);
    if (!savedViaImpersonation) {
        const { error: profileError } = await supabase.from('profiles').upsert({
            id: actor.profileId,
            email: normalizedEnriched.contacts.email,
            role: 'seeker',
            full_name: fullName || null,
        });
        if (profileError) throw profileError;

        const { error } = await supabase.from('candidates').upsert({
            id: candidate.id,
            user_id: actor.profileId,
            content: normalizedEnriched,
            embedding: normalizedEnriched.embedding_vector // Store vector separately for pgvector
        });
        if (error) throw error;
    }

    void logActivity({
        eventType: 'candidate_profile_saved',
        source: 'dbService',
        purpose: 'candidate_profile_save',
        entityType: 'candidate',
        entityId: normalizedEnriched.id,
        entityLabel: fullName || normalizedEnriched.contacts.email || normalizedEnriched.id,
        summary: `Saved candidate profile for ${fullName || normalizedEnriched.contacts.email || 'candidate'}.`,
        metadata: {
            email: normalizedEnriched.contacts.email || null,
            current_job_function: normalizedEnriched.current_job_function || null,
            current_seniority_level: normalizedEnriched.current_seniority_level || null,
        },
    });

    return normalizedEnriched;
};

export const createNewUserAndCandidateProfile = async (user: User, candidate: CandidateProfile): Promise<void> => {
    if (user.role !== 'seeker') {
        throw new Error("createNewUserAndCandidateProfile can only be used for seeker accounts.");
    }

    // This is now handled in the Component via signUp + profile creation.
    // If called, we assume auth is already done or we are doing data only.
    // We will just create the data parts.

    // 1. Create Profile (if not exists)
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Must be logged in to create profile");

    const normalizedCandidate = normalizeCandidateProfileNames(candidate);
    // Profile is auto-created by trigger? Or manual? 
    // We'll insert manual for now as we didn't add a trigger in SQL.
    const { error: profileError } = await supabase.from('profiles').upsert({
        id: userData.user.id,
        email: user.email,
        role: user.role,
        full_name: buildNormalizedFullName(normalizedCandidate.personal_info.first_name, normalizedCandidate.personal_info.last_name)
    });

    if (profileError) throw profileError;

    // 2. Create Candidate
    // Link candidate.id to profile? Or just use same ID?
    // Schema: candidates.user_id -> profiles.id
    await addCandidate({
        ...normalizedCandidate,
        id: candidate.id // Keep generated ID
    });
}

export const getCandidate = async (id: string): Promise<CandidateProfile | undefined> => {
    // Try fetching by ID first
    let query = supabase.from('candidates').select('*').eq('id', id);
    let { data, error } = await query;

    if (!data || data.length === 0) {
        // Fallback: try fetching by user_id (if id passed was actually a profile id)
        const { data: byUser } = await supabase.from('candidates').select('*').eq('user_id', id);
        if (byUser && byUser.length > 0) {
            data = byUser;
        }
    }

    if (data && data[0]) {
        return normalizeCandidateProfileNames(hydrateEmbedding(data[0].content as CandidateProfile, data[0].embedding));
    }

    if (loadAdminImpersonation()) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_debug_data');
        if (!rpcError) {
            const match = (((rpcData as any)?.candidates || []) as any[]).find((row) => row?.content?.id === id || row?.user_id === id);
            if (match?.content) {
                return normalizeCandidateProfileNames(match.content as CandidateProfile);
            }
        }
    }

    return undefined;
};

export const getAllCandidates = async (): Promise<CandidateProfile[]> => {
    const { data, error } = await supabase.from('candidates').select('*');
    if (!error && data && data.length > 0) {
        return data.map(d => normalizeCandidateProfileNames(hydrateEmbedding(d.content as CandidateProfile, d.embedding)));
    }

    if (loadAdminImpersonation()) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_debug_data');
        if (!rpcError) {
            return (((rpcData as any)?.candidates || []) as any[]).map((row) =>
                normalizeCandidateProfileNames(hydrateEmbedding(row.content as CandidateProfile, row.embedding))
            );
        }
    }

    if (error) throw error;
    return [];
};

export const deleteCandidate = async (id: string): Promise<void> => {
    const { error } = await supabase.from('candidates').delete().eq('id', id);
    if (error) throw error;
};

// --- Jobs ---

const loadRecruiterBrandingForJob = async (recruiterId?: string | null): Promise<RecruiterProfile | null> => {
    if (!recruiterId) return null;

    const { data: recruiterRow, error: recruiterError } = await supabase
        .from('recruiters')
        .select('content')
        .eq('id', recruiterId)
        .maybeSingle();

    if (!recruiterError && recruiterRow?.content) {
        return normalizeRecruiterProfile(recruiterRow.content as RecruiterProfile);
    }

    if (recruiterError) {
        console.warn('Could not read recruiter branding before saving job:', recruiterError);
    }

    if (loadAdminImpersonation()) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_debug_data');
        if (!rpcError) {
            const match = (((rpcData as any)?.recruiters || []) as any[]).find(
                (row) => row?.id === recruiterId || row?.content?.id === recruiterId
            );
            if (match?.content) {
                return normalizeRecruiterProfile(match.content as RecruiterProfile);
            }
        } else {
            console.warn('Could not read recruiter branding via debug RPC before saving job:', rpcError);
        }
    }

    return null;
};

const applyRecruiterBrandingToJob = (
    job: JobProfile,
    recruiterId?: string | null,
    recruiterBranding?: RecruiterProfile | null
): JobProfile => ({
    ...job,
    recruiter_id: recruiterId || job.recruiter_id || null,
    company_name: recruiterBranding?.company_name || job.company_name,
    visible_to_seekers: recruiterBranding?.company_visibility ?? job.visible_to_seekers ?? true,
    company_logo_url: recruiterBranding?.company_logo_url || job.company_logo_url,
    company_logo_path: recruiterBranding?.company_logo_path || job.company_logo_path,
});

export const addJob = async (job: JobProfile): Promise<any> => {
    // Force a valid UUID if the ID is missing or in the old 'job_XXXX' format
    if (!job.id || job.id.startsWith('job_')) {
        job.id = generateUUID();
    }

    const actor = await resolveEffectiveActor();
    const recruiterBranding = await loadRecruiterBrandingForJob(actor.profileId || job.recruiter_id || null);

    const normalizedJob = normalizeJobQuestionnaireState(applyRecruiterBrandingToJob(job, actor.profileId, recruiterBranding));
    const enriched = await attachEmbeddingMetadata({
        ...normalizedJob,
    }, 'job');

    const jobRow = {
        id: job.id,
        recruiter_id: actor.profileId, // Owner
        content: enriched,
        embedding: enriched.embedding_vector
    };

    const { error: insertError } = await supabase.from('jobs').insert(jobRow);

    if (!insertError) {
        if (actor.profileId && recruiterBranding) {
            await syncRecruiterBrandingAcrossJobs(actor.profileId, recruiterBranding);
        }
        void logActivity({
            eventType: 'job_created',
            source: 'dbService',
            purpose: 'job_posting_create',
            entityType: 'job',
            entityId: job.id,
            entityLabel: enriched.title || job.id,
            summary: `Created job posting "${enriched.title || 'Untitled posting'}".`,
            metadata: {
                company_name: enriched.company_name || null,
                recruiter_id: actor.profileId,
                seniority_level: enriched.seniority_level || null,
            },
        });
        return job.id;
    }

    const insertMessage = `${insertError.message || ''} ${insertError.details || ''}`.trim().toLowerCase();
    const isDuplicateInsert =
        insertError.code === '23505' ||
        insertMessage.includes('duplicate key') ||
        insertMessage.includes('already exists');

    if (!isDuplicateInsert) {
        if (insertMessage.includes('row-level security')) {
            throw new Error('Creating recruiter job postings requires the jobs RLS policies. Run supabase/recruiter_job_policies.sql in Supabase SQL Editor.');
        }
        throw insertError;
    }

    const { error: updateError } = await supabase
        .from('jobs')
        .update({
            recruiter_id: actor.profileId,
            content: enriched,
            embedding: enriched.embedding_vector,
        })
        .eq('id', job.id);

    if (updateError) {
        const updateMessage = `${updateError.message || ''} ${updateError.details || ''}`.trim().toLowerCase();
        if (updateMessage.includes('row-level security')) {
            throw new Error('Updating recruiter job postings requires the jobs RLS policies. Run supabase/recruiter_job_policies.sql in Supabase SQL Editor.');
        }
        throw updateError;
    }

    if (actor.profileId && recruiterBranding) {
        await syncRecruiterBrandingAcrossJobs(actor.profileId, recruiterBranding);
    }
    void logActivity({
        eventType: 'job_updated',
        source: 'dbService',
        purpose: 'job_posting_update',
        entityType: 'job',
        entityId: job.id,
        entityLabel: enriched.title || job.id,
        summary: `Updated job posting "${enriched.title || 'Untitled posting'}".`,
        metadata: {
            company_name: enriched.company_name || null,
            recruiter_id: actor.profileId,
            seniority_level: enriched.seniority_level || null,
        },
    });
    return job.id;
};

export const saveJobTechnicalTest = async (job: JobProfile, test: TechnicalTest): Promise<void> => {
    const updatedJob: JobProfile = normalizeJobQuestionnaireState({ ...job, technical_test: test, requires_quiz: true });
    const { error } = await supabase
        .from('jobs')
        .update({ content: updatedJob })
        .eq('id', job.id);
    if (error) throw error;

    void logActivity({
        eventType: 'job_updated',
        source: 'dbService',
        purpose: 'job_technical_test_save',
        entityType: 'job',
        entityId: job.id,
        entityLabel: job.title || job.id,
        summary: `Saved technical questionnaire for "${job.title || 'Untitled posting'}".`,
        metadata: {
            question_count: test.questions?.length || 0,
        },
    });
};

export const saveScoreOverride = async (
    job: JobProfile,
    candidateId: string,
    score: number,
    previousScore: number,
    reason: string
): Promise<JobProfile> => {
    const updatedJob: JobProfile = {
        ...job,
        score_overrides: {
            ...(job.score_overrides ?? {}),
            [candidateId]: { score, previous_score: previousScore, reason, overridden_at: new Date().toISOString() },
        },
    };
    const { error } = await supabase.from('jobs').update({ content: updatedJob }).eq('id', job.id);
    if (error) throw error;
    return updatedJob;
};

export const removeScoreOverride = async (job: JobProfile, candidateId: string): Promise<JobProfile> => {
    const overrides = { ...(job.score_overrides ?? {}) };
    delete overrides[candidateId];
    const updatedJob: JobProfile = { ...job, score_overrides: overrides };
    const { error } = await supabase.from('jobs').update({ content: updatedJob }).eq('id', job.id);
    if (error) throw error;
    return updatedJob;
};

export const saveJobRankingWeights = async (
    job: JobProfile,
    rankingWeights: MatchingPillarWeights
): Promise<JobProfile> => {
    const updatedJob: JobProfile = {
        ...job,
        ranking_weights: rankingWeights,
    };
    const { error } = await supabase.from('jobs').update({ content: updatedJob }).eq('id', job.id);
    if (error) throw error;

    void logActivity({
        eventType: 'job_updated',
        source: 'dbService',
        purpose: 'job_ranking_weights_update',
        entityType: 'job',
        entityId: job.id,
        entityLabel: updatedJob.title || job.id,
        summary: `Updated ranking weights for "${updatedJob.title || 'Untitled posting'}".`,
        metadata: {
            ranking_weights: rankingWeights,
        },
    });

    return updatedJob;
};

export interface SaveJobRankingConfigInput {
    weights: MatchingPillarWeights;
    universities: PrestigeListOverride | null;
    companies: PrestigeListOverride | null;
}

export const saveJobRankingConfig = async (
    job: JobProfile,
    config: SaveJobRankingConfigInput,
): Promise<JobProfile> => {
    const updatedJob: JobProfile = {
        ...job,
        ranking_weights: config.weights,
        ranking_universities: config.universities,
        ranking_companies: config.companies,
    };
    const { error } = await supabase.from('jobs').update({ content: updatedJob }).eq('id', job.id);
    if (error) throw error;

    void logActivity({
        eventType: 'job_updated',
        source: 'dbService',
        purpose: 'job_ranking_config_update',
        entityType: 'job',
        entityId: job.id,
        entityLabel: updatedJob.title || job.id,
        summary: `Updated ranking config for "${updatedJob.title || 'Untitled posting'}".`,
        metadata: {
            ranking_weights: config.weights,
            ranking_universities_custom: !!config.universities,
            ranking_companies_custom: !!config.companies,
        },
    });

    return updatedJob;
};

export const saveRecruiterRankingConfig = async (
    recruiterId: string,
    config: SaveJobRankingConfigInput,
): Promise<RecruiterProfile> => {
    const recruiter = await getRecruiter(recruiterId);
    if (!recruiter) {
        throw new Error('The recruiter profile could not be resolved for ranking preferences.');
    }

    const updatedRecruiter = normalizeRecruiterProfile({
        ...recruiter,
        ranking_weights: config.weights,
        ranking_universities: config.universities,
        ranking_companies: config.companies,
    });

    const savedViaAdminRpc = await saveRecruiterViaAdminConsoleRpc(recruiterId, updatedRecruiter);

    if (!savedViaAdminRpc) {
        const { error } = await supabase.from('recruiters').upsert({
            id: recruiterId,
            content: updatedRecruiter,
        });
        if (error) throw error;
    }

    void logActivity({
        eventType: 'recruiter_profile_saved',
        source: 'dbService',
        purpose: 'recruiter_ranking_config_update',
        entityType: 'recruiter',
        entityId: recruiterId,
        entityLabel: updatedRecruiter.company_name || `${updatedRecruiter.first_name} ${updatedRecruiter.last_name}`.trim() || recruiterId,
        summary: `Updated recruiter ranking preferences for ${updatedRecruiter.company_name || updatedRecruiter.email || 'recruiter'}.`,
        metadata: {
            ranking_weights: config.weights,
            ranking_universities_custom: !!config.universities,
            ranking_companies_custom: !!config.companies,
        },
    });

    return updatedRecruiter;
};

export const saveCandidateInterestReview = async (
    job: JobProfile,
    candidateId: string,
    decision: 'interested' | 'not_interested'
): Promise<JobProfile> => {
    const updatedJob: JobProfile = {
        ...job,
        candidate_interest_reviews: {
            ...(job.candidate_interest_reviews ?? {}),
            [candidateId]: {
                decision,
                updated_at: new Date().toISOString(),
            },
        },
    };

    const { error } = await supabase.from('jobs').update({ content: updatedJob }).eq('id', job.id);
    if (error) throw error;

    void logActivity({
        eventType: 'job_updated',
        source: 'dbService',
        purpose: decision === 'interested' ? 'candidate_marked_interested' : 'candidate_marked_not_interested',
        entityType: 'job',
        entityId: job.id,
        entityLabel: updatedJob.title || job.id,
        summary: `${decision === 'interested' ? 'Marked candidate as interested' : 'Marked candidate as not interested'} for "${updatedJob.title || 'Untitled posting'}".`,
        metadata: {
            candidate_id: candidateId,
            decision,
        },
    });

    return updatedJob;
};

export const saveCandidateNote = async (
    job: JobProfile,
    candidateId: string,
    payload: { tags: string[]; note: string },
): Promise<JobProfile> => {
    const trimmedTags = (payload.tags || []).map(t => t.trim()).filter(Boolean);
    const trimmedNote = (payload.note || '').trim();

    const updatedNotes = { ...(job.candidate_notes ?? {}) };
    if (trimmedTags.length === 0 && trimmedNote.length === 0) {
        delete updatedNotes[candidateId];
    } else {
        updatedNotes[candidateId] = {
            tags: trimmedTags,
            note: trimmedNote,
            updated_at: new Date().toISOString(),
        };
    }

    const updatedJob: JobProfile = {
        ...job,
        candidate_notes: updatedNotes,
    };

    const { error } = await supabase.from('jobs').update({ content: updatedJob }).eq('id', job.id);
    if (error) throw error;

    void logActivity({
        eventType: 'job_updated',
        source: 'dbService',
        purpose: 'candidate_note_saved',
        entityType: 'job',
        entityId: job.id,
        entityLabel: updatedJob.title || job.id,
        summary: `Saved private notes for a candidate on "${updatedJob.title || 'Untitled posting'}".`,
        metadata: {
            candidate_id: candidateId,
            tag_count: trimmedTags.length,
            note_length: trimmedNote.length,
        },
    });

    return updatedJob;
};

export const removeCandidateInterestReview = async (
    job: JobProfile,
    candidateId: string,
): Promise<JobProfile> => {
    const updatedReviews = { ...(job.candidate_interest_reviews ?? {}) };
    delete updatedReviews[candidateId];

    const updatedJob: JobProfile = {
        ...job,
        candidate_interest_reviews: updatedReviews,
    };

    const { error } = await supabase.from('jobs').update({ content: updatedJob }).eq('id', job.id);
    if (error) throw error;

    void logActivity({
        eventType: 'job_updated',
        source: 'dbService',
        purpose: 'candidate_interest_review_removed',
        entityType: 'job',
        entityId: job.id,
        entityLabel: updatedJob.title || job.id,
        summary: `Removed candidate review for "${updatedJob.title || 'Untitled posting'}".`,
        metadata: {
            candidate_id: candidateId,
        },
    });

    return updatedJob;
};

const notifyRejectedApplicantsForArchivedJob = async (job: JobProfile): Promise<void> => {
    try {
        const applicants = await getApplicantsForJob(job.id, job.applicant_emails || []);
        const hiredCandidateId = job.hired_candidate_id || null;
        const rejectedApplicants = applicants.filter(({ candidate }) => candidate.id !== hiredCandidateId);
        await Promise.all(rejectedApplicants.map(({ candidate }) => createNotification({
            user_id: candidate.id,
            type: 'info',
            title: 'Selezione conclusa',
            message: `Il processo di selezione per "${job.title}" si e concluso. Non sei stato selezionato per questa posizione.`,
            metadata: {
                job_id: job.id,
                candidate_id: candidate.id,
            },
        })));
    } catch (error) {
        console.warn(`Could not notify rejected applicants for archived job ${job.id}:`, error);
    }
};

export const archiveRecruiterJobPosting = async (job: JobProfile, hiredCandidateId?: string | null): Promise<JobProfile> => {
    const actor = await resolveEffectiveActor();
    const normalizedHiredCandidateId = hiredCandidateId || job.hired_candidate_id || null;
    const updatedJob: JobProfile = {
        ...job,
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_reason: 'hiring_completed',
        archived_by: actor.profileId || null,
        hired_candidate_id: normalizedHiredCandidateId,
        hired_candidate_selected_at: normalizedHiredCandidateId ? new Date().toISOString() : null,
        visible_to_seekers: false,
    };

    const { error } = await supabase.from('jobs').update({ content: updatedJob }).eq('id', job.id);
    if (error) throw error;

    void notifyRejectedApplicantsForArchivedJob(updatedJob);
    void logActivity({
        eventType: 'job_updated',
        source: 'dbService',
        purpose: 'job_archived_hiring_completed',
        entityType: 'job',
        entityId: job.id,
        entityLabel: updatedJob.title || job.id,
        summary: `Archived job posting "${updatedJob.title || 'Untitled posting'}" as hiring completed.`,
        metadata: {
            recruiter_id: updatedJob.recruiter_id || actor.profileId || null,
            archived_reason: updatedJob.archived_reason,
            hired_candidate_id: updatedJob.hired_candidate_id || null,
        },
    });

    return updatedJob;
};

export const saveJobHiredCandidate = async (job: JobProfile, candidateId: string | null): Promise<JobProfile> => {
    const updatedJob: JobProfile = {
        ...job,
        hired_candidate_id: candidateId,
        hired_candidate_selected_at: candidateId ? new Date().toISOString() : null,
    };

    const { error } = await supabase.from('jobs').update({ content: updatedJob }).eq('id', job.id);
    if (error) throw error;

    void logActivity({
        eventType: 'job_updated',
        source: 'dbService',
        purpose: candidateId ? 'job_hired_candidate_selected' : 'job_hired_candidate_cleared',
        entityType: 'job',
        entityId: job.id,
        entityLabel: updatedJob.title || job.id,
        summary: candidateId
            ? `Selected hired candidate for "${updatedJob.title || 'Untitled posting'}".`
            : `Cleared hired candidate for "${updatedJob.title || 'Untitled posting'}".`,
        metadata: {
            recruiter_id: updatedJob.recruiter_id || null,
            candidate_id: candidateId,
        },
    });

    return updatedJob;
};

export const restoreRecruiterJobPosting = async (job: JobProfile): Promise<JobProfile> => {
    const { archived_at: _archivedAt, archived_reason: _archivedReason, archived_by: _archivedBy, ...activeJob } = job;
    const updatedJob: JobProfile = {
        ...activeJob,
        is_archived: false,
        visible_to_seekers: true,
    };

    const { error } = await supabase.from('jobs').update({ content: updatedJob }).eq('id', job.id);
    if (error) throw error;

    void logActivity({
        eventType: 'job_updated',
        source: 'dbService',
        purpose: 'job_restored_from_archive',
        entityType: 'job',
        entityId: job.id,
        entityLabel: updatedJob.title || job.id,
        summary: `Restored job posting "${updatedJob.title || 'Untitled posting'}" from archive.`,
        metadata: {
            recruiter_id: updatedJob.recruiter_id || null,
        },
    });

    return updatedJob;
};

export const getAllJobs = async (): Promise<JobProfile[]> => {
    const { data, error } = await supabase.from('jobs').select('*');
    if (!error && data && data.length > 0) {
        const jobs = data.map(d => normalizeJobQuestionnaireState(hydrateEmbedding(d.content as JobProfile, d.embedding)));
        return filterJobsForCurrentViewer(await enrichJobsWithApplicantEmails(jobs));
    }

    if (loadAdminImpersonation()) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_debug_data');
        if (!rpcError) {
            return filterJobsForCurrentViewer((((rpcData as any)?.jobs || []) as any[]).map((row) => normalizeJobQuestionnaireState(row.content as JobProfile)));
        }
    }

    if (error) throw error;
    return [];
};

export const getJobById = async (jobId: string): Promise<JobProfile | undefined> => {
    const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
    if (!error && data) {
        const [job] = await enrichJobsWithApplicantEmails([normalizeJobQuestionnaireState(hydrateEmbedding(data.content as JobProfile, data.embedding))]);
        const [visibleJob] = await filterJobsForCurrentViewer([job]);
        return visibleJob;
    }

    if (error) {
        console.error("Error fetching job by id:", error);
    }

    if (loadAdminImpersonation()) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_debug_data');
        if (!rpcError) {
            const match = (((rpcData as any)?.jobs || []) as any[]).find((row) => row?.content?.id === jobId);
            if (match?.content) {
                const [visibleJob] = await filterJobsForCurrentViewer([normalizeJobQuestionnaireState(match.content as JobProfile)]);
                return visibleJob;
            }
        }
    }

    return undefined;
};

export const getJobsForRecruiter = async (recruiterId: string): Promise<JobProfile[]> => {
    const { data, error } = await supabase.from('jobs').select('*').eq('recruiter_id', recruiterId);
    if (!error && data && data.length > 0) {
        const jobs = data.map((d: any) => normalizeJobQuestionnaireState(hydrateEmbedding(d.content as JobProfile, d.embedding)));
        return enrichJobsWithApplicantEmails(jobs);
    }

    if (loadAdminImpersonation()) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_debug_data');
        if (!rpcError) {
            const rows = (((rpcData as any)?.jobs || []) as any[]).filter((row) => row.recruiter_id === recruiterId);
            return rows.map((row) => normalizeJobQuestionnaireState(row.content as JobProfile));
        }
    }

    if (error) throw error;
    return [];
};

export const getJobsForCandidate = async (email: string, candidateProfileId?: string): Promise<JobProfile[]> => {
    // SECURITY FIX: Replaced expensive client-side filtering of sensitive field with server-side query on 'applications' table.
    // Note: This requires the 'applications' table to be created as per ROADMAP.md

    const normalizedEmail = email.trim().toLowerCase();
    const impersonation = loadAdminImpersonation();

    let profileId = await resolveCandidateApplicationProfileId(normalizedEmail, candidateProfileId || null);

    if (!profileId && impersonation?.role === 'seeker' && impersonation.email.toLowerCase() === normalizedEmail) {
        profileId = impersonation.profileId;
    }

    const applyLocalFilter = (jobs: JobProfile[]) =>
        filterLocallyUnappliedJobs(jobs, [candidateProfileId || null, profileId || null], normalizedEmail);
    const applySeekerVisibilityFilter = (jobs: JobProfile[]) => jobs.filter(isJobVisibleToSeekers);
    const mergeWithLocalAppliedJobs = async (jobs: JobProfile[]) => {
        const localAppliedJobIds = getLocallyAppliedJobIds([candidateProfileId || null, profileId || null], normalizedEmail);
        if (localAppliedJobIds.length === 0) {
            return jobs;
        }

        const existingJobIds = new Set(jobs.map((job) => job.id));
        const missingJobIds = localAppliedJobIds.filter((jobId) => !existingJobIds.has(jobId));
        if (missingJobIds.length === 0) {
            return jobs;
        }

        const allJobs = await getAllJobs();
        const missingJobs = allJobs
            .filter((job) => missingJobIds.includes(job.id))
            .map((job) => ({
                ...job,
                applicant_emails: Array.from(new Set([...(job.applicant_emails || []), normalizedEmail])),
            }));

        return [...jobs, ...missingJobs];
    };

    if (impersonation?.role === 'seeker' && profileId === impersonation.profileId) {
        const adminJobs = await getJobsForCandidateViaAdminRpc(profileId, normalizedEmail);
        if (adminJobs) {
            return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs(adminJobs)));
        }
    }

    if (!profileId) {
        if (impersonation) {
            const isolatedJobs = normalizedEmail === impersonation.email.toLowerCase()
                ? await getJobsForCandidateViaImpersonatedSession(impersonation.profileId)
                : null;
            if (isolatedJobs) {
                return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs(isolatedJobs)));
            }
            const allJobs = await getAllJobs();
            return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs(allJobs.filter((job) => job.applicant_emails?.some((entry) => entry.toLowerCase() === normalizedEmail)))));
        }
        return [];
    }

    const rpcCandidateJobs = await getCandidateJobsWithStatusViaRpc(profileId, normalizedEmail);
    if (rpcCandidateJobs) {
        return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs(rpcCandidateJobs.jobs)));
    }

    const candidateIds = await resolveCandidateApplicationIds(profileId);
    if (candidateProfileId) {
        candidateIds.push(...await resolveCandidateApplicationIds(candidateProfileId));
    }
    if (!candidateIds.includes(profileId)) {
        candidateIds.push(profileId);
    }
    const uniqueCandidateIds = Array.from(new Set(candidateIds.filter(Boolean)));

    // Fetch *only* the applications for this user
    const { data: applications, error } = await supabase
        .from('applications')
        .select('job_id')
        .in('candidate_id', uniqueCandidateIds);

    if (error) {
        console.error("Error fetching applications:", error);
        if (impersonation) {
            const isolatedJobs = await getJobsForCandidateViaImpersonatedSession(profileId);
            if (isolatedJobs) {
                return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs(isolatedJobs)));
            }
            const allJobs = await getAllJobs();
            return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs(allJobs.filter((job) => job.applicant_emails?.some((entry) => entry.toLowerCase() === normalizedEmail)))));
        }
        return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs([])));
    }

    if (!applications || applications.length === 0) {
        if (impersonation) {
            const isolatedJobs = await getJobsForCandidateViaImpersonatedSession(profileId);
            if (isolatedJobs) {
                return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs(isolatedJobs)));
            }
            const allJobs = await getAllJobs();
            return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs(allJobs.filter((job) => job.applicant_emails?.some((entry) => entry.toLowerCase() === normalizedEmail)))));
        }
        return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs([])));
    }

    const jobIds = applications.map(app => app.job_id);

    // Now fetch the actual job details for these IDs
    // Optimization: We could use .in('id', jobIds) but we want the full hydrated objects 
    // and getAllJobs handles local hydration/casting if needed.
    // For now, let's just fetch the specific jobs to be efficient.
    const { data: jobs, error: jobsError } = await supabase.from('jobs').select('*').in('id', jobIds);

    if (jobsError) {
        console.error("Error fetching applied jobs:", jobsError);
        if (impersonation) {
            const isolatedJobs = await getJobsForCandidateViaImpersonatedSession(profileId);
            if (isolatedJobs) {
                return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs(isolatedJobs)));
            }
        }
    }

    if (!jobs || jobs.length === 0) {
        if (impersonation) {
            const isolatedJobs = await getJobsForCandidateViaImpersonatedSession(profileId);
            if (isolatedJobs) {
                return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs(isolatedJobs)));
            }
        }
        const allJobs = await getAllJobs();
        return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs(allJobs.filter((job) => jobIds.includes(job.id) || job.applicant_emails?.some((entry) => entry.toLowerCase() === normalizedEmail)))));
    }

    const hydratedJobs = jobs.map(d => normalizeJobQuestionnaireState(hydrateEmbedding(d.content as JobProfile, d.embedding)));
    return applyLocalFilter(applySeekerVisibilityFilter(await mergeWithLocalAppliedJobs(await enrichJobsWithApplicantEmails(hydratedJobs))));
};

export const getCandidateAssessmentStatuses = async (
    email: string,
    candidateProfileId?: string
): Promise<Record<string, string>> => {
    const normalizedEmail = email.trim().toLowerCase();
    const impersonation = loadAdminImpersonation();

    let profileId = await resolveCandidateApplicationProfileId(normalizedEmail, candidateProfileId || null);

    if (!profileId && impersonation?.role === 'seeker' && impersonation.email.toLowerCase() === normalizedEmail) {
        profileId = impersonation.profileId;
    }

    if (!profileId) {
        return {};
    }

    const rpcCandidateJobs = await getCandidateJobsWithStatusViaRpc(profileId, normalizedEmail);
    if (rpcCandidateJobs) {
        return Object.entries(rpcCandidateJobs.statuses).reduce<Record<string, string>>((acc, [jobId, status]) => {
            if (status === 'assessment_requested' || status === 'assessment_completed') {
                acc[jobId] = status;
            }
            return acc;
        }, {});
    }

    const candidateIds = await resolveCandidateApplicationIds(profileId);
    if (candidateProfileId) {
        candidateIds.push(...await resolveCandidateApplicationIds(candidateProfileId));
    }
    if (!candidateIds.includes(profileId)) {
        candidateIds.push(profileId);
    }

    const uniqueCandidateIds = Array.from(new Set(candidateIds.filter(Boolean)));

    const mergeStatuses = (rows: { job_id: string; status: string | null }[]) => {
        const priority = (value: string | null | undefined) => {
            if (value === 'assessment_completed') return 2;
            if (value === 'assessment_requested') return 1;
            return 0;
        };

        return rows.reduce<Record<string, string>>((acc, row) => {
            if (!row.job_id || !row.status || priority(row.status) === 0) {
                return acc;
            }

            const current = acc[row.job_id];
            if (!current || priority(row.status) >= priority(current)) {
                acc[row.job_id] = row.status;
            }
            return acc;
        }, {});
    };

    const { data, error } = await supabase
        .from('applications')
        .select('job_id, status')
        .in('candidate_id', uniqueCandidateIds)
        .in('status', ['assessment_requested', 'assessment_completed']);

    if (!error && data) {
        return mergeStatuses(data);
    }

    if (error) {
        console.warn('Could not load candidate assessment statuses from applications:', error);
    }

    if (!profileId) {
        return {};
    }

    const notifications = await getNotifications(profileId).catch((notificationError) => {
        console.warn('Could not load candidate assessment statuses from notifications fallback:', notificationError);
        return [];
    });

    return mergeStatuses(
        notifications
            .filter((notification) => notification.metadata?.job_id && (notification.metadata?.assessment_requested || notification.metadata?.assessment_completed))
            .map((notification) => ({
                job_id: notification.metadata?.job_id as string,
                status: notification.metadata?.assessment_completed ? 'assessment_completed' : 'assessment_requested',
            }))
    );
};

export const deleteJob = async (id: string): Promise<void> => {
    const isMissingTableError = (error: any, tableName: string) => {
        if (!error) return false;
        const normalizedTableName = tableName.toLowerCase();
        const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
        return (
            error.code === '42P01' ||
            error.code === 'PGRST205' ||
            message.includes(`could not find the table 'public.${normalizedTableName}'`) ||
            message.includes(`relation "public.${normalizedTableName}" does not exist`) ||
            message.includes(normalizedTableName) && message.includes('schema cache')
        );
    };

    const { error: applicationError } = await supabase.from('applications').delete().eq('job_id', id);
    if (applicationError && !isMissingTableError(applicationError, 'applications')) throw applicationError;

    const { error: invitationError } = await supabase.from('job_invitations').delete().eq('job_id', id);
    if (invitationError && !isMissingTableError(invitationError, 'job_invitations')) throw invitationError;

    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) throw error;
};

export const deleteRecruiterJobPosting = async (id: string): Promise<void> => {
    try {
        const { data, error } = await supabase.rpc('delete_recruiter_job_posting', { p_job_id: id });
        const message = `${error?.message || ''} ${error?.details || ''}`.trim();
        const isMissingFunction = Boolean(error && (error.code === '42883' || message.includes('delete_recruiter_job_posting')));

        if (!error) {
            if (data === false) {
                throw new Error('Recruiter job delete RPC returned false.');
            }
            return;
        }

        if (!isMissingFunction) {
            throw error;
        }
    } catch (rpcError: any) {
        const rpcMessage = `${rpcError?.message || ''} ${rpcError?.details || ''}`.trim().toLowerCase();
        const canFallback =
            rpcMessage.includes('delete_recruiter_job_posting') ||
            rpcMessage.includes('load failed') ||
            rpcMessage.includes('failed to fetch') ||
            rpcMessage.includes('fetch');

        if (!canFallback) {
            throw rpcError;
        }
    }

    try {
        await deleteJob(id);
    } catch (fallbackError: any) {
        const fallbackMessage = `${fallbackError?.message || ''} ${fallbackError?.details || ''}`.trim();
        throw new Error(
            fallbackMessage.includes('violates foreign key constraint')
                ? 'Deleting recruiter postings with linked applications requires the delete_recruiter_job_posting RPC. Run supabase/delete_recruiter_job_posting.sql in Supabase SQL Editor.'
                : fallbackError?.message || 'Unable to delete the recruiter posting.'
        );
    }
};

const enrichJobsWithApplicantEmails = async (jobs: JobProfile[]): Promise<JobProfile[]> => {
    if (jobs.length === 0) return jobs;

    const jobIds = jobs.map(job => job.id);
    // Applications and pending invitations are independent — fetch them in parallel
    // instead of sequentially so the job board and recruiter dashboards hydrate faster.
    const [applicationsResult, invitationsResult] = await Promise.all([
        supabase.from('applications').select('job_id, candidate_id').in('job_id', jobIds),
        supabase.from('job_invitations').select('job_id, email').in('job_id', jobIds),
    ]);
    const { data: applications, error: appErr } = applicationsResult;
    const { data: pendingInvitations, error: inviteErr } = invitationsResult;

    if (inviteErr) {
        console.warn("Could not fetch pending invitations while enriching jobs:", inviteErr);
    }

    if (appErr || !applications || applications.length === 0) {
        if (appErr) {
            console.error("Error enriching jobs with applicants:", appErr);
        }
        return jobs.map(job => ({
            ...job,
            applicant_emails: Array.from(new Set((pendingInvitations || [])
                .filter(invite => invite.job_id === job.id)
                .map(invite => invite.email)
                .filter((email): email is string => !!email)))
        }));
    }

    const candidateIds = Array.from(new Set(applications.map(app => app.candidate_id).filter(Boolean)));
    const { data: profiles, error: profileErr } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', candidateIds);

    if (profileErr) {
        console.error("Error fetching applicant profiles:", profileErr);
        return jobs.map(job => ({
            ...job,
            applicant_emails: applications.filter(app => app.job_id === job.id).map(app => app.candidate_id)
        }));
    }

    const emailByProfileId = new Map((profiles || []).map(profile => [profile.id, profile.email]));

    return jobs.map(job => ({
        ...job,
        applicant_emails: Array.from(new Set([
            ...applications
                .filter(app => app.job_id === job.id)
                .map(app => emailByProfileId.get(app.candidate_id))
                .filter((email): email is string => !!email),
            ...(pendingInvitations || [])
                .filter(invite => invite.job_id === job.id)
                .map(invite => invite.email)
                .filter((email): email is string => !!email)
        ]))
    }));
};


// --- Notifications ---

export const getNotifications = async (userId: string): Promise<Notification[]> => {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching notifications:", error);
        return [];
    }

    return (data || []) as Notification[];
};

export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

    if (error) throw error;
};

export const createNotification = async (notif: Omit<Notification, 'id' | 'created_at' | 'is_read'>): Promise<void> => {
    const { error } = await supabase.from('notifications').insert({
        user_id: notif.user_id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        metadata: notif.metadata,
        is_read: false
    });

    if (error) {
        console.warn("Could not create notification. Table 'notifications' might not exist.", error);
    }
};

const notifyRecruiterOfApplication = async (candidateId: string, jobId: string): Promise<void> => {
    try {
        const { data: job } = await supabase.from('jobs').select('recruiter_id, content').eq('id', jobId).single();

        let userId = candidateId;
        if (candidateId.startsWith('cand_')) {
            const { data: cand } = await supabase.from('candidates').select('user_id').eq('id', candidateId).single();
            if (cand) userId = cand.user_id;
        }

        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).single();

        if (job && profile) {
            await createNotification({
                user_id: job.recruiter_id,
                type: 'application_received',
                title: 'New Application Received',
                message: `${normalizeFullName(profile.full_name, 'A candidate')} has applied for "${(job.content as JobProfile).title}".`,
                metadata: { job_id: jobId, candidate_id: userId }
            });
        } else {
            console.warn("Notification skipped: Job or Profile not resolved.", { jobId, userId });
        }
    } catch (e) {
        console.error("Failed to trigger recruiter notification:", e);
    }
};

const notifyRecruiterOfAssessmentCompletion = async (candidate: CandidateProfile, jobId: string): Promise<void> => {
    try {
        const { data: job } = await supabase
            .from('jobs')
            .select('recruiter_id, content')
            .eq('id', jobId)
            .single();

        if (!job?.recruiter_id) return;

        await createNotification({
            user_id: job.recruiter_id,
            type: 'info',
            title: 'Assessment completed',
            message: `${formatCandidateName(candidate) || candidate.contacts.email || 'A candidate'} completed the follow-up assessment for "${(job.content as JobProfile).title}".`,
            metadata: {
                job_id: jobId,
                assessment_completed: true,
            },
        });
    } catch (error) {
        console.error('Failed to notify recruiter of assessment completion:', error);
    }
};

export const requestCandidateAssessment = async (
    job: JobProfile,
    candidate: CandidateProfile
): Promise<CandidateAssessmentRequestResult> => {
    if (!isJobQuizEnabled(job) && job.requires_quiz === false) {
        throw new Error('The questionnaire is currently disabled for this role.');
    }

    const candidateProfileId = await resolveCandidateApplicationProfileId(candidate.contacts.email, candidate.id);

    if (!candidateProfileId) {
        throw new Error('The candidate profile could not be resolved for this assessment request.');
    }

    const updatedJob = await ensureJobTechnicalTest(job);
    const alreadyCompleted = Boolean(getCurrentQuizResult(candidate, updatedJob));

    let emailDeliveryError: string | null = null;

    if (alreadyCompleted) {
        await updateApplicationStatus(candidateProfileId, updatedJob.id, 'assessment_completed');
    } else {
        await updateApplicationStatus(candidateProfileId, updatedJob.id, 'assessment_requested');

        const actor = await resolveEffectiveActor();
        await createNotification({
            user_id: candidateProfileId,
            type: 'invitation_received',
            title: `${updatedJob.technical_test?.questions?.length ?? 20}-question role questionnaire requested`,
            message: candidate.ai_refined
                ? `A recruiter asked you to complete a ${updatedJob.technical_test?.questions?.length ?? 20}-question role questionnaire for "${updatedJob.title}".`
                : `A recruiter asked you to complete your AI profile refinement first, then a ${updatedJob.technical_test?.questions?.length ?? 20}-question role questionnaire for "${updatedJob.title}".`,
            metadata: {
                job_id: updatedJob.id,
                candidate_id: candidateProfileId,
                sender_email: actor.email,
                assessment_requested: true,
                requires_ai_refinement: !candidate.ai_refined,
                question_count: updatedJob.technical_test?.questions?.length || 10,
            },
        });

        try {
            const emailDispatch = await sendRecruiterInviteEmail({
                invitationType: 'assessment',
                candidateEmail: candidate.contacts.email,
                candidateName: formatCandidateName(candidate) || candidate.contacts.email,
                recruiterEmail: actor.email,
                recruiterName: actor.fullName || actor.email,
                jobId: updatedJob.id,
                jobTitle: updatedJob.title,
                questionCount: updatedJob.technical_test?.questions?.length || 10,
                requiresAiRefinement: !candidate.ai_refined,
                jobUrl: buildSeekerJobUrl(updatedJob.id),
            });

            if (emailDispatch.status === 'paused') {
                emailDeliveryError = EMAIL_SENDING_PAUSED_MESSAGE;
            }
        } catch (error: any) {
            console.error('Failed to send recruiter questionnaire invite email:', error);
            emailDeliveryError = error?.message || 'Questionnaire invite email delivery failed.';
        }
    }

    return {
        updatedJob,
        candidateProfileId,
        assessmentStatus: alreadyCompleted ? 'already_completed' : 'requested',
        emailDeliveryError,
    };
};

export const requestCandidateAiRefinement = async (
    job: JobProfile,
    candidate: CandidateProfile
): Promise<CandidateAiRefinementRequestResult> => {
    const candidateProfileId = await resolveCandidateApplicationProfileId(candidate.contacts.email, candidate.id);

    if (!candidateProfileId) {
        throw new Error('The candidate profile could not be resolved for this AI refinement request.');
    }

    const actor = await resolveEffectiveActor();
    await createNotification({
        user_id: candidateProfileId,
        type: 'invitation_received',
        title: 'AI profile refinement requested',
        message: `A recruiter asked you to complete your AI profile refinement for "${job.title}".`,
        metadata: {
            job_id: job.id,
            candidate_id: candidateProfileId,
            sender_email: actor.email,
            requires_ai_refinement: true,
        },
    });

    let emailDeliveryError: string | null = null;

    try {
        const emailDispatch = await sendRecruiterInviteEmail({
            invitationType: 'ai_refinement',
            candidateEmail: candidate.contacts.email,
            candidateName: formatCandidateName(candidate) || candidate.contacts.email,
            recruiterEmail: actor.email,
            recruiterName: actor.fullName || actor.email,
            jobId: job.id,
            jobTitle: job.title,
            requiresAiRefinement: true,
            jobUrl: buildSeekerJobUrl(job.id),
        });

        if (emailDispatch.status === 'paused') {
            emailDeliveryError = EMAIL_SENDING_PAUSED_MESSAGE;
        }
    } catch (error: any) {
        console.error('Failed to send recruiter AI refinement invite email:', error);
        emailDeliveryError = error?.message || 'AI refinement invite email delivery failed.';
    }

    return { emailDeliveryError };
};

export const markCandidateAssessmentCompleted = async (
    candidate: CandidateProfile,
    jobId: string
): Promise<void> => {
    const candidateProfileId = await resolveCandidateApplicationProfileId(candidate.contacts.email, candidate.id);

    if (!candidateProfileId) {
        throw new Error('The candidate profile could not be resolved while closing the assessment.');
    }

    await updateApplicationStatus(candidateProfileId, jobId, 'assessment_completed');
    await notifyRecruiterOfAssessmentCompletion(candidate, jobId);
};

// --- Update applyToJob to trigger notification ---
export const applyToJob = async (candidateId: string, jobId: string): Promise<void> => {
    const actor = await resolveEffectiveActor();
    const adminApplyResult = await applyToJobViaAdminRpc(candidateId, jobId);
    if (adminApplyResult !== null) {
        if (adminApplyResult) {
            rememberLocallyAppliedJob([candidateId], jobId, actor.email);
            clearLocallyUnappliedJob([candidateId], jobId, actor.email);
            await notifyRecruiterOfApplication(candidateId, jobId);
        }
        return;
    }

    const candidateIds = await resolveCandidateApplicationIds(candidateId);
    if (!candidateIds.includes(candidateId)) {
        candidateIds.push(candidateId);
    }

    // Check if already applied
    const { data: existing, error: existingError } = await supabase
        .from('applications')
        .select('id')
        .in('candidate_id', candidateIds)
        .eq('job_id', jobId)
        .maybeSingle();

    if (existingError) {
        console.warn("Could not verify existing application before insert:", existingError);
    }

    if (existing) return; // Already applied

    const { error } = await supabase.from('applications').insert({
        job_id: jobId,
        candidate_id: candidateId,
        status: 'pending'
    });

    if (error) {
        const insertedViaImpersonation = await applyToJobViaImpersonatedSession(candidateId, jobId).catch((impersonationError) => {
            console.error("Impersonated application fallback failed:", impersonationError);
            throw impersonationError;
        });

        if (!insertedViaImpersonation) {
            throw error;
        }
    }

    rememberLocallyAppliedJob([candidateId], jobId, actor.email);
    clearLocallyUnappliedJob([candidateId], jobId, actor.email);
    await notifyRecruiterOfApplication(candidateId, jobId);
};

export const isEmailInvitedToJob = async (jobId: string, email: string): Promise<boolean> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return false;

    const [{ data: profile }, { data: invitation }, { data: jobRow }] = await Promise.all([
        supabase.from('profiles').select('id').eq('email', normalizedEmail).maybeSingle(),
        supabase.from('job_invitations').select('id').eq('job_id', jobId).eq('email', normalizedEmail).maybeSingle(),
        supabase.from('jobs').select('content').eq('id', jobId).maybeSingle(),
    ]);

    if (invitation) {
        return true;
    }

    const invitedEmails = ((jobRow?.content as JobProfile | undefined)?.applicant_emails || [])
        .map((entry) => entry.trim().toLowerCase());

    if (invitedEmails.includes(normalizedEmail)) {
        return true;
    }

    if (!profile?.id) {
        return false;
    }

    const { data: application } = await supabase
        .from('applications')
        .select('id')
        .eq('job_id', jobId)
        .eq('candidate_id', profile.id)
        .maybeSingle();

    return Boolean(application);
};

export const unapplyFromJob = async (candidateId: string, jobId: string): Promise<void> => {
    const actor = await resolveEffectiveActor();
    const adminUnapplyResult = await unapplyFromJobViaAdminRpc(candidateId, jobId);
    if (adminUnapplyResult !== null) {
        if (adminUnapplyResult) {
            clearLocallyAppliedJob([candidateId], jobId, actor.email);
            rememberLocallyUnappliedJob([candidateId], jobId, actor.email);
        }
        return;
    }

    const candidateIds = await resolveCandidateApplicationIds(candidateId);
    const { data, error } = await supabase
        .from('applications')
        .delete()
        .in('candidate_id', candidateIds)
        .eq('job_id', jobId)
        .select('candidate_id');

    if (error) {
        throw error;
    }

    if ((!data || data.length === 0) && loadAdminImpersonation()) {
        const removedViaImpersonation = await unapplyFromJobViaImpersonatedSession(candidateId, jobId).catch((impersonationError) => {
            console.error("Impersonated unapply fallback failed:", impersonationError);
            throw impersonationError;
        });

        if (!removedViaImpersonation) {
            throw new Error('No matching application was removed.');
        }
    }

    clearLocallyAppliedJob(candidateIds, jobId, actor.email);
    rememberLocallyUnappliedJob(candidateIds, jobId, actor.email);
};

export const getApplicantsForJob = async (jobId: string, applicantEmails: string[] = []): Promise<{ candidate: CandidateProfile; status: string }[]> => {
    const impersonation = loadAdminImpersonation();

    if (impersonation?.role === 'recruiter') {
        const adminApplicants = await getApplicantsForJobViaAdminRpc(jobId);
        if (adminApplicants) {
            return adminApplicants;
        }
    }

    const normalizedApplicantEmails = applicantEmails
        .filter(Boolean)
        .map((email) => email.toLowerCase().trim());
    const notificationCandidateIds = impersonation?.role === 'recruiter'
        ? await getRecruiterCandidateIdsFromNotifications(impersonation.profileId, jobId)
        : [];

    // 1. Get all applications for this job
    const { data: applications, error: appErr } = await supabase
        .from('applications')
        .select('candidate_id, status')
        .eq('job_id', jobId);

    if (appErr) {
        console.error("Error fetching applications for job:", appErr);
        if (impersonation?.role === 'recruiter') {
            const debugApplicants = await getApplicantsForJobFromDebugData(jobId, notificationCandidateIds, normalizedApplicantEmails);
            if (debugApplicants) {
                return debugApplicants;
            }
        }
        return [];
    }

    if (!applications || applications.length === 0) {
        if (impersonation?.role === 'recruiter') {
            const debugApplicants = await getApplicantsForJobFromDebugData(jobId, notificationCandidateIds, normalizedApplicantEmails);
            if (debugApplicants) {
                return debugApplicants;
            }
        }
        return [];
    }

    const candidateIds = Array.from(new Set([
        ...applications.map(app => app.candidate_id),
        ...notificationCandidateIds,
    ].filter(Boolean)));
    const statusByCandidateId = new Map(
        applications
            .filter((app) => Boolean(app.candidate_id))
            .map((app) => [app.candidate_id, app.status || 'pending'])
    );

    // 2. Fetch candidate profiles for these IDs
    const { data: candidateRows, error: candErr } = await supabase
        .from('candidates')
        .select('*')
        .in('user_id', candidateIds);

    if (candErr) {
        console.error("Error fetching candidate profiles:", candErr);
        if (impersonation?.role === 'recruiter') {
            const debugApplicants = await getApplicantsForJobFromDebugData(jobId, candidateIds, normalizedApplicantEmails, statusByCandidateId);
            if (debugApplicants) {
                return debugApplicants;
            }
        }
        return [];
    }

    if (!candidateRows) {
        if (impersonation?.role === 'recruiter') {
            const debugApplicants = await getApplicantsForJobFromDebugData(jobId, candidateIds, normalizedApplicantEmails, statusByCandidateId);
            if (debugApplicants) {
                return debugApplicants;
            }
        }
        return [];
    }

    // 3. Map candidates with their application status
    return candidateRows.map(row => {
        const app = applications.find(a => a.candidate_id === row.user_id);
        return {
            candidate: hydrateEmbedding(row.content as CandidateProfile, row.embedding),
            status: app?.status || 'pending'
        };
    });
};

/**
 * Batch variant of `getApplicantsForJob` that loads applicant data for many jobs
 * with only two Supabase round-trips (one for applications, one for candidates)
 * instead of `N * 2`. Designed for the recruiter dashboard where we need a quick
 * applicant count + metrics across all the recruiter's job postings.
 *
 * Falls back to per-job sequential calls if the impersonation path is active, so
 * the admin RPC + debug paths in `getApplicantsForJob` stay authoritative.
 */
export const getApplicantsForJobs = async (
    jobIds: string[]
): Promise<Record<string, { candidate: CandidateProfile; status: string }[]>> => {
    const result: Record<string, { candidate: CandidateProfile; status: string }[]> = {};
    if (!jobIds || jobIds.length === 0) return result;

    const impersonation = loadAdminImpersonation();
    if (impersonation?.role === 'recruiter') {
        // Per-job path keeps the admin-RPC + debug fallbacks intact.
        await Promise.all(jobIds.map(async (jobId) => {
            try {
                result[jobId] = await getApplicantsForJob(jobId);
            } catch (e) {
                console.error(`Batch fallback failed for job ${jobId}:`, e);
                result[jobId] = [];
            }
        }));
        return result;
    }

    // 1. All applications for all requested jobs in one query.
    const { data: applications, error: appErr } = await supabase
        .from('applications')
        .select('job_id, candidate_id, status')
        .in('job_id', jobIds);

    if (appErr) {
        console.error('Error fetching batched applications:', appErr);
        jobIds.forEach((id) => { result[id] = []; });
        return result;
    }

    const apps = applications || [];
    const candidateIds = Array.from(new Set(apps.map((a) => a.candidate_id).filter(Boolean)));

    // 2. All candidate profiles + embeddings in a single query.
    let candidateRows: any[] = [];
    if (candidateIds.length > 0) {
        const { data, error: candErr } = await supabase
            .from('candidates')
            .select('user_id, content, embedding')
            .in('user_id', candidateIds);
        if (candErr) {
            console.error('Error fetching batched candidates:', candErr);
        } else {
            candidateRows = data || [];
        }
    }

    const candidateByUserId = new Map<string, { candidate: CandidateProfile }>();
    for (const row of candidateRows) {
        candidateByUserId.set(row.user_id, {
            candidate: hydrateEmbedding(row.content as CandidateProfile, row.embedding),
        });
    }

    // 3. Group applications back per job.
    for (const jobId of jobIds) result[jobId] = [];
    for (const app of apps) {
        if (!app.candidate_id) continue;
        const hit = candidateByUserId.get(app.candidate_id);
        if (!hit) continue;
        result[app.job_id].push({ candidate: hit.candidate, status: app.status || 'pending' });
    }

    return result;
};

// --- Update inviteApplicantsToJob to trigger notification ---
export const inviteApplicantsToJob = async (jobId: string, emails: string[]): Promise<void> => {
    if (!emails || emails.length === 0) return;
    const normalizedEmails = Array.from(
        new Set(
            emails
                .map((email) => email.trim().toLowerCase())
                .filter((email) => email.includes('@'))
        )
    );
    if (normalizedEmails.length === 0) return;

    // Get current recruiter info for notification. Actor is serial because the later
    // queries depend on `actor.profileId`; after that the three independent reads
    // (recruiter profile, job content, candidate profiles by email) run in parallel
    // so the invite flow no longer waits on three sequential round trips.
    const actor = await resolveEffectiveActor();
    const [recruiterResult, jobResult, profilesResult] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', actor.profileId).single(),
        supabase.from('jobs').select('content').eq('id', jobId).single(),
        supabase.from('profiles').select('id, email').in('email', normalizedEmails),
    ]);
    const { data: recruiter } = recruiterResult;
    const { data: job } = jobResult;
    const { data: profiles, error: profileErr } = profilesResult;

    if (profileErr) throw profileErr;

    const existingEmailSet = new Set((profiles || []).map((profile) => profile.email.trim().toLowerCase()));

    // 2. Insert into applications table for existing users
    if (profiles && profiles.length > 0) {
        const profileIds = profiles.map(p => p.id);
        const { data: existingApplications, error: existingErr } = await supabase
            .from('applications')
            .select('candidate_id')
            .eq('job_id', jobId)
            .in('candidate_id', profileIds);

        if (existingErr) throw existingErr;

        const alreadyApplied = new Set((existingApplications || []).map(app => app.candidate_id));
        const newProfilesToInvite = profiles.filter(p => !alreadyApplied.has(p.id));

        const applicationInserts = newProfilesToInvite.map(p => ({
            job_id: jobId,
            candidate_id: p.id,
            status: 'invited'
        }));

        if (applicationInserts.length > 0) {
            const { error: appErr } = await supabase.from('applications').insert(applicationInserts);
            if (appErr) throw appErr;
        }

        // Notify each invited candidate
        for (const p of newProfilesToInvite) {
            try {
                await createNotification({
                    user_id: p.id,
                    type: 'invitation_received',
                    title: 'New Job Invitation',
                    message: `${normalizeFullName(recruiter?.full_name, 'A recruiter')} invited you to apply for "${(job?.content as JobProfile)?.title || 'a new role'}".`,
                    metadata: { job_id: jobId, sender_email: actor.email }
                });
            } catch (e) {
                console.error(`Failed to notify candidate ${p.id}:`, e);
            }
        }
    }

    // 3. Handle non-existing users
    const missingEmails = normalizedEmails.filter(e => !existingEmailSet.has(e));
    if (missingEmails.length > 0) {
        const { data: existingInvitations } = await supabase
            .from('job_invitations')
            .select('email')
            .eq('job_id', jobId)
            .in('email', missingEmails);

        const alreadyInvited = new Set((existingInvitations || []).map((entry) => entry.email.trim().toLowerCase()));
        const freshEmails = missingEmails.filter((email) => !alreadyInvited.has(email));
        if (freshEmails.length === 0) {
            return;
        }

        const inviteInserts = freshEmails.map(e => ({
            job_id: jobId,
            email: e,
            status: 'pending'
        }));

        const { error: invErr } = await supabase.from('job_invitations').insert(inviteInserts);
        if (invErr) {
            console.warn("Could not insert pending invites. Table 'job_invitations' might not be created yet.", invErr);
        }
    }
};


// --- Recruiters ---

async function syncRecruiterBrandingAcrossJobs(recruiterId: string, recruiter: RecruiterProfile): Promise<void> {
    const impersonation = loadAdminImpersonation();
    let jobs: { id: string; content: JobProfile }[] = [];

    if (impersonation?.role === 'recruiter' && impersonation.profileId === recruiterId) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_debug_data');
        if (rpcError) {
            console.warn('Could not load recruiter jobs via debug RPC while syncing company branding:', rpcError);
            return;
        }

        jobs = ((((rpcData as any)?.jobs || []) as any[])
            .filter((row) => row?.recruiter_id === recruiterId)
            .map((row) => ({ id: row.id || row.content?.id, content: row.content as JobProfile })));
    } else {
        const { data, error: jobsError } = await supabase
            .from('jobs')
            .select('id, content')
            .eq('recruiter_id', recruiterId);

        if (jobsError) {
            console.warn('Could not load recruiter jobs while syncing company branding:', jobsError);
            return;
        }

        jobs = (data || []) as { id: string; content: JobProfile }[];
    }

    for (const jobRow of jobs || []) {
        const existingJob = (jobRow.content as JobProfile) || ({} as JobProfile);
        const updatedJob = applyRecruiterBrandingToJob(existingJob, recruiterId, recruiter);

        if (impersonation?.role === 'recruiter' && impersonation.profileId === recruiterId) {
            const { data, error: updateError } = await supabase.rpc('update_debug_entity', {
                p_type: 'job',
                p_id: jobRow.id,
                p_content: updatedJob,
            });

            if (updateError || (data as any)?.status === 'error') {
                console.warn(`Could not sync company branding to job ${jobRow.id} via admin RPC:`, updateError || (data as any)?.message);
            }
            continue;
        }

        const { error: updateError } = await supabase
            .from('jobs')
            .update({ content: updatedJob })
            .eq('id', jobRow.id);

        if (updateError) {
            console.warn(`Could not sync company branding to job ${jobRow.id}:`, updateError);
        }
    }
}

export const addRecruiter = async (recruiter: RecruiterProfile): Promise<any> => {
    const actor = await resolveEffectiveActor();
    const recruiterId = actor.profileId || recruiter.id;
    const nextRecruiter = normalizeRecruiterProfile({ ...recruiter, id: recruiterId });

    const savedViaAdminRpc = await saveRecruiterViaAdminConsoleRpc(recruiterId, nextRecruiter);

    if (!savedViaAdminRpc) {
        const { error } = await supabase.from('recruiters').upsert({
            id: recruiterId,
            content: nextRecruiter
        });
        if (error) throw error;
    }

    await syncRecruiterBrandingAcrossJobs(recruiterId, nextRecruiter);

    void logActivity({
        eventType: 'recruiter_profile_saved',
        source: 'dbService',
        purpose: 'recruiter_profile_save',
        entityType: 'recruiter',
        entityId: recruiterId,
        entityLabel: nextRecruiter.company_name || `${nextRecruiter.first_name} ${nextRecruiter.last_name}`.trim() || recruiterId,
        summary: `Saved recruiter profile for ${nextRecruiter.company_name || nextRecruiter.email || 'recruiter'}.`,
        metadata: {
            email: nextRecruiter.email || null,
            recruiter_role: nextRecruiter.role || null,
            company_name: nextRecruiter.company_name || null,
        },
    });
    return recruiterId;
};

export const getRecruiter = async (id: string): Promise<RecruiterProfile | undefined> => {
    const { data, error } = await supabase.from('recruiters').select('*').eq('id', id).single();
    if (data) return normalizeRecruiterProfile(data.content as RecruiterProfile);

    if (loadAdminImpersonation()) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_debug_data');
        if (!rpcError) {
            const match = (((rpcData as any)?.recruiters || []) as any[]).find((row) => row?.content?.id === id);
            if (match?.content) {
                return normalizeRecruiterProfile(match.content as RecruiterProfile);
            }
        }
    }

    return undefined;
};

export const getAllRecruiters = async (): Promise<RecruiterProfile[]> => {
    const { data, error } = await supabase.from('recruiters').select('*');
    if (error) throw error;
    return data.map(d => normalizeRecruiterProfile(d.content as RecruiterProfile));
};

export const deleteRecruiter = async (id: string): Promise<void> => {
    const { data: recruiterJobs, error: jobsError } = await supabase
        .from('jobs')
        .select('id')
        .eq('recruiter_id', id);

    if (jobsError) throw jobsError;

    for (const job of recruiterJobs || []) {
        await deleteJob(job.id);
    }

    const { error } = await supabase.from('recruiters').delete().eq('id', id);
    if (error) throw error;
};

export const createNewUserAndRecruiterProfile = async (user: User, recruiter: RecruiterProfile): Promise<void> => {
    if (user.role !== 'recruiter') {
        throw new Error("createNewUserAndRecruiterProfile can only be used for recruiter accounts.");
    }

    // Assumes Auth is done.
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Not logged in");

    const normalizedRecruiter = normalizeRecruiterProfile(recruiter);
    const { error: profileError } = await supabase.from('profiles').upsert({
        id: userData.user.id,
        email: user.email,
        role: user.role,
        full_name: buildNormalizedFullName(normalizedRecruiter.first_name, normalizedRecruiter.last_name)
    });

    if (profileError) throw profileError;

    await addRecruiter({
        ...normalizedRecruiter,
        id: userData.user.id
    });
}
