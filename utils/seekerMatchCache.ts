// Shared seeker-side recommendation cache.
// Extracted from components/JobSeekerHomePage so that `invalidateSeekerMatchCache`
// can stay in the main bundle while the dashboard component itself is code-split.

import { Notification, RecommendedJob } from '../types';

export interface SeekerMatchCache {
    candidateId: string;
    candidateSignature: string;
    recommendations: RecommendedJob[];
    invitations: RecommendedJob[];
    notifications: Notification[];
    assessmentStatuses: Record<string, string>;
}

export const SEEKER_MATCH_CACHE_INVALIDATED_EVENT = 'peaktalent:seeker-match-cache-invalidated';

let matchCache: SeekerMatchCache | null = null;

export const getSeekerMatchCache = (): SeekerMatchCache | null => matchCache;

export const setSeekerMatchCache = (next: SeekerMatchCache | null): void => {
    matchCache = next;
};

export const invalidateSeekerMatchCache = (candidateId?: string): void => {
    if (!candidateId || matchCache?.candidateId === candidateId) {
        matchCache = null;
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SEEKER_MATCH_CACHE_INVALIDATED_EVENT, {
            detail: { candidateId },
        }));
    }
};
