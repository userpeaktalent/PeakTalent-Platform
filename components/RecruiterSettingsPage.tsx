import React, { useEffect, useState } from 'react';
import { RecruiterProfile } from '../types';
import RecruiterProfileSetup from './RecruiterProfileSetup';
import { useLanguage } from './LanguageProvider';
import { supabase } from '../services/supabaseClient';
import { addRecruiter } from '../services/dbService';
import { useAuth } from './AuthProvider';

const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>;
const BellIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>;
const LockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2V7a3 3 0 00-6 0v2h6z" clipRule="evenodd" /></svg>;
const OfficeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 00-1 1v1H6a2 2 0 00-2 2v11a1 1 0 102 0v-1h8v1a1 1 0 102 0V6a2 2 0 00-2-2h-3V3a1 1 0 00-1-1zM8 7h1v2H8V7zm3 0h1v2h-1V7zM8 11h1v2H8v-2zm3 0h1v2h-1v-2z" /></svg>;
const LogoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V5h10a1 1 0 100-2H3zm12.293 4.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L17.586 12H10a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;

export type RecruiterSettingsTab = 'profile' | 'notifications' | 'security' | 'company';

interface RecruiterSettingsPageProps {
  recruiter: RecruiterProfile;
  onUpdateProfile: (profile: RecruiterProfile) => void;
  onBack: () => void;
  onLogout: () => void;
  initialTab?: RecruiterSettingsTab;
  requirePasswordChange?: boolean;
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

const RecruiterSettingsPage: React.FC<RecruiterSettingsPageProps> = ({
  recruiter,
  onUpdateProfile,
  onBack,
  onLogout,
  initialTab = 'profile',
  requirePasswordChange = false,
}) => {
  const { text } = useLanguage();
  const { isImpersonating } = useAuth();
  const [activeTab, setActiveTab] = useState<RecruiterSettingsTab>(initialTab);
  const [companyVisible, setCompanyVisible] = useState(recruiter.company_visibility ?? true);
  const [isSavingCompanyVisibility, setIsSavingCompanyVisibility] = useState(false);
  const [companyFeedback, setCompanyFeedback] = useState<{ error: string; success: string }>({ error: '', success: '' });
  const [securityFeedback, setSecurityFeedback] = useState<{ error: string; success: string }>({ error: '', success: '' });
  const [passwordForm, setPasswordForm] = useState({
    nextPassword: '',
    confirmPassword: '',
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    setActiveTab(requirePasswordChange ? 'security' : initialTab);
  }, [initialTab, requirePasswordChange]);

  useEffect(() => {
    setCompanyVisible(recruiter.company_visibility ?? true);
  }, [recruiter.company_visibility]);

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

      let nextRecruiter = recruiter;
      if (recruiter.must_change_password) {
        nextRecruiter = { ...recruiter, must_change_password: false };
        await addRecruiter(nextRecruiter);
        onUpdateProfile(nextRecruiter);
      }

      setPasswordForm({ nextPassword: '', confirmPassword: '' });
      setSecurityFeedback({
        error: '',
        success: text('Your password has been changed successfully.', 'La tua password è stata aggiornata con successo.'),
      });
    } catch (error: any) {
      console.error('Failed to update recruiter password:', error);
      setSecurityFeedback({
        error: error.message || text('Unable to change your password right now.', 'Impossibile cambiare la password in questo momento.'),
        success: '',
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <SectionCard
            title={text('Company Profile', 'Profilo azienda')}
            description={text('Keep your recruiter identity and company details in the same settings experience, without bouncing to a separate screen.', 'Mantieni identità recruiter e dettagli azienda nella stessa esperienza impostazioni, senza passare a schermate separate.')}
          >
            <RecruiterProfileSetup
              recruiter={recruiter}
              isEditing
              embedded
              saveLabel={text('Save Company Profile', 'Salva profilo azienda')}
              onProfileComplete={onUpdateProfile}
            />
          </SectionCard>
        );

      case 'notifications':
        return (
          <SectionCard
            title={text('Notifications', 'Notifiche')}
            description={text('This area is reserved for recruiter alerts and communication settings.', 'Quest’area è riservata agli avvisi recruiter e alle impostazioni di comunicazione.')}
          >
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
              {text(
                'The recruiter notifications center is not available yet. We will integrate this function in a future update.',
                'La funzione notifiche per recruiter non è ancora disponibile. Verrà integrata in un aggiornamento futuro.'
              )}
            </div>
          </SectionCard>
        );

      case 'security':
        return (
          <SectionCard
            title={text('Security', 'Sicurezza')}
            description={text('Change your recruiter password directly from here. Temporary-password accounts land here first so they can secure access immediately.', 'Cambia la password recruiter direttamente da qui. Gli account con password temporanea arrivano qui per mettere subito in sicurezza l’accesso.')}
          >
            <div className="grid max-w-2xl gap-5">
              {requirePasswordChange && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                  {text('This recruiter account was invited with a temporary password. Please set a personal password now before continuing.', 'Questo account recruiter è stato invitato con una password temporanea. Imposta ora una password personale prima di continuare.')}
                </div>
              )}

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
                {text('Password changes are applied immediately to the authenticated recruiter account.', 'Le modifiche password vengono applicate subito all’account recruiter autenticato.')}
              </div>

              <button
                type="button"
                onClick={changePassword}
                disabled={isSavingPassword}
                className="w-fit rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {isSavingPassword ? text('Updating password...', 'Aggiornamento password...') : text('Change Password', 'Cambia password')}
              </button>
            </div>
          </SectionCard>
        );

      case 'company':
        return (
          <SectionCard
            title={text('Company Presence', 'Presenza azienda')}
            description={text('Control whether your current job postings are visible to seekers across the platform.', 'Controlla se i job posting attivi della tua azienda sono visibili ai seeker in tutta la piattaforma.')}
          >
            <div className="space-y-4">
              {companyFeedback.error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  {companyFeedback.error}
                </div>
              )}
              {companyFeedback.success && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {companyFeedback.success}
                </div>
              )}
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                <div>
                  <h3 className="font-medium text-slate-800 dark:text-slate-200">{text('Show recruiter jobs to seekers', 'Mostra i lavori recruiter ai candidati')}</h3>
                  <p className="text-xs text-slate-500">
                    {text(
                      'If disabled, all job postings from this recruiter are hidden from seeker dashboards, job boards, and direct seeker views.',
                      'Se disattivato, tutti i lavori di questo recruiter vengono nascosti da dashboard candidati, bacheca lavori e viste dirette.'
                    )}
                  </p>
                </div>
                <InlineToggle
                  checked={companyVisible}
                  onChange={async () => {
                    const nextVisible = !companyVisible;
                    const nextRecruiter = { ...recruiter, company_visibility: nextVisible };

                    setCompanyVisible(nextVisible);
                    setIsSavingCompanyVisibility(true);
                    setCompanyFeedback({ error: '', success: '' });

                    try {
                      await addRecruiter(nextRecruiter);
                      onUpdateProfile(nextRecruiter);
                      setCompanyFeedback({
                        error: '',
                        success: nextVisible
                          ? text('Your job postings are visible to seekers again.', 'I tuoi lavori sono di nuovo visibili ai candidati.')
                          : text('Your job postings are now hidden from seekers.', 'I tuoi lavori ora sono nascosti ai candidati.'),
                      });
                    } catch (error: any) {
                      console.error('Failed to update recruiter company visibility:', error);
                      setCompanyVisible(!nextVisible);
                      setCompanyFeedback({
                        error: error?.message || text('Unable to update recruiter job visibility right now.', 'Impossibile aggiornare la visibilità dei lavori recruiter in questo momento.'),
                        success: '',
                      });
                    } finally {
                      setIsSavingCompanyVisibility(false);
                    }
                  }}
                />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                {text('Current company', 'Azienda attuale')}: <span className="font-semibold text-slate-800 dark:text-slate-200">{recruiter.company_name || text('Not set yet', 'Non impostata')}</span>
              </div>
              {isSavingCompanyVisibility && (
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {text('Updating recruiter visibility across active job postings...', 'Aggiornamento della visibilità recruiter su tutti i job posting attivi...')}
                </div>
              )}
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
              <NavButton icon={<UserIcon />} label={text('Company Profile', 'Profilo azienda')} onClick={() => setActiveTab('profile')} isActive={activeTab === 'profile'} />
              <NavButton icon={<BellIcon />} label={text('Notifications', 'Notifiche')} onClick={() => setActiveTab('notifications')} isActive={activeTab === 'notifications'} />
              <NavButton icon={<LockIcon />} label={text('Security', 'Sicurezza')} onClick={() => setActiveTab('security')} isActive={activeTab === 'security'} />
              <NavButton icon={<OfficeIcon />} label={text('Company Presence', 'Presenza azienda')} onClick={() => setActiveTab('company')} isActive={activeTab === 'company'} />

              <hr className="my-3 border-slate-200 dark:border-slate-800" />

              <NavButton icon={<LogoutIcon />} label={text('Log Out', 'Esci')} onClick={onLogout} danger />
            </nav>
          </div>
        </aside>

        <main className="min-w-0">{renderContent()}</main>
      </div>
    </div>
  );
};

export default RecruiterSettingsPage;
