const PENDING_JOB_INTEREST_KEY = 'peaktalent_pending_job_interest';

const getCurrentSiteOrigin = () => {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }

    return import.meta.env.VITE_PUBLIC_SITE_URL || '';
};

const buildAbsoluteUrl = (path: string) => {
    const origin = getCurrentSiteOrigin();

    if (!origin) {
        return path;
    }

    return new URL(path, origin).toString();
};

export const buildSeekerInterestPath = (jobId: string) => {
    const params = new URLSearchParams({
        mode: 'signup',
        job: jobId,
        interest: '1',
    });

    return `/auth?${params.toString()}`;
};

export const buildSeekerInterestUrl = (jobId: string) =>
    buildAbsoluteUrl(buildSeekerInterestPath(jobId));

export const savePendingJobInterest = (jobId: string) => {
    if (typeof window === 'undefined' || !jobId) return;
    window.localStorage.setItem(PENDING_JOB_INTEREST_KEY, jobId);
};

export const loadPendingJobInterest = (): string | null => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(PENDING_JOB_INTEREST_KEY);
};

export const clearPendingJobInterest = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(PENDING_JOB_INTEREST_KEY);
};

export const buildRecruiterAccessRequestHref = () => {
    const subject = 'Richiesta accesso recruiter PeakTalent';
    const body = [
        'Buongiorno,',
        '',
        'Vorrei utilizzare PeakTalent come recruiter.',
        '',
        'Nome:',
        'Azienda:',
        'Ruolo:',
        'Email lavoro:',
        'Telefono:',
        '',
        'Grazie,',
    ].join('\n');

    return `mailto:info@peaktalent.it?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

export const buildRecruiterInviteMailto = (input: {
    recipientEmail: string;
    recruiterName: string;
    companyName: string;
    loginEmail: string;
    temporaryPassword: string;
    loginUrl?: string;
}) => {
    const loginUrl = input.loginUrl || buildAbsoluteUrl('/auth');
    const subject = `Accesso recruiter PeakTalent - ${input.companyName || 'Nuovo account'}`;
    const body = [
        `Ciao ${input.recruiterName || ''},`,
        '',
        `il tuo accesso recruiter per ${input.companyName || 'PeakTalent'} è stato creato.`,
        '',
        `Email: ${input.loginEmail}`,
        `Password temporanea: ${input.temporaryPassword}`,
        `Link accesso: ${loginUrl}`,
        '',
        'Al primo accesso ti verrà chiesto di cambiare subito la password.',
        '',
        'A presto,',
    ].join('\n');

    return `mailto:${encodeURIComponent(input.recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
