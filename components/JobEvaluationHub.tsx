import React, { useMemo, useState } from 'react';
import { CandidateProfile, EvaluationStep, JobProfile, TestResult } from '../types';
import QuizTest from './QuizTest';
import { addCandidate, markCandidateAssessmentCompleted } from '../services/dbService';
import { AiBanner } from './common';
import { useLanguage } from './LanguageProvider';

interface JobEvaluationHubProps {
  job: JobProfile;
  onBack: () => void;
  candidate: CandidateProfile;
  onUpdateCandidate: (candidate: CandidateProfile) => void;
  onOpenProfileRefine: () => void;
}

const buildEvaluationSteps = (
  candidate: CandidateProfile,
  job: JobProfile,
  text: (en: string, it: string) => string
): EvaluationStep[] => {
  const hasProfileRefinement = Boolean(candidate.ai_refined);
  const hasQuizResult = Boolean(candidate.test_results?.some((result) => result.job_id === job.id));
  const questionCount = job.technical_test?.questions?.length || 10;

  return [
    {
      id: 'step_profile_refinement',
      type: 'profile_refinement',
      title: text('Complete your AI profile refinement', 'Completa il perfezionamento AI del profilo'),
      description: text(
        'This verifies your skills and fills any profile gaps before the recruiter reviews you again.',
        'Questo step verifica le tue skill e colma eventuali buchi del profilo prima della nuova review recruiter.'
      ),
      status: hasProfileRefinement ? 'completed' : 'pending',
    },
    {
      id: 'step_quiz',
      type: 'quiz',
      title: text(`${job.title} role questionnaire`, `Questionario di ruolo ${job.title}`),
      description: text(
        job.technical_test?.questions?.length
          ? `A ${questionCount}-question multiple-choice questionnaire generated from this job posting to validate the required tools, qualifications, and role-specific competencies.`
          : 'This role-specific questionnaire will appear here as soon as the recruiter requests it for you.',
        job.technical_test?.questions?.length
          ? `Un questionario a risposta multipla di ${questionCount} domande generato dal job posting per validare strumenti, qualifiche e competenze richieste dal ruolo.`
          : 'Questo questionario specifico sul ruolo apparirà qui non appena il recruiter lo richiederà per te.'
      ),
      status: hasQuizResult ? 'completed' : 'pending',
    },
  ];
};

const JobEvaluationHub: React.FC<JobEvaluationHubProps> = ({
  job,
  onBack,
  candidate,
  onUpdateCandidate,
  onOpenProfileRefine,
}) => {
  const { text } = useLanguage();
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const quizAvailable = Boolean(job.technical_test?.questions?.length);
  const steps = useMemo(() => buildEvaluationSteps(candidate, job, text), [candidate, job, text]);

  const activeStep = steps.find((step) => step.id === activeStepId) || null;
  const allCompleted = useMemo(() => steps.every((step) => step.status === 'completed'), [steps]);

  const handleQuizSubmit = async (result: TestResult) => {
    const filteredResults = (candidate.test_results || []).filter((entry) => entry.job_id !== job.id);
    const updatedCandidate: CandidateProfile = {
      ...candidate,
      test_results: [...filteredResults, result],
    };

    // Optimistic update: mark quiz as done locally before DB write,
    // so partial-answer submits (e.g. leaving early) never show the quiz as pending again.
    onUpdateCandidate(updatedCandidate);
    setActiveStepId(null);

    try {
      await addCandidate(updatedCandidate);
      await markCandidateAssessmentCompleted(updatedCandidate, job.id);
    } catch (error) {
      console.error('Failed to persist quiz result:', error);
    }
  };

  if (activeStep?.type === 'quiz') {
    return (
      <div className="h-full animate-fade-in">
        <QuizTest
          title={activeStep.title}
          jobId={job.id}
          questions={job.technical_test?.questions || []}
          onComplete={handleQuizSubmit}
          onBack={() => setActiveStepId(null)}
          timeLimitSeconds={job.technical_test?.time_limit_seconds}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-in px-3 pb-20 pt-2.5 sm:px-8 lg:px-10">
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {text('Back', 'Indietro')}
      </button>
      <AiBanner context="seeker" />
      <div className="mb-6 border-b border-slate-200 pb-4 dark:border-slate-800 sm:mb-8 sm:pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
            {text('Candidate evaluation flow', 'Flusso di valutazione candidato')}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            {job.title}
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {text(
              'Complete the requested steps so the recruiter can review your final role-specific fit.',
              'Completa gli step richiesti così il recruiter potrà rivedere il tuo fit finale per questo ruolo.'
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {steps.map((step, index) => {
            const isProfileStep = step.type === 'profile_refinement';
            const isLockedQuiz = step.type === 'quiz' && (!candidate.ai_refined || !quizAvailable);
            const isCompleted = step.status === 'completed';

            return (
              <section
                key={step.id}
                className={`rounded-[26px] border p-6 transition-all ${
                  isCompleted
                    ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                    : 'border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950'
                }`}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-2xl">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                        {text('Step', 'Step')} {index + 1}
                      </span>
                      <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : isLockedQuiz
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {isCompleted
                          ? text('Completed', 'Completato')
                          : isLockedQuiz
                            ? (!quizAvailable
                                ? text('Waiting for recruiter request', 'In attesa della richiesta recruiter')
                                : text('Unlock after AI refinement', 'Si sblocca dopo il perfezionamento AI'))
                            : text('Ready', 'Pronto')}
                      </span>
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                      {step.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                      {step.description}
                    </p>
                  </div>

                  {isProfileStep ? (
                    <button
                      onClick={onOpenProfileRefine}
                      disabled={isCompleted}
                      className={`inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition-colors ${
                        isCompleted
                          ? 'cursor-not-allowed border border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
                      }`}
                    >
                      {isCompleted
                        ? text('AI profile complete', 'Profilo AI completo')
                        : text('Open AI refinement', 'Apri perfezionamento AI')}
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveStepId(step.id)}
                      disabled={isCompleted || isLockedQuiz}
                      className={`inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition-colors ${
                        isCompleted
                          ? 'cursor-not-allowed border border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : isLockedQuiz
                            ? 'cursor-not-allowed border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300'
                            : 'bg-orange-500 text-white hover:bg-orange-600'
                      }`}
                    >
                      {isCompleted
                        ? text('Questionnaire completed', 'Questionario completato')
                        : text('Start questionnaire', 'Avvia questionario')}
                    </button>
                  )}
                </div>
              </section>
            );
          })}

          {allCompleted && (
            <div className="rounded-[26px] border border-emerald-200 bg-emerald-50/80 p-6 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <h3 className="text-2xl font-semibold tracking-tight text-emerald-800 dark:text-emerald-300">
                {text('Everything is complete', 'Hai completato tutto')}
              </h3>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-emerald-700 dark:text-emerald-400">
                {text(
                  'Your profile now includes both the AI refinement and the role-specific assessment. The recruiter can use this to finalize the shortlist for the next interview stage.',
                  'Il tuo profilo ora include sia il perfezionamento AI sia l’assessment specifico sul ruolo. Il recruiter può usarli per finalizzare la shortlist del prossimo colloquio.'
                )}
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              {text('Role summary', 'Riepilogo ruolo')}
            </p>
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {job.title}
            </h3>
            <p className="mt-1 text-sm font-medium text-orange-600 dark:text-orange-300">
              {job.company_name || text('Confidential company', 'Azienda riservata')}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {job.summary_text}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default JobEvaluationHub;
