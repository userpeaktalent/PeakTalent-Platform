import { JobProfile, CandidateProfile, MatchScoreBreakdown, MatchingPillarWeights } from '../types';

export const MATCHING_ALGORITHM_VERSION = 'v1.1.0';

// Audit trail: maps version → weights snapshot + activation date
export const MATCHING_WEIGHTS_HISTORY: Record<string, { activatedAt: string; weights: Record<string, number> }> = {
  'v1.0.0': {
    activatedAt: '2025-01-01',
    weights: { semantic: 0.40, hard: 0.20, constraint: 0.00, industry: 0.10, experience: 0.10, education: 0.10, careerPrestige: 0.10 },
  },
  'v1.1.0': {
    activatedAt: '2026-05-18',
    weights: { semantic: 0.50, hard: 0.30, constraint: 0.00, industry: 0.05, experience: 0.00, education: 0.10, careerPrestige: 0.05 },
  },
};

export const DEFAULT_MATCHING_PILLAR_WEIGHTS: MatchingPillarWeights = {
    semantic: 0.50,
    hard: 0.30,
    industry: 0.05,
    education: 0.10,
    careerPrestige: 0.05,
};

export const normalizeMatchingPillarWeights = (
    weights?: Partial<MatchingPillarWeights> | null
): MatchingPillarWeights => {
    const rawWeights: MatchingPillarWeights = {
        semantic: Number.isFinite(weights?.semantic) && Number(weights?.semantic) >= 0 ? Number(weights?.semantic) : DEFAULT_MATCHING_PILLAR_WEIGHTS.semantic,
        hard: Number.isFinite(weights?.hard) && Number(weights?.hard) >= 0 ? Number(weights?.hard) : DEFAULT_MATCHING_PILLAR_WEIGHTS.hard,
        industry: Number.isFinite(weights?.industry) && Number(weights?.industry) >= 0 ? Number(weights?.industry) : DEFAULT_MATCHING_PILLAR_WEIGHTS.industry,
        education: Number.isFinite(weights?.education) && Number(weights?.education) >= 0 ? Number(weights?.education) : DEFAULT_MATCHING_PILLAR_WEIGHTS.education,
        careerPrestige: Number.isFinite(weights?.careerPrestige) && Number(weights?.careerPrestige) >= 0 ? Number(weights?.careerPrestige) : DEFAULT_MATCHING_PILLAR_WEIGHTS.careerPrestige,
    };

    const total = Object.values(rawWeights).reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(total) || total <= 0) {
        return DEFAULT_MATCHING_PILLAR_WEIGHTS;
    }

    return {
        semantic: rawWeights.semantic / total,
        hard: rawWeights.hard / total,
        industry: rawWeights.industry / total,
        education: rawWeights.education / total,
        careerPrestige: rawWeights.careerPrestige / total,
    };
};
import { cosineSimilarity } from './vectorMath';
import { areSynonyms, areFuzzyMatch, getSkillRelationScore, getSkillClusterIndex } from './synonyms';
import { getUniversityTier, universityTierToScore } from './universityTiers';
import { getCompanyTier, companyTierToScore } from './companyPrestige';
import { getEducationLevelOrdinal } from './education';

/**
 * CEFR level mapping for comparison.
 */
const CEFR_LEVELS: Record<string, number> = {
    'a1': 1, 'a2': 2, 'b1': 3, 'b2': 4, 'c1': 5, 'c2': 6
};

const COUNTRY_TO_ISO2: Record<string, string> = {
    it: 'it', italy: 'it',
    fr: 'fr', france: 'fr',
    de: 'de', germany: 'de',
    es: 'es', spain: 'es',
    ch: 'ch', switzerland: 'ch',
    at: 'at', austria: 'at',
    nl: 'nl', netherlands: 'nl',
    be: 'be', belgium: 'be',
    pt: 'pt', portugal: 'pt',
    ie: 'ie', ireland: 'ie',
    uk: 'gb', gb: 'gb', 'united kingdom': 'gb',
    se: 'se', sweden: 'se',
    no: 'no', norway: 'no',
    dk: 'dk', denmark: 'dk',
    fi: 'fi', finland: 'fi',
    pl: 'pl', poland: 'pl',
    cz: 'cz', 'czech republic': 'cz',
    gr: 'gr', greece: 'gr',
    ro: 'ro', romania: 'ro',
    hu: 'hu', hungary: 'hu',
    lu: 'lu', luxembourg: 'lu',
    eu: 'eu',
};

const EU_ISO2 = new Set([
    'it', 'fr', 'de', 'es', 'ch', 'at', 'nl', 'be', 'pt', 'ie',
    'gb', 'se', 'no', 'dk', 'fi', 'pl', 'cz', 'gr', 'ro', 'hu', 'lu',
]);

const normalizeCountry = (country?: string): string => {
    const key = (country || '').toLowerCase().trim();
    return COUNTRY_TO_ISO2[key] || key;
};

const isEuCountry = (country?: string): boolean => {
    const normalized = normalizeCountry(country);
    return normalized === 'eu' || EU_ISO2.has(normalized);
};

const normalizeSkillName = (value?: string): string => (value || '').toLowerCase().trim();

const confidenceMultiplier = (confidence?: string): number => {
    switch ((confidence || '').toLowerCase()) {
        case 'high': return 1.0;
        case 'medium': return 0.9;
        case 'low': return 0.78;
        default: return 0.88;
    }
};

const sourceMultiplier = (source?: string): number => {
    return source === 'chat_validated' ? 1.05 : 1.0;
};

const getCandidateSkillEvidenceScore = (skill: { level_confidence?: string; level_source?: string }): number => {
    return Math.min(1.05, confidenceMultiplier(skill.level_confidence) * sourceMultiplier(skill.level_source));
};

export const compareCefr = (candLevel: string, jobLevel: string): boolean => {
    const cand = CEFR_LEVELS[candLevel.toLowerCase()] || 0;
    const job = CEFR_LEVELS[jobLevel.toLowerCase()] || 0;
    return cand >= job;
};

// ─── Education Degree Hierarchy ──────────────────────────────────────────────

const getDegreeOrdinal = (degreeLevel?: string | null): number => getEducationLevelOrdinal(degreeLevel);

// ─── Skill Similarity ────────────────────────────────────────────────────────

/**
 * Skill similarity check.
 * Returns true if s1 and s2 refer to the same skill.
 * Uses: 1) exact match, 2) synonym lookup, 3) word-boundary substring,
 * 4) Levenshtein distance fallback.
 */
const areSkillsSimilar = (s1: string, s2: string): boolean => {
    const a = s1.toLowerCase().trim();
    const b = s2.toLowerCase().trim();
    if (a === b) return true;

    // Synonym dictionary check
    if (areSynonyms(a, b)) return true;

    // Word-boundary-aware substring matching (original logic)
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    if (shorter.length >= 4) {
        const escaped = shorter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordBoundary = new RegExp(`(?:^|[\\s\\-/+])(${escaped})(?:[\\s\\-/+]|$)`);
        if (wordBoundary.test(longer)) return true;
    }

    // Levenshtein fallback for close variations (e.g. typos)
    if (areFuzzyMatch(a, b)) return true;

    return false;
};

type CandidateSkillEvidence = {
    skill_name: string;
    level: number;
    level_confidence?: string;
    level_source?: string;
};

type BackgroundFamilyRule = {
    id: string;
    familyGroup: 'software' | 'data' | 'analytics' | 'engineering' | 'finance';
    evidencePatterns: string[];
    jobPatterns: string[];
    semanticSupport: number;
    inferredSkills: Array<{ skill_name: string; level: number }>;
};

const BACKGROUND_FAMILY_RULES: BackgroundFamilyRule[] = [
    {
        id: 'computing-core',
        familyGroup: 'software',
        evidencePatterns: [
            'computer science',
            'cs',
            'software engineering',
            'computer engineering',
            'informatics',
            'information technology',
        ],
        jobPatterns: [
            'software engineer',
            'software developer',
            'backend developer',
            'backend engineer',
            'back-end developer',
            'back-end engineer',
            'frontend developer',
            'frontend engineer',
            'front-end developer',
            'front-end engineer',
            'full stack developer',
            'full stack engineer',
            'full-stack developer',
            'full-stack engineer',
            'fullstack developer',
            'fullstack engineer',
            'mobile engineer',
            'mobile developer',
            'ios engineer',
            'android engineer',
            'data scientist',
            'data engineer',
            'machine learning engineer',
            'ai engineer',
            'devops engineer',
            'platform engineer',
            'site reliability engineer',
            'sre',
        ],
        semanticSupport: 0.78,
        inferredSkills: [
            { skill_name: 'Git', level: 6 },
            { skill_name: 'SQL', level: 6 },
            { skill_name: 'Python', level: 5 },
            { skill_name: 'Jupyter', level: 5 },
            { skill_name: 'Algorithms', level: 6 },
            { skill_name: 'Data Structures', level: 6 },
        ],
    },
    {
        id: 'data-core',
        familyGroup: 'data',
        evidencePatterns: [
            'data science',
            'machine learning',
            'artificial intelligence',
            'statistics',
            'applied mathematics',
            'mathematics',
            'econometrics',
            'data scientist',
            'machine learning engineer',
            'data analyst',
        ],
        jobPatterns: [
            'data scientist',
            'machine learning engineer',
            'ai engineer',
            'data analyst',
            'analytics',
            'business intelligence',
            'data engineer',
        ],
        semanticSupport: 0.92,
        inferredSkills: [
            { skill_name: 'Python', level: 7 },
            { skill_name: 'SQL', level: 6 },
            { skill_name: 'Jupyter', level: 7 },
            { skill_name: 'Pandas', level: 6 },
            { skill_name: 'NumPy', level: 6 },
            { skill_name: 'Machine Learning', level: 6 },
            { skill_name: 'Statistics', level: 6 },
        ],
    },
    {
        id: 'analytics-core',
        familyGroup: 'analytics',
        evidencePatterns: [
            'business analytics',
            'data analytics',
            'business intelligence',
            'information systems',
            'analytics engineer',
            'bi analyst',
        ],
        jobPatterns: [
            'data analyst',
            'business intelligence',
            'analytics',
            'product analyst',
            'data scientist',
        ],
        semanticSupport: 0.78,
        inferredSkills: [
            { skill_name: 'SQL', level: 6 },
            { skill_name: 'Excel', level: 7 },
            { skill_name: 'Power BI', level: 6 },
            { skill_name: 'Tableau', level: 6 },
            { skill_name: 'Statistics', level: 5 },
        ],
    },
    {
        id: 'frontend-web',
        familyGroup: 'software',
        evidencePatterns: [
            'frontend developer',
            'frontend engineer',
            'front-end developer',
            'front-end engineer',
            'web developer',
            'web engineer',
            'ui developer',
            'ui engineer',
            'full stack developer',
            'full stack engineer',
            'full-stack developer',
            'full-stack engineer',
        ],
        jobPatterns: [
            'frontend developer',
            'frontend engineer',
            'front-end developer',
            'front-end engineer',
            'web developer',
            'web engineer',
            'ui developer',
            'ui engineer',
            'full stack developer',
            'full stack engineer',
            'full-stack developer',
            'full-stack engineer',
        ],
        semanticSupport: 0.82,
        inferredSkills: [
            { skill_name: 'HTML', level: 7 },
            { skill_name: 'CSS', level: 7 },
            { skill_name: 'JavaScript', level: 7 },
            { skill_name: 'Git', level: 6 },
        ],
    },
    {
        id: 'backend-platform',
        familyGroup: 'software',
        evidencePatterns: [
            'backend developer',
            'backend engineer',
            'back-end developer',
            'back-end engineer',
            'software engineer',
            'software developer',
            'full stack developer',
            'full stack engineer',
            'full-stack developer',
            'full-stack engineer',
            'fullstack developer',
            'fullstack engineer',
            'platform engineer',
            'solution engineer',
            'site reliability engineer',
        ],
        jobPatterns: [
            'backend developer',
            'backend engineer',
            'software engineer',
            'platform engineer',
            'full stack developer',
            'full stack engineer',
            'fullstack developer',
            'fullstack engineer',
            'data engineer',
            'devops engineer',
            'site reliability engineer',
        ],
        semanticSupport: 0.74,
        inferredSkills: [
            { skill_name: 'Git', level: 6 },
            { skill_name: 'SQL', level: 6 },
            { skill_name: 'Docker', level: 5 },
            { skill_name: 'PostgreSQL', level: 5 },
        ],
    },
    {
        id: 'engineering-core',
        familyGroup: 'engineering',
        evidencePatterns: [
            'mechanical engineering',
            'electrical engineering',
            'industrial engineering',
            'automation engineering',
            'manufacturing engineering',
            'process engineering',
            'chemical engineering',
            'civil engineering',
            'materials engineering',
            'control engineering',
            'mechatronics',
            'design engineer',
            'process engineer',
            'manufacturing engineer',
            'industrial engineer',
            'automation engineer',
            'quality engineer',
            'production engineer',
            'hardware engineer',
            'systems engineer',
            'r&d engineer',
            'research and development engineer',
        ],
        jobPatterns: [
            'engineering',
            'process engineer',
            'manufacturing engineer',
            'industrial engineer',
            'mechanical engineer',
            'electrical engineer',
            'automation engineer',
            'controls engineer',
            'control systems engineer',
            'mechatronics engineer',
            'quality engineer',
            'product engineer',
            'design engineer',
            'production engineer',
            'operations engineer',
            'test engineer',
            'validation engineer',
            'hardware engineer',
            'systems engineer',
            'r&d engineer',
            'research and development engineer',
        ],
        semanticSupport: 0.95,
        inferredSkills: [
            { skill_name: 'CAD', level: 5 },
            { skill_name: 'Technical Drawing', level: 6 },
            { skill_name: 'Process Engineering', level: 6 },
            { skill_name: 'Root Cause Analysis', level: 6 },
            { skill_name: 'Technical Documentation', level: 6 },
            { skill_name: 'Process Improvement', level: 6 },
            { skill_name: 'Lean Manufacturing', level: 5 },
            { skill_name: 'FMEA', level: 5 },
            { skill_name: 'GD&T', level: 5 },
        ],
    },
    {
        id: 'mechanical-design-core',
        familyGroup: 'engineering',
        evidencePatterns: [
            'mechanical engineering',
            'mechanical design',
            'mechanical design engineer',
            'design engineer',
            'product design engineer',
            'automotive engineering',
            'chassis',
            'cad designer',
            'cad engineer',
        ],
        jobPatterns: [
            'mechanical design engineer',
            'associate mechanical design engineer',
            'design engineer',
            'product design engineer',
            'mechanical engineer',
            'cad engineer',
            'chassis',
            'vehicle design',
            'automotive engineering',
        ],
        semanticSupport: 0.97,
        inferredSkills: [
            { skill_name: 'Mechanical Design', level: 7 },
            { skill_name: 'CAD', level: 7 },
            { skill_name: '3D CAD', level: 7 },
            { skill_name: 'SolidWorks', level: 7 },
            { skill_name: 'CATIA', level: 6 },
            { skill_name: 'GD&T', level: 6 },
            { skill_name: 'Technical Drawing', level: 7 },
            { skill_name: 'Tolerance Analysis', level: 6 },
            { skill_name: 'Design for Manufacturing', level: 6 },
            { skill_name: 'Finite Element Analysis', level: 5 },
        ],
    },
    {
        id: 'aerospace-core',
        familyGroup: 'engineering',
        evidencePatterns: [
            'aerospace engineering',
            'aeronautical engineering',
            'aerospace engineer',
            'aeronautical engineer',
            'avionics',
            'flight mechanics',
            'aerodynamics',
            'propulsion',
            'space systems',
        ],
        jobPatterns: [
            'aerospace engineer',
            'aeronautical engineer',
            'avionics engineer',
            'flight systems engineer',
            'propulsion engineer',
            'space systems engineer',
            'aircraft design',
            'aerospace design',
        ],
        semanticSupport: 0.98,
        inferredSkills: [
            { skill_name: 'Systems Engineering', level: 7 },
            { skill_name: 'CAD', level: 6 },
            { skill_name: 'CATIA', level: 6 },
            { skill_name: 'Technical Documentation', level: 6 },
            { skill_name: 'Finite Element Analysis', level: 6 },
            { skill_name: 'CFD', level: 6 },
            { skill_name: 'Simulation', level: 6 },
            { skill_name: 'Mechanical Design', level: 5 },
        ],
    },
    {
        id: 'finance-accounting-core',
        familyGroup: 'finance',
        evidencePatterns: [
            'accounting',
            'accountant',
            'financial accounting',
            'finance',
            'auditor',
            'audit',
            'bookkeeping',
            'controller',
            'accounts payable',
            'accounts receivable',
            'payroll',
            'tax',
            'contabile',
        ],
        jobPatterns: [
            'accountant',
            'financial analyst',
            'controller',
            'auditor',
            'finance manager',
            'payroll specialist',
            'accounting',
            'bookkeeper',
        ],
        semanticSupport: 0.92,
        inferredSkills: [
            { skill_name: 'Accounting', level: 7 },
            { skill_name: 'Financial Reporting', level: 7 },
            { skill_name: 'Bookkeeping', level: 6 },
            { skill_name: 'Excel', level: 7 },
            { skill_name: 'Reconciliation', level: 6 },
            { skill_name: 'Budgeting', level: 6 },
            { skill_name: 'SAP', level: 5 },
            { skill_name: 'General Ledger', level: 6 },
        ],
    },
];

const FAMILY_GROUP_COMPATIBILITY: Record<BackgroundFamilyRule['familyGroup'], BackgroundFamilyRule['familyGroup'][]> = {
    software: ['software', 'data', 'analytics'],
    data: ['data', 'analytics', 'software'],
    analytics: ['analytics', 'data', 'software', 'finance'],
    engineering: ['engineering'],
    finance: ['finance', 'analytics'],
};

const normalizeTextBlock = (value?: string): string =>
    (value || '')
        .toLowerCase()
        .replace(/[^a-z0-9+#./\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const textContainsTerm = (text: string, term: string): boolean => {
    const normalizedText = normalizeTextBlock(text);
    const normalizedTerm = normalizeTextBlock(term);

    if (!normalizedText || !normalizedTerm) return false;
    if (normalizedTerm.length > 3 && normalizedText.includes(normalizedTerm)) return true;

    const escaped = normalizedTerm
        .split(' ')
        .filter(Boolean)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+');

    if (!escaped) return false;
    return new RegExp(`(?:^|[^a-z0-9+#])${escaped}(?:$|[^a-z0-9+#])`).test(normalizedText);
};

const compactStrings = (values: Array<string | undefined | null>): string[] =>
    Array.from(new Set(values.map((value) => normalizeTextBlock(value || '')).filter(Boolean)));

const matchesAnyPattern = (texts: string[], patterns: string[]): boolean =>
    patterns.some((pattern) => texts.some((text) => textContainsTerm(text, pattern)));

const getMatchingBackgroundFamilyRules = (
    texts: string[],
    patternKey: 'evidencePatterns' | 'jobPatterns'
): BackgroundFamilyRule[] => BACKGROUND_FAMILY_RULES.filter((rule) => matchesAnyPattern(texts, rule[patternKey]));

const getFamilyGroups = (rules: BackgroundFamilyRule[]) => Array.from(new Set(rules.map((rule) => rule.familyGroup)));

const haveCompatibleFamilyGroups = (
    candidateGroups: BackgroundFamilyRule['familyGroup'][],
    jobGroups: BackgroundFamilyRule['familyGroup'][]
) => {
    if (candidateGroups.length === 0 || jobGroups.length === 0) return true;

    return candidateGroups.some((candidateGroup) =>
        jobGroups.some((jobGroup) =>
            candidateGroup === jobGroup ||
            FAMILY_GROUP_COMPATIBILITY[candidateGroup]?.includes(jobGroup) ||
            FAMILY_GROUP_COMPATIBILITY[jobGroup]?.includes(candidateGroup)
        )
    );
};

// Ranking runs `getTermRelationScore` in nested loops across many candidates/jobs.
// The inputs are a small vocabulary of skill/role tokens, so an LRU-style cache
// (most-recent keys survive) avoids repeating expensive similarity computations.
const TERM_RELATION_CACHE_MAX = 5000;
const termRelationCache = new Map<string, number>();

const computeTermRelationScore = (left: string, right: string): number => {
    if (left === right) return 1;
    if (areSkillsSimilar(left, right)) return 1;

    const relation = getSkillRelationScore(left, right);
    if (relation > 0) return relation;

    if (textContainsTerm(left, right) || textContainsTerm(right, left)) {
        return 0.9;
    }

    return 0;
};

const getTermRelationScore = (a?: string, b?: string): number => {
    const left = normalizeTextBlock(a);
    const right = normalizeTextBlock(b);
    if (!left || !right) return 0;

    // Order-independent key: pair (left,right) and (right,left) share a cache slot.
    const key = left < right ? `${left}\u0001${right}` : `${right}\u0001${left}`;
    const cached = termRelationCache.get(key);
    if (cached !== undefined) {
        // Move to the most-recent position so the LRU eviction tracks hot entries.
        termRelationCache.delete(key);
        termRelationCache.set(key, cached);
        return cached;
    }

    const score = computeTermRelationScore(left, right);
    if (termRelationCache.size >= TERM_RELATION_CACHE_MAX) {
        const oldest = termRelationCache.keys().next().value;
        if (oldest !== undefined) termRelationCache.delete(oldest);
    }
    termRelationCache.set(key, score);
    return score;
};

/**
 * Maps a raw cosine similarity (`-1..1` in theory, ~`0.3..1.0` in practice for
 * Gemini retrieval embeddings) to a 0–1 semantic score via a logistic sigmoid
 * anchored at FLOOR_COS → 0 and CEIL_COS → 1.
 *
 * Calibration (CENTER=0.65, STEEPNESS=10, FLOOR=0.30, CEIL=0.97):
 *   - Cosines below FLOOR (clearly-unrelated CV/job pairs) → near 0
 *   - Cosine == CENTER (mid-relevance) → 50%
 *   - Cosine in the 0.85–0.95 band (strong match) → 90–99%
 *   - Cosine above CEIL → clamped to 100%
 *
 * The sigmoid (vs the previous power curve) gives a true S-shape: clearly
 * separates unrelated from related profiles, and saturates only near the top.
 */
const sigmoidNormalizeCosine = (cosine: number): number => {
    const CENTER = 0.65;
    const STEEPNESS = 10;
    const FLOOR_COS = 0.30;
    const CEIL_COS = 0.97;
    const sigmoid = (x: number) => 1 / (1 + Math.exp(-STEEPNESS * (x - CENTER)));
    const sigFloor = sigmoid(FLOOR_COS);
    const sigCeil = sigmoid(CEIL_COS);
    const norm = (sigmoid(cosine) - sigFloor) / (sigCeil - sigFloor);
    return Math.min(1, Math.max(0, norm));
};

const collectCandidateEvidenceTexts = (candidate: CandidateProfile): string[] => compactStrings([
    candidate.summary_text,
    candidate.canonical_career_text,
    candidate.current_job_function,
    ...(candidate.target_job_functions || []),
    ...(candidate.education || []).flatMap((entry) => [entry.major, entry.degree_level, entry.institution]),
    ...(candidate.experiences || []).flatMap((entry) => [entry.role, entry.description, entry.company]),
]);

const collectCandidateRoleTerms = (candidate: CandidateProfile): string[] => compactStrings([
    candidate.current_job_function,
    ...(candidate.target_job_functions || []),
    ...(candidate.experiences || []).map((entry) => entry.role),
    ...(candidate.education || []).map((entry) => entry.major),
]);

const collectJobSemanticTerms = (job: JobProfile): string[] => compactStrings([
    job.title,
    job.job_function,
    ...(Array.isArray(job.industry) ? job.industry : []),
    ...job.skills.map((skill) => skill.skill_name),
    ...job.it_skills.map((skill) => skill.skill_name),
]);

const mergeSkillEvidence = (target: Map<string, CandidateSkillEvidence>, skill: CandidateSkillEvidence) => {
    const key = normalizeSkillName(skill.skill_name);
    if (!key) return;

    const existing = target.get(key);
    if (!existing) {
        target.set(key, skill);
        return;
    }
    // Non-inferred evidence always wins over inferred: a candidate's own
    // self-reported skill should never be overwritten by a family-rule
    // inference, even if the inferred default level is higher.
    const existingInferred = existing.level_source === 'inferred';
    const skillInferred = skill.level_source === 'inferred';
    if (skillInferred && !existingInferred) return;
    if (!skillInferred && existingInferred) {
        target.set(key, skill);
        return;
    }
    if ((skill.level || 0) > (existing.level || 0)) {
        target.set(key, skill);
    }
};

const buildCandidateSkillPool = (candidate: CandidateProfile): CandidateSkillEvidence[] => {
    const merged = new Map<string, CandidateSkillEvidence>();
    const explicitSkills: CandidateSkillEvidence[] = [
        ...(Array.isArray(candidate.skills) ? candidate.skills : []),
        ...(Array.isArray(candidate.it_skills) ? candidate.it_skills : []),
    ];

    explicitSkills.forEach((skill) => mergeSkillEvidence(merged, skill));

    const evidenceTexts = collectCandidateEvidenceTexts(candidate);
    BACKGROUND_FAMILY_RULES.forEach((rule) => {
        if (!matchesAnyPattern(evidenceTexts, rule.evidencePatterns)) return;

        rule.inferredSkills.forEach((skill) => {
            mergeSkillEvidence(merged, {
                ...skill,
                level_confidence: rule.semanticSupport >= 0.95 ? 'medium' : 'low',
                level_source: 'inferred',
            });
        });
    });

    return Array.from(merged.values());
};

const getBestPairwiseRelation = (leftTerms: string[], rightTerms: string[]): number => {
    let best = 0;

    for (const left of leftTerms) {
        for (const right of rightTerms) {
            const relation = getTermRelationScore(left, right);
            if (relation > best) best = relation;
        }
    }

    return best;
};

const getJobSkillAnchorCoverage = (
    job: JobProfile,
    candidatePool: CandidateSkillEvidence[],
    candidateTexts: string[]
): number => {
    const anchors = [...job.skills, ...job.it_skills]
        .sort((a, b) => Number(Boolean(b.must)) - Number(Boolean(a.must)))
        .slice(0, 8)
        .map((skill) => skill.skill_name);

    if (anchors.length === 0) return 0.5;

    let total = 0;
    for (const anchor of anchors) {
        let best = 0;

        // Inferred skills (from background family rules) contribute only partial
        // evidence of coverage — the candidate hasn't actually listed them.
        const INFERRED_WEIGHT = 0.6;

        for (const skill of candidatePool) {
            const relation = getTermRelationScore(skill.skill_name, anchor);
            if (relation === 0) continue;
            const weight = skill.level_source === 'inferred' ? INFERRED_WEIGHT : 1;
            const weighted = relation * weight;
            if (weighted > best) best = weighted;
        }

        if (best < 0.7 && candidateTexts.some((text) => textContainsTerm(text, anchor))) {
            best = 0.7;
        }

        total += best;
    }

    return total / anchors.length;
};

const getSemanticFamilySupport = (candidateTexts: string[], jobTexts: string[]): number => {
    let best = 0;

    BACKGROUND_FAMILY_RULES.forEach((rule) => {
        if (matchesAnyPattern(candidateTexts, rule.evidencePatterns) && matchesAnyPattern(jobTexts, rule.jobPatterns)) {
            best = Math.max(best, rule.semanticSupport);
        }
    });

    return best;
};

const getEducationTrajectorySupport = (candidate: CandidateProfile, jobSemanticTerms: string[]): number => {
    const educationEntries = Array.isArray(candidate.education) ? candidate.education : [];
    if (educationEntries.length === 0) return 0;

    const relevantEntries = educationEntries
        .map((entry) => {
            const entryTerms = compactStrings([entry.major, entry.degree_level, entry.institution]);
            const relation = Math.max(
                getBestPairwiseRelation(entryTerms, jobSemanticTerms),
                getSemanticFamilySupport(entryTerms, jobSemanticTerms)
            );

            return {
                relation,
                ordinal: getDegreeOrdinal(entry.degree_level),
            };
        })
        .filter((entry) => entry.relation >= 0.55);

    if (relevantEntries.length === 0) return 0;

    const bestOrdinal = Math.max(...relevantEntries.map((entry) => entry.ordinal || 0), 0);
    const countScore = relevantEntries.length >= 2 ? 1.0 : 0.65;
    const degreeBonus = bestOrdinal >= 4 ? 0.2 : bestOrdinal === 3 ? 0.1 : 0;

    return Math.min(1.0, countScore + degreeBonus);
};

const getExperienceTrajectorySupport = (candidate: CandidateProfile, jobSemanticTerms: string[]): number => {
    const experiences = Array.isArray(candidate.experiences) ? candidate.experiences : [];
    if (experiences.length === 0) return 0;

    const relevantExperiences = experiences
        .map((entry) => {
            const entryTerms = compactStrings([entry.role, entry.description, entry.company]);
            const relation = Math.max(
                getBestPairwiseRelation(entryTerms, jobSemanticTerms),
                getSemanticFamilySupport(entryTerms, jobSemanticTerms)
            );

            return {
                relation,
                isCurrent: Boolean(entry.is_current_position),
            };
        })
        .filter((entry) => entry.relation >= 0.55);

    if (relevantExperiences.length === 0) return 0;

    const countScore = relevantExperiences.length >= 2 ? 1.0 : 0.6;
    const currentBonus = relevantExperiences.some((entry) => entry.isCurrent) ? 0.15 : 0;
    const yearsBonus = Math.min(0.15, (candidate.total_years_experience || 0) / 20);

    return Math.min(1.0, countScore + currentBonus + yearsBonus);
};

const getProvenRoleExperienceAlignment = (job: JobProfile, candidate: CandidateProfile): number => {
    const jobRoleTerms = compactStrings([
        job.title,
        job.job_function,
        job.summary_text,
        ...(Array.isArray(job.industry) ? job.industry : []),
        ...job.skills.slice(0, 6).map((skill) => skill.skill_name),
        ...job.it_skills.slice(0, 4).map((skill) => skill.skill_name),
    ]);
    const experienceTerms = compactStrings([
        candidate.current_job_function,
        ...(candidate.experiences || []).flatMap((entry) => [entry.role, entry.description]),
    ]);

    if (!jobRoleTerms.length || !experienceTerms.length) return 0;

    return Math.max(
        getBestPairwiseRelation(experienceTerms, jobRoleTerms),
        getSemanticFamilySupport(experienceTerms, jobRoleTerms)
    );
};

const hasProvenSimilarRoleExperience = (
    job: JobProfile,
    candidate: CandidateProfile,
    signals: StructuredSemanticSignals,
): boolean => {
    if (signals.hasIncompatibleFamilyBackground) return false;

    const roleExperienceAlignment = getProvenRoleExperienceAlignment(job, candidate);
    const strongRoleMatch = roleExperienceAlignment >= 0.82;
    const strongTrajectoryMatch =
        signals.experienceTrajectorySupport >= 0.75 &&
        (signals.familySupport >= 0.82 || signals.skillAnchorCoverage >= 0.55);

    return strongRoleMatch || strongTrajectoryMatch;
};

const hasExplicitHardSkillInventory = (candidateSkillPool: CandidateSkillEvidence[]): boolean =>
    candidateSkillPool.some((skill) => skill.level_source !== 'inferred' && normalizeSkillName(skill.skill_name));

export type StructuredSemanticBreakdown = {
    directRoleAlignment: number;
    familySupport: number;
    skillAnchorCoverage: number;
    educationTrajectorySupport: number;
    experienceTrajectorySupport: number;
    trajectorySupport: number;
    rawBaseScore: number;
    bonuses: number;
    structuredScore: number;
};

type StructuredSemanticSignals = {
    directRoleAlignment: number;
    familySupport: number;
    skillAnchorCoverage: number;
    educationTrajectorySupport: number;
    experienceTrajectorySupport: number;
    trajectorySupport: number;
    hasSpecificFamilyTarget: boolean;
    hasEngineeringTarget: boolean;
    candidateFamilyGroups: BackgroundFamilyRule['familyGroup'][];
    jobFamilyGroups: BackgroundFamilyRule['familyGroup'][];
    hasIncompatibleFamilyBackground: boolean;
};

const collectStructuredSemanticSignals = (
    job: JobProfile,
    candidate: CandidateProfile,
    candidateSkillPool: CandidateSkillEvidence[]
): StructuredSemanticSignals => {
    const candidateRoleTerms = collectCandidateRoleTerms(candidate);
    const candidateEvidenceTexts = collectCandidateEvidenceTexts(candidate);
    const jobSemanticTerms = collectJobSemanticTerms(job);
    const jobRoleTerms = compactStrings([job.title, job.job_function, ...(Array.isArray(job.industry) ? job.industry : [])]);
    const directRoleAlignment = getBestPairwiseRelation(candidateRoleTerms, jobRoleTerms);
    const familySupport = getSemanticFamilySupport(candidateEvidenceTexts, jobSemanticTerms);
    const skillAnchorCoverage = getJobSkillAnchorCoverage(job, candidateSkillPool, candidateEvidenceTexts);
    const educationTrajectorySupport = getEducationTrajectorySupport(candidate, jobSemanticTerms);
    const experienceTrajectorySupport = getExperienceTrajectorySupport(candidate, jobSemanticTerms);
    const trajectorySupport = (educationTrajectorySupport * 0.45) + (experienceTrajectorySupport * 0.55);
    const matchedCandidateFamilies = getMatchingBackgroundFamilyRules(candidateEvidenceTexts, 'evidencePatterns');
    const matchedJobFamilies = getMatchingBackgroundFamilyRules(jobSemanticTerms, 'jobPatterns');
    const candidateFamilyGroups = getFamilyGroups(matchedCandidateFamilies);
    const jobFamilyGroups = getFamilyGroups(matchedJobFamilies);

    return {
        directRoleAlignment,
        familySupport,
        skillAnchorCoverage,
        educationTrajectorySupport,
        experienceTrajectorySupport,
        trajectorySupport,
        hasSpecificFamilyTarget: matchedJobFamilies.length > 0,
        hasEngineeringTarget: matchedJobFamilies.some((rule) => rule.familyGroup === 'engineering'),
        candidateFamilyGroups,
        jobFamilyGroups,
        hasIncompatibleFamilyBackground:
            matchedJobFamilies.length > 0 &&
            matchedCandidateFamilies.length > 0 &&
            !haveCompatibleFamilyGroups(candidateFamilyGroups, jobFamilyGroups),
    };
};

export const debugStructuredSemantic = (
    job: JobProfile,
    candidate: CandidateProfile
): StructuredSemanticBreakdown => {
    const pool = buildCandidateSkillPool(candidate);
    const {
        directRoleAlignment,
        familySupport,
        skillAnchorCoverage,
        educationTrajectorySupport,
        experienceTrajectorySupport,
        trajectorySupport,
    } = collectStructuredSemanticSignals(job, candidate, pool);

    const rawBaseScore = (
        (directRoleAlignment * 0.18) +
        (familySupport * 0.30) +
        (skillAnchorCoverage * 0.16) +
        (trajectorySupport * 0.36)
    );

    const structuredScore = calculateStructuredSemanticScore(job, candidate, pool);

    return {
        directRoleAlignment,
        familySupport,
        skillAnchorCoverage,
        educationTrajectorySupport,
        experienceTrajectorySupport,
        trajectorySupport,
        rawBaseScore,
        bonuses: structuredScore - rawBaseScore,
        structuredScore,
    };
};

const calculateStructuredSemanticScore = (
    job: JobProfile,
    candidate: CandidateProfile,
    candidateSkillPool: CandidateSkillEvidence[]
): number => {
    const {
        directRoleAlignment,
        familySupport,
        skillAnchorCoverage,
        educationTrajectorySupport,
        experienceTrajectorySupport,
        trajectorySupport,
        hasSpecificFamilyTarget,
        hasEngineeringTarget,
        hasIncompatibleFamilyBackground,
    } = collectStructuredSemanticSignals(job, candidate, candidateSkillPool);

    let structuredScore = (
        (directRoleAlignment * 0.18) +
        (familySupport * 0.30) +
        (skillAnchorCoverage * 0.16) +
        (trajectorySupport * 0.36)
    );

    const addHeadroomScaledBonus = (bonus: number) => {
        const headroom = Math.max(0, 1 - structuredScore);
        structuredScore += bonus * headroom;
    };

    // Additive alignment bonuses instead of Math.max floors: rewarding alignment
    // without collapsing differently-strong candidates onto the same plateau.
    if (familySupport >= 0.82 && skillAnchorCoverage >= 0.55) {
        addHeadroomScaledBonus(0.03);
    }

    if ((directRoleAlignment >= 0.88 || familySupport >= 0.88) && skillAnchorCoverage >= 0.65) {
        addHeadroomScaledBonus(0.04);
    }

    if (trajectorySupport >= 0.80 && familySupport >= 0.72) {
        addHeadroomScaledBonus(0.07);
    }

    if (trajectorySupport >= 0.90 && skillAnchorCoverage >= 0.65 && (directRoleAlignment >= 0.70 || familySupport >= 0.82)) {
        addHeadroomScaledBonus(0.05);
    }

    if (hasEngineeringTarget && familySupport >= 0.90 && educationTrajectorySupport >= 0.82 && experienceTrajectorySupport >= 0.80) {
        addHeadroomScaledBonus(0.10);
    }

    if (hasEngineeringTarget && directRoleAlignment >= 0.72 && skillAnchorCoverage >= 0.62) {
        addHeadroomScaledBonus(0.05);
    }

    const weakSpecificFamilyFit =
        hasSpecificFamilyTarget &&
        directRoleAlignment < 0.45 &&
        familySupport < 0.45 &&
        trajectorySupport < 0.45 &&
        skillAnchorCoverage < 0.55;

    if (weakSpecificFamilyFit) {
        structuredScore = Math.min(structuredScore, hasEngineeringTarget ? 0.22 : 0.34);
    }

    const lacksEngineeringBackground =
        hasEngineeringTarget &&
        directRoleAlignment < 0.50 &&
        familySupport < 0.55 &&
        educationTrajectorySupport < 0.45 &&
        experienceTrajectorySupport < 0.45;

    if (lacksEngineeringBackground) {
        structuredScore = Math.min(structuredScore, 0.18);
    }

    const incompatibleFamilyFit =
        hasSpecificFamilyTarget &&
        hasIncompatibleFamilyBackground &&
        directRoleAlignment < 0.60 &&
        familySupport < 0.50 &&
        trajectorySupport < 0.55 &&
        skillAnchorCoverage < 0.58;

    if (incompatibleFamilyFit) {
        structuredScore = Math.min(structuredScore, hasEngineeringTarget ? 0.12 : 0.20);
    }

    return Math.min(1.0, Math.max(0, structuredScore));
};

// ─── Hard Filters ────────────────────────────────────────────────────────────

/**
 * Applies deterministic hard filters to exclude impossible matches.
 */
export const isEligible = (job: JobProfile, candidate: CandidateProfile): boolean => {
    const { constraints } = job;
    const preferences = candidate.preferences;
    const languages = Array.isArray(candidate.languages) ? candidate.languages : [];

    // 1. Work Eligibility
    if (preferences?.work_eligibility_countries?.length) {
        const jobCountry = normalizeCountry(constraints.location.country);
        const isEligibleCountry = preferences.work_eligibility_countries.some(c => {
            const normalized = normalizeCountry(c);
            return normalized === jobCountry || (normalized === 'eu' && isEuCountry(jobCountry));
        });
        if (!isEligibleCountry && !constraints.visa_sponsorship) return false;
    }

    // 2. Contract Type Compatibility
    if (preferences?.desired_contract_types?.length) {
        if (!preferences.desired_contract_types.includes(constraints.contract_type)) return false;
    }

    // 3. Remote Policy Compatibility
    if (preferences?.remote && preferences.remote !== 'none' && constraints.remote === 'none') {
        if (preferences.remote === 'full_remote') return false;
    }

    // 4. Language Requirements
    if (constraints.languages?.length) {
        for (const req of constraints.languages) {
            const candLang = languages.find(l => l.language.toLowerCase() === req.language.toLowerCase());
            if (!candLang || !compareCefr(candLang.level, req.level)) return false;
        }
    }

    // 5. Salary Constraints
    if (preferences?.salary_eur?.min && constraints.salary_eur?.max) {
        if (constraints.salary_eur.max < preferences.salary_eur.min) return false;
    }

    // 6. Minimum Education Level (NEW)
    if (constraints.min_education_level) {
        const requiredOrdinal = getDegreeOrdinal(constraints.min_education_level);
        if (requiredOrdinal > 0) {
            if (!candidate.education?.length) return false;
            const candidateMaxOrdinal = Math.max(
                ...candidate.education.map(e => getDegreeOrdinal(e.degree_level))
            );
            if (candidateMaxOrdinal < requiredOrdinal) return false;
        }
    }

    return true;
};

// ─── Constraint Scoring ──────────────────────────────────────────────────────

/**
 * Calculates how well a candidate's constraints fit the job's requirements.
 * Returns a score from 0.0 (poor fit) to 1.0 (perfect fit).
 * 
 * Sub-scores:
 *  - Location (50%): same city → 1.0, same country → 0.6, EU region → 0.3, different → 0.1
 *  - Remote Policy (20%): compatible → 1.0, partial → 0.4, incompatible → 0.15
 *  - Contract Type (15%): match → 1.0, no preference → 0.5, mismatch → 0.15
 *  - Salary (15%): overlap → 1.0, close → 0.5, no overlap → 0.1
 */
export const calculateConstraintScore = (job: JobProfile, candidate: CandidateProfile): number => {
    const { constraints } = job;
    const { preferences, residence } = candidate;

    // --- 1. Location Score (50%) ---
    let locationScore = 0.1;
    const jobCity = constraints.location.city?.toLowerCase().trim() || '';
    const jobCountry = normalizeCountry(constraints.location.country);

    const candidateLocations = preferences?.preferred_locations?.length
        ? preferences.preferred_locations
        : residence ? [{ country: residence.country, city: residence.city }] : [];

    for (const loc of candidateLocations) {
        const candCity = loc.city?.toLowerCase().trim() || '';
        const candCountry = normalizeCountry(loc.country);

        if (candCity && jobCity && candCity === jobCity) {
            locationScore = 1.0;
            break;
        } else if (candCountry && jobCountry && candCountry === jobCountry) {
            locationScore = Math.max(locationScore, 0.6);
        } else if (candCountry && jobCountry) {
            const bothEU = isEuCountry(candCountry) && isEuCountry(jobCountry);
            if (bothEU) {
                locationScore = Math.max(locationScore, 0.3);
            }
        }
    }

    if (constraints.remote === 'full_remote') {
        locationScore = Math.max(locationScore, 0.85);
    }

    // --- 2. Remote Policy Score (20%) ---
    let remoteScore = 0.5;
    const candRemote = preferences?.remote;
    const jobRemote = constraints.remote;

    if (!candRemote || candRemote === jobRemote || candRemote === 'no_preference' || jobRemote === 'no_preference') {
        remoteScore = 1.0;
    } else if (jobRemote === 'full_remote') {
        remoteScore = 0.9;
    } else if (candRemote === 'full_remote' && jobRemote === 'hybrid') {
        remoteScore = 0.4;
    } else if (candRemote === 'full_remote' && jobRemote === 'none') {
        remoteScore = 0.15;
    } else if (candRemote === 'hybrid' && jobRemote === 'none') {
        remoteScore = 0.35;
    } else {
        remoteScore = 0.5;
    }

    // --- 3. Contract Type Score (15%) ---
    let contractScore = 0.5;
    const desiredTypes = preferences?.desired_contract_types;
    if (!desiredTypes || desiredTypes.length === 0) {
        contractScore = 0.5;
    } else if (desiredTypes.includes(constraints.contract_type)) {
        contractScore = 1.0;
    } else {
        contractScore = 0.15;
    }

    // --- 4. Salary Score (15%) ---
    let salaryScore = 0.5;
    const candMin = preferences?.salary_eur?.min;
    const jobSalary = constraints.salary_eur;

    if (candMin && jobSalary) {
        if (jobSalary.max >= candMin) {
            salaryScore = 1.0;
        } else if (jobSalary.max >= candMin * 0.85) {
            salaryScore = 0.5;
        } else {
            salaryScore = 0.1;
        }
    }

    // --- 5. Eligibility / Mobility Score (10%) ---
    let mobilityScore = 0.6;
    const mobilityJobCountry = normalizeCountry(constraints.location.country);
    const eligibleCountries = preferences?.work_eligibility_countries || [];
    if (eligibleCountries.length > 0) {
        const eligibleDirectly = eligibleCountries.some(c => {
            const normalized = normalizeCountry(c);
            return normalized === mobilityJobCountry || (normalized === 'eu' && isEuCountry(mobilityJobCountry));
        });
        if (eligibleDirectly) {
            mobilityScore = 1.0;
        } else if (constraints.visa_sponsorship) {
            mobilityScore = 0.7;
        } else {
            mobilityScore = 0.15;
        }
    }

    if (constraints.relocation_support && locationScore < 0.6) {
        mobilityScore = Math.max(mobilityScore, 0.8);
    }

    // --- 6. Availability Score (10%) ---
    let availabilityScore = 0.65;
    const noticeMonths = candidate.notice_period_months;
    const searchStatus = (candidate.job_search_status || '').toLowerCase();

    if (typeof noticeMonths === 'number') {
        if (noticeMonths <= 1) availabilityScore = 1.0;
        else if (noticeMonths <= 2) availabilityScore = 0.85;
        else if (noticeMonths <= 3) availabilityScore = 0.7;
        else availabilityScore = 0.45;
    }

    if (searchStatus === 'actively_looking' || searchStatus === 'open_to_opportunities' || searchStatus === 'open_to_offers') {
        availabilityScore = Math.min(1.0, availabilityScore + 0.1);
    } else if (searchStatus === 'not_looking' || searchStatus === 'casually_browsing') {
        availabilityScore = Math.max(0.35, availabilityScore - 0.15);
    }

    const score = (locationScore * 0.40) +
        (remoteScore * 0.15) +
        (contractScore * 0.10) +
        (salaryScore * 0.15) +
        (mobilityScore * 0.10) +
        (availabilityScore * 0.10);

    return Math.min(1.0, Math.max(0, score));
};

// ─── Education Quality Scoring (Pillar 7) ────────────────────────────────────

/**
 * Calculates an education quality score based on:
 *   - Degree level (50%): higher degree = better
 *   - University tier (30%): top university = better
 *   - Graduation mark (20%): higher normalized grade = better
 */
const calculateEducationScore = (job: JobProfile, candidate: CandidateProfile): number => {
    if (!candidate.education?.length) return 0; // No education data → no education score

    // Find the candidate's highest/best education entry
    const universityOverrides = job.ranking_universities ?? null;
    const eduEntries = candidate.education
        .map(e => ({
            ...e,
            ordinal: getDegreeOrdinal(e.degree_level),
            uniTier: getUniversityTier(e.institution, universityOverrides),
        }))
        .sort((a, b) => {
            // Sort by degree ordinal desc, then by uni tier asc (lower tier = better)
            if (b.ordinal !== a.ordinal) return b.ordinal - a.ordinal;
            return a.uniTier - b.uniTier;
        });

    const best = eduEntries[0];

    // --- Degree Level Score (50%) ---
    let degreeLevelScore: number;
    const requiredOrdinal = getDegreeOrdinal(job.constraints?.min_education_level || '');

    if (requiredOrdinal > 0) {
        // Score relative to job requirement
        const diff = best.ordinal - requiredOrdinal;
        if (diff >= 1) degreeLevelScore = 1.0;       // Exceeds requirement
        else if (diff === 0) degreeLevelScore = 0.9;   // Meets requirement exactly
        else if (diff === -1) degreeLevelScore = 0.5;   // One level below
        else degreeLevelScore = 0.2;                    // Well below
    } else {
        // No job requirement — score based on absolute level
        // Map ordinal 1–6 to score 0.3–1.0
        degreeLevelScore = best.ordinal > 0
            ? 0.3 + (best.ordinal - 1) * 0.14  // 1→0.3, 2→0.44, 3→0.58, 4→0.72, 5→0.86, 6→1.0
            : 0.3;
    }

    // --- University Tier Score (30%) ---
    const uniScore = universityTierToScore(best.uniTier);

    // --- Graduation Mark Score (20%) ---
    let markScore = 0; // No mark evidence → no mark contribution
    // Use the best education entry that has a mark
    const withMark = eduEntries.find(e => e.final_mark != null && e.final_mark > 0);
    if (withMark && withMark.final_mark != null) {
        const mark = withMark.final_mark;
        const scale = withMark.final_mark_scale;

        // Normalize mark to [0, 1] based on scale
        let maxMark = 100; // default
        if (scale) {
            const scaleNum = parseFloat(scale);
            if (!isNaN(scaleNum) && scaleNum > 0) maxMark = scaleNum;
            // Common Italian scale
            if (scale.toLowerCase().includes('110')) maxMark = 110;
            if (scale.toLowerCase().includes('30')) maxMark = 30;
        }
        markScore = Math.min(1.0, Math.max(0, mark / maxMark));
    }

    // Certifications provide a small, job-relevant boost when they align with required skills.
    let certificationScore = 0;
    if (candidate.certifications?.length) {
        const requiredSkillNames = [...job.skills, ...job.it_skills].map(s => normalizeSkillName(s.skill_name));
        const matchedCerts = candidate.certifications.filter(cert =>
            requiredSkillNames.some(skill => skill && normalizeSkillName(cert.name).includes(skill))
        ).length;
        certificationScore = matchedCerts > 0
            ? Math.min(1.0, 0.6 + matchedCerts * 0.15)
            : 0.25;
    }

    // Weighted combination
    return (degreeLevelScore * 0.45) + (uniScore * 0.25) + (markScore * 0.15) + (certificationScore * 0.15);
};

// ─── Career Prestige Scoring (Pillar 8) ──────────────────────────────────────

/**
 * Calculates a career prestige score based on previous employers.
 *   - Most recent company weighted 70%, others 30%
 *   - Unknown companies score neutral (0.35)
 */
const calculateCareerPrestigeScore = (job: JobProfile, candidate: CandidateProfile): number => {
    if (!candidate.experiences?.length) return 0; // No experience data → no prestige score

    const companyOverrides = job.ranking_companies ?? null;

    // Sort experiences: current/most recent first
    const sorted = [...candidate.experiences].sort((a, b) => {
        if (a.is_current_position && !b.is_current_position) return -1;
        if (!a.is_current_position && b.is_current_position) return 1;
        return b.from.localeCompare(a.from);
    });

    const recentCompany = sorted[0];
    const recentTier = getCompanyTier(recentCompany.company, companyOverrides);
    const recentScore = companyTierToScore(recentTier);

    if (sorted.length === 1) return recentScore;

    // Average score of other companies
    const otherScores = sorted.slice(1).map(exp => companyTierToScore(getCompanyTier(exp.company, companyOverrides)));
    const avgOtherScore = otherScores.reduce((sum, s) => sum + s, 0) / otherScores.length;

    return (recentScore * 0.70) + (avgOtherScore * 0.30);
};

type SkillEval = {
    mustScore: number;
    niceScore: number;
    hardSkillsScore: number;
    mustCoverage: number;
};

const getLevelMatchScore = (candidateLevel?: number, requiredLevel?: number): number => {
    if (!requiredLevel || requiredLevel <= 0) return 1.0;
    if (!candidateLevel || candidateLevel <= 0) return 0.70;
    if (candidateLevel >= requiredLevel) return 1.0;
    if (candidateLevel >= requiredLevel * 0.8) return 0.75;
    if (candidateLevel >= requiredLevel * 0.6) return 0.45;
    return 0.2;
};

const getBackgroundSkillSupport = (
    jobSkill: { skill_name: string; level: number },
    candidateFamilyRules: BackgroundFamilyRule[]
): number => {
    let best = 0;

    for (const rule of candidateFamilyRules) {
        for (const inferredSkill of rule.inferredSkills) {
            const relation = getTermRelationScore(inferredSkill.skill_name, jobSkill.skill_name);
            if (relation === 0) continue;

            const contribution = Math.min(
                0.78,
                relation * getLevelMatchScore(inferredSkill.level, jobSkill.level) * 0.72
            );
            if (contribution > best) best = contribution;
        }
    }

    return best;
};

const evaluateHardSkills = (job: JobProfile, candidate: CandidateProfile, candidateSkillPool?: CandidateSkillEvidence[]): SkillEval => {
    const jobSkillsFull = [...job.skills, ...job.it_skills];
    const mustSkills = jobSkillsFull.filter(s => s.must);
    const niceSkills = jobSkillsFull.filter(s => !s.must);
    const candSkills = candidateSkillPool || buildCandidateSkillPool(candidate);
    const candidateEvidenceTexts = collectCandidateEvidenceTexts(candidate);
    const candidateFamilyRules = getMatchingBackgroundFamilyRules(candidateEvidenceTexts, 'evidencePatterns');

    // Family-rule inferred skills (e.g. a CS degree implying Python) are
    // plausibility signals, not proof of proficiency. Weight them well below
    // explicit CV/chat evidence so a candidate who merely *could* know the
    // skill can't ride it to a top score.
    const INFERRED_WEIGHT = 0.74;

    // Domain-proximity floor: a CV is never an exhaustive list of what someone
    // can do. If a candidate's *explicit* skills already cover other clusters
    // in this required bucket, the unlisted must-skills get a baseline credit
    // proportional to that domain coverage. This rewards "good fit" candidates
    // who happen not to mention every tool in their CV.
    //
    // Inferred skills are deliberately excluded from proximity — proximity
    // means "we can prove the candidate is in this family", which inferred
    // signals (background heuristics) cannot do.
    const explicitCandClusters = new Set<number>();
    for (const cs of candSkills) {
        if (cs.level_source === 'inferred') continue;
        const idx = getSkillClusterIndex(cs.skill_name);
        if (idx !== undefined) explicitCandClusters.add(idx);
    }
    // Cap the floor strictly below the *minimum* cluster partial (0.65) so a
    // real cluster sibling always outranks a pure proximity-floor pass-through.
    const MAX_MISS_FLOOR = 0.55;

    const scoreBucket = (bucket: { skill_name: string; level: number }[]) => {
        if (bucket.length === 0) return { score: null as number | null, coverage: null as number | null };

        // Compute domain proximity for THIS bucket:
        // fraction of the bucket's distinct clusters that the candidate touches.
        const bucketClusters = new Set<number>();
        for (const js of bucket) {
            const idx = getSkillClusterIndex(js.skill_name);
            if (idx !== undefined) bucketClusters.add(idx);
        }
        let coveredBucketClusters = 0;
        bucketClusters.forEach(c => { if (explicitCandClusters.has(c)) coveredBucketClusters++; });
        const domainProximity = bucketClusters.size > 0
            ? coveredBucketClusters / bucketClusters.size
            : 0;
        const missFloor = domainProximity * MAX_MISS_FLOOR;

        let matched = 0;
        let totalScore = 0;
        for (const js of bucket) {
            // Find the candidate skill that contributes the highest score.
            // getSkillRelationScore returns 1.0 for exact/synonym matches,
            // 0.65–0.85 for related skills in the same cluster, 0.0 for unrelated.
            let bestContribution = 0;
            for (const cs of candSkills) {
                const relation = getSkillRelationScore(cs.skill_name, js.skill_name);
                if (relation === 0) continue;
                const levelAndEvidence = Math.min(
                    1.0,
                    getLevelMatchScore(cs.level, js.level) * getCandidateSkillEvidenceScore(cs)
                );
                const inferredWeight = cs.level_source === 'inferred' ? INFERRED_WEIGHT : 1.0;
                const contribution = relation * levelAndEvidence * inferredWeight;
                if (contribution > bestContribution) bestContribution = contribution;
            }
            if (bestContribution > 0) {
                // Real match (exact / synonym / cluster sibling): use the
                // contribution as-is so level gaps and weak evidence still
                // propagate through. Floor would otherwise erase the level
                // signal (e.g. junior React vs senior-required tied with
                // candidates who don't even list React).
                matched++;
                totalScore += bestContribution;
            } else {
                const backgroundSupport = getBackgroundSkillSupport(
                    js,
                    candidateFamilyRules
                );

                // Unlisted skill: apply the proximity floor. If the candidate
                // is clearly "in the family" (proximity high), an unlisted
                // must still earns partial credit — a CV is never an exhaustive
                // skill inventory. Floor is capped strictly below cluster
                // partials so a real cluster sibling always outranks pure
                // proximity credit.
                totalScore += Math.max(missFloor, backgroundSupport);
            }
        }
        return {
            score: totalScore / bucket.length,
            coverage: matched / bucket.length
        };
    };

    const mustEval = scoreBucket(mustSkills);
    const niceEval = scoreBucket(niceSkills);

    // Blend must + nice. If the job has only one bucket, score against that
    // bucket alone rather than giving "free" 1.0 credit for the empty side.
    // When both are present, must dominates (0.85) — missing a nice-to-have
    // is a soft penalty, missing a must is a hard one.
    let hardSkillsScore = 0;
    if (mustSkills.length === 0 && niceSkills.length === 0) {
        // No skill requirements specified: neutral pass-through at 50%.
        hardSkillsScore = 0.5;
    } else if (mustSkills.length === 0) {
        hardSkillsScore = niceEval.score ?? 0;
    } else if (niceSkills.length === 0) {
        hardSkillsScore = mustEval.score ?? 0;
    } else {
        hardSkillsScore = (mustEval.score ?? 0) * 0.85 + (niceEval.score ?? 0) * 0.15;
    }

    hardSkillsScore = Math.min(1.0, Math.max(0, hardSkillsScore));

    return {
        mustScore: mustEval.score ?? 1.0,
        niceScore: niceEval.score ?? 1.0,
        hardSkillsScore,
        mustCoverage: mustEval.coverage ?? 1.0
    };
};

// ─── Main 6-Pillar Scoring ───────────────────────────────────────────────────

/**
 * Enhanced ranking logic based on 6 weighted dimensions.
 *
 * Pillar 1: AI Semantic Alignment (50%) — Cosine similarity + structured role-fit
 * Pillar 2: Hard Skills Match (30%) — Technical skills overlap (with fuzzy matching)
 * Pillar 3: Constraints Fit (0%) — Location, remote, contract, salary compatibility
 * Pillar 4: Soft Skills Match (0%) — Behavioral and cultural fit, shown for context only
 * Pillar 5: Industry/Domain (5%) — Sector relevance
 * Pillar 6: Education Quality (10%) — Degree level, university prestige, grades
 * Pillar 7: Career Prestige (5%) — Previous employer reputation
 */
export const calculateMatchScore = (job: JobProfile, candidate: CandidateProfile): MatchScoreBreakdown => {
    const candidateSkillPool = buildCandidateSkillPool(candidate);

    // 1. Semantic Match (50%) — Embedding-led, structured-supported.
    //
    // Logistic sigmoid spreads cosines across the full 0–100% scale instead of
    // compressing them into a narrow linear band. Calibrated for Gemini-2
    // RETRIEVAL_QUERY/DOCUMENT cosines on profile-canonical text:
    //   CENTER    = cosine value at which a candidate scores 50%
    //   STEEPNESS = sharpness of the curve; higher = wider gap between good/poor
    //   FLOOR/CEIL = anchor points clamped to 0% / 100% after sigmoid
    // At these values:
    //   cos 0.40 ≈  4%   cos 0.60 ≈ 37%   cos 0.75 ≈ 75%
    //   cos 0.50 ≈ 16%   cos 0.65 ≈ 50%   cos 0.85 ≈ 91%
    //   cos 0.55 ≈ 25%   cos 0.70 ≈ 64%   cos 0.95 ≈ 99%
    let semanticScore = 0;
    let rawEmbeddingSemanticScore = 0;
    let rawEmbeddingCosine = 0;
    const hasEmbedding = !!(job.embedding_vector && candidate.embedding_vector);
    if (hasEmbedding) {
        rawEmbeddingCosine = cosineSimilarity(job.embedding_vector!, candidate.embedding_vector!);
        rawEmbeddingSemanticScore = sigmoidNormalizeCosine(rawEmbeddingCosine);
    }

    const structuredSemanticScore = calculateStructuredSemanticScore(job, candidate, candidateSkillPool);

    const structuredSemanticSignals = collectStructuredSemanticSignals(job, candidate, candidateSkillPool);

    // Blend: structured evidence slightly outweighs the embedding.
    // We still trust the embedding, but education, trajectory and proven role
    // family now have more authority so "obvious" sector candidates climb and
    // generic-but-well-written profiles stop floating too high.
    // When embedding is missing, structured semantic becomes the primary source
    // with only a small confidence discount.
    semanticScore = hasEmbedding
        ? (rawEmbeddingSemanticScore * 0.45) + (structuredSemanticScore * 0.55)
        : structuredSemanticScore * 0.92;

    // Agreement bonus — small, headroom-scaled so it can't create a top plateau.
    // A candidate at 0.95 gets at most +0.005; a candidate at 0.70 gets +0.025.
    // Threshold raised to 0.85 to match the new sigmoid curve where 0.85 ≈ 91%.
    if (rawEmbeddingCosine >= 0.85 && structuredSemanticScore >= 0.65) {
        const headroom = Math.max(0, 1 - semanticScore);
        semanticScore += 0.10 * headroom;
    }

    // Low-cosine guard: when the embedding clearly says "unrelated", a structured
    // fluke (e.g. one accidental family-rule match) shouldn't pull the score above
    // the mid-band. Embeddings are harder to fool than text-pattern matches.
    if (hasEmbedding && rawEmbeddingCosine < 0.58) {
        semanticScore = Math.min(semanticScore, structuredSemanticSignals.hasSpecificFamilyTarget ? 0.34 : 0.40);
    }

    const weakSpecificFamilyFit =
        structuredSemanticSignals.hasSpecificFamilyTarget &&
        structuredSemanticSignals.directRoleAlignment < 0.45 &&
        structuredSemanticSignals.familySupport < 0.45 &&
        structuredSemanticSignals.trajectorySupport < 0.45 &&
        structuredSemanticSignals.skillAnchorCoverage < 0.55;

    if (hasEmbedding && weakSpecificFamilyFit && rawEmbeddingCosine < 0.82) {
        semanticScore = Math.min(semanticScore, structuredSemanticSignals.hasEngineeringTarget ? 0.32 : 0.42);
    }

    const lacksEngineeringBackground =
        structuredSemanticSignals.hasEngineeringTarget &&
        structuredSemanticSignals.directRoleAlignment < 0.50 &&
        structuredSemanticSignals.familySupport < 0.55 &&
        structuredSemanticSignals.educationTrajectorySupport < 0.45 &&
        structuredSemanticSignals.experienceTrajectorySupport < 0.45;

    if (lacksEngineeringBackground) {
        semanticScore = Math.min(semanticScore, 0.20);
    }

    const incompatibleFamilyFit =
        structuredSemanticSignals.hasSpecificFamilyTarget &&
        structuredSemanticSignals.hasIncompatibleFamilyBackground &&
        structuredSemanticSignals.directRoleAlignment < 0.60 &&
        structuredSemanticSignals.familySupport < 0.50 &&
        structuredSemanticSignals.trajectorySupport < 0.55 &&
        structuredSemanticSignals.skillAnchorCoverage < 0.58;

    if (incompatibleFamilyFit) {
        semanticScore = Math.min(
            semanticScore,
            structuredSemanticSignals.hasEngineeringTarget ? 0.14 : 0.24
        );
    }

    semanticScore = Math.min(1.0, Math.max(0, semanticScore));

    // 2. Hard Skills Match (30%) — must-weighted, with fuzzy/synonym matching
    const hardSkillEval = evaluateHardSkills(job, candidate, candidateSkillPool);
    const hasSameRoleExperience = hasProvenSimilarRoleExperience(job, candidate, structuredSemanticSignals);
    let hardSkillsScore = hardSkillEval.hardSkillsScore;
    if (hasSameRoleExperience && !hasExplicitHardSkillInventory(candidateSkillPool)) {
        hardSkillsScore = Math.max(hardSkillsScore, 0.60);
    }

    // 3. Constraints Fit (0%) — Location, Remote, Contract, Salary
    const constraintScore = calculateConstraintScore(job, candidate);

    // 4. Industry/Domain Match (5%)
    let industryAlignment = 0;
    const jobFunctionLower = job.job_function?.toLowerCase() || '';
    const candFunctionLower = candidate.current_job_function?.toLowerCase() || '';
    const targetFunctions = candidate.target_job_functions?.map(f => f.toLowerCase()) || [];

    // Split into current vs. aspirational function match:
    // current_job_function = proven domain experience -> 1.0
    // target_job_functions only = aspirational, not yet proven -> 0.60
    const currentFunctionMatch = !!(jobFunctionLower && candFunctionLower === jobFunctionLower);
    const targetFunctionMatch = !!(jobFunctionLower && !currentFunctionMatch && targetFunctions.includes(jobFunctionLower));

    const jobIndustries = Array.isArray(job.industry) ? job.industry : [job.industry];
    const candText = (candidate.canonical_career_text || '').toLowerCase();
    const candSummary = (candidate.summary_text || '').toLowerCase();

    const candidateIndustryExperience = candidate.industry_experience?.map(i => i.toLowerCase()) || [];
    const industryInStructuredExperience = jobIndustries.some(jobInd =>
        candidateIndustryExperience.some(candInd =>
            candInd === jobInd.toLowerCase() ||
            areSkillsSimilar(candInd, jobInd.toLowerCase())
        )
    );

    const industryInExperience = jobIndustries.some(jobInd => {
        const lowerInd = jobInd.toLowerCase();
        return candidate.experiences?.some(
            exp => exp.description?.toLowerCase().includes(lowerInd)
        ) || candText.includes(lowerInd) || candSummary.includes(lowerInd);
    });

    const candIndPrefs = candidate.preferences?.industries?.map(i => i.toLowerCase()) || [];
    const industryInPreferences = jobIndustries.some(jobInd =>
        candIndPrefs.includes(jobInd.toLowerCase())
    );

    const hasIndustryEvidence =
        Boolean(candFunctionLower) ||
        targetFunctions.length > 0 ||
        candidateIndustryExperience.length > 0 ||
        Boolean(candText.trim()) ||
        Boolean(candSummary.trim()) ||
        Boolean(candidate.experiences?.length) ||
        candIndPrefs.length > 0;

    if (!hasIndustryEvidence) {
        industryAlignment = 0;
    } else if (currentFunctionMatch) {
        industryAlignment = 1.0;
    } else if (industryInStructuredExperience) {
        industryAlignment = 0.9;
    } else if (industryInExperience) {
        industryAlignment = 0.75;
    } else if (targetFunctionMatch) {
        // Aspires to this domain but doesn't currently work in it
        industryAlignment = 0.60;
    } else if (industryInPreferences) {
        industryAlignment = 0.45;
    } else {
        industryAlignment = 0.15;
    }

    if (hasSameRoleExperience) {
        industryAlignment = Math.max(industryAlignment, 0.65);
    }
    const industryScore = industryAlignment;

    // 5. Experience & Seniority removed from weighted ranking.
    const experienceScore = 0;

    // 6. Education Quality (10%)
    const educationScore = calculateEducationScore(job, candidate);

    // 7. Career Prestige (5%)
    const careerPrestigeScore = calculateCareerPrestigeScore(job, candidate);

    // Weighted score. Ranking weights are job-specific and normalized to 1.0.
    const rankingWeights = normalizeMatchingPillarWeights(job.ranking_weights);
    const weights = {
        semantic: rankingWeights.semantic,
        hard: rankingWeights.hard,
        constraint: 0.00,
        industry: rankingWeights.industry,
        experience: 0.00,
        education: rankingWeights.education,
        careerPrestige: rankingWeights.careerPrestige,
    };

    const finalScore =
        (semanticScore * weights.semantic) +
        (hardSkillsScore * weights.hard) +
        (constraintScore * weights.constraint) +
        (industryScore * weights.industry) +
        (experienceScore * weights.experience) +
        (educationScore * weights.education) +
        (careerPrestigeScore * weights.careerPrestige);

    return {
        finalScore: Math.min(1.0, Math.max(0, finalScore)),
        baseScore: finalScore,
        gatePenalty: 1,
        semanticScore,
        hardSkillsScore,
        industryScore,
        experienceScore,
        constraintScore,
        educationScore,
        careerPrestigeScore,
        weights: rankingWeights,
        algorithm_version: MATCHING_ALGORITHM_VERSION,
    };
};
