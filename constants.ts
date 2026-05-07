
import { SchemaType as Type } from '@google/generative-ai';
// Import missing types used in the file
import { CandidateProfile, RecruiterProfile } from './types';
import { EDUCATION_LEVELS } from './utils/education';
import { MAJORS } from './utils/majors';

const DEGREE_LEVEL_CODES = EDUCATION_LEVELS.map(l => l.code);
const MAJOR_CODES = MAJORS.map(m => m.code);





export const JOB_PROFILE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING, description: 'A unique identifier for the job, e.g., job_123' },
    title: { type: Type.STRING, description: 'The job title.' },
    company_name: {
      type: Type.STRING,
      description: 'Name of the hiring company or a generic label if confidential.',
    },
    industry: {
      type: Type.ARRAY,
      description: 'The industries the job belongs to, e.g., ["SaaS", "FinTech", "E-commerce"].',
      items: { type: Type.STRING },
    },
    job_function: {
      type: Type.STRING,
      description: 'Primary job function, e.g., "product_management", "software_engineering", "operations", "sales".',
    },
    seniority_level: {
      type: Type.STRING,
      description: 'Seniority level of the role. Choose one of: intern, junior, mid, senior, lead.',
      enum: ['intern', 'junior', 'mid', 'senior', 'lead'],
    },
    experience_required: {
      type: Type.INTEGER,
      description: 'Minimum experience required in years.',
    },
    job_description: {
      type: Type.STRING,
      description: 'Full textual job description as provided by the company (can include responsibilities, requirements, and nice-to-have skills).',
    },
    skills: {
      type: Type.ARRAY,
      description:
        'Required technical skills (non-IT). Use short, standardized English labels, e.g., "project management", "mechanical design".',
      items: {
        type: Type.OBJECT,
        properties: {
          skill_name: {
            type: Type.STRING,
            description: 'The name of the skill, e.g., project management, mechanical design.',
          },
          level: {
            type: Type.INTEGER,
            description:
              'Required skill level from 1 to 10. 1 is basic, 5 is average among the ones who have that skills, 10 is a top expert, top 1% in the world.',
            minimum: 1,
            maximum: 10,
          },
          must: { type: Type.BOOLEAN, description: 'Whether the skill is a must-have.' },
        },
        required: ['skill_name', 'level', 'must'],
      },
    },
    it_skills: {
      type: Type.ARRAY,
      description:
        'Required IT tools and programming languages. Use standardized names, e.g., "Microsoft Excel", "Python", "React".',
      items: {
        type: Type.OBJECT,
        properties: {
          skill_name: { type: Type.STRING, description: 'The name of the skill, e.g., python, react.' },
          level: {
            type: Type.INTEGER,
            description:
              'Required skill level from 1 to 10. 1 is basic, 5 is average among the ones who have that skills, 10 is a top expert, top 1% in the world.',
            minimum: 1,
            maximum: 10,
          },
          must: { type: Type.BOOLEAN, description: 'Whether the skill is a must-have.' },
        },
        required: ['skill_name', 'level', 'must'],
      },
    },
    soft_skills: {
      type: Type.ARRAY,
      description: 'A list of the required and appreciated soft skills.',
      items: {
        type: Type.OBJECT,
        properties: {
          skill_name: {
            type: Type.STRING,
            description: 'The name of the skill, e.g., pubblic speaking, multitasking.',
          },
          must: { type: Type.BOOLEAN, description: 'Whether the skill is a must-have.' },
        },
        required: ['skill_name', 'must'],
      },
    },
    constraints: {
      type: Type.OBJECT,
      properties: {
        contract_type: {
          type: Type.STRING,
          description: 'Contract type. Choose one of: full_time, part_time, internship, collaboration, phd_other.',
          enum: ['full_time', 'part_time', 'internship', 'collaboration', 'phd_other'],
        },
        salary_eur: {
          type: Type.OBJECT,
          description: 'Optional. The salary range for the role in EUR.',
          properties: {
            min: { type: Type.INTEGER },
            max: { type: Type.INTEGER },
          },
          required: ['min', 'max'],
        },
        location: {
          type: Type.OBJECT,
          description: 'The primary work location.',
          properties: {
            country: {
              type: Type.STRING,
              description: 'ISO 3166-1 alpha2 lowercase country code, e.g., "it", "fr".',
              pattern: '^[a-z]{2}$',
            },
            city: {
              type: Type.STRING,
              description: 'City name in plain text, e.g., "Milan", "Paris".',
            },
          },
          required: ['country', 'city'],
        },
        remote: {
          type: Type.STRING,
          description: 'Remote work policy: full_remote, hybrid, none, or no_preference.',
          enum: ['full_remote', 'hybrid', 'none', 'no_preference'],
        },
        languages: {
          type: Type.ARRAY,
          description:
            'Language requirements as an array of objects, e.g., [{"language": "it", "level": "B2"}]',
          items: {
            type: Type.OBJECT,
            properties: {
              language: {
                type: Type.STRING,
                description: 'Language code, e.g., "it", "en".',
                pattern: '^[a-z]{2}$',
              },
              level: {
                type: Type.STRING,
                description:
                  'proficiency level in the language. From A1 to C2, follow CEFR levels',
                enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
              },
            },
            required: ['language', 'level'],
          },
        },
        visa_sponsorship: {
          type: Type.BOOLEAN,
          description: 'Whether the company can sponsor a work visa for foreign candidates.',
        },
        relocation_support: {
          type: Type.BOOLEAN,
          description: 'Whether the company supports relocation (financially or logistically).',
        },
      },
      required: ['contract_type', 'location', 'remote'],
    },
    summary_text: {
      type: Type.STRING,
      description:
        'Write 2–4 short sentences summarizing the role. Mention: function, seniority, top 3 must-have skills, location/remote policy, and approximate salary range if available. Avoid marketing fluff and buzzwords.',
    },
    full_job_posting_description: {
      type: Type.STRING,
      description:
        'Write a text summarizing the chat discussion with the recruiter and all the information included in the job description. Include role descriptions, function, seniority, crucial skills, constraints , approximate salary range, company culture and soft skills. Avoid marketing fluff and buzzwords.',
    },
  },
  required: ['id', 'title', 'industry', 'job_function', 'skills', 'constraints', 'summary_text', 'full_job_posting_description'],
};

export const CANDIDATE_PROFILE_SCHEMA_CV = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING, description: 'A unique identifier for the candidate, e.g., cand_123' },

    personal_info: {
      type: Type.OBJECT,
      properties: {
        first_name: { type: Type.STRING },
        last_name: { type: Type.STRING },
        pronoun: {
          type: Type.STRING,
          description: 'Optional pronoun.',
          enum: ['he/him', 'she/her', 'they/them'],
        },
      },
      required: ['first_name', 'last_name'],
    },

    residence: {
      type: Type.OBJECT,
      properties: {
        country: {
          type: Type.STRING,
          description: 'ISO 3166-1 alpha2 lowercase country code, e.g., "it", "fr".',
          pattern: '^[a-z]{2}$',
        },
        address: { type: Type.STRING },
        city: { type: Type.STRING },
      },
      required: ['country'],
    },

    contacts: {
      type: Type.OBJECT,
      properties: {
        email: { type: Type.STRING },
        phone: { type: Type.STRING },
      },
      required: ['email'],
    },

    current_job_function: {
      type: Type.STRING,
      description:
        'Primary job function of the current or most recent role, e.g., "product_management", "software_engineering", "operations", "sales".',
    },
    current_seniority_level: {
      type: Type.STRING,
      description: 'Seniority level in the current or most recent role.',
      enum: ['intern', 'junior', 'mid', 'senior', 'lead'],
    },
    industry_experience: {
      type: Type.ARRAY,
      description: 'Industries/sectors the candidate has ACTUALLY worked in (inferred from experiences), e.g., "FinTech", "SaaS", "Automotive". Distinct from preferences.industries which is aspirational.',
      items: { type: Type.STRING },
    },
    target_job_functions: {
      type: Type.ARRAY,
      description: 'Job functions the candidate is interested in.',
      items: { type: Type.STRING },
    },
    total_years_experience: {
      type: Type.NUMBER,
      description: 'Approximate total years of professional experience.',
    },
    notice_period_months: {
      type: Type.NUMBER,
      description: 'Notice period in months before the candidate can start a new job.',
    },
    job_search_status: {
      type: Type.STRING,
      description: 'Current job search status.',
      enum: ['not_looking', 'open_to_opportunities', 'actively_looking'],
    },

    skills: {
      type: Type.ARRAY,
      description:
        'Technical skills excluding specific IT software names and programming languages, which go in it_skills.',
      items: {
        type: Type.OBJECT,
        properties: {
          skill_name: {
            type: Type.STRING,
            description:
              'The name of the skill, e.g. operational process design, integrated circuits design.',
          },
          rank: {
            type: Type.INTEGER,
            description: 'Importance ranking within this skill set: 1 = most important. No duplicates.',
          },
          level: {
            type: Type.INTEGER,
            description:
              'Estimated skill level from 1 to 10. 1 is basic, 5 is average among candidates with this skill, 10 is top 1% expert.',
            minimum: 1,
            maximum: 10,
          },
          level_source: {
            type: Type.STRING,
            description: 'How the level was determined. For CV parsing use "cv_only".',
            enum: ['cv_only', 'chat_validated'],
          },
          level_confidence: {
            type: Type.STRING,
            description: 'How confident the level assignment is. "high" = skill described with depth, metrics, or years in CV. "medium" = skill mentioned in job descriptions but without detail. "low" = skill only listed without context (e.g. a bare skills list at the bottom of the CV).',
            enum: ['high', 'medium', 'low'],
          },
        },
        required: ['skill_name', 'rank', 'level', 'level_source', 'level_confidence'],
      },
    },

    it_skills: {
      type: Type.ARRAY,
      description:
        'Specific IT software skills and programming languages, e.g., "Microsoft Excel", "Jira", "Python".',
      items: {
        type: Type.OBJECT,
        properties: {
          skill_name: {
            type: Type.STRING,
            description: 'The name of the skill, e.g. Python.',
          },
          rank: {
            type: Type.INTEGER,
            description: 'Importance ranking within IT skills: 1 = most important. No duplicates.',
          },
          level: {
            type: Type.INTEGER,
            description: 'Estimated skill level from 1 to 10. 1 is basic, 5 is average, 10 is top 1% expert.',
            minimum: 1,
            maximum: 10,
          },
          level_source: {
            type: Type.STRING,
            description: 'How the level was determined. For CV parsing use "cv_only".',
            enum: ['cv_only', 'chat_validated'],
          },
          level_confidence: {
            type: Type.STRING,
            description: 'How confident the level assignment is. "high" = skill described with depth, metrics, or years in CV. "medium" = skill mentioned in job descriptions but without detail. "low" = skill only listed without context.',
            enum: ['high', 'medium', 'low'],
          },
        },
        required: ['skill_name', 'rank', 'level', 'level_source', 'level_confidence'],
      },
    },

    soft_skills: {
      type: Type.ARRAY,
      description: "Candidate's soft skills, e.g., public speaking.",
      items: {
        type: Type.OBJECT,
        properties: {
          skill_name: {
            type: Type.STRING,
            description: 'The name of the skill, e.g. public speaking.',
          },
          rank: {
            type: Type.INTEGER,
            description: 'Importance ranking within soft skills: 1 = most important. No duplicates.',
          },
          level: {
            type: Type.INTEGER,
            description: 'Estimated soft skill level from 1 (basic) to 10 (excellent).',
            minimum: 1,
            maximum: 10,
          },
          level_source: {
            type: Type.STRING,
            description: 'How the level was determined. For CV parsing use "cv_only".',
            enum: ['cv_only', 'chat_validated'],
          },
          level_confidence: {
            type: Type.STRING,
            description: 'How confident the level assignment is.',
            enum: ['high', 'medium', 'low'],
          },
        },
        required: ['skill_name', 'rank', 'level', 'level_source', 'level_confidence'],
      },
    },

    languages: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          language: {
            type: Type.STRING,
            description: 'ISO 639-1 lowercase language code, e.g., "it", "en".',
            pattern: '^[a-z]{2}$',
          },
          level: {
            type: Type.STRING,
            description: 'Proficiency level from A1 to C2.',
            enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
          },
        },
        required: ['language', 'level'],
      },
    },

    certifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'The name of the certification.' },
          date: { type: Type.STRING, description: 'The date it was obtained, in YYYY-MM format.' },
        },
        required: ['name', 'date'],
      },
    },

    preferences: {
      type: Type.OBJECT,
      properties: {
        preferred_locations: {
          type: Type.ARRAY,
          description: 'List of countries/cities where the candidate is open to work.',
          items: {
            type: Type.OBJECT,
            properties: {
              country: {
                type: Type.STRING,
                description: 'ISO 3166-1 alpha2 lowercase country code, e.g., "it", "fr".',
                pattern: '^[a-z]{2}$',
              },
              city: {
                type: Type.STRING,
                description: 'City name, optional.',
              },
            },
            required: ['country'],
          },
        },
        salary_eur: {
          type: Type.OBJECT,
          properties: {
            min: { type: Type.INTEGER, description: 'Minimum desired annual gross salary in EUR.' },
            flexibility: {
              type: Type.BOOLEAN,
              description: 'Is the candidate flexible on this salary?',
            },
            notes: { type: Type.STRING, description: 'Any other notes on salary.' },
          },
        },
        remote: {
          type: Type.STRING,
          description: 'Remote work preference. Choose one of: full_remote, hybrid, none, no_preference.',
          enum: ['full_remote', 'hybrid', 'none', 'no_preference'],
        },
        desired_contract_types: {
          type: Type.ARRAY,
          description: 'Preferred contract types.',
          items: {
            type: Type.STRING,
            enum: ['full_time', 'part_time', 'internship', 'collaboration', 'phd_other'],
          },
        },
        industries: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Preferred industries.',
        },
        work_eligibility_countries: {
          type: Type.ARRAY,
          description:
            'List of countries where the candidate is eligible to work (ISO 3166-1 alpha2 lowercase codes).',
          items: {
            type: Type.STRING,
            pattern: '^[a-z]{2}$',
          },
        },
      },
      required: [],
    },

    summary_text: {
      type: Type.STRING,
      description: "A concise summary of the candidate's experience and skills.",
    },

    experiences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING },
          company: { type: Type.STRING },
          location: {
            type: Type.OBJECT,
            properties: {
              country: {
                type: Type.STRING,
                description: 'ISO 3166-1 alpha2 lowercase country code, e.g., "it", "fr".',
                pattern: '^[a-z]{2}$',
              },
              city: {
                type: Type.STRING,
                description: 'City name in plain text, e.g., "Milan", "Paris".',
              },
            },
          },
          from: { type: Type.STRING, description: 'Start date in YYYY-MM format.' },
          to: { type: Type.STRING, description: 'End date in YYYY-MM format or "present".' },
          is_current_position: { type: Type.BOOLEAN },
          description: { type: Type.STRING, description: 'Key achievements or responsibilities.' },
        },
        required: ['role', 'company', 'from', 'to', 'is_current_position'],
      },
    },

    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          institution: { type: Type.STRING },
          degree_level: {
            type: Type.STRING,
            description: 'The degree code. MUST be one of the EXACT accepted codes: ' + DEGREE_LEVEL_CODES.join(', '),
            enum: DEGREE_LEVEL_CODES
          },
          major: {
            type: Type.STRING,
            description: 'The major code. MUST be one of the EXACT accepted codes: ' + MAJOR_CODES.join(', '),
            enum: MAJOR_CODES
          },
          specialization: { type: Type.STRING },
          final_mark_scale: { type: Type.STRING },
          final_mark: { type: Type.NUMBER },
          from: { type: Type.STRING, description: 'Start date in YYYY-MM format.' },
          to: { type: Type.STRING, description: 'End date in YYYY-MM format or "present".' },
          currently_pursuing: { type: Type.BOOLEAN },
          description: { type: Type.STRING },
        },
        required: ['institution', 'degree_level', 'major', 'from', 'to', 'currently_pursuing'],
      },
    },
  },

  required: ['id', 'personal_info', 'residence', 'contacts', 'experiences', 'education'],
};

export const CANDIDATE_PROFILE_SCHEMA_FINAL = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING, description: 'A unique identifier for the candidate, e.g., cand_123' },
    personal_info: {
      type: Type.OBJECT,
      properties: {
        first_name: { type: Type.STRING },
        last_name: { type: Type.STRING },
        pronoun: {
          type: Type.STRING,
          description: 'Optional pronoun.',
          enum: ['he/him', 'she/her', 'they/them'],
        },
      },
      required: ['first_name', 'last_name'],
    },
    residence: {
      type: Type.OBJECT,
      properties: {
        country: {
          type: Type.STRING,
          description: 'ISO 3166-1 alpha2 lowercase country code, e.g., "it", "fr".',
          pattern: '^[a-z]{2}$',
        },
        address: { type: Type.STRING },
        city: { type: Type.STRING },
      },
      required: ['country'],
    },
    contacts: {
      type: Type.OBJECT,
      properties: {
        email: { type: Type.STRING },
        phone: { type: Type.STRING },
      },
      required: ['email'],
    },
    current_job_function: {
      type: Type.STRING,
      description:
        'Primary job function of the current or most recent role, e.g., "product_management", "software_engineering", "operations", "sales".',
    },
    current_seniority_level: {
      type: Type.STRING,
      description: 'Seniority level in the current or most recent role.',
      enum: ['intern', 'junior', 'mid', 'senior', 'lead'],
    },
    industry_experience: {
      type: Type.ARRAY,
      description: 'Industries/sectors the candidate has ACTUALLY worked in (inferred from experiences and interview), e.g., "FinTech", "SaaS", "Automotive". Distinct from preferences.industries which is aspirational.',
      items: { type: Type.STRING },
    },
    target_job_functions: {
      type: Type.ARRAY,
      description: 'Job functions the candidate is interested in.',
      items: { type: Type.STRING },
    },
    total_years_experience: {
      type: Type.NUMBER,
      description: 'Approximate total years of professional experience.',
    },
    notice_period_months: {
      type: Type.NUMBER,
      description: 'Notice period in months before the candidate can start a new job.',
    },
    job_search_status: {
      type: Type.STRING,
      description: 'Current job search status.',
      enum: ['not_looking', 'open_to_opportunities', 'actively_looking'],
    },
    skills: {
      type: Type.ARRAY,
      description:
        'Technical skills excluding specific IT software names and programming languages, which go in it_skills.',
      items: {
        type: Type.OBJECT,
        properties: {
          skill_name: {
            type: Type.STRING,
            description:
              'The name of the skill, e.g. operational process design, integrated circuits design.',
          },
          rank: {
            type: Type.INTEGER,
            description:
              'How much that skill is relevant to the overall profile, academic and professional experience. Importance ranking within this skill set: 1 = most important. No duplicates.',
          },
          level: {
            type: Type.INTEGER,
            description:
              'Candidate skill level from 1 to 10. 1 is basic, 5 is average among the ones who have that skills, 10 is a top expert, top 1% in the world.',
            minimum: 1,
            maximum: 10,
          },
          level_source: {
            type: Type.STRING,
            description:
              'How the level was determined: "cv_only" (inferred from CV parser) or "chat_validated" (validated/updated via interview).',
            enum: ['cv_only', 'chat_validated'],
          },
          level_confidence: {
            type: Type.STRING,
            description: 'How confident the level assignment is. "high" = validated via interview or strong CV evidence. "medium" = some evidence. "low" = uncertain.',
            enum: ['high', 'medium', 'low'],
          },
        },
        required: ['skill_name', 'rank', 'level', 'level_source', 'level_confidence'],
      },
    },
    it_skills: {
      type: Type.ARRAY,
      description:
        'A list of specific IT software skills and programming languages, e.g., "Microsoft Excel", "Jira", "Python"',
      items: {
        type: Type.OBJECT,
        properties: {
          skill_name: {
            type: Type.STRING,
            description: 'The name of the skill, e.g. Python',
          },
          rank: {
            type: Type.INTEGER,
            description:
              'How much that skill is relevant to the overall profile, academic and professional experience. Importance ranking within this skill set: 1 = most important. No duplicates.',
          },
          level: {
            type: Type.INTEGER,
            description:
              'Candidate skill level from 1 to 10. 1 is basic, 5 is average among the ones who have that skills, 10 is a top expert, top 1% in the world.',
            minimum: 1,
            maximum: 10,
          },
          level_source: {
            type: Type.STRING,
            description: 'How the level was determined: "cv_only" or "chat_validated".',
            enum: ['cv_only', 'chat_validated'],
          },
          level_confidence: {
            type: Type.STRING,
            description: 'How confident the level assignment is.',
            enum: ['high', 'medium', 'low'],
          },
        },
        required: ['skill_name', 'rank', 'level', 'level_source', 'level_confidence'],
      },
    },
    soft_skills: {
      type: Type.ARRAY,
      description: "A list of the candidate's soft skills. e.g. public speaking",
      items: {
        type: Type.OBJECT,
        properties: {
          skill_name: {
            type: Type.STRING,
            description: 'The name of the skill, e.g. public speaking',
          },
        },
        required: ['skill_name'],
      },
    },
    languages: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          language: {
            type: Type.STRING,
            description: 'ISO 639-1 lowercase language code, e.g., "it", "en".',
            pattern: '^[a-z]{2}$',
          },
          level: {
            type: Type.STRING,
            description: 'Proficiency level from A1 to C2.',
            enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
          },
        },
        required: ['language', 'level'],
      },
    },
    certifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'The name of the certification.' },
          date: { type: Type.STRING, description: 'The date it was obtained, in YYYY-MM format.' },
        },
        required: ['name', 'date'],
      },
    },
    preferences: {
      type: Type.OBJECT,
      properties: {
        preferred_locations: {
          type: Type.ARRAY,
          description: 'List of countries/cities where the candidate is open to work.',
          items: {
            type: Type.OBJECT,
            properties: {
              country: {
                type: Type.STRING,
                description: 'ISO 3166-1 alpha2 lowercase country code, e.g., "it", "fr".',
                pattern: '^[a-z]{2}$',
              },
              city: {
                type: Type.STRING,
                description: 'City name, optional.',
              },
            },
            required: ['country'],
          },
        },
        salary_eur: {
          type: Type.OBJECT,
          properties: {
            min: { type: Type.INTEGER, description: 'Minimum desired annual gross salary in EUR.' },
            flexibility: {
              type: Type.BOOLEAN,
              description: 'Is the candidate flexible on this salary?',
            },
            notes: { type: Type.STRING, description: 'Any other notes on salary.' },
          },
        },
        remote: {
          type: Type.STRING,
          description: 'Remote work preference. Choose one of: full_remote, hybrid, none, no_preference.',
          enum: ['full_remote', 'hybrid', 'none', 'no_preference'],
        },
        desired_contract_types: {
          type: Type.ARRAY,
          description: 'Preferred contract types.',
          items: {
            type: Type.STRING,
            enum: ['full_time', 'part_time', 'internship', 'collaboration', 'phd_other'],
          },
        },
        industries: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Preferred industries.',
        },
        work_eligibility_countries: {
          type: Type.ARRAY,
          description:
            'List of countries where the candidate is eligible to work (ISO 3166-1 alpha2 lowercase codes).',
          items: {
            type: Type.STRING,
            pattern: '^[a-z]{2}$',
          },
        },
      },
      required: ['preferred_locations', 'remote', 'work_eligibility_countries'],
    },
    summary_text: {
      type: Type.STRING,
      description: "A concise summary of the candidate's experience and skills.",
    },
    experiences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING },
          company: { type: Type.STRING },
          location: {
            type: Type.OBJECT,
            properties: {
              country: {
                type: Type.STRING,
                description: 'ISO 3166-1 alpha2 lowercase country code, e.g., "it", "fr".',
                pattern: '^[a-z]{2}$',
              },
              city: {
                type: Type.STRING,
                description: 'City name in plain text, e.g., "Milan", "Paris".',
              },
            },
          },
          from: { type: Type.STRING, description: 'Start date in YYYY-MM format.' },
          to: { type: Type.STRING, description: 'End date in YYYY-MM format or "present".' },
          is_current_position: { type: Type.BOOLEAN },
          description: { type: Type.STRING, description: 'Key achievements or responsibilities.' },
        },
        required: ['role', 'company', 'from', 'to', 'is_current_position'],
      },
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          institution: { type: Type.STRING },
          degree_level: {
            type: Type.STRING,
            description: 'The degree code. MUST be one of the EXACT accepted codes: ' + DEGREE_LEVEL_CODES.join(', '),
            enum: DEGREE_LEVEL_CODES
          },
          major: {
            type: Type.STRING,
            description: 'The major code. MUST be one of the EXACT accepted codes: ' + MAJOR_CODES.join(', '),
            enum: MAJOR_CODES
          },
          specialization: { type: Type.STRING },
          final_mark_scale: { type: Type.STRING },
          final_mark: { type: Type.NUMBER },
          from: { type: Type.STRING, description: 'Start date in YYYY-MM format.' },
          to: { type: Type.STRING, description: 'End date in YYYY-MM format or "present".' },
          currently_pursuing: { type: Type.BOOLEAN },
          description: { type: Type.STRING },
        },
        required: ['institution', 'degree_level', 'major', 'from', 'to', 'currently_pursuing'],
      },
    },
  },
  required: [
    'id',
    'personal_info',
    'residence',
    'contacts',
    'skills',
    'soft_skills',
    'preferences',
    'summary_text',
    'experiences',
    'education',
  ],
};

export const CANDIDATE_PROFILE_SCHEMA_JOBMATCHING = CANDIDATE_PROFILE_SCHEMA_FINAL;

export const BLANK_CANDIDATE_PROFILE: Omit<CandidateProfile, 'id' | 'contacts'> = {
  personal_info: { first_name: '', last_name: '' },
  residence: { country: '' },
  current_job_function: '',
  current_seniority_level: undefined,
  industry_experience: [],
  target_job_functions: [],
  total_years_experience: 0,
  notice_period_months: 0,
  job_search_status: 'open_to_opportunities',
  skills: [],
  it_skills: [],
  soft_skills: [],
  languages: [],
  certifications: [],
  preferences: {
    preferred_locations: [],
    remote: 'none',
    desired_contract_types: [],
    industries: [],
    work_eligibility_countries: [],
  },
  summary_text: '',
  experiences: [],
  education: [],
};

export const BLANK_RECRUITER_PROFILE: Omit<RecruiterProfile, 'id' | 'email'> = {
  first_name: '',
  last_name: '',
  role: '',
  company_name: '',
  company_location: {
    country: '',
    city: '',
    address: '',
  },
  sector: [],
};

export const NEW_EDUCATION_DEFAULT = {
  institution: '',
  degree_level: '',
  major: '',
  from: '',
  to: '',
  currently_pursuing: false,
};

export const NEW_EXPERIENCE_DEFAULT = {
  company: '',
  role: '',
  location: {
    country: '',
    city: '',
  },
  from: '',
  to: '',
  is_current_position: false,
  description: '',
};

export const NEW_CERTIFICATION_DEFAULT = { name: '', date: '' };
export const NEW_LANGUAGE_DEFAULT = { language: '', level: 'A1' };
