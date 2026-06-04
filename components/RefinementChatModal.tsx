import React, { useState } from 'react';
import { CandidateRefinementChat } from '../types';
import { downloadCandidateRefinementChat, getPublicRefinementTranscript } from '../services/candidateAssetsService';
import { useLanguage } from './LanguageProvider';

interface RefinementChatModalProps {
    chat: CandidateRefinementChat;
    candidateLabel: string;
    onClose: () => void;
}

const RefinementChatModal: React.FC<RefinementChatModalProps> = ({
    chat,
    candidateLabel,
    onClose,
}) => {
    const { text } = useLanguage();
    const [downloadingFormat, setDownloadingFormat] = useState<'json' | 'csv' | null>(null);
    const publicTranscript = getPublicRefinementTranscript(chat.transcript);

    const handleDownload = async (format: 'json' | 'csv') => {
        setDownloadingFormat(format);
        try {
            await downloadCandidateRefinementChat(chat, format, candidateLabel);
        } finally {
            setDownloadingFormat(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
            <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800 md:flex-row md:items-start md:justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                            {text('AI refinement transcript', 'Transcript affinamento AI')}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                            {candidateLabel}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {publicTranscript.length} {text('messages saved', 'messaggi salvati')} • {text('Completed on', 'Completata il')} {new Date(chat.completed_at || chat.updated_at).toLocaleString()}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void handleDownload('json')}
                            disabled={downloadingFormat !== null}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            {downloadingFormat === 'json' ? text('Preparing...', 'Preparazione...') : text('Download JSON', 'Scarica JSON')}
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleDownload('csv')}
                            disabled={downloadingFormat !== null}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            {downloadingFormat === 'csv' ? text('Preparing...', 'Preparazione...') : text('Download CSV', 'Scarica CSV')}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            {text('Close', 'Chiudi')}
                        </button>
                    </div>
                </div>

                <div className="max-h-[calc(88vh-120px)] overflow-y-auto px-6 py-6">
                    {publicTranscript.length > 0 ? (
                        <div className="space-y-4">
                            {publicTranscript.map((message, index) => {
                                const isUser = message.role === 'user';

                                return (
                                    <div
                                        key={`${message.role}_${index}`}
                                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-3xl rounded-[24px] px-5 py-4 shadow-sm ${
                                                isUser
                                                    ? 'bg-orange-500 text-white'
                                                    : 'border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
                                            }`}
                                        >
                                            <p className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${isUser ? 'text-orange-100' : 'text-slate-400'}`}>
                                                {isUser ? text('Candidate', 'Candidato') : text('AI assistant', 'Assistente AI')}
                                            </p>
                                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                                                {message.text}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900/40">
                            <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                {text('No transcript available yet', 'Nessuna transcript disponibile al momento')}
                            </h3>
                            <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                                {text(
                                    'This candidate has not completed an AI refinement chat that could be reviewed yet.',
                                    'Questo candidato non ha ancora completato una chat di affinamento AI disponibile per la review.'
                                )}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RefinementChatModal;
