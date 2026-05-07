import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'it' | 'en';

type TranslationKey =
    | 'header.login'
    | 'header.register'
    | 'header.accountMenuAria'
    | 'header.loggedIn'
    | 'header.signedIn'
    | 'header.userFallback'
    | 'header.backToAdminPortal'
    | 'header.profileSettings'
    | 'header.seeProfile'
    | 'header.notificationCenter'
    | 'header.settings'
    | 'header.logout';

type LanguageContextType = {
    language: AppLanguage;
    setLanguage: (language: AppLanguage) => void;
    t: (key: TranslationKey) => string;
    text: (english: string, italian: string) => string;
};

const STORAGE_KEY = 'peaktalent_language';

const translations: Record<AppLanguage, Record<TranslationKey, string>> = {
    en: {
        'header.login': 'Login',
        'header.register': 'Register',
        'header.accountMenuAria': 'Open account menu',
        'header.loggedIn': 'Logged in',
        'header.signedIn': 'Signed in',
        'header.userFallback': 'PeakTalent User',
        'header.backToAdminPortal': 'Back to Admin Portal',
        'header.profileSettings': 'Profile Settings',
        'header.seeProfile': 'See Profile',
        'header.notificationCenter': 'Notification Center',
        'header.settings': 'Settings',
        'header.logout': 'Logout',
    },
    it: {
        'header.login': 'Accedi',
        'header.register': 'Registrati',
        'header.accountMenuAria': 'Apri il menu account',
        'header.loggedIn': 'Accesso attivo',
        'header.signedIn': 'Connesso',
        'header.userFallback': 'Utente PeakTalent',
        'header.backToAdminPortal': 'Torna al Portale Admin',
        'header.profileSettings': 'Impostazioni Profilo',
        'header.seeProfile': 'Vedi Profilo',
        'header.notificationCenter': 'Centro Notifiche',
        'header.settings': 'Impostazioni',
        'header.logout': 'Esci',
    },
};

const detectInitialLanguage = (): AppLanguage => {
    if (typeof window === 'undefined') return 'it';

    const storedLanguage = window.localStorage.getItem(STORAGE_KEY);
    if (storedLanguage === 'it' || storedLanguage === 'en') {
        return storedLanguage;
    }

    return 'it';
};

const LanguageContext = createContext<LanguageContextType>({
    language: 'it',
    setLanguage: () => { },
    t: (key) => translations.it[key],
    text: (_english, italian) => italian,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [language, setLanguageState] = useState<AppLanguage>(detectInitialLanguage);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, language);
        }
        document.documentElement.lang = language;
    }, [language]);

    const value = useMemo<LanguageContextType>(() => ({
        language,
        setLanguage: (nextLanguage) => setLanguageState(nextLanguage),
        t: (key) => translations[language][key] || translations.en[key],
        text: (english, italian) => (language === 'it' ? italian : english),
    }), [language]);

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => useContext(LanguageContext);
