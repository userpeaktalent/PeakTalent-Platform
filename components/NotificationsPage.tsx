
import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { getNotifications, markNotificationAsRead } from '../services/dbService';
import { Notification } from '../types';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from './LanguageProvider';
import { withRetry } from '../utils/retry';

interface NotificationsPageProps {
    onBack: () => void;
}

const BellIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-5-5.917V5a1 1 0 10-2 0v.083A6 6 0 006 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
);

const InfoIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const SuccessIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const WarningIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;

const NotificationsPage: React.FC<NotificationsPageProps> = ({ onBack }) => {
    const { text, language } = useLanguage();
    const { effectiveProfileId, effectiveUserRole } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchNotifications = async () => {
            if (effectiveProfileId) {
                setIsLoading(true);
                try {
                    const data = await withRetry(() => getNotifications(effectiveProfileId), {
                        attempts: 3,
                        delaysMs: [0, 900, 2200],
                        onRetry: (error, attempt) => {
                            console.warn(`Retrying notifications load for ${effectiveProfileId} after failed attempt ${attempt}:`, error);
                        },
                    });
                    setNotifications(data);
                } catch (error) {
                    console.error("Failed to load notifications:", error);
                } finally {
                    setIsLoading(false);
                }
            }
        };
        fetchNotifications();
    }, [effectiveProfileId]);

    const handleNotificationClick = async (notif: Notification) => {
        if (!notif.is_read) {
            try {
                await markNotificationAsRead(notif.id);
                setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
            } catch (e) {
                console.error("Failed to mark as read:", e);
            }
        }

        // Deep link navigation
        if (notif.metadata?.job_id) {
            if (effectiveUserRole === 'recruiter') {
                navigate(`/recruiter/matches/${notif.metadata.job_id}`);
            } else if (effectiveUserRole === 'seeker') {
                if (notif.metadata?.assessment_requested) {
                    navigate(`/seeker/evaluation/${notif.metadata.job_id}`);
                } else {
                    navigate(`/seeker/job/${notif.metadata.job_id}`);
                }
            }
        }
    };

    const markAllAsRead = async () => {
        try {
            // Sequential update for multiple notifications (could be optimized)
            const unread = notifications.filter(n => !n.is_read);
            await Promise.all(unread.map(n => markNotificationAsRead(n.id)));
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (e) {
            console.error("Failed to mark all as read:", e);
        }
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (language === 'it') {
            if (diffMins < 1) return 'Adesso';
            if (diffMins < 60) return `${diffMins} min fa`;
            if (diffHours < 24) return `${diffHours} h fa`;
            return `${diffDays} g fa`;
        }

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <div className="max-w-6xl mx-auto pt-2.5 px-3 sm:px-8 lg:px-10 pb-20 animate-fade-in">
            <button onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition-colors hover:text-orange-600 dark:hover:text-orange-400">
                &larr; <span>{text('Back', 'Indietro')}</span>
            </button>
            <div className="mb-6 border-b border-slate-200 pb-4 dark:border-slate-700">
                <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 p-2.5 text-white shadow-lg shadow-orange-200 dark:shadow-none sm:p-3">
                        <BellIcon />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">{text('Notification Center', 'Centro notifiche')}</h1>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">
                            {isLoading
                                ? text('Checking for updates...', 'Controllo aggiornamenti...')
                                : unreadCount > 0
                                    ? (language === 'it' ? `Hai ${unreadCount} aggiornamenti non letti` : `You have ${unreadCount} unread updates`)
                                    : text("You're all caught up", 'Non ci sono novità')}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex justify-end mb-4">
                {unreadCount > 0 && (
                    <button onClick={markAllAsRead} className="text-sm font-black text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 uppercase tracking-widest">
                        {text('Mark all as read', 'Segna tutto come letto')}
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                </div>
            ) : (
                <div className="space-y-4">
                    {notifications.length === 0 ? (
                            <div className="text-center py-16 sm:py-24 bg-white dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                            <div className="inline-block p-6 rounded-3xl bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 mb-6 shadow-sm">
                                <BellIcon />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-200">{text('Silence is golden', 'Tutto tranquillo')}</h3>
                            <p className="text-slate-500 dark:text-slate-400 font-medium max-w-xs mx-auto mt-2">{text('No notifications found. Check back later for updates on your applications!', 'Nessuna notifica al momento. Torna più tardi per gli aggiornamenti sulle tue candidature.')}</p>
                        </div>
                    ) : (
                        notifications.map(notif => (
                            <div
                                key={notif.id}
                                onClick={() => handleNotificationClick(notif)}
                                className={`rounded-3xl border p-4 transition-all duration-300 flex gap-4 cursor-pointer group sm:gap-5 sm:p-6 ${notif.is_read
                                    ? 'bg-white/50 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800 opacity-80 grayscale-[0.5]'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-md hover:shadow-xl'
                                    }`}
                            >
                                <div className={`flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center transition-transform ${notif.type === 'application_received' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                                    notif.type === 'invitation_received' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                                        'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
                                    }`}>
                                    {notif.type === 'application_received' && <SuccessIcon />}
                                    {notif.type === 'invitation_received' && <InfoIcon />}
                                    {notif.type === 'info' && <InfoIcon />}
                                    {notif.type === 'warning' && <WarningIcon />}
                                    {notif.type === 'job_match' && <BellIcon />}
                                    {notif.type === 'profile_update' && <InfoIcon />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <h3 className={`font-black uppercase tracking-tight truncate pr-4 ${notif.is_read ? 'text-slate-600 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                                            {notif.title}
                                        </h3>
                                        <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400 whitespace-nowrap bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                            {formatTime(notif.created_at)}
                                        </span>
                                    </div>
                                    <p className={`text-sm font-medium leading-relaxed ${notif.is_read ? 'text-slate-500 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>
                                        {notif.message}
                                    </p>
                                    {notif.metadata?.job_id && (
                                        <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-orange-600 dark:text-orange-400 tracking-widest bg-orange-50 dark:bg-orange-900/20 px-3 py-1 rounded-full group-hover:bg-orange-100 dark:group-hover:bg-orange-900/40 transition-colors">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                            {text('View Details', 'Vedi dettagli')}
                                        </div>
                                    )}
                                </div>
                                {!notif.is_read && (
                                    <div className="flex-shrink-0 self-center">
                                        <div className="h-3 w-3 bg-orange-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]"></div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};


export default NotificationsPage;
