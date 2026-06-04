
import { JOB_PROFILE_SCHEMA, CANDIDATE_PROFILE_SCHEMA_CV, CANDIDATE_PROFILE_SCHEMA_FINAL } from '../constants';
import { JobProfile, CandidateProfile, ChatMessage, QuizQuestion, TechnicalTest } from '../types';
import { attachEmbeddingMetadata } from './embeddingService';
import { getModel } from '../config/aiModels';
import { GeminiProxyError, getGenerativeModel, generateContentRaw, type GeminiContent } from './geminiClient';
import { readFileAsText, renderPdfPagesAsImages } from '../utils/fileReader';
import { supabase } from './supabaseClient';

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Robustly extracts JSON from a string, handling markdown code blocks and common LLM artifacts.
 */
export const cleanJson = (text: string | undefined): string => {
  if (!text) return "{}";
  let clean = text.trim();
  const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) clean = match[1];
  return clean.trim();
};

const buildCvExtractionPrompt = (cvSource: string) => `Extract ONE structured Candidate Profile JSON from the provided CV Text.
    
    SCHEMA: ${JSON.stringify(CANDIDATE_PROFILE_SCHEMA_CV, null, 2)}

    CRITICAL INSTRUCTIONS:
    1. 'id': Generate 'cand_' + random suffix.
    2. 'experiences': Extract ALL roles. 
       - 'is_current_position': True if no end date or "Present".
       - 'description': Summarize key achievements.
       - Also provide 'description_it' and 'description_en' with the same meaning in Italian and English.
    3. 'skills' (Technical Domain): Extract core competencies (e.g. Project Management, Circuit Design).
        - 'level': Infer level from these options: 2=Novice, 4=Competent, 6=Proficient, 8=Expert, 10=Master / Leading SME. Use even numbers for levels; odd numbers can be used for intermediate states.
       - 'rank': Order by how central the skill is to the candidate's professional identity and the bulk of their work experience. A skill they have exercised across multiple roles, or that defines their primary job title, ranks highest. Skills mentioned only in passing or in a bare list rank lowest.
       - 'level_source': Always set to "cv_only".
       - 'level_confidence': CRITICAL — assess how certain you are about the assigned level:
         * "high" = skill described with depth indicators: metrics, years of use, team size, project outcomes, certifications
         * "medium" = skill mentioned in job role descriptions but without specific depth evidence
         * "low" = skill only appears in a bare list (e.g. "Skills: Python, Java, SQL") with NO context in the experiences
    4. 'it_skills' (Software/Code): Extract tools, languages, software. Rank by how frequently and centrally the tool appears in the candidate's actual work experience — tools actively used in described projects rank first, tools only listed in a skills section without any contextual use rank last. Apply same level_source and level_confidence rules.
    5. 'education': Extract all degrees. If you summarize what the candidate studied or did there, provide 'description', 'description_it', and 'description_en'.
    6. 'residence': Infer Country and City.
    7. 'industry_experience': Infer the industries/sectors the candidate has ACTUALLY worked in based on their experiences (e.g. "FinTech", "SaaS", "Automotive", "Healthcare"). This is different from aspirational preferences.
    8. Generate 'summary_text', 'summary_text_it', and 'summary_text_en'. The Italian and English versions must contain the same facts and level of detail.
    
    CV TEXT: ${cvSource}`;

/** Thrown when a Gemini call is cancelled via an AbortSignal (e.g. component unmount). */
export class GeminiAbortError extends Error {
  constructor(message: string = 'Gemini request aborted') {
    super(message);
    this.name = 'GeminiAbortError';
  }
}

/** Treat DOMException 'AbortError' and our GeminiAbortError uniformly. */
export const isAbortError = (error: unknown): boolean => {
  if (!error) return false;
  if (error instanceof GeminiAbortError) return true;
  const name = (error as { name?: string } | null)?.name;
  return name === 'AbortError' || name === 'GeminiAbortError';
};

/** Abortable sleep so retry backoff doesn't keep a cancelled flow alive. */
const sleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new GeminiAbortError()); return; }
  const timer = setTimeout(() => {
    if (signal) signal.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  const onAbort = () => {
    clearTimeout(timer);
    reject(new GeminiAbortError());
  };
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
});

/**
 * Races a promise against a timeout AND an optional AbortSignal, so callers can cancel
 * long-running Gemini requests (CV parsing, quiz generation) on component unmount.
 */
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string, signal?: AbortSignal): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  let onAbort: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[Gemini] Timed out after ${ms}ms: ${label}`)), ms);
    if (signal) {
      if (signal.aborted) { reject(new GeminiAbortError()); return; }
      onAbort = () => reject(new GeminiAbortError());
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  });
};

// ---------------------------------------------------------------------------
// Lightweight runtime validators for AI-generated JSON
// These prevent silent type confusion when Gemini returns malformed output.
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function assertJobProfile(data: unknown, context: string): asserts data is JobProfile {
  if (!isObject(data)) throw new Error(`[${context}] Expected object, got ${typeof data}`);
  const hasTitle = typeof data.title === 'string' && !!data.title;
  const hasLegacyRole = typeof data.role === 'string' && !!data.role;
  if (!hasTitle && !hasLegacyRole) throw new Error(`[${context}] Missing required field: title`);
  if (!isObject(data.constraints)) throw new Error(`[${context}] Missing required field: constraints`);
}

function assertCandidateProfile(data: unknown, context: string): asserts data is CandidateProfile {
  if (!isObject(data)) throw new Error(`[${context}] Expected object, got ${typeof data}`);
  if (!isObject(data.contacts)) throw new Error(`[${context}] Missing required field: contacts`);
  if (!Array.isArray(data.skills)) throw new Error(`[${context}] Field 'skills' must be an array`);
}

function assertPartialCandidateProfile(data: unknown, context: string): asserts data is Partial<CandidateProfile> {
  if (!isObject(data)) throw new Error(`[${context}] Expected object, got ${typeof data}`);
}

// ── CV output sanitization ────────────────────────────────────────────────────
// Allowed top-level keys on a parsed CV profile (mirrors CandidateProfile).
const CV_ALLOWED_KEYS = new Set([
  'id', 'personal_info', 'residence', 'contacts', 'current_job_function',
  'current_seniority_level', 'target_job_functions', 'industry_experience',
  'total_years_experience', 'notice_period_months', 'job_search_status',
  'skills', 'it_skills', 'soft_skills', 'languages', 'certifications',
  'preferences', 'summary_text', 'summary_text_it', 'summary_text_en', 'canonical_career_text', 'experiences',
  'education', 'profile_visibility', 'terms_and_conditions_accepted',
  'ai_refined', 'ai_refined_at', 'test_results', 'embedding_vector',
  'embedding_model', 'embedding_generated_at',
]);

// GDPR Art. 9 special-category field names — strip wherever they appear.
const SENSITIVE_FIELD_NAMES = new Set([
  'pronoun', 'photo', 'photo_url', 'avatar', 'image',
  'date_of_birth', 'birth_date', 'dob', 'age',
  'gender', 'sex',
  'marital_status', 'civil_status', 'relationship_status',
  'nationality', 'citizenship',
  'disability', 'health', 'health_status', 'medical',
  'religion', 'faith',
  'ethnicity', 'race', 'ethnic_origin',
  'criminal_record', 'criminal_history',
  'political_views', 'political_opinion',
]);

function stripSensitiveKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripSensitiveKeys);
  if (!isObject(obj)) return obj;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!SENSITIVE_FIELD_NAMES.has(k.toLowerCase())) {
      cleaned[k] = stripSensitiveKeys(v);
    }
  }
  return cleaned;
}

function sanitizeExtractedProfile(raw: Partial<CandidateProfile>): Partial<CandidateProfile> {
  // 1. Remove top-level keys not in the whitelist
  const whitelisted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (CV_ALLOWED_KEYS.has(k)) whitelisted[k] = v;
  }
  // 2. Recursively strip GDPR special-category fields from all nested objects
  return stripSensitiveKeys(whitelisted) as Partial<CandidateProfile>;
}

// ── CV parse audit log ────────────────────────────────────────────────────────
const CV_PARSE_PROMPT_VERSION = 'v1'; // bump when buildCvExtractionPrompt changes significantly

async function logCvParse(params: {
  inputCharCount: number;
  outputFieldNames: string[];
  modelId: string;
  success: boolean;
  errorMessage?: string;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('cv_parse_logs').insert({
      profile_id: user?.id ?? null,
      input_char_count: params.inputCharCount,
      output_field_names: params.outputFieldNames,
      model_id: params.modelId,
      prompt_version: CV_PARSE_PROMPT_VERSION,
      success: params.success,
      error_message: params.errorMessage ?? null,
    });
  } catch {
    // Non-fatal — never block the user flow for a logging failure
  }
}

function assertTechnicalTest(data: unknown, context: string): asserts data is TechnicalTest {
  if (!isObject(data)) throw new Error(`[${context}] Expected object, got ${typeof data}`);
  if (!Array.isArray(data.questions)) throw new Error(`[${context}] Field 'questions' must be an array`);
}

const parseYearMonthToDate = (value?: string | null): Date | null => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === 'present' || normalized === 'current' || normalized === 'ongoing') {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  const match = normalized.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }

  return new Date(Date.UTC(year, monthIndex, 1));
};

const calculateTotalYearsExperienceFromExperiences = (experiences?: CandidateProfile['experiences']): number | undefined => {
  if (!Array.isArray(experiences) || experiences.length === 0) return undefined;

  const now = new Date();
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const totalMonths = experiences.reduce((sum, experience) => {
    const startDate = parseYearMonthToDate(experience.from);
    const endDate = experience.is_current_position
      ? currentMonth
      : parseYearMonthToDate(experience.to) || currentMonth;

    if (!startDate || !endDate || endDate < startDate) {
      return sum;
    }

    const durationInMonths =
      (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
      (endDate.getUTCMonth() - startDate.getUTCMonth()) +
      1;

    return sum + Math.max(0, durationInMonths);
  }, 0);

  if (totalMonths <= 0) return undefined;

  return Math.round((totalMonths / 12) * 10) / 10;
};

const isRetryableGeminiError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  return lower.includes('[503') ||
    lower.includes(' 503 ') ||
    lower.includes('high demand') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('[429') ||
    lower.includes(' 429 ') ||
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('resource_exhausted');
};

const parseRetryDelayMsFromMessage = (message: string): number | undefined => {
  const retryMatch = message.match(/retry\s+in\s+([0-9.]+)\s*(ms|s|sec|seconds)?/i);
  if (!retryMatch) return undefined;

  const amount = Number(retryMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const unit = (retryMatch[2] || 's').toLowerCase();
  const milliseconds = unit === 'ms' ? amount : amount * 1000;
  return Math.ceil(milliseconds);
};

const getGeminiRetryDelayMs = (error: unknown, attempt: number): number => {
  if (error instanceof GeminiProxyError && error.retryAfterMs) {
    return Math.min(60_000, Math.max(30_000, error.retryAfterMs));
  }

  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  const parsedDelay = parseRetryDelayMsFromMessage(message);

  if (
    (error instanceof GeminiProxyError && error.status === 429) ||
    lower.includes('[429') ||
    lower.includes(' 429 ') ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('quota')
  ) {
    return Math.min(60_000, Math.max(30_000, parsedDelay || 30_000));
  }

  if (
    (error instanceof GeminiProxyError && error.status === 503) ||
    lower.includes('[503') ||
    lower.includes(' 503 ') ||
    lower.includes('high demand') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded')
  ) {
    return Math.min(30_000, Math.max(5_000, parsedDelay || 5_000 * (attempt + 1)));
  }

  return 1200 * (attempt + 1);
};

const getModelFallbacks = (modelId: string): string[] => {
  const fallbacks = [modelId];

  if (modelId !== 'gemini-2.5-flash-lite') {
    fallbacks.push('gemini-2.5-flash-lite');
  }

  if (modelId !== 'gemini-2.0-flash') {
    fallbacks.push('gemini-2.0-flash');
  }

  return Array.from(new Set(fallbacks));
};

const generateWithMetrics = async (
  prompt: string,
  schema?: any,
  systemInstruction?: string,
  expectJson: boolean = false,
  /** Per-attempt timeout in ms. CV parsing needs more time than a quick chat reply. */
  timeoutMs: number = 60000,
  /** Optional AbortSignal so callers can cancel in-flight requests (unmount, navigation). */
  signal?: AbortSignal,
  purpose: string = 'general_generation'
): Promise<string> => {
  if (signal?.aborted) throw new GeminiAbortError();
  const preferredModelId = getModel('profileSummary');

  // Append strict JSON instruction since we can't use responseMimeType in older models safely
  const fullPrompt = (expectJson || schema)
    ? `${prompt}\n\nIMPORTANT: Output ONLY valid JSON. No markdown, no explanations.`
    : prompt;

  let lastError: unknown;

  for (const modelId of getModelFallbacks(preferredModelId)) {
    const modelConfig: any = { model: modelId };
    if (expectJson || schema) {
      modelConfig.generationConfig = { responseMimeType: "application/json" };
    }
    const model = getGenerativeModel({ ...modelConfig, purpose });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (signal?.aborted) throw new GeminiAbortError();
      try {
        const start = performance.now();
        const result = await withTimeout(model.generateContent(fullPrompt), timeoutMs, modelId, signal);
        const end = performance.now();
        const response = await result.response;
        const text = response.text();

        if (typeof window !== 'undefined') {
          const event = new CustomEvent('gemini-usage', {
            detail: {
              model: modelId,
              latency: Math.round(end - start),
              tokens: result.response.usageMetadata?.totalTokenCount || 0,
              timestamp: new Date().toISOString()
            }
          });
          window.dispatchEvent(event);
        }

        return text;
      } catch (error) {
        lastError = error;

        // Abort short-circuits all retries and model fallbacks — we want the caller
        // to see the cancellation immediately rather than wait out the full backoff.
        if (isAbortError(error)) throw error;

        if (!isRetryableGeminiError(error)) {
          throw error;
        }

        const isLastAttemptForModel = attempt === 2;
        if (!isLastAttemptForModel) {
          await sleep(getGeminiRetryDelayMs(error, attempt), signal);
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini request failed after retries.');
};

export const generateCanonicalCareerText = async (profile: Partial<CandidateProfile>, chatHistory: string, signal?: AbortSignal): Promise<string> => {
  const text = await generateWithMetrics(
    `GENERATE CANONICAL CAREER TEXT.
    
    Objective: Create a single, bias-free, factual narrative of the candidate's career.
    This text will be used for SEMANTIC MATCHING against job descriptions.

    Input Data:
    - Structured Profile: ${JSON.stringify(profile)}
    - Chat Verification context: ${chatHistory}

    Instructions:
    1. Write in the third person (e.g., "The candidate...", "They...").
    2. Focus on DETAILED TECHNICAL RESPONSIBILITIES and HARD SKILLS used in context.
    3. Resolve ambiguities: If the chat clarified a skill level, reflect the verified level in the text.
    4. Structure:
       - Summary of Seniority and Core Function.
       - Chronological walkthrough of key roles, focusing on *what they actually did*.
       - Validated Hard Skills list (inline or bulleted).
       - Soft Skills verified by interaction.
    5. NO FLUFF. No marketing buzzwords like "visionary", "passionate". Stick to facts: "Managed X", "Built Y using Z", "Scaled system to N users".

    Output: Pure text.`,
    null,
    undefined,
    false,
    60000,
    signal,
    'canonical_career_generation'
  );
  return text;
};

export const translateProfessionalSummary = async (
  summaryText: string,
  targetLanguage: 'it' | 'en',
  signal?: AbortSignal,
): Promise<string> => {
  const normalizedSummary = summaryText.trim();
  if (!normalizedSummary) {
    return '';
  }

  const targetLanguageLabel = targetLanguage === 'it' ? 'Italian' : 'English';
  const translated = await generateWithMetrics(
    `Translate the following professional candidate summary into ${targetLanguageLabel}.

Rules:
1. Preserve the original meaning, facts, tone, and level of detail.
2. Keep it concise and natural, in 2-3 sentences.
3. If the text is already in ${targetLanguageLabel}, lightly normalize it and return it in ${targetLanguageLabel}.
4. Do not add information, headings, bullets, or explanations.
5. Return only the translated summary text.

SUMMARY:
${normalizedSummary}`,
    null,
    undefined,
    false,
    30000,
    signal,
    `candidate_summary_translation_${targetLanguage}`
  );

  return translated.trim();
};

export const translateCandidateText = async (
  sourceText: string,
  targetLanguage: 'it' | 'en',
  context: 'professional summary' | 'work experience description' | 'education description' = 'professional summary',
  signal?: AbortSignal,
): Promise<string> => {
  const normalizedText = sourceText.trim();
  if (!normalizedText) {
    return '';
  }

  if (context === 'professional summary') {
    return translateProfessionalSummary(normalizedText, targetLanguage, signal);
  }

  const targetLanguageLabel = targetLanguage === 'it' ? 'Italian' : 'English';
  const translated = await generateWithMetrics(
    `Translate the following candidate ${context} into ${targetLanguageLabel}.

Rules:
1. Preserve the original meaning, facts, dates, tools, names, and level of detail.
2. Keep the text concise, natural, and professional.
3. If the text is already in ${targetLanguageLabel}, lightly normalize it and return it in ${targetLanguageLabel}.
4. Do not add information, headings, bullets, or explanations.
5. Return only the translated text.

TEXT:
${normalizedText}`,
    null,
    undefined,
    false,
    30000,
    signal,
    `candidate_${context.replace(/\s+/g, '_')}_translation_${targetLanguage}`
  );

  return translated.trim();
};

export const summarizeJobDescription = async (description: string, language: 'it' | 'en' = 'en', signal?: AbortSignal): Promise<JobProfile> => {
  const languageInstruction = language === 'it'
    ? 'LANGUAGE: Write all free-text fields (summary_text, job_description, full_job_posting_description) in Italian.'
    : 'LANGUAGE: Write all free-text fields (summary_text, job_description, full_job_posting_description) in English.';
  const text = await generateWithMetrics(
    `Analyze the provided text. Create a COMPLETE Job Profile JSON matching the known schema.
    Structure matches the previously defined interfaces.

    SCHEMA: ${JSON.stringify(JOB_PROFILE_SCHEMA, null, 2)}

    CRITICAL INSTRUCTIONS:
    1. Generate unique ID 'job_' + random suffix.
    2. 'title': Identify the exact Job Title.
    3. 'seniority_level': Must be one of: intern, junior, mid, senior, lead. Infer from years of experience if not explicit.
    4. 'industry': Extract relevant industry sectors as an ARRAY of strings.
    5. 'skills': Extract TECHNICAL skills (non-IT).
        - 'level': Infer level from these options: 2=Novice, 4=Competent, 6=Proficient, 8=Expert, 10=Master / Leading SME. Use even numbers for primary levels; odd numbers (3, 5, 7, 9) may be used for intermediate states.
       - 'must': True if "required", "essential", "must have". False if "nice to have", "plus".
    6. 'it_skills': Extract SOFTWARE/PROGRAMMING skills. Same level/must rules.
    7. 'soft_skills': Extract interpersonal skills.
    8. 'constraints':
       - Salary: Null if not mentioned.
       - Location: Infer City/Country.
       - Remote: full_remote, hybrid, or none.
    9. ${languageInstruction}

    Input: ${description}`,
    null,
    undefined,
    true,
    60000,
    signal,
    'job_profile_generation'
  );

  const jsonString = cleanJson(text);
  const parsed: unknown = JSON.parse(jsonString);
  assertJobProfile(parsed, 'summarizeJobDescription');
  const profile = {
    ...(parsed as any),
    title: (parsed as any).title || (parsed as any).role || '',
    requires_quiz: false,
  } as JobProfile;

  // Force a valid UUID to prevent database insertion errors with 'job_...' format
  if (!profile.id || profile.id.startsWith('job_')) {
    profile.id = generateUUID();
  }

  return await attachEmbeddingMetadata(profile, 'job');
};


const shuffleQuestionOptions = (question: QuizQuestion): QuizQuestion => {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...question,
    options: order.map(i => question.options[i]),
    options_en: question.options_en?.length === 4 ? order.map(i => question.options_en![i]) : question.options_en,
    correct_option_index: order.indexOf(question.correct_option_index),
  };
};

export const rankCandidateSkills = async (
  skills: CandidateProfile['skills'],
  itSkills: CandidateProfile['it_skills'],
  experiences: CandidateProfile['experiences'],
  signal?: AbortSignal
): Promise<{ skills: CandidateProfile['skills'], it_skills: CandidateProfile['it_skills'] }> => {
  if (skills.length === 0 && itSkills.length === 0) {
    return { skills, it_skills: itSkills };
  }

  const prompt = `Rank the candidate's skills by professional importance.

CANDIDATE EXPERIENCES:
${(experiences || []).map(e => `- ${e.role} at ${e.company} (${e.from} → ${e.to}): ${e.description || 'no description'}`).join('\n') || 'None provided'}

TECHNICAL SKILLS TO RANK:
${skills.map((s, i) => `${i + 1}. "${s.skill_name}" (level: ${s.level}/10)`).join('\n') || 'None'}

IT/SOFTWARE SKILLS TO RANK:
${itSkills.map((s, i) => `${i + 1}. "${s.skill_name}" (level: ${s.level}/10)`).join('\n') || 'None'}

RANKING RULES:
- Rank within each category independently (rank 1 = most important in that category).
- A skill exercised across multiple roles, or that defines the primary job title, ranks highest.
- Skills that appear only in a bare list with no evidence in the experiences rank lowest.
- Higher claimed level is a secondary signal, but experience evidence takes priority.
- All ranks must be unique integers starting from 1. No ties.

Return ONLY this JSON (no markdown, no explanation):
{
  "skills": [{"skill_name": "...", "rank": 1}, ...],
  "it_skills": [{"skill_name": "...", "rank": 1}, ...]
}
Every skill_name must exactly match the input list.`;

  const raw = await generateWithMetrics(prompt, null, undefined, true, 30000, signal, 'candidate_skill_ranking');
  const parsed = JSON.parse(cleanJson(raw));

  const applyRanks = <T extends { skill_name: string; rank?: number }>(
    original: T[],
    ranked: { skill_name: string; rank: number }[]
  ): T[] => {
    const rankMap = new Map(ranked.map(r => [r.skill_name.toLowerCase().trim(), r.rank]));
    return original.map(s => ({
      ...s,
      rank: rankMap.get(s.skill_name.toLowerCase().trim()) ?? s.rank,
    }));
  };

  return {
    skills: applyRanks(skills, parsed.skills || []),
    it_skills: applyRanks(itSkills, parsed.it_skills || []),
  };
};

export const generateTechnicalTestForJob = async (job: JobProfile, questionCount = 20, signal?: AbortSignal): Promise<TechnicalTest> => {
  try {
    const text = await generateWithMetrics(
      `Create a role-specific technical screening quiz. Every question must test actual knowledge — there must be one objectively correct answer that requires knowing the subject to identify correctly.

GOAL:
- Generate exactly ${questionCount} multiple-choice questions.
- Focus on the tools, technical concepts, workflows, and competencies explicitly required by the job profile.
- Prioritize must-have skills. Distribute questions proportionally to skill importance (more questions on must-have, fewer on nice-to-have).
- NEVER ask the candidate to self-rate their skill level. Ask questions they can only answer correctly if they genuinely know the subject.
- GOOD question: "In Lean Manufacturing, which metric measures the ratio of value-added time to total lead time?" → one objectively correct answer.
- BAD question: "How well do you know Lean Manufacturing?" → self-assessment, useless, forbidden.

DIFFICULTY CALIBRATION — use the required level for each skill (provided in the job profile) to set question difficulty:
- Required level 2–4 (Novice/Competent): difficulty 1–2. Test basic understanding: core definitions, primary purpose, main use cases. Not trivial — the candidate must know the subject to answer correctly, but deep hands-on experience is not required.
- Required level 5–7 (Proficient): difficulty 3. Test practical application: choosing the right approach, interpreting results, understanding workflows, recognizing common errors.
- Required level 8–10 (Expert/Master): difficulty 4–5. Test deep knowledge: architectural decisions, edge cases, failure modes, optimization trade-offs, and why one approach is superior to another given specific constraints.

QUESTION TYPES — include a mix of:
1. Concept application — given a scenario, what is the correct approach, tool, or method?
2. Technical specifics — what does X produce, require, or imply in this context?
3. Trade-off judgment — which option is most appropriate given the stated constraint?
4. Workflow/process — what is the correct step, sequence, or output in this process?

RULES:
- Return ONLY valid JSON.
- Each question must have exactly 4 answer options, exactly 1 correct.
- Wrong options must be plausible — a candidate without knowledge should not be able to guess easily.
- Use precise technical language appropriate to the seniority level of the role.
- Do not ask abstract theory unless it is directly tied to execution in this specific role.
- The default language must be Italian.
- Also provide English variants so the UI can switch language without regenerating.
- Keep Italian and English semantically aligned question-by-question.

OUTPUT SCHEMA:
{
  "questions": [
    {
      "id": string,
      "text": string,                // Italian by default
      "options": [string, string, string, string], // Italian by default
      "text_it": string,
      "options_it": [string, string, string, string],
      "text_en": string,
      "options_en": [string, string, string, string],
      "correct_option_index": number,
      "difficulty": number
    }
  ]
}

JOB PROFILE:
${JSON.stringify(job, null, 2)}`,
      null,
      undefined,
      true,
      90000,
      signal,
      'technical_test_generation'
    );

    const parsedTest: unknown = JSON.parse(cleanJson(text));
    assertTechnicalTest(parsedTest, 'generateTechnicalTestForJob');

    const normalizedQuestions: QuizQuestion[] = ((parsedTest as { questions?: any[] }).questions || [])
      .slice(0, questionCount)
      .map((question: any, index: number): QuizQuestion => ({
        id: String(question.id || `generated_${job.id}_${index + 1}`),
        text: String(question.text_it || question.text || ''),
        options: Array.isArray(question.options_it)
          ? question.options_it.map((option: any) => String(option))
          : (Array.isArray(question.options) ? question.options.map((option: any) => String(option)) : []),
        text_it: String(question.text_it || question.text || ''),
        options_it: Array.isArray(question.options_it)
          ? question.options_it.map((option: any) => String(option))
          : (Array.isArray(question.options) ? question.options.map((option: any) => String(option)) : []),
        text_en: String(question.text_en || question.text || ''),
        options_en: Array.isArray(question.options_en)
          ? question.options_en.map((option: any) => String(option))
          : (Array.isArray(question.options) ? question.options.map((option: any) => String(option)) : []),
        correct_option_index: Number.isFinite(question.correct_option_index) ? Number(question.correct_option_index) : 0,
        difficulty: Number.isFinite(question.difficulty) ? Number(question.difficulty) : 3,
      }))
      .filter((question: QuizQuestion) =>
        question.text &&
        question.options.length === 4 &&
        (!question.options_en || question.options_en.length === 4)
      )
      .map(shuffleQuestionOptions);

    if (normalizedQuestions.length < questionCount) {
      throw new Error(
        `Gemini returned only ${normalizedQuestions.length} valid questions out of ${questionCount} required. Please try again.`
      );
    }

    return {
      questions: normalizedQuestions,
      generated_at: new Date().toISOString(),
      generated_from_job_title: job.title,
      time_limit_seconds: questionCount * 60,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw error;
  }
};



export const regenerateSingleQuestion = async (
  job: JobProfile,
  existingQuestions: QuizQuestion[],
  slotIndex: number
): Promise<QuizQuestion> => {
  const existingTexts = existingQuestions
    .map((q, i) => i !== slotIndex ? `- ${q.text_it || q.text}` : null)
    .filter(Boolean)
    .join('\n');

  const text = await generateWithMetrics(
    `Generate exactly ONE new multiple-choice question for a technical screening quiz.

REQUIREMENTS:
- Test actual knowledge with one objectively correct answer.
- NEVER ask the candidate to self-rate their skill level.
- Must be different from the existing questions listed below.
- Calibrate difficulty based on the skill levels in the job profile: level 2–4 → difficulty 1–2 (basic understanding, not trivial), level 5–7 → difficulty 3 (practical application), level 8–10 → difficulty 4–5 (trade-offs, edge cases, deep knowledge).
- 4 answer options, exactly 1 correct. Wrong options must be plausible.
- Default language: Italian. Also provide English variant.

EXISTING QUESTIONS — do not duplicate:
${existingTexts}

JOB PROFILE:
${JSON.stringify(job, null, 2)}

OUTPUT: a single JSON object (not an array) matching this schema:
{
  "id": string,
  "text": string,
  "options": [string, string, string, string],
  "text_it": string,
  "options_it": [string, string, string, string],
  "text_en": string,
  "options_en": [string, string, string, string],
  "correct_option_index": number,
  "difficulty": number
}`,
    null,
    undefined,
    true,
    30000,
    undefined,
    'single_question_regeneration'
  );

  const parsed = JSON.parse(cleanJson(text));
  const question: QuizQuestion = {
    id: parsed.id || `regen_${job.id}_${slotIndex}_${Date.now()}`,
    text: String(parsed.text_it || parsed.text || ''),
    options: Array.isArray(parsed.options_it) ? parsed.options_it.map(String) : (Array.isArray(parsed.options) ? parsed.options.map(String) : []),
    text_it: String(parsed.text_it || parsed.text || ''),
    options_it: Array.isArray(parsed.options_it) ? parsed.options_it.map(String) : [],
    text_en: String(parsed.text_en || parsed.text || ''),
    options_en: Array.isArray(parsed.options_en) ? parsed.options_en.map(String) : [],
    correct_option_index: typeof parsed.correct_option_index === 'number' ? parsed.correct_option_index : 0,
    difficulty: typeof parsed.difficulty === 'number' ? parsed.difficulty : 3,
  };
  return shuffleQuestionOptions(question);
};

export const summarizeCandidateProfile = async (baseInfo: Partial<CandidateProfile>, chatHistory: string, signal?: AbortSignal): Promise<CandidateProfile> => {
  const text = await generateWithMetrics(
    `You are a data extraction engine. Merge the EXISTING PROFILE DATA with information gathered from the CHAT INTERVIEW to produce a COMPLETE, valid CandidateProfile JSON.

MERGE RULES:
1. Chat insights take priority over empty/missing fields in the existing profile.
2. NEVER delete existing data — only add to it, verify it, or conditionally improve it based on the interview transcript.
3. Keep the existing id, contacts.email, and personal_info unless the chat explicitly corrects them.
4. SKILL LEVEL UPDATES (CRITICAL):
   - If a skill was discussed and validated in the chat interview:
     * Update 'level_source' to "chat_validated"
     * Update 'level_confidence' to "high"
     * Adjust the 'level' (1-10) based on the interview evidence: depth of answers, concrete examples, scale of projects, and terminology used
   - If a skill was NOT discussed in the interview, keep the existing level_source, level_confidence, and level unchanged
   - For NEW skills discovered during the interview, set level_source: "chat_validated", level_confidence: "high"
   - The interview may include the interviewer's final VERIFIED_SKILLS summary. Use those assessments directly if present.
5. BEHAVIORAL ANALYSIS: Deduce soft skills from scenarios described (e.g. "managed a team of 5" → Leadership).
6. Every array field (skills, it_skills, soft_skills, languages, experiences, education, certifications) must be populated — at minimum keep what exists.
7. 'industry_experience': Populate with the actual industries/sectors the candidate has worked in, inferred from experiences AND interview discussion.

EXACT OUTPUT SCHEMA (return ONLY valid JSON, no markdown):
{
  "personal_info": { "first_name": string, "last_name": string },
  "residence": { "country": string (ISO 2-letter), "city": string },
  "contacts": { "email": string, "phone": string },
  "current_job_function": string (e.g. "software_engineering", "product_management"),
  "current_seniority_level": "intern" | "junior" | "mid" | "senior" | "lead",
  "total_years_experience": number,
  "notice_period_months": number,
  "job_search_status": "actively_looking" | "open_to_opportunities" | "not_looking",
  "target_job_functions": string[],
  "industry_experience": string[],
  "skills": [{ "skill_name": string, "level": 1-10, "rank": number, "level_source": "cv_only" | "chat_validated", "level_confidence": "high" | "medium" | "low" }],
  "it_skills": [{ "skill_name": string, "level": 1-10, "rank": number, "level_source": "cv_only" | "chat_validated", "level_confidence": "high" | "medium" | "low" }],
  "soft_skills": [{ "skill_name": string }],
  "languages": [{ "language": string (ISO 2-letter), "level": "A1"|"A2"|"B1"|"B2"|"C1"|"C2" }],
  "certifications": [{ "name": string, "date": "YYYY-MM" }],
  "preferences": {
    "preferred_locations": [{ "country": string, "city": string }],
    "remote": "full_remote" | "hybrid" | "none",
    "desired_contract_types": string[],
    "industries": string[],
    "work_eligibility_countries": string[],
    "salary_eur": { "min": number, "flexibility": boolean }
  },
  "summary_text": string (2-3 sentence professional summary),
  "summary_text_it": string (Italian version of summary_text),
  "summary_text_en": string (English version of summary_text),
  "experiences": [{ "role": string, "company": string, "location": { "country": string, "city": string }, "from": "YYYY-MM", "to": "YYYY-MM" or "present", "is_current_position": boolean, "description": string, "description_it": string, "description_en": string }],
  "education": [{ "institution": string, "degree_level": "PRIMARY"|"LOWER_SECONDARY"|"UPPER_SECONDARY"|"BACHELOR"|"ITS"|"MASTER"|"PHD", "major": string, "from": "YYYY-MM", "to": "YYYY-MM", "currently_pursuing": boolean, "description": string, "description_it": string, "description_en": string }]
}

EXISTING PROFILE DATA:
${JSON.stringify(baseInfo, null, 2)}

CHAT INTERVIEW TRANSCRIPT:
${chatHistory || '(No chat interview conducted — use only existing data)'}`,
    null,
    undefined,
    true,
    120000, // Profile merge is a large prompt — allow up to 2 minutes
    signal,
    'candidate_profile_merge'
  );

  const parsedCandidate: unknown = JSON.parse(cleanJson(text));
  assertCandidateProfile(parsedCandidate, 'summarizeCandidateProfile');
  const profile = parsedCandidate;

  // Preserve critical fields from the original
  profile.id = baseInfo.id || profile.id;
  if (baseInfo.contacts?.email) {
    profile.contacts = { ...profile.contacts, email: baseInfo.contacts.email };
  }

  // Ensure arrays exist
  if (!profile.skills) profile.skills = [];
  if (!profile.it_skills) profile.it_skills = [];
  if (!profile.soft_skills) profile.soft_skills = [];
  if (!profile.languages) profile.languages = [];
  if (!profile.certifications) profile.certifications = [];
  if (!profile.experiences) profile.experiences = [];
  if (!profile.education) profile.education = [];
  if (!profile.industry_experience) profile.industry_experience = [];

  const computedExperienceYears = calculateTotalYearsExperienceFromExperiences(profile.experiences);
  if (computedExperienceYears !== undefined) {
    profile.total_years_experience = computedExperienceYears;
  }

  // Generate Canonical Career Text
  if (chatHistory && chatHistory.length > 50) {
    profile.canonical_career_text = await generateCanonicalCareerText(profile, chatHistory, signal);
  }

  return profile;
};

/** Converts a Blob to a base64 string safely using FileReader (no stack overflow). */
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // dataUrl = "data:<mime>;base64,<data>" — strip the prefix
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/**
 * Gemini-supported audio MIME types: audio/wav, audio/mp3, audio/aiff,
 * audio/aac, audio/ogg, audio/flac, audio/webm.
 * Note: audio/mp4 is also accepted by some Gemini versions.
 */
const normalizeAudioMime = (raw: string): string => {
  if (!raw) return 'audio/webm';
  if (raw.includes('ogg')) return 'audio/ogg';
  if (raw.includes('wav')) return 'audio/wav';
  if (raw.includes('mp3') || raw.includes('mpeg')) return 'audio/mp3';
  if (raw.includes('flac')) return 'audio/flac';
  if (raw.includes('aac')) return 'audio/aac';
  if (raw.includes('mp4') || raw.includes('m4a')) return 'audio/mp4';
  // webm (including webm;codecs=opus from Chrome/Firefox)
  return 'audio/webm';
};

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  const mimeType = normalizeAudioMime(audioBlob.type);

  // Convert to base64 via FileReader — safe for any blob size
  const base64Audio = await blobToBase64(audioBlob);

  const modelId = getModel('chat');
  const json = await generateContentRaw(modelId, {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Audio,
            },
          },
          {
            text: 'Transcribe this audio recording accurately. Output ONLY the transcribed text, nothing else. Do not add any commentary, punctuation corrections, or labels.',
          },
        ],
      },
    ],
  }, undefined, 'audio_transcription');

  const transcript = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  return transcript;
};


export const streamChatResponse = async (
  history: ChatMessage[],
  newMessage: string,
  type: 'general' | 'recruiter' | 'seeker',
  systemInstruction: string,
  onChunk: (chunk: string) => void
): Promise<void> => {
  const model = getGenerativeModel({
    model: getModel('chat'),
    systemInstruction: systemInstruction || undefined,
    purpose: type === 'recruiter'
      ? 'recruiter_chat'
      : type === 'seeker'
        ? 'seeker_chat'
        : 'general_chat',
  });

  // Build history: exclude the current user message (last in array) since we send it via sendMessageStream
  // Also exclude empty messages
  const rawHistory = history
    .filter(msg => msg.text.trim() !== '')
    .map(msg => ({
      role: (msg.role === 'model' ? 'model' : 'user') as 'model' | 'user',
      parts: [{ text: msg.text }]
    }));

  // Gemini requires history to start with 'user' and alternate user/model.
  // Drop any leading 'model' messages (e.g. the initialMessage from ChatWindow).
  // Then ensure strict alternation by merging consecutive same-role messages.
  let sanitized: typeof rawHistory = [];
  for (const entry of rawHistory) {
    if (sanitized.length === 0 && entry.role === 'model') {
      // Skip leading model messages — they'll be invisible to Gemini but
      // the system instruction already sets the context
      continue;
    }
    // Merge consecutive same-role messages
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === entry.role) {
      sanitized[sanitized.length - 1].parts[0].text += '\n' + entry.parts[0].text;
    } else {
      sanitized.push({ ...entry });
    }
  }

  // History must end with 'model' (Gemini expects user to send the next message)
  // If it ends with 'user', drop the last user message — it will be re-sent below
  if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === 'user') {
    sanitized.pop();
  }

  const chat = model.startChat({
    history: sanitized,
  });

  const result = await chat.sendMessageStream(newMessage);
  let received = '';
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      received += text;
      onChunk(text);
    }
  }

  // If the stream closed without emitting any text, surface it as an error so
  // the ChatWindow retry loop fires. Otherwise the user sees an empty bubble
  // and the next turn includes an empty assistant message in history, which
  // confuses the model into repeating the previous question.
  if (!received) {
    throw new Error('Gemini stream finished without producing any text.');
  }
};

export const extractCvInfo = async (cvText: string, signal?: AbortSignal): Promise<Partial<CandidateProfile>> => {
  const text = await generateWithMetrics(
    buildCvExtractionPrompt(cvText),
    null,
    undefined,
    true,
    120000, // CV parsing sends a large prompt — allow up to 2 minutes
    signal,
    'cv_text_extraction'
  );
  const parsedCv: unknown = JSON.parse(cleanJson(text));
  assertPartialCandidateProfile(parsedCv, 'extractCvInfo');

  const cvProfile = parsedCv as Partial<CandidateProfile>;
  const computedExperienceYears = calculateTotalYearsExperienceFromExperiences(cvProfile.experiences);
  if (computedExperienceYears !== undefined) {
    cvProfile.total_years_experience = computedExperienceYears;
  }

  return cvProfile;
};

const generateCvProfileFromPdf = async (file: File, signal?: AbortSignal): Promise<Partial<CandidateProfile>> => {
  const base64Pdf = await blobToBase64(file);
  const prompt = `${buildCvExtractionPrompt(
    'Read the uploaded PDF CV directly, including selectable text, scanned text, visible layout content, and any embedded document attachments if available.'
  )}\n\nIMPORTANT: Output ONLY valid JSON. No markdown, no explanations.`;
  const preferredModelId = getModel('profileSummary');

  let lastError: unknown;

  for (const modelId of getModelFallbacks(preferredModelId)) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (signal?.aborted) throw new GeminiAbortError();

      try {
        const start = performance.now();
        const json = await withTimeout(
          generateContentRaw(modelId, {
            generationConfig: {
              responseMimeType: 'application/json',
            },
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: file.type || 'application/pdf',
                      data: base64Pdf,
                    },
                  },
                ],
              },
            ],
          }, signal, 'cv_pdf_extraction'),
          180000,
          `${modelId}-pdf-cv`,
          signal
        );
        const end = performance.now();

        const text = json?.candidates?.[0]?.content?.parts
          ?.map((part) => (typeof part?.text === 'string' ? part.text : ''))
          .join('\n')
          .trim() || '';

        if (!text) {
          throw new Error('Gemini returned an empty response while reading the PDF CV.');
        }

        if (typeof window !== 'undefined') {
          const event = new CustomEvent('gemini-usage', {
            detail: {
              model: modelId,
              latency: Math.round(end - start),
              tokens: json?.usageMetadata?.totalTokenCount || 0,
              timestamp: new Date().toISOString(),
            },
          });
          window.dispatchEvent(event);
        }

        const parsedCv: unknown = JSON.parse(cleanJson(text));
        assertPartialCandidateProfile(parsedCv, 'extractCvInfoFromPdf');

        const cvProfile = parsedCv as Partial<CandidateProfile>;
        const computedExperienceYears = calculateTotalYearsExperienceFromExperiences(cvProfile.experiences);
        if (computedExperienceYears !== undefined) {
          cvProfile.total_years_experience = computedExperienceYears;
        }

        return cvProfile;
      } catch (error) {
        lastError = error;

        if (isAbortError(error)) throw error;
        if (!isRetryableGeminiError(error)) {
          break;
        }

        if (attempt < 2) {
          await sleep(getGeminiRetryDelayMs(error, attempt), signal);
        }
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gemini could not read this PDF CV.');
};

const generateCvProfileFromPdfPageImages = async (file: File, signal?: AbortSignal): Promise<Partial<CandidateProfile>> => {
  const imageBlobs = await renderPdfPagesAsImages(file, 3);
  if (!imageBlobs.length) {
    throw new Error('The PDF pages could not be rendered as images for Gemini vision fallback.');
  }

  const imageParts = await Promise.all(
    imageBlobs.map(async (blob) => ({
      inline_data: {
        mime_type: blob.type || 'image/jpeg',
        data: await blobToBase64(blob),
      },
    }))
  );

  const prompt = `${buildCvExtractionPrompt(
    'Read the uploaded CV from rendered page images. Use OCR, visible layout, headings, tables, and text blocks to reconstruct the candidate profile as accurately as possible.'
  )}\n\nIMPORTANT: Output ONLY valid JSON. No markdown, no explanations.`;
  const preferredModelId = getModel('profileSummary');

  let lastError: unknown;

  for (const modelId of getModelFallbacks(preferredModelId)) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (signal?.aborted) throw new GeminiAbortError();

      try {
        const start = performance.now();
        const json = await withTimeout(
          generateContentRaw(modelId, {
            generationConfig: {
              responseMimeType: 'application/json',
            },
            contents: [
              {
                parts: [
                  { text: prompt },
                  ...imageParts,
                ],
              },
            ],
          }, signal, 'cv_pdf_vision_extraction'),
          180000,
          `${modelId}-pdf-cv-vision`,
          signal
        );
        const end = performance.now();

        const text = json?.candidates?.[0]?.content?.parts
          ?.map((part) => (typeof part?.text === 'string' ? part.text : ''))
          .join('\n')
          .trim() || '';

        if (!text) {
          throw new Error('Gemini returned an empty response while reading the rendered PDF page images.');
        }

        if (typeof window !== 'undefined') {
          const event = new CustomEvent('gemini-usage', {
            detail: {
              model: modelId,
              latency: Math.round(end - start),
              tokens: json?.usageMetadata?.totalTokenCount || 0,
              timestamp: new Date().toISOString(),
            },
          });
          window.dispatchEvent(event);
        }

        const parsedCv: unknown = JSON.parse(cleanJson(text));
        assertPartialCandidateProfile(parsedCv, 'extractCvInfoFromPdfImages');

        const cvProfile = parsedCv as Partial<CandidateProfile>;
        const computedExperienceYears = calculateTotalYearsExperienceFromExperiences(cvProfile.experiences);
        if (computedExperienceYears !== undefined) {
          cvProfile.total_years_experience = computedExperienceYears;
        }

        return cvProfile;
      } catch (error) {
        lastError = error;

        if (isAbortError(error)) throw error;
        if (!isRetryableGeminiError(error)) {
          break;
        }

        if (attempt < 2) {
          await sleep(getGeminiRetryDelayMs(error, attempt), signal);
        }
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gemini vision fallback could not read this PDF CV.');
};

export const extractCvInfoFromFile = async (file: File, signal?: AbortSignal): Promise<Partial<CandidateProfile>> => {
  const inputCharCount = file.size; // bytes as proxy for char count (actual text length unknown before parsing)
  let result: Partial<CandidateProfile> | null = null;

  try {
    try {
      const cvText = await readFileAsText(file);
      result = await extractCvInfo(cvText, signal);
    } catch (error) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) throw error;

      console.warn('Primary PDF extraction failed, retrying by sending the PDF directly to Gemini:', error);

      try {
        result = await generateCvProfileFromPdf(file, signal);
      } catch (geminiPdfError) {
        console.warn('Direct Gemini PDF CV extraction failed, retrying from rendered page images:', geminiPdfError);

        try {
          result = await generateCvProfileFromPdfPageImages(file, signal);
        } catch (geminiVisionError) {
          console.error('Gemini vision PDF CV extraction also failed:', geminiVisionError);
          if (geminiVisionError instanceof Error) throw geminiVisionError;
          if (geminiPdfError instanceof Error) throw geminiPdfError;
          throw error;
        }
      }
    }

    const sanitized = sanitizeExtractedProfile(result!);
    void logCvParse({
      inputCharCount,
      outputFieldNames: Object.keys(sanitized),
      modelId: getModel('profileSummary'),
      success: true,
    });
    return sanitized;
  } catch (err) {
    void logCvParse({
      inputCharCount,
      outputFieldNames: [],
      modelId: getModel('profileSummary'),
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
};

export const generateRefinedApplicationProfile = async (
  originalCandidate: CandidateProfile,
  job: JobProfile,
  chatHistory: string
): Promise<CandidateProfile> => {
  const text = await generateWithMetrics(
    `Refine candidate JSON for job.
    Candidate: ${JSON.stringify(originalCandidate)}
    Job: ${job.title} at ${job.company_name}
    Chat: ${chatHistory}`,
    null,
    undefined,
    true,
    60000,
    undefined,
    'job_application_profile_refinement'
  );
  const parsedRefined: unknown = JSON.parse(cleanJson(text));
  assertCandidateProfile(parsedRefined, 'generateRefinedApplicationProfile');
  return parsedRefined;
}
