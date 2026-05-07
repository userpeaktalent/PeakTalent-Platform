import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { JobProfile, RecruiterProfile } from '../types';
import { deleteRecruiterJobPosting, getApplicantsForJob, getJobsForRecruiter } from '../services/dbService';
import { Spinner } from './common';
import { useLanguage } from './LanguageProvider';
import { buildSeekerInterestUrl } from '../services/accessLinks';
import CompanyLogo from './CompanyLogo';

// Local definition since we moved to Router, but this component still serves as a sub-router/dashboard view
export type RecruiterPage = 'dashboard' | 'jobFlow' | 'editProfile' | 'notifications' | 'settings' | 'profileSetup' | 'matches' | 'jobDetails' | 'quizEditor';

// Icons
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>;
const ChartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" /><path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" /></svg>;
const PlusUserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" /></svg>;
const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" clipRule="evenodd" />
    </svg>
);
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 8a1 1 0 011 1v6a1 1 0 11-2 0V9a1 1 0 011-1zm4 0a1 1 0 011 1v6a1 1 0 11-2 0V9a1 1 0 011-1zm3-3a1 1 0 00-1-1h-1a1 1 0 10-2 0H8a1 1 0 100 2h4a1 1 0 001-1zM4 5a1 1 0 011-1h10a1 1 0 110 2h-.293l-.664 9.291A2 2 0 0112.05 17H7.95a2 2 0 01-1.993-1.709L5.293 6H5a1 1 0 01-1-1z" clipRule="evenodd" /></svg>;
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
    isHighlighted?: boolean,
    onView: (job: JobProfile) => void,
    onEdit: (job: JobProfile) => void,
    onReview: (job: JobProfile) => void,
    onAddCandidates: (job: JobProfile) => void,
    onDelete: (job: JobProfile) => void,
    onQuizEditor: (job: JobProfile) => void,
    interestLink: string,
    onCopyInterestLink: (job: JobProfile) => void,
    copiedLink: boolean,
}> = ({ job, applicantCount, isHighlighted = false, onView, onEdit, onReview, onAddCandidates, onDelete, onQuizEditor, interestLink, onCopyInterestLink, copiedLink }) => {
    const { text } = useLanguage();
    const industryLabel = formatJobIndustry(job.industry);
    const locationLabel = formatJobLocation(job);

    return (
        <div
            id={`recruiter-job-card-${job.id}`}
            data-job-id={job.id}
            onClick={() => onView(job)}
            className={`bg-white dark:bg-slate-900 p-6 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-lg transition-all group overflow-hidden relative cursor-pointer ${
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
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-200 to-slate-200 dark:from-slate-800 dark:to-slate-800 group-hover:from-brand-400 group-hover:to-brand-300 transition-all duration-500"></div>
            <div>
                <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100 group-hover:text-brand-500 transition-colors mb-1">{job.title}</h3>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">{industryLabel} &bull; {locationLabel}</p>
                <div className="flex flex-wrap items-center gap-2 mb-6">
                    <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
                        {applicantCount} {text('Applicants', 'Candidati')}
                    </span>
                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">{job.seniority_level || text('unknown level', 'livello non noto')}</span>
                </div>
            </div>
            <div className="space-y-3">
                <button onClick={(e) => { e.stopPropagation(); onReview(job); }} className="w-full text-sm flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 px-4 rounded-xl shadow-sm shadow-brand-500/10 hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <ChartIcon /> {text('Review AI Matches', 'Vedi match AI')}
                </button>
                <div className="flex gap-2">
                    <button onClick={(e) => { e.stopPropagation(); onEdit(job); }} className="flex-1 text-sm flex items-center justify-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-bold py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <EditIcon /> {text('Edit Job', 'Modifica lavoro')}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onAddCandidates(job); }} title={text('Add Candidates Manually', 'Aggiungi candidati manualmente')} className="flex-shrink-0 text-slate-500 hover:text-orange-500 flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 font-bold py-2.5 px-4 rounded-xl hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:border-orange-200 dark:hover:border-orange-800 transition-all">
                        <PlusUserIcon />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(job); }} title={text('Delete posting', 'Elimina posting')} className="flex-shrink-0 text-slate-500 hover:text-red-500 flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 font-bold py-2.5 px-4 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 dark:hover:border-red-800 transition-all">
                        <TrashIcon />
                    </button>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onQuizEditor(job); }}
                    className="w-full text-sm flex items-center justify-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-bold py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 dark:hover:bg-orange-900/20 dark:hover:text-orange-400 dark:hover:border-orange-800 transition-all"
                >
                    <QuizIcon />
                    {job.technical_test?.questions?.length
                        ? text(`Manage questionnaire (${job.technical_test.questions.length} questions)`, `Gestisci questionario (${job.technical_test.questions.length} domande)`)
                        : text('Create role questionnaire', 'Crea questionario sul ruolo')}
                </button>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                        {text('Job invite link', 'Link di invito al lavoro')}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                        <input
                            type="text"
                            readOnly
                            value={interestLink}
                            onClick={(event) => event.currentTarget.select()}
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                        />
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                onCopyInterestLink(job);
                            }}
                            className="inline-flex flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            {copiedLink ? text('Copied', 'Copiato') : text('Copy link', 'Copia link')}
                        </button>
                    </div>
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
    const [jobPendingDelete, setJobPendingDelete] = useState<JobProfile | null>(null);
    const [isDeletingJob, setIsDeletingJob] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [copiedLinkJobId, setCopiedLinkJobId] = useState<string | null>(null);
    const [highlightedJobId, setHighlightedJobId] = useState<string | null>(
        (location.state as { highlightJobId?: string } | null)?.highlightJobId || null
    );
    const highlightTimeoutRef = useRef<number | null>(null);
    const totalApplicants = jobs.reduce(
        (sum, job) => sum + (applicantCounts[job.id] ?? (job.applicant_emails?.length || 0)),
        0
    );
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
                const recruiterJobs = await getJobsForRecruiter(recruiter.id);
                if (isMounted) {
                    setJobs(recruiterJobs);
                }

                const counts = await Promise.all(
                    recruiterJobs.map(async (job) => {
                        try {
                            const applicants = await getApplicantsForJob(job.id, job.applicant_emails || []);
                            return [job.id, applicants.length] as const;
                        } catch (countError) {
                            console.error(`Failed to load applicant count for job ${job.id}:`, countError);
                            return [job.id, job.applicant_emails?.length || 0] as const;
                        }
                    })
                );

                if (isMounted) {
                    setApplicantCounts(Object.fromEntries(counts));
                }
            } catch (error) {
                console.error('Failed to load recruiter job postings:', error);
                if (isMounted) {
                    setJobs([]);
                    setApplicantCounts({});
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
        const requestedHighlight = (location.state as { highlightJobId?: string } | null)?.highlightJobId || null;
        if (!requestedHighlight) return;
        setHighlightedJobId(requestedHighlight);
    }, [location.state]);

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
            navigate(location.pathname, { replace: true, state: null });
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

    return (
        <div className="max-w-[1600px] mx-auto py-5 px-3 sm:px-8 lg:px-10 animate-fade-in">
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
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isDeletingJob) return;
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
                                        if (isDeletingJob) return;
                                        setJobPendingDelete(null);
                                        setDeleteError('');
                                    }}
                                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    {text('Cancel', 'Annulla')}
                                </button>
                                <button
                                    type="button"
                                    disabled={isDeletingJob}
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
                    <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="flex items-center gap-3 text-lg font-bold text-slate-800 sm:text-xl dark:text-slate-100">
                            <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-600 h-8 w-8 rounded-lg flex items-center justify-center">📋</span>
                            {text('My Job Postings', 'I miei lavori')}
                        </h2>
                        <button onClick={() => onNavigate('jobFlow', { mode: 'create' })} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg sm:w-auto dark:bg-white dark:text-slate-900">
                            <span aria-hidden="true" className="inline-flex h-[18px] w-[18px] items-center justify-center">
                                <PlusIcon />
                            </span>
                            <span className="inline-flex items-center">{text('New Job', 'Nuovo lavoro')}</span>
                        </button>
                    </div>
                    {isLoading ? (
                        <div className="flex justify-center py-20 bg-slate-50 dark:bg-slate-900/20 rounded-3xl border border-slate-100 dark:border-slate-800"><Spinner /></div>
                    ) : jobs.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                            {jobs.map(job => (
                                <JobCard
                                    key={job.id}
                                    job={job}
                                    applicantCount={applicantCounts[job.id] ?? (job.applicant_emails?.length || 0)}
                                    isHighlighted={highlightedJobId === job.id}
                                    onView={(j) => onNavigate('jobDetails', { job: j })}
                                    onEdit={(j) => onNavigate('jobFlow', { mode: 'edit', job: j })}
                                    onReview={(j) => onNavigate('matches', { job: j })}
                                    onAddCandidates={(j) => onNavigate('jobFlow', { mode: 'add-applicants', job: j })}
                                    onQuizEditor={(j) => onNavigate('quizEditor', { job: j })}
                                    onDelete={(j) => {
                                        setDeleteError('');
                                        setJobPendingDelete(j);
                                    }}
                                    interestLink={buildSeekerInterestUrl(job.id)}
                                    onCopyInterestLink={handleCopyInterestLink}
                                    copiedLink={copiedLinkJobId === job.id}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-24 px-6 bg-slate-50 dark:bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                            <div className="h-20 w-20 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100 dark:border-slate-700">
                                <svg className="h-10 w-10 text-slate-300 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m12 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">{text('Ready to hire?', 'Pronto ad assumere?')}</h3>
                            <p className="text-slate-500 dark:text-slate-400 mt-2 mb-8 max-w-sm mx-auto">{text('Create your first AI-optimized job posting to start receiving smart-matched candidates.', 'Crea il tuo primo lavoro ottimizzato con AI per iniziare a ricevere candidati selezionati in modo intelligente.')}</p>
                            <button onClick={() => onNavigate('jobFlow', { mode: 'create' })} className="w-full rounded-xl bg-brand-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-500/20 transition-all hover:-translate-y-1 hover:bg-brand-600 hover:shadow-xl sm:w-auto sm:text-lg">
                                {text('Post Your First Job', 'Pubblica il tuo primo lavoro')}
                            </button>
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
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center dark:border-slate-800 dark:bg-slate-800/50">
                                    <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{jobs.length}</p>
                                    <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{text('Open postings', 'Posting attivi')}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center dark:border-slate-800 dark:bg-slate-800/50">
                                    <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{totalApplicants}</p>
                                    <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{text('Applicants', 'Candidati')}</p>
                                </div>
                            </div>

                            <div className="mt-5 space-y-4">
                                {summaryRows.map((row) => (
                                    <div key={row.label} className="flex flex-col gap-1 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0 dark:border-slate-800">
                                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{row.label}</span>
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{row.value}</span>
                                    </div>
                                ))}
                            </div>

                            <p className="mt-5 text-xs leading-relaxed text-slate-400">
                                {text('Account settings and notifications are available from your profile menu in the top-right header.', 'Impostazioni account e notifiche sono disponibili dal menu profilo in alto a destra nell’header.')}
                            </p>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default RecruiterHomePage;
