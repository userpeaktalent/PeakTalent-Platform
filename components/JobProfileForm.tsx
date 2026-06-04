
import React, { useState, useEffect } from 'react';
import { JobProfile, JobSkill, JobSoftSkill } from '../types';
import { CountrySelect } from './CountrySelect';
import { CitySelect } from './CitySelect';
import { LanguageSelect } from './LanguageSelect';
import { SectorSelect } from './SectorSelect';
import { SKILL_LEVELS, getSkillLevelLabel } from '../utils/skills';
import { EDUCATION_LEVELS, getEducationLevelLabel } from '../utils/education';
import { useLanguage } from './LanguageProvider';

const EXPERIENCE_REQUIREMENT_OPTIONS = [
    { value: 0, labelEn: 'No minimum', labelIt: 'Nessuna' },
    { value: 2, labelEn: '2 years+', labelIt: '2 anni+' },
    { value: 5, labelEn: '5 years+', labelIt: '5 anni+' },
    { value: 7, labelEn: '7 years+', labelIt: '7 anni+' },
    { value: 10, labelEn: '10 years+', labelIt: '10 anni+' },
    { value: 15, labelEn: '15 years+', labelIt: '15 anni+' },
];

const normalizeExperienceRequirement = (value?: number | string | null) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;

    return EXPERIENCE_REQUIREMENT_OPTIONS.reduce((closest, option) => {
        const currentDistance = Math.abs(option.value - numericValue);
        const closestDistance = Math.abs(closest.value - numericValue);

        if (currentDistance < closestDistance) return option;
        if (currentDistance === closestDistance && option.value > closest.value) return option;
        return closest;
    }).value;
};

// --- Helper Components ---

const FormInput: React.FC<{ label: string; id: string;[key: string]: any; }> = ({ label, id, ...props }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
        <input id={id} {...props} className="mt-1 block w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white transition-shadow duration-200" />
    </div>
);

const FormSelect: React.FC<{ label: string; id: string;[key: string]: any; }> = ({ label, id, children, ...props }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
        <select id={id} {...props} className="mt-1 block w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white transition-shadow duration-200">
            {children}
        </select>
    </div>
);

const FormTextarea: React.FC<{ label: string; id: string;[key: string]: any; }> = ({ label, id, ...props }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
        <textarea id={id} {...props} className="mt-1 block w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white transition-shadow duration-200" />
    </div>
);

const FormSlider: React.FC<{ label: string; id: string; value: number; onChange: (val: number) => void }> = ({ label, id, value, onChange }) => (
    <div className="flex-1 max-w-[360px]">
        <div className="flex justify-between items-center mb-1.5">
            <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
            <span className="text-[9px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-tight px-1.5 py-0.5 bg-orange-50 dark:bg-orange-900/30 rounded-full border border-orange-100 dark:border-orange-800/50">
                {getSkillLevelLabel(Math.round(value))} ({Math.round(value)})
            </span>
        </div>
        <div className="relative px-1">
            <input
                type="range"
                id={id}
                min="1"
                max="10"
                step="0.1"
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500 transition-all hover:bg-slate-300 dark:hover:bg-slate-600"
            />
            <div className="flex justify-between mt-1 px-0.5 pointer-events-none">
                {[2, 4, 6, 8, 10].map(n => (
                    <div key={n} className="flex flex-col items-center" style={{ width: '0' }}>
                        <div className="h-0.5 w-px bg-slate-300 dark:bg-slate-600"></div>
                    </div>
                ))}
            </div>
            <div className="flex justify-between text-[7px] text-slate-400 font-bold uppercase mt-1 px-0.5 tracking-tighter pointer-events-none opacity-80">
                <span>Novice</span>
                <span>Comp</span>
                <span>Prof</span>
                <span>Expert</span>
                <span>Master</span>
            </div>
        </div>
    </div>
);

const FormCheckbox: React.FC<{ label: string; id: string;[key: string]: any; }> = ({ label, id, ...props }) => (
    <div className="flex items-center">
        <input type="checkbox" id={id} {...props} className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-600" />
        <label htmlFor={id} className="ml-2 block text-sm text-slate-700 dark:text-slate-300">{label}</label>
    </div>
);

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

interface JobProfileFormProps {
    initialData: JobProfile;
    onSubmit: (data: JobProfile) => void;
}

const JobProfileForm: React.FC<JobProfileFormProps> = ({ initialData, onSubmit }) => {
    const { text, language } = useLanguage();
    const [job, setJob] = useState<JobProfile>({
        ...initialData,
        requires_quiz: initialData.requires_quiz ?? false,
        experience_required: normalizeExperienceRequirement(initialData.experience_required),
        constraints: initialData.constraints || { contract_type: 'full_time', location: { country: '', city: '' }, remote: 'none' },
        skills: initialData.skills || [],
        it_skills: initialData.it_skills || [],
        soft_skills: initialData.soft_skills || []
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const parts = name.split('.');

        if (parts.length === 3) {
            const [section, field, subfield] = parts;
            setJob(prev => ({
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
            setJob(prev => ({
                ...prev,
                // @ts-ignore
                [section]: {
                    // @ts-ignore
                    ...prev[section],
                    [field]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
                }
            }));
        } else {
            setJob(prev => ({
                ...prev,
                [name]: name === 'experience_required'
                    ? normalizeExperienceRequirement(value)
                    : type === 'checkbox'
                        ? (e.target as HTMLInputElement).checked
                        : value
            }));
        }
    };

    const handleArrayChange = (section: 'skills' | 'it_skills' | 'soft_skills' | 'constraints.languages', index: number, field: string, value: any) => {
        const parts = section.split('.');
        if (parts.length === 2) {
            const [parent, child] = parts;
            // @ts-ignore
            const updatedArray = [...(job[parent][child] || [])];
            updatedArray[index] = { ...updatedArray[index], [field]: value };
            setJob(prev => ({
                ...prev,
                [parent]: {
                    // @ts-ignore
                    ...prev[parent],
                    [child]: updatedArray
                }
            }));
        } else {
            // @ts-ignore
            const updatedArray = [...(job[section] || [])];
            updatedArray[index] = { ...updatedArray[index], [field]: value };
            setJob(prev => ({ ...prev, [section]: updatedArray }));
        }
    };

    const addArrayItem = (section: 'skills' | 'it_skills' | 'soft_skills' | 'constraints.languages', defaultValue: any) => {
        const parts = section.split('.');
        if (parts.length === 2) {
            const [parent, child] = parts;
            setJob(prev => ({
                ...prev,
                [parent]: {
                    // @ts-ignore
                    ...prev[parent],
                    // @ts-ignore
                    [child]: [...(prev[parent][child] || []), defaultValue]
                }
            }));
        } else {
            // @ts-ignore
            setJob(prev => ({ ...prev, [section]: [...(prev[section] || []), defaultValue] }));
        }
    };

    const removeArrayItem = (section: 'skills' | 'it_skills' | 'soft_skills' | 'constraints.languages', index: number) => {
        const parts = section.split('.');
        if (parts.length === 2) {
            const [parent, child] = parts;
            setJob(prev => ({
                ...prev,
                [parent]: {
                    // @ts-ignore
                    ...prev[parent],
                    // @ts-ignore
                    [child]: (prev[parent][child] || []).filter((_, i) => i !== index)
                }
            }));
        } else {
            // @ts-ignore
            setJob(prev => ({ ...prev, [section]: (prev[section] || []).filter((_, i) => i !== index) }));
        }
    };

    const handleSectorChange = (event: { target: { value: string[] } }) => {
        setJob(prev => ({ ...prev, industry: event.target.value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            ...job,
            requires_quiz: Boolean(job.requires_quiz),
            technical_test: job.requires_quiz ? job.technical_test : undefined,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8 animate-fade-in">
            <div className="p-6 border border-slate-200 dark:border-slate-700 rounded-xl">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b pb-2 dark:border-slate-600">{text('Core Job Details', 'Dettagli principali del job')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput label={text('Job Title', 'Titolo job')} id="title" name="title" value={job.title} onChange={handleChange} required />
                    <FormInput label={text('Company Name', 'Nome azienda')} id="company_name" name="company_name" value={job.company_name} onChange={handleChange} />
                    <SectorSelect
                        label={text('Industry Sectors', 'Settori')}
                        id="industry"
                        value={job.industry}
                        onChange={handleSectorChange}
                    />
                    <FormInput label={text('Job Function', 'Funzione')} id="job_function" name="job_function" value={job.job_function} onChange={handleChange} required />
                    <FormSelect label={text('Seniority Level', 'Seniorità')} id="seniority" name="seniority_level" value={job.seniority_level} onChange={handleChange}>
                        <option value="">{text('Select Seniority...', 'Seleziona seniorità...')}</option>
                        <option value="intern">{text('Intern', 'Stage')}</option>
                        <option value="junior">{text('Junior', 'Junior')}</option>
                        <option value="mid">Mid</option>
                        <option value="senior">{text('Senior', 'Senior')}</option>
                        <option value="lead">{text('Lead', 'Lead')}</option>
                    </FormSelect>
                    <FormSelect label={text('Minimum work experience', 'Esperienza lavorativa minima')} id="exp_req" name="experience_required" value={normalizeExperienceRequirement(job.experience_required)} onChange={handleChange}>
                        {EXPERIENCE_REQUIREMENT_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                                {text(option.labelEn, option.labelIt)}
                            </option>
                        ))}
                    </FormSelect>
                    <FormSelect label={text('Minimum education level', 'Livello istruzione minimo')} id="min_education_level" name="constraints.min_education_level" value={job.constraints.min_education_level || ''} onChange={handleChange}>
                        <option value="">{text('No minimum', 'Nessun minimo')}</option>
                        {EDUCATION_LEVELS.map(level => (
                            <option key={level.code} value={level.code}>{getEducationLevelLabel(level.code, language)}</option>
                        ))}
                    </FormSelect>
                </div>
                <div className="mt-4">
                    <FormTextarea
                        label={text('Short Summary', 'Sintesi breve')}
                        id="summary_text"
                        name="summary_text"
                        value={job.summary_text}
                        onChange={handleChange}
                        rows={3}
                    />
                </div>
                <div className="mt-4">
                    <FormTextarea
                        label={text('Job Description', 'Job description')}
                        id="job_description"
                        name="job_description"
                        value={job.job_description || ''}
                        onChange={handleChange}
                        rows={5}
                    />
                </div>
                <div className="mt-4">
                    <FormTextarea
                        label={text('Full Posting / Recruiter Notes', 'Posting completo / Note recruiter')}
                        id="full_job_posting_description"
                        name="full_job_posting_description"
                        value={job.full_job_posting_description || ''}
                        onChange={handleChange}
                        rows={6}
                    />
                </div>
            </div>

            <SectionAccordion title={text('Location & Constraints', 'Località e vincoli')} icon={<span>📍</span>}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CountrySelect label={text('Country', 'Paese')} id="job-country" name="constraints.location.country" value={job.constraints.location.country} onChange={handleChange as any} />
                    <CitySelect label={text('City', 'Città')} id="job-city" name="constraints.location.city" value={job.constraints.location.city} countryCode={job.constraints.location.country} onChange={handleChange as any} />
                    <FormSelect label={text('Contract Type', 'Tipo contratto')} id="contract" name="constraints.contract_type" value={job.constraints.contract_type} onChange={handleChange}>
                        <option value="full_time">{text('Full Time', 'Tempo pieno')}</option>
                        <option value="part_time">{text('Part Time', 'Part-time')}</option>
                        <option value="internship">{text('Internship', 'Stage')}</option>
                        <option value="collaboration">{text('Collaboration', 'Collaborazione')}</option>
                        <option value="phd_other">{text('PhD / Other', 'PhD / Altro')}</option>
                    </FormSelect>
                    <FormSelect label={text('Remote Policy', 'Modalità di lavoro')} id="remote" name="constraints.remote" value={job.constraints.remote} onChange={handleChange}>
                        <option value="none">{text('On-site', 'In sede')}</option>
                        <option value="hybrid">{text('Hybrid', 'Ibrido')}</option>
                        <option value="full_remote">{text('Full Remote', 'Full remote')}</option>
                        <option value="no_preference">{text('No preference', 'Nessuna preferenza')}</option>
                    </FormSelect>
                    <div className="md:col-span-2 flex flex-wrap gap-6 mt-2">
                        <FormCheckbox label={text('Visa Sponsorship', 'Sponsorizzazione visto')} id="visa_sponsorship" name="constraints.visa_sponsorship" checked={job.constraints.visa_sponsorship || false} onChange={handleChange} />
                        <FormCheckbox label={text('Relocation Support', 'Supporto relocation')} id="relocation_support" name="constraints.relocation_support" checked={job.constraints.relocation_support || false} onChange={handleChange} />
                    </div>
                </div>

                <h4 className="text-md font-semibold text-slate-800 dark:text-slate-100 mt-6 mb-4 border-t pt-4 dark:border-slate-600">{text('Salary Range (EUR)', 'Range salariale (EUR)')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput id="salary-min" label={text('Min Annual Salary', 'RAL minima')} type="number" name="constraints.salary_eur.min" value={job.constraints.salary_eur?.min} onChange={handleChange} />
                    <FormInput id="salary-max" label={text('Max Annual Salary', 'RAL massima')} type="number" name="constraints.salary_eur.max" value={job.constraints.salary_eur?.max} onChange={handleChange} />
                </div>

                <h4 className="text-md font-semibold text-slate-800 dark:text-slate-100 mt-6 mb-4 border-t pt-4 dark:border-slate-600">{text('Language Requirements', 'Requisiti linguistici')}</h4>
                {job.constraints.languages?.map((lang, index) => (
                    <div key={index} className="flex flex-col md:flex-row gap-4 items-start md:items-end bg-slate-50 dark:bg-slate-800 p-4 rounded-lg mb-2">
                        <LanguageSelect
                            id={`lang-code-${index}`}
                            label={text('Language', 'Lingua')}
                            value={lang.language}
                            onChange={(e: any) => handleArrayChange('constraints.languages', index, 'language', e.target.value)}
                        />
                        <FormSelect id={`lang-level-req-${index}`} label={text('Required Level', 'Livello richiesto')} value={lang.level} onChange={(e: any) => handleArrayChange('constraints.languages', index, 'level', e.target.value)}>
                            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(l => <option key={l} value={l}>{l}</option>)}
                        </FormSelect>
                        <button type="button" onClick={() => removeArrayItem('constraints.languages', index)} className="mb-2 text-red-500 hover:text-red-700 font-bold text-xl">×</button>
                    </div>
                ))}
                <button type="button" onClick={() => addArrayItem('constraints.languages', { language: '', level: 'B2' })} className="text-sm text-orange-600 hover:underline">+ {text('Add Language', 'Aggiungi lingua')}</button>
            </SectionAccordion>

            <SectionAccordion title={text('Skills & Assessments', 'Competenze e valutazioni')} icon={<span>🛠️</span>}>
                <div className="space-y-6">
                    <div>
                        <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-4">{text('Technical Skills', 'Competenze tecniche')}</h4>
                        {job.skills.map((skill, index) => (
                            <div key={index} className="flex flex-col md:flex-row gap-4 items-start md:items-end bg-slate-50 dark:bg-slate-800 p-4 rounded-lg mb-2">
                                <FormInput id={`job-skill-name-${index}`} label={text('Skill Name', 'Nome skill')} value={skill.skill_name} onChange={(e: any) => handleArrayChange('skills', index, 'skill_name', e.target.value)} />
                                <FormSlider
                                    id={`job-skill-level-${index}`}
                                    label={text('Required Level', 'Livello richiesto')}
                                    value={skill.level}
                                    onChange={(val) => handleArrayChange('skills', index, 'level', val)}
                                />
                                <div className="flex items-center gap-2 mb-3">
                                    <input type="checkbox" checked={skill.must} onChange={(e: any) => handleArrayChange('skills', index, 'must', e.target.checked)} />
                                    <label className="text-xs">{text('Must Have', 'Obbligatoria')}</label>
                                </div>
                                <button type="button" onClick={() => removeArrayItem('skills', index)} className="text-red-500 mb-3">×</button>
                            </div>
                        ))}
                        <button type="button" onClick={() => addArrayItem('skills', { skill_name: '', level: 5, must: true })} className="text-sm text-orange-600 hover:underline">+ {text('Add Technical Skill', 'Aggiungi skill tecnica')}</button>
                    </div>

                    <div>
                        <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-4">{text('IT Skills', 'Competenze IT')}</h4>
                        {job.it_skills.map((skill, index) => (
                            <div key={index} className="flex flex-col md:flex-row gap-4 items-start md:items-end bg-slate-50 dark:bg-slate-800 p-4 rounded-lg mb-2">
                                <FormInput id={`job-it-skill-name-${index}`} label={text('Software', 'Software')} value={skill.skill_name} onChange={(e: any) => handleArrayChange('it_skills', index, 'skill_name', e.target.value)} />
                                <FormSlider
                                    id={`job-it-skill-level-${index}`}
                                    label={text('Required Level', 'Livello richiesto')}
                                    value={skill.level}
                                    onChange={(val) => handleArrayChange('it_skills', index, 'level', val)}
                                />
                                <div className="flex items-center gap-2 mb-3">
                                    <input type="checkbox" checked={skill.must} onChange={(e: any) => handleArrayChange('it_skills', index, 'must', e.target.checked)} />
                                    <label className="text-xs">{text('Must Have', 'Obbligatoria')}</label>
                                </div>
                                <button type="button" onClick={() => removeArrayItem('it_skills', index)} className="text-red-500 mb-3">×</button>
                            </div>
                        ))}
                        <button type="button" onClick={() => addArrayItem('it_skills', { skill_name: '', level: 5, must: true })} className="text-sm text-orange-600 hover:underline">+ {text('Add IT Skill', 'Aggiungi skill IT')}</button>
                    </div>

                    <div>
                        <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-4">{text('Soft Skills', 'Soft skill')}</h4>
                        {job.soft_skills.map((skill, index) => (
                            <div key={index} className="flex gap-4 items-center bg-slate-50 dark:bg-slate-800 p-4 rounded-lg mb-2">
                                <FormInput id={`job-soft-skill-name-${index}`} label={text('Skill Name', 'Nome skill')} value={skill.skill_name} onChange={(e: any) => handleArrayChange('soft_skills', index, 'skill_name', e.target.value)} />
                                <div className="flex items-center gap-2 mt-4">
                                    <input type="checkbox" checked={skill.must} onChange={(e: any) => handleArrayChange('soft_skills', index, 'must', e.target.checked)} />
                                    <label className="text-xs">{text('Must Have', 'Obbligatoria')}</label>
                                </div>
                                <button type="button" onClick={() => removeArrayItem('soft_skills', index)} className="text-red-500 mt-4">×</button>
                            </div>
                        ))}
                        <button type="button" onClick={() => addArrayItem('soft_skills', { skill_name: '', must: false })} className="text-sm text-orange-600 hover:underline">+ {text('Add Soft Skill', 'Aggiungi soft skill')}</button>
                    </div>
                </div>
            </SectionAccordion>

            <div className="text-center mt-8">
                <button type="submit" className="w-full max-w-xs bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transform transition-all duration-300">
                    {text('Confirm & Continue', 'Conferma e continua')}
                </button>
            </div>
        </form>
    );
};

export default JobProfileForm;
