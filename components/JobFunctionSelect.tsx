import React, { useState, useEffect, useRef } from 'react';
import { AppLanguage, useLanguage } from './LanguageProvider';

export const JOB_FUNCTIONS: Array<{ code: string; label: string; labelIt: string }> = [
    { code: 'accounting', label: 'Accounting', labelIt: 'Contabilita' },
    { code: 'administration', label: 'Administration', labelIt: 'Amministrazione' },
    { code: 'analytics_business_intelligence', label: 'Analytics & Business Intelligence', labelIt: 'Analytics e Business Intelligence' },
    { code: 'architecture_construction', label: 'Architecture & Construction', labelIt: 'Architettura e costruzioni' },
    { code: 'business_development', label: 'Business Development', labelIt: 'Sviluppo business' },
    { code: 'compliance_risk', label: 'Compliance & Risk', labelIt: 'Compliance e rischio' },
    { code: 'consulting', label: 'Consulting', labelIt: 'Consulenza' },
    { code: 'content_communications', label: 'Content & Communications', labelIt: 'Contenuti e comunicazione' },
    { code: 'customer_success', label: 'Customer Success', labelIt: 'Customer success' },
    { code: 'data_engineering', label: 'Data Engineering', labelIt: 'Data engineering' },
    { code: 'data_science', label: 'Data Science', labelIt: 'Data science' },
    { code: 'design', label: 'Design (UX/UI)', labelIt: 'Design (UX/UI)' },
    { code: 'devops_infrastructure', label: 'DevOps / Infrastructure', labelIt: 'DevOps / infrastruttura' },
    { code: 'education_teaching', label: 'Education & Teaching', labelIt: 'Formazione e insegnamento' },
    { code: 'electrical_electronics_engineering', label: 'Electrical & Electronics Engineering', labelIt: 'Ingegneria elettrica ed elettronica' },
    { code: 'engineering', label: 'Engineering (non-software)', labelIt: 'Ingegneria (non software)' },
    { code: 'executive', label: 'Executive / C-Level', labelIt: 'Executive / C-Level' },
    { code: 'field_service', label: 'Field Service', labelIt: 'Assistenza tecnica sul campo' },
    { code: 'finance', label: 'Finance', labelIt: 'Finanza' },
    { code: 'hardware_engineering', label: 'Hardware Engineering', labelIt: 'Ingegneria hardware' },
    { code: 'healthcare_clinical', label: 'Healthcare & Clinical', labelIt: 'Sanita e clinica' },
    { code: 'human_resources', label: 'Human Resources', labelIt: 'Risorse umane' },
    { code: 'investment_ma', label: 'Investment / M&A', labelIt: 'Investimenti / M&A' },
    { code: 'laboratory_research', label: 'Laboratory & Research', labelIt: 'Laboratorio e ricerca' },
    { code: 'legal', label: 'Legal', labelIt: 'Legale' },
    { code: 'manufacturing_production', label: 'Manufacturing & Production', labelIt: 'Produzione industriale' },
    { code: 'marketing', label: 'Marketing', labelIt: 'Marketing' },
    { code: 'mechanical_engineering', label: 'Mechanical Engineering', labelIt: 'Ingegneria meccanica' },
    { code: 'operations', label: 'Operations', labelIt: 'Operations' },
    { code: 'process_engineering', label: 'Process Engineering', labelIt: 'Ingegneria di processo' },
    { code: 'procurement', label: 'Procurement', labelIt: 'Acquisti' },
    { code: 'product_management', label: 'Product Management', labelIt: 'Product management' },
    { code: 'project_management', label: 'Project Management', labelIt: 'Project management' },
    { code: 'public_policy_government_affairs', label: 'Public Policy & Government Affairs', labelIt: 'Politiche pubbliche e relazioni istituzionali' },
    { code: 'quality_assurance', label: 'Quality Assurance', labelIt: 'Qualita' },
    { code: 'real_estate', label: 'Real Estate', labelIt: 'Immobiliare' },
    { code: 'research_development', label: 'Research & Development', labelIt: 'Ricerca e sviluppo' },
    { code: 'sales', label: 'Sales', labelIt: 'Vendite' },
    { code: 'security', label: 'Security', labelIt: 'Security' },
    { code: 'software_engineering', label: 'Software Engineering', labelIt: 'Ingegneria software' },
    { code: 'supply_chain_logistics', label: 'Supply Chain & Logistics', labelIt: 'Supply chain e logistica' },
    { code: 'other', label: 'Other', labelIt: 'Altro' },
];

const humanizeFallback = (code: string): string =>
    code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export const getJobFunctionLabel = (code: string, language: AppLanguage = 'en'): string => {
    const jobFunction = JOB_FUNCTIONS.find(f => f.code === code);
    if (!jobFunction) return humanizeFallback(code);
    return language === 'it' ? jobFunction.labelIt : jobFunction.label;
};

interface JobFunctionSelectProps {
    label: string;
    id: string;
    name?: string;
    value: string[];
    onChange: (e: { target: { name: string; value: string[] } }) => void;
    required?: boolean;
    placeholder?: string;
}

export const JobFunctionSelect: React.FC<JobFunctionSelectProps> = ({
    label,
    id,
    name,
    value = [],
    onChange,
    required,
    placeholder = 'Select job functions...'
}) => {
    const { text, language } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const normalizedValue = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);

    const filtered = JOB_FUNCTIONS.filter(fn =>
        fn.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fn.labelIt.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fn.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                        {getJobFunctionLabel(code, language)}
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
                    placeholder={normalizedValue.length === 0 ? text(placeholder, 'Seleziona le funzioni...') : ''}
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
                        <div className="px-4 py-3 text-sm text-slate-500 text-center italic">{text('No functions found', 'Nessuna funzione trovata')}</div>
                    ) : (
                        <div className="py-2">
                            {filtered.map(fn => {
                                const isSelected = normalizedValue.includes(fn.code);
                                return (
                                    <div
                                        key={fn.code}
                                        className={`px-4 py-2 cursor-pointer text-sm flex items-center justify-between transition-colors
                                            ${isSelected
                                                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 font-medium'
                                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:text-white text-slate-700'
                                            }`}
                                        onClick={() => toggle(fn.code)}
                                    >
                                        <span>{getJobFunctionLabel(fn.code, language)}</span>
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
