import * as SecureStore from 'expo-secure-store';

import type { User } from '@/api/types';

/**
 * Tokens live only in the platform keystore (expo-secure-store), never in AsyncStorage.
 * An in-memory copy avoids hitting the keystore on every request.
 */
const KEYS = { access: 'mn.access', refresh: 'mn.refresh', user: 'mn.user', server: 'mn.server' } as const;

export type Session = { access: string; refresh: string; user: User };

let current: Session | null = null;
let serverOverride: string | null = null;
const listeners = new Set<(session: Session | null) => void>();

export async function loadSession(): Promise<Session | null> {
  const [access, refresh, user, server] = await Promise.all([
    SecureStore.getItemAsync(KEYS.access),
    SecureStore.getItemAsync(KEYS.refresh),
    SecureStore.getItemAsync(KEYS.user),
    SecureStore.getItemAsync(KEYS.server),
  ]);
  serverOverride = server;
  current = access && refresh && user ? { access, refresh, user: JSON.parse(user) as User } : null;
  return current;
}

export function getSession(): Session | null {
  return current;
}

export async function saveSession(session: Session): Promise<void> {
  current = session;
  await Promise.all([
    SecureStore.setItemAsync(KEYS.access, session.access),
    SecureStore.setItemAsync(KEYS.refresh, session.refresh),
    SecureStore.setItemAsync(KEYS.user, JSON.stringify(session.user)),
  ]);
  listeners.forEach((listener) => listener(session));
}

export async function clearSession(): Promise<void> {
  current = null;
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.access),
    SecureStore.deleteItemAsync(KEYS.refresh),
    SecureStore.deleteItemAsync(KEYS.user),
  ]);
  listeners.forEach((listener) => listener(null));
}

export function onSessionChange(listener: (session: Session | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getServerOverride(): string | null {
  return serverOverride;
}

export async function setServerOverride(url: string | null): Promise<void> {
  serverOverride = url;
  if (url) await SecureStore.setItemAsync(KEYS.server, url);
  else await SecureStore.deleteItemAsync(KEYS.server);
}
