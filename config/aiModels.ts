/**
 * Centralized AI Model Configuration
 * 
 * This file is the SINGLE SOURCE OF TRUTH for all AI model IDs used throughout
 * the application. Change defaults here, or override per-task from the Settings
 * UI (persisted to localStorage).
 *
 * All models are Google Generative AI models accessed via the same API key.
 */

// ─── Available Model Catalog ────────────────────────────────────────────────
// Add new models here as Google releases them.
export const MODEL_CATALOG = [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'standard' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash‑Lite', tier: 'lite' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'pro' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', tier: 'standard' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash‑Lite', tier: 'lite' },
] as const;

export const EMBEDDING_CATALOG = [
    { id: 'models/gemini-embedding-2-preview', label: 'Gemini Embr 2 Preview (default)' },
    { id: 'gemini-embedding-001', label: 'Gemini Embedding 001 (Legacy)' },
    { id: 'text-embedding-005', label: 'Text Embedding 005 (Legacy)' },
] as const;

// ─── Task Keys ──────────────────────────────────────────────────────────────
// Each key represents a distinct AI task in the app.
export type AITaskKey =
    | 'chat'              // Interactive chat (recruiter / seeker / help)
    | 'profileSummary'    // Summarise candidate profile from CV + interview
    | 'jobSummary'        // Summarise a job posting into structured JSON
    | 'fakeDataGen'       // Generate fake candidates / jobs (debug)
    | 'embedding';        // Embedding model (separate catalog)

export interface AITaskMeta {
    label: string;
    description: string;
}

export const AI_TASK_META: Record<AITaskKey, AITaskMeta> = {
    chat: { label: 'Chat / Interview', description: 'Powers all interactive AI chats (candidate interview, recruiter assistant, help bot).' },
    profileSummary: { label: 'Profile Summarization', description: 'Extracts structured candidate profiles from CVs and interview transcripts.' },
    jobSummary: { label: 'Job Summarization', description: 'Structures a raw job description into a detailed job profile.' },
    fakeDataGen: { label: 'Test Data Generator', description: 'Generates realistic fake candidates and jobs for testing.' },
    embedding: { label: 'Embeddings', description: 'Generates vector embeddings for semantic matching.' },
};

// ─── Code-side Defaults ─────────────────────────────────────────────────────
// Edit these to change the fallback model for every task.
const CODE_DEFAULTS: Record<AITaskKey, string> = {
    chat: 'gemini-2.5-flash-lite',
    profileSummary: 'gemini-2.5-flash-lite',
    jobSummary: 'gemini-2.5-flash-lite',
    fakeDataGen: 'gemini-2.5-flash-lite',
    embedding: 'models/gemini-embedding-2-preview',
};

// ─── LocalStorage Overrides ─────────────────────────────────────────────────
const STORAGE_KEY = 'peaktalent_ai_models';

/** Read all overrides from localStorage (returns {} if nothing stored). */
function readOverrides(): Partial<Record<AITaskKey, string>> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

/** Write a single task override. Pass `null` to reset to code default. */
export function setModelOverride(task: AITaskKey, modelId: string | null): void {
    const overrides = readOverrides();
    if (modelId === null || modelId === CODE_DEFAULTS[task]) {
        delete overrides[task];
    } else {
        overrides[task] = modelId;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    // Dispatch event so the Settings UI can react
    window.dispatchEvent(new CustomEvent('ai-model-changed', { detail: { task, modelId } }));
}

/** Get the active model for a task (override → code default). */
export function getModel(task: AITaskKey): string {
    const overrides = readOverrides();
    return overrides[task] || CODE_DEFAULTS[task];
}

/** Get all active models keyed by task. */
export function getAllModels(): Record<AITaskKey, string> {
    const overrides = readOverrides();
    const result = { ...CODE_DEFAULTS };
    for (const key of Object.keys(overrides) as AITaskKey[]) {
        result[key] = overrides[key]!;
    }
    return result;
}

/** Get the code-side default for a task (ignoring localStorage). */
export function getCodeDefault(task: AITaskKey): string {
    return CODE_DEFAULTS[task];
}

/** Check if a task has a user override active. */
export function hasOverride(task: AITaskKey): boolean {
    const overrides = readOverrides();
    return task in overrides;
}

/** Reset all overrides back to code defaults. */
export function resetAllOverrides(): void {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('ai-model-changed', { detail: { task: 'all', modelId: null } }));
}
