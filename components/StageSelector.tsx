import React from 'react';
import { Link } from 'react-router-dom';
import { ApplicationStage, PIPELINE_STAGES, getStageDef } from '../utils/pipelineStages';
import { useLanguage } from './LanguageProvider';

interface StageSelectorProps {
    value: ApplicationStage;
    onChange: (next: ApplicationStage) => void;
    disabled?: boolean;
    compact?: boolean;
}

/** Coloured select that lets the recruiter move a candidate between pipeline stages. */
export const StageSelector: React.FC<StageSelectorProps> = ({ value, onChange, disabled, compact }) => {
    const { language } = useLanguage();
    const def = getStageDef(value);

    return (
        <select
            value={value}
            onChange={(e) => { e.stopPropagation(); onChange(e.target.value as ApplicationStage); }}
            onClick={(e) => e.stopPropagation()}
            disabled={disabled}
            className={`inline-flex h-[30px] items-center justify-center rounded-full border ${def.accent.border} ${def.accent.bg} ${def.accent.text} font-bold uppercase leading-none tracking-wider outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50 ${compact ? 'px-2 text-[10px]' : 'px-3 text-xs'}`}
            aria-label={language === 'it' ? 'Cambia stage' : 'Change stage'}
        >
            {PIPELINE_STAGES.map(s => (
                <option key={s.id} value={s.id}>{language === 'it' ? s.labelIt : s.labelEn}</option>
            ))}
        </select>
    );
};

interface MatchesViewToggleProps {
    jobId: string;
    current: 'ranking' | 'pipeline';
    job?: any;
}

/** Two-pill toggle that lets the recruiter switch between Ranking and Pipeline view of the same job. */
export const MatchesViewToggle: React.FC<MatchesViewToggleProps> = ({ jobId, current, job }) => {
    const { text } = useLanguage();
    const baseTabClass = 'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider transition-colors';
    const activeClass = 'bg-orange-500 text-white shadow-sm';
    const inactiveClass = 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100';

    return (
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <Link
                to={`/recruiter/matches/${jobId}`}
                state={job ? { job } : undefined}
                className={`${baseTabClass} ${current === 'ranking' ? activeClass : inactiveClass}`}
            >
                {text('Ranking', 'Ranking')}
            </Link>
            <Link
                to={`/recruiter/job/${jobId}/pipeline`}
                state={job ? { job } : undefined}
                className={`${baseTabClass} ${current === 'pipeline' ? activeClass : inactiveClass}`}
            >
                {text('Pipeline', 'Pipeline')}
            </Link>
        </div>
    );
};
