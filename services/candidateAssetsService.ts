import { CandidateCvRecord, CandidateProfile, CandidateRefinementChat, ChatMessage } from '../types';
import { normalizeCandidateProfileNames, toSafeFilenameNamePart } from '../utils/nameFormat';
import { loadAdminImpersonation } from './impersonationService';
import { supabase } from './supabaseClient';

export const CANDIDATE_CV_BUCKET = 'candidate-cvs';
const SUPPORT_SQL_FILE = 'supabase/candidate_assets_and_refinement.sql';

const normalizeEmail = (value?: string | null) => (value || '').trim().toLowerCase();

const normalizeTranscript = (messages: ChatMessage[]): ChatMessage[] =>
    messages
        .filter((message) => Boolean(message?.text?.trim()))
        .map((message) => ({
            role: message.role === 'user' ? 'user' : 'model',
            text: message.text.trim(),
        }));

const parseChatRow = (row: any): CandidateRefinementChat => ({
    id: row.id,
    candidate_profile_id: row.candidate_profile_id,
    candidate_record_id: row.candidate_record_id || null,
    transcript: Array.isArray(row.transcript) ? row.transcript : [],
    language: row.language === 'en' ? 'en' : 'it',
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at || null,
});

const parseCvRow = (row: any): CandidateCvRecord => ({
    id: row.id,
    candidate_profile_id: row.candidate_profile_id,
    candidate_record_id: row.candidate_record_id || null,
    bucket_name: row.bucket_name || CANDIDATE_CV_BUCKET,
    file_name: row.file_name,
    file_path: row.file_path,
    mime_type: row.mime_type || null,
    file_size: typeof row.file_size === 'number' ? row.file_size : Number(row.file_size || 0) || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
});

const isMissingTableError = (error: any, tableName: string) => {
    const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    const normalizedTable = tableName.toLowerCase();

    return (
        error?.code === '42P01' ||
        error?.code === 'PGRST205' ||
        message.includes(`could not find the table 'public.${normalizedTable}'`) ||
        message.includes(`relation "public.${normalizedTable}" does not exist`) ||
        (message.includes(normalizedTable) && message.includes('schema cache'))
    );
};

const isMissingRpcError = (error: any, functionName: string) => {
    const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return error?.code === '42883' || message.includes(functionName.toLowerCase());
};

const isStorageSetupError = (error: any, bucketName: string) => {
    const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

    return (
        error?.statusCode === '404' ||
        error?.statusCode === '403' ||
        message.includes('bucket not found') ||
        message.includes(bucketName.toLowerCase()) ||
        message.includes('row-level security') ||
        message.includes('violates row-level security')
    );
};

const buildSupportError = (subject: string) =>
    new Error(`${subject} requires the Supabase setup in ${SUPPORT_SQL_FILE}. Run that SQL file in Supabase SQL Editor.`);

const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const buildCandidateCvFilename = (candidate: CandidateProfile, originalFileName?: string | null) => {
    const normalizedCandidate = normalizeCandidateProfileNames(candidate);
    const firstName = toSafeFilenameNamePart(normalizedCandidate.personal_info?.first_name, 'Candidate');
    const lastName = toSafeFilenameNamePart(normalizedCandidate.personal_info?.last_name, 'Profile');
    const normalizedOriginal = (originalFileName || '').trim().toLowerCase();
    const extension = normalizedOriginal.endsWith('.pdf') ? '.pdf' : '.pdf';
    return `${firstName}_${lastName}${extension}`;
};

const getCandidateByCvRecord = async (
    record: Pick<CandidateCvRecord, 'candidate_profile_id' | 'candidate_record_id'>
): Promise<CandidateProfile | null> => {
    const queries = [];

    if (record.candidate_record_id) {
        queries.push(
            supabase
                .from('candidates')
                .select('content')
                .eq('id', record.candidate_record_id)
                .maybeSingle()
        );
    }

    if (record.candidate_profile_id) {
        queries.push(
            supabase
                .from('candidates')
                .select('content')
                .eq('user_id', record.candidate_profile_id)
                .maybeSingle()
        );
    }

    for (const query of queries) {
        const { data, error } = await query;

        if (error) {
            console.warn('Could not resolve candidate while normalizing CV filename:', error);
            continue;
        }

        if (data?.content) {
            return data.content as CandidateProfile;
        }
    }

    return null;
};

const ensureCanonicalCandidateCvMetadata = async (record: CandidateCvRecord): Promise<CandidateCvRecord> => {
    const candidate = await getCandidateByCvRecord(record);
    if (!candidate) {
        return record;
    }

    const canonicalFileName = buildCandidateCvFilename(candidate, record.file_name);
    if (record.file_name === canonicalFileName) {
        return record;
    }

    const { data, error } = await supabase
        .from('candidate_cvs')
        .update({ file_name: canonicalFileName })
        .eq('id', record.id)
        .select('*')
        .single();

    if (error) {
        if (isMissingTableError(error, 'candidate_cvs')) {
            console.warn(`Candidate CV metadata table is missing. Run ${SUPPORT_SQL_FILE} in Supabase SQL Editor.`);
            return { ...record, file_name: canonicalFileName };
        }

        console.warn('Could not update candidate CV filename to canonical format:', error);
        return { ...record, file_name: canonicalFileName };
    }

    return parseCvRow(data);
};

const escapeCsv = (value?: string | number | null) => {
    const stringValue = String(value ?? '');
    return `"${stringValue.replace(/"/g, '""')}"`;
};

const resolveCandidateProfileId = async (candidateLike: {
    id?: string | null;
    email?: string | null;
}): Promise<string | null> => {
    const impersonation = loadAdminImpersonation();
    const normalizedEmail = normalizeEmail(candidateLike.email);

    if (
        impersonation?.role === 'seeker' &&
        (
            candidateLike.id === impersonation.profileId ||
            (normalizedEmail && normalizedEmail === normalizeEmail(impersonation.email))
        )
    ) {
        return impersonation.profileId;
    }

    if (candidateLike.id) {
        const { data: candidateRow, error: candidateError } = await supabase
            .from('candidates')
            .select('user_id')
            .eq('id', candidateLike.id)
            .maybeSingle();

        if (candidateError) {
            console.warn('Could not resolve candidate profile id from candidates table:', candidateError);
        }

        if (candidateRow?.user_id) {
            return candidateRow.user_id;
        }
    }

    if (normalizedEmail) {
        const { data: profileRow, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (profileError) {
            console.warn('Could not resolve candidate profile id from profiles table:', profileError);
        }

        if (profileRow?.id) {
            return profileRow.id;
        }

        const { data: debugData, error: debugError } = await supabase.rpc('get_debug_data');
        if (!debugError) {
            const candidateMatch = (((debugData as any)?.candidates || []) as any[]).find((row) =>
                normalizeEmail(row?.content?.contacts?.email) === normalizedEmail
            );

            if (candidateMatch?.user_id || candidateMatch?.id) {
                return candidateMatch.user_id || candidateMatch.id;
            }
        } else {
            console.warn('Could not resolve candidate profile id from debug data:', debugError);
        }
    }

    const { data: authData } = await supabase.auth.getUser();
    if (candidateLike.id) {
        return candidateLike.id;
    }

    if (normalizedEmail && normalizedEmail === normalizeEmail(authData.user?.email)) {
        return authData.user?.id || null;
    }

    return null;
};

const buildChatFilenameBase = (chat: CandidateRefinementChat, candidateLabel?: string) => {
    const slug = (candidateLabel || chat.candidate_record_id || chat.candidate_profile_id || 'candidate')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'candidate';
    return `${slug}-ai-refinement-chat`;
};

export const saveCandidateRefinementChat = async (
    candidate: CandidateProfile,
    transcript: ChatMessage[],
    language: 'it' | 'en'
): Promise<CandidateRefinementChat | null> => {
    const candidateProfileId = await resolveCandidateProfileId({
        id: candidate.id,
        email: candidate.contacts?.email,
    });

    if (!candidateProfileId) {
        throw new Error('The candidate profile could not be resolved while saving the AI refinement chat.');
    }

    const sanitizedTranscript = normalizeTranscript(transcript);
    if (sanitizedTranscript.length === 0) {
        return null;
    }

    const { data, error } = await supabase
        .from('candidate_refinement_chats')
        .upsert({
            candidate_profile_id: candidateProfileId,
            candidate_record_id: candidate.id,
            transcript: sanitizedTranscript,
            language,
            completed_at: new Date().toISOString(),
        }, {
            onConflict: 'candidate_profile_id',
        })
        .select('*')
        .single();

    if (error) {
        if (isMissingTableError(error, 'candidate_refinement_chats')) {
            throw buildSupportError('Saving AI refinement chats');
        }
        throw error;
    }

    return parseChatRow(data);
};

export const getLatestCandidateRefinementChat = async (candidateLike: {
    id?: string | null;
    email?: string | null;
}): Promise<CandidateRefinementChat | null> => {
    const candidateProfileId = await resolveCandidateProfileId(candidateLike);
    if (!candidateProfileId) return null;

    const { data, error } = await supabase
        .from('candidate_refinement_chats')
        .select('*')
        .eq('candidate_profile_id', candidateProfileId)
        .maybeSingle();

    if (error) {
        if (isMissingTableError(error, 'candidate_refinement_chats')) {
            console.warn(`Candidate refinement chats table is missing. Run ${SUPPORT_SQL_FILE} in Supabase SQL Editor.`);
            return null;
        }
        throw error;
    }

    return data ? parseChatRow(data) : null;
};

export const getRecruiterCandidateRefinementChat = async (
    jobId: string,
    candidateLike: {
        id?: string | null;
        email?: string | null;
    }
): Promise<CandidateRefinementChat | null> => {
    const candidateProfileId = await resolveCandidateProfileId(candidateLike);
    const resolvedCandidateProfileId = candidateProfileId || candidateLike.id || null;
    if (!resolvedCandidateProfileId) return null;

    const { data, error } = await supabase.rpc('get_recruiter_candidate_refinement_chat', {
        p_job_id: jobId,
        p_candidate_profile_id: resolvedCandidateProfileId,
        p_candidate_record_id: candidateLike.id || null,
    });

    if (error) {
        if (isMissingRpcError(error, 'get_recruiter_candidate_refinement_chat')) {
            throw buildSupportError('Recruiter-side AI refinement chat visibility');
        }
        throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return row ? parseChatRow(row) : null;
};

export const getRecruiterCandidateCvRecord = async (
    jobId: string,
    candidateLike: {
        id?: string | null;
        email?: string | null;
    }
): Promise<CandidateCvRecord | null> => {
    const impersonation = loadAdminImpersonation();
    const candidateProfileId = await resolveCandidateProfileId(candidateLike);
    const resolvedCandidateProfileId = candidateProfileId || candidateLike.id || null;
    if (!resolvedCandidateProfileId && impersonation?.role !== 'recruiter') return null;

    const tryAdminFallback = async () => {
        if (impersonation?.role !== 'recruiter') return null;

        if (resolvedCandidateProfileId) {
            const directRecord = await getCandidateCvRecord(candidateLike);
            if (directRecord) return directRecord;
        }

        if (!candidateLike.id) return null;

        const { data, error } = await supabase
            .from('candidate_cvs')
            .select('*')
            .eq('candidate_record_id', candidateLike.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            if (isMissingTableError(error, 'candidate_cvs')) {
                console.warn(`Candidate CV metadata table is missing. Run ${SUPPORT_SQL_FILE} in Supabase SQL Editor.`);
                return null;
            }
            throw error;
        }

        return data ? ensureCanonicalCandidateCvMetadata(parseCvRow(data)) : null;
    };

    if (!resolvedCandidateProfileId) {
        return tryAdminFallback();
    }

    const { data, error } = await supabase.rpc('get_recruiter_candidate_cv', {
        p_job_id: jobId,
        p_candidate_profile_id: resolvedCandidateProfileId,
        p_candidate_record_id: candidateLike.id || null,
    });

    if (error) {
        if (impersonation?.role === 'recruiter') {
            return tryAdminFallback();
        }
        if (isMissingRpcError(error, 'get_recruiter_candidate_cv')) {
            throw buildSupportError('Recruiter-side candidate CV visibility');
        }
        throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
        return ensureCanonicalCandidateCvMetadata(parseCvRow(row));
    }

    return tryAdminFallback();
};

export const doesCandidateCvExistInStorage = async (record: CandidateCvRecord | null | undefined): Promise<boolean> => {
    if (!record?.file_path) return false;

    const normalizedPath = record.file_path.replace(/^\/+|\/+$/g, '');
    const pathParts = normalizedPath.split('/');
    if (pathParts.length === 0) return false;

    const fileName = pathParts[pathParts.length - 1];
    const folderPath = pathParts.slice(0, -1).join('/');

    const { data, error } = await supabase.storage
        .from(record.bucket_name || CANDIDATE_CV_BUCKET)
        .list(folderPath, {
            search: fileName,
            limit: 20,
        });

    if (error) {
        const errorRecord = error as unknown as Record<string, unknown>;
        const message = `${error?.message || ''} ${(errorRecord?.details as string) || ''} ${(errorRecord?.hint as string) || ''}`.toLowerCase();
        const hasPermissionOnlyIssue =
            (errorRecord?.statusCode === '403' || errorRecord?.statusCode === 403) ||
            message.includes('row-level security') ||
            message.includes('not authorized') ||
            message.includes('permission');

        if (hasPermissionOnlyIssue) {
            return true;
        }

        if (isStorageSetupError(error, record.bucket_name || CANDIDATE_CV_BUCKET)) {
            throw buildSupportError('Checking candidate CV storage visibility');
        }
        throw error;
    }

    return (data || []).some((entry) => entry.name === fileName);
};

export const downloadCandidateRefinementChat = async (
    chat: CandidateRefinementChat,
    format: 'json' | 'csv',
    candidateLabel?: string
) => {
    const filenameBase = buildChatFilenameBase(chat, candidateLabel);
    const publicTranscript = getPublicRefinementTranscript(chat.transcript);
    const publicChat = {
        ...chat,
        transcript: publicTranscript,
    };

    if (format === 'json') {
        const blob = new Blob([JSON.stringify(publicChat, null, 2)], { type: 'application/json;charset=utf-8' });
        triggerBlobDownload(blob, `${filenameBase}.json`);
        return;
    }

    const header = [
        'candidate_profile_id',
        'candidate_record_id',
        'language',
        'completed_at',
        'message_index',
        'role',
        'text',
    ];

    const rows = publicTranscript.map((message, index) => [
        escapeCsv(chat.candidate_profile_id),
        escapeCsv(chat.candidate_record_id || ''),
        escapeCsv(chat.language),
        escapeCsv(chat.completed_at || chat.updated_at || ''),
        escapeCsv(index + 1),
        escapeCsv(message.role),
        escapeCsv(message.text),
    ].join(','));

    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    triggerBlobDownload(blob, `${filenameBase}.csv`);
};

const INTERNAL_REFINEMENT_MARKERS = [
    '---INTERNAL---',
    '---END_INTERNAL---',
    'VERIFIED_SKILLS:',
    'INTERNAL SCORING',
];

export const isInternalRefinementMessage = (message: ChatMessage): boolean => {
    const content = message.text || '';
    return INTERNAL_REFINEMENT_MARKERS.some((marker) => content.includes(marker));
};

export const getPublicRefinementTranscript = (transcript: ChatMessage[] = []): ChatMessage[] =>
    transcript.filter((message) => !isInternalRefinementMessage(message));

export const saveCandidateCv = async (
    candidate: CandidateProfile,
    file: File
): Promise<CandidateCvRecord> => {
    const candidateProfileId = await resolveCandidateProfileId({
        id: candidate.id,
        email: candidate.contacts?.email,
    });

    if (!candidateProfileId) {
        throw new Error('The candidate profile could not be resolved while saving the CV.');
    }

    const normalizedFileName = buildCandidateCvFilename(candidate, file.name);
    const filePath = `${candidateProfileId}/candidate-cv`;

    const { error: uploadError } = await supabase.storage
        .from(CANDIDATE_CV_BUCKET)
        .upload(filePath, file, {
            upsert: true,
            contentType: file.type || 'application/pdf',
            cacheControl: '3600',
        });

    if (uploadError) {
        if (isStorageSetupError(uploadError, CANDIDATE_CV_BUCKET)) {
            throw buildSupportError('Saving candidate CVs');
        }
        throw uploadError;
    }

    const { data, error } = await supabase
        .from('candidate_cvs')
        .upsert({
            candidate_profile_id: candidateProfileId,
            candidate_record_id: candidate.id,
            bucket_name: CANDIDATE_CV_BUCKET,
            file_name: normalizedFileName,
            file_path: filePath,
            mime_type: file.type || 'application/pdf',
            file_size: file.size,
        }, {
            onConflict: 'candidate_profile_id',
        })
        .select('*')
        .single();

    if (error) {
        if (isMissingTableError(error, 'candidate_cvs')) {
            throw buildSupportError('Saving candidate CV metadata');
        }
        throw error;
    }

    return ensureCanonicalCandidateCvMetadata(parseCvRow(data));
};

export const getCandidateCvRecord = async (candidateLike: {
    id?: string | null;
    email?: string | null;
}): Promise<CandidateCvRecord | null> => {
    const candidateProfileId = await resolveCandidateProfileId(candidateLike);

    const runQuery = async (queryBuilder: any) => {
        const { data, error } = await queryBuilder;

        if (error) {
            if (isMissingTableError(error, 'candidate_cvs')) {
                console.warn(`Candidate CV metadata table is missing. Run ${SUPPORT_SQL_FILE} in Supabase SQL Editor.`);
                return null;
            }
            throw error;
        }

        return data ? ensureCanonicalCandidateCvMetadata(parseCvRow(data)) : null;
    };

    if (candidateProfileId) {
        const directMatch = await runQuery(
            supabase
                .from('candidate_cvs')
                .select('*')
                .eq('candidate_profile_id', candidateProfileId)
                .maybeSingle()
        );

        if (directMatch) {
            return directMatch;
        }
    }

    if (candidateLike.id) {
        const recordMatch = await runQuery(
            supabase
                .from('candidate_cvs')
                .select('*')
                .eq('candidate_record_id', candidateLike.id)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle()
        );

        if (recordMatch) {
            return recordMatch;
        }
    }

    return null;
};

export const getAllCandidateCvRecords = async (): Promise<CandidateCvRecord[]> => {
    const { data, error } = await supabase
        .from('candidate_cvs')
        .select('*')
        .order('updated_at', { ascending: false });

    if (error) {
        if (isMissingTableError(error, 'candidate_cvs')) {
            console.warn(`Candidate CV metadata table is missing. Run ${SUPPORT_SQL_FILE} in Supabase SQL Editor.`);
            return [];
        }
        throw error;
    }

    return Promise.all((data || []).map((row) => ensureCanonicalCandidateCvMetadata(parseCvRow(row))));
};

export const downloadCandidateCv = async (record: CandidateCvRecord): Promise<void> => {
    const { data, error } = await supabase.storage
        .from(record.bucket_name || CANDIDATE_CV_BUCKET)
        .download(record.file_path);

    if (error) {
        if (isStorageSetupError(error, record.bucket_name || CANDIDATE_CV_BUCKET)) {
            throw buildSupportError('Downloading candidate CVs');
        }
        throw error;
    }

    triggerBlobDownload(data, record.file_name || 'candidate-cv.pdf');
};

export const deleteCandidateCvRecord = async (record: CandidateCvRecord): Promise<void> => {
    const { error: storageError } = await supabase.storage
        .from(record.bucket_name || CANDIDATE_CV_BUCKET)
        .remove([record.file_path]);

    if (storageError && !`${storageError.message || ''}`.toLowerCase().includes('not found')) {
        if (isStorageSetupError(storageError, record.bucket_name || CANDIDATE_CV_BUCKET)) {
            throw buildSupportError('Deleting candidate CVs');
        }
        throw storageError;
    }

    const { error } = await supabase
        .from('candidate_cvs')
        .delete()
        .eq('candidate_profile_id', record.candidate_profile_id);

    if (error) {
        if (isMissingTableError(error, 'candidate_cvs')) {
            throw buildSupportError('Deleting candidate CV metadata');
        }
        throw error;
    }
};

export const deleteCandidateCv = async (candidateLike: {
    id?: string | null;
    email?: string | null;
}): Promise<void> => {
    const record = await getCandidateCvRecord(candidateLike);
    if (!record) return;
    await deleteCandidateCvRecord(record);
};
