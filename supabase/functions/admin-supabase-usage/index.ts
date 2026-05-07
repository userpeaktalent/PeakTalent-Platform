import { createClient } from 'jsr:@supabase/supabase-js@2';

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

const getManagementToken = () => {
  const preferred = Deno.env.get('PEAKTALENT_SUPABASE_MANAGEMENT_TOKEN')?.trim();
  if (preferred) return preferred;

  const legacy = Deno.env.get('SUPABASE_MANAGEMENT_TOKEN')?.trim();
  if (legacy) return legacy;

  throw new Error('Missing required secret: PEAKTALENT_SUPABASE_MANAGEMENT_TOKEN');
};

const getProjectRefFromUrl = (supabaseUrl: string) => {
  const match = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co/i);
  if (!match?.[1]) {
    throw new Error('Could not derive Supabase project ref from SUPABASE_URL.');
  }
  return match[1];
};

const fetchManagementJson = async <T>(path: string, token: string): Promise<T> => {
  const response = await fetch(`https://api.supabase.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const raw = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`Supabase management API error (${response.status}): ${raw || response.statusText}`);
  }

  return raw ? JSON.parse(raw) as T : ({} as T);
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
    const managementToken = getManagementToken();
    const projectRef = getProjectRefFromUrl(supabaseUrl);

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
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      return json({ error: `Could not resolve caller profile: ${profileError.message}` }, 500);
    }

    if (!profile || profile.role !== 'admin') {
      return json({ error: 'Only admins can inspect Supabase management metrics.' }, 403);
    }

    type DiskConfigResponse = {
      attributes?: {
        size_gb?: number;
      };
    };

    type ApiRequestResponse = {
      result?: Array<{ count?: number }>;
    };

    const [diskConfig, apiRequestCount] = await Promise.all([
      fetchManagementJson<DiskConfigResponse>(`/v1/projects/${projectRef}/config/disk`, managementToken),
      fetchManagementJson<ApiRequestResponse>(`/v1/projects/${projectRef}/analytics/endpoints/usage.api-requests-count`, managementToken),
    ]);

    return json({
      databaseLimitBytes: typeof diskConfig.attributes?.size_gb === 'number'
        ? Math.round(diskConfig.attributes.size_gb * 1024 * 1024 * 1024)
        : null,
      apiRequestsUsed: typeof apiRequestCount.result?.[0]?.count === 'number'
        ? apiRequestCount.result[0].count
        : null,
      apiRequestsAvailable: typeof apiRequestCount.result?.[0]?.count === 'number',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown edge function error.';
    return json({ error: message }, 500);
  }
});
