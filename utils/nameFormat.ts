import { CandidateProfile, RecruiterProfile } from '../types';

const normalizeWhitespace = (value?: string | null) =>
    (value || '').trim().replace(/\s+/g, ' ');

const titleCaseSegment = (value: string) => {
    if (!value) return '';
    const lower = value.toLocaleLowerCase();
    return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
};

export const normalizePersonNamePart = (value?: string | null, fallback = ''): string => {
    const normalized = normalizeWhitespace(value);
    if (!normalized) return fallback;

    return normalized
        .split(/([ '\-])/)
        .map((segment) => (/^[ '\-]$/.test(segment) ? segment : titleCaseSegment(segment)))
        .join('');
};

export const normalizeFullName = (value?: string | null, fallback = ''): string => {
    const normalized = normalizeWhitespace(value);
    if (!normalized) return fallback;

    return normalized
        .split(/\s+/)
        .map((segment) => normalizePersonNamePart(segment))
        .filter(Boolean)
        .join(' ');
};

export const buildNormalizedFullName = (firstName?: string | null, lastName?: string | null): string =>
    [normalizePersonNamePart(firstName), normalizePersonNamePart(lastName)]
        .filter(Boolean)
        .join(' ')
        .trim();

export const normalizeCandidateProfileNames = (candidate: CandidateProfile): CandidateProfile => ({
    ...candidate,
    personal_info: {
        ...candidate.personal_info,
        first_name: normalizePersonNamePart(candidate.personal_info?.first_name),
        last_name: normalizePersonNamePart(candidate.personal_info?.last_name),
    },
});

export const normalizeRecruiterProfileNames = (recruiter: RecruiterProfile): RecruiterProfile => ({
    ...recruiter,
    first_name: normalizePersonNamePart(recruiter.first_name),
    last_name: normalizePersonNamePart(recruiter.last_name),
});

export const formatCandidateName = (candidate?: CandidateProfile | null): string =>
    buildNormalizedFullName(candidate?.personal_info?.first_name, candidate?.personal_info?.last_name);

export const formatRecruiterName = (recruiter?: RecruiterProfile | null): string =>
    buildNormalizedFullName(recruiter?.first_name, recruiter?.last_name);

export const toSafeFilenameNamePart = (value?: string | null, fallback = 'Candidate'): string => {
    const normalized = normalizePersonNamePart(value, fallback)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    return normalized
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        || fallback;
};
