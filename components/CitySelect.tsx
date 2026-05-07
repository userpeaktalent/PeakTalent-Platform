import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLanguage } from './LanguageProvider';

// Lazy-load the 8 MB country-state-city data bundle the first time ANY CitySelect mounts,
// instead of shipping it in the vendor bundle. After the first load the promise is cached.
type CityEntry = { name: string; stateCode?: string; countryCode?: string };
type CityNamespace = { getCitiesOfCountry(countryCode: string): CityEntry[] | undefined };
let cityLibPromise: Promise<CityNamespace> | null = null;
const loadCityLib = (): Promise<CityNamespace> => {
    if (!cityLibPromise) {
        cityLibPromise = import('country-state-city').then((mod) => mod.City as unknown as CityNamespace);
    }
    return cityLibPromise;
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

    // Load cities for the selected country. The library is only imported when a CitySelect
    // actually needs data, so first paint stays lean.
    const [validCities, setValidCities] = useState<CityEntry[]>([]);
    useEffect(() => {
        if (!countryCode) {
            setValidCities([]);
            return;
        }
        let cancelled = false;
        loadCityLib().then((CityNs) => {
            if (cancelled) return;
            setValidCities(CityNs.getCitiesOfCountry(countryCode.toUpperCase()) || []);
        }).catch((error) => {
            console.error('Failed to load city data:', error);
            if (!cancelled) setValidCities([]);
        });
        return () => { cancelled = true; };
    }, [countryCode]);

    const displayValue = isOpen ? searchTerm : value;

    const filteredCities = useMemo(() => {
        if (!searchTerm) return validCities.slice(0, 100); // limit to 100 for performance when not searching
        return validCities
            .filter(city => city.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .slice(0, 100);
    }, [searchTerm, validCities]);

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

    const handleSelect = (cityName: string) => {
        onChange({ target: { name: name || id, value: cityName } });
        setIsOpen(false);
        setSearchTerm('');
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
                    placeholder={!countryCode ? text('Select a country first...', 'Seleziona prima un paese...') : text('Select a city...', 'Seleziona una città...')}
                    value={displayValue}
                    onChange={(e) => {
                        setIsOpen(true);
                        setSearchTerm(e.target.value);
                    }}
                    onFocus={() => {
                        if (countryCode) setIsOpen(true);
                    }}
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
                    {filteredCities.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-500 text-center">
                            {searchTerm ? text('No cities found matching search', 'Nessuna città trovata per questa ricerca') : text('No cities available', 'Nessuna città disponibile')}
                        </div>
                    ) : (
                        filteredCities.map((city, idx) => (
                            <div
                                key={`${city.name}-${idx}`}
                                className={`px-4 py-2 cursor-pointer text-sm flex items-center gap-3 transition-colors 
                                    ${value === city.name
                                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:text-white'
                                    }`}
                                onClick={() => handleSelect(city.name)}
                            >
                                <span>{city.name}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
