
import React, { useState, useEffect } from 'react';
import { CandidateProfile } from '../types';
import { NEW_EDUCATION_DEFAULT, NEW_EXPERIENCE_DEFAULT, NEW_CERTIFICATION_DEFAULT, NEW_LANGUAGE_DEFAULT } from '../constants';
import { CountrySelect } from './CountrySelect';
import { MultiCountrySelect } from './MultiCountrySelect';
import { CitySelect } from './CitySelect';
import { LanguageSelect } from './LanguageSelect';
import { MajorSelect } from './MajorSelect';
import { SectorSelect } from './SectorSelect';
import { getJobFunctionLabel, JobFunctionSelect, JOB_FUNCTIONS } from './JobFunctionSelect';
import { ContractTypeSelect } from './ContractTypeSelect';
import { MonthPicker } from './MonthPicker';
import { EDUCATION_LEVELS, getEducationLevelLabel, normalizeEducationEntries } from '../utils/education';
import { SEEKER_SKILL_LEVELS, getSeekerSkillLevelValue } from '../utils/skills';
import { useLanguage } from './LanguageProvider';
import UniversityAutocomplete from './UniversityAutocomplete';

// --- Helper Components ---

const fieldLabelClass = "block min-h-5 text-sm font-medium leading-5 text-slate-700 dark:text-slate-300";
const fieldControlClass = "mt-1 block h-12 w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white transition-shadow duration-200";

const FormInput: React.FC<{ label: string; id: string; required?: boolean;[key: string]: any; }> = ({ label, id, required, ...props }) => (
    <div>
        <label htmlFor={id} className={fieldLabelClass}>
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input id={id} required={required} {...props} className={fieldControlClass} />
    </div>
);

const FormTextarea: React.FC<{ label: string; id: string;[key: string]: any; }> = ({ label, id, ...props }) => (
    <div>
        <label htmlFor={id} className={fieldLabelClass}>{label}</label>
        <textarea id={id} {...props} className="mt-1 block w-full rounded-xl border border-slate-300 p-3 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white transition-shadow duration-200" />
    </div>
);

const FormSelect: React.FC<{ label: string; id: string; required?: boolean;[key: string]: any; }> = ({ label, id, required, children, ...props }) => (
    <div>
        <label htmlFor={id} className={fieldLabelClass}>
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <select id={id} required={required} {...props} className={fieldControlClass}>
            {children}
        </select>
    </div>
);

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
    open_to_opportunities: 'aperto a opportunita',
    not_looking: 'non in cerca',
};

const FormCheckbox: React.FC<{ label: string; id: string;[key: string]: any; }> = ({ label, id, ...props }) => (
    <div className="flex items-center">
        <input type="checkbox" id={id} {...props} className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-600" />
        <label htmlFor={id} className="ml-2 block text-sm text-slate-700 dark:text-slate-300">{label}</label>
    </div>
);

const SkillLevelDots: React.FC<{ label: string; id: string; value?: number; onChange: (level: number) => void }> = ({ label, id, value, onChange }) => {
    const current = getSeekerSkillLevelValue(value);
    const activeIndex = SEEKER_SKILL_LEVELS.findIndex(l => l.value === current);
    const currentLabel = SEEKER_SKILL_LEVELS[activeIndex]?.label || '';
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
            <div
                id={id}
                role="radiogroup"
                aria-label={label}
                className="mt-1 flex items-center justify-between gap-3 p-2 border border-slate-300 rounded-lg dark:border-slate-600 dark:bg-slate-700"
            >
                <div className="flex items-center gap-1.5">
                    {SEEKER_SKILL_LEVELS.map((lvl, i) => {
                        const filled = i <= activeIndex;
                        return (
                            <button
                                key={lvl.value}
                                type="button"
                                role="radio"
                                aria-checked={i === activeIndex}
                                aria-label={lvl.label}
                                title={lvl.label}
                                onClick={() => onChange(lvl.value)}
                                className={`h-4 w-4 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 ${filled ? 'bg-orange-500 border-orange-500' : 'bg-transparent border-slate-300 dark:border-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                            />
                        );
                    })}
                </div>
                <span className="text-sm text-slate-600 dark:text-slate-300">{currentLabel}</span>
            </div>
        </div>
    );
};

const ChevronIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);

const SectionAccordion: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${isOpen ? 'rounded-t-xl border-b dark:border-slate-700' : 'rounded-xl'}`}
            >
                <div className="flex items-center gap-3">
                    <span className="text-orange-500">{icon}</span>
                    <span className="font-semibold text-lg text-slate-800 dark:text-slate-200">{title}</span>
                </div>
                <span className={`transform transition-transform duration-300 text-slate-500 ${isOpen ? 'rotate-180' : ''}`}>
                    <ChevronIcon />
                </span>
            </button>
            {isOpen && <div className="p-4 bg-white dark:bg-slate-900/50 rounded-b-xl">{children}</div>}
        </div>
    );
};

// --- Main Form Component ---

interface CandidateFormProps {
    initialData: Partial<CandidateProfile>;
    onSubmit: (data: Partial<CandidateProfile>, action: 'save' | 'refine') => void;
    isSaving?: boolean;
    saveLabel?: string;
    refineLabel?: string;
    helperText?: string;
    showRefineAction?: boolean;
}

type CandidateArraySection = 'education' | 'experiences' | 'certifications' | 'languages' | 'skills' | 'it_skills' | 'soft_skills';

const parseCsv = (value: string): string[] =>
    value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

const humanize = (value?: string | null): string =>
    (value || '').replace(/_/g, ' ');

const toSnake = (value: string): string =>
    value.trim().replace(/\s+/g, '_');

const toFiniteNumber = (value?: number | string | null): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().replace(',', '.');
        if (!normalized) {
            return null;
        }

        const parsed = Number(normalized);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
};

const decimalYearsToParts = (value?: number | string | null) => {
    const numericValue = toFiniteNumber(value);
    if (numericValue === null || numericValue < 0) {
        return { years: '', months: '' };
    }

    const totalMonths = Math.max(0, Math.round(numericValue * 12));
    return {
        years: String(Math.floor(totalMonths / 12)),
        months: String(totalMonths % 12),
    };
};

const experiencePartsToDecimalYears = (yearsValue: string, monthsValue: string): number | undefined => {
    const hasYears = yearsValue.trim() !== '';
    const hasMonths = monthsValue.trim() !== '';

    if (!hasYears && !hasMonths) {
        return undefined;
    }

    const years = hasYears ? Math.max(0, parseInt(yearsValue, 10) || 0) : 0;
    const months = hasMonths ? Math.min(11, Math.max(0, parseInt(monthsValue, 10) || 0)) : 0;

    return Number((((years * 12) + months) / 12).toFixed(2));
};

const CandidateForm: React.FC<CandidateFormProps> = ({
    initialData,
    onSubmit,
    isSaving = false,
    saveLabel,
    refineLabel,
    helperText,
    showRefineAction = true,
}) => {
    const { text, language } = useLanguage();
    const resolvedSaveLabel = saveLabel || text('Save & Exit', 'Salva ed esci');
    const resolvedRefineLabel = refineLabel || text('Level up with AI Assistant', 'Migliora con l’assistente AI');
    const [profile, setProfile] = useState<Partial<CandidateProfile>>({
        personal_info: { first_name: '', last_name: '' },
        residence: { country: '' },
        contacts: { email: '', phone: '' },
        experiences: [],
        certifications: [],
        languages: [],
        industry_experience: [],
        target_job_functions: [],
        skills: [],
        it_skills: [],
        soft_skills: [],
        preferences: { salary_eur: { min: 0, flexibility: false }, preferred_locations: [], remote: 'no_preference', desired_contract_types: [], industries: [], work_eligibility_countries: [] },
        ...initialData,
        education: normalizeEducationEntries(initialData.education),
    });

    useEffect(() => {
        setProfile(prev => ({
            ...prev,
            ...initialData,
            personal_info: { ...prev.personal_info, ...initialData.personal_info },
            residence: { ...prev.residence, ...initialData.residence },
            contacts: { ...prev.contacts, ...initialData.contacts },
            education: normalizeEducationEntries(initialData.education ?? prev.education),
            preferences: {
                ...prev.preferences,
                ...initialData.preferences,
                remote: initialData.preferences?.remote ?? prev.preferences?.remote ?? 'no_preference',
            }
        }));
    }, [initialData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const parts = name.split('.');

        if (parts.length === 3) {
            const [section, field, subfield] = parts;
            setProfile(prev => ({
                ...prev,
                // @ts-ignore
                [section]: {
                    // @ts-ignore
                    ...prev[section],
                    [field]: {
                        // @ts-ignore
                        ...prev[section][field],
                        [subfield]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
                    }
                }
            }));
        } else if (parts.length === 2) {
            const [section, field] = parts;
            setProfile(prev => ({
                ...prev,
                // @ts-ignore
                [section]: {
                    // @ts-ignore
                    ...prev[section],
                    [field]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
                }
            }));
        } else {
            const localizedReset = name === 'summary_text'
                ? { summary_text_it: undefined, summary_text_en: undefined }
                : {};
            setProfile(prev => ({
                ...prev,
                ...localizedReset,
                [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
            }));
        }
    };

    const experienceParts = decimalYearsToParts(profile.total_years_experience);

    const handleExperiencePartChange = (part: 'years' | 'months', rawValue: string) => {
        const sanitized = rawValue.replace(/[^\d]/g, '');
        const nextYears = part === 'years' ? sanitized : experienceParts.years;
        const nextMonthsRaw = part === 'months' ? sanitized : experienceParts.months;
        const nextMonths = nextMonthsRaw === '' ? '' : String(Math.min(11, parseInt(nextMonthsRaw, 10) || 0));

        setProfile(prev => ({
            ...prev,
            total_years_experience: experiencePartsToDecimalYears(nextYears, nextMonths),
        }));
    };

    const handleArrayChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>, section: CandidateArraySection, index: number) => {
        const { name, value } = e.target;
        const nameParts = name.split('.');

        const updatedArray = [...(profile[section] || [])];

        if (nameParts.length > 1) {
            // @ts-ignore
            updatedArray[index] = {
                ...updatedArray[index],
                [nameParts[0]]: {
                    // @ts-ignore
                    ...updatedArray[index][nameParts[0]],
                    [nameParts[1]]: value
                }
            };
        } else {
            // @ts-ignore
            updatedArray[index] = {
                ...updatedArray[index],
                [name]: value,
                ...(name === 'description' ? { description_it: undefined, description_en: undefined } : {}),
            };
        }

        setProfile(p => ({ ...p, [section]: updatedArray }));
    };

    const addArrayItem = (section: CandidateArraySection, defaultValue: object) => {
        // @ts-ignore
        setProfile(p => ({ ...p, [section]: [...(p[section] || []), defaultValue] }));
    }

    const removeArrayItem = (section: CandidateArraySection, index: number) => {
        // @ts-ignore
        setProfile(p => ({ ...p, [section]: (p[section] || []).filter((_, i) => i !== index) }));
    }

    const addPreferredLocation = () => {
        setProfile(p => ({
            ...p,
            preferences: {
                ...p.preferences!,
                preferred_locations: [...(p.preferences?.preferred_locations || []), { country: '', city: '' }]
            }
        }));
    }

    const removePreferredLocation = (index: number) => {
        setProfile(p => ({
            ...p,
            preferences: {
                ...p.preferences!,
                preferred_locations: (p.preferences?.preferred_locations || []).filter((_, i) => i !== index)
            }
        }));
    }

    const handleLocationChange = (index: number, field: 'country' | 'city', value: string) => {
        const newLocs = [...(profile.preferences?.preferred_locations || [])];
        newLocs[index] = { ...newLocs[index], [field]: value };
        setProfile(p => ({
            ...p,
            preferences: { ...p.preferences!, preferred_locations: newLocs }
        }));
    }

    const [validationError, setValidationError] = useState<string | null>(null);

    const validateRequiredFields = (): { error: string | null; fieldId: string | null } => {
        if (!profile.personal_info?.first_name?.trim()) return { error: text('Complete all required fields (*).', 'Compila tutti i campi obbligatori (*).'), fieldId: 'first_name' };
        if (!profile.personal_info?.last_name?.trim()) return { error: text('Complete all required fields (*).', 'Compila tutti i campi obbligatori (*).'), fieldId: 'last_name' };
        if (!profile.residence?.country?.trim()) return { error: text('Complete all required fields (*).', 'Compila tutti i campi obbligatori (*).'), fieldId: 'country' };
        if (!profile.contacts?.email?.trim()) return { error: text('Complete all required fields (*).', 'Compila tutti i campi obbligatori (*).'), fieldId: 'email' };
        if (!profile.contacts?.phone?.trim()) return { error: text('Complete all required fields (*).', 'Compila tutti i campi obbligatori (*).'), fieldId: 'phone' };
        if (!profile.job_search_status?.trim()) return { error: text('Complete all required fields (*).', 'Compila tutti i campi obbligatori (*).'), fieldId: 'job_search_status' };
        for (let i = 0; i < (profile.education || []).length; i++) {
            const edu = profile.education![i];
            if (!edu.institution?.trim()) return { error: text('Complete all required fields in Education (*).', 'Compila tutti i campi obbligatori nella Formazione (*).'), fieldId: `edu-institution-${i}` };
            if (!edu.degree_level?.trim()) return { error: text('Complete all required fields in Education (*).', 'Compila tutti i campi obbligatori nella Formazione (*).'), fieldId: `edu-degree_level-${i}` };
            if (!edu.from?.trim()) return { error: text('Complete all required fields in Education (*).', 'Compila tutti i campi obbligatori nella Formazione (*).'), fieldId: `edu-from-${i}` };
        }
        for (let i = 0; i < (profile.experiences || []).length; i++) {
            const exp = profile.experiences![i];
            if (!exp.company?.trim()) return { error: text('Complete all required fields in Work Experience (*).', "Compila tutti i campi obbligatori nell'Esperienza lavorativa (*)."), fieldId: `exp-company-${i}` };
            if (!exp.role?.trim()) return { error: text('Complete all required fields in Work Experience (*).', "Compila tutti i campi obbligatori nell'Esperienza lavorativa (*)."), fieldId: `exp-role-${i}` };
            if (!exp.from?.trim()) return { error: text('Complete all required fields in Work Experience (*).', "Compila tutti i campi obbligatori nell'Esperienza lavorativa (*)."), fieldId: `exp-from-${i}` };
        }
        return { error: null, fieldId: null };
    };

    const scrollToAndHighlight = (fieldId: string) => {
        const el = document.getElementById(fieldId);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus({ preventScroll: true });
        el.style.outline = '2px solid #ef4444';
        el.style.outlineOffset = '2px';
        setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 2500);
    };

    const handleAction = (e: React.FormEvent, action: 'save' | 'refine') => {
        e.preventDefault();
        const { error, fieldId } = validateRequiredFields();
        if (error) {
            setValidationError(error);
            if (fieldId) {
                scrollToAndHighlight(fieldId);
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            return;
        }
        setValidationError(null);
        onSubmit(profile, action);
    };

    const handleSkillLevelChange = (section: 'skills' | 'it_skills', index: number, level: number) => {
        const updatedArray = [...(profile[section] || [])];
        // @ts-ignore
        updatedArray[index] = { ...updatedArray[index], level };
        setProfile(p => ({ ...p, [section]: updatedArray }));
    };

    return (
        <div className="space-y-8">
            <div className="p-6 border border-slate-200 dark:border-slate-700 rounded-xl">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b pb-2 dark:border-slate-600">{text('Personal Details', 'Dati personali')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput required label={text('First Name', 'Nome')} id="first_name" name="personal_info.first_name" value={profile.personal_info?.first_name || ''} onChange={handleChange} />
                    <FormInput required label={text('Last Name', 'Cognome')} id="last_name" name="personal_info.last_name" value={profile.personal_info?.last_name || ''} onChange={handleChange} />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-6 mb-4 border-b pb-2 dark:border-slate-600">{text('Residence', 'Residenza')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <CountrySelect required label={text('Country', 'Paese')} id="country" name="residence.country" value={profile.residence?.country || ''} onChange={handleChange as any} />
                    <CitySelect label={text('City (Optional)', 'Città (opzionale)')} id="city" name="residence.city" value={profile.residence?.city || ''} countryCode={profile.residence?.country} onChange={handleChange as any} />
                    <FormInput label={text('Address (Optional)', 'Indirizzo (opzionale)')} id="address" name="residence.address" value={profile.residence?.address || ''} onChange={handleChange} />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-6 mb-4 border-b pb-2 dark:border-slate-600">{text('Contacts', 'Contatti')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput required label={text('E-mail', 'Email')} id="email" type="email" name="contacts.email" value={profile.contacts?.email || ''} onChange={handleChange} />
                    <FormInput required label={text('Phone Number', 'Numero di telefono')} id="phone" type="tel" name="contacts.phone" value={profile.contacts?.phone || ''} onChange={handleChange} />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-6 mb-4 border-b pb-2 dark:border-slate-600">{text('Professional Snapshot', 'Sintesi professionale')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormSelect label={text('Current Job Function', 'Funzione attuale')} id="current_job_function" name="current_job_function" value={profile.current_job_function || ''} onChange={handleChange}>
                        <option value="">{text('Select function...', 'Seleziona funzione...')}</option>
                        {JOB_FUNCTIONS.map(fn => (
                            <option key={fn.code} value={fn.code}>{getJobFunctionLabel(fn.code, language)}</option>
                        ))}
                    </FormSelect>
                    <FormSelect label={text('Current Seniority', 'Seniorità attuale')} id="current_seniority_level" name="current_seniority_level" value={profile.current_seniority_level || ''} onChange={handleChange}>
                        <option value="">{text('Select Seniority...', 'Seleziona seniorità...')}</option>
                        {['student', 'intern', 'junior', 'mid', 'senior', 'lead'].map(level => (
                            <option key={level} value={level}>
                                {language === 'it' ? SENIORITY_LABELS_IT[level] : level}
                            </option>
                        ))}
                    </FormSelect>
                    <div>
                        <label htmlFor="experience_years" className={fieldLabelClass}>
                            {text('Total Experience', 'Esperienza totale')}
                        </label>
                        <div className="mt-1 grid grid-cols-2 gap-3">
                            <div className="relative">
                                <input
                                    id="experience_years"
                                    type="number"
                                    min="0"
                                    inputMode="numeric"
                                    aria-label={text('Years', 'Anni')}
                                    placeholder="0"
                                    value={experienceParts.years}
                                    onChange={(e) => handleExperiencePartChange('years', e.target.value)}
                                    className="block h-12 w-full rounded-xl border border-slate-300 px-3 py-2 pr-14 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white transition-shadow duration-200"
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {text('Years', 'Anni')}
                                </span>
                            </div>
                            <div className="relative">
                                <input
                                    id="experience_months"
                                    type="number"
                                    min="0"
                                    max="11"
                                    inputMode="numeric"
                                    aria-label={text('Months', 'Mesi')}
                                    placeholder="0"
                                    value={experienceParts.months}
                                    onChange={(e) => handleExperiencePartChange('months', e.target.value)}
                                    className="block h-12 w-full rounded-xl border border-slate-300 px-3 py-2 pr-14 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white transition-shadow duration-200"
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {text('Months', 'Mesi')}
                                </span>
                            </div>
                        </div>
                    </div>
                    <FormInput label={text('Notice Period (Months)', 'Periodo di preavviso (mesi)')} id="notice_period_months" type="number" name="notice_period_months" value={profile.notice_period_months ?? ''} onChange={handleChange} />
                    <FormSelect required label={text('Job Search Status', 'Stato ricerca lavoro')} id="job_search_status" name="job_search_status" value={profile.job_search_status || ''} onChange={handleChange}>
                        <option value="">{text('Select Status...', 'Seleziona stato...')}</option>
                        {['actively_looking', 'open_to_opportunities', 'not_looking'].map(status => (
                            <option key={status} value={status}>
                                {language === 'it' ? JOB_SEARCH_STATUS_LABELS_IT[status] : status.replace(/_/g, ' ')}
                            </option>
                        ))}
                    </FormSelect>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <JobFunctionSelect
                        label={text('Target Job Functions', 'Funzioni target')}
                        id="target_job_functions"
                        value={profile.target_job_functions || []}
                        onChange={(e) => setProfile(p => ({ ...p, target_job_functions: e.target.value }))}
                    />
                    <SectorSelect
                        label={text('Industry Experience', 'Esperienza di settore')}
                        id="industry_experience"
                        value={profile.industry_experience || []}
                        onChange={(e) => setProfile(p => ({ ...p, industry_experience: e.target.value }))}
                    />
                </div>
                <div className="mt-4">
                    <FormTextarea label={text('Professional Summary', 'Profilo professionale')} id="summary_text" name="summary_text" rows={4} value={profile.summary_text || ''} onChange={handleChange as any} placeholder={text('Short factual summary used in matching and embeddings', 'Breve riepilogo fattuale usato per matching ed embeddings')} />
                </div>
            </div>

            <SectionAccordion title={text('Education Details', 'Formazione')} icon={<span>🎓</span>}>
                {profile.education?.map((edu, index) => (
                    <div key={index} className="p-4 border rounded-md mb-4 relative bg-slate-50 dark:bg-slate-900/50">
                        <button type="button" onClick={() => removeArrayItem('education', index)} className="absolute top-2 right-2 text-red-500 hover:text-red-700">×</button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <UniversityAutocomplete
                                required
                                label={text('Institution', 'Istituto')}
                                id={`edu-institution-${index}`}
                                name="institution"
                                value={edu.institution}
                                placeholder={text('Search or type the institution name', "Cerca o scrivi il nome dell'istituto")}
                                loadingLabel={text('Searching universities...', 'Ricerca universita in corso...')}
                                emptyLabel={text('No match found. You can keep the name you typed.', 'Nessun risultato. Puoi lasciare il nome inserito.')}
                                helperLabel={text('Suggestions come from OpenAlex. Free text is always accepted.', 'I suggerimenti arrivano da OpenAlex. Il testo libero resta sempre accettato.')}
                                onChange={e => handleArrayChange(e, 'education', index)}
                            />
                            <FormSelect required label={text('Education level', 'Livello di istruzione')} id={`edu-degree_level-${index}`} name="degree_level" value={edu.degree_level} onChange={e => handleArrayChange(e, 'education', index)}>
                                <option value="">{text('Select level...', 'Seleziona livello...')}</option>
                                {EDUCATION_LEVELS.map(level => (
                                    <option key={level.code} value={level.code}>{getEducationLevelLabel(level.code, language)}</option>
                                ))}
                            </FormSelect>
                            <MajorSelect label={text('Major', 'Corso di studi')} id={`edu-major-${index}`} name="major" value={edu.major} onChange={e => handleArrayChange(e as any, 'education', index)} />
                            <FormInput label={text('Specialization (Optional)', 'Specializzazione (opzionale)')} id={`edu-specialization-${index}`} name="specialization" value={edu.specialization || ''} onChange={e => handleArrayChange(e, 'education', index)} />
                            <MonthPicker required label={text('Start Date', 'Data inizio')} id={`edu-from-${index}`} name="from" value={edu.from} onChange={e => handleArrayChange(e as any, 'education', index)} />
                            <MonthPicker label={text('End Date', 'Data fine')} id={`edu-to-${index}`} name="to" value={edu.to} onChange={e => handleArrayChange(e as any, 'education', index)} allowPresent />
                        </div>
                        <div className="mt-4">
                            <FormTextarea label={text('Description', 'Descrizione')} id={`edu-description-${index}`} name="description" value={edu.description || ''} onChange={e => handleArrayChange(e as any, 'education', index)} rows={3} placeholder={text('Courses, thesis, projects, academic focus...', 'Corsi, tesi, progetti, focus accademico...')} />
                        </div>
                    </div>
                ))}
                <button type="button" onClick={() => addArrayItem('education', NEW_EDUCATION_DEFAULT)} className="text-sm text-orange-600 hover:underline">+ {text('Add Education', 'Aggiungi formazione')}</button>
            </SectionAccordion>

            <SectionAccordion title={text('Work Experience', 'Esperienza lavorativa')} icon={<span>💼</span>}>
                {profile.experiences?.map((exp, index) => (
                    <div key={index} className="p-4 border rounded-md mb-4 relative bg-slate-50 dark:bg-slate-900/50">
                        <button type="button" onClick={() => removeArrayItem('experiences', index)} className="absolute top-2 right-2 text-red-500 hover:text-red-700">×</button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormInput required label={text('Company', 'Azienda')} id={`exp-company-${index}`} name="company" value={exp.company} onChange={e => handleArrayChange(e, 'experiences', index)} />
                            <FormInput required label={text('Job Title', 'Ruolo')} id={`exp-role-${index}`} name="role" value={exp.role} onChange={e => handleArrayChange(e, 'experiences', index)} />
                            <CountrySelect label={text('Location Country', 'Paese')} id={`exp-loc-country-${index}`} name="location.country" value={exp.location?.country || ''} onChange={e => handleArrayChange(e as any, 'experiences', index)} />
                            <CitySelect label={text('Location City', 'Città')} id={`exp-loc-city-${index}`} name="location.city" value={exp.location?.city || ''} countryCode={exp.location?.country} onChange={e => handleArrayChange(e as any, 'experiences', index)} />
                            <MonthPicker required label={text('Start Date', 'Data inizio')} id={`exp-from-${index}`} name="from" value={exp.from} onChange={e => handleArrayChange(e as any, 'experiences', index)} />
                            <MonthPicker label={text('End Date', 'Data fine')} id={`exp-to-${index}`} name="to" value={exp.to} onChange={e => handleArrayChange(e as any, 'experiences', index)} allowPresent />
                        </div>
                        <div className="mt-4">
                            <FormTextarea label={text('Responsibilities / Achievements', 'Responsabilità / risultati')} id={`exp-description-${index}`} name="description" value={exp.description || ''} onChange={e => handleArrayChange(e as any, 'experiences', index)} rows={3} placeholder={text('What they built, owned, improved, measured...', 'Cosa hai costruito, gestito, migliorato, misurato...')} />
                        </div>
                    </div>
                ))}
                <button type="button" onClick={() => addArrayItem('experiences', NEW_EXPERIENCE_DEFAULT)} className="text-sm text-orange-600 hover:underline">+ {text('Add Experience', 'Aggiungi esperienza')}</button>
            </SectionAccordion>

            <SectionAccordion title={text('Skills & Languages', 'Competenze e lingue')} icon={<span>🛠️</span>}>
                <div className="mb-6">
                    <h3 className="text-md font-semibold text-slate-800 dark:text-slate-100 mb-2">{text('Technical Skills', 'Competenze tecniche')}</h3>
                    <p className="text-xs text-slate-500 mb-3 italic">{text('Tap the dots to self-rate each skill. These levels will be verified during the interview.', 'Tocca i pallini per autovalutare ogni competenza. I livelli indicati verranno verificati durante l’intervista.')}</p>
                    {profile.skills?.map((skill, index) => (
                        <div key={index} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px_auto] gap-2 mb-3 items-end">
                            <FormInput label={text('Skill Name', 'Nome skill')} id={`skill-name-${index}`} placeholder={text('Skill Name', 'Nome skill')} name="skill_name" value={skill.skill_name} onChange={e => handleArrayChange(e, 'skills', index)} />
                            <SkillLevelDots label={text('Level', 'Livello')} id={`skill-level-${index}`} value={skill.level} onChange={(level) => handleSkillLevelChange('skills', index, level)} />
                            <button type="button" onClick={() => removeArrayItem('skills', index)} className="text-red-500 hover:text-red-700 mt-6">×</button>
                        </div>
                    ))}
                    <button type="button" onClick={() => addArrayItem('skills', { skill_name: '', level: 1, rank: 99, level_source: 'cv_only' })} className="text-sm text-orange-600 hover:underline">+ {text('Add Technical Skill', 'Aggiungi skill tecnica')}</button>
                </div>

                <div className="mb-6">
                    <h3 className="text-md font-semibold text-slate-800 dark:text-slate-100 mb-2">{text('IT Skills', 'Competenze IT')}</h3>
                    <p className="text-xs text-slate-500 mb-3 italic">{text('Tap the dots to self-rate each program. These levels will be verified during the interview.', 'Tocca i pallini per autovalutare ogni programma. I livelli indicati verranno verificati durante l’intervista.')}</p>
                    {profile.it_skills?.map((skill, index) => (
                        <div key={index} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px_auto] gap-2 mb-3 items-end">
                            <FormInput label={text('IT Skill Name', 'Nome competenza IT')} id={`itskill-name-${index}`} placeholder={text('Software/Language', 'Software/Linguaggio')} name="skill_name" value={skill.skill_name} onChange={e => handleArrayChange(e, 'it_skills', index)} />
                            <SkillLevelDots label={text('Level', 'Livello')} id={`itskill-level-${index}`} value={skill.level} onChange={(level) => handleSkillLevelChange('it_skills', index, level)} />
                            <button type="button" onClick={() => removeArrayItem('it_skills', index)} className="text-red-500 hover:text-red-700 mt-6">×</button>
                        </div>
                    ))}
                    <button type="button" onClick={() => addArrayItem('it_skills', { skill_name: '', level: 1, rank: 99, level_source: 'cv_only' })} className="text-sm text-orange-600 hover:underline">+ {text('Add IT Skill', 'Aggiungi skill IT')}</button>
                </div>

                <div className="mb-6">
                    <h3 className="text-md font-semibold text-slate-800 dark:text-slate-100 mb-2">{text('Soft Skills', 'Soft skill')}</h3>
                    {profile.soft_skills?.map((skill, index) => (
                        <div key={index} className="flex items-center gap-2 mb-2">
                            <FormInput label={text('Soft Skill', 'Soft skill')} id={`softskill-name-${index}`} placeholder={text('e.g. Leadership', 'es. Leadership')} name="skill_name" value={skill.skill_name} onChange={e => handleArrayChange(e, 'soft_skills', index)} />
                            <button type="button" onClick={() => removeArrayItem('soft_skills', index)} className="text-red-500 hover:text-red-700 mt-6">×</button>
                        </div>
                    ))}
                    <button type="button" onClick={() => addArrayItem('soft_skills', { skill_name: '' })} className="text-sm text-orange-600 hover:underline">+ {text('Add Soft Skill', 'Aggiungi soft skill')}</button>
                </div>

                <h3 className="text-md font-semibold text-slate-800 dark:text-slate-100 mb-2 border-t pt-4 dark:border-slate-600">{text('Certifications', 'Certificazioni')}</h3>
                {profile.certifications?.map((cert, index) => (
                    <div key={index} className="flex items-center gap-2 mb-2">
                        <FormInput label={text('Certification Name', 'Nome certificazione')} id={`cert-name-${index}`} placeholder={text('Certification Name', 'Nome certificazione')} name="name" value={cert.name} onChange={e => handleArrayChange(e, 'certifications', index)} />
                        <MonthPicker label={text('Date', 'Data')} id={`cert-date-${index}`} name="date" value={cert.date} onChange={e => handleArrayChange(e as any, 'certifications', index)} />
                        <button type="button" onClick={() => removeArrayItem('certifications', index)} className="text-red-500 hover:text-red-700 mt-6">×</button>
                    </div>
                ))}
                <button type="button" onClick={() => addArrayItem('certifications', NEW_CERTIFICATION_DEFAULT)} className="text-sm text-orange-600 hover:underline">+ {text('Add Certification', 'Aggiungi certificazione')}</button>

                <h3 className="text-md font-semibold text-slate-800 dark:text-slate-100 mt-6 mb-2 border-t pt-4 dark:border-slate-600">{text('Languages', 'Lingue')}</h3>
                {profile.languages?.map((lang, index) => (
                    <div key={index} className="mb-4 flex flex-col gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800 md:flex-row md:items-end md:gap-4">
                        <div className="w-full md:flex-1">
                            <LanguageSelect
                                label={text('Language', 'Lingua')}
                                id={`lang-language-${index}`}
                                name="language"
                                value={lang.language}
                                onChange={(e: any) => handleArrayChange(e, 'languages', index)}
                            />
                        </div>
                        <div className="w-full md:w-[160px] md:flex-none">
                            <FormSelect label={text('Level', 'Livello')} id={`lang-level-${index}`} name="level" value={lang.level} onChange={e => handleArrayChange(e, 'languages', index)}>
                            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(l => <option key={l} value={l}>{l}</option>)}
                            </FormSelect>
                        </div>
                        <button type="button" onClick={() => removeArrayItem('languages', index)} className="self-end text-xl font-bold text-red-500 hover:text-red-700 md:mb-2">×</button>
                    </div>
                ))}
                <button type="button" onClick={() => addArrayItem('languages', NEW_LANGUAGE_DEFAULT)} className="text-sm text-orange-600 hover:underline">+ {text('Add Language', 'Aggiungi lingua')}</button>
            </SectionAccordion>

            <div className="p-6 border border-slate-200 dark:border-slate-700 rounded-xl">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b pb-2 dark:border-slate-600">{text('Preferences', 'Preferenze')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <FormInput label={text('Minimum Gross Salary (€)', 'RAL minima (€)')} id="min_ral" type="number" name="preferences.salary_eur.min" value={profile.preferences?.salary_eur?.min || ''} onChange={handleChange} />
                    <FormInput label={text('Salary Notes', 'Note sulla retribuzione')} id="salary_notes" name="preferences.salary_eur.notes" value={profile.preferences?.salary_eur?.notes || ''} onChange={handleChange} />
                    <div className="flex items-end mb-3">
                        <FormCheckbox label={text('Salary Flexibility', 'Flessibilità salariale')} id="salary_flex" name="preferences.salary_eur.flexibility" checked={profile.preferences?.salary_eur?.flexibility || false} onChange={handleChange} />
                    </div>
                </div>

                <div className="mb-4">
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{text('Remote Work', 'Lavoro da remoto')}</h4>
                    <FormSelect label={text('Preference', 'Preferenza')} id="remote" name="preferences.remote" value={profile.preferences?.remote || 'none'} onChange={handleChange}>
                        <option value="none">{text('On-site', 'In sede')}</option>
                        <option value="hybrid">{text('Hybrid', 'Ibrido')}</option>
                        <option value="full_remote">{text('Full Remote', 'Full remote')}</option>
                        <option value="no_preference">{text('No preference', 'Nessuna preferenza')}</option>
                    </FormSelect>
                </div>

                <div>
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{text('Preferred Locations', 'Località preferite')}</h4>
                    {profile.preferences?.preferred_locations?.map((loc, index) => (
                        <div key={index} className="flex gap-2 mb-2 items-end">
                            <CountrySelect label={text('Country', 'Paese')} id={`pref-loc-country-${index}`} name="country" value={loc.country} onChange={(e: any) => handleLocationChange(index, 'country', e.target.value)} />
                            <CitySelect label={text('City (Optional)', 'Città (opzionale)')} id={`pref-loc-city-${index}`} value={loc.city || ''} countryCode={loc.country} onChange={(e: any) => handleLocationChange(index, 'city', e.target.value)} />
                            <button type="button" onClick={() => removePreferredLocation(index)} className="mb-2 text-red-500 hover:text-red-700">×</button>
                        </div>
                    ))}
                    <button type="button" onClick={addPreferredLocation} className="text-sm text-orange-600 hover:underline">+ {text('Add Location', 'Aggiungi località')}</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 border-t pt-4 dark:border-slate-600">
                    <ContractTypeSelect
                        label={text('Desired Contract Types', 'Tipi di contratto desiderati')}
                        id="desired_contract_types"
                        value={profile.preferences?.desired_contract_types || []}
                        onChange={(e) => setProfile(p => ({ ...p, preferences: { ...p.preferences!, desired_contract_types: e.target.value } }))}
                    />
                    <SectorSelect
                        label={text('Preferred Industries', 'Settori preferiti')}
                        id="preferred_industries"
                        value={profile.preferences?.industries || []}
                        onChange={(e) => setProfile(p => ({ ...p, preferences: { ...p.preferences!, industries: e.target.value } }))}
                    />
                    <MultiCountrySelect
                        label={text('Work Eligibility Countries', 'Paesi con idoneità al lavoro')}
                        id="work_eligibility_countries"
                        value={profile.preferences?.work_eligibility_countries || []}
                        onChange={(e) => setProfile(p => ({ ...p, preferences: { ...p.preferences!, work_eligibility_countries: e.target.value } }))}
                    />
                </div>
            </div>


            {validationError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 4a8 8 0 100 16A8 8 0 0012 4z" /></svg>
                    {validationError}
                </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12 border-t pt-8 dark:border-slate-800">
                <button
                    type="button"
                    onClick={(e) => handleAction(e, 'save')}
                    disabled={isSaving}
                    className="w-full sm:w-auto min-w-[200px] bg-slate-800 dark:bg-slate-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg hover:bg-slate-900 dark:hover:bg-slate-600 transition-all disabled:opacity-50"
                >
                    {isSaving ? text('Saving...', 'Salvataggio...') : resolvedSaveLabel}
                </button>

                {showRefineAction && initialData.ai_refined ? (
                    <div className="w-full sm:w-auto min-w-[200px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-bold py-3 px-8 rounded-xl border border-green-200 dark:border-green-800 flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        <span>{text('AI Interview Done', 'Intervista AI completata')}</span>
                    </div>
                ) : showRefineAction ? (
                    <button
                        type="button"
                        onClick={(e) => handleAction(e, 'refine')}
                        disabled={isSaving}
                        className="w-full sm:w-auto min-w-[200px] bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <span>{resolvedRefineLabel}</span>
                    </button>
                ) : null}
            </div>
            <p className="text-center text-xs text-slate-400 mt-4 italic">
                {helperText || (!showRefineAction
                    ? text('Save changes to update the seeker profile from the admin console.', 'Salva le modifiche per aggiornare il profilo candidato dalla console admin.')
                    : initialData.ai_refined
                    ? text('Your profile has been AI-refined. You can still save manual edits.', 'Il tuo profilo è già stato raffinato con l’AI. Puoi comunque salvare modifiche manuali.')
                    : text('"Save & Exit" persists your manual changes. "AI Assistant" will interview you to verify skills and boost your match score.', '"Salva ed esci" mantiene le modifiche manuali. "Assistente AI" ti intervisterà per verificare le skill e migliorare il tuo punteggio di matching.')
                )}
            </p>
        </div>
    );
};

export default CandidateForm;
