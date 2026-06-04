import React, { useEffect, useState } from 'react';
import {
  deletePasskey,
  getFriendlyPasskeyError,
  isPasskeySupported,
  listPasskeys,
  PasskeyRecord,
  registerPasskey,
} from '../services/passkeyService';
import { useLanguage } from './LanguageProvider';
import { supabase } from '../services/supabaseClient';
import { markPasskeySecondFactorSatisfied } from '../services/passkeySecondFactorService';

interface PasskeySecurityPanelProps {
  disabled?: boolean;
  disabledReason?: string;
}

const KeyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L7.414 16.586A2 2 0 016 17.172H4.5A1.5 1.5 0 013 15.672v-1.5a2 2 0 01.586-1.414l2.843-2.843A6 6 0 1118 8zm-6-2a2 2 0 100 4 2 2 0 000-4z" clipRule="evenodd" />
  </svg>
);

const formatDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const PasskeySecurityPanel: React.FC<PasskeySecurityPanelProps> = ({ disabled = false, disabledReason }) => {
  const { text } = useLanguage();
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState('');
  const [feedback, setFeedback] = useState<{ error: string; success: string }>({ error: '', success: '' });
  const browserSupported = isPasskeySupported();

  const loadPasskeys = async () => {
    if (disabled) return;
    setIsLoading(true);
    setFeedback((current) => ({ ...current, error: '' }));
    try {
      const { data, error } = await listPasskeys();
      if (error) throw error;
      setPasskeys((data || []) as PasskeyRecord[]);
    } catch (error) {
      console.error('Failed to load passkeys:', error);
      setFeedback({
        error: getFriendlyPasskeyError(error, text, text('Unable to load passkeys right now.', 'Impossibile caricare le passkey in questo momento.')),
        success: '',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (disabled) return;
    if (!browserSupported) {
      setFeedback({
        error: text(
          'This browser or connection does not support passkeys. Use a modern browser on HTTPS or localhost.',
          'Questo browser o questa connessione non supporta le passkey. Usa un browser moderno su HTTPS o localhost.'
        ),
        success: '',
      });
      return;
    }
    void loadPasskeys();
  }, [browserSupported, disabled]);

  const handleCreate = async () => {
    if (disabled) {
      setFeedback({ error: disabledReason || text('Passkey management is disabled right now.', 'La gestione passkey è disattivata in questo momento.'), success: '' });
      return;
    }

    if (!browserSupported) {
      setFeedback({
        error: text(
          'This browser or connection does not support passkeys. Use a modern browser on HTTPS or localhost.',
          'Questo browser o questa connessione non supporta le passkey. Usa un browser moderno su HTTPS o localhost.'
        ),
        success: '',
      });
      return;
    }

    setIsCreating(true);
    setFeedback({ error: '', success: '' });
    try {
      const { error } = await registerPasskey();
      if (error) throw error;
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user?.id) {
        markPasskeySecondFactorSatisfied(userData.user.id);
      }
      setFeedback({
        error: '',
        success: text('Passkey created successfully.', 'Passkey creata correttamente.'),
      });
      await loadPasskeys();
    } catch (error) {
      console.error('Failed to create passkey:', error);
      setFeedback({
        error: getFriendlyPasskeyError(error, text),
        success: '',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (passkeyId: string) => {
    setDeletingId(passkeyId);
    setFeedback({ error: '', success: '' });
    try {
      const { error } = await deletePasskey(passkeyId);
      if (error) throw error;
      setPendingDeleteId('');
      setFeedback({
        error: '',
        success: text('Passkey removed successfully.', 'Passkey rimossa correttamente.'),
      });
      await loadPasskeys();
    } catch (error) {
      console.error('Failed to delete passkey:', error);
      setFeedback({
        error: getFriendlyPasskeyError(error, text, text('Unable to remove this passkey right now.', 'Impossibile rimuovere questa passkey in questo momento.')),
        success: '',
      });
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300">
              <KeyIcon />
            </span>
            {text('Passkey', 'Passkey')}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {text(
              'Create a passkey to sign in with Face ID, Touch ID, Windows Hello or a security key. Your device protects the credential, reducing password theft risk.',
              'Crea una passkey per accedere con Face ID, Touch ID, Windows Hello o una chiave di sicurezza. Il dispositivo protegge la credenziale e riduce il rischio di furto password.'
            )}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
            {text(
              'PeakTalent will ask for this passkey after password sign-in whenever this account has at least one registered passkey.',
              'PeakTalent chiederà questa passkey dopo il login con password ogni volta che questo account ha almeno una passkey registrata.'
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={disabled || !browserSupported || isCreating}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {isCreating ? text('Creating...', 'Creazione...') : text('Create passkey', 'Crea passkey')}
        </button>
      </div>

      {disabled && disabledReason && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
          {disabledReason}
        </div>
      )}

      {feedback.error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {feedback.error}
        </div>
      )}
      {feedback.success && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          {feedback.success}
        </div>
      )}

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            {text('Registered passkeys', 'Passkey registrate')}
          </p>
          <button
            type="button"
            onClick={() => void loadPasskeys()}
            disabled={disabled || isLoading}
            className="text-xs font-semibold text-slate-500 transition-colors hover:text-orange-600 disabled:opacity-50 dark:text-slate-400 dark:hover:text-orange-300"
          >
            {isLoading ? text('Loading...', 'Caricamento...') : text('Refresh', 'Aggiorna')}
          </button>
        </div>

        {passkeys.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {isLoading ? text('Loading passkeys...', 'Caricamento passkey...') : text('No passkey has been created yet.', 'Non è stata ancora creata nessuna passkey.')}
          </div>
        ) : (
          passkeys.map((passkey) => (
            <div key={passkey.id} className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {passkey.friendly_name || text('PeakTalent passkey', 'Passkey PeakTalent')}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {text('Created', 'Creata')} {formatDate(passkey.created_at)}
                    {passkey.last_used_at ? ` • ${text('Last used', 'Ultimo uso')} ${formatDate(passkey.last_used_at)}` : ''}
                  </p>
                </div>

                {pendingDeleteId === passkey.id ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId('')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      {text('Cancel', 'Annulla')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(passkey.id)}
                      disabled={deletingId === passkey.id}
                      className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                    >
                      {deletingId === passkey.id ? text('Removing...', 'Rimozione...') : text('Confirm removal', 'Conferma rimozione')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(passkey.id)}
                    disabled={disabled}
                    className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/20"
                  >
                    {text('Remove', 'Rimuovi')}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PasskeySecurityPanel;
