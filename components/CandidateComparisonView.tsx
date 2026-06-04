import React, { useEffect, useMemo } from 'react';
import { CandidateProfile, JobProfile, MatchScoreBreakdown, MatchingPillarWeights } from '../types';
import { formatCandidateName } from '../utils/nameFormat';
import { useLanguage } from './LanguageProvider';

/**
 * Side-by-side comparison view for 2–3 candidates against the same job.
 *
 * Rendered as a fullscreen overlay (not a route) to stay coherent with
 * CandidateProfileView and keep the matches list URL/state intact behind it.
 *
 * Pillar table: rows = 5 ranking pillars; columns = candidates. Each cell shows
 * score%, a horizontal bar, and a delta vs. the average of the *other* selected
 * candidates (so with N=2 it's the head-to-head gap, with N=3 it's vs. the
 * group average excluding the current column).
 */

export interface ComparisonRow {
    candidate: CandidateProfile;
    scoreDetails: MatchScoreBreakdown;
    /** Final percentage including any recruiter override / quiz blend, as shown in the matches list. */
    effectiveScorePercent: number;
}

interface CandidateComparisonViewProps {
    rows: ComparisonRow[];
    job: JobProfile;
    weights: MatchingPillarWeights;
    onClose: () => void;
    onRemove?: (candidateId: string) => void;
    onOpenProfile?: (candidate: CandidateProfile) => void;
}

type PillarKey = 'semantic' | 'hard' | 'industry' | 'education' | 'careerPrestige';

interface PillarMeta {
    key: PillarKey;
    labelEn: string;
    labelIt: string;
    barClass: string;
    dotClass: string;
    accentClass: string;
    /** Score selector returning a 0-1 value. */
    getScore: (b: MatchScoreBreakdown) => number;
}

const PILLAR_META: PillarMeta[] = [
    {
        key: 'semantic',
        labelEn: 'AI Semantic Alignment',
        labelIt: 'Allineamento Semantico AI',
        barClass: 'bg-violet-500',
        dotClass: 'bg-violet-500',
        accentClass: 'text-violet-600 dark:text-violet-300',
        getScore: (b) => b.semanticScore,
    },
    {
        key: 'hard',
        labelEn: 'Hard Skills',
        labelIt: 'Competenze tecniche',
        barClass: 'bg-emerald-500',
        dotClass: 'bg-emerald-500',
        accentClass: 'text-emerald-600 dark:text-emerald-300',
        getScore: (b) => b.hardSkillsScore,
    },
    {
        key: 'industry',
        labelEn: 'Industry Alignment',
        labelIt: 'Allineamento di settore',
        barClass: 'bg-sky-500',
        dotClass: 'bg-sky-500',
        accentClass: 'text-sky-600 dark:text-sky-300',
        getScore: (b) => b.industryScore,
    },
    {
        key: 'education',
        labelEn: 'Education Quality',
        labelIt: 'Qualità del percorso formativo',
        barClass: 'bg-amber-500',
        dotClass: 'bg-amber-500',
        accentClass: 'text-amber-600 dark:text-amber-300',
        getScore: (b) => b.educationScore,
    },
    {
        key: 'careerPrestige',
        labelEn: 'Career Prestige',
        labelIt: 'Prestigio carriera',
        barClass: 'bg-rose-500',
        dotClass: 'bg-rose-500',
        accentClass: 'text-rose-600 dark:text-rose-300',
        getScore: (b) => b.careerPrestigeScore,
    },
];

const getInitials = (candidate: CandidateProfile): string => {
    const first = candidate.personal_info?.first_name?.trim()?.[0] || '';
    const last = candidate.personal_info?.last_name?.trim()?.[0] || '';
    const initials = `${first}${last}`.toUpperCase();
    return initials || '?';
};

const getMatchBandClasses = (percent: number) => {
    if (percent >= 60) return { ring: 'text-emerald-600 dark:text-emerald-400', label: 'text-emerald-700 dark:text-emerald-300' };
    if (percent >= 50) return { ring: 'text-green-500 dark:text-green-400', label: 'text-green-600 dark:text-green-300' };
    if (percent >= 40) return { ring: 'text-orange-500 dark:text-orange-400', label: 'text-orange-600 dark:text-orange-300' };
    return { ring: 'text-rose-500', label: 'text-rose-600 dark:text-rose-300' };
};

/** Average pillar score across all OTHER candidates (excludes the current column). */
const computeDelta = (scores: number[], index: number): number => {
    if (scores.length < 2) return 0;
    const others = scores.filter((_, i) => i !== index);
    if (others.length === 0) return 0;
    const avg = others.reduce((acc, s) => acc + s, 0) / others.length;
    return scores[index] - avg;
};

const formatDelta = (delta: number): { text: string; color: string } => {
    const pct = delta * 100;
    if (Math.abs(pct) < 1) {
        return { text: '≈ avg', color: 'text-slate-400 dark:text-slate-500' };
    }
    const sign = pct > 0 ? '+' : '';
    const text = `${sign}${pct.toFixed(0)}%`;
    if (pct >= 5) return { text, color: 'text-emerald-600 dark:text-emerald-400' };
    if (pct <= -5) return { text, color: 'text-rose-600 dark:text-rose-400' };
    return { text, color: 'text-slate-500 dark:text-slate-400' };
};

const getLatestExperienceLabel = (candidate: CandidateProfile, fallback: string): string => {
    const experiences = Array.isArray(candidate.experiences) ? candidate.experiences : [];
    const latest = experiences.find((exp) => exp?.is_current_position) || experiences[0];
    if (!latest) return fallback;
    const role = latest.role || '';
    const company = latest.company || '';
    if (role && company) return `${role} · ${company}`;
    return role || company || fallback;
};

const getHighestDegreeLabel = (candidate: CandidateProfile, fallback: string): string => {
    const education = Array.isArray(candidate.education) ? candidate.education : [];
    if (education.length === 0) return fallback;
    // We don't reorder by level here — the form keeps user ordering, so just
    // pick the first non-empty one. The pillar score handles level grading.
    const primary = education[0];
    const degree = primary?.degree_level || '';
    const major = primary?.major || '';
    if (degree && major) return `${degree} · ${major}`;
    return degree || major || fallback;
};

const CandidateComparisonView: React.FC<CandidateComparisonViewProps> = ({
    rows,
    job,
    weights,
    onClose,
    onRemove,
    onOpenProfile,
}) => {
    const { text, language } = useLanguage();
    const lang = language === 'it' ? 'it' : 'en';

    // Lock body scroll while the overlay is open. The matches list underneath
    // can have thousands of pixels; without this, scrolling inside the modal
    // bleeds through on touch devices.
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    // ESC closes the overlay — standard expectation for fullscreen modals.
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const columnCount = rows.length;
    const gridTemplate = `minmax(160px, 200px) repeat(${columnCount}, minmax(0, 1fr))`;

    // Pre-compute per-pillar score arrays once so each row doesn't re-scan rows.
    const pillarScores = useMemo(() => {
        return PILLAR_META.map((meta) => rows.map((row) => meta.getScore(row.scoreDetails)));
    }, [rows]);

    const finalScoresPercent = useMemo(
        () => rows.map((row) => row.effectiveScorePercent),
        [rows]
    );

    if (rows.length === 0) {
        // Defensive — parent should not mount us empty, but avoid a crash if it does.
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 dark:bg-slate-950"
            role="dialog"
            aria-modal="true"
            aria-label={text('Candidate comparison', 'Confronto candidati')}
        >
            {/* Sticky header — title + close. */}
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-black tracking-tight text-slate-900 sm:text-xl dark:text-slate-100">
                            {text('Compare candidates', 'Confronta candidati')}
                        </h1>
                        <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                            {text(`for ${job.title}`, `per ${job.title}`)} · {rows.length} {text('candidates', 'candidati')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-orange-500/50 dark:hover:text-orange-300"
                        aria-label={text('Close comparison', 'Chiudi confronto')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        {text('Close', 'Chiudi')}
                    </button>
                </div>
            </div>

            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                {/* Candidate header strip — names + total score rings. */}
                <div
                    className="grid items-stretch gap-3"
                    style={{ gridTemplateColumns: gridTemplate }}
                >
                    <div className="flex items-end pb-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                            {text('Candidate', 'Candidato')}
                        </span>
                    </div>
                    {rows.map((row, columnIndex) => {
                        const percent = Math.round(row.effectiveScorePercent);
                        const band = getMatchBandClasses(percent);
                        const candidateName = formatCandidateName(row.candidate) || text('Unnamed Candidate', 'Candidato senza nome');
                        const initials = getInitials(row.candidate);
                        const isBestOverall = percent === Math.max(...finalScoresPercent.map((p) => Math.round(p))) && finalScoresPercent.length > 1;
                        return (
                            <div
                                key={row.candidate.id}
                                className={`relative flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900 ${
                                    isBestOverall
                                        ? 'border-emerald-300 ring-1 ring-emerald-200/60 dark:border-emerald-500/40 dark:ring-emerald-500/20'
                                        : 'border-slate-200 dark:border-slate-800'
                                }`}
                            >
                                {onRemove && rows.length > 2 && (
                                    <button
                                        type="button"
                                        onClick={() => onRemove(row.candidate.id)}
                                        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-rose-100 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                                        aria-label={text('Remove from comparison', 'Rimuovi dal confronto')}
                                        title={text('Remove from comparison', 'Rimuovi dal confronto')}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                                <div className="flex items-center gap-3">
                                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-orange-200 text-base font-black text-orange-700 dark:from-orange-500/20 dark:to-orange-500/10 dark:text-orange-200">
                                        {initials}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-slate-900 dark:text-slate-100">
                                            {candidateName}
                                        </p>
                                        <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                            {getLatestExperienceLabel(row.candidate, text('No experience', 'Nessuna esperienza'))}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="relative h-[68px] w-[68px] flex-shrink-0">
                                        <svg className="h-full w-full" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                                            <circle cx="18" cy="18" r="16" fill="none" className="stroke-current text-slate-100 dark:text-slate-800" strokeWidth="3" />
                                            <circle
                                                cx="18"
                                                cy="18"
                                                r="16"
                                                fill="none"
                                                className={`stroke-current ${band.ring}`}
                                                strokeWidth="3"
                                                strokeDasharray={`${percent}, 100`}
                                                strokeLinecap="round"
                                                transform="rotate(-90 18 18)"
                                            />
                                        </svg>
                                        <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-slate-800 dark:text-slate-100">
                                            {percent}%
                                        </span>
                                    </div>
                                    {onOpenProfile && (
                                        <button
                                            type="button"
                                            onClick={() => onOpenProfile(row.candidate)}
                                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-orange-500/50 dark:hover:text-orange-300"
                                        >
                                            {text('Open profile', 'Apri profilo')}
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Pillar-by-pillar table. */}
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                            {text('Pillar breakdown', 'Dettaglio per pilastro')}
                        </h2>
                        <p className="text-[10px] font-semibold text-slate-400">
                            {text('Δ shown vs. group average', 'Δ rispetto alla media del gruppo')}
                        </p>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {PILLAR_META.map((meta, pillarIndex) => {
                            const weightPct = Math.round((weights[meta.key] ?? 0) * 100);
                            const scores = pillarScores[pillarIndex];
                            const maxScore = Math.max(...scores);
                            return (
                                <div
                                    key={meta.key}
                                    className="grid items-center gap-3 px-5 py-4"
                                    style={{ gridTemplateColumns: gridTemplate }}
                                >
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                                            <span className="text-[12px] font-black uppercase tracking-tight text-slate-800 dark:text-slate-100">
                                                {lang === 'it' ? meta.labelIt : meta.labelEn}
                                            </span>
                                        </div>
                                        <span className="ml-4 mt-0.5 text-[10px] font-semibold text-slate-400">
                                            {text(`weight ${weightPct}%`, `peso ${weightPct}%`)}
                                        </span>
                                    </div>
                                    {scores.map((score, columnIndex) => {
                                        const delta = computeDelta(scores, columnIndex);
                                        const deltaFmt = formatDelta(delta);
                                        const isLeader = score === maxScore && scores.length > 1 && score > 0;
                                        return (
                                            <div key={rows[columnIndex].candidate.id} className="flex flex-col gap-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-sm font-black ${isLeader ? meta.accentClass : 'text-slate-700 dark:text-slate-200'}`}>
                                                        {Math.round(score * 100)}%
                                                    </span>
                                                    <span className={`text-[10px] font-bold ${deltaFmt.color}`}>
                                                        {deltaFmt.text}
                                                    </span>
                                                </div>
                                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                                    <div
                                                        className={`h-full ${meta.barClass} transition-all duration-700 ease-out`}
                                                        style={{ width: `${Math.max(2, Math.round(score * 100))}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Quick stats grid: experience, education, residence. Surfaces the
                    demographic context the pillar scores compress away. */}
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                            {text('Profile snapshot', 'Sintesi profilo')}
                        </h2>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {[
                            {
                                label: text('Total experience', 'Esperienza totale'),
                                getValue: (c: CandidateProfile) => {
                                    const years = c.total_years_experience;
                                    if (typeof years !== 'number' || !Number.isFinite(years)) return '—';
                                    return text(`${years} yrs`, `${years} anni`);
                                },
                            },
                            {
                                label: text('Highest degree', 'Titolo di studio'),
                                getValue: (c: CandidateProfile) =>
                                    getHighestDegreeLabel(c, '—'),
                            },
                            {
                                label: text('Current role', 'Ruolo attuale'),
                                getValue: (c: CandidateProfile) =>
                                    getLatestExperienceLabel(c, '—'),
                            },
                            {
                                label: text('Residence', 'Residenza'),
                                getValue: (c: CandidateProfile) => {
                                    const city = c.residence?.city || '';
                                    const country = c.residence?.country || '';
                                    if (city && country) return `${city}, ${country}`;
                                    return city || country || '—';
                                },
                            },
                            {
                                label: text('Notice period', 'Preavviso'),
                                getValue: (c: CandidateProfile) => {
                                    const months = c.notice_period_months;
                                    if (typeof months !== 'number' || !Number.isFinite(months)) return '—';
                                    return text(`${months} mo`, `${months} mesi`);
                                },
                            },
                            {
                                label: text('Languages', 'Lingue'),
                                getValue: (c: CandidateProfile) => {
                                    const list = Array.isArray(c.languages) ? c.languages : [];
                                    if (list.length === 0) return '—';
                                    return list
                                        .slice(0, 3)
                                        .map((l) => `${l.language} (${l.level})`)
                                        .join(', ') + (list.length > 3 ? ` +${list.length - 3}` : '');
                                },
                            },
                        ].map((stat) => (
                            <div
                                key={stat.label}
                                className="grid items-center gap-3 px-5 py-3"
                                style={{ gridTemplateColumns: gridTemplate }}
                            >
                                <span className="text-[11px] font-bold uppercase tracking-tight text-slate-500 dark:text-slate-400">
                                    {stat.label}
                                </span>
                                {rows.map((row) => (
                                    <span
                                        key={row.candidate.id}
                                        className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200"
                                        title={stat.getValue(row.candidate)}
                                    >
                                        {stat.getValue(row.candidate)}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                <p className="mt-4 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    {text(
                        'Highlights mark the leading candidate per pillar. AI scoring is decision support, not a verdict.',
                        'Gli highlight segnano il candidato in vetta per ogni pilastro. Il punteggio AI è di supporto, non un verdetto.'
                    )}
                </p>
            </div>
        </div>
    );
};

export default CandidateComparisonView;
