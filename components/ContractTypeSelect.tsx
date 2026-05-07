import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from './LanguageProvider';

export const CONTRACT_TYPES: Array<{ code: string; label: string; labelIt: string }> = [
    { code: 'full_time', label: 'Full-time', labelIt: 'Tempo pieno' },
    { code: 'part_time', label: 'Part-time', labelIt: 'Part-time' },
    { code: 'internship', label: 'Internship', labelIt: 'Stage / Tirocinio' },
    { code: 'collaboration', label: 'Collaboration', labelIt: 'Collaborazione' },
    { code: 'phd_other', label: 'PhD / Other', labelIt: 'Dottorato / Altro' },
];

const labelFor = (code: string, italian: boolean): string => {
    const entry = CONTRACT_TYPES.find(c => c.code === code);
    if (entry) return italian ? entry.labelIt : entry.label;
    return code.replace(/_/g, ' ');
};

interface ContractTypeSelectProps {
    label: string;
    id: string;
    name?: string;
    value: string[];
    onChange: (e: { target: { name: string; value: string[] } }) => void;
    required?: boolean;
    placeholder?: string;
}

export const ContractTypeSelect: React.FC<ContractTypeSelectProps> = ({
    label,
    id,
    name,
    value = [],
    onChange,
    required,
    placeholder = 'Select contract types...'
}) => {
    const { text, language } = useLanguage();
    const italian = language === 'it';
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const normalizedValue = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);

    const filtered = CONTRACT_TYPES.filter(c => {
        const q = searchTerm.toLowerCase();
        return c.label.toLowerCase().includes(q)
            || c.labelIt.toLowerCase().includes(q)
            || c.code.toLowerCase().includes(q);
    });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggle = (code: string) => {
        const newValue = normalizedValue.includes(code)
            ? normalizedValue.filter(s => s !== code)
            : [...normalizedValue, code];
        onChange({ target: { name: name || id, value: newValue } });
    };

    const remove = (code: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange({ target: { name: name || id, value: normalizedValue.filter(s => s !== code) } });
    };

    return (
        <div className="space-y-1 relative" ref={containerRef}>
            <label htmlFor={id} className="block min-h-5 text-sm font-medium leading-5 text-slate-700 dark:text-slate-300">
                {label} {required && <span className="text-red-500">*</span>}
            </label>

            <div
                className={`w-full min-h-12 relative flex flex-wrap items-center gap-2 p-1.5 border ${isOpen ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-slate-300 dark:border-slate-600'} rounded-xl bg-white dark:bg-slate-800 transition-all shadow-sm cursor-text`}
                onClick={() => {
                    inputRef.current?.focus();
                    if (!isOpen) setIsOpen(true);
                }}
            >
                {normalizedValue.map(code => (
                    <span
                        key={code}
                        className="flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-lg text-xs font-semibold animate-in fade-in zoom-in duration-200"
                    >
                        {labelFor(code, italian)}
                        <button
                            type="button"
                            onClick={(e) => remove(code, e)}
                            className="hover:text-orange-900 dark:hover:text-orange-100 transition-colors"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </span>
                ))}

                <input
                    ref={inputRef}
                    id={id}
                    type="text"
                    className="flex-1 min-w-[120px] px-2 py-1 bg-transparent outline-none dark:text-white text-sm"
                    placeholder={normalizedValue.length === 0 ? text(placeholder, 'Seleziona i tipi di contratto...') : ''}
                    value={searchTerm}
                    onChange={(e) => { setIsOpen(true); setSearchTerm(e.target.value); }}
                    onFocus={() => setIsOpen(true)}
                    autoComplete="off"
                    required={required && normalizedValue.length === 0}
                />

                <div className="px-2 text-slate-400">
                    <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                    {filtered.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-500 text-center italic">{text('No contract types found', 'Nessun tipo di contratto trovato')}</div>
                    ) : (
                        <div className="py-2">
                            {filtered.map(c => {
                                const isSelected = normalizedValue.includes(c.code);
                                return (
                                    <div
                                        key={c.code}
                                        className={`px-4 py-2 cursor-pointer text-sm flex items-center justify-between transition-colors
                                            ${isSelected
                                                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 font-medium'
                                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:text-white text-slate-700'
                                            }`}
                                        onClick={() => toggle(c.code)}
                                    >
                                        <span>{italian ? c.labelIt : c.label}</span>
                                        {isSelected && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
