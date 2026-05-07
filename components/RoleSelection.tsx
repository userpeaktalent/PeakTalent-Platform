import React from 'react';
import { UserRole } from '../types';
import { useLanguage } from './LanguageProvider';

interface RoleSelectionProps {
  onSelectRole: (role: UserRole) => void;
  onLogin: () => void;
}

const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12 text-orange-500"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
);

const BriefcaseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12 text-amber-500"><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
);


const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelectRole, onLogin }) => {
  const { text } = useLanguage();

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-12.5rem)] py-5">
      <div className="text-center mb-16 space-y-4">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          {text('Welcome to ', 'Benvenuto su ')}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-amber-500">
            PeakTalent!
          </span>
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          {text('Connecting exceptional talent with visionary companies. Please select your role to get started.', 'Mettiamo in contatto talenti eccezionali e aziende visionarie. Seleziona il tuo ruolo per iniziare.')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-7xl px-4 sm:px-8 lg:px-10">
        {/* Job Seeker Card */}
        <button
          onClick={() => onSelectRole('seeker')}
          className="group relative flex flex-col items-center justify-center text-center p-10 bg-white dark:bg-slate-800 rounded-3xl shadow-xl hover:shadow-2xl hover:shadow-orange-500/10 transition-all duration-300 border border-slate-100 dark:border-slate-700 overflow-hidden transform hover:-translate-y-2"
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-500 to-amber-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>

          <div className="p-4 bg-orange-50 dark:bg-slate-700 rounded-full mb-6 group-hover:bg-orange-100 dark:group-hover:bg-slate-600 transition-colors">
            <UserIcon />
          </div>

          <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{text('Job Seeker', 'Candidato')}</h2>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
            {text('Upload your CV, refine your profile with our AI assistant, and get matched with your dream job.', 'Carica il tuo CV, perfeziona il profilo con il nostro assistente AI e trova il lavoro giusto per te.')}
          </p>
        </button>

        {/* Recruiter Card */}
        <button
          onClick={() => onSelectRole('recruiter')}
          className="group relative flex flex-col items-center justify-center text-center p-10 bg-white dark:bg-slate-800 rounded-3xl shadow-xl hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-300 border border-slate-100 dark:border-slate-700 overflow-hidden transform hover:-translate-y-2"
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-500 to-orange-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>

          <div className="p-4 bg-amber-50 dark:bg-slate-700 rounded-full mb-6 group-hover:bg-amber-100 dark:group-hover:bg-slate-600 transition-colors">
            <BriefcaseIcon />
          </div>

          <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">Recruiter</h2>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
            {text('Request recruiter access to create AI-powered job postings and manage the right talent pipeline for your company.', 'Richiedi l’accesso recruiter per creare job posting con AI e gestire la pipeline talenti giusta per la tua azienda.')}
          </p>
        </button>
      </div>

      <div className="mt-12 flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
        <span className="h-px w-10 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
        <p>
          {text('Already have an account? ', 'Hai già un account? ')}
          <button
            type="button"
            onClick={onLogin}
            className="font-semibold text-orange-600 underline-offset-4 transition hover:text-orange-700 hover:underline dark:text-orange-400 dark:hover:text-orange-300"
          >
            {text('Sign in', 'Accedi')}
          </button>
        </p>
        <span className="h-px w-10 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
      </div>
    </div>
  );
};

export default RoleSelection;
