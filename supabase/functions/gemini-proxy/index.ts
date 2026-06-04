import { createClient } from 'jsr:@supabase/supabase-js@2';

type Action = 'generate' | 'stream' | 'embed';
type Payload = { action: Action; model: string; body: unknown; purpose?: string };
type ProviderSlot = 'primary' | 'fallback';
type ActivityActor = {
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  effectiveProfileId: string | null;
  effectiveEmail: string | null;
  effectiveRole: string | null;
  effectiveName: string | null;
  isImpersonating: boolean;
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } });

const base = 'https://generativelanguage.googleapis.com/v1beta/models';
const endpoints: Record<Action, string> = { generate: 'generateContent', stream: 'streamGenerateContent', embed: 'embedContent' };
const FLASH_COOLDOWN_MIN_MS = 30_000;
const FLASH_COOLDOWN_MAX_MS = 60_000;
const modelCooldowns = new Map<string, number>();

const isAllowedModel = (raw: string) => {
  if (typeof raw !== 'string' || raw.length > 128) return false;
  const stripped = raw.replace(/^models\//, '');
  return /^gemini-[a-z0-9.\-]+$/i.test(stripped) || /^text-embedding-[a-z0-9.\-]+$/i.test(stripped);
};

const required = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
};

const optional = (name: string) => Deno.env.get(name)?.trim() || '';

const shouldRetryOnFallback = (status: number, text: string) => {
  if (status === 429 || status >= 500) return true;
  const lower = text.toLowerCase();
  return lower.includes('resource_exhausted') || lower.includes('spending cap') || lower.includes('quota') || lower.includes('rate limit');
};

const truncate = (value: string, max = 500) => (value.length > max ? `${value.slice(0, max)}...` : value);

const parseRetryDelayMs = (text: string, retryAfterHeader?: string | null): number | undefined => {
  const headerValue = Number(retryAfterHeader || '');
  if (Number.isFinite(headerValue) && headerValue > 0) {
    return Math.min(FLASH_COOLDOWN_MAX_MS, Math.max(FLASH_COOLDOWN_MIN_MS, headerValue * 1000));
  }

  const retryMatch = text.match(/retry\s+in\s+([0-9.]+)\s*(ms|s|sec|seconds)?/i);
  if (!retryMatch) return undefined;

  const amount = Number(retryMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const unit = (retryMatch[2] || 's').toLowerCase();
  const milliseconds = unit === 'ms' ? amount : amount * 1000;
  return Math.min(FLASH_COOLDOWN_MAX_MS, Math.max(FLASH_COOLDOWN_MIN_MS, Math.ceil(milliseconds)));
};

const retryAfterSeconds = (retryAfterMs?: number) => {
  if (!retryAfterMs) return undefined;
  return String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
};

const getModelCandidates = (model: string, action: Action): string[] => {
  const normalized = model.replace(/^models\//, '');
  if (action === 'embed') return [normalized];
  if (normalized === 'gemini-2.5-flash') return ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  if (normalized === 'gemini-2.0-flash') return ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  return [normalized];
};

const cooldownKey = (slot: ProviderSlot, action: Action, model: string) => `${slot}:${action}:${model}`;

const getCooldownRemainingMs = (slot: ProviderSlot, action: Action, model: string) => {
  const until = modelCooldowns.get(cooldownKey(slot, action, model)) || 0;
  const remaining = until - Date.now();
  if (remaining <= 0) {
    modelCooldowns.delete(cooldownKey(slot, action, model));
    return 0;
  }
  return remaining;
};

const setModelCooldown = (slot: ProviderSlot, action: Action, model: string, retryAfterMs?: number) => {
  const cooldownMs = Math.min(
    FLASH_COOLDOWN_MAX_MS,
    Math.max(FLASH_COOLDOWN_MIN_MS, retryAfterMs || FLASH_COOLDOWN_MAX_MS)
  );
  modelCooldowns.set(cooldownKey(slot, action, model), Date.now() + cooldownMs);
  return cooldownMs;
};

const buildSupabaseClients = (authorization: string | null) => {
  const supabaseUrl = optional('SUPABASE_URL');
  const anonKey = optional('SUPABASE_ANON_KEY');
  const serviceRoleKey = optional('SUPABASE_SERVICE_ROLE_KEY');

  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return null;
  }

  return {
    authClient: createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    adminClient: createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
};

const resolveActor = async (authorization: string | null): Promise<{ adminClient: ReturnType<typeof createClient> | null; actor: ActivityActor | null }> => {
  const clients = buildSupabaseClients(authorization);
  if (!clients) return { adminClient: null, actor: null };

  try {
    const {
      data: { user },
    } = await clients.authClient.auth.getUser();

    if (!user?.id) {
      return { adminClient: clients.adminClient, actor: null };
    }

    const { data: profile } = await clients.adminClient
      .from('profiles')
      .select('role, email, full_name')
      .eq('id', user.id)
      .maybeSingle();

    return {
      adminClient: clients.adminClient,
      actor: {
        actorUserId: user.id,
        actorEmail: profile?.email?.trim() || user.email?.trim() || null,
        actorRole: profile?.role || null,
        effectiveProfileId: user.id,
        effectiveEmail: profile?.email?.trim() || user.email?.trim() || null,
        effectiveRole: profile?.role || null,
        effectiveName: profile?.full_name?.trim() || null,
        isImpersonating: false,
      },
    };
  } catch {
    return { adminClient: clients.adminClient, actor: null };
  }
};

const insertActivityLog = async (
  adminClient: ReturnType<typeof createClient> | null,
  actor: ActivityActor | null,
  input: {
    status: 'success' | 'error';
    action: Action;
    model: string;
    providerSlot: 'primary' | 'fallback';
    purpose: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }
) => {
  if (!adminClient) return;

  try {
    await adminClient.from('activity_logs').insert({
      actor_user_id: actor?.actorUserId ?? null,
      actor_email: actor?.actorEmail ?? null,
      actor_role: actor?.actorRole ?? null,
      effective_profile_id: actor?.effectiveProfileId ?? null,
      effective_email: actor?.effectiveEmail ?? null,
      effective_role: actor?.effectiveRole ?? null,
      effective_name: actor?.effectiveName ?? null,
      is_impersonating: actor?.isImpersonating ?? false,
      event_type: 'gemini_call',
      status: input.status,
      source: 'gemini-proxy',
      function_name: 'gemini-proxy',
      purpose: input.purpose,
      model_id: input.model,
      provider_slot: input.providerSlot,
      summary: input.summary,
      metadata: input.metadata || {},
    });
  } catch (error) {
    console.warn('[gemini-proxy] Activity log insert failed:', error);
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const primary = required('GEMINI_API_KEY');
    const fallback = optional('GEMINI_API_KEY_FALLBACK');
    const keys = fallback && fallback !== primary ? [['primary', primary], ['fallback', fallback]] as const : [['primary', primary]] as const;

    let payload: Payload;
    try {
      payload = await req.json() as Payload;
    } catch {
      return json({ error: 'Body must be valid JSON' }, 400);
    }

    if (!payload?.action || !(payload.action in endpoints)) return json({ error: 'Invalid action' }, 400);
    if (!payload.model || !isAllowedModel(payload.model)) return json({ error: 'Invalid or disallowed model id' }, 400);
    if (payload.body === undefined || payload.body === null) return json({ error: 'Missing Gemini request body' }, 400);

    const { adminClient, actor } = await resolveActor(req.headers.get('Authorization'));
    const model = payload.model.replace(/^models\//, '');
    const modelCandidates = getModelCandidates(model, payload.action);
    const purpose = payload.purpose?.trim() || `${payload.action}_request`;
    const endpoint = endpoints[payload.action];
    const suffix = payload.action === 'stream' ? '&alt=sse' : '';
    const requestBody = JSON.stringify(payload.body);

    let lastStatus = 500;
    let lastBody = JSON.stringify({ error: 'Gemini proxy request failed.' });
    let lastType = 'application/json';
    let lastSlot: ProviderSlot = 'primary';
    let lastModel = model;
    let lastRetryAfterMs: number | undefined;
    let retryMetadata: Record<string, unknown> = {
      requested_model: model,
      model_candidates: modelCandidates,
    };

    for (const [label, key] of keys) {
      const slot = label as ProviderSlot;

      for (const candidateModel of modelCandidates) {
        const cooldownRemainingMs = getCooldownRemainingMs(slot, payload.action, candidateModel);
        if (cooldownRemainingMs > 0) {
          lastStatus = 429;
          lastSlot = slot;
          lastModel = candidateModel;
          lastRetryAfterMs = cooldownRemainingMs;
          lastBody = JSON.stringify({
            error: `Gemini model ${candidateModel} is cooling down after a quota/rate-limit response.`,
            retry_after_ms: cooldownRemainingMs,
          });
          retryMetadata = {
            ...retryMetadata,
            cooldown_skips: [
              ...((retryMetadata.cooldown_skips as unknown[]) || []),
              { provider_slot: slot, model: candidateModel, retry_after_ms: cooldownRemainingMs },
            ],
          };
          continue;
        }

        const url = `${base}/${candidateModel}:${endpoint}?key=${encodeURIComponent(key)}${suffix}`;
        const upstream = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody });

        if (payload.action === 'stream' && upstream.ok) {
          await insertActivityLog(adminClient, actor, {
            status: 'success',
            action: payload.action,
            model: candidateModel,
            providerSlot: slot,
            purpose,
            summary: `Started Gemini stream for ${purpose} via ${slot}.`,
            metadata: {
              ...retryMetadata,
              used_model: candidateModel,
            },
          });

          return new Response(upstream.body, {
            status: upstream.status,
            headers: {
              ...cors,
              'Content-Type': upstream.headers.get('content-type') || 'text/event-stream',
              'Cache-Control': 'no-cache',
              'X-Gemini-Key-Source': slot,
              'X-Gemini-Model-Used': candidateModel,
            },
          });
        }

        const text = await upstream.text().catch(() => '');
        lastStatus = upstream.status;
        lastBody = text || lastBody;
        lastType = upstream.headers.get('content-type') || 'application/json';
        lastSlot = slot;
        lastModel = candidateModel;
        lastRetryAfterMs = parseRetryDelayMs(text, upstream.headers.get('Retry-After'));

        if (upstream.ok) {
          await insertActivityLog(adminClient, actor, {
            status: 'success',
            action: payload.action,
            model: candidateModel,
            providerSlot: slot,
            purpose,
            summary: `Completed Gemini ${payload.action} for ${purpose} via ${slot}.`,
            metadata: {
              ...retryMetadata,
              used_model: candidateModel,
            },
          });

          return new Response(text, {
            status: upstream.status,
            headers: {
              ...cors,
              'Content-Type': lastType,
              'X-Gemini-Key-Source': slot,
              'X-Gemini-Model-Used': candidateModel,
            },
          });
        }

        const retryable = shouldRetryOnFallback(upstream.status, text);
        if (retryable) {
          const cooldownMs = setModelCooldown(slot, payload.action, candidateModel, lastRetryAfterMs);
          lastRetryAfterMs = cooldownMs;
          retryMetadata = {
            ...retryMetadata,
            retried_failures: [
              ...((retryMetadata.retried_failures as unknown[]) || []),
              {
                provider_slot: slot,
                model: candidateModel,
                status_code: upstream.status,
                retry_after_ms: cooldownMs,
                error_message: truncate(text),
              },
            ],
          };
          continue;
        }

        await insertActivityLog(adminClient, actor, {
          status: 'error',
          action: payload.action,
          model: candidateModel,
          providerSlot: slot,
          purpose,
          summary: `Gemini ${payload.action} failed for ${purpose} via ${slot}.`,
          metadata: {
            ...retryMetadata,
            status_code: upstream.status,
            error_message: truncate(text),
          },
        });

        return new Response(lastBody, {
          status: lastStatus,
          headers: {
            ...cors,
            'Content-Type': lastType,
            'X-Gemini-Key-Source': slot,
            'X-Gemini-Model-Used': candidateModel,
          },
        });
      }
    }

    await insertActivityLog(adminClient, actor, {
      status: 'error',
      action: payload.action,
      model: lastModel,
      providerSlot: lastSlot,
      purpose,
      summary: `Gemini ${payload.action} failed for ${purpose}.`,
      metadata: {
        ...retryMetadata,
        status_code: lastStatus,
        error_message: truncate(lastBody),
      },
    });

    return new Response(lastBody, {
      status: lastStatus,
      headers: {
        ...cors,
        'Content-Type': lastType,
        'X-Gemini-Key-Source': lastSlot,
        'X-Gemini-Model-Used': lastModel,
        ...(lastRetryAfterMs ? { 'Retry-After': retryAfterSeconds(lastRetryAfterMs)! } : {}),
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown proxy error.' }, 500);
  }
});
