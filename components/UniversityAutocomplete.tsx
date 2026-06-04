import React, { useEffect, useRef, useState } from 'react';
import { searchUniversities, UniversitySuggestion } from '../services/universitySearchService';

const fieldLabelClass = "block min-h-5 text-sm font-medium leading-5 text-slate-700 dark:text-slate-300";
const fieldControlClass = "mt-1 block h-12 w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white transition-shadow duration-200";

interface UniversityAutocompleteProps {
    label: string;
    id: string;
    name: string;
    value?: string;
    required?: boolean;
    placeholder?: string;
    loadingLabel: string;
    emptyLabel: string;
    helperLabel: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const UniversityAutocomplete: React.FC<UniversityAutocompleteProps> = ({
    label,
    id,
    name,
    value = '',
    required,
    placeholder,
    loadingLabel,
    emptyLabel,
    helperLabel,
    onChange,
}) => {
    const [suggestions, setSuggestions] = useState<UniversitySuggestion[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen || value.trim().length < 2) {
            setSuggestions([]);
            setHasSearched(false);
            return;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setIsLoading(true);
            searchUniversities(value, controller.signal)
                .then(results => {
                    setSuggestions(results);
                    setHasSearched(true);
                })
                .catch(error => {
                    if (error?.name !== 'AbortError') {
                        setSuggestions([]);
                        setHasSearched(true);
                    }
                })
                .finally(() => setIsLoading(false));
        }, 220);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [isOpen, value]);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isOpen]);

    const emitValue = (nextValue: string) => {
        onChange({
            target: { name, value: nextValue },
        } as React.ChangeEvent<HTMLInputElement>);
    };

    return (
        <div ref={rootRef} className="relative">
            <label htmlFor={id} className={fieldLabelClass}>
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <input
                id={id}
                name={name}
                required={required}
                value={value}
                placeholder={placeholder}
                autoComplete="off"
                onFocus={() => setIsOpen(true)}
                onChange={event => {
                    setIsOpen(true);
                    onChange(event);
                }}
                className={fieldControlClass}
            />
            {isOpen && value.trim().length >= 2 && (
                <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-600 dark:bg-slate-800">
                    {isLoading && (
                        <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-300">{loadingLabel}</div>
                    )}
                    {!isLoading && suggestions.map(suggestion => (
                        <button
                            key={suggestion.id}
                            type="button"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => {
                                emitValue(suggestion.name);
                                setIsOpen(false);
                            }}
                            className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-orange-50 focus:bg-orange-50 focus:outline-none dark:hover:bg-slate-700 dark:focus:bg-slate-700"
                        >
                            <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                                {suggestion.name}
                            </span>
                            {suggestion.hint && (
                                <span className="block text-xs text-slate-500 dark:text-slate-400">
                                    {suggestion.hint}
                                </span>
                            )}
                        </button>
                    ))}
                    {!isLoading && hasSearched && suggestions.length === 0 && (
                        <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-300">{emptyLabel}</div>
                    )}
                    <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
                        {helperLabel}
                    </div>
                </div>
            )}
        </div>
    );
};

export default UniversityAutocomplete;
