const PENDING_JOB_INTEREST_KEY = 'peaktalent_pending_job_interest';

export interface PendingJobInterest {
    jobId: string;
    inviteOnly?: boolean;
}

interface SeekerInterestLinkOptions {
    mode?: 'signup' | 'login';
    inviteOnly?: boolean;
}

const normalizePendingJobInterest = (
    input: string | PendingJobInterest | null | undefined
): PendingJobInterest | null => {
    if (!input) return null;

    if (typeof input === 'string') {
        const jobId = input.trim();
        return jobId ? { jobId } : null;
    }

    const jobId = input.jobId?.trim();
    if (!jobId) return null;

    return {
        jobId,
        inviteOnly: Boolean(input.inviteOnly),
    };
};

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

export const buildSeekerInterestPath = (jobId: string, options: SeekerInterestLinkOptions = {}) => {
    const params = new URLSearchParams({
        mode: options.mode || 'signup',
        job: jobId,
        interest: '1',
    });

    if (options.inviteOnly) {
        params.set('invite', '1');
    }

    return `/auth?${params.toString()}`;
};

export const buildSeekerInterestUrl = (jobId: string, options: SeekerInterestLinkOptions = {}) =>
    buildAbsoluteUrl(buildSeekerInterestPath(jobId, options));

export const buildSeekerInvitedSignupUrl = (jobId: string) =>
    buildSeekerInterestUrl(jobId, { mode: 'signup', inviteOnly: true });

export const buildSeekerInvitedLoginUrl = (jobId: string) =>
    buildSeekerInterestUrl(jobId, { mode: 'login', inviteOnly: true });

export const savePendingJobInterest = (payload: string | PendingJobInterest) => {
    if (typeof window === 'undefined') return;

    const normalized = normalizePendingJobInterest(payload);
    if (!normalized) return;

    window.localStorage.setItem(PENDING_JOB_INTEREST_KEY, JSON.stringify(normalized));
};

export const loadPendingJobInterest = (): PendingJobInterest | null => {
    if (typeof window === 'undefined') return null;

    const raw = window.localStorage.getItem(PENDING_JOB_INTEREST_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        return normalizePendingJobInterest(parsed);
    } catch {
        return normalizePendingJobInterest(raw);
    }
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

export const buildRecruiterApplicantInviteMailto = (input: {
    candidateEmails: string[];
    jobTitle: string;
    companyName?: string | null;
    recruiterName?: string | null;
    signupUrl: string;
    loginUrl: string;
}) => {
    const recipients = input.candidateEmails
        .map((email) => email.trim())
        .filter(Boolean);

    const subject = `Invito | ${input.jobTitle}`;
    const recruiterName = input.recruiterName?.trim() || 'PeakTalent';
    const companyName = input.companyName?.trim() || 'PeakTalent';
    const body = [
        'Ciao,',
        '',
        `${recruiterName} ti ha invitato a visualizzare il job posting "${input.jobTitle}" su PeakTalent per ${companyName}.`,
        '',
        'Se non hai ancora un account, registrati da qui:',
        input.signupUrl,
        '',
        'Se hai già un account, accedi da qui:',
        input.loginUrl,
        '',
        'Importante: usa la stessa email con cui hai ricevuto questo invito.',
        '',
        '-----',
        '',
        'Hi,',
        '',
        `${recruiterName} invited you to view the "${input.jobTitle}" job posting on PeakTalent for ${companyName}.`,
        '',
        'If you do not have an account yet, sign up here:',
        input.signupUrl,
        '',
        'If you already have an account, log in here:',
        input.loginUrl,
        '',
        'Important: use the same email address that received this invitation.',
    ].join('\n');

    return `mailto:?bcc=${encodeURIComponent(recipients.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

export const buildRecruiterInterestedCandidatesMailto = (input: {
    candidateEmails: string[];
    jobTitle: string;
    companyName?: string | null;
    recruiterName?: string | null;
    recruiterEmail?: string | null;
}) => {
    const recipients = input.candidateEmails
        .map((email) => email.trim())
        .filter(Boolean);

    const subject = `PeakTalent | ${input.jobTitle}`;
    const recruiterName = input.recruiterName?.trim() || 'PeakTalent';
    const companyName = input.companyName?.trim() || 'PeakTalent';
    const recruiterEmail = input.recruiterEmail?.trim();
    const contactInstruction = recruiterEmail
        ? `Reply to this email or write directly to ${recruiterEmail} to arrange the interview.`
        : 'Reply to this email to arrange the interview.';

    const contactInstructionIt = recruiterEmail
        ? `Rispondi a questa email oppure scrivi direttamente a ${recruiterEmail} per organizzare il colloquio.`
        : 'Rispondi a questa email per organizzare il colloquio.';

    const body = [
        'Ciao,',
        '',
        `Sei stato inserito nella shortlist per la posizione "${input.jobTitle}" su PeakTalent per ${companyName}.`,
        '',
        `${recruiterName} desidera proseguire con il processo di selezione.`,
        contactInstructionIt,
        '',
        'Grazie,',
        '',
        '-----',
        '',
        'Hi,',
        '',
        `You have been shortlisted for the "${input.jobTitle}" role on PeakTalent for ${companyName}.`,
        '',
        `${recruiterName} would like to continue with the hiring process.`,
        contactInstruction,
        '',
        'Thank you,',
    ].join('\n');

    return `mailto:?bcc=${encodeURIComponent(recipients.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

export const buildAdminPasswordResetMailto = (input: {
    recipientEmail: string;
    loginEmail: string;
    temporaryPassword: string;
}) => {
    const subject = 'Reset password';
    const body = [
        'Gentile utente,',
        '',
        'la tua password è stata resettata con successo.',
        '',
        `Email: ${input.loginEmail}`,
        `Password: ${input.temporaryPassword}`,
        '',
        'Ti chiediamo di accedere alla piattaforma e sostituire subito questa password con una nuova password personale.',
        '',
        'Cordiali saluti,',
        'PeakTalent',
    ].join('\n');

    return `mailto:${encodeURIComponent(input.recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
