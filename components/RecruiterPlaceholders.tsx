
import React from 'react';
import { useLanguage } from './LanguageProvider';

const PlaceholderPage: React.FC<{ title: string; message: string; icon: string; onBack: () => void; }> = ({ title, message, icon, onBack }) => {
    const { text } = useLanguage();

    return (
        <div className="max-w-lg mx-auto pt-2.5 px-4 animate-fade-in">
            <button onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                {text('Back', 'Indietro')}
            </button>
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-lg p-10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-400 to-amber-500"></div>
                <div className="h-20 w-20 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-6 text-4xl">
                    {icon}
                </div>
                <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-3">{title}</h1>
                <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">{message}</p>
                <div className="inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-800 text-sm font-bold mb-8">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    {text('Coming Soon', 'In arrivo')}
                </div>
            </div>
        </div>
    );
};

export const RecruiterProfilePage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { text } = useLanguage();

    return (
        <PlaceholderPage
            icon="✏️"
            title={text('Edit Profile', 'Modifica profilo')}
            message={text("This is where you'll edit your recruiter profile and company information.", 'Qui potrai modificare il tuo profilo recruiter e le informazioni aziendali.')}
            onBack={onBack}
        />
    );
};

export const RecruiterNotificationsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { text } = useLanguage();

    return (
        <PlaceholderPage
            icon="🔔"
            title={text('Notification Center', 'Centro notifiche')}
            message={text('Notifications about new applicants, messages, and job activity will appear here.', 'Qui appariranno notifiche su nuovi candidati, messaggi e attività dei job.')}
            onBack={onBack}
        />
    );
};
