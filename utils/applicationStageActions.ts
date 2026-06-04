import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { JobProfile } from '../types';
import {
    removeCandidateInterestReview,
    saveCandidateInterestReview,
    saveJobHiredCandidate,
    updateApplicationStatus,
} from '../services/dbService';
import { ApplicationStage, getStageDef } from './pipelineStages';

type Lang = 'it' | 'en';

interface UseStageActionsOptions {
    /** Called whenever the job is mutated (hired_candidate_id, candidate_interest_reviews). */
    onJobUpdated?: (job: JobProfile) => void;
    /** Optional callback to update local stage state (optimistic). */
    onStageOptimistic?: (candidateId: string, stage: ApplicationStage) => void;
    /** Called if the move fails so the caller can roll back. */
    onStageRollback?: (candidateId: string, previousStage: ApplicationStage) => void;
    language?: Lang;
}

export interface MoveStageRequest {
    candidateId: string;
    fromStage: ApplicationStage;
    toStage: ApplicationStage;
}

/**
 * Centralised, side-effect-aware controller for application stage transitions.
 * Both the ranking view (per-card selector) and the kanban view share this hook
 * so the underlying writes stay consistent.
 *
 * Side effects per stage:
 *   - 'hired'     → saveJobHiredCandidate(job, candidateId)
 *   - 'screened'  → saveCandidateInterestReview(job, candidateId, 'interested')
 *   - 'rejected'  → saveCandidateInterestReview(job, candidateId, 'not_interested')
 *   - others      → applications.status only
 *
 * When the candidate leaves a "decided" stage (hired/screened/rejected) the
 * legacy markers are cleared so the two systems stay in sync.
 */
export function useStageActions(jobRef: { current: JobProfile }, options: UseStageActionsOptions = {}) {
    const { onJobUpdated, onStageOptimistic, onStageRollback, language = 'en' } = options;
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const busyRef = useRef(busyIds);
    busyRef.current = busyIds;

    const setBusy = useCallback((candidateId: string, busy: boolean) => {
        setBusyIds((current) => {
            const next = new Set(current);
            if (busy) next.add(candidateId); else next.delete(candidateId);
            return next;
        });
    }, []);

    const move = useCallback(async ({ candidateId, fromStage, toStage }: MoveStageRequest) => {
        if (fromStage === toStage) return;
        if (busyRef.current.has(candidateId)) return;

        setBusy(candidateId, true);
        onStageOptimistic?.(candidateId, toStage);

        let updatedJob = jobRef.current;

        try {
            await updateApplicationStatus(candidateId, updatedJob.id, toStage);

            if (toStage === 'hired') {
                updatedJob = await saveJobHiredCandidate(updatedJob, candidateId);
            } else if (fromStage === 'hired' && updatedJob.hired_candidate_id === candidateId) {
                updatedJob = await saveJobHiredCandidate(updatedJob, null);
            }

            if (toStage === 'screened') {
                updatedJob = await saveCandidateInterestReview(updatedJob, candidateId, 'interested');
            } else if (toStage === 'rejected') {
                updatedJob = await saveCandidateInterestReview(updatedJob, candidateId, 'not_interested');
            } else if ((fromStage === 'screened' || fromStage === 'rejected') && updatedJob.candidate_interest_reviews?.[candidateId]) {
                updatedJob = await removeCandidateInterestReview(updatedJob, candidateId);
            }

            onJobUpdated?.(updatedJob);
            const def = getStageDef(toStage);
            toast.success(language === 'it' ? def.labelIt : def.labelEn, { duration: 1500 });
        } catch (error: any) {
            console.error('Failed to move candidate to stage:', error);
            onStageRollback?.(candidateId, fromStage);
            toast.error(error?.message || (language === 'it' ? 'Impossibile aggiornare lo stage.' : 'Could not update the stage.'));
        } finally {
            setBusy(candidateId, false);
        }
    }, [jobRef, language, onJobUpdated, onStageOptimistic, onStageRollback, setBusy]);

    return { move, busyIds };
}
