
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { createNewUserAndRecruiterProfile, getRecruiter } from '../services/dbService';
import { User, RecruiterProfile } from '../types';
import { BLANK_RECRUITER_PROFILE } from '../constants';
import { supabase } from '../services/supabaseClient';
import { useLanguage } from './LanguageProvider';
import { useAuth } from './AuthProvider';
import { getFriendlyAuthError } from '../services/authError';
import { buildRecruiterAccessRequestHref } from '../services/accessLinks';
import { getFriendlyPasskeyError, isPasskeySupported, listPasskeys, signInWithPasskey } from '../services/passkeyService';
import {
  clearPendingPasskeySecondFactor,
  clearPasskeySecondFactorState,
  markPasskeySecondFactorChallenge,
  markPasskeySecondFactorChecking,
  markPasskeySecondFactorSatisfied,
} from '../services/passkeySecondFactorService';

const PASSWORD_RESET_SUPPORT_EMAIL = 'help@peaktalent.it';
const PASSWORD_RESET_SUPPORT_SUBJECT = 'Password reset request / Richiesta reset password';
const PASSWORD_RESET_SUPPORT_BODY = [
  'IT',
  'Ho dimenticato la mia password.',
  'Email account: ',
  '',
  'La mail da cui mando questa richiesta deve essere la stessa dell’account per il quale viene richiesto il reset della password, per ragioni di sicurezza.',
  '',
  'EN',
  'I forgot my password.',
  'Account email: ',
  '',
  'For security reasons, the email address used to send this request must match the account for which the password reset is being requested.',
].join('\n');

interface RecruiterAuthProps {
  onAuthSuccess: (type: 'signin' | 'signup', profile: RecruiterProfile) => void | Promise<void>;
}

const RecruiterAuth: React.FC<RecruiterAuthProps> = ({ onAuthSuccess }) => {
  const { text } = useLanguage();
  const { refreshProfile } = useAuth();
  const location = useLocation();

  // Prefetch the recruiter dashboard chunk while the user is on the auth screen
  // so navigation post-login feels instant.
  useEffect(() => {
    void import('./RecruiterHomePage');
    void import('./RecruiterFlow');
  }, []);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [pendingPasskeyUser, setPendingPasskeyUser] = useState<{
    id: string;
    email: string;
    passkeyCount: number;
  } | null>(null);
  const [isPasskeyChallengeLoading, setIsPasskeyChallengeLoading] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const requestedMode = location.state?.mode || searchParams.get('mode');
    setIsSignUp(requestedMode === 'signup');
    setError('');
  }, [location.state, location.search]);

  const completeRecruiterLogin = async (
    authUser: { id: string; email?: string | null },
    fallbackEmail: string
  ) => {
    const accountEmail = authUser.email || fallbackEmail;

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();
    if (profile && profile.role !== 'recruiter') {
      await supabase.auth.signOut();
      setError(text('This email is registered as a Job Seeker. Please switch modes.', 'Questa email è registrata come candidato. Cambia modalità di accesso.'));
      return;
    }

    const recruiterProfile = await getRecruiter(authUser.id);
    if (!recruiterProfile) {
      console.log('Recruiter profile missing. Auto-creating...');
      const newUser: User = { email: accountEmail, password: '', profileId: authUser.id, role: 'recruiter' };
      const newRecruiter = {
        id: authUser.id,
        email: accountEmail,
        ...BLANK_RECRUITER_PROFILE
      } as RecruiterProfile;

      try {
        await createNewUserAndRecruiterProfile(newUser, newRecruiter);
        await refreshProfile();
        await onAuthSuccess('signup', newRecruiter);
        return;
      } catch (createErr: any) {
        console.error('Failed to auto-create recruiter profile:', createErr);
        setError(text('Could not find or create recruiter profile.', 'Impossibile trovare o creare il profilo recruiter.'));
        return;
      }
    }

    await refreshProfile();
    await onAuthSuccess('signin', recruiterProfile);
  };

  const preparePasskeySecondFactor = async (
    authUser: { id: string; email?: string | null },
    fallbackEmail: string
  ) => {
    const { data: passkeys, error: passkeyError } = await listPasskeys();
    if (passkeyError) throw passkeyError;

    const passkeyCount = passkeys?.length || 0;
    if (passkeyCount === 0) {
      clearPendingPasskeySecondFactor();
      return false;
    }

    if (!isPasskeySupported()) {
      await supabase.auth.signOut({ scope: 'local' });
      clearPasskeySecondFactorState();
      setError(
        text(
          'This account requires passkey verification, but this browser or connection does not support passkeys.',
          'Questo account richiede la verifica con passkey, ma questo browser o questa connessione non supporta le passkey.'
        )
      );
      return true;
    }

    const accountEmail = authUser.email || fallbackEmail;
    markPasskeySecondFactorChallenge({
      userId: authUser.id,
      email: accountEmail,
      passkeyCount,
    });
    setPendingPasskeyUser({
      id: authUser.id,
      email: accountEmail,
      passkeyCount,
    });
    setPassword('');
    setShowRecoveryForm(false);
    return true;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(text('Please fill in all fields.', 'Compila tutti i campi.'));
      return;
    }
    setError('');
    setIsLoading(true);
    markPasskeySecondFactorChecking(email.trim().toLowerCase());

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      if (!data.user) throw new Error("No user found");

      const needsPasskey = await preparePasskeySecondFactor(data.user, email);
      if (needsPasskey) return;

      await completeRecruiterLogin(data.user, email);

    } catch (err: any) {
      clearPasskeySecondFactorState();
      await supabase.auth.signOut({ scope: 'local' }).catch((signOutError) => {
        console.warn('Failed to clear local session after recruiter sign-in error:', signOutError);
      });
      const errorMessage = String(err?.message || '').toLowerCase();
      const isPasskeyCheckError = errorMessage.includes('passkey') || errorMessage.includes('webauthn');
      setError(
        isPasskeyCheckError
          ? getFriendlyPasskeyError(err, text, text('Unable to verify passkey status for this account.', 'Impossibile verificare lo stato passkey di questo account.'))
          : getFriendlyAuthError(err, text, text('An error occurred during sign in.', 'Si è verificato un errore durante l’accesso.'))
      );
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskeySecondFactorConfirm = async () => {
    if (!pendingPasskeyUser) return;

    setError('');
    setIsPasskeyChallengeLoading(true);

    try {
      if (!isPasskeySupported()) {
        setError(
          text(
            'This browser or connection does not support passkeys. Use a modern browser on HTTPS or localhost.',
            'Questo browser o questa connessione non supporta le passkey. Usa un browser moderno su HTTPS o localhost.'
          )
        );
        return;
      }

      const { data, error } = await signInWithPasskey();
      if (error) throw error;
      if (!data?.user) throw new Error('No user found');

      if (data.user.id !== pendingPasskeyUser.id) {
        await supabase.auth.signOut({ scope: 'local' });
        clearPasskeySecondFactorState();
        setPendingPasskeyUser(null);
        setError(
          text(
            'The selected passkey belongs to a different account. Please sign in again with the correct email and passkey.',
            'La passkey selezionata appartiene a un account diverso. Accedi di nuovo con email e passkey corrette.'
          )
        );
        return;
      }

      markPasskeySecondFactorSatisfied(data.user.id);
      clearPendingPasskeySecondFactor();
      setPendingPasskeyUser(null);
      await completeRecruiterLogin(data.user, pendingPasskeyUser.email);
    } catch (err: any) {
      setError(getFriendlyPasskeyError(err, text, text('An error occurred during passkey verification.', 'Si è verificato un errore durante la verifica con passkey.')));
      console.error(err);
    } finally {
      setIsPasskeyChallengeLoading(false);
    }
  };

  const handleCancelPasskeySecondFactor = async () => {
    setIsLoading(true);
    setError('');
    try {
      setPendingPasskeyUser(null);
      clearPasskeySecondFactorState();
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.error('Failed to cancel passkey second-factor sign in:', error);
    } finally {
      setPassword('');
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      setError(text('Please fill in all fields.', 'Compila tutti i campi.'));
      return;
    }
    if (password !== confirmPassword) {
      setError(text('Passwords do not match.', 'Le password non corrispondono.'));
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error("Signup failed");

      if (data.user && !data.session) {
        setError(text("Account created! Please check your email to confirm. (Dev Note: If emails are not set up, verify the user manually in your Supabase Dashboard).", "Account creato. Controlla la tua email per confermare. Se le email non sono configurate, verifica manualmente l’utente nella dashboard Supabase."));
        setIsLoading(false);
        return;
      }

      const recruiterId = data.user.id;
      const newUser: User = { email, password, profileId: recruiterId, role: 'recruiter' };

      const newRecruiter = {
        id: recruiterId,
        email,
        ...BLANK_RECRUITER_PROFILE
      } as RecruiterProfile;

      await createNewUserAndRecruiterProfile(newUser, newRecruiter);
      await refreshProfile();

      setIsLoading(false);
      await onAuthSuccess('signup', newRecruiter);
    } catch (err: any) {
      setError(getFriendlyAuthError(err, text, text('An error occurred during sign up.', 'Si è verificato un errore durante la registrazione.')));
      console.error(err);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-10.5rem)] px-4 py-4 sm:px-8 lg:px-10">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-slate-800/50 p-8 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
          <h2 className="text-3xl font-bold text-center text-slate-800 dark:text-slate-100 mb-2">
            {isSignUp ? text('Recruiter Access Request', 'Richiesta accesso recruiter') : text('Recruiter Sign In', 'Accesso recruiter')}
          </h2>
          <p className="text-center text-slate-500 dark:text-slate-400 mb-8">
            {isSignUp ? text('Tell us about your company and we will activate the recruiter workspace for you.', 'Raccontaci la tua azienda e attiveremo per te lo spazio recruiter.') : text('Sign in to manage your job postings.', 'Accedi per gestire i tuoi job posting.')}
          </p>

          {error && <p className="text-red-500 text-center mb-4 text-sm">{error}</p>}
          {isSignUp ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-sm text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-300">
                {text(
                  'Recruiter access is activated directly by PeakTalent so we can prepare the right workspace and company setup for you.',
                  'L’accesso recruiter viene attivato direttamente da PeakTalent così possiamo preparare per te lo spazio giusto e il setup aziendale corretto.'
                )}
              </div>
              <a
                href={buildRecruiterAccessRequestHref()}
                className="inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all duration-300 hover:shadow-lg"
              >
                {text('Contact PeakTalent', 'Contattaci')}
              </a>
            </div>
          ) : pendingPasskeyUser ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-sm text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-300">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {text('Additional security step', 'Step di sicurezza aggiuntivo')}
                </p>
                <p className="mt-2 leading-relaxed">
                  {text(
                    'This recruiter account has a passkey enabled. Confirm it to complete sign in.',
                    'Questo account recruiter ha una passkey abilitata. Confermala per completare l’accesso.'
                  )}
                </p>
                <p className="mt-2 text-xs font-semibold text-orange-800 dark:text-orange-200">
                  {pendingPasskeyUser.email}
                </p>
              </div>

              <button
                type="button"
                onClick={handlePasskeySecondFactorConfirm}
                disabled={isPasskeyChallengeLoading}
                className="w-full rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-2 font-semibold text-white shadow-md transition-colors hover:from-orange-600 hover:to-amber-600 disabled:opacity-50"
              >
                {isPasskeyChallengeLoading ? text('Verifying passkey...', 'Verifica passkey...') : text('Confirm with passkey', 'Conferma con passkey')}
              </button>

              <button
                type="button"
                onClick={() => void handleCancelPasskeySecondFactor()}
                disabled={isPasskeyChallengeLoading || isLoading}
                className="w-full rounded-lg border border-slate-300 bg-white px-6 py-2 font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                {text('Use another account', 'Usa un altro account')}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSignIn} autoComplete="on" name="login" className="space-y-6">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{text('Email address', 'Indirizzo email')}</label>
                <input id="username" name="username" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)}
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Email address"
                  className="mt-1 block w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{text('Password', 'Password')}</label>
                <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}
                  aria-label="Password"
                  className="mt-1 block w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowRecoveryForm((current) => !current);
                  }}
                  className="text-sm font-medium text-orange-600 transition-colors hover:text-orange-700"
                >
                  {text('Forgot password?', 'Password dimenticata?')}
                </button>
              </div>
              {showRecoveryForm && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    {text('Password recovery support', 'Supporto recupero password')}
                  </p>
                  <p className="mt-2 leading-relaxed">
                    {text(
                      'To reset your recruiter password, please contact PeakTalent support directly at the email address below.',
                      'Per resettare la password recruiter, contatta direttamente il supporto PeakTalent all’indirizzo qui sotto.'
                    )}
                  </p>
                  <a
                    href={`mailto:${PASSWORD_RESET_SUPPORT_EMAIL}?subject=${encodeURIComponent(PASSWORD_RESET_SUPPORT_SUBJECT)}&body=${encodeURIComponent(PASSWORD_RESET_SUPPORT_BODY)}`}
                    className="mt-3 inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    {PASSWORD_RESET_SUPPORT_EMAIL}
                  </a>
                </div>
              )}
              <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:shadow-lg transform transition-all duration-300 disabled:opacity-50">
                {isLoading ? text('Signing In...', 'Accesso in corso...') : text('Sign In', 'Accedi')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecruiterAuth;
