import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useLanguage } from './LanguageProvider';
import {
    BugReportRecord,
    BugStatus,
    deleteBugReport,
    getAllBugReports,
    updateBugReportStatus,
} from '../services/bugReportService';

type SeverityFilter = 'all' | 'low' | 'medium' | 'high' | 'blocker';
type StatusFilter = 'all' | BugStatus;

const SEVERITY_TONE: Record<string, string> = {
    low: 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200',
    medium: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200',
    blocker: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200',
};

const STATUS_TONE: Record<BugStatus, string> = {
    open: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
    in_progress: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200',
    resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
    wont_fix: 'bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200',
    duplicate: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
};

const triggerDownload = (filename: string, mime: string, content: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const csvEscape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

const toCsv = (rows: BugReportRecord[]): string => {
    const headers = [
        'id', 'created_at', 'status', 'severity', 'title', 'description',
        'user_email', 'user_role', 'user_id', 'url', 'route', 'user_agent',
        'viewport', 'platform', 'language', 'console_errors', 'metadata',
    ];
    const lines = [headers.join(',')];
    for (const r of rows) {
        lines.push([
            r.id, r.created_at, r.status, r.severity, r.title, r.description,
            r.user_email, r.user_role, r.user_id, r.url, r.route, r.user_agent,
            r.viewport, r.platform, r.language,
            JSON.stringify(r.console_errors),
            JSON.stringify(r.metadata),
        ].map(csvEscape).join(','));
    }
    return lines.join('\n');
};

const formatDate = (iso: string, locale: 'it' | 'en'): string => {
    try {
        return new Date(iso).toLocaleString(locale === 'it' ? 'it-IT' : 'en-US', {
            year: 'numeric', month: 'short', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return iso;
    }
};

const AdminBugReports: React.FC = () => {
    const { text, language } = useLanguage();
    const [reports, setReports] = useState<BugReportRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getAllBugReports();
            setReports(data);
        } catch (err) {
            console.error('Failed to load bug reports:', err);
            toast.error(text('Failed to load bug reports.', 'Caricamento segnalazioni fallito.'));
        } finally {
            setLoading(false);
        }
    }, [text]);

    useEffect(() => { void load(); }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return reports.filter((r) => {
            if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (!q) return true;
            return [r.title, r.description, r.user_email, r.url, r.route, r.user_id]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q));
        });
    }, [reports, severityFilter, statusFilter, search]);

    const counts = useMemo(() => {
        const byStatus: Record<string, number> = { open: 0, in_progress: 0, resolved: 0, wont_fix: 0, duplicate: 0 };
        const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, blocker: 0 };
        for (const r of reports) {
            byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
            bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
        }
        return { byStatus, bySeverity };
    }, [reports]);

    const handleExport = (format: 'json' | 'csv') => {
        if (filtered.length === 0) {
            toast.info(text('No reports to export.', 'Nessuna segnalazione da esportare.'));
            return;
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        if (format === 'json') {
            triggerDownload(
                `bug_reports_${timestamp}.json`,
                'application/json',
                JSON.stringify(filtered, null, 2)
            );
        } else {
            triggerDownload(
                `bug_reports_${timestamp}.csv`,
                'text/csv;charset=utf-8;',
                toCsv(filtered)
            );
        }
        toast.success(text(`Exported ${filtered.length} reports.`, `Esportate ${filtered.length} segnalazioni.`));
    };

    const handleStatusChange = async (id: string, status: BugStatus) => {
        const previous = reports;
        setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        try {
            await updateBugReportStatus(id, status);
        } catch (err) {
            console.error('Failed to update bug report status:', err);
            setReports(previous);
            toast.error(text('Failed to update status.', 'Aggiornamento stato fallito.'));
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm(text('Delete this bug report? This cannot be undone.', 'Eliminare questa segnalazione? Operazione non reversibile.'))) {
            return;
        }
        const previous = reports;
        setReports((prev) => prev.filter((r) => r.id !== id));
        try {
            await deleteBugReport(id);
            toast.success(text('Report deleted.', 'Segnalazione eliminata.'));
        } catch (err) {
            console.error('Failed to delete bug report:', err);
            setReports(previous);
            toast.error(text('Delete failed.', 'Eliminazione fallita.'));
        }
    };

    return (
        <div className="space-y-5 animate-fade-in">
            <section className="rounded-[30px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                            {text('Bug reports', 'Segnalazioni')}
                        </p>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2">
                            {text('User-submitted bug reports', 'Segnalazioni degli utenti')}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {text(
                                `${reports.length} total • ${counts.byStatus.open || 0} open • ${counts.bySeverity.blocker || 0} blockers`,
                                `${reports.length} totali • ${counts.byStatus.open || 0} aperte • ${counts.bySeverity.blocker || 0} bloccanti`
                            )}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void load()}
                            className="px-3 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-orange-400 transition-colors"
                        >
                            {text('Refresh', 'Aggiorna')}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleExport('json')}
                            className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-opacity"
                        >
                            {text('Download JSON', 'Scarica JSON')}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleExport('csv')}
                            className="px-3 py-2 rounded-lg text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-colors"
                        >
                            {text('Download CSV', 'Scarica CSV')}
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-5">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={text('Search title, user, URL…', 'Cerca titolo, utente, URL…')}
                        className="flex-1 min-w-[200px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <select
                        value={severityFilter}
                        onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                        <option value="all">{text('All severities', 'Tutte le gravità')}</option>
                        <option value="blocker">{text('Blocker', 'Bloccante')}</option>
                        <option value="high">{text('High', 'Alta')}</option>
                        <option value="medium">{text('Medium', 'Media')}</option>
                        <option value="low">{text('Low', 'Bassa')}</option>
                    </select>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                        <option value="all">{text('All statuses', 'Tutti gli stati')}</option>
                        <option value="open">{text('Open', 'Aperte')}</option>
                        <option value="in_progress">{text('In progress', 'In lavorazione')}</option>
                        <option value="resolved">{text('Resolved', 'Risolte')}</option>
                        <option value="wont_fix">{text("Won't fix", 'Non risolveremo')}</option>
                        <option value="duplicate">{text('Duplicate', 'Duplicata')}</option>
                    </select>
                </div>

                {loading ? (
                    <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                        {text('Loading bug reports…', 'Caricamento segnalazioni…')}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center">
                        <p className="font-semibold text-slate-700 dark:text-slate-200">
                            {text('No reports match the filters.', 'Nessuna segnalazione corrisponde ai filtri.')}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {text('When users submit bug reports, they will appear here.', 'Quando gli utenti inviano segnalazioni, compariranno qui.')}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((report) => {
                            const expanded = expandedId === report.id;
                            return (
                                <div
                                    key={report.id}
                                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 overflow-hidden"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId(expanded ? null : report.id)}
                                        className="w-full text-left px-4 py-3 flex items-start justify-between gap-4 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 transition-colors"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center flex-wrap gap-2 mb-1">
                                                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${SEVERITY_TONE[report.severity]}`}>
                                                    {report.severity}
                                                </span>
                                                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_TONE[report.status]}`}>
                                                    {report.status.replace('_', ' ')}
                                                </span>
                                                <span className="text-xs text-slate-400">
                                                    {formatDate(report.created_at, language)}
                                                </span>
                                            </div>
                                            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                                {report.title}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                {report.user_email || text('Anonymous', 'Anonimo')}
                                                {report.user_role ? ` · ${report.user_role}` : ''}
                                                {report.route ? ` · ${report.route}` : ''}
                                            </p>
                                        </div>
                                        <span className="text-xs text-slate-400 flex-shrink-0 mt-1">
                                            {expanded ? '▲' : '▼'}
                                        </span>
                                    </button>

                                    {expanded && (
                                        <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-4 space-y-4 bg-white dark:bg-slate-950">
                                            <Field label={text('Description', 'Descrizione')}>
                                                <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words">
                                                    {report.description}
                                                </p>
                                            </Field>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                                <InfoRow label={text('User', 'Utente')} value={`${report.user_email || '—'} (${report.user_id || '—'})`} />
                                                <InfoRow label={text('Role', 'Ruolo')} value={report.user_role || '—'} />
                                                <InfoRow label="URL" value={report.url || '—'} mono />
                                                <InfoRow label={text('Route', 'Route')} value={report.route || '—'} mono />
                                                <InfoRow label={text('User agent', 'User agent')} value={report.user_agent || '—'} mono />
                                                <InfoRow label={text('Viewport', 'Viewport')} value={report.viewport || '—'} />
                                                <InfoRow label={text('Platform', 'Piattaforma')} value={report.platform || '—'} />
                                                <InfoRow label={text('Language', 'Lingua')} value={report.language || '—'} />
                                            </div>

                                            {report.console_errors && report.console_errors.length > 0 && (
                                                <Field label={text(`Recent console errors (${report.console_errors.length})`, `Errori console recenti (${report.console_errors.length})`)}>
                                                    <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                                                        {report.console_errors.map((e) => `[${e.timestamp}] ${e.message}`).join('\n\n')}
                                                    </pre>
                                                </Field>
                                            )}

                                            {report.metadata && Object.keys(report.metadata).length > 0 && (
                                                <Field label={text('Metadata', 'Metadata')}>
                                                    <pre className="text-[11px] bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-lg p-3 overflow-x-auto">
                                                        {JSON.stringify(report.metadata, null, 2)}
                                                    </pre>
                                                </Field>
                                            )}

                                            <div className="flex flex-wrap items-center gap-2 pt-2">
                                                <select
                                                    value={report.status}
                                                    onChange={(e) => void handleStatusChange(report.id, e.target.value as BugStatus)}
                                                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                >
                                                    <option value="open">{text('Open', 'Aperta')}</option>
                                                    <option value="in_progress">{text('In progress', 'In lavorazione')}</option>
                                                    <option value="resolved">{text('Resolved', 'Risolta')}</option>
                                                    <option value="wont_fix">{text("Won't fix", 'Non risolveremo')}</option>
                                                    <option value="duplicate">{text('Duplicate', 'Duplicata')}</option>
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleDelete(report.id)}
                                                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/30 transition-colors"
                                                >
                                                    {text('Delete', 'Elimina')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-1">{label}</p>
        {children}
    </div>
);

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
        <p className={`text-xs text-slate-800 dark:text-slate-100 break-all ${mono ? 'font-mono' : ''}`}>
            {value}
        </p>
    </div>
);

export default AdminBugReports;
