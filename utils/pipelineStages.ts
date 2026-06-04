import { JobProfile } from '../types';

export type ApplicationStage = 'new' | 'screened' | 'interview' | 'offer' | 'hired' | 'rejected';

export interface PipelineStageDef {
    id: ApplicationStage;
    labelEn: string;
    labelIt: string;
    /** Tailwind color tokens used to theme the column header */
    accent: {
        bg: string;
        border: string;
        text: string;
        dot: string;
    };
    /** Visual order in the kanban (left → right) */
    order: number;
}

export const PIPELINE_STAGES: PipelineStageDef[] = [
    {
        id: 'new',
        labelEn: 'New',
        labelIt: 'Nuovi',
        accent: { bg: 'bg-slate-50 dark:bg-slate-900/40', border: 'border-slate-200 dark:border-slate-800', text: 'text-slate-700 dark:text-slate-200', dot: 'bg-slate-400' },
        order: 0,
    },
    {
        id: 'screened',
        labelEn: 'Shortlist',
        labelIt: 'Shortlist',
        accent: { bg: 'bg-sky-50 dark:bg-sky-950/30', border: 'border-sky-200 dark:border-sky-900/60', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
        order: 1,
    },
    {
        id: 'interview',
        labelEn: 'Interview',
        labelIt: 'Colloquio',
        accent: { bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200 dark:border-violet-900/60', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
        order: 2,
    },
    {
        id: 'offer',
        labelEn: 'Offer',
        labelIt: 'Offerta',
        accent: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-900/60', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
        order: 3,
    },
    {
        id: 'hired',
        labelEn: 'Hired',
        labelIt: 'Assunti',
        accent: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-900/60', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
        order: 4,
    },
    {
        id: 'rejected',
        labelEn: 'Rejected',
        labelIt: 'Scartati',
        accent: { bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-200 dark:border-rose-900/60', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
        order: 5,
    },
];

export const PIPELINE_STAGE_IDS: ApplicationStage[] = PIPELINE_STAGES.map(s => s.id);

const STAGE_VALUE_SET = new Set<string>(PIPELINE_STAGE_IDS);

export const getStageDef = (id: ApplicationStage): PipelineStageDef =>
    PIPELINE_STAGES.find(s => s.id === id) || PIPELINE_STAGES[0];

/**
 * Reconcile an application's stage from multiple sources.
 * Priority: hired_candidate_id > applications.status (if a canonical stage)
 *           > candidate_interest_reviews > 'new'.
 *
 * This keeps the legacy `assessment_requested` / `assessment_completed`
 * statuses non-destructive: they map to 'new' until the recruiter
 * explicitly moves the candidate.
 */
export const deriveStageFromContext = (
    job: JobProfile,
    candidateId: string,
    dbStatus?: string
): ApplicationStage => {
    if (job.hired_candidate_id && job.hired_candidate_id === candidateId) {
        return 'hired';
    }

    if (dbStatus && STAGE_VALUE_SET.has(dbStatus)) {
        return dbStatus as ApplicationStage;
    }

    const review = job.candidate_interest_reviews?.[candidateId];
    if (review?.decision === 'not_interested') return 'rejected';
    if (review?.decision === 'interested') return 'screened';

    return 'new';
};

export const stageLabel = (id: ApplicationStage, lang: 'it' | 'en'): string => {
    const def = getStageDef(id);
    return lang === 'it' ? def.labelIt : def.labelEn;
};
