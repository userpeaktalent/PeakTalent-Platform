
import { CandidateProfile, JobProfile, Experience, Education, CandidateSkill, JobSkill } from '../types';

/**
 * Normalizes text by trimming, lowercase, and collapsing whitespace.
 */
const normalize = (text?: string): string => {
  if (!text) return '';
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
};

/**
 * Truncates text to a specific length.
 */
const truncate = (text: string, length: number = 200): string => {
  const norm = normalize(text);
  if (norm.length <= length) return norm;
  return norm.substring(0, length) + '...';
};

/**
 * Builds a deterministic string representation of a Candidate profile.
 * Excludes PII and hard constraints.
 *
 * Structure: rich natural language paragraph first (highest semantic weight),
 * then structured key-value fields for precision.
 */
export const buildCandidateCanonicalText = (cand: CandidateProfile): string => {
  const parts: string[] = [];

  // --- Natural Language Paragraph (primary semantic signal) ---
  // Written as a readable professional bio so Gemini can broadly understand
  // domain, seniority, and specialisation without parsing key-value structure.
  const nlParts: string[] = [];

  const seniority = cand.current_seniority_level || '';
  const role = cand.current_job_function || 'professional';
  const years = cand.total_years_experience;

  // Opening: professional identity
  nlParts.push(
    `${seniority ? seniority + ' ' : ''}${role}${years ? ` with ${years} years of experience` : ''}.`
  );

  // Summary (often the richest single signal)
  if (cand.summary_text) {
    nlParts.push(cand.summary_text);
  }

  // Top skills as natural prose
  const topSkillNames = [...(cand.skills || []), ...(cand.it_skills || [])]
    .sort((a, b) => (a.rank || 99) - (b.rank || 99))
    .slice(0, 10)
    .map(s => s.skill_name)
    .filter(Boolean);
  if (topSkillNames.length) {
    nlParts.push(`Core expertise: ${topSkillNames.join(', ')}.`);
  }

  // Industry background
  if (cand.industry_experience?.length) {
    nlParts.push(`Industry background: ${cand.industry_experience.slice(0, 4).join(', ')}.`);
  }

  // Target roles (aspirational domain signal)
  if (cand.target_job_functions?.length) {
    nlParts.push(`Targeting roles in: ${cand.target_job_functions.slice(0, 3).join(', ')}.`);
  }

  // Recent experience descriptions — best domain vocabulary available
  const recentExpDescs = [...(cand.experiences || [])]
    .sort((a, b) => b.from.localeCompare(a.from))
    .slice(0, 3)
    .map(e => (e.description ? truncate(e.description, 250) : ''))
    .filter(Boolean);
  if (recentExpDescs.length) {
    nlParts.push(recentExpDescs.join(' '));
  }

  parts.push(normalize(nlParts.join(' ')));

  // --- Structured Key-Value Fields (precision reinforcement) ---

  // 1. Identity
  parts.push(`summary: ${normalize(cand.summary_text)}`);
  parts.push(`function: ${normalize(cand.current_job_function)}`);
  parts.push(`seniority: ${normalize(cand.current_seniority_level)}`);
  parts.push(`experience_years: ${cand.total_years_experience || 0}`);

  // 2. Targets & Industries
  if (cand.target_job_functions?.length) {
    const targets = [...cand.target_job_functions].map(normalize).sort().join(', ');
    parts.push(`targets: ${targets}`);
  }
  if (cand.industry_experience?.length) {
    const industries = [...cand.industry_experience].map(normalize).sort().join(', ');
    parts.push(`industry_experience: ${industries}`);
  }

  // 3. Skills (top 20 technical + top 20 IT by rank, sorted for determinism)
  const formatSkill = (s: CandidateSkill) => normalize(s.skill_name);

  const topSkills = (cand.skills || [])
    .sort((a, b) => (a.rank || 99) - (b.rank || 99))
    .slice(0, 20);

  const topItSkills = (cand.it_skills || [])
    .sort((a, b) => (a.rank || 99) - (b.rank || 99))
    .slice(0, 20);

  const skillString = [...topSkills, ...topItSkills]
    .map(formatSkill)
    .sort()
    .join(', ');

  if (skillString) parts.push(`skills: ${skillString}`);

  // 4. Soft Skills
  if (cand.soft_skills?.length) {
    const soft = cand.soft_skills.map(s => normalize(s.skill_name)).sort().join(', ');
    parts.push(`soft_skills: ${soft}`);
  }

  // 5. Languages
  if (cand.languages?.length) {
    const languages = cand.languages
      .map(l => `${normalize(l.language)}(${normalize(l.level)})`)
      .sort()
      .join(', ');
    parts.push(`languages: ${languages}`);
  }

  // 6. Experience history (last 4 roles, 300 chars per description)
  const sortedExp = [...(cand.experiences || [])]
    .sort((a, b) => b.from.localeCompare(a.from))
    .slice(0, 4);

  const expParts = sortedExp.map(e => {
    const expRole = normalize(e.role);
    const expDesc = e.description ? `: ${truncate(e.description, 300)}` : '';
    return `${expRole}${expDesc}`;
  });

  if (expParts.length) parts.push(`experience_history: ${expParts.join(' | ')}`);

  // 7. Education
  const sortedEdu = [...(cand.education || [])]
    .sort((a, b) => b.from.localeCompare(a.from))
    .slice(0, 2);

  const eduParts = sortedEdu.map(e => {
    const deg = normalize(e.degree_level);
    const maj = normalize(e.major);
    return `${deg} in ${maj}`;
  });

  if (eduParts.length) parts.push(`education: ${eduParts.join(' | ')}`);

  // 8. Certifications
  if (cand.certifications?.length) {
    const certs = cand.certifications.map(c => normalize(c.name)).sort().join(', ');
    parts.push(`certifications: ${certs}`);
  }

  // 9. Preferred industries (kept: domain preference signal, not a constraint)
  if (cand.preferences?.industries?.length) {
    const industries = (cand.preferences.industries || []).map(normalize).sort().join(', ');
    if (industries) parts.push(`preferred_industries: ${industries}`);
  }

  return parts.join(' | ');
};

/**
 * Builds a deterministic string representation of a Job profile.
 * Excludes hard constraints (location, salary, remote, contract) — those are
 * handled by the Constraints Fit pillar and should NOT influence semantic similarity.
 *
 * Structure: full job description first (richest signal), then structured fields.
 */
export const buildJobCanonicalText = (job: JobProfile): string => {
  const parts: string[] = [];

  // --- Natural Language Paragraph (primary semantic signal) ---
  // Full job description leads because it contains the richest domain vocabulary.
  const nlParts: string[] = [];

  const jobSeniority = job.seniority_level ? `${job.seniority_level} ` : '';
  const jobTitle = job.title || job.job_function || 'role';
  const jobIndustry = Array.isArray(job.industry)
    ? job.industry.join(', ')
    : (job.industry || '');

  nlParts.push(`${jobSeniority}${jobTitle}${jobIndustry ? ` in ${jobIndustry}` : ''}.`);

  if (job.summary_text) {
    nlParts.push(job.summary_text);
  }

  // Full posting: put it here (before structured fields) for maximum embedding weight
  const fullDesc = job.full_job_posting_description || job.job_description || '';
  if (fullDesc) {
    nlParts.push(truncate(fullDesc, 1200));
  }

  // Must-have skills as natural prose
  const mustSkillNames = [...(job.skills || []), ...(job.it_skills || [])]
    .filter(s => s.must)
    .slice(0, 8)
    .map(s => s.skill_name)
    .join(', ');
  if (mustSkillNames) {
    nlParts.push(`Required expertise: ${mustSkillNames}.`);
  }

  parts.push(normalize(nlParts.join(' ')));

  // --- Structured Key-Value Fields ---

  // 1. Identity
  parts.push(`title: ${normalize(job.title)}`);
  const industryText = Array.isArray(job.industry)
    ? job.industry.map(normalize).join(', ')
    : normalize(job.industry);
  parts.push(`industry: ${industryText}`);
  parts.push(`function: ${normalize(job.job_function)}`);
  parts.push(`seniority: ${normalize(job.seniority_level)}`);

  // 2. Summary
  parts.push(`summary: ${normalize(job.summary_text)}`);

  // 3. Skills (all, grouped must vs nice, sorted)
  const allTechnical = job.skills || [];
  const allIt = job.it_skills || [];
  const mergedSkills = [...allTechnical, ...allIt];

  const formatJobSkill = (s: JobSkill) => normalize(s.skill_name);

  const reqMustSkills = mergedSkills.filter(s => s.must).map(formatJobSkill).sort().join(', ');
  const reqNiceSkills = mergedSkills.filter(s => !s.must).map(formatJobSkill).sort().join(', ');

  if (reqMustSkills) parts.push(`requirements_must: ${reqMustSkills}`);
  if (reqNiceSkills) parts.push(`requirements_nice: ${reqNiceSkills}`);

  // 4. Soft Skills
  const softMust = (job.soft_skills || []).filter(s => s.must).map(s => normalize(s.skill_name)).sort().join(', ');
  const softNice = (job.soft_skills || []).filter(s => !s.must).map(s => normalize(s.skill_name)).sort().join(', ');

  if (softMust) parts.push(`soft_skills_must: ${softMust}`);
  if (softNice) parts.push(`soft_skills_nice: ${softNice}`);

  // 5. Required languages (professional requirement, not a constraint)
  if (job.constraints?.languages?.length) {
    const languages = job.constraints.languages
      .map(l => `${normalize(l.language)}(${normalize(l.level)})`)
      .sort()
      .join(', ');
    parts.push(`required_languages: ${languages}`);
  }

  return parts.join(' | ');
};
