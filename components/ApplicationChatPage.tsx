
import React, { useState, useEffect, useRef } from 'react';
import { JobProfile, CandidateProfile, ChatMessage } from '../types';
import { generateRefinedApplicationProfile } from '../services/geminiService';
import ChatWindow from './ChatWindow';
import { AiBanner, Spinner, JsonViewer } from './common';
import { useLanguage } from './LanguageProvider';
import { toast } from 'sonner';

interface ApplicationChatPageProps {
  job: JobProfile;
  onCancel: () => void;
  onComplete: () => void;
  candidate: CandidateProfile | null;
}

const ApplicationChatPage: React.FC<ApplicationChatPageProps> = ({ job, onCancel, onComplete, candidate }) => {
  const { language, text } = useLanguage();
  const [refinedProfile, setRefinedProfile] = useState<CandidateProfile | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isInterviewComplete, setIsInterviewComplete] = useState(false);
  const chatHistoryRef = useRef<ChatMessage[]>([]);

  const handleGenerateProfile = async () => {
      if (!job || !candidate) return;
      setIsGenerating(true);
      setRefinedProfile(null);
      try {
          const chatHistory = chatHistoryRef.current
            .map(msg => `${msg.role === 'user' ? (language === 'it' ? 'Utente' : 'User') : (language === 'it' ? 'Assistente' : 'Assistant')}: ${msg.text}`)
            .join('\n');
          
          const result = await generateRefinedApplicationProfile(candidate, job, chatHistory);
          setRefinedProfile(result);
      } catch (e) {
          console.error("Failed to generate refined profile", e);
          toast.error(text("Sorry, an error occurred while generating the application profile.", "Si è verificato un errore durante la generazione del profilo candidatura."));
      } finally {
          setIsGenerating(false);
      }
  }
  
  if (!candidate) {
      return (
          <div className="text-center p-8">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{text('No Candidate Profile Found', 'Profilo candidato non trovato')}</h2>
              <p className="text-slate-600 dark:text-slate-400 mt-2">{text('Could not load your profile. Please try logging in again.', 'Impossibile caricare il tuo profilo. Prova ad accedere di nuovo.')}</p>
              <button onClick={onCancel} className="mt-6 text-sm text-orange-600 hover:underline dark:text-orange-400">&larr; {text('Back', 'Indietro')}</button>
          </div>
      );
  }
  
  const systemInstruction = `You are an expert AI Technical Interviewer for the company "${job.company_name || 'the hiring company'}". 
  You are interviewing a candidate named ${candidate.personal_info.first_name} for the role of "${job.title}".

  CONTEXT:
  - Job Description & Requirements: ${JSON.stringify(job)}
  - Candidate Profile: ${JSON.stringify(candidate)}

  YOUR MISSION:
  Conduct a focused screening interview to assess the candidate's fit for THIS specific job. 
  You must identify gaps, verify skills, and check for "Must Have" requirements that might be missing or weak in the candidate's profile.

  INTERVIEW STRATEGY:
  1.  **Introduction**: Briefly welcome the candidate and mention the role.
  2.  **Gap Analysis**: If the Job requires skills (Technical or IT) that are missing or low-rated in the Candidate Profile, ask about them directly.
  3.  **Skill Verification**: Pick 1-2 crucial "Must Have" skills from the Job Profile and ask a behavioral or situational question to verify their expertise level.
  4.  **Discrepancies**: If there are contradictions (e.g., location mismatch, salary mismatch), clarify them.
  5.  **Soft Skills**: Ask one question related to the culture or soft skills defined in the Job Profile.

  RULES:
  - Ask ONLY ONE question at a time.
  - Be professional but conversational.
  - Keep the interview to about 5-7 turns (questions) max, unless the candidate is giving very short answers.
  - Do NOT generate long lists.
  
  TERMINATION:
  When you have gathered enough information to confidently assess the candidate's fit (or after ~7 questions), end the interview by sending EXACTLY this phrase on a new line:
  
  INTERVIEW_COMPLETE`;

  return (
    <div className="flex flex-col h-full">
        <div className="flex justify-between items-center mb-4">
             <button onClick={onCancel} className="text-sm text-orange-600 hover:underline dark:text-orange-400">&larr; {text('Back', 'Indietro')}</button>
             {isInterviewComplete && !refinedProfile && (
                 <span className="text-sm font-semibold text-green-600 bg-green-100 px-3 py-1 rounded-full animate-pulse">{text('Interview Finished', 'Intervista completata')}</span>
             )}
        </div>
        
        <h1 className="mb-2 text-xl font-bold text-slate-800 sm:text-2xl dark:text-slate-100">{text('Application Interview', 'Intervista candidatura')}: {job.title}</h1>
        <AiBanner context="seeker" />
        <p className="text-slate-600 dark:text-slate-400 mb-6">{text('Complete the interview to generate your tailored application profile.', 'Completa l’intervista per generare il tuo profilo candidatura personalizzato.')}</p>

        <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="h-[65vh] min-h-[420px] border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col lg:h-[600px]">
                 <ChatWindow 
                    chatType="seeker"
                    title={text('AI Interviewer', 'Intervistatore AI')}
                    systemInstruction={systemInstruction}
                    initialMessage={text(
                        `Hello ${candidate.personal_info.first_name}, thank you for applying to the ${job.title} position. I'd like to ask you a few questions to better understand your fit for this role. Are you ready?`,
                        `Ciao ${candidate.personal_info.first_name}, grazie per esserti candidato alla posizione ${job.title}. Vorrei farti alcune domande per capire meglio il tuo allineamento con questo ruolo. Sei pronto?`
                    )}
                    onMessagesUpdate={(messages) => {
                        chatHistoryRef.current = messages;
                        const lastMsg = messages[messages.length - 1];
                        if (lastMsg && lastMsg.role === 'model' && lastMsg.text.includes('INTERVIEW_COMPLETE')) {
                            setIsInterviewComplete(true);
                        }
                    }}
                 />
            </div>
            
            <div className="flex flex-col">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700 flex-1 overflow-y-auto">
                    <h2 className="text-xl font-semibold mb-4 text-slate-800 dark:text-slate-100">{text('Application Profile', 'Profilo candidatura')}</h2>
                    
                    {!refinedProfile ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
                            {!isInterviewComplete ? (
                                <>
                                    <div className="animate-pulse bg-slate-200 dark:bg-slate-700 h-12 w-12 rounded-full mb-4"></div>
                                    <p className="text-slate-500 dark:text-slate-400">{text('Please complete the chat interview to generate your tailored profile.', 'Completa la chat interview per generare il tuo profilo personalizzato.')}</p>
                                </>
                            ) : (
                                <>
                                    <p className="text-slate-700 dark:text-slate-300 mb-4 font-medium">{text('The interview is complete. Ready to generate your profile?', 'L’intervista è completa. Pronto a generare il tuo profilo?')}</p>
                                    <button 
                                        onClick={handleGenerateProfile} 
                                        disabled={isGenerating} 
                                        className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transform transition-all duration-300 disabled:opacity-50"
                                    >
                                        {isGenerating ? <Spinner /> : text('Generate Refined Application JSON', 'Genera JSON candidatura ottimizzato')}
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="animate-fade-in flex flex-col items-center justify-center h-full">
                            <div className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">{text('Profile Generated Successfully!', 'Profilo generato con successo!')}</h3>
                            <p className="text-slate-600 dark:text-slate-400 text-center mb-8 max-w-sm">
                                {text(
                                  `Your application profile has been successfully tailored for the ${job.title} position based on your interview.`,
                                  `Il tuo profilo candidatura è stato personalizzato con successo per la posizione ${job.title} sulla base della tua intervista.`
                                )}
                            </p>
                            <button 
                                onClick={onComplete} 
                                className="bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 font-semibold py-3 px-8 rounded-xl hover:bg-slate-900 dark:hover:bg-white transition-colors shadow-md"
                            >
                                {text('Finish & Return to Overview', 'Concludi e torna alla panoramica')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default ApplicationChatPage;
