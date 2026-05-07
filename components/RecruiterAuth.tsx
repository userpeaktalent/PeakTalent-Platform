
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

interface RecruiterAuthProps {
  onAuthSuccess: (type: 'signin' | 'signup', profile: RecruiterProfile) => void | Promise<void>;
}

const RecruiterAuth: React.FC<RecruiterAuthProps> = ({ onAuthSuccess }) => {
  const { text } = useLanguage();
  const { refreshProfile } = useAuth();
  const location = useLocation();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const requestedMode = location.state?.mode || searchParams.get('mode');
    setIsSignUp(requestedMode === 'signup');
    setError('');
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      if (!data.user) throw new Error("No user found");

      // Check if role is recruiter
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
      if (profile && profile.role !== 'recruiter') {
        await supabase.auth.signOut();
        setError(text('This email is registered as a Job Seeker. Please switch modes.', 'Questa email è registrata come candidato. Cambia modalità di accesso.'));
        setIsLoading(false);
        return;
      }

      const recruiterProfile = await getRecruiter(data.user.id);
      if (!recruiterProfile) {
        console.log("Recruiter profile missing. Auto-creating...");
        const newUser: User = { email, password: '', profileId: data.user.id, role: 'recruiter' };
        const newRecruiter = {
          id: data.user.id,
          email: data.user.email || email,
          ...BLANK_RECRUITER_PROFILE
        } as RecruiterProfile;

        try {
          await createNewUserAndRecruiterProfile(newUser, newRecruiter);
          await refreshProfile();
          setIsLoading(false);
          await onAuthSuccess('signup', newRecruiter);
          return;
        } catch (createErr: any) {
          console.error("Failed to auto-create recruiter profile:", createErr);
          setError(text('Could not find or create recruiter profile.', 'Impossibile trovare o creare il profilo recruiter.'));
          setIsLoading(false);
          return;
        }
      }
      await refreshProfile();
      setIsLoading(false);
      await onAuthSuccess('signin', recruiterProfile);

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
                className="inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
              >
                {text('Contact PeakTalent', 'Contattaci')}
              </a>
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

export default RecruiterAuth;
