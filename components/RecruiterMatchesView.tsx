import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CandidateCvRecord, CandidateProfile, CandidateRefinementChat, JobProfile, MatchScoreBreakdown, MatchingPillarWeights, PrestigeListOverride, RecruiterProfile, TestResult } from '../types';
import { getAllCandidates, getApplicantsForJob, getJobById, getJobsForRecruiter, getRecruiter, requestCandidateAiRefinement, requestCandidateAssessment, saveCandidateInterestReview, saveScoreOverride, removeScoreOverride, removeCandidateInterestReview, saveJobRankingConfig, saveRecruiterRankingConfig, saveJobHiredCandidate } from '../services/dbService';
import { TIER_1_UNIVERSITIES, TIER_2_UNIVERSITIES, TIER_3_UNIVERSITIES } from '../utils/universityTiers';
import { TIER_1_COMPANIES, TIER_2_COMPANIES, TIER_3_COMPANIES } from '../utils/companyPrestige';
import { downloadCandidateCv, getRecruiterCandidateCvRecord, getRecruiterCandidateRefinementChat, getLatestCandidateRefinementChat } from '../services/candidateAssetsService';
import { DEFAULT_MATCHING_PILLAR_WEIGHTS, calculateMatchScore, normalizeMatchingPillarWeights } from '../services/matchingService';
import { formatCandidateName, normalizePersonNamePart } from '../utils/nameFormat';
import { CandidateCard, Spinner } from './common';
import CandidateProfileView from './CandidateProfileView';
import CandidateComparisonView from './CandidateComparisonView';
import { useLanguage } from './LanguageProvider';
import { toast } from 'sonner';
import RefinementChatModal from './RefinementChatModal';
import { withRetry } from '../utils/retry';
import { getEducationLevelOrdinal } from '../utils/education';
import { getCurrentQuizResult, isJobQuizEnabled } from '../utils/questionnaire';
import { useAuth } from './AuthProvider';
import {
    EMAIL_SENDING_PAUSED_MESSAGE,
    getCandidateProfileVisibilitySettingEnabled,
    getRecruiterAllCandidatesEnabled,
    PLATFORM_CANDIDATE_PROFILE_VISIBILITY_SETTING_CHANGED_EVENT,
    PLATFORM_RECRUITER_ALL_CANDIDATES_CHANGED_EVENT,
} from '../services/platformSettingsService';
import { buildRecruiterInterestedCandidatesMailto } from '../services/accessLinks';
import { downloadTabularData, InviteEmailTemplateFormat } from '../utils/inviteEmailImport';
import { ApplicationStage, deriveStageFromContext } from '../utils/pipelineStages';
import { useStageActions } from '../utils/applicationStageActions';
import { StageSelector } from './StageSelector';

interface RecruiterMatchesViewProps {
    job: JobProfile;
    onBack: () => void;
}

type RankingScope = 'applicants' | 'recruiter_pool' | 'all_seekers';
type DegreeFilter = 'all' | 'job_min' | 'bachelor_plus' | 'master_plus' | 'phd_plus';
type ExperienceFilter = 'all' | '2_plus' | '5_plus' | '7_plus' | '10_plus' | '15_plus';
type QuestionnaireFilter = 'all' | 'questionnaire_completed';
type HiringProcessView = 'ranking' | 'interested_process' | 'excluded_process';
type CandidateInterestDecision = 'interested' | 'not_interested';
type RankingWeightKey = keyof MatchingPillarWeights;

type RankedCandidateRow = {
    candidate: CandidateProfile;
    scoreDetails: MatchScoreBreakdown;
    status: string;
    hasApplied: boolean;
    hasRefinementChat: boolean;
};

const RANKING_WEIGHT_KEYS: RankingWeightKey[] = ['semantic', 'hard', 'industry', 'education', 'careerPrestige'];

type PrestigeTierKey = 'tier1' | 'tier2' | 'tier3';
const PRESTIGE_TIER_KEYS: PrestigeTierKey[] = ['tier1', 'tier2', 'tier3'];

interface PrestigeListState {
    enabled: boolean;
    lists: Record<PrestigeTierKey, string[]>;
}

const UNIVERSITY_DEFAULTS: Record<PrestigeTierKey, string[]> = {
    tier1: TIER_1_UNIVERSITIES,
    tier2: TIER_2_UNIVERSITIES,
    tier3: TIER_3_UNIVERSITIES,
};

const COMPANY_DEFAULTS: Record<PrestigeTierKey, string[]> = {
    tier1: TIER_1_COMPANIES,
    tier2: TIER_2_COMPANIES,
    tier3: TIER_3_COMPANIES,
};

const PILLAR_COLORS: Record<RankingWeightKey, { dot: string; bar: string; accent: string }> = {
    semantic: { dot: 'bg-violet-500', bar: 'bg-violet-500', accent: 'text-violet-600 dark:text-violet-300' },
    hard: { dot: 'bg-emerald-500', bar: 'bg-emerald-500', accent: 'text-emerald-600 dark:text-emerald-300' },
    industry: { dot: 'bg-sky-500', bar: 'bg-sky-500', accent: 'text-sky-600 dark:text-sky-300' },
    education: { dot: 'bg-amber-500', bar: 'bg-amber-500', accent: 'text-amber-600 dark:text-amber-300' },
    careerPrestige: { dot: 'bg-rose-500', bar: 'bg-rose-500', accent: 'text-rose-600 dark:text-rose-300' },
};

const buildWeightDraft = (weights?: Partial<MatchingPillarWeights> | null): Record<RankingWeightKey, number> => {
    const normalized = normalizeMatchingPillarWeights(weights);
    return RANKING_WEIGHT_KEYS.reduce((draft, key) => {
        draft[key] = Math.round(normalized[key] * 100);
        return draft;
    }, {} as Record<RankingWeightKey, number>);
};

const parseWeightDraft = (draft: Record<RankingWeightKey, number>): MatchingPillarWeights | null => {
    const parsed = RANKING_WEIGHT_KEYS.reduce((weights, key) => {
        const value = draft[key];
        weights[key] = Number.isFinite(value) ? Math.max(0, value) / 100 : NaN;
        return weights;
    }, {} as MatchingPillarWeights);

    if (RANKING_WEIGHT_KEYS.some((key) => !Number.isFinite(parsed[key]))) {
        return null;
    }

    return parsed;
};

const getWeightDraftTotal = (draft: Record<RankingWeightKey, number>) =>
    RANKING_WEIGHT_KEYS.reduce((sum, key) => sum + (Number.isFinite(draft[key]) ? draft[key] : 0), 0);

const buildPrestigeListState = (
    override: PrestigeListOverride | null | undefined,
    defaults: Record<PrestigeTierKey, string[]>,
): PrestigeListState => {
    if (!override) {
        return {
            enabled: false,
            lists: {
                tier1: [...defaults.tier1],
                tier2: [...defaults.tier2],
                tier3: [...defaults.tier3],
            },
        };
    }
    return {
        enabled: true,
        lists: {
            tier1: Array.isArray(override.tier1) ? [...override.tier1] : [...defaults.tier1],
            tier2: Array.isArray(override.tier2) ? [...override.tier2] : [...defaults.tier2],
            tier3: Array.isArray(override.tier3) ? [...override.tier3] : [...defaults.tier3],
        },
    };
};

const prestigeStateToOverride = (state: PrestigeListState): PrestigeListOverride | null => {
    if (!state.enabled) return null;
    return {
        tier1: state.lists.tier1,
        tier2: state.lists.tier2,
        tier3: state.lists.tier3,
    };
};

const prestigeStateSignature = (state: PrestigeListState): string => {
    if (!state.enabled) return 'default';
    return PRESTIGE_TIER_KEYS.map((tier) => [...state.lists[tier]].sort().join('|')).join('||');
};

const applyRecruiterRankingConfigToJob = (job: JobProfile, recruiter?: RecruiterProfile | null): JobProfile => {
    if (!recruiter) return job;

    return {
        ...job,
        ranking_weights: job.ranking_weights ?? recruiter.ranking_weights,
        ranking_universities: job.ranking_universities !== undefined ? job.ranking_universities : recruiter.ranking_universities,
        ranking_companies: job.ranking_companies !== undefined ? job.ranking_companies : recruiter.ranking_companies,
    };
};

const getDegreeOrdinal = (value?: string) => getEducationLevelOrdinal(value);

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
    containerClassName?: string;
}> = ({ label, value, onChange, options, containerClassName = '' }) => (
    <label className={`block ${containerClassName}`}>
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {label}
        </span>
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/90 px-3.5 text-[13px] font-medium text-slate-700 outline-none transition-colors focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
            ))}
        </select>
    </label>
);

const getCandidateQuestionnaireResult = (candidate: CandidateProfile, job: JobProfile): TestResult | undefined =>
    getCurrentQuizResult(candidate, job);

const getCandidateQuestionnaireScore = (candidate: CandidateProfile, job: JobProfile) => {
    const result = getCandidateQuestionnaireResult(candidate, job);
    return typeof result?.score === 'number' ? result.score : null;
};

const getCandidateDisplayName = (candidate: CandidateProfile) =>
    formatCandidateName(candidate) || candidate.contacts?.email || 'Candidate';

const getCandidateInterestDecision = (job: JobProfile, candidateId: string): CandidateInterestDecision | null =>
    job.candidate_interest_reviews?.[candidateId]?.decision ?? null;

const isCandidateVisibleToRecruiters = (candidate: CandidateProfile, respectCandidatePrivacy: boolean) =>
    !respectCandidatePrivacy || (candidate.profile_visibility ?? 'visible') !== 'private';

const clampScorePercent = (score: number) => Math.max(0, Math.min(100, Math.round(score)));
const getQuestionnaireBonusPoints = (questionnaireScore?: number | null) =>
    typeof questionnaireScore === 'number'
        ? Math.max(0, Math.min(10, questionnaireScore / 10))
        : 0;
const clampScoreValue = (score: number) => Math.max(0, Math.min(100, score));

const getEffectiveScoreValue = (
    candidateId: string,
    scoreDetails: MatchScoreBreakdown,
    questionnaireScore?: number | null,
    scoreOverrides?: JobProfile['score_overrides'],
    jobRequiresQuiz = true
) => {
    const overrideScore = scoreOverrides?.[candidateId]?.score;
    if (typeof overrideScore === 'number') {
        return clampScoreValue(overrideScore);
    }

    if (!jobRequiresQuiz) {
        return clampScoreValue(scoreDetails.finalScore * 100);
    }

    return clampScoreValue((scoreDetails.finalScore * 100) + getQuestionnaireBonusPoints(questionnaireScore));
};

const getEffectiveScorePercent = (
    candidateId: string,
    scoreDetails: MatchScoreBreakdown,
    questionnaireScore?: number | null,
    scoreOverrides?: JobProfile['score_overrides'],
    jobRequiresQuiz = true
) => {
    return clampScorePercent(getEffectiveScoreValue(candidateId, scoreDetails, questionnaireScore, scoreOverrides, jobRequiresQuiz));
};

const getRowEffectiveScorePercent = (
    row: RankedCandidateRow,
    job: JobProfile,
    scoreOverrides?: JobProfile['score_overrides'],
    jobRequiresQuiz = true
) => getEffectiveScorePercent(
    row.candidate.id,
    row.scoreDetails,
    getCandidateQuestionnaireScore(row.candidate, job),
    scoreOverrides,
    jobRequiresQuiz
);

const getRowEffectiveScoreValue = (
    row: RankedCandidateRow,
    job: JobProfile,
    scoreOverrides?: JobProfile['score_overrides'],
    jobRequiresQuiz = true
) => getEffectiveScoreValue(
    row.candidate.id,
    row.scoreDetails,
    getCandidateQuestionnaireScore(row.candidate, job),
    scoreOverrides,
    jobRequiresQuiz
);

const getStableTieBreaker = (candidateId: string, jobId: string) => {
    const seed = `${jobId}:${candidateId}`;
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash);
};

const getDefaultExperienceFilter = (_experienceRequired?: number | null): ExperienceFilter => 'all';

const compareRankedRows = (
    left: RankedCandidateRow,
    right: RankedCandidateRow,
    job: JobProfile,
    jobRequiresQuiz: boolean,
    scoreOverrides?: JobProfile['score_overrides']
) => {
    const scoreDelta = getRowEffectiveScoreValue(right, job, scoreOverrides, jobRequiresQuiz) - getRowEffectiveScoreValue(left, job, scoreOverrides, jobRequiresQuiz);
    if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;

    if (jobRequiresQuiz) {
        const leftQuestionnaire = getCandidateQuestionnaireScore(left.candidate, job) ?? -1;
        const rightQuestionnaire = getCandidateQuestionnaireScore(right.candidate, job) ?? -1;
        if (rightQuestionnaire !== leftQuestionnaire) return rightQuestionnaire - leftQuestionnaire;
    }

    const pillarComparisons = [
        right.scoreDetails.semanticScore - left.scoreDetails.semanticScore,
        right.scoreDetails.hardSkillsScore - left.scoreDetails.hardSkillsScore,
        right.scoreDetails.educationScore - left.scoreDetails.educationScore,
        right.scoreDetails.industryScore - left.scoreDetails.industryScore,
        right.scoreDetails.careerPrestigeScore - left.scoreDetails.careerPrestigeScore,
    ];

    for (const delta of pillarComparisons) {
        if (Math.abs(delta) > 0.0001) return delta;
    }

    return getStableTieBreaker(left.candidate.id, job.id) - getStableTieBreaker(right.candidate.id, job.id);
};

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

const PrestigeTierEditor: React.FC<{
    items: string[];
    onAdd: (value: string) => void;
    onRemove: (value: string) => void;
    onResetTier: () => void;
    isModified: boolean;
    tierLabel: string;
    tierBadge: string;
    tierDescription: string;
    addPlaceholder: string;
    text: (en: string, it: string) => string;
}> = ({ items, onAdd, onRemove, onResetTier, isModified, tierLabel, tierBadge, tierDescription, addPlaceholder, text }) => {
    const [draft, setDraft] = useState('');
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter((item) => item.toLowerCase().includes(q));
    }, [items, search]);

    const handleAdd = () => {
        const value = draft.trim();
        if (!value) return;
        const lower = value.toLowerCase();
        if (items.some((item) => item.toLowerCase() === lower)) {
            setDraft('');
            return;
        }
        onAdd(value);
        setDraft('');
    };

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 items-center justify-center rounded-full bg-slate-900 px-2.5 text-[10px] font-bold uppercase tracking-wider text-white dark:bg-orange-500">
                        {tierBadge}
                    </span>
                    <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{tierLabel}</h4>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{tierDescription}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {items.length}
                    </span>
                    {isModified && (
                        <button
                            type="button"
                            onClick={onResetTier}
                            className="text-[11px] font-semibold text-slate-500 underline-offset-2 hover:text-orange-600 hover:underline dark:text-slate-400 dark:hover:text-orange-300"
                        >
                            {text('Reset', 'Ripristina')}
                        </button>
                    )}
                </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={text('Search…', 'Cerca…')}
                    className="h-9 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAdd();
                            }
                        }}
                        placeholder={addPlaceholder}
                        className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                    <button
                        type="button"
                        onClick={handleAdd}
                        disabled={!draft.trim()}
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-slate-900 px-3 text-xs font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-orange-500 dark:hover:bg-orange-600"
                    >
                        {text('Add', 'Aggiungi')}
                    </button>
                </div>
            </div>

            <div className="mt-3 max-h-44 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-950/40">
                {filtered.length === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-slate-400">
                        {search ? text('No matches.', 'Nessun risultato.') : text('Empty list.', 'Lista vuota.')}
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-1.5">
                        {filtered.map((item) => (
                            <span
                                key={item}
                                className="group inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            >
                                {item}
                                <button
                                    type="button"
                                    onClick={() => onRemove(item)}
                                    aria-label={text('Remove', 'Rimuovi')}
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const PrestigeListSection: React.FC<{
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    state: PrestigeListState;
    defaults: Record<PrestigeTierKey, string[]>;
    onToggle: (enabled: boolean) => void;
    onChangeList: (tier: PrestigeTierKey, list: string[]) => void;
    onResetTier: (tier: PrestigeTierKey) => void;
    onResetAll: () => void;
    tierLabels: Record<PrestigeTierKey, { label: string; badge: string; description: string }>;
    addPlaceholder: string;
    text: (en: string, it: string) => string;
}> = ({ title, subtitle, icon, state, defaults, onToggle, onChangeList, onResetTier, onResetAll, tierLabels, addPlaceholder, text }) => {
    const isDefaultSignature = PRESTIGE_TIER_KEYS.every((tier) => {
        const current = [...state.lists[tier]].sort().join('|');
        const def = [...defaults[tier]].sort().join('|');
        return current === def;
    });

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
                <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
                        {icon}
                    </span>
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {state.enabled ? text('Custom', 'Personalizzata') : text('Default', 'Predefinita')}
                        </span>
                        <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${state.enabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                            <input
                                type="checkbox"
                                checked={state.enabled}
                                onChange={(e) => onToggle(e.target.checked)}
                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${state.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </span>
                    </label>
                    {state.enabled && !isDefaultSignature && (
                        <button
                            type="button"
                            onClick={onResetAll}
                            className="text-[11px] font-semibold text-slate-500 underline-offset-2 hover:text-orange-600 hover:underline dark:text-slate-400 dark:hover:text-orange-300"
                        >
                            {text('Restore default list', 'Ripristina lista predefinita')}
                        </button>
                    )}
                </div>
            </div>

            {state.enabled && (
                <div className="space-y-3 p-4">
                    {PRESTIGE_TIER_KEYS.map((tier) => {
                        const labelInfo = tierLabels[tier];
                        const current = [...state.lists[tier]].sort().join('|');
                        const def = [...defaults[tier]].sort().join('|');
                        return (
                            <PrestigeTierEditor
                                key={tier}
                                items={state.lists[tier]}
                                onAdd={(value) => onChangeList(tier, [...state.lists[tier], value])}
                                onRemove={(value) => onChangeList(tier, state.lists[tier].filter((entry) => entry !== value))}
                                onResetTier={() => onResetTier(tier)}
                                isModified={current !== def}
                                tierLabel={labelInfo.label}
                                tierBadge={labelInfo.badge}
                                tierDescription={labelInfo.description}
                                addPlaceholder={addPlaceholder}
                                text={text}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const RankingWeightsModal: React.FC<{
    draft: Record<RankingWeightKey, number>;
    universitiesState: PrestigeListState;
    companiesState: PrestigeListState;
    isSaving: boolean;
    onChangeWeight: (key: RankingWeightKey, value: number) => void;
    onApplyPreset: (preset: Record<RankingWeightKey, number>) => void;
    onResetWeights: () => void;
    onResetAll: () => void;
    onUniversitiesChange: React.Dispatch<React.SetStateAction<PrestigeListState>>;
    onCompaniesChange: React.Dispatch<React.SetStateAction<PrestigeListState>>;
    onClose: () => void;
    onSaveForJob: () => void;
    onSaveAsPreferences: () => void;
    canSaveAsPreferences: boolean;
    text: (en: string, it: string) => string;
}> = ({ draft, universitiesState, companiesState, isSaving, onChangeWeight, onApplyPreset, onResetWeights, onResetAll, onUniversitiesChange, onCompaniesChange, onClose, onSaveForJob, onSaveAsPreferences, canSaveAsPreferences, text }) => {
    const [activeTab, setActiveTab] = useState<'weights' | 'lists'>('weights');
    const total = getWeightDraftTotal(draft);
    const canSave = Math.abs(total - 100) < 0.001 && RANKING_WEIGHT_KEYS.every((key) => Number.isFinite(draft[key]));

    const totalTone = canSave
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300'
        : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300';

    const items: Array<{ key: RankingWeightKey; label: string; description: string }> = [
        {
            key: 'semantic',
            label: text('AI semantic alignment', 'Affinità semantica AI'),
            description: text('How close the candidate career, trajectory and role context are to this job.', 'Quanto carriera, traiettoria e contesto professionale del candidato sono vicini a questo ruolo.'),
        },
        {
            key: 'hard',
            label: text('Hard skills', 'Competenze tecniche'),
            description: text('Coverage and level of the required technical skills.', 'Copertura e livello delle competenze tecniche richieste.'),
        },
        {
            key: 'industry',
            label: text('Industry alignment', 'Settore'),
            description: text('Proven proximity to the function, industry, or domain.', 'Vicinanza dimostrata alla funzione, al settore o al dominio.'),
        },
        {
            key: 'education',
            label: text('Education', 'Formazione'),
            description: text('Degree level, relevance, marks, and school prestige.', 'Livello di studio, rilevanza, voti e prestigio dell\'istituto.'),
        },
        {
            key: 'careerPrestige',
            label: text('Career prestige', 'Prestigio carriera'),
            description: text('Reputation signal from previous employers.', 'Segnale di reputazione dei datori di lavoro precedenti.'),
        },
    ];

    const presets: Array<{ key: string; label: string; weights: Record<RankingWeightKey, number> }> = [
        {
            key: 'default',
            label: text('Default', 'Predefinito'),
            weights: { semantic: 50, hard: 30, industry: 5, education: 10, careerPrestige: 5 },
        },
        {
            key: 'skills',
            label: text('Skill-focused', 'Skill-first'),
            weights: { semantic: 30, hard: 50, industry: 10, education: 5, careerPrestige: 5 },
        },
        {
            key: 'reputation',
            label: text('Reputation-focused', 'Reputazione'),
            weights: { semantic: 30, hard: 20, industry: 10, education: 20, careerPrestige: 20 },
        },
        {
            key: 'balanced',
            label: text('Balanced', 'Bilanciato'),
            weights: { semantic: 30, hard: 30, industry: 15, education: 15, careerPrestige: 10 },
        },
    ];

    const universityTierLabels: Record<PrestigeTierKey, { label: string; badge: string; description: string }> = {
        tier1: {
            label: text('Top universities', 'Università top'),
            badge: text('Top', 'Top'),
            description: text('Top global institutions — scored 1.00.', 'Istituzioni top globali — score 1.00.'),
        },
        tier2: {
            label: text('Excellent universities', 'Università eccellenti'),
            badge: text('Excellent', 'Eccellenti'),
            description: text('Major international universities — scored 0.75.', 'Università internazionali di alto livello — score 0.75.'),
        },
        tier3: {
            label: text('Strong universities', 'Università valide'),
            badge: text('Strong', 'Valide'),
            description: text('Reputable broader pool — scored 0.50.', 'Bacino più ampio di buona reputazione — score 0.50.'),
        },
    };

    const companyTierLabels: Record<PrestigeTierKey, { label: string; badge: string; description: string }> = {
        tier1: {
            label: text('Global leaders', 'Leader globali'),
            badge: text('Top', 'Top'),
            description: text('Most prestigious employers — scored 1.00.', 'Aziende di massimo prestigio — score 1.00.'),
        },
        tier2: {
            label: text('Major employers', 'Aziende affermate'),
            badge: text('Major', 'Affermate'),
            description: text('Well-known major companies — scored 0.75.', 'Aziende affermate e ben note — score 0.75.'),
        },
        tier3: {
            label: text('Regional / niche leaders', 'Realtà di settore'),
            badge: text('Regional', 'Settore'),
            description: text('Strong regional and niche leaders — scored 0.55.', 'Realtà forti a livello regionale o di nicchia — score 0.55.'),
        },
    };

    const setListsForTier = (
        setter: React.Dispatch<React.SetStateAction<PrestigeListState>>,
        tier: PrestigeTierKey,
        list: string[],
    ) => {
        const dedup = Array.from(new Map(list.map((item) => [item.toLowerCase(), item])).values());
        setter((prev) => ({ ...prev, lists: { ...prev.lists, [tier]: dedup } }));
    };

    const resetTier = (
        setter: React.Dispatch<React.SetStateAction<PrestigeListState>>,
        tier: PrestigeTierKey,
        defaults: Record<PrestigeTierKey, string[]>,
    ) => {
        setter((prev) => ({ ...prev, lists: { ...prev.lists, [tier]: [...defaults[tier]] } }));
    };

    const resetAllLists = (
        setter: React.Dispatch<React.SetStateAction<PrestigeListState>>,
        defaults: Record<PrestigeTierKey, string[]>,
    ) => {
        setter((prev) => ({
            ...prev,
            lists: {
                tier1: [...defaults.tier1],
                tier2: [...defaults.tier2],
                tier3: [...defaults.tier3],
            },
        }));
    };

    const toggleEnabled = (
        setter: React.Dispatch<React.SetStateAction<PrestigeListState>>,
        defaults: Record<PrestigeTierKey, string[]>,
        enabled: boolean,
    ) => {
        setter((prev) => ({
            enabled,
            lists: enabled
                ? prev.lists
                : { tier1: [...defaults.tier1], tier2: [...defaults.tier2], tier3: [...defaults.tier3] },
        }));
    };

    const totalForBar = Math.max(total, 1);

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
            <div className="flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                            {text('Calibrate ranking', 'Calibra il ranking')}
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                            {text('Tune weights and prestige, then save them for this job or as your recruiter preferences.', 'Modifica pesi e prestigio, poi salvali per questo lavoro o come tue preferite.')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={text('Close', 'Chiudi')}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="border-b border-slate-200 px-6 dark:border-slate-800">
                    <div className="flex gap-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab('weights')}
                            className={`-mb-px border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                                activeTab === 'weights'
                                    ? 'border-orange-500 text-slate-900 dark:text-slate-100'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                        >
                            {text('Pillar weights', 'Pesi pilastri')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('lists')}
                            className={`-mb-px border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                                activeTab === 'lists'
                                    ? 'border-orange-500 text-slate-900 dark:text-slate-100'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                        >
                            {text('Custom lists', 'Liste personalizzate')}
                            {(universitiesState.enabled || companiesState.enabled) && (
                                <span className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                                    {(universitiesState.enabled ? 1 : 0) + (companiesState.enabled ? 1 : 0)}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {activeTab === 'weights' && (
                        <div className="space-y-5">
                            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {text('Weight distribution', 'Distribuzione pesi')}
                                    </p>
                                    <div className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${totalTone}`}>
                                        {total}%
                                    </div>
                                </div>
                                <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                    {RANKING_WEIGHT_KEYS.map((key) => {
                                        const value = Number.isFinite(draft[key]) ? draft[key] : 0;
                                        if (value <= 0) return null;
                                        return (
                                            <div
                                                key={key}
                                                className={`${PILLAR_COLORS[key].bar} h-full transition-all`}
                                                style={{ width: `${(value / totalForBar) * 100}%` }}
                                                title={`${value}%`}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                                    {items.map((item) => (
                                        <div key={item.key} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                            <span className={`inline-block h-2 w-2 rounded-full ${PILLAR_COLORS[item.key].dot}`} />
                                            <span>{item.label}</span>
                                            <span className="font-bold text-slate-900 dark:text-slate-100">{draft[item.key]}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    {text('Quick presets', 'Preset rapidi')}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {presets.map((preset) => (
                                        <button
                                            key={preset.key}
                                            type="button"
                                            onClick={() => onApplyPreset(preset.weights)}
                                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-orange-500/50 dark:hover:bg-orange-950/20 dark:hover:text-orange-300"
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2.5">
                                {items.map((item) => {
                                    const value = Number.isFinite(draft[item.key]) ? draft[item.key] : 0;
                                    return (
                                        <div key={item.key} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex items-start gap-3">
                                                    <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${PILLAR_COLORS[item.key].dot}`} />
                                                    <div>
                                                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                                            {item.label}
                                                        </h3>
                                                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                                            {item.description}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step={1}
                                                        value={value}
                                                        onChange={(event) => {
                                                            const next = parseInt(event.target.value, 10);
                                                            onChangeWeight(item.key, Number.isFinite(next) ? Math.max(0, Math.min(100, next)) : 0);
                                                        }}
                                                        className={`h-9 w-16 rounded-xl border border-slate-200 bg-white px-2 text-right text-sm font-bold outline-none transition-colors focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-950 ${PILLAR_COLORS[item.key].accent}`}
                                                    />
                                                    <span className="text-xs font-semibold text-slate-400">%</span>
                                                </div>
                                            </div>
                                            <input
                                                type="range"
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={value}
                                                onChange={(event) => onChangeWeight(item.key, parseInt(event.target.value, 10))}
                                                className="ranking-weight-slider mt-3 w-full cursor-pointer"
                                                style={{
                                                    background: `linear-gradient(to right, #f97316 0%, #f97316 ${value}%, #cbd5e1 ${value}%, #cbd5e1 100%)`,
                                                }}
                                                aria-label={item.label}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === 'lists' && (
                        <div className="space-y-4">
                            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                {text(
                                    'Education and career prestige scores use a list of recognized universities and companies, grouped by tier. By default the platform list applies. You can override it for this job — changes apply only here.',
                                    'I punteggi di formazione e prestigio carriera usano una lista di università e aziende riconosciute, divise in tier. Di default vale la lista predefinita della piattaforma. Puoi personalizzarla per questo job.',
                                )}
                            </p>

                            <PrestigeListSection
                                title={text('Universities (Education pillar)', 'Università (pilastro Formazione)')}
                                subtitle={text('Lists used to estimate university prestige in the education score.', 'Liste usate per stimare il prestigio delle università nello score di formazione.')}
                                icon={(
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.667 6.835A11.946 11.946 0 0112 22a11.946 11.946 0 01-6.827-4.587 12.083 12.083 0 01.667-6.835L12 14z" />
                                    </svg>
                                )}
                                state={universitiesState}
                                defaults={UNIVERSITY_DEFAULTS}
                                onToggle={(enabled) => toggleEnabled(onUniversitiesChange, UNIVERSITY_DEFAULTS, enabled)}
                                onChangeList={(tier, list) => setListsForTier(onUniversitiesChange, tier, list)}
                                onResetTier={(tier) => resetTier(onUniversitiesChange, tier, UNIVERSITY_DEFAULTS)}
                                onResetAll={() => resetAllLists(onUniversitiesChange, UNIVERSITY_DEFAULTS)}
                                tierLabels={universityTierLabels}
                                addPlaceholder={text('e.g. Università di Trento', 'es. Università di Trento')}
                                text={text}
                            />

                            <PrestigeListSection
                                title={text('Companies (Career prestige pillar)', 'Aziende (pilastro Prestigio carriera)')}
                                subtitle={text('Lists used to estimate employer prestige in the career score.', 'Liste usate per stimare il prestigio dei datori di lavoro nello score di carriera.')}
                                icon={(
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                )}
                                state={companiesState}
                                defaults={COMPANY_DEFAULTS}
                                onToggle={(enabled) => toggleEnabled(onCompaniesChange, COMPANY_DEFAULTS, enabled)}
                                onChangeList={(tier, list) => setListsForTier(onCompaniesChange, tier, list)}
                                onResetTier={(tier) => resetTier(onCompaniesChange, tier, COMPANY_DEFAULTS)}
                                onResetAll={() => resetAllLists(onCompaniesChange, COMPANY_DEFAULTS)}
                                tierLabels={companyTierLabels}
                                addPlaceholder={text('e.g. Acme S.p.A.', 'es. Acme S.p.A.')}
                                text={text}
                            />
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className={`inline-flex items-center rounded-2xl border px-3 py-1.5 text-xs font-bold ${totalTone}`}>
                            {text('Total', 'Totale')}: {total}%
                        </div>
                        <button
                            type="button"
                            onClick={activeTab === 'weights' ? onResetWeights : onResetAll}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            {activeTab === 'weights' ? text('Reset weights', 'Reset pesi') : text('Reset all', 'Reset tutto')}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={onSaveForJob}
                            disabled={!canSave || isSaving}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            {isSaving ? text('Saving…', 'Salvataggio…') : text('Save for this job', 'Salva per questo lavoro')}
                        </button>
                        <button
                            type="button"
                            onClick={onSaveAsPreferences}
                            disabled={!canSave || isSaving || !canSaveAsPreferences}
                            className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-500 dark:hover:bg-orange-600"
                        >
                            {isSaving ? text('Saving…', 'Salvataggio…') : text('Save as my preferences', 'Salva come mie preferite')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const RecruiterMatchesView: React.FC<RecruiterMatchesViewProps> = ({ job, onBack }) => {
    const { text, language } = useLanguage();
    const { actualUserRole, effectiveDisplayName, effectiveEmail } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [rankedApplicants, setRankedApplicants] = useState<RankedCandidateRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCandidate, setSelectedCandidate] = useState<CandidateProfile | null>(null);
    const [currentJob, setCurrentJob] = useState<JobProfile>(job);
    const currentJobRef = useRef<JobProfile>(job);
    currentJobRef.current = currentJob;
    const [localStages, setLocalStages] = useState<Record<string, ApplicationStage>>({});
    const { move: moveStage, busyIds: stageBusyIds } = useStageActions(currentJobRef, {
        language,
        onJobUpdated: setCurrentJob,
        onStageOptimistic: (candidateId, stage) => setLocalStages(prev => ({ ...prev, [candidateId]: stage })),
        onStageRollback: (candidateId, prevStage) => setLocalStages(prev => ({ ...prev, [candidateId]: prevStage })),
    });
    const resolveStage = (candidateId: string, dbStatus: string | undefined): ApplicationStage =>
        localStages[candidateId] ?? deriveStageFromContext(currentJobRef.current, candidateId, dbStatus);
    const handleMoveCandidateToStage = (candidateId: string, dbStatus: string | undefined, toStage: ApplicationStage) => {
        const fromStage = resolveStage(candidateId, dbStatus);
        return moveStage({ candidateId, fromStage, toStage });
    };
    const [rankingScope, setRankingScope] = useState<RankingScope>('applicants');
    const [loadNote, setLoadNote] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFilterOpen, setIsSearchFilterOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [stepFilter, setStepFilter] = useState<QuestionnaireFilter>('all');
    const [degreeFilter, setDegreeFilter] = useState<DegreeFilter>('job_min');
    const [experienceFilter, setExperienceFilter] = useState<ExperienceFilter>(getDefaultExperienceFilter(job.experience_required));
    const [requestingCandidateId, setRequestingCandidateId] = useState<string | null>(null);
    const [reviewingQuestionnaire, setReviewingQuestionnaire] = useState<{ candidate: CandidateProfile; result: TestResult } | null>(null);
    const [reviewingRefinementChat, setReviewingRefinementChat] = useState<{ candidate: CandidateProfile; chat: CandidateRefinementChat } | null>(null);
    const [loadingRefinementChatCandidateId, setLoadingRefinementChatCandidateId] = useState<string | null>(null);
    const [downloadingCvCandidateId, setDownloadingCvCandidateId] = useState<string | null>(null);
    const [requestingAiRefinementCandidateId, setRequestingAiRefinementCandidateId] = useState<string | null>(null);
    const [overrideModal, setOverrideModal] = useState<{ candidateId: string; name: string; currentScore: number } | null>(null);
    const [overrideInput, setOverrideInput] = useState<{ score: string; reason: string }>({ score: '', reason: '' });
    const [isSavingOverride, setIsSavingOverride] = useState(false);
    const rankingScrollPositionRef = useRef(0);
    const [listAnimationTick, setListAnimationTick] = useState(0);
    // Progressive disclosure: render only the first N candidates initially, then let
    // the recruiter expand on demand. Cards still load animations smoothly, but
    // browser paint/layout cost on 100+ applicants stays bounded.
    const APPLICANTS_PAGE_SIZE = 25;
    const [visibleApplicantsCount, setVisibleApplicantsCount] = useState(APPLICANTS_PAGE_SIZE);
    const [recruiterAllCandidatesEnabled, setRecruiterAllCandidatesEnabled] = useState(false);
    const [candidateProfileVisibilitySettingEnabled, setCandidateProfileVisibilitySettingEnabled] = useState(false);
    const [excludeConfirmCandidate, setExcludeConfirmCandidate] = useState<CandidateProfile | null>(null);
    const [savingInterestCandidateId, setSavingInterestCandidateId] = useState<string | null>(null);
    const [selectedInterestedCandidateIds, setSelectedInterestedCandidateIds] = useState<string[]>([]);
    // Compare-candidates mode: a recruiter can pick 2–3 candidates from the
    // ranking and open a side-by-side pillar-by-pillar view. The selection
    // lives only in component state — we don't sync it to the URL because
    // it's a transient inspection action, not a navigation target.
    const MAX_COMPARE_CANDIDATES = 3;
    const [compareMode, setCompareMode] = useState(false);
    const [compareCandidateIds, setCompareCandidateIds] = useState<string[]>([]);
    const [isComparisonOpen, setIsComparisonOpen] = useState(false);
    const [downloadingInterestedFormat, setDownloadingInterestedFormat] = useState<InviteEmailTemplateFormat | null>(null);
    const [isInterestedExportMenuOpen, setIsInterestedExportMenuOpen] = useState(false);
    const [isRankingWeightsModalOpen, setIsRankingWeightsModalOpen] = useState(false);
    const [rankingWeightDraft, setRankingWeightDraft] = useState<Record<RankingWeightKey, number>>(() => buildWeightDraft(job.ranking_weights));
    const [rankingUniversitiesDraft, setRankingUniversitiesDraft] = useState<PrestigeListState>(() => buildPrestigeListState(job.ranking_universities ?? null, UNIVERSITY_DEFAULTS));
    const [rankingCompaniesDraft, setRankingCompaniesDraft] = useState<PrestigeListState>(() => buildPrestigeListState(job.ranking_companies ?? null, COMPANY_DEFAULTS));
    const [isSavingRankingWeights, setIsSavingRankingWeights] = useState(false);
    const jobQuizEnabled = isJobQuizEnabled(currentJob);
    const canShowAllCandidatesScope = actualUserRole === 'admin' || recruiterAllCandidatesEnabled;
    const respectCandidatePrivacy = candidateProfileVisibilitySettingEnabled;
    const hiringProcessView: HiringProcessView = searchParams.get('view') === 'interested_process'
        ? 'interested_process'
        : searchParams.get('view') === 'excluded_process'
            ? 'excluded_process'
            : 'ranking';
    const currentRankingWeightsKey = useMemo(() => {
        const weights = normalizeMatchingPillarWeights(currentJob.ranking_weights);
        const weightsKey = RANKING_WEIGHT_KEYS.map((key) => weights[key].toFixed(4)).join('|');
        const uniKey = prestigeStateSignature(buildPrestigeListState(currentJob.ranking_universities ?? null, UNIVERSITY_DEFAULTS));
        const companyKey = prestigeStateSignature(buildPrestigeListState(currentJob.ranking_companies ?? null, COMPANY_DEFAULTS));
        return `${weightsKey}::${uniKey}::${companyKey}`;
    }, [currentJob.ranking_weights, currentJob.ranking_universities, currentJob.ranking_companies]);

    useEffect(() => {
        let isCancelled = false;

        const hydrateRankingPreferences = async () => {
            let configuredJob = job;

            if (job.recruiter_id) {
                try {
                    const recruiter = await getRecruiter(job.recruiter_id);
                    configuredJob = applyRecruiterRankingConfigToJob(job, recruiter ?? null);
                } catch (error) {
                    console.warn('Failed to load recruiter ranking preferences. Falling back to job ranking config:', error);
                }
            }

            if (isCancelled) return;

            setCurrentJob(configuredJob);
            setRankingWeightDraft(buildWeightDraft(configuredJob.ranking_weights));
            setRankingUniversitiesDraft(buildPrestigeListState(configuredJob.ranking_universities ?? null, UNIVERSITY_DEFAULTS));
            setRankingCompaniesDraft(buildPrestigeListState(configuredJob.ranking_companies ?? null, COMPANY_DEFAULTS));
        };

        void hydrateRankingPreferences();

        return () => {
            isCancelled = true;
        };
    }, [job]);

    useEffect(() => {
        setDegreeFilter('job_min');
        setExperienceFilter(getDefaultExperienceFilter(job.experience_required));
    }, [job.id, job.constraints?.min_education_level, job.experience_required]);

    useEffect(() => {
        let cancelled = false;

        const loadSetting = async () => {
            try {
                const enabled = await getRecruiterAllCandidatesEnabled({ force: true });
                if (!cancelled) {
                    setRecruiterAllCandidatesEnabled(enabled);
                }
            } catch (error) {
                console.error('Failed to load recruiter all-candidates visibility setting:', error);
                if (!cancelled) {
                    setRecruiterAllCandidatesEnabled(false);
                }
            }
        };

        const handleSettingChanged = (event: Event) => {
            const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
            if (!cancelled && typeof enabled === 'boolean') {
                setRecruiterAllCandidatesEnabled(enabled);
            }
        };

        void loadSetting();
        window.addEventListener(PLATFORM_RECRUITER_ALL_CANDIDATES_CHANGED_EVENT, handleSettingChanged as EventListener);

        return () => {
            cancelled = true;
            window.removeEventListener(PLATFORM_RECRUITER_ALL_CANDIDATES_CHANGED_EVENT, handleSettingChanged as EventListener);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadSetting = async () => {
            try {
                const enabled = await getCandidateProfileVisibilitySettingEnabled({ force: true });
                if (!cancelled) {
                    setCandidateProfileVisibilitySettingEnabled(enabled);
                }
            } catch (error) {
                console.error('Failed to load candidate profile visibility setting:', error);
                if (!cancelled) {
                    setCandidateProfileVisibilitySettingEnabled(false);
                }
            }
        };

        const handleSettingChanged = (event: Event) => {
            const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
            if (!cancelled && typeof enabled === 'boolean') {
                setCandidateProfileVisibilitySettingEnabled(enabled);
            }
        };

        void loadSetting();
        window.addEventListener(PLATFORM_CANDIDATE_PROFILE_VISIBILITY_SETTING_CHANGED_EVENT, handleSettingChanged as EventListener);

        return () => {
            cancelled = true;
            window.removeEventListener(PLATFORM_CANDIDATE_PROFILE_VISIBILITY_SETTING_CHANGED_EVENT, handleSettingChanged as EventListener);
        };
    }, []);

    useEffect(() => {
        if (!canShowAllCandidatesScope && rankingScope === 'all_seekers') {
            setRankingScope('applicants');
        }
    }, [canShowAllCandidatesScope, rankingScope]);

    useEffect(() => {
        if (!jobQuizEnabled && stepFilter !== 'all') {
            setStepFilter('all');
        }
    }, [jobQuizEnabled, stepFilter]);

    useEffect(() => {
        let isCancelled = false;

        const fetchData = async () => {
            setIsLoading(true);
            setLoadNote('');
            const retryingNote = text('Refreshing candidate data in background…', 'Aggiornamento candidati in background…');

            try {
                await withRetry(async () => {
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
                        .filter(({ candidate }) => isCandidateVisibleToRecruiters(candidate, respectCandidatePrivacy))
                        .map(({ candidate, status }) => ({
                            candidate,
                            status: status || 'pending',
                            hasApplied: true,
                            scoreDetails: calculateMatchScore(jobToUse, candidate),
                        }));

                    if (rankingScope === 'recruiter_pool' && jobToUse.recruiter_id) {
                        try {
                            const sameRecruiterJobs = await getJobsForRecruiter(jobToUse.recruiter_id);
                            const recruiterPoolMap = new Map<string, Omit<RankedCandidateRow, 'hasRefinementChat'>>();

                            for (const recruiterJob of sameRecruiterJobs) {
                                const recruiterJobApplicants = await getApplicantsForJob(recruiterJob.id, recruiterJob.applicant_emails || []);

                                for (const { candidate } of recruiterJobApplicants) {
                                    if (!isCandidateVisibleToRecruiters(candidate, respectCandidatePrivacy)) continue;

                                    const email = candidate.contacts?.email?.toLowerCase().trim() || '';
                                    const key = candidate.id || email;
                                    if (!key || recruiterPoolMap.has(key)) continue;

                                    const status = applicantStatusByEmail.get(email) || 'not_applied';
                                    recruiterPoolMap.set(key, {
                                        candidate,
                                        status,
                                        hasApplied: status !== 'not_applied',
                                        scoreDetails: calculateMatchScore(jobToUse, candidate),
                                    });
                                }
                            }

                            candidatePool = Array.from(recruiterPoolMap.values());
                        } catch (error) {
                            console.error('Failed to load recruiter candidate pool:', error);
                            setLoadNote(text('The recruiter candidate pool is currently unavailable, so the list is showing only candidates who already showed interest in this role.', 'Il bacino candidati del recruiter non è disponibile al momento, quindi la lista mostra solo i candidati che hanno già mostrato interesse per questo ruolo.'));
                        }
                    }

                    if (rankingScope === 'all_seekers' && canShowAllCandidatesScope) {
                        try {
                            const allCandidates = await getAllCandidates();
                            const seen = new Set<string>();
                            candidatePool = allCandidates.flatMap((candidate) => {
                                if (!isCandidateVisibleToRecruiters(candidate, respectCandidatePrivacy)) return [];
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

                    if (hiringProcessView === 'interested_process' || hiringProcessView === 'excluded_process') {
                        try {
                            const allCandidates = await getAllCandidates();
                            const candidateIdsForCurrentView = new Set(
                                Object.entries(jobToUse.candidate_interest_reviews ?? {})
                                    .filter(([, review]) => review?.decision === (hiringProcessView === 'interested_process' ? 'interested' : 'not_interested'))
                                    .map(([candidateId]) => candidateId)
                            );

                            const seen = new Set<string>();
                            candidatePool = allCandidates.flatMap((candidate) => {
                                if (!isCandidateVisibleToRecruiters(candidate, respectCandidatePrivacy)) return [];
                                if (!candidateIdsForCurrentView.has(candidate.id)) return [];

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
                            console.error('Failed to load candidates for recruiter decision view:', error);
                            setLoadNote(
                                hiringProcessView === 'interested_process'
                                    ? text('The shortlist is currently unavailable. Please retry in a moment.', 'La shortlist non è disponibile al momento. Riprova tra poco.')
                                    : text('The excluded candidates list is currently unavailable. Please retry in a moment.', 'La lista degli esclusi non è disponibile al momento. Riprova tra poco.')
                            );
                        }
                    }

                    const baseRankedPool = candidatePool
                        .map((row) => ({
                            ...row,
                            hasRefinementChat: Boolean(row.candidate.ai_refined),
                        }))
                        .sort((a, b) => compareRankedRows(a, b, jobToUse, isJobQuizEnabled(jobToUse), jobToUse.score_overrides));

                    if (!isCancelled) {
                        setLoadNote((current) => current === retryingNote ? '' : current);
                        setRankedApplicants(baseRankedPool);
                        setIsLoading(false);
                    }
                }, {
                    attempts: 3,
                    delaysMs: [0, 900, 2200],
                    onRetry: (error, attempt) => {
                        console.warn(`Retrying recruiter ranking load for job ${currentJob.id} after failed attempt ${attempt}:`, error);
                        if (!isCancelled) {
                            setLoadNote(retryingNote);
                        }
                    },
                });
            } catch (error) {
                console.error('Failed to load applicants:', error);
                if (!isCancelled) {
                    setLoadNote(text('Some candidate data is still unavailable. We will keep trying automatically in the background.', 'Alcuni dati candidati non sono ancora disponibili. Continueremo a riprovare automaticamente in background.'));
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
    }, [currentJob.id, currentJob.industry, currentJob.title, currentRankingWeightsKey, rankingScope, text, canShowAllCandidatesScope, hiringProcessView, respectCandidatePrivacy]);

    useEffect(() => {
        const selectedCandidateId = searchParams.get('candidateId');
        if (!selectedCandidateId) {
            if (selectedCandidate) {
                setSelectedCandidate(null);
            }
            return;
        }

        const matchedCandidate = rankedApplicants.find((row) => row.candidate.id === selectedCandidateId)?.candidate || null;
        if (matchedCandidate && matchedCandidate.id !== selectedCandidate?.id) {
            setSelectedCandidate(matchedCandidate);
        }
    }, [rankedApplicants, searchParams, selectedCandidate]);

    const questionnaireStageOptions = useMemo(() => [
        { value: 'all', label: text('All candidates', 'Tutti i candidati') },
        { value: 'questionnaire_completed', label: text('Questionnaire completed', 'Questionario completato') },
    ], [text]);

    const rankingScopeOptions = useMemo(() => {
        const options: { value: RankingScope; label: string }[] = [
            { value: 'applicants', label: text('Interest shown', 'Interesse mostrato') },
            { value: 'recruiter_pool', label: text('My candidate archive', 'Archivio dei miei candidati') },
        ];

        if (canShowAllCandidatesScope) {
            options.push({ value: 'all_seekers', label: text('All candidates', 'Tutti i candidati') });
        }

        return options;
    }, [text, canShowAllCandidatesScope]);

    const sortedApplicants = useMemo(() => {
        return [...rankedApplicants].sort((a, b) => compareRankedRows(a, b, currentJob, jobQuizEnabled, currentJob.score_overrides));
    }, [rankedApplicants, currentJob, jobQuizEnabled]);

    // Keep the input controlled with `searchQuery` (instant UI feedback) but run the
    // expensive list filter against the deferred value so typing never blocks paint.
    const deferredSearchQuery = useDeferredValue(searchQuery);

    const filteredApplicants = useMemo(() => {
        const query = deferredSearchQuery.toLowerCase().trim();
        const requiredDegree = getDegreeOrdinal(currentJob.constraints?.min_education_level);

        return sortedApplicants.filter((row) => {
            const { candidate, hasApplied, status, scoreDetails } = row;
            const interestDecision = getCandidateInterestDecision(currentJob, candidate.id);
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

            if (hiringProcessView === 'ranking' && interestDecision === 'not_interested') return false;
            if (hiringProcessView === 'interested_process') {
                return interestDecision === 'interested';
            }
            if (hiringProcessView === 'excluded_process') {
                return interestDecision === 'not_interested';
            }
            if (query && !searchTarget.includes(query)) return false;
            if (statusFilter === 'applied' && !hasApplied) return false;
            if (statusFilter === 'not_applied' && hasApplied) return false;
            if (!['all', 'applied', 'not_applied'].includes(statusFilter) && status !== statusFilter) return false;

            const highestDegree = getHighestDegreeOrdinal(candidate);
            if (degreeFilter === 'job_min' && requiredDegree > 0 && highestDegree < requiredDegree) return false;
            if (degreeFilter === 'bachelor_plus' && highestDegree < getEducationLevelOrdinal('BACHELOR')) return false;
            if (degreeFilter === 'master_plus' && highestDegree < getEducationLevelOrdinal('MASTER')) return false;
            if (degreeFilter === 'phd_plus' && highestDegree < getEducationLevelOrdinal('PHD')) return false;

            const years = candidate.total_years_experience ?? 0;
            if (experienceFilter === '2_plus' && years < 2) return false;
            if (experienceFilter === '5_plus' && years < 5) return false;
            if (experienceFilter === '7_plus' && years < 7) return false;
            if (experienceFilter === '10_plus' && years < 10) return false;
            if (experienceFilter === '15_plus' && years < 15) return false;

            if (stepFilter === 'questionnaire_completed' && (!jobQuizEnabled || !getCandidateQuestionnaireResult(candidate, currentJob))) return false;

            return true;
        });
    }, [sortedApplicants, deferredSearchQuery, statusFilter, stepFilter, degreeFilter, experienceFilter, currentJob, jobQuizEnabled, hiringProcessView]);

    const interestedCandidateIds = useMemo(
        () => Object.entries(currentJob.candidate_interest_reviews ?? {})
            .filter(([, review]) => review?.decision === 'interested')
            .map(([candidateId]) => candidateId),
        [currentJob.candidate_interest_reviews]
    );
    const hiredCandidateId = currentJob.hired_candidate_id || null;

    const notInterestedCandidateIds = useMemo(
        () => Object.entries(currentJob.candidate_interest_reviews ?? {})
            .filter(([, review]) => review?.decision === 'not_interested')
            .map(([candidateId]) => candidateId),
        [currentJob.candidate_interest_reviews]
    );

    const selectedInterestedRows = useMemo(
        () => filteredApplicants.filter((row) => selectedInterestedCandidateIds.includes(row.candidate.id)),
        [filteredApplicants, selectedInterestedCandidateIds]
    );

    const rankByCandidateId = useMemo(
        () => new Map(sortedApplicants.map((row, index) => [row.candidate.id, index + 1])),
        [sortedApplicants]
    );

    const activeFilterCount = [
        searchQuery.trim(),
        rankingScope !== 'applicants' ? rankingScope : '',
        statusFilter !== 'all' ? statusFilter : '',
        jobQuizEnabled && stepFilter !== 'all' ? stepFilter : '',
        degreeFilter !== 'job_min' ? degreeFilter : '',
        experienceFilter !== getDefaultExperienceFilter(currentJob.experience_required) ? experienceFilter : '',
    ].filter(Boolean).length;

    const filteredApplicantSignature = useMemo(
        () => filteredApplicants.map((row) => `${row.candidate.id}:${row.status}:${getRowEffectiveScorePercent(row, currentJob, currentJob.score_overrides, jobQuizEnabled)}`).join('|'),
        [filteredApplicants, currentJob, jobQuizEnabled]
    );

    useEffect(() => {
        if (isLoading) return;
        setListAnimationTick((current) => current + 1);
    }, [filteredApplicantSignature, isLoading]);

    // Reset progressive disclosure when the filtered list changes (new filters, scope, etc.).
    useEffect(() => {
        setVisibleApplicantsCount(APPLICANTS_PAGE_SIZE);
    }, [filteredApplicantSignature]);

    const visibleApplicants = useMemo(
        () => filteredApplicants.slice(0, visibleApplicantsCount),
        [filteredApplicants, visibleApplicantsCount]
    );
    const hiddenApplicantsCount = Math.max(0, filteredApplicants.length - visibleApplicants.length);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const resetScroll = () => {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        };

        resetScroll();
        const frame = window.requestAnimationFrame(resetScroll);

        return () => window.cancelAnimationFrame(frame);
    }, [hiringProcessView]);

    useEffect(() => {
        if (hiringProcessView !== 'interested_process') {
            setSelectedInterestedCandidateIds([]);
            return;
        }

        setSelectedInterestedCandidateIds((current) =>
            current.filter((candidateId) => filteredApplicants.some((row) => row.candidate.id === candidateId))
        );
    }, [filteredApplicants, hiringProcessView]);

    const clearFilters = () => {
        setSearchQuery('');
        setIsSearchFilterOpen(false);
        setRankingScope('applicants');
        setStatusFilter('all');
        setStepFilter('all');
        setDegreeFilter('job_min');
        setExperienceFilter(getDefaultExperienceFilter(currentJob.experience_required));
    };

    const openInterestedProcessView = () => {
        updateSearchParam('view', 'interested_process');
    };

    const openExcludedProcessView = () => {
        updateSearchParam('view', 'excluded_process');
    };

    const closeInterestedProcessView = () => {
        updateSearchParam('view', null);
    };

    const handleSaveCandidateInterest = async (candidate: CandidateProfile, decision: CandidateInterestDecision) => {
        if (savingInterestCandidateId) return;

        setSavingInterestCandidateId(candidate.id);
        try {
            const updatedJob = await saveCandidateInterestReview(currentJob, candidate.id, decision);
            setCurrentJob(updatedJob);
            if (decision === 'not_interested') {
                setSelectedInterestedCandidateIds((current) => current.filter((entry) => entry !== candidate.id));
            }
            toast.success(
                decision === 'interested'
                    ? text('Candidate added to the shortlist.', 'Candidato aggiunto alla shortlist.')
                    : text('Candidate excluded from the ranking and added to the excluded list.', 'Candidato escluso dal ranking e aggiunto alla lista degli esclusi.')
            );
        } catch (error: any) {
            console.error('Failed to save candidate interest review:', error);
            toast.error(error?.message || text('Unable to save this decision right now.', 'Impossibile salvare questa decisione in questo momento.'));
        } finally {
            setSavingInterestCandidateId(null);
        }
    };

    const handleResetCandidateInterest = async (candidate: CandidateProfile) => {
        if (savingInterestCandidateId) return;

        setSavingInterestCandidateId(candidate.id);
        try {
            const updatedJob = await removeCandidateInterestReview(currentJob, candidate.id);
            setCurrentJob(updatedJob);
            setSelectedInterestedCandidateIds((current) => current.filter((entry) => entry !== candidate.id));
            toast.success(text('Candidate restored to the neutral state.', 'Candidato riportato allo stato neutrale.'));
        } catch (error: any) {
            console.error('Failed to reset candidate interest review:', error);
            toast.error(error?.message || text('Unable to restore this candidate right now.', 'Impossibile ripristinare questo candidato in questo momento.'));
        } finally {
            setSavingInterestCandidateId(null);
        }
    };

    const handleSetHiredCandidate = async (candidate: CandidateProfile, candidateId: string | null) => {
        if (savingInterestCandidateId) return;

        setSavingInterestCandidateId(candidate.id);
        try {
            const updatedJob = await saveJobHiredCandidate(currentJob, candidateId);
            setCurrentJob(updatedJob);
            toast.success(candidateId
                ? text('Hired candidate saved for this job.', 'Candidato assunto salvato per questo lavoro.')
                : text('Hired candidate cleared for this job.', 'Candidato assunto rimosso per questo lavoro.')
            );
        } catch (error: any) {
            console.error('Failed to save hired candidate:', error);
            toast.error(error?.message || text('Unable to update the hired candidate right now.', 'Impossibile aggiornare il candidato assunto al momento.'));
        } finally {
            setSavingInterestCandidateId(null);
        }
    };

    const toggleInterestedCandidateSelection = (candidateId: string) => {
        setSelectedInterestedCandidateIds((current) =>
            current.includes(candidateId)
                ? current.filter((entry) => entry !== candidateId)
                : [...current, candidateId]
        );
    };

    const toggleSelectAllInterestedCandidates = () => {
        if (selectedInterestedCandidateIds.length === filteredApplicants.length) {
            setSelectedInterestedCandidateIds([]);
            return;
        }

        setSelectedInterestedCandidateIds(filteredApplicants.map((row) => row.candidate.id));
    };

    const handleDownloadInterestedCandidates = async (format: InviteEmailTemplateFormat) => {
        if (selectedInterestedRows.length === 0) {
            toast.info(text('Select at least one shortlisted candidate first.', 'Seleziona prima almeno un candidato in shortlist.'));
            return;
        }

        setDownloadingInterestedFormat(format);
        try {
            await downloadTabularData(
                `peaktalent_${currentJob.title.toLowerCase().replace(/[^a-z0-9]+/gi, '_')}_interested_candidates`,
                [
                    text('Full name', 'Nome e cognome'),
                    text('Email', 'Email'),
                ],
                selectedInterestedRows.map((row) => [
                    getCandidateDisplayName(row.candidate),
                    row.candidate.contacts?.email || '',
                ]),
                format,
            );
        } catch (error: any) {
            console.error('Failed to export interested candidates:', error);
            toast.error(error?.message || text('Unable to export the shortlisted candidates right now.', 'Impossibile esportare i candidati in shortlist in questo momento.'));
        } finally {
            setDownloadingInterestedFormat(null);
        }
    };

    const handleInterestedExportFormatSelect = (format: InviteEmailTemplateFormat) => {
        setIsInterestedExportMenuOpen(false);
        void handleDownloadInterestedCandidates(format);
    };

    const handleGenerateInterestedCandidatesEmail = () => {
        if (selectedInterestedRows.length === 0) {
            toast.info(text('Select at least one shortlisted candidate first.', 'Seleziona prima almeno un candidato in shortlist.'));
            return;
        }

        const mailtoHref = buildRecruiterInterestedCandidatesMailto({
            candidateEmails: selectedInterestedRows
                .map((row) => row.candidate.contacts?.email || '')
                .filter(Boolean),
            jobTitle: currentJob.title,
            companyName: currentJob.company_name,
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
            console.error('Failed to load candidate refinement transcript:', error);
            toast.error(error?.message || text('Unable to load the AI refinement transcript right now.', 'Impossibile caricare la transcript di affinamento AI in questo momento.'));
        } finally {
            setLoadingRefinementChatCandidateId(null);
        }
    };

    const updateSearchParam = (key: string, value?: string | null) => {
        const nextSearchParams = new URLSearchParams(searchParams);
        if (value) {
            nextSearchParams.set(key, value);
        } else {
            nextSearchParams.delete(key);
        }
        setSearchParams(nextSearchParams, { replace: true });
    };

    const handleRequestAssessment = async (candidate: CandidateProfile) => {
        if (requestingCandidateId) return;

        if (getCandidateQuestionnaireResult(candidate, currentJob)) {
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

            const shouldShowEmailFailure = Boolean(emailDeliveryError && emailDeliveryError !== EMAIL_SENDING_PAUSED_MESSAGE);

            toast.success(
                assessmentStatus === 'already_completed'
                    ? text('This candidate had already completed the requested questionnaire.', 'Questo candidato aveva già completato il questionario richiesto.')
                    : candidate.ai_refined
                        ? text('Questionnaire request sent. The candidate can now complete the role-specific questionnaire.', 'Richiesta inviata. Il candidato può ora completare il questionario specifico sul ruolo.')
                        : text('Questionnaire request sent. The candidate will first complete the AI profile refinement, then the role-specific questionnaire.', 'Richiesta inviata. Il candidato completerà prima il perfezionamento AI del profilo e poi il questionario specifico sul ruolo.')
            );

            if (shouldShowEmailFailure) {
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
            if (emailDeliveryError && emailDeliveryError !== EMAIL_SENDING_PAUSED_MESSAGE) {
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

    const openRankingWeightsModal = () => {
        setRankingWeightDraft(buildWeightDraft(currentJob.ranking_weights));
        setRankingUniversitiesDraft(buildPrestigeListState(currentJob.ranking_universities ?? null, UNIVERSITY_DEFAULTS));
        setRankingCompaniesDraft(buildPrestigeListState(currentJob.ranking_companies ?? null, COMPANY_DEFAULTS));
        setIsRankingWeightsModalOpen(true);
    };

    const handleSaveRankingWeights = async (mode: 'job' | 'recruiter') => {
        const parsedWeights = parseWeightDraft(rankingWeightDraft);
        const total = getWeightDraftTotal(rankingWeightDraft);

        if (!parsedWeights || Math.abs(total - 100) >= 0.001) {
            toast.error(text('The total must be exactly 100%.', 'Il totale deve essere esattamente 100%.'));
            return;
        }

        const normalizedWeights = normalizeMatchingPillarWeights(parsedWeights);
        setIsSavingRankingWeights(true);
        try {
            const rankingConfig = {
                weights: normalizedWeights,
                universities: prestigeStateToOverride(rankingUniversitiesDraft),
                companies: prestigeStateToOverride(rankingCompaniesDraft),
            };
            const updated = mode === 'recruiter' && currentJob.recruiter_id
                ? {
                    ...currentJob,
                    ranking_weights: rankingConfig.weights,
                    ranking_universities: rankingConfig.universities,
                    ranking_companies: rankingConfig.companies,
                }
                : await saveJobRankingConfig(currentJob, rankingConfig);

            if (mode === 'recruiter') {
                if (!currentJob.recruiter_id) {
                    throw new Error('The recruiter profile could not be resolved for ranking preferences.');
                }
                await saveRecruiterRankingConfig(currentJob.recruiter_id, rankingConfig);
            }

            setCurrentJob(updated);
            setRankedApplicants((current) => current.map((row) => ({
                ...row,
                scoreDetails: calculateMatchScore(updated, row.candidate),
            })));
            setRankingWeightDraft(buildWeightDraft(updated.ranking_weights));
            setRankingUniversitiesDraft(buildPrestigeListState(updated.ranking_universities ?? null, UNIVERSITY_DEFAULTS));
            setRankingCompaniesDraft(buildPrestigeListState(updated.ranking_companies ?? null, COMPANY_DEFAULTS));
            setIsRankingWeightsModalOpen(false);
            toast.success(
                mode === 'recruiter'
                    ? text('Ranking preferences saved.', 'Preferenze ranking salvate.')
                    : text('Ranking saved for this job.', 'Ranking salvato per questo lavoro.')
            );
        } catch (error: any) {
            console.error('Failed to save ranking config:', error);
            toast.error(error?.message || text('Failed to save ranking config.', 'Impossibile salvare la configurazione del ranking.'));
        } finally {
            setIsSavingRankingWeights(false);
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
        if (!overrideInput.reason.trim()) {
            toast.error(text('A reason is required to save an override.', 'La motivazione è obbligatoria per salvare un override.'));
            return;
        }
        setIsSavingOverride(true);
        try {
            const existingOverride = currentJob.score_overrides?.[overrideModal.candidateId];
            const previousScore = existingOverride?.previous_score ?? overrideModal.currentScore;
            const updated = await saveScoreOverride(currentJob, overrideModal.candidateId, parsed, previousScore, overrideInput.reason.trim());
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
        updateSearchParam('candidateId', candidate.id);
    };

    const toggleCompareCandidate = (candidateId: string) => {
        setCompareCandidateIds((current) => {
            if (current.includes(candidateId)) {
                return current.filter((id) => id !== candidateId);
            }
            if (current.length >= MAX_COMPARE_CANDIDATES) {
                toast.error(text(
                    `You can compare up to ${MAX_COMPARE_CANDIDATES} candidates at a time.`,
                    `Puoi confrontare fino a ${MAX_COMPARE_CANDIDATES} candidati alla volta.`
                ));
                return current;
            }
            return [...current, candidateId];
        });
    };

    const enterCompareMode = () => {
        setCompareMode(true);
    };

    const exitCompareMode = () => {
        setCompareMode(false);
        setCompareCandidateIds([]);
        setIsComparisonOpen(false);
    };

    const openComparison = () => {
        if (compareCandidateIds.length < 2) return;
        setIsComparisonOpen(true);
    };

    // If the underlying ranked list changes (filters, scope, refresh), drop any
    // selected candidate IDs that no longer exist in the visible set — comparing
    // ghosts produces confusing empty columns.
    useEffect(() => {
        if (compareCandidateIds.length === 0) return;
        const visibleIds = new Set(rankedApplicants.map((row) => row.candidate.id));
        const filtered = compareCandidateIds.filter((id) => visibleIds.has(id));
        if (filtered.length !== compareCandidateIds.length) {
            setCompareCandidateIds(filtered);
            if (filtered.length < 2) setIsComparisonOpen(false);
        }
    }, [rankedApplicants, compareCandidateIds]);

    // Compare mode is a ranking-only concept; switching to interested/excluded
    // process views should silently dismiss it so the row UI stays consistent.
    useEffect(() => {
        if (hiringProcessView !== 'ranking' && (compareMode || compareCandidateIds.length > 0)) {
            exitCompareMode();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hiringProcessView]);

    const compareRowsForView = useMemo(() => {
        if (compareCandidateIds.length === 0) return [];
        const lookup = new Map(rankedApplicants.map((row) => [row.candidate.id, row] as const));
        return compareCandidateIds
            .map((id) => lookup.get(id))
            .filter((row): row is RankedCandidateRow => Boolean(row))
            .map((row) => ({
                candidate: row.candidate,
                scoreDetails: row.scoreDetails,
                effectiveScorePercent: getRowEffectiveScorePercent(row, currentJob, currentJob.score_overrides, jobQuizEnabled),
            }));
    }, [compareCandidateIds, rankedApplicants, currentJob, jobQuizEnabled]);

    const handleCloseCandidateProfile = () => {
        setSelectedCandidate(null);
        updateSearchParam('candidateId', null);

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

    const selectedCandidateQuestionnaireResult = selectedCandidate && jobQuizEnabled
        ? getCandidateQuestionnaireResult(selectedCandidate, currentJob)
        : null;
    const selectedCandidateRow = selectedCandidate
        ? rankedApplicants.find((row) => row.candidate.id === selectedCandidate.id) || null
        : null;

    const overlayNodes = (
        <>
            {isComparisonOpen && compareRowsForView.length >= 2 && (
                <CandidateComparisonView
                    rows={compareRowsForView}
                    job={currentJob}
                    // All ranked rows share the same effective weights (they were
                    // computed together against the same job), so we can read
                    // them off the first row instead of re-deriving the fallback chain.
                    weights={compareRowsForView[0].scoreDetails.weights}
                    onClose={() => setIsComparisonOpen(false)}
                    onRemove={(candidateId) => {
                        setCompareCandidateIds((current) => {
                            const next = current.filter((id) => id !== candidateId);
                            if (next.length < 2) {
                                // Falling below 2 makes the comparison meaningless —
                                // close it instead of showing a single column.
                                setIsComparisonOpen(false);
                            }
                            return next;
                        });
                    }}
                    onOpenProfile={(candidate) => {
                        setIsComparisonOpen(false);
                        // Defer the profile open by a tick so the comparison overlay
                        // unmounts cleanly first (body scroll lock release, etc.).
                        setTimeout(() => handleOpenCandidateProfile(candidate), 0);
                    }}
                />
            )}

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

            {isRankingWeightsModalOpen && (
                <RankingWeightsModal
                    draft={rankingWeightDraft}
                    universitiesState={rankingUniversitiesDraft}
                    companiesState={rankingCompaniesDraft}
                    isSaving={isSavingRankingWeights}
                    onChangeWeight={(key, value) => {
                        setRankingWeightDraft((current) => ({ ...current, [key]: value }));
                    }}
                    onApplyPreset={(preset) => setRankingWeightDraft(preset)}
                    onResetWeights={() => setRankingWeightDraft(buildWeightDraft(DEFAULT_MATCHING_PILLAR_WEIGHTS))}
                    onResetAll={() => {
                        setRankingWeightDraft(buildWeightDraft(DEFAULT_MATCHING_PILLAR_WEIGHTS));
                        setRankingUniversitiesDraft(buildPrestigeListState(null, UNIVERSITY_DEFAULTS));
                        setRankingCompaniesDraft(buildPrestigeListState(null, COMPANY_DEFAULTS));
                    }}
                    onUniversitiesChange={setRankingUniversitiesDraft}
                    onCompaniesChange={setRankingCompaniesDraft}
                    onClose={() => setIsRankingWeightsModalOpen(false)}
                    onSaveForJob={() => handleSaveRankingWeights('job')}
                    onSaveAsPreferences={() => handleSaveRankingWeights('recruiter')}
                    canSaveAsPreferences={Boolean(currentJob.recruiter_id)}
                    text={text}
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
                            {text('Reason', 'Motivazione')} <span className="text-rose-500">*</span>
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

            {excludeConfirmCandidate && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
                        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {text('Exclude candidate?', 'Escludere il candidato?')}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                            {text(
                                'This candidate will be removed from your ranking list and moved to the excluded list. You can restore them later from the excluded section.',
                                'Questo candidato verrà rimosso dalla lista del ranking e spostato nella lista degli esclusi. Potrai ripristinarlo in seguito dalla sezione degli esclusi.'
                            )}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    void handleMoveCandidateToStage(excludeConfirmCandidate.id, undefined, 'rejected');
                                    setExcludeConfirmCandidate(null);
                                }}
                                disabled={savingInterestCandidateId === excludeConfirmCandidate.id || stageBusyIds.has(excludeConfirmCandidate.id)}
                                className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-all"
                            >
                                {text('Yes, exclude', 'Sì, escludi')}
                            </button>
                            <button
                                onClick={() => setExcludeConfirmCandidate(null)}
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
                    scoreDetails={selectedCandidateRow?.scoreDetails}
                    effectiveScorePercent={selectedCandidateRow ? getRowEffectiveScorePercent(selectedCandidateRow, currentJob, currentJob.score_overrides, jobQuizEnabled) : undefined}
                    jobContext={{ job: currentJob, onJobUpdated: setCurrentJob }}
                    auxiliaryActions={
                        <>
                            {jobQuizEnabled && selectedCandidateQuestionnaireResult && (
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
            <div className="mb-0">
                <button
                    onClick={hiringProcessView !== 'ranking' ? closeInterestedProcessView : onBack}
                    className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    {hiringProcessView !== 'ranking' ? text('Back to ranking', 'Torna al ranking') : text('Back', 'Indietro')}
                </button>

                <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
                        {hiringProcessView === 'interested_process'
                            ? text('Continue the hiring process', 'Continua il processo di assunzione')
                            : hiringProcessView === 'excluded_process'
                                ? text('Excluded candidates', 'Candidati esclusi')
                                : currentJob.title}
                    </h1>
                    {hiringProcessView === 'ranking' && (
                        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={compareMode ? exitCompareMode : enterCompareMode}
                                aria-pressed={compareMode}
                                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm transition-colors ${
                                    compareMode
                                        ? 'border-orange-300 bg-orange-500/10 text-orange-700 hover:border-orange-400 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-200'
                                        : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-orange-500/60 dark:hover:text-orange-300'
                                }`}
                                title={text('Compare 2–3 candidates side-by-side', 'Confronta 2–3 candidati affiancati')}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H5a2 2 0 00-2 2v10a2 2 0 002 2h4M15 5h4a2 2 0 012 2v10a2 2 0 01-2 2h-4M12 3v18" />
                                </svg>
                                {compareMode
                                    ? text(
                                        compareCandidateIds.length > 0
                                            ? `Cancel (${compareCandidateIds.length} selected)`
                                            : 'Cancel compare',
                                        compareCandidateIds.length > 0
                                            ? `Annulla (${compareCandidateIds.length} selezionati)`
                                            : 'Esci confronto'
                                    )
                                    : text('Compare', 'Confronta')}
                            </button>
                            <button
                                type="button"
                                onClick={openRankingWeightsModal}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-orange-300 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-orange-500/60 dark:hover:text-orange-300"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h10M4 12h16M4 18h7M16 6h4M10 18h10" />
                                </svg>
                                {text('Ranking weights', 'Pesi ranking')}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {hiringProcessView === 'ranking' ? (
                <div className="mt-3 mb-4 flex flex-wrap items-end gap-x-2.5 gap-y-2 pt-0">
                    <SelectField
                        label={text('Candidates', 'Candidati')}
                        value={rankingScope}
                        onChange={(value) => setRankingScope(value as RankingScope)}
                        options={rankingScopeOptions}
                        containerClassName="min-w-[165px] flex-1 sm:flex-none"
                    />
                    {jobQuizEnabled && (
                        <SelectField
                            label={text('Questionnaire', 'Questionario')}
                            value={stepFilter}
                            onChange={(value) => setStepFilter(value as QuestionnaireFilter)}
                            options={questionnaireStageOptions}
                            containerClassName="min-w-[165px] flex-1 sm:flex-none"
                        />
                    )}
                    <SelectField
                        label={text('Education title', 'Titolo di studio')}
                        value={degreeFilter}
                        onChange={(value) => setDegreeFilter(value as DegreeFilter)}
                        options={[{ value: 'all', label: text('Any degree', 'Qualsiasi titolo') }, { value: 'job_min', label: text('Meets job minimum', 'Rispetta il minimo job') }, { value: 'bachelor_plus', label: text('Bachelor+', 'Laurea triennale+') }, { value: 'master_plus', label: text('Master+', 'Magistrale+') }, { value: 'phd_plus', label: text('PhD+', 'PhD+') }]}
                        containerClassName="min-w-[165px] flex-1 sm:flex-none"
                    />
                    <SelectField
                        label={text('Work experience', 'Esperienza lavorativa')}
                        value={experienceFilter}
                        onChange={(value) => setExperienceFilter(value as ExperienceFilter)}
                        options={[
                            { value: 'all', label: text('None', 'Nessuna') },
                            { value: '2_plus', label: text('2 years+', '2 anni+') },
                            { value: '5_plus', label: text('5 years+', '5 anni+') },
                            { value: '7_plus', label: text('7 years+', '7 anni+') },
                            { value: '10_plus', label: text('10 years+', '10 anni+') },
                            { value: '15_plus', label: text('15 years+', '15 anni+') },
                        ]}
                        containerClassName="min-w-[165px] flex-1 sm:flex-none"
                    />
                    <div className="flex flex-col sm:flex-none">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            {text('Search', 'Cerca')}
                        </span>
                        {isSearchFilterOpen || searchQuery.trim() ? (
                            <div className="flex h-10 min-w-[220px] items-center rounded-xl border border-slate-200 bg-slate-50/90 px-3.5 transition-colors focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-900">
                                <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 h-4 w-4 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z" />
                                </svg>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    onBlur={() => {
                                        if (!searchQuery.trim()) {
                                            setIsSearchFilterOpen(false);
                                        }
                                    }}
                                    autoFocus
                                    placeholder={text('Search candidates', 'Cerca candidati')}
                                    className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
                                />
                                {searchQuery.trim() && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchQuery('');
                                            setIsSearchFilterOpen(false);
                                        }}
                                        className="ml-2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                                        aria-label={text('Clear search', 'Cancella ricerca')}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setIsSearchFilterOpen(true)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50/90 text-slate-500 transition-colors hover:border-orange-300 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                aria-label={text('Search candidates', 'Cerca candidati')}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z" />
                                </svg>
                            </button>
                        )}
                    </div>
                    {activeFilterCount > 0 && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="mb-0.5 inline-flex h-10 items-center justify-center rounded-full border border-transparent px-3 text-sm font-semibold text-orange-500 transition-colors hover:text-orange-600"
                        >
                            {text('Clear all', 'Cancella tutto')}
                        </button>
                    )}
                </div>
            ) : hiringProcessView === 'interested_process' ? (
                <div className="mt-3 mb-4 flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <label className="inline-flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <input
                            type="checkbox"
                            checked={filteredApplicants.length > 0 && selectedInterestedCandidateIds.length === filteredApplicants.length}
                            onChange={toggleSelectAllInterestedCandidates}
                            className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500/30"
                        />
                        <span>
                            {filteredApplicants.length > 0 && selectedInterestedCandidateIds.length === filteredApplicants.length
                                ? text('Unselect all', 'Deseleziona tutti')
                                : text('Select all', 'Seleziona tutti')}
                        </span>
                    </label>

                    <div className="flex flex-wrap gap-2">
                        <div
                            className="relative"
                            onBlur={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                    setIsInterestedExportMenuOpen(false);
                                }
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setIsInterestedExportMenuOpen((current) => !current)}
                                disabled={downloadingInterestedFormat !== null}
                                aria-haspopup="menu"
                                aria-expanded={isInterestedExportMenuOpen}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                {downloadingInterestedFormat ? text('Preparing...', 'Preparazione...') : text('Export', 'Esporta')}
                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isInterestedExportMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {isInterestedExportMenuOpen && (
                                <div className="absolute right-0 z-20 mt-2 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900" role="menu">
                                    {(['csv', 'xls', 'xlsx'] as InviteEmailTemplateFormat[]).map((format) => (
                                        <button
                                            key={format}
                                            type="button"
                                            onClick={() => handleInterestedExportFormatSelect(format)}
                                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                            role="menuitem"
                                        >
                                            <span>{format.toUpperCase()}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={handleGenerateInterestedCandidatesEmail}
                            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                        >
                            {text('Generate email', 'Genera mail')}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-3 mb-4 rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    {text('Review excluded candidates and either move them to the shortlist or restore them to the neutral state.', 'Rivedi i candidati esclusi e scegli se spostarli nella shortlist o riportarli allo stato neutrale.')}
                </div>
            )}

            <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
                <div className="space-y-3 md:col-span-1">
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
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
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{text('Pipeline summary', 'Riepilogo pipeline')}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2.5">
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
                                <div className="text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">{interestedCandidateIds.length}</div>
                                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Shortlist</div>
                            </div>
                            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
                                <div className="text-2xl font-semibold tracking-tight text-rose-600 dark:text-rose-300">{notInterestedCandidateIds.length}</div>
                                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-rose-600 dark:text-rose-300">{text('Excluded', 'Esclusi')}</div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate(`/recruiter/job/${currentJob.id}/pipeline`, { state: { job: currentJob } })}
                            className="mt-3 inline-flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-orange-300 hover:bg-orange-50/60 hover:text-orange-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-orange-500/50 dark:hover:bg-orange-950/20 dark:hover:text-orange-300"
                        >
                            <span>{text('Open pipeline', 'Apri pipeline')}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                        </button>
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
                                <div className="space-y-[13px]">
                                    {visibleApplicants.map((row, index) => {
                                        const { candidate, scoreDetails } = row;
                                        const interestDecision = getCandidateInterestDecision(currentJob, candidate.id);
                                        const isHiredCandidate = hiredCandidateId === candidate.id;
                                        const showHiredCandidateMarker = hiringProcessView === 'interested_process' && isHiredCandidate;
                                        const questionnaireResult = jobQuizEnabled ? getCandidateQuestionnaireResult(candidate, currentJob) : null;
                                        const effectiveScorePercent = getRowEffectiveScorePercent(row, currentJob, currentJob.score_overrides, jobQuizEnabled);
                                        const hasCompletedAssessment = Boolean(questionnaireResult);
                                        const needsAiRefinement = !candidate.ai_refined;
                                        const hasActiveQuiz = jobQuizEnabled;
                                        const selectionComplete = hasActiveQuiz ? (hasCompletedAssessment && !needsAiRefinement) : !needsAiRefinement;
                                        const needsQuestionnaireCompletion = hasActiveQuiz && !hasCompletedAssessment;
                                        const needsCompletionInvite = !selectionComplete && (needsAiRefinement || needsQuestionnaireCompletion);
                                        const completionInviteLabel = needsAiRefinement && needsQuestionnaireCompletion
                                            ? text('AI interview + questionnaire missing', 'AI interview + questionario mancanti')
                                            : needsAiRefinement
                                                ? text('AI interview missing', 'AI interview mancante')
                                                : text('Questionnaire missing', 'Questionario mancante');
                                        const completionInviteLoading =
                                            requestingCandidateId === candidate.id ||
                                            requestingAiRefinementCandidateId === candidate.id;
                                        const headerActions = hiringProcessView === 'interested_process' ? (
                                            <>
                                                <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedInterestedCandidateIds.includes(candidate.id)}
                                                        onChange={() => toggleInterestedCandidateSelection(candidate.id)}
                                                        className="h-3.5 w-3.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500/30"
                                                    />
                                                    <span>{text('Select', 'Seleziona')}</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        void handleResetCandidateInterest(candidate);
                                                    }}
                                                    disabled={savingInterestCandidateId === candidate.id}
                                                    className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/30"
                                                >
                                                    {text('Remove from shortlist', 'Rimuovi dalla shortlist')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        void handleSetHiredCandidate(candidate, isHiredCandidate ? null : candidate.id);
                                                    }}
                                                    disabled={savingInterestCandidateId === candidate.id}
                                                    className={`inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-80 ${
                                                        isHiredCandidate
                                                            ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
                                                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300'
                                                    }`}
                                                    title={isHiredCandidate ? text('Remove hired mark', 'Rimuovi assunto') : text('Mark as hired', 'Segna assunto')}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.2a1 1 0 01-1.41 0l-3.25-3.23a1 1 0 111.41-1.42l2.545 2.53 6.545-6.5a1 1 0 011.41 0z" clipRule="evenodd" />
                                                    </svg>
                                                    {isHiredCandidate ? text('Remove hired', 'Rimuovi assunto') : text('Mark as hired', 'Segna assunto')}
                                                </button>
                                            </>
                                        ) : hiringProcessView === 'excluded_process' ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        void handleSaveCandidateInterest(candidate, 'interested');
                                                    }}
                                                    disabled={savingInterestCandidateId === candidate.id}
                                                    className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                                >
                                                    {text('Add to shortlist', 'Aggiungi alla shortlist')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        void handleResetCandidateInterest(candidate);
                                                    }}
                                                    disabled={savingInterestCandidateId === candidate.id}
                                                    className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                                >
                                                    {text('Restore', 'Ripristina')}
                                                </button>
                                            </>
                                        ) : (
                                            <StageSelector
                                                value={resolveStage(candidate.id, row.status)}
                                                disabled={stageBusyIds.has(candidate.id) || savingInterestCandidateId === candidate.id}
                                                onChange={(nextStage) => {
                                                    const currentStage = resolveStage(candidate.id, row.status);
                                                    if (nextStage === 'rejected' && currentStage !== 'rejected') {
                                                        setExcludeConfirmCandidate(candidate);
                                                        return;
                                                    }
                                                    void handleMoveCandidateToStage(candidate.id, row.status, nextStage);
                                                }}
                                            />
                                        );
                                        const isSelectedForCompare = compareCandidateIds.includes(candidate.id);
                                        const isCompareLimitReached = compareCandidateIds.length >= MAX_COMPARE_CANDIDATES && !isSelectedForCompare;
                                        return (
                                            <div
                                                key={`${candidate.id}-${listAnimationTick}`}
                                                className={`animate-candidate-cascade relative group opacity-0 ${
                                                    showHiredCandidateMarker
                                                        ? 'ring-4 ring-emerald-400/35 dark:ring-emerald-500/30'
                                                        : ''
                                                } ${
                                                    isSelectedForCompare
                                                        ? 'ring-2 ring-orange-400/70 rounded-[30px] dark:ring-orange-500/50'
                                                        : ''
                                                } ${
                                                    compareMode && !isSelectedForCompare && isCompareLimitReached
                                                        ? 'opacity-60'
                                                        : ''
                                                }`}
                                                style={{
                                                    animationDelay: `${Math.min(index, 10) * 45}ms`,
                                                    // Browser-native off-screen skip: cards outside the viewport are
                                                    // not laid out or painted until scrolled near. `containIntrinsicSize`
                                                    // reserves space so the scrollbar stays accurate.
                                                    contentVisibility: 'auto',
                                                    containIntrinsicSize: '0 320px',
                                                }}
                                            >
                                                {showHiredCandidateMarker && (
                                                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.2a1 1 0 01-1.41 0l-3.25-3.23a1 1 0 111.41-1.42l2.545 2.53 6.545-6.5a1 1 0 011.41 0z" clipRule="evenodd" />
                                                        </svg>
                                                        {text('Hired candidate', 'Candidato assunto')}
                                                    </div>
                                                )}
                                                {compareMode && hiringProcessView === 'ranking' && (
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            toggleCompareCandidate(candidate.id);
                                                        }}
                                                        disabled={isCompareLimitReached}
                                                        aria-pressed={isSelectedForCompare}
                                                        aria-label={isSelectedForCompare
                                                            ? text('Remove from comparison', 'Rimuovi dal confronto')
                                                            : text('Add to comparison', 'Aggiungi al confronto')}
                                                        className={`absolute -left-2 -top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-md transition-all ${
                                                            isSelectedForCompare
                                                                ? 'border-orange-500 bg-orange-500 text-white hover:bg-orange-600'
                                                                : 'border-slate-300 bg-white text-slate-400 hover:border-orange-400 hover:text-orange-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-500'
                                                        } ${isCompareLimitReached ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                                        title={isCompareLimitReached
                                                            ? text(`Max ${MAX_COMPARE_CANDIDATES} candidates`, `Massimo ${MAX_COMPARE_CANDIDATES} candidati`)
                                                            : isSelectedForCompare
                                                                ? text('Remove from comparison', 'Rimuovi dal confronto')
                                                                : text('Add to comparison', 'Aggiungi al confronto')}
                                                    >
                                                        {isSelectedForCompare ? (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.2a1 1 0 01-1.41 0l-3.25-3.23a1 1 0 111.41-1.42l2.545 2.53 6.545-6.5a1 1 0 011.41 0z" clipRule="evenodd" />
                                                            </svg>
                                                        ) : (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 5v14M5 12h14" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                )}
                                                <CandidateCard
                                                    candidate={candidate}
                                                    scoreDetails={scoreDetails}
                                                    effectiveScorePercent={effectiveScorePercent}
                                                    rankNumber={rankByCandidateId.get(candidate.id) || index + 1}
                                                    questionnaireScore={questionnaireResult?.score ?? null}
                                                    showQuestionnaireMetric={jobQuizEnabled}
                                                    isLocked={false}
                                                    recruiterOverride={currentJob.score_overrides?.[candidate.id] ?? null}
                                                    onEditOverride={() => openOverrideModal(candidate.id, getCandidateDisplayName(candidate), effectiveScorePercent)}
                                                    onOpenProfile={() => {
                                                        // In compare mode the whole card becomes a selection target —
                                                        // clicking anywhere on it toggles the candidate instead of
                                                        // navigating to the profile detail.
                                                        if (compareMode && hiringProcessView === 'ranking') {
                                                            if (isCompareLimitReached) return;
                                                            toggleCompareCandidate(candidate.id);
                                                            return;
                                                        }
                                                        handleOpenCandidateProfile(candidate);
                                                    }}
                                                    headerActions={headerActions}
                                                    nextStepAction={
                                                        hiringProcessView !== 'ranking' ? null : needsCompletionInvite ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (needsQuestionnaireCompletion) {
                                                                        void handleRequestAssessment(candidate);
                                                                    } else {
                                                                        void handleRequestAiRefinement(candidate);
                                                                    }
                                                                }}
                                                                disabled={completionInviteLoading}
                                                                className="inline-flex h-[30px] w-full items-center justify-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3.5 text-[11px] font-semibold text-orange-700 shadow-sm transition-colors hover:border-orange-300 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20 sm:w-auto"
                                                            >
                                                                <span className="truncate">{completionInviteLoading ? text('Sending...', 'Invio in corso...') : completionInviteLabel}</span>
                                                                {!completionInviteLoading && (
                                                                    <strong className="whitespace-nowrap font-black">{text('Invite', 'Invita')}</strong>
                                                                )}
                                                            </button>
                                                        ) : selectionComplete ? (
                                                            <div className="inline-flex h-[30px] w-full items-center justify-center gap-1.5 px-1 text-[11px] font-black text-emerald-600 dark:text-emerald-300 sm:w-auto">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.2a1 1 0 01-1.41 0l-3.25-3.23a1 1 0 111.41-1.42l2.545 2.53 6.545-6.5a1 1 0 011.41 0z" clipRule="evenodd" />
                                                                </svg>
                                                                <span className="whitespace-nowrap">{text('Profile completed', 'Profilo completato')}</span>
                                                            </div>
                                                        ) : null
                                                    }
                                                />

                                            </div>
                                        );
                                    })}
                                    {hiddenApplicantsCount > 0 && (
                                        <div className="flex flex-col items-center gap-2 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setVisibleApplicantsCount((current) => current + APPLICANTS_PAGE_SIZE)}
                                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-orange-300 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-orange-500/40 dark:hover:text-orange-300"
                                            >
                                                {text(
                                                    `Show ${Math.min(hiddenApplicantsCount, APPLICANTS_PAGE_SIZE)} more`,
                                                    `Mostra altri ${Math.min(hiddenApplicantsCount, APPLICANTS_PAGE_SIZE)}`
                                                )}
                                            </button>
                                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                                {text(
                                                    `${visibleApplicants.length} of ${filteredApplicants.length} candidates shown`,
                                                    `${visibleApplicants.length} di ${filteredApplicants.length} candidati visibili`
                                                )}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50/70 py-20 text-center dark:border-slate-800 dark:bg-slate-950/40">
                                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-900"><svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
                                    <h3 className="text-lg font-semibold tracking-tight text-slate-800 dark:text-slate-100">
                                        {hiringProcessView === 'interested_process'
                                            ? text('No shortlisted candidates selected yet', 'Non hai ancora selezionato candidati in shortlist')
                                            : hiringProcessView === 'excluded_process'
                                                ? text('No excluded candidates yet', 'Non ci sono ancora candidati esclusi')
                                                : text('No profiles match these filters', 'Nessun profilo corrisponde a questi filtri')}
                                    </h3>
                                    <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                                        {hiringProcessView === 'interested_process'
                                            ? text('Add candidates to the shortlist from the ranking to continue with the hiring process here.', 'Aggiungi candidati alla shortlist dal ranking per continuare qui il processo di assunzione.')
                                            : hiringProcessView === 'excluded_process'
                                                ? text('When you exclude candidates from the ranking, you will be able to review them here and move them back if needed.', 'Quando escludi candidati dal ranking, potrai rivederli qui e recuperarli se necessario.')
                                                : text('Try widening the shortlist or clearing a few filters.', 'Prova ad allargare la shortlist o a togliere qualche filtro.')}
                                    </p>
                                    {hiringProcessView === 'ranking' && activeFilterCount > 0 && <button onClick={clearFilters} className="mt-5 text-sm font-semibold text-orange-500 hover:text-orange-600">{text('Clear all filters', 'Cancella tutti i filtri')}</button>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Floating compare action bar — visible while compareMode is on
                and the recruiter is in the ranking view. Sits above any cards
                that scroll behind it; safe-area padding keeps it clear of the
                mobile home bar. Hidden when the comparison overlay is open so
                two layers of UI don't fight for attention. */}
            {compareMode && hiringProcessView === 'ranking' && !isComparisonOpen && (
                <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 pointer-events-none">
                    <div className="pointer-events-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H5a2 2 0 00-2 2v10a2 2 0 002 2h4M15 5h4a2 2 0 012 2v10a2 2 0 01-2 2h-4M12 3v18" />
                                </svg>
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-900 dark:text-slate-100">
                                    {compareCandidateIds.length === 0
                                        ? text('Select 2–3 candidates to compare', 'Seleziona 2–3 candidati da confrontare')
                                        : text(
                                            `${compareCandidateIds.length} of ${MAX_COMPARE_CANDIDATES} selected`,
                                            `${compareCandidateIds.length} di ${MAX_COMPARE_CANDIDATES} selezionati`
                                        )}
                                </p>
                                <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                    {text('Click any card to add it', 'Clicca su una card per aggiungerla')}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={exitCompareMode}
                                className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 px-3.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-100"
                            >
                                {text('Cancel', 'Annulla')}
                            </button>
                            <button
                                type="button"
                                onClick={openComparison}
                                disabled={compareCandidateIds.length < 2}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-orange-500 px-4 text-xs font-black text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
                            >
                                {text(`Compare (${compareCandidateIds.length})`, `Confronta (${compareCandidateIds.length})`)}
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecruiterMatchesView;
