
import React, { useEffect, useState, useMemo } from 'react';
import { JobProfile, CandidateProfile } from '../types';
import { getAllJobs, getJobsForCandidate } from '../services/dbService';
import { Spinner } from './common';
import { useLanguage } from './LanguageProvider';
import CompanyLogo from './CompanyLogo';
import { withRetry } from '../utils/retry';

interface JobBoardPageProps {
    candidate: CandidateProfile;
    onBack: () => void;
    onViewJob: (job: JobProfile) => void;
}

// Filter configuration
const INDUSTRIES = ['Technology', 'Finance', 'Healthcare', 'Engineering', 'Marketing', 'Education', 'Other'];
const CONTRACT_TYPES = ['full_time', 'part_time', 'internship', 'collaboration', 'phd_other'];
const REMOTE_OPTIONS = ['full_remote', 'hybrid', 'none'];
const SENIORITY_LEVELS = ['intern', 'junior', 'mid', 'senior', 'lead'];

const formatLabel = (str: string) => str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Icons
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const BackIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
const LocationIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const BriefcaseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
const MoneyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const FilterIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>;

const JobBoardCard: React.FC<{
    job: JobProfile;
    isApplied: boolean;
    onView: (job: JobProfile) => void;
}> = ({ job, isApplied, onView }) => {
    const { text } = useLanguage();
    return (
        <div onClick={() => onView(job)} className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl hover:border-orange-300 dark:hover:border-orange-700 transition-all duration-300 group overflow-hidden flex flex-col h-full cursor-pointer">
            {/* Top accent bar */}
            <div className="h-1 bg-gradient-to-r from-slate-200 to-slate-200 dark:from-slate-700 dark:to-slate-700 group-hover:from-orange-400 group-hover:to-amber-500 transition-all duration-500"></div>

            <div className="p-6 flex flex-col flex-grow">
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-wrap gap-1.5">
                        <span className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                            {(Array.isArray(job.industry) ? job.industry : [job.industry]).join(', ')}
                        </span>
                        {job.seniority_level && (
                            <span className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                                {job.seniority_level}
                            </span>
                        )}
                    </div>
                    {isApplied && (
                        <span className="text-[10px] font-black uppercase text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2.5 py-1 rounded-lg flex items-center gap-1 flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            {text('Interest Shown', 'Interesse mostrato')}
                        </span>
                    )}
                </div>

                <div className="mb-3 flex items-start gap-3">
                    <CompanyLogo
                        logoUrl={job.company_logo_url}
                        companyName={job.company_name}
                        size="sm"
                        className="shrink-0"
                        fullBleed
                    />
                    <div className="min-w-0">
                        <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 group-hover:text-orange-500 transition-colors mb-1 line-clamp-2">
                            {job.title}
                        </h3>
                        <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                            {job.company_name || text('Confidential Employer', 'Azienda riservata')}
                        </p>
                    </div>
                </div>

                {/* Info pills */}
                <div className="space-y-2 mb-4 text-xs text-slate-500 dark:text-slate-400">
                    {job.constraints?.location && (
                        <div className="flex items-center gap-2">
                            <LocationIcon />
                            <span className="font-medium">{job.constraints.location.city}, {job.constraints.location.country}</span>
                        </div>
                    )}
                    {job.constraints && (
                        <div className="flex items-center gap-2">
                            <BriefcaseIcon />
                            <span className="font-medium capitalize">{formatLabel(job.constraints.contract_type || '')} &bull; {formatLabel(job.constraints.remote || '')}</span>
                        </div>
                    )}
                    {job.constraints?.salary_eur && (
                        <div className="flex items-center gap-2">
                            <MoneyIcon />
                            <span className="font-medium">€{job.constraints.salary_eur.min.toLocaleString()} - €{job.constraints.salary_eur.max.toLocaleString()}</span>
                        </div>
                    )}
                </div>

                {/* Summary */}
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed mb-4 flex-grow">
                    {job.summary_text}
                </p>

                {/* Skills preview */}
                {job.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-5">
                        {job.skills.slice(0, 4).map((s, i) => (
                            <span key={i} className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${s.must
                                ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 border border-orange-200 dark:border-orange-800'
                                : 'bg-slate-50 text-slate-500 dark:bg-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-600'
                                }`}>
                                {s.skill_name}
                            </span>
                        ))}
                        {job.skills.length > 4 && (
                            <span className="text-[10px] font-black text-slate-400 self-center">+{job.skills.length - 4}</span>
                        )}
                    </div>
                )}

                {/* CTA */}
                <button
                    onClick={() => onView(job)}
                    className={`w-full font-bold py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all text-sm ${isApplied
                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                        : 'bg-slate-900 dark:bg-slate-700 text-white hover:bg-orange-500 dark:hover:bg-orange-600'
                        }`}
                >
                    {isApplied ? text('View Status', 'Vedi stato') : text('View Details & Show Interest', 'Vedi dettagli e mostra interesse')}
                </button>
            </div>
        </div>
    );
};

const FilterChip: React.FC<{
    label: string;
    active: boolean;
    onClick: () => void;
}> = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${active
            ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20'
            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-600'
            }`}
    >
        {label}
    </button>
);

const JobBoardPage: React.FC<JobBoardPageProps> = ({ candidate, onBack, onViewJob }) => {
    const { text, language } = useLanguage();
    const [allJobs, setAllJobs] = useState<JobProfile[]>([]);
    const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);

    // Search & Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
    const [selectedContract, setSelectedContract] = useState<string | null>(null);
    const [selectedRemote, setSelectedRemote] = useState<string | null>(null);
    const [selectedSeniority, setSelectedSeniority] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [jobs, appliedJobs] = await withRetry(() => Promise.all([
                    getAllJobs(),
                    getJobsForCandidate(candidate.contacts.email, candidate.id)
                ]), {
                    attempts: 3,
                    delaysMs: [0, 900, 2200],
                    onRetry: (error, attempt) => {
                        console.warn(`Retrying job board load for ${candidate.id} after failed attempt ${attempt}:`, error);
                    },
                });
                setAllJobs(jobs);
                setAppliedJobIds(new Set(appliedJobs.map(j => j.id)));
            } catch (e) {
                console.error('Failed to load job board data:', e);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [candidate]);

    const filteredJobs = useMemo(() => {
        return allJobs.filter(job => {
            // Search
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchesTitle = job.title.toLowerCase().includes(q);
                const matchesCompany = job.company_name?.toLowerCase().includes(q);
                const jobInds = Array.isArray(job.industry) ? job.industry : [job.industry];
                const matchesIndustry = jobInds.some(ind => ind.toLowerCase().includes(q));
                const matchesSkills = job.skills?.some(s => s.skill_name.toLowerCase().includes(q));
                if (!matchesTitle && !matchesCompany && !matchesIndustry && !matchesSkills) return false;
            }

            // Filters
            if (selectedIndustry) {
                const jobInds = Array.isArray(job.industry) ? job.industry : [job.industry];
                if (!jobInds.some(ind => ind.toLowerCase() === selectedIndustry.toLowerCase())) return false;
            }
            if (selectedContract && job.constraints?.contract_type !== selectedContract) return false;
            if (selectedRemote && job.constraints?.remote !== selectedRemote) return false;
            if (selectedSeniority && job.seniority_level !== selectedSeniority) return false;

            return true;
        });
    }, [allJobs, searchQuery, selectedIndustry, selectedContract, selectedRemote, selectedSeniority]);

    const activeFilterCount = [selectedIndustry, selectedContract, selectedRemote, selectedSeniority].filter(Boolean).length;

    const clearFilters = () => {
        setSelectedIndustry(null);
        setSelectedContract(null);
        setSelectedRemote(null);
        setSelectedSeniority(null);
        setSearchQuery('');
    };

    return (
        <div className="animate-fade-in max-w-[1600px] mx-auto pt-2.5 px-3 sm:px-8 lg:px-10 pb-20">
            {/* Header */}
            <div className="border-b border-slate-200 pb-5 mb-6 dark:border-slate-800 sm:pb-6 sm:mb-8">
                <button
                    onClick={onBack}
                    className="mb-4 text-sm text-slate-500 hover:text-orange-600 dark:text-slate-400 transition-colors flex items-center gap-2 group"
                >
                    <span className="transform transition-transform"><BackIcon /></span>
                    {text('Back', 'Indietro')}
                </button>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                    <div>
                        <h1 className="flex items-center gap-3 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl lg:text-4xl">
                            <span className="rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 p-2 text-white shadow-lg shadow-orange-500/20 sm:p-2.5">
                                <BriefcaseIcon />
                            </span>
                            {text('Job Board', 'Bacheca lavori')}
                        </h1>
                        <p className="mt-2 text-base text-slate-600 dark:text-slate-400 font-medium">
                            {text('Explore all open positions and find your next opportunity.', 'Esplora tutte le posizioni aperte e trova la tua prossima opportunità.')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-400 font-bold">{filteredJobs.length}</span>
                        <span className="text-slate-400">{text('of', 'di')}</span>
                        <span className="text-slate-400 font-bold">{allJobs.length}</span>
                        <span className="text-slate-400">{text('jobs', 'lavori')}</span>
                    </div>
                </div>
            </div>

            {!candidate.ai_refined && (
                <div className="mb-6 rounded-[24px] border border-amber-200 bg-amber-50/80 px-5 py-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
                        {text('Profile not fully verified yet', 'Profilo non ancora verificato al massimo')}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                        {text(
                            'You can still browse jobs, but completing the AI profile refinement will help recruiters trust your profile faster and improve your chance of being selected.',
                            'Puoi comunque esplorare i job, ma completare il perfezionamento AI del profilo aiuterà i recruiter a fidarsi più velocemente del tuo profilo e migliorerà la tua possibilità di selezione.'
                        )}
                    </p>
                </div>
            )}

            {/* Search & Filter Bar */}
            <div className="mb-6 space-y-4">
                <div className="flex gap-2 sm:gap-3">
                    <div className="relative flex-grow">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                            <SearchIcon />
                        </div>
                        <input
                            type="text"
                            placeholder={text('Search by title, company, industry, or skills...', 'Cerca per titolo, azienda, settore o skill...')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-400 transition-all shadow-sm sm:pl-12 sm:py-3.5"
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl border font-bold text-sm transition-all shadow-sm sm:px-5 sm:py-3.5 ${showFilters || activeFilterCount > 0
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-orange-300'
                            }`}
                    >
                        <FilterIcon />
                        {text('Filters', 'Filtri')}
                        {activeFilterCount > 0 && (
                            <span className="bg-white/20 text-white text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center">{activeFilterCount}</span>
                        )}
                    </button>
                </div>

                {/* Expandable Filter Panel */}
                {showFilters && (
                    <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-5 animate-fade-in shadow-sm sm:p-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">{text('Filters', 'Filtri')}</h3>
                            {activeFilterCount > 0 && (
                                <button onClick={clearFilters} className="text-[11px] font-bold text-orange-500 hover:text-orange-600 transition-colors">
                                    {text('Clear All', 'Cancella tutto')}
                                </button>
                            )}
                        </div>

                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{text('Industry', 'Settore')}</p>
                            <div className="flex flex-wrap gap-2">
                                {INDUSTRIES.map(ind => (
                                    <FilterChip
                                        key={ind}
                                        label={ind}
                                        active={selectedIndustry === ind}
                                        onClick={() => setSelectedIndustry(selectedIndustry === ind ? null : ind)}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{text('Contract Type', 'Contratto')}</p>
                            <div className="flex flex-wrap gap-2">
                                {CONTRACT_TYPES.map(ct => (
                                    <FilterChip
                                        key={ct}
                                        label={formatLabel(ct)}
                                        active={selectedContract === ct}
                                        onClick={() => setSelectedContract(selectedContract === ct ? null : ct)}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{text('Work Policy', 'Modalità di lavoro')}</p>
                            <div className="flex flex-wrap gap-2">
                                {REMOTE_OPTIONS.map(ro => (
                                    <FilterChip
                                        key={ro}
                                        label={formatLabel(ro)}
                                        active={selectedRemote === ro}
                                        onClick={() => setSelectedRemote(selectedRemote === ro ? null : ro)}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{text('Seniority', 'Seniorità')}</p>
                            <div className="flex flex-wrap gap-2">
                                {SENIORITY_LEVELS.map(sl => (
                                    <FilterChip
                                        key={sl}
                                        label={formatLabel(sl)}
                                        active={selectedSeniority === sl}
                                        onClick={() => setSelectedSeniority(selectedSeniority === sl ? null : sl)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Job Grid */}
            {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-4">
                    <Spinner />
                    <p className="text-xs font-black uppercase text-slate-400 animate-pulse tracking-widest">{text('Loading Open Positions...', 'Caricamento posizioni aperte...')}</p>
                </div>
            ) : filteredJobs.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredJobs.map(job => (
                        <JobBoardCard
                            key={job.id}
                            job={job}
                            isApplied={appliedJobIds.has(job.id)}
                            onView={(selectedJob) => {
                                if (!appliedJobIds.has(selectedJob.id)) {
                                    onViewJob(selectedJob);
                                    return;
                                }

                                onViewJob({
                                    ...selectedJob,
                                    applicant_emails: Array.from(new Set([...(selectedJob.applicant_emails || []), candidate.contacts.email])),
                                });
                            }}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 px-6 bg-slate-50 dark:bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                    <div className="h-16 w-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100 dark:border-slate-700">
                        <svg className="h-8 w-8 text-slate-300 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-black text-slate-700 dark:text-slate-200 mb-2">{text('No jobs found', 'Nessun lavoro trovato')}</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 max-w-xs mx-auto">
                        {searchQuery || activeFilterCount > 0
                            ? text('Try adjusting your search or filters to find more opportunities.', 'Prova a modificare la ricerca o i filtri per trovare più opportunità.')
                            : text('No open positions are available right now. Check back soon!', 'Non ci sono posizioni aperte in questo momento. Torna presto a controllare.')}
                    </p>
                    {(searchQuery || activeFilterCount > 0) && (
                        <button
                            onClick={clearFilters}
                            className="text-brand-500 font-bold text-sm hover:underline hover:text-brand-600"
                        >
                            {text('Clear All Filters', 'Cancella tutti i filtri')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default JobBoardPage;
