import React from 'react';
import { useLanguage } from './LanguageProvider';
import LegalPageLayout from './LegalPageLayout';

const CookiePolicyPage: React.FC = () => {
  const { text } = useLanguage();

  return (
    <LegalPageLayout
      title={text('Cookie Policy', 'Cookie Policy')}
      description={text(
        'How cookies and similar technologies support the PeakTalent experience.',
        'Come cookie e tecnologie simili supportano l’esperienza su PeakTalent.'
      )}
    >
        <section className="space-y-4">
          <p>{text('This page describes how cookies are used on the PeakTalent website.', 'Questa pagina descrive come vengono usati i cookie sul sito PeakTalent.')}</p>
          <p>{text('Include details on cookie categories, purposes, duration, and how users can manage their preferences.', 'Includi dettagli sulle categorie di cookie, le finalità, la durata e come gli utenti possono gestire le proprie preferenze.')}</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{text('Essential Cookies', 'Cookie essenziali')}</h2>
          <p>{text('These cookies are required to run the website and cannot be disabled.', 'Questi cookie sono necessari per il funzionamento del sito e non possono essere disabilitati.')}</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{text('Analytics and Functional Cookies', 'Cookie di analisi e funzionali')}</h2>
          <p>{text('Describe the purpose of analytics and functional cookies, including any third-party services used.', 'Descrivi la finalità dei cookie di analisi e funzionali, includendo eventuali servizi di terze parti utilizzati.')}</p>
        </section>
    </LegalPageLayout>
  );
};

export default CookiePolicyPage;
