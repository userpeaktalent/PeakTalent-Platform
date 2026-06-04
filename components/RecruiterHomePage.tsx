import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { JobProfile, RecruiterProfile } from '../types';
import { archiveRecruiterJobPosting, deleteRecruiterJobPosting, getApplicantsForJob, getApplicantsForJobs, getJobsForRecruiter, addJob, restoreRecruiterJobPosting } from '../services/dbService';
import { Spinner } from './common';
import { useLanguage } from './LanguageProvider';
import { buildSeekerInterestUrl } from '../services/accessLinks';
import CompanyLogo from './CompanyLogo';
import { withRetry } from '../utils/retry';
import { isJobQuizEnabled } from '../utils/questionnaire';
import { JobMetrics, computeJobMetrics, emptyJobMetrics, formatPercent } from '../utils/jobMetrics';

// Local definition since we moved to Router, but this component still serves as a sub-router/dashboard view
export type RecruiterPage = 'dashboard' | 'jobFlow' | 'editProfile' | 'notifications' | 'settings' | 'profileSetup' | 'matches' | 'jobDetails' | 'quizEditor' | 'candidates' | 'analytics' | 'pipeline';

// Icons
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>;
const ChartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" /><path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" /></svg>;
const PipelineIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M3 4a1 1 0 011-1h3a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM9 4a1 1 0 011-1h3a1 1 0 011 1v8a1 1 0 01-1 1h-3a1 1 0 01-1-1V4zM15 4a1 1 0 011-1h.01a1 1 0 011 1v5a1 1 0 01-1 1H16a1 1 0 01-1-1V4z" /></svg>;
const PlusUserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" /></svg>;
const MoreIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM18 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const CopyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 011-1h6a1 1 0 011 1v10a1 1 0 01-1 1h-2v-2h1V4H9v1H8V3z" /><path d="M4 6a1 1 0 00-1 1v10a1 1 0 001 1h7a1 1 0 001-1V7a1 1 0 00-1-1H4zm1 2h5v8H5V8z" /></svg>;
const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M8.5 3a5.5 5.5 0 014.383 8.823l3.147 3.147a.75.75 0 01-1.06 1.06l-3.147-3.147A5.5 5.5 0 118.5 3zm-4 5.5a4 4 0 108 0 4 4 0 00-8 0z" clipRule="evenodd" />
    </svg>
);
const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" clipRule="evenodd" />
    </svg>
);
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 8a1 1 0 011 1v6a1 1 0 11-2 0V9a1 1 0 011-1zm4 0a1 1 0 011 1v6a1 1 0 11-2 0V9a1 1 0 011-1zm3-3a1 1 0 00-1-1h-1a1 1 0 10-2 0H8a1 1 0 100 2h4a1 1 0 001-1zM4 5a1 1 0 011-1h10a1 1 0 110 2h-.293l-.664 9.291A2 2 0 0112.05 17H7.95a2 2 0 01-1.993-1.709L5.293 6H5a1 1 0 01-1-1z" clipRule="evenodd" /></svg>;
const ArchiveIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 00-2 2v1a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M3 9h14v5a3 3 0 01-3 3H6a3 3 0 01-3-3V9zm5 2a1 1 0 100 2h4a1 1 0 100-2H8z" clipRule="evenodd" /></svg>;
const RestoreIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a7 7 0 00-6.32 10H2a1 1 0 100 2h4a1 1 0 001-1v-4a1 1 0 10-2 0v1.29A5 5 0 1110 15a1 1 0 100 2 7 7 0 000-14z" clipRule="evenodd" /></svg>;
const ChevronRightIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>;
const MiniSpinner = () => (
    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
);


interface RecruiterHomePageProps {
    recruiter: RecruiterProfile;
    onNavigate: (page: RecruiterPage, data?: any) => void;
}

const formatRecruiterLocation = (location: RecruiterProfile['company_location'] | string | null | undefined) => {
    if (!location) return 'Location unavailable';
    if (typeof location === 'string') return location;
    return [location.city, location.country?.toUpperCase()].filter(Boolean).join(', ') || 'Location unavailable';
};

const formatRecruiterSector = (sector: RecruiterProfile['sector'] | string | null | undefined) => {
    if (!sector) return 'Sector unavailable';
    if (Array.isArray(sector)) {
        return sector.filter(Boolean).join(', ') || 'Sector unavailable';
    }
    return String(sector);
};

const formatJobIndustry = (industry: JobProfile['industry'] | string | null | undefined) => {
    if (!industry) return 'Industry unavailable';
    if (Array.isArray(industry)) {
        return industry.filter(Boolean).join(', ') || 'Industry unavailable';
    }
    return String(industry);
};

const formatJobLocation = (job: JobProfile) => {
    const location = job.constraints?.location;
    if (!location) return 'Location unavailable';
    return [location.city, location.country].filter(Boolean).join(', ') || 'Location unavailable';
};

const QuizIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
);

const JobCard: React.FC<{
    job: JobProfile,
    applicantCount: number,
    metrics?: JobMetrics,
    isHighlighted?: boolean,
    onView: (job: JobProfile) => void,
    onEdit: (job: JobProfile) => void,
    onReview: (job: JobProfile) => void,
    onAddCandidates: (job: JobProfile) => void,
    onDelete: (job: JobProfile) => void,
    onArchive: (job: JobProfile) => void,
    onRestore: (job: JobProfile) => void,
    onQuizEditor: (job: JobProfile) => void,
    onRemoveQuestionnaire: (job: JobProfile) => void,
    onAnalytics: (job: JobProfile) => void,
    onPipeline: (job: JobProfile) => void,
    interestLink: string,
    onCopyInterestLink: (job: JobProfile) => void,
    copiedLink: boolean,
}> = ({ job, applicantCount, metrics, isHighlighted = false, onView, onEdit, onReview, onAddCandidates, onDelete, onArchive, onRestore, onQuizEditor, onRemoveQuestionnaire, onAnalytics, onPipeline, interestLink, onCopyInterestLink, copiedLink }) => {
    const { text } = useLanguage();
    const industryLabel = formatJobIndustry(job.industry);
    const locationLabel = formatJobLocation(job);
    const quizEnabled = isJobQuizEnabled(job);
    const isArchived = job.is_archived === true;
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [optionsDirection, setOptionsDirection] = useState<'up' | 'down'>('down');
    const [quizSubmenuOpen, setQuizSubmenuOpen] = useState(false);
    const [shareSubmenuOpen, setShareSubmenuOpen] = useState(false);
    const optionsRef = useRef<HTMLDivElement | null>(null);
    const quizCloseTimeoutRef = useRef<number | null>(null);
    const shareCloseTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (!optionsOpen) return;

        const handlePointerDown = (event: PointerEvent | MouseEvent) => {
            if (!optionsRef.current?.contains(event.target as Node)) {
                setOptionsOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOptionsOpen(false);
                setQuizSubmenuOpen(false);
                setShareSubmenuOpen(false);
            }
        };

        const eventName = typeof window !== 'undefined' && 'PointerEvent' in window ? 'pointerdown' : 'mousedown';
        document.addEventListener(eventName, handlePointerDown as EventListener);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener(eventName, handlePointerDown as EventListener);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [optionsOpen]);

    useEffect(() => () => {
        if (quizCloseTimeoutRef.current) {
            window.clearTimeout(quizCloseTimeoutRef.current);
        }
        if (shareCloseTimeoutRef.current) {
            window.clearTimeout(shareCloseTimeoutRef.current);
        }
    }, []);

    const openQuizSubmenu = () => {
        if (quizCloseTimeoutRef.current) {
            window.clearTimeout(quizCloseTimeoutRef.current);
            quizCloseTimeoutRef.current = null;
        }
        setQuizSubmenuOpen(true);
    };

    const scheduleQuizSubmenuClose = () => {
        if (quizCloseTimeoutRef.current) {
            window.clearTimeout(quizCloseTimeoutRef.current);
        }
        quizCloseTimeoutRef.current = window.setTimeout(() => {
            setQuizSubmenuOpen(false);
            quizCloseTimeoutRef.current = null;
        }, 180);
    };

    const closeQuizSubmenu = () => {
        if (quizCloseTimeoutRef.current) {
            window.clearTimeout(quizCloseTimeoutRef.current);
            quizCloseTimeoutRef.current = null;
        }
        setQuizSubmenuOpen(false);
    };

    const openShareSubmenu = () => {
        if (shareCloseTimeoutRef.current) {
            window.clearTimeout(shareCloseTimeoutRef.current);
            shareCloseTimeoutRef.current = null;
        }
        setShareSubmenuOpen(true);
    };

    const scheduleShareSubmenuClose = () => {
        if (shareCloseTimeoutRef.current) {
            window.clearTimeout(shareCloseTimeoutRef.current);
        }
        shareCloseTimeoutRef.current = window.setTimeout(() => {
            setShareSubmenuOpen(false);
            shareCloseTimeoutRef.current = null;
        }, 180);
    };

    const closeShareSubmenu = () => {
        if (shareCloseTimeoutRef.current) {
            window.clearTimeout(shareCloseTimeoutRef.current);
            shareCloseTimeoutRef.current = null;
        }
        setShareSubmenuOpen(false);
    };

    const closeSubmenus = () => {
        closeQuizSubmenu();
        closeShareSubmenu();
    };

    const runOption = (event: React.MouseEvent, action: () => void) => {
        event.stopPropagation();
        setOptionsOpen(false);
        setQuizSubmenuOpen(false);
        setShareSubmenuOpen(false);
        action();
    };

    const toggleOptions = (event: React.MouseEvent) => {
        event.stopPropagation();

        setOptionsOpen((current) => {
            setQuizSubmenuOpen(false);
            setShareSubmenuOpen(false);
            if (current) return false;

            const rect = optionsRef.current?.getBoundingClientRect();
            if (rect && typeof window !== 'undefined') {
                const estimatedMenuHeight = isArchived ? 170 : 340;
                const spaceAbove = rect.top;
                const spaceBelow = window.innerHeight - rect.bottom;
                setOptionsDirection(spaceBelow >= estimatedMenuHeight || spaceBelow >= spaceAbove ? 'down' : 'up');
            }

            return true;
        });
    };

    return (
        <div
            id={`recruiter-job-card-${job.id}`}
            data-job-id={job.id}
            onClick={() => onView(job)}
            className={`bg-white dark:bg-slate-900 p-5 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-lg transition-all group overflow-visible relative cursor-pointer ${
                isHighlighted
                    ? 'border-red-300 ring-4 ring-red-300/60 shadow-xl dark:border-red-500 dark:ring-red-500/30'
                    : 'border-slate-200 dark:border-slate-800'
            }`}
        >
            {isHighlighted && (
                <span className="absolute right-4 top-4 z-10 inline-flex items-center rounded-full bg-red-500 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-md">
                    {text('Selected', 'Selezionato')}
                </span>
            )}
            <div>
                <div className="mb-1 flex items-start gap-3">
                    <h3 className="min-w-0 flex-1 font-bold text-lg text-slate-800 dark:text-slate-100 group-hover:text-brand-500 transition-colors">{job.title}</h3>
                    {isArchived && (
                        <span
                            className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300"
                            title={text('Archived', 'Archiviato')}
                            aria-label={text('Archived', 'Archiviato')}
                        >
                            <ArchiveIcon />
                        </span>
                    )}
                </div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">{industryLabel} &bull; {locationLabel}</p>
                <div className="mb-4 grid grid-cols-4 gap-2 rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onPipeline(job); }}
                        title={text('Open pipeline', 'Apri pipeline')}
                        className="flex flex-col items-center justify-center rounded-lg px-1 py-0.5 text-center transition-colors hover:bg-white hover:shadow-sm dark:hover:bg-slate-800/60"
                    >
                        <span className="text-base font-black leading-none text-slate-900 dark:text-slate-100">{applicantCount}</span>
                        <span className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">{text('Applicants', 'Candidati')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onPipeline(job); }}
                        title={text('Open pipeline', 'Apri pipeline')}
                        className="flex flex-col items-center justify-center rounded-lg px-1 py-0.5 text-center transition-colors hover:bg-white hover:shadow-sm dark:hover:bg-slate-800/60"
                    >
                        <span className={`text-base font-black leading-none ${(metrics?.pendingReviewCount ?? applicantCount) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
                            {metrics?.pendingReviewCount ?? applicantCount}
                        </span>
                        <span className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">{text('To review', 'Da esaminare')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onPipeline(job); }}
                        title={text('Open pipeline', 'Apri pipeline')}
                        className="flex flex-col items-center justify-center rounded-lg px-1 py-0.5 text-center transition-colors hover:bg-white hover:shadow-sm dark:hover:bg-slate-800/60"
                    >
                        <span className={`text-base font-black leading-none ${(metrics?.interestedCount ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
                            {metrics?.interestedCount ?? 0}
                        </span>
                        <span className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">Shortlist</span>
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onAnalytics(job); }}
                        title={metrics?.quizEnabled ? text('View analytics', 'Vedi analitiche') : text('Quiz disabled', 'Quiz disattivato')}
                        className="flex flex-col items-center justify-center rounded-lg px-1 py-0.5 text-center transition-colors hover:bg-white hover:shadow-sm dark:hover:bg-slate-800/60"
                    >
                        <span className="text-base font-black leading-none text-slate-900 dark:text-slate-100">
                            {metrics?.quizEnabled ? formatPercent(metrics.testCompletionRate) : '—'}
                        </span>
                        <span className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">{text('Quiz done', 'Quiz fatti')}</span>
                    </button>
                </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={(e) => { e.stopPropagation(); onReview(job); }} className="w-full text-sm flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 px-4 rounded-xl shadow-sm shadow-brand-500/10 hover:shadow-md transition-all">
                    <ChartIcon /> {text('Review AI Matches', 'Vedi profili')}
                </button>
                <div ref={optionsRef} className="relative sm:w-40">
                    <button
                        type="button"
                        onClick={toggleOptions}
                        className="w-full text-sm flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700"
                        aria-haspopup="menu"
                        aria-expanded={optionsOpen}
                    >
                        <MoreIcon /> {text('Options', 'Opzioni')}
                    </button>
                    {optionsOpen && (
                        <div
                            className={`absolute right-0 z-30 w-64 overflow-visible rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-900 ${
                                optionsDirection === 'down' ? 'top-[calc(100%+8px)]' : 'bottom-[calc(100%+8px)]'
                            }`}
                            role="menu"
                            onClick={(event) => event.stopPropagation()}
                        >
                            {isArchived ? (
                                <button
                                    type="button"
                                    onClick={(event) => runOption(event, () => onRestore(job))}
                                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                    role="menuitem"
                                >
                                    <RestoreIcon /> {text('Restore job', 'Ripristina lavoro')}
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onMouseEnter={closeSubmenus}
                                        onClick={(event) => runOption(event, () => onEdit(job))}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                        role="menuitem"
                                    >
                                        <EditIcon /> {text('Edit Job', 'Modifica lavoro')}
                                    </button>
                                    <button
                                        type="button"
                                        onMouseEnter={closeSubmenus}
                                        onClick={(event) => runOption(event, () => onPipeline(job))}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                        role="menuitem"
                                    >
                                        <PipelineIcon /> {text('Pipeline', 'Pipeline')}
                                    </button>
                                    <button
                                        type="button"
                                        onMouseEnter={closeSubmenus}
                                        onClick={(event) => runOption(event, () => onAnalytics(job))}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                        role="menuitem"
                                    >
                                        <ChartIcon /> {text('Analytics', 'Analitiche')}
                                    </button>
                                    {quizEnabled ? (
                                        <div
                                            className="group/quiz relative"
                                            onMouseEnter={() => {
                                                closeShareSubmenu();
                                                openQuizSubmenu();
                                            }}
                                            onMouseLeave={scheduleQuizSubmenuClose}
                                        >
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    if (quizSubmenuOpen) {
                                                        closeQuizSubmenu();
                                                    } else {
                                                        closeShareSubmenu();
                                                        openQuizSubmenu();
                                                    }
                                                }}
                                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                                role="menuitem"
                                                aria-haspopup="menu"
                                                aria-expanded={quizSubmenuOpen}
                                            >
                                                <QuizIcon />
                                                <span className="min-w-0 flex-1">{text('Manage questionnaire', 'Gestisci questionario')}</span>
                                                <ChevronRightIcon />
                                            </button>
                                            <div
                                                className={`absolute left-0 top-[calc(100%+4px)] z-40 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl transition-opacity duration-150 dark:border-slate-700 dark:bg-slate-900 sm:left-[calc(100%-2px)] sm:top-0 ${
                                                    quizSubmenuOpen
                                                        ? 'pointer-events-auto opacity-100'
                                                        : 'pointer-events-none opacity-0 group-hover/quiz:pointer-events-auto group-hover/quiz:opacity-100'
                                                }`}
                                                role="menu"
                                                onMouseEnter={openQuizSubmenu}
                                                onMouseLeave={scheduleQuizSubmenuClose}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(event) => runOption(event, () => onQuizEditor(job))}
                                                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                                    role="menuitem"
                                                >
                                                    <QuizIcon /> {text('Edit questionnaire', 'Gestisci questionario')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(event) => runOption(event, async () => {
                                                        if (window.confirm(text('Are you sure you want to remove this questionnaire?', 'Sei sicuro di voler rimuovere questo questionario?'))) {
                                                            onRemoveQuestionnaire(job);
                                                        }
                                                    })}
                                                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                                    role="menuitem"
                                                >
                                                    <TrashIcon /> {text('Remove questionnaire', 'Rimuovi questionario')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onMouseEnter={closeSubmenus}
                                            onClick={(event) => runOption(event, () => onQuizEditor(job))}
                                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                            role="menuitem"
                                        >
                                            <QuizIcon />
                                            {text('Create role questionnaire', 'Crea questionario sul ruolo')}
                                        </button>
                                    )}
                                    <div
                                        className="group/share relative"
                                        onMouseEnter={() => {
                                            closeQuizSubmenu();
                                            openShareSubmenu();
                                        }}
                                        onMouseLeave={scheduleShareSubmenuClose}
                                    >
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                if (shareSubmenuOpen) {
                                                    closeShareSubmenu();
                                                } else {
                                                    closeQuizSubmenu();
                                                    openShareSubmenu();
                                                }
                                            }}
                                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                            role="menuitem"
                                            aria-haspopup="menu"
                                            aria-expanded={shareSubmenuOpen}
                                        >
                                            <CopyIcon />
                                            <span className="min-w-0 flex-1">{text('Share', 'Condividi')}</span>
                                            <ChevronRightIcon />
                                        </button>
                                        <div
                                            className={`absolute left-0 top-[calc(100%+4px)] z-40 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl transition-opacity duration-150 dark:border-slate-700 dark:bg-slate-900 sm:left-[calc(100%-2px)] sm:top-0 ${
                                                shareSubmenuOpen
                                                    ? 'pointer-events-auto opacity-100'
                                                    : 'pointer-events-none opacity-0 group-hover/share:pointer-events-auto group-hover/share:opacity-100'
                                            }`}
                                            role="menu"
                                            onMouseEnter={openShareSubmenu}
                                            onMouseLeave={scheduleShareSubmenuClose}
                                        >
                                            <button
                                                type="button"
                                                title={interestLink}
                                                onClick={(event) => runOption(event, () => onCopyInterestLink(job))}
                                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                                role="menuitem"
                                            >
                                                <CopyIcon /> {copiedLink ? text('Copied', 'Copiato') : text('Copy invite link', 'Copia link invito')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(event) => runOption(event, () => onAddCandidates(job))}
                                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                                role="menuitem"
                                            >
                                                <PlusUserIcon /> {text('Add people', 'Aggiungi persone')}
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onMouseEnter={closeSubmenus}
                                        onClick={(event) => runOption(event, () => onArchive(job))}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                        role="menuitem"
                                    >
                                        <ArchiveIcon /> {text('Hiring completed', 'Assunzione conclusa')}
                                    </button>
                                </>
                            )}
                            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                            <button
                                type="button"
                                onMouseEnter={closeQuizSubmenu}
                                onClick={(event) => runOption(event, () => onDelete(job))}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                role="menuitem"
                            >
                                <TrashIcon /> {text('Delete posting', 'Elimina posting')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

const RecruiterHomePage: React.FC<RecruiterHomePageProps> = ({ recruiter, onNavigate }) => {
    const { text } = useLanguage();
    const location = useLocation();
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<JobProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [applicantCounts, setApplicantCounts] = useState<Record<string, number>>({});
    const [uniqueCandidateCount, setUniqueCandidateCount] = useState(0);
    const [jobMetrics, setJobMetrics] = useState<Record<string, JobMetrics>>({});
    const [jobPendingDelete, setJobPendingDelete] = useState<JobProfile | null>(null);
    const [jobPendingArchive, setJobPendingArchive] = useState<JobProfile | null>(null);
    const [jobPendingRestore, setJobPendingRestore] = useState<JobProfile | null>(null);
    const [isDeletingJob, setIsDeletingJob] = useState(false);
    const [isArchivingJob, setIsArchivingJob] = useState(false);
    const [isRestoringJob, setIsRestoringJob] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [archiveError, setArchiveError] = useState('');
    const [restoreError, setRestoreError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isArchiveView, setIsArchiveView] = useState(false);
    const highlightJobIdFromUrl = new URLSearchParams(location.search).get('highlightJobId');
    const [copiedLinkJobId, setCopiedLinkJobId] = useState<string | null>(null);
    const [highlightedJobId, setHighlightedJobId] = useState<string | null>(
        highlightJobIdFromUrl || (location.state as { highlightJobId?: string } | null)?.highlightJobId || null
    );
    const highlightTimeoutRef = useRef<number | null>(null);
    const activeJobs = useMemo(() => jobs.filter((job) => job.is_archived !== true), [jobs]);
    const archivedJobs = useMemo(() => jobs.filter((job) => job.is_archived === true), [jobs]);
    const displayedJobs = isArchiveView ? archivedJobs : activeJobs;
    const openArchiveView = () => {
        setSearchQuery('');
        setIsArchiveView(true);
    };
    const closeArchiveView = () => {
        setSearchQuery('');
        setIsArchiveView(false);

        const nextSearchParams = new URLSearchParams(location.search);
        if (nextSearchParams.get('view') === 'archive') {
            nextSearchParams.delete('view');
            const nextSearch = nextSearchParams.toString();
            navigate(`/recruiter/dashboard${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
        }
    };
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    const filteredJobs = useMemo(() => {
        if (!normalizedSearchQuery) return displayedJobs;

        return displayedJobs.filter((job) => {
            const searchableJobText = [
                job.title,
                formatJobIndustry(job.industry),
                formatJobLocation(job),
                job.seniority_level,
                job.company_name,
            ].filter(Boolean).join(' ').toLowerCase();

            return searchableJobText.includes(normalizedSearchQuery);
        });
    }, [displayedJobs, normalizedSearchQuery]);

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const locationState = location.state as { archiveView?: boolean; view?: string } | null;
        if (searchParams.get('view') === 'archive' || locationState?.archiveView || locationState?.view === 'archive') {
            openArchiveView();
        }
    }, [location.search, location.state]);
    const summaryRows = [
        { label: text('Sector', 'Settore'), value: formatRecruiterSector(recruiter?.sector as RecruiterProfile['sector'] | string | undefined) },
        {
            label: text('Location', 'Località'),
            value: formatRecruiterLocation(recruiter?.company_location as RecruiterProfile['company_location'] | string | undefined),
        },
    ];

    useEffect(() => {
        let isMounted = true;

        const loadJobs = async () => {
            setIsLoading(true);

            try {
                const recruiterJobs = await withRetry(() => getJobsForRecruiter(recruiter.id), {
                    attempts: 3,
                    delaysMs: [0, 900, 2200],
                    onRetry: (error, attempt) => {
                        console.warn(`Retrying recruiter dashboard jobs for ${recruiter.id} after failed attempt ${attempt}:`, error);
                    },
                });
                if (isMounted) {
                    setJobs(recruiterJobs);
                }

                // Batch all applicant lookups into 2 Supabase round-trips total instead
                // of N * 2 (one extra RTT per job otherwise saturates browser HTTP pool).
                let applicantsByJob: Record<string, { candidate: any; status: string }[]> = {};
                try {
                    applicantsByJob = await getApplicantsForJobs(recruiterJobs.map((j) => j.id));
                } catch (batchError) {
                    console.error('Batched applicant load failed, falling back to per-job:', batchError);
                }

                const results = await Promise.all(
                    recruiterJobs.map(async (job) => {
                        try {
                            const applicants = await getApplicantsForJob(job.id, job.applicant_emails || []);
                            const candidateKeys = applicants
                                .map(({ candidate }) => candidate.id || candidate.contacts?.email?.trim().toLowerCase())
                                .filter((key): key is string => Boolean(key));
                            return { jobId: job.id, count: applicants.length, metrics: computeJobMetrics(job, applicants), candidateKeys };
                        } catch (countError) {
                            console.error(`Failed to load applicant count for job ${job.id}:`, countError);
                            const fallbackEmails = (job.applicant_emails || [])
                                .map((email) => email.trim().toLowerCase())
                                .filter(Boolean);
                            const fallback = fallbackEmails.length;
                            return { jobId: job.id, count: fallback, metrics: emptyJobMetrics(fallback), candidateKeys: fallbackEmails };
                        }
                    })
                );

                if (isMounted) {
                    setApplicantCounts(Object.fromEntries(results.map(r => [r.jobId, r.count])));
                    setUniqueCandidateCount(new Set(results.flatMap(r => r.candidateKeys)).size);
                    setJobMetrics(Object.fromEntries(results.map(r => [r.jobId, r.metrics])));
                }
            } catch (error) {
                console.error('Failed to load recruiter job postings:', error);
                if (isMounted) {
                    setJobs([]);
                    setApplicantCounts({});
                    setJobMetrics({});
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadJobs();

        return () => {
            isMounted = false;
        };
    }, [recruiter.id]);

    useEffect(() => {
        const requestedHighlight = new URLSearchParams(location.search).get('highlightJobId')
            || (location.state as { highlightJobId?: string } | null)?.highlightJobId
            || null;
        if (!requestedHighlight) return;
        setHighlightedJobId(requestedHighlight);
    }, [location.search, location.state]);

    useEffect(() => {
        if (!highlightedJobId || isLoading || jobs.length === 0) return;

        const target = document.getElementById(`recruiter-job-card-${highlightedJobId}`);
        if (!target) return;

        target.scrollIntoView({ behavior: 'smooth', block: 'center' });

        if (highlightTimeoutRef.current) {
            window.clearTimeout(highlightTimeoutRef.current);
        }

        highlightTimeoutRef.current = window.setTimeout(() => {
            setHighlightedJobId((current) => current === highlightedJobId ? null : current);
            navigate(location.pathname, { replace: true });
        }, 5000);

        return () => {
            if (highlightTimeoutRef.current) {
                window.clearTimeout(highlightTimeoutRef.current);
                highlightTimeoutRef.current = null;
            }
        };
    }, [highlightedJobId, isLoading, jobs, location.pathname, navigate]);

    const handleCopyInterestLink = async (job: JobProfile) => {
        try {
            await navigator.clipboard.writeText(buildSeekerInterestUrl(job.id));
            setCopiedLinkJobId(job.id);
            window.setTimeout(() => {
                setCopiedLinkJobId((current) => current === job.id ? null : current);
            }, 2200);
        } catch (error) {
            console.error('Failed to copy seeker interest link:', error);
        }
    };

    const performArchiveJob = async (job: JobProfile) => {
        setIsArchivingJob(true);
        setArchiveError('');
        try {
            const updatedJob = await archiveRecruiterJobPosting(job);
            setJobs((current) => current.map((entry) => entry.id === updatedJob.id ? updatedJob : entry));
            setJobPendingDelete(null);
            setJobPendingArchive(null);
            openArchiveView();
        } catch (error: any) {
            console.error('Failed to archive recruiter posting:', error);
            const message = error?.message || text('The posting could not be archived.', 'Il posting non puo essere archiviato.');
            setArchiveError(message);
        } finally {
            setIsArchivingJob(false);
        }
    };

    const handleArchiveJob = (job: JobProfile) => {
        setArchiveError('');
        setJobPendingArchive(job);
    };

    const performRestoreJob = async (job: JobProfile) => {
        setIsRestoringJob(true);
        setRestoreError('');
        try {
            const updatedJob = await restoreRecruiterJobPosting(job);
            setJobs((current) => current.map((entry) => entry.id === updatedJob.id ? updatedJob : entry));
            setJobPendingRestore(null);
            closeArchiveView();
        } catch (error: any) {
            console.error('Failed to restore recruiter posting:', error);
            setRestoreError(error?.message || text('The posting could not be restored.', 'Il posting non puo essere ripristinato.'));
        } finally {
            setIsRestoringJob(false);
        }
    };

    const handleRestoreJob = (job: JobProfile) => {
        setRestoreError('');
        setJobPendingRestore(job);
    };

    return (
        <div className="max-w-[1600px] mx-auto py-5 px-3 sm:px-8 lg:px-10 animate-fade-in">
            {jobPendingRestore && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
                        <div className="space-y-5 p-6 sm:p-7">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                        {text('Restore posting', 'Ripristina posting')}
                                    </span>
                                    <h3 className="mt-4 text-2xl font-black text-slate-900 dark:text-slate-100">
                                        {text('Restore this job?', 'Ripristinare questo lavoro?')}
                                    </h3>
                                    <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                        {text(
                                            `This will move "${jobPendingRestore.title}" back to your active job postings and make it visible to candidates again.`,
                                            `Questo riporterà "${jobPendingRestore.title}" nei lavori attivi e lo renderà nuovamente visibile ai candidati.`
                                        )}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isRestoringJob) return;
                                        setJobPendingRestore(null);
                                        setRestoreError('');
                                    }}
                                    className="rounded-2xl px-3 py-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                    aria-label={text('Close', 'Chiudi')}
                                >
                                    &times;
                                </button>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{text('Posting summary', 'Riepilogo posting')}</p>
                                <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">{jobPendingRestore.title}</p>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    {[formatJobIndustry(jobPendingRestore.industry), formatJobLocation(jobPendingRestore)].filter(Boolean).join(' • ')}
                                </p>
                                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                                    {text('Applicants currently linked', 'Candidati attualmente collegati')}: {applicantCounts[jobPendingRestore.id] ?? (jobPendingRestore.applicant_emails?.length || 0)}
                                </p>
                            </div>

                            {restoreError && (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                                    {restoreError}
                                </div>
                            )}

                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isRestoringJob) return;
                                        setJobPendingRestore(null);
                                        setRestoreError('');
                                    }}
                                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    {text('Cancel', 'Annulla')}
                                </button>
                                <button
                                    type="button"
                                    disabled={isRestoringJob}
                                    onClick={() => void performRestoreJob(jobPendingRestore)}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                                >
                                    {isRestoringJob && <MiniSpinner />}
                                    <RestoreIcon />
                                    {text('Restore job', 'Ripristina lavoro')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {jobPendingArchive && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
                        <div className="space-y-5 p-6 sm:p-7">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100">
                                        {text('Archive this job?', 'Archiviare questo lavoro?')}
                                    </h3>
                                    <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                        {text(
                                            `This will move "${jobPendingArchive.title}" to the job archive. Candidates will no longer see it, but linked applicants will stay in your candidate archive.`,
                                            `Questo sposterà "${jobPendingArchive.title}" nell'archivio lavori. I candidati non lo vedranno più, ma le candidature collegate resteranno nel tuo archivio candidati.`
                                        )}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isArchivingJob) return;
                                        setJobPendingArchive(null);
                                        setArchiveError('');
                                    }}
                                    className="rounded-2xl px-3 py-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                    aria-label={text('Close', 'Chiudi')}
                                >
                                    &times;
                                </button>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{text('Posting summary', 'Riepilogo posting')}</p>
                                <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">{jobPendingArchive.title}</p>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    {[formatJobIndustry(jobPendingArchive.industry), formatJobLocation(jobPendingArchive)].filter(Boolean).join(' • ')}
                                </p>
                                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                                    {text('Applicants currently linked', 'Candidati attualmente collegati')}: {applicantCounts[jobPendingArchive.id] ?? (jobPendingArchive.applicant_emails?.length || 0)}
                                </p>
                            </div>

                            {archiveError && (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                                    {archiveError}
                                </div>
                            )}

                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isArchivingJob) return;
                                        setJobPendingArchive(null);
                                        setArchiveError('');
                                    }}
                                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    {text('Cancel', 'Annulla')}
                                </button>
                                <button
                                    type="button"
                                    disabled={isArchivingJob}
                                    onClick={() => {
                                        void performArchiveJob(jobPendingArchive);
                                    }}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
                                >
                                    {isArchivingJob && <MiniSpinner />}
                                    <ArchiveIcon />
                                    {text('Archive job', 'Archivia lavoro')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {jobPendingDelete && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
                        <div className="space-y-5 p-6 sm:p-7">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                                        {text('Delete posting', 'Elimina posting')}
                                    </span>
                                    <h3 className="mt-4 text-2xl font-black text-slate-900 dark:text-slate-100">
                                        {text('Delete this job posting?', 'Eliminare questo lavoro?')}
                                    </h3>
                                    <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                        {text(
                                            `This will permanently remove "${jobPendingDelete.title}" and all applications or invitations linked to it.`,
                                            `Questo rimuoverà definitivamente "${jobPendingDelete.title}" e tutte le candidature o invitation collegate.`
                                        )}
                                    </p>
                                    <p className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200">
                                        {text(
                                            'If the hiring process is finished, archive this job instead: applications remain linked and candidates stay in your archive.',
                                            'Se il processo di assunzione e concluso, archivia invece il lavoro: le candidature restano collegate e i candidati rimangono nel tuo archivio.'
                                        )}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isDeletingJob || isArchivingJob) return;
                                        setJobPendingDelete(null);
                                        setDeleteError('');
                                    }}
                                    className="rounded-2xl px-3 py-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                >
                                    &times;
                                </button>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{text('Posting summary', 'Riepilogo posting')}</p>
                                <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">{jobPendingDelete.title}</p>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    {[formatJobIndustry(jobPendingDelete.industry), formatJobLocation(jobPendingDelete)].filter(Boolean).join(' • ')}
                                </p>
                                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                                    {text('Applicants currently linked', 'Candidati attualmente collegati')}: {applicantCounts[jobPendingDelete.id] ?? (jobPendingDelete.applicant_emails?.length || 0)}
                                </p>
                            </div>

                            {deleteError && (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                                    {deleteError}
                                </div>
                            )}

                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isDeletingJob || isArchivingJob) return;
                                        setJobPendingDelete(null);
                                        setDeleteError('');
                                    }}
                                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    {text('Cancel', 'Annulla')}
                                </button>
                                <button
                                    type="button"
                                    disabled={isDeletingJob || isArchivingJob}
                                    onClick={() => {
                                        if (!jobPendingDelete) return;
                                        const jobToArchive = jobPendingDelete;
                                        setJobPendingDelete(null);
                                        handleArchiveJob(jobToArchive);
                                    }}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-3 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100 disabled:opacity-50 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200 dark:hover:bg-orange-900/40"
                                >
                                    {isArchivingJob && <MiniSpinner />}
                                    <ArchiveIcon />
                                    {text('Add to archive', 'Aggiungi all\'archivio')}
                                </button>
                                <button
                                    type="button"
                                    disabled={isDeletingJob || isArchivingJob}
                                    onClick={async () => {
                                        if (!jobPendingDelete) return;
                                        setIsDeletingJob(true);
                                        setDeleteError('');
                                        try {
                                            await deleteRecruiterJobPosting(jobPendingDelete.id);
                                            setJobs((current) => current.filter((job) => job.id !== jobPendingDelete.id));
                                            setApplicantCounts((current) => {
                                                const next = { ...current };
                                                delete next[jobPendingDelete.id];
                                                return next;
                                            });
                                            setJobMetrics((current) => {
                                                const next = { ...current };
                                                delete next[jobPendingDelete.id];
                                                return next;
                                            });
                                            setJobPendingDelete(null);
                                        } catch (error: any) {
                                            console.error('Failed to delete recruiter posting:', error);
                                            setDeleteError(
                                                error?.message || text('The posting could not be deleted.', 'Il posting non può essere eliminato.')
                                            );
                                        } finally {
                                            setIsDeletingJob(false);
                                        }
                                    }}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                                >
                                    {isDeletingJob && <MiniSpinner />}
                                    {text('Delete posting', 'Elimina posting')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:gap-8">
                <main className="lg:col-span-3">
                    <div className="mb-5">
                        {isArchiveView && (
                            <button
                                type="button"
                                onClick={closeArchiveView}
                                className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                                {text('Back to active jobs', 'Torna ai lavori attivi')}
                            </button>
                        )}
                        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                            <h2 className="flex items-center gap-3 text-lg font-bold text-slate-800 sm:text-xl dark:text-slate-100">
                                <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-600 h-8 w-8 rounded-lg flex items-center justify-center">📋</span>
                                {isArchiveView ? text('Job archive', 'Archivio lavori') : text('My Job Postings', 'I miei lavori')}
                            </h2>
                            {!isArchiveView && (
                                <button onClick={() => onNavigate('jobFlow', { mode: 'create' })} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-white shadow-md transition-all hover:shadow-lg sm:w-auto dark:bg-white dark:text-slate-900">
                                    <span aria-hidden="true" className="inline-flex h-[18px] w-[18px] items-center justify-center">
                                        <PlusIcon />
                                    </span>
                                    <span className="inline-flex items-center">{text('New Job', 'Nuovo lavoro')}</span>
                                </button>
                            )}
                        </div>
                        <label className="mt-4 block w-full">
                            <span className="sr-only">{text('Search job postings', 'Cerca lavori')}</span>
                            <span className="relative flex items-center">
                                <span className="pointer-events-none absolute left-3 text-slate-400">
                                    <SearchIcon />
                                </span>
                                <input
                                    type="search"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    placeholder={isArchiveView
                                        ? text('Search archived jobs...', 'Cerca lavori archiviati...')
                                        : text('Search by title, sector, location, seniority...', 'Cerca per titolo, settore, località, seniority...')}
                                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-orange-300 focus:ring-4 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-orange-700 dark:focus:ring-orange-950/40"
                                />
                            </span>
                        </label>
                    </div>
                    {isLoading ? (
                        <div className="flex justify-center py-20 bg-slate-50 dark:bg-slate-900/20 rounded-3xl border border-slate-100 dark:border-slate-800"><Spinner /></div>
                    ) : displayedJobs.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                            {filteredJobs.map(job => (
                                <JobCard
                                    key={job.id}
                                    job={job}
                                    applicantCount={applicantCounts[job.id] ?? (job.applicant_emails?.length || 0)}
                                    metrics={jobMetrics[job.id]}
                                    isHighlighted={highlightedJobId === job.id}
                                    onView={(j) => onNavigate('jobDetails', { job: j })}
                                    onEdit={(j) => onNavigate('jobFlow', { mode: 'edit', job: j })}
                                    onReview={(j) => onNavigate('matches', { job: j })}
                                    onAddCandidates={(j) => onNavigate('jobFlow', { mode: 'add-applicants', job: j })}
                                    onAnalytics={(j) => onNavigate('analytics', { job: j })}
                                    onPipeline={(j) => onNavigate('pipeline', { job: j })}
                                    onQuizEditor={(j) => onNavigate('quizEditor', { job: j })}
                                    onRemoveQuestionnaire={async (jobToUpdate) => {
                                        try {
                                            const updatedJob: JobProfile = { ...jobToUpdate, technical_test: undefined, requires_quiz: false };
                                            await addJob(updatedJob);
                                            setJobs((current) => current.map((entry) => entry.id === updatedJob.id ? updatedJob : entry));
                                        } catch (error) {
                                            console.error('Failed to remove questionnaire:', error);
                                        }
                                    }}
                                    onDelete={(j) => {
                                        setDeleteError('');
                                        setJobPendingDelete(j);
                                    }}
                                    onArchive={handleArchiveJob}
                                    onRestore={handleRestoreJob}
                                    interestLink={buildSeekerInterestUrl(job.id)}
                                    onCopyInterestLink={handleCopyInterestLink}
                                    copiedLink={copiedLinkJobId === job.id}
                                />
                            ))}
                            {filteredJobs.length === 0 && (
                                <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900/30 md:col-span-2">
                                    <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">{text('No jobs found', 'Nessun lavoro trovato')}</h3>
                                    <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                                        {text('Try another title, sector, location, or seniority level.', 'Prova con un altro titolo, settore, località o livello di seniority.')}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="mt-5 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                        {text('Clear search', 'Cancella ricerca')}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-24 px-6 bg-slate-50 dark:bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                            <div className="h-20 w-20 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100 dark:border-slate-700">
                                <svg className="h-10 w-10 text-slate-300 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m12 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                                {isArchiveView ? text('No archived jobs yet', 'Nessun lavoro archiviato') : text('Ready to hire?', 'Pronto ad assumere?')}
                            </h3>
                            <p className="text-slate-500 dark:text-slate-400 mt-2 mb-8 max-w-sm mx-auto">
                                {isArchiveView
                                    ? text('Completed hiring processes will appear here.', 'I processi di assunzione conclusi compariranno qui.')
                                    : text('Create your first AI-optimized job posting to start receiving smart-matched candidates.', 'Crea il tuo primo lavoro ottimizzato con AI per iniziare a ricevere candidati selezionati in modo intelligente.')}
                            </p>
                            {!isArchiveView && (
                                <button onClick={() => onNavigate('jobFlow', { mode: 'create' })} className="w-full rounded-xl bg-brand-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-600 hover:shadow-xl sm:w-auto sm:text-lg">
                                    {text('Post Your First Job', 'Pubblica il tuo primo lavoro')}
                                </button>
                            )}
                        </div>
                    )}
                </main>

                <aside className="lg:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div>
                            <div className="flex items-center gap-3">
                                <CompanyLogo
                                    logoUrl={recruiter.company_logo_url}
                                    companyName={recruiter.company_name}
                                    size="sm"
                                    fullBleed
                                />
                                <h3 className="font-black leading-tight text-slate-800 dark:text-slate-100">
                                    {recruiter.company_name || text('Company unavailable', 'Azienda non disponibile')}
                                </h3>
                            </div>

                            <div className="mt-6 grid grid-cols-2 gap-3">
                                <div className="flex min-h-[96px] flex-col items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center dark:border-slate-800 dark:bg-slate-800/50">
                                    <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{activeJobs.length}</p>
                                    <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{text('Open postings', 'Posting attivi')}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onNavigate('candidates')}
                                    className="flex min-h-[96px] flex-col items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center transition-all hover:border-orange-200 hover:bg-orange-50/70 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-orange-500/40 dark:hover:bg-orange-950/20"
                                    aria-label={text('Open candidate list', 'Apri lista candidati')}
                                >
                                    <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{uniqueCandidateCount}</p>
                                    <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{text('Applicants', 'Candidati')}</p>
                                </button>
                            </div>

                            <div className="mt-5 space-y-4">
                                {summaryRows.map((row) => (
                                    <div key={row.label} className="flex flex-col gap-1 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0 dark:border-slate-800">
                                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{row.label}</span>
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{row.value}</span>
                                    </div>
                                ))}
                            </div>

                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default RecruiterHomePage;
