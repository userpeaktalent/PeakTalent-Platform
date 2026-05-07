export const EDUCATION_LEVELS = [
    { code: 'HSD', name: 'High School Diploma (HSD)' },
    { code: 'AD', name: 'Associate Degree (AD)' },
    { code: 'BA', name: 'Bachelor of Arts (BA)' },
    { code: 'BSc', name: 'Bachelor of Science (BSc)' },
    { code: 'BEng', name: 'Bachelor of Engineering (BEng)' },
    { code: 'BTech', name: 'Bachelor of Technology (BTech)' },
    { code: 'BBA', name: 'Bachelor of Business Administration (BBA)' },
    { code: 'BCom', name: 'Bachelor of Commerce (BCom)' },
    { code: 'LLB', name: 'Bachelor of Laws (LLB)' },
    { code: 'BArch', name: 'Bachelor of Architecture (BArch)' },
    { code: 'MA', name: 'Master of Arts (MA)' },
    { code: 'MSc', name: 'Master of Science (MSc)' },
    { code: 'MEng', name: 'Master of Engineering (MEng)' },
    { code: 'MBA', name: 'Master of Business Administration (MBA)' },
    { code: 'LLM', name: 'Master of Laws (LLM)' },
    { code: 'MFin', name: 'Master of Finance (MFin)' },
    { code: 'MPA', name: 'Master of Public Administration (MPA)' },
    { code: 'PhD', name: 'Doctor of Philosophy (PhD)' },
    { code: 'DBA', name: 'Doctor of Business Administration (DBA)' },
    { code: 'MD', name: 'Doctor of Medicine (MD)' },
    { code: 'JD', name: 'Juris Doctor (JD)' },
    { code: 'Postdoc', name: 'Postdoctoral Research (Postdoc)' },
    { code: 'Exchange', name: 'Student Exchange Program (Exchange)' },
    { code: 'Other', name: 'Other (Other)' }
];

export const getEducationLevelName = (code: string): string => {
    if (!code) return '';
    const level = EDUCATION_LEVELS.find(l => l.code === code || l.name === code);
    return level ? level.name : code;
};

export const getEducationLevelCode = (nameOrCode: string): string => {
    if (!nameOrCode) return '';
    const level = EDUCATION_LEVELS.find(l => l.code === nameOrCode || l.name === nameOrCode);
    return level ? level.code : nameOrCode;
};
