import React, { useEffect, useState } from 'react';
import { JobProfile, CandidateProfile } from '../types';
import { AiBanner, Spinner } from './common';
import { useLanguage } from './LanguageProvider';
import { toast } from 'sonner';
import CompanyLogo from './CompanyLogo';
import { hasCurrentQuizResult, isJobQuizEnabled } from '../utils/questionnaire';

interface JobDetailsPageProps {
  job: JobProfile;
  candidate?: CandidateProfile | null;
  viewerRole?: 'seeker' | 'recruiter';
  hasAssessmentRequest?: boolean;
  onBack: () => void;
  onApply: (updatedJob: JobProfile) => void | Promise<void>;
  onUnapply: (updatedJob: JobProfile) => void | Promise<void>;
  applicantCount?: number;
  onOpenEvaluation?: () => void;
  onOpenProfileRefine?: () => void;
}

const formatMoney = (value?: number) => (typeof value === 'number' ? `EUR ${value.toLocaleString()}` : '—');

const JobDetailsPage: React.FC<JobDetailsPageProps> = ({
  job,
  candidate,
  viewerRole = 'seeker',
  hasAssessmentRequest = false,
  onBack,
  onApply,
  onUnapply,
  applicantCount,
  onOpenEvaluation,
}) => {
  const { text } = useLanguage();
  const [isApplying, setIsApplying] = useState(false);
  const [isUnapplying, setIsUnapplying] = useState(false);
  const [showUnapplyConfirm, setShowUnapplyConfirm] = useState(false);
  const isRecruiterView = viewerRole === 'recruiter';
  const quizEnabled = isJobQuizEnabled(job);
  const isExcludedByRecruiter = !isRecruiterView && !!candidate &&
    job.candidate_interest_reviews?.[candidate.id]?.decision === 'not_interested';
  const isAlreadyApplicant =
    !isRecruiterView &&
    !!candidate &&
    !!job.applicant_emails?.some((e) => e.toLowerCase().trim() === candidate.contacts.email.toLowerCase().trim());
  const [hasApplied, setHasApplied] = useState(isAlreadyApplicant);
  const hasCompletedAssessment = Boolean(candidate && hasCurrentQuizResult(candidate, job));
  const displayedApplicantCount = applicantCount ?? (job.applicant_emails?.length || 0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);

    return () => window.cancelAnimationFrame(frame);
  }, [job.id]);

  useEffect(() => {
    setHasApplied(isAlreadyApplicant);
  }, [isAlreadyApplicant, job.id]);

  const handleApplyAction = async () => {
    if (isRecruiterView) return;

    setIsApplying(true);
    try {
      await onApply(job);
      setHasApplied(true);
    } catch (e) {
      console.error('Application failed:', e);
      toast.error(text('Failed to register interest. Please try again.', 'Impossibile mostrare interesse. Riprova.'));
    } finally {
      setIsApplying(false);
    }
  };

  const handleUnapplyAction = async () => {
    if (isRecruiterView) return;

    setIsUnapplying(true);
    try {
      await onUnapply(job);
      setHasApplied(false);
    } catch (e) {
      console.error('Unapply failed:', e);
      toast.error(text('Failed to remove interest. Please try again.', 'Impossibile rimuovere l’interesse. Riprova.'));
    } finally {
      setIsUnapplying(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-7xl mx-auto pt-2.5 px-3 sm:px-8 lg:px-10 pb-20">
      <button
        onClick={onBack}
        className="mb-4 text-sm text-slate-500 hover:text-orange-600 dark:text-slate-400 transition-colors flex items-center gap-2 group"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 transform transition-transform"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {text('Back', 'Indietro')}
      </button>
      {!isRecruiterView && <AiBanner context="seeker" />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-6">
          <header>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg">
                {(Array.isArray(job.industry) ? job.industry : [job.industry]).join(', ')}
              </span>
              <span className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg">
                {job.seniority_level}
              </span>
            </div>
            <div className="flex items-start gap-4">
              <CompanyLogo
                logoUrl={job.company_logo_url}
                companyName={job.company_name}
                size="lg"
                className="shrink-0"
                fullBleed
              />
              <div className="min-w-0">
                <h1 className="mb-2 text-3xl font-black leading-tight text-slate-900 sm:text-4xl dark:text-slate-100">
                  {job.title}
                </h1>
                <p className="text-lg font-bold text-orange-600 sm:text-xl dark:text-orange-400">
                  {job.company_name || text('Confidential Employer', 'Azienda riservata')}
                </p>
              </div>
            </div>
          </header>

          <section>
            <h3 className="mb-3 text-lg font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {text('Summary', 'Sintesi')}
            </h3>
            <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-400 leading-relaxed">
              {job.summary_text}
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-6">
              {text('About the Role', 'Sul ruolo')}
            </h2>
            <div className="text-slate-600 dark:text-slate-400 leading-relaxed space-y-4 whitespace-pre-wrap">
              {job.full_job_posting_description ||
                text(
                  'Detailed job description is being updated. Contact the recruiter for more information.',
                  'La job description dettagliata è in aggiornamento. Contatta il recruiter per maggiori informazioni.'
                )}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-6">
              {text('Requirements & Technical Skills', 'Requisiti e competenze tecniche')}
            </h2>

            <div className="space-y-8">
              {job.skills?.length > 0 && (
                <div>
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
                    {text('Technical Core', 'Competenze tecniche')}
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {job.skills.map((s, i) => (
                      <div
                        key={i}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${s.must ? 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-400' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'}`}
                      >
                        {s.skill_name}
                        {s.must && (
                          <span className="ml-2 text-[10px] opacity-70 underline">{text('Must', 'Obbligatoria')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {job.it_skills?.length > 0 && (
                <div>
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
                    {text('Software & Tools', 'Software e strumenti')}
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {job.it_skills.map((s, i) => (
                      <div
                        key={i}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border ${s.must ? 'bg-indigo-50 border-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-400' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'}`}
                      >
                        {s.skill_name}
                        {s.must && (
                          <span className="ml-2 text-[10px] opacity-70 underline">{text('Must', 'Obbligatoria')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="sticky top-24 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <h3 className="font-black text-xl text-slate-800 dark:text-slate-100 mb-6">
              {isRecruiterView
                ? text('Job Overview', 'Panoramica job')
                : text('Opportunity Details', 'Dettagli opportunità')}
            </h3>

            <div className="space-y-6 mb-10">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {text('Location', 'Località')}
                  </p>
                  <p className="font-bold text-slate-700 dark:text-slate-300">
                    {job.constraints.location.city}, {job.constraints.location.country}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {text('Work Policy', 'Modalità di lavoro')}
                  </p>
                  <p className="font-bold text-slate-700 dark:text-slate-300 capitalize">
                    {job.constraints.remote.replace('_', ' ')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {text('Contract', 'Contratto')}
                  </p>
                  <p className="font-bold text-slate-700 dark:text-slate-300 capitalize">
                    {job.constraints.contract_type.replace('_', ' ')}
                  </p>
                </div>
              </div>

              {(typeof job.constraints.salary_eur?.min === 'number' ||
                typeof job.constraints.salary_eur?.max === 'number') && (
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 1 1-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {text('Est. Salary Range', 'Range salariale')}
                    </p>
                    <p className="font-bold text-slate-700 dark:text-slate-300">
                      {formatMoney(job.constraints.salary_eur.min)} - {formatMoney(job.constraints.salary_eur.max)}
                    </p>
                  </div>
                </div>
              )}

              {isRecruiterView && (
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5V4H2v16h5m10 0v-2a3 3 0 00-3-3H10a3 3 0 00-3 3v2m10 0H7m5-12a3 3 0 110 6 3 3 0 010-6z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {text('Applicants', 'Candidati')}
                    </p>
                    <p className="font-bold text-slate-700 dark:text-slate-300">
                      {displayedApplicantCount} {text(
                        displayedApplicantCount === 1 ? 'applicant' : 'applicants',
                        displayedApplicantCount === 1 ? 'candidato' : 'candidati'
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {!isRecruiterView && (
              <>
                {isExcludedByRecruiter ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 dark:border-rose-900/50 dark:bg-rose-950/20">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400">
                      {text('Application status', 'Stato candidatura')}
                    </p>
                    <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                      {text('Not selected', 'Non selezionato')}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-rose-600/80 dark:text-rose-400/80">
                      {text(
                        'The recruiter has reviewed your profile and decided not to proceed with your application for this position.',
                        'Il recruiter ha esaminato il tuo profilo e ha deciso di non procedere con la tua candidatura per questa posizione.'
                      )}
                    </p>
                  </div>
                ) : (
                  <>
                {showUnapplyConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="mx-4 w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-950">
                      <h3 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                        {text('Are you sure?', 'Sei sicuro?')}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                        {text(
                          'You will be removed from the interest list for this position. You can re-apply at any time.',
                          'Verrai rimosso dalla lista degli interessati a questa posizione. Potrai ripresentarti in qualsiasi momento.'
                        )}
                      </p>
                      <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
                        <button
                          type="button"
                          onClick={() => {
                            setShowUnapplyConfirm(false);
                            handleUnapplyAction();
                          }}
                          className="inline-flex items-center justify-center rounded-2xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
                        >
                          {text('Yes, remove me', 'Sì, rimuovimi')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowUnapplyConfirm(false)}
                          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {text('Cancel', 'Annulla')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <button
                  onClick={hasApplied ? () => setShowUnapplyConfirm(true) : handleApplyAction}
                  disabled={isApplying || isUnapplying}
                  className={`w-full font-black py-4 px-6 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 group ${
                    hasApplied
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300'
                      : 'bg-orange-500 text-white hover:bg-orange-600 hover:shadow-orange-500/30'
                  }`}
                >
                  {isApplying || isUnapplying ? (
                    <Spinner />
                  ) : hasApplied ? (
                    <>
                      {text('No Longer Interested', 'Non sei più interessato')}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 transform transition-transform"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </>
                  ) : (
                    <>
                      {text('Manifest Interest', 'Mostra interesse')}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 transform transition-transform"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </svg>
                    </>
                  )}
                </button>
                {hasApplied && quizEnabled && hasCompletedAssessment ? (
                  <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/80 px-5 py-4 text-sky-800 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-200">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-widest opacity-80">
                      {text('Next step', 'Prossimo step')}
                    </p>
                    <p className="text-sm font-medium leading-relaxed">
                      {text(
                        'You have already completed the questionnaire associated with this job.',
                        'Hai già completato il questionario associato a questo lavoro.'
                      )}
                    </p>
                    {onOpenEvaluation ? (
                      <button
                        type="button"
                        onClick={onOpenEvaluation}
                        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition-colors hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                      >
                        {text('Review questionnaire', 'Rivedi questionario')}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                  </>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default JobDetailsPage;
