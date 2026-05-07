import { JobProfile, CandidateProfile } from '../types';
import { calculateMatchScore, isEligible } from '../utils/matchingUtils';

type WorkerMessage =
    | { type: 'rankCandidates'; messageId: number; payload: { job: JobProfile; candidates: CandidateProfile[] } }
    | { type: 'recommendJobs'; messageId: number; payload: { candidate: CandidateProfile; jobs: JobProfile[]; limit: number } };

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const { type, payload, messageId } = e.data;

    if (type === 'rankCandidates') {
        const { job, candidates } = payload;

        // STRICT FILTER: Only show candidates who applied
        const applicants = candidates.filter(cand =>
            job.applicant_emails?.some(email => email.toLowerCase().trim() === cand.contacts.email.toLowerCase().trim())
        );

        const eligibleApplicants = applicants.filter(cand => isEligible(job, cand));

        const ranked = eligibleApplicants
            .map(cand => ({
                candidate: cand,
                scoreDetails: calculateMatchScore(job, cand)
            }))
            .sort((a, b) => b.scoreDetails.finalScore - a.scoreDetails.finalScore);

        self.postMessage({ type: 'rankCandidatesResult', messageId, result: ranked });

    } else if (type === 'recommendJobs') {
        const { candidate, jobs, limit } = payload;

        const ranked = jobs.map(job => {
            const score = calculateMatchScore(job, candidate).finalScore;
            return {
                job,
                score,
                explanation: "Ranked based on skills, trajectory, experience, and constraints."
            };
        });

        const final = ranked.sort((a, b) => b.score - a.score).slice(0, limit);
        self.postMessage({ type: 'recommendJobsResult', messageId, result: final });
    }
};
