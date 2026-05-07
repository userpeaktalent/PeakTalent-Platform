import React from 'react';
import { useLanguage } from './LanguageProvider';

const demoContactHref = 'mailto:info@peaktalent.it?subject=Richiesta%20Demo%20PeakTalent&body=Buongiorno%2C%0A%0ASono%20interessato%2Fa%20a%20richiedere%20una%20demo%20della%20piattaforma%20PeakTalent.%0A%0ANome%3A%20%0AAzienda%3A%20%0ARuolo%3A%20%0ATelefono%3A%20%0A%0AGrazie%2C%0A';
const privacyPolicyHref = 'https://www.iubenda.com/privacy-policy/84841902';
const cookiePolicyHref = 'https://www.iubenda.com/privacy-policy/84841902/cookie-policy';

const Footer: React.FC<{ className?: string }> = ({ className = '' }) => {
    const year = new Date().getFullYear();
    const { text } = useLanguage();
    const spacingClass = className.trim() || 'mt-auto';

    return (
        <footer className={`bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-5 ${spacingClass}`.trim()}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-2 md:flex-row md:justify-between md:items-center text-slate-500 dark:text-slate-400">
                <div className="text-sm">
                    &copy; {year} PeakTalent. {text('All rights reserved.', 'Tutti i diritti riservati.')}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                    <a href="/#solution" className="hover:text-orange-500 transition-colors">{text('About', 'About')}</a>
                    <a
                        href={privacyPolicyHref}
                        className="iubenda-white iubenda-noiframe iubenda-embed hover:text-orange-500 transition-colors"
                        title="Privacy Policy"
                    >
                        {text('Privacy Policy', 'Privacy')}
                    </a>
                    <a
                        href={cookiePolicyHref}
                        className="iubenda-white iubenda-noiframe iubenda-embed hover:text-orange-500 transition-colors"
                        title="Cookie Policy"
                    >
                        Cookie Policy
                    </a>
                    <a href="#" className="hover:text-orange-500 transition-colors">{text('Terms of Service', 'Termini di servizio')}</a>
                    <a href={demoContactHref} className="hover:text-orange-500 transition-colors">{text('Contact', 'Contatti')}</a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
