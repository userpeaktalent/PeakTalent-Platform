import { JobProfile, CandidateProfile, RecommendedJob } from '../types';
import { supabase } from './supabaseClient';
import { calculateMatchScore } from '../utils/matchingUtils';

// Keep legacy worker for fallback or complex re-ranking of small subsets if needed
const worker = new Worker(new URL('./matching.worker.ts', import.meta.url), { type: 'module' });

let _nextMessageId = 0;

/**
 * Posts a typed message to the worker and returns a promise that resolves only
 * for the matching messageId, preventing race conditions when concurrent calls
 * are made with the same message type.
 */
const postWorkerMessage = (type: string, payload: any): Promise<any> => {
  const messageId = ++_nextMessageId;
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      if (e.data.type === type + 'Result' && e.data.messageId === messageId) {
        worker.removeEventListener('message', handler);
        resolve(e.data.result);
      }
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ type, payload, messageId });
    setTimeout(() => {
      worker.removeEventListener('message', handler);
      reject(new Error(`Worker timed out for task '${type}' (id=${messageId})`));
    }, 10000);
  });
};

export const rankCandidatesForJob = async (job: JobProfile, candidates: CandidateProfile[]) => {
  return postWorkerMessage('rankCandidates', { job, candidates });
};

/**
 * Optimized Job Recommendation Service
 * 1. Tries Server-Side Vector Search (pgvector) -> FAST O(1)
 * 2. Fallbacks to Worker (Brute Force) -> SLOW O(N)
 */
export const recommendJobsForCandidate = async (candidate: CandidateProfile, allJobs: JobProfile[], limit: number = 12): Promise<RecommendedJob[]> => {
  // For the job volumes we currently handle in-app, full ranking is usually
  // more accurate than a vector-only shortlist. This avoids hiding genuinely
  // strong matches that score well on education, trajectory, and experience
  // but were cut too early by the semantic pre-filter.
  if (allJobs.length > 0 && allJobs.length <= 600) {
    return postWorkerMessage('recommendJobs', { candidate, jobs: allJobs, limit });
  }

  if (candidate.embedding_vector) {
    try {
      // 1. Attempt Server-Side Vector Match (no hard country filter — let 6-pillar constraint scoring handle location)
      const { data: rpcMatches, error } = await supabase.rpc('match_jobs', {
        query_embedding: candidate.embedding_vector,
        match_threshold: 0.35, // Wider net so structured scoring can still surface excellent matches
        match_count: Math.max(limit * 8, 60), // Fetch a deeper shortlist before final re-ranking
        filter_country: null
      });

      if (error) throw error;

      if (rpcMatches) {
        // Fetch full job details
        const jobIds = rpcMatches.map((m: any) => m.id);
        const { data: jobDetails } = await supabase.from('jobs').select('*').in('id', jobIds);

        if (jobDetails) {
          const jobs = jobDetails.map(d => {
            const profile = d.content as JobProfile;
            if (!profile.embedding_vector && d.embedding) {
              try {
                const vec: number[] = typeof d.embedding === 'string' ? JSON.parse(d.embedding) : d.embedding;
                if (Array.isArray(vec) && vec.length > 0) profile.embedding_vector = vec;
              } catch { /* ignore */ }
            }
            return profile;
          });
          return jobs
            .map(job => {
              const scoreDetails = calculateMatchScore(job, candidate); // Full 6-pillar score
              return {
                job,
                score: scoreDetails.finalScore,
                explanation: "Ranked based on semantic affinity and structured profile fit."
              };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
        }
      }
    } catch (err) {
      console.warn("RPC 'match_jobs' unavailable or failed. Falling back to worker.", err);
    }
  }

  // 2. Fallback: Legacy Worker Approach
  // This is used if pgvector is not enabled or if we want to re-rank everything client side.
  console.log("Using Client-Side Worker Matching (Slow fallback)");
  return postWorkerMessage('recommendJobs', { candidate, jobs: allJobs, limit });
};

export { isEligible, calculateMatchScore } from '../utils/matchingUtils';
