import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CandidateProfile, JobProfile } from '../types';
import { saveCandidateNote } from '../services/dbService';
import { useLanguage } from './LanguageProvider';

interface CandidateNotesPanelProps {
    job: JobProfile;
    candidate: CandidateProfile;
    onJobUpdated: (job: JobProfile) => void;
}

const EditIcon = () => (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
);

/**
 * Private notes & tags the recruiter keeps on a candidate FOR a specific job.
 *
 * Progressive disclosure:
 *   - empty   → quiet 'Add private note' link
 *   - filled  → compact one-line summary with tag chips + note preview
 *   - clicked → full editor with tag input + textarea, auto-saves
 */
const CandidateNotesPanel: React.FC<CandidateNotesPanelProps> = ({ job, candidate, onJobUpdated }) => {
    const { text } = useLanguage();
    const existing = job.candidate_notes?.[candidate.id];
    const hasContent = !!(existing && (existing.tags?.length || existing.note?.trim()));

    const [isExpanded, setIsExpanded] = useState(false);
    const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
    const [note, setNote] = useState<string>(existing?.note ?? '');
    const [tagInput, setTagInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const lastSavedRef = useRef<string>(JSON.stringify({ tags: existing?.tags ?? [], note: existing?.note ?? '' }));

    useEffect(() => {
        const fresh = job.candidate_notes?.[candidate.id];
        setTags(fresh?.tags ?? []);
        setNote(fresh?.note ?? '');
        lastSavedRef.current = JSON.stringify({ tags: fresh?.tags ?? [], note: fresh?.note ?? '' });
    }, [job.id, candidate.id, job.candidate_notes]);

    const persist = async (nextTags: string[], nextNote: string) => {
        const serialised = JSON.stringify({ tags: nextTags, note: nextNote });
        if (serialised === lastSavedRef.current) return;
        setIsSaving(true);
        try {
            const updatedJob = await saveCandidateNote(job, candidate.id, { tags: nextTags, note: nextNote });
            lastSavedRef.current = serialised;
            onJobUpdated(updatedJob);
        } catch (error: any) {
            console.error('Failed to save candidate note:', error);
            toast.error(error?.message || text('Unable to save the note.', 'Impossibile salvare la nota.'));
        } finally {
            setIsSaving(false);
        }
    };

    const commitTag = () => {
        const v = tagInput.trim();
        if (!v) return;
        if (tags.some(t => t.toLowerCase() === v.toLowerCase())) { setTagInput(''); return; }
        const next = [...tags, v];
        setTags(next);
        setTagInput('');
        void persist(next, note);
    };

    const removeTag = (tag: string) => {
        const next = tags.filter(t => t !== tag);
        setTags(next);
        void persist(next, note);
    };

    // ---- Collapsed states ----
    if (!isExpanded) {
        if (!hasContent) {
            return (
                <button
                    type="button"
                    onClick={() => setIsExpanded(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition-colors hover:text-amber-600 dark:hover:text-amber-400"
                >
                    <EditIcon />
                    {text('Add private note', 'Aggiungi nota privata')}
                </button>
            );
        }

        const visibleTags = tags.slice(0, 2);
        const hiddenTagCount = Math.max(0, tags.length - visibleTags.length);
        const notePreview = note.trim().split(/\s+/).slice(0, 12).join(' ');
        const noteTruncated = note.trim().length > notePreview.length;

        return (
            <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="group flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-left transition-colors hover:border-amber-300 hover:bg-amber-50/50 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-amber-700/50 dark:hover:bg-amber-950/20"
            >
                <span className="text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400"><EditIcon /></span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {visibleTags.map(t => (
                        <span key={t} className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            {t}
                        </span>
                    ))}
                    {hiddenTagCount > 0 && (
                        <span className="text-[11px] font-bold text-slate-400">+{hiddenTagCount}</span>
                    )}
                    {notePreview && (
                        <span className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                            {tags.length > 0 ? '· ' : ''}{notePreview}{noteTruncated ? '…' : ''}
                        </span>
                    )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
                    {text('Edit', 'Modifica')}
                </span>
            </button>
        );
    }

    // ---- Expanded editor ----
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300">
                    {text('Private notes', 'Note private')}
                </h3>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-400">
                        {isSaving ? text('Saving...', 'Salvataggio...') : text('Only you see this', 'Solo tu lo vedi')}
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsExpanded(false)}
                        className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        aria-label={text('Collapse', 'Comprimi')}
                    >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="mt-3">
                <div className="flex flex-wrap gap-1.5">
                    {tags.map(t => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            {t}
                            <button type="button" onClick={() => removeTag(t)} className="hover:text-amber-600" aria-label={text('Remove tag', 'Rimuovi tag')}>×</button>
                        </span>
                    ))}
                </div>
                <div className="mt-2 flex gap-1.5">
                    <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTag(); } }}
                        placeholder={text('Add tag (call back, ideal-fit...)', 'Aggiungi tag (richiamare, ottimo...)')}
                        className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button type="button" onClick={commitTag} className="rounded-lg bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">+</button>
                </div>
            </div>

            <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => persist(tags, note)}
                placeholder={text('Personal observations on this candidate for this role...', 'Osservazioni personali su questo candidato per questo ruolo...')}
                rows={3}
                className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
        </section>
    );
};

export default CandidateNotesPanel;

/**
 * Tiny inline badge used on cards to signal that the recruiter has put notes on the candidate.
 * Returns null if nothing is set, so the card stays clean for "blank" candidates.
 */
export const CandidateNotesBadge: React.FC<{ note?: { tags: string[]; note: string } }> = ({ note }) => {
    if (!note) return null;
    const hasNote = !!note.note?.trim();
    const firstTag = note.tags?.[0];
    const extra = Math.max(0, (note.tags?.length || 0) - 1);
    if (!hasNote && !firstTag) return null;
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            {firstTag ? <>{firstTag}{extra > 0 ? ` +${extra}` : null}</> : 'note'}
        </span>
    );
};
