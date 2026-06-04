const PASSWORD_RECOVERY_KEY = 'peaktalent_password_recovery_pending';

export const markPendingPasswordRecovery = () => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(PASSWORD_RECOVERY_KEY, '1');
};

export const hasPendingPasswordRecovery = () => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(PASSWORD_RECOVERY_KEY) === '1';
};

export const clearPendingPasswordRecovery = () => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(PASSWORD_RECOVERY_KEY);
};
