export function getApiBaseUrl(): string {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!value) {
    throw new Error('Missing EXPO_PUBLIC_API_URL in environment.');
  }
  return value.replace(/\/+$/, '');
}

const REQUEST_TIMEOUT_MS = 15000;

function portFromApiBaseUrl(base: string): string {
  try {
    const u = new URL(base);
    return u.port || (u.protocol === 'https:' ? '443' : '80');
  } catch {
    return '';
  }
}

/** Maps RN fetch failures (timeouts, wrong IP, cleartext blocked) to an actionable message. */
export function describeFetchError(apiBaseUrl: string, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  const looksNetwork =
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('failed to connect') ||
    lower.includes('connection refused') ||
    lower.includes('unreachable') ||
    lower.includes('aborted');

  if (!looksNetwork) {
    return raw || 'Request failed';
  }

  const p = portFromApiBaseUrl(apiBaseUrl);
  const portHint = p ? `TCP ${p}` : 'that port';

  return [
    `Could not reach ${apiBaseUrl}.`,
    `Quick test: on the phone’s browser open ${apiBaseUrl}/health — if it doesn’t load, the app can’t either.`,
    `Run ability-api (npm run dev), same Wi‑Fi as the phone, firewall allows inbound ${portHint},`,
    `EXPO_PUBLIC_API_URL matches ipconfig IPv4 — run npm run start in ability-mobile after .env changes, then expo start -c.`,
    'Emulator: http://10.0.2.2:' + (p || 'PORT') + ' (same port as the API).',
  ].join(' ');
}

/** Read body once, parse JSON if possible; use for auth + error messages. */
export async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<{
  res: Response;
  data: Record<string, unknown> | null;
  rawText: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = init?.signal ?? controller.signal;
  try {
    const res = await fetch(url, { ...init, signal });
  const rawText = await res.text();
  let data: Record<string, unknown> | null = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      data = null;
    }
  }
  return { res, data, rawText };
  } finally {
    clearTimeout(timeout);
  }
}

/** Human-readable message when !res.ok (handles non-JSON, HTML, Express shapes). */
export function apiFailureMessage(
  res: Response,
  data: Record<string, unknown> | null,
  rawText: string,
  apiBaseUrl: string
): string {
  if (res.status === 503 && /tunnel unavailable/i.test(rawText)) {
    return [
      `API tunnel is unavailable at ${apiBaseUrl}.`,
      'Use LAN mode: run `npm run start:ios-safe` (or `npm run start:clear:lan`) in ability-mobile,',
      'make sure ability-api is running, then reload Expo Go.',
    ].join(' ');
  }
  if (data && typeof data === 'object') {
    const err = data.error;
    if (typeof err === 'string' && err.trim()) return err;
    const msg = data.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    const errors = data.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0];
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object' && 'message' in first) {
        const m = (first as { message?: unknown }).message;
        if (typeof m === 'string' && m.trim()) return m;
      }
    }
  }
  const t = rawText.trim();
  if (t.startsWith('<') || /<!DOCTYPE/i.test(t)) {
    if (res.status === 404) {
      return [
        `Got HTML 404 — nothing at ${apiBaseUrl} serves the Ability API (POST /api/auth/register).`,
        'Start ability-api (cd ability-api && npm run dev). PORT in ability-api/.env must match the port in EXPO_PUBLIC_API_URL.',
        'Another app on the same port (e.g. next dev on 3000) causes this — use next dev --port 3001 or run the API on a free port and set API_PORT in ability-mobile/.env.',
      ].join(' ');
    }
    return `Server returned HTML (${res.status}) — EXPO_PUBLIC_API_URL may point at a web app, not ability-api.`;
  }
  if (t.length > 0 && t.length < 500) {
    return `Error ${res.status}: ${t.slice(0, 280)}`;
  }
  return `Request failed (${res.status} ${res.statusText || ''}).`.trim();
}

export async function apiFetch(
  path: string,
  token: string,
  init?: RequestInit
): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = init?.signal ?? controller.signal;
  try {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}
