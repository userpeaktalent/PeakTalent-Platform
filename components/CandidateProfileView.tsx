import React from 'react';
import { CandidateProfile, JobProfile, MatchScoreBreakdown } from '../types';
import CandidateNotesPanel from './CandidateNotesPanel';
import { translateProfessionalSummary } from '../services/geminiService';
import { getEducationLevelLabel } from '../utils/education';
import { getMajorName } from '../utils/majors';
import { formatCandidateName } from '../utils/nameFormat';
import { getSeekerSkillLevelLabel } from '../utils/skills';
import { AiBanner, ScoreBar, Spinner } from './common';
import { useLanguage } from './LanguageProvider';

interface CandidateProfileViewProps {
    candidate: CandidateProfile;
    onEdit?: () => void;
    onBack: () => void;
    showEditButton?: boolean;
    auxiliaryActions?: React.ReactNode;
    scoreDetails?: MatchScoreBreakdown;
    effectiveScorePercent?: number;
    jobContext?: { job: JobProfile; onJobUpdated: (job: JobProfile) => void };
}

const getSummaryCacheKey = (candidateId: string, language: 'it' | 'en') =>
    `peaktalent:candidate-summary:${candidateId}:${language}`;

const getLocalizedCandidateText = (
    language: 'it' | 'en',
    fallback?: string,
    italian?: string,
    english?: string,
) => {
    const preferred = language === 'it' ? italian : english;
    return preferred?.trim() || fallback?.trim() || '';
};

const CandidateProfileView: React.FC<CandidateProfileViewProps> = ({ candidate, onEdit, onBack, showEditButton = true, auxiliaryActions, scoreDetails, effectiveScorePercent, jobContext }) => {
    const { text, language } = useLanguage();
    const personalInfo = candidate.personal_info || { first_name: '', last_name: '' };
    const contacts = candidate.contacts || { email: '', phone: '' };
    const residence = candidate.residence || { country: '', city: '', address: '' };
    const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
    const itSkills = Array.isArray(candidate.it_skills) ? candidate.it_skills : [];
    const experiences = Array.isArray(candidate.experiences) ? candidate.experiences : [];
    const education = Array.isArray(candidate.education) ? candidate.education : [];
    const combinedSkills = [...skills, ...itSkills];
    const candidateName = formatCandidateName(candidate) || text('Unnamed Candidate', 'Candidato senza nome');
    const preferredSummary = language === 'it' ? candidate.summary_text_it : candidate.summary_text_en;
    const fallbackSummary = candidate.summary_text || '';
    const cachedSummary = React.useMemo(() => {
        if (typeof window === 'undefined') return '';
        return window.sessionStorage.getItem(getSummaryCacheKey(candidate.id, language)) || '';
    }, [candidate.id, language]);
    const [localizedSummary, setLocalizedSummary] = React.useState(preferredSummary || cachedSummary || '');
    const [isSummaryLoading, setIsSummaryLoading] = React.useState(Boolean(!preferredSummary?.trim() && !cachedSummary && fallbackSummary.trim()));

    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        const resetScroll = () => {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        };

        resetScroll();
        const frame = window.requestAnimationFrame(resetScroll);

        return () => window.cancelAnimationFrame(frame);
    }, [candidate.id]);

    React.useEffect(() => {
        if (preferredSummary?.trim()) {
            setLocalizedSummary(preferredSummary.trim());
            setIsSummaryLoading(false);
            if (typeof window !== 'undefined') {
                window.sessionStorage.setItem(getSummaryCacheKey(candidate.id, language), preferredSummary.trim());
            }
            return;
        }

        if (cachedSummary.trim()) {
            setLocalizedSummary(cachedSummary.trim());
            setIsSummaryLoading(false);
            return;
        }

        setLocalizedSummary('');
        setIsSummaryLoading(Boolean(fallbackSummary.trim()));
    }, [preferredSummary, cachedSummary, fallbackSummary, candidate.id, language]);

    React.useEffect(() => {
        if (preferredSummary?.trim() || cachedSummary.trim() || !fallbackSummary.trim()) {
            return;
        }

        let isCancelled = false;

        const localizeSummary = async () => {
            try {
                setIsSummaryLoading(true);
                const translated = await translateProfessionalSummary(fallbackSummary, language);
                if (!isCancelled && translated.trim()) {
                    const normalizedTranslation = translated.trim();
                    setLocalizedSummary(normalizedTranslation);
                    if (typeof window !== 'undefined') {
                        window.sessionStorage.setItem(getSummaryCacheKey(candidate.id, language), normalizedTranslation);
                    }
                }
            } catch (error) {
                if (!isCancelled) {
                    console.warn('Unable to localize candidate summary for display:', error);
                }
            } finally {
                if (!isCancelled) {
                    setIsSummaryLoading(false);
                }
            }
        };

        void localizeSummary();

        return () => {
            isCancelled = true;
        };
    }, [preferredSummary, cachedSummary, fallbackSummary, language, candidate.id]);

    return (
        <div className="max-w-6xl mx-auto pt-2.5 px-3 sm:px-8 lg:px-10 animate-fade-in pb-20">
            {/* Header */}
            <div className="mb-4 pb-1">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        {text('Back', 'Indietro')}
                    </button>
                    {showEditButton && onEdit && (
                        <button
                            onClick={onEdit}
                            className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all uppercase tracking-wider text-xs flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                            {text('Edit Info', 'Modifica dati')}
                        </button>
                    )}
                </div>
            </div>
            <AiBanner context="recruiter" />

            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 p-5 shadow-sm relative overflow-hidden dark:border-slate-700 sm:p-8">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 to-amber-500"></div>

                {/* Personal Info */}
                <div className="mb-3 flex flex-col items-start gap-6 border-b border-slate-100 pb-3 dark:border-slate-700 md:mb-4 md:flex-row md:gap-8 md:pb-4">
                    <div className="h-16 w-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0 border-4 border-white dark:border-slate-800 shadow-md md:h-24 md:w-24">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="h-9 w-9 text-slate-400 dark:text-slate-300 md:h-12 md:w-12"
                            aria-hidden="true"
                        >
                            <path fillRule="evenodd" d="M12 3.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM4.5 19.25c0-3.18 3.358-5.75 7.5-5.75s7.5 2.57 7.5 5.75a1.25 1.25 0 01-1.25 1.25H5.75a1.25 1.25 0 01-1.25-1.25z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="mb-1 text-2xl font-bold text-slate-800 dark:text-slate-100 sm:text-3xl">
                            {candidateName}
                        </h2>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-400 mt-2">
                            {contacts.email && (
                                <span className="flex items-center gap-1.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                    {contacts.email}
                                </span>
                            )}
                            {contacts.phone && (
                                <span className="flex items-center gap-1.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                    {contacts.phone}
                                </span>
                            )}
                            {residence.country && (
                                <span className="flex items-center gap-1.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    {residence.city ? `${residence.city}, ` : ''}{residence.country}
                                </span>
                            )}
                        </div>
                        {auxiliaryActions && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                {auxiliaryActions}
                            </div>
                        )}
                    </div>
                </div>

                {jobContext && (
                    <div className="mb-5">
                        <CandidateNotesPanel job={jobContext.job} candidate={candidate} onJobUpdated={jobContext.onJobUpdated} />
                    </div>
                )}

                {/* Match Score Breakdown */}
                {scoreDetails && (
                    <div className="mb-10 rounded-2xl border border-orange-100 bg-orange-50/50 p-5 dark:border-orange-900/30 dark:bg-orange-950/10">
                        <div className="mb-4 flex items-center justify-between gap-4">
                            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
                                <span className="h-1 w-3 rounded-full bg-orange-500"></span>
                                {text('Match Score', 'Punteggio di match')}
                            </h3>
                            <span className="text-2xl font-black text-orange-500">
                                {effectiveScorePercent ?? Math.round(scoreDetails.finalScore * 100)}%
                            </span>
                        </div>
                        <div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
                            <ScoreBar label={text('AI Semantic Alignment', 'Allineamento semantico AI')} score={scoreDetails.semanticScore} weight={Math.round(scoreDetails.weights.semantic * 100)} />
                            <ScoreBar label={text('Hard Skills', 'Hard Skills')} score={scoreDetails.hardSkillsScore} weight={Math.round(scoreDetails.weights.hard * 100)} />
                            <ScoreBar label={text('Industry Alignment', 'Allineamento settoriale')} score={scoreDetails.industryScore} weight={Math.round(scoreDetails.weights.industry * 100)} />
                            <ScoreBar label={text('Career Prestige', 'Prestigio carriera')} score={scoreDetails.careerPrestigeScore} weight={Math.round(scoreDetails.weights.careerPrestige * 100)} />
                            <ScoreBar label={text('Education Quality', 'Qualità formazione')} score={scoreDetails.educationScore} weight={Math.round(scoreDetails.weights.education * 100)} />
                        </div>
                    </div>
                )}

                {/* Summary */}
                <div className="mb-10">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">{text('Professional Summary', 'Profilo professionale')}</h3>
                    {isSummaryLoading ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                            <Spinner />
                            <span>{text('Translating professional summary...', 'Traduzione del profilo professionale...')}</span>
                        </div>
                    ) : (
                        <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300 sm:text-lg">
                            {localizedSummary || text('No summary provided.', 'Nessun riepilogo disponibile.')}
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
                    {/* Experience */}
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 border-b border-slate-100 dark:border-slate-700 pb-2">{text('Experience', 'Esperienza')}</h3>
                        <div className="space-y-8">
                            {experiences.length > 0 ? experiences.map((exp, idx) => (
                                <div key={idx} className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-700">
                                    <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-white dark:bg-slate-800 border-4 border-slate-200 dark:border-slate-700"></div>
                                    <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg">{exp.role}</h4>
                                    <p className="text-slate-600 dark:text-slate-400 font-medium">{exp.company}</p>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider mt-1 mb-2">{exp.from} - {exp.to}</p>
                                    {getLocalizedCandidateText(language, exp.description, exp.description_it, exp.description_en) && (
                                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                            {getLocalizedCandidateText(language, exp.description, exp.description_it, exp.description_en)}
                                        </p>
                                    )}
                                </div>
                            )) : (
                                <p className="text-sm text-slate-500 dark:text-slate-400">{text('No work experience added yet.', 'Nessuna esperienza lavorativa aggiunta al momento.')}</p>
                            )}
                        </div>
                    </div>

                    {/* Education */}
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 border-b border-slate-100 dark:border-slate-700 pb-2">{text('Education', 'Formazione')}</h3>
                        <div className="space-y-8">
                            {education.length > 0 ? education.map((edu, idx) => (
                                <div key={idx}>
                                    <h4 className="font-bold text-slate-800 dark:text-slate-100">{edu.institution}</h4>
                                    <p className="text-slate-600 dark:text-slate-400">{getEducationLevelLabel(edu.degree_level, language)} in {getMajorName(edu.major)}</p>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">{edu.from} - {edu.to}</p>
                                    {getLocalizedCandidateText(language, edu.description, edu.description_it, edu.description_en) && (
                                        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                                            {getLocalizedCandidateText(language, edu.description, edu.description_it, edu.description_en)}
                                        </p>
                                    )}
                                </div>
                            )) : (
                                <p className="text-sm text-slate-500 dark:text-slate-400">{text('No education records added yet.', 'Nessun titolo di studio aggiunto al momento.')}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Skills Grid */}
                <div className="mb-10">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">{text('Core Competencies', 'Competenze principali')}</h3>
                    {combinedSkills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {combinedSkills.map((skill, idx) => (
                            <div key={idx} className="bg-slate-50 dark:bg-slate-700/50 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center gap-3">
                                <div>
                                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm block">{skill.skill_name}</span>
                                    <span className="text-[10px] text-slate-400 font-medium uppercase">{getSeekerSkillLevelLabel(skill.level)}</span>
                                </div>
                                <div className="flex gap-0.5 ml-auto">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className={`h-1.5 w-1.5 rounded-full ${i < Math.round((skill.level || 0) / 2) ? 'bg-orange-500' : 'bg-slate-200 dark:bg-slate-600'}`}></div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400">{text('No skills added yet.', 'Nessuna skill aggiunta al momento.')}</p>
                    )}
                </div>

            </div>
        </div>
    );
};

export default CandidateProfileView;
