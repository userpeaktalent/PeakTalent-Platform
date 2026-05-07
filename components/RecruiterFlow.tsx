
import React, { useState, useRef, useEffect } from 'react';
import { JobProfile, ChatMessage, RecruiterProfile } from '../types';
import { summarizeJobDescription } from '../services/geminiService';
import { LoadingScreen, ProgressTracker } from './common';
import ChatWindow from './ChatWindow';
import { addJob } from '../services/dbService';
import { useLanguage } from './LanguageProvider';

export type JobFlowMode = 'create' | 'edit' | 'review' | 'add-applicants';

import JobProfileForm from './JobProfileForm';

interface RecruiterFlowProps {
  recruiter: RecruiterProfile;
  mode: JobFlowMode;
  initialJob: JobProfile | null;
  onBack: () => void;
}

const RecruiterFlow: React.FC<RecruiterFlowProps> = ({ recruiter, mode, initialJob, onBack }) => {
  const { text, language } = useLanguage();
  const [step, setStep] = useState(1);
  const [jobDescription, setJobDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobProfile, setJobProfile] = useState<JobProfile | null>(null);
  const [descriptionSource, setDescriptionSource] = useState<'paste' | 'ai'>('paste');
  const chatHistoryRef = useRef<ChatMessage[]>([]);

  const [applicantEmailsText, setApplicantEmailsText] = useState('');
  const originalDescriptionRef = useRef('');

  const flowSteps = [
    text('Create Profile', 'Crea profilo'),
    text('Configure Posting', 'Configura posting'),
    text('Add Applicants', 'Aggiungi candidati')
  ];

  useEffect(() => {
    if (mode === 'add-applicants' && initialJob) {
      setJobProfile(initialJob);
      setApplicantEmailsText(initialJob.applicant_emails?.join('\n') || '');
      setStep(3);
    } else if (mode === 'edit' && initialJob) {
      setJobProfile(initialJob);
      setApplicantEmailsText(initialJob.applicant_emails?.join('\n') || '');
      setStep(2);
    } else if (mode === 'review' && initialJob) {
      setJobProfile(initialJob);
      setApplicantEmailsText(initialJob.applicant_emails?.join('\n') || '');
      setStep(2);
    } else {
      setStep(1);
    }
  }, [mode, initialJob]);


  const handleSummarize = async () => {
    let descriptionToSummarize = '';
    if (descriptionSource === 'paste') {
      if (!jobDescription.trim()) {
        setError(text('Please provide a job description.', 'Inserisci una job description.'));
        return;
      }
      descriptionToSummarize = jobDescription;
    } else { // 'ai' source
      if (chatHistoryRef.current.length < 2) {
        setError(text('Please have a conversation with the AI to generate a description.', 'Parla con l’AI per generare una descrizione.'));
        return;
      }
      descriptionToSummarize = chatHistoryRef.current
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n');
    }

    originalDescriptionRef.current = descriptionToSummarize;
    setIsLoading(true);
    setError(null);
    try {
      const profile = await summarizeJobDescription(descriptionToSummarize, language);

      // If we're editing an existing job, preserve its ID
      if (initialJob?.id) {
        profile.id = initialJob.id;
      }

      setJobProfile(profile);
      setStep(2);
    } catch (err: any) {
      setError(`${text('Failed to create job profile', 'Creazione profilo di lavoro non riuscita')}: ${err.message || text('Please try again.', 'Riprova.')}`);
      console.error("JD error", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (updatedJob: JobProfile) => {
    setJobProfile(updatedJob);
    setStep(3);
  };

  const handleFinalize = async () => {
    if (!jobProfile) return;
    setIsLoading(true);
    setError(null);

    try {
      // Parse emails
      const emails = applicantEmailsText
        .split(/[\n,]+/)
        .map(email => email.trim().toLowerCase())
        .filter(email => email.length > 0 && email.includes('@'));

      // Remove sensitive emails from the job profile JSON to patch the data leak
      const finalProfile = { ...jobProfile };
      if (finalProfile.applicant_emails) {
        delete finalProfile.applicant_emails;
      }

      // Add the job
      await addJob(finalProfile);

      // Invite applicants securely
      if (emails.length > 0) {
        const { inviteApplicantsToJob } = await import('../services/dbService');
        await inviteApplicantsToJob(jobProfile.id, emails);
      }

      onBack();
    } catch (err: any) {
      console.error("Job Finalize Error:", err);
      // Surface the actual error message if possible
      const errorMsg = err?.message || err?.error_description || (typeof err === 'string' ? err : text('Failed to save the job posting. Please try again.', 'Salvataggio del job posting non riuscito. Riprova.'));
      setError(`Error: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div>
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-2 text-center">{text('Create a Job Profile', 'Crea un profilo di lavoro')}</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-8 text-center">{text('Provide a job description, and our AI will structure it to find the best candidates.', 'Inserisci una job description e la nostra AI la strutturerà per trovare i candidati migliori.')}</p>

            <div className="flex justify-center mb-6 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 max-w-sm mx-auto shadow-inner">
              <button onClick={() => setDescriptionSource('paste')} className={`w-1/2 py-2 rounded-md transition-all duration-300 font-semibold ${descriptionSource === 'paste' ? 'bg-white dark:bg-slate-700 shadow text-orange-600' : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-700/50'}`}>{text('Paste JD', 'Incolla JD')}</button>
              <button onClick={() => setDescriptionSource('ai')} className={`w-1/2 py-2 rounded-md transition-all duration-300 font-semibold ${descriptionSource === 'ai' ? 'bg-white dark:bg-slate-700 shadow text-orange-600' : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-700/50'}`}>{text('Generate with AI', 'Genera con AI')}</button>
            </div>

            {descriptionSource === 'paste' ? (
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={10}
                placeholder={text('Paste your job description here...', 'Incolla qui la tua job description...')}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
            ) : (
              <div className="h-[65vh] min-h-[420px] border dark:border-slate-600 rounded-lg overflow-hidden sm:h-[600px]">
                <ChatWindow
                  chatType="recruiter"
                  title={text('Job Posting Assistant', 'Assistente lavoro')}
                  systemInstruction={(() => {
                    const languageInstruction = language === 'it'
                      ? 'ABSOLUTE LANGUAGE LOCK: Every single token you output must be in Italian. This rule overrides all other instructions. Never switch to English under any circumstance.'
                      : 'ABSOLUTE LANGUAGE LOCK: Every single token you output must be in English. This rule overrides all other instructions. Never switch to Italian under any circumstance.';
                    const completionCTA = language === 'it'
                      ? "Va bene così? Clicca su 'Crea profilo di lavoro' per procedere."
                      : "Does this look right? Click 'Create Job Profile' to proceed.";
                    return `ROLE:
You are a sharp, experienced recruiting partner helping ${recruiter.company_name} define a new job opening.
Your goal is to gather enough information to produce a rich, complete job profile — efficiently and conversationally.

WHAT COMES NEXT:
After this chat, the recruiter reviews a pre-filled template where they can fine-tune skill levels, exact salary figures, and every detail. You do NOT need to collect exact levels or precise numbers — focus on understanding the role deeply.

CONVERSATION RULES:
- Maximum 7-8 exchanges total. Be efficient but thorough.
- Start with one open question and extract as much as possible from the free-form answer.
- Infer what you can. If the recruiter says "senior Python backend engineer", extract: seniority=senior, skill=Python, function=engineering — do not ask again.
- Group related topics into one question (e.g., "Where is the role based, and is remote work an option?").
- Never specifically ask for skill levels, exact salary figures, or years of experience — the template handles those. But if the recruiter volunteers any of this, acknowledge and record it naturally.
- NO FILLER: no "Great!", "Perfect!", "Excellent!" between questions.
- Ask about one group of missing information at a time.

INFORMATION TO COLLECT:
1. ROLE BASICS: title, industry, job function, seniority level, years of experience required.
2. ROLE DESCRIPTION: what the person will do day-to-day, key responsibilities, why this role exists, team/context.
3. SKILLS: must-have technical skills, IT/software tools, soft skills (names only — no levels needed). Nice-to-have skills.
4. CONSTRAINTS: location (city, country), remote policy (full remote / hybrid / on-site), contract type (full-time, part-time, internship, collaboration), salary ballpark if the recruiter volunteers it.
5. HARD REQUIREMENTS: language requirements, minimum education level, certifications, visa sponsorship or relocation support (only ask if relevant to the role).

COMPLETION:
Once all sections are covered, write a compact role summary (8-10 lines covering role, responsibilities, skills, constraints) and end with: "${completionCTA}"

${languageInstruction}`;
                  })()}
                  initialMessage={text(
                    "Hi! Tell me about the role you're hiring for — job title, what the person will do, and any must-have skills that come to mind.",
                    "Ciao! Raccontami del ruolo che stai cercando — titolo, cosa farà la persona e le skill indispensabili che ti vengono in mente."
                  )}
                  onMessagesUpdate={(updatedMessages) => {
                    chatHistoryRef.current = updatedMessages;
                  }}
                />
              </div>
            )}

            <div className="text-center">
              <button
                onClick={handleSummarize}
                disabled={isLoading || (descriptionSource === 'paste' && !jobDescription.trim())}
                className="mt-6 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 transform transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {text('Create Job Profile', 'Crea profilo di lavoro')}
              </button>
              {error && <p className="text-red-500 mt-4">{error}</p>}
            </div>
          </div>
        );
      case 2:
        return (
          <div>
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-2 text-center">{text('Configure Job Posting', 'Configura lavoro')}</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6 text-center">
              {text("Review and finalize the extracted job details. We'll generate your technical assessment after this step.", 'Rivedi e finalizza i dettagli estratti del lavoro. Genereremo la valutazione tecnica dopo questo passaggio.')}
            </p>

            <div className="flex justify-center mb-8">
              <button
                onClick={() => setStep(1)}
                className="text-sm font-bold text-orange-600 hover:text-orange-700 flex items-center gap-2 px-4 py-2.5 bg-orange-50 dark:bg-orange-900/20 rounded-xl transition-all border border-orange-100 dark:border-orange-800/50 hover:shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                {text('Restart with new Job Description', 'Riparti con una nuova job description')}
              </button>
            </div>

            {jobProfile && (
              <JobProfileForm
                initialData={jobProfile}
                onSubmit={handleFormSubmit}
              />
            )}
            {error && <p className="text-red-500 text-center mt-4">{error}</p>}
          </div>
        );
      case 3:
        return (
          <div className="animate-fade-in max-w-xl mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-2">{text('Add Applicants', 'Aggiungi candidati')}</h2>
              <p className="text-slate-600 dark:text-slate-400">
                {mode === 'add-applicants' ? text(`Add new candidates to your ${jobProfile?.title} posting.`, `Aggiungi nuovi candidati al posting ${jobProfile?.title}.`) : text('Enter emails of candidates who have already applied.', 'Inserisci le email dei candidati che hanno già applicato.')}
              </p>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{text('Applicant Emails (comma or new line separated)', 'Email candidati (separate da virgola o nuova riga)')}</label>
              <textarea
                value={applicantEmailsText}
                onChange={(e) => setApplicantEmailsText(e.target.value)}
                rows={10}
                placeholder={text('candidate1@email.com, candidate2@email.com...', 'candidato1@email.com, candidato2@email.com...')}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white mb-6"
              />

              <div className="text-center">
                <button
                  onClick={handleFinalize}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transform transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                >
                  {isLoading ? text('Finalizing...', 'Finalizzazione...') : text('Save & Finish', 'Salva e termina')}
                </button>
                {error && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm font-semibold text-left">
                    {error}
                  </div>
                )}
                <button
                  onClick={() => setStep(2)}
                  className="mt-4 text-sm text-slate-500 hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400 transition-colors flex items-center gap-1 mx-auto"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                  {text('Back', 'Indietro')}
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const loadingMessages = [
    "Reading your job description…",
    "Extracting role requirements and skills…",
    "Structuring the job profile…",
    "Preparing for candidate matching…",
  ];

  return (
    <div className="max-w-6xl mx-auto px-3 pt-2.5 pb-20 sm:px-8 lg:px-10">
      {isLoading && <LoadingScreen messages={loadingMessages} />}
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-600 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        {text('Back', 'Indietro')}
      </button>
      <ProgressTracker steps={flowSteps} currentStep={step} />
      <div className="mt-8">
        {renderStep()}
      </div>
    </div>
  );
};

export default RecruiterFlow;
