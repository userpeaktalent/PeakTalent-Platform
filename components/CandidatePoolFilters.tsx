import React, { useState } from 'react';
import { CandidateProfile } from '../types';
import { useLanguage } from './LanguageProvider';
import { EDUCATION_LEVELS, getEducationLevelOrdinal } from '../utils/education';

export type CandidatePoolRow = {
    candidate: CandidateProfile;
    jobTitles: string[];
};

export interface CandidatePoolFilterState {
    jobTitles: string[];
    seniorities: string[];
    countries: string[];
    jobFunctions: string[];
    skills: string[];
    minYears: number | null;
    maxYears: number | null;
    languageCode: string;
    languageMinLevel: string;
    minEducation: string;
    jobSearchStatus: string;
    maxNoticeMonths: number | null;
}

export interface CandidatePoolFilterOptions {
    jobTitles: string[];
    seniorities: string[];
    countries: string[];
    jobFunctions: string[];
    languages: string[];
}

const SENIORITY_LABELS_IT: Record<string, string> = {
    student: 'studente',
    intern: 'stagista',
    junior: 'junior',
    mid: 'intermedio',
    senior: 'senior',
    lead: 'lead',
};

const JOB_SEARCH_STATUS_LABELS_IT: Record<string, string> = {
    actively_looking: 'attivamente in cerca',
    open_to_opportunities: 'aperto a opportunità',
    not_looking: 'non in cerca',
};

const JOB_SEARCH_STATUS_LABELS_EN: Record<string, string> = {
    actively_looking: 'Actively looking',
    open_to_opportunities: 'Open to opportunities',
    not_looking: 'Not looking',
};

const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LANGUAGE_LEVEL_RANK: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

export const emptyFilterState = (): CandidatePoolFilterState => ({
    jobTitles: [],
    seniorities: [],
    countries: [],
    jobFunctions: [],
    skills: [],
    minYears: null,
    maxYears: null,
    languageCode: '',
    languageMinLevel: '',
    minEducation: '',
    jobSearchStatus: '',
    maxNoticeMonths: null,
});

export const extractFilterOptions = (rows: CandidatePoolRow[]): CandidatePoolFilterOptions => {
    const jobTitles = new Set<string>();
    const seniorities = new Set<string>();
    const countries = new Set<string>();
    const jobFunctions = new Set<string>();
    const languages = new Set<string>();
    for (const row of rows) {
        row.jobTitles.forEach(t => t && jobTitles.add(t));
        const c = row.candidate;
        if (c.current_seniority_level) seniorities.add(c.current_seniority_level);
        if (c.residence?.country) countries.add(c.residence.country);
        if (c.current_job_function) jobFunctions.add(c.current_job_function);
        c.target_job_functions?.forEach(f => f && jobFunctions.add(f));
        c.languages?.forEach(l => l.language && languages.add(l.language));
    }
    const sortAsc = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b));
    return {
        jobTitles: sortAsc(jobTitles),
        seniorities: sortAsc(seniorities),
        countries: sortAsc(countries),
        jobFunctions: sortAsc(jobFunctions),
        languages: sortAsc(languages),
    };
};

export const applyCandidateFilters = (rows: CandidatePoolRow[], f: CandidatePoolFilterState): CandidatePoolRow[] => {
    const skillsLower = f.skills.map(s => s.toLowerCase());
    return rows.filter(row => {
        const c = row.candidate;
        if (f.jobTitles.length && !row.jobTitles.some(t => f.jobTitles.includes(t))) return false;
        if (f.seniorities.length && (!c.current_seniority_level || !f.seniorities.includes(c.current_seniority_level))) return false;
        if (f.countries.length && (!c.residence?.country || !f.countries.includes(c.residence.country))) return false;
        if (f.jobFunctions.length) {
            const fnSet = new Set<string>();
            if (c.current_job_function) fnSet.add(c.current_job_function);
            c.target_job_functions?.forEach(t => t && fnSet.add(t));
            if (!f.jobFunctions.some(fn => fnSet.has(fn))) return false;
        }
        if (f.minYears != null && (c.total_years_experience ?? -1) < f.minYears) return false;
        if (f.maxYears != null && (c.total_years_experience ?? Number.POSITIVE_INFINITY) > f.maxYears) return false;
        if (skillsLower.length) {
            const allSkills = [
                ...(c.skills || []).map(s => (s.skill_name || '').toLowerCase()),
                ...(c.it_skills || []).map(s => (s.skill_name || '').toLowerCase()),
            ];
            const hasAll = skillsLower.every(q => allSkills.some(s => s.includes(q)));
            if (!hasAll) return false;
        }
        if (f.languageCode) {
            const entry = c.languages?.find(l => l.language === f.languageCode);
            if (!entry) return false;
            if (f.languageMinLevel) {
                const userRank = LANGUAGE_LEVEL_RANK[entry.level] ?? 0;
                const minRank = LANGUAGE_LEVEL_RANK[f.languageMinLevel] ?? 0;
                if (userRank < minRank) return false;
            }
        }
        if (f.minEducation) {
            const minOrd = getEducationLevelOrdinal(f.minEducation);
            const candOrds = (c.education || []).map(e => getEducationLevelOrdinal(e.degree_level));
            const maxCandOrd = candOrds.length ? Math.max(...candOrds) : 0;
            if (maxCandOrd < minOrd) return false;
        }
        if (f.jobSearchStatus && c.job_search_status !== f.jobSearchStatus) return false;
        if (f.maxNoticeMonths != null) {
            if (c.notice_period_months == null) return false;
            if (c.notice_period_months > f.maxNoticeMonths) return false;
        }
        return true;
    });
};

export const countActiveFilters = (f: CandidatePoolFilterState): number => {
    let n = 0;
    n += f.jobTitles.length;
    n += f.seniorities.length;
    n += f.countries.length;
    n += f.jobFunctions.length;
    n += f.skills.length;
    if (f.minYears != null) n++;
    if (f.maxYears != null) n++;
    if (f.languageCode) n++;
    if (f.minEducation) n++;
    if (f.jobSearchStatus) n++;
    if (f.maxNoticeMonths != null) n++;
    return n;
};

const FilterSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = true }) => (
    <details open={defaultOpen} className="group border-b border-slate-200 py-3 last:border-b-0 dark:border-slate-800">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-black uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300">
            <span>{title}</span>
            <svg className="h-4 w-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        </summary>
        <div className="mt-3 space-y-2">{children}</div>
    </details>
);

interface CheckboxListProps {
    values: string[];
    selected: string[];
    onToggle: (v: string) => void;
    labelFor?: (v: string) => string;
    emptyText: string;
}

const CheckboxList: React.FC<CheckboxListProps> = ({ values, selected, onToggle, labelFor, emptyText }) => {
    if (values.length === 0) {
        return <p className="text-xs text-slate-400 dark:text-slate-500">{emptyText}</p>;
    }
    return (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {values.map(v => (
                <li key={v}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                        <input
                            type="checkbox"
                            checked={selected.includes(v)}
                            onChange={() => onToggle(v)}
                            className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                        />
                        <span className="truncate">{labelFor ? labelFor(v) : v}</span>
                    </label>
                </li>
            ))}
        </ul>
    );
};

interface CandidatePoolFiltersPanelProps {
    filters: CandidatePoolFilterState;
    options: CandidatePoolFilterOptions;
    onChange: (next: CandidatePoolFilterState) => void;
    onReset: () => void;
    onCloseMobile?: () => void;
}

export const CandidatePoolFiltersPanel: React.FC<CandidatePoolFiltersPanelProps> = ({ filters, options, onChange, onReset, onCloseMobile }) => {
    const { text, language } = useLanguage();
    const active = countActiveFilters(filters);
    const [skillInput, setSkillInput] = useState('');

    const toggleMulti = (key: 'jobTitles' | 'seniorities' | 'countries' | 'jobFunctions', value: string) => {
        const current = filters[key];
        const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
        onChange({ ...filters, [key]: next });
    };

    const commitSkill = () => {
        const v = skillInput.trim();
        if (!v) return;
        if (!filters.skills.some(s => s.toLowerCase() === v.toLowerCase())) {
            onChange({ ...filters, skills: [...filters.skills, v] });
        }
        setSkillInput('');
    };

    const seniorityLabel = (v: string) => (language === 'it' ? SENIORITY_LABELS_IT[v] || v : v);
    const statusLabel = (v: string) => (language === 'it' ? JOB_SEARCH_STATUS_LABELS_IT[v] : JOB_SEARCH_STATUS_LABELS_EN[v]);

    const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-orange-700 dark:focus:ring-orange-950/40';

    return (
        <aside className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <header className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900 dark:text-slate-100">{text('Filters', 'Filtri')}</h2>
                    {active > 0 && (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">{active}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {active > 0 && (
                        <button type="button" onClick={onReset} className="text-xs font-bold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300">
                            {text('Reset', 'Reset')}
                        </button>
                    )}
                    {onCloseMobile && (
                        <button type="button" onClick={onCloseMobile} className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden" aria-label={text('Close', 'Chiudi')}>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </header>

            <div className="flex-1 overflow-y-auto pr-1">
                <FilterSection title={text('Job posting', 'Job posting')}>
                    <CheckboxList
                        values={options.jobTitles}
                        selected={filters.jobTitles}
                        onToggle={(v) => toggleMulti('jobTitles', v)}
                        emptyText={text('No jobs available', 'Nessun job disponibile')}
                    />
                </FilterSection>

                <FilterSection title={text('Seniority', 'Seniority')}>
                    <CheckboxList
                        values={options.seniorities}
                        selected={filters.seniorities}
                        onToggle={(v) => toggleMulti('seniorities', v)}
                        labelFor={seniorityLabel}
                        emptyText={text('No data', 'Nessun dato')}
                    />
                </FilterSection>

                <FilterSection title={text('Country', 'Paese')}>
                    <CheckboxList
                        values={options.countries}
                        selected={filters.countries}
                        onToggle={(v) => toggleMulti('countries', v)}
                        emptyText={text('No data', 'Nessun dato')}
                    />
                </FilterSection>

                <FilterSection title={text('Years of experience', 'Anni di esperienza')}>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={0}
                            placeholder={text('Min', 'Min')}
                            value={filters.minYears ?? ''}
                            onChange={(e) => onChange({ ...filters, minYears: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                            className={inputClass}
                        />
                        <span className="text-xs text-slate-400">–</span>
                        <input
                            type="number"
                            min={0}
                            placeholder={text('Max', 'Max')}
                            value={filters.maxYears ?? ''}
                            onChange={(e) => onChange({ ...filters, maxYears: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                            className={inputClass}
                        />
                    </div>
                </FilterSection>

                <FilterSection title={text('Job function', 'Funzione')}>
                    <CheckboxList
                        values={options.jobFunctions}
                        selected={filters.jobFunctions}
                        onToggle={(v) => toggleMulti('jobFunctions', v)}
                        emptyText={text('No data', 'Nessun dato')}
                    />
                </FilterSection>

                <FilterSection title={text('Skills', 'Competenze')}>
                    {filters.skills.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                            {filters.skills.map(s => (
                                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                                    {s}
                                    <button
                                        type="button"
                                        onClick={() => onChange({ ...filters, skills: filters.skills.filter(x => x !== s) })}
                                        className="hover:text-orange-900 dark:hover:text-orange-200"
                                        aria-label={text('Remove', 'Rimuovi')}
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-1.5">
                        <input
                            type="text"
                            value={skillInput}
                            onChange={(e) => setSkillInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitSkill(); } }}
                            placeholder={text('Add skill...', 'Aggiungi skill...')}
                            className={inputClass}
                        />
                        <button type="button" onClick={commitSkill} className="rounded-lg bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                            +
                        </button>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{text('All entered skills must match.', 'Tutte le skill inserite devono corrispondere.')}</p>
                </FilterSection>

                <FilterSection title={text('Language', 'Lingua')} defaultOpen={false}>
                    <div className="space-y-2">
                        <select
                            value={filters.languageCode}
                            onChange={(e) => onChange({ ...filters, languageCode: e.target.value, languageMinLevel: e.target.value ? filters.languageMinLevel : '' })}
                            className={inputClass}
                        >
                            <option value="">{text('Any language', 'Qualsiasi lingua')}</option>
                            {options.languages.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        {filters.languageCode && (
                            <select
                                value={filters.languageMinLevel}
                                onChange={(e) => onChange({ ...filters, languageMinLevel: e.target.value })}
                                className={inputClass}
                            >
                                <option value="">{text('Any level', 'Qualsiasi livello')}</option>
                                {LANGUAGE_LEVELS.map(lv => <option key={lv} value={lv}>≥ {lv}</option>)}
                            </select>
                        )}
                    </div>
                </FilterSection>

                <FilterSection title={text('Min education level', 'Livello educazione minimo')} defaultOpen={false}>
                    <select
                        value={filters.minEducation}
                        onChange={(e) => onChange({ ...filters, minEducation: e.target.value })}
                        className={inputClass}
                    >
                        <option value="">{text('Any', 'Qualsiasi')}</option>
                        {EDUCATION_LEVELS.map(l => (
                            <option key={l.code} value={l.code}>≥ {language === 'it' ? l.labelIt : l.labelEn}</option>
                        ))}
                    </select>
                </FilterSection>

                <FilterSection title={text('Job search status', 'Stato ricerca')} defaultOpen={false}>
                    <select
                        value={filters.jobSearchStatus}
                        onChange={(e) => onChange({ ...filters, jobSearchStatus: e.target.value })}
                        className={inputClass}
                    >
                        <option value="">{text('Any', 'Qualsiasi')}</option>
                        {['actively_looking', 'open_to_opportunities', 'not_looking'].map(s => (
                            <option key={s} value={s}>{statusLabel(s)}</option>
                        ))}
                    </select>
                </FilterSection>

                <FilterSection title={text('Max notice period', 'Preavviso massimo')} defaultOpen={false}>
                    <select
                        value={filters.maxNoticeMonths == null ? '' : String(filters.maxNoticeMonths)}
                        onChange={(e) => onChange({ ...filters, maxNoticeMonths: e.target.value === '' ? null : Number(e.target.value) })}
                        className={inputClass}
                    >
                        <option value="">{text('Any', 'Qualsiasi')}</option>
                        <option value="0">{text('Immediate', 'Immediato')}</option>
                        <option value="1">≤ 1 {text('month', 'mese')}</option>
                        <option value="3">≤ 3 {text('months', 'mesi')}</option>
                        <option value="6">≤ 6 {text('months', 'mesi')}</option>
                    </select>
                </FilterSection>
            </div>
        </aside>
    );
};
