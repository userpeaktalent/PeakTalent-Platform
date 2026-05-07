import { supabase } from './supabaseClient';

export type BugSeverity = 'low' | 'medium' | 'high' | 'blocker';
export type BugStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix' | 'duplicate';

export interface BugReportInput {
    title: string;
    description: string;
    severity: BugSeverity;
    userId?: string | null;
    userEmail?: string | null;
    userRole?: string | null;
}

export interface BugReportRecord {
    id: string;
    user_id: string | null;
    user_email: string | null;
    user_role: string | null;
    title: string;
    description: string;
    severity: BugSeverity;
    url: string | null;
    route: string | null;
    user_agent: string | null;
    viewport: string | null;
    platform: string | null;
    language: string | null;
    console_errors: Array<{ timestamp: string; message: string }>;
    metadata: Record<string, unknown>;
    status: BugStatus;
    created_at: string;
    updated_at: string;
}

const MAX_CONSOLE_ERRORS = 30;
const MAX_MESSAGE_LENGTH = 4000;

let ringBuffer: Array<{ timestamp: string; message: string }> = [];
let installed = false;

const safeStringify = (value: unknown): string => {
    if (value instanceof Error) {
        return value.stack || `${value.name}: ${value.message}`;
    }
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, Object.getOwnPropertyNames(value as object));
    } catch {
        return String(value);
    }
};

/**
 * Patches console.error to buffer the last N error messages so bug reports
 * can ship them as context. Safe to call more than once — patches only once.
 */
export const installConsoleErrorCapture = (): void => {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
        try {
            const message = args.map(safeStringify).join(' ').slice(0, MAX_MESSAGE_LENGTH);
            ringBuffer.push({ timestamp: new Date().toISOString(), message });
            if (ringBuffer.length > MAX_CONSOLE_ERRORS) {
                ringBuffer = ringBuffer.slice(-MAX_CONSOLE_ERRORS);
            }
        } catch {
            // Never let capture break the app.
        }
        originalError(...args);
    };

    window.addEventListener('error', (event) => {
        try {
            const message = `[window.onerror] ${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`.slice(0, MAX_MESSAGE_LENGTH);
            ringBuffer.push({ timestamp: new Date().toISOString(), message });
            if (ringBuffer.length > MAX_CONSOLE_ERRORS) {
                ringBuffer = ringBuffer.slice(-MAX_CONSOLE_ERRORS);
            }
        } catch {
            // swallow
        }
    });

    window.addEventListener('unhandledrejection', (event) => {
        try {
            const message = `[unhandledrejection] ${safeStringify(event.reason)}`.slice(0, MAX_MESSAGE_LENGTH);
            ringBuffer.push({ timestamp: new Date().toISOString(), message });
            if (ringBuffer.length > MAX_CONSOLE_ERRORS) {
                ringBuffer = ringBuffer.slice(-MAX_CONSOLE_ERRORS);
            }
        } catch {
            // swallow
        }
    });
};

export const getCapturedConsoleErrors = (): Array<{ timestamp: string; message: string }> => {
    return [...ringBuffer];
};

export const clearCapturedConsoleErrors = (): void => {
    ringBuffer = [];
};

const collectClientContext = () => {
    if (typeof window === 'undefined') {
        return {
            url: null,
            route: null,
            userAgent: null,
            viewport: null,
            platform: null,
            language: null,
            metadata: {} as Record<string, unknown>,
        };
    }

    const nav = window.navigator;
    const { innerWidth, innerHeight, screen, devicePixelRatio } = window;

    return {
        url: window.location.href,
        route: window.location.pathname + window.location.search,
        userAgent: nav?.userAgent ?? null,
        viewport: `${innerWidth}x${innerHeight}`,
        platform: nav?.platform ?? null,
        language: nav?.language ?? null,
        metadata: {
            screen: screen ? `${screen.width}x${screen.height}` : null,
            devicePixelRatio: devicePixelRatio ?? null,
            referrer: typeof document !== 'undefined' ? document.referrer : null,
            timezone: Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone ?? null,
            online: nav?.onLine ?? null,
            timestamp: new Date().toISOString(),
        } as Record<string, unknown>,
    };
};

export const submitBugReport = async (input: BugReportInput): Promise<BugReportRecord> => {
    const ctx = collectClientContext();
    const payload = {
        user_id: input.userId ?? null,
        user_email: input.userEmail ?? null,
        user_role: input.userRole ?? null,
        title: input.title.trim().slice(0, 200),
        description: input.description.trim().slice(0, 8000),
        severity: input.severity,
        url: ctx.url,
        route: ctx.route,
        user_agent: ctx.userAgent,
        viewport: ctx.viewport,
        platform: ctx.platform,
        language: ctx.language,
        console_errors: getCapturedConsoleErrors(),
        metadata: ctx.metadata,
    };

    const { data, error } = await supabase
        .from('bug_reports')
        .insert(payload)
        .select('*')
        .single();

    if (error) throw error;
    return data as BugReportRecord;
};

export const getAllBugReports = async (): Promise<BugReportRecord[]> => {
    const { data, error } = await supabase
        .from('bug_reports')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as BugReportRecord[];
};

export const updateBugReportStatus = async (id: string, status: BugStatus): Promise<void> => {
    const { error } = await supabase
        .from('bug_reports')
        .update({ status })
        .eq('id', id);
    if (error) throw error;
};

export const deleteBugReport = async (id: string): Promise<void> => {
    const { error } = await supabase
        .from('bug_reports')
        .delete()
        .eq('id', id);
    if (error) throw error;
};
