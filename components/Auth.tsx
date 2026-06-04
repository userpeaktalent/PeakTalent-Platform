
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  createNewUserAndCandidateProfile,
  createNewUserAndRecruiterProfile,
  getCandidate,
  getJobById,
  getRecruiter,
  isEmailInvitedToJob,
} from '../services/dbService';
import { User, CandidateProfile, RecruiterProfile } from '../types';
import { BLANK_CANDIDATE_PROFILE, BLANK_RECRUITER_PROFILE } from '../constants';
import { supabase } from '../services/supabaseClient';
import { bootstrapDefaultDevAdmin } from '../services/adminService';
import { getFriendlyAuthError } from '../services/authError';
import { clearPendingJobInterest, savePendingJobInterest } from '../services/accessLinks';
import { useLanguage } from './LanguageProvider';
import { getFriendlyPasskeyError, isPasskeySupported, listPasskeys, signInWithPasskey } from '../services/passkeyService';
import {
  clearPendingPasskeySecondFactor,
  clearPasskeySecondFactorState,
  markPasskeySecondFactorChallenge,
  markPasskeySecondFactorChecking,
  markPasskeySecondFactorSatisfied,
} from '../services/passkeySecondFactorService';
import {
  clearSeekerOAuthIntent,
  loadSeekerOAuthIntent,
  SeekerOAuthProvider,
  startSeekerOAuth,
} from '../services/oauthService';
import { useAuth } from './AuthProvider';
import { getSeekerOAuthEnabled, PLATFORM_SEEKER_OAUTH_CHANGED_EVENT } from '../services/platformSettingsService';

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

const getOAuthDisplayNameParts = (metadata: Record<string, any> | null | undefined, fallbackEmail: string) => {
  const firstName = String(metadata?.given_name || metadata?.first_name || '').trim();
  const lastName = String(metadata?.family_name || metadata?.last_name || '').trim();

  if (firstName || lastName) {
    return { firstName, lastName };
  }

  const fullName = String(metadata?.full_name || metadata?.name || '').trim();
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' '),
    };
  }

  const emailName = fallbackEmail.split('@')[0] || '';
  return {
    firstName: emailName,
    lastName: '',
  };
};

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
  </svg>
);

const AppleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.36 1.43c0 1.08-.44 2.13-1.17 2.91-.78.84-2.04 1.49-3.05 1.4-.13-1.04.39-2.17 1.11-2.94.8-.85 2.16-1.49 3.11-1.37z" />
    <path d="M20.4 17.32c-.55 1.27-.82 1.84-1.53 2.97-.99 1.53-2.38 3.44-4.1 3.46-1.52.02-1.92-.99-3.99-.98-2.07.01-2.51 1-4.04.99-1.72-.02-3.03-1.74-4.02-3.27-2.75-4.25-3.04-9.23-1.34-11.89 1.21-1.89 3.12-3 4.91-3 1.82 0 2.97 1 4.47 1 1.46 0 2.35-1 4.46-1 1.59 0 3.28.87 4.49 2.37-3.94 2.16-3.3 7.79.69 9.35z" />
  </svg>
);

interface AuthProps {
  onAuthSuccess: (
    type: 'login' | 'signup',
    role: 'seeker' | 'admin' | 'recruiter',
    profile?: CandidateProfile | RecruiterProfile
  ) => void | Promise<void>;
}

const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const { text } = useLanguage();
  const { session } = useAuth();
  const location = useLocation();
  const oauthCompletionStartedRef = useRef(false);

  // Prefetch the seeker dashboard chunk while the user is filling the login form
  // so it's already in the JS cache by the time they submit credentials.
  useEffect(() => {
    void import('./JobSeekerHomePage');
    void import('./JobSeekerFlow');
  }, []);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [aiMatchingAccepted, setAiMatchingAccepted] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [linkedJobTitle, setLinkedJobTitle] = useState('');
  const [linkedJobCompany, setLinkedJobCompany] = useState('');
  const [linkedJobId, setLinkedJobId] = useState('');
  const [inviteOnly, setInviteOnly] = useState(false);
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [pendingPasskeyUser, setPendingPasskeyUser] = useState<{
    id: string;
    email: string;
    passkeyCount: number;
  } | null>(null);
  const [isPasskeyChallengeLoading, setIsPasskeyChallengeLoading] = useState(false);
  const [isOAuthCompleting, setIsOAuthCompleting] = useState(false);
  const [isSeekerOAuthEnabled, setIsSeekerOAuthEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadSeekerOAuthSetting = async () => {
      try {
        const enabled = await getSeekerOAuthEnabled();
        if (!cancelled) {
          setIsSeekerOAuthEnabled(enabled);
        }
      } catch (error) {
        console.warn('Failed to load seeker OAuth setting:', error);
        if (!cancelled) {
          setIsSeekerOAuthEnabled(false);
        }
      }
    };

    const handleSeekerOAuthSettingChanged = (event: Event) => {
      const nextValue = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      if (!cancelled && typeof nextValue === 'boolean') {
        setIsSeekerOAuthEnabled(nextValue);
      }
    };

    void loadSeekerOAuthSetting();
    window.addEventListener(PLATFORM_SEEKER_OAUTH_CHANGED_EVENT, handleSeekerOAuthSettingChanged as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener(PLATFORM_SEEKER_OAUTH_CHANGED_EVENT, handleSeekerOAuthSettingChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const requestedMode = location.state?.mode || searchParams.get('mode');
    const oauthIntent = loadSeekerOAuthIntent();
    const nextLinkedJobId = searchParams.get('job') || oauthIntent?.jobId || '';
    const nextInviteOnly = searchParams.get('invite') === '1' || Boolean(oauthIntent?.inviteOnly);

    setLinkedJobId(nextLinkedJobId);
    setInviteOnly(nextInviteOnly);
    setIsSignUp(
      requestedMode === 'signup' ||
      oauthIntent?.mode === 'signup' ||
      (!requestedMode && !oauthIntent && Boolean(nextLinkedJobId))
    );
    setError('');

    if (!nextLinkedJobId) {
      clearPendingJobInterest();
      setLinkedJobTitle('');
      setLinkedJobCompany('');
      setLinkedJobId('');
      setInviteOnly(false);
      return;
    }

    savePendingJobInterest({ jobId: nextLinkedJobId, inviteOnly: nextInviteOnly });

    getJobById(nextLinkedJobId)
      .then((job) => {
        if (!job) return;
        setLinkedJobTitle(job.title || '');
        setLinkedJobCompany(job.company_name || '');
      })
      .catch((jobError) => {
        console.error('Failed to resolve linked job during seeker signup:', jobError);
      });
  }, [location.state, location.search]);

  const validateInviteEmailAccess = async (
    emailOverride?: string,
    jobIdOverride = linkedJobId,
    inviteOnlyOverride = inviteOnly
  ) => {
    if (!inviteOnlyOverride || !jobIdOverride) {
      return true;
    }

    const normalizedEmail = (emailOverride || email).trim().toLowerCase();
    if (!normalizedEmail) {
      setError(text('Please enter the invited email address.', 'Inserisci l’indirizzo email invitato.'));
      return false;
    }

    const isInvited = await isEmailInvitedToJob(jobIdOverride, normalizedEmail);
    if (!isInvited) {
      setError(
        text(
          'This invite can only be used with an email address that was explicitly invited for this job.',
          'Questo invito può essere usato solo con un indirizzo email invitato esplicitamente per questo job.'
        )
      );
      return false;
    }

    return true;
  };

  const completeAuthenticatedLogin = async (
    authUser: { id: string; email?: string | null },
    fallbackEmail: string
  ) => {
    const accountEmail = authUser.email || fallbackEmail;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', authUser.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      await supabase.auth.signOut();
      setError(text('This account is missing its profile record. Please repair it from Supabase before signing in.', 'A questo account manca il record profilo. Riparalo in Supabase prima di accedere.'));
      return;
    }

    if (profile.role === 'admin') {
      await onAuthSuccess('login', 'admin');
      return;
    }

    if (profile.role === 'recruiter') {
      let recruiterProfile = await getRecruiter(authUser.id);
      let authType: 'login' | 'signup' = 'login';

      if (!recruiterProfile) {
        console.warn('Recruiter profile missing for existing recruiter. Rebuilding a blank recruiter profile.');
        const newUser: User = { email: accountEmail, password: '', profileId: authUser.id, role: 'recruiter' };
        const newRecruiter = {
          id: authUser.id,
          email: accountEmail,
          ...BLANK_RECRUITER_PROFILE,
        } as RecruiterProfile;

        try {
          await createNewUserAndRecruiterProfile(newUser, newRecruiter);
          recruiterProfile = newRecruiter;
          authType = 'signup';
        } catch (createErr: any) {
          console.error('Failed to restore recruiter profile:', createErr);
          await supabase.auth.signOut();
          setError(text('This recruiter account is missing its profile data and could not be repaired automatically.', 'A questo account recruiter mancano i dati profilo e non è stato possibile ripararli automaticamente.'));
          return;
        }
      }

      await onAuthSuccess(authType, 'recruiter', recruiterProfile);
      return;
    }

    if (profile.role !== 'seeker') {
      await supabase.auth.signOut();
      setError(text('This account does not have a supported role for this login flow.', 'Questo account non ha un ruolo supportato per questo flusso di accesso.'));
      return;
    }

    let candidateProfile = await getCandidate(authUser.id);

    if (!candidateProfile) {
      // Fallback: If we have a 'profiles' row, the user is a seeker.
      // Rebuild a minimal profile so returning users are not pushed into signup.
      console.warn('Candidate profile missing for existing seeker. Using blank profile.');
      candidateProfile = {
        id: authUser.id,
        contacts: { email: accountEmail, phone: '' },
        ...BLANK_CANDIDATE_PROFILE
      } as CandidateProfile;

      try {
        await createNewUserAndCandidateProfile({ email: accountEmail, password: '', profileId: authUser.id, role: 'seeker' }, candidateProfile);
      } catch (e) {
        console.warn('Failed to restore blank profile', e);
      }
    }

    await onAuthSuccess('login', 'seeker', candidateProfile);
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

  const completeOAuthSession = async () => {
    if (!session?.user || oauthCompletionStartedRef.current) return;

    const intent = loadSeekerOAuthIntent();
    if (!intent) return;

    oauthCompletionStartedRef.current = true;
    setIsOAuthCompleting(true);
    setIsLoading(true);
    setError('');

    try {
      const oauthEmail = session.user.email?.trim().toLowerCase() || '';
      if (!oauthEmail) {
        throw new Error(text('The OAuth provider did not return a verified email address.', 'Il provider OAuth non ha restituito un indirizzo email verificato.'));
      }

      const canContinue = await validateInviteEmailAccess(oauthEmail, intent.jobId || '', Boolean(intent.inviteOnly));
      if (!canContinue) {
        clearSeekerOAuthIntent();
        clearPasskeySecondFactorState();
        await supabase.auth.signOut({ scope: 'local' });
        return;
      }

      const { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (existingProfile) {
        const needsPasskey = await preparePasskeySecondFactor(session.user, oauthEmail);
        if (needsPasskey) return;

        clearSeekerOAuthIntent();
        await completeAuthenticatedLogin(session.user, oauthEmail);
        return;
      }

      if (intent.mode !== 'signup' || !intent.termsAccepted || !intent.aiMatchingAccepted) {
        clearSeekerOAuthIntent();
        clearPasskeySecondFactorState();
        await supabase.auth.signOut({ scope: 'local' });
        setError(
          text(
            'To create a new account with Google or Apple, start from registration and accept Terms, Privacy and AI matching consent.',
            'Per creare un nuovo account con Google o Apple, parti dalla registrazione e accetta Termini, Privacy e consenso al matching AI.'
          )
        );
        return;
      }

      const nameParts = getOAuthDisplayNameParts(session.user.user_metadata, oauthEmail);
      const newCandidate = {
        id: session.user.id,
        contacts: { email: oauthEmail, phone: '' },
        ...BLANK_CANDIDATE_PROFILE,
        personal_info: {
          first_name: nameParts.firstName,
          last_name: nameParts.lastName,
        },
        terms_and_conditions_accepted: true,
        matching_consent: true,
      } as CandidateProfile;

      await createNewUserAndCandidateProfile(
        { email: oauthEmail, password: '', profileId: session.user.id, role: 'seeker' },
        newCandidate
      );

      clearSeekerOAuthIntent();
      clearPendingPasskeySecondFactor();
      await onAuthSuccess('signup', 'seeker', newCandidate);
    } catch (err: any) {
      clearSeekerOAuthIntent();
      clearPasskeySecondFactorState();
      await supabase.auth.signOut({ scope: 'local' }).catch((signOutError) => {
        console.warn('Failed to clear local session after OAuth completion error:', signOutError);
      });
      setError(getFriendlyAuthError(err, text, text('Unable to complete Google/Apple sign in.', 'Impossibile completare l’accesso con Google/Apple.')));
      console.error('Failed to complete seeker OAuth session:', err);
    } finally {
      setIsOAuthCompleting(false);
      setIsLoading(false);
      oauthCompletionStartedRef.current = false;
    }
  };

  useEffect(() => {
    void completeOAuthSession();
  }, [session?.user?.id]);

  const handleOAuthStart = async (provider: SeekerOAuthProvider) => {
    setError('');

    if (!isSeekerOAuthEnabled) {
      setError(text('Google and Apple login is not enabled yet.', 'Login Google e Apple non ancora abilitato.'));
      return;
    }

    if (isSignUp && !termsAccepted) {
      setError(text('You must accept the Terms and Privacy Policy to sign up.', 'Devi accettare Termini e Privacy Policy per registrarti.'));
      return;
    }

    if (isSignUp && !aiMatchingAccepted) {
      setError(text('You must accept the AI matching consent to use PeakTalent.', 'Devi accettare il consenso al matching AI per usare PeakTalent.'));
      return;
    }

    if (linkedJobId) {
      savePendingJobInterest({ jobId: linkedJobId, inviteOnly });
    }

    setIsLoading(true);
    markPasskeySecondFactorChecking(email.trim().toLowerCase());

    try {
      const { error } = await startSeekerOAuth({
        provider,
        mode: isSignUp ? 'signup' : 'login',
        jobId: linkedJobId || undefined,
        inviteOnly,
        termsAccepted: isSignUp ? termsAccepted : undefined,
        aiMatchingAccepted: isSignUp ? aiMatchingAccepted : undefined,
      });

      if (error) throw error;
    } catch (err: any) {
      clearSeekerOAuthIntent();
      clearPasskeySecondFactorState();
      setIsLoading(false);
      setError(getFriendlyAuthError(err, text, text('Unable to start Google/Apple sign in.', 'Impossibile avviare l’accesso con Google/Apple.')));
      console.error('Failed to start seeker OAuth:', err);
    }
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
      const canContinue = await validateInviteEmailAccess();
      if (!canContinue) {
        clearPasskeySecondFactorState();
        setIsLoading(false);
        return;
      }

      let { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        const bootstrapped = await bootstrapDefaultDevAdmin(email, password);
        if (bootstrapped) {
          const retry = await supabase.auth.signInWithPassword({
            email,
            password
          });
          data = retry.data;
          error = retry.error;
        }
      }

      if (error) throw error;
      if (!data.user) throw new Error("No user found");

      const needsPasskey = await preparePasskeySecondFactor(data.user, email);
      if (needsPasskey) return;

      await completeAuthenticatedLogin(data.user, email);

    } catch (err: any) {
      clearPasskeySecondFactorState();
      await supabase.auth.signOut({ scope: 'local' }).catch((signOutError) => {
        console.warn('Failed to clear local session after sign-in error:', signOutError);
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
      clearSeekerOAuthIntent();
      setPendingPasskeyUser(null);
      await completeAuthenticatedLogin(data.user, pendingPasskeyUser.email);
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
    if (!termsAccepted) {
      setError(text('You must accept the Terms and Privacy Policy to sign up.', 'Devi accettare Termini e Privacy Policy per registrarti.'));
      return;
    }
    if (!aiMatchingAccepted) {
      setError(text('You must accept the AI matching consent to use PeakTalent.', 'Devi accettare il consenso al matching AI per usare PeakTalent.'));
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      const canContinue = await validateInviteEmailAccess();
      if (!canContinue) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error("Signup failed");

      // Handle Email Verification Flow
      if (data.user && !data.session) {
        setError(text("Account created! Please check your email to confirm. (Dev Note: If emails are not set up, verify the user manually in your Supabase Dashboard).", "Account creato. Controlla la tua email per confermare. Se le email non sono configurate, verifica manualmente l’utente nella dashboard Supabase."));
        setIsLoading(false);
        return;
      }

      const candidateId = data.user.id; // Use Auth ID
      const newUser: User = { email, password, profileId: candidateId, role: 'seeker' };

      const newCandidate = {
        id: candidateId,
        contacts: { email, phone: '' },
        ...BLANK_CANDIDATE_PROFILE,
        terms_and_conditions_accepted: true,
        matching_consent: true,
      } as CandidateProfile;

      // Create Profile and Candidate implementation
      await createNewUserAndCandidateProfile(newUser, newCandidate);

      setIsLoading(false);
      await onAuthSuccess('signup', 'seeker', newCandidate);
    } catch (err: any) {
      setError(getFriendlyAuthError(err, text, text('An error occurred during sign up.', 'Si è verificato un errore durante la registrazione.')));
      console.error(err);
      setIsLoading(false);
    }
  };

  const renderOAuthButtons = (mode: 'login' | 'signup') => {
    if (!isSeekerOAuthEnabled) return null;

    return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          {mode === 'signup' ? text('or sign up with', 'oppure registrati con') : text('or continue with', 'oppure continua con')}
        </span>
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void handleOAuthStart('google')}
          disabled={isLoading || isOAuthCompleting}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          <GoogleIcon />
          Google
        </button>
        <button
          type="button"
          onClick={() => void handleOAuthStart('apple')}
          disabled={isLoading || isOAuthCompleting}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-900 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-50 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
        >
          <AppleIcon />
          Apple
        </button>
      </div>
    </div>
    );
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-10.5rem)] px-4 py-4 sm:px-8 lg:px-10">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-slate-800/50 p-8 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
          <h2 className="text-3xl font-bold text-center text-slate-800 dark:text-slate-100 mb-2">
            {isSignUp ? text('Create Account', 'Crea account') : text('Welcome Back', 'Bentornato')}
          </h2>
          <p className="text-center text-slate-500 dark:text-slate-400 mb-8">
            {isSignUp ? text('Join PeakTalent to find your next role.', 'Unisciti a PeakTalent per trovare il tuo prossimo ruolo.') : text('Sign in to continue your journey.', 'Accedi per continuare il tuo percorso.')}
          </p>

          {isSignUp && linkedJobTitle && (
            <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-left text-sm text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-300">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] opacity-80">
                {text('Linked Opportunity', 'Opportunità collegata')}
              </p>
              <p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">{linkedJobTitle}</p>
              {linkedJobCompany && (
                <p className="mt-1 text-slate-600 dark:text-slate-300">{linkedJobCompany}</p>
              )}
              <p className="mt-3 leading-relaxed">
                {text(
                  'Create your account from this page and the role will already appear in your jobs with interest shown.',
                  'Crea il tuo account da questa pagina e il ruolo comparirà subito nei tuoi job come interesse già mostrato.'
                )}
              </p>
            </div>
          )}

          {error && <p className="text-red-500 text-center mb-4 text-sm">{error}</p>}
          {isOAuthCompleting && (
            <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-center text-sm font-semibold text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-300">
              {text('Completing Google/Apple sign in...', 'Completamento accesso Google/Apple...')}
            </div>
          )}
          {isSignUp ? (
            // Sign Up Form
            <form onSubmit={handleSignUp} autoComplete="on" name="signup" className="space-y-6">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{text('Email address', 'Indirizzo email')}</label>
                <input id="username" name="username" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Email address"
                  className="mt-1 block w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{text('Password', 'Password')}</label>
                <input id="password" name="new-password" type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-label="Password"
                  className="mt-1 block w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{text('Confirm Password', 'Conferma password')}</label>
                <input id="confirm-password" name="confirm-password" type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-label="Confirm password"
                  className="mt-1 block w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
              </div>
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={termsAccepted}
                    onChange={() => setTermsAccepted(v => !v)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-orange-600 focus:ring-orange-600"
                  />
                  <label htmlFor="terms" className="text-sm text-slate-700 dark:text-slate-300">
                    {text('I have read and accept the ', "Ho letto e accetto i ")}
                    <a href="#" className="font-semibold text-orange-600 underline hover:text-orange-700">
                      {text('Terms & Conditions', 'Termini e Condizioni')}
                    </a>
                    {text(' and ', ' e la ')}
                    <a href="#" className="font-semibold text-orange-600 underline hover:text-orange-700">
                      {text('Privacy Policy', 'Privacy Policy')}
                    </a>
                    {text(', including the disclosure that my data is processed by Google Gemini (Google LLC, USA).', ', inclusa la comunicazione che i miei dati vengono processati da Google Gemini (Google LLC, USA).')}
                    <span className="ml-1 text-rose-500">*</span>
                  </label>
                </div>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="ai-matching"
                    checked={aiMatchingAccepted}
                    onChange={() => setAiMatchingAccepted(v => !v)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-orange-600 focus:ring-orange-600"
                  />
                  <label htmlFor="ai-matching" className="text-sm text-slate-700 dark:text-slate-300">
                    {text(
                      'I consent to the use of AI to analyse my profile and match me with job opportunities.',
                      "Acconsento all'utilizzo dell'AI per analizzare il mio profilo e propormi opportunità di lavoro."
                    )}
                    <span className="ml-1 text-rose-500">*</span>
                    <span className="block mt-1 text-xs text-slate-400">
                      <span className="text-rose-500">*</span>{' '}
                      {text('(you can change this at any time in Settings)', '(puoi modificarlo in qualsiasi momento nelle Impostazioni)')}
                    </span>
                  </label>
                </div>
              </div>
              {renderOAuthButtons('signup')}
              <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:shadow-lg transform transition-all duration-300 disabled:opacity-50">
                {isLoading ? text('Signing Up...', 'Registrazione in corso...') : text('Sign Up', 'Registrati')}
              </button>
            </form>
          ) : pendingPasskeyUser ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-sm text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-300">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {text('Additional security step', 'Step di sicurezza aggiuntivo')}
                </p>
                <p className="mt-2 leading-relaxed">
                  {text(
                    'This account has a passkey enabled. Confirm it to complete sign in.',
                    'Questo account ha una passkey abilitata. Confermala per completare l’accesso.'
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
            // Sign In Form
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
                      'To reset your password, please contact PeakTalent support directly at the email address below.',
                      'Per resettare la password, contatta direttamente il supporto PeakTalent all’indirizzo qui sotto.'
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
              {renderOAuthButtons('login')}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
