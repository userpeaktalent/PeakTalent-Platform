
import { CandidateProfile, JobProfile } from "../types";
import { cleanJson } from "../services/geminiService";
import { getGenerativeModel } from "../services/geminiClient";
import { getModel } from "../config/aiModels";
import { EDUCATION_LEVELS } from "../utils/education";
import { MAJORS } from "../utils/majors";

// Robust UUID generator for insecure contexts (HTTP)
export const generateUUID = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback for non-secure contexts
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// --- Randomized Data Pools for fallbacks ---
const FIRST_NAMES = ['Marco', 'Sofia', 'Luca', 'Elena', 'Giulia', 'Alessandro', 'Sara', 'Roberto', 'Paola', 'Matteo', 'Chiara', 'Davide', 'Fabio', 'Valentina', 'Giorgio', 'Anna', 'Pierre', 'Marie', 'Hans', 'Yuki'];
const LAST_NAMES = ['Rossi', 'Bianchi', 'Ferrari', 'Rizzo', 'Moretti', 'Galli', 'Costa', 'Fontana', 'Müller', 'Schmidt', 'Tanaka', 'Dupont', 'Martin', 'Garcia', 'Longo'];
const CITIES = [{ city: 'Milan', country: 'it' }, { city: 'Rome', country: 'it' }, { city: 'Berlin', country: 'de' }, { city: 'Paris', country: 'fr' }, { city: 'London', country: 'gb' }, { city: 'Amsterdam', country: 'nl' }];
const SENIORITIES = ['intern', 'junior', 'mid', 'senior', 'lead'] as const;
const JOB_FUNCTIONS = [
    'accounting',
    'administration',
    'analytics_business_intelligence',
    'architecture_construction',
    'business_development',
    'compliance_risk',
    'consulting',
    'content_communications',
    'customer_success',
    'data_engineering',
    'data_science',
    'design',
    'devops_infrastructure',
    'education_teaching',
    'electrical_electronics_engineering',
    'engineering',
    'executive',
    'field_service',
    'finance',
    'hardware_engineering',
    'healthcare_clinical',
    'human_resources',
    'investment_ma',
    'laboratory_research',
    'legal',
    'manufacturing_production',
    'marketing',
    'mechanical_engineering',
    'operations',
    'process_engineering',
    'procurement',
    'product_management',
    'project_management',
    'public_policy_government_affairs',
    'quality_assurance',
    'real_estate',
    'research_development',
    'sales',
    'security',
    'software_engineering',
    'supply_chain_logistics',
];
const SECTORS = ['Technology', 'Finance', 'Healthcare', 'E-commerce', 'Green Energy', 'Consulting', 'Automotive', 'Telecom'];
const COMPANIES = ['NexGen Solutions', 'Global Horizon', 'InnoTech S.p.A.', 'Apex Systems', 'BlueWave Corp', 'DataCore GmbH', 'CloudSpark', 'FinEdge'];
const TECH_SKILLS = ['Cloud Architecture', 'System Design', 'Data Analysis', 'Machine Learning', 'Project Management', 'DevOps', 'Cybersecurity'];
const IT_SKILLS = ['React', 'Node.js', 'TypeScript', 'Python', 'Go', 'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'Java', 'C#', 'Terraform'];
const SOFT_SKILLS = ['Communication', 'Leadership', 'Problem Solving', 'Teamwork', 'Adaptability', 'Critical Thinking', 'Time Management'];
const CONTRACTS = ['full_time', 'part_time', 'internship', 'collaboration'] as const;
const REMOTE_POLICIES = ['full_remote', 'hybrid', 'none'] as const;
const DEGREE_LEVELS = EDUCATION_LEVELS.map(l => l.code);
const MAJOR_CODES = MAJORS.map(m => m.code);
const INSTITUTIONS = ['Politecnico di Milano', 'University of Bologna', 'TU Berlin', 'ETH Zurich', 'Sorbonne University', 'Imperial College London'];

const pick = <T,>(arr: T[] | readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const pickN = <T,>(arr: T[], n: number): T[] => [...arr].sort(() => 0.5 - Math.random()).slice(0, Math.min(n, arr.length));
const randRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// --- Fallback Generators ---
const fallbackCandidate = (): Partial<CandidateProfile> => {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const loc = pick(CITIES);
    const seniority = pick(SENIORITIES);
    const suffix = Math.random().toString(36).substring(7);
    const yoe = seniority === 'intern' ? 0 : seniority === 'junior' ? randRange(1, 2) : seniority === 'mid' ? randRange(3, 5) : seniority === 'senior' ? randRange(6, 10) : randRange(10, 15);
    const jobFunc = pick(JOB_FUNCTIONS);

    const skills = pickN(TECH_SKILLS, randRange(2, 4)).map((s, i) => ({ skill_name: s, level: randRange(4, 9), rank: i + 1, level_source: 'cv_only' as const, level_confidence: 'medium' as const }));
    const itSkills = pickN(IT_SKILLS, randRange(2, 5)).map((s, i) => ({ skill_name: s, level: randRange(4, 9), rank: i + 1, level_source: 'cv_only' as const, level_confidence: 'medium' as const }));
    const softSkills = pickN(SOFT_SKILLS, randRange(2, 3)).map(s => ({ skill_name: s }));

    return {
        id: generateUUID(),
        personal_info: { first_name: firstName, last_name: lastName },
        residence: { country: loc.country, city: loc.city },
        contacts: { email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}_${suffix}@gmail.com`, phone: "+39 333 0000000" },
        current_job_function: jobFunc,
        current_seniority_level: seniority,
        total_years_experience: yoe,
        notice_period_months: randRange(0, 3),
        job_search_status: pick(['actively_looking', 'open_to_offers', 'casually_browsing']),
        target_job_functions: [jobFunc, pick(JOB_FUNCTIONS)],
        skills,
        it_skills: itSkills,
        soft_skills: softSkills,
        languages: [{ language: 'en', level: 'C1' }, { language: pick(['it', 'de', 'fr', 'es']), level: pick(['B1', 'B2', 'C1']) }],
        certifications: [],
        preferences: {
            preferred_locations: [{ country: loc.country, city: loc.city }],
            remote: pick(REMOTE_POLICIES),
            work_eligibility_countries: [loc.country],
            desired_contract_types: [pick(CONTRACTS)],
            industries: [pick(SECTORS)],
        },
        summary_text: `${firstName} ${lastName} is a ${seniority} professional with ${yoe} years of experience in ${jobFunc.replace(/_/g, ' ')}. Based in ${loc.city}, ${loc.country.toUpperCase()}, specializing in ${skills.map(s => s.skill_name).join(', ')} with strong ${itSkills.map(s => s.skill_name).slice(0, 3).join(', ')} skills.`,
        experiences: [{
            role: `${seniority.charAt(0).toUpperCase() + seniority.slice(1)} ${jobFunc.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
            company: pick(COMPANIES),
            location: { country: loc.country, city: loc.city },
            from: `${2024 - yoe}-01`,
            to: 'present',
            is_current_position: true,
            description: `Working on ${skills[0]?.skill_name || 'various projects'} using ${itSkills[0]?.skill_name || 'modern tools'}.`
        }],
        education: [{
            institution: pick(INSTITUTIONS),
            degree_level: pick(DEGREE_LEVELS),
            major: pick(MAJOR_CODES),
            from: `${2024 - yoe - 4}-09`,
            to: `${2024 - yoe}-06`,
            currently_pursuing: false
        }],
    };
};

const fallbackJob = (): JobProfile => {
    const loc = pick(CITIES);
    const seniority = pick(SENIORITIES);
    const company = pick(COMPANIES);
    const sector = pick(SECTORS);
    const jobFunc = pick(JOB_FUNCTIONS);
    const title = `${seniority.charAt(0).toUpperCase() + seniority.slice(1)} ${jobFunc.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
    const skills = pickN(TECH_SKILLS, randRange(2, 4)).map(s => ({ skill_name: s, level: randRange(4, 8), must: Math.random() > 0.4 }));
    const itSkills = pickN(IT_SKILLS, randRange(2, 5)).map(s => ({ skill_name: s, level: randRange(4, 8), must: Math.random() > 0.5 }));
    const softSkills = pickN(SOFT_SKILLS, randRange(2, 3)).map(s => ({ skill_name: s, must: Math.random() > 0.5 }));
    const minSalary = randRange(25, 60) * 1000;

    return {
        id: generateUUID(),
        title,
        company_name: company,
        industry: [sector],
        job_function: jobFunc,
        seniority_level: seniority,
        experience_required: seniority === 'intern' ? 0 : seniority === 'junior' ? 1 : seniority === 'mid' ? 3 : seniority === 'senior' ? 5 : 8,
        job_description: `${company} is looking for a ${title} to join our ${sector} team in ${loc.city}. You will work on ${skills.map(s => s.skill_name).join(', ')}.`,
        summary_text: `${title} position at ${company} in ${loc.city}, ${loc.country.toUpperCase()}. Requires ${skills.filter(s => s.must).map(s => s.skill_name).join(', ')} and experience with ${itSkills.filter(s => s.must).map(s => s.skill_name).join(', ')}.`,
        skills,
        it_skills: itSkills,
        soft_skills: softSkills,
        constraints: {
            contract_type: pick(CONTRACTS),
            remote: pick(REMOTE_POLICIES),
            location: { city: loc.city, country: loc.country },
            salary_eur: { min: minSalary, max: minSalary + randRange(10, 30) * 1000 },
        }
    };
};

// --- Full schema reference for AI prompts ---
const CANDIDATE_SCHEMA_REF = `{
  "personal_info": { "first_name": string, "last_name": string, "pronoun": string },
  "residence": { "country": string (ISO 2-letter), "city": string },
  "contacts": { "email": string, "phone": string },
  "current_job_function": string (e.g. "software_engineering", "product_management", "data_science", "marketing", "sales"),
  "current_seniority_level": "intern" | "junior" | "mid" | "senior" | "lead",
  "total_years_experience": number,
  "notice_period_months": number,
  "job_search_status": "actively_looking" | "open_to_offers" | "casually_browsing",
  "target_job_functions": string[],
  "skills": [{ "skill_name": string, "level": 1-10, "rank": number, "level_source": "cv_only" }],
  "it_skills": [{ "skill_name": string, "level": 1-10, "rank": number, "level_source": "cv_only" }],
  "soft_skills": [{ "skill_name": string }],
  "languages": [{ "language": string (ISO 2-letter), "level": "A1"|"A2"|"B1"|"B2"|"C1"|"C2" }],
  "certifications": [{ "name": string, "date": "YYYY-MM" }],
  "preferences": {
    "preferred_locations": [{ "country": string, "city": string }],
    "remote": "full_remote" | "hybrid" | "none" | "no_preference",
    "desired_contract_types": string[],
    "industries": string[],
    "work_eligibility_countries": string[],
    "salary_eur": { "min": number, "flexibility": boolean }
  },
  "summary_text": string (2-3 sentence career summary),
  "experiences": [{ "role": string, "company": string, "location": { "country": string, "city": string }, "from": "YYYY-MM", "to": "YYYY-MM" or "present", "is_current_position": boolean, "description": string }],
  "education": [{ "institution": string, "degree_level": "PRIMARY"|"LOWER_SECONDARY"|"UPPER_SECONDARY"|"BACHELOR"|"ITS"|"MASTER"|"PHD", "major": string, "from": "YYYY-MM", "to": "YYYY-MM", "currently_pursuing": boolean }]
}`;

const JOB_SCHEMA_REF = `{
  "title": string,
  "company_name": string,
  "industry": string,
  "job_function": string (e.g. "software_engineering", "product_management", "data_science"),
  "seniority_level": "intern" | "junior" | "mid" | "senior" | "lead",
  "experience_required": number,
  "job_description": string (3-5 sentences describing the role),
  "summary_text": string (1-2 sentence summary for matching),
  "skills": [{ "skill_name": string, "level": 1-10, "must": boolean }],
  "it_skills": [{ "skill_name": string, "level": 1-10, "must": boolean }],
  "soft_skills": [{ "skill_name": string, "must": boolean }],
  "constraints": {
    "contract_type": "full_time" | "part_time" | "internship" | "collaboration",
    "remote": "full_remote" | "hybrid" | "none" | "no_preference",
    "location": { "country": string (ISO 2-letter), "city": string },
    "salary_eur": { "min": number, "max": number },
    "languages": [{ "language": string, "level": string }]
  }
}`;

export const generateFakeCandidate = async (): Promise<Partial<CandidateProfile>> => {
    try {
        const model = getGenerativeModel({
            model: getModel('fakeDataGen'),
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Generate a realistic, randomized candidate profile for a European tech/business professional.
        
REQUIREMENTS:
- Randomize everything: name, nationality, city, seniority, skills, experience
- Use diverse European names and cities (Italy, Germany, France, UK, Netherlands, Spain)
- Vary seniority from intern to lead
- Include 2-5 technical skills, 2-5 IT/software skills, 2-3 soft skills
- Include 1-3 work experiences with realistic descriptions
- Include 1-2 education entries
- Provide a realistic 2-3 sentence summary_text for semantic matching
- Do NOT include an "id" field, I will add it myself

EXACT JSON SCHEMA (follow precisely):
${CANDIDATE_SCHEMA_REF}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const data = JSON.parse(cleanJson(text));

        const suffix = Math.random().toString(36).substring(7);
        const sanitize = (str: string) => str ? str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'user';

        // Override contacts to ensure unique email
        data.contacts = {
            email: `${sanitize(data.personal_info?.first_name || 'user')}.${sanitize(data.personal_info?.last_name || 'test')}_${suffix}@gmail.com`,
            phone: data.contacts?.phone || "+1 555 0199"
        };
        data.id = generateUUID();

        // Ensure essential fields exist
        if (!data.preferences) {
            data.preferences = {
                preferred_locations: [data.residence || { country: 'it' }],
                remote: 'hybrid',
                work_eligibility_countries: [data.residence?.country || 'it']
            };
        }
        if (!data.experiences) data.experiences = [];
        if (!data.education) data.education = [];
        if (!data.certifications) data.certifications = [];
        if (!data.skills) data.skills = [];
        if (!data.it_skills) data.it_skills = [];
        if (!data.soft_skills) data.soft_skills = [];
        if (!data.languages) data.languages = [{ language: 'en', level: 'C1' }];
        if (!data.summary_text) {
            data.summary_text = `${data.personal_info?.first_name || 'Candidate'} ${data.personal_info?.last_name || ''} is a ${data.current_seniority_level || 'mid'}-level professional with experience in ${data.current_job_function || 'technology'}.`;
        }

        return data as CandidateProfile;
    } catch (error) {
        console.error("AI Generation failed, using fallback.", error);
        return fallbackCandidate();
    }
}

export const generateFakeJob = async (): Promise<JobProfile> => {
    try {
        const model = getGenerativeModel({
            model: getModel('fakeDataGen'),
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Generate a realistic job posting for a European company.

REQUIREMENTS:
- Randomize: company name, industry, city, seniority, required skills
- Use diverse European cities and real-sounding company names
- Vary seniority from intern to lead
- Include 2-4 technical skills (must/nice-to-have), 2-5 IT skills, 2-3 soft skills
- Include a realistic job_description (3-5 sentences)
- Include a summary_text for semantic matching (1-2 sentences)
- Do NOT include an "id" field

EXACT JSON SCHEMA (follow precisely):
${JOB_SCHEMA_REF}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const data = JSON.parse(cleanJson(text));

        data.id = generateUUID();
        if (!data.constraints) data.constraints = { contract_type: 'full_time', remote: 'hybrid', location: { city: 'Remote', country: 'US' } };
        if (!data.summary_text) data.summary_text = `${data.title || 'Job'} at ${data.company_name || 'Company'}. ${data.job_description?.substring(0, 100) || ''}`;

        return data as JobProfile;
    } catch (error) {
        console.error("AI Generation failed, using fallback.", error);
        return fallbackJob();
    }
}
