import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { JobProfile } from '../types';
import { Applicant, JobMetrics, computeJobMetrics, emptyJobMetrics, formatPercent } from '../utils/jobMetrics';
import { getApplicantsForJob } from '../services/dbService';
import { withRetry } from '../utils/retry';
import { useLanguage } from './LanguageProvider';
import { Spinner } from './common';

interface JobAnalyticsPageProps {
    job: JobProfile;
}

const SENIORITY_LABELS_IT: Record<string, string> = {
    student: 'studente',
    intern: 'stagista',
    junior: 'junior',
    mid: 'intermedio',
    senior: 'senior',
    lead: 'lead',
    unknown: 'sconosciuto',
};

const SENIORITY_PALETTE = ['#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#94a3b8'];

const KpiCard: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: 'default' | 'emerald' | 'rose' | 'amber' }> = ({ label, value, sub, accent = 'default' }) => {
    const accentClass = {
        default: 'text-slate-900 dark:text-slate-100',
        emerald: 'text-emerald-600 dark:text-emerald-400',
        rose: 'text-rose-600 dark:text-rose-400',
        amber: 'text-amber-600 dark:text-amber-400',
    }[accent];
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
            <p className={`mt-2 text-3xl font-black leading-tight ${accentClass}`}>{value}</p>
            {sub && <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
    );
};

const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; empty?: boolean; emptyText: string }> = ({ title, subtitle, children, empty, emptyText }) => (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        <div className="mt-4">
            {empty ? (
                <p className="py-12 text-center text-sm font-medium text-slate-400">{emptyText}</p>
            ) : children}
        </div>
    </div>
);

const JobAnalyticsPage: React.FC<JobAnalyticsPageProps> = ({ job }) => {
    const { text, language } = useLanguage();
    const navigate = useNavigate();
    const [applicants, setApplicants] = useState<Applicant[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);
        setLoadError('');

        withRetry(() => getApplicantsForJob(job.id, job.applicant_emails || []), {
            attempts: 3,
            delaysMs: [0, 900, 2200],
            onRetry: (error, attempt) => {
                console.warn(`Retrying job analytics applicants for ${job.id} after failed attempt ${attempt}:`, error);
            },
        }).then((result) => {
            if (isMounted) {
                setApplicants(result);
                setIsLoading(false);
            }
        }).catch((error) => {
            console.error('Failed to load job analytics:', error);
            if (isMounted) {
                setLoadError(error?.message || text('Unable to load analytics.', 'Impossibile caricare le analitiche.'));
                setIsLoading(false);
            }
        });

        return () => { isMounted = false; };
    }, [job.id, job.applicant_emails, text]);

    const metrics: JobMetrics = useMemo(() => {
        if (!applicants.length) return emptyJobMetrics(applicants.length);
        return computeJobMetrics(job, applicants);
    }, [job, applicants]);

    const seniorityData = useMemo(() =>
        Object.entries(metrics.seniorityDistribution)
            .map(([key, value]) => ({
                name: language === 'it' ? (SENIORITY_LABELS_IT[key] || key) : key,
                value,
            }))
            .sort((a, b) => b.value - a.value),
        [metrics.seniorityDistribution, language]
    );

    const countryData = useMemo(() =>
        Object.entries(metrics.countryDistribution)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8),
        [metrics.countryDistribution]
    );

    const jobFunctionData = useMemo(() =>
        Object.entries(metrics.jobFunctionDistribution)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8),
        [metrics.jobFunctionDistribution]
    );

    const funnel = [
        { name: text('Applicants', 'Candidati'), value: metrics.applicantCount },
        { name: text('Screened', 'Esaminati'), value: metrics.interestedCount + metrics.notInterestedCount },
        { name: 'Shortlist', value: metrics.interestedCount },
    ];

    return (
        <div className="mx-auto max-w-6xl animate-fade-in px-3 py-4 sm:px-8 lg:px-10">
            <button
                type="button"
                onClick={() => navigate('/recruiter/dashboard')}
                className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                {text('Back to dashboard', 'Torna alla dashboard')}
            </button>

            <div className="mt-2 flex flex-col gap-1">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-500">{text('Job analytics', 'Analitiche job')}</p>
                <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">{job.title}</h1>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {job.company_name || text('Your posting', 'Il tuo posting')}
                </p>
            </div>

            {isLoading ? (
                <div className="mt-8 flex justify-center rounded-3xl border border-slate-100 bg-slate-50 py-20 dark:border-slate-800 dark:bg-slate-900/20">
                    <Spinner />
                </div>
            ) : loadError ? (
                <div className="mt-8 rounded-3xl border border-rose-200 bg-rose-50 px-6 py-8 text-center text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
                    {loadError}
                </div>
            ) : (
                <>
                    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <KpiCard
                            label={text('Applicants', 'Candidati')}
                            value={metrics.applicantCount}
                            sub={metrics.pendingReviewCount > 0 ? text(`${metrics.pendingReviewCount} to review`, `${metrics.pendingReviewCount} da rivedere`) : text('All reviewed', 'Tutti rivisti')}
                        />
                        <KpiCard
                            label={text('Screened', 'Esaminati')}
                            value={formatPercent(metrics.reviewedRate)}
                            sub={`${metrics.interestedCount + metrics.notInterestedCount}/${metrics.applicantCount}`}
                        />
                        <KpiCard
                            label="Shortlist"
                            value={metrics.interestedCount}
                            sub={metrics.interestedCount + metrics.notInterestedCount > 0
                                ? `${formatPercent(metrics.interestedShare)} ${text('of screened', 'degli esaminati')}`
                                : text('No reviews yet', 'Nessuna review')}
                            accent="emerald"
                        />
                        <KpiCard
                            label={text('Quiz completion', 'Quiz completati')}
                            value={metrics.quizEnabled ? formatPercent(metrics.testCompletionRate) : '—'}
                            sub={metrics.quizEnabled
                                ? `${metrics.testCompletedCount}/${metrics.applicantCount}${metrics.avgTestScore != null ? ` · avg ${metrics.avgTestScore.toFixed(0)}` : ''}`
                                : text('Quiz disabled', 'Quiz disattivato')}
                            accent={metrics.quizEnabled ? 'amber' : 'default'}
                        />
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <ChartCard
                            title={text('Conversion funnel', 'Funnel conversione')}
                            subtitle={text('From application to interest', 'Dalla candidatura all\'interesse')}
                            empty={metrics.applicantCount === 0}
                            emptyText={text('No applicants yet.', 'Nessun candidato ancora.')}
                        >
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={funnel} layout="vertical" margin={{ top: 5, right: 20, left: 30, bottom: 5 }}>
                                    <XAxis type="number" stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={12} width={90} />
                                    <Tooltip cursor={{ fill: 'rgba(148,163,184,0.1)' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                                        {funnel.map((_, i) => (
                                            <Cell key={i} fill={['#fb923c', '#f97316', '#10b981'][i]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard
                            title={text('Seniority distribution', 'Distribuzione seniority')}
                            subtitle={text('Among current applicants', 'Tra i candidati attuali')}
                            empty={seniorityData.length === 0}
                            emptyText={text('No data.', 'Nessun dato.')}
                        >
                            <ResponsiveContainer width="100%" height={240}>
                                <PieChart>
                                    <Pie data={seniorityData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                                        {seniorityData.map((_, i) => (
                                            <Cell key={i} fill={SENIORITY_PALETTE[i % SENIORITY_PALETTE.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                {seniorityData.map((d, i) => (
                                    <span key={d.name} className="inline-flex items-center gap-1">
                                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SENIORITY_PALETTE[i % SENIORITY_PALETTE.length] }} />
                                        {d.name} · {d.value}
                                    </span>
                                ))}
                            </div>
                        </ChartCard>

                        <ChartCard
                            title={text('Top countries', 'Paesi principali')}
                            subtitle={text('Top 8 by applicant count', 'Top 8 per numero candidati')}
                            empty={countryData.length === 0}
                            emptyText={text('No data.', 'Nessun dato.')}
                        >
                            <ResponsiveContainer width="100%" height={Math.max(200, countryData.length * 32)}>
                                <BarChart data={countryData} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                                    <XAxis type="number" stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={100} />
                                    <Tooltip cursor={{ fill: 'rgba(148,163,184,0.1)' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                                    <Bar dataKey="value" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard
                            title={text('Top job functions', 'Funzioni principali')}
                            subtitle={text('Top 8 by applicant count', 'Top 8 per numero candidati')}
                            empty={jobFunctionData.length === 0}
                            emptyText={text('No data.', 'Nessun dato.')}
                        >
                            <ResponsiveContainer width="100%" height={Math.max(200, jobFunctionData.length * 32)}>
                                <BarChart data={jobFunctionData} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                                    <XAxis type="number" stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={120} />
                                    <Tooltip cursor={{ fill: 'rgba(148,163,184,0.1)' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                                    <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>

                    {metrics.lastReviewAt && (
                        <p className="mt-6 text-center text-xs text-slate-400">
                            {text('Last review activity', 'Ultima review')}: {new Date(metrics.lastReviewAt).toLocaleString(language === 'it' ? 'it-IT' : 'en-US')}
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

export default JobAnalyticsPage;
