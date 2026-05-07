import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A9 9 0 1118.88 17.8M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const SettingsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const LogoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
);

const ChevronDownIcon = ({ open }: { open: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);

const MenuIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
);

const LanguageToggle = ({
    language,
    setLanguage,
    variant = 'header',
}: {
    language: 'it' | 'en';
    setLanguage: (language: 'it' | 'en') => void;
    variant?: 'header' | 'menu';
}) => (
    <div className={`flex items-center rounded-full border p-1 shadow-sm ${
        variant === 'menu'
            ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80'
            : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
    }`}>
        <button
            onClick={() => setLanguage('it')}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors sm:px-2.5 sm:text-xs sm:tracking-[0.18em] ${
                language === 'it'
                    ? 'bg-slate-900 text-white dark:bg-orange-500'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white'
            }`}
            aria-pressed={language === 'it'}
        >
            {variant === 'menu' && <span aria-hidden="true" className="text-[12px] leading-none">🇮🇹</span>}
            IT
        </button>
        <button
            onClick={() => setLanguage('en')}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors sm:px-2.5 sm:text-xs sm:tracking-[0.18em] ${
                language === 'en'
                    ? 'bg-slate-900 text-white dark:bg-orange-500'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white'
            }`}
            aria-pressed={language === 'en'}
        >
            {variant === 'menu' && <span aria-hidden="true" className="text-[12px] leading-none">🇺🇸</span>}
            EN
        </button>
    </div>
);

type MenuItem = {
    label: string;
    icon: React.ReactNode;
    onClick: () => void | Promise<void>;
    tone?: 'default' | 'danger';
};

const getInitials = (value?: string | null) => {
    if (!value) return 'PT';
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'PT';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
};

const Header: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { language, setLanguage, t } = useLanguage();
    const {
        user,
        userRole,
        effectiveUserRole,
        effectiveDisplayName,
        effectiveEmail,
        signOut,
        impersonation,
        isImpersonating,
        stopImpersonation,
    } = useAuth();

    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const isOnAdminPage = location.pathname.startsWith('/admin');
    const showAdminMobileNavToggle = location.pathname === '/admin/dashboard';
    const isAuthRoute = location.pathname === '/auth' || location.pathname === '/recruiter-auth';

    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const handleLogoClick = () => {
        if (isImpersonating && effectiveUserRole === 'seeker') {
            navigate('/seeker/dashboard');
        } else if (isImpersonating && effectiveUserRole === 'recruiter') {
            navigate('/recruiter/dashboard');
        } else if (user && userRole === 'seeker') {
            navigate('/seeker/dashboard');
        } else if (user && userRole === 'recruiter') {
            navigate('/recruiter/dashboard');
        } else if (user && userRole === 'admin') {
            navigate('/admin/dashboard');
        } else {
            navigate('/platform');
        }
    };

    const handleAdminMobileNavToggle = () => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('admin-dashboard-mobile-nav-toggle'));
    };

    const handleLogout = async () => {
        try {
            await signOut();
            navigate('/');
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    const menuItems = useMemo<MenuItem[]>(() => {
        const items: MenuItem[] = [];

        if (effectiveUserRole === 'seeker') {
            items.push({
                label: t('header.seeProfile'),
                icon: <UserIcon />,
                onClick: () => navigate('/seeker/settings', { state: { tab: 'profile' } }),
            });
            items.push({
                label: t('header.settings'),
                icon: <SettingsIcon />,
                onClick: () => navigate('/seeker/settings'),
            });
        } else if (effectiveUserRole === 'recruiter') {
            items.push({
                label: t('header.settings'),
                icon: <SettingsIcon />,
                onClick: () => navigate('/recruiter/settings', { state: { tab: 'profile' } }),
            });
        } else if (userRole === 'admin') {
            items.push({
                label: t('header.profileSettings'),
                icon: <SettingsIcon />,
                onClick: () => navigate('/admin/settings'),
            });
        }

        items.push({
            label: t('header.logout'),
            icon: <LogoutIcon />,
            onClick: handleLogout,
            tone: 'danger',
        });

        return items;
    }, [effectiveUserRole, navigate, t, userRole]);

    return (
        <header className="fixed top-0 left-0 right-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md transition-all duration-300 dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mx-auto max-w-[1600px] px-3 sm:px-8 lg:px-10">
                <div className="flex h-[54px] items-center justify-between sm:h-[58px] lg:h-[62px]">
                    <div className="flex items-center gap-2 sm:gap-3">
                        {showAdminMobileNavToggle && (
                            <button
                                type="button"
                                onClick={handleAdminMobileNavToggle}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 lg:hidden"
                                aria-label={t('header.accountMenuAria')}
                            >
                                <MenuIcon />
                            </button>
                        )}
                        <div className="flex items-center cursor-pointer group" onClick={handleLogoClick}>
                            <img src="/icon.svg" alt="PeakTalent Logo" className="mr-2 h-7 w-7 object-contain transition-transform duration-300 group-hover:scale-110 sm:mr-3 sm:h-8 sm:w-8" />
                            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 sm:text-2xl dark:from-white dark:to-slate-300">
                                PeakTalent
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                        {!user && (
                            <LanguageToggle language={language} setLanguage={setLanguage} variant="header" />
                        )}

                        {isImpersonating && impersonation && (
                            <button
                                onClick={() => {
                                    stopImpersonation();
                                    navigate('/admin/dashboard');
                                }}
                                className="hidden md:inline-flex rounded-lg bg-slate-900 px-4 py-1 text-sm font-semibold uppercase tracking-wide text-white shadow-lg transition-all duration-200 hover:shadow-xl dark:bg-slate-100 dark:text-slate-900"
                            >
                                {t('header.backToAdminPortal')}
                            </button>
                        )}

                        {user ? (
                            <div ref={menuRef} className="relative flex items-center gap-2">
                                <div className="hidden min-w-0 text-right sm:block">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[180px] sm:max-w-[240px]">
                                        {effectiveDisplayName || t('header.userFallback')}
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[180px] sm:max-w-[240px]">
                                        {effectiveEmail || t('header.loggedIn')}
                                    </p>
                                </div>

                                <button
                                    onClick={() => setMenuOpen((current) => !current)}
                                    className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pl-1 pr-1.5 shadow-sm transition-all hover:shadow-md sm:gap-2 sm:pr-2 dark:border-slate-700 dark:bg-slate-800"
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    aria-label={t('header.accountMenuAria')}
                                >
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-sm font-black text-white shadow-sm">
                                        {getInitials(effectiveDisplayName || effectiveEmail)}
                                    </span>
                                    <span className="text-slate-500 dark:text-slate-300">
                                        <ChevronDownIcon open={menuOpen} />
                                    </span>
                                </button>

                                {menuOpen && (
                                    <div className="absolute right-0 top-[calc(100%+10px)] w-[min(16rem,calc(100vw-1rem))] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-fade-in sm:w-64">
                                        <div className="px-4 py-4 border-b border-slate-100 dark:border-slate-800">
                                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                {effectiveDisplayName || t('header.userFallback')}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                {effectiveEmail || t('header.signedIn')}
                                            </p>
                                        </div>

                                        <div className="border-b border-slate-100 px-2 py-2 dark:border-slate-800">
                                            <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                                                <span className="font-medium">
                                                    {language === 'it' ? 'Lingua' : 'Language'}
                                                </span>
                                                <LanguageToggle language={language} setLanguage={setLanguage} variant="menu" />
                                            </div>
                                        </div>

                                        <div className="p-2">
                                            {menuItems.map((item) => (
                                                <button
                                                    key={item.label}
                                                    onClick={async () => {
                                                        setMenuOpen(false);
                                                        await item.onClick();
                                                    }}
                                                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                                                        item.tone === 'danger'
                                                            ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                    }`}
                                                >
                                                    <span>{item.icon}</span>
                                                    <span>{item.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={() => {
                                    if (isAuthRoute) {
                                        navigate('/platform');
                                        return;
                                    }

                                    navigate('/auth', { state: { mode: 'login' } });
                                }}
                                className="rounded-lg bg-orange-500 px-6 py-1.5 font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-orange-600 hover:shadow-xl"
                            >
                                {isAuthRoute ? t('header.register') : t('header.login')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
