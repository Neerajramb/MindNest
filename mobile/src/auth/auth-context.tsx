import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '@/api/client';
import type { AuthPayload, User } from '@/api/types';
import { clearSession, getSession, loadSession, onSessionChange, saveSession } from '@/auth/session';
import { clearPersistedCache } from '@/lib/query-client';

type RegisterPatient = { link_code: string; username: string; password: string };
type RegisterCaregiver = { username: string; password: string; name: string; email?: string; phone?: string };

type AuthState = {
  hydrated: boolean;
  user: User | null;
  signIn: (username: string, password: string) => Promise<User>;
  registerPatient: (input: RegisterPatient) => Promise<User>;
  registerCaregiver: (input: RegisterCaregiver) => Promise<User>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    void loadSession().then((session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setHydrated(true);
    });
    const unsubscribe = onSessionChange((session) => setUser(session?.user ?? null));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const accept = useCallback(async (payload: AuthPayload) => {
    await saveSession({ access: payload.access, refresh: payload.refresh, user: payload.user });
    return payload.user;
  }, []);

  const signIn = useCallback(
    async (username: string, password: string) =>
      accept(await api<AuthPayload>('/auth/login', { method: 'POST', body: { username, password }, auth: false })),
    [accept],
  );

  const registerPatient = useCallback(
    async (input: RegisterPatient) =>
      accept(await api<AuthPayload>('/auth/register/patient', { method: 'POST', body: input, auth: false })),
    [accept],
  );

  const registerCaregiver = useCallback(
    async (input: RegisterCaregiver) =>
      accept(await api<AuthPayload>('/auth/register/caregiver', { method: 'POST', body: input, auth: false })),
    [accept],
  );

  const signOut = useCallback(async () => {
    const session = getSession();
    if (session) {
      // Best effort: revoke the refresh token on the server; sign out locally regardless.
      await api('/auth/logout', { method: 'POST', body: { refresh: session.refresh } }).catch(() => undefined);
    }
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
    client.clear();
    await clearPersistedCache();
    await clearSession();
  }, [client]);

  const value = useMemo(
    () => ({ hydrated, user, signIn, registerPatient, registerCaregiver, signOut }),
    [hydrated, user, signIn, registerPatient, registerCaregiver, signOut],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
