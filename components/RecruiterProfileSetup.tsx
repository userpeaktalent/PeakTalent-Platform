
import React, { useEffect, useState } from 'react';
import { RecruiterProfile } from '../types';
import { CountrySelect } from './CountrySelect';
import { CitySelect } from './CitySelect';
import { SectorSelect } from './SectorSelect';
import { addRecruiter } from '../services/dbService';
import { Spinner } from './common';
import { useLanguage } from './LanguageProvider';
import CompanyLogo from './CompanyLogo';
import { uploadCompanyLogo } from '../services/companyLogoService';

interface RecruiterProfileSetupProps {
    recruiter: RecruiterProfile;
    onProfileComplete: (updatedProfile: RecruiterProfile) => void;
    isEditing?: boolean;
    onBack?: () => void;
    embedded?: boolean;
    saveLabel?: string;
    onSaveProfile?: (updatedProfile: RecruiterProfile) => Promise<void>;
}

const FormInput: React.FC<{ label: string; id: string;[key: string]: any; }> = ({ label, id, ...props }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
        <input id={id} {...props} className="mt-1 block w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white transition-shadow duration-200" />
    </div>
);

const RecruiterProfileSetup: React.FC<RecruiterProfileSetupProps> = ({
    recruiter,
    onProfileComplete,
    isEditing = false,
    onBack,
    embedded = false,
    saveLabel,
    onSaveProfile,
}) => {
    const { text } = useLanguage();
    const [profile, setProfile] = useState<RecruiterProfile>({
        ...recruiter,
        email: recruiter.email || '',
        first_name: recruiter.first_name || '',
        last_name: recruiter.last_name || '',
        role: recruiter.role || '',
        company_name: recruiter.company_name || '',
        company_location: recruiter.company_location || {
            country: '',
            city: '',
            address: '',
        },
        sector: recruiter.sector || [],
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!logoFile) {
            setLogoPreviewUrl(null);
            return;
        }

        const objectUrl = URL.createObjectURL(logoFile);
        setLogoPreviewUrl(objectUrl);

        return () => {
            URL.revokeObjectURL(objectUrl);
        };
    }, [logoFile]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement> | { target: { name: string; value: any } }) => {
        const { name, value } = e.target;
        const [section, field] = name.split('.');

        if (field) { // Nested object like company_location
            setProfile(prev => ({
                ...prev,
                [section]: {
                    // @ts-ignore
                    ...prev[section],
                    [field]: value,
                }
            }));
        } else {
            setProfile(prev => ({
                ...prev,
                [name]: value,
            }));
        }
    };

    const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextFile = event.target.files?.[0] || null;
        setLogoFile(nextFile);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            let nextProfile = profile;

            if (logoFile) {
                if (!profile.id) {
                    throw new Error(text('Recruiter profile ID is missing, so the logo cannot be uploaded yet.', 'Manca l\'ID del profilo recruiter, quindi il logo non puo essere caricato ancora.'));
                }

                const uploadedLogo = await uploadCompanyLogo({
                    file: logoFile,
                    recruiterId: profile.id,
                    previousPath: profile.company_logo_path,
                });

                nextProfile = {
                    ...profile,
                    company_logo_url: uploadedLogo.publicUrl,
                    company_logo_path: uploadedLogo.path,
                };
                setProfile(nextProfile);
            }

            if (onSaveProfile) {
                await onSaveProfile(nextProfile);
            } else {
                await addRecruiter(nextProfile);
            }
            setLogoFile(null);
            onProfileComplete(nextProfile);
        } catch (err) {
            console.error("Failed to save recruiter profile:", err);
            setError((err as Error)?.message || text('Could not save your profile. Please try again.', 'Impossibile salvare il profilo. Riprova.'));
            setIsLoading(false);
            return;
        }
        setIsLoading(false);
    };

    return (
        <div className={embedded ? "animate-fade-in" : "max-w-6xl mx-auto pt-2.5 pb-8 px-3 sm:px-8 lg:px-10 animate-fade-in"}>
            {!embedded && isEditing && onBack && (
                <div className="mb-4">
                    <button onClick={onBack} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors flex items-center gap-1 font-medium text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        {text('Back', 'Indietro')}
                    </button>
                </div>
            )}

            <div className={`bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden ${embedded ? 'p-0 md:p-0' : 'p-5 sm:p-8 md:p-10'}`}>
                {!embedded && <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 to-amber-500"></div>}

                {!embedded && (
                    <div className="mb-8 border-b border-slate-100 pb-6 flex flex-col gap-4 items-center text-center dark:border-slate-700 md:mb-10 md:flex-row md:gap-6 md:items-start md:pb-8 md:text-left">
                        <div className="h-16 w-16 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full flex items-center justify-center text-3xl flex-shrink-0 border-4 border-white dark:border-slate-800 shadow-sm md:h-20 md:w-20">
                            🏢
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight sm:text-3xl">{isEditing ? text('Edit Company Profile', 'Modifica profilo azienda') : text('Complete Your Profile', 'Completa il tuo profilo')}</h1>
                            <p className="mt-2 text-base text-slate-500 dark:text-slate-400 sm:text-lg">
                                {isEditing ? text('Update your recruiter identity and company details.', 'Aggiorna la tua identità recruiter e i dettagli aziendali.') : text("Welcome! Let's get your recruiter presence set up so candidates know who's hiring.", 'Benvenuto. Impostiamo la tua presenza recruiter così i candidati capiscono chi sta assumendo.')}
                            </p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className={embedded ? 'space-y-8 p-6 md:p-7' : 'space-y-10'}>
                    {/* Section 1: Personal Info */}
                    <section>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500 dark:text-slate-400 text-sm">1</div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{text('Personal Details', 'Dati personali')}</h3>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <FormInput label={text('First Name', 'Nome')} id="first_name" name="first_name" value={profile.first_name} onChange={handleChange} required />
                                <FormInput label={text('Last Name', 'Cognome')} id="last_name" name="last_name" value={profile.last_name} onChange={handleChange} required />
                                <FormInput label={text('Work Email', 'Email lavoro')} id="email" name="email" type="email" value={profile.email} onChange={handleChange} required />
                            </div>
                            <FormInput label={text('Job Title / Role', 'Ruolo / Job title')} id="role" name="role" value={profile.role} onChange={handleChange} placeholder={text('e.g., Senior Technical Recruiter', 'es. Senior Technical Recruiter')} required />
                        </div>
                    </section>

                    {/* Section 2: Company Info */}
                    <section>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500 dark:text-slate-400 text-sm">2</div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{text('Company Information', 'Informazioni azienda')}</h3>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-5">
                            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-950/50">
                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                    <div className="flex items-center gap-4">
                                        <CompanyLogo
                                            logoUrl={logoPreviewUrl || profile.company_logo_url}
                                            companyName={profile.company_name}
                                            size="lg"
                                        />
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                                {text('Company Logo', 'Logo aziendale')}
                                            </p>
                                            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                                {text('Upload the company logo shown next to your job postings across the platform.', 'Carica il logo aziendale mostrato accanto ai tuoi job post in tutta la piattaforma.')}
                                            </p>
                                        </div>
                                    </div>
                                    <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-orange-700 dark:hover:text-orange-300">
                                        {logoFile
                                            ? text('Replace logo', 'Sostituisci logo')
                                            : text('Upload logo', 'Carica logo')}
                                        <input
                                            type="file"
                                            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                                            className="hidden"
                                            onChange={handleLogoChange}
                                        />
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <FormInput label={text('Company Name', 'Nome azienda')} id="company_name" name="company_name" value={profile.company_name} onChange={handleChange} placeholder={text('e.g., Acme Corp', 'es. Acme Corp')} required />
                                <SectorSelect label={text('Industry Sector', 'Settore aziendale')} id="sector" name="sector" value={profile.sector || []} onChange={handleChange as any} required />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <CitySelect label={text('Headquarters City', 'Città sede')} id="city" name="company_location.city" value={profile.company_location.city} countryCode={profile.company_location.country} onChange={handleChange as any} required />
                                <CountrySelect label={text('Country', 'Paese')} id="country" name="company_location.country" value={profile.company_location.country} onChange={handleChange as any} required />
                            </div>
                            <FormInput label={text('Full Address', 'Indirizzo completo')} id="address" name="company_location.address" value={profile.company_location.address} onChange={handleChange} required />
                        </div>
                    </section>

                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 rounded-xl text-center text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <div className="pt-6 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row justify-end gap-4 items-center">
                        {!embedded && isEditing && onBack && (
                            <button type="button" onClick={onBack} className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                {text('Cancel', 'Annulla')}
                            </button>
                        )}
                        <button type="submit" disabled={isLoading} className={`w-full sm:w-auto text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${embedded ? 'bg-slate-900 px-7 py-3 text-base hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white' : 'bg-gradient-to-r from-orange-500 to-amber-500 py-3 px-10 text-lg'}`}>
                            {isLoading ? <Spinner /> : (
                                <>
                                    {saveLabel || (isEditing ? text('Save Profile', 'Salva profilo') : text('Complete Setup', 'Completa setup'))}
                                    {!isLoading && <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RecruiterProfileSetup;
