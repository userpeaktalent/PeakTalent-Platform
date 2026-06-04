import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from './LanguageProvider';

type MarketingHomePageProps = {
  onEnterPlatform: () => void;
  onLogin: () => void;
};

type RevealDirection = 'up' | 'left' | 'right' | 'zoom';

type NavItem = {
  label: string;
  href: string;
};

type IconName =
  | 'spark'
  | 'menu'
  | 'close'
  | 'arrow-right'
  | 'warning'
  | 'clock'
  | 'heart'
  | 'target'
  | 'brain'
  | 'clipboard'
  | 'search'
  | 'message'
  | 'zap'
  | 'shield'
  | 'users'
  | 'file'
  | 'check'
  | 'ranking'
  | 'eye'
  | 'layers'
  | 'factory'
  | 'badge'
  | 'mail'
  | 'linkedin'
  | 'facebook';

type FeatureCard = {
  title: string;
  description: string;
  colorClass: string;
  bgClass: string;
  icon: IconName;
};

type SolutionCard = {
  title: string;
  description: string;
  highlights: string[];
  icon: IconName;
};

type BenefitCard = {
  title: string;
  description: string;
  icon: IconName;
};

type ProcessStep = {
  number: string;
  title: string;
  description: string;
  icon: IconName;
};

type WhyUsCard = {
  title: string;
  description: string;
  icon: IconName;
};

type BeliefCard = {
  title: string;
  description: string;
  icon: IconName;
};

const demoHref = 'mailto:info@peaktalent.it?subject=Richiesta%20Demo%20PeakTalent&body=Buongiorno%2C%0A%0ASono%20interessato%2Fa%20a%20richiedere%20una%20demo%20della%20piattaforma%20PeakTalent.%0A%0ANome%3A%20%0AAzienda%3A%20%0ARuolo%3A%20%0ATelefono%3A%20%0A%0AGrazie%2C%0A';
const contactHref = 'mailto:info@peaktalent.it';

const challengeCards: FeatureCard[] = [
  {
    title: 'Carenza di Competenze',
    description: 'Oltre 8 milioni di assunzioni fatte in Italia ogni anno, con alcune categorie ritenute complesse per la persistente carenza di candidati che soddisfino la domanda.',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-50',
    icon: 'warning',
  },
  {
    title: 'La Fatica del Candidato',
    description: 'Processi lunghi e ripetitivi, mancanza di trasparenza e feedback generano demotivazione e scarso engagement verso l\'azienda.',
    colorClass: 'text-amber-500',
    bgClass: 'bg-amber-50',
    icon: 'heart',
  },
  {
    title: 'Lungo Time-to-Hire',
    description: 'Media di 60-90 giorni dalla pubblicazione dell\'annuncio all\'offerta accettata, causando la perdita dei migliori candidati a favore della concorrenza.',
    colorClass: 'text-orange-500',
    bgClass: 'bg-orange-50',
    icon: 'clock',
  },
  {
    title: 'Mismatch Screening-Desiderato',
    description: 'I candidati superano lo screening iniziale ma mancano di competenze specifiche, portando a errori di assunzione e costi di onboarding.',
    colorClass: 'text-rose-500',
    bgClass: 'bg-rose-50',
    icon: 'target',
  },
];

const solutionCards: SolutionCard[] = [
  {
    title: 'Mappatura delle Competenze',
    description: 'Traduce i requisiti di lavoro in componenti di competenze misurabili: ottimizzazione dei processi, analisi dei dati, competenza CAD, conoscenze Lean e molti altri.',
    highlights: ['Analisi automatica delle job description', 'Competenze misurabili', 'Requisiti specifici del ruolo'],
    icon: 'brain',
  },
  {
    title: 'Suite di Valutazione Tecnica',
    description: 'Set di problemi specifici, case study e test per una valutazione mirata delle competenze del candidato.',
    highlights: ['Test di competenze tecniche', 'Case study realistici', 'Simulazioni di scenario'],
    icon: 'clipboard',
  },
  {
    title: 'Matching ottimizzato con AI',
    description: 'Valuta i candidati rispetto ai requisiti del ruolo con ragionamento trasparente, consentendo ai recruiter di produrre rapidamente delle shortlist.',
    highlights: ['Scoring trasparente', 'Shortlist automatica', 'Ranking per competenza'],
    icon: 'search',
  },
  {
    title: 'Feedback Loop & Talent Pool',
    description: 'Alla conclusione del processo, il candidato riceve un feedback sul profilo ed entra a far parte di una talent pool per eventuali ruoli futuri.',
    highlights: ['Feedback ai candidati', 'Database di talenti', 'Engagement migliorato'],
    icon: 'message',
  },
];

const benefitCards: BenefitCard[] = [
  {
    title: 'Sourcing Più Veloce',
    description: 'Identificazione dei candidati qualificati più rapidamente, eseguendo un volume di colloqui che un individuo non potrebbe fisicamente svolgere.',
    icon: 'zap',
  },
  {
    title: 'Migliore Qualità delle Valutazioni',
    description: 'Un migliore allineamento tra competenze del candidato e requisiti del ruolo, migliorando la retention e performance nel primo anno.',
    icon: 'badge',
  },
  {
    title: 'Pool Più Ampio di Talenti',
    description: 'Possibilità di attingere a profili non tradizionali (autodidatti, bootcamp, mid-career changer) che hanno le competenze ma mancano di credenziali convenzionali.',
    icon: 'users',
  },
  {
    title: 'Riduzione dei Bias di Selezione',
    description: 'La valutazione basata sulle competenze riduce il bias inconscio nello screening e supporta gli obiettivi di diversity hiring.',
    icon: 'shield',
  },
];

const processSteps: ProcessStep[] = [
  {
    number: '01',
    title: 'Pubblicazione Posizione',
    description: 'Identificazione delle competenze chiave per il recruiter e pubblicazione della posizione su canali tradizionali e/o PeakTalent.',
    icon: 'file',
  },
  {
    number: '02',
    title: 'Candidatura & Accesso',
    description: 'Il candidato accede alla piattaforma per visualizzare le competenze desiderate e procedere alla candidatura.',
    icon: 'users',
  },
  {
    number: '03',
    title: 'Valutazione Competenze',
    description: 'Il candidato completa la profilazione delle sue competenze e procede alla suite di valutazione tramite test specifici della posizione applicata.',
    icon: 'clipboard',
  },
  {
    number: '04',
    title: 'Scoring',
    description: 'La piattaforma genera in automatico uno score di "best fit" secondo i criteri impostati dal recruiter.',
    icon: 'ranking',
  },
  {
    number: '05',
    title: 'Shortlist & Assunzione',
    description: 'Recruiter visualizza il ranking dinamico e procede ad invitare i candidati ad alto potenziale per interviste mirate.',
    icon: 'check',
  },
];

const whyUsCards: WhyUsCard[] = [
  {
    title: 'Matching Trasparente',
    description: 'Vedete esattamente perché un candidato ha ottenuto un determinato score (no AI black-box), permettendo di modificare i criteri in corso d\'opera.',
    icon: 'eye',
  },
  {
    title: 'Approccio Modulare',
    description: 'Modulari nell\'approccio per permettere una perfetta integrazione con i processi aziendali esistenti e personalizzare la tipologia di assessment.',
    icon: 'layers',
  },
  {
    title: 'Expertise Tecnica',
    description: 'Piattaforma focalizzata nella valutazione di competenze tecniche e misurabili, che riconosce il valore dell\'intervento umano in ambito soft skills e fit culturale.',
    icon: 'factory',
  },
];

const beliefCards: BeliefCard[] = [
  {
    title: 'Competenze Prima di Tutto',
    description: 'L\'assunzione basata sulle competenze riduce il bias, migliora la velocità e apre le porte a talenti al di fuori delle pipeline tradizionali.',
    icon: 'brain',
  },
  {
    title: 'Potenziare, Non Sostituire',
    description: 'Vogliamo permettere ai recruiter di focalizzarsi sulle attività a valore aggiunto e facilitare un percorso di selezione più efficiente.',
    icon: 'spark',
  },
  {
    title: 'Successo Condiviso',
    description: 'Il vostro successo è il nostro successo: stiamo investendo per dimostrare che questo modello funziona anche nell\'industria italiana.',
    icon: 'badge',
  },
];

const stats = [
  { value: '8m+', label: 'di assunzioni l\'anno in Italia' },
  { value: '60%', label: 'Ritenute difficili in determinati settori' },
  { value: 'Fino al 50%', label: 'Riduzione Time-to-Hire con PeakTalent' },
];

const Icon: React.FC<{ name: IconName; className?: string }> = ({ name, className = 'h-5 w-5' }) => {
  const shared = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'spark':
      return <svg {...shared}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M5 16l.75 2.25L8 19l-2.25.75L5 22l-.75-2.25L2 19l2.25-.75L5 16z" /><path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75L19 14z" /></svg>;
    case 'menu':
      return <svg {...shared}><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></svg>;
    case 'close':
      return <svg {...shared}><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>;
    case 'arrow-right':
      return <svg {...shared}><path d="M5 12h14" /><path d="M13 5l7 7-7 7" /></svg>;
    case 'warning':
      return <svg {...shared}><path d="M12 3l9 16H3L12 3z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>;
    case 'clock':
      return <svg {...shared}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
    case 'heart':
      return <svg {...shared}><path d="M12 20s-7-4.35-7-10a4 4 0 017-2 4 4 0 017 2c0 5.65-7 10-7 10z" /></svg>;
    case 'target':
      return <svg {...shared}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M12 4V2" /><path d="M12 22v-2" /><path d="M20 12h2" /><path d="M2 12h2" /></svg>;
    case 'brain':
      return <svg {...shared}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z" /><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z" /></svg>;
    case 'clipboard':
      return <svg {...shared}><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 4.5h6" /><path d="M9 9h6" /><path d="M9 13h6" /></svg>;
    case 'search':
      return <svg {...shared}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2" /></svg>;
    case 'message':
      return <svg {...shared}><path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H9l-5 4V6z" /><path d="M8 9h8" /><path d="M8 12h5" /></svg>;
    case 'zap':
      return <svg {...shared}><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" /></svg>;
    case 'shield':
      return <svg {...shared}><path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>;
    case 'users':
      return <svg {...shared}><path d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>;
    case 'file':
      return <svg {...shared}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>;
    case 'check':
      return <svg {...shared}><path d="M20 6L9 17l-5-5" /></svg>;
    case 'ranking':
      return <svg {...shared}><path d="M4 19h16" /><path d="M7 16V9" /><path d="M12 16V5" /><path d="M17 16v-7" /></svg>;
    case 'eye':
      return <svg {...shared}><path d="M2 12s-3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'layers':
      return <svg {...shared}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 16l9 5 9-5" /></svg>;
    case 'factory':
      return <svg {...shared}><path d="M3 21V9l7 4V9l7 4V5l4 2v14H3z" /><path d="M7 21v-5h4v5" /></svg>;
    case 'badge':
      return <svg {...shared}><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></svg>;
    case 'mail':
      return <svg {...shared}><path d="M4 6h16v12H4z" /><path d="M4 8l8 6 8-6" /></svg>;
    case 'linkedin':
      return <svg {...shared}><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" /><circle cx="4" cy="4" r="2" /></svg>;
    case 'facebook':
      return <svg {...shared}><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" /></svg>;
    default:
      return <svg {...shared}><circle cx="12" cy="12" r="9" /></svg>;
  }
};

const MetricStat: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="text-center">
    <div className="marketing-heading text-3xl font-bold text-[#ff7a1a] md:text-4xl">{value}</div>
    <div className="mt-1 text-sm text-white/90">{label}</div>
  </div>
);

const SectionLabel: React.FC<{ children: React.ReactNode; onDark?: boolean }> = ({ children, onDark = false }) => (
  <span className={`text-sm font-semibold uppercase tracking-[0.24em] ${onDark ? 'text-white/75' : 'text-[#ff7a1a]'}`}>
    {children}
  </span>
);

const useReveal = (immediate: boolean, threshold = 0.18) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(immediate);

  useEffect(() => {
    if (immediate) {
      setVisible(true);
      return;
    }

    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [immediate, threshold]);

  return { ref, visible };
};

const Reveal: React.FC<{
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: RevealDirection;
  immediate?: boolean;
  threshold?: number;
}> = ({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  immediate = false,
  threshold,
}) => {
  const { ref, visible } = useReveal(immediate, threshold);

  return (
    <div
      ref={ref}
      className={`marketing-reveal marketing-reveal-${direction} ${visible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

const MarketingHomePage: React.FC<MarketingHomePageProps> = ({ onEnterPlatform, onLogin }) => {
  const { text } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const [useCompactHeader, setUseCompactHeader] = useState(false);
  const headerRowRef = useRef<HTMLDivElement | null>(null);
  const logoRef = useRef<HTMLAnchorElement | null>(null);
  const navMeasureRef = useRef<HTMLElement | null>(null);
  const actionsMeasureRef = useRef<HTMLDivElement | null>(null);
  const year = useMemo(() => new Date().getFullYear(), []);
  const navItems = useMemo<NavItem[]>(() => ([
    { label: text('Solution', 'Soluzione'), href: '#solution' },
    { label: text('Benefits', 'Vantaggi'), href: '#benefits' },
    { label: text('How It Works', 'Come Funziona'), href: '#process' },
    { label: text('Why Us', 'Perché Noi'), href: '#why-us' },
  ]), [text]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHeroVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const measureHeader = () => {
      const containerWidth = headerRowRef.current?.clientWidth || 0;
      const logoWidth = logoRef.current?.offsetWidth || 0;
      const navWidth = navMeasureRef.current?.scrollWidth || 0;
      const actionsWidth = actionsMeasureRef.current?.scrollWidth || 0;

      if (!containerWidth || !logoWidth) return;

      const sectionGapAllowance = 96;
      const shouldCollapse = logoWidth + navWidth + actionsWidth + sectionGapAllowance > containerWidth;

      if (!cancelled) {
        setUseCompactHeader(shouldCollapse);
      }
    };

    measureHeader();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => measureHeader())
      : null;

    [headerRowRef.current, logoRef.current, navMeasureRef.current, actionsMeasureRef.current].forEach((element) => {
      if (element && resizeObserver) {
        resizeObserver.observe(element);
      }
    });

    window.addEventListener('resize', measureHeader);
    void (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready?.then(() => {
      measureHeader();
    });

    return () => {
      cancelled = true;
      window.removeEventListener('resize', measureHeader);
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!useCompactHeader && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  }, [useCompactHeader, mobileMenuOpen]);

  return (
    <div className="marketing-shell min-h-screen bg-[#f7fafc] text-[#1f2b3d]">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur-md">
        <div ref={headerRowRef} className="relative mx-auto flex h-[44px] max-w-[1400px] items-center justify-between px-4 lg:h-[52px] xl:h-[58px]">
          <a ref={logoRef} href="#hero" className="flex items-center gap-3">
            <img src="/icon.svg" alt="PeakTalent" className="h-7 w-auto" />
            <span className="font-sans text-lg font-bold tracking-tight text-slate-900">PeakTalent</span>
          </a>

          <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-0 overflow-hidden opacity-0">
            <nav ref={navMeasureRef} className="flex items-center gap-4 whitespace-nowrap xl:gap-6">
              {navItems.map((item) => (
                <span key={`measure-${item.label}`} className="text-sm font-medium">
                  {item.label}
                </span>
              ))}
            </nav>
            <div ref={actionsMeasureRef} className="mt-2 flex items-center gap-2 whitespace-nowrap xl:gap-3">
              <span className="px-2 text-sm font-medium">Accedi</span>
              <span className="inline-flex items-center rounded-xl px-4 py-1.5 text-sm font-semibold xl:px-5 xl:py-2">Inizia Ora</span>
            </div>
          </div>

          <nav className={`items-center gap-4 ${useCompactHeader ? 'hidden' : 'flex'} xl:gap-6`}>
            {navItems.map((item) => (
              <a key={item.label} href={item.href} className="whitespace-nowrap text-sm font-medium text-slate-500 transition-colors hover:text-[#ff7a1a]">
                {item.label}
              </a>
            ))}
          </nav>

          <div className={`items-center gap-2 ${useCompactHeader ? 'hidden' : 'flex'} xl:gap-3`}>
            <button
              type="button"
              onClick={onLogin}
              className="whitespace-nowrap px-2 text-sm font-medium text-slate-600 transition-colors hover:text-[#ff7a1a]"
            >
              {text('Sign In', 'Accedi')}
            </button>
            <button
              type="button"
              onClick={onEnterPlatform}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-[#ff7a1a] px-4 py-1.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(249,115,22,0.24)] transition hover:bg-[#f26a07] xl:px-5 xl:py-2"
            >
              {text('Get Started', 'Inizia Ora')}
              <Icon name="arrow-right" className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            className={`${useCompactHeader ? 'block' : 'hidden'} rounded-lg p-2 text-slate-800`}
            onClick={() => setMobileMenuOpen((current) => !current)}
            aria-label="Toggle menu"
          >
            <Icon name={mobileMenuOpen ? 'close' : 'menu'} className="h-6 w-6" />
          </button>
        </div>

        <div className={`marketing-mobile-panel ${useCompactHeader && mobileMenuOpen ? 'is-open' : ''}`}>
          <div className="border-t border-slate-200 bg-white">
            <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="py-1 text-sm font-medium text-slate-700"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogin();
                }}
                className="py-1 text-left text-sm font-medium text-slate-600 transition-colors hover:text-[#ff7a1a]"
              >
                {text('Sign In', 'Accedi')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onEnterPlatform();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff7a1a] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(249,115,22,0.24)]"
              >
                {text('Get Started', 'Inizia Ora')}
                <Icon name="arrow-right" className="h-4 w-4" />
              </button>
              <a
                href={contactHref}
                className="py-1 text-left text-xs font-medium text-slate-500"
              >
                {text('Or email us directly', 'Oppure scrivici direttamente')}
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="min-h-screen">
        <section id="hero" className="relative flex min-h-screen items-start justify-center overflow-hidden pt-24 sm:pt-28 lg:pt-28 xl:items-center xl:pt-20">
          <div className="absolute inset-0">
            <img src="/marketing/why-us-photo.webp" alt="Recruiting digitale e valutazione AI dei candidati con PeakTalent." className="marketing-hero-image h-full w-full object-cover object-top" loading="eager" fetchPriority="high" decoding="async" width="1500" height="844" />
            <div className="absolute inset-0 bg-slate-950/65" />
          </div>

          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="marketing-orb absolute -left-12 top-24 h-56 w-56 rounded-full bg-[#ff7a1a]/20 blur-3xl" />
            <div className="marketing-orb-delayed absolute right-0 top-16 h-72 w-72 rounded-full bg-sky-300/10 blur-3xl" />
          </div>

          <div className="relative z-10 mx-auto max-w-[1400px] -translate-y-2 px-6 py-8 sm:-translate-y-3 sm:py-10 lg:-translate-y-6 lg:py-12 xl:-translate-y-8">
            <div className="mx-auto max-w-4xl text-center">
              <Reveal immediate={heroVisible} delay={0}>
                <div />
              </Reveal>

              <Reveal immediate={heroVisible} delay={110}>
                <h1 className="marketing-heading mb-4 text-4xl font-bold leading-[1.04] text-white sm:mb-5 sm:text-5xl lg:text-[3.45rem] xl:text-6xl">
                  Trova i migliori <span className="text-[#ff7a1a]">talenti</span>
                  <br />
                  in modo più veloce e intelligente
                </h1>
              </Reveal>

              <Reveal immediate={heroVisible} delay={220}>
                <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-white/80 sm:mb-9 sm:text-lg md:text-xl">
                  PeakTalent utilizza l&apos;intelligenza artificiale per valutare le competenze reali dei candidati, accelerando il processo di selezione e migliorandone la qualità
                </p>
              </Reveal>

              <Reveal immediate={heroVisible} delay={320}>
                <div className="flex flex-col items-center gap-4">
                  <a
                    href={demoHref}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a1a] px-7 py-3.5 text-base font-semibold text-white shadow-[0_14px_36px_rgba(249,115,22,0.35)] transition hover:bg-[#f26a07] sm:px-8 sm:py-4 sm:text-lg"
                  >
                    {text('Request a Demo', 'Richiedi una Demo')}
                    <Icon name="arrow-right" className="h-5 w-5" />
                  </a>
                  <button
                    type="button"
                    onClick={onLogin}
                    className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
                  >
                    Accedi alla piattaforma
                  </button>
                </div>
              </Reveal>

              <div className="mt-8 grid grid-cols-1 gap-6 sm:mt-10 md:grid-cols-3 md:gap-8">
                {stats.map((stat, index) => (
                  <Reveal key={stat.label} immediate={heroVisible} delay={430 + (index * 110)}>
                    <MetricStat value={stat.value} label={stat.label} />
                  </Reveal>
                ))}
              </div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#fbf7f2]/88 via-[#fbf7f2]/28 to-transparent" />
        </section>

        <section className="bg-[#fbf7f2] py-20 md:py-32">
          <div className="mx-auto max-w-[1400px] px-4">
            <Reveal className="mb-16 text-center">
              <SectionLabel>Le Sfide di Oggi</SectionLabel>
              <h2 className="marketing-heading mt-4 text-3xl font-bold text-slate-900 md:text-4xl lg:text-5xl">
                Problemi nel Recruiting
              </h2>
            </Reveal>

            <div className="mx-auto grid max-w-5xl gap-6 md:auto-rows-fr md:grid-cols-2">
              {challengeCards.map((card, index) => (
                <Reveal key={card.title} className="h-full" delay={index * 90}>
                  <article className="marketing-card group flex h-full rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.04),0_12px_28px_rgba(15,23,42,0.08)] transition duration-300 hover:shadow-[0_8px_32px_rgba(15,23,42,0.12)] md:p-8">
                    <div className="flex items-start gap-4">
                      <div className={`shrink-0 rounded-2xl p-3 ${card.bgClass} ${card.colorClass}`}>
                        <Icon name={card.icon} className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="marketing-heading mb-2 text-xl font-bold text-slate-900 transition-colors group-hover:text-[#ff7a1a]">
                          {card.title}
                        </h3>
                        <p className="leading-relaxed text-slate-500">{card.description}</p>
                      </div>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="solution" className="bg-[#f7fafc] py-20 md:py-32">
          <div className="mx-auto max-w-[1400px] px-4">
            <Reveal className="mb-16 text-center">
              <SectionLabel>La Nostra Soluzione</SectionLabel>
              <h2 className="marketing-heading mt-4 text-3xl font-bold text-slate-900 md:text-4xl lg:text-5xl">
                Piattaforma di <span className="marketing-gradient-text">Screening &amp; Matching</span>
              </h2>
            </Reveal>

            <div className="mx-auto grid max-w-6xl gap-8 md:auto-rows-fr md:grid-cols-2">
              {solutionCards.map((card, index) => (
                <Reveal key={card.title} className="h-full" delay={index * 110} direction={index % 2 === 0 ? 'up' : 'zoom'}>
                  <article className="marketing-card-glow flex h-full flex-col rounded-3xl border border-orange-100 bg-white p-8 shadow-[0_2px_8px_rgba(15,23,42,0.04),0_12px_32px_rgba(249,115,22,0.16)] transition duration-300">
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#ff7a1a] text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)]">
                      <Icon name={card.icon} className="h-8 w-8" />
                    </div>
                    <h3 className="marketing-heading mb-3 text-2xl font-bold text-slate-900">{card.title}</h3>
                    <p className="mb-6 flex-1 leading-relaxed text-slate-500">{card.description}</p>
                    <ul className="space-y-2">
                      {card.highlights.map((highlight) => (
                        <li key={highlight} className="flex items-center gap-2 text-sm text-slate-800">
                          <Icon name="check" className="h-4 w-4 shrink-0 text-[#ff7a1a]" />
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="benefits" className="relative overflow-hidden bg-[#ff7a1a] py-20 text-white md:py-32">
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}
          />

          <div className="relative z-10 mx-auto max-w-[1400px] px-4">
            <Reveal className="mb-16 text-center">
              <SectionLabel onDark>Vantaggi per le Aziende</SectionLabel>
              <h2 className="marketing-heading mt-4 text-3xl font-bold md:text-4xl lg:text-5xl">
                Perché Scegliere PeakTalent
              </h2>
            </Reveal>

            <div className="mx-auto grid max-w-5xl gap-6 md:auto-rows-fr md:grid-cols-2">
              {benefitCards.map((card, index) => (
                <Reveal key={card.title} className="h-full" delay={index * 80}>
                  <article className="flex h-full flex-col rounded-3xl border border-white/20 bg-white/10 p-8 backdrop-blur-sm transition duration-300 hover:bg-white/15">
                    <div className="mb-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-[#ff7a1a]">
                      <Icon name={card.icon} className="h-7 w-7" />
                    </div>
                    <h3 className="marketing-heading mb-3 text-xl font-bold">{card.title}</h3>
                    <p className="flex-1 text-sm leading-relaxed text-white/80">{card.description}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="process" className="bg-[#f1f7fa] py-20 md:py-32">
          <div className="mx-auto max-w-[1400px] px-4">
            <Reveal className="mb-16 text-center">
              <SectionLabel>Come Funziona</SectionLabel>
              <h2 className="marketing-heading mt-4 text-3xl font-bold text-slate-900 md:text-4xl lg:text-5xl">
                Un Percorso di Recruiting <span className="marketing-gradient-text">Accelerato</span>
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-500">
                PeakTalent si prende carico del primo livello di selezione, permettendo ai recruiter di concentrarsi sulle attività a valore aggiunto.
              </p>
            </Reveal>

            <div className="mx-auto max-w-4xl">
              {processSteps.map((step, index) => (
                <Reveal key={step.number} delay={index * 80} direction={index % 2 === 0 ? 'left' : 'right'}>
                  <div className="relative">
                    {index < processSteps.length - 1 && (
                      <div className="absolute left-6 top-16 hidden h-16 w-0.5 bg-gradient-to-b from-[#ff7a1a] to-[#ff7a1a]/20 md:block" />
                    )}

                    <div className="mb-8 flex items-start gap-6">
                      <div className="relative shrink-0">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ff7a1a] text-white shadow-lg">
                          <Icon name={step.icon} className="h-5 w-5" />
                        </div>
                        <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-white">
                          {step.number.slice(1)}
                        </div>
                      </div>

                      <article className="marketing-card flex-1 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.04),0_12px_24px_rgba(15,23,42,0.07)]">
                        <h3 className="marketing-heading mb-2 text-xl font-bold text-slate-900">{step.title}</h3>
                        <p className="text-slate-500">{step.description}</p>
                      </article>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="why-us" className="bg-[#f7fafc] py-20 md:py-32">
          <div className="mx-auto max-w-[1400px] px-4">
            <Reveal className="mb-16 text-center">
              <SectionLabel>Perché Collaborare con Noi</SectionLabel>
              <h2 className="marketing-heading mt-4 text-3xl font-bold text-slate-900 md:text-4xl lg:text-5xl">
                In Cosa Siamo Diversi
              </h2>
            </Reveal>

            <div className="mx-auto mb-20 grid max-w-5xl gap-8 md:grid-cols-3">
              {whyUsCards.map((card, index) => (
                <Reveal key={card.title} delay={index * 90}>
                  <article className="text-center">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-[#ff7a1a]">
                      <Icon name={card.icon} className="h-8 w-8" />
                    </div>
                    <h3 className="marketing-heading mb-3 text-xl font-bold text-slate-900">{card.title}</h3>
                    <p className="leading-relaxed text-slate-500">{card.description}</p>
                  </article>
                </Reveal>
              ))}
            </div>

            <Reveal className="mb-12 text-center">
              <h2 className="marketing-heading text-3xl font-bold text-slate-900 md:text-4xl">
                In Cosa <span className="marketing-gradient-text">Crediamo</span>
              </h2>
            </Reveal>

            <div className="relative mx-auto max-w-5xl">
              <Reveal className="overflow-hidden rounded-3xl" direction="zoom">
                <img
                  src="/marketing/hero-candidate.webp"
                  alt="Professionista in un contesto di recruiting digitale e curriculum valutato con AI."
                  className="h-auto w-full rounded-3xl object-cover md:min-h-[500px]"
                  loading="lazy"
                  decoding="async"
                  width="1500"
                  height="844"
                />
              </Reveal>

              <div className="mt-6 flex flex-col gap-4 md:absolute md:left-0 md:top-1/2 md:w-[420px] md:-translate-x-8 md:-translate-y-1/2 md:mt-0">
                {beliefCards.map((card, index) => (
                  <Reveal key={card.title} delay={index * 110} direction="left">
                    <article className="marketing-card rounded-3xl border-l-4 border-[#ff7a1a] bg-white/95 p-5 shadow-[0_8px_32px_rgba(15,23,42,0.12)] backdrop-blur-sm">
                      <div className="mb-3 flex items-center gap-3">
                        <Icon name={card.icon} className="h-5 w-5 text-[#ff7a1a]" />
                        <h3 className="marketing-heading text-lg font-bold text-slate-900">{card.title}</h3>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-500">{card.description}</p>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-gradient-to-br from-[#ff7a1a] via-[#ff7a1a] to-[#ff9d47] py-20 text-white md:py-32">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="marketing-orb absolute right-10 top-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="marketing-orb-delayed absolute bottom-10 left-10 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
          </div>

          <div className="relative z-10 mx-auto max-w-[1400px] px-4">
            <Reveal className="mx-auto max-w-3xl text-center">
              <h2 className="marketing-heading mb-6 text-3xl font-bold md:text-4xl lg:text-5xl">
                Pronto a Trasformare il Tuo Recruiting?
              </h2>
              <div className="flex justify-center">
                <a
                  href={demoHref}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-lg font-semibold text-[#ff7a1a] shadow-[0_14px_36px_rgba(15,23,42,0.16)] transition sm:w-auto"
                >
                  Richiedi una Demo
                  <Icon name="arrow-right" className="h-5 w-5" />
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="bg-slate-900 py-12 text-white">
        <div className="mx-auto max-w-[1400px] px-4">
          <div className="mb-8 grid gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="mb-4 flex items-center gap-3">
                <img src="/icon.svg" alt="PeakTalent" className="h-10 w-auto" />
                <span className="font-sans text-xl font-bold tracking-tight">PeakTalent</span>
              </div>
              <div className="flex gap-4">
                <a
                  href={contactHref}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
                  aria-label="Email"
                >
                  <Icon name="mail" className="h-5 w-5" />
                </a>
                <a
                  href="https://www.linkedin.com/company/pktalent/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
                  aria-label="LinkedIn"
                >
                  <Icon name="linkedin" className="h-5 w-5" />
                </a>
                <a
                  href="https://www.facebook.com/PeakTalent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
                  aria-label="Facebook"
                >
                  <Icon name="facebook" className="h-5 w-5" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="marketing-heading mb-4 font-semibold">Piattaforma</h4>
              <ul className="space-y-2 text-white/70">
                <li><a href="#solution" className="transition-colors hover:text-white">Soluzione</a></li>
                <li><a href="#benefits" className="transition-colors hover:text-white">Vantaggi</a></li>
                <li><a href="#process" className="transition-colors hover:text-white">Come Funziona</a></li>
                <li><a href="#why-us" className="transition-colors hover:text-white">Perché Noi</a></li>
              </ul>
            </div>

            <div>
              <h4 className="marketing-heading mb-4 font-semibold">Contatti</h4>
              <ul className="space-y-2 text-white/70">
                <li><a href={contactHref} className="transition-colors hover:text-white">info@peaktalent.it</a></li>
                <li>Milano, Italia</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-white/20 pt-8 md:flex-row">
            <p className="text-sm text-white/50">© {year} PeakTalent. Tutti i diritti riservati.</p>
            <div className="flex gap-6 text-sm text-white/50">
              <Link
                to="/privacy-policy"
                className="transition-colors hover:text-white"
                title="Privacy Policy"
              >
                Privacy Policy
              </Link>
              <Link
                to="/cookie-policy"
                className="transition-colors hover:text-white"
                title="Cookie Policy"
              >
                Cookie Policy
              </Link>
              <Link
                to="/terms"
                className="transition-colors hover:text-white"
                title="Termini e Condizioni"
              >
                Termini e Condizioni
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MarketingHomePage;
