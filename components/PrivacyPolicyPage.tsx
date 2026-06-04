import React from 'react';
import { useLanguage } from './LanguageProvider';
import LegalPageLayout from './LegalPageLayout';

const PrivacyPolicyPage: React.FC = () => {
  const { text } = useLanguage();

  return (
    <LegalPageLayout
      title={text('Privacy Policy', 'Privacy Policy')}
      description={text(
        'How PeakTalent handles personal data, retention, rights, and platform privacy.',
        'Come PeakTalent gestisce dati personali, conservazione, diritti e privacy della piattaforma.'
      )}
    >
        <section className="space-y-4">
          <p>{text('This page contains the privacy policy for PeakTalent.', 'Questa pagina contiene l’informativa sulla privacy di PeakTalent.')}</p>
          <p>{text('Add the full privacy policy content here, covering the types of data collected, how it is used, retention periods, rights and contact details.', 'Aggiungi qui il contenuto completo della privacy policy, includendo le tipologie di dati raccolti, come vengono usati, i tempi di conservazione, i diritti e i contatti.')}</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{text('Data Collection', 'Raccolta dei dati')}</h2>
          <p>{text('Information you provide directly, data collected automatically, and any third-party sources used by PeakTalent.', 'Informazioni fornite direttamente dall’utente, dati raccolti automaticamente e eventuali fonti di terze parti utilizzate da PeakTalent.')}</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{text('User Rights', 'Diritti degli utenti')}</h2>
          <p>{text('Describe user rights under applicable data protection laws, including access, correction, deletion, and objection.', 'Descrivi i diritti degli utenti in base alle normative sulla protezione dei dati, inclusi accesso, rettifica, cancellazione e opposizione.')}</p>
        </section>
    </LegalPageLayout>
  );
};

export default PrivacyPolicyPage;
