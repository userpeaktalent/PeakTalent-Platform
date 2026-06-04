import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QuestionnaireAnswer, QuizQuestion, TestResult } from '../types';
import { AiBanner } from './common';
import { useLanguage } from './LanguageProvider';

interface QuizTestProps {
    title: string;
    jobId: string;
    questions: QuizQuestion[];
    onComplete: (result: TestResult) => Promise<void> | void;
    onBack?: () => void;
    timeLimitSeconds?: number;
    questionnaireGeneratedAt?: string;
}

// Fisher-Yates shuffle with a linear-congruential seed — deterministic per session
const seededShuffle = <T,>(arr: T[], seed: number): T[] => {
    const result = [...arr];
    let s = seed;
    for (let i = result.length - 1; i > 0; i--) {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        const j = Math.abs(s) % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
};

const QuizTest: React.FC<QuizTestProps> = ({ title, jobId, questions, onComplete, onBack, timeLimitSeconds, questionnaireGeneratedAt }) => {
    const { text, language } = useLanguage();
    const totalSeconds = Math.max(0, timeLimitSeconds ?? questions.length * 60);
    const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
    const averageSecondsPerQuestion = questions.length > 0 ? Math.round(totalSeconds / questions.length) : 0;
    const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [timeLeft, setTimeLeft] = useState(totalSeconds);
    const [timerVisible, setTimerVisible] = useState(true);
    const [tabSwitchCount, setTabSwitchCount] = useState(0);
    const [showTabWarning, setShowTabWarning] = useState(false);
    const timerRef = useRef<HTMLDivElement>(null);
    const endTimeRef = useRef<number | null>(null);
    const performSubmitRef = useRef<(skip: boolean) => Promise<boolean>>(async () => false);

    // One random seed per session — stable across re-renders, different per candidate
    const sessionSeed = useMemo(() => Math.floor(Math.random() * 2 ** 31), []);

    // Shuffle question order once per session
    const shuffledQuestions = useMemo(() => seededShuffle(questions, sessionSeed), [questions, sessionSeed]);

    // Per-question option shuffle: maps shuffled display index → original correct_option_index space
    const optionMaps = useMemo(() => {
        return shuffledQuestions.map((q, qi) => {
            const originalIndices = [0, 1, 2, 3].slice(0, (q.options?.length ?? 4));
            const shuffled = seededShuffle(originalIndices, sessionSeed + qi + 1);
            // shuffled[displayPos] = originalIndex
            return { questionId: q.id, shuffled };
        });
    }, [shuffledQuestions, sessionSeed]);

    const formatTime = (seconds: number) => {
        const mm = Math.floor(seconds / 60);
        const ss = seconds % 60;
        return `${mm}:${ss.toString().padStart(2, '0')}`;
    };

    const answeredCount = Object.keys(answers).length;
    const completion = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

    const score = useMemo(() => {
        if (!questions.length) return 0;
        const correctAnswers = questions.reduce((total, question) => (
            answers[question.id] === question.correct_option_index ? total + 1 : total
        ), 0);
        return Math.round((correctAnswers / questions.length) * 100);
    }, [answers, questions]);

    const getQuestionText = (question: QuizQuestion) =>
        language === 'en'
            ? (question.text_en || question.text || question.text_it || '')
            : (question.text_it || question.text || question.text_en || '');

    const getQuestionOptions = (question: QuizQuestion) =>
        language === 'en'
            ? ((question.options_en && question.options_en.length === 4 ? question.options_en : (question.options || question.options_it || [])))
            : ((question.options_it && question.options_it.length === 4 ? question.options_it : (question.options || question.options_en || [])));

    const answerDetails = useMemo<QuestionnaireAnswer[]>(() => (
        questions.map((question) => {
            const selectedOptionIndex = answers[question.id] ?? -1;
            const localizedOptions = getQuestionOptions(question);
            return {
                question_id: question.id,
                question_text: getQuestionText(question),
                options: localizedOptions,
                selected_option_index: selectedOptionIndex,
                selected_option_text: localizedOptions[selectedOptionIndex] || '',
                correct_option_index: question.correct_option_index,
                correct_option_text: localizedOptions[question.correct_option_index] || '',
                is_correct: selectedOptionIndex === question.correct_option_index,
            };
        })
    ), [answers, questions, language]);

    // Warn on browser close / refresh / external navigation — only after test has started
    useEffect(() => {
        if (!disclaimerAccepted || isSubmitting) return;
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [disclaimerAccepted, isSubmitting]);

    // Intercept browser back button — show leave confirmation instead of navigating away
    useEffect(() => {
        if (!disclaimerAccepted || isSubmitting) return;
        window.history.pushState(null, '', window.location.href);
        const handlePopState = () => {
            window.history.pushState(null, '', window.location.href);
            setShowLeaveConfirm(true);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [disclaimerAccepted, isSubmitting]);

    // Wall-clock countdown — immune to tab throttling
    useEffect(() => {
        if (!disclaimerAccepted || isSubmitting) return;
        if (endTimeRef.current === null) {
            endTimeRef.current = Date.now() + timeLeft * 1000;
        }
        const interval = setInterval(() => {
            const remaining = Math.max(0, Math.round((endTimeRef.current! - Date.now()) / 1000));
            setTimeLeft(remaining);
            if (remaining === 0) {
                clearInterval(interval);
                performSubmitRef.current(true);
            }
        }, 500);
        return () => clearInterval(interval);
    }, [disclaimerAccepted, isSubmitting]);

    useEffect(() => {
        if (!timerRef.current) return;
        const observer = new IntersectionObserver(
            ([entry]) => setTimerVisible(entry.isIntersecting),
            { threshold: 0.1 }
        );
        observer.observe(timerRef.current);
        return () => observer.disconnect();
    }, [disclaimerAccepted]);

    // Tab / window focus detection — log switches and warn on return
    useEffect(() => {
        if (!disclaimerAccepted || isSubmitting) return;
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                setTabSwitchCount(prev => prev + 1);
            } else {
                setShowTabWarning(true);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [disclaimerAccepted, isSubmitting]);

    const performSubmit = async (skipCompletionCheck = false): Promise<boolean> => {
        if (questions.length === 0) {
            if (!skipCompletionCheck) {
                setSubmitError(text('This quiz is not available yet.', 'Questo quiz non è ancora disponibile.'));
            }
            return false;
        }

        if (!skipCompletionCheck && answeredCount < questions.length) {
            setSubmitError(text('Answer every question before submitting.', 'Rispondi a tutte le domande prima di inviare.'));
            return false;
        }

        setIsSubmitting(true);
        setSubmitError('');

        try {
            await onComplete({
                job_id: jobId,
                score,
                completed_at: new Date().toISOString(),
                questionnaire_generated_at: questionnaireGeneratedAt,
                questionnaire_title: title,
                question_count: questions.length,
                answers: answerDetails,
                tab_switch_count: tabSwitchCount,
            });
            return true;
        } catch (error: any) {
            console.error('Failed to submit technical quiz:', error);
            if (!skipCompletionCheck) {
                setSubmitError(
                    error?.message || text('The quiz could not be submitted right now.', 'Il quiz non può essere inviato in questo momento.')
                );
            }
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    performSubmitRef.current = performSubmit;

    const handleSubmit = () => performSubmit(false);

    const handleBackClick = () => {
        setShowLeaveConfirm(true);
    };

    const handleConfirmLeave = async () => {
        setShowLeaveConfirm(false);
        await performSubmit(true);
        onBack?.();
    };

    // Disclaimer screen — shown before the test starts
    if (!disclaimerAccepted) {
        return (
            <div className="mx-auto max-w-5xl animate-fade-in pt-2.5">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
                    >
                        &larr; {text('Back', 'Indietro')}
                    </button>
                )}
                <AiBanner context="seeker" />
                <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-6">
                        <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                            {title}
                        </h2>
                    </div>

                    <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/40 dark:bg-amber-950/20">
                        <h3 className="text-base font-semibold text-amber-900 dark:text-amber-200">
                            {text('Before you start — read carefully', 'Prima di iniziare — leggi con attenzione')}
                        </h3>
                        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-amber-900 shadow-sm dark:bg-amber-900/40 dark:text-amber-100">
                            <span>⏱</span>
                            {text(
                                `Total time: ${totalMinutes} minutes (${questions.length} questions, about ${averageSecondsPerQuestion} sec per question)`,
                                `Tempo totale: ${totalMinutes} minuti (${questions.length} domande, circa ${averageSecondsPerQuestion} sec a domanda)`
                            )}
                        </div>
                        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-amber-800 dark:text-amber-300">
                            <li className="flex items-start gap-2">
                                <span className="mt-0.5 shrink-0 font-bold">•</span>
                                {text(
                                    'The timer starts as soon as you click "I understand" and cannot be paused. When it runs out, the test will be submitted automatically with the answers you have given.',
                                    'Il timer parte appena clicchi "Ho capito" e non può essere messo in pausa. Allo scadere del tempo, il test verrà inviato automaticamente con le risposte date.'
                                )}
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="mt-0.5 shrink-0 font-bold">•</span>
                                {text(
                                    'Do not close the browser tab/window or press the back button. If you do, you will be asked to confirm and your answers — even if partial or none — will be submitted as-is.',
                                    'Non chiudere la scheda/finestra del browser e non premere indietro. Se lo fai, ti verrà chiesta conferma e le tue risposte — anche se parziali o nessuna — verranno inviate così come sono.'
                                )}
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="mt-0.5 shrink-0 font-bold">•</span>
                                {text(
                                    'Do not switch to other tabs or windows during the test. Tab changes are detected and logged for the recruiter.',
                                    'Non passare ad altre schede o finestre durante il test. I cambi di scheda vengono rilevati e registrati per il recruiter.'
                                )}
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="mt-0.5 shrink-0 font-bold">•</span>
                                {text(
                                    'Answer all questions and submit using the button at the bottom of the page.',
                                    'Rispondi a tutte le domande e invia tramite il pulsante in fondo alla pagina.'
                                )}
                            </li>
                        </ul>
                    </div>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row-reverse">
                        <button
                            type="button"
                            onClick={() => setDisclaimerAccepted(true)}
                            className="inline-flex items-center justify-center rounded-2xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
                        >
                            {text('I understand — start the test', 'Ho capito — avvia il test')}
                        </button>
                        {onBack && (
                            <button
                                type="button"
                                onClick={onBack}
                                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                {text('Back', 'Indietro')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl animate-fade-in pt-2.5">
            {/* Leave confirmation modal */}
            {showLeaveConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="mx-4 w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-950">
                        <h3 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                            {text('Leave the questionnaire?', 'Uscire dal questionario?')}
                        </h3>
                        <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                            {text(
                                `You have answered ${answeredCount} of ${questions.length} questions. If you leave now, your answers will be submitted automatically as-is.`,
                                `Hai risposto a ${answeredCount} di ${questions.length} domande. Se esci ora, le risposte date verranno inviate automaticamente.`
                            )}
                        </p>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
                            <button
                                type="button"
                                onClick={handleConfirmLeave}
                                className="inline-flex items-center justify-center rounded-2xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
                            >
                                {text('Submit and leave', 'Invia ed esci')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowLeaveConfirm(false)}
                                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                {text('Continue the test', 'Continua il test')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab switch warning modal */}
            {showTabWarning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="mx-4 w-full max-w-md rounded-[28px] border border-rose-200 bg-white p-8 shadow-xl dark:border-rose-900/50 dark:bg-slate-950">
                        <h3 className="text-xl font-semibold tracking-tight text-rose-700 dark:text-rose-400">
                            {text('Tab switch detected', 'Cambio scheda rilevato')}
                        </h3>
                        <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                            {text(
                                `You have left the test page ${tabSwitchCount} time${tabSwitchCount !== 1 ? 's' : ''}. This is logged and visible to the recruiter. Please stay on this page for the remainder of the test.`,
                                `Hai abbandonato la pagina del test ${tabSwitchCount} volt${tabSwitchCount !== 1 ? 'e' : 'a'}. Questo viene registrato ed è visibile al recruiter. Rimani su questa pagina per il resto del test.`
                            )}
                        </p>
                        <div className="mt-6">
                            <button
                                type="button"
                                onClick={() => setShowTabWarning(false)}
                                className="inline-flex w-full items-center justify-center rounded-2xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
                            >
                                {text('I understand — continue the test', 'Ho capito — continua il test')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {onBack && (
                <button
                    onClick={handleBackClick}
                    disabled={isSubmitting}
                    className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:text-orange-400"
                >
                    &larr; {text('Back', 'Indietro')}
                </button>
            )}

            <AiBanner context="seeker" />

            {/* Sticky timer badge — visible only when main timer scrolls out of view */}
            {!timerVisible && !isSubmitting && (() => {
                const radius = 16;
                const circumference = 2 * Math.PI * radius;
                const progress = totalSeconds > 0 ? timeLeft / totalSeconds : 0;
                const isLow = timeLeft <= 60;
                return (
                    <div className="fixed top-20 right-4 z-50 rounded-full border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        <div className="relative flex shrink-0 items-center justify-center" style={{ width: 52, height: 52 }}>
                            <svg width="52" height="52" style={{ transform: 'rotate(-90deg)' }}>
                                <circle cx="26" cy="26" r={radius} fill="none" stroke={isLow ? '#fecaca' : '#e2e8f0'} strokeWidth="3" />
                                <circle cx="26" cy="26" r={radius} fill="none" stroke={isLow ? '#ef4444' : '#f97316'} strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }} />
                            </svg>
                            <span className={`absolute text-[11px] font-bold tabular-nums ${isLow ? 'text-red-500' : 'text-slate-900 dark:text-slate-100'}`}>{formatTime(timeLeft)}</span>
                        </div>
                    </div>
                );
            })()}

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                            {title}
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                            {text(
                                'Answer the questions below to give the recruiter clearer evidence about your qualifications, tool familiarity, and fit for this position.',
                                'Rispondi alle domande qui sotto per dare al recruiter evidenze più chiare sulle tue qualifiche, sulla conoscenza degli strumenti richiesti e sul tuo fit per questa posizione.'
                            )}
                        </p>
                    </div>

                    <div className="flex items-center gap-5">
                        {/* Stopwatch */}
                        {(() => {
                            const radius = 30;
                            const circumference = 2 * Math.PI * radius;
                            const progress = totalSeconds > 0 ? timeLeft / totalSeconds : 0;
                            const isLow = timeLeft <= 60;
                            return (
                                <div ref={timerRef} className="relative flex shrink-0 items-center justify-center" style={{ width: 80, height: 80 }}>
                                    <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
                                        <circle cx="40" cy="40" r={radius} fill="none" stroke={isLow ? '#fecaca' : '#e2e8f0'} strokeWidth="5" />
                                        <circle
                                            cx="40" cy="40" r={radius} fill="none"
                                            stroke={isLow ? '#ef4444' : '#f97316'}
                                            strokeWidth="5"
                                            strokeLinecap="round"
                                            strokeDasharray={circumference}
                                            strokeDashoffset={circumference * (1 - progress)}
                                            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
                                        />
                                    </svg>
                                    <span className={`absolute text-sm font-semibold tabular-nums ${isLow ? 'text-red-500' : 'text-slate-900 dark:text-slate-100'}`}>
                                        {formatTime(timeLeft)}
                                    </span>
                                </div>
                            );
                        })()}
                        <div className="text-right">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                {text('Progress', 'Avanzamento')}
                            </p>
                            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                {completion}%
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {answeredCount}/{questions.length} {text('answered', 'risposte')}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="mt-6 space-y-5">
                    {shuffledQuestions.map((question, index) => {
                        const optionMap = optionMaps[index];
                        const localizedOptions = getQuestionOptions(question);
                        const shuffledOptions = optionMap.shuffled.map(originalIdx => localizedOptions[originalIdx] || '');

                        return (
                            <section
                                key={question.id}
                                className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/40"
                            >
                                <div className="mb-4 flex flex-wrap items-center gap-2">
                                    <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
                                        {text('Question', 'Domanda')} {index + 1}
                                    </span>
                                    <span className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-[11px] font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                                        {text('Multiple choice', 'Risposta multipla')}
                                    </span>
                                </div>
                                <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                    {getQuestionText(question)}
                                </h3>
                                <div className="mt-4 grid grid-cols-1 gap-3">
                                    {shuffledOptions.map((option, displayIndex) => {
                                        const originalIndex = optionMap.shuffled[displayIndex];
                                        const isSelected = answers[question.id] === originalIndex;
                                        return (
                                            <button
                                                key={`${question.id}_${displayIndex}`}
                                                type="button"
                                                onClick={() => {
                                                    setAnswers(current => ({ ...current, [question.id]: originalIndex }));
                                                    setSubmitError('');
                                                }}
                                                className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-all ${
                                                    isSelected
                                                        ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm dark:bg-orange-950/30 dark:text-orange-200'
                                                        : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50/60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-orange-700 dark:hover:bg-slate-900'
                                                }`}
                                            >
                                                <span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-current text-[11px] font-semibold">
                                                    {String.fromCharCode(65 + displayIndex)}
                                                </span>
                                                {option}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}
                </div>

                {submitError && (
                    <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                        {submitError}
                    </div>
                )}

                <div className="mt-8 flex flex-col gap-4 border-t border-slate-200 pt-6 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                        {text(
                            'Submitting the questionnaire updates your profile for this role and helps the recruiter refine the final ranking.',
                            "L'invio del questionario aggiorna il tuo profilo per questo ruolo e aiuta il recruiter a rifinire il ranking finale."
                        )}
                    </p>
                    <button
                        type="button"
                        disabled={isSubmitting || questions.length === 0}
                        onClick={handleSubmit}
                        className="inline-flex items-center justify-center rounded-2xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isSubmitting
                            ? text('Submitting...', 'Invio in corso...')
                            : text('Submit questionnaire', 'Invia questionario')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuizTest;
