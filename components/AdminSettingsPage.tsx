import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { updateSystemAdminProfile } from '../services/adminService';
import { useAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';

const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>;
const LockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2V7a3 3 0 00-6 0v2h6z" clipRule="evenodd" /></svg>;
const LogoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V5h10a1 1 0 100-2H3zm12.293 4.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L17.586 12H10a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;

export type AdminSettingsTab = 'profile' | 'security';

interface AdminSettingsPageProps {
  onBack: () => void;
  onLogout: () => void;
  initialTab?: AdminSettingsTab;
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

const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({
  onBack,
  onLogout,
  initialTab = 'profile',
}) => {
  const { text } = useLanguage();
  const { user, profileName, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminSettingsTab>(initialTab);
  const [fullName, setFullName] = useState(profileName || text('System Administrator', 'Amministratore di sistema'));
  const [profileFeedback, setProfileFeedback] = useState<{ error: string; success: string }>({ error: '', success: '' });
  const [securityFeedback, setSecurityFeedback] = useState<{ error: string; success: string }>({ error: '', success: '' });
  const [passwordForm, setPasswordForm] = useState({
    nextPassword: '',
    confirmPassword: '',
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setFullName(profileName || text('System Administrator', 'Amministratore di sistema'));
  }, [profileName, text]);

  const saveProfile = async () => {
    if (!user?.id || !user.email) {
      setProfileFeedback({
        error: text('Admin session not available. Please sign in again.', 'Sessione admin non disponibile. Accedi di nuovo.'),
        success: '',
      });
      return;
    }

    setIsSavingProfile(true);
    setProfileFeedback({ error: '', success: '' });
    try {
      await updateSystemAdminProfile(user.id, {
        email: user.email,
        fullName,
      });
      await refreshProfile();
      setProfileFeedback({
        error: '',
        success: text('Your admin profile has been updated.', 'Il tuo profilo admin è stato aggiornato.'),
      });
    } catch (error: any) {
      console.error('Failed to update admin profile:', error);
      setProfileFeedback({
        error: error.message || text('Unable to update your admin profile right now.', 'Impossibile aggiornare il profilo admin in questo momento.'),
        success: '',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const changePassword = async () => {
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
      console.error('Failed to update admin password:', error);
      setSecurityFeedback({
        error: error.message || text('Unable to change your password right now.', 'Impossibile cambiare la password in questo momento.'),
        success: '',
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const renderContent = () => {
    if (activeTab === 'profile') {
      return (
        <SectionCard
          title={text('Admin Profile', 'Profilo admin')}
          description={text('Keep your administrator identity accurate so the console header and audit-facing details stay consistent.', 'Mantieni corretta la tua identità amministratore così header console e dettagli di audit restano coerenti.')}
        >
          <div className="max-w-2xl space-y-5">
            {profileFeedback.error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                {profileFeedback.error}
              </div>
            )}
            {profileFeedback.success && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                {profileFeedback.success}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">{text('Full name', 'Nome completo')}</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">{text('Authentication email', 'Email di autenticazione')}</span>
                <input
                  type="email"
                  value={user?.email || ''}
                  readOnly
                  className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
              {text('The email shown here is your authenticated Supabase account. This screen focuses on your admin display profile and password management.', 'L’email mostrata qui è il tuo account Supabase autenticato. Questa schermata è dedicata al profilo admin visibile e alla gestione password.')}
            </div>

            <button
              type="button"
              onClick={saveProfile}
              disabled={isSavingProfile}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {isSavingProfile ? text('Saving...', 'Salvataggio...') : text('Save Profile', 'Salva profilo')}
            </button>
          </div>
        </SectionCard>
      );
    }

    return (
      <SectionCard
        title={text('Security', 'Sicurezza')}
        description={text('Change your administrator password directly from here without leaving the admin workspace.', 'Cambia la password amministratore direttamente da qui senza uscire dallo spazio admin.')}
      >
        <div className="max-w-2xl space-y-5">
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
            {text('Password changes are applied to your live authenticated admin account immediately.', 'Le modifiche password vengono applicate subito al tuo account admin autenticato.')}
          </div>

          <button
            type="button"
            onClick={changePassword}
            disabled={isSavingPassword}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {isSavingPassword ? text('Updating password...', 'Aggiornamento password...') : text('Change Password', 'Cambia password')}
          </button>
        </div>
      </SectionCard>
    );
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
    <div className="mx-auto max-w-[1600px] animate-fade-in px-4 pb-20 pt-2.5 sm:px-8 lg:px-10">
      <div className="mb-6 border-b border-slate-200 pb-5 dark:border-slate-800">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          {text('Back', 'Indietro')}
        </button>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{text('Admin Settings', 'Impostazioni admin')}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {text('Manage your admin identity and security without leaving the same console experience.', 'Gestisci identità e sicurezza admin senza uscire dalla stessa esperienza console.')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="self-start lg:sticky lg:top-28">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <nav className="space-y-1">
              <NavButton icon={<UserIcon />} label={text('Profile', 'Profilo')} onClick={() => setActiveTab('profile')} isActive={activeTab === 'profile'} />
              <NavButton icon={<LockIcon />} label={text('Security', 'Sicurezza')} onClick={() => setActiveTab('security')} isActive={activeTab === 'security'} />

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

export default AdminSettingsPage;
