import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from './LanguageProvider';

// ── Pillar data ──────────────────────────────────────────────────────────────

interface Pillar {
  weight: number;
  icon: string;
  titleEn: string;
  titleIt: string;
  descEn: string;
  descIt: string;
  tipsEn: string[];
  tipsIt: string[];
}

const PILLARS: Pillar[] = [
  {
    weight: 50,
    icon: '🧠',
    titleEn: 'Semantic Match',
    titleIt: 'Affinità semantica',
    descEn: 'How well your overall background aligns with the role — combining the meaning of your career narrative with a structured analysis of your titles, skills, and trajectory.',
    descIt: 'Quanto il tuo profilo complessivo è allineato al ruolo — combinando il significato della tua carriera con un\'analisi strutturata di titoli, competenze e traiettoria.',
    tipsEn: ['Complete the AI interview to generate your career narrative', 'Fill in job titles and functions precisely', 'List skills relevant to your target roles'],
    tipsIt: ['Completa il colloquio AI per generare la tua narrativa di carriera', 'Inserisci titoli di lavoro e funzioni con precisione', 'Elenca le competenze rilevanti per i ruoli a cui miri'],
  },
  {
    weight: 30,
    icon: '🛠️',
    titleEn: 'Hard Skills',
    titleIt: 'Competenze tecniche',
    descEn: 'Coverage of the job\'s required technical skills, weighted by importance (must-have vs. nice-to-have) and your self-reported proficiency level.',
    descIt: 'Copertura delle competenze tecniche richieste dal ruolo, pesata per importanza (indispensabile vs. preferenziale) e per il tuo livello dichiarato.',
    tipsEn: ['Add all your technical skills and specify your level', 'Skills validated in the AI interview carry a slight boost', 'Include certifications — they count toward skill coverage'],
    tipsIt: ['Aggiungi tutte le tue competenze tecniche e specifica il livello', 'Le skill validate nel colloquio AI ottengono un leggero vantaggio', 'Includi le certificazioni — contano per la copertura delle skill'],
  },
  {
    weight: 5,
    icon: '🏭',
    titleEn: 'Industry / Domain',
    titleIt: 'Settore / Dominio',
    descEn: 'Whether your background is in the same industry or domain as the job. Current experience counts most; aspirational preferences count least.',
    descIt: 'Se il tuo background è nello stesso settore o dominio del ruolo. L\'esperienza attuale pesa di più; le preferenze aspirazionali pesano di meno.',
    tipsEn: ['Set your current industry in the profile', 'Add sector experience to your work history', 'Being active in the target industry matters more than a stated preference'],
    tipsIt: ['Imposta il tuo settore attuale nel profilo', 'Aggiungi l\'esperienza settoriale alla cronologia lavorativa', 'Essere attivo nel settore target pesa più di una preferenza dichiarata'],
  },
  {
    weight: 10,
    icon: '🎓',
    titleEn: 'Education',
    titleIt: 'Formazione',
    descEn: 'Your degree level relative to what the role requires, plus university prestige and graduation grade if provided.',
    descIt: 'Il tuo livello di laurea rispetto a quanto richiesto dal ruolo, più il prestigio dell\'università e il voto di laurea se fornito.',
    tipsEn: ['Add your degree and the university name', 'Enter your graduation grade — it contributes to this pillar', 'List relevant certifications in the skills section'],
    tipsIt: ['Aggiungi il tuo titolo di studio e il nome dell\'università', 'Inserisci il voto di laurea — contribuisce a questo pilastro', 'Elenca le certificazioni rilevanti nella sezione competenze'],
  },
  {
    weight: 5,
    icon: '🏢',
    titleEn: 'Career Prestige',
    titleIt: 'Prestigio della carriera',
    descEn: 'The reputation of the companies you have worked for. Your most recent employer carries the most weight (70%).',
    descIt: 'La reputazione delle aziende per cui hai lavorato. Il tuo datore di lavoro più recente pesa di più (70%).',
    tipsEn: ['Make sure company names are spelled correctly so they are recognised', 'Include all relevant work experiences', 'Unknown companies get a neutral (not zero) score — don\'t remove them'],
    tipsIt: ['Assicurati che i nomi delle aziende siano scritti correttamente per essere riconosciuti', 'Includi tutte le esperienze lavorative rilevanti', 'Le aziende sconosciute ottengono un punteggio neutro, non zero — non eliminarle'],
  },
];

const HARD_FILTERS = {
  en: [
    'Work eligibility — you must be legally authorised to work in the job\'s country, unless the job offers visa sponsorship',
    'Contract type — your preferred contract type must match what the job offers',
    'Remote policy — if you require fully remote, the job must allow it',
    'Language requirements — you must meet all language levels the job specifies',
    'Salary floor — the job\'s maximum salary must reach your stated minimum',
    'Education minimum — if the job requires a degree, you must hold at least that level',
  ],
  it: [
    'Idoneità lavorativa — devi essere legalmente autorizzato a lavorare nel paese del ruolo, salvo che il job offra sponsorizzazione del visto',
    'Tipo di contratto — il tipo di contratto che preferisci deve corrispondere a quello offerto',
    'Politica da remoto — se richiedi il full remote, il ruolo deve prevederlo',
    'Requisiti linguistici — devi soddisfare tutti i livelli di lingua specificati nel ruolo',
    'Stipendio minimo — il massimo salariale offerto deve raggiungere il tuo minimo dichiarato',
    'Livello minimo di istruzione — se il ruolo richiede una laurea, devi possedere almeno quel titolo',
  ],
};

// ── Sub-components ────────────────────────────────────────────────────────────

const PillarCard: React.FC<{ pillar: Pillar; isIt: boolean; open: boolean; onToggle: () => void }> = ({
  pillar, isIt, open, onToggle,
}) => {
  const title = isIt ? pillar.titleIt : pillar.titleEn;
  const desc = isIt ? pillar.descIt : pillar.descEn;
  const tips = isIt ? pillar.tipsIt : pillar.tipsEn;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 overflow-hidden transition-all">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors"
      >
        <span className="text-2xl flex-shrink-0">{pillar.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        </span>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 px-2.5 py-1 rounded-full">
            {pillar.weight}%
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400 mb-2">
              {isIt ? 'Come migliorare questo punteggio' : 'How to improve this score'}
            </p>
            <ul className="space-y-1.5">
              {tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span className="text-orange-500 mt-0.5 flex-shrink-0">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

const WeightBar: React.FC<{ pillar: Pillar; isIt: boolean }> = ({ pillar, isIt }) => (
  <div className="flex items-center gap-3">
    <span className="text-base flex-shrink-0">{pillar.icon}</span>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
          {isIt ? pillar.titleIt : pillar.titleEn}
        </span>
        <span className="text-xs font-bold text-orange-600 dark:text-orange-400 ml-2 flex-shrink-0">{pillar.weight}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700"
          style={{ width: `${pillar.weight}%` }}
        />
      </div>
    </div>
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────

const HowMatchingWorksPage: React.FC = () => {
  const { text, language } = useLanguage();
  const navigate = useNavigate();
  const isIt = language === 'it';
  const [openPillar, setOpenPillar] = useState<number | null>(0);

  const toggle = (i: number) => setOpenPillar(prev => (prev === i ? null : i));

  return (
    <div className="mx-auto max-w-3xl animate-fade-in px-4 pb-24 pt-2">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {text('Back', 'Indietro')}
      </button>

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {text('How matching works', 'Come funziona il matching')}
        </h1>
        <p className="mt-3 text-base text-slate-500 dark:text-slate-400 leading-relaxed max-w-xl">
          {text(
            'Your compatibility score is calculated by a deterministic algorithm — not a black-box AI. Here is exactly how it works and what you can do to rank higher.',
            'Il tuo punteggio di compatibilità è calcolato da un algoritmo deterministico — non da una AI opaca. Ecco esattamente come funziona e cosa puoi fare per migliorare il ranking.',
          )}
        </p>
      </div>

      {/* AI Transparency notice (EU AI Act) */}
      <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800/50 dark:bg-amber-950/20">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
          {text('AI transparency', 'Trasparenza AI')}
        </p>
        <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
          {text(
            'The matching score supports recruiters in reviewing candidates — it is not an automated hiring decision. Recruiters can always override scores, and human review is part of every selection process.',
            'Il punteggio di matching supporta i recruiter nella revisione dei candidati — non è una decisione di assunzione automatizzata. I recruiter possono sempre modificare i punteggi e la revisione umana fa parte di ogni processo di selezione.',
          )}
        </p>
      </div>

      {/* Score overview bar chart */}
      <section className="mb-8 rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-5">
          {text('Score breakdown', 'Composizione del punteggio')}
        </h2>
        <div className="space-y-4">
          {PILLARS.map((p) => (
            <WeightBar key={p.titleEn} pillar={p} isIt={isIt} />
          ))}
        </div>
        <p className="mt-5 text-xs text-slate-400 dark:text-slate-500">
          {text(
            'Location, remote policy, salary, and contract type are evaluated and shown to recruiters but do not affect your numeric score — they act as hard filters instead (see below).',
            'Posizione, politica da remoto, stipendio e tipo di contratto sono valutati e mostrati ai recruiter ma non influenzano il punteggio numerico — agiscono invece come filtri obbligatori (vedi sotto).',
          )}
        </p>
      </section>

      {/* Pillar details accordion */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {text('Pillar details', 'Dettaglio dei pilastri')}
        </h2>
        <div className="space-y-2">
          {PILLARS.map((p, i) => (
            <PillarCard
              key={p.titleEn}
              pillar={p}
              isIt={isIt}
              open={openPillar === i}
              onToggle={() => toggle(i)}
            />
          ))}
        </div>
      </section>

      {/* Hard filters */}
      <section className="mb-8 rounded-[24px] border border-red-100 bg-red-50/60 p-6 dark:border-red-900/40 dark:bg-red-950/10">
        <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
          {text('Hard filters — when you don\'t appear at all', 'Filtri obbligatori — quando non appari affatto')}
        </h2>
        <p className="text-sm text-red-600 dark:text-red-400 mb-4 leading-relaxed">
          {text(
            'Before scoring, the algorithm checks eligibility. If you fail any of the following, you will not appear in that job\'s ranking at all — regardless of how strong your profile is.',
            'Prima di calcolare il punteggio, l\'algoritmo verifica l\'idoneità. Se non soddisfi uno dei seguenti requisiti, non apparirai nel ranking di quel ruolo — indipendentemente da quanto sia forte il tuo profilo.',
          )}
        </p>
        <ul className="space-y-2">
          {(isIt ? HARD_FILTERS.it : HARD_FILTERS.en).map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
              <span className="mt-0.5 flex-shrink-0 font-bold">✕</span>
              {f}
            </li>
          ))}
        </ul>
      </section>

      {/* Role of AI */}
      <section className="mb-8 rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">
          {text('What AI actually does', 'Cosa fa davvero l\'AI')}
        </h2>
        <div className="space-y-3">
          {[
            {
              en: ['✅ Extracts data from your CV (text parsing)', '✅ Conducts the AI interview and builds your career narrative', '✅ Generates a bias-free semantic representation of your background'],
              it: ['✅ Estrae i dati dal tuo CV (parsing testo)', '✅ Conduce il colloquio AI e costruisce la tua narrativa di carriera', '✅ Genera una rappresentazione semantica imparziale del tuo background'],
            },
            {
              en: ['❌ Does NOT assign your match score', '❌ Does NOT decide who gets shortlisted', '❌ Does NOT have access to protected characteristics (age, gender, origin)'],
              it: ['❌ NON assegna il tuo punteggio di matching', '❌ NON decide chi viene incluso nella shortlist', '❌ NON ha accesso a caratteristiche protette (età, genere, origine)'],
            },
          ].map((group, gi) => (
            <ul key={gi} className="space-y-1.5">
              {(isIt ? group.it : group.en).map((item, i) => (
                <li key={i} className="text-sm text-slate-700 dark:text-slate-300">{item}</li>
              ))}
            </ul>
          ))}
        </div>
      </section>

      {/* Human oversight */}
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">
          {text('Human oversight', 'Supervisione umana')}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {text(
            'Recruiters see the full score breakdown for every candidate. They can manually adjust any score (and are required to provide a reason when they do). The algorithm ranks — it never decides. Every hiring decision remains with a human.',
            'I recruiter vedono la composizione completa del punteggio per ogni candidato. Possono modificare manualmente qualsiasi punteggio (e devono fornire una motivazione quando lo fanno). L\'algoritmo classifica — non decide mai. Ogni decisione di assunzione rimane in capo a un essere umano.',
          )}
        </p>
      </section>
    </div>
  );
};

export default HowMatchingWorksPage;
