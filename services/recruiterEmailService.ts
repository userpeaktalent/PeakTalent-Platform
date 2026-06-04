import { supabase } from './supabaseClient';
import { EMAIL_SENDING_PAUSED_MESSAGE, getEmailSendingEnabled } from './platformSettingsService';

export type RecruiterInviteEmailKind = 'assessment' | 'ai_refinement';

export interface RecruiterInviteEmailInput {
  invitationType: RecruiterInviteEmailKind;
  candidateEmail: string;
  candidateName?: string;
  recruiterEmail?: string | null;
  recruiterName?: string | null;
  jobId: string;
  jobTitle: string;
  questionCount?: number;
  requiresAiRefinement?: boolean;
  jobUrl?: string;
}

const FUNCTION_NAME = 'send-recruiter-interest-email';

export type RecruiterInviteEmailDispatchStatus = 'sent' | 'paused';

export interface RecruiterInviteEmailDispatchResult {
  status: RecruiterInviteEmailDispatchStatus;
}

const normalizeErrorMessage = async (error: unknown): Promise<string> => {
  const response = (error as any)?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const cloned = response.clone();
      const contentType = cloned.headers?.get?.('content-type') || '';

      if (contentType.includes('application/json')) {
        const payload = await cloned.json();
        if (payload?.error) return String(payload.error);
        if (payload?.message) return String(payload.message);
      }

      const text = await cloned.text();
      if (text?.trim()) return text.trim();
    } catch {
      // Fall through to generic error parsing.
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return 'Unknown email delivery error.';
};

export const buildSeekerJobUrl = (jobId: string): string | undefined => {
  const configuredSiteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || '').trim();
  const baseUrl = configuredSiteUrl || (typeof window !== 'undefined' ? window.location?.origin : '');
  if (!baseUrl) return undefined;
  return `${baseUrl.replace(/\/$/, '')}/seeker/job/${jobId}`;
};

export const sendRecruiterInviteEmail = async (
  payload: RecruiterInviteEmailInput
): Promise<RecruiterInviteEmailDispatchResult> => {
  const emailSendingEnabled = await getEmailSendingEnabled();
  if (!emailSendingEnabled) {
    return { status: 'paused' };
  }

  const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: payload,
  });

  if (!error) return { status: 'sent' };

  const message = await normalizeErrorMessage(error);
  const lower = message.toLowerCase();

  if (lower.includes('email sending is currently paused by admin')) {
    return { status: 'paused' };
  }

  if (
    (lower.includes('failed to send a request to the edge function') && !lower.includes('microsoft')) ||
    (lower.includes('non-2xx status code') && !lower.includes('microsoft')) ||
    lower.includes('fetch')
  ) {
    throw new Error(
      `Questionnaire invite email could not be delivered. Deploy and configure the ${FUNCTION_NAME} Supabase Edge Function first.`
    );
  }

  throw new Error(message);
};

export { EMAIL_SENDING_PAUSED_MESSAGE };
