// GDPR Article 5(1)(e) — storage limitation / inactivity cleanup
// Intended to be invoked daily by a pg_cron job or Supabase scheduled function.
// Can also be triggered manually via POST from the admin panel.
//
// Logic:
//   Pass 1 — users inactive for >= INACTIVITY_MONTHS with NO prior notice:
//     • set inactivity_notice_sent_at = now(), generate inactivity_token
//     • send "your data will be deleted in 30 days" email with a keep-alive link
//
//   Pass 2 — users where inactivity_notice_sent_at > GRACE_DAYS ago with still no login:
//     • invoke the delete-account pipeline for each (same cascade as user-triggered deletion)
//
// Security: this function must be called with the service-role key or an admin JWT.
// We reject anything else to prevent abuse.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { crypto } from 'jsr:@std/crypto@1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const getEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
};

const EMAIL_SETTING_KEY = 'email';

const isMissingSettingsTableError = (error: unknown) => {
  const code = String((error as any)?.code || '').trim();
  const message = String((error as any)?.message || '').toLowerCase();

  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    (message.includes('platform_feature_flags') && message.includes('not found')) ||
    (message.includes('relation') && message.includes('platform_feature_flags'))
  );
};

const INACTIVITY_MONTHS = 12;
const GRACE_DAYS = 30;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const getGraphToken = async () => {
  const tenantId = getEnv('MICROSOFT_TENANT_ID');
  const clientId = getEnv('MICROSOFT_CLIENT_ID');
  const clientSecret = getEnv('MICROSOFT_CLIENT_SECRET');

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Microsoft token request failed (${response.status}): ${detail}`);
  }

  const parsed = await response.json();
  if (!parsed.access_token) throw new Error('Microsoft token response missing access_token');
  return parsed.access_token as string;
};

async function sendInactivityNotice(
  email: string,
  name: string | null,
  token: string,
  deleteDate: Date
) {
  const senderEmail = getEnv('MICROSOFT_SENDER_EMAIL');
  const siteUrl = Deno.env.get('PUBLIC_SITE_URL')?.trim() || 'https://www.peaktalent.it';
  const keepAliveUrl = `${siteUrl.replace(/\/$/, '')}/keep-account-active?token=${token}`;
  const deleteDateStr = deleteDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const displayName = name?.trim() || 'there';

  const accessToken = await getGraphToken();

  const body = [
    `Ciao ${displayName},`,
    '',
    `Non accedi a PeakTalent da più di ${INACTIVITY_MONTHS} mesi.`,
    `In conformità al GDPR, i tuoi dati verranno eliminati automaticamente il ${deleteDateStr}.`,
    '',
    'Se vuoi mantenere il tuo account attivo, clicca qui:',
    keepAliveUrl,
    '',
    'Se non fai nulla, tutti i tuoi dati verranno cancellati definitivamente.',
    '',
    '-----',
    '',
    `Hi ${displayName},`,
    '',
    `You haven't logged in to PeakTalent for more than ${INACTIVITY_MONTHS} months.`,
    `In compliance with GDPR, your data will be permanently deleted on ${deleteDateStr}.`,
    '',
    'To keep your account active, click here:',
    keepAliveUrl,
    '',
    'If you do nothing, all your data will be permanently deleted.',
    '',
    '— The PeakTalent team',
  ].join('\n');

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: `PeakTalent | Il tuo account verrà eliminato il ${deleteDateStr} / Your account will be deleted on ${deleteDateStr}`,
          body: { contentType: 'Text', content: body },
          toRecipients: [{ emailAddress: { address: email } }],
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`sendMail failed (${response.status}): ${detail}`);
  }
}

const getEmailSendingEnabled = async (adminClient: ReturnType<typeof createClient>) => {
  const { data, error } = await adminClient
    .from('platform_feature_flags')
    .select('enabled')
    .eq('key', EMAIL_SETTING_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingSettingsTableError(error)) {
      return false;
    }
    throw new Error(`Could not load email setting: ${error.message}`);
  }

  return Boolean(data?.enabled);
};

async function triggerDeleteAccount(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string
) {
  // Call the delete-account Edge Function using the service-role key as the bearer token.
  // This bypasses the user auth check — only valid because we already verified inactivity server-side.
  const response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      // Pass the service role key in the x-client-info header so delete-account knows it's a server call
    },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`delete-account failed for ${userId} (${response.status}): ${detail}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // Verify caller is using the service-role key (internal/cron call only)
    const authorization = req.headers.get('Authorization') || '';
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = getEnv('SUPABASE_URL');

    // Accept either service-role bearer OR an admin JWT
    const isServiceRole = authorization === `Bearer ${serviceRoleKey}`;
    if (!isServiceRole) {
      // Check if it's an admin user JWT
      const anonKey = getEnv('SUPABASE_ANON_KEY');
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const { data: profile } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.role !== 'admin') return json({ error: 'Forbidden — admins only' }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const emailSendingEnabled = await getEmailSendingEnabled(adminClient);

    const now = new Date();
    const inactivityCutoff = addMonths(now, -INACTIVITY_MONTHS); // 12 months ago
    const graceCutoff = addDays(now, -GRACE_DAYS);              // 30 days ago

    // ── Pass 2: auto-delete accounts where notice was sent > GRACE_DAYS ago ──
    const { data: toDelete } = await adminClient
      .from('profiles')
      .select('id')
      .not('inactivity_notice_sent_at', 'is', null)
      .lt('inactivity_notice_sent_at', graceCutoff.toISOString())
      .eq('role', 'seeker');

    let deletedCount = 0;
    if (toDelete && toDelete.length > 0) {
      for (const row of toDelete) {
        // Check last_sign_in_at again — if they logged in after the notice, skip
        const { data: authUser } = await adminClient.auth.admin.getUserById(row.id);
        const lastSignIn = authUser?.user?.last_sign_in_at;
        if (lastSignIn && new Date(lastSignIn) > inactivityCutoff) {
          // User logged in — clear the notice flag
          await adminClient
            .from('profiles')
            .update({ inactivity_notice_sent_at: null, inactivity_token: null })
            .eq('id', row.id);
          continue;
        }
        await triggerDeleteAccount(adminClient, row.id, supabaseUrl, serviceRoleKey);
        deletedCount++;
      }
    }

    // ── Pass 1: send inactivity notice to inactive users with no notice yet ──
    // We cross-reference auth.users.last_sign_in_at via admin API
    // Fetch seeker profiles that have no notice sent yet
    const { data: seekerProfiles } = await adminClient
      .from('profiles')
      .select('id, full_name, email')
      .is('inactivity_notice_sent_at', null)
      .eq('role', 'seeker');

    let noticedCount = 0;
    if (!emailSendingEnabled) {
      return json({ success: true, noticedCount, deletedCount, emailPaused: true });
    }

    if (seekerProfiles && seekerProfiles.length > 0) {
      for (const profile of seekerProfiles) {
        const { data: authUser } = await adminClient.auth.admin.getUserById(profile.id);
        const lastSignIn = authUser?.user?.last_sign_in_at;

        // If never signed in or last sign-in is before cutoff → send notice
        if (!lastSignIn || new Date(lastSignIn) < inactivityCutoff) {
          const token = generateToken();
          const deleteDate = addDays(now, GRACE_DAYS);

          await adminClient
            .from('profiles')
            .update({ inactivity_notice_sent_at: now.toISOString(), inactivity_token: token })
            .eq('id', profile.id);

          try {
            await sendInactivityNotice(profile.email, profile.full_name, token, deleteDate);
            noticedCount++;
          } catch (emailErr) {
            console.error(`Failed to send inactivity notice to ${profile.email}:`, emailErr);
            // Roll back the flag so we retry next run
            await adminClient
              .from('profiles')
              .update({ inactivity_notice_sent_at: null, inactivity_token: null })
              .eq('id', profile.id);
          }
        }
      }
    }

    return json({ success: true, noticedCount, deletedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('check-inactivity error:', message);
    return json({ error: message }, 500);
  }
});
