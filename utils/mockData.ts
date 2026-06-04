/**
 * Mock/fixture data for local development and seeding.
 * NOT imported in production application code — only used by seedData.ts.
 */
import { CandidateProfile } from '../types';

export const MOCK_CANDIDATES: CandidateProfile[] = [
  {
    id: 'cand_541',
    personal_info: { first_name: 'John', last_name: 'Doe' },
    residence: { country: 'it', city: 'milan', address: 'Via Roma 1' },
    contacts: { email: 'john.doe@email.com', phone: '+39123456789' },
    current_job_function: 'software_engineering',
    current_seniority_level: 'mid',
    target_job_functions: ['software_engineering'],
    total_years_experience: 3,
    notice_period_months: 2,
    job_search_status: 'open_to_opportunities',
    skills: [
      { skill_name: 'REST API design', level: 8, rank: 1, level_source: 'cv_only', level_confidence: 'high' },
      { skill_name: 'ETL pipelines', level: 7, rank: 2, level_source: 'cv_only', level_confidence: 'medium' },
      { skill_name: 'cloud architecture', level: 6, rank: 3, level_source: 'cv_only', level_confidence: 'low' },
    ],
    it_skills: [
      { skill_name: 'Python', level: 9, rank: 1, level_source: 'cv_only', level_confidence: 'high' },
      { skill_name: 'PostgreSQL', level: 8, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
      { skill_name: 'Docker', level: 6, rank: 3, level_source: 'cv_only', level_confidence: 'medium' },
      { skill_name: 'Kubernetes', level: 5, rank: 4, level_source: 'cv_only', level_confidence: 'low' },
    ],
    soft_skills: [
      { skill_name: 'problem_solving' },
      { skill_name: 'teamwork' },
    ],
    languages: [
      { language: 'it', level: 'C2' },
      { language: 'en', level: 'B2' },
    ],
    certifications: [{ name: 'Certified Python Programmer', date: '2023-05' }],
    preferences: {
      preferred_locations: [{ country: 'it', city: 'milan' }],
      salary_eur: {
        min: 42000,
        flexibility: true,
        notes: 'Open to negotiation for the right role.',
      },
      remote: 'hybrid',
      desired_contract_types: ['full_time'],
      industries: ['SaaS', 'Data'],
      work_eligibility_countries: ['it'],
    },
    summary_text:
      '3 years on REST services with FastAPI. Improved ETL on Postgres. Basic Docker knowledge.',
    experiences: [
      {
        role: 'Backend Dev',
        company: 'Acme',
        location: { country: 'it', city: 'milan' },
        from: '2023-07',
        to: 'present',
        is_current_position: true,
        description: 'Reduced API latency by 35%. Managed a daily 200GB ETL pipeline.',
      },
    ],
    education: [
      {
        institution: 'Polytechnic University of Milan',
        degree_level: 'MASTER',
        major: 'CS',
        specialization: '',
        from: '2020-09',
        to: '2023-06',
        currently_pursuing: false,
        final_mark: 110,
        final_mark_scale: '110',
        description: '',
      },
    ],
    embedding_vector: [0.1, 0.9, 0.1],
  },
  {
    id: 'cand_882',
    personal_info: { first_name: 'Jane', last_name: 'Smith' },
    residence: { country: 'it', city: 'milan' },
    contacts: { email: 'jane.smith@email.com', phone: '+39987654321' },
    current_job_function: 'software_engineering',
    current_seniority_level: 'senior',
    target_job_functions: ['software_engineering'],
    total_years_experience: 5,
    notice_period_months: 1,
    job_search_status: 'actively_looking',
    skills: [
      { skill_name: 'UI/UX implementation', level: 9, rank: 1, level_source: 'cv_only', level_confidence: 'high' },
      { skill_name: 'component library management', level: 9, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
      { skill_name: 'performance optimization', level: 8, rank: 3, level_source: 'cv_only', level_confidence: 'medium' },
    ],
    it_skills: [
      { skill_name: 'React', level: 10, rank: 1, level_source: 'cv_only', level_confidence: 'high' },
      { skill_name: 'TypeScript', level: 10, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
      { skill_name: 'Next.js', level: 8, rank: 3, level_source: 'cv_only', level_confidence: 'high' },
      { skill_name: 'Figma', level: 7, rank: 4, level_source: 'cv_only', level_confidence: 'medium' },
      { skill_name: 'Python', level: 5, rank: 5, level_source: 'cv_only', level_confidence: 'low' },
    ],
    soft_skills: [
      { skill_name: 'creativity' },
      { skill_name: 'communication' },
      { skill_name: 'attention_to_detail' },
    ],
    languages: [{ language: 'en', level: 'C1' }],
    certifications: [],
    preferences: {
      preferred_locations: [{ country: 'it', city: 'milan' }],
      salary_eur: { min: 50000, flexibility: false, notes: '' },
      remote: 'full_remote',
      desired_contract_types: ['full_time'],
      industries: ['E-commerce', 'FinTech'],
      work_eligibility_countries: ['it'],
    },
    summary_text:
      '5+ years building scalable and beautiful UIs with React. Passionate about user experience and clean code.',
    experiences: [
      {
        role: 'Senior Frontend Engineer',
        company: 'Innovate Ltd.',
        location: { country: 'it', city: 'milan' },
        from: '2021-01',
        to: 'present',
        is_current_position: true,
        description:
          'Led the migration to Next.js, improving performance by 50%. Developed a reusable component library used by 5 teams.',
      },
    ],
    education: [
      {
        institution: 'University of Bologna',
        degree_level: 'BACHELOR',
        major: 'VisPerfArt',
        specialization: '',
        from: '2017-09',
        to: '2020-07',
        currently_pursuing: false,
        final_mark: undefined as unknown as number,
        final_mark_scale: '',
        description: '',
      },
    ],
    embedding_vector: [0.9, 0.1, 0.2],
  },
];
