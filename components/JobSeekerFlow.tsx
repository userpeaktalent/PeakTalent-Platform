
import React, { useEffect, useRef, useState } from 'react';
import { CandidateProfile, CandidateRefinementChat, ChatMessage, Experience } from '../types';
import { extractCvInfoFromFile, summarizeCandidateProfile, rankCandidateSkills } from '../services/geminiService';
import { getSeekerSkillLevelLabel } from '../utils/skills';
import { readFileAsText } from '../utils/fileReader';
import { AiBanner, LoadingScreen, ProgressTracker } from './common';
import ChatWindow from './ChatWindow';
import { addCandidate } from '../services/dbService';
import { saveCandidateCv, saveCandidateRefinementChat, getLatestCandidateRefinementChat } from '../services/candidateAssetsService';
import { formatCandidateName, normalizePersonNamePart } from '../utils/nameFormat';
import { hasSubstantialChanges } from '../utils/profileChanges';
import CandidateForm from './CandidateForm';
import { useLanguage } from './LanguageProvider';

interface JobSeekerFlowProps {
  onGoToDashboard: () => void;
  isEditing?: boolean;
  candidate: CandidateProfile;
  onProfileUpdate: (updatedProfile: CandidateProfile) => void;
  initialStep?: number;
}

const stepStorageKey = (candidateId: string | undefined) =>
  candidateId ? `peaktalent:seekerFlow:step:${candidateId}` : null;


const JobSeekerFlow: React.FC<JobSeekerFlowProps> = ({ onGoToDashboard, isEditing = false, candidate, onProfileUpdate, initialStep }) => {
  const { text, language } = useLanguage();
  const [step, setStep] = useState<number>(() => {
    if (initialStep && initialStep >= 1 && initialStep <= 4) {
      return initialStep;
    }
    const key = stepStorageKey(candidate.id);
    if (key) {
      const stored = sessionStorage.getItem(key);
      const parsed = stored ? Number.parseInt(stored, 10) : NaN;
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 4) return parsed;
    }
    return isEditing ? 2 : 1;
  });

  useEffect(() => {
    if (!initialStep || initialStep < 1 || initialStep > 4) return;
    setStep(initialStep);
  }, [initialStep, candidate.id]);

  useEffect(() => {
    const key = stepStorageKey(candidate.id);
    if (!key) return;
    sessionStorage.setItem(key, String(step));
  }, [step, candidate.id]);

  useEffect(() => {
    if (step === 4) {
      const key = stepStorageKey(candidate.id);
      if (key) sessionStorage.removeItem(key);
    }
  }, [step, candidate.id]);

  useEffect(() => {
    if (step !== 3 || typeof window === 'undefined') return;

    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);

    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  const exitFlow = () => {
    const key = stepStorageKey(candidate.id);
    if (key) sessionStorage.removeItem(key);
    onGoToDashboard();
  };

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [assetWarning, setAssetWarning] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<Partial<CandidateProfile>>(candidate);
  const seekerFirstName = normalizePersonNamePart(profileData?.personal_info?.first_name);
  const [finalProfile, setFinalProfile] = useState<CandidateProfile | null>(null);
  const chatHistoryRef = useRef<ChatMessage[]>([]);
  const [isChatComplete, setIsChatComplete] = useState(false);
  const [reRefineModal, setReRefineModal] = useState<{ rankedProfile: Partial<CandidateProfile> } | null>(null);
  const [leaveAttempts, setLeaveAttempts] = useState(0);
  const [interviewClosedByNavigationGuard, setInterviewClosedByNavigationGuard] = useState(false);
  const [existingChat, setExistingChat] = useState<CandidateRefinementChat | null>(null);
  const [chatInitialized, setChatInitialized] = useState(false);

  useEffect(() => {
    const loadExistingChat = async () => {
      if (candidate.ai_refined) {
        setChatInitialized(true);
        return; // Don't load if already completed
      }
      try {
        const chat = await getLatestCandidateRefinementChat({ id: candidate.id, email: candidate.contacts?.email });
        if (chat && !chat.completed_at) {
          setExistingChat(chat);
          chatHistoryRef.current = chat.transcript;
        }
        setChatInitialized(true);
      } catch (error) {
        console.error('Failed to load existing chat:', error);
        setChatInitialized(true);
      }
    };
    loadExistingChat();
  }, [candidate.id, candidate.contacts?.email, candidate.ai_refined]);

  const isInterviewInProgress = step === 3 && !candidate.ai_refined && !isChatComplete;

  useEffect(() => {
    if (!isInterviewInProgress) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaveAttempts >= 2) {
        return;
      }

      const nextAttempt = leaveAttempts + 1;
      const remaining = 2 - nextAttempt;
      const warningMessage = text(
        remaining > 0
          ? `If you leave now, your AI interview may be interrupted. You have ${remaining} warning left before this interview is closed automatically.`
          : 'If you leave now, this AI interview will be closed automatically.',
        remaining > 0
          ? `Se lasci ora, l'intervista AI potrebbe interrompersi. Hai ancora ${remaining} avviso prima della chiusura automatica dell'intervista.`
          : "Se lasci ora, questa intervista AI verra chiusa automaticamente."
      );

      // Save incomplete chat before warning
      saveIncompleteChat();

      window.alert(warningMessage);
      setLeaveAttempts(nextAttempt);

      if (nextAttempt >= 2) {
        setInterviewClosedByNavigationGuard(true);
        setStep(2);
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isInterviewInProgress, leaveAttempts, text]);

  useEffect(() => {
    if (!interviewClosedByNavigationGuard) {
      return;
    }
    setError(text(
      'AI interview closed after navigation attempts. You can reopen it from this page.',
      'Intervista AI chiusa dopo i tentativi di navigazione. Puoi riaprirla da questa pagina.'
    ));
    setInterviewClosedByNavigationGuard(false);
    setLeaveAttempts(0);
  }, [interviewClosedByNavigationGuard, text]);

  useEffect(() => {
    if (!isInterviewInProgress && leaveAttempts !== 0) {
      setLeaveAttempts(0);
    }
  }, [isInterviewInProgress, leaveAttempts]);

  const saveIncompleteChat = async () => {
    if (chatHistoryRef.current.length === 0) return;
    try {
      await saveCandidateRefinementChat(candidate, chatHistoryRef.current, language);
    } catch (error) {
      console.error('Failed to save incomplete chat:', error);
    }
  };

  const buildCandidateForSave = (updatedProfile: Partial<CandidateProfile>): CandidateProfile => ({
    ...candidate,
    ...updatedProfile,
    id: candidate.id,
    personal_info: {
      ...candidate.personal_info,
      ...updatedProfile.personal_info,
    },
    residence: {
      ...candidate.residence,
      ...updatedProfile.residence,
    },
    contacts: {
      ...candidate.contacts,
      ...updatedProfile.contacts,
    },
    preferences: {
      ...candidate.preferences,
      ...updatedProfile.preferences,
      salary_eur: {
        ...candidate.preferences?.salary_eur,
        ...updatedProfile.preferences?.salary_eur,
      },
      preferred_locations: updatedProfile.preferences?.preferred_locations || candidate.preferences?.preferred_locations || [],
    },
    education: updatedProfile.education || [],
    experiences: updatedProfile.experiences || [],
    certifications: updatedProfile.certifications || [],
    languages: updatedProfile.languages || [],
    industry_experience: updatedProfile.industry_experience || [],
    target_job_functions: updatedProfile.target_job_functions || [],
    skills: updatedProfile.skills || [],
    it_skills: updatedProfile.it_skills || [],
    soft_skills: updatedProfile.soft_skills || [],
    summary_text: updatedProfile.summary_text || '',
    summary_text_it: updatedProfile.summary_text !== undefined && updatedProfile.summary_text !== candidate.summary_text
      ? undefined
      : updatedProfile.summary_text_it ?? candidate.summary_text_it,
    summary_text_en: updatedProfile.summary_text !== undefined && updatedProfile.summary_text !== candidate.summary_text
      ? undefined
      : updatedProfile.summary_text_en ?? candidate.summary_text_en,
  });

  const flowSteps = [
    text('Upload CV', 'Carica CV'),
    text('Verify Details', 'Verifica dati'),
    text('Refine with AI', 'Affina con AI'),
    text('Profile Complete', 'Profilo completo'),
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCvFile(e.target.files[0]);
    }
  };

  const handleCvUpload = async () => {
    if (!cvFile) {
      setError(text('Please select a file.', 'Seleziona un file.'));
      return;
    }
    setIsLoading(true);
    setError(null);
    setAssetWarning(null);
    try {
      const info = await extractCvInfoFromFile(cvFile);
      try {
        await saveCandidateCv(buildCandidateForSave(info), cvFile);
      } catch (storageError: any) {
        console.error('Failed to persist seeker CV during onboarding:', storageError);
        setAssetWarning(storageError?.message || text('The CV was analyzed, but it could not be stored in your profile yet.', 'Il CV è stato analizzato, ma non è ancora stato possibile salvarlo nel tuo profilo.'));
      }
      setProfileData(currentProfile => ({ ...currentProfile, ...info }));
      setStep(2);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : text('Failed to process CV. Please try again.', 'Elaborazione CV non riuscita. Riprova.');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReuploadCv = async (file: File) => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setAssetWarning(null);
    try {
      const info = await extractCvInfoFromFile(file);
      const nextProfile = buildCandidateForSave({
        ...profileData,
        ...info,
      });

      setProfileData(prev => ({
        ...prev,
        ...info,
        id: prev.id,
        contacts: {
          ...prev.contacts,
          ...info.contacts,
          email: prev.contacts?.email || info.contacts?.email || ''
        },
        personal_info: {
          ...prev.personal_info,
          ...info.personal_info
        }
      }));

      try {
        await saveCandidateCv(nextProfile, file);
      } catch (storageError: any) {
        console.error('Failed to replace seeker CV from onboarding flow:', storageError);
        setAssetWarning(storageError?.message || text('The form was updated, but the new CV could not be stored yet.', 'Il form è stato aggiornato, ma il nuovo CV non è ancora stato salvato.'));
      }
      setSuccessMessage(text('CV analyzed successfully! Form updated with new data.', 'CV analizzato con successo. Il form è stato aggiornato con i nuovi dati.'));
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : text('Failed to process CV. Please try again.', 'Elaborazione CV non riuscita. Riprova.');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = async (updatedProfile: Partial<CandidateProfile>, action: 'save' | 'refine') => {
    if (action === 'refine' && candidate.ai_refined) {
      setError(text('You have already completed the AI interview. You can save your manual edits directly.', "Hai già completato l'intervista AI. Puoi salvare direttamente le modifiche manuali."));
      return;
    }

    // Re-rank skills based on the finalized profile before proceeding
    setIsLoading(true);
    setError(null);
    let rankedProfile = updatedProfile;
    try {
      const { skills, it_skills } = await rankCandidateSkills(
        updatedProfile.skills || [],
        updatedProfile.it_skills || [],
        updatedProfile.experiences || [],
      );
      rankedProfile = { ...updatedProfile, skills, it_skills };
    } catch (err) {
      console.warn('Skill ranking failed, proceeding without re-ranking:', err);
    } finally {
      setIsLoading(false);
    }

    setProfileData(rankedProfile);

    if (action === 'refine') {
      setIsLoading(true);
      try {
        const profileToSave = buildCandidateForSave(rankedProfile);
        const savedProfile = await addCandidate(profileToSave);
        setProfileData(savedProfile);
        onProfileUpdate(savedProfile);
      } catch (err) {
        console.warn('Pre-step-3 profile save failed — data only in memory:', err);
      } finally {
        setIsLoading(false);
      }
      setStep(3);
    } else {
      // If substantial fields changed, ask whether to (re)do the chatbot
      if (hasSubstantialChanges(candidate, rankedProfile)) {
        setReRefineModal({ rankedProfile });
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const profile = buildCandidateForSave(rankedProfile);
        const savedProfile = await addCandidate(profile);
        setFinalProfile(savedProfile);
        onProfileUpdate(savedProfile);
        exitFlow();
      } catch (err) {
        console.error(err);
        setError(text('Failed to save profile. Please try again.', 'Salvataggio profilo non riuscito. Riprova.'));
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleConfirmReRefine = async () => {
    if (!reRefineModal) return;
    setReRefineModal(null);
    setIsLoading(true);
    setError(null);
    try {
      const oldChat = await getLatestCandidateRefinementChat({ id: candidate.id, email: candidate.contacts?.email });
      const profile = buildCandidateForSave(reRefineModal.rankedProfile);
      profile.ai_refined = false;
      profile.ai_refined_at = undefined;
      profile.last_refinement_chat_backup = oldChat
        ? { transcript: oldChat.transcript, completed_at: oldChat.completed_at ?? '', archived_at: new Date().toISOString() }
        : null;
      const savedProfile = await addCandidate(profile);
      onProfileUpdate(savedProfile);
      setProfileData(savedProfile);
      setStep(3);
    } catch (err) {
      console.error(err);
      setError(text('Failed to save profile. Please try again.', 'Salvataggio profilo non riuscito. Riprova.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveWithoutReRefine = async () => {
    if (!reRefineModal) return;
    setReRefineModal(null);
    setIsLoading(true);
    setError(null);
    try {
      const profile = buildCandidateForSave(reRefineModal.rankedProfile);
      // Profile changed substantially — old AI refinement is no longer valid
      profile.ai_refined = false;
      profile.ai_refined_at = undefined;
      const savedProfile = await addCandidate(profile);
      setFinalProfile(savedProfile);
      onProfileUpdate(savedProfile);
      exitFlow();
    } catch (err) {
      console.error(err);
      setError(text('Failed to save profile. Please try again.', 'Salvataggio profilo non riuscito. Riprova.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipAndSave = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const profile = buildCandidateForSave(profileData);
      const savedProfile = await addCandidate(profile);
      setFinalProfile(savedProfile);
      onProfileUpdate(savedProfile);
      setStep(4);
    } catch (err) {
      console.error(err);
      setError(text('Failed to save profile. Please try again.', 'Salvataggio profilo non riuscito. Riprova.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileGeneration = async () => {
    if (!profileData) return;
    setIsLoading(true);
    setError(null);
    setAssetWarning(null);
    try {
      const chatHistory = chatHistoryRef.current
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n');

      const profile = await summarizeCandidateProfile(profileData, chatHistory);
      profile.id = candidate.id;
      // Mark as AI refined so interview can't be repeated
      profile.ai_refined = true;
      profile.ai_refined_at = new Date().toISOString();
      const savedProfile = await addCandidate(profile);
      try {
        await saveCandidateRefinementChat(savedProfile, chatHistoryRef.current, language);
      } catch (chatSaveError: any) {
        console.error('Failed to persist seeker AI refinement transcript:', chatSaveError);
        setAssetWarning(chatSaveError?.message || text('The profile was saved, but the AI transcript could not be stored yet.', 'Il profilo è stato salvato, ma la transcript AI non è ancora stata salvata.'));
      }
      setProfileData(savedProfile);
      setFinalProfile(savedProfile);
      onProfileUpdate(savedProfile);
      setStep(4);
    } catch (err) {
      console.error(err);
      setError(`${text('Failed to generate final profile. Please try again.', 'Generazione del profilo finale non riuscita. Riprova.')}${err instanceof Error ? ` ${err.message}` : ''}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-4">{text('Upload Your CV', 'Carica il tuo CV')}</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">{text("Let our AI do the heavy lifting. We'll parse your CV to build the foundation of your profile. (Use a .pdf or .txt file)", 'Lascia fare il lavoro pesante alla nostra AI. Analizzeremo il tuo CV per costruire la base del profilo. (Usa un file .pdf o .txt)')}</p>
            <div className="max-w-md mx-auto">
              <input type="file" onChange={handleFileChange} accept=".txt,.pdf,text/plain,application/pdf" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 dark:file:bg-orange-900/50 dark:file:text-orange-300 dark:hover:file:bg-orange-900" />
              <button onClick={handleCvUpload} disabled={isLoading || !cvFile} className="mt-6 w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:shadow-lg transform transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                {isLoading ? text('Analyzing your CV and building your profile…', 'Analizziamo il tuo CV e prepariamo il profilo…') : text('Analyze CV', 'Analizza CV')}
              </button>
              {isLoading && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5 animate-spin text-orange-500 dark:text-orange-300" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span className="font-semibold">{text("We're processing your resume. This may take a few minutes.", 'Stiamo elaborando il tuo CV. Può richiedere alcuni minuti.')}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    {text('We extract experience, skills, roles and more before moving to the next step.', 'Estraiamo esperienza, competenze, ruoli e altro prima di passare al prossimo passo.')}
                  </p>
                </div>
              )}
              {error && <p className="text-red-500 mt-4">{error}</p>}
              {assetWarning && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                  {assetWarning}
                </p>
              )}
            </div>
          </div>
        );
      case 2:
        return (
          <div>
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-4 text-center">
              {isEditing ? text('Edit Profile', 'Modifica profilo') : text('Review Your Candidate Profile', 'Rivedi il tuo profilo candidato')}
            </h2>

            <div className="bg-slate-50 dark:bg-slate-800/80 p-5 rounded-xl border border-slate-200 dark:border-slate-700 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
              <div className="text-center sm:text-left">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center sm:justify-start gap-2">
                  <span>⚡</span> {text('Autofill from CV', 'Autocompilazione da CV')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {text('Upload a new resume to automatically update these fields.', 'Carica un nuovo CV per aggiornare automaticamente questi campi.')}
                </p>
              </div>
              <div className="flex-shrink-0">
                <input
                  type="file"
                  id="reupload-cv-input"
                  hidden
                  accept=".txt,.pdf,text/plain,application/pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleReuploadCv(e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />
                <label
                  htmlFor="reupload-cv-input"
                  className={`cursor-pointer inline-flex items-center gap-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 font-medium py-2 px-4 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-all ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isLoading ? text('Processing...', 'Elaborazione...') : text('Upload & Update', 'Carica e aggiorna')}
                </label>
              </div>
            </div>

            <div className="mb-6 text-center">
              {successMessage && (
                <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 p-3 rounded-lg inline-flex items-center gap-2 animate-fade-in">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  {successMessage}
                </div>
              )}
              {error && <p className="text-red-500 dark:text-red-400 font-medium">{error}</p>}
              {assetWarning && (
                <div className="mt-3 inline-flex max-w-2xl items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                  {assetWarning}
                </div>
              )}
            </div>

            <p className="text-slate-600 dark:text-slate-400 mb-6 text-center">
              {text('Review, edit, and fill in any missing details below.', 'Rivedi, modifica e completa eventuali dettagli mancanti qui sotto.')}
            </p>

            {!profileData ? (
              <p className="text-red-500 text-center">{text('Could not load profile data.', 'Impossibile caricare i dati profilo.')}</p>
            ) : (
              <CandidateForm
                initialData={profileData}
                onSubmit={handleFormSubmit}
                isSaving={isLoading}
              />
            )}
          </div>
        );
      case 3:
        // If AI interview was already completed AND not being reset for re-refinement, show locked state
        if (candidate.ai_refined && profileData.ai_refined !== false) {
          return (
            <div className="text-center animate-fade-in py-12">
              <div className="h-16 w-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-3">{text('AI Interview Completed', 'Intervista AI completata')}</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-2">{text("You've already completed your AI career refinement interview.", 'Hai già completato la tua intervista AI di affinamento carriera.')}</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mb-8">{text('Completed on', 'Completata il')} {new Date(candidate.ai_refined_at || '').toLocaleDateString()}</p>
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={exitFlow}
                  className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 px-8 rounded-lg shadow-md hover:shadow-xl transform transition-all"
                >
                  {text('Go to Dashboard', 'Vai alla dashboard')}
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors text-sm font-medium"
                >
                  {text('Edit profile manually instead', 'Modifica invece il profilo manualmente')}
                </button>
              </div>
            </div>
          );
        }

        // Build the uncertainty-target list from profileData, falling back to candidate prop
        // (profileData.skills can be empty if CandidateForm doesn't include skill fields in its output)
        const resolvedSkills = (profileData?.skills?.length ? profileData.skills : candidate.skills) || [];
        const resolvedItSkills = (profileData?.it_skills?.length ? profileData.it_skills : candidate.it_skills) || [];
        const allSkills = [
          ...resolvedSkills.map((s: typeof resolvedSkills[0]) => ({ ...s, category: 'technical' as const })),
          ...resolvedItSkills.map((s: typeof resolvedItSkills[0]) => ({ ...s, category: 'it' as const })),
        ];

        // Priority formula: Importance (Rank) * Uncertainty (Confidence) * SourceBoost * CategoryWeight
        // rankScore: 21 - rank → rank 1 = score 20, rank 20 = score 1
        // Priority = rankScore × categoryWeight only.
        // Confidence and source are passed as context to the AI prompt so it knows which skills
        // to probe more — they must NOT influence selection, because low-confidence skills are
        // typically unimportant bare-list entries (e.g. Inventor listed once) and boosting them
        // would promote junk IT tools above core technical skills.
        // categoryWeight: it=0.75 normalizes the two independent rank scales so rank-1 IT
        // never beats rank-1 technical (20×0.75=15 < 20×1.0=20).
        const sortedSkills = allSkills
          .map(s => {
            const rankScore = Math.max(1, 21 - (s.rank || 20));
            const categoryWeight = s.category === 'it' ? 0.90 : 1.0;
            return { ...s, priority: rankScore * categoryWeight };
          })
          .sort((a, b) => b.priority - a.priority);

        // Cap IT skills at 2 out of 5: iterate in priority order, include IT only until quota is full
        const MAX_IT_IN_TARGETS = 2;
        const prioritizedSkills: typeof sortedSkills = [];
        let itSlots = 0;
        for (const s of sortedSkills) {
          if (prioritizedSkills.length >= 5) break;
          if (s.category === 'it') {
            if (itSlots < MAX_IT_IN_TARGETS) { prioritizedSkills.push(s); itSlots++; }
          } else {
            prioritizedSkills.push(s);
          }
        }

        // When no structured skills exist, derive verification targets from experiences
        const experienceDerivedTargets: string[] = [];
        if (prioritizedSkills.length === 0 && profileData?.experiences && profileData.experiences.length > 0) {
          const recentRoles = profileData.experiences.slice(0, 3);
          recentRoles.forEach((exp: Experience, i: number) => {
            if (exp.role) experienceDerivedTargets.push(`${i + 1}. Competence in "${exp.role}" at ${exp.company || 'previous company'} — verify depth and ownership`);
          });
          // Also add generic depth topics if fewer than 4
          if (experienceDerivedTargets.length < 4) {
            const generics = language === 'it'
              ? ['Metodologie e approcci tecnici', 'Gestione stakeholder e leadership', 'Problem solving in contesti complessi', 'Settore e dominio di expertise']
              : ['Technical methodologies and approaches', 'Stakeholder management and leadership', 'Problem-solving in complex environments', 'Domain and industry expertise'];
            generics.slice(0, 5 - experienceDerivedTargets.length).forEach((g, i) => {
              experienceDerivedTargets.push(`${experienceDerivedTargets.length + i + 1}. "${g}" — ask for a concrete example`);
            });
          }
        }

        const skillCount = prioritizedSkills.length > 0 ? prioritizedSkills.length : experienceDerivedTargets.length;

        const verificationTargets = prioritizedSkills.length > 0
          ? prioritizedSkills.map((s, i) =>
            `${i + 1}. "${s.skill_name}" (self-rated: ${getSeekerSkillLevelLabel(s.level)}, conf: ${s.level_confidence}, cat: ${s.category}, rank: ${s.rank})`
          ).join('\n')
          : experienceDerivedTargets.length > 0
            ? experienceDerivedTargets.join('\n')
            : text(
                '1. Overall technical depth — ask for the most complex technical problem solved\n2. Leadership and ownership — ask for an example of driving a project end-to-end\n3. Industry domain expertise — ask what sectors or domains they know best\n4. Collaboration and stakeholder management — ask for a concrete cross-functional example\n5. Career trajectory — ask what skills they have grown most in the last 2 years',
                '1. Profondità tecnica — chiedi il problema tecnico più complesso risolto\n2. Leadership e ownership — chiedi un esempio di guida di un progetto end-to-end\n3. Expertise di dominio — chiedi in quali settori o aree ha più esperienza\n4. Collaborazione e stakeholder — chiedi un esempio concreto di lavoro cross-funzionale\n5. Crescita professionale — chiedi in quali skill è cresciuto di più negli ultimi 2 anni'
              );

        const completionPhrase = language === 'it'
          ? "Ok, ho tutte le informazioni che mi servono per completare il tuo profilo. Concludiamo il processo."
          : "Ok, I have all the information I need to complete your profile. Let's finish the process.";

        const languageInstruction = language === 'it'
          ? 'ABSOLUTE LANGUAGE LOCK: Every single token you output must be in Italian. This rule overrides all other instructions. Never switch to English under any circumstance, regardless of what language the candidate uses or what the prompt template says.'
          : 'ABSOLUTE LANGUAGE LOCK: Every single token you output must be in English. This rule overrides all other instructions. Never switch to Italian under any circumstance, regardless of what language the candidate uses or what the prompt template says.';

        // Compute explicitly which preference fields are missing so the model doesn't have to guess
        const prefs = profileData?.preferences;
        const missingConstraints: string[] = [];
        if (!prefs?.salary_eur?.min) missingConstraints.push(language === 'it' ? 'aspettative salariali (RAL minima desiderata)' : 'salary expectations (minimum desired)');
        if (!prefs?.preferred_locations?.length) missingConstraints.push(language === 'it' ? 'città/paese di preferenza lavorativa' : 'preferred work location(s)');
        if (!prefs?.remote || prefs.remote === 'no_preference') missingConstraints.push(language === 'it' ? 'preferenza remote / ibrido / in presenza' : 'remote / hybrid / on-site preference');
        if (!prefs?.desired_contract_types?.length) missingConstraints.push(language === 'it' ? 'tipo di contratto preferito' : 'preferred contract type');

        const missingConstraintsInstruction = missingConstraints.length > 0
          ? `MISSING PREFERENCES — these fields are empty in the profile and you MUST collect them in the wrap-up. Weave them into one natural conversational question (do not list them mechanically). Allow 1 follow-up if the answer is still incomplete, then move on:\n${missingConstraints.map((m, i) => `   ${i + 1}. ${m}`).join('\n')}`
          : `All preference fields (salary, location, remote, contract) are already filled. Do NOT ask about them in the wrap-up.`;

        return (
          <div>
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-4 text-center">
              {text('AI Career Refinement', 'Affinamento carriera con AI')}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6 text-center">
              {text('Our assistant will interview you to capture nuance and boost your match accuracy.', "Il nostro assistente ti farà un'intervista per cogliere sfumature e migliorare l'accuratezza del matching.")}
            </p>
            <div className="h-[65vh] min-h-[420px] border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden sm:h-[600px]">
              {chatInitialized ? (
                <ChatWindow
                  chatType="seeker"
                  title={text('Career Assistant', 'Assistente carriera')}
                  systemInstruction={`ROLE:
You are a senior headhunter conducting a high-precision skill verification interview.
Your primary goal is to verify the proficiency level of EVERY skill listed in VERIFICATION TARGETS.

CANDIDATE DATA:
${JSON.stringify(profileData, null, 2)}

VERIFICATION TARGETS (in priority order — you must address every single one):
${verificationTargets}

INTERVIEW STRUCTURE — follow this order strictly:

1. OPENING (1–2 questions maximum):
   - Question 1: ask the candidate to briefly describe their current role and the professional direction they want to pursue.
   - After Q1, evaluate the answer on two dimensions:
     (a) ROLE CLARITY: do you understand their current position and seniority?
     (b) DIRECTION CLARITY: do you understand what they want to do more of, what to leave behind, and what kind of next step they are aiming for?
   - If BOTH dimensions are clearly covered → skip Q2 entirely and proceed directly to section 2. Do not acknowledge the skip.
   - If ONE dimension is missing or ambiguous → ask exactly 1 targeted clarification that addresses only the missing piece (not a generic Q2). Then proceed to section 2 regardless of the answer.
   - If BOTH dimensions are missing or very thin → ask Question 2: what have they focused on most in the past year, and what would they like to do more (or less) of in their next role.
   - If any answer is clearly off-topic, redirect once with a short direct sentence, then move on regardless.
   - After the opening (whether 1 or 2 questions), mentally reorder VERIFICATION TARGETS if needed before entering section 2. Do not announce this adjustment.

2. SKILL VERIFICATION — THIS IS THE CORE SECTION. DO NOT SKIP OR RUSH.
   - Work through VERIFICATION TARGETS in priority order. Dedicate one direct question to each skill — do NOT group multiple skills into a single question.
   - For each skill: ask for a concrete project, task, or real-world example that demonstrates it.
   - FOLLOW-UP DECISION — after each answer, apply this logic:
     * If the answer is vague, generic, or insufficient → ask ONE broad clarifying question to surface more context (what was the project, what was their role, what was the outcome).
     * If the answer is detailed but ONE calibration factor is genuinely unresolvable and your level estimate would shift by 2+ points depending on it → ask ONE very targeted question on that single factor. Typical cases: ownership is completely unclear (primary lead vs. support contributor) or scope is so unspecified you cannot tell if it was a prototype or a production system. Do NOT ask a follow-up just to confirm what you already understood or to gather additional detail. If you can assign a level confidently within a 1-point range, skip the follow-up.
     * If the answer is detailed AND you can assign a level confidently → no follow-up, move directly to the next skill.
   - One follow-up maximum per skill, regardless of outcome. Then move on.
   - Expected question count: minimum ${skillCount} (one per skill), maximum ${skillCount * 2} (one follow-up allowed per skill). Never exceed this.
   - Before moving to section 3, run a hard check: have you asked at least one direct question for each of the ${skillCount} items in VERIFICATION TARGETS? If any skill was skipped, address it now.
   - RECENCY: if the candidate's last concrete use of a skill is older than 2 years, note it internally as partially decayed.

3. WRAP-UP (only after ALL skills are done):
   - Explore the kind of work environment and working style they are looking for — things like team dynamics, autonomy, pace, company culture, remote/hybrid. Ask this naturally and openly, without listing sub-topics. Let the candidate lead. (max 1 question, no follow-up)
   - ${missingConstraintsInstruction}

RULES:
- Ask EXACTLY ONE question at a time. Never bundle two questions, except for follow-ups and section 3 (WRAP-UP) questions.
- NEVER mention any numeric score, rating, or level to the candidate (no "1/10", "3/10", "base level", no fractions). If you must refer to their claimed level, use only the label: Base, Intermediate, or Expert (but avoid even that if possible — focus on the skill and evidence, not on the label). Do NOT ask them to self-rate or explain their level — just ask for concrete examples that demonstrate their proficiency.
- Never say "your CV says" or reference confidence/source metadata.
- Do not acknowledge answers. Banned words and phrases (in any language): "Great!", "Excellent!", "Perfect!", "Interesting!", "Ottimo", "Perfetto", "Ottima risposta", "Grazie", "Capisco", "Capito", "Chiarissimo", "Certo", "Interessante", "Bene", "Ok, grazie", or any equivalent filler in any language. Go directly to the next question with zero preamble.
- Do NOT announce which skill or topic you are moving to next. Every question must stand on its own — never say "Passando a X…", "Per quanto riguarda Y…", "Ora parliamo di…", "Moving on to…", or any similar transition phrase.
- Do not explain why you are asking a question.
- Do not give feedback during the interview.

INTERNAL SCORING (never verbalize — for profile update only):
- Specific project + scale + ownership + trade-offs matching claimed level → keep CV level
- Generic or partial answer → lower by 2-3 points
- Vague after one follow-up (hard stop triggered) → lower by 4-5 points, minimum 2/10
- Clearly exceeds claimed level → raise by 1-2 points, max 10/10

${languageInstruction}

COMPLETION:
Only after ALL skills have been addressed AND the wrap-up is done, close with EXACTLY this format — no deviation:

"${completionPhrase}

---INTERNAL---
VERIFIED_SKILLS:
- [skill_name]: [verified_level]/10 (was [cv_level]/10)
[one line per skill]
---END_INTERNAL---"`}
                  initialMessages={existingChat ? existingChat.transcript : undefined}
                  initialMessage={!existingChat ? (language === 'it'
                    ? `Ciao${seekerFirstName ? ` ${seekerFirstName}` : ''}! 👋 Sono il tuo Assistente Carriera. Ho già rivisto il tuo profilo e vorrei farti alcune domande mirate sulla tua esperienza, così il nostro motore di matching potrà allinearsi meglio alle tue skill. Sei pronto?`
                    : `Hi${seekerFirstName ? ` ${seekerFirstName}` : ''}! 👋 I'm your Career Assistant. I've reviewed your profile and I'd like to ask you a few targeted questions about your experience to ensure our job matching engine perfectly aligns with your skills. Ready?`) : undefined}
                  onMessagesUpdate={(updatedMessages) => {
                    chatHistoryRef.current = updatedMessages;
                    const last = updatedMessages[updatedMessages.length - 1];
                    if (last && last.role === 'model' && last.text.includes(completionPhrase)) {
                      setIsChatComplete(true);
                    }
                    // Save incomplete chat periodically
                    if (updatedMessages.length > 1) { // Don't save just the initial message
                      saveIncompleteChat();
                    }
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
                    <p className="text-slate-600 dark:text-slate-400">{text('Loading chat...', 'Caricamento chat...')}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 text-center flex flex-col items-center gap-4">
              <button
                onClick={handleProfileGeneration}
                disabled={!isChatComplete || isLoading}
                className="w-full max-w-md bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:shadow-xl transform transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
              >
                  {isEditing ? text('Update Profile with AI Insights', 'Aggiorna il profilo con insight AI') : text('Create AI-Powered Profile', "Crea profilo potenziato dall'AI")}
              </button>

              <button
                onClick={handleSkipAndSave}
                disabled={isLoading}
                className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {text("Skip refinement and just save manual edits", "Salta l'affinamento e salva solo le modifiche manuali")}
              </button>

              {!isChatComplete && (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{text('Complete the chat to unlock the AI profile boost.', 'Completa la chat per sbloccare il potenziamento AI del profilo.')}</p>
              )}
              {error && <p className="text-red-500 mt-4">{error}</p>}
              {assetWarning && (
                <p className="max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                  {assetWarning}
                </p>
              )}
            </div>
          </div>
        );

      case 4: {
        const displayProfile = finalProfile || profileData as CandidateProfile;
        return (
          <div className="text-center animate-fade-in">
            <div className="h-16 w-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            </div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-4 sm:text-3xl">{text('Profile Ready!', 'Profilo pronto!')}</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md mx-auto">{text('Your professional identity has been updated. You are now being matched with top-tier recruiter requests.', 'La tua identità professionale è stata aggiornata. Ora verrai associato alle richieste recruiter più rilevanti.')}</p>

            {assetWarning && (
              <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                {assetWarning}
              </div>
            )}

            {displayProfile && (
              <div className="max-w-2xl mx-auto text-left bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-orange-500 to-amber-500 h-2"></div>
                <div className="p-8">
                  {/* Name & Role */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="h-14 w-14 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center text-2xl flex-shrink-0">
                      🧑
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                        {formatCandidateName(displayProfile) || text('Professional', 'Professionista')}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {displayProfile.current_job_function ? displayProfile.current_job_function.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : text('Professional', 'Professionista')}
                        {displayProfile.current_seniority_level ? ` · ${displayProfile.current_seniority_level.charAt(0).toUpperCase() + displayProfile.current_seniority_level.slice(1)}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Summary */}
                  {displayProfile.summary_text && (
                    <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-700">
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">{displayProfile.summary_text}</p>
                    </div>
                  )}

                  {/* Stats Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/10 rounded-xl">
                      <p className="text-2xl font-black text-orange-600 dark:text-orange-400">{displayProfile.skills?.length || 0}</p>
                      <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">{text('Skills', 'Skill')}</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl">
                      <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{displayProfile.it_skills?.length || 0}</p>
                      <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">{text('IT Skills', 'Competenze IT')}</p>
                    </div>
                    <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/10 rounded-xl">
                      <p className="text-2xl font-black text-purple-600 dark:text-purple-400">{displayProfile.experiences?.length || 0}</p>
                      <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">{text('Experiences', 'Esperienze')}</p>
                    </div>
                    <div className="text-center p-3 bg-green-50 dark:bg-green-900/10 rounded-xl">
                      <p className="text-2xl font-black text-green-600 dark:text-green-400">{displayProfile.education?.length || 0}</p>
                      <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">{text('Education', 'Formazione')}</p>
                    </div>
                  </div>

                  {/* Top Skills */}
                  {(displayProfile.skills?.length > 0 || displayProfile.it_skills?.length > 0) && (
                    <div className="mb-6">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{text('Top Competencies', 'Competenze principali')}</p>
                      <div className="flex flex-wrap gap-2">
                        {[...displayProfile.skills || [], ...displayProfile.it_skills || []]
                          .sort((a, b) => (b.level || 0) - (a.level || 0))
                          .slice(0, 8)
                          .map((s, i) => (
                            <span key={i} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg">
                              {s.skill_name}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* AI Refinement Badge */}
                  {displayProfile.ai_refined && (
                    <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 p-3 rounded-xl border border-green-100 dark:border-green-800">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      <span className="text-sm font-bold text-green-700 dark:text-green-300">{text('AI Career Interview Completed', 'Intervista carriera AI completata')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={exitFlow}
              className="mt-10 bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-black py-4 px-10 rounded-2xl shadow-xl hover:shadow-slate-500/20 transform transition-all uppercase tracking-widest text-sm"
            >
              {text('Go to Dashboard', 'Vai alla dashboard')}
            </button>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const loadingMessages = [
    text('Saving your profile…', 'Salvataggio profilo…'),
    text('Extracting skills and experience…', 'Estrazione skill ed esperienza…'),
    text('Writing your professional summary…', 'Scrittura del riepilogo professionale…'),
    text('Preparing your profile for job matching…', 'Preparazione del profilo per il matching…'),
  ];

  return (
    <div className="max-w-6xl mx-auto px-3 py-6 sm:px-8 sm:py-10 lg:px-10">
      {isLoading && <LoadingScreen messages={loadingMessages} />}
      {(isEditing || step > 1) && step < 4 && (
        <button onClick={exitFlow} className="mb-4 text-sm text-slate-600 hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400 transition-colors flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          {text('Discard changes and return', 'Annulla modifiche e torna indietro')}
        </button>
      )}
      <AiBanner context="seeker" />
      <div className="relative">
        <ProgressTracker steps={flowSteps} currentStep={step} />
      </div>
      <div className="mt-8">
        {renderStepContent()}
      </div>

      {reRefineModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 shadow-2xl p-6">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">
              {text('Update AI interview?', 'Aggiornare il chatbot AI?')}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
              {text(
                'You have made significant changes to your skills or experience. Would you like to run the AI interview so recruiters see an accurate picture of your updated profile?',
                'Hai modificato in modo sostanziale le tue skill o esperienze. Vuoi fare il chatbot AI così i recruiter vedono un profilo accurato e aggiornato?'
              )}
            </p>
            {candidate.ai_refined && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
                {text(
                  'The previous interview will be archived in your profile.',
                  'Il chatbot precedente verrà archiviato nel tuo profilo.'
                )}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleConfirmReRefine}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm transition-all"
              >
                {text('Yes, redo the AI interview', 'Sì, rifai il chatbot AI')}
              </button>
              <button
                onClick={handleSaveWithoutReRefine}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 py-2.5 text-sm font-semibold transition-all"
              >
                {text('No, save only', 'No, salva solo')}
              </button>
              <button
                onClick={() => setReRefineModal(null)}
                className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 py-1.5 transition-colors"
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

export default JobSeekerFlow;
