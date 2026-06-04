import React, { useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from './LanguageProvider';

interface LegalPageLayoutProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({ title, description, children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { text } = useLanguage();

  useLayoutEffect(() => {
    const scrollRoot = document.scrollingElement || document.documentElement;
    scrollRoot.scrollTop = 0;
    scrollRoot.scrollLeft = 0;

    if (typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [location.pathname]);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-6 pt-3 sm:px-6 sm:pt-4 lg:px-8">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {text('Back', 'Indietro')}
      </button>

      <section className="mt-4 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
        <header className="relative overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-10 sm:py-10">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-orange-500/25 blur-3xl" />
          <div className="absolute -bottom-24 left-10 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">
              {text('Legal documents', 'Documenti legali')}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              {description}
            </p>
          </div>
        </header>

        <article className="space-y-8 px-6 py-7 text-base leading-7 text-slate-700 sm:px-10 sm:py-10 dark:text-slate-300">
          {children}
        </article>
      </section>
    </div>
  );
};

export default LegalPageLayout;
