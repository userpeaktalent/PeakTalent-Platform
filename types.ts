
export type UserRole = 'recruiter' | 'seeker' | 'admin' | null;

export interface User {
  email: string; // Primary key
  password: string; // In a real app, this would be hashed.
  role: 'recruiter' | 'seeker' | 'admin';
  profileId: string; // candidateId or recruiterId
  fullName?: string;
}

export interface RecruiterProfile {
  id: string; // Corresponds to User.profileId
  email: string;
  first_name: string;
  last_name: string;
  role: string; // e.g., "Talent Acquisition Specialist"
  company_name: string;
  company_visibility?: boolean;
  company_logo_url?: string;
  company_logo_path?: string;
  must_change_password?: boolean;
  company_location: {
    country: string;
    city: string;
    address: string;
  };
  sector: string[]; // e.g., ["Technology", "Finance"]
}

export interface Skill {
  skill_name: string;
  level: number;
}

export interface JobSkill extends Skill {
  must: boolean;
}

export interface JobSoftSkill {
  skill_name: string;
  must: boolean;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  text_it?: string;
  options_it?: string[];
  text_en?: string;
  options_en?: string[];
  correct_option_index: number;
  difficulty?: number;
}

export interface TechnicalTest {
  questions: QuizQuestion[];
  generated_at?: string;
  generated_from_job_title?: string;
  time_limit_seconds?: number;
}

export interface CandidateSkill {
  skill_name: string;
  level: number;
  /** Optional importance rank (1 = most important). Undefined means no explicit ordering. */
  rank?: number;
  level_source: 'cv_only' | 'chat_validated';
  level_confidence: 'high' | 'medium' | 'low';
}

export interface CandidateSoftSkill {
  skill_name: string;
}

export interface Certification {
  name: string;
  date: string; // YYYY-MM
}

export interface Language {
  language: string;
  level: string; // A1-C2
}

export interface Education {
  institution: string;
  degree_level: string;
  major: string;
  specialization?: string;
  final_mark_scale?: string;
  final_mark?: number;
  from: string; // YYYY-MM
  to: string; // YYYY-MM or 'present'
  currently_pursuing: boolean;
  description?: string;
}

export interface Experience {
  role: string;
  company: string;
  location: {
    country: string;
    city?: string;
  };
  from: string; // YYYY-MM
  to: string; // YYYY-MM or 'present'
  is_current_position: boolean;
  description?: string;
}

export interface JobConstraints {
  contract_type: 'full_time' | 'part_time' | 'internship' | 'collaboration' | 'phd_other';
  salary_eur?: { min: number; max: number };
  location: {
    country: string;
    city: string;
  };
  remote: 'full_remote' | 'hybrid' | 'none' | 'no_preference';
  languages?: { language: string; level: string }[];
  visa_sponsorship?: boolean;
  relocation_support?: boolean;
  min_education_level?: string; // e.g. 'BSc', 'MSc' — used as hard filter
}







export interface EmbeddingMetadata {
  embedding_vector?: number[];
  embedding_model?: string;
  embedding_version?: string;
  embedding_input_hash?: string;
  embedding_updated_at?: string;
}

export interface JobProfile extends EmbeddingMetadata {
  id: string;
  title: string;
  industry: string[];
  company_name?: string;
  visible_to_seekers?: boolean;
  company_logo_url?: string;
  company_logo_path?: string;
  recruiter_id?: string | null;
  job_function?: string;
  seniority_level?: 'intern' | 'junior' | 'mid' | 'senior' | 'lead';
  experience_required?: number;
  job_description?: string;
  full_job_posting_description?: string;
  skills: JobSkill[];
  it_skills: JobSkill[];
  soft_skills: JobSoftSkill[];
  constraints: JobConstraints;
  summary_text: string;
  applicant_emails?: string[];
  auto_filter_enabled?: boolean;
  technical_test?: TechnicalTest;
  score_overrides?: Record<string, { score: number; reason?: string; overridden_at: string }>;
}

export interface EvaluationStep {
  id: string;
  type: 'profile_refinement' | 'quiz';
  title: string;
  description: string;
  status: 'pending' | 'completed';
}

export interface QuestionnaireAnswer {
  question_id: string;
  question_text: string;
  options: string[];
  selected_option_index: number;
  selected_option_text: string;
  correct_option_index: number;
  correct_option_text: string;
  is_correct: boolean;
}

export interface TestResult {
  job_id: string;
  score?: number;
  completed_at?: string;
  questionnaire_title?: string;
  question_count?: number;
  answers?: QuestionnaireAnswer[];
}

export interface CandidateRefinementChat {
  id: string;
  candidate_profile_id: string;
  candidate_record_id?: string | null;
  transcript: ChatMessage[];
  language: 'it' | 'en';
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface CandidateCvRecord {
  id: string;
  candidate_profile_id: string;
  candidate_record_id?: string | null;
  bucket_name: string;
  file_name: string;
  file_path: string;
  mime_type?: string | null;
  file_size?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CandidatePreferences {
  preferred_locations: {
    country: string;
    city?: string;
  }[];
  salary_eur?: {
    min: number;
    flexibility: boolean;
    notes?: string;
  };
  remote: 'full_remote' | 'hybrid' | 'none' | 'no_preference';
  desired_contract_types?: string[];
  industries?: string[];
  work_eligibility_countries?: string[];
  visa_sponsorship?: boolean | null;
  relocation_support?: boolean | null;
}

export interface CandidateProfile extends EmbeddingMetadata {
  id: string;
  personal_info: {
    first_name: string;
    last_name: string;
    pronoun?: string;
  };
  residence: {
    country: string;
    address?: string;
    city?: string;
  };
  contacts: {
    email: string;
    phone: string;
  };
  current_job_function?: string;
  current_seniority_level?: string;
  target_job_functions?: string[];
  industry_experience?: string[];
  total_years_experience?: number;
  notice_period_months?: number;
  job_search_status?: string;
  profile_visibility?: 'visible' | 'private';
  terms_and_conditions_accepted?: boolean;

  skills: CandidateSkill[];
  it_skills: CandidateSkill[];
  soft_skills: CandidateSoftSkill[];
  languages: Language[];
  certifications: Certification[];

  preferences: CandidatePreferences;

  summary_text: string;
  canonical_career_text?: string;
  experiences: Experience[];
  education: Education[];

  // AI refinement tracking
  ai_refined?: boolean;
  ai_refined_at?: string;

  // Test results for applications
  test_results?: TestResult[];

}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface MatchScoreBreakdown {
  finalScore: number;
  baseScore: number; // Raw weighted sum before any presentation formatting
  gatePenalty: number; // Reserved for backward compatibility, currently always 1
  semanticScore: number;
  hardSkillsScore: number;
  industryScore: number;
  experienceScore: number;
  constraintScore: number;
  educationScore: number;
  careerPrestigeScore: number;
}

export interface RecommendedJob {
  job: JobProfile;
  score: number;
  explanation: string;
}

export type NotificationType = 'application_received' | 'invitation_received' | 'job_match' | 'profile_update' | 'info' | 'warning';

export interface Notification {
  id: string;
  user_id: string; // The person receiving the notification
  type: NotificationType;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
  metadata?: {
    job_id?: string;
    candidate_id?: string;
    sender_email?: string;
    assessment_requested?: boolean;
    requires_ai_refinement?: boolean;
    assessment_completed?: boolean;
    question_count?: number;
  };
}
