
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  createNewUserAndCandidateProfile,
  createNewUserAndRecruiterProfile,
  getCandidate,
  getJobById,
  getRecruiter,
} from '../services/dbService';
import { User, CandidateProfile, RecruiterProfile } from '../types';
import { BLANK_CANDIDATE_PROFILE, BLANK_RECRUITER_PROFILE } from '../constants';
import { supabase } from '../services/supabaseClient';
import { bootstrapDefaultDevAdmin } from '../services/adminService';
import { getFriendlyAuthError } from '../services/authError';
import { clearPendingJobInterest, savePendingJobInterest } from '../services/accessLinks';
import { useLanguage } from './LanguageProvider';

interface AuthProps {
  onAuthSuccess: (
    type: 'login' | 'signup',
    role: 'seeker' | 'admin' | 'recruiter',
    profile?: CandidateProfile | RecruiterProfile
  ) => void | Promise<void>;
}

const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const { text } = useLanguage();
  const location = useLocation();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [gdprAccepted, setGdprAccepted] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [linkedJobTitle, setLinkedJobTitle] = useState('');
  const [linkedJobCompany, setLinkedJobCompany] = useState('');

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const requestedMode = location.state?.mode || searchParams.get('mode');
    const linkedJobId = searchParams.get('job');

    setIsSignUp(requestedMode === 'signup' || Boolean(linkedJobId));
    setError('');

    if (!linkedJobId) {
      clearPendingJobInterest();
      setLinkedJobTitle('');
      setLinkedJobCompany('');
      return;
    }

    savePendingJobInterest(linkedJobId);

    getJobById(linkedJobId)
      .then((job) => {
        if (!job) return;
        setLinkedJobTitle(job.title || '');
        setLinkedJobCompany(job.company_name || '');
      })
      .catch((jobError) => {
        console.error('Failed to resolve linked job during seeker signup:', jobError);
      });
  }, [location.state, location.search]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(text('Please fill in all fields.', 'Compila tutti i campi.'));
      return;
    }
    setError('');
    setIsLoading(true);

    try {
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

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) {
        await supabase.auth.signOut();
        setError(text('This account is missing its profile record. Please repair it from Supabase before signing in.', 'A questo account manca il record profilo. Riparalo in Supabase prima di accedere.'));
        setIsLoading(false);
        return;
      }

      if (profile.role === 'admin') {
        setIsLoading(false);
        await onAuthSuccess('login', 'admin');
        return;
      }

      if (profile.role === 'recruiter') {
        let recruiterProfile = await getRecruiter(data.user.id);
        let authType: 'login' | 'signup' = 'login';

        if (!recruiterProfile) {
          console.warn('Recruiter profile missing for existing recruiter. Rebuilding a blank recruiter profile.');
          const newUser: User = { email, password: '', profileId: data.user.id, role: 'recruiter' };
          const newRecruiter = {
            id: data.user.id,
            email: data.user.email || email,
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
            setIsLoading(false);
            return;
          }
        }

        setIsLoading(false);
        await onAuthSuccess(authType, 'recruiter', recruiterProfile);
        return;
      }

      if (profile.role !== 'seeker') {
        await supabase.auth.signOut();
        setError(text('This account does not have a supported role for this login flow.', 'Questo account non ha un ruolo supportato per questo flusso di accesso.'));
        setIsLoading(false);
        return;
      }

      let candidateProfile = await getCandidate(data.user.id);

      if (!candidateProfile) {
        // Fallback: If we have a 'profiles' row (checked above), the user IS a seeker.
        // If candidate data is missing, it's a data consistency issue, but we shouldn't force 'signup' flow
        // because that confuses returning users.
        // Instead, we log them in with a blank profile, and they can edit it from the dashboard.

        console.warn("Candidate profile missing for existing seeker. Using blank profile.");
        candidateProfile = {
          id: data.user.id,
          contacts: { email: data.user.email || email, phone: '' },
          ...BLANK_CANDIDATE_PROFILE
        } as CandidateProfile;

        // Optionally try to restore it to DB immediately
        try {
          await createNewUserAndCandidateProfile({ email, password: '', profileId: data.user.id, role: 'seeker' }, candidateProfile);
        } catch (e) {
          console.warn("Failed to restore blank profile", e);
        }
      }
      setIsLoading(false);
      await onAuthSuccess('login', 'seeker', candidateProfile);

    } catch (err: any) {
      setError(getFriendlyAuthError(err, text, text('An error occurred during sign in.', 'Si è verificato un errore durante l’accesso.')));
      console.error(err);
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
    if (!gdprAccepted) {
      setError(text('You must accept the terms to sign up.', 'Devi accettare i termini per registrarti.'));
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

      // Handle Email Verification Flow
      if (data.user && !data.session) {
        setError(text("Account created! Please check your email to confirm. (Dev Note: If emails are not set up, verify the user manually in your Supabase Dashboard).", "Account creato. Controlla la tua email per confermare. Se le email non sono configurate, verifica manualmente l’utente nella dashboard Supabase."));
        setIsLoading(false);
        return;
      }

      const candidateId = data.user.id; // Use Auth ID
      const newUser: User = { email, password, profileId: candidateId, role: 'seeker' };

      const newCandidate = {
        id: candidateId, // Match Auth ID
        contacts: { email, phone: '' },
        ...BLANK_CANDIDATE_PROFILE
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
              <div className="flex items-center">
                <input type="checkbox" id="gdpr" checked={gdprAccepted} onChange={() => setGdprAccepted(!gdprAccepted)} className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-600" />
                <label htmlFor="gdpr" className="ml-2 block text-sm text-slate-700 dark:text-slate-300">{text('I accept the terms and consent to my data being processed (GDPR).', 'Accetto i termini e il trattamento dei miei dati (GDPR).')}</label>
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 transform transition-all duration-300 disabled:opacity-50">
                {isLoading ? text('Signing Up...', 'Registrazione in corso...') : text('Sign Up', 'Registrati')}
              </button>
            </form>
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
              <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 transform transition-all duration-300 disabled:opacity-50">
                {isLoading ? text('Signing In...', 'Accesso in corso...') : text('Sign In', 'Accedi')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
