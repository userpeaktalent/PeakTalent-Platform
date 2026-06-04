import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLanguage } from './LanguageProvider';
import { getCountryByCode } from '../utils/countries';

// City data is shipped as a static asset (`/data/cities-by-country.json`,
// ~331 KB gzipped) so it stays out of the JS bundle and is browser-cached
// across sessions. The dataset is keyed by English country name; we map our
// ISO-2 country codes via `getCountryByCode`.
type CitiesByCountry = Record<string, string[]>;
let citiesPromise: Promise<CitiesByCountry> | null = null;
const loadCities = (): Promise<CitiesByCountry> => {
    if (!citiesPromise) {
        citiesPromise = fetch('/data/cities-by-country.json')
            .then((res) => {
                if (!res.ok) throw new Error(`Failed to fetch cities: ${res.status}`);
                return res.json() as Promise<CitiesByCountry>;
            })
            .catch((error) => {
                citiesPromise = null; // allow a retry on the next mount
                throw error;
            });
    }
    return citiesPromise;
};

interface CitySelectProps {
    label: string;
    id: string;
    name?: string;
    value: string;
    countryCode: string | undefined; // The 2-digit ISO code
    onChange: (e: { target: { name: string; value: string } }) => void;
    required?: boolean;
}

export const CitySelect: React.FC<CitySelectProps> = ({
    label,
    id,
    name,
    value,
    countryCode,
    onChange,
    required
}) => {
    const { text } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const [validCities, setValidCities] = useState<string[]>([]);
    useEffect(() => {
        if (!countryCode) {
            setValidCities([]);
            return;
        }
        let cancelled = false;
        loadCities().then((data) => {
            if (cancelled) return;
            const country = getCountryByCode(countryCode);
            const cities = country ? data[country.name] : undefined;
            setValidCities(cities ? [...cities].sort() : []);
        }).catch((error) => {
            console.error('Failed to load city data:', error);
            if (!cancelled) setValidCities([]);
        });
        return () => { cancelled = true; };
    }, [countryCode]);

    const displayValue = isOpen ? searchTerm : value;

    const filteredCities = useMemo(() => {
        if (!searchTerm) return validCities.slice(0, 100);
        const needle = searchTerm.toLowerCase();
        return validCities
            .filter((city) => city.toLowerCase().includes(needle))
            .slice(0, 100);
    }, [searchTerm, validCities]);

    // Free-text fallback: if the user typed something that's not in the suggestions,
    // we still let them save it. The dataset only ships the largest cities per
    // country, so smaller villages must be enterable by hand.
    const trimmedSearch = searchTerm.trim();
    const exactMatch = trimmedSearch
        ? validCities.some((c) => c.toLowerCase() === trimmedSearch.toLowerCase())
        : false;
    const showCustomOption = !!trimmedSearch && !exactMatch;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                if (isOpen && trimmedSearch && !exactMatch && trimmedSearch !== value) {
                    onChange({ target: { name: name || id, value: trimmedSearch } });
                }
                setIsOpen(false);
                setSearchTerm('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, trimmedSearch, exactMatch, value, name, id, onChange]);

    const handleSelect = (cityName: string) => {
        onChange({ target: { name: name || id, value: cityName } });
        setIsOpen(false);
        setSearchTerm('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && trimmedSearch) {
            e.preventDefault();
            // Prefer the first suggestion if there is one, otherwise accept free text.
            const first = filteredCities[0];
            handleSelect(first || trimmedSearch);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setSearchTerm('');
        }
    };

    return (
        <div className="space-y-1 relative" ref={containerRef}>
            <label htmlFor={id} className={`block min-h-5 text-sm font-medium leading-5 ${!countryCode ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <div
                className={`w-full relative flex h-12 items-center border rounded-xl bg-white dark:bg-slate-800 transition-all ${!countryCode
                        ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed opacity-60'
                        : isOpen
                            ? 'border-blue-500 ring-2 ring-blue-500 shadow-sm cursor-text'
                            : 'border-slate-300 dark:border-slate-600 shadow-sm cursor-text'
                    }`}
                onClick={() => {
                    if (!countryCode) return;
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
                    className="h-full w-full px-3 py-2 bg-transparent outline-none dark:text-white truncate disabled:cursor-not-allowed"
                    placeholder={!countryCode ? text('Select a country first...', 'Seleziona prima un paese...') : text('Select or type a city...', 'Seleziona o digita una città...')}
                    value={displayValue}
                    onChange={(e) => {
                        setIsOpen(true);
                        setSearchTerm(e.target.value);
                    }}
                    onFocus={() => {
                        if (countryCode) setIsOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                    required={required && !value}
                    disabled={!countryCode}
                />
                <div className="px-3 text-slate-400">
                    <svg className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>

            {isOpen && countryCode && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {showCustomOption && (
                        <div
                            key="__custom__"
                            className="px-4 py-2 cursor-pointer text-sm flex items-center gap-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:text-white border-b border-dashed border-slate-200 dark:border-slate-700"
                            onClick={() => handleSelect(trimmedSearch)}
                        >
                            <span className="text-slate-400 text-xs uppercase tracking-wide">
                                {text('Use', 'Usa')}
                            </span>
                            <span className="font-medium">"{trimmedSearch}"</span>
                        </div>
                    )}
                    {filteredCities.length === 0 && !showCustomOption ? (
                        <div className="px-4 py-3 text-sm text-slate-500 text-center">
                            {searchTerm ? text('No cities found matching search', 'Nessuna città trovata per questa ricerca') : text('Loading cities…', 'Caricamento città…')}
                        </div>
                    ) : (
                        filteredCities.map((city, idx) => (
                            <div
                                key={`${city}-${idx}`}
                                className={`px-4 py-2 cursor-pointer text-sm flex items-center gap-3 transition-colors
                                    ${value === city
                                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:text-white'
                                    }`}
                                onClick={() => handleSelect(city)}
                            >
                                <span>{city}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
