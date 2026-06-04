import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CandidateProfile, CandidateRefinementChat, JobProfile } from '../types';
import { getApplicantsForJob } from '../services/dbService';
import { downloadCandidateCv, getLatestCandidateRefinementChat, getRecruiterCandidateCvRecord } from '../services/candidateAssetsService';
import { withRetry } from '../utils/retry';
import { formatCandidateName } from '../utils/nameFormat';
import { ApplicationStage, PIPELINE_STAGES, deriveStageFromContext } from '../utils/pipelineStages';
import { CandidateNotesBadge } from './CandidateNotesPanel';
import { useStageActions } from '../utils/applicationStageActions';
import { calculateMatchScore } from '../services/matchingService';
import { getCurrentQuizResult, isJobQuizEnabled } from '../utils/questionnaire';
import { buildRecruiterInterestedCandidatesMailto } from '../services/accessLinks';
import { toast } from 'sonner';
import { useLanguage } from './LanguageProvider';
import { useAuth } from './AuthProvider';
import { Spinner } from './common';
import CandidateProfileView from './CandidateProfileView';
import RefinementChatModal from './RefinementChatModal';

interface JobPipelinePageProps {
    job: JobProfile;
}

type ApplicantRow = {
    candidate: CandidateProfile;
    dbStatus: string;
    matchPercent: number | null;
    quizPercent: number | null;
};

const getMatchBadgeClass = (percent: number) => {
    if (percent >= 60) {
        return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300';
    }
    if (percent >= 50) {
        return 'border-green-200 bg-green-50 text-green-600 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300';
    }
    if (percent >= 40) {
        return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300';
    }
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300';
};

const getStageBadgeLabel = (stage: ApplicationStage, language: 'it' | 'en') => {
    const labels: Record<ApplicationStage, { it: string; en: string }> = {
        new: { it: 'Nuovo', en: 'New' },
        screened: { it: 'Shortlist', en: 'Shortlist' },
        interview: { it: 'Colloquio', en: 'Interview' },
        offer: { it: 'Offerta', en: 'Offer' },
        hired: { it: 'Assunto', en: 'Hired' },
        rejected: { it: 'Scartato', en: 'Rejected' },
    };
    return labels[stage][language];
};

const formatCountryBadge = (country?: string | null) => {
    const trimmed = country?.trim();
    if (!trimmed) return '';
    if (trimmed.length <= 3) return trimmed.toUpperCase();
    return trimmed.slice(0, 2).toUpperCase();
};

const KanbanCard: React.FC<{
    row: ApplicantRow;
    onDragStart: (candidateId: string) => void;
    onDragEnd: () => void;
    onStageChange: (stage: ApplicationStage) => void;
    onOpen: () => void;
    currentStage: ApplicationStage;
    isUpdating: boolean;
    note?: { tags: string[]; note: string };
}> = ({ row, onDragStart, onDragEnd, onStageChange, onOpen, currentStage, isUpdating, note }) => {
    const { text, language } = useLanguage();
    const name = formatCandidateName(row.candidate) || text('Unnamed candidate', 'Candidato senza nome');
    const latestExperience = row.candidate.experiences?.find(e => e.is_current_position) || row.candidate.experiences?.[0];
    const countryBadge = formatCountryBadge(row.candidate.residence?.country);

    return (
        <div
            draggable={!isUpdating}
            onDragStart={() => onDragStart(row.candidate.id)}
            onDragEnd={onDragEnd}
            onClick={onOpen}
            className={`group cursor-grab rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-orange-200 hover:shadow-md active:cursor-grabbing dark:border-slate-800 dark:bg-slate-950 dark:hover:border-orange-500/40 ${isUpdating ? 'opacity-50' : ''}`}
        >
            <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap gap-1.5">
                    {row.matchPercent != null ? (
                        <span className={`inline-flex h-[30px] items-center rounded-full border px-2.5 text-[10px] font-black uppercase tracking-wider ${getMatchBadgeClass(row.matchPercent)}`}>
                            {text('Match', 'Match')} {row.matchPercent}%
                        </span>
                    ) : (
                        <span className="inline-flex h-[30px] items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {text('Match', 'Match')} —
                        </span>
                    )}
                    {row.quizPercent != null && (
                        <span className="inline-flex h-[30px] items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 text-[10px] font-black uppercase tracking-wider text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300">
                            {text('Quiz', 'Quiz')} {row.quizPercent}%
                        </span>
                    )}
                    <CandidateNotesBadge note={note} />
                </div>
                <div
                    className="relative h-[30px] shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <select
                        value={currentStage}
                        onChange={(e) => { e.stopPropagation(); onStageChange(e.target.value as ApplicationStage); }}
                        disabled={isUpdating}
                        className="h-[30px] min-w-[104px] appearance-none rounded-full border border-slate-200 bg-slate-50 px-2.5 pr-7 text-[10px] font-black uppercase tracking-wider text-slate-700 outline-none transition-colors hover:border-orange-300 hover:bg-orange-50 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-orange-500/50 dark:hover:bg-orange-950/20"
                        aria-label={text('Change stage', 'Cambia stato')}
                    >
                        {PIPELINE_STAGES.map(s => (
                            <option key={s.id} value={s.id}>{getStageBadgeLabel(s.id, language)}</option>
                        ))}
                    </select>
                    <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 flex-col text-slate-400 dark:text-slate-500">
                        <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M10 5.5 14 10H6l4-4.5Z" />
                        </svg>
                        <svg className="-mt-1 h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M10 14.5 6 10h8l-4 4.5Z" />
                        </svg>
                    </span>
                </div>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{name}</p>
                {countryBadge && (
                    <span
                        className="inline-flex h-5 shrink-0 items-center rounded-full bg-slate-100 px-2 text-[9px] font-black uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        title={row.candidate.residence?.country}
                    >
                        {countryBadge}
                    </span>
                )}
            </div>
            <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                {row.candidate.current_job_function || row.candidate.contacts?.email || ''}
            </p>
            {latestExperience && (
                <p className="mt-2 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {latestExperience.role}
                    {latestExperience.company ? <span className="text-slate-400"> · {latestExperience.company}</span> : null}
                </p>
            )}
        </div>
    );
};

const JobPipelinePage: React.FC<JobPipelinePageProps> = ({ job: initialJob }) => {
    const { text, language } = useLanguage();
    const { effectiveDisplayName, effectiveEmail } = useAuth();
    const navigate = useNavigate();
    const [job, setJob] = useState<JobProfile>(initialJob);
    const jobRef = useRef<JobProfile>(initialJob);
    jobRef.current = job;
    const [rows, setRows] = useState<ApplicantRow[]>([]);
    const [stages, setStages] = useState<Record<string, ApplicationStage>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverStage, setDragOverStage] = useState<ApplicationStage | null>(null);
    const [selectedCandidate, setSelectedCandidate] = useState<CandidateProfile | null>(null);
    const [reviewingRefinementChat, setReviewingRefinementChat] = useState<{ candidate: CandidateProfile; chat: CandidateRefinementChat } | null>(null);
    const [loadingRefinementChatCandidateId, setLoadingRefinementChatCandidateId] = useState<string | null>(null);
    const [downloadingCvCandidateId, setDownloadingCvCandidateId] = useState<string | null>(null);

    const { move, busyIds: updatingIds } = useStageActions(jobRef, {
        language,
        onJobUpdated: setJob,
        onStageOptimistic: (candidateId, stage) => setStages(prev => ({ ...prev, [candidateId]: stage })),
        onStageRollback: (candidateId, prevStage) => setStages(prev => ({ ...prev, [candidateId]: prevStage })),
    });

    const jobQuizEnabled = useMemo(() => isJobQuizEnabled(initialJob), [initialJob]);

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);
        setLoadError('');

        withRetry(() => getApplicantsForJob(initialJob.id, initialJob.applicant_emails || []), {
            attempts: 3,
            delaysMs: [0, 900, 2200],
            onRetry: (error, attempt) => {
                console.warn(`Retrying pipeline applicants for ${initialJob.id} after attempt ${attempt}:`, error);
            },
        }).then((applicants) => {
            if (!isMounted) return;
            const nextRows: ApplicantRow[] = applicants.map(a => {
                let matchPercent: number | null = null;
                try {
                    const score = calculateMatchScore(initialJob, a.candidate);
                    if (score && typeof score.finalScore === 'number') {
                        matchPercent = Math.round(score.finalScore * 100);
                    }
                } catch (error) {
                    console.warn('Failed to compute match score for pipeline card:', error);
                }
                const quizResult = jobQuizEnabled ? getCurrentQuizResult(a.candidate, initialJob) : null;
                const quizPercent = quizResult && typeof quizResult.score === 'number' ? Math.round(quizResult.score) : null;
                return { candidate: a.candidate, dbStatus: a.status, matchPercent, quizPercent };
            });
            const nextStages: Record<string, ApplicationStage> = {};
            for (const row of nextRows) {
                nextStages[row.candidate.id] = deriveStageFromContext(initialJob, row.candidate.id, row.dbStatus);
            }
            setRows(nextRows);
            setStages(nextStages);
            setIsLoading(false);
        }).catch((error) => {
            console.error('Failed to load pipeline applicants:', error);
            if (isMounted) {
                setLoadError(error?.message || text('Unable to load the pipeline.', 'Impossibile caricare la pipeline.'));
                setIsLoading(false);
            }
        });

        return () => { isMounted = false; };
    }, [initialJob, jobQuizEnabled, text]);

    const rowsByStage = useMemo(() => {
        const map: Record<ApplicationStage, ApplicantRow[]> = {
            new: [], screened: [], interview: [], offer: [], hired: [], rejected: [],
        };
        for (const row of rows) {
            const stage = stages[row.candidate.id] || 'new';
            map[stage].push(row);
        }
        // sort within column by match score desc
        for (const key of Object.keys(map) as ApplicationStage[]) {
            map[key].sort((a, b) => (b.matchPercent ?? -1) - (a.matchPercent ?? -1));
        }
        return map;
    }, [rows, stages]);

    const moveCandidate = (candidateId: string, targetStage: ApplicationStage) => {
        const prevStage = stages[candidateId] || 'new';
        return move({ candidateId, fromStage: prevStage, toStage: targetStage });
    };

    const handleDrop = (stage: ApplicationStage) => {
        if (!draggingId) return;
        moveCandidate(draggingId, stage);
        setDraggingId(null);
        setDragOverStage(null);
    };

    const handleEmailShortlist = () => {
        const shortlistRows = rowsByStage.screened;
        const emails = shortlistRows
            .map(r => r.candidate.contacts?.email || '')
            .filter(Boolean);
        if (emails.length === 0) {
            toast.error(text('No emails available in the shortlist.', 'Nessuna email disponibile nella shortlist.'));
            return;
        }
        const mailtoHref = buildRecruiterInterestedCandidatesMailto({
            candidateEmails: emails,
            jobTitle: job.title,
            companyName: job.company_name,
            recruiterName: effectiveDisplayName,
            recruiterEmail: effectiveEmail,
        });
        if (typeof window !== 'undefined') {
            window.location.href = mailtoHref;
        }
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
            console.error('Failed to load candidate refinement transcript from pipeline:', error);
            toast.error(error?.message || text('Unable to load the AI refinement transcript right now.', 'Impossibile caricare la transcript di affinamento AI in questo momento.'));
        } finally {
            setLoadingRefinementChatCandidateId(null);
        }
    };

    const handleDownloadCv = async (candidate: CandidateProfile) => {
        if (downloadingCvCandidateId) return;

        setDownloadingCvCandidateId(candidate.id);
        try {
            const cvRecord = await getRecruiterCandidateCvRecord(job.id, {
                id: candidate.id,
                email: candidate.contacts?.email,
            });

            if (!cvRecord) {
                toast.info(text('No CV has been uploaded for this candidate yet.', 'Per questo candidato non è ancora stato caricato alcun CV.'));
                return;
            }

            await downloadCandidateCv(cvRecord);
        } catch (error: any) {
            console.error('Failed to download candidate CV from pipeline:', error);
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
                    jobContext={{ job, onJobUpdated: setJob }}
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

    return (
        <div className="mx-auto max-w-[1600px] animate-fade-in px-3 py-4 sm:px-8 lg:px-10">
            <button
                type="button"
                onClick={() => {
                    if (window.history.length > 1) {
                        navigate(-1);
                    } else {
                        navigate('/recruiter/dashboard');
                    }
                }}
                className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                {text('Back', 'Indietro')}
            </button>

            <div className="mt-2 min-w-0">
                <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">{job.title}</h1>
                <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                    {text('Drag a candidate between columns or use the selector on the card.', 'Trascina un candidato tra le colonne o usa il selettore sulla card.')}
                </p>
            </div>

            {isLoading ? (
                <div className="mt-8 flex justify-center rounded-3xl border border-slate-100 bg-slate-50 py-20 dark:border-slate-800 dark:bg-slate-900/20">
                    <Spinner />
                </div>
            ) : loadError ? (
                <div className="mt-8 rounded-3xl border border-rose-200 bg-rose-50 px-6 py-8 text-center text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
                    {loadError}
                </div>
            ) : rows.length === 0 ? (
                <div className="mt-8 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900/30">
                    <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">{text('No candidates yet', 'Nessun candidato ancora')}</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                        {text('Once candidates apply or are added, you can move them through the pipeline.', 'Quando i candidati si candidano o vengono aggiunti, puoi spostarli nella pipeline.')}
                    </p>
                </div>
            ) : (
                <div className="mt-6 flex gap-3 overflow-x-auto pb-4">
                    {PIPELINE_STAGES.map(stageDef => {
                        const list = rowsByStage[stageDef.id];
                        const isHover = dragOverStage === stageDef.id;
                        return (
                            <div
                                key={stageDef.id}
                                onDragOver={(e) => { e.preventDefault(); if (dragOverStage !== stageDef.id) setDragOverStage(stageDef.id); }}
                                onDragLeave={() => { if (dragOverStage === stageDef.id) setDragOverStage(null); }}
                                onDrop={() => handleDrop(stageDef.id)}
                                className={`flex w-72 flex-shrink-0 flex-col rounded-3xl border ${stageDef.accent.border} ${stageDef.accent.bg} ${isHover ? 'ring-2 ring-orange-300 dark:ring-orange-700' : ''} transition-shadow`}
                            >
                                <div className={`flex h-[52px] items-center justify-between gap-2 border-b ${stageDef.accent.border} px-4`}>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${stageDef.accent.dot}`} />
                                        <h3 className={`min-w-0 truncate text-sm font-black uppercase tracking-[0.14em] ${stageDef.accent.text}`}>
                                            {language === 'it' ? stageDef.labelIt : stageDef.labelEn}
                                        </h3>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        {stageDef.id === 'screened' && list.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={handleEmailShortlist}
                                                title={text('Email all shortlisted candidates', 'Email a tutti i candidati shortlist')}
                                                className={`inline-flex h-6 items-center justify-center gap-1 rounded-full bg-white px-2.5 text-[10px] font-black ${stageDef.accent.text} shadow-sm transition-colors hover:bg-orange-500 hover:text-white dark:bg-slate-950`}
                                                aria-label={text('Email all shortlisted candidates', 'Email a tutti i candidati shortlist')}
                                            >
                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                </svg>
                                                <span>Mail</span>
                                            </button>
                                        )}
                                        <span className={`rounded-full bg-white px-2 py-0.5 text-[11px] font-black ${stageDef.accent.text} shadow-sm dark:bg-slate-950`}>
                                            {list.length}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex-1 space-y-2 p-3 min-h-[200px]">
                                    {list.length === 0 ? (
                                        <p className="py-6 text-center text-xs italic text-slate-400">
                                            {text('Drop here', 'Trascina qui')}
                                        </p>
                                    ) : (
                                        list.map(row => (
                                            <KanbanCard
                                                key={row.candidate.id}
                                                row={row}
                                                currentStage={stages[row.candidate.id] || 'new'}
                                                onDragStart={(id) => setDraggingId(id)}
                                                onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                                                onStageChange={(s) => moveCandidate(row.candidate.id, s)}
                                                onOpen={() => setSelectedCandidate(row.candidate)}
                                                isUpdating={updatingIds.has(row.candidate.id)}
                                                note={job.candidate_notes?.[row.candidate.id]}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default JobPipelinePage;
