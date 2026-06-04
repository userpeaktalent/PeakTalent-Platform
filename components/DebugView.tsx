
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CandidateCvRecord, JobProfile, CandidateProfile, User, RecruiterProfile, Notification } from '../types';
import {
    getAllJobs,
    getAllCandidates,
    getAllUsers,
    getAllRecruiters,
    deleteJob,
    ensureLocalizedCandidateContent,
} from '../services/dbService';
import { supabase } from '../services/supabaseClient';
import { attachEmbeddingMetadata, getEmbedding, generateHash, EMBEDDING_MODEL_ID, EMBEDDING_VERSION } from '../services/embeddingService';
import { buildCandidateCanonicalText, buildJobCanonicalText } from '../utils/canonicalBuilders';
import { Spinner } from './common';
import CandidateForm from './CandidateForm';
import JobProfileForm from './JobProfileForm';
import RecruiterProfileSetup from './RecruiterProfileSetup';
import { generateFakeCandidate, generateFakeJob, generateUUID } from '../utils/aiGenerator';
import { MODEL_CATALOG, EMBEDDING_CATALOG, AI_TASK_META, AITaskKey, getCodeDefault, setModelOverride, hasOverride, resetAllOverrides, getAllModels } from '../config/aiModels';
import { createSystemAdmin, createSystemRecruiter, createSystemSeeker, DEFAULT_TEMP_RECRUITER_PASSWORD, ProvisionedAccountRecord, updateSystemAdminProfile, resetUserPassword, markUserMustChangePassword } from '../services/adminService';
import { hasGeminiApiKey } from '../services/envService';
import { extractCvInfoFromFile } from '../services/geminiService';
import { readFileAsText } from '../utils/fileReader';
import { useAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';
import { buildAdminPasswordResetMailto, buildRecruiterInviteMailto } from '../services/accessLinks';
import { getSupabaseUsageSnapshot, SupabaseUsageSnapshot } from '../services/supabaseUsageService';
import {
    buildNormalizedFullName,
    formatCandidateName,
    formatRecruiterName,
    normalizeFullName,
} from '../utils/nameFormat';
import {
    deleteCandidateCv,
    deleteCandidateCvRecord,
    downloadCandidateCv,
    getAllCandidateCvRecords,
    saveCandidateCv,
} from '../services/candidateAssetsService';
import { ActivityLogRecord, listActivityLogs } from '../services/activityLogService';
import AdminBugReports from './AdminBugReports';
import { withRetry } from '../utils/retry';
import {
    getEmailSendingEnabled,
    getCandidateProfileVisibilitySettingEnabled,
    getRecruiterAllCandidatesEnabled,
    getSeekerOAuthEnabled,
    PLATFORM_CANDIDATE_PROFILE_VISIBILITY_SETTING_CHANGED_EVENT,
    PLATFORM_EMAIL_SETTING_CHANGED_EVENT,
    PLATFORM_RECRUITER_ALL_CANDIDATES_CHANGED_EVENT,
    PLATFORM_SEEKER_OAUTH_CHANGED_EVENT,
    setCandidateProfileVisibilitySettingEnabled,
    setEmailSendingEnabled,
    setRecruiterAllCandidatesEnabled,
    setSeekerOAuthEnabled,
} from '../services/platformSettingsService';

// Icons
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;
const CopyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>;
const LoginIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>;
const RefreshIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>;
const KeyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-5.5-1a6 6 0 1 1-8.486 8.486A6 6 0 0 1 12.88 2.88z" /><circle cx="8" cy="16" r="2" /></svg>;
const CandidateMetricIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M20 8v6" /><path d="M23 11h-6" /></svg>;
const RecruiterMetricIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 11h18" /></svg>;
const PostingMetricIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h5" /></svg>;
const DatabaseMetricIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" /><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>;
const StorageMetricIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>;
const ApiMetricIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7 8h10" /><path d="M7 12h6" /><path d="M7 16h8" /><rect x="3" y="4" width="18" height="16" rx="3" /></svg>;
const AiRequestMetricIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6" /><path d="M12 22v-3" /><path d="m4.93 4.93 4.24 4.24" /><path d="m14.83 14.83 4.24 4.24" /><path d="M2 12h6" /><path d="M22 12h-3" /><path d="m4.93 19.07 4.24-4.24" /><path d="m14.83 9.17 4.24-4.24" /><circle cx="12" cy="12" r="3.5" /></svg>;
const AiCompletedMetricIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m9 12 2 2 4-4" /></svg>;
const AiIncompleteMetricIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" /></svg>;

type EntityType = 'user' | 'candidate' | 'recruiter' | 'job';
type DebugTab = 'overview' | 'admins' | 'provisioning' | 'exports' | 'candidates' | 'recruiters' | 'jobs' | 'logs' | 'ai_models' | 'bug_reports';
type FactoryKind = 'seekers' | 'jobs' | 'recruiters';
type BatchProgressKind = FactoryKind | 'cv_seekers';
type DialogTone = 'danger' | 'warning' | 'info';
type ExportScope = 'seekers' | 'recruiters' | 'jobs' | 'all';
type ExportFormat = 'json' | 'csv';
type LogCategoryFilter = 'all' | 'edge_function' | 'gemini' | 'job_created' | 'profile_created';
const DEFAULT_AI_REQUEST_LIMIT = 500000;

const mapDebugTab = (tab?: string | null): DebugTab => {
    if (tab === 'admins') return 'ai_models';
    if (tab === 'overview' || tab === 'provisioning' || tab === 'exports' || tab === 'candidates' || tab === 'recruiters' || tab === 'jobs' || tab === 'logs' || tab === 'ai_models' || tab === 'bug_reports') {
        return tab;
    }
    return 'overview';
};

type DeleteDialogState = {
    type: EntityType;
    id: string;
};

type PendingCvDeleteState = {
    record: CandidateCvRecord;
    seekerName: string;
    seekerEmail: string;
};

type ProvisionConflictAccount = {
    id: string;
    role: string;
    email: string;
    fullName: string;
};

type ProvisionConflictState = {
    fileName: string;
    candidateName: string;
    detectedEmail: string;
    conflictingAccounts: ProvisionConflictAccount[];
    replacementEmail: string;
    error: string;
};

type ConfirmDialogState =
    | {
        kind: 'delete';
        tone: DialogTone;
        title: string;
        description: string;
        confirmLabel: string;
        cancelLabel?: string;
        linkedPostings?: { id: string; title: string; detail: string }[];
    }
    | {
        kind: 'recompute_embeddings';
        tone: DialogTone;
        title: string;
        description: string;
        confirmLabel: string;
        cancelLabel?: string;
    };

type NoticeDialogState = {
    tone: DialogTone;
    title: string;
    description: string;
    bullets?: string[];
};

type AdminEditState = {
    id: string;
    email: string;
    fullName: string;
};

// Loading state for individual actions
interface ActionLoadingState {
    createSeekers: boolean;
    createJobs: boolean;
    createRecruiters: boolean;
    createAdmin: boolean;
    createProvisionSeeker: boolean;
    createProvisionSeekersFromCv: boolean;
    createProvisionRecruiter: boolean;
    recomputeAll: boolean;
    localizeCandidates: boolean;
}

const initialLoadingState: ActionLoadingState = {
    createSeekers: false,
    createJobs: false,
    createRecruiters: false,
    createAdmin: false,
    createProvisionSeeker: false,
    createProvisionSeekersFromCv: false,
    createProvisionRecruiter: false,
    recomputeAll: false,
    localizeCandidates: false,
};

const MAX_SEEKER_CV_UPLOADS = 10;

const buildSearchText = (...values: any[]): string => {
    const flatten = (value: any): string[] => {
        if (value === undefined || value === null || value === false) return [];
        if (Array.isArray(value)) return value.flatMap(flatten);
        if (typeof value === 'object') return Object.values(value).flatMap(flatten);
        return [String(value)];
    };

    return flatten(values)
        .join(' ')
        .replace(/_/g, ' ')
        .toLowerCase();
};

const formatReadable = (value?: string | null) => (value || '').replace(/_/g, ' ').trim();

const formatList = (value?: string[] | string | null) => {
    if (!value) return '';
    if (Array.isArray(value)) return value.filter(Boolean).join(', ');
    return String(value);
};

const formatLocation = (location?: { city?: string; country?: string; }) => {
    if (!location) return '';
    return [location.city, location.country?.toUpperCase()].filter(Boolean).join(', ');
};

const getCandidateProfileStrength = (candidate?: CandidateProfile | null) => {
    if (!candidate) return 0;

    const profileChecks = [
        !!(candidate.personal_info?.first_name && candidate.personal_info?.last_name),
        !!candidate.contacts?.email,
        !!candidate.contacts?.phone,
        !!(candidate.residence?.country || candidate.residence?.city),
        !!(candidate.summary_text && candidate.summary_text.length > 10),
        !!(candidate.skills && candidate.skills.length > 0),
        !!(candidate.it_skills && candidate.it_skills.length > 0),
        !!(candidate.soft_skills && candidate.soft_skills.length > 0),
        !!(candidate.experiences && candidate.experiences.length > 0),
        !!(candidate.education && candidate.education.length > 0),
        !!(candidate.languages && candidate.languages.length > 0),
        !!candidate.current_job_function,
        !!candidate.current_seniority_level,
        !!(candidate.preferences?.preferred_locations?.length > 0 || candidate.preferences?.remote),
        !!candidate.ai_refined,
    ];

    const filledCount = profileChecks.filter(Boolean).length;
    return Math.round((filledCount / profileChecks.length) * 100);
};

const getProfileStrengthClasses = (value: number) => {
    if (value < 50) {
        return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300';
    }
    if (value >= 76) {
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
    }
    return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
};

const clampCount = (value: number) => {
    if (!Number.isFinite(value)) return 1;
    return Math.min(50, Math.max(1, Math.floor(value)));
};

const escapeCsv = (value?: string | null) => {
    const stringValue = String(value || '');
    return `"${stringValue.replace(/"/g, '""')}"`;
};

const slugifyProvisionToken = (value?: string | null) =>
    (value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, 24);

const normalizeProvisionEmail = (value?: string | null) => {
    const normalized = (value || '').trim().toLowerCase();
    return normalized && normalized.includes('@') ? normalized : '';
};

const buildProvisionedSeekerIdentity = (
    candidate: Partial<CandidateProfile>,
    file: File,
    index: number
) => {
    const firstName = candidate.personal_info?.first_name?.trim();
    const lastName = candidate.personal_info?.last_name?.trim();
    const cvEmail = normalizeProvisionEmail(candidate.contacts?.email);
    const fallbackName = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || fallbackName || `Debug Seeker ${index + 1}`;
    const baseSlug = slugifyProvisionToken([firstName, lastName].filter(Boolean).join('.')) || slugifyProvisionToken(fallbackName) || 'seeker';
    const uniqueToken = `${Date.now().toString(36)}${(index + 1).toString(36)}${generateUUID().replace(/-/g, '').slice(0, 8)}`;

    return {
        fullName,
        email: cvEmail || `${baseSlug}.${uniqueToken}@example.com`,
        password: `PeakTalent!${uniqueToken.slice(-10)}`,
    };
};

const DebugView: React.FC = () => {
    const { text } = useLanguage();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { startImpersonation, user, refreshProfile } = useAuth();
    const [jobs, setJobs] = useState<JobProfile[]>([]);
    const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [recruiters, setRecruiters] = useState<RecruiterProfile[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [candidateCvs, setCandidateCvs] = useState<CandidateCvRecord[]>([]);
    const [supabaseUsage, setSupabaseUsage] = useState<SupabaseUsageSnapshot | null>(null);
    const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([]);
    const [activityLogsLoading, setActivityLogsLoading] = useState(false);
    const [activityLogsError, setActivityLogsError] = useState<string | null>(null);
    const [logCategoryFilter, setLogCategoryFilter] = useState<LogCategoryFilter>('all');
    const [logActorFilter, setLogActorFilter] = useState('all');
    // Map job_id -> { recruiter_id, recruiter_email, recruiter_name } for showing ownership
    const [jobRecruiterMap, setJobRecruiterMap] = useState<Record<string, { id: string; email: string; name: string }>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<DebugTab>(() => mapDebugTab(searchParams.get('tab')));
    const [searchQuery, setSearchQuery] = useState('');
    const [actionLoading, setActionLoading] = useState<ActionLoadingState>(initialLoadingState);
    const [batchProgress, setBatchProgress] = useState<{ kind: BatchProgressKind; current: number; total: number } | null>(null);
    const [factoryCounts, setFactoryCounts] = useState<Record<FactoryKind, number>>({
        seekers: 5,
        jobs: 5,
        recruiters: 3,
    });
    const [adminForm, setAdminForm] = useState({
        fullName: '',
        email: '',
        password: '',
    });
    const [adminFeedback, setAdminFeedback] = useState<{ error: string; success: string }>({
        error: '',
        success: '',
    });
    const [seekerProvisionForm, setSeekerProvisionForm] = useState({
        fullName: '',
        email: '',
        password: '',
        phone: '',
        currentJobFunction: '',
        currentSeniorityLevel: '',
        city: '',
        country: '',
        summaryText: '',
    });
    const [seekerProvisionCvFiles, setSeekerProvisionCvFiles] = useState<File[]>([]);
    const [recruiterProvisionForm, setRecruiterProvisionForm] = useState({
        fullName: '',
        email: '',
        password: DEFAULT_TEMP_RECRUITER_PASSWORD,
        recruiterRole: '',
        companyName: '',
        sectorText: '',
        city: '',
        country: '',
        address: '',
    });
    const [provisionFeedback, setProvisionFeedback] = useState<{
        seeker: { error: string; success: string };
        recruiter: { error: string; success: string };
    }>({
        seeker: { error: '', success: '' },
        recruiter: { error: '', success: '' },
    });
    const [provisionedAccounts, setProvisionedAccounts] = useState<ProvisionedAccountRecord[]>([]);
    const [exportScope, setExportScope] = useState<ExportScope>('all');
    const [exportFormat, setExportFormat] = useState<ExportFormat>('json');

    // Edit Modal State
    const [editEntity, setEditEntity] = useState<{ type: EntityType; data: any; jsonMode: boolean } | null>(null);
    const [editError, setEditError] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
    const [noticeDialog, setNoticeDialog] = useState<NoticeDialogState | null>(null);
    const [pendingDelete, setPendingDelete] = useState<DeleteDialogState | null>(null);
    const [pendingCvDelete, setPendingCvDelete] = useState<PendingCvDeleteState | null>(null);
    const [confirmError, setConfirmError] = useState<string | null>(null);
    const [isConfirmSubmitting, setIsConfirmSubmitting] = useState(false);
    const [provisionConflict, setProvisionConflict] = useState<ProvisionConflictState | null>(null);
    const [adminEdit, setAdminEdit] = useState<AdminEditState | null>(null);
    const [adminEditFeedback, setAdminEditFeedback] = useState<{ error: string; success: string }>({ error: '', success: '' });
    const [isAdminEditSaving, setIsAdminEditSaving] = useState(false);
    const [cvActionState, setCvActionState] = useState<{ id: string; action: 'download' | 'delete' } | null>(null);
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const [emailSendingEnabled, setEmailSendingEnabledState] = useState(false);
    const [isEmailSettingLoading, setIsEmailSettingLoading] = useState(true);
    const [isEmailSettingSaving, setIsEmailSettingSaving] = useState(false);
    const [emailSettingError, setEmailSettingError] = useState<string | null>(null);
    const [recruiterAllCandidatesEnabled, setRecruiterAllCandidatesEnabledState] = useState(false);
    const [isRecruiterAllCandidatesLoading, setIsRecruiterAllCandidatesLoading] = useState(true);
    const [isRecruiterAllCandidatesSaving, setIsRecruiterAllCandidatesSaving] = useState(false);
    const [recruiterAllCandidatesError, setRecruiterAllCandidatesError] = useState<string | null>(null);
    const [candidateProfileVisibilitySettingEnabled, setCandidateProfileVisibilitySettingEnabledState] = useState(false);
    const [isCandidateProfileVisibilitySettingLoading, setIsCandidateProfileVisibilitySettingLoading] = useState(true);
    const [isCandidateProfileVisibilitySettingSaving, setIsCandidateProfileVisibilitySettingSaving] = useState(false);
    const [candidateProfileVisibilitySettingError, setCandidateProfileVisibilitySettingError] = useState<string | null>(null);
    const [seekerOAuthEnabled, setSeekerOAuthEnabledState] = useState(false);
    const [isSeekerOAuthLoading, setIsSeekerOAuthLoading] = useState(true);
    const [isSeekerOAuthSaving, setIsSeekerOAuthSaving] = useState(false);
    const [seekerOAuthError, setSeekerOAuthError] = useState<string | null>(null);
    
    // Reset Password State
    const [resetPasswordConfirm, setResetPasswordConfirm] = useState<{ userId: string; email: string; userType: 'candidate' | 'recruiter' } | null>(null);
    const [resetPasswordForm, setResetPasswordForm] = useState<{ password: string }>({
        password: 'password123!',
    });
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const [resetPasswordSuccess, setResetPasswordSuccess] = useState<{ email: string; password: string } | null>(null);
    const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
    
    const provisionConflictResolverRef = useRef<((decision: { action: 'cancel' } | { action: 'retry'; email: string }) => void) | null>(null);

    // AI Model settings
    const [modelSettings, setModelSettings] = useState<Record<AITaskKey, string>>(getAllModels);

    useEffect(() => {
        const handler = () => setModelSettings(getAllModels());
        window.addEventListener('ai-model-changed', handler);
        return () => window.removeEventListener('ai-model-changed', handler);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadEmailSetting = async () => {
            setIsEmailSettingLoading(true);
            setEmailSettingError(null);
            try {
                const enabled = await getEmailSendingEnabled({ force: true });
                if (!cancelled) {
                    setEmailSendingEnabledState(enabled);
                }
            } catch (error: any) {
                if (!cancelled) {
                    setEmailSendingEnabledState(false);
                    setEmailSettingError(error?.message || text('Unable to load the email setting.', 'Impossibile caricare l’impostazione email.'));
                }
            } finally {
                if (!cancelled) {
                    setIsEmailSettingLoading(false);
                }
            }
        };

        const handleEmailSettingChanged = (event: Event) => {
            const nextValue = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
            if (!cancelled && typeof nextValue === 'boolean') {
                setEmailSendingEnabledState(nextValue);
                setEmailSettingError(null);
            }
        };

        loadEmailSetting();
        window.addEventListener(PLATFORM_EMAIL_SETTING_CHANGED_EVENT, handleEmailSettingChanged as EventListener);

        return () => {
            cancelled = true;
            window.removeEventListener(PLATFORM_EMAIL_SETTING_CHANGED_EVENT, handleEmailSettingChanged as EventListener);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadRecruiterAllCandidatesSetting = async () => {
            setIsRecruiterAllCandidatesLoading(true);
            setRecruiterAllCandidatesError(null);
            try {
                const enabled = await getRecruiterAllCandidatesEnabled({ force: true });
                if (!cancelled) {
                    setRecruiterAllCandidatesEnabledState(enabled);
                }
            } catch (error: any) {
                if (!cancelled) {
                    setRecruiterAllCandidatesEnabledState(false);
                    setRecruiterAllCandidatesError(error?.message || text('Unable to load the recruiter candidate visibility setting.', 'Impossibile caricare l’impostazione visibilità candidati recruiter.'));
                }
            } finally {
                if (!cancelled) {
                    setIsRecruiterAllCandidatesLoading(false);
                }
            }
        };

        const handleRecruiterAllCandidatesSettingChanged = (event: Event) => {
            const nextValue = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
            if (!cancelled && typeof nextValue === 'boolean') {
                setRecruiterAllCandidatesEnabledState(nextValue);
                setRecruiterAllCandidatesError(null);
            }
        };

        loadRecruiterAllCandidatesSetting();
        window.addEventListener(PLATFORM_RECRUITER_ALL_CANDIDATES_CHANGED_EVENT, handleRecruiterAllCandidatesSettingChanged as EventListener);

        return () => {
            cancelled = true;
            window.removeEventListener(PLATFORM_RECRUITER_ALL_CANDIDATES_CHANGED_EVENT, handleRecruiterAllCandidatesSettingChanged as EventListener);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadCandidateProfileVisibilitySetting = async () => {
            setIsCandidateProfileVisibilitySettingLoading(true);
            setCandidateProfileVisibilitySettingError(null);
            try {
                const enabled = await getCandidateProfileVisibilitySettingEnabled({ force: true });
                if (!cancelled) {
                    setCandidateProfileVisibilitySettingEnabledState(enabled);
                }
            } catch (error: any) {
                if (!cancelled) {
                    setCandidateProfileVisibilitySettingEnabledState(false);
                    setCandidateProfileVisibilitySettingError(error?.message || text('Unable to load the candidate profile visibility setting.', 'Impossibile caricare l’impostazione visibilità profilo candidato.'));
                }
            } finally {
                if (!cancelled) {
                    setIsCandidateProfileVisibilitySettingLoading(false);
                }
            }
        };

        const handleCandidateProfileVisibilitySettingChanged = (event: Event) => {
            const nextValue = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
            if (!cancelled && typeof nextValue === 'boolean') {
                setCandidateProfileVisibilitySettingEnabledState(nextValue);
                setCandidateProfileVisibilitySettingError(null);
            }
        };

        loadCandidateProfileVisibilitySetting();
        window.addEventListener(PLATFORM_CANDIDATE_PROFILE_VISIBILITY_SETTING_CHANGED_EVENT, handleCandidateProfileVisibilitySettingChanged as EventListener);

        return () => {
            cancelled = true;
            window.removeEventListener(PLATFORM_CANDIDATE_PROFILE_VISIBILITY_SETTING_CHANGED_EVENT, handleCandidateProfileVisibilitySettingChanged as EventListener);
        };
    }, [text]);

    useEffect(() => {
        let cancelled = false;

        const loadSeekerOAuthSetting = async () => {
            setIsSeekerOAuthLoading(true);
            setSeekerOAuthError(null);
            try {
                const enabled = await getSeekerOAuthEnabled({ force: true });
                if (!cancelled) {
                    setSeekerOAuthEnabledState(enabled);
                }
            } catch (error: any) {
                if (!cancelled) {
                    setSeekerOAuthEnabledState(false);
                    setSeekerOAuthError(error?.message || text('Unable to load the Google/Apple access setting.', 'Impossibile caricare l’impostazione accesso Google/Apple.'));
                }
            } finally {
                if (!cancelled) {
                    setIsSeekerOAuthLoading(false);
                }
            }
        };

        const handleSeekerOAuthSettingChanged = (event: Event) => {
            const nextValue = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
            if (!cancelled && typeof nextValue === 'boolean') {
                setSeekerOAuthEnabledState(nextValue);
                setSeekerOAuthError(null);
            }
        };

        loadSeekerOAuthSetting();
        window.addEventListener(PLATFORM_SEEKER_OAUTH_CHANGED_EVENT, handleSeekerOAuthSettingChanged as EventListener);

        return () => {
            cancelled = true;
            window.removeEventListener(PLATFORM_SEEKER_OAUTH_CHANGED_EVENT, handleSeekerOAuthSettingChanged as EventListener);
        };
    }, [text]);

    useEffect(() => {
        setSearchQuery('');
    }, [activeTab]);

    useEffect(() => {
        setActiveTab(mapDebugTab(searchParams.get('tab')));
    }, [searchParams]);

    useEffect(() => {
        const handleAdminMobileNavToggle = () => {
            setIsMobileNavOpen((current) => !current);
        };

        window.addEventListener('admin-dashboard-mobile-nav-toggle', handleAdminMobileNavToggle);
        return () => window.removeEventListener('admin-dashboard-mobile-nav-toggle', handleAdminMobileNavToggle);
    }, []);

    useEffect(() => {
        if (!isMobileNavOpen) {
            document.body.style.overflow = '';
            return;
        }

        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setIsMobileNavOpen(false);
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('resize', handleResize);

        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('resize', handleResize);
        };
    }, [isMobileNavOpen]);

    const showToast = useCallback((_msg: string) => {
        // Toasts are intentionally disabled for the current admin console pass.
    }, []);

    const copyToClipboard = useCallback((text: string) => {
        navigator.clipboard.writeText(text).then(() => showToast(`Copied: ${text}`));
    }, [showToast]);

    const handleToggleEmailSending = useCallback(async () => {
        if (isEmailSettingLoading || isEmailSettingSaving) return;

        const nextValue = !emailSendingEnabled;
        setEmailSendingEnabledState(nextValue);
        setIsEmailSettingSaving(true);
        setEmailSettingError(null);

        try {
            await setEmailSendingEnabled(nextValue);
        } catch (error: any) {
            setEmailSendingEnabledState(!nextValue);
            setEmailSettingError(
                error?.message ||
                text('Unable to save the email setting.', 'Impossibile salvare l’impostazione email.')
            );
        } finally {
            setIsEmailSettingSaving(false);
        }
    }, [emailSendingEnabled, isEmailSettingLoading, isEmailSettingSaving, text]);

    const handleToggleRecruiterAllCandidates = useCallback(async () => {
        if (isRecruiterAllCandidatesLoading || isRecruiterAllCandidatesSaving) return;

        const nextValue = !recruiterAllCandidatesEnabled;
        setRecruiterAllCandidatesEnabledState(nextValue);
        setIsRecruiterAllCandidatesSaving(true);
        setRecruiterAllCandidatesError(null);

        try {
            await setRecruiterAllCandidatesEnabled(nextValue);
        } catch (error: any) {
            setRecruiterAllCandidatesEnabledState(!nextValue);
            setRecruiterAllCandidatesError(
                error?.message ||
                text('Unable to save the recruiter candidate visibility setting.', 'Impossibile salvare l’impostazione visibilità candidati recruiter.')
            );
        } finally {
            setIsRecruiterAllCandidatesSaving(false);
        }
    }, [recruiterAllCandidatesEnabled, isRecruiterAllCandidatesLoading, isRecruiterAllCandidatesSaving, text]);

    const handleToggleCandidateProfileVisibilitySetting = useCallback(async () => {
        if (isCandidateProfileVisibilitySettingLoading || isCandidateProfileVisibilitySettingSaving) return;

        const nextValue = !candidateProfileVisibilitySettingEnabled;
        setCandidateProfileVisibilitySettingEnabledState(nextValue);
        setIsCandidateProfileVisibilitySettingSaving(true);
        setCandidateProfileVisibilitySettingError(null);

        try {
            await setCandidateProfileVisibilitySettingEnabled(nextValue);
        } catch (error: any) {
            setCandidateProfileVisibilitySettingEnabledState(!nextValue);
            setCandidateProfileVisibilitySettingError(
                error?.message ||
                text('Unable to save the candidate profile visibility setting.', 'Impossibile salvare l’impostazione visibilità profilo candidato.')
            );
        } finally {
            setIsCandidateProfileVisibilitySettingSaving(false);
        }
    }, [candidateProfileVisibilitySettingEnabled, isCandidateProfileVisibilitySettingLoading, isCandidateProfileVisibilitySettingSaving, text]);

    const handleToggleSeekerOAuth = useCallback(async () => {
        if (isSeekerOAuthLoading || isSeekerOAuthSaving) return;

        const nextValue = !seekerOAuthEnabled;
        setSeekerOAuthEnabledState(nextValue);
        setIsSeekerOAuthSaving(true);
        setSeekerOAuthError(null);

        try {
            await setSeekerOAuthEnabled(nextValue);
        } catch (error: any) {
            setSeekerOAuthEnabledState(!nextValue);
            setSeekerOAuthError(
                error?.message ||
                text('Unable to save the Google/Apple access setting.', 'Impossibile salvare l’impostazione accesso Google/Apple.')
            );
        } finally {
            setIsSeekerOAuthSaving(false);
        }
    }, [seekerOAuthEnabled, isSeekerOAuthLoading, isSeekerOAuthSaving, text]);

    const handleSelectTab = useCallback((tab: DebugTab) => {
        const normalizedTab = tab === 'admins' ? 'ai_models' : tab;
        setActiveTab(normalizedTab);
        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.set('tab', normalizedTab);
        setSearchParams(nextSearchParams, { replace: true });
        setIsMobileNavOpen(false);
    }, [searchParams, setSearchParams]);

    const isDuplicateProvisionError = useCallback((error: any) => {
        const message = String(error?.message || '').toLowerCase();
        return (
            message.includes('already exists') ||
            message.includes('already registered') ||
            message.includes('duplicate key')
        );
    }, []);

    const getConflictAccountsForEmail = useCallback((email: string): ProvisionConflictAccount[] => {
        const normalized = normalizeProvisionEmail(email);
        if (!normalized) return [];

        return users
            .filter((entry) => normalizeProvisionEmail(entry.email) === normalized)
            .map((entry) => {
                const linkedCandidate = candidates.find((candidate) =>
                    candidate.id === entry.profileId ||
                    normalizeProvisionEmail(candidate.contacts?.email) === normalized
                );
                const linkedRecruiter = recruiters.find((recruiter) =>
                    recruiter.id === entry.profileId ||
                    normalizeProvisionEmail(recruiter.email) === normalized
                );

                const fullName =
                    entry.fullName ||
                    formatCandidateName(linkedCandidate) ||
                    formatRecruiterName(linkedRecruiter) ||
                    (entry.role === 'admin'
                        ? text('System Administrator', 'Amministratore di sistema')
                        : text('Name unavailable', 'Nome non disponibile'));

                return {
                    id: entry.profileId,
                    role: entry.role,
                    email: entry.email,
                    fullName,
                };
            });
    }, [candidates, recruiters, text, users]);

    const resolveProvisionConflict = useCallback((decision: { action: 'cancel' } | { action: 'retry'; email: string }) => {
        const resolver = provisionConflictResolverRef.current;
        provisionConflictResolverRef.current = null;
        setProvisionConflict(null);
        resolver?.(decision);
    }, []);

    const promptProvisionConflictResolution = useCallback((input: {
        fileName: string;
        candidateName: string;
        detectedEmail: string;
    }) => {
        const conflictingAccounts = getConflictAccountsForEmail(input.detectedEmail);
        return new Promise<{ action: 'cancel' } | { action: 'retry'; email: string }>((resolve) => {
            provisionConflictResolverRef.current = resolve;
            setProvisionConflict({
                fileName: input.fileName,
                candidateName: input.candidateName,
                detectedEmail: input.detectedEmail,
                conflictingAccounts,
                replacementEmail: '',
                error: '',
            });
        });
    }, [getConflictAccountsForEmail]);

    const triggerDownload = useCallback((filename: string, mimeType: string, content: string) => {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, []);

    const loadActivityLogs = useCallback(async () => {
        setActivityLogsLoading(true);
        setActivityLogsError(null);
        try {
            const logs = await listActivityLogs(150);
            setActivityLogs(logs);
        } catch (error: any) {
            const message = error?.message || text('Unable to load logs right now.', 'Impossibile caricare i log in questo momento.');
            setActivityLogsError(message);
            throw error;
        } finally {
            setActivityLogsLoading(false);
        }
    }, [text]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Try fetching via RPC first (bypasses RLS for full view)
            const { data, error } = await supabase.rpc('get_debug_data');

            if (!error && data) {
                const rawUsers = (data as any).users || [];
                setUsers(rawUsers.map((u: any) => ({
                    email: u.email,
                    role: u.role,
                    profileId: u.id,
                    password: '',
                    fullName: u.full_name || undefined,
                })));
                setCandidates(((data as any).candidates || []).map((c: any) => c.content));
                setJobs(((data as any).jobs || []).map((j: any) => j.content));
                const rawRecruiters = ((data as any).recruiters || []).map((r: any) => r.content);
                setRecruiters(rawRecruiters);

                // Build job -> recruiter ownership map
                const rawJobs = (data as any).jobs || [];
                const recMap: Record<string, { id: string; email: string; name: string }> = {};
                for (const j of rawJobs) {
                    if (j.recruiter_id) {
                        const rec = rawRecruiters.find((r: any) => r.id === j.recruiter_id);
                        const prof = rawUsers.find((u: any) => u.id === j.recruiter_id);
                        recMap[j.content?.id || j.id] = {
                            id: j.recruiter_id,
                            email: prof?.email || rec?.email || 'unknown',
                            name: rec ? (formatRecruiterName(rec) || 'Unknown') : (normalizeFullName(prof?.full_name) || 'Unknown'),
                        };
                    }
                }
                setJobRecruiterMap(recMap);
            } else {
                console.warn("Fast fetch failed, falling back to standard API (may be limited by RLS)", error);
                const [jobData, candidateData, userData, recruiterData] = await Promise.all([
                    getAllJobs(),
                    getAllCandidates(),
                    getAllUsers(),
                    getAllRecruiters(),
                ]);
                setJobs(jobData);
                setCandidates(candidateData);
                setUsers(userData);
                setRecruiters(recruiterData);
            }

            const [cvData, usageData, notificationData] = await Promise.all([
                getAllCandidateCvRecords().catch((error) => {
                    console.warn('Could not load candidate CV records for admin console:', error);
                    return [];
                }),
                getSupabaseUsageSnapshot().catch((error) => {
                    console.warn('Could not load Supabase usage for admin console:', error);
                    return null;
                }),
                (async () => {
                    try {
                        const { data, error } = await supabase
                            .from('notifications')
                            .select('*')
                            .eq('type', 'invitation_received');

                        if (error) {
                            console.warn('Could not load admin notifications for AI metrics:', error);
                            return [];
                        }

                        return (data || []) as Notification[];
                    } catch (error) {
                        console.warn('Could not load admin notifications for AI metrics:', error);
                        return [];
                    }
                })(),
            ]);
            setCandidateCvs(cvData);
            setSupabaseUsage(usageData);
            setNotifications(notificationData);
        } catch (err) {
            console.error("Failed to fetch data", err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void withRetry(() => fetchData(), {
            attempts: 3,
            delaysMs: [0, 900, 2200],
            onRetry: (error, attempt) => {
                console.warn(`Retrying admin dashboard load after failed attempt ${attempt}:`, error);
            },
        }).catch((error) => {
            console.error('Admin dashboard data could not be fully loaded after retries:', error);
        });
    }, []);

    useEffect(() => {
        if (activeTab !== 'logs' && activeTab !== 'overview') return;

        void withRetry(() => loadActivityLogs(), {
            attempts: 2,
            delaysMs: [0, 900],
            onRetry: (error, attempt) => {
                console.warn(`Retrying admin logs load after failed attempt ${attempt}:`, error);
            },
        }).catch((error) => {
            console.error('Admin activity logs could not be fully loaded after retries:', error);
        });
    }, [activeTab, loadActivityLogs]);

    const handleOpenEdit = (type: EntityType, data: object) => {
        setEditEntity({ type, data, jsonMode: false });
        setEditError(null);
    }

    const handleOpenAdminEdit = (account: { id: string; email: string; fullName: string }) => {
        setAdminEdit({
            id: account.id,
            email: account.email,
            fullName: account.fullName || 'System Administrator',
        });
        setAdminEditFeedback({ error: '', success: '' });
    };

    const handleSaveAdminEdit = async () => {
        if (!adminEdit) return;

        setIsAdminEditSaving(true);
        setAdminEditFeedback({ error: '', success: '' });
        try {
            await updateSystemAdminProfile(adminEdit.id, {
                email: adminEdit.email,
                fullName: adminEdit.fullName,
            });

            if (user?.id === adminEdit.id) {
                await refreshProfile();
            }

            setAdminEditFeedback({
                error: '',
                success: 'Admin profile updated successfully.',
            });
            await fetchData();
        } catch (error: any) {
            console.error('Failed to update admin profile from admin console:', error);
            setAdminEditFeedback({
                error: error.message || 'Unable to update the admin profile.',
                success: '',
            });
        } finally {
            setIsAdminEditSaving(false);
        }
    };

    const persistDebugEdit = async (type: EntityType, sourceData: any) => {
        let updatedData = sourceData;
        const id = updatedData.id || updatedData.profileId || updatedData.email;
        const validTypes: EntityType[] = ['candidate', 'job', 'recruiter', 'user'];

        if (!validTypes.includes(type)) return;

        if ((type === 'candidate' || type === 'job') && !updatedData.embedding_vector) {
            updatedData.embedding_vector = updatedData.embedding_vector || null;
        }

        if (type === 'user') {
            updatedData = {
                id,
                email: updatedData.email,
                role: updatedData.role,
                full_name: updatedData.full_name || updatedData.fullName || null,
            };
        }

        const { error } = await supabase.rpc('update_debug_entity', {
            p_type: type,
            p_id: id,
            p_content: updatedData
        });

        if (error) {
            if (error.message?.includes("function update_debug_entity") || error.code === "42883") {
                throw new Error("RPC Missing. Please run 'debug_rpc.sql' in Supabase SQL Editor.");
            }
            throw error;
        }

        if (type === 'recruiter') {
            const recruiterFullName = buildNormalizedFullName(updatedData.first_name, updatedData.last_name);
            const { error: profileSyncError } = await supabase.rpc('update_debug_entity', {
                p_type: 'user',
                p_id: id,
                p_content: {
                    id,
                    email: updatedData.email,
                    role: 'recruiter',
                    full_name: recruiterFullName || null,
                }
            });

            if (profileSyncError) {
                console.warn('Recruiter profile content updated, but linked auth profile could not be fully synchronized:', profileSyncError);
            }
        }

        if (type === 'candidate') {
            const candidateFullName = buildNormalizedFullName(updatedData.personal_info?.first_name, updatedData.personal_info?.last_name);
            const { error: profileSyncError } = await supabase.rpc('update_debug_entity', {
                p_type: 'user',
                p_id: id,
                p_content: {
                    id,
                    email: updatedData.contacts?.email,
                    role: 'seeker',
                    full_name: candidateFullName || null,
                }
            });

            if (profileSyncError) {
                console.warn('Candidate profile content updated, but linked auth profile could not be fully synchronized:', profileSyncError);
            }
        }
    };

    const handleSaveEdit = async (updatedData: any) => {
        setEditError(null);
        setIsUpdating(true);
        try {
            await persistDebugEdit(editEntity!.type, updatedData);

            setEditEntity(null);
            await fetchData();
            showToast('Entity updated successfully');
        } catch (e: any) {
            setEditError(e.message || "Update Failed");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleSaveRecruiterEdit = async (profile: RecruiterProfile) => {
        setIsUpdating(true);
        try {
            await persistDebugEdit('recruiter', profile);
            setEditEntity(null);
            await fetchData();
            showToast('Entity updated successfully');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleLocalizeExistingCandidates = async () => {
        if (actionLoading.localizeCandidates || anyActionLoading) return;

        setActionLoading((current) => ({ ...current, localizeCandidates: true }));
        try {
            let updated = 0;
            const errors: string[] = [];

            for (const candidate of candidates) {
                try {
                    const before = JSON.stringify({
                        summary_text_it: candidate.summary_text_it,
                        summary_text_en: candidate.summary_text_en,
                        experiences: (candidate.experiences || []).map((exp) => ({
                            description_it: exp.description_it,
                            description_en: exp.description_en,
                        })),
                        education: (candidate.education || []).map((edu) => ({
                            description_it: edu.description_it,
                            description_en: edu.description_en,
                        })),
                    });
                    const localizedCandidate = await ensureLocalizedCandidateContent(candidate);
                    const after = JSON.stringify({
                        summary_text_it: localizedCandidate.summary_text_it,
                        summary_text_en: localizedCandidate.summary_text_en,
                        experiences: (localizedCandidate.experiences || []).map((exp) => ({
                            description_it: exp.description_it,
                            description_en: exp.description_en,
                        })),
                        education: (localizedCandidate.education || []).map((edu) => ({
                            description_it: edu.description_it,
                            description_en: edu.description_en,
                        })),
                    });

                    if (before !== after) {
                        await persistDebugEdit('candidate', localizedCandidate);
                        updated++;
                    }
                } catch (error: any) {
                    errors.push(`${formatCandidateName(candidate) || candidate.contacts?.email || candidate.id}: ${error?.message || String(error)}`);
                }
            }

            await fetchData();
            if (errors.length) {
                setNoticeDialog({
                    tone: 'warning',
                    title: text('Candidate localization completed with issues', 'Localizzazione candidati completata con problemi'),
                    description: text(
                        `Updated ${updated} candidates. ${errors.length} candidates could not be localized.`,
                        `Aggiornati ${updated} candidati. ${errors.length} candidati non sono stati localizzati.`
                    ),
                    bullets: errors.slice(0, 4),
                });
            } else {
                setNoticeDialog({
                    tone: 'info',
                    title: text('Candidate localization completed', 'Localizzazione candidati completata'),
                    description: text(
                        `Updated ${updated} candidate profiles. Existing embeddings were not changed.`,
                        `Aggiornati ${updated} profili candidato. Gli embedding esistenti non sono stati modificati.`
                    ),
                });
            }
            showToast(text('Candidate translations updated', 'Traduzioni candidati aggiornate'));
        } catch (error: any) {
            setNoticeDialog({
                tone: 'danger',
                title: text('Candidate localization failed', 'Localizzazione candidati non riuscita'),
                description: error?.message || text('The admin console could not localize existing candidates.', 'La console admin non è riuscita a localizzare i candidati esistenti.'),
            });
        } finally {
            setActionLoading((current) => ({ ...current, localizeCandidates: false }));
        }
    };

    const deleteDebugEntity = async (type: EntityType, id: string) => {
        const { data, error } = await supabase.rpc('delete_debug_entity', {
            p_type: type,
            p_id: id
        });

        if (error) {
            if (error.message?.includes("function delete_debug_entity") || error.code === "42883") {
                throw new Error("RPC Missing. Please run 'debug_rpc.sql' in Supabase SQL Editor.");
            }
            throw error;
        }

        if (data && (data as any).status === 'error') {
            throw new Error("DB Error: " + (data as any).message);
        }
    };

    const deleteLinkedUserAccount = async (profileId?: string) => {
        if (!profileId) return;

        try {
            await deleteDebugEntity('user', profileId);
        } catch (error: any) {
            const message = (error?.message || '').toLowerCase();
            if (message.includes('not found') || message.includes('no rows') || message.includes('no user')) {
                return;
            }
            throw error;
        }
    };

    const getLinkedPostingRows = useCallback(async (recruiterId: string) => {
        const localRows = jobs
            .filter((job) => jobRecruiterMap[job.id]?.id === recruiterId)
            .map((job) => ({
                id: job.id,
                title: job.title || 'Untitled posting',
                detail: [job.company_name, formatLocation(job.constraints?.location)].filter(Boolean).join(' • ') || 'Posting linked to this recruiter',
            }));

        const seen = new Set(localRows.map((job) => job.id));

        const { data: remoteJobs, error } = await supabase
            .from('jobs')
            .select('id, content')
            .eq('recruiter_id', recruiterId);

        if (error) {
            console.warn('Unable to load full linked posting list for recruiter delete:', error);
            return localRows;
        }

        const mergedRows = [...localRows];
        for (const row of remoteJobs || []) {
            if (!row?.id || seen.has(row.id)) continue;
            const content = row.content as Partial<JobProfile> | null;
            mergedRows.push({
                id: row.id,
                title: content?.title || 'Untitled posting',
                detail: [content?.company_name, formatLocation(content?.constraints?.location)].filter(Boolean).join(' • ') || 'Posting linked to this recruiter',
            });
        }

        return mergedRows.sort((left, right) => left.title.localeCompare(right.title));
    }, [jobRecruiterMap, jobs]);

    const deleteJobCascade = async (jobId: string) => {
        const { data, error } = await supabase.rpc('admin_delete_job', { p_job_id: jobId });
        const message = `${error?.message || ''} ${error?.details || ''}`.trim();
        const isMissingFunction = Boolean(error && (error.code === '42883' || message.includes('admin_delete_job')));

        if (!error) {
            if (data === false) {
                throw new Error('Admin job delete RPC returned false.');
            }
            return;
        }

        try {
            await deleteJob(jobId);
        } catch (fallbackError: any) {
            if (isMissingFunction) {
                throw new Error('Deleting postings with linked applications requires the admin job delete RPC. Run supabase/admin_delete_job.sql in Supabase SQL Editor.');
            }
            throw fallbackError;
        }
    };

    const deleteCandidateCascade = async (candidateId: string) => {
        const candidate = candidates.find((entry) => entry.id === candidateId);
        const linkedUser = candidate?.contacts?.email
            ? users.find((user) => user.email.toLowerCase() === candidate.contacts.email.toLowerCase())
            : users.find((user) => user.profileId === candidateId);

        try {
            await deleteCandidateCv({
                id: candidateId,
                email: candidate?.contacts?.email,
            });
        } catch (cvError) {
            console.warn('Could not remove stored CV while deleting candidate:', cvError);
        }

        await deleteDebugEntity('candidate', candidateId);
        await deleteLinkedUserAccount(linkedUser?.profileId);
    };

    const isMissingAdminDeleteJobRpcError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error || '');
        return message.includes('admin job delete RPC');
    };

    const deleteRecruiterCascade = async (recruiterId: string) => {
        const recruiter = recruiters.find((entry) => entry.id === recruiterId);
        const linkedUser = recruiter?.email
            ? users.find((user) => user.profileId === recruiterId || user.email.toLowerCase() === recruiter.email.toLowerCase())
            : users.find((user) => user.profileId === recruiterId);

        const ownedJobIds = new Set<string>(
            jobs
                .filter((job) => jobRecruiterMap[job.id]?.id === recruiterId)
                .map((job) => job.id)
        );

        const { data: remoteJobs, error } = await supabase
            .from('jobs')
            .select('id')
            .eq('recruiter_id', recruiterId);

        if (error) {
            console.warn('Unable to verify recruiter ownership before delete:', error);
        } else {
            for (const job of remoteJobs || []) {
                if (typeof job?.id === 'string') {
                    ownedJobIds.add(job.id);
                }
            }
        }

        for (const jobId of ownedJobIds) {
            try {
                await deleteJobCascade(jobId);
            } catch (error) {
                if (isMissingAdminDeleteJobRpcError(error)) {
                    const job = jobs.find((entry) => entry.id === jobId);
                    const jobLabel = job?.title || 'a linked posting';
                    throw new Error(`This recruiter cannot be deleted because ${jobLabel} has linked applications, and the admin job delete RPC is not installed. Run supabase/admin_delete_job.sql in Supabase SQL Editor.`);
                }
                throw error;
            }
        }

        await deleteDebugEntity('recruiter', recruiterId);
        await deleteLinkedUserAccount(linkedUser?.profileId);
        return ownedJobIds.size;
    };

    const executeDelete = async (type: EntityType, id: string) => {
        const account = users.find((entry) => entry.profileId === id);
        const accountRecruiter = account?.role === 'recruiter'
            ? recruiters.find((entry) => entry.id === account.profileId || entry.email?.toLowerCase() === account.email.toLowerCase())
            : undefined;
        const accountCandidate = account?.role === 'seeker'
            ? candidates.find((entry) => entry.id === account.profileId || entry.contacts?.email?.toLowerCase() === account.email.toLowerCase())
            : undefined;

        let successMessage = `${type} deleted successfully`;

        if (type === 'candidate') {
            await deleteCandidateCascade(id);
            successMessage = 'Seeker deleted successfully';
        } else if (type === 'recruiter') {
            const deletedJobs = await deleteRecruiterCascade(id);
            successMessage = deletedJobs > 0
                ? `Recruiter deleted with ${deletedJobs} linked posting${deletedJobs === 1 ? '' : 's'}`
                : 'Recruiter deleted successfully';
        } else if (type === 'user' && account?.role === 'recruiter' && accountRecruiter) {
            const deletedJobs = await deleteRecruiterCascade(accountRecruiter.id);
            successMessage = deletedJobs > 0
                ? `Recruiter account deleted with ${deletedJobs} linked posting${deletedJobs === 1 ? '' : 's'}`
                : 'Recruiter account deleted successfully';
        } else if (type === 'user' && account?.role === 'seeker' && accountCandidate) {
            await deleteCandidateCascade(accountCandidate.id);
            successMessage = 'Seeker account deleted successfully';
        } else if (type === 'job') {
            await deleteJobCascade(id);
            successMessage = 'Posting deleted successfully';
        } else {
            await deleteDebugEntity(type, id);
            if (type === 'user' && account?.role === 'admin') {
                successMessage = 'Admin account deleted successfully';
            }
        }

        await fetchData();
        showToast(successMessage);
    };

    const handleDelete = async (type: EntityType, id: string) => {
        const recruiter = recruiters.find((entry) => entry.id === id);
        const candidate = candidates.find((entry) => entry.id === id);
        const account = users.find((entry) => entry.profileId === id);
        const accountRecruiter = account?.role === 'recruiter'
            ? recruiters.find((entry) => entry.id === account.profileId || entry.email?.toLowerCase() === account.email.toLowerCase())
            : undefined;
        const recruiterId = type === 'recruiter' ? id : accountRecruiter?.id;

        const entityLabel =
            type === 'job'
                ? jobs.find((entry) => entry.id === id)?.title || text('this posting', 'questo posting')
                : type === 'candidate'
                    ? formatCandidateName(candidate) || candidate?.contacts?.email || text('this seeker', 'questo candidato')
                    : type === 'recruiter'
                        ? formatRecruiterName(recruiter) || recruiter?.email || text('this recruiter', 'questo recruiter')
                        : account?.email || text('this account', 'questo account');

        const linkedPostings = recruiterId ? await getLinkedPostingRows(recruiterId) : [];
        const description = type === 'job'
            ? text(
                `Delete ${entityLabel}? This will permanently remove the posting and every application or invitation attached to it.`,
                `Eliminare ${entityLabel}? Questo rimuoverà definitivamente il posting e tutte le candidature o invitation collegate.`
            )
            : linkedPostings.length > 0
                ? text(
                    `Delete ${entityLabel}? This recruiter owns ${linkedPostings.length} posting${linkedPostings.length === 1 ? '' : 's'} and they will be removed together with the recruiter.`,
                    `Eliminare ${entityLabel}? Questo recruiter possiede ${linkedPostings.length} posting${linkedPostings.length === 1 ? '' : ' diversi'} e verranno rimossi insieme al recruiter.`
                )
                : text(
                    `Delete ${entityLabel}? This action cannot be undone.`,
                    `Eliminare ${entityLabel}? Questa azione non può essere annullata.`
                );

        setPendingDelete({
            type,
            id,
        });
        setConfirmError(null);
        setConfirmDialog({
            kind: 'delete',
            tone: 'danger',
            title: type === 'job' ? text('Delete posting', 'Elimina posting') : text('Confirm deletion', 'Conferma eliminazione'),
            description,
            confirmLabel: linkedPostings.length > 0
                ? text('Delete recruiter and postings', 'Elimina recruiter e posting')
                : text('Delete permanently', 'Elimina definitivamente'),
            cancelLabel: text('Cancel', 'Annulla'),
            linkedPostings,
        });
    };

    const handleResetPasswordClick = (userId: string, email: string, userType: 'candidate' | 'recruiter') => {
        setResetPasswordConfirm({ userId, email, userType });
        setResetPasswordError(null);
        setResetPasswordForm({
            password: 'password123!',
        });
    };

    const handleResetPasswordConfirm = async () => {
        if (!resetPasswordConfirm) return;

        setIsResettingPassword(true);
        setResetPasswordError(null);

        try {
            const passwordToSet = resetPasswordForm.password.trim() || 'password123!';

            await resetUserPassword(resetPasswordConfirm.userId, passwordToSet);
            await markUserMustChangePassword(resetPasswordConfirm.userId, resetPasswordConfirm.userType, true);

            setResetPasswordSuccess({
                email: resetPasswordConfirm.email,
                password: passwordToSet,
            });
            setResetPasswordConfirm(null);
            
            // Refresh data to show updated state
            await fetchData();
        } catch (error: any) {
            setResetPasswordError(error?.message || text('Failed to reset password', 'Impossibile resettare la password'));
        } finally {
            setIsResettingPassword(false);
        }
    };

    const runRecomputeAllEmbeddings = async () => {
        setActionLoading(s => ({ ...s, recomputeAll: true }));
        try {
            // Pre-flight: test that the embedding API is reachable before processing all profiles
            let testVec: number[] = [];
            let apiError: string | null = null;
            try {
                testVec = await getEmbedding('api connectivity test');
            } catch (e: any) {
                apiError = e?.message || String(e);
            }
            if (!testVec.length) {
                const keyPresent = hasGeminiApiKey();
                const msg = apiError
                    ? text(`Gemini API error: ${apiError}`, `Errore API Gemini: ${apiError}`)
                    : keyPresent
                        ? text(
                            'Gemini API returned an empty vector. The key may be invalid, quota-exceeded, or the model is unavailable.',
                            'Le API Gemini hanno restituito un vettore vuoto. La chiave potrebbe essere non valida, con quota esaurita oppure il modello potrebbe non essere disponibile.'
                        )
                        : text(
                            'VITE_GEMINI_API_KEY is not set in the Vite bundle. Add it to .env.local and restart the dev server.',
                            'VITE_GEMINI_API_KEY non è impostata nel bundle Vite. Aggiungila a .env.local e riavvia il dev server.'
                        );

                setNoticeDialog({
                    tone: 'warning',
                    title: text('Cannot generate embeddings', 'Impossibile generare gli embedding'),
                    description: msg,
                });
                return;
            }

            let processed = 0;
            const errors: string[] = [];

            const buildCanonicalEmbeddingText = (profile: any, type: 'candidate' | 'job') => {
                return type === 'candidate'
                    ? buildCandidateCanonicalText(profile as CandidateProfile)
                    : buildJobCanonicalText(profile as JobProfile);
            };

            const hasStoredVector = (raw: any): boolean => {
                if (!raw) return false;
                if (Array.isArray(raw)) return raw.length > 0;
                if (typeof raw === 'string') {
                    const trimmed = raw.trim();
                    return trimmed.startsWith('[') && trimmed.length > 2;
                }
                return false;
            };

            const persistEmbeddingWithVerification = async (
                enriched: any,
                type: 'candidate' | 'job'
            ): Promise<void> => {
                const table = type === 'candidate' ? 'candidates' : 'jobs';
                let usedRpcFallback = false;
                const persistViaRpc = async () => {
                    usedRpcFallback = true;
                    const { data: rpcData, error: rpcError } = await supabase.rpc('update_debug_entity', {
                        p_type: type,
                        p_id: enriched.id,
                        p_content: enriched
                    });
                    if (rpcError) throw rpcError;
                    if ((rpcData as any)?.status === 'error') {
                        throw new Error((rpcData as any).message || 'SQL error inside update_debug_entity');
                    }

                    // RPC updates the `content` JSON column, but potentially not the `embedding` pgvector column.
                    // We must do a direct update for the vector.
                    const { error: vectorError } = await supabase
                        .from(table)
                        .update({ embedding: enriched.embedding_vector } as any)
                        .eq('id', enriched.id);

                    if (vectorError) {
                        throw new Error(`Updated content via RPC, but failed to update pgvector embedding: ${vectorError.message}`);
                    }
                };

                const { data: directRows, error: directError } = await supabase
                    .from(table)
                    .update({
                        content: enriched,
                        embedding: enriched.embedding_vector,
                    } as any)
                    .eq('id', enriched.id)
                    .select('id');

                if (directError) {
                    await persistViaRpc();
                } else if (!directRows || directRows.length === 0) {
                    // Under RLS/PostgREST a client update can fail open: no error, zero matching visible rows.
                    // In the debug console we should fall back to the privileged RPC instead of treating this as success.
                    await persistViaRpc();
                }

                const { data: verifyRows, error: verifyError } = await supabase
                    .from(table)
                    .select('embedding')
                    .eq('id', enriched.id);

                if (verifyError) {
                    throw new Error(`Could not verify embedding column update: ${verifyError.message}`);
                }

                if (!verifyRows || verifyRows.length === 0) {
                    // Debug recompute can update rows through RPC that bypasses RLS.
                    // In that case the follow-up client-side read may legitimately see zero rows.
                    if (usedRpcFallback) {
                        console.warn(`[Recompute] ${type} ${enriched.id}: write succeeded via RPC, but verification read returned no visible rows`);
                        return;
                    }
                    throw new Error('Could not find row after update');
                }

                // If at least one matching row has an embedding, consider it a success.
                // This gracefully handles database duplicates where one clone updates but another read fails.
                const anyRowHasVector = verifyRows.some(row => hasStoredVector((row as any)?.embedding));
                
                if (!anyRowHasVector) {
                    throw new Error('Embedding column is still empty after update');
                }
            };
            const processEntity = async (profile: any, type: 'candidate' | 'job') => {
                const label = `${type} ${profile.id || '(no-id)'}`;
                try {
                    if (!profile.id) {
                        errors.push(`${label}: Profile is missing an id - cannot update DB row`);
                        return;
                    }

                    const canonicalText = buildCanonicalEmbeddingText(profile, type);
                    let vector = await getEmbedding(canonicalText);
                    let usedTextForHash = canonicalText;

                    if (!vector.length) {
                        console.warn(`[Recompute] ${label}: canonical text embedding empty, trying short fallback`);
                        const fallbackText = type === 'candidate'
                            ? `Candidate: ${profile.current_job_function || profile.personal_info?.first_name || 'Unknown'}, ${profile.residence?.city || 'Unknown'}`
                            : `Job: ${profile.title || 'Unknown'}, ${profile.company_name || 'Unknown'}, ${profile.constraints?.location?.city || 'Unknown'}`;
                        vector = await getEmbedding(fallbackText);
                        usedTextForHash = fallbackText;
                    }

                    if (!vector.length) {
                        errors.push(`${label}: getEmbedding returned empty for canonical and fallback text`);
                        return;
                    }

                    const inputHash = await generateHash(usedTextForHash);
                    const enriched = {
                        ...profile,
                        embedding_vector: vector,
                        embedding_input_hash: inputHash,
                        embedding_model: EMBEDDING_MODEL_ID,
                        embedding_version: EMBEDDING_VERSION,
                        embedding_updated_at: new Date().toISOString(),
                    };

                    await persistEmbeddingWithVerification(enriched, type);
                    processed++;
                } catch (e: any) {
                    const msg = e?.message || String(e);
                    console.error(`[Recompute] ${label} failed:`, e);
                    errors.push(`${label}: ${msg}`);
                }
            };

            for (const c of candidates) await processEntity(c, 'candidate');
            for (const j of jobs) await processEntity(j, 'job');

            await fetchData();
            if (errors.length > 0) {
                setNoticeDialog({
                    tone: 'warning',
                    title: text('Embedding recompute completed with issues', 'Ricalcolo embedding completato con problemi'),
                    description: text(
                        `Recomputed ${processed}/${processed + errors.length} embeddings.`,
                        `Ricalcolati ${processed}/${processed + errors.length} embedding.`
                    ),
                    bullets: errors.slice(0, 4),
                });
            }
            showToast(
                processed > 0
                    ? text(`Recomputed ${processed} embeddings`, `Ricalcolati ${processed} embedding`)
                    : text(`All ${errors.length} failed`, `Tutti i ${errors.length} tentativi sono falliti`)
            );
        } catch (error: any) {
            setNoticeDialog({
                tone: 'danger',
                title: text('Embedding recompute failed', 'Ricalcolo embedding non riuscito'),
                description: error?.message || text('The admin console could not recompute embeddings.', 'La console admin non è riuscita a ricalcolare gli embedding.'),
            });
        } finally {
            setActionLoading(s => ({ ...s, recomputeAll: false }));
        }
    };

    const handleConfirmDialog = async () => {
        if (!confirmDialog) return;

        setConfirmError(null);
        setIsConfirmSubmitting(true);
        try {
            if (confirmDialog.kind === 'delete' && pendingCvDelete) {
                await executeDeleteCvRecord(pendingCvDelete.record);
                setPendingCvDelete(null);
                setConfirmDialog(null);
                return;
            }

            if (confirmDialog.kind === 'delete' && pendingDelete) {
                await executeDelete(pendingDelete.type, pendingDelete.id);
                setPendingDelete(null);
                setConfirmDialog(null);
                return;
            }

            if (confirmDialog.kind === 'recompute_embeddings') {
                setConfirmDialog(null);
                await runRecomputeAllEmbeddings();
            }
        } catch (error: any) {
            setConfirmError(error?.message || text('The action could not be completed.', 'L’azione non può essere completata.'));
        } finally {
            setIsConfirmSubmitting(false);
        }
    };

    const handleOpenPortalAsUser = useCallback((target: {
        profileId: string;
        email: string;
        role: 'seeker' | 'recruiter';
        fullName?: string;
        navigationState?: Record<string, unknown>;
    }) => {
        startImpersonation(target);
        const highlightJobId = typeof target.navigationState?.highlightJobId === 'string'
            ? target.navigationState.highlightJobId
            : null;
        navigate(
            target.role === 'seeker'
                ? '/seeker/dashboard'
                : highlightJobId
                    ? `/recruiter/dashboard?highlightJobId=${encodeURIComponent(highlightJobId)}`
                    : '/recruiter/dashboard',
            target.navigationState ? { state: target.navigationState } : undefined
        );
        showToast(text(`Viewing portal as ${target.email}`, `Stai visualizzando il portale come ${target.email}`));
    }, [navigate, showToast, startImpersonation]);

    const handleDownloadCvRecord = useCallback(async (record: CandidateCvRecord) => {
        setCvActionState({ id: record.id, action: 'download' });
        try {
            await downloadCandidateCv(record);
        } catch (error: any) {
            console.error('Failed to download candidate CV from admin console:', error);
            setNoticeDialog({
                tone: 'danger',
                title: text('CV download failed', 'Download CV non riuscito'),
                description: error?.message || text('The candidate CV could not be downloaded right now.', 'Il CV del candidato non può essere scaricato in questo momento.'),
            });
        } finally {
            setCvActionState(null);
        }
    }, [text]);

    const executeDeleteCvRecord = useCallback(async (record: CandidateCvRecord) => {
        setCvActionState({ id: record.id, action: 'delete' });
        try {
            await deleteCandidateCvRecord(record);
            await fetchData();
            showToast(text('Candidate CV deleted', 'CV del candidato eliminato'));
        } catch (error: any) {
            console.error('Failed to delete candidate CV from admin console:', error);
            setNoticeDialog({
                tone: 'danger',
                title: text('CV delete failed', 'Eliminazione CV non riuscita'),
                description: error?.message || text('The candidate CV could not be deleted right now.', 'Il CV del candidato non può essere eliminato in questo momento.'),
            });
        } finally {
            setCvActionState(null);
        }
    }, [showToast, text]);

    const handleDeleteCvRecord = useCallback((record: CandidateCvRecord) => {
        const linkedCandidate = candidates.find((candidate) =>
            candidate.id === record.candidate_record_id ||
            candidate.contacts?.email?.toLowerCase() === users.find((user) => user.profileId === record.candidate_profile_id)?.email?.toLowerCase()
        );
        const linkedUser = users.find((entry) => entry.profileId === record.candidate_profile_id);
        const seekerName = formatCandidateName(linkedCandidate) || text('Name unavailable', 'Nome non disponibile');
        const seekerEmail = linkedCandidate?.contacts?.email || linkedUser?.email || text('Email unavailable', 'Email non disponibile');

        setPendingCvDelete({
            record,
            seekerName,
            seekerEmail,
        });
        setConfirmError(null);
        setConfirmDialog({
            kind: 'delete',
            tone: 'danger',
            title: text('Delete stored CV', 'Elimina CV salvato'),
            description: text(
                `Delete ${record.file_name} for ${seekerName}? This will permanently remove the stored CV from Supabase storage and from the admin console.`,
                `Eliminare ${record.file_name} per ${seekerName}? Questo rimuoverà definitivamente il CV salvato dallo storage Supabase e dalla console admin.`
            ),
            confirmLabel: text('Delete CV permanently', 'Elimina CV definitivamente'),
            cancelLabel: text('Cancel', 'Annulla'),
        });
    }, [candidates, text, users]);

    // --- Filtering ---
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();

    const accountRows = useMemo(() => users.map((user) => {
        const candidate = candidates.find((entry) => entry.id === user.profileId || entry.contacts?.email?.toLowerCase() === user.email.toLowerCase());
        const recruiter = recruiters.find((entry) => entry.id === user.profileId || entry.email?.toLowerCase() === user.email.toLowerCase());
        const fullName =
            user.fullName ||
            formatCandidateName(candidate) ||
            formatRecruiterName(recruiter) ||
            (user.role === 'admin' ? text('System Administrator', 'Amministratore di sistema') : text('Name unavailable', 'Nome non disponibile'));

        const detailLine = user.role === 'seeker'
            ? [candidate?.current_seniority_level, formatReadable(candidate?.current_job_function), formatLocation(candidate?.residence)].filter(Boolean).join(' • ')
            : user.role === 'recruiter'
                ? [recruiter?.role, recruiter?.company_name, formatLocation(recruiter?.company_location)].filter(Boolean).join(' • ')
                : text('Platform access and admin permissions', 'Accesso piattaforma e permessi admin');

        const searchText = buildSearchText(
            user.email,
            fullName,
            user.role,
            detailLine,
            candidate?.target_job_functions,
            candidate?.industry_experience,
            candidate?.skills,
            candidate?.it_skills,
            recruiter?.sector,
            recruiter?.company_name,
            recruiter?.company_location
        );

        return {
            id: user.profileId,
            email: user.email,
            fullName,
            role: user.role,
            detailLine,
            searchText,
        };
    }), [users, candidates, recruiters]);

    const adminRows = useMemo(
        () => accountRows.filter((row) => row.role === 'admin'),
        [accountRows]
    );

    const filteredAdmins = useMemo(
        () => adminRows.filter((row) => row.searchText.includes(normalizedSearchQuery)),
        [adminRows, normalizedSearchQuery]
    );

    const filteredCandidates = useMemo(() => candidates.filter((candidate) =>
        buildSearchText(
            candidate.contacts?.email,
            candidate.personal_info?.first_name,
            candidate.personal_info?.last_name,
            candidate.current_seniority_level,
            candidate.current_job_function,
            candidate.target_job_functions,
            candidate.industry_experience,
            candidate.skills,
            candidate.it_skills,
            candidate.soft_skills,
            candidate.residence,
            candidate.preferences
        ).includes(normalizedSearchQuery)
    ), [candidates, normalizedSearchQuery]);

    const filteredRecruiters = useMemo(() => recruiters.filter((recruiter) =>
        buildSearchText(
            recruiter.email,
            recruiter.first_name,
            recruiter.last_name,
            recruiter.role,
            recruiter.company_name,
            recruiter.sector,
            recruiter.company_location
        ).includes(normalizedSearchQuery)
    ), [recruiters, normalizedSearchQuery]);

    const filteredJobs = useMemo(() => jobs.filter((job) =>
        buildSearchText(
            job.title,
            job.company_name,
            job.industry,
            job.job_function,
            job.seniority_level,
            job.constraints,
            job.summary_text,
            jobRecruiterMap[job.id]?.name,
            jobRecruiterMap[job.id]?.email
        ).includes(normalizedSearchQuery)
    ), [jobs, jobRecruiterMap, normalizedSearchQuery]);

    const filteredCandidateCvs = useMemo(() => candidateCvs.filter((record) => {
        const linkedCandidate = candidates.find((candidate) =>
            candidate.id === record.candidate_record_id ||
            candidate.contacts?.email?.toLowerCase() === users.find((user) => user.profileId === record.candidate_profile_id)?.email?.toLowerCase()
        );
        const linkedUser = users.find((entry) => entry.profileId === record.candidate_profile_id);

        return buildSearchText(
            record.file_name,
            record.candidate_profile_id,
            record.candidate_record_id,
            linkedCandidate?.contacts?.email,
            linkedUser?.email,
            formatCandidateName(linkedCandidate),
            linkedCandidate?.current_job_function,
            linkedCandidate?.current_seniority_level
        ).includes(normalizedSearchQuery);
    }), [candidateCvs, candidates, normalizedSearchQuery, users]);

    // Guarantees an embedding_vector on the profile before DB save.
    // Mirrors the processEntity pattern: tries attachEmbeddingMetadata first,
    // then falls back to a direct getEmbedding call with a short safe text.
    const ensureEmbedding = async <T extends CandidateProfile | JobProfile>(
        profile: T, type: 'candidate' | 'job'
    ): Promise<T> => {
        let enriched = await attachEmbeddingMetadata(profile, type);
        if (!enriched.embedding_vector?.length) {
            const text = type === 'candidate'
                ? `Candidate: ${(profile as CandidateProfile).current_job_function || (profile as CandidateProfile).personal_info?.first_name || 'Unknown'}, ${(profile as CandidateProfile).residence?.city || 'Unknown'}`
                : `Job: ${(profile as JobProfile).title || 'Unknown'}, ${(profile as JobProfile).company_name || 'Unknown'}`;
            const vector = await getEmbedding(text);
            if (vector.length > 0) {
                enriched = {
                    ...enriched,
                    embedding_vector: vector,
                    embedding_model: EMBEDDING_MODEL_ID,
                    embedding_version: EMBEDDING_VERSION,
                    embedding_updated_at: new Date().toISOString(),
                } as T;
            }
        }
        return enriched;
    };

    // --- Core Create Helper (shared by single + batch) ---
    const createSingleSeeker = async (): Promise<void> => {
        const newCandidate = await generateFakeCandidate();
        // Generate embedding vector for semantic matching (cosine similarity)
        const enriched = await ensureEmbedding(newCandidate as CandidateProfile, 'candidate');

        const profileData = {
            id: enriched.id,
            email: enriched.contacts!.email,
            role: 'seeker',
            full_name: buildNormalizedFullName(enriched.personal_info!.first_name, enriched.personal_info!.last_name)
        };

        const { data, error: rpcError } = await supabase.rpc('create_debug_entity', {
            p_type: 'candidate',
            p_profile_data: profileData,
            p_entity_data: { id: enriched.id, user_id: enriched.id },
            p_content_data: enriched
        });

        if (rpcError) {
            if (rpcError.message?.includes("function create_debug_entity") || rpcError.code === "42883") {
                throw new Error("RPC Missing. Please run 'debug_rpc.sql' in Supabase SQL Editor.");
            }
            throw new Error(rpcError.message);
        }
        if (data && (data as any).status === 'error') {
            throw new Error("Database Logic Error: " + (data as any).message);
        }
    };

    const createSingleJob = async (): Promise<void> => {
        const newJob = await generateFakeJob();
        // Generate embedding vector for semantic matching (cosine similarity)
        const enrichedJob = await ensureEmbedding(newJob as JobProfile, 'job');
        let recruiterId = (await supabase.auth.getUser()).data.user?.id;

        if (!recruiterId) {
            const { data: rec } = await supabase.from('recruiters').select('id').limit(1).single();
            if (rec) recruiterId = rec.id;
            else {
                recruiterId = generateUUID();
                const dummyRecruiter = {
                    id: recruiterId,
                    email: `rec_${recruiterId.substring(0, 8)}@gmail.com`,
                    first_name: "Auto",
                    last_name: "Recruiter",
                    role: "Hiring Manager",
                    company_name: enrichedJob.company_name,
                    sector: [enrichedJob.industry],
                    company_location: enrichedJob.constraints.location
                };

                const { data: recData, error: recError } = await supabase.rpc('create_debug_entity', {
                    p_type: 'recruiter',
                    p_profile_data: { id: recruiterId, email: dummyRecruiter.email, role: 'recruiter', full_name: "Auto Recruiter" },
                    p_entity_data: { id: recruiterId },
                    p_content_data: dummyRecruiter
                });
                if (recError) throw recError;
                if (recData && (recData as any).status === 'error') throw new Error("Recruiter Create Failed: " + (recData as any).message);
            }
        }

        const { data, error: rpcError } = await supabase.rpc('create_debug_entity', {
            p_type: 'job',
            p_profile_data: { id: null },
            p_entity_data: { id: enrichedJob.id, recruiter_id: recruiterId },
            p_content_data: enrichedJob
        });

        if (rpcError) throw new Error(rpcError.message);
        if (data && (data as any).status === 'error') throw new Error("Job Create Failed: " + (data as any).message);
    };

    const createSingleRecruiter = async (): Promise<void> => {
        const id = generateUUID();
        const suffix = Math.random().toString(36).substring(7).toUpperCase();
        const firstNames = ['Marco', 'Sophie', 'David', 'Elena', 'James', 'Anna', 'Pierre', 'Laura'];
        const lastNames = ['Rossi', 'Müller', 'Smith', 'Garcia', 'Bianchi', 'Laurent', 'Costa', 'Weber'];
        const companies = ['NexGen Solutions', 'Global Horizon', 'InnoTech S.p.A.', 'Apex Systems', 'BlueWave Corp', 'DataCore GmbH', 'CloudSpark'];
        const sectors = ['Technology', 'Finance', 'Healthcare', 'E-commerce', 'Green Energy', 'Consulting'];
        const cities = [{ city: 'Milan', country: 'it' }, { city: 'Berlin', country: 'de' }, { city: 'London', country: 'gb' }, { city: 'Paris', country: 'fr' }];

        const fName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const loc = cities[Math.floor(Math.random() * cities.length)];

        const recruiterData = {
            id,
            email: `${fName.toLowerCase()}.${lName.toLowerCase()}_${suffix.toLowerCase()}@gmail.com`,
            first_name: fName,
            last_name: lName,
            role: ['Hiring Manager', 'Talent Acquisition Specialist', 'HR Director', 'Recruiter'][Math.floor(Math.random() * 4)],
            company_name: companies[Math.floor(Math.random() * companies.length)],
            company_location: { country: loc.country, city: loc.city, address: '' },
            sector: [sectors[Math.floor(Math.random() * sectors.length)]]
        };

        const { data, error } = await supabase.rpc('create_debug_entity', {
            p_type: 'recruiter',
            p_profile_data: { id, email: recruiterData.email, role: 'recruiter', full_name: `${fName} ${lName}` },
            p_entity_data: { id },
            p_content_data: recruiterData
        });

        if (error) {
            if (error.message?.includes("function create_debug_entity") || error.code === "42883") {
                throw new Error("RPC Missing. Please run 'debug_rpc.sql' in Supabase SQL Editor.");
            }
            throw new Error(error.message);
        }
        if (data && (data as any).status === 'error') throw new Error("Recruiter Create Failed: " + (data as any).message);
    };

    // --- Action Handlers ---
    const handleFactoryCountChange = (kind: FactoryKind, value: string) => {
        setFactoryCounts((current) => ({
            ...current,
            [kind]: clampCount(Number(value))
        }));
    };

    const handleFactoryCreate = async (kind: FactoryKind) => {
        const loadingKey = kind === 'seekers'
            ? 'createSeekers'
            : kind === 'jobs'
                ? 'createJobs'
                : 'createRecruiters';

        const total = clampCount(factoryCounts[kind]);
        const createSingle = kind === 'seekers'
            ? createSingleSeeker
            : kind === 'jobs'
                ? createSingleJob
                : createSingleRecruiter;

        setActionLoading((current) => ({ ...current, [loadingKey]: true }));
        setBatchProgress({ kind, current: 0, total });

        let successCount = 0;

        try {
            for (let index = 0; index < total; index++) {
                try {
                    await createSingle();
                    successCount++;
                } catch (error: any) {
                    console.error(`[Factory] ${kind} item ${index + 1} failed:`, error?.message || error);
                }

                setBatchProgress({ kind, current: index + 1, total });
            }

            await fetchData();
            showToast(`Created ${successCount}/${total} ${kind}`);
        } finally {
            setActionLoading((current) => ({ ...current, [loadingKey]: false }));
            setBatchProgress(null);
        }
    };

    const handleCreateAdmin = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!adminForm.email || !adminForm.password) {
            setAdminFeedback({
                error: 'Email and password are required to create a system admin.',
                success: '',
            });
            return;
        }

        setAdminFeedback({ error: '', success: '' });
        setActionLoading((current) => ({ ...current, createAdmin: true }));

        try {
            const admin = await createSystemAdmin(adminForm.email, adminForm.password, adminForm.fullName);
            setAdminForm({ fullName: '', email: '', password: '' });
            setAdminFeedback({
                error: '',
                success: `Admin created successfully: ${admin.email}`,
            });
            await fetchData();
            showToast(`Admin created: ${admin.email}`);
        } catch (error: any) {
            console.error('Failed to create admin account:', error);
            setAdminFeedback({
                error: error.message || text('Unable to create the new system admin.', 'Impossibile creare il nuovo amministratore di sistema.'),
                success: '',
            });
        } finally {
            setActionLoading((current) => ({ ...current, createAdmin: false }));
        }
    };

    const downloadProvisioningCsv = (role?: 'seeker' | 'recruiter') => {
        const rows = role ? provisionedAccounts.filter((entry) => entry.role === role) : provisionedAccounts;
        if (rows.length === 0) {
            setNoticeDialog({
                tone: 'info',
                title: text('Nothing to export yet', 'Nulla da esportare per ora'),
                description: text('Create at least one provisioned account before exporting a CSV.', 'Crea almeno un account da provisioning prima di esportare un CSV.'),
            });
            return;
        }

        const header = ['role', 'full_name', 'email', 'password', 'line_one', 'line_two', 'created_at'];
        const csv = [
            header.join(','),
            ...rows.map((row) => [
                escapeCsv(row.role),
                escapeCsv(row.fullName),
                escapeCsv(row.email),
                escapeCsv(row.password),
                escapeCsv(row.lineOne),
                escapeCsv(row.lineTwo),
                escapeCsv(row.createdAt),
            ].join(',')),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = role ? `peaktalent_${role}_accounts.csv` : 'peaktalent_provisioned_accounts.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDatasetExport = () => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const seekersPayload = candidates.map((candidate) => ({
            id: candidate.id,
            full_name: formatCandidateName(candidate) || text('Name unavailable', 'Nome non disponibile'),
            email: candidate.contacts?.email || '',
            current_job_function: formatReadable(candidate.current_job_function),
            current_seniority_level: candidate.current_seniority_level || '',
            location: formatLocation(candidate.residence),
            target_job_functions: candidate.target_job_functions || [],
            industry_experience: candidate.industry_experience || [],
            skills: candidate.skills?.map((skill) => skill.skill_name) || [],
            it_skills: candidate.it_skills?.map((skill) => skill.skill_name) || [],
            summary_text: candidate.summary_text || '',
            raw: candidate,
        }));

        const recruitersPayload = recruiters.map((recruiter) => ({
            id: recruiter.id,
            full_name: formatRecruiterName(recruiter) || text('Name unavailable', 'Nome non disponibile'),
            email: recruiter.email || '',
            role: recruiter.role || '',
            company_name: recruiter.company_name || '',
            sector: recruiter.sector || [],
            location: formatLocation(recruiter.company_location),
            address: recruiter.company_location?.address || '',
            raw: recruiter,
        }));

        const jobsPayload = jobs.map((job) => ({
            id: job.id,
            title: job.title || text('Untitled posting', 'Posting senza titolo'),
            company_name: job.company_name || '',
            job_function: formatReadable(job.job_function),
            seniority_level: formatReadable(job.seniority_level),
            industry: job.industry || [],
            location: formatLocation(job.constraints?.location),
            remote: formatReadable(job.constraints?.remote),
            owner_name: jobRecruiterMap[job.id]?.name || '',
            owner_email: jobRecruiterMap[job.id]?.email || '',
            applicant_emails: job.applicant_emails || [],
            summary_text: job.summary_text || '',
            raw: job,
        }));

        const selectionCount = exportScope === 'seekers'
            ? seekersPayload.length
            : exportScope === 'recruiters'
                ? recruitersPayload.length
                : exportScope === 'jobs'
                    ? jobsPayload.length
                    : seekersPayload.length + recruitersPayload.length + jobsPayload.length;

        if (selectionCount === 0) {
            setNoticeDialog({
                tone: 'info',
                title: text('No data to export', 'Nessun dato da esportare'),
                description: text('There are no records in the selected dataset yet.', 'Non ci sono ancora record nel dataset selezionato.'),
            });
            return;
        }

        if (exportFormat === 'json') {
            const payload = exportScope === 'seekers'
                ? seekersPayload.map(({ raw, ...entry }) => ({ ...entry, profile: raw }))
                : exportScope === 'recruiters'
                    ? recruitersPayload.map(({ raw, ...entry }) => ({ ...entry, profile: raw }))
                    : exportScope === 'jobs'
                        ? jobsPayload.map(({ raw, ...entry }) => ({ ...entry, posting: raw }))
                        : {
                            exported_at: new Date().toISOString(),
                            seekers: seekersPayload.map(({ raw, ...entry }) => ({ ...entry, profile: raw })),
                            recruiters: recruitersPayload.map(({ raw, ...entry }) => ({ ...entry, profile: raw })),
                            job_postings: jobsPayload.map(({ raw, ...entry }) => ({ ...entry, posting: raw })),
                        };

            triggerDownload(
                `peaktalent_${exportScope}_${timestamp}.json`,
                'application/json;charset=utf-8;',
                JSON.stringify(payload, null, 2)
            );
            return;
        }

        const csvRows = exportScope === 'seekers'
            ? [
                ['id', 'full_name', 'email', 'current_job_function', 'current_seniority_level', 'location', 'target_job_functions', 'industry_experience', 'skills', 'it_skills', 'summary_text', 'raw_json'],
                ...seekersPayload.map((entry) => [
                    escapeCsv(entry.id),
                    escapeCsv(entry.full_name),
                    escapeCsv(entry.email),
                    escapeCsv(entry.current_job_function),
                    escapeCsv(entry.current_seniority_level),
                    escapeCsv(entry.location),
                    escapeCsv(formatList(entry.target_job_functions)),
                    escapeCsv(formatList(entry.industry_experience)),
                    escapeCsv(formatList(entry.skills)),
                    escapeCsv(formatList(entry.it_skills)),
                    escapeCsv(entry.summary_text),
                    escapeCsv(JSON.stringify(entry.raw)),
                ]),
            ]
            : exportScope === 'recruiters'
                ? [
                    ['id', 'full_name', 'email', 'role', 'company_name', 'sector', 'location', 'address', 'raw_json'],
                    ...recruitersPayload.map((entry) => [
                        escapeCsv(entry.id),
                        escapeCsv(entry.full_name),
                        escapeCsv(entry.email),
                        escapeCsv(entry.role),
                        escapeCsv(entry.company_name),
                        escapeCsv(formatList(entry.sector)),
                        escapeCsv(entry.location),
                        escapeCsv(entry.address),
                        escapeCsv(JSON.stringify(entry.raw)),
                    ]),
                ]
                : exportScope === 'jobs'
                    ? [
                        ['id', 'title', 'company_name', 'job_function', 'seniority_level', 'industry', 'location', 'remote', 'owner_name', 'owner_email', 'applicant_emails', 'summary_text', 'raw_json'],
                        ...jobsPayload.map((entry) => [
                            escapeCsv(entry.id),
                            escapeCsv(entry.title),
                            escapeCsv(entry.company_name),
                            escapeCsv(entry.job_function),
                            escapeCsv(entry.seniority_level),
                            escapeCsv(formatList(entry.industry)),
                            escapeCsv(entry.location),
                            escapeCsv(entry.remote),
                            escapeCsv(entry.owner_name),
                            escapeCsv(entry.owner_email),
                            escapeCsv(formatList(entry.applicant_emails)),
                            escapeCsv(entry.summary_text),
                            escapeCsv(JSON.stringify(entry.raw)),
                        ]),
                    ]
                    : [
                        ['entity_type', 'id', 'primary_label', 'secondary_label', 'email', 'company_name', 'location', 'owner_email', 'tags', 'summary_text', 'raw_json'],
                        ...seekersPayload.map((entry) => [
                            escapeCsv('seeker'),
                            escapeCsv(entry.id),
                            escapeCsv(entry.full_name),
                            escapeCsv([entry.current_seniority_level, entry.current_job_function].filter(Boolean).join(' • ')),
                            escapeCsv(entry.email),
                            escapeCsv(''),
                            escapeCsv(entry.location),
                            escapeCsv(''),
                            escapeCsv(formatList([...entry.target_job_functions, ...entry.skills])),
                            escapeCsv(entry.summary_text),
                            escapeCsv(JSON.stringify(entry.raw)),
                        ]),
                        ...recruitersPayload.map((entry) => [
                            escapeCsv('recruiter'),
                            escapeCsv(entry.id),
                            escapeCsv(entry.full_name),
                            escapeCsv(entry.role),
                            escapeCsv(entry.email),
                            escapeCsv(entry.company_name),
                            escapeCsv(entry.location),
                            escapeCsv(''),
                            escapeCsv(formatList(entry.sector)),
                            escapeCsv(''),
                            escapeCsv(JSON.stringify(entry.raw)),
                        ]),
                        ...jobsPayload.map((entry) => [
                            escapeCsv('job'),
                            escapeCsv(entry.id),
                            escapeCsv(entry.title),
                            escapeCsv([entry.seniority_level, entry.job_function].filter(Boolean).join(' • ')),
                            escapeCsv(''),
                            escapeCsv(entry.company_name),
                            escapeCsv(entry.location),
                            escapeCsv(entry.owner_email),
                            escapeCsv(formatList(entry.industry)),
                            escapeCsv(entry.summary_text),
                            escapeCsv(JSON.stringify(entry.raw)),
                        ]),
                    ];

        const csv = csvRows.map((row) => row.join(',')).join('\n');
        triggerDownload(
            `peaktalent_${exportScope}_${timestamp}.csv`,
            'text/csv;charset=utf-8;',
            csv
        );
    };

    const handleCreateSeekerAccount = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!seekerProvisionForm.email || !seekerProvisionForm.password || !seekerProvisionForm.fullName) {
            setProvisionFeedback((current) => ({
                ...current,
                seeker: {
                    error: 'Full name, email, and password are required.',
                    success: '',
                },
            }));
            return;
        }

        setProvisionFeedback((current) => ({
            ...current,
            seeker: { error: '', success: '' },
        }));
        setActionLoading((current) => ({ ...current, createProvisionSeeker: true }));

        try {
            const account = await createSystemSeeker(seekerProvisionForm);
            setProvisionedAccounts((current) => [account, ...current]);
            setSeekerProvisionForm({
                fullName: '',
                email: '',
                password: '',
                phone: '',
                currentJobFunction: '',
                currentSeniorityLevel: '',
                city: '',
                country: '',
                summaryText: '',
            });
            setProvisionFeedback((current) => ({
                ...current,
                seeker: {
                    error: '',
                    success: `Seeker created successfully: ${account.email}`,
                },
            }));
            await fetchData();
        } catch (error: any) {
            console.error('Failed to provision seeker account:', error);
            setProvisionFeedback((current) => ({
                ...current,
                seeker: {
                    error: error.message || 'Unable to create the new seeker account.',
                    success: '',
                },
            }));
        } finally {
            setActionLoading((current) => ({ ...current, createProvisionSeeker: false }));
        }
    };

    const handleSeekerCvFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from<File>(event.target.files || []).filter((file) => /\.pdf$/i.test(file.name));
        event.target.value = '';

        if (files.length === 0) {
            setSeekerProvisionCvFiles([]);
            setProvisionFeedback((current) => ({
                ...current,
                seeker: {
                    error: 'Select at least one PDF CV.',
                    success: '',
                },
            }));
            return;
        }

        if (files.length > MAX_SEEKER_CV_UPLOADS) {
            setSeekerProvisionCvFiles([]);
            setProvisionFeedback((current) => ({
                ...current,
                seeker: {
                    error: `You can upload up to ${MAX_SEEKER_CV_UPLOADS} PDF CVs at once.`,
                    success: '',
                },
            }));
            return;
        }

        setSeekerProvisionCvFiles(files);
        setProvisionFeedback((current) => ({
            ...current,
            seeker: { error: '', success: '' },
        }));
    };

    const handleClearSeekerCvFiles = () => {
        setSeekerProvisionCvFiles([]);
        setBatchProgress((current) => (current?.kind === 'cv_seekers' ? null : current));
        setProvisionFeedback((current) => ({
            ...current,
            seeker: { error: '', success: '' },
        }));
    };

    const handleCreateSeekersFromCvs = async () => {
        if (seekerProvisionCvFiles.length === 0) {
            setProvisionFeedback((current) => ({
                ...current,
                seeker: {
                    error: 'Upload at least one PDF CV first.',
                    success: '',
                },
            }));
            return;
        }

        if (!hasGeminiApiKey()) {
            setNoticeDialog({
                tone: 'warning',
                title: 'CV provisioning needs Gemini',
                description: 'The CV parser could not start because `VITE_GEMINI_API_KEY` is not available in the current app bundle.',
                bullets: [
                    'Add the Gemini API key to the frontend environment.',
                    'Restart the dev server so Vite picks up the new variable.',
                    'Then upload the PDFs again and click "Create seekers from CVs".',
                ],
            });
            setProvisionFeedback((current) => ({
                ...current,
                seeker: {
                    error: 'VITE_GEMINI_API_KEY is not set. CV-based provisioning requires the Gemini parser.',
                    success: '',
                },
            }));
            return;
        }

        setProvisionFeedback((current) => ({
            ...current,
            seeker: { error: '', success: '' },
        }));
        setActionLoading((current) => ({ ...current, createProvisionSeekersFromCv: true }));
        setBatchProgress({ kind: 'cv_seekers', current: 0, total: seekerProvisionCvFiles.length });

        const createdAccounts: ProvisionedAccountRecord[] = [];
        const failures: string[] = [];

        try {
            for (let index = 0; index < seekerProvisionCvFiles.length; index += 1) {
                const file = seekerProvisionCvFiles[index];
                setBatchProgress({ kind: 'cv_seekers', current: index, total: seekerProvisionCvFiles.length });

                try {
                    const candidateProfile = await extractCvInfoFromFile(file);
                    const identity = buildProvisionedSeekerIdentity(candidateProfile, file, index);
                    let account: ProvisionedAccountRecord | null = null;
                    let currentEmail = identity.email;

                    while (!account) {
                        try {
                            account = await createSystemSeeker({
                                fullName: identity.fullName,
                                email: currentEmail,
                                password: identity.password,
                                phone: candidateProfile.contacts?.phone || '',
                                currentJobFunction: candidateProfile.current_job_function || '',
                                currentSeniorityLevel: candidateProfile.current_seniority_level || '',
                                city: candidateProfile.residence?.city || '',
                                country: candidateProfile.residence?.country || '',
                                summaryText: candidateProfile.summary_text || '',
                                candidateProfile,
                            });
                        } catch (error: any) {
                            if (!isDuplicateProvisionError(error)) {
                                throw error;
                            }

                            const resolution = await promptProvisionConflictResolution({
                                fileName: file.name,
                                candidateName: identity.fullName,
                                detectedEmail: currentEmail,
                            });

                            if (resolution.action === 'cancel') {
                                failures.push(`${file.name}: creation cancelled because ${currentEmail} already exists.`);
                                break;
                            }

                            currentEmail = resolution.email;
                        }
                    }

                    if (!account) {
                        continue;
                    }

                    try {
                        await saveCandidateCv({
                            ...candidateProfile,
                            id: account.id,
                            contacts: {
                                ...candidateProfile.contacts,
                                email: account.email,
                                phone: candidateProfile.contacts?.phone || '',
                            },
                        } as CandidateProfile, file);
                    } catch (cvStorageError) {
                        console.warn(`Created seeker ${account.email}, but could not store the source CV in candidate storage:`, cvStorageError);
                    }

                    createdAccounts.push(account);
                } catch (error: any) {
                    console.error(`Failed to provision seeker from CV "${file.name}":`, error);
                    failures.push(`${file.name}: ${error?.message || 'Unable to process this CV.'}`);
                }

                setBatchProgress({ kind: 'cv_seekers', current: index + 1, total: seekerProvisionCvFiles.length });
            }

            if (createdAccounts.length > 0) {
                setProvisionedAccounts((current) => [...createdAccounts, ...current]);
                setSeekerProvisionCvFiles([]);
                await fetchData();
            }

            setProvisionFeedback((current) => ({
                ...current,
                seeker: {
                    error: failures.length > 0
                        ? failures.slice(0, 3).join(' | ') + (failures.length > 3 ? ` | +${failures.length - 3} more` : '')
                        : '',
                    success: createdAccounts.length > 0
                        ? `Created ${createdAccounts.length} seeker account${createdAccounts.length === 1 ? '' : 's'} from ${seekerProvisionCvFiles.length} CV${seekerProvisionCvFiles.length === 1 ? '' : 's'}.`
                        : '',
                },
            }));

            if (createdAccounts.length === 0 && failures.length > 0) {
                setNoticeDialog({
                    tone: 'warning',
                    title: 'No seeker accounts were created',
                    description: 'The batch started, but every uploaded CV failed during parsing or account creation.',
                    bullets: failures.slice(0, 5),
                });
            }
        } finally {
            setBatchProgress(null);
            setActionLoading((current) => ({ ...current, createProvisionSeekersFromCv: false }));
        }
    };

    const handleCreateRecruiterAccount = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!recruiterProvisionForm.email || !recruiterProvisionForm.fullName || !recruiterProvisionForm.companyName) {
            setProvisionFeedback((current) => ({
                ...current,
                recruiter: {
                    error: 'Full name, email, and company name are required.',
                    success: '',
                },
            }));
            return;
        }

        setProvisionFeedback((current) => ({
            ...current,
            recruiter: { error: '', success: '' },
        }));
        setActionLoading((current) => ({ ...current, createProvisionRecruiter: true }));

        try {
            const temporaryPassword = recruiterProvisionForm.password.trim() || DEFAULT_TEMP_RECRUITER_PASSWORD;
            const account = await createSystemRecruiter({
                ...recruiterProvisionForm,
                password: temporaryPassword,
            });
            setProvisionedAccounts((current) => [account, ...current]);
            setRecruiterProvisionForm({
                fullName: '',
                email: '',
                password: DEFAULT_TEMP_RECRUITER_PASSWORD,
                recruiterRole: '',
                companyName: '',
                sectorText: '',
                city: '',
                country: '',
                address: '',
            });
            setProvisionFeedback((current) => ({
                ...current,
                recruiter: {
                    error: '',
                    success: `Recruiter created successfully: ${account.email} (temporary password: ${temporaryPassword})`,
                },
            }));
            window.location.href = buildRecruiterInviteMailto({
                recipientEmail: account.email,
                recruiterName: account.fullName,
                companyName: recruiterProvisionForm.companyName,
                loginEmail: account.email,
                temporaryPassword,
            });
            await fetchData();
        } catch (error: any) {
            console.error('Failed to provision recruiter account:', error);
            setProvisionFeedback((current) => ({
                ...current,
                recruiter: {
                    error: error.message || 'Unable to create the new recruiter account.',
                    success: '',
                },
            }));
        } finally {
            setActionLoading((current) => ({ ...current, createProvisionRecruiter: false }));
        }
    };

    // --- Recompute All Embeddings ---
    const handleRecomputeAllEmbeddings = async () => {
        setConfirmError(null);
        setConfirmDialog({
            kind: 'recompute_embeddings',
            tone: 'warning',
            title: text('Recompute all embeddings', 'Ricalcola tutti gli embedding'),
            description: text(
                'Verify and recompute embeddings for every seeker and posting. This can take a while depending on API limits.',
                'Verifica e ricalcola gli embedding per ogni seeker e posting. Potrebbe richiedere tempo in base ai limiti API.'
            ),
            confirmLabel: text('Start recompute', 'Avvia ricalcolo'),
            cancelLabel: text('Cancel', 'Annulla'),
        });
    };

    const anyActionLoading = Object.values(actionLoading).some(v => v);
    const logActorOptions = useMemo(() => {
        const seen = new Map<string, { value: string; label: string }>();

        activityLogs.forEach((log) => {
            const value = log.effective_profile_id || log.actor_user_id || log.effective_email || log.actor_email || '';
            if (!value || seen.has(value)) return;

            seen.set(value, {
                value,
                label: log.effective_name || log.effective_email || log.actor_email || text('Unknown user', 'Utente sconosciuto'),
            });
        });

        return Array.from(seen.values()).sort((left, right) => left.label.localeCompare(right.label));
    }, [activityLogs, text]);

    const filteredActivityLogs = useMemo(() => {
        return activityLogs.filter((log) => {
            const matchesCategory =
                logCategoryFilter === 'all' ? true :
                    logCategoryFilter === 'edge_function' ? log.event_type === 'edge_function_call' :
                        logCategoryFilter === 'gemini' ? log.event_type === 'gemini_call' :
                            logCategoryFilter === 'job_created' ? log.event_type === 'job_created' :
                                ['candidate_profile_created', 'recruiter_created', 'admin_created'].includes(log.event_type);

            if (!matchesCategory) return false;

            if (logActorFilter === 'all') return true;

            return (
                log.effective_profile_id === logActorFilter ||
                log.actor_user_id === logActorFilter ||
                log.effective_email === logActorFilter ||
                log.actor_email === logActorFilter
            );
        });
    }, [activityLogs, logActorFilter, logCategoryFilter]);

    const recentActivityLogs = useMemo(() => {
        return activityLogs
            .filter((log) => ['candidate_profile_created', 'recruiter_created', 'admin_created', 'job_created'].includes(log.event_type))
            .slice(0, 6);
    }, [activityLogs]);

    const adminAndAiLabel = text('Settings', 'Settings');
    const searchPlaceholder = {
        exports: text('Search CVs by file name, candidate name, or email', 'Cerca CV per nome file, nome candidato o email'),
        candidates: text('Search candidates by email, name, title, location, or skills', 'Cerca candidati per email, nome, ruolo, località o skill'),
        recruiters: text('Search recruiters by email, name, company, title, or sector', 'Cerca recruiter per email, nome, azienda, ruolo o settore'),
        jobs: text('Search postings by title, company, owner, location, or industry', 'Cerca posting per titolo, azienda, proprietario, località o settore'),
    }[activeTab as 'exports' | 'candidates' | 'recruiters' | 'jobs'];

    const visibleCountLabel =
        activeTab === 'exports' ? `${filteredCandidateCvs.length} ${text('visible', 'visibili')}` :
            activeTab === 'candidates' ? `${filteredCandidates.length} ${text('visible', 'visibili')}` :
                activeTab === 'recruiters' ? `${filteredRecruiters.length} ${text('visible', 'visibili')}` :
                    activeTab === 'jobs' ? `${filteredJobs.length} ${text('visible', 'visibili')}` :
                        '';
    const exportCounts: Record<ExportScope, number> = {
        seekers: candidates.length,
        recruiters: recruiters.length,
        jobs: jobs.length,
        all: candidates.length + recruiters.length + jobs.length,
    };
    const databasePercent = getUsagePercent(supabaseUsage?.databaseUsedBytes ?? null, supabaseUsage?.databaseLimitBytes ?? null);
    const storagePercent = getUsagePercent(supabaseUsage?.storageUsedBytes ?? null, supabaseUsage?.storageLimitBytes ?? null);
    const apiRequestsPercent = getUsagePercent(supabaseUsage?.apiRequestsUsed ?? null, supabaseUsage?.apiRequestsLimit ?? null);
    const aiRequestLimit = parsePositiveCountEnv((import.meta.env as Record<string, unknown>).VITE_AI_REQUEST_LIMIT, DEFAULT_AI_REQUEST_LIMIT);
    const candidateAiStatusById = new Map(candidates.map((candidate) => [candidate.id, Boolean(candidate.ai_refined)]));
    const aiRequestTargets = Array.from(
        notifications.reduce<Map<string, { candidateId: string }>>((acc, notification) => {
            if (!notification.metadata?.requires_ai_refinement) {
                return acc;
            }

            const candidateId = notification.metadata?.candidate_id || notification.user_id;
            const jobId = notification.metadata?.job_id || 'general';
            if (!candidateId) {
                return acc;
            }

            acc.set(`${candidateId}:${jobId}`, { candidateId });
            return acc;
        }, new Map())
            .values()
    );
    const aiRequestCount = aiRequestTargets.length;
    const aiCompletedCount = aiRequestTargets.filter(({ candidateId }) => candidateAiStatusById.get(candidateId)).length;
    const aiIncompleteCount = Math.max(0, aiRequestCount - aiCompletedCount);
    const aiRequestPercent = getUsagePercent(aiRequestCount, aiRequestLimit);
    const overviewCoreMetrics = [
        {
            key: 'candidates',
            icon: <CandidateMetricIcon />,
            label: text('Candidate profiles', 'Profili candidati'),
            value: formatCount(candidates.length),
            detail: '',
            percent: 100,
        },
        {
            key: 'recruiters',
            icon: <RecruiterMetricIcon />,
            label: text('Recruiter accounts', 'Account recruiter'),
            value: formatCount(recruiters.length),
            detail: '',
            percent: 100,
        },
        {
            key: 'postings',
            icon: <PostingMetricIcon />,
            label: text('Job postings', 'Job posting'),
            value: formatCount(jobs.length),
            detail: '',
            percent: 100,
        },
    ];
    const overviewSupabaseMetrics = [
        {
            key: 'database',
            icon: <DatabaseMetricIcon />,
            label: text('Database usage', 'Utilizzo database'),
            value: databasePercent !== null ? `${Math.round(databasePercent)}%` : formatBytes(supabaseUsage?.databaseUsedBytes ?? null),
            detail: formatUsageRatio(supabaseUsage?.databaseUsedBytes ?? null, supabaseUsage?.databaseLimitBytes ?? null),
            percent: databasePercent,
        },
        {
            key: 'storage',
            icon: <StorageMetricIcon />,
            label: text('Storage', 'Storage'),
            value: storagePercent !== null ? `${Math.round(storagePercent)}%` : formatBytes(supabaseUsage?.storageUsedBytes ?? null),
            detail: formatUsageRatio(supabaseUsage?.storageUsedBytes ?? null, supabaseUsage?.storageLimitBytes ?? null),
            percent: storagePercent,
        },
        {
            key: 'api',
            icon: <ApiMetricIcon />,
            label: text('API requests', 'Richieste API'),
            value: apiRequestsPercent !== null ? `${Math.round(apiRequestsPercent)}%` : formatCount(supabaseUsage?.apiRequestsUsed ?? null),
            detail: formatCountRatio(supabaseUsage?.apiRequestsUsed ?? null, supabaseUsage?.apiRequestsLimit ?? null),
            percent: apiRequestsPercent,
        },
    ];
    const overviewAiMetrics = [
        {
            key: 'ai-requests',
            icon: <AiRequestMetricIcon />,
            label: text('AI requests', 'Richieste AI'),
            value: aiRequestPercent !== null ? `${Math.round(aiRequestPercent)}%` : formatCount(aiRequestCount),
            detail: formatCountRatio(aiRequestCount, aiRequestLimit),
            percent: aiRequestPercent,
        },
        {
            key: 'ai-completed',
            icon: <AiCompletedMetricIcon />,
            label: text('AI completed', 'AI completati'),
            value: formatCount(aiCompletedCount),
            detail: formatCountRatio(aiCompletedCount, aiRequestCount),
            percent: getUsagePercent(aiCompletedCount, aiRequestCount),
        },
        {
            key: 'ai-incomplete',
            icon: <AiIncompleteMetricIcon />,
            label: text('AI incomplete', 'AI incompleti'),
            value: formatCount(aiIncompleteCount),
            detail: formatCountRatio(aiIncompleteCount, aiRequestCount),
            percent: getUsagePercent(aiIncompleteCount, aiRequestCount),
        },
    ];
    const supabaseOverviewNotes = (supabaseUsage?.notes || []).map((note) => {
        if (note === 'Run supabase/admin_supabase_usage.sql in Supabase SQL Editor to enable live DB and storage usage.') {
            return text(
                'Run supabase/admin_supabase_usage.sql in Supabase SQL Editor to enable live DB and storage usage.',
                'Esegui supabase/admin_supabase_usage.sql nel Supabase SQL Editor per abilitare le metriche live di database e storage.'
            );
        }
        if (note === 'Supabase DB/storage usage could not be loaded from the admin RPC.') {
            return text(
                'Supabase DB/storage usage could not be loaded from the admin RPC.',
                'Le metriche di database e storage non sono state caricate dalla RPC admin.'
            );
        }
        if (note === 'Set VITE_SUPABASE_API_REQUEST_LIMIT to display remaining API request budget.') {
            return text(
                'Set VITE_SUPABASE_API_REQUEST_LIMIT to display remaining API request budget.',
                'Imposta VITE_SUPABASE_API_REQUEST_LIMIT per mostrare il budget richieste residuo.'
            );
        }
        if (note === 'Supabase management API did not return a tracked API request count.') {
            return text(
                'Supabase management API did not return a tracked API request count.',
                'La Management API di Supabase non ha restituito un conteggio richieste API tracciato.'
            );
        }
        if (note === 'Supabase management API metrics are currently unavailable on this environment.') {
            return text(
                'Supabase management API metrics are currently unavailable on this environment.',
                'Le metriche della Management API di Supabase non sono attualmente disponibili in questo ambiente.'
            );
        }
        if (note.startsWith('Supabase management API error: ')) {
            const detail = note.replace('Supabase management API error: ', '');
            return text(
                `Supabase management API error: ${detail}`,
                `Errore Management API di Supabase: ${detail}`
            );
        }
        return note;
    });
    const aiOverviewNotes: string[] = [];

    return (
        <div className="animate-fade-in w-full relative">
            {confirmDialog && (
                <AdminModalShell>
                    <div className="space-y-6 p-6 sm:p-7">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <StatusPill tone={confirmDialog.tone}>
                                    {confirmDialog.kind === 'delete' ? text('Delete flow', 'Flusso eliminazione') : text('Background task', 'Attività in background')}
                                </StatusPill>
                                <h3 className="mt-4 text-2xl font-black text-slate-900 dark:text-slate-100">{confirmDialog.title}</h3>
                                <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{confirmDialog.description}</p>
                            </div>
                            <button
                                onClick={() => {
                                    if (isConfirmSubmitting) return;
                                    setConfirmDialog(null);
                                    setPendingDelete(null);
                                    setPendingCvDelete(null);
                                    setConfirmError(null);
                                }}
                                className="rounded-2xl px-3 py-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                                &times;
                            </button>
                        </div>

                        {confirmDialog.kind === 'delete' && confirmDialog.linkedPostings && confirmDialog.linkedPostings.length > 0 && (
                            <div className="rounded-[26px] border border-red-200/70 bg-red-50/80 p-5 dark:border-red-900/50 dark:bg-red-950/20">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{text('Linked postings that will be deleted too', 'Posting collegati che verranno eliminati')}</p>
                                <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                                    {confirmDialog.linkedPostings.map((posting) => (
                                        <li key={posting.id} className="flex items-start gap-3">
                                            <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-red-500" />
                                            <span className="min-w-0">
                                                <span className="block font-medium text-slate-900 dark:text-slate-100">{posting.title}</span>
                                                <span className="block text-slate-500 dark:text-slate-400">{posting.detail}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {confirmError && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                                {confirmError}
                            </div>
                        )}

                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                onClick={() => {
                                    if (isConfirmSubmitting) return;
                                    setConfirmDialog(null);
                                    setPendingDelete(null);
                                    setPendingCvDelete(null);
                                    setConfirmError(null);
                                }}
                                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                {confirmDialog.cancelLabel || text('Cancel', 'Annulla')}
                            </button>
                            <button
                                onClick={handleConfirmDialog}
                                disabled={isConfirmSubmitting}
                                className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50 ${confirmDialog.tone === 'danger' ? 'bg-red-600 hover:bg-red-500' : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100'}`}
                            >
                                {isConfirmSubmitting && <MiniSpinner />}
                                {confirmDialog.confirmLabel}
                            </button>
                        </div>
                    </div>
                </AdminModalShell>
            )}

            {provisionConflict && (
                <AdminModalShell maxWidthClassName="max-w-2xl">
                    <div className="space-y-6 p-6 sm:p-7">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <StatusPill tone="warning">{text('Duplicate email', 'Email duplicata')}</StatusPill>
                                <h3 className="mt-4 text-2xl font-black text-slate-900 dark:text-slate-100">
                                    {text('This CV matches an existing account', 'Questo CV corrisponde a un account già esistente')}
                                </h3>
                                <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                    {text(
                                        `${provisionConflict.fileName} was parsed with the email ${provisionConflict.detectedEmail}, but that email is already in use. You can stop this creation or assign a new email and continue.`,
                                        `${provisionConflict.fileName} è stato letto con l'email ${provisionConflict.detectedEmail}, ma quell'indirizzo è già in uso. Puoi fermare la creazione oppure assegnare una nuova email e continuare.`
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={() => resolveProvisionConflict({ action: 'cancel' })}
                                className="rounded-2xl px-3 py-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/60">
                            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                                {text('Parsed candidate', 'Candidato letto dal CV')}
                            </p>
                            <p className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">{provisionConflict.candidateName}</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{provisionConflict.detectedEmail}</p>
                        </div>

                        <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {text('Existing profiles with this email', 'Profili esistenti con questa email')}
                            </p>
                            {provisionConflict.conflictingAccounts.length > 0 ? (
                                <div className="mt-4 space-y-3">
                                    {provisionConflict.conflictingAccounts.map((entry) => (
                                        <div key={`${entry.role}-${entry.id}`} className="flex items-start justify-between gap-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.fullName}</p>
                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{entry.email}</p>
                                            </div>
                                            <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                                                {entry.role}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                                    {text('The admin console knows the email is taken, but could not load the linked profile details right now.', 'La console admin sa che l’email è già occupata, ma non è riuscita a caricare in questo momento il profilo collegato.')}
                                </p>
                            )}
                        </div>

                        <div className="space-y-3">
                            <label className="block text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                                {text('New email for this new seeker', 'Nuova email per questo nuovo candidato')}
                            </label>
                            <input
                                type="email"
                                value={provisionConflict.replacementEmail}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setProvisionConflict((current) => current ? {
                                        ...current,
                                        replacementEmail: value,
                                        error: '',
                                    } : current);
                                }}
                                placeholder={text('name.surname@example.com', 'nome.cognome@example.com')}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-orange-500 dark:focus:ring-orange-500/20"
                            />
                            {provisionConflict.error && (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                                    {provisionConflict.error}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                onClick={() => resolveProvisionConflict({ action: 'cancel' })}
                                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                {text('Cancel creation', 'Annulla creazione')}
                            </button>
                            <button
                                onClick={() => {
                                    const nextEmail = normalizeProvisionEmail(provisionConflict.replacementEmail);
                                    if (!nextEmail) {
                                        setProvisionConflict((current) => current ? {
                                            ...current,
                                            error: text('Enter a valid email before continuing.', 'Inserisci una email valida prima di continuare.'),
                                        } : current);
                                        return;
                                    }
                                    if (nextEmail === normalizeProvisionEmail(provisionConflict.detectedEmail)) {
                                        setProvisionConflict((current) => current ? {
                                            ...current,
                                            error: text('Choose a different email from the one already in use.', 'Scegli una email diversa da quella già in uso.'),
                                        } : current);
                                        return;
                                    }
                                    resolveProvisionConflict({ action: 'retry', email: nextEmail });
                                }}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                            >
                                {text('Continue with new email', 'Continua con nuova email')}
                            </button>
                        </div>
                    </div>
                </AdminModalShell>
            )}

            {noticeDialog && (
                <AdminModalShell maxWidthClassName="max-w-xl">
                    <div className="space-y-6 p-6 sm:p-7">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <StatusPill tone={noticeDialog.tone}>Admin console</StatusPill>
                                <h3 className="mt-4 text-2xl font-black text-slate-900 dark:text-slate-100">{noticeDialog.title}</h3>
                                <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{noticeDialog.description}</p>
                            </div>
                            <button
                                onClick={() => setNoticeDialog(null)}
                                className="rounded-2xl px-3 py-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                                &times;
                            </button>
                        </div>

                        {noticeDialog.bullets && noticeDialog.bullets.length > 0 && (
                            <ul className="space-y-3 rounded-[24px] border border-slate-200 bg-slate-50/90 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                                {noticeDialog.bullets.map((bullet) => (
                                    <li key={bullet} className="flex items-start gap-3">
                                        <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-slate-400" />
                                        <span>{bullet}</span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={() => setNoticeDialog(null)}
                                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </AdminModalShell>
            )}

            {adminEdit && (
                <AdminModalShell maxWidthClassName="max-w-2xl">
                    <div className="space-y-6 p-6 sm:p-7">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <StatusPill tone="info">Admin profile</StatusPill>
                                <h3 className="mt-4 text-2xl font-black text-slate-900 dark:text-slate-100">Edit admin details</h3>
                                <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                    Update the admin display name used across the console. Authentication email stays visible here, but this editor is intentionally focused on stable profile data.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    if (isAdminEditSaving) return;
                                    setAdminEdit(null);
                                    setAdminEditFeedback({ error: '', success: '' });
                                }}
                                className="rounded-2xl px-3 py-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="block">
                                <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Full name</span>
                                <input
                                    type="text"
                                    value={adminEdit.fullName}
                                    onChange={(event) => setAdminEdit((current) => current ? ({ ...current, fullName: event.target.value }) : current)}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Authentication email</span>
                                <input
                                    type="email"
                                    value={adminEdit.email}
                                    readOnly
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                                />
                            </label>
                        </div>

                        {adminEditFeedback.error && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                                {adminEditFeedback.error}
                            </div>
                        )}

                        {adminEditFeedback.success && (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                                {adminEditFeedback.success}
                            </div>
                        )}

                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            {user?.id === adminEdit.id && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setAdminEdit(null);
                                        setAdminEditFeedback({ error: '', success: '' });
                                        navigate('/admin/settings');
                                    }}
                                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    {text('Open full settings', 'Apri impostazioni complete')}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleSaveAdminEdit}
                                disabled={isAdminEditSaving}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                            >
                                {isAdminEditSaving && <MiniSpinner />}
                                {text('Save admin profile', 'Salva profilo admin')}
                            </button>
                        </div>
                    </div>
                </AdminModalShell>
            )}

            {resetPasswordConfirm && (
                <AdminModalShell maxWidthClassName="max-w-2xl">
                    <div className="space-y-6 p-6 sm:p-7">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <StatusPill tone="warning">Reset Password</StatusPill>
                                <h3 className="mt-4 text-2xl font-black text-slate-900 dark:text-slate-100">{text('Reset password', 'Resetta password')}</h3>
                                <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                    {text('Conferma il reset manuale della password per:', 'Confirm the manual password reset for:')}
                                </p>
                                <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">{resetPasswordConfirm.email}</p>
                            </div>
                            <button
                                onClick={() => {
                                    if (isResettingPassword) return;
                                    setResetPasswordConfirm(null);
                                    setResetPasswordError(null);
                                }}
                                className="rounded-2xl px-3 py-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
                            <label className="block">
                                <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                    {text('New temporary password', 'Nuova password temporanea')}
                                </span>
                                <input
                                    type="text"
                                    value={resetPasswordForm.password}
                                    onChange={(event) => setResetPasswordForm({ password: event.target.value })}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900"
                                />
                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                    {text('By default it starts from password123!, but you can customize it before confirming. After login the user will be forced into Security settings to replace it.', 'Di default parte da password123!, ma puoi personalizzarla prima di confermare. Dopo il login l’utente verrà forzato nella sezione Sicurezza per sostituirla.')}
                                </p>
                            </label>
                        </div>

                        {resetPasswordError && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                                {resetPasswordError}
                            </div>
                        )}

                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    if (isResettingPassword) return;
                                    setResetPasswordConfirm(null);
                                    setResetPasswordError(null);
                                }}
                                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                {text('Cancel', 'Annulla')}
                            </button>
                            <button
                                type="button"
                                onClick={handleResetPasswordConfirm}
                                disabled={isResettingPassword}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-700"
                            >
                                {isResettingPassword && <MiniSpinner />}
                                {text('Replace password', 'Sostituisci password')}
                            </button>
                        </div>
                    </div>
                </AdminModalShell>
            )}

            {resetPasswordSuccess && (
                <AdminModalShell maxWidthClassName="max-w-2xl">
                    <div className="space-y-6 p-6 sm:p-7">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <StatusPill tone="info">Password reset</StatusPill>
                                <h3 className="mt-4 text-2xl font-black text-slate-900 dark:text-slate-100">
                                    {text('Password reset successfully', 'Password resettata con successo')}
                                </h3>
                                <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                    {text('La password dell\'utente è stata resettata. Puoi condividere questi dati oppure generare subito la mail formale.', 'The user password has been reset. You can share these credentials or generate the formal email right away.')}
                                </p>
                            </div>
                            <button
                                onClick={() => setResetPasswordSuccess(null)}
                                className="rounded-2xl px-3 py-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{text('Email', 'Email')}</p>
                                <p className="mt-2 break-all text-lg font-semibold text-slate-900 dark:text-slate-100">{resetPasswordSuccess.email}</p>
                            </div>

                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{text('Password', 'Password')}</p>
                                <p className="mt-2 break-all text-lg font-semibold text-slate-900 dark:text-slate-100">{resetPasswordSuccess.password}</p>
                            </div>

                            <div className="rounded-xl border border-dashed border-emerald-300 bg-white/80 p-4 dark:border-emerald-800 dark:bg-slate-900/80">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {text('Important notes:', 'Note importanti:')}
                                </p>
                                <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                                    <li className="flex items-start gap-2">
                                        <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-emerald-500" />
                                        <span>{text('L\'utente deve cambiare la password al primo accesso', 'User must change password on first login')}</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-emerald-500" />
                                        <span>{text('La sezione password nelle impostazioni sarà obbligatoria', 'Password section in settings will be mandatory')}</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-emerald-500" />
                                        <span>{text('Consiglia all\'utente di scegliere una password sicura', 'Advise the user to choose a strong password')}</span>
                                    </li>
                                </ul>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                            <a
                                href={buildAdminPasswordResetMailto({
                                    recipientEmail: resetPasswordSuccess.email,
                                    loginEmail: resetPasswordSuccess.email,
                                    temporaryPassword: resetPasswordSuccess.password,
                                })}
                                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                {text('Generate email', 'Genera mail')}
                            </a>
                            <button
                                onClick={() => setResetPasswordSuccess(null)}
                                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                            >
                                {text('Close', 'Chiudi')}
                            </button>
                        </div>
                    </div>
                </AdminModalShell>
            )}

            {editEntity && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden border dark:border-slate-800 flex flex-col">
                        <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50">
                            <div>
                                <h3 className="text-xl font-bold">{text(`Edit ${editEntity.type}`, `Modifica ${editEntity.type === 'job' ? 'posting' : editEntity.type === 'candidate' ? 'seeker' : editEntity.type === 'recruiter' ? 'recruiter' : 'utente'}`)}</h3>
                                <p className="text-xs text-slate-500 font-mono">UID: {editEntity.data.id || editEntity.data.email}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setEditEntity({ ...editEntity, jsonMode: !editEntity.jsonMode })}
                                    className="px-4 py-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded-full text-xs font-bold uppercase tracking-widest"
                                >
                                    {editEntity.jsonMode ? text('Switch to Form', 'Passa al form') : text('Switch to JSON', 'Passa a JSON')}
                                </button>
                                <button onClick={() => setEditEntity(null)} className="text-2xl text-slate-400">&times;</button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 relative">
                            {isUpdating && (
                                <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                                    <Spinner />
                                    <p className="mt-4 font-black uppercase tracking-widest text-sm text-orange-600">{text('Saving...', 'Salvataggio...')}</p>
                                </div>
                            )}
                            {editEntity.jsonMode ? (
                                <textarea
                                    className="w-full h-full font-mono text-sm p-6 bg-slate-50 dark:bg-slate-950 border dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500"
                                    defaultValue={JSON.stringify(editEntity.data, null, 2)}
                                    onBlur={(e) => {
                                        try {
                                            const parsed = JSON.parse(e.target.value);
                                            setEditEntity({ ...editEntity, data: parsed });
                                        } catch (err) { setEditError(text('Malformed JSON string.', 'Stringa JSON non valida.')); }
                                    }}
                                />
                            ) : (
                                <div>
                                    {editEntity.type === 'candidate' && (
                                        <CandidateForm
                                            initialData={editEntity.data}
                                            onSubmit={(data) => handleSaveEdit(data)}
                                            isSaving={isUpdating}
                                            saveLabel={text('Save seeker', 'Salva candidato')}
                                            showRefineAction={false}
                                        />
                                    )}
                                    {editEntity.type === 'job' && (
                                        <JobProfileForm initialData={editEntity.data} onSubmit={(data) => handleSaveEdit(data)} />
                                    )}
                                    {editEntity.type === 'recruiter' && (
                                        <RecruiterProfileSetup
                                            recruiter={editEntity.data as RecruiterProfile}
                                            embedded
                                            isEditing
                                            saveLabel={text('Save recruiter', 'Salva recruiter')}
                                            onSaveProfile={handleSaveRecruiterEdit}
                                            onProfileComplete={() => {}}
                                        />
                                    )}
                                    {editEntity.type === 'user' && (
                                        <div className="space-y-4 max-w-xl mx-auto">
                                            <p className="text-sm text-slate-500 mb-6 italic">
                                                {text(
                                                    `Simple property editor for ${editEntity.type}. For nested changes, use JSON mode.`,
                                                    `Editor semplice delle proprietà per ${(editEntity.type as EntityType) === 'job' ? 'il posting' : (editEntity.type as EntityType) === 'candidate' ? 'il seeker' : (editEntity.type as EntityType) === 'recruiter' ? 'il recruiter' : "l'utente"}. Per modifiche annidate, usa la modalità JSON.`
                                                )}
                                            </p>
                                            {Object.keys(editEntity.data).map(key => {
                                                if (typeof editEntity.data[key] === 'object') return null;
                                                return (
                                                    <div key={key}>
                                                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">{key}</label>
                                                        <input
                                                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-xl"
                                                            value={editEntity.data[key] || ''}
                                                            onChange={(e) => setEditEntity({ ...editEntity, data: { ...editEntity.data, [key]: e.target.value } })}
                                                        />
                                                    </div>
                                                );
                                            })}
                                            <button onClick={() => handleSaveEdit(editEntity.data)} className="w-full bg-orange-500 text-white font-black py-4 rounded-xl shadow-lg mt-8 uppercase tracking-widest">{text('Update Entry', 'Aggiorna voce')}</button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {editError && <p className="mt-4 text-red-500 font-bold text-sm bg-red-50 p-3 rounded-lg border border-red-100">{editError}</p>}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                {isMobileNavOpen && (
                    <div className="fixed inset-0 z-[190] bg-slate-950/55 backdrop-blur-sm lg:hidden" onClick={() => setIsMobileNavOpen(false)}>
                        <aside
                            className="absolute left-3 right-3 top-[64px] max-h-[calc(100vh-80px)] overflow-y-auto rounded-[30px] border border-slate-200 bg-white/95 p-3 shadow-2xl dark:border-slate-800 dark:bg-slate-950/95"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="mb-3 flex items-center justify-between px-1">
                                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">{text('Navigation', 'Navigazione')}</p>
                                <button
                                    type="button"
                                    onClick={() => setIsMobileNavOpen(false)}
                                    className="inline-flex h-8 items-center justify-center rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                                >
                                    {text('Close', 'Chiudi')}
                                </button>
                            </div>
                            <div className="space-y-2.5">
                                <TabButton active={activeTab === 'overview'} onClick={() => handleSelectTab('overview')} label={text('Health Overview', 'Panoramica salute')} />
                                <div className="my-0.5 h-px bg-slate-200 dark:bg-slate-800" />
                                <TabButton active={activeTab === 'provisioning'} onClick={() => handleSelectTab('provisioning')} label={text('Provisioning', 'Provisioning')} />
                                <TabButton active={activeTab === 'exports'} onClick={() => handleSelectTab('exports')} label={text('Exports and CV', 'Esportazioni e CV')} />
                                <TabButton active={activeTab === 'candidates'} onClick={() => handleSelectTab('candidates')} label={text('Candidates', 'Candidati')} />
                                <TabButton active={activeTab === 'recruiters'} onClick={() => handleSelectTab('recruiters')} label={text('Recruiters', 'Recruiter')} />
                                <TabButton active={activeTab === 'jobs'} onClick={() => handleSelectTab('jobs')} label={text('Postings', 'Posting')} />
                                <TabButton active={activeTab === 'logs'} onClick={() => handleSelectTab('logs')} label={text('Logs', 'Logs')} />
                                <div className="my-0.5 h-px bg-slate-200 dark:bg-slate-800" />
                                <TabButton active={activeTab === 'bug_reports'} onClick={() => handleSelectTab('bug_reports')} label={text('Bug Reports', 'Segnalazioni')} />
                                <TabButton active={activeTab === 'ai_models'} onClick={() => handleSelectTab('ai_models')} label={adminAndAiLabel} />
                            </div>
                        </aside>
                    </div>
                )}

                <aside className="hidden self-start lg:sticky lg:top-24 lg:w-[212px] lg:flex-none lg:block xl:w-[224px]">
                    <div className="rounded-[30px] border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/80 backdrop-blur-sm shadow-sm p-2.5 space-y-2">
                        <TabButton active={activeTab === 'overview'} onClick={() => handleSelectTab('overview')} label={text('Health Overview', 'Panoramica salute')} />
                        <div className="h-px bg-slate-200 dark:bg-slate-800 my-0.5" />
                        <TabButton active={activeTab === 'provisioning'} onClick={() => handleSelectTab('provisioning')} label={text('Provisioning', 'Provisioning')} />
                        <TabButton active={activeTab === 'exports'} onClick={() => handleSelectTab('exports')} label={text('Exports and CV', 'Esportazioni e CV')} />
                        <TabButton active={activeTab === 'candidates'} onClick={() => handleSelectTab('candidates')} label={text('Candidates', 'Candidati')} />
                        <TabButton active={activeTab === 'recruiters'} onClick={() => handleSelectTab('recruiters')} label={text('Recruiters', 'Recruiter')} />
                        <TabButton active={activeTab === 'jobs'} onClick={() => handleSelectTab('jobs')} label={text('Postings', 'Posting')} />
                        <TabButton active={activeTab === 'logs'} onClick={() => handleSelectTab('logs')} label={text('Logs', 'Logs')} />
                        <div className="h-px bg-slate-200 dark:bg-slate-800 my-0.5" />
                        <TabButton active={activeTab === 'bug_reports'} onClick={() => handleSelectTab('bug_reports')} label={text('Bug Reports', 'Segnalazioni')} />
                        <TabButton active={activeTab === 'ai_models'} onClick={() => handleSelectTab('ai_models')} label={adminAndAiLabel} />
                    </div>
                </aside>

                <main className="min-w-0 flex-1 space-y-6">
                    {isLoading ? (
                            <div className="flex min-h-[680px] flex-col items-center justify-center gap-4 rounded-[30px] border border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-950/80 opacity-60">
                            <Spinner />
                            <p className="font-black uppercase tracking-widest text-xs">{text('Querying Index...', 'Interrogazione indice...')}</p>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'overview' && (
                                <div className="space-y-8 animate-fade-in">
                                    <section className="space-y-4">
                                        <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
                                            {[...overviewCoreMetrics, ...overviewSupabaseMetrics].map(({ key, ...metric }) => (
                                                <div key={key}>
                                                    <OverviewMetric
                                                        icon={metric.icon}
                                                        label={metric.label}
                                                        value={metric.value}
                                                        detail={metric.detail}
                                                        percent={metric.percent}
                                                    />
                                                </div>
                                            ))}
                                        </div>

                                        {supabaseUsage?.measuredAt && (
                                            <p className="text-center text-[11px] font-medium text-slate-400">
                                                {text('Last measurement', 'Ultima rilevazione')}: {new Date(supabaseUsage.measuredAt).toLocaleString()}
                                            </p>
                                        )}

                                        {supabaseOverviewNotes.length > 0 && (
                                            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                                                <ul className="space-y-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                                    {supabaseOverviewNotes.map((note) => (
                                                        <li key={note} className="flex items-start gap-2">
                                                            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                                                            <span>{note}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {aiOverviewNotes.length > 0 && (
                                            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                                                <ul className="space-y-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                                    {aiOverviewNotes.map((note) => (
                                                        <li key={note} className="flex items-start gap-2">
                                                            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                                                            <span>{note}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </section>

                                    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
                                        <div className="mb-5 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                            <button
                                                type="button"
                                                onClick={() => handleSelectTab('logs')}
                                                className="text-left transition-opacity hover:opacity-80"
                                            >
                                                <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 sm:text-2xl">{text('Recent activity', 'Attività recenti')}</h2>
                                            </button>
                                            <span className="text-sm text-slate-400">{recentActivityLogs.length} {text('recent records', 'record recenti')}</span>
                                        </div>

                                        <div className="grid gap-4 lg:grid-cols-2">
                                            {recentActivityLogs.map((log) => (
                                                <button
                                                    key={log.id}
                                                    type="button"
                                                    onClick={() => handleSelectTab('logs')}
                                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900"
                                                >
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="min-w-0">
                                                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                                {log.event_type === 'job_created'
                                                                    ? text('Posting created', 'Posting creato')
                                                                    : text('Profile created', 'Profilo creato')}
                                                            </p>
                                                            <p className="text-sm font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
                                                                {log.entity_label || log.summary}
                                                            </p>
                                                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                                                {(log.effective_name || log.effective_email || text('Unknown user', 'Utente sconosciuto'))}
                                                            </p>
                                                        </div>
                                                        <span className="shrink-0 text-xs font-medium text-slate-400">
                                                            {new Date(log.created_at).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </button>
                                            ))}

                                            {recentActivityLogs.length === 0 && (
                                                <EmptyState
                                                    title={text('No recent activity yet', 'Nessuna attività recente')}
                                                    description={text('Create a few profiles or postings and they will appear here automatically.', 'Crea qualche profilo o posting e compariranno qui automaticamente.')}
                                                />
                                            )}
                                        </div>
                                    </section>
                                </div>
                            )}

                            {activeTab === 'exports' && (
                                <div className="space-y-6 animate-fade-in">
                                    <section className="rounded-[30px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                            <div>
                                                <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">{text('Download datasets for analysis', 'Scarica dataset per analisi')}</h2>
                                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                                    {text('Export seeker profiles, recruiter profiles, job postings, or one combined dataset ready for offline analysis in notebooks or BI tools.', 'Esporta profili candidati, profili recruiter, lavori o un dataset combinato pronto per analisi offline in notebook o strumenti BI.')}
                                                </p>
                                            </div>
                                            <span className="text-sm text-slate-400">{exportCounts[exportScope]} {text('records in the current selection', 'record nella selezione corrente')}</span>
                                        </div>

                                        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.72fr)]">
                                            <div className="space-y-6">
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{text('Dataset', 'Dataset')}</p>
                                                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                                        <ExportToggle
                                                            active={exportScope === 'seekers'}
                                                            title={text('Seekers', 'Candidati')}
                                                            detail={`${candidates.length} profiles`}
                                                            onClick={() => setExportScope('seekers')}
                                                        />
                                                        <ExportToggle
                                                            active={exportScope === 'recruiters'}
                                                            title={text('Recruiters', 'Recruiter')}
                                                            detail={`${recruiters.length} profiles`}
                                                            onClick={() => setExportScope('recruiters')}
                                                        />
                                                        <ExportToggle
                                                            active={exportScope === 'jobs'}
                                                            title={text('Postings', 'Posting')}
                                                            detail={`${jobs.length} jobs`}
                                                            onClick={() => setExportScope('jobs')}
                                                        />
                                                        <ExportToggle
                                                            active={exportScope === 'all'}
                                                            title={text('All in one', 'Tutto insieme')}
                                                            detail={`${exportCounts.all} rows`}
                                                            onClick={() => setExportScope('all')}
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{text('Format', 'Formato')}</p>
                                                    <div className="mt-3 grid gap-2 sm:max-w-sm sm:grid-cols-2">
                                                        <ExportToggle
                                                            active={exportFormat === 'json'}
                                                            title="JSON"
                                                            detail="Structured export with full nested payloads"
                                                            onClick={() => setExportFormat('json')}
                                                        />
                                                        <ExportToggle
                                                            active={exportFormat === 'csv'}
                                                            title="CSV"
                                                            detail="Spreadsheet-friendly flat export"
                                                            onClick={() => setExportFormat('csv')}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-[28px] border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-5 flex flex-col justify-between gap-5">
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{text('Export notes', 'Note export')}</p>
                                                    <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                                                        JSON keeps the complete nested structure. CSV keeps analysis-friendly columns and also includes a `raw_json` field so you can recover the original record when needed.
                                                    </p>
                                                    {exportScope === 'all' && (
                                                        <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                                            The combined CSV uses one flat file with `entity_type` plus shared columns, while the combined JSON includes `seekers`, `recruiters`, and `job_postings` in one document.
                                                        </p>
                                                    )}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={handleDatasetExport}
                                                    className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                                                >
                                                    {text('Download', 'Scarica')} {exportFormat.toUpperCase()}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                            <ExportStatCard label={text('Seekers', 'Candidati')} value={candidates.length} />
                                            <ExportStatCard label={text('Recruiters', 'Recruiter')} value={recruiters.length} />
                                            <ExportStatCard label={text('Postings', 'Posting')} value={jobs.length} />
                                            <ExportStatCard label={text('Combined rows', 'Righe combinate')} value={exportCounts.all} />
                                        </div>
                                    </section>
                                </div>
                            )}

                            {activeTab === 'provisioning' && (
                                <div className="space-y-6 animate-fade-in">
                                    <section className="rounded-[30px] border border-orange-200 dark:border-orange-900/60 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-slate-950 dark:to-orange-950/20 p-6 shadow-sm">
                                        <div className="mb-6">
                                            <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">{text('Generate fresh data', 'Genera nuovi dati')}</h2>
                                        </div>

                                        <div className="grid gap-4 lg:grid-cols-3">
                                            <FactoryControlCard
                                                label={text('Seekers', 'Candidati')}
                                                description={text('AI-generated candidates with profile data and embeddings', 'Candidati generati da AI con dati profilo ed embeddings')}
                                                value={factoryCounts.seekers}
                                                onChange={(value) => handleFactoryCountChange('seekers', value)}
                                                onSubmit={() => handleFactoryCreate('seekers')}
                                                loading={actionLoading.createSeekers}
                                                progress={batchProgress?.kind === 'seekers' ? batchProgress : null}
                                                disabled={anyActionLoading}
                                            />
                                            <FactoryControlCard
                                                label={text('Recruiters', 'Recruiter')}
                                                description={text('Company-side accounts with realistic hiring metadata', 'Account lato azienda con metadati di hiring realistici')}
                                                value={factoryCounts.recruiters}
                                                onChange={(value) => handleFactoryCountChange('recruiters', value)}
                                                onSubmit={() => handleFactoryCreate('recruiters')}
                                                loading={actionLoading.createRecruiters}
                                                progress={batchProgress?.kind === 'recruiters' ? batchProgress : null}
                                                disabled={anyActionLoading}
                                            />
                                            <FactoryControlCard
                                                label={text('Postings', 'Posting')}
                                                description={text('AI-generated job postings linked to recruiter ownership', 'Job posting generati da AI collegati al recruiter proprietario')}
                                                value={factoryCounts.jobs}
                                                onChange={(value) => handleFactoryCountChange('jobs', value)}
                                                onSubmit={() => handleFactoryCreate('jobs')}
                                                loading={actionLoading.createJobs}
                                                progress={batchProgress?.kind === 'jobs' ? batchProgress : null}
                                                disabled={anyActionLoading}
                                            />
                                        </div>
                                    </section>

                                    <section className="rounded-[30px] border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-white p-6 shadow-sm dark:border-orange-900/50 dark:from-slate-950 dark:via-orange-950/20 dark:to-slate-950">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div>
                                                <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">Turn uploaded CVs into debug seeker accounts</h3>
                                            </div>
                                            <StatusPill tone={actionLoading.createProvisionSeekersFromCv ? 'warning' : seekerProvisionCvFiles.length > 0 ? 'info' : 'warning'}>
                                                {actionLoading.createProvisionSeekersFromCv
                                                    ? 'Batch running'
                                                    : seekerProvisionCvFiles.length > 0
                                                        ? `${seekerProvisionCvFiles.length} CV${seekerProvisionCvFiles.length === 1 ? '' : 's'} queued`
                                                        : 'Waiting for PDFs'}
                                            </StatusPill>
                                        </div>

                                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                                                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Selected</p>
                                                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{seekerProvisionCvFiles.length}</p>
                                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">PDF CVs ready</p>
                                            </div>
                                            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                                                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Will Create</p>
                                                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{seekerProvisionCvFiles.length}</p>
                                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Seeker accounts</p>
                                            </div>
                                            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                                                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Limit</p>
                                                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{MAX_SEEKER_CV_UPLOADS}</p>
                                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">PDFs per batch</p>
                                            </div>
                                        </div>

                                        <div className="mt-5 rounded-[24px] border border-orange-200/70 bg-white/85 p-4 dark:border-orange-900/40 dark:bg-slate-900/75">
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                                <input
                                                    type="file"
                                                    multiple
                                                    accept=".pdf,application/pdf"
                                                    onChange={handleSeekerCvFilesChange}
                                                    disabled={anyActionLoading}
                                                    className="block min-w-0 flex-1 text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-orange-100 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-orange-700 hover:file:bg-orange-200 dark:file:bg-slate-800 dark:file:text-orange-300 dark:hover:file:bg-slate-700"
                                                />
                                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleClearSeekerCvFiles}
                                                        disabled={anyActionLoading || seekerProvisionCvFiles.length === 0}
                                                        className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                                    >
                                                        Clear selection
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleCreateSeekersFromCvs}
                                                        disabled={anyActionLoading || seekerProvisionCvFiles.length === 0}
                                                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-400 disabled:opacity-50"
                                                    >
                                                        {actionLoading.createProvisionSeekersFromCv && <MiniSpinner />}
                                                        Create seekers from CVs
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="mt-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                                                <span>{seekerProvisionCvFiles.length} / {MAX_SEEKER_CV_UPLOADS} selected</span>
                                                <span>Accepted format: PDF</span>
                                            </div>
                                        </div>

                                        {seekerProvisionCvFiles.length > 0 && (
                                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                                                <p className="font-semibold text-slate-900 dark:text-slate-100">
                                                    Files in this batch
                                                </p>
                                                <p className="mt-2 leading-relaxed">
                                                    {seekerProvisionCvFiles.slice(0, 5).map((file) => file.name).join(', ')}
                                                    {seekerProvisionCvFiles.length > 5 ? `, +${seekerProvisionCvFiles.length - 5} more` : ''}
                                                </p>
                                            </div>
                                        )}

                                        {batchProgress?.kind === 'cv_seekers' && (
                                            <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-100/80 p-4 dark:border-orange-900/40 dark:bg-orange-950/20">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                                                        Processing CV {Math.min(batchProgress.current + (batchProgress.current === batchProgress.total ? 0 : 1), batchProgress.total)} of {batchProgress.total}
                                                    </p>
                                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">
                                                        {Math.round((batchProgress.current / Math.max(batchProgress.total, 1)) * 100)}%
                                                    </p>
                                                </div>
                                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80 dark:bg-slate-900/70">
                                                    <div
                                                        className="h-full rounded-full bg-orange-500 transition-all"
                                                        style={{ width: `${(batchProgress.current / Math.max(batchProgress.total, 1)) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {(provisionFeedback.seeker.error || provisionFeedback.seeker.success) && (
                                            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-medium ${
                                                provisionFeedback.seeker.error
                                                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300'
                                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300'
                                            }`}>
                                                {provisionFeedback.seeker.error || provisionFeedback.seeker.success}
                                            </div>
                                        )}
                                    </section>

                                    <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                                        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{text('Provisioned Access', 'Accessi creati')}</p>
                                                <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">{text('Recently created accounts', 'Account creati di recente')}</h3>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => downloadProvisioningCsv()}
                                                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                            >
                                                {text('Export all as CSV', 'Esporta tutto in CSV')}
                                            </button>
                                        </div>

                                        {provisionedAccounts.length > 0 ? (
                                            <div className="grid gap-4 xl:grid-cols-2">
                                                {provisionedAccounts.map((account) => (
                                                    <ProvisionedAccountCard
                                                        key={`${account.role}-${account.id}-${account.createdAt}`}
                                                        account={account}
                                                        onCopy={() => copyToClipboard(`${account.email} / ${account.password}`)}
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <EmptyState
                                                title={text('No accounts provisioned yet', 'Nessun account ancora creato')}
                                                description={text('Create candidate access from the forms above, then export the credentials as CSV for Excel.', 'Crea accessi candidato dai form qui sopra, poi esporta le credenziali in CSV per Excel.')}
                                            />
                                        )}
                                    </section>
                                </div>
                            )}

                            {(activeTab === 'exports' || activeTab === 'candidates' || activeTab === 'recruiters' || activeTab === 'jobs') && (
                                <div className="space-y-6 animate-fade-in">
                                    {activeTab === 'recruiters' && (
                                        <section className="rounded-[30px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
                                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                                <div>
                                                    <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">{text('Create and invite a recruiter', 'Crea e invita un recruiter')}</h3>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => downloadProvisioningCsv('recruiter')}
                                                    className="text-sm font-semibold text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
                                                >
                                                    {text('Export recruiter CSV', 'Esporta CSV recruiter')}
                                                </button>
                                            </div>

                                            <form onSubmit={handleCreateRecruiterAccount} className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]">
                                                <ProvisionInput
                                                    placeholder={text('Full name', 'Nome completo')}
                                                    value={recruiterProvisionForm.fullName}
                                                    onChange={(value) => setRecruiterProvisionForm((current) => ({ ...current, fullName: value }))}
                                                />
                                                <ProvisionInput
                                                    type="email"
                                                    placeholder="recruiter@example.com"
                                                    value={recruiterProvisionForm.email}
                                                    onChange={(value) => setRecruiterProvisionForm((current) => ({ ...current, email: value }))}
                                                />
                                                <ProvisionInput
                                                    placeholder={text('Company name', 'Nome azienda')}
                                                    value={recruiterProvisionForm.companyName}
                                                    onChange={(value) => setRecruiterProvisionForm((current) => ({ ...current, companyName: value }))}
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={actionLoading.createProvisionRecruiter}
                                                    className="px-5 py-3 rounded-2xl bg-slate-900 text-white text-sm font-semibold transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                                                >
                                                    {actionLoading.createProvisionRecruiter ? text('Creating...', 'Creazione...') : text('Invite recruiter', 'Invita recruiter')}
                                                </button>
                                            </form>

                                            <p className="mt-3 text-xs text-slate-400">
                                                {text(
                                                    `Temporary password used for the first access: ${DEFAULT_TEMP_RECRUITER_PASSWORD}`,
                                                    `Password temporanea usata per il primo accesso: ${DEFAULT_TEMP_RECRUITER_PASSWORD}`
                                                )}
                                            </p>

                                            {provisionFeedback.recruiter.error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{provisionFeedback.recruiter.error}</p>}
                                            {provisionFeedback.recruiter.success && <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">{provisionFeedback.recruiter.success}</p>}
                                        </section>
                                    )}

                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div className="relative flex-1 max-w-3xl">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><SearchIcon /></span>
                                            <input
                                                type="text"
                                                placeholder={searchPlaceholder}
                                                value={searchQuery}
                                                onChange={(event) => setSearchQuery(event.target.value)}
                                                className="h-11 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 pl-11 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                                            />
                                        </div>
                                        <div className="text-sm text-slate-400 md:text-right whitespace-nowrap">
                                            {visibleCountLabel}
                                        </div>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        {activeTab === 'exports' && filteredCandidateCvs.map((record) => {
                                            const linkedCandidate = candidates.find((candidate) =>
                                                candidate.id === record.candidate_record_id ||
                                                candidate.contacts?.email?.toLowerCase() === users.find((user) => user.profileId === record.candidate_profile_id)?.email?.toLowerCase()
                                            );
                                            const linkedUser = users.find((entry) => entry.profileId === record.candidate_profile_id);
                                            const seekerName = formatCandidateName(linkedCandidate) || text('Name unavailable', 'Nome non disponibile');
                                            const seekerEmail = linkedCandidate?.contacts?.email || linkedUser?.email || text('Email unavailable', 'Email non disponibile');
                                            const isDownloading = cvActionState?.id === record.id && cvActionState.action === 'download';
                                            const isDeleting = cvActionState?.id === record.id && cvActionState.action === 'delete';

                                            return (
                                                <div key={record.id} className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                                                    <div className="flex flex-col gap-4">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">CV</span>
                                                            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                                {new Date(record.updated_at).toLocaleDateString()}
                                                            </span>
                                                        </div>

                                                        <div>
                                                            <p className="text-lg font-black text-slate-900 dark:text-slate-100">{record.file_name}</p>
                                                            <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">{seekerName}</p>
                                                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{seekerEmail}</p>
                                                            <p className="mt-3 text-xs text-slate-400">
                                                                {[
                                                                    linkedCandidate?.current_seniority_level,
                                                                    formatReadable(linkedCandidate?.current_job_function),
                                                                    typeof record.file_size === 'number' && record.file_size > 0 ? `${(record.file_size / 1024 / 1024).toFixed(2)} MB` : '',
                                                                ].filter(Boolean).join(' • ')}
                                                            </p>
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleDownloadCvRecord(record)}
                                                                disabled={Boolean(cvActionState)}
                                                                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                                            >
                                                                {isDownloading ? text('Preparing...', 'Preparazione...') : text('Download CV', 'Scarica CV')}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleDeleteCvRecord(record)}
                                                                disabled={Boolean(cvActionState)}
                                                                className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300 dark:hover:bg-red-950/40"
                                                            >
                                                                {isDeleting ? text('Deleting...', 'Eliminazione...') : text('Delete CV', 'Elimina CV')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {activeTab === 'candidates' && filteredCandidates.map((candidate) => (
                                            <EntityCard
                                                key={candidate.id}
                                                badgeLabel={text('candidate', 'candidato')}
                                                badgeAccessory={
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getProfileStrengthClasses(getCandidateProfileStrength(candidate))}`}>
                                                        {getCandidateProfileStrength(candidate)}%
                                                    </span>
                                                }
                                                title={formatCandidateName(candidate) || text('Name unavailable', 'Nome non disponibile')}
                                                subtitle={candidate.contacts?.email || text('Email unavailable', 'Email non disponibile')}
                                                detail={[candidate.current_seniority_level, formatReadable(candidate.current_job_function), formatLocation(candidate.residence)].filter(Boolean).join(' • ')}
                                                onEdit={() => handleOpenEdit('candidate', candidate)}
                                                onDelete={() => handleDelete('candidate', candidate.id)}
                                                onResetPassword={candidate.contacts?.email ? () => handleResetPasswordClick(candidate.id, candidate.contacts?.email || '', 'candidate') : undefined}
                                                onLoginAs={candidate.contacts?.email ? () => handleOpenPortalAsUser({
                                                    profileId: candidate.id,
                                                    email: candidate.contacts.email,
                                                    role: 'seeker',
                                                    fullName: formatCandidateName(candidate) || candidate.contacts.email,
                                                }) : undefined}
                                                loginTitle={text('Open seeker portal', 'Apri portale candidato')}
                                            />
                                        ))}

                                        {activeTab === 'recruiters' && filteredRecruiters.map((recruiter) => (
                                            <EntityCard
                                                key={recruiter.id}
                                                badgeLabel={text('recruiter', 'recruiter')}
                                                title={formatRecruiterName(recruiter) || text('Name unavailable', 'Nome non disponibile')}
                                                subtitle={recruiter.email || text('Email unavailable', 'Email non disponibile')}
                                                detail={[recruiter.role, recruiter.company_name, formatList(recruiter.sector), formatLocation(recruiter.company_location)].filter(Boolean).join(' • ')}
                                                onEdit={() => handleOpenEdit('recruiter', recruiter)}
                                                onDelete={() => handleDelete('recruiter', recruiter.id)}
                                                onResetPassword={recruiter.email ? () => handleResetPasswordClick(recruiter.id, recruiter.email, 'recruiter') : undefined}
                                                onLoginAs={recruiter.email ? () => handleOpenPortalAsUser({
                                                    profileId: recruiter.id,
                                                    email: recruiter.email,
                                                    role: 'recruiter',
                                                    fullName: formatRecruiterName(recruiter) || recruiter.email,
                                                }) : undefined}
                                                loginTitle={text('Open recruiter portal', 'Apri portale recruiter')}
                                            />
                                        ))}

                                        {activeTab === 'jobs' && filteredJobs.map((job) => {
                                            const owner = jobRecruiterMap[job.id];
                                            return (
                                                <EntityCard
                                                    key={job.id}
                                                    badgeLabel={text('posting', 'posting')}
                                                    title={job.title || text('Untitled posting', 'Posting senza titolo')}
                                                    subtitle={job.company_name || text('Company unavailable', 'Azienda non disponibile')}
                                                    detail={[
                                                        formatReadable(job.job_function),
                                                        formatReadable(job.seniority_level),
                                                        formatLocation(job.constraints?.location),
                                                        formatList(job.industry),
                                                        owner ? text(`Owner: ${owner.name}`, `Responsabile: ${owner.name}`) : ''
                                                    ].filter(Boolean).join(' • ')}
                                                    onEdit={() => handleOpenEdit('job', job)}
                                                    onDelete={() => handleDelete('job', job.id)}
                                                    onLoginAs={owner ? () => handleOpenPortalAsUser({
                                                        profileId: owner.id,
                                                        email: owner.email,
                                                        role: 'recruiter',
                                                        fullName: owner.name,
                                                        navigationState: { highlightJobId: job.id },
                                                    }) : undefined}
                                                    loginTitle={text("Open owner's portal", 'Apri portale del responsabile')}
                                                />
                                            );
                                        })}
                                    </div>

                                    {activeTab === 'exports' && filteredCandidateCvs.length === 0 && <EmptyState title={text('No matching CVs', 'Nessun CV corrispondente')} description={text('Search by candidate name, email, or original file name.', 'Cerca per nome candidato, email o nome originale del file.')} />}
                                    {activeTab === 'candidates' && filteredCandidates.length === 0 && <EmptyState title={text('No matching candidates', 'Nessun candidato corrispondente')} description={text('Search by email, location, current role, or skill.', 'Cerca per email, località, ruolo attuale o skill.')} />}
                                    {activeTab === 'recruiters' && filteredRecruiters.length === 0 && <EmptyState title={text('No matching recruiters', 'Nessun recruiter corrispondente')} description={text('Search by company, full name, title, or sector.', 'Cerca per azienda, nome completo, ruolo o settore.')} />}
                                    {activeTab === 'jobs' && filteredJobs.length === 0 && <EmptyState title={text('No matching postings', 'Nessun posting corrispondente')} description={text('Search by title, owner, company, industry, or location.', 'Cerca per titolo, responsabile, azienda, settore o località.')} />}
                                </div>
                            )}

                            {activeTab === 'bug_reports' && (
                                <AdminBugReports />
                            )}

                            {activeTab === 'logs' && (
                                <div className="space-y-6 animate-fade-in">
                                    <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">{text('System activity timeline', 'Timeline attività di sistema')}</h2>

                                                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
                                                    <label className="space-y-2">
                                                        <span className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                                                            {text('Type', 'Tipo')}
                                                        </span>
                                                        <select
                                                            value={logCategoryFilter}
                                                            onChange={(event) => setLogCategoryFilter(event.target.value as LogCategoryFilter)}
                                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition-colors focus:ring-2 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                                        >
                                                            <option value="all">{text('All activity', 'Tutta l’attività')}</option>
                                                            <option value="edge_function">{text('Edge Functions', 'Edge Function')}</option>
                                                            <option value="gemini">{text('Gemini', 'Gemini')}</option>
                                                            <option value="job_created">{text('Posting created', 'Posting creati')}</option>
                                                            <option value="profile_created">{text('Profiles created', 'Profili creati')}</option>
                                                        </select>
                                                    </label>

                                                    <label className="space-y-2">
                                                        <span className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                                                            {text('User', 'Utente')}
                                                        </span>
                                                        <select
                                                            value={logActorFilter}
                                                            onChange={(event) => setLogActorFilter(event.target.value)}
                                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition-colors focus:ring-2 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                                        >
                                                            <option value="all">{text('All users', 'Tutti gli utenti')}</option>
                                                            {logActorOptions.map((option) => (
                                                                <option key={option.value} value={option.value}>
                                                                    {option.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => void loadActivityLogs()}
                                                disabled={activityLogsLoading}
                                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                            >
                                                {activityLogsLoading ? <MiniSpinner /> : <RefreshIcon />}
                                                {activityLogsLoading ? text('Refreshing...', 'Aggiornamento...') : text('Refresh logs', 'Aggiorna log')}
                                            </button>
                                        </div>

                                        {activityLogsError ? (
                                            <div className="mt-6 rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                                                {activityLogsError}
                                            </div>
                                        ) : null}

                                        {activityLogsLoading && activityLogs.length === 0 ? (
                                            <div className="mt-8 flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                                                <Spinner />
                                                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                                                    {text('Loading the latest activity...', 'Caricamento attività più recenti...')}
                                                </p>
                                            </div>
                                        ) : filteredActivityLogs.length > 0 ? (
                                            <div className="mt-6 space-y-3">
                                                {filteredActivityLogs.map((log) => (
                                                    <ActivityLogCard key={log.id} log={log} />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="mt-6">
                                                <EmptyState
                                                    title={text('No matching logs', 'Nessun log corrispondente')}
                                                    description={text('Try another type or user filter to widen the timeline.', 'Prova un altro filtro per tipo o utente per ampliare la timeline.')}
                                                />
                                            </div>
                                        )}
                                    </section>
                                </div>
                            )}

                            {activeTab === 'ai_models' && (
                                <div className="space-y-8 animate-fade-in">
                                    <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div>
                                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{text('Admin', 'Admin')}</p>
                                                <h2 className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{text('System administrators', 'Amministratori di sistema')}</h2>
                                            </div>
                                        </div>

                                        <form onSubmit={handleCreateAdmin} className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)_minmax(0,0.95fr)_auto]">
                                            <input
                                                type="text"
                                                placeholder={text('Full name', 'Nome completo')}
                                                value={adminForm.fullName}
                                                onChange={(event) => setAdminForm((current) => ({ ...current, fullName: event.target.value }))}
                                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900"
                                            />
                                            <input
                                                type="email"
                                                required
                                                placeholder="admin@example.com"
                                                value={adminForm.email}
                                                onChange={(event) => setAdminForm((current) => ({ ...current, email: event.target.value }))}
                                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900"
                                            />
                                            <input
                                                type="password"
                                                required
                                                placeholder={text('Password', 'Password')}
                                                value={adminForm.password}
                                                onChange={(event) => setAdminForm((current) => ({ ...current, password: event.target.value }))}
                                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900"
                                            />
                                            <button
                                                type="submit"
                                                disabled={actionLoading.createAdmin}
                                                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-orange-500 dark:hover:bg-orange-400 dark:text-slate-950"
                                            >
                                                {actionLoading.createAdmin ? text('Creating...', 'Creazione...') : text('Create admin', 'Crea admin')}
                                            </button>
                                        </form>

                                        {adminFeedback.error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{adminFeedback.error}</p>}
                                        {adminFeedback.success && <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">{adminFeedback.success}</p>}

                                        {adminRows.length > 0 ? (
                                            <div className="mt-6 grid gap-4 xl:grid-cols-2">
                                                {adminRows.map((account) => (
                                                    <EntityCard
                                                        key={account.id}
                                                        badgeLabel={text('admin', 'admin')}
                                                        title={account.email}
                                                        subtitle={account.fullName}
                                                        detail={account.detailLine}
                                                        onCopy={() => copyToClipboard(account.email)}
                                                        onEdit={() => handleOpenAdminEdit(account)}
                                                        onDelete={() => handleDelete('user', account.id)}
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="mt-6">
                                                <EmptyState title={text('No admins yet', 'Nessun admin ancora disponibile')} description={text('Create the first administrator from the form above.', 'Crea il primo amministratore dal form qui sopra.')} />
                                            </div>
                                        )}
                                    </section>

                                    <div className="rounded-[30px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div>
                                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{text('AI Modules', 'Moduli AI')}</p>
                                                <h2 className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{text('Model configuration', 'Configurazione modelli')}</h2>
                                                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                                    {text(
                                                        'The selected model is sent to both Gemini projects: the primary key is used first, and the fallback key automatically takes over if the primary project hits quota or spend-cap limits.',
                                                        'Il modello selezionato viene inviato a entrambi i progetti Gemini: prima viene usata la chiave primaria, e la chiave fallback entra automaticamente in funzione se il progetto principale raggiunge quota o spend cap.'
                                                    )}
                                                </p>
                                            </div>

                                            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                                                <button
                                                    onClick={handleLocalizeExistingCandidates}
                                                    disabled={actionLoading.localizeCandidates || anyActionLoading}
                                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-200 text-sm font-semibold hover:bg-orange-100 dark:hover:bg-orange-950 transition-all disabled:opacity-50"
                                                >
                                                    {actionLoading.localizeCandidates ? <><MiniSpinner /> {text('Translating...', 'Traduzione...')}</> : text('Translate candidates IT/EN', 'Traduci candidati IT/EN')}
                                                </button>
                                                <button
                                                    onClick={handleRecomputeAllEmbeddings}
                                                    disabled={actionLoading.recomputeAll || anyActionLoading}
                                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200 text-sm font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-950 transition-all disabled:opacity-50"
                                                >
                                                    {actionLoading.recomputeAll ? <><MiniSpinner /> {text('Recomputing...', 'Ricalcolo...')}</> : text('Recompute All Embeddings', 'Ricalcola tutti gli embedding')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-[30px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
                                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                            <div className="max-w-3xl">
                                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{text('Email', 'Email')}</p>
                                                <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{text('Email', 'Email')}</h3>
                                                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                                    {text(
                                                        'When this switch is off, PeakTalent keeps saving requests and notifications, but every outgoing email sent through the PeakTalent mailbox is paused before the server tries to deliver it.',
                                                        'Quando questo switch è off, PeakTalent continua a salvare richieste e notifiche, ma tutte le email in uscita inviate tramite la casella PeakTalent vengono messe in pausa prima che il server provi a recapitarle.'
                                                    )}
                                                </p>
                                                <p className={`mt-3 text-sm font-semibold ${emailSendingEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                    {isEmailSettingLoading
                                                        ? text('Loading current email state...', 'Caricamento stato email...')
                                                        : emailSendingEnabled
                                                            ? text('Email delivery is active.', 'L’invio email è attivo.')
                                                            : text('Email delivery is paused.', 'L’invio email è in pausa.')}
                                                </p>
                                                {emailSettingError && (
                                                    <p className="mt-2 text-sm text-red-500 dark:text-red-400">{emailSettingError}</p>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={emailSendingEnabled}
                                                onClick={handleToggleEmailSending}
                                                disabled={isEmailSettingLoading || isEmailSettingSaving}
                                                className={`inline-flex min-w-[132px] items-center justify-between gap-4 rounded-full border px-4 py-3 text-sm font-black uppercase tracking-[0.2em] transition-all ${
                                                    emailSendingEnabled
                                                        ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200'
                                                        : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                                } disabled:opacity-60`}
                                            >
                                                <span>
                                                    {isEmailSettingSaving
                                                        ? text('Saving', 'Salvataggio')
                                                        : emailSendingEnabled
                                                            ? text('On', 'On')
                                                            : text('Off', 'Off')}
                                                </span>
                                                <span
                                                    className={`relative inline-flex h-7 w-12 rounded-full transition-colors ${
                                                        emailSendingEnabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                                                    }`}
                                                >
                                                    <span
                                                        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                                            emailSendingEnabled ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                    />
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="rounded-[30px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
                                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                            <div className="max-w-3xl">
                                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{text('Access', 'Accesso')}</p>
                                                <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{text('Google and Apple login', 'Login Google e Apple')}</h3>
                                                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                                    {text(
                                                        'Keep this off until the Google and Apple developer accounts are created and configured in Supabase. When off, candidates only see email and password login/registration.',
                                                        'Lascialo off finché non vengono creati e configurati su Supabase gli account Google e Apple. Quando è off, i candidati vedono solo login/registrazione con email e password.'
                                                    )}
                                                </p>
                                                <p className={`mt-3 text-sm font-semibold ${seekerOAuthEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                    {isSeekerOAuthLoading
                                                        ? text('Loading Google/Apple access state...', 'Caricamento stato accesso Google/Apple...')
                                                        : seekerOAuthEnabled
                                                            ? text('Google and Apple buttons are visible to candidates.', 'I pulsanti Google e Apple sono visibili ai candidati.')
                                                            : text('Google and Apple buttons are hidden. Missing Google/Apple account setup for now.', 'I pulsanti Google e Apple sono nascosti. Per ora manca da creare/configurare gli account Google e Apple.')}
                                                </p>
                                                {seekerOAuthError && (
                                                    <p className="mt-2 text-sm text-red-500 dark:text-red-400">{seekerOAuthError}</p>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={seekerOAuthEnabled}
                                                onClick={handleToggleSeekerOAuth}
                                                disabled={isSeekerOAuthLoading || isSeekerOAuthSaving}
                                                className={`inline-flex min-w-[132px] items-center justify-between gap-4 rounded-full border px-4 py-3 text-sm font-black uppercase tracking-[0.2em] transition-all ${
                                                    seekerOAuthEnabled
                                                        ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200'
                                                        : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                                } disabled:opacity-60`}
                                            >
                                                <span>
                                                    {isSeekerOAuthSaving
                                                        ? text('Saving', 'Salvataggio')
                                                        : seekerOAuthEnabled
                                                            ? text('On', 'On')
                                                            : text('Off', 'Off')}
                                                </span>
                                                <span
                                                    className={`relative inline-flex h-7 w-12 rounded-full transition-colors ${
                                                        seekerOAuthEnabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                                                    }`}
                                                >
                                                    <span
                                                        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                                            seekerOAuthEnabled ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                    />
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="rounded-[30px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
                                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                            <div className="max-w-3xl">
                                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{text('Recruiter candidates', 'Candidati recruiter')}</p>
                                                <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{text('All candidates option', 'Opzione tutti i candidati')}</h3>
                                                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                                    {text(
                                                        'When this switch is on, recruiters can also use the third scope in ranking to browse every candidate on the platform. When it is off, recruiters only see candidates who showed interest in the current role or candidates who already showed interest in at least one of their positions. Admins still always see all three scopes.',
                                                        'Quando questo switch è on, i recruiter possono usare anche la terza opzione del ranking per vedere tutti i candidati della piattaforma. Quando è off, i recruiter vedono solo chi ha mostrato interesse per il ruolo corrente oppure chi ha mostrato interesse in almeno una delle loro posizioni. Gli admin continuano comunque a vedere sempre tutte e tre le opzioni.'
                                                    )}
                                                </p>
                                                <p className={`mt-3 text-sm font-semibold ${recruiterAllCandidatesEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                    {isRecruiterAllCandidatesLoading
                                                        ? text('Loading recruiter visibility state...', 'Caricamento stato visibilità recruiter...')
                                                        : recruiterAllCandidatesEnabled
                                                            ? text('Recruiters can open the all candidates scope.', 'I recruiter possono aprire la vista tutti i candidati.')
                                                            : text('Recruiters only see their own candidate scopes.', 'I recruiter vedono solo i propri scope candidati.')}
                                                </p>
                                                {recruiterAllCandidatesError && (
                                                    <p className="mt-2 text-sm text-red-500 dark:text-red-400">{recruiterAllCandidatesError}</p>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={recruiterAllCandidatesEnabled}
                                                onClick={handleToggleRecruiterAllCandidates}
                                                disabled={isRecruiterAllCandidatesLoading || isRecruiterAllCandidatesSaving}
                                                className={`inline-flex min-w-[132px] items-center justify-between gap-4 rounded-full border px-4 py-3 text-sm font-black uppercase tracking-[0.2em] transition-all ${
                                                    recruiterAllCandidatesEnabled
                                                        ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200'
                                                        : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                                } disabled:opacity-60`}
                                            >
                                                <span>
                                                    {isRecruiterAllCandidatesSaving
                                                        ? text('Saving', 'Salvataggio')
                                                        : recruiterAllCandidatesEnabled
                                                            ? text('On', 'On')
                                                            : text('Off', 'Off')}
                                                </span>
                                                <span
                                                    className={`relative inline-flex h-7 w-12 rounded-full transition-colors ${
                                                        recruiterAllCandidatesEnabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                                                    }`}
                                                >
                                                    <span
                                                        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                                            recruiterAllCandidatesEnabled ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                    />
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="rounded-[30px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
                                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                            <div className="max-w-3xl">
                                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{text('Candidate settings', 'Impostazioni candidati')}</p>
                                                <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{text('Profile visibility setting', 'Impostazione visibilità profilo')}</h3>
                                                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                                    {text(
                                                        'When this switch is off, candidates do not see the profile visibility control and every profile is treated as visible to recruiters. When it is on, candidates can choose whether their profile is visible or private.',
                                                        'Quando questo switch è off, i candidati non vedono il controllo di visibilità profilo e ogni profilo viene trattato come visibile ai recruiter. Quando è on, i candidati possono scegliere se rendere il profilo visibile o privato.'
                                                    )}
                                                </p>
                                                <p className={`mt-3 text-sm font-semibold ${candidateProfileVisibilitySettingEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                    {isCandidateProfileVisibilitySettingLoading
                                                        ? text('Loading candidate visibility state...', 'Caricamento stato visibilità candidati...')
                                                        : candidateProfileVisibilitySettingEnabled
                                                            ? text('Candidates can manage profile visibility.', 'I candidati possono gestire la visibilità profilo.')
                                                            : text('Profile visibility is hidden and profiles are active by default.', 'La visibilità profilo è nascosta e i profili sono attivi di default.')}
                                                </p>
                                                {candidateProfileVisibilitySettingError && (
                                                    <p className="mt-2 text-sm text-red-500 dark:text-red-400">{candidateProfileVisibilitySettingError}</p>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={candidateProfileVisibilitySettingEnabled}
                                                onClick={handleToggleCandidateProfileVisibilitySetting}
                                                disabled={isCandidateProfileVisibilitySettingLoading || isCandidateProfileVisibilitySettingSaving}
                                                className={`inline-flex min-w-[132px] items-center justify-between gap-4 rounded-full border px-4 py-3 text-sm font-black uppercase tracking-[0.2em] transition-all ${
                                                    candidateProfileVisibilitySettingEnabled
                                                        ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200'
                                                        : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                                } disabled:opacity-60`}
                                            >
                                                <span>
                                                    {isCandidateProfileVisibilitySettingSaving
                                                        ? text('Saving', 'Salvataggio')
                                                        : candidateProfileVisibilitySettingEnabled
                                                            ? text('On', 'On')
                                                            : text('Off', 'Off')}
                                                </span>
                                                <span
                                                    className={`relative inline-flex h-7 w-12 rounded-full transition-colors ${
                                                        candidateProfileVisibilitySettingEnabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                                                    }`}
                                                >
                                                    <span
                                                        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                                            candidateProfileVisibilitySettingEnabled ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                    />
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {(Object.keys(AI_TASK_META) as AITaskKey[]).map(taskKey => {
                                            const meta = AI_TASK_META[taskKey];
                                            const isEmbedding = taskKey === 'embedding';
                                            const catalog = isEmbedding ? EMBEDDING_CATALOG : MODEL_CATALOG;
                                            const currentModel = modelSettings[taskKey];
                                            const isOverridden = hasOverride(taskKey);

                                            return (
                                                <div key={taskKey} className="bg-white dark:bg-slate-950 p-5 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
                                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                                                {meta.label}
                                                                {isOverridden && (
                                                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 tracking-widest">
                                                                        Custom
                                                                    </span>
                                                                )}
                                                            </h4>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{meta.description}</p>
                                                        </div>

                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            <select
                                                                value={currentModel}
                                                                onChange={(e) => {
                                                                    const value = e.target.value;
                                                                    setModelOverride(taskKey, value === getCodeDefault(taskKey) ? null : value);
                                                                    setModelSettings(getAllModels());
                                                                }}
                                                                className="text-sm border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:outline-none min-w-[220px]"
                                                            >
                                                                {catalog.map(model => (
                                                                    <option key={model.id} value={model.id}>
                                                                        {model.label}{model.id === getCodeDefault(taskKey) ? ' (default)' : ''}
                                                                    </option>
                                                                ))}
                                                            </select>

                                                            {isOverridden && (
                                                                <button
                                                                    onClick={() => {
                                                                        setModelOverride(taskKey, null);
                                                                        setModelSettings(getAllModels());
                                                                    }}
                                                                    className="text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors p-1"
                                                                    title="Reset to default"
                                                                >
                                                                    <RefreshIcon />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <p className="text-[10px] text-slate-400 mt-2 font-mono">
                                                        Code default: {getCodeDefault(taskKey)}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
                                        <p className="text-xs text-slate-400">
                                            Model choices are saved only in this browser. Clearing overrides removes your local selections and restores the code defaults for every task.
                                        </p>
                                        <button
                                            onClick={() => {
                                                resetAllOverrides();
                                                setModelSettings(getAllModels());
                                                showToast('All models reset to defaults');
                                            }}
                                            className="text-sm font-bold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 transition-colors uppercase tracking-wider"
                                        >
                                            Clear Browser Overrides
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </main>
            </div>
        </div>
    );
};

const MiniSpinner = () => (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
    </svg>
);

const AdminModalShell = ({
    children,
    maxWidthClassName = 'max-w-2xl',
}: {
    children: React.ReactNode;
    maxWidthClassName?: string;
}) => (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/78 p-4 backdrop-blur-md">
        <div className={`w-full ${maxWidthClassName} overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950`}>
            {children}
        </div>
    </div>
);

const StatusPill = ({
    tone,
    children,
}: {
    tone: DialogTone;
    children: React.ReactNode;
}) => {
    const toneClassName = {
        danger: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
        warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
        info: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    }[tone];

    return (
        <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] ${toneClassName}`}>
            {children}
        </span>
    );
};

const TabButton = ({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) => (
    <button
        onClick={onClick}
        className={`w-full rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 ${active ? 'border-slate-900 bg-slate-900 text-white shadow-lg dark:border-orange-500 dark:bg-orange-500' : 'border-transparent bg-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900'}`}
    >
        <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-semibold leading-tight">{label}</p>
            {count !== undefined && (
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${active ? 'bg-white/15 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>
                    {count}
                </span>
            )}
        </div>
    </button>
);

const formatLogPurposeLabel = (value?: string | null) =>
    (value || '')
        .replace(/^job_/, '')
        .replace(/^candidate_/, '')
        .replace(/^recruiter_/, '')
        .replace(/_/g, ' ')
        .trim();

const ActivityLogCard: React.FC<{ log: ActivityLogRecord }> = ({ log }) => {
    const { text } = useLanguage();
    const eventLabelMap: Record<string, string> = {
        gemini_call: text('Gemini', 'Gemini'),
        edge_function_call: text('Edge Function', 'Edge Function'),
        candidate_profile_created: text('Candidate Created', 'Candidato creato'),
        candidate_profile_saved: text('Candidate Profile', 'Profilo candidato'),
        recruiter_created: text('Recruiter Created', 'Recruiter creato'),
        recruiter_profile_saved: text('Recruiter Profile', 'Profilo recruiter'),
        admin_created: text('Admin Created', 'Admin creato'),
        job_created: text('Posting Created', 'Posting creato'),
        job_updated: text('Posting Updated', 'Posting aggiornato'),
    };

    const eventLabel = eventLabelMap[log.event_type] || formatLogPurposeLabel(log.event_type) || text('Activity', 'Attività');
    const actorLabel = log.effective_name || log.effective_email || log.actor_email || text('Unknown user', 'Utente sconosciuto');
    const purposeLabel = formatLogPurposeLabel(log.purpose) || text('general operation', 'operazione generale');
    const providerLabel = log.provider_slot === 'fallback'
        ? text('Fallback', 'Fallback')
        : log.provider_slot === 'primary'
            ? text('Primary', 'Primaria')
            : null;
    const errorMessage = typeof log.metadata?.error_message === 'string' ? log.metadata.error_message : '';

    return (
        <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${log.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {eventLabel}
                        </span>
                        {log.function_name && (
                            <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                                {log.function_name}
                            </span>
                        )}
                        {providerLabel && (
                            <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${log.provider_slot === 'fallback' ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                                {providerLabel}
                            </span>
                        )}
                        {log.model_id && (
                            <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                                {log.model_id.replace(/^models\//, '')}
                            </span>
                        )}
                    </div>

                    <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
                        {log.summary}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>{text('Who', 'Chi')}: {actorLabel}</span>
                        <span>{text('Purpose', 'Scopo')}: {purposeLabel}</span>
                        {log.entity_label && <span>{text('Entity', 'Entità')}: {log.entity_label}</span>}
                        {log.is_impersonating && <span>{text('Admin impersonation', 'Impersonazione admin')}</span>}
                    </div>

                    {log.status === 'error' && errorMessage && (
                        <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                            {errorMessage}
                        </p>
                    )}
                </div>

                <span className="shrink-0 text-xs font-medium text-slate-400">
                    {new Date(log.created_at).toLocaleString()}
                </span>
            </div>
        </div>
    );
};

const OverviewMetric = ({
    icon,
    label,
    value,
    detail,
    percent,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    detail: string;
    percent: number | null;
}) => {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const normalizedPercent = percent === null ? 0 : Math.max(0, Math.min(100, percent));
    const strokeOffset = circumference - (normalizedPercent / 100) * circumference;

    return (
        <div className="flex flex-col items-center text-center">
            <div className="relative h-28 w-28 sm:h-[120px] sm:w-[120px]">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
                    <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200 dark:text-slate-800" />
                    <circle
                        cx="60"
                        cy="60"
                        r={radius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeOffset}
                        className={percent === null ? 'text-slate-300 dark:text-slate-700' : 'text-orange-500 dark:text-orange-400'}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[26px] font-black tracking-tight text-slate-950 dark:text-white">{value}</span>
                </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-orange-500 dark:bg-slate-900 dark:text-orange-400">
                    {icon}
                </span>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
            </div>
            {detail ? <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">{detail}</p> : null}
        </div>
    );
};

const MetricCircle = ({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'orange' | 'blue' | 'amber' | 'teal' }) => {
    const toneClasses = {
        slate: 'from-slate-900 to-slate-700 text-white',
        orange: 'from-orange-500 to-amber-500 text-white',
        blue: 'from-blue-600 to-cyan-500 text-white',
        amber: 'from-amber-400 to-orange-500 text-white',
        teal: 'from-teal-500 to-emerald-500 text-white',
    }[tone];

    return (
        <div className={`relative flex h-[120px] w-[120px] shrink-0 flex-col items-center justify-center rounded-full bg-gradient-to-br ${toneClasses} px-4 text-center shadow-lg ring-4 ring-white/20 sm:h-[130px] sm:w-[130px]`}>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">{label}</p>
            <p className="mt-3 text-[28px] font-black leading-none sm:text-[32px]">{value}</p>
        </div>
    );
};

const formatBytes = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return '—';
    if (value >= 1024 * 1024 * 1024) {
        return `${(value / (1024 * 1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 * 1024 ? 0 : 1)} GB`;
    }
    if (value >= 1024 * 1024) {
        return `${(value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
    }
    if (value >= 1024) {
        return `${(value / 1024).toFixed(1)} KB`;
    }
    return `${Math.max(0, Math.round(value))} B`;
};

const formatCount = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return '—';
    return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
};

const parsePositiveCountEnv = (value: unknown, fallback: number | null = null) => {
    if (typeof value !== 'string') return fallback;
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const formatUsageRatio = (used: number | null, limit: number | null) => {
    if (used === null && limit === null) return '—';
    if (used === null) return `— / ${formatBytes(limit)}`;
    if (limit === null) return formatBytes(used);
    return `${formatBytes(used)} / ${formatBytes(limit)}`;
};

const formatCountRatio = (used: number | null, limit: number | null) => {
    if (used === null && limit === null) return '—';
    if (used === null) return `— / ${formatCount(limit)}`;
    if (limit === null) return formatCount(used);
    return `${formatCount(used)} / ${formatCount(limit)}`;
};

const getUsagePercent = (used: number | null, limit: number | null) => {
    if (used === null || limit === null || limit <= 0) return null;
    return Math.max(0, Math.min(100, (used / limit) * 100));
};

const getUsageToneClassName = (percent: number | null) => {
    if (percent === null) return 'bg-slate-300 dark:bg-slate-700';
    if (percent >= 85) return 'bg-red-500';
    if (percent >= 60) return 'bg-amber-500';
    return 'bg-emerald-500';
};

const UsageMeter = ({
    label,
    valueLabel,
    helper,
    percent,
}: {
    label: string;
    valueLabel: string;
    helper: string;
    percent: number | null;
}) => (
    <div className="rounded-[24px] border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
            <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{label}</p>
                <p className="mt-3 text-xl font-black text-slate-900 dark:text-slate-100">{valueLabel}</p>
            </div>
            {percent !== null && (
                <span className="rounded-full bg-slate-200/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {Math.round(percent)}%
                </span>
            )}
        </div>
        <div className="mt-4 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
                className={`h-full rounded-full transition-all ${getUsageToneClassName(percent)}`}
                style={{ width: `${percent === null ? 24 : Math.max(8, percent)}%` }}
            />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{helper}</p>
    </div>
);

const SupabaseUsageCard = ({
    title,
    subtitle,
    dbLabel,
    storageLabel,
    apiLabel,
    measuredLabel,
    budgetMissingLabel,
    trackingMissingLabel,
    usage,
}: {
    title: string;
    subtitle: string;
    dbLabel: string;
    storageLabel: string;
    apiLabel: string;
    measuredLabel: string;
    budgetMissingLabel: string;
    trackingMissingLabel: string;
    usage: SupabaseUsageSnapshot | null;
}) => {
    const { text } = useLanguage();
    const dbPercent = getUsagePercent(usage?.databaseUsedBytes ?? null, usage?.databaseLimitBytes ?? null);
    const storagePercent = getUsagePercent(usage?.storageUsedBytes ?? null, usage?.storageLimitBytes ?? null);
    const apiPercent = getUsagePercent(usage?.apiRequestsUsed ?? null, usage?.apiRequestsLimit ?? null);
    const measuredAtLabel = usage?.measuredAt
        ? new Date(usage.measuredAt).toLocaleString()
        : '—';
    const localizedNotes = (usage?.notes || []).map((note) => {
        if (note === 'Run supabase/admin_supabase_usage.sql in Supabase SQL Editor to enable live DB and storage usage.') {
            return text(
                'Run supabase/admin_supabase_usage.sql in Supabase SQL Editor to enable live DB and storage usage.',
                'Esegui supabase/admin_supabase_usage.sql nel Supabase SQL Editor per abilitare le metriche live di database e storage.'
            );
        }
        if (note === 'Supabase DB/storage usage could not be loaded from the admin RPC.') {
            return text(
                'Supabase DB/storage usage could not be loaded from the admin RPC.',
                'Le metriche di database e storage non sono state caricate dalla RPC admin.'
            );
        }
        if (note === 'Set VITE_SUPABASE_PROJECT_REF and VITE_SUPABASE_MANAGEMENT_TOKEN to show tracked API requests.') {
            return text(
                'Set VITE_SUPABASE_PROJECT_REF and VITE_SUPABASE_MANAGEMENT_TOKEN to show tracked API requests.',
                'Imposta VITE_SUPABASE_PROJECT_REF e VITE_SUPABASE_MANAGEMENT_TOKEN per mostrare le richieste API tracciate.'
            );
        }
        if (note === 'Set VITE_SUPABASE_API_REQUEST_LIMIT if you also want to see the remaining request budget.') {
            return text(
                'Set VITE_SUPABASE_API_REQUEST_LIMIT if you also want to see the remaining request budget.',
                'Imposta VITE_SUPABASE_API_REQUEST_LIMIT se vuoi vedere anche il budget richieste residuo.'
            );
        }
        if (note === 'Supabase management API did not return a tracked API request count.') {
            return text(
                'Supabase management API did not return a tracked API request count.',
                'La Management API di Supabase non ha restituito un conteggio richieste API tracciato.'
            );
        }
        if (note === 'Supabase management API metrics are currently unavailable on this environment.') {
            return text(
                'Supabase management API metrics are currently unavailable on this environment.',
                'Le metriche della Management API di Supabase non sono attualmente disponibili in questo ambiente.'
            );
        }
        if (note.startsWith('Supabase management API error: ')) {
            const detail = note.replace('Supabase management API error: ', '');
            return text(
                `Supabase management API error: ${detail}`,
                `Errore Management API di Supabase: ${detail}`
            );
        }
        return note;
    });

    return (
        <section className="rounded-[30px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">{title}</h2>
                </div>
                <span className="text-sm text-slate-400">{measuredLabel}: {measuredAtLabel}</span>
            </div>

            <div className="mt-8 grid gap-4 xl:grid-cols-3">
                <UsageMeter
                    label={dbLabel}
                    valueLabel={formatUsageRatio(usage?.databaseUsedBytes ?? null, usage?.databaseLimitBytes ?? null)}
                    helper={usage?.databaseLimitBytes !== null
                        ? text('Current database size against the configured or detected disk allowance.', 'Dimensione corrente del database rispetto alla quota disco configurata o rilevata.')
                        : text('Current database size. Add a plan or DB limit to compare it against an allowance.', 'Dimensione corrente del database. Aggiungi un piano o un limite DB per confrontarlo con una quota.')}
                    percent={dbPercent}
                />
                <UsageMeter
                    label={storageLabel}
                    valueLabel={formatUsageRatio(usage?.storageUsedBytes ?? null, usage?.storageLimitBytes ?? null)}
                    helper={usage?.storageLimitBytes !== null
                        ? text('Sum of all objects stored in Supabase buckets versus the configured storage allowance.', 'Somma di tutti gli oggetti salvati nei bucket Supabase rispetto alla quota storage configurata.')
                        : text('Current Supabase storage size. Add a storage limit to compare it against an allowance.', 'Dimensione storage corrente di Supabase. Aggiungi un limite storage per confrontarla con una quota.')}
                    percent={storagePercent}
                />
                <UsageMeter
                    label={apiLabel}
                    valueLabel={formatCountRatio(usage?.apiRequestsUsed ?? null, usage?.apiRequestsLimit ?? null)}
                    helper={!usage?.apiRequestsAvailable
                        ? trackingMissingLabel
                        : usage.apiRequestsLimit === null
                            ? budgetMissingLabel
                            : text('Tracked API requests against your configured request budget.', 'Richieste API tracciate rispetto al budget richieste configurato.')}
                    percent={apiPercent}
                />
            </div>

            {localizedNotes.length ? (
                <div className="mt-5 rounded-[24px] border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-4 py-4">
                    <ul className="space-y-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                        {localizedNotes.map((note) => (
                            <li key={note} className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                                <span>{note}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
};

const ExportToggle = ({
    active,
    title,
    detail,
    onClick,
}: {
    active: boolean;
    title: string;
    detail: string;
    onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`rounded-[22px] border px-4 py-4 text-left transition-all ${active ? 'border-slate-900 bg-slate-900 text-white shadow-lg dark:border-orange-500 dark:bg-orange-500' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900'}`}
    >
        <p className="text-sm font-semibold">{title}</p>
        <p className={`mt-1 text-xs leading-relaxed ${active ? 'text-white/75' : 'text-slate-400'}`}>{detail}</p>
    </button>
);

const ExportStatCard = ({
    label,
    value,
}: {
    label: string;
    value: number;
}) => (
    <div className="rounded-[24px] border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-4 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{label}</p>
        <p className="mt-3 text-2xl font-black text-slate-900 dark:text-slate-100">{value}</p>
    </div>
);

const FactoryControlCard = ({
    label,
    description,
    value,
    onChange,
    onSubmit,
    loading,
    progress,
    disabled,
}: {
    label: string;
    description: string;
    value: number;
    onChange: (value: string) => void;
    onSubmit: () => void;
    loading: boolean;
    progress: { current: number; total: number } | null;
    disabled: boolean;
}) => (
    <form
        className="rounded-2xl border border-orange-200/70 dark:border-orange-900/50 bg-white/80 dark:bg-slate-950/60 px-4 py-4"
        onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
        }}
    >
        <div className="flex items-start justify-between gap-4">
            <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{description}</p>
            </div>
            {progress && (
                <span className="text-xs font-semibold text-orange-600 dark:text-orange-300">
                    {progress.current}/{progress.total}
                </span>
            )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
                type="number"
                min={1}
                max={50}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full sm:w-28 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
                type="submit"
                disabled={disabled || loading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
            >
                {loading && <MiniSpinner />}
                Generate
            </button>
        </div>
    </form>
);

interface EntityCardProps {
    badgeLabel: string;
    badgeAccessory?: React.ReactNode;
    title: string;
    subtitle: string;
    detail: string;
    onCopy?: () => void;
    onEdit?: () => void;
    onDelete: () => void;
    onLoginAs?: () => void;
    onResetPassword?: () => void;
    editTitle?: string;
    loginTitle?: string;
}

const EntityCard: React.FC<EntityCardProps> = ({
    badgeLabel,
    badgeAccessory,
    title,
    subtitle,
    detail,
    onCopy,
    onEdit,
    onDelete,
    onLoginAs,
    onResetPassword,
    editTitle,
    loginTitle,
}) => {
    const { text } = useLanguage();

    return (
        <div className="rounded-[26px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 shadow-sm hover:border-orange-300 dark:hover:border-orange-800 transition-all">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                            {badgeLabel}
                        </span>
                        {badgeAccessory}
                    </div>
                </div>

                <div className="ml-4 flex flex-shrink-0 items-center gap-1">
                    {onCopy && (
                        <button onClick={onCopy} className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-xl transition-all" title={text('Copy email', 'Copia email')}>
                            <CopyIcon />
                        </button>
                    )}
                    {onLoginAs && (
                        <button onClick={onLoginAs} className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-xl transition-all" title={loginTitle || text('Open portal as this user', 'Apri il portale come questo utente')}>
                            <LoginIcon />
                        </button>
                    )}
                    {onResetPassword && (
                        <button onClick={onResetPassword} className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950 rounded-xl transition-all" title={text('Reset password', 'Resetta password')}>
                            <KeyIcon />
                        </button>
                    )}
                    {onEdit && (
                        <button onClick={onEdit} className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950 rounded-xl transition-all" title={editTitle || text('Edit', 'Modifica')}>
                            <EditIcon />
                        </button>
                    )}
                    <button onClick={onDelete} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-xl transition-all" title={text('Delete', 'Elimina')}>
                        <TrashIcon />
                    </button>
                </div>
            </div>
            <div className="mt-4 min-w-0">
                <p className="w-full break-all text-base font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                <p className="mt-1 w-full text-sm text-slate-500 dark:text-slate-300">{subtitle}</p>
                <p className="mt-3 w-full text-sm leading-relaxed text-slate-400">{detail}</p>
            </div>
        </div>
    );
};

const EmptyState = ({ title, description }: { title: string; description: string }) => (
    <div className="rounded-[28px] border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-10 text-center xl:col-span-2">
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{description}</p>
    </div>
);

const ProvisioningCard = ({
    eyebrow,
    title,
    description,
    footerAction,
    children,
}: {
    eyebrow: string;
    title: string;
    description: string;
    footerAction?: React.ReactNode;
    children: React.ReactNode;
}) => (
    <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-5 flex items-start justify-between gap-4">
            <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{eyebrow}</p>
                <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
            </div>
            {footerAction}
        </div>
        {children}
    </section>
);

const ProvisionInput = ({
    value,
    onChange,
    placeholder,
    type = 'text',
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    type?: string;
}) => (
    <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900"
    />
);

const ProvisionTextarea = ({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
}) => (
    <textarea
        rows={3}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900"
    />
);

interface ProvisionedAccountCardProps {
    account: ProvisionedAccountRecord;
    onCopy: () => void;
}

const ProvisionedAccountCard: React.FC<ProvisionedAccountCardProps> = ({
    account,
    onCopy,
}) => {
    const { text } = useLanguage();

    return (
        <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm dark:bg-slate-950 dark:text-slate-300">
                        {account.role}
                    </span>
                    <p className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">{account.fullName}</p>
                    <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">{account.email}</p>
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{account.lineOne || text('Profile created', 'Profilo creato')}</p>
                    {account.lineTwo && <p className="mt-1 text-sm text-slate-400">{account.lineTwo}</p>}
                    <p className="mt-3 text-xs font-mono text-slate-400">{account.password}</p>
                </div>

                <button onClick={onCopy} className="rounded-xl p-2 text-slate-400 transition-all hover:bg-white hover:text-indigo-500 dark:hover:bg-slate-950" title={text('Copy email and password', 'Copia email e password')}>
                    <CopyIcon />
                </button>
            </div>
        </div>
    );
};

export default DebugView;
