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

async function rawRequest(path: string, options: RequestOptions, token?: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body:
        options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("Can't reach MindNest. Check your connection and try again.", 0, 'NETWORK_ERROR');
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
