import { CandidateProfile, CandidateSkill, Experience } from '../types';

const setsEqual = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every(v => b.has(v));

const skillSignatures = (skills?: CandidateSkill[]) =>
  new Set((skills || []).map(s => `${(s.skill_name || '').trim().toLowerCase()}|${s.level ?? ''}`));

const expSignatures = (exps?: Experience[]) =>
  new Set((exps || []).map(e =>
    `${(e.role || '').trim().toLowerCase()}|${(e.company || '').trim().toLowerCase()}|${e.from || ''}|${e.to || ''}`
  ));

export const hasSubstantialChanges = (oldProfile: CandidateProfile, newProfile: Partial<CandidateProfile>): boolean => {
  if (!setsEqual(skillSignatures(oldProfile.skills), skillSignatures(newProfile.skills))) return true;
  if (!setsEqual(skillSignatures(oldProfile.it_skills), skillSignatures(newProfile.it_skills))) return true;
  if (!setsEqual(expSignatures(oldProfile.experiences), expSignatures(newProfile.experiences))) return true;
  return false;
};
