import React, { useState, useEffect, useRef } from 'react';
import { AppLanguage, useLanguage } from './LanguageProvider';

export const SECTORS = [
    "Aerospace",
    "Agriculture & Forestry",
    "Automotive",
    "Banking",
    "Biotechnology",
    "Chemicals",
    "Construction",
    "Consulting",
    "Consumer Electronics",
    "Consumer Goods",
    "Consumer Services",
    "Cybersecurity",
    "Defense",
    "Education",
    "Energy & Utilities",
    "Engineering & Industrial Services",
    "Entertainment",
    "Environmental Services",
    "Fashion & Apparel",
    "Financial Services",
    "Food & Beverage",
    "Government & Public Sector",
    "Healthcare",
    "Hospitality",
    "Information Technology & Software",
    "Insurance",
    "Internet & Online Platforms",
    "Legal Services",
    "Logistics & Transportation",
    "Luxury Goods",
    "Manufacturing",
    "Marketing & Advertising",
    "Media & Publishing",
    "Mining & Metals",
    "Non-Profit / NGO",
    "Pharmaceuticals",
    "Private Equity & Venture Capital",
    "Real Estate",
    "Research & Development",
    "Retail & E-commerce",
    "Semiconductors",
    "Sports",
    "Telecommunications",
    "Travel & Tourism",
    "Other"
];

const SECTOR_LABELS_IT: Record<string, string> = {
    "Aerospace": "Aerospazio",
    "Agriculture & Forestry": "Agricoltura e foreste",
    "Automotive": "Automotive",
    "Banking": "Banche",
    "Biotechnology": "Biotecnologie",
    "Chemicals": "Chimica",
    "Construction": "Costruzioni",
    "Consulting": "Consulenza",
    "Consumer Electronics": "Elettronica di consumo",
    "Consumer Goods": "Beni di consumo",
    "Consumer Services": "Servizi al consumatore",
    "Cybersecurity": "Cybersecurity",
    "Defense": "Difesa",
    "Education": "Formazione",
    "Energy & Utilities": "Energia e utilities",
    "Engineering & Industrial Services": "Ingegneria e servizi industriali",
    "Entertainment": "Intrattenimento",
    "Environmental Services": "Servizi ambientali",
    "Fashion & Apparel": "Moda e abbigliamento",
    "Financial Services": "Servizi finanziari",
    "Food & Beverage": "Alimentare e bevande",
    "Government & Public Sector": "Pubblica amministrazione",
    "Healthcare": "Sanita",
    "Hospitality": "Hospitality",
    "Information Technology & Software": "Information technology e software",
    "Insurance": "Assicurazioni",
    "Internet & Online Platforms": "Internet e piattaforme online",
    "Legal Services": "Servizi legali",
    "Logistics & Transportation": "Logistica e trasporti",
    "Luxury Goods": "Beni di lusso",
    "Manufacturing": "Manifattura",
    "Marketing & Advertising": "Marketing e pubblicita",
    "Media & Publishing": "Media ed editoria",
    "Mining & Metals": "Miniere e metalli",
    "Non-Profit / NGO": "Non profit / ONG",
    "Pharmaceuticals": "Farmaceutica",
    "Private Equity & Venture Capital": "Private equity e venture capital",
    "Real Estate": "Immobiliare",
    "Research & Development": "Ricerca e sviluppo",
    "Retail & E-commerce": "Retail ed e-commerce",
    "Semiconductors": "Semiconduttori",
    "Sports": "Sport",
    "Telecommunications": "Telecomunicazioni",
    "Travel & Tourism": "Viaggi e turismo",
    "Other": "Altro",
    "Public Administration": "Pubblica amministrazione",
    "Technology": "Tecnologia",
    "E-commerce": "E-commerce",
    "Green Energy": "Energia verde",
    "Telecom": "Telecomunicazioni",
    "SaaS": "SaaS",
    "FinTech": "FinTech",
    "Retail": "Retail",
    "Renewable Energy": "Energie rinnovabili",
    "Infrastructure": "Infrastrutture",
};

export const getSectorLabel = (sector: string, language: AppLanguage = 'en'): string =>
    language === 'it' ? (SECTOR_LABELS_IT[sector] || sector) : sector;

interface SectorSelectProps {
    label: string;
    id: string;
    name?: string;
    value: string[];
    onChange: (e: { target: { name: string; value: string[] } }) => void;
    required?: boolean;
    placeholder?: string;
}

export const SectorSelect: React.FC<SectorSelectProps> = ({
    label,
    id,
    name,
    value = [], // Ensure it's an array
    onChange,
    required,
    placeholder = "Select industry sectors..."
}) => {
    const { text, language } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const normalizedValue = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);

    const filteredSectors = SECTORS.filter(sector =>
        sector.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getSectorLabel(sector, language).toLowerCase().includes(searchTerm.toLowerCase())
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

    const handleToggleSector = (sector: string) => {
        const newValue = normalizedValue.includes(sector)
            ? normalizedValue.filter(s => s !== sector)
            : [...normalizedValue, sector];

        onChange({ target: { name: name || id, value: newValue } });
    };

    const handleRemoveSector = (sector: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newValue = normalizedValue.filter(s => s !== sector);
        onChange({ target: { name: name || id, value: newValue } });
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
                {/* Selected Sector Pills */}
                {normalizedValue.map(sector => (
                    <span
                        key={sector}
                        className="flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-lg text-xs font-semibold animate-in fade-in zoom-in duration-200"
                    >
                        {getSectorLabel(sector, language)}
                        <button
                            type="button"
                            onClick={(e) => handleRemoveSector(sector, e)}
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
                    placeholder={normalizedValue.length === 0 ? text(placeholder, 'Seleziona i settori...') : ""}
                    value={searchTerm}
                    onChange={(e) => {
                        setIsOpen(true);
                        setSearchTerm(e.target.value);
                    }}
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
                    {filteredSectors.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-500 text-center italic">{text('No sectors found', 'Nessun settore trovato')}</div>
                    ) : (
                        <div className="py-2">
                            {filteredSectors.map((sector) => {
                                const isSelected = normalizedValue.includes(sector);
                                return (
                                    <div
                                        key={sector}
                                        className={`px-4 py-2 cursor-pointer text-sm flex items-center justify-between transition-colors 
                                            ${isSelected
                                                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 font-medium'
                                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:text-white text-slate-700'
                                            }`}
                                        onClick={() => handleToggleSector(sector)}
                                    >
                                        <span>{getSectorLabel(sector, language)}</span>
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
