import React, { useState, useEffect, useRef } from 'react';
import { languages, getLanguageByCode } from '../utils/languages';
import { useLanguage } from './LanguageProvider';

interface LanguageSelectProps {
    label: string;
    id: string;
    name?: string;
    value: string;
    onChange: (e: { target: { name: string; value: string } }) => void;
    required?: boolean;
    placeholder?: string;
}

export const LanguageSelect: React.FC<LanguageSelectProps> = ({
    label,
    id,
    name,
    value,
    onChange,
    required,
    placeholder = "Select language..."
}) => {
    const { text } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const activeLanguage = getLanguageByCode(value);
    const displayValue = isOpen
        ? searchTerm
        : (activeLanguage ? `${activeLanguage.flag} ${activeLanguage.name}` : '');

    const filteredLanguages = languages.filter(lang =>
        lang.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lang.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSelect = (code: string) => {
        onChange({ target: { name: name || id, value: code } });
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className="space-y-1 relative" ref={containerRef}>
            <label htmlFor={id} className="block min-h-5 text-sm font-medium leading-5 text-slate-700 dark:text-slate-300">
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <div
                className={`w-full relative flex h-12 items-center border ${isOpen ? 'border-orange-500 ring-2 ring-orange-100' : 'border-slate-300 dark:border-slate-600'} rounded-xl bg-white dark:bg-slate-800 transition-all shadow-sm`}
                onClick={() => {
                    if (!isOpen) {
                        setIsOpen(true);
                        setSearchTerm('');
                        setTimeout(() => inputRef.current?.focus(), 10);
                    }
                }}
            >
                <input
                    ref={inputRef}
                    id={id}
                    type="text"
                    className="h-full w-full px-3 py-2 bg-transparent outline-none dark:text-white truncate cursor-pointer"
                    placeholder={activeLanguage ? `${activeLanguage.flag} ${activeLanguage.name}` : text(placeholder, 'Seleziona una lingua...')}
                    value={displayValue}
                    onChange={(e) => {
                        setIsOpen(true);
                        setSearchTerm(e.target.value);
                    }}
                    onFocus={() => setIsOpen(true)}
                    autoComplete="off"
                    required={required && !value}
                />
                <div className="px-3 text-slate-400">
                    <svg className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredLanguages.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-500 text-center">{text('No languages found', 'Nessuna lingua trovata')}</div>
                    ) : (
                        filteredLanguages.map((lang) => (
                            <div
                                key={lang.code}
                                className={`px-4 py-2 cursor-pointer text-sm flex items-center gap-3 transition-colors 
                                    ${value === lang.code
                                        ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:text-white'
                                    }`}
                                onClick={() => handleSelect(lang.code)}
                            >
                                <span className="text-lg">{lang.flag}</span>
                                <span>{lang.name}</span>
                                <span className="ml-auto text-xs text-slate-400 uppercase">{lang.code}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
