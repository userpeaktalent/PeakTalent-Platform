import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SeekerPage } from '../App';
import { JobProfile, CandidateProfile, RecommendedJob, Notification } from '../types';
import { getAllJobs, getCandidateAssessmentStatuses, getJobsForCandidate, getNotifications } from '../services/dbService';
import { recommendJobsForCandidate, calculateMatchScore } from '../services/matchingService';
import { AiBanner, Spinner } from './common';
import { useLanguage } from './LanguageProvider';
import { useAuth } from './AuthProvider';
import CompanyLogo from './CompanyLogo';
import {
    SEEKER_MATCH_CACHE_INVALIDATED_EVENT,
    getSeekerMatchCache,
    invalidateSeekerMatchCache,
    setSeekerMatchCache,
} from '../utils/seekerMatchCache';

const SEEKER_DASHBOARD_SCROLL_STORAGE_KEY = 'peaktalent:seeker-dashboard-scroll-y';

interface JobSeekerHomePageProps {
    setPage: (page: SeekerPage, data?: any) => void;
    candidate: CandidateProfile;
}

// Re-export for call sites that still import the cache-invalidation helper from this module.
export { invalidateSeekerMatchCache };
const buildCandidateMatchSignature = (candidate: CandidateProfile): string => JSON.stringify({
    id: candidate.id,
    summary_text: candidate.summary_text || '',
    current_job_function: candidate.current_job_function || '',
    current_seniority_level: candidate.current_seniority_level || '',
    ai_refined: Boolean(candidate.ai_refined),
    ai_refined_at: candidate.ai_refined_at || '',
    embedding_updated_at: candidate.embedding_updated_at || '',
    embedding_hash: candidate.embedding_input_hash || '',
    skills: (candidate.skills || []).map((skill) => `${skill.skill_name}:${skill.level}:${skill.rank}:${skill.level_confidence}`).sort(),
    it_skills: (candidate.it_skills || []).map((skill) => `${skill.skill_name}:${skill.level}:${skill.rank}:${skill.level_confidence}`).sort(),
    soft_skills: (candidate.soft_skills || []).map((skill) => skill.skill_name).sort(),
    target_job_functions: [...(candidate.target_job_functions || [])].sort(),
    industry_experience: [...(candidate.industry_experience || [])].sort(),
    education: (candidate.education || []).map((entry) => `${entry.degree_level}:${entry.major}:${entry.specialization || ''}:${entry.from}:${entry.to}`).sort(),
    experiences: (candidate.experiences || []).map((entry) => `${entry.role}:${entry.company}:${entry.from}:${entry.to}:${entry.is_current_position ? '1' : '0'}`).sort(),
    preferences: {
        remote: candidate.preferences?.remote || '',
        visa_sponsorship: candidate.preferences?.visa_sponsorship ?? null,
        relocation_support: candidate.preferences?.relocation_support ?? null,
        locations: (candidate.preferences?.preferred_locations || []).map((location) => `${location.country}:${location.city || ''}`).sort(),
    },
});

const getMatchIndicator = (matchPercent: number) => {
    if (matchPercent > 50) {
        return {
            label: 'HIGH MATCH',
            className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
        };
    }

    if (matchPercent >= 30) {
        return {
            label: 'MID MATCH',
            className: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
        };
    }

    return {
        label: 'LOW MATCH',
        className: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
    };
};

const JobMatchCard: React.FC<{
    recommendation: RecommendedJob;
    badgeLabel: string;
    actionLabel: string;
    onView: (job: JobProfile) => void;
}> = ({ recommendation, badgeLabel, actionLabel, onView }) => {
    const { text } = useLanguage();
    const { job } = recommendation;
    const companyLine = job.company_name || (Array.isArray(job.industry) ? job.industry.join(', ') : job.industry);

    return (
        <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950">
            <div>
                <div className="mb-4 flex items-start justify-between gap-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${
                        badgeLabel.toLowerCase().includes('complete') || badgeLabel.toLowerCase().includes('complet')
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : badgeLabel.toLowerCase().includes('quiz') || badgeLabel.toLowerCase().includes('assessment') || badgeLabel.toLowerCase().includes('valutazione')
                                ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
                                : badgeLabel.toLowerCase().includes('interest') || badgeLabel.toLowerCase().includes('interesse')
                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                        {badgeLabel}
                    </span>
                </div>

                <div className="flex items-start gap-3">
                    <CompanyLogo
                        logoUrl={job.company_logo_url}
                        companyName={job.company_name}
                        size="sm"
                        className="shrink-0"
                    />
                    <div className="min-w-0">
                        <h3 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{job.title}</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {companyLine} • {job.constraints.location.city}
                        </p>
                    </div>
                </div>

                <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {job.summary_text}
                </p>
            </div>

            <button
                onClick={() => onView(job)}
                className="mt-6 rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-brand-500/10 transition-colors hover:bg-brand-600"
            >
                {actionLabel || text('View Details', 'Vedi dettagli')}
            </button>
        </div>
    );
};

const JobMatchRow: React.FC<{
    recommendation: RecommendedJob;
    badgeLabel: string;
    onView: (job: JobProfile) => void;
}> = ({ recommendation, badgeLabel, onView }) => {
    const { job, score } = recommendation;
    const companyLine = job.company_name || (Array.isArray(job.industry) ? job.industry.join(', ') : job.industry);
    const matchPercent = Math.round(Math.max(0, Math.min(1, score)) * 100);
    const matchIndicator = getMatchIndicator(matchPercent);
    const isComplete = badgeLabel.toLowerCase().includes('complete') || badgeLabel.toLowerCase().includes('complet');

    return (
        <li>
            <button
                type="button"
                onClick={() => onView(job)}
                className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:hover:bg-slate-900/60 dark:focus:bg-slate-900/60"
                aria-label={`${job.title} — ${companyLine}`}
            >
                <CompanyLogo
                    logoUrl={job.company_logo_url}
                    companyName={job.company_name}
                    size="sm"
                    className="shrink-0"
                />

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                            {job.title}
                        </h3>
                        {isComplete && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                {badgeLabel}
                            </span>
                        )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {companyLine}
                        {job.constraints?.location?.city ? ` • ${job.constraints.location.city}` : ''}
                    </p>
                </div>

                <div className="hidden shrink-0 items-center justify-end sm:flex">
                    <span className={`inline-flex min-w-24 justify-center rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] ring-1 ${matchIndicator.className}`}>
                        {matchIndicator.label}
                    </span>
                </div>

                <svg
                    className="h-5 w-5 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-slate-600 dark:group-hover:text-brand-300"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
            </button>
        </li>
    );
};

const ProfileStrengthRing: React.FC<{ value: number }> = ({ value }) => {
    const { text } = useLanguage();
    const radius = 72;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (value / 100) * circumference;
    const strokeColor = value >= 80 ? '#16a34a' : value >= 50 ? '#f97316' : '#ef4444';

    return (
        <div className="relative flex h-44 w-44 items-center justify-center sm:h-52 sm:w-52">
            <svg className="h-44 w-44 -rotate-90 sm:h-52 sm:w-52" viewBox="0 0 180 180" aria-hidden="true">
                <circle cx="90" cy="90" r={radius} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="12" />
                <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    className="transition-all duration-700 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl dark:text-slate-100">{value}%</span>
                <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">{text('Complete', 'Completo')}</span>
            </div>
        </div>
    );
};

const ProgressChecklist: React.FC<{
    items: { label: string; hint: string; done: boolean }[];
}> = ({ items }) => (
    <div className="space-y-3">
        {items.map((item, index) => (
            <div
                key={item.label}
                className={`rounded-2xl border px-4 py-3 ${item.done
                    ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                    : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40'
                    }`}
            >
                <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${item.done
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-slate-500 shadow-sm dark:bg-slate-950 dark:text-slate-300'
                        } shrink-0 flex-none aspect-square leading-none`}>
                        {item.done ? '✓' : index + 1}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.hint}</p>
                    </div>
                </div>
            </div>
        ))}
    </div>
);

const SectionHeader: React.FC<{
    icon: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-orange-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                {icon}
            </div>
            <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">{title}</h2>
                {description && (
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                        {description}
                    </p>
                )}
            </div>
        </div>
        {action}
    </div>
);

const ActiveJobRow: React.FC<{
    recommendation: RecommendedJob;
    badgeLabel: string;
    onView: (job: JobProfile) => void;
}> = ({ recommendation, badgeLabel, onView }) => {
    const { job } = recommendation;
    const companyLine = job.company_name || (Array.isArray(job.industry) ? job.industry.join(', ') : job.industry);
    const normalizedBadgeLabel = badgeLabel.toLowerCase();
    const badgeClassName =
        normalizedBadgeLabel.includes('complete') || normalizedBadgeLabel.includes('complet')
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900'
            : normalizedBadgeLabel.includes('questionnaire') || normalizedBadgeLabel.includes('questionario')
                ? 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900'
                : 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';

    return (
        <li>
            <button
                type="button"
                onClick={() => onView(job)}
                className="group flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 dark:hover:bg-slate-900/60 dark:focus:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between"
            >
                <div className="flex min-w-0 items-start gap-3">
                    <CompanyLogo
                        logoUrl={job.company_logo_url}
                        companyName={job.company_name}
                        size="sm"
                        className="shrink-0"
                    />
                    <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-slate-950 dark:text-slate-100">{job.title}</h3>
                        <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                            {companyLine}
                            {job.constraints?.location?.city ? ` • ${job.constraints.location.city}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${badgeClassName}`}>
                        {badgeLabel}
                    </span>
                    <svg
                        className="h-5 w-5 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-orange-500 dark:text-slate-600 dark:group-hover:text-orange-300"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                    >
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                </div>
            </button>
        </li>
    );
};

const JobSeekerHomePage: React.FC<JobSeekerHomePageProps> = ({ setPage, candidate }) => {
    const { text, language } = useLanguage();
    const { effectiveProfileId } = useAuth();
    const candidateMatchSignature = useMemo(() => buildCandidateMatchSignature(candidate), [candidate]);
    const initialCache = getSeekerMatchCache();
    const isCacheValid =
        initialCache?.candidateId === candidate.id &&
        initialCache?.candidateSignature === candidateMatchSignature;
    const [recommendations, setRecommendations] = useState<RecommendedJob[]>(isCacheValid && initialCache ? initialCache.recommendations : []);
    const [invitations, setInvitations] = useState<RecommendedJob[]>(isCacheValid && initialCache ? initialCache.invitations : []);
    const [notifications, setNotifications] = useState<Notification[]>(isCacheValid && initialCache ? initialCache.notifications : []);
    const [assessmentStatuses, setAssessmentStatuses] = useState<Record<string, string>>(isCacheValid && initialCache ? initialCache.assessmentStatuses : {});
    const [isLoading, setIsLoading] = useState(!isCacheValid);
    const [isScanning, setIsScanning] = useState(false);
    const [scanCompleteMessage, setScanCompleteMessage] = useState<string | null>(null);
    const [selectionInfoOpen, setSelectionInfoOpen] = useState(false);

    const profileChecks = [
        { label: text('Name', 'Nome'), filled: !!(candidate.personal_info?.first_name && candidate.personal_info?.last_name) },
        { label: text('Email', 'Email'), filled: !!candidate.contacts?.email },
        { label: text('Phone', 'Telefono'), filled: !!candidate.contacts?.phone },
        { label: text('Location', 'Località'), filled: !!(candidate.residence?.country || candidate.residence?.city) },
        { label: text('Summary', 'Profilo'), filled: !!(candidate.summary_text && candidate.summary_text.length > 10) },
        { label: text('Skills', 'Skill'), filled: !!(candidate.skills && candidate.skills.length > 0) },
        { label: text('IT Skills', 'Competenze IT'), filled: !!(candidate.it_skills && candidate.it_skills.length > 0) },
        { label: text('Soft Skills', 'Soft skill'), filled: !!(candidate.soft_skills && candidate.soft_skills.length > 0) },
        { label: text('Experience', 'Esperienza'), filled: !!(candidate.experiences && candidate.experiences.length > 0) },
        { label: text('Education', 'Formazione'), filled: !!(candidate.education && candidate.education.length > 0) },
        { label: text('Languages', 'Lingue'), filled: !!(candidate.languages && candidate.languages.length > 0) },
        { label: text('Job Function', 'Funzione'), filled: !!candidate.current_job_function },
        { label: text('Seniority', 'Seniorità'), filled: !!candidate.current_seniority_level },
        { label: text('Preferences', 'Preferenze'), filled: !!(candidate.preferences?.preferred_locations?.length > 0 || candidate.preferences?.remote) },
        { label: text('AI Refined', 'Rifinito con AI'), filled: !!candidate.ai_refined },
    ];

    const filledCount = profileChecks.filter((item) => item.filled).length;
    const profileStrength = Math.round((filledCount / profileChecks.length) * 100);
    const missingFields = profileChecks.filter((item) => !item.filled);
    const hasCoreProfile = profileStrength >= 80;

    const assessmentRequestJobIds = useMemo(() => Array.from(new Set([
        ...Object.keys(assessmentStatuses),
        ...notifications
            .filter((notification) => notification.type === 'invitation_received' && notification.metadata?.assessment_requested && notification.metadata?.job_id)
            .map((notification) => notification.metadata?.job_id as string),
    ])), [assessmentStatuses, notifications]);

    const loadMatches = useCallback(async (showScanningUI = false) => {
        if (showScanningUI) {
            setIsScanning(true);
            await new Promise(resolve => setTimeout(resolve, 1200));
        } else {
            setIsLoading(true);
        }

        try {
            const [allJobs, invitedJobFiles, nextAssessmentStatuses, nextNotifications] = await Promise.all([
                getAllJobs(),
                getJobsForCandidate(candidate.contacts.email, candidate.id),
                getCandidateAssessmentStatuses(candidate.contacts.email, candidate.id).catch((error) => {
                    console.error('Failed to load seeker assessment statuses for dashboard state:', error);
                    return {};
                }),
                effectiveProfileId
                    ? getNotifications(effectiveProfileId).catch((error) => {
                        console.error('Failed to load seeker notifications for dashboard state:', error);
                        return [];
                    })
                    : Promise.resolve([]),
            ]);
            const appliedJobIds = new Set(invitedJobFiles.map((job) => job.id));
            const candidateJobs = allJobs.filter((job) => !appliedJobIds.has(job.id));
            const visibleRecommendations = await recommendJobsForCandidate(candidate, candidateJobs, 12);
            const invitedJobs = invitedJobFiles.map(job => ({
                job,
                score: calculateMatchScore(job, candidate).finalScore,
                explanation: '',
            }));

            const safeAssessmentStatuses: Record<string, string> = nextAssessmentStatuses && typeof nextAssessmentStatuses === 'object' && !Array.isArray(nextAssessmentStatuses)
                ? nextAssessmentStatuses as Record<string, string>
                : {};
            const safeNotifications = Array.isArray(nextNotifications) ? nextNotifications : [];
            setAssessmentStatuses(safeAssessmentStatuses);
            setNotifications(safeNotifications);
            setRecommendations(visibleRecommendations);
            setInvitations(invitedJobs);
            setSeekerMatchCache({
                candidateId: candidate.id,
                candidateSignature: candidateMatchSignature,
                recommendations: visibleRecommendations,
                invitations: invitedJobs,
                notifications: safeNotifications,
                assessmentStatuses: safeAssessmentStatuses,
            });

            if (showScanningUI) {
                setScanCompleteMessage(language === 'it'
                    ? `Scansione completata. ${visibleRecommendations.length} job consigliati sono pronti da consultare.`
                    : `Scan complete. ${visibleRecommendations.length} recommended jobs are ready for review.`);
                setTimeout(() => setScanCompleteMessage(null), 4000);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
            setIsScanning(false);
        }
    }, [candidate, candidateMatchSignature, effectiveProfileId, language, text]);

    useEffect(() => {
        const cache = getSeekerMatchCache();
        if (isCacheValid && cache) {
            setRecommendations(cache.recommendations);
            setInvitations(cache.invitations);
            setNotifications(cache.notifications);
            setAssessmentStatuses(cache.assessmentStatuses);
            setIsLoading(false);
            return;
        }

        setRecommendations([]);
        setInvitations([]);
        setNotifications([]);
        setAssessmentStatuses({});
        void loadMatches();
    }, [candidate.id, candidateMatchSignature, isCacheValid, loadMatches]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleCacheInvalidation = (event: Event) => {
            const customEvent = event as CustomEvent<{ candidateId?: string }>;
            if (customEvent.detail?.candidateId && customEvent.detail.candidateId !== candidate.id) {
                return;
            }

            setSeekerMatchCache(null);
            void loadMatches();
        };

        window.addEventListener(SEEKER_MATCH_CACHE_INVALIDATED_EVENT, handleCacheInvalidation as EventListener);
        return () => window.removeEventListener(SEEKER_MATCH_CACHE_INVALIDATED_EVENT, handleCacheInvalidation as EventListener);
    }, [candidate.id, loadMatches]);

    // Restore scroll position when returning from a job detail page
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const savedScroll = window.sessionStorage.getItem(SEEKER_DASHBOARD_SCROLL_STORAGE_KEY);
        if (!savedScroll) return;
        const scrollY = Number(savedScroll);
        window.sessionStorage.removeItem(SEEKER_DASHBOARD_SCROLL_STORAGE_KEY);
        if (!Number.isFinite(scrollY) || scrollY < 0) return;
        const restoreScroll = () => {
            window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
            document.documentElement.scrollTop = scrollY;
            document.body.scrollTop = scrollY;
        };
        restoreScroll();
        const frame = window.requestAnimationFrame(restoreScroll);
        return () => window.cancelAnimationFrame(frame);
    }, []);

    const handleViewJob = (job: JobProfile) => {
        if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(SEEKER_DASHBOARD_SCROLL_STORAGE_KEY, String(window.scrollY));
        }
        setPage('jobDetails', { job });
    };

    const checkCompletion = (jobId: string) => {
        return candidate.test_results?.some(r => r.job_id === jobId) || false;
    };

    const getAssessmentStatus = (jobId: string) => {
        if (checkCompletion(jobId) || assessmentStatuses[jobId] === 'assessment_completed') {
            return 'assessment_completed';
        }
        if (assessmentStatuses[jobId] === 'assessment_requested') {
            return 'assessment_requested';
        }
        return null;
    };

    const pendingQuestionnaires = useMemo(
        () => invitations.filter((inv) => getAssessmentStatus(inv.job.id) === 'assessment_requested'),
        // getAssessmentStatus reads from candidate.test_results and assessmentStatuses
        [invitations, assessmentStatuses, candidate.test_results] // eslint-disable-line react-hooks/exhaustive-deps
    );

    const dashboardProgressItems = [
        {
            label: text('Account created', 'Account creato'),
            hint: text('Your PeakTalent account is active and ready to use.', 'Il tuo account PeakTalent è attivo e pronto da usare.'),
            done: true,
        },
        {
            label: text('Core profile completed', 'Profilo base completato'),
            hint: hasCoreProfile
                ? text('Your profile already covers the essential information recruiters need first.', 'Il tuo profilo copre già le informazioni essenziali che i recruiter vogliono vedere subito.')
                : text(`You are at ${profileStrength}% completion. Fill the remaining profile gaps to improve your chances.`, `Sei al ${profileStrength}% di completamento. Colma le parti mancanti del profilo per migliorare le tue chance.`),
            done: hasCoreProfile,
        },
        {
            label: text('AI profile refinement', 'Perfezionamento AI del profilo'),
            hint: candidate.ai_refined
                ? text('Your skills were already refined and verified with the AI assistant.', 'Le tue skill sono già state affinate e verificate con l’assistente AI.')
                : text('Complete the AI refinement to verify your skills and boost recruiter confidence.', 'Completa il perfezionamento AI per verificare le tue skill e aumentare la fiducia del recruiter.'),
            done: Boolean(candidate.ai_refined),
        },
    ];
    const activeJobsCount = invitations.length;

    return (
        <div className="mx-auto max-w-[1600px] animate-fade-in px-3 pt-4 sm:px-8 lg:px-10">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <main className="relative space-y-6 lg:col-span-8">
                    <AiBanner context="seeker" />

                    {pendingQuestionnaires.length > 0 && (
                        <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/20 sm:p-6">
                            <div className="mb-4 flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
                                        {text('Action needed', 'Azione richiesta')}
                                    </p>
                                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                                        {pendingQuestionnaires.length === 1
                                            ? text('A recruiter requested a questionnaire', 'Un recruiter ha richiesto un questionario')
                                            : text(
                                                `${pendingQuestionnaires.length} recruiters requested a questionnaire`,
                                                `${pendingQuestionnaires.length} recruiter hanno richiesto un questionario`
                                            )}
                                    </h2>
                                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                                        {candidate.ai_refined
                                            ? text(
                                                'Complete the role questionnaire so the recruiter can finalize your evaluation.',
                                                'Completa il questionario del ruolo così il recruiter può finalizzare la tua valutazione.'
                                            )
                                            : text(
                                                'Finish your AI profile refinement first, then complete the role questionnaire.',
                                                'Completa prima il perfezionamento AI del profilo, poi il questionario del ruolo.'
                                            )}
                                    </p>
                                </div>
                            </div>
                            <ul className="divide-y divide-sky-200/70 overflow-hidden rounded-2xl border border-sky-200 bg-white dark:divide-sky-900/40 dark:border-sky-900/40 dark:bg-slate-950">
                                {pendingQuestionnaires.map((inv) => (
                                    <li key={`pending-quiz-${inv.job.id}`} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <CompanyLogo
                                                logoUrl={inv.job.company_logo_url}
                                                companyName={inv.job.company_name}
                                                size="sm"
                                                className="shrink-0"
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-slate-950 dark:text-slate-100">{inv.job.title}</p>
                                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                                    {(inv.job.company_name || text('Confidential company', 'Azienda riservata'))}
                                                    {inv.job.constraints?.location?.city ? ` • ${inv.job.constraints.location.city}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => candidate.ai_refined
                                                ? setPage('evaluation', { job: inv.job })
                                                : setPage('application', { startStep: 3 })}
                                            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-500"
                                        >
                                            {candidate.ai_refined
                                                ? text('Start questionnaire', 'Avvia questionario')
                                                : text('Complete profile & questionnaire', 'Completa profilo e questionario')}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {activeJobsCount > 0 && (
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
                            <SectionHeader
                                icon={
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                }
                                title={text('Your applications', 'Le tue candidature')}
                                description={text(
                                    'Jobs where you showed interest or received an invite from a recruiter.',
                                    'Lavori per cui hai mostrato interesse o ricevuto un invito da un recruiter.'
                                )}
                            />
                            <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
                                {invitations.map((inv) => {
                                    const assessmentStatus = getAssessmentStatus(inv.job.id);
                                    const assessmentComplete = assessmentStatus === 'assessment_completed';
                                    const assessmentRequested = assessmentStatus === 'assessment_requested';

                                    return (
                                        <ActiveJobRow
                                            key={`app-${inv.job.id}`}
                                            recommendation={inv}
                                            badgeLabel={assessmentComplete
                                                ? text('Questionnaire complete', 'Questionario completato')
                                                : assessmentRequested
                                                    ? (candidate.ai_refined ? text('Questionnaire requested', 'Questionario richiesto') : text('Profile + questionnaire', 'Profilo + questionario'))
                                                    : text('Interest shown', 'Interesse mostrato')}
                                            onView={handleViewJob}
                                        />
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    <section className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
                        <SectionHeader
                            icon={
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            }
                            title={text('Recommended for you', 'Consigliati per te')}
                            description={text(
                                'The best opportunities ordered by relevance. Open one to see the details.',
                                'Le migliori opportunità ordinate per rilevanza. Aprine una per vedere i dettagli.'
                            )}
                            action={
                                <button
                                    onClick={() => loadMatches(true)}
                                    disabled={isScanning || isLoading}
                                    className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${isScanning || isLoading
                                        ? 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                                        : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
                                        }`}
                                >
                                    <svg
                                        className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`}
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                        aria-hidden="true"
                                    >
                                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                    </svg>
                                    {isScanning ? text('Scanning...', 'Scansione...') : text('Refresh', 'Aggiorna')}
                                </button>
                            }
                        />

                        {scanCompleteMessage && (
                            <div className="mb-4 text-center">
                                <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    {scanCompleteMessage}
                                </span>
                            </div>
                        )}

                        <div className="relative">
                            {isScanning && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-white/80 backdrop-blur-sm animate-fade-in dark:bg-slate-950/80">
                                    <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-8 py-8 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                                        <Spinner />
                                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{text('Finding fresh matches', 'Ricerca nuovi match')}</p>
                                    </div>
                                </div>
                            )}

                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center gap-4 py-20">
                                    <Spinner />
                                </div>
                            ) : recommendations.length > 0 ? (
                                <div className="space-y-4">
                                    <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
                                        {recommendations.slice(0, 5).map((rec) => (
                                            <JobMatchRow
                                                key={rec.job.id}
                                                recommendation={rec}
                                                badgeLabel={checkCompletion(rec.job.id)
                                                    ? text('Assessment Complete', 'Assessment completato')
                                                    : text('Recommended', 'Consigliato')}
                                                onView={handleViewJob}
                                            />
                                        ))}
                                    </ul>

                                    <button
                                        onClick={() => setPage('jobBoard')}
                                        className="group flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-500 bg-orange-500 px-5 py-3.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition-all hover:border-orange-600 hover:bg-orange-600 hover:shadow-md dark:border-orange-500 dark:bg-orange-500 dark:text-white dark:hover:border-orange-600 dark:hover:bg-orange-600"
                                    >
                                        {text('View all jobs', 'Vedi tutti i lavori')}
                                        <svg
                                            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                            aria-hidden="true"
                                        >
                                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            ) : (
                                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-10 text-center dark:border-slate-800 dark:bg-slate-900/40">
                                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                                        <svg className="h-6 w-6 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{text('No fresh matches yet', 'Nessuna nuova corrispondenza al momento')}</h3>
                                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">{text('A stronger profile unlocks more matches. Add your skills, preferences, or let our AI refine your profile for better recommendations.', 'Un profilo più completo sblocca più corrispondenze. Aggiungi competenze o preferenze, o lascia che l\'AI migliori il tuo profilo per consigli più precisi.')}</p>
                                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                                        <button
                                            onClick={() => setPage('application', { startStep: 3 })}
                                            className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/10 transition-colors hover:bg-brand-600"
                                        >
                                            {text('Improve Profile', 'Migliora profilo')}
                                        </button>
                                        <button
                                            onClick={() => setPage('jobBoard')}
                                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                        >
                                            {text('Browse All Jobs', 'Vedi tutti i lavori')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </main>

                <aside className="space-y-6 lg:col-span-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex flex-col items-center text-center">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{text('Profile Strength', 'Forza profilo')}</p>
                            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{text('Completion Score', 'Completamento')}</h3>
                            <div className="mt-5">
                                <ProfileStrengthRing value={profileStrength} />
                            </div>
                        </div>

                        <div className="mt-6 space-y-4">
                            {candidate.ai_refined && (
                                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                    {text('AI interview complete', 'Intervista AI completata')}
                                </div>
                            )}

                            {missingFields.length > 0 && (
                                <div className="relative">
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{text('Still missing', 'Ancora mancanti')}</p>
                                        <button
                                            type="button"
                                            onClick={() => setSelectionInfoOpen((isOpen) => !isOpen)}
                                            aria-expanded={selectionInfoOpen}
                                            aria-label={text('Show selection readiness information', 'Mostra informazioni sulla prontezza alla selezione')}
                                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold leading-none text-slate-500 transition-colors hover:border-brand-300 hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand-500/50 dark:hover:text-brand-300"
                                        >
                                            i
                                        </button>
                                    </div>
                                    {selectionInfoOpen && (
                                        <div className="absolute right-0 top-7 z-20 w-[min(22rem,calc(100vw-3rem))] rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xl shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/30">
                                            <div className="mb-4 flex items-start justify-between gap-3">
                                                <div>
                                                    <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                                        {text('Selection readiness', 'Prontezza alla selezione')}
                                                    </h3>
                                                    <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                                        {text('These steps help recruiters understand your profile faster and with more confidence.', 'Questi step aiutano i recruiter a capire il tuo profilo più velocemente e con più fiducia.')}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectionInfoOpen(false)}
                                                    aria-label={text('Close information panel', 'Chiudi pannello informativo')}
                                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                                >
                                                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                    </svg>
                                                </button>
                                            </div>
                                            <ProgressChecklist items={dashboardProgressItems} />
                                        </div>
                                    )}
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {missingFields.slice(0, 5).map((field) => (
                                            <span key={field.label} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                {field.label}
                                            </span>
                                        ))}
                                        {missingFields.length > 5 && (
                                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                +{missingFields.length - 5} {text('more', 'altri')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={() => setPage('settings', { tab: 'profile' })}
                                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                            >
                                {profileStrength >= 90 ? text('Open Profile', 'Apri profilo') : text('Complete Profile', 'Completa profilo')}
                            </button>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default JobSeekerHomePage;
