import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';
import { submitBugReport, BugSeverity } from '../services/bugReportService';

const BugIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="m8 2 1.88 1.88" />
        <path d="M14.12 3.88 16 2" />
        <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
        <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
        <path d="M12 20v-9" />
        <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
        <path d="M6 13H2" />
        <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
        <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
        <path d="M22 13h-4" />
        <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
);

const CloseIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
    </svg>
);

const SEVERITIES: Array<{ value: BugSeverity; labelEn: string; labelIt: string; tone: string }> = [
    { value: 'low', labelEn: 'Low', labelIt: 'Bassa', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200' },
    { value: 'medium', labelEn: 'Medium', labelIt: 'Media', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200' },
    { value: 'high', labelEn: 'High', labelIt: 'Alta', tone: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200' },
    { value: 'blocker', labelEn: 'Blocker', labelIt: 'Bloccante', tone: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200' },
];

const BugReportButton: React.FC = () => {
    const { text } = useLanguage();
    const { user, effectiveProfileId, effectiveEmail, effectiveUserRole } = useAuth();
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState<BugSeverity>('medium');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    if (!user) return null;

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setSeverity('medium');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        if (!title.trim() || !description.trim()) {
            toast.error(text('Please fill in title and description.', 'Compila titolo e descrizione.'));
            return;
        }

        setSubmitting(true);
        try {
            await submitBugReport({
                title,
                description,
                severity,
                userId: effectiveProfileId,
                userEmail: effectiveEmail,
                userRole: effectiveUserRole,
            });
            toast.success(text('Bug report submitted. Thank you!', 'Segnalazione inviata. Grazie!'));
            resetForm();
            setOpen(false);
        } catch (err) {
            console.error('Failed to submit bug report:', err);
            toast.error(text('Failed to submit report. Please retry.', 'Invio fallito. Riprova.'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={text('Report a bug', 'Segnala un bug')}
                title={text('Report a bug', 'Segnala un bug')}
                className="fixed bottom-5 left-5 z-[90] h-11 w-11 rounded-full bg-orange-500 text-white shadow-lg shadow-orange-500/30 ring-2 ring-white dark:ring-slate-900 hover:bg-orange-600 transition-all flex items-center justify-center"
            >
                <BugIcon />
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
                    onClick={() => !submitting && setOpen(false)}
                >
                    <div
                        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-300 flex items-center justify-center">
                                    <BugIcon />
                                </div>
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                        {text('Report a bug', 'Segnala un bug')}
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {text(
                                            'We will attach technical context automatically.',
                                            'Alleghiamo il contesto tecnico in automatico.'
                                        )}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                disabled={submitting}
                                className="p-2 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                aria-label={text('Close', 'Chiudi')}
                            >
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {text('Title', 'Titolo')}
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    maxLength={200}
                                    required
                                    placeholder={text('Short summary of the issue', 'Riepilogo breve del problema')}
                                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {text('What happened?', 'Cosa è successo?')}
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    maxLength={8000}
                                    required
                                    rows={5}
                                    placeholder={text(
                                        'Describe what you were doing, what you expected, and what happened instead.',
                                        'Descrivi cosa stavi facendo, cosa ti aspettavi e cosa è successo invece.'
                                    )}
                                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    {text('Severity', 'Gravità')}
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {SEVERITIES.map((s) => {
                                        const active = severity === s.value;
                                        return (
                                            <button
                                                type="button"
                                                key={s.value}
                                                onClick={() => setSeverity(s.value)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                                                    active
                                                        ? `${s.tone} border-transparent ring-2 ring-orange-400`
                                                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-orange-400'
                                                }`}
                                            >
                                                {text(s.labelEn, s.labelIt)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                {text(
                                    'We automatically include: current page URL, your account, browser info, viewport, and the latest console errors, to help us debug.',
                                    'Alleghiamo in automatico: URL della pagina, il tuo account, informazioni sul browser, dimensioni della finestra e gli ultimi errori di console, per aiutarci a debuggare.'
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    disabled={submitting}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                                >
                                    {text('Cancel', 'Annulla')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {submitting
                                        ? text('Sending…', 'Invio in corso…')
                                        : text('Send report', 'Invia segnalazione')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default BugReportButton;
