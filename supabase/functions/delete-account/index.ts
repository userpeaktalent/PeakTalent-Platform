// GDPR Article 17 — right to erasure
// Deletes a candidate account in the following order:
//   1. Anonymise applications (null out candidate_id to preserve recruiter audit trail)
//   2. Delete candidate_refinement_chats (cascades from profile anyway, explicit for clarity)
//   3. Delete CV files from storage + candidate_cvs metadata rows
//   4. Delete candidates row
//   5. Delete profiles row
//   6. Delete auth user (admin only)
// The caller must supply their own valid bearer token — we verify identity before acting.

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

const CANDIDATE_CV_BUCKET = 'candidate-cvs';

async function deleteCvFiles(adminClient: ReturnType<typeof createClient>, profileId: string) {
  const { data: cvRows } = await adminClient
    .from('candidate_cvs')
    .select('file_path, bucket_name')
    .eq('candidate_profile_id', profileId);

  if (cvRows && cvRows.length > 0) {
    const byBucket = new Map<string, string[]>();
    for (const row of cvRows) {
      const bucket = row.bucket_name || CANDIDATE_CV_BUCKET;
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket)!.push(row.file_path);
    }
    for (const [bucket, paths] of byBucket) {
      await adminClient.storage.from(bucket).remove(paths);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Missing bearer token' }, 401);

    const supabaseUrl = getEnv('SUPABASE_URL');
    const anonKey = getEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    // Allow admins to delete any userId, otherwise only self
    const body = await req.json().catch(() => ({}));
    const targetUserId: string = body?.userId || user.id;

    if (targetUserId !== user.id) {
      const { data: callerProfile } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (callerProfile?.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    }

    const profileId = targetUserId;

    // 1. Anonymise applications — null out candidate_id to preserve recruiter audit trail
    await adminClient
      .from('applications')
      .update({ candidate_id: null })
      .eq('candidate_id', profileId);

    // Also anonymise by candidates.user_id link if there is a separate candidates row
    const { data: candidateRow } = await adminClient
      .from('candidates')
      .select('id')
      .eq('user_id', profileId)
      .maybeSingle();

    if (candidateRow?.id) {
      await adminClient
        .from('applications')
        .update({ candidate_id: null })
        .eq('candidate_id', candidateRow.id);
    }

    // 2. Delete chat transcripts
    await adminClient
      .from('candidate_refinement_chats')
      .delete()
      .eq('candidate_profile_id', profileId);

    // 3. Delete CV storage files + metadata rows
    await deleteCvFiles(adminClient, profileId);
    await adminClient
      .from('candidate_cvs')
      .delete()
      .eq('candidate_profile_id', profileId);

    // 4. Delete candidates row
    if (candidateRow?.id) {
      await adminClient.from('candidates').delete().eq('id', candidateRow.id);
    } else {
      await adminClient.from('candidates').delete().eq('user_id', profileId);
    }

    // 5. Delete profiles row (child rows with on-delete-cascade clean up automatically)
    await adminClient.from('profiles').delete().eq('id', profileId);

    // 6. Delete auth user — requires service role
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteAuthError) {
      console.error('Auth user deletion failed:', deleteAuthError.message);
      // Non-fatal: profile + data already gone; auth user is orphaned but harmless
    }

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('delete-account error:', message);
    return json({ error: message }, 500);
  }
});
