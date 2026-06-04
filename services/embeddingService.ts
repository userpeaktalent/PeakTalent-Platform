
import { JobProfile, CandidateProfile } from '../types';
import { buildCandidateCanonicalText, buildJobCanonicalText } from '../utils/canonicalBuilders';
import { getGenerativeModel } from './geminiClient';

// Use gemini-embedding-2-preview for advanced multimodal semantics.
// We strictly require 3072 dimensions which leverages its Matryoshka Representation Learning (MRL).
export const EMBEDDING_MODEL_ID = 'models/gemini-embedding-2-preview';
export const EMBEDDING_VERSION = 'v2.3.0';

/**
 * Generates a SHA-256 hash of the input text for change detection.
 */
export const generateHash = async (text: string): Promise<string> => {
  // Prefer WebCrypto SHA-256 when available (secure contexts).
  if (typeof crypto !== 'undefined' && crypto?.subtle?.digest) {
    const msgUint8 = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback for insecure contexts (e.g. local HTTP/LAN): deterministic 32-bit hash.
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return `fnv32-${(h >>> 0).toString(16).padStart(8, '0')}`;
};

/**
 * Calls Gemini Embedding API with retry logic and backoff.
 *
 * taskType controls how the vector is optimised:
 *   - RETRIEVAL_DOCUMENT: for job profiles (the "document" being searched)
 *   - RETRIEVAL_QUERY:    for candidate profiles (the "query" searching for a job)
 * These two task types share a common embedding space so cosine similarity
 * between them correctly reflects query-document relevance — better discrimination
 * than SEMANTIC_SIMILARITY which treats both sides as symmetric documents.
 */
export const getEmbedding = async (
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY' = 'SEMANTIC_SIMILARITY'
): Promise<number[]> => {
  if (!text.trim()) return [];

  const purpose =
    taskType === 'RETRIEVAL_DOCUMENT'
      ? 'job_embedding_generation'
      : taskType === 'RETRIEVAL_QUERY'
        ? 'candidate_embedding_generation'
        : 'semantic_embedding_generation';

  const model = getGenerativeModel({ model: EMBEDDING_MODEL_ID, purpose });

  const maxRetries = 3;
  let delay = 1000;

  const EMBEDDING_DIMS = 3072; // Must match DB pgvector column
  const normalizeDims = (values: number[]): number[] => {
    const trimmed = values.slice(0, EMBEDDING_DIMS);
    if (trimmed.length === EMBEDDING_DIMS) return trimmed;
    return [...trimmed, ...new Array(EMBEDDING_DIMS - trimmed.length).fill(0)];
  };

  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await model.embedContent({
        content: { parts: [{ text }], role: 'user' },
        taskType,
        outputDimensionality: EMBEDDING_DIMS,
      });
      const embedding = result.embedding;

      if (!embedding || !embedding.values) {
        throw new Error('Malformed embedding response: missing values');
      }

      // Truncate to match DB column (Matryoshka truncation is supported)
      return normalizeDims(Array.from(embedding.values));
    } catch (e) {
      const isLastAttempt = i === maxRetries - 1;
      console.warn(`[Embedding] Attempt ${i + 1} failed. ${isLastAttempt ? 'Giving up.' : 'Retrying...'}`);

      if (isLastAttempt) {
        // Fallback: plain call without advanced params (model defaults to 3072 dims)
        try {
          const basicResult = await model.embedContent({
            content: { parts: [{ text }], role: 'user' },
          });
          const basicEmbedding = basicResult.embedding;
          if (basicEmbedding?.values) {
            return normalizeDims(Array.from(basicEmbedding.values));
          }
        } catch { /* basic call also failed — fall through */ }
        throw e;
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  return [];
};

/**
 * Detects if a profile needs a new embedding, fetches it, and attaches metadata.
 * Returns the profile (enriched or original) without throwing to ensure save flow continues.
 */
export const attachEmbeddingMetadata = async <T extends JobProfile | CandidateProfile>(
  profile: T,
  type: 'job' | 'candidate'
): Promise<T> => {
  try {
    // Keep both sides deterministic and structurally aligned for profile-to-profile ranking.
    const canonicalText = type === 'job'
      ? buildJobCanonicalText(profile as JobProfile)
      : buildCandidateCanonicalText(profile as CandidateProfile);

    const newHash = await generateHash(canonicalText);

    // Respect candidate opt-out of AI matching consent
    if (type === 'candidate' && (profile as CandidateProfile).matching_consent === false) {
      profile.embedding_vector = undefined;
      profile.embedding_input_hash = undefined;
      profile.embedding_model = undefined;
      profile.embedding_version = undefined;
      return profile;
    }

    // Skip if nothing meaningful has changed
    const hasEmbedding = !!profile.embedding_vector && profile.embedding_vector.length > 0;
    const sameHash = profile.embedding_input_hash === newHash;
    const sameVersion = profile.embedding_version === EMBEDDING_VERSION;

    if (hasEmbedding && sameHash && sameVersion) {
      return profile;
    }

    // Jobs are RETRIEVAL_DOCUMENT (the indexed item), candidates are RETRIEVAL_QUERY
    // (the searcher). These task types share a common space for cosine comparison and
    // produce far better discrimination than symmetric SEMANTIC_SIMILARITY on both sides.
    const embeddingTaskType = type === 'job' ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_QUERY';

    // Attempt re-embedding
    console.log(`[Embedding] Recomputing for ${type} ${profile.id} (${embeddingTaskType}). Hash: ${newHash.substring(0, 8)}`);

    // Try canonical text first; if the API rejects it (e.g. token limit exceeded),
    // fall back to a short descriptive string — the same strategy used by fix scripts.
    let vector: number[] = [];
    try {
      vector = await getEmbedding(canonicalText, embeddingTaskType);
    } catch (apiError) {
      console.warn(`[Embedding] Canonical text failed for ${type} ${profile.id}, trying short fallback:`, apiError);
    }

    if (!vector.length) {
      const fallbackText = type === 'job'
        ? `${(profile as JobProfile).seniority_level || ''} ${(profile as JobProfile).title || (profile as JobProfile).job_function || 'role'} at ${(profile as JobProfile).company_name || 'a company'}`
        : `${(profile as CandidateProfile).current_seniority_level || ''} ${(profile as CandidateProfile).current_job_function || 'professional'} with ${(profile as CandidateProfile).total_years_experience || 0} years experience`;
      try {
        vector = await getEmbedding(fallbackText, embeddingTaskType);
      } catch (fallbackError) {
        console.error(`[Embedding] Fallback also failed for ${type} ${profile.id}:`, fallbackError);
      }
    }

    if (vector.length > 0) {
      profile.embedding_vector = vector;
      profile.embedding_input_hash = newHash;
      profile.embedding_model = EMBEDDING_MODEL_ID;
      profile.embedding_version = EMBEDDING_VERSION;
      profile.embedding_updated_at = new Date().toISOString();
    }
  } catch (logicError) {
    console.error(`[Embedding] Fatal logic error processing ${type}:`, logicError);
  }

  return profile;
};
