
import { GoogleGenerativeAI } from '@google/generative-ai';
import { JOB_PROFILE_SCHEMA, CANDIDATE_PROFILE_SCHEMA_CV, CANDIDATE_PROFILE_SCHEMA_FINAL } from '../constants';
import { JobProfile, CandidateProfile, ChatMessage, QuizQuestion, TechnicalTest } from '../types';
import { attachEmbeddingMetadata } from './embeddingService';
import { getModel } from '../config/aiModels';
import { getGeminiApiKey } from './envService';

let ai: GoogleGenerativeAI;
let aiKey = '';

const getAI = () => {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error('Gemini API key is missing from the Vite environment.');
  }
  if (!ai || aiKey !== apiKey) {
    ai = new GoogleGenerativeAI(apiKey);
    aiKey = apiKey;
  }
  return ai;
};

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
    lower.includes('resource_exhausted');
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
  signal?: AbortSignal
): Promise<string> => {
  if (signal?.aborted) throw new GeminiAbortError();
  const genAI = getAI();
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
    const model = genAI.getGenerativeModel(modelConfig);

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
          await sleep(1200 * (attempt + 1), signal);
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
    signal
  );
  return text;
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
    signal
  );

  const jsonString = cleanJson(text);
  const parsed: unknown = JSON.parse(jsonString);
  assertJobProfile(parsed, 'summarizeJobDescription');
  const profile = {
    ...(parsed as any),
    title: (parsed as any).title || (parsed as any).role || '',
  } as JobProfile;

  // Force a valid UUID to prevent database insertion errors with 'job_...' format
  if (!profile.id || profile.id.startsWith('job_')) {
    profile.id = generateUUID();
  }

  return await attachEmbeddingMetadata(profile, 'job');
};

const buildSkillAssessmentQuestion = (
  job: JobProfile,
  skillName: string,
  index: number,
  difficulty: number
): QuizQuestion => ({
  id: `generated_${job.id}_${index + 1}`,
  text: `Quale opzione descrive meglio il tuo livello reale su ${skillName} per il ruolo ${job.title}?`,
  options: [
    `Non conosco ${skillName} e non l'ho mai usata direttamente.`,
    `Conosco le basi di ${skillName}, ma su attività reali avrei ancora bisogno di supporto costante.`,
    `Ho già usato ${skillName} in attività reali e so spiegare il flusso operativo principale e gli output.`,
    `Ho usato ${skillName} in produzione più volte e so motivare decisioni, trade-off, troubleshooting e impatto.`,
  ],
  text_it: `Quale opzione descrive meglio il tuo livello reale su ${skillName} per il ruolo ${job.title}?`,
  options_it: [
    `Non conosco ${skillName} e non l'ho mai usata direttamente.`,
    `Conosco le basi di ${skillName}, ma su attività reali avrei ancora bisogno di supporto costante.`,
    `Ho già usato ${skillName} in attività reali e so spiegare il flusso operativo principale e gli output.`,
    `Ho usato ${skillName} in produzione più volte e so motivare decisioni, trade-off, troubleshooting e impatto.`,
  ],
  text_en: `Which option best describes your real level with ${skillName} for the ${job.title} role?`,
  options_en: [
    `I do not know ${skillName} and have never used it directly.`,
    `I know the basics of ${skillName}, but I would still need close support on real tasks.`,
    `I have already used ${skillName} in real tasks and can explain the main workflow and outputs.`,
    `I have used ${skillName} repeatedly in production and can explain decisions, trade-offs, troubleshooting, and impact.`,
  ],
  correct_option_index: 3,
  difficulty,
});

const buildFallbackAssessmentQuestions = (job: JobProfile): TechnicalTest => {
  const prioritySkills = [...(job.skills || []), ...(job.it_skills || [])]
    .filter((skill, index, array) => array.findIndex((entry) => entry.skill_name.toLowerCase() === skill.skill_name.toLowerCase()) === index);

  const questions: QuizQuestion[] = [];
  const pushQuestion = (question: QuizQuestion) => {
    if (questions.length < 20) {
      questions.push(question);
    }
  };

  if (job.experience_required) {
    pushQuestion({
      id: `generated_${job.id}_experience`,
      text: `Quale opzione descrive meglio il tuo livello di esperienza pratica rispetto a quanto richiesto per ${job.title}?`,
      options: [
        'Non ho ancora esperienza diretta in questo tipo di ruolo.',
        'Ho una prima esposizione, soprattutto tramite studio, osservazione o attività guidate.',
        'Ho già gestito responsabilità simili in progetti reali con ownership parziale.',
        'Ho esperienza pratica solida e posso guidare in autonomia responsabilità simili end-to-end.',
      ],
      text_it: `Quale opzione descrive meglio il tuo livello di esperienza pratica rispetto a quanto richiesto per ${job.title}?`,
      options_it: [
        'Non ho ancora esperienza diretta in questo tipo di ruolo.',
        'Ho una prima esposizione, soprattutto tramite studio, osservazione o attività guidate.',
        'Ho già gestito responsabilità simili in progetti reali con ownership parziale.',
        'Ho esperienza pratica solida e posso guidare in autonomia responsabilità simili end-to-end.',
      ],
      text_en: `Which option best matches your hands-on experience level compared to what is required for the ${job.title} role?`,
      options_en: [
        'I have no direct experience in this type of role yet.',
        'I have some exposure, mostly through study, observation, or guided tasks.',
        'I have already handled similar responsibilities on real projects with partial ownership.',
        'I have solid hands-on experience and can independently lead similar responsibilities end-to-end.',
      ],
      correct_option_index: 3,
      difficulty: 4,
    });
  }

  if (job.constraints?.min_education_level) {
    pushQuestion({
      id: `generated_${job.id}_education`,
      text: `Quale affermazione descrive meglio il tuo livello di qualifiche rispetto ai requisiti per ${job.title}?`,
      options: [
        'Non raggiungo ancora il livello di qualifiche richiesto per questo ruolo.',
        'Sto ancora costruendo il livello richiesto e avrei bisogno di supporto.',
        'Raggiungo il livello richiesto e so collegarlo ad attività pratiche.',
        'Supero il livello richiesto e l’ho già applicato direttamente in progetti rilevanti.',
      ],
      text_it: `Quale affermazione descrive meglio il tuo livello di qualifiche rispetto ai requisiti per ${job.title}?`,
      options_it: [
        'Non raggiungo ancora il livello di qualifiche richiesto per questo ruolo.',
        'Sto ancora costruendo il livello richiesto e avrei bisogno di supporto.',
        'Raggiungo il livello richiesto e so collegarlo ad attività pratiche.',
        'Supero il livello richiesto e l’ho già applicato direttamente in progetti rilevanti.',
      ],
      text_en: `Which statement best describes your qualification level relative to the requirements for ${job.title}?`,
      options_en: [
        'I do not yet meet the requested qualification level for this role.',
        'I am still building toward the requested qualification level and would need support.',
        'I meet the requested qualification level and can connect it to practical work.',
        'I exceed the requested qualification level and have already applied it directly in relevant projects.',
      ],
      correct_option_index: 3,
      difficulty: 3,
    });
  }

  prioritySkills.forEach((skill, index) => {
    pushQuestion(
      buildSkillAssessmentQuestion(
        job,
        skill.skill_name,
        questions.length + index,
        skill.must ? 4 : 3
      )
    );
  });

  const genericQuestionSeeds = [
    `Quale opzione descrive meglio la tua capacità di gestire le responsabilità chiave previste per ${job.title}?`,
    `Quanto ti senti solido nell’uso di workflow, metodi e strumenti principali richiesti da ${job.title}?`,
    `Quale opzione descrive meglio la tua capacità di fare troubleshooting sui problemi tipici di ${job.title}?`,
    `Quanto sei in grado di spiegare i trade-off dietro le scelte tecniche richieste in questo ruolo?`,
    `Quale opzione descrive meglio la tua autonomia operativa sulle priorità di questa posizione?`,
  ];
  const genericQuestionSeedsEn = [
    `Which option best reflects your ability to deliver the key responsibilities described for the ${job.title} role?`,
    `How confident are you in using the main workflow, methods, and tools required for ${job.title}?`,
    `Which option best describes your ability to troubleshoot issues related to the ${job.title} position?`,
    `How well can you explain the trade-offs behind the technical choices required in this role?`,
    `Which option best reflects your readiness to work independently on the priorities of this position?`,
  ];

  genericQuestionSeeds.forEach((seed, index) => {
    pushQuestion({
      id: `generated_${job.id}_generic_${index + 1}`,
      text: seed,
      options: [
        'Avrei bisogno di un onboarding sostanziale prima di contribuire con sicurezza.',
        'Potrei contribuire su task più semplici con supervisione ravvicinata.',
        'Potrei gestire responsabilità normali con supporto limitato.',
        'Potrei prendere ownership rapidamente e spiegare con chiarezza esecuzione e decisioni.',
      ],
      text_it: seed,
      options_it: [
        'Avrei bisogno di un onboarding sostanziale prima di contribuire con sicurezza.',
        'Potrei contribuire su task più semplici con supervisione ravvicinata.',
        'Potrei gestire responsabilità normali con supporto limitato.',
        'Potrei prendere ownership rapidamente e spiegare con chiarezza esecuzione e decisioni.',
      ],
      text_en: genericQuestionSeedsEn[index],
      options_en: [
        'I would need substantial onboarding before contributing confidently.',
        'I could contribute on simpler tasks with close supervision.',
        'I could handle normal responsibilities with limited support.',
        'I could take ownership quickly and explain both execution and decision-making clearly.',
      ],
      correct_option_index: 3,
      difficulty: 3,
    });
  });

  while (questions.length < 20) {
    pushQuestion(
      buildSkillAssessmentQuestion(
        job,
        `${job.title} core competency ${questions.length + 1}`,
        questions.length,
        3
      )
    );
  }

  return {
    questions: questions.slice(0, 20),
    generated_at: new Date().toISOString(),
    generated_from_job_title: job.title,
  };
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

export const generateTechnicalTestForJob = async (job: JobProfile, signal?: AbortSignal): Promise<TechnicalTest> => {
  try {
    const text = await generateWithMetrics(
      `Create a role-specific technical screening quiz. Every question must test actual knowledge — there must be one objectively correct answer that requires knowing the subject to identify correctly.

GOAL:
- Generate exactly 20 multiple-choice questions.
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
      signal
    );

    const parsedTest: unknown = JSON.parse(cleanJson(text));
    assertTechnicalTest(parsedTest, 'generateTechnicalTestForJob');

    const normalizedQuestions: QuizQuestion[] = ((parsedTest as { questions?: any[] }).questions || [])
      .slice(0, 20)
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

    if (normalizedQuestions.length < 20) {
      const fallbackQuestions = buildFallbackAssessmentQuestions(job).questions;
      const questionTexts = new Set(normalizedQuestions.map((question) => question.text.toLowerCase().trim()));
      const filledQuestions = [...normalizedQuestions];

      for (const fallbackQuestion of fallbackQuestions) {
        if (filledQuestions.length >= 20) break;
        const normalizedText = fallbackQuestion.text.toLowerCase().trim();
        if (questionTexts.has(normalizedText)) continue;
        questionTexts.add(normalizedText);
        filledQuestions.push({
          ...fallbackQuestion,
          id: `filled_${job.id}_${filledQuestions.length + 1}`,
        });
      }

      if (filledQuestions.length < 10) {
        throw new Error('The generated technical test was incomplete.');
      }

      return {
        questions: filledQuestions.slice(0, 20),
        generated_at: new Date().toISOString(),
        generated_from_job_title: job.title,
      };
    }

    return {
      questions: normalizedQuestions,
      generated_at: new Date().toISOString(),
      generated_from_job_title: job.title,
    };
  } catch (error) {
    // Abort should bubble up immediately; only fall back on real Gemini failures.
    if (isAbortError(error)) throw error;
    console.warn('Falling back to heuristic technical test generation:', error);
    return buildFallbackAssessmentQuestions(job);
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
    30000
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
  "personal_info": { "first_name": string, "last_name": string, "pronoun": string },
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
  "experiences": [{ "role": string, "company": string, "location": { "country": string, "city": string }, "from": "YYYY-MM", "to": "YYYY-MM" or "present", "is_current_position": boolean, "description": string }],
  "education": [{ "institution": string, "degree_level": string, "major": string, "from": "YYYY-MM", "to": "YYYY-MM", "currently_pursuing": boolean }]
}

EXISTING PROFILE DATA:
${JSON.stringify(baseInfo, null, 2)}

CHAT INTERVIEW TRANSCRIPT:
${chatHistory || '(No chat interview conducted — use only existing data)'}`,
    null,
    undefined,
    true,
    120000, // Profile merge is a large prompt — allow up to 2 minutes
    signal
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

  return await attachEmbeddingMetadata(profile, 'candidate');
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
  console.log(`[transcribeAudio] blob=${audioBlob.size}b, raw="${audioBlob.type}", normalized="${mimeType}"`);
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error('Gemini API key is missing from the Vite environment.');
  }

  // Convert to base64 via FileReader — safe for any blob size
  const base64Audio = await blobToBase64(audioBlob);
  console.log(`[transcribeAudio] base64 length=${base64Audio.length}`);

  // Call Gemini REST API directly — gives us clear HTTP errors instead of SDK wrapping
  const modelId = getModel('chat');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const body = {
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
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`[transcribeAudio] HTTP ${response.status}:`, errBody);
    throw new Error(`Gemini ${response.status}: ${errBody}`);
  }

  const json = await response.json();
  console.log('[transcribeAudio] response:', JSON.stringify(json).slice(0, 300));

  const transcript = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  console.log(`[transcribeAudio] transcript="${transcript}"`);
  return transcript;
};


export const streamChatResponse = async (
  history: ChatMessage[],
  newMessage: string,
  type: 'general' | 'recruiter' | 'seeker',
  systemInstruction: string,
  onChunk: (chunk: string) => void
): Promise<void> => {
  const genAI = getAI();

  const model = genAI.getGenerativeModel({
    model: getModel('chat'),
    systemInstruction: systemInstruction || undefined,
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
  for await (const chunk of result.stream) {
    onChunk(chunk.text());
  }
};

export const extractCvInfo = async (cvText: string, signal?: AbortSignal): Promise<Partial<CandidateProfile>> => {
  const text = await generateWithMetrics(
    `Extract ONE structured Candidate Profile JSON from the provided CV Text.
    
    SCHEMA: ${JSON.stringify(CANDIDATE_PROFILE_SCHEMA_CV, null, 2)}

    CRITICAL INSTRUCTIONS:
    1. 'id': Generate 'cand_' + random suffix.
    2. 'experiences': Extract ALL roles. 
       - 'is_current_position': True if no end date or "Present".
       - 'description': Summarize key achievements.
    3. 'skills' (Technical Domain): Extract core competencies (e.g. Project Management, Circuit Design). 
        - 'level': Infer level from these options: 2=Novice, 4=Competent, 6=Proficient, 8=Expert, 10=Master / Leading SME. Use even numbers for levels; odd numbers can be used for intermediate states.
       - 'rank': Order by relevance (1=most relevant).
       - 'level_source': Always set to "cv_only".
       - 'level_confidence': CRITICAL — assess how certain you are about the assigned level:
         * "high" = skill described with depth indicators: metrics, years of use, team size, project outcomes, certifications
         * "medium" = skill mentioned in job role descriptions but without specific depth evidence
         * "low" = skill only appears in a bare list (e.g. "Skills: Python, Java, SQL") with NO context in the experiences
    4. 'it_skills' (Software/Code): Extract tools, languages, software. Apply same level_source and level_confidence rules.
    5. 'education': Extract all degrees.
    6. 'residence': Infer Country and City.
    7. 'industry_experience': Infer the industries/sectors the candidate has ACTUALLY worked in based on their experiences (e.g. "FinTech", "SaaS", "Automotive", "Healthcare"). This is different from aspirational preferences.
    
    CV TEXT: ${cvText}`,
    null,
    undefined,
    true,
    120000, // CV parsing sends a large prompt — allow up to 2 minutes
    signal
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
    true
  );
  const parsedRefined: unknown = JSON.parse(cleanJson(text));
  assertCandidateProfile(parsedRefined, 'generateRefinedApplicationProfile');
  return await attachEmbeddingMetadata(parsedRefined, 'candidate');
}
