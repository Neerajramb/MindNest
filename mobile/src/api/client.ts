import { clearSession, getServerOverride, getSession, saveSession } from '@/auth/session';

/** Base URL: a server address saved on the sign-in screen wins over the build-time default. */
export function apiBaseUrl(): string {
  const url = getServerOverride() || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  return url.replace(/\/+$/, '');
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** First field-level validation message, for showing next to a form field. */
  fieldError(field: string): string | null {
    const value = this.details?.[field];
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    if (typeof value === 'string') return value;
    return null;
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK_ERROR';
  }
}

type Envelope<T> =
  | { success: true; data: T; meta?: Record<string, unknown> }
  | { success: false; error: { code: string; message: string; details?: Record<string, unknown> } };

type RequestOptions = { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number };

const DEFAULT_TIMEOUT_MS = 15_000;
let refreshInFlight: Promise<boolean> | null = null;

/** The parts of a fetch Response that `api()` reads, so uploads can come back from XMLHttpRequest. */
type RawResponse = Pick<Response, 'ok' | 'status' | 'json'>;

const networkError = () =>
  new ApiError("Can't reach MindNest. Check your connection and try again.", 0, 'NETWORK_ERROR');
const timeoutError = () =>
  new ApiError('MindNest is taking too long to answer. Please try again.', 0, 'TIMEOUT');

/**
 * Multipart uploads go through XMLHttpRequest: Expo's global fetch (expo/fetch) rejects React Native's
 * `{ uri, name, type }` file parts, while RN's native networking streams them straight from disk.
 */
function formRequest(method: string, url: string, form: FormData, headers: Record<string, string>, timeoutMs: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.timeout = timeoutMs;
    xhr.onload = () => {
      const text = xhr.responseText;
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(text),
      });
    };
    xhr.onerror = () => reject(networkError());
    xhr.ontimeout = () => reject(timeoutError());
    xhr.send(form);
  });
}

async function rawRequest(path: string, options: RequestOptions, token?: string): Promise<RawResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (isForm) return formRequest(options.method ?? 'POST', `${apiBaseUrl()}${path}`, options.body as FormData, headers, timeoutMs);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw controller.signal.aborted ? timeoutError() : networkError();
  } finally {
    clearTimeout(timer);
  }
}

/** Exchange the refresh token once, shared by every request that hit a 401 at the same time. */
async function refreshTokens(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;
  refreshInFlight ??= (async () => {
    try {
      const response = await rawRequest('/auth/refresh', { method: 'POST', body: { refresh: session.refresh } });
      if (!response.ok) {
        if (response.status === 401) await clearSession();
        return false;
      }
      const body = (await response.json()) as Envelope<{ access: string; refresh?: string }>;
      if (!body.success) return false;
      await saveSession({ ...session, access: body.data.access, refresh: body.data.refresh ?? session.refresh });
      return true;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const useAuth = options.auth ?? true;
  let response = await rawRequest(path, options, useAuth ? getSession()?.access : undefined);
  if (response.status === 401 && useAuth && (await refreshTokens())) {
    response = await rawRequest(path, options, getSession()?.access);
  }
  if (response.status === 204) return undefined as T;

  let body: Envelope<T> | null = null;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (!body) {
    throw new ApiError('The server sent an unexpected response.', response.status, 'BAD_RESPONSE');
  }
  if (!body.success) {
    throw new ApiError(body.error.message, response.status, body.error.code, body.error.details);
  }
  return body.data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
