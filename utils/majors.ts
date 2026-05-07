export interface Major {
    code: string;
    name: string;
}

export const MAJORS: Major[] = [
    { code: 'IngAero', name: 'Aerospace Engineering' },
    { code: 'IngAuto', name: 'Automation Engineering' },
    { code: 'IngBioMed', name: 'Biomedical Engineering' },
    { code: 'IngChim', name: 'Chemical Engineering' },
    { code: 'IngCivil', name: 'Civil Engineering' },
    { code: 'IngMat', name: 'Materials Engineering' },
    { code: 'IngSysInd', name: 'Industrial Systems Engineering' },
    { code: 'IngLog', name: 'Logistics Engineering' },
    { code: 'IngProd', name: 'Production Engineering' },
    { code: 'IngSic', name: 'Industrial Safety Engineering' },
    { code: 'IngElec', name: 'Electronic Engineering' },
    { code: 'IngEner', name: 'Energy Engineering' },
    { code: 'IngGest', name: 'Management Engineering' },
    { code: 'IngGestInd', name: 'Industrial Management Engineering' },
    { code: 'IngInfo', name: 'Computer Engineering' },
    { code: 'IngInd', name: 'Industrial Engineering' },
    { code: 'IngMech', name: 'Mechanical Engineering' },
    { code: 'IngMecc', name: 'Mechatronics Engineering' },
    { code: 'IngRobot', name: 'Robotics Engineering' },
    { code: 'IngTelecom', name: 'Telecommunications Engineering' },
    { code: 'IngInfoAdv', name: 'Information Engineering' },
    { code: 'IngAmbTerr', name: 'Environmental and Land Engineering' },
    { code: 'IngNavMar', name: 'Naval and Maritime Engineering' },
    { code: 'IngEnerNuc', name: 'Energy and Nuclear Engineering' },
    { code: 'IngSysCompl', name: 'Complex Systems Engineering' },
    { code: 'IngSicProt', name: 'Safety and Protection Engineering' },
    { code: 'IngEdile', name: 'Building Engineering' },
    { code: 'IngGestCost', name: 'Construction Management Engineering' },
    { code: 'Acct', name: 'Accounting' },
    { code: 'ActSci', name: 'Actuarial Science' },
    { code: 'Agri', name: 'Agriculture' },
    { code: 'Anthro', name: 'Anthropology' },
    { code: 'Arch', name: 'Architecture' },
    { code: 'ArtDes', name: 'Art & Design' },
    { code: 'ArtsHum', name: 'Arts & Humanities' },
    { code: 'Bio', name: 'Biology' },
    { code: 'BioMedSci', name: 'Biomedical Sciences' },
    { code: 'BusAdmin', name: 'Business Administration' },
    { code: 'Chem', name: 'Chemistry' },
    { code: 'Comm', name: 'Communications' },
    { code: 'CS', name: 'Computer Science' },
    { code: 'DataSci', name: 'Data Science' },
    { code: 'Econ', name: 'Economics' },
    { code: 'Edu', name: 'Education' },
    { code: 'ECE', name: 'Electrical & Computer Engineering' },
    { code: 'EnvSci', name: 'Environmental Science' },
    { code: 'Fin', name: 'Finance' },
    { code: 'LangLingu', name: 'Foreign Languages & Linguistics' },
    { code: 'Geog', name: 'Geography' },
    { code: 'Geol', name: 'Geology' },
    { code: 'HealthSci', name: 'Health Sciences' },
    { code: 'Hist', name: 'History' },
    { code: 'Law', name: 'Law' },
    { code: 'Mkt', name: 'Marketing' },
    { code: 'Math', name: 'Mathematics' },
    { code: 'MediaJ', name: 'Media & Journalism' },
    { code: 'Music', name: 'Music' },
    { code: 'Nurs', name: 'Nursing' },
    { code: 'Nut', name: 'Nutrition' },
    { code: 'Pharm', name: 'Pharmacy' },
    { code: 'Phys', name: 'Physics' },
    { code: 'PolSci', name: 'Political Science' },
    { code: 'Psych', name: 'Psychology' },
    { code: 'PubAdmin', name: 'Public Administration' },
    { code: 'PubHealth', name: 'Public Health' },
    { code: 'SocSci', name: 'Social Sciences' },
    { code: 'Soc', name: 'Sociology' },
    { code: 'Stat', name: 'Statistics' },
    { code: 'PerformArt', name: 'Theatre & Performing Arts' },
    { code: 'VisPerfArt', name: 'Visual & Performing Arts' },
    { code: 'HS', name: 'High School / Secondary Education' },
    { code: 'IB', name: 'International Baccalaureate' },
    { code: 'GED', name: 'GED / Equivalent Diploma' }
];

export const getMajorName = (code: string): string => {
    if (!code) return '';
    const major = MAJORS.find(m => m.code === code || m.name === code);
    return major ? major.name : code;
};

export const getMajorByCode = (code: string): Major | undefined => {
    if (!code) return undefined;
    return MAJORS.find(m => m.code === code || m.name === code);
};
