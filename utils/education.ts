import type { AppLanguage } from '../components/LanguageProvider';
import type { Education } from '../types';

export type EducationLevelCode =
    | 'PRIMARY'
    | 'LOWER_SECONDARY'
    | 'UPPER_SECONDARY'
    | 'BACHELOR'
    | 'ITS'
    | 'MASTER'
    | 'PHD';

export type EducationLevel = {
    code: EducationLevelCode;
    labelEn: string;
    labelIt: string;
    name: string;
    eqfLevel?: number;
    ordinal: number;
};

export const EDUCATION_LEVELS: EducationLevel[] = [
    {
        code: 'PRIMARY',
        labelEn: 'Primary school',
        labelIt: 'Scuola elementare',
        name: 'Primary school',
        ordinal: 1,
    },
    {
        code: 'LOWER_SECONDARY',
        labelEn: 'Lower secondary school',
        labelIt: 'Scuola media',
        name: 'Lower secondary school',
        ordinal: 2,
    },
    {
        code: 'UPPER_SECONDARY',
        labelEn: 'Upper secondary school',
        labelIt: 'Scuola superiore',
        name: 'Upper secondary school',
        ordinal: 3,
    },
    {
        code: 'BACHELOR',
        labelEn: "Bachelor's degree",
        labelIt: 'Laurea triennale',
        name: "Bachelor's degree",
        eqfLevel: 6,
        ordinal: 4,
    },
    {
        code: 'ITS',
        labelEn: 'ITS / short-cycle tertiary diploma',
        labelIt: 'ITS / diploma tecnico superiore',
        name: 'ITS / short-cycle tertiary diploma',
        eqfLevel: 5,
        ordinal: 5,
    },
    {
        code: 'MASTER',
        labelEn: "Master's degree",
        labelIt: 'Laurea magistrale',
        name: "Master's degree",
        eqfLevel: 7,
        ordinal: 6,
    },
    {
        code: 'PHD',
        labelEn: 'PhD / Doctorate',
        labelIt: 'Dottorato / PhD',
        name: 'PhD / Doctorate',
        eqfLevel: 8,
        ordinal: 7,
    },
];

const normalizeLookupValue = (value?: string | null): string =>
    (value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[._-]+/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ');

const EXACT_LEVEL_LOOKUP = new Map<string, EducationLevelCode>();

for (const level of EDUCATION_LEVELS) {
    EXACT_LEVEL_LOOKUP.set(normalizeLookupValue(level.code), level.code);
    EXACT_LEVEL_LOOKUP.set(normalizeLookupValue(level.labelEn), level.code);
    EXACT_LEVEL_LOOKUP.set(normalizeLookupValue(level.labelIt), level.code);
    EXACT_LEVEL_LOOKUP.set(normalizeLookupValue(level.name), level.code);
}

const LEGACY_LEVEL_LOOKUP: Record<string, EducationLevelCode> = {
    // Primary / lower secondary
    primary: 'PRIMARY',
    elementary: 'PRIMARY',
    'primary school': 'PRIMARY',
    elementare: 'PRIMARY',
    'scuola elementare': 'PRIMARY',
    'lower secondary': 'LOWER_SECONDARY',
    'lower secondary school': 'LOWER_SECONDARY',
    middle: 'LOWER_SECONDARY',
    'middle school': 'LOWER_SECONDARY',
    media: 'LOWER_SECONDARY',
    'scuola media': 'LOWER_SECONDARY',

    // Upper secondary
    hsd: 'UPPER_SECONDARY',
    highschool: 'UPPER_SECONDARY',
    'high school': 'UPPER_SECONDARY',
    'high school diploma': 'UPPER_SECONDARY',
    diploma: 'UPPER_SECONDARY',
    maturita: 'UPPER_SECONDARY',
    'scuola superiore': 'UPPER_SECONDARY',
    superiore: 'UPPER_SECONDARY',
    'upper secondary': 'UPPER_SECONDARY',
    'upper secondary school': 'UPPER_SECONDARY',
    other: 'UPPER_SECONDARY',
    'other other': 'UPPER_SECONDARY',

    // Short-cycle / ITS
    ad: 'ITS',
    associate: 'ITS',
    'associate degree': 'ITS',
    its: 'ITS',
    'istituto tecnico superiore': 'ITS',
    'diploma tecnico superiore': 'ITS',
    'higher technical institute': 'ITS',
    'short cycle': 'ITS',
    'short cycle tertiary': 'ITS',

    // Bachelor
    ba: 'BACHELOR',
    bsc: 'BACHELOR',
    beng: 'BACHELOR',
    btech: 'BACHELOR',
    bba: 'BACHELOR',
    bcom: 'BACHELOR',
    llb: 'BACHELOR',
    barch: 'BACHELOR',
    bachelor: 'BACHELOR',
    bachelors: 'BACHELOR',
    'bachelor degree': 'BACHELOR',
    'bachelor of arts': 'BACHELOR',
    'bachelor of science': 'BACHELOR',
    'bachelor of engineering': 'BACHELOR',
    'bachelor of technology': 'BACHELOR',
    'bachelor of business administration': 'BACHELOR',
    'bachelor of commerce': 'BACHELOR',
    'bachelor of laws': 'BACHELOR',
    'bachelor of architecture': 'BACHELOR',
    laurea: 'BACHELOR',
    triennale: 'BACHELOR',
    'laurea triennale': 'BACHELOR',
    undergraduate: 'BACHELOR',
    exchange: 'BACHELOR',
    'student exchange program': 'BACHELOR',
    'student exchange program exchange': 'BACHELOR',

    // Master / second cycle
    ma: 'MASTER',
    msc: 'MASTER',
    meng: 'MASTER',
    mba: 'MASTER',
    llm: 'MASTER',
    mfin: 'MASTER',
    mpa: 'MASTER',
    master: 'MASTER',
    masters: 'MASTER',
    'master degree': 'MASTER',
    'master of arts': 'MASTER',
    'master of science': 'MASTER',
    'master of engineering': 'MASTER',
    'master of business administration': 'MASTER',
    'master of laws': 'MASTER',
    'master of finance': 'MASTER',
    'master of public administration': 'MASTER',
    magistrale: 'MASTER',
    specialistica: 'MASTER',
    'laurea magistrale': 'MASTER',
    'laurea specialistica': 'MASTER',
    postgraduate: 'MASTER',

    // Doctoral / third cycle
    phd: 'PHD',
    dba: 'PHD',
    md: 'PHD',
    jd: 'PHD',
    doctorate: 'PHD',
    doctoral: 'PHD',
    doctor: 'PHD',
    'doctor of philosophy': 'PHD',
    'doctor of business administration': 'PHD',
    'doctor of medicine': 'PHD',
    'juris doctor': 'PHD',
    postdoc: 'PHD',
    postdoctoral: 'PHD',
    'postdoctoral research': 'PHD',
    dottorato: 'PHD',
    'dottorato di ricerca': 'PHD',
};

const FUZZY_LEVEL_RULES: Array<{ code: EducationLevelCode; terms: string[] }> = [
    { code: 'PHD', terms: ['postdoc', 'phd', 'doctor', 'dottorato'] },
    { code: 'MASTER', terms: ['master', 'msc', 'mba', 'magistrale', 'specialistica', 'postgraduate'] },
    { code: 'ITS', terms: ['associate', 'short cycle', 'its', 'tecnico superiore'] },
    { code: 'BACHELOR', terms: ['bachelor', 'bsc', 'beng', 'laurea', 'triennale', 'undergraduate'] },
    { code: 'UPPER_SECONDARY', terms: ['high school', 'maturita', 'scuola superiore', 'upper secondary', 'diploma'] },
    { code: 'LOWER_SECONDARY', terms: ['middle school', 'scuola media', 'lower secondary'] },
    { code: 'PRIMARY', terms: ['primary', 'elementary', 'elementare'] },
];

export const normalizeEducationLevelCode = (value?: string | null): EducationLevelCode | '' => {
    const normalized = normalizeLookupValue(value);
    if (!normalized) return '';

    const exact = EXACT_LEVEL_LOOKUP.get(normalized) || LEGACY_LEVEL_LOOKUP[normalized];
    if (exact) return exact;

    for (const rule of FUZZY_LEVEL_RULES) {
        if (rule.terms.some(term => normalized.includes(term))) {
            return rule.code;
        }
    }

    return '';
};

export const getEducationLevelLabel = (code: string, language: AppLanguage = 'en'): string => {
    if (!code) return '';
    const normalizedCode = normalizeEducationLevelCode(code);
    const level = EDUCATION_LEVELS.find(l => l.code === normalizedCode);
    if (!level) return code;
    return language === 'it' ? level.labelIt : level.labelEn;
};

export const getEducationLevelName = (code: string): string => getEducationLevelLabel(code, 'en');

export const getEducationLevelCode = (nameOrCode: string): string => normalizeEducationLevelCode(nameOrCode) || nameOrCode;

export const getEducationLevelOrdinal = (value?: string | null): number => {
    const normalizedCode = normalizeEducationLevelCode(value);
    return EDUCATION_LEVELS.find(level => level.code === normalizedCode)?.ordinal || 0;
};

export const normalizeEducationEntries = (education?: Education[] | null): Education[] =>
    Array.isArray(education)
        ? education.map(entry => ({
            ...entry,
            degree_level: normalizeEducationLevelCode(entry.degree_level) || entry.degree_level || '',
        }))
        : [];
