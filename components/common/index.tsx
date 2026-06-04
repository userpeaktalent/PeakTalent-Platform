
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CandidateProfile, MatchScoreBreakdown } from '../../types';
import { formatCandidateName } from '../../utils/nameFormat';
import { useLanguage } from '../LanguageProvider';

export const Spinner = () => (
    <div className="flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
    </div>
);

/**
 * Lightweight page placeholder used as Suspense fallback while a lazy route
 * chunk is downloading, and as a generic profile-loading screen. Reuses the
 * Tailwind `animate-pulse` utility so it weighs nothing.
 */
export const PageSkeleton: React.FC<{ variant?: 'dashboard' | 'detail' }> = ({ variant = 'dashboard' }) => {
    const cardCount = variant === 'detail' ? 2 : 3;
    return (
        <div className="mx-auto w-full max-w-6xl animate-pulse px-4 py-8 sm:px-6 lg:px-8" aria-hidden="true">
            <div className="mb-6 h-8 w-48 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="mb-8 h-4 w-72 rounded bg-slate-200/70 dark:bg-slate-800/70" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: cardCount }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-3 h-5 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                        <div className="mb-2 h-3 w-full rounded bg-slate-200/70 dark:bg-slate-800/70" />
                        <div className="mb-2 h-3 w-5/6 rounded bg-slate-200/70 dark:bg-slate-800/70" />
                        <div className="h-3 w-3/4 rounded bg-slate-200/70 dark:bg-slate-800/70" />
                    </div>
                ))}
            </div>
        </div>
    );
};

export const LoadingScreen: React.FC<{ messages: string[] }> = ({ messages }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [elapsed, setElapsed] = useState(0);

    // Progress through messages sequentially
    useEffect(() => {
        if (currentIndex >= messages.length - 1) return;
        const timer = setTimeout(() => {
            setCurrentIndex((prev) => Math.min(prev + 1, messages.length - 1));
        }, 3000);
        return () => clearTimeout(timer);
    }, [currentIndex, messages.length]);

    // Elapsed time counter
    useEffect(() => {
        const interval = setInterval(() => setElapsed(prev => prev + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const progressPercent = messages.length > 1
        ? Math.round(((currentIndex + 1) / messages.length) * 100)
        : 50;

    return (
        <div className="fixed inset-0 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            {/* Spinner */}
            <div className="relative mb-10">
                <div className="h-20 w-20 rounded-full border-4 border-slate-100 dark:border-slate-800 border-t-orange-500 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
            </div>

            {/* Step list */}
            <div className="max-w-sm w-full space-y-3 mb-10">
                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-500 ${i < currentIndex
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                            : i === currentIndex
                                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 shadow-sm'
                                : 'text-slate-300 dark:text-slate-600'
                            }`}
                    >
                        {i < currentIndex ? (
                            <svg className="h-4 w-4 flex-shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                        ) : i === currentIndex ? (
                            <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></div>
                        ) : (
                            <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-slate-200 dark:border-slate-700"></div>
                        )}
                        <span className={`text-sm font-semibold ${i <= currentIndex ? '' : 'opacity-50'}`}>
                            {msg}
                        </span>
                    </div>
                ))}
            </div>

            {/* Progress bar */}
            <div className="w-64">
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${progressPercent}%` }}
                    ></div>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 font-medium">
                    {elapsed < 10 ? 'This usually takes a few seconds…' : elapsed < 30 ? 'Almost there…' : 'Still working on it…'}
                </p>
            </div>
        </div>
    );
};

export const JsonViewer: React.FC<{ data: object }> = ({ data }) => (
    <div className="bg-slate-800 text-slate-100 rounded-lg p-4 my-4 overflow-x-auto">
        <pre>
            <code>{JSON.stringify(data, null, 2)}</code>
        </pre>
    </div>
);

export const ProgressTracker: React.FC<{ steps: string[], currentStep: number }> = ({ steps, currentStep }) => {
    const progressPercentage = steps.length > 1 ? ((currentStep - 1) / (steps.length - 1)) * 100 : 100;

    return (
        <div className="w-full mb-8">
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div
                    className="bg-gradient-to-r from-orange-500 to-amber-500 h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                ></div>
            </div>
            <p className="text-center text-sm font-semibold text-slate-700 dark:text-slate-300 mt-3">
                Step {currentStep} of {steps.length}: {steps[currentStep - 1]}
            </p>
        </div>
    );
}

export const CandidateCard: React.FC<{
    candidate: CandidateProfile;
    scoreDetails: MatchScoreBreakdown;
    effectiveScorePercent?: number;
    rankNumber?: number;
    questionnaireScore?: number | null;
    showQuestionnaireMetric?: boolean;
    isLocked?: boolean;
    profileAction?: React.ReactNode;
    nextStepAction?: React.ReactNode;
    recruiterOverride?: { score: number; reason?: string } | null;
    onEditOverride?: () => void;
    onOpenProfile?: () => void;
    headerActions?: React.ReactNode;
}> = ({ candidate, scoreDetails, effectiveScorePercent, rankNumber, questionnaireScore, showQuestionnaireMetric = true, isLocked = false, profileAction, nextStepAction, recruiterOverride, onEditOverride, onOpenProfile, headerActions }) => {
    const { text } = useLanguage();
    const [isExpanded, setIsExpanded] = useState(false);
    const aiScore = Math.round(scoreDetails.finalScore * 100);
    const displayedScore = recruiterOverride?.score ?? effectiveScorePercent ?? aiScore;
    const candidateName = formatCandidateName(candidate) || 'Unnamed Candidate';
    const experiences = Array.isArray(candidate.experiences) ? candidate.experiences : [];
    const breakdownItems = [
        {
            label: 'AI Semantic Alignment',
            score: scoreDetails.semanticScore,
            weight: Math.round(scoreDetails.weights.semantic * 100),
        },
        {
            label: 'Hard Skills',
            score: scoreDetails.hardSkillsScore,
            weight: Math.round(scoreDetails.weights.hard * 100),
        },
        {
            label: 'Industry Alignment',
            score: scoreDetails.industryScore,
            weight: Math.round(scoreDetails.weights.industry * 100),
        },
        {
            label: 'Career Prestige',
            score: scoreDetails.careerPrestigeScore,
            weight: Math.round(scoreDetails.weights.careerPrestige * 100),
        },
        {
            label: 'Education Quality',
            score: scoreDetails.educationScore,
            weight: Math.round(scoreDetails.weights.education * 100),
        },
    ];

    if (showQuestionnaireMetric) {
        breakdownItems.push({
            label: text('Role Questionnaire', 'Questionario sul ruolo'),
            score: typeof questionnaireScore === 'number' ? Math.max(0, Math.min(1, questionnaireScore / 100)) : 0,
            weight: 0,
        });
    }

    const latestExperience = experiences.find(exp => exp.is_current_position) || experiences[0];
    const matchBand = displayedScore >= 60
        ? {
            label: text('Great', 'Ottimo'),
            ringClass: 'text-emerald-700 dark:text-emerald-400',
            labelClass: 'text-emerald-700 dark:text-emerald-300',
        }
        : displayedScore >= 50
            ? {
                label: text('Good', 'Buono'),
                ringClass: 'text-green-500 dark:text-green-400',
                labelClass: 'text-green-600 dark:text-green-300',
            }
            : displayedScore >= 40
                ? {
                    label: text('Average', 'Medio'),
                    ringClass: 'text-orange-500 dark:text-orange-400',
                    labelClass: 'text-orange-600 dark:text-orange-300',
                }
                : {
                    label: text('Not fit', 'Basso'),
                    ringClass: 'text-rose-500',
                    labelClass: 'text-rose-600 dark:text-rose-300',
                };

    const isCardClickable = !isLocked;
    const stopCardOpen = (event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();
    };
    const toggleBreakdown = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
        event.stopPropagation();
        setIsExpanded((current) => !current);
    };
    const handleCardClick = () => {
        if (onOpenProfile) {
            onOpenProfile();
            return;
        }
        setIsExpanded((current) => !current);
    };
    const handleCardKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleCardClick();
        }
    };
    const scoreRingNode = (
        <>
            <div
                className={`relative h-[76px] w-[76px] sm:h-[84px] sm:w-[84px] ${!isLocked ? 'cursor-pointer' : ''}`}
                onClick={!isLocked ? toggleBreakdown : undefined}
                onKeyDown={!isLocked ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleBreakdown(event);
                    }
                } : undefined}
                role={!isLocked ? 'button' : undefined}
                tabIndex={!isLocked ? 0 : undefined}
                aria-label={!isLocked ? (isExpanded ? text('Hide score details', 'Nascondi dettaglio punteggio') : text('Show score details', 'Mostra dettaglio punteggio')) : undefined}
            >
                <svg className="h-full w-full" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="18" cy="18" r="16" fill="none" className="stroke-current text-slate-100 dark:text-slate-800" strokeWidth="3"></circle>
                    <circle cx="18" cy="18" r="16" fill="none" className={`stroke-current ${recruiterOverride ? 'text-violet-500 dark:text-violet-400' : matchBand.ringClass}`} strokeWidth="3" strokeDasharray={`${displayedScore}, 100`} strokeLinecap="round" transform="rotate(-90 18 18)"></circle>
                </svg>
                <span className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-base font-black sm:text-lg ${recruiterOverride ? 'text-violet-600 dark:text-violet-300' : 'text-slate-800 dark:text-slate-100'}`}>{displayedScore}%</span>
                </span>
                {!isLocked && (
                    <span
                        className={`absolute bottom-[0.725rem] left-1/2 inline-flex -translate-x-1/2 items-center justify-center transition-colors pointer-events-none ${recruiterOverride ? 'text-violet-500 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400'}`}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.2}
                                d={isExpanded ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
                            />
                        </svg>
                    </span>
                )}
            </div>
            {!isLocked && onEditOverride && (
                <button
                    onClick={(event) => {
                        event.stopPropagation();
                        onEditOverride();
                    }}
                    title={text('Edit', 'Modifica')}
                    className="text-[9px] font-semibold text-slate-400 hover:text-violet-500 transition-colors flex items-center gap-0.5"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                    </svg>
                    {text('Edit', 'Modifica')}
                </button>
            )}
        </>
    );

    return (
        <div
            className={`overflow-hidden rounded-[28px] border border-slate-300 bg-white p-4 shadow-lg transition-all group dark:border-slate-600 dark:bg-slate-800 ${isCardClickable ? 'cursor-pointer hover:border-slate-400 hover:shadow-xl dark:hover:border-slate-500' : ''}`}
            onClick={isCardClickable ? handleCardClick : undefined}
            onKeyDown={isCardClickable ? handleCardKeyDown : undefined}
            role={isCardClickable ? 'button' : undefined}
            tabIndex={isCardClickable ? 0 : undefined}
        >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 pr-1">
                    <div className="flex flex-wrap items-center gap-2">
                        {typeof rankNumber === 'number' && rankNumber > 0 && (
                            <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                                #{rankNumber}
                            </span>
                        )}
                        <h3 className="text-lg font-black tracking-tight text-slate-800 transition-colors group-hover:text-orange-500 sm:text-xl dark:text-slate-100">
                            {candidateName}
                        </h3>
                    </div>
                    {latestExperience && (
                        <p className="mt-0.5 text-sm font-bold text-slate-500 dark:text-slate-400">
                            {latestExperience.role} <span className="opacity-50">at</span> {latestExperience.company}
                        </p>
                    )}
                    {(headerActions || nextStepAction) && (
                        <div className="mt-3 flex flex-wrap items-center gap-2" onClick={stopCardOpen}>
                            {headerActions}
                            {nextStepAction && (
                                <div className="hidden sm:ml-3 sm:block">
                                    {nextStepAction}
                                </div>
                            )}
                        </div>
                    )}

                    {nextStepAction ? (
                        <div className="mt-3 flex items-stretch gap-3 sm:hidden">
                            <div className="min-w-0 flex-1" onClick={stopCardOpen}>
                                {nextStepAction}
                            </div>
                            <div className="flex w-[76px] flex-shrink-0 flex-col items-center justify-start gap-1">
                                {scoreRingNode}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-3 flex justify-end sm:hidden">
                            <div className="flex w-[76px] flex-shrink-0 flex-col items-center justify-start gap-1">
                                {scoreRingNode}
                            </div>
                        </div>
                    )}

                    {nextStepAction && !headerActions && (
                        <div className="mt-3 hidden max-w-[640px] sm:block" onClick={stopCardOpen}>
                            {nextStepAction}
                        </div>
                    )}

                    {!isLocked && profileAction && (
                        <div className="mt-3 flex flex-wrap items-center gap-2" onClick={stopCardOpen}>
                            {profileAction}
                        </div>
                    )}
                </div>
                <div className="hidden self-end flex-shrink-0 flex-col items-center gap-1 sm:ml-2 sm:flex sm:self-auto">
                    {scoreRingNode}
                </div>
            </div>

            {isExpanded && !isLocked && (
                <div className="mt-4 animate-fade-in rounded-2xl border bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50" onClick={stopCardOpen}>
                    <h4 className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
                        <span className="h-1 w-3 bg-orange-500 rounded-full"></span>
                        Evaluation Breakdown ({breakdownItems.length} Pillars)
                    </h4>
                    <div className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
                        {breakdownItems.map((item) => (
                            <ScoreBar key={item.label} label={item.label} score={item.score} weight={item.weight} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export interface ScoreBarProps { label: string; score: number; weight: number }
export const ScoreBar: React.FC<ScoreBarProps> = ({ label, score, weight }) => (
    <div>
        <div className="mb-1 flex items-center justify-between gap-3">
            <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-tight text-slate-800 dark:text-slate-100 sm:text-[11px]">{label}</span>
                <span className="ml-2 text-[9px] font-semibold text-slate-400 sm:text-[10px]">({weight}%)</span>
            </div>
            <span className="shrink-0 text-[10px] font-black text-slate-700 dark:text-slate-200 sm:text-[11px]">{Math.round(score * 100)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
                className="h-full bg-orange-500 transition-all duration-1000 ease-out shadow-sm"
                style={{ width: `${score * 100}%` }}
            />
        </div>
    </div>
);

export const AiBanner: React.FC<{ context?: 'recruiter' | 'seeker' | 'quiz' }> = ({ context }) => {
    const { text } = useLanguage();
    const msg = context === 'seeker'
        ? text(
            'AI-assisted content — Recommendations and assessments are generated by AI to support your job search. Final hiring decisions are always made by humans.',
            'Contenuto assistito dall\'AI — Raccomandazioni e valutazioni sono generate dall\'AI a supporto della tua ricerca. Le decisioni finali di assunzione sono sempre prese da persone.'
          )
        : context === 'recruiter'
        ? text(
            'AI-assisted content — Recommendations and evaluations are generated by AI to support your search. Final hiring decisions are always made by people.',
            'Contenuto assistito dall\'AI — Raccomandazioni e valutazioni sono generate dall\'AI a supporto della tua ricerca. Le decisioni finali di assunzione sono sempre prese da persone.'
          )
        : context === 'quiz'
        ? text(
            'AI-generated questions — These questions were generated by AI from the job description to assess role-specific skills and knowledge. Candidate answers are used as a supplementary input to support your evaluation, not as an automated scoring system. You retain full responsibility for assessing candidates.',
            'Domande generate dall\'AI — Le domande sono state generate dall\'AI a partire dalla job description per valutare competenze e conoscenze specifiche del ruolo. Le risposte dei candidati sono un supporto alla tua valutazione, non un sistema di punteggio automatizzato. Hai piena responsabilità nella valutazione dei candidati.'
          )
        : text(
            'AI-generated content to support decision-making. Not an automated determination — final decisions are always made by humans.',
            'Contenuto generato dall\'AI a supporto delle decisioni. Non una determinazione automatizzata — le decisioni finali sono sempre prese da persone.'
          );

    const infoIcon = (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
        </svg>
    );

    const isSeeker = context === 'seeker';
    const tooltip = text('How does the score work?', 'Come funziona il punteggio?');

    return (
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5 mb-4">
            {isSeeker ? (
                <Link
                    to="/seeker/how-matching-works"
                    title={tooltip}
                    aria-label={tooltip}
                    className="group relative mt-0.5 flex-shrink-0 inline-flex h-5 w-5 -m-0.5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-orange-100 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300"
                >
                    {infoIcon}
                    <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow transition-opacity group-hover:opacity-100 dark:bg-slate-700">
                        {tooltip}
                    </span>
                </Link>
            ) : (
                <span className="mt-0.5 flex-shrink-0 text-slate-400">{infoIcon}</span>
            )}
            <span className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{msg}</span>
        </div>
    );
};

export const BotIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" />
        <path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
    </svg>
);
