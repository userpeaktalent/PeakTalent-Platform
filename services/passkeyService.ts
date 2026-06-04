import { supabase } from './supabaseClient';

type TextResolver = (english: string, italian: string) => string;

export type PasskeyRecord = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

export const isPasskeySupported = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(window.PublicKeyCredential && window.isSecureContext);
};

export const getFriendlyPasskeyError = (
  error: unknown,
  text: TextResolver,
  fallback = text('Passkey operation failed. Please try again.', 'Operazione passkey non riuscita. Riprova.')
) => {
  const message = error instanceof Error ? error.message : String(error || '');
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('experimental') || lowerMessage.includes('passkey api')) {
    return text(
      'Passkeys are not enabled for this Supabase project yet. Enable the Passkeys/WebAuthn provider in Supabase Auth, then try again.',
      'Le passkey non sono ancora attive per questo progetto Supabase. Attiva il provider Passkeys/WebAuthn in Supabase Auth e riprova.'
    );
  }

  if (lowerMessage.includes('webauthn') || lowerMessage.includes('publickeycredential')) {
    return text(
      'This browser or connection does not support passkeys. Use Chrome, Safari, Edge or Firefox on HTTPS/local development.',
      'Questo browser o questa connessione non supporta le passkey. Usa Chrome, Safari, Edge o Firefox su HTTPS o sviluppo locale.'
    );
  }

  if (
    lowerMessage.includes('notallowederror') ||
    lowerMessage.includes('operation either timed out') ||
    lowerMessage.includes('ceremony failed')
  ) {
    return text(
      'The passkey request was cancelled or timed out. Please start again and approve it on your device.',
      'La richiesta passkey è stata annullata o è scaduta. Riprova e confermala sul tuo dispositivo.'
    );
  }

  if (lowerMessage.includes('auth session missing') || lowerMessage.includes('session')) {
    return text(
      'Your session is no longer active. Sign in again before managing passkeys.',
      'La sessione non è più attiva. Accedi di nuovo prima di gestire le passkey.'
    );
  }

  return message || fallback;
};

export const signInWithPasskey = async () => supabase.auth.signInWithPasskey();

export const listPasskeys = async () => supabase.auth.passkey.list();

export const registerPasskey = async () => {
  const { data, error } = await supabase.auth.registerPasskey();
  if (error || !data?.id) {
    return { data, error };
  }

  const friendlyName = `PeakTalent ${new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}`;

  const updateResult = await supabase.auth.passkey.update({
    passkeyId: data.id,
    friendlyName,
  });

  return updateResult.error ? { data, error: null } : updateResult;
};

export const deletePasskey = async (passkeyId: string) => supabase.auth.passkey.delete({ passkeyId });
