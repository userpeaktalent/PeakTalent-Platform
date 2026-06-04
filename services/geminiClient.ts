/**
 * SDK-compatible shim that routes every Gemini call through the
 * `gemini-proxy` Supabase Edge Function. The Gemini API key never reaches
 * the browser bundle.
 *
 * Surface mimics the slice of `@google/generative-ai` that the app actually
 * uses: `getGenerativeModel({ model, ... }).generateContent(prompt)`,
 * `.startChat({ history }).sendMessageStream(message)`, and `.embedContent(...)`.
 *
 * The wire format between this client and the edge function is a thin
 * envelope around Gemini's REST body so changes to Gemini's schema do not
 * require redeploying the edge function.
 */

import { supabase } from './supabaseClient';

type ProxyAction = 'generate' | 'stream' | 'embed';

interface ProxyEnvelope {
  action: ProxyAction;
  model: string;
  body: unknown;
  purpose?: string;
}

interface UsageMetadata {
  totalTokenCount?: number;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  inlineData?: { mimeType: string; data: string };
}

interface GeminiContent {
  role?: 'user' | 'model' | 'system';
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: UsageMetadata;
}

export interface GenerationConfig {
  responseMimeType?: string;
  responseSchema?: unknown;
  temperature?: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
}

export interface GenerativeModelInit {
  model: string;
  systemInstruction?: string;
  generationConfig?: GenerationConfig;
  purpose?: string;
}

interface GenerateContentRequest {
  contents: GeminiContent[];
  generationConfig?: GenerationConfig;
  systemInstruction?: { parts: { text: string }[] };
}

const PROXY_FUNCTION_NAME = 'gemini-proxy';
const SAFE_GENERATION_CACHE_PURPOSES = new Set([
  'technical_test_generation',
  'single_question_regeneration',
]);
const SAFE_GENERATION_CACHE_TTL_MS = 60 * 60 * 1000;
const CLIENT_FLASH_COOLDOWN_MS = 60 * 1000;
const CLIENT_COOLDOWN_KEY = 'peaktalent.gemini_client_cooldowns';

type CachedProxyResponse = {
  createdAt: number;
  status: number;
  headers: Record<string, string>;
  bodyText: string;
};

const inFlightProxyRequests = new Map<string, Promise<CachedProxyResponse>>();

export class GeminiProxyError extends Error {
  status: number;
  retryAfterMs?: number;

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'GeminiProxyError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const isSafeCacheableGeneration = (envelope: ProxyEnvelope) =>
  envelope.action === 'generate' &&
  Boolean(envelope.purpose && SAFE_GENERATION_CACHE_PURPOSES.has(envelope.purpose));

const getCacheKey = (envelope: ProxyEnvelope) =>
  `peaktalent.gemini_cache.${hashString(stableStringify(envelope))}`;

const readCachedProxyResponse = (envelope: ProxyEnvelope): CachedProxyResponse | null => {
  if (typeof window === 'undefined' || !isSafeCacheableGeneration(envelope)) return null;

  try {
    const raw = window.sessionStorage.getItem(getCacheKey(envelope));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedProxyResponse;
    if (!parsed?.bodyText || Date.now() - parsed.createdAt > SAFE_GENERATION_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(getCacheKey(envelope));
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const writeCachedProxyResponse = (envelope: ProxyEnvelope, response: CachedProxyResponse) => {
  if (typeof window === 'undefined' || !isSafeCacheableGeneration(envelope) || response.status < 200 || response.status >= 300) {
    return;
  }

  try {
    window.sessionStorage.setItem(getCacheKey(envelope), JSON.stringify(response));
  } catch {
    // Cache is opportunistic. Quota/privacy browser errors should never break AI calls.
  }
};

const headersToObject = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const responseFromSnapshot = (snapshot: CachedProxyResponse) =>
  new Response(snapshot.bodyText, {
    status: snapshot.status,
    headers: snapshot.headers,
  });

const parseRetryDelayMs = (bodyText: string, retryAfterHeader?: string | null): number | undefined => {
  const headerValue = Number(retryAfterHeader || '');
  if (Number.isFinite(headerValue) && headerValue > 0) {
    return Math.min(60_000, Math.max(1_000, headerValue * 1000));
  }

  const retryMatch = bodyText.match(/retry\s+in\s+([0-9.]+)\s*(ms|s|sec|seconds)?/i);
  if (!retryMatch) return undefined;

  const amount = Number(retryMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const unit = (retryMatch[2] || 's').toLowerCase();
  const milliseconds = unit === 'ms' ? amount : amount * 1000;
  return Math.min(60_000, Math.max(1_000, Math.ceil(milliseconds)));
};

const readClientCooldowns = (): Record<string, number> => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(CLIENT_COOLDOWN_KEY) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
};

const getClientCooldownUntil = (model: string): number => readClientCooldowns()[model] || 0;

const setClientCooldown = (model: string, retryAfterMs?: number) => {
  if (typeof window === 'undefined') return;
  const cooldowns = readClientCooldowns();
  cooldowns[model] = Date.now() + Math.max(CLIENT_FLASH_COOLDOWN_MS, retryAfterMs || 0);
  try {
    window.sessionStorage.setItem(CLIENT_COOLDOWN_KEY, JSON.stringify(cooldowns));
  } catch {
    // Ignore storage failures.
  }
};

const resolveClientModel = (model: string, action: ProxyAction): string => {
  if ((action === 'generate' || action === 'stream') && model === 'gemini-2.5-flash' && getClientCooldownUntil(model) > Date.now()) {
    return 'gemini-2.5-flash-lite';
  }
  return model;
};

const getProxyEndpoint = (): string => {
  const projectRef = (import.meta.env.VITE_SUPABASE_PROJECT_REF as string | undefined)?.trim();
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();

  if (supabaseUrl) {
    return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${PROXY_FUNCTION_NAME}`;
  }
  if (projectRef) {
    return `https://${projectRef}.supabase.co/functions/v1/${PROXY_FUNCTION_NAME}`;
  }
  throw new Error('Cannot resolve Supabase URL for gemini-proxy. Set VITE_SUPABASE_URL.');
};

const getAuthHeader = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Could not load session for Gemini proxy: ${error.message}`);
  const token = data.session?.access_token;
  if (!token) throw new Error('You must be signed in to use AI features.');
  return `Bearer ${token}`;
};

const callProxy = async (envelope: ProxyEnvelope, signal?: AbortSignal): Promise<Response> => {
  const resolvedEnvelope: ProxyEnvelope = {
    ...envelope,
    model: resolveClientModel(envelope.model, envelope.action),
  };
  const auth = await getAuthHeader();

  if (resolvedEnvelope.action === 'stream') {
    const response = await fetch(getProxyEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resolvedEnvelope),
      signal,
    });

    if (response.ok) return response;

    const bodyText = await response.text().catch(() => '');
    const retryAfterMs = parseRetryDelayMs(bodyText, response.headers.get('Retry-After'));
    if (response.status === 429 || response.status === 503) {
      setClientCooldown(resolvedEnvelope.model, retryAfterMs);
    }
    return responseFromSnapshot({
      createdAt: Date.now(),
      status: response.status,
      headers: headersToObject(response.headers),
      bodyText,
    });
  }

  const cached = readCachedProxyResponse(resolvedEnvelope);
  if (cached) return responseFromSnapshot(cached);

  const requestKey = isSafeCacheableGeneration(resolvedEnvelope) ? getCacheKey(resolvedEnvelope) : '';
  if (requestKey && inFlightProxyRequests.has(requestKey)) {
    const snapshot = await inFlightProxyRequests.get(requestKey)!;
    return responseFromSnapshot(snapshot);
  }

  const request = fetch(getProxyEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(resolvedEnvelope),
    signal,
  }).then(async (response): Promise<CachedProxyResponse> => {
    const bodyText = await response.text().catch(() => '');
    const retryAfterMs = parseRetryDelayMs(bodyText, response.headers.get('Retry-After'));
    if (!response.ok && (response.status === 429 || response.status === 503)) {
      setClientCooldown(resolvedEnvelope.model, retryAfterMs);
    }

    const snapshot: CachedProxyResponse = {
      createdAt: Date.now(),
      status: response.status,
      headers: headersToObject(response.headers),
      bodyText,
    };
    writeCachedProxyResponse(resolvedEnvelope, snapshot);
    return snapshot;
  });

  if (requestKey) {
    inFlightProxyRequests.set(requestKey, request);
  }

  try {
    const snapshot = await request;
    return responseFromSnapshot(snapshot);
  } finally {
    if (requestKey) {
      inFlightProxyRequests.delete(requestKey);
    }
  }
};

const ensureOk = async (response: Response, contextLabel: string): Promise<void> => {
  if (response.ok) return;
  const text = await response.text().catch(() => '');
  const retryAfterMs = parseRetryDelayMs(text, response.headers.get('Retry-After'));
  throw new GeminiProxyError(
    `[${contextLabel}] Gemini proxy ${response.status}: ${text || response.statusText}`,
    response.status,
    retryAfterMs
  );
};

const promptToContents = (prompt: string | GenerateContentRequest): GenerateContentRequest => {
  if (typeof prompt === 'string') {
    return {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };
  }
  return prompt;
};

const buildBody = (
  init: GenerativeModelInit,
  prompt: string | GenerateContentRequest
): GenerateContentRequest => {
  const baseRequest = promptToContents(prompt);
  const body: GenerateContentRequest = { ...baseRequest };

  if (init.generationConfig && !body.generationConfig) {
    body.generationConfig = init.generationConfig;
  }

  if (init.systemInstruction && !body.systemInstruction) {
    body.systemInstruction = { parts: [{ text: init.systemInstruction }] };
  }

  return body;
};

const extractText = (response: GeminiResponse): string => {
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
};

export interface GenerateContentResult {
  response: {
    text: () => string;
    usageMetadata?: UsageMetadata;
    raw: GeminiResponse;
  };
}

export interface StreamChunk {
  text: () => string;
  raw: GeminiResponse;
}

export interface ChatSessionInit {
  history?: GeminiContent[];
}

export interface GenerativeModel {
  model: string;
  generateContent: (
    prompt: string | GenerateContentRequest,
    signal?: AbortSignal
  ) => Promise<GenerateContentResult>;
  startChat: (init?: ChatSessionInit) => ChatSession;
  embedContent: (request: EmbedContentRequest, signal?: AbortSignal) => Promise<EmbedContentResponse>;
}

export interface EmbedContentRequest {
  content: GeminiContent;
  taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY' | string;
  outputDimensionality?: number;
}

export interface EmbedContentResponse {
  embedding: { values: number[] };
}

export interface ChatSession {
  sendMessage: (message: string, signal?: AbortSignal) => Promise<GenerateContentResult>;
  sendMessageStream: (
    message: string,
    signal?: AbortSignal
  ) => Promise<{ stream: AsyncIterable<StreamChunk>; response: Promise<GenerateContentResult['response']> }>;
}

const parseSseChunk = (raw: string): GeminiResponse | null => {
  // An SSE event can have multiple `data:` lines; concatenate them per spec.
  // Lines that don't start with `data:` (e.g. `event:`, `:` comments) are
  // ignored — Gemini's `?alt=sse` only uses `data:` but we stay tolerant.
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const dataParts: string[] = [];
  for (const line of trimmed.split('\n')) {
    const ltrimmed = line.replace(/^\s+/, '');
    if (ltrimmed.startsWith('data:')) {
      dataParts.push(ltrimmed.slice(5).trimStart());
    }
  }
  const payload = (dataParts.length ? dataParts.join('\n') : trimmed).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    return JSON.parse(payload) as GeminiResponse;
  } catch {
    return null;
  }
};

const SSE_SEPARATOR_RE = /\r?\n\r?\n/;

async function* iterateSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncIterable<StreamChunk> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line. Tolerate both \n\n and \r\n\r\n
    // because some proxies/CDNs rewrite line endings on the way back.
    while (true) {
      const match = SSE_SEPARATOR_RE.exec(buffer);
      if (!match) break;
      const rawEvent = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const parsed = parseSseChunk(rawEvent);
      if (!parsed) continue;
      yield {
        text: () => extractText(parsed),
        raw: parsed,
      };
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseChunk(buffer);
    if (parsed) {
      yield {
        text: () => extractText(parsed),
        raw: parsed,
      };
    }
  }
}

export const getGenerativeModel = (init: GenerativeModelInit): GenerativeModel => {
  const generateContent = async (
    prompt: string | GenerateContentRequest,
    signal?: AbortSignal
  ): Promise<GenerateContentResult> => {
    const body = buildBody(init, prompt);
    const response = await callProxy({ action: 'generate', model: init.model, body, purpose: init.purpose }, signal);
    await ensureOk(response, `${init.model}:generateContent`);
    const json = (await response.json()) as GeminiResponse;
    return {
      response: {
        text: () => extractText(json),
        usageMetadata: json.usageMetadata,
        raw: json,
      },
    };
  };

  const startChat = (chatInit?: ChatSessionInit): ChatSession => {
    const history: GeminiContent[] = chatInit?.history ? [...chatInit.history] : [];

    const buildChatBody = (message: string): GenerateContentRequest => {
      const userTurn: GeminiContent = { role: 'user', parts: [{ text: message }] };
      return buildBody(init, {
        contents: [...history, userTurn],
      });
    };

    return {
      sendMessage: async (message, signal) => {
        const body = buildChatBody(message);
        const response = await callProxy({ action: 'generate', model: init.model, body, purpose: init.purpose }, signal);
        await ensureOk(response, `${init.model}:chat.sendMessage`);
        const json = (await response.json()) as GeminiResponse;
        const replyText = extractText(json);
        history.push({ role: 'user', parts: [{ text: message }] });
        if (replyText) history.push({ role: 'model', parts: [{ text: replyText }] });
        return {
          response: {
            text: () => replyText,
            usageMetadata: json.usageMetadata,
            raw: json,
          },
        };
      },
      sendMessageStream: async (message, signal) => {
        const body = buildChatBody(message);
        const response = await callProxy({ action: 'stream', model: init.model, body, purpose: init.purpose }, signal);
        await ensureOk(response, `${init.model}:chat.sendMessageStream`);
        if (!response.body) {
          throw new Error('Gemini proxy returned no streaming body.');
        }
        const reader = response.body.getReader();
        let aggregated = '';
        let lastUsage: UsageMetadata | undefined;
        let iterationDone = false;
        let doneResolvers: Array<(v: GenerateContentResult['response']) => void> = [];
        let started = false;

        // The stream object can only be iterated once: we hand a single iterator
        // to the caller and resolve `response` when that iteration completes.
        // If we ever started a second iterator (e.g. by draining for response),
        // both iterators would race for chunks from the same reader and the
        // visible text would arrive scrambled / truncated.
        const finalize = () => {
          if (iterationDone) return;
          iterationDone = true;
          history.push({ role: 'user', parts: [{ text: message }] });
          if (aggregated) history.push({ role: 'model', parts: [{ text: aggregated }] });
          const final: GenerateContentResult['response'] = {
            text: () => aggregated,
            usageMetadata: lastUsage,
            raw: {} as GeminiResponse,
          };
          const resolvers = doneResolvers;
          doneResolvers = [];
          resolvers.forEach((r) => r(final));
        };

        const stream: AsyncIterable<StreamChunk> = {
          [Symbol.asyncIterator]() {
            if (started) {
              throw new Error('Gemini stream can only be iterated once.');
            }
            started = true;
            const inner = iterateSseStream(reader);
            const iterator = inner[Symbol.asyncIterator]();
            return {
              async next() {
                const result = await iterator.next();
                if (!result.done && result.value) {
                  aggregated += result.value.text();
                  if (result.value.raw?.usageMetadata) {
                    lastUsage = result.value.raw.usageMetadata;
                  }
                }
                if (result.done) {
                  finalize();
                }
                return result;
              },
              async return(value?: unknown) {
                try { reader.cancel(); } catch { /* ignore */ }
                finalize();
                return { value, done: true } as IteratorReturnResult<unknown>;
              },
            };
          },
        };

        const responsePromise = new Promise<GenerateContentResult['response']>((resolve) => {
          if (iterationDone) {
            resolve({
              text: () => aggregated,
              usageMetadata: lastUsage,
              raw: {} as GeminiResponse,
            });
          } else {
            doneResolvers.push(resolve);
          }
        });

        return { stream, response: responsePromise };
      },
    };
  };

  const embedContent = async (
    request: EmbedContentRequest,
    signal?: AbortSignal
  ): Promise<EmbedContentResponse> => {
    const response = await callProxy(
      { action: 'embed', model: init.model, body: request, purpose: init.purpose },
      signal
    );
    await ensureOk(response, `${init.model}:embedContent`);
    const json = (await response.json()) as { embedding?: { values?: number[] } };
    if (!json?.embedding?.values) {
      throw new Error('Gemini proxy returned an embedding without values.');
    }
    return { embedding: { values: json.embedding.values } };
  };

  return {
    model: init.model,
    generateContent,
    startChat,
    embedContent,
  };
};

/**
 * Convenience helper for callers that previously hand-rolled a REST POST to
 * Gemini (PDF inline, audio transcription). Pass the full Gemini REST body
 * and receive the raw JSON response.
 */
export const generateContentRaw = async (
  modelId: string,
  body: GenerateContentRequest,
  signal?: AbortSignal,
  purpose?: string
): Promise<GeminiResponse> => {
  const response = await callProxy({ action: 'generate', model: modelId, body, purpose }, signal);
  await ensureOk(response, `${modelId}:generateContent (raw)`);
  return (await response.json()) as GeminiResponse;
};

export type {
  GeminiContent,
  GeminiResponse,
  GeminiPart,
  GenerateContentRequest,
  UsageMetadata,
};
