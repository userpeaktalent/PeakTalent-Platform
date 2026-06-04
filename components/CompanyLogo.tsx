import React from 'react';

const sizeClasses = {
    sm: 'h-11 w-11 rounded-xl text-sm',
    md: 'h-14 w-14 rounded-2xl text-base',
    lg: 'h-16 w-16 rounded-[22px] text-lg',
} as const;

interface CompanyLogoProps {
    logoUrl?: string | null;
    companyName?: string | null;
    size?: keyof typeof sizeClasses;
    className?: string;
    fullBleed?: boolean;
}

const getInitials = (companyName?: string | null) => {
    const words = (companyName || '')
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean);

    if (words.length === 0) return 'PT';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
};

const CompanyLogo: React.FC<CompanyLogoProps> = ({
    logoUrl,
    companyName,
    size = 'md',
    className = '',
    fullBleed = false,
}) => {
    const initials = getInitials(companyName);
    const sharedClasses = `${sizeClasses[size]} ${className}`.trim();

    if (logoUrl) {
        return (
            <div className={`${fullBleed ? '' : 'border border-slate-200 bg-white shadow-sm dark:border-slate-800'} overflow-hidden ${sharedClasses}`.trim()}>
                <img
                    src={logoUrl}
                    alt={companyName ? `${companyName} logo` : 'Company logo'}
                    className={fullBleed ? 'h-full w-full object-fill' : 'h-full w-full object-contain p-2'}
                    loading="lazy"
                />
            </div>
        );
    }

    return (
        <div className={`flex items-center justify-center border border-orange-100 bg-orange-50 font-black uppercase tracking-[0.18em] text-orange-600 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300 ${sharedClasses}`}>
            {initials}
        </div>
    );
};

export default CompanyLogo;
