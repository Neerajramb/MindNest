import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { ApiError, api } from '@/api/client';
import * as session from '@/auth/session';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

const user = { id: 'u1', username: 'thomas', name: 'Thomas', email: '', phone: '', role: 'PATIENT', patient_id: 'p1', caregiver_id: null } as const;

function reply(status: number, body?: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
}

const fetchMock = jest.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(async () => {
  global.fetch = fetchMock as typeof fetch;
  fetchMock.mockReset();
  await session.saveSession({ access: 'old-access', refresh: 'refresh-1', user: { ...user } });
});

afterEach(async () => {
  await session.clearSession();
});

describe('api client', () => {
  test('unwraps the success envelope and sends the bearer token', async () => {
    fetchMock.mockReturnValueOnce(reply(200, { success: true, data: { status: 'ok' }, meta: {} }));
    await expect(api('/health')).resolves.toEqual({ status: 'ok' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer old-access');
  });

  test('turns an error envelope into ApiError with field details', async () => {
    fetchMock.mockReturnValueOnce(
      reply(400, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid', details: { name: ['Required.'] } } }),
    );
    const error = (await api('/x', { method: 'POST', body: {} }).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fieldError('name')).toBe('Required.');
  });

  test('refreshes once on 401 and retries with the new token', async () => {
    fetchMock
      .mockReturnValueOnce(reply(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'expired' } }))
      .mockReturnValueOnce(reply(200, { success: true, data: { access: 'new-access', refresh: 'refresh-2' } }))
      .mockReturnValueOnce(reply(200, { success: true, data: [1, 2] }));
    await expect(api('/patients/me')).resolves.toEqual([1, 2]);
    const retry = fetchMock.mock.calls[2][1] as RequestInit;
    expect((retry.headers as Record<string, string>).Authorization).toBe('Bearer new-access');
    expect(session.getSession()?.refresh).toBe('refresh-2');
  });

  test('signs out when the refresh token is rejected', async () => {
    fetchMock
      .mockReturnValueOnce(reply(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'expired' } }))
      .mockReturnValueOnce(reply(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'bad refresh' } }));
    await expect(api('/patients/me')).rejects.toBeInstanceOf(ApiError);
    expect(session.getSession()).toBeNull();
  });

  test('reports network failures as NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const error = (await api('/health').catch((e: unknown) => e)) as ApiError;
    expect(error.isNetwork).toBe(true);
  });

  test('sends multipart uploads through XMLHttpRequest, not fetch', async () => {
    const sent: { method?: string; url?: string; headers: Record<string, string>; body?: unknown } = { headers: {} };
    class FakeXHR {
      status = 0;
      responseText = '';
      timeout = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      open(method: string, url: string) {
        sent.method = method;
        sent.url = url;
      }
      setRequestHeader(key: string, value: string) {
        sent.headers[key] = value;
      }
      send(body: unknown) {
        sent.body = body;
        this.status = 201;
        this.responseText = JSON.stringify({ success: true, data: { found: ['keys'] } });
        this.onload?.();
      }
    }
    const original = global.XMLHttpRequest;
    global.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
    try {
      const form = new FormData();
      form.append('image', { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
      await expect(api('/patients/p1/objects/scan', { method: 'POST', body: form })).resolves.toEqual({ found: ['keys'] });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(sent.method).toBe('POST');
      expect(sent.url).toMatch(/\/patients\/p1\/objects\/scan$/);
      expect(sent.headers.Authorization).toBe('Bearer old-access');
      expect(sent.headers['Content-Type']).toBeUndefined();
      expect(sent.body).toBe(form);
    } finally {
      global.XMLHttpRequest = original;
    }
  });
});
