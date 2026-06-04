import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CandidateProfile, CandidateRefinementChat, JobProfile, RecruiterProfile } from '../types';
import { getApplicantsForJob, getJobsForRecruiter } from '../services/dbService';
import { downloadCandidateCv, getLatestCandidateRefinementChat, getRecruiterCandidateCvRecord } from '../services/candidateAssetsService';
import { withRetry } from '../utils/retry';
import { formatCandidateName } from '../utils/nameFormat';
import CandidateProfileView from './CandidateProfileView';
import { useLanguage } from './LanguageProvider';
import { Spinner } from './common';
import { toast } from 'sonner';
import RefinementChatModal from './RefinementChatModal';
import {
    CandidatePoolFilterState,
    CandidatePoolFiltersPanel,
    CandidatePoolRow,
    applyCandidateFilters,
    countActiveFilters,
    emptyFilterState,
    extractFilterOptions,
} from './CandidatePoolFilters';

interface RecruiterCandidatesPageProps {
    recruiter: RecruiterProfile;
}

type RecruiterCandidatePoolRow = CandidatePoolRow & {
    jobs: JobProfile[];
};

const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M8.5 3a5.5 5.5 0 014.383 8.823l3.147 3.147a.75.75 0 01-1.06 1.06l-3.147-3.147A5.5 5.5 0 118.5 3zm-4 5.5a4 4 0 108 0 4 4 0 00-8 0z" clipRule="evenodd" />
    </svg>
);

const buildCandidateSearchText = (row: CandidatePoolRow) => {
    const { candidate, jobTitles } = row;
    const experiences = Array.isArray(candidate.experiences) ? candidate.experiences : [];
    const education = Array.isArray(candidate.education) ? candidate.education : [];
    const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
    const itSkills = Array.isArray(candidate.it_skills) ? candidate.it_skills : [];

    return [
        formatCandidateName(candidate),
        candidate.contacts?.email,
        candidate.contacts?.phone,
        candidate.current_job_function,
        candidate.current_seniority_level,
        candidate.summary_text,
        candidate.residence?.city,
        candidate.residence?.country,
        ...jobTitles,
        ...experiences.flatMap((entry) => [entry.role, entry.company, entry.description]),
        ...education.flatMap((entry) => [entry.degree_level, entry.major, entry.institution]),
        ...skills.map((skill) => skill.skill_name),
        ...itSkills.map((skill) => skill.skill_name),
    ].filter(Boolean).join(' ').toLowerCase();
};

const RecruiterCandidatesPage: React.FC<RecruiterCandidatesPageProps> = ({ recruiter }) => {
    const { text } = useLanguage();
    const navigate = useNavigate();
    const [rows, setRows] = useState<RecruiterCandidatePoolRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCandidate, setSelectedCandidate] = useState<CandidateProfile | null>(null);
    const [reviewingRefinementChat, setReviewingRefinementChat] = useState<{ candidate: CandidateProfile; chat: CandidateRefinementChat } | null>(null);
    const [loadingRefinementChatCandidateId, setLoadingRefinementChatCandidateId] = useState<string | null>(null);
    const [downloadingCvCandidateId, setDownloadingCvCandidateId] = useState<string | null>(null);
    const [filters, setFilters] = useState<CandidatePoolFilterState>(emptyFilterState());
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const loadCandidates = async () => {
            setIsLoading(true);
            setLoadError('');

            try {
                const jobs = await withRetry(() => getJobsForRecruiter(recruiter.id), {
                    attempts: 3,
                    delaysMs: [0, 900, 2200],
                    onRetry: (error, attempt) => {
                        console.warn(`Retrying recruiter candidate pool jobs for ${recruiter.id} after failed attempt ${attempt}:`, error);
                    },
                });

                const candidatesByKey = new Map<string, RecruiterCandidatePoolRow>();

                await Promise.all(jobs.map(async (job) => {
                    const applicants = await getApplicantsForJob(job.id, job.applicant_emails || []);

                    applicants.forEach(({ candidate }) => {
                        const key = candidate.id || candidate.contacts?.email?.toLowerCase().trim();
                        if (!key) return;

                        const existing = candidatesByKey.get(key);
                        if (existing) {
                            if (!existing.jobTitles.includes(job.title)) {
                                existing.jobTitles.push(job.title);
                            }
                            if (!existing.jobs.some((existingJob) => existingJob.id === job.id)) {
                                existing.jobs.push(job);
                            }
                            return;
                        }

                        candidatesByKey.set(key, {
                            candidate,
                            jobTitles: [job.title],
                            jobs: [job],
                        });
                    });
                }));

                if (isMounted) {
                    setRows(Array.from(candidatesByKey.values()).sort((left, right) => {
                        const leftName = formatCandidateName(left.candidate) || left.candidate.contacts?.email || '';
                        const rightName = formatCandidateName(right.candidate) || right.candidate.contacts?.email || '';
                        return leftName.localeCompare(rightName);
                    }));
                }
            } catch (error: any) {
                console.error('Failed to load recruiter candidate pool:', error);
                if (isMounted) {
                    setRows([]);
                    setLoadError(error?.message || text('Unable to load your candidates right now.', 'Impossibile caricare i tuoi candidati in questo momento.'));
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadCandidates();

        return () => {
            isMounted = false;
        };
    }, [recruiter.id, text]);

    const filterOptions = useMemo(() => extractFilterOptions(rows), [rows]);

    const filteredRows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const afterSearch = query
            ? rows.filter((row) => buildCandidateSearchText(row).includes(query))
            : rows;
        return applyCandidateFilters(afterSearch, filters);
    }, [rows, searchQuery, filters]);

    const activeFilterCount = countActiveFilters(filters);
    const selectedCandidateRow = selectedCandidate
        ? rows.find((row) => row.candidate.id === selectedCandidate.id || row.candidate.contacts?.email === selectedCandidate.contacts?.email) || null
        : null;
    const selectedCandidateJob = selectedCandidateRow?.jobs[0] || null;

    const handleJobUpdatedFromCandidateProfile = (updatedJob: JobProfile) => {
        setRows((currentRows) => currentRows.map((row) => ({
            ...row,
            jobs: row.jobs.map((job) => job.id === updatedJob.id ? updatedJob : job),
        })));
    };

    const handleViewRefinementChat = async (candidate: CandidateProfile) => {
        setLoadingRefinementChatCandidateId(candidate.id);
        try {
            const chat = await getLatestCandidateRefinementChat({
                id: candidate.id,
                email: candidate.contacts?.email,
            });

            if (!chat) {
                toast.info(text('No AI refinement transcript has been saved for this candidate yet.', 'Per questo candidato non è ancora stata salvata una transcript di affinamento AI.'));
                return;
            }

            setReviewingRefinementChat({ candidate, chat });
        } catch (error: any) {
            console.error('Failed to load candidate refinement transcript from candidate pool:', error);
            toast.error(error?.message || text('Unable to load the AI refinement transcript right now.', 'Impossibile caricare la transcript di affinamento AI in questo momento.'));
        } finally {
            setLoadingRefinementChatCandidateId(null);
        }
    };

    const handleDownloadCv = async (candidate: CandidateProfile) => {
        if (downloadingCvCandidateId) return;

        const contextJob = rows.find((row) => row.candidate.id === candidate.id || row.candidate.contacts?.email === candidate.contacts?.email)?.jobs[0];
        if (!contextJob) {
            toast.info(text('No job context is available for this candidate yet.', 'Non è ancora disponibile un contesto job per questo candidato.'));
            return;
        }

        setDownloadingCvCandidateId(candidate.id);
        try {
            const cvRecord = await getRecruiterCandidateCvRecord(contextJob.id, {
                id: candidate.id,
                email: candidate.contacts?.email,
            });

            if (!cvRecord) {
                toast.info(text('No CV has been uploaded for this candidate yet.', 'Per questo candidato non è ancora stato caricato alcun CV.'));
                return;
            }

            await downloadCandidateCv(cvRecord);
        } catch (error: any) {
            console.error('Failed to download candidate CV from candidate pool:', error);
            toast.error(error?.message || text('Unable to download this CV right now.', 'Impossibile scaricare questo CV in questo momento.'));
        } finally {
            setDownloadingCvCandidateId(null);
        }
    };

    if (selectedCandidate) {
        return (
            <>
                {reviewingRefinementChat && (
                    <RefinementChatModal
                        chat={reviewingRefinementChat.chat}
                        candidateLabel={formatCandidateName(reviewingRefinementChat.candidate) || reviewingRefinementChat.candidate.contacts?.email || ''}
                        onClose={() => setReviewingRefinementChat(null)}
                    />
                )}
                <CandidateProfileView
                    candidate={selectedCandidate}
                    onBack={() => setSelectedCandidate(null)}
                    showEditButton={false}
                    jobContext={selectedCandidateJob ? { job: selectedCandidateJob, onJobUpdated: handleJobUpdatedFromCandidateProfile } : undefined}
                    auxiliaryActions={
                        <>
                            {selectedCandidate.ai_refined && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        void handleViewRefinementChat(selectedCandidate);
                                    }}
                                    disabled={loadingRefinementChatCandidateId === selectedCandidate.id}
                                    className="inline-flex h-9 w-full min-w-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[150px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    {loadingRefinementChatCandidateId === selectedCandidate.id
                                        ? text('Loading...', 'Caricamento...')
                                        : text('AI chat answers', 'Risposte Chat AI')}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    void handleDownloadCv(selectedCandidate);
                                }}
                                disabled={downloadingCvCandidateId === selectedCandidate.id}
                                className="inline-flex h-9 w-full min-w-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[150px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                {downloadingCvCandidateId === selectedCandidate.id
                                    ? text('Preparing...', 'Preparazione...')
                                    : text('Download CV', 'Scarica CV')}
                            </button>
                        </>
                    }
                />
            </>
        );
    }

    const resetFilters = () => setFilters(emptyFilterState());

    return (
        <div className="mx-auto max-w-7xl animate-fade-in px-3 py-4 sm:px-8 lg:px-10">
            <button
                type="button"
                onClick={() => navigate('/recruiter/dashboard')}
                className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                {text('Back to dashboard', 'Torna alla dashboard')}
            </button>

            <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                        {text('My candidates', 'I miei candidati')}
                    </h1>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        {text('All candidates linked to at least one of your job postings.', 'Tutti i candidati collegati ad almeno uno dei tuoi job posting.')}
                    </p>
                </div>
                <div className="text-center text-slate-900 dark:text-slate-100">
                    <p className="text-2xl font-black">{filteredRows.length}<span className="text-slate-400">/{rows.length}</span></p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em]">{text('Candidates', 'Candidati')}</p>
                </div>
            </div>

            <div className="mt-6 flex flex-col gap-6 lg:flex-row">
                <div className="hidden w-72 flex-shrink-0 lg:block">
                    <div className="sticky top-4">
                        <CandidatePoolFiltersPanel
                            filters={filters}
                            options={filterOptions}
                            onChange={setFilters}
                            onReset={resetFilters}
                        />
                    </div>
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <label className="block flex-1">
                            <span className="sr-only">{text('Search candidates', 'Cerca candidati')}</span>
                            <span className="relative flex items-center">
                                <span className="pointer-events-none absolute left-3 text-slate-400">
                                    <SearchIcon />
                                </span>
                                <input
                                    type="search"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    placeholder={text('Search by name, email, role, skill, job...', 'Cerca per nome, email, ruolo, skill, job...')}
                                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-orange-300 focus:ring-4 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-orange-700 dark:focus:ring-orange-950/40"
                                />
                            </span>
                        </label>
                        <button
                            type="button"
                            onClick={() => setMobileFiltersOpen(true)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:border-orange-300 hover:text-orange-600 lg:hidden dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                            {text('Filters', 'Filtri')}
                            {activeFilterCount > 0 && (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">{activeFilterCount}</span>
                            )}
                        </button>
                    </div>

                    {isLoading ? (
                        <div className="mt-6 flex justify-center rounded-3xl border border-slate-100 bg-slate-50 py-20 dark:border-slate-800 dark:bg-slate-900/20">
                            <Spinner />
                        </div>
                    ) : loadError ? (
                        <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 px-6 py-8 text-center text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
                            {loadError}
                        </div>
                    ) : filteredRows.length > 0 ? (
                        <div className="mt-6 grid auto-rows-fr grid-cols-1 gap-4 xl:grid-cols-2">
                    {filteredRows.map((row) => {
                        const candidateName = formatCandidateName(row.candidate) || text('Unnamed candidate', 'Candidato senza nome');
                        const latestExperience = row.candidate.experiences?.find((entry) => entry.is_current_position) || row.candidate.experiences?.[0];
                        const visibleJobTitles = row.jobTitles.slice(0, 2);
                        const hiddenJobCount = Math.max(0, row.jobTitles.length - visibleJobTitles.length);

                        return (
                            <button
                                key={row.candidate.id || row.candidate.contacts?.email}
                                type="button"
                                onClick={() => setSelectedCandidate(row.candidate)}
                                className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-orange-200 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950 dark:hover:border-orange-500/40"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="truncate text-lg font-black leading-tight text-slate-900 transition-colors group-hover:text-orange-500 dark:text-slate-100">
                                            {candidateName}
                                        </h3>
                                        <p className="mt-1 truncate text-sm font-semibold text-slate-500 dark:text-slate-400">
                                            {row.candidate.contacts?.email || text('Email unavailable', 'Email non disponibile')}
                                        </p>
                                    </div>
                                    <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors group-hover:bg-orange-100 group-hover:text-orange-600 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-orange-950/40 dark:group-hover:text-orange-300">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </span>
                                </div>

                                <p className="mt-3 truncate text-sm font-medium text-slate-600 dark:text-slate-300">
                                    {latestExperience ? (
                                        <>
                                            {latestExperience.role}
                                            {latestExperience.company ? <span className="text-slate-400"> · {latestExperience.company}</span> : null}
                                        </>
                                    ) : (
                                        <span className="italic text-slate-400 dark:text-slate-500">{text('No experience listed', 'Nessuna esperienza indicata')}</span>
                                    )}
                                </p>

                                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                                    {visibleJobTitles.map((title) => (
                                        <span key={title} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                            {title}
                                        </span>
                                    ))}
                                    {hiddenJobCount > 0 && (
                                        <span className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-bold text-orange-700 dark:bg-orange-950/30 dark:text-orange-300">
                                            +{hiddenJobCount}
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                        </div>
                    ) : (
                        <div className="mt-6 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900/30">
                            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">
                                {rows.length === 0 ? text('No candidates yet', 'Nessun candidato ancora') : text('No candidates found', 'Nessun candidato trovato')}
                            </h3>
                            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                                {rows.length === 0
                                    ? text('Candidates will appear here once they are linked to one of your job postings.', 'I candidati appariranno qui quando saranno collegati a uno dei tuoi job posting.')
                                    : activeFilterCount > 0 || searchQuery
                                        ? text('Try adjusting your filters or search query.', 'Prova ad aggiustare i filtri o la ricerca.')
                                        : text('Try searching by another name, email, role, skill, or job title.', 'Prova a cercare un altro nome, email, ruolo, skill o titolo job.')}
                            </p>
                            {(activeFilterCount > 0 || searchQuery) && rows.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => { setSearchQuery(''); resetFilters(); }}
                                    className="mt-4 inline-flex items-center gap-1 rounded-full bg-orange-100 px-4 py-2 text-xs font-black uppercase tracking-wider text-orange-700 hover:bg-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-950/60"
                                >
                                    {text('Reset all', 'Reset filtri')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {mobileFiltersOpen && (
                <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        onClick={() => setMobileFiltersOpen(false)}
                        aria-hidden="true"
                    />
                    <div className="absolute inset-y-0 left-0 w-80 max-w-[90vw] overflow-y-auto bg-transparent p-3 shadow-2xl">
                        <CandidatePoolFiltersPanel
                            filters={filters}
                            options={filterOptions}
                            onChange={setFilters}
                            onReset={resetFilters}
                            onCloseMobile={() => setMobileFiltersOpen(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecruiterCandidatesPage;
