
export const SKILL_LEVELS = [
    { value: 2, label: 'Novice' },
    { value: 4, label: 'Competent' },
    { value: 6, label: 'Proficient' },
    { value: 8, label: 'Expert' },
    { value: 10, label: 'Master / Leading SME' }
];

export const SEEKER_SKILL_LEVELS = [
    { value: 3, label: 'Base' },
    { value: 6, label: 'Intermediate' },
    { value: 10, label: 'Expert' }
] as const;

export const getSeekerSkillLevelValue = (value?: number): 3 | 6 | 10 => {
    if ((value ?? 0) <= 4) return 3;
    if ((value ?? 0) <= 8) return 6;
    return 10;
};

export const getSeekerSkillLevelLabel = (value?: number): string => {
    const normalizedValue = getSeekerSkillLevelValue(value);
    return SEEKER_SKILL_LEVELS.find(level => level.value === normalizedValue)?.label || 'Intermediate';
};

export const getSkillLevelLabel = (value: number): string => {
    // Exact match
    const exact = SKILL_LEVELS.find(l => l.value === value);
    if (exact) return exact.label;

    // Handle odd numbers or values between thresholds
    if (value <= 1) return 'Entry Level';
    if (value < 2) return 'Entry / Novice';
    if (value > 2 && value < 4) return 'Novice / Competent';
    if (value > 4 && value < 6) return 'Competent / Proficient';
    if (value > 6 && value < 8) return 'Proficient / Expert';
    if (value > 8 && value < 10) return 'Expert / Master';

    // Fallbacks
    if (value <= 2) return 'Novice';
    if (value <= 4) return 'Competent';
    if (value <= 6) return 'Proficient';
    if (value <= 8) return 'Expert';
    return 'Master / Leading SME';
};
