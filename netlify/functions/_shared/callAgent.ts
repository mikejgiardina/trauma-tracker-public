// netlify/functions/_shared/callAgent.ts
// The single chokepoint every live model call routes through. Future model /
// API changes land HERE, not in each function.
//
// - model: env-driven (ANTHROPIC_MODEL_EXTRACTOR || 'claude-sonnet-5') → migration is a
//   config change, not a code change.
// - Structured outputs (output_config.format json_schema) → the response's first
//   text block IS valid JSON. We JSON.parse directly; there is no extractJson /
//   fenced-regex / brace-scan parser anywhere anymore.
// - thinking: {type:'disabled'} explicitly. Sonnet 5 runs ADAPTIVE thinking when
//   `thinking` is omitted, and max_tokens caps thinking+output combined — so an
//   un-disabled call silently spends thinking tokens against the output budget.
//   'disabled' is valid on Sonnet 5.
// - retry with backoff on 429 / 5xx (2 retries). One consistent result shape.
//
// Raw REST (no SDK) — so schemas must stay in the structured-outputs supported
// subset: object/array/string/number/boolean/enum, additionalProperties:false,
// `required` on every object. No minLength/maximum/multipleOf/etc.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export type JsonSchema = Record<string, unknown>;

export interface CallAgentParams {
  system: string;
  user: string;
  schema: JsonSchema;
  maxTokens: number;
}

export type AgentResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

const RETRIES = 2; // total attempts = 1 + RETRIES

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callAgent<T = unknown>(params: CallAgentParams): Promise<AgentResult<T>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { ok: false, error: 'ANTHROPIC_API_KEY is not set — set it in the Netlify env (never the repo).', status: 500 };
  }

  const model = process.env.ANTHROPIC_MODEL_EXTRACTOR || 'claude-sonnet-5';
  const body = JSON.stringify({
    model,
    max_tokens: params.maxTokens,
    system: params.system,
    thinking: { type: 'disabled' },
    output_config: { format: { type: 'json_schema', schema: params.schema } },
    messages: [{ role: 'user', content: params.user }],
  });

  let lastError = 'unknown error';

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body,
      });
    } catch (e) {
      lastError = `network error calling Anthropic: ${(e as Error).message}`;
      if (attempt < RETRIES) await sleep(400 * 2 ** attempt);
      continue;
    }

    // Retryable: rate limit + server errors.
    if (resp.status === 429 || resp.status >= 500) {
      lastError = `Anthropic ${resp.status}: ${await resp.text()}`;
      if (attempt < RETRIES) await sleep(400 * 2 ** attempt);
      continue;
    }

    // Non-retryable client error.
    if (!resp.ok) {
      return { ok: false, error: `Anthropic ${resp.status}: ${await resp.text()}`, status: 502 };
    }

    const data = (await resp.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      stop_reason?: string;
    };

    if (data.stop_reason === 'refusal') {
      return { ok: false, error: 'model refused the request', status: 502 };
    }

    // With output_config.format, the first text block is guaranteed valid JSON.
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim();

    if (data.stop_reason === 'max_tokens') {
      return { ok: false, error: 'response truncated at max_tokens (raise maxTokens)', status: 502 };
    }

    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, error: `model did not return valid JSON: ${text.slice(0, 200)}`, status: 502 };
    }
  }

  return { ok: false, error: lastError, status: 502 };
}
