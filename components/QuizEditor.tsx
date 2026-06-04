import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CandidateProfile, JobProfile, QuizQuestion, TechnicalTest } from '../types';
import { generateTechnicalTestForJob, regenerateSingleQuestion } from '../services/geminiService';
import { saveJobTechnicalTest, getApplicantsForJob, requestCandidateAssessment } from '../services/dbService';
import { formatCandidateName } from '../utils/nameFormat';
import { AiBanner } from './common';
import { useLanguage } from './LanguageProvider';
import { toast } from 'sonner';

interface QuizEditorProps {
  job: JobProfile;
  pendingCandidate?: CandidateProfile | null;
  onBack: () => void;
  onSaved: (updatedJob: JobProfile) => void;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];
const QUESTION_COUNT_OPTIONS = [10, 20, 30] as const;

const difficultyLabel = (d: number | undefined, lang: 'it' | 'en') => {
  const levels = lang === 'it'
    ? ['', 'Base', 'Base', 'Intermedio', 'Avanzato', 'Avanzato']
    : ['', 'Basic', 'Basic', 'Intermediate', 'Advanced', 'Advanced'];
  return levels[d ?? 3] ?? (lang === 'it' ? 'Intermedio' : 'Intermediate');
};

const difficultyColor = (d: number | undefined) => {
  if (!d || d <= 2) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (d === 3) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
};

const emptyAddForm = () => ({
  text_it: '',
  text_en: '',
  options_it: ['', '', '', ''] as [string, string, string, string],
  options_en: ['', '', '', ''] as [string, string, string, string],
  correct_option_index: 0,
  difficulty: 3,
});

const GenerationProgressCard: React.FC<{
  progress: number;
  currentMessage: string;
  helperText: string;
  estimatedLabel: string;
}> = ({ progress, currentMessage, helperText, estimatedLabel }) => (
  <div className="rounded-[26px] border border-orange-200/70 bg-gradient-to-br from-white to-orange-50/70 p-6 shadow-sm dark:border-orange-900/50 dark:from-slate-900 dark:to-orange-950/20 sm:p-7">
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-4 border-orange-100 bg-white text-orange-500 dark:border-orange-900/50 dark:bg-slate-950">
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-orange-500 animate-spin" />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-orange-500">{estimatedLabel}</p>
          <p className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">{currentMessage}</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">{helperText}</p>
        </div>
      </div>
      <div className="self-start rounded-full bg-white px-4 py-2 text-lg font-black text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-800">
        {progress}%
      </div>
    </div>

    <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
      <div
        className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700 ease-out"
        style={{ width: `${Math.max(8, progress)}%` }}
      />
    </div>
  </div>
);

const QuizEditor: React.FC<QuizEditorProps> = ({ job, pendingCandidate = null, onBack, onSaved }) => {
  const { text, language } = useLanguage();
  const [questions, setQuestions] = useState<QuizQuestion[]>(
    job.technical_test?.questions ?? []
  );
  const [desiredQuestionCount, setDesiredQuestionCount] = useState<number>(
    job.technical_test?.questions?.length || 20
  );
  const [totalMinutes, setTotalMinutes] = useState<number>(
    job.technical_test?.time_limit_seconds
      ? Math.round(job.technical_test.time_limit_seconds / 60)
      : job.technical_test?.questions?.length || 20
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm());
  const [previewLang, setPreviewLang] = useState<'it' | 'en'>('it');
  const [completedCount, setCompletedCount] = useState(0);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const isAiBusy = isGenerating || regeneratingIndex !== null || isSaving;

  const generationMessages = useMemo(() => ([
    text('Reading the job requirements…', 'Lettura dei requisiti del ruolo…'),
    text('Building the question structure…', 'Costruzione della struttura delle domande…'),
    text('Writing role-specific questions…', 'Scrittura delle domande specifiche sul ruolo…'),
    text('Checking consistency and answer quality…', 'Controllo coerenza e qualità delle risposte…'),
  ]), [text]);

  useEffect(() => {
    if (!isGenerating) {
      setGenerationProgress(0);
      setGenerationElapsed(0);
      return;
    }

    const progressTimer = window.setInterval(() => {
      setGenerationProgress((current) => {
        if (current >= 93) return current;
        if (current < 24) return Math.min(93, current + 8);
        if (current < 52) return Math.min(93, current + 5);
        if (current < 76) return Math.min(93, current + 3);
        return Math.min(93, current + 1);
      });
    }, 1100);

    const elapsedTimer = window.setInterval(() => {
      setGenerationElapsed((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(progressTimer);
      window.clearInterval(elapsedTimer);
    };
  }, [isGenerating]);

  const generationMessageIndex = Math.min(
    generationMessages.length - 1,
    Math.floor(generationElapsed / 6)
  );

  const generationHelperText = generationElapsed < 20
    ? text(
        'The AI is generating the questionnaire from the job description and required skills.',
        'L’AI sta generando il questionario a partire dalla descrizione del ruolo e dalle skill richieste.'
      )
    : generationElapsed < 60
      ? text(
          'This step can take a little while depending on the complexity of the role and current AI load.',
          'Questo passaggio puo richiedere un po’ di tempo in base alla complessità del ruolo e al carico attuale dell’AI.'
        )
      : text(
          'This process can also take a few minutes. We are still working and the page will update automatically as soon as the questionnaire is ready.',
          'Questo processo può richiedere anche alcuni minuti. Stiamo ancora lavorando e la pagina si aggiornerà automaticamente non appena il questionario sarà pronto.'
        );

  useEffect(() => {
    getApplicantsForJob(job.id, job.applicant_emails || [])
      .then(applicants => {
        setCompletedCount(applicants.filter(a => a.status === 'assessment_completed').length);
      })
      .catch(() => {});
  }, [job.id]);

  // Auto-generate on first open when no quiz exists yet

  const withCompletionGuard = useCallback((action: () => void) => {
    if (completedCount > 0) {
      setPendingAction(() => action);
    } else {
      action();
    }
  }, [completedCount]);

  const qText = (q: QuizQuestion) =>
    previewLang === 'en' ? (q.text_en || q.text_it || q.text) : (q.text_it || q.text);
  const qOptions = (q: QuizQuestion) =>
    previewLang === 'en'
      ? (q.options_en?.length ? q.options_en : q.options_it ?? q.options)
      : (q.options_it ?? q.options);

  const doGenerate = async () => {
    if (isAiBusy) return;
    setIsGenerating(true);
    setGenerationProgress(8);
    setGenerationElapsed(0);
    setError(null);
    try {
      setTotalMinutes(desiredQuestionCount);
      const test = await generateTechnicalTestForJob(job, desiredQuestionCount);
      setGenerationProgress(100);
      setQuestions(test.questions);
      setTotalMinutes(Math.round(test.time_limit_seconds / 60));
      setHasChanges(true);
    } catch (e: any) {
      setError(e.message || text('Generation failed.', 'Generazione fallita.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const doRegenerate = async (index: number) => {
    if (isAiBusy) return;
    setRegeneratingIndex(index);
    setError(null);
    try {
      const newQ = await regenerateSingleQuestion(job, questions, index);
      const updated = questions.map((q, i) => (i === index ? newQ : q));
      setQuestions(updated);
      setHasChanges(true);
    } catch (e: any) {
      setError(e.message || text('Regeneration failed.', 'Rigenerazione fallita.'));
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const doDelete = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleGenerate = () => {
    if (isAiBusy) return;
    withCompletionGuard(doGenerate);
  };
  const handleRegenerate = (index: number) => {
    if (isAiBusy) return;
    withCompletionGuard(() => doRegenerate(index));
  };
  const handleDelete = (index: number) => withCompletionGuard(() => doDelete(index));

  const handleAddManual = () => {
    const { text_it, options_it } = addForm;
    if (!text_it.trim() || options_it.some(o => !o.trim())) {
      setError(text('Fill in the question and all 4 options.', 'Compila la domanda e tutte e 4 le opzioni.'));
      return;
    }
    withCompletionGuard(doAddManual);
  };

  const doAddManual = () => {
    const { text_it, text_en, options_it, options_en, correct_option_index, difficulty } = addForm;
    const newQ: QuizQuestion = {
      id: `manual_${job.id}_${Date.now()}`,
      text: text_it,
      options: options_it,
      text_it,
      options_it,
      text_en: text_en || text_it,
      options_en: options_en.some(o => o.trim()) ? options_en : options_it,
      correct_option_index,
      difficulty,
    };
    setQuestions([...questions, newQ]);
    setHasChanges(true);
    setShowAddForm(false);
    setAddForm(emptyAddForm());
    setError(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const generatedAt = new Date().toISOString();
      const test: TechnicalTest = {
        questions,
        generated_at: generatedAt,
        generated_from_job_title: job.title,
        time_limit_seconds: totalMinutes * 60,
      };
      const savedJob = { ...job, technical_test: test, requires_quiz: true };
      await saveJobTechnicalTest(job, test);

      if (pendingCandidate) {
        try {
          const { emailDeliveryError } = await requestCandidateAssessment(savedJob, pendingCandidate);
          toast.success(
            language === 'it'
              ? 'Questionario salvato e richiesta inviata al candidato.'
              : 'Questionnaire saved and request sent to the candidate.'
          );
          if (emailDeliveryError) {
            toast.warning(
              language === 'it'
                ? `Richiesta salvata, ma email non inviata: ${emailDeliveryError}`
                : `Request saved, but email was not delivered: ${emailDeliveryError}`
            );
          }
        } catch {
          toast.error(
            language === 'it'
              ? 'Questionario salvato, ma invio al candidato fallito.'
              : 'Questionnaire saved, but failed to send to the candidate.'
          );
        }
      }

      onSaved(savedJob);
      setHasChanges(false);
    } catch (e: any) {
      setError(e.message || text('Save failed.', 'Salvataggio fallito.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pt-2.5 px-3 sm:px-8 pb-24">
      {/* Header */}
      <button
        onClick={onBack}
        className="mb-4 text-sm text-slate-600 hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400 transition-colors flex items-center gap-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {text('Back', 'Indietro')}
      </button>

      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 sm:text-2xl">{job.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {text('Technical questionnaire', 'Questionario tecnico')}
            {questions.length > 0 && (
              <span className="ml-2 text-orange-600 font-semibold">· {questions.length} {text('questions', 'domande')}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Language preview toggle */}
          {questions.length > 0 && (
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 text-xs font-semibold">
              <button
                onClick={() => setPreviewLang('it')}
                className={`px-3 py-1.5 rounded-md transition-all ${previewLang === 'it' ? 'bg-white dark:bg-slate-700 shadow text-orange-600' : 'text-slate-500'}`}
              >IT</button>
              <button
                onClick={() => setPreviewLang('en')}
                className={`px-3 py-1.5 rounded-md transition-all ${previewLang === 'en' ? 'bg-white dark:bg-slate-700 shadow text-orange-600' : 'text-slate-500'}`}
              >EN</button>
            </div>
          )}
          {questions.length > 0 && !isGenerating && (
            <button
              onClick={handleGenerate}
              disabled={isAiBusy}
              title={text('Regenerate all questions with AI', 'Rigenera tutte le domande con AI')}
              className="flex items-center gap-2 py-2 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-orange-600 hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {text('Regenerate all', 'Rigenera tutte')}
            </button>
          )}
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-2 px-5 rounded-xl shadow hover:shadow-md transition-all disabled:opacity-50 text-sm"
            >
              {isSaving ? text('Saving...', 'Salvataggio...') : text('Save changes', 'Salva modifiche')}
            </button>
          )}
        </div>
      </div>

      {/* Time limit setting */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/40">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {text('Total test time', 'Tempo totale del test')}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={300}
            value={totalMinutes}
            onChange={(e) => {
              setTotalMinutes(Math.max(1, parseInt(e.target.value) || 1));
              setHasChanges(true);
            }}
            className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-sm font-semibold text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <span className="text-sm text-slate-500 dark:text-slate-400">{text('minutes', 'minuti')}</span>
        </div>
        {questions.length > 0 && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            — {text(
              `${Math.round((totalMinutes * 60) / questions.length)} sec per question`,
              `${Math.round((totalMinutes * 60) / questions.length)} sec a domanda`
            )}
          </span>
        )}
      </div>

      {/* Completion warning modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-800 shadow-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                  {text('Modify questionnaire?', 'Modificare il questionario?')}
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {language === 'it'
                    ? `${completedCount} ${completedCount === 1 ? 'candidato ha' : 'candidati hanno'} già completato questo questionario. Modificarlo ora potrebbe creare un vantaggio ingiusto per i candidati che lo riceveranno in futuro, rendendo i risultati non comparabili.`
                    : `${completedCount} candidate${completedCount === 1 ? ' has' : 's have'} already completed this questionnaire. Modifying it now may create an unfair advantage for future candidates, making results incomparable.`
                  }
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  const action = pendingAction;
                  setPendingAction(null);
                  action();
                }}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-xl text-sm transition-all"
              >
                {text('Proceed anyway', 'Procedi comunque')}
              </button>
              <button
                onClick={() => setPendingAction(null)}
                className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold py-2.5 rounded-xl text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                {text('Cancel', 'Annulla')}
              </button>
            </div>
          </div>
        </div>
      )}

      <AiBanner context="quiz" />

      {pendingCandidate && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 text-orange-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
          </svg>
          <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">
            {language === 'it'
              ? `Questo lavoro non aveva ancora un questionario. Una volta salvato, verrà inviato automaticamente a ${formatCandidateName(pendingCandidate) || 'il candidato'}.`
              : `This job had no questionnaire yet. Once saved, it will be automatically sent to ${formatCandidateName(pendingCandidate) || 'the candidate'}.`}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Empty state */}
      {questions.length === 0 && !isGenerating && (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <p className="text-slate-500 dark:text-slate-400 mb-4 text-base">
            {text('No questionnaire yet for this job posting.', 'Nessun questionario ancora per questo job posting.')}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xl mx-auto">
            {text(
              'Choose the number of questions to generate before creating the technical assessment.',
              'Scegli il numero di domande da generare prima di creare la valutazione tecnica.'
            )}
          </p>
          <div className="mb-6 grid grid-cols-3 gap-3 max-w-md mx-auto">
            {QUESTION_COUNT_OPTIONS.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setDesiredQuestionCount(count)}
                disabled={isAiBusy}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${desiredQuestionCount === count
                  ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-orange-500 dark:hover:bg-slate-800'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {count}
                <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">{text('questions', 'domande')}</span>
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerate}
            disabled={isAiBusy}
            className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 px-8 rounded-xl shadow-md hover:shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {text('Generate questionnaire with AI', 'Genera questionario con AI')}
          </button>
        </div>
      )}

      {isGenerating && (
        <div className="py-8">
          <GenerationProgressCard
            progress={generationProgress}
            currentMessage={generationMessages[generationMessageIndex]}
            helperText={generationHelperText}
            estimatedLabel={text('Estimated progress', 'Avanzamento stimato')}
          />
        </div>
      )}

      {/* Question list */}
      {questions.length > 0 && (
        <div className="space-y-4">
          {questions.map((q, index) => (
            <div
              key={q.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {text('Q', 'D')}{index + 1}
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${difficultyColor(q.difficulty)}`}>
                    {difficultyLabel(q.difficulty, language as 'it' | 'en')}
                  </span>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleRegenerate(index)}
                    disabled={isAiBusy}
                    title={text('Regenerate with AI', 'Rigenera con AI')}
                    className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-all disabled:opacity-40"
                  >
                    {regeneratingIndex === index ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(index)}
                    disabled={isAiBusy}
                    title={text('Delete', 'Elimina')}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3 leading-snug">
                {qText(q)}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {qOptions(q).map((opt, oi) => (
                  <div
                    key={oi}
                    className={`flex items-start gap-2.5 text-sm px-3 py-2 rounded-xl border ${
                      oi === q.correct_option_index
                        ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-semibold'
                        : 'border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span className={`flex-shrink-0 font-black text-xs mt-0.5 ${oi === q.correct_option_index ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                      {OPTION_LABELS[oi]}
                    </span>
                    <span>{opt}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Add question button */}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full py-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-semibold text-slate-500 hover:text-orange-600 hover:border-orange-300 dark:hover:border-orange-700 transition-all"
            >
              + {text('Add question manually', 'Aggiungi domanda manualmente')}
            </button>
          )}
        </div>
      )}

      {/* Manual add form */}
      {showAddForm && (
        <div className="mt-4 bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-800 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4 text-base">
            {text('New question', 'Nuova domanda')}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                {text('Question (Italian)', 'Domanda (Italiano)')} *
              </label>
              <textarea
                rows={2}
                value={addForm.text_it}
                onChange={e => setAddForm({ ...addForm, text_it: e.target.value })}
                className="w-full p-3 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-orange-400 outline-none dark:bg-slate-800 dark:text-white resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                {text('Question (English)', 'Domanda (Inglese)')}
              </label>
              <textarea
                rows={2}
                value={addForm.text_en}
                onChange={e => setAddForm({ ...addForm, text_en: e.target.value })}
                placeholder={text('Leave empty to use Italian', 'Lascia vuoto per usare l\'italiano')}
                className="w-full p-3 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-orange-400 outline-none dark:bg-slate-800 dark:text-white resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                {text('Options (Italian) — select the correct one', 'Opzioni (Italiano) — seleziona la corretta')} *
              </label>
              <div className="space-y-2">
                {OPTION_LABELS.map((label, oi) => (
                  <div key={oi} className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="correct"
                      checked={addForm.correct_option_index === oi}
                      onChange={() => setAddForm({ ...addForm, correct_option_index: oi })}
                      className="accent-orange-500 flex-shrink-0"
                    />
                    <span className="text-xs font-black text-slate-400 w-4">{label}</span>
                    <input
                      type="text"
                      value={addForm.options_it[oi]}
                      onChange={e => {
                        const opts = [...addForm.options_it] as [string, string, string, string];
                        opts[oi] = e.target.value;
                        setAddForm({ ...addForm, options_it: opts });
                      }}
                      className="flex-1 p-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-orange-400 outline-none dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                {text('Options (English)', 'Opzioni (Inglese)')}
              </label>
              <div className="space-y-2">
                {OPTION_LABELS.map((label, oi) => (
                  <div key={oi} className="flex items-center gap-3">
                    <span className="text-xs font-black text-slate-400 w-4 ml-5">{label}</span>
                    <input
                      type="text"
                      value={addForm.options_en[oi]}
                      placeholder={addForm.options_it[oi] || ''}
                      onChange={e => {
                        const opts = [...addForm.options_en] as [string, string, string, string];
                        opts[oi] = e.target.value;
                        setAddForm({ ...addForm, options_en: opts });
                      }}
                      className="flex-1 p-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-orange-400 outline-none dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                {text('Difficulty', 'Difficoltà')}
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(d => (
                  <button
                    key={d}
                    onClick={() => setAddForm({ ...addForm, difficulty: d })}
                    className={`w-10 h-10 rounded-xl text-sm font-bold border transition-all ${
                      addForm.difficulty === d
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-orange-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddManual}
                className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-2.5 rounded-xl text-sm hover:shadow-md transition-all"
              >
                {text('Add question', 'Aggiungi domanda')}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setAddForm(emptyAddForm()); setError(null); }}
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                {text('Cancel', 'Annulla')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default QuizEditor;
