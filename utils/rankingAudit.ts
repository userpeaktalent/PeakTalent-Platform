import { calculateMatchScore, isEligible } from './matchingUtils';
import { CandidateProfile, JobProfile, MatchScoreBreakdown } from '../types';

type RankedCandidate = {
    candidate: CandidateProfile;
    eligible: boolean;
    score?: MatchScoreBreakdown;
};

type JobExpectation = {
    expectedTopIds: string[];
    expectedBottomIds: string[];
    ineligibleIds?: string[];
    minTopScore?: number;
    minGapVsBottom?: number;
};

const pad = (value: string, width: number) => value.padEnd(width, ' ');

function candidateBase(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
    return {
        id: 'cand_base',
        personal_info: { first_name: 'Base', last_name: 'Candidate' },
        contacts: { email: 'base@example.com', phone: '000' },
        residence: { country: 'ch', city: 'Geneva' },
        current_job_function: 'engineering',
        current_seniority_level: 'mid',
        target_job_functions: ['engineering'],
        industry_experience: ['Technology'],
        total_years_experience: 5,
        notice_period_months: 1,
        job_search_status: 'actively_looking',
        skills: [],
        it_skills: [],
        soft_skills: [],
        languages: [{ language: 'English', level: 'C1' }],
        certifications: [],
        preferences: {
            preferred_locations: [{ country: 'ch', city: 'Geneva' }],
            remote: 'hybrid',
            desired_contract_types: ['full_time'],
            industries: ['Technology'],
            work_eligibility_countries: ['ch', 'eu'],
            salary_eur: { min: 80000, flexibility: false },
        },
        summary_text: 'Generic candidate summary.',
        canonical_career_text: 'Generic candidate career text.',
        experiences: [
            {
                role: 'Engineer',
                company: 'Example Corp',
                location: { country: 'ch', city: 'Geneva' },
                from: '2021-01',
                to: 'present',
                is_current_position: true,
                description: 'Built software systems.',
            },
        ],
        education: [
            {
                institution: 'EPFL',
                degree_level: 'MSc',
                major: 'Computer Science',
                currently_pursuing: false,
                from: '2016-09',
                to: '2018-06',
                final_mark: 5.5,
                final_mark_scale: '6',
            },
        ],
        embedding_vector: [0.8, 0.6, 0.4, 0.2, 0.1],
        ...overrides,
    };
}

function jobBase(overrides: Partial<JobProfile> = {}): JobProfile {
    return {
        id: 'job_base',
        title: 'Base Job',
        industry: ['Technology'],
        company_name: 'Example Corp',
        job_function: 'engineering',
        seniority_level: 'mid',
        experience_required: 4,
        job_description: 'Generic job description.',
        full_job_posting_description: 'Generic full job posting description.',
        summary_text: 'Generic summary.',
        skills: [],
        it_skills: [],
        soft_skills: [],
        constraints: {
            contract_type: 'full_time',
            location: { country: 'ch', city: 'Geneva' },
            remote: 'hybrid',
            languages: [{ language: 'English', level: 'B2' }],
            salary_eur: { min: 70000, max: 120000 },
        },
        embedding_vector: [0.8, 0.6, 0.4, 0.2, 0.1],
        ...overrides,
    };
}

const candidates: CandidateProfile[] = [
    candidateBase({
        id: 'cand_frontend_star',
        contacts: { email: 'frontend.star@example.com', phone: '100' },
        current_seniority_level: 'senior',
        total_years_experience: 8,
        target_job_functions: ['engineering', 'frontend_engineering'],
        industry_experience: ['Technology', 'SaaS'],
        skills: [
            { skill_name: 'React', level: 9, rank: 1, level_source: 'chat_validated', level_confidence: 'high' },
            { skill_name: 'TypeScript', level: 9, rank: 2, level_source: 'chat_validated', level_confidence: 'high' },
            { skill_name: 'GraphQL', level: 7, rank: 3, level_source: 'cv_only', level_confidence: 'medium' },
        ],
        it_skills: [
            { skill_name: 'Docker', level: 6, rank: 1, level_source: 'cv_only', level_confidence: 'medium' },
            { skill_name: 'AWS', level: 6, rank: 2, level_source: 'cv_only', level_confidence: 'medium' },
        ],
        soft_skills: [{ skill_name: 'Leadership' }, { skill_name: 'Communication' }, { skill_name: 'Problem Solving' }],
        summary_text: 'Senior frontend engineer delivering React and TypeScript platforms.',
        canonical_career_text: 'Senior frontend engineer who built large React and TypeScript applications in SaaS.',
        experiences: [
            {
                role: 'Senior Frontend Engineer',
                company: 'Google',
                location: { country: 'ch', city: 'Geneva' },
                from: '2020-01',
                to: 'present',
                is_current_position: true,
                description: 'Led frontend architecture for React and TypeScript applications in the technology sector.',
            },
        ],
    }),
    candidateBase({
        id: 'cand_frontend_near_miss',
        contacts: { email: 'frontend.near@example.com', phone: '101' },
        current_seniority_level: 'mid',
        total_years_experience: 5,
        industry_experience: ['Technology'],
        skills: [
            { skill_name: 'React', level: 8, rank: 1, level_source: 'cv_only', level_confidence: 'medium' },
            { skill_name: 'JavaScript', level: 8, rank: 2, level_source: 'cv_only', level_confidence: 'medium' },
        ],
        it_skills: [{ skill_name: 'Docker', level: 4, rank: 1, level_source: 'cv_only', level_confidence: 'low' }],
        soft_skills: [{ skill_name: 'Communication' }],
        preferences: {
            preferred_locations: [{ country: 'ch', city: 'Lausanne' }],
            remote: 'hybrid',
            desired_contract_types: ['full_time'],
            industries: ['Technology'],
            work_eligibility_countries: ['ch'],
            salary_eur: { min: 85000, flexibility: true },
        },
        summary_text: 'Frontend developer with strong React experience.',
        canonical_career_text: 'Mid-level frontend developer shipping React user interfaces.',
    }),
    candidateBase({
        id: 'cand_data_scientist',
        contacts: { email: 'data.scientist@example.com', phone: '102' },
        current_job_function: 'data_science',
        current_seniority_level: 'senior',
        target_job_functions: ['data_science', 'machine_learning'],
        industry_experience: ['Healthcare', 'Technology'],
        total_years_experience: 7,
        skills: [
            { skill_name: 'Machine Learning', level: 9, rank: 1, level_source: 'chat_validated', level_confidence: 'high' },
            { skill_name: 'Statistics', level: 8, rank: 2, level_source: 'chat_validated', level_confidence: 'high' },
            { skill_name: 'Experimentation', level: 8, rank: 3, level_source: 'cv_only', level_confidence: 'medium' },
        ],
        it_skills: [
            { skill_name: 'Python', level: 9, rank: 1, level_source: 'chat_validated', level_confidence: 'high' },
            { skill_name: 'SQL', level: 8, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
            { skill_name: 'AWS', level: 6, rank: 3, level_source: 'cv_only', level_confidence: 'medium' },
        ],
        soft_skills: [{ skill_name: 'Communication' }, { skill_name: 'Analytical Thinking' }],
        preferences: {
            preferred_locations: [{ country: 'de', city: 'Berlin' }],
            remote: 'full_remote',
            desired_contract_types: ['full_time'],
            industries: ['Healthcare', 'Technology'],
            work_eligibility_countries: ['eu'],
            salary_eur: { min: 95000, flexibility: false },
        },
        summary_text: 'Senior data scientist building production ML systems for healthcare.',
        canonical_career_text: 'Senior data scientist building machine learning systems, experimentation platforms, and Python services in healthcare.',
        experiences: [
            {
                role: 'Senior Data Scientist',
                company: 'DeepMind',
                location: { country: 'de', city: 'Berlin' },
                from: '2021-01',
                to: 'present',
                is_current_position: true,
                description: 'Built machine learning models and experimentation pipelines for healthcare products.',
            },
        ],
        test_results: [{ job_id: 'job_ml_platform', score: 94, completed_at: '2026-03-17T09:00:00Z' }],
        embedding_vector: [0.91, 0.72, 0.18, 0.12, 0.06],
    }),
    candidateBase({
        id: 'cand_ml_researcher_ineligible',
        contacts: { email: 'ml.researcher@example.com', phone: '103' },
        current_job_function: 'data_science',
        current_seniority_level: 'senior',
        target_job_functions: ['data_science'],
        industry_experience: ['Healthcare'],
        total_years_experience: 9,
        preferences: {
            preferred_locations: [{ country: 'us', city: 'Boston' }],
            remote: 'none',
            desired_contract_types: ['full_time'],
            industries: ['Healthcare'],
            work_eligibility_countries: ['us'],
            salary_eur: { min: 110000, flexibility: false },
        },
        skills: [
            { skill_name: 'Machine Learning', level: 10, rank: 1, level_source: 'chat_validated', level_confidence: 'high' },
            { skill_name: 'Statistics', level: 9, rank: 2, level_source: 'chat_validated', level_confidence: 'high' },
        ],
        it_skills: [
            { skill_name: 'Python', level: 10, rank: 1, level_source: 'chat_validated', level_confidence: 'high' },
            { skill_name: 'SQL', level: 8, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
        ],
        soft_skills: [{ skill_name: 'Communication' }],
        summary_text: 'Top ML researcher but not work eligible in Europe.',
        canonical_career_text: 'Machine learning researcher with strong healthcare background but no EU work eligibility.',
        embedding_vector: [0.92, 0.75, 0.17, 0.11, 0.05],
    }),
    candidateBase({
        id: 'cand_project_pm',
        contacts: { email: 'project.pm@example.com', phone: '104' },
        current_job_function: 'operations',
        current_seniority_level: 'senior',
        target_job_functions: ['operations', 'project_management'],
        industry_experience: ['Renewable Energy', 'Infrastructure'],
        total_years_experience: 10,
        notice_period_months: 2,
        skills: [
            { skill_name: 'Project Management', level: 9, rank: 1, level_source: 'chat_validated', level_confidence: 'high' },
            { skill_name: 'Risk Management', level: 8, rank: 2, level_source: 'chat_validated', level_confidence: 'high' },
            { skill_name: 'Stakeholder Management', level: 8, rank: 3, level_source: 'cv_only', level_confidence: 'high' },
        ],
        it_skills: [
            { skill_name: 'Microsoft Excel', level: 8, rank: 1, level_source: 'cv_only', level_confidence: 'high' },
            { skill_name: 'Primavera P6', level: 7, rank: 2, level_source: 'cv_only', level_confidence: 'medium' },
        ],
        soft_skills: [{ skill_name: 'Leadership' }, { skill_name: 'Communication' }],
        preferences: {
            preferred_locations: [{ country: 'it', city: 'Milan' }],
            remote: 'hybrid',
            desired_contract_types: ['full_time'],
            industries: ['Renewable Energy', 'Infrastructure'],
            work_eligibility_countries: ['it', 'eu'],
            salary_eur: { min: 70000, flexibility: true },
        },
        summary_text: 'Project manager delivering renewable energy infrastructure programs.',
        canonical_career_text: 'Project manager in renewable energy and infrastructure managing risk, schedules, and stakeholders.',
        experiences: [
            {
                role: 'Project Manager',
                company: 'Siemens',
                location: { country: 'it', city: 'Milan' },
                from: '2019-01',
                to: 'present',
                is_current_position: true,
                description: 'Managed renewable energy infrastructure projects, stakeholder communication, and risk.',
            },
        ],
        embedding_vector: [0.44, 0.31, 0.85, 0.62, 0.19],
    }),
    candidateBase({
        id: 'cand_marketing_manager',
        contacts: { email: 'marketing.manager@example.com', phone: '105' },
        current_job_function: 'marketing',
        current_seniority_level: 'mid',
        target_job_functions: ['marketing'],
        industry_experience: ['Retail'],
        total_years_experience: 6,
        skills: [{ skill_name: 'Brand Strategy', level: 8, rank: 1, level_source: 'cv_only', level_confidence: 'medium' }],
        it_skills: [{ skill_name: 'Excel', level: 6, rank: 1, level_source: 'cv_only', level_confidence: 'medium' }],
        soft_skills: [{ skill_name: 'Communication' }],
        preferences: {
            preferred_locations: [{ country: 'it', city: 'Rome' }],
            remote: 'full_remote',
            desired_contract_types: ['part_time'],
            industries: ['Retail'],
            work_eligibility_countries: ['it'],
            salary_eur: { min: 90000, flexibility: false },
        },
        summary_text: 'Marketing manager focused on retail growth.',
        canonical_career_text: 'Marketing manager running retail brand strategy and campaigns.',
        experiences: [
            {
                role: 'Marketing Manager',
                company: 'LocalAgency',
                location: { country: 'it', city: 'Rome' },
                from: '2020-01',
                to: 'present',
                is_current_position: true,
                description: 'Led marketing campaigns and brand strategy for retail clients.',
            },
        ],
        education: [
            {
                institution: 'University of Rome',
                degree_level: 'BA',
                major: 'Business Administration',
                currently_pursuing: false,
                from: '2012-09',
                to: '2015-06',
            },
        ],
        embedding_vector: [0.14, 0.18, 0.23, 0.89, 0.78],
    }),
    candidateBase({
        id: 'cand_junior_generalist',
        contacts: { email: 'junior.generalist@example.com', phone: '106' },
        current_job_function: 'engineering',
        current_seniority_level: 'junior',
        total_years_experience: 2,
        notice_period_months: 0,
        job_search_status: 'open_to_opportunities',
        skills: [
            { skill_name: 'React', level: 5, rank: 1, level_source: 'cv_only', level_confidence: 'medium' },
            { skill_name: 'Python', level: 4, rank: 2, level_source: 'cv_only', level_confidence: 'medium' },
        ],
        it_skills: [{ skill_name: 'SQL', level: 4, rank: 1, level_source: 'cv_only', level_confidence: 'medium' }],
        soft_skills: [{ skill_name: 'Communication' }],
        summary_text: 'Junior generalist engineer.',
        canonical_career_text: 'Junior engineer with some React and Python exposure.',
        experiences: [
            {
                role: 'Junior Engineer',
                company: 'Small Startup',
                location: { country: 'ch', city: 'Lausanne' },
                from: '2024-01',
                to: 'present',
                is_current_position: true,
                description: 'Supported product engineering tasks.',
            },
        ],
        education: [
            {
                institution: 'Local University',
                degree_level: 'BSc',
                major: 'Computer Science',
                currently_pursuing: false,
                from: '2020-09',
                to: '2023-06',
            },
        ],
        embedding_vector: [0.62, 0.43, 0.28, 0.18, 0.12],
    }),
];

const jobs: { job: JobProfile; expectation: JobExpectation }[] = [
    {
        job: jobBase({
            id: 'job_frontend_platform',
            title: 'Senior Frontend Engineer',
            industry: ['Technology', 'SaaS'],
            job_function: 'engineering',
            seniority_level: 'senior',
            experience_required: 6,
            summary_text: 'Senior frontend engineer with React and TypeScript expertise.',
            job_description: 'Build and scale frontend platforms using React, TypeScript, GraphQL and Docker.',
            full_job_posting_description: 'Build and scale frontend platforms using React, TypeScript, GraphQL and Docker in a SaaS environment.',
            skills: [
                { skill_name: 'React', level: 9, must: true },
                { skill_name: 'TypeScript', level: 8, must: true },
                { skill_name: 'GraphQL', level: 6, must: false },
            ],
            it_skills: [
                { skill_name: 'Docker', level: 5, must: false },
            ],
            soft_skills: [
                { skill_name: 'Leadership', must: true },
                { skill_name: 'Communication', must: true },
            ],
            embedding_vector: [0.81, 0.61, 0.42, 0.21, 0.09],
        }),
        expectation: {
            expectedTopIds: ['cand_frontend_star', 'cand_frontend_near_miss'],
            expectedBottomIds: ['cand_marketing_manager', 'cand_project_pm'],
            minTopScore: 0.75,
            minGapVsBottom: 0.25,
        },
    },
    {
        job: jobBase({
            id: 'job_ml_platform',
            title: 'Senior ML Platform Scientist',
            industry: ['Healthcare', 'Technology'],
            company_name: 'MediAI',
            job_function: 'data_science',
            seniority_level: 'senior',
            experience_required: 6,
            summary_text: 'Senior ML scientist for healthcare platform and experimentation.',
            job_description: 'Own machine learning pipelines, experimentation, and Python services for healthcare.',
            full_job_posting_description: 'Own healthcare machine learning pipelines, experimentation, Python services, and statistical analysis. Visa sponsorship unavailable.',
            skills: [
                { skill_name: 'Machine Learning', level: 9, must: true },
                { skill_name: 'Statistics', level: 8, must: true },
                { skill_name: 'Experimentation', level: 7, must: false },
            ],
            it_skills: [
                { skill_name: 'Python', level: 9, must: true },
                { skill_name: 'SQL', level: 7, must: false },
                { skill_name: 'AWS', level: 6, must: false },
            ],
            soft_skills: [
                { skill_name: 'Communication', must: true },
                { skill_name: 'Analytical Thinking', must: true },
            ],
            constraints: {
                contract_type: 'full_time',
                location: { country: 'de', city: 'Berlin' },
                remote: 'full_remote',
                languages: [{ language: 'English', level: 'C1' }],
                salary_eur: { min: 100000, max: 140000 },
                min_education_level: 'MSc',
                visa_sponsorship: false,
            },
            embedding_vector: [0.9, 0.73, 0.19, 0.11, 0.07],
        }),
        expectation: {
            expectedTopIds: ['cand_data_scientist'],
            expectedBottomIds: ['cand_marketing_manager', 'cand_project_pm', 'cand_frontend_near_miss'],
            ineligibleIds: ['cand_ml_researcher_ineligible'],
            minTopScore: 0.8,
            minGapVsBottom: 0.35,
        },
    },
    {
        job: jobBase({
            id: 'job_renewables_pm',
            title: 'Project Manager Renewable Infrastructure',
            industry: ['Renewable Energy', 'Infrastructure'],
            company_name: 'GridWorks',
            job_function: 'operations',
            seniority_level: 'senior',
            experience_required: 8,
            summary_text: 'Lead renewable infrastructure projects with strong stakeholder and risk management.',
            job_description: 'Own delivery of renewable energy infrastructure programs, risks, schedules, and stakeholders.',
            full_job_posting_description: 'Lead renewable energy infrastructure programs in Milan with project management, risk management, Primavera P6, and stakeholder leadership.',
            skills: [
                { skill_name: 'Project Management', level: 9, must: true },
                { skill_name: 'Risk Management', level: 8, must: true },
                { skill_name: 'Stakeholder Management', level: 8, must: true },
            ],
            it_skills: [
                { skill_name: 'Primavera P6', level: 7, must: false },
                { skill_name: 'Microsoft Excel', level: 7, must: false },
            ],
            soft_skills: [
                { skill_name: 'Leadership', must: true },
                { skill_name: 'Communication', must: true },
            ],
            constraints: {
                contract_type: 'full_time',
                location: { country: 'it', city: 'Milan' },
                remote: 'hybrid',
                languages: [{ language: 'English', level: 'B2' }],
                salary_eur: { min: 65000, max: 90000 },
                visa_sponsorship: true,
            },
            embedding_vector: [0.46, 0.29, 0.86, 0.6, 0.17],
        }),
        expectation: {
            expectedTopIds: ['cand_project_pm'],
            expectedBottomIds: ['cand_marketing_manager', 'cand_frontend_star', 'cand_data_scientist'],
            minTopScore: 0.75,
            minGapVsBottom: 0.25,
        },
    },
];

const findings: string[] = [];
let failures = 0;

function logFinding(message: string) {
    findings.push(message);
    console.error(`  Finding: ${message}`);
}

function assertCondition(condition: boolean, message: string) {
    if (condition) {
        console.log(`  PASS ${message}`);
    } else {
        console.error(`  FAIL ${message}`);
        failures++;
    }
}

function formatScore(score?: MatchScoreBreakdown): string {
    if (!score) return 'n/a';
    return `${(score.finalScore * 100).toFixed(1)}%`;
}

function summarizePillars(score?: MatchScoreBreakdown): string {
    if (!score) return 'n/a';
    return [
        `sem ${(score.semanticScore * 100).toFixed(0)}`,
        `hard ${(score.hardSkillsScore * 100).toFixed(0)}`,
        `ind ${(score.industryScore * 100).toFixed(0)}`,
        `exp ${(score.experienceScore * 100).toFixed(0)}`,
        `con ${(score.constraintScore * 100).toFixed(0)}`,
        `edu ${(score.educationScore * 100).toFixed(0)}`,
        `prest ${(score.careerPrestigeScore * 100).toFixed(0)}`,
    ].join(' | ');
}

function rankJob(job: JobProfile, pool: CandidateProfile[]): RankedCandidate[] {
    return pool
        .map(candidate => {
            const eligible = isEligible(job, candidate);
            return {
                candidate,
                eligible,
                score: eligible ? calculateMatchScore(job, candidate) : undefined,
            };
        })
        .sort((a, b) => {
            if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
            return (b.score?.finalScore || 0) - (a.score?.finalScore || 0);
        });
}

function auditJob(job: JobProfile, expectation: JobExpectation) {
    console.log(`\n=== ${job.id} :: ${job.title} ===`);
    const ranked = rankJob(job, candidates);

    ranked.forEach((entry, index) => {
        const marker = entry.eligible ? `${String(index + 1).padStart(2, '0')}.` : 'X.';
        console.log(`  ${marker} ${pad(entry.candidate.id, 28)} ${pad(formatScore(entry.score), 7)} ${summarizePillars(entry.score)}`);
    });

    const eligibleRanked = ranked.filter(entry => entry.eligible);
    const expectedTop = eligibleRanked.find(entry => expectation.expectedTopIds.includes(entry.candidate.id));
    const expectedBottom = eligibleRanked.filter(entry => expectation.expectedBottomIds.includes(entry.candidate.id));

    assertCondition(!!expectedTop, `At least one expected positive candidate is eligible for ${job.id}`);
    if (!expectedTop) return;

    assertCondition(expectation.expectedTopIds.includes(eligibleRanked[0]?.candidate.id || ''), `Top rank belongs to an expected positive candidate`);
    if (expectation.minTopScore != null) {
        assertCondition((expectedTop.score?.finalScore || 0) >= expectation.minTopScore, `Expected top candidate score >= ${(expectation.minTopScore * 100).toFixed(0)}%`);
    }

    if (expectedBottom.length > 0 && expectation.minGapVsBottom != null) {
        const strongestBottom = expectedBottom[0];
        const gap = (expectedTop.score?.finalScore || 0) - (strongestBottom.score?.finalScore || 0);
        assertCondition(gap >= expectation.minGapVsBottom, `Expected positive beats strongest negative by >= ${(expectation.minGapVsBottom * 100).toFixed(0)}%`);
        if (gap < expectation.minGapVsBottom) {
            logFinding(`${job.id}: score gap between ${expectedTop.candidate.id} and ${strongestBottom.candidate.id} is only ${(gap * 100).toFixed(1)}%`);
        }
    }

    expectation.expectedBottomIds.forEach(id => {
        const entry = eligibleRanked.find(item => item.candidate.id === id);
        if (entry && (entry.score?.finalScore || 0) > 0.55) {
            logFinding(`${job.id}: negative candidate ${id} still scores ${formatScore(entry.score)} with pillars ${summarizePillars(entry.score)}`);
        }
    });

    expectation.ineligibleIds?.forEach(id => {
        const entry = ranked.find(item => item.candidate.id === id);
        assertCondition(!!entry && !entry.eligible, `${id} should be ineligible for ${job.id}`);
    });

    if ((expectedTop.score?.hardSkillsScore || 0) < 0.65) {
        logFinding(`${job.id}: top candidate ${expectedTop.candidate.id} has weak hard-skills score ${formatScore({ ...expectedTop.score!, finalScore: expectedTop.score!.hardSkillsScore })}`);
    }
    if ((expectedTop.score?.industryScore || 0) < 0.65) {
        logFinding(`${job.id}: top candidate ${expectedTop.candidate.id} has weak industry score ${(expectedTop.score!.industryScore * 100).toFixed(1)}%`);
    }
    if ((expectedTop.score?.constraintScore || 0) < 0.6) {
        logFinding(`${job.id}: top candidate ${expectedTop.candidate.id} has weak constraint score ${(expectedTop.score!.constraintScore * 100).toFixed(1)}%`);
    }
}

console.log('Ranking Audit Matrix');
console.log('====================');

jobs.forEach(({ job, expectation }) => auditJob(job, expectation));

console.log('\nSummary');
console.log('-------');
if (findings.length === 0) {
    console.log('No suspicious ranking findings detected in the current audit matrix.');
} else {
    findings.forEach((finding, index) => {
        console.log(`${index + 1}. ${finding}`);
    });
}

if (failures > 0) {
    console.error(`\nAudit failed with ${failures} failing expectations.`);
    process.exit(1);
}

console.log('\nAudit passed.');
