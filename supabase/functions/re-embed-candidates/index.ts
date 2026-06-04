// Bulk re-embed Edge Function
// Run manually whenever EMBEDDING_MODEL_ID or EMBEDDING_VERSION changes.
// Reads all candidate rows whose embedding_version doesn't match the current
// version, recomputes their vector via Gemini Embedding API, and updates the DB.
//
// Security: admin-only (service-role key or admin JWT).
// POST /functions/v1/re-embed-candidates
// Optional body: { batchSize?: number, dryRun?: boolean }

import { createClient } from 'jsr:@supabase/supabase-js@2';

const EMBEDDING_MODEL_ID = 'models/gemini-embedding-2-preview';
const EMBEDDING_VERSION  = 'v2.3.0'; // Keep in sync with embeddingService.ts
const EMBEDDING_DIMS     = 3072;

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

const getGeminiKey = () => {
  const key = Deno.env.get('GEMINI_API_KEY')?.trim() || Deno.env.get('GOOGLE_AI_API_KEY')?.trim();
  if (!key) throw new Error('Missing Gemini API key (GEMINI_API_KEY or GOOGLE_AI_API_KEY)');
  return key;
};

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL_ID}:embedContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL_ID,
      content: { parts: [{ text }], role: 'user' },
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: EMBEDDING_DIMS,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini embedding failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  const values: number[] = data?.embedding?.values ?? [];
  if (values.length === 0) throw new Error('Empty embedding returned');

  const trimmed = values.slice(0, EMBEDDING_DIMS);
  if (trimmed.length < EMBEDDING_DIMS) {
    return [...trimmed, ...new Array(EMBEDDING_DIMS - trimmed.length).fill(0)];
  }
  return trimmed;
}

function buildCanonicalText(content: any): string {
  // Minimal canonical text from stored content — mirrors buildCandidateCanonicalText logic
  const parts: string[] = [];
  const p = content?.personal_info;
  if (p?.first_name || p?.last_name) parts.push(`${p.first_name || ''} ${p.last_name || ''}`.trim());
  if (content?.current_seniority_level) parts.push(content.current_seniority_level);
  if (content?.current_job_function) parts.push(content.current_job_function);
  if (content?.total_years_experience) parts.push(`${content.total_years_experience} years experience`);
  if (content?.summary_text) parts.push(content.summary_text.slice(0, 500));
  if (content?.canonical_career_text) parts.push(content.canonical_career_text.slice(0, 800));
  const skills = [...(content?.skills ?? []), ...(content?.it_skills ?? [])]
    .slice(0, 20)
    .map((s: any) => s.skill_name)
    .filter(Boolean);
  if (skills.length) parts.push(skills.join(', '));
  if (Array.isArray(content?.industry_experience)) parts.push(content.industry_experience.join(', '));
  return parts.join(' | ').trim() || 'candidate profile';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authorization = req.headers.get('Authorization') || '';
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl     = getEnv('SUPABASE_URL');

    // Require service-role key or admin JWT
    const isServiceRole = authorization === `Bearer ${serviceRoleKey}`;
    if (!isServiceRole) {
      const anonKey   = getEnv('SUPABASE_ANON_KEY');
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
        .from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile?.role !== 'admin') return json({ error: 'Forbidden — admins only' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const batchSize: number = Math.min(body?.batchSize ?? 50, 200);
    const dryRun: boolean   = body?.dryRun === true;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const geminiKey = getGeminiKey();

    // Fetch candidates whose embedding version is outdated or missing
    // embedding_version is stored inside the content JSONB
    const { data: rows, error: fetchError } = await adminClient
      .from('candidates')
      .select('id, user_id, content, embedding')
      .limit(batchSize);

    if (fetchError) throw fetchError;
    if (!rows || rows.length === 0) return json({ success: true, processed: 0, skipped: 0 });

    const toProcess = rows.filter(row => {
      const c = row.content as any;
      // Skip if matching_consent is explicitly false
      if (c?.matching_consent === false) return false;
      // Process if version is missing or outdated
      return !c?.embedding_version || c.embedding_version !== EMBEDDING_VERSION;
    });

    if (dryRun) {
      return json({
        success: true,
        dryRun: true,
        wouldProcess: toProcess.length,
        skipped: rows.length - toProcess.length,
      });
    }

    let processed = 0;
    let failed = 0;

    for (const row of toProcess) {
      try {
        const content = row.content as any;
        const canonicalText = buildCanonicalText(content);
        const vector = await getEmbedding(canonicalText, geminiKey);

        const updatedContent = {
          ...content,
          embedding_vector: vector,
          embedding_model: EMBEDDING_MODEL_ID,
          embedding_version: EMBEDDING_VERSION,
          embedding_updated_at: new Date().toISOString(),
        };

        await adminClient
          .from('candidates')
          .update({ content: updatedContent, embedding: vector })
          .eq('id', row.id);

        processed++;

        // Respect Gemini rate limits — small delay between calls
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error(`Failed to re-embed candidate ${row.id}:`, err);
        failed++;
      }
    }

    return json({
      success: true,
      processed,
      failed,
      skipped: rows.length - toProcess.length,
      note: processed < batchSize
        ? 'All outdated candidates processed.'
        : `Batch limit reached. Run again to process remaining candidates.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('re-embed-candidates error:', message);
    return json({ error: message }, 500);
  }
});
