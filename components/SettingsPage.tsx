import React, { useEffect, useState } from 'react';
import { CandidateCvRecord, CandidateProfile, CandidateRefinementChat } from '../types';
import { addCandidate } from '../services/dbService';
import { supabase } from '../services/supabaseClient';
import CandidateForm from './CandidateForm';
import { useLanguage } from './LanguageProvider';
import { useAuth } from './AuthProvider';
import { toast } from 'sonner';
import { extractCvInfo } from '../services/geminiService';
import { readFileAsText } from '../utils/fileReader';
import { formatCandidateName } from '../utils/nameFormat';
import {
  deleteCandidateCvRecord,
  downloadCandidateCv,
  getCandidateCvRecord,
  getLatestCandidateRefinementChat,
  saveCandidateCv,
} from '../services/candidateAssetsService';
import RefinementChatModal from './RefinementChatModal';

const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>;
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17a1 1 0 00-1.98 0l-.14 1.097a1 1 0 01-.75.84 5.98 5.98 0 00-1.41.59 1 1 0 01-1.12-.13l-.86-.7a1 1 0 00-1.4.1l-1.4 1.68a1 1 0 00.1 1.4l.7.86a1 1 0 01.13 1.12c-.24.45-.43.92-.58 1.41a1 1 0 01-.84.75l-1.1.14a1 1 0 000 1.98l1.1.14a1 1 0 01.84.75c.15.49.34.96.58 1.4a1 1 0 01-.13 1.13l-.7.86a1 1 0 00-.1 1.4l1.4 1.68a1 1 0 001.4.1l.86-.7a1 1 0 011.12-.13c.45.24.92.43 1.41.58a1 1 0 01.75.84l.14 1.1a1 1 0 001.98 0l.14-1.1a1 1 0 01.75-.84 5.98 5.98 0 001.41-.58 1 1 0 011.12.13l.86.7a1 1 0 001.4-.1l1.4-1.68a1 1 0 00-.1-1.4l-.7-.86a1 1 0 01-.13-1.12c.24-.45.43-.92.58-1.41a1 1 0 01.84-.75l1.1-.14a1 1 0 000-1.98l-1.1-.14a1 1 0 01-.84-.75 5.98 5.98 0 00-.58-1.41 1 1 0 01.13-1.12l.7-.86a1 1 0 00.1-1.4l-1.4-1.68a1 1 0 00-1.4-.1l-.86.7a1 1 0 01-1.12.13 5.98 5.98 0 00-1.41-.59 1 1 0 01-.75-.84l-.14-1.097zM10.5 13a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clipRule="evenodd" /></svg>;
const EyeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>;
const LockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2V7a3 3 0 00-6 0v2h6z" clipRule="evenodd" /></svg>;
const ChipIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>;
const BellIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>;
const BriefcaseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-10-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" /><path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" /></svg>;
const LogoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V5h10a1 1 0 100-2H3zm12.293 4.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L17.586 12H10a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 000-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;

export type SettingsTab = 'profile' | 'settings' | 'security' | 'notifications';
export type LegacySettingsTab = SettingsTab | 'profile' | 'privacy_visibility' | 'ai_data' | 'matching';

interface SettingsPageProps {
  onBack: () => void;
  candidate: CandidateProfile;
  onUpdateProfile: (profile: CandidateProfile) => void;
  onOpenProfileRefine: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  initialTab?: LegacySettingsTab;
}

const SectionCard: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
    <div className="mb-6">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
    </div>
    {children}
  </section>
);

const InlineToggle: React.FC<{ checked: boolean; onChange: () => void }> = ({ checked, onChange }) => (
  <label className="relative inline-flex cursor-pointer items-center">
    <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
    <div className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-slate-900 dark:bg-slate-700 dark:peer-checked:bg-orange-500" />
    <div className="absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
  </label>
);

const mapSettingsTab = (tab?: string): SettingsTab => {
  if (tab === 'profile' || tab === 'security' || tab === 'notifications' || tab === 'settings') return tab;
  return 'settings';
};

const SettingsPage: React.FC<SettingsPageProps> = ({
  onBack,
  candidate,
  onUpdateProfile,
  onOpenProfileRefine,
  onLogout,
  onDeleteAccount,
  initialTab = 'settings',
}) => {
  const { text } = useLanguage();
  const { isImpersonating } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>(mapSettingsTab(initialTab));
  const [isProfileVisible, setIsProfileVisible] = useState((candidate.profile_visibility ?? 'visible') !== 'private');
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ error: string; success: string }>({ error: '', success: '' });
  const [profileDraft, setProfileDraft] = useState<Partial<CandidateProfile>>(candidate);
  const [isProcessingCv, setIsProcessingCv] = useState(false);
  const [cvFeedback, setCvFeedback] = useState<{ error: string; success: string }>({ error: '', success: '' });
  const [currentCvRecord, setCurrentCvRecord] = useState<CandidateCvRecord | null>(null);
  const [isLoadingCvRecord, setIsLoadingCvRecord] = useState(false);
  const [isCvActionLoading, setIsCvActionLoading] = useState<'download' | 'delete' | null>(null);
  const [latestRefinementChat, setLatestRefinementChat] = useState<CandidateRefinementChat | null>(null);
  const [isLoadingRefinementChat, setIsLoadingRefinementChat] = useState(false);
  const [isRefinementChatOpen, setIsRefinementChatOpen] = useState(false);
  const [securityFeedback, setSecurityFeedback] = useState<{ error: string; success: string }>({ error: '', success: '' });
  const [passwordForm, setPasswordForm] = useState({
    nextPassword: '',
    confirmPassword: '',
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(candidate.terms_and_conditions_accepted ?? true);

  useEffect(() => {
    setActiveTab(mapSettingsTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    setProfileDraft(candidate);
  }, [candidate]);

  useEffect(() => {
    setIsProfileVisible((candidate.profile_visibility ?? 'visible') !== 'private');
  }, [candidate.profile_visibility]);

  useEffect(() => {
    setTermsAccepted(candidate.terms_and_conditions_accepted ?? true);
  }, [candidate.terms_and_conditions_accepted]);

  useEffect(() => {
    let isMounted = true;

    const loadCandidateAssets = async () => {
      setIsLoadingCvRecord(true);
      setIsLoadingRefinementChat(true);

      try {
        const [cvRecord, refinementChat] = await Promise.all([
          getCandidateCvRecord({ id: candidate.id, email: candidate.contacts?.email }),
          getLatestCandidateRefinementChat({ id: candidate.id, email: candidate.contacts?.email }),
        ]);

        if (!isMounted) return;
        setCurrentCvRecord(cvRecord);
        setLatestRefinementChat(refinementChat);
      } catch (error) {
        console.error('Failed to load seeker stored assets inside settings:', error);
        if (!isMounted) return;
        setCurrentCvRecord(null);
        setLatestRefinementChat(null);
      } finally {
        if (isMounted) {
          setIsLoadingCvRecord(false);
          setIsLoadingRefinementChat(false);
        }
      }
    };

    void loadCandidateAssets();

    return () => {
      isMounted = false;
    };
  }, [candidate.id, candidate.contacts?.email]);

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
    education: updatedProfile.education || candidate.education || [],
    experiences: updatedProfile.experiences || candidate.experiences || [],
    certifications: updatedProfile.certifications || candidate.certifications || [],
    languages: updatedProfile.languages || candidate.languages || [],
    industry_experience: updatedProfile.industry_experience || candidate.industry_experience || [],
    target_job_functions: updatedProfile.target_job_functions || candidate.target_job_functions || [],
    skills: updatedProfile.skills || candidate.skills || [],
    it_skills: updatedProfile.it_skills || candidate.it_skills || [],
    soft_skills: updatedProfile.soft_skills || candidate.soft_skills || [],
    summary_text: updatedProfile.summary_text ?? candidate.summary_text ?? '',
  });

  const persistCandidateUpdate = async (updatedProfile: Partial<CandidateProfile>, successMessage: string): Promise<boolean> => {
    setIsProfileSaving(true);
    setProfileFeedback({ error: '', success: '' });

    try {
      const nextProfile = buildCandidateForSave(updatedProfile);
      await addCandidate(nextProfile);
      onUpdateProfile(nextProfile);
      setProfileDraft(nextProfile);
      setProfileFeedback({ error: '', success: successMessage });
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return true;
    } catch (error: any) {
      console.error('Failed to save candidate profile from settings:', error);
      setProfileFeedback({
        error: error.message || text('Unable to save your profile right now.', 'Impossibile salvare il profilo in questo momento.'),
        success: '',
      });
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return false;
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleProfileSubmit = async (updatedProfile: Partial<CandidateProfile>, action: 'save' | 'refine') => {
    if (action === 'refine') {
      onOpenProfileRefine();
      return;
    }

    await persistCandidateUpdate(updatedProfile, text('Your profile has been updated inside settings.', 'Il tuo profilo è stato aggiornato nelle impostazioni.'));
  };

  const handleCvProfileAutofill = async (file: File) => {
    setIsProcessingCv(true);
    setCvFeedback({ error: '', success: '' });
    setProfileFeedback({ error: '', success: '' });

    try {
      const cvText = await readFileAsText(file);
      const info = await extractCvInfo(cvText);

      setProfileDraft((prev) => ({
        ...prev,
        ...info,
        id: prev.id,
        contacts: {
          ...prev.contacts,
          ...info.contacts,
          email: prev.contacts?.email || info.contacts?.email || '',
        },
        personal_info: {
          ...prev.personal_info,
          ...info.personal_info,
        },
        residence: {
          ...prev.residence,
          ...info.residence,
        },
        preferences: {
          ...prev.preferences,
          ...info.preferences,
          salary_eur: {
            ...prev.preferences?.salary_eur,
            ...info.preferences?.salary_eur,
          },
        },
      }));

      let storageErrorMessage = '';
      try {
        const savedCvRecord = await saveCandidateCv(buildCandidateForSave(info), file);
        setCurrentCvRecord(savedCvRecord);
      } catch (storageError: any) {
        console.error('Failed to persist seeker CV from settings:', storageError);
        storageErrorMessage = storageError?.message || text('The profile form was updated, but the CV could not be stored yet.', 'Il form profilo è stato aggiornato, ma il CV non è ancora stato salvato.');
      }

      setCvFeedback({
        error: storageErrorMessage,
        success: text(
          'CV analyzed successfully. The profile form has been updated with the extracted data.',
          'CV analizzato con successo. Il form profilo è stato aggiornato con i dati estratti.'
        ),
      });
    } catch (error: any) {
      console.error('Failed to autofill candidate profile from CV in settings:', error);
      setCvFeedback({
        error: error?.message || text('Unable to process the CV right now.', 'Impossibile elaborare il CV in questo momento.'),
        success: '',
      });
    } finally {
      setIsProcessingCv(false);
    }
  };

  const handleDownloadStoredCv = async () => {
    if (!currentCvRecord) return;

    setIsCvActionLoading('download');
    try {
      await downloadCandidateCv(currentCvRecord);
    } catch (error: any) {
      console.error('Failed to download stored candidate CV:', error);
      setCvFeedback({
        error: error?.message || text('Unable to download the stored CV right now.', 'Impossibile scaricare il CV salvato in questo momento.'),
        success: '',
      });
    } finally {
      setIsCvActionLoading(null);
    }
  };

  const handleDeleteStoredCv = async () => {
    if (!currentCvRecord) return;

    setIsCvActionLoading('delete');
    setCvFeedback({ error: '', success: '' });
    try {
      await deleteCandidateCvRecord(currentCvRecord);
      setCurrentCvRecord(null);
      setCvFeedback({
        error: '',
        success: text('Your stored CV has been removed from the platform.', 'Il CV salvato è stato rimosso dalla piattaforma.'),
      });
    } catch (error: any) {
      console.error('Failed to delete stored candidate CV:', error);
      setCvFeedback({
        error: error?.message || text('Unable to delete the stored CV right now.', 'Impossibile eliminare il CV salvato in questo momento.'),
        success: '',
      });
    } finally {
      setIsCvActionLoading(null);
    }
  };

  const handleDownloadData = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(candidate, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', `peaktalent_data_${candidate.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleTermsAcceptedToggle = async () => {
    const nextValue = !termsAccepted;
    const saved = await persistCandidateUpdate(
      { terms_and_conditions_accepted: nextValue },
      text('Your settings have been updated.', 'Le tue impostazioni sono state aggiornate.')
    );

    if (saved) {
      setTermsAccepted(nextValue);
    }
  };

  const handleProfileVisibilityToggle = async () => {
    const nextVisible = !isProfileVisible;
    const saved = await persistCandidateUpdate(
      { profile_visibility: nextVisible ? 'visible' : 'private' },
      nextVisible
        ? text('Your profile is now visible to recruiters in rankings and search.', 'Il tuo profilo è ora visibile ai recruiter nei ranking e nelle ricerche.')
        : text('Your profile is now hidden from recruiter rankings and search.', 'Il tuo profilo è ora nascosto dai ranking e dalle ricerche recruiter.')
    );

    if (saved) {
      setIsProfileVisible(nextVisible);
    }
  };

  const changePassword = async () => {
    if (isImpersonating) {
      setSecurityFeedback({
        error: text('Password changes are disabled while admin impersonation is active.', 'Il cambio password è disattivato durante l’impersonazione admin.'),
        success: '',
      });
      return;
    }

    if (!passwordForm.nextPassword || !passwordForm.confirmPassword) {
      setSecurityFeedback({
        error: text('Enter and confirm the new password first.', 'Inserisci e conferma prima la nuova password.'),
        success: '',
      });
      return;
    }

    if (passwordForm.nextPassword.length < 8) {
      setSecurityFeedback({
        error: text('The new password must be at least 8 characters long.', 'La nuova password deve contenere almeno 8 caratteri.'),
        success: '',
      });
      return;
    }

    if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
      setSecurityFeedback({
        error: text('The password confirmation does not match.', 'La conferma password non corrisponde.'),
        success: '',
      });
      return;
    }

    setIsSavingPassword(true);
    setSecurityFeedback({ error: '', success: '' });
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.nextPassword });
      if (error) throw error;

      setPasswordForm({ nextPassword: '', confirmPassword: '' });
      setSecurityFeedback({
        error: '',
        success: text('Your password has been changed successfully.', 'La tua password è stata aggiornata con successo.'),
      });
    } catch (error: any) {
      console.error('Failed to update seeker password:', error);
      setSecurityFeedback({
        error: error.message || text('Unable to change your password right now.', 'Impossibile cambiare la password in questo momento.'),
        success: '',
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleDeleteConfirm = () => {
    if (window.confirm(text('Are you sure you want to delete your account? This action cannot be undone and you will lose all your data.', 'Sei sicuro di voler eliminare il tuo account? Questa azione non può essere annullata e perderai tutti i tuoi dati.'))) {
      onDeleteAccount();
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-5 animate-fade-in">
            {profileFeedback.error && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                <span className="flex-1">{profileFeedback.error}</span>
                <button type="button" onClick={() => setProfileFeedback({ error: '', success: '' })} aria-label={text('Dismiss', 'Chiudi')} className="text-red-500 hover:text-red-700 dark:text-red-400">×</button>
              </div>
            )}

            {profileFeedback.success && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200" role="status" aria-live="polite">
                <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                <span className="flex-1">{profileFeedback.success}</span>
                <button type="button" onClick={() => setProfileFeedback({ error: '', success: '' })} aria-label={text('Dismiss', 'Chiudi')} className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400">×</button>
              </div>
            )}

            <SectionCard
              title={text('My Profile', 'Il mio profilo')}
              description={text('Manage your CV, profile details, and AI refinement access from one dedicated seeker profile space.', 'Gestisci CV, dettagli profilo e accesso al refinement AI da uno spazio candidato dedicato al profilo.')}
            >
              <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">{text('Autofill from CV', 'Autocompilazione da CV')}</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {text(
                        'Upload your CV here to extract data and prefill the whole profile form below.',
                        'Carica qui il tuo CV per estrarre i dati e precompilare tutto il form profilo qui sotto.'
                      )}
                    </p>
                  </div>
                  <label className={`inline-flex cursor-pointer items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white ${isProcessingCv ? 'pointer-events-none opacity-60' : ''}`}>
                    {isProcessingCv ? text('Processing...', 'Elaborazione...') : text('Upload CV', 'Carica CV')}
                    <input
                      type="file"
                      accept=".txt,.pdf,text/plain,application/pdf"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (file) {
                          void handleCvProfileAutofill(file);
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {text('Stored CV on your profile', 'CV salvato nel tuo profilo')}
                      </h4>
                      {isLoadingCvRecord ? (
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {text('Checking your latest uploaded CV...', 'Controllo del tuo ultimo CV caricato...')}
                        </p>
                      ) : currentCvRecord ? (
                        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          <p>{currentCvRecord.file_name}</p>
                          <p className="mt-1">
                            {text('Last update', 'Ultimo aggiornamento')}: {new Date(currentCvRecord.updated_at).toLocaleString()}
                            {typeof currentCvRecord.file_size === 'number' && currentCvRecord.file_size > 0
                              ? ` • ${(currentCvRecord.file_size / 1024 / 1024).toFixed(2)} MB`
                              : ''}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {text('No CV is currently stored on your platform profile.', 'Al momento non c’è alcun CV salvato nel tuo profilo piattaforma.')}
                        </p>
                      )}
                    </div>

                    {currentCvRecord && !isLoadingCvRecord && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDownloadStoredCv()}
                          disabled={isCvActionLoading !== null}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {isCvActionLoading === 'download' ? text('Preparing...', 'Preparazione...') : text('Download CV', 'Scarica CV')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteStoredCv()}
                          disabled={isCvActionLoading !== null}
                          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          {isCvActionLoading === 'delete' ? text('Removing...', 'Rimozione...') : text('Delete CV', 'Elimina CV')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {cvFeedback.error && (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    {cvFeedback.error}
                  </div>
                )}

                {cvFeedback.success && (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                    {cvFeedback.success}
                  </div>
                )}
              </div>

              <CandidateForm
                initialData={profileDraft}
                onSubmit={handleProfileSubmit}
                isSaving={isProfileSaving}
                saveLabel={text('Save Profile', 'Salva profilo')}
                refineLabel={text('Open AI Assistant', 'Apri assistente AI')}
                helperText={text('"Save Profile" keeps you here. "Open AI Assistant" takes you to the guided refinement workspace.', '"Salva profilo" ti lascia qui. "Apri assistente AI" ti porta nel flusso guidato di affinamento.')}
              />
            </SectionCard>
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-8 animate-fade-in">
            {profileFeedback.error && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                <span className="flex-1">{profileFeedback.error}</span>
                <button type="button" onClick={() => setProfileFeedback({ error: '', success: '' })} aria-label={text('Dismiss', 'Chiudi')} className="text-red-500 hover:text-red-700 dark:text-red-400">×</button>
              </div>
            )}

            {profileFeedback.success && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200" role="status" aria-live="polite">
                <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                <span className="flex-1">{profileFeedback.success}</span>
                <button type="button" onClick={() => setProfileFeedback({ error: '', success: '' })} aria-label={text('Dismiss', 'Chiudi')} className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400">×</button>
              </div>
            )}

            <SectionCard
              title={text('Settings', 'Impostazioni')}
              description={text('Control visibility, AI data usage, and matching preferences from one unified seeker settings area.', 'Controlla visibilità, uso dei dati AI e preferenze di matching da un’unica area impostazioni candidato.')}
            >
              <div className="space-y-8">
                <SectionCard
                  title={text('Privacy & Visibility', 'Privacy e visibilità')}
                  description={text('Control how discoverable your profile is while keeping the rest of your data safe inside your account.', 'Controlla quanto è visibile il tuo profilo mantenendo al sicuro il resto dei dati nel tuo account.')}
                >
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="flex items-center justify-between gap-6">
                      <div>
                        <h3 className="font-semibold text-slate-800 dark:text-slate-200">{text('Profile visibility', 'Visibilità profilo')}</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {text('When private, you stay saved in the system but recruiters will not see you in search.', 'Quando è privato, il tuo profilo resta nel sistema ma i recruiter non ti vedranno nelle ricerche.')}
                        </p>
                      </div>
                      <InlineToggle checked={isProfileVisible} onChange={() => void handleProfileVisibilityToggle()} />
                    </div>
                    <div className="mt-4 inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm dark:bg-slate-950 dark:text-slate-300">
                      {text('Status', 'Stato')}: {isProfileVisible ? text('Active', 'Attivo') : text('Hidden', 'Nascosto')}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title={text('AI & Data', 'AI e dati')}
                  description={text('Manage how your profile is used for matching, analytics, and data portability.', 'Gestisci come il tuo profilo viene usato per matching, analytics e portabilità dei dati.')}
                >
                  <div className="space-y-6">
                    <div>
                      <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-200">{text('Terms & Conditions', 'Termini e condizioni')}</h3>
                      <div className="space-y-4">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={termsAccepted}
                            onChange={() => void handleTermsAcceptedToggle()}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-600"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            <span className="font-medium">{text('Generic Terms & Conditions', 'Termini e condizioni generici')}</span>
                            <span className="mt-1 block text-xs text-slate-500">{text('This consent is stored on your profile and is accepted by default for the platform experience.', 'Questo consenso viene salvato sul tuo profilo ed è accettato di default per l’esperienza in piattaforma.')}</span>
                          </span>
                        </label>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
                      <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-200">{text('Your data', 'I tuoi dati')}</h3>
                      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                        <button onClick={handleDownloadData} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-900/80">
                          {text('Download My Profile Data', 'Scarica i dati del mio profilo')}
                        </button>
                        <button type="button" onClick={() => toast.info(text('Info page coming soon', 'Pagina informativa in arrivo'))} className="text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400">
                          {text('How AI and data policy works', 'Come funzionano AI e policy dati')}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
                      <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-200">{text('Latest AI refinement chat', 'Ultima chat di affinamento AI')}</h3>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/60">
                        {isLoadingRefinementChat ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {text('Loading the latest transcript...', 'Caricamento dell’ultima transcript...')}
                          </p>
                        ) : latestRefinementChat ? (
                          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                {text('Latest completed AI refinement', 'Ultimo affinamento AI completato')}
                              </p>
                              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {latestRefinementChat.transcript.length} {text('messages saved', 'messaggi salvati')} • {text('Completed on', 'Completata il')} {new Date(latestRefinementChat.completed_at || latestRefinementChat.updated_at).toLocaleString()}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsRefinementChatOpen(true)}
                              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                            >
                              {text('View transcript', 'Vedi transcript')}
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {text('No AI refinement chat has been saved yet for this profile.', 'Non è ancora stata salvata alcuna chat di affinamento AI per questo profilo.')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </SectionCard>

              </div>
            </SectionCard>
          </div>
        );

      case 'security':
        return (
          <SectionCard
            title={text('Security', 'Sicurezza')}
            description={text('Change your seeker password directly from here, just like the recruiter and admin workspaces already do.', 'Cambia la password candidato direttamente da qui, come già avviene negli spazi recruiter e admin.')}
          >
            <div className="grid max-w-2xl gap-5">
              {securityFeedback.error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  {securityFeedback.error}
                </div>
              )}
              {securityFeedback.success && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {securityFeedback.success}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">{text('New password', 'Nuova password')}</span>
                  <input
                    type="password"
                    value={passwordForm.nextPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, nextPassword: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">{text('Confirm password', 'Conferma password')}</span>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                {text('The new password is applied immediately to your authenticated seeker account.', 'La nuova password viene applicata subito al tuo account candidato autenticato.')}
              </div>

              <button
                type="button"
                onClick={changePassword}
                disabled={isSavingPassword}
                className="w-fit rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {isSavingPassword ? text('Saving...', 'Salvataggio...') : text('Change Password', 'Cambia password')}
              </button>
            </div>
          </SectionCard>
        );

      case 'notifications':
        return (
          <SectionCard
            title={text('Notifications', 'Notifiche')}
            description={text('This area is reserved for seeker notification preferences and in-app updates.', 'Questa area è riservata alle preferenze notifiche candidato e agli aggiornamenti in-app.')}
          >
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
              {text('Notification controls are not integrated yet for seeker accounts. This section will be activated in a future release.', 'I controlli notifiche non sono ancora integrati per gli account candidato. Questa sezione verrà attivata in una release futura.')}
            </div>
          </SectionCard>
        );

      default:
        return null;
    }
  };

  const NavButton = ({ icon, label, onClick, isActive = false, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; isActive?: boolean; danger?: boolean }) => (
    <button
      onClick={onClick}
      className={`w-full rounded-2xl px-3.5 py-3 text-left text-sm font-medium transition-colors ${
        isActive
          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          : danger
            ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      <span className="flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </span>
    </button>
  );

  return (
    <div className="mx-auto max-w-[1600px] animate-fade-in px-3 pb-20 pt-2.5 sm:px-8 lg:px-10">
      {isRefinementChatOpen && latestRefinementChat && (
        <RefinementChatModal
          chat={latestRefinementChat}
          candidateLabel={formatCandidateName(candidate) || candidate.contacts.email}
          onClose={() => setIsRefinementChatOpen(false)}
        />
      )}

      <div className="mb-5">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          {text('Back', 'Indietro')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
        <aside className="self-start lg:sticky lg:top-28">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <nav className="space-y-1">
              <NavButton icon={<UserIcon />} label={text('My Profile', 'Il mio profilo')} onClick={() => setActiveTab('profile')} isActive={activeTab === 'profile'} />
              <NavButton icon={<SettingsIcon />} label={text('Settings', 'Impostazioni')} onClick={() => setActiveTab('settings')} isActive={activeTab === 'settings'} />
              <NavButton icon={<LockIcon />} label={text('Security', 'Sicurezza')} onClick={() => setActiveTab('security')} isActive={activeTab === 'security'} />
              <NavButton icon={<BellIcon />} label={text('Notifications', 'Notifiche')} onClick={() => setActiveTab('notifications')} isActive={activeTab === 'notifications'} />

              <hr className="my-3 border-slate-200 dark:border-slate-800" />

              <NavButton icon={<LogoutIcon />} label={text('Log Out', 'Esci')} onClick={onLogout} />

              <hr className="my-3 border-slate-200 dark:border-slate-800" />

              <NavButton icon={<TrashIcon />} label={text('Cancel Profile', 'Elimina profilo')} onClick={handleDeleteConfirm} danger />
            </nav>
          </div>
        </aside>

        <main className="min-w-0">{renderContent()}</main>
      </div>
    </div>
  );
};

export default SettingsPage;
