import { CandidateProfile, JobProfile } from '../types';

export interface JobMetrics {
    applicantCount: number;

    quizEnabled: boolean;
    testCompletedCount: number;
    testCompletionRate: number; // 0-1, only meaningful if quizEnabled

    interestedCount: number;
    notInterestedCount: number;
    pendingReviewCount: number;
    reviewedRate: number; // 0-1
    interestedShare: number; // 0-1, among reviewed

    avgTestScore: number | null; // 0-100 mean across applicants with score, null if none

    seniorityDistribution: Record<string, number>;
    countryDistribution: Record<string, number>;
    jobFunctionDistribution: Record<string, number>;

    lastReviewAt?: string;
}

export type Applicant = { candidate: CandidateProfile; status: string };

export const computeJobMetrics = (job: JobProfile, applicants: Applicant[]): JobMetrics => {
    const applicantCount = applicants.length;
    const quizEnabled = !!job.requires_quiz;

    let testCompletedCount = 0;
    const testScores: number[] = [];
    for (const { candidate } of applicants) {
        const result = (candidate.test_results || []).find(r => r.job_id === job.id);
        if (result?.completed_at) {
            testCompletedCount++;
            if (typeof result.score === 'number') testScores.push(result.score);
        }
    }
    const testCompletionRate = quizEnabled && applicantCount > 0 ? testCompletedCount / applicantCount : 0;
    const avgTestScore = testScores.length ? testScores.reduce((a, b) => a + b, 0) / testScores.length : null;

    const reviews = job.candidate_interest_reviews || {};
    let interestedCount = 0;
    let notInterestedCount = 0;
    let lastReviewAt: string | undefined;
    for (const r of Object.values(reviews)) {
        if (r.decision === 'interested') interestedCount++;
        else if (r.decision === 'not_interested') notInterestedCount++;
        if (r.updated_at && (!lastReviewAt || r.updated_at > lastReviewAt)) {
            lastReviewAt = r.updated_at;
        }
    }
    const reviewedTotal = interestedCount + notInterestedCount;
    const pendingReviewCount = Math.max(0, applicantCount - reviewedTotal);
    const reviewedRate = applicantCount > 0 ? reviewedTotal / applicantCount : 0;
    const interestedShare = reviewedTotal > 0 ? interestedCount / reviewedTotal : 0;

    const seniorityDistribution: Record<string, number> = {};
    const countryDistribution: Record<string, number> = {};
    const jobFunctionDistribution: Record<string, number> = {};
    for (const { candidate } of applicants) {
        const s = candidate.current_seniority_level || 'unknown';
        seniorityDistribution[s] = (seniorityDistribution[s] || 0) + 1;
        const c = candidate.residence?.country || 'unknown';
        countryDistribution[c] = (countryDistribution[c] || 0) + 1;
        const f = candidate.current_job_function || 'unknown';
        jobFunctionDistribution[f] = (jobFunctionDistribution[f] || 0) + 1;
    }

    return {
        applicantCount,
        quizEnabled,
        testCompletedCount,
        testCompletionRate,
        interestedCount,
        notInterestedCount,
        pendingReviewCount,
        reviewedRate,
        interestedShare,
        avgTestScore,
        seniorityDistribution,
        countryDistribution,
        jobFunctionDistribution,
        lastReviewAt,
    };
};

export const emptyJobMetrics = (applicantCount = 0): JobMetrics => ({
    applicantCount,
    quizEnabled: false,
    testCompletedCount: 0,
    testCompletionRate: 0,
    interestedCount: 0,
    notInterestedCount: 0,
    pendingReviewCount: applicantCount,
    reviewedRate: 0,
    interestedShare: 0,
    avgTestScore: null,
    seniorityDistribution: {},
    countryDistribution: {},
    jobFunctionDistribution: {},
});

export const formatPercent = (value: number, fractionDigits = 0): string =>
    `${(value * 100).toFixed(fractionDigits)}%`;
