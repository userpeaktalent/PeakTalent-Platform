import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CandidateCvRecord, CandidateProfile, CandidateRefinementChat, JobProfile, MatchScoreBreakdown, TestResult } from '../types';
import { getAllCandidates, getApplicantsForJob, getJobById, requestCandidateAiRefinement, requestCandidateAssessment, saveScoreOverride, removeScoreOverride } from '../services/dbService';
import { downloadCandidateCv, getRecruiterCandidateCvRecord, getRecruiterCandidateRefinementChat, getLatestCandidateRefinementChat } from '../services/candidateAssetsService';
import { calculateMatchScore } from '../services/matchingService';
import { formatCandidateName, normalizePersonNamePart } from '../utils/nameFormat';
import { CandidateCard, Spinner } from './common';
import CandidateProfileView from './CandidateProfileView';
import { useLanguage } from './LanguageProvider';
import { toast } from 'sonner';
import RefinementChatModal from './RefinementChatModal';

interface RecruiterMatchesViewProps {
    job: JobProfile;
    onBack: () => void;
}

type RankingScope = 'applicants' | 'all_seekers';
type DegreeFilter = 'all' | 'job_min' | 'bachelor_plus' | 'master_plus' | 'phd_plus';
type ExperienceFilter = 'all' | '0_2' | '3_5' | '6_9' | '10_plus';
type QuestionnaireFilter = 'all' | 'questionnaire_completed';

type RankedCandidateRow = {
    candidate: CandidateProfile;
    scoreDetails: MatchScoreBreakdown;
    status: string;
    hasApplied: boolean;
    hasRefinementChat: boolean;
};

const DEGREE_ORDINAL: Record<string, number> = {
    hsd: 1,
    ad: 2,
    ba: 3,
    bsc: 3,
    beng: 3,
    bachelor: 3,
    ma: 4,
    msc: 4,
    meng: 4,
    mba: 4,
    master: 4,
    phd: 5,
    dba: 5,
    md: 5,
    jd: 5,
    doctorate: 5,
    postdoc: 6,
};

const getDegreeOrdinal = (value?: string) => {
    if (!value) return 0;
    const normalized = value.toLowerCase().trim();
    if (DEGREE_ORDINAL[normalized] !== undefined) return DEGREE_ORDINAL[normalized];
    if (normalized.includes('postdoc')) return 6;
    if (normalized.includes('phd') || normalized.includes('doctor')) return 5;
    if (normalized.includes('master') || normalized.includes('msc') || normalized.includes('mba')) return 4;
    if (normalized.includes('bachelor') || normalized.includes('bsc') || normalized.includes('beng')) return 3;
    if (normalized.includes('associate')) return 2;
    if (normalized.includes('high school') || normalized.includes('diploma')) return 1;
    return 0;
};

const getHighestDegreeOrdinal = (candidate: CandidateProfile) =>
    candidate.education?.length ? Math.max(...candidate.education.map((entry) => getDegreeOrdinal(entry.degree_level))) : 0;

const formatLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const formatStatusLabel = (status: string, text: (en: string, it: string) => string) => {
    if (status === 'pending') return text('Pending review', 'In attesa');
    if (status === 'invited') return text('Invited', 'Invitato');
    if (status === 'assessment_requested') return text('Questionnaire requested', 'Questionario richiesto');
    if (status === 'assessment_completed') return text('Questionnaire completed', 'Questionario completato');
    if (status === 'not_applied') return text('Interest not shown yet', 'Non ha ancora mostrato interesse');
    return formatLabel(status);
};

const SelectField: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
}> = ({ label, value, onChange, options }) => (
    <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {label}
        </span>
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
            ))}
        </select>
    </label>
);

const getCandidateQuestionnaireResult = (candidate: CandidateProfile, jobId: string): TestResult | undefined =>
    candidate.test_results?.find((result) => result.job_id === jobId && result.completed_at);

const getCandidateQuestionnaireScore = (candidate: CandidateProfile, jobId: string) => {
    const result = getCandidateQuestionnaireResult(candidate, jobId);
    return typeof result?.score === 'number' ? result.score : null;
};

const getCandidateDisplayName = (candidate: CandidateProfile) =>
    formatCandidateName(candidate) || candidate.contacts?.email || 'Candidate';

const isCandidateVisibleToRecruiters = (candidate: CandidateProfile) =>
    (candidate.profile_visibility ?? 'visible') !== 'private';

const toScorePercent = (score: number) => Math.round(score * 100);
const clampScorePercent = (score: number) => Math.max(0, Math.min(100, Math.round(score)));
const getQuestionnaireBonusPoints = (questionnaireScore?: number | null) =>
    typeof questionnaireScore === 'number'
        ? Math.max(0, Math.min(10, questionnaireScore / 10))
        : 0;

const getEffectiveScorePercent = (
    candidateId: string,
    scoreDetails: MatchScoreBreakdown,
    questionnaireScore?: number | null,
    scoreOverrides?: JobProfile['score_overrides']
) => {
    const overrideScore = scoreOverrides?.[candidateId]?.score;
    if (typeof overrideScore === 'number') {
        return clampScorePercent(overrideScore);
    }

    return clampScorePercent(toScorePercent(scoreDetails.finalScore) + getQuestionnaireBonusPoints(questionnaireScore));
};

const getRowEffectiveScorePercent = (
    row: RankedCandidateRow,
    jobId: string,
    scoreOverrides?: JobProfile['score_overrides']
) => getEffectiveScorePercent(
    row.candidate.id,
    row.scoreDetails,
    getCandidateQuestionnaireScore(row.candidate, jobId),
    scoreOverrides
);

const QuestionnaireReviewModal: React.FC<{
    candidate: CandidateProfile;
    job: JobProfile;
    result: TestResult;
    onClose: () => void;
    text: (en: string, it: string) => string;
}> = ({ candidate, job, result, onClose, text }) => {
    const displayName = formatCandidateName(candidate) || candidate.contacts?.email || 'Candidate';
    const answerCount = result.answers?.length || result.question_count || 0;
    const score = Math.round(result.score || 0);

    const scoreTone = score >= 80
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300'
        : score >= 60
            ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300'
            : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300';

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
            <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800 md:flex-row md:items-start md:justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                            {text('Questionnaire Review', 'Review questionario')}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                            {displayName}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {job.title} • {answerCount} {text('answers reviewed', 'risposte analizzate')}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`rounded-2xl border px-4 py-3 text-right ${scoreTone}`}>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">
                                {text('Questionnaire score', 'Score questionario')}
                            </p>
                            <p className="mt-1 text-3xl font-semibold tracking-tight">
                                {score}/100
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            {text('Close', 'Chiudi')}
                        </button>
                    </div>
                </div>

                <div className="max-h-[calc(88vh-110px)] overflow-y-auto px-6 py-6">
                    {result.answers && result.answers.length > 0 ? (
                        <div className="space-y-4">
                            {result.answers.map((answer, index) => (
                                <section
                                    key={`${answer.question_id}_${index}`}
                                    className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/40"
                                >
                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                        <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm dark:bg-slate-950 dark:text-slate-200">
                                            {text('Question', 'Domanda')} {index + 1}
                                        </span>
                                        <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${
                                            answer.is_correct
                                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                        }`}>
                                            {answer.is_correct ? text('Aligned', 'Allineata') : text('Needs verification', 'Da verificare')}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                        {answer.question_text}
                                    </h3>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                {text('Candidate answer', 'Risposta del candidato')}
                                            </p>
                                            <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                                                {answer.selected_option_text || text('No answer saved', 'Nessuna risposta salvata')}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                {text('Reference answer', 'Risposta di riferimento')}
                                            </p>
                                            <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                                                {answer.correct_option_text}
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900/40">
                            <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                {text('Answers are not available for this completion yet', 'Le risposte non sono ancora disponibili per questo completamento')}
                            </h3>
                            <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                                {text(
                                    'The completion score was saved, but the detailed question-by-question answers were not stored for this older submission.',
                                    'Lo score di completamento è stato salvato, ma per questa submission più vecchia non sono state memorizzate le risposte dettagliate domanda per domanda.'
                                )}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const RecruiterMatchesView: React.FC<RecruiterMatchesViewProps> = ({ job, onBack }) => {
    const { text, language } = useLanguage();
    const navigate = useNavigate();
    const [rankedApplicants, setRankedApplicants] = useState<RankedCandidateRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCandidate, setSelectedCandidate] = useState<CandidateProfile | null>(null);
    const [currentJob, setCurrentJob] = useState<JobProfile>(job);
    const [rankingScope, setRankingScope] = useState<RankingScope>('applicants');
    const [loadNote, setLoadNote] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [stepFilter, setStepFilter] = useState<QuestionnaireFilter>('all');
    const [degreeFilter, setDegreeFilter] = useState<DegreeFilter>('all');
    const [experienceFilter, setExperienceFilter] = useState<ExperienceFilter>('all');
    const [requestingCandidateId, setRequestingCandidateId] = useState<string | null>(null);
    const [reviewingQuestionnaire, setReviewingQuestionnaire] = useState<{ candidate: CandidateProfile; result: TestResult } | null>(null);
    const [reviewingRefinementChat, setReviewingRefinementChat] = useState<{ candidate: CandidateProfile; chat: CandidateRefinementChat } | null>(null);
    const [loadingRefinementChatCandidateId, setLoadingRefinementChatCandidateId] = useState<string | null>(null);
    const [downloadingCvCandidateId, setDownloadingCvCandidateId] = useState<string | null>(null);
    const [requestingAiRefinementCandidateId, setRequestingAiRefinementCandidateId] = useState<string | null>(null);
    const [assessmentEmailFailures, setAssessmentEmailFailures] = useState<Record<string, string>>({});
    const [overrideModal, setOverrideModal] = useState<{ candidateId: string; name: string; currentScore: number } | null>(null);
    const [overrideInput, setOverrideInput] = useState<{ score: string; reason: string }>({ score: '', reason: '' });
    const [isSavingOverride, setIsSavingOverride] = useState(false);
    const rankingScrollPositionRef = useRef(0);
    const [listAnimationTick, setListAnimationTick] = useState(0);

    useEffect(() => {
        setCurrentJob(job);
    }, [job]);

    useEffect(() => {
        let isCancelled = false;

        const fetchData = async () => {
            setIsLoading(true);
            setLoadNote('');

            try {
                let jobToUse = currentJob;
                if (!currentJob.title || !currentJob.industry) {
                    const jobRow = await getJobById(currentJob.id);
                    if (jobRow) {
                        jobToUse = jobRow;
                        setCurrentJob(jobRow);
                    }
                }

                const applicants = await getApplicantsForJob(jobToUse.id, jobToUse.applicant_emails || []);
                const applicantStatusByEmail = new Map(
                    applicants
                        .filter(({ candidate }) => Boolean(candidate.contacts?.email))
                        .map(({ candidate, status }) => [candidate.contacts.email.toLowerCase().trim(), status || 'pending'])
                );

                let candidatePool: Omit<RankedCandidateRow, 'hasRefinementChat'>[] = applicants
                    .filter(({ candidate }) => isCandidateVisibleToRecruiters(candidate))
                    .map(({ candidate, status }) => ({
                        candidate,
                        status: status || 'pending',
                        hasApplied: true,
                        scoreDetails: calculateMatchScore(jobToUse, candidate),
                    }));

                if (rankingScope === 'all_seekers') {
                    try {
                        const allCandidates = await getAllCandidates();
                        const seen = new Set<string>();
                        candidatePool = allCandidates.flatMap((candidate) => {
                            if (!isCandidateVisibleToRecruiters(candidate)) return [];
                            const email = candidate.contacts?.email?.toLowerCase().trim() || '';
                            const key = candidate.id || email;
                            if (!key || seen.has(key)) return [];
                            seen.add(key);
                            const status = applicantStatusByEmail.get(email) || 'not_applied';
                            return [{
                                candidate,
                                status,
                                hasApplied: status !== 'not_applied',
                                scoreDetails: calculateMatchScore(jobToUse, candidate),
                            }];
                        });
                    } catch (error) {
                        console.error('Failed to load full seeker pool for recruiter ranking:', error);
                        setLoadNote(text('The full candidate ranking is currently unavailable, so the list is showing only candidates who already showed interest.', 'Il ranking completo dei candidati non e disponibile al momento, quindi la lista mostra solo chi ha gia mostrato interesse.'));
                    }
                }

                const baseRankedPool = candidatePool
                    .map((row) => ({
                        ...row,
                        hasRefinementChat: Boolean(row.candidate.ai_refined),
                    }))
                    .sort((a, b) => {
                        const scoreA = getRowEffectiveScorePercent(a, jobToUse.id, jobToUse.score_overrides);
                        const scoreB = getRowEffectiveScorePercent(b, jobToUse.id, jobToUse.score_overrides);
                        return scoreB - scoreA;
                    });

                if (!isCancelled) {
                    setRankedApplicants(baseRankedPool);
                    setIsLoading(false);
                }
            } catch (error) {
                console.error('Failed to load applicants:', error);
                if (!isCancelled) {
                    setRankedApplicants([]);
                }
            } finally {
                if (!isCancelled) {
                    setIsLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isCancelled = true;
        };
    }, [currentJob.id, currentJob.industry, currentJob.title, rankingScope, text]);

    const questionnaireStageOptions = useMemo(() => [
        { value: 'all', label: text('All candidates', 'Tutti i candidati') },
        { value: 'questionnaire_completed', label: text('Questionnaire completed', 'Questionario completato') },
    ], [text]);

    const rankingScopeOptions = useMemo(() => [
        { value: 'applicants', label: text('Interest shown', 'Hanno mostrato interesse') },
        { value: 'all_seekers', label: text('Show all candidates', 'Mostra tutti i candidati') },
    ], [text]);

    const sortedApplicants = useMemo(() => {
        return [...rankedApplicants].sort((a, b) => {
            const scoreA = getRowEffectiveScorePercent(a, currentJob.id, currentJob.score_overrides);
            const scoreB = getRowEffectiveScorePercent(b, currentJob.id, currentJob.score_overrides);
            return scoreB - scoreA;
        });
    }, [rankedApplicants, currentJob.id, currentJob.score_overrides]);

    const filteredApplicants = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        const requiredDegree = getDegreeOrdinal(currentJob.constraints?.min_education_level);

        return sortedApplicants.filter((row) => {
            const { candidate, hasApplied, status, scoreDetails } = row;
            const personalInfo = candidate.personal_info || { first_name: '', last_name: '' };
            const candidateDisplayName = formatCandidateName(candidate);
            const experiences = Array.isArray(candidate.experiences) ? candidate.experiences : [];
            const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
            const itSkills = Array.isArray(candidate.it_skills) ? candidate.it_skills : [];
            const education = Array.isArray(candidate.education) ? candidate.education : [];
            const searchTarget = [
                candidateDisplayName,
                normalizePersonNamePart(personalInfo.first_name),
                normalizePersonNamePart(personalInfo.last_name),
                candidate.current_job_function,
                candidate.summary_text,
                experiences[0]?.role,
                experiences[0]?.company,
                candidate.residence?.country,
                candidate.residence?.city,
                ...skills.map((skill) => skill.skill_name),
                ...itSkills.map((skill) => skill.skill_name),
                ...education.map((entry) => `${entry.degree_level} ${entry.major} ${entry.institution}`),
            ].filter(Boolean).join(' ').toLowerCase();

            if (query && !searchTarget.includes(query)) return false;
            if (statusFilter === 'applied' && !hasApplied) return false;
            if (statusFilter === 'not_applied' && hasApplied) return false;
            if (!['all', 'applied', 'not_applied'].includes(statusFilter) && status !== statusFilter) return false;

            const highestDegree = getHighestDegreeOrdinal(candidate);
            if (degreeFilter === 'job_min' && requiredDegree > 0 && highestDegree < requiredDegree) return false;
            if (degreeFilter === 'bachelor_plus' && highestDegree < 3) return false;
            if (degreeFilter === 'master_plus' && highestDegree < 4) return false;
            if (degreeFilter === 'phd_plus' && highestDegree < 5) return false;

            const years = candidate.total_years_experience ?? 0;
            if (experienceFilter === '0_2' && years > 2) return false;
            if (experienceFilter === '3_5' && (years < 3 || years > 5)) return false;
            if (experienceFilter === '6_9' && (years < 6 || years > 9)) return false;
            if (experienceFilter === '10_plus' && years < 10) return false;

            if (stepFilter === 'questionnaire_completed' && !getCandidateQuestionnaireResult(candidate, currentJob.id)) return false;

            return true;
        });
    }, [sortedApplicants, searchQuery, statusFilter, stepFilter, degreeFilter, experienceFilter, currentJob]);

    const stats = useMemo(() => ({
        avgScore: filteredApplicants.length
            ? Math.round(filteredApplicants.reduce((sum, row) => sum + getRowEffectiveScorePercent(row, currentJob.id, currentJob.score_overrides), 0) / filteredApplicants.length)
            : 0,
        excellentMatches: filteredApplicants.filter((row) => getRowEffectiveScorePercent(row, currentJob.id, currentJob.score_overrides) >= 60).length,
        goodMatches: filteredApplicants.filter((row) => {
            const percent = getRowEffectiveScorePercent(row, currentJob.id, currentJob.score_overrides);
            return percent >= 50 && percent < 60;
        }).length,
        lowMatches: filteredApplicants.filter((row) => getRowEffectiveScorePercent(row, currentJob.id, currentJob.score_overrides) < 50).length,
        total: filteredApplicants.length,
        applied: filteredApplicants.filter((row) => row.hasApplied).length,
    }), [filteredApplicants, currentJob.id, currentJob.score_overrides]);

    const rankByCandidateId = useMemo(
        () => new Map(sortedApplicants.map((row, index) => [row.candidate.id, index + 1])),
        [sortedApplicants]
    );

    const activeFilterCount = [
        searchQuery.trim(),
        rankingScope !== 'applicants' ? rankingScope : '',
        statusFilter !== 'all' ? statusFilter : '',
        stepFilter !== 'all' ? stepFilter : '',
        degreeFilter !== 'all' ? degreeFilter : '',
        experienceFilter !== 'all' ? experienceFilter : '',
    ].filter(Boolean).length;

    const filteredApplicantSignature = useMemo(
        () => filteredApplicants.map((row) => `${row.candidate.id}:${row.status}:${getRowEffectiveScorePercent(row, currentJob.id, currentJob.score_overrides)}`).join('|'),
        [filteredApplicants, currentJob.id, currentJob.score_overrides]
    );

    useEffect(() => {
        if (isLoading) return;
        setListAnimationTick((current) => current + 1);
    }, [filteredApplicantSignature, isLoading]);

    const clearFilters = () => {
        setSearchQuery('');
        setRankingScope('applicants');
        setStatusFilter('all');
        setStepFilter('all');
        setDegreeFilter('all');
        setExperienceFilter('all');
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
            console.error('Failed to load candidate refinement transcript:', error);
            toast.error(error?.message || text('Unable to load the AI refinement transcript right now.', 'Impossibile caricare la transcript di affinamento AI in questo momento.'));
        } finally {
            setLoadingRefinementChatCandidateId(null);
        }
    };

    const handleRequestAssessment = async (candidate: CandidateProfile) => {
        if (requestingCandidateId) return;

        if (candidate.test_results?.some((result) => result.job_id === currentJob.id)) {
            toast.info(text('This candidate already completed the role-specific questionnaire.', 'Questo candidato ha già completato il questionario specifico sul ruolo.'));
            return;
        }

        setRequestingCandidateId(candidate.id);

        try {
            const { updatedJob, assessmentStatus, emailDeliveryError } = await requestCandidateAssessment(currentJob, candidate);
            setCurrentJob(updatedJob);
            setRankedApplicants((current) => current.map((row) => (
                row.candidate.id === candidate.id
                    ? {
                        ...row,
                        hasApplied: true,
                        status: assessmentStatus === 'already_completed' ? 'assessment_completed' : 'assessment_requested',
                    }
                    : row
            )));

            setAssessmentEmailFailures((current) => {
                const next = { ...current };
                if (emailDeliveryError) {
                    next[candidate.id] = emailDeliveryError;
                } else {
                    delete next[candidate.id];
                }
                return next;
            });

            toast.success(
                assessmentStatus === 'already_completed'
                    ? text('This candidate had already completed the requested questionnaire.', 'Questo candidato aveva già completato il questionario richiesto.')
                    : candidate.ai_refined
                        ? text('Questionnaire request sent. The candidate can now complete the role-specific questionnaire.', 'Richiesta inviata. Il candidato può ora completare il questionario specifico sul ruolo.')
                        : text('Questionnaire request sent. The candidate will first complete the AI profile refinement, then the role-specific questionnaire.', 'Richiesta inviata. Il candidato completerà prima il perfezionamento AI del profilo e poi il questionario specifico sul ruolo.')
            );

            if (emailDeliveryError) {
                toast.warning(
                    language === 'it'
                        ? `Invito salvato, ma email non inviata: ${emailDeliveryError}`
                        : `Invite saved, but email was not delivered: ${emailDeliveryError}`
                );
            }
        } catch (error: any) {
            console.error('Failed to request candidate assessment:', error);
            toast.error(
                error?.message || text('The questionnaire request could not be sent right now.', 'La richiesta del questionario non può essere inviata in questo momento.')
            );
        } finally {
            setRequestingCandidateId(null);
        }
    };

    const handleRequestAiRefinement = async (candidate: CandidateProfile) => {
        if (requestingAiRefinementCandidateId) return;

        setRequestingAiRefinementCandidateId(candidate.id);
        try {
            const { emailDeliveryError } = await requestCandidateAiRefinement(currentJob, candidate);
            toast.success(text('AI refinement request sent to the candidate.', 'Richiesta di perfezionamento AI inviata al candidato.'));
            if (emailDeliveryError) {
                toast.warning(
                    language === 'it'
                        ? `Richiesta salvata, ma email non inviata: ${emailDeliveryError}`
                        : `Request saved, but email was not delivered: ${emailDeliveryError}`
                );
            }
        } catch (error: any) {
            console.error('Failed to request candidate AI refinement:', error);
            toast.error(error?.message || text('The AI refinement request could not be sent right now.', 'La richiesta di perfezionamento AI non può essere inviata in questo momento.'));
        } finally {
            setRequestingAiRefinementCandidateId(null);
        }
    };

    const handleDownloadCv = async (candidate: CandidateProfile) => {
        if (downloadingCvCandidateId) return;

        setDownloadingCvCandidateId(candidate.id);
        try {
            const cvRecord = await getRecruiterCandidateCvRecord(currentJob.id, {
                id: candidate.id,
                email: candidate.contacts?.email,
            });

            if (!cvRecord) {
                toast.info(text('No CV has been uploaded for this candidate yet.', 'Per questo candidato non è ancora stato caricato alcun CV.'));
                return;
            }

            await downloadCandidateCv(cvRecord);
        } catch (error: any) {
            console.error('Failed to download recruiter-visible candidate CV:', error);
            toast.error(error?.message || text('Unable to download this CV right now.', 'Impossibile scaricare questo CV in questo momento.'));
        } finally {
            setDownloadingCvCandidateId(null);
        }
    };

    const openOverrideModal = (candidateId: string, name: string, currentScore: number) => {
        const existing = currentJob.score_overrides?.[candidateId];
        setOverrideInput({ score: String(existing?.score ?? currentScore), reason: existing?.reason ?? '' });
        setOverrideModal({ candidateId, name, currentScore });
    };

    const handleSaveOverride = async () => {
        if (!overrideModal) return;
        const parsed = parseInt(overrideInput.score, 10);
        if (isNaN(parsed) || parsed < 0 || parsed > 100) {
            toast.error(text('Score must be between 0 and 100.', 'Il punteggio deve essere tra 0 e 100.'));
            return;
        }
        setIsSavingOverride(true);
        try {
            const updated = await saveScoreOverride(currentJob, overrideModal.candidateId, parsed, overrideInput.reason.trim() || undefined);
            setCurrentJob(updated);
            toast.success(text('Score override saved.', 'Punteggio sovrascritto salvato.'));
            setOverrideModal(null);
        } catch (e: any) {
            toast.error(e?.message || text('Failed to save override.', 'Salvataggio non riuscito.'));
        } finally {
            setIsSavingOverride(false);
        }
    };

    const handleRemoveOverride = async (candidateId: string) => {
        try {
            const updated = await removeScoreOverride(currentJob, candidateId);
            setCurrentJob(updated);
            toast.success(text('Override removed.', 'Override rimosso.'));
            setOverrideModal(null);
        } catch (e: any) {
            toast.error(e?.message || text('Failed to remove override.', 'Rimozione non riuscita.'));
        }
    };

    const handleOpenCandidateProfile = (candidate: CandidateProfile) => {
        if (typeof window !== 'undefined') {
            rankingScrollPositionRef.current = window.scrollY || window.pageYOffset || 0;
        }
        setSelectedCandidate(candidate);
    };

    const handleCloseCandidateProfile = () => {
        setSelectedCandidate(null);

        if (typeof window === 'undefined') return;

        const restoreScroll = () => {
            window.scrollTo({
                top: rankingScrollPositionRef.current,
                left: 0,
                behavior: 'auto',
            });
        };

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(restoreScroll);
        });
    };

    const selectedCandidateQuestionnaireResult = selectedCandidate
        ? getCandidateQuestionnaireResult(selectedCandidate, currentJob.id)
        : null;
    const selectedCandidateRow = selectedCandidate
        ? rankedApplicants.find((row) => row.candidate.id === selectedCandidate.id) || null
        : null;

    const overlayNodes = (
        <>
            {reviewingQuestionnaire && (
                <QuestionnaireReviewModal
                    candidate={reviewingQuestionnaire.candidate}
                    job={currentJob}
                    result={reviewingQuestionnaire.result}
                    onClose={() => setReviewingQuestionnaire(null)}
                    text={text}
                />
            )}

            {reviewingRefinementChat && (
                <RefinementChatModal
                    chat={reviewingRefinementChat.chat}
                    candidateLabel={getCandidateDisplayName(reviewingRefinementChat.candidate)}
                    onClose={() => setReviewingRefinementChat(null)}
                />
            )}

            {overrideModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
                        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {text('Edit', 'Modifica')}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                            {overrideModal.name} &mdash; {text('Current score', 'Punteggio attuale')}: <span className="font-semibold">{overrideModal.currentScore}%</span>
                        </p>

                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                            {text('Your score (0–100)', 'Il tuo punteggio (0–100)')}
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            value={overrideInput.score}
                            onChange={e => setOverrideInput(v => ({ ...v, score: e.target.value }))}
                            className="w-full mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
                        />

                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                            {text('Reason (optional)', 'Motivazione (opzionale)')}
                        </label>
                        <textarea
                            rows={3}
                            value={overrideInput.reason}
                            onChange={e => setOverrideInput(v => ({ ...v, reason: e.target.value }))}
                            placeholder={text('e.g. strong cultural fit from interview…', 'es. ottimo fit culturale emerso al colloquio…')}
                            className="w-full mb-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 resize-none"
                        />

                        <div className="flex gap-2">
                            <button
                                onClick={handleSaveOverride}
                                disabled={isSavingOverride}
                                className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-all"
                            >
                                {isSavingOverride ? text('Saving…', 'Salvataggio…') : text('Save override', 'Salva')}
                            </button>
                            {currentJob.score_overrides?.[overrideModal.candidateId] && (
                                <button
                                    onClick={() => handleRemoveOverride(overrideModal.candidateId)}
                                    className="px-4 py-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/20 text-sm font-semibold transition-all"
                                    title={text('Remove override', 'Rimuovi override')}
                                >
                                    {text('Remove', 'Rimuovi')}
                                </button>
                            )}
                            <button
                                onClick={() => setOverrideModal(null)}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 text-sm font-semibold transition-all"
                            >
                                {text('Cancel', 'Annulla')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    if (selectedCandidate) {
        return (
            <>
                {overlayNodes}
                <CandidateProfileView
                    candidate={selectedCandidate}
                    onBack={handleCloseCandidateProfile}
                    showEditButton={false}
                    auxiliaryActions={
                        <>
                            {selectedCandidateQuestionnaireResult && (
                                <button
                                    type="button"
                                    onClick={() => setReviewingQuestionnaire({ candidate: selectedCandidate, result: selectedCandidateQuestionnaireResult })}
                                    className="inline-flex h-9 w-full min-w-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 sm:w-auto sm:min-w-[150px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    {text('Questionnaire answers', 'Risposte questionario')}
                                </button>
                            )}
                            {selectedCandidateRow?.hasRefinementChat && (
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
        <div className="mx-auto max-w-6xl animate-fade-in px-3 pt-2.5 sm:px-6 lg:px-8">
            {overlayNodes}
            <div className="mb-3">
                <button
                    onClick={onBack}
                    className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    {text('Back', 'Indietro')}
                </button>

                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">{currentJob.title}</h1>
            </div>

            <div className="mb-4 space-y-2.5 pt-0">
                <div className="flex flex-col gap-2.5 sm:flex-row">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder={text('Search by name, role, skill, company, or degree...', 'Cerca per nome, ruolo, skill, azienda o titolo di studio...')}
                        className="w-full flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm outline-none transition-colors focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button onClick={() => setShowFilters((current) => !current)} className={`rounded-2xl border px-5 py-2.5 text-sm font-bold transition-all ${showFilters || activeFilterCount > 0 ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
                        {text('Filters', 'Filtri')} {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
                    </button>
                </div>

                {showFilters && (
                    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                        <div className="mb-3 flex items-center justify-end gap-3">
                            {activeFilterCount > 0 && <button onClick={clearFilters} className="text-sm font-semibold text-orange-500 hover:text-orange-600">{text('Clear all', 'Cancella tutto')}</button>}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <SelectField
                                label={text('Interest shown', 'Interesse mostrato')}
                                value={rankingScope}
                                onChange={(value) => setRankingScope(value as RankingScope)}
                                options={rankingScopeOptions}
                            />
                            <SelectField
                                label={text('Questionnaire', 'Questionario')}
                                value={stepFilter}
                                onChange={(value) => setStepFilter(value as QuestionnaireFilter)}
                                options={questionnaireStageOptions}
                            />
                            <SelectField
                                label={text('Education title', 'Titolo di studio')}
                                value={degreeFilter}
                                onChange={(value) => setDegreeFilter(value as DegreeFilter)}
                                options={[{ value: 'all', label: text('Any degree', 'Qualsiasi titolo') }, { value: 'job_min', label: text('Meets job minimum', 'Rispetta il minimo job') }, { value: 'bachelor_plus', label: text('Bachelor+', 'Laurea triennale+') }, { value: 'master_plus', label: text('Master+', 'Magistrale+') }, { value: 'phd_plus', label: text('PhD+', 'PhD+') }]}
                            />
                            <SelectField
                                label={text('Work experience', 'Esperienza lavorativa')}
                                value={experienceFilter}
                                onChange={(value) => setExperienceFilter(value as ExperienceFilter)}
                                options={[{ value: 'all', label: text('Any experience', 'Qualsiasi esperienza') }, { value: '0_2', label: text('0-2 years', '0-2 anni') }, { value: '3_5', label: text('3-5 years', '3-5 anni') }, { value: '6_9', label: text('6-9 years', '6-9 anni') }, { value: '10_plus', label: text('10+ years', '10+ anni') }]}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
                <div className="space-y-6 md:col-span-1">
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="flex items-start gap-2.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
                            </svg>
                            <span className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                {text(
                                    'AI-assisted content — Recommendations and evaluations are generated by AI to support your search. Final hiring decisions are always made by people.',
                                    "Contenuto assistito dall'AI — Raccomandazioni e valutazioni sono generate dall'AI a supporto della tua ricerca. Le decisioni finali di assunzione sono sempre prese da persone."
                                )}
                            </span>
                        </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{text('Candidate Scores', 'Punteggio candidati')}</h3>
                        <div className="grid grid-cols-1 gap-3">
                            <div className="rounded-2xl border border-emerald-300 bg-emerald-100/80 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">{text('Great', 'Ottimo')}</div>
                                        <div className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">{text('60% and above', 'Dal 60% in su')}</div>
                                    </div>
                                    <div className="inline-flex min-w-[44px] items-center justify-center rounded-2xl bg-white px-3 py-2 text-2xl font-semibold tracking-tight text-emerald-800 shadow-sm dark:bg-slate-900 dark:text-emerald-300">
                                        {stats.excellentMatches}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-green-200 bg-green-50/80 p-3 dark:border-green-900/40 dark:bg-green-950/20">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-green-700 dark:text-green-300">{text('Good', 'Buono')}</div>
                                        <div className="mt-1 text-xs text-green-700/80 dark:text-green-200/80">{text('50% to 59%', 'Dal 50% al 59%')}</div>
                                    </div>
                                    <div className="inline-flex min-w-[44px] items-center justify-center rounded-2xl bg-white px-3 py-2 text-2xl font-semibold tracking-tight text-green-700 shadow-sm dark:bg-slate-900 dark:text-green-300">
                                        {stats.goodMatches}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-900/40 dark:bg-rose-950/20">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-600 dark:text-rose-300">{text('Not fit', 'Basso')}</div>
                                        <div className="mt-1 text-xs text-rose-700/80 dark:text-rose-200/80">{text('Below 50%', 'Sotto il 50%')}</div>
                                    </div>
                                    <div className="inline-flex min-w-[44px] items-center justify-center rounded-2xl bg-white px-3 py-2 text-2xl font-semibold tracking-tight text-rose-600 shadow-sm dark:bg-slate-900 dark:text-rose-300">
                                        {stats.lowMatches}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="md:col-span-3">
                    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                        <div className="p-6">
                            {loadNote && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">{loadNote}</div>}

                            {isLoading ? (
                                <div className="flex flex-col items-center gap-4 py-20">
                                    <Spinner />
                                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{text('Candidate ranking', 'Classifica candidati')}</p>
                                </div>
                            ) : filteredApplicants.length > 0 ? (
                                <div className="space-y-8">
                                    {filteredApplicants.map((row, index) => {
                                        const { candidate, scoreDetails, status } = row;
                                        const questionnaireResult = getCandidateQuestionnaireResult(candidate, currentJob.id);
                                        const effectiveScorePercent = getRowEffectiveScorePercent(row, currentJob.id, currentJob.score_overrides);
                                        const hasCompletedAssessment = Boolean(questionnaireResult);
                                        const needsAiRefinement = !candidate.ai_refined;
                                        const assessmentAlreadyRequested = status === 'assessment_requested';
                                        const assessmentInviteEmailFailed = Boolean(assessmentEmailFailures[candidate.id]);
                                        return (
                                            <div
                                                key={`${candidate.id}-${listAnimationTick}`}
                                                className="animate-candidate-cascade relative group opacity-0"
                                                style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
                                            >
                                                <CandidateCard
                                                    candidate={candidate}
                                                    scoreDetails={scoreDetails}
                                                    effectiveScorePercent={effectiveScorePercent}
                                                    rankNumber={rankByCandidateId.get(candidate.id) || index + 1}
                                                    questionnaireScore={questionnaireResult?.score ?? null}
                                                    isLocked={false}
                                                    recruiterOverride={currentJob.score_overrides?.[candidate.id] ?? null}
                                                    onEditOverride={() => openOverrideModal(candidate.id, getCandidateDisplayName(candidate), effectiveScorePercent)}
                                                    onOpenProfile={() => handleOpenCandidateProfile(candidate)}
                                                    nextStepAction={
                                                        !hasCompletedAssessment && (!assessmentAlreadyRequested || assessmentInviteEmailFailed) ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const hasQuiz = Boolean(currentJob.technical_test?.questions?.length);
                                                                    if (!hasQuiz) {
                                                                        navigate(`/recruiter/quiz/${currentJob.id}`, {
                                                                            state: { job: currentJob, pendingCandidate: candidate },
                                                                        });
                                                                    } else {
                                                                        void handleRequestAssessment(candidate);
                                                                    }
                                                                }}
                                                                disabled={Boolean(requestingCandidateId)}
                                                                className="w-full min-h-[42px] flex flex-wrap items-center justify-between gap-2 group/nxt rounded-xl px-3 py-2 bg-orange-50 hover:bg-orange-500 border border-orange-200 hover:border-orange-500 text-orange-600 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed sm:flex-nowrap"
                                                            >
                                                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                                                    <span className="text-[11px] font-bold leading-tight">
                                                                        {requestingCandidateId === candidate.id
                                                                            ? text('Sending...', 'Invio in corso...')
                                                                            : assessmentInviteEmailFailed
                                                                                ? text('Retry questionnaire email', 'Riprova invio email questionario')
                                                                                : text('Advance to next step', 'Avanza al round successivo')}
                                                                    </span>
                                                                    <span className="min-w-0 text-[11px] leading-tight opacity-70 group-hover/nxt:opacity-90 sm:truncate">
                                                                        {assessmentInviteEmailFailed
                                                                            ? text('Email not delivered', 'Email non consegnata')
                                                                            : !currentJob.technical_test?.questions?.length
                                                                                ? text('Create questionnaire first', 'Prima crea il questionario')
                                                                                : needsAiRefinement ? text('AI interview + questionnaire', 'AI interview + questionario') : text('Role-specific questionnaire', 'Questionario specifico per il ruolo')}
                                                                    </span>
                                                                </div>
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                                            </button>
                                                        ) : assessmentAlreadyRequested && !hasCompletedAssessment ? (
                                                            <div className="min-h-[42px] flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-sky-600 dark:border-sky-900/30 dark:bg-sky-950/20 dark:text-sky-300">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                                <span className="text-[11px] font-semibold">{text('Questionnaire sent · Waiting for response', 'Questionario inviato · In attesa di risposta')}</span>
                                                            </div>
                                                        ) : hasCompletedAssessment && needsAiRefinement ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => { void handleRequestAiRefinement(candidate); }}
                                                                disabled={requestingAiRefinementCandidateId === candidate.id}
                                                                className="w-full min-h-[42px] flex flex-wrap items-center justify-between gap-2 group/nxt rounded-xl px-3 py-2 bg-amber-50 hover:bg-amber-500 border border-amber-200 hover:border-amber-500 text-amber-600 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed sm:flex-nowrap"
                                                            >
                                                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                                                    <span className="text-[11px] font-bold leading-tight">
                                                                        {requestingAiRefinementCandidateId === candidate.id ? text('Sending...', 'Invio in corso...') : text('Complete the selection', 'Completa la selezione')}
                                                                    </span>
                                                                    <span className="min-w-0 text-[11px] leading-tight opacity-70 group-hover/nxt:opacity-90 sm:truncate">{text('Request AI interview', 'Richiedi AI interview')}</span>
                                                                </div>
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                                            </button>
                                                        ) : hasCompletedAssessment && !needsAiRefinement ? (
                                                            <div className="min-h-[42px] flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-300">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                                <span className="text-[11px] font-semibold">{text('Selection complete · Questionnaire + AI Interview done', 'Selezione completata · Questionario + AI Interview completati')}</span>
                                                            </div>
                                                        ) : null
                                                    }
                                                />

                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50/70 py-20 text-center dark:border-slate-800 dark:bg-slate-950/40">
                                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-900"><svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
                                    <h3 className="text-lg font-semibold tracking-tight text-slate-800 dark:text-slate-100">{text('No profiles match these filters', 'Nessun profilo corrisponde a questi filtri')}</h3>
                                    <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">{text('Try widening the shortlist or clearing a few filters.', 'Prova ad allargare la shortlist o a togliere qualche filtro.')}</p>
                                    {activeFilterCount > 0 && <button onClick={clearFilters} className="mt-5 text-sm font-semibold text-orange-500 hover:text-orange-600">{text('Clear all filters', 'Cancella tutti i filtri')}</button>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RecruiterMatchesView;
