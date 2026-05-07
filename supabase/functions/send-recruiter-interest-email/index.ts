import { createClient } from 'jsr:@supabase/supabase-js@2';

type InviteKind = 'assessment' | 'ai_refinement';

type InvitePayload = {
  invitationType: InviteKind;
  candidateEmail: string;
  candidateName?: string;
  recruiterEmail?: string | null;
  recruiterName?: string | null;
  jobId: string;
  jobTitle: string;
  questionCount?: number;
  requiresAiRefinement?: boolean;
  jobUrl?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const getEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
};

const toDisplayName = (value?: string | null, fallback = 'there') => {
  const trimmed = value?.trim();
  return trimmed || fallback;
};

const toSubject = (payload: InvitePayload) => {
  if (payload.invitationType === 'ai_refinement') {
    return `PeakTalent | Completa il perfezionamento AI / Complete your AI profile refinement for ${payload.jobTitle}`;
  }

  if (payload.requiresAiRefinement) {
    return `PeakTalent | Completa profilo AI + questionario / Complete AI profile + questionnaire for ${payload.jobTitle}`;
  }

  return `PeakTalent | Completa il questionario / Complete your questionnaire for ${payload.jobTitle}`;
};

const isValidEmail = (value?: string | null) =>
  Boolean(value?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));

const toTextBody = (payload: InvitePayload, senderName: string, siteUrl: string) => {
  const candidateName = toDisplayName(payload.candidateName, 'there');
  const recruiterName = toDisplayName(payload.recruiterName, senderName);
  const jobTitle = payload.jobTitle.trim();
  const buttonUrl = payload.jobUrl || `${siteUrl.replace(/\/$/, '')}/platform`;
  const questionCount = Math.max(1, payload.questionCount || 10);

  const introEn =
    payload.invitationType === 'ai_refinement'
      ? `Recruiter ${recruiterName} asked you to complete your AI profile refinement for the role "${jobTitle}".`
      : payload.requiresAiRefinement
        ? `Recruiter ${recruiterName} asked you to complete your AI profile refinement first, then a ${questionCount}-question questionnaire for "${jobTitle}".`
        : `Recruiter ${recruiterName} asked you to complete a ${questionCount}-question questionnaire for "${jobTitle}".`;

  const introIt =
    payload.invitationType === 'ai_refinement'
      ? `Il recruiter ${recruiterName} ti ha chiesto di completare il perfezionamento AI del profilo per il ruolo "${jobTitle}".`
      : payload.requiresAiRefinement
        ? `Il recruiter ${recruiterName} ti ha chiesto di completare prima il perfezionamento AI del profilo, poi un questionario di ${questionCount} domande per il ruolo "${jobTitle}".`
        : `Il recruiter ${recruiterName} ti ha chiesto di completare un questionario di ${questionCount} domande per il ruolo "${jobTitle}".`;

  const checklistEn =
    payload.invitationType === 'ai_refinement'
      ? [
          '- Open PeakTalent',
          '- Go to the job page',
          '- Complete the AI profile refinement requested by the recruiter',
        ].join('\n')
      : payload.requiresAiRefinement
        ? [
            '- Open PeakTalent',
            '- Go to the job page',
            '- Complete your AI profile refinement',
            '- Answer the role questionnaire',
          ].join('\n')
        : [
            '- Open PeakTalent',
            '- Go to the job page',
            '- Answer the role questionnaire',
          ].join('\n');

  const checklistIt =
    payload.invitationType === 'ai_refinement'
      ? [
          '- Apri PeakTalent',
          '- Vai alla pagina del job',
          '- Completa il perfezionamento AI del profilo richiesto dal recruiter',
        ].join('\n')
      : payload.requiresAiRefinement
        ? [
            '- Apri PeakTalent',
            '- Vai alla pagina del job',
            '- Completa il perfezionamento AI del profilo',
            '- Rispondi al questionario sul ruolo',
          ].join('\n')
        : [
            '- Apri PeakTalent',
            '- Vai alla pagina del job',
            '- Rispondi al questionario sul ruolo',
          ].join('\n');

  return [
    `Ciao ${candidateName},`,
    '',
    introIt,
    '',
    'Cosa fare adesso:',
    checklistIt,
    '',
    `Apri PeakTalent: ${buttonUrl}`,
    '',
    '-----',
    '',
    `Hi ${candidateName},`,
    '',
    introEn,
    '',
    'What to do next:',
    checklistEn,
    '',
    `Open PeakTalent: ${buttonUrl}`,
  ].join('\n');
};

const getGraphToken = async () => {
  const tenantId = getEnv('MICROSOFT_TENANT_ID');
  const clientId = getEnv('MICROSOFT_CLIENT_ID');
  const clientSecret = getEnv('MICROSOFT_CLIENT_SECRET');

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });

  const raw = await response.text();
  const location = response.headers.get('location');
  if (!response.ok) {
    throw new Error(
      `Microsoft token request failed (${response.status})${location ? ` redirect=${location}` : ''}: ${raw}`
    );
  }

  if (location) {
    throw new Error(`Microsoft token request unexpectedly redirected to: ${location}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Microsoft token response was not valid JSON (${response.status}). First 200 chars: ${raw.slice(0, 200)}`
    );
  }

  if (!parsed.access_token) {
    throw new Error('Microsoft token response did not include an access token.');
  }

  return parsed.access_token as string;
};

const sendEmailViaGraph = async (payload: InvitePayload, senderName: string) => {
  const senderEmail = getEnv('MICROSOFT_SENDER_EMAIL');
  const publicSiteUrl = Deno.env.get('PUBLIC_SITE_URL')?.trim() || 'https://www.peaktalent.it';
  const accessToken = await getGraphToken();
  const replyToEmail = isValidEmail(payload.recruiterEmail) ? payload.recruiterEmail!.trim() : null;

  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: toSubject(payload),
        body: {
          contentType: 'Text',
          content: toTextBody(payload, senderName, publicSiteUrl),
        },
        toRecipients: [
          {
            emailAddress: {
              address: payload.candidateEmail,
            },
          },
        ],
        ...(replyToEmail
          ? {
              replyTo: [
                {
                  emailAddress: {
                    address: replyToEmail,
                    name: toDisplayName(payload.recruiterName, senderName),
                  },
                },
              ],
            }
          : {}),
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Microsoft Graph sendMail failed (${response.status}): ${detail || response.statusText}`);
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return json({ error: 'Missing bearer token' }, 401);
    }

    const supabaseUrl = getEnv('SUPABASE_URL');
    const anonKey = getEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    const authClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return json({ error: `Unauthorized caller: ${authError?.message || 'No user found.'}` }, 401);
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role, full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      return json({ error: `Could not resolve caller profile: ${profileError.message}` }, 500);
    }

    if (!profile || (profile.role !== 'recruiter' && profile.role !== 'admin')) {
      return json({ error: 'Only recruiters and admins can send recruiter invite emails.' }, 403);
    }

    const payload = (await req.json()) as InvitePayload;
    if (!payload?.candidateEmail || !payload?.jobId || !payload?.jobTitle || !payload?.invitationType) {
      return json({ error: 'Missing required email payload fields.' }, 400);
    }

    await sendEmailViaGraph(payload, profile.full_name || profile.email || 'PeakTalent');

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown edge function error.';
    return json({ error: message }, 500);
  }
});
